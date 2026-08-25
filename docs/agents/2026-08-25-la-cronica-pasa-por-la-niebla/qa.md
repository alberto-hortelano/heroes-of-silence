# QA — la crónica pasa por la niebla (#59)

Validación de once commits, `d2e4d93..e3e3ded`, contra los criterios literales de
`requisitos.md`. Todo lo que sigue lo ejecuté yo: no doy por bueno ningún número
de `implementacion.md` sin repetirlo.

**Veredicto: apto.** Los dieciséis criterios se cumplen y los tres puntos donde
el plan avisaba de que esto se rompe en silencio —la ventana de 25, el sello
después de la mutación y el `Set` que no sobrevive al `JSON`— los he roto a mano
y los he visto rojos. Los hallazgos que dejo son **uno importante y preexistente**
(una puerta lateral que devuelve la crónica del rival entera) y tres menores;
ninguno es una regresión de este ciclo.

---

## 1 · Los criterios, uno a uno

| # | Criterio | Veredicto | Evidencia (ejecutada por mí) |
|---|---|---|---|
| 1 | Una sola función en `core` decide | ✅ | `visibleTo` en `/home/al/code/heroes/src/core/state/events.ts:141`. Único llamante de producción: `cronicaPara` (`events.ts:212`). `grep -rn visibleTo src/` no la encuentra ni en `contract/` ni en `client/`; `panels.ts:412` declara por escrito que no la llama. |
| 2 | `day_start`, `game_over`, `player_defeated` siempre | ✅ | Sonda propia: reimplementé los criterios 2/3/4/5 a mano (**sin llamar a `visibleTo`**) y comparé contra `cronicaPara` sobre **todos los prefijos** del log de 40 semillas × 300 días, para los dos jugadores → **0 discrepancias**. Escenario: un jugador sin héroe y sin castillo recibe igualmente su `player_defeated` y el `game_over`. |
| 3 | Lo tuyo, siempre | ✅ | Mismo contraste: 0 discrepancias sobre 5811 eventos. Escenario dirigido: mi héroe muere a 16 casillas de todo lo mío y el `hero_defeated` llega (por `actor`, no por el sello). |
| 4 | Castillo propio perdido y héroe propio muerto | ✅ | Tres escenarios: (a) castillo **con** guarnición atacado con mi héroe a 25 casillas y en otra fila → `battle_started`, `battle_ended` y `town_captured from=0` llegan; el sello real de la captura es `[1]`, o sea que **llega por `from` y no por el sello**, que es la trampa que documenta el diseño. (b) castillo **sin** guarnición: se captura sin batalla y `town_captured` llega igual. (c) héroe propio muerto lejos: llega. |
| 5 | Del rival, solo si observabas el sitio | ✅ | 40 semillas × 300 días: al jugador 0 le constan 4468 eventos, **1143 del rival**, y **0 fugas** (fuga = evento ocultable del rival, no obligatorio, sin el jugador en el sello real). Y el positivo: una mina mía capturada **a la vista** de mi héroe sí llega (`seen:[0,1]`). Desglose por tipo abajo. |
| 6 | La regla se aplica al ocurrir, no al leer | ✅ | El sello lo pone `emit` (`game.ts:376-387`). Lo contrasté interceptando `state.log.push` **desde fuera** con un `Proxy` y recalculando el sello en ese mismo instante con `visibleNow` —la forma con `Set`, que es **otro camino de código** que el `visibleNowAt` que usa `emit`—: 5811 eventos, 40 semillas, **0 sellos incorrectos**. |
| 7 | Todo evento lleva protagonista y sitio | ✅ | Dos vías. `tsc`: quité `actor`/`at` a un emisor → `TS2345 … is missing the following properties from type 'Origen': actor, at`. Camino real: 40 semillas × 300 días = **5811 eventos, 16 tipos, 0 sin protagonista** (salvo `day_start`, que no lo hace nadie) y **0 sin sitio** (salvo los cuatro que no tienen casilla). |
| 7b | `from` en `mine_captured` y `town_captured` | ✅ | 0 capturas sin `from` en los 5811 eventos. |
| 8 | Lo escribe quien captura, antes de mutar | ✅ | `captureTown` lee `const anterior = town.owner` **antes** de `town.owner = player` (`game.ts:852-857`); la rama `mine` de `collectAt` hace lo mismo (`game.ts:809-822`); `settleBattle` y `applyVictory` leen `const dueño = …owner` **antes** del `state.heroes.filter` (`game.ts:1090-1093`, `1124-1128`). |
| 9 | La pantalla dice a costa de quién | ✅ | Navegador, `?seed=26`, día 3: **«El jugador 1 te ha capturado un castillo»**, clase `lose`. (El espejo —«Has capturado un castillo …»— no llegué a verlo jugando; ver *No probado*.) |
| 10 | El cliente **no** se filtra (retirado a propósito) | ✅ | `panels.ts:134` pasa `session.state.log` entero. Navegador, `?seed=48`: con mi héroe quieto en casa y sin ver nunca el castillo enemigo, la crónica del lateral muestra las cuatro construcciones y los dos reclutamientos del jugador 1. La decisión se cumple tal como está escrita. |
| 11 | `renderLog` deja de mentir | ✅ | Navegador, líneas leídas del DOM con su clase: lo mío en `win` («Reclutados 12 × Campesino», «Construido: Morada de nivel 2», «Héroe contratado», «Guarnición incorporada», «Mina capturada»); lo del rival atribuido y sin color («El jugador 1 construye: …», «El jugador 1 recluta 6 × Zombi»); **«Ha caído un héroe del jugador 1» en clase `win`** (`?seed=48`, día 3) — la línea que el ingeniero no pudo ver; y «Un héroe tuyo ha caído» en `lose`. |
| 12 | El color, con el dato correcto | ✅ | Mismo volcado. Además `class=""` vacío: 0 en todo el DOM; ni un `undefined`/`NaN`/`[object` en la pantalla. |
| 12b | El sello sobrevive al `JSON` de ida y vuelta | ✅ | **Guardia roto por mí**: cambié `seen` a un `Set` dentro de `emit` → `test/invariantes.test.ts:387` rojo, con el fallo exacto que avisa #10 (`"seen": {}`). Restaurado y verde. |
| 13 | `pnpm verify` verde | ✅ | `Test Files 12 passed · Tests 230 passed`, `tsc` limpio, `biome` limpio (65 ficheros). Ejecutado tres veces a lo largo de la sesión. |
| 14 | `pnpm qa` verde y la política sigue valiendo | ✅ | `rc=0`. `[qa] 15 veredictos, 15 entraron, 0 descartadas`; las cinco consultas ejercitadas; `terminado por fin de partida: 2 turnos de mapa y 13 decisiones de batalla`. Confirmo además lo que dice el plan: `tools/qa/politica.ts` **no lee `recentEvents`**, así que `qa` daría verde con el filtro roto — prueba el contrato, no el reparto. |
| 15 | El esquema zod y la prosa viajan juntos | ✅ | No hay cambio de zod y es correcto: los esquemas de `agent.ts` validan lo que el agente **responde**. La prosa sí cambia: `RESPONSE_FORMAT.adventure_turn` (`agent.ts:175-180`) explica que `recentEvents` es lo que observabas *cuando ocurrió*, que un silencio no es quietud, y la cabecera (`agent.ts:11-16`) fija que el protagonista es siempre `actor` tras quitar los `player`/`winner` duplicados. Aserto vivo en `test/agent-contract.test.ts:245`. |
| 16 | Tests deterministas y al menos uno adversarial | ✅ | `test/cronica.test.ts`, mapa a mano de 40×12 y semillas fijas; los dos adversariales están (lejos → no llega; a la vista → llega, y paso a paso). |

