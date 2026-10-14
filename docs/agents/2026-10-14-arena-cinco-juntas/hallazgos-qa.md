# Hallazgos de QA: las cinco tareas de la arena juntas (14-10-2026)

Los informes de QA están en `docs/agents/2026-10-14-<tarea>/qa.md`, con sus capturas en `capturas/`:

| Issue | Tarea | Veredicto |
|---|---|---|
| #258, #261, #263 | `rueda-anillo-y-efectos` (cubre también `rueda-sectores-y-contrincantes`) | apto con reservas |
| #259 | `salir-del-contacto` | apto |
| #260 | `carga-para-todos` | apto |
| #262 | `armadura` | **hallazgos** |

Los hallazgos están deduplicados y cada uno lleva la decisión del coordinador.

**Reglas**:

- El juego no cambia: `pnpm banco` debe dar `066767b4…af995`.
- Lo que se toque de la IA tiene que dar lo mismo cuando no hay armadura. Las unidades del juego no tienen, así que el banco no se mueve.

## Importantes

### Q1. La IA elige blanco sin mirar la armadura (#262, criterio 4)

`bestTarget` (`src/core/ai/tactics.ts:~89`) puntúa la amenaza entre los PV sin el daño que llega. Lo usan el disparo y el golpe a quien ya alcanza. Desde #262 el jinete con barda tiene 80 PV, y la IA lo ve como el blanco más rentable.

Ejemplo, en 40 semillas: un goblin dispara al jinete con barda 40 de 40 veces, con 0 de daño medio. Antes disparaba al monje, con 14,9 por tiro.

**Arreglo**:

- La puntuación del blanco cuenta el daño que de verdad llega tras la armadura, a partir de `expectedDamage` o `trasLaArmadura`.
- Sin armadura tiene que salir exactamente el mismo número que hoy, para que el banco no cambie. Por ejemplo, un factor que solo existe cuando `armaduraDe(objetivo) > 0`.
- Test: el caso del goblin, que ahora dispara al monje, y el banco igual.
- Es la única excepción a «no se toca la IA», porque la pide el criterio 4 de la armadura.

### Q2. Un enlace viejo con el kit de siempre se abre sin aviso (#262)

Un enlace hasta la versión 8 con la brigantina, el arnés o la barda del kit se abre en silencio. Pero pelea otra pelea: el templario pasa de 150 PV a 80 y 7 de armadura.

**Arreglo**:

- Al leer un enlace de la versión 8 o anterior, si alguna unidad lleva una pieza de la arena que antes daba PV y ahora da armadura, sale un aviso con lo que cambia, por ejemplo: «Desde la versión 9 las armaduras de la arena dan armadura y no PV: el Guerrero con escudo tiene 80 PV y 7 de armadura (antes 150 PV)». Va en el mismo recuadro de avisos de lectura.
- El borrador del usuario no lleva versión y **no** avisa. Es el mismo cambio de regla que pidió el usuario, y se ve en la ficha.

## Menores, se arreglan

### Rueda

