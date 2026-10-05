# QA: ataque y disparo

Validado el 04-10-2026 sobre el árbol sin commitear de `arte-mapas`. El estado del arte es el que dio el coordinador: el granadero tiene A, B y C en las 8 direcciones y un atlas de 7 filas con `shoot.suelta = 4`. El resto de tiradores del Imperio sigue con 6 filas.

Navegador: Playwright con el Chromium propio (`~/.cache/ms-playwright/chromium-1234`), contra un vite mío en el puerto 3187. Lo arranqué con `set -m`, lo maté por su grupo y comprobé que el puerto quedaba libre (`ss -ltnp` → «libre»). No he editado código ni assets, no he lanzado trabajadores y no he commiteado nada.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `shoot` opcional; una figura sin él es válida | ✅ | Los botones de la ficha en `/arena/`: granadero y elfo-arquero dan `idle,walk,charge,attack,shoot,hurt,death`; templario-escudo e imperio-ballestero dan los 6 sin `shoot`. Los 4 cargan y pelean sin errores. |
| 2 | `attack` siempre cuerpo a cuerpo | ✅ | Atlas `imperio-granadero/d1`: la fila 3 es el tajo de sable y la fila 6, el lanzamiento. En la pelea de la arena (semillas 3, 7 y 11), las rondas de cuerpo a cuerpo pintan la fila 3 del granadero (`d3 fila 3 cols 0-5`, `d1 fila 3`). Los disparos pintan la fila 6 (`d2 fila 6 cols 0-6`). Lo saqué espiando `drawImage` del `#canvas`. |
| 3 | Poses del Y Bot: `attack` con el arma de mano, `shoot` con el arma de tiro y su curva | ✅ | Montaje `d2-b` fila 0 / `d2-c` de los 7 tiradores:<br>• arco: daga / arco;<br>• ballesta: espada corta / ballesta;<br>• granada: sable / lanzamiento;<br>• montado-pistola: tajo / pistola;<br>• arcabucero: espada / arcabuz;<br>• artillero: botafuego largo / culebrina;<br>• ingeniero: martillo / arma.<br>En los 3 maniquíes, `poses.json` trae `sourceMetadata.shoot`; en los 7 que no disparan, no. |
| 4 | La `suelta` vive en `shoot` | ✅ | En `atlas-8d.json`, arco, ballesta, granada y montado-pistola llevan `{'shoot': 4}` en las 8 direcciones, con `shoot.row = 6` y ninguna suelta en `attack`. Los 6 juegos restantes no llevan suelta. En el granadero pintado, la suelta está en `shoot` (4) y no en `attack` en d0-d7. La derivación la vigila el test «una dirección vuelta a derivar da el mismo JSON», que pasa. |
| 5 | El taller encarga `shoot`; quien no dispara, igual que hoy | ✅ (por tests) | Lo cubren los tests de `taller-8d`: el granadero tiene 24 encargos con la C; hay huella sha256 de los encargos de quien no dispara; juntar da 7 filas o espera a la C. Además, el granadero pintado de verdad salió con 7 filas en las 8 direcciones, y `pnpm verify` re-deriva sus atlas y salen iguales. No he lanzado `encolar` (prohibido tocar la cola). |
| 6a | Un paso `shoot` del núcleo pinta `shoot` y un `attack`, `attack` | ✅ | Ver la fila 2 (espía de `drawImage`, granadero). El arquero Y Bot pide `arco-8d/d1-c.png` y `d2-c.png` al disparar. |
| 6b | El proyectil sale en la suelta | ✅ por test / ⚠️ a ojo | En la pelea de la semilla 7, un proyectil en vuelo entre el arquero y el enemigo (`shots/p7-004.png` del scratchpad). No he medido a qué fotograma sale en el navegador; lo fija `anim.test.ts` («un arquero dispara con su clip shoot…»). |
| 6c | Sin `shoot` cae a `attack` sin romperse y avisando dónde | ✅ | La consola de la arena (semillas 3 y 11), con 2 ballesteros, arcabucero e ingeniero, da exactamente 3 avisos, uno por arte:<br>`warning: imperio-ballestero dispara y su arte (la unidad imperio-ballestero) no tiene clip shoot: se pinta con attack` (y lo mismo para arcabucero y heroe-imperio-ingeniero).<br>El ballestero pinta la fila 3 (attack) de su atlas de 6 filas. No hay errores. |
| 7 | Lo pintado en 8 direcciones sigue cargando y animando | ✅ | `pnpm verify` re-deriva todas las direcciones pintadas y sale verde. La arena pinta templario-escudo y los tiradores del Imperio sin errores. `pnpm capturas` está limpio (abajo). |
| 8 | Guardias movidos a `shoot`, vistos en rojo, verify verde | ✅ | `pnpm verify` → `Test Files 49 passed (49) · Tests 1478 passed (1478)`, exit 0, en 39 s. El fallo que el ingeniero tenía en la vuelta de /simplify («imperio-granadero trae el disparo en 1 de sus 8 direcciones») ya no aparece, porque ahora están las 8 C. Los guardias en rojo los ha visto el ingeniero (dos tablas en `implementacion.md`); no los he repetido. |
| 9 | La arena puede mostrar `shoot` | ✅ con reserva | El botón «Disparo» aparece solo en quien trae `shoot`. Pero la ficha no reproduce el clip: enseña su último fotograma, congelado (ver H1). |
| — | `src/core`, `src/server`, `data`, `CLAUDE.md` intactos | ✅ | `git status --short src/core src/server data CLAUDE.md` sale vacío. `pnpm banco` dice «ancla: igual — las 200 partidas se juegan hexágono a hexágono igual», 0/200 sin terminar. |
| — | `pnpm capturas` | ✅ | `sin errores en consola; … 209.1 s`, EXIT 0. El espectador vio «8 final(es) de batalla vistos, 107 turnos de batalla». La arena tiene montaje, ficha girada, pelea a mano y pelea todo en IA. Al final dice «borrador retirado: no había ninguno», y `data/` queda limpio. |

