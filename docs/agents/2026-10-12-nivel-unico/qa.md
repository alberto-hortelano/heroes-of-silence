# QA — un solo nivel, derivado de las cifras (ciclo 1)

12-10-2026. Árbol de trabajo de `main` sin commitear, tras las tres vueltas de `implementacion.md`.
Alcance del ciclo 1, según `requisitos.md` («Punto de control del plan»): nivel derivado, ×10, morada, rango,
contrato y la lectura «Índice · nivel» en la arena; «el equipo no mueve el nivel» **sí** entra.
Fuera: «Nueva unidad» y los perfiles de arma de la arena como equipo (§4b, ciclo 2).

Navegador: Playwright sin pantalla (Chromium), con un `vite --port 3188 --strictPort` mío. Lo arranqué con
`set -m`, guardé su PID (224133, que era el líder de su grupo) y lo maté por el grupo. Después comprobé con
`ss` que el 3188 quedaba libre. No toqué el 3100: es de otra sesión, en este mismo repo.
Los scripts están en el scratchpad de la sesión (`scripts-qa/`) y las capturas, en `capturas-qa/`.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Una sola `nivelDeUnidad` / `indiceDePoder`, puras, en enteros, sin `sqrt`/`**`; nadie más calcula un nivel | ✅ | `pnpm verify` en verde (abajo), con el guardia de `invariantes.test.ts` incluido. El ingeniero lo vio morder 4 veces (`implementacion.md`). En `src/core/nivel.ts` todo va con `raizEntera` y `Math.floor`. |
| 2 | ⌊índice/100⌋ = nivel, mínimo 1; monótono en cada cifra | ✅ | Pasada al azar con `createRng(4242)`: 200 unidades con cifras al azar (ataque y defensa 0-60, daño 1-6000, PV 1-50 000, todas las velocidades) y 7 variantes de cada una (+1 de ataque, defensa, PV, daño mínimo y máximo, PV ×2, +1 escalón de velocidad). Salida: `monotonía: 0 fallos de 1400`. La unidad mínima (PV 1, daño 1-1, A 0, D 0, la más lenta) da índice 101 y nivel 1. |
| 3 | Catálogo en su morada ±1; campesino en el 1; tabla fijada en test | ✅ | La tabla está en `test/nivel.test.ts` (verde). En la arena, catálogo del juego: campesino «Índice 119 · nivel 1», paladín «617 · 6», dragón óseo «690 · 6», montaraz «327 · 3» (morada 2, contiguo). |
| 4 | `level` → `morada` en datos y tipos; moradas, ejército inicial y guardias igual | ✅ | Lo cubren `verify` y el guardia de `creatures.json` sin `level`. Las partidas siguen jugándose, y el banco está re-anclado con «ninguna partida cambia antes de su primera batalla» (`implementacion.md`, vuelta 1). |
| 5 | ×10 en PV y daño (catálogo, equipo, héroe, hechizos, curar, presets, personaje); IA reescalada | ✅ | Arena: el preset espada-escudo es «20–40 daño · 150 PV» (en HEAD, 2-4 y 15). Panel del héroe: 500 PV de cuerpo. El monje cura 40 (capturas de la vuelta 1). La única constante de escala es `ESCALA_DE_CIFRAS`, y de ella se derivan las de la IA (vuelta 3). |
| 6 | Experiencia = PV × índice (corrección del usuario); rango 1-5 suma cifras; héroe rango 5 y nivel del cuerpo; liderazgo y ascenso por rango | ✅ | Del núcleo, por rango 1→5: campesino 119/121/123/125/127 (nivel 1 siempre), espadachín 405→429 (4), dragón óseo 690→714 (6→7). Héroe: rango 5 = 354/3, rango 8 = 449/4, rango 11 = 521/5. `pnpm qa`: «ascenso: … rango 5, nivel 3». Calibración de la experiencia: 0,25 rangos 5 por partida en 1-1000 (`implementacion.md`, vuelta 2; no repetida). |
| 7a | Arena: sin campo «Nivel» editable; «Índice N · nivel n» que cambia al editar, sin recargar | ✅ | Guerrero con escudo: `campo level: 0`, «Índice 312 · nivel 3». Al editar ataque 25 → 372·3, defensa 20 → 414·4, vida 900 → 540·5, daño 30-90 → 598·5, casillas 7 → 620·6, todo en la misma página. Paladín, ataque 11 → 21: 617 → 642; «Volver a las del catálogo», 617. «Editar» en plena pelea: 312·3 → ataque 30 → 384·3 («Cambiado: vale ya en esta pelea»). Captura: `capturas-qa/a10-ficha-elemento.png`. |
| 7a | Borrador antiguo con `level` se sigue leyendo (y se migra) | ✅ | Borrador con la forma de HEAD (`level` 2, PV 15, daño 2-4; un zombi con `level` 9, PV 33, daño 3-5), leído con `leerBorrador` y servido a la página. Barra: «Cargado …: 2 unidades». Guerrero: vida 150, «312 · nivel 3», igual que el de hoy. Zombi: «369 · nivel 3» (el `level` 9 se ignora). Guardado y vuelto a leer: 150 y [20,40], sin doble escala y sin `level` en el archivo. |
| 7a | Enlace viejo (`?montaje=` v3) se lee a la escala de hoy | ✅ | Enlace v4 copiado de la página y pasado a v3 a mano (`level`, PV y daño /10, prueba del piquero con 12 PV y daño 2-4). Al abrirlo: «Montada la pelea del enlace»; guerrero «20–40 daño · 150 PV», «312 · nivel 3»; piquero con 120 PV y daño máximo 40, «316 · nivel 3». Sin errores. `capturas-qa/a8-enlace-v3.png`. |
| 7b | El equipo no mueve el nivel (ciclo 1) | ✅ | **Núcleo**: las 21 criaturas × 150 equipos (cada combinación de piezas de `data/equipo.json` por hueco, sin pieza incluida) dan `0 combinaciones mueven el índice, de 3150`. Héroe con lo mejor de cada hueco (estoque, coraza bendita, talismán): el índice no cambia en los rangos 5, 6, 8 y 11, y las cifras sí (A 2→4, PV 500→590, velocidad average→fast). **Partida real** (semilla 7, día 1): quito las 3 piezas con «×» y el panel sigue en «RANGO 5 · NIVEL 3», mientras A/D pasa de «2 (+3) / 2 (+3)» a «2 / 2». `capturas-qa/j2-sin-equipo.png`. |
| 7b | Perfiles de arma de la arena como equipo | — | Es del ciclo 2 (fuera de alcance, lo dicen los requisitos). |
| 8 | `creature_stats` con `dwelling`, `level`, `powerIndex`; tropa con rango; `pnpm qa` pasa | ✅ | `pnpm qa`, salida 0: «creature_stats responde correctamente: paladín, morada 6, índice 617, nivel 6», «69 veredictos, 69 entraron, 0 descartadas», «1 ascenso de tropa a héroe». |
| 9 | 0 sin terminar; duración y j0 medidos con fecha | ✅ (citado) | No lo repetí: el banco no cambió en la vuelta 3 (`066767b4…`, «ancla: igual»). Vuelta 2: barrido de 100 semillas, `0/100`, 8 / 14 / 21; en 1-1000, 7 / 14 / 26 y j0 520 (antes, 558). La diferencia está explicada y declarada, no compensada. |
| 10 | `verify` y `verify:lento` en verde; banco re-anclado; docs al día | ✅ | Mi `pnpm verify`: `Tests 2992 passed | 14 skipped (3006)`, salida 0, 50 s con la máquina compartida. `verify:lento` (4 843 en verde), `banco` y `capturas` los cito de la vuelta 3, sin repetirlos: desde entonces no ha cambiado nada. |

