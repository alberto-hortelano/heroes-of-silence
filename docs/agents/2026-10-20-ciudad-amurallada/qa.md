# QA — la ciudad amurallada, vuelta 2 (21-10-2026)

## Veredicto: **NO APTO**

Hay dos motivos, y los dos tienen arreglo acotado:

1. **`pnpm verify:lento` sale 1**, y CI corre `test:lento`. Falla `test/acantilados.test.ts`, «semilla 13: la espalda de cada acantilado lleva peñascos», en (17,33): esa casilla de acantilado queda ahora dentro del recinto de la ciudad-puente town-5. En `HEAD` el mismo test pasa: es una regresión de esta tarea.
2. **En la ciudad-puente con el río al sur, el puente pasa por encima de la muralla sur y se mete hasta el centro de la plaza.** Se ve en s13 (16,36), una de las semillas que se pidieron, y en 15 de las 217 ciudades de 1-40 (un 7 %). Incumple el 8a: se tendría que entrar por la puerta, no cruzar el muro.

Lo demás está bien hecho y se lee como ciudad: el octógono, las 6 piezas de arte, el rastrillo alzado, las casas a la escala del pueblo, entrar y salir, la niebla y la consola limpia. Pero hay cuatro cosas de lectura que debería ver el usuario antes de cerrar (H3 a H6).

## Criterios

| Criterio (requisitos.md; manda la última decisión del usuario) | | Evidencia |
|---|---|---|
| 1. La hoja `ciudades` ya no se usa: recinto modular con casas dentro | ✅ | `grep` de `modulos/ciudades` en src, tools, test y `escena.json`: 0 resultados. La hoja no existe en `assets/mapa/modulos`. |
| Octógono, 8 caras, torre en cada vértice | ✅ | `guardias.mts` en 13, 15 y 10 semillas más: 8t en las 66 ciudades. |
| Puertas en las 8 direcciones, una por senda | ✅ en la regla / ⚠️ en la lectura | Salen las 8 caras (p. ej. s13: n,e,o / ne,se,so / e,s,no). Las del este y el oeste no se leen como puerta: ver **H3**. |
| 6 piezas nuevas de una familia (4 puertas por eje y 2 tramos diagonales), arco de medio punto, rastrillo alzado, sin poste | ✅ | `assets/mapa/modulos/recinto.webp`: las seis piezas. El rastrillo se ve alzado en `n-s`, `ne-so` y `no-se`. Ninguna lleva poste. |
| Ninguna abertura más ancha que su puerta | ✅ en 1-40 | `anilloAbierto` = 0 y `sendaFueraDeLaPuerta` = 0 en las 12 semillas de mi pasada sin recintos que se toquen. |
| La senda pasa por el arco | ✅ N, S y diagonales / ⚠️ E-O | En `qa-s13-ciudad-del-rio-juego.jpg`, la del norte con el puente se ve muy bien. Al este y al oeste, la senda «llega a un muro» (H3). |
| 2. Misma escala que el pueblo | ✅ | En `qa-s2-racimo.jpg` y `s21`, las casas de la ciudad y las del pueblo de al lado miden lo mismo a ojo. El test fija `PX_POR_CASILLA_DEL_PUEBLO`. |
| Muralla al 0,8 | ✅ | `ESCALA_DEL_RECINTO = 0.8`. |
| 4. «Muy lleno de casas, pegadas a la muralla», sin la misma casa al lado | ✅ con reservas | 1-100 (550 ciudades): de 12 a 20 casas, mediana 16 (la maqueta tenía 5). `casasRepetidasJuntas` = 0. Junto a los muros norte y sur van pegadas. Junto al este y el oeste queda a veces media casilla de plaza vacía (`qa-s15-neutral-cerca.jpg`, lado este), y con tres puertas las calles dejan media plaza vacía (s105 town-4: 10 casas, `qa-s105-nodo-dentro.jpg`). |
| 5. Cada ciudad, distinta y estable | ✅ | Test «la misma ciudad sale igual». En el navegador, s15 sale idéntica a `s15-vuelta2.jpg` del ingeniero. |
| 6. Se lee como ciudad, no como pueblo grande ni como barrera | ✅ con reservas | Ver «Juicio de lectura». |
| 7. Bandera, marca, clic, reserva y orden | ✅ con un menor | El clic en la casilla de la base abre la base (`data-escena=town`) y «Volver al mapa» vuelve. La bandera se ve. La marca del dueño se pinta encima de las casas (H8). |
| 8a. Ciudad-puente: en su orilla, se entra desde el puente | ✅ río al N, E u O / **❌ río al S** | **H2**. |
| 8b. Lo de debajo: suelo de la ciudad | ✅ | s13 town-5 está montada sobre un acantilado y la plaza sale limpia (`qa-s13-puente-sobre-la-muralla.jpg`). s10, igual. |
| 8. Guardias a 0 en 1-40 | ✅ en el informe / **❌ en el test** | El informe da 0 en mis 12 semillas buenas, y el ingeniero lo midió en 1-40. Pero `acantilados.test.ts` s13 sale rojo en la lenta (**H1**). |
| Ninguna senda bajo un tramo o una torre (criterio absoluto) | ⚠️ fuera de 1-40 | s45 (4), s50 (8 + 1), s62 (8 + 2) y s105 (20 + 2): **H4**. |
| 9. Imágenes antes/después | ✅ | Las tres del ingeniero, más las `qa-*.png` de esta carpeta. |
| Al cerrar: borrar la hoja `ciudades` | ✅ | Ver la fila 1. |
| Rendimiento | ✅ | `componer` en s1, 2, 9, 13, 15 y 21, dos vueltas en caliente: `HEAD` mediana 277 ms y máximo 332; ahora 261 y 314. `pnpm capturas` no avisa del tope de alejar. |

