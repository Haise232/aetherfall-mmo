import { DISTRICTS, PARKS, PARK_PROPS, PLAZA_BENCH_PROPS, type DistrictId } from "./parks";
// Mapa del lobby: Valdoria, ciudad medieval amurallada con castillo. Datos deterministas compartidos:
// el cliente construye la escena con ellos y el servidor los usa para colisiones y zona segura.
export const WORLD_HALF = 200;
export const CITY_R = 130; // radio de la muralla
export const SAFE_R = 134; // dentro: ciudad, sin combate
export const PLAZA_R = 17;
export const SPAWN_POINT = { x: 0, z: 14 };
export const CITY_NAME = "Valdoria";

export type BuildingKind = "house" | "cathedral" | "tavern" | "forge" | "guild" | "bank" | "market";
export interface Building {
  id: string; kind: BuildingKind; name: string;
  x: number; z: number; w: number; d: number; h: number; floors: number;
  wall: number; roof: number;
  facing: 0 | 1 | 2 | 3; // 0:+z 1:+x 2:-z 3:-x (lado de la puerta)
  style?: "workshop" | "stable" | "watch" | "hip" | "barn" | "farm" | "hut"; // variante visual de las casas
}
export type TowerStyle = "round" | "keep" | "square" | "spire";
export interface Tower { x: number; z: number; r: number; h: number; roof: number; style?: TowerStyle }
export interface Prop { x: number; z: number; s: number; kind: number }

// ---- Castillo (norte) ----
export const CASTLE = { cx: 0, cz: -72, w: 100, d: 56, wallH: 8, wallT: 3, gateHalf: 5.5 };
export const CASTLE_RECT = { x0: -50, x1: 50, z0: -100, z1: -44 };
/** Barrio de un punto: fuera de la muralla son los campos; luego el castillo, la Plaza Mayor y cuatro barrios separados por las avenidas. */
export function districtAt(x: number, z: number): DistrictId {
  if (Math.hypot(x, z) > CITY_R) return "fields";
  const R = CASTLE_RECT;
  if (x > R.x0 - 2 && x < R.x1 + 2 && z > R.z0 - 2 && z < R.z1 + 2) return "castle";
  if (Math.hypot(x, z) < PLAZA_R + 6) return "plaza";
  if (z < 0) return x < 0 ? "cathedral" : "guild";
  return x < 0 ? "old" : "anvil";
}
export const GREAT_HALL = { x: 0, z: -82, w: 40, d: 15, h: 14 };
export const CASTLE_TOWERS: Tower[] = [
  // esquinas y torres de la puerta
  { x: -50, z: -44, r: 5, h: 19, roof: 0x3d5a80 }, { x: 50, z: -44, r: 5, h: 19, roof: 0x3d5a80 },
  { x: -50, z: -100, r: 5, h: 22, roof: 0x3d5a80 }, { x: 50, z: -100, r: 5, h: 22, roof: 0x3d5a80 },
  { x: -12, z: -44, r: 4, h: 17, roof: 0x7a2f3a }, { x: 12, z: -44, r: 4, h: 17, roof: 0x7a2f3a },
  // torres del castillo (las del gran salón y el homenaje son las más altas)
  // (las que rodean el gran salón quedan detrás de su muro norte: el salón es hueco y se camina por dentro)
  { x: 0, z: -95, r: 4.2, h: 58, roof: 0x2f4a6b, style: "keep" }, { x: 18, z: -94.5, r: 5.5, h: 44, roof: 0x3d5a80, style: "keep" },
  { x: -18, z: -93.5, r: 4.5, h: 38, roof: 0x7a2f3a, style: "keep" }, { x: -33, z: -85, r: 4, h: 30, roof: 0x3d5a80 },
  { x: 33, z: -85, r: 4, h: 33, roof: 0x2f4a6b }, { x: -41, z: -64, r: 3, h: 26, roof: 0x7a2f3a },
  { x: 41, z: -64, r: 3.2, h: 28, roof: 0x3d5a80 }, { x: -15, z: -59, r: 2.6, h: 22, roof: 0x2f4a6b },
  { x: 15, z: -59, r: 2.6, h: 24, roof: 0x7a2f3a }, { x: -35, z: -54, r: 3, h: 23, roof: 0x3d5a80, style: "square" },
  { x: 35, z: -54, r: 3, h: 25, roof: 0x7a2f3a, style: "square" },
  { x: 8, z: -92.3, r: 2.2, h: 54, roof: 0x7a2f3a, style: "spire" }, { x: -9, z: -92.6, r: 2.4, h: 50, roof: 0x3d5a80, style: "spire" },
  { x: -27, z: -67, r: 3, h: 32, roof: 0x7a2f3a, style: "square" }, { x: 27, z: -67, r: 3, h: 35, roof: 0x2f4a6b, style: "square" },
];
// Alas con tejado pegadas a la muralla este y oeste del patio, pórtico del gran salón y parterres.
export const CASTLE_WINGS = [
  { x: 43, z: -82, w: 7, d: 16, h: 9, wall: 0xc9bc9f, roof: 0x4a5a78 },
  { x: -43, z: -82, w: 7, d: 16, h: 10, wall: 0xc9bc9f, roof: 0x7a2f3a },
];
/**
 * Gran salón habitable (salón del trono). Se entra por el arco de la puerta del castillo (z = -74).
 * Muros huecos: `wallT` laterales y fondo, `frontT` la fachada (más gruesa para envolver la puerta).
 */
export const HALL = { door: 7.2, doorH: 9.2, wallT: 1.0, frontT: 1.8, gateZ: -74 };
export interface HallProp { kind: "dais" | "pillar" | "table" | "hearth" | "armor"; x: number; z: number; w: number; d: number; h: number; side?: number }
/** Muebles del salón del trono. Todos chocan; el cliente los dibuja con el mismo dato. */
export const HALL_PROPS: HallProp[] = (() => {
  const H = GREAT_HALL, back = H.z - H.d / 2 + HALL.wallT, sideX = H.w / 2 - HALL.wallT, out: HallProp[] = [];
  out.push({ kind: "dais", x: H.x, z: back + 1.9, w: 7.6, d: 3.8, h: 0.5 }); // tarima con escalones y trono
  for (const s of [-1, 1]) {
    for (const z of [-78.4, -82, -85.6]) out.push({ kind: "pillar", x: H.x + s * 4.6, z, w: 1.1, d: 1.1, h: 13 });
    for (const z of [-79.4, -84.8]) out.push({ kind: "table", x: H.x + s * 12, z, w: 8, d: 2.9, h: 0.9, side: s });
    out.push({ kind: "hearth", x: H.x + s * (sideX - 0.6), z: H.z, w: 1.2, d: 4.4, h: 3.8, side: s });
    out.push({ kind: "armor", x: H.x + s * 5.9, z: back + 1.0, w: 0.8, d: 0.8, h: 2.0, side: s });
  }
  return out;
})();
// Viaducto de piedra sobre el acceso al gran salón: dos pilares a ambos lados del arco (hueco central libre).
export const CASTLE_PIERS = [{ x: -8.95, z: -68, hw: 1.45, hd: 1.5 }, { x: 8.95, z: -68, hw: 1.45, hd: 1.5 }];
export const CASTLE_LAWNS = [
  { x: -8, z: -60, w: 5, d: 7 }, { x: 8, z: -60, w: 5, d: 7 },
  { x: -24, z: -62, w: 8, d: 12 }, { x: 24, z: -62, w: 8, d: 12 },
];

