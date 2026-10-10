**VIGENTE**, con dos precisiones a `requisitos.md` (contratar héroe no es de la taberna; la muralla del fondo no es la del castillo) y un riesgo de coste del narrador que el arquitecto debe medir.

## El problema real

La base es un tablero de cajas (`townPlots`, `src/client/render/town.ts:94`, 12 rectángulos con `x/y/w/h` fijos) con PNG sueltos y parcelas punteadas: no es un lugar, y por eso el narrador no tiene dónde ni con quién hablar. La solución aprobada (escena con suelo, figuras y PNJ con voz) ataca eso mismo.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| La base nace con `village_hall` y `knight_dwelling_1`, sin castillo | `village_hall` es `prebuilt` (`data/buildings.json:6`); `castle` cuesta 5000 + 20 + 20 (`:9`). Cierto |
| 20 edificios del caballero | Sí: 9 de villa + 6 moradas + 5 mejoras (contado en `data/buildings.json`); el nigromante, 19 |
| `townPlots` pasa al núcleo «sin geometría» | Hoy vive en el **cliente** (`render/town.ts:94`, con `solaresDeVilla` en `:64`), no en `core`. Moverlo es correcto (lo usa solo `buildingsOfFaction`), pero es una mudanza, no una extracción: `test/castillo.test.ts` (10 usos) y `tools/qa/capturas.ts` (4) lo leen |
| `renderTownPanel` en `panels.ts:591` | Cierto (`views/panels.ts:591`), lo llama `renderSide` (`:162`, `:165`) |
| `fundirPorProfundidad` en `mapa.ts:671` | Cierto (`render/mapa.ts:671`) |
| `pintarFiguraConSombra` en `figura.ts:366` | Cierto |
| Clip `walk` | Existe (`marcha.ts:42` `ZANCADA.walk`; `anim.ts:532`). CLAUDE.md lista 6 acciones sin `walk`, pero el código lo usa en el mapa: no bloquea |
| `porElCamino`, `miradaEnElTramo`, `direccionEnPantalla`, `animarHasta` | Existen (`anim.ts:187`, `anim.ts:162` **no exportada**, `direccion.ts:37`, `figura.ts:41`). Hay que exportar `miradaEnElTramo` |
| `Director.ascensos` como punto de enganche | Cierto (`server/director.ts:249`, llamado en `:316` antes de `adventure_turn`); su patrón de «fallo anotado, no detiene el turno» (`:286-293`) es el que pide el criterio 8 |
| `lineaLegible` | Existe en `contract/agent.ts:229`, privada; `REQUEST_KINDS` en `:345`, `EN_SU_LUGAR` en `server/notas.ts:497`, rama en `tools/qa/politica.ts:151`, prosa en `server/mcp/server.ts:256`. Todos los sitios citados existen |
| `pnpm banco` solo hashea la crónica | Ganador, día y crónica (`tools/qa/banco.ts:13`, `:822`). `Town.voces?` sin hecho en la crónica no lo mueve, y el banco juega sin agente |
| `VistaPueblo` para el espectador | Existe (`server/vista-espectador.ts:88`), con `buildings`; añadir `voces` es un campo |
| **Criterio 6: «taberna (contratar héroe)»** | **Falso como regla.** `hireHero` (`core/state/game.ts:1597-1607`) no pide taberna: pide pueblo propio, hueco, oro y que no haya héroe dentro. El botón hoy sale sin taberna (`panels.ts`, rama `heroeAqui === undefined`), y la base nace sin ella. Si contratar solo se ofrece al pulsar la taberna, la persona pierde en el cliente algo que el núcleo, la IA (`ai/strategy.ts:474`) y el agente siguen pudiendo: una regla escrita en la pantalla |
| «Conflicto con la rama asalto en `Town`» (riesgo del diseño) | No existe hoy: asalto hace murallas **de batalla** en la arena (`heroes-asalto/docs/agents/2026-10-09-murallas-en-la-arena/plan.md`: `core/battle/muralla.ts`, `BattleState`, `SesionDeArena`). No toca `Town` |

## El día después

