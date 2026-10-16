# QA: que se vea por dónde se pasa y por dónde no

Validado el 14-10-2026 sobre el diff sin commit de `claude/regions-map-view-b13f86` (HEAD 129d337b),
después de la ronda de simplify. La referencia es la petición literal del usuario: *«asegúrate de que
se vea claramente por donde no se puede pasar y por donde sí»*. Se aplican sus dos decisiones
posteriores: la orilla del bosque va en mancha de matas y las cumbres quedan exentas.

## Cómo se probó

- **El juego real.** `pnpm dev --port 3297 --strictPort` con Playwright sin pantalla. Se abrieron las
  dos marcas (`?seed=1&marca=<id>`) en dos ventanas:
  - 1920×1080 a dpr 1;
  - la del usuario: 2343×1231 a dpr 1,09375, el lienzo de 1983×1104 que guarda la marca.

  En cada una se miró el zoom de la marca y el tope de alejar (30 pasos de rueda), con y sin la vista
  de regiones (tecla `R`). Con la ventana del usuario, el presupuesto de píxeles está activo al tope:
  el lienzo pasa de 2168×1207 a 1641×913 (densidad 0,828, `medidas/dims.cjs`).

  También se recorrió el mapa entero al tope, con «Ver mapa entero» y luego `R`, en s1, s3 y s9.
  En la consola no hubo errores ni avisos en ningún caso. El servidor se paró por su grupo y `ss` dio
  el 3297 libre.
- **El taller.** Se hicieron unos 30 recortes de `pnpm taller recorte` a 64 px (algunos a 40 y 96).
  Al lado de cada uno va la misma imagen con el contorno de cada barrera, sacado de `analizar`: verde
  bosque, gris montaña, azul agua, naranja acantilado, rojo muro y amarillo nodo. Para comparar,
  algunos se repitieron con HEAD, en una copia extraída con `git archive` en el scratchpad (`AD-*`).
- **Barridos en 1-40** con `componer` sobre `newGame`, contados desde fuera y sin usar los contadores
  del ingeniero (`medidas/barrido.mts`, `nodos.mts`, `b1.mts`, `mt.mts`, `abetos.mts`). Los mismos
  guiones se pasaron sobre HEAD (`barrido-head-1-40.txt`).
- **Tamaños raros** (`medidas/tamanos.mts`): 24×24 y 64×64 (s1-5), 3 y 10 regiones por bando (s1-2) y
  40×24 (s1-2).
- **`pnpm capturas`**: una vez, al cerrar. **Exit 0, «sin errores en consola», 378,3 s.**
- **`pnpm verify` y `verify:lento` no se repitieron**, como se pidió. Salieron verdes tras la ronda de
  simplify (`implementacion.md`):
  - `verify`: 3 077 passed y 14 skipped;
  - `verify:lento`: 4 965 passed, 3 min 27 s.

  Desde entonces solo cambió un comentario.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Ningún árbol sobre lo pisable, a ningún alto | ❌ **NO cumple en la nieve**; cumple en los demás suelos | **Por hoja:** 0 piezas de `ARBOLES`, de cualquier clase, con el pie en lo pisable en 1-40 (HEAD: 40 941 cubiertas de más de 0,6), y 0 en todos los tamaños raros. **Pero** la mezcla `cubierta-snow` trae 4 módulos que son abetos nevados (`taller/hoja-cubierta-snow.png`, módulos 1-4). Hay 9 455 sobre nieve pisable en 1-40, en 4 601 de sus 6 735 casillas, con alto p50 0,42 y máximo 0,57. En HEAD eran 5 973. El contador no los ve porque mira el nombre de la hoja. → **H1** |
