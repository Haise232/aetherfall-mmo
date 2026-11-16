import * as THREE from "three";

// Aventurero procedural estilizado (~1.9 de alto). Mira hacia +Z local. El equipo cambia el aspecto.
// Las superficies blandas y los pivotes secundarios evitan la silueta y el movimiento de maniquí.
// Geometrías y materiales compartidos a nivel de módulo; la túnica es propia de cada jugador.
const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.78, metalness: 0, ...extra });

const SKIN = std(0xe3b48f), SKIN_D = std(0xc99573), HAIR = std(0x3b2a1e), HAIR_L = std(0x5a4030);
const PANTS = std(0x3c3a46), BOOT = std(0x2b211b), BOOT_T = std(0x4a3828), BELT = std(0x4a3320);
const LEATHER = std(0x7a5232), LEATHER_D = std(0x573822);
const IRON = std(0x9aa3ad, { metalness: 0.5, roughness: 0.45 }), IRON_D = std(0x5d646d, { metalness: 0.5, roughness: 0.5 });
const WOOD = std(0x6b4a2b), WOOD_D = std(0x4a321c), GOLD = std(0xc9a227, { metalness: 0.6, roughness: 0.4 });
const RUST = std(0x8f7455, { metalness: 0.45, roughness: 0.75 }), RUST_D = std(0x6a3f22, { roughness: 0.95 });
const STEEL_E = std(0xb9bfc4, { metalness: 0.7, roughness: 0.35 });
const TRIM = std(0x2f2a24), PLUME = std(0xa3262a);
const EYE_W = new THREE.MeshBasicMaterial({ color: 0xf4efe6 }), EYE = new THREE.MeshBasicMaterial({ color: 0x24303a });
const GLOW = new THREE.MeshBasicMaterial({ color: 0x66d9ff });
const MOUTH = new THREE.MeshBasicMaterial({ color: 0x7a3a34 });
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const HITBOX_M = new THREE.MeshBasicMaterial({ visible: false });

const cyl = (rt: number, rb: number, h: number, seg: number, shiftY = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, shiftY, 0); return g;
};
const lathe = (profile: [number, number][], seg = 14) =>
  new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg);
