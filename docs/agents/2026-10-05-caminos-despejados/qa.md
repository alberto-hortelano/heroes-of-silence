# QA: los caminos del mapa, despejados

Validado el 05-10-2026 sobre el diff sin commitear encima de `9da3b4e`, que es el «antes».

- **El antes** se sacó con `git archive 9da3b4e` en el scratchpad. Su `node_modules` es un enlace al del repo, puesto en el árbol copiado y no dentro de `node_modules`.
- **Navegador**:
  - las dos primeras miradas al juego fueron en el Chrome del usuario, en el puerto 3171 (después) y en el 3172 (antes);
  - el coordinador lo prohibió a mitad de la validación; cerré las dos pestañas y no volví a usarlo;
  - todo lo demás fue con Playwright y el Chromium sin pantalla: el taller, `pnpm capturas` y `medir.ts`, copiado de la nitidez.
- **Procesos**:
  - mis dos vites se mataron por su grupo y `ss` los dio libres;
  - `pnpm capturas` y `medir.ts` levantaron y mataron sus propios vites, y `ss` lo confirma;
  - el 3100 y el 3636 no son míos y no los toqué.

Capturas de esta QA en `capturas-qa/`. En las comparativas, arriba o a la izquierda está el antes y abajo o a la derecha el después.

## Criterios

| # | Criterio (petición y decisiones del usuario) | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Los caminos se leen de punta a punta y nada los tapa: ni labranza, ni matas, ni piedras, ni árboles, ni picos | ✅ cumple | Taller a 48 y a 110 px, semillas 1, 3 y 7 y dos al azar (495 y 262): `sprites sobre la senda 0` y `barrera sin formación 0` en las cinco. Mirado a ojo: `s1-labranza`, `s1-bosque`, `s1-hierba`, `s7-cienaga`, `s495-nieve`, `s495-lava` y `despues-s262-entera`. La senda de la ciénaga de la semilla 7 y la de la labranza de la 1, antes invisibles, se siguen enteras. En el juego (semilla 1, zoom máximo, 1512 px de ancho) el camino sale del castillo y se lee hasta el pueblo; en el antes, la labranza lo tapaba (vistos los dos lado a lado). |
| 1b | … en el zoom máximo y al tope de alejar | ✅ cumple | `medir.ts`, 1983×1053@1,09 y 3840×2160, semillas 1, 3 y 7, dos vueltas: capturas en el máximo y en el tope (`tope-s1.jpg`). A unos 41 px por casilla en el tope 4K la senda sigue siendo una línea clara. |
| 2 | El arcén se ve natural: ni mancha ni carretera | ✅ cumple | `s1-hierba` (110 px): una franja de hierba algo más oscura y difusa, que no se lee como banda. En la nieve (`s1-bosque`), un gris de nieve pisada, y en tierra no se nota. No vi ningún caso que se lea como carretera. Que la ciénaga se vea como un canal ancho no es del arcén (hallazgo 4). |
| 3 | El mapa no queda pelado, las barreras siguen formadas y bosques y cordilleras se leen como tales | ⚠️ cumple con reservas | `casillasDeBarreraSinFormacion` = 0 en 1, 3, 7, 495 y 262. Bosques: se leen (`s1-bosque`). Cordilleras atravesadas por muchos caminos: se aclaran mucho (hallazgo 2). El desnudo de la semilla 1 sube de 9,6 a 14,6 %, comparando igual con igual según `implementacion.md`. Mis cifras de 495 y 262 (21,0→21,9 y 19,9→20,4 a 48 px) **no** comparan igual con igual, porque la silueta del antes es de 0,2 y la del después de 0,8. |
| 4 | Rendimiento frente a `9da3b4e`: tiempo hasta pintar el suelo, fps y tareas largas | ✅ cumple | `medir.ts`, alternando antes y después en la misma sesión, 24 medidas sin errores en consola (detalle debajo). Ninguna diferencia fuera del ruido. |
| 5 | El espectador y el taller funcionan | ✅ cumple | Espectador: `pnpm capturas` (`espectador-01…04`); en `espectador-04-fin-de-partida.png` (partida terminada, mapa del agente) los caminos se leen. Taller: `pnpm taller escenario 1 3 7 495 262` sale 0 e imprime `sprites sobre la senda 0`, sin errores. |
| 6 | `pnpm capturas` en verde | ✅ cumple | `capturas exit 0` · «sin errores en consola; … 216.4 s». |
| 7 | Pasada adversarial: diagonal, acantilado, ciudad o mina, ciénaga, nieve y borde | ⚠️ con hallazgos | Diagonales: se leen en todas las semillas. Ciudad, pueblo y mina: la senda llega hasta el objeto horneado, que es excepción (`s7-sureste`, `s1-bosque`). Nieve: ✅. Borde: las sendas que llegan al borde se leen (lado derecho de la 495 y minas del borde izquierdo de la 7). Acantilados y agua: costuras y rectángulos de cara de roca a la vista (hallazgos 1 y 3). Ciénaga: hallazgo 4. |
| — | `pnpm verify` | ✅ | Salida 0: «Test Files 54 passed (54) · Tests 1792 passed (1792)». |
| — | `pnpm banco`, ancla igual | ✅ | `sha256 1b90bfd9…d599` · «sin terminar 0/200» · «ancla: igual». |
| — | `pnpm qa` | ✅ | Salida 0: «terminado: 1 mapa diseñado, 6 turnos de mapa, 80 decisiones de batalla y 1 ascenso de tropa a héroe». |
| — | CLAUDE.md e historia (C8) | ✅ | Una línea en «Mapa de aventura» y un párrafo con cifras y fecha en `docs/historia.md`. |

