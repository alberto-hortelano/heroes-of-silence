# Segunda auditoría visual del mapa de aventura (07-10-2026, main @ 356d916)

**Qué se miró:**
- Las mismas semillas que en la primera: 1, 2, 5, 9, 13, 24, 34 y 57.
- Cada una pintada entera por el escenógrafo del taller (`pintar.mts`, la misma `componer`), a 96 px por casilla y sin nubes. Mapas en `mapas/<s>-t96.png`, vista entera en `<s>-vista.jpg` y cuadrantes en `<s>-q{a,b,c,d}.jpg`.
- El cliente real (vite en el 3205, Playwright sin pantalla, «Ver mapa entero» y centrado con el minimapa) en las semillas 9, 24 y 57. Consola limpia en las tres. Capturas en `recortes/juego-*.png`. Vite se paró por su grupo y el 3205 quedó libre.
- Medidas con scripts de esta carpeta: `contar2.mts` (nodos y puentes), `altos.mts` y `escala.mts` (alto y ampliación de los picos), `laderas.mts` y `sendas.mts` (laderas altas y laderas sobre la senda), `bordes.mts` y `nivel.mts` (desnivel en los bordes de acantilado).

**El informe automático sigue a 0 en las 8 semillas**, ahora también `carasLisas`. El suelo desnudo ha subido en 6 de 8 semillas: s57 pasa de 17,6 % a 23,1 % y s1 de 16,6 % a 19,0 %.

**Coordenadas:** (x, y), con la x hacia la derecha y la y hacia abajo.

---

## 1. Tabla comparativa

