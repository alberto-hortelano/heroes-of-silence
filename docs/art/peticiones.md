# Peticiones de la sesión de arte a la de reglas

Cambios fuera de lo que la rama `arte` puede tocar. Los hace la sesión de reglas.

## 1. Ids de unidad para las facciones nuevas (fase 4)

Las hojas de `assets/unidades/<id>/` usan ids provisionales (ver
`docs/art/unidades.md`). Cuando el catálogo tenga las unidades, hace falta una
tabla id-del-catálogo → id-de-hoja, o usar los mismos ids. Mientras ninguna
criatura del catálogo lleve uno de estos ids, `personajes.ts` no puede
engancharlas: `test/personajes.test.ts` exige que cada cuerpo de la tabla exista
en el catálogo.

## 2. Que `comoAtlas` exija los campos derivados (#120)

Los JSON del taller llevan `altura` y `cajaDeClic` medidos sobre la imagen.
Cuando se enganchen, la tabla `ALTURA` de `personajes.ts` y los factores de
`cajaDeFigura` de `render/batalla.ts` deberían leerlos del JSON en vez de
escribirlos a mano. `personajes.ts` sí lo puedo tocar yo al enganchar las hojas;
`render/batalla.ts` no.

## 3. Enganchar las piezas del mapa nuevo

`assets/mapa/<pieza>.webp`, en el estilo pintado oscuro que eligió el usuario
(referencia: `assets/mapa/muestras/pintado.webp`). Aprobadas el 01-10-2026.

| Pieza | Fichero | Para qué |
|---|---|---|
| Montaña infranqueable | `montana-1`, `montana-2`, `montana-3` | cordillera: alternar variantes y solaparlas para que se lea como muro |
| Nodo sin fortificar | `nodo-hito` | hito con poste vacío |
| Nodo con empalizada | `nodo-empalizada` | fortificación de nivel 1 |
| Nodo con torre | `nodo-torre` | fortificación de nivel 2 (incluye la empalizada) |
| Ciudad (punto fuerte) | `ciudad` | murallas de serie |
| Pueblo | `pueblo` | abierto, sin murallas |
| Oro, piedra, madera | `oro`, `piedra`, `madera` | recursos |

