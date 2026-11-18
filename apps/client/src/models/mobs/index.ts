// Registro: tipo de criatura (mobs.ts del paquete compartido) → su modelo.
import type { MobId } from "@mmorpg/shared";
import type { MobModel } from "./types";
import { createBoar, createSpider, createWolf } from "./animals";
import { createBandit, createSkeleton, createTroll } from "./humanoids";
export type { MobModel } from "./types";

const FACTORY: Record<MobId, () => MobModel> = {
  wolf: createWolf, boar: createBoar, spider: createSpider,
  bandit: createBandit, skeleton: createSkeleton, troll: createTroll,
};
export const createMobModel = (id: MobId | undefined): MobModel => (FACTORY[id ?? "wolf"] ?? createWolf)();
