# QA del clima, vuelta 2 (22-10-2026)

Sobre HEAD `021dab01` (tres commits sobre `ad655e51`: `03bc4f6d`, `3dde368e`, `021dab01`). Solo
los criterios que tocan H1, H2, H4, H5, H6, H7, H8 y H9, y una pasada adversarial nueva sobre lo
que cambió. H3 se acepta (decisión del coordinador): comprobado que está dicho en la cabecera de
`core/state/clima.ts` y en `CLAUDE.md` («la noche va con el dueño de AHORA», con el 10,9 % y el 44 %).

Método: el vite del ingeniero en `http://localhost:3171` (no tocado), Chromium 1208 sin pantalla
de Playwright, sondas mías en el scratchpad (no en el repo). Capturas de esta vuelta en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-clima-69dcf3/910793de-6879-45cf-a9db-30e64edeabb4/scratchpad/png2/` (abajo, `png2/…`); las de la vuelta 1, en `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-clima-69dcf3/910793de-6879-45cf-a9db-30e64edeabb4/scratchpad/png/` (`png/…`).
`tools/qa/clima.ts --sin-fps` corrido por mí sobre este HEAD, con sus PNG en `png2/cache/`.

## Veredicto de la vuelta 2: **Apto**

Los ocho hallazgos que se mandaron arreglar están arreglados y lo he visto con evidencia propia.
Quedan dos menores nuevos (H10, H11), de dirección de arte, que no bloquean.

## Criterios re-verificados

| Hallazgo · criterio | Veredicto | Evidencia |
|---|---|---|
| **H1** · 9: un pedido mal tipado no tumba el turno | ✅ | `pnpm verify` incluye el test de punta a punta (`agent-link.test.ts`, «un pedido de clima mal tipado se descarta solo…», verde). Además, una sonda mía **por el cable de verdad** (`AgentLink` + `Director` + un agente por WebSocket, `v2/h1.mts`), con casos que el test no tiene: `weather: null`, `weather: "tormenta"`, `weather: {at, weather}` (objeto suelto), y una lista con `at: "10,10"`, `at: {x: 10.5}`, `days: 0`, `days: 4`, `days: 1e300`, `night: 1`, `weather: ""`, `"LLUVIA"`, `null`, un texto de 5 000 letras, una entrada que es lista, una casilla fuera del mapa y una región repetida. En los cuatro turnos: `by=agent actions=1`, la construcción entra, cada entrada mala sale en el veredicto con su motivo (p. ej. «weather n.º 2: "at" es una casilla { "x": N, "y": N } con dos enteros, y llega {"x":10.5,"y":10}», «days 1e+300: un entero de 1 a 3 días», el texto largo recortado a 40 letras con «…») y la buena entra: «Clima: tormenta y de noche en Tierras de Valdeluz hasta el día 2», `climaPedido` = `{"region-0":{"tiempo":"tormenta","noche":true,"hasta":2}}`. `pnpm qa`: citado en verde por el ingeniero sobre `3dde368e` (el commit de después solo toca `CLAUDE.md`); no lo repito. |
| **H2** · 10/4: las figuras de la base, la morada y la batalla, de noche | ✅ | Base (`png2/cmp-base-figuras.png`: día, noche, tormenta de noche): los vecinos del Y Bot pasan de dorado brillante a oliva apagado, el héroe toma el azul; la morada (`png2/morada-noche.png`): los tres reclutas teñidos y el aro amarillo sin teñir; la batalla de la arena (`png2/cmp-batalla-figuras.png`, `png2/cmp-batalla-orkos.png`): figuras teñidas, chapas, barras, nombres, aros y casillas encima sin teñir. **Una batalla de la partida de verdad**: semilla 13429, no muertos, `?clima=tormenta,noche`, el rival ataca el día 3 y la defensa sale de noche con tormenta (`png2/p-f04-batalla-dia4.png`; frente a la de la vuelta 1, `png2/cmp-partida-noq2.png`): los esqueletos se leen por su silueta y todo lo de encima va claro. El espectador cuenta la misma noche (`png2/hoja-esp.png`). |
| **H4** · 3: la noche que se mira frente al velo de lo que no se mira | ✅ | La misma partida y la misma ruta de la vuelta 1 (semilla 7, `region-5:noche,region-0:noche`, el héroe de vuelta en su base el día 3; `png2/cmp-h4-v1-v2.png`). Medido en las mismas cajas: noche que se mira, luz 44,9 / 44,4 y azul−rojo +18 / +22 en la vuelta 1 → **73,4 / 77,9 y +59 / +71** ahora; la región de al lado de día y sin mirar, 36,4 → 37,8 y azul−rojo 0 → +3 (el velo no se ha tocado). Ahora se distinguen por la luz (casi el doble) y por el tono. Con `dia,` delante, lo mismo (73,4 / 75,8 frente a 38,0). `clima.ts --sin-fps`: lo inexplorado con cada clima, 0 píxeles cambian más de 24 (el que más, 9). |
| **H5** · 8: `?clima=` malo con el menú, al cargar | ✅ | `/?clima=granizo`, `/?clima=dia,noche`, `/?clima=lluvia&clima=niebla`, `/?clima=region-0:`, `/?clima=Region%201:lluvia` y `/?clima=region-0:granizo`: «La página no arranca» al cargar, sin enseñar el menú, cada uno con su motivo y «quita "?clima=…"». Con dos cosas malas (`?seed=abc&clima=granizo`, `?faccion=xx&clima=granizo`), las dos dichas. `/?clima=region-99:lluvia` enseña el menú y lo dice al abrir la partida (lo que depende del mapa, como se decidió). |
| **H6** · 8: una región que no existe pide quitar solo `?clima=` | ✅ | `/?seed=7&clima=region-99:lluvia` → «en este mapa no hay "region-99": hay region-0…region-9 — quita "?clima=…" de la barra de direcciones», sin nombrar la semilla. Igual tras «Partida rápida» desde el menú, con `seed`, `faccion` y `heroe` en la URL. |
| **H7** · 4: la lluvia del mapa se ve | ✅ | 390×844 a dpr 3, la misma casilla con tormenta en la vuelta 1 y ahora (`png2/cmp-h7-movil.png`): las gotas pasan de hilos de un píxel de dispositivo a trazos de tres, más claros; se ve que llueve sin tapar al héroe, su chapa ni su aro. |
| **H8** · 10: el cielo de tormenta y el de noche | ✅ | Arena (`png2/cmp-cielos-a.png`: día, noche, tormenta de noche; `png2/cmp-cielos-b.png`: lluvia, niebla, niebla de noche): la noche despejada es azul con luna y estrellas, recortadas por los árboles; la lluvia y la tormenta de día, gris pizarra con nubes bajas; la niebla de noche, la luna velada. En la partida (`png2/p-f04-batalla-dia4.png`) y en el espectador (`png2/hoja-esp.png`, una batalla real del servidor con `?clima=tormenta,noche`, `despejado,noche` y `lluvia,dia`), los mismos cielos. Con tormenta de noche el cielo es azul marino con nubes apenas visibles: se distingue de la noche despejada por no llevar luna ni estrellas, y por la lluvia (lo dice el ingeniero en «Qué NO queda cubierto»; lo doy por suficiente). |
| **H9** · 6: rendimiento por la mediana | ✅ | `npx tsx tools/qa/clima.ts --solo-fps --escenas=mapa --climas=despejado,noche;<mezcla>`, 13:01-13:04, carga de 9,2 bajando a 4,0, 2560×1440, el mapa al tope de alejar arrastrando, seis ventanas por clima: **noche 58,2 fps frente a 59,4 del despejado de día (−2,0 % por la mediana; CPU 10,6 → 12,7 ms)**, **mezcla 57,2 (−3,6 %; CPU 15,8 ms)**; «todo en orden». En la vuelta 1, medido igual, la noche perdía un 22 % y un 11 %. Batalla y base (`--escenas=batalla,base --climas=despejado,noche;tormenta,noche`, 13:04-13:06, carga 3): batalla −0,0 % y −0,1 % (CPU 14,0 → 13,6 y 14,7 ms), base +0,3 % y +0,2 % (CPU 7,5 → 10,4 y 11,0 ms). |

`pnpm verify` (mío, una vez, 12:59-13:01, carga subiendo de 3 a 20): `Test Files 158 passed | 1
skipped (159) · Tests 3839 passed | 12 skipped (3851)`, exit 0, 87 s. `pnpm banco`: citado del
ingeniero sobre `3dde368e` (`b9dbd8a1…`, «ancla: igual»); no lo repito.

## Pasada adversarial (lo que cambió)

- **Golpes y muertes de noche** (arena, IA contra IA, `despejado,noche`, 70 fotogramas a ~180 ms,
  `png2/hoja-golpe.png`): el monje cae y queda en el suelo teñido de noche como el resto; el destello
  del golpe sigue (suma luz sobre la celda teñida). Sin errores en la consola.
- **La rueda de noche** (`png2/rueda-noche.png`, `png2/hoja-rueda-tras.png`): se lee entera; las
  figuras del tablero van teñidas y los retratos de la cabecera no (son interfaz). El giro, el
  marcador y «¡Parado! Mínimo» se cuentan igual.
- **Noche con zoom y dpr 1,5 / 2 / 3** (1280×800, `png2/hoja-mapa-dpr-noche.png`): la luz guardada
  sigue al mundo al acercar, alejar y arrastrar; sin costuras ni saltos. Fotogramas: 60 fps en todo
  (el reloj de la pantalla manda). CPU por fotograma a 1920×1080 dpr 2 con el zoom cerca, arrastrando:
  día 8,6 ms (mediana de 6 ventanas), noche 11,9 ms (+3,3 ms, 60 fps casi siempre). En la batalla a
  1920×1080 dpr 2 (6 unidades quietas): día 42,3 fps / 24,5 ms, noche 40,2 fps / 26,1 ms (−5 %; el
  día ya no llega a 60 a esa densidad sin GPU). Dentro del 10 %, fuera de lo que mide el criterio.
  En consola, solo el aviso de siempre del suelo a dpr alto («se pinta a 133 px por casilla…»), que
  no es del clima.
- **Cielos en partida, arena y espectador**: arriba (H8). El espectador, con una batalla del
  servidor de verdad (`v2/espectador.mts`: `arrancarServidor` + la política de `pnpm qa`; el
  servidor parado al acabar).
- **`despejado,dia`**: `/?seed=7&clima=despejado,dia` abre sin errores; con el menú, «Partida
  rápida» conserva `clima=despejado,dia` en la URL; en la arena, sin aviso. `dia,noche` se rechaza
  en la partida (al cargar) y en la arena (en la barra, y la arena sigue). `region-0:noche,dia` vale.
- **`?clima=` en el menú**: arriba (H5, H6). `/?clima=` vacío deja `clima=` vacío en la URL tras
  empezar (cosmético, no rompe nada).
- **Pedidos raros por el cable**: arriba (H1).

## Hallazgos nuevos

### Bloqueantes e importantes

Ninguno.

### Menores

**H10 · De noche, el héroe dentro de su ciudad queda quemado por el fuego de la ciudad.** El
resplandor de la ciudad (más fuerte desde H4: 0,6 → 0,72) cae justo donde nace y se para el héroe, en
el medio del recinto. A dpr 3 con el zoom cerca (`png2/cmp-dpr3-heroe.png`, día a la izquierda, noche
a la derecha), la caja del héroe pasa de media 126/91/72 a **239/185/129**, con el rojo saturado
(máximo 255) y su contraste en rojo de 55 a 23: el caballero se ve blanco-amarillo, sin el dibujo de
su sobreveste. Al zoom de inicio en dpr 1,5 (`png2/cmp-dpr15-inicio.png`) pasa lo mismo, menos. La
chapa «A» y el aro se siguen leyendo, y fuera de la ciudad el héroe va bien. Reproducción:
`/?seed=7&faccion=templarios&clima=despejado,noche`, «Volver al mapa», acercar con la rueda. Lo que
esperaba quien juega: ver a su héroe de noche iluminado por el fuego, no fundido en él.

**H11 · La noche del mapa ya casi no oscurece: se lee por el azul y los fuegos.** Con la luz que se
suma (H4), el mapa entero de noche (`png2/cache/mapa-noche-entero.png`) tiene L* 27,8 frente a 29,6 de
día (−6 %; luz Rec. 709 65,7 frente a 68,7), cuando la base oscurece un 19 % y la batalla un 27 %
(L* 41,9 → 34,1 y 51,0 → 37,3). Se lee como noche de luna (`png2/hoja-mapa-enteros.png`) y no se
confunde con el velo (H4), así que no lo llamo fallo; pero el requisito dice «la escena se oscurece»,
y en el mapa la noche es sobre todo un cambio de tono. Hay margen entre la noche que se mira (73-78) y
el velo (38) para bajarla algo si el usuario la quiere más oscura.

## Workarounds usados

- `?clima=` para forzar cada efecto (la puerta prevista, criterio 8).
- La arena para las batallas de cada clima; la herencia de región en la partida, con la defensa real
  de la semilla 13429 forzada a `tormenta,noche`.
- Un servidor propio para la batalla del espectador (lo levanta y lo para `tools/qa/servidor.ts`).
- Ninguno afecta a quien juega.

## No probado en esta vuelta

- 4K, `verify:lento` y `pnpm capturas` entero (fuera del presupuesto de esta re-verificación).
- La noche de la semilla (sin `?clima=`) en una partida larga, y la partida terminada con clima.
- `pnpm qa` y `pnpm banco`: citados del ingeniero.

---

# QA del clima (22-10-2026)

Rama `claude/clima-69dcf3`, HEAD `ad655e51` (7 commits sobre `e9a3c595`). Probado contra la
petición literal («Efectos como niebla, lluvia, rayos... Tanto en el mapa como en los escenarios de
combate y de rpg») y los criterios 1-11 de `requisitos.md`, con las decisiones del usuario (por
región, el narrador lo pide, la noche narrativa y más frecuente en tierras de no muertos).

Método: el vite del ingeniero en `http://localhost:3171` (no tocado), Chromium 1208 sin pantalla de
Playwright, sondas propias en el scratchpad (no en el repo). Partida real desde el menú, la arena,
el espectador (con `tools/qa/clima.ts --solo-espectador`, que levanta y para su propio vite y
servidor), y sondas en Node contra `core` para lo que no se ve. Las capturas mías están en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-clima-69dcf3/910793de-6879-45cf-a9db-30e64edeabb4/scratchpad/png/`
(abajo, `png/…`); las del ingeniero, en `.cache/clima/` (abajo, `cache/…`).

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Niebla, lluvia, tormenta con rayo y noche, y despejado, en el mapa, el combate y la escena lateral (base y morada) | ✅ | Mapa: `cache/mapa-{niebla,lluvia,tormenta,noche,mezcla}*.png`, y `png/a-rayo-mapa.png` (el rayo del mapa, que el ingeniero no había fotografiado: un trazo con su resplandor local en el borde izquierdo, luz media 60,2 → 67,6 en 196 capturas de 40 s). Combate: la arena (`png/c-arena-tormenta.png`, `cache/batalla-*.png`, el rayo en `cache/batalla-tormenta-rayo.png`) y **una batalla de la partida de verdad**: semilla 13429 (no muertos), sin `?clima=`, el rival ataca la base el día 3 y la defensa sale con la lluvia de su región, `region-0` = lluvia ese día según `core` (`png/f04-batalla-dia4.png`). Base: `png/f01-base.png` (lluvia de la semilla), `cache/base-*.png`. Morada: `cache/morada-{lluvia,noche}.png`. |
| 2 | Determinista; lo del agente es presentación; el espectador ve lo mismo; sin `Math.random`; el taller no pinta clima | ✅ | `pnpm banco` sobre este HEAD, citado de `implementacion.md`: `b9dbd8a1…`, «ancla: igual» (no lo repito: nada cambió desde entonces). Ningún `Math.random` ni reloj en `render/clima/` ni en `state/clima.ts` (grep); ningún cambio en `tools/taller/` ni en `assets/`. Lo pedido va a `GameState.climaPedido` y a `Director.log`, no a `state.log`. El espectador saca el clima del cable con la misma cuenta (`test/espectador.test.ts`, `pnpm qa`). |
| 3 | No se confunde con la niebla de guerra; por debajo de ella; por región con frente | ✅ (con una reserva, H4) | La niebla del clima es blanca y a bancos; lo inexplorado sigue negro: alejado al tope en 1920×1080 con la mezcla, el clima acaba donde acaba lo explorado (`png/a-zoom-alejado.png`); el borde blando de la niebla de guerra se funde igual con niebla que sin ella (`png/v-niebla-borde.png` frente a `png/v-despejado-borde.png`). Lo que no se mira lleva el mismo velo: luz media 35,5 → 35,3 con noche al lado y 62,8 con niebla (la niebla aclara debajo del velo, y el velo sigue oscureciendo en la misma proporción: 98 → 63 dentro del fotograma). Frente ondulado en `cache/mapa-mezcla-entero.png` y en el espectador (`png/esp/espectador-tormenta-del-narrador.png`). Píxeles de lo inexplorado con cada clima, medidos por el ingeniero: 0 cambian más de 24. |
| 4 | No estorba: figuras, chapas, ruta, casillas, interfaz; no recibe clics; el destello es breve y no ciega | ✅ | El mismo clic en el mapa con despejado, tormenta, niebla, noche y la mezcla: el mismo «Ruta: llegas hoy (3 pasos)» al pasar el ratón y el mismo movimiento tras andar, 1197 / 1482, en los cinco (`png/c-ruta-*.png`, `png/c-andado-*.png`). En la arena, el mismo clic mueve al monje con despejado y con tormenta (`png/c-arena-*.png`). Chapas, banderas, nombres y barras, encima del clima. El rayo es local (un resplandor de unas casillas en el mapa, una zona del cielo en la batalla). |
| 5 | `prefers-reduced-motion: reduce`: sin destellos ni partículas rápidas; el tiempo se sigue notando | ✅ | Diez fotogramas a 700 ms: base con tormenta, lluvia y niebla, diferencia media 0 y nada se enciende; mapa con lo mismo, 0,09-0,11 de media y 0,014-0,024 % de píxeles que suben más de 60 (las figuras que respiran). La lluvia queda pintada quieta (`png/a-reducido-base-tormenta.png`) y la niebla, quieta (`png/a-reducido-mapa-niebla.png`). La batalla, medida por el ingeniero: 0,00 y 0,00 %. |
| 6 | Rendimiento en 2560×1440 (mapa al tope arrastrando, batalla, base) ≤ 10 % menos fps; 4K con el presupuesto | ⚠️ cumple con el método de la herramienta, no con la mediana (H9) | `npx tsx tools/qa/clima.ts --solo-fps --escenas=base,mapa --climas=lluvia;noche;mezcla`, 22-10-2026 11:05-11:24, carga 4: tabla de la herramienta (el mejor de tres ventanas) mapa lluvia −2,3 %, noche −4,1 %, mezcla −4,8 %; base lluvia −0,4 %, noche −0,7 %, mezcla −0,3 %; «todo en orden». Pero la CPU por fotograma del mapa de noche sube de 13,5 a 19,5 ms, y las ventanas de noche dan 55,1 / 44,4 / 44,9 y 55,9 / 46,1 / 50,4 fps frente a 57,6 / 55,6 / 58,3 y 56,4 / 55,9 / 56,7 del despejado: por la mediana, −22 % y −11 %. La batalla no la medí (el ingeniero: −0,0 a +0,7 % en la última pasada). |
| 7 | Sin arte de pago | ✅ | `git diff e9a3c595..HEAD --stat -- assets/ tools/gen/`: nada. Todo procedural. Sin el arte (imágenes bloqueadas), el clima se pinta sobre los marcadores sin una excepción (`png/a-sinarte-{mapa,base}-*.png`; en la consola, solo los avisos de lo que se bloqueó). |
| 8 | `?clima=` en la partida, la arena y el espectador; lo que no existe se rechaza diciéndolo | ✅ (con dos menores, H5 y H6) | Partida: `granizo`, `Lluvia`, `lluvia,`, `noche,dia`, `lluvia,niebla`, `region-0:`, `Region 1:lluvia`, `region-99:lluvia` y `clima` repetido no arrancan y dicen por qué y qué quitar; `?clima=` vacío es no pedir; `%20lluvia%20` vale. Arena: `region-0:lluvia` y `granizo` se dicen en la barra y la arena sigue (`png/u-arena-region.png`). Espectador: `granizo` se dice en la barra. Por el menú: `/?clima=tormenta` → «Partida rápida» o «Nuevo juego» conserva el clima en la URL y lo aplica. |
| 9 | El narrador pide tiempo y noche por región; lo que no vale se descarta con su motivo; lo vigila `pnpm qa` | ✅ con un hallazgo importante (H1) | `pnpm qa` sobre este HEAD, citado: la tormenta pedida entra, «granizo» se rechaza con su motivo y el espectador ve tormenta en Tierras de Cripta Gris. Lo que el esquema no deja pasar, en cambio, **tumba el turno entero**, no el pedido (H1). La prosa dice que es presentación, cómo se pide, los topes y que los no muertos son más nocturnos. |
| 10 | La batalla y la escena lateral heredan la región; la tropa sin clima; el cielo cambia | ✅ | Batalla de la partida con la lluvia de su región (fila 1). La base es la región de su ciudad (`climaDeLaBase` → `town.at`). La tropa con `?clima=tormenta,noche`: el atardecer de siempre, sin lluvia (`png/a-tropa-tormenta-noche.png`). El cielo: atardecer despejado, azul oscuro con lluvia y tormenta, azul de noche, gris con niebla (`cache/batalla-*.png`). |
| 11 | Cierre: `verify`, capturas, servidor con URL, commit en la rama | ✅ | `pnpm verify` (mío, una vez): `Test Files 158 passed \| 1 skipped (159) · Tests 3836 passed \| 12 skipped (3848)`, exit 0, 97 s. Capturas de los tres escenarios con cada efecto en `.cache/clima/`. Servidor en `http://localhost:3171` (PGID 324008). Siete commits en la rama, sin fusionar; `docs/agents/2026-10-22-clima/` sin commitear. |

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