| 2 | Junto al bosque, cubierta clara o rala: matas, nada de mancha de árboles | ✅ (con la decisión del usuario: mancha de matas) | En lo pisable de 1-40 la cubierta mide como mucho 0,65 (tierra: almiar, carro), 0,56 en hierba y 0,57 en ciénaga. Ningún árbol, salvo los abetos de H1. En `par-s1-marcas-64` y `AD-s1-nieve-zoom-96`, la hierba que antes llevaba pinos y frondosos ahora lleva matas, flores y tocones |
| 3 | La masa no entra en lo pisable de su fila más de M = 0,2 | ✅ | Recuento propio en 1-40: 0 masas de bosque y 0 de montaña (sin cumbres) que pasen del margen por los lados. En HEAD eran 5 109 y 4 103 (964 y 2 197 de más de 0,45). Cumbres exentas: 357, la medida. 0 también en 24×24, 64×64 y 3/10 regiones. La perspectiva hacia el norte queda permitida: → **H3** |
| 4 | La huella del bosque se ve en el suelo, también al tope de alejar | ✅ | Hay sotobosque (≥ 0,4·255) en el centro de 5 721 de las 5 722 casillas de bosque de 1-40; queda fuera s12 (18,31), con 85/255. Hay 0 casillas pisables con sotobosque en su centro. En s1 (14,8), bosque, la mediana de luz del suelo es 47, frente a 58 en la pisable de al lado (15,8). Al tope, con la densidad a 0,828 (`juego/marca-2-23-usuario-tope*.jpg`), los volúmenes se siguen pintando y el pasillo se lee. En la nieve se ve como una sombra gris verdosa (H4). **Coste del pintor: no medido por QA**; se cita el del ingeniero, 6 311 → 5 751 ms de mediana |
| 5 | Los pasos siguen leyéndose como pasos | ✅ | En los 81 nodos de bosque y los 183 de montaña de 1-40: ninguna masa con el pie en el nodo, ninguna masa de su fila que entre en su 0,6 central y sotobosque 0 en el centro de cada nodo de bosque. Los informes de los tamaños raros dan 0 en `pasosTapados`, `pasosAtravesados`, `casillasDeBarreraSinFormacion`, `spritesSobreSenda`, `paredesTapadas` y `cubiertaComoLaBarrera`. Visualmente, s1 f(17,8), f(11,19), f(30,22), m(11,34), s2 f(9,23), s13 m(21,8), s14 f(14,16) y s15 f(23,9) mantienen el hito y el hueco |
| 6 | Las dos marcas, resueltas | ⚠️ **lo visual cumple; falta resolverlas** | (2,23) se lee como pasillo de hierba y (1,23) como bosque, a zoom de marca y al tope, en las dos ventanas (`juego/marca-*`, con la red superpuesta en `*-con-regiones.jpg`). `pnpm marcas lista` las da como **[pendiente]**: se resuelven tras el commit (`pnpm marcas resolver <id> <commit>`) |
| 7 | Revisión de uniones en 1-40 contra la vista de regiones | ✅ revisado, con hallazgos | En el juego, con `R`, el mapa entero de s1, s3 y s9 al tope (`juego/mapa-*`). En el taller, recortes de fronteras finas, bosques de una casilla, nodos, nieve, ciénaga, lava, arena, áspero y el borde inferior (`taller/par-*`). Por programa, todos los nodos y fronteras de 1-40. Agua, acantilado y muro **no** tienen este problema: ningún árbol sobre ellos tapa lo pisable; lo que entra de lado son piezas de diseño (orilla, paredes que cuelgan, la puerta de la muralla sobre su nodo) y rocas de lo alto del acantilado (H6). → H1, H2, H3 |
| 8 | Hay un test con s1 y un pasillo sintético | ✅ | `test/pisable-junto-al-bosque.test.ts` (13 tests): las marcas (2,23) y (1,23), el pasillo `FF.FF`, los guardias muerden y los mapas reales en [1, 9, 13] o en 1-40 en la orden lenta. En verde en `verify` y `verify:lento`; se cita, no se repitió |
| 9 | Suelo desnudo medido y enseñado | ✅ | Cifras del ingeniero, no repetidas: 20,6 / 21,0 / 25,6 → 23,2 / 23,7 / 28,1 % en s1/3/7 (+2,6 / +2,7 / +2,5). El usuario aceptó la mancha de matas |
| 10 | Lo que queda muerto, borrado | ✅ | `grep` de `lindeDeBosque`, `ARBOLES_DEL_SUELO`, `soloDondeHay`, `filaDelPie`, `cumbresPuestas` y `ponerCumbre` en `src`, `tools` y `test`: solo quedan menciones históricas en comentarios |

