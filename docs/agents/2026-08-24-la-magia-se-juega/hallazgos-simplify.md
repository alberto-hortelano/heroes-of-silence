# Hallazgos de `/simplify` — la magia se juega

Cuatro revisores independientes (reutilización, simplificación, eficiencia,
altitud) sobre el diff sin commitear. Aquí van **deduplicados y decididos**: si
dos revisores señalan lo mismo, aparece una vez; donde se contradicen, la
decisión está tomada y razonada.

Lo que los cuatro dieron por bueno, para que no se toque: el cliente **no**
construye el `cast` a mano —sale de `find()` sobre `battleLegalActions()`—, la
heurística es un `switch` por `kind` sin un solo `spell.id === '...'`, nada suma
al stack, `townSpells` deriva en vez de guardar, y `bestCast` no vuelve a llamar
a `legalActions` (medido: `chooseBattleAction` sale **más barata** que antes,
165 µs contra 194 µs, porque al devolver el `cast` se salta el `movableHexes`
final). **#48 no empeora.**

---

## A · `legalActions` reimplementa las cuatro reglas de `castBlocker`

`battle.ts:718` define el bloqueador; `battle.ts:804-807` vuelve a escribir sus
cuatro condiciones a mano (hay héroe, no ha lanzado, lo conoce, le llega el
maná). **Señalado por dos revisores.**

El coste no es estético: `agent.ts:180` le promete al agente que *elegir de
`legalActions` nunca falla*, y esa promesa la sostiene una copia. La quinta
regla que entre —un silencio, un tope de nivel, un anti-magia— se aplicará al
lanzar y no al ofrecer.

**Se arregla junto con B**, porque es la misma pieza.

## B · Un motivo de regla redactado en el cliente

`session.ts:307` escribe `'no hay ningún objetivo válido'`. Es una regla del
juego —la inmunidad de los no-muertos— redactada fuera del núcleo, y un test la
fija literalmente (`test/battle.test.ts:1001`). **Señalado por dos revisores**, y
choca con la frontera que `CLAUDE.md` protege: el día que el juego hable por
WebSocket esa frase viaja con la capa equivocada, y el agente por MCP no la ve
nunca.

**Arreglo, que cubre A y B a la vez:** `castBlocker(state, side, spellId, targetId?)`.

- Sin objetivo: las cuatro reglas de ahora **más** «ningún objetivo válido» si
  ninguno pasa. Esa frase pasa a vivir en `core`.
- Con objetivo: además vivo/muerto, aliado/enemigo e inmunidad — las tres
  redacciones sueltas de `castHeroSpell:743-750` se colapsan aquí.
- `legalActions` ofrece el par `(hechizo, objetivo)` cuando el bloqueador es
  `null`; `castHeroSpell` lanza con esa misma frase; `session.spellOptions` la
  enseña sin redactar nada.

Y entonces cae solo el hallazgo menor de que `castBlocker` se llame aunque el
hechizo sea lanzable (`session.ts:301`): con `castable` verdadero el bloqueo es
`null` por construcción, así que solo se pregunta cuando hace falta.

## C · La IA paga un refresco al precio de un lanzamiento nuevo

`tactics.ts:71` — `spellValue` no mira `objetivo.effects`. La regla titular de
`effects.ts` es que **el mismo origen refresca, no apila**, así que relanzar
Lentitud sobre un stack que ya la tiene con 2 rondas vale **1 ronda marginal**,
no tres. Medido sobre el repo: con Poder 3 la IA la relanza **cada ronda** a
precio completo.

Y el cambio hermano de este mismo ciclo lo vuelve persistente: como el maná ya
no se recupera al salir de la batalla, la IA llega al mapa a cero por haber
comprado tres veces la misma Lentitud.

**Arreglo:** el valor de un efecto temporal es `rondas_nuevas − rondas_que_le_quedan`,
leído de `stack.effects` con la misma función que decide el refresco. No es un
caso especial por hechizo: es la misma resta para `speed`, `luck` y lo que venga.
Subir `VALOR_MINIMO_POR_MANA` para tapar esto **no vale**: rompe el caso bueno,
que es el primer lanzamiento.

**Cambia el comportamiento de la IA → hay que repetir el barrido de 40 semillas.**

## D · La IA se copia dos fórmulas del núcleo

`tactics.ts:74` y `:91` reescriben `(basePower ?? 0) + (perPower ?? 0) * spellPower`,
que ya vive en `castSpell` (`spells.ts:80` y `:89`) — cuatro copias en total. Y
`tactics.ts:82` reescribe `Math.max(1, caster.spellPower)`, que es la regla de
duración que `CLAUDE.md` documenta en su tabla y que `effectOfSpell` **ya exporta
precisamente para que un tercero la pregunte sin aplicar nada**.