**H1 · Un pedido de clima mal tipado tumba el turno entero del narrador, no solo su pedido.**
`adventureTurnResponseSchema.weather` valida tipos y topes en el esquema: `weather` de más de 16
letras, `days` no entero o en texto, `night` que no es booleano y más de 16 entradas hacen fallar la
respuesta entera, y ese turno lo juega la IA (`EN_SU_LUGAR.adventure_turn`). El comentario del propio
esquema dice lo contrario («uno mal escrito descarta su pedido con el motivo, no el turno»), y el
criterio 9 pide descartarlo «como toda acción del agente».
- Reproducción (Node, `npx tsx` con `adventureTurnResponseSchema.safeParse({actions: [], weather})`):
  - `weather: "tormenta-electrica"` (18 letras): «weather.0.weather String must contain at most 16 character(s)»;
  - `days: 1.5`: «Expected integer, received float»;
  - `days: "2"`: «Expected number, received string»;
  - `night: "si"`: «Expected boolean, received string»;
  - 17 entradas: «Array must contain at most 16 element(s)».
  En cambio `granizo`, `rain` o un campo de más pasan y se rechazan entrada a entrada.
- Lo que esperaba quien narra: que «tormenta con rayos» (18 letras, algo que un modelo escribe) le
  cueste ese pedido y no las 6 acciones del turno. `climaBlocker` ya mira `days` con
  `Number.isSafeInteger`: el `.int()` del esquema sobra, y el tope de 16 letras corta antes que el
  motivo legible («"…" no es un tiempo: valen …»).