## Hallazgos

### H1 · importante: abetos sobre la nieve que se pisa

- **Qué pasa.** Los módulos 1-4 de `cubierta-snow` son abetos nevados en miniatura: los cuatro
  primeros de `taller/hoja-cubierta-snow.png`.
  - Van como «matas» en el paso 5 de la cubierta.
  - Ahora que todo punto es una mata de la mezcla, salen más: 5 973 → **9 455** en 1-40, en el 68 %
    de las casillas de nieve pisable.
- **Por qué importa.** A 0,42 de alto se distinguen del bosque, que mide ~1,16, por tamaño y densidad.
  Pero son árboles, y la regla del usuario es «árbol = no se pasa, sin excepciones». Al tope de
  alejar se ven como pinos sueltos por toda la nieve (`juego/s3-nieve-tope-con-regiones.jpg`).
- **Por qué no lo caza el guardia.** `arbolesSobreLoPisable` mira la hoja (`ARBOLES`), no la forma.
- **Cómo reproducirlo.**
  - En el taller: `pnpm taller recorte 3 2 10 14 19 out.png 64`.
  - En el juego: `?seed=3` → «Ver mapa entero» → la región «Hoya de los Cuervos», que es `region-7`
    con `R`.
  - Comparado con HEAD: `taller/AD-s3-nieve-region7.jpg`.
- **Qué esperaba quien juega.** En la nieve que se pisa, solo matas, rocas y montones de nieve.
- **Arreglo aparente** (lo decide el arquitecto): sacar los abetos de la mezcla de la nieve o
  tratarlos como árbol. Si se tratan como árbol, el guardia los contaría.

### H2 · importante, preexistente y ahora más visible: casillas de bosque que parecen pisables

- **Cuántas hay en 1-40.** De las 4 809 casillas de bosque que tocan lo pisable en cruz:
  - 93 no tienen ningún árbol con el pie en ellas;
  - 173 no tienen ninguno de más de 0,5;
  - en HEAD eran 93 y 169.

  Antes las rodeaban los árboles del linde y todo parecía bosque. Ahora lo pisable de al lado está
  despejado y la casilla solo se distingue por el sotobosque, ~20 % más oscura.
- **Los peores casos.** Hay bosques de una casilla **sin un solo árbol** junto a la puerta de una
  ciudad, porque la reserva del objeto no deja poner ninguno:
  - s1 (14,24), bajo `town-7` (14,23): `taller/par-s1-bosque1-sinarbol-14-24-64.jpg`;
  - s1 (28,35), bajo `town-11` (28,34), con la senda de la puerta pintada por encima:
    `taller/par-s1-bosque1-sinarbol-28-35-64.jpg`;
  - s13 (17,22): `taller/par-s13-bosque1-sinarbol-17-22-64.jpg`;
  - s27 (25,18).

  Se leen como un parche de tierra junto al camino.
- **Otro ejemplo.** s1 (14,8) tiene un solo arbolillo de 0,32 y se ve como la hierba de (15,8)
  (`taller/par-s1-nieve-zoom-96.jpg`).
- **Por qué no lo caza el guardia.** `casillasDeBarreraSinFormacion` da 0 porque cuenta como formación
  cualquier pieza o copa vecina.
- **Cómo reproducirlo.** `pnpm taller recorte 1 11 21 18 27 out.png 64`.
- **Qué esperaba quien juega.** Si no se pasa, que se vea un árbol.
- **Nota.** Sale en parte de la generación, que pone un obstáculo de bosque a la puerta de una ciudad,
  y eso queda fuera de alcance. Pero el escenario puede plantar al menos un árbol pequeño fuera de la
  reserva, o un marcador.

### H3 · importante, a decidir (no es regresión): lo que se pisa al norte de un bosque queda bajo las copas

- **Qué pasa.** El criterio 3 limita la copa solo por los lados, como decidió el usuario. La copa de la
  fila de al sur tapa por perspectiva la casilla pisable de encima.
- **Cuándo deja de verse.** En un pasillo este-oeste de una casilla, o en un rincón, lo que se pisa
  desaparece.