**Señalado por dos revisores**, y es el gemelo exacto que la vuelta pasada se
cerró con `splashTargets()`.

**Arreglo:** exportar `spellAmount(s, caster)` de `spells.ts`, usado por
`castSpell` y por `spellValue`; y usar `effectOfSpell(sp, hero).roundsLeft` en
vez de recalcular las rondas.

## E · El guardia de `EffectKind` puede ponerse verde con un lector muerto

`test/invariantes.test.ts:100`. **Aquí dos revisores se contradicen y decido yo.**

El de altitud propone filtrar `effects.ts` del corpus, como el guardia de rasgos
filtra `types.ts`. **Ese arreglo es incorrecto y lo pondría rojo por un falso
positivo**: la única llamada `effectTotal(…, 'luck')` del núcleo es
`effectiveLuck`, que vive en `effects.ts:89`… y `damage.ts:10` la importa. El
lector es real.

Pero su preocupación sí es válida: hoy basta escribir dentro de `effects.ts` un
`effectiveDefense()` que no llame nadie para que el guardia se ponga verde. Y el
otro revisor añade que el ancla es textual: un lector escrito como
`for (const k of EFFECT_KINDS) effectTotal(s, k)` lo pondría rojo siendo válido.

**Arreglo, que resuelve las dos objeciones: cambiar el guardia de textual a
ejecutable.** Una tabla en el test que asocie cada `EffectKind` con el lector del
motor que lo suma, más dos asertos:

1. La tabla **cubre `EFFECT_KINDS` exactamente** — añadir `'defense'` pone el
   test rojo hasta que alguien declare su lector.
2. Cada lector **se llama de verdad** y su salida cambia al colgar un efecto de
   ese tipo — un lector muerto no puede satisfacerlo, que es justo el agujero.

Sigue naciendo verde y muerde más fuerte que el textual. **Hay que comprobar que
muerde**: añadir `'defense'` a mano, ver el rojo, quitarlo.

## F · `legalActions()` se ejecuta dos veces por fotograma en el cliente

**Señalado por los cuatro.** Antes del diff el panel de batalla no lo llamaba ni
una vez; ahora `spellOptions()` lo llama en cada repintado y `castTargets()` lo
vuelve a llamar entero cuando hay hechizo elegido.

Medido en batalla 5v5: `legalActions()` = **173 µs**; el trabajo de núcleo por
fotograma pasa de **29 µs a 213 µs**, y a **356 µs** con hechizo elegido — ×7,3 y
×12,2. Se paga a 60 fps mientras hay animación, que es todo el turno de la IA.

**Arreglo en tres pasos, del más barato al menos:**

1. `if (hero.spells.length === 0) return [];` al principio de `spellOptions()`,
   **antes** de pedir las acciones. Hoy un héroe contratado sin gremio paga
   173 µs por fotograma para pintar «no conoce ninguno».
2. Que `SpellOption` lleve `targets: readonly string[]` y que `castTargets()`
   sea `spellOptions().find(...)?.targets ?? []`. Un solo predicado
   `a.type === 'cast' && a.spell === id`, en un sitio; y `castable` pasa a ser
   `targets.length > 0`, con lo que se cae la tercera copia del mismo bit.
3. Una caché de una entrada en `Session` para `battleLegalActions()`, limpiada
   en todo método que mute la batalla. Es correcta por construcción **porque el
   invariante ya garantiza que `session.ts` es la única puerta al núcleo**: nada
   puede mutar la batalla a su espalda. Si al implementarla la invalidación no
   queda obviamente completa, **déjala fuera y anótalo**: con 1 y 2 el coste ya
   baja a una llamada, y una caché mal invalidada pinta botones mentirosos.

De paso, `main.ts:113` construye un `Set` vacío por fotograma aunque no haya
hechizo elegido; el campo es opcional en `BattleView`. Hacerlo obligatorio y
pasar `new Set()` solo cuando hay selección quita el `?.… === true` del sitio de
llamada.

## G · Dos escrituras gemelas del héroe de batalla al del mapa

`game.ts:675-676` y `:757-758`. `battleSideForHero` es la **única** función que
copia mapa → batalla; la inversa está escrita dos veces, y este diff le añadió la
línea del maná a cada una por separado.

El test nuevo cubre solo el camino del atacante; el del defensor únicamente se
ejecuta cuando el atacante pierde. El próximo campo que la batalla mute
—experiencia, un artefacto— se añadirá a uno de los dos sitios y llegará a
partida en verde.

**Arreglo:** una `restoreHeroFromBattle(mapHero, battleHero, army)` junto a
`battleSideForHero`, para que las dos direcciones del mismo mapeo se lean juntas.

## H · Un test tautológico

