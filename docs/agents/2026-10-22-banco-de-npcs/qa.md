# Banco de figuras de NPC — QA (22-10-2026)

Rama `claude/affectionate-chaplygin-911d42`, HEAD `d0570aa5` (commits desde `7822ecfd`), con el arte de la
semilla que pinta el trabajador (grupo 738121) sin commitear. No se tocó código, `assets/npcs/` ni
`tools/taller/cola/`; no se gastó Codex.

Navegador: Playwright sin pantalla contra un vite propio en el 3163 (grupo 857187, parado por su grupo y
comprobado libre con `ss`). Capturas en el scratchpad de la sesión
(`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-affectionate-chaplygin-911d42/898c6c50-a30a-4a11-b7f3-be7621a5ce18/scratchpad/`).

## Criterios

| # | Criterio (requisitos.md) | | Evidencia |
|---|---|---|---|
| 1 | El banco existe y se commitea (carpeta + JSON con id, descripción, etiquetas, acciones) | ✅ | `data/npcs.json`: 15 figuras con etiquetas del vocabulario, `talla`, `acciones`, `pedidaPor: semilla`. `assets/npcs/elfa-curandera/` commiteada; otras 4 carpetas sin commitear (las pinta el trabajador). |
| 1 bis | El taller pinta desde datos, fuera de la arena, solo hoja A, que no llega a una batalla | ✅ | Encargos `npc-*` con `pose-profundidad` del maniquí civil y `celda 384`; tests `taller-npcs`, `npcs` («la arena no lista ninguno», `arteDe` lanza con `npc:`); guardia de `invariantes.test.ts`. |
| 2 | Validado al cargar, fail-loud; «pedida» ≠ «rota» | ✅ | `/__npcs` interceptado con un oficio `pirata` y un id repetido → «La página no arranca … el banco de figuras de NPC no vale (2 problemas): … el oficio "pirata" no existe; valen … / figuras[15].id: "templario-anciano-alcaide" ya es la figura 0». Pedidas sin pintar: `/__npcs` las sirve con `incompleta: «… está pedida y sin pintar»` y la página arranca. Ver H3 (sin banco, un mundo no arranca). |
| 3 | La gente de la base con figura del banco; determinista; sin ninguna, Y Bot civil | ✅ | `?seed=7&faccion=<f>&heroe=<tipo>` en las cinco: elfos piden `/npcs/elfa-curandera/d0/atlas.webp` y ninguna hoja del Y Bot civil; templarios, no muertos, imperio y orkos (0 pintadas) piden `/unidades/_poses/civil-8d/d0-a.png`. Consola sin errores ni avisos en las cinco. Determinismo y reparto: `figuras-de-la-gente.test.ts`. Ver H4 (dos iguales a la vista). |
| 4 | La gente de los lugares con figura del banco | ✅ | `?mundo=prueba`, marcha al rombo «P» (clics reales), «El puente del viejo Corvo», «Hablar» con Corvo: se pinta con `imperio-armero` (pide `/npcs/imperio-armero/d0` y `d6/atlas.webp`), mirando al héroe. Captura `prueba-corvo.png`, `corvo-zoom.png`. Consola limpia. |
| 5 | El motor reutiliza o pide; encola quien valida | ✅ (en tests) / ⚠️ en vivo | La skill tiene «La gente y sus figuras», `figura`, `figuras`, `base`, el tope 4 y la talla. `aceptarElMundo` probado en raíz temporal (`npcs.test.ts`). El motor real desde el menú no se ejerció (gastaría Claude y Codex). |
| 6 | Se juega ya y llegan después | ⚠️ con reservas | Llegan: imperio pasó de Y Bot a `imperio-armero` en la base y en el lugar al recargar, cuando el trabajador la terminó durante esta QA. La página abierta 4 min mientras el trabajador escribía `giro`, `d0`, `d1` del burgomaestre no se recargó (`framenavigated` igual). **Pero una figura que falla en una hoja se queda a medias para siempre sin persona** (H1, H2). |
| 6 bis | Se encadena sola (identidad → giro → hojas, sin revisión) | ⚠️ | Encadena: log de `goblin-chatarrero` (identidad → giro → 8 hojas encoladas solas). Un fallo corta la cadena de esa figura y nada la reintenta (H1). |
| 7 | Las hojas de NPC no son tropas | ✅ | Tests (`arteDe('npc:…')` lanza, la arena no las lista, ningún id es unidad ni hoja); guardia de `invariantes.test.ts` (visto morder por el ingeniero). |
| 8 | Documentado (CLAUDE.md, skill) | ✅ con una errata | Tres filas en puertas únicas, «Arrancar», mapa del repo, skill. Errata: CLAUDE.md pone `derivacionDeLaCarpeta` en `tools/taller/npcs.ts` y vive en `tools/taller/juntar.ts` (H5). |
| 9 | `pnpm verify` verde; `pnpm qa`; el navegador | ✅ | `pnpm verify`: `Test Files 165 passed \| 1 skipped (166) · Tests 3981 passed \| 12 skipped`, salida 0, 93 s. `pnpm qa`: terminado por fin de partida, salida 0 (corrido porque `Persona` de `town_voices` cambió). `pnpm verify:lento` con la máquina a carga 1,5 al arrancar: `Test Files 166 passed (166) · Tests 5733 passed (5733)`; sale 1 solo por `Timeout calling "onTaskUpdate"` (la carga subió a ~14 durante); `rectitud` y `regiones`, que el ingeniero vio caer por tiempo, pasan (rectitud 67 s). No se repitió. |
| 10 | Al menos una figura de verdad por el circuito entero | ✅ por la semilla / ⚠️ por el motor | 5 figuras pintadas sin persona (`elfa-curandera`, `elfo-consejero-anciano`, `elfo-tallador`, `imperio-armero` y, en curso, `imperio-burgomaestre-anciano`), entradas por `pnpm npcs pedir` = `aceptarPeticiones`, la misma que el motor; se ven en la base y en un lugar. «El motor la pide» no se vio en vivo (dicho por el ingeniero). |

