import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { DRAGON_LAIR } from "@mmorpg/shared";
import { FireFx, newU, plainMaterials, skinMaterial, tagGeometry, wingMaterial } from "./dragonFx";

// Dragón: "Dragon Rigged" de na3ee1 (CC-BY 3.0, Poly Pizza; ver public/models/CREDITOS.md).
// El modelo trae esqueleto pero ninguna animación: aquí se anima por código girando huesos sobre ejes del propio
// modelo (mira a +Z, alas en ±X). Ojo: los nodos del archivo vienen en una pose rara (ala derecha doblada), así que al
// montarlo se llama a `skeleton.pose()` para volver a la pose de enlace, simétrica (alas en T).
// Se usa a dos tamaños: el jefe (Vermithrax) y la montura voladora que se gana al derrotarlo.
// Materiales y fuego: ver dragonFx.ts.

let gltf: Promise<GLTF> | null = null;
const load = () => (gltf ??= new GLTFLoader().loadAsync("/models/Dragon.glb"));
export const preloadDragon = () => load();

/** Medidas del modelo a escala 1 (metros): alto de la cabeza, del lomo y envergadura. */
const MODEL = { back: 2.75, seatZ: 0.55, head: 5 };
const HEAD = new THREE.Vector3(0, 3.6, 2.8); // dónde está la cabeza (marco del modelo), para apuntar la mirada
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (k: number) => k * k * (3 - 2 * k);
const rate = (dt: number, r: number) => 1 - Math.exp(-dt * r);

interface Bone { b: THREE.Object3D; rest: THREE.Quaternion; inv: THREE.Quaternion } // inv: giro de reposo en el marco del modelo, invertido
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpM = new THREE.Matrix4();

const FINGERS = ["1", "2", "3", "4"];
const NECK: [string, number][] = [["Spine005", 0.08], ["Spine006", 0.14], ["Spine007", 0.2], ["Spine008", 0.2], ["Spine009", 0.16], ["SkullControl", 0.22]]; // reparto de la mirada por el cuello (suma 1)
const BREATH_IN = 0.4, FIRE_T = 1.2, ROAR_T = 1.7;

export interface DragonState {
  speed: number; // m/s sobre el suelo
  climb?: number; // m/s vertical (al subir aletea más fuerte; al bajar planea)
  turn?: number; // velocidad de giro (rad/s, positiva a la izquierda): se ladea y la cola se arrastra
  grounded?: boolean; // posado (alas plegadas de verdad, patas en el suelo)
  dead?: boolean;
}

export class Dragon {
  readonly group = new THREE.Group(); // escala aplicada aquí
  readonly body = new THREE.Group(); // sube y baja con cada aletazo
  readonly hitbox: THREE.Mesh;
  /** Altura del lomo (donde se sienta el jinete) en metros, ya escalada; y su desplazamiento hacia delante. */
  readonly seat: number; readonly seatZ: number;
  private bones: Record<string, Bone> = {};
  private tail: Bone[] = [];
  private ty = new Float32Array(7); // cola: ángulo de cada tramo (cada uno sigue al anterior con retraso)
  private t = Math.random() * 100;
  private phase = Math.random() * 6;
  private flapAmp = 0.4;
  private g = 0; // 0 vuelo .. 1 posado
  private gl = 0; private glideT = 0; private beats = 0; private lastS = 0; // planeo
  private deadT = 0; private deadAge = 0;
  private breathT = -1; private roarT = -1; private flinchT = 0;
  private target: THREE.Vector3 | null = null;
  private neckYaw = 0; private headYaw = 0; private neckPitch = 0; private headPitch = 0;
  private sniffT = -1; private sniffCd = 3 + Math.random() * 4;
  private pitchB = 0; private rollB = 0; private glow = 0; private lastTurn = 0;
  private fx: FireFx;
  private u = newU();
  private mats: ReturnType<typeof plainMaterials> | null = null;
  private owned: THREE.Material[] = [];
  private mouth = new THREE.Object3D();
  private readyResolve!: () => void;
  /** Se cumple cuando el modelo ya está cargado y montado (huesos disponibles). */
  readonly ready = new Promise<void>(r => (this.readyResolve = r));

