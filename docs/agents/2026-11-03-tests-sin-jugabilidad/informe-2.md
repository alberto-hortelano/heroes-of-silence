# Informe, vuelta 2 — las reglas que se quedaron sin test, otra vez con test

Rama `claude/troop-battle-ordering-b96a77` sobre `b0e0ba5f`. Sin commitear. Solo se toca `test/`
(y este informe): ni `src/` ni `data/`. Petición: `requisitos-2.md`.

## Resumen

- Las **12 reglas** vuelven a tener test: **37 tests nuevos** en 11 ficheros tocados y uno nuevo
  (`test/marcha-que-se-para.test.ts`).
- Cada test se vio morder: rota a mano la regla en un worktree desechable, en rojo; deshecha, en verde.
- Ninguno se rompe con las **23 perturbaciones válidas** de `perturbar.py` (P1-P9, Q1-Q8, R1-R6),
  corriendo solo los ficheros tocados.
- `pnpm typecheck` y `pnpm lint` en verde; los 12 ficheros, 404 verdes y **1 rojo que ya lo era en
  HEAD** (`session` › «cuando golpean a la persona, elige su respuesta sin ver el golpe», dicho en
  `informe.md`: la rueda pendiente lleva un campo más; no es de esta tarea).

## Cómo se escribieron

- **Datos propios** donde el núcleo lo deja: piezas de prueba (`catalogoCon(...)` sobre el catálogo
  del juego, con ids `*_de_prueba`), cuerpos hechos con `cuerpoConSusCifras` y vestidos con
  `conEquipo` del catálogo de la prueba, unidades de la arena escritas en el test, y niveles de la
  rueda propios (`todoA`, `NIVELES_DE_PRUEBA`). Las cifras de esos datos son del test y lo que
  significan sale del núcleo: `cifrasDeLosNiveles`, `CARGA`/`cargaEfectiva`, `dichoDeLaCarga`,
  `efectoDelTipo`, `damageMultiplier`, `tiradaDelPunto`, `trasLaArmadura`.
- **Del catálogo, elegido por una propiedad** donde la regla solo se alcanza por la partida (la tropa
  lleva piezas del catálogo del juego por id, `troopUnit` → `cifrasDeUnidad`): «un caballo de silla
  cualquiera y una unidad sin montura de serie a la que hace más rápida que a pie», «la primera
  unidad con escudo de serie y la primera arma a dos manos», «la primera unidad con algún poder»,
  «la unidad más fuerte y la más floja por `poderDe`». Lo esperado, derivado: `marchaDe`,
  `slowestSpeed`, los `*Blocker`, `queHaceElPoder`, `loQueLaPara`, y los grupos de asaltantes con la
  tropa que la regla necesita, medida con `poderDe`/`fuerzaDe`/`ventajaClara` (la misma medida de
  `gruposConMargen`), no escrita.
- Nada de jugabilidad: ningún test mira qué decide la IA, quién gana ni frecuencias.
- Ayudas locales en cada fichero; `test/helpers.ts` y `test/batalla-de-cliente.ts` no cambian.

## Las reglas

### 1. La marcha del grupo (`marchaDe`, `slowestSpeed`, Logística) — `test/game.test.ts`

Describe «la marcha del grupo: el más lento, el héroe incluido (26-10-2026)», con `marchaDeSilla()`:
un caballo de silla del catálogo y una unidad sin montura de serie a la que ese caballo hace más
rápida que a pie y que el héroe a pie (y al héroe, más rápido que a pie).

| Test | Qué prueba |
|---|---|
| «un caballo de silla sube la marcha solo si lo llevan todos: el héroe a pie frena, y un individuo a pie también» | tropa a caballo y héroe a pie → la marcha del héroe; todos a caballo → el más lento de los montados, y más `maxMovePoints`; uno a pie → la suya |
| «el caballo de silla no cambia la batalla: las mismas casillas, defensa y daño que a pie» | `createBattle` con y sin la silla: `speed`, `defense` y `damage` iguales |
| «Logística sube un 10 % por nivel lo que da el más lento, a la escala del mapa» | `maxMovePoints` con Logística 0-3 = `round(marchaALaEscala(…) × (1 + n/10))` |

