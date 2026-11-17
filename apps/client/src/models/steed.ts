import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MountId } from "@mmorpg/shared";

// Monturas de tierra procedurales (low-poly plano, sin assets): caballo, corcel sagrado, cabra montesa y pantera.
// Miran hacia +Z; el origen está en el suelo.
//
// API
//   new Steed(id)            id: "horse" | "warhorse" | "goat" | "panther"
//   steed.group              añadir al grupo del personaje (gira con él)
//   steed.seat               altura (ya escalada) de la superficie del asiento de la silla
//   steed.bob                desplazamiento vertical del lomo en este fotograma (ya escalado, puede ser negativo)
//   steed.update(dt, speed, turn = 0)
//                            speed: m/s sobre el suelo (0 parado, ~14 a tope); turn: rad/s, positivo a la izquierda.
//                            Paso (< ~3 m/s), trote (~5-7) y galope / carrera a saltos (> ~9), mezclados con suavidad.
//   steed.roll               alabeo actual (rad) por si se quiere inclinar también al jinete (opcional)
//   steed.fx                 polvo, chispas de luz (corcel) y jirones de sombra (pantera). Viven en coordenadas de
//                            MUNDO. No hace falta tocar nada: el primer update() lo cuelga solo de la raíz de la escena
//                            (sube por group.parent hasta una Scene). Si prefieres controlarlo, haz scene.add(steed.fx)
//                            tú mismo antes de llamar a update (si ya tiene padre, no lo toca). Sus partículas se
//                            simulan solas aunque la montura deje de actualizarse (p. ej. oculta al desmontar).
//   steed.dispose()          quita fx de la escena (llamar si se destruye la montura; la geometría es compartida/cacheada).
//
// Diseño de la silla: el jinete va SENTADO (Sit_Chair_Idle) con los muslos hacia delante y los pies colgando delante
// de la silla. Por eso la silla va retrasada sobre el lomo, la perilla es baja, la cruz y los hombros quedan por debajo
// del asiento y el cuello arranca más adelante y más abajo: delante de la silla, a la altura del asiento, no hay volumen.

type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);
const C = new THREE.Color();
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const frac = (x: number) => x - Math.floor(x);

// ---------------------------------------------------------------------------------------------------------------
// Kit de geometría: todo se acumula con color por vértice y se fusiona por pieza animada.
// ---------------------------------------------------------------------------------------------------------------
type Paint = number | ((x: number, y: number, z: number) => number);
export class Geo {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, paint: Paint) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const pos = ng.attributes.position!, col = new Float32Array(pos.count * 3);
    let last = -1;
    for (let i = 0; i < pos.count; i++) {
      if (typeof paint === "number") { if (last !== paint) { C.setHex(paint); last = paint; } }
      else C.setHex(paint(pos.getX(i), pos.getY(i), pos.getZ(i)));
      col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b;
    }
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(ng);
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    this.parts.forEach(p => p.dispose()); this.parts = [];
    return g;
  }
  get empty() { return this.parts.length === 0; }
}
export const tris = (g: THREE.BufferGeometry) => g.attributes.position!.count / 3;

export function xf(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z); return g;
}
export const blob = (rx: number, ry: number, rz: number, x: number, y: number, z: number, rot: V3 = [0, 0, 0], detail = 1) => {
  const g = new THREE.IcosahedronGeometry(1, detail); g.scale(rx, ry, rz); return xf(g, x, y, z, rot[0], rot[1], rot[2]);
};

function fromTris(list: THREE.Vector3[]) {
  const arr = new Float32Array(list.length * 3);
  list.forEach((v, i) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3)); g.computeVertexNormals(); return g;
}

/** Tubo con radio variable a lo largo de una polilínea. `flat` aplasta la sección; `tip` alarga la punta (0 = tapa plana). */
export function tube(pts: V3[], rr: number[], o: { seg?: number; flat?: number; tip?: number; start?: boolean } = {}) {
  const seg = o.seg ?? 6, flat = o.flat ?? 1, tip = o.tip ?? 0.8;
  const P = pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), n = P.length;
  const T = P.map((_, i) => P[Math.min(n - 1, i + 1)]!.clone().sub(P[Math.max(0, i - 1)]!).normalize());
  let N = Math.abs(T[0]!.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < n; i++) {
    const t = T[i]!; N = N.clone().sub(t.clone().multiplyScalar(N.dot(t))).normalize();
    const B = new THREE.Vector3().crossVectors(t, N), r = rr[i]!, ring: THREE.Vector3[] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      ring.push(P[i]!.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * flat));
    }
    rings.push(ring);
  }
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg, a = rings[i]![k]!, b = rings[i]![k2]!, c = rings[i + 1]![k2]!, d = rings[i + 1]![k]!;
    out.push(a, b, c, a, c, d);
  }
  const last = rings[n - 1]!, apex = P[n - 1]!.clone().addScaledVector(T[n - 1]!, rr[n - 1]! * tip);
  for (let k = 0; k < seg; k++) out.push(last[k]!, last[(k + 1) % seg]!, apex);
  if (o.start) { const first = rings[0]!; for (let k = 0; k < seg; k++) out.push(P[0]!, first[(k + 1) % seg]!, first[k]!); }
  return fromTris(out);
}

/** Malla de cuadrículas (tela, cuero): filas × columnas de puntos. Se pinta a doble cara. */
function patch(rows: V3[][]) {
  const out: THREE.Vector3[] = [], v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < rows[i]!.length - 1; j++) {
    const a = v(rows[i]![j]!), b = v(rows[i]![j + 1]!), c = v(rows[i + 1]![j + 1]!), d = v(rows[i + 1]![j]!);
    out.push(a, b, c, a, c, d);
  }
  return fromTris(out);
}
/** Losa: superficie con grosor (arriba, abajo y bordes). */
function slab(rows: V3[][], thick: number, paint: Geo, color: Paint) {
  const down = rows.map(r => r.map(p => [p[0], p[1] - thick, p[2]] as V3));
  paint.add(patch(rows), color); paint.add(patch(down), color);
  const last = rows.length - 1, lc = rows[0]!.length - 1;
  paint.add(patch([rows[0]!, down[0]!]), color); paint.add(patch([rows[last]!, down[last]!]), color);
  paint.add(patch(rows.map((r, i) => [r[0]!, down[i]![0]!])), color); paint.add(patch(rows.map((r, i) => [r[lc]!, down[i]![lc]!])), color);
}

