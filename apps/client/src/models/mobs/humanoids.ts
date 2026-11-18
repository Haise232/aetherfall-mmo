// Modelos de enemigos humanoides: bandido (KayKit Rogue encapuchado), esqueleto (KayKit Skeletons) y trol (procedural sobre el rig KayKit).
import type * as THREE from "three";
import { Character } from "../character";
import type { MobModel } from "./types";
export { createSkeleton } from "./skeleton";
export { createTroll } from "./troll";

// Forajidos: capucha y cuero gastado (el atlas del Rogue encapuchado se repinta en pardo, gris ceniza y rojo óxido) con distintas armas.
const garb = (hood: number, tunic: number, trim: number): Record<number, number> => ({ 8: hood, 9: tunic, 17: tunic, 18: trim });
const PALETTES = [garb(0x3a2e24, 0x5b4631, 0x7b6648), garb(0x2c2c30, 0x4a4a50, 0x6a5a48), garb(0x4a2a22, 0x7a3b2a, 0x5a4a38)];
const WEAPONS = [["Knife", "Knife_Offhand"], ["1H_Sword"], ["1H_Axe", "Barbarian_Round_Shield"], ["Knife"]];
export function createBandit(): MobModel {
  const pick = <T>(a: T[]) => a[(Math.random() * a.length) | 0]!;
  const c = new Character({ kind: "Rogue_Hooded", show: pick(WEAPONS), palette: pick(PALETTES) });
  return { group: c.group, hitbox: c.hitbox, height: 2.15, ring: 1.1, update: (dt, s) => c.update(dt, s), attack: () => c.attack(), hurt: () => c.hurt(), setDead: d => { c.setDead(d); if (!d) (c as unknown as { actions: Map<string, THREE.AnimationAction> }).actions.get("Death_A")?.fadeOut(0.2); } };
}
