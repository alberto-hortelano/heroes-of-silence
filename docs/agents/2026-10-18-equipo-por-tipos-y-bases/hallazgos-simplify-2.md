# Hallazgos de /simplify sobre la vuelta 2 (consolidados y decididos por el coordinador, 18-10-2026)

Dos revisores (reutilización y simplificación; eficiencia y altitud) sobre el diff sin commitear.
Ninguno cambia lo pedido: si al aplicar alguno ves que lo cambiaría, no lo apliques y dilo.

## Se aplican

1. **La Espada manda sobre lo que nace.** `NIVEL_DE_UNA_NUEVA`/`NIVELES_DE_UNA_NUEVA`
   (`cifras-de-la-rueda.ts`) repiten la Espada de `data/equipo.json`; si se retoca la Espada, las
   nuevas y los tests «con la Espada» mienten. Que `piezaNueva` y `enElHueco` tomen los niveles de la
   Espada del fichero (`ESPADA_DE_LA_ARENA`, en `core/arena.ts`), sin constante aparte, y que los
   tests (`armas.test.ts` `CON_LA_ESPADA`, `rueda.test.ts`, `arena-equipo.test.ts` `todoA3`,
   `arena.test.ts` ~2254) lean la Espada real. El usuario pidió «todo a 3, como la Espada»: es la
   Espada.
2. **Un solo predicado «golpea en la rueda»** junto a `problemasDePieza` (p. ej. `golpeaEnLaRueda(p)`:
   calidad `arena` y hueco con rueda), que lean la regla de la pieza y `armaDeCuerpoBlocker` (que hoy
   deduce «es del juego» de que falte la rueda). El `throw` de `ruedaDelGolpe` se queda como red.
   Y un test que pase `armaDeCuerpoBlocker` sobre el equipo del héroe de la arena
   (`EQUIPO_DEL_HEROE_EN_LA_ARENA`).
3. **Cada frase de la rueda, una vez**: «Normal no tiene nivel: siempre ×1» y «X no es un tipo del
   anillo; valen …» (hoy en `problemasDeNiveles` y en `problemasDeRueda` de `data.ts`), y el «el nivel
   de X es N: va de 0 a 6» de `delNivel` (que lance con `problemasDeNiveles(…)[0]`). Lo que dice
   Normal en la ficha (`NORMAL_EN_LA_FICHA`, `disco.ts`) lo da el núcleo (con `SIN_MODIFICAR` o una
   ficha de Normal exportada).
4. **`TipoEnLaFicha` = `Pick<FilaDeLaRueda, …>`** (o que `ruedaDeLaPieza` reciba las filas), sin el
   remapeo de `tablaDeLaRueda`.
5. **`ANILLO`**: reexportado (`export { TIPOS_DEL_ANILLO as ANILLO }`) en vez de alias, y
   `anguloDe`/`sector` reciben `TipoDelAnillo`: fuera el cast de `disco.ts` y el `throw`.
6. **Una escala de tonos por nivel en el CSS** (`arena.css` ~559-588): una variable por
   `[data-nivel="n"]` que lean la barra, el sector del disco y el `.final`, sin los `:is(...)` que
   repiten «0-2 peor, 3 neutro, 4-6 mejor»; un comentario que la ate a `NIVEL_MAXIMO`.
7. **`barraDelNivel` sin su tope 0..6** (`paneles.ts` ~1858): `delNivel` ya lanza antes; el tope es
   código muerto. Los `disabled` de «−»/«+» se quedan.
8. **Lo que ya no pasa en la arena**: el camino «sin arma pega con el cuerpo» queda para el juego. En
   `CLAUDE.md` (la frase «sin ella, con el cuerpo» del equipo de la arena) y en `armas.test.ts` (el
   caso «sin arma de cuerpo a cuerpo pega con el cuerpo»), dilo como lo que es: el respaldo del juego
   (sin `armas`), no de la arena; si el test monta una unidad de la arena sin arma, que compruebe que
   no se monta.
9. **Documentación**: `CLAUDE.md` fila «La regla de una pieza» todavía nombra `ruedaDelArmaBlocker`
   (ya no existe): la rueda completa del arma (`problemasDeNiveles`). En `core/arena.ts` ~1716, la
   constante `EQUIPO_DEL_HEROE_EN_LA_ARENA` va con su doc por encima del de `heroeDeArena`.
10. **Tests e invariantes**: en `invariantes.test.ts`, el bucle de `resolverBases` (~2078) usa el
    `fueraDe` del mismo `it`. En `tools/qa/capturas.ts` ~4696-4715, `finta()` y el localizador de
    Fuerte salen de `deLaMaza`. El todo-a-0 de `arena-equipo.test.ts` ~592, con un `todoA(n)` en
    `helpers.ts` sobre `TIPOS_DEL_ANILLO`.

## Se descartan, a conciencia

- **Caché de `cifrasDeLosNiveles`** (`WeakMap`): una vez por golpe, dos registros de cinco; no hay
  coste medible.
- **`MANOS_DE_PRUEBA`/`conManosDePrueba`** (25 usos en 5 ficheros, criaturas del juego con un arma de
  prueba en peleas con rueda): es un estado que la arena no monta, pero rehacer esos tests con
  `unidadDeArena` cambia su aritmética escrita a mano. Queda como deuda, dicha en implementacion-2.md.

## Cómo cerrar

Tras aplicar: `pnpm verify`; `pnpm banco` (mismo hash) solo si tocas algo del núcleo que el juego lea;
`CAPTURAS_SOLO=equipo,rueda-del-golpe pnpm capturas` (por el CSS y el disco). Apunta en
implementacion-2.md (sección «Tras /simplify») lo aplicado, lo no aplicado y la verificación.
