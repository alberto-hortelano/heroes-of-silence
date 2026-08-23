# Hallazgos de `/simplify` sobre el diff — 2026-08-23

Cuatro revisores independientes (reutilización, simplificación, eficiencia,
altitud) sobre el diff sin commitear. Deduplicados y ordenados por importancia.

**Lo que los cuatro confirman que está bien**, para que no se toque: el catálogo
por facción y el modelo de efectos están a la altura correcta — `bone_dragon`
aparece **cero veces** en `src/`, `speedBonus` no dejó rastro, y los cuatro
rasgos montaron sobre el modelo de efectos **sin añadir una línea al módulo**,
que es la prueba de que es general y no está moldeado sobre los hechizos de hoy.

---

## De fondo: cambian comportamiento. Empezar por aquí

### 1. `applyEffect` no tiene política de acumulación

`src/core/battle/effects.ts:63-67` hace `push` y ya. Es la única regla general
que un libro de efectos tiene que poseer, y falta.

Consecuencias reales, hoy:
- Un dragón óseo que muerde al mismo stack en rondas consecutivas mantiene
  **dos `fear` vivos a la vez: −4 de ataque sostenido** (`FEAR_ROUNDS = 2`).
- Una Lentitud por ronda acumula **−2, −4, −6** sobre `stackSpeed`.

La suerte y la moral lo disimulan porque se recortan al leer; **la velocidad y el
ataque no**. Cada consumidor está tomando esa decisión por accidente.

Arreglo: refrescar por `source` — sustituir el efecto del mismo origen
quedándose con el `roundsLeft` mayor, que es lo del original. Tres líneas en un
único sitio, y el campo `source` ya existe justamente para eso. **Con test.**

### 2. La regla de la salpicadura está escrita dos veces

`battle.ts:638` decide a quién alcanza; `tactics.ts:70` la vuelve a deducir por
su cuenta para que la IA no se dispare a los suyos. El día que cambie el radio o
el daño a aliados, **la IA seguirá jugando con la forma vieja en silencio**.

Arreglo: exportar `splashTargets(state, target)` junto a `splash()` y que lo
llamen los dos. La táctica pasa a ser una puntuación *sobre* la regla en vez de
una copia de la regla.

### 3. `EffectKind` declara `'morale'` y nadie lo produce

`effects.ts:19`, sumado en `:80-82`. Es **exactamente el pecado que el invariante
de esta misma tarea acaba de escribirse para cazar**, y el guardián no lo cubre.
O se quita, o se extiende el invariante a `EffectKind`. Elige, pero que no quede
una promesa sin respaldo el mismo día que añadimos el guardia contra las
promesas sin respaldo.

### 4. El parte de guerra puede discrepar del daño

`battle.ts:536` vuelve a preguntar `hexesMoved > 0 && hasTrait(info,'charge')`
después de que `damage.ts:95` ya lo decidiera, y el evento lleva los hexes
crudos: una carga de 7 hexes se lee «carga de 7 hexes» mientras el bono se topó
en +50 % (`damage.ts:96`).

Arreglo: `DamageResult` ya lleva `lucky`/`unlucky`; que lleve también lo de la
carga, y `strike` se limita a copiarlo.

---

## Limpieza. Consenso de dos o más revisores en casi todas

5. **`canReachMelee` reimplementado a mano** en `battle.ts:638` y `tactics.ts:70`.
   Se resuelve solo al hacer el punto 2, y de paso desaparecen el parámetro
   `objetivoHexes` de `splash` y el import de `areAdjacent` en `tactics.ts`.

6. **`moveTo` corre el BFS dos veces** (`battle.ts:440` y `448-452`):
   `movableHexes` ya calculó `reachable(...)` y tiró las distancias. Exponer el
   mapa de costes (un `moveCosts` hermano) y leer `.get(hexKey(to))`. Medido:
   ~3 % del tiempo de batalla. Y **el `?? hexDistance(...)` de la 452 es una
   corrección en silencio en un repo cuyo contrato es fail-loud**: o está muerto
   o tapa algo.