## Hallazgos

### Bloqueantes

**H1. `pnpm verify:lento` sale 1** (y `test:lento` corre en CI).

```
FAIL test/acantilados.test.ts > en los mapas reales > semilla 13: la espalda de cada acantilado lleva peñascos, salvo junto a un objeto
AssertionError: [[17,33]]: expected [ [ 17, 33 ] ] to deeply equal []
Test Files  1 failed | 145 passed (146)    Tests  1 failed | 5541 passed (5542)    221.71 s
```

- Se repite en aislado: `HEROES_LENTO=1 npx vitest run test/acantilados.test.ts -t "semilla 13: la espalda"` da rojo.
- Sobre un volcado de `HEAD` (git archive) pasa.
- La causa: la ciudad-puente town-5 (16,36) lleva su recinto tierra adentro, al rectángulo (15-17, 33-35). (17,33) es acantilado y queda dentro. Ahí, por el 8b, no van peñascos.
- Lo que falla es la premisa del test, que solo exime lo que está a una casilla de `o.at`. Hay que eximir la huella del recinto (`casillasDeLaHuella` o `enElRecinto`), no tocar la escena.
- El ingeniero no corrió la lenta, y en `verify` ese test solo mira la semilla 1.

**H2. El puente de una ciudad-puente con el río al sur pasa por encima de la muralla y llega al centro de la plaza.**

- Ciudades: s13 town-5 (16,36), s14 town-7 (10,36), s17 town-3 (21,23), s98 town-2 (32,4)…
- En 1-40 son **15 de 217 ciudades** con el río al sur. Las que lo tienen al norte (14), al este (7) y al oeste (7) están bien.
- Evidencia: `qa-s13-puente-sobre-la-muralla.jpg` y `qa-puentes-s-s-e-o.jpg` (arriba, las dos del sur; abajo, la del este y la del oeste, que están bien).
- Reproducir: `pnpm taller recorte 13 11 29 21 39 x.png 80`. En el juego, `?seed=13`, y se lleva la cámara a (16,35).
- Qué esperaba quien juega: que el puente acabe en el arco de la puerta sur, como en el norte de s13 (25,5).
- Qué se ve: el tablero, de unas 2,6 casillas, tapa el muro sur y la puerta y se mete entre las casas hasta y ≈ 34,5, el medio del recinto.
- La causa probable: la casilla del núcleo es la del río y el recinto va tierra adentro, así que el puente cruza desde la otra orilla hasta la fila sur del 3 × 3. Como se pinta delante del muro sur, lo tapa.
- Por qué los guardias no lo ven: miden que el anillo no pise `ejesDeLosPuentes`, y nadie mira el tablero encima del anillo.