/** Delante de la puerta del castillo: estatuas de los caballeros guardianes y braseros. */
export const CASTLE_GATE_DECOR = {
  statues: [{ x: -9.5, z: -37.4 }, { x: 9.5, z: -37.4 }],
  braziers: [{ x: -6.1, z: -40.4 }, { x: 6.1, z: -40.4 }],
};
export const FOUNTAIN = { x: 0, z: 0, r: 4 };
export const LAKE = { x: -168, z: 70, r: 30 };
/** Nadar: quien está en el agua del lago (a pie) va más despacio y no puede combatir, saltar, recolectar, sentarse ni montar. */
export const SWIM = { speedMult: 0.55, inset: 1, depth: 0.62 }; // depth: lo que se hunde un nadador erguido (m): el agua le llega a los hombros
/** Embarcadero del lago (a pie se camina por encima: no cuenta como agua). Mismas medidas que lo dibuja `lobby.ts`. */
export const PIER = { x0: LAKE.x + LAKE.r + 3.5, z: LAKE.z + 2, len: 10.5, hw: 1.3 };
/** ¿Está (x,z) dentro del agua? (`inset`: la orilla húmeda cuenta como tierra; el embarcadero también). */
export function inWater(x: number, z: number): boolean {
  if (Math.hypot(x - LAKE.x, z - LAKE.z) >= LAKE.r - SWIM.inset) return false;
  return !(x <= PIER.x0 && x >= PIER.x0 - PIER.len && Math.abs(z - PIER.z) <= PIER.hw + 0.4);
}
/** Guarida del dragón, fuera de la muralla al noroeste: claro sin árboles de radio r. */
export const DRAGON_LAIR = { x: -138, z: -138, r: 16 };
/** Zonas de los enemigos de fuera (ver mobs.ts): claros sin árboles para que se vea el combate. */
export const MOB_ZONES = {
  boar: { x: 90, z: 186, r: 12 }, spider: { x: 176, z: -48, r: 16 }, bandit: { x: -150, z: 168, r: 13 },
  skeleton: { x: 150, z: -150, r: 15 }, troll: { x: 0, z: -184, r: 16 },
} as const;
export const GATE_ANGLES = [0, Math.PI / 2, Math.PI]; // Este, Sur, Oeste (el norte lo cierra el castillo)
export const GATE_NAMES = ["Puerta Este", "Puerta Sur", "Puerta Oeste"];
export const GATE_HALF_WIDTH = 7;
export const AVENUE_W = 10;
export const ROAD_W = 6;
export const WINDMILLS = [{ x: 80, z: 160 }, { x: -72, z: 152 }];
export const FIELDS = [
  { x0: 30, z0: 142, x1: 70, z1: 182 }, { x0: -66, z0: 165, x1: -22, z1: 192 }, { x0: 110, z0: 135, x1: 160, z1: 172 },
];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Punto a `along` (tangente) y `out` (normal) de la cara `dir` de un edificio en (cx, cz): igual que `onFace` del cliente. */
export function faceXZ(cx: number, cz: number, dir: number, along: number, out: number) {
  const th = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir]!, c = Math.cos(th), s = Math.sin(th);
  return { x: cx + along * c + out * s, z: cz - along * s + out * c };
}
/** Generador pseudoaleatorio con semilla (mismo resultado en cliente y servidor). */
export const seededRandom = (seed: number) => rng(seed);
const rectDist = (x: number, z: number, cx: number, cz: number, hw: number, hd: number) =>
  Math.hypot(Math.max(Math.abs(x - cx) - hw, 0), Math.max(Math.abs(z - cz) - hd, 0));

// ---- Interiores habitables: el Gremio y las casas-taller ----
// Se entra por la puerta (cara `facing`). Medidas en un marco local: `u` a lo largo de la fachada,
// `v` desde la pared del fondo hacia la puerta. Cliente (muebles) y servidor (colisiones) usan los mismos datos.
export const STORY_H = 2.8, FLOOR_Y = 0.5, WALL_T = 0.25;
export const isEnterable = (b: Building) => b.kind === "guild" || b.style === "workshop";
/** Plantas huecas por dentro (el Gremio tiene doble altura). */
export const hollowFloors = (b: Building) => (b.kind === "guild" ? 2 : 1);
export const interiorH = (b: Building) => FLOOR_Y + hollowFloors(b) * STORY_H;
export const doorW = (b: Building) => (b.kind === "guild" ? 2.4 : 1.6);
const NRM4 = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
export function interiorFrame(b: Building) {
  const n = NRM4[b.facing]!, tx = n[1], tz = -n[0];
  const span = b.facing % 2 === 0 ? b.w : b.d, depth = b.facing % 2 === 0 ? b.d : b.w;
  return {
    n, t: [tx, tz] as const, span, depth,
    /** Punto del mundo en (u, v). */
    at(u: number, v: number) { const out = -depth / 2 + v; return { x: b.x + tx * u + n[0] * out, z: b.z + tz * u + n[1] * out }; },
    /** Orientación (rad) de algo que mira hacia la puerta. */
    ry: Math.atan2(n[0], n[1]),
    /** Caja alineada a los ejes del mundo de tamaño su × sv (local) centrada en (u, v). */
    box(u: number, v: number, su: number, sv: number) {
      const p = this.at(u, v), alongX = Math.abs(tx) > 0.5;
      return { x: p.x, z: p.z, hw: (alongX ? su : sv) / 2, hd: (alongX ? sv : su) / 2 };
    },
  };
}
export interface InteriorProp { kind: string; u: number; v: number; su: number; sv: number; h: number; solid?: boolean }
/** Muebles de cada interior. `solid`: choca (si no, es decoración que se puede pisar o está en alto). */
export function interiorProps(b: Building): InteriorProp[] {
  const f = interiorFrame(b), S = f.span / 2, D = f.depth;
  if (b.kind === "guild") return [
    { kind: "counter", u: 0, v: 6.6, su: 6.4, sv: 0.9, h: 1.1, solid: true },
    { kind: "ledgers", u: -3.6, v: 0.35, su: 2.8, sv: 0.5, h: 2.6, solid: true },
    { kind: "ledgers", u: 3.6, v: 0.35, su: 2.8, sv: 0.5, h: 2.6, solid: true },
    { kind: "strongbox", u: 0, v: 0.6, su: 1.4, sv: 0.8, h: 0.8, solid: true },
    { kind: "chest", u: -S + 0.7, v: 0.8, su: 1.2, sv: 0.7, h: 0.7, solid: true },
    { kind: "barrels", u: S - 0.8, v: 0.9, su: 1.4, sv: 1.4, h: 1.0, solid: true },
    { kind: "pelts", u: 4.6, v: 11, su: 0.9, sv: 3.2, h: 1.0, solid: true }, // mostrador del peletero
    { kind: "hiderack", u: S - 0.35, v: 11, su: 0.5, sv: 3.6, h: 2.2, solid: true },
    { kind: "table", u: -3.4, v: 12.2, su: 1.4, sv: 4.6, h: 0.85, solid: true },
    { kind: "board", u: -S + 0.15, v: 15.4, su: 0.3, sv: 2.4, h: 2.4, solid: true },
    { kind: "hearth", u: -S + 0.5, v: 7.5, su: 1.0, sv: 2.2, h: 2.4, solid: true },
    { kind: "rug", u: 0, v: 11.5, su: 3.2, sv: 6.5, h: 0 },
    { kind: "gallery", u: 0, v: 0.9, su: f.span - 0.5, sv: 1.8, h: 0 },
    { kind: "chandelier", u: 0, v: 9.5, su: 0, sv: 0, h: 0 },
    { kind: "chandelier", u: 0, v: 15.5, su: 0, sv: 0, h: 0 },
  ];
  return [ // casa-taller
    { kind: "workbench", u: 0, v: 0.55, su: Math.min(3, f.span - 2.2), sv: 0.9, h: 0.95, solid: true },
    { kind: "toolwall", u: 0, v: 0.05, su: Math.min(3, f.span - 2.2), sv: 0.1, h: 0, solid: false },
    { kind: "anvil", u: -S + 1.0, v: D * 0.45, su: 0.9, sv: 0.6, h: 0.8, solid: true },
    { kind: "smithy", u: -S + 0.55, v: 0.75, su: 1.0, sv: 1.2, h: 1.6, solid: true },
    { kind: "barrels", u: S - 0.65, v: 0.65, su: 1.0, sv: 1.0, h: 1.0, solid: true },
    { kind: "shelf", u: S - 0.25, v: D * 0.72, su: 0.4, sv: 1.8, h: 2.0, solid: true },
    { kind: "lantern", u: 0, v: D * 0.5, su: 0, sv: 0, h: 0 },
  ];
}

