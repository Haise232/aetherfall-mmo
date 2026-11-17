import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- utilidades comunes del mundo ----------
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Hash determinista en [0,1) a partir de dos números (para variar casas sin consumir el rng). */
export const hash2 = (a: number, b: number) => {
  let h = Math.imul(Math.floor(a * 16) | 0, 374761393) + Math.imul(Math.floor(b * 16) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...extra });

export function noiseTexture(base: number, variance: number, opts: { cell?: number; lines?: number; size?: number; repeat: number; seed?: number }) {
  const size = opts.size ?? 256, c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, r = rng(opts.seed ?? base);
  const b = { r: ((base >> 16) & 255) / 255, g: ((base >> 8) & 255) / 255, b: (base & 255) / 255 }, cell = opts.cell ?? 4; // bytes sRGB directos
  for (let y = 0; y < size; y += cell) for (let x = 0; x < size; x += cell) {
    const v = 1 + (r() - 0.5) * variance;
    g.fillStyle = `rgb(${Math.min(255, b.r * 255 * v)},${Math.min(255, b.g * 255 * v)},${Math.min(255, b.b * 255 * v)})`;
    g.fillRect(x, y, cell, cell);
  }
  if (opts.lines) {
    g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 2;
    const n = opts.lines, s = size / n;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(size, i * s); g.stroke();
      for (let j = 0; j < n; j++) { const off = i % 2 ? s / 2 : 0; g.beginPath(); g.moveTo(j * s + off, i * s); g.lineTo(j * s + off, (i + 1) * s); g.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat);
  t.anisotropy = 4; t.magFilter = THREE.NearestFilter;
  return t;
}

export function textSprite(text: string, color = "#ffe9b0", scale = 1) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 36px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(text, 256, 34);
  g.fillStyle = color; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(8 * scale, 1 * scale, 1); s.renderOrder = 20;
  return s;
}

// ---------- paleta ----------
export const TIMBER = 0x4a3320, STONE = 0xb3ad9f, STONE_D = 0x7d796f, STONE_L = 0xcbc5b6, WOOD = 0x6b4a2b, DOOR = 0x3a2616, WARM = 0xffc766;
export const GLASS = [0x6fb4ff, 0xd9534f, 0xf2c14e, 0x7a62d8, 0x4fbf8a];

// ---------- geometrías reutilizables (siempre se clonan al usarlas) ----------
const cache = new Map<string, THREE.BufferGeometry>();
const memo = (key: string, make: () => THREE.BufferGeometry) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g.clone(); };

/** Forma de ventana/portal con arco apuntado, base en y=0, centrada en x, espesor `d` centrado en z. */
export function archGeo(w: number, h: number, d: number) {
  return memo(`arch${w},${h},${d}`, () => {
    const sh = new THREE.Shape(), s = Math.min(h * 0.45, w * 0.8), hw = w / 2;
    sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, h - s);
    sh.quadraticCurveTo(hw * 0.95, h - s * 0.25, 0, h); sh.quadraticCurveTo(-hw * 0.95, h - s * 0.25, -hw, h - s); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -d / 2); return g;
  });
}
/** Muro con un hueco en arco (puertas de la ciudad, puentes de piedra). */
export function archWallGeo(w: number, h: number, d: number, hole: number, holeH: number) {
  return memo(`aw${w},${h},${d},${hole},${holeH}`, () => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.closePath();
    const ho = new THREE.Path(), hw = hole / 2, s = Math.min(holeH * 0.5, hole * 0.7);
    ho.moveTo(-hw, 0); ho.lineTo(-hw, holeH - s); ho.quadraticCurveTo(-hw * 0.95, holeH - s * 0.25, 0, holeH); ho.quadraticCurveTo(hw * 0.95, holeH - s * 0.25, hw, holeH - s); ho.lineTo(hw, 0); ho.closePath();
    sh.holes.push(ho);
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -d / 2); return g;
  });
}
/** Estandarte con cola de golondrina, colgando desde y=0 hacia abajo (alto h). */
export function bannerGeo(w: number, h: number) {
  return memo(`ban${w},${h}`, () => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, -h); sh.lineTo(0, -h * 0.78); sh.lineTo(-w / 2, -h); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }); g.translate(0, 0, -0.03); return g;
  });
}
/** Banderín triangular apaisado apuntando a +x. */
export function pennantGeo(len: number, h: number) {
  return memo(`pen${len},${h}`, () => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(len, -h * 0.5); sh.lineTo(0, -h); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); g.translate(0, h / 2, -0.025); return g;
  });
}
/** Tejado a cuatro aguas: base w×d (+vuelo), cumbrera de longitud `ridge` a lo largo de x (0 = pirámide). */
export function hipGeo(w: number, d: number, h: number, ridge: number) {
  return memo(`hip${w},${d},${h},${ridge}`, () => {
    const hw = w / 2, hd = d / 2, rx = ridge / 2;
    const b = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]], t = [[-rx, h, 0], [rx, h, 0], [rx, h, 0], [-rx, h, 0]];
    const v: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4; v.push(...b[i]!, ...t[j]!, ...b[j]!, ...b[i]!, ...t[i]!, ...t[j]!);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  });
}
/** Cono de tejado acampanado: un cuerpo cónico con vuelo ligero (faldón) en la base. */
export function flareConeGeo(r: number, h: number, seg: number) {
  return memo(`fc${r},${h},${seg}`, () => {
    const pts = [new THREE.Vector2(r * 1.12, -0.25), new THREE.Vector2(r, 0.0), new THREE.Vector2(r * 0.62, h * 0.2), new THREE.Vector2(r * 0.18, h * 0.62), new THREE.Vector2(0.001, h)];
    return new THREE.LatheGeometry(pts, seg);
  });
}

