**REENCUADRADA** — el defecto no está en dónde cae el nodo ni es del agua: está en cómo `engordarFronteras` abre la entrada de **todo** nodo. Y el caso del usuario (s2) no es un quebrado.

## El problema real, en una frase

Al vestir la red, la entrada de un nodo a cada región sale en esquina o en diagonal (≈ 1/3 de los nodos sin vecinas opuestas pisables, ≈ 60 % con una entrada que solo toca tierra en diagonal), y en el agua eso se ve como un puente que desemboca en un islote o contra una pared.

La propuesta de #161 («que el generador elija para el paso de agua una casilla con dos orillas enfrentadas») ataca otro sitio: la casilla del nodo **ya** tiene orillas enfrentadas en la red fina; las pierde al engordar.

## La premisa, afirmación por afirmación

Medido con los guiones de esta carpeta (`medir-orillas.ts`, `medir-entradas.ts`, `medir-red-fina.ts` con `generate-copia.ts`, una copia instrumentada que da los mismos nodos que `newGame`).

| Afirmación | Verificación |
|---|---|
| 101 puentes y 35 quebrados en 1-40 (#161) | **Cierto**: 101 / 35. En 1-80: 205 / 78. |
| «El generador pone nodos de agua sin orillas enfrentadas» | **Falso donde lo sitúa**. En la red fina aceptada (`generate.ts:986-990`, la mediana de la frontera de cada pareja), **563 de 568 pasos** tienen dos vecinas opuestas abiertas de regiones distintas. El quebrado nace después, en `vestir.ts:327-348`: un pasillo por región, la primera vecina por orden de `vecindad` (rectas antes que oblicuas, pero sin exigir que sean **opuestas**) y `caminoHastaLibre` (`vestir.ts:439`) con BFS de 8 vecinas. Norte para una región y este para la otra son las dos «rectas», y salen quebradas. |
| Es cosa del agua | **Falso**. Nodos sin vecinas opuestas pisables de dos regiones, 1-40: montaña 42/110, bosque 32/98, muro 11/40, acantilado 45/139, agua 35/101. La misma tercera parte en todas las barreras. |
| s2 node-4 (7,11) es el caso de #161 | **No**. Es un puente **recto N-S**: (7,10) y (7,12) se pisan y son de regiones distintas. Lo que falla es que (7,10) solo toca tierra en diagonal, con (6,9). Arreglar el criterio 1 no arregla la marca del usuario. |
| Estribos en islote (criterio 2) | **Mayor de lo que dice la tarea**: en 1-80, **129 de 205 puentes** tienen un estribo sin vecina en cruz pisable (sin contar el nodo), y **63 de ellos son rectos**. Por barrera (alguna entrada así, 1-40): montaña 73/110, bosque 61/98, muro 22/40, acantilado 89/139, agua 62/101. |
| H10: 6 de 205 puentes con objeto sobre un estribo o delante | **Menor que la cifra con la definición del criterio 3**. Sobre la casilla del estribo, **ninguno**: `juntoANodo` (`regiones.ts:311-323`) la excluye (`generate.ts:1235-1241`). En la siguiente en el eje: **19 puentes (20 estribos) de 205** en 1-80: 13 minas, 5 recursos, 2 pueblos (s57 node-16: mina en (22,24) y pueblo en (22,28)). Tampoco es del agua: hay mina, pueblo, ciudad, cofre o recurso a Chebyshev 2 de 184 de los 488 nodos de 1-40. |
| «Hoy el núcleo no guarda qué barrera cruza un nodo» | Cierto (`nodos.ts:27`). **No hace falta para esto**: `engordarFronteras` ya conoce el tipo de cada casilla de muro cuando abre los pasillos (`tipos`, `vestir.ts:283`). |
| `asentar` se podría retirar | **No del todo**. Los planes del agente ponen nodos donde quieren y `problemasDeRed` no mira las orillas (`regiones.ts`, ninguna regla así). `puenteDe` (`puentes.ts:165-190`) sigue haciendo falta para los mapas del agente, salvo que se cambie el contrato del plan, cosa que esta tarea no pide. |

## Sobre si se puede arreglar en el núcleo sin romper la red

- **La red no se toca.** El sitio del nodo, la regla de Chebyshev ≥ 3 (`cerca(n, 2)`, `generate.ts:988`), el reparto de un camino por pareja (`crucesConCamino`) y el perfil de saltos se deciden antes de vestir y no dependen del pasillo. Lo que cambia es qué casillas se protegen al engordar.
- **Lo que sí puede pasar**: un pasillo más exigente hace fallar más vestidos (`'el nodo … se queda sin entrada'`, `'los pasillos … corren a dos casillas'`) y el generador viste más veces. Eso cambia los mapas, el tiempo de generar y, si se dispara, `INTENTOS_DE_VESTIDO`. Hay que medirlo con el barrido. En la red fina, 5 de 568 pasos no tienen vecinas opuestas: esos no tendrán orillas enfrentadas sin mover el nodo, y hay que decir cuáles son.
- **No mover el nodo** para resolver esto. Mover el nodo es lo que propone #161, y es tocar la red para algo que no es de la red.

## El día después

- **Quien juega** ve puentes y pasos de montaña o de bosque que siguen por tierra en el eje, sin islotes ni esquinas, en más de la mitad de los nodos. Las reglas de juego no cambian, porque el movimiento ya era de 8 vecinas.
- **Cambian los mapas**: el banco hay que re-anclarlo. El diff debería tocar el terreno junto a los nodos y, de rebote, objetos y obstáculos que se sortean después. Si cambia el grafo de regiones de alguna semilla, es un bug.
- **Lo que queda por borrar**: el caso 2 de `puenteDe` y `asentar` dejan de usarse en el procedimental, pero se quedan por el agente. Con ellos se queda `test/puentes.test.ts:208-232`, con sus cifras de quebrados (9 en 1-10), que hay que reescribir y no borrar.
- **Contra `CLAUDE.md`**: nada. Sí hay que ajustar el texto «provisional hasta #161» de la sección de puentes.

## Conflictos

- **#145 (guardar la barrera del nodo)**: hay solapamiento solo de apariencia. Esta tarea no lo necesita y no debe arrastrarlo, porque cambia el `GameMap` y el contrato del espectador. Con entradas rectas, el `eje` que adivina `barreraDeNodo` sale de las vecinas opuestas sin heurística: eso abarata #145 en vez de encarecerlo. Orden: esta primero.
- **#144 (ríos como líneas)**: un arreglo escrito «para el agua» se tiraría con #144. Uno escrito para la entrada de todo nodo sobrevive, porque un río trazado como línea sigue necesitando una entrada recta al vado. Otra razón para no especializar en el agua.
- **#167 (tests lentos, en paralelo)**: mueve justamente `test/puentes.test.ts` y los tests de semillas 1-10/1-40, y esta tarea cambia sus cifras. El segundo en fusionar rebasa sobre el primero. Conviene avisar a #167 de que esas cifras van a cambiar.
- **#159 (escenógrafo, en paralelo)**: no comparten ficheros mientras esta tarea no toque `colocar.ts`. Sus tests de semillas cambiarán de cifras al cambiar los mapas, así que el segundo re-mide.
- **#132 (auditoría de fronteras)**: `barrerasDe` (`test/helpers.ts`) ya tiene una excepción «pegada a un nodo». Un pasillo distinto puede morderla. Hay que mirarlo, no adelantarlo.

## Coste contra valor

El arreglo cabe en `vestir.ts`: los pasillos y la exclusión de objetos en el eje (`generate.ts:1235-1241` o vecino). Es pequeño en código y caro en verificación (banco, barrido, duración). El valor es alto: es el fallo que marcó el usuario, y afecta a la mayoría de los puentes y de los pasos. **No hacerlo** deja `asentar` como parche permanente para el 38 % de los puentes y deja islotes en el 63 %.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Encuadre (crítica):** el nodo ya cae entre orillas enfrentadas en la red fina (563/568 pasos, 1-40). Las pierde al vestir, en los pasillos de `engordarFronteras` (`vestir.ts:327-348`), y le pasa a toda barrera por igual (≈ 1/3 quebrados y ≈ 60 % con entrada en diagonal en montaña, bosque, muro, acantilado y agua). Se arregla ahí, para **todo nodo**, sin mover nodos ni tocar la red, y sin `if (agua)`. #145 no entra.
>
> 1. **Todo nodo tiene sus dos entradas opuestas** (N-S, E-O o diagonal) en el procedimental. Hoy, en 1-40: 35 de 101 de agua y 165 de 488 en total. Meta: 0, salvo los nodos cuya red fina no las tiene (hoy 5 de 568), que se listan.
> 2. **Cada entrada sigue por tierra en cruz**: la casilla junto al nodo tiene una vecina en cruz pisable de su región, además del nodo. Hoy, en 1-80, 129 de 205 puentes fallan, 63 de ellos rectos, **s2 node-4 incluido**. Meta: 0 en todo nodo.
> 3. Ningún objeto (mina, pueblo, ciudad, cofre, recurso) en la casilla siguiente a la entrada en el eje del nodo. Hoy: 19 de 205 puentes en 1-80 (sobre la casilla de la entrada ya no cae ninguno). Meta: 0 en todo nodo.
> 4. `asentar` y el caso 2 de `puenteDe` **se quedan** para los planes del agente, que no validan orillas. El plan dice si su escala se puede estrechar y se reescribe la nota «provisional hasta #161».
> 5. Igual que estaba, y además: el diff del banco no cambia el grafo de regiones de ninguna semilla, y se dice cuántos vestidos más hacen falta por mapa (hoy contra después).
> 6. Igual que estaba. Capturas de s2 (7,11), s57 node-16 y de un paso de montaña y uno de acantilado que hoy salgan en esquina.
>
> Aviso a #167: las cifras de `test/puentes.test.ts` (1-10: 26 puentes, 9 quebrados) cambian con esta tarea.
