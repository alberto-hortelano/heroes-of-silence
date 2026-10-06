**REENCUADRADA.** El problema es real pero pequeño, y el contrato del agente no hace falta para arreglarlo: lo que ve el agente es coste de movimiento, y ese coste va por casillas.

## El problema real

Para el procedimental, el mapa pinta (y la auditoría mide) caminos que `trazarCaminos` no ha trazado. Le salen ~1,2 bucles diminutos por mapa y, para esconder el caso en que un radio roza un nodo ajeno, tiene una fase de reintento.

La solución propuesta («`roads` como tramos en el contrato») ataca esto, pero también otra cosa que nadie ha pedido: que el agente escriba y lea tramos.

## La premisa, afirmación por afirmación

Las medidas son mías, semillas 1-10 a 34×34, sobre una copia instrumentada del árbol fuera del repo.

- **«`map.roads` es un conjunto de casillas»**: cierto (`map.ts:98`, `Set<string>`).
- **«Aristas en 8-vecindad, y la diagonal solo si ninguna esquina es camino»**: cierto (`map.ts:143-163`).
- **«~1,2 bucles por mapa dentro de una región»**: cierto. `ciclosDeCamino(map).dentro` da 1, 1, 0, 2, 1, 4, 1, 0, 1, 1, con media 1,2.
  - Son espurios todos. El trazado de cada región es un árbol: cada objetivo se cuelga una sola vez de `red` (`vestir.ts:851-862`), y un nodo no se cruza (`vestir.ts:735`).
  - Son pequeños. Comparando aristas dibujadas con aristas trazadas, los que cierran ciclo unen dos casillas a 3-6 pasos en el árbol, o son bloques 2×2 de dos ramas pegadas. Ninguno es un anillo que el jugador recorra.
- **Hecho que el issue no dice**: entre 9 y 21 aristas dibujadas por mapa no son trazadas, y no cierran ciclo.
  - Casi todas están a distancia 2 en el árbol. El trazado bifurca en diagonal y el pintor lo dibuja en L, porque su regla suprime la diagonal cuando la esquina es camino.
  - El criterio 1 dice «exactamente el conjunto de tramos que traza». Literal, eso cambia el dibujo de ~15 horquillas por mapa, que pasan de L a dos trazos a 45° que se solapan con el ancho de la senda. No es un efecto neutro.
- **«Por eso `trazarCaminos` mantiene una fase `caminos`»**: cierto (`vestir.ts:862-881`, `generate.ts:1351`).
  - Sus dos motivos son solo de adyacencia: el nodo que no lleva tocado por `aristasDeCamino`, y dos casillas de una región unidas al nodo. Ninguno puede darse en el árbol trazado (`vestir.ts:735`, `:741`).
  - Con tramos, la fase no tiene de qué fallar.
- **«Falla en 16 vestidos de 203 semillas del test denso»**: la cifra es de `menos-caminos/implementacion.md:297`. No la he repetido, porque son más de 10 semillas.
  - En 1-10 fallan 28 vestidos, en `objetos`/`obstáculos`/`fronteras`, y ninguno en `caminos`.
  - Un reintento no lo ve nadie que juegue: cuesta tiempo de generación y una tirada más.
- **«Toca el contrato del agente y `serializeKnownMap`»**: no es necesario.
  - `costeDeEntrada` pregunta por casilla (`map.ts:220`).
  - El agente usa `roads` para elegir ruta (`serialize.ts:366`, `:402`) y nunca para pintar.
  - Los puntos que recibe son la verdad de su coste, con tramos o sin ellos.

## El día después

- **Quien juega**: desaparecen ~1,2 rombos o cuadritos de senda por mapa, y cambia el dibujo de las horquillas (ver arriba).
  - En los vestidos que hoy se reintentan, aparece un camino que pasa rozando un nodo sin entrar. Hoy ese mapa no existe; mañana se pinta, junto a la reserva de 0,75 del nodo (`colocar.ts:520`).
- **Qué se cierra**: si los tramos entran en `GameMap`, habrá dos hechos (casillas y tramos) que tienen que coincidir. «Un hecho, un sitio» obliga a que uno derive del otro: las casillas de los tramos, nunca escritas aparte.
- **Qué se abre**: #150 (rampas) habla de «un tramo de camino entre niveles» y hoy lo deduce con sondeos (`colocar.ts`). Con tramos reales lo leería directamente.
- **Qué hay que borrar**: la comprobación de lo dibujado (`vestir.ts:862-881`), la fase `caminos` de `FASES_DEL_VESTIDO` (`generate.ts:714`) y, en la auditoría, las lecturas de adyacencia (`helpers.ts:596`, `:611`).
- **`CLAUDE.md`**: no contradice ninguna decisión. Sí hay que reescribir la frase «Las aristas de un camino… salen de `aristasDeCamino`. Los del agente, tal cual».

