# Notas para agentes de código

## Convenciones del proyecto

- Monorepo con `packages/shared` (lógica y datos compartidos) y `apps/client` / `apps/server`.
- TypeScript estricto. Ejecuta `npm run typecheck` y `npm run build` después de cualquier cambio significativo.
- El cliente usa Three.js con gráficos procedurales (geometrías básicas, canvas para texturas).
- El servidor es autoritativo: el cliente envía intenciones, el servidor valida y difunde snapshots.
- No modifiques la base de datos SQLite manualmente; el servidor migra columnas automáticamente en `store.ts`.

## Cómo probar

```bash
npm run typecheck
npm run build
npm run dev
```

Luego abre `http://localhost:8787`.

## Puntos clave del código

### Clases y aspectos
- Definidos en `packages/shared/src/classes.ts`.
- `LookSel = [ClassId, styleIndex, toneIndex]`.
- Los estilos pueden marcar `hidden: true` para no aparecer en la creación inicial (útil para transformaciones).
- `blessedLook(look)` convierte Mago → Mago de la Luz y Caballero → Paladín.
- Las formas bendecidas son estilos con campos propios (`title`, `color`, `glow`, `aura`, `unarmed`, `shield`, `skills`). Usa siempre `skillsOf(look)` y `lookColor(look)` en vez de `classOf(...).skills/.color`.
- Habilidades: cualquier `SkillDef` puede llevar `heal` (fracción de vida máxima); el tipo `heal` solo cura. El servidor emite el evento `heal`.
- Al completar un rezo el servidor emite `bless` (`transformed` si cambió de forma); el cliente lo dibuja con `fx.bless`.

### Misiones
- Catálogo en `packages/shared/src/quests.ts`: `QUESTS`, `NPCS`, `JOBS`.
- Progresión en el servidor (`apps/server/src/zone.ts`):
  - `progressKill` / `progressCollect` se llaman al matar o recibir loot.
  - `progressPray` se llama desde el cliente con `questProgress`.
  - `talkToNpc` / `advanceQuest` / `completeQuest` manejan la entrega.
- Persistencia: columnas `quest`, `quest_count`, `completed_quests` en SQLite.

### Rezar
- Cliente inicia rezo con `F` cerca de `GODDESS_STATUE` (al fondo de la nave de la catedral, a menos de `PRAY_RANGE`).
- Duración 21 s, con fade out del audio y del aro de luz en el último segundo.
- Al terminar envía `{ t: "questProgress", kind: "pray" }`.
- La transformación se aplica en el servidor y se sincroniza por snapshot.

### Catedral
- Es hueca y transitable: medidas en `CATHEDRAL` (`packages/shared/src/world.ts`), geometría en `cathedral()` (`apps/client/src/world/buildings.ts`).
- Los muros son losas (se ven por fuera y por dentro); si cambias medidas, actualiza también sus colisionadores en `COLLIDERS` y `CATHEDRAL_ROOMS` (límites de la cámara interior, usados en `main.ts`).
- Los colisionadores con `y0` (tejados) solo afectan a quien vuela por encima de esa altura.

### Gran salón del castillo (salón del trono)
- Hueco y transitable: se entra por el arco de la puerta del castillo (`HALL.gateZ`). Medidas en `GREAT_HALL`/`HALL` y muebles en `HALL_PROPS` (`shared/world.ts`): el servidor saca de ahí las colisiones y el cliente los dibuja (`hallInterior` en `castle.ts`, muros en `greatHall` de `buildings.ts`).
- La cámara usa sus entradas en `INTERIOR_ROOMS`. Si cambias medidas, revisa las torres de `CASTLE_TOWERS` que lo rodean (no deben invadir el salón).
- NPCs: Reina Isolda, el senescal Bertrand y la juglar Lira (`NPCS` en `quests.ts`).

