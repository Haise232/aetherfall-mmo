// Sonido ambiente de agua y naturaleza, sintetizado con WebAudio (sin archivos). El contexto se crea con el primer
// gesto del jugador (como mountSound.ts). Capas continuas (agua, oleaje, viento, hojas, grillos) que se construyen
// solo cuando se oyen y se liberan cuando llevan un rato en silencio, y eventos cortos (pájaros, palomas, búho,
// gotas, patos, ranas, peces) con límite de simultáneos. Todo el motor trabaja sobre un BaseAudioContext, así que
// también se puede renderizar en un OfflineAudioContext para medir la señal (ver `renderTest`).
import { CITY_R, FOUNTAIN, LAKE, PARKS, TREES } from "@mmorpg/shared";

const VOL_DEFAULT = 0.6;
const MASTER = 0.9; // ganancia fija del bus; el volumen del jugador se multiplica encima

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;
const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/** Atenuación tipo 1/d con tope en `ref` y caída a 0 hacia `max`. */
const att = (d: number, ref: number, max: number) => Math.min(1, ref / Math.max(d, 0.001)) * (1 - smooth(max * 0.55, max, d));

// --- Datos del mundo -------------------------------------------------------------------------------------------

const FOUNTAINS = [
  { x: FOUNTAIN.x, z: FOUNTAIN.z, ref: 4, max: 48, amp: 1 },
  ...PARKS.filter(p => p.feature === "fountain").map(p => ({ x: p.x, z: p.z, ref: 3, max: 38, amp: 0.8 })),
];
const PONDS = PARKS.filter(p => p.feature === "pond").map(p => ({ x: p.x, z: p.z, ref: 3, max: 32 }));

// Rejilla de densidad de árboles (celdas de 12 m), construida la primera vez que se necesita.
const CELL = 12, HALF = 216, GN = Math.ceil((HALF * 2) / CELL);
let treeGrid: Uint16Array | null = null;
function treeDensity(x: number, z: number): number {
  if (!treeGrid) {
    treeGrid = new Uint16Array(GN * GN);
    for (const t of TREES) {
      const i = Math.floor((t.x + HALF) / CELL), j = Math.floor((t.z + HALF) / CELL);
      if (i >= 0 && j >= 0 && i < GN && j < GN) treeGrid[j * GN + i]!++;
    }
  }
  const ci = Math.floor((x + HALF) / CELL), cj = Math.floor((z + HALF) / CELL);
  let n = 0;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) if (i >= 0 && j >= 0 && i < GN && j < GN) n += treeGrid[j * GN + i]!;
  return clamp(n / 26);
}

// --- Motor -----------------------------------------------------------------------------------------------------

type Pos = { x: number; y: number; z: number };
interface Live { out: AudioNode; srcs: AudioScheduledSourceNode[]; nodes: number; tick?: (dt: number) => void }
interface Layer { name: string; live: Live | null; g: GainNode | null; pan: StereoPannerNode | null; idle: number; level: number; set(level: number, dt: number, pan?: number): void }

function noiseBuf(ctx: BaseAudioContext, sec: number, pink: boolean): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return b;
}

