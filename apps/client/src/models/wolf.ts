import * as THREE from "three";

// Lobo procedural low-poly. Mira hacia +Z local. Sin assets externos.
const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95, metalness: 0, ...extra });

const FUR = mat(0x6e7279), FUR_DARK = mat(0x44474d), FUR_LIGHT = mat(0xa4a7ad), NOSE = mat(0x111111);
const EYE = mat(0xff3b1f, { emissive: 0xff2200, emissiveIntensity: 1.2 });
const TOOTH = mat(0xf2efe6);
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

const ico = (r: number, sx: number, sy: number, sz: number, m: THREE.Material) => {
  const g = new THREE.IcosahedronGeometry(r, 1); g.scale(sx, sy, sz);
  return new THREE.Mesh(g, m);
};
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

export class Wolf {
  readonly group = new THREE.Group();
  /** Volumen invisible para picking con raycaster. */
  readonly hitbox: THREE.Mesh;
  private root = new THREE.Group();
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private tail = new THREE.Group();
  private legs: { pivot: THREE.Group; phase: number }[] = [];
  private t = Math.random() * 10; // desfasa animaciones entre lobos
  private phase = 0;
  private move01 = 0;
  private lunge = 0;
  private fall = 0;
  private dead = false;

  constructor() {
    const { root, head, jaw, tail } = this;

    // Torso: pecho ancho, lomo y grupa.
    const chest = ico(0.5, 0.62, 0.64, 0.6, FUR); chest.position.set(0, 0.8, 0.38);
    const back = ico(0.5, 0.5, 0.5, 0.7, FUR_DARK); back.position.set(0, 0.78, -0.05);
    const rump = ico(0.5, 0.5, 0.52, 0.56, FUR); rump.position.set(0, 0.74, -0.5);
    const belly = ico(0.4, 0.48, 0.3, 0.8, FUR_LIGHT); belly.position.set(0, 0.56, 0.0);
    const mane = ico(0.4, 0.55, 0.4, 0.45, FUR_DARK); mane.position.set(0, 1.02, 0.35); // crin sobre los hombros
    root.add(chest, back, rump, belly, mane);

    // Cuello y cabeza (pivote en la base del cuello).
    const neck = ico(0.3, 0.8, 0.9, 1.1, FUR); neck.position.set(0, 0.94, 0.75); neck.rotation.x = -0.5;
    root.add(neck);
    head.position.set(0, 1.0, 0.95); head.scale.setScalar(1.22);
    const skull = ico(0.3, 0.8, 0.75, 0.85, FUR); skull.position.set(0, 0, 0.12);
    const snout = box(0.22, 0.17, 0.38, FUR_LIGHT); snout.position.set(0, -0.06, 0.46);
    const nose = box(0.12, 0.09, 0.07, NOSE); nose.position.set(0, -0.01, 0.67);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), FUR_DARK); earL.position.set(-0.14, 0.27, 0.0); earL.rotation.z = 0.2;
    const earR = earL.clone(); earR.position.x = 0.14; earR.rotation.z = -0.2;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), EYE); eyeL.position.set(-0.13, 0.06, 0.33);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.13;
    // Mandíbula inferior con colmillos (se abre al atacar).
    jaw.position.set(0, -0.14, 0.3);
    const jawBox = box(0.17, 0.07, 0.34, FUR_DARK); jawBox.position.set(0, 0, 0.17);
    const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), TOOTH); fangL.position.set(-0.07, 0.06, 0.3);
    const fangR = fangL.clone(); fangR.position.x = 0.07;
    jaw.add(jawBox, fangL, fangR);
    head.add(skull, snout, nose, earL, earR, eyeL, eyeR, jaw);
    root.add(head);

    // Cola.
    tail.position.set(0, 0.88, -0.95);
    const tg = new THREE.ConeGeometry(0.17, 0.78, 6); tg.translate(0, 0.39, 0);
    tail.add(new THREE.Mesh(tg, FUR_DARK));
    root.add(tail);

    // Patas: pivote en la cadera. Diagonales en fase (delantera izq + trasera der).
    const addLeg = (x: number, z: number, phase: number) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.56, z);
      const lg = new THREE.CylinderGeometry(0.14, 0.08, 0.52, 6); lg.translate(0, -0.26, 0);
      const leg = new THREE.Mesh(lg, z > 0 ? FUR : FUR_DARK);
      const paw = box(0.2, 0.08, 0.26, FUR_DARK); paw.position.set(0, -0.54, 0.05);
      pivot.add(leg, paw);
      root.add(pivot);
      this.legs.push({ pivot, phase });
    };
    addLeg(-0.24, 0.5, 0); addLeg(0.24, 0.5, Math.PI);
    addLeg(-0.24, -0.5, Math.PI); addLeg(0.24, -0.5, 0);

    // Sombra de contacto.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), SHADOW);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.set(0.8, 1.25, 1);

    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 2.1), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.7;

    this.group.add(shadow, root, this.hitbox);
  }

  /** Dispara el zarpazo/mordisco. */
  attack() { this.lunge = 1; }
  setDead(d: boolean) {
    if (d === this.dead) return;
    this.dead = d;
    if (!d) this.fall = 0;
  }
  /** 0 = de pie, 1 = caído del todo. */
  get fallen() { return this.fall; }

  /** `speed`: velocidad real en unidades/seg. */
  update(dt: number, speed: number) {
    this.t += dt;
    const target = this.dead ? 0 : Math.min(speed / 2.5, 1);
    this.move01 += (target - this.move01) * Math.min(1, dt * 10);
    this.phase += dt * (5 + speed * 1.4) * this.move01;
    this.lunge = Math.max(0, this.lunge - dt * 3.5);

    this.fall = this.dead ? Math.min(1, this.fall + dt * 2.5) : 0;
    const m = this.move01, s = Math.sin(this.phase);

    for (const l of this.legs) l.pivot.rotation.x = Math.sin(this.phase + l.phase) * 0.75 * m + (this.dead ? 0.3 * this.fall : 0);

    const breath = Math.sin(this.t * 2.2) * 0.012;
    // Salto de ataque: arco rápido hacia delante.
    const l = Math.sin(this.lunge * Math.PI);
    this.root.position.set(0, Math.abs(s) * 0.07 * m + breath + l * 0.12, l * 0.45);
    this.root.rotation.x = -l * 0.25 + s * 0.02 * m;
    this.root.rotation.z = this.fall * 1.5;
    if (this.dead) this.root.position.y = this.fall * 0.25;

    this.head.rotation.x = l * 0.5 + Math.sin(this.t * 1.3) * 0.03 + (this.dead ? this.fall * 0.3 : 0);
    this.head.rotation.y = this.dead ? 0 : Math.sin(this.t * 0.9) * 0.06 * (1 - m);
    this.jaw.rotation.x = l * 0.7 + (this.dead ? this.fall * 0.25 : 0);

    this.tail.rotation.x = -(Math.PI / 2 + 0.95) + m * 0.55 - this.fall * 0.2;
    this.tail.rotation.z = Math.sin(this.t * (2.5 + m * 6)) * (0.18 + m * 0.2);
  }
}
