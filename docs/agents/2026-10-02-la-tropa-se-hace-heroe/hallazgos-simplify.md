# Hallazgos de /simplify de «la tropa se hace héroe» — decididos por el coordinador

Cuatro revisores: reutilización (R), simplificación (S), eficiencia (E) y
altitud (A). Nada de esto cambia reglas: el ancla `0c8fc759…` tiene que seguir
igual tras cada bloque, y `pnpm qa` y `pnpm capturas` en verde al final.

## Se aplican

1. **Una sola localización del veterano** (A2, S1, E1, R4, A9, S8).
   - Una función interna de `game.ts` devuelve `{ base, v } | { motivo }`.
   - `ascensoBlocker` la usa y devuelve solo la frase. `ascenderVeterano` usa el
     resultado sin volver a buscar.
   - Desaparecen la rama `v === null`, que no se alcanza, y la tercera búsqueda
     de la base en `serializeHeroFromTroop`.
   - `ascenderVeterano` devuelve también la base, o el director lee el nombre a
     partir del héroe nacido. Fuera el `?? 'tu base'`.
2. **El tope de héroes, escrito una vez** (A1, S3, R2).
   - `ascensoPosible(state, player, veteranoId)`, sin tipo, comprueba la base,
     el nivel y el hueco de héroe.
   - El hueco sale de un `hayHuecoDeHeroe(state, player)` que leen también
     `hireHero` y el director.
   - El director no importa ni `MAX_HEROES_PER_PLAYER` ni `heroesOf` para esto.
3. **El bucle del director itera sobre los `VeteranoEnBase`** que devuelve
   `porPreguntar`, sin volver a buscarlos (S7, E2). Fuera el `continue` que no se
   alcanza.
   - Si `enBase` llega vacío, se borra la entrada del jugador y se sale sin
     asignar nada (E3).
4. **La comprobación de id de héroe duplicado sale** (S2): no se alcanza.
5. **El «nivel 5» de la prosa se interpola** desde `NIVEL_MAXIMO_DE_TROPA`, en los
   cuatro sitios que lo escriben a mano (A3).
6. **`heroeRecienHecho`**:
   - Lo usan también los héroes iniciales de `setup.ts`, con sobrescritura de lo
     que difiera, para que haya una sola construcción de héroe (A4).
   - Fuera la desestructuración de `origen` (S4).
7. **`OrigenDelHeroe`**:
   - Se queda con `historia` y `creature`, que puede pintarse.
   - Fuera `veterano`, que se deriva del id (S5).
8. **`VeteranoEnBase.donde`** pasa a `heroe: string | null` (S6), o a la forma
   mínima equivalente.
9. **Nombres por capa**:
   - `VistaHeroe.tipo` pasa a `nombreDelTipo` (A6).
   - `tipoDeHeroePorDefecto` devuelve el id (S11).
   - `OpcionesDePartida = Pick<DirectorOptions, 'preparar'>` (S12).
10. **`enSuLugar` desaparece**: se usa la tabla directamente y se corrige su
    docstring (A7, S9).
11. **Facciones y extractor**:
    - `tablaDeGuarniciones` lee `FACCIONES` (R1).
    - `tools/datos/tipos-de-heroe.ts` importa el tipo `TipoDeHeroe` de `data.ts` y
      deja la comprobación de repetidos a `validarTiposDeHeroe` (S10).
12. **`heroeEnElPueblo(state, town)`**: una sola regla de «el héroe del dueño en
    su pueblo», que leen `veteranosEn` y `destinoDeRecluta` (R3).
    - Si ponerla en `ascenso.ts` vuelve a crear un ciclo de imports, `veteranosEn`
      recibe el héroe ya resuelto.
13. **QA más barato**:
    - `verify-agent.ts` lee el héroe nacido del `adventure_turn` siguiente, que
      ya trae `type` y `story`, y no sondea `game_state` con `sleep` (E4).
      Mantiene la consulta `game_state` una sola vez para cruzar las dos puertas.
    - `capturas.ts` no bloquea el manejador del agente con `waitForFunction`: lo
      lanza y lo espera al final (E5).

## Se descartan, con motivo

- **E6, la historia en cada fotograma del espectador:** ocupa unos 300 B hoy, y
  se decidió no mandar deltas.
- **R5, un `tools/datos/cuaderno.ts` común:** con dos extractores, la forma
  compartida no compensa el módulo. Se revisa cuando entre el tercero (#127).
- **R6, que el veterano llegue con dos formas al agente:** la petición lleva la
  hoja de servicios y `armyView` no. Solo se añade `nextLevelAt` si sale gratis
  compartiendo `troopSummary`.
- **R7, sacar el filtro por id a `troop.ts`:** hoy solo tiene un lector.
- **A5, un contador de ids de héroe:** es #126 y va aparte, porque mueve el ancla.
- **A8, `preparar` en `DirectorOptions`:** el revisor lo considera de coste bajo y
  bien cerrado. Se queda.
