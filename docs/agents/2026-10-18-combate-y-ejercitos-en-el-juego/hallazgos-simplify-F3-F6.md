# Hallazgos de /simplify sobre F3-F6 (consolidados por el coordinador, 19-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre `a4e85909..d3c149b6`
(src/, tools/, data/). Deduplicados, con la decisión tomada. **Ninguno debe mover el juego**: el
banco tiene que seguir en `1c496b88…` (si alguno lo mueve, se explica o se deshace).

## Se aplican (por orden de prioridad)

### Núcleo y contrato
1. **El stack dice de qué unidad es; `body` es siempre el arte** (altitud 1-2, simplificación 3).
   `OrigenDelStack` `kind: 'catalogo'` lleva `unidad: id` en el juego y en la arena; `body` es la hoja.
   Una sola `cuerpoDe(state, stack)` sale del origen (catálogo → cuerpo de la unidad + veteranía;
   héroe → `cuerpoDelHeroe`), igual en juego y arena: fuera `BattleState.cuerposDeArena`, el
   respaldo de `arteDe` que busca en el catálogo, y lo que sobre de `tiposDeArena`/`fichasDeArena`/
   `tipoDelStack`. Con eso el panel de la partida también puede decir qué suma el equipo.
2. **El equipo puesto de un portador, una lectura** (altitud 3, reutilización 6, simplificación 7):
   `equipoPuestoDe(hero, quien)` (de serie + el suyo) junto a `equipoDe`; `ponerseBlocker`,
   `unequipBlocker` y `ai/strategy.ts` lo leen, y ponerse y quitar preguntan **un** blocker sobre el
   equipo resultante (`manosBlocker` + `armaDeCuerpoBlocker`), como `equipoValido` en la arena.
3. **El ejército de salida, validado al cargar** (altitud 4, reutilización 5): fuera el recorte
   silencioso de `startingArmy`; que cada facción quepa en un héroe recién hecho se comprueba al
   cargar (como las guarniciones) y lanza diciéndolo. «Las unidades del pueblo» con
   `sitioDe(f, 'lvl1')`/`unidadesDeMorada`, no `find(b => b.morada === 1)` a mano (también en
   `tools/qa/escenas-de-capturas.ts` y `client/views/base.ts`).
4. **El paso del cruce, en el núcleo** (altitud 5, reutilización 1, simplificación 10): `plantarse
   (battle, accion, rng)` junto a `soltarElGolpe`/`completarCruce`, y un paso que devuelva «acción
   lista» o «plantado, falta tal papel de tal bando», recibiendo quién decide cada papel. La sesión
   (`CruceDeLaRueda`) y el director (`conLaRueda`) son dos conductores del mismo paso.
5. **Nombres del contrato** (altitud 7, simplificación 11): la jugada del núcleo se llama como el
   hecho (`power`), sin traducir caso a caso; un solo módulo de vocabulario del contrato (los huecos y
   los golpes juntos, o `golpes.ts` al lado de `huecos.ts` con una sola puerta). La marca `Hit` y su
   guardia fuera: un `as const` y `type Hit = …`; `serialize.ts` recorre `TIPOS_DE_GOLPE` sin índice.
6. **El oro de una unidad, un sitio** (reutilización 4, simplificación 7): `cost` → `oro: number` (o
   un `oroDe(id)`), y un `costeDeUnaUnidad` real (el que documenta `catalogo.ts:84`) que leen
   `resolveUnit`, el espectador, la estrategia y la ficha de la arena. `equipoDeSerie` fuera si
   repite el `.equipo` que escribe `conEquipo`.
7. **Código muerto de lo retirado** (simplificación 1, 2, 5, 12):
   - Unidades de dos casillas: fuera `UnitInfo.hexes`, `hexSize` y el despliegue de grandes; toda
     unidad, una casilla (tests que usaban `GRANDE` se reescriben o se borran si defendían eso).
   - Munición: el Guardabosques (`rpg/stats.ts`) lleva un arco en `distancia`; fuera `shots`,
     `shotsLeft`, `cuentaTiros`/`tirosQueQuedan`/`quedanTiros` (los que sobren), `municionBlocker` y
     su guardia, el `↑N`, la fila «Munición» y `shotsLeft` del contrato. Si con eso `SIN_ARMA` y la
     rama `armas === undefined` sobran, fuera también.
   - Carga sin nulos: `cifrasDeCarga(unit)` directo; fuera `cargaDelStack`, las ramas `null` de
     `accionesDeLaUnidad.carga`/`ayudaDeCarga`/`previsionDeLaRueda`, y `cargaAPie` del evento
     derivado de `!hasTrait(unit, 'charge')`.
   - `colgarEfecto` sin la unión, `tiradasPosibles` sin el envoltorio.