### Interiores (Gremio y casas-taller)
- `isEnterable(b)`: el Gremio y las casas con `style: "workshop"`. Marco local y muebles en `interiorFrame` / `interiorProps` (`shared/world.ts`): el servidor saca de ahí las colisiones y el cliente los dibuja (`interiorShell` / `furnish` en `buildings.ts`).
- Las plantas huecas (`hollowFloors`) se dibujan con paños de muro; las de arriba siguen siendo macizas. La cámara usa `INTERIOR_ROOMS` (catedral + interiores).
- El maestro del gremio y el peletero están dentro del Gremio.

### Cuentas (beta)
- `apps/server/src/auth.ts`: registro e inicio de sesión (scrypt con sal, asíncrono), bloqueo de 1 min tras 5 fallos, sesiones de 30 días guardadas como hash SHA-256 del token. Tablas `accounts` y `sessions`; columna `characters.account`.
- Protocolo: `register`, `login`, `resume` (token recordado), `logout`; el servidor responde `auth` (con los personajes de la cuenta) o `authError`. `join` exige sesión y que el personaje sea de la cuenta (`MAX_CHARS` por cuenta). Los personajes antiguos sin dueño los reclama la primera cuenta que entre con ese nombre.
- El servidor real exige cuenta; `ALLOW_GUEST=1` permite entrar sin ella (bots locales). `new Zone(send, store)` sin tercer argumento no la exige (pruebas en proceso).
- Cliente: `ui/login.ts` (Entrar / Crear cuenta y selección de personaje); el token va en `localStorage` como `session`.

### Administración (beta por invitación)
- Registro = solicitud pendiente (sin contraseña). Un administrador la aprueba en el panel (`ui/admin.ts`) y se genera una contraseña temporal (`must_change`): el jugador debe cambiarla (`changePass`) antes de jugar. Columnas `role`, `status`, `must_change`, `note` en `accounts`.
- Primer arranque del servidor real: crea `admin` con `ADMIN_PASSWORD` o, si no hay, `admin` (obliga a cambiarla al entrar). `ADMIN_RESET=1` la restablece. Los administradores entran directos al panel.
- Panel: solicitudes (aceptar/rechazar), cuentas (contraseña temporal nueva, bloquear), conectados (expulsar → mensaje `kicked`), eventos del mundo (`WORLD_EVENTS`: `xp2`, `gather2`, `wolfmoon`, con duración; mensaje `world`) y avisos (evento `announce`). Mensajes `admin` con `AdminOp`; el servidor comprueba rol y que la contraseña ya no sea temporal.

### Progresión de habilidades y de clase
- `shared/progression.ts`: casillas 1–3 con tres opciones cada una (`skillOptions`: la de la clase o forma bendecida y dos de `ALT_SKILLS`, que se desbloquean a nivel 3 y 8 con un punto) y la definitiva (4) de `ULTIMATES`, a nivel `ULT_LEVEL`. Estado `SkillState` (`ranks` por clave `s{casilla}o{opción}` / `u`, y `pick` de cada casilla); usa `equippedSkills` para lo que se lanza y `rankedSkill` para aplicar el rango.
- Un punto por nivel (`freePoints`); `canRankUp` valida. Mensajes `skillUp {slot,opt}`, `skillPick {slot,opt}` (cambiar cuesta 2 s de recarga) y `skillReset` (fuera de combate). El evento `cast` lleva la clave `k`. Cambiar de clase devuelve los puntos. Se guarda en `InvState.skills` y en la columna `skill_ranks` (JSON; `validSkills` acepta el formato antiguo).
- Títulos de clase por nivel (`CLASS_TITLES`, `CLASS_RANK_LEVELS`): +5 % de vida y daño por rango, aplicado en `playerStats`.
- Cliente: ventana `ui/progression.ts` (K), barra `ui/skills.ts` (rangos, definitiva bloqueada) y barra superior `ui/topbar.ts` (I, K con los puntos sin gastar, M).
- Sonido ambiente: `world/ambience.ts` (agua, pájaros, grillos, viento, hojas; WebAudio sintetizado; `renderTest` para medir con OfflineAudioContext).

