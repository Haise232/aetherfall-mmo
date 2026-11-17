// Barrios y parques de Valdoria: datos deterministas compartidos por cliente (dibujo) y servidor (colisiones y asientos).
// Sin dependencias: world.ts importa de aquí (casas que no se generan, colisiones y paletas de cada barrio).
// `districtAt` (qué barrio es un punto) está en world.ts porque necesita sus medidas.

// ---- Barrios ----
export type DistrictId = "plaza" | "castle" | "cathedral" | "guild" | "old" | "anvil" | "fields";
export interface DistrictDef {
  id: DistrictId; name: string;
  /** Color heráldico del barrio (estandartes, rótulo al entrar). */
  color: number;
  /** Paletas de fachadas y tejados de sus casas. */
  walls: number[]; roofs: number[];
  blurb: string;
}
export const DISTRICTS: Record<DistrictId, DistrictDef> = {
  plaza: { id: "plaza", name: "Plaza Mayor", color: 0xd9b13b, walls: [0xd9ccb0], roofs: [0xa4472f], blurb: "El corazón de Valdoria" },
  castle: { id: "castle", name: "Recinto del Castillo", color: 0x2c4a8a, walls: [0xd0c4aa], roofs: [0x39414f], blurb: "Sede de la corona" },
  cathedral: { id: "cathedral", name: "Barrio de la Catedral", color: 0x3d6fa8,
    walls: [0xe4ddcc, 0xd8d0bd, 0xcfc8b6, 0xe8e2d2], roofs: [0x4a5560, 0x3f4a5a, 0x56606b, 0x2f4a6b], blurb: "Piedra clara y tejados de pizarra" },
  guild: { id: "guild", name: "Barrio del Gremio", color: 0xd9b13b,
    walls: [0xd9c08a, 0xcdb27a, 0xe0cc9a, 0xc9a86a], roofs: [0x8f3d2b, 0xa4472f, 0x7a2f3a, 0x9a4a2e], blurb: "Mercaderes, talleres y buen comercio" },
  old: { id: "old", name: "Barrio Viejo", color: 0x9b2f3d,
    walls: [0xb59a6a, 0xa88a5c, 0xbfae8c, 0x9a7f58], roofs: [0x6b4a2e, 0x5a3e28, 0x7a5634, 0x5f6b3a], blurb: "Callejas, tabernas y casas de siempre" },
  anvil: { id: "anvil", name: "Barrio del Yunque", color: 0x4f8a4c,
    walls: [0xa7a194, 0xb6ae9c, 0x9d978a, 0xc2bbab], roofs: [0x4a4f57, 0x3a3f46, 0x5a5f66, 0x6b4a2e], blurb: "Herreros, canteros y el Banco Real" },
  fields: { id: "fields", name: "Campos de Valdoria", color: 0x6b8a3a, walls: [0xd9ccb0], roofs: [0xa4472f], blurb: "Fuera de la muralla" },
};
// ---- Parques ----
export type ParkFeature = "pond" | "gazebo" | "oldtree" | "fountain";
export interface ParkDef { id: string; name: string; district: DistrictId; x: number; z: number; size: number; feature: ParkFeature }
/** Un parque por barrio (26 × 26 m). Las casas que había ahí no se generan (ver KEEP_OUT en world.ts). */
export const PARKS: ParkDef[] = [
  { id: "claustro", name: "Jardín del Claustro", district: "cathedral", x: -70, z: -54, size: 26, feature: "pond" },
  { id: "gremios", name: "Jardín de los Gremios", district: "guild", x: 74, z: -34, size: 26, feature: "gazebo" },
  { id: "olmo", name: "Parque del Olmo Viejo", district: "old", x: -58, z: 42, size: 26, feature: "oldtree" },
  { id: "artesanos", name: "Plazuela de los Artesanos", district: "anvil", x: 58, z: 22, size: 26, feature: "fountain" },
];

/** Pieza de un parque. Todas las sólidas chocan (servidor) y se dibujan en la misma huella (cliente). */
export interface ParkProp {
  park: string;
  kind: "hedge" | "tree" | "bench" | "table" | "bed" | "lamp" | "feature";
  x: number; z: number;
  /** Medio ancho / medio fondo (cajas) o radio `r` (círculos). */
  hw?: number; hd?: number; r?: number;
  /** Orientación: hacia dónde mira quien se sienta (0 = +z). */
  ry?: number;
  /** Escala (árboles) o variante (macizos de flores: color). */
  s?: number;
  h: number;
}
/** Asiento: dónde se coloca el personaje sentado y hacia dónde mira. */
export interface Seat { id: number; x: number; z: number; ry: number; park?: string }

/** Huecos de entrada en el seto (centro de cada lado) y radio del paseo circular. */
export const PARK_GATE = 3.2, PARK_RING = 5.6;

