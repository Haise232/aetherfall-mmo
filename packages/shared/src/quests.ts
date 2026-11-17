// Misiones y NPCs del mundo. El servidor valida la distancia y guarda el progreso.
import type { LookSel } from "./classes";

export const TALK_RANGE = 5; // metros para hablar con un personaje

// Oficios de recolección: cada uno saca un recurso del mundo (ver gather.ts).
export type JobId = "fisher" | "tanner" | "gatherer" | "miner";
export interface JobDef { id: JobId; name: string; desc: string; gets: string; where: string; color: number }
export const JOBS: JobDef[] = [
  { id: "fisher", name: "Pescador", desc: "Echa la caña en los bancos de peces del lago.", gets: "Truchas, carpas y algún lucio dorado", where: "Los bancos de peces están en el lago, al oeste, fuera de la muralla.", color: 0x3f8fc0 },
  { id: "tanner", name: "Peletero", desc: "Desuella a los lobos abatidos y aprovecha su piel.", gets: "Pieles, cuero grueso y colmillos", where: "Los lobos rondan fuera de la muralla. Desuéllalos antes de que se los lleve el bosque.", color: 0xa0703c },
  { id: "gatherer", name: "Recolector", desc: "Recoge hierbas y bayas de las matas silvestres.", gets: "Hierba curativa, bayas y flor de luna", where: "Las matas de hierbas crecen en los prados de fuera de la muralla.", color: 0x4fbf8a },
  { id: "miner", name: "Minero", desc: "Pica las vetas de mineral que asoman entre las rocas.", gets: "Mineral de hierro, carbón y plata", where: "Las vetas brillan entre las rocas de los campos, fuera de la muralla.", color: 0x8d949c },
];
export const jobOf = (id: string | undefined) => JOBS.find(j => j.id === id);

/** NPCs con los que se puede hablar. */
export interface NpcDef {
  id: string;
  name: string;
  title: string;
  x: number; z: number; ry: number;
  look: LookSel;
  /** Frases de conversación; el diálogo las recorre con "Seguir hablando". */
  dialog: string[];
  /** Saludos cortos que dice en un bocadillo al acercarse alguien. */
  greet: string[];
}

export const NPCS: NpcDef[] = [
  {
    id: "guild_master",
    name: "Maese Albor",
    title: "Maestro del gremio",
    x: 36.7, z: -22, ry: -Math.PI / 2, // tras el mostrador, dentro del Gremio
    look: ["mage", 0, 0],
    dialog: [
      "Bienvenido al Gremio de Mercaderes. Aquí nadie vive solo de la espada.",
      "Cada puesto de la plaza paga su cuota al gremio. A cambio, nadie le quita el sitio a nadie.",
      "Los caminos fuera de la muralla están llenos de lobos. Los oficios no se aprenden de brazos cruzados.",
    ],
    greet: ["Pasa, pasa.", "¿Buscas oficio?", "El gremio te saluda."],
  },
  {
    id: "tanner",
    name: "Ulfric",
    title: "Peletero",
    x: 30.6, z: -16.2, ry: Math.PI, // en su puesto de pieles, dentro del Gremio
    look: ["rogue", 1, 1],
    dialog: [
      "Los lobos acechan fuera de la muralla. Si me traes pieles, te coso una buena armadura de cuero.",
      "Una piel bien curtida aguanta más que muchas cotas de malla mal forjadas. No se lo digas al herrero.",
      "Sal por cualquier puerta y no te alejes del camino hasta que sepas pelear.",
    ],
    greet: ["Huele a lobo por aquí…", "¿Traes pieles?", "Buenas, forastero."],
  },
  {
    id: "priestess",
    name: "Iris",
    title: "Sacerdotisa de la Diosa",
    x: -58.2, z: -29, ry: 0, // dentro de la catedral, junto a la estatua
    look: ["mage", 2, 2],
    dialog: [
      "La diosa bendice a quien reza con devoción ante su estatua, aquí en la catedral. Acércate a ella.",
      "Dicen que a algunos magos y caballeros la luz los cambia para siempre.",
      "Habla bajo, por favor. Esta casa es de todos, pero el silencio es de ella.",
    ],
    greet: ["Que la luz te guarde.", "Bienvenido a la casa de la diosa.", "Paz contigo."],
  },
  // casa de subastas (plaza del mercado, delante del Mercado Cubierto)
  {
    id: "auctioneer",
    name: "Odalric",
    title: "Subastador del gremio",
    x: -18.6, z: -24, ry: Math.PI / 2, // = AUCTIONEER en world.ts
    look: ["mage", 2, 0],
    dialog: [
      "Bienvenido a la casa de subastas de Valdoria. Aquí cada cual pone su precio, y el gremio cobra su parte.",
      "Si tienes prisa, te compro yo al contado. Pago poco, eso sí: los de la plaza pagan mejor si esperas.",
      "Pon una orden de compra y, cuando alguien venda a ese precio, la mercancía es tuya. Pasa a recogerla por aquí.",
    ],
    greet: ["¡Se compra y se vende!", "Precios justos… casi.", "¿Vendes o compras?"],
  },
  // salón del trono del castillo
  {
    id: "queen",
    name: "Reina Isolda",
    title: "Soberana de Valdoria",
    x: 0, z: -84.4, ry: 0, // al pie de la tarima del trono
    look: ["rogue", 1, 3],
    dialog: [
      "Bienvenido a mi salón. Valdoria se sostiene sobre sus gremios, su fe y la espada de quien la defiende.",
      "Los lobos se acercan más cada invierno. Quien limpie los caminos tendrá el agradecimiento de la corona.",
      "Este salón lo levantó mi bisabuelo con piedra de la sierra. Cada estandarte es una casa que juró lealtad.",
    ],
    greet: ["Acércate.", "Bienvenido a la corte.", "La corona te escucha."],
  },
  {
    id: "steward",
    name: "Bertrand",
    title: "Senescal del castillo",
    x: 2.4, z: -77.4, ry: 0, // junto a la alfombra, a la entrada
    look: ["mage", 1, 1],
    dialog: [
      "Bienvenido al gran salón. La reina recibe al fondo, ante el trono. Habla con respeto.",
      "Las mesas se preparan para el banquete de la cosecha. Si traes caza, la cocina siempre la agradece.",
      "No toques las armaduras de la tarima: eran del primer rey y pesan más que tú.",
    ],
    greet: ["Adelante, adelante.", "¿Audiencia con la reina?", "Limpia esas botas."],
  },
  {
    id: "bard",
    name: "Lira",
    title: "Juglar de la corte",
    x: -15.9, z: -82, ry: Math.PI / 2, // junto a la chimenea oeste
    look: ["rogue", 0, 2],
    dialog: [
      "¿Una canción? Tengo una sobre un caballero que confundió a un lobo con su suegra.",
      "Dicen que bajo el castillo hay bodegas que ni el senescal conoce. Yo no he dicho nada.",
      "Junto al fuego se cuentan las mejores historias. Y se roban los mejores trozos de asado.",
    ],
    greet: ["¡Un público!", "Siéntate al fuego.", "¿Hoy una balada?"],
  },
];

