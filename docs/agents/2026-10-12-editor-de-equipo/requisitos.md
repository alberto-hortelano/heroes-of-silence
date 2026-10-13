# Editor de equipo en la arena

## Petición literal (12-10-2026)

> Crea un editor de equipo

Aclaraciones del usuario durante el plan:
> No entiendo lo de las piezas propias, no deberia haberlas. La unidad tiene unas estadisticas y las del arma se suman, no hay equipo integrado en la unidad

> Como que ya se pueden editar en la ficha las que estan puestas?

(Respuesta del coordinador: en la ficha de unidad solo se **elige** qué pieza lleva; las cifras de una pieza no se editan en ningún sitio. «Piezas propias» quería decir piezas nuevas creadas en el editor, no equipo dentro de la unidad.)

Respuestas en AskUserQuestion: edita **las piezas**; guarda en el **borrador de la arena**; vive en una **vista nueva de la arena**; **editar las 27 y crear** nuevas.

## Contexto

El usuario pide «Crea un editor de equipo». Hoy el equipo son 27 piezas fijas en `data/equipo.json`,
importadas de forma estática (`core/data.ts:6`, validadas por `validarEquipo`). Desde la página solo se
puede elegir cuál se pone cada unidad (sección Equipo de la ficha), pero no crear ni cambiar piezas.

Decisiones del usuario (12-10-2026):
- **Qué edita:** las piezas: nombre, hueco, ataque, defensa, PV, daño, disparos, velocidad, una o dos
  manos y precio.
- **Dónde guarda:** en un borrador de la arena, `data/borradores/equipo.json`. El juego no lo lee y el
  banco no se mueve. Pasar una pieza al juego queda fuera.
- **Qué piezas:** se pueden cambiar las 27 del catálogo (el cambio vale en la arena) y crear nuevas.
- **El modelo no cambia:** la unidad tiene sus cifras y las de la pieza que lleva se suman; no hay equipo
  integrado en la unidad. La ficha de unidad solo elige qué pieza lleva; las cifras de la pieza se editan
  en esta vista.
- **Dónde vive:** una vista nueva en la arena, «Editar equipo», junto a «Editar fichas».





## Criterios de aceptación (borrador para `requisitos.md`)

1. **Vista «Editar equipo».** Se abre desde la arena con su propio botón y se vuelve al montaje (es una
   escena más de `irA`, como `edicion`).
   - A la izquierda, la lista de piezas agrupada por hueco: las del catálogo marcadas como tales y las
     cambiadas o nuevas marcadas como tales.
   - A la derecha, la ficha de la pieza elegida, con sus cifras, su resumen (`cifrasDePieza`) y el
     motivo de cualquier rechazo.
   - Funciona a 390 px de ancho sin scroll horizontal.
2. **Editar las 27 y crear nuevas** (decisión del usuario: «Editar las 27 y crear»). Toda pieza es
   igual: la unidad tiene sus cifras y las de la pieza que lleva se suman (`conEquipo`); no hay equipo
   integrado en la unidad.
   - Cualquier pieza del catálogo se edita en la vista: el cambio se guarda en el borrador como **una
     pieza con el mismo id** y vale **solo en la arena**; el juego sigue con la de `data/equipo.json`. La
     ficha de la pieza enseña que está cambiada respecto al juego y deja «Volver a la del juego».
   - «Nueva pieza» en un hueco (o «Duplicar» una) crea una pieza nueva de calidad `arena`, con id único
     entre el catálogo y el borrador (`<base>-<n>`); una nueva se puede borrar.
   - Se editan todos los campos (nombre, hueco, ataque, defensa, PV, daño, disparos, velocidad, manos,
     precio) con las reglas de hoy en un solo sitio (lo que ya comprueba `validarEquipo` de una pieza:
     ≥ 0, el escudo resta velocidad, `manos`/`danio` solo en un arma); lo que no vale se rechaza con su
     motivo («No se cambia: …»).
   - Una pieza que una unidad del borrador lleva no puede dejar de valer para ella (p. ej. pasar a dos
     manos con un escudo puesto, o borrarla): se rechaza nombrando quién la lleva.
3. **Las reglas de conjunto del catálogo no se rompen en la arena**: cambiar la calidad de una pieza del
   catálogo no se ofrece (el juego decide botín y armería); el hueco de una pieza del catálogo tampoco.
4. **Guardar.**
   - El botón «Guardar» de la arena guarda también las piezas cambiadas y las nuevas, en `data/borradores/equipo.json`.
   - Va con un tercer `Borrador` en `tools/arena/borrador.ts` (junto a `DE_UNIDADES` y `DE_MURALLAS`) y
     su ruta en el plugin `arena()` de `vite.config.ts` (`/__arena/equipo`).
   - Valida antes de escribir y lo hace de forma atómica.
   - Conserva lo que no vale, diciéndolo.
   - El aviso de cambios sin guardar las cuenta.
5. **La arena usa las piezas del borrador.**
   - Las nuevas salen en el desplegable de cada hueco de la ficha de unidad; las cambiadas, con sus
     cifras de la arena.
   - Una unidad pelea con las cifras de la arena de lo que lleva con sus cifras, y su índice y su nivel no cambian.
   - La regla de las dos manos vale igual.
   - Editar una pieza que llevan unidades abiertas actualiza sus cifras de combate.
   - El borrador de unidades acepta ids de piezas nuevas.
