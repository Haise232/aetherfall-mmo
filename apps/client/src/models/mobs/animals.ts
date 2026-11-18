// Modelos de animales: lobo, jabalí y araña gigante (Quaternius, CC0, ver public/models/mobs/CREDITOS-animales.md).
import type { MobModel } from "./types";
import { GlbMob, loadGlb, type GlbSpec } from "./glbMob";
import { Quad } from "./quadruped";

const WOLF: GlbSpec = {
  url: "/models/mobs/Wolf.glb", scale: 0.45, idle: "Idle", walk: "Walk", run: "Gallop", attack: "Attack", death: "Death", hits: ["Idle_HitReact_Left", "Idle_HitReact_Right"],
  lunge: 0.6, attackScale: 1.5, walkSpeed: 1.0, runSpeed: 4.5, runAt: 1.9, box: [1.1, 1.25, 2.1], hitY: 0.7, height: 1.55, ring: 1.35, shadow: [0.7, 1.25],
};
const SPIDER: GlbSpec = {
  url: "/models/mobs/Spider.glb", scale: 0.6, idle: "Spider_Idle", walk: "Spider_Walk", run: "Spider_Walk", attack: "Spider_Attack", death: "Spider_Death",
  lunge: 0.5, attackScale: 1.3, walkSpeed: 1.8, runSpeed: 4, runAt: 99, box: [2.6, 1.2, 2.6], hitY: 0.6, height: 1.6, ring: 2.4, shadow: [1.5, 1.7],
};
export const createWolf = (): MobModel => new GlbMob(WOLF);
// El jabalí es procedural (quadruped.ts): el cerdo de Quaternius es demasiado caricaturesco y sin colmillos para un enemigo de nivel 3.
export const createBoar = (): MobModel => new Quad(true);
export const createSpider = (): MobModel => new GlbMob(SPIDER);
void loadGlb(WOLF.url); void loadGlb(SPIDER.url); // precarga: el primer lobo no aparece vacío
