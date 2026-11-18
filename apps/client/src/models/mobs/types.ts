import type * as THREE from "three";

/**
 * Modelo de una criatura enemiga. Mira hacia +Z local; el origen está en el suelo entre sus patas.
 * main.ts lo crea con `createMobModel(tipo)` y llama a estos métodos; cada tipo puede implementarlo como quiera
 * (procedural o con un .glb de licencia libre).
 */
export interface MobModel {
  readonly group: THREE.Object3D;
  /** Volumen invisible para el clic (raycaster). */
  readonly hitbox: THREE.Mesh;
  /** Altura (m) a la que van la barra de vida y las estrellas de aturdido. */
  readonly height: number;
  /** Escala del anillo de selección en el suelo (1 ≈ lobo). */
  readonly ring: number;
  /** Cada fotograma: `speed` en m/s sobre el suelo. */
  update(dt: number, speed: number): void;
  /** Al atacar (golpe cuerpo a cuerpo). */
  attack(): void;
  /** Al recibir un golpe (`strong`: habilidad o crítico). */
  hurt(strong?: boolean): void;
  setDead(dead: boolean): void;
  dispose?(): void;
}