// --- torso: sucesión de secciones elípticas -------------------------------------------------------------
interface St { z: number; top: number; bot: number; hw: number }
const SEG = 10;
function stAt(sts: St[], z: number): St {
  if (z <= sts[0]!.z) return sts[0]!;
  for (let i = 0; i < sts.length - 1; i++) {
    const a = sts[i]!, b = sts[i + 1]!;
    if (z <= b.z) { const t = (z - a.z) / (b.z - a.z); return { z, top: a.top + (b.top - a.top) * t, bot: a.bot + (b.bot - a.bot) * t, hw: a.hw + (b.hw - a.hw) * t }; }
  }
  return sts[sts.length - 1]!;
}
/** Punto de la superficie (th = ángulo desde el lomo, en radianes; positivo hacia -x). `off` lo separa de la piel. */
function ringPt(a: St, th: number, off = 0): V3 {
  const cy = (a.top + a.bot) / 2, h = (a.top - a.bot) / 2;
  return [-(a.hw + off) * Math.sin(th), cy + (h + off) * Math.cos(th), a.z];
}
function loft(sts: St[]) {
  const rings = sts.map(s => Array.from({ length: SEG }, (_, k) => { const p = ringPt(s, (k / SEG) * Math.PI * 2); return new THREE.Vector3(p[0], p[1], p[2]); }));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < sts.length - 1; i++) for (let k = 0; k < SEG; k++) {
    const k2 = (k + 1) % SEG, a = rings[i]![k]!, b = rings[i]![k2]!, c = rings[i + 1]![k2]!, d = rings[i + 1]![k]!;
    out.push(a, b, c, a, c, d);
  }
  const first = rings[0]!, last = rings[rings.length - 1]!;
  const c0 = new THREE.Vector3(0, (sts[0]!.top + sts[0]!.bot) / 2, sts[0]!.z - 0.03), c1 = new THREE.Vector3(0, (sts[sts.length - 1]!.top + sts[sts.length - 1]!.bot) / 2, sts[sts.length - 1]!.z + 0.03);
  for (let k = 0; k < SEG; k++) { const k2 = (k + 1) % SEG; out.push(last[k]!, last[k2]!, c1, first[k2]!, first[k]!, c0); }
  return fromTris(out);
}
/** Filas de puntos sobre la piel entre z0..z1 y ángulos t0..t1 (grados). */
function skin(sts: St[], z0: number, z1: number, nz: number, t0: number, t1: number, nt: number, off: number): V3[][] {
  const rows: V3[][] = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + ((z1 - z0) * i) / nz, s = stAt(sts, z), row: V3[] = [];
    for (let j = 0; j <= nt; j++) row.push(ringPt(s, rad(t0 + ((t1 - t0) * j) / nt), off));
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Descripción de cada montura
// ---------------------------------------------------------------------------------------------------------------
type Shape = "horse" | "goat" | "panther";
type Id = Exclude<MountId, "broom">;
interface Pal {
  coat: number; coatD: number; belly: number; mane: number; hoof: number;
  cloth: number; trim: number; leather: number; eye?: number; holy?: boolean; horn?: number;
}
const KINDS: Record<Id, { shape: Shape; size: number; pal: Pal }> = {
  horse: { shape: "horse", size: 1.45, pal: { coat: 0x8a5431, coatD: 0x5e3a22, belly: 0xa06a40, mane: 0x2a1c14, hoof: 0x2a2420, cloth: 0x9b2f3d, trim: 0xd9b13b, leather: 0x5a3a22 } },
  warhorse: { shape: "horse", size: 1.5, pal: { coat: 0xf6f3ec, coatD: 0xd9d3c6, belly: 0xece6da, mane: 0xffd878, hoof: 0xb8974a, cloth: 0x1840b8, trim: 0xe6c25a, leather: 0xc9a24a, holy: true } },
  goat: { shape: "goat", size: 1.45, pal: { coat: 0xb89a74, coatD: 0x7d6246, belly: 0xe2d6bf, mane: 0xeadfc8, hoof: 0x2e251d, cloth: 0x6b4a2e, trim: 0x9b2f3d, leather: 0x4a3322, horn: 0xdcd0b4 } },
  panther: { shape: "panther", size: 1.45, pal: { coat: 0x2b2833, coatD: 0x1a1820, belly: 0x3a3544, mane: 0x1a1820, hoof: 0x14121a, cloth: 0x4a2f5a, trim: 0x8a8f99, leather: 0x2e2620, eye: 0xb48aff } },
};

const STS: Record<Shape, St[]> = {
  horse: [
    { z: -0.98, top: 1.36, bot: 1.12, hw: 0.15 }, { z: -0.78, top: 1.50, bot: 0.98, hw: 0.27 }, { z: -0.45, top: 1.52, bot: 0.86, hw: 0.35 },
    { z: -0.10, top: 1.48, bot: 0.78, hw: 0.34 }, { z: 0.30, top: 1.46, bot: 0.74, hw: 0.34 }, { z: 0.62, top: 1.40, bot: 0.77, hw: 0.32 }, { z: 0.92, top: 1.25, bot: 0.87, hw: 0.23 },
  ],
  goat: [
    { z: -0.62, top: 0.98, bot: 0.78, hw: 0.14 }, { z: -0.42, top: 1.10, bot: 0.66, hw: 0.27 }, { z: -0.10, top: 1.10, bot: 0.58, hw: 0.29 },
    { z: 0.22, top: 1.04, bot: 0.56, hw: 0.28 }, { z: 0.50, top: 0.98, bot: 0.60, hw: 0.25 }, { z: 0.70, top: 0.90, bot: 0.70, hw: 0.16 },
  ],
  panther: [
    { z: -0.95, top: 0.60, bot: 0.50, hw: 0.08 }, { z: -0.70, top: 0.86, bot: 0.60, hw: 0.20 }, { z: -0.35, top: 0.88, bot: 0.54, hw: 0.22 },
    { z: 0.00, top: 0.84, bot: 0.50, hw: 0.20 }, { z: 0.38, top: 0.84, bot: 0.46, hw: 0.26 }, { z: 0.70, top: 0.78, bot: 0.50, hw: 0.22 }, { z: 0.95, top: 0.68, bot: 0.56, hw: 0.14 },
  ],
};

interface LegSpec {
  pivotY: number; x: number; z: number; up: V3; low: V3; pas: V3; r: [number, number, number, number]; hoofH: number;
  muscle: [number, number, number, number, number, number]; paw?: boolean;
}
const LEGS: Record<Shape, { front: LegSpec; hind: LegSpec }> = {
  horse: {
    front: { pivotY: 1.06, x: 0.2, z: 0.58, up: [0, -0.36, 0], low: [0, -0.38, 0], pas: [0, -0.19, 0.07], r: [0.13, 0.085, 0.065, 0.08], hoofH: 0.13, muscle: [0.1, 0.15, 0.12, 0, -0.08, 0] },
    hind: { pivotY: 1.06, x: 0.22, z: -0.62, up: [0, -0.37, -0.08], low: [0, -0.36, 0.06], pas: [0, -0.2, 0.05], r: [0.16, 0.085, 0.065, 0.08], hoofH: 0.13, muscle: [0.12, 0.2, 0.16, 0, -0.1, 0] },
  },
  goat: {
    front: { pivotY: 0.76, x: 0.15, z: 0.45, up: [0, -0.27, 0], low: [0, -0.29, 0], pas: [0, -0.1, 0.03], r: [0.09, 0.055, 0.045, 0.05], hoofH: 0.1, muscle: [0.08, 0.12, 0.1, 0, -0.05, 0] },
    hind: { pivotY: 0.76, x: 0.16, z: -0.4, up: [0, -0.26, -0.06], low: [0, -0.28, 0.05], pas: [0, -0.12, 0.03], r: [0.11, 0.055, 0.045, 0.05], hoofH: 0.1, muscle: [0.09, 0.14, 0.11, 0, -0.06, 0] },
  },
  panther: {
    front: { pivotY: 0.64, x: 0.17, z: 0.42, up: [0, -0.22, 0], low: [0, -0.26, 0], pas: [0, -0.06, 0.05], r: [0.11, 0.07, 0.06, 0.06], hoofH: 0, paw: true, muscle: [0.09, 0.15, 0.13, 0, 0.07, 0] },
    hind: { pivotY: 0.64, x: 0.17, z: -0.62, up: [0, -0.24, -0.07], low: [0, -0.24, 0.07], pas: [0, -0.06, 0.05], r: [0.13, 0.065, 0.055, 0.055], hoofH: 0, paw: true, muscle: [0.1, 0.17, 0.14, 0, -0.05, 0] },
  },
};

interface Rig {
  body: THREE.BufferGeometry; bodyGlow: THREE.BufferGeometry | null;
  neckPos: V3; neck: THREE.BufferGeometry; headPos: V3; head: THREE.BufferGeometry; headGlow: THREE.BufferGeometry | null;
  ears: { pos: V3; geo: THREE.BufferGeometry; side: number }[];
  mane: { pos: V3; geo: THREE.BufferGeometry }[];
  tailPos: V3; tail: { geo: THREE.BufferGeometry; step: V3 }[];
  beard: { pos: V3; geo: THREE.BufferGeometry } | null;
  legs: { front: boolean; side: number; pos: V3; up: THREE.BufferGeometry; low: THREE.BufferGeometry; pas: THREE.BufferGeometry; kneeAt: V3; fetAt: V3 }[];
  seatY: number; shadow: [number, number]; tris: number;
}

function buildLeg(sp: LegSpec, pal: Pal, shape: Shape) {
  const up = new Geo(), low = new Geo(), pas = new Geo();
  const [r0, r1, r2, r3] = sp.r, m = sp.muscle;
  const legUp = shape === "horse" ? pal.coat : pal.coat, legLow = shape === "panther" ? pal.coat : pal.coatD;
  up.add(blob(m[0], m[1], m[2], m[3], m[4], m[5], [0, 0, 0], 0), legUp);
  up.add(tube([[0, 0, 0], sp.up], [r0, r1], { seg: 5, tip: 0 }), (x, y) => (y < sp.up[1] * 0.55 ? legLow : legUp));
  up.add(blob(r1 * 1.2, r1 * 1.15, r1 * 1.2, sp.up[0], sp.up[1], sp.up[2], [0, 0, 0], 0), legLow);
  low.add(tube([[0, 0, 0], sp.low], [r1 * 0.85, r2], { seg: 5, tip: 0 }), legLow);
  low.add(blob(r2 * 1.35, r2 * 1.3, r2 * 1.35, sp.low[0], sp.low[1], sp.low[2], [0, 0, 0], 0), legLow);
  pas.add(tube([[0, 0, 0], sp.pas], [r2, r2 * 0.9], { seg: 5, tip: 0 }), pal.holy ? pal.trim : legLow);
  if (sp.paw) {
    pas.add(blob(0.075, 0.05, 0.12, sp.pas[0], sp.pas[1] - 0.05, sp.pas[2] + 0.04, [0, 0, 0], 1), pal.coatD);
  } else {
    const hy = sp.pas[1];
    pas.add(tube([[sp.pas[0], hy, sp.pas[2]], [sp.pas[0], hy - sp.hoofH, sp.pas[2]]], [r3 * 0.85, r3], { seg: 5, tip: 0 }), pal.hoof);
    if (shape === "goat") pas.add(tube([[sp.pas[0], hy - sp.hoofH * 0.9, sp.pas[2] + 0.005], [sp.pas[0], hy - sp.hoofH, sp.pas[2] + r3 * 0.9]], [r3 * 0.3, r3 * 0.3], { seg: 3, tip: 0 }), 0x14100c);
  }
  return { up: up.build(), low: low.build(), pas: pas.build() };
}

/** Silla de montar sobre la piel del lomo, sentada hacia atrás para dejar libre el sitio delante. Devuelve la altura del asiento. */
function tack(g: Geo, sts: St[], pal: Pal, o: { zc: number; len: number; w: number; drop: number }) {
  const { zc, len, w } = o, z0 = zc - len / 2, z1 = zc + len / 2;
  // mantilla fina que sigue la curva del lomo, con ribete
  g.add(patch(skin(sts, z0 - 0.04, z1 + 0.04, 4, -92, 92, 8, 0.02)), pal.cloth);
  for (const s of [-1, 1]) g.add(patch(skin(sts, z0 - 0.04, z1 + 0.04, 5, s * 84, s * 94, 1, 0.026)), pal.trim);
  g.add(patch(skin(sts, z0 - 0.04, z0 - 0.01, 1, -94, 94, 8, 0.026)), pal.trim);
  g.add(patch(skin(sts, z1 + 0.01, z1 + 0.04, 1, -94, 94, 8, 0.026)), pal.trim);
  // asiento curvo: valle central, borrén trasero alto y perilla baja
  const rows: V3[][] = [];
  const NZ = 8, tw = [-40, -20, 0, 20, 40];
  for (let i = 0; i <= NZ; i++) {
    const u = (i / NZ) * 2 - 1, z = zc + u * (len * 0.5 - 0.04), s = stAt(sts, z), row: V3[] = [];
    for (const t of tw) {
      const p = ringPt(s, rad(t * (1 + 0.15 * (1 - u) / 2) * w), 0.035);
      const cant = u < -0.45 ? 0.11 * ((-u - 0.45) / 0.55) ** 2 * (0.5 + Math.abs(t) / 80) : 0;
      const pom = u > 0.65 ? 0.05 * ((u - 0.65) / 0.35) ** 2 * (1 - Math.abs(t) / 50) : 0;
      const dip = -0.032 * (1 - u * u) * (1 - Math.abs(t) / 70);
      row.push([p[0], p[1] + 0.03 + cant + pom + dip, p[2]]);
    }
    rows.push(row);
  }
  slab(rows, 0.045, g, pal.leather);
  const s0 = stAt(sts, zc), seatY = ringPt(s0, 0, 0.035)[1] + 0.03 - 0.032;
  // borrén con tachuelas y perilla baja
  const bp = rows[0]![2]!, fp = rows[NZ]![2]!;
  g.add(blob(0.035, 0.03, 0.03, fp[0], fp[1] + 0.02, fp[2], [0, 0, 0], 0), pal.trim);
  for (const x of [-0.11, 0, 0.11]) g.add(blob(0.02, 0.02, 0.02, bp[0] + x, bp[1] + 0.01 - Math.abs(x) * 0.2, bp[2] - 0.02, [0, 0, 0], 0), pal.trim);
  // faldones cortos y pegados a la piel (no tapan al jinete: quedan bajo los muslos)
  for (const s of [-1, 1]) {
    g.add(patch(skin(sts, zc - len * 0.3, zc + len * 0.28, 3, s * 42, s * 98, 4, 0.045)), pal.leather);
    g.add(patch(skin(sts, zc - len * 0.3, zc + len * 0.28, 1, s * 96, s * 100, 1, 0.05)), pal.trim);
  }
  // cincha bajo la barriga y hebillas
  g.add(patch(skin(sts, zc + len * 0.3, zc + len * 0.3 + 0.07, 1, 96, 264, 12, 0.03)), pal.leather);
  for (const s of [-1, 1]) g.add(blob(0.025, 0.03, 0.02, ...(() => { const p = ringPt(stAt(sts, zc + len * 0.3 + 0.035), rad(s * 100), 0.05); return p; })(), [0, 0, 0], 0), pal.trim);
  // aciones y estribos colgando a los lados, recogidos junto al costillar
  for (const s of [-1, 1]) {
    const a = ringPt(stAt(sts, zc), rad(s * 92), 0.06), ex = s * 0.07, dy = o.drop;
    g.add(tube([[a[0], a[1], a[2]], [a[0] + ex * 0.5, a[1] - dy * 0.5, a[2]], [a[0] + ex, a[1] - dy, a[2]]], [0.016, 0.016, 0.016], { seg: 4, flat: 0.35, tip: 0 }), pal.leather);
    g.add(xf(new THREE.TorusGeometry(0.06, 0.013, 3, 6), a[0] + ex, a[1] - dy - 0.065, a[2], 0, 0, 0), pal.trim);
    g.add(blob(0.05, 0.012, 0.05, a[0] + ex, a[1] - dy - 0.125, a[2], [0, 0, 0], 0), pal.trim);
  }
  return seatY;
}

let seedN = 1;
const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };

