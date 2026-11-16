// Minimapa circular + mapa completo (tecla M). El fondo se prerenderiza una sola vez a un canvas offscreen.
// El minimapa gira 45 grados para alinearse con la cámara isométrica (offset +70,+70,+70): la "arriba" de la
// pantalla es la dirección mundo (-1,-1) y el norte (castillo, -z) queda marcado con una "N" en el borde.
import {
  AVENUE_W, BUILDINGS, CASTLE, CASTLE_RECT, CASTLE_TOWERS, CITY_NAME, CITY_R, FIELDS, FOUNTAIN, GATE_ANGLES, GATE_NAMES,
  GATE_TOWERS, GREAT_HALL, LAKE, PLAZA_R, ROAD_W, ROCKS, STALLS, TREES, WALL_SEGMENTS, WALL_TOWERS, WINDMILLS, WORLD_HALF,
  inSafeZone,
} from "@mmorpg/shared";

export interface MapView {
  group: { position: { x: number; z: number } };
  state: { kind: string; dead: boolean; name: string };
  heading: number; // rad, 0 = +Z
}

const S = 3; // px por unidad de mundo en el fondo prerenderizado
const PAD = 10;
const OFF_SIZE = (2 * WORLD_HALF + 2 * PAD) * S;
const SQ = Math.SQRT1_2;
const css = (n: number) => "#" + n.toString(16).padStart(6, "0");
const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';

