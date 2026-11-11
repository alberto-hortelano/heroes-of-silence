**REENCUADRADA**: los tres síntomas se reproducen, pero dos de las cuatro afirmaciones del issue apuntan al sitio equivocado. El pueblo de la semilla 12 no tiene un problema de nombre, sino de qué comprobación se dispara antes. Y el «village-8» no sale de `problemasDeLosPueblos`.

## El problema real

El agente pone un objeto mal y le contestan sobre otra cosa (la base) o con un nombre que él nunca escribió («village-8»). No puede corregir el plan ni la jugada porque el motivo no nombra lo que falla.

## La premisa, afirmación por afirmación

Reproducido con `npx tsx` sobre `150fd189` (guiones en el scratchpad: `s12c.mts`, `rec.mts`).

1. **«Semilla 12, un pueblo de región en (9,7) se rechaza con un motivo sobre la base»: cierto, pero la causa no es el nombre.** `validateMapPlan` devuelve solo «la ciudad "town-0" es la base del jugador 0 y está dentro de la región "region-4"…». Valdeluz está en (11,8). El pueblo, en (9,7), cae en el anillo de los accesos de su puerta oeste. Lo saca de la red (`asentarLosSitios`, `regiones.ts:334-353`; `regionesDeLaCiudad`, `:494`), así que la base deja de tocar dos regiones: `dondeEsta(red,'town-0')` pasa de `{en:'muro'}` a `{en:'region',region:4}`.
   - La regla que sí nombra al pueblo existe: `problemasDeRecintos` (`recinto.ts:664`). Llamada a mano sobre ese mapa, devuelve «el pueblo "Portillo" de (9,7) está a 2 casillas de la ciudad "Valdeluz" (town-0, en (11,8)), en el anillo de los accesos…». Pero corre en `validar.ts:301`, detrás del `return` temprano de `validar.ts:294`, y nunca llega.
   - **Es más ancho que el (9,7).** En (9,8), mismo anillo, el rechazo que llega es «el pueblo "village-8" parte su región…». Sale de `problemasDeRed` (`validar.ts:283`), aún antes. En (9,9) (sobre barrera) y en (13,8) el motivo sí es el bueno. Así que el fallo es un orden de comprobaciones: un objeto en la entrada de una ciudad estropea la red, y las comprobaciones de la red cantan el síntoma antes que la causa.
2. **«Los motivos de `problemasDeLosPueblos` nombran el pueblo por su id»: falso.** `problemasDeLosPueblos` usa `o.name` (`validar.ts:372`), y `ocupar` usa `v.name` (`validar.ts:145`). El id sale de `quienEsElNodo` (`regiones.ts:501-511`): `el pueblo "${n.id}"`, sin la casilla. Esa función nombra los rechazos de `problemasDeRed`: «parte su región», «no toca ninguna región», «solo toca la región» y los nodos pegados.
   - `Candidato` (`regiones.ts:229-233`) no lleva nombre. El plan del agente no da id a los pueblos (`construir.ts:171-180`, `idDePueblo(i)`), así que el agente no puede saber cuál es «village-8».
   - `test/regiones.test.ts:154` fija ese texto: el pueblo se llama «El Paso» y el motivo dice «village-4». Las ciudades salen con el id que el agente escribió, y eso vale.
3. **`recruitBlocker`: «reclutar una criatura que no existe responde "solo hay 0 disponibles"»: cierto** (`town.ts:229-230`). Da el mismo motivo con una criatura que existe pero no se recluta en ese pueblo (`orko-hacha-escudo` en uno templario). El agente llega ahí sin traducción (`vocabulario.ts:232`, `game.ts:363-371`). La persona no puede llegar: la morada solo ofrece lo de `dwellings`.
4. **«`equip.slot` tiene `max(32)` y `unequip.slot` no tiene tope»: cierto** (`esquemas.ts:94` contra `esquemas.ts:98`). `docs/areas/agente.md:43` llama «forma» a los topes de tamaño, así que lo coherente es que los dos lo lleven.

## El día después

- El agente que se equivoca de casilla recibe la frase que dice qué mover y adónde. Es lo único que cambia, y vale para el plan de mapa y para los mundos (`mundo/validar.ts:418` usa el mismo `validateMapPlan`).
- **Lo que no debe pasar:** que cambie qué planes se aceptan. El procedimental pasa por `validateMapPlan` (`procedimental.ts:209`). Reordenar o mover comprobaciones tiene que dejar el mismo conjunto de planes válidos: `pnpm banco` con el mismo hash.
- **Lo que no debe hacerse:**
  - Quitar los `return` tempranos a ciegas: existen porque `estructura` lanza con una red inválida (`regiones.ts:380-384`).
  - Renombrar las ciudades por su `name` en los motivos de red: el agente escribe su id y lo reconoce.
  - Tocar el texto que lee la persona en la morada.

