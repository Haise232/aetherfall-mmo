// Sonido del dragón, sintetizado con WebAudio (sin archivos): batir de alas (ráfaga grave), rugido (gruñido con
// formantes y vibrato) y aliento de fuego (rugido de ruido filtrado con chisporroteo). Atenuación por distancia a la
// cámara y panorámica según hacia dónde mira. El contexto se crea con el primer gesto del jugador (como mountSound.ts).
// El motor trabaja sobre un BaseAudioContext, así que también se puede renderizar fuera de línea (`renderTest`).

export type DragonSfx = "wing" | "roar" | "breath";
/** Quién suena: el jefe, tu montura o la montura de otro jugador (esta, más baja y con menos voces). */
export type DragonSrc = "boss" | "own" | "other";

const VOL = 0.5;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Atenuación tipo 1/d con tope en `ref` y caída a 0 hacia `max`. */
const att = (d: number, ref: number, max: number) => Math.min(1, ref / Math.max(d, 0.001)) * (1 - smooth(max * 0.5, max, d));

/** Ganancia según quién suena y a qué distancia (m) está de la cámara. */
export function dragonGain(src: DragonSrc, d: number): number {
  if (src === "boss") return att(d, 16, 150);
  if (src === "own") return 0.8 * att(d, 22, 120);
  return 0.45 * att(d, 8, 55);
}

function makeEngine(ctx: BaseAudioContext, dest: AudioNode) {
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  let voices = 0, otherVoices = 0;

  const bus = (t: number, dur: number, gain: number, pan: number) => {
    const g = ctx.createGain(); g.gain.value = 0; const out = ctx.createGain(); out.gain.value = gain;
    let node: AudioNode = g.connect(out);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = out.connect(p); }
    node.connect(dest);
    return { g, t0: t, t1: t + dur };
  };
  const nz = (rate = 1) => { const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true; n.playbackRate.value = rate; return n; };
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  /** Aletazo: golpe de aire grave + "fump" de la membrana. */
  function wing(gain: number, pan: number, k: number) {
    const t = ctx.currentTime, { g } = bus(t, 0.6, gain * (0.35 + 0.65 * k), pan);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    const n = nz(rnd(0.7, 0.9)), lp = filt("lowpass", 260, 0.9);
    lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(110, t + 0.5);
    n.connect(lp).connect(g); n.start(t, rnd(0, 1.2), 0.6);
    const m = nz(1.2), bp = filt("bandpass", 700, 1.2), mg = ctx.createGain(); // crujido de la membrana al tensarse
    mg.gain.setValueAtTime(0.0001, t); mg.gain.exponentialRampToValueAtTime(0.16, t + 0.03); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    m.connect(bp).connect(mg).connect(g); m.start(t, rnd(0, 1.2), 0.3);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = "sine"; // el golpe de aire que se siente en el pecho
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.8, t + 0.06); og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(og).connect(g); o.start(t); o.stop(t + 0.5);
    return 0.65;
  }

  /** Rugido: dos dientes de sierra graves con vibrato y modulación de gruñido, pasados por tres formantes. */
  function roar(gain: number, pan: number) {
    const t = ctx.currentTime, dur = 2.1, { g } = bus(t, dur, gain, pan);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.25); g.gain.setValueAtTime(1, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const rattle = ctx.createGain(); rattle.gain.value = 0.55; // el gruñido: amplitud que vibra rápido
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.setValueAtTime(24, t); lfo.frequency.linearRampToValueAtTime(34, t + dur); lg.gain.value = 0.45; lfo.connect(lg).connect(rattle.gain); lfo.start(t); lfo.stop(t + dur);
    const f0 = (o: OscillatorNode, k: number) => { // tono: sube, se mantiene y cae
      o.frequency.setValueAtTime(70 * k, t); o.frequency.exponentialRampToValueAtTime(135 * k, t + 0.45); o.frequency.exponentialRampToValueAtTime(95 * k, t + 1.2); o.frequency.exponentialRampToValueAtTime(48 * k, t + dur);
      const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 8; vg.gain.value = 5 * k; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + dur);
    };
    for (const [k, a] of [[1, 1], [1.51, 0.5]] as const) { const o = ctx.createOscillator(); o.type = "sawtooth"; f0(o, k); const og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(rattle); o.start(t); o.stop(t + dur); }
    const n = nz(0.6), ng = ctx.createGain(), nf = filt("bandpass", 500, 0.6); ng.gain.value = 0.7; n.connect(nf).connect(ng).connect(rattle); n.start(t, 0, dur);
    rattle.connect(shaper);
    for (const [f1, f2, q, a] of [[620, 420, 4, 1], [1150, 780, 5, 0.55], [2500, 1800, 6, 0.2], [190, 150, 2, 1.1]] as const) { // formantes: la boca se abre y se cierra
      const b = filt("bandpass", f1, q), ba = ctx.createGain(); ba.gain.value = a;
      b.frequency.setValueAtTime(f1 * 0.7, t); b.frequency.linearRampToValueAtTime(f1, t + 0.5); b.frequency.linearRampToValueAtTime(f2, t + dur);
      shaper.connect(b).connect(ba).connect(g);
    }
    return 1.1;
  }

  /** Aliento: ráfaga de ruido que se abre y se apaga, con un retumbo grave y chisporroteo. */
  function breath(gain: number, pan: number) {
    const t = ctx.currentTime, dur = 1.9, { g } = bus(t, dur, gain, pan);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.18); g.gain.setValueAtTime(0.8, t + 1.1); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const n = nz(0.9), bp = filt("bandpass", 450, 0.7), hp = filt("highpass", 160, 0.5);
    bp.frequency.setValueAtTime(450, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.5); bp.frequency.exponentialRampToValueAtTime(650, t + dur);
    const flut = ctx.createOscillator(), fg = ctx.createGain(), fa = ctx.createGain(); fa.gain.value = 0.75; flut.frequency.value = 13; fg.gain.value = 0.25; flut.connect(fg).connect(fa.gain); flut.start(t); flut.stop(t + dur);
    n.connect(bp).connect(hp).connect(fa).connect(g); n.start(t, rnd(0, 0.5), dur);
    const r = nz(0.35), rl = filt("lowpass", 170, 0.8), rg = ctx.createGain(); rg.gain.value = 1.2; r.connect(rl).connect(rg).connect(g); r.start(t, rnd(0, 0.5), dur);
    for (let i = 0; i < 16; i++) { // chisporroteo de brasas
      const s = nz(1.5), h = filt("highpass", 2500, 1), cg = ctx.createGain(), at = t + 0.15 + Math.random() * 1.5;
      cg.gain.setValueAtTime(0.0001, at); cg.gain.exponentialRampToValueAtTime(rnd(0.08, 0.2), at + 0.004); cg.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
      s.connect(h).connect(cg).connect(g); s.start(at, rnd(0, 1.5), 0.06);
    }
    return 1.5;
  }

  return {
    /** Lanza un sonido. `gain`: ya atenuado por la distancia. Devuelve false si se descarta (poco volumen o sin voces libres). */
    play(kind: DragonSfx, src: DragonSrc, gain: number, pan: number, strength = 1): boolean {
      if (gain < 0.02) return false;
      const other = src === "other";
      if (voices >= 8 || (other && otherVoices >= 2)) return false;
      voices++; if (other) otherVoices++;
      const life = kind === "wing" ? wing(gain, pan, strength) : kind === "roar" ? roar(gain, pan) : breath(gain, pan);
      setTimeout(() => { voices--; if (other) otherVoices--; }, life * 1000 + 300);
      return true;
    },
  };
}

