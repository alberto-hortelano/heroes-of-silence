# La magia se juega — requisitos

## Petición

> «Ya estamos de vuelta, continua»

El usuario retoma el backlog tras cerrar el barrido de bugs (`cb50aa4`). **La
elección del racimo es del coordinador**, no suya: se ha tomado por continuidad
con el ciclo anterior y está sujeta a que la corrija.

El racimo es **#2 · #3 · #4 · #24**, la magia. El motivo no es temático: el
ciclo anterior construyó el modelo de efectos (`src/core/battle/effects.ts`)
declarando explícitamente que era el sustrato que la magia necesitaría después,
y el crítico dejó probado que **hoy no puede lanzar un hechizo nadie**. Siete
hechizos implementados y ni un camino para usarlos es el mayor «declara y no
cumple» que queda en pie.

## Estado verificado (ejecutado, no supuesto)

| Hecho | Dónde |
|---|---|
| **Nada escribe en `hero.spells`** | el héroe inicial nace con `['magic_arrow']` (`setup.ts:76`), el contratado con `[]` (`game.ts:405`) |
| El motor de lanzamiento está **entero** | `castHeroSpell` valida conocimiento, maná, ronda, bando y objetivo vivo (`battle.ts:709-750`) |
| `legalActions()` **ya ofrece los `cast` legales**, y ya filtra por inmunidad | `battle.ts:783-797` |
| `maxSpellLevel()` existe y **no lo lee nadie** | `hero.ts:72-76` |
| El gremio solo sirve para **recargar maná** y pintar un número | `game.ts:247`, `panels.ts:167` |
| Solo hay `mage_guild_1` y `mage_guild_2` | `data/buildings.json` |
| **Dos hechizos son inalcanzables por construcción** | `lightning_bolt` y `cure` son de nivel 3 y no hay edificio que dé nivel 3 |
| La IA **nunca** considera `cast` ni `wait` | ni una mención en `tactics.ts` |
| El cliente solo emite `defend` y `wait` | `main.ts:290-293` |

La cadena, y por eso van juntos: **#2 llena `hero.spells`** → **#4** deja que el
jugador los lance → **#24** deja que la IA los lance → **#3** hace alcanzable lo
que ya está escrito.

## Criterios de aceptación

### #2 — el gremio enseña
1. Al construirse un gremio, el pueblo obtiene su conjunto de hechizos, y **la
   tirada pasa por `createRng`**: misma semilla, mismo libro.
2. Un héroe que está en un pueblo con gremio **aprende** los hechizos de ese
   gremio, sin duplicados.
3. `maxSpellLevel()` pasa a leerse de verdad: un héroe sin Sabiduría no aprende
   nada por encima de nivel 2, y el que la tiene aprende hasta `2 + nivel`.
4. Un héroe contratado deja de estar condenado a no lanzar nada en toda la
   partida.
5. La pantalla de castillo muestra **qué enseña** el gremio, no solo su nivel.
6. Test determinista por semilla que demuestre 1, 2 y 3.

### #3 — los cinco niveles
1. `data/buildings.json` define `mage_guild_3`, `_4` y `_5`, encadenados por
   `requires` y con coste creciente.
2. **Ningún nivel de gremio queda sin hechizos que enseñar.** Si el contenido no
   da para llenarlo, se dice aquí por qué y no se construye ese nivel — un
   edificio que no enseña nada es el mismo bug que acabamos de cerrar.
3. El solar `guild` encadena los eslabones que existan, **derivándolos del
   catálogo**: `townPlots()` ya lo hace, así que la pantalla no aprende ninguna
   regla nueva.
4. La IA sigue construyendo gremio (hoy prioridad 40 en `strategy.ts:181`) y no
   se queda atascada en un eslabón que no puede pagar.

### #4 — el jugador lanza
1. Durante la batalla se ve **el maná del héroe y su libro de hechizos**.
2. Se elige hechizo y objetivo con el ratón, y lo que se emite es **una acción
   de `legalActions()`** — el cliente no construye la acción a mano ni
   reimplementa ninguna regla.
3. Lo que no se puede lanzar no se ofrece; si el jugador lo intenta igual, ve el
   motivo escrito para una persona.
4. La crónica cuenta el lanzamiento en prosa: el registro ya emite `cast`
   (`battle.ts:735-742`), lo que falta es contarlo.

### #24 — la IA lanza
1. `chooseBattleAction()` considera `cast` y `wait`.
2. Elige **con criterio**, no por orden de lista: daño cuando rinde más que
   atacar, prisa/lentitud/bendición/maldición con una heurística defendible.
