// Guion de pruebas de la casa de subastas: npx tsx tools/bots/market-check.ts
import { rmSync } from "node:fs";
import { Zone } from "../../apps/server/src/zone";
import { SqliteStore } from "../../apps/server/src/store";
import { listFee, saleNet, npcBuyPrice, npcOf, MARKET_RATE_MS, MAX_ORDERS } from "@mmorpg/shared";
import type { ClientMsg, ServerMsg } from "@mmorpg/shared";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "OK  " : "FALLO"} ${name}${extra ? "  " + extra : ""}`); if (!ok) fails++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const au = npcOf("auctioneer")!;

type Rig = { z: Zone; msgs: Map<number, ServerMsg[]>; ents: () => Map<number, any> };
function rig(store: SqliteStore): Rig {
  const msgs = new Map<number, ServerMsg[]>();
  const z = new Zone((id, m) => { (msgs.get(id) ?? msgs.set(id, []).get(id)!).push(m); }, store);
  return { z, msgs, ents: () => (z as any).ents };
}
function login(r: Rig, name: string, near = true): number {
  const id = r.z.connect(); r.z.handle(id, { t: "join", name });
  if (!r.ents().get(id).persistent) r.z.handle(id, { t: "create", cls: "knight", style: 0, tone: 0 });
  const e = r.ents().get(id);
  if (near) { e.x = e.tx = au.x + 2; e.z = e.tz = au.z; }
  return id;
}
/** Envía un mensaje, espera el rate limit y devuelve el último mkResult. */
async function op(r: Rig, id: number, m: ClientMsg) {
  await sleep(MARKET_RATE_MS + 20);
  const arr = r.msgs.get(id) ?? []; const from = arr.length;
  r.z.handle(id, m);
  const res = (r.msgs.get(id) ?? []).slice(from).reverse().find(x => x.t === "mkResult") as Extract<ServerMsg, { t: "mkResult" }> | undefined;
  return res;
}
const ent = (r: Rig, id: number) => r.ents().get(id);
const orders = (r: Rig, id: number) => ((r.msgs.get(id) ?? []).filter(x => x.t === "mkState").pop() as any)?.orders ?? [];
const total = (rs: Rig[], ids: number[][], held: () => number) => { let t = held(); rs.forEach((r, i) => ids[i]!.forEach(id => t += ent(r, id).coins)); return t; };

async function main() {
  const r = rig(new SqliteStore(":memory:"));
  const A = login(r, "Ana"), B = login(r, "Beto"), C = login(r, "Carla", false);
  const ea = ent(r, A), eb = ent(r, B), ec = ent(r, C);
  ec.x = ec.tx = au.x + 50;
  const book = (r.z as any).market;

  // (1) sin stock
  let res = await op(r, A, { t: "mkPlace", side: "sell", item: "trout", price: 6, qty: 5 });
  check("1 vender sin stock da noItems", res?.ok === false && res.reason === "noItems", JSON.stringify(res));

  // (2)(3) venta reposada a 6, compra cruzada a 10
  ea.inv.trout = 5; ea.coins = 100; eb.coins = 1000;
  const before = total([r], [[A, B, C]], () => book.heldCoins());
  res = await op(r, A, { t: "mkPlace", side: "sell", item: "trout", price: 6, qty: 5 });
  const feeA = listFee(30);
  check("2a venta publicada", res?.ok === true, res?.text);
  check("3a tasa de publicación exacta", ea.coins === 100 - feeA && ea.inv.trout === undefined, `coins=${ea.coins} fee=${feeA}`);
  res = await op(r, B, { t: "mkPlace", side: "buy", item: "trout", price: 10, qty: 5 });
  const feeB = listFee(50);
  check("2b compra cruzada ejecutada", res?.ok === true, res?.text);
  check("2c se ejecuta al precio de la venta y se devuelve la diferencia", eb.coins === 1000 - 30 - feeB, `coins=${eb.coins} esperado=${1000 - 30 - feeB}`);
  check("3b impuesto exacto al vendedor", ea.coins === 100 - feeA + saleNet(30), `coins=${ea.coins} esperado=${100 - feeA + saleNet(30)}`);
  const ob = orders(r, B).find((o: any) => o.side === "buy");
  check("2d lo comprado queda en got", ob?.got === 5 && ob.qty === 0, JSON.stringify(ob));
  const evs = (r.z as any).events as any[];
  check("2e eventos sold (vendedor) y bought (comprador)", evs.some(e => e.e === "sold" && e.to === A && e.qty === 5 && e.gross === 30 && e.net === saleNet(30)) && evs.some(e => e.e === "bought" && e.to === B && e.qty === 5 && e.price === 6), JSON.stringify(evs));
  await op(r, B, { t: "mkClaim" });
  check("2f recoger pasa al inventario y borra la orden", eb.inv.trout === 5 && orders(r, B).length === 0, `trout=${eb.inv.trout}`);
  const after = total([r], [[A, B, C]], () => book.heldCoins());
  check("6a conservación (solo tasas e impuestos)", before - after === feeA + feeB + (30 - saleNet(30)), `antes=${before} despues=${after} perdido=${before - after} esperado=${feeA + feeB + 30 - saleNet(30)}`);

  // (4) cancelar
  ea.inv.coal = 4; ea.coins = 500; eb.coins = 500;
  const c0 = ea.coins;
  await op(r, A, { t: "mkPlace", side: "sell", item: "coal", price: 9, qty: 4 });
  const oid = orders(r, A)[0]?.id;
  res = await op(r, A, { t: "mkCancel", order: oid });
  check("4a cancelar venta devuelve objetos (la tasa no)", res?.ok === true && ea.inv.coal === 4 && ea.coins === c0 - listFee(36), `coal=${ea.inv.coal} coins=${ea.coins}`);
  const b0 = eb.coins;
  await op(r, B, { t: "mkPlace", side: "buy", item: "coal", price: 3, qty: 10 });
  const bid = orders(r, B)[0]?.id;
  check("4b compra retiene besantes", eb.coins === b0 - 30 - listFee(30), `coins=${eb.coins}`);
  res = await op(r, B, { t: "mkCancel", order: bid });
  check("4c cancelar compra devuelve retenidos", res?.ok === true && eb.coins === b0 - listFee(30), `coins=${eb.coins}`);
  res = await op(r, A, { t: "mkCancel", order: bid });
  check("4d no se puede cancelar lo ajeno / inexistente", res?.reason === "notFound");

  // (5) lejos
  res = await op(r, C, { t: "mkPlace", side: "buy", item: "trout", price: 1, qty: 1 });
  check("5 lejos del subastador da far", res?.ok === false && res.reason === "far", JSON.stringify(res));
  ec.x = ec.tx = au.x + 2;
  res = await op(r, C, { t: "mkOpen" });
  check("5b rate limit", (() => { r.z.handle(C, { t: "mkClaim" }); const l = (r.msgs.get(C) ?? []).filter(x => x.t === "mkResult").pop() as any; return l?.reason === "rate"; })());

  // (7) malformadas
  ea.inv.trout = 50; ea.coins = 100000;
  const snapA = JSON.stringify([ea.inv, ea.coins]);
  const bad: any[] = [
    { side: "sell", item: "trout", price: -1, qty: 1 }, { side: "sell", item: "trout", price: 1.5, qty: 1 },
    { side: "sell", item: "trout", price: NaN, qty: 1 }, { side: "sell", item: "trout", price: "9", qty: 1 },
    { side: "sell", item: "__proto__", price: 5, qty: 1 }, { side: "sell", item: "trout", price: 5, qty: 1e9 },
    { side: "sell", item: "trout", price: 5, qty: "2" }, { side: "sell", item: "trout", price: Infinity, qty: 1 },
    { side: "xx", item: "trout", price: 5, qty: 1 }, { side: "sell", item: "iron_sword", price: 5, qty: 1 }, { side: "sell", item: 7, price: 5, qty: 1 },
  ];
  let allBad = true;
  for (const b of bad) { const x = await op(r, A, { t: "mkPlace", ...b }); if (x?.ok !== false) { allBad = false; console.log("   aceptado:", JSON.stringify(b)); } }
  const x1 = await op(r, A, { t: "mkSellNpc", item: "__proto__", qty: 1 });
  const x2 = await op(r, A, { t: "mkSellNpc", item: "trout", qty: -3 });
  const x3 = await op(r, A, { t: "mkCancel", order: "1" as any });
  const x4 = await op(r, A, { t: "mkCancel", order: 1.5 });
  check("7 entradas malformadas rechazadas sin tocar saldo ni objetos", allBad && !x1?.ok && !x2?.ok && !x3?.ok && !x4?.ok && JSON.stringify([ea.inv, ea.coins]) === snapA);
  const cc = ea.coins; res = await op(r, A, { t: "mkSellNpc", item: "trout", qty: 2 });
  check("7b venta al subastador", res?.ok === true && ea.coins === cc + 2 * npcBuyPrice("trout") && ea.inv.trout === 48, `coins=${ea.coins}`);

  // (8) no casa contra uno mismo
  ea.coins = 100000; ea.inv.trout = 10;
  await op(r, A, { t: "mkPlace", side: "sell", item: "trout", price: 5, qty: 3 });
  res = await op(r, A, { t: "mkPlace", side: "buy", item: "trout", price: 8, qty: 3 });
  const mine = orders(r, A);
  check("8 no casa contra uno mismo", res?.ok === true && mine.some((o: any) => o.side === "sell" && o.qty === 3) && mine.some((o: any) => o.side === "buy" && o.qty === 3 && o.got === 0), JSON.stringify(mine));
  // tooMany
  ea.coins = 1e7; ea.inv.iron_ore = 1000;
  let last: any;
  for (let i = 0; i < MAX_ORDERS + 1; i++) last = await op(r, A, { t: "mkPlace", side: "sell", item: "iron_ore", price: 100 + i, qty: 1 });
  check("8b MAX_ORDERS da tooMany", last?.reason === "tooMany");

  // (6b) conservación con muchas operaciones cruzadas entre A, B
  const reg: Rig[] = [r];
  const D = login(r, "Dora"), E = login(r, "Elio");
  ent(r, E).coins = 100000; ent(r, E).inv.wolf_pelt = 20; ent(r, D).inv.wolf_pelt = 20; ent(r, D).coins = 100000;
  const t0 = total(reg, [[A, B, C, D, E]], () => book.heldCoins());
  let fees = 0, taxSeen = 0;
  const evs2 = (r.z as any).events as any[]; evs2.length = 0;
  const rp = async (who: number, side: "buy" | "sell", price: number, qty: number) => {
    const e = ent(r, who), c = e.coins; const x = await op(r, who, { t: "mkPlace", side, item: "wolf_pelt", price, qty });
    if (x?.ok) fees += listFee(price * qty);
    for (const e of evs2) if (e.e === "sold") taxSeen += e.gross - e.net;
    evs2.length = 0; return c;
  };
  const taxBefore = () => 0; void taxBefore;
  // recuento de impuestos por diferencia: se calcula con el saldo total al final
  await rp(D, "sell", 20, 4); await rp(E, "sell", 18, 6); await rp(D, "buy", 25, 7); await rp(E, "buy", 17, 3); await rp(E, "sell", 17, 5); await rp(D, "buy", 19, 10);
  const t1 = total(reg, [[A, B, C, D, E]], () => book.heldCoins());
  const taxes = t0 - t1 - fees;
  check("6b conservación tras varias operaciones: lo perdido = tasas + impuestos", taxes === taxSeen && taxSeen > 0, `perdido=${t0 - t1} tasas=${fees} impuestos=${taxes} vistos=${taxSeen}`);

  // (9) persistencia en archivo
  const file = "/tmp/claude-1000/-home-haise-Codigos-aetherfall-mmo/125b65ab-3797-41f0-8765-7e8f2b2be90c/scratchpad/market-check.db";
  for (const s of ["", "-wal", "-shm"]) rmSync(file + s, { force: true });
  const r1 = rig(new SqliteStore(file));
  const S = login(r1, "Vende"), K = login(r1, "Compra");
  ent(r1, S).inv.trout = 10; ent(r1, S).coins = 200; ent(r1, K).coins = 500;
  await op(r1, S, { t: "mkPlace", side: "sell", item: "trout", price: 7, qty: 10 });
  await op(r1, K, { t: "mkPlace", side: "buy", item: "iron_ore", price: 4, qty: 5 });
  const coinsS = ent(r1, S).coins, coinsK = ent(r1, K).coins;
  const r2 = rig(new SqliteStore(file));
  const S2 = login(r2, "Vende"), K2 = login(r2, "Compra");
  const os = orders(r2, S2), ok2 = orders(r2, K2);
  await op(r2, S2, { t: "mkOpen" }); await op(r2, K2, { t: "mkOpen" });
  const os2 = orders(r2, S2), ok3 = orders(r2, K2);
  check("9 órdenes y saldos sobreviven a una Zone nueva", os2.length === 1 && os2[0].qty === 10 && ok3.length === 1 && ok3[0].price === 4 && ent(r2, S2).coins === coinsS && ent(r2, K2).coins === coinsK, `S=${ent(r2, S2).coins}/${coinsS} K=${ent(r2, K2).coins}/${coinsK}`);
  void os; void ok2;

  // (10) vendedor desconectado cobra al reconectar (misma Zone r2: S2 se va, K2 compra)
  r2.z.disconnect(S2);
  ent(r2, K2).coins = 1000;
  res = await op(r2, K2, { t: "mkPlace", side: "buy", item: "trout", price: 7, qty: 4 });
  const gain = saleNet(28);
  check("10a compra contra vendedor desconectado", res?.ok === true && ent(r2, K2).coins === 1000 - 28 - listFee(28), res?.text);
  const S3 = login(r2, "Vende");
  check("10b el vendedor cobra al reconectar", ent(r2, S3).coins === coinsS + gain, `coins=${ent(r2, S3).coins} esperado=${coinsS + gain}`);
  const sold = (r2.msgs.get(S3) ?? []).filter(x => x.t === "inv").pop() as any;
  check("10c el saldo llega en inv", sold?.coins === coinsS + gain);
  // comprador desconectado recibe objetos al reconectar tras reclamar
  r2.z.disconnect(K2);
  const K3 = login(r2, "Compra");
  await op(r2, K3, { t: "mkOpen" });
  check("10d comprador reconectado recoge lo comprado al abrir", ent(r2, K3).inv.trout === 4, `trout=${ent(r2, K3).inv.trout}`);

  console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
  process.exit(fails ? 1 : 0);
}
main();
