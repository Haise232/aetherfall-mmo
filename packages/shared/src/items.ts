import type { MountId } from "./classes";
import { classRankMult, type SkillState } from "./progression";
// Datos de juego: ítems, loot y progresión. Datos, no lógica dispersa.
export type Slot = "weapon" | "armor";

export interface ItemDef {
  id: string;
  name: string;
  slot?: Slot; // si tiene slot, es equipable
  damage?: number; // bonus de daño (arma)
  defense?: number; // reducción de daño plana (armadura)
  tier: number; // 1..8 como en Albion; por ahora solo 1-2
  /** Categoría (icono y pestaña del inventario). */
  cat: ItemCat;
  /** Precio de referencia en besantes (el subastador paga la mitad). Solo los comerciables. */
  basePrice?: number;
  /** Rareza (0 común … 4 legendaria) y objeto base, en las variantes de los recursos recolectados. */
  rarity?: number; base?: string;
}
export type ItemCat = "weapon" | "armor" | "tool" | "fish" | "ore" | "herb" | "hide" | "trophy";

export const ITEMS: Record<string, ItemDef> = {
  wolf_pelt: { id: "wolf_pelt", name: "Piel de lobo", tier: 1, cat: "hide", basePrice: 8 },
  wolf_fang: { id: "wolf_fang", name: "Colmillo de lobo", tier: 1, cat: "trophy", basePrice: 10 },
  wooden_club: { id: "wooden_club", name: "Hacha de leñador", tier: 1, slot: "weapon", damage: 3, cat: "weapon" },
  rusty_sword: { id: "rusty_sword", name: "Espada oxidada", tier: 2, slot: "weapon", damage: 7, cat: "weapon" },
  leather_armor: { id: "leather_armor", name: "Armadura de cuero", tier: 1, slot: "armor", defense: 2, cat: "armor" },
  iron_armor: { id: "iron_armor", name: "Armadura de hierro", tier: 2, slot: "armor", defense: 4, cat: "armor" },
  // herramientas de oficio (las da el maestro del gremio; sin ellas no se recolecta)
  fishing_rod: { id: "fishing_rod", name: "Caña de pescar", tier: 1, cat: "tool" },
  pickaxe: { id: "pickaxe", name: "Pico de minero", tier: 1, cat: "tool" },
  sickle: { id: "sickle", name: "Hoz de recolector", tier: 1, cat: "tool" },
  skinning_knife: { id: "skinning_knife", name: "Cuchillo de desollar", tier: 1, cat: "tool" },
  // recolección (oficios)
  trout: { id: "trout", name: "Trucha", tier: 1, cat: "fish", basePrice: 4 },
  carp: { id: "carp", name: "Carpa", tier: 1, cat: "fish", basePrice: 3 },
  golden_pike: { id: "golden_pike", name: "Lucio dorado", tier: 3, cat: "fish", basePrice: 30 },
  iron_ore: { id: "iron_ore", name: "Mineral de hierro", tier: 1, cat: "ore", basePrice: 6 },
  coal: { id: "coal", name: "Carbón", tier: 1, cat: "ore", basePrice: 5 },
  silver_nugget: { id: "silver_nugget", name: "Pepita de plata", tier: 3, cat: "ore", basePrice: 40 },
  healing_herb: { id: "healing_herb", name: "Hierba curativa", tier: 1, cat: "herb", basePrice: 5 },
  wild_berries: { id: "wild_berries", name: "Bayas silvestres", tier: 1, cat: "herb", basePrice: 3 },
  moonflower: { id: "moonflower", name: "Flor de luna", tier: 3, cat: "herb", basePrice: 35 },
  thick_hide: { id: "thick_hide", name: "Cuero grueso", tier: 2, cat: "hide", basePrice: 18 },
  // trofeos de los enemigos de fuera (ver mobs.ts)
  boar_tusk: { id: "boar_tusk", name: "Colmillo de jabalí", tier: 1, cat: "trophy", basePrice: 12 },
  spider_silk: { id: "spider_silk", name: "Seda de araña", tier: 2, cat: "trophy", basePrice: 14 },
  venom_sac: { id: "venom_sac", name: "Saco de veneno", tier: 2, cat: "trophy", basePrice: 22 },
  bandit_badge: { id: "bandit_badge", name: "Insignia de bandido", tier: 3, cat: "trophy", basePrice: 26 },
  ancient_bone: { id: "ancient_bone", name: "Hueso antiguo", tier: 3, cat: "trophy", basePrice: 30 },
  stone_heart: { id: "stone_heart", name: "Corazón de piedra", tier: 4, cat: "trophy", basePrice: 55 },
  // equipo mejor, de los enemigos de nivel alto
  steel_sword: { id: "steel_sword", name: "Espada de acero", tier: 3, slot: "weapon", damage: 11, cat: "weapon" },
  war_axe: { id: "war_axe", name: "Hacha de guerra", tier: 4, slot: "weapon", damage: 15, cat: "weapon" },
  chainmail: { id: "chainmail", name: "Cota de malla", tier: 3, slot: "armor", defense: 6, cat: "armor" },
  plate_armor: { id: "plate_armor", name: "Armadura de placas", tier: 4, slot: "armor", defense: 9, cat: "armor" },
};

