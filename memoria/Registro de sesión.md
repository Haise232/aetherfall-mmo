---
tipo: registro
fecha: 2026-11-16
---

# Registro de sesión

Volver al [[Índice de memoria|índice]].

## 2026-11-16 — Sistema de misiones, NPCs, rezo y transformación

### Hecho
- Se añadió música al rezar: el archivo `Seiken Tsukai no World Break OST - Main Theme.mp3` se copió a `apps/client/public/assets/pray.mp3` y suena durante los primeros 21 s con fade out suave al final.
- Se añadió un aro de luz dorado que envuelve al personaje mientras reza.
- Se implementó la mecánica de rezar con la tecla `F`: el personaje se arrodilla, bloquea el movimiento y al terminar se levanta automáticamente.
- Se amplió el castillo con patio más grande, fuente monumental de la diosa y puerta auténtica con torres, rastrillo y estandartes.
- Se añadieron NPCs interactivos con diálogo, hitbox, etiqueta de nombre y marcador `!` de misión:
  - Maese Albor (maestro del gremio).
  - Ulfric (peletero).
  - Iris (sacerdotisa de la diosa).
- Se implementó un sistema de misiones secuencial con tres quests:
  1. `guild`: elegir oficio con Maese Albor.
  2. `pelts`: matar 5 lobos, recolectar 3 pieles y entregarlas a Ulfric.
  3. `pray`: rezar ante la fuente de la diosa.
- Se añadieron recompensas de misión: XP e items (armadura de cuero en `pelts`).
- Se añadieron marcadores de misión en el minimapa y flecha guía hacia el objetivo.
- Se hicieron los oficios cambiables y se añadieron niveles de oficio propios (`jobLevel`, `jobXp`) que suben al matar enemigos.
- Se implementó el cambio de clase hablando con el maestro del gremio (reutilizando el selector de personaje).
- Se implementó la transformación por la bendición de la diosa:
  - Mago → Mago de la Luz.
  - Caballero → Paladín.
  - Aspectos ocultos con tinte dorado que se desbloquean al rezar.
- Se documentó todo en `README.md`, `AGENTS.md` y esta bóveda.

### Archivos clave modificados
- `packages/shared/src/classes.ts`, `quests.ts`, `items.ts`, `protocol.ts`
- `apps/server/src/zone.ts`, `store.ts`
- `apps/client/src/main.ts`, `models/character.ts`, `ui/create.ts`, `ui/quest.ts`
- `apps/client/src/world/castle.ts`, `world/npcs.ts` (nuevo), `world/guide.ts` (eliminado)

### Pendiente anterior
- (se mantiene) Decidir si se quiere un agente de documentación más estricto.

## 2026-11-16/17 — Catedral transitable, diosa y formas bendecidas

- **Catedral** reescrita como edificio hueco (`cathedral()` en `world/buildings.ts`, medidas en `CATHEDRAL` de `shared/world.ts`): naves con arcadas, crucero con rosetones, tribuna con órgano, bancos, lámparas, vidrieras que se ven por dentro y por fuera, fachada con portal abierto. Colisionadores por muro y nuevo campo `y0` (tejados que solo frenan a quien vuela).
- **Decisión**: cabecera plana en vez de ábside, porque la torre SO del castillo (-50,-44) invade ese espacio. No se movió la catedral para no alterar el reparto determinista de casas y puestos.
- **Estatua de la diosa** rediseñada (mármol y oro, alas, halo, estrella) y trasladada al fondo de la nave (`GODDESS_STATUE`, `PRAY_RANGE` = 7). Se quitó la fuente del patio del castillo. La sacerdotisa Iris está ahora dentro de la catedral.
- **Cámara**: dentro de la catedral se acorta para no salirse de la sala (`CATHEDRAL_ROOMS`, `roomCamDist` en `main.ts`).
- **Música**: `pray.mp3` suena en bucle desde la estatua, con volumen según la distancia (32 m); al rezar suena la pista completa como antes.
- **Mago de la Luz y Paladín**: habilidades propias (Lanza de luz, Sol naciente, Plegaria sanadora / Martillo de justicia, Égida sagrada, Consagración), mecánica de curación (`heal`) y buff `aegis`; aspecto blanco y oro con resplandor, halo, orbes (mago) o alas de luz (paladín), báculo y escudo rectangular.
- **Bendición**: evento `bless` del servidor y efecto `fx.bless` (rayo desde la estatua, columna de luz, chispas, ondas y alas).
- **Verificado**: typecheck y build; colisiones por simulación; geometría, estatua, personajes y efecto por capturas en Chrome sin interfaz (página de depuración temporal, ya borrada). **Sin verificar jugando**: la cámara en movimiento, la música, las habilidades nuevas contra lobos y el flujo completo rezo → bendición.

