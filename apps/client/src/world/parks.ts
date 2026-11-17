import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CLASSES, DAY_CYCLE_SEC, DISTRICTS, PARKS, PARK_GATE, PARK_PROPS, PARK_RING, PLAZA_BENCH_PROPS, SEATS, TONES, TOWNSFOLK_SEATS,
  type LookSel, type ParkDef, type ParkProp,
} from "@mmorpg/shared";
import { Character, playerLook } from "../models/character";
import { createBubble } from "./bubble";
import { Merge, STONE, STONE_D, STONE_L, WARM, archWallGeo, hash2, pennantGeo, rng } from "./kit";

// Parques de los barrios: césped y caminos (una losa con textura dibujada por parque), setos con arcos de entrada,
// árboles, bancos, mesas, macizos, farolas, el elemento central de cada parque, un letrero con su nombre y los vecinos
// que le dan vida. Todo lo sólido se dibuja dentro de la huella de su pieza en PARK_PROPS (que es la que usa el servidor
// para chocar); lo que sobresale está por debajo de 0,5 m o por encima de 2,2 m. Lo repetido (árboles, bancos, mesas)
// va instanciado; lo demás, fusionado por parque (`Merge`).

const IRON = 0x26302a, PLASTER = 0xe8e2d2, ROOF_RED = 0x8f3d2b, BRONZE = 0x7b9a82, GOLD = 0xd9b13b;
const HEDGE = 0x356b31, HEDGE_TOP = 0x437d38;
const FAR_SHOW = 70, FAR_BUILD = 100, FAR_ANIM = 90, SAY_RANGE = 34;

// ---------- geometría con color por vértice para instanciar ----------
type Part = [THREE.BufferGeometry, number, number?, number?, number?, number?];
function colorParts(parts: Part[], aoH = 1.2) {
  const out = parts.map(([g, hex, x = 0, y = 0, z = 0, ry = 0]) => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute("uv");
    const c = new THREE.Color(hex), n = ng.attributes.position!.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = 0.74 + 0.26 * Math.min(1, Math.max(0, ng.attributes.position!.getY(i) / aoH));
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    ng.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return ng;
  });
  return mergeGeometries(out)!;
}
const vcMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ball = (r: number, detail = 0, sx = 1, sy = 1, sz = 1) => { const g = new THREE.IcosahedronGeometry(r, detail); g.scale(sx, sy, sz); return g; };
/** Cilindro con la base en y = 0. */
const cyl = (rt: number, rb: number, h: number, seg = 7) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return g; };

interface Item { x: number; y?: number; z: number; ry?: number; s?: number; c?: number }
const dummy = new THREE.Object3D();
function instanced(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[]) {
  if (!items.length) return;
  const im = new THREE.InstancedMesh(geo, mat, items.length), col = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y ?? 0, it.z); dummy.rotation.set(0, it.ry ?? 0, 0); dummy.scale.setScalar(it.s ?? 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
    if (it.c !== undefined) im.setColorAt(i, col.setHex(it.c));
  });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im);
}

// ---------- modelos instanciados ----------
/** Banco de madera y hierro de 1,6 m, mira a +z (asiento a 0,45 m). */
function benchGeo() {
  const W1 = 0x8a5f34, W2 = 0x7a5230, P: Part[] = [];
  for (const z of [-0.14, 0.0, 0.14]) P.push([box(1.6, 0.05, 0.125), W1, 0, 0.45, z]);
  for (const y of [0.64, 0.8]) P.push([box(1.6, 0.12, 0.04), W2, 0, y, -0.25]);
  for (const s of [-1, 1]) {
    P.push([box(0.06, 0.45, 0.46), IRON, s * 0.72, 0.225, 0]); // costado
    P.push([box(0.05, 0.9, 0.05), IRON, s * 0.72, 0.45, -0.25]); // montante del respaldo
    P.push([box(0.06, 0.05, 0.4), IRON, s * 0.72, 0.66, 0.02]); // reposabrazos
    P.push([ball(0.06, 0), IRON, s * 0.72, 0.93, -0.25]);
  }
  return colorParts(P, 1.0);
}
/** Mesa de merienda: tablero a lo largo de z (2,3 m) y dos bancos pegados a los lados (x ±0,75). */
function tableGeo() {
  const P: Part[] = [[box(0.8, 0.06, 2.3), 0x9a7448, 0, 0.78, 0]];
  for (const z of [-0.85, 0.85]) {
    P.push([box(0.6, 0.05, 0.08), 0x6b4a2b, 0, 0.7, z]);
    for (const s of [-1, 1]) {
      P.push([box(0.06, 0.78, 0.06), 0x6b4a2b, s * 0.3, 0.39, z]);
      P.push([box(0.28, 0.05, 2.2), 0x8a6238, s * 0.75, 0.45, 0]);
      P.push([box(0.05, 0.45, 0.2), 0x6b4a2b, s * 0.75, 0.225, z]);
    }
  }
  return colorParts(P, 1.0);
}
/** Tilo: tronco liso y copa redonda y densa. La copa empieza a 2 m (el servidor solo choca con el tronco). */
function lindenGeo() {
  const G = [0x5f9d44, 0x72b04f, 0x4f8c3c, 0x86bd58];
  return colorParts([
    [cyl(0.2, 0.3, 2.5, 7), 0x5c4630], [ball(1.9, 1, 1, 0.85, 1), G[0]!, 0, 3.9, 0], [ball(1.35, 0, 1, 0.9, 1), G[1]!, 1.35, 3.5, 0.4], [ball(1.3, 0, 1, 0.9, 1), G[2]!, -1.2, 3.55, -0.5],
    [ball(1.2, 0, 1, 0.9, 1), G[3]!, 0.2, 4.7, -0.9], [ball(1.1, 0, 1, 0.9, 1), G[1]!, -0.4, 3.45, 1.35],
  ], 6);
}
/** Cerezo en flor: tronco torcido y copa ancha y plana, de rosa. */
function cherryGeo() {
  const K = [0xf0a8c0, 0xf7c4d4, 0xe88ab0, 0xfbd7e2];
  const lean = cyl(0.14, 0.24, 1.9, 6); lean.rotateZ(0.2); lean.translate(0, 0.8, 0);
  const lean2 = cyl(0.1, 0.16, 1.2, 6); lean2.rotateZ(-0.5); lean2.translate(0.3, 2.35, 0);
  return colorParts([
    [cyl(0.2, 0.3, 1.0, 7), 0x4a3a30], [lean, 0x4a3a30], [lean2, 0x4a3a30],
    [ball(1.6, 1, 1.2, 0.7, 1.2), K[0]!, 0.1, 3.5, 0], [ball(1.3, 0, 1.1, 0.75, 1.1), K[1]!, 1.6, 3.2, 0.5], [ball(1.25, 0, 1.1, 0.75, 1.1), K[2]!, -1.5, 3.3, -0.4],
    [ball(1.1, 0, 1, 0.75, 1), K[3]!, 0.3, 3.6, 1.5], [ball(1.0, 0, 1, 0.75, 1), K[1]!, -0.3, 3.15, -1.5],
  ], 6);
}

