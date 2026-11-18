// Lobo y jabalí: mismo esqueleto de cuadrúpedo (columna en dos mitades, patas de dos huesos, cuello y cabeza, cola en
// cadena) con cuerpos y comportamientos distintos. Todo procedural: geometría compartida y color por vértice.
import * as THREE from "three";
import { Beast, ball, blob, cone, clamp01, lerp, limb, shared, smooth, type Pal } from "./beast";

const FUR = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const solid = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
const DARK = solid(0x2b2d31), NOSE = solid(0x0d0d0f, { roughness: 0.4 }), TOOTH = solid(0xf0ecdd), INNER = solid(0x6a4a48);
const BRISTLE = solid(0x2a211c), SKIN = solid(0x8a6658), HOOF = solid(0x1c1715), IVORY = solid(0xe9e0c4, { side: THREE.DoubleSide });
const WOLF_PAL: Pal = [0xc4bfb2, 0x7a7b7d, 0x3f4247], WOLF_LEG: Pal = [0x6c6c6e, 0x6a6b6e, 0x4b4d52], WOLF_FACE: Pal = [0xd2cec2, 0xa7a49b, 0x6b6c6e];
const BOAR_PAL: Pal = [0x9a8268, 0x624a38, 0x2e2520], BOAR_LEG: Pal = [0x4a3a2f, 0x4a3a2f, 0x362b24];
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** Colmillo curvo y afilado: tubo con la sección que se estrecha hacia la punta. */
const tusk = (side: number, big: number) => shared(`tusk${side},${big}`, () => {
  const pts = [[0, 0, 0], [0.035, 0.0, 0.06], [0.075, 0.04, 0.1], [0.1, 0.11, 0.115], [0.095, 0.19, 0.095]].map(([x, y, z]) => new THREE.Vector3(x! * side * big, y! * big, z! * big));
  const c = new THREE.CatmullRomCurve3(pts), seg = 8, rad = 5, g = new THREE.TubeGeometry(c, seg, 0.03 * big, rad, false), p = g.attributes.position as THREE.BufferAttribute, q = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) { const o = c.getPointAt(i / seg), k = 1 - 0.92 * (i / seg); for (let j = 0; j <= rad; j++) { const n = i * (rad + 1) + j; q.fromBufferAttribute(p, n).sub(o).multiplyScalar(k).add(o); p.setXYZ(n, q.x, q.y, q.z); } }
  g.computeVertexNormals(); return g;
});

interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number; i: number; }
const TROT = [0, Math.PI, Math.PI, 0], GALLOP = [0, 0.5, 2.7, 2.3]; // fase de cada pata: DI, DD, TI, TD

export class Quad extends Beast {
  readonly height: number; readonly ring: number; protected readonly atkLen: number;
  private readonly boar: boolean; private cy: number; private halfW: number;
  private F: THREE.Group; private R: THREE.Group; private head: THREE.Group; private jaw: THREE.Group; private neck: THREE.Mesh; private chest: THREE.Mesh; private belly: THREE.Mesh;
  private ears: THREE.Mesh[] = []; private tail: THREE.Group[] = []; private legs: Leg[] = [];
  private bu = [0, 0, 0, 0]; // pose base de cada hueso (fore: recto; hind: rodilla adelante, corvejón atrás)
  private side = this.seed < 0.5 ? 1 : -1;
  private az = 0; private ay = 0; private ap = 0; private aj = 0; private al = 0; private ah = 0; // desplazamiento, salto, cabeceo, mandíbula y alcance del ataque
  private sniffAt = Math.random() * 10;