## Hallazgos

### Importantes

Ninguno.

### Menores

**H1. En la ficha de la arena, «Disparo» (igual que «Ataque» y «Daño») enseña un fotograma fijo, no la animación.**

- Pasos: en `/arena/`, añade `imperio-granadero`, abre su ficha y pulsa «Disparo». Capturas a los 150, 500 y 800 ms: `ImageChops.difference` da `None` entre ellas.
- Causa: `dibujarFiguras` pasa `tiempo: ahora`, y `relojDeFigura` devuelve el tiempo sin tocar en los clips que no van en bucle. `clipFrame` se queda en `frames - 1`.
- Efecto: en el granadero, el último fotograma del disparo es la recuperación y la granada no se ve. Quien quiera revisar el disparo nuevo en la arena no lo ve lanzar.
- No es una regresión: `attack` y `hurt` ya se comportaban así antes. Pero el criterio 9 («puede mostrar el clip shoot») solo se cumple a medias.
- Lo que esperaría quien mira: que el clip se reprodujera desde el clic.

**H2. Arte (no es código de esta tarea): el reposo de `imperio-granadero/d2` tiene 1 fotograma.**

`atlas.json` → `idle: 1`; las otras 7 direcciones tienen 7. El derivado recortó fotogramas repetidos, así que la hoja A pintada en esa dirección no respira. Va para el coordinador, por si quiere repintar la `-d2-a`.

**H3. Lo ya anotado por el ingeniero, que confirmo y no repito:**

- el CLI `derivar` ahora lanza con un atlas de 6 filas de un tirador;
- `escalaDePose` no tiene test.

## Workarounds usados

- **Espiar `CanvasRenderingContext2D.drawImage`** (con `addInitScript`) para saber qué fila del atlas se pinta. Solo observa, no cambia nada de lo que ve quien juega. No sirve para el Y Bot, que se pinta desde un lienzo teñido. Ahí me apoyé en qué hojas pide (`dN-c.png`) y en `anim.test.ts`.
- **Todos los puestos en «IA»** para que la pelea se juegue sola. Es una opción normal de la arena, no un estado sintético.
- **`executablePath` al Chromium 1234 instalado**, porque el Playwright del repo pedía el 1243, que no está. `capturas` hace lo mismo (`chromiumInstalado`). No afecta a quien juega.

## No probado

- **Batalla del juego** (`pnpm dev` en `/`) con un tirador del juego disparando y luego adyacente, mirado por mí:
  - Las facciones del juego (caballeros y nigromantes) solo tienen tiradores Y Bot (arco y liche); ni el granadero ni el resto del Imperio salen en partida.
  - Lo cubren las batallas de `pnpm capturas`, sin errores de consola, y lo que el ingeniero vio a mano (`?seed=43045` y `?seed=14886`). No lo he repetido a mano.
- **El fotograma exacto en que sale el proyectil en el navegador**: solo hay test, y un proyectil visto en vuelo.
- **`encolar --ocho` contra la cola real**: prohibido; lo cubren los tests de encargos.
- **`pnpm qa`**: no se toca ni `src/server` ni el contrato.

## Veredicto

**Apto con reservas.** Los criterios 1-8 se cumplen en el flujo real:

- el granadero ataca con el sable (fila 3) y lanza con la fila 6;
- el arte viejo cae a `attack` con un aviso por arte;
- verify, banco y capturas están en verde.

La reserva es H1: el botón «Disparo» de la arena existe, pero enseña un fotograma fijo y no la animación. No bloquea, porque es la misma conducta que ya tenían «Ataque» y «Daño».

## Después de QA (coordinador, 04-10-2026)

- **H1 corregido.** La ficha de la arena repite los clips que no van en bucle
  (ataque, disparo, daño, muerte) desde que se pulsa su botón, con una pausa de
  700 ms al final (`repeticion` en `src/client/arena/main.ts`).
  - Comprobado con Playwright y su Chromium, sobre un vite propio que se mató
    por su grupo y dejó el puerto libre: con el granadero y «Disparo», 4 capturas
    distintas de 6 cada 180 ms y 0 errores.
  - `pnpm verify` 1478/1478 y `pnpm capturas` exit 0, sin errores en consola.
- **H2 encolado.** Se repinta la hoja A de `imperio-granadero/d2`.
- **Arte de los otros 5 tiradores**: hojas B y C, 80 encargos, en marcha.
  Mientras salgan, un tirador puede quedar con disparo en unas direcciones sí y
  en otras no. El guardia «en las ocho o en ninguna» pone `verify` y la arena en
  rojo hasta que la unidad acabe. Es lo esperado.
