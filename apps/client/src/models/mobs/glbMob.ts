// Animal a partir de un .glb animado de Quaternius (CC0): se clona con su esqueleto, se anima con un AnimationMixer
// (parado / andar / correr según la velocidad, ataque y golpe puntuales, muerte que se queda caída) y se le añade
// el destello al golpe y el retroceso procedurales. El .glb se descarga una vez y se comparte entre todas las instancias.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { MobModel } from "./types";

export interface GlbSpec {
  url: string;
  scale: number; // escala del modelo para el tamaño pedido en el juego
  yaw?: number; // giro para que mire a +Z
  idle: string; walk: string; run: string; attack: string; death: string; hits?: string[];
  walkSpeed: number; runSpeed: number; runAt: number; // m/s con los que anda/corre a velocidad 1 de la animación, y velocidad a partir de la cual pasa de andar a correr
  lunge?: number; // metros que se lanza hacia delante al atacar (el clip es en el sitio)
  attackScale?: number; // acelera el ataque (el servidor golpea cada 1,3–1,6 s)
  tint?: number; tintAmount?: number; // tinte (mezcla con el color original)
  box: [number, number, number]; hitY: number; height: number; ring: number; shadow: [number, number];
  extra?: (model: THREE.Object3D, mats: THREE.MeshStandardMaterial[]) => void; // retoques (colmillos, cerdas...)
}

const loader = new GLTFLoader(), cache = new Map<string, Promise<GLTF>>();
export const loadGlb = (url: string) => { let p = cache.get(url); if (!p) { p = loader.loadAsync(url); cache.set(url, p); } return p; };
const SHADOW_M = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 });
const HIT_M = new THREE.MeshBasicMaterial({ visible: false });
let shadowGeo: THREE.CircleGeometry | undefined;

export class GlbMob implements MobModel {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh; readonly height: number; readonly ring: number;
  private inner = new THREE.Group(); // aquí se aplica el retroceso; el modelo va dentro
  private mixer?: THREE.AnimationMixer;
  private act: Record<"idle" | "walk" | "run" | "attack" | "death", THREE.AnimationAction | undefined> = { idle: undefined, walk: undefined, run: undefined, attack: undefined, death: undefined };
  private hits: THREE.AnimationAction[] = [];
  private w = { idle: 1, walk: 0, run: 0 };
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0; private rec = 0; private dead = false; private atkT = 0; private atkE = -1; private atkD = 1; private t = Math.random() * 10; private dispo = false;
  private pendingDead = false;

