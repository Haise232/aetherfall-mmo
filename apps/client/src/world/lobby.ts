import * as THREE from "three";
import { buildFountain } from "./fountain";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  AVENUE_W, BUILDINGS, DISTRICTS, districtAt, interiorFrame, interiorH, isEnterable, CARTS, CASTLE_RECT, CITY_NAME, CITY_R, EXTRA_BUILDINGS, FIELDS, FOUNTAIN, GARDENS, GATE_ANGLES, GATE_HALF_WIDTH,
  GATE_NAMES, GATE_TOWERS, GREAT_HALL, GODDESS_STATUE, LAKE, LAMPS, PLAZA_R, ROAD_W, ROCKS, STALLS, STALL_KINDS, TREES, WALL_SEGMENTS, WALL_TOWERS, WINDMILLS, WORLD_HALF,
} from "@mmorpg/shared";
import { RY, cathedral, gatehouse, guildBanners, house, onFace, tower, type Ctx } from "./buildings";
import { castle, goddessFountain } from "./castle";
import type { SkyLights } from "./sky";
import { stall } from "./stalls";
import {
  DOOR, Merge, STONE, STONE_D, STONE_L, TIMBER, WARM, WOOD, archGeo, bannerGeo, hash2, pennantGeo, noiseTexture, rng, setWindowGlow, std, textSprite,
} from "./kit";

/** Geometría con color por vértice, desde una lista de piezas (para instanciar). */
type Part = [THREE.BufferGeometry, number, number?, number?, number?, number?];
function colorParts(parts: Part[], ao = false) {
  const out = parts.map(([g, hex, x = 0, y = 0, z = 0, ry = 0]) => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute("uv");
    const c = new THREE.Color(hex), n = ng.attributes.position!.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = ao ? 0.72 + 0.28 * Math.min(1, Math.max(0, ng.attributes.position!.getY(i) / 2.6)) : 1;
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    ng.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return ng;
  });
  return mergeGeometries(out)!;
}
const vcMat = (extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, ...extra });

// ---------- mapa ----------
export interface Lobby {
  ground: THREE.Mesh;
  /** Luces que mueve el ciclo de día y noche. */
  lights: SkyLights;
  /** `lightDir`: dirección hacia el sol (o la luna) que da las sombras. */
  update(dt: number, t: number, focus: THREE.Vector3, lightDir?: THREE.Vector3): void;
}

