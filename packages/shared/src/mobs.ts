// Enemigos de fuera de la muralla: un tipo por zona y por nivel (los lobos rodean la ciudad; cuanto más lejos y
// más al norte, más peligro). Datos puros: el servidor los usa para simular y el cliente para dibujar y avisar.
import { DRAGON_LAIR, FIELDS, LAKE, MOB_SPAWNS, MOB_ZONES, WINDMILLS, WORLD_HALF, SAFE_R, resolveCollisions } from "./world";
import { LOOT_WOLF, type LootEntry } from "./items";

export type MobId = "wolf" | "boar" | "spider" | "bandit" | "skeleton" | "troll";

export interface MobDef {
  id: MobId;
  name: string; // nombre que se ve sobre la criatura
  plural: string; // para avisos ("Jabalíes")
  level: number;
  hp: number; damage: number; speed: number; range: number; cooldown: number; // ataque cuerpo a cuerpo
  aggro: number; leash: number; respawnSec: number; // distancia a la que ataca, hasta dónde persigue y reaparición
  radius: number; // tamaño para las colisiones
  xp: number; // experiencia al matarlo
  skin?: true; // se puede desollar (oficio de peletero)
  loot: LootEntry[];
  /** Zona donde viven: centro, radio y cuántos hay. */
  zone: { x: number; z: number; r: number; count: number; label: string };
}

export const MOBS: Record<MobId, MobDef> = {
  wolf: {
    id: "wolf", name: "Lobo", plural: "Lobos", level: 1, hp: 50, damage: 6, speed: 3, range: 1.8, cooldown: 1.5, aggro: 10, leash: 18, respawnSec: 10,
    radius: 0.6, xp: 20, skin: true, loot: LOOT_WOLF, zone: { x: 0, z: 0, r: 0, count: 22, label: "alrededor de la muralla" },
  },
  boar: {
    id: "boar", name: "Jabalí", plural: "Jabalíes", level: 3, hp: 90, damage: 9, speed: 3.4, range: 1.9, cooldown: 1.6, aggro: 8, leash: 16, respawnSec: 14,
    radius: 0.7, xp: 35, skin: true, zone: { ...MOB_ZONES.boar, count: 7, label: "entre los campos del sureste" },
    loot: [{ item: "boar_tusk", chance: 0.6, min: 1, max: 2 }, { item: "thick_hide", chance: 0.25, min: 1, max: 1 }, { item: "leather_armor", chance: 0.08, min: 1, max: 1 }, { item: "rusty_sword", chance: 0.05, min: 1, max: 1 }],
  },
  spider: {
    id: "spider", name: "Araña gigante", plural: "Arañas gigantes", level: 5, hp: 120, damage: 12, speed: 4, range: 2, cooldown: 1.3, aggro: 11, leash: 18, respawnSec: 16,
    radius: 0.9, xp: 55, zone: { ...MOB_ZONES.spider, count: 8, label: "en el bosque del este" },
    loot: [{ item: "spider_silk", chance: 0.65, min: 1, max: 3 }, { item: "venom_sac", chance: 0.25, min: 1, max: 1 }, { item: "iron_armor", chance: 0.05, min: 1, max: 1 }, { item: "steel_sword", chance: 0.03, min: 1, max: 1 }],
  },
  bandit: {
    id: "bandit", name: "Bandido", plural: "Bandidos", level: 7, hp: 170, damage: 15, speed: 3.4, range: 2.1, cooldown: 1.4, aggro: 12, leash: 20, respawnSec: 20,
    radius: 0.5, xp: 80, zone: { ...MOB_ZONES.bandit, count: 6, label: "en su campamento del suroeste" },
    loot: [{ item: "bandit_badge", chance: 0.55, min: 1, max: 1 }, { item: "steel_sword", chance: 0.08, min: 1, max: 1 }, { item: "chainmail", chance: 0.07, min: 1, max: 1 }, { item: "iron_armor", chance: 0.1, min: 1, max: 1 }],
  },
  skeleton: {
    id: "skeleton", name: "Esqueleto", plural: "Esqueletos", level: 9, hp: 230, damage: 18, speed: 2.8, range: 2.1, cooldown: 1.5, aggro: 12, leash: 20, respawnSec: 22,
    radius: 0.5, xp: 110, zone: { ...MOB_ZONES.skeleton, count: 8, label: "en las ruinas del noreste" },
    loot: [{ item: "ancient_bone", chance: 0.65, min: 1, max: 2 }, { item: "chainmail", chance: 0.08, min: 1, max: 1 }, { item: "war_axe", chance: 0.04, min: 1, max: 1 }],
  },
  troll: {
    id: "troll", name: "Trol de las rocas", plural: "Troles de las rocas", level: 12, hp: 420, damage: 28, speed: 2.6, range: 2.8, cooldown: 2.2, aggro: 10, leash: 20, respawnSec: 35,
    radius: 1.2, xp: 180, zone: { ...MOB_ZONES.troll, count: 4, label: "al norte, detrás del castillo" },
    loot: [{ item: "stone_heart", chance: 0.5, min: 1, max: 1 }, { item: "plate_armor", chance: 0.07, min: 1, max: 1 }, { item: "war_axe", chance: 0.08, min: 1, max: 1 }],
  },
};
export const MOB_IDS = Object.keys(MOBS) as MobId[];
export const mobOf = (id?: string): MobDef => MOBS[(id && id in MOBS ? id : "wolf") as MobId];

/** Puntos de aparición de cada tipo: los lobos en el anillo de siempre; el resto repartidos por su zona sin pisar agua, campos ni obstáculos. */
function zoneSpawns(def: MobDef): { x: number; z: number }[] {
  if (def.id === "wolf") return MOB_SPAWNS.slice(0, def.zone.count);
  let seed = def.level * 7919 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 400 && out.length < def.zone.count; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * def.zone.r, x = def.zone.x + Math.cos(a) * d, z = def.zone.z + Math.sin(a) * d;
    if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5 || Math.hypot(x, z) < SAFE_R + 6) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4 || Math.hypot(x - DRAGON_LAIR.x, z - DRAGON_LAIR.z) < DRAGON_LAIR.r + 8) continue;
    if (FIELDS.some(f => x > f.x0 - 2 && x < f.x1 + 2 && z > f.z0 - 2 && z < f.z1 + 2) || WINDMILLS.some(w => Math.hypot(x - w.x, z - w.z) < 9)) continue;
    const [cx, cz] = resolveCollisions(x, z, def.radius + 0.3);
    if (Math.hypot(cx - x, cz - z) > 0.01 || out.some(o => Math.hypot(o.x - x, o.z - z) < 4)) continue;
    out.push({ x, z });
  }
  return out;
}
export const MOB_SPAWN_POINTS: Record<MobId, { x: number; z: number }[]> = Object.fromEntries(MOB_IDS.map(id => [id, zoneSpawns(MOBS[id])])) as Record<MobId, { x: number; z: number }[]>;