// ---- Muralla de la ciudad ----
export const WALL_SEGMENTS: { x: number; z: number; a: number }[] = []; // a: tangente (rad)
export const WALL_TOWERS: Tower[] = [];
export const GATE_TOWERS: Tower[] = [];
(() => {
  const n = Math.round((2 * Math.PI * CITY_R) / 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const chord = (g: number) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) * CITY_R;
    if (GATE_ANGLES.some(g => chord(g) < GATE_HALF_WIDTH + 1)) continue;
    const x = Math.cos(a) * CITY_R, z = Math.sin(a) * CITY_R;
    WALL_SEGMENTS.push({ x, z, a: a + Math.PI / 2 });
    if (i % 12 === 6 && !GATE_ANGLES.some(g => chord(g) < 22)) WALL_TOWERS.push({ x, z, r: 4.2, h: 13, roof: i % 24 === 6 ? 0x7a2f3a : 0x3d5a80 });
  }
  for (const g of GATE_ANGLES) for (const s of [-1, 1]) {
    // torres de la puerta: desplazadas a lo largo de la tangente
    const tx = -Math.sin(g), tz = Math.cos(g), off = GATE_HALF_WIDTH + 3.5;
    GATE_TOWERS.push({ x: Math.cos(g) * CITY_R + tx * off * s, z: Math.sin(g) * CITY_R + tz * off * s, r: 5, h: 17, roof: 0x7a2f3a });
  }
})();

// ---- Edificios ----
const specials: Omit<Building, "facing">[] = [
  { id: "cathedral", kind: "cathedral", name: "Catedral", x: -55, z: -24, w: 16, d: 30, h: 15, floors: 1, wall: 0xcfc7b4, roof: 0x4a5560 },
  { id: "guild", kind: "guild", name: "Gremio de Mercaderes", x: 32, z: -22, w: 20, d: 14, h: 8.4, floors: 3, wall: 0xd2c3a0, roof: 0x7a2f3a },
  { id: "market", kind: "market", name: "Mercado Cubierto", x: -30, z: -24, w: 16, d: 12, h: 5.6, floors: 2, wall: 0xc9b48a, roof: 0x9a3b2e },
  { id: "tavern", kind: "tavern", name: "Taberna del Dragón", x: -34, z: 30, w: 14, d: 11, h: 8.4, floors: 3, wall: 0xb08a5a, roof: 0x6b4a2e },
  { id: "forge", kind: "forge", name: "Herrería", x: 38, z: 26, w: 12, d: 10, h: 5.6, floors: 2, wall: 0x8d8478, roof: 0x4a4f57 },
  { id: "bank", kind: "bank", name: "Banco Real", x: 30, z: 52, w: 14, d: 10, h: 8.4, floors: 3, wall: 0xcfcabd, roof: 0x2f5d7a },
];

// Zonas extra ocupadas por las catedral (crucero y ábside) donde no se colocan casas.
// ---- Plaza del mercado (delante del Mercado Cubierto, que hace de casa de subastas) ----
/** Rectángulo despejado entre el Mercado Cubierto (fachada en x = -22) y la avenida norte. */
export const MARKET_SQUARE = { x0: -21.8, x1: -7.6, z0: -34.5, z1: -13.5 };
/** Subastador tras su mostrador, mirando a la plaza (+x). */
export const AUCTIONEER = { x: -18.6, z: -24, ry: Math.PI / 2 };
export const AUCTION_COUNTER = { x: -17.3, z: -24, w: 0.9, d: 4.2, h: 1.1 };
/** Tablón de precios (cara hacia +z, ancho w). */
export const PRICE_BOARD = { x: -17.4, z: -31.9, ry: 0, w: 3.2, h: 2.4 };
/** Puestos de la plaza del mercado: mostrador w × d, la cara del vendedor mira a `ry` (0 = +z). */
export interface MarketStall { x: number; z: number; ry: number; w: number; d: number; goods: "fish" | "ore" | "herb" | "hide"; awning: number }
export const MARKET_ROW: MarketStall[] = [
  { x: -12.8, z: -32.3, ry: 0, w: 3.2, d: 1.8, goods: "fish", awning: 0x2e86c1 },
  { x: -9.2, z: -32.3, ry: 0, w: 3.2, d: 1.8, goods: "ore", awning: 0x7a2f3a },
  { x: -12.8, z: -15.7, ry: Math.PI, w: 3.2, d: 1.8, goods: "herb", awning: 0x4f8a4c },
  { x: -9.2, z: -15.7, ry: Math.PI, w: 3.2, d: 1.8, goods: "hide", awning: 0xa0703c },
];
const KEEP_OUT = [{ x: -55, z: -24, w: 24, d: 34 }, { x: -55, z: -45, w: 18, d: 14 },
  ...PARKS.map(p => ({ x: p.x, z: p.z, w: p.size, d: p.size })), // parques de los barrios
  { x: (MARKET_SQUARE.x0 + MARKET_SQUARE.x1) / 2, z: (MARKET_SQUARE.z0 + MARKET_SQUARE.z1) / 2, w: MARKET_SQUARE.x1 - MARKET_SQUARE.x0, d: MARKET_SQUARE.z1 - MARKET_SQUARE.z0 }];