3. Test determinista: con maná y un hechizo de daño, lo lanza cuando es la mejor
   jugada; sin maná, no lo intenta.
4. No degrada lo que ya funciona: `pnpm verify` verde y las partidas IA contra
   IA siguen terminando. **Ojo con #47**: un ~10 % ya no terminaba antes, así
   que la medida es *no empeorar*, no *arreglar eso*.

## Fuera de alcance

Se dice para que nadie lo amplíe por su cuenta:

- **#26 (contenido)** salvo los hechizos mínimos que exija el criterio #3.2.
  Nada de masivos, de área, resurrección, invocación ni dispel: eso es **motor
  nuevo**, no datos, y es otra tarea.
- **Hechizos de mapa de aventura** (Ciudad Puerta, Vista, Convocar barco).
- **#7** asedio, **#11** artefactos, **#6** subida de nivel, **#15** el resto de
  habilidades secundarias más allá de que Sabiduría por fin se lea.
- **#47, #48, #49, #50**: el backlog que dejó el ciclo anterior.
- **Arte nuevo: presupuesto de fal.ai = 0 €.** Si un hechizo pide icono, se
  pinta con el marcador de color, como todo lo demás sin PNG.

## Preguntas abiertas, con su suposición por defecto

1. **¿Cuántos hechizos por nivel de gremio?** Por defecto, el reparto del
   original — 3+3+2+2+1 —, y si no hay contenido para llenar un nivel, manda el
   criterio #3.2.
2. **¿Se añaden hechizos a `data/spells.json`?** Por defecto **sí, los mínimos,
   y solo de un `kind` que el motor ya sepa resolver**: `damage`, `speed`,
   `luck`, `heal`. El modelo de efectos ya admite `attack`, así que un
   Ardor Sanguíneo sale gratis; `defense` sería un `EffectKind` más, simétrico.
   Cualquier hechizo que pida motor nuevo se descarta y va a #26.
3. **¿Cuándo tira el gremio sus hechizos?** Por defecto, **al construirse**, con
   `createRng`. La alternativa —al crearse el pueblo— guarda un libro que quizá
   nunca se ve.
4. **¿Ve el agente lo que enseña un pueblo?** Hoy `serialize.ts:74` manda solo
   `mageGuild: <nivel>`. Por defecto **se añade la lista de hechizos**, y
   entonces el esquema zod y la prosa de `RESPONSE_FORMAT` viajan juntos y entra
   **`pnpm qa`** en la verificación.
5. **¿Aprenden todos los héroes del jugador o solo el que visita?** Por defecto
   **solo el que está en el pueblo**, como el original.

---

# Correcciones tras la crítica

`critica.md` devolvió **#2 REENCUADRADA · #3 PREMATURA · #4 VIGENTE · #24 VIGENTE**.
Lo que sigue **manda sobre lo escrito arriba** donde se contradigan.

## Tres premisas mías eran falsas

1. ~~«Hoy no puede lanzar un hechizo nadie».~~ **El agente por MCP sí puede**, y
   solo `magic_arrow`: `legalActions()` se lo ofrece y el esquema zod lo acepta
   (`agent.ts:37`), comprobado sobre partida real con semilla 7. Lo cierto es
   más estrecho: **no puede la persona, no quiere la IA de reglas, y ningún
   héroe aprende un segundo hechizo en toda la partida.**
2. ~~«`townPlots()` deriva el solar del gremio».~~ Deriva **las moradas**. El
   gremio está escrito a mano en `SOLARES_DE_VILLA`
   (`src/client/render/town.ts:38`), con `chain: ['mage_guild_1','mage_guild_2']`.
3. ~~«La crónica no cuenta el `cast`».~~ **Ya lo cuenta** (`panels.ts:278`), con
   el id crudo y sin decir sobre quién.

## La cadena no era una cadena

Es un **abanico**. #4 y #24 **no dependen de #2**. Las dos únicas aristas reales
son **#2 → #3** y **#2 → #24.2**. El orden de trabajo es **#4 · #2 · #24**, y #4
va primero por ser lo único desbloqueado hoy y lo único visible desde la primera
partida.

## Decisiones del usuario

### #3 sale del racimo

