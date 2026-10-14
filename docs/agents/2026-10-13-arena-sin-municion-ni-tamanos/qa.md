# QA — La arena: sin munición, sin tamaños y sin el catálogo antiguo (14-10-2026)

Validado contra la petición literal («Elimina las caracteristicas de disparos y hexes, todo el
mundo un hexe, el dragon de hueso no deberia existir. Todo el mundo tiene un disparo a no ser que
tengan la habilidad dos disparos») y las decisiones del usuario (solo la arena; fuera el catálogo
del juego en la arena; dispara quien lleva arma a distancia, sin munición, uno o dos con
`double_shot`; sin tocar la IA). Estado: el worktree tal cual tras la pasada de simplify, sin commit.

## Método y entorno

- `pnpm verify`, `pnpm banco` y `pnpm qa`, una vez cada uno, sobre el estado final.
- Sondas del núcleo en el scratchpad (no en el repo): tirador en lo alto, `double_shot` sin arco,
  arquero rodeado, retoque quitando y poniendo el arco, `splash_shot`, enlaces v6 a v9 y 200
  peleas al azar.
- Flujo real con Playwright sin pantalla contra un vite propio en el **3291**, sin `--open`, desde
  una **raíz sombra** del scratchpad: enlaces simbólicos a `src/`, `tools/`, `assets/` y
  `node_modules/`, y `data/borradores/` propio con un borrador de antes. Así nunca se lee ni se
  escribe el `data/borradores/` del usuario. El 3187 del usuario no se tocó: sigue levantado y su
  `unidades.json` conserva la fecha de 09:06:40, anterior a esta sesión. El vite se arrancó con
  `set -m`, se paró por su grupo y el 3291 quedó libre (`ss -ltnp`).
- `verify:lento` y `capturas` no se repiten: implementacion.md los da en verde sobre este mismo
  estado (escrito a las 09:07, después del último cambio de código, a las 08:57). Los cito.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| C1 | Sin el catálogo del juego en la lista ni en el filtro | ✅ | Navegador: 54 entradas en la lista, todas hojas o unidades del borrador. `[...lista, ...opciones de «Nueva unidad»] ∩ allCreatures()` = `[]`. Botones u opciones con «Catálogo del juego»: 0. |
