import * as THREE from "three";

// Materiales procedurales y efectos de fuego del dragón (sin texturas externas: todo por shader o canvas).
// El modelo viene con colores planos; aquí se enriquece con escamas, vientre claro, cuernos de hueso, membrana con
// venas y brillo de garganta (uniformes por dragón: `glow` antes del fuego, `hurt` al encajar un golpe).

export interface DragonU { glow: { value: number }; hurt: { value: number } }
export const newU = (): DragonU => ({ glow: { value: 0 }, hurt: { value: 0 } });

const HASH = "float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}";
const BIND = "vP = vec3(position.x, position.z, -position.y) * 71.; vN = vec3(normal.x, normal.z, -normal.y); vT = aTag;"; // posición/normal en el marco del modelo (pose de reposo)

/** Marca cada vértice con los pesos de huesos que interesan al shader: (cuerno, cabeza/garganta, garra) o (huesos del ala). Una sola vez por geometría. */
export function tagGeometry(m: THREE.SkinnedMesh) {
  const g = m.geometry; if (g.getAttribute("aTag")) return;
  const names = m.skeleton.bones.map(b => b.name), si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight");
  const wing = m.material && (m.material as THREE.Material).name === "Green";
  const k = (n: string): [number, number, number] => wing
    ? [/^(Finger|Arm|Forearm|Elbow|Bone|Claw)/.test(n) ? 1 : 0, 0, 0]
    : [/^Horn.00[23]$/.test(n) ? 1 : 0, /^(Head|Skull|Jaw|Cheek)/.test(n) ? 1 : /^Spine009$/.test(n) ? 0.45 : /^Spine008$/.test(n) ? 0.2 : 0, /^Claw|^Foot/.test(n) ? 1 : 0];
  const a = new Float32Array(si.count * 3);
  for (let i = 0; i < si.count; i++) {
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c); if (w <= 0) continue;
      const t = k(names[si.getComponent(i, c)] ?? "");
      if (wing) { a[i * 3] = Math.max(a[i * 3]!, w); a[i * 3 + 1]! += t[0] * w; } // pureza (1 sobre un hueso) y peso de los huesos del ala
      else { a[i * 3]! += t[0] * w; a[i * 3 + 1]! += t[1] * w; a[i * 3 + 2]! += t[2] * w; }
    }
  }
  g.setAttribute("aTag", new THREE.BufferAttribute(a, 3));
}

function patch(m: THREE.MeshStandardMaterial, key: string, u: DragonU, frag: string, emis: string) {
  m.customProgramCacheKey = () => key; // los dragones comparten el programa; solo cambian los uniformes
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = u.glow; sh.uniforms.uHurt = u.hurt;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aTag; varying vec3 vP, vN, vT;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + BIND);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow, uHurt; varying vec3 vP, vN, vT;\n" + HASH)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + frag)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + emis);
  };
  return m;
}

/** Piel: escamas en hileras desfasadas, lomo pardo-rojizo, vientre claro a bandas, cuernos y garras de hueso, grietas que brillan con `glow`. */
export function skinMaterial(u: DragonU) {
  return patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.08 }), "dragon-skin", u, `
    vec3 n = normalize(vN), an = abs(n);
    vec2 q = an.y > max(an.x, an.z) ? vP.xz : (an.x > an.z ? vP.zy : vP.xy);
    q *= 6.5; q.x += floor(q.y) * 0.5;
    vec2 id = floor(q), f = fract(q);
    float h = hs(id), d = length((f - vec2(0.5, 0.4)) * vec2(1.0, 1.1));
    lit = 1.0 - smoothstep(0.26, 0.66, d);
    vec3 c = mix(vec3(0.028, 0.07, 0.05), vec3(0.085, 0.2, 0.09), h * h);
    c = mix(c, vec3(0.14, 0.085, 0.03), step(0.88, h) * 0.7);
    float ridge = (1.0 - smoothstep(0.06, 0.2, abs(vP.x))) * smoothstep(0.6, 0.9, n.y);
    c = mix(c, vec3(0.16, 0.05, 0.02), ridge * 0.6);
    c *= 0.4 + 0.85 * lit;
    float belly = 1.0 - smoothstep(-0.55, -0.1, n.y);
    c = mix(c, vec3(0.42, 0.3, 0.11) * (0.6 + 0.4 * smoothstep(0.3, 0.55, fract(vP.z * 3.4))) * (0.75 + 0.3 * lit), belly);
    c = mix(c, vec3(0.55, 0.46, 0.28) * (0.7 + 0.4 * smoothstep(3.0, 4.3, vP.y)), clamp(vT.x * 1.4, 0., 1.)); // cuernos
    c = mix(c, vec3(0.1, 0.085, 0.06), clamp(vT.z * 1.5, 0., 1.)); // garras
    diffuseColor.rgb = c;`.replace("lit = ", "float lit = "), `
    totalEmissiveRadiance += vec3(1.0, 0.34, 0.05) * uGlow * vT.y * (0.12 + 0.8 * (1.0 - lit)) * 0.7 + vec3(0.7, 0.05, 0.02) * uHurt * 0.35;`);
}