## Hallazgos

### Importante — unas cifras grandes de la arena dejan la pelea colgada en «Contando la jugada…» (regresión)

- **Qué pasa.** `validarUnidadDeArena` solo pide enteros seguros con un mínimo, sin máximo. Pero `poderBruto` lanza cuando `ofensa · aguante` no cabe en un entero seguro. Ahora `herir` llama a `indiceDePoder` en cada golpe, así que unas cifras que la ficha acepta revientan:
  - la ficha, al pintarse, con una excepción sin capturar;
  - y la pelea, al primer golpe que recibe esa unidad.
- **Antes no pasaba.** En HEAD, la experiencia era PV × nivel escrito y no había raíz.
- **Pasos** (sin semilla especial: lo probé con la 5, y en el núcleo con la 3, y sale igual).
  1. `pnpm arena`, «+ izq.» en Guerrero con escudo y «+ der.» en Zombi; el bando izquierdo, en IA.
  2. En la ficha del guerrero, Vida = `1000000000000000`, y Tab. La barra no dice nada y el resumen del bando enseña «1000000000000000 PV». La ficha se queda con la lectura de antes («Índice 312 · nivel 3»).
  3. «Luchar». La pelea se queda para siempre en «Contando la jugada…» (`capturas-qa/a5-pelea-enorme.png`). La consola trae `pageerror: Guerrero con escudo: el índice de poder se calcula en enteros y estas cifras no caben en uno (20-40 de daño, 1000000000000000 PV)`.
  4. Con cifras más normales también pasa. Con A 25 / D 20, Vida 10 000 000 y Daño máximo 1 000 000, el cambio entra pero la ficha no se repinta: sigue en «1298 · nivel 12» y la consola trae el mismo `pageerror`. Con un valor menor se recupera. En el núcleo, `sesionDeArena` con PV 10¹⁵ lanza la misma excepción en los dos papeles (atacante y defensor).