  // ---- Contrato con el resto del juego (main.ts, montura, sonido) ----
  /** Se llama en cada aletazo hacia abajo (fuerza 0..1): para el sonido del batir de alas y el polvo cerca del suelo. */
  onWingbeat?: (strength: number) => void;
  /** Se llama al empezar a escupir fuego (empieza la inspiración; el fuego sale 0,4 s después) y al rugir: para el sonido. */
  onBreath?: () => void;
  onRoar?: () => void;
  /** Hueso por nombre (sin puntos: "Spine004", "Chest", "Head001"...), o undefined si aún no ha cargado. Para enganchar la silla. */
  bone(name: string): THREE.Object3D | undefined { return this.bones[name]?.b; }
  /** Ruge (cabeza atrás, boca abierta y alas en alto, ~1,7 s). */
  roar() { if (this.roarT >= 0 || this.deadT > 0) return; this.roarT = 0; this.onRoar?.(); }
  /** Encaja un golpe (respingo: cabeza atrás, alas arriba y destello rojizo). */
  flinch() { this.flinchT = 1; }
  /** Mira hacia un punto del mundo (o deja de mirar con null): cuello y cabeza giran hacia él, con suavizado y límites. */
  lookAt(target: THREE.Vector3 | null) { this.target = target; }
  /** El dragón está a medio fuego/rugido (por si quien lo usa quiere esperar). */
  get busy() { return this.breathT >= 0 || this.roarT >= 0; }