### Pasivas y monturas
- `passive` (`PassiveDef`) y `mount` (`MountId`) en cada clase; las formas bendecidas pueden sobrescribirlos en su estilo. Usa `passiveOf(look)` y `mountOf(look)`.
- Las pasivas las aplica el servidor (`damage`, `step`, enfriamientos en `skill`); el cliente replica velocidad y enfriamiento para la predicción y la barra.
- Solo la escoba vuela (`MOUNTS[...].flies`); `fly` en el protocolo significa "montado".

### Cielo y ciclo de día y noche
- `apps/client/src/world/sky.ts`: cúpula con shader (degradado, sol, luna, estrellas, nubes) y control de luces, niebla, farolas y ventanas.
- La hora sale de `Date.now()` y `DAY_CYCLE_SEC` (shared): todos los clientes coinciden sin mensajes. `?hora=21` en la URL fija la hora para pruebas.

### NPCs
- Renderizados con `createNpcs` en `apps/client/src/world/npcs.ts`.
- Cada NPC tiene hitbox, etiqueta de nombre, `!` de misión y flecha guía.
- El diálogo se maneja en `apps/client/src/ui/quest.ts`.

### Oficios de recolección
- Oficios: Pescador, Peletero, Recolector y Minero (`JOBS` en `quests.ts`). Reglas, botín y puntos en `packages/shared/src/gather.ts` (`GATHER`, `GATHER_LOOT`, `GATHER_NODES`, `GATHER_TOOL`).
- E interactúa: habla si hay un NPC al lado; si no, empieza la faena en el recurso más cercano (mensaje `gather`). El servidor valida oficio, herramienta, distancia y que el punto no esté agotado; la faena se cancela al moverse, atacar o montar.
- El maestro del gremio entrega la herramienta al elegir oficio (y al entrar, si falta). Cambiar de oficio reinicia su nivel.
- Snapshot: `down` (puntos agotados), `act` en la entidad (faena en curso), `skinned` (lobo ya desollado). Eventos `note` (aviso privado) y `gathered`.
- Cliente: `world/nodes.ts` (vetas, matas, bancos de peces, destellos de tu oficio), `ui/gather.ts` (barra de faena), rombos verdes en el minimapa.
- Rarezas: `RARITIES` en `items.ts` (común, poco común, rara, épica, legendaria; multiplican precio y experiencia de oficio). Cada recurso recolectable tiene sus variantes registradas en `ITEMS` con id `base@r` (r = 1..4); usa `baseItem`, `rarityOf`, `withRarity`. La tirada (`rollRarity`) mejora con el nivel del oficio; los puntos ricos (`rollRichness`, `rich` en el snapshot) brillan de su color y la garantizan a menudo. Las misiones de recolectar cuentan cualquier rareza.

### Casa de subastas y moneda
- Moneda: besantes (`coins` del personaje, columna en SQLite). Entra dinero solo vendiendo recursos al subastador (`npcBuyPrice`, la mitad de `basePrice`).
- Reglas y constantes puras en `packages/shared/src/market.ts` (tasa 2 % al publicar, impuesto 5 % al vender, límites, `isTradable`). Solo se comercian recursos.
- Servidor: `apps/server/src/market.ts` (`MarketBook`: libro en memoria, casado precio-tiempo sin cruzar con uno mismo, transacciones SQLite, tabla `market_orders`). `zone.ts` solo valida acceso (distancia `MARKET_RANGE` al subastador, rate limit) y delega. Regla: jugador conectado = se modifica su `Ent`; desconectado = SQL (`addCoins`/`addItems`).
- Protocolo `mk*` en `protocol.ts`; eventos `sold`/`bought`.
- Cliente: ventana `ui/market.ts` (se abre desde el diálogo de Odalric), plaza 3D `world/market.ts` (pavimento, mostrador, tablón de precios con `setBoard`, puestos `MARKET_ROW`). Posiciones en `world.ts` (`MARKET_SQUARE`, `AUCTIONEER`, `PRICE_BOARD`...).
- Pruebas: `npx tsx tools/bots/market-check.ts`.

