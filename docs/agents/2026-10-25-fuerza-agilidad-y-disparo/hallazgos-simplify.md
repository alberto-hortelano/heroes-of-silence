# Hallazgos de /simplify (25-10-2026), consolidados y decididos

Cuatro revisores (reutilización R, simplificación S, eficiencia E, altura H) sobre `git diff main...HEAD`
(99132e20, 32041b33, a08b722c, 17d18c02). Deduplicados; cada uno con su decisión. **Nada de esto
añade tests del disparo** (regla del usuario).

## Se aplican

1. **El intercambio siempre es `arma`** (S1, E7). `usoDelIntercambio` devuelve siempre `'arma'` (el
   cuerpo a cuerpo nunca pone `ranged`): se borra; `ruedaDelIntercambio` y `previsionDeLaRueda` leen
   `ruedaDelGolpe(unit, 'arma')` / `nivelesDelGolpe(unit, 'arma')` sin montar `opcionesDeDanio`; fuera
   los parámetros que sobran (`state`, `contra`, `carga`) y los comentarios de «la lanza si cobra la
   carga» (`conElGolpe`, `ruedaDelIntercambio`).
2. **«Lo mejor de las dos armas», una vez** (S2). En `sumaDe` (`hero/equipo.ts`) el `ataque +=` /
   `fuerza +=` de armadura y escudo es código muerto: ataque y fuerza = máximo sobre las armas de cuerpo
   a cuerpo, calculado una sola vez, y `armasPorUso` lo recibe.
3. **El daño del disparo por `cifrasDelCuerpo`** (H1). `armasPorUso` escribe `danioDeLaFuerza(…)` a mano:
   que lo pida a `cifrasDelCuerpo` (con `fuerzaDelArma` del arco), la única cuenta.
4. **La agilidad efectiva de una `UnitInfo`, una lectura** (S7, R4, H2). `agilidadDe(u: UnitInfo)` en
   `core/cuerpo.ts` (el `peso ?? 0` dentro); la leen `serialize.ts`, `arena/paneles.ts` (también su
   `restaDelPeso`, si se puede con `restaDelPesoDe(u)` a su lado) y lo que la necesite en `vestir`.
5. **¿Va en este hueco?, una pregunta** (S5, R5, H4). `huecoBlocker(p, hueco)` junto a
   `huecosDeLaPieza`, con la frase una vez; la leen `manosDe`, `equipoBlockerDe` y `ponerseBlocker`
   (o `equipoDelPortadorBlocker` al principio, y `ponerseBlocker` deja de repetirla).
6. **Las manos, solo en `manosBlocker`** (H3). La rama de lo de serie de `equipoDelPortadorBlocker`
   (`catalogo.ts:221-233`) rehace «dos manos y escudo» y «segunda y escudo»: que `manosBlocker` reciba
   lo fijo (lo de serie) y elija solo la frase del remedio. Si eso obliga a cambiar el
   comportamiento de algún rechazo, se deja y se dice.
   **Saltado al aplicar** (25-10-2026): la rama de lo de serie va *antes* que las demás comprobaciones
   de la segunda arma (que sea de una mano, que haya primera); dentro de `manosBlocker` iría después,
   y un rechazo cambiaría: a quien lleva escudo de serie y pone una segunda sin primera se le diría
   «pon antes una primera», un remedio que no le sirve. Además la frase nombra al portador, que
   `manosBlocker` no conoce. Se deja como estaba.
7. **El tirador no se salpica, dentro de `splashTargets`** (S3): los tres llamadores dejan de quitarlo a
   mano.
8. **El principio del turno, una función** (S4, H7). `empezarElTurno(state, s, rng)` con
   `dispararLoApuntado` y la salida si acabó, para la rama de moral baja y la normal de `advance`; fuera
   el `state.turno = null` repetido (ya lo hace `checkFinished`). Los comentarios que citan
   `empezarTurno` y `primeroEnLaLinea` (`battle.ts`, `types.ts`, `board.ts`) se corrigen al nombre real.
   *Al aplicar*: sin función nueva; las dos ramas de `advance` se juntan en una (perder el turno o
   abrirlo, y después `dispararLoApuntado` y una sola salida), que es lo mismo con menos nombres.
9. **Las opciones del disparo, una vez** (R3, H5). `opcionesDelDisparo(state, s, at)` en `battle.ts`
   (alcanzado + `opcionesDeDanio(…, { ranged, cuarto: cuartoDelDisparo(d) })`), que leen el disparo, la
   previsión y la IA (`tactics.ts:908`, hoy `{ ranged: true, cuarto: 4 }` a mano, sin `bonoEnLoAlto`). El
   4 del alcance de la caída, una constante junto a `cuartoDelDisparo`, que lee también `dichoDelCuarto`.
