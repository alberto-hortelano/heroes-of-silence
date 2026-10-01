# QA — fase 2a «la red» (sin commit)

Validado contra `requisitos.md` (criterios 1-6, 8, lo mínimo de 9 y de 10 que asigna
la 2a) y las decisiones del usuario. No cuentan como hallazgos, por instrucción: lo
cortas que son las partidas, el equilibrio y lo que es de la 2b (3 recursos, territorio
en el cliente y en el turno del agente).

Scripts de la pasada adversarial en el scratchpad de la sesión (`val*.mts`, `gen.mts`,
`reglas.mts`, `base.mts`). No he tocado código.

## Comprobaciones de máquina

| Orden | Resultado |
|---|---|
| `pnpm verify` | 28 ficheros, **629 tests en verde**, 6,29 s (10 s en total) |
| `pnpm banco` | sha256 `02bf2610ec69c4bd…4765145`, 30 862 líneas, `ancla: igual`, 0/200 sin terminar, 2219 ms |
| `barrido-semillas.ts` | `sin terminar: 0/40 → []`; con `1000`: `0/1000 → []`, peor batalla 10 rondas |
| `pnpm qa` | exit 0, 3,0 s: `27 veredictos, 27 entraron`, `1 mapa diseñado, 3 turnos de mapa y 23 decisiones de batalla`, aviso amarillo de que no se ofreció rendición |
| `pnpm capturas` (a mi scratchpad) | exit 0, 42,1 s, `sin errores en consola`; 3100 libre antes y después |

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Regiones y nodos declarados; `validateMapPlan` comprueba la red y nombra el paso abierto (las dos casillas y las regiones); vale para los dos productores | ✅ con reserva | 20 planes adversariales sobre `planDeNodos`. Se rechazan: hueco en un muro (`"b" y "c" se tocan sin nodo entre (10,5) y (11,5)… pon un nodo en (11,5)`), muro en escalera, muro torcido, nodo en mitad de una región (`solo toca la región "c"`), nodos vecinos, bolsa pisable sin región, región sin nodo, semilla sobre un muro, dos semillas en la misma zona, ids duplicados, nodo fuera del mapa, inicio sobre un muro, mina o monstruo sobre un nodo, muro de `grass`. Se aceptan, y es correcto: un muro de agua con nodos (el nodo abre la casilla, regla declarada) y un `patch` sobre un muro (los muros se pintan encima). Muro en L con las esquinas en diagonal: dice `entre (4,4) y (5,5)… pon un nodo en (5,5)`, que es el hueco real. **Reserva**: en dos casos el paso que nombra no es el hueco (hallazgo M1). Agente por MCP: el plan con el hueco en (11,12) volvió con `las regiones "no" y "so" se tocan sin nodo entre (10,11) y (11,12)` y la partida arrancó con el procedimental. |
| 2 | La ciudad es un nodo y se conquista con `captureTown` | ✅ | `reglas.mts`: el rival cruza la base vacía, `town_captured`. La neutral guarnecida abre batalla (test y MCP). La base nace con 7 (MCP: `garrisonLeadership 20/20`). |
| 3 | Pisar un nodo lo toma; el dueño vive en un solo sitio | ✅ | MCP, seed 77 día 2: `node_captured node-12 from null actor 1`; la IA toma `node-8` el día 3. El invariante «solo `captureNode`/`captureTown` escriben dueño» está en verde. |
| 4 | `regionOwner` = dueño común de TODOS los nodos, calculado | ✅ | `reglas.mts`: con 2 de 3 nodos de la región `c`, `null`; con la ciudad `town-2` también, `0`. |
| 5 | `conectadoABase` por cadena de regiones y nodos propios | ✅ | Cortar `node-2` deja `conex0 = "a | town-0,node-0"`; con `c` cerrada y `node-0` del rival: `regionOwner(c)=0`, `conectado c=false`, `town-2 conectado=false`. |
| 6 + decisión | Renta del territorio: la región cerrada pero desconectada NO cobra; la ciudad aislada no cobra; sin dueño, nada | ✅ | Renta del j0 por paso: `{gold:500}` → con `a`: `+ore 2` → con `b`: `gold 1500` → con `c` y `town-2`: `wood 2, ore 2, gold 2000` → el rival corta `node-2`: `{ore 2, gold 500}` → `c` cerrada y desconectada: `{gold 500}`. |
| 8 | Generador: valles, ciudades en grado ≥ 3, varios caminos de la base a sus ciudades cercanas, minas y pueblos dentro, el banco lo juega | ✅ con reserva | Auditoría propia en semillas que no usan los tests: 1000 semillas en 24×24 (1000-1999), 30 en 48×48 y 100 en 16, 20, 32 y 40. **0** lanzan, **0** inválidos, **0** ciudades neutrales de grado < 3, **0** casos en que quitar un solo nodo aísle una base de sus dos ciudades más cercanas. **Reserva**: las bases son de grado 2 en 1959 de 2000 (hallazgo M3). |
| 9 (mínimo) | La IA juega el territorio y las partidas acaban | ✅ | Barrido 0/40 y 0/1000; banco 0/200. |
| 10 (mínimo) | `map_generate` acepta nodos y ciudades-nodo, con validación y prosa; `pnpm qa` | ✅ | La prosa de `map_generate` (leída por MCP) explica regiones, muros, nodos, ciudad = nodo, paso abierto, la base guarnecida y que región ≠ renta sin conexión. `pnpm qa` verde con el plan firmado `qa-town-*`. |
| Dec. | Perder la base elimina aunque queden héroes | ✅ en el núcleo, ❌ en el cliente | Núcleo: `rival cruza la base vacía → finished {winner:1}, def0 true, heroes0 1, towns0 ["town-2"]`, últimos hechos `town_captured, player_defeated, game_over`. Cliente: dice otra cosa (hallazgo I1). |
| Dec. | Ciudades neutrales con guarnición | ✅ | Test y MCP: la neutral abre batalla. |
| Dec. | La base nace con guarnición | ✅ con reserva | Nace con 7 y 20 de liderazgo. **Reserva**: no defiende si el héroe del dueño está dentro (hallazgo I2). |
| Regla | Lo hostil se alcanza y no se cruza | ✅ | Con los dos pasos ocupados por héroes rivales: `no hay camino hasta (14,4)`; cruzar una neutral guarnecida: `no hay camino hasta (19,4)`. El motivo no se dice (hallazgo M2). |
| Regla | Los puntos de movimiento se fijan al empezar el día | ✅ | Test; y MCP: el héroe recogió la guarnición al pasar y no perdió puntos. |
| Regla | `emit` lanza tras `game_over` | ✅ | Después del final, `end_turn` y `move_hero` → `la partida ya ha terminado` (lo corta `turnBlocker` antes). 1000 partidas del barrido y 200 del banco sin que salte. El director descarta lo que sigue con `MOTIVO_PARTIDA_TERMINADA`. |