- **R1 (#258)**. El «ⓘ» de cada sector, de unos 13×13 px en la esquina de fuera, es un hueco muerto: no enciende el sector ni lo elige. Lo que se quiere:
  - con ratón, pasar por el «ⓘ» enciende su sector y abre la nota;
  - un clic de ratón en él elige el sector;
  - en una pantalla táctil, tocarlo abre la nota, como hoy.

  O se mueve el «ⓘ» donde no quite superficie. Lo decide el ingeniero. La pasada de capturas `rueda-contrincantes` mide la rejilla con el «ⓘ» incluido.
- **R2 (#263)**. Tras la Finta nada explica el tramo: la barra se queda vacía y la ayuda invita a golpear. Hace falta una línea en la barra o el panel: «Finta: puede andar N casillas; andar termina el turno».
- **R3 (#263)**. Antes de elegir no se ve cuánto baja R. guardia el contraataque. En la fase golpe, la nota o el sector de R. guardia dicen en cuánto quedaría el contraataque del rival con cada éxito, o al menos con el del cruce medio. Sale de `previsionDeLaRueda` (el núcleo ya lo calcula).
- **R4 (#261)**. En la ficha de solo lectura, «✎ Editar», las «×» y los desplegables parecen vivos aunque están apagados. Hay que darles el aspecto de apagados, o quitarlos de la ficha de solo lectura.
- **R5 (#260)**. En la rueda, «48–91 + 4–16» se sale del sector de Rápido y se come un dígito. Tiene que caber, o partirse en dos líneas dentro del sector, en escritorio y en móvil.
- **R6 (#260)**. La rueda que se abre tras una carrera no dice que sus cifras ya llevan la carga. Hace falta una línea en la cabecera o el pie: «con la carga de N casillas (+X %)». Con Escape, la barra dice «Golpe cancelado: se pierde la carga».

### Armadura

- **A1**. La barra de un hechizo resta la armadura, pero no lo dice: tiene que poner «−7 armadura», como el golpe.
- **A2**. «0 de daño: lo para la armadura (11)» se lee como si 11 fuera la armadura. Hay que decirlo claro, por ejemplo «0 de daño: la armadura (22) para los 11».
- **A3**. «Duplicar» una pieza del juego con PV la convierte a armadura en silencio: el Talismán vital pasa de +50 PV a +5 de armadura. Tiene que salir un aviso en el editor.
- **A4**. La frase de una pieza que queda con 0 de armadura suena rara. Y el editor no pone tope a la armadura: `1e3` entra como 1000. Va un tope razonable, validado en `validarPiezaDeArena`: el de las demás cifras de pieza, o 99.
- **A5**. El final de la Armadura en la tabla de cifras no lleva el tono de «cambia» (`paneles.ts:~905`).

### Contacto y carga

- **C1 (#259)**. Con un `?contacto=` o un `?golpe=` mal escrito, o repetido, junto a un `?montaje=`, la barra dice «la semilla o las reglas del enlace no valen». Tiene que nombrar el parámetro que falla (`montarDelEnlace`, `arena/main.ts`).
- **C2 (#259)**. Rodeado, la ayuda sigue diciendo «Haz clic en un hexágono verde» y no hay ninguno. Tiene que decir lo de `contactoBlocker`, o callar esa línea.
- **C3 (#260)**. La ayuda de la carga pone siempre «»3» de ejemplo, también con el jinete. Tiene que sacar el ejemplo de las cifras de la unidad, o no poner número.

### Barra

- **B1**. La barra de abajo crece 1 px cuando la previsión ocupa dos líneas, y con el «−N armadura» pasa más. Con el puntero en la frontera entre dos casillas, la casilla elegida oscila y el clic golpea desde la otra: la barra prometía cargar y el golpe salió sin carga.
  - La barra reserva su alto, para que el lienzo no se mueva al cambiar el texto.
  - Si el fallo es otro, por ejemplo que el clic usa una casilla distinta de la que enseña la barra, se arregla en la raíz: el clic usa la casilla que se enseña.

## No se tocan (con motivo)

- **Con Rápido, el segundo golpe cambia de arma**: el primero va con la lanza y la carga, y el segundo con la espada. Es «cada arma para lo suyo», decidido por el usuario: la lanza es solo para cargar. Se le dirá al usuario.
- **El guerrero con escudo anda 3 casillas y casi nunca está a 4 en recta**: es la regla que pidió el usuario (la recta de al menos 3 casillas). Se le dirá.
- **Las peleas con muralla de 3 contra 3 duran entre 54 y 85 rondas**: es de la IA del asalto y es anterior a estas tareas.
- **La previsión del hechizo de A1, si exige rehacer `PrevisionDeLanzar`**: va lo mínimo que diga «−N armadura».

## Cómo se cierra

- `pnpm verify` una vez por tanda.
- Al final, `pnpm banco` (mismo hash) y `pnpm capturas` con las pasadas de la arena (`CAPTURAS_SOLO`) que cubran lo tocado.
- `implementacion-qa.md` en esta carpeta.
- Un commit al final.

## Re-verificación (QA)

14-10-2026, sobre `fe0809a8`. Guiones y capturas en el scratchpad de la sesión,
`…/scratchpad/reverif/` (`cap/` y `capturas/`).

**Cómo**:

- `pnpm verify`, una vez: `Checked 364 files … No fixes applied.`, `Test Files 129 passed | 1 skipped`, `Tests 3259 passed | 14 skipped`, salida 0.
- Ni `verify:lento` ni `capturas`. El banco y la pasada `CAPTURAS_SOLO=…rueda-contrincantes…` del ingeniero son del mismo código (solo cambió después el `max="99"` del editor), así que se citan y no se repiten.
- Navegador: Vite propio en el **3420**, con `cacheDir` en el scratchpad, y Playwright sin pantalla con clics reales.
  - El borrador de la arena va por un plugin «sombra», con una copia en el scratchpad: el `data/borradores/` del repo no se lee ni se escribe. Su sha256 es `27f1c680…a7b8c` antes y después.
  - Vite se paró por su grupo y el 3420 quedó libre. El 3187 no se tocó.
  - Un espejo en Node (`SesionDeArena` + `EscenaBatalla`) solo traduce casillas a píxeles; la página aplica su propia jugada.
  - Consola sin errores ni avisos en todas las pasadas.

### Veredicto por punto

| Punto | Veredicto | Evidencia |
|---|---|---|
| **Q1** IA y armadura | **cerrado** | Repetido `ia.ts` (goblin contra el jinete con barda y el monje, s1-40): **al monje 40 de 40, 14,9 de daño por tiro**; al jinete, 0. Barrido nuevo (`ia-azar2.ts`): 200 peleas IA contra IA, tres contra tres de las 34 hojas, 100 al azar y 100 con la rueda; 32 hojas llevan armadura en su kit. **0 errores y 0 sin terminar.** Hubo 1 477 tiros y 1 726 golpes, y **ninguno con daño medio 0 cuando otro blanco del mismo tipo de jugada (disparo, o golpe sin moverse) sí recibía algo**. Ver IA2, abajo, para el caso que queda. |
| **Q2** aviso de los enlaces viejos | **cerrado** | Página: un enlace de la 8 con el guerrero y el hermano de carga muestra «Al leer lo de antes · 3 avisos» con «Desde la versión 9 las armaduras de la arena dan armadura y no PV: «Guerrero con escudo» tiene 80 PV y 7 de armadura (antes 150 PV); «Hermano de carga…» tiene 80 PV y 22 de armadura (antes 300 PV).». La 9 con lo mismo no avisa, y la 8 con monje y sacerdotisa (sin armadura) tampoco. En el núcleo (`q2.ts`): una brigantina propia del enlace avisa una sola vez (la frase de la pieza, sin el aviso de Q2); la misma unidad en dos puestos avisa una vez; sin la brigantina, nada. Ver Q2b. |
| **R1** «ⓘ» de los sectores | **cerrado** (táctil: ⚠️ no probado en un dispositivo) | Escritorio (`hover: hover`, `pointer: fine`): `elementFromPoint` en el centro del «ⓘ» de Fuerte da el `BUTTON` del sector. Pasar el ratón enciende `fuerte` (`:hover`) y abre su nota («Daño ×1,25.»), con `cursor: pointer`. El clic eligió Fuerte: la rueda giró, «Fuerte contra Rápido». **Teclado**: con Tab el foco llega a la `nota` de Fuerte y su bocadillo se abre (`::after` con texto). Táctil emulado (`hasTouch`, la media no casa): el «ⓘ» es `SPAN.nota`, tocarlo no elige y le da el foco. En Chromium sin pantalla un toque no deja `:hover`, así que no se ve el bocadillo: es lo mismo que antes del arreglo, que no tocó esa rama. Medida del ingeniero: 57 puntos en escritorio y en móvil. |
| **R2** tras la Finta | **cerrado** | Guerrero contra orko con dos armas, rueda, s5: tras «Finta contra Romper guardia», el panel dice «Finta: puede andar 2 casillas; andar termina el turno. Espacio termina el turno de la unidad.», con «Le quedan 2 casillas» (`cap/r2-tras-finta-templario-escudo.png`). |
| **R3** R. guardia | **cerrado** | `aria-label` del sector: «… Su contraataque (con Normal, 0–15) queda, según el éxito, en: máximo, 0–12; alto, 0–13; medio, 0–14.» La frase se entiende. «(con Normal, …)» quiere decir «si golpeas con Normal», y se lee bien al lado de la del sector. |
| **R4** ficha de solo lectura | **cerrado** | Desde la cabecera de la rueda: «✎ Editar», los `select` «— elige —» y las «×», a `opacity 0.4` y `cursor: default`; las cifras, sin caja (`cap/r4-ficha-solo-lectura.png`). Se lee como apagada. |
| **R5** Rápido con carga | **cerrado** | A 1440: «52–98» y «+ 4–16» en dos `.da`, con `scrollWidth` igual a `clientWidth` (41/41 y 49/49), dentro del sector (`cap/r6-rueda.png`). A 390 no se probó (ver «No probado»): el ingeniero lo midió. |
| **R6** la rueda dice la carga | **cerrado** | Pie: «Las cifras llevan la carga de 5 casillas, +50 %; con Esc se pierde.». Con Escape, la barra dice «Golpe cancelado: se pierde la carga.». En el segundo intento ya no hay carga (Rápido «2 × 4–16») y el golpe sale sin ella. |
| **A1** el hechizo dice la armadura | **cerrado** | Barra: «Flecha mágica: 193 de daño (−7 armadura), caería 1 y no le quedaría nada.». Hecho: `parado: 7`. Parte: «… 193 de daño (−7 armadura), 1 baja». |
| **A2** «la armadura para los 11» | **cerrado** | En el parte de una pelea real: «Guerrero con escudo → Hermano de carga (contraataque): 0 de daño: la armadura para los 11». **Se entiende**: el 11 ya no se toma por la armadura, y el motivo de no escribir la cifra (un retoque a media pelea la falsearía en las líneas de antes) es bueno. Queda una ambigüedad leve: «para» se puede leer como preposición. «la armadura detiene los 11» la quitaría. No es un hallazgo. |
| **A3** «Duplicar» avisa | **cerrado** | Editor: el Talismán vital da «… En la arena una pieza no suma PV: los 50 PV de «Talismán vital» pasan a 5 de armadura, que se resta del daño de cada golpe.», y el Hacha de leñador, «los 10 PV … pasan a 1 de armadura». Una copia de una copia y la brigantina se duplican sin aviso, como debe ser. |
| **A4** el 0 y el tope de 99 | **cerrado** | Casilla con `min="0" max="99"`. Al escribir 150 sale «No se cambia: «Talismán vital 2»: la armadura va de 0 a 99 y es 150.», con 1e3 sale «… y es 1000.», con 100 se rechaza, y 99 se acepta. En el núcleo: −3, 2,5 y «5» se rechazan. Una pieza vieja de 4 PV dice «no llegan a un punto de armadura, así que ya no protege». Ver A4b. |
| **A5** tono del final | **cerrado** | Guerrero: `<output class="cambiada" data-final="armadura">7</output>`; PV, `class="igual"`. En la ficha desde la rueda, el arnés del orko sale en verde (`cap/a5-ficha.png`, `cap/r4-ficha-solo-lectura.png`). |
| **C1** el parámetro que falla | **cerrado** | La barra dice «… del enlace no vale» con «?contacto=» mal, y «… no valen» con golpe y contacto mal. Con `contacto=paga` repetido nombra «?contacto=»; también nombra «?seed=abc» y «?reglas=zzz». Con los cuatro mal, ««?seed=», «?reglas=», «?golpe=», «?contacto=» del enlace no valen». Sin `?montaje=`, solo sale el aviso del modo. |
| **C2** rodeado | **cerrado** | `?seed=3&contacto=paga`, el troll contra zombis y esqueletos, ronda 6: el panel dice «Rodeado: …» y la ayuda solo «Pasa el ratón por un enemigo a su lado para golpearlo.». Un clic en lo libre pone «Rodeado: …» en la barra. |
| **C3** ejemplo de la carga | **cerrado** | Jinete: «… elige la casilla con «»» y las casillas que corre (de 3 a 5, +10 % cada una).»; a pie (guerrero): «(de 3 a 5, +5 % cada una)». Sale de las cifras de quien carga. La frase es algo enrevesada, pero se entiende. |
| **B1** la barra no crece | **cerrado** | `#statusbar` mide **54,39 px** sin texto, con una línea y con dos, a 1440, 1280, 1100 y 1024. El lienzo se queda en 773,23 px de alto al pasar de la carga a una casilla verde y volver. **Tres líneas no pueden darse**: `#status` lleva `line-clamp: 2`. Ver B1b. |

### Hallazgos nuevos

Ninguno es bloqueante, y ninguno sale de un arreglo mal hecho: son bordes que los arreglos dejan a la vista.

- **B1b (menor; experiencia, armadura criterio 2). En una ventana estrecha, la barra corta justo «−7 armadura».**
  - La reserva de B1 es de dos líneas y `#status` se corta a dos. A 1024 px, con «Avisos al leer (N)» a la derecha, la previsión de una carga ocupa tres. Lo que se pierde es el final de «Cuenta: …», que es donde va la armadura: «… carga de 5 casillas ×1,5; −7…», con `scrollHeight` 59 frente a `clientHeight` 39 (`cap/b1-1024-barra.png`). A 1100 px o más cabe.
  - **Reproducir**: `pnpm arena` a 1024 de ancho, `?seed=5`, el hermano de carga contra el guerrero con escudo. Defender hasta que haya carga y pasar el ratón por el guerrero.
  - **Qué esperaba quien juega**: ver el «−7 armadura» que explica por qué el daño baja. Sin arreglar la raíz de B1, valdría poner el texto entero en un `title` o en `aria-description`, o poner la armadura antes de «Cuenta».
- **IA2 (menor; Q1 en su borde). La IA golpea por 0 al único enemigo pegado a ella, que la armadura para entera, aunque pueda andar hasta otro al que sí hiere.**
  - `bestTarget` solo compara entre los que ya alcanza. Si el único que alcanza tiene armadura de sobra, su valor es 0, pero sigue siendo el «mejor», y la rama de «acercarse a otro» (`aQuienIr`) no llega a mirarse.
  - En el barrido: 10 golpes de 1 726, todos contra barda (22). Por ejemplo, con azar y la semilla 49 de `ia-azar.ts`: el monje, en (7,4), pegado al hermano de carga, le da por 0 en vez de ir a por el asesino (armadura 7, recibe el 61 %). Otros casos: un goblin arquero o un ballestero, sin poder disparar, contra el jinete de hiena.
  - **Arreglo posible**: si el mejor que se alcanza tiene `fraccionQueLlega` 0, que la IA pase a `aQuienIr` como si no alcanzara a nadie. Sin armadura no cambia nada, así que el banco no se mueve.
- **Q2b (menor). El «antes» de Q2 se queda corto si la unidad lleva a la vez una armadura del kit y una pieza propia del enlace que daba PV.**
  - El guerrero con la brigantina del kit y un amuleto propio de 50 PV (enlace de la 8) dice «tiene 80 PV y 12 de armadura (antes 150 PV)». En la versión 8 tenía 200 PV, porque el amuleto daba sus 50.
  - Los 12 de armadura sí son los de hoy. El aviso de la pieza propia sale aparte y bien, así que solo falla la cifra de «antes».
- **A4b (menor). Una pieza de antes de la 9 con 995 PV o más sale inválida con un motivo que habla de una armadura que nadie escribió.**
  - El ejemplo es una pieza de 1 500 PV: «la armadura va de 0 a 99 y es 150». Antes del tope se convertía, con su aviso.
  - En el borrador del usuario no hay ninguna así: no tiene `equipo.json`, y la barda, la mayor de antes, daba 220. Lo único que falta es que el motivo diga de dónde salen los 150 (los PV de antes).

### Observaciones (no son hallazgos de esta tanda)

- **La armadura frente a los tiradores flojos.** En el barrido, **549 de los 1 477 tiros de la IA (37 %) tienen daño medio 0 y ningún blanco mejor**: los tiradores flojos contra unidades con barda o arnés. Es el «Equilibrio: se mide después» de los requisitos de #262, ahora medido. La IA sigue disparando por 0 en vez de defender; eso es decisión de diseño.
- **Rueda y armadura juntas**: 100 peleas con la rueda en el barrido, sin errores y todas terminadas. Los 10 golpes por 0 de IA2 salen igual con la rueda que al azar.
- **El móvil a 390 px**: en la batalla de la arena, el lienzo mide 860 px de ancho en una ventana de 390, y el enemigo queda fuera de la vista (`cap/movil-tras-clic.png`). Es de antes de estas tareas. Por eso el guion propio no pudo abrir la rueda en el móvil, y la medida táctil se cita de la pasada del ingeniero.
- **El recuadro de avisos del borrador**: con el borrador del usuario (2 avisos), el recuadro «Al leer lo de antes» se abre solo encima de la parte baja del lienzo y del pie de la rueda (`cap/r6-rueda.png`) hasta que se pulsa «Entendido». Es de antes de estas tareas.

### No probado

- El bocadillo del «ⓘ» al tocarlo en un dispositivo táctil real: en Chromium sin pantalla un toque no deja `:hover`. Esa rama no cambió.
- R5 a 390 px en mi propio guion. Lo mide la pasada del ingeniero.

### Veredicto

**Apto con reservas.** Los 18 puntos (Q1, Q2, R1-R6, A1-A5, C1-C3 y B1) están cerrados, y A2 se entiende sin la cifra. Las reservas son cuatro menores nuevos (B1b, IA2, Q2b y A4b). Ninguno bloquea; el que más se nota jugando es B1b.
