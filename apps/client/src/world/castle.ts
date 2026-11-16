import * as THREE from "three";
import {
  CASTLE, CASTLE_LAWNS, CASTLE_RECT, CASTLE_STATUE, CASTLE_TOWERS, CASTLE_WINGS, CITY_NAME, GREAT_HALL, GREAT_PORCH, type Building,
} from "@mmorpg/shared";
import { greatHall, house, gatehouse, tower, type Ctx } from "./buildings";
import { Merge, STONE, STONE_D, STONE_L, WARM, archWallGeo, bannerGeo, textSprite } from "./kit";

function hedgeLawn(m: Merge, l: { x: number; z: number; w: number; d: number }, i: number) {
  m.at(l.x, l.z);
  const HC = 0x2f6b34, t = 0.55;
  for (const s of [-1, 1]) {
    m.box("solid", l.w, 0.8, t, l.x, 0.4, l.z + s * (l.d / 2 - t / 2), HC);
    m.box("solid", t, 0.8, l.d - t * 2, l.x + s * (l.w / 2 - t / 2), 0.4, l.z, HC);
  }
  m.box("solid", l.w - 2 * t, 0.1, l.d - 2 * t, l.x, 0.06, l.z, 0x5fa043); // césped
  const flowers = [0xd9534f, 0xf2c14e, 0xe8a0b4, 0xb48ae0, 0xffffff];
  const nx = Math.max(2, Math.floor((l.w - 2) / 1.1)), nz = Math.max(2, Math.floor((l.d - 2) / 1.1));
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
    if ((a + b + i) % 3) continue;
    m.box("solid", 0.28, 0.32, 0.28, l.x - l.w / 2 + 1 + (a + 0.5) * ((l.w - 2) / nx), 0.22, l.z - l.d / 2 + 1 + (b + 0.5) * ((l.d - 2) / nz), flowers[(a * 2 + b + i) % 5]!);
  }
  if (l.w > 6) for (const sx of [-1, 1]) { // árboles de copa redonda en los parterres grandes
    const tx = l.x + sx * l.w * 0.22, tz = l.z + (sx > 0 ? -1 : 1) * l.d * 0.18;
    m.cyl("solid", 0.2, 0.3, 2.0, 6, tx, 0, tz, 0x6a4a2c);
    m.put("solid", new THREE.IcosahedronGeometry(1.5, 1), 0x4f9442, tx, 3.0, tz);
    m.put("solid", new THREE.IcosahedronGeometry(1.0, 1), 0x5aa24a, tx + 0.7, 2.5, tz + 0.2);
  } else { m.cone("solid", 0.8, 2.6, 7, l.x, 0.1, l.z, 0x2f6a3a); m.cone("solid", 0.55, 2.0, 7, l.x, 1.5, l.z, 0x3b8a47); }
}

function statue(m: Merge, x: number, z: number) {
  m.at(x, z);
  for (let i = 0; i < 3; i++) m.cyl("solid", 2.15 - i * 0.3, 2.25 - i * 0.3, 0.3, 8, x, i * 0.28, z, STONE_L); // escalones octogonales
  m.cyl("solid", 1.0, 1.15, 2.2, 8, x, 0.9, z, STONE);
  m.cyl("solid", 1.2, 1.1, 0.35, 8, x, 3.0, z, STONE_D);
  const gold = 0xe0b94a;
  m.cyl("solid", 0.38, 0.5, 1.7, 7, x, 3.35, z, gold);
  m.put("solid", new THREE.IcosahedronGeometry(0.34, 1), gold, x, 5.4, z);
  m.box("solid", 0.12, 2.2, 0.08, x + 0.7, 4.6, z, 0xd8d8e0, 0, 0, -0.2);
  m.box("solid", 0.2, 1.0, 0.8, x - 0.5, 4.2, z, 0x9a2c34);
}

function coveredBridge(m: Merge, a: { x: number; z: number; r: number }, b: { x: number; z: number; r: number }, y: number) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) - a.r - b.r + 1.5, ang = -Math.atan2(dz, dx), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  m.at(cx, cz);
  m.box("solid", len, 2.6, 2.4, cx, y, cz, 0x8a6a45, ang);
  m.box("solid", len + 0.6, 0.45, 3.0, cx, y - 1.5, cz, STONE_D, ang);
  m.box("solid", len, 0.2, 2.6, cx, y + 0.4, cz, 0x4a3320, ang); // viga
  const sh = new THREE.Shape(); sh.moveTo(-1.7, 0); sh.lineTo(1.7, 0); sh.lineTo(0, 1.5); sh.closePath();
  const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(len + 0.6) / 2); rg.rotateY(Math.PI / 2);
  m.put("solid", rg, 0x3b4350, cx, y + 1.3, cz, ang);
  const nPos = Math.max(3, Math.floor(len / 2.2));
  for (let k = 0; k < nPos; k++) {
    const f = (k + 0.5) / nPos - 0.5, px = cx + Math.cos(ang) * f * len, pz = cz - Math.sin(ang) * f * len;
    for (const s of [-1, 1]) m.box("glow", 0.9, 1.1, 0.12, px + Math.sin(ang) * s * 1.22, y + 0.1, pz + Math.cos(ang) * s * 1.22, WARM, ang + Math.PI / 2 * 0);
  }
}

