# Hallazgos de /simplify — armas por uso (13-10-2026)

Dos revisores: uno de reutilización y simplificación, otro de eficiencia y altitud. Están
deduplicados y cada uno lleva la decisión del coordinador. Nada de esto debe cambiar el
comportamiento: `test/armas.test.ts` sigue mandando y `pnpm banco` no cambia de hash.

## Se aplican

1. **La frontera, en el compilador.**
   - Se invierte la regla:
     - `HUECOS`/`Hueco`/`Equipo` pasan a ser los **cuatro del juego**;
     - `HUECOS_DE_LA_ARENA`/`HuecoDeArena`/`EquipoDeArena` son los seis.
   - El juego (`Hero.equipo`, `Veterania.equipo`, `idsPuestos`, `equipoBlockerDe`, los paneles del
     juego) ya no puede nombrar `distancia` ni `carga`. Que sea el compilador quien lo impida, no
     un guardia de test ni el `throw` de `slotDelHueco`; `slotDelHueco` sobra si así queda
     derivado.
   - Lo que sea de verdad de la arena (`UnitInfo.equipo` de un stack de la arena, el borrador, el
     editor) usa los tipos de la arena.
2. **Una sola pregunta, «¿es un hueco de arma por uso?»**: un predicado derivado (por ejemplo
   `!esHuecoDelJuego(h)` o `USO_DEL_HUECO[h] !== 'cuerpo'`). Lo usan:
   - `hero/equipo.ts:282` y `:334`;
   - `arena.ts:1090` y `:1125`;
   - `data.ts:886`;
   - el guardia de `invariantes.test.ts:1280`.

   Fuera los literales `'distancia' || 'carga'` y el cast `(HUECOS_DEL_JUEGO as readonly string[])`.
3. **Qué campos admite cada hueco**, en una función del núcleo junto a `USO_DEL_HUECO` (por
   ejemplo `camposDelHueco(h)`: disparos solo en `distancia`, manos solo en `arma`). La leen
   `problemasDePieza` (`data.ts:804`), `enElHueco` (`arena.ts:814`) y el editor
   (`paneles.ts:1489`, `:1526`), que hoy repiten la regla.
4. **Una tabla por uso**, en `hero/equipo.ts`, con lo que haga falta (rótulo, «a distancia» y la
   frase de cuándo se usa) escrito en la forma en que se pinta.
   - Fuera `NOMBRE_DEL_USO` de `damage.ts`, `ROTULO_DEL_USO` de `paneles.ts` y el
     `.replace(/^Al /, 'al ')` de `notaDelHueco`.
5. **Un solo tipo y una sola función por golpe.**
   - **El tipo**: `UnitInfo.armas` guarda **ids** de pieza, no nombres, con una sola forma
     `{ arma: id | null, attack, damage }` por uso. Fuera `AporteDeArma`, `ArmaDeLaUnidad` como
     copia y `SumaDeEquipo.armas`; `sumaDe` devuelve lo que haga falta sin estado derivado.
   - **La función**: devuelve, por uso, `{ arma, attack, damage }` con el respaldo que toca, y de
     ella leen el golpe (`cifrasDelGolpe`), la previsión y `armasDe`. Así no hay dos respaldos
     (`cifrasDelGolpe` frente a `armaDelGolpe`) que digan cosas distintas: hoy, «a distancia sin
     arma» cae en las cifras de arriba y el nombre dice «con el cuerpo».
   - **El nombre**: `armasDe` recibe el catálogo atado (`EquipoAtado`/`equipoCon`), no una
     función. Fuera los cinco `(id) => X.pieza(id).nombre` y los dos `throw` que no pueden saltar
     (`equipo.ts:370` y `:373`).
6. **`conArmas` no copia `vestir`.** Las cifras de arriba salen del camino de siempre: la suma por
   clave ya excluye el ataque y el daño de `distancia` y `carga`. Solo se añade `armas`. `vestir`
   reutiliza `todo` en vez de repetir el spread (`:355`).
7. **Lo que paga el juego**:
   - `cifrasDelGolpe`, y quien deduzca el uso, sale enseguida con
     `if (unit.armas === undefined) return unit` sin llamar a `usoDelGolpe` ni a `cargaCobrada`;
   - el uso se calcula una vez por golpe en `expectedDamage`, `computeDamage` y
     `horquillaDeDanio`, y se pasa a `tiradasPosibles` y `applyModifiers`, que no vuelven a llamar
     a `cargaCobrada`;
   - `sumaDe` no crea cierres ni objetos intermedios sin armas por uso.
8. **El panel de la pelea** no reconstruye `catalogoDeLaArena` en cada repintado
   (`paneles.ts:1667`): recibe el catálogo de la sesión o el memoizado de `main.ts`.
9. **Con qué pelea una unidad del taller, escrito.**
   - `perfilDeArena` (`tools/taller/unidades.ts:935`) no se deduce del rig del Y Bot: va un campo
     explícito de kit o perfil de arena en la lista de unidades del taller, y por defecto el de la
     pose.
   - El jinete élfico lo declara (`montado-arco`). Si queda un respaldo que lea el Y Bot, que use
     `juegoDelYBot(u)`, que lanza.
10. **Migraciones en un solo sitio.**
    - Las piezas: `revisarBorradorDeEquipo` (`arena.ts:1060`) y `montajeDeLaURL` (`:2831`)
      comparten una función: `piezaDeAntesDeLasArmas`, `validarPiezaDeArena` y el aviso.
    - Las unidades: la rama de los enlaces v5–6 de `montajeDeLaURL` (`:2854`) y la rama
      `'cuerpo' in u` de `migrarUnidadDeArena` (`:1387`) comparten una función, sin el `perfilDe`
      que no usa.
11. **Lo muerto**:
    - el `USOS_DE_ARMA` exportado solo para derivar el tipo (`types.ts:225`) se deja sin exportar
      o se borra;
    - la parte (b) del guardia de `invariantes.test.ts:1276` repite la regla del cargador y no
      puede fallar: con el punto 1 la cubre el compilador, así que se borra y se dice.
12. **Tests**:
    - el cuerpo 3/3, 10–10, 80 PV de `test/armas.test.ts:41` y `test/prevision.test.ts:139`
      sale de `CUERPO_COMUN`;
    - `ARQUERO_DE_LA_ARENA` y `JINETE_DE_LA_ARENA` (`prevision.test.ts:151`) leen
      `KIT_DEL_PERFIL`.

## Se descartan, con motivo

- **`KIT_DEL_CICLO_2` repite tres perfiles**: está congelado a propósito para convertir lo de
  antes.
- **`armasEnSuHueco` en cada lectura del borrador**: es barato y simplifica.

## Backlog (no en este ciclo)

- El pistolero montado lleva la lanza y no dispara: necesita su kit (`montado-pistola`).
- La IA de la arena mide la fuerza de un tirador por su arma cuerpo a cuerpo.