// ---------- fusión de geometría estática por trozos del mapa ----------
export type Group = "solid" | "glow";
const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
/** Brillo de ventanas, vidrieras y braseros: más apagado de día, pleno de noche. */
export function setWindowGlow(k: number) { glowMat.color.setScalar(k); }

export class Merge {
  private bins = new Map<string, THREE.BufferGeometry[]>();
  private chunk = "0,0";
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3(1, 1, 1);
  tris = 0;
  at(x: number, z: number) { this.chunk = Math.floor(x / 64) + "," + Math.floor(z / 64); }
  /** Añade `geo` (se consume) transformada y teñida. Rotación Euler XYZ y escala opcional. */
  put(group: Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.tmpE.set(rx, ry, rz); this.tmpQ.setFromEuler(this.tmpE); this.tmpP.set(x, y, z); this.tmpS.set(sx, sy, sz);
    geo.applyMatrix4(this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS));
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute("uv"); if (g !== geo) geo.dispose();
    const pos = g.attributes.position!, n = pos.count, arr = new Float32Array(n * 3), col = new THREE.Color(color);
    // variación por pieza y sombra de contacto: más oscuro cerca del suelo (solo materiales sólidos)
    const jit = group === "solid" ? 0.93 + hash2(x * 1.7 + y, z * 2.3) * 0.14 : 1;
    for (let i = 0; i < n; i++) {
      const ao = group === "solid" ? 0.72 + 0.28 * Math.min(1, Math.max(0, pos.getY(i) / 3.2)) : 1;
      const k = jit * ao; arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    if (g.attributes.normal === undefined) g.computeVertexNormals();
    this.tris += n / 3;
    const k = group + ":" + this.chunk;
    const list = this.bins.get(k); if (list) list.push(g); else this.bins.set(k, [g]);
  }
  box(group: Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0, rz = 0) {
    this.put(group, new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, rz);
  }
  /** Cilindro con la base en y. */
  cyl(group: Group, rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: number, ry = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); this.put(group, g, color, x, y, z, ry);
  }
  cone(group: Group, r: number, h: number, seg: number, x: number, y: number, z: number, color: number, ry = 0) {
    const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); this.put(group, g, color, x, y, z, ry);
  }
  /** Tejado a dos aguas con la cumbrera a lo largo de X (alongX) o de Z. */
  prism(span: number, len: number, rh: number, ov: number, x: number, y: number, z: number, color: number, alongX: boolean, ovLen = ov) {
    const sh = new THREE.Shape(); sh.moveTo(-span / 2 - ov, 0); sh.lineTo(span / 2 + ov, 0); sh.lineTo(0, rh); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: len + ovLen * 2, bevelEnabled: false }); g.translate(0, 0, -(len + ovLen * 2) / 2);
    this.put("solid", g, color, x, y, z, alongX ? Math.PI / 2 : 0);
  }
  /** Ventana/portal en arco apuntado en la cara de normal (nx,nz) (unitaria) situado en (x,y,z). */
  arch(group: Group, w: number, h: number, d: number, x: number, y: number, z: number, nx: number, nz: number, color: number) {
    this.put(group, archGeo(w, h, d), color, x, y, z, Math.atan2(nx, nz));
  }
  build(parent: THREE.Object3D, shadows = true) {
    for (const [k, list] of this.bins) {
      const merged = mergeGeometries(list, false); if (!merged) continue;
      const isSolid = k.startsWith("solid");
      const mesh = new THREE.Mesh(merged, isSolid ? solidMat : glowMat);
      mesh.castShadow = isSolid && shadows; mesh.receiveShadow = isSolid;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      for (const g of list) g.dispose();
    }
    this.bins.clear();
  }
}