function prerender(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = OFF_SIZE;
  const g = c.getContext("2d")!;
  g.scale(S, S); g.translate(WORLD_HALF + PAD, WORLD_HALF + PAD);
  const HW = WORLD_HALF;
  // Fuera del mundo y hierba
  g.fillStyle = "#1c2417"; g.fillRect(-HW - PAD, -HW - PAD, 2 * (HW + PAD), 2 * (HW + PAD));
  g.fillStyle = "#4e6c39"; g.fillRect(-HW, -HW, 2 * HW, 2 * HW);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(90,125,60,.35)" : "rgba(50,80,38,.3)";
    g.beginPath(); g.arc((rnd() * 2 - 1) * HW, (rnd() * 2 - 1) * HW, 3 + rnd() * 9, 0, 7); g.fill();
  }
  // Campos
  for (const f of FIELDS) {
    g.fillStyle = "#c9ae4b"; g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    g.strokeStyle = "#a58c33"; g.lineWidth = 0.7;
    for (let z = f.z0 + 2; z < f.z1; z += 3) { g.beginPath(); g.moveTo(f.x0, z); g.lineTo(f.x1, z); g.stroke(); }
    g.strokeStyle = "#5b4624"; g.lineWidth = 1; g.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
  }
  // Lago
  const lg = g.createRadialGradient(LAKE.x, LAKE.z, 2, LAKE.x, LAKE.z, LAKE.r + 3);
  lg.addColorStop(0, "#2a6a9c"); lg.addColorStop(0.85, "#3b82b4"); lg.addColorStop(1, "#8aa86a");
  g.fillStyle = lg; g.beginPath(); g.arc(LAKE.x, LAKE.z, LAKE.r + 3, 0, 7); g.fill();
  g.strokeStyle = "#233f2a"; g.lineWidth = 0.8; g.beginPath(); g.arc(LAKE.x, LAKE.z, LAKE.r + 3, 0, 7); g.stroke();
  // Árboles y rocas
  g.fillStyle = "#2d4b27";
  for (const t of TREES) { g.beginPath(); g.arc(t.x, t.z, 1.5 * t.s, 0, 7); g.fill(); }
  g.fillStyle = "#8a8a86";
  for (const r of ROCKS) { g.beginPath(); g.arc(r.x, r.z, 1.1 * r.s, 0, 7); g.fill(); }
  // Caminos exteriores
  g.fillStyle = "#a99366";
  g.fillRect(CITY_R - 4, -ROAD_W / 2, HW - CITY_R + 4, ROAD_W);
  g.fillRect(-HW, -ROAD_W / 2, HW - CITY_R + 4, ROAD_W);
  g.fillRect(-ROAD_W / 2, CITY_R - 4, ROAD_W, HW - CITY_R + 4);
  // Molinos
  for (const w of WINDMILLS) {
    g.fillStyle = "#8b6a45"; g.beginPath(); g.arc(w.x, w.z, 4, 0, 7); g.fill();
    g.strokeStyle = "#eadfc0"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(w.x - 7, w.z - 7); g.lineTo(w.x + 7, w.z + 7); g.moveTo(w.x + 7, w.z - 7); g.lineTo(w.x - 7, w.z + 7); g.stroke();
  }
  // Suelo de la ciudad
  g.fillStyle = "#8f8569"; g.beginPath(); g.arc(0, 0, CITY_R, 0, 7); g.fill();
  g.fillStyle = "#c4b591";
  g.fillRect(-CITY_R, -AVENUE_W / 2, 2 * CITY_R, AVENUE_W);
  g.fillRect(-AVENUE_W / 2, CASTLE_RECT.z1, AVENUE_W, CITY_R - CASTLE_RECT.z1);
  // Plaza y fuente
  g.fillStyle = "#d6c8a2"; g.beginPath(); g.arc(0, 0, PLAZA_R, 0, 7); g.fill();
  g.strokeStyle = "#8c7a50"; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, PLAZA_R, 0, 7); g.stroke();
  g.fillStyle = "#4f93bd"; g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r + 1, 0, 7); g.fill();
  g.strokeStyle = "#e8e2d0"; g.lineWidth = 1; g.stroke();
  for (const st of STALLS) { g.fillStyle = css(st.color); g.beginPath(); g.arc(st.x, st.z, 1.7, 0, 7); g.fill(); }
  // Edificios
  for (const b of BUILDINGS) {
    const sp = b.kind !== "house";
    g.fillStyle = css(b.roof); g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    g.lineWidth = sp ? 0.9 : 0.45; g.strokeStyle = sp ? "#f0cf6a" : "rgba(30,15,5,.65)";
    g.strokeRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    if (!sp) { g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 0.35; g.beginPath(); g.moveTo(b.x - b.w / 2, b.z); g.lineTo(b.x + b.w / 2, b.z); g.stroke(); }
  }
  // Castillo
  const { x0, x1, z0, z1 } = CASTLE_RECT;
  g.fillStyle = "#9b9479"; g.fillRect(x0, z0, x1 - x0, z1 - z0);
  g.fillStyle = "#c4b591"; g.fillRect(-CASTLE.gateHalf, z1 - 3, 2 * CASTLE.gateHalf, 8);
  g.strokeStyle = "#4a4850"; g.lineWidth = CASTLE.wallT + 1;
  g.beginPath();
  g.moveTo(-CASTLE.gateHalf, z1); g.lineTo(x0, z1); g.lineTo(x0, z0); g.lineTo(x1, z0); g.lineTo(x1, z1); g.lineTo(CASTLE.gateHalf, z1);
  g.stroke();
  g.fillStyle = "#55535e"; g.fillRect(GREAT_HALL.x - GREAT_HALL.w / 2, GREAT_HALL.z - GREAT_HALL.d / 2, GREAT_HALL.w, GREAT_HALL.d);
  g.strokeStyle = "#e0c36a"; g.lineWidth = 0.7; g.strokeRect(GREAT_HALL.x - GREAT_HALL.w / 2, GREAT_HALL.z - GREAT_HALL.d / 2, GREAT_HALL.w, GREAT_HALL.d);
  for (const t of CASTLE_TOWERS) { g.fillStyle = css(t.roof); g.beginPath(); g.arc(t.x, t.z, t.r + 0.6, 0, 7); g.fill(); g.strokeStyle = "#1c1c22"; g.lineWidth = 0.6; g.stroke(); }
  // Muralla
  g.fillStyle = "#46423c";
  for (const w of WALL_SEGMENTS) { g.save(); g.translate(w.x, w.z); g.rotate(w.a); g.fillRect(-2.4, -2.3, 4.8, 4.6); g.restore(); }
  for (const t of [...WALL_TOWERS, ...GATE_TOWERS]) {
    g.fillStyle = "#6b6e76"; g.beginPath(); g.arc(t.x, t.z, t.r + 0.6, 0, 7); g.fill();
    g.fillStyle = css(t.roof); g.beginPath(); g.arc(t.x, t.z, t.r * 0.62, 0, 7); g.fill();
    g.strokeStyle = "#17171b"; g.lineWidth = 0.6; g.beginPath(); g.arc(t.x, t.z, t.r + 0.6, 0, 7); g.stroke();
  }
  // Marca de las puertas
  for (const a of GATE_ANGLES) {
    g.fillStyle = "#f0cf6a"; g.strokeStyle = "#3a2a10"; g.lineWidth = 0.6;
    g.beginPath(); g.arc(Math.cos(a) * CITY_R, Math.sin(a) * CITY_R, 2.6, 0, 7); g.fill(); g.stroke();
  }
  // Borde del mundo
  g.strokeStyle = "#caa24a"; g.lineWidth = 1.5; g.strokeRect(-HW, -HW, 2 * HW, 2 * HW);
  return c;
}

