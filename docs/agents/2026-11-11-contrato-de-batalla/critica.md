**REENCUADRADA**: los dos problemas son reales y van juntos, pero en orden. #334 decide qué cuesta un `battle_turn` sin forma, y de eso depende cómo se hace #338. La solución que propone #338 («retirar `wait`/`defend` del esquema») choca con la decisión del 26-10, que pide rechazarlas diciendo qué mandar.

# Crítica: contrato-de-batalla (#334, #338)

## El problema real
Hay una respuesta de batalla mal formada que le quita al agente la batalla entera, y la nota le dice que solo pierde ese turno (#334). Además, el tipo de la jugada de batalla está copiado a mano junto a su zod, con un `as` que los ata a ciegas (#338). #334 ataca el primero. #338 ataca el segundo, pero propone un medio (retirar del esquema) que no es necesario y que rompe algo.

## La premisa, afirmación por afirmación
- **El `.catch` de `ask('battle_turn')` devuelve `null`, se sale del bucle y `resolvePendingBattle` termina la batalla.** Cierto:
  - el `.catch` está en `director.ts:579-582` y el `break`, en `:583`;
  - después vienen `director.ts:645-646`.
  - Ningún test lo fija: `agent-link.test.ts` no tiene ningún caso con un `battle_turn` inválido, así que no hay nada que invertir.
- **La nota dice «Ese turno lo juega la IA».** Cierto: `EN_SU_LUGAR.battle_turn` (`notas.ts:436`). La usan dos notas: `notaRespuestaInvalida` (`notas.ts:448-452`, la manda `agent-link.ts:272-276`) y `notaSinRespuesta` (`notas.ts:464-469`, en el plazo agotado de `agent-link.ts:264`). **El issue solo nombra la primera, pero las dos mienten.** El `.catch` recoge también el plazo agotado y el canal caído. Solo el log del director dice la verdad: «la termina la IA» (`director.ts:580`).
- **No lo dice el issue: un `wait` o un `defend` hoy se llevan la batalla entera.** `retirada()` es un `refine(() => false)` (`esquemas.ts:106-112`), así que el zod lo rechaza y se cae por el mismo `.catch`. El comentario de `esquemas.ts:131-133` («La batalla sigue: se descarta esa jugada, como cualquier otra mala») es falso hoy, y es otra cara de #334.
- **La regla «Forma y valor» deja fuera la batalla porque «no hay "siguiente" que salvar».** Así está escrito en `docs/areas/agente.md:51-55`, y la premisa es falsa: lo siguiente es el próximo `battle_turn` de la misma batalla. El repo ya trata así a su vecino: un `battle_response` que no vale cuesta solo ese golpe (`BATALLA_SIGUE`, `notas.ts:407-409`; `agente.md:164-165`, «un fallo ahí no le quita la batalla»). Además, `hit` se dejó como texto en el zod justo para no perder la batalla (`esquemas.ts:116-118`). Es decir, el repo ya sabía que la forma rota se lleva la batalla, y lo esquivó campo a campo en lugar de arreglarlo.
- **#338: el cast de `director.ts` «hacia la línea 594».** Está en `director.ts:593`: `respuesta.data.action as AccionDeBatallaDelAgente`. Es el único `as` de ese tipo en `src/` y `test/`.
- **#338: «su zod aún lleva `wait`/`defend`».** Cierto (`esquemas.ts:134-135`). Pero están ahí **a propósito**:
  - el test `agent-contract.test.ts:1106-1127` («se rechazan diciendo que se retiraron y que se mande "end_turn" (26-10-2026)») fija el mensaje del zod;
  - el propio test lo justifica: «sin un "discriminador inválido" mudo».
  
  Si se quitan del esquema sin llevar ese mensaje a otro sitio, ese test se rompe y se deshace una decisión del usuario.
- **#338: «su tipo es también la salida de `accionAlAgente`».** Cierto (`vocabulario.ts:472`; la lee `contract/batalla.ts:198`). El test `agent-contract.test.ts:2111-2119` comprueba la ida y vuelta: la lista legal pasa el zod y vuelve igual al núcleo.
- **No lo dice el issue, y agranda el alcance de #338.** Derivar el tipo no se queda en «quitar dos opciones». `exactOptionalPropertyTypes` (`tsconfig.json:15`) hace que el `?: X | undefined` de zod no case con el núcleo:
  - las ramas `return a` de `accionDeBatallaDelAgente` (`vocabulario.ts:477-483`: `cast`, `move`…) y el `...resto` de `attack`/`power` dejan de compilar contra `BattleAction` (`battle/types.ts:744`, `target?: string`);
  - es el mismo problema que `equip`/`unequip` en la aventura (`agente.md:56-57`).
  
  Además, `z.infer` incluiría `{ type: 'wait' }` y `{ type: 'defend' }` (el `refine` no estrecha el tipo).

## El día después
- **Para quien juega**: nada. **Para el agente**, con #334 hecho de verdad, un JSON mal formado o un `wait` olvidado le cuestan una jugada y no la batalla, y la nota dice lo que ha pasado.
- **Lo que cierra la opción «la IA juega solo ese turno»**: el plazo agotado. Hoy un agente colgado (con el socket abierto) pierde 300 s una sola vez (`agent-link.ts:73`) y la batalla se resuelve. Si el plazo agotado también «devuelve la batalla al agente», cada turno suyo esperaría 300 s (`MAX_JUGADAS`, `battle.ts:226`). No hay que mezclar «sin forma» con «sin respuesta»: hay que decidirlos por separado. `battle_response` ya acepta esa espera golpe a golpe, pero son menos peticiones (unas 4,3 por batalla frente a 18,4 turnos, `agente.md:167`).
- **Lo que cierra la opción «la nota dice que la termina la IA»**: nada. Pero deja la asimetría con `battle_response` y con el diseño de `hit`, y la regla «Forma y valor» seguiría excluyendo la batalla con un motivo falso.
- **Lo que nadie borrará**: el comentario falso de `esquemas.ts:131-133` y el párrafo de `agente.md:51-55`, si la tarea solo toca código.
- **`CLAUDE.md`, «El agente»**: dice «en la aventura, el zod juzga la forma…». Si la batalla entra en la regla, esa línea cambia. No contradice ninguna decisión tomada.

## Conflictos
- **#334 y #338 entre sí: es una dependencia oculta.** Los dos tocan `battleActionSchema`, el mismo bloque de `director.ts:572-594` y el destino de `wait`/`defend`:
  - si #334 hace que un `battle_turn` sin forma cueste solo ese turno, `wait`/`defend` pueden quedarse en el zod con su mensaje, y #338 solo tiene que excluirlas del tipo;
  - si #334 se queda en cambiar la nota, quitarlas del zod sigue costando la batalla, y además sin explicación.
  
  Hacer #338 antes paga dos veces. **Juntas, y #334 decide primero.**
- **#340** (motivos del plan y de `recruitBlocker`; «de paso», el `max(32)` de `unequip.slot`): toca `esquemas.ts`, pero en el esquema de aventura (`:29-103`), lejos de `battleActionSchema` (`:114`). Si los dos editan `agente.md`, el choque solo es de texto al fusionar.
- **#336, #341, #335, #303**: ningún fichero en común. #303 va por `espectador/adaptar.ts` y la vista del mapa, no por las jugadas de batalla. #341 es la batalla del cliente.
- **#311** (elegir la defensa y lo que sobra): añadirá peticiones al borde de la batalla y heredará lo que decida #334. Conviene hacer esta antes.
- **Trabajo reciente**: `150fd189` (#313/#317) dejó escrito que esto quedaba en el backlog (`agente.md:53-55`; plan, §6). Esta tarea lo remata y no deshace nada.

## Coste contra valor
- **#334 con «la IA juega ese turno»**: coste bajo. Es un `continue` en vez de un `break`, con la sustituta que ya existe (`director.ts:617`, `chooseBattleAction(battle, bandos)`, que no se rinde), las dos notas y un test de circuito. El valor es P2: el agente puede perder una batalla entera por una errata.
- **#334 con «solo la nota»**: coste casi nulo y valor menor. Es honesto, pero deja el agujero.
- **#338**: coste medio-bajo, con el trabajo de `exactOptionalPropertyTypes` campo a campo. El valor es el de #313: el próximo desajuste entre el zod y el tipo deja de compilar.
- **Si no se hiciera nunca**: el agente seguiría perdiendo batallas enteras por un `wait` que le enseñaron en otra sesión, con una nota que le dice lo contrario.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Criterios (tras la crítica)**
> 1. (#334) Un `battle_turn` cuya respuesta **no pasa el zod** cuesta **solo ese turno**: la IA juega esa unidad (sin rendirse, como la sustituta de hoy) y el siguiente turno de un bando del agente se le vuelve a pedir. Lo mismo para `wait`/`defend`. Test de circuito en `agent-link.test.ts`: una respuesta sin forma seguida de una buena, y la buena se aplica en la misma batalla.
> 2. (#334) El **plazo agotado y el canal caído** se deciden aparte y se dice cuál se ha elegido: o siguen terminando la batalla con la IA, o cuestan solo el turno. En los dos casos, la nota que recibe el agente (`notaRespuestaInvalida`, `notaSinRespuesta`) y el log del director dicen exactamente lo que ha pasado. `EN_SU_LUGAR.battle_turn` no puede decir «ese turno» si no es verdad.
> 3. (#334) La regla «Forma y valor» (`docs/areas/agente.md`) se reescribe para la batalla. Se quita el «no hay "siguiente" que salvar» y se dice qué es forma y qué es valor en `battleActionSchema` (`surrender.gold`, hexes). Si cambia el alcance, también la línea «El agente» de `CLAUDE.md`. Y se corrige el comentario de `esquemas.ts:131-133`.
> 4. (#338) `AccionDeBatallaDelAgente` sale del zod (`z.infer`, como `AccionDelAgente`), **sin** las retiradas, y desaparece el `as` de `director.ts:593`. `accionDeBatallaDelAgente` y `accionAlAgente` siguen sin `default`. **`wait`/`defend` siguen rechazándose con su mensaje de hoy**: `agent-contract.test.ts:1106-1127` en verde, aunque cambie dónde vive el mensaje. Quitarlas del zod sin ese mensaje no vale.
> 5. La ida y vuelta de `agent-contract.test.ts:2111-2119` sigue en verde. `pnpm qa` una vez al cerrar.