  constructor(boar: boolean) {
    super(boar ? [1.3, 1.3, 2.3] : [1.1, 1.25, 2.1], boar ? 0.65 : 0.7, boar ? [0.85, 1.35] : [0.7, 1.25]);
    this.boar = boar; this.height = boar ? 1.65 : 1.55; this.ring = boar ? 1.7 : 1.35; if (boar) this.group.scale.setScalar(1.3); this.atkLen = boar ? 1.0 : 0.8;
    this.cy = boar ? 0.66 : 0.68; this.halfW = boar ? 0.38 : 0.26;
    const { root } = this, tone = (this.seed - 0.5) * 0.3;
    const fur = this.own(FUR, tone), legFur = this.own(FUR, tone), dark = this.own(boar ? BRISTLE : DARK), face = this.own(boar ? SKIN : FUR, boar ? 0 : tone);
    if (!boar && this.seed2() > 0.55) { const warm = new THREE.Color(0xd9bf9a); fur.color.lerp(warm, 0.3); legFur.color.lerp(warm, 0.25); }
    const earM = this.own(solid(0x5e4838)), legSolid = this.own(solid(boar ? 0x4d3b2f : 0x4b4d52)), eye = this.eye(boar ? 0xe8521a : 0xffb81c, boar ? 0.9 : 1.1), nose = this.own(NOSE), tooth = this.own(TOOTH), inner = this.own(INNER), hoof = this.own(boar ? HOOF : DARK);
    const m = (g: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Object3D, x = 0, y = 0, z = 0) => this.mesh(g, mat, p, x, y, z);

    // Columna: delantera (pecho, hombros, cuello, cabeza, patas) y trasera (grupa, patas, cola) con torso en medio.
    const fy = boar ? 0.74 : 0.76, ry = boar ? 0.68 : 0.72, fz = boar ? 0.45 : 0.38, rz = boar ? -0.46 : -0.4;
    const F = this.F = this.node(root, 0, fy, fz), R = this.R = this.node(root, 0, ry, rz);
    const pal = boar ? BOAR_PAL : WOLF_PAL;
    this.chest = m(blob(boar ? 0.36 : 0.27, boar ? 0.4 : 0.33, boar ? 0.44 : 0.4, pal, 1), fur, F, 0, -0.03, 0.04);
    m(blob(boar ? 0.3 : 0.29, boar ? 0.17 : 0.2, boar ? 0.34 : 0.3, pal, 1, 0.12, 0.2), fur, F, 0, boar ? 0.2 : 0.15, -0.02); // lomo/crin
    m(blob(boar ? 0.35 : 0.26, boar ? 0.37 : 0.31, boar ? 0.42 : 0.36, pal, 1), fur, R, 0, 0, -0.04);
    this.belly = m(blob(boar ? 0.34 : 0.24, boar ? 0.36 : 0.28, boar ? 0.55 : 0.46, pal, 1), fur, root, 0, boar ? 0.66 : 0.68, 0.0);

    // Mechones de la crin/lomo: cerdas rígidas en el jabalí, pelo erizado en el lobo.
    const nT = boar ? 9 : 6;
    for (let i = 0; i < nT; i++) {
      const z = lerp(boar ? 0.5 : 0.35, boar ? -0.8 : -0.5, i / (nT - 1)), top = boar ? 0.5 - Math.abs(z - 0.25) * 0.15 : 0.5;
      const c = m(boar ? cone(0.045 + (i % 2) * 0.01, 0.3 - i * 0.012, 4) : cone(0.075, 0.2, 4), boar ? dark : fur, root, 0, (boar ? 0.98 : 0.98) - Math.abs(i - 2) * (boar ? 0.01 : 0.012) - 0.0 * top, z);
      c.rotation.x = boar ? -0.45 : -0.6; c.rotation.z = (i % 2 ? 1 : -1) * 0.12; c.scale.set(1, 1, 1);
    }

    // Cuello y cabeza.
    this.neck = m(blob(boar ? 0.26 : 0.16, boar ? 0.26 : 0.2, boar ? 0.28 : 0.3, pal, 1), fur, F, 0, boar ? -0.02 : 0.1, boar ? 0.46 : 0.3);
    this.neck.rotation.x = boar ? 0.15 : -0.45;
    const head = this.head = this.node(F, 0, boar ? 0.04 : 0.2, boar ? 0.6 : 0.48), jaw = this.jaw = this.node(head, 0, boar ? -0.1 : -0.075, boar ? 0.12 : 0.16);
    if (!boar) {
      m(blob(0.15, 0.14, 0.17, WOLF_FACE, 1), face, head, 0, 0, 0.06);
      m(blob(0.07, 0.065, 0.2, WOLF_FACE, 1, 0.05, 0.06), face, head, 0, -0.035, 0.28); // hocico alargado
      m(blob(0.042, 0.034, 0.032, [0x111111, 0x111111, 0x1c1c1c], 0), nose, head, 0, -0.012, 0.47);
      m(blob(0.055, 0.028, 0.16, [0x4a4b4e, 0x5a5a5c, 0x6a6a6c], 0, 0.05), dark, jaw, 0, 0, 0.09);
      for (const s of [-1, 1]) {
        m(cone(0.016, 0.06, 4), tooth, head, s * 0.045, -0.06, 0.38).rotation.x = Math.PI; // colmillos de arriba
        m(cone(0.014, 0.05, 4), tooth, jaw, s * 0.035, 0.0, 0.17);
        const brow = m(blob(0.045, 0.02, 0.06, [0x303236, 0x303236, 0x303236], 0), dark, head, s * 0.085, 0.085, 0.16); brow.rotation.z = -s * 0.5; // ceño
        m(ball(0.026, 6), eye, head, s * 0.082, 0.05, 0.17).scale.set(0.7, 0.9, 1.2);
        const ear = m(cone(0.06, 0.19, 4), fur, head, s * 0.085, 0.12, -0.02); ear.rotation.z = -s * 0.22; this.ears.push(ear);
        m(cone(0.035, 0.12, 3), inner, ear, 0, 0.01, 0.025).scale.set(1, 1, 0.6);
        for (let k = 0; k < 3; k++) { const tuft = m(cone(0.045, 0.15 - k * 0.02, 4), fur, head, s * (0.13 + k * 0.004), -0.03 - k * 0.045, 0.02 + k * 0.01); tuft.rotation.set(-1.45 - k * 0.1, 0, -s * (0.65 + k * 0.1)); } // pelaje de las mejillas
      }
      // Gola: crin que enmarca el cuello.
      for (let k = 0; k < 5; k++) { const a = (k / 4 - 0.5) * 2.2, tf = m(cone(0.06, 0.2, 4), fur, F, Math.sin(a) * 0.2, 0.08 - Math.abs(a) * 0.08 - 0.07, 0.42 + Math.cos(a) * 0.04); tf.rotation.set(-0.5, 0, -a * 0.5); }
    } else {
      m(blob(0.2, 0.2, 0.25, [0x5a4437, 0x4f3b30, 0x3a2d26], 1), fur, head, 0, 0, 0.05);
      m(blob(0.115, 0.1, 0.27, [0x7a5c4e, 0x6d5043, 0x57413a], 1, 0.05, 0.06), face, head, 0, -0.06, 0.32); // hocico
      const disc = m(shared("nariz", () => new THREE.CylinderGeometry(0.085, 0.085, 0.07, 8)), nose, head, 0, -0.045, 0.6); disc.rotation.x = Math.PI / 2; disc.scale.set(1, 1, 0.85); // jeta chata
      m(blob(0.09, 0.045, 0.2, [0x5a4437, 0x6d5043, 0x7a5c4e], 0, 0.05), face, jaw, 0, 0, 0.12);
      for (const s of [-1, 1]) {
        m(tusk(s, 1.35), IVORY, head, s * 0.1, -0.1, 0.4); // colmillos inferiores curvos
        m(tusk(s, 0.7), IVORY, head, s * 0.085, -0.08, 0.47).rotation.x = 0.2;
        m(ball(0.026, 6), eye, head, s * 0.15, 0.07, 0.2);
        const brow = m(blob(0.05, 0.022, 0.07, [0x1e1814, 0x1e1814, 0x1e1814], 0), dark, head, s * 0.15, 0.115, 0.2); brow.rotation.z = -s * 0.35;
        const ear = m(cone(0.075, 0.2, 3), earM, head, s * 0.13, 0.18, -0.06); ear.rotation.set(0.5, 0, -s * 1.0); this.ears.push(ear);
        m(blob(0.07, 0.06, 0.09, BOAR_PAL, 0), fur, head, s * 0.16, -0.02, 0.0); // papada
      }
    }

    // Cola: cadena de segmentos (tupida en el lobo, fina con borla en el jabalí).
    const root2 = this.node(R, 0, boar ? 0.12 : 0.1, boar ? -0.34 : -0.32); let parent: THREE.Object3D = root2;
    const segs = boar ? [[0.035, 0.035, 0.12], [0.03, 0.03, 0.12]] : [[0.09, 0.09, 0.17], [0.125, 0.125, 0.19], [0.11, 0.11, 0.17]];
    segs.forEach(([rx, ry, rz], i) => {
      const n = this.node(parent, 0, 0, i ? -(segs[i - 1]![2]! * 1.6) : -0.0); parent = n; this.tail.push(n);
      m(blob(rx!, ry!, rz!, boar ? BOAR_PAL : [0xc4bfb2, 0x7a7b7d, i === segs.length - 1 ? 0x24262a : 0x45484d], 1), i === segs.length - 1 && !boar ? fur : fur, n, 0, 0, -rz! * 0.9);
    });
    if (boar) { m(blob(0.05, 0.05, 0.07, [0x2a211c, 0x2a211c, 0x2a211c], 0), dark, parent, 0, 0, -0.18); }

    // Patas: pivote en la cadera; hueso superior (muslo grueso), inferior fino y pezuña/garra.
    const uL = boar ? 0.28 : 0.32, lL = boar ? 0.3 : 0.34;
    const addLeg = (x: number, front: boolean, i: number) => {
      const par = front ? F : R, hip = this.node(par, x, -0.07, front ? 0.04 : -0.0);
      const th = front ? (boar ? 0.095 : 0.075) : (boar ? 0.12 : 0.1), tl = front ? 0.18 : 0.21;
      m(blob(th, uL * 0.62, th * 1.1, boar ? BOAR_PAL : [0x77797c, 0x77797c, 0x55585d], 1, 0.06), legFur, hip, 0, -uL * 0.45, front ? 0 : 0.02);
      const knee = this.node(hip, 0, -uL, 0);
      m(limb(boar ? 0.075 : 0.048, boar ? 0.05 : 0.03, lL, 6), legSolid, knee, 0, 0, 0).rotation.x = Math.PI / 2; // eje +Z → hacia abajo
      m(blob(boar ? 0.06 : 0.052, boar ? 0.04 : 0.035, boar ? 0.075 : 0.085, boar ? [0x1c1715, 0x1c1715, 0x1c1715] : [0x4b4d52, 0x4b4d52, 0x35373b], 0, 0.05), hoof, knee, 0, -lL, 0.025);
      void tl;
      this.legs.push({ hip, knee, front, side: x < 0 ? -1 : 1, i });
    };
    const lx = boar ? 0.26 : 0.2;
    addLeg(-lx, true, 0); addLeg(lx, true, 1); addLeg(-lx, false, 2); addLeg(lx, false, 3);
    this.bu = boar ? [0.05, 0.05, -0.25, -0.25] : [0.0, 0.0, -0.45, -0.45]; // base del hueso superior
  }
  private seed2() { return (this.seed * 7.31) % 1; }
  protected stride(speed: number) { return Math.max(speed, 0.6) * (this.boar ? 4.6 : 4.4) * (1 - 0.18 * smooth(speed, 2.4, 3.6)); }

