// Protocolo v2 (JSON). El cliente envía intenciones, nunca estado.
import type { InvState, Slot } from "./items";
import type { BuffId, LookSel, MountId } from "./classes";
import type { GatherKind } from "./gather";
import type { MobId } from "./mobs";
import type { Pose } from "./parks";

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

// ---- Cuentas (beta) ----
/** Usuario: 3–16 letras, números o guion bajo. */
export const USER_RE = /^[\p{L}\p{N}_]{3,16}$/u;
export const PASS_MIN = 8;
/** Personajes por cuenta. */
export const MAX_CHARS = 3;
export type AuthError = "invalid" | "weak" | "exists" | "wrong" | "locked" | "expired" | "pending" | "banned";

// ---- Eventos del mundo (los activa un administrador) ----
export type WorldEventId = "xp2" | "gather2" | "wolfmoon" | "dragon";
export const WORLD_EVENTS: Record<WorldEventId, { name: string; desc: string }> = {
  xp2: { name: "Doble experiencia", desc: "Toda la experiencia (combate, misiones y oficios) vale el doble." },
  gather2: { name: "Doble recolección", desc: "Cada faena de oficio da el doble de recursos." },
  wolfmoon: { name: "Luna de lobos", desc: "Salen el doble de lobos fuera de la muralla y huelen a los viajeros desde más lejos." },
  dragon: { name: "Ataque del dragón", desc: "Vermithrax despierta en su guarida, al noroeste fuera de la muralla. Quien ayude a derrotarlo lo gana como montura voladora." },
};
export interface ActiveEvent { id: WorldEventId; until: number } // until: fecha (ms) en que termina
/** Cuenta vista desde el panel de administración. */
export interface AdminAccount { user: string; email?: string; note?: string; status: "pending" | "active" | "banned"; role: "player" | "admin"; created: number; lastLogin?: number; chars: string[] }
export type AdminOp =
  | { op: "refresh" }
  | { op: "approve"; user: string } // acepta la solicitud y genera una contraseña temporal
  | { op: "reject"; user: string } // borra la solicitud
  | { op: "resetPass"; user: string } // nueva contraseña temporal (el jugador tendrá que cambiarla)
  | { op: "ban"; user: string } | { op: "unban"; user: string }
  | { op: "kick"; name: string } // expulsar a un personaje conectado
  | { op: "event"; id: WorldEventId; minutes: number } // minutes 0: terminarlo
  | { op: "announce"; text: string }; // aviso para todos los jugadores
export interface CharSummary { name: string; level: number; look?: LookSel }

export type ClientMsg =
  | { t: "register"; user: string; email?: string; note?: string } // solicitar una cuenta: un administrador la aprueba y da una contraseña temporal
  | { t: "changePass"; pass: string } // poner contraseña nueva (obligatorio tras una temporal)
  | ({ t: "admin" } & AdminOp) // solo cuentas de administrador
  | { t: "login"; user: string; pass: string; remember?: boolean } // iniciar sesión; remember: el servidor devuelve un token de sesión
  | { t: "resume"; token: string } // entrar con la sesión recordada
  | { t: "logout"; token?: string } // cerrar sesión (y olvidar el token)
  | { t: "join"; name: string } // jugar con un personaje de tu cuenta (o crear uno nuevo con ese nombre)
  | { t: "create"; cls: string; style: number; tone: number } // tras "needLook": elegir clase y aspecto
  | { t: "moveTo"; x: number; z: number } // intención: ir hacia un punto (cancela el objetivo)
  | { t: "input"; dx: number; dz: number; ry: number; dy?: number } // dy: subir/bajar (-1..1) cuando vuela
  | { t: "pickMount"; id: MountId | null } // elegir montura ganada (null: la de la clase)
  | { t: "mount"; on: boolean } // subirse o bajarse de la montura (escoba, caballo, cabra...) // WASD: dirección en el mundo (|d|<=1) y hacia dónde mira
  | { t: "jump" }
  | { t: "attack"; target: number } // intención: perseguir y atacar a una entidad
  | { t: "select"; target: number | null } // marcar sin atacar: las habilidades lo usan como objetivo
  | { t: "skill"; slot: number } // habilidad 0-2 de tu clase (teclas 1-2-3)
  | { t: "job"; job: string } // elegir o cambiar de oficio junto al maestro del gremio
  | { t: "changeClass"; cls: string; style: number; tone: number } // cambiar de clase en el gremio
  | { t: "questTalk"; npc: string } // hablar con un NPC de misión
  | { t: "questProgress"; kind: "pray" } // progresar misión de rezar
  | { t: "gather"; node?: number; corpse?: number } // empezar a recolectar en un punto (o desollar un lobo abatido)
  | { t: "sit"; seat: number } // sentarse en un asiento de SEATS (cualquier movimiento te levanta)
  | { t: "skillUp"; slot: number; opt: number } // aprender o mejorar la opción `opt` de la casilla `slot` (0..3; la definitiva es la 3, opción 0)
  | { t: "skillPick"; slot: number; opt: number } // equipar en la casilla `slot` (0..2) una habilidad ya aprendida
  | { t: "skillReset" } // recuperar todos los puntos (fuera de combate)
  // casa de subastas (todos exigen estar a MARKET_RANGE del subastador; el servidor recalcula todo)
  | { t: "mkOpen" } // abrir la ventana: el servidor responde con mkState (y entrega lo comprado pendiente)
  | { t: "mkBook"; item: string } // pedir el libro de órdenes de un objeto
  | { t: "mkPlace"; side: OrderSide; item: string; price: number; qty: number } // publicar orden de venta o compra
  | { t: "mkCancel"; order: number } // cancelar una orden propia
  | { t: "mkClaim" } // recoger lo comprado
  | { t: "mkSellNpc"; item: string; qty: number } // vender al subastador al contado (npcBuyPrice)
  | { t: "chat"; text: string }
  | { t: "equip"; item: string }
  | { t: "unequip"; slot: Slot };

