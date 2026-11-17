import * as THREE from "three";
import { DAY_CYCLE_SEC } from "@mmorpg/shared";

// Cielo y ciclo de día y noche. La hora sale del reloj (Date.now), así todos los jugadores ven la misma.
// Una cúpula con shader dibuja el degradado, el sol, la luna, las estrellas y las nubes; este módulo además
// mueve la luz direccional (sol de día, luna de noche), la luz ambiente, la niebla y enciende las farolas.

export interface SkyLights {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** 0 de día, 1 de noche: farolas y ventanas. */
  setNight(k: number): void;
}

interface Key { e: number; top: number; hor: number; light: number; li: number; sky: number; ground: number; hi: number; glow: number }
// Paleta según la elevación del sol (seno del ángulo): de noche cerrada a mediodía.
const KEYS: Key[] = [
  { e: -1, top: 0x040814, hor: 0x141c34, light: 0x8ea8e8, li: 0.55, sky: 0x5a6a9a, ground: 0x141a16, hi: 0.42, glow: 0x000000 },
  { e: -0.22, top: 0x060c1e, hor: 0x1a2442, light: 0x8ea8e8, li: 0.55, sky: 0x5a6a9a, ground: 0x141a16, hi: 0.42, glow: 0x000000 },
  { e: -0.07, top: 0x18234a, hor: 0x6a4a6e, light: 0xb08aa0, li: 0.15, sky: 0x7a6a9a, ground: 0x2a2a24, hi: 0.6, glow: 0x6a3a5a },
  { e: 0.03, top: 0x3a5a9a, hor: 0xf09a5a, light: 0xff9a5a, li: 0.9, sky: 0xd8b0a0, ground: 0x4a4a34, hi: 0.85, glow: 0xff7a3a },
  { e: 0.16, top: 0x3f72c0, hor: 0xf2c89a, light: 0xffd2a0, li: 2.0, sky: 0xcfd8ec, ground: 0x5a6040, hi: 1.1, glow: 0xffb070 },
  { e: 0.4, top: 0x3a78d0, hor: 0xb8d4ee, light: 0xfff0d2, li: 2.7, sky: 0xcfe3ff, ground: 0x5a6a44, hi: 1.25, glow: 0xffe2b0 },
  { e: 1, top: 0x2f6ec8, hor: 0xb2d0ec, light: 0xfff4e0, li: 2.8, sky: 0xd6e8ff, ground: 0x5a6a44, hi: 1.3, glow: 0xfff0d0 },
];
const ca = new THREE.Color(), cb = new THREE.Color();
const lerpHex = (a: number, b: number, k: number, out: THREE.Color) => out.set(a).lerp(cb.set(b), k);
function sample(e: number) {
  let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1]!.e) i++;
  const A = KEYS[i]!, B = KEYS[i + 1]!, k = THREE.MathUtils.clamp((e - A.e) / (B.e - A.e), 0, 1), s = k * k * (3 - 2 * k);
  return {
    top: lerpHex(A.top, B.top, s, new THREE.Color()), hor: lerpHex(A.hor, B.hor, s, new THREE.Color()), light: lerpHex(A.light, B.light, s, new THREE.Color()),
    sky: lerpHex(A.sky, B.sky, s, new THREE.Color()), ground: lerpHex(A.ground, B.ground, s, new THREE.Color()), glow: lerpHex(A.glow, B.glow, s, new THREE.Color()),
    li: A.li + (B.li - A.li) * s, hi: A.hi + (B.hi - A.hi) * s,
  };
}

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // siempre en el fondo
}`;
const frag = /* glsl */`
uniform vec3 uTop, uHor, uGlow, uSunDir, uMoonDir;
uniform float uNight, uTime, uSunUp;
varying vec3 vDir;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // degradado: horizonte -> cénit, y bruma oscura bajo el horizonte
  vec3 col = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
  col = mix(col, uHor * 0.55, smoothstep(0.0, -0.25, h));
  // resplandor del sol en el horizonte (amanecer y atardecer)
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.55 + pow(sd, 48.0) * 0.6) * smoothstep(-0.25, 0.05, h);
  // estrellas: puntos redondos en una rejilla de dirección, con titileo
  if (uNight > 0.01 && h > 0.0) {
    vec3 p = d * 260.0, c = floor(p), f = fract(p) - 0.5;
    float r = h3(c);
    if (r > 0.985) {
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
      float s = smoothstep(0.32, 0.0, length(f)) * (r - 0.985) / 0.015;
      col += vec3(0.85, 0.9, 1.0) * s * tw * uNight * smoothstep(0.0, 0.25, h) * 1.6;
    }
  }
  // sol y luna (discos)
  float sun = smoothstep(0.99955, 0.99975, dot(d, uSunDir));
  col = mix(col, vec3(1.0, 0.96, 0.85), sun * uSunUp);
  float md = dot(d, uMoonDir);
  float moon = smoothstep(0.99935, 0.9996, md);
  col += vec3(0.6, 0.7, 0.95) * pow(max(md, 0.0), 300.0) * 0.35 * uNight;
  col = mix(col, vec3(0.88, 0.9, 0.98), moon * uNight);
  // nubes: ruido proyectado sobre un plano alto que avanza con el viento
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.006, uTime * 0.0025);
    float n = fbm(uv);
    float cov = smoothstep(0.5, 0.78, n) * smoothstep(0.0, 0.18, h);
    vec3 lit = mix(vec3(1.0), uGlow + uHor * 0.6, 0.35 * (1.0 - uSunUp));
    vec3 cloud = mix(lit, vec3(0.08, 0.1, 0.16), uNight * 0.95);
    float shade = 0.82 + 0.18 * smoothstep(0.5, 0.9, n);
    col = mix(col, cloud * shade, cov * (0.88 - 0.25 * uNight));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky(scene: THREE.Scene, lights: SkyLights) {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
    uNight: { value: 0 }, uTime: { value: 0 }, uSunUp: { value: 1 },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);
  scene.background = null;
  const fog = new THREE.Fog(0xb9cfe4, 160, 620); scene.fog = fog;
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  // ?hora=21 en la URL fija la hora (pruebas)
  const fixed = Number(new URLSearchParams(location.search).get("hora"));
  const hasFixed = Number.isFinite(fixed) && new URLSearchParams(location.search).has("hora");

  return {
    /** Hora del día en [0, 24). */
    hour: 12,
    /** Dirección hacia la luz que proyecta sombras (sol o luna), para colocar la luz direccional. */
    lightDir: new THREE.Vector3(0.4, 0.9, 0.26),
    update(camPos: THREE.Vector3, t: number) {
      const day = hasFixed ? fixed / 24 : ((Date.now() / 1000) % DAY_CYCLE_SEC) / DAY_CYCLE_SEC; // 0 = medianoche
      this.hour = day * 24;
      const a = (day - 0.25) * Math.PI * 2; // 6:00 sale, 18:00 se pone
      sunDir.set(Math.cos(a) * 0.82, Math.sin(a), 0.42).normalize();
      moonDir.copy(sunDir).negate(); moonDir.y = Math.max(moonDir.y, -0.2); moonDir.normalize();
      const e = sunDir.y, P = sample(e);
      const night = THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
      uniforms.uTop.value.copy(P.top); uniforms.uHor.value.copy(P.hor); uniforms.uGlow.value.copy(P.glow);
      uniforms.uSunDir.value.copy(sunDir); uniforms.uMoonDir.value.copy(moonDir);
      uniforms.uNight.value = night; uniforms.uTime.value = t; uniforms.uSunUp.value = THREE.MathUtils.smoothstep(e, -0.04, 0.04);
      dome.position.copy(camPos);
      fog.color.copy(P.hor).lerp(ca.copy(P.top), 0.15);
      // luz direccional: el sol mientras está alto; la luna cuando se ha puesto (el cambio ocurre con la luz casi apagada)
      this.lightDir.copy(e > -0.03 ? sunDir : moonDir);
      if (this.lightDir.y < 0.12) { this.lightDir.y = 0.12; this.lightDir.normalize(); } // sombras nunca infinitas
      lights.sun.color.copy(P.light); lights.sun.intensity = P.li;
      lights.hemi.color.copy(P.sky); lights.hemi.groundColor.copy(P.ground); lights.hemi.intensity = P.hi;
      lights.setNight(THREE.MathUtils.smoothstep(-e, -0.12, 0.06));
    },
  };
}
export type Sky = ReturnType<typeof createSky>;