  private atkPose() {
    this.az = this.ay = this.ap = this.aj = this.al = this.ah = 0;
    if (this.atk < 0) return;
    const u = this.atk / this.atkLen;
    if (!this.boar) { // salto: se agazapa, salta con las fauces abiertas y cierra la dentellada al caer
      if (u < 0.25) { const w = ease(u / 0.25); this.az = -0.14 * w; this.ay = -0.07 * w; this.ap = 0.2 * w; this.aj = 0.25 * w; this.al = -0.35 * w; this.ah = -0.3 * w; }
      else if (u < 0.62) {
        const k = (u - 0.25) / 0.37; this.az = lerp(-0.14, 0.75, ease(k)); this.ay = Math.sin(k * Math.PI) * 0.4 - 0.07 * (1 - k); this.ap = lerp(0.2, -0.12, k);
        this.aj = k < 0.62 ? lerp(0.25, 1.0, k / 0.62) : lerp(1.0, 0, clamp01((k - 0.62) / 0.14)); this.al = Math.sin(k * Math.PI) * 0.9 - 0.35 * (1 - k); this.ah = lerp(-0.3, 0.15, k);
      } else { const e = 1 - (u - 0.62) / 0.38; this.az = 0.75 * e * e; this.ap = -0.05 * e; this.al = 0.15 * e; this.ah = 0.15 * e; }
    } else { // embestida: escarba, baja la cabeza, carga y alza los colmillos
      if (u < 0.32) { const w = ease(u / 0.32); this.az = -0.12 * w; this.ap = 0.12 * w; this.aj = 0.2 * w; this.al = -0.5 * w; this.ah = 0.45 * w; }
      else if (u < 0.62) { const k = ease((u - 0.32) / 0.3); this.az = lerp(-0.12, 0.95, k); this.ap = lerp(0.12, -0.2, k); this.aj = 0.2; this.ah = 0.45 + 0.2 * k; this.al = Math.sin(k * 3.14) * 0.5; this.ay = 0.04 * Math.sin(k * 3.14); }
      else { const k = (u - 0.62) / 0.38, e = 1 - k; this.az = 0.95 * e * e; this.ap = -0.2 * e; this.ah = 0.65 * e - Math.sin(Math.min(1, k * 2.2) * Math.PI) * 1.0 * (1 - k * 0.6); this.aj = 0.5 * Math.sin(Math.min(1, k * 2.4) * Math.PI) * (1 - k); } // cornada hacia arriba
    }
  }