  constructor(readonly scale: number, opts: { shadow?: boolean } = {}) {
    this.group.scale.setScalar(scale);
    this.group.add(this.body);
    this.seat = MODEL.back * scale; this.seatZ = MODEL.seatZ * scale;
    // caja invisible para hacer clic (en unidades del modelo)
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 10), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.set(0, 3, 0.5); this.group.add(this.hitbox);
    // fuego y humo (en el marco del modelo: siguen al dragón)
    this.fx = new FireFx(scale);
    this.group.add(...this.fx.pts);
    void load().then(g => this.attach(g, !!opts.shadow));
  }

  private attach(g: GLTF, shadow: boolean) {
    const model = SkeletonUtils.clone(g.scene);
    const m = this.mats = plainMaterials(), skin = skinMaterial(this.u), wing = wingMaterial(this.u);
    this.owned.push(skin, wing, ...Object.values(m));
    let sk: THREE.Skeleton | null = null;
    model.traverse(o => {
      const s = o as THREE.SkinnedMesh;
      if (!s.isMesh) return;
      o.castShadow = shadow; o.frustumCulled = false;
      const name = (s.material as THREE.Material).name;
      if (s.isSkinnedMesh) { tagGeometry(s); sk ??= s.skeleton; }
      s.material = name === "DarkGreen" ? skin : name === "Green" ? wing : ((m as Record<string, THREE.Material>)[name] ?? s.material);
    });
    (sk as THREE.Skeleton | null)?.pose(); // vuelve a la pose de enlace (simétrica)
    this.body.add(model);
    model.updateMatrixWorld(true);
    const rootInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    model.traverse(o => {
      if (!(o as THREE.Bone).isBone) return;
      const w = rootInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
      this.bones[o.name] = { b: o, rest: o.quaternion.clone(), inv: w.invert() };
    });
    this.tail = [1, 2, 3, 4, 5, 6, 7].map(i => this.bones[`Tail00${i}`]).filter((b): b is Bone => !!b);
    const jaw = this.bones.Jaw001?.b;
    if (jaw) { jaw.add(this.mouth); this.mouth.position.set(0, 0.012, 0); } // punta del hocico (unidades del hueso, que va a escala 1/100)
    this.readyResolve();
  }

  /** Gira un hueso sobre ejes del modelo (x, y, z en radianes) a partir de su pose de reposo. */
  private rot(name: string, x: number, y: number, z = 0) {
    const b = this.bones[name]; if (!b) return;
    b.b.quaternion.copy(b.rest);
    if (z) { tmpV.copy(Z).applyQuaternion(b.inv); b.b.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV, z)); }
    if (y) { tmpV.copy(Y).applyQuaternion(b.inv); b.b.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV, y)); }
    if (x) { tmpV.copy(X).applyQuaternion(b.inv); b.b.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV, x)); }
  }
  /** Igual que `rot` para el par izquierdo/derecho: el derecho lleva Y y Z con el signo cambiado (espejo). */
  private pair(n: string, x: number, y: number, z = 0) { this.rot(n + "L", x, y, z); this.rot(n + "R", x, -y, -z); }

  /** Escupe fuego: ~0,4 s de inspiración (cabeza atrás, garganta que brilla) y ~1,2 s de llamas. */
  breathe() { if (this.deadT > 0) return; this.breathT = 0; this.roarT = -1; this.onBreath?.(); }

  update(dt: number, s: DragonState) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (!this.bones.Spine001) { this.fx.step(dt, this.t); return; }
    const t = this.t, u = this.u;
    const fast = clamp(s.speed / 14, 0, 1), cl = s.climb ?? 0, up = clamp(cl / 8, 0, 1), dn = clamp(-cl / 8, 0, 1);
    const tn = s.turn ?? 0;
    if (s.dead) { this.updateDead(dt, s); return; }
    if (this.deadT > 0) { this.deadT = 0; this.deadAge = 0; this.body.rotation.set(0, 0, 0); }

    // ---- estados de fuego, rugido y golpe ----
    if (this.breathT >= 0 && (this.breathT += dt) > BREATH_IN + FIRE_T + 0.6) this.breathT = -1;
    if (this.roarT >= 0 && (this.roarT += dt) > ROAR_T) this.roarT = -1;
    this.flinchT = Math.max(0, this.flinchT - dt * 2.6);
    const bt = this.breathT, inh = bt >= 0 ? ease(clamp(bt / BREATH_IN, 0, 1)) : 0;
    const firing = bt >= BREATH_IN && bt < BREATH_IN + FIRE_T;
    const rec = bt > BREATH_IN + FIRE_T ? clamp((bt - BREATH_IN - FIRE_T) / 0.6, 0, 1) : 0; // recuperación
    const rk = this.roarT >= 0 ? this.roarT / ROAR_T : 0;
    const roar = this.roarT >= 0 ? ease(clamp(rk / 0.18, 0, 1)) * ease(clamp((1 - rk) / 0.25, 0, 1)) : 0;
    const fl = this.flinchT, flS = fl * fl;
    const breathK = bt < 0 ? 0 : firing ? 1 : bt < BREATH_IN ? inh : 1 - ease(rec); // peso de "pose de aliento"
    this.g += ((s.grounded ? 1 : 0) - this.g) * rate(dt, 2.5);
    const g = this.g, air = 1 - g;

    // ---- aleteo irregular con planeos ----
    const glideOk = fast > 0.55 && up < 0.35 && air > 0.9 && breathK === 0 && roar === 0;
    if (!glideOk) this.glideT = 0;
    else if (this.glideT > 0) { if ((this.glideT -= dt) <= 0) { this.glideT = 0; this.beats = 0; } }
    else if (this.beats >= 3) this.glideT = 1 + Math.random() * 1.4;
    this.gl += ((this.glideT > 0 ? 1 : 0) - this.gl) * rate(dt, 3);
    const gl = this.gl;
    const ampWant = g > 0.5 ? 0.1 : (0.5 + up * 0.28 + dn * -0.1 + fast * 0.04) * (1 - gl * 0.85) + roar * 0.15;
    this.flapAmp += (ampWant - this.flapAmp) * rate(dt, 3);
    const w = (g > 0.5 ? 1.8 : 4.3 + fast * 1.1 + up * 2.2) * (1 + 0.12 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 1.9 + 1));
    this.phase += dt * w * (1 - gl * 0.85) * (1 - roar * 0.7);
    const ph = this.phase, f = Math.sin(ph + 0.45 * Math.sin(ph)); // bajada más rápida que la subida
    const sd = Math.sin(ph); // aletazo hacia abajo: al pasar sd por 0 en descenso (mitad de la bajada)
    if (this.lastS > 0 && sd <= 0 && air > 0.6 && gl < 0.5) {
      this.beats++;
      this.onWingbeat?.(clamp(this.flapAmp / 0.8 * (0.6 + 0.4 * fast + 0.4 * up), 0.15, 1));
    }
    this.lastS = sd;
    const amp = this.flapAmp, u01 = 0.5 + 0.5 * f; // 1 con el ala arriba
    // pose de reposo-vuelo: ala en T con diedro; posado: pliegue real (antebrazo atrás, dedos recogidos)
    const lift = 0.1 + gl * 0.2 + roar * 0.55 + flS * 0.35 + breathK * 0.1;
    const shZ = (1 - g) * (lift + f * amp) + g * (-0.25 + roar * 0.7 + flS * 0.3 + Math.sin(ph * 0.5) * 0.015);
    const armY = g * 0.55 + (1 - g) * (-0.05 + u01 * 0.12);
    const foreY = g * 1.65 + (1 - g) * (u01 * 0.3 * (1 - gl) + roar * -0.25);
    const foreZ = (1 - g) * Math.sin(ph - 1.1) * amp * 0.6;
    this.pair("Shoulder", 0, 0, shZ); this.pair("Arm", 0, armY, 0);
    this.pair("Forearm", 0, foreY, foreZ);
    for (const n of FINGERS) for (let i = 1; i <= 3; i++) {
      const k = +n, spread = (k - 2.5) * 0.12 * (1 + gl * 0.5) * (1 - g); // abanico abierto al planear
      const curl = (1 - g) * (Math.sin(ph - 1.5 - i * 0.5) * amp * 0.4 + u01 * 0.12 - gl * 0.05) ;
      const tuck = g * (i === 1 ? 2.2 + (k - 2.5) * 0.12 : 0.66); // al plegar: dedos pegados al antebrazo
      this.rot(`Finger${n}L00${i}`, 0, (i === 1 ? spread : 0) + tuck, curl); this.rot(`Finger${n}R00${i}`, 0, -((i === 1 ? spread : 0) + tuck), -curl);
    }
    this.rot("ClawL", 0, 0); this.rot("ClawR", 0, 0);

    // ---- cuerpo: empuje, cabeceo y alabeo ----
    const wob = Math.sin(t * 1.3) * 0.1 * (1 - fast);
    const push = -f * 0.3 * (amp / 0.5) * air * (1 - gl);
    const breatheB = Math.sin(t * 1.15) * 0.5 + 0.5;
    this.body.position.y = push + wob * air + (this.target ? 0 : 0) - flS * 0.12 - roar * g * 0.0;
    this.pitchB += ((-up * 0.2 + dn * 0.14 + fast * 0.05 * (1 - gl) - roar * (0.14 + g * 0.16) - breathK * 0.05 * (bt < BREATH_IN ? 1 : -0.6) - fl * 0.15) * air + (-roar * 0.22 - fl * 0.08) * g - this.pitchB) * rate(dt, 4);
    this.rollB += (clamp(-tn * 0.25, -0.4, 0.4) - this.rollB) * rate(dt, 4);
    this.body.rotation.set(this.pitchB, 0, this.rollB);
    // vientre/pecho: respiración (más honda al inspirar y rugir)
    const chest = 1 + 0.018 * Math.sin(t * (g > 0.5 ? 1.1 : 1.8)) + 0.05 * inh * (bt < BREATH_IN + FIRE_T ? 1 : 0) + 0.045 * roar;
    for (const n of ["Spine003", "Spine004"]) { const b = this.bones[n]; if (b) { this.rot(n, 0, 0); b.b.scale.set(chest, chest, 1); } }

    // ---- patas: recogidas al volar rápido, colgando al flotar, en el suelo al posar ----
    const tuck = air * (fast * 0.9 + up * 0.1 + gl * 0.1), hang = air * (1 - fast);
    const sw = Math.sin(t * 1.1);
    for (const sd2 of ["L", "R"]) {
      const ph2 = sd2 === "L" ? 0 : 1.3;
      const thigh = tuck * 1.0 + hang * (0.28 + 0.06 * Math.sin(t * 1.4 + ph2)) + g * 0.0;
      const shin = tuck * 1.1 + hang * (-0.25 + 0.1 * Math.sin(t * 1.4 + ph2 + 0.8));
      const foot = -tuck * 0.9 + hang * 0.3;
      this.rot("Thigh" + sd2, thigh, 0); this.rot("Shin" + sd2, shin, 0); this.rot("Foot" + sd2, foot, 0);
    }
    void sw; void breatheB;

    // ---- cola: se arrastra al girar (cada tramo sigue al anterior) y ondula ----
    const wag = 0.07 * (1 + fast * 0.8) * (1 - g * 0.4);
    const t0 = clamp(tn * 0.4, -0.5, 0.5) + Math.sin(t * 28) * 0.03 * fl + (this.target ? 0 : 0);
    const ty = this.ty; ty[0]! += (t0 - ty[0]!) * rate(dt, 6);
    for (let i = 1; i < 7; i++) ty[i]! += (ty[i - 1]! - ty[i]!) * rate(dt, 7.5 - i * 0.6);
    const tailPitch = (-up * 0.16 + dn * 0.1 - breathK * 0.05) * air;
    this.tail.forEach((b, i) => {
      const nm = b.b.name;
      this.rot(nm, Math.sin(ph - 0.8 - i * 0.35) * 0.05 * air * (1 - gl) + tailPitch / 3 + Math.sin(t * 1.3 - i * 0.4) * 0.03 + (g > 0.5 ? 0.03 : 0), Math.sin(t * 1.7 - i * 0.55) * wag + ty[i]! * 0.26);
    });
    // rastro de la cola en la escena no se simula: solo huesos

    // ---- cabeza y cuello: mirada, barridos en reposo, rugido, golpe y aliento ----
    let yawT = 0, pitchT = 0, idle = g > 0.5 ? 1 : air * (0.55 - fast * 0.45);
    if (this.target) {
      tmpW.copy(this.target); this.group.worldToLocal(tmpW);
      const dx = tmpW.x - HEAD.x, dy = tmpW.y - HEAD.y, dz = tmpW.z - HEAD.z, ang = Math.atan2(dx, dz);
      if (Math.abs(ang) < 2.6) { yawT = clamp(ang, -1.15, 1.15); pitchT = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.6, 0.6); }
      idle *= 0.12;
    }
    if (this.sniffT >= 0) { if ((this.sniffT += dt) > 1.5) { this.sniffT = -1; this.sniffCd = 5 + Math.random() * 8; } }
    else if ((this.sniffCd -= dt) <= 0 && g > 0.5) this.sniffT = 0;
    const sn = this.sniffT >= 0 ? Math.sin(this.sniffT / 1.5 * Math.PI) : 0;
    yawT += (Math.sin(t * 0.37) * 0.38 + Math.sin(t * 0.91 + 1) * 0.14) * idle;
    pitchT += (Math.sin(t * 0.53) * 0.1 + Math.sin(t * 0.17) * 0.05) * idle + sn * (0.3 + Math.sin(t * 15) * 0.03) + fast * 0.1 * air - up * 0.08;
    // los gestos suman al pitch (positivo = cabeza abajo)
    const bp = -inh * (bt < BREATH_IN ? 0.62 : 0) * 1 + (bt >= BREATH_IN ? (firing ? 0.12 - 0.62 * (1 - ease(clamp((bt - BREATH_IN) / 0.18, 0, 1))) : 0.12 * (1 - rec)) : 0);
    pitchT += bp - roar * 0.7 - flS * 0.45;
    yawT += (firing ? Math.sin((bt - BREATH_IN) * 3.2) * 0.22 : 0) + Math.sin(this.t * 40) * 0.04 * roar * (rk > 0.3 ? 1 : 0) + Math.sin(this.t * 32) * 0.05 * fl;
    this.neckYaw += (yawT - this.neckYaw) * rate(dt, 3.2); this.headYaw += (yawT - this.headYaw) * rate(dt, 7);
    this.neckPitch += (pitchT - this.neckPitch) * rate(dt, firing || bt < BREATH_IN && bt >= 0 ? 12 : 4); this.headPitch += (pitchT - this.headPitch) * rate(dt, firing ? 14 : 7);
    const rollH = clamp(this.neckYaw * -0.1, -0.15, 0.15);
    for (const [n, k] of NECK) {
      const head = n === "SkullControl";
      const wy = head ? this.headYaw : this.neckYaw, wp = head ? this.headPitch : this.neckPitch;
      this.rot(n, wp * k * (head ? 1 : 1) + (head ? 0 : Math.sin(t * 1.4 - k * 6) * 0.015), wy * k, rollH * k);
    }
    this.rot("Head001", 0, 0);
    // mandíbula: respira, bosteza, se abre al rugir y al escupir
    const jawOpen = Math.max(0, Math.sin(t * 0.9)) * 0.05 + (g > 0.5 ? 0.04 : 0.1) + inh * 0.2 * (bt < BREATH_IN ? 1 : 0) + (firing ? 0.45 : 0) + roar * (0.55 + Math.sin(t * 22) * 0.04 * (rk > 0.3 ? 1 : 0)) + flS * 0.3 + (1 - ease(rec)) * (bt > BREATH_IN + FIRE_T ? 0.45 : 0);
    this.rot("Jaw001", jawOpen - 0.5, 0); this.rot("Jaw002", 0, 0);
    for (const n of ["HornL001", "HornR001", "CheekL", "CheekR"]) this.rot(n, 0, 0);

    // ---- brillo, ojos y destello ----
    const glowT = bt < 0 ? roar * 0.35 : bt < BREATH_IN ? inh : bt < BREATH_IN + FIRE_T ? 1 : 1 - ease(rec);
    this.glow += (glowT - this.glow) * rate(dt, glowT > this.glow ? 16 : 5);
    u.glow.value = this.glow; u.hurt.value = flS;
    this.mats!.Yellow.emissiveIntensity = 1.1 + Math.sin(t * 2.3) * 0.15 + this.glow * 1.2 + roar * 0.8;
    this.mats!.Red.emissiveIntensity = this.glow * 1.1; this.mats!.Teeth.emissiveIntensity = this.glow * 0.5;
    this.stepFire(dt, firing, bt, s);
    this.lastTurn = tn;
  }

  /** Muerte: sacudida, el cuerpo cae de lado, alas lacias, cuello y cabeza al suelo, ojos que se apagan y un hilo de humo. */
  private updateDead(dt: number, s: DragonState) {
    this.deadAge += dt;
    const prev = this.deadT; this.deadT = Math.min(1, this.deadT + dt * 0.9);
    const k = ease(this.deadT), a = this.deadAge, t = this.t;
    const hit = Math.max(0, 1 - a / 0.35); // último estertor: cabeza atrás y alas arriba
    const thud = a > 0.55 && a < 1.1 ? Math.sin((a - 0.55) / 0.55 * Math.PI) * 0.12 : 0; // rebote al tocar el suelo
    this.body.position.y = -thud - k * 0.4; this.body.rotation.set(k * 0.1 - hit * 0.2, 0, k * 0.55);
    void prev;
    const sag = clamp(a / 1.2, 0, 1);
    this.pair("Shoulder", 0, 0, hit * 0.7 + (-0.75 + Math.sin(a * 3) * 0.02) * k); this.pair("Arm", 0, 0.25 * k);
    this.pair("Forearm", 0, 0.45 * k, 0.15 * k);
    for (const n of FINGERS) for (let i = 1; i <= 3; i++) {
      this.rot(`Finger${n}L00${i}`, 0, 0.5 * k * i / 3, -0.3 * k); this.rot(`Finger${n}R00${i}`, 0, -0.5 * k * i / 3, 0.3 * k);
    }
    this.rot("ClawL", 0, 0); this.rot("ClawR", 0, 0);
    for (const sd of ["L", "R"]) { this.rot("Thigh" + sd, 0.35 * k, sd === "L" ? 0.2 * k : -0.1 * k); this.rot("Shin" + sd, 0.7 * k, 0); this.rot("Foot" + sd, -0.4 * k, 0); }
    for (const n of ["Spine003", "Spine004"]) { const b = this.bones[n]; if (b) { this.rot(n, 0, 0); const c = 1 + 0.012 * Math.sin(t * 1.2) * (1 - k); b.b.scale.set(c, c, 1); } }
    this.neckYaw += (0.7 - this.neckYaw) * rate(dt, 1.5);
    this.neckPitch += ((-0.5 * hit + 0.55 * sag) - this.neckPitch) * rate(dt, hit > 0 ? 14 : 2.2);
    for (const [n, w] of NECK) this.rot(n, this.neckPitch * w, this.neckYaw * w, -0.1 * w);
    this.rot("Head001", 0, 0);
    this.rot("Jaw001", 0.25 + 0.3 * sag * (1 - sag) * 0 + 0.15 * k - 0.12 + hit * 0.4, 0); this.rot("Jaw002", 0, 0);
    this.tail.forEach((b, i) => this.rot(b.b.name, 0.04 * k, (0.2 + i * 0.05) * k * Math.cos(a * 0.5 * 0 + i * 0.2)));
    this.glow += (0 - this.glow) * rate(dt, 4); this.u.glow.value = this.glow; this.u.hurt.value = Math.max(0, 1 - a / 0.5) * 0.8;
    this.mats!.Yellow.emissiveIntensity = Math.max(0, 1.1 * (1 - clamp(a / 1.4, 0, 1))); this.mats!.Red.emissiveIntensity = 0; this.mats!.Teeth.emissiveIntensity = 0;
    this.stepFire(dt, false, -1, s);
  }

  /** Posición y dirección de la boca en el marco del modelo (sin crear objetos). Devuelve false si aún no hay modelo. */
  private mouthPose(): boolean {
    const sk = this.bones.SkullControl; if (!sk) return false;
    this.body.updateMatrixWorld(true);
    tmpM.copy(this.group.matrixWorld).invert();
    this.mouth.getWorldPosition(tmpV).applyMatrix4(tmpM);
    tmpW.setFromMatrixPosition(sk.b.matrixWorld).applyMatrix4(tmpM);
    tmpW.subVectors(tmpV, tmpW).normalize(); // dirección: del cráneo a la boca
    return true;
  }

  private stepFire(dt: number, firing: boolean, bt: number, s: DragonState) {
    const fx = this.fx, inh = bt >= 0 && bt < BREATH_IN;
    const dead = !!s.dead && this.deadAge < 9;
    if ((firing || inh || this.glow > 0.05 || dead || fx.active) && this.mouthPose()) {
      const px = tmpV.x, py = tmpV.y, pz = tmpV.z, dx = tmpW.x, dy = tmpW.y, dz = tmpW.z;
      if (firing) fx.spray(dt, px, py, pz, dx, dy, dz, 1);
      // un hilo de humo por la boca al inspirar y al morir; resplandor aditivo mientras la garganta brilla
      if (inh) fx.puff(dt, 14, px, py, pz, dx * 1.5, 0.5, dz * 1.5);
      if (dead && this.deadAge > 0.8) fx.puff(dt, 3, px, py, pz, dx * 0.4, 1, dz * 0.4);
      const gl = this.glow;
      fx.glow(px, py, pz, gl > 0.04 ? Math.min(0.55, gl * (firing ? 0.5 : 0.3) + (firing ? 0.08 * Math.sin(this.t * 60) : 0)) : 0, 1.2 + gl * (firing ? 2.4 : 1));
    }
    fx.step(dt, this.t);
  }

  dispose() {
    this.fx.dispose(); this.hitbox.geometry.dispose();
    (this.hitbox.material as THREE.Material).dispose();
    this.owned.forEach(m => m.dispose());
  }
}