export function castle(m: Merge, labels: THREE.Object3D, ctx: Ctx) {
  const { x0, x1, z0, z1 } = CASTLE_RECT, H = CASTLE.wallH, T = CASTLE.wallT, g = CASTLE.gateHalf;
  m.at(0, -66);
  // lienzos de muralla: talud, almenas dobles, contrafuertes y saeteras en las caras visibles
  const wall = (ax: number, az: number, bx: number, bz: number, outward: number) => {
    const len = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, along = Math.abs(bx - ax) > Math.abs(bz - az);
    m.at(cx, cz);
    m.box("solid", along ? len : T, H, along ? T : len, cx, H / 2, cz, STONE);
    m.box("solid", along ? len : T + 0.9, 1.2, along ? T + 0.9 : len, cx, 0.6, cz, STONE_D);
    m.box("solid", along ? len : T + 0.7, 0.7, along ? T + 0.7 : len, cx, H + 0.3, cz, STONE_D);
    for (let s = 1; s < len - 1; s += 2.2) {
      const px = along ? ax + Math.sign(bx - ax) * s : ax, pz = along ? az : az + Math.sign(bz - az) * s;
      for (const o of [-T / 2 + 0.3, T / 2 - 0.3]) m.box("solid", along ? 1.2 : 0.7, 1.4, along ? 0.7 : 1.2, px + (along ? 0 : o), H + 1.35, pz + (along ? o : 0), STONE_L);
    }
    for (let s = 3; s < len - 4; s += 6) {
      const px = along ? ax + Math.sign(bx - ax) * s : ax + outward * (T / 2 + 0.3), pz = along ? az + outward * (T / 2 + 0.3) : az + Math.sign(bz - az) * s;
      m.box("solid", along ? 1.1 : 0.8, H - 1, along ? 0.8 : 1.1, px, (H - 1) / 2 + 0.6, pz, STONE_D);
      const sx = along ? ax + Math.sign(bx - ax) * (s + 3) : ax + outward * (T / 2 + 0.02), sz = along ? az + outward * (T / 2 + 0.02) : az + Math.sign(bz - az) * (s + 3);
      m.box("solid", along ? 0.28 : 0.1, 1.7, along ? 0.1 : 0.28, sx, 4.6, sz, 0x1a1612);
    }
  };
  wall(x0, z1, -g, z1, 1); wall(g, z1, x1, z1, 1); wall(x0, z0, x1, z0, -1); wall(x0, z0, x0, z1, -1); wall(x1, z0, x1, z1, 1);
  // puerta del castillo
  gatehouse(m, 0, z1, 0, 1, { width: g * 2 + 1.0, height: 13.2, depth: T + 0.7, hole: g * 2 - 0.4, holeH: 8 });
  // estandartes largos sobre la muralla sur
  for (const x of [-26, -16, 16, 26]) { m.at(x, z1); m.put("solid", bannerGeo(1.6, 5.2), x < 0 ? 0x2c4a8a : 0xb02a30, x, H - 0.3, z1 + T / 2 + 0.45); }
  // gran salón y pórtico
  greatHall(m, GREAT_HALL, GREAT_PORCH);
  // alas con tejado junto a las murallas
  CASTLE_WINGS.forEach((w, i) => {
    const b: Building = { id: "wing" + i, kind: "house", name: "", x: w.x, z: w.z, w: w.w, d: w.d, h: w.h, floors: 3, wall: w.wall, roof: w.roof, facing: i === 0 ? 3 : 1, style: i === 0 ? "hip" : undefined };
    house(m, b, ctx);
  });
  // torres
  CASTLE_TOWERS.forEach((t, i) => tower(m, t, t.h > 20 || i > 5));
  // pasarelas cubiertas entre torres altas (estilo Hogwarts) con ventanas iluminadas
  const T_ = CASTLE_TOWERS;
  coveredBridge(m, T_[9]!, T_[8]!, 20); coveredBridge(m, T_[7]!, T_[6]!, 33); coveredBridge(m, T_[6]!, T_[8]!, 29); coveredBridge(m, T_[7]!, T_[10]!, 24);
  // viaducto de piedra con arco sobre el acceso al gran salón (entre las dos torres delanteras del patio)
  {
    const a = T_[13]!, b = T_[14]!, len = b.x - a.x - a.r - b.r + 2, cx = (a.x + b.x) / 2, y = 15.4, z = a.z;
    m.at(cx, z);
    m.put("solid", archWallGeo(len, y, 3.0, 13, 11), STONE, cx, 0, z);
    m.box("solid", len + 0.4, 0.5, 3.4, cx, y - 0.1, z, STONE_D);
    m.box("solid", len, 2.7, 2.6, cx, y + 1.4, z, 0x8a6a45);
    const sh = new THREE.Shape(); sh.moveTo(-1.8, 0); sh.lineTo(1.8, 0); sh.lineTo(0, 1.6); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: len + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(len + 0.6) / 2); rg.rotateY(Math.PI / 2);
    m.put("solid", rg, 0x3b4350, cx, y + 2.7, z);
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) m.box("glow", 1.1, 1.2, 0.12, cx + (k - 3) * (len / 7.4), y + 1.5, z + s * 1.36, WARM);
  }
  // patio: parterres, estatua y braseros
  CASTLE_LAWNS.forEach((l, i) => hedgeLawn(m, l, i));
  statue(m, CASTLE_STATUE.x, CASTLE_STATUE.z);
  for (const s of [-1, 1]) { m.at(s * 3.6, z1 + 3); m.cyl("solid", 0.1, 0.1, 1.5, 5, s * (g + 1.4), 0, z1 + 3.4, 0x2a2a2e); m.box("glow", 0.5, 0.35, 0.5, s * (g + 1.4), 1.6, z1 + 3.4, 0xff9a3a); }
  const lab = textSprite("Castillo de " + CITY_NAME, "#ffe9b0", 1.6); lab.position.set(0, 66, -70); labels.add(lab);
}
