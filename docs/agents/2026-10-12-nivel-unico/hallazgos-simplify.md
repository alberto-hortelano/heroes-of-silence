# Hallazgos de /simplify (consolidado por el coordinador, 12-10-2026)

Hay cuatro revisores: reutilización, simplificación, eficiencia y altitud. Los duplicados están fusionados y cada hallazgo lleva ya su decisión.

## Se aplican

1. **Una sola escala ×10** (lo señalan los cuatro).
   - Hoy hay seis cifras sueltas que «saben» que PV y daño van ×10:
     - `ai/fuerza.ts` `ESCALA_DE_LA_FUERZA = 100`, definida después de usarse;
     - `hero/equipo.ts` `PV_POR_PUNTO_DE_PIEZA = 10`;
     - `ai/tactics.ts` `VALOR_MINIMO_POR_MANA = 40`;
     - `rpg/stats.ts` `ESCALA_DEL_DANIO = 10`;
     - `rpg/character.ts` `maxHpFrom`, con un `10 *` literal;
     - los tests `reglas-de-batalla.test.ts:175` y `tools/qa/capturas.ts:2842`.
   - Cambio: una constante `ESCALA_DE_CIFRAS = 10` en `core/escala.ts`, el sitio de las escalas. Todas se derivan de ella:
     - `unitPower` divide por `ESCALA * ESCALA`;
     - el maná vale `4 * ESCALA`;
     - el personaje, sus PV y su daño, la usan.
2. **`valorDePieza` sin redondeo.** Se quita `Math.floor(p.pv / 10)` y se escalan los demás términos: `ESCALA·ataque + ESCALA·defensa + pv + 3·ESCALA·velocidad`. Sale el mismo orden, sin el caso especial y sin perder lo que no es múltiplo de 10.
3. **`isqrt` → `raizEntera`** (`core/escala.ts:37`), que ya existe, está probada y es de enteros. Se borran `isqrt`, su test y su nombre en la regex de `invariantes.test.ts`.
4. **Rama muerta de `UMBRALES`** (`nivel.ts:51-62, 103-107`): el caso «más allá del último umbral» no se alcanza nunca. La tabla se corta en lo alcanzable o se cambia por un bucle sin tabla. Lo que sea más corto.
5. **Arena: `filaDelNivel(lectura, rotulo = 'Nivel')`**, también desde `renderFichaDeHeroe`. Hoy copia el marcado y le falta la clase. Además, el docblock de `numero` vuelve a quedar sobre `numero` (`paneles.ts:651-657`).
6. **La lectura del nivel, una vez:**
   - `lecturaDelNivel` calcula el índice una vez y el nivel como ⌊i/100⌋, sin una segunda consulta.
   - `lecturaDelNivelDeLaHoja` no vuelve a validar una `UnidadDeArena` ya tipada: usa `unidadDeCombate` directamente.
7. **El héroe en el panel, una vez** (`client/views/panels.ts:277-294`): hoy se construye tres veces. Se construye `puesto` una vez, con `desnudo = puesto.sinEquipo ?? puesto` y `nivelDeUnidad(puesto)`. En `contract/serialize.ts:488`, lo mismo si sale más simple.
8. **`sinEquipo` no viaja al espectador.** El espectador no mide niveles, así que se quita al serializar el stack (`cifrasQueViajan` / `vista-espectador.ts`). Hay que comprobar que tampoco entra en el volcado del banco. Además, una línea en el comentario de `conEquipo`: el orden «veteranía antes que equipo» es lo que mantiene `sinEquipo` al día.
9. **Restos del nombre viejo:**
   - `town.ts:375`, en `buildBlocker`: el mensaje al jugador dice «las criaturas de nivel N» y debe decir «de la morada N». Ahora «nivel» es el derivado y ese mensaje miente.
   - Variables que son moradas o rangos y se siguen llamando nivel: `views/base.ts:62,89`, `state/setup.ts:359-360`, `tools/qa/veterania.ts` `nivelesDeHeroe` (guarda rangos).
   - El mensaje de error de campo desconocido de la arena no debe enseñar `level` como campo válido. Se lee para compatibilidad, pero se filtra de la lista que se muestra.
