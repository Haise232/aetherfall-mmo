import * as THREE from "three";
import type { Dragon } from "./dragon";

// Silla y arreos de la montura de dragón (procedural, sin assets). Paleta heráldica: oro, gules y pizarra sobre cuero.
// Todo cuelga de `dragon.body` (sube y baja con el aleteo y se ladea con los giros) y se dibuja en METROS reales: la raíz
// compensa la escala del dragón. El origen de `root` es el punto del lomo donde se sienta el jinete (+Z hacia delante).
// Las riendas son dos tubos que cada fotograma siguen la cabeza del dragón (hueso Head001), así que se mueven con ella.

const GOLD = 0xe9b949, GULES = 0x9b2f3d, SLATE = 0x1d2a44, LEATHER = 0x6b4326, DARK = 0x3d2615;
const mats = {
  leather: new THREE.MeshLambertMaterial({ color: LEATHER, flatShading: true }),
  dark: new THREE.MeshLambertMaterial({ color: DARK, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.7, roughness: 0.35, flatShading: true }),
  gules: new THREE.MeshLambertMaterial({ color: GULES, flatShading: true, side: THREE.DoubleSide }),
  slate: new THREE.MeshLambertMaterial({ color: SLATE, flatShading: true }),
  rein: new THREE.MeshLambertMaterial({ color: 0x2a1a10 }),
};

const REIN_N = 10, REIN_SIDES = 4;
/** Altura del lomo y avance del asiento en el modelo a escala 1 (m). La altura real se mide sobre la malla al cargar (`fit`). */
const BACK = 2.75, SEAT_Z = 0.55;
const ray = new THREE.Raycaster();

const tmp = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

/** Tubo de 4 caras cuyos puntos se reescriben cada fotograma (sin reservar memoria). */
class Rein {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  constructor(private radius: number) {
    const g = new THREE.BufferGeometry(), n = (REIN_N + 1) * REIN_SIDES, idx: number[] = [];
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    g.setAttribute("position", this.pos);
    for (let i = 0; i < REIN_N; i++) for (let s = 0; s < REIN_SIDES; s++) {
      const a = i * REIN_SIDES + s, b = i * REIN_SIDES + (s + 1) % REIN_SIDES, c = a + REIN_SIDES, d = b + REIN_SIDES;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mats.rein); this.mesh.frustumCulled = false;
    this.mesh.material = new THREE.MeshBasicMaterial({ color: 0x2a1a10, side: THREE.DoubleSide });
  }
  /** Curva de `a` a `b` con una comba `sag` hacia abajo y un balanceo lateral `sway`. */
  set(a: THREE.Vector3, b: THREE.Vector3, sag: number, sway: number) {
    for (let i = 0; i <= REIN_N; i++) {
      const u = i / REIN_N, w = Math.sin(Math.PI * u);
      tmp.lerpVectors(a, b, u); tmp.y -= sag * w; tmp.x += sway * w;
      // base del tubo: cuatro puntos alrededor del eje (aprox. en el plano XY, basta para un cordón fino)
      for (let s = 0; s < REIN_SIDES; s++) {
        const an = s * Math.PI / 2 + Math.PI / 4;
        this.pos.setXYZ(i * REIN_SIDES + s, tmp.x + Math.cos(an) * this.radius, tmp.y + Math.sin(an) * this.radius, tmp.z);
      }
    }
    this.pos.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m); o.position.set(x, y, z); return o; };

export class DragonSaddle {
  /** Origen: el lomo donde se sienta el jinete, en metros reales y girando con el cuerpo del dragón. */
  readonly root = new THREE.Group();
  private reins: [Rein, Rein] = [new Rein(0.012), new Rein(0.012)];
  private flag: THREE.Mesh;
  private flagPos: THREE.BufferAttribute;
  private flagBase: Float32Array;
  private bridle = new THREE.Group(); // anillos del bocado: siguen a la cabeza cada fotograma
  private bitL = ball(0.035, mats.gold); private bitR = ball(0.035, mats.gold);
  private flap = 0;
  /** Altura del lomo bajo la silla en el modelo a escala 1 (se mide sobre la malla al cargar). */
  private top = BACK;
  /** Superficie del asiento (m reales sobre el origen del dragón) y su avance hacia delante: donde se sienta el jinete. */
  get seat() { return this.top * this.dragon.scale - 0.04 + SEAT_H; }
  get seatZ() { return SEAT_Z * this.dragon.scale; }