El racimo es **#4 · #2 · #24**. #3 no se toca: los niveles 3-5 no los puede
aprender nadie mientras Sabiduría sea inobtenible (#6, #15) y el contenido de
4-5 es #26. Va al racimo de #6+#15, y se comenta así en el issue **al cerrar el
ciclo**, sin cerrarlo.

**Consecuencia buena: no se añade ni un hechizo.** `data/spells.json` no se
toca, y con ello se cae la pregunta abierta 2: ni `attack` ni `defense` entran —
el crítico midió que cuestan cuatro y seis sitios de motor, no son datos.

### Sabiduría: se aplica la puerta y se da de salida

`maxSpellLevel()` se lee de verdad **y** el héroe inicial nace con `wisdom` en
`setup.ts:77`, igual que ya nace con `logistics`. Es un dato, no motor.

**Tensión reconocida, que no se disimula**: con #3 fuera el gremio llega a nivel
2, así que la puerta devuelve 3 y **no muerde en partida real** hasta que exista
un gremio de nivel 3. Queda leída, probada en test y correcta el día que #3
aterrice. El héroe contratado sigue sin habilidades: eso es #6/#15.

### El contrato del agente entra

El pueblo pasa a mandar **qué enseña su gremio**, no solo el nivel
(`serialize.ts:74`). Esquema zod y prosa de `RESPONSE_FORMAT` viajan juntos, y
**`pnpm qa` entra en la verificación**.

## Criterios corregidos

- **#2.1 se borra**: con 3 hechizos de nivel 1 y 2 de nivel 2 para los huecos
  que hay, **no hay nada que sortear** — el libro lo determina el nivel del
  gremio. No se escribe un sorteo que sortea una sola posibilidad. Vuelve con
  #26, y hasta entonces el `createRng` que exige `CLAUDE.md` no aplica porque no
  hay tirada.
- **#2.6** deja de pedir «determinista por semilla» para el sorteo inexistente:
  pide test de que el héroe aprende lo que el gremio enseña, sin duplicados, y
  de que la puerta de Sabiduría recorta.
- **#2.5** (la pantalla muestra qué enseña el gremio) **se mantiene**.
- **#4.4 se estrecha**: la crónica ya pinta `cast`; aquí solo se pone el
  **nombre** del hechizo en vez del id. Quién se lo lanzó a quién es **#18** y no
  se hace aquí.
- **#24.4 cambia de medida**: se mide sobre **40 semillas**, no sobre las tres de
  `game.test.ts`, que están elegidas a mano para esquivar #47. Línea base medida
  hoy: **4 de 40 no terminan en 300 días — las semillas 9, 18, 24 y 34**.
  Cambiar una semilla de un test **no** cuenta como pasar.
- **#24, fuera de alcance explícito**: el contraataque, el orden de iniciativa y
  proteger a los propios tiradores. El issue los menciona; aquí solo entran
  `cast` y `wait`.

## Backlog que deja la crítica

Al cerrar el ciclo, a issues de GitHub:

- El solar `guild` de `SOLARES_DE_VILLA` está **escrito a mano**: el día que
  alguien añada `mage_guild_3` a los datos, la IA podrá construirlo y la persona
  no podrá pulsarlo — el solar se verá terminado. Derivarlo del catálogo, como
  ya se hace con las moradas.
- `levelFromExperience` (`hero.ts:133`) no lo llama nadie: `hero.skills` es
  inescribible en partida. Es el bloqueo real de #3, y pertenece a #6/#15.

---

# Visto bueno al plan

El usuario aprobó `plan.md` con tres decisiones sobre lo que el arquitecto dejó
abierto o propuso como backlog:

1. **La copia del maná entra ahora.** `settleBattle` (`game.ts:635`) y su
   simétrica del defensor (`game.ts:709`) devuelven el maná al héroe. Está fuera
   del alcance literal del racimo y entra igual porque sin ella #4 entrega un
   recurso decorativo y la recarga del gremio es ficción. **Su riesgo se mide en
   el barrido de 40 semillas**, no en otro sitio.
2. **`wait` entra, midiendo por separado.** El barrido se corre **antes** de
   tocar `wait` y después, para saber cuál de los dos cambios movió la aguja si
   se mueve. Señal de alarma: una batalla que llegue a `MAX_ROUNDS` por
   agotamiento cuando antes no llegaba.
3. **El guardia de `EffectKind` se adelanta a este ciclo**, a
   `test/invariantes.test.ts`: un test que exija un lector por cada `EffectKind`.
   Nace verde —`speed`, `luck` y `attack` tienen lector— y muerde el día que #26
   añada `defense`. Es el mismo patrón del guardia de `CREATURE_TRAITS` del ciclo
   anterior. **Sale del backlog propuesto**; los otros tres se quedan en él.