### Importantes (para el juicio del usuario; no bloquean si los acepta)

**H3. Las puertas del este y del oeste no se leen como puerta.**

- Lo confirmo. La pieza `puerta-e-o` vista de lado es un tramo alto con un torreón, y el arco solo asoma como una rendija en su cara (`qa-puertas-e-o.jpg`).
- En el juego, la senda del este y la del oeste de s13 (25,5) acaban en un muro (`qa-s13-ciudad-del-rio-juego.jpg`). Pasa igual en s10 y en s98.
- Son 130 de los 556 cruces de 1-40 (un 23 %, por la medida del plan).
- No es un fallo de Codex: es el ángulo. Las ideas posibles (el arco en escorzo, un hueco en el adarve, un torreón que salga hacia la cámara) piden arte, y eso lo decide el usuario.

**H4. Recintos que se tocan, y la senda que pasa bajo sus torres.**

- Dos ciudades a Chebyshev 3 en el núcleo dejan los dos 3 × 3 pegados. En 1-110 son 13 parejas en 10 semillas.
- Dentro de 1-40 (s2, s13, s16 y s21) los guardias quedan a 0. Fuera se rompen: s50, s62 y s105, más s45 por otra causa (un nodo en la esquina del 3 × 3). Lo comprobé con `guardias.mts`.
- Juicio sobre si es aceptable: el listón escrito era «1-40», y ahí se cumple. Pero el criterio 3 es absoluto («ninguna senda»), y fuera de la muestra falla en un 4 % de las semillas. **Aceptable solo como issue declarada**, no como «fuera de alcance»:
  - **s45, s50 y s62 son lo que el ingeniero declara**: dos recintos pegados sin sitio para la senda entre ellos, o un nodo en la esquina.
  - **s105 trae algo que no declaró**: `nodosSinRampa` = 1, que en `HEAD` es 0. Ver H5.
- Además, aunque los guardias estén a 0, la lectura de las parejas es rara:
  - en s2 cuatro ciudades se funden en un solo castillo (`qa-s2-racimo.jpg`), y no se ve que sean cuatro ciudades que se toman por separado;
  - en s50 la puerta sur de una da contra la torre de la otra (`qa-recintos-que-se-tocan.jpg`).
- El arreglo es del núcleo (no poner ciudades a Chebyshev ≤ 3 entre sí ni nodos en el 3 × 3): una issue.

**H5. Un nodo del mapa puede quedar dentro de las murallas de una ciudad-puente.**

- s105 town-4 lleva el recinto en (22-24, 14-16), y el nodo de acantilado node-5 (24,15) cae dentro. Su hito sale en medio de la plaza (`qa-s105-nodo-dentro.jpg`) y su rampa no se pone (`nodosSinRampa` = 1; en `HEAD`, 0). Quien cruza ese acantilado pasa por la muralla este, que no tiene puerta.
- En 1-100 hay otro caso: s98 node-0 (32,4), dentro de town-2.
- Es raro, unas 2 de cada 100 semillas, pero el objeto que se toma queda escondido entre casas.
- Lo provoca que el recinto de la ciudad-puente se corre tierra adentro, a casillas que el núcleo no reservó para ella.

**H6. El héroe anda a través de los muros, y el de salida nace encima de las casas de su base.**

