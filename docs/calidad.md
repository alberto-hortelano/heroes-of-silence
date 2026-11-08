# Calidad

Se lee antes de tocar: `test/`, `tools/qa/`, `.github/workflows/ci.yml`, `vitest.config.ts`.

Lo que dice cómo se comprueba el juego y por qué está como está. La fase Doc de la reorganización
de la arquitectura (08-11-2026) le trajo, tal cual, el detalle de «Control de calidad» de `CLAUDE.md`
(al final); allí queda la tabla en corto.

## Las semillas de `pnpm capturas`

Sale del comentario de `DESTINO` en el antiguo tools/qa/capturas.ts (hoy `tools/qa/capturas/pagina.ts`),
donde vivió hasta H5 de la reorganización (08-11-2026); el texto va tal cual, primero el bloque y
después la nota de debajo. Hoy ninguna pasada escribe su semilla: la busca en el espejo.

Las semillas cambiaron todas con el mapa de 28 y los asaltantes (ciclo «el
camino cuesta»): con un grupo en cada región sin dueño, la guardia que se
alcanza hoy SIN pisar la región de un grupo que embosque es rara —3 de las 60
primeras semillas—, y cada pasada necesita una. Se buscaron con el espejo,
como `guardiaALaVista`: la 282 tiene una a tres casillas y, además, una ruta
de dos días a la vista (`rutaDoradaYGris`), que de las candidatas solo tenían
cuatro.

Se volvieron a probar las de siempre (2, 29 y 4) cuando la IA dejó de entrar
en emboscadas: no cambia nada, porque lo que las descarta es la ruta de la
PERSONA, no la de la IA. En las tres, la única guardia a la que se llega hoy
está detrás de una región que embosca al héroe de salida.

**Y otra vez con los mapas densos (03-10-2026)**: fronteras gruesas,
obstáculos que bloquean y el lado de 34 se llevaron las cinco. Se buscaron con
el espejo, igual que entonces, en las 300 primeras: la 238 tiene una guardia a
tres pasos y una ruta de dos días a la vista; la 21 pierde la suya; en la 208
la guardia deja veterano y al día siguiente hay otra; y la 3 tiene una ruta a
(11,0) que pisa, a la vista, la región de un grupo que embosca. El móvil
comparte la 238: en las 300 primeras ninguna guardia alcanzable cae a dos
casillas del héroe, y la de la 238 está a (1,3).

**Y una vez más con la vuelta de simplify (03-10-2026)**: el vestido del mapa
consume el `rng` de otra manera y cambió el mapa de todas. Buscadas con el
espejo en las 1 500 primeras —y hasta la 4 000 para los veteranos— y
probadas cada una con su pasada: la 993 tiene una ruta de dos días a la vista
y, tras entrar al castillo, una guardia a (4,−1); la 534 pierde la suya; en la
1 454 la guardia deja veterano y la del día siguiente cae a (6,1); la 3 sigue
dando emboscada, ahora con la ruta a (11,5); y el móvil pasa a la 810, con la
guardia a (0,2) del castillo. Es la búsqueda que el issue de las semillas de
capturas propone automatizar.

**Y con la vuelta 1 de QA (03-10-2026)**: los caminos en árbol y la frontera
forzada movieron otra vez el mapa y el camino de todas. Prefiltradas con el
espejo (una `Session` por semilla, sin navegador) y probadas cada una con su
pasada: la 50 tiene la ruta de dos días y la guardia tras el castillo; la 97
pierde la suya; en la 2 199 —de las 5 000 primeras solo seis dejaban veterano
con otra guardia al día siguiente, y solo esta cae dentro del marco— la
guardia está a seis pasos y la del día 2 a ocho; la 3 da la emboscada con la
ruta a (8,8); y el móvil sigue en la 810.