  constructor(private spec: GlbSpec) {
    shadowGeo ??= new THREE.CircleGeometry(1, 16);
    const sh = new THREE.Mesh(shadowGeo, SHADOW_M); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.renderOrder = 2; sh.scale.set(spec.shadow[0], spec.shadow[1], 1);
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(...spec.box), HIT_M); this.hitbox.position.y = spec.hitY;
    this.height = spec.height; this.ring = spec.ring;
    this.group.add(sh, this.inner, this.hitbox);
    void loadGlb(spec.url).then(g => this.build(g));
  }

  private build(gltf: GLTF) {
    if (this.dispo) return;
    const s = this.spec, model = SkeletonUtils.clone(gltf.scene), pivot = new THREE.Group();
    pivot.rotation.y = s.yaw ?? 0; pivot.scale.setScalar(s.scale); pivot.add(model);
    const tint = s.tint !== undefined ? new THREE.Color(s.tint) : null, tone = 1 + (Math.random() - 0.5) * 0.25;
    model.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      m.frustumCulled = false; // los huesos se mueven fuera de la caja de reposo
      m.material = (Array.isArray(m.material) ? m.material : [m.material]).map(x => {
        const c = (x as THREE.MeshStandardMaterial).clone(); c.color.multiplyScalar(tone); if (tint) c.color.lerp(tint, s.tintAmount ?? 0.5); this.mats.push(c); return c;
      })[0]!;
    });
    s.extra?.(model, this.mats);
    this.inner.add(pivot);
    const mx = this.mixer = new THREE.AnimationMixer(model), clip = (n: string) => gltf.animations.find(a => a.name === n) ?? gltf.animations.find(a => a.name.endsWith("|" + n) || a.name.endsWith(n));
    const mk = (n: string, once = false) => { const c = clip(n); if (!c) return undefined; const a = mx.clipAction(c); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } return a; };
    this.act.idle = mk(s.idle); this.act.walk = mk(s.walk); this.act.run = mk(s.run); this.act.attack = mk(s.attack, true); this.act.death = mk(s.death, true);
    for (const n of s.hits ?? []) { const a = mk(n, true); if (a) this.hits.push(a); }
    for (const k of ["idle", "walk", "run"] as const) { const a = this.act[k]; if (a) { a.play(); a.setEffectiveWeight(this.w[k]); a.time = Math.random() * a.getClip().duration; } }
    if (this.pendingDead) this.setDead(true);
  }

  update(dt: number, speed: number) {
    dt = Math.min(dt, 0.1); this.t += dt;
    // destello y retroceso (también antes de cargar el modelo)
    if (this.flash > 0 || this.mats[0]?.emissiveIntensity) { this.flash = Math.max(0, this.flash - dt * 6); for (const m of this.mats) { m.emissive.setHex(0xffffff); m.emissiveIntensity = this.flash * 0.7; } }
    this.rec = Math.max(0, this.rec - dt * 4.5);
    let lz = 0; if (this.atkE >= 0) { this.atkE += dt; const u = this.atkE / this.atkD; if (u >= 1) this.atkE = -1; else lz = Math.sin(Math.PI * Math.min(1, u * 1.3)) * (this.spec.lunge ?? 0); }
    this.inner.position.z = lz - this.rec * 0.18; this.inner.rotation.x = this.rec * 0.1;
    if (!this.mixer) return;
    // mezcla de pasos: parado → andar → correr según la velocidad real
    const s = this.spec, sp = this.dead ? 0 : speed;
    const tgt = { idle: sp < 0.15 ? 1 : 0, walk: sp >= 0.15 && sp < s.runAt ? 1 : 0, run: sp >= s.runAt ? 1 : 0 }, k = Math.min(1, dt * 9);
    for (const n of ["idle", "walk", "run"] as const) {
      this.w[n] += (tgt[n] - this.w[n]) * k; const a = this.act[n]; if (!a) continue;
      a.setEffectiveWeight(this.w[n] * (this.dead ? 0 : 1)); // muerto: solo manda la animación de muerte
      if (n === "walk") a.timeScale = Math.min(2.2, Math.max(0.5, sp / s.walkSpeed)); else if (n === "run") a.timeScale = Math.min(1.6, Math.max(0.6, sp / s.runSpeed)); else a.timeScale = 1;
    }
    if (this.atkT > 0) { this.atkT -= dt; if (this.atkT <= 0) this.act.attack?.fadeOut(0.15); }
    this.mixer.update(dt);
  }
  attack() {
    const a = this.act.attack; if (!a || this.dead) return;
    a.reset().setEffectiveTimeScale(this.spec.attackScale ?? 1).setEffectiveWeight(1).fadeIn(0.08).play();
    this.atkD = a.getClip().duration / (this.spec.attackScale ?? 1); this.atkT = this.atkD - 0.12; this.atkE = 0;
  }
  hurt(strong = false) {
    this.flash = 1; this.rec = strong ? 1.5 : 1;
    if (this.hits.length && !this.dead && this.atkT <= 0) { const a = this.hits[(Math.random() * this.hits.length) | 0]!; a.reset().setEffectiveWeight(1).setEffectiveTimeScale(1.2).fadeIn(0.05).play(); a.fadeOut(0.3); }
  }
  setDead(d: boolean) {
    if (d === this.dead && !this.pendingDead) return;
    this.dead = d; this.pendingDead = d && !this.mixer;
    const a = this.act.death; if (!this.mixer) return;
    if (d) { for (const h of this.hits) h.stop(); this.act.attack?.stop(); this.atkT = 0; this.atkE = -1; a?.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(0.1).play(); }
    else { a?.fadeOut(0.05); a?.stop(); }
  }
  dispose() { this.dispo = true; this.mixer?.stopAllAction(); for (const m of this.mats) m.dispose(); }
}
