// Recolección: cada oficio recoge un recurso del mundo. Datos y reglas puras, compartidas por cliente y servidor.
import { CITY_R, FIELDS, LAKE, MOB_SPAWNS, ROAD_W, ROCKS, TREES, WINDMILLS, WORLD_HALF, seededRandom } from "./world";
import type { JobId } from "./quests";
import { RARITIES, withRarity } from "./items";

export type GatherKind = "fish" | "ore" | "herb" | "skin";

export interface GatherDef {
  job: JobId;
  /** Segundos de faena a nivel 1 (bajan con el nivel del oficio). */
  time: number;
  /** Distancia máxima al punto (desde la orilla, en la pesca). */
  range: number;
  /** Segundos que tarda el punto en volver a estar disponible. */
  respawn: number;
  verb: string; doing: string; place: string;
  /** Aviso cuando el punto está agotado. */
  empty: string;
  /** Animación del personaje mientras trabaja. */
  anim: string;
}

export const GATHER: Record<GatherKind, GatherDef> = {
  fish: { job: "fisher", time: 4.5, range: 8, respawn: 25, verb: "Pescar", doing: "Pescando", place: "banco de peces", empty: "Este banco de peces está agotado. Vuelve más tarde.", anim: "Interact" },
  ore: { job: "miner", time: 3.5, range: 3.4, respawn: 45, verb: "Picar", doing: "Picando", place: "veta de mineral", empty: "Esta veta está agotada. Vuelve más tarde.", anim: "1H_Melee_Attack_Chop" },
  herb: { job: "gatherer", time: 2.6, range: 2.8, respawn: 30, verb: "Recoger", doing: "Recogiendo", place: "mata de hierbas", empty: "Esta mata ya está recogida. Vuelve más tarde.", anim: "PickUp" },
  skin: { job: "tanner", time: 2.6, range: 3.0, respawn: 0, verb: "Desollar", doing: "Desollando", place: "lobo abatido", empty: "A este lobo ya lo han desollado.", anim: "Use_Item" },
};
/** Herramienta que hace falta para cada faena. */
export const GATHER_TOOL: Record<GatherKind, string> = { fish: "fishing_rod", ore: "pickaxe", herb: "sickle", skin: "skinning_knife" };
export const gatherOfJob = (job: string | undefined) => (Object.keys(GATHER) as GatherKind[]).find(k => GATHER[k].job === job);
/** Duración real de la faena según el nivel del oficio (un 5 % menos por nivel, hasta un 50 %). */
export const gatherTime = (kind: GatherKind, jobLevel: number) => GATHER[kind].time * Math.max(0.5, 1 - (jobLevel - 1) * 0.05);

/** Botín: `chance` sube con el nivel del oficio (`perLevel`); `bonusAt`: a partir de ese nivel, una unidad más. */
export interface GatherLoot { item: string; chance: number; perLevel?: number; min: number; max: number; bonusAt?: number }
export const GATHER_LOOT: Record<GatherKind, GatherLoot[]> = {
  fish: [
    { item: "trout", chance: 0.9, min: 1, max: 1, bonusAt: 4 },
    { item: "carp", chance: 0.25, perLevel: 0.03, min: 1, max: 1 },
    { item: "golden_pike", chance: 0.03, perLevel: 0.01, min: 1, max: 1 },
  ],
  ore: [
    { item: "iron_ore", chance: 1, min: 1, max: 2, bonusAt: 4 },
    { item: "coal", chance: 0.5, perLevel: 0.03, min: 1, max: 1 },
    { item: "silver_nugget", chance: 0.05, perLevel: 0.015, min: 1, max: 1 },
  ],
  herb: [
    { item: "healing_herb", chance: 1, min: 1, max: 2, bonusAt: 4 },
    { item: "wild_berries", chance: 0.5, perLevel: 0.03, min: 1, max: 2 },
    { item: "moonflower", chance: 0.04, perLevel: 0.015, min: 1, max: 1 },
  ],
  skin: [
    { item: "wolf_pelt", chance: 1, min: 1, max: 2, bonusAt: 4 },
    { item: "thick_hide", chance: 0.15, perLevel: 0.03, min: 1, max: 1 },
    { item: "wolf_fang", chance: 0.3, min: 1, max: 1 },
  ],
};
/** Objetos raros (dan más experiencia de oficio y se anuncian). */
export const RARE_GATHER = new Set(["golden_pike", "silver_nugget", "moonflower", "thick_hide"]);
export const GATHER_XP = 15, GATHER_RARE_XP = 25;