/** Guarida del dragón: claro de tierra quemada con un círculo de rocas, montones de huesos y brasas. */
export function createLair(scene: THREE.Scene) {
  const { x, z, r } = DRAGON_LAIR;
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const burnt = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshLambertMaterial({ color: 0x3a3229 }));
  burnt.rotation.x = -Math.PI / 2; burnt.position.y = 0.04; burnt.receiveShadow = true; g.add(burnt);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 32), new THREE.MeshLambertMaterial({ color: 0x24201c }));
  ash.rotation.x = -Math.PI / 2; ash.position.y = 0.05; g.add(ash);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5c5a55, flatShading: true });
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xe6dcc3 });
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) { // rocas afiladas en corro
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.2, d = r - 1.5 + rnd() * 2, h = 1.5 + rnd() * 3.5;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rnd() * 0.9, h, 5), rockMat);
    m.position.set(Math.cos(a) * d, h / 2 - 0.2, Math.sin(a) * d); m.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
    m.castShadow = true; g.add(m);
  }
  for (let i = 0; i < 5; i++) { // montones de huesos: costillas curvadas y un cráneo
    const pile = new THREE.Group(), a = rnd() * Math.PI * 2, d = 3 + rnd() * (r - 6);
    pile.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); pile.rotation.y = rnd() * 3;
    for (let k = 0; k < 5; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 4, 10, Math.PI * 0.9), boneMat);
      rib.position.set(k * 0.32 - 0.6, 0.05, 0); rib.rotation.set(0, Math.PI / 2, 0); pile.add(rib);
    }
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), boneMat); skull.position.set(1.2, 0.3, 0.2); pile.add(skull);
    g.add(pile);
  }
  const ember = new THREE.MeshBasicMaterial({ color: 0xff6a1e });
  for (let i = 0; i < 26; i++) { // brasas que aún brillan
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7, e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + rnd() * 0.12, 0), ember);
    e.position.set(Math.cos(a) * d, 0.08, Math.sin(a) * d); g.add(e);
  }
  return g;
}
