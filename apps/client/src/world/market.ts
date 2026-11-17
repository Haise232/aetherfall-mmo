import * as THREE from "three";
import {
  AUCTION_COUNTER, BOARD_ITEMS, ITEMS, MARKET_ROW, MARKET_SQUARE, PRICE_BOARD, fmtCoins, type BoardRow, type MarketStall,
} from "@mmorpg/shared";
import { Character, type Look } from "../models/character";
import { Merge, TIMBER, WOOD, bannerGeo, rng, type Group } from "./kit";

// Plaza del mercado (casa de subastas): pavimento, mostrador del subastador con su balanza, tablón de precios,
// cuatro puestos, ambiente y banderolas. Todo lo estático va a dos mallas fusionadas (sólido y brillo);
// lo animado (banderolas, llamas, balanza, mercaderes) va aparte e instanciado cuando se repite.
// Nada de lo que hay a más de 0,3 m del suelo se sale de las huellas de COLLIDERS salvo lo que está en
// los bordes de la plaza (props) o a más de 2,2 m de altura (toldos, mástiles con banderolas).

const GULES = 0x7a2f3a, AZUR = 0x2c4a8a, ORO = 0xd9b13b, CREAM = 0xf2ead8, PLANK = 0x8a6a45, CRATE = 0x9a7a4e, IRON = 0x2b2b2e, BRASS = 0xc9a030;
const TOP = 0.93; // altura del tablero de los puestos
const FLAG_COLORS = [GULES, AZUR, ORO, CREAM, 0x4f8a4c, 0xd9783a];

const toWorld = (ox: number, oz: number, ry: number, x: number, z: number) => ({ x: ox + x * Math.cos(ry) + z * Math.sin(ry), z: oz - x * Math.sin(ry) + z * Math.cos(ry) });

/** Ayudante en un marco local (origen (ox,oz), giro ry): los ejes son los del objeto y se fusionan al mundo. */
function frame(M: Merge, ox: number, oz: number, ry: number) {
  const put = (group: Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, rz = 0, yaw = 0) => {
    if (rz) geo.rotateZ(rz); if (rx) geo.rotateX(rx); if (yaw) geo.rotateY(yaw);
    geo.translate(x, y, z); M.put(group, geo, color, ox, 0, oz, ry);
  };
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, rz = 0, yaw = 0, group: Group = "solid") =>
    put(group, new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, rz, yaw);
  /** Cilindro con la base en y. */
  const cyl = (rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 8, group: Group = "solid") => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); put(group, g, color, x, y, z);
  };
  /** Cilindro tumbado a lo largo de x. */
  const log = (rad: number, len: number, color: number, x: number, y: number, z: number, yaw = 0) =>
    put("solid", new THREE.CylinderGeometry(rad, rad, len, 7), color, x, y, z, 0, Math.PI / 2, yaw);
  const ball = (rad: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, group: Group = "solid") => {
    const g = new THREE.IcosahedronGeometry(rad, 0); g.scale(sx, sy, sz); put(group, g, color, x, y, z, 0, 0, yaw);
  };
  const world = (x: number, z: number) => toWorld(ox, oz, ry, x, z);
  return { put, box, cyl, log, ball, world, ox, oz, ry };
}
type Frame = ReturnType<typeof frame>;

