# Levantar zombi — hallazgos de QA (vuelta 1, 09-11-2026)

De `qa.md` (sobre 1c4ae15a). Los cuatro se arreglan en esta vuelta, cada uno con un test que antes
fallara (o, el de pantalla, con su captura).

## H1 (importante) — «Editar» un levantado a media pelea no hace nada
En la arena, «Editar» sobre un zombi levantado (que no venía en el montaje) dice «No se cambia: La
pelea no trae la ficha de unidad:zombi: no la montó la arena.» Lanza `fichaDeAntes`
(`src/core/arena/retoque.ts:~201`). Pasos de QA: semilla 7, ronda 4, turno del zombi, PV 85 → 222
(`capturas/qa-09`). **Qué se espera**: retocar el tipo de un levantado se puede, como cualquier
otro de la pelea, y cambia también a los levantados de ese tipo (y a lo que se levante después:
`levantables`). Si el levantado es de un tipo que ya pelea, el retoque de ese tipo debe alcanzarlo.

## H2 (menor) — fuera de alcance, el botón dice que no hay cadáver
Con el único cadáver fuera de alcance, el botón sale apagado con «no hay ningún cadáver que
levantar» (`cadaverBlocker` sin apuntar, `src/core/battle/lanzar.ts`; `capturas/qa-02b`). Debe
decir el motivo de verdad: si hay cadáveres que valdrían pero ninguno a su alcance, el de la
distancia (p. ej. «ningún cadáver que se pueda levantar está a su alcance (4 casillas)»); si no hay
ninguno, el de ahora.

## H3 (menor) — el editor dice «Vale» de lo que «Guardar» rechaza
Un `levantar` con `vivos: no-existe` sale «Vale» en el veredicto en directo de la ficha del editor
de magia, y «Guardar» lo rechaza (`levantadosBlocker` no entra en el veredicto en directo). El
veredicto en directo debe mirar también `levantadosBlocker` contra el catálogo de unidades de la
página, con la misma frase que «Guardar».

## H4 (menor) — el panel pide «la unidad objetivo» con un hechizo de cadáver
`src/client/batalla/panel.ts:~346` dice siempre «pulsa sobre la unidad objetivo»; con un hechizo de
casilla ya era así. Que la frase salga de `queSeApunta`: unidad, casilla o cadáver (un `switch`
exhaustivo).

## Fuera de esta vuelta (no se toca, se le dice al usuario)
- Tras «Guardar» en la arena, `data/heroe.json` salía modificado sin tocarlo (QA lo devolvió sin
  investigar). Si al arreglar H3 ves la causa y es de este diff, dilo en `implementacion.md`; si
  no, no lo persigas.
