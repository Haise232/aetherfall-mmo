// Trol de las rocas: el rig del Bárbaro KayKit (CC0) deformado a mano (encorvado, brazos largos, manos enormes, cabeza pequeña),
// con piel de piedra y musgo, púas de roca y un garrote. Al pisar y al golpear el suelo levanta polvo, una onda y tiembla.
import * as THREE from "three";
import { preloadCharacters } from "../character";
import { RigMob } from "./rig";
import type { MobModel } from "./types";

const gltf = () => preloadCharacters(["Barbarian"]).then(a => a[0]!); // comparte la carga del Bárbaro jugable
const OWN = ["1H_Axe", "2H_Axe", "1H_Axe_Offhand", "Mug", "Barbarian_Round_Shield", "Barbarian_Hat", "Barbarian_Cape"];

// ---- recursos compartidos por todos los troles ----
const stone = new Map<string, THREE.Material>();
const MOSS = new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1 });
const TUSK = new THREE.MeshStandardMaterial({ color: 0xe6dfc6, roughness: 0.8 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5b4126, roughness: 1 });
const ROCK_FLAT = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1, flatShading: true });
const spikeGeo = new THREE.ConeGeometry(0.11, 0.34, 5), lumpGeo = new THREE.IcosahedronGeometry(0.2, 0), mossGeo = new THREE.SphereGeometry(0.12, 7, 5);
const puffGeo = new THREE.SphereGeometry(1, 8, 6), ringGeo = new THREE.RingGeometry(0.7, 1, 28).rotateX(-Math.PI / 2);

/** Garrote: tronco que engorda hacia la punta, con nudos y clavos de piedra. Empuñadura en el origen, apunta a +Y. */
function club() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, 1.5, 8).translate(0, 0.62, 0), WOOD); g.add(body);
  for (let i = 0; i < 7; i++) { const a = i * 2.4, s = new THREE.Mesh(spikeGeo, ROCK_FLAT); s.scale.setScalar(0.7); s.position.set(Math.cos(a) * 0.19, 0.95 + (i % 4) * 0.13, Math.sin(a) * 0.19); s.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); g.add(s); }
  return g;
}
/** Atlas del Bárbaro pasado a piedra: el brillo de cada texel mapea a un degradado gris verdoso (conserva el dibujo de cara, cinturón y botas). */
let stoneTex: THREE.Texture | undefined;
function stoneTexture(src: THREE.Texture) {
  if (stoneTex) return stoneTex;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.pow(Math.min(1, (px[i]! * 0.3 + px[i + 1]! * 0.59 + px[i + 2]! * 0.11) / 255), 1.6);
    px[i] = 44 + l * 118; px[i + 1] = 50 + l * 118; px[i + 2] = 42 + l * 100; // gris piedra con un punto de verde
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.channel = src.channel; t.magFilter = src.magFilter; t.minFilter = src.minFilter;
  return (stoneTex = t);
}
const stoneMat = (src: THREE.MeshStandardMaterial) => {
  let m = stone.get(src.uuid);
  if (!m) { const c = src.clone(); if (c.map) c.map = stoneTexture(c.map); c.roughness = 1; c.metalness = 0; m = c; stone.set(src.uuid, m); }
  return m;
};

interface Puff { m: THREE.Mesh; t: number; life: number }
const P = new THREE.Vector3(), Q = new THREE.Vector3();
const nodes = (model: THREE.Object3D, ...n: string[]) => n.map(k => model.getObjectByName(k)).filter((o): o is THREE.Object3D => !!o);

