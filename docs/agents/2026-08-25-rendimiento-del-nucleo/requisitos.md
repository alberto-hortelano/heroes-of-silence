# Requisitos — el núcleo deja de recorrer dos veces el mismo grafo

**Issues**: #48 (`legalActions` recalcula el BFS de movimiento una vez por
enemigo) y #55 (el pathfinding del mapa es el 77 % del barrido, y la mitad es
recorrer dos veces el mismo grafo).

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

La elección de **qué** se hace es mía, y la digo aquí para que se pueda juzgar:

Este racimo va **primero** de los cuatro que quedan porque tiene el criterio de
aceptación más objetivo que hay en este repo —**los registros de batalla y las
partidas del barrido salen byte a byte iguales**— y porque abarata todo lo que
viene después: el barrido de semillas es la herramienta con la que se mide si un
cambio en la IA empeora las partidas, y el ciclo siguiente cambia la IA.

## Reencuadrado por la crítica (`critica.md`), y por qué

El crítico midió en un `git worktree` aparte, tres pasadas por cifra, comparando
**volcados byte a byte de 200 semillas con sha256** — es decir, ejecutó el
criterio 1 en vez de razonarlo. Cuatro cosas cambian el trabajo:

1. **El perfil de #55 se sostiene** (36,0 / 21,5 / 12,8 % de self time frente al
   42/22/13 del issue). **Las cifras de #48 no**: son 326 → 210 ms en 300
   batallas (**−36 %**), no 1150 → 580 (−50 %).
2. **Sobra una de las tres optimizaciones y falta la que más rinde.** La caché de
   `bloqueadas` vale **0,25 %** y **cambia las partidas**; llevar el `Point` en el
   nodo de la frontera —que yo había dejado fuera de alcance creyéndolo caro—
   vale **−25,6 % adicional** y no exige reescribir las claves a entero.
3. **Mi hipótesis de las 60 llamadas queda refutada**: el bucle da **2,47 vueltas
   por turno**, así que llamar menos no es la palanca.
4. **La justificación que yo escribí también estaba inflada**: son **2,1×** por
   semilla (51,9 → 24,4 ms), no 10×. Lo que compra de verdad está abajo.

## El coordinador hace también de usuario, y se anota

El usuario está fuera. Los dos puntos de control humanos de la skill —tras el
crítico si reencuadra, y tras el arquitecto siempre— **los resuelvo yo**, y cada
decisión que tomo en su nombre queda escrita en este documento, en una sección
al final, para que la revise cuando vuelva. Si algo hubiera exigido de verdad su
criterio, la instrucción era clara: se deja apuntado y no se hace.

## Contexto

- **Presupuesto de fal.ai: 0 €.** Este trabajo no genera arte y no toca
  `tools/gen/`.
- Línea base **medida hoy**, antes de tocar nada, en esta máquina:
  `npx tsx tools/qa/barrido-semillas.ts` → **2,17 s**, `sin terminar: 0/40`,
  «batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100».
  `pnpm verify` → 6,5 s, 208 tests.
- Las cifras que traen los dos issues (el 42 %/22 %/13 % del perfilado, el
  «1150 ms → 580 ms en 300 batallas») **son afirmaciones a verificar, no datos
  dados**. El ciclo anterior se comió dos números falsos por copiarlos de un
  documento en vez de medirlos; el crítico mide antes de que nadie diseñe.

## Criterios de aceptación

### Lo que no puede cambiar — esto manda sobre todo lo demás

1. **Mismo comportamiento, exactamente.** Para las 40 semillas del barrido, el
   ganador, el día de victoria, el número de rondas de cada batalla y el
   registro de eventos son **idénticos** a los de antes del cambio. Se demuestra
   comparando un volcado de antes contra uno de después, no a ojo.
2. Los 208 tests siguen verdes, y `pnpm verify` también (typecheck y lint
   incluidos).
3. `core` sigue puro: ni `node:*` ni DOM. Los invariantes de
   `test/invariantes.test.ts` no se tocan para que pasen.
4. **Ninguna tirada nueva.** Si algún atajo cambiara el orden en que se consultan
   candidatos, el resultado dejaría de ser el mismo con la misma semilla: eso es
   una regresión, no una optimización.

### #48 — el BFS que se repite una vez por enemigo

5. `legalActions` calcula el conjunto de hexes alcanzables **una sola vez** por
   llamada, no `1 + E`.
6. La lista de acciones devuelta es la misma que antes: mismo contenido y **mismo
   orden**, porque de ese orden dependen los desempates de la IA y por tanto el
   criterio 1.
7. La mejora se **mide** con un banco de pruebas repetible —N batallas de la IA
   contra sí misma, semillas fijas— y la cifra queda escrita en
   `implementacion.md`. **Ya está medida y el issue está mal**: son **326 → 210
   ms en 300 batallas (−36 %)** y **−7,1 %** sobre el barrido, no «1150 → 580» ni
   «divide por dos». Al cerrar, **se corrige el issue**.

