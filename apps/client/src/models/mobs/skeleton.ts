// Esqueleto (KayKit Skeletons Character Pack, CC0): guerrero con arma oxidada y escudo roto, ojos que brillan.
import * as THREE from "three";
import { RigMob, loadGlb } from "./rig";
import type { MobModel } from "./types";

const URL = "/models/mobs/Skeleton_Warrior.glb";
// Variantes: arma, escudo, y si lleva yelmo o capa. Se reparten al azar entre los de una misma zona.
const VARIANTS = [
  { weapon: "Skeleton_Blade", shield: "Skeleton_Shield_Large_B", helmet: true, cloak: false },
  { weapon: "Skeleton_Axe", shield: "Skeleton_Shield_Small_A", helmet: false, cloak: true },
  { weapon: "Skeleton_Blade", shield: "Skeleton_Shield_Large_A", helmet: false, cloak: false },
  { weapon: "Skeleton_Axe", shield: "", helmet: true, cloak: true },
];
const WEAPONS = ["Skeleton_Axe", "Skeleton_Blade", "Skeleton_Shield_Large_A", "Skeleton_Shield_Large_B", "Skeleton_Shield_Small_A"];
// Materiales compartidos entre todos los esqueletos: hueso amarillento (el destello de golpe usa copias propias) y ojos sin luz.
const rust = new Map<string, THREE.Material>(), eyeMats = new Map<string, THREE.MeshBasicMaterial>();

class Skeleton extends RigMob {
  private v = VARIANTS[(Math.random() * VARIANTS.length) | 0]!;
  constructor() {
    super({
      gltf: loadGlb(URL), scale: 0.88, height: 2.15, ring: 1.1, hit: [0.95, 1.95, 0.95], attackSec: 0.85,
      clips: { idle: "Idle_Combat", walk: "Walking_D_Skeletons", run: "Running_B", attack: ["1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Diagonal"], hurt: ["Hit_A", "Hit_B"], death: "Death_C_Skeletons", revive: "Skeletons_Awaken_Standing" },
      walkRef: 1.5, runRef: 3.05, runAt: 3.4, // el andar rígido va a ~1,1 m/s a ritmo normal: se acelera a ~1,9x al perseguir
    });
  }
  protected override onBuild(model: THREE.Object3D) {
    const v = this.v, hand = (n: string) => model.getObjectByName(n)!;
    // las piezas de equipo vienen sueltas en la raíz del .glb: las que sobran se quitan y las elegidas van a la mano
    for (const n of WEAPONS) {
      const o = model.getObjectByName(n); if (!o) continue;
      const mine = n === v.weapon ? "handslotr" : n === v.shield ? "handslotl" : "";
      o.removeFromParent();
      if (mine) { hand(mine).add(o); o.traverse(m => { const me = m as THREE.Mesh; if (me.isMesh) me.material = oxidado(me.material as THREE.MeshStandardMaterial, n); }); }
    }
    model.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      if (m.name.endsWith("_Helmet")) m.visible = v.helmet;
      else if (m.name.endsWith("_Cloak")) m.visible = v.cloak;
      else if (m.name.endsWith("_Eyes")) m.material = brillo(m.material as THREE.MeshStandardMaterial);
      else if (m.name.endsWith("_Jaw") || m.name.endsWith("_Head")) m.material = oxidado(m.material as THREE.MeshStandardMaterial, "hueso");
    });
  }
}
function oxidado(src: THREE.MeshStandardMaterial, k: string) {
  let m = rust.get(k);
  if (!m) { const c = src.clone(); c.color.multiply(new THREE.Color(k === "hueso" ? 0xe6dcc0 : 0xc89a72)); c.roughness = 1; c.metalness = 0; m = c; rust.set(k, m); }
  return m;
}
function brillo(src: THREE.MeshStandardMaterial) {
  let m = eyeMats.get(src.uuid);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: 0x7dffd2 }); eyeMats.set(src.uuid, m); }
  return m;
}
export const createSkeleton = (): MobModel => new Skeleton();
