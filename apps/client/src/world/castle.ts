import * as THREE from "three";
import {
  CASTLE, CASTLE_LAWNS, CASTLE_RECT, CASTLE_TOWERS, CASTLE_WINGS, CASTLE_GATE_DECOR, CITY_NAME, GREAT_HALL, HALL, HALL_PROPS, type Building,
} from "@mmorpg/shared";
import { greatHall, house, gatehouse, shieldGeo, tower, type Ctx } from "./buildings";
import { Merge, STONE, STONE_D, STONE_L, WARM, DOOR, archWallGeo, archGeo, bannerGeo, pennantGeo, textSprite } from "./kit";

function hedgeLawn(m: Merge, l: { x: number; z: number; w: number; d: number }, i: number) {
  m.at(l.x, l.z);
  const HC = 0x2f6b34, t = 0.55;
  for (const s of [-1, 1]) {
    m.box("solid", l.w, 0.8, t, l.x, 0.4, l.z + s * (l.d / 2 - t / 2), HC);
    m.box("solid", t, 0.8, l.d - t * 2, l.x + s * (l.w / 2 - t / 2), 0.4, l.z, HC);
  }
  m.box("solid", l.w - 2 * t, 0.1, l.d - 2 * t, l.x, 0.06, l.z, 0x5fa043); // césped
  const flowers = [0xd9534f, 0xf2c14e, 0xe8a0b4, 0xb48ae0, 0xffffff];
  const nx = Math.max(2, Math.floor((l.w - 2) / 1.1)), nz = Math.max(2, Math.floor((l.d - 2) / 1.1));
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    if ((a + b + i) % 3) continue;
    m.box("solid", 0.28, 0.32, 0.28, l.x - l.w / 2 + 1 + (a + 0.5) * ((l.w - 2) / nx), 0.22, l.z - l.d / 2 + 1 + (b + 0.5) * ((l.d - 2) / nz), flowers[(a * 2 + b + i) % 5]!);
  }
  if (l.w > 6) for (const sx of [-1, 1]) { // árboles de copa redonda en los parterres grandes
    const tx = l.x + sx * l.w * 0.22, tz = l.z + (sx > 0 ? -1 : 1) * l.d * 0.18;
    m.cyl("solid", 0.2, 0.3, 2.0, 6, tx, 0, tz, 0x6a4a2c);
    m.put("solid", new THREE.IcosahedronGeometry(1.5, 1), 0x4f9442, tx, 3.0, tz);
    m.put("solid", new THREE.IcosahedronGeometry(1.0, 1), 0x5aa24a, tx + 0.7, 2.5, tz + 0.2);
  } else { m.cone("solid", 0.8, 2.6, 7, l.x, 0.1, l.z, 0x2f6a3a); m.cone("solid", 0.55, 2.0, 7, l.x, 1.5, l.z, 0x3b8a47); }
}

/** Fuente monumental de la diosa (cabecera de la catedral): vaso de piedra, agua viva y
 *  una majestuosa estatua femenina ante la que el jugador puede rezar.
 *  `scale`: escala del conjunto. `figure`: escala de la estatua respecto a la fuente. */