### #55 — el mapa recorrido dos veces

8. `chooseHeroDestination` + `stepTowards` dejan de hacer dos Dijkstra desde el
   mismo origen: el segundo recorrido se sustituye por retroceder por los
   predecesores que el primero ya conoce. **Son tres recorridos, no dos**: de las
   2261 llamadas a `findPath`, 1257 salen de `stepTowards` y **840 de `moveHero`**
   (`state/game.ts:623`), que relanza la búsqueda desde el mismo origen al mismo
   destino. Los predecesores quitan el **56 %** de `findPath`, no «el 22 %». **Las
   840 de `moveHero` se dejan** para no meter reglas del mapa en esta pasada: van
   a issue.
9. La firma pública de `reachableCosts` **no rompe a sus llamantes**, o se
   cambian todos en el mismo commit. Lo mismo con `findPath`.
10. **Las dos funciones SIGUEN reconstruyendo el conjunto de bloqueadas. No se
    toca.** Yo le había puesto un 5 %; medido son **4,62 ms sobre 1862 = 0,25 %**.
    Y la caché **rompe el criterio 1**: se queda rancia al primer monstruo muerto
    —los objetos mutan en el sitio, así que la identidad de `map.objects` no
    cambia— y el héroe rodea un cadáver: las semillas 22, 25 y 28 cambian de día.
    Un cuarto de punto porcentual a cambio de un bug de reglas.
11. La cola de prioridad lineal se sustituye por una estructura con la que
    extraer el mínimo no cueste recorrer la frontera entera. El crítico lo
    confirmó y lo subestimé: `reachableCosts` asienta **576 nodos por llamada** —el
    mapa 24×24 entero, porque se le pasa `Infinity`—, con frontera media 42,3 y
    **45,3 M de comparaciones** en 40 partidas.
    **El desempate es «coste, y a igualdad de coste el orden de primer
    descubrimiento»**, que es lo que hoy hace el `Set` por accidente: el barrido
    lineal usa `<` estricto, así que entre empatados gana el primero descubierto.
    Sin ese segundo criterio el montículo **cambia las partidas** —5817 líneas de
    registro en vez de 5851— y el criterio 1 se cae. Con él, idéntico a 200
    semillas y los 208 tests verdes.
11b. **El `Point` viaja en el nodo de la frontera**, en vez de re-parsear la clave
    con `parsePointKey`. Es el 12,8 % del perfil y **vale −25,6 % adicional**
    sobre las otras tres. Lo tenía en «fuera de alcance» creyendo que exigía
    reescribir las claves a entero: **no lo exige**, y es la optimización más
    rentable de las cuatro.
12. Cada una de las tres optimizaciones va en **su propio commit**, con su cifra
    medida antes y después. Un lote de tres mezclado no se puede revertir por
    partes cuando una resulte ser la que cambió una partida.

### Lo que hay que dejar montado

13. Un banco de medida repetible en `tools/qa/` (o el barrido existente con una
    bandera) que imprima el tiempo **y el sha256 del volcado**, para que la
    siguiente vez que alguien diga «esto es lento» haya con qué contestarle y para
    que el criterio 1 se compruebe con una orden. No es un test: no falla, mide.
13b. **`heroHasWork` (`strategy.ts:293`) o se usa o se borra en este ciclo.** Está
    exportada y sin llamantes; es la misma clase de cosa que `Player.name`, que se
    quitó ayer.
14. La comparación byte a byte del criterio 1 tiene que ser **fácil de repetir**:
    una orden, no un procedimiento manual.

## Fuera de alcance

- **La IA no cambia de opinión.** Ni heurísticas, ni umbrales, ni el orden en
  que evalúa. Eso es #49/#50/#52 y va en el ciclo siguiente: mezclarlo aquí
  destruiría el criterio 1, que es lo único que hace esta refactorización
  verificable.
- **Nada de rendimiento del cliente** (pintado, `requestAnimationFrame`).
- **Nada de `tools/gen/`, nada de arte, 0 €.**
- **No se toca el contrato del agente** (`src/core/contract/`): si un cambio
  obligara a tocarlo, se para y se dice.
- **Reescribir las claves de punto de cadena a entero: sigue fuera.** Lo que
  entra es el criterio 11b —el `Point` en el nodo—, que se lleva el 12,8 % de
  `parsePointKey` **sin** tocar el formato de las claves.
- **El tercer recorrido de `moveHero`** (840 de 2261 llamadas a `findPath`): se
  apunta a issue y no se toca aquí. Pasarle el camino ya calculado significa
  cambiar por dónde entra una regla del mapa, y este ciclo no cambia reglas.

## Preguntas abiertas, con su suposición por defecto

Las cuatro que había están **todas resueltas por la crítica**, y se dejan
escritas con su respuesta para que se vea qué se preguntó y qué se contestó:

