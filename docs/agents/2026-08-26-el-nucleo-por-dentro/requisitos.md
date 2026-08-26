# Requisitos — el núcleo por dentro

**Issues**: #75, #76, #77, #65, #78 (el mismo grafo recorrido de más), #69 (la
frontera de `game.ts`) y #71 (el array muerto del sello).

## Petición literal del usuario

> «Perfecto, con que seguimos?»

y, ante tres racimos propuestos, la elección de **«El núcleo, por dentro»**, cuya
descripción decía en contra: *«no se nota jugando ni una sola de las siete»*. El
usuario lo eligió sabiendo eso, así que **no hay que justificar el racimo**: hay
que decidir qué parte de él vale la pena y en qué orden.

## De dónde salen los siete, que es lo que los hace distintos

**Ninguno es una intuición.** Los siete son hallazgos de pasadas de `/simplify` y
de QA sobre ciclos ya cerrados, **descartados a propósito de aquellos ciclos** por
no ser lo que aquellos ciclos prometían, y varios vienen **con prototipo y cifras
medidas**. Es el backlog mejor fundamentado que tiene este repositorio.

El ciclo padre —#48 y #55— ya se llevó el **−53 %** en 200 semillas con el sha256
del volcado idéntico. Estos son lo que quedó debajo.

## La estructura que tienen, y que el crítico debe confirmar o romper

| | Issue | Qué |
|---|---|---|
| **Mapa** | #75 | `reachableFrom` habla en cadenas `"x,y"`; sobre índice plano vale otro −46 % |
| | #77 | `findPath` y `reachableFrom` son el mismo Dijkstra con dos condiciones de parada |
| | #65 | `moveHero` relanza `findPath` desde el mismo origen: 840 de 2261 llamadas |
| **Tablero** | #76 | `reachable` devuelve claves y el `Hex` que el BFS tenía en la mano se reconstruye dos veces |
| | #78 | `moveTo` recalcula `movableCosts` para cobrar la carga: el tercer BFS del mismo turno |
| **Otros** | #69 | `game.ts` va por 1102 líneas; su frontera se trazó por el ciclo de imports |
| | #71 | el sello guarda un array que nadie puede leer en 2 de cada 3 eventos |

## Criterios de aceptación

### El que manda, y que hace este racimo el más seguro del backlog

1. **`pnpm banco` sale con el sha256 anclado, byte a byte, en cada commit.** No
   «al final»: **commit a commit**. Ninguno de los siete cambia una sola decisión
   de una sola partida, y el que la cambie **no entra**.
   Hoy: `297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767`, 32 177
   líneas.
2. `pnpm verify` verde y `npx tsx tools/qa/barrido-semillas.ts 200 300` en 0/200.
3. **Un commit por optimización.** Si una sale mal, se revierte sola.

### Lo que hay que medir, y con qué

4. **Cada issue lleva su cifra medida antes y después**, con el instrumento dicho.
   Los issues traen cifras de prototipo (`−46 %`, `12,8 %`, `840 de 2261`): son de
   quien las midió y **hay que reproducirlas**, no citarlas. Ya ha pasado en esta
   sesión que las cifras de un ingeniero estaban infladas porque su «antes» era
   más rápido que el mejor de ocho del que las revisó.
5. **Un solo instrumento para todas las medidas.** Es la lección que QA le dio al
   ciclo padre: verificó los doce commits con el `banco.ts` de HEAD copiado sobre
   cada uno, en vez de fiarse de doce medidas tomadas con doce versiones distintas
   de la herramienta.
6. Las cifras de tiempo van con **tres pasadas**, como el resto de este
   repositorio. Una sola pasada no es una medida.

### #69 y #71, que son de otra clase

7. **#69 no es una optimización y no se juzga con la misma vara.** Mover código
   entre ficheros no hace nada más rápido ni arregla ningún bug: su única defensa
   posible es que la frontera nueva **prevenga algo concreto**. Si el crítico no
   encuentra qué previene, **cae**, y no pasa nada.
8. **#71 tampoco es tiempo, es memoria y es futuro**: el array muerto se
   serializará cuando exista guardar y cargar (#10). Si se hace, el criterio no
   es «tarda menos» sino «el sello sigue diciendo lo mismo»: hay un invariante que
   juega 20 días y compara la crónica con su ida y vuelta por JSON, y **tiene que
   seguir verde sin tocarlo**.

### Lo que no puede romperse

9. **El desempate del Dijkstra**, que este repositorio declara **regla y no
   detalle**: entre dos casillas que cuestan lo mismo gana la descubierta antes, y
   una re-inserción por mejora conserva su orden original. Vive en
   `src/core/map/frontera.ts` y lo guardan **dos `throw` dentro de la clase**,
   no un test — porque la contaminación no se ve al repetir una búsqueda sino en
   la **siguiente**. #75 y #77 tocan exactamente ahí. Si algo obliga a relajar
   esos dos `throw`, **es que el cambio está mal**.
10. `pnpm qa` verde si se toca `src/server/` o el contrato.
11. **0 € de fal.ai.**

## Fuera de alcance

- **Cualquier cosa que cambie una partida.** Si al hacer #77 se descubre que
  unificar mejora una ruta, la ruta **no** se mejora: se abre issue. Este racimo
  entero se define por no cambiar nada observable.
- **Optimizar el cliente o el servidor.** Esto es `core`.
- **`game.ts` partido «porque es largo»** sin una frontera defendible: ver
  criterio 7.

## Preguntas abiertas, con su suposición por defecto

- **¿Los siete o unos pocos?** *Por defecto, los que el crítico deje en pie*, y en
  el orden que diga. Sospecho solapamiento entre **#75 y #77** —si los dos
  Dijkstra se unifican, reescribir uno sobre índice plano puede ser trabajo hecho
  dos veces o puede ser trivial, según el orden— y me gustaría que lo resolviera
  antes de que nadie escriba código.
- **¿#69 sobrevive?** *Por defecto no*, salvo que el crítico encuentre qué
  previene. Es el candidato natural a refactor por el refactor y el más caro de
  los siete.
- **¿#71 vale la pena antes de que exista #10?** *Por defecto sí*, porque es
  barato y porque el día que exista guardar y cargar el array muerto ya estará en
  los ficheros de la gente. Pero es discutible y quiero el argumento.

## Decisiones tomadas

1. **Se lanza crítico**, al revés que en los dos ciclos anteriores. Aquí sí tiene
   una pregunta que solo se puede responder leyendo el código: cuáles de los siete
   se pisan entre sí, y cuál no vale la pena.
2. **El criterio byte a byte es innegociable** y va por commit. Es lo que hace
   este racimo barato de aceptar y barato de revertir.
