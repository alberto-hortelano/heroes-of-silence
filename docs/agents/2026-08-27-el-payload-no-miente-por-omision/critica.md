# Crítica · Tanda 2 «El payload no miente por omisión»

**#85 VIGENTE** · **#84 REENCUADRADA** · **#101 REENCUADRADA** · **#100 VIGENTE (decisión tomada: se borran)**

Ninguna de las cuatro puede mover el ancla de `pnpm banco`: `tools/qa/banco.ts` no importa nada de `src/core/contract/` —tira de `tools/qa/partidas.ts`— y las cuatro tocan serialización y prosa, no reglas.

---

## #85 · el terreno en `adventure_turn` — VIGENTE

**El problema real:** el agente decide rutas sobre un mapa del que solo recibe los objetos, y la tool que sí trae el terreno **le dice por escrito que es el mismo dato**.

| Afirmación | Verificación |
|---|---|
| `knownMap` es `{width, height, objects}` | Cierto — `serialize.ts:222-226` |
| `serializeKnownMap` ya existe y filtra por `fog` | Cierto — `serialize.ts:141-155`: terreno `null` fuera de `fog`, `roads` solo explorados |
| «el terreno no cambia: que lo cachee» (pregunta abierta 1) | **Falso como argumento.** El terreno es estático (cero escrituras a `map.terrain`/`map.roads` tras generarlo), pero **lo que el jugador conoce crece**: medido, 81/576 casillas el día 1 (14 %), 217 el día 3 (38 %), 282-368 el día 6 (49-64 %). Cachear la llamada del día 1 es planificar el día 6 con el 14 % del mapa; repedirla cada turno cuesta **los mismos bytes más una vuelta de canal** |
| El coste (criterio 5, ya medido; semillas 91/7/2026) | día 1: turno 1 853-2 296 B → **+3 099 B (+135 % a +167 %)**; día 3 **+3 506 B (+53 %)**; día 6 **+3 685 a +3 901 B (+52 %)**. El «+4 KB» del issue es correcto en absoluto; lo que no dice es que **el payload del día 1 más que se duplica** |

**El dato que cierra el caso y no está en el issue:** `MAPA_DESCRIPCION` (`src/server/mcp/server.ts:375`) le dice al agente que el mapa de la tool *«es lo mismo que viaja en "knownMap" dentro de adventure_turn, pero puedes pedirlo cuando quieras»*. **Hoy es falso.** O aterriza #85 y la frase se vuelve verdad sin tocarla, o hay que ir a desdecirla. Una tool publicada que promete una identidad inexistente es la especie de la cita falsa de la tabla de experiencia: nada se pone rojo.

**El día después.** El agente elige destino sabiendo el coste de entrada en vez de descubrirlo al pisar, y se cierra la doble declaración del mapa conocido (`serialize.ts:222` contra `:141`). Lo que se cierra en el otro sentido: el payload de aventura pasa a estar dominado por el terreno, así que **#71 deja de ser la palanca de tamaño que parece**.

**Lo que NO debe hacerse — las dos reformulaciones de la pregunta abierta 1.** *Deltas o «el terreno una vez»*: ahorraría ~85 % (40-70 casillas nuevas por turno) a cambio de que el servidor recuerde qué mandó ya por un canal que este repo admite que pierde mensajes — un mensaje perdido corrompe el mapa del agente el resto de la partida, en silencio, que es justo el defecto que la tanda existe para cerrar. *Un segundo serializador*: el criterio 3 es correcto y además es lo que hace a #85 **inmune al orden con #86**.

**Conflictos.** **#86** (`fog` no recibe el radio 5 del castillo) es dependencia latente, no bloqueo: el terreno que #85 entrega tendrá el mismo agujero junto a la capital propia, pero la dirección es segura —`null` es ignorancia declarada, no una mentira— y al reusar el único serializador, el día que #86 aterrice el turno se corrige solo. **No se toca `fog` aquí.** · **#60**: `pnpm qa` cubre 3 turnos de aventura, así que el criterio 6 vale como no-regresión y **no** demuestra el beneficio. · **#105** es la misma preocupación de volumen en el canal del espectador; fuera de alcance.

**Coste contra valor.** Barato —reusar una función escrita— y con un defecto vivo de regalo. Si no se hiciera nunca, el agente seguiría pudiendo pedir el mapa y la descripción de la tool seguiría mintiendo.

---

## #84 · la ausencia que no se explica — REENCUADRADA

**El problema real:** en la consulta `battle_state` de **tu propia** batalla, cuando manda el otro bando, `legalActions` desaparece sin una línea que lo diga.

