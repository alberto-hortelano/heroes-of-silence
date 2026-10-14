# Hallazgos de QA a corregir (vuelta 1)

El detalle está en `qa.md`.

1. **H1 · Arma a distancia sin disparos, callada.** Una pieza nueva en `distancia` nace con 0
   disparos y, en una unidad que no dispara por sí misma, no se usa nunca, sin que nada lo diga.
   - Se pide lo mismo que con la lanza sin el rasgo Carga: una fila en «Armas» que diga «no
     dispara: no se usa».
   - Y que «+ Nueva pieza» en «Arma a distancia» nazca con disparos (por ejemplo, 12, como el arco).
   - No se rechaza la pieza: un cuerpo con disparos propios sí la usaría.
2. **H3 · La barra no nombra el arma del contraataque.** Que diga «Contraataque con Daga (cuerpo a
   cuerpo): 9–18». El dato ya está en `contraataque.modificadores[0]`, y debe salir de la misma
   tabla `DICHO_DEL_USO`.
3. **H4 · Partir la fila «sin arma, con el cuerpo».** A 1440 px, la fila «sin arma, con el cuerpo
   · Ataque 3 · Daño 10–10» se parte en dos líneas: que quepa en una o que se parta con orden.

Se queda como está, y se dice en el cierre: **H2**. Las piezas viejas con disparos fuera de
`distancia` no se convierten. No hay borradores reales así, y la barra dice cuál deja de valer.