| C1 | … ni como cuerpo de «Nueva unidad» | ✅ | Las 52 opciones son hojas (`templario-escudo` … `heroe-goblin-chaman`). «Crear» desde `goblin-arquero` → «Nueva unidad «Goblin arquero 3», sin equipo (Índice 177 · nivel 1)». Ficha sin Disparos, Hexes ni Munición. |
| C1 | … ni en el montaje, el enlace o el borrador; lo de antes se lee sin ellas y lo dice | ✅ con reserva (H1) | Borrador sombra con `cuerpo: { criatura: 'bone_dragon' }`: `/__arena/unidades` devuelve 15 válidas sin `bone-dragon-2`, `invalidas: []`, y el aviso «…era una criatura del catálogo del juego («bone_dragon»)… y se retira». Enlace v7 con un puesto `{ criatura: 'bone_dragon' }` y `pruebas` → monta lo demás y la barra lo dice. Un v7 con el bando izquierdo hecho solo de criaturas → «El bando izquierdo se queda vacío sin ellas». **El aviso del borrador no se llega a leer** en la barra: H1. |
| C2 | Sin munición en la ficha, el editor, el tablero y el panel | ✅ | Ficha de «Arquero con tiros» (llevaba `shots: 12`): ni Disparos, ni Hexes, ni Munición. Editor de equipo: `[data-arena-pieza-campo="disparos"]` = 0, en la pieza de antes y en un arma a distancia nueva. Tablero: tras 22 disparos el arquero no lleva `↑N` (`png/07-zoom-arquero.png`). Panel: `#side` sin «Munición» ni «sin munición». |
| C2 | Dispara quien lleva arma a distancia, siempre que el motor le deje, sin límite | ✅ | Navegador, enlace v8 con troll (Yo, 30 100 PV, solo termina turno) contra el `elfo-arquero` con `double_shot` (IA): **22 «(disparo)» en el parte en 11 rondas**, más de los 12 de antes. Núcleo: **200 disparos seguidos** desde lo alto de un muro, con `bonoEnLoAlto` = 3, `shotsLeft` 0 y `tirosQueQuedan` `null`. Para por el tope de 100 rondas, no por la munición. |
| C2 | Un tiro por disparo; dos con `double_shot` | ✅ | Navegador: 2 entradas «(disparo)» por turno del arquero con `double_shot` (22 en 11 rondas). Test `arena.test.ts` «cada disparo es un tiro; con «dos disparos», dos». |
| C2 | Con cifras | ✅ | La ficha dice «A distancia: Arco · Ataque 5 · Daño 20–30» y «Cuerpo a cuerpo: Daga». El parte: 13-16 de daño por tiro al troll (defensa 4). `armas.test.ts` está en verde. |
| C3 | Sin tamaños: una casilla y sin campo | ✅ | Ningún campo de tamaño en la ficha ni en la tarjeta. Borrador con `hexes: 2` → «La unidad «Zombi grande» ocupaba 2 casillas: ahora una, como todas». Un v8 con `hexes` → ««hexes» no es un campo de la arena». Queda un resto de texto en la ayuda de la muralla: H3. |
| C4 | Borradores y enlaces de antes, convertidos y con aviso | ✅ | Borrador: `shots` y `hexes` fuera, con su aviso; «Zombi con tiros» (5 tiros sin arco) → «…ya no hay munición y no dispara (ponle una en Arma a distancia…)». La pieza con `disparos: 16` → sin el campo, con aviso, y `piezasInvalidas: []`. Enlace v6 con un arco en `arma` y `disparos: 9` → pasa a distancia y pierde los disparos, con tres avisos. v7 → abre con avisos. |
| C4 | La v8 se lee estricta | ✅ | Se rechazan, cada uno diciéndolo: `shots`, `hexes`, `pruebas`, un puesto `criatura`, una pieza con `disparos` y la v9 («lee de la 1 a la 8»). |
| C5 | El juego no cambia: banco | ✅ | `pnpm banco`: «ancla: igual», 0/200 sin terminar, 8/14/23 días. |
| C5 | El juego no cambia: agente | ✅ | `pnpm qa`: exit 0. `git diff a22ac461` en `src/core/contract/` y `src/server/`: solo `serialize.ts` (`shotsLeft: tirosQueQuedan(s) ?? 0`). Para el juego da lo mismo: quien no cuenta tiros es quien no tira, y su `shotsLeft` ya valía 0. `test/agent-contract.test.ts` sin tocar. |
| C5 | El dragón óseo sigue en el juego | ✅ | `data/creatures.json` sin cambios desde `a22ac461` (`bone_dragon`, `"hexes": 2`). Tests en `battle.test.ts:544` y `arena.test.ts:2543`. |
| C5 | El `↑N` y la fila «Munición» del juego | ✅ por lectura, ⚠️ sin pantalla | La condición de `render/batalla.ts` y `views/panels.ts` equivale a la de `a22ac461`: `isShooter && shotsLeft > 0`, y `isShooter` para la fila. No lo vi pintado en `pnpm dev`: no probado. |
| C6 | La rueda del golpe y las armas por uso, en verde | ✅ | `pnpm verify`: 125 ficheros y 3 153 tests en verde (con `rueda.test.ts` y `armas.test.ts`). 100 de mis 200 peleas al azar con `golpe: 'rueda'` terminan todas. `capturas` y `verify:lento` en verde, según implementacion.md. |
| — | La decisión del usuario: medir las peleas todo IA que no terminan | ✅ | implementacion.md mide 1-300 por montaje. Mi muestra independiente, 200 peleas al azar con `double_shot`, `splash_shot` y arcos o ballestas repartidos (la mitad con rueda): **200/200 terminan**, rondas 5/8/16, 0 excepciones, 1 648 disparos, ningún texto con «munici». |

## Pasada adversarial (núcleo; los scripts quedan en el scratchpad)

- **Tirador en lo alto con tiros infinitos**: 200 disparos seguidos, sin ningún rechazo. Arquero
  arriba contra un troll y un orco sin escalera, en 20 semillas: 20/20 terminan, en 27-29 rondas.
  La munición infinita no bloquea la pelea: los de abajo acaban cayendo.
- **`double_shot` sin arma a distancia** (`templario-escudo`): ni `shoot` ni `isShooter`. El golpe
  cuerpo a cuerpo deja 1 `attack`, no 2, y el nivel no cambia (177 con el rasgo y sin él).