/** Membrana: translúcida, verde-pardo con huesos y venas oscuros, borde claro y brillo cálido a contraluz. */
export function wingMaterial(u: DragonU) {
  const m = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }), "dragon-wing", u, `
    vec2 wv = vec2(abs(vP.x) - 5.21, vP.z - 1.34); float wd = length(wv), wa = atan(wv.y, wv.x);
    const float FA[4] = float[4](-0.625, -0.984, -1.452, -1.967);
    float vein = 0.0;
    for (int i = 0; i < 4; i++) {
      vein = max(vein, 1.0 - smoothstep(0.035, 0.12, abs(sin(wa - FA[i])) * wd));
      if (i < 3) vein = max(vein, 0.55 * (1.0 - smoothstep(0.02, 0.07, abs(sin(wa - 0.5 * (FA[i] + FA[i + 1]))) * wd)));
    }
    float bone = vein;
    float edge = smoothstep(0.5, 6.5, abs(vP.x));
    float mot = vn(vP.xz * 2.2);
    vec3 c = mix(vec3(0.025, 0.012, 0.012), vec3(0.07, 0.034, 0.03), edge * (0.45 + 0.55 * mot));
    c = mix(c, vec3(0.045, 0.02, 0.016), (1.0 - edge) * 0.4 * mot);
    c = mix(c, vec3(0.02, 0.012, 0.012), vein);
    diffuseColor.rgb = c; diffuseColor.a *= mix(1.0, 0.82, edge * (1.0 - vein));`, `
    float fr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += vec3(0.5, 0.16, 0.03) * (0.04 + fr * 0.22) * (1.0 - bone) + vec3(0.7, 0.05, 0.02) * uHurt * 0.4;`);
  return m;
}

/** Materiales simples de ojos, boca, dientes y garras; devuelve el mapa por nombre del material original. */
export function plainMaterials() {
  const mk = (color: number, rough: number, emissive = 0x000000) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, emissive });
  return { Yellow: mk(0xe0a010, 0.25, 0xffa000), Red: mk(0x5a1018, 0.35, 0xff4a08), Teeth: mk(0xd8cba3, 0.45, 0xff6a10), Black: mk(0x14110e, 0.6) };
}

// ---------------------------------------------------------------------------------------------------------------
// Fuego: dos nubes de puntos (llamas aditivas y humo normal) con reserva fija de partículas (sin crear objetos por fotograma).

let tex: THREE.Texture | null = null;
function softTex() {
  if (tex) return tex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,0.7)"); gr.addColorStop(0.65, "rgba(255,255,255,0.2)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (tex = new THREE.CanvasTexture(c));
}

const S = 10; // x y z vx vy vz edad vida tamaño tipo
export const CORE = 0, FLAME = 1, EMBER = 2, SMOKE = 3;

class Pool {
  readonly pts: THREE.Points; live = 0;
  private d: Float32Array; private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute; private siz: THREE.BufferAttribute;
  private cur = 0; private was = false;
  constructor(private n: number, additive: boolean, scale: number, order: number, readonly extra = 0) {
    this.d = new Float32Array(n * S);
    const tot = n + extra, geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(tot * 3), 3); this.col = new THREE.BufferAttribute(new Float32Array(tot * 4), 4); this.siz = new THREE.BufferAttribute(new Float32Array(tot), 1);
    geo.setAttribute("position", this.pos); geo.setAttribute("color", this.col); geo.setAttribute("aSize", this.siz);
    const m = new THREE.PointsMaterial({ size: scale, map: softTex(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aSize;").replace("gl_PointSize = size;", "gl_PointSize = size * aSize;");
    };
    m.customProgramCacheKey = () => "dragon-pts";
    this.pts = new THREE.Points(geo, m); this.pts.frustumCulled = false; this.pts.visible = false; this.pts.renderOrder = order;
  }
  add(k: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    const o = this.cur * S; this.cur = (this.cur + 1) % this.n; const d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = 0; d[o + 7] = life; d[o + 8] = size; d[o + 9] = k;
  }
  /** Punto fijo extra (resplandor de la boca): alfa 0 lo apaga. */
  halo(x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number) {
    const i = this.n; this.pos.setXYZ(i, x, y, z); this.col.setXYZ(i, r, g, b); this.col.setW(i, a); this.siz.setX(i, size); this.haloOn = a > 0.01;
  }
  haloOn = false;
  step(dt: number, t: number, smoke: Pool | null) {
    const d = this.d; let live = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S, life = d[o + 7]!;
      if (life <= 0) continue;
      const age = (d[o + 6]! += dt), k = age / life;
      if (k >= 1) {
        if (smoke && d[o + 9]! === FLAME && Math.random() < 0.3) smoke.add(SMOKE, d[o]!, d[o + 1]!, d[o + 2]!, d[o + 3]! * 0.25, d[o + 4]! * 0.25 + 1.4, d[o + 5]! * 0.25, 1.6 + Math.random() * 0.9, 1.3);
        d[o + 7] = 0; this.pos.setXYZ(i, 0, 0, 0); this.col.setW(i, 0); continue;
      }
      live++;
      const kind = d[o + 9]!, dr = Math.exp(-dt * (kind === SMOKE ? 1.2 : kind === EMBER ? 0.6 : 1.1));
      d[o + 3]! *= dr; d[o + 5]! *= dr; d[o + 4] = d[o + 4]! * dr + dt * (kind === EMBER ? -4.5 : kind === SMOKE ? 1.2 : 3.2);
      d[o]! += d[o + 3]! * dt; d[o + 1]! += d[o + 4]! * dt; d[o + 2]! += d[o + 5]! * dt;
      this.pos.setXYZ(i, d[o]!, d[o + 1]!, d[o + 2]!);
      let r = 1, g = 1, b = 1, a = 1, s = d[o + 8]!;
      if (kind === CORE) { r = 1; g = 0.8 - k * 0.4; b = 0.35 - k * 0.3; a = (1 - k) * 0.7; s *= 1 + k * 1.3; }
      else if (kind === FLAME) { r = 1 - k * 0.25; g = 0.55 - k * 0.48; b = 0.08 - k * 0.07; a = Math.min(1, k * 8) * (1 - k) * 0.8; s *= 1 + k * 2.2; }
      else if (kind === EMBER) { r = 1; g = 0.55 - k * 0.3; b = 0.15; a = (1 - k) * (0.5 + 0.4 * Math.sin(t * 40 + i)); }
      else { const v = 0.1 + k * 0.05; r = v * 1.1; g = v; b = v * 0.95; a = Math.min(1, k * 5) * (1 - k) * 0.32; s *= 1 + k * 2.4; }
      this.col.setXYZ(i, r, g, b); this.col.setW(i, a); this.siz.setX(i, s);
    }
    this.live = live;
    const on = live > 0 || this.haloOn;
    if (on || this.was) { this.pos.needsUpdate = this.col.needsUpdate = this.siz.needsUpdate = true; }
    this.was = on; this.pts.visible = on;
  }
  dispose() { this.pts.geometry.dispose(); (this.pts.material as THREE.Material).dispose(); }
}