function build(id: Id): Rig {
  const { shape, pal } = KINDS[id];
  seedN = 7 + id.length * 13;
  const sts = STS[shape], bodyG = new Geo(), glowG = new Geo(), neckG = new Geo(), headG = new Geo(), headGlowG = new Geo();
  const ears: Rig["ears"] = [], mane: Rig["mane"] = [], tail: Rig["tail"] = [];
  let beard: Rig["beard"] = null, neckPos: V3 = [0, 0, 0], headPos: V3 = [0, 0, 0], tailPos: V3 = [0, 0, 0], seatY = 0, shadow: [number, number] = [0.6, 1.2];

  // torso con vientre claro
  const bot = (z: number) => stAt(sts, z).bot, top = (z: number) => stAt(sts, z).top;
  bodyG.add(loft(sts), (x, y, z) => ((y - bot(z)) / (top(z) - bot(z)) < 0.16 ? pal.belly : pal.coat));

  if (shape === "horse") {
    seatY = tack(bodyG, sts, pal, { zc: -0.12, len: 0.56, w: 1, drop: 0.5 });
    // pecho, cruz y grupa marcados
    bodyG.add(blob(0.27, 0.3, 0.2, 0, 1.0, 0.88, [0.2, 0, 0], 0), pal.coat);
    bodyG.add(blob(0.2, 0.08, 0.22, 0, 1.5, -0.62, [0, 0, 0], 0), pal.coat); // grupa
    // collera
    bodyG.add(patch(skin(sts, 0.66, 0.72, 1, -110, 110, 10, 0.03)), pal.leather);
    if (pal.holy) {
      // bardas de tela azul y oro sobre la grupa y el pecho (no tocan la silla)
      bodyG.add(patch(skin(sts, -0.95, -0.52, 3, -128, 128, 8, 0.03)), pal.cloth);
      bodyG.add(patch(skin(sts, 0.55, 0.9, 2, -122, 122, 8, 0.03)), pal.cloth);
      for (const [za, zb] of [[-0.95, -0.52], [0.55, 0.9]] as const) for (const s of [-1, 1]) bodyG.add(patch(skin(sts, za, zb, 3, s * 118, s * 130, 1, 0.036)), pal.trim);
      bodyG.add(patch(skin(sts, -0.56, -0.52, 1, -130, 130, 8, 0.036)), pal.trim);
      bodyG.add(patch(skin(sts, 0.55, 0.59, 1, -130, 130, 8, 0.036)), pal.trim);
      for (const s of [-1, 0, 1]) { const p = ringPt(stAt(sts, 0.78), rad(s * 70), 0.06); glowG.add(blob(0.04, 0.04, 0.025, p[0], p[1], p[2], [0, 0, 0], 0), 0x8fd0ff); }
      for (const s of [-1, 1]) { const p = ringPt(stAt(sts, -0.7), rad(s * 85), 0.06); glowG.add(blob(0.035, 0.035, 0.025, p[0], p[1], p[2], [0, 0, 0], 0), 0x8fd0ff); }
    }
    // cuello arqueado que arranca bajo y adelantado
    neckPos = [0, 1.12, 0.92];
    const np: V3[] = [[0, 0, 0], [0, 0.16, 0.16], [0, 0.4, 0.28], [0, 0.62, 0.4], [0, 0.74, 0.58]], nr = [0.29, 0.25, 0.2, 0.16, 0.14];
    neckG.add(tube(np, nr, { seg: 8, tip: 0.2 }), pal.coat);
    headPos = np[4]!;
    // crin en mechones sobre la cresta
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.88]) {
      const fi = f * 4, i = Math.min(3, Math.floor(fi)), t = fi - i, a = np[i]!, b = np[i + 1]!;
      const p: V3 = [0, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], r = nr[i]! + (nr[i + 1]! - nr[i]!) * t;
      const ty = b[1] - a[1], tz = b[2] - a[2], l = Math.hypot(ty, tz), ny = tz / l, nz = -ty / l;
      const mg = new Geo();
      for (let k = 0; k < 3; k++) { const sx = 0.5 + k * 0.6, L = 0.8 + k * 0.1; mg.add(tube([[0, 0, 0], [sx * 0.025, 0.08 * L, -0.03], [sx * 0.07, 0.13 * L, -0.09], [sx * 0.12, 0.1 * L, -0.17]], [0.07, 0.075, 0.05, 0.01], { seg: 4, flat: 0.5, tip: 0.5 }), pal.mane); }
      mane.push({ pos: [0, p[1] + ny * r * 0.85, p[2] + nz * r * 0.85], geo: mg.build() });
    }
    // cabeza: cráneo, caña nasal, hocico, mandíbula, mejillas
    headG.add(blob(0.12, 0.13, 0.15, 0, 0.02, 0.02, [0, 0, 0], 1), pal.coat);
    headG.add(tube([[0, 0.02, 0.05], [0, -0.14, 0.15], [0, -0.3, 0.24]], [0.1, 0.085, 0.07], { seg: 6, tip: 0.2 }), pal.coat);
    headG.add(blob(0.078, 0.075, 0.09, 0, -0.35, 0.27, [0.6, 0, 0], 1), pal.coatD);
    headG.add(tube([[0, -0.05, -0.04], [0, -0.2, 0.04], [0, -0.32, 0.17]], [0.085, 0.07, 0.05], { seg: 6, tip: 0.3 }), pal.coatD);
    headG.add(blob(0.065, 0.045, 0.06, 0, -0.38, 0.23, [0.6, 0, 0], 0), pal.coatD);
    for (const s of [-1, 1]) {
      headG.add(blob(0.07, 0.1, 0.09, s * 0.085, -0.07, 0.0, [0.2, 0, 0], 0), pal.coat);
      headG.add(blob(0.022, 0.03, 0.018, s * 0.045, -0.38, 0.33, [0.5, 0, 0], 0), 0x1c1512);
      headG.add(blob(0.03, 0.03, 0.026, s * 0.108, 0.045, 0.07, [0, 0, 0], 0), 0x120c0a);
      headG.add(tube([[s * 0.105, 0.07, 0.04], [s * 0.095, -0.12, 0.11], [s * 0.078, -0.27, 0.2]], [0.011, 0.011, 0.011], { seg: 3, tip: 0, flat: 1 }), pal.leather);
      headG.add(tube([[s * 0.07, -0.28, 0.19], [s * 0.11, -0.5, 0.0], [s * 0.1, -0.64, -0.2]], [0.01, 0.01, 0.01], { seg: 3, tip: 0 }), pal.leather); // riendas sueltas
    }
    headG.add(xf(new THREE.TorusGeometry(0.08, 0.012, 3, 8), 0, -0.2, 0.17, 0.89, 0, 0), pal.leather);
    headG.add(tube([[-0.1, 0.1, 0.0], [0, 0.13, 0.04], [0.1, 0.1, 0.0]], [0.011, 0.011, 0.011], { seg: 3, tip: 0 }), pal.leather);
    // tupé
    for (let k = 0; k < 3; k++) headG.add(tube([[(k - 1) * 0.03, 0.12, 0.05], [(k - 1) * 0.04, 0.09, 0.14], [(k - 1) * 0.05, -0.0, 0.18]], [0.03, 0.03, 0.006], { seg: 4, flat: 0.5, tip: 0.5 }), pal.mane);
    for (const s of [-1, 1]) {
      const eg = new Geo(); eg.add(tube([[0, 0, 0], [0, 0.1, 0.01], [0, 0.18, 0.03]], [0.045, 0.04, 0.012], { seg: 4, flat: 0.5, tip: 0.6 }), pal.coatD);
      ears.push({ pos: [s * 0.075, 0.12, -0.03], geo: eg.build(), side: s });
    }
    if (pal.holy) { // testera dorada y cuerno de luz
      headG.add(blob(0.065, 0.03, 0.2, 0, -0.095, 0.2, [0.89, 0, 0], 1), pal.trim);
      headG.add(blob(0.1, 0.03, 0.06, 0, 0.1, 0.1, [0.3, 0, 0], 0), pal.trim);
      headGlowG.add(tube([[0, 0.12, 0.12], [0, 0.22, 0.17], [0, 0.4, 0.23]], [0.032, 0.022, 0.008], { seg: 4, tip: 1 }), 0xcfeeff);
      headGlowG.add(blob(0.03, 0.03, 0.03, 0, -0.01, 0.2, [0, 0, 0], 0), 0x8fd0ff);
    }
    // cola larga en cuatro tramos de pelo
    tailPos = [0, 1.42, -0.94];
    for (let i = 0; i < 4; i++) {
      const tg = new Geo();
      for (let k = 0; k < 3; k++) {
        const sx = (k - 1) * 0.06, L = i === 3 ? 0.4 + (k % 2) * 0.1 : 0.37, w = 0.1 - i * 0.012;
        tg.add(tube([[sx, 0, 0], [sx * 1.4, -L * 0.5, -0.01 * k], [sx * 1.8, -L, -0.02]], [w, w * 0.95, i === 3 ? 0.012 : w * 0.8], { seg: 4, flat: 0.65, tip: i === 3 ? 1.5 : 0.2 }), pal.mane);
      }
      tail.push({ geo: tg.build(), step: i === 0 ? [0, 0, 0] : [0, -0.32, 0] });
    }
    shadow = [0.6, 1.25];
  } else if (shape === "goat") {
    seatY = tack(bodyG, sts, pal, { zc: -0.1, len: 0.5, w: 0.8, drop: 0.36 });
    bodyG.add(blob(0.2, 0.2, 0.18, 0, 0.86, 0.6, [0, 0, 0], 1), pal.coat);
    // pelaje largo y desgreñado
    const fur = (th: number, z: number, l: number, sx = 0) => {
      const p = ringPt(stAt(sts, z), rad(th), 0.0), L = l * (0.7 + rnd() * 0.6);
      bodyG.add(tube([[p[0], p[1], p[2]], [p[0] + sx * 0.5 + (rnd() - 0.5) * 0.04, p[1] - L * 0.55, p[2] - 0.02], [p[0] + sx + (rnd() - 0.5) * 0.05, p[1] - L, p[2] - 0.05 - rnd() * 0.04]], [0.09, 0.07, 0.01], { seg: 3, tip: 0.8 }), (x, y) => (y < p[1] - L * 0.5 ? pal.mane : pal.coat));
    };
    for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) for (const th of [105, 140, 172]) { fur(th, z, 0.12 + th / 1200, 0.02); fur(-th, z, 0.12 + th / 1200, -0.02); }
    for (const th of [150, 175, 200]) fur(th, 0.66, 0.2, 0);
    for (const z of [-0.45, -0.28, 0.2, 0.34, 0.48]) { // cresta desgreñada del lomo
      const p = ringPt(stAt(sts, z), 0, 0.0);
      bodyG.add(tube([[p[0], p[1], p[2]], [p[0], p[1] + 0.07, p[2] - 0.04], [p[0] + (rnd() - 0.5) * 0.05, p[1] + 0.12, p[2] - 0.1]], [0.05, 0.04, 0.006], { seg: 3, tip: 0.8 }), pal.mane);
    }
    neckPos = [0, 0.86, 0.66];
    const np: V3[] = [[0, 0, 0], [0, 0.14, 0.14], [0, 0.32, 0.26], [0, 0.46, 0.4]], nr = [0.19, 0.16, 0.13, 0.11];
    neckG.add(tube(np, nr, { seg: 7, tip: 0.2 }), pal.coat);
    for (let k = 0; k < 4; k++) { const a = np[k]!; neckG.add(tube([[0.0, a[1] - nr[k]! * 0.7, a[2] + 0.02], [(k % 2 - 0.5) * 0.04, a[1] - nr[k]! * 0.7 - 0.12, a[2] - 0.02], [(k % 2 - 0.5) * 0.06, a[1] - nr[k]! * 0.7 - 0.2, a[2] - 0.05]], [0.05, 0.04, 0.006], { seg: 3, tip: 0.8 }), pal.mane); }
    headPos = np[3]!;
    // cabeza larga de cabra, hocico claro, barba
    headG.add(blob(0.1, 0.11, 0.12, 0, 0.0, 0.0, [0, 0, 0], 1), pal.coat);
    headG.add(tube([[0, -0.02, 0.06], [0, -0.12, 0.17], [0, -0.2, 0.25]], [0.085, 0.07, 0.055], { seg: 6, tip: 0.2 }), pal.coat);
    headG.add(blob(0.058, 0.052, 0.07, 0, -0.22, 0.27, [0.5, 0, 0], 1), pal.belly);
    headG.add(blob(0.03, 0.02, 0.02, 0, -0.2, 0.33, [0, 0, 0], 0), 0x1c1512);
    for (const s of [-1, 1]) {
      headG.add(blob(0.028, 0.02, 0.022, s * 0.085, 0.04, 0.07, [0, 0, s * 0.2], 0), 0x15100a);
      const hg = new Geo(), hp: V3[] = [[0, 0, 0], [s * 0.03, 0.2, -0.05], [s * 0.08, 0.34, -0.2], [s * 0.14, 0.36, -0.38], [s * 0.2, 0.27, -0.52]];
      hg.add(tube(hp, [0.07, 0.062, 0.05, 0.034, 0.01], { seg: 5, tip: 1 }), (x, y, z) => (Math.floor(-z * 18) & 1 ? 0xa89a7c : pal.horn ?? 0xdcd0b4));
      const hgeo = hg.build(); hgeo.translate(s * 0.055, 0.1, -0.02);
      const hh = new Geo(); headG.add(hgeo, 0xffffff); void hh;
      const eg = new Geo(); eg.add(tube([[0, 0, 0], [s * 0.1, -0.01, -0.03], [s * 0.21, -0.05, -0.06]], [0.04, 0.04, 0.014], { seg: 4, flat: 0.35, tip: 0.6 }), pal.coatD);
      ears.push({ pos: [s * 0.08, 0.04, -0.04], geo: eg.build(), side: s });
    }
    const bgG = new Geo(); bgG.add(tube([[0, 0, 0], [0, -0.12, -0.02], [0, -0.27, -0.05]], [0.04, 0.034, 0.006], { seg: 4, flat: 0.7, tip: 0.8 }), pal.mane);
    beard = { pos: [0, -0.25, 0.22], geo: bgG.build() };
    tailPos = [0, 1.0, -0.6];
    const tg = new Geo(); tg.add(tube([[0, 0, 0], [0, 0.07, -0.05], [0, 0.15, -0.06]], [0.05, 0.045, 0.01], { seg: 4, tip: 0.8 }), pal.mane);
    tail.push({ geo: tg.build(), step: [0, 0, 0] });
    shadow = [0.5, 1.0];
  } else {
    seatY = tack(bodyG, sts, pal, { zc: -0.15, len: 0.48, w: 0.7, drop: 0.3 });
    bodyG.add(blob(0.2, 0.2, 0.2, 0, 0.64, 0.72, [0, 0, 0], 0), pal.coat);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const z = -0.55 + i * 0.27, p = ringPt(stAt(sts, z), rad(s * 70), 0.0); bodyG.add(blob(0.03, 0.012, 0.075, p[0], p[1], p[2], [0, 0, s * 0.5], 0), pal.coatD); }
    neckPos = [0, 0.72, 0.78];
    const np: V3[] = [[0, 0, 0], [0, 0.06, 0.14], [0, 0.09, 0.3]], nr = [0.22, 0.19, 0.16];
    neckG.add(tube(np, nr, { seg: 8, tip: 0.2 }), pal.coat);
    neckG.add(xf(new THREE.TorusGeometry(0.19, 0.03, 4, 10), 0, 0.045, 0.09, -0.35, 0, 0), pal.trim); // collar
    headPos = np[2]!;
    headG.add(blob(0.16, 0.14, 0.15, 0, 0, 0, [0, 0, 0], 1), pal.coat);
    headG.add(blob(0.085, 0.065, 0.09, 0, -0.04, 0.15, [0, 0, 0], 1), pal.coat);
    headG.add(blob(0.032, 0.022, 0.022, 0, -0.01, 0.235, [0, 0, 0], 0), 0x8a6a8a);
    headG.add(tube([[0, -0.09, -0.02], [0, -0.1, 0.12], [0, -0.09, 0.21]], [0.075, 0.06, 0.04], { seg: 5, tip: 0.3 }), pal.coatD);
    for (const s of [-1, 1]) {
      headG.add(blob(0.05, 0.06, 0.07, s * 0.13, -0.05, 0.02, [0, 0, s * 0.3], 0), pal.coat);
      headG.add(blob(0.05, 0.03, 0.06, s * 0.08, 0.1, 0.08, [0.3, 0, 0], 0), pal.coatD);
      for (let k = 0; k < 2; k++) headG.add(tube([[s * 0.05, -0.04 - k * 0.015, 0.2], [s * 0.14, -0.03 - k * 0.03, 0.24], [s * 0.24, -0.02 - k * 0.06, 0.26]], [0.004, 0.003, 0.002], { seg: 3, tip: 0 }), 0xd8d0c0);
      headG.add(tube([[s * 0.035, -0.09, 0.19], [s * 0.035, -0.14, 0.2]], [0.014, 0.0], { seg: 3, tip: 0 }), 0xf0ece0);
      headGlowG.add(blob(0.032, 0.016, 0.02, s * 0.09, 0.04, 0.13, [0, 0, s * 0.35], 0), pal.eye ?? 0xb48aff);
      const eg = new Geo(); eg.add(tube([[0, 0, 0], [0, 0.11, -0.01]], [0.065, 0.0], { seg: 3, flat: 0.5, tip: 0 }), pal.coatD);
      ears.push({ pos: [s * 0.1, 0.12, -0.06], geo: eg.build(), side: s });
    }
    tailPos = [0, 0.66, -0.95];
    for (let i = 0; i < 7; i++) {
      const tg = new Geo(), r = 0.065 - i * 0.006;
      tg.add(tube([[0, 0, 0], [0, 0.01, -0.1], [0, 0.015, -0.19]], [r, r * 0.97, r * 0.92], { seg: 5, tip: 0 }), pal.coat);
      tail.push({ geo: tg.build(), step: i === 0 ? [0, 0, 0] : [0, 0.015, -0.19] });
    }
    shadow = [0.45, 1.3];
  }

  const legs: Rig["legs"] = [];
  const L = LEGS[shape], front = buildLeg(L.front, pal, shape), hind = buildLeg(L.hind, pal, shape);
  for (const [fr, sp, geos] of [[true, L.front, front], [false, L.hind, hind]] as const) for (const s of [1, -1]) {
    legs.push({ front: fr, side: s, pos: [s * sp.x, sp.pivotY, sp.z], up: geos.up, low: geos.low, pas: geos.pas, kneeAt: sp.up, fetAt: sp.low });
  }
  const body = bodyG.build(), head = headG.build(), neck = neckG.build();
  const manes = mane.reduce((n, m) => n + tris(m.geo), 0), tl = tail.reduce((n, m) => n + tris(m.geo), 0);
  const lg = legs.reduce((n, l) => n + tris(l.up) + tris(l.low) + tris(l.pas), 0), ea = ears.reduce((n, e) => n + tris(e.geo), 0);
  const bodyGlow = glowG.empty ? null : glowG.build(), headGlow = headGlowG.empty ? null : headGlowG.build();
  const total = tris(body) + tris(head) + tris(neck) + manes + tl + lg + ea + (bodyGlow ? tris(bodyGlow) : 0) + (headGlow ? tris(headGlow) : 0) + (beard ? tris(beard.geo) : 0);
  return { body, bodyGlow, neckPos, neck, headPos, head, headGlow, ears, mane, tailPos, tail, beard, legs, seatY, shadow, tris: total };
}
const RIGS = new Map<Id, Rig>();
const rigOf = (id: Id) => { let r = RIGS.get(id); if (!r) { r = build(id); RIGS.set(id, r); } return r; };

