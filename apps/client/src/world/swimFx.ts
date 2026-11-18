import * as THREE from "three";
import type { Lake, LakeSplash } from "./lake";

// Efectos de quien nada: gotas que saltan, ondas en la superficie (las dibuja el shader del lago), un collar de espuma
// alrededor del cuerpo y un chapoteo sintetizado con WebAudio.

const MAX = 140, G = 9.5;
export interface SwimFx extends LakeSplash {
  /** Llamar cada fotograma por cada personaje: detecta entrar o salir del agua y deja la estela mientras nada. */
  track(id: number, x: number, z: number, speed: number, swimming: boolean, dt: number, camDist: number): void;
  /** Collar de espuma: anillo que se queda a la altura del agua alrededor del nadador. */
  collar(id: number, x: number, z: number, on: boolean, speed: number, t: number): void;
  forget(id: number): void;
  update(dt: number): void;
}

export function createSwimFx(scene: THREE.Scene, lake: Lake): SwimFx {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), mat, MAX);
  drops.frustumCulled = false; drops.count = 0; drops.renderOrder = 9; scene.add(drops);
  const P = Array.from({ length: MAX }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, on: false, s: 1 }));
  let head = 0;
  const o = new THREE.Object3D();

  // chapoteo: ruido filtrado con barrido de frecuencia y envolvente corta
  let ac: AudioContext | undefined, noise: AudioBuffer | undefined, lastSnd = 0;
  const sound = (vol: number, big: boolean) => {
    const now = performance.now(); if (now - lastSnd < 110 || vol < 0.02) return; lastSnd = now;
    try {
      ac ??= new AudioContext();
      if (ac.state === "suspended") void ac.resume();
      if (!noise) { noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime, dur = big ? 0.55 : 0.32;
      src.buffer = noise; src.loop = true; f.type = "bandpass"; f.Q.value = 1.1;
      f.frequency.setValueAtTime(big ? 1500 : 1100, t0); f.frequency.exponentialRampToValueAtTime(big ? 380 : 520, t0 + dur);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * (big ? 0.5 : 0.28), t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      src.connect(f).connect(g).connect(ac.destination); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    } catch { /* sin audio */ }
  };

  const st = new Map<number, { on: boolean; rip: number; spl: number }>();
  const collars = new Map<number, THREE.Mesh>();
  const ringGeo = new THREE.RingGeometry(0.42, 0.7, 24).rotateX(-Math.PI / 2);
  const api: SwimFx = {
    splash(x, z, n, power) {
      for (let i = 0; i < n; i++) {
        const p = P[head]!; head = (head + 1) % MAX;
        const a = Math.random() * 6.283, v = (0.4 + Math.random() * 1.4) * power;
        p.x = x + Math.cos(a) * 0.2; p.z = z + Math.sin(a) * 0.2; p.y = 0.08; p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.vy = (2 + Math.random() * 2.6) * power; p.on = true; p.s = 0.6 + Math.random() * 0.9;
      }
    },
    track(id, x, z, speed, swimming, dt, camDist) {
      let s = st.get(id); if (!s) { s = { on: false, rip: 0, spl: 0 }; st.set(id, s); }
      if (swimming && !s.on) { lake.ripple(x, z, 1.3); lake.ripple(x, z, 0.8); api.splash(x, z, 18, 1.2); sound(Math.max(0, 1 - camDist / 40), true); s.rip = 0.5; }
      else if (!swimming && s.on) { lake.ripple(x, z, 0.9); api.splash(x, z, 8, 0.9); sound(Math.max(0, 1 - camDist / 40) * 0.6, false); }
      s.on = swimming;
      if (!swimming) return;
      const moving = speed > 0.4;
      if ((s.rip -= dt) <= 0) { s.rip = moving ? 0.38 : 1.1; lake.ripple(x, z, moving ? 0.9 : 0.55); }
      if (moving && (s.spl -= dt) <= 0) { s.spl = 0.16; api.splash(x, z, 2, 0.55); if (Math.random() < 0.5) sound(Math.max(0, 1 - camDist / 28) * 0.5, false); }
    },
    collar(id, x, z, on, speed, t) {
      let m = collars.get(id);
      if (!on) { if (m) m.visible = false; return; }
      if (!m) { m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); m.renderOrder = 7; scene.add(m); collars.set(id, m); }
      m.visible = true; m.position.set(x, lake.level(t) + 0.012, z);
      const k = 1 + Math.sin(t * 3 + id) * 0.06 + Math.min(0.5, speed * 0.1); m.scale.set(k, 1, k * (1 + Math.min(0.6, speed * 0.12)));
      (m.material as THREE.MeshBasicMaterial).color.copy(lake.tone);
    },
    forget(id) { st.delete(id); const m = collars.get(id); if (m) { scene.remove(m); (m.material as THREE.Material).dispose(); collars.delete(id); } },
    update(dt) {
      mat.color.copy(lake.tone).multiplyScalar(0.9);
      let top = 0;
      for (let i = 0; i < MAX; i++) {
        const p = P[i]!; if (!p.on) continue;
        p.vy -= G * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        if (p.y < 0.05 && p.vy < 0) { p.on = false; o.scale.setScalar(0); o.updateMatrix(); drops.setMatrixAt(i, o.matrix); continue; }
        o.position.set(p.x, p.y, p.z); o.scale.setScalar(p.s); o.updateMatrix(); drops.setMatrixAt(i, o.matrix); top = i + 1;
      }
      drops.count = top; // hasta la última viva (las muertas llevan escala 0) drops.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
