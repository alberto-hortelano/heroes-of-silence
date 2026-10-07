**VIGENTE** las seis, con dos precisiones de alcance (#158a se queda corta en casos; #121 no debe abrir una tercera copia del recorte) y #122 sin reintento.

| Issue | Veredicto |
|---|---|
| #158 (a) invisibles en un nombre | VIGENTE, con más casos que los que cita |
| #158 (b) `\p{Cn}` según el Node | VIGENTE, pequeña; la dependencia ya se nota hoy entre CI y local |
| #158 (c) la barra tras el final | VIGENTE |
| #158 (d) «Continuar» durante la animación | VIGENTE |
| #121 marcha parcial «descartada» | VIGENTE, solo la ve el agente |
| #122 «para que lo corrijas» | VIGENTE en su rama de prosa; el reintento, no |

## El problema real, en una frase cada uno
- (a)/(b): el agente puede escribir un nombre que no es lo que se ve, y a la vez se le rechaza un nombre legítimo según la versión de Node que tenga el servidor.
- (c)/(d): el cliente pierde el desenlace o el clic de quien juega en los dos momentos en que cierra algo.
- #121: el veredicto le dice al agente lo contrario de lo que ha pasado en el mapa.
- #122: la prosa del contrato promete una segunda oportunidad que no existe.

## La premisa, comprobada
**(a)** Confirmada con `safeParse` sobre `heroFromTroopResponseSchema` (las mismas reglas que `lineaLegible`, `src/core/contract/agent.ts:165-189`). Hoy **aceptan** `Ana​Bo`, `Ana` + etiquetas U+E0068/E0069 + `Bo`, y además tres casos que la issue no cita: `Ana‍Bo` (ZWJ entre letras), `Ana⁠Bo` (WORD JOINER) y `Ana­Bo` (guion blando). Escocia y 👨‍👩‍👧 también pasan, y lo vigila `test/agent-contract.test.ts:317-330`. La issue habla de U+200B y de las etiquetas, pero el hueco es «cualquier ignorable o `Cf` entre letras», y la regla tiene que cubrir esos tres casos.
**(b)** Confirmada en `agent.ts:158-159` y `:187`. Y no es teórica: el Node local es v26.10.0 con `process.versions.unicode` = 17.0, mientras que CI usa `node-version: 24` (`.github/workflows/ci.yml:44,79`), que trae una tabla más antigua. Un test con un emoji de Unicode 17 pasa aquí y falla en CI. El coste para el agente es alto: un solo nombre rechazado tira el plan de mapa entero al procedimental. Tampoco se puede pedir «no depende» en absoluto, porque `\p{M}` y `\p{Default_Ignorable_Code_Point}` también salen de esa tabla. El criterio 1 ya admite que la dependencia quede «acotada y dicha», y está bien así.
**(c)** Confirmada leyendo el código. `session.ts:568-570` y `:623-627` escriben el desenlace en `status`. Después, `EscenaAventura.señalar` (`src/client/escenas/aventura.ts:199-209`) escribe `s.status = describirCasilla(...)` sin mirar `state.finished`. No hace falta navegador para darla por buena.
**(d)** Confirmada leyendo el código. El botón «Continuar» aparece en cuanto `battle.finished !== null` (`views/panels.ts:153-154`), con la animación todavía en cola. El clic entra por `main.ts:341` (`jugadaEnCurso()`), que llama a `rechazarSiOcupada` (`escenas/batalla.ts:120-127`), y esta escribe `AVISO_DE_ESPERA` y se traga el gesto.
**#121** Confirmada. `moveHero` (`src/core/state/game.ts:1857-1862`) anda casilla a casilla, con `hero_moved`, niebla y recogida, y **luego** lanza «no quedan puntos de movimiento para llegar». El director lo cuenta como problema (`src/server/director.ts:347-357`) y `notaTurnoAventura` lo suma a «descartadas» (`src/server/notas.ts:206`). Además, como lanza, `applyAdventureAction` se salta `syncSpellbooks` (`game.ts:1111-1120`): la acción queda aplicada a medias **y** lanza, que es justo lo que el contrato fail-loud no quiere.
Hay una matización: **solo la ve el agente**. El cliente recorta antes al tramo alcanzable (`src/client/session.ts:535-541`) y la IA también (`src/core/ai/turn.ts:172-173`, `stepTowards`). Por eso el arreglo no debería mover `pnpm banco`, y si lo mueve es señal de que se ha tocado algo de más.
**#122** Confirmada: `agent.ts:623` dice «para que lo corrijas». Lo contradicen `src/server/mapa-del-agente.ts:14-17`, `notas.ts:455-466` («No se te va a volver a pedir») y CLAUDE.md («no hay reintento»). Es la única frase del contrato que lo promete (`grep corrij|reintent`).

## El día después
- (a)/(b): quien juega deja de ver un héroe «AnaBo» que en realidad son dos nombres distintos, y un plan de mapa con un emoji reciente deja de caerse. Se vuelve más difícil aceptar texto raro legítimo (el guion blando en nombres largos, por ejemplo), y eso hay que aceptarlo por escrito en el comentario de la regla.
- (c)/(d): la persona ve el desenlace hasta que pulsa «Partida nueva», y «Continuar» funciona al primer clic.
- #121: el agente distingue «anduvo y le faltan N pasos» de «no se movió», que hoy le resultan indistinguibles. Tal y como está, le lleva a repetir el mismo `move_hero` creyendo que falló.
- #122: cambia una frase y nada más.

## Conflictos
- **#130 (emboscada, en `heroes-emboscada`)** probablemente toque la vista previa de la ruta en `escenas/aventura.ts` (`describirCasilla`, `:254+`). (c) toca `señalar` en ese mismo fichero. No se contradicen, pero chocarán al fusionar: fusionad primero la que acabe antes y rebasad la otra.
- **#130 y `moveHero`**: si #130 cambia la emboscada dentro del bucle de `moveHero` (`game.ts:1890-1901`) y #121 cambia el final de ese bucle, son las mismas veinte líneas. Hay que avisar al coordinador.
- **#118** (el veredicto retenido por el puente MCP) toca el canal de veredictos, no la nota. No hay solapamiento.
- **CLAUDE.md, «Un hecho, un sitio»**: el recorte «hasta donde alcanza hoy» ya está escrito dos veces (cliente y `stepTowards`). #121 **no debe** añadir una tercera copia en el servidor. Dónde vive es cosa del arquitecto, pero que no sean tres sí entra en esta crítica.

## Coste contra valor
- (a) y (b): unas pocas regex y casos de test. Valor real, porque es la puerta de todo texto del agente para una persona. Si no se hacen, el riesgo de (b) sigue latente en CI.
- (c) y (d): unas pocas líneas cada una y mucho valor, porque (d) pasa al final de **cada** batalla con prisa. No hacerlas es dejar un fallo visible.
- #121: barato y con valor alto para el agente. Si no se hace, el agente seguirá leyendo «descartada» en cada marcha de varios días, que es lo normal en un mapa de 34.
- #122: una línea. Un reintento acotado pediría una petición nueva antes del primer turno y deshacer una decisión escrita en tres sitios, para un fallo que hoy se recupera solo con el procedimental. No lo justifica.

## Qué le cambiaría a `requisitos.md`

En **Criterios de aceptación**, sustituir el 1, el 4 y el 5 por:

> 1. **#158 (a)/(b):** una regla escrita y probada.
>    - Rechaza los invisibles entre caracteres visibles de un nombre o una historia: U+200B, U+2060, U+00AD, el ZWJ entre letras (`Ana‍Bo`) y las etiquetas U+E0020–E007F fuera de una bandera.
>    - Acepta 🏴󠁧󠁢󠁳󠁣󠁴󠁿, ❤️ y 👨‍👩‍👧.
>    - Que pase el mismo test en Node 24 (CI) y en Node 26 (local), o la dependencia acotada y dicha en el comentario de `lineaLegible`.
> 4. **#121:** un `move_hero` que da al menos un paso y no llega se cuenta como aplicado. Su veredicto dice que entró parcialmente, dónde quedó y cuántos pasos faltan. Uno que no da ni un paso sigue descartado (`test/ascenso.test.ts:199` sigue verde). Test del contrato. El recorte «hasta donde alcanza hoy» no se escribe por tercera vez (ya están `session.ts` y `stepTowards`).
> 5. **#122:** la prosa de `RESPONSE_FORMAT.map_generate` dice la verdad: si el plan se rechaza se juega el procedimental, no se vuelve a pedir y el motivo llega como aviso. **Sin reintento**: lo descarta la crítica (decisión de CLAUDE.md y de `mapa-del-agente.ts`).

En **Contexto**, añadir:

> - #130 va en paralelo y puede tocar `escenas/aventura.ts` y el bucle de `moveHero`. Se avisa al fusionar.