// ---- Catedral (hueca: se puede entrar por el portal sur) ----
// Medidas en coordenadas locales (lx = x - CATHEDRAL.x, lz = z - CATHEDRAL.z); la fachada mira a +z.
export const CATHEDRAL = {
  x: -55, z: -24, hw: 8, hd: 15, t: 0.6, // planta y grosor de muro
  nave: 4.8, // semiancho de la nave central (eje de las arcadas)
  aisleH: 8.2, naveH: 15.6, // altura de las naves laterales y de la central
  transHw: 11, transHd: 3.8, transH: 14, // crucero
  tower: 5.8, towerX: 5.1, towerZ: 12.3, // torres de la fachada
  door: 3.4, // ancho libre del portal
  piers: [-12.2, -9.4, -6.6, -3.8, 3.8, 6.6], // lz de los pilares de las arcadas
  pews: { z0: -2.6, n: 8, step: 1.5, x0: 1.3, x1: 3.9 }, // filas de bancos a ambos lados del pasillo
  statueZ: -10.6, // la diosa preside la cabecera de la nave (testero plano: la torre del castillo no deja sitio a un ábside)
};
/** Estatua de la diosa, en la cabecera de la catedral: aquí se reza. */
export const GODDESS_STATUE = { x: CATHEDRAL.x, z: CATHEDRAL.z + CATHEDRAL.statueZ, r: 3.6 };
export const PRAY_RANGE = 7;
/** Volúmenes interiores de la catedral (para que la cámara no atraviese los muros). */
const CATHEDRAL_ROOMS: { x0: number; x1: number; z0: number; z1: number; h: number }[] = (() => {
  const C = CATHEDRAL, box = (lx: number, z0: number, z1: number, h: number) => ({ x0: C.x - lx, x1: C.x + lx, z0: C.z + z0, z1: C.z + z1, h });
  return [
    box(C.nave - 0.75, -C.hd + 1.05, C.hd + 3, C.naveH - 0.5), // nave central (se prolonga ante el portal para seguir al que entra)
    box(C.hw - 1.05, -C.hd + 1.05, C.towerZ - C.tower / 2 - 0.45, C.aisleH - 0.4), // naves laterales
    box(C.transHw - 1.05, -C.transHd + 1.05, C.transHd - 1.05, C.transH - 0.5), // crucero
  ];
})();
export const GARDENS: { x: number; z: number; w: number; d: number; well: boolean }[] = [];
export const BUILDINGS: Building[] = (() => {
  const r = rng(2024);
  const out: Building[] = [];
  const facingOf = (x: number, z: number): 0 | 1 | 2 | 3 =>
    Math.abs(x) > Math.abs(z) ? (x > 0 ? 3 : 1) : z > 0 ? 2 : 0;
  for (const s of specials) out.push({ ...s, facing: s.id === "cathedral" ? 1 : facingOf(s.x, s.z) });
  const pal = (x: number, z: number, k: "walls" | "roofs", u: number) => { const l = DISTRICTS[districtAt(x, z)][k]; return l[Math.floor(u * l.length)]!; };
  const STEP = 10.5;
  for (const off of [0, STEP / 2]) for (let gx = -124 + off; gx <= 124; gx += STEP) for (let gz = -124 + off * 0.7; gz <= 124; gz += STEP) {
    const w = 6 + Math.floor(r() * 4), d = 6 + Math.floor(r() * 3);
    const x = gx + (r() - 0.5) * 1.5, z = gz + (r() - 0.5) * 1.5;
    const hw = w / 2, hd = d / 2;
    // fuera de la muralla, avenidas, plaza, castillo y edificios especiales
    if (Math.hypot(Math.abs(x) + hw, Math.abs(z) + hd) > CITY_R - 8) continue;
    if (Math.abs(x) - hw < AVENUE_W / 2 + 2 || Math.abs(z) - hd < AVENUE_W / 2 + 2) continue;
    if (Math.hypot(x, z) < PLAZA_R + 6 + Math.max(hw, hd)) continue;
    if (x + hw > CASTLE_RECT.x0 - 6 && x - hw < CASTLE_RECT.x1 + 6 && z - hd < CASTLE_RECT.z1 + 6 && z + hd > CASTLE_RECT.z0 - 14) continue;
    if (specials.some(s => Math.abs(x - s.x) < hw + s.w / 2 + 2.5 && Math.abs(z - s.z) < hd + s.d / 2 + 2.5)) continue;
    if (KEEP_OUT.some(k => Math.abs(x - k.x) < hw + k.w / 2 + 1 && Math.abs(z - k.z) < hd + k.d / 2 + 1)) continue;
    if (out.some(o => Math.abs(x - o.x) < hw + o.w / 2 + 2.2 && Math.abs(z - o.z) < hd + o.d / 2 + 2.2)) continue;
    if (GARDENS.some(o => Math.abs(x - o.x) < hw + o.w / 2 + 2.2 && Math.abs(z - o.z) < hd + o.d / 2 + 2.2)) continue;
    const roll = r();
    if (roll < 0.07) { GARDENS.push({ x, z, w, d, well: r() < 0.5 }); continue; } // pequeño jardín en vez de casa
    const floors = 1 + Math.floor(r() * 3);
    const sr = r(), style: Building["style"] = sr < 0.1 ? "workshop" : sr < 0.17 ? "stable" : sr < 0.22 && floors >= 2 ? "watch" : sr < 0.4 ? "hip" : undefined;
    out.push({
      id: `h${out.length}`, kind: "house", name: "", x, z, w, d, floors: style === "stable" ? 1 : floors, h: (style === "stable" ? 1 : floors) * 2.8,
      // cada barrio tiene su paleta (se consumen los mismos números aleatorios para no mover nada más)
      wall: pal(x, z, "walls", r()), roof: pal(x, z, "roofs", r()), facing: facingOf(x, z), style,
    });
  }
  return out;
})();

/** Volúmenes interiores (catedral, Gremio y talleres): la cámara no sale de la sala en la que está el personaje. */
export const INTERIOR_ROOMS: { x0: number; x1: number; z0: number; z1: number; h: number }[] = [
  ...CATHEDRAL_ROOMS,
  // gran salón y el paso bajo el arco de la puerta del castillo
  { x0: GREAT_HALL.x - GREAT_HALL.w / 2 + HALL.wallT + 0.4, x1: GREAT_HALL.x + GREAT_HALL.w / 2 - HALL.wallT - 0.4, z0: GREAT_HALL.z - GREAT_HALL.d / 2 + HALL.wallT + 0.4, z1: GREAT_HALL.z + GREAT_HALL.d / 2 - HALL.frontT - 0.3, h: GREAT_HALL.h - 0.6 },
  { x0: -HALL.door / 2 + 0.3, x1: HALL.door / 2 - 0.3, z0: GREAT_HALL.z + GREAT_HALL.d / 2 - HALL.frontT - 0.3, z1: HALL.gateZ + 4.5, h: HALL.doorH - 0.8 },
  ...BUILDINGS.filter(isEnterable).flatMap(b => {
    const f = interiorFrame(b), m = WALL_T + 0.35, room = f.box(0, f.depth / 2, f.span - 2 * m, f.depth - 2 * m);
    const door = f.box(0, f.depth + 1.2, doorW(b) - 0.3, 2.8); // umbral: sigue al que entra o sale
    const r = (o: { x: number; z: number; hw: number; hd: number }, h: number) => ({ x0: o.x - o.hw, x1: o.x + o.hw, z0: o.z - o.hd, z1: o.z + o.hd, h });
    return [r(room, interiorH(b) - 0.35), r(door, FLOOR_Y + 2.5)];
  }),
];