  protected anim(dt: number, speed: number) {
    const { boar, t, mv, fall, rec } = this, run = smooth(speed, boar ? 2.4 : 1.9, boar ? 3.6 : 3.3) * mv, bf = 1 - (1 - fall) * (1 - fall) * (1 - fall);
    this.atkPose();
    const { az, ay, ap, aj, al, ah } = this, atk = this.atk >= 0 ? 1 : 0, still = 1 - mv;
    const amp = (boar ? 0.45 : 0.5) + 0.3 * run, bend = boar ? 0.9 : 1.15, br = Math.sin(t * (boar ? 1.8 : 2.3)) * 0.5 + 0.5;
    const rise = ap; // cabeceo del tronco (+: hocico arriba)

    // Patas: balanceo + flexión de rodilla; en el salto/embestida se estiran o empujan.
    for (const l of this.legs) {
      const p = this.phase + lerp(TROT[l.i]!, GALLOP[l.i]!, run), f = Math.sin(p), lift = Math.max(0, Math.cos(p));
      let hip = this.bu[l.i]! - f * amp * (l.front ? 1 : 0.85) * mv, kn = (l.front ? 0.0 : 0.65) + lift * bend * mv;
      if (l.front) { hip -= al * 1.0 * (boar && l.side > 0 ? 0.3 : 1) + (boar && atk && this.atk / this.atkLen < 0.32 && l.side > 0 ? Math.sin(t * 24) * 0.25 - 0.5 * (this.atk / this.atkLen) : 0); kn += Math.max(0, al) * 0.6; }
      else { hip += al * 0.7; kn += Math.max(0, al) * 0.3; }
      // pata muerta: relajada y algo estirada, con la rodilla suelta
      const dp = l.front ? -0.5 * (l.side > 0 ? 1 : 0.4) : 0.7, dk = l.front ? 0.3 : 0.5;
      l.hip.rotation.x = lerp(hip, dp, bf); l.knee.rotation.x = lerp(kn, dk, bf);
      l.hip.rotation.z = l.side * 0.0 + (this.dead ? l.side * 0.12 * bf : 0);
    }

    // Tronco: rebote del trote, flexión de la columna al galope, respiración y retroceso al golpe.
    const s1 = Math.sin(this.phase), c2 = Math.cos(this.phase * 2), gal = run;
    const bob = (c2 * 0.022 * (1 - gal) + (Math.sin(this.phase + 1.2) * 0.5 + 0.5) * 0.1 * gal) * mv;
    const rc = rec;
    this.root.position.set(0, bob + ay - rc * 0.03, az - rc * (boar ? 0.14 : 0.2) * 1);
    this.root.rotation.x = -rise * 0.5 + s1 * 0.025 * mv + rc * 0.1;
    this.F.rotation.x = -rise * 0.5 + s1 * 0.1 * gal * mv - rc * 0.16; this.R.rotation.x = -s1 * 0.09 * gal * mv + (atk && !boar && this.atk / this.atkLen < 0.25 ? 0.2 : 0);
    this.chest.scale.set(1, 1 + br * 0.035, 1 + br * 0.02); this.belly.scale.set(1 + br * 0.03, 1, 1);
    // Cabeza: olfatea (baja y cabecea), vigila (gira a los lados), baja al correr; arriba al ser golpeada.
    const sn = still * smooth(Math.sin(t * 0.42 + this.sniffAt), 0.55, 0.85), look = Math.sin(t * 0.7 + this.sniffAt) * 0.28 * still * (1 - sn) + Math.sin(t * 0.37) * 0.1 * still;
    const baseX = boar ? 0.45 : 0.06 + 0.12 * run;
    const hx = baseX + ah + sn * (boar ? 0.3 : 0.55) + Math.sin(t * 15) * 0.035 * sn + Math.sin(t * 1.4) * 0.025 - rc * 0.3 + Math.sin(this.phase) * (boar ? 0.06 : -0.03) * mv;
    this.head.rotation.set(lerp(hx, 0.45, bf), lerp(look + Math.sin(this.phase) * 0.04 * mv, 0.0, bf), lerp(Math.sin(t * 0.8) * 0.03, this.side * 0.3, bf));
    this.neck.rotation.x = (boar ? 0.15 : -0.45) + sn * 0.2;
    this.jaw.rotation.x = Math.max(aj, rec * 0.25, (boar ? 0 : 0.03 + Math.sin(t * 3) * 0.02 * mv)) * (1 - bf) + 0.28 * bf;
    // Orejas: tiesas y giratorias; pegadas hacia atrás al atacar o recibir un golpe.
    const flat = Math.max(atk, rec > 0 ? 1 : 0);
    this.ears.forEach((e, i) => { const s = i ? 1 : -1, tw = Math.sin(t * 0.5 + i) > 0.7 ? 0.25 : 0.04; e.rotation.x = (boar ? 0.5 : 0) - flat * 0.7 + Math.sin(t * 9 + i * 2.1) * tw; e.rotation.z = -s * ((boar ? 1.0 : 0.22) + flat * (boar ? 0.3 : 0.5)); });
    // Cola: baja al estar quieto, se mueve despacio (lobo) o en un resorte nervioso (jabalí) y se eriza al atacar.
    const tl = this.tail.length;
    for (let i = 0; i < tl; i++) {
      const w = Math.sin(t * (boar ? 6 : 1.8 + run * 5) - i * 0.9) * (boar ? 0.22 : 0.18 + 0.2 * run) * (1 + still * 0.0);
      this.tail[i]!.rotation.y = w * (i ? 1 : 0.6);
      this.tail[i]!.rotation.x = i ? (boar ? 0.5 : -0.3) * (1 - bf) - 0.2 * bf : (boar ? 0.9 : -0.75 + run * 0.75 + atk * 0.35) * (1 - bf) - 0.6 * bf;
    }
    // Caída: se desploma de lado y queda tendido.
    const r = bf * 1.5, sr = Math.sin(r);
    this.root.rotation.z = this.side * r; this.root.position.x = this.side * this.cy * sr; this.root.position.y += this.halfW * sr * 0.95 - bf * 0.02;
    if (bf > 0) { this.F.rotation.x += -0.12 * bf; this.root.rotation.x += 0.05 * bf; }
    void dt;
  }
}
