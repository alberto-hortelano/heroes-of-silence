# Hallazgos de /simplify — rueda del golpe (13-10-2026)

Cuatro revisores: reutilización, simplificación, eficiencia y altitud. Están deduplicados y cada
uno lleva la decisión del coordinador. Los números de línea son orientativos, del diff de
`implementacion.md`. Ninguno de estos cambios debe alterar el comportamiento: los tests de
`rueda.test.ts` siguen mandando y `pnpm banco` no cambia de hash.

## Se aplican

### Núcleo

1. **Una sola secuencia de elecciones de la IA.**
   - Problema: `antesDeLaIA` y la rama de golpe de `elegirEnLaRueda` (`session.ts:2009`,
     `:2063`) copian `completarCruce` (`ai/rueda.ts:37`). El orden de las tiradas del `Rng`
     queda escrito en dos sitios.
   - Arreglo: `completarCruce` recibe quién lleva cada bando y devuelve la acción completa o «falta
     la respuesta de la persona», con el golpe ya elegido. La sesión lo usa en los dos sitios.
2. **`damage.ts` recibe números neutros, no tipos.**
   - Problema: hoy `damage.ts` importa `factorDe`, `ataqueDe` y `NOMBRE_DE_GOLPE`, y el `cruce`
     se monta en dos sitios (`battle.ts:2368` y `conElSector` `:2938`).
   - Arreglo: `DamageOptions.cruce = { desde, hasta, factor, ataque, causa }`, como decía el plan
     en §4.5. Lo traduce solo `opcionesDeDanio`, a partir del tipo y el punto. `damage.ts` no
     importa `rueda.ts`.
3. **`contraataqueBlocker(state, attacker, target): string | null`**, con
   `devolveraElGolpe = blocker === null`. Sustituye a `porQueNoDevuelve` (`battle.ts:3000`) y
   su `throw` de discrepancia.
4. **Preparar el golpe en un solo sitio.**
   - Problema: `previsionDe` (`:2785`), `previsionDeLaRueda` (`:2964`) y `applyAction` repiten la
     preparación (`activeStack`, objetivo, `golpeBlocker`, `desdeAhi`, carga).
   - Arreglo: un `golpePreparado(state, accion)` que usen los tres.
   - De paso:
     - `previsionDe` llama a `cruceBlocker` en vez de reescribir su texto;
     - un `tipoDeGolpeBlocker` en `rueda.ts` escribe «"x" no es un tipo de golpe; valen …»,
       que hoy está repetido en `session.ts:1998`;
     - en `previsionDeLaRueda`, las opciones base se calculan una vez y se añade el `cruce` para
       cada tipo.
5. **`melee` sin copia-pega.** El golpe y el contraataque pasan por un `intercambio(...)` común
   (Defensivo propio, `golpesDe`, el bucle de `strike`). `strike` recibe ya el cruce hecho, sin
   el ternario que lo convierte.
6. **El contraataque que de verdad hubo, sin campo hipotético.**
   - Problema: el hecho `cruce` lleva un campo `contraataque` derivable, que promete un
     contraataque que no siempre llega.
   - Arreglo:
     - se quita ese campo del hecho `cruce`;
     - el `attack` lleva `punto?` (como pedía el plan);
     - `contraataqueDelCruce` busca el `attack` con `retaliation` del objetivo y devuelve su
       `punto`;
     - desaparece la llamada extra a `devolveraElGolpe` con el stack copiado.
   - El cruce sigue escribiéndose antes del `move`, por la marca de carga del animador (ver
     «Se descartan»).
7. **`interface CruceDeLaRueda`** (`battle.ts:2095`): se borra. `cruceDeLaRueda` devuelve el
   propio hecho o `null`.
8. **Efectos de la rueda en una tabla.** `colgarDeLaRueda` usa una tabla por tipo
   `{ kind, amount, a: 'propio' | 'rival' }` en lugar del ternario anidado. `factorDe` y
   `ataqueDe` siguen la misma forma, con campos con nombre: no hace falta un `Record` de 7 rellenos
   a 100. El JSON puede seguir igual.
9. **`HASTA_SU_TURNO` exportado** desde `rueda.ts` y leído por `duracionDeEfecto`
   (`views/panels.ts:998`). Hoy la frase está escrita dos veces.
10. **Formateadores existentes:**
    - `porciento` pasa a usar `conComa` (`core/types.ts:71`);
    - `conSigno` se importa de `hero/equipo.ts:495` en vez de copiarlo;
    - la clave de la sesión usa `hexKey` (`board.ts:165`).
11. **Sorteo por pesos y validación de objetos:**
    - `sortearPorPesos(rng, items, peso)` en `src/core/rng.ts`, usado por `elegirEnLaRueda`;
    - `objetoCon` se sube a `src/core/validar.ts`, junto a `entero`.
    - Las otras copias, fuera del diff, van al backlog (ver abajo).
12. **Barato en el camino del juego:**
    - `tiradasPosibles` no crea un objeto de más sin rueda, y `expectedDamage` no paga por la
      rueda;
    - `quitarLosDeSuTurno` comprueba primero con `some` y solo filtra si hay algo que quitar. El
      mecanismo sigue siendo general, no condicionado a `conRueda`.

### Cliente