// ---------- texto del letrero ----------
function signTexture(p: ParkDef) {
  const W = 1024, H = 234, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!, r = rng(p.x * 7 + 3), col = DISTRICTS[p.district].color;
  const hex = (n: number, k = 1) => `rgb(${Math.min(255, ((n >> 16) & 255) * k)},${Math.min(255, ((n >> 8) & 255) * k)},${Math.min(255, (n & 255) * k)})`;
  g.fillStyle = hex(0x7a5530); g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 8) { g.fillStyle = hex(0x7a5530, 0.88 + r() * 0.24); g.fillRect(0, y, W, 8); }
  g.strokeStyle = "rgba(30,18,8,.35)"; g.lineWidth = 3;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (i * H) / 5); g.lineTo(W, (i * H) / 5); g.stroke(); }
  g.fillStyle = hex(col); g.fillRect(0, 0, W, 40); g.fillRect(0, H - 40, W, 40);
  g.fillStyle = hex(0xe8c860); g.fillRect(0, 40, W, 6); g.fillRect(0, H - 46, W, 6);
  g.lineWidth = 14; g.strokeStyle = hex(0x3a2616); g.strokeRect(7, 7, W - 14, H - 14);
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  let size = 100; g.font = `bold ${size}px Georgia, serif`;
  const maxW = W - 120; while (g.measureText(p.name).width > maxW && size > 40) { size -= 4; g.font = `bold ${size}px Georgia, serif`; }
  g.lineWidth = 14; g.strokeStyle = "rgba(25,14,6,.9)"; g.strokeText(p.name, W / 2, H / 2 - 22);
  g.fillStyle = "#f3e7c6"; g.fillText(p.name, W / 2, H / 2 - 22);
  g.font = "italic 46px Georgia, serif"; g.lineWidth = 8; g.strokeStyle = "rgba(25,14,6,.85)";
  const sub = DISTRICTS[p.district].name; g.strokeText(sub, W / 2, H - 64); g.fillStyle = "#e8c860"; g.fillText(sub, W / 2, H - 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- suelo del parque: césped, caminos de grava y paseo circular en una sola textura ----------
const treeKind = (p: ParkProp, park: ParkDef) => (hash2(p.x * 1.3, p.z * 0.7) < ({ claustro: 0.8, gremios: 0.25, olmo: 0.4, artesanos: 0.55 }[park.id] ?? 0.5) ? 1 : 0); // 1 = cerezo
const PATH_HALF = 1.5, RING_IN = PARK_RING - 1.0, RING_OUT = PARK_RING + 1.0;

function groundTexture(p: ParkDef, props: ParkProp[]) {
  const PPM = 32, S = 28, N = S * PPM, CELL = 6, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d")!, r = rng(Math.abs(p.x * 13 + p.z * 7) | 0), half = p.size / 2;
  const hex = (n: number, k: number) => `rgb(${Math.min(255, ((n >> 16) & 255) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`;
  const inner = p.feature === "oldtree" ? 2 : 1; // 1 grava, 2 tierra
  /** 0 césped, 1 grava, 2 tierra del olmo. */
  const kind = (dx: number, dz: number) => {
    const rad = Math.hypot(dx, dz);
    if (rad < RING_IN) return inner;
    if (rad <= RING_OUT) return 1;
    if (Math.abs(dx) <= PATH_HALF || Math.abs(dz) <= PATH_HALF) return 1;
    return 0;
  };
  for (let cy = 0; cy < N; cy += CELL) for (let cx = 0; cx < N; cx += CELL) {
    const dx = (cx + CELL / 2) / PPM - S / 2, dz = (cy + CELL / 2) / PPM - S / 2;
    const k = kind(dx, dz), inLawn = Math.abs(dx) <= half + 0.05 && Math.abs(dz) <= half + 0.05;
    if (!inLawn && k !== 1) continue; // fuera del parque solo queda el tramo de camino que sale a la calle
    if (!inLawn && Math.abs(dx) > half + 1.2 && Math.abs(dz) > half + 1.2) continue;
    let fill: string;
    if (k === 0) { const stripe = Math.floor((dx + dz + 40) / 2.2) % 2; fill = hex(stripe ? 0x5c9446 : 0x66a04c, 0.94 + r() * 0.12); }
    else if (k === 2) fill = hex(0x7a6040, 0.88 + r() * 0.22);
    else {
      const e = 0.2, edge = kind(dx + e, dz) !== 1 || kind(dx - e, dz) !== 1 || kind(dx, dz + e) !== 1 || kind(dx, dz - e) !== 1;
      fill = edge && inLawn ? hex(0x8a8168, 0.9 + r() * 0.15) : hex(0xb9ac8c, 0.88 + r() * 0.2);
    }
    g.fillStyle = fill; g.fillRect(cx, cy, CELL, CELL);
  }
  // detalles sueltos: flores en el césped, pétalos y hojas caídas bajo los árboles
  const dot = (dx: number, dz: number, col: string, s = 4) => { g.fillStyle = col; g.fillRect((dx + S / 2) * PPM - s / 2, (dz + S / 2) * PPM - s / 2, s, s); };
  const flowers = ["#f4f4ee", "#f2d24e", "#f08aa0", "#b69cf0"];
  for (let i = 0; i < 260; i++) {
    const dx = (r() - 0.5) * (p.size - 1.2), dz = (r() - 0.5) * (p.size - 1.2);
    if (kind(dx, dz) !== 0 || kind(dx + 0.5, dz + 0.5) !== 0 || kind(dx - 0.5, dz - 0.5) !== 0) continue;
    dot(dx, dz, flowers[Math.floor(r() * flowers.length)]!, 3 + (r() < 0.3 ? 2 : 0));
  }
  for (const q of props) if (q.kind === "tree") {
    const cherry = treeKind(q, p) === 1, s = q.s ?? 1;
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.283, d = 0.5 + Math.sqrt(r()) * 2.1 * s, dx = q.x + Math.cos(a) * d - p.x, dz = q.z + Math.sin(a) * d - p.z;
      if (Math.abs(dx) > half - 0.4 || Math.abs(dz) > half - 0.4 || kind(dx, dz) === 1) continue;
      dot(dx, dz, cherry ? (r() < 0.5 ? "#f6bfd0" : "#ee94b2") : (r() < 0.5 ? "#c9c35a" : "#8fb04a"), 4);
    }
  }
  if (p.feature === "oldtree") for (let i = 0; i < 120; i++) { // hojarasca del olmo
    const a = r() * 6.283, d = 1.4 + r() * 3.1; dot(Math.cos(a) * d, Math.sin(a) * d, r() < 0.5 ? "#a8843a" : "#6e5a30", 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 8;
  return t;
}

// ---------- ambiente: vecinos ----------
type FolkKind = "sit" | "floor" | "lie" | "chat" | "walk";
interface Folk {
  kind: FolkKind; x: number; z: number; ry: number; look: LookSel; head: number; park: string; role?: number; ch: Character | null; bubble: ReturnType<typeof createBubble> | null; ang: number; pair?: Folk;
}
const HIDE = /Shield|Sword|Axe|Knife|Staff|Wand|Dagger|Bow|Crossbow/;
const SOLO: string[] = [
  "Qué buen día para no hacer nada.", "Estas palomas me tienen fichado.", "Llevo aquí desde el desayuno y nadie me ha pedido el sitio.",
  "¿Alguien sabe si el pan de la plaza sigue a dos monedas?", "Dicen que el herrero habla con sus yunques.", "Ayer vi un lobo con sombrero. O era el borracho de la taberna.",
  "Mi gato se cree el alcalde.", "Esos aventureros corren más que mi pulso.", "Mi abuela decía: pan caliente y banco al sol.", "Se me ha dormido la pierna. Y la conversación.",
  "Hoy no pienso mover ni un dedo. Ya lo moverá el lunes.", "Un día en el parque vale por tres sermones.", "Con este sol hasta el recaudador sonríe.",
];
const BY_PARK: Record<string, string[]> = {
  claustro: ["Los patos del estanque pagan menos impuestos que yo.", "Dicen que hay un pez dorado que concede deseos. Yo solo veo ranas.", "Hasta los nenúfares tienen mejor vida que yo."],
  gremios: ["Hoy toca la banda... en cuanto encuentren al de la tuba.", "Este quiosco tiene mejor acústica que la catedral.", "Los gremios discuten hasta por el color de los bancos."],
  olmo: ["Este olmo vio nacer a mi bisabuelo. No se cayeron bien.", "Dicen que el olmo tiene mil años. Yo creo que cotillea desde entonces.", "Cuidado con las hojas: en otoño te cobran peaje."],
  artesanos: ["Ese herrero de piedra lleva siglos martillando y aún no acaba.", "No tires monedas a la fuente: el recaudador las cuenta.", "El artesano de bronce nunca se queja del salario."],
};
const PAIRS: [string, string][] = [
  ["¿Has visto los precios del mercado?", "Ni me lo recuerdes, hasta el pan es de lujo."],
  ["Dicen que el rey se ha comprado otra corona.", "Pues la anterior le quedaba grande, como el cargo."],
  ["Mi cuñado jura que mató un dragón.", "Era una lagartija. Con mucha imaginación."],
  ["Anoche oí ruidos en el desván.", "Serán los ratones. O tu suegra."],
  ["¿Vienes el domingo a la catedral?", "Si el sermón dura menos que el último, sí."],
  ["Mira ese aventurero, lleva la espada al revés.", "Es una escoba. Va a barrer la plaza."],
  ["Dicen que ha vuelto el mercader del sur.", "Ojalá traiga especias y no más rumores."],
];

/** Hora de la noche (0 de día, 1 de noche): misma cuenta que el cielo, para encender las luces de los parques. */
function nightK() {
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const fixed = q && q.has("hora") ? Number(q.get("hora")) : NaN;
  const day = Number.isFinite(fixed) ? fixed / 24 : ((Date.now() / 1000) % DAY_CYCLE_SEC) / DAY_CYCLE_SEC;
  const a = (day - 0.25) * Math.PI * 2, cx = Math.cos(a) * 0.82, sy = Math.sin(a), e = sy / Math.hypot(cx, sy, 0.42);
  return THREE.MathUtils.smoothstep(-e, -0.12, 0.06);
}

export function createParks(scene: THREE.Scene): { update(dt: number, t: number, camPos: THREE.Vector3): void } {
  const root = new THREE.Group(); root.name = "parks"; scene.add(root);
  const M = new Merge();
  const mat = vcMat();
  const anims: { x: number; z: number; fn(dt: number, t: number): void }[] = [];
  const folks: Folk[] = [];
  const lampPts: { x: number; z: number }[] = [];

  // --- instanciados globales: árboles, bancos y mesas ---
  const trees: Item[][] = [[], []];
  const benches: Item[] = [], tables: Item[] = [];
  for (const p of PARKS) for (const q of PARK_PROPS) {
    if (q.park !== p.id) continue;
    if (q.kind === "tree") trees[treeKind(q, p)]!.push({ x: q.x, z: q.z, s: q.s ?? 1, ry: hash2(q.x, q.z) * 6.28, c: new THREE.Color().setScalar(0.92 + hash2(q.z, q.x) * 0.16).getHex() });
    else if (q.kind === "bench") benches.push({ x: q.x, z: q.z, ry: q.ry ?? 0 });
    else if (q.kind === "table") tables.push({ x: q.x, z: q.z });
  }
  for (const q of PLAZA_BENCH_PROPS) benches.push({ x: q.x, z: q.z, ry: q.ry ?? 0 });
  instanced(root, lindenGeo(), mat, trees[0]!);
  instanced(root, cherryGeo(), mat, trees[1]!);
  instanced(root, benchGeo(), mat, benches);
  instanced(root, tableGeo(), mat, tables);

  // ---------- cada parque ----------
  for (const p of PARKS) {
    const props = PARK_PROPS.filter(q => q.park === p.id), half = p.size / 2, dcol = DISTRICTS[p.district].color;
    M.at(p.x, p.z);
    // suelo
    const gm = new THREE.MeshStandardMaterial({ map: groundTexture(p, props), roughness: 1, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 28).rotateX(-Math.PI / 2), gm);
    ground.position.set(p.x, 0.04, p.z); ground.receiveShadow = true; ground.renderOrder = 0.04; root.add(ground);

    // setos
    for (const q of props) if (q.kind === "hedge") {
      const w = q.hw! * 2, d = q.hd! * 2;
      M.box("solid", w, 0.78, d, q.x, 0.39, q.z, HEDGE);
      M.box("solid", w - 0.1, 0.14, d - 0.08, q.x, 0.82, q.z, HEDGE_TOP);
    }
    // arcos de entrada: pilares de piedra (dentro de la huella del seto) y dintel por encima de 2,4 m
    for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const alongX = nz !== 0, ey = (half - 0.35);
      for (const s of [-1, 1]) {
        const off = PARK_GATE / 2 + 0.3, px = p.x + (alongX ? s * off : nx * ey), pz = p.z + (alongX ? nz * ey : s * off);
        M.box("solid", 0.56, 0.3, 0.56, px, 0.15, pz, STONE_D);
        M.box("solid", 0.44, 1.3, 0.44, px, 0.95, pz, STONE);
        M.box("solid", 0.58, 0.1, 0.58, px, 1.65, pz, STONE_L);
        M.box("solid", 0.15, 0.75, 0.15, px, 2.07, pz, IRON); // montante de hierro hasta el dintel
        M.put("solid", ball(0.09, 0), IRON, px, 2.5, pz);
      }
      // dintel de hierro con el escudo del barrio, por encima de 2,3 m
      const cx = p.x + (alongX ? 0 : nx * ey), cz = p.z + (alongX ? nz * ey : 0), L = PARK_GATE + 0.6, yaw = alongX ? 0 : Math.PI / 2;
      M.box("solid", L, 0.16, 0.16, cx, 2.38, cz, IRON, yaw);
      M.box("solid", L - 0.4, 0.1, 0.1, cx, 2.22 + 0.1, cz, IRON, yaw);
      const sh = new THREE.Shape(); sh.moveTo(-0.28, 0); sh.lineTo(0.28, 0); sh.lineTo(0.28, 0.32); sh.lineTo(0, 0.55); sh.lineTo(-0.28, 0.32); sh.closePath();
      M.put("solid", new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04), dcol, cx, 2.42, cz, yaw);
    }

    // letrero con el nombre: sobre el seto del lado que mira al centro de la ciudad
    {
      const side = Math.abs(p.z) >= Math.abs(p.x) ? "z" : "x", sg = side === "z" ? -Math.sign(p.z || 1) : -Math.sign(p.x || 1);
      const ey = half - 0.35, lat = 5.0, bx = side === "z" ? p.x + lat : p.x + sg * ey, bz = side === "z" ? p.z + sg * ey : p.z + lat, yaw = side === "z" ? 0 : Math.PI / 2;
      for (const s of [-1, 1]) {
        const dx = Math.cos(yaw) * s * 1.27, dz = -Math.sin(yaw) * s * 1.27;
        M.box("solid", 0.1, 1.5, 0.1, bx + dx, 1.25, bz + dz, 0x4a3320);
        M.put("solid", ball(0.09, 0), 0x4a3320, bx + dx, 2.03, bz + dz);
      }
      M.box("solid", 2.7, 0.08, 0.16, bx, 1.78, bz, 0x4a3320, yaw);
      M.box("solid", 2.64, 0.66, 0.1, bx, 1.4, bz, 0x3a2616, yaw);
      const tex = signTexture(p), pg = new THREE.PlaneGeometry(2.54, 0.58), back = pg.clone().rotateY(Math.PI);
      pg.translate(0, 0, 0.056); back.translate(0, 0, -0.056);
      const sign = new THREE.Mesh(mergeGeometries([pg, back])!, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      sign.position.set(bx, 1.4, bz); sign.rotation.y = yaw; sign.castShadow = true; root.add(sign);
    }

    // macizos de flores
    const PAL = [[0xd9534f, 0xf08aa0, 0xf2c14e], [0xf2c14e, 0xf2e6a0, 0xe8943a], [0x7a62d8, 0xb69cf0, 0xf2f2f2], [0xf4f4f0, 0x6fb4ff, 0xf2c14e]];
    for (const q of props) if (q.kind === "bed") {
      const hw = q.hw!, hd = q.hd!, pal = PAL[(q.s ?? 0) % 4]!, rr = rng(Math.abs(q.x * 9 + q.z * 5) | 0);
      for (const s of [-1, 1]) {
        M.box("solid", hw * 2, 0.24, 0.12, q.x, 0.12, q.z + s * (hd - 0.06), STONE);
        M.box("solid", 0.12, 0.24, hd * 2 - 0.24, q.x + s * (hw - 0.06), 0.12, q.z, STONE);
      }
      M.box("solid", hw * 2 - 0.24, 0.2, hd * 2 - 0.24, q.x, 0.1, q.z, 0x5a3d28);
      for (let i = 0; i < 6; i++) M.put("solid", ball(0.3, 0, 1.1, 0.7, 1), 0x3f7a35, q.x + (i / 5 - 0.5) * (hw * 2 - 0.7), 0.26, q.z + (rr() - 0.5) * (hd * 2 - 0.6));
      for (let i = 0; i < 22; i++) {
        const fx = q.x + (rr() - 0.5) * (hw * 2 - 0.35), fz = q.z + (rr() - 0.5) * (hd * 2 - 0.3), fy = 0.33 + rr() * 0.1;
        M.put("solid", new THREE.OctahedronGeometry(0.085, 0), pal[Math.floor(rr() * pal.length)]!, fx, fy, fz, rr() * 3);
      }
    }

    // farolas de parque (la linterna usa el grupo "glow": más viva de noche)
    for (const q of props) if (q.kind === "lamp") {
      lampPts.push({ x: q.x, z: q.z });
      M.cyl("solid", 0.15, 0.22, 0.55, 8, q.x, 0, q.z, IRON);
      M.cyl("solid", 0.09, 0.09, 0.1, 8, q.x, 0.55, q.z, STONE_D);
      M.cyl("solid", 0.04, 0.065, 2.9, 6, q.x, 0.6, q.z, IRON);
      M.box("solid", 0.36, 0.05, 0.36, q.x, 3.28, q.z, IRON);
      M.box("glow", 0.26, 0.4, 0.26, q.x, 3.5, q.z, WARM);
      M.cone("solid", 0.3, 0.32, 4, q.x, 3.7, q.z, IRON, Math.PI / 4);
      M.put("solid", ball(0.06, 0), IRON, q.x, 4.05, q.z);
    }

    // elemento central
    const F = props.filter(q => q.kind === "feature");
    if (p.feature === "pond") pond(p, M, anims, root);
    else if (p.feature === "gazebo") gazebo(p, F, M, dcol);
    else if (p.feature === "oldtree") oldTree(p, M);
    else fountain(p, M, anims, root);

    // pétalos y hojas al viento (solo se mueven cuando hay alguien cerca)
    {
      const cherry = p.id === "claustro" || p.id === "artesanos", n = 18;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.09), new THREE.MeshBasicMaterial({ color: cherry ? 0xf6b8cc : p.feature === "oldtree" ? 0xb98a34 : 0xcfd070, side: THREE.DoubleSide }), n);
      im.frustumCulled = false; root.add(im);
      anims.push({
        x: p.x, z: p.z, fn(_dt, t) {
          for (let i = 0; i < n; i++) {
            const ph = (t * (0.05 + hash2(i, 3) * 0.03) + hash2(i, 1)) % 1, a = hash2(i, 2) * 6.28, d = 2 + hash2(i, 4) * 10;
            dummy.position.set(p.x + Math.cos(a) * d + Math.sin(t * 0.8 + i) * 0.7 + ph * 2, 5.5 - ph * 5.4, p.z + Math.sin(a) * d + Math.cos(t * 0.7 + i) * 0.6);
            dummy.rotation.set(t * 1.3 + i, t * 0.9 + i * 2, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          }
          im.instanceMatrix.needsUpdate = true;
        },
      });
    }

    // vecinos
    placeFolk(p, props);
  }
  M.build(root);

  // ---------- vecinos: dónde se colocan ----------
  function footDist(q: ParkProp, x: number, z: number) {
    return q.r !== undefined ? Math.hypot(x - q.x, z - q.z) - q.r : Math.hypot(Math.max(Math.abs(x - q.x) - q.hw!, 0), Math.max(Math.abs(z - q.z) - q.hd!, 0));
  }
  function placeFolk(p: ParkDef, props: ParkProp[]) {
    const rr = rng(Math.abs(p.x * 3 + p.z) | 0), clearance = (x: number, z: number) => props.reduce((m, q) => Math.min(m, footDist(q, x, z)), 99);
    const mkLook = (): LookSel => { const cl = CLASSES[Math.floor(rr() * CLASSES.length)]!; return [cl.id, Math.max(0, cl.styles.findIndex(s => !s.hidden)), Math.floor(rr() * TONES.length)]; };
    const add = (f: Omit<Folk, "ch" | "bubble" | "look" | "park" | "ang">) => { const o: Folk = { ...f, look: mkLook(), park: p.id, ch: null, bubble: null, ang: 0 }; folks.push(o); return o; };
    const plan = { claustro: "S F C", gremios: "S S L W", olmo: "S L C", artesanos: "S S F W" }[p.id] ?? "S L C";
    const seats = SEATS.filter(s => s.park === p.id && TOWNSFOLK_SEATS.has(s.id));
    let si = 0; const nS = plan.split(" ").filter(k => k === "S").length;
    // zona libre del césped: la de más holgura de un cuadrante (lejos de caminos y del paseo)
    const lawn = (sx: number, sz: number) => {
      let best: { x: number; z: number; c: number } | null = null;
      for (let u = 2.4; u <= 11.6; u += 0.4) for (let v = 2.4; v <= 11.6; v += 0.4) {
        const dx = sx * u, dz = sz * v, rad = Math.hypot(dx, dz);
        if (Math.abs(rad - PARK_RING) < 2.6 || rad < 6) continue;
        const c = clearance(p.x + dx, p.z + dz);
        if (!best || c > best.c + 1e-6) best = { x: p.x + dx, z: p.z + dz, c };
      }
      return best ?? { x: p.x + sx * 9, z: p.z + sz * 9, c: 0 };
    };
    const faceCentre = (x: number, z: number) => Math.atan2(p.x - x, p.z - z);
    let q = 0;
    for (const k of plan.split(" ")) {
      if (k === "S") {
        const s = seats[Math.min(seats.length - 1, Math.floor((si++ * seats.length) / Math.max(1, nS)))];
        if (s) add({ kind: "sit", x: s.x, z: s.z, ry: s.ry, head: 1.95 });
      } else if (k === "F" || k === "L") {
        const sp = lawn(q % 2 ? 1 : -1, q < 2 ? 1 : -1); q++;
        add({ kind: k === "F" ? "floor" : "lie", x: sp.x, z: sp.z, ry: faceCentre(sp.x, sp.z) + (k === "L" ? Math.PI / 2 : 0), head: k === "F" ? 1.75 : 1.25 });
      } else if (k === "C") {
        // pareja charlando en el camino: tramo del brazo con más holgura
        let best = { x: p.x, z: p.z + 9, c: -1, vertical: true };
        for (const sg of [-1, 1]) for (let d = 7.4; d <= 11; d += 0.3) for (const vertical of [true, false]) {
          const x = p.x + (vertical ? 0 : sg * d), z = p.z + (vertical ? sg * d : 0), c = Math.min(clearance(x - 0.6, z - 0.6), clearance(x + 0.6, z + 0.6), clearance(x, z));
          if (c > best.c) best = { x, z, c, vertical };
        }
        const o = best.vertical ? [0.6, 0] : [0, 0.6]; // separados 1,2 m a lo largo del eje del brazo perpendicular
        const a = add({ kind: "chat", x: best.x - o[0]!, z: best.z - o[1]!, ry: 0, head: 2.55 }), b = add({ kind: "chat", x: best.x + o[0]!, z: best.z + o[1]!, ry: 0, head: 2.55 });
        a.ry = Math.atan2(b.x - a.x, b.z - a.z); b.ry = Math.atan2(a.x - b.x, a.z - b.z); a.pair = b; b.pair = a; a.role = 0; b.role = 1;
      } else if (k === "W") add({ kind: "walk", x: p.x + PARK_RING, z: p.z, ry: Math.PI / 2, head: 2.55 }).ang = rr() * 6.28;
    }
    // bocadillos y charla
    const mine = () => folks.filter(f => f.park === p.id);
    const pool = [...SOLO, ...(BY_PARK[p.id] ?? [])];
    let timer = 2 + rr() * 6, pend: { f: Folk; text: string; at: number } | null = null, clock = 0;
    anims.push({
      x: p.x, z: p.z, fn(dt) {
        clock += dt;
        if (pend && clock >= pend.at) { sayAs(pend.f, pend.text, 4.2); pend = null; }
        timer -= dt;
        if (timer > 0) return;
        timer = 9 + Math.random() * 12;
        const list = mine(), chatters = list.filter(f => f.kind === "chat" && f.role === 0), awake = list.filter(f => f.ch && f.ch.group.visible);
        if (!awake.length) return;
        if (chatters[0] && chatters[0].ch && Math.random() < 0.5) {
          const [l1, l2] = PAIRS[Math.floor(Math.random() * PAIRS.length)]!, a = chatters[0], b = a.pair!;
          sayAs(a, l1, 3.8); pend = { f: b, text: l2, at: clock + 3.0 };
        } else {
          const f = awake.filter(w => w.kind !== "chat")[Math.floor(Math.random() * Math.max(1, awake.filter(w => w.kind !== "chat").length))] ?? awake[0]!;
          sayAs(f, pool[Math.floor(Math.random() * pool.length)]!, 4.6);
        }
      },
    });
  }
  function sayAs(f: Folk, text: string, secs: number) {
    if (!f.bubble || !f.ch) return;
    f.bubble.show(text, secs);
    if (f.kind === "chat" || f.kind === "walk") f.ch.emote("Interact");
  }

  // ---------- vecinos: creación perezosa, visibilidad y animación ----------
  function ensureFolk(f: Folk) {
    if (f.ch) return;
    const base = playerLook(f.look), look = { ...base, show: base.show.filter(n => !HIDE.test(n)) };
    const ch = new Character(look, { shadow: true });
    ch.group.position.set(f.x, 0.04, f.z); ch.group.rotation.y = f.ry; scene.add(ch.group);
    ch.setPose(f.kind === "sit" ? "chair" : f.kind === "floor" ? "floor" : f.kind === "lie" ? "lie" : null);
    const bubble = createBubble({ scale: 0.8 }); bubble.sprite.position.set(f.x, f.head, f.z); scene.add(bubble.sprite);
    f.ch = ch; f.bubble = bubble;
  }
  const camP = new THREE.Vector3();
  let lightClock = 0;
  const lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffb866, 0, 17, 2); l.position.set(0, -50, 0); scene.add(l); return l; });
  let nk = 0, nkClock = 0;

  return {
    update(dt, t, camPos) {
      camP.copy(camPos);
      for (const f of folks) {
        const pk = PARKS.find(p => p.id === f.park)!, d = Math.hypot(camP.x - pk.x, camP.z - pk.z);
        if (!f.ch && d < FAR_BUILD) ensureFolk(f);
        if (!f.ch || !f.bubble) continue;
        const show = d < FAR_SHOW;
        f.ch.group.visible = show;
        if (!show) { f.bubble.sprite.visible = false; continue; }
        let speed = 0;
        if (f.kind === "walk") { // paseo lento por el camino circular
          f.ang += (dt * 1.05) / PARK_RING;
          const nx = pk.x + Math.cos(f.ang) * PARK_RING, nz = pk.z + Math.sin(f.ang) * PARK_RING;
          f.ch.group.rotation.y = Math.atan2(-Math.sin(f.ang), Math.cos(f.ang));
          f.ch.group.position.set(nx, 0.04, nz); f.x = nx; f.z = nz; speed = 1.05;
          f.bubble.sprite.position.set(nx, f.head, nz);
        }
        f.ch.update(dt, speed);
        f.bubble.update(dt, d < SAY_RANGE);
      }
      for (const a of anims) if (Math.abs(camP.x - a.x) < FAR_ANIM && Math.abs(camP.z - a.z) < FAR_ANIM) a.fn(dt, t);
      // luces de noche en las farolas de parque más cercanas
      nkClock -= dt; lightClock -= dt;
      if (nkClock <= 0) { nkClock = 1; nk = nightK(); }
      if (lightClock <= 0) {
        lightClock = 0.3;
        const near = lampPts.map(l => ({ l, d: (l.x - camP.x) ** 2 + (l.z - camP.z) ** 2 })).sort((a, b) => a.d - b.d);
        lights.forEach((pl, k) => { const n = near[k]; if (n && n.d < 3600) pl.position.set(n.l.x, 3.4, n.l.z); else pl.position.y = -50; });
      }
      for (const pl of lights) pl.intensity = (24 + Math.sin(t * 7 + pl.position.x) * 2) * nk;
    },
  };
}