export function goddessFountain(x: number, z: number, opts: { scale?: number; figure?: number } = {}) {
  const K = opts.figure ?? 1;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.scale.setScalar(opts.scale ?? 1);

  const add = (o: THREE.Mesh, x0 = 0, y0 = 0, z0 = 0) => { o.position.set(x0, y0, z0); g.add(o); return o; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat);
  const marble = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, flatShading: true, roughness: 0.85 });
  const marbleD = new THREE.MeshStandardMaterial({ color: 0xa9a59a, flatShading: true, roughness: 0.88 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b94a, flatShading: true, metalness: 0.55, roughness: 0.4 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x4fb5d8, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.75, emissive: 0x0e3a5c, emissiveIntensity: 0.55 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.55, depthWrite: false });

  // Base octogonal de tres escalones
  const R0 = 4.2, R1 = 3.6, R2 = 3.0;
  add(mesh(new THREE.CylinderGeometry(R0, R0 + 0.15, 0.25, 8), marbleD), 0, 0.125, 0);
  add(mesh(new THREE.CylinderGeometry(R1, R1 + 0.1, 0.25, 8), marble), 0, 0.375, 0);
  add(mesh(new THREE.CylinderGeometry(R2, R2 + 0.08, 0.35, 8), marbleD), 0, 0.675, 0);

  // Vaso de agua
  const bowl = add(mesh(new THREE.CylinderGeometry(R2 - 0.05, R2 - 0.25, 0.55, 8, 1, true), marble), 0, 1.0, 0);
  bowl.material = marble;
  const water = add(mesh(new THREE.CircleGeometry(R2 - 0.15, 8), waterMat), 0, 1.24, 0);
  water.rotation.x = -Math.PI / 2;

  // Columna central que sostiene a la diosa
  add(mesh(new THREE.CylinderGeometry(0.65, 0.85, 1.1, 8), marbleD), 0, 1.4, 0);
  add(mesh(new THREE.CylinderGeometry(0.85, 0.65, 0.18, 8), marble), 0, 2.04, 0);

  // Estatua de la diosa: mármol blanco y oro. Túnica larga, alas desplegadas, halo radiante,
  // una mano tendida a los fieles y la otra alzando una estrella de luz.
  const st = new THREE.Group(); st.position.y = 2.13; st.scale.setScalar(K); g.add(st);
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.55 });
  const whiteD = new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.6, flatShading: true });
  const goldS = new THREE.MeshStandardMaterial({ color: 0xe6c25a, metalness: 0.7, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa8ff, emissiveIntensity: 1.6, roughness: 0.2 });
  const starMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const sAdd = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); st.add(o); return o; };
  const UP = new THREE.Vector3(0, 1, 0);
  /** Cilindro de (a) a (b) con radios r0→r1. */
  const limb = (a: [number, number, number], b: [number, number, number], r0: number, r1: number, mat: THREE.Material, seg = 8) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize()); st.add(m); return m;
  };
  const lathe = (pts: [number, number][], seg: number) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

  // túnica (perfil de revolución) con pliegues, orla y cinturón dorados
  const gown = sAdd(mesh(lathe([[0.8, 0], [0.76, 0.05], [0.64, 0.3], [0.52, 0.62], [0.42, 0.92], [0.33, 1.12], [0.27, 1.26], [0.3, 1.42], [0.34, 1.56], [0.3, 1.7], [0.2, 1.8], [0.09, 1.86]], 24), white)); gown.scale.z = 0.84;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26, c = Math.cos(a), s = Math.sin(a) * 0.84, wob = 1 + (i % 3) * 0.05;
    limb([c * 0.3 * wob, 1.2, s * 0.3 * wob], [c * 0.79, 0.02, s * 0.79], 0.035, 0.085, whiteD, 5);
  }
  const hem = sAdd(mesh(new THREE.TorusGeometry(0.78, 0.035, 6, 28), goldS), 0, 0.05, 0); hem.rotation.x = Math.PI / 2; hem.scale.y = 0.84;
  const belt = sAdd(mesh(new THREE.TorusGeometry(0.275, 0.035, 6, 20), goldS), 0, 1.25, 0); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.84;
  sAdd(mesh(new THREE.OctahedronGeometry(0.06, 0), gem), 0, 1.25, 0.25);
  limb([0, 1.22, 0.24], [0.05, 0.25, 0.6], 0.03, 0.05, goldS, 5); // cinta que cae del cinturón
  // escote y hombros
  const collar = sAdd(mesh(new THREE.TorusGeometry(0.2, 0.028, 6, 20), goldS), 0, 1.78, 0.01); collar.rotation.x = Math.PI / 2; collar.scale.y = 0.8;
  for (const s of [-1, 1]) { const sh = sAdd(mesh(new THREE.SphereGeometry(0.11, 12, 10), white), s * 0.3, 1.72, 0); sh.scale.set(1, 0.85, 0.9); }
  // cuello y cabeza serena (ojos cerrados)
  limb([0, 1.8, 0], [0, 1.96, 0.01], 0.075, 0.065, white);
  const head = sAdd(mesh(new THREE.SphereGeometry(0.17, 18, 16), white), 0, 2.08, 0.02); head.scale.set(0.9, 1.08, 0.94);
  for (const s of [-1, 1]) {
    const lid = sAdd(mesh(new THREE.TorusGeometry(0.035, 0.006, 4, 10, Math.PI), whiteD), s * 0.06, 2.1, 0.168); lid.rotation.z = Math.PI;
    const brow = sAdd(mesh(new THREE.TorusGeometry(0.045, 0.005, 4, 10, Math.PI * 0.7), whiteD), s * 0.06, 2.115, 0.165); brow.rotation.z = Math.PI * 0.15;
  }
  const nose = sAdd(mesh(new THREE.ConeGeometry(0.018, 0.07, 5), white), 0, 2.07, 0.18); nose.rotation.x = 0.25;
  const lips = sAdd(mesh(new THREE.SphereGeometry(0.024, 8, 6), whiteD), 0, 2.005, 0.165); lips.scale.set(1.5, 0.45, 0.6);
  // cabello dorado: casquete, melena por la espalda y dos mechones sobre los hombros
  const cap = sAdd(mesh(new THREE.SphereGeometry(0.19, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), goldS), 0, 2.1, -0.015); cap.rotation.x = -0.35;
  for (let i = -3; i <= 3; i++) limb([i * 0.045, 2.16, -0.13], [i * 0.085, 1.0 + Math.abs(i) * 0.09, -0.3 - (3 - Math.abs(i)) * 0.02], 0.055, 0.03, goldS, 6);
  for (const s of [-1, 1]) { limb([s * 0.15, 2.12, 0.02], [s * 0.2, 1.74, 0.1], 0.045, 0.04, goldS, 6); limb([s * 0.2, 1.74, 0.1], [s * 0.17, 1.38, 0.2], 0.04, 0.02, goldS, 6); }
  // diadema con gema y puntas
  const tiara = sAdd(mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 22), goldS), 0, 2.2, 0.02); tiara.rotation.x = Math.PI / 2 - 0.2;
  for (let i = -2; i <= 2; i++) { const sp = sAdd(mesh(new THREE.ConeGeometry(0.018, 0.13 - Math.abs(i) * 0.03, 4), goldS), Math.sin(i * 0.38) * 0.16, 2.28 - Math.abs(i) * 0.03, Math.cos(i * 0.38) * 0.16 + 0.01); sp.rotation.x = 0.15; }
  sAdd(mesh(new THREE.OctahedronGeometry(0.03, 0), gem), 0, 2.21, 0.18);
  // brazos: el izquierdo tendido hacia los fieles con la palma abierta; el derecho alza la estrella
  limb([-0.3, 1.72, 0], [-0.46, 1.36, 0.12], 0.07, 0.06, white); limb([-0.46, 1.36, 0.12], [-0.6, 1.3, 0.5], 0.058, 0.045, white);
  const palm = sAdd(mesh(new THREE.SphereGeometry(0.06, 10, 8), white), -0.63, 1.31, 0.57); palm.scale.set(1, 0.45, 1.3);
  limb([-0.3, 1.74, 0], [-0.5, 1.2, 0.02], 0.12, 0.2, whiteD, 7); // manga caída
  limb([0.3, 1.72, 0], [0.5, 1.98, 0.1], 0.07, 0.06, white); limb([0.5, 1.98, 0.1], [0.56, 2.42, 0.2], 0.058, 0.045, white);
  sAdd(mesh(new THREE.SphereGeometry(0.055, 10, 8), white), 0.565, 2.47, 0.21);
  limb([0.32, 1.76, 0], [0.5, 1.5, -0.04], 0.1, 0.22, whiteD, 7);
  for (const [x, y] of [[-0.47, 1.36], [0.5, 1.98]] as const) { const br = sAdd(mesh(new THREE.TorusGeometry(0.07, 0.014, 5, 14), goldS), x, y, 0.11); br.rotation.x = Math.PI / 2; }
  const star = new THREE.Group(); sAdd(star, 0.58, 2.68, 0.23);
  star.add(mesh(new THREE.OctahedronGeometry(0.11, 0), starMat));
  for (let i = 0; i < 4; i++) { const ray = mesh(new THREE.ConeGeometry(0.035, 0.34, 4), starMat); ray.rotation.z = (i * Math.PI) / 2; ray.translateY(0.2); star.add(ray); }
  const starGlow = mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.3, depthWrite: false })); star.add(starGlow);
  // halo radiante tras la cabeza
  const halo = new THREE.Group(); sAdd(halo, 0, 2.1, -0.2);
  halo.add(mesh(new THREE.TorusGeometry(0.36, 0.028, 6, 30), goldS), mesh(new THREE.TorusGeometry(0.27, 0.012, 5, 26), goldS));
  for (let i = 0; i < 16; i++) { const ray = mesh(new THREE.ConeGeometry(0.03, i % 2 ? 0.22 : 0.4, 4), goldS); ray.rotation.z = (i / 16) * Math.PI * 2; ray.translateY(0.36 + (i % 2 ? 0.11 : 0.2)); ray.scale.z = 0.4; halo.add(ray); }
  // alas desplegadas: tres hileras de plumas anchas y redondeadas que se solapan
  const featherGeo = new THREE.SphereGeometry(1, 10, 8);
  for (const s of [-1, 1]) for (let row = 0; row < 3; row++) {
    const n = 8 - row * 2, len0 = 1.55 - row * 0.42;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), ang = 1.2 - f * 1.75, L = len0 * (0.6 + 0.4 * Math.sin(Math.min(1, f * 1.5 + 0.25) * Math.PI));
      const dir = new THREE.Vector3(s * Math.cos(ang), Math.sin(ang), -0.14 - row * 0.03).normalize();
      const fe = mesh(featherGeo, row === 0 ? white : row === 1 ? whiteD : goldS);
      fe.scale.set(0.15 - row * 0.015, L / 2, 0.03); fe.quaternion.setFromUnitVectors(UP, dir);
      fe.position.set(s * 0.16, 1.6, -0.24 + row * 0.05 - f * 0.03).addScaledVector(dir, L / 2 + 0.04);
      st.add(fe);
    }
  }
  for (const s of [-1, 1]) limb([s * 0.1, 1.55, -0.2], [s * 0.62, 2.25, -0.34], 0.09, 0.05, white, 6); // arranque del ala

  // Chorros de agua que brotan de la base de la estatua y caen al vaso
  const spoutGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.22, 6);
  for (let i = 0; i < 8; i++) {
    const a = i * (Math.PI / 4);
    const sx = Math.cos(a) * 1.15, sz = Math.sin(a) * 1.15;
    const spout = add(mesh(spoutGeo, marbleD), sx, 1.45, sz);
    spout.rotation.z = Math.PI / 2; spout.rotation.y = -a;
  }

  // Partículas de agua
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.75, depthWrite: false });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 5, 4), dropMat, 16);
  drops.frustumCulled = false; g.add(drops);

  // Resplandor sagrado
  const holyLight = new THREE.PointLight(0xffd78a, 18, 14 + (K - 1) * 8, 2);
  holyLight.position.set(0, 2.1 + 2.1 * K, 1.2 * (K - 1)); g.add(holyLight);
  const aura = add(mesh(new THREE.CylinderGeometry(0.05, 1.1, 3.2, 16, 1, true), glowMat), 0, 1.4 + 1.6 * K, 0);
  aura.material = glowMat; aura.scale.setScalar(K);

  const dummy = new THREE.Object3D();
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== glowMat && m.material !== waterMat) { m.castShadow = true; m.receiveShadow = true; } });

  return {
    group: g,
    update(t: number) {
      holyLight.intensity = (16 + Math.sin(t * 2.1) * 3) * (0.6 + 0.4 * K);
      star.rotation.z = t * 0.6; starGlow.scale.setScalar(1 + Math.sin(t * 3.2) * 0.18);
      halo.rotation.z = t * 0.12;
      (aura.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 1.8) * 0.12;
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI / 4);
        for (let j = 0; j < 2; j++) {
          const p = (j / 2 + t * 0.7 + i * 0.11) % 1;
          const r = 1.25 + 0.55 * p;
          dummy.position.set(Math.cos(a) * r, 1.45 + 0.6 * p - 2.0 * p * p, Math.sin(a) * r);
          dummy.scale.setScalar(1 + p * 0.8);
          dummy.updateMatrix();
          drops.setMatrixAt(i * 2 + j, dummy.matrix);
        }
      }
      drops.instanceMatrix.needsUpdate = true;
      water.position.y = 1.24 + Math.sin(t * 1.5) * 0.01;
    },
  };
}