- En el núcleo, las 8 vecinas de la ciudad son casillas normales y se entra por cualquier lado. Las puertas, en cambio, solo van donde cruza una senda pintada.
- Pasa en la ruta de la partida: en `qa-s16-ruta-por-la-muralla.jpg` (`pnpm capturas`, s16, día 1), la ruta del héroe cruza la muralla este, que no tiene puerta, porque la base solo lleva puerta al oeste.
- Y lo he visto en el juego, con `?seed=15`: el héroe pasa de (3,14) a (4,16) y queda dentro, en la plaza sur, sin puerta sur (la base solo lleva `no`). Para salir hacia el sur cruza el muro.
- El héroe de salida nace en la casilla noroeste del 3 × 3 de su base, y en toda partida, el día 1, se pinta dentro de la muralla. En s2 queda de pie sobre una casa (`qa-s2-movil-heroe-sobre-casas.jpg`). En s15, junto a la torre noroeste, tapando justo su puerta.
- El ingeniero lo menciona («ya pasaba en la vuelta 1»), pero es lo primero que ve quien juega.
- Cambiarlo toca el núcleo (dónde nace el héroe, por dónde se entra), que está fuera del alcance escrito. Lo decide el usuario.

### Menores

**H7. Un trozo de plaza vacío asoma bajo la niebla, sin murallas ni casas.**

- Se ve cuando lo explorado llega a una casilla del 3 × 3 pero no a la de la ciudad.
- Reproducir: `?seed=15`, pulsar (6,17) desde la salida, y mirar el borde de la niebla en (11,15-17), `qa-s15-plaza-sin-muralla-en-la-niebla.jpg`.
- Se ve un descampado de tierra redondeado al que llega la senda. Al dar un paso más aparecen de golpe la muralla y las casas.
- La causa: la plaza va en el suelo, con la niebla de cada casilla, y las piezas van con la niebla de la casilla de la ciudad.
- No revela nada que se pueda usar, pero queda raro.

**H8. La marca del dueño se pinta encima de las casas.**

- Es el aro rojo, o gris en una neutral, de la casilla de la ciudad. Como va «encima de todo», tiñe la fachada de la casa que le cae debajo (`s15-03`; recorte en el scratchpad).
- Se entiende, pero es un aro de suelo pintado sobre una pared.

**H9. La plaza sobresale por el sur, de 0,15 a 0,25 casillas.** Lo declaró el ingeniero y lo confirmo en todas las vistas. Apenas se nota.

## Juicio de lectura

**¿Ciudad, pueblo grande o muralla de barrera?** Se lee como **ciudad**, y como fortaleza más que como maqueta:

- El octógono cerrado, con ocho torres y puertas en arco, no se confunde con la muralla de barrera, que es un tramo recto con su puerta.
- Tampoco parece un pueblo grande: el pueblo de al lado (s2, s10, s21) es un grupito sin muro de las mismas casas, y las dos escalas casan.
- Alejado al tope (`qa-s15-alejado.jpg`) sigue leyéndose como recinto. Las torres grises compiten algo con las cordilleras grises.

**Las puertas del este y del oeste**: confirmo lo que dice el ingeniero, y es peor que «apenas». No se leen. Desde la cámara, la senda llega a un muro (H3).

## Workarounds usados

- **Cámara y clics calculados a mano** (Playwright sin pantalla, ratón real sobre el lienzo, píxel = (casilla − cámara) × 70): no falsea nada de quien juega. Un intento con la rueda descuadró la cuenta, se descartó y se repitió desde cero.
- **«Fin de turno» no pasó el día** con un `click` por rol (seguía en el día 1). No lo investigué: la ciudad del río se alcanzó el día 1 sin pasar turno. `pnpm capturas` cubre el fin de turno y sale verde, así que no lo cuento como hallazgo de esta tarea.
- **Recortes del taller** (`recortesDeSemilla`, a 80 px) para la pasada adversarial: pinta la escena de `componer` sin niebla ni figuras. Es el mismo escenógrafo del juego, y H2 se ve igual en el juego.
- **El volcado de `HEAD`** (git archive en el scratchpad, con `node_modules` enlazado y ya borrado), solo para la línea base de H1, H5 y el tiempo.

## No probado

