# El cliente nuevo: los gráficos de la última versión sobre el juego de verdad

## Petición literal

Usuario, 01-10-2026, mientras se verificaba la fase 1a en el cliente original:

> «Veo que estas usando la version primera del juego, usa mejor la ultima que
> tiene mejores graficos»

«La última» es la `/aventura/` que hizo GPT 6. Está archivada entera en la rama
local `archivo/gpt-rpg` (commit `ea94288`). Se lee con
`git show archivo/gpt-rpg:<ruta>` o `git checkout archivo/gpt-rpg -- <ruta>`,
nunca con merge.

El plan general es `~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`.
Este ciclo se adelantó a petición del usuario y va entre la fase 1a (commit
`131978b`) y la 1b.

## Qué se quiere

El juego de estrategia por territorio que se está construyendo (héroes separados
con tropa de individuos, castillos, minas, monstruos, niebla, batalla hexagonal),
**jugado en un cliente con el lenguaje visual de la última versión**, que pasa a
ser **el** cliente en `/`. El cliente original deja de mantenerse y se retira
cuando el nuevo cubra lo mismo.

## Criterios de aceptación

1. **Mapa de aventura** con lo mejor de `aventura/map-view.ts`:
   - superficie de terreno continua (`terrain-surface.ts`), sin cuadrícula a la
     vista;
   - objetos dibujados con `assets/rpg/map-atlas.png`: castillos, minas, cofres,
     monstruos y vegetación;
   - niebla negra sobre lo desconocido y una sombra más tenue sobre lo explorado;
   - zoom con la rueda o con botones, arrastre para mover la vista, centrado en el
     héroe y minimapa.

   Lo que se pinta es el **`GameMap` del núcleo**, no el mundo de GPT. Hay
   **varios héroes por jugador** (no un caballo único) y también héroes rivales.
   Clic para fijar el destino, la ruta se ve, y los puntos de movimiento del día
   también.
2. **Batalla** con la proyección a 25° de la última versión (`combat-layout.ts` y
   las ideas de `tactical-scene.ts`):
   - hexágonos proyectados sobre el suelo y unidades ordenadas por profundidad;
   - casillas alcanzables, objetivos atacables y unidad activa marcados.

   Funciona sobre el `BattleState` del núcleo: individuos (hasta 27 por bando) y
   las acciones legales de `session.ts`, incluidos disparo, espera, defensa,
   hechizos y la resolución automática. Las unidades con atlas se dibujan con
   `render/character.ts` (reposo, marcha y ataque); las que no tienen arte llevan
   un marcador de color legible, porque **el juego se juega sin arte**.
3. **Castillo/base**: construir y reclutar respetando el liderazgo. Reclutar
   enseña cuánto ocupa y cuánto cabe, y el botón «todo» pide **lo que cabe**, no
   todo lo disponible (lo detectó QA de la 1a en el cliente viejo). Con el mismo
   lenguaje visual; no hace falta arte nuevo.
4. **Paneles**:
   - héroe seleccionado, con su tropa agrupada mediante `troopSummary` y el
     liderazgo ocupado del total;
   - recursos y día;
   - crónica;
   - fin de partida, con las cuatro respuestas de `desenlace.ts`.
5. **Contratos de siempre**:
   - El cliente no aplica reglas: todo pasa por `session.ts`.
   - Todo el marcado sale por `html.ts`, y `pintar` es el único `innerHTML`.
   - Nada de `Math.random` (el `sound.ts` de la rama lo usaba: no se rescata, o se
     reescribe sin él).
   - Sin rutas absolutas.
   - Los invariantes de `test/invariantes.test.ts` siguen en verde **sin
     excepciones nuevas**.
   - `?seed=N` sigue fijando la partida y la barra la enseña.
6. **El espectador** sigue funcionando. Si reutiliza el mapa o la batalla nuevos,
   mejor, pero no es obligatorio en este ciclo.
