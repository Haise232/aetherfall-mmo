import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LAKE, PIER } from "@mmorpg/shared";
import { hash2 } from "./kit";

// El lago: agua con shader propio (olas, reflejo del cielo, brillos del sol o la luna, profundidad, espuma de orilla y ondas),
// fondo con degradado, orilla húmeda, piedras, juncos que se mecen, nenúfares con flor y peces que saltan. Todo procedural.
// El color y el brillo salen de las luces del ciclo de día y noche (sky.ts las mueve): de noche el agua se oscurece.

const MAX_RIP = 12;
const vert = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = /* glsl */`
uniform float uTime, uR;
uniform vec2 uC;
uniform vec3 uSunDir, uSunCol, uAmb, uHor, uSky, uShallow, uDeep;
uniform vec4 uRip[${MAX_RIP}];
varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// pendiente de la superficie: suma de ondas largas y un ruido fino que avanza
vec2 slope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.80, 0.60) * cos(dot(p, vec2(0.80, 0.60)) * 0.90 + t * 0.9) * 0.050;
  g += vec2(-0.60, 0.80) * cos(dot(p, vec2(-0.60, 0.80)) * 1.30 + t * 1.2) * 0.035;
  g += vec2(0.96, -0.28) * cos(dot(p, vec2(0.96, -0.28)) * 2.10 + t * 1.7) * 0.022;
  g += vec2(-0.30, -0.95) * cos(dot(p, vec2(-0.30, -0.95)) * 3.30 + t * 2.3) * 0.014;
  float e = 0.15; vec2 q = p * 1.6 + vec2(t * 0.25, -t * 0.18);
  g += vec2(vn(q + vec2(e, 0.0)) - vn(q - vec2(e, 0.0)), vn(q + vec2(0.0, e)) - vn(q - vec2(0.0, e))) * 0.10;
  return g;
}
void main() {
  vec2 p = vW.xz, d0 = p - uC;
  float L0 = length(d0), dn = L0 / uR, edge = uR - L0;           // edge: metros hasta la orilla
  vec2 g = slope(p, uTime) * smoothstep(-0.2, 1.5, edge);        // junto a la orilla casi no hay oleaje
  float ring = 0.0;
  for (int i = 0; i < ${MAX_RIP}; i++) {                          // ondas de quien nada o de un pez que salta
    vec4 r = uRip[i]; float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 4.0) continue;
    vec2 d = p - r.xy; float L = length(d) + 1e-4, rad = 0.4 + age * 1.9, k = (L - rad) * 3.2;
    float env = exp(-k * k) * (1.0 - age * 0.25) * r.w * smoothstep(0.0, 0.25, age + 0.1);
    float w = sin((L - rad) * 9.0);
    g += d / L * w * env * 0.30; ring += env * (0.5 + 0.5 * w);
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float nv = max(dot(n, V), 0.0);
  float depthK = smoothstep(1.5, 24.0, edge + (vn(p * 0.35) - 0.5) * 3.0); // 0 junto a la orilla, 1 en el centro
  vec3 body = mix(uShallow, uDeep, depthK);
  vec3 lit = uAmb + uSunCol * 0.16 * max(n.y, 0.0);
  vec3 col = body * lit;
  // reflejo del cielo (más fuerte al mirar rasante) y brillo del sol o la luna
  vec3 R = reflect(-V, n);
  vec3 refl = mix(uHor, uSky, smoothstep(0.0, 0.7, R.y));
  float fres = 0.10 + 0.85 * pow(1.0 - nv, 3.0);
  col = mix(col, refl, fres);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), 150.0) * 1.6 + pow(max(dot(n, H), 0.0), 18.0) * 0.07;
  float spark = smoothstep(0.78, 1.0, vn(p * 2.4 + vec2(uTime * 0.5, uTime * 0.3))) * smoothstep(0.55, 1.0, max(dot(n, H), 0.0) * 1.0 + 0.0);
  col += uSunCol * (spec + spark * 0.5) * (0.4 + 0.6 * smoothstep(0.0, 0.5, uSunDir.y));
  col += refl * ring * 0.22;
  // espuma: franja en la orilla que va y viene, con ruido
  float lap = 0.45 + 0.35 * sin(uTime * 0.9 + atan(d0.y, d0.x) * 4.0) + (vn(p * 1.1 + uTime * 0.15) - 0.5) * 0.6;
  float foam = smoothstep(lap + 0.35, lap - 0.05, edge) * (0.5 + 0.5 * vn(p * 3.0 - uTime * 0.2));
  foam *= step(-0.2, edge);
  vec3 foamCol = (uAmb + uSunCol * 0.1) * vec3(0.95, 1.0, 1.0);
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.85);
  float alpha = mix(0.5, 0.97, smoothstep(0.0, 6.0, edge)) + fres * 0.2 + ring * 0.12;
  alpha = clamp(alpha + foam * 0.5, 0.0, 1.0) * smoothstep(-0.25, 0.35, edge);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const sinTmp = new THREE.Color();
export interface Lake {
  /** Onda circular en la superficie (nada, salto de pez...). `amp` ~ 1. */
  ripple(x: number, z: number, amp?: number): void;
  /** Color de las gotas, según la luz del momento. */
  readonly tone: THREE.Color;
  update(dt: number, t: number, focus: THREE.Vector3, lightDir?: THREE.Vector3): void;
  /** Cota de la superficie (con el oleaje, para colocar cosas que flotan). */
  level(t: number): number;
}
export interface LakeSplash { splash(x: number, z: number, n: number, power: number): void }

export function createLake(root: THREE.Group, scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, splash: () => LakeSplash | undefined): Lake {
  const R = LAKE.r;
  const ground = (geo: THREE.BufferGeometry, y: number, mat: THREE.Material) => {
    geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, mat);
    mat.polygonOffset = true; mat.polygonOffsetFactor = mat.polygonOffsetUnits = -Math.round(y * 100); m.renderOrder = y; m.position.set(LAKE.x, y, LAKE.z); m.receiveShadow = true; root.add(m); return m;
  };
  // --- Fondo y orilla (colores por vértice: arena clara en el borde, verdín y tinieblas hacia el centro) ---
  const paint = (geo: THREE.RingGeometry, f: (rad: number, x: number, y: number, c: THREE.Color) => void) => {
    const p = geo.attributes.position!, cols = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { f(Math.hypot(p.getX(i), p.getY(i)), p.getX(i), p.getY(i), c); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  };
  const stops = [[1.0, 0xcdbb8c], [0.88, 0xb2b48c], [0.65, 0x6f8f86], [0.35, 0x34606a], [0, 0x1c3d52]].map(([k, c]) => [k as number, new THREE.Color(c as number)] as const);
  const bedGeo = new THREE.RingGeometry(0.01, R + 0.3, 72, 14);
  paint(bedGeo, (rad, x, y, c) => {
    const k = Math.min(1, rad / R); let i = 0; while (i < stops.length - 2 && k < stops[i + 1]![0]) i++;
    const a = stops[i]!, b = stops[i + 1]!; c.copy(b[1]).lerp(a[1], THREE.MathUtils.clamp((k - b[0]) / (a[0] - b[0]), 0, 1));
    c.multiplyScalar(0.82 + hash2(Math.round(x * 0.4), Math.round(y * 0.4)) * 0.3);
  });
  ground(bedGeo, 0.025, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  const wet = new THREE.Color(0x6e6046), dry = new THREE.Color(0xb5a373), grass = new THREE.Color(0x7a8a4c);
  const shoreGeo = new THREE.RingGeometry(R + 0.25, R + 5, 72, 6);
  paint(shoreGeo, (rad, x, y, c) => {
    const d = rad - R; c.copy(wet).lerp(dry, THREE.MathUtils.smoothstep(d, 0.2, 1.4)).lerp(grass, THREE.MathUtils.smoothstep(d, 2.6, 5) * 0.8);
    c.multiplyScalar(0.9 + hash2(Math.round(x * 0.5), Math.round(y * 0.5)) * 0.2);
  });
  ground(shoreGeo, 0.027, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));

  // --- Agua ---
  const rip = Array.from({ length: MAX_RIP }, () => new THREE.Vector4(0, 0, -99, 0));
  const U = {
    uTime: { value: 0 }, uR: { value: R }, uC: { value: new THREE.Vector2(LAKE.x, LAKE.z) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.9, 0.2) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color(0x45c4bd) }, uDeep: { value: new THREE.Color(0x1b5fa8) }, uRip: { value: rip },
  };
  const waterMat = new THREE.ShaderMaterial({ uniforms: Object.assign(U, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), vertexShader: vert, fragmentShader: frag, transparent: true, fog: true, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }); // por delante del fondo y la orilla (que llevan -3) incluso en ángulos rasantes
  const water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.4, 96).rotateX(-Math.PI / 2), waterMat);
  water.position.set(LAKE.x, 0.06, LAKE.z); water.renderOrder = 0.06; water.frustumCulled = false; root.add(water);
  let ripN = 0;

  // --- Piedras de la orilla (bajas: no estorban al andar) ---
  {
    const geo = new THREE.DodecahedronGeometry(1, 0), n = 52, rocks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), n), o = new THREE.Object3D(), col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < 90 && k < n; i++) {
      const a = hash2(i, 41) * 6.283, rr = R + 0.4 + Math.pow(hash2(i, 42), 1.6) * 2.8, x = LAKE.x + Math.cos(a) * rr, z = LAKE.z + Math.sin(a) * rr;
      if (x > PIER.x0 - PIER.len - 2 && x < PIER.x0 + 2 && Math.abs(z - PIER.z) < 3.2) continue;
      const s = 0.18 + hash2(i, 43) * 0.42;
      o.position.set(x, s * 0.12, z); o.rotation.set(hash2(i, 44) * 3, hash2(i, 45) * 6, hash2(i, 46) * 3); o.scale.set(s * (1 + hash2(i, 47) * 0.6), s * 0.55, s * (0.8 + hash2(i, 48) * 0.5)); o.updateMatrix();
      rocks.setMatrixAt(k, o.matrix); rocks.setColorAt(k, col.setHSL(0.09 + hash2(i, 49) * 0.05, 0.08 + hash2(i, 50) * 0.1, 0.34 + hash2(i, 51) * 0.22)); k++;
    }
    rocks.count = k; rocks.castShadow = true; rocks.receiveShadow = true; root.add(rocks);
  }

  // --- Juncos que se mecen (el balanceo va en el shader de vértices) ---
  const swayT = { value: 0 };
  {
    const blade = (h: number, tilt: number, ry: number, c0: number, c1: number) => {
      const g = new THREE.ConeGeometry(0.045, h, 3, 3, true); g.translate(0, h / 2, 0); g.rotateZ(tilt); g.rotateY(ry);
      const p = g.attributes.position!, cols = new Float32Array(p.count * 3), a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
      for (let i = 0; i < p.count; i++) { t.copy(a).lerp(b, Math.min(1, p.getY(i) / h)); cols[i * 3] = t.r; cols[i * 3 + 1] = t.g; cols[i * 3 + 2] = t.b; }
      g.setAttribute("color", new THREE.BufferAttribute(cols, 3)); return g;
    };
    const cattail = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6); cattail.translate(0, 1.25, 0);
    { const p = cattail.attributes.position!, cols = new Float32Array(p.count * 3), c = new THREE.Color(0x6a4a2c); for (let i = 0; i < p.count; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; } cattail.setAttribute("color", new THREE.BufferAttribute(cols, 3)); }
    const clump = mergeGeometries([blade(1.5, 0.04, 0, 0x2c4a22, 0x7fa84a), blade(1.2, -0.16, 2.1, 0x2c4a22, 0x6e9a40), blade(1.0, 0.2, 4.0, 0x2c4a22, 0x86b052), blade(1.35, -0.07, 5.2, 0x2c4a22, 0x76a244), cattail].map(g => g.toNonIndexed()))!;
    const n = 170, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = swayT;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
        float sw = transformed.y * transformed.y * 0.10; vec3 ip = instanceMatrix[3].xyz;
        transformed.x += (sin(uTime * 1.7 + ip.x * 0.9 + ip.z * 0.6) + sin(uTime * 3.1 + ip.z) * 0.3) * sw * 0.5;
        transformed.z += cos(uTime * 1.3 + ip.z * 0.8 + ip.x * 0.4) * sw * 0.4;`);
    };
    const reeds = new THREE.InstancedMesh(clump, mat, n), o = new THREE.Object3D(), col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < 260 && k < n; i++) {
      const a = hash2(i, 21) * 6.283, rr = R - 0.3 + Math.pow(hash2(i, 22), 1.3) * 3.4, x = LAKE.x + Math.cos(a) * rr, z = LAKE.z + Math.sin(a) * rr;
      if (x > PIER.x0 - PIER.len - 3 && x < PIER.x0 + 3 && Math.abs(z - PIER.z) < 3.5) continue;
      o.position.set(x, 0.03, z); o.rotation.set(0, hash2(i, 24) * 6, 0); o.scale.setScalar(0.7 + hash2(i, 23) * 0.8); o.updateMatrix();
      reeds.setMatrixAt(k, o.matrix); reeds.setColorAt(k, col.setHSL(0.22 + hash2(i, 25) * 0.05, 0.1, 0.8 + hash2(i, 26) * 0.35)); k++;
    }
    reeds.count = k; reeds.frustumCulled = true; root.add(reeds);
  }

  // --- Nenúfares (con flor algunos) que suben y bajan con el agua ---
  const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 12, 0.35, 5.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -14, polygonOffsetUnits: -14 }), 34);
  const padData = Array.from({ length: 34 }, (_, i) => { const a = hash2(i, 31) * 6.28, rr = Math.sqrt(hash2(i, 32)) * (R - 4) * 0.95 + 2; return { x: LAKE.x + Math.cos(a) * rr, z: LAKE.z + Math.sin(a) * rr, s: 0.7 + hash2(i, 34), ry: hash2(i, 33) * 6, flower: i % 3 === 0 }; })
    .filter(p => !(p.x > PIER.x0 - PIER.len - 2 && p.z > PIER.z - 4 && p.z < PIER.z + 4));
  pads.count = padData.length;
  const petal = (i: number) => { const g = new THREE.ConeGeometry(0.075, 0.26, 4); g.translate(0, 0.13, 0); g.rotateX(0.85); g.translate(0, 0, 0.07); g.rotateY((i / 8) * Math.PI * 2); return g; };
  const bloom = mergeGeometries([...Array.from({ length: 8 }, (_, i) => petal(i)), new THREE.SphereGeometry(0.07, 6, 5).translate(0, 0.07, 0)].map((g, i) => {
    const ng = g.toNonIndexed(), cols = new Float32Array(ng.attributes.position!.count * 3), c = new THREE.Color(i < 8 ? 0xffffff : 0xf2c14e);
    for (let j = 0; j < ng.attributes.position!.count; j++) { cols[j * 3] = c.r; cols[j * 3 + 1] = c.g; cols[j * 3 + 2] = c.b; } ng.setAttribute("color", new THREE.BufferAttribute(cols, 3)); return ng;
  }))!;
  const flowers = padData.filter(p => p.flower);
  const blooms = new THREE.InstancedMesh(bloom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, flatShading: true }), Math.max(1, flowers.length));
  flowers.forEach((_, i) => blooms.setColorAt(i, new THREE.Color([0xffd6e6, 0xffffff, 0xf2b8ff, 0xffe9f2][i % 4]!)));
  pads.frustumCulled = blooms.frustumCulled = false; root.add(pads, blooms);
  const od = new THREE.Object3D(), tilt = new THREE.Vector3();
  const bob = (t: number, x: number, z: number) => 0.062 + Math.sin(t * 1.1 + x * 0.3 + z * 0.2) * 0.008;
  const updatePads = (t: number) => {
    padData.forEach((p, i) => { od.position.set(p.x, bob(t, p.x, p.z), p.z); od.rotation.set(Math.sin(t * 0.9 + p.x) * 0.03, p.ry + Math.sin(t * 0.2 + i) * 0.1, Math.cos(t * 0.8 + p.z) * 0.03); od.scale.setScalar(p.s); od.updateMatrix(); pads.setMatrixAt(i, od.matrix); });
    flowers.forEach((p, i) => { od.position.set(p.x, bob(t, p.x, p.z) + 0.01, p.z); od.rotation.set(0, p.ry, 0); od.scale.setScalar(p.s * (0.9 + Math.sin(t * 0.5 + i) * 0.05)); od.updateMatrix(); blooms.setMatrixAt(i, od.matrix); });
    pads.instanceMatrix.needsUpdate = blooms.instanceMatrix.needsUpdate = true;
  };
  updatePads(0); void tilt;

  // --- Peces que saltan de vez en cuando ---
  const fishGeo = (() => {
    const body = new THREE.SphereGeometry(0.5, 8, 6).scale(0.55, 0.2, 0.18).toNonIndexed(), tail = new THREE.ConeGeometry(0.16, 0.3, 4).rotateZ(Math.PI / 2).rotateX(Math.PI / 4).translate(-0.34, 0, 0).toNonIndexed();
    const g = mergeGeometries([body, tail])!, cols = new Float32Array(g.attributes.position!.count * 3), c = new THREE.Color();
    for (let i = 0; i < g.attributes.position!.count; i++) { const y = g.attributes.position!.getY(i); c.set(0x5d7fa0).lerp(sinTmp.set(0xe9eef0), THREE.MathUtils.smoothstep(-y, -0.02, 0.1)); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3)); return g;
  })();
  const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3, flatShading: true });
  const fish = Array.from({ length: 4 }, (_, i) => {
    const m = new THREE.Mesh(fishGeo, fishMat); m.visible = false; m.scale.setScalar(1.3 + hash2(i, 60) * 0.7); m.frustumCulled = false; root.add(m);
    return { m, wait: 3 + i * 3.5 + hash2(i, 61) * 5, t: -1, x: 0, z: 0, dx: 1, dz: 0, len: 2, h: 0.8, dur: 0.8, i, n: 0 };
  });
  const updateFish = (dt: number, near: boolean) => {
    for (const f of fish) {
      if (f.t < 0) {
        f.wait -= dt; if (f.wait > 0) continue;
        f.wait = 6 + hash2(f.i, f.n * 7 + 3) * 14; f.n++;
        const a = hash2(f.i + 5, f.n * 3) * 6.28, rr = Math.sqrt(hash2(f.i + 9, f.n * 5)) * (R - 9) + 2, b = hash2(f.i + 1, f.n * 11) * 6.28;
        f.x = LAKE.x + Math.cos(a) * rr; f.z = LAKE.z + Math.sin(a) * rr; f.dx = Math.cos(b); f.dz = Math.sin(b);
        f.len = 1.6 + hash2(f.i, f.n) * 1.4; f.h = 0.5 + hash2(f.n, f.i) * 0.6; f.dur = 0.65 + f.h * 0.3;
        if (!near) continue;
        f.t = 0; lakeApi.ripple(f.x, f.z, 0.8); splash()?.splash(f.x, f.z, 8, 1.1);
        continue;
      }
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.t = -1; f.m.visible = false; const ex = f.x + f.dx * f.len, ez = f.z + f.dz * f.len; lakeApi.ripple(ex, ez, 1); lakeApi.ripple(ex, ez, 0.6); splash()?.splash(ex, ez, 12, 1.3); continue; }
      f.m.visible = true;
      f.m.position.set(f.x + f.dx * f.len * k, 0.06 + 4 * f.h * k * (1 - k), f.z + f.dz * f.len * k);
      const slope = 4 * f.h * (1 - 2 * k) / f.len; // cabeceo según suba o baje
      f.m.rotation.set(0, Math.atan2(-f.dz, f.dx), Math.atan(slope) + Math.sin(f.t * 28) * 0.15, "YXZ");
    }
  };

  const ambC = new THREE.Color(), skyC = new THREE.Color();
  const lakeApi: Lake = {
    ripple(x, z, amp = 1) { rip[ripN]!.set(x, z, U.uTime.value, amp); ripN = (ripN + 1) % MAX_RIP; },
    tone: new THREE.Color(1, 1, 1),
    level: t => 0.06 + Math.sin(t * 1.1) * 0.012,
    update(dt, t, focus, lightDir) {
      const near = Math.abs(focus.x - LAKE.x) < R + 70 && Math.abs(focus.z - LAKE.z) < R + 70;
      U.uTime.value = t; swayT.value = t;
      if (!near) return;
      const hi = THREE.MathUtils.clamp(hemi.intensity / 1.3, 0, 1);
      U.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity * 0.5);
      ambC.copy(hemi.color).multiplyScalar(0.5 * hemi.intensity); U.uAmb.value.copy(ambC);
      const fogC = scene.fog ? (scene.fog as THREE.Fog).color : hemi.color;
      U.uHor.value.copy(fogC); skyC.copy(hemi.color).multiplyScalar(0.8 * hi * hi); U.uSky.value.copy(skyC);
      if (lightDir) U.uSunDir.value.copy(lightDir);
      lakeApi.tone.copy(ambC).multiplyScalar(2.2).addScalar(0.05);
      water.position.y = lakeApi.level(t);
      updatePads(t);
      updateFish(dt, true);
    },
  };
  return lakeApi;
}
