import * as THREE from "three";
import { GATHER_NODES, RARITIES, type GatherKind, type GatherNode } from "@mmorpg/shared";

// Puntos de recolección: vetas de mineral, matas de hierbas y bancos de peces.
// Todo instanciado (pocas llamadas de dibujo). Un punto agotado pierde lo que se recoge y lo recupera al volver.
// Los de tu oficio llevan destellos para encontrarlos.

const dummy = new THREE.Object3D();
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, nodes: GatherNode[], place: (n: GatherNode, i: number, o: THREE.Object3D) => void, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, nodes.length);
  nodes.forEach((n, i) => { dummy.position.set(n.x, 0, n.z); dummy.rotation.set(0, hash(n.id) * 6.28, 0); dummy.scale.setScalar(1); place(n, i, dummy); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
  im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
  return im;
}

export function createGatherNodes(scene: THREE.Scene) {
  const root = new THREE.Group(); scene.add(root);
  const ores = GATHER_NODES.filter(n => n.kind === "ore"), herbs = GATHER_NODES.filter(n => n.kind === "herb"), fish = GATHER_NODES.filter(n => n.kind === "fish");
  const flat = (hex: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.9, ...extra });

  // --- vetas: roca grande y cristales de hierro (los cristales desaparecen al agotarla) ---
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 0); rockGeo.scale(1.25, 0.8, 1.05); rockGeo.translate(0, 0.45, 0);
  const rocks = instanced(rockGeo, flat(0x6f6a62), ores, (n, _i, o) => o.scale.setScalar(0.95 + hash(n.id + 3) * 0.35));
  const crystalGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.OctahedronGeometry(0.22 + (k % 3) * 0.06, 0); g.scale(1, 1.7, 1);
      const a = (k / 6) * Math.PI * 2;
      g.rotateZ((k % 2 ? 1 : -1) * 0.5); g.translate(Math.cos(a) * 0.85, 0.55 + (k % 3) * 0.18, Math.sin(a) * 0.65);
      parts.push(g.toNonIndexed());
    }
    const pos: number[] = []; for (const p of parts) pos.push(...(p.attributes.position!.array as Float32Array));
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  })();
  const crystals = instanced(crystalGeo, flat(0xffffff, { emissive: 0x2a2a2a, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 }) /* color por instancia: hierro o rareza */, ores, (n, _i, o) => o.scale.setScalar(0.95 + hash(n.id + 3) * 0.35), false);

  // --- matas: arbusto bajo y flores/bayas (las flores desaparecen al recogerla) ---
  const bushGeo = new THREE.IcosahedronGeometry(0.75, 1); bushGeo.scale(1.2, 0.7, 1.2); bushGeo.translate(0, 0.42, 0);
  const bushes = instanced(bushGeo, flat(0x3f7a34), herbs, () => {});
  const bloomGeo = (() => {
    const pos: number[] = [];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = 0.35 + (k % 3) * 0.22, g = new THREE.IcosahedronGeometry(0.11, 0).toNonIndexed();
      g.translate(Math.cos(a) * r, 0.78 + (k % 2) * 0.12, Math.sin(a) * r);
      pos.push(...(g.attributes.position!.array as Float32Array));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  })();
  const blooms = instanced(bloomGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.6 }), herbs, () => {}, false);
  const bloomColors = [0xd94f6a, 0xf2c14e, 0x8a6ad8, 0xe8e2f0];
  herbs.forEach((n, i) => blooms.setColorAt(i, new THREE.Color(bloomColors[n.id % bloomColors.length]!)));

  // --- bancos de peces: anillos de ondas en el agua (se apagan al agotarlo) ---
  const rippleGeo = new THREE.RingGeometry(0.5, 0.78, 28).rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.7, depthWrite: false });
  const RINGS = 3;
  const ripples = new THREE.InstancedMesh(rippleGeo, rippleMat, fish.length * RINGS); ripples.renderOrder = 4;
  const finGeo = new THREE.ConeGeometry(0.12, 0.35, 4).rotateX(Math.PI / 2);
  const fins = new THREE.InstancedMesh(finGeo, new THREE.MeshStandardMaterial({ color: 0x40607a, flatShading: true }), fish.length);

  for (const m of [rocks, crystals, bushes, blooms, ripples, fins]) root.add(m);

  // --- destellos sobre los puntos de tu oficio ---
  const sparkTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,248,220,1)"); gr.addColorStop(0.25, "rgba(255,226,140,.8)"); gr.addColorStop(1, "rgba(255,210,100,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const SPARKS = 3;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(GATHER_NODES.length * SPARKS * 3);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: sparkTex, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0b0 }));
  sparks.frustumCulled = false; sparks.renderOrder = 15; root.add(sparks);

  // --- puntos ricos: nube de destellos del color de su rareza (la ven todos) ---
  const RICH_SPARKS = 7;
  const richGeo = new THREE.BufferGeometry();
  const richPos = new Float32Array(GATHER_NODES.length * RICH_SPARKS * 3), richCol = new Float32Array(GATHER_NODES.length * RICH_SPARKS * 3);
  richGeo.setAttribute("position", new THREE.BufferAttribute(richPos, 3)); richGeo.setAttribute("color", new THREE.BufferAttribute(richCol, 3));
  const richPts = new THREE.Points(richGeo, new THREE.PointsMaterial({ map: sparkTex, size: 0.8, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  richPts.frustumCulled = false; richPts.renderOrder = 15; root.add(richPts);
  let rich = new Map<number, number>(), richDirty = true;
  const tmpC = new THREE.Color();

  let down = new Set<number>(), dirty = true, myKind: GatherKind | undefined;
  const indexOf = new Map<number, number>(); // id del punto -> índice dentro de su malla
  for (const list of [ores, herbs, fish]) list.forEach((n, i) => indexOf.set(n.id, i));
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  function applyDown() {
    for (const [list, mesh, shrink] of [[ores, crystals, true], [herbs, blooms, true]] as const) {
      list.forEach((n, i) => {
        if (down.has(n.id) && shrink) mesh.setMatrixAt(i, hide);
        else { dummy.position.set(n.x, 0, n.z); dummy.rotation.set(0, hash(n.id) * 6.28, 0); dummy.scale.setScalar(n.kind === "ore" ? 0.95 + hash(n.id + 3) * 0.35 : 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    // los cristales de una veta rica toman el color de su rareza
    ores.forEach((n, i) => crystals.setColorAt(i, tmpC.setHex(rich.get(n.id) ? RARITIES[rich.get(n.id)!]!.color : 0xc8743a)));
    if (crystals.instanceColor) crystals.instanceColor.needsUpdate = true;
    // una veta agotada se ve más apagada; una mata, mustia
    ores.forEach((n, i) => rocks.setColorAt(i, new THREE.Color(down.has(n.id) ? 0xa8a49c : 0xffffff)));
    herbs.forEach((n, i) => bushes.setColorAt(i, new THREE.Color(down.has(n.id) ? 0x8a8a5a : 0xffffff)));
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  }

  applyDown(); dirty = false; // crea los colores por instancia antes del primer dibujado

  return {
    nodes: GATHER_NODES,
    /** Puntos agotados según el servidor. */
    setDown(ids: number[] | undefined) {
      const next = new Set(ids ?? []);
      if (next.size === down.size && [...next].every(i => down.has(i))) return;
      down = next; dirty = true;
    },
    isDown(id: number) { return down.has(id); },
    /** Puntos ricos según el servidor: pares [id, riqueza 1..3] aplanados. */
    setRich(pairs: number[] | undefined) {
      const next = new Map<number, number>(); for (let i = 0; pairs && i < pairs.length; i += 2) next.set(pairs[i]!, pairs[i + 1]!);
      if (next.size === rich.size && [...next].every(([k, v]) => rich.get(k) === v)) return;
      rich = next; richDirty = true; dirty = true;
    },
    richOf(id: number) { return rich.get(id) ?? 0; },
    /** Tipo de recurso de tu oficio (para los destellos). */
    setMine(kind: GatherKind | undefined) { myKind = kind; },
    update(t: number) {
      if (dirty) { applyDown(); dirty = false; }
      // ondas y aletas de los bancos de peces
      fish.forEach((n, i) => {
        const off = down.has(n.id);
        for (let k = 0; k < RINGS; k++) {
          const ph = (t * 0.45 + k / RINGS + hash(n.id) ) % 1;
          dummy.position.set(n.x + Math.sin(n.id + k) * 0.4, 0.075, n.z + Math.cos(n.id * 2 + k) * 0.4); dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(off ? 0 : 0.6 + ph * 2.2); dummy.updateMatrix(); ripples.setMatrixAt(i * RINGS + k, dummy.matrix);
        }
        const a = t * 0.9 + n.id;
        dummy.position.set(n.x + Math.cos(a) * 1.3, 0.1, n.z + Math.sin(a) * 1.3); dummy.rotation.set(0, -a, 0);
        dummy.scale.setScalar(off || Math.sin(t * 1.3 + n.id) < 0 ? 0 : 1); dummy.updateMatrix(); fins.setMatrixAt(i, dummy.matrix);
      });
      ripples.instanceMatrix.needsUpdate = true; fins.instanceMatrix.needsUpdate = true;
      rippleMat.opacity = 0.62 + Math.sin(t * 2) * 0.1;
      // destellos: solo en los puntos disponibles de tu oficio
      let k = 0;
      for (const n of GATHER_NODES) {
        const on = n.kind === myKind && !down.has(n.id);
        for (let s = 0; s < SPARKS; s++, k++) {
          const ph = t * 0.8 + s * 2.1 + n.id, r = n.kind === "fish" ? 1.4 : 0.9;
          sparkPos[k * 3] = on ? n.x + Math.cos(ph) * r : 0;
          sparkPos[k * 3 + 1] = on ? (n.kind === "fish" ? 0.5 : 1.2) + Math.sin(ph * 1.7) * 0.35 : -100;
          sparkPos[k * 3 + 2] = on ? n.z + Math.sin(ph) * r : 0;
        }
      }
      sparkGeo.attributes.position!.needsUpdate = true;
      // puntos ricos: destellos que suben en espiral con el color de su rareza
      let j = 0;
      for (const n of GATHER_NODES) {
        const lv = down.has(n.id) ? 0 : rich.get(n.id) ?? 0;
        if (richDirty) tmpC.setHex(lv ? RARITIES[lv]!.color : 0);
        for (let s = 0; s < RICH_SPARKS; s++, j++) {
          const ph = ((t * 0.35 + s / RICH_SPARKS + n.id * 0.13) % 1), a = ph * 9 + s * 0.9 + n.id, r = (n.kind === "fish" ? 1.6 : 1.1) * (1 - ph * 0.4);
          richPos[j * 3] = lv ? n.x + Math.cos(a) * r : 0; richPos[j * 3 + 1] = lv ? 0.2 + ph * 2.6 : -100; richPos[j * 3 + 2] = lv ? n.z + Math.sin(a) * r : 0;
          if (richDirty) { richCol[j * 3] = tmpC.r; richCol[j * 3 + 1] = tmpC.g; richCol[j * 3 + 2] = tmpC.b; }
        }
      }
      richGeo.attributes.position!.needsUpdate = true;
      if (richDirty) { richGeo.attributes.color!.needsUpdate = true; richDirty = false; }
    },
  };
}
