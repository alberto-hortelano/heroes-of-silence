# Requisitos — #158, #121 y #122: restos del agente y de la barra

## Petición
Vienen del backlog. El usuario las eligió para trabajarlas en paralelo el 07-10-2026 («#158, #121 y #122 pequeños»).

- **#158**, restos de #123/#128 (QA de `docs/agents/2026-10-06-agente-pequenos/`):
  - (a) lo invisible dentro de un nombre (U+200B en medio, etiquetas U+E00xx), sin romper la bandera de Escocia ni los emojis con ZWJ, así que hay que decidir la regla;
  - (b) `\p{Cn}` depende de la versión de Unicode del Node del servidor;
  - (c) con la partida terminada, pasar el puntero por el mapa sustituye el «Derrota…» de la barra;
  - (d) pulsar «Continuar» durante la última animación de una batalla da «Espera a que termine la jugada.» y hay que pulsar otra vez.
- **#121:** una marcha de varios días que se queda sin puntos sale como «descartada» aunque el héroe sí anduvo. El veredicto debería decir que entró parcialmente: hasta dónde llegó y cuántos pasos quedan.
- **#122:** la prosa de `map_generate` promete «para que lo corrijas», pero un plan rechazado no tiene reintento. O hay reintento acotado, o la prosa dice la verdad.

## Contexto
- Lo que quedó de #123/#128 está en e5c98c6: `lineaLegible` (cuatro regex Unicode), `finDePartida`/`desenlaceDe` y `llegadaDeLaRuta`.
- Esta tarea vive en `/home/al/code/heroes-pequenos` (rama `agente-restos`). En paralelo van #157 (puentes), #155 (núcleo, `generate.ts`/`vestir.ts`) y #130 (emboscada).
- CLAUDE.md: «No hay reintento» del plan de mapa es una decisión documentada.

## Criterios de aceptación
1. **#158 (a)/(b):** una regla escrita y probada.
   - Rechaza los invisibles dentro de un nombre visible.
   - Acepta 🏴󠁧󠁢󠁳󠁣󠁴󠁿 y los emojis ZWJ (👨‍👩‍👧).
   - No depende de la versión de Unicode del Node, o la dependencia queda acotada y dicha.
2. **#158 (c):** con la partida terminada, la barra mantiene el desenlace al pasar el puntero.
3. **#158 (d):** «Continuar» durante la última animación espera y continúa al acabar, o se ignora sin mensaje de error. Que no haya que pulsar dos veces.
4. **#121:** el veredicto de un `move_hero` parcial dice que entró parcialmente, con dónde quedó y cuántos pasos faltan, y no lo cuenta como descartado. Test del contrato.
5. **#122:** por defecto, la prosa dice la verdad (se juega el procedimental y el motivo llega como aviso). El reintento acotado solo si el crítico lo justifica y el usuario lo aprueba.
6. `pnpm verify`, `pnpm qa`, el navegador para (c) y (d), y `pnpm banco` igual (no se toca el juego).

## Fuera de alcance
- Nombres: cambiar la longitud o el alfabeto permitido más allá de los invisibles.

## Tras la crítica (VIGENTE, 07-10-2026)

Los criterios 1, 4 y 5 se sustituyen por estos, de `critica.md`. Son correcciones dentro de lo que ya se esperaba, así que no hace falta preguntar al usuario.

1. **#158 (a)/(b):** una regla escrita y probada.
   - Rechaza los invisibles entre caracteres visibles de un nombre o una historia: U+200B, U+2060, U+00AD, el ZWJ entre letras (`Ana‍Bo`) y las etiquetas U+E0020–E007F fuera de una bandera.
   - Acepta 🏴󠁧󠁢󠁳󠁣󠁴󠁿, ❤️ y 👨‍👩‍👧.
   - El mismo test pasa en Node 24 (CI) y en Node 26 (local). Si no se puede, la dependencia queda acotada y dicha en el comentario de `lineaLegible`.
4. **#121:** un `move_hero` que da al menos un paso y no llega se cuenta como aplicado.
   - Su veredicto dice que entró parcialmente, dónde quedó y cuántos pasos faltan.
   - Uno que no da ni un paso sigue descartado: `test/ascenso.test.ts:199` sigue en verde.
   - Test del contrato.
   - El recorte «hasta donde alcanza hoy» no se escribe por tercera vez; ya está en `session.ts` y en `stepTowards`.
5. **#122:** la prosa de `RESPONSE_FORMAT.map_generate` dice la verdad. Si el plan se rechaza, se juega el procedimental, no se vuelve a pedir y el motivo llega como aviso. **Sin reintento.**

**Contexto:** #130 va en paralelo y puede tocar `escenas/aventura.ts` y el bucle de `moveHero`. Se avisa al fusionar.

## Punto de control (07-10-2026)
El usuario aprueba `plan.md` tal cual: «Adelante».