- **`splash_shot`**: con arco, un disparo da `shoot:defender-0 shoot:defender-1`. Sin arco, no
  dispara.
- **Arquero rodeado**: no se le ofrece `shoot`. El motivo es «tiene un enemigo encima, y no alcanza
  a esa unidad cuerpo a cuerpo este turno», y un `shoot` forzado lanza «attacker-0 tiene un enemigo
  encima». Tras moverse: «ya se ha movido este turno: no puede disparar». En ningún caso dice
  «munición».
- **Retocar en pelea quitando el arco**, en el núcleo y con clics: «Editar» del arquero → «×» de
  Arma a distancia. La barra dice «Cambiado: vale ya en esta pelea.» y el parte, «Cambian las cifras
  de Arquero a media pelea (distancia: − Arco)». Después, el arquero anda y pega cuerpo a cuerpo:
  ni un «(disparo)» más. Con el arco puesto a un templario a media pelea, se le ofrece `shoot`; con
  el arco devuelto al arquero, vuelve a disparar.
- Consola del navegador limpia en las seis pasadas (sin errores ni avisos).

## Hallazgos

### H1 · importante — el aviso de lo que se retira del borrador no se ve

**Reproducir**

1. Un `data/borradores/unidades.json` con una unidad de cuerpo `{ criatura: … }`, además de otras
   unidades de antes que traigan su aviso. El orden real de los avisos es: piezas, arco en
   `arma`, criatura, tamaño, tiros.
2. `pnpm arena`.

**Qué pasa**: todos los avisos van en `#status`, que corta a dos líneas (`line-clamp: 2`,
`style.css:233`). La barra no tiene `title`, no se despliega y la consola no lo repite.

- A 1440 px se ven 39 de 117 px: «…se retira» queda en la parte cortada (`png/01-arena-inicio.png`).
- A 390 px se ven 39 de 585 px (`png/09-enlace-v7-390.png`).

**Qué esperaba quien juega**: leer qué unidad desaparece, porque al pulsar «Guardar» se pierde para
siempre del disco.

**Matices**

- El recorte de la barra es anterior a esta tarea.
- Esta tarea es la que mete ahí avisos que no se pueden perder.
- El borrador real del usuario no trae ninguna criatura (el 3187 da 12 válidas), así que hoy no
  pierde nada.
- El aviso de un enlace va primero y a 1440 px sí se lee.

**Qué haría falta**: que los avisos de conversión se puedan leer enteros (la barra desplegable, o
un aviso aparte) o, como mínimo, que vayan primero los de lo que se retira.

### H2 · menor — un `disparos` en `data/equipo.json` lo ignora el juego y tumba la arena

La pasada de simplify quitó la «lápida» de `problemasDePieza`, y el cargador del juego
(`validarEquipo`, `data.ts:901`) no rechaza campos ajenos. Lo comprobé con
`scratchpad/qa/disparos.mts`:

- **El juego** lo ignora: `validarEquipo` con `arco.disparos = 12` y un `danyo` mal escrito en el
  garrote **no lanza**, y la pieza cargada conserva `disparos: 12`.
- **La arena** sí lanza, cuando pide las piezas del juego (`juegoEscrito()`,
  `arena.ts:610`, que pasa cada una por `validarPiezaDeArena`). Lanza con ««Arco»: «disparos» no es
  un campo de una pieza», sin nombrar `data/equipo.json`.

El mismo dato vale en el juego y rompe la arena, y el mensaje apunta al sitio equivocado.

**¿Rompe el contrato «fail-loud» de CLAUDE.md?**

- Su letra habla de acciones ilegales, así que no lo rompe al pie de la letra.
- Sí rompe su espíritu y el patrón de la casa: `validarUnidadDeArena` («lo que no es un campo de la
  arena no se descarta callando»), `validarPiezaDeArena`, `objetoCon` y el enlace rechazan los
  campos ajenos.
- La pasada lo declara («deja sin vigilar un `disparos`»), pero el efecto real es peor que
  «sin vigilar»: con ese dato la arena no arranca.

**Qué haría falta** (un hecho, un sitio):

- llevar la comprobación de campos ajenos a `problemasDePieza`, con la lista de `CAMPOS_DE_PIEZA`
  movida a `data.ts`, junto a la regla de una pieza;
