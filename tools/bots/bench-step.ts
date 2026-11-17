// Microbenchmark en proceso de Zone.step() sin red: npx tsx tools/bots/bench-step.ts
import { Zone } from "../../apps/server/src/zone";
import { SqliteStore } from "../../apps/server/src/store";
let bytes = 0, msgs = 0;
for (const n of [25, 50, 100, 200, 300]) {
  const z = new Zone((_id, m) => { const s = JSON.stringify(m); if (m.t === "snapshot") { bytes += s.length; msgs++; } }, new SqliteStore(":memory:"));
  const ids: number[] = [];
  for (let i = 0; i < n; i++) { const id = z.connect(); ids.push(id); z.handle(id, { t: "join", name: "B" + i }); z.handle(id, { t: "create", cls: "knight", style: 0, tone: 0 }); }
  const run = (k: number) => { const t: number[] = []; for (let i = 0; i < k; i++) {
    if (i % 20 === 0) for (const id of ids) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 180; z.handle(id, { t: "moveTo", x: Math.cos(a) * r, z: Math.sin(a) * r }); }
    const t0 = performance.now(); z.step(); t.push(performance.now() - t0); } return t; };
  run(20); bytes = msgs = 0;
  const t = run(60).sort((a, b) => a - b);
  console.log(JSON.stringify({ players: n, avgMs: +(t.reduce((a, b) => a + b) / t.length).toFixed(2), p95Ms: +t[56].toFixed(2), maxMs: +t[59].toFixed(2), snapBytes: Math.round(bytes / msgs), bandwidthMBs: +(bytes / 60 * 20 / 1048576).toFixed(1) }));
}