**H2 · De noche, en la base y en la batalla, las figuras van con luz de día.**
El coordinador pidió juzgarlo: **desentonan**. En la batalla de noche (`cache/batalla-noche.png`) los
templarios y los orkos se ven recortados con la luz cálida de la tarde sobre un campo azul oscuro,
como pegados encima; en la base (`cache/base-noche.png`, `png/a-movil-base-noche-s.png`) el héroe
y, sobre todo, los dos vecinos del Y Bot dorado brillan como si tuvieran su propio foco. En el mapa
la misma noche sí oscurece al héroe y a los grupos, así que las tres pantallas no cuentan la misma
noche. Se leen enteras (que era el motivo), pero no parecen de noche. Lo que esperaba: una parte de
la luz de la noche también sobre las figuras (no la entera), con chapas, barras, nombres y aros
encima sin teñir.

### Menores

**H3 · Tomar una región le cambia la noche en el acto, a media jornada.** La cadena de la noche lleva
el peso del dueño de AHORA (`nocheDeLaSemilla`, clave `region|peso`): cuando la región cambia de
dueño, cambia la cadena entera, y con ella la noche de hoy. Medido en Node, semillas 1-40, 10
regiones, días 1-15: pasar una región de neutral a otro dueño cambia su noche ese mismo día en el
10,9 % de los casos, y **en el 44,2 % si la toma un no muerto** (templarios 4,6 %, imperio 2,6 %,
elfos 2,7 %, orkos 0,6 %). Quien juega no muertos y toma un pueblo verá anochecer (o amanecer) esa
región en mitad de su turno. Es lo que dice el plan aprobado («el dueño de ahora»), pero el efecto
no está dicho en ningún sitio: o se avisa en la prosa y en `CLAUDE.md`, o el dueño que pesa es el de
al empezar el día.

