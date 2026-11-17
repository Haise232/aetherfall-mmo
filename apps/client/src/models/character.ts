import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { CLASSES, TONES, classOf, type LookSel } from "@mmorpg/shared";

// Personajes con esqueleto y animaciones (KayKit Adventurers, CC0; ver public/models/CREDITOS.md).
// Los cinco modelos comparten el mismo esqueleto, así que las armas de uno valen en la mano de otro.
export type Kind = "Mage" | "Knight" | "Barbarian" | "Rogue" | "Rogue_Hooded";

const GLOW = 1; // intensidad del resplandor de las formas bendecidas
const SCALE = 0.85; // los modelos miden ~2.25; el mundo usa ~1.9 m
const loader = new GLTFLoader();
const cache = new Map<Kind, Promise<GLTF>>();
const load = (kind: Kind) => {
  let p = cache.get(kind);
  if (!p) { p = loader.loadAsync(`/models/${kind}.glb`); cache.set(kind, p); }
  return p;
};
/** Precarga para que el primer personaje no aparezca con retraso. */
export const preloadCharacters = (kinds: Kind[] = ["Mage", "Knight", "Rogue", "Rogue_Hooded", "Barbarian"]) => Promise.all(kinds.map(load));

// Accesorios: nodo dentro del .glb y modelo que lo contiene.
const ACCESSORY_OWNER: Record<string, Kind> = {
  "1H_Sword": "Knight", "2H_Sword": "Knight", Rectangle_Shield: "Knight", Round_Shield: "Knight", Badge_Shield: "Knight", Knight_Helmet: "Knight", Knight_Cape: "Knight",
  "1H_Axe": "Barbarian", "2H_Axe": "Barbarian", Mug: "Barbarian", Barbarian_Hat: "Barbarian", Barbarian_Cape: "Barbarian", Barbarian_Round_Shield: "Barbarian",
  "1H_Wand": "Mage", "2H_Staff": "Mage", Spellbook: "Mage", Mage_Hat: "Mage", Mage_Cape: "Mage",
  Knife: "Rogue", Rogue_Cape: "Rogue",
};
const SLOT_OF = (name: string) => /Shield|Spellbook|Offhand/.test(name) ? "handslotl" : /Hat|Helmet/.test(name) ? "head" : /Cape/.test(name) ? "chest" : "handslotr";

// polygonOffset: la sombra de contacto se dibuja siempre por delante del pavimento, sin parpadeo por profundidad.
const BLOB = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 });
const blobGeo = new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2);
const hitGeo = new THREE.BoxGeometry(0.95, 1.95, 0.95);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const tinted = new Map<string, THREE.Material>();
// Los modelos KayKit pintan con un atlas de 8x4 casillas (cada una un degradado). Para las formas bendecidas
// se repinta solo la ropa y la armadura (la piel queda igual), conservando el degradado de cada casilla.
const repainted = new Map<string, THREE.Texture>();
function repaint(src: THREE.Texture, palette: Record<number, number>) {
  const key = src.uuid + JSON.stringify(palette);
  let tex = repainted.get(key);
  if (tex) return tex;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d")!; g.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height, cw = W / 8, ch = H / 4, data = g.getImageData(0, 0, W, H), px = data.data;
  for (const [cell, hex] of Object.entries(palette)) {
    const cx = (Number(cell) % 8) * cw, cy = Math.floor(Number(cell) / 8) * ch;
    const r8 = (hex >> 16) & 255, g8 = (hex >> 8) & 255, b8 = hex & 255;
    let sum = 0, n = 0;
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) { const i = (y * W + x) * 4; sum += px[i]! * 0.3 + px[i + 1]! * 0.59 + px[i + 2]! * 0.11; n++; }
    const ref = Math.max(1, sum / n);
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) {
      const i = (y * W + x) * 4, k = Math.pow((px[i]! * 0.3 + px[i + 1]! * 0.59 + px[i + 2]! * 0.11) / ref, 0.8);
      px[i] = Math.min(255, r8 * k); px[i + 1] = Math.min(255, g8 * k); px[i + 2] = Math.min(255, b8 * k);
    }
  }
  g.putImageData(data, 0, 0);
  tex = new THREE.CanvasTexture(cv);
  tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
  tex.magFilter = src.magFilter; tex.minFilter = src.minFilter; tex.channel = src.channel;
  repainted.set(key, tex);
  return tex;
}

