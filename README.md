# Valdoria

**Un MMORPG medieval que se juega en el navegador**, sin instalar nada. Una ciudad amurallada con su castillo, su catedral y sus barrios; lobos fuera de la muralla; oficios, mercado entre jugadores y una diosa que bendice a quien reza ante ella.

> Estado: **beta cerrada por invitación**. Se pide cuenta desde la propia web y un administrador la aprueba.

![La Plaza Mayor de Valdoria](docs/plaza-mayor.png)

## Jugar

<!-- DIRECCION -->
**Dirección:** se publica aquí en cuanto el servidor esté en marcha.
<!-- /DIRECCION -->

Funciona en cualquier navegador moderno de escritorio con WebGL (Chrome, Firefox, Edge, Safari). Para entrar:

1. Pulsa **Solicitar cuenta**, elige un usuario y, si quieres, deja un mensaje.
2. Cuando se apruebe te llegará una **contraseña temporal**; al entrar por primera vez elegirás la tuya.
3. Crea tu personaje (hasta 3 por cuenta) y aparecerás en la Plaza Mayor.

### Controles

| Tecla | Acción |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Moverte |
| <kbd>Espacio</kbd> | Saltar (subir, con la escoba) |
| Ratón | Arrastrar para girar la cámara; rueda para el zoom |
| Clic | Atacar o seleccionar |
| <kbd>1</kbd>–<kbd>4</kbd> | Habilidades (la 4 es la definitiva) |
| <kbd>R</kbd> | Montar o desmontar |
| <kbd>E</kbd> | Hablar, sentarse o trabajar en tu oficio |
| <kbd>F</kbd> | Rezar ante la estatua de la diosa |
| <kbd>I</kbd> / <kbd>K</kbd> / <kbd>M</kbd> | Inventario, habilidades, mapa |
| <kbd>Enter</kbd> | Chat (y gestos: `/saludar`, `/aplaudir`, `/vitorear`, `/sentarse`, `/tumbarse`) |

## Qué hay en el juego

### Una ciudad viva
- **Seis barrios** con carácter propio: Plaza Mayor, Recinto del Castillo, Barrio de la Catedral, Barrio del Gremio, Barrio Viejo y Barrio del Yunque, y los **Campos de Valdoria** fuera de la muralla.
- **Castillo habitable** con su gran salón del trono (la Reina Isolda, el senescal Bertrand y la juglar Lira), **catedral transitable**, gremio y casas-taller por dentro.
- **Parques y bancos** para descansar: sentado recuperas vida más deprisa. Los vecinos pasean, charlan y se sientan.
- **Ciclo de día y noche** compartido por todos los jugadores, con sol, luna, estrellas, nubes, farolas y ventanas que se encienden.
- **Sonido ambiente** sintetizado en el navegador: agua, pájaros, grillos, viento y hojas.

### Clases y progresión
- **Cuatro clases**: Caballero, Bárbaro, Mago y Pícaro, cada una con habilidades, pasiva y montura propias.
- **Bendición de la diosa**: rezar 21 segundos ante su estatua transforma al Caballero en **Paladín** y al Mago en **Mago de la Luz**.
- **Árbol de habilidades**: tres casillas con tres opciones cada una (se desbloquean a nivel 3 y 8), una definitiva a nivel 6 y un punto por nivel para aprender o mejorar (hasta rango 5).
- **Rangos de clase** con título propio que dan más vida y daño al subir de nivel.

### Oficios y economía
- **Cuatro oficios de recolección**: Pescador, Peletero, Recolector y Minero, cada uno con su herramienta y su nivel.
- **Rarezas**: común, poco común, rara, épica y legendaria. Cuanto más nivel de oficio, mejores hallazgos; los puntos ricos brillan del color de su rareza.
- **Casa de subastas** en la plaza del mercado: los jugadores ponen precio a sus materiales y compran los de otros, con tablón de precios y moneda propia (besantes).

### Combate y mundo exterior
- Lobos con inteligencia básica fuera de la muralla, botín y reaparición.
- **Monturas**: caballo, corcel sagrado, cabra montesa, pantera sombría y **escoba voladora** para el mago.
- **Misiones** encadenadas con NPCs que tienen diálogo, marcador de misión y flecha guía.

### Para la beta
- **Cuentas** con contraseña cifrada (scrypt), sesiones recordadas y bloqueo tras varios intentos fallidos.
- **Panel de administración**: aprobar solicitudes con contraseña temporal, bloquear cuentas, expulsar jugadores, mandar avisos y activar **eventos del mundo** (doble experiencia, doble recolección y luna de lobos).

![Panel de administración: eventos del mundo](docs/panel-admin.png)

## Cómo está hecho

| Parte | Tecnología |
|---|---|
| Cliente | TypeScript, [Three.js](https://threejs.org/) y Vite. Casi todo el mundo es **procedural**: geometrías básicas y texturas dibujadas en canvas. |
| Servidor | Node.js 22 con WebSocket (`ws`). **Autoritativo**: simula el mundo a 20 ciclos por segundo, valida todo lo que piden los clientes y les envía el estado. |
| Datos | SQLite (`node:sqlite`) con migración automática de columnas y copias de seguridad diarias. |
| Compartido | Reglas, datos del mundo, colisiones y protocolo en un paquete común que usan cliente y servidor. |
| Despliegue | Un PC propio con servicios systemd aislados y **Cloudflare Tunnel** delante (HTTPS sin abrir puertos). |

```
packages/shared/   reglas y datos comunes: clases, progresión, objetos, oficios, mercado, mundo, protocolo
apps/server/       simulación (zone.ts), cuentas (auth.ts), subastas (market.ts), SQLite (store.ts), HTTP (http.ts)
apps/client/       Three.js: mundo (world/), personajes y monturas (models/), interfaz (ui/)
deploy/            servicios systemd y guiones de instalación, actualización y dirección del túnel
tools/bots/        bots de carga y pruebas automáticas (mercado, rendimiento)
```

Medido en el servidor: con 25 jugadores cada ciclo tarda unos 1,6 ms de los 50 ms disponibles; con 100, unos 15 ms.

## Desarrollo

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev          # servidor (8787) y cliente con recarga en caliente (http://localhost:5173)
npm run typecheck
npm run build
npm start            # servidor de producción: sirve la página compilada y el juego en http://localhost:8787
```

La primera vez se crea la cuenta `admin` / `admin` y obliga a cambiar la contraseña al entrar (o usa `ADMIN_PASSWORD`). `ALLOW_GUEST=1` permite entrar sin cuenta para probar con bots.

## Despliegue

```bash
sudo deploy/instalar.sh      # instala el juego y el túnel como servicios (arrancan con el equipo)
deploy/direccion.sh          # muestra la dirección pública actual
deploy/publicar-direccion.sh # la escribe en este README y la sube a GitHub
deploy/actualizar.sh         # publica cambios: compila y reinicia (los jugadores se guardan y vuelven a entrar solos)
```

El servicio del juego solo escucha en el propio equipo y solo puede escribir en `apps/server/data`; desde Internet se entra únicamente por el túnel.

## Créditos

- Modelos de personaje: [KayKit: Adventurers Character Pack](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) de Kay Lousberg (licencia CC0, ver `apps/client/public/models`).
- Tipografías: Grenze Gotisch y Alegreya Sans (SIL Open Font License).

Proyecto personal de **Joaquín** · Haise232.