/** Auténtica puerta del castillo: dos torres cuadradas, arco monumental, rastrillo y antorchas.
 *  Se sitúa frente al pórtico del gran salón. */
function castleGate(m: Merge, x: number, z: number) {
  m.at(x, z);
  const W = 12.5, H = 15.5, D = 3.8, hole = 7.2, holeH = 9.2;
  // muro con gran arco apuntado
  m.put("solid", archWallGeo(W, H, D, hole, holeH), STONE, x, 0, z);
  m.box("solid", W + 0.5, 1.0, D + 0.5, x, H, z, STONE_D);
  // almenas
  const n = Math.floor(W / 1.9);
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    const along = (i - (n - 1) / 2) * (W / n);
    m.box("solid", 0.7, 1.3, 0.6, x + along, H + 1.1, z + s * (D / 2 + 0.25), STONE_L);
  }
  // torres laterales
  for (const s of [-1, 1]) {
    const tx = x + s * (W / 2 + 2.4);
    m.box("solid", 4.2, H - 1, 4.2, tx, (H - 1) / 2, z, STONE);
    m.box("solid", 4.6, 1.1, 4.6, tx, H - 0.5, z, STONE_D);
    m.box("solid", 4.8, 1.0, 4.8, tx, H + 0.6, z, STONE_L);
    // saeteras encendidas
    for (const o of [-1.1, 1.1]) {
      m.put("solid", archGeo(0.95, 2.2, 0.12), STONE_L, tx + o, 8.5, z + 2.16, 0);
      m.put("glow", archGeo(0.6, 1.75, 0.12), WARM, tx + o, 8.5, z + 2.22, 0);
    }
    // estandarte real
    m.put("solid", bannerGeo(1.4, 4.8), s > 0 ? 0xb02a30 : 0x2c4a8a, tx, H + 1.6, z + 2.55);
    // antorchas a los lados del arco
    const ax = x + s * (hole / 2 + 0.7);
    m.box("solid", 0.18, 2.6, 0.18, ax, 1.4, z + 2.2, 0x2a2a2e);
    m.box("glow", 0.42, 0.42, 0.42, ax, 3.0, z + 2.2, 0xff9a3a);
  }
  // rastrillo alzado
  for (let k = -5; k <= 5; k++) m.box("solid", 0.13, 3.2, 0.13, x + k * (hole / 11), holeH - 1.8, z + D / 2 - 0.6, 0x2a2a2e);
  m.box("solid", hole * 0.92, 0.14, 0.18, x, holeH - 1.4, z + D / 2 - 0.6, 0x2a2a2e);
  m.box("solid", hole * 0.92, 0.14, 0.18, x, holeH - 2.8, z + D / 2 - 0.6, 0x2a2a2e);
  // puerta de madera maciza doble, abierta de par en par contra las jambas (se entra al gran salón)
  for (const s of [-1, 1]) {
    const dx = x + s * (hole / 2 - 0.16), dz = z + D / 2 - 1.75;
    m.box("solid", 0.25, 6.0, 3.3, dx, 3.0, dz, DOOR);
    for (let i = 0; i < 4; i++) m.box("solid", 0.3, 0.12, 3.2, dx, 0.8 + i * 1.5, dz, 0x2a1c12);
  }
  // escalones que suben a la puerta
  for (let i = 0; i < 3; i++) m.box("solid", W + 1.6 - i * 0.5, 0.22, 1.0, x, 0.11, z + D / 2 + 0.7 + i * 0.9, 0xb8b1a2);
}