export type EntityKind = "player" | "mob" | "boss";

// ---- Casa de subastas ----
export type OrderSide = "buy" | "sell";
export interface MarketOrder {
  id: number; side: OrderSide; item: string;
  price: number; // por unidad
  qty: number; // unidades que quedan por ejecutar
  total: number; // unidades al publicar
  got?: number; // solo órdenes de compra propias: compradas y sin recoger
}
export interface BookLevel { price: number; qty: number }
/** Libro de un objeto: mejores BOOK_LEVELS precios por lado, sumados por precio (compras de mayor a menor, ventas de menor a mayor). */
export interface ItemBook { item: string; buys: BookLevel[]; sells: BookLevel[] }
export interface BoardRow { item: string; bestBuy?: number; bestSell?: number }
export type MkError = "far" | "invalid" | "notTradable" | "noItems" | "noCoins" | "tooMany" | "notFound" | "rate";

export interface EntityState {
  id: number;
  kind: EntityKind;
  name: string;
  level: number;
  x: number;
  z: number;
  ry: number; // orientación (rad, 0 = +Z)
  y?: number; // altura sobre el suelo (vuelo o caída)
  fly?: boolean; // montado (en escoba vuela; en las demás monturas va por el suelo)
  hp: number;
  maxHp: number;
  dead: boolean;
  weapon?: string; // equipo visible (público, como en Albion)
  armor?: string;
  look?: LookSel; // clase y aspecto elegidos (solo jugadores)
  buff?: BuffId; // efecto temporal activo
  stun?: boolean; // aturdido: no se mueve ni ataca
  act?: GatherKind; // recolectando (pesca, mina, hierbas o desuello)
  skinned?: true; // lobo abatido ya desollado
  swim?: true; // nadando en el lago
  pose?: Pose; // sentado en un banco, en el suelo o tumbado
  mount?: MountId; // montura elegida si no es la de su clase (p. ej. el dragón)
  mob?: MobId; // tipo de criatura (solo kind "mob")
}

export type GameEvent =
  | { e: "hit"; from: number; to: number; dmg: number; sk?: true; crit?: true; block?: true } // sk: habilidad · crit: crítico · block: bloqueado
  | { e: "death"; id: number; killer: number }
  | { e: "chat"; from: number; name: string; text: string }
  | { e: "loot"; to: number; item: string; qty: number }
  | { e: "levelup"; id: number; level: number }
  | { e: "jobLevelUp"; id: number; level: number; job: string }
  | { e: "jump"; id: number }
  | { e: "cast"; id: number; slot: number; k?: string; to?: number } // habilidad lanzada con éxito (k: su clave, ver skillKey; to: objetivo)
  | { e: "heal"; id: number; amount: number }
  | { e: "bless"; id: number; transformed?: true } // la diosa bendice a quien reza (transformed: cambió de forma)
  | { e: "note"; to: number; text: string } // aviso privado (p. ej. "este banco de peces está agotado")
  | { e: "emote"; id: number; anim: string; text?: string } // gesto (/saludar...); text: "saluda" para el chat
  | { e: "announce"; text: string } // aviso de un administrador para todos
  | { e: "breath"; id: number; ry: number } // el dragón escupe fuego hacia ry
  | { e: "gathered"; id: number; kind: GatherKind; rare?: true; rarity?: number } // terminó una faena (rarity: la mejor obtenida)
  | { e: "sold"; to: number; item: string; qty: number; gross: number; net: number } // una orden de venta tuya se ha ejecutado (net: tras impuesto)
  | { e: "bought"; to: number; item: string; qty: number; price: number }; // una orden de compra tuya se ha ejecutado (recógelo en la subasta)

export type ServerMsg =
  | { t: "welcome"; id: number; tickHz: number }
  | { t: "needLook"; name: string } // nombre aceptado, falta elegir clase y aspecto
  | { t: "joined"; name: string }
  | { t: "joinError"; reason: "taken" | "invalid" | "auth" | "notYours" | "limit" }
  | { t: "auth"; user: string; token?: string; chars: CharSummary[]; admin?: true; mustChange?: true } // sesión iniciada (mustChange: antes hay que cambiar la contraseña)
  | { t: "registered"; text: string } // solicitud de cuenta recibida
  | { t: "adminState"; accounts: AdminAccount[]; online: { name: string; user: string; level: number }[]; events: ActiveEvent[] }
  | { t: "adminResult"; ok: boolean; text: string; tempPass?: string; user?: string }
  | { t: "world"; events: ActiveEvent[] } // eventos activos (se envía al entrar y cuando cambian)
  | { t: "kicked"; text: string } // te han sacado del juego (expulsión, bloqueo o contraseña cambiada)
  | { t: "authError"; reason: AuthError; text: string }
  | { t: "snapshot"; tick: number; entities: EntityState[]; events: GameEvent[]; down?: number[]; rich?: number[] } // down: puntos agotados · rich: pares [id, riqueza 1..3] aplanados
  | ({ t: "inv" } & InvState) // estado privado: solo se envía a su dueño
  // casa de subastas
  | { t: "mkState"; coins: number; orders: MarketOrder[]; npcBuy: Record<string, number> } // tus órdenes y precios del subastador
  | { t: "mkBook"; book: ItemBook }
  | { t: "mkBoard"; rows: BoardRow[] } // tablón de precios (se envía al abrir y cada vez que cambia el libro de BOARD_ITEMS)
  | { t: "mkResult"; ok: boolean; reason?: MkError; text?: string }; // resultado de la última operación (text: mensaje para el jugador)
