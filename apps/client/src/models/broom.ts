import * as THREE from "three";
import { Geo, blob, tube, xf, tris } from "./steed";

// Escoba voladora del mago. Mira hacia +Z; el jinete se sienta en el origen.
// Una sola malla estática (color por vértice) + farol y amuleto colgando (se balancean) + cerdas sueltas + estela de estrellas.
//
// API: `new Broom()`, `broom.group`, `broom.update(t, speed01, turn = 0)` (t = tiempo absoluto en s; turn en rad/s, + izquierda).
// La estela vive en el espacio local de la escoba (sin estado): no hace falta tocar nada más.
// Informativo: `broom.triangles`, `broom.meshCount`.

type V3 = [number, number, number];
const WOOD = 0x7a5230, WOOD_D = 0x5a3a20, STRAW = 0xcfa64e, STRAW_D = 0xa8803a, ROPE = 0xd9c9a0, BAND = 0x8e2a2a, BRASS = 0xd9b13b;

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
const LAMP = new THREE.MeshBasicMaterial({ vertexColors: true });
const STAR_COLORS = [0xffe9a0, 0xff9ad5, 0x8fe6ff, 0xb9a0ff];
const STAR_MATS = STAR_COLORS.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false }));
const STAR_GEO = new THREE.OctahedronGeometry(0.07, 0).scale(1, 1, 0.45);

let cache: { body: THREE.BufferGeometry; lamp: THREE.BufferGeometry; amulet: THREE.BufferGeometry; strand: THREE.BufferGeometry; tris: number } | null = null;
function build() {
  if (cache) return cache;
  const g = new Geo();
  // palo algo retorcido, con nudos
  const pts: V3[] = [], rr: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const z = -0.95 + i * 0.23, a = i * 0.9;
    pts.push([Math.sin(a) * 0.012, Math.cos(a * 1.3) * 0.012 + (i > 8 ? 0.03 * (i - 8) : 0), z]);
    rr.push(0.04 + 0.006 * Math.sin(i * 2.1) + (i > 8 ? -0.006 * (i - 8) : 0));
  }
  g.add(tube(pts, rr, { seg: 6, tip: 0.5 }), (x, y, z) => (Math.sin(z * 14 + x * 30) > 0.55 ? WOOD_D : WOOD));
  for (const z of [-0.5, 0.15, 0.7]) g.add(blob(0.055, 0.05, 0.05, 0, 0.005, z, [0, 0, 0.3], 0), WOOD_D);
  // empuñadura de cuero rojo y remate del palo
  g.add(tube([[0, 0.005, 0.3], [0, 0.005, 0.5]], [0.05, 0.05], { seg: 6, tip: 0 }), BAND);
  g.add(blob(0.06, 0.06, 0.06, 0, 0.04, 1.36, [0, 0, 0], 0), BRASS);
  // cerdas: haz abanicado y curvado, atado con cuerdas
  const bz = -0.9;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + (k % 2) * 0.2, r = 0.2 + (k % 3) * 0.04, L = 0.85 + (k % 4) * 0.07;
    const cx = Math.cos(a), cy = Math.sin(a);
    g.add(tube([[0, 0, bz + 0.04], [cx * 0.04, cy * 0.04, bz - 0.2], [cx * r * 0.8, cy * r * 0.8 - 0.02, bz - 0.5], [cx * r * 1.1, cy * r * 1.1 - 0.06, bz - L * 0.95]], [0.05, 0.06, 0.05, 0.012], { seg: 4, flat: 0.7, tip: 0.5 }), k % 2 ? STRAW : STRAW_D);
  }
  g.add(tube([[0, 0, bz + 0.1], [0, 0, bz - 0.25]], [0.075, 0.1], { seg: 8, tip: 0 }), STRAW_D);
  for (const [z, r] of [[-0.86, 0.07], [-0.96, 0.095], [-1.06, 0.12]] as const) g.add(xf(new THREE.TorusGeometry(r, 0.016, 3, 9), 0, 0, z, 0, 0, 0), ROPE);
  g.add(blob(0.03, 0.03, 0.05, 0.08, -0.03, -1.1, [0, 0, 0], 0), BAND); g.add(blob(0.03, 0.03, 0.05, 0.06, -0.12, -1.12, [0, 0, 0], 0), BAND); // cabos del nudo
  // farol: se cuelga con cuerda de la altura del nudo delantero
  const lamp = new Geo();
  lamp.add(tube([[0, 0, 0], [0, -0.1, 0]], [0.012, 0.012], { seg: 3, tip: 0 }), ROPE);
  lamp.add(tube([[0, -0.1, 0], [0, -0.13, 0]], [0.05, 0.045], { seg: 6, tip: 0 }), BRASS);
  lamp.add(blob(0.045, 0.055, 0.045, 0, -0.18, 0, [0, 0, 0], 1), 0xffd36a);
  lamp.add(tube([[0, -0.23, 0], [0, -0.25, 0]], [0.045, 0.02], { seg: 6, tip: 0 }), BRASS);
  const amu = new Geo();
  amu.add(tube([[0, 0, 0], [0, -0.14, 0]], [0.008, 0.008], { seg: 3, tip: 0 }), ROPE);
  amu.add(blob(0.05, 0.075, 0.03, 0, -0.2, 0, [0, 0, 0], 0), 0x9fd8ff);
  amu.add(blob(0.02, 0.02, 0.02, 0, -0.12, 0, [0, 0, 0], 0), BRASS);
  const strand = new Geo();
  strand.add(tube([[0, 0, 0], [0, -0.05, -0.2], [0, -0.14, -0.4]], [0.03, 0.026, 0.008], { seg: 4, flat: 0.6, tip: 0.6 }), STRAW);
  const body = g.build(), l = lamp.build(), a = amu.build(), s = strand.build();
  cache = { body, lamp: l, amulet: a, strand: s, tris: tris(body) + tris(l) + tris(a) + tris(s) * 3 };
  return cache;
}

