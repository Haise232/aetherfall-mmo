import * as THREE from "three";

// Efectos breves de las habilidades: anillos que se expanden en el suelo y proyectiles.
type Obj = THREE.Mesh | THREE.Points;
interface Item { m: Obj; t: number; dur: number; own: boolean; step(k: number, m: Obj): void }
const ringGeo = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);
const ballGeo = new THREE.IcosahedronGeometry(0.24, 1);
const mat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });

export function createFx(scene: THREE.Scene) {
  const items: Item[] = [];
  /** `delay`: segundos antes de aparecer. `own`: la geometría es solo suya y se libera al terminar. */
  const add = (m: Obj, dur: number, step: Item["step"], delay = 0, own = false) => { m.renderOrder = 8; m.visible = delay <= 0; scene.add(m); items.push({ m, t: -delay, dur, own, step }); step(0, m); };
  const glow = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const api = {
    /** Anillo que crece hasta `radius` y se desvanece. */
    ring(x: number, z: number, radius: number, color: number, dur = 0.45, y = 0.14, delay = 0) {
      const m = new THREE.Mesh(ringGeo, mat(color)); m.position.set(x, y, z);
      add(m, dur, (k, o) => { const e = 1 - (1 - k) * (1 - k); o.scale.setScalar(Math.max(0.01, radius * e)); (o.material as THREE.MeshBasicMaterial).opacity = 1 - k * k; }, delay);
    },
    /** Proyectil de `from` a `to`; al llegar deja un anillo pequeño. */
    bolt(from: THREE.Vector3, to: THREE.Vector3, color: number) {
      const m = new THREE.Mesh(ballGeo, mat(color)), a = from.clone(), b = to.clone();
      add(m, Math.min(0.35, 0.08 + a.distanceTo(b) * 0.018), (k, o) => { o.position.lerpVectors(a, b, k); if (k >= 1) api.ring(b.x, b.z, 1.3, color, 0.3, b.y); });
    },
    /** Rayo recto de luz entre dos puntos que se afina y desvanece. */
    beam(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.16, dur = 0.5, delay = 0) {
      const len = from.distanceTo(to), g = new THREE.CylinderGeometry(1, 1, len, 8, 1, true);
      const m = new THREE.Mesh(g, glow(color, 0.6)); m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      add(m, dur, (k, o) => { const w = width * (1 - k * 0.7); o.scale.set(w, 1, w); (o.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k * k); }, delay, true);
    },
    /** Bendición de la diosa: un rayo baja desde la estatua, una columna de luz envuelve al personaje,
     *  suben espirales de chispas doradas y se abren ondas en el suelo. `big`: versión completa (transformación). */
    bless(pos: THREE.Vector3, from: THREE.Vector3, big: boolean) {
      const GOLD = 0xffd98a, WHITE = 0xfff6da, x = pos.x, z = pos.z, D = big ? 4.2 : 2.6;
      api.beam(from, new THREE.Vector3(x, 1.2, z), WHITE, 0.16, 1.1);
      api.beam(from, new THREE.Vector3(x, 1.2, z), GOLD, 0.4, 1.5, 0.1);
      // columna de luz: crece de golpe, respira y se apaga
      for (const [r, op, col] of [[1.25, 0.16, GOLD], [0.65, 0.2, WHITE]] as const) {
        const H = 16, g = new THREE.CylinderGeometry(r * 0.85, r, H, 24, 1, true); g.translate(0, H / 2, 0);
        const m = new THREE.Mesh(g, glow(col, op)); m.position.set(x, 0.05, z);
        add(m, D, (k, o) => {
          const grow = Math.min(1, k * 9), fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, w = (0.25 + 0.75 * grow) * (1 + Math.sin(k * 40) * 0.05) * (0.6 + 0.4 * fade);
          o.scale.set(w, grow, w); (o.material as THREE.MeshBasicMaterial).opacity = op * fade;
        }, 0.35, true);
      }
      // destello a los pies y ondas sucesivas
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), glow(WHITE, 0.8)); disc.position.set(x, 0.16, z);
      add(disc, 0.9, (k, o) => { o.scale.setScalar(0.4 + k * 3.4); (o.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); }, 0.35, true);
      for (let i = 0; i < (big ? 5 : 3); i++) {
        const m = new THREE.Mesh(ringGeo, glow(i % 2 ? WHITE : GOLD)); m.position.set(x, 0.15 + i * 0.01, z);
        add(m, 1.1, (k, o) => { const e = 1 - (1 - k) * (1 - k); o.scale.setScalar(Math.max(0.01, (3 + i * 0.9) * e)); (o.material as THREE.MeshBasicMaterial).opacity = 1 - k * k; }, 0.4 + i * 0.45);
      }
      // chispas que suben en doble espiral
      const N = big ? 140 : 70, arr = new Float32Array(N * 3), seed = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 10 + (i % 2) * Math.PI, r: 0.5 + ((i * 37) % 23) / 23 * 1.1, o: i / N, s: 0.7 + ((i * 13) % 7) / 7 * 0.6 }));
      const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      pts.frustumCulled = false;
      add(pts, D + 0.6, (k, o) => {
        const tt = k * (D + 0.6);
        for (let i = 0; i < N; i++) {
          const p = seed[i]!, life = (tt * 0.42 * p.s + p.o) % 1, a = p.a + tt * 2.4, rr = p.r * (1 - life * 0.55);
          arr[i * 3] = x + Math.cos(a) * rr; arr[i * 3 + 1] = 0.1 + life * 6.5; arr[i * 3 + 2] = z + Math.sin(a) * rr;
        }
        (o.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (o.material as THREE.PointsMaterial).opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      }, 0.35, true);
      if (big) { // alas de luz que se abren tras el personaje
        for (const s of [-1, 1]) {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(1.4, 1.9, 3.0, 2.3); sh.quadraticCurveTo(2.2, 1.1, 2.4, 0.2); sh.quadraticCurveTo(1.5, 0.5, 1.5, -0.5); sh.quadraticCurveTo(0.8, -0.1, 0.6, -0.9); sh.quadraticCurveTo(0.2, -0.4, 0, 0);
          const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), glow(WHITE, 0.55)); m.position.set(x, 1.7, z); m.rotation.y = from.clone().sub(pos).setY(0).lengthSq() > 0.01 ? Math.atan2(from.x - x, from.z - z) : 0;
          add(m, 2.6, (k, o) => {
            const open = Math.min(1, k * 2.5), e = 1 - (1 - open) * (1 - open);
            o.scale.set(s * e * (1 + Math.sin(k * 14) * 0.04), 0.4 + 0.6 * e, 1); o.position.y = 1.7 + k * 0.5;
            (o.material as THREE.MeshBasicMaterial).opacity = 0.55 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
          }, 1.2, true);
        }
      }
    },
    update(dt: number) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]!; it.t += dt;
        if (it.t < 0) continue;
        it.m.visible = true;
        const k = Math.min(1, it.t / it.dur); it.step(k, it.m);
        if (k >= 1) { scene.remove(it.m); (it.m.material as THREE.Material).dispose(); if (it.own) it.m.geometry.dispose(); items.splice(i, 1); }
      }
    },
  };
  return api;
}