### La ventana de 25 — comprobada aparte, porque es donde se rompe en silencio

Es el punto que el plan marca como invisible para cualquier otro test, así que no
me quedé con el aserto del ingeniero (209 lecturas):

- **8593 lecturas con 25 o más eventos visibles disponibles → 8593 entregaron exactamente 25.** Cero excepciones, sobre 40 semillas × 300 días y para los dos jugadores, comparando contra `visibles.slice(-25)` calculado con mi reimplementación de los criterios.
- **Y no se inventan 25 cuando no los hay**: en los prefijos con menos de 25 visibles, la longitud entregada coincide exactamente con el número de visibles, elemento a elemento y en orden. 0 discrepancias.
- **Mi sonda muerde**: le sustituí `cronicaPara` por la composición mala (`slice(-25).filter(...)`) y saltó de inmediato — `ventana semilla 1 k=31 p=0: 19 vs 25`, y así en cadena. Sin esa comprobación previa, un «0 discrepancias» no valdría nada.
- Ningún evento entregado lleva `seen`: comprobado en cada uno de los prefijos.

### Lo que le llega hoy al agente del rival (40 semillas × 300 días)

| Tipo del rival | Ocurren | Le constan al jugador 0 |
|---|---:|---:|
| `hero_moved` | 1407 | 519 |
| `turn_start` | 256 | 256 (siempre, por diseño) |
| `built` | 204 | 12 |
| `recruited` | 98 | 6 |
| `hero_defeated` | 98 | 97 |
| `battle_started` / `battle_ended` | 87 / 87 | 82 / 82 |
| `hero_hired` | 65 | 18 |
| `mine_captured` | 58 | 5 |
| `garrison_taken` | 41 | **0** |
| `player_defeated` | 33 | 33 (siempre) |
| `resource_gained` | 25 | 10 |
| `town_captured` | 13 | 13 (todas son la captura de un castillo mío) |
| `game_over` | 7 | 7 (siempre) |
| `spells_learned` | 7 | 3 |

