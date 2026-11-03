# Informe — fuera los tests de jugabilidad y los que fijan cifras del catálogo

Rama `claude/troop-battle-ordering-b96a77` sobre `a07d8945`. Sin commitear. Solo se toca `test/`, más
los comentarios que citaban un test borrado (CLAUDE.md, `src/core/ai/fuerza.ts`,
`tools/arena/velocidades.ts` y el `_comment` de `data/poder.json` y `data/asaltantes.json`: ninguna
cifra cambia).

## Resumen

- **368 tests fuera** (4 072 → 3 704 en el bucle rápido; los ficheros de test, de 176 a 175: se va
  `test/ia-fuerza.test.ts` entero) y **3 recortados** a lo que no depende del catálogo (los mundos:
  abajo). 47 por **jugabilidad** a la lectura (motivo 1), 297 por **depender de una cifra del
  catálogo** (motivo 2, todos delatados por una perturbación o rojos ya en HEAD por el catálogo
  retocado) y 27 por las dos cosas.
- Ninguna de las **23 perturbaciones válidas** de los datos pone hoy nada rojo (cuarta vuelta: 0).
- `pnpm typecheck` y `pnpm lint` en verde. La suite por tandas sobre el árbol real: 3 690 verdes,
  12 saltados (orden lenta) y **2 rojos que ya lo estaban en HEAD y no son del catálogo**
  (`base-escala` «el 860…» y `session` «elige su respuesta sin ver el golpe»), dichos abajo.

## Cómo se decidió

**Motivo 1 (jugabilidad), a la lectura.** Lo que asierta lo que decide o consigue la IA (qué
compra, a quién pega, si carga, si lanza, si se rinde, si licencia, si escala o abre la puerta, si
vuelve a casa), quién gana y en cuántos días, la calibración de la fuerza (`ia-fuerza`), el reparto
de velocidades del catálogo y las frecuencias del sorteo de la rueda. **Se quedan** los de la IA que
prueban una regla y no una decisión: que lo que elige sea legal, que una batalla o una partida
termine y sea determinista, que no se rinda por la persona, que su sustituta en el contrato del
agente sea la que se dice, que su memoria se lea de la crónica, que la IA de la arena juegue con la
regla del contacto.

**Motivo 2 (cifra del catálogo), por experimento.** En otros tres worktrees desechables
(`node_modules` enlazado) se aplicaron perturbaciones de `data/` que el cargador acepta
(comprobado con un `newGame` de cuatro semillas y la carga de todos los módulos que leen datos), y se
corrió la suite entera por tandas de 25 ficheros con `--maxWorkers=4`, más en orden lenta
(`HEROES_LENTO=1`) los tres ficheros de lento que no son mapa ni arte (`prevision`, `invariantes`,
`asaltantes`). Todo lo que se ponía rojo con una perturbación y no sin ella se borró. Un control
(P0: reescribir los JSON sin cambiar nada) dio 0: el formato no influye. Ningún rojo era un timeout
salvo uno (R6), que era la IA rival que ya no llegaba a atacar: también del catálogo.

| Perturbación | Qué cambia (válido para el cargador) | Rojos nuevos (vuelta en que se borraron) |
|---|---|---|
| P1 | unidades: fuerza ×2, PV ×2, ataque +2; héroe: PV y fuerza base ×2 | 43 (1.ª) |
| P2 | unidades: fuerza ×½, PV ×½, ataque −1; héroe: PV ×½, fuerza 3 | 66 (1.ª) |
| P3 | agilidad ±1 alternando, en 2..7; héroe 5 | 66 (1.ª) |
| P4 | precios de las piezas ×3 (0 → 50); economía (divisor, crecimiento, renta, moradas, oro de salida, precio del héroe); edificios coste ×2 y renta +250 | 2 (1.ª) |
| P5 | otro nombre a toda unidad y toda pieza | 72 (1.ª) |
| P6 | piezas: ataque +1, fuerza +1, armadura +1, defensa del escudo +1, peso +1, rueda ±1, montura fuerza +2 y agilidad −1, recarga +1, cargas +1 | 150 (1.ª) |
| P7 | asaltantes: `fuerzaMax` ×2, liderazgo +6, pasos 3, probabilidad 0,7, grupos −1; guarniciones −1; liderazgo de héroe y guarnición | 17 (1.ª) |
| P8 | experiencia, poder, carga, tablas de la rueda, cura, hechizos ×2, granada, defensa en lo alto, héroe por rango y rendición | 126 (1.ª) |
| P9 | liderazgo −1 en una de cada dos unidades; héroe 22/55 | 12 (1.ª) |
| Q1 | fuerza +1, PV +5, ataque +1 en todas | 1 (2.ª) |
| Q2 | agilidad ±1 en la otra alternancia | 5 (2.ª) |
| Q3 | piezas hacia el otro lado (ataque −1, fuerza +2, armadura y defensa −1, peso −1, rueda ∓1) | 2 (2.ª) |
| Q4 | otro nombre a edificios, hechizos, tipos de héroe y el poder Curar | 15 (2.ª) |
| Q5 | economía hacia el otro lado y precios ×½ | 0 |
| Q6 | ataque −1, PV ×1,5 y otros pesos de la IA en la rueda | 1 (2.ª) |
| Q7 | asaltantes: pasos 1, probabilidad 0,3; guarniciones neutrales en otro orden | 0 |
| Q8 | experiencia, poder, carga, liderazgo máximo, héroe, cura y granada hacia el otro lado | 1 (2.ª) |
| R1 | solo los PV ×2 | 0 |
| R2 | los extras de las piezas con base (+1 ataque, oro ×2, rueda a 0) | 0 |
| R3 | hechizos (cantidad ±1, poder +10, coste +2) y cura 30 | 0 |
| R4 | composiciones de asaltantes al revés y −2; guarnición de las bases −1 | 1 (3.ª) |
| R5 | liderazgo +1 en una de cada tres unidades; guarnición 30, héroe 24 | 2 (3.ª) |
| R6 | peso de toda pieza ×2 | 1 (3.ª) |

(Las que tocan fuerza, agilidad, PV, piezas o liderazgo —P1, P2, P3, P6, P9, Q1, Q2, Q3, Q6, Q8, R1, R2, R5 y R6— suben además `fuerzaMax` a 3 000: el cargador valida cada grupo de asaltantes contra ese
techo, así que editar el catálogo de verdad obliga a subirlo, como pasó en `a07d8945`.) Las cuentas
de la 1.ª vuelta se solapan: la unión fue 286. Vueltas: 1.ª, P1-P9 sobre HEAD (286 rojos nuevos);
2.ª, P1-P9 y Q1-Q8 sobre lo borrado (P1-P9 a 0, Q 26); 3.ª, Q1-Q8, R1-R6 y P5 (4); 4.ª, BASE, R4,
R5, R6, P1 y Q2: **0**. El guion de las perturbaciones queda en
`docs/agents/2026-11-03-tests-sin-jugabilidad/perturbar.py` (`python3 perturbar.py <repo> <P>`).

Los nombres cuentan como dato del catálogo (lo dice la petición: «el nombre de una unidad»), así que
P5 y Q4 se llevan también validaciones y paneles cuyo motivo esperado lleva escrito «Espada»,
«Curar» o «Prisa». No se reescribieron con el nombre derivado (sería reescribir, salvo trivial); la
regla que cubrían está en «Reglas que se quedan sin test».

## Lo que no es borrar

- `test/mundo.test.ts`: «el mundo de prueba (a mano) y el de ejemplo (del motor) no tienen
  problemas» y ««prueba» y «ejemplo» valen con su biblia» estaban **rojos en HEAD** porque `ejemplo`
  lleva dos grupos de asaltantes de 356 de fuerza y el techo bajó a 310 con el catálogo retocado. Se
  quita la línea de `ejemplo` (trivial) y se quedan con `prueba`, que es del test y ninguna
  perturbación movió. Renombrados: «el mundo de prueba (a mano) no tiene problemas» y ««prueba» vale
  con su biblia, como la ve «pnpm mundo validar»». **`assets/mundos/ejemplo` sigue sin valer** con el
  catálogo de hoy (fuera de alcance: son datos).
- `test/motor-de-mundos.test.ts`: ««pnpm mundo medir» mide «ejemplo» sin lanzar» (rojo en HEAD por
  lo mismo) mide ahora `prueba`.
- `test/paneles.test.ts`: fuera el ancla byte a byte (motivo 2) y, en «las cifras grandes se leen con
  separador de miles», la línea que buscaba la experiencia del héroe (29 700 / 51 300) en el ancla;
  `conMiles` sigue probado. La cabecera del fichero lo dice. `test/fixtures/paneles.txt` y
  `test/escenas-paneles.ts` se quedan: los usa `tools/qa/ancla-paneles.ts` (herramienta, fuera de
  alcance), pero ya ningún test los mira.
- `test/ia-bucles.test.ts`: la cabecera, a lo que queda (la memoria leída de la crónica).
- Ayudas que se quedaron sin uso, fuera: de `test/helpers.ts`, `grupoQueMarcha`,
  `primeraMarchaQueSePara` y `casillaADosPasos` (`primerCruce` deja de exportarse: solo la usa el
  propio fichero); de `test/batalla-de-cliente.ts`, `rutaConEmboscada` y `sesionContraMonstruoCon`;
  y unas sesenta ayudas y constantes locales de los ficheros tocados (las caza `noUnusedLocals`). En
  `test/helpers.ts` y `test/hojas-de-estilo.ts` siguen cinco exportaciones sin uso de fuera
  (`Monstruo`, `grafoDeCaminos`, `PuestoDeLaPelea`, `fichasDe`, `BloqueCss`) que **ya estaban así en
  HEAD**: no son de esta tarea.

## CLAUDE.md y comentarios

- `CLAUDE.md` (la escala del nivel): «Las 34 del catálogo van del nivel 1 al 4 (`TABLA_DEL_CATALOGO`;
  … `test/nivel.test.ts`)» → «… ningún test lo fija: lo lista `tools/qa/cifras-del-catalogo.ts`».
- `data/poder.json` (`_comment`, sin tocar cifras): «lo ancla TABLA_DEL_CATALOGO en
  test/nivel.test.ts» → «no lo fija ningún test (03-11-2026…); lo lista npx tsx
  tools/qa/cifras-del-catalogo.ts», y fuera «y las tablas de test/nivel.test.ts».
- `data/asaltantes.json` (`_comment`): la medida de 842 a 383 «lo medía un test de
  test/asaltantes.test.ts, retirado el 03-11-2026».
