# Hallazgos de QA (vuelta 1, fase A), deduplicados y decididos

Fuente: `qa.md`. Se arregla todo salvo lo de «Se deja».

## Se arregla

- **H1 (importante): la espera da por bueno un «vale» que no dijo el validador.**
  `respuestaDelValidador` (`tools/mundo/motor.ts`) toma por respuesta del validador cualquier
  `tool_result` que contenga «el mundo "…" vale», y la skill lleva esa frase en su paso 5: si el
  motor lee `SKILL.md`, la espera dice «la historia vale» con la biblia corta. Arreglo de raíz: se
  reconoce solo el `tool_result` cuyo `tool_use_id` es el de una llamada a `pnpm mundo validar <id>`
  (`esSuValidacion` ya la detecta: que devuelva o recuerde su id, y el lector de la salida guarde
  los ids pendientes en la `Generacion`). Test con un `Read` de `SKILL.md` que trae la frase y no
  cuenta, y con la respuesta de la validación de verdad que sí.
- **H2 (importante para la fase B): `borrarSinHistoria` tira la biblia** si el motor muere antes
  de escribir la historia. Una biblia son minutos de Opus: si hay `biblia.md`, la carpeta se queda
  (con su motivo en la espera: «queda la biblia para mirarla»); solo se borra la carpeta sin
  historia ni biblia. Ajustar el nombre si deja de decir lo que hace. Test.
- **H3: la espera habla de «la historia» cuando falla la biblia.** «la historia aún no vale», «el
  motor acabó, pero su historia no vale» y «Comprobando la historia» pasan a decir «el mundo»
  (biblia e historia). Buscar todas las frases de la espera y del progreso
  (`src/client/desarrollo/`, `tools/mundo/motor.ts`) y sus tests.
- **H4: `biblia.md` que es un directorio da un `EISDIR` crudo con ruta absoluta.** Que salga
  «biblia.md: no es un fichero» (o la frase de la tabla de ficheros), y lo mismo para los JSON si
  pasa igual. Sin rutas absolutas.
- **H5: la skill pide «tres niveles de hondo» y `medir` cuenta aristas.** `pnpm mundo medir`
  cuenta **niveles** (nodos del camino más largo desde el inicio, el inicio es el nivel 1), que es
  como lo dice la skill; renombrar el campo y la línea de `describirMedida` en consonancia.
  Corregir en `plan.md` el umbral de la fase B si lo cita.
- **H6: `prueba` usa el `ya` en segunda persona** («ya pagaste el peaje») y es el ejemplo de
  formato que la skill manda leer, contra la regla «el mundo es de los dos». Reescribir los `ya`
  (y los `falta` si hablan de «tú» de forma que no valga para los dos) de `prueba/historia.json`
  en neutro, describiendo el mundo; ajustar su `biblia.md` si los cita y los tests que comparen
  esas frases. Mirar también `ejemplo` (se regenera en la fase B, pero hoy es un mundo del repo).
- **H9: a 390 px el panel de la espera se sale por la derecha** (el título no parte la línea), en
  los cinco temas. Es de antes, pero está en la pantalla que esta tarea cambia: que el título
  parta y el panel quepa en 390 px. Comprobar con Playwright sin pantalla en otro puerto.

## Se deja

- **H7: 400 «#» pasan el mínimo de la biblia.** Por diseño: el mínimo caza la biblia ausente o
  esbozada; la calidad la mira quien lee (y el QA de la fase B).
- **H8: `pnpm mundo leer` no lee un plan de un tamaño fuera del menú.** Lo dice claro y solo
  afecta a mundos montados a mano; `pedidoBlocker` impide crearlos desde el menú.
