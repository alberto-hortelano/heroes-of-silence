**REENCUADRADA** — el hueco es real, pero el criterio 1 pide algo que no existe (el generador no tiene una función para esto) y el alcance es más estrecho que la regla del generador.

## El problema real

Un plan del agente puede poner en la entrada de una ciudad (el anillo de accesos del 5 × 5) objetos que el generador no pone nunca ahí, porque `validateMapPlan` solo prohíbe el 3 × 3.

## La premisa, afirmación por afirmación

| Afirmación del issue | Verificación |
|---|---|
| «rama `claude/nifty-kare-5bc168`, sin fusionar» | **Falso hoy.** `git merge-base --is-ancestor claude/nifty-kare-5bc168 main` → fusionada (`b5599489`). El QA está en main: `docs/agents/2026-11-05-ciudades-en-su-region/qa.md:191` (H5). Hay que corregir la frase y no buscar la rama. |
| `problemasDeRecintos` solo mira el 3 × 3 | **Cierto.** `recinto.ts:620-628`: rechaza solo con `enElRecintoDeLaCiudad`. Lo que se mira en un acceso (`hayNodo`, `recinto.ts:215-219`) es nodo o ciudad, no un pueblo. |
| El plan acepta un pueblo de región en un acceso | **Cierto.** `validar.ts:370-371`: `dondeNo` solo se calcula si `o.barrera !== null`. El pueblo de región no pasa por `puebloDelMuroBlocker`. El QA lo reprodujo con (14,2) (`qa.md:192-196`). |
| El generador nunca lo hace | **Cierto, pero no con una función.** `vestir-la-red.ts:491-512` marca a mano el 5 × 5 de cada ciudad (`marcarElRecinto`: `enUnRecinto` / `enUnAcceso`), y `sinUsar` (`:546-551`) lo excluye de **todo** lo que coloca `colocarPar`: pueblos, monstruos (`:750`) y cofres (`:762`). El comentario dice «Ni nada en sus accesos ni en el puente: son su entrada» (`:491`). |
| «con la misma regla (la misma función) que usa el generador» (criterio 1) | **Así escrito, no se puede cumplir.** La única función compartida, `puebloDelMuroBlocker` (`validar.ts:408`), solo la usa `pueblosEnElMuro` para el pueblo **del muro** (`poblar.ts:225-226`). Su parte de ciudades (Chebyshev ≤ `HASTA_LOS_ACCESOS` = 2, `validar.ts:392,416`) es el mismo 5 × 5 que `marcarElRecinto`, así que hoy esa regla tiene **dos copias**: la del plan y la del vestido. |

Lo comprobé además así:
- **Monstruos y cofres, el mismo hueco (por lectura, no lo ejecuté).** En el plan, a un monstruo o a un cofre solo se le mira que no pise otra cosa (`validar.ts:140-141`), que esté sobre una región (`:234-235`) y que no caiga en el 3 × 3. En un acceso pasan.
- **Los mundos no se rompen.** He recorrido `assets/mundos/{ejemplo,prueba}/plan.json` buscando pueblos, monstruos, cofres o asaltantes a ≤ 2 de una ciudad: no hay ninguno. Endurecer la regla no invalida ningún mundo de hoy.

## El día después

- **Quien juega en el procedimental no nota nada**: el generador ya cumple la regla, y el criterio 4 (banco igual) lo confirma. Solo cambian los mapas que diseña el agente: no podrá plantar un objeto sobre el camino de la puerta.
- **Lo que se cierra**: un agente ya no podrá dejar un monstruo de guardia en la puerta de una ciudad (si se amplía el alcance). Hoy no lo hace ningún mundo, y el generador nunca lo ha hecho.
- **Lo que hay que borrar**: una de las dos copias del 5 × 5 (`vestir-la-red.ts:502-508` o `validar.ts:416`). Si el arreglo solo añade otra pregunta en `problemasDeLosPueblos`, quedan tres sitios con la misma regla. Eso contradice «Un hecho, un sitio» (`CLAUDE.md`, Contratos).
- **La prosa del agente se queda atrás.** `contract/peticion-de-mapa.ts:123` le dice «nada dentro de un recinto» y nada de los accesos. Si la regla se endurece, el agente solo se entera cuando le rechazan el plan.

