import * as THREE from "three";

// Fuente monumental de la Plaza Mayor: vaso octogonal hueco, dos tazas, caños con cabeza de león,
// agua que cae en cascada y estatua de bronce de un caballero. Todo procedural.
const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...extra });

export interface Fountain { group: THREE.Group; update(t: number): void }

export function buildFountain(R: number): Fountain {
  const g = new THREE.Group();
  const stone = std(0xb9b5a8), stoneDark = std(0x86827a), stoneLight = std(0xd0ccbf), moss = std(0x5f7d45);
  const bronze = std(0xa9834e, { metalness: 0.65, roughness: 0.45 }), gold = std(0xe2bd55, { metalness: 0.8, roughness: 0.3 });
  const red = std(0x8e2a2a);
  const water = new THREE.MeshStandardMaterial({ color: 0x3f9bd8, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.82, emissive: 0x0e3a5c, emissiveIntensity: 0.6 });
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, emissive: 0x2a6a94, emissiveIntensity: 0.5 });
  const add = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); g.add(o); return o; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat);
  const lathe = (pts: [number, number][], seg: number) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

  // --- Gradas y vaso octogonal hueco ---
  add(mesh(new THREE.CylinderGeometry(R + 1.0, R + 1.1, 0.16, 8), stoneDark), 0, 0.08, 0);
  add(mesh(new THREE.CylinderGeometry(R + 0.55, R + 0.62, 0.16, 8), stone), 0, 0.24, 0);
  add(mesh(lathe([[R + 0.22, 0.3], [R + 0.05, 0.42], [R, 1.0], [R - 0.34, 1.0], [R - 0.34, 0.36], [0, 0.36]], 8), stone));
  const coping = add(mesh(new THREE.TorusGeometry(R - 0.16, 0.24, 4, 8), stoneLight), 0, 1.02, 0); coping.rotation.x = Math.PI / 2; coping.scale.z = 0.5;
  const side = 2 * R * Math.tan(Math.PI / 8), apo = R * Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (Math.PI / 4), c = Math.cos(a), s = Math.sin(a), ry = -(a + Math.PI / 2);
    // panel tallado con rombo
    const panel = add(mesh(new THREE.BoxGeometry(side * 0.72, 0.42, 0.08), stoneDark), c * (apo + 0.03), 0.68, s * (apo + 0.03)); panel.rotation.y = ry;
    const gem = add(mesh(new THREE.OctahedronGeometry(0.16, 0), stoneLight), c * (apo + 0.08), 0.68, s * (apo + 0.08)); gem.rotation.y = ry; gem.scale.z = 0.4;
    // pilastra y remate en cada vértice
    const va = i * (Math.PI / 4), vx = Math.sin(va) * (R + 0.02), vz = Math.cos(va) * (R + 0.02);
    add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.86, 6), stoneLight), vx, 0.73, vz);
    add(mesh(new THREE.IcosahedronGeometry(0.2, 0), i % 2 ? stoneLight : gold), vx, 1.32, vz);
    if (i % 3 === 0) { const m = add(mesh(new THREE.IcosahedronGeometry(0.3, 0), moss), c * (apo + 0.02), 0.4, s * (apo + 0.02)); m.scale.set(1.6, 0.5, 0.5); m.rotation.y = ry; }
  }
  const pool = add(mesh(new THREE.CircleGeometry(R - 0.35, 8), water), 0, 0.84, 0); pool.rotation.x = -Math.PI / 2;
  // monedas en el fondo
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, rr = 1.6 + ((i * 37) % 17) / 17 * (R - 2.3);
    const coin = add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 6), gold), Math.cos(a) * rr, 0.39, Math.sin(a) * rr); coin.rotation.z = (i % 3) * 0.2;
  }

  // --- Cuerpo central: plinto, fuste, taza media con leones, taza alta ---
  add(mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.9, 8), stoneDark), 0, 0.8, 0);
  add(mesh(new THREE.CylinderGeometry(1.1, 1.0, 0.16, 8), stoneLight), 0, 1.3, 0);
  add(mesh(new THREE.CylinderGeometry(0.42, 0.56, 1.7, 8), stone), 0, 2.2, 0);
  for (const y of [1.6, 2.2, 2.8]) add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 8), stoneLight), 0, y, 0);
  const B1 = 2.0, Y1 = 3.0; // taza media
  add(mesh(lathe([[0.4, 0], [1.2, 0.1], [B1 - 0.15, 0.34], [B1, 0.56], [B1 + 0.08, 0.62], [B1 - 0.12, 0.62], [B1 - 0.3, 0.42], [0, 0.3]], 16), stone), 0, Y1, 0);
  const w1 = add(mesh(new THREE.CircleGeometry(B1 - 0.14, 16), water), 0, Y1 + 0.57, 0); w1.rotation.x = -Math.PI / 2;
  const spouts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * (Math.PI / 4) + Math.PI / 8; spouts.push(a);
    const c = Math.cos(a), s = Math.sin(a), ry = -a + Math.PI / 2;
    const lion = add(mesh(new THREE.BoxGeometry(0.34, 0.32, 0.3), bronze), c * (B1 + 0.02), Y1 + 0.36, s * (B1 + 0.02)); lion.rotation.y = ry;
    const mane = add(mesh(new THREE.IcosahedronGeometry(0.24, 0), bronze), c * (B1 - 0.08), Y1 + 0.4, s * (B1 - 0.08)); mane.scale.y = 1.1;
    const muzzle = add(mesh(new THREE.ConeGeometry(0.1, 0.22, 5), gold), c * (B1 + 0.24), Y1 + 0.3, s * (B1 + 0.24)); muzzle.rotation.set(0, ry, 0); muzzle.rotateX(Math.PI / 2);
  }
  add(mesh(new THREE.CylinderGeometry(0.26, 0.38, 1.25, 8), stone), 0, Y1 + 1.1, 0);
  add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 8), stoneLight), 0, Y1 + 0.75, 0);
  const B2 = 1.1, Y2 = 4.6; // taza alta
  add(mesh(lathe([[0.26, 0], [0.7, 0.08], [B2 - 0.1, 0.24], [B2, 0.4], [B2 + 0.06, 0.45], [B2 - 0.1, 0.45], [B2 - 0.22, 0.3], [0, 0.22]], 14), stoneLight), 0, Y2, 0);
  const w2 = add(mesh(new THREE.CircleGeometry(B2 - 0.12, 14), water), 0, Y2 + 0.41, 0); w2.rotation.x = -Math.PI / 2;

  // láminas de agua que rebosan de las tazas
  const sheet = (rTop: number, rBot: number, yTop: number, h: number) => {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true); geo.translate(0, -h / 2, 0);
    return add(mesh(geo, sheetMat), 0, yTop, 0);
  };
  const sheets = [sheet(B2 + 0.05, B2 + 0.3, Y2 + 0.44, Y2 + 0.44 - (Y1 + 0.57)), sheet(0.3, 0.42, Y2 + 0.05, 0.9)];

  // --- Estatua de bronce: caballero con la espada en alto ---
  const st = new THREE.Group(); st.position.y = Y2 + 0.3; g.add(st);
  const sAdd = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); st.add(m); return m;
  };
  sAdd(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 8), stoneDark, 0, 0.18, 0);
  for (const x of [-0.13, 0.13]) { sAdd(new THREE.BoxGeometry(0.17, 0.78, 0.2), bronze, x, 0.74, 0); sAdd(new THREE.BoxGeometry(0.19, 0.12, 0.3), bronze, x, 0.4, 0.05); }
  sAdd(new THREE.BoxGeometry(0.52, 0.2, 0.3), bronze, 0, 1.16, 0); // faldón
  sAdd(new THREE.BoxGeometry(0.5, 0.6, 0.3), bronze, 0, 1.5, 0); // peto
  for (const x of [-0.33, 0.33]) sAdd(new THREE.IcosahedronGeometry(0.16, 0), bronze, x, 1.76, 0);
  sAdd(new THREE.IcosahedronGeometry(0.17, 1), bronze, 0, 2.0, 0); // cabeza
  sAdd(new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6), bronze, 0, 2.02, 0); // yelmo
  sAdd(new THREE.ConeGeometry(0.07, 0.42, 5), red, 0, 2.32, -0.06, -0.5); // penacho
  sAdd(new THREE.BoxGeometry(0.54, 1.0, 0.05), red, 0, 1.22, -0.2, 0.14); // capa
  sAdd(new THREE.BoxGeometry(0.13, 0.62, 0.13), bronze, 0.36, 2.02, 0.02, 0, 0, -0.22); // brazo en alto
  sAdd(new THREE.BoxGeometry(0.3, 0.05, 0.08), gold, 0.44, 2.38, 0.02);
  sAdd(new THREE.BoxGeometry(0.08, 1.35, 0.03), gold, 0.44, 3.08, 0.02); // hoja
  sAdd(new THREE.ConeGeometry(0.056, 0.2, 4), gold, 0.44, 3.85, 0.02);
  sAdd(new THREE.BoxGeometry(0.13, 0.5, 0.13), bronze, -0.36, 1.48, 0.1, -0.5); // brazo del escudo
  sAdd(new THREE.CylinderGeometry(0.34, 0.2, 0.07, 6), red, -0.44, 1.36, 0.3, Math.PI / 2, 0, 0);
  sAdd(new THREE.IcosahedronGeometry(0.09, 0), gold, -0.44, 1.36, 0.36);

  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== sheetMat && m.material !== water) { m.castShadow = true; m.receiveShadow = true; } });

  // --- Agua en movimiento: gotas instanciadas (una sola llamada de dibujo) y ondas ---
  const PER_A = 5, PER_B = 9, NA = 8 * PER_A, NB = 8 * PER_B;
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xd8f1ff, roughness: 0.1, transparent: true, opacity: 0.85, emissive: 0x3b88b8, emissiveIntensity: 0.7 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 5, 4), dropMat, NA + NB);
  drops.frustumCulled = false; g.add(drops);
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const r = mesh(new THREE.RingGeometry(0.86, 1, 18), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.5, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; const a = spouts[i]!; r.position.set(Math.cos(a) * 3.0, 0.86, Math.sin(a) * 3.0); g.add(r); ripples.push(r);
  }
  // resplandor frío del agua
  const glow = new THREE.PointLight(0x8fd0ff, 14, 10, 2); glow.position.set(0, 2.2, 0); g.add(glow);

  const d = new THREE.Object3D();
  return {
    group: g,
    update(t) {
      let k = 0;
      for (let i = 0; i < 8; i++) { // de la taza alta a la media
        const a = i * (Math.PI / 4), c = Math.cos(a), s = Math.sin(a);
        for (let j = 0; j < PER_A; j++, k++) {
          const p = (j / PER_A + t * 0.9 + i * 0.13) % 1, r = B2 + 0.04 + 0.32 * p;
          d.position.set(c * r, Y2 + 0.45 - 1.05 * p * p, s * r); d.scale.set(1, 1.4 + p * 1.6, 1); d.updateMatrix(); drops.setMatrixAt(k, d.matrix);
        }
      }
      for (let i = 0; i < 8; i++) { // de los leones al vaso, en arco
        const a = spouts[i]!, c = Math.cos(a), s = Math.sin(a);
        for (let j = 0; j < PER_B; j++, k++) {
          const p = (j / PER_B + t * 0.75 + i * 0.07) % 1, r = B1 + 0.3 + 0.72 * p;
          d.position.set(c * r, Y1 + 0.3 + 0.55 * p - 3.0 * p * p, s * r); d.scale.set(1, 1.2 + p * 2, 1); d.updateMatrix(); drops.setMatrixAt(k, d.matrix);
        }
        const rp = (t * 0.8 + i * 0.37) % 1, rm = ripples[i]!;
        rm.scale.setScalar(0.15 + rp * 0.75); (rm.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - rp);
      }
      drops.instanceMatrix.needsUpdate = true;
      pool.position.y = 0.84 + Math.sin(t * 1.6) * 0.012;
      sheets[0]!.scale.x = sheets[0]!.scale.z = 1 + Math.sin(t * 5) * 0.012;
      sheetMat.opacity = 0.3 + Math.sin(t * 3.1) * 0.05;
      glow.intensity = 14 + Math.sin(t * 2.3) * 2;
    },
  };
}
