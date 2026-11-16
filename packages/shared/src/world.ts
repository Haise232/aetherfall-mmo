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
export const CASTLE = { cx: 0, cz: -66, w: 80, d: 44, wallH: 8, wallT: 3, gateHalf: 5.5 };
export const CASTLE_RECT = { x0: -40, x1: 40, z0: -88, z1: -44 };
export const GREAT_HALL = { x: 0, z: -68, w: 38, d: 14, h: 13 };
export const CASTLE_TOWERS: Tower[] = [
  // esquinas y torres de la puerta
  { x: -40, z: -44, r: 5, h: 19, roof: 0x3d5a80 }, { x: 40, z: -44, r: 5, h: 19, roof: 0x3d5a80 },
  { x: -40, z: -88, r: 5, h: 22, roof: 0x3d5a80 }, { x: 40, z: -88, r: 5, h: 22, roof: 0x3d5a80 },
  { x: -9.5, z: -44, r: 4, h: 17, roof: 0x7a2f3a }, { x: 9.5, z: -44, r: 4, h: 17, roof: 0x7a2f3a },
  // torres del castillo (las del gran salón y el homenaje son las más altas)
  { x: 0, z: -84, r: 4.2, h: 56, roof: 0x2f4a6b, style: "keep" }, { x: 14, z: -80, r: 5.5, h: 42, roof: 0x3d5a80, style: "keep" },
  { x: -14, z: -80, r: 4.5, h: 36, roof: 0x7a2f3a, style: "keep" }, { x: -26, z: -76, r: 4, h: 28, roof: 0x3d5a80 },
  { x: 26, z: -76, r: 4, h: 31, roof: 0x2f4a6b }, { x: -33, z: -60, r: 3, h: 25, roof: 0x7a2f3a },
  { x: 33, z: -60, r: 3.2, h: 27, roof: 0x3d5a80 }, { x: -12, z: -56, r: 2.6, h: 21, roof: 0x2f4a6b },
  { x: 12, z: -56, r: 2.6, h: 23, roof: 0x7a2f3a }, { x: -28, z: -52, r: 3, h: 22, roof: 0x3d5a80, style: "square" },
  { x: 28, z: -52, r: 3, h: 24, roof: 0x7a2f3a, style: "square" },
  { x: 6.5, z: -77, r: 2.2, h: 52, roof: 0x7a2f3a, style: "spire" }, { x: -7, z: -77.5, r: 2.4, h: 48, roof: 0x3d5a80, style: "spire" },
  { x: -21.5, z: -62, r: 3, h: 30, roof: 0x7a2f3a, style: "square" }, { x: 21.5, z: -62, r: 3, h: 33, roof: 0x2f4a6b, style: "square" },
];
// Alas con tejado pegadas a la muralla este y oeste del patio, pórtico del gran salón, estatua y parterres.
export const CASTLE_WINGS = [
  { x: 34.5, z: -74, w: 7, d: 16, h: 9, wall: 0xc9bc9f, roof: 0x4a5a78 },
  { x: -34.5, z: -74, w: 7, d: 16, h: 10, wall: 0xc9bc9f, roof: 0x7a2f3a },
];
export const GREAT_PORCH = { x: 0, z: -59, w: 9, d: 4, h: 8 };
// Viaducto de piedra sobre el acceso al gran salón: dos pilares a ambos lados del arco (hueco central libre).
export const CASTLE_PIERS = [{ x: -7.95, z: -56, hw: 1.45, hd: 1.5 }, { x: 7.95, z: -56, hw: 1.45, hd: 1.5 }];
export const CASTLE_STATUE = { x: 0, z: -52, r: 2.2 };
export const CASTLE_LAWNS = [
  { x: -7, z: -51.5, w: 4.4, d: 6 }, { x: 7, z: -51.5, w: 4.4, d: 6 },
  { x: -20.25, z: -53, w: 7.5, d: 10 }, { x: 20.25, z: -53, w: 7.5, d: 10 },
];

export const FOUNTAIN = { x: 0, z: 0, r: 4 };
export const LAKE = { x: -168, z: 70, r: 30 };
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
const rectDist = (x: number, z: number, cx: number, cz: number, hw: number, hd: number) =>
  Math.hypot(Math.max(Math.abs(x - cx) - hw, 0), Math.max(Math.abs(z - cz) - hd, 0));

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
const KEEP_OUT = [{ x: -55, z: -24, w: 24, d: 34 }, { x: -55, z: -45, w: 18, d: 14 }];
export const CATHEDRAL_EXTRA: Collider[] = [
  { x: -55, z: -24, hw: 11, hd: 3.8 }, // crucero
  { x: -55, z: -42, r: 6.9 }, // ábside
];
export const GARDENS: { x: number; z: number; w: number; d: number; well: boolean }[] = [];
export const BUILDINGS: Building[] = (() => {
  const r = rng(2024);
  const out: Building[] = [];
  const facingOf = (x: number, z: number): 0 | 1 | 2 | 3 =>
    Math.abs(x) > Math.abs(z) ? (x > 0 ? 3 : 1) : z > 0 ? 2 : 0;
  for (const s of specials) out.push({ ...s, facing: s.id === "cathedral" ? 1 : facingOf(s.x, s.z) });
  const walls = [0xd9ccb0, 0xcdbb94, 0xbfae8c, 0xd8d0bd, 0xb59a6a, 0xcfc2a6];
  const roofs = [0xa4472f, 0x8f3d2b, 0x6b4a2e, 0x4a5560, 0x5f6b3a, 0x7a4a2e];
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
      wall: walls[Math.floor(r() * walls.length)]!, roof: roofs[Math.floor(r() * roofs.length)]!, facing: facingOf(x, z), style,
    });
  }
  return out;
})();

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
export const STALLS: { x: number; z: number; color: number }[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i + 0.5) * (Math.PI / 6);
  return { x: Math.cos(a) * 12.5, z: Math.sin(a) * 12.5, color: [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x27ae60, 0x8e44ad, 0xe67e22][i % 6]! };
});

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


