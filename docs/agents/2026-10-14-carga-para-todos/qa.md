# QA — Todos cargan y el jinete cobra más (#260)

Fecha: 14-10-2026. Rama `claude/combat-decision-system-88e11e`, commit `9b179e7d` (las cinco tareas de la arena juntas y simplificadas). Validado contra la petición literal:

> Ahora mismo en la arena no he podido hacer ninguna carga
> He probado con el guerrero con escudo y en ningun momento se marca la carga

También contra las decisiones del usuario: todos los que pegan cuerpo a cuerpo cargan y el jinete más; a pie, +5 % por casilla, y el jinete, +10 %; tope de 5 para los dos; la recta, como estaba. Y contra las del /simplify: Rápido cobra la carga solo en el primer golpe, y al soltar con Escape se devuelve lo gastado al camino barato.

## Cómo se probó

- `pnpm verify`, una vez: `Test Files 129 passed | 1 skipped (130)`, `Tests 3251 passed | 14 skipped (3265)`.
- `pnpm banco`: `066767b4179e0f617e21107148184ce052fff9ae7f16bbb4881b12a3218af995`, «ancla: igual».
- `pnpm vitest run test/carga.test.ts …`: 16 de 16.
- No corrí `verify:lento` ni `capturas` (ya en verde en este commit).
- **El navegador**:
  - Un Vite propio en `127.0.0.1:3467`, con un `cacheDir` propio en el scratchpad, arrancado con `set -m`.
  - Parado por su grupo: el puerto queda libre y el 3187 sigue.
  - Playwright sin pantalla, con clics reales.
  - Un espejo en Node, con la misma escena de batalla, da el píxel de cada jugada.
- **Oráculo** (scratchpad): en peleas de la arena IA contra IA, semillas 1-200, cada carga que se enseña (`casillasDeCarga`) se comprueba:
  - recta ≥ 3;
  - el objetivo es la casilla que sigue en la recta;
  - la casilla se alcanza;
  - casillas = mín(recta, 5);
  - porcentaje = casillas × 5 a pie o × 10 con `charge`.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | **El guerrero con escudo tiene la carga marcada cuando la geometría lo permite, y la cobra** (la frase del usuario) | ✅ | **El flujo del usuario, a clics**: `/arena/?seed=5`, el guerrero con escudo a la izquierda y el zombi a la derecha desde la lista, con las cifras del borrador de este worktree, y «Luchar». En la ronda 4, con el guerrero en (1,4) y el zombi en (5,4), el tablero marca la casilla (4,4) con «»3» y al zombi en naranja (`capturas/carga-guerrero-marcada.png`). Al pasar por el zombi, la casilla dice «+15 %» y la barra: «Golpearías desde (4,4), cargando 3 casillas (+15 % de daño). Daño 13–37 … carga de 3 casillas a pie ×1,15; −7 armadura.» (`capturas/carga-guerrero-hover.png`). El clic carga y el parte dice «Guerrero con escudo → Zombie (carga de 3 casillas a pie, +15 %): 29 de daño (−7 armadura), 0 bajas» (`capturas/carga-guerrero-parte.png`). Consola limpia. Ver la observación O1 sobre cuándo se da. |
| 1b | Cualquier unidad de a pie | ✅ | El oráculo da 222 cargas enseñadas en 1-200 semillas, de todas las hojas de tropa (también arqueros con daga), con 0 mal. El héroe de la arena y el arquero con daga cargan en `test/carga.test.ts`. |
| 2 | El jinete cobra más que el de a pie con la misma recta; topes | ✅ | **Navegador**: a pie, el escudero hace 4 casillas, «+20 %», «×1,2» (`capturas/escudero0-hover.png`). Con 5 casillas, «+25 %», «×1,25», y el parte «(carga de 5 casillas a pie, +25 %)» (`capturas/escudero1-hover.png`, `capturas/escudero1-parte.png`). El hermano de carga, con una recta de 6 (en la captura, de (2,4) a (8,4); también de (0,4) a (6,4) en otra pasada), cobra 5 casillas (tope), «+50 %», «carga de 5 casillas ×1,5», «con Lanza de jinete (en la carga)», y el parte «(carga de 5 casillas, +50 %)» (`capturas/jinete-hover.png`, `capturas/jinete-parte.png`). **Núcleo**: el oráculo comprueba tope y porcentaje en las 222 cargas (0 mal). `test/carga.test.ts` mira las rectas de 3, 4 y 6: a pie 15/20/25 %, jinete 30/40/50 %. +30 y +40 % del jinete no los vi en el navegador: los dan el oráculo y los tests. |
| 3 | La previsión, la ficha y el parte dicen cuánto cobra cada uno | ✅ | **Previsión**: la barra, arriba. **Ficha**: a pie, «Carga ⓘ Espada · Ataque 5 · Daño 18–40 · +5 %/casilla (3 a 5), a pie»; el jinete, «Carga ⓘ Lanza de jinete · Ataque 10 · Daño 50–90 · +10 %/casilla (3 a 5)» (`capturas/jinete-hover.png`). **Parte**: arriba. |
| 4 | La rueda con cargas a pie: andar, elegir y golpear; con Escape se pierde la carga | ✅ | Navegador, `?seed=5&golpe=rueda&contacto=paga`: el guerrero anda a (4,4) y se abre la rueda. Los sectores ya llevan la carga (Fuerte 20–48, Rápido «6–19 + 4–16»; `capturas/ruedapie-rueda.png`). Con Escape se queda en (4,4) y la barra dice «Golpe cancelado.» (`capturas/ruedapie-tras-escape.png`). Al volver a pasar por el zombi, la barra no dice «cargando» y Rápido sale «2 × 4–16». Los dos golpes, sin `charge` en el registro (`capturas/ruedapie-segundo-golpe.png`). Sin Escape, eligiendo Rápido, el primer golpe lleva `charge: 3, cargaAPie: true` y el segundo no lleva nada. En el parte: «(carga de 3 casillas a pie, +15 %): 6 de daño», y después «4 de daño» (`capturas/rapido-templario-escudo-rapido-parte.png`). |
| 5 | El juego no cambia: hash, solo carga quien tiene `charge`, un guardia | ✅ | `pnpm banco` con el mismo hash. El guardia «solo la arena enciende un modo de la arena» está en verde: por conducta, el espadachín no carga con `createBattle` y el guerrero de la arena sí. Lo vio morder el ingeniero. |
| 6 | Tests con cifras exactas, a pie y a caballo, con rectas de 3, 4 y 6 | ✅ | `test/carga.test.ts`: 16 en verde. |
| D | Rápido cobra la carga solo en el primer golpe (decisión del /simplify) | ✅ | En el navegador, a pie (arriba) y con el jinete: «Rápido 52–98 + 4–16». El primer golpe, de 52 con `charge: 5`; el segundo, de 4 sin carga (`capturas/rapido-templario-hermano-de-carga-rueda.png`, `…-rapido-parte.png`). Ver O2. |