export function buildLobby(scene: THREE.Scene): Lobby {
  const r = rng(7);
  const root = new THREE.Group(); scene.add(root);
  const labels = new THREE.Group(); root.add(labels);
  const dummy = new THREE.Object3D();
  const ctx: Ctx = { chimneys: [] };

  // --- Luz (el cielo y el ciclo de día y noche están en sky.ts) ---
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6a44, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; const SH = 44; sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  const SUN_OFFSET = new THREE.Vector3(40, 90, 26), SUN_DIST = SUN_OFFSET.length();

  // --- Suelo ---
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x33552c, roughness: 1 })); // más allá del límite: suelo de bosque
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; root.add(outer);

  const SEG = 100, EDGE = WORLD_HALF * 2 + 8, gg = new THREE.PlaneGeometry(EDGE, EDGE, SEG, SEG);
  gg.rotateX(-Math.PI / 2);
  const pos = gg.attributes.position!, colors = new Float32Array(pos.count * 3), tmp = new THREE.Color();
  const meadow = new THREE.Color(0x5d8a43), forest = new THREE.Color(0x3a6431), sand = new THREE.Color(0x9a8a5c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), rad = Math.hypot(x, z);
    const n = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.4 + z * 0.31) * 0.3 + (r() - 0.5) * 0.3;
    tmp.copy(meadow).lerp(forest, THREE.MathUtils.smoothstep(rad, CITY_R + 15, CITY_R + 60));
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 4) tmp.lerp(sand, THREE.MathUtils.smoothstep(LAKE.r + 4 - ld, 0, 4));
    tmp.multiplyScalar(0.9 + n * 0.16);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  gg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; root.add(ground);

  // suelo adoquinado de la ciudad, avenidas y plaza
  // Capas de pavimento casi coplanares: además de la altura, un desplazamiento de profundidad por capa evita que parpadeen a lo lejos.
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => { const m = new THREE.Mesh(geo, mat); mat.polygonOffset = true; mat.polygonOffsetFactor = mat.polygonOffsetUnits = -Math.round(y * 100); m.renderOrder = y; m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; root.add(m); return m; };
  flat(new THREE.CircleGeometry(CITY_R + 1, 96), new THREE.MeshStandardMaterial({ map: noiseTexture(0x8c877b, 0.3, { cell: 4, repeat: 38, seed: 11 }), roughness: 1 }), 0.015);
  const avenue = new THREE.MeshStandardMaterial({ map: noiseTexture(0xa59e8f, 0.2, { lines: 8, repeat: 1, seed: 21 }), roughness: 0.95 });
  const av = (len: number, w: number, x: number, z: number, ry: number, y: number) => {
    const m = flat(new THREE.PlaneGeometry(len, w), avenue.clone(), y); m.position.set(x, y, z); m.rotation.z = ry;
    const map = (m.material as THREE.MeshStandardMaterial).map!.clone(); map.needsUpdate = true; map.repeat.set(len / 6, w / 6); (m.material as THREE.MeshStandardMaterial).map = map;
  };
  av(CITY_R * 2, AVENUE_W, 0, 0, 0, 0.03); // este-oeste
  av(CITY_R + 44, AVENUE_W, 0, (CITY_R - 44) / 2, Math.PI / 2, 0.032); // norte-sur hasta el castillo
  const plazaMat = new THREE.MeshStandardMaterial({ map: noiseTexture(0xb2aa99, 0.2, { lines: 8, repeat: 8, seed: 31 }), roughness: 0.95 });
  flat(new THREE.CircleGeometry(PLAZA_R, 64), plazaMat, 0.04);
  flat(new THREE.RingGeometry(PLAZA_R, PLAZA_R + 0.7, 64), std(0x8a8578), 0.045);
  flat(new THREE.RingGeometry(PLAZA_R * 0.45, PLAZA_R * 0.45 + 0.35, 48), std(0x8a8578), 0.046);
  flat(new THREE.RingGeometry(PLAZA_R - 2.6, PLAZA_R - 2.3, 48), std(0x8a8578), 0.046);
  // caminos de tierra fuera de las puertas
  const dirt = new THREE.MeshStandardMaterial({ map: noiseTexture(0x8a6e4b, 0.28, { cell: 6, repeat: 1, seed: 41 }), roughness: 1 });
  for (const a of GATE_ANGLES) {
    const len = WORLD_HALF + 6 - CITY_R, mid = CITY_R + len / 2;
    const m = flat(new THREE.PlaneGeometry(len, ROAD_W), dirt, 0.02); m.rotation.set(-Math.PI / 2, 0, 0); m.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -a);
    m.position.set(Math.cos(a) * mid, 0.02, Math.sin(a) * mid);
  }
  // patio del castillo + camino central de losas hacia el gran salón
  const cw = CASTLE_RECT.x1 - CASTLE_RECT.x0, cd = CASTLE_RECT.z1 - CASTLE_RECT.z0;
  const court = flat(new THREE.PlaneGeometry(cw, cd), new THREE.MeshStandardMaterial({ map: noiseTexture(0x978f80, 0.22, { lines: 8, repeat: 1, seed: 51 }), roughness: 0.95 }), 0.05);
  court.position.x = 0; court.position.z = (CASTLE_RECT.z0 + CASTLE_RECT.z1) / 2;
  (court.material as THREE.MeshStandardMaterial).map!.repeat.set(cw / 6, cd / 6);
  const pathMat = new THREE.MeshStandardMaterial({ map: noiseTexture(0xbfb7a4, 0.16, { lines: 4, repeat: 1, seed: 52 }), roughness: 0.9 });
  const path = flat(new THREE.PlaneGeometry(8.4, 30), pathMat, 0.065); path.position.set(0, 0.065, CASTLE_RECT.z1 - 15); (path.material as THREE.MeshStandardMaterial).map!.repeat.set(2, 8);

  // --- Geometría fusionada ---
  const M = new Merge();

  // muralla de la ciudad: tramo completo instanciado (zócalo, cornisa, almenas, saetera) + contrafuertes
  const segGeo = colorParts([
    [new THREE.BoxGeometry(4.4, 7, 3), STONE, 0, 3.5, 0], [new THREE.BoxGeometry(4.5, 1.1, 3.7), STONE_D, 0, 0.55, 0],
    [new THREE.BoxGeometry(4.5, 0.5, 3.7), STONE_D, 0, 7.15, 0],
    [new THREE.BoxGeometry(1.5, 1.4, 0.8), STONE_L, -1.1, 8.1, 1.2], [new THREE.BoxGeometry(1.5, 1.4, 0.8), STONE_L, 1.1, 8.1, 1.2],
    [new THREE.BoxGeometry(1.5, 1.4, 0.8), STONE_L, -1.1, 8.1, -1.2], [new THREE.BoxGeometry(1.5, 1.4, 0.8), STONE_L, 1.1, 8.1, -1.2],
    [new THREE.BoxGeometry(0.26, 1.6, 0.1), 0x1a1612, 0, 4.7, -1.53],
  ], true);
  const buttGeo = colorParts([[new THREE.BoxGeometry(1.0, 6.2, 0.9), STONE_D, 0, 3.7, -1.9], [new THREE.BoxGeometry(1.2, 0.4, 1.1), STONE_L, 0, 6.9, -1.9]], true);
  const wallMesh = new THREE.InstancedMesh(segGeo, vcMat(), WALL_SEGMENTS.length);
  const buttIdx = WALL_SEGMENTS.map((_, i) => i).filter(i => i % 3 === 1);
  const buttMesh = new THREE.InstancedMesh(buttGeo, vcMat(), buttIdx.length);
  const ic = new THREE.Color();
  WALL_SEGMENTS.forEach((s, i) => {
    dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, -s.a, 0); dummy.updateMatrix(); wallMesh.setMatrixAt(i, dummy.matrix);
    wallMesh.setColorAt(i, ic.setScalar(0.92 + hash2(s.x, s.z) * 0.14));
  });
  buttIdx.forEach((i, k) => { const s = WALL_SEGMENTS[i]!; dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, -s.a, 0); dummy.updateMatrix(); buttMesh.setMatrixAt(k, dummy.matrix); });
  for (const mm of [wallMesh, buttMesh]) { mm.castShadow = true; mm.receiveShadow = true; mm.computeBoundingSphere(); root.add(mm); }
  [...WALL_TOWERS, ...GATE_TOWERS].forEach(t => tower(M, t, false));
  GATE_ANGLES.forEach((a, i) => {
    const cx = Math.cos(a) * CITY_R, cz = Math.sin(a) * CITY_R;
    gatehouse(M, cx, cz, Math.cos(a), Math.sin(a), { width: (GATE_HALF_WIDTH + 3.5 - 5) * 2 + 1.4, height: 14, depth: 5.4, hole: 10.4, holeH: 8.4 });
    const lab = textSprite(GATE_NAMES[i]!, "#cfe8ff", 1.1); lab.position.set(cx, 22, cz); labels.add(lab);
  });
  castle(M, labels, ctx);
  // estatua de la diosa en la cabecera de la catedral
  const goddess = goddessFountain(GODDESS_STATUE.x, GODDESS_STATUE.z, { scale: 0.8, figure: 1.9 });
  root.add(goddess.group);
  { const l = textSprite("Estatua de la Diosa", "#f5d76a", 0.8); l.position.set(GODDESS_STATUE.x, 7.4, GODDESS_STATUE.z + 1); labels.add(l); }

  // catedral y edificios
  for (const b of BUILDINGS) {
    if (b.kind === "cathedral") {
      const { top } = cathedral(M, b); const l = textSprite(b.name, "#ffe9b0", 1.2); l.position.set(b.x, top + 4, b.z); labels.add(l);
      // luz cálida de las lámparas de corona (nave y crucero)
      for (const [dz, y] of [[6.6, 7.6], [-3, 8.2]] as const) { const pl = new THREE.PointLight(0xffd9a0, 26, 22, 2); pl.position.set(b.x, y, b.z + dz); root.add(pl); }
      continue;
    }
    const glow = b.kind === "forge" ? 0xff8a3a : WARM;
    const { roofY, rh } = house(M, b, ctx, { glow });
    const fd = (b.facing % 2 === 0 ? b.d : b.w) / 2;
    if (b.kind === "tavern") { // letrero colgante, barriles y farol
      const p = onFace(b.x, b.z, b.facing, b.w / 2 - 1, fd + 1.4);
      M.box("solid", 0.15, 3.2, 0.15, p.x, 3.5, p.z, TIMBER); M.box("solid", 1.6, 1.1, 0.12, p.x, 4.6, p.z, 0x7a2f3a, RY[b.facing]!);
      M.box("solid", 1.8, 0.14, 0.14, p.x, 5.2, p.z, TIMBER, RY[b.facing]!);
      for (const o of [-2, 2]) { const q = onFace(b.x, b.z, b.facing, o, fd + 0.8); M.cyl("solid", 0.45, 0.45, 0.9, 8, q.x, 0, q.z, 0x7a5a38); }
    }
    if (b.kind === "forge") {
      const p = onFace(b.x, b.z, b.facing, -b.w / 2 + 1, fd + 1.4);
      M.box("solid", 0.8, 0.55, 0.45, p.x, 0.6, p.z, 0x3b3f46); M.box("solid", 0.55, 0.45, 0.55, p.x, 0.22, p.z, 0x55504a);
      M.box("glow", 0.5, 0.2, 0.3, p.x + 0.0, 0.92, p.z, 0xff8a3a);
    }
    if (b.kind === "bank") for (const s of [-1, 1]) { const p = onFace(b.x, b.z, b.facing, s * (b.w / 2 - 1), fd + 0.7); M.box("solid", 0.7, b.h, 0.7, p.x, b.h / 2 + 0.5, p.z, 0xe2ddd0); M.box("solid", 1.0, 0.3, 1.0, p.x, b.h + 0.6, p.z, 0xcfc8b6); }
    if (b.kind === "guild") guildBanners(M, b);
    if (b.kind === "market") { // casa de subastas: toldos a rayas colgados de la fachada y cartel
      // Los toldos salen del muro (sin postes ni mostradores): la plaza de delante queda despejada para el subastador y su mostrador.
      const fc = onFace(b.x, b.z, b.facing, 0, fd), TH = 0.38, ZB = 0.2, ZF = 1.7, YB = 3.3, YF = 2.7;
      const loc = (geo: THREE.BufferGeometry, color: number, along: number, y: number, out: number, rx = 0) => {
        if (rx) geo.rotateX(rx); geo.translate(along, y, out); M.put("solid", geo, color, fc.x, 0, fc.z, RY[b.facing]!);
      };
      const len = Math.hypot(ZF - ZB, YB - YF) + 0.1, mid = [(ZF + ZB) / 2, (YB + YF) / 2 + 0.03] as const;
      for (let k = -1; k <= 1; k++) {
        const col = [0xc0392b, 0x7a2f3a, 0x2e86c1][k + 1]!, along = k * 4.6, N = 5, SW = 3.9 / N;
        for (let i = 0; i < N; i++) {
          const main = i % 2 === 0, x = along - 1.95 + SW * (i + 0.5);
          loc(new THREE.BoxGeometry(SW, 0.06, len), main ? col : 0xf2ead8, x, mid[1], mid[0], TH);
          loc(new THREE.BoxGeometry(SW, 0.22, 0.05), main ? 0xf2ead8 : col, x, YF - 0.12, ZF + 0.03);
        }
        for (const s of [-1.9, 1.9]) loc(new THREE.BoxGeometry(0.06, 0.06, len + 0.05), TIMBER, along + s, mid[1] - 0.06, mid[0], TH); // viguetas laterales
        for (const s of [-1.5, 0, 1.5]) loc(new THREE.BoxGeometry(0.04, 0.04, 1.3), 0x2b2b2e, along + s, YB - 0.62, ZB + 0.65, 0.6); // tirantes de hierro hacia el muro
      }
      // cartel "Casa de subastas": tabla de madera sobre la puerta, con el texto en una losa de lienzo
      const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 200;
      const cg = cv.getContext("2d")!;
      cg.fillStyle = "#3d2a18"; cg.fillRect(0, 0, 1024, 200); cg.strokeStyle = "#d9b13b"; cg.lineWidth = 7; cg.strokeRect(10, 10, 1004, 180);
      cg.fillStyle = "#f5d76a"; cg.font = "bold 92px Georgia, serif"; cg.textAlign = "center"; cg.textBaseline = "middle"; cg.fillText("Casa de subastas", 512, 106);
      const ctex = new THREE.CanvasTexture(cv); ctex.colorSpace = THREE.SRGBColorSpace; ctex.anisotropy = 8;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.66), new THREE.MeshStandardMaterial({ map: ctex, emissive: 0xffffff, emissiveMap: ctex, emissiveIntensity: 0.35, roughness: 0.9 }));
      const sp = onFace(b.x, b.z, b.facing, 0, fd + 0.3 + 0.07);
      sign.position.set(sp.x, 4.75, sp.z); sign.rotation.y = RY[b.facing]!; root.add(sign);
      const bp = onFace(b.x, b.z, b.facing, 0, fd + 0.3);
      M.box("solid", 3.6, 0.82, 0.1, bp.x, 4.75, bp.z, TIMBER, RY[b.facing]!);
    }
    if (b.name) { const l = textSprite(b.name, "#ffe9b0", 0.9); l.position.set(b.x, roofY + rh + 3.2, b.z); labels.add(l); }
  }
  for (const b of EXTRA_BUILDINGS) house(M, b, ctx);

  // --- jardines urbanos ---
  const green = 0x5fa043;
  GARDENS.forEach((g, gi) => {
    M.at(g.x, g.z);
    M.box("solid", g.w, 0.1, g.d, g.x, 0.06, g.z, green);
    const t = 0.5, HC = 0x2f6b34;
    for (const s of [-1, 1]) { M.box("solid", g.w, 0.8, t, g.x, 0.4, g.z + s * (g.d / 2 - t / 2), HC); M.box("solid", t, 0.8, g.d - 2 * t, g.x + s * (g.w / 2 - t / 2), 0.4, g.z, HC); }
    M.box("solid", g.w - 1.4, 0.06, 1.0, g.x, 0.12, g.z, 0xcbbf9e); // senda
    if (g.well) {
      M.cyl("solid", 0.95, 1.05, 1.0, 10, g.x, 0.1, g.z, STONE_D); M.cyl("solid", 0.75, 0.75, 0.15, 10, g.x, 1.0, g.z, 0x2f6fa0);
      for (const s of [-1, 1]) M.box("solid", 0.14, 2.0, 0.14, g.x + s * 0.85, 1.9, g.z, WOOD);
      M.prism(1.8, 1.8, 0.9, 0.4, g.x, 2.9, g.z, 0x7a4a2e, true, 0.4);
    } else {
      for (const s of [-1, 1]) { M.cyl("solid", 0.2, 0.3, 1.9, 6, g.x + s * g.w * 0.28, 0.1, g.z + s * g.d * 0.12, 0x6a4a2c); M.put("solid", new THREE.IcosahedronGeometry(1.35, 1), s > 0 ? 0x4f9442 : 0x5aa24a, g.x + s * g.w * 0.28, 2.9, g.z + s * g.d * 0.12); }
    }
    for (let k = 0; k < 6; k++) M.box("solid", 0.3, 0.3, 0.3, g.x - g.w / 2 + 1 + hash2(gi, k) * (g.w - 2), 0.25, g.z - g.d / 2 + 1 + hash2(k, gi) * (g.d - 2), [0xd9534f, 0xf2c14e, 0xe8a0b4, 0xb48ae0][k % 4]!);
  });
  // --- carros ---
  CARTS.forEach((c, ci) => {
    M.at(c.x, c.z); const ry = c.along === "x" ? 0 : Math.PI / 2, col = [0x8a6a45, 0x6b4a2b, 0x7a5a38][ci % 3]!;
    const ax = c.along === "x" ? 1 : 0, az = 1 - ax;
    M.box("solid", 2.4, 0.18, 1.2, c.x, 0.75, c.z, col, ry);
    for (const s of [-1, 1]) { M.box("solid", 2.4, 0.5, 0.1, c.x + az * s * 0.55, 1.05, c.z + ax * s * 0.55, col, ry); }
    for (const s of [-1, 1]) {
      const wx = c.x + ax * 0.0 + az * s * 0.72, wz = c.z + az * 0.0 + ax * s * 0.72;
      const wh = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10); wh.rotateX(Math.PI / 2); M.put("solid", wh, 0x4a3320, wz * 0 + wx, 0.5, wz, ry);
    }
    M.box("solid", 1.8, 0.14, 0.14, c.x - ax * 2.0, 0.7, c.z - az * 2.0, WOOD, ry); // vara
    if (ci % 2) M.put("solid", new THREE.IcosahedronGeometry(0.62, 0), 0xc9a84a, c.x, 1.3, c.z, 0, 0, 0, 1.4, 0.8, 0.9);
    else for (let k = -1; k <= 1; k += 2) M.cyl("solid", 0.3, 0.3, 0.6, 8, c.x + ax * k * 0.6, 0.85, c.z + az * k * 0.6, 0x7a5a38);
  });
  // barriles y cajas junto a las casas
  const barrels: { x: number; z: number }[] = [], crates: { x: number; z: number; ry: number }[] = [];
  BUILDINGS.forEach((b, i) => {
    if (b.kind !== "house" || i % 2) return;
    const dir = (b.facing + 1) % 4, p = onFace(b.x, b.z, dir, (r() - 0.5) * 3, (dir % 2 === 0 ? b.d : b.w) / 2 + 0.8);
    const free = !STALLS.some(s => s.house === b.id && s.dir === dir); // esa pared la ocupa un puesto
    if (r() < 0.55) { if (free) barrels.push(p); } else { const ry = r() * 3; if (free) crates.push({ ...p, ry }); }
  });

  // --- Puentes/muelle del lago y cabaña ---
  const pierX0 = LAKE.x + LAKE.r + 3.5, pierZ = LAKE.z + 2;
  M.at(pierX0, pierZ);
  for (let k = 0; k < 17; k++) M.box("solid", 0.55, 0.14, 2.6, pierX0 - k * 0.62, 0.55, pierZ, k % 2 ? 0x7a5a38 : 0x8a6a45);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) M.box("solid", 0.2, 1.4, 0.2, pierX0 - k * 2.0, 0.2, pierZ + s * 1.3, WOOD);
  M.cyl("solid", 0.3, 0.3, 1.0, 8, pierX0 - 5.5, 0.55, pierZ + 0.8, 0x7a5a38); M.cyl("solid", 0.3, 0.3, 1.0, 8, pierX0 - 4.8, 0.55, pierZ - 0.6, 0x7a5a38);
  M.box("solid", 0.12, 2.4, 0.12, pierX0 - 9.5, 1.7, pierZ + 1.3, TIMBER); M.box("glow", 0.35, 0.4, 0.35, pierX0 - 9.5, 3.1, pierZ + 1.3, 0xffd48a);
  // --- Puestos de mercaderes (ver stalls.ts) ---
  const stallLabels = STALLS.map(s => {
    stall(M, s);
    const l = textSprite(STALL_KINDS[s.kind]!.name, "#fff3d0", 0.5); l.position.set(s.x, 4.3, s.z); l.visible = false; labels.add(l);
    return l;
  });
  M.build(root);
  const props = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; z: number; ry?: number }[]) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.ry ?? 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
  };
  props(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), std(0x7a5a38), barrels.map(p => ({ x: p.x, y: 0.45, z: p.z })));
  props(new THREE.BoxGeometry(0.9, 0.8, 0.9), std(0x8a6a45), crates.map(p => ({ x: p.x, y: 0.4, z: p.z, ry: p.ry })));

  // --- Fuente monumental de la plaza (ver fountain.ts) ---
  const fountain = buildFountain(FOUNTAIN.r); fountain.group.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
  root.add(fountain.group);

  // --- Farolas (instanciadas) + luces dinámicas que siguen al jugador ---
  const lampGeo = colorParts([
    [new THREE.BoxGeometry(0.34, 0.3, 0.34), 0x2b2b2e, 0, 0.15, 0], [new THREE.BoxGeometry(0.16, 3.2, 0.16), 0x2b2b2e, 0, 1.7, 0],
    [new THREE.BoxGeometry(0.62, 0.12, 0.62), 0x2b2b2e, 0, 3.32, 0], [new THREE.ConeGeometry(0.42, 0.5, 4), 0x2b2b2e, 0, 3.9, 0, Math.PI / 4],
  ]);
  const lampPost = new THREE.InstancedMesh(lampGeo, vcMat(), LAMPS.length);
  const lampGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), new THREE.MeshBasicMaterial({ color: 0xffd48a }), LAMPS.length);
  LAMPS.forEach((l, i) => {
    dummy.rotation.set(0, 0, 0); dummy.position.set(l.x, 0, l.z); dummy.updateMatrix(); lampPost.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 3.62, l.z); dummy.updateMatrix(); lampGlow.setMatrixAt(i, dummy.matrix);
  });
  lampPost.castShadow = true; for (const m of [lampPost, lampGlow]) { m.computeBoundingSphere(); root.add(m); }
  // banderín del color del barrio en cada farola (instanciado; el color de instancia tiñe el paño)
  const pennant = new THREE.InstancedMesh(colorParts([[pennantGeo(0.7, 0.4), 0xffffff, 0.09, 2.78, 0]]), vcMat({ side: THREE.DoubleSide }), LAMPS.length);
  LAMPS.forEach((l, i) => {
    dummy.position.set(l.x, 0, l.z); dummy.rotation.set(0, hash2(l.x, l.z) * Math.PI * 2, 0); dummy.updateMatrix(); pennant.setMatrixAt(i, dummy.matrix);
    pennant.setColorAt(i, new THREE.Color(DISTRICTS[districtAt(l.x, l.z)].color));
  });
  pennant.castShadow = true; pennant.computeBoundingSphere(); root.add(pennant);
  // Luz cálida dentro de los interiores (Gremio y talleres): dos luces que siguen al interior más cercano.
  const roomLights = BUILDINGS.filter(isEnterable).map(b => { const f = interiorFrame(b); return { ...f.at(0, f.depth * 0.55), y: interiorH(b) - 1.1, big: b.kind === "guild" }; });
  for (const dx of [-9, 9]) roomLights.push({ x: GREAT_HALL.x + dx, z: GREAT_HALL.z, y: 9, big: true }); // salón del trono
  const roomPool = [0, 1].map(() => { const pl = new THREE.PointLight(0xffc98a, 0, 14, 1.6); pl.position.set(0, -50, 0); scene.add(pl); return pl; });
  const lightPool: THREE.PointLight[] = [];
  for (let i = 0; i < 8; i++) { const pl = new THREE.PointLight(0xffb866, 30, 17, 2); pl.position.set(0, -50, 0); scene.add(pl); lightPool.push(pl); }
  let lightClock = 0;

  // --- Bosque y rocas (instanciados por trozos para poder descartarlos fuera de pantalla) ---
  const colored = (g: THREE.BufferGeometry, hex: number, x = 0, y = 0, z = 0) => {
    g.translate(x, y, z); const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute("uv");
    const c = new THREE.Color(hex), n = ng.attributes.position!.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    ng.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return ng;
  };
  const pine = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6), 0x5b3d24, 0, 0.7, 0), colored(new THREE.ConeGeometry(1.35, 2.0, 7), 0x2f6a3a, 0, 2.1, 0),
    colored(new THREE.ConeGeometry(1.05, 1.8, 7), 0x347a40, 0, 3.1, 0), colored(new THREE.ConeGeometry(0.7, 1.5, 7), 0x3b8a47, 0, 4.0, 0),
  ])!;
  const round = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.22, 0.34, 1.9, 6), 0x6a4a2c, 0, 0.95, 0), colored(new THREE.IcosahedronGeometry(1.3, 1), 0x4f9442, 0, 2.7, 0),
    colored(new THREE.IcosahedronGeometry(0.95, 1), 0x5aa24a, 0.7, 2.2, 0.3), colored(new THREE.IcosahedronGeometry(0.85, 1), 0x469038, -0.6, 3.2, -0.2),
  ])!;
  const leaf = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const chunked = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y?: number; z: number; s: number; sy?: number; ry: number; color: number }[], cell = 70) => {
    const bins = new Map<string, typeof items>();
    for (const it of items) { const k = Math.floor(it.x / cell) + "," + Math.floor(it.z / cell); const a = bins.get(k); if (a) a.push(it); else bins.set(k, [it]); }
    const col = new THREE.Color();
    for (const list of bins.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { dummy.position.set(it.x, it.y ?? 0, it.z); dummy.rotation.set(0, it.ry, 0); dummy.scale.set(it.s, it.sy ?? it.s, it.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.setHex(it.color)); });
      dummy.scale.set(1, 1, 1);
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    }
  };
  const tint = () => new THREE.Color().setHSL(0.27 + (r() - 0.5) * 0.05, 0.1, 0.78 + r() * 0.3).getHex();
  for (const [geo, kind] of [[pine, 0], [round, 1]] as const) chunked(geo, leaf, TREES.filter(t => t.kind === kind).map(t => ({ x: t.x, z: t.z, s: t.s, ry: r() * 6.28, color: tint() })));
  frontier(chunked, pine, round, leaf, tint, root);
  chunked(new THREE.IcosahedronGeometry(0.8, 0), std(0xffffff), ROCKS.map(p => ({ x: p.x, y: 0.15, z: p.z, s: p.s, sy: p.s * 0.65, ry: r() * 6.28, color: new THREE.Color().setHSL(0.6, 0.04, 0.45 + r() * 0.25).getHex() })));

  // --- Hierba y flores alrededor ---
  const tufts: { x: number; z: number; s: number; ry: number; color: number }[] = [];
  for (let i = 0; i < 9000 && tufts.length < 2200; i++) {
    const x = (r() * 2 - 1) * (WORLD_HALF - 4), z = (r() * 2 - 1) * (WORLD_HALF - 4);
    if (Math.hypot(x, z) < CITY_R + 3 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1) continue;
    if (Math.abs(z) < ROAD_W / 2 + 0.8 && Math.abs(x) > CITY_R) continue;
    if (Math.abs(x) < ROAD_W / 2 + 0.8 && z > CITY_R) continue;
    if (FIELDS.some(f => x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1)) continue;
    tufts.push({ x, z, s: 0.7 + r() * 0.8, ry: r() * 6.28, color: new THREE.Color().setHSL(0.25 + r() * 0.05, 0.45, 0.28 + r() * 0.14).getHex() });
  }
  const grassGeo = mergeGeometries([colored(new THREE.ConeGeometry(0.07, 0.4, 3), 0xffffff, 0, 0.2, 0), colored(new THREE.ConeGeometry(0.06, 0.33, 3), 0xffffff, 0.11, 0.16, 0.05), colored(new THREE.ConeGeometry(0.06, 0.3, 3), 0xffffff, -0.09, 0.15, -0.06)])!;
  // el color de instancia multiplica al de vértice (blanco), así que cada mechón conserva su tono
  const grassBins = new Map<string, typeof tufts>();
  for (const t of tufts) { const k = Math.floor(t.x / 70) + "," + Math.floor(t.z / 70); const a = grassBins.get(k); if (a) a.push(t); else grassBins.set(k, [t]); }
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  for (const list of grassBins.values()) {
    const im = new THREE.InstancedMesh(grassGeo, grassMat, list.length), c = new THREE.Color();
    list.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.ry, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, c.setHex(t.color)); });
    dummy.scale.set(1, 1, 1); im.computeBoundingSphere(); root.add(im);
  }

  // --- Campos de cultivo, vallas, espantapájaros y granjas ---
  const cropTex = (a: string, b: string, kind: number) => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, 64); }
    if (kind === 1) { g.fillStyle = "rgba(20,60,20,.35)"; for (let i = 0; i < 8; i += 2) for (let j = 0; j < 8; j++) g.fillRect(i * 8 + 2, j * 8 + 2, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
  };
  const kinds = [{ a: "#cdb65a", b: "#b99f44", crop: 0xd9b84a, kind: 0 }, { a: "#6a9a3c", b: "#557f2f", crop: 0x4f9a3a, kind: 1 }, { a: "#8a6a3c", b: "#6f522d", crop: 0xe07a1f, kind: 2 }];
  const M2 = new Merge();
  const sheafGeo = colorParts([[new THREE.ConeGeometry(0.28, 0.9, 5), 0xffffff, 0, 0.45, 0], [new THREE.ConeGeometry(0.22, 0.7, 5), 0xffffff, 0.22, 0.35, 0.1], [new THREE.ConeGeometry(0.2, 0.65, 5), 0xffffff, -0.2, 0.32, -0.1]]);
  const squashGeo = colorParts([[new THREE.IcosahedronGeometry(0.28, 0), 0xffffff, 0, 0.22, 0], [new THREE.ConeGeometry(0.1, 0.25, 4), 0x3f8a3a, 0.0, 0.5, 0]]);
  FIELDS.forEach((f, fi) => {
    const kd = kinds[fi % 3]!, w = f.x1 - f.x0, d = f.z1 - f.z0, tex = cropTex(kd.a, kd.b, kd.kind); tex.repeat.set(w / 4, 1);
    const m = flat(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 0.03); m.position.set((f.x0 + f.x1) / 2, 0.03, (f.z0 + f.z1) / 2);
    const items: { x: number; y?: number; z: number; s: number; ry: number; color: number }[] = [];
    for (let x = f.x0 + 1; x < f.x1 - 0.5; x += 1.0) for (let z = f.z0 + 1.2; z < f.z1 - 1; z += kd.kind === 2 ? 2.6 : 1.5) {
      if (Math.floor((x - f.x0) / 1.0) % 2) continue;
      items.push({ x: x + (r() - 0.5) * 0.3, z: z + (r() - 0.5) * 0.5, s: 0.7 + r() * 0.5, ry: r() * 6, color: new THREE.Color(kd.crop).multiplyScalar(0.85 + r() * 0.3).getHex() });
    }
    chunked(kd.kind === 2 ? squashGeo : sheafGeo, leaf, items, 40);
    // valla
    const fence = (x: number, z: number, ang: number, len: number) => {
      M2.at(x, z);
      M2.box("solid", len, 0.12, 0.1, x, 0.9, z, WOOD, ang); M2.box("solid", len, 0.12, 0.1, x, 0.5, z, WOOD, ang);
      const n = Math.max(1, Math.round(len / 3));
      for (let k = 0; k <= n; k++) M2.box("solid", 0.16, 1.15, 0.16, x + Math.cos(ang) * (-len / 2 + (k / n) * len), 0.57, z - Math.sin(ang) * (-len / 2 + (k / n) * len), 0x5a3c24);
    };
    const gap = 6; // hueco de entrada en el lado sur
    fence(f.x0 + (w - gap) / 4 * 1 - 0, f.z1 + 0.8, 0, (w - gap) / 2 - 0.0); fence(f.x1 - (w - gap) / 4, f.z1 + 0.8, 0, (w - gap) / 2);
    fence((f.x0 + f.x1) / 2, f.z0 - 0.8, 0, w + 1.6); fence(f.x0 - 0.8, (f.z0 + f.z1) / 2, Math.PI / 2, d + 1.6); fence(f.x1 + 0.8, (f.z0 + f.z1) / 2, Math.PI / 2, d + 1.6);
    // espantapájaros
    const sx = f.x0 + w * 0.5, sz = f.z0 + d * 0.45; M2.at(sx, sz);
    M2.box("solid", 0.12, 2.2, 0.12, sx, 1.1, sz, WOOD); M2.box("solid", 1.8, 0.1, 0.1, sx, 1.7, sz, WOOD); M2.box("solid", 0.7, 0.9, 0.35, sx, 1.45, sz, 0x7a4a2b);
    M2.put("solid", new THREE.IcosahedronGeometry(0.28, 0), 0xe0c47a, sx, 2.3, sz); M2.cone("solid", 0.4, 0.45, 6, sx, 2.45, sz, 0x4a3320);
  });
  // patios de tierra en las granjas y pajares
  const yardMat = new THREE.MeshStandardMaterial({ map: noiseTexture(0x8a6e4b, 0.28, { cell: 6, repeat: 1, seed: 43 }), roughness: 1 });
  for (const b of EXTRA_BUILDINGS) {
    if (b.style === "hut") continue;
    const yard = flat(new THREE.CircleGeometry(Math.max(b.w, b.d) * 0.9 + 2, 20), yardMat, 0.022); yard.position.set(b.x, 0.022, b.z);
    M2.at(b.x, b.z);
    for (const o of [-1, 1]) { // pajar: cilindro y capuchón
      const hx = b.x + o * (b.w / 2 + 3.2), hz = b.z + (b.facing === 2 ? -1 : 1) * (b.d / 2 + 2.5);
      M2.cyl("solid", 1.2, 1.4, 1.8, 8, hx, 0, hz, 0xc9a84a); M2.cone("solid", 1.6, 1.8, 8, hx, 1.7, hz, 0xb8944a);
      if (b.style === "farm") break;
    }
  }
  M2.build(root);
  const bales: { x: number; y: number; z: number; ry: number }[] = [];
  for (const f of FIELDS) for (let i = 0; i < 5; i++) bales.push({ x: f.x0 + r() * (f.x1 - f.x0), y: 0.5, z: f.z0 + r() * (f.z1 - f.z0), ry: r() * 3 });
  const baleGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10); baleGeo.rotateZ(Math.PI / 2);
  props(baleGeo, std(0xc9a84a), bales);

  // --- Molinos de viento ---
  const MM = new Merge(); // parte fija
  const blades: THREE.Group[] = [];
  const hubM = new Merge(); // aspas (se hace una vez y se clona)
  {
    hubM.at(0, 0);
    const axle = new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8); axle.rotateX(Math.PI / 2); axle.translate(0, 0, -1.1); hubM.put("solid", axle, 0x4a3320, 0, 0, 0);
    const cap = new THREE.ConeGeometry(0.7, 0.9, 8); cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.7); hubM.put("solid", cap, 0x6a4a2c, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2, c = Math.cos(ang), s = Math.sin(ang);
      const at = (px: number, py: number) => [px * c - py * s, px * s + py * c] as const;
      const box = (w: number, h: number, d: number, px: number, py: number, pz: number, col: number) => { const [x, y] = at(px, py); hubM.box("solid", w, h, d, x, y, pz, col, 0, 0, ang); };
      box(0.3, 9.6, 0.26, 0, 5.2, 0, 0x5a3c24); // larguero
      for (let j = 0; j < 7; j++) box(1.7, 0.1, 0.12, 0.95, 2.2 + j * 1.0, 0.0, 0x6a4a2c); // travesaños (celosía)
      box(0.1, 6.4, 0.12, 1.75, 5.4, 0.0, 0x6a4a2c);
      box(1.6, 6.0, 0.05, 0.95, 5.5, 0.06, 0xe9e1cf); // lona
    }
  }
  for (const w of WINDMILLS) {
    MM.at(w.x, w.z);
    const x = w.x, z = w.z;
    MM.cyl("solid", 3.9, 4.1, 3.2, 10, x, 0, z, 0x8d8478); // base de piedra
    MM.cyl("solid", 2.3, 3.5, 8.6, 10, x, 3.2, z, 0xe6dccb); // cuerpo encalado
    for (const y of [4.5, 7.2]) MM.cyl("solid", 2.6 - (y - 3.2) * 0.12, 2.6 - (y - 3.2) * 0.12, 0.28, 10, x, y, z, 0x5a3c24);
    MM.cyl("solid", 3.3, 3.3, 0.3, 10, x, 8.0, z, 0x6b4a2e); // galería
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; MM.box("solid", 0.1, 0.8, 0.1, x + Math.cos(a) * 3.25, 8.5, z + Math.sin(a) * 3.25, 0x5a3c24); }
    MM.cyl("solid", 3.0, 2.4, 0.5, 10, x, 11.7, z, 0x5a3c24);
    MM.cone("solid", 3.3, 3.8, 10, x, 12.0, z, 0x7a4a2e);
    MM.cyl("solid", 0.1, 0.1, 1.8, 5, x, 15.6, z, 0x3a3a3e);
    MM.put("solid", archGeo(2.1, 3.1, 0.3), STONE_L, x, 0, z + 4.02);
    MM.put("solid", archGeo(1.5, 2.6, 0.3), DOOR, x, 0, z + 4.1);
    for (const [wy, ang] of [[6.0, 0.0], [9.2, 0.0], [6.0, 0.628], [6.0, -0.628], [9.2, 0.628]] as const) {
      const rr = 3.5 - (1.2 * (wy - 3.2)) / 8.6 + 0.02, wx = x + Math.sin(ang) * rr, wz = z + Math.cos(ang) * rr; MM.put("solid", archGeo(1.1, 1.7, 0.12), TIMBER, wx, wy - 0.1, wz, ang); MM.put("glow", archGeo(0.7, 1.35, 0.12), WARM, wx + Math.sin(ang) * 0.05, wy - 0.05, wz + Math.cos(ang) * 0.05, ang);
    }
    MM.box("solid", 0.2, 0.2, 5.2, x, 11.2, z - 3.7, 0x4a3320); // cola
    MM.box("solid", 1.6, 1.6, 0.1, x, 10.4, z - 6.3, 0x5a3c24);
  }
  MM.build(root);
  for (const w of WINDMILLS) {
    const hub = new THREE.Group(); hub.position.set(w.x, 10.4, w.z + 3.6);
    const g = new THREE.Group(); hub.add(g); root.add(hub); blades.push(g);
  }
  // aspas: una sola fusión compartida por clonado de geometría
  {
    const holder = new THREE.Group(); hubM.build(holder, true);
    const src = holder.children as THREE.Mesh[];
    blades.forEach(g => { for (const mesh of src) { const c = new THREE.Mesh(mesh.geometry, mesh.material); c.castShadow = true; c.matrixAutoUpdate = false; g.add(c); } });
  }

  // --- Lago: orilla, agua con degradado, destellos, juncos y nenúfares ---
  const shore = flat(new THREE.RingGeometry(LAKE.r - 2, LAKE.r + 4.5, 64, 2), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.025); shore.position.set(LAKE.x, 0.025, LAKE.z);
  {
    const p = shore.geometry.attributes.position!, cols = new Float32Array(p.count * 3), a = new THREE.Color(0x4b4a36), b = new THREE.Color(0xb5a373), c = new THREE.Color(0x7a8a4c), tt = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const rad = Math.hypot(p.getX(i), p.getY(i));
      if (rad < LAKE.r) tt.copy(a); else if (rad < LAKE.r + 2) tt.copy(b); else tt.copy(c).lerp(b, 0.15);
      cols[i * 3] = tt.r; cols[i * 3 + 1] = tt.g; cols[i * 3 + 2] = tt.b;
    }
    shore.geometry.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  }
  const lakeGeo = new THREE.CircleGeometry(LAKE.r, 64, 0, Math.PI * 2);
  {
    const p = lakeGeo.attributes.position!, cols = new Float32Array(p.count * 3), deep = new THREE.Color(0x1d5f96), edge = new THREE.Color(0x4aa8cf), tt = new THREE.Color();
    for (let i = 0; i < p.count; i++) { tt.copy(deep).lerp(edge, THREE.MathUtils.smoothstep(Math.hypot(p.getX(i), p.getY(i)) / LAKE.r, 0.35, 1.0)); cols[i * 3] = tt.r; cols[i * 3 + 1] = tt.g; cols[i * 3 + 2] = tt.b; }
    lakeGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  }
  const lake = flat(lakeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 }), 0.06); lake.receiveShadow = false; lake.position.set(LAKE.x, 0.06, LAKE.z);
  const glints = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 0.16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.55, depthWrite: false }), 40);
  const glintPos = Array.from({ length: 40 }, (_, i) => { const a = hash2(i, 3) * 6.28, rr = Math.sqrt(hash2(i, 9)) * (LAKE.r - 3); return { x: LAKE.x + Math.cos(a) * rr, z: LAKE.z + Math.sin(a) * rr, ph: hash2(i, 5) * 6.28 }; });
  glints.frustumCulled = false; root.add(glints);
  const updateGlints = (t: number) => {
    glintPos.forEach((g, i) => { const k = Math.max(0, Math.sin(t * 1.4 + g.ph)); dummy.position.set(g.x, 0.085, g.z); dummy.rotation.set(0, g.ph, 0); dummy.scale.set(0.3 + k, 1, 1); dummy.updateMatrix(); glints.setMatrixAt(i, dummy.matrix); });
    dummy.scale.set(1, 1, 1); glints.instanceMatrix.needsUpdate = true;
  };
  updateGlints(0);
  const reeds = Array.from({ length: 110 }, (_, i) => { const a = hash2(i, 21) * 6.28, rr = LAKE.r + 0.2 + hash2(i, 22) * 2.4; return { x: LAKE.x + Math.cos(a) * rr, z: LAKE.z + Math.sin(a) * rr, s: 0.8 + hash2(i, 23) * 0.9, ry: hash2(i, 24) * 6, color: new THREE.Color().setHSL(0.22 + hash2(i, 25) * 0.06, 0.45, 0.3 + hash2(i, 26) * 0.12).getHex() }; })
    .filter(p => !(p.x > pierX0 - 14 && p.x < pierX0 + 3 && Math.abs(p.z - pierZ) < 3));
  chunked(colorParts([[new THREE.ConeGeometry(0.05, 1.5, 3), 0xffffff, 0, 0.75, 0], [new THREE.ConeGeometry(0.05, 1.2, 3), 0xffffff, 0.15, 0.6, 0.05], [new THREE.CylinderGeometry(0.07, 0.07, 0.5, 5), 0x6a4a2c, 0.05, 1.5, 0.0]]), leaf, reeds, 100);
  const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9 }), 30);
  for (let i = 0; i < 30; i++) { const a = hash2(i, 31) * 6.28, rr = Math.sqrt(hash2(i, 32)) * (LAKE.r - 3); dummy.position.set(LAKE.x + Math.cos(a) * rr, 0.075, LAKE.z + Math.sin(a) * rr); dummy.rotation.set(0, hash2(i, 33) * 6, 0); dummy.scale.setScalar(0.7 + hash2(i, 34)); dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix); }
  dummy.scale.set(1, 1, 1); pads.computeBoundingSphere(); root.add(pads);
  const boats: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(), a = 1 + i * 2.1, rr = 8 + i * 5; g.position.set(LAKE.x + Math.cos(a) * rr, 0.1, LAKE.z + Math.sin(a) * rr); g.rotation.y = a * 2;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 4), std(0x7a5a38)); hull.position.y = 0.2;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), std(0x7a5a38)); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.2, 2.5);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 5), std(TIMBER)); mast.position.set(0, 2.3, 0.2);
    const sailM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6, 1.9), std([0xece3cf, 0xe8c9a0, 0xd9e4ea][i]!)); sailM.position.set(0, 2.5, -0.6);
    g.add(hull, bow, mast, sailM); g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; }); root.add(g); boats.push(g);
  }

  // --- Humo de chimeneas (solo las cercanas al jugador) ---
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd6d6d6, transparent: true, opacity: 0.3, depthWrite: false });
  const smokeGeo = new THREE.IcosahedronGeometry(0.35, 0);
  const puffs: { m: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  ctx.chimneys.filter((_, i) => i % 3 === 0).slice(0, 40).forEach(top => {
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(smokeGeo, smokeMat); root.add(m); puffs.push({ m, base: top.clone(), ph: i / 4 + r() * 0.2 }); }
  });
  void CITY_NAME;

  // ---------- animación ----------
  const snap = new THREE.Vector3(), fv = new THREE.Vector3();
  // Ejes del plano de la luz: la sombra se mueve en pasos de un texel exacto, así no tiembla al caminar.
  const lDir = SUN_OFFSET.clone().normalize(), lRight = new THREE.Vector3(0, 1, 0).cross(lDir).normalize(), lUp = lDir.clone().cross(lRight).normalize();
  let lampK = 1;
  const lampOn = new THREE.Color(0xffd48a), lampOff = new THREE.Color(0x8a8070);
  const lights: SkyLights = {
    sun, hemi,
    setNight(k) {
      lampK = k; setWindowGlow(0.55 + 0.45 * k);
      (lampGlow.material as THREE.MeshBasicMaterial).color.copy(lampOff).lerp(lampOn, k);
    },
  };
  const TEXEL = (SH * 2) / sun.shadow.mapSize.x;
  return {
    ground, lights,
    update(dt, t, focus, lightDir) {
      goddess.update(t);
      if (lightDir && lightDir.distanceToSquared(lDir) > 1e-6) { // el sol se mueve: rehace los ejes del plano de la luz
        lDir.copy(lightDir); SUN_OFFSET.copy(lDir).multiplyScalar(SUN_DIST);
        lRight.set(0, 1, 0).cross(lDir).normalize(); lUp.copy(lDir).cross(lRight).normalize();
      }
      fv.set(focus.x, 0, focus.z);
      const sr = Math.round(fv.dot(lRight) / TEXEL) * TEXEL, su = Math.round(fv.dot(lUp) / TEXEL) * TEXEL;
      snap.copy(lRight).multiplyScalar(sr).addScaledVector(lUp, su);
      sun.target.position.copy(snap); sun.position.copy(snap).add(SUN_OFFSET);
      fountain.update(t);
      STALLS.forEach((s, i) => { stallLabels[i]!.visible = (s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 < 26 * 26; });
      lake.position.y = 0.06 + Math.sin(t * 1.1) * 0.012;
      for (const b of blades) b.rotation.z = t * 0.5;
      boats.forEach((b, i) => { b.position.y = 0.1 + Math.sin(t * 1.3 + i * 2) * 0.05; b.rotation.z = Math.sin(t * 1.1 + i) * 0.03; });
      if (Math.abs(focus.x - LAKE.x) < 90 && Math.abs(focus.z - LAKE.z) < 90) {
        updateGlints(t);
      }
      for (const p of puffs) {
        if (Math.abs(p.base.x - focus.x) > 70 || Math.abs(p.base.z - focus.z) > 70) { p.m.visible = false; continue; }
        const k = (p.ph + t * 0.18) % 1; p.m.visible = true;
        p.m.position.set(p.base.x + Math.sin(t + p.ph * 9) * 0.3 * k + k * 0.8, p.base.y + 0.3 + k * 3.2, p.base.z);
        p.m.scale.setScalar(0.4 + k * 1.5 - k * k * 1.2);
      }
      // las 8 luces del pool saltan a las farolas más cercanas al jugador
      lightClock -= dt;
      if (lightClock <= 0) {
        lightClock = 0.3; fv.copy(focus);
        const near = LAMPS.map((l, i) => ({ i, d: (l.x - fv.x) ** 2 + (l.z - fv.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, lightPool.length);
        lightPool.forEach((pl, k) => { const n = near[k]; if (n && n.d < 2500) pl.position.set(LAMPS[n.i]!.x, 3.4, LAMPS[n.i]!.z); else pl.position.y = -50; });
      }
      if (lightClock === 0.3) {
        const near = roomLights.map(r => ({ r, d: (r.x - fv.x) ** 2 + (r.z - fv.z) ** 2 })).sort((a, b) => a.d - b.d);
        roomPool.forEach((pl, k) => { const n = near[k]; if (n && n.d < 30 * 30) { pl.position.set(n.r.x, n.r.y, n.r.z); pl.intensity = n.r.big ? 60 : 22; pl.distance = n.r.big ? 22 : 10; } else { pl.position.y = -50; pl.intensity = 0; } });
      }
      for (const pl of lightPool) { pl.visible = lampK > 0.02; pl.intensity = (30 + Math.sin(t * 7 + pl.position.x) * 2.2) * lampK; }
    },
  };
}

// ---------- Límite del mundo ----------
// El servidor no deja pasar de ±WORLD_HALF. Para que no se vea un borde vacío: bosque cerrado justo detrás
// del límite, barreras de troncos donde acaban los caminos y una cordillera que cierra el horizonte.
type Chunked = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y?: number; z: number; s: number; sy?: number; ry: number; color: number }[], cell?: number) => void;
function frontier(chunked: Chunked, pine: THREE.BufferGeometry, round: THREE.BufferGeometry, leaf: THREE.Material, tint: () => number, root: THREE.Object3D) {
  const r = rng(4242), H = WORLD_HALF;
  const cheb = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));
  // bosque: muy denso pegado al límite y más claro hacia fuera
  const pines: Parameters<Chunked>[2] = [], rounds: Parameters<Chunked>[2] = [];
  // franja de ~45 m (lo que se ve a pie); más allá tapan las colinas, que cuestan mucho menos que los árboles
  for (let i = 0, n = 0; i < 40000 && n < 2200; i++) {
    const x = (r() * 2 - 1) * (H + 45), z = (r() * 2 - 1) * (H + 45), c = cheb(x, z);
    if (c < H + 2.5) continue;
    if (r() > 1 - (c - H) / 70) continue; // densidad que decae con la distancia
    const big = 1.3 + r() * 1.4 + Math.min(1, (c - H) / 30) * 0.8;
    (r() < 0.82 ? pines : rounds).push({ x, z, s: big, sy: big * (0.9 + r() * 0.35), ry: r() * 6.28, color: tint() }); n++;
  }
  chunked(pine, leaf, pines, 90); chunked(round, leaf, rounds, 90);

  // barreras de troncos donde los caminos llegan al límite
  const M = new Merge();
  for (const a of GATE_ANGLES) {
    const c = Math.cos(a), s = Math.sin(a), d = H - 0.6, tx = -s, tz = c, ry = Math.atan2(-c, -s); // eje x local a lo largo de la tangente
    const at = (along: number, out: number) => ({ x: c * (d + out) + tx * along, z: s * (d + out) + tz * along });
    for (const k of [-1, 1]) { const p = at(k * (ROAD_W / 2 + 0.3), 0); M.cyl("solid", 0.18, 0.22, 1.5, 7, p.x, 0, p.z, 0x5b3d24); }
    for (const [y, out] of [[0.55, 0], [1.15, 0]] as const) { // largueros
      const p = at(0, out), g = new THREE.CylinderGeometry(0.16, 0.16, ROAD_W + 1.4, 7).rotateZ(Math.PI / 2);
      M.put("solid", g, 0x6a4a2c, p.x, y, p.z, ry);
    }
    for (const k of [-1, 1]) { // aspa
      const p = at(0, 0.25), g = new THREE.CylinderGeometry(0.11, 0.11, 2.6, 6).rotateZ(Math.PI / 2 + k * 0.55);
      M.put("solid", g, 0x4f3720, p.x, 0.85, p.z, ry);
    }
    const sign = at(ROAD_W / 2 - 0.4, -0.15); // cartel de "fin del camino"
    M.box("solid", 0.12, 1.9, 0.12, sign.x, 0.95, sign.z, 0x5b3d24, ry);
    M.box("solid", 1.1, 0.5, 0.08, sign.x, 1.65, sign.z, 0x8a6a42, ry);
    for (let i = 0; i < 6; i++) { // troncos caídos detrás
      const p = at((r() * 2 - 1) * (ROAD_W / 2 + 1), 2 + r() * 6), g = new THREE.CylinderGeometry(0.28, 0.32, 3 + r() * 2, 7).rotateZ(Math.PI / 2);
      M.put("solid", g, 0x5b3d24, p.x, 0.3, p.z, ry + (r() - 0.5) * 1.2);
    }
  }
  M.build(root);

  // cordillera: conos bajos con vértices removidos, de verde en la base a roca y nieve en la cima
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.Color(0x3d5f35), rock = new THREE.Color(0x7c7a72), snow = new THREE.Color(0xf2f2ee), tmp = new THREE.Color();
  const hill = new THREE.Color(0x2f5a2c);
  for (let i = 0; i < 200; i++) {
    // tres anillos: colinas boscosas pegadas al bosque, montes y picos nevados al fondo
    const ring = i < 100 ? 0 : i < 150 ? 1 : 2;
    const a = (i / (ring === 0 ? 100 : 50)) * Math.PI * 2 + (r() - 0.5) * 0.08;
    const ca = Math.cos(a), sa = Math.sin(a), edge = H / Math.max(Math.abs(ca), Math.abs(sa)); // borde cuadrado en esa dirección
    const far = ring === 2, dist = edge + [55, 140, 230][ring]! + r() * [40, 60, 60][ring]!;
    const h = [14, 45, 90][ring]! + r() * [16, 40, 70][ring]!, rad = Math.min(h * (ring === 0 ? 2.6 + r() : 1.1 + r() * 0.5), dist - edge - 22); // la falda no invade el mundo
    const g = new THREE.ConeGeometry(rad, h, ring === 0 ? 8 : 7, 3).toNonIndexed();
    const pos = g.attributes.position!, col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), k = (y + h / 2) / h; // 0 base, 1 cima
      const j = Math.sin(x * 0.31 + i) * Math.cos(z * 0.27 + i * 1.7) * rad * 0.12 * (1 - k);
      pos.setXYZ(v, x + j, y + h / 2 - 2, z - j);
      if (ring === 0) tmp.copy(hill).multiplyScalar(0.85 + k * 0.3); // colina cubierta de bosque
      else tmp.copy(base).lerp(rock, THREE.MathUtils.smoothstep(k, 0.25, 0.55));
      if (far && k > 0.78) tmp.copy(snow);
      col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.deleteAttribute("uv"); g.computeVertexNormals();
    g.rotateY(r() * 6.28); g.translate(ca * dist, 0, sa * dist);
    parts.push(g);
  }
  const range = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  range.matrixAutoUpdate = false; root.add(range);
}