8. **Nombres del juego, no «de la arena»** (simplificación 7 y 9): `UnidadDeArena` → `Unidad`,
   `validarUnidadDeArena` → `validarUnidad`, `HojaDeArena`, `PERFILES_DE_ARENA`, `esIdDeArena`… lo
   que ya es el formato del juego. `Sitio.nivel` → `morada`. `buildings.json`: lista de campos
   admitidos y «campo ajeno», no los viejos por su nombre.
9. **Eficiencia** (eficiencia 1-5 y la guarda de `mejorPoder`): memo de `poderBruto` por `UnitInfo`
   (y `indiceDePoder` saliendo de él); memo de `cifrasDeLosNiveles` por niveles, y `strike` usa las
   cifras del intercambio que ya tiene; en `recorrer`, sin enemigo a menos de `pasos + 2`, el BFS de
   siempre (mismo `Map`, mismo orden: compruébalo con el banco); el contacto contado una vez por
   turno y compartido entre sus lectores (si queda limpio); `chargeFrom` con los costes de
   `legalActionsAndCosts`; `mejorPoder` sale pronto si nadie tiene poderes. Mide el banco antes y
   después (tiempo) y `autoResolve`.

### Cliente y servidor
10. **La sesión sin copias** (reutilización 2-3, simplificación 4): `unaOElegir` común (lo usan
    poderes, escalera y puerta); los envoltorios de la rueda (`playBattleAction`, `elegirEnLaRueda`,
    `cancelarGolpe`, `aplicar`) en `CruceDeLaRueda` o una base común; lo apuntado en un solo campo
    (`apuntado: hechizo | poder | null`) que limpia una sola función; el callback de
    `LibroDeBatalla` y el Escape que sueltan el poder, una vez.
11. **La rueda lee el bando propio de la sesión** (altitud 8): fuera `CaraDeLosContrincantes.propio`;
    la figura de cada contrincante sale de un render común, así que **la partida también lleva
    figuras** en la cabecera de la rueda; la arena solo añade su botón de ficha.
12. **Quién lleva cada bando, de `Player.controller`** (altitud 6): `playAiTurn` reparte por el
    controlador de los bandos de la batalla nueva y quien llama solo dice cómo juega el controlador
    X; `noSeRinden` se deriva de lo mismo. Si no sale limpio sin tocar el banco, se aplaza con motivo.
13. **Menores** (reutilización 7-10): `SECCIONES` de `tools/datos/tipos-de-heroe.ts` sale de
    `NOMBRE_DE_FACCION`; los validadores de `data.ts`/`buildings.ts` con `validar.ts` donde encajen
    (sin forzarlo: los que acumulan problemas se quedan); `losDelCruce()` en el animador, que leen el
    espectador y la escena; un `dichoDelCruce` en `server/notas.ts`; la descripción de cada poder en el
    núcleo (junto a `poderes.ts`), que leen la prosa del agente y el panel.
14. **Comentarios que hablan de lo que ya no existe** (simplificación 8): los de la lista del
    revisor (`escenas/batalla.ts:213`, `views/panels.ts:784`, `unidad.ts:7-11`, `data.ts:78,90,108`,
    `types.ts:271`, `nivel.ts:116`, `vista-espectador.ts:113,134`, `personajes.ts:293`,
    `tools/qa/enfrentamiento.ts:25`) y cualquier otro «hasta F5/F6», «la arena» donde ya es el juego,
    knight/necromancer en prosa.

## Se aplazan (con motivo)

- **`DIVISOR_DEL_PODER`** (altitud, nota): adaptador de escala para no recalibrar `fuerzaMax` y
  `MARGEN_CONTRA_NEUTRALES`; recalibrar es equilibrio, y el usuario lo dejó para después.

## Se descartan (a conciencia)

- **Dos guardias para el enlace viejo** (simplificación 6): el criterio 8 pide que `?reglas=`,
  `?golpe=` y `?contacto=` se rechacen diciéndolo; sin `?montaje=` la versión no los caza.
- **Pedir solo las hojas de las facciones en juego** (eficiencia 7): una vez por carga, perezoso.