// ---------- pavimento: una sola losa plana con la textura dibujada ----------
function pavement() {
  const { x0, x1, z0, z1 } = MARKET_SQUARE, W = x1 - x0, D = z1 - z0, PPM = 64;
  const c = document.createElement("canvas"); c.width = Math.round(W * PPM); c.height = Math.round(D * PPM);
  const g = c.getContext("2d")!, r = rng(91);
  const hex = (n: number, k = 1) => `rgb(${Math.min(255, ((n >> 16) & 255) * k)},${Math.min(255, ((n >> 8) & 255) * k)},${Math.min(255, (n & 255) * k)})`;
  const BAND = 0.9;
  for (let iz = 0; iz < Math.ceil(D); iz++) for (let ix = 0; ix < Math.ceil(W); ix++) {
    const border = ix < BAND || iz < BAND || ix >= W - BAND - 1 || iz >= D - BAND - 1;
    g.fillStyle = hex(border ? 0x8f8468 : 0xaa9e82, 0.9 + r() * 0.18);
    g.fillRect(ix * PPM, iz * PPM, PPM + 1, PPM + 1);
  }
  g.strokeStyle = "rgba(55,45,30,.38)"; g.lineWidth = 2;
  for (let i = 0; i <= Math.ceil(W); i++) { g.beginPath(); g.moveTo(i * PPM, 0); g.lineTo(i * PPM, c.height); g.stroke(); }
  for (let i = 0; i <= Math.ceil(D); i++) { g.beginPath(); g.moveTo(0, i * PPM); g.lineTo(c.width, i * PPM); g.stroke(); }
  // orla: filete de oro y otro de azur
  g.lineWidth = 5; g.strokeStyle = hex(ORO, 0.9); g.strokeRect(BAND * PPM, BAND * PPM, (W - 2 * BAND) * PPM, (D - 2 * BAND) * PPM);
  g.lineWidth = 3; g.strokeStyle = hex(AZUR); g.strokeRect((BAND - 0.18) * PPM, (BAND - 0.18) * PPM, (W - 2 * BAND + 0.36) * PPM, (D - 2 * BAND + 0.36) * PPM);
  // rosa de los vientos con la balanza en el centro (arriba del lienzo = norte = -z)
  const cx = (-12.4 - x0) * PPM, cz = (-24 - z0) * PPM;
  g.fillStyle = hex(0xd8cdb0); g.beginPath(); g.arc(cx, cz, 3.3 * PPM, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex(AZUR); g.lineWidth = 6; g.beginPath(); g.arc(cx, cz, 3.2 * PPM, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = hex(ORO, 0.9); g.lineWidth = 3; g.beginPath(); g.arc(cx, cz, 2.9 * PPM, 0, Math.PI * 2); g.stroke();
  const star = (len: number, wd: number, off: number, col: number) => {
    for (let i = 0; i < 4; i++) {
      const a = off + (i * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
      g.fillStyle = hex(col); g.beginPath();
      g.moveTo(cx + ca * len * PPM, cz + sa * len * PPM); g.lineTo(cx - sa * wd * PPM, cz + ca * wd * PPM); g.lineTo(cx, cz); g.closePath(); g.fill();
      g.fillStyle = hex(col, 0.7); g.beginPath();
      g.moveTo(cx + ca * len * PPM, cz + sa * len * PPM); g.lineTo(cx + sa * wd * PPM, cz - ca * wd * PPM); g.lineTo(cx, cz); g.closePath(); g.fill();
    }
  };
  star(1.95, 0.42, Math.PI / 4, ORO); star(2.8, 0.55, 0, GULES);
  g.fillStyle = hex(0x2a2218); g.beginPath(); g.arc(cx, cz, 0.62 * PPM, 0, Math.PI * 2); g.fill();
  g.fillStyle = hex(ORO); g.beginPath(); g.arc(cx, cz, 0.54 * PPM, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex(0x2a2218); g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.moveTo(cx, cz - 0.38 * PPM); g.lineTo(cx, cz + 0.36 * PPM); g.moveTo(cx - 0.3 * PPM, cz + 0.36 * PPM); g.lineTo(cx + 0.3 * PPM, cz + 0.36 * PPM);
  g.moveTo(cx - 0.36 * PPM, cz - 0.2 * PPM); g.lineTo(cx + 0.36 * PPM, cz - 0.2 * PPM);
  for (const s of [-1, 1]) { g.moveTo(cx + s * 0.36 * PPM, cz - 0.2 * PPM); g.lineTo(cx + s * 0.36 * PPM, cz + 0.02 * PPM); g.moveTo(cx + s * 0.22 * PPM, cz + 0.02 * PPM); g.lineTo(cx + s * 0.5 * PPM, cz + 0.02 * PPM); }
  g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  // capa de pavimento como las de lobby.ts: altura mínima y desplazamiento de profundidad para que no parpadee a lo lejos
  const mat = mesh.material as THREE.MeshStandardMaterial; mat.polygonOffset = true; mat.polygonOffsetFactor = mat.polygonOffsetUnits = -8;
  mesh.renderOrder = 0.05; mesh.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2); mesh.receiveShadow = true;
  return mesh;
}

// ---------- tablón de precios (textura que se redibuja) ----------
const BW = 1260, BH = 700;
function drawBoard(g: CanvasRenderingContext2D, rows: BoardRow[]) {
  g.clearRect(0, 0, BW, BH);
  g.fillStyle = "#1f2d2a"; g.fillRect(0, 0, BW, BH);
  g.strokeStyle = "#d9b13b"; g.lineWidth = 8; g.strokeRect(14, 14, BW - 28, BH - 28);
  g.textBaseline = "middle"; g.lineJoin = "round";
  g.textAlign = "center"; g.fillStyle = "#f5d76a"; g.font = "bold 62px Georgia, serif"; g.fillText("Precios de la subasta", BW / 2, 62);
  g.fillStyle = "#9fb4ac"; g.font = "bold 34px Georgia, serif";
  g.textAlign = "left"; g.fillText("Objeto", 60, 128);
  g.textAlign = "right"; g.fillText("Compran a", 880, 128); g.fillText("Venden a", 1200, 128);
  g.strokeStyle = "rgba(217,177,59,.6)"; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 154); g.lineTo(BW - 40, 154); g.stroke();
  const n = Math.max(1, rows.length), rh = Math.min(82, (BH - 180) / n);
  rows.forEach((row, i) => {
    const y = 160 + rh * i, cy = y + rh / 2;
    if (i % 2 === 0) { g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(34, y, BW - 68, rh); }
    g.textAlign = "left"; g.fillStyle = "#f2ead8"; g.font = `bold ${Math.round(rh * 0.62)}px Georgia, serif`;
    g.fillText(ITEMS[row.item]?.name ?? row.item, 60, cy);
    g.textAlign = "right";
    g.fillStyle = row.bestBuy !== undefined ? "#9be08a" : "#6f817a"; g.fillText(row.bestBuy !== undefined ? fmtCoins(row.bestBuy) : "—", 880, cy);
    g.fillStyle = row.bestSell !== undefined ? "#f5d76a" : "#6f817a"; g.fillText(row.bestSell !== undefined ? fmtCoins(row.bestSell) : "—", 1200, cy);
  });
}

export function createMarket(scene: THREE.Scene): { update(t: number): void; setBoard(rows: BoardRow[]): void } {
  const root = new THREE.Group(); scene.add(root);
  const M = new Merge(); M.at(-14, -24);
  const lanterns: THREE.Vector3[] = [];
  const r = rng(404);

  root.add(pavement());

  /** Farolillo de hierro que cuelga de (x,y,z) del marco (el punto es el gancho). */
  const lantern = (F: Frame, x: number, y: number, z: number) => {
    F.box(0.02, 0.14, 0.02, IRON, x, y - 0.07, z);
    F.cyl(0.0, 0.12, 0.1, IRON, x, y - 0.22, z, 4);
    F.box(0.1, 0.17, 0.1, 0xffd48a, x, y - 0.3, z, 0, 0, 0, "glow");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(0.016, 0.19, 0.016, IRON, x + sx * 0.055, y - 0.3, z + sz * 0.055);
    F.box(0.15, 0.03, 0.15, IRON, x, y - 0.405, z);
    const w = F.world(x, z); lanterns.push(new THREE.Vector3(w.x, y - 0.3, w.z));
  };

  // ============ mostrador del subastador ============
  {
    const C = AUCTION_COUNTER, F = frame(M, C.x, C.z, 0), L = C.d, hw = C.w / 2;
    F.box(C.w - 0.1, 0.95, L - 0.1, 0x7a5a38, 0, 0.475, 0);
    // tablas y entrepaños de las caras
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) F.box(0.04, 0.72, 0.9, i % 2 ? 0x8a6a45 : 0x76562f, s * (hw - 0.03), 0.47, -1.5 + i * 1.0);
      for (let i = 0; i <= 4; i++) F.box(0.05, 0.8, 0.06, TIMBER, s * (hw - 0.025), 0.47, -2.0 + i * 1.0);
      F.box(0.05, 0.1, L - 0.1, TIMBER, s * (hw - 0.025), 0.08, 0);
    }
    F.box(C.w, 0.1, L, PLANK, 0, 1.05, 0);
    F.box(0.04, 0.05, L - 0.2, BRASS, hw - 0.1, 1.105, 0); // filete de latón en el canto
    // balanza: base y columna estáticas (los brazos y platillos se animan abajo)
    F.cyl(0.16, 0.2, 0.05, BRASS, 0, 1.1, -1.05, 8); F.cyl(0.03, 0.05, 0.6, BRASS, 0, 1.15, -1.05, 6); F.ball(0.05, BRASS, 0, 1.78, -1.05);
    // libro de cuentas con su pluma
    F.box(0.46, 0.07, 0.34, GULES, 0.0, 1.135, 0.1, 0, 0, 0.35); F.box(0.42, 0.05, 0.3, CREAM, 0.0, 1.145, 0.1, 0, 0, 0.35);
    F.box(0.02, 0.06, 0.32, TIMBER, 0.0, 1.17, 0.1, 0, 0, 0.35);
    F.put("solid", new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5), CREAM, 0.2, 1.2, -0.2, 0.15, 1.35);
    // bolsas de monedas y pilas de oro
    for (const [z, k] of [[1.3, 1], [1.62, 0.8], [1.9, 0.9]] as const) {
      F.ball(0.14 * k, 0xa88c5c, 0.0, 1.2 + (k - 1) * 0.05, z, 1, 1.05, 1); F.cyl(0.03, 0.05, 0.06, 0x6b4a2b, 0.0, 1.33, z, 5);
    }
    for (let i = 0; i < 5; i++) F.cyl(0.07, 0.07, 0.018, ORO, 0.2, 1.1 + i * 0.019, -1.9, 8);
    for (let i = 0; i < 3; i++) F.cyl(0.07, 0.07, 0.018, 0xe8c85a, -0.2, 1.1 + i * 0.019, -0.45, 8);
    // campana de latón
    F.cyl(0.08, 0.08, 0.04, WOOD, 0, 1.1, 0.8, 6); F.cyl(0.015, 0.1, 0.16, BRASS, 0, 1.14, 0.8, 8); F.ball(0.02, BRASS, 0, 1.32, 0.8);
    // dosel: dos postes en los extremos, viga, tejadillo y estandartes con la balanza
    for (const s of [-1, 1]) {
      F.box(0.1, 4.0, 0.1, TIMBER, 0, 2.0, s * 1.95);
      F.box(0.08, 0.08, 0.5, TIMBER, 0, 3.5, s * 1.7, 0, 0, 0, "solid");
      lantern(F, 0.0, 3.4, s * 1.6);
    }
    F.box(0.14, 0.12, 4.1, TIMBER, 0, 3.85, 0);
    M.prism(0.9, L, 0.38, 0.14, C.x, 3.92, C.z, GULES, false, 0.05);
    F.put("solid", bannerGeo(1.5, 1.3), GULES, 0.12, 3.78, 0, 0, 0, Math.PI / 2);
    F.box(0.03, 0.06, 1.5, ORO, 0.1, 3.8, 0);
    // balanza dorada del estandarte
    const eb = (w: number, h: number, d: number, y: number, z: number) => F.box(w, h, d, ORO, 0.16, y, z);
    eb(0.02, 0.72, 0.06, 3.28, 0); eb(0.02, 0.06, 0.96, 3.5, 0); eb(0.02, 0.06, 0.4, 2.76, 0);
    for (const s of [-1, 1]) { eb(0.02, 0.4, 0.02, 3.28, s * 0.42); eb(0.02, 0.06, 0.34, 3.06, s * 0.42); }
    for (const s of [-1, 1]) {
      F.put("solid", bannerGeo(0.55, 1.0), AZUR, 0.12, 3.78, s * 1.4, 0, 0, Math.PI / 2);
      F.box(0.03, 0.1, 0.4, ORO, 0.16, 3.4, s * 1.4);
    }
  }

  // ============ tablón de precios ============
  const boardCanvas = document.createElement("canvas"); boardCanvas.width = BW; boardCanvas.height = BH;
  const bg = boardCanvas.getContext("2d")!;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 8;
  const setBoard = (rows: BoardRow[]) => { drawBoard(bg, rows); boardTex.needsUpdate = true; };
  setBoard(BOARD_ITEMS.map(item => ({ item })));
  {
    const B = PRICE_BOARD, F = frame(M, B.x, B.z, B.ry), hw = B.w / 2;
    for (const s of [-1, 1]) {
      F.box(0.2, 2.75, 0.22, WOOD, s * (hw - 0.15), 1.375, 0);
      F.box(0.3, 0.22, 0.3, 0x7d796f, s * (hw - 0.15), 0.11, 0);
      F.box(0.26, 0.1, 0.28, TIMBER, s * (hw - 0.15), 2.75, 0);
    }
    F.box(3.1, 1.7, 0.08, 0x3a2a1a, 0, 1.3, 0); // fondo
    F.box(3.1, 0.12, 0.14, TIMBER, 0, 2.2, 0); F.box(3.1, 0.12, 0.14, TIMBER, 0, 0.4, 0); // marco
    for (const s of [-1, 1]) F.box(0.1, 1.7, 0.14, TIMBER, s * 1.5, 1.3, 0);
    F.box(0.14, 0.3, 0.14, TIMBER, 0, 2.45, 0); // pie del remate
    F.box(3.0, 0.12, 0.2, TIMBER, 0, 2.62, 0);
    M.prism(0.9, 3.2, 0.34, 0.14, B.x, 2.68, B.z, GULES, true, 0.12);
    // balanza en el remate
    F.box(0.04, 0.3, 0.04, BRASS, 0, 2.5, 0.12, 0, 0, 0); F.box(0.5, 0.04, 0.04, BRASS, 0, 2.64, 0.12);
    for (const s of [-1, 1]) F.cyl(0.11, 0.05, 0.03, BRASS, s * 0.25, 2.41, 0.12, 8);
    for (const s of [-1, 1]) lantern(F, s * 1.2, 2.55, 0.22);
    // piedras y caja a los pies
    F.box(0.6, 0.28, 0.2, 0x7d796f, 0, 0.14, 0.2);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.5), new THREE.MeshStandardMaterial({
    map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.4, roughness: 0.9,
  }));
  panel.position.set(PRICE_BOARD.x, 1.3, PRICE_BOARD.z + 0.05); panel.rotation.y = PRICE_BOARD.ry; panel.receiveShadow = true;
  root.add(panel);

  // ============ puestos ============
  const vendors: { ch: Character }[] = [];
  const masts: Record<number, THREE.Vector3[]> = {};
  const VENDOR: Record<MarketStall["goods"], Look> = {
    fish: { kind: "Barbarian", show: [], tint: 0xb8d4f0 },
    ore: { kind: "Knight", show: [], tint: 0xd2a070 },
    herb: { kind: "Mage", show: ["Mage_Hat"], tint: 0xdcf0d0 },
    hide: { kind: "Rogue_Hooded", show: [], tint: 0xc9a27a },
  };
  MARKET_ROW.forEach((s, si) => {
    const F = frame(M, s.x, s.z, s.ry), { box, cyl, ball, log, put } = F, hwid = s.w / 2 - 0.1;
    const m: THREE.Vector3[] = masts[si] = [];
    // postes: traseros con mástil para las banderolas, delanteros más bajos
    for (const sx of [-1, 1]) {
      const px = sx * hwid;
      box(0.1, 3.0, 0.1, WOOD, px, 1.5, -0.8); box(0.07, 2.5, 0.07, TIMBER, px, 4.25, -0.8);
      box(0.1, 2.5, 0.1, WOOD, px, 1.25, 0.8);
      const w = F.world(px, -0.8); m.push(new THREE.Vector3(w.x, 5.4, w.z));
      lantern(F, sx * (hwid - 0.18), 2.4, 0.72);
    }
    box(s.w - 0.2, 0.08, 0.08, TIMBER, 0, 2.45, 0.8); box(s.w - 0.2, 0.08, 0.08, TIMBER, 0, 2.95, -0.8);
    // toldo a rayas con cenefa
    const N = 7, SW = s.w / N;
    for (let i = 0; i < N; i++) {
      const x = -s.w / 2 + SW * (i + 0.5), main = i % 2 === 0;
      box(SW, 0.06, 2.0, main ? s.awning : CREAM, x, 2.76, 0, 0.3);
      box(SW, 0.24, 0.05, main ? CREAM : s.awning, x, 2.34, 0.95);
    }
    // mostrador (cuerpo, faldón de tela y tablero)
    box(s.w - 0.1, 0.84, 0.78, 0x7a5a38, 0, 0.42, 0.5);
    for (let i = 0; i < 6; i++) box(0.04, 0.78, 0.03, TIMBER, -1.3 + i * 0.52, 0.42, 0.895);
    box(s.w - 0.12, 0.34, 0.03, s.awning, 0, 0.62, 0.885); box(s.w - 0.12, 0.06, 0.035, CREAM, 0, 0.44, 0.888);
    box(s.w, 0.08, 0.85, PLANK, 0, 0.89, 0.475);
    // fondo bajo y cortina
    box(s.w - 0.2, 1.0, 0.05, 0x6b4a2b, 0, 0.5, -0.86); box(s.w - 0.2, 1.1, 0.03, s.awning, 0, 2.2, -0.86);
    // enseres dentro de la huella: barril y saco en las esquinas traseras
    cyl(0.27, 0.27, 0.7, 0x7a5a38, -hwid + 0.3, 0, -0.5, 8); cyl(0.29, 0.29, 0.05, TIMBER, -hwid + 0.3, 0.14, -0.5); cyl(0.29, 0.29, 0.05, TIMBER, -hwid + 0.3, 0.5, -0.5);
    ball(0.27, 0xb89b6a, hwid - 0.3, 0.24, -0.5, 1, 0.9, 1, 0.4);

    switch (s.goods) {
      case "fish": {
        for (let i = -1; i <= 1; i++) {
          const x = i * 1.0;
          box(0.88, 0.2, 0.62, CRATE, x, TOP + 0.1, 0.48); box(0.8, 0.03, 0.54, 0xdff3ff, x, TOP + 0.21, 0.48);
          for (let k = 0; k < 4; k++) {
            const fx = x - 0.27 + (k % 2) * 0.5 + (r() - 0.5) * 0.06, fz = 0.36 + Math.floor(k / 2) * 0.24, c = [0x9fb6c8, 0x7fa0b8, 0xd98a4a, 0xb8c8d4][(k + i + 1) % 4]!;
            const yaw = (r() - 0.5) * 0.6;
            ball(0.07, c, fx, TOP + 0.27, fz, 2.4, 0.7, 0.8, yaw); ball(0.045, c, fx + Math.cos(yaw) * 0.17, TOP + 0.27, fz - Math.sin(yaw) * 0.17, 0.6, 0.8, 1.6, yaw);
          }
        }
        for (let i = 0; i < 4; i++) { // pescado colgado
          const x = -1.0 + i * 0.5; box(0.012, 0.3, 0.012, CREAM, x, 2.25, 0.78);
          ball(0.06, [0x9fb6c8, 0xd98a4a][i % 2]!, x, 1.95, 0.78, 0.7, 2.4, 0.5); ball(0.04, 0x9fb6c8, x, 1.74, 0.78, 1.5, 0.6, 0.3);
        }
        // red de pesca en el fondo y rótulo en forma de pez
        for (let i = 0; i < 7; i++) box(0.02, 1.0, 0.02, 0x8a7a55, -1.2 + i * 0.4, 1.75, -0.8);
        ball(0.2, 0x2e86c1, 0, 2.8, 0.97, 2.0, 0.9, 0.3); ball(0.1, 0x2e86c1, 0.4, 2.8, 0.97, 1.0, 1.0, 0.3, 0.4);
        break;
      }
      case "ore": {
        const lumps = [[0x222226, 0x2e2e34], [0x7b808c, 0x5a5f6a], [0xa0583a, 0x8a8f99]];
        for (let i = -1; i <= 1; i++) {
          const x = i * 1.0, cols = lumps[i + 1]!;
          cyl(0.27, 0.2, 0.3, 0x9a7a45, x, TOP, 0.48, 9); cyl(0.29, 0.29, 0.04, 0x7a5a30, x, TOP + 0.3, 0.48, 9);
          for (let k = 0; k < 7; k++) {
            const a = k * 2.4, rr = k === 6 ? 0 : 0.12;
            ball(0.07 + (k % 3) * 0.02, cols[k % 2]!, x + Math.cos(a) * rr, TOP + 0.36 + (k === 6 ? 0.06 : 0), 0.48 + Math.sin(a) * rr, 1.1, 0.9, 1.0, a);
          }
        }
        box(0.4, 0.07, 0.2, 0x8d949c, -1.35, TOP + 0.04, 0.78); box(0.4, 0.07, 0.2, 0x8d949c, -1.35, TOP + 0.11, 0.78, 0, 0, 0.15);
        ball(0.28, 0x2b2b30, hwid - 0.3, 0.24, 0.0, 1, 0.9, 1, 0.2); // saco de carbón
        // pico y pala colgados al fondo
        log(0.025, 0.9, TIMBER, -0.9, 1.8, -0.8, 0); box(0.5, 0.06, 0.05, 0x8d949c, -0.9, 2.25, -0.8, 0, 0, 0.1);
        box(0.05, 0.9, 0.04, TIMBER, 0.9, 1.8, -0.8); box(0.26, 0.3, 0.03, 0x8d949c, 0.9, 1.25, -0.8);
        box(0.5, 0.35, 0.05, 0x2b2b30, 0, 2.8, 0.97); ball(0.12, 0x8a8f99, -0.1, 2.8, 1.0, 1.2, 1, 0.5); // rótulo con mineral
        break;
      }
      case "herb": {
        const greens = [0x4f8a4c, 0x6aa84f, 0x3f7a40, 0x8ab84a];
        for (let i = 0; i < 9; i++) { // manojos colgados de la viga
          const x = -1.3 + i * 0.325, c = greens[i % 4]!, y = 2.0 - (i % 3) * 0.06;
          box(0.012, 0.28, 0.012, CREAM, x, 2.3, 0.78); box(0.03, 0.12, 0.03, 0x6b4a2b, x, y + 0.1, 0.78);
          ball(0.09, c, x, y - 0.1, 0.78, 1, 1.9, 1, i); ball(0.04, [0xb48ae0, 0xf2c14e, 0xe8a0b4][i % 3]!, x, y - 0.1, 0.87);
        }
        for (let i = 0; i < 4; i++) { // secadero trasero
          const x = -1.1 + i * 0.75; box(0.03, 0.5, 0.03, 0x6b4a2b, x, 2.4, -0.72); ball(0.1, greens[(i + 1) % 4]!, x, 2.0, -0.72, 1, 1.8, 1, i);
        }
        for (let i = 0; i < 5; i++) { // tarros
          const x = -1.35 + i * 0.28, c = [0x7ec27a, 0xd9534f, 0xb48ae0, 0xf2c14e, 0x6fb4ff][i]!;
          cyl(0.07, 0.07, 0.17, c, x, TOP, 0.72, 7); cyl(0.05, 0.05, 0.04, 0x7a5a38, x, TOP + 0.17, 0.72, 7);
        }
        for (const x of [0.35, 1.05]) { // cestas de hojas
          cyl(0.3, 0.22, 0.22, 0x9a7a45, x, TOP, 0.48, 9);
          for (let k = 0; k < 6; k++) ball(0.12, greens[k % 4]!, x + Math.cos(k * 1.1) * 0.14, TOP + 0.25, 0.48 + Math.sin(k * 1.1) * 0.14, 1, 0.7, 1, k);
        }
        ball(0.17, 0x4f8a4c, 0, 2.8, 0.97, 1, 1, 0.3); ball(0.09, 0xf2c14e, 0, 2.8, 1.02);
        break;
      }
      case "hide": {
        for (const sx of [-1, 1]) { // bastidores con pieles tendidas
          const x = sx * 0.95, c = sx < 0 ? 0x8a5a34 : 0x8d8f94;
          for (const px of [-0.5, 0.5]) box(0.06, 1.8, 0.06, WOOD, x + px, 0.9, -0.7);
          box(1.1, 0.06, 0.06, WOOD, x, 1.7, -0.7); box(1.1, 0.06, 0.06, WOOD, x, 0.55, -0.7);
          box(0.84, 1.0, 0.03, c, x, 1.12, -0.7); box(0.5, 0.5, 0.035, sx < 0 ? 0xb88a58 : 0xc5c7cc, x, 1.15, -0.7);
          for (const px of [-0.42, 0.42]) { box(0.02, 0.02, 0.02, CREAM, x + px, 1.62, -0.66); box(0.02, 0.02, 0.02, CREAM, x + px, 0.62, -0.66); }
          ball(0.06, c, x + 0.2, 0.55, -0.7, 0.5, 2.2, 0.5);
        }
        const stack = [0x8a5a34, 0xc4a77a, 0x6a6e74, 0xe8e0d0, 0x8a5a34];
        for (let i = 0; i < 5; i++) box(0.6 - i * 0.02, 0.07, 0.46, stack[i]!, -0.85, TOP + 0.035 + i * 0.07, 0.48, 0, 0, i * 0.12);
        for (let i = 0; i < 3; i++) log(0.08, 0.6, [0x8a5a34, 0x8d8f94, 0xc4a77a][i]!, 0.35, TOP + 0.08 + (i === 2 ? 0.14 : 0), 0.3 + (i % 2) * 0.2, 0.2);
        for (let i = 0; i < 3; i++) ball(0.14, [0xc4a77a, 0x8a5a34, 0xe8e0d0][i]!, 0.95 + i * 0.12, TOP + 0.1, 0.5, 1.3, 0.4, 1.1, i);
        put("solid", new THREE.BoxGeometry(0.9, 0.5, 0.04), 0x8a5a34, 0, 2.78, 0.97, 0, 0, 0); box(0.3, 0.3, 0.05, 0xc4a77a, 0, 2.78, 0.99);
        break;
      }
    }
    // mercader tras el mostrador, mirando al cliente
    const vp = F.world(0, -0.35), ch = new Character(VENDOR[s.goods], { shadow: true });
    ch.group.position.set(vp.x, 0, vp.z); ch.group.rotation.y = s.ry; scene.add(ch.group); vendors.push({ ch });
  });

  // ============ ambiente: cajas, barriles, sacos y carretilla en los bordes ============
  const crate = (x: number, z: number, ry: number, y = 0, s = 0.62) => {
    const F = frame(M, x, z, ry);
    F.box(s, s * 0.9, s, CRATE, 0, y + s * 0.45, 0);
    for (const k of [-1, 1]) F.box(s + 0.04, 0.06, 0.07, TIMBER, 0, y + s * 0.45, k * s * 0.32);
    F.box(s + 0.02, 0.05, s + 0.02, PLANK, 0, y + s * 0.9, 0);
  };
  const barrel = (x: number, z: number, c = 0x7a5a38) => {
    const F = frame(M, x, z, 0);
    F.cyl(0.3, 0.3, 0.82, c, 0, 0, 0, 9); for (const y of [0.14, 0.6]) F.cyl(0.32, 0.32, 0.05, TIMBER, 0, y, 0, 9); F.cyl(0.26, 0.26, 0.04, 0x5a3f22, 0, 0.82, 0, 9);
  };
  const sack = (x: number, z: number, c = 0xb89b6a, k = 1) => {
    const F = frame(M, x, z, 0);
    F.ball(0.3 * k, c, 0, 0.26 * k, 0, 1, 0.9, 1, x); F.ball(0.1 * k, c, 0, 0.55 * k, 0, 1, 0.8, 1);
  };
  const barrow = (x: number, z: number, ry: number) => {
    const F = frame(M, x, z, ry);
    F.box(0.8, 0.07, 0.6, 0x7a5a38, 0, 0.5, 0.0, 0.0, 0, 0); F.box(0.8, 0.22, 0.05, 0x7a5a38, 0, 0.62, 0.3); F.box(0.8, 0.22, 0.05, 0x7a5a38, 0, 0.62, -0.3);
    F.box(0.05, 0.22, 0.6, 0x7a5a38, 0.4, 0.62, 0); F.box(0.05, 0.22, 0.6, 0x7a5a38, -0.4, 0.62, 0);
    F.put("solid", new THREE.CylinderGeometry(0.24, 0.24, 0.07, 8), IRON, 0.52, 0.24, 0, Math.PI / 2, 0, 0); // rueda (eje a lo ancho)
    for (const s of [-1, 1]) { F.box(1.1, 0.045, 0.045, WOOD, -0.7, 0.5, s * 0.25, 0, 0, 0.0); F.box(0.05, 0.4, 0.05, WOOD, -0.5, 0.2, s * 0.25); }
    for (let i = 0; i < 3; i++) F.ball(0.17, [0xb89b6a, 0xa88c5c, 0xc9a84a][i]!, -0.15 + i * 0.22, 0.72, (i % 2 - 0.5) * 0.2, 1, 0.8, 1);
  };
  // detrás de los puestos del norte y del sur (fuera de sus huellas, junto al borde de la plaza)
  barrel(-14.1, -34.0); crate(-13.3, -34.0, 0.2); crate(-13.3, -34.0, 0.5, 0.56, 0.5); sack(-11.9, -34.0, 0xb89b6a); barrel(-9.6, -34.0, 0x5a4a3a); crate(-8.5, -34.0, -0.1);
  barrel(-14.1, -14.0, 0x6b4a2b); sack(-12.5, -14.0); sack(-11.9, -13.9, 0xa88c5c, 0.85); crate(-10.4, -14.0, 0.3); crate(-9.8, -13.95, 0.1, 0, 0.5); barrel(-8.4, -14.0);
  barrow(-18.4, -14.0, Math.PI / 2 + 0.4);
  // rincones junto a la fachada
  crate(-21.2, -34.0, 0.1); crate(-20.5, -34.0, 0.3); crate(-20.85, -34.0, 0.0, 0.56, 0.5); sack(-19.6, -34.0, 0xa88c5c);
  barrel(-21.2, -14.1); barrel(-20.55, -14.0, 0x5a4a3a); sack(-19.7, -14.0); crate(-21.2, -13.9, 0.2);
  // junto al tablón: sacos y cajas en el borde norte
  crate(-19.6, -34.0, 0.2, 0, 0.55);

  // ============ banderolas ============
  const lines: { a: THREE.Vector3; b: THREE.Vector3; sag: number }[] = [];
  const nl = [...masts[0]!, ...masts[1]!].sort((a, b) => a.x - b.x), sl = [...masts[2]!, ...masts[3]!].sort((a, b) => a.x - b.x);
  for (const i of [0, 1, 3]) lines.push({ a: nl[i]!, b: sl[i]!, sag: 0.55 }); // norte-sur sobre la plaza
  const wallN = new THREE.Vector3(-21.9, 5.1, -30.5), wallS = new THREE.Vector3(-21.9, 5.1, -17.5);
  lines.push({ a: wallN, b: nl[0]!, sag: 0.45 }, { a: wallS, b: sl[0]!, sag: 0.45 }); // desde la fachada del mercado
  lines.push({ a: nl[0]!, b: nl[3]!, sag: 0.4 }, { a: sl[0]!, b: sl[3]!, sag: 0.4 }); // a lo largo de cada hilera
  const pt = (l: typeof lines[number], t: number, out: THREE.Vector3) => out.lerpVectors(l.a, l.b, t).setY(THREE.MathUtils.lerp(l.a.y, l.b.y, t) - l.sag * 4 * t * (1 - t));
  // cuerdas: tramos cortos y finos
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (const l of lines) {
    const n = Math.max(6, Math.round(l.a.distanceTo(l.b) / 1.4));
    for (let i = 0; i < n; i++) {
      pt(l, i / n, tmpA); pt(l, (i + 1) / n, tmpB);
      const len = tmpA.distanceTo(tmpB), g = new THREE.BoxGeometry(0.03, 0.03, len);
      g.lookAt(tmpB.clone().sub(tmpA)); // el eje z del cuboide sigue la cuerda
      M.put("solid", g, 0x3a2a1a, (tmpA.x + tmpB.x) / 2, (tmpA.y + tmpB.y) / 2, (tmpA.z + tmpB.z) / 2);
    }
  }
  // banderines instanciados
  type Flag = { l: typeof lines[number]; t: number; ph: number };
  const flags: Flag[] = [];
  for (const l of lines) {
    const n = Math.floor(l.a.distanceTo(l.b) / 0.62);
    for (let i = 1; i < n; i++) flags.push({ l, t: i / n, ph: r() * 6.28 });
  }
  const fsh = new THREE.Shape(); fsh.moveTo(-0.22, 0); fsh.lineTo(0.22, 0); fsh.lineTo(0, -0.52); fsh.closePath();
  const flagGeo = new THREE.ExtrudeGeometry(fsh, { depth: 0.02, bevelEnabled: false }); flagGeo.translate(0, 0, -0.01);
  const flagMesh = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), flags.length);
  flagMesh.castShadow = true; flagMesh.frustumCulled = false;
  const col = new THREE.Color();
  flags.forEach((f, i) => flagMesh.setColorAt(i, col.setHex(FLAG_COLORS[i % FLAG_COLORS.length]!)));
  root.add(flagMesh);
  // llamas de los farolillos (instanciadas)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffe7a6 });
  const flames = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), flameMat, lanterns.length);
  flames.frustumCulled = false; root.add(flames);

  // ============ balanza animada y mercaderes ============
  const balPivot = new THREE.Group(); balPivot.position.set(AUCTION_COUNTER.x, 1.78, AUCTION_COUNTER.z - 1.05); root.add(balPivot);
  const pans: THREE.Group[] = [];
  {
    const Mb = new Merge(); Mb.at(-14, -24); const Fb = frame(Mb, 0, 0, 0);
    Fb.box(0.05, 0.04, 0.9, BRASS, 0, 0, 0); Fb.ball(0.04, BRASS, 0, 0, 0);
    Mb.build(balPivot, false);
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(0, 0, s * 0.45); balPivot.add(g); pans.push(g);
      const Mp = new Merge(); Mp.at(-14, -24); const Fp = frame(Mp, 0, 0, 0);
      for (const k of [-1, 1]) Fp.box(0.012, 0.36, 0.012, 0x8a7a55, 0, -0.18, k * 0.06, k * 0.4);
      Fp.cyl(0.16, 0.08, 0.05, BRASS, 0, -0.38, 0, 9);
      if (s < 0) { Fp.cyl(0.05, 0.05, 0.02, ORO, 0.0, -0.33, 0.0, 7); Fp.cyl(0.05, 0.05, 0.02, ORO, 0.04, -0.31, 0.03, 7); }
      else Fp.ball(0.07, 0x4a4a52, 0, -0.31, 0, 1, 0.9, 1);
      Mp.build(g, false);
    }
  }

  // construir mallas estáticas
  M.build(root);
  const hemi = (() => { let h: THREE.HemisphereLight | undefined; scene.traverse(o => { if (!h && (o as THREE.HemisphereLight).isHemisphereLight) h = o as THREE.HemisphereLight; }); return h; })();

  const dummy = new THREE.Object3D(), pos = new THREE.Vector3(), nxt = new THREE.Vector3();
  let last = 0;
  return {
    setBoard,
    update(t: number) {
      const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
      // balanza
      const a = Math.sin(t * 0.9) * 0.07;
      balPivot.rotation.x = a; for (const p of pans) p.rotation.x = -a;
      // banderolas: balanceo suave alrededor de la cuerda
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i]!;
        pt(f.l, f.t, pos); pt(f.l, f.t + 0.01, nxt);
        dummy.position.copy(pos); dummy.rotation.set(Math.sin(t * 1.7 + f.ph) * 0.3 + Math.sin(t * 0.6 + f.t * 9) * 0.1, -Math.atan2(nxt.z - pos.z, nxt.x - pos.x), 0, "YXZ");
        dummy.updateMatrix(); flagMesh.setMatrixAt(i, dummy.matrix);
      }
      flagMesh.instanceMatrix.needsUpdate = true;
      // llamas: parpadeo; de día casi apagadas
      const night = hemi ? THREE.MathUtils.clamp((1.0 - hemi.intensity) / 0.5, 0, 1) : 1;
      flameMat.color.setScalar(0.35 + 0.65 * night);
      lanterns.forEach((p, i) => {
        const k = 1 + Math.sin(t * 9 + i * 1.7) * 0.18 + Math.sin(t * 23 + i * 4.1) * 0.1;
        dummy.position.copy(p); dummy.rotation.set(0, 0, 0); dummy.scale.set(k * 0.9, k * 1.5, k * 0.9); dummy.updateMatrix(); flames.setMatrixAt(i, dummy.matrix);
      });
      dummy.scale.setScalar(1);
      flames.instanceMatrix.needsUpdate = true;
      for (const v of vendors) v.ch.update(dt, 0);
    },
  };
}