**Con «menos caminos» (06-10-2026)** la emboscada y los veteranos se
quedaron sin escena, y dejaron de fijarse a mano: las buscan sus pasadas
(`buscarEmboscada`, `buscarVeteranos`), y con ellas la que pierde
(`buscarDerrota`). Las que siguieron aquí (la 50 y la 810) aguantaron ese
cambio, y cayeron con el siguiente: las entradas de nodo en eje (#161) le
quitaron a la 50 su ruta de dos días y a la 810 su guardia a la vista (QA de
#161, H1). Desde entonces las buscan también sus pasadas, cada una con lo que
de verdad necesita: `buscarEscritorio`, `buscarMovil` (móvil y táctil, con la
caja del móvil medida en una página) y `buscarSinArte`.

**Y con #131 (08-10-2026) no queda ninguna escrita**: la del espectador (la 50
del servidor con el plan 7 de la política) la busca `semillaDelEspectador`
jugando su partida en el proceso, y la de la arena (la 6), `buscarArena` con
la pauta de la pasada. Las guardias ya no se buscan «a la vista desde el
héroe» alejando la vista a ojo: `guardiaALaVista` lleva la cámara hasta la
que toca arrastrando el mapa (`Mapa.mirar`). La semilla 1 con que se mide el
lienzo no es una escena: la caja no depende de la partida (`abrir` lo exige).

Las semillas de la emboscada avisada, de los veteranos y de la batalla que se
pierde ya no se escriben aquí: las buscan sus pasadas en el espejo
(`capturas/escenas.ts`). Eran la 3 con destino (8,8), la 2 199 y la 97;
«menos caminos» (06-10-2026) rompió las dos primeras a la vez, como cada
cambio del generador antes, y la 97 había caído ya dos veces.

## Arrancar: la build, CI y las sesiones

- **`vite build` copia `assets/` sin lo que solo lee el taller**: de cada
  `unidades/<id>/dN/`, solo `atlas.webp`; ninguna carpeta `fuentes/` ni `_guias/`, a cualquier altura;
  y nada de `art/` (láminas y referencias de estilo) (`seCopiaAlBuild`, `tools/vite/publico.ts`,
  #137). Por eso las letras de los temas viven en `assets/letras/`.

- **CI** (`.github/workflows/ci.yml`): `pnpm verify`, `pnpm test:lento`, `pnpm banco`,
  `vite build` y `pnpm qa`. No gasta un céntimo: no llama a ningún servicio de pago.

- **Ninguna sesión corre la suite entera** (25-10-2026, decisión del usuario: «Elimina el verify
  completo. Los tests se hacen por partes y justificando cada parte»). El hook `Stop` que lanzaba
  `pnpm verify` al acabar cada turno se retiró: con varias sesiones a la vez se juntaban varios de
  16 procesos y, a las 22:00 de ese día, la memoria se agotó y earlyoom mató la app de Claude y
  Chrome. La suite entera la corre CI.

## Control de calidad (el detalle)

La tabla y las notas tal como estaban en `CLAUDE.md` hasta la fase Doc (08-11-2026); allí queda la tabla en corto.

| Comprobación | Tarda | Cuándo |
|---|---|---|
| `pnpm typecheck` y `pnpm lint` | segundos | siempre que cambie código |
| `pnpm vitest run test/<x>.test.ts` | según el fichero | **por partes**: solo los ficheros de lo que se toca, y cada uno con su porqué (qué mira y por qué el cambio puede romperlo) |
| `pnpm verify` | ~80 s | **no lo corren las sesiones**: lo corre CI |
| `pnpm verify:lento` | ~75 s | lo corre CI; a mano, entero no: los ficheros lentos de lo que se toca (`HEROES_LENTO=1 pnpm vitest run test/<x>.test.ts`), con su porqué. **El arte de una unidad, no** (23-10-2026, decisión del usuario: «no se pueden lanzar los tests todo el rato sin pensar»): una vez, cuando lo visual está dado por bueno, solo los tests que lo leen: `HEROES_LENTO=1 pnpm vitest run test/taller-8d.test.ts -t <id>` (el atlas de cada dirección sale de sus hojas) y `pnpm vitest run test/clips-por-unidad.test.ts` (su maniquí lleva los clips que declara); con su identidad o su giro, también `test/arte-hojas.test.ts -t <id>` |
| El navegador / el espectador | minutos | si el cambio se ve, o tocas `comun/html.ts`, `espectador/` o el canal |
| `pnpm qa` | ~3 s | si tocas `src/server/` o el contrato |
| `npx tsx tools/qa/exportaciones.ts` | ~7 s | si añades o dejas de leer una exportación: nada exportado sin lector (lo corre CI); lo que se lee sin que `tsc` lo vea (un `import()` calculado), en su lista blanca, `SE_LEEN_SIN_TSC` |
| `pnpm capturas` | ~245 s | si el cambio se ve; sale 1 con un error en consola |
| `barrido-semillas.ts` | ~1 s | si tocas la IA o la economía: 4 semillas; una sola sin terminar es regresión |
| `pnpm banco` | ~2 s | si tocas el núcleo sin querer cambiar el juego: 20 partidas (eran 200; decisión del usuario, 21-10-2026: «estamos en pleno desarrollo»); para medir más, `pnpm banco 200` |
| `npx tsx tools/qa/medidas/rectitud.ts` | ~50 s | si tocas `map/generar/` o `map/vestir/`: tramos rectos en **1-3000**, tres procesos por bloques de 1000, con los largos a escala (`largoALaEscala`, en `core/escala.ts`; en 42×42: ≥ 10 ≤ 176, caras ≥ 10 ≤ 3, mapas con tramo ≥ 12 ≤ 23; desde #231 lo medido, 143 / 0 / 12, más 10 / 3 / 3, y con #232, 164 / 0 / 14: los mapas que se visten otra vez, al ritmo de los que no cambian; con los ríos (#144), 95 / 0 / 4, con el río de una casilla, 90 / 0 / 5, y también entre dos niveles, 102 / 0 / 5; con el río continuo, 102 / 0 / 5, y sin agua de frontera fuera de él, 118 / 0 / 10, y con el río de lago de 20, 121 / 0 / 12; con el recinto de las ciudades en el núcleo, 98 / 0 / 6; sin minas (21-10-2026), 106 / 0 / 10; con las ciudades en mitad de su región (05-11-2026), 159 / 0 / 20, y el techo de mapas sube a 23 (el cruce de tres regiones ya no lleva ciudad); con los pueblos en un nodo (fase 3), los mismos 159 / 0 / 20; con #230 eran 174 / 14 / 14 y una perturbación neutra del azar movía hasta 21 tramos: si un cambio del azar lo pasa, se vuelve a medir con su fila en `TECHOS`). El guardia, en `test/rectitud.test.ts` (orden lenta) |
| `enfrentamiento.ts` | ~2 s | si cambias cómo decide la IA de batalla: entra solo con el intervalo entero > 50 % en 5 000 parejas |
| `tools/qa/navegador/neutro.ts` | ~10 s | si tocas una hoja de estilo: sin `data-tema`, 0 diferencias con HEAD |
| `tools/qa/navegador/clima.ts [carpeta]` | ~15-30 min (con fps) | si tocas el clima: capturas de cada clima en el mapa, la batalla, la base, la morada y el espectador, lo inexplorado intacto, el rayo y los fps (`--sin-fps` para solo mirar) |
| `tools/qa/navegador/temas-con-piezas.ts [carpeta]` | ~5 min | si tocas los temas o sus piezas: rótulos de sección sobre su pieza, el lienzo quieto en 7 ventanas, lo que tapan marco, remate y cartela, y las capturas lado a lado |
| `npx tsx tools/qa/medidas/arena-ia.ts` | ~2 s | si tocas el movimiento de la batalla, salir del contacto, la carga, la rueda o la armadura: 100 peleas por variante con unidades del catálogo, IA contra IA (peleas sin terminar, rondas, tiempo, cargas, cruces y golpes parados) |

- **Presupuesto de pruebas** (la máquina es compartida: varias sesiones prueban a la vez y
  con carga 30+ vitest falla por timeouts y hay que repetir). Mientras se itera, solo el test de lo
  que se toca (`pnpm vitest run test/x.test.ts`); la suite entera, nunca (la corre CI);
  `capturas` y `banco`, **una vez al cerrar** y solo si el cambio toca lo que miran (y no se repiten si nada cambió
  desde el último verde: se citan). Las medidas, en 1-40 o 1-100 semillas; 1-1000 solo si la
  tarea lo pide (rectitud, raros de verdad). Las pruebas al azar del QA, en cientos, no en miles.
  Un `verify:lento` que sale 1 solo por «Timeout calling onTaskUpdate» con todo en verde se dice
  y se repite una vez, no en bucle.

- **Bucle rápido y orden lenta** (`test/lento.ts`, #167): un guardia que recorre
  muchas semillas o todo el arte corre en `verify` con una muestra que muerde
  (las semillas donde pasa lo que vigila, una imagen de cada forma de derivar)
  y en `verify:lento` (`HEROES_LENTO=1`) con todo; las medidas sobre muchas
  semillas, con `itLento`. Antes de mover un test, se abarata. Un JSON de arte
  retocado a mano fuera de la muestra lo caza solo la lenta; una imagen
  sustituida sin rederivar, las dos (sha256).

- **`pnpm banco`**: si el hash cambia a propósito, se re-ancla en
  `tools/qa/medidas/banco.ts` y se juzga **la forma del diff** (qué semillas cambian y
  cuál es el primer hecho distinto), no el hash; el historial de anclas, en `docs/banco.md`.

- Medidas de equilibrio y duración: solo si la tarea es medir (ver «No se prueba la jugabilidad»,
  arriba), y con **100 semillas**. Una cifra medida se escribe con su fecha.

- Nada de puntuación de deuda ni pruebas de mutación.