const seededRand = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function layout(p: ParkDef): { props: ParkProp[]; seats: Omit<Seat, "id">[] } {
  const props: ParkProp[] = [], seats: Omit<Seat, "id">[] = [], h = p.size / 2, r = seededRand(p.x * 31 + p.z * 17 + 7919 | 0);
  const add = (o: Omit<ParkProp, "park">) => props.push({ park: p.id, ...o });
  // seto perimetral bajo (0,9 m) con cuatro entradas en el centro de cada lado
  const seg = (h - PARK_GATE / 2) / 2, T = 0.35;
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    add({ kind: "hedge", x: p.x + t * (PARK_GATE / 2 + seg), z: p.z + s * (h - T), hw: seg, hd: T, h: 0.9 }); // lados norte y sur
    add({ kind: "hedge", x: p.x + s * (h - T), z: p.z + t * (PARK_GATE / 2 + seg), hw: T, hd: seg, h: 0.9 }); // este y oeste
  }
  // elemento central
  const F = { pond: 3.6, gazebo: 0, oldtree: 1.3, fountain: 2.8 }[p.feature];
  if (p.feature === "gazebo") for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; add({ kind: "feature", x: p.x + Math.cos(a) * 3.4, z: p.z + Math.sin(a) * 3.4, r: 0.2, h: 3.4 }); } // postes del quiosco (dentro se pasea)
  else add({ kind: "feature", x: p.x, z: p.z, r: F, h: p.feature === "oldtree" ? 9 : 1.2 });
  if (p.feature === "oldtree") for (let k = 0; k < 8; k++) { // banco circular alrededor del olmo, mirando hacia fuera
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8; seats.push({ x: p.x + Math.cos(a) * 2.0, z: p.z + Math.sin(a) * 2.0, ry: Math.atan2(Math.cos(a), Math.sin(a)), park: p.id });
  }
  if (p.feature === "oldtree") add({ kind: "feature", x: p.x, z: p.z, r: 1.75, h: 0.5 }); // el propio banco circular (choca)
  if (p.feature === "gazebo") for (let k = 0; k < 8; k += 2) { // bancos dentro del quiosco
    const a = (k / 8) * Math.PI * 2; seats.push({ x: p.x + Math.cos(a) * 2.6, z: p.z + Math.sin(a) * 2.6, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), park: p.id });
  }
  // bancos en el paseo circular, mirando al centro, entre los caminos
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, R = PARK_RING + 1.4, bx = p.x + Math.cos(a) * R, bz = p.z + Math.sin(a) * R;
    const ry = Math.atan2(p.x - bx, p.z - bz), tx = Math.cos(ry), tz = -Math.sin(ry); // tangente (a lo largo del banco)
    add({ kind: "bench", x: bx, z: bz, r: 0.75, ry, h: 0.9 });
    for (const o of [-0.45, 0.45]) seats.push({ x: bx + tx * o + Math.sin(ry) * 0.05, z: bz + tz * o + Math.cos(ry) * 0.05, ry, park: p.id });
  }
  // farolas entre bancos
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; add({ kind: "lamp", x: p.x + Math.cos(a) * (PARK_RING + 1.4), z: p.z + Math.sin(a) * (PARK_RING + 1.4), r: 0.22, h: 4 }); }
  // por cuadrante: árboles junto al seto, un macizo de flores y (en dos de ellos) una mesa de merienda
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], q) => {
    for (const [u, v] of [[0.82, 0.55], [0.55, 0.82], [0.85, 0.85]] as const) {
      const s = 0.9 + r() * 0.5; add({ kind: "tree", x: p.x + sx! * h * u + (r() - 0.5), z: p.z + sz! * h * v + (r() - 0.5), r: 0.4 * s, s, h: 5.2 * s });
    }
    add({ kind: "bed", x: p.x + sx! * 4.2, z: p.z + sz! * 9.0, hw: 1.6, hd: 0.6, s: q, h: 0.45 });
    if (q % 2 === 0) {
      const tx = p.x + sx! * 8.6, tz = p.z + sz! * 3.4;
      add({ kind: "table", x: tx, z: tz, hw: 0.9, hd: 1.2, h: 0.9 });
      for (const o of [-1, 1]) seats.push({ x: tx + o * 0.75, z: tz, ry: o > 0 ? -Math.PI / 2 : Math.PI / 2, park: p.id });
    }
  });
  return { props, seats };
}

const built = PARKS.map(layout);
export const PARK_PROPS: ParkProp[] = built.flatMap(b => b.props);

/** Bancos de la Plaza Mayor (en el anillo, entre avenidas y puestos), mirando a la fuente. */
const PLAZA_BENCHES = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2 + Math.PI / 8, R = 12.4, x = Math.cos(a) * R, z = Math.sin(a) * R; // entre la fuente (r 4) y los puestos de la plaza
  return { x, z, ry: Math.atan2(-x, -z) };
});
export const PLAZA_BENCH_PROPS: ParkProp[] = PLAZA_BENCHES.map(b => ({ park: "plaza", kind: "bench", x: b.x, z: b.z, r: 0.75, ry: b.ry, h: 0.9 }));

export const SEATS: Seat[] = [
  ...built.flatMap(b => b.seats),
  ...PLAZA_BENCHES.flatMap(b => [-0.45, 0.45].map(o => ({ x: b.x + Math.cos(b.ry) * o, z: b.z - Math.sin(b.ry) * o, ry: b.ry, park: "plaza" }))),
].map((s, id) => ({ ...s, id }));

/** Asientos que ocupan los vecinos del ambiente (los jugadores no pueden sentarse ahí). */
export const TOWNSFOLK_SEATS = new Set(SEATS.filter(s => s.id % 5 === 0).map(s => s.id));
/** Distancia máxima a un asiento para sentarse. */
export const SEAT_RANGE = 2.2;
/** Recuperación de vida descansando (fracción de la vida máxima por segundo) y tiempo sin recibir daño que hace falta. */
export const REST_REGEN = 0.03, REST_AFTER_HIT = 6;

// ---- Gestos (chat con /) ----
export type Pose = "chair" | "floor" | "lie";
export const EMOTES: Record<string, { anim: string; text: string; pose?: Pose }> = {
  "/saludar": { anim: "Interact", text: "saluda" },
  "/aplaudir": { anim: "Cheer", text: "aplaude" },
  "/vitorear": { anim: "Cheer", text: "lanza un vítor" },
  "/sentarse": { anim: "Sit_Floor_Down", text: "se sienta en el suelo", pose: "floor" },
  "/tumbarse": { anim: "Lie_Down", text: "se tumba a descansar", pose: "lie" },
};
