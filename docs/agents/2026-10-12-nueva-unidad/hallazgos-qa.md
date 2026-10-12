# Hallazgos de QA para corregir (coordinador, 12-10-2026)

Fuente: `qa.md` (apto con reservas). El banco tiene que seguir idéntico (`066767b4…`).

## Se corrigen

1. **H1: una unidad nueva no pisa una del borrador que no vale.** `crearUnidad` (`client/arena/main.ts`)
   elige el id libre entre `borrador.keys()` y las hojas, sin las unidades que no validan; al guardar, la
   nueva sustituye a la inválida sin aviso. El id libre se elige entre **todos** los ids del borrador,
   también los que no validan (mejor si la regla del id libre vive en el núcleo, junto a `unidadNueva`, y
   recibe la lista entera). Test que muerda con la reproducción de `qa.md`: borrador con
   `templario-mandoble-2` inválida → la nueva sale `templario-mandoble-3` y al guardar siguen las dos
   («Y 1 que no vale»).
2. **H2: el aviso de una conversión que no cabe habla de lo que escribió quien juega.** Hoy dice «el daño
   mínimo (15) no puede pasar del máximo (10)», cifras del cuerpo calculado. Debe decir qué cifra suya no
   cabe en el equipo de su perfil (p. ej. «su daño 45–70 es más estrecho que el del Mandoble (+35–+60)…
   se queda con sus cifras, sin equipo»). La regla de conversión no cambia: sigue quedándose con sus
   cifras y sin equipo.
3. **H4: una unidad nueva desde una criatura conserva los rasgos del motor de esa criatura** (vuela, no
   muerto, carga, doble ataque…), como cuerpo que son: no son equipo. El índice los cuenta como siempre
   (`indiceDePoder`). Test: una nueva con cuerpo de dragón óseo vuela.
4. **H5: un rechazo en el editor de la pelea no deja en la barra «Cambiado: vale ya en esta pelea.».** La
   barra dice el rechazo (o nada), no el éxito.
5. **Textos de la barra:** al crear en la vista de edición no dice «añádela a un bando» (allí no hay
   bandos); en el montaje, sí.
6. **H3, aviso en el selector:** las criaturas del catálogo en el selector «Nueva unidad» se rotulan como
   que salen con el maniquí (p. ej. el grupo «Criaturas del catálogo (maniquí)»). No cambia cómo se pintan.

## No se corrige (backlog o aceptado)

- **Borrar desde la página una unidad nueva creada por error**: funcionalidad nueva, va a issue.
- **El motivo dice «Escudo» y no `shield`**: es lo decidido en `/simplify` (el veredicto ya empieza por
  «unequip shield»).

## Segunda vuelta (re-verificación, 12-10-2026)

Decisiones del usuario en `requisitos.md` («Tras la re-verificación de QA»).

1. **R1: el nivel de una nueva, del índice.** La barra de `crearUnidad` deriva el nivel (y el índice) de la unidad creada, sin «nivel 1» escrito. Se acepta que una nueva de criatura nazca en el 2.
2. **R2: un rasgo de tiro sin tiros no cuenta para el índice.** `double_shot` (y cualquier multiplicador de tiro) solo pesa en `indiceDePoder` si la unidad dispara (`shots > 0`), en `core/nivel.ts`, que es la regla. Comprobar que la tabla del catálogo de `test/nivel.test.ts` no se mueve y el banco sigue idéntico; si algo se mueve, parar y decirlo. Test: el Montaraz nuevo sin tiros no sube por el disparo doble.
3. **Tamaño:** una unidad nueva con cuerpo de criatura hereda su tamaño (casillas que ocupa), y el índice lo cuenta como en el catálogo. Test con el dragón óseo: dos casillas, en el montaje y en la pelea.
4. **R3: el aviso de conversión nombra todas las cifras que no caben**, no solo la primera, y en un borrador de la escala de fheroes2 (con `level`) enseña las cifras tal como las escribió quien juega (vida 9, no 90).
5. **R4: la barra no dice «Sin borrador guardado todavía» si hay un borrador con unidades que no valen**: dice que se leyó y que ninguna vale (con sus motivos, como ya hace).