### Colisiones
- Todas en `COLLIDERS` (`shared/world.ts`); el servidor las usa para todos y el cliente para predecir. Lo que se dibuje a la altura del cuerpo (0,5–1,8 m) fuera de la huella de un edificio necesita su colisión aquí, con la misma fórmula de posición que el dibujo (`faceXZ` = `onFace` del cliente).
- Cámara: `rayBlockDist` (solo obstáculos grandes y altos) y `INTERIOR_ROOMS` para los interiores.
- Auditoría: guion que construye la escena en Node y cruza geometría con colisiones (ver memoria del proyecto).

### Barrios, parques y descanso
- `shared/parks.ts`: `DISTRICTS` (nombre, color, paletas de casas), `PARKS`, `PARK_PROPS` (huellas = colisiones), `SEATS`, `TOWNSFOLK_SEATS` (reservados a vecinos), `EMOTES`. `districtAt(x,z)` está en `world.ts` (parks.ts no importa nada para evitar ciclos).
- Sentarse: mensaje `sit`; el servidor fija la postura (`pose` en la entidad), cura `REST_REGEN` fuera de combate y levanta al moverse, atacar, montar o recibir un golpe. Gestos por chat (`/saludar`, `/aplaudir`, `/vitorear`, `/sentarse`, `/tumbarse`) → evento `emote`.
- Cliente: `world/parks.ts` (parques y vecinos), `Character.setPose`, rótulo `#district` al cambiar de barrio y nombre del barrio en el pendón del minimapa.

### Inventario
- `ui/inventory.ts`: ficha, equipo, oficio con su herramienta y mochila en cuadrícula con pestañas. Cada ítem tiene `cat` (icono y pestaña) en `items.ts`.

### Cambio de clase/oficio
- Protocolo: `changeClass` y `job`.
- UI: selector de clase reutilizable (`createCreator` en modo `changeClass`) y diálogo del gremio.

### Despliegue (PC propio + Cloudflare Tunnel)
- Producción: `npm run build` y `npm start`. El servidor (`apps/server/src/http.ts`) sirve `apps/client/dist` (comprimido con gzip al arrancar) y acepta el WebSocket en `/ws` (o `/`) del mismo puerto. `/salud` responde `ok`.
- `main.ts`: límites `MAX_CONN`/`MAX_PER_IP` (IP real de `CF-Connecting-IP` si llega del propio equipo), ping cada 30 s, copia `VACUUM INTO` al arrancar y cada día en `data/backups` (últimas `BACKUP_KEEP`), y apagado limpio con SIGTERM (guarda a todos y cierra con código 1012; el cliente espera a `/salud` y recarga solo).
- Servicios systemd en `deploy/` (`valdoria.service` aislado: solo ve el proyecto y escribe en `apps/server/data`; `valdoria-tunnel.service` con el túnel rápido). Scripts: `sudo deploy/instalar.sh`, `deploy/direccion.sh` (dirección actual), `deploy/actualizar.sh` (compila y reinicia), `sudo deploy/desinstalar.sh`.
- No ejecutes `npm run dev` a la vez que el servicio: comparten puerto 8787 y base de datos.

## Cosas a tener en cuenta

- `Character.setLook` y `playerLook` son la fuente de verdad del aspecto visual. El tinte ahora se aplica a todas las mallas.
- El minimapa recibe un único objetivo con `setGoal`; se actualiza desde `main.ts` según la quest activa.
- Los estilos ocultos no deben mostrarse en `createCreator`; filtra por `style.hidden`.
- Si cambias el protocolo, actualiza también los tipos en `protocol.ts` y maneja los mensajes en ambos lados.