function coveredBridge(m: Merge, a: { x: number; z: number; r: number }, b: { x: number; z: number; r: number }, y: number) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) - a.r - b.r + 1.5, ang = -Math.atan2(dz, dx), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  m.at(cx, cz);
  m.box("solid", len, 2.6, 2.4, cx, y, cz, 0x8a6a45, ang);
  m.box("solid", len + 0.6, 0.45, 3.0, cx, y - 1.5, cz, STONE_D, ang);
  m.box("solid", len, 0.2, 2.6, cx, y + 0.4, cz, 0x4a3320, ang); // viga
  const sh = new THREE.Shape(); sh.moveTo(-1.7, 0); sh.lineTo(1.7, 0); sh.lineTo(0, 1.5); sh.closePath();
  const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(len + 0.6) / 2); rg.rotateY(Math.PI / 2);
  m.put("solid", rg, 0x3b4350, cx, y + 1.3, cz, ang);
  const nPos = Math.max(3, Math.floor(len / 2.2));
  for (let k = 0; k < nPos; k++) {
    const f = (k + 0.5) / nPos - 0.5, px = cx + Math.cos(ang) * f * len, pz = cz - Math.sin(ang) * f * len;
    for (const s of [-1, 1]) m.box("glow", 0.9, 1.1, 0.12, px + Math.sin(ang) * s * 1.22, y + 0.1, pz + Math.cos(ang) * s * 1.22, WARM, ang + Math.PI / 2 * 0);
  }
}

