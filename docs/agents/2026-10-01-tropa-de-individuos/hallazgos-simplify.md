# Hallazgos de /simplify — 1a, consolidados y decididos por el coordinador

Dos revisores (reutilización+simplificación; eficiencia+altitud, con perfiles y
prototipos medidos en copias del scratchpad). El banco **ya se re-ancló** en esta
fase (`7372210b…`). Lo de abajo marca en cada punto si debe dejar el ancla igual o
si la mueve a propósito.

## Se aplican

### Mismo ancla (`7372210b…`) — comprobarlo tras cada bloque

1. **El motor de batalla deja de rehacer lo que no cambia** (eficiencia 1-4,
   prototipados en `scratchpad/wt/`: `autoResolve` 358 → 182 ms, partidas
   3 144 → 2 667 ms, ancla igual):
   - `board.ts` `neighbours`: memorizar por casilla (99 entradas).
   - `board.ts` `reachable`: tabla de vecinas por índice y `Uint8Array` de
     visitados, devolviendo **el mismo `Map` en el mismo orden** (el orden es
     regla, como en `frontera.ts`; si el ancla se mueve, está mal).
   - `battle.ts` `legalActionsAndCosts`: `stackHexes(e)` fuera del bucle interior y
     `occupiedHexes(h, hexSize(info), side)` en vez de copiar el stack por sonda.
   - `tactics.ts` el `reduce` de `distanceTo`: cada distancia una sola vez.
   Se mide antes y después y se apunta en `implementacion.md`.
2. **Los monstruos usan la misma conversión que los héroes**: `defenderSide`
   (`game.ts`) con `troopsAsStacks(withTroops(...))`, no un `Array.from` propio.
3. **Una regla para «a dónde va el recluta y con qué tope»**: `destinoDeRecluta`
   (o el nombre que elijas) exportada desde `game.ts` y usada por `recruit` y
   `planRecruits`. Una sola llamada a `troopBlocker` en `recruit`.
4. **La IA y su test comparten `unitPower`**: se exporta y `test/tropa.test.ts`
   la usa en vez de copiar la fórmula (el test pasa a probar que se lee el perfil,
   no a ser un espejo).
5. **`despliegueBlocker` publica también el máximo por bando** de una criatura
   (`9` grande / `27` pequeña, o lo que salga de la regla escrita una vez).
   Desaparecen la búsqueda por fuerza bruta de `maximoDeMonstruo` y los dos
   `Array.from` de `generate.ts`.
6. **Restos del modelo de 5 huecos**: `filled` sin el envoltorio `{stack, slot}`;
   `unoPorHueco` recibe `readonly Stack[]`, se llama por lo que hace y su mensaje
   ya no habla de «huecos» («Aren aparece dos veces en el ejército»); fuera el
   `sort` de `superviviente` (el orden ya es el de `push`; un comentario lo dice);
   `troopBlocker` calcula el espacio libre una vez; `vivos` alias fuera.
7. **Exports sin consumidor fuera**: `troopLeadership`, `TroopGroup`.
8. **`garrisonLeadership()` sin argumentos → la constante**, y un **test de datos
   que fija `guarnicion ≤ heroe.base`**: hoy ese acoplamiento solo vive en un
   `_comment`, y bajar `heroe.base` reabriría en silencio el bloqueo de la
   semilla 10.
9. **El espectador deja de mandar `h.army` y `t.garrison`**: nadie los lee en
   `src/client/espectador/` y ahora crecen con cada individuo. Si algún panel los
   necesitara, se manda `troopSummary`. El test de ida y vuelta del espectador lo
   cubre; si el ancla de paneles cambia, es un bug.

### Mueve el ancla, a propósito — re-anclar UNA vez al final, con forma del diff

10. **Un solo algoritmo de despliegue** (altitud 6): hoy `ROWS_BY_COUNT` coloca
    ≤5 y `despliegue` desde 6, y los dos se juegan (974 frente a 1 156 bandos en
    el banco). El caso especial existe para no mover `battle.test.ts`, no por el
    juego, y crea un salto táctico entre 5 y 6 individuos. Se queda `despliegue`
    (generalizado si se quiere el abanico para pocos) y se re-anclan una vez las
    posiciones de los tests. Las aserciones que dependan de un hex concreto se
    reescriben contra el hex que da la regla nueva, no se borran.

## Se aplazan, a issue (con la de la IA que ya propuso el arquitecto)

- **La IA congela su ejército al llegar al tope** (altitud 7): solo añade hasta
  `troopRoom`, nunca cambia campesinos por algo mejor, y los márgenes fijos
  (`1.1` de guarnición, `1.6` de monstruo, la persecución que hubo que bajar a
  `1.0`) pueden quedar insatisfechos para siempre. El arreglo de fondo es mejorar
  calidad en el tope (despedir lo barato, reclutar lo caro: hace falta una acción
  de despedir) y decidir el combate por simulación (`autoResolve` cuesta ~0,3 ms
  tras el punto 1). Es comportamiento nuevo de la IA, no limpieza: va a issue
  junto a «la IA juega con un solo héroe y acumula oro».
- **Quitar `count` del motor** (altitud 8): ya está en el backlog del plan.
- **`resolveUnit` y `troopUnit` como dos puertas** (reutilización 5): se fusionan
  cuando se quite `count`.

## Se descarta

- `stackById` lineal, `blockedHexes` por decisión, `objectValue` recalculando
  `armyPower`: medidos por debajo del 4 % y del 0,5 %. No compensan.