- **Qué espera quien juega.** O el cambio no entra y lo dice («No se cambia: …», como con 0, 2,5 o −3), o la pelea funciona. Nunca una pelea muerta sin mensaje: va contra el contrato *fail-loud*.
- **El caso límite.** Solo se llega con cifras absurdas, de millones en dos campos o de 10¹⁵ en uno. Por eso es importante y no bloqueante. Lo natural es que `validarUnidadDeArena` (y la prueba del catálogo) rechacen lo que `poderBruto` no puede medir, o pongan un tope a cada cifra, con su frase.
- **Mismo origen.** Un borrador viejo con `level` y PV cerca del máximo seguro se multiplica ×10 después de validar, y no se vuelve a comprobar que siga siendo seguro. Es muy improbable.

### Menor — por encima del nivel 9 «la primera cifra» ya no es el nivel

Con cifras grandes de la arena sale «Índice 1298 · nivel 12»: las dos primeras cifras. El catálogo llega al 7 y es coherente con ⌊i/100⌋ (criterio 2). Solo lo apunto por la frase literal del usuario, «que el nivel sea la primera cifra». No pide cambios.

### Menor (ya declarado por el ingeniero) — experiencia de seis cifras sin separador

El panel enseña «Experiencia 176000 / 304000» (`j1-panel.png`, en el scratchpad). Se lee, pero cuesta. El ingeniero lo dejó fuera a propósito.

### Observaciones sin hallazgo

- Pasada adversarial de la ficha:
  - Vida 0: «tiene que ser 1 o más, y es 0».
  - Vida 2,5: «tiene que ser un número entero, y es 2.5».
  - Ataque −3: «tiene que ser 0 o más».
  - Vida vacía: «el campo está vacío».
  - Vida 99999999999999999: «tiene que ser un número entero».
  - Todo sale en la barra y el índice no se mueve.
- El héroe de la arena con Ataque y Defensa a 99 sube su nivel (354 → 516 → 675). Es coherente: en la arena, el ataque y la defensa del héroe son de su cuerpo («nada: su ataque y su defensa son de su cuerpo»), no del equipo. Poder y Conocimiento no lo mueven.
- Visto como jugador, la fila «Nivel — Índice 312 · nivel 3» se lee bien en la ficha, encima de las cifras (`a10-ficha-elemento.png`). Ocupa una celda de la rejilla de campos como si fuera uno más, pero no tiene caja de edición, y eso deja claro que no se escribe.
- Ninguna otra pasada de navegador dejó errores en consola: ficha, catálogo, héroe, borrador viejo, enlace v3, editor en combate y panel de la partida.

## Workarounds usados

- **El borrador viejo se sirvió con `page.route`** en vez de escribir `data/borradores/unidades.json`. Ese archivo no está ignorado por git y el 3100 de otra sesión lo leería. La respuesta es la que da de verdad `leerBorrador(raiz)` del servidor sobre un archivo de la forma de HEAD en una raíz temporal, y la escritura de vuelta se probó con `escribirBorrador` sobre esa misma raíz. No afecta a quien juega: es el mismo código del servidor, solo que fuera del árbol compartido.
- **El enlace v3 lo construí a mano** a partir de uno v4 copiado de la página, con la misma transformación que el test. No tengo un enlace v3 real de HEAD, pero la forma la confirma `git show HEAD:src/core/arena.ts` (`level` obligatorio, presets de la escala vieja).