/** Tubo con extremos redondeados y volumen muscular, con el hombro/cadera en y=0. */
const limb = (rt: number, rb: number, h: number) => lathe([
  [0, -h - 0.018], [rb * 0.7, -h - 0.012], [rb, -h + 0.018], [rb * 1.04, -h * 0.72],
  [(rt + rb) * 0.57, -h * 0.38], [rt, -0.018], [rt * 0.82, 0.008], [0, 0.02],
], 12);
const tunicHem = () => {
  const g = lathe([[0, -0.31], [0.34, -0.31], [0.37, -0.285], [0.35, -0.19], [0.29, 0.04], [0.245, 0.25], [0.22, 0.31], [0, 0.31]], 18);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const w = THREE.MathUtils.clamp((0.05 - y) / 0.36, 0, 1), fold = 1 + Math.cos(a * 6 + 0.2) * 0.055 * w;
    p.setXYZ(i, x * fold, y + Math.sin(a * 3 + 0.4) * 0.025 * w * w * w, z * fold);
  }
  g.computeVertexNormals(); return g;
};
const capeGeo = (top: number, bottom: number, h: number, notch: number) => {
  const cols = 12, rows = 6, vertices: number[] = [], indices: number[] = [];
  for (let y = 0; y <= rows; y++) {
    const v = y / rows, width = THREE.MathUtils.lerp(top, bottom, v * v * (3 - 2 * v));
    for (let x = 0; x <= cols; x++) {
      const u = x / cols, nx = u * 2 - 1;
      vertices.push(nx * width / 2, -h * v + notch * (1 - Math.abs(nx)) * v ** 4, Math.cos(nx * Math.PI * 3) * 0.013 * v + Math.sin(v * Math.PI) * 0.008);
    }
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const a = y * (cols + 1) + x, b = a + 1, c = a + cols + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
};
const wizardHat = () => {
  const g = lathe([[0, 0], [0.17, 0], [0.165, 0.05], [0.14, 0.18], [0.1, 0.31], [0.055, 0.45], [0.014, 0.57], [0, 0.6]], 20);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / 0.6;
    p.setXYZ(i, p.getX(i) + Math.sin(t * Math.PI) * 0.012 + t * t * 0.065, y, p.getZ(i) - t * t * 0.12);
  }
  g.computeVertexNormals(); return g;
};
const hatBrim = () => {
  const g = cyl(0.3, 0.3, 0.025, 24), p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / 0.3;
    p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 3 + 0.7) * 0.012 * r * r);
  }
  g.computeVertexNormals(); return g;
};
const mouthGeo = () => { const g = new THREE.SphereGeometry(0.045, 10, 6); g.scale(1, 0.16, 0.2); return g; };
const browGeo = () => { const g = new THREE.CapsuleGeometry(0.009, 0.052, 2, 7); g.rotateZ(Math.PI / 2); return g; };
const G = {
  chest: lathe([[0, -0.25], [0.17, -0.25], [0.225, -0.22], [0.235, -0.13], [0.265, -0.02], [0.315, 0.13], [0.3, 0.21], [0.23, 0.25], [0, 0.25]]),
  pelvis: lathe([[0, -0.1], [0.2, -0.1], [0.245, -0.055], [0.24, 0.055], [0.205, 0.1], [0, 0.1]]),
  hem: tunicHem(), sleeve: cyl(0.06, 0.105, 0.17, 12), hatCone: wizardHat(), hatBrim: hatBrim(), hatBand: cyl(0.178, 0.185, 0.05, 18), gem: new THREE.IcosahedronGeometry(0.04, 0), orb: new THREE.IcosahedronGeometry(0.06, 1), hemRing: new THREE.TorusGeometry(0.37, 0.012, 6, 20),
  capeTop: capeGeo(0.42, 0.49, 0.4, 0.025), capeTail: capeGeo(0.49, 0.62, 0.43, 0.085), clasp: new THREE.SphereGeometry(0.027, 8, 6),
  belt: cyl(0.245, 0.245, 0.07, 14), neck: cyl(0.057, 0.065, 0.12, 12),
  upperArm: limb(0.07, 0.052, 0.3), foreArm: limb(0.058, 0.04, 0.28),
  hand: new THREE.SphereGeometry(0.06, 10, 8), thumb: new THREE.CapsuleGeometry(0.018, 0.025, 2, 7),
  thigh: limb(0.11, 0.075, 0.46), shin: limb(0.077, 0.057, 0.44),
  boot: cyl(0.092, 0.083, 0.26, 12, -0.13), foot: new THREE.SphereGeometry(0.1, 12, 8), toe: new THREE.SphereGeometry(0.075, 10, 7), sole: new THREE.SphereGeometry(0.1, 12, 6),
  skull: new THREE.SphereGeometry(0.19, 16, 12), jaw: new THREE.SphereGeometry(0.12, 12, 9), ear: new THREE.SphereGeometry(0.04, 9, 7), face: new THREE.SphereGeometry(0.065, 10, 8),
  nose: new THREE.CapsuleGeometry(0.022, 0.034, 3, 8), noseTip: new THREE.SphereGeometry(0.023, 9, 7), eyeW: new THREE.SphereGeometry(0.031, 10, 8), iris: new THREE.SphereGeometry(0.018, 9, 7), glint: new THREE.SphereGeometry(0.005, 6, 4),
  brow: browGeo(), mouth: mouthGeo(),
  hairCap: new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairBack: new THREE.SphereGeometry(0.19, 14, 10), fringe: new THREE.SphereGeometry(0.055, 9, 7), tuft: new THREE.ConeGeometry(0.05, 0.14, 8),
  plateChest: lathe([[0, -0.23], [0.2, -0.23], [0.255, -0.18], [0.275, -0.04], [0.33, 0.13], [0.29, 0.23], [0, 0.23]]), tasset: new THREE.BoxGeometry(0.15, 0.2, 0.04),
  pauldron: new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), pauldronRim: new THREE.TorusGeometry(0.14, 0.012, 6, 14),
  gaunt: cyl(0.07, 0.058, 0.2, 10, -0.1), gauntHand: new THREE.SphereGeometry(0.07, 10, 7), cuff: new THREE.TorusGeometry(0.066, 0.016, 6, 12),
  greave: cyl(0.085, 0.07, 0.3, 10, -0.15), knee: new THREE.SphereGeometry(0.09, 10, 7),
  helmDome: new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmBand: cyl(0.222, 0.222, 0.05, 14),
  nasal: new THREE.BoxGeometry(0.03, 0.12, 0.02), cheek: new THREE.BoxGeometry(0.03, 0.12, 0.1), plume: new THREE.ConeGeometry(0.05, 0.3, 8),
  pad: new THREE.SphereGeometry(0.125, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5),
  vest: lathe([[0, -0.23], [0.2, -0.23], [0.25, -0.18], [0.27, -0.03], [0.32, 0.14], [0.25, 0.23], [0, 0.23]]), strap: new THREE.BoxGeometry(0.065, 0.62, 0.018), pouch: new THREE.SphereGeometry(0.07, 9, 7),
  bracer: cyl(0.062, 0.052, 0.14, 10, -0.07), collar: new THREE.TorusGeometry(0.1, 0.019, 7, 14),
  cuffB: cyl(0.1, 0.092, 0.07, 12),
  // espada
  grip: cyl(0.025, 0.025, 0.2, 8), blade: new THREE.BoxGeometry(0.1, 0.66, 0.026), fuller: new THREE.BoxGeometry(0.03, 0.5, 0.032),
  bladeTip: (() => { const g = new THREE.ConeGeometry(0.0707, 0.14, 4); g.rotateY(Math.PI / 4); g.scale(1, 1, 0.37); return g; })(),
  guard: new THREE.BoxGeometry(0.28, 0.04, 0.06), guardEnd: new THREE.SphereGeometry(0.03, 7, 5), pommel: new THREE.SphereGeometry(0.04, 8, 6),
  rustSpot: new THREE.BoxGeometry(0.04, 0.05, 0.034), nick: new THREE.BoxGeometry(0.025, 0.03, 0.03),
  // garrote
  clubHandle: cyl(0.03, 0.04, 0.5, 8, 0.15), clubHead: (() => {
    const pts = [[0.045, 0], [0.09, 0.08], [0.125, 0.22], [0.12, 0.34], [0.07, 0.42], [0.0, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 10);
  })(),
  stud: new THREE.ConeGeometry(0.02, 0.06, 4), wrap: new THREE.TorusGeometry(0.037, 0.01, 5, 10),
};