Los que quedan altos tienen explicación y la comprobé: `hero_defeated` 97 de 98
porque casi todas las muertes del rival ocurren en una batalla en la que estoy yo
—y el sello me incluye—; `town_captured` 13 de 13 porque en el mapa por defecto
solo hay dos castillos y todas las capturas del rival son de uno mío.

### La serie entera no mueve ni una partida

Comprobación mía, no la del ingeniero: creé un `git worktree` en `d2e4d93` y
corrí el barrido en los dos árboles.

```
$ diff barrido-antes.txt barrido-ahora.txt
IDÉNTICO: ni una partida se ha movido en 40 semillas
```

`sin terminar: 0/40 → []`, `batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100`.
El worktree está eliminado y `git worktree list` solo lista el checkout.

---

## 2 · Los guardias, rotos por mí

La regla de la casa es que un guardia solo cuenta cuando se le ha visto morder en
manos distintas de las de quien lo escribió. Los cinco, uno a uno. **Todas las
sondas retiradas: `git status --porcelain` no lista ni un fichero modificado y
`pnpm verify` vuelve a 230 verdes.**

| Guardia | Cómo lo rompí | Qué salió |
|---|---|---|
| Round-trip `JSON` (12b) | `seen: new Set(seen) as unknown as PlayerId[]` en `emit` | `test/invariantes.test.ts:387` rojo, con `- "seen": Set { 0 }` / `+ "seen": {}` |
| El `as` que abre `state.log` | copié `(session.state.log as GameEvent[]).push(...)` a **`src/client/views/panels.ts`** (fichero distinto del que probó el ingeniero) | rojo, nombrando fichero y línea: `"src/client/views/panels.ts:137 → (session.state.log as GameEvent[]).push(…)"` |
| `switch` exhaustivo de `serialize.ts` | quité `case 'chest'` | `TS2322: Type '{ readonly kind: "chest"; … }' is not assignable to type 'never'` |
| `switch` exhaustivo de `renderLog` | quité `case 'built'` | `panels.ts(527,13): TS2322: Type '{ kind: "built"; … } & Origen & Sello' is not assignable to type 'never'` |
| El candado `readonly log` | `state.log.push(...)` fuera de `emit` | `TS2339: Property 'push' does not exist on type 'readonly GameEvent[]'` |
| `actor`/`at` obligatorios | `emit(state, { kind: 'turn_start' })` | `TS2345: … is missing the following properties from type 'Origen': actor, at` |