// ---------- estanque ----------
function pond(p: ParkDef, M: Merge, anims: { x: number; z: number; fn(dt: number, t: number): void }[], root: THREE.Object3D) {
  const R = 3.6, rr = rng(11);
  const rim = new THREE.LatheGeometry([new THREE.Vector2(2.95, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, 0.38), new THREE.Vector2(R - 0.12, 0.5), new THREE.Vector2(2.95, 0.5)], 14);
  M.put("solid", rim, STONE, p.x, 0, p.z, Math.PI / 14);
  M.put("solid", new THREE.CircleGeometry(3.0, 14).rotateX(-Math.PI / 2), 0x36564e, p.x, 0.09, p.z);
  // piedras sueltas y junto al borde
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.5; M.put("solid", ball(0.3 + rr() * 0.12, 0, 1.2, 0.8, 1), STONE_D, p.x + Math.cos(a) * (R + 0.2), 0.12, p.z + Math.sin(a) * (R + 0.35), rr() * 6); }
  // nenúfares (algunos con flor) y juncos
  for (let i = 0; i < 12; i++) {
    const a = rr() * 6.28, d = 0.6 + Math.sqrt(rr()) * 2.1, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    M.cyl("solid", 0.3 + rr() * 0.12, 0.3 + rr() * 0.12, 0.02, 7, x, 0.33, z, 0x3f8a3f, rr() * 3);
    if (i % 3 === 0) M.cone("solid", 0.1, 0.16, 5, x, 0.34, z, 0xf2a8c4);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28 + rr() * 0.3, x = p.x + Math.cos(a) * 3.2, z = p.z + Math.sin(a) * 3.2;
    for (let j = 0; j < 3; j++) { const h = 0.7 + rr() * 0.35; M.cone("solid", 0.04, h, 4, x + (rr() - 0.5) * 0.3, 0.1, z + (rr() - 0.5) * 0.3, 0x5f8a34); if (j === 0) M.cyl("solid", 0.05, 0.05, 0.2, 5, x, 0.1 + h - 0.15, z, 0x6b4a2b); }
  }
  // agua
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.0, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f93b8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 }));
  water.position.set(p.x, 0.3, p.z); water.receiveShadow = true; root.add(water);
  // patos con su estela
  const duck = (body: number, head: number) => colorParts([
    [ball(0.15, 1, 1, 0.7, 1.45), body, 0, 0.1, 0], [ball(0.075, 0), head, 0, 0.27, 0.2], [new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2), 0xe8a830, 0, 0.26, 0.31],
    [new THREE.ConeGeometry(0.07, 0.16, 4).rotateX(-Math.PI / 2), body, 0, 0.14, -0.27], [ball(0.1, 0, 1, 0.5, 1.1), 0xd9d0b8, 0, 0.12, -0.02],
  ], 0.4);
  const mats = vcMat(), ducks = [{ g: duck(0x8a6a48, 0x2f6a45), r: 1.9, w: 0.34, ph: 0 }, { g: duck(0xefece0, 0xefece0), r: 1.2, w: -0.27, ph: 2 }, { g: duck(0x8a6a48, 0x2f6a45), r: 2.3, w: 0.22, ph: 4 }].map(d => {
    const m = new THREE.Mesh(d.g, mats); m.castShadow = true; root.add(m);
    const rp = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); rp.position.y = 0.32; root.add(rp);
    return { ...d, m, rp };
  });
  anims.push({
    x: p.x, z: p.z, fn(_dt, t) {
      water.position.y = 0.3 + Math.sin(t * 1.2) * 0.01;
      for (const [i, d] of ducks.entries()) {
        const a = d.ph + t * d.w, x = p.x + Math.cos(a) * d.r, z = p.z + Math.sin(a) * d.r;
        d.m.position.set(x, 0.3 + Math.sin(t * 2 + i) * 0.012, z); d.m.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(d.w), Math.cos(a) * Math.sign(d.w)); d.m.rotation.z = Math.sin(t * 1.7 + i) * 0.04;
        const k = (t * 0.5 + i * 0.33) % 1, ax = d.ph + (t - k * 2) * d.w;
        d.rp.position.set(p.x + Math.cos(ax) * d.r, 0.32, p.z + Math.sin(ax) * d.r); d.rp.scale.setScalar(0.6 + k * 3); (d.rp.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      }
    },
  });
}

