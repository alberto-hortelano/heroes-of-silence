# REENCUADRADA

Cinco de los siete siguen en pie; **#69 y #71 no entran**. Y lo que hay que decidir
no es si el núcleo deja de recorrer el mismo grafo dos y tres veces, sino **en qué
orden**: el que proponen los issues está del revés en los dos sitios donde importa.

## La premisa, afirmación por afirmación

Perfil: `node --cpu-prof --import tsx tools/qa/banco.ts 200 300`, 4 185 ms
muestreados (partidas 3 947 ms). Base, tres pasadas: **3 808/3 838/3 859 ms**,
`autoResolve` **154/154/158 ms**, sha `297dbef9…` intacto. **La forma del perfil
aguanta entera** pese a los ciclos de economía, experiencia y gremio (entre
paréntesis, lo que decía el issue): `reachableFrom` 49,49 % incl. / 40,33 % propio
(53,05/42,38), `Frontera.push`+`pop` 9,31 % (8,19), `findPath` 10,52 % (10,01),
`movableCosts` 9,77 % (9,67), `parseHexKey` 3,57 % (3,49); y los sellos de #71,
**97,4 % y 69,0 %** (97,1/63,1) sobre 5 014 eventos con casilla en 40 partidas.
Cuatro cifras **no** aguantan:

- **#65 «840 de 2261»**: numerador vivo —**868** desde `moveHero`
  (`state/game.ts:768`), contadas en un *worktree* instrumentado—, denominador
  muerto: hoy son **1 028** (160 de `validateMapPlan`) porque las 1 257 de
  `stepTowards` se las llevó #55. Honesto: **868 de 1 028, 6,51 % del banco**.
- **#78 «base 125-131 ms»**: caducada, hoy **154-158 ms**; el hallazgo vive, **970 de
  3 170** `movableCosts` salen de `moveTo` (`battle.ts:435`). **#69**: 1 102 → **1 289**.
- **#75 «otro −46 %»**: `reachableFrom` es el **52,5 %** del tiempo de las partidas
  (2 071 de 3 947 ms) y viene **entero de un llamante**, `ai/turn.ts:85`, así que
  aunque fuera gratis el techo es −52,5 %. El prototipo que devuelve **los mismos
  `Map<string,…>`** da 3,5× → **−37,5 %**; el −46 % solo sale del de 6,5×, el que
  **no construye los `Map`** y por tanto cambia `Reachable`, y con él `stepTowards`
  (`ai/strategy.ts:176-186`) y seis tests. **Dos tareas vendidas con una cifra.**

## El día después

Nadie que juegue nota nada, y eso ya estaba aceptado. **#65 y #78 son la misma
decisión** —qué valida la puerta (`moveHero`, `moveTo`) cuando el llamante le trae
la respuesta ya calculada—: quien resuelva una tiene resuelta la otra. Y el ahorro
de #65 es de la IA y del rival; el agente y el cliente **siguen pagando** porque
no traen camino.

## Conflictos

**#75 ↔ #77 se pisan, y el orden que declara #77 está del revés.**
`Frontera.push` recibe `key: string` y `ordenes` es un `Map<string, number>`
(`map/frontera.ts:88,116`); índice plano quiere clave numérica, y con **dos**
Dijkstra mirando, la salida tentadora es una segunda clase de frontera: **dos
copias de `agotada` y `ultimoPop`** (`frontera.ts:119,124`), que es la forma
barata de relajar los dos `throw` sin escribir que se relajan. Con #77 antes hay
**un** llamante y eso es una decisión, no dos. Y #77 es un *merge semántico*
—`findPath` no relaja las bloqueadas y `reachableFrom` sí, así que los `orden` no
coinciden; sale igual porque el orden **relativo** se conserva, pero eso hay que
verlo, y se ve en cadenas—: encima de la reescritura plana sería un commit que es
**representación y merge a la vez**, la forma que este repositorio documenta como
la que se cuela en silencio (`frontera.ts:36-47`). Precio de mi orden: ~40 líneas
escritas dos veces, el más barato de los dos errores. Ninguno obliga a relajar los
`throw` —`agotada` y `ultimoPop` no miran la clave—, pero sí a rehacer
`test/frontera.test.ts:20-28`, que empuja **letras** a propósito («si desempatara
por clave, `['z','y','x']` saldría al revés»).