### Rendimiento (medido aquí, `medir.ts`, dos vueltas)

| Pantalla | Semilla | `pintadoMs` antes → después | Tarea larga máxima al cargar, antes → después | fps máx. quieto/arrastrando | fps tope quieto/arrastrando |
|---|---|---|---|---|---|
| 1983×1053@1,09 | 1 | 7 604 · 7 325 → 7 689 · 7 498 | 92 · 107 → 93 · 109 ms | 60/60 → 60/60 | 60/60 → 60/60 |
| 1983×1053@1,09 | 3 | 8 139 · 8 168 → 8 188 · 8 132 | 105 · 95 → 88 · 83 | 60/60 → 60/60 | 60/60 → 60/60 |
| 1983×1053@1,09 | 7 | 7 585 · 7 671 → 7 515 · 7 570 | 97 · 111 → 97 · 112 | 60/60 → 60/60 | 60/60 → 60/60 |
| 3840×2160 | 1 | 7 576 · 7 520 → 7 594 · 7 604 | 106 · 110 → 99 · 97 | 36-37/34-35 → 36-37/35-36 | 33-36/34-36 → 37-38/36-37 |
| 3840×2160 | 3 | 8 146 · 8 183 → 8 386 · 8 208 | 108 · 82 → 125 · 92 | 37/35-36 → 37/36 | 36/36 → 37/34-37 |
| 3840×2160 | 7 | 7 699 · 7 533 → 7 651 · 7 670 | 77 · 131 → 105 · 99 | 36/35-36 → 36/35-36 | 36/36 → 36-37/36 |

- Hay 0 o 1 tareas de más de 100 ms al cargar, en los dos lados.
- `pintadoMs` se mueve dentro de un ±3 %.
- Ningún error en consola, en las 24 medidas.
- En el taller, `msPintar` a 110 px da 4 727 / 4 663 / 5 029 ms en el después y 4 496 / 4 625 / 5 048 ms en el antes (semillas 1, 7 y 495): igual.

## Hallazgos

### Importantes

**1. Las costuras rectangulares del suelo, del nivel y del agua quedan a la vista justo donde pasan los caminos.**
- **Qué ve quien juega**:
  - parches de tierra o agua con bordes rectos y esquinas en ángulo recto, pegados a la senda;
  - el agua que bordea un camino termina en línea recta: la orilla se aparta ahora de la senda (436→423, 143→104 y 164→130 en las semillas 1, 3 y 7), y lo que la vestía ya no tapa el borde de la máscara;
  - en el juego, en el zoom máximo de la semilla 1, hay un rectángulo oscuro de unas dos casillas al sur del castillo, al lado de la senda.
- **Es anterior al cambio** (en el antes ya asoman trozos), pero el cambio lo pone delante: lo que lo tapaba era la cubierta sobre el camino.
- **Reproducir**:
  1. `pnpm taller escenario 7`, o el juego con `?seed=7`, zoom máximo junto al puente del noroeste;
  2. en el taller a 110 px, las casillas 5-12 × 3-11 (`capturas-qa/s7-puente.jpg`): el agua de la ciudad tiene bordes rectos en y≈11 y x≈9;
  3. más casos: `s7-acantilado.jpg` (dos rectángulos grises sobre la nieve), `s7-sureste.jpg` (rectángulos verdeazulados) y `juego-s7-z.jpg` (el juego, a la derecha).
- **Lo que esperaba quien juega**: que el suelo junto al camino se funda, como en el resto del mapa.
- El coordinador ya lo deja para una issue (backlog 1 del plan). Lo subo a importante porque es lo primero que ve el ojo una vez despejado el camino, sobre todo junto al agua.

**2. Una cordillera atravesada por una red densa de caminos se queda en un llano con piedrecitas.**
- **Qué ve quien juega**:
  - En la semilla 7, al oeste de la ciudad del centro (`s7-acantilado.jpg`), había un macizo nevado con caminos ocultos dentro. Ahora es un rombo de nieve lisa cercado por cuatro caminos, con dos picos diminutos: cuenta como «formación», pero no se lee como cordillera.
  - En la 495 (`s495-nieve.jpg`), el macizo nevado entre ramales pierde más o menos la mitad de su masa.
  - En la 7, sureste (`s7-sureste.jpg`), el macizo de roca rodeado por un lazo de camino queda como roca baja en medio de un llano de tierra.
