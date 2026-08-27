# Que la partida dé de sí

> **La petición del usuario, literal:** *«adelante con la siguiente tanda»*, sobre
> el plan de siete tandas que aprobó antes. Esta es la **tanda 3 · Que la partida
> dé de sí**: **#23**, **#90**, **#60** y **#62**.

## El hilo que une a los cuatro

La partida se acaba antes de que pase nada. No por un tope de días: **porque se
gana enseguida y el que pierde se elimina en el acto**. De ahí salen las cuatro
caras del mismo hecho:

- **#23** — hay **una** condición de victoria (quedarse solo) y la derrota no
  tiene los **7 días de gracia** del original: te quedas sin héroes y sin pueblos
  y estás fuera el mismo instante.
- **#90** — el dragón óseo pisa el tablero **0 de 200** veces en 24×24 y **12 de
  20** en 48×48. Lo que falta ya no es economía: *«faltan días»*.
- **#60** — `pnpm qa` pide seis turnos de mapa y alcanza tres, porque el agente
  de prueba pierde.
- **#62** — el arnés sondea el arranque cada 250 ms y tira el 3,2 % de su tiempo.

## Lo que he medido yo antes de escribir esto

Ninguna cifra de aquí abajo está copiada de un issue. **La lección de la tanda
anterior fue que dos de mis premisas eran falsas por copiarlas**, así que:

1. **`pnpm qa`, corrido ahora**: la partida termina el **día 4**, cobertura
   `1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla`, 19 veredictos
   y 0 descartadas. Y el detalle que el issue no dice: **el agente pierde**
   —*«jugador 1 (necromancer): 0 castillos, 0 héroes»*—. O sea que la partida del
   arnés muere **por la regla exacta que #23 quiere corregir**.
2. **`checkDefeat` (`src/core/state/game.ts:499-511`)**: sin héroes y sin pueblos
   → `defeated` en el acto, y si queda uno vivo, `finishGame`. No hay gracia.
3. **En `core` no existe ningún tope de días.** Está declarado **tres veces
   fuera**: `src/server/ws-server.ts:31` (`MAX_DAYS = env ?? 200`),
   `tools/qa/partidas.ts:29` (`DIAS_POR_DEFECTO = 300`) y el tope de seis turnos
   del propio arnés. Y cuando salta, **`state.finished` se queda en `null`**: el
   núcleo sostiene que la partida no ha terminado. Eso ya se está tapando con un
   `partidaTerminada` booleano en `ws-server.ts:96` y con un
   `winner: number | null` en `protocol.ts:96`, los dos con su comentario
   explicando el parche.
4. **No existen los artefactos.** La única aparición de la palabra en todo el
   repo es un comentario en `battle.ts:38`. La condición de victoria «encontrar
   un artefacto» de #23 **no tiene sujeto**, igual que #50 no lo tenía.
5. **El tamaño por defecto está escrito dos veces**: `generate.ts:322-323`
   (`opts.width ?? 24`) y `ws-server.ts:42-43` (`ANCHO_DEL_MAPA = 24`).
6. **El sondeo de #62** es `verify-agent.ts:341`:
   `for (let i = 0; i < 60 && !RE_CANAL.test(salidaServidor); i++) await sleep(250)`.

## Criterios de aceptación

### #23 · Los 7 días de gracia y el final por tiempo

1. Un jugador que se queda **sin héroes y sin pueblos** no está eliminado: entra
   en una cuenta atrás, y si en **7 días** no vuelve a tener uno de los dos,
   entonces sí. La cifra es del original y se cita con su fuente; si no se puede
   verificar, se dice, no se inventa.
2. **Se puede volver de ahí**: hay al menos un camino real por el que un jugador
   en gracia recupere un héroe o un pueblo, y un test lo recorre. Si no lo hay
   —si con 0 pueblos no se puede contratar—, la gracia es decorativa y **eso hay
   que escribirlo, no implementarla igual**.
3. La gracia es **observable**: el estado lo dice y la crónica lo cuenta, para el
   agente y para el espectador. Un jugador no debería enterarse de que estaba en
   la cuerda floja al perder.
