# QA — El camino cuesta (asaltantes de caminos, 28×28, despedir)

Validado contra `requisitos.md` (criterios 1-9 y las decisiones del usuario del
02-10: plan B, 28×28 elegido midiendo, criterio 5 reinterpretado, asaltantes
también en la región de casa) y contra la decisión de `hallazgos-simplify.md`
(despedir en la base; la IA espera y se refuerza). Diff sin commitear de `main`
(`96a1de5`). No he tocado código. Lo que arranqué (vite en 3100 y `pnpm partida`
en 9880/9881) lo maté por su grupo y comprobé los puertos libres.

Fuera de juicio, como se pidió: que la IA no ataque nunca a los asaltantes
(#115), el equilibrio, la 2b y la experiencia de la tropa.

## Comprobaciones automáticas (salida real)

| Orden | Resultado |
|---|---|
| `pnpm verify` | `Tests 669 passed (669)`, `real 0m10,312s` |
| `pnpm banco` | `sha256 c1da16a04f81…bad4af`, `ancla: igual`, 0/200 sin terminar, 8/15/35 días, 3 524 ms |
| `barrido-semillas.ts` | `sin terminar: 0/40`, 7/13/21 días |
| `barrido-semillas.ts 1000` | `sin terminar: 0/1000`, 8/15/35 días, 16,5 s |
| `pnpm qa` | sale 0 en 3,1 s; `asaltantes: 2 grupos vistos en el knownMap, 2 emboscadas en la crónica`; `licencias: 1` |
| `pnpm capturas <scratchpad>` | sale 0 en 80,1 s, `sin errores en consola`; patrulla vista moverse con y sin arte |

## Criterios

| Criterio | Veredicto | Evidencia |
|---|---|---|
| 1. Patrullan su región sin cruzar nodos | ✅ | Comprobador propio, turno a turno en 300 partidas (28×28) y 100 (40×40): 0 grupos fuera de su región, junto a un nodo, sobre un objeto o sobre un héroe. |
| 1. Emboscan si se creen capaces; el héroe defiende y su bando lo juega su dueño | ✅ | Navegador, `?seed=1`, día 1: un clic en (2,10) abre la batalla con la persona a la derecha (defensor), 6 piqueros veteranos enfrente, «Rendirse (190 oro)» ofrecido y **no** tomado. «Resolver sola» pierde sin rendirse («Un héroe tuyo ha caído»). Agente por MCP: `battle_turn` con `yourSide: "defender"`, rendirse aceptado («Has pagado 150 de oro»). |
| 1. Si no se cree capaz, lo evita | ✅ | Seed 1 día 2-3: el grupo de 1 piquero se aparta un paso del héroe; atacarlo después da batalla con la persona de atacante y el grupo desaparece (exp 0→20). |
| 1. Reproducible por `createRng` | ✅ | Banco con el ancla igual; test «misma semilla, misma partida». |
| 2. Se dispersan al tener dueño su región | ✅ | 215 `raider_dispersed` en 300 partidas, y 0 grupos en región con dueño tras cada turno. |
| 2. Brote semanal: nunca sobre héroe, nodo u objeto, ni en región con héroe | ✅ | 47 brotes en 300 partidas y 28 en 100 de 40×40: 0 violaciones, con las posiciones de los héroes en el cambio de día. |
| 2. Datos declarados inventados | ✅ | `data/asaltantes.json`: «PROVISIONAL e INVENTADO»; `fuerzaMax` 800 en datos con su test. |
| 3. El generador los pone; el plan del agente los acepta y valida | ⚠️ con reserva | 200 semillas: 10 grupos de media, ninguno pegado a un nodo. Por MCP, un plan con un grupo en la región de un inicio se rechaza con la frase y el servidor juega el procedimental. Pero ver H3: `troops: []` entra. |
| 4. Tamaño elegido midiendo; el banco juega el elegido | ✅ | Tabla 24-36 en `implementacion.md` y en `CLAUDE.md`. `LADO_DEL_MAPA = 28`, que leen el generador y el servidor (`want.width: 28` en el `map_generate` real). |
| 5. Reinterpretado: tropa al llegar y asaltos por día | ✅ | Publicado: individuos 5 → 4, fuerza 355 → 526, asaltos/día 0,221 → 0,120. |
| 6. La IA no se suicida y las partidas terminan | ✅ | 0/40 y 0/1000. Emboscadas entre IAs: 0 en 300 partidas (comprobador propio). |
| 7. El agente los ve con niebla, en el turno, en `map` y en la crónica | ✅ con reserva | `knownMap.raiders` con `troops` y `strength`; `raider_spawned` en `recentEvents`; la emboscada (`battle_started` con `attacker.kind: "raider"`) y `dismissed` en la crónica. Reserva en H1: el grupo puede llegar sobre una casilla con `terrain: null`. |
| 8. El cliente los pinta y anima | ✅ con reserva | `desktop-15-asaltante-llegado.png` y `sin-arte-02-…`: figura con aro morado discontinuo y chapa; la marcha cambia el lienzo (3 879 / 6 440 px). Hover sobre el grupo: «1 asaltantes: emboscan a quien pise su región si le sacan ventaja». Reservas en H1, H2 y H5. |
| 9. Banco re-anclado, forma mirada, todo verde | ✅ | `c1da16a0…` con su forma en `implementacion.md`. El ciclo re-ancló dos veces (`d68a0aa6` → `c1da16a0`), pero la segunda la autorizaba `hallazgos-simplify.md`. |
| Decisión: «también en casa» | ✅ | Día 1, 200 semillas: 412 grupos en regiones que tocan una base (329 pueden emboscar al héroe inicial) y 0 en la región donde está el héroe. |
| Decisión: despedir en la base | ✅ | Navegador, seed 1 día 4: «−1» hasta vaciar la tropa (liderazgo 0/20), «Todo (6)» recluta el mismo día (12/20). El héroe no tiene «−1». Núcleo y MCP: fuera del castillo, de más, 0, NaN, héroe rival y criatura que no lleva se rechazan con frase. |
| Decisión: la IA espera y se refuerza | ✅ | 0 emboscadas en 1 000 partidas, 0/1000 sin terminar; el agente de `politica.ts` licencia. |

## Hallazgos

### H1 — importante: la persona cae en emboscadas de grupos que su castillo «ve» pero el lienzo no pinta

Pasos:
1. `pnpm dev` y abrir `http://localhost:3100/?seed=1`.
2. El día 1 no se ve ningún grupo junto a Valdeluz: solo un monstruo de guardia (6) bajo el castillo.
3. Un clic en la casilla (2,10), al lado del monstruo.

Qué pasa: batalla inmediata contra 6 piqueros veteranos que nunca se pintaron. Se pierde.

Qué esperaba quien juega: ver el grupo antes de pisar su región, o que el agente y la persona vean lo mismo.

Causa: `visibleNow` cuenta el radio 5 del castillo, pero ese radio no se escribe en `player.fog`. El cliente pinta sobre `fog` y el agente lee `visibleNow`. En la semilla 1, `serializeKnownMap` le da al agente `raider-6` en (4,12), una casilla cuyo `terrain` es `null`: el grupo está sobre «lo que no has explorado».

Medido (día 1, 200 semillas, jugador 0): hay 181 grupos que emboscarían al héroe inicial en regiones que tocan su base. El cliente pinta 84; el agente ve 146. En **96 de 200 semillas** la persona tiene al lado de casa un grupo que la embosca y que no está dibujado.

La asimetría de niebla es anterior a este ciclo (#64). Lo que cambia es la consecuencia: antes era un dato de más para el agente, y ahora es una emboscada a ciegas en la región de casa. El propio `pnpm capturas` tuvo que pulsar «Ver mapa entero» en sus dos pasadas para encontrar un grupo (ver Workarounds).

### H2 — menor: la ruta no avisa de que entra en una región que embosca

En la semilla 1, al pasar el ratón por una casilla de la región del grupo, la barra dice «llegas hoy (3 pasos)». Un clic y hay batalla. La explicación solo sale con el ratón encima del propio grupo, y no sale nunca si el grupo no está dibujado (H1). El agente sí recibe la regla escrita: el margen ×1,6 y `strength` en los dos lados.

### H3 — menor: un plan del agente con `troops: []` se acepta

Pasos: un plan de `generateMapPlan(createRng(3))` con `raiders: [{ at: <casilla válida>, troops: [] }]`.

Qué pasa: lo aceptan el esquema zod y `validateMapPlan`, y la partida arranca con `{ id: 'raider-0', troops: [] }`. Ese grupo ocupa casilla, es hostil y no embosca. Atacarlo da una batalla de 0 rondas, ganada al instante.

Qué esperaba: el rechazo con frase que promete la prosa de `map_generate` («entre todos sus grupos, de 1 a maxIndividuals individuos»). Es la misma especie que #97 y #27: texto del agente que entra sin validar.

### H4 — menor: la frase de rechazo de despedir mezcla id y nombre

- «no se puede licenciar: Aldo de Valdeluz no lleva ningún individuo de "peasant"» sale en la barra del castillo.
- Por MCP sale con «"zombie"».
- En cambio el caso «de más» sí dice «Campesino».

Para la persona es una palabra en inglés. En el navegador salió al pulsar «−1» varias veces seguidas.

### H5 — menor (arte): los asaltantes de cuerpo humano se confunden con los monstruos

Con arte, un grupo de piqueros o espadachines se pinta con la figura gris de su criatura, igual que un monstruo neutral. Solo los separa el aro morado discontinuo, que se pierde a zoom medio (`desktop-15-asaltante-llegado.png`: el grupo de (712,188) frente a los monstruos de alrededor). Las momias sí se leen moradas. Sin arte, morado frente a rojo se distingue bien.

## Workarounds usados

- **`pnpm capturas` pulsa «Ver mapa entero»** en desktop-15 y en sin-arte-02 («ningún asaltante en lo explorado de la pantalla; se descubre el mapa»). No es inocuo: es el síntoma de H1. Quien juega no tiene ese botón como recurso normal, y en la mitad de las semillas no ve los grupos de su entorno el día 1.
- **En mis scripts de núcleo** coloqué al héroe a mano en la base para probar `dismiss` y en la casilla de al lado de un grupo para probar `troops: []`. No afecta a quien juega: despedir lo verifiqué además en el flujo real del navegador y por MCP, y lo de `troops: []` es un hueco de validación, no de flujo.
- **El plan del agente** lo hice con `generateMapPlan` más un grupo mal puesto, para llegar a la validación de asaltantes. Un agente real puede mandar exactamente eso.

## No probado

- **Emboscada a la persona en móvil o táctil**: la vi solo en escritorio con ratón.
- **El personaje no se licencia**: el héroe de la persona y el de la IA no llevan miembro personaje en estas semillas, así que solo lo respalda el test unitario de `tropa.test.ts`.
- **Héroe atrapado** en una región que se le vuelve peligrosa y sin nodo al lado: el propio informe dice que no salió en 1 000 partidas, y yo no lo busqué.
- **Brote del lunes visto en el cliente**: lo comprobé en el núcleo (75 brotes en total), no en pantalla.
- **La partida por MCP** la jugué solo dos días: plan rechazado, licencias, emboscada y rendición. No la llevé al final.
- **El espectador a mano**: lo cubre `pnpm capturas` (espectador-01..04, fin enseñado a los 15,1 s con plazo de 21 s).

## Veredicto

**Apto con reservas.** Los nueve criterios y las decisiones del usuario se cumplen con evidencia: verify, banco anclado, barrido 0/40 y 0/1000, qa y capturas en verde, y los invariantes de patrulla, dispersión y brote sin una sola violación en 400 partidas. La reserva que pesa es H1: en la mitad de las semillas, la persona sufre emboscadas el día 1 de grupos que no se le pintan y que el agente sí ve. H2-H5 son menores.
