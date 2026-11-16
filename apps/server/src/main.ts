import { WebSocketServer, type WebSocket } from "ws";
import { TICK_MS, type ClientMsg, type ServerMsg } from "@mmorpg/shared";
import { Zone } from "./zone";
import { SqliteStore } from "./store";

const PORT = Number(process.env.PORT) || 8787;
const DEBUG_TICK = process.env.DEBUG_TICK === "1";
const sockets = new Map<number, WebSocket>();
let bytesOut = 0, msgsOut = 0, snapBytes = 0, snapMsgs = 0;
const send = (id: number, msg: ServerMsg) => {
  const s = JSON.stringify(msg);
  if (DEBUG_TICK) { bytesOut += s.length; msgsOut++; if (msg.t === "snapshot") { snapBytes += s.length; snapMsgs++; } }
  sockets.get(id)?.send(s);
};
const zone = new Zone(send, new SqliteStore(process.env.DB_PATH || undefined));
const wss = new WebSocketServer({ port: PORT, maxPayload: 1024 });

wss.on("connection", ws => {
  const id = zone.connect();
  sockets.set(id, ws);
  zone.welcome(id);
  ws.on("message", raw => {
    try { zone.handle(id, JSON.parse(raw.toString()) as ClientMsg); } catch { /* mensaje inválido: ignorar */ }
  });
  ws.on("close", () => { sockets.delete(id); zone.disconnect(id); });
});

if (DEBUG_TICK) {
  // Mide step() (incluye serialización y envío). Imprime cada 5 s una línea JSON.
  const times: number[] = [];
  let last = process.cpuUsage(), lastT = Date.now();
  setInterval(() => { const t0 = performance.now(); zone.step(); times.push(performance.now() - t0); }, TICK_MS);
  setInterval(() => {
    const s = [...times].sort((a, b) => a - b); times.length = 0;
    const cpu = process.cpuUsage(last), now = Date.now(), dt = (now - lastT) / 1000;
    last = process.cpuUsage(); lastT = now;
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    console.log("TICKSTAT " + JSON.stringify({
      clients: sockets.size, ticks: s.length, avgMs: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(2),
      p95Ms: +q(0.95).toFixed(2), maxMs: +(s[s.length - 1] ?? 0).toFixed(2),
      cpuPct: +(((cpu.user + cpu.system) / 1000) / (dt * 10)).toFixed(1), rssMB: Math.round(process.memoryUsage().rss / 1048576),
      outKBs: Math.round(bytesOut / 1024 / dt), snapAvgB: snapMsgs ? Math.round(snapBytes / snapMsgs) : 0,
    }));
    bytesOut = msgsOut = snapBytes = snapMsgs = 0;
  }, 5000);
} else setInterval(() => zone.step(), TICK_MS);
console.log(`Servidor en ws://localhost:${PORT}`);
