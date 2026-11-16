import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

// Personajes con esqueleto y animaciones (KayKit Adventurers, CC0; ver public/models/CREDITOS.md).
// Los cinco modelos comparten el mismo esqueleto, así que las armas de uno valen en la mano de otro.
export type Kind = "Mage" | "Knight" | "Barbarian" | "Rogue" | "Rogue_Hooded";

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

const BLOB = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2);
const hitGeo = new THREE.BoxGeometry(0.95, 1.95, 0.95);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const tinted = new Map<string, THREE.Material>();

export interface Look {
  kind: Kind;
  /** Nombres de accesorios visibles (sombrero, capa, armas...). Pueden ser de otro modelo. */
  show: string[];
  /** Multiplica el color de la ropa/piel: da variedad a los vecinos. */
  tint?: number;
}

export class Character {
  readonly group = new THREE.Group();
  /** Volumen invisible para picking con raycaster. */
  readonly hitbox = new THREE.Mesh(hitGeo, hitMat);
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
  private armed = false;
  private pendingAttack = false;

  constructor(look: Look, private opts: { shadow?: boolean; scale?: number } = {}) {
    this.look = look;
    this.hitbox.position.y = 0.97;
    const blob = new THREE.Mesh(blobGeo, BLOB); blob.position.y = 0.03;
    this.holder.scale.setScalar(SCALE * (opts.scale ?? 1));
    this.group.add(blob, this.holder, this.hitbox);
    this.setLook(look);
  }

  /** Cambia modelo y accesorios (p. ej. al equipar una armadura). */
  setLook(look: Look) {
    const key = look.kind + "|" + look.show.join(",") + "|" + (look.tint ?? "");
    if (key === this.lookKey) return;
    const kindChanged = !this.model || look.kind !== this.look.kind || look.tint !== this.look.tint;
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
      if (look.tint !== undefined && (m as THREE.SkinnedMesh).isSkinnedMesh) {
        const src = m.material as THREE.MeshStandardMaterial, k = src.uuid + ":" + look.tint;
        let mat = tinted.get(k);
        if (!mat) { const c = src.clone(); c.color.multiply(new THREE.Color(look.tint)); mat = c; tinted.set(k, mat); }
        m.material = mat;
      }
    });
    if (this.model) this.holder.remove(this.model);
    this.model = model; this.holder.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions.clear(); this.current = ""; this.oneShot = "";
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener("finished", () => { this.oneShot = ""; });
    this.applyAccessories();
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
    const clip = this.armed ? (Math.random() < 0.5 ? "1H_Melee_Attack_Chop" : "1H_Melee_Attack_Slice_Diagonal") : this.look.kind === "Mage" ? "Spellcast_Shoot" : "Unarmed_Melee_Attack_Punch_A";
    this.oneShot = clip; this.play(clip, 0.08, true, 1.5);
  }
  jump() { if (this.dead || this.riding || !this.mixer) return; this.oneShot = "Jump_Full_Short"; this.play("Jump_Full_Short", 0.08, true, 1.5); }
  /** Gesto puntual (vendedores que pregonan, etc.). */
  emote(name: "Cheer" | "Interact" | "Use_Item" | "Throw") { if (this.dead || !this.mixer || this.oneShot) return; this.oneShot = name; this.play(name, 0.15, true); }
  setDead(d: boolean) { if (d === this.dead) return; this.dead = d; this.oneShot = ""; if (!d) this.current = ""; }
  setRiding(on: boolean) { if (on !== this.riding) { this.riding = on; this.oneShot = ""; } }
  get loaded() { return !!this.model; }

  /** `speed`: velocidad real sobre el suelo en unidades/seg. */
  update(dt: number, speed: number) {
    if (!this.mixer) return;
    if (this.dead) this.play("Death_A", 0.12, this.current !== "Death_A");
    else if (this.riding) this.play("Sit_Chair_Idle", 0.2);
    else if (!this.oneShot) {
      if (speed < 0.35) this.play(this.armed && this.actions.has("Idle") ? "Idle" : "Idle", 0.22);
      else if (speed < 3.2) this.play("Walking_A", 0.2, false, Math.max(0.6, speed / 1.7));
      else this.play("Running_A", 0.18, false, Math.max(0.8, speed / 5.5));
    }
    this.mixer.update(dt);
  }
}

/** Aspecto del jugador según su equipo: la clase es lo que llevas puesto, como en Albion. */
export function playerLook(weapon?: string, armor?: string): Look {
  const kind: Kind = armor === "iron_armor" ? "Knight" : armor === "leather_armor" ? "Rogue_Hooded" : "Mage";
  const show: string[] = [];
  if (kind === "Mage") show.push("Mage_Hat", "Mage_Cape");
  if (kind === "Knight") show.push("Knight_Helmet", "Knight_Cape");
  if (kind === "Rogue_Hooded") show.push("Rogue_Cape");
  if (weapon === "rusty_sword") show.push("1H_Sword");
  else if (weapon === "wooden_club") show.push("1H_Axe");
  else if (kind === "Mage") show.push("1H_Wand");
  if (kind === "Knight" && weapon) show.push("Round_Shield");
  return { kind, show };
}