function makeEngine(ctx: BaseAudioContext, dest: AudioNode, vol: number, only?: Set<string>) {
  const master = ctx.createGain(); master.gain.value = vol * MASTER; master.connect(dest);
  const white = noiseBuf(ctx, 3, false), pink = noiseBuf(ctx, 4, true);
  const allow = (n: string) => !only || only.has(n);

  // Constructor de nodos para una capa continua: registra fuentes y cuenta nodos.
  const builder = () => {
    const srcs: AudioScheduledSourceNode[] = []; let nodes = 0;
    const gain = (v: number) => { nodes++; const g = ctx.createGain(); g.gain.value = v; return g; };
    const filt = (type: BiquadFilterType, f: number, q = 1) => { nodes++; const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const noise = (buf: AudioBuffer) => { nodes++; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); srcs.push(s); return s; };
    const osc = (type: OscillatorType, f: number) => { nodes++; const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); srcs.push(o); return o; };
    return { srcs, gain, filt, noise, osc, count: () => nodes };
  };

  const layers: Layer[] = [];
  function makeLayer(name: string, build: (b: ReturnType<typeof builder>) => { out: AudioNode; tick?: (dt: number) => void }, panned: boolean): Layer {
    const L: Layer = {
      name, live: null, g: null, pan: null, idle: 0, level: 0,
      set(level, dt, pan = 0) {
        if (!allow(name)) level = 0;
        L.level = level;
        const t = ctx.currentTime;
        if (level < 0.003) { // silencio: tras unos segundos se libera todo
          if (!L.live) return;
          L.g!.gain.setTargetAtTime(0, t, 0.3);
          if ((L.idle += dt) > 4) {
            for (const s of L.live.srcs) { try { s.stop(); } catch { /* ya parada */ } }
            L.live.out.disconnect(); L.g!.disconnect(); L.pan?.disconnect(); L.live = null; L.g = null; L.pan = null; L.idle = 0;
          }
          return;
        }
        L.idle = 0;
        if (!L.live) {
          const b = builder(), r = build(b);
          L.g = ctx.createGain(); L.g.gain.value = 0; r.out.connect(L.g);
          if (panned) { L.pan = ctx.createStereoPanner(); L.g.connect(L.pan).connect(master); } else L.g.connect(master);
          L.live = { out: r.out, srcs: b.srcs, nodes: b.count() + 1 + (panned ? 1 : 0), tick: r.tick };
        }
        L.g!.gain.setTargetAtTime(level, t, 0.35);
        L.pan?.pan.setTargetAtTime(pan, t, 0.2);
        L.live.tick?.(dt);
      },
    };
    layers.push(L);
    return L;
  }

  // Temporizador aleatorio para modular parámetros de forma irregular.
  const jitter = (lo: number, hi: number, fn: () => void) => { let left = rnd(lo, hi); return (dt: number) => { if ((left -= dt) <= 0) { left = rnd(lo, hi); fn(); } }; };
  const to = (p: AudioParam, v: number, tau: number) => p.setTargetAtTime(v, ctx.currentTime, tau);

  // Fuente: chapoteo continuo (hiss de salpicaduras + cuerpo grave), con salpicaduras irregulares.
  const fountain = makeLayer("fountain", b => {
    const out = b.gain(1);
    const hiss = b.gain(0.5), body = b.gain(0.8);
    b.noise(white).connect(b.filt("highpass", 700)).connect(b.filt("bandpass", 3200, 0.45)).connect(hiss).connect(out);
    b.noise(pink).connect(b.filt("lowpass", 900)).connect(body).connect(out);
    const sp = b.gain(0.0); // salpicaduras: ráfagas de agudos
    b.noise(white).connect(b.filt("bandpass", 5200, 1.2)).connect(sp).connect(out);
    return { out, tick: jitter(0.08, 0.25, () => { to(hiss.gain, rnd(0.35, 0.65), 0.05); to(body.gain, rnd(0.65, 0.95), 0.1); to(sp.gain, Math.random() < 0.4 ? rnd(0.1, 0.4) : 0, 0.03); }) };
  }, true);

  // Estanque: agua quieta, apenas un susurro de fondo (lo demás son gotas y patos como eventos).
  const pondBed = makeLayer("pond", b => {
    const out = b.gain(1);
    b.noise(pink).connect(b.filt("lowpass", 350)).connect(b.gain(0.25)).connect(out);
    return { out };
  }, true);

  // Lago: oleaje suave y rítmico (LFO lento sobre la ganancia y el corte del filtro) con espuma.
  const lake = makeLayer("lake", b => {
    const out = b.gain(1), waves = b.gain(0.5);
    const lp = b.filt("lowpass", 650, 0.5);
    b.noise(pink).connect(lp).connect(waves);
    b.noise(white).connect(b.filt("bandpass", 3500, 0.6)).connect(b.gain(0.12)).connect(waves);
    waves.connect(out);
    const lfo = b.osc("sine", 0.11), d1 = b.gain(0.48), d2 = b.gain(450);
    lfo.connect(d1).connect(waves.gain); lfo.connect(d2).connect(lp.frequency);
    return { out, tick: jitter(5, 12, () => to(lfo.frequency, rnd(0.08, 0.15), 2)) };
  }, true);

  // Viento: ruido rosa con filtro paso banda y rachas; más agudo y fuerte cuanto más intenso.
  const wind = makeLayer("wind", b => {
    const out = b.gain(1), gust = b.gain(0.7), bp = b.filt("bandpass", 400, 0.6);
    b.noise(pink).connect(bp).connect(gust).connect(out);
    return { out, tick: jitter(0.7, 2.2, () => { to(gust.gain, rnd(0.45, 1), 0.9); to(bp.frequency, 250 + wind.level * 900 * rnd(0.7, 1.2), 1); }) };
  }, false);

  // Hojas: siseo agudo con rachas rápidas.
  const leaves = makeLayer("leaves", b => {
    const out = b.gain(1), gust = b.gain(0.5);
    b.noise(white).connect(b.filt("bandpass", 4800, 0.7)).connect(b.filt("highpass", 2500)).connect(gust).connect(out);
    return { out, tick: jitter(0.4, 1.6, () => to(gust.gain, Math.random() ** 2 * 0.9 + 0.1, 0.5)) };
  }, false);

  // Grillos: 3 voces; cada una es una portadora aguda con modulación rápida (trinos) y compuerta lenta (grupos).
  const crickets = makeLayer("crickets", b => {
    const out = b.gain(1), voices: { car: OscillatorNode; l1: OscillatorNode; l2: OscillatorNode; amp: GainNode }[] = [];
    for (const f of [4300, 4900, 5500]) {
      const car = b.osc("sine", f * rnd(0.97, 1.03)), a = b.gain(0.5), a2 = b.gain(0.4), amp = b.gain(0.3);
      const l1 = b.osc("sine", rnd(26, 38)), d1 = b.gain(0.5), l2 = b.osc("sine", rnd(1.6, 3.4)), d2 = b.gain(0.55);
      l1.connect(d1).connect(a.gain); l2.connect(d2).connect(a2.gain);
      car.connect(a).connect(a2).connect(amp).connect(out);
      voices.push({ car, l1, l2, amp });
    }
    return { out, tick: jitter(1.5, 4, () => { for (const v of voices) { to(v.l1.frequency, rnd(24, 40), 1); to(v.l2.frequency, rnd(1.2, 3.8), 1); to(v.amp.gain, rnd(0.12, 0.4), 1.5); to(v.car.frequency, v.car.frequency.value * rnd(0.985, 1.015), 1); } }) };
  }, false);

  // --- Eventos cortos ------------------------------------------------------------------------------------------
  const active: { end: number; k: number; type: string }[] = [];
  const count = (type: string) => active.reduce((n, e) => n + (e.type === type ? 1 : 0), 0);
  function launch(type: string, cap: number, fn: (t: number, o: AudioNode) => { dur: number; k: number }, pan: number, vol: number) {
    if (!allow(type) || vol < 0.004 || count(type) >= cap || active.length >= 7) return;
    const t = ctx.currentTime + 0.03;
    const g = ctx.createGain(); g.gain.value = vol; const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    g.connect(p).connect(master);
    const r = fn(t, g);
    active.push({ end: t + r.dur + 0.1, type, k: r.k + 2 });
  }

  /** Nota con barrido de frecuencia, armónico opcional y vibrato opcional. Devuelve nº de nodos. */
  function tone(t: number, f0: number, f1: number, dur: number, vol: number, dest: AudioNode, o: { type?: OscillatorType; harm?: number; vib?: [number, number]; attack?: number } = {}): number {
    const env = ctx.createGain(), at = Math.min(o.attack ?? 0.012, dur * 0.4);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(vol, t + at); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(dest);
    let k = 2;
    const mkOsc = (f: number, g: number, type: OscillatorType) => {
      const os = ctx.createOscillator(); os.type = type;
      os.frequency.setValueAtTime(f, t); if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(20, f * f1 / f0), t + dur);
      if (g === 1) os.connect(env); else { const gg = ctx.createGain(); gg.gain.value = g; os.connect(gg).connect(env); k++; }
      os.start(t); os.stop(t + dur + 0.03); k++;
      return os;
    };
    const main = mkOsc(f0, 1, o.type ?? "sine");
    if (o.harm) mkOsc(f0 * 2, o.harm, "sine");
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = f0 * o.vib[1];
      l.connect(lg).connect(main.frequency); l.start(t); l.stop(t + dur + 0.03); k += 2;
    }
    return k;
  }

  /** Un canto de pájaro: elige una "especie" (silbido, gorjeo corto, trino, trino quebrado) con tonos y tiempos al azar. */
  function birdSong(t: number, o: AudioNode) {
    const base = rnd(2100, 4800), kind = pick(["whistle", "chirp", "trill", "warble"] as const);
    let at = t, k = 0;
    if (kind === "whistle") {
      const n = 2 + Math.floor(Math.random() * 3);
      let f = base;
      for (let i = 0; i < n; i++) {
        const d = rnd(0.11, 0.26), f1 = f * rnd(0.78, 1.3);
        k += tone(at, f, f1, d, rnd(0.5, 0.9), o, { harm: Math.random() < 0.4 ? 0.2 : 0, attack: 0.03 });
        at += d + rnd(0.07, 0.22); f = clamp(f1 * rnd(0.9, 1.1), 1800, 5600);
      }
    } else if (kind === "chirp") {
      const n = 3 + Math.floor(Math.random() * 5), d = rnd(0.035, 0.07);
      for (let i = 0; i < n; i++) {
        const f = base * rnd(0.95, 1.08);
        k += tone(at, f, f * rnd(1.25, 1.6), d, rnd(0.45, 0.8), o);
        at += d + rnd(0.04, 0.1);
      }
    } else if (kind === "trill") {
      const d = rnd(0.45, 0.9);
      k += tone(at, base * 0.8, base * rnd(0.8, 1.05), d, 0.55, o, { vib: [rnd(16, 30), rnd(0.05, 0.1)], attack: 0.08 });
      at += d;
    } else {
      const n = 5 + Math.floor(Math.random() * 4);
      let f = base * 1.1;
      for (let i = 0; i < n; i++) {
        const d = rnd(0.06, 0.12), f1 = f * rnd(0.8, 1.25);
        k += tone(at, f, f1, d, rnd(0.4, 0.8), o, { harm: 0.15 });
        at += d + rnd(0.02, 0.07); f = clamp(f * rnd(0.85, 1.12) * 0.98, 1900, 5600);
      }
    }
    return { dur: at - t + 0.1, k };
  }

  const pigeon = (t: number, o: AudioNode) => { // "cu-cu-rrú": tres arrullos graves, el último más largo
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800; lp.connect(o);
    const f = rnd(340, 440); let at = t, k = 3;
    for (const [d, gap] of [[0.2, 0.06], [0.18, 0.06], [0.42, 0]] as const) { k += tone(at, f * 1.1, f * 0.85, d, 0.8, lp, { type: "triangle", vib: [rnd(22, 30), 0.03], attack: 0.04 }); at += d + gap; }
    return { dur: at - t, k };
  };
  const owl = (t: number, o: AudioNode) => { // "uh-uuuh": dos ululatos graves
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(o);
    const f = rnd(300, 390);
    let k = 3 + tone(t, f * 1.05, f * 0.95, 0.28, 0.6, lp, { harm: 0.15, attack: 0.06 });
    k += tone(t + 0.5, f * 1.02, f * 0.82, 0.8, 0.8, lp, { harm: 0.15, attack: 0.1 });
    return { dur: 1.4, k };
  };
  const drop = (t: number, o: AudioNode) => { // gota: tono corto con barrido ascendente rápido
    const f = rnd(700, 1300);
    let k = tone(t, f, f * rnd(1.6, 2.4), rnd(0.05, 0.09), 0.5, o);
    if (Math.random() < 0.4) k += tone(t + rnd(0.1, 0.2), f * 1.2, f * 2.2, 0.05, 0.25, o);
    return { dur: 0.35, k };
  };
  const duck = (t: number, o: AudioNode) => { // cuac-cuac: diente de sierra filtrado con caída de tono
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rnd(800, 1200); bp.Q.value = 2.5; bp.connect(o);
    const f = rnd(260, 340), n = 2 + Math.floor(Math.random() * 3); let at = t, k = 3, v = 1;
    for (let i = 0; i < n; i++) { const d = rnd(0.1, 0.16); k += tone(at, f * 1.15, f * 0.7, d, 0.9 * v, bp, { type: "sawtooth", attack: 0.02 }); at += d + rnd(0.07, 0.14); v *= 0.8; }
    return { dur: at - t + 0.1, k };
  };
  const frog = (t: number, o: AudioNode) => { // croar: tren de pulsos cortos
    const f = rnd(420, 760), n = 3 + Math.floor(Math.random() * 5); let at = t, k = 0;
    for (let i = 0; i < n; i++) { k += tone(at, f, f * 0.93, 0.03, 0.55, o, { type: "square", attack: 0.005 }); at += rnd(0.04, 0.055); }
    if (Math.random() < 0.5) { at += 0.18; for (let i = 0; i < n; i++) { k += tone(at, f * 1.1, f, 0.03, 0.45, o, { type: "square", attack: 0.005 }); at += rnd(0.04, 0.055); } }
    return { dur: at - t + 0.1, k };
  };
  const fish = (t: number, o: AudioNode) => { // chapoteo de pez: ráfaga de ruido + gota
    const s = ctx.createBufferSource(); s.buffer = white;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rnd(1000, 1800); bp.Q.value = 1;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.7, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(bp).connect(e).connect(o); s.start(t, Math.random() * 2, 0.4);
    return { dur: 0.45, k: 3 + tone(t + 0.03, 500, 1100, 0.12, 0.4, o) };
  };

  // Acumuladores de Poisson por tipo de evento.
  const poisson = (rate: number, dt: number) => rate > 0 && Math.random() < 1 - Math.exp(-rate * dt);

  let yaw = 0; // orientación de la cámara (rad): mira hacia (sin yaw, cos yaw) y su derecha es (-cos yaw, sin yaw)
  const panOf = (dx: number, dz: number) => { const rx = dz * Math.sin(yaw) - dx * Math.cos(yaw); return clamp((rx / (Math.hypot(dx, dz) + 6)) * 1.4, -0.9, 0.9); };

  const info = { fountain: 0, pond: 0, lake: 0, wind: 0, leaves: 0, crickets: 0, birdRate: 0 };

  function update(dt: number, p: Pos, hour: number, alt: number, camYaw?: number) {
    dt = clamp(dt, 0, 0.5);
    if (camYaw !== undefined) yaw = camYaw;
    for (let i = active.length - 1; i >= 0; i--) if (active[i]!.end < ctx.currentTime) active.splice(i, 1);

    // Entorno
    const r = Math.hypot(p.x, p.z), out = smooth(CITY_R - 6, CITY_R + 12, r), city = 1 - out;
    const td = treeDensity(p.x, p.z);
    let park = 0; for (const k of PARKS) park = Math.max(park, 1 - smooth(k.size * 0.5, k.size * 1.4, Math.hypot(p.x - k.x, p.z - k.z)));
    const high = smooth(3, 45, alt);
    const h = ((hour % 24) + 24) % 24;
    const day = smooth(5, 7.5, h) * (1 - smooth(18.5, 21, h));
    const night = 1 - smooth(4.5, 6.5, h) * (1 - smooth(19, 21.5, h));
    const chorus = 1 + 0.5 * (bell(h, 6.4, 1.3) + bell(h, 19.3, 1.2));

    // Agua
    let fl = 0, fpan = 0;
    for (const f of FOUNTAINS) {
      const dx = f.x - p.x, dz = f.z - p.z, a = att(Math.hypot(dx, dz, p.y), f.ref, f.max) * f.amp;
      if (a > fl) { fl = a; fpan = panOf(dx, dz); }
    }
    let pl = 0, ppan = 0, pondDx = 0, pondDz = 0;
    for (const f of PONDS) {
      const dx = f.x - p.x, dz = f.z - p.z, a = att(Math.hypot(dx, dz, p.y), f.ref, f.max);
      if (a > pl) { pl = a; ppan = panOf(dx, dz); pondDx = dx; pondDz = dz; }
    }
    const lx = p.x - LAKE.x, lz = p.z - LAKE.z, lr = Math.hypot(lx, lz) || 1;
    const sx = LAKE.x + (lx / lr) * LAKE.r - p.x, sz = LAKE.z + (lz / lr) * LAKE.r - p.z; // punto de la orilla más cercano
    const ll = att(Math.hypot(Math.abs(lr - LAKE.r), p.y), 6, 55);
    const lpan = panOf(sx, sz);

    info.fountain = fl * 0.34; info.pond = pl * 0.14; info.lake = ll * 0.4;
    fountain.set(info.fountain, dt, fpan); pondBed.set(info.pond, dt, ppan); lake.set(info.lake, dt, lpan);

    // Naturaleza
    const windLvl = clamp(0.1 + 0.3 * out + 0.9 * high);
    info.wind = windLvl * 0.32;
    wind.set(info.wind, dt);
    info.leaves = clamp(td * 0.9 + park * 0.5 + out * 0.1) * (1 - 0.8 * high) * 0.1;
    leaves.set(info.leaves, dt);
    info.crickets = night * (1 - 0.9 * high) * (0.12 + 0.88 * clamp(out * 0.8 + park * 0.7 + td * 0.4)) * 0.045;
    crickets.set(info.crickets, dt);

    // Eventos: pájaros
    const birdsAmt = (day * chorus + 0.05 * night) * (1 - 0.7 * high);
    info.birdRate = birdsAmt * (0.09 + 0.18 * out + 0.45 * td + 0.3 * park);
    if (poisson(info.birdRate, dt)) launch("birds", 3, birdSong, rnd(-0.8, 0.8), rnd(0.06, 0.14) * (0.6 + 0.4 * (td + park)));
    if (poisson(day * city * (1 - high) * 0.07, dt)) launch("pigeons", 1, pigeon, rnd(-0.7, 0.7), rnd(0.06, 0.1));
    if (poisson(night * (1 - city * 0.6) * (1 - high) * (0.01 + 0.03 * clamp(td + park + out * 0.5)), dt)) launch("owl", 1, owl, rnd(-0.8, 0.8), rnd(0.04, 0.08));

    // Eventos: estanque y lago
    if (poisson(pl * 0.5, dt)) launch("pond", 2, drop, ppan, 0.14 * pl);
    if (poisson(pl * day * 0.05 + pl * night * 0.01, dt)) launch("ducks", 1, duck, ppan, 0.14 * pl);
    if (poisson(night * (pl * 0.6 + ll * 0.7), dt)) {
      const fromLake = ll > pl;
      launch("frogs", 2, frog, fromLake ? lpan + rnd(-0.2, 0.2) : ppan, 0.07 * (fromLake ? ll : pl));
    }
    if (poisson(night * 0.12 * Math.max(ll, pl), dt)) launch("fish", 1, fish, ll > pl ? lpan : ppan, 0.07 * Math.max(ll, pl));
    void pondDx; void pondDz;
  }

  return {
    update,
    master,
    setVolume: (v: number) => master.gain.setTargetAtTime(clamp(v) * MASTER, ctx.currentTime, 0.1),
    /** Nodos vivos aproximados: capas continuas activas + eventos en curso. */
    stats: () => ({ layers: layers.filter(l => l.live).map(l => l.name), layerNodes: layers.reduce((n, l) => n + (l.live?.nodes ?? 0), 0), eventNodes: active.reduce((n, e) => n + e.k, 0), events: active.length, info: { ...info } }),
  };
}