- **Para quien juega:** cambia la pantalla entera del castillo; las reglas, ninguna. Es lo pedido.
- **Lo que se pierde:** hoy «se ve a la vez lo que tienes y lo que te falta» (`docs/historia.md:2211`). Con el solar vacío invisible, lo que falta solo se ve en «Ampliar». Es decisión del usuario; que la crítica lo deje dicho.
- **Huecos invisibles:** las huellas de los solares quedan fuera del polígono aunque estén vacíos, así que habrá suelo pintado liso que no se pisa. El criterio 3 («al punto más cercano dentro») lo cubre, pero se notará: que QA lo mire.
- **Narrador sin lector local:** el `Session` del navegador nunca tiene agente, así que en la escena caminable **siempre** se oye el respaldo; las voces narradas solo se leen en la lista del espectador. Está declarado como límite y el usuario eligió «con narrador ya». No es objeción, pero el valor visible de la fase 3 este ciclo es el contrato en sí.
- **Coste por turno del agente:** caducar «cuando cambian sus edificios» dispara un `town_voices` cada día que el agente construye (uno por día y base, `builtToday`, `game.ts:966`). Hoy el agente hace ~1 petición por día (`adventure_turn`); esto puede **casi doblarlas** en la fase de construcción. Que `pnpm qa` / una partida con agente cuente cuántas salen antes de darlo por bueno.
- **Lo que queda por borrar:** `assets/generated/{buildings,towns}` (en «siguiente ciclo»), y la sección de `historia.md:2188-2215`, que se sustituye.
- **CLAUDE.md:** no contradice ningún contrato. Encaja con «lógica en core» si contratar no se ata a la taberna (arriba) y si `sitiosDeLaBase` vive en `core` y la geometría en `data/bases` (que el núcleo no lee: el guardia del diseño lo vigila).

## Conflictos

Ninguna otra rama tiene commits sobre `main` (`git log main..<rama>` vacío en asalto, combate; mapa-grande-226 y rampa-muesca están **detrás** de `main`); su trabajo está sin commitear, así que lo juzgo por sus `docs/agents/`:
- **asalto** (murallas en la arena): toca `core/battle`, `SesionDeArena` en `session.ts`, `arena/paneles.ts`. Solape solo textual en `session.ts` (otra sección). Sin conflicto de fondo. **Dependencia futura:** `castle` lleva `grantsWalls` (`buildings.json:9`; `hasWalls` sin llamantes, #7). El fondo con «muralla baja» siempre pintada no debe leerse como la muralla que da el castillo, o el asedio de mañana contradirá la escena.
- **combate** (exploración del combate): mide el núcleo; no toca `Town` ni el contrato.
- **mapa-grande-226**: re-ancla `pnpm banco` (`plan.md:46`). El «mismo hash» del criterio 11 es respecto a la `main` sobre la que se cierre; si entra #226 antes, se compara con su ancla.
- **rampa-muesca**: escenógrafo del mapa; nada en común.
- **`tools/qa/capturas.ts`**: este ciclo reescribe el tramo del castillo (`:1037-1105`, `:1438`); cualquier rama que retoque capturas (el último commit de mapa-grande, 4a9de71, lo hizo) chocará ahí al fusionar. Fusionar después y rehacer.
- **Backlog:** #5 y #20 caen en el panel de cada edificio (fuera de alcance, bien). #14 (el mercado no hace nada): su panel quedará vacío; que diga eso y no invente acciones. #3 (gremio 3-5) no afecta: las cadenas se derivan.

## Coste contra valor

Grande (cuatro fases, 21 imágenes, una petición nueva al agente), pero cada fase deja el juego jugable y el usuario lo aprobó con sus decisiones. No hacerlo deja la base como el punto más pobre de la pantalla y al narrador sin escenario. Vale.

**Lo que no debería hacerse:** atar contratar héroe a la taberna; pintar en el fondo una muralla que parezca defensa; tocar `core/battle`, `state/game.ts` más allá de leer, o el generador.

## Qué le cambiaría a `requisitos.md`

Sustituir en el criterio 6:

> 6. Un clic en una morada lleva a su puerta y abre su reclutamiento («+1» y «Todo» con el
>    mismo resultado que hoy). Los demás edificios abren lo suyo: gremio (lo que enseña),
>    armería (comprar), taberna. **Contratar héroe no requiere taberna** (`hireHero` no la
>    pide y la base nace sin ella): sigue a mano sin construir nada, como hoy, en el
>    ayuntamiento o en lo general; la taberna puede repetirlo, no quedárselo.

Añadir a «Contexto», en «Datos comprobados»:

> - `castle` da murallas (`grantsWalls`, #7, en curso en la rama asalto): la muralla baja del
>   fondo es cerca de villa, no la del castillo.
> - `town_voices` puede salir un día sí y otro también mientras el agente construye: medir
>   cuántas peticiones añade por partida en `pnpm qa`.