7. **`fear` y `curse_on_hit` son dos bloques gemelos** (`battle.ts:547-570`) y
   sus cuatro constantes cruzan la frontera de módulo para usarse una vez cada
   una. Una tabla `ON_HIT_EFFECTS` recorrida por `strike` deja 4 líneas donde
   hay 24, y el quinto rasgo de golpe cuesta una fila.
   **Ojo: `roundsLeft` es mutable, hay que clonar el efecto al aplicarlo.**
   Si la tabla se queda en código va junto a `strike`, no en `effects.ts`: el
   libro mayor de efectos no debería documentar dos criaturas.

8. **`isImmuneTo` (`effects.ts:54-57`)** es la única razón de que el módulo
   importe `../data.js`, cuando el plan pedía «puro, solo `./types.js`». Sus dos
   llamantes están en `battle.ts`. Que `legalActions` consulte la misma función
   en vez de copiar la regla está **bien**: es solo la ubicación.

9. **`tactics.ts:73-80`**: el `if/else` tiene las dos ramas haciendo lo mismo, el
   `reduce` sin valor inicial lanza si `candidatos` viniera vacío, y
   `salpicados` se recalcula ~23 veces para 5 enemigos.

10. **`createBattle:118-119`** recorta a ±3 a mano con números mágicos, al lado
    de `MIN_MORALE_LUCK`/`MAX_MORALE_LUCK`, que se exportan y no usa nadie de
    fuera. Una sola definición de la regla.

11. **`endTurn:342,344`** evalúa `effectiveMorale(s)` dos veces (`advance:318` ya
    lo iza a un local). **`build()` (`town.ts:111-123`)** busca el mismo id tres
    veces. **`spells.ts:82-85`** tiene una rama `null` inalcanzable.

12. **`test/battle.test.ts:358`**: `stackOfCreature` es copia campo por campo de
    `stackOf` (línea 59). Subirlo a ámbito de módulo y borrar la copia — 19
    líneas que hay que tocar cada vez que `BattleStack` gane un campo, como
    acaba de pasar.

13. **`panels.ts:237-244`**: `FUENTE_EFECTO` recopia los nombres castellanos de
    cuatro hechizos que `data/spells.json` ya tiene. Usar `spell(id).name` (con
    guarda: lanza con id desconocido) y dejar en el mapa local solo lo que es
    rasgo y no hechizo. Y `fear → 'Terror del dragón óseo'` mentirá el día que
    una segunda criatura tenga `fear`.

---

## Decisión pendiente: la guarda general de #46

`town.ts:89-94` está documentada por el propio ingeniero como **sin caso
alcanzable**, y dos revisores proponen borrarla porque quien sostiene la regla
es el test de coherencia del catálogo. Un tercero añade que, tal como está
colocada, llama a `factionLineup` (1,54 µs, rehace dos copias del `Map` de 21
criaturas) **antes** de los early-outs O(1) de las líneas 96-97, y que
`drawPlot` lo paga hasta 6 veces por fotograma.

Si se conserva, bajarla debajo de la línea 97. Si se borra, decirlo en
`implementacion.md`. Lo que no vale es dejarla donde está sin decidir.

## Se dejan tal cual, y con razón

- **`charge` viaja como argumento**, no como campo del stack. Un `hexesMoved`
  mutable habría que resetearlo en `beginRound` *y* en `endTurn`.
- **No filtrar el disparo suicida en `legalActions`**: legalidad y sensatez son
  preguntas distintas, y al agente hay que contarle la verdad.
- **La divergencia de `fear`** respecto a fheroes2, documentada en tres sitios.

## Va a issue de GitHub, NO a este commit

`battle.ts:721` llama a `movableHexes` **dentro** del bucle
`for (const e of enemies)`: 1+E BFS por cada `legalActions`. Sacarlo a un local
**divide por dos** el tiempo de resolución de batalla — 1150 ms → 580 ms en 300
batallas, con logs idénticos. Es previo a este diff.