## Conflictos

- **#150** (rampas) y **#151** (un índice de obstáculos): no hay choque, pero hay **dependencia**. Si #150 se hace antes, construirá su deducción sobre `aristasDeCamino`, y luego habrá que rehacerla.
- **#144** (ríos como líneas): el mismo patrón (línea y no casillas) para otra capa. No hay solapamiento de código.
- **Banco**: cambia solo si alguna de sus 200 semillas falla hoy en `caminos`. Al cerrar `menos-caminos` no fallaba ninguna (`implementacion.md:133`), pero se cerró antes del /simplify, así que el ingeniero tiene que comprobarlo. Si las casillas no cambian, el coste de movimiento tampoco.

## Coste contra valor: tres caminos más baratos que el del issue

**(A) Que `trazarCaminos` evite que dos ramas queden pegadas.** Toca solo `vestir.ts`.
- Mueve las casillas, así que mueve el banco (re-anclar y juzgar la forma).
- No toca `serializeKnownMap`, ni el espectador, ni `sendas.ts`/`analizar.ts`.
- No puede prometer 0. Ya existe una penalización por arrimarse (`vestir.ts:806`), y un coste junto a nodo ajeno solo bajó los fallos de 16 a 14 (`implementacion.md:297`). Los pasillos de una casilla obligan (`implementacion.md:369`, semilla 43).
- Convertir el bucle en motivo de fallo tampoco sirve: 8 de 10 semillas tienen alguno, así que fallaría la mayoría de los vestidos.

**(B) Tramos solo dentro, el contrato en puntos.** `trazarCaminos` devuelve aristas, `MapPlan` las lleva como campo opcional del procedimental, y `buildMap` las pone en `GameMap`. Un plan sin tramos (el del agente) los deriva con `aristasDeCamino` como hoy.
- **No toca**: `costeDeEntrada`, `serializeKnownMap`, `mapPlanSchema` ni `agent.ts`. Tampoco el banco, si ningún vestido de sus semillas falla en `caminos`.
- **Toca**: `vista-espectador.ts:194` y `adaptar.ts:56`, para que el espectador pinte lo mismo que el cliente; `analizar.ts:81` y `colocar.ts:517`, que **ya consume aristas** (`sendas(caminos)`, así que el cambio es de origen, no de pintor); la auditoría de `test/helpers.ts`; el taller.
- Cumple los criterios 1 y 2 al 100 %.

**(C) No hacer nada.** El guardia ya acota `mediana(ciclosDentro) ≤ 3` (`regiones.test.ts:434`) y los reintentos no se ven. Es legítimo si los rombos no molestan al usuario: nadie los ha señalado en una captura.

**Lo que no debería hacerse**: cambiar `mapPlanSchema.roads` y `COMO_SE_LEE_EL_MAPA` a tramos.
- Encarece el plan del agente, que tendría que escribir aristas.
- Encarece su lectura, porque el coste sigue siendo por casilla.
- No arregla nada que el procedimental no arregle por (B).

## Qué le cambiaría a `requisitos.md`

Pegar en lugar de los criterios 1, 3 y 4:

> 1. En el procedimental, el camino pintado y el medido salen de los tramos que traza `trazarCaminos`, no de la adyacencia de casillas. Dentro de una región hay 0 ciclos en las semillas 1-10 y en el test denso. Antes de implementar, el arquitecto decide cómo se dibujan las horquillas que hoy la regla diagonal de `aristasDeCamino` endereza en L (~15 aristas por mapa), y lo enseña en capturas de s1, s3 y s7.
> 3. **El contrato del agente no cambia.** `mapPlanSchema.roads` y `serializeKnownMap` siguen en puntos. Un plan sin tramos (el del agente) se pinta con `aristasDeCamino`, como hoy. Las casillas de camino se derivan de los tramos, no se guardan aparte.
> 4. El espectador (`vista-espectador.ts`, `adaptar.ts`) y el taller pintan los mismos tramos que el cliente. El agente sigue viendo casillas por la niebla, igual que hoy.

Y añadir:

> - El banco no debería moverse. Si se mueve, es porque una semilla fallaba en `caminos`, y se dice cuál.
> - Hacer este issue antes que #150 (rampas), para que las rampas lean tramos y no los deduzcan.
