# Requisitos — #157, puentes que casan con el río

## Petición literal
> «Otro problema son los puentes, van todos con la misma orientacion y no tienen union con las zonas que conectan.»

Decisiones del usuario (06-10-2026):
- «Código y arte».
- Para los pasos sin camino: «Otro tipo de puentes, rudimentarios con unos cuantos troncos y rocas».
- Tras revisar el arte: «Valen con retoques». Se pidió que el N-S suba, que los troncos E-O no se lean apilados, y: «Los arcos de los puentes deben ser mas grandes o integrados on el fondo, no veo como conectan con la tierra alrededor».

Arranque del ciclo: «continua» (07-10-2026), tras cerrar #156.

## Contexto
- Issue #157: el diagnóstico de las semillas 1-10 y los cinco puntos de código.
- El arte ya está en `main`: `assets/mapa/puente-{piedra,troncos}-*`. Lo describen `docs/art/peticiones.md` §17 y §18.
  - Piezas: piedra `ns`, `eo`, `ne-so`, `no-se`, `ns-sube` y `eo-sube`; troncos `ns`, `eo`, `ne-so` y `no-se`.
  - Cada una lleva estribos de tierra. El ancla está en el centro del tablero y `pxPorCasilla` va en su `.json`.
- Hoy se usan `nodo-puente-{ancho,hondo}`. El ancla es la de `derivar.ts` (la mediana de la fila de abajo), el nodo pinta tierra como un tapón en el río y la senda pasa recta.
- Acaba de cerrarse #156, las laderas: `relieve.ts` y `colocar.ts` llevan `junto`, `juntoDeLadera`, `ponerPared` y `materialDeCara`.
- En paralelo, en otros worktrees, van #155 (núcleo, trazado de caminos), los restos del agente y #130. Ninguno toca `render/escenario/`.
- El crítico se salta: la tarea la describió el usuario.

## Criterios de aceptación
1. **Agua bajo el puente.** La casilla del nodo de agua se pinta como agua, al nivel del agua y sin caras propias. El río no se corta.
2. **La variante sale de la red**, no de las vecinas. Se mira por dónde cruza el paso: los tramos que tocan el nodo o el lado de las dos regiones.
   - Hay N-S, E-O y las dos diagonales.
   - Hay pieza «que sube» cuando las orillas están a distinto nivel y el arte la tiene: N-S hacia el norte y E-O hacia el este. Donde no hay arte para el sentido o la diagonal que sube, se usa la plana más cercana y se apunta en `peticiones.md`.
3. **Ancla y escala desde el `.json` de la pieza.** El ancla va en el centro del tablero y la escala sale de `pxPorCasilla`. Los estribos llegan a las dos orillas, sin quedarse cortos ni flotar.
4. **Piedra si el nodo lleva camino y troncos si no.**
5. **La senda llega a los estribos y casa con el tablero.** Nada de pasar recta por encima.
6. **Ninguna pared, ladera ni cara tapa el puente.** Hoy la pared de la cara de detrás tapa 4 de 26.
   - Se mide con un guardia del informe a 0 en las semillas 1-40, y se ve morder.
7. **Nada de lo demás se rompe:**
   - `pnpm verify` en verde;
   - `pnpm banco` igual (es cliente);
   - los guardias de antes a 0;
   - los fps sin empeorar de forma apreciable;
   - `pnpm capturas` sin errores al cerrar.
8. **Capturas antes/después a 110 px:**
   - de los 26 puentes de las semillas 1-10, una hoja de contacto;
   - y en el cliente real, al menos una en el zoom máximo.

## Fuera de alcance
- Arte nuevo. Lo que falte se apunta en `peticiones.md`.
- El generador del núcleo: dónde caen los nodos de agua.
- Las laderas (#160).

## Preguntas abiertas, con su suposición por defecto
- **El poste de la bandera del nodo:** lo pone el juego. Va sobre el tablero, en un extremo, donde se lea. Lo decide el arquitecto con capturas.
- **Cruces en diagonal con orillas a distinto nivel:** la diagonal plana.

## Punto de control (07-10-2026)
El usuario aprueba `plan.md` tal cual: «Adelante». Lo del generador (nodos de agua con orillas enfrentadas) va a una issue aparte.
