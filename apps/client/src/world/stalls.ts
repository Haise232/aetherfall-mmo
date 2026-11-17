import * as THREE from "three";
import type { Stall } from "@mmorpg/shared";
import { Merge, TIMBER, WOOD, bannerGeo, hash2, type Group } from "./kit";

// Puestos de mercaderes. Todo va a la geometría fusionada del mapa (ni una llamada de dibujo extra).
// Coordenadas locales: origen en la pared trasera, +z hacia la calle, +x a la derecha del mercader.
// Fondo 0–2,4 m: mercader en z=0,75, mostrador en z=1,75, postes delanteros en z=2,35.
const CREAM = 0xf2ead8, PLANK = 0x8a6a45, CRATE = 0x9a7a4e, TOP = 0.95;

export function stall(M: Merge, s: Stall) {
  M.at(s.x, s.z);
  const ry = Math.atan2(s.nx, s.nz), h = (k: number) => hash2(s.ox + k * 3.1, s.oz - k * 1.7);
  /** Pieza en coordenadas locales; las rotaciones locales se aplican antes de colocarla. */
  const put = (group: Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, rz = 0, yaw = 0) => {
    if (rz) geo.rotateZ(rz); if (rx) geo.rotateX(rx); if (yaw) geo.rotateY(yaw);
    geo.translate(x, y, z); M.put(group, geo, color, s.ox, 0, s.oz, ry);
  };
  const box = (w: number, hh: number, d: number, color: number, x: number, y: number, z: number, rx = 0, rz = 0, yaw = 0) =>
    put("solid", new THREE.BoxGeometry(w, hh, d), color, x, y, z, rx, rz, yaw);
  /** Cilindro con la base en y. */
  const cyl = (rt: number, rb: number, hh: number, color: number, x: number, y: number, z: number, seg = 8, group: Group = "solid") => {
    const g = new THREE.CylinderGeometry(rt, rb, hh, seg); g.translate(0, hh / 2, 0); put(group, g, color, x, y, z);
  };
  /** Cilindro tumbado a lo largo de x (yaw gira sobre la mesa). */
  const log = (rad: number, len: number, color: number, x: number, y: number, z: number, yaw = 0) =>
    put("solid", new THREE.CylinderGeometry(rad, rad, len, 7), color, x, y, z, 0, Math.PI / 2, yaw);
  const ball = (rad: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, group: Group = "solid") => {
    const g = new THREE.IcosahedronGeometry(rad, 0); g.scale(sx, sy, sz); put(group, g, color, x, y, z, 0, 0, yaw);
  };

  // --- armazón: postes, vigas y toldo a rayas con cenefa ---
  for (const sx of [-1.45, 1.45]) { box(0.13, 3.0, 0.13, WOOD, sx, 1.5, 0.12); box(0.13, 2.45, 0.13, WOOD, sx, 1.225, 2.35); }
  box(3.05, 0.11, 0.11, TIMBER, 0, 2.42, 2.35); box(3.05, 0.11, 0.11, TIMBER, 0, 2.98, 0.12);
  for (const sx of [-1.45, 1.45]) box(0.09, 0.09, 2.35, TIMBER, sx, 2.7, 1.235, 0.241);
  const N = 7, SW = 3.3 / N;
  for (let i = 0; i < N; i++) {
    const x = -1.65 + SW * (i + 0.5), main = i % 2 === 0;
    box(SW, 0.06, 2.82, main ? s.color : CREAM, x, 2.78, 1.4, 0.241);
    box(SW, 0.3, 0.05, main ? CREAM : s.color, x, 2.3, 2.79);
  }
  // rótulo de madera sobre la viga, con el color del gremio
  box(1.5, 0.5, 0.08, TIMBER, 0, 2.86, 2.44); box(1.34, 0.36, 0.05, 0xd9c79a, 0, 2.86, 2.48); box(0.5, 0.2, 0.04, s.color, 0, 2.86, 2.51);
  // farol colgado de la viga
  box(0.03, 0.22, 0.03, 0x2b2b2e, -1.15, 2.26, 2.35); put("glow", new THREE.BoxGeometry(0.2, 0.26, 0.2), 0xffd48a, -1.15, 2.03, 2.35); box(0.26, 0.05, 0.26, 0x2b2b2e, -1.15, 2.18, 2.35);

  // --- mostrador: cuerpo de tablas, faldón de tela y tablero ---
  box(2.7, 0.86, 0.95, 0x7a5a38, 0, 0.43, 1.75);
  for (let i = 0; i < 5; i++) box(0.04, 0.8, 0.03, TIMBER, -1.08 + i * 0.54, 0.43, 2.235);
  box(2.72, 0.34, 0.04, s.color, 0, 0.7, 2.25); box(2.72, 0.07, 0.045, CREAM, 0, 0.56, 2.252);
  box(2.95, 0.1, 1.2, PLANK, 0, 0.9, 1.75);
  // enseres a los lados: barril, cajas apiladas y sacos
  cyl(0.36, 0.36, 0.85, 0x7a5a38, -1.95, 0, 1.55); cyl(0.38, 0.38, 0.07, TIMBER, -1.95, 0.24, 1.55); cyl(0.38, 0.38, 0.07, TIMBER, -1.95, 0.6, 1.55);
  box(0.75, 0.6, 0.7, CRATE, 1.95, 0.3, 1.5, 0, 0, 0.2); box(0.55, 0.45, 0.55, PLANK, 1.92, 0.83, 1.48, 0, 0, -0.3);
  ball(0.3, 0xb89b6a, 1.9, 0.24, 0.55, 1, 0.85, 1); ball(0.27, 0xa88c5c, -1.9, 0.22, 0.6, 1, 0.85, 1.1);

  /** Bandeja inclinada hacia el cliente, llena de género redondo. */
  const tray = (x: number, colors: number[], rad = 0.1) => {
    box(0.78, 0.16, 0.74, CRATE, x, TOP + 0.13, 1.78, 0.2);
    for (let i = 0; i < 9; i++) {
      const cx = x - 0.24 + (i % 3) * 0.24 + (h(i + x) - 0.5) * 0.05, cz = 1.54 + Math.floor(i / 3) * 0.24;
      ball(rad, colors[Math.floor(h(i * 7 + x) * colors.length)]!, cx, TOP + 0.3 - (cz - 1.78) * 0.2, cz);
    }
  };

  switch (s.kind) {
    case 0: // frutería
      tray(-0.9, [0xc0392b, 0xd9534f]); tray(0, [0xe6a21f, 0xf2c14e]); tray(0.9, [0x7ab648, 0x9ccc3c]);
      for (let i = 0; i < 4; i++) ball(0.07, 0x6a2c8a, -1.15 + i * 0.09, 2.2 - (i % 2) * 0.1, 2.3); // racimo colgado
      break;
    case 1: { // panadería
      cyl(0.36, 0.3, 0.2, 0xb08a4a, -0.85, TOP, 1.75, 10);
      for (let i = 0; i < 5; i++) ball(0.15, i % 2 ? 0xc98f4a : 0xd9a55e, -0.85 + Math.cos(i * 1.3) * 0.16, TOP + 0.24 + (i === 4 ? 0.12 : 0), 1.75 + Math.sin(i * 1.3) * 0.16, 1.2, 0.75, 1.2);
      for (let i = 0; i < 4; i++) log(0.065, 0.8, 0xd9a55e, 0.05 + i * 0.03, TOP + 0.07 + (i > 1 ? 0.12 : 0), 1.6 + (i % 2) * 0.16, 0.25);
      for (let i = 0; i < 3; i++) ball(0.17, 0xb87a3a, 0.95, TOP + 0.1 + i * 0.13, 1.8, 1.3, 0.5, 1.3);
      box(0.5, 0.03, 0.4, CREAM, 0.1, TOP + 0.015, 2.05);
      break;
    }
    case 2: { // telas: rollos apilados y paños colgando
      const cols = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x27ae60, 0x8e44ad, 0xe67e22, 0xf2ead8];
      for (let i = 0; i < 4; i++) log(0.13, 0.95, cols[i]!, -0.6, TOP + 0.13, 1.42 + i * 0.25);
      for (let i = 0; i < 3; i++) log(0.13, 0.95, cols[i + 4]!, -0.6, TOP + 0.36, 1.55 + i * 0.25);
      for (let i = 0; i < 3; i++) box(0.7, 0.07, 0.6, cols[(i + 2) % 7]!, 0.7, TOP + 0.035 + i * 0.07, 1.75, 0, 0, (h(i) - 0.5) * 0.3);
      for (const [x, c] of [[0.75, 0x2e86c1], [1.15, 0xd4ac0d]] as const) put("solid", bannerGeo(0.34, 0.85), c, x, 2.36, 2.42);
      break;
    }
    case 3: { // alquimista: estante de frascos que brillan y caldero
      box(2.3, 0.22, 0.34, TIMBER, 0, TOP + 0.11, 1.42);
      const liq = [0xd9534f, 0x4fbf8a, 0x6fb4ff, 0xb48ae0, 0xf2c14e];
      const flask = (x: number, y: number, z: number, c: number, big = false) => {
        const rr = big ? 0.1 : 0.07; ball(rr, c, x, y + rr * 0.9, z, 1, 0.9, 1, 0, "glow");
        cyl(rr * 0.35, rr * 0.4, rr * 1.1, 0xcfd8dc, x, y + rr * 1.5, z, 5); cyl(rr * 0.42, rr * 0.42, 0.04, 0x7a5a38, x, y + rr * 2.6, z, 5);
      };
      for (let i = 0; i < 7; i++) flask(-0.96 + i * 0.32, TOP + 0.22, 1.42, liq[i % 5]!);
      for (let i = 0; i < 4; i++) flask(-0.9 + i * 0.36 + (i % 2) * 0.06, TOP, 1.9 + (i % 2) * 0.14, liq[(i + 2) % 5]!, true);
      box(0.4, 0.07, 0.3, 0x5a2f2f, 0.85, TOP + 0.035, 1.95, 0, 0, 0.3); box(0.36, 0.03, 0.26, CREAM, 0.85, TOP + 0.08, 1.95, 0, 0, 0.3); // libro
      ball(0.34, 0x2b2b2e, -1.95, 1.0, 1.55, 1, 0.8, 1); put("glow", new THREE.CylinderGeometry(0.26, 0.26, 0.03, 8), 0x7dff9a, -1.95, 1.24, 1.55);
      break;
    }
    case 4: { // armero: espadas, hacha, escudo y yelmo
      const sword = (x: number, yaw: number) => {
        put("solid", new THREE.BoxGeometry(0.07, 0.025, 0.78), 0xc8ccd2, x, TOP + 0.02, 1.8, 0, 0, yaw);
        put("solid", new THREE.BoxGeometry(0.24, 0.04, 0.05), 0xc9a84a, x - Math.sin(yaw) * 0.4, TOP + 0.025, 1.8 - Math.cos(yaw) * 0.4, 0, 0, yaw);
        put("solid", new THREE.BoxGeometry(0.05, 0.04, 0.18), TIMBER, x - Math.sin(yaw) * 0.5, TOP + 0.025, 1.8 - Math.cos(yaw) * 0.5, 0, 0, yaw);
      };
      sword(-1.0, 0.12); sword(-0.72, -0.08); sword(-0.44, 0.1);
      log(0.03, 0.7, TIMBER, 0.05, TOP + 0.04, 1.75, Math.PI / 2 + 0.2); box(0.3, 0.03, 0.24, 0x8d949c, 0.14, TOP + 0.04, 2.05, 0, 0, 0.2);
      ball(0.17, 0x9aa1a9, 0.6, TOP + 0.15, 1.6, 1, 1.05, 1); box(0.04, 0.2, 0.06, 0xc9a84a, 0.6, TOP + 0.32, 1.6);
      put("solid", new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10), 0x7a2f3a, 1.0, TOP + 0.34, 1.95, Math.PI / 2 - 0.3);
      ball(0.09, 0xc9a84a, 1.0, TOP + 0.35, 2.0);
      for (const x of [-1.9, -2.0, -1.82]) box(0.05, 1.5, 0.05, 0x8d949c, x, 1.55, 1.5 + (x + 1.9) * 0.8, 0, (x + 1.9) * 0.6); // lanzas en el barril
      break;
    }
    case 5: { // quesería: ruedas, cuñas y quesitos
      for (let i = 0; i < 3; i++) cyl(0.27, 0.27, 0.15, i === 1 ? 0xd98a2b : 0xe8c04a, -0.8, TOP + i * 0.15, 1.75, 10);
      cyl(0.3, 0.3, 0.17, 0xf0e6c8, 0, TOP, 1.6, 10); cyl(0.22, 0.22, 0.14, 0xd98a2b, 0.05, TOP + 0.17, 1.6, 10);
      for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.28, 0.28, 0.15, 6, 1, false, 0, 1.1); g.translate(0, 0.075, 0); put("solid", g, 0xf2d060, 0.55 + i * 0.3, TOP, 2.0 - (i % 2) * 0.3, 0, 0, i * 1.7); }
      for (let i = 0; i < 5; i++) ball(0.085, 0xf0e6c8, -0.3 + i * 0.17, TOP + 0.07, 2.12, 1, 0.8, 1);
      box(0.6, 0.03, 0.45, 0xb08a4a, 0.85, TOP + 0.015, 1.5);
      break;
    }
    case 6: { // pescadería: lecho de hielo, peces y ristra colgada
      box(2.5, 0.1, 0.9, 0xdfeaf0, 0, TOP + 0.1, 1.78, 0.16);
      for (let i = 0; i < 10; i++) {
        const x = -0.98 + (i % 5) * 0.49, z = 1.58 + Math.floor(i / 5) * 0.4, y = TOP + 0.24 - (z - 1.78) * 0.16, yaw = (h(i) - 0.5) * 0.7 + 0.5;
        ball(0.1, i % 3 ? 0x9fb4c4 : 0x6f8ea6, x, y, z, 2.3, 0.5, 0.9, yaw);
        ball(0.07, 0x7f97a8, x - Math.cos(yaw) * 0.24, y, z + Math.sin(yaw) * 0.24, 0.5, 0.4, 1.6, yaw);
      }
      for (let i = 0; i < 3; i++) { box(0.02, 0.16, 0.02, TIMBER, 0.6 + i * 0.3, 2.3, 2.35); ball(0.09, 0x8fa6b6, 0.6 + i * 0.3, 2.05, 2.35, 0.6, 2.2, 0.9); }
      break;
    }
    default: { // especias: sacos abiertos con montones de colores y balanza
      const pow = [0xc0392b, 0xd4ac0d, 0x8a4a1c, 0xe67e22, 0x5f8a3a, 0xf2ead8];
      for (let i = 0; i < 6; i++) {
        const x = -1.0 + (i % 3) * 0.5, z = 1.52 + Math.floor(i / 3) * 0.46;
        cyl(0.2, 0.23, 0.24, 0xb89b6a, x, TOP, z, 7);
        const g = new THREE.ConeGeometry(0.18, 0.16, 7); put("solid", g, pow[i]!, x, TOP + 0.31, z);
      }
      box(0.04, 0.4, 0.04, 0xc9a84a, 0.85, TOP + 0.2, 1.75); box(0.6, 0.03, 0.03, 0xc9a84a, 0.85, TOP + 0.4, 1.75);
      for (const sx of [-0.28, 0.28]) cyl(0.12, 0.08, 0.04, 0xc9a84a, 0.85 + sx, TOP + 0.2, 1.75, 7);
      for (let i = 0; i < 4; i++) ball(0.06, 0xc0392b, 0.55 + i * 0.1, 2.2 - (i % 2) * 0.08, 2.35, 0.7, 1.6, 0.7); // guindillas
    }
  }
}
