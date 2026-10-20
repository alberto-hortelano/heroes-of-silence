# Hallazgos de la re-verificación 1 de QA (20-10-2026)

Veredicto: apto con reservas (`qa.md`, sección «Re-verificación 1»; evidencias en `qa/re1/`). El usuario pidió una última vuelta, corta, solo con esto:

1. **RV1-H1 — Casas, almiares y carretas tapados por un bosque.** Al alejar las casas de caminos y objetos, la regla las manda a rincones de la labranza que a menudo son la fila justo al norte de un bosque, y los pinos de delante las tapan: en 1-100, 45 de 236 casas (19 %) con la caja metida más de 0,2 en la de un árbol de delante; en 1-40, 18 de 97 casas tapadas al ≥ 74 % (14 al 90-100 %) y 8 de 67 almiares o carretas a más de la mitad. Casos: s19 (35,38), s15 (34,35), s15 (37,31), la única casa de s2 (0,9) y la de s6 (40,35). Arreglo: la misma pregunta de la copa que ya se hace a las parcelas (`bajoLaCopa` o como se llame), para el sitio de una casa, de un almiar y de una carreta; si no entra, el siguiente sitio. Objetivo: 0 en 1-100 con la medida de QA (`qa/re1/tapadas.mts`).
2. **Casa 12, seto cortado en recto** (y el escalón del alero de la 11, si se arregla igual): semillas de resto o recorte, mirando al doble con `pnpm taller derivar-casas --vista`. Si no sale limpia, se quita de la tabla.
3. **El camino de la labranza mira también las casillas sueltas** (`colocar.ts`, la máscara `camino` de la labranza sale solo de `map.caminos.tramos`): usar `map.caminos.indices` o `tiene()`, que incluyen `sueltas`. Hoy no cambia nada en el procedimental (0 de 100 mapas con sueltas); cubre los planes del agente. Con un test puro.

Para todos: `sin-cambios.mts` en 0 en 1-10 y 15, guardias a 0 en 1-10, 15 y 19, imágenes nuevas de s15 y s19, `pnpm verify` una vez al final. Sin `capturas` ni `verify:lento`.