**H4 · La noche de una región que se mira se parece al velo de lo que no se mira.** Partida 7 con
`region-0:noche,region-5:noche`, el héroe de vuelta en su base el día 3 (`png/v-region-5_noche_region-0_noche.png`):
lo que se mira de noche da luz 43-45 (azulado, 37/44/54), y la región de al lado, de día y sin
mirar, 35 (gris, 34/36/32). Se distinguen por el tono y por los fuegos, no por la luz. El criterio 3
habla de la niebla del clima, que sí se distingue; lo digo porque una región de noche junto a una
sin mirar es justo la situación en que quien juega se pregunta «¿veo esto o no?».

**H5 · Un `?clima=` malo, con el menú, se dice al final.** `/?clima=granizo` enseña el menú como si
nada; se elige facción y héroe, y entonces «La página no arranca: "granizo" no es un clima…».
`hayQuePreguntar` no mira el clima (el crítico lo anticipó); lo que falta es decirlo en el menú.

**H6 · La salida de una región inexistente pide quitar también la semilla.** `/?seed=7&clima=region-99:lluvia`
dice «quita "?seed=…" y "?clima=…"»: la semilla está bien y quitarla cambia la partida. Es porque el
error salta en `abrePartida`, que no sabe cuál de lo pedido falló.

