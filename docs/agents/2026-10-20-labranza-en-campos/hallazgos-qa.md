# Hallazgos de QA de la labranza en campos (20-10-2026)

Veredicto de QA: apto con reservas (`qa.md`, evidencias en `qa/`). Se corrigen estos cuatro; el H1 (una figura en la casilla de una casa se pinta delante de ella) queda para el usuario y no se toca.

1. **H3 — Casas pegadas a una mina, que se leen como su caseta.** El caso claro es s15 (30,34), justo encima de la mina de (30,35); hay otras tres a dos casillas de una mina. Regla: ninguna casa a Chebyshev ≤ 2 de un objeto del mapa (mina, ciudad, pueblo, recurso, cofre, nodo), además de lo que ya pide (`cercaDePueblo`, `ENTRE_CASAS`). Se aplica igual al almiar y a la carreta. Que lo vigile un test puro de `labranzaDe` y la comprobación de escena en s15 y s19.
2. **H2 — Cuatro casas llevan un trozo de la vecina** (módulos 2, 3, 7 y 11; el 3 y el 11 no estaban declarados): de 3 a 8 px al zoom máximo. O se recortan limpias (mover las semillas, o quedarse solo con lo conexo a la casa por encima de un umbral de alfa), o se quitan de la tabla. Con `pnpm taller derivar-casas --vista` y mirando cada una al doble de tamaño. Si alguna se quita, quedan las que haya; no hace falta llegar a 13.
3. **H4 — Parcelas de gavillas bajo la copa de un bosque** (s19, declarado en `implementacion.md`). Una parcela cuya caja pisaría la copa de la masa de un bosque vecino no va, o va encogida (×0,85, ×0,7) como cuando no entra entera.
4. **H5 — Un almiar solo en el barbecho** (s19) y manchas de cultivo de una sola casilla. El almiar va solo junto a un campo de trigo (es la regla del plan: compruébese por qué este salió). Las manchas de una casilla: si es la medida aproximada de QA, dilo con el número; si son campos de una casilla, que se unan al vecino como los trozos de 1-2 del paso 1.

Para todos: `sin-cambios.mts` sigue en 0 en 1-10 y 15 (lo que no es labranza no cambia), los guardias a 0 en 1-10, 15 y 19, imagen nueva de s15 y s19 en la carpeta. `pnpm verify` una vez al final. Sin `capturas` ni `verify:lento` (QA los pasa al re-verificar).

## H1 — decisión del usuario (20-10-2026): «la 3»

Se le dieron tres opciones (dejarlo; correr la casa al fondo de su casilla; no poner casas donde suele pasar un héroe) y eligió la 3. **Las casas no van junto a los caminos**: ninguna casa a Chebyshev ≤ 1 de una casilla con camino (orientativo; si con 1 siguen saliendo al paso, 2). Van metidas en la labranza, junto a un campo cultivado y lejos de las sendas, aunque salgan menos. El sitio deja de pedir «junto a un camino o al borde de la labranza»: basta con estar junto a un campo, en una casilla sin parcela, lejos de caminos, pueblos y objetos (H3) y a `ENTRE_CASAS` de otra casa. El requisito 10 («en el borde de un campo o junto a un camino») queda así sustituido para las casas.