Cada pieza lleva al lado su `.json` **derivado de la imagen** (`ancho`, `alto` y
`ancla`: el centro de su base, en píxeles de la imagen), para colocarla por el
pie sin escribir cifras a mano (#120), y su `.procedencia.json`.

- **La bandera del dueño la pinta el juego** en su color, colgada del poste del
  nodo (está vacío a propósito) o sobre la ciudad. Las piezas no llevan
  estandartes.
- La escala en pantalla la decide `render/mapa.ts`. Una composición de prueba con
  la montaña a ~4 casillas de ancho, la ciudad a ~3,5, el pueblo a ~2,7, los
  nodos a 1,1-1,8 y los recursos a ~1 casilla se veía bien con las figuras a
  ~1 casilla de alto.
- `assets/rpg/map-atlas.png` (castillo, minas, árboles…) sigue en el estilo
  anterior, pixel art. El usuario dijo que no pasa nada por rehacerlo: si se
  quiere coherente, se pide al taller en el estilo pintado.

## Respuestas de la sesión de reglas (01-10-2026)

1. **Ids:** en la fase 4 el catálogo usará **los mismos ids** que las hojas
   (`docs/art/unidades.md`). No hay tabla de traducción, así que esos ids son ya
   contrato: no se renombran. `test/arte-hojas.test.ts` exige que la tabla del
   documento y las carpetas de `assets/unidades/` digan lo mismo.
2. **Campos derivados (#120):** los leerán `personajes.ts` y `render/batalla.ts` en
   la fase 2b. La tabla `ALTURA` de `personajes.ts` **no** la escribe la rama
   `arte`: la hace la sesión de reglas al enganchar.
3. **Piezas del mapa:** se enganchan en la 2b, colocadas por su `ancla`, con la
   bandera pintada por el juego. Si se rehace `map-atlas.png` en el estilo pintado
   (castillo, minas, árboles), entra también en la 2b.

La rama `arte` se integra en main al acabar el ciclo actual de reglas; mientras,
los commits siguen en `arte`.

## 4. `map-atlas.png` rehecho en el estilo pintado (aprobado el 01-10-2026)

Las 16 celdas de siempre, en el mismo orden y colocadas con la misma base y el
mismo centro que las antiguas: `render/mapa.ts` no necesita ningún cambio para
pintarlas. Al lado va `assets/rpg/map-atlas.json` con la caja y el ancla medidas
de cada celda, para cuando la 2b deje de escalar a ojo (#120). Las piezas sueltas
están en `assets/mapa/atlas/`, cada una con su procedencia. El castillo ya no
lleva estandartes: la bandera la pinta el juego.

## 5. Efectos de batalla e iconos de recursos (aprobados el 02-10-2026)

Todo en el estilo pintado oscuro, con su JSON y su procedencia al lado.

| Qué | Dónde | Cómo se usa |
|---|---|---|
| 8 efectos animados | `assets/efectos/animados/<id>.webp` | tira de 6 fotogramas de 256; su `.json` dice `fotogramas` y la `caja` que ocupan dentro de la celda. Se pintan una vez centrados en la casilla; la página de revisión los pone a 10 fps |
| 16 iconos de estado | `assets/efectos/iconos/<id>.webp` | 128×128, pensados para pintarse a ~32 px sobre la ficha. Índice en `iconos.json` |
| 6 sprites quietos | `assets/efectos/<id>.webp` | cadáver (en el hex del caído), empalizada (obstáculo del ingeniero), trampa (goblin), y flecha, virote y bala de cañón como proyectiles: horizontales y mirando a la derecha, se rotan hacia el blanco |
| 3 iconos de recursos | `assets/iconos/recursos/{oro,piedra,madera}.webp` | 128×128 para la barra y los costes, legibles a 20 px. Índice en `recursos.json` |

Ids de los efectos: `curacion`, `drenaje`, `explosion`, `fuego`, `golpe`, `raices`,
`resurreccion`, `veneno`. Iconos de estado: `veneno`, `aturdido`, `recarga`, `guardia`,
`proteger`, `desafio`, `cobarde`, `miedo`, `bendecido`, `regeneracion`, `sigilo`,
`estupido`, `contraataque`, `antiinfanteria`, `fe`, `furia` (el ¡Waaagh!). La
asociación habilidad → icono es la de `tools/taller/efectos.ts`.

El humo y los resplandores de los efectos son semitransparentes a propósito: se
pintan con su alfa, sin teñir.

## 6. El hermano de carga vuelve a ir a caballo (02-10-2026)

Decisión del usuario: la caballería templaria **sustituye** al hermano de carga a pie.
El id **no cambia** (`templario-hermano-de-carga`); cambia su arte, que ahora es un
jinete. Lo que tiene que saber quien lo enganche:

- Su atlas tiene **celda de 384**, no de 256: a la escala de la infantería (un
  adulto a ~160 px) el jinete no cabe en 256. El JSON lo dice (`cell: 384`) y
  `character.ts` ya dibuja con la celda del atlas, así que no hace falta código
  nuevo; solo que nadie suponga 256.
- Su `altura` (289 px, lanza en alto incluida) está medida para que el jinete
  mida lo mismo que un soldado a pie. Quien escale por `altura` lo verá más alto,
  y es correcto: va montado.
- Ocupa más casilla a la vista. Si las reglas lo hacen unidad de dos hexes, el arte
  ya tiene el tamaño de una; si sigue en uno, pisará algo el hex vecino al pintarlo.

- Su atlas tiene **cuatro filas y cuatro clips**, no tres: `idle`, `walk`,
  **`charge`** y `attack` (decisión del usuario):
  - `charge`, la carga: el paso con la lanza bajada, **en bucle** como la marcha.
    Es lo que se pinta mientras se mueve para cargar.
  - `attack`: ya parado en combate, caballo quieto y tajo de **espada**, sin lanza.
  `CharacterClip` en `character.ts` y `comoAtlas` en `personajes.ts` conocen hoy
  tres clips: hace falta añadir `charge` (opcional; quien no lo tenga, usa `walk`).
- Pendientes, decididos y aún sin hacer: muerte y herida (para todas las unidades).

La referencia de pose sale de un caballo 3D CC0 (Quaternius) con el Y Bot sentado,
renderizados con la cámara del juego: `tools/art/montura.ts`.

## 7. Edificios de ciudad (aprobados el 02-10-2026)

`assets/edificios/<facción>/<id>.webp`, uno por edificio de producción de élite de
`NuevaJugabilidad.md`, construido y suelto, en el estilo pintado oscuro y a 25°.
Cada uno lleva su JSON derivado (`ancho`, `alto` y `ancla`, el centro de su base)
para colocarlo por el pie en su solar, y su procedencia.

| Facción | Edificios (id) |
|---|---|
| Templarios | `monasterio`, `establos`, `forja` |
| No muertos | `cripta`, `mausoleo`, `torre-oscura` |
| Imperio | `taller`, `armeria`, `fundicion`, `biblioteca` |
| Elfos | `arboleda`, `cubil`, `pabellon-de-caza` |
| Orkos | `cueva`, `pocilga`, `totem` |

Qué produce cada uno está en `tools/taller/edificios.ts`. El solar vacío lo pinta la
pantalla de ciudad, como hoy.

## Cierre de la rama `arte` (02-10-2026)

La rama se cierra aquí: el trabajo de arte que siga irá en ramas nuevas. Pendiente
de integrar en `main` desde la última integración: los siete commits desde
`d219d58` (página de ejércitos) hasta `67b2fc9` (jinete y edificios), que traen las
peticiones 5, 6 y 7 de este documento. Árbol limpio, `pnpm verify` en verde, sin
encargos en la cola del taller.

Lo que queda por hacer, para las ramas nuevas:
- Muerte y herida para todas las unidades (decidido, sin empezar).
- Volver a montar otras unidades con la herramienta del caballo: el pack de
  Quaternius trae ciervo, venado y lobo (corredores del bosque élficos).
- Repasar lo aceptado con reservas: el ataque de rodillas del monje y las marchas
  menos finas (`pnpm taller corregir <id>-atlas "…"`, en su mismo hilo).

## 8. Lo que piden los mapas densos (sesión de reglas, 03-10-2026)

Desde «mapas densos» el generador separa las regiones con fronteras de 2-3
casillas de **cinco barreras distintas en el motor** —`mountain`, `water`,
`forest`, `cliff`, `wall`— elegidas según el suelo de los dos lados
(`data/barreras.json`), pone obstáculos que bloquean dentro de cada región y una red
de caminos. El cliente lo pinta de momento con pigmentos, una franja oscura de
borde, las montañas de la petición 3, árboles y ruinas del atlas viejo y las
texturas de `assets/generated/terrain/` como trama: **todo temporal**. Para
construir los mapas como la referencia (`assets/art/mapas/`) hace falta:

| Pieza | Para qué | Notas |
|---|---|---|
| Textura pintada por suelo: `grass`, `dirt`, `sand`, `snow`, `swamp`, `lava`, `rough` | el suelo entero de cada región | vista a 90°, lisa y sin motivo (las reglas de `prompts.ts`); sustituye la trama de `generated/terrain` |
| Borde de bosque denso (`forest`) | frontera y obstáculo verde | masa de copas que se lea como muro, no como arboleda suelta; piezas que encajen en tramos de 2-3 casillas |
| Borde de acantilado o desnivel (`cliff`) | frontera de arena, lava y roca | cara de roca con sombra hacia el lado bajo; hoy no tiene ninguna pieza |
| Borde de muro o ruina (`wall`) | frontera de las regiones de casa | muralla o lienzo derruido en tramos; hoy, la ruina del atlas pixelado |
| Orilla de río o lago (`water`) | frontera de pantano y prado | la orilla, no el agua: el agua la da el pigmento |
| Más montañas (`mountain`) | cordillera de nieve y roca | las tres de la petición 3 bastan para alternar; harían falta piezas de esquina |
| **Puente** como nodo sobre agua | el paso de una frontera de `water` | con el poste vacío para la bandera, como `nodo-hito` |
| **Puerta** como nodo en un muro | el paso de una frontera de `wall` | ídem |
| **Paso** de montaña, de bosque y de acantilado | el resto de nodos | hoy todos son `nodo-hito` |
| Obstáculos interiores por suelo | las manchas de 1-6 casillas de dentro de una región | bosquecillo y estanque en prado, rocas en roca y nieve, dunas o farallones en arena, coladas en lava, ruinas en tierra; pequeños y que no tapen objetos |

Lo que **no** hace falta: arte para los caminos (el trazo actual vale) ni para el
minimapa (usa los pigmentos). Nada de esto se ha generado ni se ha gastado nada.

## 9. El templario con escudo, definitivo: 8 direcciones (rama `templario-definitivo`)

`assets/unidades/templario-escudo/d0` … `d7`: un atlas de 6 filas por dirección
(`idle`, `walk`, `charge`, `attack`, `hurt`, `death`), celda de 384 y pies en
y=342, más `cadaver: { clip: 'death', frame: 6 }`. El `atlas.webp` raíz (3 filas,
una dirección) **ya no existe**: se borró con el resto del arte de una dirección
al llevar el juego a las 8 direcciones (`docs/agents/2026-10-03-ocho-direcciones/`),
y un guardia de `test/invariantes.test.ts` impide que vuelva. Lo que pedía esta
sección al juego ya está hecho:

- La dirección sale de hacia dónde se mueve o ataca la unidad
  (`NOMBRES_DE_DIRECCION`, en `src/shared/arte.ts`: 0 de frente, 2 derecha, 4
  espalda, 6 izquierda) y **no se espeja nunca**: con la luz fija, el espejo la
  traería del otro lado.
- La sombra es por silueta, y sin arte vuelve al óvalo.
- Al morir queda el fotograma `cadaver` en la casilla hasta el final de la batalla.
- **La luz del contrato ha cambiado**: `ARTE.luz.direccionSombra` pasa de
  `(1, 0,6)` a `(1, −0,6)`, así que la sombra que pinta hoy el juego ya cae hacia
  el fondo.

## 10. El arte de los mapas densos (rama `arte-mapas`, respuesta a la §8 y al #134)

Todo en el estilo del mapa de referencia (`assets/art/mapas/`), que el usuario dio
por bueno el 03-10-2026 sobre dos láminas de muestra
(`assets/mapa/muestras/denso-{a,b}.webp`). Cada pieza lleva su `.json` derivado
(`ancho`, `alto` y `ancla`, el centro de su base) y su procedencia. El catálogo
y la regla de elección están en `tools/taller/mapa-denso.ts`. La composición de
prueba, `pnpm taller vista-mapa <semilla>`, pinta un mapa real de `newGame` con
todo esto: es la propuesta de cómo engancharlo, no el render.

| Qué | Dónde | Notas |
|---|---|---|
| Textura de cada suelo | `assets/mapa/suelos/<suelo>.webp` | 512×512, repetible por los cuatro lados (la costura la fabrica el taller). Sustituye a `tramarTexturas` y a `rpg/suelo.webp`. En la composición, una textura cubre 4×4 casillas, anclada al mundo |
| Bordes | `bosque-{verde,nevado,pantano}-1..3`, `acantilado-{arena,lava,roca}-{ancho-1,ancho-2,hondo-1}`, `muro-{ancho,hondo}-1..2`, `orilla-1..3`, `montana-volcan-1..2`, `pico-1..3` | tramos de unas 2 casillas. `ancho`: la frontera corre a lo ancho de la pantalla; `hondo`: se aleja hacia el fondo. El pico remata los extremos de una cordillera, no la rellena |
| Obstáculos | `bosquecillo`, `pinos-nevados`, `arboles-muertos`, `rocas`, `rocas-nevadas`, `cono-volcanico`, `colada`, `farallon`, `pena`, `ruina-1..3` (`-1..2` salvo la ruina) | de una casilla, para componer las manchas de 3-6 |
| Nodos de paso | `nodo-puente-{ancho,hondo}`, `nodo-puerta-{ancho,hondo}`, `nodo-paso-montana`, `nodo-paso-bosque`, `nodo-paso-acantilado` | con el poste vacío para la bandera. En un nodo, el eje es el de la frontera que cruza: en `nodo-puente-ancho` el río corre a lo ancho y el puente va hacia el fondo |

Cómo se elige, y lo que la composición aprendió al probarlo:

- **La pieza de una casilla de barrera** sale de su barrera y del suelo más cercano
  (`piezaDeCasilla`). Una frontera tiene dos suelos, y la casilla puede tener más
  cerca el que no la eligió (una montaña junto al prado). Entonces vale cualquier
  pieza de esa barrera: sin ese respaldo quedaban franjas vacías.
- **Una mancha interior** es un componente de una sola barrera de 6 casillas o
  menos que no toca el borde del mapa. El motor no distingue obstáculo de
  frontera; así se deduce y acierta en las semillas probadas.
- **Los tramos con cara** (muro, acantilado) van en una casilla de cada dos. En
  todas, una frontera diagonal se apila como un peine. Las masas (bosque, montaña)
  sí van en todas.
- **La orilla** va solo en las casillas de agua que tocan tierra, a unas 1,3
  casillas de ancho. A 2 parece un tronco flotando.
- **El nodo** no sabe qué barrera cruza: `buildMap` lo pinta como `dirt` y no se
  guarda. Se deduce de sus 8 vecinas (`barreraDeNodo`): la barrera que más se repite,
  y el eje según queden a sus lados o arriba y abajo.
- **Anchos que se ven bien** a 48 px por casilla: borde 2, obstáculo 1,15, nodo 1,7.

Lo que no cambia: las piezas de la petición 3 (montañas, ciudad, pueblo, recursos)
siguen valiendo, pero son del estilo anterior, más claras.

**La composición por casilla queda superada por la §11**: el usuario la vio y se
leía como un mapa con cosas encima. Las piezas de esta sección siguen en el repo
(los nodos de paso las usa el escenógrafo); la regla de una pieza por casilla, no.

## 11. El escenógrafo: cómo pintar el mapa denso (rama `arte-mapas`, 04-10-2026)

`pnpm taller escenario <semilla>` compone un mapa real de `newGame` como escenario
continuo: relieve con caras de roca, ríos encajados en barrancos, cordilleras y
bosques hechos de muchos módulos, muros en 8 direcciones, cubierta en manchas y
sendas que serpentean. Cómo funciona, en `docs/art/taller.md` («El
escenógrafo»). El arte está en `assets/mapa/modulos/` (27 hojas) y
`assets/mapa/texturas/`, cada pieza con su procedencia.

Lo que se pide a la sesión de reglas, de menos a más:

1. **Enganchar la escena.** Está preparado para que el render no tenga que
   entender cómo se compone (ver «Contrato del enganche», abajo). Es la petición
   que lo hace visible; las dos siguientes lo hacen mejor.
2. **Un nivel por región en el motor.** Hoy el nivel se deduce del suelo y de una
   tirada (`nivelDeRegion`, en `relieve.ts`). Si `regions[]` llevara `nivel`, el
   agente que diseña el mapa podría decidir dónde está la meseta, y el relieve
   sería un dato y no una deducción. Sin efecto en las reglas.
3. **Ríos como líneas.** Una frontera de agua es una franja de 2-3 casillas; el
   escenógrafo la pinta como río encajado. Si el generador trazara los ríos como
   líneas que bajan de nivel (con su cascada donde cambian), la red seguiría
   siendo la misma y el río tendría curso.
4. **Saber qué barrera cruza un nodo.** Igual que en la §10: hoy se deduce de las
   vecinas (`barreraDeNodo`).

**La 1 está hecha (04-10-2026)**, con una forma algo distinta de la de abajo —
decisión del usuario—: el código puro vive ahora en `src/client/render/escenario/`
(con `git mv`), y la escena no se pinta entera en una superficie: el **suelo** sí
(`pintarSuelo`, a 72 px), y los **volúmenes** se pintan a cada fotograma
(`separar`, `pintarVolumen`) mezclados con las figuras por profundidad.
`pintarEscena` es hoy las dos cosas seguidas, y la página del taller enseña
exactamente lo que pinta el juego. Detalle en
`docs/agents/2026-10-04-escena-del-mapa/`. Las 2-4 siguen abiertas.

### Contrato del enganche (04-10-2026)

Las dos puertas no importan nada de Node —ni `fs`, ni `sharp`, ni Playwright—, y
lo vigila un test que sigue sus imports (`test/taller-escenario.test.ts`, «lo que
importaría el juego»):

```ts
import { componer } from '…/escenario/colocar.js';      // (map, semilla, catalogo) → Escena
import { imagenesDeEscena, pintarEscena } from '…/escenario/pintar.js';
import catalogo from '…/assets/mapa/escena.json';         // tipo Catalogo, de catalogo.ts
```

- **El catálogo** es `assets/mapa/escena.json`: medidas y ancla de los 27 juegos de
  módulos y de las 71 piezas sueltas, con `src` relativa a `assets/mapa/`. Lo
  rehace `pnpm taller catalogo-escena`, y un test falla si el del repo no es el
  que sale del disco.
- **`componer(map, semilla, catalogo)`** es pura y determinista (su propio azar,
  no el de la partida): 60-80 ms en 34×34, unos 7 000 sprites y ~1,7 MB de JSON.
  Se llama **una vez por partida**, con el mapa recién hecho: solo lee terreno,
  regiones, caminos y la posición de los objetos, que no cambian.
- **`imagenesDeEscena(escena)`** lista las imágenes que puede pedir (unas 470;
  `assets/mapa/modulos/` pesa 16 MB). `pintarEscena` no carga nada: recibe
  `imagen(src)` y, si una no ha llegado, pinta el marcador de color de esa pieza,
  así que el juego sigue jugándose sin arte. Volver a pintar cuando llegue el arte
  encaja con `versionDelArte`.
- **`pintarEscena(ctx, escena, opciones)`** pinta en cualquier contexto 2D
  (`<canvas>` u `OffscreenCanvas`). Con `margen: 0` la casilla (x, y) empieza en
  (x·tile, y·tile), la misma rejilla que la del juego. Tarda ~1,4 s en Chromium
  sin GPU a 48 px por casilla, así que se pinta **una vez** en una superficie
  aparte y se copia cada fotograma, igual que la superficie del mapa de hoy. Para
  el juego:
  ```ts
  pintarEscena(ctx, escena, {
    tile, margen: 0, imagen,
    nubes: false, vineta: false,            // la niebla y el marco son del juego
    objeto: (o) => o.kind === 'town' || o.kind === 'village' || o.kind === 'node' || o.kind === 'mine',
  });
  ```
  `objeto` decide qué objetos se hornean en la escena. Los que cambian durante la
  partida —un monstruo vencido, un recurso o un cofre recogidos— no deben ir
  horneados: los pinta el juego encima, como hoy. Los fijos sí (ciudad, pueblo,
  nodo, mina), y el juego pone encima la bandera de su dueño.
- **Encima de la escena, todo lo de hoy**: la niebla, que se pinta con `fog`, los
  héroes, los asaltantes, las banderas, la selección y el camino del ratón.
- **Lo que queda abierto, y lo decide quien enganche**:
  - dónde vive el código —puede quedarse en `tools/taller/escenario/` e
    importarse desde el cliente, o moverse a `src/client/render/escena/`; las dos
    puertas no tienen nada que impida moverlas—;
  - si el minimapa sigue con sus pigmentos;
  - qué hacer con los mapas que diseña el agente: valen igual, porque `componer`
    solo lee el `GameMap`.

  Las piezas son a 48 px por casilla; con otro zoom se escala la superficie.