interface Label { text: string; x: number; z: number; big?: boolean; dy?: number }
const SHORT: Record<string, string> = { cathedral: "Catedral", guild: "Gremio", market: "Mercado", tavern: "Taberna", forge: "Herrería", bank: "Banco" };
const LABELS: Label[] = [
  ...GATE_ANGLES.map((a, i) => ({ text: GATE_NAMES[i]!, x: Math.cos(a) * CITY_R, z: Math.sin(a) * CITY_R })),
  { text: "Castillo", x: 0, z: -66, big: true },
  { text: "Lago", x: LAKE.x, z: LAKE.z },
];
const BIG_LABELS: Label[] = [
  ...LABELS,
  ...BUILDINGS.filter(b => b.kind !== "house").map(b => ({ text: SHORT[b.kind] ?? b.name, x: b.x, z: b.z, dy: b.kind === "cathedral" ? -24 : 0 })),
  { text: "Plaza", x: 0, z: 0 },
  ...FIELDS.map(f => ({ text: "Campos", x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 })),
];

function drawLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = "#fff6dc") {
  g.font = `bold ${size}px ${SERIF}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = Math.max(3, size / 3); g.strokeStyle = "rgba(20,10,0,.92)"; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}
function arrow(g: CanvasRenderingContext2D, x: number, y: number, ang: number, k: number) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(8 * k, 0); g.lineTo(-5.5 * k, 5.5 * k); g.lineTo(-2.5 * k, 0); g.lineTo(-5.5 * k, -5.5 * k); g.closePath();
  g.fillStyle = "#3d8bff"; g.strokeStyle = "#ffffff"; g.lineWidth = 1.6 * k; g.lineJoin = "round"; g.stroke(); g.fill();
  g.restore();
}

export function createMinimap() {
  const el = (id: string) => document.getElementById(id)!;
  const mmCanvas = el("mm-canvas") as HTMLCanvasElement, bmCanvas = el("bm-canvas") as HTMLCanvasElement;
  const zoneEl = el("mm-zone"), coordEl = el("mm-coords"), bigEl = el("bigmap"), cityEl = el("mm-city");
  cityEl.textContent = CITY_NAME;
  el("bm-title").textContent = CITY_NAME;
  const off = prerender();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const SIZE = 184, R = SIZE / 2;
  mmCanvas.width = mmCanvas.height = SIZE * dpr;
  const g = mmCanvas.getContext("2d")!;
  const gb = bmCanvas.getContext("2d")!;
  const ZOOMS = [1.1, 1.7, 2.6]; let zi = 1;
  mmCanvas.addEventListener("click", () => { zi = (zi + 1) % ZOOMS.length; });
  let bigOpen = false, lastSafe: boolean | null = null, lastCoord = "";

  function sizeBig() {
    const side = Math.max(260, Math.min(innerHeight - 150, innerWidth - 60, 800));
    bmCanvas.style.width = bmCanvas.style.height = side + "px";
    bmCanvas.width = bmCanvas.height = Math.round(side * dpr);
  }
  addEventListener("resize", () => { if (bigOpen) sizeBig(); });
  addEventListener("keydown", ev => {
    if (document.activeElement instanceof HTMLInputElement) return;
    if (ev.key === "m" || ev.key === "M") { bigOpen = !bigOpen; bigEl.style.display = bigOpen ? "flex" : "none"; if (bigOpen) sizeBig(); }
    else if (ev.key === "Escape" && bigOpen) { bigOpen = false; bigEl.style.display = "none"; }
  });

  function drawMini(mx: number, mz: number, heading: number, views: Iterable<MapView>, meView: MapView | undefined) {
    const z = ZOOMS[zi]!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.clip();
    g.fillStyle = "#1c2417"; g.fillRect(0, 0, SIZE, SIZE);
    g.translate(R, R); g.rotate(Math.PI / 4); g.scale(z, z); g.translate(-mx, -mz);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, -(WORLD_HALF + PAD), -(WORLD_HALF + PAD), 2 * (WORLD_HALF + PAD), 2 * (WORLD_HALF + PAD));
    g.restore();
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.clip();
    const sx = (x: number, zz: number) => R + z * ((x - mx) - (zz - mz)) * SQ;
    const sy = (x: number, zz: number) => R + z * ((x - mx) + (zz - mz)) * SQ;
    for (const l of LABELS) {
      const x = sx(l.x, l.z), y = sy(l.x, l.z);
      if (Math.hypot(x - R, y - R) < R - 8) drawLabel(g, l.text, x, y - (l.big ? 0 : 9), l.big ? 11 : 9.5, l.big ? "#ffe9a0" : "#fff6dc");
    }
    for (const v of views) {
      if (v === meView || v.state.dead) continue;
      const x = sx(v.group.position.x, v.group.position.z), y = sy(v.group.position.x, v.group.position.z);
      if (Math.hypot(x - R, y - R) > R - 4) continue;
      const wolf = v.state.kind === "mob";
      g.beginPath(); g.arc(x, y, wolf ? 3 : 3.4, 0, 7);
      g.fillStyle = wolf ? "#e53935" : "#f4e7a8"; g.fill(); g.lineWidth = 1.2; g.strokeStyle = "rgba(0,0,0,.85)"; g.stroke();
    }
    arrow(g, R, R, Math.atan2((Math.sin(heading) + Math.cos(heading)) * SQ, (Math.sin(heading) - Math.cos(heading)) * SQ), 1);
    g.restore();
    // N hacia el norte del mundo (-z): arriba a la derecha
    const nx = R + (R - 11) * SQ, ny = R - (R - 11) * SQ;
    g.beginPath(); g.arc(nx, ny, 8, 0, 7); g.fillStyle = "#2b1a0c"; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#d4a640"; g.stroke();
    drawLabel(g, "N", nx, ny + 0.5, 10, "#ffe9a0");
  }

  function drawBig(mx: number, mz: number, heading: number, views: Iterable<MapView>, meView: MapView | undefined) {
    const W = bmCanvas.width, k = W / (2 * (WORLD_HALF + PAD)), d = dpr;
    gb.setTransform(1, 0, 0, 1, 0, 0);
    gb.imageSmoothingEnabled = true;
    gb.drawImage(off, 0, 0, W, W);
    const px = (x: number) => (x + WORLD_HALF + PAD) * k, pz = (zz: number) => (zz + WORLD_HALF + PAD) * k;
    for (const l of BIG_LABELS) drawLabel(gb, l.text, px(l.x), pz(l.z) + (l.dy ?? 0) * d - (LABELS.includes(l) && !l.big ? 11 * d : 0), (l.big ? 15 : 11.5) * d, l.big ? "#ffe9a0" : "#fff6dc");
    for (const v of views) {
      if (v === meView || v.state.dead) continue;
      const wolf = v.state.kind === "mob";
      gb.beginPath(); gb.arc(px(v.group.position.x), pz(v.group.position.z), (wolf ? 3.2 : 4) * d, 0, 7);
      gb.fillStyle = wolf ? "#e53935" : "#f4e7a8"; gb.fill(); gb.lineWidth = 1.3 * d; gb.strokeStyle = "rgba(0,0,0,.85)"; gb.stroke();
    }
    arrow(gb, px(mx), pz(mz), Math.atan2(Math.cos(heading), Math.sin(heading)), 1.5 * d);
    // Brújula
    const cx = W - 30 * d, cy = 34 * d;
    gb.beginPath(); gb.arc(cx, cy, 16 * d, 0, 7); gb.fillStyle = "rgba(30,18,8,.85)"; gb.fill(); gb.lineWidth = 2 * d; gb.strokeStyle = "#d4a640"; gb.stroke();
    drawLabel(gb, "N", cx, cy, 15 * d, "#ffe9a0");
  }

  return {
    update(me: MapView | undefined, views: Iterable<MapView>) {
      if (!me) return;
      const mx = me.group.position.x, mz = me.group.position.z;
      const safe = inSafeZone(mx, mz);
      if (safe !== lastSafe) {
        lastSafe = safe; zoneEl.textContent = safe ? "Zona segura" : "Zona salvaje";
        zoneEl.className = safe ? "safe" : "wild";
      }
      const c = `X ${Math.round(mx)}   Z ${Math.round(mz)}`;
      if (c !== lastCoord) { lastCoord = c; coordEl.textContent = c; }
      drawMini(mx, mz, me.heading, views, me);
      if (bigOpen) drawBig(mx, mz, me.heading, views, me);
    },
  };
}