## Hallazgos

### Importantes

**I1 — El cliente explica mal la derrota y la victoria con la regla nueva.**
`src/client/views/panels.ts:152-153` y `src/client/session.ts:91` siguen describiendo
la regla vieja.
- Al perder dice «El rival se ha quedado con todo: no te quedan castillos ni héroes».
- Al ganar dice «Has conquistado el mapa: el rival no tiene castillos ni héroes».

Con «perder la base elimina», esas dos frases son falsas justo en el momento que
decide la partida.

Cómo reproducirlo:
1. `pnpm dev` y abre `http://localhost:3100/?seed=2`.
2. Mueve el héroe lejos de casa (por ejemplo, clic dos veces hacia el sureste).
3. Pulsa «Fin de turno» unas cuantas veces.

El día 3 la IA toma la base vacía. El panel dice «Partida perdida… no te quedan
castillos ni héroes» con Aldo de Valdeluz todavía en el mapa y su tropa en el lateral.

Quien juega no entiende por qué ha perdido. Debería leer que ha perdido la base.
Captura: `docs/agents/2026-10-01-mapa-de-nodos/qa-fin-de-partida-mentira.png`.
`pnpm capturas` no lo caza porque no mira el texto.

**I2 — La guarnición de la base no defiende si el héroe del dueño está dentro, y perderla elimina.**
En `enemyAt` el héroe tiene prioridad sobre el castillo, y `defenderSide('hero')`
solo pone en el tablero la tropa del héroe.

