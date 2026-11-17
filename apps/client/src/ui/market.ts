// Casa de subastas: ventana con la lista de objetos comerciables, el libro de órdenes, el formulario de compra/venta
// y tus órdenes. El servidor es autoritativo: aquí solo se validan los datos para avisar pronto; manda su `mkResult`.
import {
  BOOK_LEVELS, ITEMS, LIST_FEE, MAX_ORDERS, MAX_PRICE, MAX_QTY, SALE_TAX, TRADABLE_ITEMS,
  fmtCoins, listFee, npcBuyPrice, saleNet, validOrder,
  type ClientMsg, type InvState, type ItemBook, type MarketOrder, type OrderSide, type ServerMsg,
} from "@mmorpg/shared";
import { TIER, icon, itemEdge } from "./inventory";

type Tab = "buy" | "sell" | "orders";
type StateMsg = Extract<ServerMsg, { t: "mkState" }>;
type ResultMsg = Extract<ServerMsg, { t: "mkResult" }>;

const CATS: { id: string; label: string; cats: string[] }[] = [
  { id: "all", label: "Todo", cats: [] },
  { id: "fish", label: "Pescado", cats: ["fish"] },
  { id: "ore", label: "Mineral", cats: ["ore"] },
  { id: "herb", label: "Hierbas", cats: ["herb"] },
  { id: "hide", label: "Pieles y trofeos", cats: ["hide", "trophy"] },
];
const CAT_ORDER = ["fish", "ore", "herb", "hide", "trophy"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const nameOf = (id: string) => ITEMS[id]?.name ?? id;

export function createMarket(send: (m: ClientMsg) => void, onClose: () => void = () => {}) {
  const root = document.createElement("div");
  root.id = "market"; root.hidden = true;
  root.innerHTML = `
    <div class="mk-win" role="dialog" aria-modal="true" aria-labelledby="mk-h">
      <div class="mk-rod"></div>
      <header class="mk-head">
        <h2 id="mk-h">Casa de subastas</h2>
        <p class="mk-coins">Saldo <b></b></p>
        <button type="button" class="mk-x" aria-label="Cerrar la casa de subastas">×</button>
      </header>
      <div class="mk-body">
        <aside class="mk-side" aria-label="Objetos comerciables">
          <input type="search" class="mk-search" placeholder="Buscar objeto" aria-label="Buscar objeto" autocomplete="off">
          <div class="mk-cats" role="group" aria-label="Categoría"></div>
          <div class="mk-list"></div>
        </aside>
        <section class="mk-main">
          <div class="mk-tabs" role="tablist" aria-label="Operación">
            <button type="button" role="tab" data-tab="buy">Comprar</button>
            <button type="button" role="tab" data-tab="sell">Vender</button>
            <button type="button" role="tab" data-tab="orders">Mis órdenes</button>
          </div>
          <div class="mk-trade">
            <p class="mk-none">Elige un objeto de la lista para ver su libro de órdenes.</p>
            <div class="mk-item" hidden></div>
            <div class="mk-book" hidden></div>
            <form class="mk-form" novalidate hidden>
              <div class="mk-fields">
                <label>Precio por unidad (b)<input name="price" type="number" inputmode="numeric" min="1" max="${MAX_PRICE}" step="1"></label>
                <label>Cantidad<span class="mk-qtyrow"><input name="qty" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" step="1"><button type="button" class="mk-all">Todo</button></span></label>
              </div>
              <div class="mk-quick"><button type="button" class="mk-match"></button></div>
              <dl class="mk-sum"></dl>
              <p class="mk-warn" aria-live="polite"></p>
              <div class="mk-go"><button type="submit" class="mk-ok"></button><button type="button" class="mk-npc"></button></div>
            </form>
          </div>
          <div class="mk-orders" hidden></div>
        </section>
      </div>
      <footer class="mk-foot"><p class="mk-msg" role="status" aria-live="polite"></p><span><kbd>Esc</kbd> cierra</span></footer>
    </div>`;
  document.body.append(root);

  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const coinsEl = q(".mk-coins b"), search = q<HTMLInputElement>(".mk-search"), catsEl = q(".mk-cats"), listEl = q(".mk-list");
  const tabsEl = q(".mk-tabs"), tradeEl = q(".mk-trade"), noneEl = q(".mk-none"), itemEl = q(".mk-item"), bookEl = q(".mk-book");
  const form = q<HTMLFormElement>(".mk-form"), priceIn = form.elements.namedItem("price") as HTMLInputElement, qtyIn = form.elements.namedItem("qty") as HTMLInputElement;
  const allBtn = q<HTMLButtonElement>(".mk-all"), matchBtn = q<HTMLButtonElement>(".mk-match"), sumEl = q(".mk-sum"), warnEl = q(".mk-warn");
  const okBtn = q<HTMLButtonElement>(".mk-ok"), npcBtn = q<HTMLButtonElement>(".mk-npc");
  const ordersEl = q(".mk-orders"), msgEl = q(".mk-msg");

  // ---- estado ----
  let coins = 0, orders: MarketOrder[] = [], npcBuy: Record<string, number> = {};
  let have: Record<string, number> = {};
  let tab: Tab = "buy", cat = "all", sel: string | null = null, book: ItemBook | null = null, pending = false, pendingTimer = 0;

  const haveOf = (id: string) => have[id] ?? 0;
  const claimable = () => orders.reduce((n, o) => n + (o.got ?? 0), 0);
  const side = (): OrderSide => (tab === "sell" ? "sell" : "buy");

  // ---- cabecera y filtros ----
  function renderHead() { coinsEl.textContent = fmtCoins(coins); }
  catsEl.innerHTML = CATS.map(c => `<button type="button" data-cat="${c.id}">${c.label}</button>`).join("");
  function renderCats() { for (const b of Array.from(catsEl.querySelectorAll<HTMLElement>("button"))) b.setAttribute("aria-pressed", String(b.dataset.cat === cat)); }

  function renderList() {
    const f = document.activeElement as HTMLElement | null;
    const keep = f && listEl.contains(f) ? f.dataset.item : undefined;
    const allowed = CATS.find(c => c.id === cat)?.cats ?? [];
    const term = norm(search.value.trim());
    const ids = TRADABLE_ITEMS.filter(id => (!allowed.length || allowed.includes(ITEMS[id]?.cat ?? "")) && (!term || norm(nameOf(id)).includes(term)))
      .sort((a, b) => CAT_ORDER.indexOf(ITEMS[a]?.cat ?? "") - CAT_ORDER.indexOf(ITEMS[b]?.cat ?? "") || (ITEMS[a]?.tier ?? 0) - (ITEMS[b]?.tier ?? 0)
        || nameOf(ITEMS[a]?.base ?? a).localeCompare(nameOf(ITEMS[b]?.base ?? b), "es") || (ITEMS[a]?.rarity ?? 0) - (ITEMS[b]?.rarity ?? 0)); // cada recurso seguido de sus rarezas
    listEl.innerHTML = ids.length ? ids.map(id => {
      const d = ITEMS[id], n = haveOf(id);
      return `<button type="button" class="mk-row${id === sel ? " sel" : ""}${n ? "" : " zero"}" data-item="${id}" aria-pressed="${id === sel}" style="--t:${itemEdge(d)}" aria-label="${nameOf(id)}, tienes ${n}">${icon(d, 28)}<span class="nm">${nameOf(id)}</span><span class="have">${n}</span></button>`;
    }).join("") : `<p class="mk-empty">Ningún objeto coincide.</p>`;
    if (keep) listEl.querySelector<HTMLElement>(`[data-item="${keep}"]`)?.focus();
  }

  // ---- pestañas ----
  function renderTabs() {
    const n = orders.length, got = claimable() > 0;
    for (const b of Array.from(tabsEl.querySelectorAll<HTMLButtonElement>("button"))) {
      const t = b.dataset.tab as Tab;
      b.setAttribute("aria-selected", String(t === tab)); b.tabIndex = t === tab ? 0 : -1;
      if (t === "orders") b.innerHTML = `Mis órdenes${n ? ` <span class="cnt">${n}</span>` : ""}${got ? `<span class="dot" title="Tienes compras por recoger"></span>` : ""}`;
    }
    tradeEl.hidden = tab === "orders"; ordersEl.hidden = tab !== "orders";
  }

  // ---- libro ----
  function renderItem() {
    const has = !!sel;
    noneEl.hidden = has; itemEl.hidden = bookEl.hidden = form.hidden = !has;
    if (!sel) return;
    const d = ITEMS[sel], n = haveOf(sel);
    itemEl.innerHTML = `${icon(d, 40)}<div><b>${nameOf(sel)}</b><span>Tienes <i>${n}</i> · El subastador paga <i>${fmtCoins(npcBuy[sel] ?? npcBuyPrice(sel))}</i> por unidad</span></div>`;
  }

  function renderBook() {
    if (!sel) return;
    const b = book && book.item === sel ? book : null;
    const col = (title: string, kind: "sells" | "buys", lv: { price: number; qty: number }[] | undefined) => {
      const max = Math.max(1, ...(lv ?? []).map(l => l.qty));
      const rows: string[] = [];
      for (let i = 0; i < BOOK_LEVELS; i++) {
        const l = lv?.[i];
        rows.push(l
          ? `<button type="button" class="mk-lv" data-price="${l.price}" style="--w:${Math.max(6, Math.round((l.qty / max) * 100))}%" aria-label="${title}: ${l.qty} a ${fmtCoins(l.price)} cada uno. Usar este precio"><span class="p">${fmtCoins(l.price)}</span><span class="q">×${l.qty}</span></button>`
          : `<span class="mk-lv void" aria-hidden="true">${i === 0 && b ? "Vacío" : "·"}</span>`);
      }
      return `<div class="mk-col ${kind}"><h3>${title}</h3>${rows.join("")}</div>`;
    };
    bookEl.innerHTML = b
      ? `${col("Ventas", "sells", b.sells)}${col("Compras", "buys", b.buys)}`
      : `<p class="mk-loading">Consultando el libro…</p>`;
  }

  // ---- formulario ----
  function renderForm() {
    if (!sel || tab === "orders") return;
    const s = side(), isSell = s === "sell";
    const price = num(priceIn.value), qty = num(qtyIn.value), n = haveOf(sel);
    const valid = validOrder(price, qty);
    const total = valid ? price * qty : 0, fee = valid ? listFee(total) : 0;
    const b = book && book.item === sel ? book : null;

    let warn = "";
    if (priceIn.value.trim() !== "" && qtyIn.value.trim() !== "" && !valid) warn = `El precio va de 1 a ${MAX_PRICE.toLocaleString("es-ES")} b, la cantidad de 1 a ${MAX_QTY.toLocaleString("es-ES")}, ambos enteros, y el total no puede ser desorbitado.`;
    else if (valid && isSell && qty > n) warn = n ? `Solo tienes ${n}.` : "No tienes ninguno de este objeto.";
    else if (valid && !isSell && total + fee > coins) warn = `Te faltan ${fmtCoins(total + fee - coins)}.`;
    warnEl.textContent = warn;

    const row = (k: string, v: string, cls = "") => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    const dash = "—";
    sumEl.innerHTML = isSell
      ? row("Total de la venta", valid ? fmtCoins(total) : dash)
        + row(`Tasa de publicación (${Math.round(LIST_FEE * 100)} %)`, valid ? fmtCoins(fee) : dash)
        + row(`Cobrarías (tras el ${Math.round(SALE_TAX * 100)} % de impuesto)`, valid ? fmtCoins(saleNet(total)) : dash, "big")
      : row("Total de la compra", valid ? fmtCoins(total) : dash)
        + row(`Tasa de publicación (${Math.round(LIST_FEE * 100)} %)`, valid ? fmtCoins(fee) : dash)
        + row("Pagarías en total", valid ? fmtCoins(total + fee) : dash, "big");

    // igualar el mejor precio del otro lado
    const best = isSell ? b?.buys[0]?.price : b?.sells[0]?.price;
    matchBtn.textContent = (isSell ? "Igualar mejor compra" : "Igualar mejor venta") + (best ? ` (${fmtCoins(best)})` : "");
    matchBtn.disabled = !best; matchBtn.dataset.price = best ? String(best) : "";

    allBtn.hidden = !isSell;
    okBtn.textContent = isSell ? "Publicar orden de venta" : "Publicar orden de compra";
    okBtn.disabled = pending || !valid || !!warn;

    npcBtn.hidden = !isSell;
    if (isSell) {
      const p = npcBuy[sel] ?? npcBuyPrice(sel), okQty = Number.isSafeInteger(qty) && qty >= 1 && qty <= Math.min(n, MAX_QTY);
      npcBtn.textContent = `Vender al subastador ya${okQty ? `: ${qty} × ${fmtCoins(p)} = ${fmtCoins(p * qty)}` : ` (${fmtCoins(p)} c/u)`}`;
      npcBtn.disabled = pending || !okQty;
    }
  }

  // ---- mis órdenes ----
  function renderOrders() {
    const got = claimable();
    const rows = orders.map(o => {
      const d = ITEMS[o.item], buy = o.side === "buy";
      return `<li><span class="sd ${o.side}">${buy ? "Compra" : "Venta"}</span>${icon(d, 26)}<span class="nm">${nameOf(o.item)}</span>
        <span class="pr">${fmtCoins(o.price)} <small>c/u</small></span><span class="qt">${o.qty} / ${o.total}</span>
        <span class="gt${o.got ? " has" : ""}">${buy ? (o.got ? `Por recoger: ${o.got}` : "Nada por recoger") : ""}</span>
        <button type="button" class="mk-cancel" data-order="${o.id}" aria-label="Cancelar la orden de ${buy ? "compra" : "venta"} de ${nameOf(o.item)}">Cancelar</button></li>`;
    });
    ordersEl.innerHTML = `
      <div class="mk-ohead"><h3>Mis órdenes <small>${orders.length} de ${MAX_ORDERS}</small></h3>
        <button type="button" class="mk-claim"${got ? "" : " disabled"}>${got ? `Recoger lo comprado (${got})` : "Nada que recoger"}</button></div>
      ${rows.length ? `<ul class="mk-olist">${rows.join("")}</ul>` : `<p class="mk-none">No tienes órdenes abiertas. Elige un objeto y publica una orden de compra o de venta.</p>`}
      <p class="mk-note">La tasa de publicación no se devuelve al cancelar. Lo comprado se recoge aquí, junto al subastador.</p>`;
  }

  function renderAll() { renderHead(); renderCats(); renderList(); renderTabs(); renderItem(); renderBook(); renderForm(); renderOrders(); }

  // ---- acciones ----
  function say(text: string, ok: boolean) { msgEl.textContent = text; msgEl.className = "mk-msg " + (text ? (ok ? "ok" : "bad") : ""); }
  function busy(on: boolean) { pending = on; clearTimeout(pendingTimer); if (on) pendingTimer = window.setTimeout(() => { pending = false; renderForm(); }, 4000); }
  function select(id: string) {
    if (sel === id) return;
    sel = id; book = null; say("", true);
    const n = haveOf(id);
    priceIn.value = String(ITEMS[id]?.basePrice ?? 1); qtyIn.value = String(tab === "sell" ? Math.max(1, Math.min(n, 1)) : 1);
    renderList(); renderItem(); renderBook(); renderForm();
    send({ t: "mkBook", item: id });
  }
  function setTab(t: Tab) {
    if (t === tab) return;
    tab = t; say("", true);
    renderTabs(); renderForm();
  }

  catsEl.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-cat]"); if (!b) return;
    cat = b.dataset.cat!; renderCats(); renderList();
  });
  search.addEventListener("input", renderList);
  listEl.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-item]"); if (b) select(b.dataset.item!); });
  tabsEl.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]"); if (b) setTab(b.dataset.tab as Tab); });
  bookEl.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-price]"); if (!b) return;
    priceIn.value = b.dataset.price!; renderForm(); priceIn.focus();
  });
  form.addEventListener("input", renderForm);
  matchBtn.addEventListener("click", () => { if (matchBtn.dataset.price) { priceIn.value = matchBtn.dataset.price; renderForm(); } });
  allBtn.addEventListener("click", () => { if (sel) { qtyIn.value = String(Math.max(1, Math.min(haveOf(sel), MAX_QTY))); renderForm(); } });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const price = num(priceIn.value), qty = num(qtyIn.value);
    if (!sel || pending || okBtn.disabled || !validOrder(price, qty)) return;
    busy(true); say("Publicando la orden…", true); renderForm();
    send({ t: "mkPlace", side: side(), item: sel, price, qty });
  });
  npcBtn.addEventListener("click", () => {
    const qty = num(qtyIn.value);
    if (!sel || pending || npcBtn.disabled || !Number.isSafeInteger(qty)) return;
    busy(true); say("Vendiendo al subastador…", true); renderForm();
    send({ t: "mkSellNpc", item: sel, qty });
  });
  ordersEl.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>("[data-order]");
    if (c) { send({ t: "mkCancel", order: Number(c.dataset.order) }); say("Cancelando la orden…", true); return; }
    if (t.closest(".mk-claim")) { send({ t: "mkClaim" }); say("Recogiendo lo comprado…", true); }
  });
  q(".mk-x").addEventListener("click", () => api.close());

  // el teclado y el ratón no llegan al juego mientras la ventana está abierta (igual que el diálogo del gremio)
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) root.addEventListener(t, e => {
    e.stopPropagation();
    if (t !== "keydown") return;
    const k = e as KeyboardEvent;
    if (k.key === "Escape") { k.preventDefault(); api.close(); return; }
    if (k.key === "Tab") { // el foco se queda dentro de la ventana
      const f = Array.from(root.querySelectorAll<HTMLElement>("button, input")).filter(x => !(x as HTMLButtonElement).disabled && x.tabIndex >= 0 && x.offsetParent !== null);
      const first = f[0], last = f[f.length - 1];
      if (first && last) {
        if (k.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { k.preventDefault(); last.focus(); }
        else if (!k.shiftKey && document.activeElement === last) { k.preventDefault(); first.focus(); }
      }
      return;
    }
    const a = document.activeElement as HTMLElement | null;
    if ((k.key === "ArrowDown" || k.key === "ArrowUp") && a && (listEl.contains(a) || (a === search && k.key === "ArrowDown"))) {
      const rows = Array.from(listEl.querySelectorAll<HTMLElement>(".mk-row")); if (!rows.length) return;
      k.preventDefault();
      const i = rows.indexOf(a), next = a === search ? 0 : i + (k.key === "ArrowDown" ? 1 : -1);
      if (next < 0) search.focus(); else rows[Math.min(next, rows.length - 1)]?.focus();
    } else if ((k.key === "ArrowLeft" || k.key === "ArrowRight") && a && tabsEl.contains(a)) {
      const ts = Array.from(tabsEl.querySelectorAll<HTMLButtonElement>("button")), i = ts.indexOf(a as HTMLButtonElement);
      const n = ts[(i + (k.key === "ArrowRight" ? 1 : ts.length - 1)) % ts.length];
      if (n) { k.preventDefault(); setTab(n.dataset.tab as Tab); n.focus(); }
    }
  });
  root.addEventListener("pointerdown", e => { if (e.target === root) api.close(); }); // clic fuera de la ventana

  const api = {
    get open() { return !root.hidden; },
    /** Abre la ventana y pide el estado al servidor. */
    show() {
      if (!root.hidden) return;
      root.hidden = false; say("", true);
      send({ t: "mkOpen" });
      renderAll();
      setTimeout(() => search.focus(), 30);
    },
    close() {
      if (root.hidden) return;
      root.hidden = true; busy(false);
      onClose();
    },
    /** Mochila del personaje: cuántos tienes de cada objeto (y saldo, si viene). */
    setInventory(inv: InvState) {
      have = inv.inv;
      if (inv.coins !== undefined) coins = inv.coins;
      if (root.hidden) return;
      renderHead(); renderList(); renderItem(); renderForm();
    },
    setState(m: StateMsg) {
      coins = m.coins; orders = m.orders; npcBuy = m.npcBuy;
      if (root.hidden) return;
      renderHead(); renderTabs(); renderItem(); renderForm(); renderOrders();
    },
    setBook(b: ItemBook) {
      if (b.item !== sel) return;
      book = b;
      if (!root.hidden) { renderBook(); renderForm(); }
    },
    setResult(r: ResultMsg) {
      busy(false);
      say(r.text ?? (r.ok ? "Hecho." : "No se pudo completar la operación."), r.ok);
      if (r.ok && sel && !root.hidden) send({ t: "mkBook", item: sel }); // el libro ha cambiado
      if (!root.hidden) renderForm();
    },
  };
  return api;
}