**H7 · La lluvia del mapa se ve poco, y menos en un móvil.** Las gotas son de un píxel de
dispositivo (decisión de rendimiento): en 1440×900 se leen como unas pocas rayas finas
(`png/f02-mapa-dia1.png`), y a dpr 3 son de un tercio de píxel CSS (`png/a-movil-mapa-tormenta-crop.png`);
lo que dice «tormenta» en el móvil es sobre todo que oscurece. En movimiento se nota más que en la
captura.

**H8 · En la batalla, el cielo de tormenta y el de noche son casi el mismo.** Los dos azul oscuro
(`png/c-arena-tormenta.png` frente a `cache/batalla-noche.png`); los distingue la lluvia y el rayo,
no el cielo. Con `reduce` la tormenta pierde el rayo y se queda en «lluvia de noche».

**H9 · La noche del mapa es lo más caro, y el criterio 6 se da por bueno con la mejor ventana.**
`tools/qa/clima.ts` compara el mejor de tres ventanas de cada clima con el mejor del despejado. Con
ese método todo pasa (mapa de noche −4,1 %). Con la mediana de las mismas ventanas, el mapa de noche
pierde un 22 % en la primera vuelta y un 11 % en la segunda, y la CPU del hilo por fotograma sube
6 ms (13,5 → 19,5; la «fps que deja la CPU» de la herramienta, −25,8 %). La base de noche, +3,9 ms
(7,9 → 11,8) sin perder fps porque su despejado va holgado. El ingeniero midió +2 a +3 ms para la
noche del mapa; yo, con la máquina a carga 4, el doble. Lo que esperaba quien juega en una pantalla
de 2560 sin GPU: que arrastrar el mapa de noche vaya igual de suave que de día; dos de cada tres
ventanas no fueron. No lo llamo fallo del criterio literal (es ruido de una máquina compartida y la
herramienta lo mide así a propósito), pero es la primera palanca si se nota: los fuegos que abren su
hueco en la capa de la luz del mapa.

