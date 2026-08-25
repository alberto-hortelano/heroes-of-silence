# Crítica — el núcleo deja de recorrer dos veces el mismo grafo (#48, #55)

**REENCUADRADA.** El perfil de #55 se sostiene casi clavado, pero el alcance está
mal **en las dos direcciones**: sobra una de las tres optimizaciones —vale 0,25 %
y **cambia las partidas**— y falta la que más rinde, que está en «fuera de
alcance» y **no es** el cambio caro que el issue dice. Las magnitudes de #48 son
falsas. El criterio 1 es cumplible, y lo he comprobado.

**El problema real**: el barrido —lo único que mide si un cambio en la IA empeora
las partidas— tarda porque cada decisión de héroe recorre el mapa entero tres
veces, y por eso se mide con 40 semillas y no con 200.

**Cómo he medido**: Ryzen 7 5800X, Node v24.11.1, `npx tsx`, tres pasadas por
cifra, en un `git worktree` aparte ya retirado. Comparo **volcados byte a byte**
—ganador, día y registro completo de cada semilla, con sha256—: el criterio 1,
ejecutado. De los 2,13 s de reloj de hoy, **1,86 s son las 40 partidas**.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| #48: `movableHexes` dentro del bucle de enemigos, y «divide por dos, 1150 → 580 ms en 300 batallas» | El bucle, **CIERTO** (`battle.ts:813` y `:818`, 1+E llamadas). La cifra, **FALSA en magnitud**: medido **326 → 210 ms, −36 %**, ni el −50 % ni las absolutas (3,5× de más) |
| #55: `reachableCosts` 42 % / `findPath` 22 % / `parsePointKey` 13 %, «el 77 % del barrido» | **CIERTO**. Self medido: **36,0 / 21,5 / 12,8 %** (inclusive 45,0 / 26,5). Suman 70,3 % del proceso y **78,7 %** acotado a la fase de mapa |
| #55: dos recorridos desde el mismo origen | **CIERTO y corto: son tres.** `moveHero` (`state/game.ts:623`) relanza `findPath` desde el mismo origen al mismo destino. De 2261 llamadas: 1257 de `stepTowards`, **840 de `moveHero`**, 164 de `validateMapPlan`. Por eso los predecesores no «eliminan el 22 %»: quitan el **56 %** de `findPath` |
| #55: el barrido lineal de la frontera pesa, y reconstruir `bloqueadas` también (un 5 % en requisitos) | El barrido, **CIERTO y subestimado**: `reachableCosts` asienta **576 nodos por llamada** —el mapa 24×24 **entero**, porque se le pasa `Infinity`—, frontera media 42,3, **45,3 M de comparaciones** en 40 partidas. Las `bloqueadas`, **FALSO**: 3518 × 32 objetos = **4,62 ms sobre 1862 = 0,25 %** |
| Citas `fichero:línea`, y «¿sigue vivo el perfil?» | **Desplazadas y correctas**: `map.ts` +32, `strategy.ts` +10, culpable `bea98e2` (Biome). El perfil vale: `map.ts` no cambia de lógica desde el primer commit |
| Coordinador: «hasta 60 llamadas por turno» | **FALSO**. El `while` da **2,47 vueltas por turno** (545 turnos, 1345 vueltas); `MAX_MOVIMIENTOS_POR_TURNO` no muerde nunca. **Llamar menos no es la palanca** |

## El día después — medido, no imaginado

Volcados de 200 semillas contra el basal `sha256 eae7e022dc5327eb`:

| Variante | 200 semillas | vs basal | ¿idéntico? |
|---|---|---|---|
| basal | 10 392 ms | — | — |
| #48, izar `movableHexes` | 9 657 ms | −7,1 % | **sí** |
| #55-1, predecesores | 8 221 ms | −20,9 % | **sí** |
| #55-3, montículo con desempate estable | 8 406 ms | −19,1 % | **sí** |
| #55-3, montículo **ingenuo** (solo coste) | — | — | **NO** |
| #55-2, caché de `bloqueadas` | — | −0,25 % teórico | **NO** |
| las tres buenas juntas | 6 555 ms | −36,9 % | **sí**, 208 tests verdes |
| + el `Point` en el nodo de la frontera | **4 880 ms** | **−53,0 %** | **sí** |