- `src/core/ai/fuerza.ts` (`PESO_DEL_CUERPO`): «`test/ia-fuerza.test.ts` lo clava» → lo medía, se
  retiró; la medida es `tools/qa/calibrar-fuerza.ts`.
- `tools/arena/velocidades.ts` (dos comentarios): el test de `arena.test.ts` que daba al hermano de
  carga por único jinete, retirado.
- `docs/historia.md` y los `docs/agents/*` que citan `TABLA_DEL_CATALOGO` se dejan: son historia.

## Reglas que se quedan sin test

Sin ningún test (todo su `describe` fuera):

- **La marcha del grupo** (`marchaDe`, `slowestSpeed`): el más lento con el héroe incluido, el caballo
  de silla que solo sube la marcha si lo llevan todos, Logística +10 %.
- **La marcha que se para al ver un grupo que la emboscaría** (#130, `vigiaDeLaMarcha`,
  `march_halted`) y su revisión cuando la marcha gana fuerza (H1/H2); también su lado en la sesión y
  la ruta que avisa en `asaltantes` (en `escenas` queda uno de dos).
- **El id de un héroe contratado no se repite** (#126).
- **La carga montada** (fuerza de la montura + lanza, `cargaMontada`) y «el juego carga como la
  arena»; de «carga todo el que pega cuerpo a cuerpo» queda 1 de 7 y de «la montura, aparte del
  jinete», 1 de 5.
- **Los efectos de la rueda**: Defensivo hasta que empiece su turno y Romper guardia por éxito
  (#263), **la Finta deja andar después de golpear** (#263), y el parte que cuenta el cruce.
- **Los modificadores de los dos en la cabecera de la rueda** (31-10-2026) y el R3 de R. guardia.
- **Un arma a dos manos sobre un escudo de serie** (H4) y la fila de un equipado en el panel (M5).
- **«A distancia» con el puntero**: el motivo de la granada fuera de alcance y del arco.
- **Los poderes de la tropa en la batalla del mapa** (la persona usa Curar, F6).
- **`expectedDamage` con la armadura** (la función es del núcleo, aunque la lea la IA).
- **«Sin el catálogo del juego»**: un cuerpo de criatura no vale.
- El defensor que despliega sin ver al atacante, en la partida (la arena lo sigue probando).

Muy mermadas (quedan pocos de los que había): el turno en tramos (3 de 10), lo que suman las piezas
y las dos manos (2 de 10), cada arma para lo suyo (2 de 9), la armadura que resta cada golpe (1 de
6), `legalActions` de un recorrido (7 de 10), la carga en línea recta (6 de 9), la previsión de la
rueda (2 de 8), el daño fijo por el cruce (1 de 5), las cifras de la rueda por niveles y con su arma
(2 y 2 de 6), una pieza sobre otra (2 de 8), la granada (2 de 6), las armas de fuego (1 de 3), las
cifras por rango (1 de 4), el índice de poder (9 de 15), el editor de equipo de la arena (4 de 8) y
el retoque a media pelea (6 de 11). La lista completa de `describe` que perdieron tests, con cuántos
tenían y cuántos les quedan, sale de comparar los informes JSON de antes y de después (en el
`scratchpad` de la sesión; no se guarda).

Casi todas caen por usar unidades o piezas **del catálogo** como datos de prueba (un templario, la
Espada, el jinete) con lo esperado escrito a mano. Reescritas con unidades y piezas construidas en el
test volverían a servir: no se ha hecho (fuera de alcance salvo trivial).

## Verificación

```
$ pnpm typecheck
> tsc --noEmit
(sin salida: 0 errores)

$ pnpm lint
Checked 517 files in 556ms. No fixes applied.
Found 10 infos.          (las mismas 10 de HEAD, en tools/taller/unidades.ts)
```

La suite, por tandas de 25 ficheros con `vitest run --maxWorkers=4 --reporter=json`, sobre el árbol real:

```
lote-0.json 787 785 1 1      (total, pasan, fallan, saltados)
lote-1.json 371 369 0 2
lote-2.json 458 455 0 3
lote-3.json 527 525 0 2
lote-4.json 362 361 0 1
lote-5.json 443 439 1 3
lote-6.json 756 756 0 0
total 3704 pasan 3690 fallan 2 saltados 12
test/base-escala.test.ts > la escala de la base: la del combate en un marco 20:11 de su alto el 860 de la hoja de estilos es `ANCHO_DEL_COMBATE_EN_MOVIL`
test/session.test.ts > la rueda y las defensas de la persona en la partida (F5) cuando golpean a la persona, elige su respuesta sin ver el golpe; esa no se cancela
```

Los dos rojos ya lo eran en HEAD y **no dependen del catálogo** (ninguna perturbación los mueve), así
que se quedan:

- `base-escala`: «no encuentro el ancho del lienzo de batalla en el móvil: expected null not to be
  null» — busca el 860 en la hoja de estilos y no lo encuentra (CSS).
- `session`: «expected [ 'atacante', 'bando', 'fase', …(3) ] to deeply equal [ 'atacante', 'bando',
  'fase', …(2) ]» — la rueda pendiente lleva un campo más de los que espera el test.

Los otros rojos de HEAD que daba el coordinador (`anim` «la cura de un poder…», `rueda-contrincantes`
R3, `equipo` «toda pieza que se vende… precio en oro») y los que salieron además en HEAD (`arena` el
reparto de velocidades, `paneles` el ancla, `mundo` ×2 y `motor-de-mundos` con `ejemplo`) eran todos
del catálogo: se borraron o recortaron (arriba).

Orden lenta de los tres ficheros de lento que leen el catálogo, sobre el árbol real:

```
$ HEROES_LENTO=1 vitest run test/prevision.test.ts test/invariantes.test.ts test/asaltantes.test.ts
 Test Files  3 passed (3)
      Tests  103 passed (103)
```

**No corrido**: `pnpm verify` (lo corre CI), la orden lenta de los ficheros de mapa y arte (no leen
el catálogo de unidades ni de piezas), `pnpm banco` (fuera de alcance: se reancla con cada cambio de
datos) y `pnpm qa` (no se toca ni `src/server/` ni el contrato).

## Lo que no queda cubierto

- Las perturbaciones son 23, no todas las posibles: no se renombraron **ids** (el código nombra
  algunos, como `espada`), ni se tocaron los rasgos y habilidades de las unidades, ni los datos del
  mapa y la presentación (`barreras`, `relieve`, `rios`, `clima`: el mapa y su generación se quedan
  por la petición). Un retoque raro (un arma a ataque 0, una unidad sin escudo de serie) aún podría
  morder algo que quede.
- Se quedan las frecuencias del **clima** (`clima.test.ts`: «salen los cuatro…», «los no muertos son
  de noche más a menudo») y de la escena (labranza en barbecho, hitos, gente de la base): son
  presentación, no jugabilidad, y ninguna perturbación del catálogo las mueve; si el usuario las
  cuenta como «frecuencias», son esas.
- `assets/mundos/ejemplo` no vale con el catálogo de hoy; el ancla `test/fixtures/paneles.txt` queda
  sin test que la mire.

Veredicto: hecho. Los criterios 1-5 se cumplen; los dos rojos que quedan son de HEAD y no del
catálogo.

## Tabla de lo borrado

Motivo: **1** jugabilidad, **2** cifra del catálogo, **1 y 2** las dos. «Cómo»: la perturbación que
lo delató (varias si fueron varias), «roja en HEAD» si ya fallaba por el catálogo retocado, o
«lectura» si se borró por motivo 1 sin que ninguna perturbación lo moviera. Las tres filas de
`mundo`/`motor-de-mundos` son los tests renombrados, no borrados.

| Fichero | Test (`describe › it`) | Motivo | Cómo |
|---|---|---|---|
| `agent-contract.test.ts` | lo que ve el agente › la granada cruza el contrato: "throw" en la lista, el esquema lo acepta y el stack dice lo que le queda y dónde caerá (02-11-2026) | 2 | P1, P2, P6 |
| `agent-contract.test.ts` | lo que ve el agente › el turno en tramos y la carga viajan en el esquema, en la prosa y en el turno (02-10-2026) | 2 | P3 |
| `agent-contract.test.ts` | lo que ve el agente › la prosa de la carga sale de las constantes que la cobran | 2 | P8 |
| `agent-contract.test.ts` | lo que ve el agente › las facciones y las criaturas de guardia de la paleta salen del catálogo, no de una copia (#108) | 2 | P2, P8 |
| `agent-contract.test.ts` | el nivel en el contrato: derivado de las cifras (12-10-2026) › `creature_stats` da la morada como `dwelling` y el `level` y el `powerIndex` derivados | 2 | P2, P8 |
| `agent-contract.test.ts` | el nivel en el contrato: derivado de las cifras (12-10-2026) › `creature_stats` dice la montura del jinete, su marcha y su carga montada (26-10-2026) | 2 | P3, P6 |
| `agent-contract.test.ts` | las voces de la base (town_voices) › la petición trae cada base pedida con su gente y lo que dice ahora, y la crónica corta | 2 | Q4 |
| `agent-contract.test.ts` | la rueda y los poderes en el contrato (F6) › la respuesta a una carga dice desde dónde golpeará quien aún no corrió («chargeFrom»), y sin carga no | 2 | P2, P6 |
| `agent-link.test.ts` | enlace con el agente › el agente compra y se equipa por el cable, leyendo solo la petición | 2 | P5 |
| `agent-link.test.ts` | el agente se rinde (fase 1b) › la rendición se le ofrece, entra por el contrato y el héroe vuelve a su base | 2 | P8 |
| `agent-link.test.ts` | una consulta solo habla de los jugadores que lleva el agente › game_state del rival ya no devuelve su crónica, y dice por cuál preguntar | 2 | P1 |
| `agent-link.test.ts` | el agente sabe cómo le fue › una marcha que se para al ver un grupo lo dice en el veredicto (#130) | 2 | P2, P6, P8 |
| `agent-link.test.ts` | el agente sabe cómo le fue › una acción de batalla que cuela también se acusa, en una línea | 2 | P3 |
| `agent-link.test.ts` | la rueda del golpe por el contrato (F6) › manda su golpe con `hit`, responde con `battle_response` sin ver el golpe y usa sus poderes | 2 | Q2 |
| `angulo.test.ts` | la carga en el cliente: el enemigo en la recta (QA, H1) › se anuncia contra el enemigo y desde la casilla de su recta, y nada más | 2 | P8 |
| `angulo.test.ts` | la carga en el cliente: el enemigo en la recta (QA, H1) › el clic sobre el enemigo, por el lado de la recta, golpea desde ella y carga | 2 | P8 |
| `anim.test.ts` | la vida y quién actúa, al ritmo de la cola › un fotograma que llega tarde se salta el impacto, no la vida que quita; el sobrante no cuenta | 2 | P2 |
| `anim.test.ts` | la vida y quién actúa, al ritmo de la cola › la cura de un poder sube la barra en su impacto; lo que el registro no dice llega con el último | 2 | roja en HEAD: la vida del no-muerto del catálogo topa la cura |
| `arena-edicion.test.ts` | la vista de edición › cada ficha va con su × y su cuerpo es la ficha de siempre, tal cual | 2 | Q1 |
| `arena-edicion.test.ts` | la barra al crear y al leer el borrador (segunda vuelta de QA) › R1: el nivel de una nueva se lee de su índice, el mismo de su ficha | 2 | P5, P6, P8 |
| `arena-equipo.test.ts` | el catálogo de equipo en la arena › lo ajeno se dice: un campo que no existe, la calidad o los PV de antes, un id mal escrito | 2 | P5 |
| `arena-equipo.test.ts` | el catálogo de equipo en la arena › muerde con la regla de una pieza del catálogo: sin velocidad ni daño de antes, las manos son de un arma, todo pesa | 2 | P5 |
| `arena-equipo.test.ts` | el catálogo de equipo en la arena › «Nueva pieza» y «Duplicar» dan un id libre | 2 | P5 |
| `arena-equipo.test.ts` | la arena pelea con sus piezas › la espada cambiada suma en la unidad y en la pelea, y el índice lo ve (18-10-2026) | 2 | P5 |
| `arena-equipo.test.ts` | cambiar una pieza no deja sin valer a nadie del catálogo › pasar la espada a dos manos con el escudo puesto se rechaza nombrando a quién | 2 | P5 |
| `arena-equipo.test.ts` | cambiar una pieza no deja sin valer a nadie del catálogo › dos piezas no se llaman igual: el nombre de otra se rechaza diciendo cuál | 2 | P5 |
| `arena-equipo.test.ts` | el enlace de la pelea lleva las piezas de lo montado › una pieza que nadie lleva, una que no vale o una que falta se rechazan diciendo cuál | 2 | P5 |
| `arena-equipo.test.ts` | cambiar una pieza a media pelea › cambia a todos los que la llevan, de los dos bandos, conservando la herida; y lo dice el parte | 2 | P2, P5 |
| `arena-equipo.test.ts` | cambiar una pieza a media pelea › lo que deja sin valer a un stack se rechaza con su nombre y no toca nada | 2 | P5 |
| `arena-equipo.test.ts` | la vista «Editar equipo» › lista el catálogo entero en cinco secciones, con de dónde sale cada una, y cuenta lo que no se ha guardado | 2 | P5 |
| `arena-equipo.test.ts` | la vista «Editar equipo» › cada tipo enseña solo sus cifras, y la rueda solo el cuerpo a cuerpo | 2 | P6, P8 |
| `arena-equipo.test.ts` | la vista «Editar equipo» › la rueda se edita en barras de 0 a 6, «+» sube un nivel (también en la Finta), y la rueda teñida va al lado | 2 | P6, P8 |
| `arena-equipo.test.ts` | la vista «Editar equipo» › una con base dice su cadena y su extra por cifra; el desplegable no ofrece ni ella ni lo que está sobre ella | 2 | P5, P6 |
| `arena-equipo.test.ts` | la ficha de una unidad ofrece solo lo que el núcleo admite (H3 de la vuelta 2) › lo que ofrece entra y lo desactivado se rechaza con el motivo que enseña, en todo el catálogo | 2 | P5 |
| `arena-equipo.test.ts` | la ficha de una unidad ofrece solo lo que el núcleo admite (H3 de la vuelta 2) › el héroe dice con qué arma pelea, y la Espada lo cuenta entre quienes la llevan | 2 | P5 |
| `arena.test.ts` | la arena pelea con las cifras del borrador › con equipo pelea con el cuerpo más las piezas, entra con los puntos de su armadura y se pinta con su cuerpo | 2 | P1, P2, P3, P6 |
| `arena.test.ts` | el borrador se valida antes de escribirse › rechaza diciéndolo: agilidad inventada, rasgo inexistente, cifras de antes | 2 | P5 |
| `arena.test.ts` | corrección de hallazgos de QA › H2: guardar no pierde lo guardado › una unidad que no vale no tira las buenas, y se vuelve a escribir tal cual | 2 | P5 |
| `arena.test.ts` | corrección de hallazgos de QA › H1 del banco: si cae un héroe, gana el otro por eso y no «por tiempo» | 2 | P1 |
| `arena.test.ts` | la velocidad son casillas: las de la agilidad › el criterio del usuario se cumple en lo que pelea cada unidad del catálogo | 1 y 2 | roja en HEAD: reparto de velocidades del catálogo |
| `arena.test.ts` | la velocidad son casillas: las de la agilidad › el motor juega el escalón de esas casillas, y una agilidad fuera de 2..7 se rechaza diciéndolo | 2 | P3, P5 |
| `arena.test.ts` | la arena como banco de combate › C2: el héroe sale con 10 × Conocimiento de maná, y lo que lanza dura su Poder | 2 | P8 |
| `arena.test.ts` | la arena como banco de combate › C2: la ficha del héroe enseña lo que rinde con sus cifras, y cuenta en el bando | 2 | P8 |
| `arena.test.ts` | la arena como banco de combate › C3: un lanzamiento sin maná se rechaza con el motivo de castBlocker | 2 | P8 |
| `arena.test.ts` | la arena como banco de combate › C3: la IA con libro lanza con la heurística del juego | 1 | lectura |
| `arena.test.ts` | el montaje del banco de combate › la ficha del héroe enseña los valores con los que pelea | 2 | P8 |
| `arena.test.ts` | los poderes del monje en la arena (A3) › la ficha separa los poderes, que actúan, de las habilidades sin efecto | 2 | P8 |
| `arena.test.ts` | los poderes del monje en la arena (A3) › el panel de la pelea lleva un botón por poder, apagado con su motivo, y «Editar» en cada fila | 2 | Q4 |
| `arena.test.ts` | retocar en plena pelea (B10-B14) › quitarle el escudo a media pelea baja su defensa y el parte dice «escudo: − Escudo» | 2 | P2, P3, P5, P6 |
| `arena.test.ts` | retocar en plena pelea (B10-B14) › el parte del héroe dice las cifras de su ficha y los hechizos por su nombre (N2 de QA) | 2 | Q4 |
| `arena.test.ts` | retocar en plena pelea (B10-B14) › rechaza diciéndolo y sin tocar nada: la figura del héroe, lo que no valida y la pelea acabada | 2 | P5 |
| `arena.test.ts` | retocar en plena pelea (B10-B14) › lo apuntado es uno solo, y retocar suelta lo que con las cifras nuevas ya no vale | 2 | Q4 |
| `arena.test.ts` | retocar en plena pelea (B10-B14) › la sesión: lo malo no entra ni mueve nada; lo bueno entra ya y conserva el turno (B11, B12, B14) | 2 | P5 |
| `arena.test.ts` | cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026) › el mismo cuerpo vale según lo que lleva: con mandoble y arnés, más que con la Espada, y esta más que la daga | 2 | P6, P8 |
| `arena.test.ts` | cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026) › el escudo suma defensa y un arma a dos manos no lo admite, en las dos direcciones | 2 | P5, P6 |
| `arena.test.ts` | cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026) › sin arma de cuerpo a cuerpo de la arena no se monta, y lo dice (vuelta 2) | 2 | P5 |
| `arena.test.ts` | cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026) › «Nueva unidad»: cifras mínimas, con la Espada y nada más, id propio y pelea con el arte de su cuerpo | 2 | P6, P8 |
| `arena.test.ts` | cuerpo y equipo: el perfil de arma es equipo, y el nivel lo mide puesto (18-10-2026) › R1/R2: una nueva nace donde cae su índice, y un rasgo de tiro pesa solo con algo con que tirar | 2 | P6, P8 |
| `arena.test.ts` | cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido › el arquero dispara con su arco como ayer y pega con la daga | 2 | P1, P2, P3, P5, P6 |
| `arena.test.ts` | cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido › el jinete lleva espada y lanza y carga montado con la lanza; el élfico dispara además con el arco | 2 | P5, P6 |
| `arena.test.ts` | cada arma para lo suyo (13-10-2026): los kits, y lo de antes convertido › lo de antes de cada arma en su hueco no vale: ni la unidad con el arco en «arma» ni la pieza | 2 | P5 |
| `arena.test.ts` | sin el catálogo del juego (13-10-2026) › un cuerpo de criatura no vale: no se retira ni se convierte, se queda como cualquiera que no vale | 2 | P5 |
| `arena.test.ts` | sin compatibilidad hacia atrás (14-10-2026) › en disco: lo de antes sale como que no vale, con su motivo, y «Guardar» lo conserva sin convertirlo | 2 | P5 |
| `armadura.test.ts` | las piezas dan armadura, no PV › las cinco armaduras: PV / 10 de antes en armadura y ningún PV, y ya no dan defensa (pesan) | 2 | P6 |
| `armadura.test.ts` | cada golpe resta la armadura de quien lo recibe, con mínimo 0 › un golpe de 30 sobre la brigantina quita 28, y el parte dice los 2 que paró | 2 | P6 |
| `armadura.test.ts` | cada golpe resta la armadura de quien lo recibe, con mínimo 0 › `herir` resta lo último: lo que llega, lo que para y los muertos | 2 | P6 |
| `armadura.test.ts` | cada golpe resta la armadura de quien lo recibe, con mínimo 0 › Rápido resta la armadura en cada uno de sus dos golpes: 30 × 0,63 = 18,9 → 19 → 17 y 17 | 2 | P6, P8 |
| `armadura.test.ts` | cada golpe resta la armadura de quien lo recibe, con mínimo 0 › un hechizo de daño resta la armadura del objetivo: la Flecha mágica, menos 2 | 2 | P6 |
| `armadura.test.ts` | cada golpe resta la armadura de quien lo recibe, con mínimo 0 › el drenaje de vida cura lo que quitó tras la armadura: 28, no 30 | 2 | P6 |
| `armadura.test.ts` | la IA cuenta con la armadura (`expectedDamage`) › baja exactamente lo que para, y nunca de 0 | 2 | P6 |
| `armadura.test.ts` | una pieza con PV no vale: ni se convierte ni se avisa (14-10-2026) › la armadura tiene tope (A4 de QA): lo juzga el catálogo, también la de una pieza con base | 2 | P5, P6 |
| `armas-de-fuego.test.ts` | las armas de fuego › el disparo de un arma de fuego perfora la armadura, y la previsión lo dice; el de una ballesta no | 2 | P6 |
| `armas-de-fuego.test.ts` | las armas de fuego › tras disparar, la culebrina (recarga 2) no apunta en ese turno ni en el siguiente; luego, sí | 2 | P5, P6 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › pega y devuelve el golpe con la daga: ataque 3 contra 4 (×0,975), 7–27 | 2 | P5, P6 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › el jinete carga 3 casillas con la lanza y la fuerza del caballo: ataque 6 contra 4 (×1,2) y +15 %, 9–36 → 12–50 | 2 | P5, P6, P8 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › montado sin lanza carga con la espada (+15 %), sin la fuerza del caballo: 4–16 ×1,2 ×1,15 → 6–22 | 2 | P5, P6, P8 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › con la rueda del golpe, la tirada cae en los cuartos de lo que pegan espada y lanza | 2 | P6, P8 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › la IA mide el golpe con su arma: el del arquero, con la daga, medio 17,0625 | 2 | P6 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › `armasDe`: una fila por golpe, con el arma y sus cifras | 2 | P5, P6 |
| `armas.test.ts` | cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026) › `armasDe`: un arma a distancia ya es disparar, sin munición (13-10-2026; antes, H1 del QA) | 2 | P5, P6 |
| `asaltantes.test.ts` | la patrulla › si no se cree capaz con el héroe de su región, se aparta de él | 1 y 2 | P3 |
| `asaltantes.test.ts` | la emboscada › un héroe mermado que pisa la región: el grupo ataca y el héroe DEFIENDE | 2 | P2, P6, P8 |
| `asaltantes.test.ts` | la emboscada › gana el grupo: el héroe vuelve a su base y el grupo sigue con lo que le quede | 2 | P3, P8 |
| `asaltantes.test.ts` | la emboscada › la IA que resuelve la defensa de una persona no la rinde por ella | 2 | P1, P3 |
| `asaltantes.test.ts` | la IA teme lo que vio (#164) › el alcance prudente esquiva el grupo que su dueño vio y no el que no ha visto | 1 y 2 | P2, P6, P8 |
| `asaltantes.test.ts` | la IA no entra en una emboscada que va a perder › su alcance prudente no pisa ninguna casilla de una región donde la emboscarían, la suya incluida | 1 y 2 | P2, P6, P8 |
| `asaltantes.test.ts` | la IA no entra en una emboscada que va a perder › si los dos están encerrados en una región que los embosca, el que juega vuelve a casa; si el rival se mueve, espera | 1 y 2 | P2, P6, P8 |
| `asaltantes.test.ts` | la IA no entra en una emboscada que va a perder › en partidas enteras de la IA contra sí misma no hay ni una emboscada | 1 | lectura |
| `asaltantes.test.ts` | los datos de los asaltantes › el techo de fuerza no es un muro: un héroe que espera en su base lo pasa licenciando y reclutando | 1 y 2 | P1, P2, P3, P6, P7, P8, P9 |
| `asaltantes.test.ts` | el plan de mapa con asaltantes › se rechazan con su frase: criatura falsa, de más, pegado a un nodo, sobre un muro | 2 | P1, P2, P3, P6, P7, P8, P9 |
| `asaltantes.test.ts` | lo que el castillo ve se pinta (H1) › el día 1, todo grupo cuya casilla se ve está explorado (también los que emboscan al héroe), y ningún objeto cae sobre `null` | 2 | P2, P6, P8 |
| `asaltantes.test.ts` | la ruta que pisa una emboscada (H2) › avisa en el primer paso de la región del grupo, y solo de un grupo que se ve | 2 | P2, P6, P8 |
| `asaltantes.test.ts` | qué grupo se ve: si se mira su casilla (02-11-2026) › la ruta no avisa de un grupo cuya casilla no se ve, aunque se vea su región | 2 | P1, P8 |
| `battle.test.ts` | hechizos › la flecha mágica gasta maná y daña al enemigo | 2 | P8 |
| `battle.test.ts` | legalActions recorre el tablero una sola vez (#48) › devuelve exactamente la misma lista, en el mismo orden | 2 | P3, P6 |
| `battle.test.ts` | legalActions recorre el tablero una sola vez (#48) › sin recorrido en la mano, moveTo sigue haciendo el suyo (#78) | 2 | P3, P6 |
| `battle.test.ts` | legalActions recorre el tablero una sola vez (#48) › un recorrido de otro stack se rechaza diciéndolo (#78) | 2 | P2, P3, P6 |
| `battle.test.ts` | efectos temporales (#9) › la lentitud caduca de verdad y se anuncia en el parte | 2 | P6 |
| `battle.test.ts` | efectos temporales (#9) › el mismo origen refresca en vez de acumularse: dos miedos no dan −4 | 2 | P3 |
| `battle.test.ts` | rasgos de criatura (#8) › charge: la caballería que llega de lejos pega más que la que ya estaba | 2 | P6, P8 |
| `battle.test.ts` | rasgos de criatura (#8) › charge: el parte cuenta los hexes que se cobran, no los que se anduvieron | 2 | P8 |
| `battle.test.ts` | el libro de hechizos del jugador (#4) › apuntar mal se explica con la frase del núcleo, no con una de la pantalla | 2 | Q4 |
| `battle.test.ts` | el libro de hechizos del jugador (#4) › lo que no se puede lanzar no se ofrece, y el motivo está escrito para la persona | 2 | P8 |
| `battle.test.ts` | el libro de hechizos del jugador (#4) › lanzar sale de las acciones legales, gasta maná y NO consume el turno del stack | 2 | P8 |
| `battle.test.ts` | la IA elige la casilla de ataque por daño esperado (#50) › con carga se va a la casilla que carga en línea recta, aunque otra cueste más pasos | 1 | lectura |
| `battle.test.ts` | la IA elige la casilla de ataque por daño esperado (#50) › sin carga no da rodeos: el criterio es el daño, no la distancia | 1 y 2 | P3 |
| `battle.test.ts` | la IA elige la casilla de ataque por daño esperado (#50) › a igual daño gana la barata, y el coste se LEE: no se supone del orden | 1 y 2 | P3 |
| `battle.test.ts` | la IA busca la carga: un tramo de lado y la recta en el siguiente › de salida no hay carga; tras un paso a (0,3), carga 4 desde (4,3) en el mismo turno | 1 y 2 | P6 |
| `battle.test.ts` | la IA busca la carga: un tramo de lado y la recta en el siguiente › sin la carga montada, la misma unidad no da el paso de lado | 1 y 2 | P6 |
| `battle.test.ts` | la IA busca la carga: un tramo de lado y la recta en el siguiente › no se planta pegado a otro enemigo: con uno junto a (0,3) sube a (1,3) y carga 3 | 1 y 2 | P6 |
| `battle.test.ts` | la IA busca la carga: un tramo de lado y la recta en el siguiente › si la recta no cabe en lo que queda del tramo, decide como sin el rasgo | 1 | lectura |
| `battle.test.ts` | la IA lanza hechizos (#24) › lanza la flecha mágica cuando rinde más que su coste, y no gasta el turno | 1 y 2 | P8 |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › la Prisa vale el golpe que compra hoy: ni cuando ya llega ni cuando ni con ella llega | 1 | lectura |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › la Prisa sobre quien ya actuó esta ronda no vale nada | 1 | lectura |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › la Lentitud vale el golpe que le quita al enemigo que aún no ha actuado | 1 y 2 | P3 |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › un refresco no compra la ronda que ya cubre el mismo origen | 1 | lectura |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › las rondas siguientes cuentan hasta el final estimado de la batalla, no hasta el de la Lentitud | 1 | lectura |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › la Flecha va a quien más amenaza le quita al rival: al héroe, que es su bando entero | 1 | lectura |
| `battle.test.ts` | la IA valora los hechizos por lo que compran en esta batalla (#92) › el umbral sigue en PV: una Flecha que solo puede quitar 1 PV no se lanza | 1 y 2 | P1 |
| `battle.test.ts` | la IA aprovecha el segundo tramo (02-10-2026) › tras moverse, si ahora alcanza a alguien, le pega en vez de cerrar | 1 y 2 | P3 |
| `battle.test.ts` | la IA aprovecha el segundo tramo (02-10-2026) › tras moverse sin nadie a mano y sin poder acercarse más, cierra el turno | 1 y 2 | P3 |
| `battle.test.ts` | la IA aprovecha el segundo tramo (02-10-2026) › lo que elige la IA está SIEMPRE en la lista legal, también tras un tramo | 1 y 2 | P3, P6 |
| `battle.test.ts` | la IA ya no cede la iniciativa (#52 retirado, 26-10-2026) › avanza aunque al avanzar quede al alcance de quien aún no ha movido | 1 | lectura |
| `battle.test.ts` | la IA ya no cede la iniciativa (#52 retirado, 26-10-2026) › y con el enemigo a tiro, golpea | 1 | lectura |
| `battle.test.ts` | el turno en tramos (2026-10-02) › dos `move` seguidos dejan a la misma unidad activa, y el que pasa del presupuesto se rechaza | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › si agota el presupuesto sin nadie al alcance, el turno se cierra solo | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › el hechizo del héroe no deja abierto un turno agotado: no es la unidad haciendo nada | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › con el presupuesto agotado y un enemigo al lado, el turno sigue: le queda golpear | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › `ataqueBlocker` y la lista legal son las dos caras de la misma regla | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › `end_turn` cierra el turno tras moverse, también con la moral alta: el siguiente es OTRO turno, de otro | 2 | P3 |
| `battle.test.ts` | el turno en tramos (2026-10-02) › una Lentitud a mitad de turno recorta lo que queda, sin bajar de 0 | 2 | P3 |
| `battle.test.ts` | la carga en línea recta (decisión del usuario, 02-10-2026) › una recta libre de 3 carga 3; de 2, nada; de 6, el tope de 5 | 2 | P8 |
| `battle.test.ts` | la carga en línea recta (decisión del usuario, 02-10-2026) › se recalcula por tramo: 2 de un tramo y una recta de 3 en el siguiente cargan 3, no 5 | 2 | P6 |
| `battle.test.ts` | la carga en línea recta (decisión del usuario, 02-10-2026) › una casilla vacía de la recta sin nadie detrás no se anuncia: desde ahí solo se mueve | 2 | P8 |
| `battle.test.ts` | el parte de guerra pinta de quién es cada cosa › un efecto se pinta por lo que suma o resta a la unidad, dicho desde quien lee (#198) | 2 | Q4 |
| `battle.test.ts` | el parte de guerra pinta de quién es cada cosa › ataques y hechizos dicen quién a quién (#18) | 2 | P8 |
| `battle.test.ts` | el parte de guerra pinta de quién es cada cosa › un golpe y lo que se disipa dicen el bando cuando el nombre está en los dos | 2 | Q4 |
| `battle.test.ts` | la IA va a por quien su golpe le quita más amenaza (#79) › deja al goblin suelto y va a golpear a los diez esqueletos | 1 y 2 | P3 |
| `carga.test.ts` | las cifras de la carga (`data/carga.json`) › +5 % por casilla hasta 5, para todos | 2 | P8 |
| `carga.test.ts` | las cifras de la carga (`data/carga.json`) › la frase de una carga cobrada | 2 | P8 |
| `carga.test.ts` | la carga montada pega con la fuerza de la montura (26-10-2026) › con una recta de 5, tira en [9, 27] ×1,25, y el golpe cae en su previsión | 2 | P1, P3, P5, P6, P8 |
| `carga.test.ts` | la carga montada pega con la fuerza de la montura (26-10-2026) › montado sin lanza, o a pie, la carga va con la horquilla de su arma | 2 | P1, P6, P8 |
| `carga.test.ts` | la carga montada pega con la fuerza de la montura (26-10-2026) › sin carga, el golpe del jinete montado no lleva la fuerza de la montura | 2 | P1, P2, P3, P6 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › una recta de 3: cobra 3 casillas (+15 %), a pie y montado | 2 | P8 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › una recta de 4: cobra 4 casillas (+20 %), a pie y montado | 2 | P8 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › una recta de 6: cobra 5 casillas (+25 %), a pie y montado | 2 | P8 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › el tirador que pega con la daga también carga | 2 | P8 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › el héroe de la arena también carga a pie | 2 | P8 |
| `carga.test.ts` | carga todo el que pega cuerpo a cuerpo, y lo mismo cobra el jinete › el parte dice la carga, a pie o montada, con lo que sumó | 2 | P8 |
| `carga.test.ts` | el juego carga como la arena (19-10-2026) › la misma unidad y la misma recta por `createBattle`: a pie y el jinete montado | 2 | P2, P6 |
| `catalogo.test.ts` | el catálogo de unidades (data/unidades.json) › busca por id, y lanza diciendo cuál si no está | 2 | P5 |
| `catalogo.test.ts` | el catálogo de unidades (data/unidades.json) › se valida con una sola regla, la de la carga y la de «Guardar»: una unidad que no vale lanza nombrando el fichero y a quién | 2 | P5 |
| `cronica.test.ts` | la crónica pasa por la niebla › el reloj y el final llegan siempre, sean de quien sean | 2 | Q6 |
| `cronica.test.ts` | la crónica de la pantalla deja de mentir › los hechizos del rival ya no se pintan como una buena noticia tuya | 2 | Q4 |
| `despliegue-en-escena.test.ts` | el defensor despliega sin ver al atacante › abre en la tanda del defensor: ni figuras, ni lista, ni pista del rival | 2 | R6 |
| `equipo-bases.test.ts` | una pieza sobre otra › suma su base más sus extras, en cadena, y la ficha dice la cadena | 2 | P5 |
| `equipo-bases.test.ts` | una pieza sobre otra › el vínculo es vivo: cambiar la Espada cambia la de herrería, la bendita y a quien las lleva | 2 | P5 |
| `equipo-bases.test.ts` | una pieza sobre otra › a media pelea, cambiar la Espada cambia al que lleva la bendita, y el parte lo dice | 2 | P5 |
| `equipo-bases.test.ts` | una pieza sobre otra › cambiar de base conserva lo que suma; «ninguna» la deja entera con lo mismo | 2 | P5 |
| `equipo-bases.test.ts` | una pieza sobre otra › no vale, con su motivo: base que no existe, de otro hueco, ni dar la vuelta | 2 | P5 |
| `equipo-bases.test.ts` | una pieza sobre otra › no se borra la base de otra pieza | 2 | P5 |
| `equipo.test.ts` | el catálogo de equipo, en datos (C2) › toda pieza que se vende o cae como botín tiene precio en oro; solo las de los kits van sin él | 2 | roja en HEAD: la Lanza corta del catálogo a 0 de oro |
| `equipo.test.ts` | el catálogo de equipo, en datos (C2) › el arma de fuego tira con su agilidad y la granada no dispara (02-11-2026) | 2 | P6 |
| `equipo.test.ts` | el catálogo de equipo, en datos (C2) › cada lectura atada resuelve de su catálogo; las sueltas, del juego | 2 | P5 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › `conEquipo` suma la fuerza del arma al daño, y el peso que no pasa de la fuerza no resta | 2 | P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › cada arma para lo suyo (13-10-2026): arriba, el cuerpo a cuerpo; en `armas`, el disparo y la carga | 2 | P1, P5, P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › el equipo base del héroe suma la Espada y el gambesón: ataque, fuerza, armadura y peso, sin PV | 2 | P5, P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › el escudo suma defensa y pesa; el peso que pasa de la fuerza resta agilidad, y con ella casillas, defensa y daño | 2 | P1, P2, P3, P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › `modificadoresDePieza`: lista estructurada, en el orden de las cifras, sin ceros y con la marca detrás | 2 | P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › `manosBlocker`: un escudo sobre un arma a dos manos y un arma a dos manos sobre un escudo | 2 | P5 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › dos armas de una mano (25-10-2026): de cada cifra, la mejor de las dos, y lo que no cabe en las manos se dice | 2 | P1, P2, P3, P5, P6 |
| `equipo.test.ts` | las piezas suman daño y tiros, el escudo resta velocidad y las dos manos no lo admiten (12-10-2026) › el juego lo rechaza con su motivo: equipar un mandoble a quien lleva escudo y al revés | 2 | P5 |
| `equipo.test.ts` | las cifras se suman en las puertas de siempre (C1) › una pieza suma sus cifras, y lo que pesa todo lo puesto resta agilidad | 2 | P2, P3, P6 |
| `equipo.test.ts` | las cifras se suman en las puertas de siempre (C1) › el cuerpo del héroe suma lo que lleva, y desnudo es el de antes | 2 | P3, P6 |
| `equipo.test.ts` | equipar y desequipar (C1, C4) › los rechazos dicen por qué, y no tocan nada | 2 | P5 |
| `equipo.test.ts` | un arma a dos manos sobre un escudo de serie (QA de la tropa, H4) › el motivo no pide quitar el escudo, que es de serie: tampoco con otro encima | 2 | P5 |
| `equipo.test.ts` | la segunda mano de la tropa: la acción hace lo que dice la pregunta (QA de fuerza y agilidad, H1) › la que se rechaza no toca nada: ni la mochila, ni la tropa, ni el contador de hojas | 2 | P5 |
| `equipo.test.ts` | la segunda mano de la tropa: la acción hace lo que dice la pregunta (QA de fuerza y agilidad, H1) › quitar el arma propia no deja el arma a dos manos de serie con una segunda encima (QA, vuelta 2, H5) | 2 | P5 |
| `equipo.test.ts` | la armería (C4) › los motivos de no poder comprar: sin armería, sin héroe, pieza de botín, sin oro, pueblo ajeno | 2 | P4, P5 |
| `equipo.test.ts` | el botín (C3) › repeler una emboscada deja una pieza en la mochila y un `loot_found` de asaltantes | 2 | R4 |
| `equipo.test.ts` | la IA compra y equipa (C5) › pone en la tropa lo de la mochila que mejora a alguien, y compra con tope por día | 1 | lectura |
| `equipo.test.ts` | la IA compra y equipa (C5) › a un novato solo le compra si le sobra mucho oro; al veterano, con lo que cuesta un héroe (I2) | 1 y 2 | P2, P4 |
| `equipo.test.ts` | la IA compra y equipa (C5) › un personaje en la tropa no la tumba: se aparta antes de mirar su índice | 1 | lectura |
| `equipo.test.ts` | la IA compra y equipa (C5) › una pieza de botín mejora al héroe, y lo que se quita lo hereda la tropa | 1 | lectura |
| `equipo.test.ts` | el fichero, por tipos y con bases (18-10-2026) › el fichero resuelve sus bases: la Espada de herrería es la Espada con extras, y la bendita la de herrería | 2 | P5, P6 |
| `equipo.test.ts` | el fichero, por tipos y con bases (18-10-2026) › una base que no existe, de otro hueco o que da la vuelta tumba la carga diciéndolo | 2 | P5, P6 |
| `equipo.test.ts` | la montura, aparte del jinete (26-10-2026) › las tres monturas del catálogo: dos se venden en la armería; la hiena, solo en su kit | 2 | P6 |
| `equipo.test.ts` | la montura, aparte del jinete (26-10-2026) › el hermano de carga montado: las casillas del caballo, su agilidad entera y el daño sin la fuerza del caballo | 2 | P1, P2, P3, P6 |
| `equipo.test.ts` | la montura, aparte del jinete (26-10-2026) › un caballo de silla no cambia la batalla: solo la marcha del mapa | 2 | P1, P2, P3, P6 |
| `equipo.test.ts` | la montura, aparte del jinete (26-10-2026) › una unidad que escribe el rasgo «charge» tumba la carga del catálogo diciendo dónde va ahora | 2 | P5 |
| `escala.test.ts` | la marcha sale del área (#226) › maxMovePoints la aplica: un héroe anda la tabla a escala, no la tabla | 2 | P3 |
| `escenas.test.ts` | la ruta avisa de la emboscada (H2) › el tramo desde la emboscada va marcado, la barra lo dice delante y la batalla sale donde avisa | 2 | P2, P6, P8 |
| `escenas.test.ts` | la batalla en el lienzo › pulsar el centro de un hex alcanzable que tapa una figura enemiga mueve, no ataca | 2 | P1, P2, P3, P8 |
| `escenas.test.ts` | la base caminable (escenas/castillo.ts) › la barra dice lo de la base, no lo del mapa (QA, H4) | 2 | Q4 |
| `escenas.test.ts` | «A distancia» con el puntero: lo que no se puede, dicho como al pulsar › la granada fuera de alcance da su motivo sobre un enemigo y sobre una casilla vacía (H1 del QA de las granadas) | 2 | P1, P2, P5 |
| `escenas.test.ts` | «A distancia» con el puntero: lo que no se puede, dicho como al pulsar › el arco sigue igual sobre un enemigo, y sobre su propia casilla dice por qué | 2 | P5 |
| `experiencia.test.ts` | la experiencia se gana por daño × índice de poder del que lo recibe (C1) › el índice del que recibe es el de sus cifras: el rango lo sube, y el del héroe es el de su cuerpo | 2 | P2, P8 |
| `experiencia.test.ts` | una sola tabla en Fibonacci (C2) › los umbrales salen del JSON: 2 700, 8 100, 16 200 y 29 700 para los rangos 2-5 (en PV × índice) | 2 | P8 |
| `experiencia.test.ts` | una sola tabla en Fibonacci (C2) › la tropa se para en el 5 y el héroe no: sigue la misma recurrencia | 2 | P8 |
| `experiencia.test.ts` | cifras por rango, en una sola puerta (C4) › las cifras de un veterano se guardan por su hoja, y otra hoja u otra criatura se recalculan | 2 | P1, P8 |
| `experiencia.test.ts` | cifras por rango, en una sola puerta (C4) › un coracero de rango 3 entra con ataque +2 y fuerza +2, y rendirse lo cobra a su precio | 2 | P1 |
| `experiencia.test.ts` | cifras por rango, en una sola puerta (C4) › las dos puertas de cifras dan lo mismo: `troopUnit` y lo que pisa el tablero | 2 | P8 |
| `experiencia.test.ts` | la IA no tira a la tropa veterana (C8) › para meter algo mejor licencia a los novatos antes que al veterano, aunque sea más caro | 1 y 2 | P1, P3, P7, P9 |
| `experiencia.test.ts` | una sola escala de rangos: el héroe empieza donde acaba la tropa › el agente ve el rango del héroe, su nivel, su experiencia y el umbral siguiente | 2 | P1, P2, P8 |
| `ficha-en-tabla.test.ts` | la ficha en tabla, con las notas como tooltip (13-10-2026) › la columna final de una unidad es `unidadDeCombate`, y en otro tono solo lo que el equipo cambia | 2 | P1, P2, P6 |
| `ficha-en-tabla.test.ts` | la ficha en tabla, con las notas como tooltip (13-10-2026) › lo que suma una pieza tiene una sola forma: la de `modificadoresDePieza`, en la ficha y en el editor | 2 | P6 |
| `figuras-de-heroe.test.ts` | validarFigurasDeHeroe muerde › un tipo sin hoja | 2 | Q4 |
| `formacion.test.ts` | la formación sobrevive a los cambios de la tropa (C2) › una batalla sale desde la formación, espejada al defender, y el superviviente vuelve con su casilla | 2 | P1, P3 |
| `game.test.ts` | puntos de movimiento › los marca el más lento del grupo, el héroe incluido (26-10-2026) | 2 | P3, P6 |
| `game.test.ts` | puntos de movimiento › un caballo de silla sube la marcha solo si lo llevan todos, y no cambia la batalla | 2 | P2, P3, P6 |
| `game.test.ts` | puntos de movimiento › Logística los aumenta un 10 % por nivel | 2 | P3 |
| `game.test.ts` | generación de mapas › una guarnición de los datos tiene además el tope de liderazgo de guarnición | 2 | R5 |
| `game.test.ts` | batallas del mapa › perder la batalla devuelve al héroe atacante a su base, sin tropa | 2 | Q2 |
| `game.test.ts` | IA de respaldo › planifica construir y reclutar en el primer turno, si la base tiene sitio | 1 | lectura |
| `game.test.ts` | IA de respaldo › quien se ha quedado sin héroe reserva lo que cuesta el siguiente | 1 | lectura |
| `game.test.ts` | IA de respaldo › con un héroe vivo no se reserva nada: el oro es para el ejército | 1 y 2 | P2 |
| `game.test.ts` | IA de respaldo › valora más un ejército mayor | 1 | lectura |
| `game.test.ts` | IA de respaldo › no manda al héroe contra un monstruo que le supera | 1 | lectura |
| `game.test.ts` | partida completa › termina con un ganador jugando IA contra IA | 1 | lectura |
| `game.test.ts` | partida completa › el bucle completo pasa por construir, reclutar, luchar y capturar | 1 | lectura |
| `game.test.ts` | catálogo de edificios por facción › con todas las moradas levantadas, la IA levanta el castillo: es lo primero de la villa | 1 | lectura |
| `game.test.ts` | catálogo de edificios por facción › el orden se deriva: las moradas primero, de más nivel a menos, y la IA levanta la mejor que puede | 1 | lectura |
| `game.test.ts` | el gremio enseña (#2) › el gremio se construye jugando, y acaba en un hechizo aprendido | 1 y 2 | P1, P2, P3, P6, P7, P8 |
| `game.test.ts` | los personajes y sus heridas › el personaje que cae queda a 0 PV y sale del ejército, pero no de la partida | 2 | P1 |
| `game.test.ts` | los personajes y sus heridas › las heridas se escriben también en el bando que defiende, aunque su héroe caiga | 2 | P2, P3 |
| `game.test.ts` | los personajes y sus heridas › el defensor con personaje que GANA lo conserva en el ejército, con sus PV escritos | 2 | P1, P2, P3 |
| `game.test.ts` | el mapa de nodos se juega › la base nace llena: sin el héroe dentro no se recluta, y el rechazo lo dice | 2 | P7, P9 |
| `game.test.ts` | el mapa de nodos se juega › la IA no elige un objetivo que está detrás de una guarnición que no puede vencer | 1 y 2 | P1, P3 |
| `game.test.ts` | el id de un héroe contratado no se repite (#126) › con tres jugadores: contratar, caer otro héroe y volver a contratar el mismo día | 2 | P3 |
| `game.test.ts` | la marcha se para al descubrir un grupo que la emboscaría (#130) › se queda donde lo ve, sin batalla, con lo andado gastado; y el grupo ya se ve | 2 | P2, P6, P8 |
| `game.test.ts` | la marcha se para al descubrir un grupo que la emboscaría (#130) › un grupo que ya se ve al salir no para nada: pedir la misma marcha otra vez es la emboscada | 2 | P2, P6, P8 |
| `game.test.ts` | la marcha se para al descubrir un grupo que la emboscaría (#130) › el rival que mira al héroe parado sin ver al grupo no se entera (H4 de QA) | 2 | P2, P6, P8 |
| `game.test.ts` | la marcha se para al descubrir un grupo que la emboscaría (#130) › un héroe al que nadie le saca el margen anda entero | 2 | P2, P6, P8 |
| `game.test.ts` | la marcha que gana fuerza por el camino vuelve a mirar quién la emboscaría (H1, H2 de QA) › avisaba de un grupo que deja de temer: se para al ver al siguiente, que no avisaba (H1) | 2 | Q2 |
| `game.test.ts` | la marcha que gana fuerza por el camino vuelve a mirar quién la emboscaría (H1, H2 de QA) › no se para por un grupo que, con la guarnición recogida, ya no la emboscaría (H2) | 2 | Q2 |
| `granada.test.ts` | la granada › lanzar: a su alcance, con cargas, sin moverse y sin un enemigo al lado; la recta no importa | 2 | P1, P2, P5 |
| `granada.test.ts` | la granada › explota al empezar su siguiente turno: el cuarto 4 en la casilla y el 2 en las vecinas, a los dos bandos, con la armadura y sin dado | 2 | P6, P8 |
| `granada.test.ts` | la granada › se gasta: con 0 cargas ni se ofrece ni se lanza; y si quien la lanzó cae antes, no explota | 2 | P2, P5, P6 |
| `granada.test.ts` | la granada › el parte dice en palabras que quien la lanzó se alcanza con ella, no «Granadero → Granadero» | 2 | P5 |
| `heroe-en-batalla.test.ts` | el héroe pisa el tablero (criterio 4) › matar al héroe da la batalla al rival aunque a su bando le quede tropa | 2 | P3 |
| `heroe-en-batalla.test.ts` | la rendición (criterio 5) › la IA de reglas se rinde cuando pierde de largo y tiene tropa que salvar | 1 | lectura |
| `heroe-en-batalla.test.ts` | la rendición (criterio 5) › y no se rinde si no le queda tropa: rendirse solo con el héroe es pagar por nada | 1 | lectura |
| `heroe-en-batalla.test.ts` | el héroe vencido vuelve a la base (criterio 6) › rendido: vuelve con la tropa viva, paga el oro y no cuenta como caído | 2 | P8 |
| `heroe-en-batalla.test.ts` | el héroe vencido vuelve a la base (criterio 6) › el defensor que gana se queda con lo que tiene en pie y con el maná que gastó | 2 | P6, P8 |
| `heroe-en-batalla.test.ts` | la IA no se rinde por quien no es ella (H-1) › `resolvePendingBattle` pelea por los vetados hasta el final, sin rendirse | 2 | P1 |
| `heroe-en-batalla.test.ts` | la IA no se rinde por quien no es ella (H-1) › en el navegador: el turno del rival ataca a la persona y la IA no se rinde por ella | 2 | P6 |
| `ia-bucles.test.ts` | el vaivén › dos vueltas enteras de A a B sin pelear: la tercera no se da | 1 | lectura |
| `ia-bucles.test.ts` | el vaivén › una sola vuelta es ir y volver, no un vaivén: el héroe da el paso de siempre | 1 | lectura |
| `ia-bucles.test.ts` | el vaivén › quieto no es un vaivén: lo lleva el encierro | 1 | lectura |
| `ia-bucles.test.ts` | el encierro con el rival libre › espera mientras esperar puede arreglarlo, y a los 10 turnos vuelve a casa | 1 y 2 | P2, P6, P8 |
| `ia-bucles.test.ts` | el encierro con el rival libre › fuera de su base, sin a dónde ir y con un alcance que no es su casilla, a los 10 turnos también vuelve (#186) | 1 | lectura |
| `ia-fuerza.test.ts` | la fuerza estimada sigue a la que se ve peleando (#182) › un héroe de nivel 20 sin tropa contra uno de nivel 12 con seis caballeros de la muerte: se le da por más fuerte, y gana | 1 | lectura |
| `ia-fuerza.test.ts` | la fuerza estimada sigue a la que se ve peleando (#182) › la calibración: el peso del cuerpo está cerca del mejor y el margen se cumple | 1 | lectura |
| `morada.test.ts` | la ficha y el reclutamiento (C4, C5) › con la guarnición llena, «+1» y «Todo (0)» apagados y la frase del núcleo escrita debajo; con sitio, se recluta sin salir | 2 | P7, P9 |
| `motor-de-mundos.test.ts` | el motor de mundos › «pnpm mundo medir» mide «ejemplo» sin lanzar | 2 | roja en HEAD: «ejemplo» deja de valer con el catálogo retocado; se queda con «prueba» (renombrado) |
| `mundo.test.ts` | la validación de un mundo › el mundo de prueba (a mano) y el de ejemplo (del motor) no tienen problemas | 2 | roja en HEAD: «ejemplo» deja de valer con el catálogo retocado; se queda con «prueba» (renombrado) |
| `mundo.test.ts` | la validación de un mundo › un encuentro por encima del tope de un grupo neutral | 2 | P7 |
| `mundo.test.ts` | la lectura para el motor › dice con qué tropa sale el héroe y cuánta le cabe, la de la partida | 2 | P7, P9 |
| `mundo.test.ts` | elegir en un lugar › lo que se llevó el otro jugador se dice con su nombre y su facción (M2) | 2 | P5 |
| `mundo.test.ts` | la IA de reglas en un lugar › elige la primera opción que hace algo, hasta que no queda ninguna, y cada premio una vez | 1 | lectura |
| `mundo.test.ts` | la IA de reglas en un lugar › sin ventaja, va por el camino a un premio y no paga lo que no lleva a nada (M3 de la vuelta 2) | 1 | lectura |
| `mundo.test.ts` | la IA de reglas en un lugar › un interruptor sin premio no la atrapa ni hace que el lugar le valga (M3 de la vuelta 2) | 1 | lectura |
| `mundo.test.ts` | los mundos del repositorio en disco › «prueba» y «ejemplo» valen con su biblia, como los ve «pnpm mundo validar» | 2 | roja en HEAD: «ejemplo» deja de valer con el catálogo retocado; se queda con «prueba» (renombrado) |
| `muralla-alta.test.ts` | el cuerpo a cuerpo, solo al mismo nivel › al que señala una columna ocupada se le dice quién está | 2 | P5 |
| `muralla-alta.test.ts` | la IA con la muralla alta › el atacante sin camino escala: va al pie, pone la escalera y sube | 1 | lectura |
| `muralla-alta.test.ts` | la IA con la muralla alta › el que sabe escalar sube sin escalera | 1 | lectura |
| `muralla-alta.test.ts` | la IA con la muralla alta › el atacante al pie con escalera la pone, y el que puede subir sube | 1 | lectura |
| `muralla-alta.test.ts` | la IA con la muralla alta › el tirador que defiende sube al muro, y arriba se queda tras subir | 1 | lectura |
| `muralla-de-batalla.test.ts` | el muro (C3) › el atacante que camina no sube ni lo cruza, y el núcleo dice por qué | 2 | P3 |
| `muralla-de-batalla.test.ts` | la IA juega con muros sin colgarse (C5) › el atacante rodea la L en vez de quedarse pegado al muro | 1 | lectura |
| `muralla-de-batalla.test.ts` | la IA juega con muros sin colgarse (C5) › cuerpo a cuerpo contra tiradores tras la línea: suben y acaba | 1 | lectura |
| `muralla-dentro-fuera.test.ts` | de lo alto solo se baja hacia dentro (C11) › en el semicírculo, el de lo alto baja al arco y no afuera | 2 | Q2 |
| `muralla-dentro-fuera.test.ts` | de lo alto solo se baja hacia dentro (C11) › el tirador defensor lejos de la muralla va hacia ella en vez de defenderse | 1 | lectura |
| `muralla-gruesa.test.ts` | murallas gruesas (C16) › el pasillo de dos de fondo con la puerta en medio: cerrada no la cruza nadie, abierta los dos (C20, C27) | 2 | P2, P3, P6 |
| `muralla-puerta.test.ts` | la IA con la puerta (C24) › quien defiende la abre para salir si ningún atacante llega a ella, y sale | 1 | lectura |
| `muralla-puerta.test.ts` | la IA con la puerta (C24) › no la abre si un atacante llega a ella, ni para salir | 1 | lectura |
| `muralla-puerta.test.ts` | la IA con la puerta (C24) › el tirador no sale: su sitio es la muralla | 1 | lectura |
| `muralla-puerta.test.ts` | la IA con la puerta (C24) › la cierra en cuanto un atacante puede llegar a ella, si nadie la ocupa | 1 | lectura |
| `muralla-puerta.test.ts` | la IA con la puerta (C24) › el atacante cruza la puerta abierta: la distancia lee la puerta, sin caché vieja | 1 y 2 | P2, P3, P6 |
| `niebla-por-regiones.test.ts` | vuelta 1 de QA › a quien le quitan un nodo o un castillo se entera y ve la bandera nueva (H1) | 2 | P1, P7, P8 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › la armadura cuenta en lo que aguanta, contra un golpe de 9, y como mucho ×4 | 2 | P8 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › lo que pega es el mejor de sus golpes, cada uno con su arma: el disparo cuenta si tira | 2 | P3, P6 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › el arma de fuego y la granada se miden (02-11-2026): la recarga baja el disparo y la granada cuenta como un disparo | 2 | P2, P6, P8 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › la rueda de la segunda arma pesa en el índice: de cada tipo, la mejor de las dos (25-10-2026) | 2 | P6 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › las unidades del catálogo, vestidas, tienen el índice y el nivel de su tabla | 2 | P1, P2, P3, P6, P8 |
| `nivel.test.ts` | el índice de poder y el nivel (core/nivel.ts) › el héroe: su cuerpo crece por rango y su nivel se lee de él, con el equipo | 2 | P1, P2, P3, P6, P8 |
| `notas.test.ts` | notas para el agente › en partidas de verdad, cada marcha del día 1 que no llega lo dice, y la que llega no (#130) | 2 | P2, P3, P6, P7, P8 |
| `paneles.test.ts` | el marcado de los paneles › sale byte a byte igual que su ancla | 2 | roja en HEAD: el ancla lleva cifras del catálogo |
| `paneles.test.ts` | la fila de un equipado (M5) › «Lleva:» es solo texto, y los botones para quitar van en su línea con el nombre de la pieza | 2 | P5 |
| `paneles.test.ts` | la pantalla cuenta lo que hizo la magia (#54) › el libro del héroe va en el mismo orden que el gremio, lo aprendiera como lo aprendiera | 2 | Q4 |
| `paneles.test.ts` | la pantalla cuenta lo que hizo la magia (#54) › el castillo enseña el libro del que está dentro y lo que aprendió allí | 2 | Q4 |
| `poderes.test.ts` | los rechazos los escribe poderBlocker (A5) › cada motivo, y applyAction lanza con él | 2 | Q4 |
| `poderes.test.ts` | los rechazos los escribe poderBlocker (A5) › quien no tiene el poder no lo sabe | 2 | Q4 |
| `poderes.test.ts` | la IA de batalla usa los poderes (A4) › cura a quien puede caer si la pelea se gana; si no corre peligro, no gasta el turno en él | 1 y 2 | P1, P2, P6 |
| `prevision.test.ts` | la previsión de daño cae en el daño real › carga de la caballería | 2 | P6 |
| `prevision.test.ts` | la previsión de daño cae en el daño real › dice qué cambia el daño: la carga | 2 | P6, P8 |
| `prevision.test.ts` | la previsión de daño cae en el daño real › con armas por uso (la arena), lo primero que dice es con qué arma pega cada golpe | 2 | P5 |
| `prevision.test.ts` | la previsión de daño cae en el daño real › con armadura (la arena), la cuenta lo dice lo último: «−2 armadura» | 2 | P6 |
| `resumen-de-batalla.test.ts` | el resumen de la batalla en battle_ended (#93) › la crónica de la pantalla lo cuenta en primera persona a cada bando y en tercera al que mira | 2 | Q4 |
| `rueda-contrincantes.test.ts` | R3 de QA (#263): R. guardia dice en cuánto deja el contraataque antes de elegir › su nota, y su etiqueta, llevan el contraataque con cada éxito frente al de Normal | 2 | roja en HEAD: el contrincante es otra unidad del catálogo |
| `rueda-contrincantes.test.ts` | 31-10-2026: los modificadores de los dos, en la cabecera de la rueda › lo que lleva colgado cada uno, en pastillas con su signo y una sola nota; sin nada, nada | 2 | P2, P6 |
| `rueda-contrincantes.test.ts` | 31-10-2026: los modificadores de los dos, en la cabecera de la rueda › una sola forma: la de «En el campo» y la de la rueda salen de la misma función | 2 | P8 |
| `rueda-contrincantes.test.ts` | 31-10-2026: los modificadores de los dos, en la cabecera de la rueda › el desenlace pinta lo que llevaban antes del cruce (la foto del animador), no lo que trae el estado | 2 | P2, P6, P8 |
| `rueda-contrincantes.test.ts` | #261: la vista previa › el nombre, la vida y las cifras con lo que cambia el equipo (el guerrero con escudo: espada, brigantina y escudo) | 2 | P1, P2, P3, P6 |
| `rueda-del-arma.test.ts` | las cifras de la rueda por niveles › cada nivel da su cifra de data/rueda.json, y por éxito Romper guardia y la Finta en enteros | 2 | P8 |
| `rueda-del-arma.test.ts` | las cifras de la rueda por niveles › la tabla de la ficha: seis filas sin Normal, con el nivel y lo que da | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | las cifras de la rueda por niveles › la Espada es la versátil (todo a 3) y la llevan la unidad y el héroe | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | las cifras de la rueda por niveles › las notas de la rueda dicen las cifras del arma de quien elige; Normal, sin modificar | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | cada golpe de la rueda va con su arma › la previsión de la rueda lo enseña antes de elegir, con las cifras del arma | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | cada golpe de la rueda va con su arma › la Finta de la daga (nivel 5) resta menos casillas que la de la espada (nivel 3) | 2 | P6 |
| `rueda-del-arma.test.ts` | cada golpe de la rueda va con su arma › con dos armas, cada tipo de la rueda es el de la mejor de las dos (25-10-2026) | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | cada golpe de la rueda va con su arma › la rueda que se abre en la página enseña las cifras del arma de quien elige | 2 | P6, P8 |
| `rueda-del-arma.test.ts` | la rueda teñida por el nivel del arma de quien pega (25-10-2026) › en las ruedas de 5 y de 3, un fusionado lleva la media truncada de sus partes | 2 | P6 |
| `rueda.test.ts` | el golpe con la rueda › `data/rueda.json` se valida diciendo el fichero y el campo | 2 | P8 |
| `rueda.test.ts` | el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada) › Rápido contra Fuerte: máximo, dos golpes de ×0,63; el contraataque, mínimo con Fuerte ×1,5 | 2 | P6, P8 |
| `rueda.test.ts` | el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada) › Fuerte contra Fuerte, el mínimo ×1,5: 30 × 10 × 0,9 × 1,5 = 405 | 2 | P6, P8 |
| `rueda.test.ts` | el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada) › Ofensivo suma tres puntos de ataque al golpe que se da: 37 × 10 × 0,975 = 360,75 → 361 | 2 | P6, P8 |
| `rueda.test.ts` | el daño fijo por el cruce (piqueros: A 5, D 9 → ×0,9; daño 30-40; 150 PV; con los niveles de la Espada) › con el doble golpe y Rápido, cuatro golpes | 2 | P3 |
| `rueda.test.ts` | los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito › Defensivo cubre ya el contraataque: 35 × 8 × 0,825 = 231, hasta que empiece su próximo turno | 2 | P6, P8 |
| `rueda.test.ts` | los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito › Romper guardia quita ataque según el éxito, ya en el contraataque: −3, −2, −1, 0 y 0 | 2 | P6, P8 |
| `rueda.test.ts` | los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito › Romper guardia sigue en el próximo turno del atacado y se va al terminarlo | 2 | P6, P8 |
| `rueda.test.ts` | los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito › dos Romper guardia seguidos refrescan, no se suman: queda el último | 2 | P6, P8 |
| `rueda.test.ts` | los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por éxito › sin contraataque, Romper guardia quita ataque igual: para su próximo turno | 2 | P6, P8 |
| `rueda.test.ts` | la respuesta no da bonificadores (#263): solo Fuerte y Rápido cambian el contraataque › Fuerte: 35 × 8 × 0,9 × 1,5 = 378; Rápido: dos de 35 × 8 × 0,9 × 0,63 = 158,76 → 159 | 2 | P6, P8 |
| `rueda.test.ts` | la Finta deja andar después de golpear (#263) › sin andar antes: le queda su velocidad menos lo del éxito, y solo puede andar o terminar | 2 | P6 |
| `rueda.test.ts` | la Finta deja andar después de golpear (#263) › después de andar: lo que le queda menos lo del éxito (el ejemplo: 6 − 2 − 2 = 2) | 2 | P6 |
| `rueda.test.ts` | la Finta deja andar después de golpear (#263) › un recorrido de antes de la Finta no vale después: la firma del turno la lleva | 2 | P6 |
| `rueda.test.ts` | la Finta deja andar después de golpear (#263) › los cinco éxitos restan, con la Finta de la Espada, 1, 2, 3, 4 y 5 | 2 | P6 |
| `rueda.test.ts` | la Finta deja andar después de golpear (#263) › sin casillas que andar, el turno se cierra solo y no sale nada | 2 | P6 |
| `rueda.test.ts` | sin carga, primero se anda y luego la rueda (13-10-2026); con carga, primero la rueda (31-10-2026) › con carga, de una vez o en dos jugadas, el mismo registro: el cruce, la carrera y el golpe que la cobra | 2 | P8 |
| `rueda.test.ts` | sin carga, primero se anda y luego la rueda (13-10-2026); con carga, primero la rueda (31-10-2026) › la previsión de la rueda, plantado con carga, es la de antes de plantarse: con la carga y desde la llegada | 2 | P8 |
| `rueda.test.ts` | sin carga, primero se anda y luego la rueda (13-10-2026); con carga, primero la rueda (31-10-2026) › soltar una carga la deja en su salida sin nada gastado, como antes de plantarse, y puede volver a cargar | 2 | P8 |
| `rueda.test.ts` | la carga la cobra solo el primer golpe (decisión del usuario, 14-10-2026) › Rápido cargando: el primero con la carga (+20 %) y el segundo sin ella, también en la previsión | 2 | P6, P8 |
| `rueda.test.ts` | la previsión de la rueda › cada sector, con su horquilla: Normal en el medio, los demás del mínimo al máximo | 2 | P6, P8 |
| `rueda.test.ts` | la previsión de la rueda › al golpear, Romper guardia dice su contraataque con cada éxito que lo rebaja (R3 de QA) | 2 | P6, P8 |
| `rueda.test.ts` | la previsión de la rueda › sin contraataque, las notas del golpe no lo prometen (H9) | 2 | P6, P8 |
| `rueda.test.ts` | la previsión de la rueda › con Romper guardia elegido, el contraataque previsto es menor y abarca el real | 2 | P6, P8 |
| `rueda.test.ts` | la previsión de la rueda › en la de 3, el «Rápido» rebaja el contraataque a medias, frente al golpe sin rueda | 2 | Q3 |
| `rueda.test.ts` | la previsión de la rueda › la previsión de un golpe elegido usa su sector y sus golpes | 2 | P6, P8 |
| `rueda.test.ts` | al responder, el golpe que viene (31-10-2026) › con la carga plantada y Rápido, el primero con la carga y el segundo sin ella, como se cobran | 2 | P6, P8 |
| `rueda.test.ts` | la IA elige a ciegas › reparte con los pesos de `data/rueda.json` (todos iguales: ~1/7 cada uno) | 1 | lectura |
| `rueda.test.ts` | el parte cuenta el cruce › nombra el efecto como la rueda de la batalla: en la de 3, el «Rápido» que quita ataque dice «Rápido» | 2 | Q3 |
| `rueda.test.ts` | el parte cuenta el cruce › «Romper guardia contra Defensivo: alto; contraataque bajo», y sin contraataque, sin él | 2 | P6, P8 |
| `rueda.test.ts` | la sesión de la arena con la rueda › con carga, la rueda dice la carga de sus cifras y Rápido va en dos líneas (R5, R6) | 2 | P6, P8 |
| `rueda.test.ts` | la sesión de la arena con la rueda › con carga y los dos bandos «Yo», la carga va en quien pega en las dos fases y en el desenlace, y al responder la lleva su golpe | 2 | P6, P8 |
| `rueda.test.ts` | la sesión de la arena con la rueda › Yo contra IA, con carga: el clic no corre y abre la rueda; elegir da el cruce, la carrera y el golpe | 2 | P1, P6, P8 |
| `rueda.test.ts` | la sesión de la arena con la rueda › Escape en una carga: no corrió, conserva el turno entero y puede volver a cargar | 2 | P6, P8 |
| `rueda.test.ts` | la sesión de la arena con la rueda › IA contra Yo: la IA se para en la respuesta, sin dejar ver su golpe | 2 | P6 |
| `rueda.test.ts` | la rueda pintada › cada nota dice cuándo actúa su efecto y, en la respuesta, que solo Fuerte y Rápido cambian el contraataque (#263) | 2 | P6, P8 |
| `rueda.test.ts` | las ruedas de 5 y de 3: piedra, papel o tijera, y las fusiones a la mitad › con la Espada (todo a 3), cada fusión da cada parte a la mitad | 2 | P6, P8 |
| `rueda.test.ts` | las ruedas de 5 y de 3: piedra, papel o tijera, y las fusiones a la mitad › Defensivo-finta deja andar la mitad de lo que dejaría la Finta, y pone la mitad de la defensa | 2 | P6, P8 |
| `salir-del-contacto.test.ts` | el panel › la ayuda de la carga dice las cifras de la carga, sin un «»3» fijo (C3 de QA) | 2 | P8 |
| `session.test.ts` | sesión del cliente: reclutar lo que cabe y ver la ruta entera › el liderazgo del héroe es lo que ocupa su ejército sobre su tope | 2 | P7, P9 |
| `session.test.ts` | el fin de partida cuenta la causa que selló el núcleo (I1 de la 2a) › la batalla que cierra la partida deja en la barra el desenlace con su causa (#162) | 2 | P3 |
| `session.test.ts` | los asaltantes que se ven y la marcha que se para (#130) › la sesión ve los grupos con la regla del núcleo, y la barra dice por qué se para el héroe | 2 | P2, P6, P8 |
| `session.test.ts` | los poderes de la tropa en la batalla del mapa (F6) › el monje de la persona usa Curar: el botón, el aliado que se elige y la jugada | 2 | Q4 |
| `session.test.ts` | la rueda y las defensas de la persona en la partida (F5) › una carga de la persona no corre hasta elegir: la rueda se abre con ella en su salida, y Escape no gasta nada (31-10-2026) | 2 | P1, P2, P6 |
| `session.test.ts` | la rueda y las defensas de la persona en la partida (F5) › la persona juega su defensa (#116): el turno del rival espera a que la cierre | 2 | P8 |
| `tropa-en-escena.test.ts` | repartir el equipo (C4, C5, C6) › quitarle el gambesón al héroe lo manda a la mochila y su armadura baja | 2 | P5 |
| `tropa-en-escena.test.ts` | repartir el equipo (C4, C5, C6) › ponérselo al tercer novato de un tipo se lo pone a ÉL, y la elección no salta (QA, H2) | 2 | P5 |
| `tropa-en-escena.test.ts` | repartir el equipo (C4, C5, C6) › un doble clic en «Poner» o en «×» juega una vez y no escribe un error (QA, H6) | 2 | P5 |
| `tropa-en-escena.test.ts` | repartir el equipo (C4, C5, C6) › una pieza a dos manos para quien lleva escudo de serie sale apagada con el motivo de `ponerseBlocker` | 2 | P5 |
| `tropa.test.ts` | liderazgo › reclutar por encima del liderazgo lanza con la frase, y no cobra nada | 2 | P7, P9 |
| `tropa.test.ts` | liderazgo › sin héroe en el pueblo se recluta a la guarnición, con su propio tope | 2 | P7 |
| `tropa.test.ts` | liderazgo › un héroe que entra en casa se lleva lo que le cabe, en orden, y el resto se queda | 2 | P7, P9 |
| `tropa.test.ts` | los datos garantizan que lo que cabe en un bando cabe en el tablero › la guarnición no pasa del liderazgo de un héroe recién contratado | 2 | R5 |
| `tropa.test.ts` | todos los lectores del ejército saben de personajes › un héroe con un personaje pasa de día sin lanzar | 2 | Q8 |
| `tropa.test.ts` | la IA de reglas juega dentro del liderazgo › el reclutamiento de la IA no pide más de lo que cabe | 2 | P7, P9 |
| `tropa.test.ts` | licenciar: cambiar tropa barata por otra mejor › la IA cambia lo barato por lo mejor cuando no cabe, y lo que pide es legal | 1 | lectura |
| `tropa.test.ts` | licenciar: cambiar tropa barata por otra mejor › y no licencia a nadie si lo que hay ya pega más que lo que se ofrece | 1 y 2 | P2 |
| `tropa.test.ts` | licenciar: cambiar tropa barata por otra mejor › no licencia lo que recluta en la misma jugada: recorre lo que se ofrece del más fuerte al más flojo | 1 | lectura |