// Mobs: anillo lejano, fuera de lagos y campos.
export const MOB_SPAWNS: { x: number; z: number }[] = Array.from({ length: 22 }, (_, i) => {
  const a = Math.PI / 22 + (i * Math.PI * 2) / 22, rad = 172 + (i % 3) * 7;
  return { x: Math.cos(a) * rad, z: Math.sin(a) * rad };
}).filter(p => Math.hypot(p.x - LAKE.x, p.z - LAKE.z) > LAKE.r + 8 && !FIELDS.some(f => p.x > f.x0 - 6 && p.x < f.x1 + 6 && p.z > f.z0 - 6 && p.z < f.z1 + 6)
  && Math.abs(p.x) < WORLD_HALF - 6 && Math.abs(p.z) < WORLD_HALF - 6);

function buildProps() {
  const r = rng(1337);
  const trees: Prop[] = [], rocks: Prop[] = [];
  const free = (x: number, z: number, m: number) =>
    Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + m + 1 &&
    FIELDS.every(f => !(x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m)) &&
    WINDMILLS.every(w => Math.hypot(x - w.x, z - w.z) > 8 + m) &&
    EXTRA_BUILDINGS.every(b => rectDist(x, z, b.x, b.z, b.w / 2 + 1, b.d / 2 + 1) > m + 1) &&
    MOB_SPAWNS.every(p => Math.hypot(x - p.x, z - p.z) > 4) &&
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
export type Collider = ({ x: number; z: number; r: number } | { x: number; z: number; hw: number; hd: number }) & { h?: number };

export const COLLIDERS: Collider[] = (() => {
  const c: Collider[] = [];
  const add = (h: number, ...items: Collider[]) => { for (const it of items) c.push({ ...it, h }); };
  const towerH = (t: { r: number; h: number }) => t.h + t.r * 2.4 + 5;
  add(9, { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r });
  add(0.4, { x: LAKE.x, z: LAKE.z, r: LAKE.r + 0.5 }); // el agua solo frena a quien va a pie
  for (const b of BUILDINGS) add(b.kind === "cathedral" ? 48 : b.h + 7, { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 });
  for (const s of STALLS) add(3.2, { x: s.x, z: s.z, r: 1.5 });
  for (const s of WALL_SEGMENTS) add(9.5, { x: s.x, z: s.z, r: 2.1 });
  for (const t of [...WALL_TOWERS, ...GATE_TOWERS, ...CASTLE_TOWERS]) add(towerH(t), { x: t.x, z: t.z, r: t.r });
  // Muralla del castillo (con hueco en la puerta sur) y gran salón.
  const { x0, x1, z0, z1 } = CASTLE_RECT, t = CASTLE.wallT / 2, g = CASTLE.gateHalf;
  add(11, { x: (x0 + -g) / 2, z: z1, hw: (-g - x0) / 2, hd: t }, { x: (x1 + g) / 2, z: z1, hw: (x1 - g) / 2, hd: t });
  add(11, { x: 0, z: z0, hw: (x1 - x0) / 2, hd: t }, { x: x0, z: (z0 + z1) / 2, hw: t, hd: (z1 - z0) / 2 }, { x: x1, z: (z0 + z1) / 2, hw: t, hd: (z1 - z0) / 2 });
  add(GREAT_HALL.h + 14, { x: GREAT_HALL.x, z: GREAT_HALL.z, hw: GREAT_HALL.w / 2, hd: GREAT_HALL.d / 2 });
  add(26, ...CATHEDRAL_EXTRA);
  for (const w of CASTLE_WINGS) add(16, { x: w.x, z: w.z, hw: w.w / 2, hd: w.d / 2 });
  add(10, { x: GREAT_PORCH.x, z: GREAT_PORCH.z, hw: GREAT_PORCH.w / 2, hd: GREAT_PORCH.d / 2 });
  add(14, ...CASTLE_PIERS);
  add(6, { x: CASTLE_STATUE.x, z: CASTLE_STATUE.z, r: CASTLE_STATUE.r });
  for (const l of CASTLE_LAWNS) add(1, { x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2 });
  for (const g2 of GARDENS) add(4.5, { x: g2.x, z: g2.z, hw: g2.w / 2, hd: g2.d / 2 });
  for (const k of CARTS) add(2.2, { x: k.x, z: k.z, hw: k.along === "x" ? 1.3 : 0.7, hd: k.along === "x" ? 0.7 : 1.3 });
  for (const b of EXTRA_BUILDINGS) add(13, { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 });
  for (const w of WINDMILLS) add(24, { x: w.x, z: w.z, r: 4.5 });
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

/** Saca un círculo de radio `rad` de dentro de los obstáculos. `y`: altura de vuelo (0 = a pie). */
export function resolveCollisions(x: number, z: number, rad: number, y = 0): [number, number] {
  const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
  for (let ix = cx0 - 1; ix <= cx0 + 1; ix++) for (let iz = cz0 - 1; iz <= cz0 + 1; iz++) {
    const list = GRID.get(cellKey(ix, iz));
    if (!list) continue;
    for (const c of list) {
      if (c.h !== undefined && y >= c.h) continue; // pasa por encima
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