- así `validarEquipo` falla al cargar diciendo `data/equipo.json: «Arco»: «disparos» no es un
  campo…` (y también con cualquier errata), en el juego y en la arena a la vez;
- un test con el JSON de argumento, visto morder.

Hoy no muerde: ninguna pieza del juego lo lleva.

### H3 · menor — la ayuda de la muralla de la arena aún habla de unidades de dos casillas

La ayuda de la muralla, en el montaje (`src/core/arena-murallas.ts:161`), dice:

- «las unidades de dos casillas no suben»;
- «no se cierra con una unidad grande plantada en sus dos casillas».

En la arena ya no hay unidades grandes (C3). Es el mismo código muerto que el plan deja en el
backlog (`LA_GRANDE_NO_SUBE`).

### H4 · menor, ya declarado — el nivel no ve el disparo doble

Un `elfo-arquero` con `double_shot` es «Índice 182 · nivel 1», igual que sin el rasgo, aunque hace
el doble de daño a distancia. Es la decisión (c) del plan, aceptada y escrita en la historia. Lo
anoto porque quien juega lo verá como un nivel que no cuadra.

## Workarounds usados

- **La raíz sombra** (`scratchpad/sombra/`, con su `vite.config.ts` copiado y `cacheDir` y
  `server.fs.allow` añadidos a la copia).
  - Para qué: poder leer un borrador de antes sin tocar el del usuario.
  - Por qué no afecta a quien juega: no cambia el código servido (los mismos `src/`, por enlace) y
    `raiz` es lo único que mueve.
  - **Efecto colateral**: el primer arranque, aún sin el `cacheDir` propio, reescribió
    `node_modules/.vite/deps/` del worktree a las 09:13:22. Es la caché que también usa el vite del
    usuario en el 3187.
  - Qué cambió: solo hay un dep (`zod.js`), con el mismo contenido. Cambian `_metadata.json` y su
    `browserHash`.
  - Riesgo para el 3187: puede, como mucho, re-optimizar o pedir una recarga.
  - Lo paré enseguida y lo relancé con su caché en el scratchpad. El 3187 sigue escuchando; no lo
    abrí ni le hice ninguna petición.
- **Las cifras de la prueba**: el troll de 30 000 PV con su jugador terminando turno, y las
  unidades del enlace generadas con `montajeALaURL`. Sirven para que el arquero dispare muchas veces
  seguidas. Es un enlace v8 legítimo, de los que puede copiar cualquiera: no falsea nada que vea
  quien juega.
- **Las sondas del núcleo**: usan `forzarTurno` y fijan casillas a mano, como los tests del repo.
  Son pruebas de reglas, no del flujo; el flujo se probó aparte en el navegador.

## No probado

- **El `↑N` y la fila «Munición» de una batalla del juego** (`pnpm dev`): llegar a una batalla con
  arqueros cuesta minutos. Lo cubren la lectura del código, que equivale a `a22ac461`, `pnpm banco`
  igual y `battle.test.ts` («sin munición» para la criatura del catálogo).
- **La rueda en el navegador**: no la jugué con clics. La cubren `rueda.test.ts` en `verify`, la
  pasada «rueda-del-golpe» de `capturas` (verde según implementacion.md) y mis 100 peleas con rueda
  en el núcleo.
- **Ver morder los guardias nuevos** (`importaCreature`, `.shotsLeft` fuera de `data.ts` y
  `battle.ts`, el de `vestir`): verlos morder exige editar el código. Cito implementacion.md, que
  los dice vistos morder.

## Veredicto

**Apto con reservas.** Lo pedido se cumple en el flujo real:

- en la arena no queda ni criatura del catálogo, ni munición, ni tamaño;
- dispara quien lleva arma a distancia, sin límite, uno o dos tiros;
- lo de antes se lee con aviso y la v8 es estricta;
- el juego y el agente no cambian;
- la rueda y las armas por uso siguen en verde.

Las reservas:

- **H1**, importante: el aviso de lo que se retira queda cortado en la barra, y «Guardar» lo borra
  sin que se haya podido leer.
- **H2**: el cargador de `data/equipo.json` acepta `disparos` callando y la arena se rompe con él.
  Conviene arreglarlo antes del commit: es una línea de diseño y un test.