Esta regla es de la fase 1. Con la 2a cambia de peso:
- Si el héroe que defiende cae, `applyVictory` captura el castillo.
- `captureTown` vacía la guarnición, que no ha llegado a pelear.
- `checkDefeat` elimina al dueño.

Así, la guarnición inicial que pidió el usuario («difíciles de tomar») desaparece
justo cuando el dueño vuelve a casa a defender.

Cómo reproducirlo (`base.mts`, sobre `planDeNodos`, con `createRng(3)`):
- Héroe del j0 dentro de su base sin tropa y la guarnición de 7 intacta.
- El rival entra con 2 esqueletos.
- `foe: {"kind":"hero"}` y en el tablero del defensor hay **un solo stack**, el héroe.
- Resultado: base del j1, guarnición 0, j0 eliminado.

En el juego por MCP (seed 77, día 4) lo vi tal cual. El héroe volvió rendido a casa
con 6 de 6. La batalla de la base se jugó con su tropa, y los 2 esqueletos, 2 zombis
y 2 momias de la guarnición se quedaron fuera.

Hay que decidir si la guarnición se suma al héroe o pelea después. La decisión es
del usuario o del arquitecto.

### Menores

**M1 — `pasoAbierto` puede señalar una casilla que no es el hueco.**
Pasa con fugas en diagonal que no están junto a un estrechamiento.

- **Muro en escalera** (tramos de una casilla en x = 9,10,10,11,11,12,12,13,13): dice
  «entre (11,7) y (12,7): pon un nodo en (12,7)». Ninguna de las dos casillas es
  hueco: las fugas están en los escalones diagonales.
- **Diagonal pura**: dice «(15,0)-(16,0)». Esa casilla es un estrechamiento entre el
  borde del mapa y la cordillera de x=17; poner ahí un nodo no arregla nada.

El rechazo es correcto; el consejo, no. El agente lo seguiría y volvería a fallar. El
riesgo es bajo: la prosa ya exige muros rectos, y las esquinas en L sí las nombra bien.

**M2 — «Lo hostil no se cruza» falla sin decir por qué.**
`moveHero` lanza `no hay camino hasta (19,4)` cuando el único paso es una ciudad
guarnecida o un héroe rival. El camino existe a la vista. Por la regla del repositorio
(«un mensaje escrito para la persona»), debería nombrar qué lo cierra, por ejemplo
«el paso de (17,4) lo guarda Torreblanca».

El agente lo tiene explicado en `COMO_SE_LEE_EL_MAPA`; la persona, no.

**M3 — Las bases no cumplen la letra de «ciudades en nodos de grado ≥ 3».**
Son de grado 2 en 1959 de 2000 bases (24×24) y en 60 de 60 (48×48). El plan, que el
usuario aprobó, lo declaraba («base = nodo de grado ≥ 2 más cercano a la esquina»), y
la base es una ciudad. Lo apunto para que no se dé por cumplido sin decirlo.

**M4 — La captura `desktop-02-mapa-ruta-dorada-y-gris` ya no enseña la ruta.**
Sale igual que la `01`, con el estado «ya está en esa casilla», tanto en la tanda del
ingeniero como en la mía. Antes del ciclo sí salía la ruta
(`2026-10-01-telon-del-espectador/capturas/`). Lo probable es que la base rival caiga
fuera del lienzo en ese tamaño.

