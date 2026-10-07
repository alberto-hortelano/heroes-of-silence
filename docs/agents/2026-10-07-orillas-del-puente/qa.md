# QA: cada nodo entra por un eje (#161, #166 H10)

Fecha: 07-10-2026. Worktree `orillas-del-puente`, sin commitear. No he tocado código. Las capturas están en `capturas-qa/` y los guiones de medida en `capturas-qa/*.mts`. Las copias de `main` y de la rama que usé para comparar estaban en el scratchpad, fuera del repo.

Petición: «El puente desemboca en una pared de piedra, debería ser un camino» (s2, (7,11)), dentro de «sigue mejorando el mapa hasta que esté bien».

## Criterios

| Criterio | | Evidencia |
|---|---|---|
| `pnpm verify` | ✅ | 2001 pasan y 1 se salta, en 9,8 s, con salida 0. `pnpm verify:lento`: 2002 pasan en 75,9 s. |
| 1. Todo nodo tiene dos entradas opuestas | ✅ (con la excepción declarada) | Lo medí con mi propio guion, `medir.mts`, en las semillas 1-100. En 34×34 quedan sin eje 422/1255 en `main` y **15/1224** en la rama. En 24×24, 113/448 → **3/441**. En 48×48, 985/2756 → **28/2780**. Ese ~1 % restante es el que la implementación declara como «de la red fina». |
| 2. Cada estribo sigue por tierra en cruz, sin islotes | ✅ | En 24, 34 y 48 (semillas 1-100), entradas sin cruz: 142, 444 y 924 en `main` → **0, 0 y 0** en la rama. Probé además algo más exigente que el guardia: que desde el estribo se alcancen 6 casillas en cruz por su región. Fallan 0 en 34 y 24. En 48 fallan 2, ambos en s79, en (17,1) y (30,46), pegados al borde: es el eje corto declarado. |
| 3. Nada en el estribo ni delante de él (`n ± 2d`) | ✅ | Objetos delante de un nodo, ciudades incluidas: 366, 464 y 545 en `main` → **0, 0 y 0**. |
| 4. `asentar` se queda solo para el agente | ✅ | `puentes.ts` cambia solo en los comentarios. |
| 5a. Banco re-anclado, con la forma declarada | ✅ | Volqué los dos bancos (`--dump`) y los comparé yo. Semillas idénticas: **0/200**. El primer hecho distinto es `raider_spawned` en las **200**, en el índice 1 en 195 de ellas y en el 2-7 en las demás. Cambian de ganador **95**. Cambian de nodos **56** (comparé los nodos de `newGame` en 1-200). Ningún tipo de hecho nuevo ni ninguno que desaparezca. `hero_moved` pasa de 36 423 a 37 005, las batallas de 1 774 a 1 715, `town_captured` de 1 493 a 1 427 y `node_captured` de 1 287 a 1 316. Coincide con lo que dice el ancla. |
| 5b. `barrido-semillas` a 0 | ✅ | `sin terminar: 0/40`, con duración 8 / 18 / 43. |
| 5c. `pnpm qa` en verde, con un plan de mapa del agente | ✅ | Salida 0. «mapa diseñado por el agente (34×34, 5 ciudades)», 81/81 veredictos y 74 decisiones de batalla. |
| 5d. La regla de `LADO_DEL_MAPA` | ✅ | Con `tools/qa/tamanos.ts` y 1 000 semillas por tanda, el lado 34 da en `main` 9/16/46 (1-1000) y 9/16/39 (1001-2000), y en la rama **8/16/43** y **9/16/53**. Ninguna partida sin terminar. La regla se cumple. **La mediana no sube un día**: eso era ruido de la muestra de 200 (ver H3). |
| Guardia nuevo, que muerda | ✅ | Hice dos mutaciones en una copia. Con el `vestir.ts` de `main` fallan el guardia y el unitario: «semilla 1: el nodo de (26,6) no tiene dos vecinas opuestas…», «…no tiene un eje cuyas dos entradas sigan por tierra en cruz». Quitando `delanteDeNodo` de `sinUsar` falla el guardia con la causa (c): «semilla 1: village en (18,18), delante del nodo de (16,16)», «mine en (12,13)…». |
| Mapas en otros lados | ✅ | En 24×24 hay 1/100 sin mapa, la s74, y es la misma en `main`. En 48×48, 0/100. Generar un mapa de 34 cuesta 9 ms, frente a 7 ms en `main`. |
| 6. En el cliente real | ✅ | `vite --port 3204` con Playwright sin pantalla: 17 sitios en la rama y 6 en `main` en el 3205, y la consola limpia en todos (ver abajo). |
| `pnpm capturas` sale 0 | ❌ | **Sale 1.** Fallan 4 de las 9 pasadas: H1. |

