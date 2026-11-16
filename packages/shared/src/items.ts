// Datos de juego: ítems, loot y progresión. Datos, no lógica dispersa.
export type Slot = "weapon" | "armor";

export interface ItemDef {
  id: string;
  name: string;
  slot?: Slot; // si tiene slot, es equipable
  damage?: number; // bonus de daño (arma)
  defense?: number; // reducción de daño plana (armadura)
  tier: number; // 1..8 como en Albion; por ahora solo 1-2
}

export const ITEMS: Record<string, ItemDef> = {
  wolf_pelt: { id: "wolf_pelt", name: "Piel de lobo", tier: 1 },
  wolf_fang: { id: "wolf_fang", name: "Colmillo de lobo", tier: 1 },
  wooden_club: { id: "wooden_club", name: "Hacha de leñador", tier: 1, slot: "weapon", damage: 3 },
  rusty_sword: { id: "rusty_sword", name: "Espada oxidada", tier: 2, slot: "weapon", damage: 7 },
  leather_armor: { id: "leather_armor", name: "Armadura de cuero", tier: 1, slot: "armor", defense: 2 },
  iron_armor: { id: "iron_armor", name: "Armadura de hierro", tier: 2, slot: "armor", defense: 4 },
};

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

export type Equip = Partial<Record<Slot, string>>;
export type Inventory = Record<string, number>;

export interface InvState { inv: Inventory; equip: Equip; level: number; xp: number; xpNext: number }

export interface Stats { maxHp: number; damage: number; defense: number }

// Misma fórmula en cliente y servidor.
export function playerStats(level: number, equip: Equip, base: { maxHp: number; damage: number }): Stats {
  const w = equip.weapon ? ITEMS[equip.weapon] : undefined;
  const a = equip.armor ? ITEMS[equip.armor] : undefined;
  return {
    maxHp: base.maxHp + 10 * (level - 1),
    damage: base.damage + 2 * (level - 1) + (w?.damage ?? 0),
    defense: a?.defense ?? 0,
  };
}