// --- API pública -----------------------------------------------------------------------------------------------

export function createAmbience() {
  let ctx: AudioContext | null = null, eng: ReturnType<typeof makeEngine> | null = null, vol = VOL_DEFAULT;
  const unlock = () => {
    if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
    try { ctx = new AudioContext(); } catch { return; }
    eng = makeEngine(ctx, ctx.destination, vol);
  };
  for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, unlock, { capture: true });

  return {
    /** Cada fotograma. `pos`: posición del oyente (la cámara); `hour`: hora del juego 0..24; `alt`: altura sobre el suelo del personaje (vuelo en escoba). */
    update(dt: number, pos: { x: number; y: number; z: number }, hour: number, alt: number, yaw?: number): void {
      if (!eng || !ctx || ctx.state !== "running") return;
      eng.update(dt, pos, hour, alt, yaw);
    },
    /** Volumen general 0..1 (por defecto 0.6). */
    setVolume(v: number): void { vol = clamp(v); eng?.setVolume(vol); },
  };
}

// --- Pruebas ---------------------------------------------------------------------------------------------------

/**
 * Renderiza `seconds` s de ambiente en un OfflineAudioContext con el oyente fijo y devuelve RMS y pico (estéreo,
 * descartando los primeros `skip` s de arranque). `only` limita a ciertas capas/eventos:
 * fountain, pond, lake, wind, leaves, crickets, birds, pigeons, owl, ducks, frogs, fish.
 */
