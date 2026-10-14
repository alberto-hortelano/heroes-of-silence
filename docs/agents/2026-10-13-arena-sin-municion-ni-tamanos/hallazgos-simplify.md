# Hallazgos de /simplify — arena sin munición, tamaños ni catálogo (14-10-2026)

Dos revisores: reutilización y simplificación, y eficiencia y altitud. En eficiencia no hay nada
que tocar. Los hallazgos están deduplicados y cada uno lleva la decisión del coordinador. No
debe cambiar el comportamiento, ni el hash de `pnpm banco`.

## Se aplican

### La munición, en un solo sitio

1. **`tirosQueQuedan(s): number | null`** en `data.ts`: `null` cuando los tiros no se cuentan.
   - Es la única lectura de `shotsLeft` fuera de `battle.ts`. La leen:
     - el `↑N` del tablero (`render/batalla.ts:1712-1717`);
     - la fila «Munición» (`views/panels.ts:761`);
     - `contract/serialize.ts:759-760`.
   - Hoy el tablero y el panel hacen dos combinaciones distintas de predicados para el mismo
     hecho, y `serialize` mandaría `shooter: true, shotsLeft: 0` para un arquero de la arena.
   - El contrato del agente no cambia para el juego (`pnpm qa`).
   - El guardia pasa a ser «`shotsLeft` solo en `data.ts` y `battle.ts`», no solo la comparación
     con 0, y se le ve morder.
2. **`cuentaTiros = (c.shots ?? 0) > 0`**, la misma lectura que `isShooter`, no «existe el
   campo».
   - Un guardia nuevo: nada lleva a la vez `shots` y `equipo.distancia`.
   - La decisión «la munición es de la criatura del catálogo; con un arma a distancia no se
     cuenta» queda escrita en `docs/historia.md`, con lo que se descartó y por qué (un
     interruptor en `reglas`), para que no parezca un accidente.
3. **El nivel no ve el equipo**: `nivel.ts` pregunta si tira el cuerpo (`(u.shots ?? 0) > 0`,
   p. ej. `tiraElCuerpo`), no `isShooter`, que mira también el equipo.
4. `disparoBlocker` (`battle.ts:1054`): `isShooter` una vez, y la frase de «sin munición» atada a
   `cuentaTiros`.

### Lo de antes, sin booleanos ni copias

5. **La versión, en vez de `armasEnArma`** (`true` por defecto, en cuatro firmas, y con dos
   significados en `sinLoDeAntes`).
   - Se pasa obligatoria la versión de lo que se lee (`'borrador'` o el número del enlace).
   - Se compara con los umbrales con nombre (`CON_ARMAS`, `SOLO_LA_ARENA`) en un solo sitio.
   - Lo mismo para el `perfilDe === null` de dos significados.
6. **`migrarUnidades(crudas, …) → { unidades, retiradas, avisos }`**: lo usan
   `revisarBorradorDeArena` (`arena.ts:1630`) y `montajeDeLaURL` (`:2828`).
   - `UnidadMigrada` trae el id de la retirada.
7. **Avisos**:
   - un `enumerar(lista)` compartido para «a, b y c», que hoy está tres veces (`arena.ts:1345`,
     `:1540`, `state/game.ts:1997`);
   - `piezaDeAntes` usa `juntar`;
   - «nombre o id» en una función, en lugar de las cinco copias.
8. **`CAMPOS_DEL_ENLACE_7`** se deriva de `CAMPOS_DEL_ENLACE`.

### Restos del catálogo

9. **Fuera los discriminantes de una sola variante**:
   - `FuenteDeArena.kind` (`arena.ts:1823`) y `FuenteDePuesto.kind` (`paneles.ts:120`);
   - `Puesto.fuente` puede ser `unidad: string`.

   Se ajustan sus usos, también en `capturas.ts` y los tests.
10. **Accesos sin envoltorio**:
    - fuera `idDeLaFuente`;
    - `figuraDeLaUnidad`: una sola forma, o se usa la función o el campo, no las dos.
11. **Datos que no informan**:
    - fuera `DatosDePuesto.sello`, que siempre vale `'borrador'`, con su `<span class="sello">`;
    - `CuerposDeLaNueva` pasa a ser la lista directamente;
    - el `opcion()` de un solo uso va en línea;
    - `partirClave` deja de exportarse;
    - `avisoDeLaMunicion` y `piezaDeAntes` dejan de exportarse si nadie de fuera los usa.
12. **`stackDeLaFuente`** (`arena.ts:2024`) valida una sola vez.
13. **`capturas.ts`: lo que no muerde**.
    - Fuera el respaldo muerto de `data-criatura` (`:4465`).
    - Los guardias que buscan `[data-faccion="catalogo"]` o `[data-criatura-catalogo]`
      (`:3664`, `:4164`) apuntan a selectores que ya nadie genera. Se cambian por una
      comprobación que sí pueda fallar (por ejemplo, ningún botón ni opción con «Catálogo del
      juego», ni ninguna criatura del catálogo entre las unidades de la lista), o se quitan si
      ya lo cubre un test.
14. **La regla de lápida de `disparos`** en `problemasDePieza` (`data.ts:832`) se quita. En la
    arena nunca salta: antes rechaza `CAMPOS_DE_PIEZA`.
15. **`gastadoDeMas`** pasa a `number`, plano como `manaGastadoDeMas`.
16. **`.aviso-prueba`** se llama ahora por lo que avisa: «sin guardar» y el enlace.

### Tests

17. **La C4 de `arena.test.ts:1279`** reutiliza `peleaDelMotor` (con héroe, si hace falta). Si ya
    no prueba nada que no pruebe otro test, se dice en `implementacion.md`.
18. **`importaCreature(codigo, nombres)`**: una sola expresión regular para los dos guardias de
    importación (`invariantes.test.ts:443` y `:1294`).

## Se descartan, con motivo

- **Eficiencia**: `quedanTiros` es O(1) y el banco no se mueve.
- **`shotsLeft: number | null` en `BattleStack`**: cuesta más que `tirosQueQuedan` y cubre lo
  mismo para quien lee.

## Backlog

- Renombrar lo que la lista de la arena sigue llamando «catálogo» (`#catalogo`,
  `renderCatalogo`, `ModoDelCatalogo`, `data-unidad-catalogo`).
- La unidad grande con muralla, como código muerto.
