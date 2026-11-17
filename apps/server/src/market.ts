// Casa de subastas: libro de órdenes en memoria, casado precio-tiempo y persistencia.
// Dinero: besantes (`coins`). Regla de cobros: jugador conectado = su Ent; desconectado = SQL (nunca ambos).
import {
  BOARD_ITEMS, BOOK_LEVELS, MAX_ORDERS, TRADABLE_ITEMS, fmtCoins, isTradable, listFee, npcBuyPrice, saleNet, validOrder,
  ITEMS,
} from "@mmorpg/shared";
import type { BoardRow, GameEvent, Inventory, ItemBook, MarketOrder, MkError, OrderSide, ServerMsg } from "@mmorpg/shared";
import type { CharStore, StoredOrder } from "./store";

/** Lo que el mercado necesita de un jugador conectado. */
export interface MarketPlayer { id: number; name: string; inv: Inventory; coins: number }
/** Lo que el mercado necesita de la Zone. */
export interface MarketHost {
  online(name: string): MarketPlayer | undefined;
  send(id: number, msg: ServerMsg): void;
  emit(e: GameEvent): void;
  save(p: MarketPlayer): void;
  sendInv(p: MarketPlayer): void;
}
export interface MkResult { ok: boolean; reason?: MkError; text: string }

type Order = StoredOrder;
const fail = (reason: MkError, text: string): MkResult => ({ ok: false, reason, text });
const nameOf = (item: string) => ITEMS[item]?.name ?? item;
const plural = (item: string, n: number) => `${n} ${nameOf(item)}`;

export class MarketBook {
  private byId = new Map<number, Order>();
  private byOwner = new Map<string, Map<number, Order>>();
  /** Órdenes activas (qty > 0) por objeto, ordenadas por prioridad. */
  private buys = new Map<string, Order[]>();
  private sells = new Map<string, Order[]>();
  private boardDirty = false;
  private touched = new Set<MarketPlayer>();

  constructor(private store: CharStore, private host: MarketHost) {
    for (const o of store.loadOrders()) this.index(o);
  }

  // ---- Índices ----
  private list(side: OrderSide, item: string): Order[] {
    const m = side === "buy" ? this.buys : this.sells;
    let l = m.get(item);
    if (!l) { l = []; m.set(item, l); }
    return l;
  }
  private rank(side: OrderSide) {
    return side === "buy" ? (a: Order, b: Order) => b.price - a.price || a.id - b.id : (a: Order, b: Order) => a.price - b.price || a.id - b.id;
  }
  private index(o: Order) {
    this.byId.set(o.id, o);
    let m = this.byOwner.get(o.owner);
    if (!m) { m = new Map(); this.byOwner.set(o.owner, m); }
    m.set(o.id, o);
    if (o.qty > 0) { const l = this.list(o.side, o.item); l.push(o); l.sort(this.rank(o.side)); }
  }
  private unindexActive(o: Order) {
    const l = this.list(o.side, o.item);
    const i = l.indexOf(o);
    if (i >= 0) l.splice(i, 1);
  }
  private drop(o: Order) {
    this.unindexActive(o);
    this.byId.delete(o.id);
    this.byOwner.get(o.owner)?.delete(o.id);
    this.store.deleteOrder(o.id);
  }
  private ordersOf(name: string): Order[] { return [...(this.byOwner.get(name)?.values() ?? [])].sort((a, b) => a.id - b.id); }
  private mark(item: string) { if (BOARD_ITEMS.includes(item)) this.boardDirty = true; }

  // ---- Cobros (conectado = Ent; desconectado = SQL) ----
  private credit(name: string, n: number) {
    if (n <= 0) return;
    const p = this.host.online(name);
    if (p) { p.coins += n; this.touched.add(p); } else this.store.addCoins(name, n);
  }
  private deliver(name: string, item: string, n: number) {
    const p = this.host.online(name);
    if (p) { p.inv[item] = (p.inv[item] ?? 0) + n; this.touched.add(p); } else this.store.addItems(name, item, n);
  }