// ---------------------------------------------------------------------------------------------------------------
// Materiales compartidos
// ---------------------------------------------------------------------------------------------------------------
const MATS = new Map<Id, THREE.MeshStandardMaterial>();
const matOf = (id: Id) => {
  let m = MATS.get(id);
  if (!m) {
    const holy = KINDS[id].pal.holy;
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: holy ? 0.6 : 0.92, metalness: 0, side: THREE.DoubleSide, emissive: holy ? 0xffe2a0 : 0x000000, emissiveIntensity: holy ? 0.1 : 0 });
    MATS.set(id, m);
  }
  return m;
};
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

// ---------------------------------------------------------------------------------------------------------------
// Partículas baratas en coordenadas de mundo (pool fijo, geometrías y materiales compartidos)
// ---------------------------------------------------------------------------------------------------------------
interface Particle { mesh: THREE.Mesh; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; grav: number; stretch: number; alive: boolean; spin: number }
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 0);
const SPARK_GEO = new THREE.OctahedronGeometry(1, 0);
const fxMats = new Map<string, THREE.Material>();
const puffMat = (color: number, opacity: number) => {
  const k = `p${color}_${opacity}`; let m = fxMats.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity, depthWrite: false }); fxMats.set(k, m); }
  return m;
};
const sparkMat = (color: number) => {
  const k = `s${color}`; let m = fxMats.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); fxMats.set(k, m); }
  return m;
};