- **Cuánto.** En 1-40, de las casillas pisables con bosque al sur y barrera al norte, 203 de 546
  quedan cubiertas en ≥ 80 % por las cajas de la masa; en HEAD eran 223. Con montaña al sur, 144 de
  1 181, frente a 165. La medida es por caja, así que sobreestima.
- **Ejemplos.**
  - s1, fila 17, columnas 29-31: un paso entre los bosques de las filas 16 y 18
    (`taller/par-s1-pasilloEO-64.jpg`);
  - s2 (10,18): 8 pinos de la fila 19 la cubren entera (`taller/zoom-s2-lava.jpg`);
  - s2 (18,17) (`taller/par-s2-pasilloEO-s2-64.jpg`);
  - s3 (4-5,18), bajo una cumbre (`taller/par-s3-pasilloEO-s3-64.jpg`).
- **A quién afecta.** Casi todo son rincones sin salida, pero el de s1, fila 17, es un paso.
- **Qué hay que decidir.** Queda dentro de lo aceptado (#185), pero va contra «que se vea claramente».
  El usuario decide si se limita el alto de la fila de al sur de un pasillo este-oeste.

### H4 · menor: el sotobosque en la nieve

- Se ve como una sombra gris verdosa bajo el bosque (`taller/AD-s1-nieve-zoom-96.jpg`). Se lee como
  la sombra del bosque y no como suciedad.
- En la ciénaga y la lava apenas se nota, porque el suelo ya es oscuro. Allí la señal son los árboles,
  que es suficiente.
- No hace falta un color por suelo.

### H5 · menor: el borde de la montaña, algo más bajo

- **Qué cambia.** En las casillas de montaña con lo pisable al este o al oeste, el pico más alto
  baja: la mediana pasa de 0,87 a 0,74, y las que se quedan por debajo de 0,5 pasan de 1 694 a 2 059
  de 7 120. Es la puerta de lo pisable.
- **Se ve igual de legible.** En los recortes comparados con HEAD (`taller/AD-s13-montana-m21-8-64.jpg`
  y `taller/AD-s9-cienaga-nodo-m19-12-64.jpg`), la montaña se sigue leyendo como montaña.
- **Para vigilar.** Una sierra de una casilla entre dos zonas pisables se queda en peñascos.

### H6 · menor, preexistente: rocas de lo alto del acantilado sobre lo que se pisa

- Picos y `rocas-caidas` de clase `roca` en una casilla de acantilado que entran más de 0,45 en la
  casilla pisable de su fila: 332 en 1-40 (328 en HEAD).
- Ejemplo: s3 (35,16), `picos-nevados` (`taller/par-s3-acantilado-64.jpg`).
- Es el punto 3 del backlog del plan.
- No son árboles y se leen como roca.

### H7 · menor, preexistente: sin arte

Con los marcadores, las matas de lo pisable son triángulos oliva pequeños y la masa de bosque,
triángulos verde oscuro grandes (`capturas/sin-arte-01-mapa.jpg`). Se distinguen por color y tamaño.

## Workarounds usados

- **`?marca=<id>`.** Es la URL de desarrollo que reproduce una marca, y pone `revealAll` a true. Es
  cómo las creó el usuario, y quita solo la niebla. No afecta a quien juega.
- **El botón «Ver mapa entero».** Lo tiene quien juega, así que no es un workaround. Se usó para
  recorrer el mapa sin niebla, igual que la vista `R`.
- **Contornos de barrera dibujados por QA sobre los recortes del taller** (`medidas/ov.py`). Solo
  anotan: la imagen de la izquierda de cada `par-*` es la del taller tal cual.
- **La red superpuesta en las capturas del juego** (`medidas/overlay.py`) son las líneas de la vista
  `R`, copiadas sobre la captura normal de la misma cámara.

## No probado

- **El coste del pintor (C4)**: se cita el del ingeniero. La máquina es compartida y no se repitió
  una medida de 12 pinturas por variante.
- **El suelo desnudo (C9)**: se cita.
- **`verify` y `verify:lento`**: se citan, como pidió el coordinador.
- **La GPU y el navegador del usuario**: solo Chromium sin pantalla.
- **Los mapas diseñados por el agente** (un plan con `MapPlan`). Solo se probó el procedimental, en
  varios tamaños.
- **La cobertura de H3 píxel a píxel**: se midió con cajas, no con el alfa de cada imagen.
- **La revisión visual de 1-40 no es exhaustiva.** Se miró el mapa entero de s1, s3 y s9 y unos 30
  recortes. Lo demás de 1-40 se cubrió por programa.

## Veredicto

**Apto con reservas.**

El problema que marcó el usuario está resuelto:
- en s1, (2,23) se ve como pasillo y (1,23) como bosque, a zoom de marca y al tope con el
  presupuesto activo;
- en todo el mapa, el bosque se lee por sus árboles y su sotobosque, y lo que se pisa, despejado;
- la mejora frente a HEAD es grande en todos los suelos (`taller/AD-*`).

Las reservas:
- **H1** incumple a la letra el criterio 1 en la nieve, y es barato de arreglar. Debería arreglarse
  antes del commit.
- **H2** y **H3** son casos donde todavía no «se ve claramente», preexistentes. Hay que enseñárselos al
  usuario.
- Las dos marcas quedan por resolver tras el commit.

---

## Vuelta 2 (re-verificación de H1, H2 y H3)

Validado sobre el diff sin commit de `claude/regions-map-view-b13f86` (HEAD 129d337b), con el
código tal como lo dejó la «Vuelta QA 1» de `implementacion.md` (último cambio de `colocar.ts`,
14-10 22:14; nada se tocó después). Solo se re-verifican los criterios 1, 3, 4 y 5 y los hallazgos
H1, H2 y H3. La sesión se cortó a medias y se reanudó: la evidencia del juego y las medidas son de
antes del corte, los recortes del taller se rehicieron después con el mismo código. Todo está en
`qa/v2/`.

### Cómo se probó

- **El juego real.** `vite --port 3298 --strictPort`, arrancado en su propio grupo, y Playwright
  sin pantalla a 1920×1080 (`v2/medidas/juego2.cjs`). Para mirar cada caso se abrió
  `?seed=N&marca=<id>`: las dos marcas reales y, para los demás sitios, una marca de QA servida
  interceptando `/__marcas/<id>` en el navegador (no se escribe nada en disco). En cada vista, zoom
  de la marca (86 px) y, en cuatro, el tope de alejar (30 pasos de rueda), con y sin `R`. **Consola
  sin errores ni avisos en las 10 vistas.** Tras el corte, `ss -ltnp` dio el 3298 libre: el servidor
  ya no existía (la máquina se reinició) y no había nada mío que matar.
- **El taller.** 26 recortes a 64 px con `recortesDeSemilla` (`v2/medidas/recortes2.mts`, lista en
  `v2/medidas/lista-recortes.txt`), cada uno con su par de contornos de barrera
  (`v2/taller/rec/par-*.jpg`). Una hoja de contacto con los 112 módulos de las 7 hojas `cubierta-*`
  (`v2/taller/hojas-de-cubierta.jpg`) y los dudosos ampliados (`v2/taller/dudosos.jpg`).
- **Barridos propios**, sin los contadores del ingeniero:
  - `barrido2.mts` en 1-40 y 41-100: árboles por mi lista de módulos, casillas de bosque sin
    árbol, los árboles de la reserva contra objetos, puertas y senda, y casillas estrechas tapadas;
  - `estrechas.mts` en 1-40: la parte tapada de cada casilla estrecha (la casilla entera, por caja,
    sin cumbres);
  - el guion de la vuelta 1, `barrido.mts`, otra vez en 1-40 (`v2/medidas/barrido-v1-guion-1-40.txt`);
  - `informe.mts`: la suma de los contadores del informe en 1-40.
- **`pnpm capturas`**, una vez, al cerrar: **exit 0, «sin errores en consola», 381,6 s**
  (`v2/capturas/capturas.log`; el servidor lo arranca y lo para la propia orden, y después `ss` no
  da ningún vite escuchando). Quedan las capturas del mapa en JPG.
- **No repetido**, como se pidió: `verify` (3 088 passed, 14 skipped) y `verify:lento` (4 976
  passed, 216,8 s), los dos en verde al final de la vuelta del ingeniero, sin cambios después.
  `pnpm banco` no aplica.

### Criterios afectados

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Ningún árbol sobre lo pisable, a ningún alto | ✅ | **Por mi lista**, sacada de mirar los 112 módulos (`hojas-de-cubierta.jpg`): `cubierta-snow` 1-4 (abetos) y `cubierta-sand` 5 (árbol seco de tronco grueso). Coincide con `ARBOLES_DE_LA_CUBIERTA`. Los dudosos (`dudosos.jpg`: `sand` 6 y 8, `rough` 10 y 12, `snow` 13-14, `grass` 15) se leen como matojo, rama tumbada o tocón, no como árbol. Resultado: **0 árboles con el pie en lo pisable en 1-40 y en 41-100, y 0 módulos de árbol puestos como cubierta en ningún sitio** (en la vuelta 1, 9 455 abetos en la nieve). En la nieve que se pisa de 1-40 solo salen los módulos 5-16 (peñascos, montones y matojos), 2 400-3 500 de cada uno. `informe.arbolesSobreLoPisable` = 0 en 1-40 (`informe-1-40.txt`) |
| 3 | La masa no entra en lo pisable de su fila más de M = 0,2 | ✅ | El guion de la vuelta 1, otra vez: 0 masas de bosque y 0 de montaña sin cumbre que entren de lado (`barrido-v1-guion-1-40.txt`). Cumbres exentas: 355 (eran 357). `informe.masaSobreLoPisable` = 0 |
| 4 | La huella del bosque se ve en el suelo, también al tope | ✅ (sin cambios) | `escalon.ts` no se tocó en esta vuelta. Mismo resultado que en la vuelta 1: sotobosque en 5 721 de 5 722 casillas de bosque (la que falta sigue siendo s12 (18,31)). Al tope, el bosque se lee igual (`v2/juego/marca-2-23-tope.jpg`, `s3-nieve-tope.jpg`). Coste del pintor: no medido por QA, como en la vuelta 1 |
| 5 | Los pasos siguen leyéndose como pasos | ✅ | En 1-40: 0 masas con el pie en ninguno de los 264 nodos de bosque y montaña. `pasosTapados`, `pasosAtravesados`, `casillasDeBarreraSinFormacion`, `spritesSobreSenda`, `paredesTapadas`, `cubiertaComoLaBarrera` y `basesSobreReserva` = 0 (`informe-1-40.txt`). El tope de los pasillos no ha quitado ningún hueco de paso |

### H1, H2 y H3

**H1, los abetos de la nieve: resuelto.** Ver el criterio 1. En el juego, la región 7 de s3 ya no
tiene pinos sueltos (`v2/juego/s3-nieve-normal.jpg`). Cerca, la nieve no queda pelada ni rara:
matojos, peñascos nevados y montones, como en `capturas/v1-par-s3-nieve.png` del ingeniero, sin los
abetos. Al tope, ver H9 abajo. La arena tampoco queda pelada sin su árbol seco: huesos, cactus, rocas
y matojos (`v2/taller/rec/par-s14-arena-64.jpg`).

**H2, casillas de bosque sin árbol: resuelto. Se acepta la desviación de la reserva; la puerta y la
senda se siguen leyendo.**

- **Por programa.** De las 5 722 casillas de bosque de 1-40, 26 no tienen árbol (eran 93). Las 22
  que tapa una ciudad cubren 0,5 o más. Las otras 4 (s8 (15,11), s30 (0,19), s31 (19,23) y s40
  (28,27)) llevan encima una pared del desnivel: una ladera o una diagonal de 2,2 a 2,6 de alto. En
  41-100, las 2 que quedan, s74 (31,35) y s85 (10,10), también: una ladera con su bajada y una rampa
  de muesca (`sinarbol.mts`). La casilla se lee como roca, no como claro. Árboles de casillas que
  tocan lo pisable más bajos de 0,5: 173 → 117.
- **Los árboles de la reserva.** Hay 84 en 1-40 y 103 en 41-100. **Todos son de una casilla de
  bosque al lado de una ciudad**: ninguno junto a una mina, un pueblo o un nodo con puente, porque
  ahí la reserva no dejaba la casilla sin árbol. 45 y 47 caen en la casilla de la puerta de la
  ciudad (la de debajo).
  - Su caja **no toca la de ningún objeto**: 0 de 187.
  - **La distancia mínima de su caja a la senda pintada es 0,36** en 1-100, justo el pasillo de la
    masa (0,16 + 0,2). Ninguno pisa la senda.
  - Altos de 0,30 a 1,04.
- **A la vista, en el juego** (`v2/juego/*-zoom.jpg`), en s1 (14,24) bajo town-7, s1 (28,35) bajo
  town-11, s13 (17,22), s27 (25,18) y s9 (9,9):
  - la puerta del castillo se ve entera;
  - la senda sale libre;
  - el árbol queda debajo y a un lado, como un pino suelto en la orilla del bosque.

  En el taller se ve lo mismo, además en s1 town-0, s21 town-7, s37 town-1 y s31
  (`v2/taller/rec/par-s1-b14-24-64.jpg`, `par-s1-b28-35-64.jpg`, `par-s31-muertos-64.jpg`…). Ninguno
  tapa la puerta ni la senda.
- **Lo único raro, ya declarado por el ingeniero.** El frondoso de otoño de s27 (25,18) queda solo
  sobre la nieve (`v2/juego/s27-town4-25-18-zoom.jpg`), porque la hoja sale de `Analisis.suelo`
  (tierra). No es de la reserva: la masa normal hace lo mismo en 6 casillas de nieve de 1-40
  (`hojas-1-40.txt`). Menor y preexistente (H8).

**H3, los pasillos estrechos tapados: resuelto, salvo las cumbres (exentas) y el pasillo de dos de
hondo (fuera de la regla, desviación 3).**

- **Medida independiente** (`estrechas-1-40.txt`). Son 2 259 casillas estrechas de 1-40 con bosque o
  montaña al sur: el pasillo de este a oeste, la punta de norte a sur y el rincón. De cada una medí
  la parte tapada por cajas de masa sin cumbre, sobre la casilla entera.
  - Ninguna pasa de 0,60. La de 0,60 es un rincón de montaña, s37 (15,37). Ninguna de bosque pasa
    de 0,57.
  - Medianas: 0,36 en el pasillo este-oeste de bosque, 0,42 en la punta norte-sur de bosque y 0,04
    en el pasillo este-oeste de montaña.
  - En la vuelta 1, 203 de bosque y 79 de montaña quedaban tapadas en ≥ 80 %.
  - `informe.pasillosTapados` = 0.
- **El paso de s1, fila 17, columnas 29-31**, se ve como hierba de punta a punta en el juego, y las
  copas de la fila 18 solo pisan su borde de abajo (`v2/juego/s1-pasillo-f17-zoom.jpg`, y con `R`,
  `s1-pasillo-f17-normal-R.jpg`).
- **s2 (10,18)**: el rincón se ve.
- **s3 (4-5,18)**: sigue bajo la cumbre (`picos-nevados/8`, 1,95 de alto), exenta.
- **Adversarial, todos se leen como pasillo** (`v2/taller/rec/par-*`): la punta norte-sur de s23
  (1,27) y de s27 (16,22), el pasillo este-oeste de s4 (29,40) y de s18 (18,28) y el rincón de s37.
  - En s27 (16,22) la punta queda con su mitad de arriba a la vista entre peñascos nevados, y los
    abetos de abajo, que no se encogen, le comen la de abajo (`v2/taller/rec/par-s27-puntaNS16-22-64.jpg`).
- **Cumbres.** 157 casillas estrechas siguen tapadas en ≥ 80 % contando las cumbres (156 de
  montaña): es el techo declarado.
- **Dos de hondo.** La casilla de abajo de un pasillo de dos de hondo, con bosque al sur, queda
  tapada en ≥ 80 % en 139 casos de 1-40 (57 con montaña). La fila de arriba queda a la vista y el
  pasillo se lee: s1 (11-12, 8-9) en `v2/taller/rec/par-s1-dosHondo11-9-64.jpg`. Lo dejo como
  observación (H10), no como fallo.
- **El borde no se ha pelado**: el bosque que toca lo pisable sigue con árboles de 0,82 en el p10 y
  1,13 de mediana (cifras del ingeniero). En los recortes, el bosque bajo un pasillo sigue
  leyéndose como masa.

### Hallazgos nuevos o que siguen

- **H8 · menor, preexistente:** un árbol de otra hoja sobre la nieve. El frondoso de otoño de s27
  (25,18), en la reserva, y 6 pies de la masa normal en nieve en 1-40, salen de la hoja de
  `Analisis.suelo` y no del suelo pintado. Se ve como un árbol naranja suelto en la nieve. Para
  repetirlo: `?seed=27`, «Ver mapa entero», mirar bajo la ciudad de (25,17).
- **H9 · menor:** al tope, la nieve que se pisa se parece más a la montaña. Sin los abetos, lo que
  cubre la nieve que se pisa son peñascos nevados grises (módulos 5-8) y montones. Al tope de
  alejar, en el Valle Hondo de s3 (región 3), la nieve que se pisa y la sierra de su sur se
  distinguen solo por tamaño y densidad (`v2/juego/s3-valle-hondo-tope-par.jpg`, a la izquierda el
  juego y a la derecha la vista `R`). Cerca se leen bien. Los peñascos ya estaban; lo nuevo es que
  ganan peso, y el suelo desnudo de la nieve baja de 36,9 a 34,2 % (cifra del ingeniero). Para
  repetirlo: `?seed=3`, alejar al tope sobre el centro del mapa.
- **H10 · menor, a decidir:** el pasillo de dos de hondo. Ver H3. Es la desviación 3 del ingeniero.
  Se lee porque la fila de arriba queda libre.
- **H6 · sigue (preexistente, backlog).** Lo que entra de lado en lo pisable desde lo alto del
  acantilado sube un poco:
  - la cubierta: 152 → 192 piezas, 23 → 28 de más de 0,25;
  - la roca: 1 356 → 1 369, 332 → 346.

  Los peñascos que sustituyen a los abetos en lo alto son más anchos. No son árboles y se leen como
  roca.
- **H4, H5 y H7**, sin cambios en esta vuelta.

### Workarounds usados

- **`?marca=<id>`.** Sirve las dos marcas reales y, para los demás sitios, una marca de QA inventada
  e interceptada en el navegador con `page.route`. Con ella solo se coloca la cámara y se quita la
  niebla (`revealAll`), lo mismo que hace «Ver mapa entero» para quien juega. No pinta ni falsea nada
  del mapa. No afecta a quien juega.
- **Contornos de barrera sobre los recortes** (`ov.py`) y **cajas dibujadas** para medir. Son
  anotaciones: la mitad izquierda de cada `par-*` es la imagen del taller tal cual.

### No probado

- El coste del pintor y el suelo desnudo: se citan los del ingeniero.
- `verify` y `verify:lento`: se citan, como se pidió.
- Los mapas de un plan del agente y la GPU del usuario: solo el procedimental y Chromium sin
  pantalla.
- Las coberturas de H3 se midieron por caja, no por el alfa de cada imagen: sobreestiman lo tapado.
- La revisión visual es una muestra: 10 vistas del juego y 26 recortes. Lo demás de 1-100 se cubrió
  por programa.

### Veredicto de la vuelta 2

**Apto.**

- H1, H2 y H3 están arreglados y se comprueban desde fuera:
  - 0 árboles sobre lo pisable, con los módulos mirados uno a uno;
  - toda casilla de bosque con su árbol, o tapada por una ciudad o una pared;
  - ninguna casilla estrecha tapada más de 0,60 por masa que no sea cumbre.
- Los criterios 1, 3, 4 y 5 cumplen.
- La desviación de H2 no rompe nada: ningún árbol de la reserva toca un objeto ni pisa la senda, y
  la puerta de cada ciudad se ve en el juego.
- `pnpm capturas` sale en verde.
- H8, H9 y H10 son menores y no bloquean.
- Siguen pendientes de la vuelta 1, fuera de esta re-verificación: resolver las dos marcas tras el
  commit (criterio 6) y enseñar al usuario el techo de las cumbres.