Y una prueba más, que no estaba en la lista: **añadí un decimoséptimo `kind`** a
la unión (`{ kind: 'sonda_qa'; cosa: string }`). Se pusieron rojos los dos sitios
que tienen que decidir: `renderLog` (`TS2322 … not assignable to type 'never'`) y
`visibleTo` (`TS2366: Function lacks ending return statement`). El candado
funciona en las dos direcciones.

---

## 3 · Hallazgos

### 🟠 Importante (preexistente, **no** es regresión de este ciclo) — `game_state` con el id del rival devuelve su vista entera, crónica incluida

Este ciclo cierra la puerta principal y deja abierta la de al lado. La tool de
consulta `game_state` acepta **cualquier** id de jugador y no comprueba que sea
del agente que pregunta:

- `/home/al/code/heroes/src/server/consultas.ts:18-21` → `return serializeAdventureTurn(state, Number(args.player ?? 1));`
- `/home/al/code/heroes/src/server/mcp/server.ts:296-301` → el parámetro se le **anuncia** al agente: `player: z.number().int().optional().describe('Jugador (por defecto, el tuyo: 1)')`

**Reproducción, por el camino real (`responderConsulta`, que es lo que llama la tool):**
semilla 9, 4 días de IA contra IA, el agente lleva al jugador 1.

```
game_state{player:1} → 25 eventos,  9 del rival
game_state{player:0} → 25 eventos, 10 del jugador 0 (los suyos),
                       y sus recursos: {"wood":0,…,"gold":2060}
```

En un escenario dirigido, 14 de los 19 eventos que devuelve la vista ajena son
del jugador 0 y **no están** en la crónica propia del agente.

**Qué esperaba quien juega**: que la niebla sea niebla. Hoy un agente que quiera
saltársela no tiene que adivinar nada: pide la vista del rival y se la dan, con
su crónica, sus recursos, sus héroes y sus castillos. Es exactamente la forma del
hallazgo 12 de la pasada de simplificación (`seen` saliendo por la puerta del
espectador), que sí se cerró.

**Por qué no lo llamo bloqueante**: es anterior a este ciclo —#35 tiene el mismo
agujero para el mapa— y ningún criterio de `requisitos.md` lo cubre. Pero mientras
siga ahí, el criterio 1 no es exigible en la única frontera que importa. El
servidor ya sabe qué jugadores lleva el agente (`director.agentPlayers`), así que
el arreglo es una comprobación, no un rediseño. **Merece issue.**

### 🟡 Menor — el guardia del `as` no ve el escape por `as unknown as`

El guardia (`test/invariantes.test.ts:340`) busca `/\.log\s+as\s+(?!const\b)/`.
Caza la copia literal del cast, que es lo que predecía el hallazgo 5. No caza
esto, que metí al principio de `serializeAdventureTurn`:

```ts
(state as unknown as { log: unknown[] }).log.push({ kind: 'sonda' });
```

Resultado: **`tsc` rc=0, `biome` limpio, 230/230 verdes**. (La variante sin
`unknown` intermedio sí la para `tsc`: `TS2352 … 'readonly GameEvent[]' is
'readonly' and cannot be assigned to the mutable type`.) El fichero de invariantes
tiene por costumbre **declarar el límite de cada guardia** en su docstring —el de
rutas absolutas lo hace, el del `as` declara que no mira los tests—; este límite no
está escrito. O se amplía el patrón, o se declara. Es una línea de comentario.