  // ---- Consultas ----
  state(p: MarketPlayer): ServerMsg {
    const orders: MarketOrder[] = this.ordersOf(p.name).map(o => {
      const r: MarketOrder = { id: o.id, side: o.side, item: o.item, price: o.price, qty: o.qty, total: o.total };
      if (o.side === "buy") r.got = o.got;
      return r;
    });
    const npcBuy: Record<string, number> = {};
    for (const it of TRADABLE_ITEMS) npcBuy[it] = npcBuyPrice(it);
    return { t: "mkState", coins: p.coins, orders, npcBuy };
  }
  book(item: string): ItemBook {
    const lv = (l: Order[] | undefined) => {
      const out: { price: number; qty: number }[] = [];
      for (const o of l ?? []) {
        const last = out[out.length - 1];
        if (last && last.price === o.price) last.qty += o.qty;
        else { if (out.length >= BOOK_LEVELS) break; out.push({ price: o.price, qty: o.qty }); }
      }
      return out;
    };
    return { item, buys: lv(this.buys.get(item)), sells: lv(this.sells.get(item)) };
  }
  board(): ServerMsg {
    const rows: BoardRow[] = BOARD_ITEMS.map(item => {
      const r: BoardRow = { item };
      const b = this.buys.get(item)?.[0], s = this.sells.get(item)?.[0];
      if (b) r.bestBuy = b.price;
      if (s) r.bestSell = s.price;
      return r;
    });
    return { t: "mkBoard", rows };
  }
  /** true una sola vez tras cambiar el libro de algún objeto del tablón. */
  takeBoardDirty(): boolean { const d = this.boardDirty; this.boardDirty = false; return d; }
  /** Para pruebas y conservación: besantes retenidos en órdenes de compra. */
  heldCoins(): number { let n = 0; for (const o of this.byId.values()) if (o.side === "buy") n += o.price * o.qty; return n; }
  openCount(): number { return this.byId.size; }

  // ---- Operaciones ----
  /** Ejecuta `fn` en una transacción y, al final, guarda y avisa a todos los conectados afectados. */
  private run(p: MarketPlayer, fn: () => MkResult): MkResult {
    this.touched = new Set([p]);
    let res: MkResult;
    try {
      res = this.store.transaction(() => {
        const r = fn();
        if (r.ok) for (const t of this.touched) this.host.save(t);
        return r;
      });
    } catch (e) {
      this.touched.clear();
      throw e;
    }
    if (res.ok) for (const t of this.touched) { this.host.sendInv(t); this.host.send(t.id, this.state(t)); }
    this.touched.clear();
    return res;
  }

  /** Abrir la ventana: entrega lo comprado pendiente. */
  open(p: MarketPlayer): MkResult {
    return this.run(p, () => { this.claimAll(p); return { ok: true, text: "" }; });
  }
  claim(p: MarketPlayer): MkResult {
    return this.run(p, () => {
      const n = this.claimAll(p);
      return { ok: true, text: n > 0 ? "Has recogido lo que habías comprado." : "No tienes nada que recoger." };
    });
  }
  private claimAll(p: MarketPlayer): number {
    let n = 0;
    for (const o of this.ordersOf(p.name)) {
      if (o.side !== "buy") continue;
      if (o.got > 0) { p.inv[o.item] = (p.inv[o.item] ?? 0) + o.got; n += o.got; o.got = 0; if (o.qty > 0) this.store.updateOrder(o.id, o.qty, 0); }
      if (o.qty === 0 && o.got === 0) this.drop(o);
    }
    return n;
  }

  sellNpc(p: MarketPlayer, item: string, qty: number): MkResult {
    if (!isTradable(item)) return fail("notTradable", "El subastador no compra eso.");
    if (!validOrder(1, qty)) return fail("invalid", "Cantidad no válida.");
    if ((p.inv[item] ?? 0) < qty) return fail("noItems", `No tienes ${plural(item, qty)}.`);
    return this.run(p, () => {
      this.takeItems(p, item, qty);
      const gain = npcBuyPrice(item) * qty;
      p.coins += gain;
      return { ok: true, text: `Has vendido ${plural(item, qty)} al subastador por ${fmtCoins(gain)}.` };
    });
  }
  private takeItems(p: MarketPlayer, item: string, qty: number) {
    const left = (p.inv[item] ?? 0) - qty;
    if (left > 0) p.inv[item] = left; else delete p.inv[item];
  }

