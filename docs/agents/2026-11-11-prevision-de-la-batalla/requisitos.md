# Requisitos — prevision-de-la-batalla

Tarea: `2026-11-11-prevision-de-la-batalla`. Issues: 253 264. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (sobre `main` `d791d03c`, con la tanda 1 fusionada: #327, #332 punto 2, #305, #313+#317, #321; #202 en QA).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos (tanda 2). Lo que pide cada issue, tal cual:

### #253 — Batalla: la previsión del contraataque al pasar el ratón no conoce la rueda

> Visto en la rueda del golpe (docs/agents/2026-10-13-rueda-del-golpe/).
> 
> Con `?golpe=rueda`, la barra que se enseña al pasar el ratón por un enemigo (`previsionDe`, `textoDePrevision`) calcula el golpe y el contraataque como al azar: la horquilla entera y sin los efectos de un tipo. Con la rueda, el contraataque depende de lo que elija quien lo devuelve (Fuerte ×1,25, Rápido dos golpes…) y cae en el punto contrario del cruce, así que la previsión puede quedarse corta.
> 
> La rueda ya enseña, sector a sector, lo que daría cada tipo (`previsionDeLaRueda`). Qué haría falta: que la barra, con la rueda encendida, diga la horquilla de lo que puede pasar (de lo mínimo a lo máximo de todos los cruces), o que remita a la rueda, en vez de prometer la horquilla del azar.

### #264 — Batalla: la barra de estado corta la previsión larga a 1024 px

> ## Qué pasa
> 
> A 1024 px de ancho, la barra de abajo de la batalla corta el final de la previsión de un golpe con carga y armadura. Lo último que se pierde es «−7 armadura». La barra ya reserva su alto (B1, hallazgos de QA del 14-10-2026), pero lo reserva para dos líneas, y esa previsión necesita tres. A partir de 1100 px cabe.
> 
> Detalle en `docs/agents/2026-10-14-arena-cinco-juntas/hallazgos-qa.md`, sección «Re-verificación (QA)», punto B1b.
> 
> ## Lo que se quiere
> 
> - La previsión completa se lee a cualquier ancho de escritorio desde 1024 px, sin que el lienzo salte de alto al cambiar el texto. Hay dos formas posibles: una previsión más corta, o una barra que reserve lo que necesita la previsión más larga.
> - Una pasada de `pnpm capturas` a 1024 px con una carga contra una unidad con armadura.
> 

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba:

1. **La barra no promete lo que la rueda puede rebasar.** Al pasar el ratón por un enemigo cuerpo a cuerpo, el daño del golpe y el del contraataque que dice la barra cubren todo lo que puede pasar en la rueda de la batalla (3, 5 o 7): cualquier golpe de quien pega contra cualquier respuesta, con Fuerte, Rápido y su número de golpes, en los dos lados. Vale decir la horquilla de todos los cruces o decir menos y remitir a donde se lee entero; **no vale** remitir a la rueda para el contraataque, que la rueda al golpear no lo dice.
2. El barrido de `test/prevision.test.ts` deja de excluir Fuerte y Rápido (`:66-79`): el daño real de todo golpe y todo contraataque cae dentro de lo que dice la barra. Se ve morder volviendo a la previsión de antes.
3. Sin cambios en lo que devuelve `previsionDeLaRueda` al agente; `pnpm banco` igual (la IA no lee la previsión del golpe).
4. **La barra a 1024 px.** A 1024, 1100 y 1440 px de ancho, la previsión de un golpe con carga contra una unidad con armadura se lee entera en la partida y en la arena, y el lienzo no cambia de alto al pasar el ratón de una casilla a otra (B1, `style.css:458-462`). Lo que no quepa (una granada con varios alcanzados, una lista de modificadores larga) se recorta diciendo dónde se lee entero, no a mitad de cifra.
5. Lo comprueba una aserción (que `#status` no desborde: `scrollHeight` ≤ `clientHeight`) en la pasada de la arena que ya pasa el ratón con la carga (`tools/qa/capturas/pasadas/arena.ts`), a 1024 px; una pasada que solo haga la captura no vale.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` con las recomendaciones del arquitecto: (1) tres líneas de barra en batalla, cuatro solo si la medida a 1024 en la partida lo pide; (2) lo que no cabe se lee entero en el bocadillo del lienzo (`title`), con el ratón quieto. #257 va en paralelo y también toca `partida/dibujo.ts` y `arena/dibujo.ts` (la línea de estado durante la cuenta): el coordinador resuelve el choque al fusionar. Los disparadores de hechizo entre golpe y contraataque, la rueda que dice el contraataque sin la respuesta del rival y el corte que no se rehace al cambiar el ancho van al backlog.
