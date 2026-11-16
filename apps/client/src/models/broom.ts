import * as THREE from "three";

// Escoba voladora. Mira hacia +Z; el jinete se sienta en el origen.
const WOOD = new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true, roughness: 0.85 });
const STRAW = new THREE.MeshStandardMaterial({ color: 0xcfa64e, flatShading: true, roughness: 1 });
const BAND = new THREE.MeshStandardMaterial({ color: 0x8e2a2a, flatShading: true, roughness: 0.8 });
const SPARK = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false });
const handleGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.3, 6).rotateX(Math.PI / 2);
const strawGeo = new THREE.ConeGeometry(0.24, 0.85, 8, 1, true).rotateX(Math.PI / 2); // la boca del cono mira hacia atrás
const coreGeo = new THREE.ConeGeometry(0.15, 0.7, 6).rotateX(-Math.PI / 2);
const bandGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 6).rotateX(Math.PI / 2);
const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);

export class Broom {
  readonly group = new THREE.Group();
  private sparks: THREE.Mesh[] = [];
  constructor() {
    const handle = new THREE.Mesh(handleGeo, WOOD); handle.position.z = 0.25;
    const straw = new THREE.Mesh(strawGeo, STRAW); straw.position.z = -1.2; straw.material.side = THREE.DoubleSide;
    const core = new THREE.Mesh(coreGeo, STRAW); core.position.z = -1.25;
    const band = new THREE.Mesh(bandGeo, BAND); band.position.z = -0.86;
    this.group.add(handle, straw, core, band);
    for (const m of [handle, straw, core]) m.castShadow = true;
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(sparkGeo, SPARK); this.group.add(s); this.sparks.push(s); }
  }
  /** `speed01`: 0 parado, 1 a toda velocidad. Estela de chispas tras las cerdas. */
  update(t: number, speed01: number) {
    this.sparks.forEach((s, i) => {
      const p = (t * 1.6 + i / this.sparks.length) % 1;
      s.position.set(Math.sin(i * 2.4 + t * 3) * 0.16 * p, Math.cos(i * 1.7 + t * 2) * 0.14 * p - p * 0.25, -1.6 - p * (0.6 + speed01 * 2.4));
      s.scale.setScalar((1 - p) * (0.5 + speed01));
    });
    this.group.rotation.z = Math.sin(t * 1.7) * 0.03;
  }
}
