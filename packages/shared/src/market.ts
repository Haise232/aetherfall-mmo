// Casa de subastas: constantes y reglas puras del mercado entre jugadores (cliente y servidor usan las mismas).
// Moneda: besantes (saldo entero `coins`). El dinero entra solo vendiendo recursos al subastador (a la mitad del
// precio base); entre jugadores se publican órdenes de venta y de compra que se casan por precio y antigüedad.
import { ITEMS } from "./items";

/** Distancia máxima al subastador para operar. */
export const MARKET_RANGE = 6;
/** Órdenes abiertas por personaje. */
export const MAX_ORDERS = 20;
export const MAX_PRICE = 1_000_000;
export const MAX_QTY = 9999;
/** Total máximo de una orden (precio × cantidad), para que nada se salga de un entero de 32 bits. */
export const MAX_TOTAL = 2 ** 31 - 1;
/** Tasa por publicar una orden (no se devuelve al cancelar). */
export const LIST_FEE = 0.02;
/** Impuesto que paga el vendedor sobre cada venta. */
export const SALE_TAX = 0.05;
/** El subastador compra al contado a esta fracción del precio base. */
export const NPC_BUY_RATIO = 0.5;
/** Milisegundos mínimos entre mensajes de mercado de un mismo jugador. */
export const MARKET_RATE_MS = 250;
/** Niveles de precio por lado que se envían en el libro de un objeto. */
export const BOOK_LEVELS = 8;
/** Objetos que muestra el tablón de precios de la plaza del mercado. */
export const BOARD_ITEMS = ["trout", "iron_ore", "coal", "healing_herb", "wolf_pelt", "thick_hide"];

const TRADABLE_CATS = new Set(["fish", "ore", "herb", "hide", "trophy"]);
/** Se puede comerciar: recursos (no herramientas, armas ni armaduras en esta versión). */
export const isTradable = (id: string) => {
  const d = Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
  return !!d && !d.slot && TRADABLE_CATS.has(d.cat) && (d.basePrice ?? 0) > 0;
};
export const TRADABLE_ITEMS = Object.keys(ITEMS).filter(isTradable);
/** Lo que paga el subastador por unidad. */
export const npcBuyPrice = (id: string) => Math.max(1, Math.round((ITEMS[id]?.basePrice ?? 0) * NPC_BUY_RATIO));
/** Tasa de publicación de una orden de total `total` (mínimo 1). */
export const listFee = (total: number) => Math.max(1, Math.floor(total * LIST_FEE));
/** Lo que cobra el vendedor por una venta de `total` besantes, ya descontado el impuesto. */
export const saleNet = (total: number) => total - Math.floor(total * SALE_TAX);
/** Precio y cantidad válidos (enteros dentro de los límites). */
export const validOrder = (price: unknown, qty: unknown): price is number =>
  Number.isSafeInteger(price) && Number.isSafeInteger(qty) && (price as number) >= 1 && (price as number) <= MAX_PRICE &&
  (qty as number) >= 1 && (qty as number) <= MAX_QTY && (price as number) * (qty as number) <= MAX_TOTAL;

/** Formato de besantes para la interfaz: "1.250 b". */
export const fmtCoins = (n: number) => n.toLocaleString("es-ES") + " b";