- **Por qué cumple igual el criterio**: `casillasDeBarreraSinFormacion` = 0, y son los márgenes que el usuario decidió (`MARGEN_DE_MASA` 0,2 y encoger antes que quitar). Pero el criterio del usuario dice «que bosques y cordilleras se lean».
- **Lo que esperaba quien juega**: un paso de montaña que se lea como paso, con montaña a los lados.
- **A decidir por el usuario**:
  - aceptarlo, porque es la geometría honesta: esas casillas son camino;
  - o compensar por fuera del pasillo, con picos más altos o más densos al otro lado.

### Menores

**3. Rectángulo liso de cara de roca donde la pared se quita por la rampa.**
- **Dónde**: semilla 7, en el acantilado junto al puente del noroeste (`s7-puente.jpg`, abajo, hacia x 290-330).
- **Qué ve quien juega**: el acantilado queda partido en dos, con un hueco que enseña la textura plana de la cara.
- Está dicho en `implementacion.md` (desviación 4) y en historia, y se deja para la issue A5. Lo apunto porque se ve en el zoom máximo del juego (`juego-s7-z.jpg`).

**4. La ciénaga de la semilla 7 se lee como un canal.**
- **Qué ve quien juega** (`s7-cienaga.jpg`): la senda se lee perfecta, pero queda en medio de una franja de unas dos casillas de suelo de ciénaga liso, con un borde recto a la derecha. En el antes, el voladizo de los «muertos» la tapaba.
- No es el arcén: es el suelo de las casillas de camino, que en la ciénaga no lleva cubierta baja, más la costura del hallazgo 1.
- Se ve en el juego con `?seed=7` al llegar a esa zona.

**5. En 4K se aleja casi el doble y asoman picos fuera de la niebla.**
- **Qué cambia**: al haber unos 25 % menos de volúmenes, `topeDeAlejar` deja alejar más en 4K. En la semilla 1 se pasa de unos 75 a unos 41 px por casilla (`tope-s1.jpg`; la zona explorada mide 591 px de ancho antes y 330 después).
- **Qué ve quien juega**: el mapa se ve diminuto en la pantalla grande, y asoman dos picos de una zona sin explorar por encima del borde superior. Es la fuga bajo la niebla que ya cita `implementacion.md`: anterior al cambio, pero que el nuevo encuadre deja a la vista.
- **Reproducir**: `?seed=1` a 3840×2160 y la rueda hacia atrás hasta el tope.
- **Lo que esperaba quien juega**: no ver nada de lo que no ha explorado.

## Workarounds usados

- **El taller para mirar el mapa entero sin niebla.** No afecta a quien juega: pinta con la misma `componer`/`pintarSuelo`/`separar`, y lo crucé con el juego (semillas 1 y 7, zoom máximo) y con el espectador. Las nubes del taller son decorado: tapan bordes distintos en el antes y en el después, porque el azar se consume en otro orden. Lo que miré del borde estaba fuera de ellas.
- **Comparar el desnudo de 495 y 262 con la cifra del informe tal cual.** Las siluetas son distintas, así que no lo uso como evidencia de C5: me quedo con la tabla igual con igual del ingeniero (semillas 1, 3 y 7) y con lo que se ve.

## No probado

- **El juego sin arte** (los marcadores): no lo miré en el navegador. Solo están el test de `cajaDeSprite` del marcador y los triángulos de los monstruos en el taller, que no pisan la senda.
- **El turno del rival y un héroe fuera del castillo** en el juego: no lo recorrí a mano. El escenario no depende del turno. La partida avanzada y terminada sí está vista en el espectador (`espectador-04-fin-de-partida`).
- **Volver a ver morder el guardia de `spritesSobreSenda`**: no lo hice, porque tocaría el código. Me fío del registro del ingeniero (5 tests en rojo con `|| true`), y el test recalcula la cifra por su cuenta.
- **El pico de memoria**: `medir.ts` lo mide (PSS), pero el ingeniero ya dejó dicho que no discrimina, y no lo uso.

## Veredicto

**Apto con reservas.**

Lo pedido se cumple: los caminos se leen de punta a punta en todas las semillas y escalas que miré, el arcén es discreto y el rendimiento no cambia. Todo está en verde: verify, banco con el ancla igual, qa y capturas.

Las reservas son lo que el despeje deja a la vista:
- las costuras rectangulares, sobre todo junto al agua, ahora que la orilla se aparta;
- las cordilleras con muchos caminos, que se quedan en llano.

Ninguna rompe el juego, pero las dos las nota quien juega en la primera partida. La 1 pide la issue que ya está prevista, y conviene subirle la prioridad. La 2 la decide el usuario mirando `s7-acantilado.jpg` y `s495-nieve.jpg`.