## 2026-11-17 — Ajustes de las formas sagradas y barra de habilidades

- Mago de la Luz y Paladín ya no se tiñen enteros (dejaba la piel y todo en beige). Ahora se repinta solo la ropa y la armadura en el atlas de textura KayKit (8×4 casillas) con `palette` en el estilo (`classes.ts`) y `repaint()` en `models/character.ts`. Mago: túnica blanca, adornos dorados, gema azul claro. Paladín: armadura blanca, oro, capa y escudo azules.
- Paladín: alas de plumas (antes eran placas planas translúcidas) y aureola dorada horizontal sobre el yelmo. Mago: solo orbes (el halo chocaba con el sombrero).
- Barra de habilidades: casillas cuadradas solo con icono y tecla; nombre, descripción y enfriamiento en un rótulo al pasar el ratón.
- Verificado con capturas en Chrome sin interfaz, typecheck y build. Sin probar jugando.

## 2026-11-17 — Monturas por clase

- La tecla R monta la montura de la clase (`mount` en `ClassDef`/`StyleDef`, `MOUNTS` y `mountOf()` en `shared/classes.ts`): mago → escoba voladora; caballero → caballo; paladín → corcel sagrado blanco con pretal dorado; bárbaro → cabra montesa; pícaro → pantera sombría.
- **Decisión**: solo la escoba vuela. Las monturas de tierra corren más (×2,1 a ×2,4), chocan con muros y no suben. Montado no se combate y los lobos te ignoran, igual que con la escoba. El campo `fly` del protocolo significa ahora "montado".
- Modelos procedurales en `apps/client/src/models/steed.ts` (galope/trote, cola, respiración). Al montar aparecen con una nube de polvo y el jinete salta a la silla.
- Verificado con capturas, typecheck y build. Sin probar jugando.

## 2026-11-17 — Pasivas por clase y ciclo de día y noche

- **Pasivas** (servidor; visibles como 4.ª casilla con estrella en la barra y en la creación de personaje):
  Caballero "Escudo firme" (20 % bloqueo, −10 % daño recibido) · Bárbaro "Sangre caliente" (hasta +50 % daño con poca vida, +10 % vida por muerte) · Mago "Mente arcana" (−25 % enfriamientos) · Pícaro "Golpe certero" (25 % crítico ×2, +12 % velocidad a pie) · Paladín "Juramento de luz" (25 % bloqueo, −15 % daño, +1 % vida/s) · Mago de la Luz "Gracia divina" (−30 % enfriamientos, robo de vida 15 %). Números de primer ajuste.
- Textos flotantes nuevos: "¡Crítico! N" y "Bloqueo".
- **Cielo**: cúpula con shader (degradado, sol, luna, estrellas titilantes, nubes que avanzan). **Ciclo de día y noche** de 24 min reales sincronizado por reloj; mueve sol/luna y sombras, colores de luz y niebla, enciende farolas y aviva ventanas de noche. Hora del juego en el pie del minimapa.
- **Decisión**: hora por reloj del cliente (sin mensaje del servidor). Si un jugador tiene el reloj desajustado verá otra hora; si molesta, el servidor puede enviar la hora en `welcome`.
- Verificado con capturas (12:00, 6:12, 18:18, 23:00), typecheck y build. Sin probar jugando.

## 2026-11-17 — Interiores habitables: Gremio y casas-taller

- El Gremio de Mercaderes y las 22 casas-taller (`style: "workshop"`) son huecos y se entra por la puerta (abierta, con umbral).
- Gremio: sala de doble altura con mostrador (Maese Albor detrás), puesto de pieles de Ulfric, estanterías de libros, cofres, barriles, mesa larga con bancos, tablón de encargos, chimenea, alfombra, galería alta con estandartes y dos lámparas de velas.
- Talleres: banco de trabajo con tornillo, panel de herramientas, yunque, pequeña fragua encendida, barriles, estante con tarros y farol colgante. El tejadillo de fuera se apartó de la puerta.
- Muebles y colisiones salen de los mismos datos compartidos (`interiorProps`). Dos luces cálidas siguen al interior más cercano. La cámara se acorta dentro (`INTERIOR_ROOMS`).
- Se movieron el maestro del gremio y el peletero dentro del Gremio (el peletero estaba metido en el muro).
- Verificado: capturas dentro y fuera, simulación de colisiones (se entra en los 22 talleres y en el Gremio, se llega a hablar con los NPC, los muros frenan), typecheck y build. Sin probar jugando.