## Conflictos

- **#318: no encaja aquí; que siga aparte.**
  - Su segunda mitad (`1e21` → «0 o más») ya está hecha: `lineaBlocker` (`vocabulario.ts:191-196`) lo cita como #318.
  - La primera («la siguiente obra es la muralla» cuando el agente escribe `wall`, `sitios.ts:571-572`) es otro problema: un motivo con **dos lectores**, la persona en español y el agente con el vocabulario del contrato. Pide traducir en la frontera del contrato. Aquí ninguno de los motivos tiene ese doble lector (el de reclutar «no existe» solo lo ve el agente; los del plan, el agente o el motor de mundos).
  - Y caería en `contract/vocabulario.ts` y en cómo `server/director.ts` pasa los rechazos, que es justo lo que tocan #334+#338. Juntarlo aquí crea el choque que hoy no hay.
- **#334+#338** tocan `esquemas.ts`, pero en la parte de batalla (hacia `:354-365`). La línea de `unequip.slot` (`:98`) está en la unión de aventura. Sin dependencia; como mucho, una fusión de texto trivial.
- **#335** (`vestir-la-red.ts`, `poblar.ts`): su crítica pide no tocar `recinto.ts` salvo exportar. Si esta tarea mueve la comprobación de los accesos o la reparte, toca `recinto.ts`/`validar.ts`, que son ficheros distintos de los de #335. Los dos exigen el mismo hash del banco, así que no hay orden que imponer. Si los dos tocan `recinto.ts`, el segundo en fusionar rebasa.
- **#336, #341, #303**: cliente; nada en común.

## Coste contra valor

Barato y útil para el banco de pruebas del agente: tres motivos en el núcleo y un `max(32)`. La parte del plan es la única con miga (el orden de las comprobaciones). Aun así es acotada: el fallo solo aparece con objetos en la entrada de una ciudad, y la regla que da el motivo bueno ya existe. Si no se hiciera nunca, el agente seguiría recolocando la base cuando lo que sobra es un pueblo.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación (tras la crítica)
>
> 1. **El plan nombra la causa, no el síntoma.** Un pueblo, un monstruo o un cofre en el anillo de los accesos de una ciudad recibe el motivo de los accesos (`problemasDeRecintos`, `recinto.ts:664`). No vale uno sobre la ciudad ni sobre la red que ese objeto estropea. Casos de prueba, semilla 12 del procedimental con un pueblo «Portillo»: en (9,7) hoy sale «la ciudad "town-0" es la base… dentro de la región "region-4"»; en (9,8), «el pueblo "village-8" parte su región». Los dos tienen que nombrar a «Portillo» en su casilla y a Valdeluz. En (9,9) y (13,8) el motivo ya es el bueno y no cambia. Que salgan además los motivos de la red es aceptable solo si el de los accesos va primero.
> 2. **El pueblo se nombra como lo escribió el agente.** Los rechazos de `problemasDeRed` que nombran un pueblo (`quienEsElNodo`, `regiones.ts:501-511`: «parte su región», «no toca ninguna región», «solo toca la región», nodos pegados) dicen su `name` y su casilla, no `village-N`. Las ciudades siguen por su id, que es el que escribe el agente. Se actualiza `test/regiones.test.ts:154`.
> 3. **Reclutar lo que no hay dice por qué.** `recruitBlocker` distingue tres casos: la criatura no existe en el catálogo («no existe»); existe pero ese pueblo no la ofrece (no tiene su morada); y la ofrece pero no hay bastantes («solo hay N»). El texto del tercero no cambia para la persona.
> 4. **`unequip.slot` lleva `max(32)`**, como `equip.slot` (forma, `docs/areas/agente.md:43`).
> 5. **No cambia qué se acepta:** `pnpm banco` con el mismo hash, y `pnpm mundo validar ejemplo|prueba` siguen valiendo. Cada motivo nuevo, con su test visto morder. `pnpm qa` si se toca el contrato. No hay nada que mirar en el navegador.
>
> **Fuera:** #318 (motivos de las obras con las palabras del contrato), que tiene dos lectores y vive en la frontera del contrato; sigue en su issue, sin la mitad del `1e21`, que ya cerró `lineaBlocker`.
