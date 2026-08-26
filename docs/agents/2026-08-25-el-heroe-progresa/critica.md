# Crítica — el héroe progresa

**REENCUADRADA.** Hay una cadena real, pero va **al revés** de como la escribe `requisitos.md`:
el eslabón que da por resuelto —«la experiencia se acumula»— es el único roto, y el que declara
bloqueado —el gremio— es el único que rinde algo hoy. Por issue: **#6 PREMATURA · #15
REENCUADRADA · #3 REENCUADRADA** (su mitad barata es VIGENTE hoy; los niveles 4 y 5,
PREMATUROS).

## El problema real, en una frase

Un héroe no cambia en toda la partida — y no porque nadie llame a `levelFromExperience()`, sino
porque **ningún héroe llega ni a la mitad de la experiencia del nivel 2**, así que llamarla no
cambiaría un solo número.

## La premisa, afirmación por afirmación

**1 · «La experiencia se acumula, `hp * level * 2` por stack destruido». PARCIALMENTE FALSA, y
es lo que hunde el racimo.** `experienceFor` (`src/core/state/game.ts:1137-1146`) suma sobre los
stacks `defender` **sin mirar `s.count` y sin mirar si el stack murió**; `createBattle` sí
guarda el recuento (`src/core/battle/battle.ts:95`) y nadie lo lee, así que un stack de 100
campesinos y uno de 1 valen **2 puntos los dos**. Y solo cobra **el atacante, y solo si gana**
(`game.ts:1120-1121`): un héroe que **defiende** y repele el ataque no gana experiencia nunca —
y `CLAUDE.md` dice que el agente defiende.

**Medido**, 40 semillas, bucle idéntico al de `playAiGame` con instantánea tras cada turno para
no perder a los héroes que mueren: **65 héroes, exp pico mín 2 / mediana 68 / máx 458, umbral de
nivel 2 = 1000, 0 de 65 llegan.** Partidas de 6 días de mediana (máx 18); la más larga (semilla
17) acabó con 458, o sea ~25 exp/día: el nivel 2 caería hacia el día 40 y el nivel 5 (2744)
hacia el 110. La curva de `hero.ts:145-148` y el surtidor de `game.ts:1137` están **descuadrados
por un factor ~15**, y eso no lo dice ningún issue.

**2 · «El inicial nace con `logistics: 1`; el contratado con `{}`». La segunda mitad es cierta,
la primera FALSA.** `src/core/state/setup.ts:81` es `skills: { logistics: 1, wisdom: 1 }`: el
héroe inicial **ya tiene** la Sabiduría que el racimo va a buscar.

**3 · «`maxSpellLevel()` es inerte porque sin gremio 3 no hay hechizo que recortar». CIERTA en
el efecto, FALSA en la causa —y la causa decide el alcance.** Los hechizos de nivel 3 **ya
existen**: `data/spells.json` trae `lightning_bolt` y `cure`, completos de punta a punta
(`castSpell` en `src/core/battle/spells.ts:88-107`, rama `heal` incluida; valoración de la IA en
`tactics.ts:74-105`). Falta **el edificio**: `data/buildings.json:10-11` para en `mage_guild_2`.
El propio #3 lo dice —«inalcanzables **por construcción**»—, así que el criterio 16 («hacen
falta más hechizos, y ese es el trabajo de verdad») contradice a su issue de origen.

## El día después

**#6 tal como está escrito no cambia nada para quien juega**: 0 de 65. El criterio 19 lo
confirma por la puerta de atrás —el barrido seguiría en 0/40 **porque nadie sube de nivel**, no
porque el cambio sea inocuo— y el criterio 4 («más de un nivel de golpe») diseña para un caso
imposible.

**Y el gremio 3-5 se levantaría en un solar que nadie visita.** Segunda medida, mismas 40
semillas: **`mage_guild_1` se construye en 1 partida de 40**, igual que `mage_guild_2`, y el
gremio máximo es **0 en 39 de 40**. El único hechizo que sabe cualquier héroe es `magic_arrow`
(26 de 40) y **es el de nacimiento** (`setup.ts:78`): en 40 partidas `syncSpellbooks` no enseña
**ni un hechizo**. Causa: `chooseBuilding` (`strategy.ts:215`) da al gremio **40**, por debajo
de moradas (101-106), abre-puertas (95), ingreso (90) y mejoras (51-56). Añadir peldaños 3-5 es
#66 otra vez, y **peor** que el caso que denuncia (`knight_dwelling_5` sale 9 de 40).

## Conflictos

- **#66 (duración) bloquea #6 y la mitad de #15.** Dependencia dura y medida, y su primer
  trabajo —**medir cuál de sus cuatro causas manda**, una de ellas #23— no está hecho: tocar la
  duración antes de eso es adivinar.
- **#26 bloquea los niveles 4 y 5**: hoy hay 0 hechizos de nivel 4 y 0 de nivel 5, y el
  documento declara #26 fuera de alcance mientras se lo pide al criterio 16.
- **#12 · #18 · #54**: contradicción **interna** — «fuera de alcance: ficha de héroe (#12)»,
  pero los criterios 2 y 11 exigen ver nivel y habilidades en pantalla, y el 11 es el cuerpo de
  #12 palabra por palabra. Hoy `panels.ts:104` pinta `Experiencia` y **no** `Nivel` ni `skills`.
- **Sin conflicto** con el ciclo de economía en curso: no toca ninguno de estos ficheros.

## Coste contra valor

El racimo entero es el ciclo más caro del backlog y su efecto medido sobre la partida de hoy es
**cero niveles subidos y cero hechizos aprendidos**: no hacer nada cuesta lo mismo que hacerlo.
Lo único que rinde ya, y no depende de #66, es **`mage_guild_3`** —hace que `wisdom` muerda
**sin subir de nivel**: inicial `wisdom: 1` (tope 3), contratado `{}` (tope 2), así que el test
del criterio 9 se escribe hoy— y **decidir `pathfinding`** (`hero.ts:7`, sin un solo lector: los
otros aciertos del `grep` son comentarios en `board.ts:87` y `strategy.ts:167`).

## Qué le cambiarías a `requisitos.md`

> **Este racimo se parte y se aplaza**: los tres eslabones no se sujetan entre sí, y el que se
> daba por hecho es el único roto.
>
> **#6 queda PREMATURO hasta #66**, y arrastra el grueso de #15 (criterios 1-7, 9-12). Antes de
> implementar nada hay que resolver dos cosas que no están en el issue: **(a)** #66, la partida
> dura 6 días de mediana; **(b)** `experienceFor` (`game.ts:1137`) ignora `stack.count` y solo
> paga al atacante que gana, así que la curva de `experienceForLevel` es inalcanzable por un
> factor ~15. Hasta que (b) se decida, subir de nivel es un `if` que no se cumple nunca.
>
> **De #15 se salva el criterio 8, `pathfinding`**: se implementa o se borra del tipo, y el
> invariante de rasgos muertos (`test/invariantes.test.ts:280-290`), que hoy cubre
> `CREATURE_TRAITS` y **no** `SkillId`, pasa a vigilarlo.
>
> **#3 se recorta a `mage_guild_3`** (criterios 13-15). El 16 estaba invertido: los dos hechizos
> de nivel 3 ya existen y están completos; falta el edificio. Los niveles 4 y 5 quedan
> bloqueados por #26 y salen de este ciclo, y con ellos el 17.
>
> **Se retira el criterio 11** y la parte de pantalla del 2: son el cuerpo de #12, que este
> mismo documento declara fuera de alcance.