## Lo que se ve en el cliente

Para mirar cada sitio usé la reproducción de marcas de `pnpm dev`, `?seed=N&marca=<id>`, que destapa la niebla y centra la cámara (ver «Workarounds»).

- **La marca del usuario, s2 (7,11)** (`par-s2-7-11.png`, a la izquierda `main` y a la derecha la rama). En `main`, el puente N-S sale del agua y se mete en la pared del acantilado: es exactamente la queja. En la rama, s2 tiene otra red y en ese sitio ya no hay puente. Lo prueban las cifras, no la foto: 0 islotes en 1-100.
- **s8 node-4 (9,12)** (`par-s8-9-12.png`). Antes, un puente N-S con el estribo norte contra la pared. Ahora va en diagonal NE-SO: el estribo NE cae junto al camino y el SO pisa tierra y enlaza con su camino. Se lee bien.
- **s5 node-4 (9,15)** (`par-s5-9-15.png`). Ahora es N-S con tierra y camino a los dos lados.
- **Otros puentes de la rama** (`mosaico-0..4.png`):
  - s57 (14,21) y (28,21), s8 (24,21), s1 (28,15), s13 (30,16) y (6,32) y s21 (21,9): rectos y diagonales que casan con el río.
  - En todos, cada estribo pisa tierra y el camino llega a él.
  - En ninguno he visto un puente en esquina ni un estribo en islote.
- **El bosque y el muro**:
  - s13 (18,7) y s1 (10,5) (`pasos-pm-3.png`): un claro con su senda. Antes y después se ven igual.
  - s21 (9,11) (`mosaico-4.png`): una puerta en el muro con el camino atravesándola.
- **Los pasos de montaña** (`pasos-pm-0..2.png`, a la izquierda `main` y a la derecha la rama, misma semilla y mismo nodo): se confirma lo que apuntó el ingeniero, y **no es nuevo**. Ver H2.

## Hallazgos

### H1 — importante, y bloquea el cierre: `pnpm capturas` sale 1

Las pasadas del guion están atadas a las semillas 50 y 810, y con los mapas nuevos esas semillas ya no tienen lo que el guion busca.

Reproducción, desde la raíz del worktree:

```
pnpm capturas docs/agents/2026-10-07-orillas-del-puente/capturas-qa/pnpm-capturas
→ [capturas] Error: ruta: no hay a la vista un destino explorado con tramo de hoy y de otro día
    at rutaDoradaYGris (tools/qa/capturas.ts:1379)          # pasada «escritorio», semilla 50
CAPTURAS_SOLO=… (el resto, una por una):
  movil    → Error: no hay a la vista ninguna guardia a la que se llegue hoy  (semilla 810, capturas.ts:1330)
  tactil   → el mismo error                                                    (semilla 810, capturas.ts:1508)
  sin-arte → el mismo error                                                    (semilla 50,  capturas.ts:1887)
  emboscada, perdida, veteranos, espectador, arena → pasan, con la consola limpia
```

- **En `main` pasan las cuatro**, desde una copia en el scratchpad (`CAPTURAS_SOLO=escritorio` y `movil,tactil,sin-arte`, salida 0). La rotura viene del cambio de mapas.
- **No es una regresión del juego.** En la s50, día 1, todo lo explorado se alcanza hoy (`desktop-01-mapa-dia-1.png`): no hay ruta que pase a otro día, y no hay guardia a mano.
- **Medido en 1-200**, el número de semillas con alguna guardia que se alcanza hoy sube un poco: 175 en `main` frente a 179 en la rama (`guardias.mts`). Es la geografía de dos semillas concretas.
- **Arreglo esperado**: elegir otra semilla o buscarla con el espejo, como hacen ya las pasadas «perdida» y «veteranos». No se afloja ninguna comprobación.

### H2 — menor, ya estaba en `main`: los pasos de montaña sin camino quedan tapados por los volúmenes