| Afirmación del issue / `requisitos.md` | Verificación |
|---|---|
| `legalActions` se omite si el stack activo no es tuyo | Cierto — `serialize.ts:345` |
| Le pasa en `battle_turn` | **Falso.** `director.ts:277` llama con `s.side`, donde `s` **es** el stack activo: la condición **nunca** falla en una petición empujada. La ausencia solo existe por la consulta |
| El sitio exacto | `consultas.ts:83` (`if (suyos.size === 1) return vista;`), **la única rama sin nota** de las tres: la ajena la tiene (`:72`) y la de dos bandos la tiene (`:86`) |
| Criterio 3: «hoy `side` se fuerza a `'attacker'`» | **Falso como frase general.** `consultas.ts:80` es `suyos.has('attacker') ? 'attacker' : 'defender'`: quien solo defiende ve su bando. Se fuerza **solo** llevando los dos |
| ¿Ocurre ese caso? | **No en el servidor que se publica**: `ws-server.ts:292` fija `agentPlayers: [1]`. Alcanzable en tests, no jugando |
| La tool documenta la ausencia solo para la ajena | Cierto — `mcp/server.ts:347-350` |
| Criterio 4: «la comprobación es de máquina» | Hoy **solo para la ajena** (`agent-link.test.ts:584`). La rama que #84 toca **no tiene test de la ausencia**: eso es lo que falta, no re-verificar #73 |

**El reencuadre.** El trabajo es **una nota en una rama de `consultas.ts`**, su test y la línea de la descripción de la tool. No toca el payload de turno y no cabe presentarlo como tal. El punto 3 se resuelve **diciéndolo**, con el dato añadido de que hoy no se juega: emitir las acciones del defensor sería trabajo para una configuración que ningún servidor arranca.

**Lo que NO debe hacerse:** meter la nota en `serializeBattleTurn` (`core`). Las otras dos las pone el servidor por encima del objeto serializado (`consultas.ts:71` y `:85`), y un `note` nacido en `core` chocaría con esos dos *spreads* — dos redacciones del mismo campo, una pisando a la otra según la rama.

**Coste contra valor.** Muy barato. Si no se hiciera, el agente puede deducirlo comparando `activeStack` con `yourSide` —incomodidad, no bloqueo—, pero es la clase de ausencia que esta casa ya decidió no dejar callada.

---

## #101 · los ids de los jugadores — REENCUADRADA

**El problema real:** el payload dice **cuántos** jugadores hay y el agente tiene que colocar **cuáles**, así que ese dato sale de una convención en prosa en vez de leerse.

| Afirmación | Verificación |
|---|---|
| `serializeMapRequest` manda un número | Cierto — `serialize.ts:355` y `:365`; el llamante pasa `peticion.players.length` (`mapa-del-agente.ts:60`) |
| `RESPONSE_FORMAT` se apoya en prosa | Cierto — *«numerados desde 0 … con "players": 2 son el 0 y el 1»* |
| La comprobación se llama `jugadoresCambiados` | **Envejecido.** Hoy es `loQuePidioElServidor` (`mapa-del-agente.ts:108`) y hace **dos** comprobaciones |
| «`jugadoresCambiados` se muere sola» | **Falso, y es la mitad importante.** Nombrar los ids quita la **ambigüedad**, no la **desobediencia**: un agente puede seguir devolviendo `heroStarts` con los jugadores 3 y 4 leyendo `players: [0,1]`, y sigue dejando la partida sin un turno en silencio (`agentPlayers.has` nunca se cumple) |
| «puede bajar a `validateMapPlan`» | No gratis: solo recibe el plan, y saber **cuáles** exige pasárselos — el mismo dato viajando igual, con `core` enterándose de quién pidió el mapa. El docstring de `mapa-del-agente.ts:90-97` ya razona por qué no |
| La «mitad interesante» (el orden de `heroStarts`) | **Ya hecha**, y por eso esa mitad del issue está OBSOLETA: `setup.ts:71` ordena por `player` y `RESPONSE_FORMAT` ya lo dice |

**El reencuadre.** Queda: `players: readonly PlayerId[]`, el llamante deja de hacer `.length`, y la prosa cambia «numerados desde 0» por «coloca exactamente los de `want.players`». **Muere la convención, no la comprobación.** Y hay un trabajo obligatorio que el issue no pide: el último párrafo del docstring de `loQuePidioElServidor` (`mapa-del-agente.ts:105-106`) dice hoy *«el día que el payload lleve los ids, media comprobación se muere sola»* — si se cambia el payload y se deja esa frase, queda escrita **la instrucción para que el siguiente lector borre un guardia vivo**.

**Conflictos.** **#102** («el suelo del rango declarado es mentira») toca el mismo bloque de prosa y la misma historia del tamaño: solapamiento leve, no cambia el orden; que #101 no reescriba el párrafo del tamaño.

**Coste contra valor.** Dos líneas de tipo, una de prosa, una de docstring. Si no se hiciera, el contrato sigue funcionando porque el guardia lo tapa — que es el argumento del propio issue, y sigue siendo bueno.

---

## #100 · `AdventureTurnResponse` y `BattleTurnResponse` — VIGENTE

**El problema real:** dos tipos exportados que nadie importa, sin una línea que diga si son API o restos. Verificado: `agent.ts:148-149`, y `grep` sobre `src`, `test` y `tools` da **cero** apariciones fuera de su declaración; `MapGenerateResponse` (`:150`) tiene una, `mapa-del-agente.ts:53`.

**La decisión, que es lo que se pide (pregunta abierta 2): se borran.** Con las dos pruebas que el issue no tenía:

