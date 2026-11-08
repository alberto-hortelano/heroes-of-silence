**VIGENTE** — con dos precisiones al criterio 6 (versión del enlace y `copiaDe`) y tres preguntas para el usuario que no bloquean.

## El problema real, en una frase

Un hechizo no dice de qué facción es, así que no hay dónde apoyar después «qué enseña el gremio de
cada facción» ni «qué poderes son de quién»; la tarea pone el dato y su editor, y lo ataca bien.
Es un dato sin lector (deuda declarada en «Fuera de alcance»), pedido así por el usuario.

## La premisa, afirmación por afirmación

- `FACTION_IDS` y `esFaccion` existen: `src/core/types.ts:63` y `:76`. Sí.
- `problemasDelHechizo` vive en `src/core/magia/validar.ts`; los campos admitidos son una lista
  cerrada (`CAMPOS`, `validar.ts:44`; `OBLIGATORIOS`, `:58`): el campo nuevo y los 43 hechizos de
  `data/hechizos.json` tienen que cambiar en el mismo commit, o la carga lanza. Sí.
- `montarEditorDeMagia` (`src/client/arena/magia.ts`) y «Guardar» (`escribirCatalogo`,
  `docs/areas/arena.md:27`). Sí.
- Un hechizo nuevo nace de `hechizoNuevo` (`src/core/magia/editar.ts:61`, hoy `gremio: null` y
  sin facciones). Sí; **falta en el requisito** `copiaDe` (`editar.ts:75`), que copia uno existente
  y debe conservar sus facciones (si copia el objeto entero, gratis; que el arquitecto lo mire).
- `hechizosDelMontaje` (`src/core/arena/enlace.ts:397`): los hechizos **viajan enteros** en el
  enlace y se validan con `problemasDeLaLista` (`enlace.ts:310-311`). Un enlace v21 copiado hoy
  fallaría con «falta facciones» en vez del mensaje de versión (`enlace.ts:203-207`). Con el formato
  del hechizo cambiado, lo de este repo es **subir `VERSION_DEL_ENLACE` a 22** (`enlace.ts:130`; la
  21 nació con el editor de magia, `enlace.ts:74`). El requisito no lo dice.
- El retoque `hechizos` (`src/core/arena/retoque.ts:66`, `:129-136`) recibe el catálogo entero ya
  hecho: no lee campos, no se rompe.
- El contrato del agente: `spell_list` sale de `hechizosAlAgente`
  (`src/core/contract/vistas.ts:200`), que elige los campos uno a uno: el campo **no se filtra** al
  agente y nada se rompe. Coherente con «fuera de alcance».
- Tests que construyen hechizos a mano: `test/magia-de-prueba.ts` y `test/magia-formato.test.ts`
  (llevan `gremio`); con el campo obligatorio, el typecheck los marca. Hay que contarlos en el plan.

## Qué facciones llevan los hechizos de hoy (lo que da el código)

- **`curar` → `templarios`**: es el único poder de unidad que existe hoy, del `templario-monje`
  (`data/unidades.json:61`, y su descripción lo dice: «El monje cura…»). Motivo claro.
- **`zombi_pegajoso` → candidato `no-muertos`**: su descripción habla del zombi y existe la unidad
  `zombi` (no-muertos), pero **ninguna unidad lo lleva** como poder. Es a ojo; decide el usuario.
- Los otros 41 (los cinco del gremio y los de ejemplo): **todas**. Ninguno lo lleva una unidad
  ni nombra una criatura de una facción (`hoja_vampirica` nombra un vampiro que no hay).

## El día después

- Para quien juega, nada: ninguna regla lee el campo. Deuda declarada y pedida.
- Lo que cierra: la lista vacía como error impide un «hechizo de ninguna facción» (solo de arena).
  Si más tarde se quiere, es un cambio de regla, no de datos. Bien así por el encargo.
- Lo que nadie borrará: nada; el campo será el que lea el gremio cuando toque.
- No contradice `CLAUDE.md` («sin compatibilidad hacia atrás» empuja justo a rechazar el hechizo
  sin facciones y a subir la versión del enlace).

## Conflictos

- Cola (`gh issue list --limit 60`): ninguna tarea abierta sobre magia, gremio ni facciones de
  hechizos. `git log -20`: la reorganización; nada que toque `magia/`.
- **Dependencia oculta, para después**: el día que el gremio lea el campo, `townSpells`
  (`src/core/town/town.ts:114`, `hechizosDelGremio(mageGuildLevel(town))`) y
  `hechizosDelGremio` (`src/core/magia/catalogo.ts:71`) tendrán que recibir la facción
  (`Town.faction` ya existe, `town.ts:20`), y el héroe de la arena aprende hoy todo el gremio
  (`src/core/arena/heroe.ts:92`). No se hace aquí; se nombra para que no se haga a medias.

## Preguntas para el usuario (no se deciden aquí)

1. ¿Debe el **gremio de cada facción** enseñar solo los hechizos de su facción? Hoy enseña por
   nivel, sin mirar facción (`town.ts:114`). Con el campo puesto sería el primer lector.
2. ¿Un **poder de unidad** debe ser de la facción de la unidad (que el catálogo rechace al monje
   templario con un poder sin `templarios`)? Lo validaría `problemasComoPoder` o la carga del
   catálogo de unidades; hoy no cruza nada.
3. ¿`zombi_pegajoso` es de los no muertos, o de todas como los demás de ejemplo?

## Coste contra valor

Barato: un campo, cuatro rechazos, unas casillas en el editor, el JSON y la versión del enlace.
Sin hacerlo no pasa nada hoy, pero el usuario lo pide explícitamente como paso hacia la magia por
facción. Vale.

## Qué le cambiaría a `requisitos.md` (para pegar)

En el criterio 4, añadir:

> y una copia de un hechizo (`copiaDe`, `src/core/magia/editar.ts`) conserva sus facciones.

En el criterio 6, añadir:

> Los hechizos viajan enteros en el enlace (`enlace.ts`, validados con `problemasDeLaLista`): el
> formato cambia, así que `VERSION_DEL_ENLACE` sube a 22 y un enlace de la 21 se rechaza con el
> mensaje de versión, no con «falta facciones». `spell_list` (`hechizosAlAgente`) no cambia.

En «Preguntas abiertas», sustituir la de qué facciones por:

> Suposición: todas, salvo `curar` → `templarios` (poder del monje, `data/unidades.json`).
> `zombi_pegajoso` (nombra al zombi, pero no lo lleva ninguna unidad): todas hasta que el usuario
> diga. Se le pregunta además si el gremio y los poderes deben leer el campo (fuera de alcance).

Y en el criterio 7 o en un criterio nuevo: el `_comment` de `data/hechizos.json`, la fila «Magia»
de `docs/areas/batalla.md` y la línea del editor en `docs/areas/arena.md` (versión 22) al día.
