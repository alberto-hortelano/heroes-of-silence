# QA: accion-del-agente-del-zod (#313, #317, la mitad `1e21` de #318)

Código validado: worktree `agent-a5409f6c9efc84a19`, commit `88286672`. No se tocó nada de su código.
Para las pruebas escribí un fichero propio, `qa/adversarial.test.ts`, que importa del worktree por
ruta absoluta y corre con una config de vitest en el scratchpad (`root` = `qa/`, alias `@core`).
Pasa por el circuito real: `AgentLink` por WebSocket, el zod, `Director`, `accionDelAgente`, el
núcleo y el veredicto que vuelve por el cable. Resultado: **8 de 8 en verde, 2,8 s**.

No repetí lo que el ingeniero ya dejó en verde sobre el mismo commit (`implementacion.md`):
typecheck, lint, sus nueve ficheros de test (373 tests), `exportaciones.ts`, `pnpm qa` y `pnpm banco`
(el ancla no cambia). No hay nada que ver en el navegador: el cambio no se ve, solo lo lee el agente.

## Criterios (los de «Tras la crítica» y «Tras el plan»)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `AccionDelAgente` y `LineaDelAgente` salen del zod (`z.infer`); fuera los tres casts; ningún ciclo de importación en ejecución | ✅ | `vocabulario.ts`: `export type AccionDelAgente = z.infer<typeof adventureActionSchema>` y `LineaDelAgente` sale de `Extract<…>`. `grep -rn "as AccionDelAgente" src test` no encuentra nada (sale 1). El import entre los dos módulos es `import type`. El ingeniero vio morder el guardia de ciclos (punto 2 de su lista). |
| 2 | `accionDelAgente` sin `default` y con un caso para cada jugada que pasa tal cual | ✅ | El diff tiene siete `case` que hacen `return a` y ningún `default`. El ingeniero añadió una jugada sin caso y vio TS2366 (su punto 1). |
| 3 | Regla escrita, con fecha, en `agente.md`: la forma se lleva la respuesta y el valor solo su jugada; aplicada a `recruit`, `dismiss`, `leave_troops`, `take_troops` y `distribute_troops`; dice expresamente que la batalla queda fuera | ✅ | La viñeta «Forma y valor» (11-11-2026) cuadra con el código. Lo comprobé en el circuito (las dos filas siguientes) y en las afirmaciones al margen: el clima se juzga por entradas (`climaBlocker`, `rechazosDelClima` en el director), las voces cuentan sus rechazos y `pointSchema` es entero. |
| 3-a | Un valor malo descarta solo su jugada, con un motivo que dice qué falló | ✅ | Una sola respuesta de **26 jugadas**: 25 con un valor malo y un `build` bueno al final. Veredicto `ok: true`, nota «1 de 26 acciones aplicadas, 25 descartadas», y el edificio aparece en el turno siguiente. Los `count` malos fueron 0, −0, −3, 1,5, 2,5, 0,5, 1e21, `1e999` (Infinity) y `-1e999`, repartidos entre `recruit`, `dismiss`, `leave_troops`, `take_troops` y las líneas de `distribute_troops`. Todos dicen «son individuos: se … de 1 en adelante, no N» o «el "count" de "X" es N: va un entero de 1 en adelante». También fallaron solas las demás jugadas con un valor malo: los ids falsos de pueblo, héroe, pieza, edificio y veterano, los huecos `foo` y `bar` (el motivo enumera los seis que valen), la obra `wall2` («valen palisade, wall») y la casilla (−5, 9999) («no hay camino»). |
| 3-b | La forma mala sigue llevándose la respuesta | ✅ | Probé seis respuestas con un `build` bueno delante y una jugada mal formada detrás: `count: "2"`, `count: null`, sin `count`, una línea de `withHero` con `count: "1"`, la casilla `x: 1.5` y un `type` que no existe. Las seis dan `ok: false` y «no se ha aplicado nada. Ese turno lo juega la IA de reglas», y `problems` señala el campo exacto (p. ej. `actions.1.count: Expected number, received null`). |
| 3c | El núcleo rechaza todo `count` que no sea un entero seguro ≥ 1 (`recruitBlocker` con 1,5) y `lineaBlocker` usa `Number.isSafeInteger` | ✅ | `recruit 2.5×` y `recruit 1e+21×` se rechazan con su motivo, y `distribute_troops` con 1e21 cae en `lineaBlocker`. Los cuatro sitios usan `enteroDesde(c, 1)`. NaN no viaja en JSON; Infinity, sí (`1e999`), y se rechaza. |
| — | `veteran` en `equip`/`unequip` no se pierde al construir la jugada campo a campo | ✅ | `accionDelAgente(equip{veteran:'v1', creature:'c', slot:'shield'})` da `{…, veteran:'v1', creature:'c', hueco:'escudo'}` y `unequip{slot:'mount', veteran:'v2'}` da `{…, slot:'montura', veteran:'v2'}`. Sin `veteran`, la clave no aparece. En el circuito, `unequip armor` con `veteran: 'v-nadie'` llega al núcleo y responde que el héroe «no lleva a nadie con el id "v-nadie"»: el veterano viajó. |
| 4 | Tests invertidos, uno por jugada afectada y `pnpm qa` en verde | ✅ (cito, no repito) | `implementacion.md`: `agent-contract` (con un guardia genérico sobre el `shape`), `guarniciones`, el de circuito en `agent-link`, `pnpm qa` exit 0 y cinco guardias vistos morder. |

## Hallazgos

Ninguno bloqueante ni importante. Dos menores, los dos **anteriores a este cambio y fuera de su alcance**:

1. **Menor, anterior.** El motivo de reclutar una criatura que no existe engaña. Con
   `{ type: 'recruit', town: 'town-1', creature: 'no-existe', count: 1 }`, el agente lee «no se puede
   reclutar: solo hay 0 disponibles» y no «esa criatura no existe». Viene de `recruitBlocker`
   (`town.available[creatureId] ?? 0`), que tiene esa línea igual en `main`. Encaja con #318 (los
   motivos) o con un issue nuevo.
2. **Menor, anterior.** El tope de tamaño del hueco no es uniforme. `equip.slot` lleva `max(32)` y
   `unequip.slot` no lleva ninguno. La regla habla de «topes de tamaño» como forma, pero no dice
   cuáles. No cambia ningún resultado (un hueco largo se rechaza igual en su jugada); solo hace que
   un texto de 33 letras sea forma en una jugada y valor en la otra.

## Atajos usados en las pruebas

- `preparar` del `Director` pone al héroe en un paso suyo con guarnición, un veterano `v-qa` y oro.
  Es el mismo atajo que usa el test de circuito del ingeniero. Sirve para que el motivo sea el del
  valor y no el del sitio; quien juega llega a ese estado por su cuenta. No afecta al usuario.
- Para mandar Infinity, el agente falso sustituye un marcador por `1e999` en el texto JSON, porque
  `JSON.stringify(Infinity)` daría `null`. Un agente de verdad puede escribir `1e999`, y `JSON.parse`
  lo lee como Infinity.

## No probado

- La batalla (`surrender.gold`, los hexes): la regla la deja fuera a propósito.
- Lo que ya corrió el ingeniero (ver arriba): no lo repetí.

## Veredicto

**Apto.**