export async function renderTest(scn: { x: number; y?: number; z: number; hour: number; alt?: number }, o: { seconds?: number; skip?: number; only?: string[]; volume?: number } = {}) {
  const seconds = o.seconds ?? 12, skip = o.skip ?? 4, rate = 32000, step = 0.25;
  const oc = new OfflineAudioContext(2, Math.floor(seconds * rate), rate);
  const eng = makeEngine(oc, oc.destination, o.volume ?? VOL_DEFAULT, o.only ? new Set(o.only) : undefined);
  const pos = { x: scn.x, y: scn.y ?? 3, z: scn.z }, alt = scn.alt ?? 0;
  eng.update(step, pos, scn.hour, alt);
  let maxNodes = 0, maxEvents = 0;
  for (let t = step; t < seconds - 0.01; t += step) {
    oc.suspend(t).then(() => { eng.update(step, pos, scn.hour, alt); const s = eng.stats(); maxNodes = Math.max(maxNodes, s.layerNodes + s.eventNodes); maxEvents = Math.max(maxEvents, s.events); void oc.resume(); });
  }
  const buf = await oc.startRendering();
  let sum = 0, peak = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = Math.floor(skip * rate); i < d.length; i++) { sum += d[i]! * d[i]!; n++; if (Math.abs(d[i]!) > peak) peak = Math.abs(d[i]!); }
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak, maxNodes, maxEvents, final: eng.stats() };
}