export class FireFx {
  readonly core: Pool; readonly flame: Pool; readonly smoke: Pool;
  /** Nubes de puntos a colgar del dragón (humo, llamas, núcleo y ascuas aditivos). */
  readonly pts: THREE.Points[];
  private acc = [0, 0, 0]; private accS = 0;
  constructor(scale: number) {
    this.smoke = new Pool(40, false, scale, 5); this.flame = new Pool(150, false, scale, 6); this.core = new Pool(140, true, scale, 7, 1);
    this.pts = [this.smoke.pts, this.flame.pts, this.core.pts];
  }
  /** Emite durante `dt` desde (x,y,z) hacia (dx,dy,dz) unitario; `power` 0..1 modula el caudal. Marco del modelo. */
  spray(dt: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, power: number) {
    const a = this.acc; a[0]! += dt * 90 * power; a[1]! += dt * 150 * power; a[2]! += dt * 40 * power;
    let ux = dz, uy = 0, uz = -dx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; // lateral
    const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux; // arriba aproximado
    const sp = (p: Pool, v: number, c: number, e: number, kind: number, life: number, size: number) => {
      const s1 = (Math.random() - 0.5) * c, s2 = (Math.random() - 0.5) * c;
      p.add(kind, x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, (dx + ux * s1 + wx * s2) * v, (dy + uy * s1 + wy * s2) * v + e, (dz + uz * s1 + wz * s2) * v, life, size);
    };
    while (a[0]! >= 1) { a[0]!--; sp(this.core, 17 + Math.random() * 7, 0.14, 0, CORE, 0.3 + Math.random() * 0.2, 1.1); }
    while (a[1]! >= 1) { a[1]!--; sp(this.flame, 13 + Math.random() * 9, 0.5, 0.5, FLAME, 0.55 + Math.random() * 0.4, 1.9); }
    while (a[2]! >= 1) { a[2]!--; sp(this.core, 8 + Math.random() * 14, 0.9, 1.5, EMBER, 0.8 + Math.random() * 0.9, 0.3); }
  }
  /** Hilo de humo (nariz, boca, cadáver). */
  puff(dt: number, rate: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.accS += dt * rate;
    while (this.accS >= 1) { this.accS--; this.smoke.add(SMOKE, x, y, z, vx + (Math.random() - 0.5) * 0.8, vy + Math.random() * 0.6, vz + (Math.random() - 0.5) * 0.8, 1.8 + Math.random(), 0.8); }
  }
  /** Resplandor aditivo en la boca (alfa 0 lo apaga). */
  glow(x: number, y: number, z: number, a: number, size: number) { this.core.halo(x, y, z, 1, 0.5 + a * 0.15, 0.1, a, size); }
  step(dt: number, t: number) { this.core.step(dt, t, null); this.flame.step(dt, t, this.smoke); this.smoke.step(dt, t, null); }
  get active() { return this.core.live > 0 || this.flame.live > 0 || this.smoke.live > 0 || this.core.haloOn; }
  dispose() { this.core.dispose(); this.flame.dispose(); this.smoke.dispose(); }
}