export function castle(m: Merge, labels: THREE.Object3D, ctx: Ctx) {
  const { x0, x1, z0, z1 } = CASTLE_RECT, H = CASTLE.wallH, T = CASTLE.wallT, g = CASTLE.gateHalf;
  m.at(0, -66);
  // lienzos de muralla: talud, almenas dobles, contrafuertes y saeteras en las caras visibles
  const wall = (ax: number, az: number, bx: number, bz: number, outward: number) => {
    const len = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, along = Math.abs(bx - ax) > Math.abs(bz - az);
    m.at(cx, cz);
    m.box("solid", along ? len : T, H, along ? T : len, cx, H / 2, cz, STONE);
    m.box("solid", along ? len : T + 0.9, 1.2, along ? T + 0.9 : len, cx, 0.6, cz, STONE_D);
    m.box("solid", along ? len : T + 0.7, 0.7, along ? T + 0.7 : len, cx, H + 0.3, cz, STONE_D);
    for (let s = 1; s < len - 1; s += 2.2) {
      const px = along ? ax + Math.sign(bx - ax) * s : ax, pz = along ? az : az + Math.sign(bz - az) * s;
      for (const o of [-T / 2 + 0.3, T / 2 - 0.3]) m.box("solid", along ? 1.2 : 0.7, 1.4, along ? 0.7 : 1.2, px + (along ? 0 : o), H + 1.35, pz + (along ? o : 0), STONE_L);
    }
    for (let s = 3; s < len - 4; s += 6) {
      const px = along ? ax + Math.sign(bx - ax) * s : ax + outward * (T / 2 + 0.3), pz = along ? az + outward * (T / 2 + 0.3) : az + Math.sign(bz - az) * s;
      m.box("solid", along ? 1.1 : 0.8, H - 1, along ? 0.8 : 1.1, px, (H - 1) / 2 + 0.6, pz, STONE_D);
      const sx = along ? ax + Math.sign(bx - ax) * (s + 3) : ax + outward * (T / 2 + 0.02), sz = along ? az + outward * (T / 2 + 0.02) : az + Math.sign(bz - az) * (s + 3);
      m.box("solid", along ? 0.28 : 0.1, 1.7, along ? 0.1 : 0.28, sx, 4.6, sz, 0x1a1612);
    }
  };
  wall(x0, z1, -g, z1, 1); wall(g, z1, x1, z1, 1); wall(x0, z0, x1, z0, -1); wall(x0, z0, x0, z1, -1); wall(x1, z0, x1, z1, 1);
  // puerta del castillo
  gatehouse(m, 0, z1, 0, 1, { width: g * 2 + 1.0, height: 13.2, depth: T + 0.7, hole: g * 2 - 0.4, holeH: 8 });
  castleFront(m, z1, T);
  // estandartes largos sobre la muralla sur
  for (const x of [-26, -16, 16, 26]) { m.at(x, z1); m.put("solid", bannerGeo(1.6, 5.2), x < 0 ? 0x2c4a8a : 0xb02a30, x, H - 0.3, z1 + T / 2 + 0.45); }
  // gran salón y pórtico
  greatHall(m, GREAT_HALL);
  hallInterior(m);
  // alas con tejado junto a las murallas
  CASTLE_WINGS.forEach((w, i) => {
    const b: Building = { id: "wing" + i, kind: "house", name: "", x: w.x, z: w.z, w: w.w, d: w.d, h: w.h, floors: 3, wall: w.wall, roof: w.roof, facing: i === 0 ? 3 : 1, style: i === 0 ? "hip" : undefined };
    house(m, b, ctx);
  });
  // torres
  CASTLE_TOWERS.forEach((t, i) => tower(m, t, t.h > 20 || i > 5));
  // pasarelas cubiertas entre torres altas (estilo Hogwarts) con ventanas iluminadas
  const T_ = CASTLE_TOWERS;
  coveredBridge(m, T_[9]!, T_[8]!, 24); coveredBridge(m, T_[7]!, T_[6]!, 38); coveredBridge(m, T_[6]!, T_[8]!, 38); coveredBridge(m, T_[7]!, T_[10]!, 28);
  // viaducto de piedra con arco sobre el acceso al gran salón (entre las dos torres delanteras del patio)
  {
    const a = T_[13]!, b = T_[14]!, len = b.x - a.x - a.r - b.r + 2, cx = (a.x + b.x) / 2, y = 15.4, z = a.z;
    m.at(cx, z);
    m.put("solid", archWallGeo(len, y, 3.0, 13, 11), STONE, cx, 0, z);
    m.box("solid", len + 0.4, 0.5, 3.4, cx, y - 0.1, z, STONE_D);
    m.box("solid", len, 2.7, 2.6, cx, y + 1.4, z, 0x8a6a45);
    const sh = new THREE.Shape(); sh.moveTo(-1.8, 0); sh.lineTo(1.8, 0); sh.lineTo(0, 1.6); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(len + 0.6) / 2); rg.rotateY(Math.PI / 2);
    m.put("solid", rg, 0x3b4350, cx, y + 2.7, z);
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) m.box("glow", 1.1, 1.2, 0.12, cx + (k - 3) * (len / 7.4), y + 1.5, z + s * 1.36, WARM);
  }
  // patio: parterres y braseros (la diosa y su fuente están en la catedral)
  CASTLE_LAWNS.forEach((l, i) => hedgeLawn(m, l, i));
  for (const s of [-1, 1]) { m.at(s * 3.6, z1 + 3); m.cyl("solid", 0.1, 0.1, 1.5, 5, s * (g + 1.4), 0, z1 + 3.4, 0x2a2a2e); m.box("glow", 0.5, 0.35, 0.5, s * (g + 1.4), 1.6, z1 + 3.4, 0xff9a3a); }
  // auténtica puerta del castillo frente al gran salón
  castleGate(m, 0, -74);
  const lab = textSprite("Castillo de " + CITY_NAME, "#ffe9b0", 1.6); lab.position.set(0, 74, -100); labels.add(lab);
}

