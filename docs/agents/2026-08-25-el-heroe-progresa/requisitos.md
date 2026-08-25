# Requisitos — el héroe progresa

**Issues**: #6 (los héroes no suben de nivel), #15 (habilidades secundarias a
medias) y #3 (faltan los niveles 3, 4 y 5 del gremio de magia).

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

Cuarto y último racimo de los que caben. Va el último porque es el más grande y
el que más se nota jugando: si algo se queda a medias, prefiero que sea esto y
no un bug abierto o una IA que decide mal.

## El coordinador hace también de usuario, y se anota

El usuario está fuera. Los puntos de control humanos los resuelvo yo y cada
decisión tomada en su nombre queda escrita al final de este documento.

## Por qué los tres juntos: es una cadena, no tres cosas

Hoy el juego tiene los tres eslabones sueltos y ninguno enganchado:

- La experiencia **se acumula** (`game.ts`, `hp * level * 2` por stack
  destruido) y `levelFromExperience()` **existe y no la llama nadie**: el héroe
  se queda en nivel 1 para siempre.
- `hero.skills` solo se escribe al crear la partida. El héroe inicial nace con
  `logistics: 1`; el contratado con `{}` y muere con `{}`.
- `maxSpellLevel()` lee `wisdom` y `learnable()` lo aplica — **está escrito,
  probado e inerte**, porque sin gremio de nivel 3 no hay hechizo que recortar.

Subir de nivel sin habilidades que ganar es un número que sube. Habilidades sin
gremio alto dejan `wisdom` inerte otra vez. El gremio 3-5 sin héroes que suban
pone hechizos a la venta que nadie puede aprender. **Los tres a la vez o
ninguno.**

## Criterios de aceptación

### #6 — subir de nivel

1. Al ganar experiencia, `hero.level` se actualiza con `levelFromExperience()`.
   Las dos funciones que ya existen se usan; no se escriben otras.
2. Subir de nivel **se dice**: entra en el registro y se ve en la pantalla.
3. Subir de nivel da **atributos**. El reparto sale de fheroes2 y depende de la
   clase; el arquitecto lo fija y lo escribe con su fuente. Con dos facciones,
   caballero y nigromante, son dos tablas.
4. Se puede subir **más de un nivel de golpe** si la batalla da experiencia de
   sobra, y entonces se cobran todos los niveles, no el último.
5. La experiencia y el nivel del héroe llegan al agente por el contrato, si no
   llegan ya.
6. Test determinista: un héroe con N de experiencia tiene el nivel que dice la
   tabla, y sus atributos son los que le tocan.

### #15 — habilidades secundarias

7. Al subir de nivel, el héroe **gana o mejora una habilidad secundaria**. Cómo
   se elige —oferta de dos y se escoge, o una tirada— lo decide el arquitecto,
   pero **pasa por `createRng`**: sin eso no hay partida reproducible.
8. `pathfinding` deja de ser una declaración muerta: se lee y afecta al coste de
   moverse por el mapa. Si no se implementa, **se borra del tipo** — la regla de
   este repo es que un rasgo declarado y muerto es un bug, y hay un invariante
   que lo vigila para las criaturas.
9. `wisdom` pasa a morder de verdad: con el gremio de nivel 3 en pie (#3), un
   héroe sin `wisdom` **no** puede aprender un hechizo de nivel 3 y uno con
   `wisdom: 1` sí.
10. El héroe contratado deja de nacer vacío, o se justifica que nazca vacío.
11. Las habilidades se ven en la pantalla: qué tiene el héroe y en qué nivel.
12. Test determinista de cada habilidad **por su efecto**, no por que esté
    escrita en el objeto: mismo héroe con y sin ella, y el número que cambia.

### #3 — el gremio de magia hasta el nivel 5

13. `data/buildings.json` define `mage_guild_3`, `mage_guild_4` y `mage_guild_5`
    con sus costes y su cadena de requisitos.
14. `mageGuildLevel(town)` los reconoce y `townSpells(town)` ofrece lo que toca.
    La derivación que ya existe no se sustituye por un libro guardado.
15. El solar `guild` de la pantalla de castillo encadena los cinco eslabones. La
    pantalla **no** sabe cuántos son: las cadenas se derivan del catálogo, y eso
    ya está montado.
16. `data/spells.json` tiene con qué llenar los niveles nuevos. Hoy hay 7
    hechizos de ~66 (#26): **hacen falta más**, y ese es el trabajo de verdad de
    este criterio, no el JSON del edificio.
17. Cada hechizo nuevo se implementa **de punta a punta** o no entra: efecto en
    el motor, coste, `castBlocker` que explica su rechazo, y la IA sabiendo
    valorarlo. Un hechizo en el catálogo que no hace nada es peor que no tenerlo.

### Lo que no puede cambiar

18. `pnpm verify` verde. Si un test de batalla cambia de resultado, se mira uno a
    uno.
19. El barrido de semillas sigue en **0 partidas sin terminar** de 40. Este ciclo
    cambia la economía y la fuerza de los héroes: es justo el tipo de cambio que
    puede dejar partidas eternas.
20. `pnpm qa` verde si se toca el contrato.
21. **0 € de fal.ai.** Los hechizos nuevos no llevan icono: los iconos son #41 y
    son arte.

## Fuera de alcance

- **Artefactos** (#11), **ficha de héroe** (#12), **niveles de héroe en el
  mapa** más allá de lo que exigen los criterios.
- **Las 66 criaturas y los 66 hechizos** (#26). Aquí entran los hechizos que
  hagan falta para llenar los niveles 3, 4 y 5 con algo digno, no el catálogo
  entero.
- **Facciones nuevas.**
- **El asedio** (#7) y **habilidades primarias por edificio**.

## Preguntas abiertas, con su suposición por defecto

- **¿Cuántos hechizos nuevos?** En el original son 3+3+2+2+1 por nivel. *Por
  defecto se llenan los niveles 3, 4 y 5 con lo mínimo que los haga jugables* —y
  el arquitecto dice cuánto es— en vez de perseguir el número del original.
- **¿La habilidad se elige o se sortea?** En el original se ofrecen dos y eliges.
  *Por defecto: se ofrecen dos y elige quien juegue* —la persona en la pantalla,
  el agente por el contrato, la IA por heurística—, porque una elección es
  justamente el tipo de decisión que este repo existe para darle a un agente. Si
  sale caro, la alternativa es sortear con `createRng` y decirlo.
- **¿`pathfinding` se implementa o se borra?** *Por defecto se implementa*: es
  media docena de líneas en el coste de moverse y cierra la mitad de #15. Si el
  arquitecto ve que toca el pathfinding del mapa —que el ciclo de rendimiento
  acaba de reescribir—, se coordina o se aparta.
- **¿Este ciclo cabe entero?** *Por defecto se asume que sí, y si no, se corta
  por #3*: subir de nivel y habilidades (#6, #15) valen solos; el gremio 3-5 sin
  ellos, no.

## Decisiones tomadas en ausencia del usuario

1. **Los tres juntos**, por la cadena que explico arriba: cada uno por separado
   deja al siguiente inerte, que es exactamente el estado del que venimos.
2. **Este racimo va el último** de los cuatro. Es el más grande y el más
   reversible: si se queda a medias, lo que falta es contenido, no corrección.
