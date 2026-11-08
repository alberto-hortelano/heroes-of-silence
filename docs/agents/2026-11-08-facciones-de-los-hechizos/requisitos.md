# Requisitos — las facciones de cada hechizo

## Petición literal

> «Añade al editor de magia que cada hechizo pueda pertenecer a una o varias facciones»

(La pidió el usuario en otra sesión, que la delega aquí con este encargo: «Añade al editor de
magia de la arena que cada hechizo pueda pertenecer a una o varias facciones (templarios, no
muertos, imperio, elfos, orkos)».)

## Criterios de aceptación

1. Cada hechizo de `data/hechizos.json` lleva un campo con sus facciones (una o varias), con los
   ids de `FACTION_IDS` (`src/core/types.ts`).
2. `problemasDelHechizo` (`src/core/magia/validar.ts`) rechaza, diciendo el motivo y dónde:
   a. una facción que no existe (la frase nombra las que valen);
   b. una facción repetida;
   c. la lista vacía;
   d. que el campo falte o no sea una lista (no hay compatibilidad hacia atrás: un hechizo sin
      facciones se rechaza diciéndolo).
   Las facciones válidas salen de `FACTION_IDS` / `esFaccion`, no de una lista copiada.
3. En el editor de magia de la arena (`montarEditorDeMagia`, `src/client/arena/magia.ts`) se
   marcan y desmarcan las facciones de cada hechizo; quitar la última se ve como problema (o no
   se deja) y «Guardar» escribe las facciones en `data/hechizos.json` (`tools/arena/borrador.ts`).
4. Un hechizo nuevo creado en el editor nace con una facción válida (no nace roto).
5. Tests de la validación (los cuatro rechazos y un caso válido con varias facciones).
6. Lo que lleva los hechizos fuera del editor sigue funcionando con el campo nuevo: el enlace
   de la arena (`hechizosDelMontaje`), el retoque a media pelea y lo que el núcleo lea del formato.
7. `pnpm typecheck` y `pnpm lint` limpios; los tests de lo tocado, por partes.
8. El editor comprobado en el navegador con Playwright (marcar, desmarcar, guardar, recargar y
   verlo guardado; el problema de la lista vacía visible).

## Fuera de alcance

- **Ninguna regla del juego lee todavía el campo**: ni qué hechizos aprende un héroe, ni qué
  enseña el gremio de cada facción, ni la IA, ni el contrato del agente. Si el crítico o el
  arquitecto ven que alguna debería, se pregunta al usuario, no se supone.
- El equilibrio de qué hechizo es de quién: las facciones que se pongan a los hechizos de hoy son
  a ojo (todas las facciones, salvo que haya un motivo claro, p. ej. un poder de una unidad).

## Contexto

- No se prueba la jugabilidad; no hay compatibilidad hacia atrás; tests por partes, nunca
  `pnpm verify` entero; la máquina es compartida (no se mata por patrón).
- Docs: `docs/areas/batalla.md` (la magia) y `docs/areas/arena.md` (el editor de magia).
  El editor nació en `docs/agents/2026-11-06-editor-de-magia/`.
- El usuario no abre nada en los worktrees: al cerrar se levanta la arena en un puerto libre y se
  le pasa la URL.

## Preguntas abiertas (con su suposición)

- ¿Nombre del campo? Suposición: `facciones: FactionId[]`, obligatorio.
- ¿Qué facciones llevan los hechizos de hoy? Suposición: todas, salvo que el crítico encuentre un
  motivo (poderes de unidad de una facción concreta).
- ¿Lista vacía = «de ninguna» o error? Suposición: error (lo pide el encargo).

## Correcciones tras la crítica (VIGENTE)

- 9. El enlace de la arena lleva los hechizos enteros: `VERSION_DEL_ENLACE` sube de 21 a 22
  (`src/core/arena/enlace.ts`), para que un enlace viejo falle con el mensaje de versión.
- 10. `copiaDe` conserva las facciones; `hechizoNuevo` nace con facción (`src/core/magia/editar.ts`).
- 11. Al día: `_comment` de `data/hechizos.json`, `docs/areas/batalla.md` (la magia) y
  `docs/areas/arena.md` (el editor de magia).
- Facciones de hoy (a ojo, dicho en el `_comment`): `curar` → `["templarios"]` (el poder del
  `templario-monje`); `zombi_pegajoso` → `["no-muertos"]` (decisión del usuario); los demás, las cinco.

## Respuestas del usuario (08-11-2026, por la sesión de origen, elegidas en su diálogo)

Esto **amplía el alcance** y anula el «ninguna regla lee el campo» de «Fuera de alcance»:

- 12. **Gremio por facción** («Sí, por facción»): el gremio de cada ciudad enseña solo los hechizos
  de la facción de esa ciudad (`Town.faction`; hoy `townSpells`/`hechizosDelGremio` enseñan solo por
  nivel). Cambia las partidas: `pnpm banco` moverá su hash; se re-ancla en
  `tools/qa/medidas/banco.ts` y se juzga la forma del diff (`docs/banco.md`), anotándolo en el
  historial de anclas.
- 13. **Poderes de unidad** («Sí, se rechaza»): la carga del catálogo rechaza, diciendo el motivo,
  una unidad cuyo poder sea un hechizo que no es de la facción de esa unidad.
- 14. `zombi_pegajoso` es solo de los no muertos («Solo no muertos»).
- Decidir en el plan: qué pasa con el héroe de la arena, que hoy aprende el gremio entero
  (`src/core/arena/heroe.ts`), y con cualquier otro lector de `hechizosDelGremio`.