- **Dónde**: s1 (26,6) (`par-s1-26-6.png`), s1 (7,27) y s8 (26,5) (`pasos-pm-0.png`), s8 (8,28) (`pasos-pm-1.png`) y s13 (8,23) (`pasos-pm-2.png`). En `main` y en la rama, la casilla del paso queda cubierta por picos y bloques de roca. Quien juega no ve que por ahí se cruza.
- **Los que llevan camino sí se leen**: s13 (25,10) y (17,17) tienen el hito y el desfiladero, y s2 (9,11) también.
- **Mejora un poco con la rama**: en s8 (8,28) y s13 (8,23) asoma una grieta entre los picos que antes no estaba.
- **Qué pasa en s2 (9,11)**: el camino del noroeste muere contra la masa de roca, a una casilla del paso, y no entra por la boca norte (`mosaico-5.png`).
- Es cosa del escenógrafo (#159 o una issue nueva), no de esta tarea.

### H3 — menor: la «mediana +1 día» que se apunta en `implementacion.md` y en el ancla del banco es ruido

| Muestra | `main` | rama |
|---|---|---|
| Banco, 200 semillas | 8 | 9 |
| `tamanos.ts`, 1-1000 | 9 | **8** |
| `tamanos.ts`, 1001-2000 | 9 | 9 |

- El p90 se queda en 16 y no hay ninguna partida sin terminar.
- El texto del ancla y el de la implementación hablan de «un día más, constante en las tres muestras». Con 2 000 semillas no se sostiene. Conviene no dejarlo escrito como hecho en `historia.md`.
- **Nota aparte, que no es de esta tarea**: en las dos versiones, el lado 32 ya cumple la regla en las dos tandas (8/14/0 y 8/14/0). Por la letra de la regla («el menor lado»), `LADO_DEL_MAPA` no sería el menor. La elección del 34 es anterior, de los mapas densos.

### H4 — menor, ya estaba en `main`: caras de roca como rectángulos planos

- En s57 (14,21) (`mosaico-0.png`, a la izquierda) se ven bloques rectangulares oscuros: uno bajo el estribo oeste y otro arriba, en el centro.
- En `main` también aparecen, por ejemplo en s57 (22,26) (`par-s57-22-26.png`, a la izquierda), junto a la cascada.
- Parecen bandas de cara sin sprite que las cubra. Es del escenógrafo.

## Workarounds

- **Ver el mapa entero con `?seed=N&marca=<id>`**:
  - Es lo que hace la reproducción de marcas de `pnpm dev`: `revealAll` y la cámara en el punto.
  - Para cada sitio escribí una marca en `docs/revision/marcas/`, ignorado por git, copiando la del usuario y cambiando la semilla, la casilla y el id. Las borré todas al terminar.
  - **Por qué no afecta a quien juega**: destapar la niebla no cambia el mapa ni lo que se pinta, solo deja verlo el día 1. Quien juega ve lo mismo al explorar.
- **Cromium**: Playwright pide la build 1243, que no está descargada. Usé la 1234, igual que hace `pnpm capturas` («uso el que hay»).
- **Un vite de `main` en el 3205**, desde una copia con `node_modules` y `assets` enlazados.
  - Ese vite reoptimizó las dependencias en el `node_modules/.vite` compartido, porque «vite config has changed».
  - Después, la rama siguió sirviendo sin errores.
- **Mis procesos**: `vite` en el 3204 y el 3205, arrancados con `set -m` y matados por su grupo (607665 y 613122). Comprobé que los dos puertos quedaron libres.

## No probado

- **Jugar una partida de la rama hasta el final en el navegador**: lo cubren el banco, el barrido y las pasadas de `capturas` que sí corren (emboscada, derrota, veteranos y espectador).
- **Los nodos «sin eje» del ~1 % en el cliente**: s17 (1,14), s30 (7,9). Tienen cifras, pero no los miré.
- **Que las 56 semillas que cambian de red sean exactamente las que tiraron alguna red**: comprobé que son 56, pero no que coincidan una a una (`redes/comparar.ts`).

## Veredicto

**No apto**, y solo por H1. Todos los criterios de la petición se cumplen y se ven en el cliente:

- el puente ya no desemboca en una pared ni en un islote;
- hay 0 entradas sin cruz y 0 objetos delante;
- quebrados del 34 % al ~1 %;
- el guardia muerde;
- el banco tiene la forma declarada;
- duración, barrido y `pnpm qa` están en orden.

Pero `pnpm capturas`, que había que dejar en 0, sale 1 en 4 pasadas por las semillas fijas 50 y 810. Con esas semillas cambiadas, el veredicto pasa a **apto**. H2, H3 y H4 no bloquean.
