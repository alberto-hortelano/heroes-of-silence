# Hallazgos de QA a corregir (vuelta 1)

El detalle está en `qa.md`.

1. **H1 · Los avisos de lo que se lee convertido no se pueden leer.**
   - Hoy van a `#status`, que corta a dos líneas, así que la frase de una unidad que se retira
     queda cortada. Al pulsar «Guardar», esa unidad desaparece del disco sin que se haya podido
     leer el aviso.
   - Se pide que, en el montaje de la arena, los avisos de lectura (borrador y enlace) se puedan
     leer enteros: un bloque de avisos en el panel, o desplegable desde la barra. El ingeniero
     elige, con `html.ts` y la paleta de siempre.
   - Lo que se retira (unidades del catálogo) va primero.
   - La barra puede seguir con el resumen.
   - Que lo compruebe `pnpm capturas`, con un enlace v7 con el dragón: el texto entero se ve.
2. **H2 · Los campos ajenos de `data/equipo.json` pasan sin aviso.**
   - El cargador del juego acepta `disparos` y cualquier errata (`danyo`). La arena lanza después,
     con un mensaje que no nombra el fichero.
   - Se pide llevar la comprobación de campos ajenos a `problemasDePieza`, con `CAMPOS_DE_PIEZA`
     movida a `data.ts`, para que `validarEquipo` falle al cargar nombrando `data/equipo.json`.
   - Un test con el JSON como argumento, visto morder.
   - El banco no se mueve.
3. **H3 · Textos que hablan de unidades grandes.** La ayuda de la muralla
   (`src/core/arena-murallas.ts:161`) aún habla de «unidades de dos casillas» y de «una unidad
   grande». Se cambian esos textos, y los demás que queden en la arena que hablen de tamaño o
   munición.

H4 (con `double_shot` el nivel no cambia) es una decisión del plan y se queda como está.