10. **`aTiroLimpio` una vez por decisión** (E3): se calcula en `decideAccion` y se pasa a
    `tiradorAlMuro`, que pregunta con `.some`.
11. **La puerta cerrada, con `pasoPorPuertas`** (R2, E4). `cruzaPuerta` de `lineaDelDisparo` reescribe la
    regla: `paso?.(indiceDe(antes), indiceDe(h)) === false` con el `pasoPorPuertas` memorizado.
12. **La recta de tiro, memorizada** (E5). `lineaDeTiro` es geometría pura de (desde, hasta, bando):
    un memo por `codigoDeLado` y bando, como el `lineas` que se quitó.
13. **El pintado no recalcula por fotograma** (E1, E2, E6). Las rectas de `pintarDisparos` se memorizan
    por estado (identidad de la batalla + largo del registro, como `anguloActual`); el tanteo, por casilla
    del puntero y estado (se vacía en `mover`/`salir` y con cada jugada); la previsión del «Apuntar»
    sobre casilla, con una acción estable por casilla para que entre en la `WeakMap` de `previsiones`.
14. **`medioSinArmadura` con `enElCruce`** (S8).
15. **`activeStack(battle)` en `pintarDisparos`** (S9, R7).
16. **La rama muerta del ternario de `anim.ts:967`** (S10).
    **Saltado al aplicar**: no está muerta para el tipo. `paso.target === null` no estrecha la unión a
    `shoot` porque cada miembro va con `& Reloj` (TS2339: `at` no existe en el de `attack`); quitarla
    pide un `as`, peor que la rama.
17. **`hexEquals` en `angulo.ts:111`** (R1).
18. **`textoDeModificador` en `delEquipo`** (R8) para ataque y defensa; casillas y daño, su texto propio.
19. **El cuerpo de referencia de la IA, del héroe** (R9): `AGILIDAD_DE_REFERENCIA` sale de
    `HEROE.combate.agilidad`.
20. **La validación de `data.ts` con las piezas de `validar.ts`** (R6): `combateDelHeroe` y el bucle de
    `validarExperiencia`, con `problemasDeObjeto` y `enteroBlocker`. Los mensajes pueden cambiar de forma;
    si un test los fija, se adapta.
21. **Exports que nadie importa** (S6): `AGILIDAD_MINIMA`, `CASILLAS_MIN`, `Primitivas`,
    `LoQuePoneElEquipo`, `SIN_EQUIPO`, `CifrasDerivadas` (cuerpo.ts), `seCorre`, `nombresDeLasArmas`, sin
    `export` (comprobado con grep; un test que los importe, se mira caso a caso).
22. **`Apuntado` con el disparo** (H6). `soltarLoQueNoVale` (`session.ts:3087`) hace `a.kind ===
    'hechizo' ? spell(a.id) : poder(a.id)`, y con `disparo` llamaría a `poder` con el id del tirador:
    se cubre el caso. Que el resto de lectores de `kind === 'disparo'` pasen por una sola función
    (`nombreDeLoApuntado` o similar) si sale natural.
23. **`vestir` con el cuerpo desnudo** (H8). Si ningún llamador viste encima de lo vestido (revisar todos
    los de `conEquipo`/`vestir`), `vestir` lanza con algo ya puesto, como `cifrasVeteranas`, y hace un solo
    `sumaDe`. Si alguno lo hace, se deja y se dice.
    **Saltado al aplicar**: uno lo hace. El retoque de la arena (`aplicarAlTipo`, `core/arena.ts`) pasa
    a `cifrasDelIndividuo` la unidad ya vestida con lo de serie (`unidadDeCombate`) y le pone encima
    el equipo propio del veterano; con `vestir` lanzando con algo puesto, ese camino rompería.

## Se descartan, con motivo

- **E4, índice de casilla → stack en `lineaDelDisparo`**: la recta tiene ≤ 12 casillas y el tablero ≤ 14
  stacks; con el memo del pintado (13) deja de estar en el fotograma. Coste despreciable.
- **E-menor, `stackEn(a.at)` por cada `aim` en `dibujar`**: lo mismo, lista corta; si el memo de 13 lo
  cubre, mejor.
- **`miradaALaCasilla` frente a `miradaAlObjetivo`** (R, descartado por el propio revisor): ahorro pequeño.
- **`if (!esHueco(x)) throw huecoDesconocido(…)` en `session.ts`**: sigue el patrón que ya había.