// Granjas, cabaña del lago y atalayas fuera de la muralla.
export const EXTRA_BUILDINGS: Building[] = [
  { id: "barn0", kind: "house", name: "", x: 14, z: 158, w: 14, d: 10, h: 7, floors: 1, wall: 0x9a4a35, roof: 0x5a4636, facing: 1, style: "barn" },
  { id: "farm0", kind: "house", name: "", x: 14, z: 176, w: 9, d: 7, h: 5.6, floors: 2, wall: 0xd9ccb0, roof: 0xa4472f, facing: 1, style: "farm" },
  { id: "barn1", kind: "house", name: "", x: 103, z: 146, w: 12, d: 9, h: 7, floors: 1, wall: 0x9a4a35, roof: 0x5a4636, facing: 2, style: "barn" },
  { id: "farm1", kind: "house", name: "", x: 120, z: 124, w: 9, d: 7, h: 5.6, floors: 2, wall: 0xcdbb94, roof: 0x6b4a2e, facing: 0, style: "farm" },
  { id: "farm2", kind: "house", name: "", x: -90, z: 182, w: 9, d: 7, h: 5.6, floors: 2, wall: 0xd8d0bd, roof: 0x5f6b3a, facing: 1, style: "farm" },
  { id: "hut0", kind: "house", name: "", x: -128, z: 84, w: 6, d: 5, h: 2.8, floors: 1, wall: 0xb59a6a, roof: 0x6b4a2e, facing: 3, style: "hut" },
  { id: "hut1", kind: "house", name: "", x: -128, z: 90, w: 4, d: 3.4, h: 2.8, floors: 1, wall: 0x8d8478, roof: 0x6b4a2e, facing: 3, style: "hut" },
];
// Farolas a lo largo de las avenidas.
export const LAMPS: { x: number; z: number }[] = (() => {
  const out: { x: number; z: number }[] = [];
  for (let z = -36; z <= CITY_R - 6; z += 14) for (const x of [-6.5, 6.5]) if (Math.hypot(x, z) > PLAZA_R + 1) out.push({ x, z });
  for (let x = -CITY_R + 8; x <= CITY_R - 8; x += 14) for (const z of [-6.5, 6.5]) if (Math.hypot(x, z) > PLAZA_R + 1 && Math.abs(x) > 6.5) out.push({ x, z });
  // patio del castillo: a ambos lados del camino hacia el gran salón
  for (const z of [-47.5, -56.5]) for (const x of [-3.6, 3.6]) out.push({ x, z });
  return out;
})();
// Carros aparcados junto a las avenidas (orientados a lo largo de ellas).
export const CARTS: { x: number; z: number; along: "x" | "z" }[] = (() => {
  const out: { x: number; z: number; along: "x" | "z" }[] = [];
  const ok = (x: number, z: number, hw: number, hd: number) =>
    BUILDINGS.every(b => rectDist(x, z, b.x, b.z, b.w / 2 + hw, b.d / 2 + hd) > 0.6) && Math.hypot(x, z) > PLAZA_R + 2 &&
    !LAMPS.some(l => Math.hypot(l.x - x, l.z - z) < 1.8);
  let k = 0;
  for (let z = 22; z < CITY_R - 14; z += 17) { const x = (k++ % 2 ? -1 : 1) * 5.6; if (ok(x, z, 0.7, 1.3)) out.push({ x, z, along: "z" }); }
  for (let x = 24; x < CITY_R - 14; x += 19) for (const sx of [-1, 1]) { const z = (k++ % 2 ? -1 : 1) * 5.6; if (ok(sx * x, z, 1.3, 0.7)) out.push({ x: sx * x, z, along: "x" }); }
  return out;
})();


// ---- Puestos de mercaderes ----
// Cuatro quedan en la plaza; el resto se adosa a la pared de casas repartidas por toda la ciudad.
// (ox,oz): punto trasero del puesto (la pared de la casa); (nx,nz): hacia dónde mira; (x,z): mostrador; (vx,vz): mercader.
export const STALL_KINDS = [
  { name: "Frutería", cry: "¡Manzanas frescas!", color: 0xc0392b },
  { name: "Panadería", cry: "¡Pan recién hecho!", color: 0xd4ac0d },
  { name: "Telas", cry: "¡Telas de oriente!", color: 0x8e44ad },
  { name: "Alquimista", cry: "¡Pociones, pociones!", color: 0x27ae60 },
  { name: "Armero", cry: "¡Hierro del bueno!", color: 0x34495e },
  { name: "Quesería", cry: "¡Quesos curados!", color: 0xe67e22 },
  { name: "Pescadería", cry: "¡Pescado del lago!", color: 0x2e86c1 },
  { name: "Especias", cry: "¡Especias y sal!", color: 0xb03a6b },
] as const;
export interface Stall {
  x: number; z: number; ox: number; oz: number; nx: number; nz: number; vx: number; vz: number;
  kind: number; color: number; house: string | null; dir: number;
}
const STALL_HOUSES = 22;
export const STALLS: Stall[] = (() => {
  type Cand = Omit<Stall, "kind" | "color">;
  const mk = (ox: number, oz: number, nx: number, nz: number, house: string | null, dir: number): Cand =>
    ({ ox, oz, nx, nz, x: ox + nx * 1.75, z: oz + nz * 1.75, vx: ox + nx * 0.75, vz: oz + nz * 0.75, house, dir });
  const picked: Cand[] = [];
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; picked.push(mk(Math.cos(a) * 14.25, Math.sin(a) * 14.25, -Math.cos(a), -Math.sin(a), null, -1)); }
  // candidatos: caras sin puerta de casas corrientes con un hueco despejado delante
  const NRM = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const, cands: Cand[] = [];
  for (const b of BUILDINGS) {
    if (b.kind !== "house" || (b.style && b.style !== "hip")) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (dir === b.facing || (dir % 2 === 0 ? b.w : b.d) < 6) continue;
      const [nx, nz] = NRM[dir]!, half = (dir % 2 === 0 ? b.d : b.w) / 2 + 0.3, ox = b.x + nx * half, oz = b.z + nz * half;
      // zona libre: 5 m de ancho y 6 m de fondo delante de la pared
      const cx = ox + nx * 3, cz = oz + nz * 3, hw = nx ? 2.9 : 2.5, hd = nx ? 2.5 : 2.9;
      const clear = (o: { x: number; z: number }, ow: number, od: number, m: number) => rectDist(cx, cz, o.x, o.z, ow + hw, od + hd) > m;
      if (Math.hypot(cx, cz) + 3.5 > CITY_R - 5 || Math.hypot(cx, cz) < PLAZA_R + 7) continue;
      if (Math.abs(ox + nx * 2.4) < 4.6 || Math.abs(oz + nz * 2.4) < 4.6) continue; // el mostrador no invade la avenida
      if (Math.abs(cx) - hw < 2 && nx === 0 || Math.abs(cz) - hd < 2 && nz === 0) continue;
      if (cx + hw > CASTLE_RECT.x0 - 4 && cx - hw < CASTLE_RECT.x1 + 4 && cz - hd < CASTLE_RECT.z1 + 4) continue;
      if (BUILDINGS.some(o => o !== b && !clear(o, o.w / 2, o.d / 2, 0.5))) continue;
      if (KEEP_OUT.some(o => !clear(o, o.w / 2, o.d / 2, 0.5)) || GARDENS.some(o => !clear(o, o.w / 2, o.d / 2, 0.3))) continue;
      if (LAMPS.some(o => !clear(o, 0.3, 0.3, 0)) || CARTS.some(o => !clear(o, 1.3, 1.3, 0))) continue;
      cands.push(mk(ox, oz, nx, nz, b.id, dir));
    }
  }
  // reparto: cada vez el candidato más alejado de los puestos ya colocados
  for (let n = 0; n < STALL_HOUSES && cands.length; n++) {
    let best = -1, bestD = -1;
    cands.forEach((c, i) => {
      if (picked.some(p => p.house === c.house)) return;
      const d = Math.min(...picked.map(p => Math.hypot(p.x - c.x, p.z - c.z)));
      if (d > bestD) { bestD = d; best = i; }
    });
    if (best < 0) break;
    picked.push(cands.splice(best, 1)[0]!);
  }
  // género: el que tenga su puesto igual más lejos, para no repetir en la misma calle
  const out: Stall[] = [];
  for (const c of picked) {
    let kind = 0, far = -1;
    const used = STALL_KINDS.map((_, k) => out.filter(o => o.kind === k).length), least = Math.min(...used);
    STALL_KINDS.forEach((_, k) => {
      if (used[k] !== least) return; // primero los géneros menos repetidos
      const d = Math.min(1e9, ...out.filter(o => o.kind === k).map(o => Math.hypot(o.x - c.x, o.z - c.z)));
      if (d > far) { far = d; kind = k; }
    });
    out.push({ ...c, kind, color: STALL_KINDS[kind]!.color });
  }
  return out;
})();