| # | Defecto de la primera auditoría | Entonces | Ahora | Veredicto |
|---|---|---|---|---|
| 1 | Caras de roca lisas (#159) | ~14 en 7 de 8 semillas | 0: ni en los 10 sitios de entonces (`recortes/01-caras-antes.png`) ni en las 8 vistas | **Resuelto** (#159/#170) |
| 2a | Puentes quebrados o diagonales (#161) | 27 puentes; 7 diagonales o quebrados | 19 puentes; 7 diagonales (`ne-so`/`no-se`), 0 quebrados (todos con escala 1) | **Mejor** |
| 2b | Puente que acaba contra una pared | 3 | 3 claros: s24 node-1 (25,7), s24 node-8 (8,26) y s9 node-2 (21,8). Los 3 son de troncos y en diagonal (`02-puente-contra-pared.png`, `juego-24-25-8.png`) | **Igual** |
| 2c | Molino sobre un estribo, s57 (#166) | 1 | 0 en estas semillas (el mapa de s57 cambió) | Resuelto aquí; #166 sigue abierta por otras semillas |
| 3 | Escaleras de nodo a ningún sitio (#168) | 11 en 6 semillas | 0: ya no sale ningún `nodo-paso-acantilado` | **Resuelto** |
| 4 | Bordes de barrera rectos (#169) | Tramos de 10 casillas o más en 5 semillas | Los mismos: s24 (18-34, 6-7) y (0-16, 24-26), s2 (10-24, 22-23) y la frontera de nieve de s13 en x 22-23 | **Igual** |
| 5 | Lenguas de ladera sobre la senda o el agua (#160) | ~4 claras | s24 (24, 10-11) sigue igual. Aparece la V de s9 (nuevo A). Hay 26 laderas candidatas a tapar la senda (`sendas.mts`); de ellas, unas 6 claras | **Igual o peor** |
| 6 | Hito desproporcionado, con horca | 11 hitos de 2,2 casillas | 22 hitos de 0,97 casillas y sin poste. Ahora se lee como una lápida (nuevo E) | **Mejor** |
| 7 | Veta blanca en las caras nevadas (#160) | ~6 en 2 semillas | 0 en los sitios de entonces y ninguna vista en las 8 vistas (`07-veta-blanca.png`) | **Resuelto** (no se buscó una a una) |
| 8 | Pedregal oscurecido en el llano | 1 | 0: el de s9 (27, 28) ya no está (`09-pedregal-s9.png`) | **Resuelto** (#170) |
| 9 | Alfombra de roca en los macizos | 4 de 8 semillas | Las cumbres tienen agujas, luz y collados (`09-macizo-s1.png`). Las faldas siguen siendo bloques chatos iguales | **Mejor** (#171) |

---

## 2. Defectos nuevos o no vistos la primera vez (de más a menos grave)

### A. Dos laderas de 3,7 casillas forman una V sobre la senda, delante del castillo del norte — **#160** (es su caso «dos laderas enfrentadas en un fondo de dos casillas»)
- **Dónde:** s9, (21,5-23, 9,5-13,4), al oeste de town-2 (24, 10). Son `laderas-roca-oeste-3/fin` en (22,5, 13,3) y `laderas-nevadas-este-3/medio-a` en (22,0, 13,4).
- **Qué se ve:** las dos losas nacen juntas en el pie y se abren hacia el norte hasta meterse en el lago. La senda que va al castillo pasa por debajo de la V y desaparece. Es la pieza más alta de esa parte del mapa y lo primero que se ve al llegar al castillo.
- **Recortes:** `recortes/n-v-laderas-s9.png` y, en el juego, `recortes/juego-9-22-11.png`.
- **Cuántas:** 1 clara en las 8 semillas. Del mismo tipo, más leves: en s1 (23,5-24, 14-18) una ladera baja por el río y en s57 (5-7,5, 12-15,5) hay dos cadenas enfrentadas.
- **Causa probable:** un corredor de nieve de 2 casillas, (21-22, 11-14), entre dos caídas de 3. `sinBarrancos` solo quita las laderas en los barrancos de 1 casilla, y cada lado pone la suya. `laderasEnfrentadas` no lo cuenta y `spritesSobreSenda` no mira las laderas.

### B. Acantilados a ras del lado alto: una barrera que no se ve — **nueva** (vecina de #143)
- **Dónde:**
  - s57 (20-25, 4-9): toda la mancha de acantilado está al nivel 2, igual que la lava de alrededor;
  - s24 (19-25, 11-15);
  - s1 (8-13, 11-17);
  - s34 (16-25, 5-8) y (3-8, 21-24).
- **Qué se ve:** casillas por las que no se pasa, pintadas con la misma cubierta que el suelo vecino: pedregal de lava, nieve con rocas o arena con pináculos sueltos. Desde el lado alto no hay cara ni pared ni reborde. Quien juega no sabe por dónde se anda. En s57 el paso de node-1 (26, 5) queda como una raya fina entre dos manchas que no se distinguen del llano.
- **Recortes:** `recortes/n-meseta-pedregal-s57.png`, `recortes/n-barrera-a-ras-s1.png` y `recortes/acantilado-sin-desnivel.png`. En el juego, `recortes/juego-57-23-6.png`, con el cursor sobre la casilla (23, 6), que es acantilado.
- **Cuántas:** de los bordes entre acantilado y suelo, quedan sin desnivel:

  | Semilla | Bordes sin desnivel | Casillas |
  |---|---|---|
  | s1 | 35 de 66 (53 %) | 23 |
  | s24 | 52 de 130 (40 %) | 34 |
  | s34 | 102 de 260 (39 %) | 69 |
  | s57 | 72 de 319 (23 %) | 52 |
  | s2 | 34 de 156 (22 %) | 26 |
  | s5, s9 y s13 | 11-13 % | — |

  Lo midió `bordes.mts`.
- **Causa probable:** `relieve.ts:145`. El acantilado entre dos niveles toma el del lado alto (`hi`) y queda a ras con esa región. Una mancha de acantilado entre regiones del mismo nivel solo baja donde toca el agua. Lo que no tiene cara se viste como suelo.

### C. La aguja de lava de s9: borrosa y de otro material que su macizo — **nueva** (secuela de #171)
- **Dónde:** s9 (9,8, 21,5), sobre town-5 (9, 23), en un macizo nevado. Es `picos-volcan/2` a 3,01 casillas.
  - Si «el castillo del norte» es town-2 (24, 10), lo que tiene delante es la V del punto A, no lava.
- **Qué se ve:** una aguja negra con vetas de lava, borrosa a la vista, la pieza más alta de la zona y más que el castillo de delante, que mide unas 2 casillas. En el juego se lee como una mancha desenfocada, no como un volcán (`recortes/juego-9-10-21.png`).
  - **Por el alto no se sale de escala:** las cumbres van de 2,9 a 3,6 casillas en las 8 semillas.
  - **Lo que falla es la resolución:** la imagen mide 142×149 px y a 3,01 casillas se amplía ×2,4 a 120 px por casilla.
  - **Y el contraste:** es la única pieza de lava entre picos nevados.
- **Recortes:** `recortes/volcan-s9.png` y `recortes/juego-9-10-21.png`. Las otras cumbres altas están en `recortes/cumbres-altas.png`.
- **Cuántas:** 4 de 432 picos de volcán pasan de ×1,6 (s9 dos veces, s2 y s57), y 2 de 384 de arenisca. El de s9 es el único que se nota de verdad.
  - Del mismo tipo, por el material: en s57 (16, 17-18) sale una aguja gris (`picos-afilados/6`) entre arenisca roja.
  - Ninguna otra cumbre se lee desproporcionada:
    - s13 (18, 13,5) y s34 (13,6, 8,5) quedan bien;
    - s24 (7-8, 0-3) asoma por encima del mapa solo en el taller: en el juego lo corta la cámara (`juego-24-7-2.png`).
- **Causa probable:**
  - `siluetaDe` (`colocar.ts`) ordena los módulos por ancho entre alto, y en `picos-volcan` los más esbeltos son los de menos resolución (4, 2, 3 y 1, de 130 a 175 px de alto): la cumbre se queda con la imagen más pequeña y la estira al alto mayor.
  - La hoja sale del suelo de cada casilla (`hojaDePico`), y un macizo que linda con lava y nieve mezcla los dos.

### D. El mojón del nodo se lee como una lápida y se repite — **nueva** (vecina de #168)
- **Dónde:**
  - s34: seis, en (15, 6), (27, 8), (24, 13), (9, 20), (2, 22) y (7, 25);
  - s57: cuatro;
  - s9: cuatro;
  - s2: cuatro.
- **Qué se ve:** una losa clara con una cruz, siempre igual y muy contrastada, muchas veces en mitad de un llano sin camino. Se lee como una tumba, y en s34 salpica el mapa.
- **Recorte:** `recortes/hitos.png`.
- **Cuántos:** 22 en 6 de las 8 semillas. Hay el doble que esta mañana porque #168 los puso también donde iban las escaleras.
- **Causa probable:** una sola pieza `nodo-hito` para todo nodo de acantilado, sin variantes por suelo ni orientación.

### E. Llanos de lava o de suelo áspero enormes y monótonos — **nueva** (menor; arte)
- **Dónde:** s57, de (18-33, 2-13) y la mitad oeste; el centro de s2, (8-24, 12-22); y s9 (0-9, 8-20).
- **Qué se ve:** 10-15 casillas seguidas de la misma `cubierta-lava` o `cubierta-rough` (pedregal gris con grietas), sin un claro ni un cambio. A zoom medio es una textura de ruido. Se suma a B: por eso la barrera no se distingue.
- **Recortes:** `mapas/57-qb.jpg` y `recortes/juego-57-23-6.png`.
- **Cuántas:** en 3 de las 8 semillas.
- **Causa probable:** la cubierta tiene densidad y piezas constantes por suelo, sin claros. Con 23 % de suelo desnudo en s57, se ve más.

### Ya abierto y confirmado

- **#173:** el paso de montaña sin camino de s1 (26, 6) queda enterrado bajo los picos (`recortes/puentes-y-pasos.png`).
- **#172:** el muro bajo de s9 no se volvió a mirar.

---

## 3. Juicio

**¿Está «bien»?** Todavía no, pero está cerca.

**Lo que ya funciona:**
- Lo que más rompía la ilusión esta mañana ya no está: las caras lisas, las escaleras sueltas, el hito con horca, el pedregal negro y la veta blanca.
- Los macizos tienen cumbre.
- Los puentes rectos de piedra se leen bien, con la subida en su sitio.

**Lo que queda:** a zoom medio sale como mucho un fallo serio por mapa (la V de s9, un puente contra la pared). El defecto más extendido es de legibilidad, más que de pintura: **en 5 de las 8 semillas hay acantilados que, desde el lado alto, no se distinguen del suelo**. Para quien juega es peor que un sprite feo, porque no sabe por dónde se anda.

**Los 3-5 arreglos que más se notarían ahora:**
1. **Que toda barrera de acantilado se vea (B).** Un reborde, un canto de peñascos o una cubierta propia de «roca impracticable» en las casillas de acantilado a ras. O que el acantilado nunca quede al nivel de la región alta. Es lo que más afecta al juego, sale en 5 de 8 semillas y se suma a la monotonía de E.
2. **Barrancos de dos casillas sin laderas enfrentadas, y laderas que no tapen la senda (A y #160).** Ampliar `sinBarrancos` a los fondos de 2 y apartar las laderas del pasillo de la senda aunque no baje por ellas.
3. **Puentes diagonales a distinto nivel (2b).** Una variante `-sube` en diagonal, o dejar el eje diagonal solo cuando las dos orillas están a la altura del tablero. Si no, que el estribo alto se apoye en lo alto de la cara.
4. **Quebrar los bordes rectos (#169).** Sigue igual y es lo que el usuario pidió por su nombre; se nota sobre todo al alejar y en el minimapa.
5. **Pulir las cumbres y el mojón (C y D).** Que `siluetaDe` no amplíe un módulo más de ×1,3 y que una cumbre sea de un solo material. Y dar al mojón dos o tres variantes, sin cruz, o quitarlo donde el nodo no tiene camino. Son baratos.