- **Para quien juega no cambia nada** — ese es el criterio; fuera del barrido sí:
  −36 % en `autoResolve` abarata `pnpm qa` y el turno del agente.
- **Qué se vuelve más difícil**: el desempate del Dijkstra pasa de accidente del
  orden de un `Set` a invariante escrito que alguien puede romper sin enterarse.
- **Qué habría que borrar**: `heroHasWork` (`strategy.ts:293`), exportada y sin
  llamantes. Contra `CLAUDE.md`, nada: `core` sigue puro, ni una tirada nueva.

### Dónde se rompe el criterio 1 — los dos sitios, rotos a mano

1. **El montículo.** El barrido lineal usa `<` estricto sobre un `Set`: entre
   costes empatados **gana el primero descubierto**. Un montículo ordinario rompe
   ese empate por la forma del árbol → cambia `previo` → cambia el camino entre
   dos igual de baratos → cambia la partida (5817 líneas en vez de 5851). Con el
   comparador `(coste, orden de primer descubrimiento)` sale idéntico a 200.
2. **La caché de `bloqueadas`.** Por identidad de `map.objects` se queda rancia al
   primer monstruo muerto —los objetos mutan **en el sitio**— y el héroe rodea un
   cadáver: semillas 22, 25 y 28 cambian de día y de eventos.

## Conflictos

- **El orden del coordinador es correcto**: #49/#50/#52 cambian de opinión a la
  IA y evaporan la línea base byte a byte; y #50, que elige entre lo que ofrece
  `legalActions`, llegaría a un `legalActions` ya barato.
- **Dependencia oculta hacia los tests**: `test/agent-link.test.ts:112` y `:155`
  ordenan `[...reachableCosts(...).entries()]` con `Array.sort`, que es estable —
  dependen del **orden de inserción del `Map`**. Con el montículo estable pasan
  los 208; con el ingenuo son la primera alarma. Que nadie los «arregle». Sin
  conflicto con #59, #60, #61, #62 ni con el contrato del agente.

## Coste contra valor

El «77 %» es cierto y es el argumento **equivocado**: nadie espera 2,13 s. El
bueno es el otro, pero también está inflado: 51,9 → **24,4 ms por semilla**, o sea
**2,1×**, no 10×. No son 400 partidas por el precio de 40: son ~85. Lo que compra
es que las **200 semillas** —el tamaño con el que se midió #47— bajen de 11 s a
5,2 s, y el ciclo que viene va a correr eso muchas veces. Con eso, y siendo ~150
líneas en un fichero que nunca ha cambiado de lógica, **se justifica** — aunque no
hacerlo tampoco sería un escándalo: se paga en semillas que no se juegan.

## Qué le cambiaría a `requisitos.md`

1. **Criterio 10, sustituir entero**: «Las dos funciones **siguen reconstruyendo**
   las bloqueadas: 4,62 ms sobre 1862 (**0,25 %**) y la caché se queda rancia al
   primer monstruo muerto. No se toca.»
2. **Criterio 11, añadir**: «El desempate es **coste, y a igualdad de coste el
   orden de primer descubrimiento**, que es lo que hoy hace el `Set` por
   accidente. Sin ese segundo criterio el montículo cambia las partidas.»
3. **Fuera de alcance → criterio nuevo**: «El 12,8 % de `parsePointKey` **entra**,
   y no exige claves enteras: sale de llevar el `Point` en el nodo de la frontera
   en vez de re-parsear la clave. **−25,6 % adicional**, idéntico a 200 semillas.»
4. **Criterio 7**: «#48 mide **326 → 210 ms en 300 batallas (−36 %)** y −7,1 %
   sobre el barrido. El issue dice 1150 → 580 y −50 %: se corrige el issue.»
5. **Criterio 8**: «Los predecesores quitan el **56 %** de `findPath`, no el 22 %.
   Las 840 de `moveHero` son el **tercer** recorrido y **se dejan**.»
6. **Criterio 13**: «el banco imprime el sha256 del volcado además del tiempo; y
   `heroHasWork` o se usa o se borra en este ciclo.» Y la justificación del
   racimo no es el 77 %, sino el 2,1× por semilla.