Mordió: `slowestSpeed` sin contar al héroe (`let slowest = 'ultra_fast'`) → el primero rojo;
`marchaDe` sin la montura (`return u.speed`) → los tres; `cifrasDelCuerpo` tratando toda montura
como de guerra (`deGuerra = eq.montura ?? null`) → el segundo; `logisticsBonus` a `level * 0.2` → el
tercero.

### 2. La marcha que se para (#130), su revisión (H1/H2) y la ruta que avisa — `test/marcha-que-se-para.test.ts` (nuevo)

Escenario (`buscarLaMarcha`, la primera de las semillas 1-40 que lo da; hoy la primera que mira): el
héroe del jugador 0, sin tropa, junto a su base, y una ruta del día 1 que pisa la base, después una
región `a` con una casilla libre que se ve al salir y luego otra región `g` con una casilla libre que
no se ve al salir y sí tras un paso anterior (**medido andando la ruta paso a paso en una copia**, con
`visibleNow`, la pregunta de la marcha). Se comprueba que con grupos en esas casillas la ruta es la
misma y ninguno se dispersa. Los grupos **se plantan**, con la tropa justa por `ventajaClara`.

| Test | Qué prueba |
|---|---|
| «se queda donde lo ve, sin batalla, con lo andado gastado; y el grupo ya se ve» | `march_halted` en el paso desde el que se ve, antes de su región, sin batalla, `movePoints` menos lo andado, el grupo a la vista, la ruta que ya avisa y la crónica del dueño |
| «el grupo que la ruta avisa al salir no la para: quien la pidió lo vio, y es la emboscada» | grupo visible al salir: `emboscadaEnLaRuta` lo nombra, la marcha no se para y es emboscada al pisar su región |
| «un grupo que ya se ve al salir no para nada: pedir la misma marcha otra vez es la emboscada» | tras la parada, repetir la marcha da `battle_started` del grupo |
| «un grupo que no le saca el margen no la para: anda entero» | el mayor grupo sin margen (uno menos que el menor con margen): llega al destino |
| «avisaba de un grupo que deja de temer: se para al ver al siguiente, que no avisaba (H1)» | recoge la guarnición en la base; `a` deja de emboscar, se para por `g` |
| «no se para por un grupo que, con la guarnición recogida, ya no la emboscaría (H2)» | cruza la región de `g` y llega |
| «la sesión ve los grupos con la regla del núcleo, y la barra dice por qué se para el héroe» (describe «la parada en la sesión (#130)») | `Session.moveHeroTo`: la barra es `«<héroe> se detiene: ${loQueLaPara}.»`, y la caché de la sesión ve el grupo nuevo, igual que el núcleo |

Mordió, en `src/core/state/asaltantes.ts` salvo la última: la vigía que nunca para → 4 rojos (los
tres de parar y la sesión); sin revisar al cambiar (`if (cambio && false)`) → H1 y H2; parar también
por el avisado (sin `amenaza === avisado`) → «el grupo que la ruta avisa…»; parar sin mirar
(`return amenaza`) → 4 rojos; `gruposConMargen` sin `ventajaClara` → «no le saca el margen» y H2; la
barra de la sesión muda (`src/client/session.ts`) → el de la sesión.

### 3. El id de un héroe contratado no se repite (#126) — `test/game.test.ts`

«contratar, salir otro héroe del juego y volver a contratar el mismo día da otro id»: contrata,
saca de `state.heroes` el héroe del rival (lo que en la partida hace caer sin base, que necesita un
tercer jugador; el id solo mira lo que hay en juego) y contrata otra vez: ids distintos, los dos en
`hero_hired` y ninguno repite el de un héroe que estuvo en juego.

Mordió: el id de antes, `hero-${player.id}-${state.heroes.length}-${state.day}`
(`src/core/state/game.ts`) → rojo.

### 4. La carga montada — `test/carga.test.ts`

Describe «la carga montada pega con la fuerza de la montura (26-10-2026)». Todo de la prueba, peso 0:
lanza (fuerza 3), espada (fuerza 1), montura de guerra (fuerza 9), jinete de fuerza 2 y agilidad 4.

| Test | Qué prueba |
|---|---|
| «montado de guerra con lanza, la carga tira con la fuerza de la montura más la de la lanza, por la agilidad del jinete» | horquilla `[F, F × agilidad]` con F = montura + lanza; la horquilla y el golpe real (Normal contra Normal) son los de un cuerpo a pie de esa fuerza con la lanza; cobra `cargaEfectiva` y el parte dice «montada» (`dichoDeLaCarga`) |
| «sin carga, el golpe del jinete montado no lleva la fuerza de la montura» | daño del golpe sin carga = el de sin montura |
| «montado sin lanza, o a pie con ella, la carga va con la horquilla de su arma» | sin carga montada; la horquilla, la del arma |

Mordió: `cifrasDelCuerpo` con `c.fuerza` en vez de la de la montura (`src/core/cuerpo.ts`) y
`deUnGolpe` sin `deLaCarga` (`damage.ts`) → el primero; sumar la fuerza de la montura al daño → el
segundo y el tercero; carga montada sin lanza → el tercero.

### 5. Los efectos de la rueda y el parte que cuenta el cruce — `test/rueda.test.ts`

Con niveles propios (`NIVELES_DE_PRUEBA`) y los piqueros hechos a mano que ya tenía el fichero; lo
que da cada nivel, de `cifrasDeLosNiveles`.

- Describe «los efectos del golpe (#263): Defensivo hasta que empiece su turno, Romper guardia por
  éxito»: «Defensivo pone la defensa de su nivel ya en el contraataque, y se va al empezar su próximo
  turno»; «Romper guardia quita lo de su nivel según el éxito del cruce, ya en el contraataque» (los
  cinco éxitos); «Romper guardia sigue en el próximo turno del atacado y se va al terminarlo»; «dos
  Romper guardia seguidos refrescan, no se suman: queda el último»; «sin contraataque, Romper guardia
  quita ataque igual: para su próximo turno».
- Describe «la Finta deja andar después de golpear (#263)»: «sin andar antes: le queda su velocidad
  menos lo del éxito, y solo puede andar o terminar»; «después de andar: lo que le queda menos lo del
  éxito»; «cada éxito resta lo de su nivel: el del cruce, no otro»; «sin casillas que andar, el turno
  se cierra solo y no sale nada».
- Describe «el parte cuenta el cruce»: ««Romper guardia contra Defensivo: alto; contraataque bajo»,
  con lo que dejó y su duración»; «sin contraataque, el cruce no lo nombra»; «nombra el efecto como la
  rueda de la batalla: en la de 3, el «Rápido» que quita ataque dice «Rápido»».

Mordió: `vence: 'terminar'` para Defensivo y su efecto colgado después del intercambio
(`battle.ts`); `quitaAtaque[4]` en vez de `[p]`, el colgado de Romper guardia tras el contraataque y
`vence: 'empezar'`; `applyEffect` apilando (`effects.ts`); la Finta restando con éxito 0, anulada, y
sin `quedaAlgoQueHacer` en el cierre; el parte sin «; contraataque …» (`panels.ts`), `trasElCruce`
inventando un contraataque y `nombreFuente` diciendo «Romper guardia» en la rueda de 3. Cada uno, su
test o sus tests en rojo.

### 6. Los modificadores de los dos en la cabecera de la rueda — `test/rueda-contrincantes.test.ts`

Describe «31-10-2026: los modificadores de los dos, en la cabecera de la rueda» (ayuda local
`golpePegado`: los dos pegados, sin carga, con manos de prueba a `todoA(NIVEL_MAXIMO)`): «lo que
lleva colgado cada uno, en pastillas con su signo y una sola nota; sin nada, nada»; «una sola forma:
la de «En el campo» y la de la rueda salen de la misma función»; «el desenlace pinta lo que llevaban
antes del cruce (la foto del animador), no lo que trae el estado».

Mordió: `renderEleccion` sin los efectos → el primero; la pastilla de la carga con otra frase → el
segundo; `renderDesenlace` con `x.effects` en vez de la foto → el tercero.

### 7. Un arma a dos manos sobre un escudo de serie (H4) — `test/equipo.test.ts`, `test/tropa-en-escena.test.ts`

- `equipo.test.ts`, describe «un arma a dos manos sobre un escudo de serie (QA de la tropa, H4)», «el
  motivo no pide quitar el escudo, que es de serie: tampoco con otro encima»: la primera unidad con
  escudo de serie y la primera arma a dos manos del catálogo; el motivo (`equipBlocker` y la acción)
  dice que su escudo es de serie y no se quita, nombrado con `unidadDelJuego`/`pieza`; el rechazo no
  toca mochila ni tropa; con otro escudo encima, igual; al héroe, cuyo escudo es suyo, «quita antes el
  escudo».
- `tropa-en-escena.test.ts`: «una pieza a dos manos para quien lleva escudo de serie sale apagada con
  el motivo de `ponerseBlocker`».

Mordió: `equipoDelPortadorBlocker` sin la rama del escudo de serie (`src/core/catalogo.ts`) → los dos.

### 8. «A distancia» con el puntero — `test/escenas.test.ts`

Describe ««A distancia» con el puntero: lo que no se puede, dicho como al pulsar», sobre una
`SesionDeArena` con una granada y un arco de prueba (`catalogoCon`): «la granada fuera de alcance da
su motivo sobre un enemigo y sobre una casilla vacía (H1 del QA de las granadas)» y «el arco sigue
igual sobre un enemigo, y sobre su propia casilla dice por qué». Lo que dice el puntero = lo que dice
el clic, con el motivo de `lanzarBlocker`/`apuntarBlocker` y el alcance de `alcanceDeLaGranada`.

Mordió: `dichoDelTanteo` devolviendo `null` con `kind === 'no'` (`src/client/escenas/batalla.ts`) →
los dos.

### 9. Los poderes de la tropa en la batalla del mapa — `test/session.test.ts`

Describe «los poderes de la tropa en la batalla del mapa (F6)», «una unidad con poder de la persona
lo usa: el botón, el aliado que se elige y la jugada»: la primera unidad del catálogo con algún poder,
y su poder por id (Q4 lo renombra): el botón del panel, que con varios aliados espere el clic («Elige
el aliado»), el rechazo sobre un enemigo con la frase de `poderBlocker`, el hecho `power` y lo apuntado
suelto.

Mordió: `PoderesDeLaActiva.usar` con los posibles recortados a uno (`src/client/session.ts`) → rojo.

### 10. `expectedDamage` con la armadura — `test/armadura.test.ts`

Describe «la IA cuenta con la armadura (`expectedDamage`)», «baja exactamente lo que para, y nunca de
0»: un peto de prueba (armadura 4, peso 0); con un golpe fuerte baja justo lo que para, con uno flojo
queda en 0.

Mordió: `expectedDamage` sin la armadura y `trasLaArmadura` sin el `Math.max(0, …)` → rojo.

### 11. «Sin el catálogo del juego»: un cuerpo de criatura no vale — `test/arena.test.ts`

Describe «sin el catálogo del juego (13-10-2026)», «un cuerpo de criatura no vale: no se retira ni se
convierte, se queda como cualquiera que no vale»: una unidad escrita en el test con cuerpo
`{ criatura }`; `validarUnidad` lanza y `revisarCatalogo` la deja entre las que no valen con su crudo
y su motivo.

Mordió: `cuerpoValido` convirtiendo `{ criatura }` en una hoja (`src/core/unidad.ts`) → rojo.

### 12. El defensor que despliega sin ver al atacante, en la partida — `test/despliegue-en-escena.test.ts`

Describe «el defensor despliega sin ver al atacante, en la partida», «abre en la tanda del defensor:
ni figuras, ni lista, ni pista del rival»: la persona da un paso de un tramo y la embosca un grupo
plantado en esa región (la unidad más fuerte por `poderDe`, lo justo para `ventajaClara` contra
`fuerzaDe` del héroe: la regla de `emboscador`), en la primera semilla de 1-40 donde hay ese paso. La
persona es el defensor y despliega primero; `batallaALaVista` no tiene al atacante; ni el panel, ni
la escena, ni la pista del borde lo nombran; pulsar su casilla no mueve a nadie; con «Listo» se ve todo.

Mordió: `batallaALaVista` devolviendo el estado entero (`battle/despliegue.ts`) → se ven los del
atacante; `dejarPendiente` sin `aMano` para el defensor (`state/game.ts`) → sin despliegue en curso.

## Perturbaciones

En worktrees desechables del scratchpad (`git worktree add --detach`, `node_modules` enlazado; los
tres borrados al acabar), para cada perturbación `git checkout data && python3 perturbar.py <wt> <P>`
y solo los ficheros de cada grupo:

| Ficheros | Resultado en las 23 (P1-P9, Q1-Q8, R1-R6) |
|---|---|
| `game`, `marcha-que-se-para` | 93 de 93 verdes en las 23 |
| `carga`, `rueda`, `rueda-contrincantes`, `armadura` | 96 de 96 verdes en las 23 |
| `equipo`, `tropa-en-escena`, `escenas`, `session`, `arena`, `despliegue-en-escena` | 215 verdes y el rojo de HEAD de `session` en las 23 |

Se comprobó que cada perturbación se aplicaba (cuántos ficheros de `data/` cambia: P8, 9; Q4, 4…).

## Verificación en el worktree real

```
$ pnpm typecheck
> tsc --noEmit
(sin salida: 0 errores)

$ pnpm lint
Checked 518 files in 604ms. No fixes applied.
Found 10 infos.          (las mismas 10 de HEAD, en tools/taller/unidades.ts)

$ npx vitest run test/game.test.ts test/marcha-que-se-para.test.ts test/carga.test.ts \
    test/rueda.test.ts test/rueda-contrincantes.test.ts test/armadura.test.ts test/equipo.test.ts \
    test/tropa-en-escena.test.ts test/escenas.test.ts test/session.test.ts test/arena.test.ts \
    test/despliegue-en-escena.test.ts --maxWorkers=4
 × la rueda y las defensas de la persona en la partida (F5) > cuando golpean a la persona, elige su respuesta sin ver el golpe; esa no se cancela
 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 404 passed (405)
```

El rojo es el de HEAD (`informe.md`, «Verificación»), no de esta tarea.

**No corrido**: la suite entera ni `pnpm verify` (los corre CI), `pnpm qa` (no se toca ni
`src/server/` ni el contrato), `pnpm banco` (no se toca el núcleo).

## Lo que no queda cubierto

- **Regla 12, la defensa que abre el rival en su turno** (`Session.defender`, «¡Te atacan! … aún no
  ves al enemigo»): depende de que la IA decida atacar, que es jugabilidad. La regla del despliegue
  (la tanda del defensor y lo que ve) queda probada por la emboscada.
- **Regla 2, el rival que mira al héroe parado sin ver al grupo** (H4 de QA, la crónica del otro
  jugador): no se reescribió; lo de la crónica del dueño sí.
- **Regla 6**, la cabecera: los modificadores se prueban con efectos puestos a mano (miedo, lentitud,
  defensivo), como los borrados; el Defensivo que deja un golpe real sale solo en el desenlace.
- De las «muy mermadas» (fuera de alcance por la petición): «el juego carga como la arena», el parte
  de la carga con su porcentaje y las notas de la previsión de Romper guardia (R3) siguen sin test;
  también la fila de un equipado en el panel (M5).
- La marcha del grupo y la parada usan unidades y piezas del catálogo elegidas por una propiedad,
  porque la tropa de un héroe solo viste piezas del catálogo del juego (`cifrasDeUnidad`): si un día el
  catálogo no tiene un caballo de silla que haga a alguien más rápido, `marchaDeSilla` lo dice y lanza
  (no es un rojo de la regla); igual `buscarLaMarcha` si ninguna de 40 semillas da el escenario.

Veredicto: hecho. Los cuatro criterios de `requisitos-2.md` se cumplen; el único rojo de los ficheros
tocados es el de HEAD.
