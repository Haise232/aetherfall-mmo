// Base común de los animales procedurales: geometría compartida con color por vértice, materiales por instancia
// (destello al golpe), temporizadores de ataque/golpe/muerte y sombra. Cada animal solo dibuja su pose en `anim`.
import * as THREE from "three";
import type { MobModel } from "./types";

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number, a: number, b: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

const geos = new Map<string, THREE.BufferGeometry>();
/** Geometría compartida: se crea una vez por clave y todas las instancias la reutilizan. */
export const shared = (key: string, make: () => THREE.BufferGeometry) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };

export type Pal = [number, number, number]; // vientre → flanco → lomo (de abajo arriba)
/** Elipsoide irregular de poco polígono: vértices con ruido, y color por vértice (degradado vertical + moteado). */
export function blob(rx: number, ry: number, rz: number, pal: Pal, detail = 1, jit = 0.07, speck = 0.1, pat?: (x: number, y: number, z: number, c: THREE.Color) => void) {
  return shared(`b${rx},${ry},${rz},${pal},${detail},${jit},${speck},${pat ? pat.name : ""}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3), c = new THREE.Color(), a = new THREE.Color(pal[0]), b = new THREE.Color(pal[1]), d = new THREE.Color(pal[2]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + (hash(x, y, z) - 0.5) * 2 * jit;
      const X = x * n * rx, Y = y * n * ry, Z = z * n * rz; p.setXYZ(i, X, Y, Z);
      const h = y * 0.5 + 0.5; // 0 abajo, 1 arriba
      if (h < 0.45) c.copy(a).lerp(b, h / 0.45); else c.copy(b).lerp(d, (h - 0.45) / 0.55);
      c.multiplyScalar(1 + (hash(z * 3.1, x * 2.3, y * 5.7) - 0.5) * 2 * speck);
      pat?.(X, Y, Z, c);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  });
}
/** Cono de pelo/cerda/oreja apuntando a +Y (rótalo al colocarlo). */
export const cone = (r: number, h: number, seg = 4) => shared(`c${r},${h},${seg}`, () => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return g; });
/** Cilindro cónico a lo largo de +Z desde 0 hasta `len` (r0 en la base, r1 en la punta). */
export const limb = (r0: number, r1: number, len: number, seg = 6) => shared(`l${r0},${r1},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return g; });
export const ball = (r: number, seg = 6) => shared(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, seg - 1));

const SHADOW_M = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 });
const HIT_M = new THREE.MeshBasicMaterial({ visible: false });

export abstract class Beast implements MobModel {
  readonly group = new THREE.Group();
  /** Todo el cuerpo cuelga de aquí (la caída y el salto mueven este nodo, no el grupo). */
  protected readonly root = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  abstract readonly height: number;
  abstract readonly ring: number;
  protected t = Math.random() * 40; // desfasa animaciones entre individuos
  protected seed = Math.random();
  protected mv = 0; // 0 parado .. 1 en marcha
  protected phase = 0;
  protected atk = -1; // segundos desde que empezó el ataque (-1: ninguno)
  protected rec = 0; // retroceso al golpe (1 → 0)
  protected fall = 0; // 0 en pie .. 1 caído
  protected dead = false;
  private flash = 0;
  private settled = false;
  private mats: THREE.MeshStandardMaterial[] = [];
  protected eyes: THREE.MeshStandardMaterial[] = [];
  private eyeI = 1.4;

  constructor(hit: [number, number, number], hitY: number, shadow: [number, number]) {
    const sh = new THREE.Mesh(shared("shadow", () => new THREE.CircleGeometry(1, 16)), SHADOW_M);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.renderOrder = 2; sh.scale.set(shadow[0], shadow[1], 1);
    this.hitbox = new THREE.Mesh(shared(`h${hit}`, () => new THREE.BoxGeometry(...hit)), HIT_M); this.hitbox.position.y = hitY;
    this.group.add(sh, this.root, this.hitbox);
  }
  /** Material propio de este individuo (el destello no debe encender a toda la manada). */
  protected own(m: THREE.MeshStandardMaterial, tone = 0) {
    const c = m.clone(); if (tone) c.color.multiplyScalar(1 + tone); this.mats.push(c); return c;
  }
  protected eye(color: number, i = 1.4) { const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.4 }); this.eyes.push(m); this.eyeI = i; return m; }
  protected mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; }
  protected node(parent: THREE.Object3D, x = 0, y = 0, z = 0) { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; }

  hurt(strong = false) { this.flash = 1; this.rec = strong ? 1.5 : 1; }
  attack() { if (!this.dead) this.atk = 0; }
  setDead(d: boolean) { if (d === this.dead) return; this.dead = d; this.settled = false; if (!d) { this.fall = 0; this.atk = -1; } }

  /** Largo del ataque en segundos. */
  protected abstract readonly atkLen: number;
  /** Dibuja la pose: ya están actualizados `t`, `mv`, `phase`, `atk`, `rec` y `fall`. */
  protected abstract anim(dt: number, speed: number): void;
  /** Cuánto cuesta (rad/s) cada m/s de velocidad en la cadencia de zancada. */
  protected abstract stride(speed: number): number;

  update(dt: number, speed: number) {
    if (this.dead && this.fall >= 1 && this.settled) return;
    dt = Math.min(dt, 0.1); this.t += dt;
    this.mv += ((this.dead ? 0 : smooth(speed, 0.15, 1.2)) - this.mv) * Math.min(1, dt * 9);
    this.phase += dt * this.stride(speed) * this.mv;
    this.rec = Math.max(0, this.rec - dt * 4.5);
    if (this.atk >= 0) { this.atk += dt; if (this.atk > this.atkLen) this.atk = -1; }
    this.fall = this.dead ? Math.min(1, this.fall + dt * 1.7) : 0;
    if (this.flash > 0 || this.mats[0]!.emissiveIntensity > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.mats) { m.emissive.setHex(0xffffff); m.emissiveIntensity = this.flash * 0.8; }
    }
    const k = this.dead ? 1 - this.fall * 0.95 : 1; for (const e of this.eyes) e.emissiveIntensity = this.eyeI * k;
    this.anim(dt, speed);
    if (this.dead && this.fall >= 1) this.settled = true;
  }
  dispose() { for (const m of this.mats) m.dispose(); for (const e of this.eyes) e.dispose(); }
}