## Hallazgos

### H1 — importante: una figura pequeña falla en el validador y se queda a medias para siempre

`npc-goblin-chatarrero-d6-a` está en `fallido` con «la imagen está casi vacía tras el recorte». **El crudo de
Codex es bueno** (`~/.codex/generated_images/01a16506-…/exec-5370541d-….png`: 21 goblins correctos, mismo alfa
que los que pasaron). La causa es el umbral: `validar.ts:67` exige un 2 % de píxeles visibles sobre la hoja
entera, y la figura se empaqueta a `alturaAdulto × talla`, así que lo visible escala con talla². Medido sobre
las hojas A en disco (alfa > 0): talla 1 → 3,6-5,4 %; el goblin a 0,7 → **2,12-2,34 %** en las siete que pasaron.
d6 (perfil, la silueta más estrecha) cayó por debajo. Consecuencias:

- Todo goblin a 0,7 (la talla que la skill y `ETIQUETAS.especie.goblin` dictan al motor) está al filo: falla al azar.
- Toda figura de talla ≲ 0,68 falla siempre (0,5, el mínimo que admite el formato, daría ~1,1 %): nunca se completa.

Reproducir: `pnpm npcs estado` → `goblin-chatarrero … a-medias (… le faltan d6) · cola: hecho 9, fallido 1`.
Lo que esperaba quien juega: que el goblin chatarrero, pedido para la base orka, llegue.

### H2 — importante: nada reintenta lo fallido y el estado dice que se está pintando

Con una hoja en `fallido`, la cadena de esa figura acaba: el trabajador sigue con las demás y ningún paso
repesca (solo `pnpm npcs encolar <id>` a mano, que encola de nuevo la hoja y exige además un trabajador vivo).
Un mundo nuevo del motor tampoco la repesca (`lanzarElTaller` solo se lanza si ese mundo pidió figuras, y no
repesca). Así que la figura queda `a-medias` indefinidamente: el juego sigue (la gente usa la parecida o el
Y Bot, sin errores: «se juega ya» se cumple), pero «llegan después» y «se encadena sola» no, para esa figura.
Además el motivo que enseñan `pnpm npcs estado`, `/__npcs` y el aviso de `vite build` es **«tiene 7 de sus 8
direcciones (le faltan d6): el taller la está pintando»**, falso cuando no hay nada en `pendiente/` ni
`en-curso/`; quien lo lee no sabe que tiene que intervenir. Esperado: o un reintento automático acotado (p. ej.
uno), o que el estado diga «falló d6: `pnpm npcs encolar goblin-chatarrero`». Ojo: mientras siga H1,
`pnpm taller reprocesar` sobre este crudo volvería a fallar (mismo crudo, mismo umbral), y repetir la hoja con
Codex puede volver a caer.