// Mobs: anillo lejano, fuera de lagos y campos.
export const MOB_SPAWNS: { x: number; z: number }[] = Array.from({ length: 22 }, (_, i) => {
  const a = Math.PI / 22 + (i * Math.PI * 2) / 22, rad = 172 + (i % 3) * 7;
  return { x: Math.cos(a) * rad, z: Math.sin(a) * rad };
}).filter(p => Math.hypot(p.x - LAKE.x, p.z - LAKE.z) > LAKE.r + 8 && !FIELDS.some(f => p.x > f.x0 - 6 && p.x < f.x1 + 6 && p.z > f.z0 - 6 && p.z < f.z1 + 6)
  && Math.abs(p.x) < WORLD_HALF - 6 && Math.abs(p.z) < WORLD_HALF - 6 && Math.hypot(p.x - DRAGON_LAIR.x, p.z - DRAGON_LAIR.z) > DRAGON_LAIR.r + 10);

function buildProps() {
  const r = rng(1337);
  const trees: Prop[] = [], rocks: Prop[] = [];
  const free = (x: number, z: number, m: number) =>
    Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + m + 1 &&
    FIELDS.every(f => !(x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m)) &&
    WINDMILLS.every(w => Math.hypot(x - w.x, z - w.z) > 8 + m) &&
    EXTRA_BUILDINGS.every(b => rectDist(x, z, b.x, b.z, b.w / 2 + 1, b.d / 2 + 1) > m + 1) &&
    MOB_SPAWNS.every(p => Math.hypot(x - p.x, z - p.z) > 4) &&
    Math.hypot(x - DRAGON_LAIR.x, z - DRAGON_LAIR.z) > DRAGON_LAIR.r + m &&
    Object.values(MOB_ZONES).every(c => Math.hypot(x - c.x, z - c.z) > c.r * 0.85 + m) &&
    // caminos fuera de las puertas
    !(Math.abs(z) < ROAD_W / 2 + m && Math.abs(x) > CITY_R - 2) && !(Math.abs(x) < ROAD_W / 2 + m && z > CITY_R - 2);
  for (let i = 0, n = 0; i < 16000 && n < 2400; i++) {
    const x = (r() * 2 - 1) * (WORLD_HALF + 2), z = (r() * 2 - 1) * (WORLD_HALF + 2);
    if (Math.hypot(x, z) < CITY_R + 8 || !free(x, z, 1.5)) continue;
    trees.push({ x, z, s: 0.8 + r() * 0.8, kind: r() < 0.6 ? 0 : 1 }); n++;
  }
  for (let i = 0, n = 0; i < 2500 && n < 130; i++) {
    const x = (r() * 2 - 1) * (WORLD_HALF - 2), z = (r() * 2 - 1) * (WORLD_HALF - 2);
    if (Math.hypot(x, z) < CITY_R + 5 || !free(x, z, 1)) continue;
    rocks.push({ x, z, s: 0.5 + r() * 1.0, kind: 0 }); n++;
  }
  return { trees, rocks };
}
export const { trees: TREES, rocks: ROCKS } = buildProps();

// ---- Colisiones (el servidor es la autoridad) ----
// `h`: altura del obstáculo. Quien vuela por encima de `h` no choca con él (sin `h` = infinito).
// `y0`: altura a partir de la cual existe (tejados): quien va por debajo pasa.
export type Collider = ({ x: number; z: number; r: number } | { x: number; z: number; hw: number; hd: number }) & { h?: number; y0?: number };