type Obj = THREE.Object3D;
const add = (p: Obj, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); p.add(o); return o;
};
const grp = (p: Obj, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); p.add(o); return o; };
const shadowed = <T extends Obj>(o: T) => { o.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; }); return o; };
const clearGroup = (g: Obj) => { while (g.children.length) g.remove(g.children[0]!); };
const sstep = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

const ATK_TIME = 0.6;

export class Player {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  private root = new THREE.Group();
  private pelvis = new THREE.Group();
  private torso = new THREE.Group();
  private chestM: THREE.Mesh;
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private footL = new THREE.Group();
  private footR = new THREE.Group();
  private wristL = new THREE.Group();
  private wristR = new THREE.Group();
  private cape = new THREE.Group();
  private capeTail = new THREE.Group();
  private weaponSlot = new THREE.Group();
  private armorSlot = new THREE.Group(); // peto / faldones (torso)
  private headSlot = new THREE.Group(); // yelmo
  private shoulderSlots: THREE.Group[] = [new THREE.Group(), new THREE.Group()];
  private foreSlots = [new THREE.Group(), new THREE.Group()];
  private handSlots = [new THREE.Group(), new THREE.Group()];
  private shinSlots = [new THREE.Group(), new THREE.Group()];
  private hairG = new THREE.Group();
  private hatG = new THREE.Group();
  private eyes: THREE.Object3D[] = [];
  private irises: THREE.Object3D[] = [];
  private browL = new THREE.Group();
  private browR = new THREE.Group();
  private mouthM: THREE.Mesh;
  private tunic: THREE.MeshStandardMaterial;
  private tunicColor: number;
  private t = Math.random() * 100;
  private nextBlink = this.t + 1.5 + Math.random() * 3;
  private blinkStart = -1;
  private phase = Math.random() * Math.PI * 2;
  private move01 = 0;
  private atk = -1; // progreso 0..1 del ataque, -1 = sin ataque
  private fall = 0;
  private dead = false;
  private weapon?: string;
  private armor?: string;

