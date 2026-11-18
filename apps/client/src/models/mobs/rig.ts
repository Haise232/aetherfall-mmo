// Base común de los humanoides con esqueleto KayKit (esqueleto y trol): carga un .glb una sola vez, clona con
// SkeletonUtils, comparte geometrías y reparte las animaciones (reposo, andar, correr, atacar, dolor, morir).
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { MobModel } from "./types";

const loader = new GLTFLoader(), cache = new Map<string, Promise<GLTF>>();
export const loadGlb = (url: string) => { let p = cache.get(url); if (!p) { p = loader.loadAsync(url); cache.set(url, p); } return p; };

export interface RigCfg {
  gltf: Promise<GLTF>;
  /** Escala del modelo (KayKit mide ~2,25 m a escala 1). */
  scale: number;
  height: number; ring: number;
  /** Volumen del clic: ancho, alto y fondo (la base está en el suelo). */
  hit: [number, number, number];
  clips: { idle: string; walk: string; run: string; attack: string[]; hurt: string[]; death: string; revive?: string };
  /** Velocidad (m/s) a la que el ciclo de andar/correr va a ritmo normal, y desde cuándo corre. */
  walkRef: number; runRef: number; runAt: number;
  /** Duración deseada de cada golpe (s); la animación se acelera o frena para ajustarse. */
  attackSec: number;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const BLOB = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 });
const blobGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);

export class RigMob implements MobModel {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly height: number; readonly ring: number;
  /** Cuelga de aquí el modelo: las subclases pueden moverlo (temblor) sin tocar `group`. */
  protected holder = new THREE.Group();
  protected model?: THREE.Object3D;
  protected mixer?: THREE.AnimationMixer;
  protected actions = new Map<string, THREE.AnimationAction>();
  protected mats: THREE.MeshStandardMaterial[] = [];
  protected dead = false;
  private current = ""; private oneShot = ""; private flashT = 0; private pendingAttack = false;

  constructor(protected cfg: RigCfg) {
    this.height = cfg.height; this.ring = cfg.ring;
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(...cfg.hit), hitMat);
    this.hitbox.position.y = cfg.hit[1] / 2;
    const blob = new THREE.Mesh(blobGeo, BLOB); blob.scale.setScalar(cfg.hit[0] * 0.62); blob.position.y = 0.09; blob.renderOrder = 2;
    this.holder.scale.setScalar(cfg.scale);
    this.group.add(blob, this.holder, this.hitbox);
    void cfg.gltf.then(g => this.build(g));
  }

  /** Lo que cada modelo necesita antes de verse: materiales, accesorios, huesos. */
  protected onBuild(_model: THREE.Object3D): void {}
  /** Cada fotograma, después de actualizar la animación. */
  protected onUpdate(_dt: number, _speed: number): void {}
  protected onAttack(): void {}

  private build(g: GLTF) {
    const model = SkeletonUtils.clone(g.scene);
    model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    this.onBuild(model);
    // el destello de golpe necesita materiales propios (los del .glb se comparten)
    model.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material) || !(m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
      const c = (m.material as THREE.MeshStandardMaterial).clone(); m.material = c; this.mats.push(c);
    });
    this.model = model; this.holder.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of g.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener("finished", () => { this.oneShot = ""; });
    if (this.dead) { this.play(this.cfg.clips.death, 0, true); this.mixer.update(10); } // aparece ya caído
    this.update(0, 0);
    if (this.pendingAttack) { this.pendingAttack = false; this.attack(); }
  }

  protected play(name: string, fade = 0.2, once = false, timeScale = 1) {
    const a = this.actions.get(name); if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name && !once) return;
    const prev = this.actions.get(this.current);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.fadeIn(fade).play();
    if (prev && prev !== a) prev.fadeOut(fade);
    this.current = name;
  }
  protected actionTime(name: string) { return this.actions.get(name); }

  attack() {
    if (!this.mixer) { this.pendingAttack = true; return; }
    if (this.dead) return;
    const c = this.cfg.clips.attack, clip = c[(Math.random() * c.length) | 0]!, a = this.actions.get(clip); if (!a) return;
    const dur = a.getClip().duration, ts = Math.max(0.8, Math.min(2.2, dur / this.cfg.attackSec));
    this.oneShot = clip; this.play(clip, 0.1, true, ts); this.onAttack();
  }
  hurt(strong = false) {
    this.flashT = 1;
    if (this.dead || !this.mixer || (this.oneShot && !strong)) return;
    const h = this.cfg.clips.hurt, clip = h[(Math.random() * h.length) | 0]!;
    if (this.oneShot === clip) return;
    this.oneShot = clip; this.play(clip, 0.06, true, 1.5);
  }
  setDead(d: boolean) {
    if (d === this.dead) return;
    this.dead = d; this.oneShot = "";
    if (!d) { this.actions.get(this.current)?.fadeOut(0.2); // el clip de muerte sigue puesto: se funde para que no se mezcle con el reposo
      this.current = ""; const r = this.cfg.clips.revive; if (r && this.mixer) { this.oneShot = r; this.play(r, 0.05, true, 1.2); } }
  }

  update(dt: number, speed: number) {
    if (!this.mixer) return;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      for (const m of this.mats) { m.emissive.setHex(this.flashT > 0 ? 0xffffff : this.baseEmissive(m)); m.emissiveIntensity = this.flashT > 0 ? this.flashT * 0.7 : this.baseIntensity(m); }
    }
    const c = this.cfg.clips;
    if (this.dead) this.play(c.death, 0.12, this.current !== c.death, 1);
    else if (!this.oneShot) {
      if (speed < 0.35) this.play(c.idle, 0.25);
      else if (speed < this.cfg.runAt) this.play(c.walk, 0.2, false, Math.max(0.5, speed / this.cfg.walkRef));
      else this.play(c.run, 0.18, false, Math.max(0.7, speed / this.cfg.runRef));
    }
    this.mixer.update(dt);
    this.onUpdate(dt, speed);
  }
  protected baseEmissive(_m: THREE.MeshStandardMaterial) { return 0x000000; }
  protected baseIntensity(_m: THREE.MeshStandardMaterial) { return 1; }
  get loaded() { return !!this.model; }
  dispose() { for (const m of this.mats) m.dispose(); this.mats = []; this.mixer?.stopAllAction(); }
}