export const npcOf = (id: string | undefined) => NPCS.find(n => n.id === id);

export type QuestType = "talk" | "kill" | "collect" | "pray";

export interface QuestReward {
  xp?: number;
  items?: { item: string; qty: number }[];
  job?: boolean; // el jugador elige un oficio como recompensa
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string; // npc id
  description: string;
  type: QuestType;
  target: string; // npc id, mob kind, item id, place id
  count: number; // para kill/collect
  reward: QuestReward;
  next?: string; // siguiente quest al completar
}

export const QUESTS: Record<string, QuestDef> = {
  guild: {
    id: "guild",
    title: "Un oficio en Valdoria",
    giver: "guild_master",
    description: "Habla con el maestro del gremio y elige un oficio.",
    type: "talk",
    target: "guild_master",
    count: 1,
    reward: { xp: 50, job: true },
    next: "pelts",
  },
  pelts: {
    id: "pelts",
    title: "Pieles para el peletero",
    giver: "tanner",
    description: "Caza lobos fuera de la muralla y trae 3 pieles de lobo a Ulfric.",
    type: "collect",
    target: "wolf_pelt",
    count: 3,
    reward: { xp: 100, items: [{ item: "leather_armor", qty: 1 }] },
    next: "pray",
  },
  pray: {
    id: "pray",
    title: "Bendición de la diosa",
    giver: "priestess",
    description: "Reza ante la estatua de la diosa al fondo de la catedral.",
    type: "pray",
    target: "goddess",
    count: 1,
    reward: { xp: 75 },
  },
};

export const questOf = (id: string | undefined) => id ? QUESTS[id] : undefined;

/** Devuelve el destino de una quest para el minimapa. */
export function questDestination(questId: string | undefined, questType?: QuestType, target?: string) {
  const q = questOf(questId);
  if (!q) return undefined;
  if (q.type === "talk" || q.type === "pray") {
    const n = npcOf(q.giver);
    if (n) return { x: n.x, z: n.z };
  }
  // para collect/kill el destino es el giver para entregar; mientras se recolecta, sin marcador específico
  const n = npcOf(q.giver);
  return n ? { x: n.x, z: n.z } : undefined;
}