- **`pnpm qa`**: no se toca ni el servidor ni el contrato (`git status`: nada en `src/core`, `src/server` ni `data/`).
- **El banco** y `rectitud.ts`: no se tocan ni el núcleo ni el generador.
- **Asaltar o capturar la ciudad neutral**, y ver la bandera cambiar de dueño: haría falta una batalla. El mecanismo (`claveDeObjeto`) lo cubren los tests.
- **El espectador** con la ciudad nueva: la regla es la misma (`componer`), pero no lo abrí.

## Comprobaciones ejecutadas (una vez cada una)

- `pnpm verify:lento`: **salida 1**, H1. Incluye todo lo de `verify`: typecheck y lint limpios, 5541 de 5542 tests en verde, 221 s.
- `pnpm capturas` (a la carpeta del scratchpad): **salida 0**, «sin errores en consola», 615 s con la máquina cargada.
- Navegador: `pnpm dev --port 3313 --strictPort` con `set -m` y PID guardado, y Chromium de Playwright sin pantalla. Pasadas: s15 inicio, alejado y cerca; héroe en la plaza sur; entrar y salir de la base; héroe junto a la muralla de la neutral y en su esquina; niebla a medias. s13: la ciudad del río el día 1, de cerca. Consola vacía en las cinco pasadas. Paré el servidor por su grupo y `ss` dio «3313 libre».
- Pasada adversarial con `guardias.mts` en 13, 15, 41, 45, 50, 62, 105, 77, 133, 211, 299 y 412: a 0 todas menos s45, s50, s62 y s105 (H4 y H5).
- Barrido del núcleo, solo `newGame`, 1-110: parejas de ciudades a Chebyshev ≤ 4. Escena 1-100: objetos dentro de un recinto ajeno (H5), casas por ciudad, y lado del río de las ciudades-puente en 1-40 (H2).

---

# QA — la ciudad amurallada, vuelta 3 «llena, sin plaza mayor» (21-10-2026, reducido)

Sobre `8b9142b6` (la ciudad llena es `6593cee3`). Alcance pedido: el navegador en 3-4 semillas y una pasada adversarial sobre la ciudad llena. Por decisión del usuario no se repiten `verify`, `verify:lento`, `capturas`, `banco`, el barrido ni `pnpm qa`. No toqué código: solo añadí a esta carpeta las capturas `llena-qa-*.jpg` y dos scripts (`qa-llena.mts`, `qa-llena-navegador.mts`).

## Veredicto: **APTO CON RESERVAS**

La ciudad se lee llena (13 / 15 / 16 casas), el héroe de salida nace fuera, delante de una puerta, entra por ella y pisa la piedra, no un tejado. La consola sale limpia.

La reserva es **H1**: en el 5 % de las ciudades, una casa tapa el arco de la puerta del noroeste. Es justo lo que el usuario pidió vigilar («ninguna casa tape un arco»). Pasa en la ciudad de salida de s16, que se ve el día 1. El arreglo es acotado y lo debería ver el usuario antes de cerrar.

## Criterios