4. **El tope de días baja a `core`** y con él la victoria por tiempo: cuando se
   agotan, `state.finished` deja de mentir. Quien gana lo decide una regla
   escrita en un sitio —no tres— y `partidaTerminada` en `ws-server.ts` **se
   muere** con su comentario.
5. `MAX_DAYS` de entorno y `DIAS_POR_DEFECTO` del banco siguen valiendo para lo
   que valían: quien pida un tope distinto lo sigue pidiendo. Lo que no puede
   seguir habiendo son **tres definiciones de la misma regla**.
6. **Fuera**: capturar un pueblo concreto, matar a un héroe y encontrar un
   artefacto. La tercera no tiene sujeto (punto 4 de arriba) y las dos primeras
   piden un editor de escenarios que no existe. Se dice en el issue al cerrarlo.

### #90 · Cuántos días hacen falta, medido y no supuesto

1. **Este issue se cierra con una medida, no con una palanca.** Lo que hay que
   producir es la cifra: con la gracia puesta, ¿cuánto duran las 200 partidas
   del banco y qué criaturas pisan el tablero? Censo antes y después.
2. Si la gracia **no** mueve la duración, se dice con el número y el issue queda
   abierto o se reencuadra. **No se sube el tamaño del mapa ni el tope de días
   para que salga bonito**: esa decisión es del usuario y necesita la cifra
   delante (era #66, y #90 existe justamente para escribirla).
3. Si la mueve, el censo lo demuestra: cuántas de las 200 llegan a la morada 5,
   a la 6, y cuántas ven un dragón óseo.

### #60 · Que el arnés cubra sus seis turnos

1. **La hipótesis barata primero**: la partida del arnés muere el día 4 por la
   regla que #23 corrige. Con la gracia puesta, **medir si el arnés llega solo a
   sus seis turnos**. Si llega, #60 se cierra **sin una línea de código nuevo** y
   sin la puerta de sembrado que el issue proponía.
2. Si no llega, se toma la ruta que el propio issue prefiere —**sembrar el estado
   inicial**, no hacer que el agente de prueba juegue mejor—, porque el arnés
   verifica el **contrato**, no lo bien que juega nadie.
3. El criterio es la cobertura impresa por el propio arnés: **6 turnos de mapa**,
   y que la cifra la diga él, no yo. Con **dos héroes** en algún turno, que es
   una de las cosas que el issue nombra como no ejercitadas.
4. Lo que siga sin cubrirse **se dice en el informe del arnés**, no se calla.

### #62 · El arranque, sin sondeo

1. El arnés espera a la línea del servidor **cuando llega**, no preguntando en
   bucle. Sigue habiendo un tope de espera y sigue fallando ruidosamente si el
   servidor no arranca.
2. Se mide `pnpm qa` antes y después, tres pasadas cada una. Si no baja, se dice
   que no baja: 178 ms es una cifra copiada de un issue y no la he verificado yo.

## Verificación

- **`pnpm verify`** siempre.
- **`pnpm banco`**: el ancla `297dbef9…` **se va a mover** —la gracia cambia
  quién sigue vivo y cuándo—, y por eso el criterio **no es el hash**: es la
  **forma del diff**, como en el ciclo de la niebla. Hay que enseñar que lo que
  cambia es lo que tenía que cambiar.
- **`npx tsx tools/qa/barrido-semillas.ts`**: hoy son **0 partidas sin
  terminar** de 40, y esa línea base es la que no se puede empeorar. Una sola
  que no termine es una regresión — y la gracia es justo el cambio que podría
  producirla.
- **`pnpm qa`**, que es medio ciclo.
- **El navegador**, si el final por tiempo o la gracia se ven en la barra.
- **Nada de fal.ai.**

## Preguntas abiertas, con su suposición por defecto

- **¿Se toca el tamaño del mapa o el tope de días?** *Por defecto **no**.* La
  gracia es una **corrección de fidelidad** al original y no una cifra
  inventada; subir el mapa a 48×48 o alargar la partida cambia el juego que se
  juega y **es decisión del usuario**, con la medida de #90 delante. Si el
  crítico opina que sin eso #90 no se puede cerrar, **paro y lo llevo**.
- **¿La gracia es alcanzable?** Si con 0 pueblos no se puede contratar un héroe,
  el jugador en gracia no tiene forma de volver y la regla solo retrasa el
  final. Eso sigue teniendo valor —le da días al **rival** para desarrollarse—
  pero es otra cosa de la que dice el original, y hay que decirlo en vez de
  venderlo como recuperación.
- **¿#90 es una tarea o un acta?** Su propio texto dice *«Este issue existe para
  que la cifra quede escrita»*. Por defecto se trata como **acta**: se cierra con
  la medida. Si el crítico lo declara ya cumplido por el ciclo de economía, cae.

## Fuera de alcance, dicho para que nadie lo amplíe

- **#5** (guarnición y héroe visitante). #90 mide que **47 de 52** partidas que
  compran caballería la dejan muerta en la guarnición, así que es la siguiente
  piedra — pero es una acción nueva del núcleo y una interfaz, y no cabe aquí.
- **#89** (Nigromancia), que es contenido y desequilibra en la otra dirección.
- **Arte** (#37-#41): no se gasta un céntimo.

---

# Corrección tras la crítica

El crítico **midió** en vez de leer, y con eso cayó la hipótesis central de este
documento, que era mía. He verificado sus cuatro citas más caras antes de
aceptarlas; las cuatro aguantan.

## Lo que verifiqué yo, aparte

- **`isLoss()` de fheroes2 es `castles.empty() && heroes.empty()`** — traído de
  la fuente, no del recuerdo. O sea que **`checkDefeat` ya reproduce el original
  exactamente** y la premisa de #23 —«faltan los 7 días de gracia»— es falsa.
- **`GetGameOverLostDays()` → `return 7;`** — la cifra 7 sí existe, pero es de
  **otro estado**: sin castillos y **con** héroes. Aquí ese jugador es inmortal,
  o sea que la divergencia va **al revés** de lo que dice el issue: copiar el
  original **acorta** partidas.
- **`hireHero` exige `town.owner === player.id`** (`game.ts:700`): de «0 pueblos
  y 0 héroes» no hay camino de vuelta. La gracia sería retraso, no recuperación.
- **El censo del volcado de `pnpm banco`, corrido ahora**: `dwelling_5`
  **15/200**, `dwelling_6` **2/200**, mediana **7 días**, ganadores **42/158**.

## Y de ahí sale un hallazgo que no estaba en ningún issue

**`CLAUDE.md` lleva tres cifras caducadas**: dice que la morada 5 sale en **52 de
200** y la 6 en **10**, y que la mediana bajó a **6 días**. Eran ciertas al
cerrar el ciclo de economía (`2db037e`); **#87 y #88 —la experiencia y el gremio—
se llevaron el desarrollo por delante** al dar la vuelta al ganador, y nadie
volvió a medir. El documento que enseña que *«una cita falsa a la fuente es peor
que una cifra declaradamente inventada»* estaba citándose a sí mismo mal.

Se corrige en este ciclo, y con la fecha de la medida al lado.

## La tanda encoge

| Issue | Antes | Ahora |
|---|---|---|
| **#62** | VIGENTE | **VIGENTE**, y es el único cuya premisa aguanta entera |
| **#23** | la gracia + el tope de días | **solo el tope de días**; la gracia **no se hace** |
| **#90** | acta | **acta**, y su conclusión cambia: *no faltan días, falta mapa* |
| **#60** | cerrar barato con la gracia | **aparcado**: la gracia le da 6 turnos con 3 a 0 acciones |

**Los criterios 1, 2 y 3 de #23 caen.** No se implementa una regla que el
original no tiene, de la que nadie puede volver y que no mueve un solo ganador
de las 200 — a cambio de dos anclas rotas y un 76 % más de crónica.

**Los criterios 4 y 5 se quedan y son el trabajo**, renombrados: no es «victoria
por tiempo», es que **`state.finished` deje de mentir** cuando se agotan los
días. Hoy se queda en `null` y eso se tapa con un booleano en `ws-server.ts` y
con un `winner: number | null` en `protocol.ts`.

**#60 y #90 esperan a una decisión de mapa que es del usuario**, con su precio
medido delante: 48×48 lleva `pnpm banco` de 1,65 s a **19,9 s** —está en CI— y da
la vuelta al equilibrio otra vez (j0 **181/200** contra **42/200**).