// ---------- Salón del trono (interior del gran salón) ----------
const GULES = 0x7a2f3a, AZURE = 0x2c4a8a, OR = 0xd9b13b, IRON = 0x2b2b30, OAK = 0x5e3d22, FIRE = 0xff8a3a;
function hallInterior(m: Merge) {
  const G = GREAT_HALL, T = HALL.wallT, F = HALL.frontT;
  const back = G.z - G.d / 2 + T, front = G.z + G.d / 2 - F, sideX = G.w / 2 - T, ceil = G.h + 0.1;
  m.at(G.x, G.z);
  // suelo ajedrezado de piedra
  for (let ix = 0; ix < Math.ceil((sideX * 2) / 2); ix++) for (let iz = 0; iz < Math.ceil((front - back) / 2); iz++) {
    const x0 = G.x - sideX + ix * 2, z0 = back + iz * 2, w = Math.min(2, G.x + sideX - x0), d = Math.min(2, front - z0);
    m.box("solid", w, 0.06, d, x0 + w / 2, 0.03, z0 + d / 2, (ix + iz) % 2 ? 0xa59d8c : 0xcfc8b8);
  }
  // alfombra real desde la puerta hasta la tarima, con orla de oro
  const dais = HALL_PROPS.find(p => p.kind === "dais")!, cz0 = dais.z + dais.d / 2, cz1 = HALL.gateZ + 1.9, cl = cz1 - cz0;
  m.box("solid", 2.8, 0.03, cl, G.x, 0.075, (cz0 + cz1) / 2, GULES);
  for (const s of [-1, 1]) m.box("solid", 0.12, 0.035, cl, G.x + s * 1.3, 0.08, (cz0 + cz1) / 2, OR);
  // zócalo de madera en los muros
  m.box("solid", sideX * 2, 1.5, 0.08, G.x, 0.75, back + 0.04, OAK);
  for (const s of [-1, 1]) {
    m.box("solid", 0.08, 1.5, front - back, G.x + s * (sideX - 0.04), 0.75, (front + back) / 2, OAK);
    const a0 = HALL.door / 2, a1 = sideX; m.box("solid", a1 - a0, 1.5, 0.08, G.x + s * (a0 + a1) / 2, 0.75, front - 0.04, OAK);
  }
  // vigas del techo y tirantes a lo ancho
  for (let x = -sideX + 2; x <= sideX - 2; x += 4.6) m.box("solid", 0.4, 0.5, front - back, G.x + x, ceil - 0.35, (front + back) / 2, OAK);
  for (const z of [-78.4, -82, -85.6]) m.box("solid", sideX * 2, 0.55, 0.45, G.x, ceil - 0.9, z, OAK);

  for (const p of HALL_PROPS) {
    const s = p.side ?? 1;
    if (p.kind === "dais") {
      m.box("solid", p.w, 0.25, p.d, p.x, 0.125, p.z, 0x9a9284); // escalón
      m.box("solid", p.w - 1.2, 0.25, p.d - 1.0, p.x, 0.375, p.z - 0.5, 0xb4ab98);
      m.box("solid", p.w - 1.4, 0.03, p.d - 1.2, p.x, 0.515, p.z - 0.5, GULES); // alfombra de la tarima
      // trono: asiento, respaldo alto con remate dorado, brazos y cojín
      const tz = back + 1.0, y0 = 0.5;
      m.box("solid", 1.4, 0.55, 1.1, p.x, y0 + 0.28, tz, OAK);
      m.box("solid", 1.2, 0.12, 0.95, p.x, y0 + 0.6, tz + 0.05, GULES);
      m.box("solid", 1.5, 3.0, 0.28, p.x, y0 + 1.5, tz - 0.5, OAK);
      m.box("solid", 1.1, 2.1, 0.06, p.x, y0 + 1.7, tz - 0.34, GULES);
      for (const k of [-1, 0, 1]) m.cone("solid", k ? 0.16 : 0.24, k ? 0.5 : 0.8, 4, p.x + k * 0.55, y0 + 3.0, tz - 0.5, OR, Math.PI / 4);
      for (const k of [-1, 1]) { m.box("solid", 0.18, 0.5, 1.1, p.x + k * 0.72, y0 + 0.8, tz, OAK); m.box("solid", 0.22, 0.08, 1.15, p.x + k * 0.72, y0 + 1.06, tz, OR); }
      // dosel y gran estandarte con el escudo real detrás
      m.box("solid", 4.4, 0.3, 2.2, p.x, 6.3, back + 1.1, GULES); m.box("solid", 4.5, 0.12, 2.3, p.x, 6.1, back + 1.1, OR);
      for (let k = -2; k <= 2; k++) m.box("solid", 0.7, 0.5, 0.05, p.x + k * 0.85, 5.85, back + 2.22, k % 2 ? OR : GULES); // flecos
      m.put("solid", bannerGeo(3.4, 9.0), GULES, p.x, ceil - 0.6, back + 0.08);
      m.put("solid", shieldGeo(1.9, 2.1, 0.06), OR, p.x, 7.3, back + 0.15);
      m.put("solid", shieldGeo(1.6, 1.8, 0.06), AZURE, p.x, 7.45, back + 0.2);
      m.put("solid", new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16).rotateX(Math.PI / 2), OR, p.x, 8.5, back + 0.25);
    } else if (p.kind === "pillar") {
      m.box("solid", 1.3, 0.5, 1.3, p.x, 0.25, p.z, STONE_D);
      m.cyl("solid", 0.48, 0.55, p.h - 1.1, 12, p.x, 0.5, p.z, STONE_L);
      m.box("solid", 1.3, 0.6, 1.3, p.x, p.h - 0.3, p.z, STONE_D);
      // estandarte colgado mirando a la alfombra
      const inward = -Math.sign(p.x - G.x);
      m.put("solid", bannerGeo(1.1, 3.6), (Math.round(p.z) + (p.x > 0 ? 1 : 0)) % 2 ? GULES : AZURE, p.x + inward * 0.6, 9.8, p.z, inward * Math.PI / 2);
      m.box("solid", 0.1, 0.4, 0.1, p.x + inward * 0.55, 3.2, p.z, IRON); // antorcha
      m.box("glow", 0.26, 0.3, 0.26, p.x + inward * 0.7, 3.5, p.z, FIRE);
    } else if (p.kind === "table") {
      m.box("solid", p.w, 0.12, 1.3, p.x, 0.84, p.z, OAK);
      for (const a of [-1, 1]) for (const b of [-1, 1]) m.box("solid", 0.14, 0.8, 0.14, p.x + a * (p.w / 2 - 0.4), 0.4, p.z + b * 0.5, 0x4a3018);
      for (const b of [-1, 1]) {
        m.box("solid", p.w - 0.4, 0.1, 0.4, p.x, 0.48, p.z + b * 1.15, OAK);
        for (const a of [-1, 1]) m.box("solid", 0.12, 0.44, 0.34, p.x + a * (p.w / 2 - 0.6), 0.22, p.z + b * 1.15, 0x4a3018);
      }
      m.box("solid", p.w - 0.6, 0.02, 0.5, p.x, 0.91, p.z, 0xe9e2cf); // mantel
      for (let k = 0; k < 7; k++) { // platos, copas y comida
        const x = p.x - p.w / 2 + 0.75 + k * ((p.w - 1.5) / 6);
        for (const b of [-1, 1]) { m.cyl("solid", 0.17, 0.17, 0.03, 8, x, 0.9, p.z + b * 0.4, 0xd8d2c4); m.cyl("solid", 0.04, 0.05, 0.18, 6, x + 0.25, 0.9, p.z + b * 0.35, 0xb08d3a); }
        if (k % 2 === 0) m.put("solid", new THREE.IcosahedronGeometry(0.2, 0), k % 4 ? 0x9a5a2a : 0xc49a5a, x, 1.04, p.z, k);
        if (k % 3 === 1) { m.cyl("solid", 0.035, 0.035, 0.28, 5, x, 0.92, p.z, 0xefe6d0); m.box("glow", 0.05, 0.08, 0.05, x, 1.24, p.z, 0xffd27a); }
      }
    } else if (p.kind === "hearth") {
      const wx = p.x + s * 0.6; // contra el muro
      m.box("solid", p.w, p.h, p.d, p.x, p.h / 2, p.z, STONE); // obra
      m.box("solid", p.w + 0.2, 0.3, p.d + 0.4, p.x - s * 0.1, p.h - 0.6, p.z, STONE_D); // repisa
      m.box("solid", 0.9, ceil - p.h, 2.6, wx - s * 0.45, p.h + (ceil - p.h) / 2, p.z, STONE); // campana hasta el techo
      m.box("solid", 0.1, 1.9, 2.8, p.x - s * (p.w / 2 + 0.01), 1.05, p.z, 0x14100c); // boca
      m.box("glow", 0.1, 0.9, 2.2, p.x - s * (p.w / 2 + 0.03), 0.6, p.z, FIRE);
      m.box("glow", 0.1, 0.5, 1.2, p.x - s * (p.w / 2 + 0.05), 1.2, p.z, 0xffc24d);
      for (const o of [-0.5, 0.5]) m.put("solid", new THREE.CylinderGeometry(0.13, 0.13, 1.3, 6).rotateX(Math.PI / 2), 0x3b2614, p.x - s * (p.w / 2 + 0.25), 0.18, p.z + o * 0.3, o);
      m.put("solid", shieldGeo(0.9, 1.0, 0.06), s > 0 ? GULES : AZURE, p.x - s * (p.w / 2 + 0.03), 2.4, p.z, -s * Math.PI / 2); // escudo sobre la boca
      for (const o of [-1, 1]) m.put("solid", new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4).rotateX(Math.PI / 2 + o * 0.6), 0x9aa0a8, p.x - s * (p.w / 2 + 0.06), 2.9, p.z, -s * Math.PI / 2); // espadas cruzadas
    } else if (p.kind === "armor") {
      const S = 0x9aa0a8;
      m.box("solid", 0.7, 0.12, 0.7, p.x, 0.56, p.z, STONE_D);
      for (const o of [-0.14, 0.14]) m.box("solid", 0.18, 0.75, 0.2, p.x + o, 0.98, p.z, S);
      m.box("solid", 0.6, 0.7, 0.36, p.x, 1.7, p.z, S);
      m.box("solid", 0.78, 0.18, 0.4, p.x, 2.0, p.z, 0x7c838c);
      m.put("solid", new THREE.IcosahedronGeometry(0.2, 1), S, p.x, 2.32, p.z);
      m.box("solid", 0.3, 0.04, 0.05, p.x, 2.32, p.z + 0.19, 0x1a1a1e); // visera
      m.put("solid", shieldGeo(0.55, 0.65, 0.05), s > 0 ? GULES : AZURE, p.x, 1.25, p.z + 0.25);
      m.cyl("solid", 0.03, 0.03, 3.0, 5, p.x - s * 0.45, 0.55, p.z, OAK); m.cone("solid", 0.08, 0.35, 4, p.x - s * 0.45, 3.55, p.z, S);
    }
  }
  // lámparas de corona colgadas del techo
  for (const [x, z] of [[G.x, -80.6], [G.x - 12, -82], [G.x + 12, -82]] as const) {
    m.cyl("solid", 0.03, 0.03, ceil - 8.4, 4, x, 8.4, z, IRON);
    m.put("solid", new THREE.TorusGeometry(1.3, 0.07, 5, 18).rotateX(Math.PI / 2), IRON, x, 8.3, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, cx = x + Math.cos(a) * 1.3, cz = z + Math.sin(a) * 1.3;
      m.cyl("solid", 0.05, 0.05, 0.22, 5, cx, 8.33, cz, 0xefe6d0); m.box("glow", 0.08, 0.13, 0.08, cx, 8.62, cz, 0xffd27a);
    }
  }
  // antorchas en los muros y tapices en la fachada interior
  for (const s of [-1, 1]) {
    for (const z of [-77.6, -86.6]) {
      const x = G.x + s * (sideX - 0.05);
      m.box("solid", 0.4, 0.1, 0.1, x - s * 0.2, 3.3, z, IRON); m.box("glow", 0.25, 0.3, 0.25, x - s * 0.42, 3.6, z, FIRE);
    }
    m.put("solid", bannerGeo(2.4, 6.0), s > 0 ? GULES : AZURE, G.x + s * 7.2, ceil - 2.2, front - 0.08, Math.PI);
    m.put("solid", shieldGeo(1.0, 1.1, 0.05), OR, G.x + s * 7.2, ceil - 5.6, front - 0.13, Math.PI);
  }
}