class Troll extends RigMob {
  private bones: Record<string, THREE.Object3D | undefined> = {};
  private fx = new THREE.Group();
  private puffs: Puff[] = []; private ringM?: THREE.Mesh; private ringT = 9;
  private slamIn = -1; private shake = 0; private t = Math.random() * 20;
  private down = [true, true]; private feet: (THREE.Object3D | undefined)[] = [];
  constructor() {
    super({
      gltf: gltf(), scale: 1.65, height: 4.1, ring: 2.7, hit: [2.2, 3.6, 2.2], attackSec: 1.5,
      clips: { idle: "Idle", walk: "Walking_A", run: "Running_A", attack: ["2H_Melee_Attack_Chop"], hurt: ["Hit_A", "Hit_B"], death: "Death_A" },
      walkRef: 3.3, runRef: 7.6, runAt: 4.5,
    });
    this.group.add(this.fx);
    const pm = new THREE.MeshBasicMaterial({ color: 0xa89a82, transparent: true, depthWrite: false });
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(puffGeo, pm.clone()); m.visible = false; m.renderOrder = 3; this.fx.add(m); this.puffs.push({ m, t: 1, life: 1 }); }
    this.ringM = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xd9ccb0, transparent: true, depthWrite: false, side: THREE.DoubleSide })); this.ringM.visible = false; this.ringM.renderOrder = 3; this.fx.add(this.ringM);
  }
  protected override onBuild(model: THREE.Object3D) {
    for (const o of nodes(model, ...OWN)) o.visible = false;
    model.traverse(o => {
      const m = o as THREE.Mesh; if (m.isMesh && m.name.startsWith("Barbarian_")) m.material = stoneMat(m.material as THREE.MeshStandardMaterial);
    });
    const b = this.bones;
    for (const n of ["spine", "chest", "head", "upperarml", "upperarmr", "handl", "handr", "upperlegl", "upperlegr", "toesl", "toesr"]) b[n] = model.getObjectByName(n); // three quita el punto de "hand.l"
    this.feet = [b["toesl"], b["toesr"]];
    const slot = model.getObjectByName("handslotr");
    if (slot) { const c = club(); c.scale.set(0.85, 0.7, 0.85); slot.add(c); }
    // musgo y púas de roca en la espalda, los hombros y la cabeza
    const chest = model.getObjectByName("chest"), head = model.getObjectByName("head");
    if (chest) {
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, s: number, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(rx, 0, rz); chest.add(m); };
      for (let i = 0; i < 5; i++) add(spikeGeo, ROCK_FLAT, (i - 2) * 0.09, 0.12 + (i % 2) * 0.14, -0.2, 1.1 - Math.abs(i - 2) * 0.14, -1.0, 0);
      add(lumpGeo, ROCK_FLAT, 0.32, 0.14, -0.02, 1.5); add(lumpGeo, ROCK_FLAT, -0.32, 0.14, -0.02, 1.35);
      add(mossGeo, MOSS, 0.3, 0.26, -0.02, 2.2); add(mossGeo, MOSS, -0.3, 0.26, 0.02, 1.8); add(mossGeo, MOSS, 0, 0.16, -0.24, 2.6); add(mossGeo, MOSS, -0.12, 0.05, 0.18, 1.5);
    }
    if (head) { const m = new THREE.Mesh(mossGeo, MOSS); m.position.set(0.03, 0.4, -0.05); m.scale.set(2.2, 0.9, 1.9); head.add(m); const r = new THREE.Mesh(lumpGeo, ROCK_FLAT); r.position.set(-0.1, 0.36, 0.08); r.scale.set(0.9, 0.7, 0.9); head.add(r); for (const x of [-0.1, 0.1]) { const t = new THREE.Mesh(spikeGeo, TUSK); t.position.set(x, 0.12, 0.2); t.scale.set(0.7, 0.8, 0.7); t.rotation.x = 0.35; head.add(t); } }
  }
  protected override onAttack() { this.slamIn = 0.72; }
  protected override baseIntensity() { return 1; }
  protected override onUpdate(dt: number, speed: number) {
    const b = this.bones, s = (o: THREE.Object3D | undefined, x: number, y: number, z: number) => o?.scale.set(x, y, z);
    // deformación del esqueleto (las animaciones pisan la escala cada fotograma, así que se reaplica)
    // (si un clip no mueve un hueso, este conserva el giro anterior: solo se inclina cuando la animación lo ha reescrito)
    this.lean(b["chest"], 0, 0.16); this.lean(b["head"], 1, 0.12); this.lean(b["spine"], 2, 0.08);
    s(b["head"], 0.82, 0.82, 0.82);
    for (const k of ["upperarml", "upperarmr"]) s(b[k], 1.25, 1.25, 1.25); // brazos largos: todo lo que cuelga de ellos crece igual
    s(b["handl"], 1.3, 1.3, 1.3); s(b["handr"], 1.3, 1.3, 1.3);
    for (const k of ["upperlegl", "upperlegr"]) s(b[k], 1.35, 0.92, 1.35);
    // pisadas: el pie que toca el suelo levanta polvo y hace temblar
    this.t += dt;
    if (!this.dead) for (let i = 0; i < 2; i++) {
      const f = this.feet[i]; if (!f) continue;
      f.getWorldPosition(P); this.group.getWorldPosition(Q);
      const y = P.y - Q.y; // histéresis: el pie "pisa" al bajar de ~0,09 y "se levanta" al pasar de ~0,16
      if (!this.down[i] && y < 0.09) { this.down[i] = true; if (speed > 0.5) { this.shake = Math.max(this.shake, 0.55); this.puff(P.x - Q.x, P.z - Q.z, 0.5, 0.8); } }
      else if (this.down[i] && y > 0.16) this.down[i] = false;
    }
    if (this.slamIn >= 0 && (this.slamIn -= dt) < 0) { this.slamIn = -1; if (!this.dead) this.slam(); }
    this.shake *= Math.exp(-dt * 5);
    const sh = this.shake;
    this.holder.position.y = Math.sin(this.t * 50) * 0.05 * sh; this.holder.rotation.z = Math.sin(this.t * 37) * 0.012 * sh;
    for (const p of this.puffs) if (p.t < 1) {
      p.t += dt / p.life; const k = p.t, m = p.m, mat = m.material as THREE.MeshBasicMaterial;
      m.visible = k < 1; m.scale.setScalar(p.m.userData.s * (0.5 + k * 1.4)); m.position.y += dt * 0.5; mat.opacity = 0.5 * (1 - k) * (1 - k);
    }
    if (this.ringM && this.ringT < 1) {
      this.ringT += dt / 0.55; const k = this.ringT, mat = this.ringM.material as THREE.MeshBasicMaterial;
      this.ringM.visible = k < 1; this.ringM.scale.setScalar(0.5 + k * 5.5); mat.opacity = 0.55 * (1 - k);
    }
  }
  private applied = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private lean(bone: THREE.Object3D | undefined, i: number, a: number) {
    if (!bone || bone.quaternion.equals(this.applied[i]!)) return;
    bone.rotateX(a); this.applied[i]!.copy(bone.quaternion);
  }
  private puff(x: number, z: number, size: number, life: number) {
    const p = this.puffs.find(q => q.t >= 1); if (!p) return;
    p.t = 0; p.life = life; p.m.userData.s = size; p.m.position.set(x + (Math.random() - 0.5) * 0.4, 0.2, z + (Math.random() - 0.5) * 0.4); p.m.visible = true;
  }
  /** Golpe de garrote contra el suelo, delante del trol: onda de polvo y temblor fuerte. */
  private slam() {
    this.shake = 1.6; this.ringT = 0;
    if (this.ringM) { this.ringM.position.set(0, 0.12, 2.3); this.ringM.visible = true; }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; this.puff(Math.sin(a) * 1.2, 2.3 + Math.cos(a) * 1.2, 0.8, 1); }
  }
}
export const createTroll = (): MobModel => new Troll();