13. **La previsión se calcula una vez, en la sesión, al abrir la fase.**
    - Se guarda en `this.cruce`.
    - Se borran `RuedaPendiente.clave` y, en `main.ts`, `pendienteGuardada` y la función
      `ruedaPendiente`. La vista repinta por `s.version`.
    - `playBattleAction` deja de calcular siete horquillas solo para validar.
    - `cancel` y `elegirEnLaRueda` de `main.ts` confían en lo que devuelve la sesión.
14. **El desenlace**: el `log.indexOf` en cada fotograma (`main.ts:2148`) pasa a hacerse solo
    cuando cambia el hecho (comparación por identidad). `s.version` se calcula una vez por
    fotograma.
15. **`arena/rueda.ts`**:
    - `renderEleccion` y `renderDesenlace` comparten la cabecera y las etiquetas de los sectores;
    - se quitan los atributos y clases que no lee nadie (`data-elegido` del disco y el parámetro
      `elegido`, `.sin-contraataque`, `de-golpe`/`de-contraataque`, `data-papel`);
    - se escribe una función tecla ↔ tipo, usada en los dos sentidos;
    - se quita el `as string` (`main.ts:2230`);
    - `abrirLaRueda()` se llama una sola vez en `pintarLaRueda`.
16. **Un solo reloj.** Las duraciones del CSS (`girar 620ms`…) se derivan de `DURACION.cruce`
    mediante una variable CSS que pone el JS (`--cruce`, con `style.setProperty`, nunca con un
    hueco `style` de `html.ts`) y fracciones en el CSS.
    - **Geometría**: si cabe sin romper el aspecto, los botones se colocan desde el ángulo de
      `ANILLO`, con variables por botón puestas desde JS. Si no, se dice en `implementacion.md`.
17. **Animación infinita bajo un filtro**: el aro que late (`.aro-del-bando`, `latir`) no puede
    vivir dentro del SVG con `drop-shadow`. La sombra pasa a un envoltorio estático
    (`box-shadow` redondo) o el aro sale del filtro.
18. **`.nota` genérico.** En `style.css:384`, en vez de nombrar `.sector-de-rueda`, se usa un
    atributo genérico en el padre (`[data-abre-nota]`).
19. **`modoDelGolpeALaURL`**, gemelo de `modoDelGolpeDeLaURL`, lo usan los dos sitios que escriben
    `?golpe=` (`main.ts:540`, `:1722`). Se borra `SesionDeArena.golpe`, que nadie lee:
    `conRueda` es la única lectura.
20. **`horquilla`**: se exporta la de `views/prevision.ts:26` y la rueda la envuelve.
21. **`tools/qa/capturas.ts`**:
    - `buscarRueda` y `jugarLaRueda` comparten el reparto en el espejo;
    - se quitan los alias `TIPOS_DE_GOLPE_DE_LA_PASADA` y `NOMBRE_DEL_PUNTO_DE_LA_PASADA`.

### Observación del coordinador (mirando las capturas)

22. **Móvil (390×844).**
    - La rueda y sus dos cajas se salen del lienzo y se pintan sobre el panel de abajo.
    - Las cajas de la cabecera y de la ayuda son translúcidas, así que el texto del panel se lee a
      través («Orko co…», «Bando Derecha»).
    - Con la rueda abierta en móvil, el fondo debe tapar lo de detrás (fondo opaco en las cajas, o
      un velo detrás de la rueda) y todo debe caber en la pantalla.
    - La cabecera de la fase respuesta dice «Guerrero con escudo ←» con la flecha suelta al final:
      que se lea bien quién ataca a quién.

## Se descartan, con motivo

- **Guardar la decisión pendiente en `BattleState` con una jugada `responder`** (altitud 1).
  - Sería más limpio. Pero el golpe guardado es información escondida, y `BattleState` lo leen los
    paneles, el registro y (en el juego) el espectador.
  - Además cambiaría la unión `BattleAction`, que vigila el contrato del agente, en una tarea que
    es solo de la arena.
  - Mientras sea solo de la arena, la sesión es la dueña de lo escondido. Se reabre si la rueda
    pasa al juego: entonces sí será del núcleo.
- **Marcar la carga en el `move` del núcleo** para escribir el cruce dentro de `melee` (altitud 4).
  - Toca el animador y el evento `move` de la partida y del espectador, fuera del alcance.
  - Con el punto 6 ya se deja de guardar el contraataque hipotético.
- **`effectTotal('defense')` en cada `effectiveDefense`** (eficiencia 5): son nanosegundos y es
  simétrico con el ataque.
- **Las siete reglas `:has()` de `arena.css`**: funcionan y están limitadas a `.rueda`.
- **`pasoEnCurso()` genérico en el animador**: hoy solo hay un paso que pinta otra capa.
- **Dos nombres, `hastaElTurno` (número del estado) y `hastaSuTurno` (marca del evento)**:
  son dos cosas distintas, el dato y su lectura.

## Backlog (issue de GitHub, no en este ciclo)

- Las copias de `double_attack ? 2 : 1` en `tactics.ts` y `nivel.ts` deberían pasar a
  `golpesDe`, probando con `pnpm banco`.
- Las otras cinco copias de `objetoCon` (`arena.ts`, `poderes.ts`, `muralla.ts`) deberían pasar a
  `validar.ts`.
- `sortear` (`vestir.ts`) y `sortearNivel` (`generate.ts`) deberían pasar a `sortearPorPesos`.
  Ojo: es el azar del generador, así que hay que comprobar `pnpm banco` y la rectitud.
- La previsión del contraataque al pasar el ratón por el tablero no conoce la rueda.