## Pasada adversarial

- **Contacto + carga + rueda + Escape**: lo del criterio 4, con `contacto=paga`. Plantado, `golpeEnCurso` lleva `{carga: 3, barato: 3, carrera: 3}`; tras Escape lo gastado se queda en 3, en la casilla, y el turno sigue abierto. La recta más cara que el camino barato la cubre el test de `salir-del-contacto.test.ts`; en el navegador no se pudo montar (ver el QA de #259).
- **Carga con muralla**: núcleo con semillas 1-300, muralla, rueda y contacto. 117 cargas plantadas y soltadas (lo gastado, siempre el del camino barato), 0 que lanzan y 0 que no terminan.
- **Pegado de salida** o **recta de 2**: no se enseña. El oráculo exige recta ≥ 3 y el objetivo en la recta: 0 fuera de regla.
- **Escape repetido** o **Escape sin rueda abierta**: no cambia nada. El segundo intento ya no carga.

## Hallazgos

Ninguno bloqueante ni importante.

### H1 — menor (texto): la rueda y el «Golpe cancelado» no dicen nada de la carga

- **Al abrir la rueda tras una carrera**, los números de los sectores ya traen la carga (Fuerte 20–48 frente a 15–37), pero no hay ningún rótulo de «carga +15 %». La barra que lo decía queda debajo del diálogo.
- **Con Escape**, la barra dice solo «Golpe cancelado.». No dice que se queda donde llegó ni que la carga se pierde.

Quien juega lo descubre al volver a pasar por el enemigo. El criterio 4 se cumple (la carga se pierde), pero no se le cuenta.

### H2 — menor (texto): la ayuda del panel dice siempre «»3»

«Al enemigo en naranja se le puede cargar: pasa por él y elige la casilla del número («»3»)» sale también con el jinete, que en el tablero enseña «»5» o «+50 %». Es un ejemplo fijo, pero puede despistar.

## Observaciones (no son fallos)

- **O1, la frase del usuario.** Con las cifras de este worktree, el guerrero con escudo anda 3 casillas (4 menos 1 del escudo). Solo puede cargar con el enemigo **exactamente a 4** en una recta, y siempre cobra +15 %: el tope de 5 a pie no lo alcanza nunca.
  - Contra el zombi (`?seed=5`), quedándose quieto (Defender) **no se marca nunca**: el zombi pasa de 5 a 3 de distancia y nunca queda a 4.
  - Si avanza 1 casilla el primer turno, se marca en la ronda 4.
  - Así que el usuario puede volver a «no ver la carga» si espera quieto. Es la geometría, no un fallo, pero conviene decírselo.
- **O2, a confirmar.** Con Rápido, el segundo golpe no solo pierde la carga: cambia de arma (`usoDelGolpe`: sin carga, cuerpo a cuerpo). El jinete pega el primero con la lanza (52–98) y el segundo con la espada (4–16). El ingeniero lo dejó dicho «por si no se quería» (`implementacion-simplify.md`, D). A pie no se nota (espada y espada).
- **La IA no busca la recta** (fuera de alcance; decisión del usuario).

## Workarounds usados

- **Para las pruebas de topes, rueda y Rápido, la pelea entra por el enlace** (`?montaje=` hecho con `montajeALaURL`), con las cifras de la hoja y 2 000 PV a los dos para que la pelea no acabe antes de la carga. Es lo que hace «Copiar enlace», y la vida se edita en la ficha. La frase literal del usuario la probé a clics desde la lista, sin enlace ni cambios.
  - **Veredicto**: no afecta a quien juega.
- **La pauta «avanza 1 casilla el primer turno y después defiende»** para que la geometría deje cargar. Es una jugada normal.
  - **Veredicto**: no afecta.

## No probado

- **+30 % y +40 % del jinete en el navegador**: solo en el oráculo y los tests.
- **La recta más cara que el camino barato, con Escape, en el navegador**: solo el test.
- **El guardia visto morder por mí**: no toco código.

## Veredicto

**Apto.** El guerrero con escudo ya marca y cobra la carga: «»3», +15 % en la barra, la ficha y el parte. El jinete cobra el doble con los mismos topes, la rueda y Escape se portan como se decidió, y el juego no cambia. Quedan dos hallazgos menores de texto y dos cosas para decirle al usuario: O1 y O2.