### H3 — menor: sin `/__npcs`, un mundo no arranca y culpa al mundo

`?mundo=prueba` con `/__npcs` respondiendo 500: «La página no arranca … el mundo "prueba" no se puede jugar (3
problemas): … "imperio-armero" no es una figura del banco de NPC (`npcs.figuras` de la lectura) ni una de las que
pides en «figuras»». Sin mundo, el mismo fallo da partida con el Y Bot y un aviso. La frase es la del motor
(«de la lectura», «las que pides»), no para la persona, y contradice el aviso de consola de la línea anterior
(«la gente sale con el Y Bot»). Solo pasa si el endpoint falla (en dev es raro; en el build va emitido).

### H4 — menor: dos personas idénticas una al lado de otra

Base élfica (`?seed=7&faccion=elfos&heroe=guerrero`): las dos encargadas visibles (Ilyana, consejera, y Elowen,
guía; las dos mujeres) son la misma curandera, a 180 px una de otra (`base-elfos.png`), con tres élficas
pintadas. Es la regla escrita (especie > sexo > sin usar), y con una sola mujer élfica no hay otra; en la base
imperial de `prueba` pasa lo mismo con el armero (una sola pintada). Se leerá mejor cuando haya más figuras;
lo anoto porque es lo primero que ve quien juega. No pide cambio en este ciclo.

### H5 — menor: errata en CLAUDE.md

La fila «Pedir figuras» dice `derivacionDeLaCarpeta` (`tools/taller/npcs.ts`); vive en `tools/taller/juntar.ts`
(desviación A.3 del simplify).

## Workarounds usados

- `/__npcs` interceptado con `page.route` para el banco roto y el sin banco: no toca disco ni lo que ve quien
  juega; simula un fichero roto a mano. Válido.
- Ninguno para la base ni el lugar: URL de partida o de mundo, clics reales en «Volver al mapa», el rombo del
  lugar (dos clics), «Corvo». (Corvo no se ve al entrar en el lugar, fuera del encuadre hasta pulsarlo: es la
  escena de la F1a, no de este ciclo.)

## No probado

- **El circuito desde «Generar el mundo»** (motor real → `aceptarElMundo` → `lanzarElTaller`): gastaría Claude y
  Codex y `lanzarElTaller` arranca el trabajador real en la raíz del repo (no hay raíz temporal posible sin
  tocar el código). Cubierto solo por `aceptarElMundo` en raíz temporal. Nota al margen: `lanzarElTaller` solo
  sabe del trabajador que lanzó su servidor; con el de la semilla vivo arrancaría un segundo (la cola lo
  aguanta, `rename` atómico; serían dos a Codex a la vez).
- **El alcaide andando con figura** (héroe fuera de la base): al pulsar el castillo desde el mapa el héroe vuelve
  y entra; no encontré un clic que abra la base con el héroe fuera. Cubierto por tests de tipos y
  `arteParaPintar('walk')`.
- `vite build` y `pnpm capturas`: no repetidos; el ingeniero dejó el build verde tras el simplify sobre el mismo
  código (solo cambia el arte sin commitear).
- La calidad del resto de la semilla (decisión del usuario: sin revisión). Las cinco pintadas que vi, bien.

## Veredicto

**Apto con reservas.** El banco, su validación, el reparto determinista, el lugar con figura del banco y la
cadena automática funcionan en el flujo real, sin errores en consola y con `verify` y `qa` en verde. Las
reservas: H1 y H2 juntas hacen que una figura pequeña (los goblins, por la talla que la skill dicta) pueda
quedarse a medias para siempre sin aviso ni reintento, contra «se encadena sola» y «llegan después»; y el
circuito desde el motor no se ha visto en vivo.

## Vuelta 2 (22-10-2026, sobre `3d27a295`)

Solo lo que tocó el arreglo (H1, H2, H3, H5) y una pasada adversarial sobre su diff. El trabajador viejo (grupo
738121) siguió vivo y sin tocar; no se tocó `assets/npcs/` ni `tools/taller/cola/` (las pruebas de cola, en
raíces temporales del scratchpad, `v2/adv.mts`); no se gastó Codex. Navegador: Playwright sin pantalla contra un
vite propio en el 3191 (grupo 924537, parado por su grupo y `ss` sin nada en el 3191).