export class Broom {
  readonly group = new THREE.Group();
  readonly triangles: number;
  readonly meshCount: number;
  private stars: { m: THREE.Mesh; i: number }[] = [];
  private lamp = new THREE.Group();
  private amulet = new THREE.Group();
  private strands: THREE.Mesh[] = [];
  private sway = 0;
  private lastT = 0;

  constructor() {
    const b = build();
    const body = new THREE.Mesh(b.body, MAT); body.castShadow = true; this.group.add(body);
    this.lamp.position.set(0.045, -0.02, 1.0); this.group.add(this.lamp);
    const lm = new THREE.Mesh(b.lamp, LAMP); this.lamp.add(lm);
    this.amulet.position.set(-0.04, -0.02, -0.7); this.group.add(this.amulet);
    this.amulet.add(new THREE.Mesh(b.amulet, LAMP));
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(b.strand, MAT); const a = i * 2.1 + 0.5;
      s.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, -1.7); this.group.add(s); this.strands.push(s);
    }
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(STAR_GEO, STAR_MATS[i % STAR_MATS.length]!); m.frustumCulled = false; this.group.add(m); this.stars.push({ m, i }); }
    this.triangles = b.tris; this.meshCount = 2 + 3 + this.stars.length;
  }

  /** `t`: tiempo absoluto (s). `speed01`: 0 parado, 1 a toda velocidad. `turn`: rad/s, positivo a la izquierda. */
  update(t: number, speed01: number, turn = 0) {
    const dt = clamp01(Math.abs(t - this.lastT), 0.1); this.lastT = t;
    this.sway += (turn - this.sway) * Math.min(1, dt * 6);
    const sp = speed01;
    // farol y amuleto: péndulos que se echan atrás con la velocidad y hacia fuera en las curvas
    this.lamp.rotation.x = -0.25 * sp + Math.sin(t * 2.3) * 0.08;
    this.lamp.rotation.z = -this.sway * 0.12 + Math.sin(t * 1.9 + 1) * 0.09;
    this.amulet.rotation.x = 0.3 * sp + Math.sin(t * 2.9 + 2) * 0.1;
    this.amulet.rotation.z = -this.sway * 0.14 + Math.sin(t * 2.2) * 0.1;
    this.strands.forEach((s, i) => { s.rotation.x = Math.sin(t * (5 + i) + i) * 0.08 * (0.3 + sp); s.rotation.y = Math.sin(t * 3.1 + i * 2) * 0.15 * (0.3 + sp) - this.sway * 0.05; });
    // estela de estrellas de colores tras las cerdas, que se abre y alarga con la velocidad
    const n = this.stars.length;
    for (const { m, i } of this.stars) {
      const p = (t * (0.9 + sp * 0.8) + i / n) % 1, a = i * 2.4 + t * 1.3, spread = 0.1 + 0.28 * p;
      m.position.set(Math.sin(a) * spread - this.sway * 0.05 * p, Math.cos(a * 1.3) * spread * 0.8 - p * 0.3, -1.85 - p * (0.8 + sp * 3.2));
      m.scale.setScalar((1 - p) * (0.55 + sp * 0.8) * (0.7 + 0.3 * Math.sin(t * 9 + i * 3)));
      m.rotation.set(t * 2 + i, t * 3 + i * 2, t * 4);
    }
    this.group.rotation.z = Math.sin(t * 1.7) * 0.03 - clamp01(-this.sway * 0.04, 0.2, true);
  }
}
function clamp01(x: number, m: number, signed = false) { return signed ? Math.max(-m, Math.min(m, x)) : Math.min(x, m); }
