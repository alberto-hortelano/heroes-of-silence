# Crítica — la senda bajo el relieve y por el borde (#189)

Defectos 1 y 7 de `docs/agents/2026-10-08-auditoria-caminos/defectos.md`.

**La premisa, medida de nuevo sobre `main` ccf283d** (tras #188 y con la huella
de #191, 0,32 de ancho): está peor que en la auditoría.

| | auditoría (a082285) | main ccf283d |
|---|---|---|
| senda bajo un píxel opaco del relieve (centro, 1-40) | 18,7 c/mapa | 23,3 c/mapa |
| tramos de camino a lo largo del borde (1-100) | 5,1 /mapa | 8,4 /mapa |

**El problema real y la solución propuesta, por separado.**

- Relieve: la regla «la pared nunca se corta ni se aparta» se mantiene; la
  propuesta (cobrar el pie de lo alto en `Busqueda`) es la única palanca que no
  la rompe. El núcleo no sabe el nivel de cada región (lo sortea la escena con
  su semilla), así que el coste solo puede mirar el terreno: el acantilado (casi
  siempre cresta) es lo seguro; la montaña y el bosque tapan solo al lado bajo.
  **Riesgo**: que el coste no baste porque el camino va por un pasillo sin
  alternativa. Se mide antes de comprometerse.
- Borde: **la causa no es la que dice la auditoría**. De 10,7 casillas de
  camino en el borde por mapa, 5,4 son la puerta de una mina o un pueblo
  colocado en la penúltima fila o en la primera/última columna (#188 hizo la
  puerta obligatoria). A esa puerta solo se llega por el borde, y un coste no
  lo arregla (medido: 8,4 → 7,0 con dos rectos). Se arregla en `colocarPar`.

**Conflictos.** #190/#191 (escena: huella, trochas) entraron en main a mitad de
tarea; esto no toca su código, y el contador mide con su huella. Cambiar la
colocación cambia todos los mapas: banco re-anclado, `rectitud` (que baila con
cualquier tirada) y los tests anclados a una semilla.

**Veredicto**: hacerlo, con el borde por la colocación más el coste, y el
relieve por el coste con un techo medido (no 0).