// ---------- quiosco de música ----------
function gazebo(p: ParkDef, feats: ParkProp[], M: Merge, dcol: number) {
  const R = 3.4, rot = Math.PI / 8;
  M.cyl("solid", 4.5, 4.5, 0.1, 8, p.x, 0, p.z, STONE_D, rot);
  M.cyl("solid", 4.1, 4.1, 0.25, 8, p.x, 0, p.z, STONE_L, rot);
  M.cyl("solid", 3.95, 3.95, 0.02, 8, p.x, 0.25, p.z, 0xa88a5c, rot);
  const posts = feats.filter(f => f.r !== undefined && f.r < 0.5);
  for (const f of posts) {
    M.cyl("solid", 0.17, 0.2, 3.0, 8, f.x, 0.25, f.z, PLASTER);
    M.box("solid", 0.4, 0.18, 0.4, f.x, 0.35, f.z, STONE);
    M.box("solid", 0.46, 0.16, 0.46, f.x, 3.1, f.z, PLASTER);
  }
  // friso de arcos entre postes (todo por encima de 2,35 m) y cubierta octogonal
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const x0 = p.x + Math.cos(a0) * R, z0 = p.z + Math.sin(a0) * R, x1 = p.x + Math.cos(a1) * R, z1 = p.z + Math.sin(a1) * R;
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    M.put("solid", archWallGeo(L - 0.35, 0.75, 0.2, 1.9, 0.62), PLASTER, (x0 + x1) / 2, 2.4, (z0 + z1) / 2, yaw);
    M.box("solid", L, 0.14, 0.26, (x0 + x1) / 2, 3.25, (z0 + z1) / 2, STONE, yaw);
  }
  M.cone("solid", 4.8, 2.1, 8, p.x, 3.3, p.z, ROOF_RED, rot);
  M.cyl("solid", 4.82, 4.82, 0.1, 8, p.x, 3.24, p.z, 0x6b2a20, rot);
  M.cyl("solid", 0.07, 0.07, 1.0, 6, p.x, 5.35, p.z, IRON);
  M.put("solid", ball(0.17, 0), GOLD, p.x, 5.4, p.z);
  M.put("solid", pennantGeo(0.7, 0.4), dcol, p.x + 0.04, 6.0, p.z);
  // farol colgante dentro
  M.cyl("solid", 0.02, 0.02, 0.8, 4, p.x, 2.75, p.z, IRON);
  M.box("glow", 0.26, 0.34, 0.26, p.x, 2.45, p.z, WARM);
  M.cone("solid", 0.22, 0.2, 4, p.x, 2.78, p.z, IRON, Math.PI / 4);
  // cuatro bancos bajos dentro (sin respaldo, por debajo de 0,5 m): son los asientos de SEATS
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2, bx = p.x + Math.cos(a) * 2.6, bz = p.z + Math.sin(a) * 2.6, yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    M.box("solid", 1.7, 0.08, 0.46, bx, 0.43, bz, 0x8a5f34, yaw);
    for (const s of [-1, 1]) M.box("solid", 0.08, 0.2, 0.4, bx + Math.cos(yaw) * s * 0.7, 0.3, bz - Math.sin(yaw) * s * 0.7, IRON, yaw);
  }
}

