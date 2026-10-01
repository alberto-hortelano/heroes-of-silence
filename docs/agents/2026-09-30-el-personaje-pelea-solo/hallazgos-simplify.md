# Hallazgos de /simplify — consolidados y decididos por el coordinador

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el
diff sin commitear. Deduplicados; cada uno lleva ya la decisión. **Condición dura
de siempre: el sha de `pnpm banco` no se mueve.** Tras aplicar: `pnpm verify`,
`pnpm banco`, `pnpm qa`, y el espectador mirado en el navegador (se toca su cable).

## Se aplican

1. **Moral y suerte se calculan una vez, sobre unidades ya resueltas**
   (altitud 3 + 4, simplificación 1 y 2). `resolveUnit` deja de repetir la regla
   en dos ramas: devuelve `{unit, topHp, ownMorale, ownLuck}` (0 y 0 para una
   criatura) y la moral se calcula una vez: `hasTrait(unit,'undead') ? 0 :
   clamp(base + ownMorale)`, suerte `clamp(luckBonus + ownLuck)`. `armyMorale`
   pasa a calcular la diversidad **sobre las `UnitInfo` resueltas**, saltando
   `unit.faction === null`, y deja de preguntar por `member`: así
   `UnitInfo.faction` tiene lector y el hecho «un personaje no tiene facción» se
   declara una sola vez (en `stats.ts`). Rama `<= 1` → `=== 1` tras el `=== 0`.
   Para criaturas los valores y el orden son los de hoy: el banco lo confirma.
2. **Una puerta para buscar un personaje** (reutilización 2, simplificación 3).
   `characterOf(state, id): Character` en `game.ts` que lanza diciendo el id; la
   llaman `membersOf` y `woundsFromBattle`. El `throw` de `resolveUnit` se queda:
   `createBattle` es una entrada pública (los tests construyen bandos a mano).
3. **`woundsFromBattle` usa `stackHp(s)`** en vez de repetir
   `s.count > 0 ? s.topHp : 0` (reutilización 1), y sale al principio si
   `state.characters === undefined` (eficiencia 6).
4. **`membersOf` en un solo bucle** que devuelve `undefined` si no hay miembros,
   sin arrays intermedios (simplificación 4, eficiencia 3).
5. **`Character.experience` fuera** hasta la fase 3, que es la que le dará lector
   (simplificación 6). `level` se queda: lo lee `combatProfile`.
6. **Sin `export`** en `spentPoints`, `ATTRIBUTE_MIN`, `ATTRIBUTE_MAX`,
   `POINT_BUDGET` si nadie de fuera los importa (simplificación 7).
7. **`characterMaxHp` no recalcula los atributos efectivos** cuando
   `combatProfile` ya los tiene (eficiencia 5): variante interna que reciba los
   efectivos, con la fórmula escrita una sola vez.
8. **El espectador no manda el catálogo por cable** (eficiencia 1: +2 097 B por
   batalla 5×5, +72 % del estado de batalla, ~90 KB por partida). En
   `vista-espectador.ts` los stacks viajan **sin `unit` cuando `body` es una
   criatura del catálogo**, y **con `unit`** cuando es `CHARACTER_BODY`;
   `espectador/adaptar.ts` —la inversa exacta— lo rehace con `creature(body)`.
   Su test de ida y vuelta tiene que cubrir los dos casos. Si el ancla de paneles
   cambia un byte, es un bug, no se re-ancla.
9. **Tests más limpios** (reutilización 3 y 4, simplificación 9): el `duelo` de
   `personaje.test.ts` sin la función `lado` con dos `as` (los llamantes pasan
   `BattleSide`); `emptyArmy()` + asignar slot en vez de arrays de 5 a mano
   (ojo: `addToArmy` fundiría dos personajes, no usarlo para ellos); una sola
   comprobación de «acabó sin tope» y una sola de determinismo (la del
   personaje cubre la de criaturas). Usar `autoResolve` en el duelo **solo si**
   sigue siendo visible que la IA decide los dos lados y que no cerró por tope.

## Se aplazan a la fase 3, a conciencia (van a la issue de GitHub)

- **`Stack` como unión discriminada `{creature, count} | {member}`** (altitud 1
  y 7, simplificación 8). Es la raíz: hoy «es un personaje» son dos campos que
  el tipo no ata, `addToArmy` y `takeGarrison` ya pierden `member`, y el guardia
  regex solo cubre `BattleStack`. Pero hacerlo obliga a portar **todos** los
  lectores de `Army` (`slowestSpeed`, `armyPower`, `armyView`, reclutamiento,
  IA estratégica, paneles, `ws-server`), que es exactamente el trabajo que la
  fase 3 tiene que hacer para que una compañía se mueva. Hacerlo aquí duplica
  el alcance de esta fase.
- **Resolver al nivel del `Army`** con `stackUnit(stack, characters)` en vez de
  `BattleSide.members` (altitud 2) y la **vuelta simétrica** `returnStack`
  (altitud 6): van con la unión, en la misma issue.
- **Un único escritor de los PV del personaje** o guardar heridas en vez de PV
  (altitud 5): la fase 3 trae descanso, curación y subida de nivel, que son los
  escritores nuevos. Se diseña allí.

## Se descartan, con motivo

- **Quitar los guardias `hp <= 0` / `hp > max` de `resolveUnit`**
  (simplificación 5): `createBattle` es entrada pública y la comprobación es
  barata; lanza en la puerta en vez de pintar una barra de vida imposible.
- **Alias `const info = s.unit`** (simplificación 10): cosmético, y reescribirlos
  solo ensucia el diff de una sustitución que se quiere mecánica.
- **La sonda `{ ...s, hex: h }` de `legalActionsAndCosts`** (eficiencia 2):
  anterior al diff; no se ve en el banco.
- **Constructor único de `BattleStack` para los fixtures** (altitud 8): menor;
  si la unión de la fase 3 cambia `BattleStack`, se hace entonces.
- **Test «el catálogo no conoce al cuerpo de un personaje»**: se queda; es barato
  y documenta por qué el centinela lanza.