**#65 va primero o pierde dos tercios**: 6,51 % hoy; con el Dijkstra ya abaratado,
~1,9 %. **#78 antes que #76**: #78 borra 970 de las 3 170 llamadas y #76 abarata
las que queden; al revés, #76 cobra un tercio que #78 vuelve a cobrar. **Con la
cola**: #89, #90, #92 y #93 mueven el volcado — no intercalar, o «byte a byte»
pierde su referencia.

## Coste contra valor

- **#65** 6,51 %; **#78** 3,24 %; **#76** ~5 % tras #78; **#75** −37,5 % (o −44 %).
  **#77** vale 0 % de tiempo: compra **una sola implementación del desempate** y
  que #75 sea una función y no dos. Por eso entra, y **antes** de #75.
- **#69: cae aquí, no cae del todo.** Sí previene algo concreto y con nombre: la
  regla de visión vive en **tres** sitios —`visibleNow` (`game.ts:333`),
  `visibleNowAt` (`game.ts:371`) y `revealAround`/`fog`+`memory` (`game.ts:294`)—,
  a dos los ata un test y **el tercero ya divergió**: es #86, abierto, y `vision.ts`
  es el módulo que necesita. Pero #86 **mueve partidas**: #69 es su primer paso y
  no un ítem de aquí; hacerlo ahora es trazar la frontera adivinando.
- **#71: cae**, y no por «esperar a #10»: por el precio. Compra, medido: el log de
  la semilla 9 en 48×48 pasa de **123 294 a 122 095 bytes, −1,0 %**. Cuesta que
  **`test/invariantes.test.ts:661` se ponga rojo** —exige `seen.length > 0` en más
  de 400 hechos; ahí son **1 007 hoy** y **218** con el actor fuera del sello—, y
  el único arreglo es bajar el umbral, que el docstring de ese guardia prohíbe con
  esas palabras. Y el guardia que la requisitos nombra, la ida y vuelta por JSON,
  **no distingue el cambio**: un array es un array. El criterio 8 es **imposible de
  cumplir** y lo que se rompe no es lo que se creía. No, por 1,0 %.

## Qué le cambiaría a `requisitos.md`

1. **Alcance**: cinco, no siete. Fuera **#69** (se reabre como primer paso de #86)
   y **#71** (se cierra con el párrafo de arriba).
2. **Orden, ahora parte del encargo**: `#65 → #78 → #76 → #77 → #75`. #65 primero
   porque su cifra encoge después; #78 antes que #76 para que ninguno cobre dos
   veces; #77 antes que #75 para convertir la frontera una sola vez.
3. **Cifras de hoy**: «840 de 2261» → **868 de 1 028**; «125-131 ms» →
   **154-158 ms**; «1 102 líneas» → **1 289**; base, tres pasadas, **3 808/3 838/
   3 859 ms** y `autoResolve` **154/154/158 ms**.
4. **Criterio nuevo en #75**: decidir **antes de empezar** si `Reachable` cambia de
   forma (con los `Map` a la salida el techo es −37,5 %; el −46 % exige tocar
   `stepTowards` y seis tests), y no anunciar la cifra de la variante no hecha.
5. **A «lo que no puede romperse»**: no puede existir una segunda clase de frontera,
   y `frontera.test.ts` conserva el truco de las claves que no son coordenadas. **A
   «fuera de alcance»**: no intercalar con #89, #90, #92 ni #93.