7. **Se juega entero en el navegador**: desde el inicio, mover héroes, recoger,
   construir y reclutar, batallas de varios individuos ganadas y perdidas, pasar
   días y llegar al fin de partida. Sin errores en consola. Con capturas como
   evidencia. Se revisa también a 390×844 (móvil), al menos que se pueda jugar.

## Fuera de alcance

- Todo lo RPG de la rama: la compañía-caballo como único héroe, creación de
  personaje, lugares con escena parallax, PNJ, diálogos, misiones, provisiones,
  salas de entrenamiento y guardado del servidor RPG (`server/rpg/*`).
- Generar arte nuevo (eso es el taller de imágenes, más adelante). Se usa el arte
  que ya existe: atlas del mapa, texturas de terreno, atlas de personajes de la
  rama y sprites de criaturas de `assets/generated/` si los hay.
- Nodos, territorio, fortificaciones y facciones nuevas: son las fases 2 a 4. El
  cliente debe dejar sitio para pintarlos, pero no los inventa.
- Sonido.
- Cambiar reglas del núcleo: el sha de `pnpm banco` (`54a035f0…`) **no se mueve**.

## Contexto del coordinador

- Inventario de la rama hecho el 30-09:
  - **Rescatables tal cual**: `shared/rpg-art.ts`, `render/character.ts`,
    `aventura/terrain-surface.ts`, `scene-motion.ts`, `actor-shadow.ts` y el
    arreglo de cargas duplicadas de `render/assets.ts`.
  - **Adaptables**: `map-view.ts` (575 líneas, atado a `RpgState`/`worldMap`) y el
    gancho `CharacterAppearance` de `render/battle.ts`.
  - **No rescatar**: `tactical-scene.ts` (rompe el invariante del marcado),
    `sound.ts`, `aventura/main.ts`, `creation.ts` y `server/rpg/*`.
  - **Arte aprobado**: el atlas Liora v3, `companions-v3`, `guards-v3` y
    `combat-actions-v1`. `liora-walk-v2` está **rechazado** por el usuario.
- Los acuerdos de arte del usuario (`AGENTS.md` de la rama) siguen valiendo:
  - cámara elevada unos 25°, nunca de perfil;
  - poses de Y Bot;
  - las pruebas técnicas no equivalen a aceptación visual.
- El usuario es quien juzga «mejores gráficos». La evidencia final son **capturas**
  del mapa, la batalla y el castillo, para enseñárselas.
- Assets grandes de la rama, unos 60 MB: rescatar **solo lo que se pinte**, no la
  carpeta entera.

## Decisiones del usuario sobre el plan (01-10-2026)

Plan del arquitecto (opción B) aprobado con estas respuestas:

- **Arte de batalla: «Lo que no tenga arte se usa la base de y_bot».** Nada de
  sprites antiguos de perfil mezclados. Toda unidad sin atlas propio se dibuja con
  el **maniquí Y Bot a 25°**: `assets/characters/y-bot-reference/liora-poses-v3.{png,json}`
  de la rama (celdas de 256, 7 columnas, clips idle/walk/attack ya renderizados por
  sprite-forge a −25°). Se distingue el bando/tipo con color (tinte, aro o
  estandarte) y el nombre en el panel. Se rescata ese par de ficheros además de los
  del plan. El marcador de color plano queda solo como último respaldo si el PNG no
  carga (el juego se juega sin arte).
- **Héroe en el mapa: «La figura del héroe»** a pie (atlas Liora / Y Bot), con aro
  del color del dueño — no el caballo.
- **Rutas: hasta donde llegue hoy**; se ve la ruta entera marcando lo alcanzable
  hoy. Sin cambios de núcleo para rutas de varios días.
- **Móvil: scroll horizontal** en el tablero a 25°.
- **Cámara del tablero (01-10, tras QA): «Inclinar hasta 35°».** El suelo del
  tablero se inclina de 25° hasta 35° cuando sobra alto (escritorio); en móvil se
  queda en 25°. Se acepta a sabiendas que el suelo y las figuras (renderizadas a
  25°) no compartan cámara exacta en escritorio.