En el navegador real la ruta funciona: hover → «Tierras desconocidas · hoy llegas a 9
de 22 pasos». Es un hueco del arnés, que da verde sin enseñar lo que su nombre promete.

**M5 — La ruta en la niebla dibuja la red sin explorar.**
El trazo esquiva cordilleras que el jugador no ha visto, así que revela la forma de la
red. Con agua ya pasaba; con la red en el centro del juego pesa más. Va con la 2b.

**M6 — Muros poco legibles (ya declarado por el ingeniero; es de la 2b).**
En `desktop-01` y en `sin-arte-01` el muro de una casilla no se lee como frontera: sin
arte no se ve ninguna cordillera. Los nodos son una banderita gris.

### Anteriores al ciclo, para no confundirlos con la 2a

- Un `move_hero` de varios días que se queda sin puntos a mitad sale en el veredicto
  como «descartada: no quedan puntos de movimiento», aunque el héroe sí anduvo (MCP
  req-3, 5 casillas andadas). Viene de `HEAD`.
- La prosa de `map_generate` termina con «se te devuelve la lista de problemas para
  que lo corrijas», pero no hay reintento («No se te va a volver a pedir»). Viene de
  `HEAD`.
- En el navegador, al empezar el día 2 la barra seguía diciendo «No te quedan puntos
  de movimiento…» con 1100/1100.

## Workarounds usados

- **Estado sintético en `reglas.mts` y `base.mts`** (dueños de nodo y ciudad escritos a
  mano, héroes colocados). Solo sirve para aislar la regla; cada resultado se contrastó
  con el flujo real en el MCP o en el navegador. I2 se vio también jugando.
- **Terminé la batalla por MCP rindiéndome y luego maté el servidor** a mitad de la
  defensa de la base. Las peticiones de batalla pesan ~20 KB y jugarla entera no
  añadía nada a la 2a; el desenlace lo reproduje con `base.mts`.
- **El puente MCP de esta sesión arrancó a las 05:45**, con el código de antes. La
  descripción publicada de la tool `map` todavía dice «una mina cambia de dueño». No es
  un fallo del código actual (la descripción sale de `COMO_SE_LEE_EL_MAPA`), pero quien
  tenga Claude Code abierto desde antes del cambio verá la prosa vieja hasta
  reiniciarlo. La prosa del turno sí era la nueva, porque la manda el servidor que
  arranqué yo.
- `pnpm partida` en los puertos por defecto (9880/9881), porque el puente los usa. Lo
  arranqué con `set -m`, lo maté por su grupo y comprobé que quedaban libres. Lo mismo
  con `pnpm dev` y el 3100.

## No probado

- Un **mapa válido diseñado a mano por el agente** jugado entero: solo había un plan
  por partida y lo gasté en el rechazo. El camino válido lo cubre `pnpm qa` con el plan
  del generador.
- **Varios héroes por bando** con la partida acabando a mitad de turno: el banco no
  contrata ninguno (`hero_hired` 0). `playAiTurn` lo guarda con `finished` en el bucle,
  pero no hay partida que lo ejerza.
- **Móvil y táctil en vivo**: solo los vi en las capturas de Playwright.
- La **regla de los puntos del día contra fheroes2**: no está verificada, y así lo
  declara el propio código.

## Veredicto

**Apto con reservas.**

El núcleo de la 2a hace lo que pide el usuario: la red se valida en los dos
productores, el territorio y la conexión se derivan, lo desconectado no cobra, la base
y las neutrales nacen guarnecidas, perder la base elimina y todo acaba. Lo respaldan
`verify` (629), el banco `02bf2610…`, 0/1000 en el barrido, `pnpm qa`, `capturas` y
una partida por MCP.

Antes del commit conviene arreglar dos cosas:
- **I1**: el cliente miente sobre por qué se gana o se pierde.
- **I2**: hay que decidir si la guarnición de la base defiende junto al héroe. Hoy
  anula la guarnición inicial justo cuando el dueño vuelve a casa.
