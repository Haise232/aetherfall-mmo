// Sonido de tu montura, sintetizado con WebAudio (sin archivos): cascos que siguen la marcha, pisadas blandas de la
// pantera, chasquidos de la cabra y el viento de la escoba. El contexto de audio se crea con el primer gesto del jugador.
import type { MountId } from "@mmorpg/shared";

const VOL = 0.22;

export function createMountSound() {
  let ctx: AudioContext | null = null, out: GainNode, noise: AudioBuffer;
  let wind: { src: AudioBufferSourceNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
  let beat = 0, step = 0;

  const unlock = () => {
    if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
    try { ctx = new AudioContext(); } catch { return; }
    out = ctx.createGain(); out.gain.value = VOL; out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, unlock, { capture: true });

  /** Un golpe de casco: ruido corto filtrado + golpe grave. */
  function clop(kind: MountId, accent: number) {
    if (!ctx) return;
    const t = ctx.currentTime, soft = kind === "panther", goat = kind === "goat";
    const n = ctx.createBufferSource(); n.buffer = noise; n.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = soft ? "lowpass" : "bandpass";
    f.frequency.value = soft ? 420 : goat ? 2400 + Math.random() * 500 : 1100 + Math.random() * 500; f.Q.value = soft ? 0.7 : 3;
    const g = ctx.createGain(), peak = (soft ? 0.25 : goat ? 0.45 : 0.6) * accent;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.09 : 0.05));
    n.connect(f).connect(g).connect(out); n.start(t, Math.random() * 0.5, 0.12);
    if (!goat) { // golpe grave contra el suelo
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(soft ? 70 : 130, t); o.frequency.exponentialRampToValueAtTime(soft ? 40 : 60, t + 0.07);
      og.gain.setValueAtTime((soft ? 0.35 : 0.5) * accent, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.1);
    }
  }

  function setWind(level: number) {
    if (!ctx) return;
    if (!wind && level > 0.01) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.Q.value = 0.6;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filt).connect(gain).connect(out); src.start();
      wind = { src, gain, filt };
    }
    if (wind) {
      wind.gain.gain.setTargetAtTime(level * 0.5, ctx.currentTime, 0.2);
      wind.filt.frequency.setTargetAtTime(300 + level * 900, ctx.currentTime, 0.3);
    }
  }

  return {
    /**
     * Cada fotograma. `mount`: tu montura si vas montado (si no, undefined); `speed`: m/s sobre el suelo;
     * `grounded`: tocando el suelo (en el aire no suenan cascos).
     */
    update(dt: number, mount: MountId | undefined, speed: number, grounded: boolean) {
      if (!ctx) return;
      if (mount === "broom" || mount === "dragon") { setWind(Math.min(1, speed / (mount === "dragon" ? 20 : 16))); return; }
      setWind(0);
      if (!mount || !grounded || speed < 0.6) { beat = 0; return; }
      // marcha: paso (4 tiempos lentos), trote (2) o galope (3 golpes seguidos y un silencio)
      const gallop = speed > 9, trot = speed > 4;
      const rate = gallop ? 2.3 + speed * 0.06 : trot ? 3.2 + speed * 0.25 : 1.6 + speed * 0.55;
      beat += dt * rate * (gallop ? 4 : trot ? 2 : 4);
      while (beat >= 1) {
        beat -= 1; step++;
        if (gallop && step % 4 === 3) continue; // fase de suspensión
        clop(mount, gallop ? (step % 4 === 0 ? 1 : 0.7) : trot ? (step % 2 ? 0.85 : 1) : 0.6);
      }
    },
  };
}