class Fx extends THREE.Group {
  private puffs: Particle[] = [];
  private sparks: Particle[] = [];
  lastSim = 0;
  constructor(dust: number, opacity: number, spark?: number) {
    super();
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Particle[], n: number) => {
      for (let i = 0; i < n; i++) {
        const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = true; this.add(mesh);
        list.push({ mesh, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 0.1, s1: 0.1, grav: 0, stretch: 1, alive: false, spin: 0 });
      }
    };
    mk(PUFF_GEO, puffMat(dust, opacity), this.puffs, 16);
    if (spark !== undefined) mk(SPARK_GEO, sparkMat(spark), this.sparks, 18);
    this.lastSim = performance.now();
  }
  private take(list: Particle[]) {
    for (const p of list) if (!p.alive) return p;
    return list.length ? list.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b)) : null; // recicla la más vieja
  }
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, stretch = 1, grav = 0) {
    const p = this.take(this.puffs); if (!p) return;
    Object.assign(p, { vx, vy, vz, age: 0, life, s0, s1, stretch, grav, alive: true, spin: Math.random() * 6 });
    p.mesh.position.set(x, y, z); p.mesh.visible = true;
  }
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number) {
    const p = this.take(this.sparks); if (!p) return;
    Object.assign(p, { vx, vy, vz, age: 0, life, s0: size, s1: size * 0.1, stretch: 1, grav: -0.5, alive: true, spin: Math.random() * 6 });
    p.mesh.position.set(x, y, z); p.mesh.visible = true;
  }
  sim(dt: number) {
    this.lastSim = performance.now();
    for (const list of [this.puffs, this.sparks]) for (const p of list) {
      if (!p.alive) continue;
      p.age += dt; const a = p.age / p.life;
      if (a >= 1) { p.alive = false; p.mesh.visible = false; continue; }
      const drag = Math.exp(-dt * 2.2);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag - p.grav * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      const grow = 1 - (1 - a) * (1 - a), sc = (p.s0 + (p.s1 - p.s0) * grow) * (1 - a * a * a);
      p.mesh.scale.set(sc, sc * p.stretch, sc); p.mesh.rotation.set(p.spin + a * 1.5, p.spin * 2 + a, 0);
    }
  }
  updateMatrixWorld(force?: boolean) {
    const now = performance.now();
    if (now - this.lastSim > 100) this.sim(Math.min(0.1, (now - this.lastSim) / 1000)); // montura sin actualizar: las partículas terminan solas
    super.updateMatrixWorld(force);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Marchas
// ---------------------------------------------------------------------------------------------------------------
interface Gait { off: [number, number, number, number]; duty: number; amp: number; knee: number; len: number; bob: number; lower: number; pitch: number; n: number; susp: number; nod: number }
// orden de patas: [delantera izq., delantera der., trasera izq., trasera der.]
const GAITS: Record<Shape, [Gait, Gait, Gait]> = {
  horse: [
    { off: [0.25, 0.75, 0, 0.5], duty: 0.66, amp: 0.34, knee: 0.75, len: 1.8, bob: 0.02, lower: 0.01, pitch: 0.02, n: 2, susp: 0, nod: 0.08 },
    { off: [0, 0.5, 0.5, 0], duty: 0.45, amp: 0.5, knee: 1.05, len: 3.2, bob: 0.05, lower: 0.035, pitch: 0.015, n: 2, susp: 0.475, nod: 0.03 },
    { off: [0.52, 0.4, 0.12, 0], duty: 0.3, amp: 0.72, knee: 1.25, len: 6.5, bob: 0.13, lower: 0.05, pitch: 0.1, n: 1, susp: 0.91, nod: 0.13 },
  ],
  goat: [
    { off: [0.25, 0.75, 0, 0.5], duty: 0.66, amp: 0.4, knee: 0.8, len: 1.5, bob: 0.02, lower: 0.01, pitch: 0.025, n: 2, susp: 0, nod: 0.08 },
    { off: [0, 0.5, 0.5, 0], duty: 0.48, amp: 0.55, knee: 1.1, len: 2.6, bob: 0.05, lower: 0.03, pitch: 0.02, n: 2, susp: 0.49, nod: 0.04 },
    { off: [0.45, 0.38, 0.08, 0], duty: 0.3, amp: 0.8, knee: 1.35, len: 4.8, bob: 0.16, lower: 0.04, pitch: 0.13, n: 1, susp: 0.88, nod: 0.12 },
  ],
  panther: [
    { off: [0.25, 0.75, 0, 0.5], duty: 0.64, amp: 0.45, knee: 0.8, len: 1.7, bob: 0.015, lower: 0.01, pitch: 0.025, n: 2, susp: 0, nod: 0.05 },
    { off: [0, 0.5, 0.5, 0], duty: 0.44, amp: 0.6, knee: 1.15, len: 3.0, bob: 0.04, lower: 0.03, pitch: 0.03, n: 2, susp: 0.47, nod: 0.04 },
    { off: [0.42, 0.36, 0.08, 0], duty: 0.28, amp: 0.92, knee: 1.45, len: 5.2, bob: 0.12, lower: 0.04, pitch: 0.15, n: 1, susp: 0.85, nod: 0.1 },
  ],
};

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

interface LegNode { pivot: THREE.Group; knee: THREE.Group; fet: THREE.Group; front: boolean; side: number; idx: number; prev: number; z: number; x: number; len: number }

export class Steed {
  readonly group = new THREE.Group();
  /** Altura de la superficie del asiento de la silla (donde se sienta el jinete). */
  readonly seat: number;
  /** Desplazamiento vertical del lomo en este fotograma (ya escalado): el jinete lo sigue. */
  bob = 0;
  /** Alabeo actual (rad, negativo = inclinado a la izquierda), por si se quiere inclinar también al jinete. */
  roll = 0;
  /** Polvo / chispas / sombras en coordenadas de mundo. Se cuelga solo de la escena en el primer update(). */
  readonly fx: Fx;
  /** Triángulos de la montura (informativo). */
  readonly triangles: number;
  /** Número de mallas (informativo). */
  meshCount = 0;

  private id: Id;
  private shape: Shape;
  private size: number;
  private seatL: number;
  private lean = new THREE.Group();
  private body = new THREE.Group();
  private bodyMesh: THREE.Mesh;
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private ears: { g: THREE.Group; side: number; flick: number; next: number }[] = [];
  private mane: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private tailRoot = new THREE.Group();
  private beard: THREE.Group | null = null;
  private legs: LegNode[] = [];
  private t = Math.random() * 20;
  private cyc = 0;
  private spd = 0;
  private trn = 0;
  private g = 0;
  private sparkAcc = 0;
  private wispAcc = 0;
  private legLen: number;
  private pal: Pal;

  constructor(id: Id) {
    const kind = KINDS[id], rig = rigOf(id), M = matOf(id);
    this.id = id; this.shape = kind.shape; this.size = kind.size; this.pal = kind.pal;
    this.seatL = rig.seatY; this.seat = rig.seatY * kind.size;
    this.legLen = LEGS[kind.shape].front.pivotY;
    const mesh = (geo: THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = M) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); this.meshCount++; return m; };
    this.meshCount = 0;
    this.bodyMesh = mesh(rig.body, this.body);
    if (rig.bodyGlow) { const m = mesh(rig.bodyGlow, this.body, GLOW); m.castShadow = false; }
    // piernas: cadera -> rodilla/corvejón -> menudillo
    rig.legs.forEach((l, i) => {
      const pivot = new THREE.Group(); pivot.position.set(...l.pos); this.body.add(pivot); mesh(l.up, pivot);
      const knee = new THREE.Group(); knee.position.set(...l.kneeAt); pivot.add(knee); mesh(l.low, knee);
      const fet = new THREE.Group(); fet.position.set(...l.fetAt); knee.add(fet); mesh(l.pas, fet);
      const idx = (l.front ? 0 : 2) + (l.side > 0 ? 0 : 1);
      this.legs.push({ pivot, knee, fet, front: l.front, side: l.side, idx, prev: 0, z: l.pos[2], x: l.pos[0], len: LEGS[kind.shape].front.pivotY });
    });
    // cuello, crin, cabeza, orejas
    this.neck.position.set(...rig.neckPos); this.body.add(this.neck); mesh(rig.neck, this.neck);
    for (const m of rig.mane) { const g = new THREE.Group(); g.position.set(...m.pos); this.neck.add(g); mesh(m.geo, g); this.mane.push(g); }
    this.head.position.set(...rig.headPos); this.neck.add(this.head); mesh(rig.head, this.head);
    if (rig.headGlow) { const m = mesh(rig.headGlow, this.head, GLOW); m.castShadow = false; }
    for (const e of rig.ears) { const g = new THREE.Group(); g.position.set(...e.pos); this.head.add(g); mesh(e.geo, g); this.ears.push({ g, side: e.side, flick: 0, next: 1 + Math.random() * 3 }); }
    if (rig.beard) { const g = new THREE.Group(); g.position.set(...rig.beard.pos); this.head.add(g); mesh(rig.beard.geo, g); this.beard = g; }
    // cola en cadena
    this.tailRoot.position.set(...rig.tailPos); this.body.add(this.tailRoot);
    let parent: THREE.Object3D = this.tailRoot;
    for (const s of rig.tail) { const g = new THREE.Group(); g.position.set(...s.step); parent.add(g); mesh(s.geo, g); this.tail.push(g); parent = g; }

    // el giro se hace en torno a la silla: los pies se abren hacia fuera, el jinete se queda centrado
    this.lean.position.y = this.seatL; this.body.position.y = -this.seatL; this.lean.add(this.body);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }));
    sh.scale.set(rig.shadow[0], 1, rig.shadow[1]); sh.position.y = 0.09; sh.renderOrder = 2; this.meshCount++;
    const root = new THREE.Group(); root.scale.setScalar(kind.size); root.add(sh, this.lean); this.group.add(root);
    this.triangles = Math.round(rig.tris);

    this.fx = id === "warhorse" ? new Fx(0xf3e7c6, 0.6, 0xffe08a) : id === "panther" ? new Fx(0x2a2234, 0.4) : id === "goat" ? new Fx(0xb7aa92, 0.65) : new Fx(0xcdb894, 0.65);
  }

  /** Quita las partículas de la escena (la geometría es compartida y no se libera). */
  dispose() { this.fx.removeFromParent(); }

  /** `speed`: m/s sobre el suelo. `turn`: rad/s, positivo a la izquierda. */
  update(dt: number, speed: number, turn = 0) {
    dt = clamp(dt, 0, 0.1);
    this.t += dt;
    const ex = (r: number) => 1 - Math.exp(-r * dt), t = this.t;
    this.spd += (speed - this.spd) * ex(6);
    this.trn += (turn - this.trn) * ex(7);
    const s = this.spd, shape = this.shape, gal = shape !== "goat" ? 1 : 1;
    void gal;
    const gT = s < 1.8 ? 0 : s < 6 ? (s - 1.8) / 4.2 : s < 7.5 ? 1 : s < 10.5 ? 1 + (s - 7.5) / 3 : 2;
    this.g += (gT - this.g) * ex(3.5);
    const g = this.g, w0 = Math.max(0, 1 - g), w1 = Math.max(0, 1 - Math.abs(g - 1)), w2 = Math.max(0, g - 1);
    const G = GAITS[shape], mix = (k: Exclude<keyof Gait, "off">) => w0 * G[0][k] + w1 * G[1][k] + w2 * G[2][k];
    const mv = smooth(0.1, 1.3, s), len = mix("len"), duty = mix("duty"), amp = mix("amp"), kneeA = mix("knee");
    this.cyc += dt * (s / len);
    const cyc = this.cyc, TAU = Math.PI * 2;

    // --- patas ---
    let touch = false;
    for (const l of this.legs) {
      const off = w0 * G[0].off[l.idx]! + w1 * G[1].off[l.idx]! + w2 * G[2].off[l.idx]!, c = frac(cyc + off);
      let hip: number, kf = 0, ff = 0;
      if (c < duty) { const u = c / duty; hip = 1 - 2 * u; kf = 0.08 * Math.sin(Math.PI * u); ff = 0.25 * u * u * u; }
      else { const w = (c - duty) / (1 - duty), e = w * w * (3 - 2 * w); hip = -1 + 2 * e; kf = Math.sin(Math.PI * w) ** 0.8; ff = 0.5 * Math.sin(Math.PI * w); }
      const a = amp * (l.front ? 1 : 0.9) * mv * hip;
      l.pivot.rotation.x = -a;
      l.knee.rotation.x = kf * kneeA * mv * (l.front ? 1 : 0.85);
      l.fet.rotation.x = ff * kneeA * 0.45 * mv * (l.front ? 1 : -0.4) * (l.front ? 1 : -1) * (l.front ? 1 : 1);
      if (c < l.prev) {
        const p = (w0 * 0 + w1 * 0.45 + w2 * 1) * smooth(5, 7, s);
        if (p > 0 && Math.random() < p) this.dust(l, a);
        touch = true;
      }
      l.prev = c;
    }
    void touch;

    // --- cuerpo: bob, cabeceo y alabeo ---
    const sh = (n: number, susp: number) => 0.5 + 0.5 * Math.cos(TAU * n * (cyc - susp));
    const bobA = w0 * G[0].bob * sh(G[0].n, G[0].susp) + w1 * G[1].bob * sh(G[1].n, G[1].susp) + w2 * G[2].bob * sh(G[2].n, G[2].susp);
    const breath = Math.sin(t * 1.9) * 0.008 * (1 - 0.7 * mv);
    const bobL = bobA * mv - mix("lower") * mv + breath;
    this.lean.position.y = this.seatL + bobL;
    this.bob = bobL * this.size;
    const pitch = w0 * G[0].pitch * Math.cos(TAU * G[0].n * (cyc - 0.5)) + w1 * G[1].pitch * Math.cos(TAU * G[1].n * (cyc - 0.5)) + w2 * G[2].pitch * Math.cos(TAU * G[2].n * (cyc - 0.5));
    this.lean.rotation.x = pitch * mv;
    const cap = shape === "panther" ? 0.5 : shape === "goat" ? 0.3 : 0.35;
    const rollT = -clamp(Math.atan2(s * this.trn, 11) * 0.9, -cap, cap) + Math.sin(TAU * cyc) * 0.02 * mv * (1 - w2);
    this.roll += (rollT - this.roll) * ex(8);
    this.lean.rotation.z = this.roll;
    this.lean.rotation.y = -clamp(this.trn * 0.03, -0.08, 0.08);
    const b = Math.sin(t * 1.9) * 0.008 * (1 - 0.7 * mv);
    this.bodyMesh.scale.set(1 + b * 0.6, 1 + b, 1 + b * 0.4);

    // --- cuello, cabeza, orejas ---
    const nod = w0 * G[0].nod * Math.cos(TAU * (cyc - 0.55)) + w1 * G[1].nod * Math.cos(TAU * 2 * (cyc - 0.2)) + w2 * G[2].nod * Math.cos(TAU * (cyc - 0.6));
    const ext = (shape === "panther" ? 0.12 : 0.1) * w1 + (shape === "horse" ? 0.3 : 0.24) * w2;
    this.neck.rotation.x = ext + nod * mv + Math.sin(t * 0.7) * 0.03 * (1 - mv);
    this.neck.rotation.y = Math.sin(t * 0.45) * 0.2 * (1 - mv) + clamp(this.trn * 0.18, -0.35, 0.35);
    this.head.rotation.x = -ext * 0.7 + nod * 0.5 * mv + Math.sin(t * 0.9 + 1) * 0.04 * (1 - mv) + (shape === "goat" ? 0.1 : 0);
    this.head.rotation.z = -clamp(this.trn * 0.05, -0.12, 0.12) + Math.sin(t * 0.37) * 0.06 * (1 - mv);
    for (const e of this.ears) {
      e.next -= dt; if (e.next <= 0) { e.flick = 1; e.next = 1.5 + Math.random() * 4; }
      e.flick = Math.max(0, e.flick - dt * 3.5);
      const back = (shape === "goat" ? 0.1 : 0.55) * w2 + 0.15 * w1;
      e.g.rotation.x = -back + Math.sin(e.flick * Math.PI) * 0.35 + Math.sin(t * 1.3 + e.side) * 0.04;
      e.g.rotation.z = shape === "goat" ? e.side * (0.15 + Math.sin(e.flick * Math.PI) * 0.4 + w2 * 0.2) * -1 : -e.side * (0.12 + Math.sin(e.flick * Math.PI) * 0.15);
    }
    if (this.beard) this.beard.rotation.x = 0.1 + Math.sin(t * 7) * 0.1 * mv + Math.sin(t * 1.2) * 0.05 + w2 * 0.4;

    // --- crin y cola: viento, ondulación y reacción al giro ---
    this.mane.forEach((m, i) => {
      m.rotation.x = -(0.05 + 0.45 * w1 + 0.85 * w2) + Math.sin(t * 9 - i * 0.9) * (0.04 + 0.12 * w2 + 0.04 * w1) + Math.sin(t * 1.6 + i) * 0.03;
      m.rotation.z = -clamp(this.trn * 0.12, -0.3, 0.3) + Math.sin(t * 7 - i) * 0.05 * (mv + 0.2);
    });
    const tr = this.tail;
    if (shape === "horse") {
      this.tailRoot.rotation.x = 0.45 + 0.2 * w1 + 0.95 * w2 + Math.sin(t * 1.4) * 0.05;
      this.tailRoot.rotation.z = -clamp(this.trn * 0.2, -0.45, 0.45) + Math.sin(t * 1.7) * 0.14 * (1 - mv);
      tr.forEach((q, i) => { q.rotation.x = 0.05 + w2 * 0.1 + Math.sin(t * (4 + 6 * mv) - i * 1.1) * (0.04 + 0.14 * mv); q.rotation.z = Math.sin(t * (2 + 3 * mv) - i * 0.9) * (0.06 + 0.1 * mv); });
    } else if (shape === "goat") {
      this.tailRoot.rotation.x = Math.sin(t * 6) * 0.18 * (0.4 + mv) + 0.1; this.tailRoot.rotation.z = Math.sin(t * 3.1) * 0.15;
    } else {
      this.tailRoot.rotation.x = 0.3 + 0.1 * w2; this.tailRoot.rotation.y = -clamp(this.trn * 0.15, -0.4, 0.4);
      tr.forEach((q, i) => { q.rotation.y = Math.sin(t * (2.2 + 2 * mv) - i * 0.7) * (0.22 + 0.1 * mv); q.rotation.x = -0.1 + Math.sin(t * 1.5 - i * 0.5) * 0.04; });
    }

    // --- efectos ---
    this.group.updateWorldMatrix(true, false);
    if (!this.fx.parent) { let r: THREE.Object3D = this.group; while (r.parent) r = r.parent; if ((r as THREE.Scene).isScene) r.add(this.fx); }
    const ok = !!this.fx.parent && this.group.visible;
    if (ok && this.id === "warhorse") {
      this.sparkAcc += dt * (5 + s * 1.6);
      while (this.sparkAcc > 1) { this.sparkAcc -= 1; this.emitBody(0.9 + Math.random() * 0.7, (x, y, z, wv) => this.fx.spark(x, y, z, -wv.x * 0.15 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.7, -wv.z * 0.15 + (Math.random() - 0.5) * 0.6, 0.05 + Math.random() * 0.05, 0.7 + Math.random() * 0.6)); }
    }
    if (ok && this.id === "panther") {
      this.wispAcc += dt * (3 + s * 1.1);
      while (this.wispAcc > 1) { this.wispAcc -= 1; this.emitBody(0.45 + Math.random() * 0.4, (x, y, z, wv) => this.fx.puff(x, y, z, -wv.x * 0.2 + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, -wv.z * 0.2 + (Math.random() - 0.5) * 0.4, 0.07, 0.22, 0.8 + Math.random() * 0.4, 1.8)); }
    }
    this.fx.sim(dt);
  }

  /** Genera una partícula en un punto aleatorio del cuerpo (altura relativa h) con la dirección del movimiento. */
  private emitBody(h: number, fn: (x: number, y: number, z: number, dir: THREE.Vector3) => void) {
    const sz = this.size, zz = (Math.random() - 0.5) * 1.6, hw = this.shape === "horse" ? 0.34 : 0.22;
    _v.set((Math.random() - 0.5) * 2 * (hw + 0.1) * sz, h * this.seatL * 0.7 * sz, zz * sz).applyMatrix4(this.group.matrixWorld);
    _f.set(0, 0, 1).transformDirection(this.group.matrixWorld).multiplyScalar(this.spd);
    fn(_v.x, _v.y, _v.z, _f);
  }

  private dust(l: LegNode, hipAngle: number) {
    if (!this.fx.parent) return;
    const sz = this.size, zOff = l.z + l.len * Math.sin(Math.abs(hipAngle)) * 0.8;
    _v.set(l.x * sz, 0.05, zOff * sz).applyMatrix4(this.group.matrixWorld);
    _f.set(0, 0, 1).transformDirection(this.group.matrixWorld);
    const sp = this.spd, r = () => Math.random() - 0.5;
    this.fx.puff(_v.x, _v.y + 0.05, _v.z, -_f.x * sp * 0.08 + r() * 0.6, 0.5 + Math.random() * 0.5, -_f.z * sp * 0.08 + r() * 0.6, 0.12 * sz, 0.4 * sz, 0.5 + Math.random() * 0.3, 0.8);
  }
}