/**
 * Probabilidades de cada rareza (índices 1..4; el resto, común) según el nivel del oficio.
 * La legendaria solo aparece a partir del nivel 5.
 */
export function rarityChances(jobLevel: number): number[] {
  const L = Math.max(0, jobLevel - 1);
  return [0, Math.min(0.3, 0.15 + 0.015 * L), Math.min(0.14, 0.03 + 0.008 * L), Math.min(0.06, 0.004 + 0.003 * L), L >= 4 ? Math.min(0.025, 0.002 + 0.0015 * (L - 4)) : 0];
}
/** Rareza de un objeto recolectado. `rich`: riqueza del punto (1..3): a menudo garantiza al menos esa rareza. */
export function rollRarity(jobLevel: number, rich = 0, rand = Math.random): number {
  const ch = rarityChances(jobLevel), u = rand();
  let r = 0, acc = 0;
  for (let k = RARITIES.length - 1; k >= 1; k--) { acc += ch[k]! * (1 + rich * 0.8); if (u < acc) { r = k; break; } }
  if (rich > 0 && rand() < 0.6) r = Math.max(r, rich);
  return r;
}
/** Riqueza con la que reaparece un punto: casi siempre normal; a veces poco común, raro o épico (brilla de su color). */
export function rollRichness(rand = Math.random): number {
  const u = rand();
  return u < 0.02 ? 3 : u < 0.1 ? 2 : u < 0.3 ? 1 : 0;
}
/** Tira el botín de una faena (rand inyectable para pruebas). Cada objeto sale con su rareza. */
export function rollGather(kind: GatherKind, jobLevel: number, rand = Math.random, rich = 0) {
  const out: { item: string; qty: number; rarity: number }[] = [];
  for (const l of GATHER_LOOT[kind]) {
    if (rand() >= Math.min(0.95, l.chance + (l.perLevel ?? 0) * (jobLevel - 1))) continue;
    const qty = l.min + Math.floor(rand() * (l.max - l.min + 1)) + (l.bonusAt && jobLevel >= l.bonusAt ? 1 : 0);
    const rarity = rollRarity(jobLevel, rich, rand);
    out.push({ item: withRarity(l.item, rarity), qty, rarity });
  }
  return out;
}

/** Punto de recolección fijo (los lobos para desollar no son puntos: son sus cuerpos). */
export interface GatherNode { id: number; kind: Exclude<GatherKind, "skin">; x: number; z: number }

export const GATHER_NODES: GatherNode[] = (() => {
  const r = seededRandom(9001), out: GatherNode[] = [];
  const add = (kind: GatherNode["kind"], x: number, z: number) => out.push({ id: out.length, kind, x, z });
  // bancos de peces repartidos por el lago, cerca de la orilla
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; add("fish", LAKE.x + Math.cos(a) * (LAKE.r - 4), LAKE.z + Math.sin(a) * (LAKE.r - 4)); }
  const free = (x: number, z: number, m: number) =>
    Math.hypot(x, z) > CITY_R + 10 && Math.abs(x) < WORLD_HALF - 10 && Math.abs(z) < WORLD_HALF - 10 &&
    Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 6 &&
    FIELDS.every(f => !(x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m)) &&
    WINDMILLS.every(w => Math.hypot(x - w.x, z - w.z) > 10) &&
    !(Math.abs(z) < ROAD_W / 2 + m && Math.abs(x) > CITY_R - 2) && !(Math.abs(x) < ROAD_W / 2 + m && z > CITY_R - 2) &&
    TREES.every(t => Math.hypot(x - t.x, z - t.z) > m + 0.8 * t.s) && ROCKS.every(p => Math.hypot(x - p.x, z - p.z) > m + 0.8) &&
    MOB_SPAWNS.every(p => Math.hypot(x - p.x, z - p.z) > 6) &&
    out.every(n => Math.hypot(x - n.x, z - n.z) > 14);
  const scatter = (kind: GatherNode["kind"], n: number, m: number) => {
    for (let i = 0, k = 0; i < 6000 && k < n; i++) {
      const x = (r() * 2 - 1) * WORLD_HALF, z = (r() * 2 - 1) * WORLD_HALF;
      if (free(x, z, m)) { add(kind, x, z); k++; }
    }
  };
  scatter("ore", 16, 2.2);
  scatter("herb", 24, 1.6);
  return out;
})();