  place(p: MarketPlayer, side: OrderSide, item: string, price: number, qty: number): MkResult {
    if (side !== "buy" && side !== "sell") return fail("invalid", "Orden no válida.");
    if (!isTradable(item)) return fail("notTradable", "Ese objeto no se puede comerciar.");
    if (!validOrder(price, qty)) return fail("invalid", "Precio o cantidad no válidos.");
    if ((this.byOwner.get(p.name)?.size ?? 0) >= MAX_ORDERS) return fail("tooMany", "Ya tienes demasiadas órdenes abiertas.");
    const gross = price * qty, fee = listFee(gross);
    if (side === "sell") {
      if ((p.inv[item] ?? 0) < qty) return fail("noItems", `No tienes ${plural(item, qty)}.`);
      if (p.coins < fee) return fail("noCoins", `No tienes besantes para la tasa de publicación (${fmtCoins(fee)}).`);
    } else if (p.coins < gross + fee) return fail("noCoins", `Necesitas ${fmtCoins(gross + fee)} (${fmtCoins(gross)} más ${fmtCoins(fee)} de tasa).`);

    return this.run(p, () => {
      if (side === "sell") this.takeItems(p, item, qty); else p.coins -= gross;
      p.coins -= fee;
      const o: Order = { id: 0, owner: p.name, side, item, price, qty, total: qty, got: 0, createdAt: Date.now() };
      this.match(o);
      if (o.qty > 0 || o.got > 0) { o.id = this.store.insertOrder(o); this.index(o); }
      this.mark(item);
      const verbo = side === "sell" ? "puesto a la venta" : "puesto a la compra";
      const done = qty - o.qty;
      const tail = done === qty ? " Se ha ejecutado entera." : done > 0 ? ` Se han ejecutado ${done}.` : "";
      return { ok: true, text: `Has ${verbo} ${plural(item, qty)} a ${fmtCoins(price)}.${tail}` };
    });
  }

  /** Casa la orden entrante `o` (aún sin id) contra el libro. Al precio de la orden reposada. */
  private match(o: Order) {
    const opp = this.list(o.side === "buy" ? "sell" : "buy", o.item);
    for (let i = 0; i < opp.length && o.qty > 0;) {
      const r = opp[i]!;
      const crosses = o.side === "buy" ? o.price >= r.price : r.price >= o.price;
      if (!crosses) break; // ordenado: ninguna de las siguientes cruza
      if (r.owner === o.owner) { i++; continue; } // nunca contra uno mismo
      const units = Math.min(o.qty, r.qty), px = r.price;
      const buy = o.side === "buy" ? o : r, sell = o.side === "buy" ? r : o;
      const gross = px * units, net = saleNet(gross);
      buy.qty -= units; sell.qty -= units; buy.got += units;
      this.credit(sell.owner, net);
      this.credit(buy.owner, (buy.price - px) * units);
      const sp = this.host.online(sell.owner), bp = this.host.online(buy.owner);
      if (sp) this.host.emit({ e: "sold", to: sp.id, item: o.item, qty: units, gross, net });
      if (bp) this.host.emit({ e: "bought", to: bp.id, item: o.item, qty: units, price: px });
      if (r.qty === 0) {
        opp.splice(i, 1); // sale de la lista activa
        if (r.side === "sell") { this.drop(r); } else this.store.updateOrder(r.id, 0, r.got);
      } else { this.store.updateOrder(r.id, r.qty, r.got); i++; }
    }
  }

  cancel(p: MarketPlayer, id: number): MkResult {
    const o = Number.isSafeInteger(id) ? this.byId.get(id) : undefined;
    if (!o || o.owner !== p.name) return fail("notFound", "No encuentras esa orden.");
    return this.run(p, () => {
      if (o.side === "sell") p.inv[o.item] = (p.inv[o.item] ?? 0) + o.qty;
      else { p.coins += o.price * o.qty; if (o.got > 0) p.inv[o.item] = (p.inv[o.item] ?? 0) + o.got; }
      const text = `Has cancelado tu orden de ${o.side === "sell" ? "venta" : "compra"} de ${nameOf(o.item)}.`;
      this.drop(o);
      this.mark(o.item);
      return { ok: true, text };
    });
  }
}
