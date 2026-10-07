# Requisitos — #161 y #166 (H10), el generador pone los pasos de agua donde el puente casa

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Marca del usuario en `pnpm dev` («El puente desemboca en una pared de piedra, debería ser un camino»): s2, puente de piedra N-S en node-4 (7, 11).
  - La orilla norte es un islote de una casilla, (7, 10), que solo se une a tierra en diagonal, con (6, 9), entre dos casillas de agua.
  - El camino sigue en diagonal al pie de las paredes de (7, 8) y (6, 9), y se pierde.
  - La marca está en `docs/revision/marcas/20261007-142429-s2-7-9.*` del repo principal (`/home/al/code/heroes`), ignorado por git.

## Contexto
- **#161:** en las semillas 1-40 hay 101 puentes y 35 son quebrados, sin orillas enfrentadas. `asentar` los encaja como puede (escala 0,7-1,15), de forma provisional.
- **#166 H10:** en 6 de 205 puentes de las semillas 1-80, una mina o un pueblo cae sobre un estribo o delante (s57 node-16).
- **Hoy el núcleo no guarda qué barrera cruza un nodo** (#145); el cliente lo adivina con `barreraDeNodo` y `analizar`. Si guardarlo simplifica esto, puede entrar.
- **Cambia los mapas y el banco.** Se re-ancla en `tools/qa/banco.ts` y se juzga la forma del diff. `barrido-semillas.ts` tiene que seguir en 0 sin terminar. Las medidas de duración y equilibrio van con 10 semillas, que es lo de esta fase.
- **En paralelo, en otros worktrees:**
  - #167 toca solo tests y `package.json`;
  - #159 toca `colocar.ts` y `relieve.ts` del escenógrafo.

## Criterios de aceptación
1. **Todo nodo de agua tiene dos orillas enfrentadas** (N-S, E-O o una diagonal con arte). Cuenta en las semillas 1-40 de quebrados: hoy 35, la meta 0. Si alguno no se puede, se dice cuál y por qué.
2. **Cada estribo sigue por tierra en cruz, no solo en diagonal.** La casilla del estribo tiene vecina pisable en el eje del puente o de su región, y no es un islote de una casilla (el caso de s2).
3. **Ninguna mina, pueblo, ciudad, cofre ni recurso** cae en la casilla de un estribo ni en la siguiente en el eje del puente (H10: hoy 6 de 205 en 1-80).
4. **Si `asentar` y su escala ya no hacen falta**, se retiran o se reducen. Lo dice el plan.
5. **`pnpm banco` re-anclado** con la forma del diff explicada, `barrido-semillas` a 0, `pnpm qa` en verde y duración mediana de partida (10 semillas) sin un cambio grande; si lo hay, se dice.
6. **Capturas** de s2 (7, 11) y s57 node-16 antes y después, y de unos cuantos puentes más.
