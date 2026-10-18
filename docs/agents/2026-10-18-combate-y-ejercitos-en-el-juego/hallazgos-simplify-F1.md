# Hallazgos de /simplify sobre F1 (consolidados por el coordinador, 18-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff sin commitear
de F1. Deduplicados; cada uno con la decisión tomada. Se aplican **dentro de F1**, antes del commit.

## Se aplican

1. **El formato de la unidad sale de `arena.ts`** (altitud 3, eficiencia 6, reutilización 6,
   simplificación 5 y 10). `UnidadDeArena`, `validarUnidadDeArena`, el validador del catálogo
   entero, `CUERPO_COMUN`, `KIT_DEL_PERFIL`, `RUTA_DEL_CATALOGO_DE_UNIDADES` y lo que necesiten van a
   un módulo sin batalla (p. ej. `core/unidad.ts`, o dentro de `core/catalogo.ts` con la validación
   separada de la carga). `arena.ts` importa de ahí; `catalogo.ts` deja de importar `arena.ts` y se
   quita la excepción del guardia de `invariantes.test.ts` (visto morder). Una sola función valida el
   catálogo (la usan `core/catalogo.ts` y `tools/arena/borrador.ts`) y **nombra el fichero en su
   propio mensaje**: fuera los dos try/catch que anteponen el nombre. Quien importe
   `RUTA_DEL_CATALOGO_DE_UNIDADES` la importa de su origen (fuera la re-exportación de `borrador.ts`).
2. **Sin ciclo `nivel` ↔ `battle`** (altitud 4). Las lecturas puras de una `UnitInfo` que usa el
   índice (`golpeDe`, `cifrasDelGolpe`, `armaduraDe`, `trasLaArmadura`, `ruedaDelGolpe`, `golpesDe`,
   lo de la carga…) se sirven desde un módulo hoja que no importe `nivel.ts` (p. ej.
   `battle/armas.ts`), o se rompe el ciclo de otra forma equivalente; `nivel.ts` no debe quedar en un
   ciclo de importación.
3. **El índice pasa por las puertas únicas** (reutilización 1-5, simplificación 8, eficiencia 1-2):
   la resta de armadura con `trasLaArmadura`; el tanto por ciento de la carga con
   `porcientoDeLaCarga`/`cargaEfectiva`; ataque y daño de cada uso con `cifrasDelGolpe`; los golpes
   y el factor de cada tipo con `golpesDe` y `factorDe` (exportado, en enteros); y un helper nuevo
   de tiros por disparo (`disparosDe` o similar) que usen también `shoot` y la previsión de
   `battle.ts` (fuera las tres copias de `double_shot ? 2 : 1`). Una sola medida privada
   (`{ ofensa, aguante } | motivo`) que comparten `medidaBlocker` y `poderBruto`, y un solo
   `golpeDe` por medida.
4. **Pesos propios de la medida** (altitud 2): el índice no lee `PESOS_DE_LA_RUEDA` de la IA. Pesos
   de la medida en `data/poder.json`, declarados inventados; con los mismos valores que hoy para no
   mover el índice por esto.
5. **La carga se mide con la regla final y compone con la rueda** (altitud 1). El índice mide como
   pelearán las unidades desde F4: con la carga a pie (sin el `false` transitorio), y el término de
   carga es rueda × carga (Fuerte y Rápido actúan en el primer golpe), no la carga sola. Así F4 no
   vuelve a mover índices, experiencia ni lo que F3 derive del índice. Se mide de nuevo el rango de
   índices y niveles de las 34 y se escribe.
6. **R = 30**: se queda escrita, pero el comentario de `data/poder.json` dice que es inventada (no
   «el golpe medio de la Espada»).
7. **Una sola fuente de cifras por unidad** (simplificación 1-2, altitud 7). La página de la arena,
   `unidadDeArena()` de `test/helpers.ts`, `tools/qa/capturas.ts` y `tools/qa/arena-ia.ts` leen la
   unidad del catálogo; `unidadPorDefecto` queda solo dentro de `unidadNueva`. Fuera
   `sinBorradorDeUnidades`, la rama «Guardar lo crea» de `avisoDelBorradorLeido` y el espejo de
   cifras por defecto de `capturas.ts`. **`pnpm capturas` deja de apartar `data/unidades.json`**
   (`sinElBorrador`): en una máquina compartida, apartarlo rompe todo lo que importe el catálogo en
   otra sesión.
8. **Una validación al guardar** (altitud 6, simplificación 3, eficiencia 5): «Guardar» valida
   una vez, con la misma regla que la carga del catálogo (las piezas de `data/equipo.json`); fuera
   el envoltorio. El rechazo de piezas que solo están en el borrador de equipo se mantiene (lo
   resuelve F2), pero sale de esa única validación.
9. **La arena construida lee el catálogo del núcleo** (simplificación 4, reutilización 7,
   eficiencia 7): en la rama sin servidor, `UNIDADES` de `core/catalogo.ts` (con un `import()` si
   hace falta para que un catálogo roto se diga y no tumbe la página); el `emitFile` de unidades de
   `vite.config.ts` vuelve a lo de antes y no relee el borrador de equipo; fuera el bucle duplicado.
10. **Nombres del hecho nuevo** (altitud 8, simplificación 6): lo de unidades deja de llamarse
    borrador (`leerCatalogo`, `validarCatalogo…`, el `Map` de `main.ts`, los mensajes «dos veces en
    el borrador», `cuerpo.ruta ?? 'el borrador'`, JSDoc). «Borrador» queda solo para equipo y
    murallas. Los tests que fijan el texto se actualizan.
11. **El rango de niveles, en un sitio** (simplificación 7): la cifra vive en
    `TABLA_DEL_CATALOGO` (o donde el test la fije); `data/poder.json`, `arena.ts` y `nivel.ts`
    apuntan a ella sin repetirla. Fuera la aserción redundante `[2, 3, 4]`.

## Se aplazan (con motivo)

- **`UnitInfo.sinEquipo`** (altitud 5): se queda en F1 porque tiene tres lectores vivos. Se
  apunta en `plan.md` («Para las fases siguientes» de implementacion.md) que F3 lo borra, derivando
  «lo que suma el equipo» de `UnitInfo.equipo` con `modificadoresDePieza`.

## Se descartan (a conciencia)

- **`POR_ID`/`unidad()` sin uso en producción** (simplificación 9): sigue el patrón de
  `EQUIPO_POR_ID`; F3 la usa. Se queda.
- **Cota barata en `opcionesDelHueco`** (eficiencia 3) y **memorizar `heroUnit`** (eficiencia 4):
  del orden de 100 µs por repintado y 1 µs por lectura; imperceptible, no es regresión.
- **Reformateo de `razon` en `data/poder.json`**: ruido; se deja como salga al editar el fichero.