| Criterio | | Evidencia |
|---|---|---|
| El héroe de salida, fuera y delante de la puerta | ✅ | En el navegador: s13 en (9,8), delante de la NE de town-0 (7,10); s15 en (2,7), acceso lateral de la NO de (4,8); s10 en (8,3); s16 en (8,5). Ninguno dentro (`llena-qa-s*-inicio.jpg`). En el núcleo, 41-80 y 26×26 1-30: de 140 héroes, 0 dentro de un recinto y 0 fuera de un acceso de `PUERTAS_DE_LA_CIUDAD`. |
| Se entra por la puerta y los pies quedan sobre el empedrado | ✅ | s10, s13, s15 y s16, con clics reales. Al pulsar la ciudad, el héroe anda, entra y se abre la base. «Volver al mapa» lo deja en la casilla de la ciudad. Al acercar, los dos pies y el aro quedan sobre la piedra, sin un tejado debajo (`llena-qa-s{10,13,15,16}-heroe-dentro.jpg`). Por píxeles (alfa de las imágenes, no las cajas): **0 casas** pintan en la elipse de `LIBRE_BAJO_EL_HEROE` en 553 ciudades (1-40, 41-80 y 26×26 1-30). |
| La ciudad se lee llena | ✅ | Casas por ciudad, mín. / mediana / máx.: 1-40 13 / 15 / 16 (208 ciudades; coincide con el ingeniero); 41-80 13 / 14 / 16 (219); 26×26 13 / 15 / 16 (126). A la vista, en las cuatro semillas y en las dos ciudades-puente de s13 (`llena-qa-s13-puente-{e,o}-taller.jpg`), las casas llenan el octógono. El claro que queda es el del pie del héroe con la calle de la puerta sur. |
| Ninguna casa tapa un arco | **❌** | **H1**: 25 de 553 ciudades. |
| Casas fuera del octógono o sobre la muralla | ✅ | Por píxeles: 0 casas que pinten fuera de la cara exterior de la muralla, por el sur o a los lados. 0 pies a menos de media muralla de una cara de detrás (n, ne, no). En 553 ciudades. |
| `puertaSinCamino` y `casasRepetidasJuntas` | ✅ | 0 en 1-40, 41-80 y 26×26 1-30 (informe de `componer`). Con un criterio más laxo, la misma imagen a menos de 0,6 en cualquier dirección: 0 parejas en 345 ciudades (41-80 y 26×26). |
| Consola sin errores | ✅ | Cinco páginas (s13 ×2, s15, s10, s16 ×2), con errores y avisos vigilados: «sin errores ni avisos». |
| Guardias del informe fuera de 1-40 | ⚠️ | 1-40: 40 de 40 a 0. Fuera hay 6 semillas con alguno distinto de 0, pero ninguno es de las casas y en `18df06d5` (fase 3) salen iguales. Ver **H2**. |
| Tests del recinto | ✅ | `pnpm vitest run test/recinto.test.ts test/recinto-en-la-escena.test.ts`: 80 de 80. |

## Hallazgos

### H1 · Importante. Una casa tapa el arco de la puerta del noroeste

**Qué pasa.** En la puerta NO, la casa de detrás se pinta después del arco y su tejado cubre el vano entero. Desde fuera se ve el muro encima de la puerta, pero no el paso. El camino llega a la puerta y parece acabar contra un tejado.

**Comparación** (`llena-qa-arco-no-tapado.jpg`):
- A la izquierda, s16 town-0 (10,7), la ciudad de salida del jugador: el arco no se ve.
- A la derecha, s13 town-1 (35,30), otra puerta NO: el arco y el paso se ven bien.

En el juego se ve igual: en `llena-qa-s16-ciudad-9-6.jpg`, la NO de arriba a la izquierda está tapada y la NE de la derecha se ve.

**Cuánto pasa.** Lo mide `qa-llena.mts` por píxeles: casas que se pintan después de la puerta y tapan más del 5 % de una caja de ±0,12 × 0,4 sobre el medio de su cara. La medida se queda corta: con un 13 %, el vano ya queda tapado entero.
- **1-40**: 11 de 208 ciudades, todas en la NO y siempre con `casas/1.webp` en el mismo sitio, el medio de la cara + (0,18, 0,71). Son s4 town-2, s5 town-3, s7 town-3, s12 town-4, s16 town-0, town-1 y town-5, s17 town-4, s18 town-3, s28 town-3 y s34 town-2.
- **41-80**: 10 de 219. Son s44, s55, s56, s58, s63, s73, s74, s75 y s79, en la NO, y s41 town-2, en la NE con `12.webp`.
- **26×26**: 4 de 126. Son s4, s9 y s22 en la NO, y s24 en la NE.

