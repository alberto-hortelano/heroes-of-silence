# Hallazgos de /simplify — cliente nuevo, decididos por el coordinador

Dos revisores: reutilización y simplificación (26 puntos) y eficiencia y altitud
(19 puntos). La numeración es **R** para el primero y **E** para el segundo.

Condiciones de siempre:
- El banco no se mueve (`54a035f0…`).
- `pnpm verify`, `pnpm qa` y **`pnpm capturas`** en verde, este último como prueba
  de que el cliente se sigue jugando.
- El ancla de paneles solo puede cambiar si hay motivo, y se mira el diff.

## Se aplican

### 1. No pintar ni recalcular por fotograma lo que solo cambia con el estado (E1–E13)

Es la raíz: `main.ts` perdió el `needsRender` y lo rehace todo 60 veces por
segundo.

- **Una versión en `Session`** que se incrementa en cada cambio: `run()`, `status`,
  selección, zoom y acciones de batalla. Los paneles solo se reconstruyen cuando
  la versión se mueve; desaparece la comparación de marcado serializado.
- **El lienzo** sigue con su `requestAnimationFrame` solo mientras haya animación:
  idle, cola del animador, arrastre o zoom.
- **Batalla.** `battleLegalActions`, `battleMovable`, `castTargets` y
  `spellOptions` se memorizan en `Session` con la clave
  `battle.log.length|activeId|selectedSpell`, el mismo patrón que `visibles()`.
  `movibles` sale de las entradas `move` de esa lista, sin un segundo BFS.
- **Mapa.** Se calculan una vez por cambio, no por fotograma:
  - la lista estática de vegetación y objetos, ya ordenada (E3);
  - la clave de `superficieDe`, por identidad del array más la semilla, y no
    `join` (E4). `adaptar.ts` conserva el array si no cambió;
  - el `CanvasPattern` cacheado y la mezcla `soft-light` limitada al área visible o
    hecha de antemano por zoom (E5);
  - la máscara de niebla, rehecha solo con `fog.size` o un cambio de `visibles` (E6);
  - los caminos en un `Path2D` cacheado (E7);
  - el minimapa en un lienzo fuera de pantalla, más los héroes y la cámara por
    fotograma (E8).
- **Pequeños.**
  - Gradiente de sombra cacheado por opacidad (E9).
  - Geometría de los hexágonos cacheada por tamaño de tablero, con `hexKey(hover)`
    calculado una sola vez (E10).
  - `anim.ts`: el desplazamiento de centro de cada stack se cachea, y un único
    `tick(ahora)` por fotograma sustituye a llamar `avanzar()` dentro de los
    *getters*. Así `ocupada` deja de tener efecto lateral (E11).
  - `planes()` del castillo con la versión de la sesión (E12).
  - El tamaño del lienzo por `ResizeObserver` (E13).
- **Medir antes y después**: tiempo de fotograma o CPU en reposo en mapa y en
  batalla, y anotarlo.

### 2. Una sola puerta de entrada en batalla mientras se anima (E17)

Un único chequeo en `main.ts` antes de despachar cualquier `data-action` o clic de
batalla, alimentado por el animador. Hoy `battle-spell`, `finish-battle` y Escape
se cuelan.

### 3. El espectador usa el mismo animador (E18)

El animador se reinicia por `battle.id`, o cuando el log se acorta, y no por la
identidad del objeto. Con eso desaparecen `figuraQuieta` y el caso especial «sin
animador», y el espectador ve cada batalla acción a acción, que es lo que
prometía #30.

### 4. El destello de golpe como superposición (E19)

Se hace con composición (`source-atop`/`lighter`) sobre el fotograma ya pintado,
no como tinte blanco. Así funciona también en figuras con arte y se ahorra una
copia teñida de la hoja.

### 5. `capturas.ts` deja de copiar el cliente (R1–R8)

- Usa `cajaDeFigura`.
- La regla de clic pasa a una función pura exportada de `escenas/batalla.ts`
  (`accionContra`), que usan el cliente y el guion.
- `botonDeRecluta(plot, todo)` exportado de `town.ts`, y lo usan el dibujo,
  `hitAtPixel` y el guion.
- `TILE_INICIAL` y `focoDe(session)` exportados. El zoom pasa por `zoom()`.
- **`tools/qa/servidor.ts`** con `arrancarServidor(envExtra) → {agente,
  espectador, parar()}`, compartido por `capturas.ts` y `verify-agent.ts`.
  Se arranca con `tsx` y no con `npx tsx`, como dice `CLAUDE.md`. `pnpm qa` tiene
  que seguir en verde y en unos 3 s.
- Los tipos del protocolo se importan de `src/server/protocol.ts`.
- `abrir(...)` para las cuatro pasadas.
- Un `rotuloDeDia(day)` compartido por los paneles, el espectador y el guion.

### 6. Núcleo, sesión y escenas usan lo que ya existe (R9–R14)

- `planRecruits` sin las guardas redundantes; usa `recruitCost`.
- `PlanDeRecluta = RecruitCapacity`; `describeHit` acepta `| null`.
- `turnoPropio`, o un getter `stackPropioActivo`, público y leído por la escena.
- Se usan los helpers del núcleo: `activeStack`, `hexEquals`, `isAlive`,
  `objectAt`, `inBounds` y `pointFromKey`.
- Un getter `session.fog`, o `session.jugador`.
- Una sola llamada de liderazgo por fila, y la guarnición y el héroe por el mismo
  camino.

### 7. Dentro de `render/` y `anim` (R15–R22)

- `centroDeStack` en `proyeccion.ts`.
- Una sola rama de golpe en `anim.ts` y `trasImpacto(t)`.
- `deHojaConGolpe`.
- `loadRpgArt()` sin parámetro, con una sola tabla, y `cargarArte(onCambio)`
  compartido por los dos `main`.
- **`loadAssets` solo descarga los grupos que se pintan**: fuera las 29
  peticiones de `creatures` y `terrains`.
- El minimapa deriva sus colores de los pigmentos de `terreno.ts`, o se quita la
  frase que dice que lo hace.
- Se borra `anchoParaPaso` junto con su frase falsa.
- Fuera los parámetros que nadie pasa y el retorno que nadie lee.

### 8. Exports sin consumidor y restos (R23, R24, R26)

- Se quitan los `export` que no tienen consumidor.
- Se borra `generatedCharacterAtlas`.
- Los exports que solo usan los tests se quedan, pero solo si un test los
  necesita de verdad.
- Se borran `.build-list` y `hasArt()`.
- `ajustarLienzo` se comparte entre el juego y el espectador.

## Se aplazan, para la fase del taller de imágenes (issue)

- **Los metadatos del arte salen de la imagen y no se escriben a mano** (E14–E16):
  ancla, altura, número de fotogramas válidos, la caja de clic sacada del alfa,
  la tabla por celda de `map-atlas.png` y el `HORIZONTE` de `campo.webp`.
  - Lo correcto es que un script de `tools/` los calcule y los escriba en el JSON
    de cada hoja.
  - Encaja con el taller, que es quien va a producir las hojas nuevas. Rehacerlo
    ahora sobre arte que se va a sustituir es trabajo tirado.
  - Lo que sí se aplica ahora es que la caja de clic y el dibujo usen **la misma
    función**, con la `cajaDeFigura` única del punto 5.

## Se descarta

- **Mover `src/shared/arte.ts` a `render/`** (R25): ya tiene un consumidor fuera
  del cliente (`tools/qa/capturas.ts`), y el taller será el segundo.