// ---- Rarezas de los recursos ----
// Cada recurso recolectable tiene variantes por rareza registradas aquí mismo en ITEMS con id "base@r" (r = 1..4);
// la común es el id de siempre. Así el inventario, la subasta y los precios funcionan sin casos especiales.
export interface RarityDef { name: string; color: number; price: number; xp: number }
export const RARITIES: RarityDef[] = [
  { name: "común", color: 0xb9b09a, price: 1, xp: 1 },
  { name: "poco común", color: 0x5fbf5a, price: 2, xp: 1.5 },
  { name: "rara", color: 0x4f8fe0, price: 4, xp: 2 },
  { name: "épica", color: 0xa46ad8, price: 9, xp: 3 },
  { name: "legendaria", color: 0xf0b93a, price: 20, xp: 5 },
];
const RARITY_CATS = new Set(["fish", "ore", "herb", "hide", "trophy"]);
for (const d of Object.values(ITEMS)) {
  if (!RARITY_CATS.has(d.cat)) continue;
  for (let r = 1; r < RARITIES.length; r++) {
    const R = RARITIES[r]!;
    ITEMS[`${d.id}@${r}`] = { ...d, id: `${d.id}@${r}`, name: `${d.name} de calidad ${R.name}`, rarity: r, base: d.id, basePrice: d.basePrice ? d.basePrice * R.price : undefined };
  }
}
/** Objeto base de una variante (trout@3 → trout). */
export const baseItem = (id: string) => ITEMS[id]?.base ?? id;
export const rarityOf = (id: string) => ITEMS[id]?.rarity ?? 0;
/** Id de la variante de rareza `r` de un objeto (r = 0: el común). */
export const withRarity = (id: string, r: number) => (r > 0 && ITEMS[`${id}@${r}`] ? `${id}@${r}` : id);

export interface LootEntry { item: string; chance: number; min: number; max: number }

export const LOOT_WOLF: LootEntry[] = [
  { item: "wolf_pelt", chance: 0.7, min: 1, max: 2 },
  { item: "wolf_fang", chance: 0.3, min: 1, max: 1 },
  { item: "wooden_club", chance: 0.1, min: 1, max: 1 },
  { item: "leather_armor", chance: 0.08, min: 1, max: 1 },
  { item: "rusty_sword", chance: 0.04, min: 1, max: 1 },
  { item: "iron_armor", chance: 0.02, min: 1, max: 1 },
];

export const MOB_XP = 20;
export const xpForNext = (level: number) => 50 * level;

export const JOB_XP_PER_LEVEL = 100;
export const jobXpForNext = (level: number) => JOB_XP_PER_LEVEL * level;

export type Equip = Partial<Record<Slot, string>>;
export type Inventory = Record<string, number>;

export interface InvState {
  inv: Inventory; equip: Equip; level: number; xp: number; xpNext: number;
  quest?: string; questCount: number; completedQuests: string[];
  job?: string; jobLevel?: number; jobXp?: number; jobXpNext?: number;
  /** Besantes (moneda). Opcional solo mientras el servidor no lo envíe. */
  coins?: number;
  /** Habilidades: rango de cada una aprendida, opción elegida en cada casilla, y puntos sin gastar. */
  skills?: SkillState; skillPoints?: number;
  /** Monturas ganadas (además de la de la clase) y la elegida (null: la de la clase). */
  mounts?: MountId[]; mount?: MountId | null;
}

export interface Stats { maxHp: number; damage: number; defense: number }

// Misma fórmula en cliente y servidor.
export function playerStats(level: number, equip: Equip, base: { maxHp: number; damage: number }): Stats {
  const w = equip.weapon ? ITEMS[equip.weapon] : undefined;
  const a = equip.armor ? ITEMS[equip.armor] : undefined;
  const k = classRankMult(level); // título de clase: +5 % de vida y daño por rango
  return {
    maxHp: Math.round((base.maxHp + 10 * (level - 1)) * k),
    damage: Math.round((base.damage + 2 * (level - 1)) * k) + (w?.damage ?? 0),
    defense: a?.defense ?? 0,
  };
}