**Por qué**, como pista para el ingeniero (no es un arreglo). La calle de la puerta (`callesDeLasPuertas`) va por la normal de la cara: en la NO, 0,6 en diagonal hacia el sureste. Pero el tejado tapa en la vertical de la pantalla.
- La casa de (+0,18, +0,71) queda a 0,63 por la normal, así que ya ha pasado el fondo de 0,6. De lado queda a 0,37, fuera de la `MEDIA_CALLE`.
- En pantalla, en cambio, cae justo debajo del arco. Su tejado, de hasta 0,9 de alto, sube hasta el vano.
- Ningún guardia lo mira. `test/recinto.test.ts` comprueba el pie de las casas contra la calle, no lo que la imagen tapa del arco.
- Por qué casi siempre la NO y no la NE: las filas se llenan de oeste a este, y el sitio que queda libre detrás de la NO lo ocupa siempre la misma casa.

**Cómo repetirlo.**
1. `pnpm dev`, y abrir `?seed=16`. El día 1, la ciudad del jugador está en (10,7), con el héroe en (8,5), delante de la NO.
2. Acercar al tope y mirar la cara de arriba a la izquierda: no hay arco, hay un tejado rojo.
3. Sin navegador: `pnpm taller recorte 16 8.6 5.4 10.6 7.6 <salida.png> 240`.

**Qué esperaba quien juega**: ver el arco y el paso por el que entra su camino, como en las otras puertas.

### H2 · Menor, y anterior a esta vuelta. Guardias de la escena fuera de 1-40

| Semilla | Guardia | Valor |
|---|---|---|
| s51 | `carasCortadas` | 1 |
| s54 | `recintoSobreSenda` | 4 |
| s77 | `recintoSobreSenda` | 1 |
| 26×26 s9 | `puentesTapados` | 1 |
| 26×26 s27 | `recintoSobreSenda` | 5 |
| 26×26 s30 | `recintoSobreSenda` | 1 |

**No son de esta vuelta**:
- Con `guardias.mts` sobre un volcado de `18df06d5` (fase 3, sin la ciudad llena), las seis salen idénticas.
- `anilloSobreLaSenda` mira el contorno y las puertas, no las casas.
- `puentesTapados` no cuenta la clase `objeto`, que es la de las casas.

**Lo que sí queda desfasado es `CLAUDE.md`**: dice «Fuera de 1-40, en 41-110, queda `recintoSobreSenda` 1 en s53 y s91». Ahora s53 sale a 0, y en 41-80 salen s54 (4) y s77 (1), además de s27 y s30 en 26×26. Habría que medirlo otra vez y corregir la cifra, o abrir una issue.

### Observaciones (no son hallazgos)

- **s15**: el héroe de salida nace en (2,7), junto al muro oeste. Es un acceso de la puerta NO, el (−2,−1) de `PUERTAS_DE_LA_CIUDAD`, y está sobre el camino que baja a la mina. Cumple la regla, pero no está «delante» de la puerta como en las otras tres semillas: está a un costado (`llena-qa-s15-salida.jpg`).
- **Las ciudades-puente con la puerta este u oeste** (s13 town-2 (15,9) y town-4 (26,32)): el puente llega al muro y la puerta `e-o`, vista de canto, no se lee como puerta. Es el H3 de la vuelta 2, ya conocido. Por dentro van llenas y sin casas tapando nada.

## Workarounds usados

- **La cámara y los clics se calculan con la misma `EscenaAventura` del cliente sobre una sesión espejo**, como en `pnpm capturas`. El ratón es real: rueda para acercar, arrastre para mirar y clic en la casilla. No falsea nada de lo que ve quien juega.
- **Recortes del taller** (`pnpm taller recorte`, el mismo `componer` sin niebla ni figuras) para las ciudades-puente de s13, que el día 1 están bajo la niebla, y para la comparación de H1. H1 lo confirmé además en el juego (`llena-qa-s16-ciudad-9-6.jpg`).
- **Guardias forzados para verlos morder.** Para comprobar que mis cuatro medidas de `qa-llena.mts` muerden, las corrí sobre una copia temporal, ya borrada, con las zonas agrandadas: elipse del pie ×3 y ×4, arco de 1,0 de alto, muro y octógono con margen. Las cuatro salieron distintas de 0 en s13 (arco 4, pie 20, muro 19, fuera 19).
- **El volcado de `18df06d5`** (`git archive` en el scratchpad, con `node_modules` y `assets` enlazados), solo para la línea base de H2.
- **El cursor del ratón** queda sobre el lienzo en los recortes «salida» y pinta la ruta en puntos. No afecta a lo que se mide.

