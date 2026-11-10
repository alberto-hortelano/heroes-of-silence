# Hallazgos del QA, vuelta 1 — con la decisión tomada

Veredicto del QA: **apto con reservas** (`qa.md`). Tres hallazgos; los tres se corrigen aquí.

## H1 — importante: `source` lleva el golpe de la rueda en la palabra del núcleo

El hecho `effect`, su `effect_end` y la vista `stacks[].effects[].source` llegan con `"defensivo"` o
`"romperGuardia"`, mientras el mismo golpe es `"defensive"`/`"guard_break"` en `clash.hit` y
`clash.response`. Origen: `src/core/battle/golpe.ts:74` (`source: efecto.fuente`); lo copian
`hechoAlAgente` (`src/core/contract/hechos.ts`) y `stackView` (`src/core/contract/batalla.ts:267`).
El guardia no lo ve: `source` quedó fuera de `CAMPOS_ENUMERADOS` por tratarse como id. Incumple el
criterio 4.

**Decisión: se arregla.**
- Una sola función del contrato (junto a `HIT_DE_GOLPE`, en `vocabulario.ts`) traduce el origen de
  un efecto: si es un golpe de la rueda, su palabra de `HIT_DE_GOLPE`; si es otra cosa (id de
  hechizo, de poder…), tal cual. La llaman los tres sitios (`effect`, `effect_end`, `stackView`).
  Mira antes qué valores puede tomar `source` en el núcleo (`StackEffect`, `battle/effects.ts`,
  `golpe.ts`, hechizos y poderes) y dilo en el informe: si hay más orígenes con palabra del núcleo
  que no sean ids del catálogo, se traducen igual.
- El guardia lo caza: `source` entra en lo que vigila `test/fugas-de-los-hechos.ts`, de modo que un
  golpe en español ahí sea una fuga (los ids del catálogo siguen pasando). Hay que verlo morder.
- El núcleo no cambia lo que emite (`pnpm banco` igual; el espectador, igual).
- Si la prosa de `formato.ts` habla de `source`, que diga qué palabras trae.

## H2 — menor: una forma que el zod rechaza se lleva el turno entero

`withHero: [{ creature, count: 0 }]` junto a un `build` válido da `ok=false` y la IA juega el turno;
igual con `count: 1.5`, `upgrade` de más de 32 letras o ausente, 33 líneas o `withHero` que no es
lista. Es el patrón de siempre de toda jugada, pero los comentarios nuevos de `esquemas.ts` prometen
«descarta ESTA jugada, no el turno».

**Decisión: lo barato se cumple, lo demás se dice.**
- `count` de una línea de `distribute_troops` (0, negativo, no entero): el zod lo deja pasar como
  número y lo juzga `accionDelAgente`, que descarta esa jugada con su motivo (un error natural del
  agente no debe costarle el turno). Con test.
- Lo estructural (falta `upgrade`, `withHero` no es lista, más líneas o letras del tope) sigue
  siendo respuesta mal formada, como en toda jugada: **se corrigen los comentarios** de
  `esquemas.ts` para que prometan solo lo que pasa, y la prosa si lo afirma.
- No se cambia el patrón general del zod para las demás jugadas (fuera de alcance; a backlog).

## H3 — menor: dos rechazos sin su prefijo

Los rechazos del veterano y de la línea vacía de un reparto salen sin «no se puede repartir la
tropa:», que llevan los demás. **Decisión: se arregla** (mismo prefijo, por la misma vía que los
otros; sin tocar el texto de `leave_troops`/`take_troops`).

## Al terminar

Sección «Tras el QA, vuelta 1» en `implementacion.md`: qué se hizo y la verificación ejecutada
(`pnpm typecheck`, `pnpm lint`, `tools/qa/exportaciones.ts`, los tests tocados por partes,
`pnpm qa`, `pnpm banco` una vez).