export const COLLIDERS: Collider[] = (() => {
  const c: Collider[] = [];
  const add = (h: number, ...items: Collider[]) => { for (const it of items) c.push({ ...it, h }); };
  const towerH = (t: { r: number; h: number }) => t.h + t.r * 2.4 + 5;
  add(9, { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r });

  for (const b of BUILDINGS) {
    if (b.kind === "cathedral") continue;
    if (!isEnterable(b)) { add(b.h + 7, { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }); continue; }
    // muros (con el hueco de la puerta), tejado solo para quien vuela, y muebles
    const f = interiorFrame(b), S = f.span / 2, D = f.depth, T = WALL_T / 2 + 0.05, dw = doorW(b) / 2, H = b.h + 7;
    add(H, f.box(0, T, f.span, T * 2)); // fondo
    for (const s of [-1, 1]) {
      add(H, f.box(s * (S - T), D / 2, T * 2, D)); // laterales
      add(H, f.box(s * (S + dw) / 2, D - T, S - dw, T * 2)); // fachada a los lados de la puerta
    }
    c.push({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, h: H, y0: interiorH(b) - 0.6 });
    for (const p of interiorProps(b)) if (p.solid) add(p.h + 0.2, f.box(p.u, p.v, p.su, p.sv));
  }
  for (const s of STALLS) {
    if (s.house) add(3.4, { x: s.ox + s.nx * 1.2, z: s.oz + s.nz * 1.2, hw: s.nx ? 1.2 : 2.2, hd: s.nx ? 2.2 : 1.2 });
    else add(3.4, { x: s.x, z: s.z, r: 1.5 }, { x: s.vx, z: s.vz, r: 0.5 });
  }
  for (const s of WALL_SEGMENTS) add(9.5, { x: s.x, z: s.z, r: 2.1 });
  for (const t of [...WALL_TOWERS, ...GATE_TOWERS, ...CASTLE_TOWERS]) add(towerH(t), { x: t.x, z: t.z, r: t.r });
  // Muralla del castillo (con hueco en la puerta sur) y gran salón.
  const { x0, x1, z0, z1 } = CASTLE_RECT, t = CASTLE.wallT / 2, g = CASTLE.gateHalf;
  add(11, { x: (x0 + -g) / 2, z: z1, hw: (-g - x0) / 2, hd: t }, { x: (x1 + g) / 2, z: z1, hw: (x1 - g) / 2, hd: t });
  add(11, { x: 0, z: z0, hw: (x1 - x0) / 2, hd: t }, { x: x0, z: (z0 + z1) / 2, hw: t, hd: (z1 - z0) / 2 }, { x: x1, z: (z0 + z1) / 2, hw: t, hd: (z1 - z0) / 2 });
  // Gran salón: muros con el hueco de la puerta, tejado solo para quien vuela, y sus muebles.
  {
    const G = GREAT_HALL, W = G.h + 14, hw = G.w / 2, hd = G.d / 2, T = HALL.wallT, F = HALL.frontT, gap = HALL.door / 2;
    add(W, { x: G.x, z: G.z - hd + T / 2, hw, hd: T / 2 }); // fondo
    for (const s of [-1, 1]) {
      add(W, { x: G.x + s * (hw - T / 2), z: G.z, hw: T / 2, hd }); // laterales
      add(W, { x: G.x + s * (gap + (hw - gap) / 2), z: G.z + hd - F / 2, hw: (hw - gap) / 2, hd: F / 2 }); // fachada
    }
    c.push({ x: G.x, z: G.z, hw, hd, h: W, y0: G.h }); // tejado
    for (const p of HALL_PROPS) add(p.h + 0.2, { x: p.x, z: p.z, hw: p.w / 2, hd: p.d / 2 });
  }
  // Catedral: solo los muros (con el hueco del portal), pilares, bancos y la estatua; el interior queda libre.
  {
    const C = CATHEDRAL, X = C.x, Z = C.z, t = C.t / 2 + 0.05, WALL = 48;
    for (const s of [-1, 1]) {
      const wx = X + s * (C.hw - C.t / 2), zn = (-C.hd - C.transHd) / 2, zs0 = C.transHd, zs1 = C.towerZ - C.tower / 2;
      add(WALL, { x: wx, z: Z + zn, hw: t, hd: (C.hd - C.transHd) / 2 }, { x: wx, z: Z + (zs0 + zs1) / 2, hw: t, hd: (zs1 - zs0) / 2 }); // muros laterales
      add(WALL, { x: X + s * C.towerX, z: Z + C.towerZ, hw: C.tower / 2, hd: C.tower / 2 }); // torre
      add(WALL, { x: X + s * (C.door / 2 + 0.25), z: Z + C.hd - C.t / 2, hw: 0.25, hd: 0.45 }); // jamba del portal
      add(WALL, { x: X + s * (C.transHw - C.t / 2), z: Z, hw: t, hd: C.transHd }); // hastial del crucero
      for (const sz of [-1, 1]) add(WALL, { x: X + s * (C.hw - C.t + C.transHw) / 2, z: Z + sz * (C.transHd - C.t / 2), hw: (C.transHw - C.hw + C.t) / 2, hd: t });
      for (const pz of C.piers) add(WALL, { x: X + s * C.nave, z: Z + pz, r: 0.5 }); // pilares
      const P = C.pews; add(1.3, { x: X + s * (P.x0 + P.x1) / 2, z: Z + P.z0 + ((P.n - 1) * P.step) / 2, hw: (P.x1 - P.x0) / 2, hd: ((P.n - 1) * P.step) / 2 + 0.35 }); // bancos
    }
    add(WALL, { x: X, z: Z - C.hd + C.t / 2, hw: C.hw, hd: t }); // testero norte
    add(9, { x: GODDESS_STATUE.x, z: GODDESS_STATUE.z, r: GODDESS_STATUE.r });
    // tejados: solo frenan a quien vuela (por debajo de `y0` se pasa: es el interior)
    for (const roof of [{ x: X, z: Z, hw: C.hw, hd: C.hd }, { x: X, z: Z, hw: C.transHw, hd: C.transHd }]) c.push({ ...roof, h: WALL, y0: 6 });
  }
  for (const w of CASTLE_WINGS) add(16, { x: w.x, z: w.z, hw: w.w / 2, hd: w.d / 2 });
  for (const s of [-1, 1]) add(17, { x: s * 4.95, z: HALL.gateZ, hw: 1.35, hd: 1.9 }, { x: s * 8.65, z: HALL.gateZ, hw: 2.1, hd: 2.1 }); // puerta del castillo: jambas y torres (el arco queda libre)
  add(14, ...CASTLE_PIERS);
  for (const l of CASTLE_LAWNS) add(1, { x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2 });
  for (const st of CASTLE_GATE_DECOR.statues) add(8, { x: st.x, z: st.z, hw: 1.3, hd: 1.3 });
  // plaza del mercado: mostrador del subastador, tablón y puestos
  add(AUCTION_COUNTER.h + 0.2, { x: AUCTION_COUNTER.x, z: AUCTION_COUNTER.z, hw: AUCTION_COUNTER.w / 2, hd: AUCTION_COUNTER.d / 2 });
  add(3, { x: PRICE_BOARD.x, z: PRICE_BOARD.z, hw: PRICE_BOARD.w / 2 + 0.2, hd: 0.3 });
  for (const s of MARKET_ROW) add(3.2, { x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2 });
  for (const b of CASTLE_GATE_DECOR.braziers) add(2, { x: b.x, z: b.z, r: 0.5 });
  for (const g2 of GARDENS) add(4.5, { x: g2.x, z: g2.z, hw: g2.w / 2, hd: g2.d / 2 });
  for (const k of CARTS) add(2.2, { x: k.x, z: k.z, hw: k.along === "x" ? 1.3 : 0.7, hd: k.along === "x" ? 0.7 : 1.3 });
  for (const b of EXTRA_BUILDINGS) add(13, { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 });
  for (const w of WINDMILLS) add(24, { x: w.x, z: w.z, r: 4.1 }); // = radio de la base de piedra
  // Lo que se dibuja junto a los edificios a la altura del cuerpo (mismas fórmulas que el cliente).
  for (const b of [...BUILDINGS, ...EXTRA_BUILDINGS]) {
    const dh = (b.facing % 2 === 0 ? b.d : b.w) / 2, along = b.facing % 2 === 0; // la tangente de la fachada va por x
    const box = (a: number, o: number, w: number, d: number, h: number) => { const p = faceXZ(b.x, b.z, b.facing, a, o); add(h, { x: p.x, z: p.z, hw: (along ? w : d) / 2, hd: (along ? d : w) / 2 }); };
    if (b.style === "stable") { box(0, dh + 1.2, 2.6, 0.6, 0.8); const hy = faceXZ(b.x, b.z, b.facing, b.w / 2 + 0.2, dh * 0.2); add(1, { x: hy.x, z: hy.z, hw: 0.45, hd: 0.45 }); } // abrevadero y heno
    if (b.style === "workshop") { // yunque y postes del tejadillo de trabajo
      const p = faceXZ(b.x, b.z, b.facing, 2.75, dh + 1.6); add(1.1, { x: p.x, z: p.z, r: 0.5 });
      for (const s of [-1, 1]) { const q = faceXZ(b.x, b.z, b.facing, 2.75 + s * 1.1, dh + 2.6); add(2.8, { x: q.x, z: q.z, r: 0.15 }); }
    }
    if (b.kind === "forge") { const p = faceXZ(b.x, b.z, b.facing, -b.w / 2 + 1, dh + 1.4); add(1.1, { x: p.x, z: p.z, r: 0.5 }); }
    if (b.kind === "tavern") {
      for (const o of [-2, 2]) { const q = faceXZ(b.x, b.z, b.facing, o, dh + 0.8); add(1, { x: q.x, z: q.z, r: 0.45 }); }
      const sg = faceXZ(b.x, b.z, b.facing, b.w / 2 - 1, dh + 1.4); add(5, { x: sg.x, z: sg.z, r: 0.15 }); // poste del letrero
    }
    if (b.kind === "bank") for (const s of [-1, 1]) box(s * (b.w / 2 - 1), dh + 0.7, 0.7, 0.7, b.h);
    if (b.style === "barn" || b.style === "farm") for (const o of [-1, 1]) { // pajares
      add(3.5, { x: b.x + o * (b.w / 2 + 3.2), z: b.z + (b.facing === 2 ? -1 : 1) * (b.d / 2 + 2.5), r: 1.4 });
      if (b.style === "farm") break;
    }
  }
  // gran salón: contrafuertes de la fachada sur fuera de la puerta del castillo y todos los del norte
  { const G = GREAT_HALL, step = (G.w - 6) / 8;
    for (let i = 0; i < 8; i++) { const x = G.x - G.w / 2 + 3 + (i + 0.5) * step;
      add(G.h, { x, z: G.z - G.d / 2 - 0.5, hw: 0.6, hd: 0.5 });
      if (Math.abs(x - G.x) > 11) add(G.h, { x, z: G.z + G.d / 2 + 0.5, hw: 0.6, hd: 0.5 }); } }
  for (const l of LAMPS) add(4.5, { x: l.x, z: l.z, r: 0.22 }); // postes de las farolas
  // parques y bancos de la Plaza Mayor (ver parks.ts)
  for (const p of [...PARK_PROPS, ...PLAZA_BENCH_PROPS]) add(p.h, p.r !== undefined ? { x: p.x, z: p.z, r: p.r } : { x: p.x, z: p.z, hw: p.hw!, hd: p.hd! });
  // vallas de los campos de cultivo (con la entrada de 6 m del lado sur)
  for (const f of FIELDS) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0, gap = 6, k = 0.15, seg = (w - gap) / 2;
    add(1.2, { x: f.x0 + seg / 2, z: f.z1 + 0.8, hw: seg / 2, hd: k }, { x: f.x1 - seg / 2, z: f.z1 + 0.8, hw: seg / 2, hd: k },
      { x: (f.x0 + f.x1) / 2, z: f.z0 - 0.8, hw: w / 2 + 0.8, hd: k }, { x: f.x0 - 0.8, z: (f.z0 + f.z1) / 2, hw: k, hd: d / 2 + 0.8 }, { x: f.x1 + 0.8, z: (f.z0 + f.z1) / 2, hw: k, hd: d / 2 + 0.8 });
  }
  // portada del Gremio: columnas y macetas (ver guildPortal en el cliente)
  for (const b of BUILDINGS) if (b.kind === "guild") {
    const dh = (b.facing % 2 === 0 ? b.d : b.w) / 2, dw = doorW(b);
    for (const s of [-1, 1]) {
      const c = faceXZ(b.x, b.z, b.facing, s * (dw / 2 + 0.55), dh + 0.5); add(4, { x: c.x, z: c.z, r: 0.35 });
      const m = faceXZ(b.x, b.z, b.facing, s * (dw / 2 + 1.7), dh + 0.75); add(1.4, { x: m.x, z: m.z, r: 0.45 });
    }
  }
  // muralla del castillo: contrafuertes por la cara exterior (franja de 0,7 m)
  { const { x0, x1, z0, z1 } = CASTLE_RECT, t = CASTLE.wallT / 2, g = CASTLE.gateHalf, k = 0.35;
    add(8, { x: (x0 + x1) / 2, z: z0 - t - k, hw: (x1 - x0) / 2, hd: k }, { x: x0 - t - k, z: (z0 + z1) / 2, hw: k, hd: (z1 - z0) / 2 }, { x: x1 + t + k, z: (z0 + z1) / 2, hw: k, hd: (z1 - z0) / 2 },
      { x: (x0 + -g) / 2, z: z1 + t + k, hw: (-g - x0) / 2, hd: k }, { x: (x1 + g) / 2, z: z1 + t + k, hw: (x1 - g) / 2, hd: k }); }
  // catedral: braseros del atrio y columnillas del portal
  for (const s of [-1, 1]) {
    add(1.8, { x: CATHEDRAL.x + s * 2.9, z: CATHEDRAL.z + CATHEDRAL.hd + 1.25, r: 0.5 });
    for (const o of [2.05, 2.5]) add(5.5, { x: CATHEDRAL.x + s * o, z: CATHEDRAL.z + CATHEDRAL.hd + 0.9 - (o - 2.05) * 0.6, r: 0.2 });
  }
  // catedral: mesas de ofrendas de las capillas del crucero
  for (const s of [-1, 1]) add(1.2, { x: CATHEDRAL.x + s * (CATHEDRAL.transHw - CATHEDRAL.t - 0.55), z: CATHEDRAL.z, hw: 0.5, hd: 1.1 });
  // plaza del mercado: cajas, barriles y sacos de los bordes norte y sur, y la carretilla (dejan paso en el centro)
  for (const z of [-34.0, -14.0]) add(1.2, { x: -20.3, z, hw: 1.3, hd: 0.45 }, { x: -11.25, z, hw: 3.3, hd: 0.45 });
  add(1, { x: -18.4, z: -14.0, r: 0.75 });
  for (const t2 of TREES) add(5.2 * t2.s, { x: t2.x, z: t2.z, r: 0.4 * t2.s });
  for (const p of ROCKS) if (p.s > 0.8) add(1.4 * p.s, { x: p.x, z: p.z, r: 0.55 * p.s });
  return c;
})();