## No probado

- **El móvil** y **el espectador**: no se pidieron.
- **Entrar en una ciudad neutral o enemiga**: haría falta una batalla.
- **Una ciudad-puente en el juego**: el día 1 quedan bajo la niebla. Solo las vi en el taller.
- Por decisión del usuario, no se corrieron `pnpm verify`, `verify:lento`, `capturas`, `banco`, el barrido ni `pnpm qa`. Se citan los del ingeniero sobre `6593cee3`.

## Comprobaciones ejecutadas

- `npx tsx docs/agents/2026-10-20-ciudad-amurallada/qa-llena.mts 0 $(seq 1 40)`, luego `0 $(seq 41 80)` y `26 $(seq 1 30)`: 41-80 en 14 s y 26×26 en 6 s. Los 30 mapas de 26×26 se componen.
- `npx tsx docs/agents/2026-10-20-ciudad-amurallada/qa-llena-navegador.mts http://localhost:3341 <carpeta> 13 15 10 16:10,7 13:15,9`, y otra vez con `16:9,6`. Usa Chromium de Playwright sin pantalla a 1440×900.
- **El vite propio**: `pnpm dev --port 3341 --strictPort`, lanzado con `set -m` en su línea y el PID guardado (cwd comprobado con `readlink`). Lo paré por su grupo: `ss` dio «3341 libre» y `ps -g` dio el grupo vacío.
- `pnpm vitest run test/recinto.test.ts test/recinto-en-la-escena.test.ts`: 80 de 80.

## H1, corregido (ingeniero, 21-10-2026)

- **La regla, por lo que se ve** (`tapaElArco`, `recinto.ts`): una casa que se pinta después del arco de una puerta no mete nada de su silueta en el vano. El vano es la boca de la guía en doce columnas (`vanoDelArco`): inclinada en las diagonales, de canto al este y al oeste, y puesta sobre las cuatro puertas de la hoja `recinto` cubre su hueco oscuro y el suelo del paso. La silueta de cada casa (`Modulo.silueta`, de dónde a dónde va lo opaco por franja de columnas) la deriva `pnpm taller catalogo-escena` (`siluetaDeModulo`). `recintoDe` la cumple: si una casa no entra, prueba otro módulo, y si ninguno, la fila avanza.
- **La calle de detrás pasa de 0,6 a 0,35**, como la de delante (`FONDO_DE_LA_CALLE`). Los 0,6 eran el margen para que el tejado no tapara el arco, y ese margen ahora lo pone la regla. Con la calle de 0,6 y la regla, la mediana de casas en 1-40 se quedaba en 14.
- **El guardia** es `arcosTapados`, en el informe de `componer` (y así en `guardias.mts`), en `test/recinto.test.ts` (los 256 juegos de puertas, con la casa 1 bajo el arco del noroeste como en s16) y en `test/recinto-en-la-escena.test.ts` (s16 entra en la muestra rápida). Para verlo morder, quité la regla de `recintoDe`: 19 tests en rojo, y `guardias.mts 16` da `arcosTapados` 13. Con la regla de `8b9142b6`, el guardia da 355 casas con arco tapado en 1-40.
- **Medido con `qa-llena.mts`, con `UMBRAL_DEL_ARCO=0`** (cualquier píxel en la caja del arco): arco 0, pie 0, fuera 0 y muro 0 en 1-40, 41-80 y 26×26 1-30. Casas por ciudad (mín. / mediana / máx.): 1-40, de 13 / 15 / 16 a 12 / 15 / 16 (media de 14,60 a 14,44); 41-80, de 13 / 14 / 16 a 12 / 14 / 16; 26×26, 13 / 15 / 16, sin cambios. Guardias de la escena en 1-40: 40 de 40 a 0. Fuera de 1-40, los mismos de H2.
- **Antes y después** de s16 town-0: `arcos-s16-antes-despues.jpg`.