  constructor(private dragon: Dragon) {
    const r = this.root, k = 1 / dragon.scale;
    r.scale.setScalar(k); r.position.set(0, BACK, SEAT_Z);
    dragon.body.add(r);

    // manta de gules con ribete de pizarra y dorado, caída a los costados (sigue el lomo con una leve comba)
    const blanket = box(0.5, 0.025, 0.95, mats.gules, 0, -0.01, 0); r.add(blanket);
    for (const s of [-1, 1]) {
      const flap = box(0.1, 0.34, 0.9, mats.gules, s * 0.28, -0.17, 0); flap.rotation.z = s * -0.22; r.add(flap);
      const trim = box(0.105, 0.03, 0.92, mats.slate, s * 0.3, -0.33, 0); trim.rotation.z = s * -0.22; r.add(trim);
      const gl = box(0.108, 0.012, 0.93, mats.gold, s * 0.302, -0.355, 0); gl.rotation.z = s * -0.22; r.add(gl);
    }
    // silla de cuero: asiento, perilla delantera y borrén trasero con tachuelas doradas
    r.add(box(0.46, 0.09, 0.66, mats.leather, 0, 0.05, -0.02));
    r.add(box(0.4, 0.03, 0.5, mats.dark, 0, 0.105, -0.02)); // almohadilla
    const pom = box(0.2, 0.17, 0.09, mats.leather, 0, 0.14, 0.33); r.add(pom);
    r.add(ball(0.06, mats.gold, 0, 0.26, 0.34));
    r.add(box(0.46, 0.2, 0.08, mats.leather, 0, 0.17, -0.36)); // borrén
    for (let i = -2; i <= 2; i++) r.add(ball(0.022, mats.gold, i * 0.085, 0.2, -0.405));
    for (const s of [-1, 1]) r.add(ball(0.022, mats.gold, s * 0.22, 0.1, 0.3));
    // cinchas alrededor del pecho (anillos elípticos bajo la silla) con hebilla dorada a un costado
    for (const dz of [-0.2, 0.2]) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 18), mats.dark);
      g.scale.set(0.4, 0.62, 1); g.position.set(0, -0.62, dz); g.castShadow = true; r.add(g);
      r.add(box(0.05, 0.06, 0.05, mats.gold, 0.4, -0.6, dz));
    }
    r.add(box(0.03, 0.035, 0.4, mats.dark, 0.4, -0.6, 0), box(0.03, 0.035, 0.4, mats.dark, -0.4, -0.6, 0));
    // estribos: correa que cuelga de la silla y aro dorado
    for (const s of [-1, 1]) {
      r.add(box(0.025, 0.5, 0.03, mats.leather, s * 0.3, -0.2, 0.12));
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 10), mats.gold);
      st.position.set(s * 0.3, -0.46, 0.12); st.rotation.y = Math.PI / 2; r.add(st);
    }
    // alforjas detrás de la silla
    for (const s of [-1, 1]) {
      const bag = box(0.15, 0.22, 0.3, mats.leather, s * 0.3, -0.06, -0.52); bag.rotation.z = s * -0.12; r.add(bag);
      r.add(box(0.155, 0.05, 0.31, mats.dark, s * 0.3, 0.04, -0.52));
      r.add(ball(0.025, mats.gold, s * 0.38, -0.02, -0.38));
    }
    // estandarte: asta con punta dorada y bandera de gules con cola de golondrina y un rombo dorado
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 1.25, 5), mats.dark); pole.position.set(0.17, 0.65, -0.46); r.add(pole);
    r.add(ball(0.035, mats.gold, 0.17, 1.29, -0.46));
    const fg = new THREE.PlaneGeometry(0.62, 0.26, 6, 1); fg.translate(0.31, 0, 0);
    this.flagBase = (fg.attributes.position as THREE.BufferAttribute).array.slice() as Float32Array;
    this.flagPos = fg.attributes.position as THREE.BufferAttribute;
    this.flag = new THREE.Mesh(fg, mats.gules); this.flag.rotation.y = Math.PI / 2; this.flag.position.set(0.17, 1.1, -0.46); r.add(this.flag);
    this.flag.add(ball(0.05, mats.gold, 0.14, 0, 0.003));
    // bocado: dos anillos dorados a los lados de las fauces; el resto lo hacen las riendas
    for (const m of [this.bitL, this.bitR]) { m.scale.setScalar(1.2); r.add(m); }
    for (const rn of this.reins) r.add(rn.mesh);
    r.add(this.bridle);
    r.traverse(o => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
    void dragon.ready.then(() => this.fit());
  }

  /** Mide el lomo con un rayo hacia abajo sobre la malla (en reposo) y apoya la silla encima. */
  private fit() {
    const g = this.dragon.group; g.updateMatrixWorld(true);
    const from = new THREE.Vector3(0, 8, SEAT_Z).applyMatrix4(g.matrixWorld), dir = new THREE.Vector3(0, -1, 0).transformDirection(g.matrixWorld);
    ray.set(from, dir);
    const hit = ray.intersectObjects(this.dragon.body.children.filter(c => c !== this.root), true)[0];
    if (hit) { const y = g.worldToLocal(hit.point.clone()).y; if (y > 2 && y < 4.5) this.top = y; }
    this.root.position.y = this.top - 0.04 / this.dragon.scale;
  }

  /** Cada fotograma, tras `dragon.update`: reajusta las riendas a la cabeza y mece el estandarte. */
  update(dt: number, t: number, speed: number) {
    const d = this.dragon, head = d.bone("Head001");
    // estandarte: ondea más cuanto más rápido vuela
    this.flap += dt * (5 + speed * 0.5);
    const amp = 0.04 + Math.min(0.12, speed * 0.006);
    for (let i = 0; i < this.flagPos.count; i++) {
      const x = this.flagBase[i * 3]!;
      this.flagPos.setZ(i, Math.sin(this.flap - x * 9) * amp * (x / 0.62));
      this.flagPos.setY(i, this.flagBase[i * 3 + 1]! * (1 - 0.25 * Math.max(0, x / 0.62 - 0.7) * (this.flagBase[i * 3 + 1]! > 0 ? 1 : 1)));
    }
    this.flagPos.needsUpdate = true;
    if (!head) { this.reins[0].mesh.visible = this.reins[1].mesh.visible = false; this.bitL.visible = this.bitR.visible = false; return; }
    this.root.updateWorldMatrix(true, false);
    d.group.updateMatrixWorld(true);
    // el bocado: punta del hocico a ambos lados (en coordenadas de la cabeza), llevado al marco de la silla
    head.getWorldPosition(tmp); head.getWorldQuaternion(tmpQ);
    // ejes del hueso de la cabeza (Blender): Y apunta hacia el hocico, X al costado y Z hacia abajo
    const side = tmpB.set(1, 0, 0).applyQuaternion(tmpQ), fwd = tmpC.set(0, 1, 0).applyQuaternion(tmpQ), dn = tmpD.set(0, 0, 1).applyQuaternion(tmpQ);
    const base = tmp.clone();
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1, end = base.clone().addScaledVector(side, s * BIT.side * d.scale).addScaledVector(fwd, BIT.fwd * d.scale).addScaledVector(dn, BIT.down * d.scale);
      this.root.worldToLocal(end);
      const bit = i === 0 ? this.bitL : this.bitR; bit.visible = true; bit.position.copy(end);
      const start = new THREE.Vector3(s * 0.12, 0.3, 0.33);
      this.reins[i]!.mesh.visible = true;
      this.reins[i]!.set(start, end, 0.12 + Math.min(0.2, speed * 0.01), Math.sin(t * 2 + i) * 0.015);
    }
  }

  dispose() {
    this.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
    this.reins.forEach(r => r.dispose());
    this.root.removeFromParent();
  }
}

/** Dónde queda el bocado respecto al hueso de la mandíbula, en los ejes de la cabeza (m del modelo a escala 1). */
/** Altura del asiento sobre el origen de la silla (m reales): cojín encima del cuero. */
const SEAT_H = 0.12;
const BIT = { side: 0.28, fwd: 1.0, down: 0.15 };