### 🟡 Menor — un castillo no ve nada más allá de su propia casilla, y ahora eso pesa

`visibleNow`/`visibleNowAt` dan a los pueblos **radio 0**: solo su casilla
(`game.ts:304`, `game.ts:344-346`). Con la crónica filtrada, la consecuencia es
nueva: el rival puede plantarse **pegado a mi capital** y al agente no le llega ni
un `hero_moved`.

**Reproducción**: mapa plano de 40×12, mi castillo en (2,6), mi héroe llevado a
(20,1); el rival camina hasta (3,6), la casilla de al lado de mi castillo.
`recentEvents` del jugador 0: **0 `hero_moved` del rival**.

Antes de este ciclo el agente lo leía igual en el log, así que el punto ciego no
se notaba. `requisitos.md` lo previó por escrito —«si el filtro descubre que
`visibleNow` está mal, se dice y se abre issue»—: esto es eso. No es una
regresión y no lo arregla este ciclo; es la semántica de #35 quedándose al
descubierto. **Merece issue.**

### 🟡 Menor — el parte de guerra conserva el mismo bug que este ciclo arregló arriba

`renderBattleLog` (`panels.ts:369-405`) sigue con `default: return ''` —lo declara
el propio § A.5 del informe— y, además, pinta `perished` **siempre** en clase
`lose`: «Una unidad ha sido aniquilada» sale en rojo aunque la unidad aniquilada
sea del enemigo. Es literalmente la misatribución que el criterio 11 acaba de
arreglar un piso más arriba para `hero_defeated`. No es un arreglo de una línea:
`BattleEvent` de tipo `perished` solo lleva `stack` (`src/core/battle/types.ts:99`),
sin bando, así que la pantalla no tiene el dato. El ciclo tocó esta función en dos
commits (`4f3efeb`, `9e44198`), así que conviene que quede apuntado. **Merece issue.**

### ⚪ Observaciones, sin acción

- `visibleTo` se pone rojo ante un `kind` nuevo por «falta el `return` final»
  (`TS2366`), no por el idioma `const x: never = e` que usan los otros dos
  `switch`. Muerde igual —lo comprobé—, pero el mensaje no dice **qué** variante
  falta. Cosmético.
- El aliasing de los `Point`: `state.log` guarda referencias a `town.at`,
  `obj.at` y `paso.at`. Comprobé la premisa del informe con
  `grep -rn "\.at\.x *=\|\.at\.y *="` sobre `src/`: solo hay comparaciones, ni
  una asignación. Hoy no puede morder; queda apuntado como lo dejó el ingeniero.
- El `hero_moved` paso a paso sigue siendo el 45 % de lo que le llega del rival
  (519 de 1143). No es fuga —los 519 llevan mi id en el sello— sino ruido de
  contexto; agrupar el viaje es decisión de producto, no de niebla.

---

## 4 · Workarounds usados, y su veredicto

1. **`wmctrl` + un `Ctrl+9` por XTEST para traer al frente la pestaña del juego.**
   Sin eso Chrome mantenía la pestaña en `visibilityState: "hidden"`,
   `requestAnimationFrame` no disparaba **ni una vez** y la pantalla no llegaba a
   pintarse (verificado: 0 botones en el DOM de una pestaña recién navegada). Es
   exactamente el muro que dejó al ingeniero sin ver el parte de guerra, y la
   causa es del **entorno** —esta máquina tenía otras ventanas de agentes
   robando el foco—, no del producto: quien juega tiene su pestaña delante.
   **No es hallazgo.**
2. **«Ver mapa entero» en la semilla 26**, para localizar el castillo enemigo. Es
   un botón de la interfaz normal y no cambia lo que recibe `renderLog` —el
   cliente ve el log entero de todos modos—, así que no falsea nada de lo que
   estaba midiendo. De hecho **demuestra el criterio 10**. No es hallazgo.