## Workarounds usados

- **`?clima=` para forzar** cada efecto: es la puerta prevista (criterio 8), no un atajo. Lo que sale
  sin forzar lo miré también: semilla 13429 desde «Partida rápida», cuatro días, con la lluvia de
  la semilla en base, mapa y una defensa real.
- **La arena para las batallas** de niebla, tormenta y noche: pinta con el mismo `drawBatalla` que
  la partida; la herencia de la región en la partida la vi con lluvia, no con los cuatro.
- **`tools/qa/clima.ts --solo-espectador`** para el espectador: arranca su servidor y un agente de
  prueba, como `pnpm qa`. Veredicto: no afecta a quien juega.
- **Bloquear las imágenes** para «sin arte», como hace `pnpm capturas`.

## No probado

- **La partida terminada** con clima: no llegué a un final en el presupuesto.
- **La tormenta del narrador vista en el espectador**: la captura de `--solo-espectador` sale con
  niebla y una región de noche, y la región de la tormenta queda fuera del cuadro. Que llegue lo
  dice `pnpm qa` por datos («el espectador ve tormenta en Tierras de Cripta Gris»), no una imagen.
- **4K**: no lo medí (el ingeniero: tormenta 18,7 fps frente a 18,0).
- **La batalla de la partida con niebla, tormenta o noche de su región** (solo con lluvia); la del
  espectador con `?clima=region-k:…`.
- `pnpm qa`, `pnpm banco` y `verify:lento`: los dos primeros, citados en verde sobre este HEAD; el
  tercero no se ha corrido (tampoco el ingeniero).

## Veredicto

**Apto con reservas.**

Los cuatro efectos y el despejado se ven en el mapa (por región, con su frente, por debajo de la
niebla de guerra, que no cambia), en la batalla (con su cielo y su rayo) y en la base y la morada.
Salen de la semilla en una partida de verdad sin forzar nada, la defensa hereda el tiempo de su
región, el clima no recibe clics, `reduce` lo deja quieto y sin rayos, y `?clima=` se rechaza
diciéndolo. `pnpm verify` está en verde.

Las reservas, por orden:
1. **H1**: arreglarlo antes de fusionar. Un pedido de clima mal tipado no debe costarle al narrador
   el turno entero, y el propio comentario del esquema ya dice que no debería.
2. **H2**: decidir si las figuras de noche llevan una parte de la luz. Hoy se leen, pero no parecen
   de noche.
3. **H9**: vigilar la noche del mapa en una pantalla grande.

Lo demás (H3-H8) es menor.