## No probado

- **Veterano en el panel de la partida** («Veterano · rango r · nivel n» en la tropa) **y crónica «sube a rango N»** en el navegador. No lo jugué: hace falta buscar una semilla con batallas. Lo cubren `pnpm capturas` de la vuelta 3 (verde, pasada «veteranos»), el ancla `test/fixtures/paneles.txt` y `pnpm qa`.
- `verify:lento`, `banco`, `capturas`, el barrido y `veterania.ts`: no los repetí, por el presupuesto de pruebas. Desde la vuelta 3 no ha cambiado nada; los cito arriba.
- `enfrentamiento.ts`: no lo corrió nadie. Según el ingeniero, la IA de batalla no cambia de regla.

## Veredicto

**Apto con reservas.** Todos los criterios del ciclo 1 se cumplen en el flujo real: la arena, la partida, el borrador y el enlace viejos, y el contrato del agente. La reserva es el hallazgo importante: con unas cifras absurdas, la arena acepta lo que el índice no sabe medir y la pelea se queda muerta sin decir por qué. Conviene cerrarlo con una validación antes de abrir el ciclo 2, que va a crear unidades desde cero.

---

# Re-verificación (vuelta 4, 12-10-2026)

Solo los dos puntos de `hallazgos-qa.md` y una pasada adversarial breve sobre lo que tocó la vuelta 4
(`medidaBlocker`, `catalogoMedible`, `conMiles`). Navegador: Playwright sin pantalla contra un
`vite --port 3198 --strictPort` mío (PID 240956, líder de su grupo, cwd `/home/al/code/heroes`), matado por su
grupo y comprobado: «3198 libre». El 3100 (de otra sesión) no lo toqué y sigue arriba. Capturas en `capturas-qa/v4/`.

| Criterio | Estado | Evidencia |
|---|---|---|
| `pnpm verify` en verde | ✅ | Una vez, con carga 0,7: `Test Files 121 passed \| 1 skipped (122)`, `Tests 2995 passed \| 14 skipped (3009)`, exit 0 |
| Banco sin cambios | ✅ (citado) | `066767b4…`, igual (implementacion.md, vuelta 4). No lo repetí |
| R1: guerrero con escudo, Vida 10¹⁵, se rechaza con su motivo y la pelea no se cuelga | ✅ | Barra: «No se cambia: La unidad «Guerrero con escudo»: estas cifras son demasiado grandes para medir su nivel (20-40 de daño, 1000000000000000 PV, ataque 5, defensa 7): baja la vida o el daño.». El campo vuelve a 150 y la ficha sigue en «Índice 312 · nivel 3». «Luchar» (izquierda en IA, semilla 5): «Gana el bando derecho en la ronda 4» a los 16,2 s (`r1-pelea.png`) |
| R2: A 25, D 20, Vida 10 000 000 y luego Daño máx. 1 000 000 | ✅ | 10 000 000 PV entra («Índice 1215 · nivel 12»). Daño máx. 1 000 000 da «No se cambia: … (20-1000000 de daño, 10000000 PV, ataque 25, defensa 20) …», el campo vuelve a 40 y el índice no se mueve |
| Prueba del catálogo (Zombi) | ✅ | Con 10¹⁵ da «No se cambia: Zombi (prueba del catálogo): estas cifras son demasiado grandes …» y el campo vuelve atrás |
| Editar en plena pelea con 10¹⁵ | ✅ | El diálogo enseña el mismo motivo en rojo, la Vida sigue en 150 y la pelea sigue jugable (`combate-1e15.png`). Pasa por `unidadDeLaFuente`, la misma validación |
| `data/creatures.json` fuera de rango falla al cargar | ✅ (citado + código) | `catalogoMedible(allCreatures())` al cargar `nivel.ts`. El ingeniero lo vio morder con el dragón óseo a 10¹⁵. El test de `nivel.test.ts` está en el verify verde |
| Experiencia con separador de miles | ✅ | `/?seed=7`: la fila lee `"Experiencia\n176 000 / 304 000"`, con U+00A0 (`experiencia.png`). El espectador no enseña la experiencia (solo «rango r»), así que no hay nada que formatear allí |
| Consola | ✅ | En todas las pasadas (arena, catálogo, combate, partida): 0 `pageerror` y 0 errores |

