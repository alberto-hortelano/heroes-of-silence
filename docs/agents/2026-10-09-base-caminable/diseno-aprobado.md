# La base como escena caminable (caballero), con PNJ y narrador

## Contexto
Hoy la pantalla de castillo (`src/client/render/town.ts`, `escenas/castillo.ts`) es un fondo de colinas vacío con 12 cajas fijas (`townPlots`). Cada edificio es un PNG «box art» suelto con su isla de hierba, escalado a su caja, y los solares vacíos son recuadros punteados. Debajo hay una franja de recluta. El usuario quiere «una escena con sentido con todo integrado», con profundidad, por la que te mueves y hablas con gente; un clic en la base la amplía; y que el motor de narrativa pueda usarla.

Decisiones del usuario:
- 25° pintado oscuro.
- Un solar sin construir no se pinta.
- Arte por Codex.
- Este ciclo: motor más arte del caballero; el nigromante va después, con marcadores.
- Camina el héroe y, si no hay, un alcaide.
- PNJ con narrador ya.

Datos comprobados:
- La base nace con `village_hall` y `knight_dwelling_1`, sin castillo.
- `pnpm banco` solo calcula el hash de `state.log`.
- El `Session` del navegador juega en local y nunca habla con el agente.
- El espectador no tiene pantalla de castillo.