export interface Look {
  kind: Kind;
  /** Nombres de accesorios visibles (sombrero, capa, armas...). Pueden ser de otro modelo. */
  show: string[];
  /** Multiplica el color de la ropa/piel: da variedad a los vecinos. */
  tint?: number;
  /** Resplandor propio (formas bendecidas). */
  glow?: number;
  /** Recoloreado del atlas de textura por casillas (formas bendecidas). */
  palette?: Record<number, number>;
  /** Adornos de luz: halo y orbes (mago de la luz) o halo y alas (paladín). */
  aura?: "light" | "paladin";
}

// ---- adornos de luz de las formas bendecidas ----
const lightMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const haloGeo = new THREE.TorusGeometry(0.36, 0.04, 8, 32), orbGeo = new THREE.IcosahedronGeometry(0.09, 1), orbGlowGeo = new THREE.SphereGeometry(0.19, 10, 8);
const featherGeo = new THREE.SphereGeometry(1, 10, 8);
const HALO_MAT = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb830, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 }), ORB_MAT = new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), ORB_GLOW = lightMat(0xffd98a, 0.28);
const FEATHER = [0xfbf7ec, 0xeee6d2, 0xe9c766].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.6 }));
/** Ala de plumas (lado derecho: +x). El grupo pivota en el arranque del ala, en la espalda. */
function wing() {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    const n = 7 - row * 2, len0 = 1.3 - row * 0.36;
    for (let i = 0; i < n; i++) {
      const f = n > 1 ? i / (n - 1) : 0, ang = 1.05 - f * 1.55, L = len0 * (0.6 + 0.4 * Math.sin(Math.min(1, f * 1.4 + 0.3) * Math.PI));
      const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), -0.25).normalize(), m = new THREE.Mesh(featherGeo, FEATHER[row]!);
      m.scale.set(0.1 - row * 0.012, L / 2, 0.025); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.position.set(0.05, 0, row * 0.03).addScaledVector(dir, L / 2 + 0.02);
      g.add(m);
    }
  }
  return g;
}
interface Aura { root: THREE.Group; halo?: THREE.Group; wings: THREE.Group[]; orbs: THREE.Group[]; t: number }
function buildAura(kind: "light" | "paladin"): Aura {
  const root = new THREE.Group(), wings: THREE.Group[] = [], orbs: THREE.Group[] = [];
  let halo: THREE.Group | undefined;
  if (kind === "paladin") {
    // aureola horizontal sobre el yelmo y alas de plumas a la espalda
    halo = new THREE.Group(); const ring = new THREE.Mesh(haloGeo, HALO_MAT); ring.rotation.x = Math.PI / 2; halo.add(ring); halo.renderOrder = 6; root.add(halo);
    for (const s of [-1, 1]) { const w = wing(); w.scale.x = s; root.add(w); wings.push(w); }
  } else for (let i = 0; i < 3; i++) { const o = new THREE.Group(); o.add(new THREE.Mesh(orbGeo, ORB_MAT), new THREE.Mesh(orbGlowGeo, ORB_GLOW)); root.add(o); orbs.push(o); }
  return { root, halo, wings, orbs, t: Math.random() * 10 };
}
const auraV = new THREE.Vector3(), HALO_Y = 1.26, WING_Y = 0.05, WING_Z = -0.42;

/** Animaciones de cada postura: bajar, reposo y levantarse. */
const POSE_CLIPS = { chair: ["Sit_Chair_Down", "Sit_Chair_Idle", "Sit_Chair_StandUp"], floor: ["Sit_Floor_Down", "Sit_Floor_Idle", "Sit_Floor_StandUp"], lie: ["Lie_Down", "Lie_Idle", "Lie_StandUp"] } as const;
const POSE_UP: Record<string, true> = Object.fromEntries(Object.values(POSE_CLIPS).map(c => [c[2], true]));

export class Character {
  readonly group = new THREE.Group();
  /** Volumen invisible para picking con raycaster. */
  readonly hitbox = new THREE.Mesh(hitGeo, hitMat);
  /** Sombra de contacto. Quien mueva al personaje en altura puede sacarla a un padre que se quede en el suelo. */
  readonly blob = new THREE.Mesh(blobGeo, BLOB);
  private holder = new THREE.Group();
  private model?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private oneShot = "";
  private look: Look;
  private lookKey = "";
  private dead = false;
  private riding = false;
  private airborne = false;
  private armed = false;
  private pendingAttack = false;
  private flashT = 0;
  private praying = false;
  /** Postura de descanso (banco, suelo o tumbado); null: de pie. */
  private pose: "chair" | "floor" | "lie" | null = null;
  private mats: THREE.MeshStandardMaterial[] = [];
  private aura?: Aura;
  private headBone?: THREE.Object3D;
  private chestBone?: THREE.Object3D;