export function createDragonSound() {
  let ctx: AudioContext | null = null, eng: ReturnType<typeof makeEngine> | null = null;
  let lx = 0, ly = 0, lz = 0, rx = 1, rz = 0;
  const unlock = () => {
    if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
    try { ctx = new AudioContext(); } catch { return; }
    const out = ctx.createGain(); out.gain.value = VOL; out.connect(ctx.destination);
    eng = makeEngine(ctx, out);
  };
  for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, unlock, { capture: true });
  return {
    /** Cada fotograma: posición de la cámara y su rumbo (para la panorámica). */
    listener(x: number, y: number, z: number, yaw: number) { lx = x; ly = y; lz = z; rx = -Math.cos(yaw); rz = Math.sin(yaw); },
    /** Suena `kind` en el punto del mundo (x, y, z). `strength`: fuerza del aletazo (0..1). */
    play(kind: DragonSfx, src: DragonSrc, x: number, y: number, z: number, strength = 1) {
      if (!eng || ctx!.state !== "running") return;
      const dx = x - lx, dz = z - lz, d = Math.hypot(dx, y - ly, dz);
      const pan = d < 3 ? 0 : clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85;
      eng.play(kind, src, dragonGain(src, d), pan, strength);
    },
  };
}

/** Prueba fuera de línea: renderiza un sonido a una distancia dada y devuelve su pico y su RMS. */
export async function renderTest(kind: DragonSfx, src: DragonSrc, dist: number, pan = 0) {
  const rate = 32000, oc = new OfflineAudioContext(2, rate * 3, rate), out = oc.createGain(); out.gain.value = VOL; out.connect(oc.destination);
  const eng = makeEngine(oc, out);
  const ok = eng.play(kind, src, dragonGain(src, dist), pan, 1);
  const buf = await oc.startRendering();
  let sum = 0, peak = 0, n = 0, low = 0, hi = 0;
  const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
  for (let i = 0; i < d0.length; i++) { const a = d0[i]!, b = d1[i]!; sum += a * a + b * b; n += 2; peak = Math.max(peak, Math.abs(a), Math.abs(b)); if (i) { hi += (a - d0[i - 1]!) ** 2; low += a * a; } }
  return { ok, gain: dragonGain(src, dist), peak, rms: Math.sqrt(sum / Math.max(1, n)), hiRatio: hi / Math.max(1e-12, low), left: Math.sqrt(d0.reduce((s, v) => s + v * v, 0) / d0.length), right: Math.sqrt(d1.reduce((s, v) => s + v * v, 0) / d1.length) };
}
