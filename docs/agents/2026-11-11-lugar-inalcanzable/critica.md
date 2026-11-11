**REENCUADRADA** — ninguna casilla que acepta `lugarBlocker` queda lejos de la base por la forma del
mapa (0 de 36 676 probadas). Lo que sí ocurre es que **la región de casa de un bando solo se alcanza
cruzando su base** en 7 de 120 mapas del procedimental. Como tomar la base acaba la partida, un lugar
puesto ahí no lo pisa nunca el otro jugador.

## El problema real, en una frase

El motor puede colocar un lugar en una región a la que uno de los dos jugadores solo llega tomando la
base del otro, y eso choca con la regla «el mundo es de los dos». Añadir a `lugarBlocker` una
comprobación de «hay camino desde la base» no lo arregla: esa comprobación ya sale siempre verdadera.

## La premisa, punto por punto

- **«`lugarBlocker` acepta una casilla a la que no se llega (borde, barrera sin paso)»: falso.**
  - Rechaza el borde (`src/core/mundo/validar.ts:101`) y toda casilla que no esté en una región (`:107`).
  - Una región es una componente 8-conexa de lo que se pisa (`src/core/map/regiones.ts:6`).
  - `problemasDeRed` exige que cada región tenga un nodo y que se llegue a todas desde la región 0
    (`regiones.ts:650-675`).
  - El Dijkstra usa la misma 8-vecindad (`src/core/map/map.ts:198`).
  - Lo medí con `findPath(map, héroe.at, casilla, [], null)` sobre cada casilla que pasa
    `lugarBlocker`, desde la posición de los dos héroes: 30 mapas (tamaños 4, 5 y 7, semillas 1-10) más
    `ejemplo` y `prueba`. Resultado: **0 casillas sin camino de 36 676**.
- **«o solo niebla sin explorar»: falso.** `caminoHasta` (`src/core/state/marcha.ts:153`) no mira la
  niebla. Solo esquiva lo hostil (`casillasHostiles`, `marcha.ts:81`): el héroe rival, las
  guarniciones ajenas y los asaltantes.
- **Lo que deja sin ruta al empezar, medido.** Con `caminoHasta` en los mismos 32 mapas, 619 casillas
  no tienen ruta. Según `porQueNoLlega` (`marcha.ts:251`), las cierran el héroe rival, una ciudad
  neutral con guarnición o un grupo de asaltantes.
  - La ciudad neutral y los asaltantes se conquistan o se mueven: eso es juego, no un fallo de
    validación.
  - El héroe rival empieza en su base, y la base es un nodo (`docs/areas/mapa.md:73`).
  - Tratando como hostil solo al héroe rival, sobre 120 mapas (tamaños 4, 5 y 7, semillas 1-40),
    salen **7 mapas** (r4 s12 y s22, r5 s38, r7 s10, s20, s27 y s39). En todos, la región `region-1`
    no se alcanza para j0 y la `region-0` no se alcanza para j1, con 25 a 90 casillas válidas cada una.
  - Son las regiones de casa: `casaDe` es la región de la base con menos nodos (`src/core/mundo/lectura.ts:189-195`).
  - La lectura ofrece esas casillas al motor en `admitenUnLugar` (`lectura.ts:250`).
  - La regla «perder la base elimina en el acto» (CLAUDE.md, Reglas) hace que el bloqueo sea para toda la partida.
- **`hornos-de-pez` en (1,16): no se puede reproducir tal cual.** El mundo `gen-*` se borró.
  - Los commits 9a533eb5 y 243c56f4 **no están en `main`**: viven en la rama sin fusionar
    `claude/templarios-faction-game-fa463e`, y `docs/agents/2026-11-10-*` no existe en este checkout.
  - En esa rama, `marcha.ts` y el cuerpo de `lugarBlocker` son iguales a los de `main`, y de
    `src/core/map/` solo cambia `tipos.ts` (`obraDesconocida`). Lo medido aquí vale también allí.
  - Si (1,16) caía en la casa del rival, es esta clase de fallo. Si no, era algo pasajero.
- **Por qué la QA no supo la causa.** La vista previa de la ruta devuelve `[]` sin motivo
  (`src/client/sesion/partida/marcha.ts:118-119`). `porQueNoLlega` solo se oye al hacer clic.