  constructor(look: Look, private opts: { shadow?: boolean; scale?: number } = {}) {
    this.look = look;
    this.hitbox.position.y = 0.97;
    this.blob.position.y = 0.09; this.blob.renderOrder = 2;
    this.holder.scale.setScalar(SCALE * (opts.scale ?? 1));
    this.group.add(this.blob, this.holder, this.hitbox);
    this.setLook(look);
  }

  /** Cambia modelo y accesorios (p. ej. al equipar una armadura). */
  setLook(look: Look) {
    const key = look.kind + "|" + look.show.join(",") + "|" + (look.tint ?? "") + "|" + (look.glow ?? "") + "|" + (look.aura ?? "") + "|" + JSON.stringify(look.palette ?? "");
    if (key === this.lookKey) return;
    const kindChanged = !this.model || look.kind !== this.look.kind || look.tint !== this.look.tint || look.glow !== this.look.glow || look.aura !== this.look.aura || look.palette !== this.look.palette;
    this.lookKey = key; this.look = look;
    this.armed = look.show.some(n => /Sword|Axe|Knife/.test(n));
    if (kindChanged) void this.build(key); else this.applyAccessories();
  }

  private async build(key: string) {
    const look = this.look;
    const gltf = await load(look.kind);
    if (this.lookKey !== key) return; // ya cambió otra vez mientras cargaba
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = !!this.opts.shadow; m.receiveShadow = false; m.frustumCulled = false;
      if (look.tint !== undefined) {
        const src = m.material as THREE.MeshStandardMaterial, k = src.uuid + ":" + look.tint;
        let mat = tinted.get(k);
        if (!mat) { const c = src.clone(); c.color.multiply(new THREE.Color(look.tint)); mat = c; tinted.set(k, mat); }
        m.material = mat;
      }
    });
    // materiales propios para el destello de golpe (los del .glb se comparten entre clones)
    for (const m of this.mats) m.dispose();
    this.mats = [];
    model.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return;
      const c = (m.material as THREE.MeshStandardMaterial).clone(); m.material = c; this.mats.push(c);
      if (look.palette && c.map) c.map = repaint(c.map, look.palette); // ropa y armadura en blanco, oro y azul
      if (look.glow !== undefined) { c.emissive.setHex(look.glow); c.emissiveMap = c.map; c.emissiveIntensity = GLOW; }
    });
    // adornos de luz: siguen a la cabeza y al pecho sin heredar su giro
    if (this.aura) { this.holder.remove(this.aura.root); this.aura = undefined; }
    this.headBone = model.getObjectByName("head"); this.chestBone = model.getObjectByName("chest");
    if (look.aura) { this.aura = buildAura(look.aura); this.holder.add(this.aura.root); }
    if (this.model) this.holder.remove(this.model);
    this.model = model; this.holder.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions.clear(); this.current = ""; this.oneShot = "";
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener("finished", () => {
      if (this.pose && !this.praying && !(this.oneShot in POSE_UP)) { // ya sentado o tumbado (o acabó un gesto): vuelve al reposo
        const idle = POSE_CLIPS[this.pose][1]; this.oneShot = idle; this.play(idle, 0.15, false, 0.9); return;
      }
      if (this.oneShot in POSE_UP) { this.oneShot = ""; this.praying = false; return; } // ya de pie (también al terminar de rezar)
      if (this.oneShot === "Sit_Floor_Down") {
        this.oneShot = "Sit_Floor_Idle";
        this.play("Sit_Floor_Idle", 0.15, false, 0.9);
      } else if (this.oneShot === "Sit_Floor_StandUp") {
        this.praying = false; this.oneShot = "";
      } else this.oneShot = "";
    });
    this.applyAccessories();
    if (this.pose) { const c = POSE_CLIPS[this.pose]; this.oneShot = c[1]; this.play(c[1], 0, false, 0.9); } // se cargó ya sentado
    this.update(0, 0);
    if (this.pendingAttack) { this.pendingAttack = false; this.attack(); }
  }

  private applyAccessories() {
    const model = this.model; if (!model) return;
    const want = new Set(this.look.show), have = new Set<string>();
    // Los accesorios cuelgan de estos huesos: los propios se muestran u ocultan, los prestados que sobran se quitan.
    for (const slotName of ["handslotr", "handslotl", "head", "chest"]) {
      const slot = model.getObjectByName(slotName); if (!slot) continue;
      for (const o of [...slot.children]) {
        if ((o as THREE.Bone).isBone) continue;
        const acc = (o.userData.acc as string | undefined) ?? o.name;
        if (want.has(acc)) { o.visible = true; have.add(acc); }
        else if (o.userData.acc) o.removeFromParent();
        else o.visible = false;
      }
    }
    // Los que faltan se piden prestados a otro modelo (mismo esqueleto).
    for (const name of want) {
      if (have.has(name)) continue;
      const owner = ACCESSORY_OWNER[name]; if (!owner) continue;
      const key = this.lookKey;
      void load(owner).then(g => {
        if (this.lookKey !== key || this.model !== model) return;
        const src = g.scene.getObjectByName(name), slot = model.getObjectByName(SLOT_OF(name));
        if (!src || !slot || slot.children.some(c => c.userData.acc === name)) return;
        const c = src.clone(); c.userData.acc = name; c.visible = true;
        c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !!this.opts.shadow; m.frustumCulled = false; } });
        slot.add(c);
      });
    }
  }

  private play(name: string, fade = 0.18, once = false, timeScale = 1) {
    const a = this.actions.get(name); if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name && !once) return;
    const prev = this.actions.get(this.current);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.fadeIn(fade).play();
    if (prev && prev !== a) prev.fadeOut(fade);
    this.current = name;
  }

  attack() {
    if (!this.mixer) { this.pendingAttack = true; return; }
    if (this.dead) return;
    const clip = this.look.kind === "Mage" ? "Spellcast_Shoot" : this.armed ? (Math.random() < 0.5 ? "1H_Melee_Attack_Chop" : "1H_Melee_Attack_Slice_Diagonal") : "Unarmed_Melee_Attack_Punch_A";
    this.oneShot = clip; this.play(clip, 0.08, true, 1.5);
  }
  /** Animación de una habilidad (si el modelo la tiene). */
  cast(clip: string) { if (this.dead || this.riding || !this.actions.has(clip)) return; this.oneShot = clip; this.play(clip, 0.08, true, 1.4); }
  /** Reacción a un golpe: destello y, si no está haciendo otra cosa, gesto de dolor. */
  hurt() {
    this.flashT = 1;
    if (this.dead || this.riding || !this.mixer || this.oneShot) return;
    this.oneShot = "Hit_A"; this.play("Hit_A", 0.06, true, 1.6);
  }
  jump() { if (this.dead || this.riding || !this.mixer) return; this.oneShot = "Jump_Full_Short"; this.play("Jump_Full_Short", 0.08, true, 1.5); }
  /** Gesto puntual (vendedores que pregonan, etc.). */
  emote(name: "Cheer" | "Interact" | "Use_Item" | "Throw") { if (this.dead || !this.mixer || this.oneShot) return; this.oneShot = name; this.play(name, 0.15, true); }
  /** Sentarse en un banco, en el suelo o tumbarse (null: levantarse). */
  setPose(p: "chair" | "floor" | "lie" | null) {
    if (p === this.pose) return;
    const prev = this.pose; this.pose = p;
    if (!this.mixer || this.dead) return;
    if (p) { const c = POSE_CLIPS[p]; this.oneShot = c[0]; this.play(c[0], 0.12, true, 1.1); }
    else if (prev) { const c = POSE_CLIPS[prev]; this.oneShot = c[2]; this.play(c[2], 0.12, true, 1.2); }
  }
  /** Reza ante la estatua de la diosa: se arrodilla en el suelo. */
  pray() { if (this.dead || this.riding || !this.mixer || this.praying) return; this.praying = true; this.oneShot = "Sit_Floor_Down"; this.play("Sit_Floor_Down", 0.12, true, 1.1); }
  /** Termina la oración y se levanta. */
  stopPray() { if (!this.praying) return; this.oneShot = "Sit_Floor_StandUp"; this.play("Sit_Floor_StandUp", 0.12, true, 1.1); }
  setDead(d: boolean) { if (d === this.dead) return; this.dead = d; this.praying = false; this.oneShot = ""; if (!d) this.current = ""; }
  /** Al montar se sienta con un gesto; al bajar deja de estar sentado. */
  setRiding(on: boolean) {
    if (on === this.riding) return;
    this.riding = on; this.oneShot = "";
    if (on && this.mixer && !this.dead) { this.oneShot = "Sit_Chair_Down"; this.play("Sit_Chair_Down", 0.12, true, 2.2); }
  }
  /** En caída libre (tras bajar de la escoba en el aire); al tocar suelo, aterriza. */
  setAirborne(a: boolean) {
    if (a === this.airborne) return;
    this.airborne = a;
    if (!a && this.mixer && !this.dead && !this.riding) { this.oneShot = "Jump_Land"; this.play("Jump_Land", 0.08, true, 1.4); }
  }
  get loaded() { return !!this.model; }

  /** `speed`: velocidad real sobre el suelo en unidades/seg. */
  update(dt: number, speed: number) {
    if (!this.mixer) return;
    const glow = this.look.glow, base = glow !== undefined ? GLOW : 0;
    if (this.flashT > 0 || (this.mats[0] && this.mats[0].emissiveIntensity !== base)) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      for (const m of this.mats) {
        if (this.flashT > 0 || glow === undefined) m.emissive.setHex(0xffffff); else m.emissive.setHex(glow);
        m.emissiveIntensity = this.flashT > 0 ? base + this.flashT * 0.7 : base;
      }
    }
    const au = this.aura;
    if (au) {
      au.t += dt; au.root.visible = !this.dead;
      const t = au.t, head = this.headBone, chest = this.chestBone;
      if (au.halo && head) { this.holder.worldToLocal(head.getWorldPosition(auraV)); au.halo.position.set(auraV.x, auraV.y + HALO_Y + Math.sin(t * 2) * 0.03, auraV.z); au.halo.scale.setScalar(1 + Math.sin(t * 2.6) * 0.04); }
      if (chest) this.holder.worldToLocal(chest.getWorldPosition(auraV)); else auraV.set(0, 1.3, 0);
      au.wings.forEach((w, i) => { const s = i ? 1 : -1, flap = Math.sin(t * 2.2) * 0.12; w.position.set(auraV.x + s * 0.12, auraV.y + WING_Y, auraV.z + WING_Z); w.rotation.set(0, s * (0.3 + flap), s * flap * 0.4); });
      au.orbs.forEach((o, i) => { const a = t * 1.5 + (i * Math.PI * 2) / 3; o.position.set(auraV.x + Math.cos(a) * 0.95, auraV.y + 0.1 + Math.sin(t * 2 + i * 2.1) * 0.25, auraV.z + Math.sin(a) * 0.95); o.children[1]!.scale.setScalar(1 + Math.sin(t * 5 + i) * 0.2); });
    }
    if (this.dead) this.play("Death_A", 0.12, this.current !== "Death_A");
    else if (this.riding) { if (!this.oneShot) this.play("Sit_Chair_Idle", 0.2); }
    else if (this.airborne) this.play("Jump_Idle", 0.15);
    else if (!this.oneShot) {
      if (speed < 0.35) this.play(this.armed && this.actions.has("Idle") ? "Idle" : "Idle", 0.22);
      else if (speed < 3.2) this.play("Walking_A", 0.2, false, Math.max(0.6, speed / 1.7));
      else this.play("Running_A", 0.18, false, Math.max(0.8, speed / 5.5));
    }
    this.mixer.update(dt);
  }
}

/** Aspecto del jugador: la clase y el aspecto elegidos dan el modelo; el arma equipada se ve en la mano. */
export function playerLook(sel?: LookSel, weapon?: string): Look {
  const cls = (sel && classOf(sel[0])) ?? CLASSES[0]!, style = cls.styles[sel?.[1] ?? 0] ?? cls.styles[0]!;
  const show = [...style.show];
  if (weapon === "rusty_sword") show.push("1H_Sword");
  else if (weapon === "wooden_club") show.push("1H_Axe");
  else show.push(...(style.unarmed ?? cls.unarmed));
  if (weapon && cls.id === "knight") show.push(style.shield ?? "Round_Shield");
  const tone = TONES[sel?.[2] ?? 0]?.color;
  const tint = style.tint ?? (tone === undefined || tone === 0xffffff ? undefined : tone);
  return { kind: style.kind, show, tint: style.palette ? undefined : tint, glow: style.glow, aura: style.aura, palette: style.palette };
}