## Pasada adversarial

Sonda en el núcleo (`npx tsx`, scratchpad `v4/sonda.mts` y `v4/pegon.mts`), con búsqueda binaria del tope.

- **Justo en el tope y justo encima** (guerrero con escudo, 20-40, A 5, D 7):
  - El último medible es 588 705 833 643 PV. En el núcleo, ese valor entra y +1 se rechaza con su motivo.
  - En el navegador pasa igual. Con 588705833643 no sale aviso y la ficha marca «Índice 1907 · nivel 19». Con 588705833644 sale «No se cambia: …» y el campo vuelve al valor anterior.
  - «Luchar» con el valor del tope termina: «Gana el bando izquierdo en la ronda 4», 16,6 s (`frontera-pelea.png`).
- **Batallas enteras en el tope** con la IA en los dos bandos, semillas 1-5:
  - El guerrero del tope contra el zombi termina en 7-8 jugadas.
  - Dos guerreros del tope en espejo terminan en el tope de 200 jugadas, sin lanzar.
  - Un «pegón» (1 PV y daño máximo 35 322 350 018 572, el último medible) contra dos guerreros del tope termina en 7 jugadas.
  - La experiencia ganada llega a 1 122 662 024 757 201 y sigue siendo un entero seguro. Ningún `herir` lanza.
- **Ataque 10¹⁵ y defensa 9·10¹⁵**: los dos se rechazan con el mismo motivo.
- **Borrador viejo** (con `level`, ×10):
  - Un borrador con 58 870 583 365 PV se rechaza: ×10 da 588 705 833 650, que pasa del tope.
  - Con 58 870 583 264 PV entra.
  - La comprobación corre de verdad después de multiplicar.
- **Catálogo en el tope**:
  - El zombi entra con 1 000 799 917 193 PV («Índice 1884 · nivel 18») y +1 se rechaza, también en el navegador.
  - Los tiradores (archer y ranger, con su ×1,5) en su tope dan índices de 1884 y 1907, sin lanzar.
- **`conMiles`**:
  - 0 y −0 → «0». 999, 1000 y 9999 van juntos. 10000 → «10 000», −1234 → «-1234» y −12345 → «-12 345».
  - 1234567 → «1 234 567». ±`MAX_SAFE_INTEGER` → «9 007 199 254 740 991», con su signo.
  - 1,5, NaN, Infinity y `MAX_SAFE_INTEGER` + 1 lanzan diciéndolo.
  - Solo lo leen los paneles de la partida (el héroe y el veterano), que tiran del catálogo. La experiencia de la arena (`ganado`) no se enseña, así que nunca recibe un no seguro.

## Observaciones sin hallazgo (menores, de cifras absurdas)

- En la ficha, la caja de la Vida con 12 cifras se corta («58870…», `ficha-frontera.png`). La lista del bando escribe «588705833643 PV» sin separador (`paneles.ts:152`). Solo se ve con cifras que nadie usará, y el ciclo no pedía separador allí. Lo apunto para cuando se creen unidades desde cero (ciclo 2).
- El motivo del borrador viejo cita los PV ya ×10, que no son los que trae el archivo. Es coherente con la escala de hoy, y solo afecta a borradores de antes con cifras absurdas.

## Workarounds

Ninguno. Todo se hizo por el flujo real de la arena y de la partida, con clics y teclado.

## No probado

- `verify:lento`, `capturas`, `pnpm qa` y `banco` no los repetí. El banco lo cito arriba. La vuelta 4 no toca ni el servidor, ni el contrato, ni el escenógrafo.

## Veredicto final

**Apto.** Los dos hallazgos están corregidos y comprobados en el flujo real. Con cifras enormes, la ficha, el catálogo y la edición en combate rechazan con su motivo, la pelea no se cuelga y la consola queda limpia. La experiencia se lee «176 000 / 304 000». La pasada adversarial no encontró ningún fallo en el tope, ni en el borrador viejo, ni en `conMiles`.