6. **Enlace de la pelea.**
   - `?montaje=` sube a la versión 6 y lleva dentro las piezas cambiadas o nuevas que use, para que el enlace se
     abra en otra máquina.
   - Las versiones 1 a 5 se siguen leyendo.
7. **El juego no cambia.**
   - `PIEZAS_DEL_JUEGO`, el botín, la armería y el contrato del agente no ven el borrador.
   - Ni `core` ni `server` importan nada del borrador.
   - El banco sale idéntico (`066767b4…`).
   - Un invariante lo vigila.
8. **Verificación:**
   - `pnpm verify` y, al cerrar, `verify:lento`, `banco` y `capturas`.
   - En Playwright sin pantalla:
     - crear, editar y guardar una pieza;
     - ponérsela a una unidad y verla pelear;
     - rechazar un escudo con velocidad positiva y un escudo con un arma a dos manos;
     - recargar y comprobar que sigue ahí;
     - abrir un enlace v6 en limpio.
   - Actualizar CLAUDE.md (puertas únicas y el párrafo de la arena) y `docs/historia.md`.

## Diseño de partida (lo concreta el arquitecto)

- **El catálogo de piezas como parámetro, no como global.** Hoy `pieza()`, `sumaDeEquipo`, `conEquipo`,
  `manosBlocker`, `equipoBlocker`, `ponerPieza` y `cifrasDePieza` (`src/core/hero/equipo.ts`) leen
  `porId`, construido una vez desde `EQUIPO`.
  - Se introduce un `CatalogoDePiezas` (un `Map` de id a `Pieza`) con su valor por defecto, el del juego.
  - La arena pasa el suyo: el del juego con el borrador encima (las cambiadas sustituyen a las del juego, las nuevas se añaden).
  - El juego no cambia de llamada, así que el banco no se mueve.
  - Hay que evitar un segundo `pieza()`: un solo resolvedor, que recibe el catálogo.
- **La validación de una pieza se extrae de `validarEquipo`** (`core/data.ts:746`), por ejemplo
  `piezaBlocker(p)`, para que la lean el catálogo, el borrador y la vista. Las reglas de conjunto (una
  pieza de armería por hueco, al menos una de botín) se quedan solo en el catálogo.
- **En `core/arena.ts`:**
  - `validarUnidadDeArena` / `equipoValido` reciben el catálogo de la arena.
  - `piezaNueva`, `catalogoDeLaArena(borrador)` y `validarBorradorDeEquipo`, junto a `unidadNueva`.
  - El enlace v6 incrusta las piezas cambiadas o nuevas que se usan.
- **En el cliente** (`src/client/arena/`): una escena `'equipo'` en `main.ts` (`irA`), la lista y la ficha
  de pieza en `paneles.ts` (reutilizando `numero`, `cifrasDePieza` y `NOMBRE_DE_HUECO`), y estilos en
  `arena.css`.

## Ficheros principales

`src/core/hero/equipo.ts`, `src/core/data.ts`, `src/core/arena.ts`, `tools/arena/borrador.ts`,
`vite.config.ts`, `src/client/arena/{main.ts,paneles.ts,arena.css}`, `src/client/arena/index.html`,
`tools/qa/capturas.ts`, y en los tests `test/{equipo,arena,arena-edicion,invariantes}.test.ts`.

## Verificación

Criterio 8. El presupuesto de pruebas del repo (máquina compartida):
- mientras se itera, solo los tests de lo que se toca;
- `verify`, una vez por tanda;
- `verify:lento`, `banco` y `capturas`, una vez al cerrar.

El navegador, con Playwright sin pantalla y un vite propio en otro puerto (el 3100 es de otra sesión),
matado por su grupo.

## Fuera de alcance

- Pasar piezas del borrador al juego (`data/equipo.json`).
- Arte de piezas; cambiar la fórmula de daño o el índice de poder.
- Cambiar botín, armería o el contrato del agente.

## Preguntas abiertas (con suposición por defecto)

- **Precio:** se edita en oro como mínimo; el resto de recursos, si sale barato.
- **Pieza del catálogo cambiada que deja de valer para una unidad del borrador:** se rechaza nombrando a la unidad (criterio 2).
- **Enlace v6:** incrusta solo las piezas cambiadas o nuevas que lleve alguna unidad montada.

## Punto de control del plan (12-10-2026, respuestas del usuario)

- **Enlaces de la versión 1 a la 5 pelean con las piezas de la arena** (las cambiadas del borrador), no con las del juego; la barra avisa de que el resultado puede no coincidir con el del enlace original.
- **«Editar equipo» también a media pelea.** Cambiar una pieza en plena pelea cambia al momento las cifras de todos los stacks que la llevan, de los dos bandos, conservando lo ya gastado (como `retocarEnBatalla` con `gastadoDeMas`), y queda en el parte (evento `retoque` o el que toque). Lo que la pieza cambiada deja de valer para un stack se rechaza con su motivo, como fuera de la pelea.
- Precio: el oro seguro; los demás recursos, filas opcionales si caben.
- Aceptado lo demás del plan (opción A: catálogo como último parámetro opcional en `equipo.ts`, obligatorio en la arena; `problemasDePieza`/`piezaBlocker`; `cambioDePiezaBlocker`; enlace v6; invariante en dos partes).
