**REENCUADRADA** — los puntos 1 y 2 siguen pasando y son baratos; el 3 es real, pero pide centrar
la cámara en un espectador que no tiene cámara que mover, y el criterio 4 pide navegador donde basta
un test de `renderLog`.

## El problema real

La crónica que lee quien no juega (el espectador) colorea y redacta como si leyera alguien con
bando, y la que leen todos sitúa los hechos con una casilla que ninguna pantalla enseña.

## La premisa, punto por punto (contra `d791d03c`)

1. **Verde para la caída de un héroe en el espectador: sigue pasando.**
   - `src/client/views/cronica.ts:441` (`hero_defeated`) y `:447` (`hero_returned`) usan
     `clase(!mio, mio)`; `mio = e.actor === viewer` (`:231`).
   - El espectador llama con `viewer = NADIE = -1` (`src/client/espectador/paneles.ts:219`,
     `src/client/comun/quien-mira.ts:37`): `mio` siempre es falso y `!mio` pinta `class="win"`
     (`src/client/views/notas.ts:202-203`).
   - El comentario de `quien-mira.ts:12-14` dice que la pregunta de dos «contesta bien por
     accidente» en el resto de la crónica: es verdad para `clase(mio, false)`, pero no para
     estas dos ramas, las únicas con `!mio`. Las demás de color ya funcionan para NADIE:
     `battle_ended` (`:429-435`, `suyo` nulo, sin color), `game_over` (`:477`, `desenlaceDe`),
     `site_occupied` (`:319`), `town_owner_changed` (`:301`).
   - El único test con NADIE es el de `game_over` (`test/cronica.test.ts:753-760`); el de
     `hero_defeated` (`:527-539`) solo mira al viewer 0.
2. **Concordancias: siguen pasando, con un alcance menor del que dice el issue.**
   - «Momia» ya no existe: hoy el catálogo tiene cinco facciones (`data/unidades.json`).
   - El patrón sí sigue: `Un ${unidadDelJuego(e.creature).name}` en `hero_promoted`
     (`cronica.ts:381`) y `troop_rank_up` (`:464`). Hoy solo hay un nombre femenino:
     «Sacerdotisa» (`elfo-sacerdotisa`), que daría «Un Sacerdotisa». El catálogo no tiene campo
     de género (grep de `genero|género|femenin` en `src/core/unidad`, `data/unidades.json`: nada).
   - «pierde el jugador 1 2 × Momia» **no es un error de concordancia**. «N × Nombre» es la
     notación de toda la crónica (`:41`, `:261`, `:338`, `:342`, `:356`, `:123`). Lo que se lee
     mal es el doble número seguido, y solo en tercera persona: en la partida, `bando` dice «el
     enemigo» (`:106-107`, `:120-123`); en el espectador, «el jugador 1». El criterio 2 tiene que
     nombrar ese defecto, no «concordancia».
3. **Coordenadas que nadie localiza: siguen pasando, pero menos que cuando se abrió.**
   - Desde #18 se nombran por su sitio las guarniciones, los pueblos, los puestos y los lugares
     (`sitioOCasilla`, `enElLugar`, `:185-222`; el espectador recibe pasos y pueblos del cable,
     `paneles.ts:212-221`).
   - Siguen con la casilla a secas (`enLaCasilla`, `:49-53`) unas quince frases: paso, castillo,
     construir, reclutar, licenciar, lo que no cabe, contratar, botín, armería, ascensos, caída,
     vuelta a la base, emboscada, parada de la marcha y batalla.
   - Ninguna pantalla enseña coordenadas: el único `(${x}, ${y})` del cliente es `cronica.ts:52`.
   - **La partida** sí puede llevar la cámara a un punto: `EscenaDelMapa.mirarA`
     (`src/client/partida/mapa/escena.ts:447`) y `centrarEn` (`render/mapa/camara.ts:269`).
   - **El espectador no tiene cámara que mover.** Mira siempre desde lo más lejos, centrado en la
     escena (`src/client/espectador/main.ts:180-186`, `:298-309`), sin rueda ni arrastre (no hay
     ningún manejador de puntero). Por eso «pulsable y centra la cámara en el espectador» no es
     un clic: es darle una cámara que no tiene. El criterio 3 lo pide sin decirlo.