## El día después

- **Quien juega**: en cerca del 6 % de los mundos generados, el lugar de la casa del rival deja de
  existir solo para él. También deja de contar como pieza de la trama que encadena lugares por marcas.
- **Lo que no debe hacerse**:
  - Que `lugarBlocker` compruebe un camino con `findPath`/`reachableFrom` sin hostiles. Con la red
    validada no muerde nunca: sería un guardia de adorno, y el criterio «verlo morder» no se cumpliría.
  - Que la validación use el estado de la partida al empezar (`caminoHasta` con lo hostil).
    Rechazaría lugares tras una ciudad neutral con guarnición, que se toma jugando. Además,
    `lugarBlocker` es solo del mapa y lo lee también la lectura del motor.
- **Lo que hay que decidir**: dónde vive la regla «se llega sin cruzar la base del otro». Puede ir
  en el generador (que la casa no cuelgue solo de la base), en la red, o en `lugarBlocker` y la
  lectura (que no ofrezcan esa región). Esa decisión es del arquitecto. Cada opción cierra una puerta:
  - En el generador: cambia mapas, y lo nota `pnpm banco`.
  - En el lugar: deja la casa sin lugares en esos 7 de 120 mapas.

## Conflictos

- **Esta tanda**: no choca con #313/#317 (contrato), #327 (taller), #202 (crónica del espectador) ni
  #332 (escena del lugar a 380 px).
- **#305** (pueblo en la puerta) toca `problemasDeRecintos` (`src/core/map/recinto.ts`), no
  `problemasDeRed`. Solo se solaparían si el arquitecto pone esta regla en la validación de la red;
  en ese caso, que vayan en serie.
- **#304** (generador, la red junto a una ciudad-puente): si la regla va al generador, toca el mismo
  `map/generar/`. Ahora no es dependencia, pero es el mismo terreno.
- **Rama sin fusionar**: `claude/templarios-faction-game-fa463e` reescribe 226 líneas de
  `src/core/mundo/validar.ts`. Un cambio en `validar.ts` o en `lectura.ts` chocará al fusionarla.
- **#302** (regenerar `ejemplo`): `ejemplo` y `prueba` salen limpios (0 casillas). No depende.

## Coste contra valor

El coste es bajo: una regla sobre la red y un test con una semilla que muerde (r4 s12 sale en 36 × 36).
Si no se hace nunca, uno de cada quince o veinte mundos generados pierde un lugar para un bando, sin
aviso. Ese lugar puede ser un eslabón de la trama principal. Merece la pena, pero como regla de la
red, no como un «hay camino» genérico.

## Qué le cambiaría a `requisitos.md` (para pegar tal cual)

> **Encuadre (crítica, 11-11-2026).** Por geometría, todo lugar que acepta `lugarBlocker` se alcanza:
> 0 de 36 676 casillas sin camino en 32 mapas. Lo que falla es que la región de casa de un bando
> (`casaDe`) a veces solo se alcanza cruzando su base, que es un nodo. Pasa en 7 de 120 mapas
> procedimentales (tamaños 4/5/7, semillas 1-40; p. ej. r4 s12, r7 s10). Tomar la base acaba la
> partida, así que un lugar ahí es inalcanzable para el otro jugador, en contra de «el mundo es de los dos».
>
> 1. Se reproduce con una semilla que lo tenga: un lugar en esa región, al que el jugador contrario
>    no llega sin pasar por la base rival.
> 2. Ese lugar se rechaza (o no se ofrece en `admitenUnLugar`, o el generador no produce esa red),
>    con un motivo para la persona, y `pnpm mundo validar <id>` lo dice. El test se ve morder. Una
>    comprobación de camino sin hostiles **no vale**: nunca muerde.
> 3. Lo que cierra el paso al empezar y se conquista (ciudad neutral con guarnición, asaltantes,
>    héroe rival fuera de su base) **no** es un fallo: se documenta en `docs/areas/mundos.md` con fecha.
> 4. Fuera de alcance: que la vista previa de la ruta diga por qué no hay ruta
>    (`sesion/partida/marcha.ts:118`). Si se quiere, va en un issue aparte.