// Rejilla espacial para no recorrer miles de colisionadores por entidad y tick.
const CELL = 10, KEY = 1024;
const cellKey = (ix: number, iz: number) => (ix + 512) * KEY + (iz + 512);
const GRID = new Map<number, Collider[]>();
for (const c of COLLIDERS) {
  const [hx, hz] = "r" in c ? [c.r, c.r] : [c.hw, c.hd];
  for (let ix = Math.floor((c.x - hx) / CELL); ix <= Math.floor((c.x + hx) / CELL); ix++)
    for (let iz = Math.floor((c.z - hz) / CELL); iz <= Math.floor((c.z + hz) / CELL); iz++) {
      const k = cellKey(ix, iz); const a = GRID.get(k); if (a) a.push(c); else GRID.set(k, [c]);
    }
}

export const inSafeZone = (x: number, z: number) => Math.hypot(x, z) < SAFE_R;

/**
 * Distancia a la que un rayo (origen o, dirección unitaria d) entra en un obstáculo grande (muros, casas, torres...).
 * Para la cámara: así no se mete dentro de los edificios. `pad`: margen alrededor de cada obstáculo.
 */
export function rayBlockDist(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, pad = 0.25): number {
  const STEP = 0.2;
  for (let k = 0.6; k <= maxD; k += STEP) {
    const x = ox + dx * k, y = oy + dy * k, z = oz + dz * k;
    const list = GRID.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) continue;
    for (const c of list) {
      // solo lo grande y alto: farolas, árboles, bancos, barriles o carros no deben acercar la cámara de golpe
      if ((c.h ?? 8) < 2.4 || ("r" in c ? c.r < 0.9 : Math.min(c.hw, c.hd) < 0.3 || Math.max(c.hw, c.hd) < 0.9)) continue;
      if (y > (c.h ?? 8) + pad || y < (c.y0 ?? -1) - pad) continue;
      if ("r" in c ? Math.hypot(x - c.x, z - c.z) < c.r + pad : Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return Math.max(0, k - STEP);
    }
  }
  return maxD;
}

/** Saca un círculo de radio `rad` de dentro de los obstáculos. `y`: altura de vuelo (0 = a pie). */
export function resolveCollisions(x: number, z: number, rad: number, y = 0): [number, number] {
  const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
  for (let ix = cx0 - 1; ix <= cx0 + 1; ix++) for (let iz = cz0 - 1; iz <= cz0 + 1; iz++) {
    const list = GRID.get(cellKey(ix, iz));
    if (!list) continue;
    for (const c of list) {
      if (c.h !== undefined && y >= c.h) continue; // pasa por encima
      if (c.y0 !== undefined && y < c.y0) continue; // pasa por debajo
      if ("r" in c) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + rad;
        if (d < min) {
          if (d < 1e-6) x += min;
          else { x = c.x + (dx / d) * min; z = c.z + (dz / d) * min; }
        }
      } else {
        const bx = Math.max(c.x - c.hw, Math.min(c.x + c.hw, x));
        const bz = Math.max(c.z - c.hd, Math.min(c.z + c.hd, z));
        const dx = x - bx, dz = z - bz, d = Math.hypot(dx, dz);
        if (d < rad) {
          if (d > 1e-6) { x = bx + (dx / d) * rad; z = bz + (dz / d) * rad; }
          else {
            const px = c.hw - Math.abs(x - c.x), pz = c.hd - Math.abs(z - c.z);
            if (px < pz) x = c.x + (x >= c.x ? 1 : -1) * (c.hw + rad);
            else z = c.z + (z >= c.z ? 1 : -1) * (c.hd + rad);
          }
        }
      }
    }
  }
  return [Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x)), Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z))];
}

export { rectDist as _rectDist };
