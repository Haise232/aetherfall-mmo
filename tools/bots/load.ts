// Prueba de carga: npx tsx tools/bots/load.ts [N1,N2,...] [segundos]   (por defecto 50,100,200 y 20 s)
// Arranca su propio servidor en otro puerto (PORT=8899, DB en memoria). No toca el de desarrollo.
import { spawn } from "node:child_process";
import WebSocket from "ws";

const levels = (process.argv[2] ?? "50,100,200").split(",").map(Number);
const SECS = Number(process.argv[3] ?? 20);
const PORT = Number(process.env.LOAD_PORT ?? 8899);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

async function runLevel(n: number) {
  const srv = spawn(process.execPath, ["--import", "tsx", "apps/server/src/main.ts"], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: ":memory:", DEBUG_TICK: "1" }, stdio: ["ignore", "pipe", "inherit"],
  });
  const stats: any[] = [];
  let ready: () => void; const up = new Promise<void>(r => (ready = r));
  srv.stdout!.on("data", d => {
    for (const l of String(d).split("\n")) {
      if (l.includes("Servidor en")) ready();
      if (l.startsWith("TICKSTAT ")) stats.push(JSON.parse(l.slice(9)));
    }
  });
  await up;
  let rxBytes = 0, rxSnaps = 0, open = 0;
  const bots: WebSocket[] = [], timers: NodeJS.Timeout[] = [];
  for (let i = 0; i < n; i++) {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    bots.push(ws);
    let me = 0, mx = 0, mz = 0; let wolves: { id: number; x: number; z: number }[] = [];
    ws.on("open", () => {
      open++;
      ws.send(JSON.stringify({ t: "join", name: `Bot${i}_${Date.now() % 100000}` }));
      timers.push(setInterval(() => {
        if (ws.readyState !== ws.OPEN) return;
        const outside = Math.hypot(mx, mz) > 134;
        const w = wolves.length ? wolves[Math.floor(Math.random() * wolves.length)] : null;
        if (w && Math.random() < 0.3 && outside) ws.send(JSON.stringify({ t: "attack", target: w.id }));
        else if (w && Math.random() < 0.25) ws.send(JSON.stringify({ t: "moveTo", x: w.x, z: w.z })); // acercarse a lobos
        else { const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 180; ws.send(JSON.stringify({ t: "moveTo", x: Math.cos(a) * r, z: Math.sin(a) * r })); }
      }, rnd(1500, 3500)));
    });
    ws.on("message", raw => {
      const s = raw.toString(); rxBytes += s.length;
      const m = JSON.parse(s);
      if (m.t === "welcome") me = m.id;
      else if (m.t === "snapshot") {
        rxSnaps++;
        wolves = []; for (const e of m.entities) { if (e.id === me) { mx = e.x; mz = e.z; } else if (e.kind === "mob" && !e.dead) wolves.push(e); }
      }
    });
    ws.on("error", () => {});
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 100)); // rampa
  }
  await new Promise(r => setTimeout(r, 3000));
  stats.length = 0; rxBytes = 0; rxSnaps = 0;           // descarta calentamiento
  await new Promise(r => setTimeout(r, SECS * 1000));
  const sample = stats.slice();
  const avg = (k: string) => sample.reduce((a, s) => a + s[k], 0) / (sample.length || 1);
  const res = {
    bots: n, connected: open, avgTickMs: +avg("avgMs").toFixed(2), p95TickMs: +avg("p95Ms").toFixed(2),
    maxTickMs: Math.max(0, ...sample.map(s => s.maxMs)), serverCpuPct: +avg("cpuPct").toFixed(1), rssMB: Math.round(avg("rssMB")),
    snapshotBytesAvg: rxSnaps ? Math.round(rxBytes / rxSnaps) : 0, outKBs_server: Math.round(avg("outKBs")),
    snapsPerClientPerSec: +(rxSnaps / n / SECS).toFixed(1), over50ms: Math.max(0, ...sample.map(s => s.maxMs)) > 50,
  };
  console.log(JSON.stringify(res));
  timers.forEach(clearInterval); bots.forEach(b => b.terminate()); srv.kill();
  await new Promise(r => setTimeout(r, 500));
  return res;
}

for (const n of levels) await runLevel(n);
process.exit(0);