10. **Borradores y enlaces viejos de la arena, migrados de verdad.** Hoy un borrador con `level` se lee con PV y daño en la escala vieja y pelea a un décimo de su fuerza sin avisar.
    - La marca `level` es la señal para multiplicar `hp` y `damage` por `ESCALA_DE_CIFRAS` al leer.
    - Los enlaces `?montaje=` de versión ≤ 3 con cifras editadas se escalan igual, y la versión sube a 4.
    - Un test para cada caso.
11. **Tests frágiles por el equilibrio:**
    - `agent-link.test.ts:2242` (semilla 504 → 507): el escenario se hace independiente del resultado. Se quitan los héroes del rival y los asaltantes, o se le da a la base una guarnición intocable, para que pruebe el volver a preguntar y no el equilibrio. Lo mismo en las semillas vecinas del mismo `describe`, si dependen de ello.
    - `prevision.test.ts:304-321` (`conLaTiradaEn`): las dos puntas de la horquilla se comprueban de forma determinista con un rng «dado cargado» que devuelve el mínimo o el máximo en cada `int`, como fixture compartida. Las 40 semillas quedan solo para «cae dentro».
12. **Comentarios y documentos:**
    - CLAUDE.md, párrafo de experiencia: se contradice. Todavía da las medidas de la regla descartada (× nivel: 0,25 → 0,05, j0 558 → 515) como si fueran las de la regla vigente. Debe quedar solo la vigente (× índice, base 16 000) con sus medidas.
    - `panels.ts:406`: «180 de los 200» está en la escala vieja.
    - `docs/historia.md:4055` (base 20 → 200): aclarar que lo deja atrás la vuelta 2.
    - Las notas de cambios con fecha que se han metido en los docblocks («×10 desde el 12-10-2026» repetido, «se llamaba `level_up` hasta…», «hubo un `nivel` escrito por cinco constructores») se recortan a lo que dice el código hoy. La historia va a `docs/historia.md`.
13. **`test/nivel.test.ts`:** se quita el bucle que recalcula ⌊índice/100⌋ sobre el catálogo, porque ya lo implica la tabla exacta.

## Se descartan, con motivo

- **Quitar `UnitInfo.sinEquipo` y guardar el índice en el `BattleStack`** (simplificación 1). El revisor de altitud lo da por bien situado: hay cuatro caminos de origen, un único escritor y un guardia. Cambiarlo ahora es rehacer el diseño aprobado. Solo se aplica el punto 8.
- **Quitar la caché `INDICE_POR_CIFRAS`.** Eficiencia confirma que las claves son estables en los caminos calientes y que acierta. Es barata y débil (no retiene nada). Se queda.
- **Peso de la defensa en `poderBruto`** (altitud 3: `10 + defensa` frente al −2,5 %/punto de `damageMultiplier`). No es un error de copia. En la regla, la defensa vale 10 %/punto mientras el atacante la supera (le quita su bono) y 2,5 % solo por encima. Con el catálogo, los dos tramos pesan. Derivarlo cambiaría la tabla calibrada, la experiencia y el banco que el usuario acaba de ver. Lo que sí se aplica: el comentario de `nivel.ts` y el `_comment` de `data/poder.json` declaran el peso como **regla nuestra e inventada**, no como «el de la fórmula de daño».
- **`level` y `powerIndex` a la vez en el contrato:** lo piden los requisitos (criterio 8).
- **Renombrar `Building.dwellingLevel` / `upgradesLevel`** (20 usos): está fuera del diff. Basta con el mensaje del punto 9.
- **`Character.level` (rpg) → rango:** va a issue, como ya propuso el arquitecto. Está fuera de alcance.
- **El suelo de daño `max(1, …)`:** es «al menos 1 PV» a propósito. Se cita en `docs/historia.md`.
- **`criaturaBaseDeMorada` frente a `creatureDeMorada`** (mezcla de idiomas): es menor.