  constructor(tunicColor: number) {
    this.tunicColor = tunicColor;
    this.tunic = std(tunicColor, { side: THREE.DoubleSide });
    const { root, pelvis, torso, head } = this;

    // Pelvis y piernas (cadera -> rodilla -> pie).
    pelvis.position.set(0, 0.92, 0);
    add(pelvis, G.pelvis, PANTS, 0, 0.0, 0, 1, 1, 0.68);
    root.add(pelvis);
    for (const [leg, knee, foot, shinSlot, x] of [[this.legL, this.kneeL, this.footL, this.shinSlots[0]!, -0.125], [this.legR, this.kneeR, this.footR, this.shinSlots[1]!, 0.125]] as const) {
      leg.position.set(x, -0.02, 0);
      add(leg, G.thigh, PANTS);
      knee.position.y = -0.46;
      add(knee, G.shin, PANTS);
      add(knee, G.boot, BOOT, 0, -0.17, 0);
      add(knee, G.cuffB, BOOT_T, 0, -0.16, 0, 1, 1, 1.05);
      foot.position.set(0, -0.365, 0.015);
      add(foot, G.sole, BOOT, 0, -0.058, 0.07, 0.82, 0.22, 1.35);
      add(foot, G.foot, BOOT, 0, -0.035, 0.06, 0.76, 0.38, 1.05);
      add(foot, G.toe, BOOT_T, 0, -0.035, 0.155, 0.9, 0.5, 1.05);
      knee.add(foot, shinSlot);
      leg.add(knee); pelvis.add(leg);
    }

    // Torso blando: hombros redondeados, cintura marcada y faldón con pliegues irregulares.
    torso.position.set(0, 0.92, 0);
    this.chestM = add(torso, G.chest, this.tunic, 0, 0.33, 0, 1, 1, 0.68);
    add(torso, G.hem, this.tunic, 0, -0.26, 0, 1, 1, 0.72);
    add(torso, G.hemRing, GOLD, 0, -0.555, 0, 1, 0.72, 1).rotation.x = Math.PI / 2;
    add(torso, G.gem, GLOW, 0, 0.42, 0.2, 1, 1.3, 0.8);
    add(torso, G.collar, this.tunic, 0, 0.6, 0.02, 1.1, 1.1, 1.1).rotation.x = Math.PI / 2;
    add(torso, G.belt, BELT, 0, 0.05, 0, 1, 1, 0.68).scale.multiplyScalar(1.02);
    add(torso, new THREE.BoxGeometry(0.075, 0.06, 0.02), GOLD, 0, 0.05, 0.178);
    add(torso, G.neck, SKIN, 0, 0.64, 0);
    torso.add(this.armorSlot);

    // Capa corta con dos articulaciones y tejido continuo, sin aristas trianguladas.
    const capeMat = this.tunic.clone(); capeMat.color.multiplyScalar(0.74); capeMat.roughness = 0.92;
    this.cape.position.set(0, 0.5, -0.225);
    add(this.cape, G.capeTop, capeMat);
    this.capeTail.position.set(0, -0.35, -0.012);
    add(this.capeTail, G.capeTail, capeMat);
    this.cape.add(this.capeTail); torso.add(this.cape);
    for (const s of [-1, 1]) add(torso, G.clasp, GOLD, s * 0.19, 0.52, -0.15);

    // Brazos (hombro -> codo -> mano).
    for (const [arm, elbow, wrist, sh, fore, x] of [[this.armL, this.elbowL, this.wristL, this.shoulderSlots[0]!, this.foreSlots[0]!, -0.335], [this.armR, this.elbowR, this.wristR, this.shoulderSlots[1]!, this.foreSlots[1]!, 0.335]] as const) {
      arm.position.set(x, 0.48, 0);
      add(arm, G.upperArm, this.tunic);
      elbow.position.y = -0.3;
      add(elbow, G.foreArm, this.tunic);
      add(elbow, G.sleeve, this.tunic, 0, -0.2, 0);
      add(elbow, new THREE.TorusGeometry(0.052, 0.009, 6, 12), TRIM, 0, -0.24, 0).rotation.x = Math.PI / 2;
      wrist.position.set(0, -0.28, 0);
      add(wrist, G.hand, SKIN, 0, -0.035, 0, 0.9, 1.12, 0.85);
      const thumb = add(wrist, G.thumb, SKIN, Math.sign(x) * -0.043, -0.025, 0.025);
      thumb.rotation.z = Math.sign(x) * 0.65;
      arm.add(sh); elbow.add(fore, wrist);
      arm.add(elbow); torso.add(arm);
    }
    this.wristL.add(this.handSlots[0]!); this.wristR.add(this.handSlots[1]!);
    // Empuñadura articulada con la muñeca derecha: eje del arma hacia delante.
    this.weaponSlot.position.set(0, -0.035, 0.025);
    this.weaponSlot.rotation.x = 0.95;
    this.wristR.add(this.weaponSlot);

    // Cabeza: mandíbula y nariz suavizadas; los ojos tienen brillo propio.
    head.position.set(0, 0.83, 0);
    add(head, G.skull, SKIN, 0, 0, 0, 0.92, 1.06, 0.96);
    add(head, G.jaw, SKIN, 0, -0.1, 0.045, 0.92, 0.82, 0.9);
    add(head, G.face, SKIN, 0, -0.135, 0.105, 0.55, 0.42, 0.35); // barbilla integrada con la mandíbula
    add(head, G.nose, SKIN, 0, -0.02, 0.192).rotation.x = Math.PI / 2 - 0.18;
    add(head, G.noseTip, SKIN, 0, -0.043, 0.224, 0.9, 0.8, 0.9);
    for (const s of [-1, 1]) {
      add(head, G.ear, SKIN_D, s * 0.18, -0.01, -0.005, 0.5, 1.2, 0.85);
      const eye = grp(head, s * 0.07, 0.015, 0.169);
      add(eye, G.eyeW, EYE_W, 0, 0, 0, 1.15, 0.9, 0.55);
      const iris = add(eye, G.iris, EYE, 0, 0, 0.012, 1, 1.1, 0.6);
      add(iris, G.glint, EYE_W, -0.006, 0.007, 0.014);
      this.eyes.push(eye); this.irises.push(iris);
      const brow = s < 0 ? this.browL : this.browR;
      brow.position.set(s * 0.07, 0.068, 0.174);
      brow.rotation.z = s * 0.07;
      add(brow, G.brow, HAIR);
      head.add(brow);
    }
    this.mouthM = add(head, G.mouth, MOUTH, 0, -0.103, 0.159);

    // Pelo con volumen: casquete, flequillo, melena trasera, mechones laterales.
    const hg = this.hairG;
    add(hg, G.hairCap, HAIR, 0, 0.0, -0.015).rotation.x = -0.22;
    add(hg, G.hairBack, HAIR, 0, -0.03, -0.085, 1.0, 1.0, 0.8);
    for (let i = -2; i <= 2; i++) { const f = add(hg, G.fringe, i % 2 ? HAIR_L : HAIR, i * 0.062, 0.115 - Math.abs(i) * 0.012, 0.165 - Math.abs(i) * 0.03); f.rotation.set(0.3, -i * 0.25, i * 0.12); }
    for (const s of [-1, 1]) add(hg, G.tuft, HAIR, s * 0.17, -0.0, 0.0, 1, 0.8, 1).rotation.z = s * 0.1;
    add(hg, G.tuft, HAIR_L, 0, -0.1, -0.2, 1.3, 1.2, 1.3).rotation.x = -2.6;
    head.add(hg, this.headSlot);
    // Sombrero de una sola pieza, con ala ondulada y punta que cae hacia atrás.
    const hat = this.hatG;
    add(hat, G.hatBrim, this.tunic, 0, 0.12, 0);
    add(hat, G.hatBand, GOLD, 0, 0.17, 0);
    add(hat, G.hatCone, this.tunic, 0, 0.15, -0.01);
    add(hat, G.gem, GLOW, 0, 0.17, 0.185, 0.8, 0.8, 0.8);
    hat.rotation.set(0.02, 0, -0.035);
    head.add(hat);
    torso.add(head);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), SHADOW);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
    root.add(torso);

    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.9), HITBOX_M);
    this.hitbox.position.y = 0.95;

    shadowed(root);
    this.group.add(shadow, root, this.hitbox);
  }

  /** Actualiza el aspecto segun el equipo (ids de ITEMS). */
  setEquip(weapon?: string, armor?: string) {
    if (weapon !== this.weapon) {
      this.weapon = weapon;
      clearGroup(this.weaponSlot);
      let w: THREE.Group | null = weapon === "rusty_sword" ? this.sword() : weapon === "wooden_club" ? this.club() : null;
      if (!w) { w = new THREE.Group(); add(w, G.orb, GLOW, 0, 0.12, 0); }
      shadowed(w); this.weaponSlot.add(w);
    }
    if (armor !== this.armor) {
      this.armor = armor;
      for (const g of [this.armorSlot, this.headSlot, ...this.shoulderSlots, ...this.foreSlots, ...this.handSlots, ...this.shinSlots]) clearGroup(g);
      this.cape.position.z = armor === "iron_armor" ? -0.25 : armor === "leather_armor" ? -0.235 : -0.225;
      const A = this.armorSlot;
      if (armor === "leather_armor") {
        add(A, G.vest, LEATHER, 0, 0.34, 0, 1, 1, 0.64);
        add(A, G.strap, BELT, 0.1, 0.34, 0.2).rotation.z = 0.35;
        add(A, G.pouch, LEATHER_D, -0.22, 0.0, 0.1);
        add(A, new THREE.BoxGeometry(0.3, 0.05, 0.03), LEATHER_D, 0, 0.08, 0.19);
        add(A, G.collar, LEATHER_D, 0, 0.6, 0, 1, 1, 1).rotation.x = Math.PI / 2;
        for (let i = 0; i < 2; i++) {
          add(this.shoulderSlots[i]!, G.pad, LEATHER, 0, 0.015, 0, 0.95, 0.65, 0.9);
          add(this.foreSlots[i]!, G.bracer, LEATHER_D, 0, -0.1, 0);
          add(this.shinSlots[i]!, G.cuffB, LEATHER, 0, -0.1, 0, 1.0, 1.2, 1.05);
        }
      } else if (armor === "iron_armor") {
        add(A, G.plateChest, IRON, 0, 0.33, 0, 1, 1, 0.66);
        add(A, new THREE.BoxGeometry(0.06, 0.46, 0.02), IRON_D, 0, 0.33, 0.215);
        add(A, new THREE.TorusGeometry(0.28, 0.02, 4, 10), GOLD, 0, 0.55, 0, 1, 0.68, 1).rotation.x = Math.PI / 2;
        for (let i = -2; i <= 2; i++) add(A, G.tasset, i % 2 ? IRON : IRON_D, i * 0.1, -0.11, 0.2 - Math.abs(i) * 0.015).rotation.set(0.1, i * -0.18, 0);
        for (const s of [-1, 1]) { const b = add(A, G.tasset, IRON, s * 0.23, -0.11, 0, 0.6, 1, 4); b.rotation.z = s * 0.1; }
        for (let i = 0; i < 2; i++) {
          const s = i ? 1 : -1, sh = this.shoulderSlots[i]!, fo = this.foreSlots[i]!, ha = this.handSlots[i]!, sn = this.shinSlots[i]!;
          add(sh, G.pauldron, IRON, s * 0.025, 0.015, 0, 0.9, 0.75, 0.9).rotation.z = s * -0.3;
          add(sh, G.pauldronRim, GOLD, s * 0.025, -0.005, 0, 0.88, 0.88, 0.88).rotation.set(Math.PI / 2, 0, s * -0.3);
          add(fo, G.gaunt, IRON, 0, -0.04, 0);
          add(fo, G.cuff, GOLD, 0, -0.04, 0).rotation.x = Math.PI / 2;
          add(ha, G.gauntHand, IRON_D, 0, -0.035, 0, 1, 1.05, 0.9);
          add(sn, G.greave, IRON, 0, 0, 0.0, 1, 1, 1.02);
          add(sn, G.knee, IRON, 0, 0.0, 0.03, 1, 0.8, 1);
        }
        // Yelmo abierto con guardanarices, carrilleras y penacho.
        const H = this.headSlot;
        add(H, G.helmDome, IRON, 0, 0.0, 0, 0.92, 1.1, 1.0).rotation.x = -0.1;
        add(H, G.helmBand, IRON_D, 0, 0.065, 0, 0.96, 1, 0.96);
        add(H, G.nasal, IRON_D, 0, -0.01, 0.2);
        for (const s of [-1, 1]) add(H, G.cheek, IRON, s * 0.17, -0.05, 0.05);
        add(H, G.plume, PLUME, 0, 0.26, -0.06, 1, 0.9, 1.6).rotation.x = -0.9;
        add(H, new THREE.BoxGeometry(0.02, 0.02, 0.4), IRON_D, 0, 0.22, -0.02).rotation.x = -0.0;
      }
      this.hairG.visible = armor !== "iron_armor";
      this.hatG.visible = armor !== "iron_armor";
      shadowed(this.armorSlot); shadowed(this.headSlot);
      this.shoulderSlots.forEach(shadowed); this.foreSlots.forEach(shadowed); this.handSlots.forEach(shadowed); this.shinSlots.forEach(shadowed);
    }
  }

  private sword() {
    const g = new THREE.Group();
    add(g, G.grip, BELT, 0, 0, 0);
    for (let i = -2; i <= 2; i++) add(g, G.wrap, LEATHER_D, 0, i * 0.04, 0).rotation.x = Math.PI / 2;
    add(g, G.guard, GOLD, 0, 0.11, 0);
    for (const s of [-1, 1]) add(g, G.guardEnd, GOLD, s * 0.14, 0.12, 0);
    add(g, G.pommel, GOLD, 0, -0.12, 0);
    add(g, G.blade, RUST, 0, 0.46, 0);
    add(g, G.fuller, RUST_D, 0, 0.44, 0);
    add(g, G.bladeTip, RUST, 0, 0.86, 0);
    add(g, G.rustSpot, RUST_D, -0.02, 0.62, 0.002); add(g, G.rustSpot, RUST_D, 0.03, 0.32, 0.002);
    add(g, G.nick, STEEL_E, 0.052, 0.55, 0).rotation.z = 0.7;
    add(g, G.nick, STEEL_E, -0.052, 0.4, 0).rotation.z = -0.7;
    return g;
  }
  private club() {
    const g = new THREE.Group();
    add(g, G.clubHandle, WOOD_D);
    add(g, G.clubHead, WOOD, 0, 0.3, 0);
    add(g, new THREE.IcosahedronGeometry(0.045, 0), WOOD_D, 0, -0.12, 0);
    for (let i = -1; i <= 1; i++) add(g, G.wrap, LEATHER_D, 0, i * 0.05, 0, 1.2, 1.2, 1.2).rotation.x = Math.PI / 2;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r * 0.5, y = 0.46 + r * 0.14, rad = r ? 0.125 : 0.12;
      const n = add(g, G.stud, IRON_D, Math.cos(a) * rad, y, Math.sin(a) * rad);
      n.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4);
    }
    return g;
  }

  attack() { this.atk = 0; }
  private riding = false;
  /** Postura de montar en escoba. */
  setRiding(on: boolean) { this.riding = on; }
  setDead(d: boolean) { if (d !== this.dead) { this.dead = d; if (!d) this.fall = 0; } }
  get fallen() { return this.fall; }
  setHighlight(on: boolean) { this.tunic.emissive.setHex(on ? 0x222222 : 0x000000); }
  get color() { return this.tunicColor; }

  update(dt: number, speed: number) {
    this.t += dt;
    const t = this.t;
    const target = this.dead ? 0 : Math.min(speed / 3, 1);
    // Acelerar y detenerse tienen inercias distintas: no hay cambios binarios de pose.
    const blend = 1 - Math.exp(-dt * (target > this.move01 ? 12 : 8));
    this.move01 += (target - this.move01) * blend;
    this.phase += dt * (5.4 + speed * 0.85) * this.move01;
    if (this.atk >= 0) { this.atk += dt / ATK_TIME; if (this.atk >= 1) this.atk = -1; }
    this.fall = this.dead ? Math.min(1, this.fall + dt * 2.2) : 0;

    const m = this.move01, ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    const idle = 1 - m, breath = Math.sin(t * 1.65);

    // Pesos del ataque: anticipación (wA) -> golpe (wB) -> recuperación.
    let wA = 0, wB = 0;
    if (this.atk >= 0) {
      const a = this.atk;
      if (a < 0.3) wA = sstep(a / 0.3);
      else if (a < 0.42) { const k = (a - 0.3) / 0.12, e = 1 - (1 - k) * (1 - k) * (1 - k); wA = 1 - e; wB = e; }
      else wB = 1 - sstep((a - 0.42) / 0.58);
    }
    const ab = Math.min(1, wA + wB), lo = 1 - ab;

    // Marcha: la rodilla se flexiona durante el vuelo del pie, no como un péndulo rígido.
    const liftL = sstep(Math.max(0, Math.sin(ph + 0.55)));
    const liftR = sstep(Math.max(0, Math.sin(ph + Math.PI + 0.55)));
    this.legL.rotation.x = (-0.025 * idle + s * 0.6 * m) * lo + wB * -0.35 + wA * 0.15;
    this.legR.rotation.x = (0.02 * idle - s * 0.6 * m) * lo + wB * 0.25 + wA * -0.1;
    this.kneeL.rotation.x = 0.045 * idle + m * (0.08 + 0.72 * liftL) + wB * 0.35 + wA * 0.1 + this.fall * 0.5;
    this.kneeR.rotation.x = 0.065 * idle + m * (0.08 + 0.72 * liftR) + wB * 0.1 + wA * 0.25 + this.fall * 0.2;
    this.legL.rotation.z = 0.025 * idle + wA * -0.08 + wB * -0.1 + this.fall * -0.15;
    this.legR.rotation.z = -0.045 * idle + wA * 0.08 + wB * 0.1 + this.fall * 0.15;

    // Tobillos estabilizan la planta y dejan un pequeño despegue del talón/punta.
    this.footL.rotation.x = -(this.legL.rotation.x + this.kneeL.rotation.x) * m * 0.78 + m * (0.13 * Math.max(0, s) - 0.09 * Math.max(0, -s)) - this.fall * 0.12;
    this.footR.rotation.x = -(this.legR.rotation.x + this.kneeR.rotation.x) * m * 0.78 + m * (-0.13 * Math.max(0, s) + 0.09 * Math.max(0, -s)) - this.fall * 0.12;
    this.footL.rotation.z = -this.legL.rotation.z * 0.5;
    this.footR.rotation.z = -this.legR.rotation.z * 0.5;

    this.pelvis.position.x = -0.015 * idle + c * 0.012 * m;
    this.pelvis.rotation.y = s * 0.11 * m * lo + wB * 0.25 - wA * 0.15;
    this.pelvis.rotation.z = 0.025 * idle + c * 0.04 * m;
    this.pelvis.rotation.x = 0.015 * idle + Math.sin(ph * 2) * 0.018 * m;

    // El torso contrarresta cadera y hombros, conservando una postura relajada en reposo.
    const twist = wA * 0.55 - wB * 0.65;
    this.torso.rotation.y = -s * 0.14 * m * lo + twist;
    this.torso.rotation.z = -0.025 * idle - c * 0.045 * m;
    this.torso.rotation.x = 0.025 * idle + 0.095 * m + wA * -0.12 + wB * 0.3 + this.fall * -0.2;
    this.chestM.scale.set(1 + breath * 0.01 * idle, 1 + breath * 0.013, 0.68 + breath * 0.009 * idle);
    this.torso.position.y = 0.92 - 0.008 * m + breath * 0.006 * idle;
    this.torso.position.x = this.pelvis.position.x * 0.75;

    // Brazos asimétricos, codos sueltos y muñecas con retraso respecto al hombro.
    this.armL.rotation.x = (-s * 0.52 * m + breath * 0.018 * idle) * lo + wA * 0.5 + wB * -0.5 + this.fall * -0.6;
    this.armL.rotation.y = 0.025 * idle + s * 0.055 * m;
    this.armL.rotation.z = 0.105 + 0.018 * breath * idle + this.fall * 0.9 + wB * 0.25;
    this.elbowL.rotation.x = -(0.2 + 0.13 * idle + 0.26 * Math.max(0, -s) * m) * lo - wA * 0.5 - wB * 0.6;
    this.armR.rotation.x = (s * 0.52 * m - breath * 0.018 * idle) * lo + wA * -2.55 + wB * -0.55;
    this.armR.rotation.y = -0.035 * idle - s * 0.055 * m + wB * 0.12;
    this.armR.rotation.z = (-0.13 - 0.018 * breath * idle) * lo + wA * -0.35 + wB * 0.15 + this.fall * -0.9;
    this.elbowR.rotation.x = -(0.24 + 0.12 * idle + 0.25 * Math.max(0, s) * m) * lo - wA - wB * 0.3;
    this.elbowR.rotation.y = wB * 0.2;
    this.wristL.rotation.x = 0.04 + Math.sin(ph - 0.65) * 0.075 * m - this.elbowL.rotation.x * 0.12;
    this.wristR.rotation.x = -0.06 + Math.sin(ph + 0.7) * 0.065 * m - wA * 0.22 + wB * 0.18;
    this.wristL.rotation.z = 0.06 + breath * 0.012 * idle;
    this.wristR.rotation.z = -0.08 - breath * 0.012 * idle;

    // Capa y pelo reaccionan con retraso; su movimiento continúa al frenar.
    this.cape.rotation.x = 0.035 + m * 0.24 + Math.max(0, -s) * 0.055 * m + wB * 0.14 - wA * 0.05 + this.fall * 0.35;
    this.cape.rotation.z = -c * 0.035 * m + Math.sin(t * 0.8) * 0.01 * idle;
    this.capeTail.rotation.x = 0.05 + m * 0.1 + Math.sin(ph - 0.8) * 0.09 * m + Math.sin(t * 1.4) * 0.028 * idle + wB * 0.12;
    this.capeTail.rotation.z = Math.sin(ph - 0.5) * 0.035 * m;
    this.hairG.rotation.x = breath * 0.006 * idle - m * 0.012;
    this.hairG.rotation.z = -this.head.rotation.z * 0.1 + Math.sin(ph - 0.4) * 0.012 * m;

    // Mirada sutil y estable. Los parpadeos tienen intervalos variables, no un metrónomo.
    const look = (Math.sin(t * 0.31) + Math.sin(t * 0.73 + 1) * 0.45) * 0.065 * idle * lo;
    const lookY = Math.sin(t * 0.47 + 2) * 0.022 * idle;
    this.head.rotation.y = look - this.torso.rotation.y * 0.75;
    this.head.rotation.x = lookY - 0.025 * m - this.torso.rotation.x * 0.75 + wA * 0.1 + this.fall * -0.5 + breath * 0.006;
    this.head.rotation.z = -this.torso.rotation.z * 0.65 + Math.sin(t * 0.43) * 0.008 * idle;
    if (this.blinkStart < 0 && t >= this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 2.2 + Math.random() * 4;
    }
    const bt = t - this.blinkStart;
    const blink = this.blinkStart >= 0 && bt <= 0.16 ? Math.max(0.08, Math.abs(bt - 0.08) / 0.08) : 1;
    if (bt > 0.16) this.blinkStart = -1;
    const eyeS = this.dead ? 0.12 : blink;
    for (const e of this.eyes) e.scale.y = eyeS;
    const ex = look * 0.09;
    for (const i of this.irises) i.position.x = ex;
    const angry = ab;
    this.browL.rotation.z = -0.07 - 0.22 * angry + (this.dead ? 0.3 : 0);
    this.browR.rotation.z = 0.07 + 0.22 * angry - (this.dead ? 0.3 : 0);
    this.browL.position.y = this.browR.position.y = 0.068 - 0.01 * angry;
    this.mouthM.scale.set(1 - wB * 0.25, 1 + wB * 5 + (this.dead ? 4 : 0), 1);
    this.mouthM.position.y = -0.103 + breath * 0.0015 * idle;

    // El rebote es corto y vertical; no desliza todo el cuerpo de lado como un autómata.
    this.root.position.y = Math.cos(ph * 2) * 0.024 * m - 0.008 * m + breath * 0.002 * idle + (this.dead ? this.fall * 0.2 : 0);
    this.root.position.x = c * 0.012 * m;
    this.root.position.z = wB * 0.16 - wA * 0.04;
    this.root.rotation.x = -this.fall * 1.5;
    if (this.riding && !this.dead) { // sentado en la escoba: piernas recogidas, manos al mango, cuerpo inclinado
      this.legL.rotation.set(-1.25, 0, 0.24); this.legR.rotation.set(-1.25, 0, -0.24);
      this.kneeL.rotation.x = 1.5; this.kneeR.rotation.x = 1.5;
      this.footL.rotation.set(0.3, 0, 0); this.footR.rotation.set(0.3, 0, 0);
      this.pelvis.rotation.set(0, 0, 0); this.pelvis.position.x = 0;
      this.torso.rotation.set(0.42, 0, 0); this.torso.position.x = 0;
      this.armL.rotation.set(-1.0, 0, -0.2); this.armR.rotation.set(-1.0, 0, 0.2);
      this.elbowL.rotation.x = -0.45; this.elbowR.rotation.x = -0.45; this.elbowR.rotation.y = 0;
      this.head.rotation.set(-0.36, 0, 0);
      this.cape.rotation.x = 0.95 + Math.sin(t * 6) * 0.08; this.capeTail.rotation.x = 0.25 + Math.sin(t * 7.3) * 0.12;
      this.root.position.set(0, 0, 0);
    }
  }
}
