# Heroes of Silence — guía de desarrollo

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y los assets se generan con fal.ai.

El juego es el andamio; lo interesante es lo que se puede enchufar dentro.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas)
pnpm test       # 121 tests: reglas, batalla, partida completa y contrato del agente
pnpm typecheck
```

Para que juegue un **agente** hacen falta dos terminales:

```bash
# terminal 1 — el servidor de la partida
pnpm server

# terminal 2 — Claude Code en esta carpeta; el MCP "heroes" ya está en .mcp.json
#   pídele: "juega la partida: llama a heroes_listen, decide y responde con
#            heroes_respond, y repite"
```

Verificación del circuito entero sin tocar nada a mano:

```bash
npx tsx tools/qa/verify-agent.ts   # arranca servidor + puente MCP y juega turnos
```

## Mapa del repositorio

```
src/core/          TypeScript puro: las reglas. Sin DOM y sin node:*
  battle/          rejilla 11×9, iniciativa, daño, hechizos
  map/             mapa de aventura, pathfinding, niebla, generación
  town/            castillos, edificios, reclutamiento
  hero/            héroes, ejército de 5 stacks, movimiento
  state/           GameState, turnos, batallas del mapa
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod y serialización para el agente
src/server/        bridge WebSocket + puente MCP
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  render/          una escena por pantalla: aventura, castillo y batalla
  views/           los paneles de HTML del lateral
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo
data/              criaturas, edificios y hechizos en JSON editable
assets/generated/  arte generado (lo sirve Vite como estático)
```

## Contratos que no se rompen

- **La lógica vive en `core` y el cliente solo pinta.** El cliente no aplica
  reglas: llama a `session.ts`, que es la única puerta al núcleo. Cuando el
  cliente pase a hablar por WebSocket, cambia esa capa y nada más.
- **`core` es puro.** Nada de `node:*` ni de DOM: por eso los mismos tests
  valen para el navegador y para el servidor.
- **Toda tirada pasa por `createRng(seed)`.** Sin eso no hay partidas
  reproducibles y un test de batalla sería una lotería.
- **Fail-loud.** Una acción ilegal lanza con un mensaje escrito para la persona
  (`no se puede reclutar: solo hay 3 disponibles`), no se corrige en silencio.
  La excepción, documentada en el contrato, son las acciones del agente: se
  descartan una a una y se le devuelve el motivo.
- **El juego se juega sin agente y sin arte.** Sin agente juega `core/ai`; sin
  PNGs, cada renderizador pinta su marcador de color. Las dos cosas tienen
  test.

## Reglas del juego (verificadas contra fheroes2)

| Dato | Valor |
|---|---|
| Rejilla de batalla | 11 × 9 = 99 hexes, offset odd-r |
| Slots de ejército | 5 |
| Recursos | madera, mercurio, mineral, azufre, cristal, gemas, oro |
| Movimiento diario | lo marca la criatura MÁS LENTA (1000–1500) |
| Puntos de hechizo | 10 × Conocimiento |
| Moral y suerte | −3 a +3 |
| Duración de Prisa/Lentitud | poder mágico del lanzador, en rondas |
| Inmunidad de los no-muertos | a la mala suerte: Maldición y `curse_on_hit` |
| Dos efectos del mismo origen | el segundo REFRESCA la duración, no se acumula |

Las cifras de criaturas, edificios y hechizos están en `data/*.json` y se
editan sin recompilar.

**Una divergencia deliberada, para que no parezca un olvido:** en fheroes2 el
`fear` del dragón óseo es un **aura de moral −1**. Aquí es **ataque −2 durante
2 rondas** sobre el stack al que muerde (`src/core/battle/battle.ts`, tabla
`ON_HIT_EFFECTS`). El motivo es que `createBattle` fuerza `morale: 0` a los
no-muertos y **una de las dos facciones lo es entera**: el aura no asustaría a
nadie en un espejo nigromante y el rasgo quedaría medio muerto, que es justo el
bug que se cerró al implementarlo. El ataque sí lo siente un esqueleto, porque
pasa por `effectiveAttack`.

Lo temporal —prisa, lentitud, maldición, miedo— vive en `BattleStack.effects`
(`src/core/battle/effects.ts`) y **nunca se suma al stack**: el total se calcula
al leer, así que caducar es filtrar una lista y no puede descuadrar nada. Y el
mismo origen **refresca en vez de apilarse**, quedándose con la duración mayor:
sin esa regla, dos mordiscos del dragón óseo dejaban −4 de ataque sostenido y
una Lentitud por ronda iba a −2, −4, −6.

## El agente como modelo

Es el patrón de `narrative-mcp` en ne-fan:

1. El agente llama a **`heroes_listen`**, que se queda bloqueado hasta que la
   partida necesita una decisión.
2. Recibe el estado **con el formato de respuesta embebido**: no tiene que
   recordar el esquema entre turnos.
3. Decide y llama a **`heroes_respond`** una sola vez.
4. Vuelve a `heroes_listen`.

Tipos de petición: `adventure_turn`, `battle_turn`, `map_generate` y
`hero_banter`. Y hay tools de consulta (`game_state`, `battle_state`,
`creature_stats`, `spell_list`, `building_list`) para mirar cosas sin volcarse
la partida entera en el contexto.

En `map_generate` el agente **no dibuja**: devuelve un plan declarativo y
`buildMap` lo construye. `validateMapPlan` lo rechaza si algún castillo queda
inalcanzable o si dos objetos comparten casilla.

## La pantalla de castillo

El castillo no es una lista de edificios: es un cuadro con **solares fijos**
(`src/client/render/town.ts`). Cada solar tiene una cadena de mejora que se
levanta en el sitio, y son once para los diecinueve edificios:

| Solar | Cadena |
|---|---|
| `hall` | `village_hall` → `town_hall` → `city_hall` |
| `fort` | `castle` |
| `guild` | `mage_guild_1` → `mage_guild_2` |
| `tavern` · `market` | un solo edificio cada uno |
| `lvl1` … `lvl6` | `<facción>_dwelling_N` → `<facción>_upgrade_N` |

**Las moradas son propias de cada facción**, con sus requisitos y sus costes: el
caballero construye con madera y cristal, el nigromante con mineral y gemas. El
id del edificio *es* el nombre de su PNG (`knight_dwelling_3`), así que la
pantalla lo resuelve con un solo `asset('buildings', id)`.

Y la cadena de la fila de abajo **no siempre tiene dos eslabones**: el
nigromante no tiene `necromancer_upgrade_6` porque el dragón óseo no tiene
criatura mejorada, así que su `lvl6` se ve terminado con la morada. La pantalla
no sabe nada de eso: las cadenas se **derivan del catálogo** (`townPlots`), y lo
que no está en `data/buildings.json` no se puede ofrecer ni cobrar.

Un solar dibuja el último eslabón construido; si le queda alguno, se pulsa y se
levanta. Vacío se pinta como parcela punteada con el nombre de lo que iría ahí,
así que se ve a la vez lo que tienes y lo que te falta. Debajo de cada morada,
su casilla de reclutamiento.

El motivo de un rechazo sale de `buildBlocker`, que ya devuelve la frase escrita
para la persona: la pantalla no reimplementa ni una regla.

## La magia, de punta a punta

Los hechizos existían en el motor mucho antes de que pudiera lanzarlos nadie: se
podía castigar el maná, validar el bando y filtrar por inmunidad, pero **ningún
héroe aprendía un segundo hechizo en toda la partida**. La cadena que faltaba,
en orden:

1. **El gremio enseña por derivación, no por sorteo.** `townSpells(town)` es
   `allSpells()` filtrado por `mageGuildLevel(town)`. No hay libro guardado en el
   `Town` porque no hay nada que sortear: con tres hechizos de nivel 1 y dos de
   nivel 2, el nivel del gremio determina la lista entera. El día que haya
   contenido para sortear, se rellena **dentro de esa función** y ningún llamante
   se entera.
2. **Aprender es sincronía, no acción.** `syncSpellbooks` corre al final de cada
   acción de aventura y empuja al libro del héroe lo que enseñe el pueblo bajo
   sus pies. Un solo punto cubre los tres caminos —moverse allí, contratar allí,
   construir el gremio con el héroe dentro— en vez de tres parches. No lanza,
   porque no hay nada ilegal que rechazar.
3. **`cast` no consume el turno del stack.** Es la pieza que ordena todo lo
   demás: en el cliente, tras lanzar el mismo stack sigue activo; y en la IA,
   lanzar **no compite con atacar**, así que la heurística evalúa el hechizo
   aparte y antes. Modelar una disyuntiva que no existe habría hecho que la IA
   dejara de pegar para lanzar.
4. **El maná vuelve de la batalla.** Sin eso, lanzar salía gratis y la única
   función del gremio —recargarlo— era ficción.

**El motivo de un rechazo lo escribe `castBlocker`**, igual que `buildBlocker` lo
escribe en el castillo, y con el objetivo opcional: sin él contesta «¿puede
lanzarlo sobre alguien?», con él añade vivo/muerto, aliado/enemigo e inmunidad.
Lo consultan los tres: `legalActions` para ofrecer el par, `castHeroSpell` para
rechazar y la pantalla para explicar. Una regla nueva entra por un sitio y llega
a los tres a la vez — antes de unificarlo, `legalActions` reimplementaba sus
cuatro condiciones justo debajo y el cliente redactaba la mitad que faltaba.

**La IA valora en PV equivalentes** y descuenta lo que el objetivo ya tiene
encima: como el mismo origen refresca en vez de apilarse, relanzar una Lentitud
que aún dura dos rondas vale **una ronda**, no tres. Sin esa resta compraba lo
mismo cada ronda y llegaba al mapa sin maná.

**Sabiduría se lee, pero todavía no muerde**: `maxSpellLevel()` recorta el
aprendizaje y el héroe inicial nace con `wisdom: 1`, así que su techo es nivel 3
— y el gremio llega a 2. Es correcto e inerte hasta que exista `mage_guild_3`
(#3), que a su vez espera a que las habilidades se puedan ganar (#6, #15).

## Generación de assets

```bash
pnpm gen                              # simula: qué falta y cuánto costaría
pnpm gen -- terrains --go             # genera de verdad
pnpm gen -- buildings --go --budget 4 # edificios del castillo y sus fondos
pnpm gen -- all --go --budget 4       # todo lo anterior de una vez

npx tsx tools/gen/animate.ts peasant --go   # atlas de poses de una criatura
npx tsx tools/gen/animate.ts --all --go     # las doce criaturas base
```

Sin `--go` no se gasta un céntimo. La caché va por hash del payload, así que
repetir una tanda sale gratis, y el gasto acumulado queda en
`tools/gen/spend.json`. Ojo con `--budget`: es el tope del gasto **acumulado**
del proyecto, no el de la tanda.

Lecciones heredadas de los laboratorios de ne-fan, aplicadas en `prompts.ts`:

- Una textura se describe como **material visto a 90 grados**, nunca como
  lugar: pedir "suelo" mete perspectiva.
- Un tile con un motivo único **canta** al repetirse: se pide liso y uniforme.
- **No se menciona el agua** en un terreno sin agua: alucina ríos.
- El sprite de criatura va de **perfil mirando a la derecha** y en pose neutral
  (nunca en T): el defensor reutiliza el mismo arte espejado.

### Animaciones: un atlas, una llamada

Pedir seis imágenes sueltas da seis personajes distintos. Por eso las poses se
piden **todas en la misma imagen**: se compone una rejilla con el sprite
repetido, se manda junto al sprite como referencia de identidad, y el modelo
repinta cada celda con una pose distinta. Dentro de un atlas la consistencia es
casi perfecta.

Las reglas no son adornos:

- **Diez celdas como máximo.** Con más, el modelo colapsa y pinta la misma pose
  en todas.
- **Rejilla cuadrada-ish.** Un 4×1 hizo que el modelo re-maquetara la hoja.
- **La segunda referencia es identidad, no pose**, y hay que decirlo con esas
  palabras.
- **`echoScore` rechaza** un atlas que vuelve sin repintar, y no lo cachea:
  guardarlo dejaría a esa criatura congelada para siempre.
- El fondo vuelve gris plano, no transparente. `cutout.ts` lo quita por
  **relleno desde los bordes**, no por umbral de color: por umbral desaparecen
  las partes claras del personaje.

Las poses (`idle`, `ready`, `attack`, `hit`, `die`, `win`) las reparte
`src/client/anim.ts` leyendo el registro de la batalla. El motor no sabe que
existen: sin atlas, cada criatura usa su sprite quieto y se juega igual.

## El equipo de agentes

Para un trabajo sustancial hay un ciclo de cuatro roles en `.claude/agents/`,
que se lanza con la skill **`/feature`**:

**crítico** → **arquitecto** → **ingeniero** → **QA**

Arrancan con contexto limpio y no se ven entre sí: todo lo que necesitan viaja
por ficheros en `docs/agents/<tarea>/`. El crítico va primero porque el fallo
más caro del ciclo no es un plan malo, sino un plan **bueno** sobre una tarea
que no había que hacer — y el backlog de este repo son decenas de issues
escritos de una sentada.

Para un cambio de una línea el ciclo es sobrecoste: hazlo y ya.

### Control de calidad, deliberadamente ligero

Nada de puntuación de deuda ni pruebas de mutación: frenan más de lo que
aportan en un prototipo. Lo que hay:

| Comprobación | Cuánto tarda | Cuándo |
|---|---|---|
| `pnpm verify` | 3 s | siempre |
| `test/invariantes.test.ts` | 8 ms | va dentro de `pnpm test` |
| El navegador | minutos | si el cambio se ve |
| `pnpm qa` | ~1 min | si tocas `src/server/` o el contrato |
| `npx tsx tools/qa/barrido-semillas.ts` | ~7 s | si tocas la IA o la economía |

`test/invariantes.test.ts` convierte en tests las fronteras de este documento:
`core` sin `node:*` ni DOM, ni un `Math.random` suelto, `session.ts` como única
puerta del cliente al núcleo, `FAL_KEY` fuera del navegador, que **ningún
rasgo de `CREATURE_TRAITS` esté declarado y muerto** —cuatro lo estuvieron— y
que **cada `EffectKind` tenga un lector vivo**. Todos nacen en verde: un guardia
que nace rojo se ignora desde el primer día.

El de los efectos no busca texto, **llama**: recorre una tabla que asocia cada
tipo con su lector y comprueba que el total cambia al colgar el efecto. Un
lector escrito y muerto no puede satisfacerlo, que es justo el agujero por el
que se colaría el primer hechizo de defensa.

El barrido de semillas no es un test: es una **medida**. Juega 40 partidas de la
IA contra sí misma y cuenta cuántas no terminan en 300 días. Hoy son **2**, y
antes de la magia eran 4 (#47 sigue abierto). Sirve para lo que un test no
puede: distinguir «no empeora» de «tuve suerte con la semilla».

Y un hook `Stop` (`.claude/hooks/verde.sh`) impide dar una tarea por terminada
con `pnpm verify` en rojo. No estorba: no se lanza siquiera si no ha cambiado
nada bajo `src/`, `test/` o `data/` desde la última vez que salió verde.

## Decisiones tomadas

- **MCP antes que API key.** El usuario tiene Claude Max: el agente entra por
  MCP, no por una clave de API.
- **`FAL_KEY` nunca llega al navegador.** Las llamadas salen de scripts CLI en
  el build; el cliente solo carga PNGs.
- **Nada del HoMM2 original.** Los `.AGG` son de Ubisoft. Se reimplementan las
  reglas —que no son protegibles— y el arte se genera.
- **Dos facciones**: caballeros y nigromantes, seis criaturas cada una con sus
  mejoras.
