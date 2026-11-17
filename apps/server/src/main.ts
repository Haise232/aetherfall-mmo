import { WebSocketServer, type WebSocket } from "ws";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { TICK_MS, type ClientMsg, type ServerMsg } from "@mmorpg/shared";
import { Zone } from "./zone";
import { SqliteStore } from "./store";
import { clientDir, createHttp } from "./http";

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0"; // detrás de Cloudflare Tunnel conviene HOST=127.0.0.1 (nadie entra sin pasar por el túnel)
const DEBUG_TICK = process.env.DEBUG_TICK === "1";
/** Límites de conexiones simultáneas: en total y por dirección IP. */
const MAX_CONN = Number(process.env.MAX_CONN) || 200, MAX_PER_IP = Number(process.env.MAX_PER_IP) || 6;
const sockets = new Map<number, WebSocket>();
let bytesOut = 0, msgsOut = 0, snapBytes = 0, snapMsgs = 0;
const send = (id: number, msg: ServerMsg) => {
  const s = JSON.stringify(msg);
  if (DEBUG_TICK) { bytesOut += s.length; msgsOut++; if (msg.t === "snapshot") { snapBytes += s.length; snapMsgs++; } }
  sockets.get(id)?.send(s);
};
const store = new SqliteStore(process.env.DB_PATH || undefined);
// En el servidor real hay que iniciar sesión; ALLOW_GUEST=1 deja entrar sin cuenta (solo para pruebas locales con bots).
const zone = new Zone(send, store, process.env.ALLOW_GUEST !== "1");
if (process.env.ALLOW_GUEST === "1") console.log("AVISO: ALLOW_GUEST=1, se puede entrar sin cuenta.");

// Una sola puerta: HTTP sirve la página compilada y el mismo puerto acepta el WebSocket del juego (en /ws o en /).
const root = clientDir();
const http = createHttp(root);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const perIp = new Map<string, number>();
/** IP real del jugador: detrás de Cloudflare llega en CF-Connecting-IP (solo se cree si la conexión viene del propio equipo, que es el túnel). */
function ipOf(req: import("node:http").IncomingMessage) {
  const remote = req.socket.remoteAddress ?? "?", local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const cf = req.headers["cf-connecting-ip"];
  return local && typeof cf === "string" && cf ? cf : remote;
}
http.on("upgrade", (req, socket, head) => {
  const path = (req.url ?? "/").split("?")[0];
  const ip = ipOf(req);
  if ((path !== "/ws" && path !== "/") || sockets.size >= MAX_CONN || (perIp.get(ip) ?? 0) >= MAX_PER_IP) {
    socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req, ip));
});

const alive = new WeakSet<WebSocket>();
wss.on("connection", (ws: WebSocket, _req: unknown, ip: string) => {
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  alive.add(ws); ws.on("pong", () => alive.add(ws));
  const id = zone.connect();
  sockets.set(id, ws);
  zone.welcome(id);
  ws.on("message", raw => {
    try { zone.handle(id, JSON.parse(raw.toString()) as ClientMsg); } catch { /* mensaje inválido: ignorar */ }
  });
  ws.on("close", () => {
    sockets.delete(id); zone.disconnect(id);
    const n = (perIp.get(ip) ?? 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
  });
});
// conexiones muertas (el jugador cerró el portátil, se cortó la red): sin respuesta al ping en 30 s, fuera
setInterval(() => { for (const ws of wss.clients) { if (!alive.has(ws)) { ws.terminate(); continue; } alive.delete(ws); ws.ping(); } }, 30_000);

// ---- Copias de seguridad: una al arrancar y otra cada día; se guardan las últimas BACKUP_KEEP ----
const BACKUP_DIR = process.env.BACKUP_DIR || "data/backups", BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 14;
function backup() {
  if (process.env.DB_PATH === ":memory:") return;
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"), file = join(BACKUP_DIR, `game-${stamp}.db`);
    rmSync(file, { force: true }); store.backup(file);
    const old = readdirSync(BACKUP_DIR).filter(f => /^game-\d{4}-\d\d-\d\d-\d\d-\d\d\.db$/.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - BACKUP_KEEP))) rmSync(join(BACKUP_DIR, f), { force: true });
    console.log(`Copia de seguridad: ${file}`);
  } catch (e) { console.error("Fallo en la copia de seguridad:", e); }
}
backup();
setInterval(backup, 24 * 3600_000);

let tick: NodeJS.Timeout;
if (DEBUG_TICK) {
  // Mide step() (incluye serialización y envío). Imprime cada 5 s una línea JSON.
  const times: number[] = [];
  let last = process.cpuUsage(), lastT = Date.now();
  tick = setInterval(() => { const t0 = performance.now(); zone.step(); times.push(performance.now() - t0); }, TICK_MS);
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
} else tick = setInterval(() => zone.step(), TICK_MS);

// Apagado limpio (systemctl stop, Ctrl+C): se guarda a todos los conectados antes de salir.
let stopping = false;
function shutdown(sig: string) {
  if (stopping) return; stopping = true;
  console.log(`${sig}: guardando ${sockets.size} jugador(es) y cerrando…`);
  clearInterval(tick);
  for (const [id, ws] of sockets) { zone.disconnect(id); ws.close(1012, "Reinicio del servidor"); }
  sockets.clear();
  http.close(); store.close();
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

http.listen(PORT, HOST, () => console.log(`Servidor en http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT} ${root ? `(página: ${root})` : "(sin página compilada: solo WebSocket)"}`));
