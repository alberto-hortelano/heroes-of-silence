# El personaje pelea solo — fase 2 del RPG sobre el núcleo

## Petición literal

Sobre el concepto (29-09-2026, a GPT, citado por el usuario al rehacerlo):

> «quiero modificar el concepto de juego, que sea un juego de rol con un pequeño
> grupo de personajes, empieza con uno y va sumando hasta 5. Y que en el mapa
> vayan todos juntos en la forma de un solo caballo. La idea es mantener la misma
> dinamica que tenemos pero transformarlo en juego de rol. En el castillo creas
> salas de entrenamiento […] que mejoran las caracteristicas de los personajes.
> Los combates son en el tablero hexagonal pero con un solo personaje por
> hexagono. Si te fijas el cambio de juego es grande pero el sistema cambia muy
> poco.»

Sobre esta fase (30-09-2026): «adelante, sigue con la fase 2», sobre el plan
aprobado en `~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`
(léelo entero: es el contexto de todo el trabajo).

## Qué es la fase 2

Núcleo, parte 1: que un **personaje** —un individuo con atributos propios, no
una criatura del catálogo— pueda formar parte del ejército de un héroe y pelear
en la batalla del núcleo, y que sus heridas sobrevivan a la batalla.

## Criterios de aceptación

1. **Existe `Character`** en `core`: id, nombre, raza, profesión, seis atributos,
   PV actuales, nivel, XP. Se adapta la creación de la rama de archivo
   (`git show archivo/gpt-rpg:src/core/rpg/character.ts`: 6 atributos base 8,
   máximo 16, 18 puntos, cuatro razas sin ventaja numérica, cuatro profesiones con
   +2/+1). Validar un reparto ilegal **lanza** con frase para la persona.
2. **`GameState.characters`** guarda los personajes por id. En una partida de
   estrategia está vacío o ausente y nada lo lee.
3. **`Stack.member?: id`** con `count: 1` coloca un personaje en uno de los 5
   slots del `Army` que ya existe. Un stack con `member` y `count ≠ 1` es ilegal
   y lanza.
4. **`rpg/stats.ts`** —pura— traduce atributos + profesión + nivel a las
   estadísticas de combate que el motor usa hoy de una criatura (ataque, defensa,
   daño mín/máx, PV, velocidad, disparos, rasgos). Cada atributo tiene al menos
   un efecto visible en combate; tabla y test.
5. **`BattleStack.stats?`** sobrescribe al catálogo, y **un único accesor**
   (`unitInfo(stack)` o el nombre que decida el arquitecto) sustituye **todas** las
   lecturas `creature(s.creature)` de la batalla: `battle.ts`, `damage.ts`,
   `ai/tactics.ts`, `spells.ts`, `serialize.ts` y `client/render/battle.ts`. Un
   guardia (test de invariantes) impide que vuelva a aparecer una lectura directa
   fuera del accesor. Hay que verlo morder.
6. **La batalla de un personaje se juega entera con el motor del núcleo**:
   `createBattle` con un personaje `count: 1` contra un individuo enemigo, hasta
   que uno cae, con la IA de `tactics.ts` decidiendo por ambos lados. Esto es lo
   que demostraba `CharacterTrial` en la rama de archivo
   (`git show archivo/gpt-rpg:src/client/session.ts`) y **se reproduce primero con
   tests**, antes de tocar nada.
7. **Heridas persistentes**: tras `settleBattle` / `restoreHeroFromBattle`, el PV
   del personaje en `state.characters` es el que le quedó al acabar la batalla,
   no el máximo. Un personaje a 0 PV no reaparece en el ejército (qué le pasa
   después es fase 3: se anota, no se decide aquí).
8. **Condición dura**: `pnpm banco` sale con el **mismo sha** que hoy y
   `pnpm verify` en verde. Todo lo nuevo es inerte en el perfil de estrategia.
   `pnpm qa` también en verde si se toca `serialize.ts`.

## Fuera de alcance

- Salas de entrenamiento, acción `train`, `place`/`npc`, misiones, objetos,
  perfil `rpg` de `newGame`, generador de mapa denso, rival con compañía: fase 3.
- Narrativa (nuevos `REQUEST_KINDS`), taller de imágenes, cliente `/aventura/`.
- Magia por personaje: sigue siendo del héroe, como hoy.
- Rescatar de `archivo/gpt-rpg` algo más que lo que esta fase necesita
  (`character.ts` como fuente de las reglas de creación, y `CharacterTrial` como
  referencia de test). Nada de arte, escenas ni servidor.
- Cambiar el equilibrio de la estrategia: si algo mueve el sha, está mal.

## Contexto que solo tiene el coordinador

- El usuario eligió **rival activo** y **mantener el modo estrategia como arnés**.
  Por eso el RPG es un perfil del mismo `GameState`, no un motor aparte: el error
  de GPT fue hacer un segundo motor de batalla de 7×5.
- Informe de exploración: hay unas 28 llamadas a `creature(s.creature)` (13 en
  `battle.ts`, 8 `damage.ts`, 5 `tactics.ts`, 1 `spells.ts`, 3 `serialize.ts`,
  7 `render/battle.ts`). `core/data.ts` es un `Map` de módulo sin registro en
  ejecución: **no** se añaden criaturas sintéticas al catálogo global (rompería
  la reproducibilidad entre partidas del mismo proceso).
- Riesgos señalados: `armyMorale` mira `creature.faction` (un personaje necesita
  facción o moral neutra); `settleBattle` (`game.ts` ~1251) rehace `{creature,
  count}` y tira `topHp`; `experienceFor` mira `creature.hp`; la iniciativa
  desempata por `slot`; `hexSize` sale del catálogo.
- `test/invariantes.test.ts` exige que cada `CREATURE_TRAITS` tenga lector vivo
  en `core`, que `core` no ejecute coma flotante de plataforma y que no haya
  `Math.random`.

## Preguntas abiertas (con suposición por defecto)

- ¿Qué `creature` lleva un stack con `member`? Por defecto: un id de criatura
  existente que haga de «cuerpo» (p. ej. por profesión) para arte y respaldo, con
  todas sus cifras sobrescritas por `stats`. El arquitecto puede proponer otra
  cosa si esa rompe menos.
- Moral de un personaje: por defecto 0 (neutral) hasta que exista una regla.

## Correcciones tras el plan (30-09-2026)

El usuario aprobó el plan del arquitecto («adelante»), incluida su desviación
del criterio 5: en vez de `BattleStack.stats?` opcional con accesor, todo stack
lleva `unit: UnitInfo` resuelto en `createBattle` y `creature` pasa a `body`.
El criterio 5 se lee así desde ahora. También queda aceptado el cuerpo centinela
`CHARACTER_BODY` fuera del catálogo, en lugar de la criatura prestada.