## El día después

- Puntos 1 y 2: quien mira desde fuera deja de ver como victoria el revés de un jugador, y la
  línea del ascenso de una sacerdotisa se lee bien. Ninguno cierra puertas.
- Punto 3, en la partida: la línea se pulsa y lleva al sitio. Así la crónica deja de ser texto
  y pasa a ser un control. Hay que cuidar que `pintar` repinta el panel con cada cambio, y el
  foco de un botón pulsado con el ratón no se conserva (`CLAUDE.md`, «Contratos»).
- Punto 3, en el espectador: si se exige centrar, la tarea crece hasta hacer una cámara para el
  espectador. Eso es otra tarea, y de otra área (`docs/areas/agente.md`).
- Si se arregla el color con otro `if (viewer === NADIE)` metido en dos ramas, se reabre el
  mismo agujero que `quien-mira.ts` documenta para la siguiente rama que use `!mio`. Que lo
  decida el arquitecto, pero el test tiene que recorrer todas las ramas con NADIE, no solo
  esas dos.

## Conflictos

- **Con la tanda de hoy, ninguno.**
  - #313/#317 tocan `contract/esquemas.ts`, `contract/vocabulario.ts` y `server/director.ts`.
  - #321 toca `mundo/validar.ts` y `state/marcha.ts`.
  - #332 toca `partida/lugar/escena.ts`.
  - #327 toca el taller y `test/documentacion.test.ts`.
  - El pueblo en la puerta toca `map/generar/`.
  - Esta toca `views/cronica.ts`, `espectador/paneles.ts` y, si sigue adelante el punto 3,
    `partida/mapa/`.
  - `contract/hechos.ts` no importa nada de la crónica de pantalla.
- **#294** (el cambio de un veterano por otro no se lee) es del mismo fichero
  (`troops_exchanged`, `cronica.ts:394-405`). Es independiente y no está en la tanda: no se
  junta.
- **#324** (el espectador sin lo vivo) y **#303** (los paneles del espectador): si algún día el
  espectador sabe nombrar ciudades y lugares, le quedan menos casillas mudas. No bloquean.

## Coste contra valor

- Puntos 1 y 2: unas pocas líneas y un test de `renderLog` con `viewer = -1`, que es la función
  exacta que llama el espectador (`paneles.ts:219`). Valen lo que cuestan; sin ellos, el
  espectador miente en el color, que es lo que #18 vino a quitar.
- Para los puntos 1 y 2, el navegador del criterio 4 no compra nada. Para ver un
  `hero_defeated` en el espectador hace falta una partida del agente con un héroe vencido, y
  ver eso es caro.
- Punto 3: valor real en la partida y coste moderado (`mirarA` ya existe). En el espectador, el
  coste es otro orden y el valor, dudoso: mira el mapa entero desde lo más lejos.
- No hacer nunca el punto 3 es aceptable. No hacer el 1 no lo es.

## Qué le cambiaría a `requisitos.md`

> 2. Concordancias: «Un ${unidad}» en `hero_promoted` y `troop_rank_up` (`views/cronica.ts`)
>    sale bien con un nombre femenino (hoy, «Sacerdotisa»), sin depender de que el catálogo no
>    tenga otro. «N × Nombre» es la notación de la crónica y se queda. Lo que se arregla es el
>    doble número del espectador («pierde el jugador 1 2 × …», `fraseDeBatalla`), que no se
>    lea como un solo número.
>
> 3. Coordenadas: en la partida, una línea de la crónica que cuenta un hecho en una casilla
>    lleva a ella, o la nombra de otra forma (decide el arquitecto). En el espectador, que no
>    tiene cámara movible (`espectador/main.ts`, `encuadreDelMapa`), **no se le añade cámara en
>    esta tarea**: o la línea nombra el sitio sin coordenadas, o se queda como está y se dice.
>
> 4. Los puntos 1 y 2 se prueban con tests de `renderLog` con `viewer = NADIE` que recorren
>    todas las ramas con color, no solo las dos del issue. El navegador (Playwright, sin
>    pantalla), solo para el punto 3 en la partida.