// ---------- Fachada monumental de la puerta del castillo ----------
/** Caballero guardián de piedra, con la espada clavada delante y apoyado en el pomo. Mira a +z. */
function guardianStatue(m: Merge, x: number, z: number, side: number) {
  const P = 0xcfc8b6, PD = 0xa9a291, y0 = 1.9, S = 1.15;
  m.box("solid", 2.6, 0.5, 2.6, x, 0.25, z, STONE_D); // basa
  m.box("solid", 2.2, 1.2, 2.2, x, 1.1, z, STONE);
  m.box("solid", 2.5, 0.25, 2.5, x, y0 - 0.12, z, STONE_D);
  m.put("solid", shieldGeo(0.9, 1.0, 0.06), side < 0 ? 0x2c4a8a : 0xb02a30, x, 0.6, z + 1.13); // escudo de la casa en la basa
  const b = (w: number, h: number, d: number, ox: number, oy: number, oz: number, c = P, rx = 0) => {
    const g = new THREE.BoxGeometry(w * S, h * S, d * S); if (rx) g.rotateX(rx); m.put("solid", g, c, x + ox * S, y0 + oy * S, z + oz * S);
  };
  for (const s of [-1, 1]) { b(0.42, 1.3, 0.5, s * 0.27, 0.65, 0, PD); b(0.5, 0.25, 0.65, s * 0.27, 0.12, 0.08, PD); } // piernas y escarpes
  b(1.15, 0.5, 0.7, 0, 1.45, 0); // faldar
  b(1.05, 1.15, 0.65, 0, 2.2, 0); // peto
  b(1.5, 0.35, 0.8, 0, 2.75, 0, PD); // hombreras
  b(1.4, 2.2, 0.12, 0, 1.85, -0.42, PD); // capa
  for (const s of [-1, 1]) { b(0.3, 0.9, 0.32, s * 0.6, 2.25, 0.18, P, -0.35); b(0.28, 0.3, 0.3, s * 0.25, 1.82, 0.6, PD); } // brazos hacia el pomo
  m.put("solid", new THREE.CylinderGeometry(0.33 * S, 0.36 * S, 0.6 * S, 8), P, x, y0 + 3.25 * S, z); // yelmo
  m.box("solid", 0.5 * S, 0.06 * S, 0.06 * S, x, y0 + 3.25 * S, z + 0.36 * S, 0x6b665c); // visera
  m.cone("solid", 0.36 * S, 0.35 * S, 8, x, y0 + 3.55 * S, z, P);
  // espadón clavado: hoja, guarda y pomo entre las manos
  m.box("solid", 0.16 * S, 2.0 * S, 0.06 * S, x, y0 + 0.85 * S, z + 0.62 * S, 0xbfc4c9);
  m.box("solid", 0.9 * S, 0.1 * S, 0.14 * S, x, y0 + 1.9 * S, z + 0.62 * S, PD);
  m.box("solid", 0.1 * S, 0.4 * S, 0.1 * S, x, y0 + 2.1 * S, z + 0.62 * S, PD);
}