3. **Elegir la semilla 48 buscándola antes fuera del navegador.** Simulé «yo no
   hago nada, solo paso turno» sobre 80 semillas para encontrar una en la que
   muera un héroe **enemigo**, y luego la jugué en el navegador pulsando solo la
   barra espaciadora. No hay estado forzado: la receta es `?seed=48`, pasar
   turnos, día 3. **No es hallazgo**, y deja la comprobación repetible.
4. **En dos sondas puse la guarnición a mano** (`town.garrison = …`) para tener un
   castillo defendido y otro indefenso en el mismo mapa. Es estado sintético
   **dentro de una sonda**, no en el producto, y el camino natural —castillo sin
   guarnición, capturado sin batalla— es justamente el que salió solo. Lo declaro
   porque el criterio 4 se apoya en las dos ramas.

---

## 5 · No probado, y por qué

- **La línea «Has capturado un castillo …»** (mi propia captura) y **`spells_learned`**
  en el navegador: en las cinco partidas que jugué no llegué a tomar el castillo
  enemigo ni a levantar el gremio. Las cubre `test/cronica.test.ts` llamando a
  `renderLog` con los seis casos (mío / suyo / neutral), que para una función de
  pintado puro es una comprobación legítima — y su entrada, el campo `actor`, sí
  está verificada por las sondas de 40 semillas.
- **El canal del espectador** (`ws-server.ts:102`): confirmé por lectura que manda
  `state.log.slice(-40).map(sinSello)` —el sello ya no sale por ahí, que era el
  hallazgo 12—, pero **no hay ningún consumidor en el repo**, así que lo que viaja
  por el cable no lo ha visto nadie. El propio informe lo declara.
- **Tres o más jugadores**: `visibleTo`, `emit` y el sello están escritos para N,
  pero ningún camino del juego crea más de dos (los jugadores salen de
  `plan.heroStarts`). No lo ejercité.
- **El guardado y la carga (#10)**: el guardia del round-trip `JSON` es un
  sustituto, no la cosa real. Hasta que exista #10 no se puede probar de verdad
  que la crónica vuelve del disco entera.
- **Los tiempos**: no los he convertido en nada. `load average` entre 8 y 13
  durante toda la sesión, así que cualquier medida de reloj de hoy es ruido —el
  ingeniero hizo bien en no tocar los de `CLAUDE.md`—.

## 6 · Lo que `implementacion.md` declaraba sin cubrir, revisado

Los cinco puntos de su § 5 y su § A.5 los doy por correctamente declarados, y
confirmo cada uno: el lienzo del cliente sigue pintando con `player.fog`
(`adventure.ts`), el log del espectador va sin filtrar, `pnpm qa` no prueba el
filtro (verificado: `politica.ts` no lee `recentEvents`), el coste de `emit` no se
ha optimizado más allá de la ampliación A, y `hero_moved` sigue llegando paso a
paso. La única casilla que él declaró no haber podido cerrar —la muerte de un
héroe **enemigo** en pantalla— **la he cerrado yo**: `?seed=48`, día 3, «Ha caído
un héroe del jugador 1» en clase `win`.

## 7 · Comandos, ejecutados por mí

```
pnpm verify                              → 12 ficheros, 230 tests, verde (tres pasadas)
pnpm qa                                  → rc=0 · 15/15 veredictos · 5 consultas · fin el día 3
npx tsx tools/qa/barrido-semillas.ts     → sin terminar 0/40 · idéntico a d2e4d93
```

Árbol limpio al terminar (`git status --porcelain` sin entradas modificadas),
`HEAD` en `e3e3ded`, el servidor de desarrollo parado y el puerto 3100 libre.
**0 € de fal.ai**: no ejecuté nada de `tools/gen/`.