1. **`package.json:5` es `"private": true`.** No hay cliente de fuera de este repo que pueda consumir `src/core/contract/`: la lectura «son API pública» no describe a nadie que exista, y este repositorio lleva cuatro ciclos destruyendo capas justificadas por un consumidor hipotético — `map_generate` sin llamante, el canal del espectador sin lector, `hero_banter`, `SpectatorLogMsg`.
2. **La API publicada ya es otra y funciona.** `agent-link.ts:231` tipa `ask()` con `import('zod').infer<(typeof responseSchemas)[K]>` **en el sitio**, sin tocar los alias: el único consumidor real del contrato ya demuestra la forma que el issue propone para el día que alguien necesite el tipo.

**El criterio, enunciado para el siguiente tipo** (criterio 4) y escrito en `agent.ts`, no en el commit: *se exportan los **esquemas**, que es lo que valida y de lo que todo se deriva; un alias de `z.infer` se escribe donde se usa. Un tipo que ningún `import` nombra se borra — y `MapGenerateResponse` se queda porque tiene uno, no porque sea más importante.*

**Coste contra valor.** Dos líneas fuera, una nota dentro. Si no se hiciera, alguien lo vuelve a encontrar, vuelve a abrir el issue y vuelve a no poder decidirlo: ya ha pasado una vez.

---

## Qué le cambiaría a `requisitos.md` — redactado para pegarse tal cual

- **#85 · pregunta abierta 1, resuelta: se hace, y sin deltas.** El terreno es estático, pero **lo que el agente conoce crece cada día**: 14 % del mapa el día 1, 38 % el día 3, 49-64 % el día 6 (semillas 91, 7 y 2026). «Cachearlo el día 1» es planificar el día 6 con el mapa del día 1. Coste del criterio 5, ya medido: **+3 099 B el día 1 (+135 % a +167 % sobre un turno de 1 853-2 296 B), +3 506 B el día 3, +3 685 a +3 901 B el día 6**. Un esquema de deltas queda **prohibido en esta tanda**: exigiría que el servidor recuerde qué mandó por un canal que puede perder mensajes, y un mensaje perdido corrompería el mapa del agente en silencio.
- **#85 · criterio nuevo (7).** `MAPA_DESCRIPCION` (`src/server/mcp/server.ts:375`) afirma que el mapa de la tool «es lo mismo que viaja en `knownMap`», y hoy es falso. Al cerrar #85 la frase queda verdadera: **se comprueba que lo es, campo a campo**, en vez de darlo por supuesto.
- **#85 · criterio 6, acotado.** `pnpm qa` cubre 3 turnos de aventura (#60): vale como no-regresión y **no** como demostración del beneficio. No se escriba como si lo demostrara.
- **#84 · criterios 1 y 3, corregidos.** La ausencia silenciosa existe en **una** rama: `consultas.ts:83`, la consulta `battle_state` de tu propia batalla con un solo bando tuyo. En la petición empujada **no ocurre nunca** (`director.ts:277` pasa el bando del stack activo), así que esto **no toca el payload de `battle_turn`**. «Hoy `side` se fuerza a `'attacker'`» solo es cierto llevando los dos bandos —`consultas.ts:80` elige `defender` si es el tuyo—, caso que el servidor publicado no produce (`ws-server.ts:292`): se **dice** y no se arregla, y se dice también que hoy no se juega. La nota va en `consultas.ts`, junto a las otras dos, **no** en `serializeBattleTurn`: un `note` nacido en `core` chocaría con los *spreads* de `consultas.ts:71` y `:85`.
- **#84 · criterio 4, con el hueco nombrado.** El guardia de #73 solo cubre la batalla **ajena** (`agent-link.test.ts:584`). El test que falta es el de esta rama: propia, stack activo del otro bando, `legalActions` ausente **y** nota presente.
- **#101 · criterio 3, invertido.** La comprobación de jugadores de `loQuePidioElServidor` **no se muere ni se mueve**: nombrar los ids quita la ambigüedad, no la desobediencia, y un plan con los jugadores 3 y 4 sigue dejando la partida sin un turno en silencio. Lo que muere es la **convención en prosa** de `RESPONSE_FORMAT` («numerados desde 0»). Se añade trabajo obligatorio: darle la vuelta al último párrafo del docstring de `loQuePidioElServidor` (`mapa-del-agente.ts:105-106`), que hoy anuncia que «media comprobación se muere sola».
- **#101 · criterio 5, con su motivo.** Ya está hecho: `setup.ts:71` ordena y `RESPONSE_FORMAT` lo dice. Es no-regresión, no trabajo.
- **#100 · decisión tomada (pregunta abierta 2): se borran**, por dos hechos — `package.json:5` es `"private": true`, así que el cliente externo que justificaría «API pública» no existe; y `agent-link.ts:231` ya deriva el tipo en el sitio con `z.infer<(typeof responseSchemas)[K]>`. El criterio que queda escrito en `agent.ts` y vale para el siguiente tipo: **se exportan los esquemas; un alias de `z.infer` se escribe donde se usa, y un tipo que ningún `import` nombra se borra.**