| Criterio | | Evidencia |
|---|---|---|
| H1: el umbral de «casi vacía» va con la talla | ✅ | `visibleMinimo = 2 % × talla²`; `validarElEncargo` saca la talla del encargo (solo la llevan las hojas: identidad y giro van sin ella, a 2 %, que es lo correcto porque no se empaquetan a la talla). Procedencias del goblin (0,7, mínimo 0,98 %): d0-d7 = 2,29 / 2,14 / 2,12 / 2,34 / 2,21 / 2,31 / **1,97** / 2,31 %: d6, rescatada desde su crudo, pasa con holgura doble. `pnpm npcs estado`: `goblin-chatarrero orkos pintada · cola: hecho 10`. |
| H2: reintento acotado | ✅ | Bucle del trabajador simulado en raíz temporal (tomar → cerrar fallido → `reintentarSiQueda`, hasta 20 vueltas): **3 intentos** y queda en `fallido/`; la cuenta va en la ficha (`cerrar` conserva `fallos`, `tomar` no reescribe). |
| H2: rescate al arrancar | ✅ | `rescatar` tras agotar → `agotados: [identidad]`, nada encolado; con algo suyo vivo → nada; sin cola → lo que falta. |
| H2: el estado dice la verdad | ✅ con una excepción (H6) | Agotado: «vecina-de-prueba está pedida y sin pintar: se quedó a medias: falló npc-vecina-de-prueba-identidad (fallo 3); agotó sus 2 reintentos: se reintenta con \`pnpm npcs encolar vecina-de-prueba\`». En el repo, `pnpm npcs estado` y `/__npcs` dicen «el taller la está pintando» solo de figuras con algo en `pendiente/`/`en-curso/` (las 6 que pinta el 738121). Pero un en-curso huérfano también lo dice (H6). |
| H2: `reprocesar` no pasa por pendiente | ✅ | `Cola.retomar`: de `fallido/` a `en-curso/` con un `rename`; leído y probado en raíz temporal. Ver H8 (pierde la cuenta). |
| H3: sin banco, un mundo culpa al banco | ✅ | `?mundo=prueba` con `/__npcs` a 500: «La página no arranca … el mundo "prueba" no se puede jugar: no se pudo cargar el banco de figuras de NPC (/__npcs responde 500 y no es JSON), y las personas del mundo llevan figuras de ese banco. Sin «?mundo=» la partida se juega, con la gente en el Y Bot»; el aviso de consola dice lo mismo («…y un mundo (?mundo=) no se puede jugar sin él»). `?seed=7&faccion=imperio&heroe=duelista` con el mismo 500: Día 1, la gente con `civil-8d/d0-a.png`. |
| H5: CLAUDE.md | ✅ | La fila «Pedir figuras» pone `derivacionDeLaCarpeta` en `tools/taller/juntar.ts`. |
| Base de imperio (3 pintadas) | ✅ | `?seed=7&faccion=imperio&heroe=duelista` y `?seed=3&…&heroe=mago`: piden `/npcs/imperio-armero/d0` y `/npcs/imperio-posadera/d0/atlas.webp` y ninguna hoja del Y Bot civil; en pantalla, el armero y la posadera, dos figuras distintas, a la escala del héroe (`v2/imperio.png`). Consola limpia. |
| Base de orkos (1 pintada) | ✅ (H4 a la vista) | `?seed=7&faccion=orkos&heroe=orko` y `?seed=3&…&heroe=goblin`: piden solo `/npcs/goblin-chatarrero/d0/atlas.webp`; las dos encargadas visibles son el mismo goblin (`v2/orkos.png`; una es «Muzgash, capataz del pueblo»). Es H4, aceptado: con una sola figura orka, toda la gente orka es «la parecida», también la de especie orko. Consola limpia. |
| `pnpm verify` | ✅ | `Test Files 166 passed \| 1 skipped (167) · Tests 3992 passed \| 12 skipped (4004)`, salida 0, 84 s. Antes, `taller-validar`, `taller-npcs` y `mundo`: 63 de 63. `verify:lento` no se repitió. |

### Hallazgos de la vuelta 2

**H6 — importante: un encargo huérfano en `en-curso/` deja la figura a medias para siempre, diciendo que se pinta.**
Si el trabajador muere a mitad de un encargo (Ctrl-C de `pnpm npcs trabajar`, un reinicio, alguien que para su
grupo), el encargo se queda en `en-curso/`. Entonces: `estadoDeFigura`, `/__npcs` y el aviso de `vite build` dicen
«el taller la está pintando»; `rescatar` lo cuenta como vivo y no hace nada; `pnpm npcs encolar <id>` dice «nada que
encolar» (lo vivo no se repesca); y ningún trabajador nuevo lo toma (`tomar` solo mira `pendiente/`). Solo lo saca
`pnpm taller devolver <id>`, que ninguna frase nombra. Es H2 por otro camino, y hoy el 738121 tiene
`npc-necropolis-escribana-espectral-d0-a` en curso: si ese proceso se para antes de cerrarlo, la escribana se queda
sin d0. Reproducir (raíz temporal, `v2/adv.mts`, caso A): `encolarLoQueSigue` → `tomar` (sin trabajador) →
`estado: pendiente, «…el taller la está pintando»`, `rescatar → {encolados: [], agotados: []}`,
`encolar(repescar) → []`, otro `tomar → null`. El ingeniero lo dejó dicho en «Qué no queda cubierto»; lo subo a
hallazgo porque quien lo lee no sabe que tiene que intervenir ni cómo. Esperado: que el rescate distinga lo huérfano
(p. ej. el pid del trabajador en la ficha al tomarla, y vivo si ese pid vive) o, como mínimo, que la frase diga
«si no hay ningún trabajador vivo, \`pnpm taller devolver <id>\`».

**H7 — menor: dos `pnpm npcs trabajar` a la vez; el segundo sale con traza.** `rescatar` mira la cola y luego
encola: con dos a la vez (p. ej. `lanzarElTaller` de `pnpm dev` y uno a mano, que aquel no ve), el segundo rechaza
con `ENOENT … rename '.npc-<id>.json' -> 'pendiente/npc-<id>.json'` (el temporal de `encolar` tiene un nombre fijo)
o «ya está en pendiente/», y ese proceso acaba sin lanzar su trabajador (`v2/adv.mts`, caso B:
`Promise.allSettled([rescatar, rescatar])` → uno rechazado, otro encola). Inofensivo (el otro pinta), pero sale
con un error que parece fallo. Lo mismo si `reintentarSiQueda` encuentra el fichero movido: lanza dentro del
`catch` del bucle y el trabajador se cae con la cola a medias (no lo reproduje: el orden de la prueba no lo dio).

**H8 — menor: `reprocesar` borra la cuenta de reintentos.** `Cola.retomar` reescribe la ficha solo con el encargo:
un agotado (2 fallos) que se reprocesa y vuelve a fallar queda con `fallos` 0, y el siguiente `pnpm npcs trabajar` lo
reintenta dos veces más con Codex sin que nadie lo pida (caso E: «fallos antes de retomar 2 / tras retomar+cerrar 0 /
rescatar → encolados [identidad]»). Con `devolver` desde `fallido/` es a propósito (lo pide una persona); con
`reprocesar`, que no pide imagen, no parece serlo. Conservar `fallos` en `retomar` bastaría.

Menor de redacción: una figura sin ninguna dirección y con un fallo dice «está pedida y sin pintar: se quedó a
medias: falló …»; «sin pintar» y «a medias» se contradicen al leerlo.

### Workarounds

`/__npcs` interceptado a 500 con `page.route` (como en la vuelta 1): simula un endpoint caído; válido. Las pruebas
de cola en raíces temporales con la cola real del taller (`colaDelTaller`), no un doble.

### No probado

- El reintento dentro del bucle real del trabajador con un fallo de Codex de verdad (pediría cuota); el bucle se
  simuló con las mismas piezas (`tomar`, `cerrar`, `reintentarSiQueda`) y su cableado se leyó.
- `vite build` con la frase nueva: no repetido (el ingeniero lo dejó verde con ella sobre el mismo commit).

### Veredicto (vuelta 2)

**Apto con reservas.** H1, H3 y H5 quedan corregidos; H2 también para lo que pedía (lo fallido se reintenta con
tope, el rescate lo recoge y la frase distingue fallo de pintando), con `verify` verde y las bases de imperio y orkos
pintando sus figuras sin errores. La reserva es H6: un encargo huérfano en `en-curso/` reproduce el síntoma de H2 (a
medias para siempre, «el taller la está pintando») y no hay frase que diga cómo salir; H7 y H8 son menores.