function castleFront(m: Merge, z1: number, T: number) {
  const g = CASTLE.gateHalf, hole = g * 2 - 0.4, holeH = 8, front = z1 + (T + 0.7) / 2;
  m.at(0, z1);
  // arquivolta moldurada en dos órdenes y clave
  m.put("solid", archWallGeo(hole + 2.2, holeH + 1.6, 0.35, hole, holeH), STONE_L, 0, 0, front + 0.18);
  m.put("solid", archWallGeo(hole + 0.9, holeH + 0.7, 0.3, hole + 0.02, holeH), 0xbab3a3, 0, 0, front + 0.45);
  m.box("solid", 0.8, 1.1, 0.5, 0, holeH + 0.35, front + 0.55, STONE_L);
  // escudo real con corona sobre el arco, en una cartela
  const cy = holeH + 1.7;
  m.box("solid", 2.7, 3.3, 0.25, 0, cy + 1.45, front + 0.2, STONE);
  m.put("solid", shieldGeo(2.1, 2.4, 0.08), 0xd9b13b, 0, cy, front + 0.38);
  m.put("solid", shieldGeo(1.8, 2.1, 0.08), 0x2c4a8a, 0, cy + 0.12, front + 0.44);
  m.box("solid", 0.22, 1.5, 0.06, 0, cy + 1.05, front + 0.5, 0xd9b13b); m.box("solid", 1.2, 0.22, 0.06, 0, cy + 1.4, front + 0.5, 0xd9b13b); // cruz
  m.box("solid", 1.4, 0.3, 0.2, 0, cy + 2.6, front + 0.4, 0xd9b13b); // corona
  for (const k of [-1, 0, 1]) m.cone("solid", 0.16, 0.45, 4, k * 0.5, cy + 2.75, front + 0.4, 0xd9b13b, Math.PI / 4);
  // garitas en las esquinas del cuerpo de la puerta
  for (const s of [-1, 1]) {
    const x = s * (hole / 2 + 1.0), z = front + 0.2, y = 10.6;
    m.cyl("solid", 0.95, 0.15, 1.4, 10, x, y - 1.4, z, STONE_D); // ménsula
    m.cyl("solid", 0.95, 0.95, 2.4, 10, x, y, z, STONE_L);
    m.put("glow", archGeo(0.35, 0.8, 0.1), 0xffc766, x, y + 0.9, z + 0.93, 0);
    m.cyl("solid", 1.15, 1.15, 0.2, 10, x, y + 2.4, z, STONE_D);
    m.cone("solid", 1.2, 2.4, 10, x, y + 2.5, z, 0x2f4a6b);
    m.cyl("solid", 0.04, 0.04, 1.1, 4, x, y + 4.8, z, 0x2a2a2e);
    m.put("solid", pennantGeo(1.0, 0.55), s < 0 ? 0x2c4a8a : 0xb02a30, x, y + 5.6, z);
  }
  // grandes estandartes en las torres de la puerta
  for (const t of CASTLE_TOWERS.slice(4, 6)) {
    const s = Math.sign(t.x), zz = t.z + t.r + 0.15;
    m.box("solid", 3.0, 0.18, 0.18, t.x, 15.0, zz + 0.1, 0x2a2a2e);
    m.put("solid", bannerGeo(2.4, 9.5), s < 0 ? 0x2c4a8a : 0xb02a30, t.x, 14.9, zz + 0.12);
    m.put("solid", shieldGeo(1.2, 1.35, 0.05), 0xd9b13b, t.x, 10.6, zz + 0.2);
  }
  // explanada de losas con orla, hasta las estatuas
  const pz0 = front + 0.5, pz1 = front + 9.5;
  m.box("solid", 22, 0.05, pz1 - pz0, 0, 0.055, (pz0 + pz1) / 2, 0xbdb6a6);
  for (let i = -5; i <= 5; i++) m.box("solid", 0.12, 0.06, pz1 - pz0, i * 2, 0.06, (pz0 + pz1) / 2, 0x9a9384);
  for (let z = pz0 + 1.5; z < pz1; z += 1.5) m.box("solid", 22, 0.06, 0.1, 0, 0.06, z, 0x9a9384);
  m.box("solid", 22.4, 0.08, 0.35, 0, 0.07, pz1, STONE_D);
  m.box("solid", hole - 1.2, 0.07, pz1 - pz0, 0, 0.075, (pz0 + pz1) / 2, 0xd8d1c0); // calle central
  // braseros y estatuas
  for (const b of CASTLE_GATE_DECOR.braziers) {
    m.at(b.x, b.z);
    m.cyl("solid", 0.42, 0.5, 0.3, 8, b.x, 0, b.z, STONE_D);
    m.cyl("solid", 0.14, 0.2, 1.2, 8, b.x, 0.3, b.z, 0x2a2a2e);
    m.cyl("solid", 0.65, 0.3, 0.45, 10, b.x, 1.45, b.z, 0x3a3a3e);
    m.cone("glow", 0.45, 0.8, 7, b.x, 1.8, b.z, 0xff8a3a);
    m.cone("glow", 0.25, 0.65, 6, b.x, 1.95, b.z, 0xffd27a);
  }
  CASTLE_GATE_DECOR.statues.forEach(st => { m.at(st.x, st.z); guardianStatue(m, st.x, st.z, Math.sign(st.x)); });
}