- **¿Sigue siendo cierto el perfil de #55?** **Sí.** `map.ts` no ha cambiado de
  lógica desde el primer commit; lo único que movió las citas `fichero:línea`
  fue la pasada de Biome de ayer (`bea98e2`), exactamente +32 líneas.
- **¿Y el «1150 ms → 580 ms» de #48?** **Falso en magnitud.** Ver criterio 7.
- **¿`parsePointKey` al 13 % justifica claves enteras?** **No hacen falta claves
  enteras.** Ver criterio 11b.
- **¿Montículo o array ordenado?** Lo que decida el arquitecto, con el desempate
  del criterio 11 escrito. Aviso de la crítica: `test/agent-link.test.ts:112` y
  `:155` ordenan `[...reachableCosts(...).entries()]` con `Array.sort`, que es
  estable, así que **dependen del orden de inserción del `Map`**. Con el
  desempate correcto pasan; si alguien los ve fallar, **el bug es el montículo,
  no el test**. Que nadie los «arregle».

## Decisiones tomadas en ausencia del usuario

*(Se rellena durante el ciclo, según se vayan tomando.)*

1. **El orden de los cuatro racimos que quedan** lo he fijado yo:
   rendimiento (#48, #55) → la crónica y la niebla (#59) → la IA de batalla
   (#49, #50, #52) → la progresión del héroe (#6, #15, #3). La crítica lo
   confirma por un motivo que yo no había escrito: #50 elige entre lo que le
   ofrece `legalActions`, así que llega a un `legalActions` ya barato.
2. **Acepto el reencuadre entero**, incluidas las dos correcciones que me dejan a
   mí en evidencia: las 60 llamadas por turno que supuse (son 2,47) y el 5 % que
   le atribuí a las `bloqueadas` (son 0,25 %).
3. **Y acepto que la justificación que escribí estaba inflada.** No son 400
   partidas por el precio de 40: son ~85. Lo que compra este ciclo, dicho como
   toca: que las **200 semillas** —el tamaño con el que se midió el bug #47—
   bajen de **11 s a 5,2 s**, y el ciclo siguiente va a correr eso muchas veces.
   Con ~150 líneas en un fichero que nunca ha cambiado de lógica, se justifica;
   no hacerlo tampoco habría sido un escándalo, y eso también queda dicho.

---

## Decisiones sobre el plan (`plan.md`), aprobado en ausencia del usuario

El plan queda **aprobado tal cual**. Sus dos preguntas al coordinador se
resuelven así:

4. **La línea base se toma DESPUÉS de que aterrice el ciclo de la crónica**, y el
   ingeniero de rendimiento **no** trabaja en un `git worktree` aparte. El
   arquitecto propuso el worktree porque vio el árbol cambiando bajo sus pies
   —`src/core/state/events.ts` apareciendo sin indexar— y tenía razón en el
   diagnóstico. Pero un worktree aquí resuelve el problema equivocado: el sha256
   basal no se «invalida» por convivir con otro cambio, es que **el ciclo de la
   crónica cambia el contenido del registro a propósito** (le añade `actor`, `at`
   y `seen`). Medir contra un basal de antes de eso sería comparar dos formatos
   distintos y llamarlo regresión.
   Así que los ingenieros van **de uno en uno sobre `main`**: primero la crónica,
   y cuando sus cuatro commits estén dentro, el de rendimiento toma su basal
   sobre ese árbol y a partir de ahí el criterio 1 significa lo que dice.
5. **El cambio de firma de `chooseHeroDestination` y `stepTowards` está
   autorizado**, y ya lo estaba: es literalmente el criterio 9 —«la firma pública
   no rompe a sus llamantes, o se cambian todos en el mismo commit»—. Tocar
   `test/game.test.ts:481` entra.
6. **`reachableCosts` se borra y pasa a llamarse `reachableFrom`.** Lo apruebo
   por el motivo que da el plan y que es el bueno: un nombre nuevo hace que el
   typecheck **señale a todos los llamantes** en vez de dejar que alguno se quede
   con la versión vieja creyendo que sigue valiendo.
7. **El montículo lleva el orden de descubrimiento por dentro, no como
   parámetro.** Es la decisión más fina del plan y la subrayo aquí porque es
   donde se rompe el criterio 1: en una re-inserción por mejora de coste, el nodo
   **conserva su orden original**. Si recibiera uno nuevo, empataría por detrás
   de nodos descubiertos después y las partidas cambiarían. Al no ser parámetro,
   nadie de fuera lo puede pasar mal.
8. **El guardia del desempate vive en `test/frontera.test.ts` y no en
   `test/invariantes.test.ts`.** De acuerdo con el plan: `invariantes` guarda las
   fronteras de `CLAUDE.md` —qué puede importar `core`, dónde no puede haber una
   ruta absoluta—, no reglas semánticas de un algoritmo. Lo que **no** se negocia
   es el ritual: se rompe a mano, se mira rojo, se arregla, y las dos salidas se
   pegan en `implementacion.md`.