`test/battle.test.ts:691-701` compara `o.castable` contra el mismo `some()` con
el que `spellOptions()` calcula `castable`, sobre el mismo estado y con una
función pura. **No puede fallar pase lo que pase con las reglas**: si alguien
hace que `castable` mienta, miente en los dos lados y el bucle sigue verde.

Es el mismo patrón que apareció en el ciclo anterior. **Arreglo:** borrar el
bucle y anclar contra el **hecho**, no contra la fórmula — que `magic_arrow` sea
lanzable con maná y no lo sea sin él. Lo que viene después (la Maldición sobre
no-muertos y el `motivo`) sí prueba algo y se queda.

## I · Un helper de test que monta una batalla imposible

`sesionEnBatalla` inventa `foe: { kind: 'monster', objectId: 'monstruo-de-prueba' }`,
un id que **no existe** en `state.map.objects`. Funciona porque ninguno de esos
cuatro tests cierra la batalla; el primero que llame a `finishBattle()` se
estrellará contra `monstruo no encontrado` (`game.ts:619`) y parecerá un bug del
núcleo.

**Arreglo:** que el helper use un monstruo real del mapa. Y de paso, la receta
«coloca al héroe junto al monstruo y entra» va ya por su sexta copia entre
`game.test.ts` y `battle.test.ts`: extraer `forzarBatalla(state, ctx, hero)` a
`test/helpers.ts`, que ya es la casa de `agresiva` y `simular`.

---

## Limpiezas menores, todas de una línea o dos

| Dónde | Qué |
|---|---|
| `hero.ts:87-101` | `learnable()` se defiende con un `Set` mutado en bucle contra una oferta con ids repetidos **que no puede existir** (`allSpells()` sale de un `Map`). Un `filter` de dos líneas hace lo mismo |
| `game.ts:339` | `syncSpellbooks` se exporta sin un solo llamante externo. Quitar el `export`: un símbolo exportado se lee como parte del contrato del núcleo |
| `tactics.ts:211` | El `wait` se **busca** en una lista de cientos de entradas cuando sus dos vecinos se construyen. `if (!s.waited) return { type: 'wait' };` |
| `battle.ts:736-740` | Un `as BattleHero` con dos líneas de comentario que explican al comprobador de tipos. Comprobar el nulo antes y el estrechamiento sale solo |
| `render/battle.ts:197` | `'#7fd4d8'` copiado a mano con un comentario que dice que es el cristal de la paleta. Es `RESOURCE_COLORS.crystal` (`render/palette.ts:21`) |
| `panels.ts:206` | `Parameters<typeof townSpells>[0]` pudiendo ser `import type { Town }`, que el fichero ya importa de ese módulo |
| `session.ts:287-294` | Copia las cuatro guardas de `battleMovable()` («¿es mi turno de verdad?»). Un privado que las tenga una vez |
| `panels.ts:136,206` | Dos pintores casi idénticos de «nombre + coste». El tercero (`renderSpells`) **sí es distinto** —botones con `disabled` y `title`— y no entra en el saco |
| `agent-contract.test.ts:118-148` | Re-demuestra la regla nivel→hechizos que `game.test.ts:605` ya cubre, y repite por tercera vez el aserto de ida y vuelta por JSON. Que pruebe **lo suyo**: que el campo existe y refleja el núcleo |
| `battle.test.ts:817` | El test de `wait` vive dentro de `describe('la IA lanza hechizos')` y no toca hechizos |
| `invariantes.test.ts:83,100` | Sexta lectura completa de `src/core` (0,67 ms, ~8 % del fichero). Subir el corpus a ámbito de módulo. Y la cabecera sigue diciendo «cuatro… los cuatro nacen en verde» cuando ya son seis |
| `tools/qa/barrido-semillas.ts` | Su docstring dice que la línea base es 4/40 (9, 18, 24, 34) y la ejecución de ahora da **2/40** (9, 18). Corregirlo, y anotar que la de 4/40 era la línea base **antes** del cambio |

## Lo que se descarta a conciencia

- **`wisdom: 1` es inerte hoy** y un revisor propone quitarlo. **Se queda**: es
  una decisión del usuario, tomada con esa consecuencia escrita delante
  («Visto bueno al plan», punto 2 de la sección de Sabiduría).
- **Quitar el getter `battleHero`** (un revisor) choca con reutilizarlo para
  deduplicar las guardas (otro). Se queda el getter y se usa en los dos sitios.
- **Los desempates del `sort` de `townSpells`**: inobservables hoy, pero dan un
  orden estable al contrato del agente. No se tocan.
- **`townUnder(state, hero)`**: el patrón estaba repetido seis veces **antes**
  del diff. Fuera de alcance; va al backlog.