## Cómo se ejecuta
Con el ciclo `/feature`, en `docs/agents/2026-10-09-base-caminable/`:
- `requisitos.md` lleva las citas literales y las decisiones de arriba.
- Después vienen crítico, arquitecto (este diseño como entrada), ingeniero, `/simplify` y QA.
- El arte va por Codex en paralelo desde la fase 1.
- El usuario revisa el arte antes de commitear.
- Siempre con `--port`, nunca el 3100.
- Sin push.
- No se toca el generador del mapa (#226).

## Diseño
**1. Dónde vive cada hecho**
- Núcleo, `src/core/town/sitios.ts`:
  - `sitiosDeLaBase(faccion)`: `{id, cadena}[]`, que es `townPlots` sin geometría. Ids: `fort, hall, guild, tavern, market, armory, lvl1…lvl6`.
  - `siguienteDe(town, sitio)`.
  - Lo leen el panel, la validación de voces y el agente.
- `data/bases/<faccion>.json`, que el núcleo no lee:
  - `ancho` y `alto` del fondo;
  - `suelo`, un polígono caminable en píxeles del fondo;
  - `entrada`;
  - `sitios[id] = {ancla, puerta, ancho}`;
  - `vecinos[id] = {en, mira}`.
  - Las huellas de los edificios quedan fuera del polígono: el suelo no cambia al construir.
- `src/shared/base.ts`:
  - `disposicionDe(faccion)`, que valida y lanza si falta o sobra un sitio, si una puerta, la entrada o un vecino cae fuera del suelo, o si un ancla cae dentro;
  - `pasoEnElSuelo`;
  - `PROMPT_DE_SUELO`, que lee el taller.
- Proyección sin perspectiva: plano = píxel del fondo, la figura de alto constante y la profundidad por la y del pie.
  - Edificios y figuras van en una sola lista ordenada, como `fundirPorProfundidad` (`render/mapa.ts:671`).
- Cámara: `src/client/render/base/camara.ts`. El fondo cubre el lienzo y la vista sigue a quien camina, con tope; en móvil, una ventana.

**2. Interacción** (`escenas/castillo.ts` reescrita y `src/client/render/base/`)
- **Quién camina**, estado solo del cliente:
  - el héroe si `heroeEnElPueblo`;
  - si no, el alcaide de `data/vecinos.json`.
  - Se pinta con `pintarFiguraConSombra` (`render/figura.ts:366`) y el clip `walk`.
- **Cómo camina** (`base/camino.ts`):
  - Si el segmento cabe en el polígono, en recta.
  - Si no, Dijkstra por los vértices reflejos.
  - Un clic fuera del suelo se recorta al punto más cercano dentro.
  - La velocidad sale de `ZANCADA` (`marcha.ts`).
  - Se reutilizan `porElCamino`, `miradaEnElTramo` (`anim.ts`), `direccionEnPantalla` (`direccion.ts`) y `animarHasta`.
- **Golpe** (`base/golpe.ts`), por orden de profundidad:
  1. PNJ;
  2. edificio, por máscara de alfa a 1/4; con marcador, por su caja;
  3. suelo.
- **Qué abre cada clic.** Se camina a la puerta y, al llegar, se fija `abierto`:
  - ayuntamiento o castillo → `ampliar`;
  - otro edificio → `sitio`;
  - PNJ → `pnj`.
  - Un clic en el suelo cierra lo abierto.
- **Paneles** (`views/base.ts`, partiendo `renderTownPanel` de `panels.ts:591`; `abierto` entra como parámetro de `renderSide`):
  - **Ampliar:** lo construible con su coste (`maquetarCoste`) y su motivo de bloqueo (`buildBlocker`). Sustituye a los solares vacíos.
  - **Morada:** «+1» y «Todo» (`recruitPlan`). Sustituye a la franja de recluta.
  - **Gremio**, **armería** y **taberna** (contratar héroe).
  - Lo general sigue debajo.
- **Conversación:** un `<dialog id="conversacion">` no modal, rellenado con `pintar`/`html`.
- **Se retiran** `townPlots`, `solarVacio`, `drawRecruitStrip` y `botonDeRecluta`.

**3. Narrador**
- `data/vecinos.json`:
  - un encargado por sitio construido (`{papel, cuerpo, frases[]}`), con el cuerpo de una criatura del catálogo teñida;
  - vecinos y alcaide por facción.
- Núcleo, `src/core/town/voces.ts`:
  - `vecinosDeLaBase`;
  - `vozDe`: la voz narrada o, si no la hay, una de respaldo con `createRng` local, sin tocar la corriente de azar de la partida;
  - `vocesCaducadas`: semana nueva o edificios distintos;
  - `vocesBlocker` y `ponerVoces`.
- Dato: `Town.voces?` es opcional, al final, y no escribe ningún hecho en la crónica, así que el banco no cambia.
- Contrato:
  - `town_voices` entra en `REQUEST_KINDS`, `responseSchemas` y `RESPONSE_FORMAT` (`contract/agent.ts`).
  - Esquema: `{voices:[{npc, lines: lineaLegible(160)[1..3]}] ≤12}`.
  - `serializeTownVoices`, con base, PNJ, línea actual, guarnición, héroe, `cronicaPara(…,10)` y la instrucción «presentación, nunca reglas».
  - Su `EN_SU_LUGAR`, su rama en `tools/qa/politica.ts` y su línea en `mcp/server.ts`.
- Se pide en `Director.voces`, tras `ascensos` (`director.ts`), solo para las bases del agente y solo si caducaron. Un fallo se anota y no detiene el turno.
- Se ve en el espectador: `VistaPueblo.voces` y su inversa en `adaptar.ts`, más una sección «Voces de la base».
- **Límite declarado:** el cliente local nunca tiene agente y usa siempre el respaldo.

**4. Arte del caballero** (`tools/taller/base.ts`, siguiendo `tools/taller/edificios.ts`)
- **Fondo** de 1536×1024:
  - El prompt se genera desde la disposición: huella caminable y solares como suelo liso, sin cimientos.
  - Lleva calles y una muralla baja.
- **20 edificios:** villa, castillo, gremio 1-2, taberna, mercado, armería y las moradas y mejoras 1-6.
  - Peana integrable y sin sombra pintada.
  - Cada mejora lleva su morada como referencia.
  - El ancla se obtiene con `derivar.ts`.
- Destino: `assets/bases/knight/`.
- `pnpm taller vista-base` superpone polígono, puertas y anclas sobre el fondo. Sirve para revisar y para ajustar el JSON al cuadro.
- Sin arte: el suelo es un polígono entonado y cada edificio un bloque con su nombre, que es como queda el nigromante.

## Fases dentro del ciclo
1. `sitiosDeLaBase`, `data/bases/*.json` provisionales y `shared/base.ts`, con sus tests.
2. Motor con marcadores: escena, camino, golpe, cámara, paneles, diálogo y respaldo. Retirar franja y solares. Al cerrar esta fase el juego se juega entero sin arte.
3. Narrador: voces, contrato, director, política, MCP, espectador y `pnpm qa`.
4. Arte del caballero (en paralelo desde la fase 1): revisión del usuario y ajuste de la disposición.

**Siguiente ciclo:**
- arte del nigromante;
- escena en el espectador;
- narrar la base del humano en partida servida;
- figuras propias para los PNJ;
- vecinos que pasean;
- WASD;
- retirar `assets/generated/{buildings,towns}`.

## Verificación
- Tests nuevos:
  - `test/base-disposicion.test.ts`: sitios = catálogo, puertas, entrada y vecinos dentro del suelo, anclas fuera;
  - `test/base-camino.test.ts`: recta, rodeo de una esquina, recorte, y ningún tramo fuera;
  - `test/voces.test.ts`: blocker, caducidad y respaldo determinista;
  - ampliar `agent-contract`, `qa-politica` y `agent-link`.
- `test/escenas.test.ts` con Session real:
  - clic en el ayuntamiento → `ampliar`;
  - morada → «Todo» → `recruitAll`;
  - PNJ → diálogo.
- Invariantes, que hay que ver morder:
  - `core` no lee `data/bases/`;
  - `render/base/` no cambia el estado fuera de `Session`;
  - el diálogo se rellena solo con `pintar`.
- Órdenes:
  - `pnpm verify`;
  - `pnpm qa`, con un `town_voices` y su veredicto;
  - `pnpm banco`, con el mismo hash;
  - `pnpm verify:lento` con el arte;
  - `pnpm capturas`: rehacer desktop-04/05/05b/05c, nuevas 05d (ampliar) y 05e (conversación), y movil-02 con la cámara siguiendo;
  - ver la escena en `pnpm dev --port <libre>` con Playwright.
- Documentación: `docs/historia.md` (sustituye a «cuadro con solares fijos») y CLAUDE.md (la línea «Castillo» y la tabla de puertas: `sitiosDeLaBase`, `vozDe`).

## Riesgos
- Codex no respeta la zona reservada: se ajusta el polígono al cuadro.
- El fondo se ve blando en 2560 px: se pide en dos mitades si hace falta.
- Conflicto con la rama asalto en `Town`: un solo campo opcional.
- Tener que caminar para todo: marcha rápida y el ayuntamiento junto a la entrada.