// ---------- olmo centenario ----------
function oldTree(p: ParkDef, M: Merge) {
  const rr = rng(23);
  // banco circular: asiento en corona (r 1,6 a 2,3) y respaldo bajo pegado al tronco (dentro de r 1,75)
  const seat = new THREE.LatheGeometry([new THREE.Vector2(1.55, 0), new THREE.Vector2(2.3, 0), new THREE.Vector2(2.3, 0.45), new THREE.Vector2(1.55, 0.45)], 16);
  M.put("solid", seat, 0x8a5f34, p.x, 0, p.z);
  M.put("solid", new THREE.LatheGeometry([new THREE.Vector2(1.5, 0.45), new THREE.Vector2(1.68, 0.45), new THREE.Vector2(1.68, 0.95), new THREE.Vector2(1.5, 0.95)], 16), 0x7a5230, p.x, 0, p.z);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; M.box("solid", 0.18, 0.45, 0.18, p.x + Math.cos(a) * 2.15, 0.22, p.z + Math.sin(a) * 2.15, STONE_D); }
  // tronco y ramas gruesas por encima de 2,4 m
  M.cyl("solid", 1.05, 1.28, 4.6, 9, p.x, 0, p.z, 0x5a4330);
  M.cyl("solid", 0.8, 1.05, 2.4, 9, p.x, 4.4, p.z, 0x5f4733);
  for (let i = 0; i < 5; i++) { // ramas
    const a = (i / 5) * 6.283 + 0.4, g = cyl(0.2, 0.45, 4.2, 6); g.rotateZ(-0.75); g.translate(0.4, 3.0, 0);
    M.put("solid", g, 0x5f4733, p.x, 0, p.z, -a);
  }
  // copa inmensa
  const G = [0x4f8c3c, 0x5f9d44, 0x6aa84a, 0x437d38, 0x7cb857];
  M.put("solid", ball(5, 1, 1, 0.75, 1), G[0]!, p.x, 9.2, p.z);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.283 + rr() * 0.4, d = 3.5 + rr() * 3.4;
    M.put("solid", ball(2.8 + rr() * 1.6, 1, 1, 0.75, 1), G[i % 5]!, p.x + Math.cos(a) * d, 6.6 + rr() * 3.2, p.z + Math.sin(a) * d, rr() * 6);
  }
}