## Lo que NO debería hacerse

- **No aplicar `puebloDelMuroBlocker` entero al pueblo de región.** Su primera regla, la del borde (`validar.ts:414-415`), es del pueblo del muro («lleva su pieza en el paso»). No he comprobado que el generador nunca deje un pueblo de región en el borde. Según `docs/areas/mapa.md:237`, el respaldo sin puerta de `colocarPar` puede hacerlo, y `sinUsar` no filtra el borde. Si se aplica entera, el plan procedimental podría rechazarse y el banco se movería por un motivo ajeno a esta tarea.
- **No reutilizar su frase.** Dice «un nodo no puede ir ahí» (`validar.ts:419`), y un pueblo de región no es un nodo. El motivo tiene que ser el de la entrada.
- **No meter a los asaltantes.** Tienen su propia regla (`problemasDeAsaltantes`, `validar.ts:440-470`) y se mueven. Queda fuera.

## Conflictos

- **#321 (lugar inalcanzable)**: toca `lugarBlocker` en `src/core/mundo/validar.ts`, otro fichero. Como mucho, las dos tareas editan `docs/areas/mapa.md` y el choque se resuelve al fusionar. Ninguna depende de la otra.
- **#313 + #317 (contrato)**: tocan `esquemas.ts`, `vocabulario.ts` y `director.ts`, no `peticion-de-mapa.ts`. No se solapan.
- **#327 (taller), #202 (crónica del espectador), #332 (escena del lugar a 380 px)**: ninguna toca `map/generar/` ni el recinto.
- **#304 (generador, pueblo fantasma)**: cambiará `colocarPar` y re-anclará el banco. Si se hace después, el criterio «el banco no cambia» de esta tarea habrá que juzgarlo contra el ancla de #304. Hacer esta antes es lo más barato. #306 y #307 no se tocan con esta.
- `git log` de `validar.ts` y `recinto.ts`: nada posterior a la fusión cambia esta regla.

## Coste contra valor

El coste es pequeño: una pregunta más en la validación del plan, la prosa y un test. El valor también es pequeño (P2; el QA lo llama «menor» y «se juega», `qa.md:198-200`). Merece la pena porque cierra la familia de H4 («el plan admite lo que el generador evita») sin tocar el juego procedimental. Si no se hiciera nunca, solo los mapas del agente podrían llevar una pieza sobre la puerta.

## Qué le cambiaría a `requisitos.md`

Pegar tal cual:

> **Contexto corregido**: la rama `claude/nifty-kare-5bc168` está fusionada en main (`b5599489`); el hallazgo es H5 de `docs/agents/2026-11-05-ciudades-en-su-region/qa.md`.
>
> **Alcance**: la regla del generador es «nada en el recinto ni en los accesos de una ciudad: son su entrada» (`vestir-la-red.ts`, `marcarElRecinto` + `sinUsar`), y vale para pueblos, monstruos y cofres por igual. El plan del agente la cumple para los tres. Los asaltantes quedan fuera (tienen su regla).
>
> 1. `validateMapPlan` rechaza un pueblo de región, un monstruo o un cofre a `HASTA_LOS_ACCESOS` o menos de una ciudad. La pregunta «¿está en el 5 × 5 de una ciudad?» vive en **un** sitio, y la leen el plan (pueblo del muro, pueblo de región y objetos) y el vestido del generador, que deja de llevar su copia. La regla del borde de `puebloDelMuroBlocker` sigue siendo solo del pueblo del muro.
> 2. El motivo dice que el acceso es la entrada de la ciudad (no «un nodo no puede ir ahí»). La prosa de `contract/peticion-de-mapa.ts` («nada dentro de un recinto») dice también lo de los accesos, con la constante, no con un número tecleado.
> 3. Hay un test por cada clase de objeto (pueblo de región, monstruo, cofre) en un acceso, que se rechaza, y otro con el mismo objeto a 3 casillas, que vale. Hay que verlo morder. Hay que pasar los tests de plan que ya llaman a `validateMapPlan` (`pueblos-en-un-nodo`, `recinto-nucleo`, `lado-del-generador`, `asaltantes`, `regiones`) y `pnpm mundo validar ejemplo` y `prueba`.
> 4. `pnpm banco` no cambia. Si se hace después de #304, se compara con su ancla.