// ---------- fuente del artesano ----------
function fountain(p: ParkDef, M: Merge, anims: { x: number; z: number; fn(dt: number, t: number): void }[], root: THREE.Object3D) {
  const WALL = 0xb3ad9f;
  M.put("solid", new THREE.LatheGeometry([new THREE.Vector2(2.4, 0), new THREE.Vector2(2.8, 0), new THREE.Vector2(2.8, 0.55), new THREE.Vector2(2.55, 0.62), new THREE.Vector2(2.4, 0.55)], 12), WALL, p.x, 0, p.z, Math.PI / 12);
  M.put("solid", new THREE.CircleGeometry(2.45, 12).rotateX(-Math.PI / 2), 0x5f7f86, p.x, 0.08, p.z);
  M.cyl("solid", 0.55, 0.7, 0.75, 8, p.x, 0, p.z, STONE_D);
  M.put("solid", new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.6, 0.12), new THREE.Vector2(1.4, 0.4), new THREE.Vector2(1.45, 0.52), new THREE.Vector2(1.25, 0.52), new THREE.Vector2(0.001, 0.3)], 10), STONE, p.x, 0.75, p.z);
  M.cyl("solid", 0.28, 0.42, 0.7, 8, p.x, 1.1, p.z, STONE_L);
  // estatua del artesano con el martillo en alto (bronce verdoso sobre pedestal)
  const sy = 1.8;
  M.cyl("solid", 0.4, 0.46, 0.2, 8, p.x, 1.8, p.z, STONE_D);
  const y0 = sy + 0.2;
  for (const s of [-1, 1]) M.box("solid", 0.15, 0.62, 0.17, p.x + s * 0.11, y0 + 0.31, p.z, BRONZE);
  M.box("solid", 0.42, 0.62, 0.26, p.x, y0 + 0.93, p.z, BRONZE);
  M.box("solid", 0.32, 0.5, 0.04, p.x, y0 + 0.75, p.z + 0.15, 0x5a7a62); // delantal
  M.put("solid", ball(0.14, 1), BRONZE, p.x, y0 + 1.45, p.z);
  M.cone("solid", 0.15, 0.13, 6, p.x, y0 + 1.5, p.z, 0x5a7a62); // gorro
  M.box("solid", 0.12, 0.12, 0.12, p.x, y0 + 1.36, p.z + 0.1, BRONZE);
  M.box("solid", 0.12, 0.5, 0.12, p.x - 0.27, y0 + 0.97, p.z + 0.04, BRONZE); // brazo izquierdo
  const arm = new THREE.BoxGeometry(0.12, 0.55, 0.12); arm.translate(0, 0.27, 0); arm.rotateZ(-2.5);
  M.put("solid", arm, BRONZE, p.x + 0.23, y0 + 1.1, p.z + 0.04); // brazo derecho alzado
  M.box("solid", 0.06, 0.55, 0.06, p.x + 0.72, y0 + 1.66, p.z + 0.04, 0x6b4a2b, 0, 0, 0.35); // mango del martillo
  M.box("solid", 0.34, 0.16, 0.16, p.x + 0.82, y0 + 1.96, p.z + 0.04, 0x4a4f57, 0, 0, 0.35); // cabeza
  // agua
  const wm = new THREE.MeshStandardMaterial({ color: 0x5aa0c4, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 });
  const low = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20).rotateX(-Math.PI / 2), wm), up = new THREE.Mesh(new THREE.CircleGeometry(1.25, 16).rotateX(-Math.PI / 2), wm);
  low.position.set(p.x, 0.46, p.z); up.position.set(p.x, 1.3, p.z); root.add(low, up);
  // surtidores: gotas en arco desde la taza alta hasta la pila
  const N = 8, PER = 6, drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), new THREE.MeshBasicMaterial({ color: 0xd6efff, transparent: true, opacity: 0.85 }), N * PER);
  drops.frustumCulled = false; root.add(drops);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); root.add(ring);
  anims.push({
    x: p.x, z: p.z, fn(_dt, t) {
      low.position.y = 0.46 + Math.sin(t * 1.3) * 0.01; up.position.y = 1.3 + Math.sin(t * 1.7) * 0.008;
      for (let i = 0; i < N; i++) for (let j = 0; j < PER; j++) {
        const ph = (t * 0.7 + j / PER) % 1, a = (i / N) * 6.283 + Math.PI / 8, d = 1.2 + ph * 1.1; // de la taza (r 1,2) hacia la pila (r 2,3)
        dummy.position.set(p.x + Math.cos(a) * d, 1.35 + (0.5 - 1.35) * ph + 4 * 0.35 * ph * (1 - ph), p.z + Math.sin(a) * d);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); drops.setMatrixAt(i * PER + j, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
      const k = (t * 0.6) % 1; ring.position.set(p.x + 1.7, 0.48, p.z); ring.scale.setScalar(0.5 + k * 3); (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
    },
  });
}
