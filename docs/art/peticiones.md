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
| Nodo sin fortificar | ~~`nodo-hito`~~ (retirado por su cruz, §24) | hito con poste vacío |
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
| **Paso** de montaña, de bosque y de acantilado | el resto de nodos | hoy todos son `nodo-hito` (luego los hitos de la §24) |
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
| Nodos de paso | `nodo-puente-{ancho,hondo}`, `nodo-puerta-{ancho,hondo}`, `nodo-paso-montana` (sin uso desde #203: el paso lo abre la cordillera y lleva el hito), `nodo-paso-bosque` (sin uso desde #196: el paso lo abren los árboles del bosque y lleva el hito), `nodo-paso-acantilado` (sin uso desde #168: el acantilado lleva el hito) | con el poste vacío para la bandera. En un nodo, el eje es el de la frontera que cruza: en `nodo-puente-ancho` el río corre a lo ancho y el puente va hacia el fondo |

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
- **El nodo** sabe qué barrera cruza: la guarda el mapa (`MapObject.barrera`, #145,
  08-10-2026). El eje sale de sus 8 vecinas (`ejeDeLaFrontera`), según queden a
  sus lados o arriba y abajo.
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
4. **Saber qué barrera cruza un nodo.** Hecha (#145, 08-10-2026): la guarda el
   mapa (`MapObject.barrera`).

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


## 12. El Imperio en 8 direcciones, y dos juegos de armas nuevos (rama `arte-mapas`, 04-10-2026)

Lo pidió el usuario: animar el Imperio de `NuevaJugabilidad.md` y crear el arte
que faltara en `assets/art/imperio/`. Decisiones suyas del 04-10-2026:

- **El Duelista sustituye al Noble.** `heroe-imperio-noble` desaparece del
  taller (`tools/taller/unidades.ts`), de `tools/arena/velocidades.ts` y de
  `assets/unidades/`, y entra `heroe-imperio-duelista` (ropera y daga).
- **El Ingeniero lleva rifle**, como dice su ficha: identidad rehecha, juego
  del Y Bot `ballesta` en vez de `maza`.
- **Dos unidades nuevas**: `imperio-pistolero-montado` e `imperio-granadero`.
- **Poses nuevas** para ellas, en vez de aproximarlas:
  - `granada`: el Y Bot arma el brazo sobre el hombro y lanza; suelta en la
    columna 4 (`atlas-8d.json`);
  - `montado-pistola`: el jinete de `montura.ts` sin lanza ni escudo, con la
    pistola alzada al paso, apuntando en la carga y disparando en el ataque;
    suelta también en la 4.

  El usuario autorizó ampliar la lista de juegos de `test/personajes.test.ts`
  con los dos nombres; no se tocó nada más de ese test.

**Lo que queda para la sesión de reglas:**

1. **El perfil de la arena** (`PERFILES_DE_ARENA`, `src/core/arena.ts`). Las dos
   unidades nuevas usan perfiles que ya existen, solo por sus cifras:
   - el pistolero, `montado-lanza`, que le da carga y no disparos;
   - el granadero, `ballesta`, que le da disparos.

   Si el pistolero tiene que disparar en la arena, hace falta un perfil o un
   rasgo para él.
2. **El proyectil.** El cliente suelta el mismo proyectil para todo disparo. Una
   granada debería volar en parábola, por encima de las tropas, y rebotar, como
   dice su ficha; la pistola, un fogonazo corto. `efecto-bala-de-canon` y
   `efecto-explosion` ya existen y pueden servir.
3. **Ids del catálogo**: cuando lleguen las facciones nuevas a `data/`, el
   Duelista es `heroe-imperio-duelista` (docs/art/unidades.md).
4. **La velocidad del pistolero.** Va a 5 casillas (`tools/arena/velocidades.ts`),
   como los hostigadores, porque `test/arena.test.ts` da al hermano de carga
   por único jinete y exige que solo el Danzante llegue a 6. Si debe correr
   como el otro jinete (7), hay que cambiar ese test. Lo mismo vale para el
   jinete elfo (`elfo-jinete`, 05-10-2026), también a 5.

### Estado al cerrar el 04-10-2026 (sin commitear)

**Hecho**
- **Las 13 unidades del Imperio en 8 direcciones**:
  - 10 de ellas pintadas sobre su maniquí propio (`maniqui` en
    `tools/taller/unidades.ts`, `pnpm taller maniqui <id>`, carpetas
    `_poses/unidades/<id>-8d/`);
  - el granadero, sobre su juego `granada`, y el pistolero, sobre el suyo,
    `montado-pistola`.
- **La séptima acción, `shoot`** (ciclo `docs/agents/2026-10-04-ataque-y-disparo/`,
  QA apto con reservas):
  - `attack` es siempre cuerpo a cuerpo y `shoot` va en una hoja C de una fila;
  - la suelta va en `shoot`;
  - el cliente pinta `shoot` y precarga la hoja C;
  - si al arte le falta `shoot`, se pinta con `attack` y avisa una vez.
- **Los 6 tiradores con su `shoot` pintado**, con su hoja B de cuerpo a cuerpo
  nueva: granadero, arcabucero, artillero, ingeniero, ballestero y pistolero
  montado.

**Pendiente para la próxima sesión**
1. **La hoja C de una fila falla mucho con armas largas de perfil**: el
   rifle toca a la figura vecina y el recorte las cuenta juntas.
   - La tira de 7×1 no la pinta bien ChatGPT, que no hace imágenes tan anchas.
   - Hay que valorar una hoja C en dos filas (4+3) o un recorte que separe por
     columnas.
2. **Fusionar `main`** (enganche del escenógrafo, ba057bd) en `arte-mapas`
   después del commit de este trabajo.
3. **Backlog del ciclo**:
   - quitar las poses de una dirección (`renderizarPerfil`/`PERFILES`), que no
     tienen llamante;
   - un remate `martillo` para el ingeniero;
   - el CLI `derivar` lanza con el atlas de 6 filas de un tirador;
   - `escalaDePose` sin test;
   - unificar el registro de hojas de la arena con su espejo en
     `tools/qa/capturas.ts`.

## 13. Los Orkos en 8 direcciones (rama `arte-mapas`, 05-10-2026)

Mandan las unidades de `NuevaJugabilidad.md` (decisión del usuario). Ya está:
- **Unidades** (`tools/taller/unidades.ts`, velocidades y `docs/art/unidades.md`):
  - salen el berserker, el fanático y el señor de la guerra;
  - el chamán orko pasa a ser `heroe-goblin-chaman`;
  - entran `goblin-jinete-de-hiena` (montado-lanza, a 5 como el jinete elfo) y
    `orko-armadura-pesada` (gran hacha, a 3);
  - los tests de la arena y `tools/qa/capturas.ts` usan `orko-dos-armas`
    donde estaba el berserker.
- **Láminas nuevas** en `assets/art/orkos/`: kaudillo, jefe goblin, chamán
  goblin, jinete de hiena y orko con armadura pesada. Su procedencia candidata
  está en `.cache/laminas/entradas-orkos.json` y pasa a `assets/art/prompts.json`
  con el visto bueno del usuario.
- **Maniquí propio** para 8 Orkos (todos menos el arquero y el jinete), ya
  renderizado en `_poses/unidades/<id>-8d/`.
- **Identidad** de las 3 unidades nuevas y **giro** de las 10, salvo el del
  chamán y el del armado, que están en la cola.

**Parado**: Codex agotó su cuota hasta el **09-10-2026 a las 23:11**.

**Para seguir:**
1. **Volver a meter los 10 ids de Orkos en `IDS_EN_OCHO_DIRECCIONES` antes de
   arrancar ningún trabajador.** El trabajador lee la lista al arrancar y, sin
   ellos, tira el posproceso de cada hoja. Así cayeron las 16 del arquero, que
   se recuperaron con `pnpm taller reprocesar <id>`. Hoy no están en la lista
   porque `test/arena.test.ts` exige los 8 atlas de cada id que haya en ella.
2. **Devolver al árbol las 6 direcciones ya pintadas del arquero**, de
   `.cache/laminas/aparcado/goblin-arquero/d0`…`d5` a `assets/unidades/goblin-arquero/`.
   Se apartaron porque con 5 de 8 la guarda `tieneSusOchoDirecciones` lanza.
3. **La cola tiene 122 encargos pendientes**:
   - los giros del chamán y del armado;
   - las 8 direcciones de los 7 Orkos que ya tenían giro (el arquero, desde
     `d5-b`).
   
   Al terminar esos dos giros, hay que encolar las 8 direcciones del chamán y
   del armado (`--ocho`).

**Terminado tras volver la cuota.** Se siguieron los tres pasos de arriba. Los
10 Orkos están en 8 direcciones (el arquero, con su hoja C de disparo), sin
ningún encargo fallido, y `pnpm verify` pasa.

**La talla** (petición del usuario: «el troll con maza es más pequeño que un
goblin»). Todas las hojas iban a la altura de un adulto. Ahora cada unidad puede
declarar su `talla` (docs/art/taller.md): los goblins van a 0,7 y el troll a
1,45, y sus 88 hojas se reprocesaron sin repintar. La `d3-b` del troll no cabía y
se redujo a 214 px, en vez de 232. El jinete de hiena va también a 0,7: su
jinete es un goblin y la hiena es mucho más baja que el caballo del maniquí.

## 14. Los No muertos en 8 direcciones (rama `arte-mapas`, 05-10-2026)

Mandan las unidades de `NuevaJugabilidad.md` (decisión del usuario), con las
láminas que puso el usuario en `assets/art/no-muertos/`:
- **Cambios de unidades:**
  - salen el necrófago y el gólem de huesos;
  - el caballero de la muerte pasa de héroe a élite (`caballero-de-la-muerte`,
    con su identidad de antes);
  - entra el jinete de plaga, a caballo y a 5, como el jinete elfo;
  - el zombi lleva espada (juego `espada-escudo`, identidad repintada).
- **Láminas y maniquíes:**
  - las láminas nuevas del nigromante, el vampiro, el lich y el caballero de la
    muerte salen de su identidad aprobada;
  - el esqueleto guerrero, el espectro, el zombi y los tres héroes tienen
    maniquí propio.
- **8 direcciones:** las tienen los 9. Hubo 9 hojas con dos figuras pegadas,
  todas arregladas en su hilo (`-c1`): 5 del jinete de plaga, por el
  estandarte, 2 del lich y 1 del esqueleto guerrero y del vampiro.
- **Ninguna unidad del taller cae ya al Y Bot.** Por eso cambian tres
  comprobaciones que se apoyaban en una unidad sin arte:
  - `test/arena.test.ts` exige ahora las 8 direcciones de todas las unidades;
  - `test/taller-8d.test.ts` prueba la guarda del giro con una unidad
    inventada;
  - `tools/qa/capturas.ts` mira los atlas del orco, no las hojas del Y Bot.

  El respaldo del Y Bot ya solo lo ejercitan los tests con unidades
  inventadas.

## 15. Volúmenes que no llegan al zoom máximo (sesión de reglas, 05-10-2026)

Desde el ciclo `2026-10-05-nitidez-del-mapa`, el mapa se pinta para el zoom
máximo: `TILE_MAX` = 110 px CSS por casilla, que en la pantalla del usuario
(dpr 1,09) son **120 px de dispositivo**. El suelo ya se pinta a 120 y lo plano
llega de sobra (mínimo 141 px por casilla). Estos 13 módulos de volumen no: con
el tamaño al que los coloca `componer`, su arte da menos de 120 px por casilla y
en el zoom máximo se amplían, así que se ven algo más blandos que lo de al lado.
No se arregla en el render; hace falta arte de más resolución.

La cifra es la altura nativa del módulo entre la altura a la que se coloca, en
casillas, en el peor caso de las semillas 1 y 7 (las dos lo usan). «Veces» es
cuántas veces sale en esas dos escenas.

| Módulo (`assets/mapa/`) | Tamaño nativo | px por casilla | Veces |
|---|---|---|---|
| `modulos/picos-roca/14.webp` | 372×168 | 92 | 87 |
| `modulos/picos-roca/16.webp` | 379×187 | 102 | 75 |
| `modulos/picos-roca/10.webp` | 318×247 | 103 | 2 |
| `modulos/picos-roca/7.webp` | 365×189 | 104 | 85 |
| `modulos/picos-roca/11.webp` | 344×240 | 104 | 4 |
| `modulos/picos-roca/5.webp` | 325×227 | 105 | 87 |
| `modulos/picos-roca/9.webp` | 341×227 | 105 | 39 |
| `modulos/picos-roca/13.webp` | 314×227 | 106 | 17 |
| `modulos/picos-nevados/11.webp` | 382×194 | 106 | 52 |
| `modulos/picos-nevados/16.webp` | 269×202 | 110 | 28 |
| `modulos/picos-roca/2.webp` | 406×207 | 115 | 77 |
| `modulos/picos-nevados/5.webp` | 321×216 | 118 | 49 |
| `modulos/paredes-roca/16.webp` | 285×203 | 118 | 9 |

- **Qué pedir**: el mismo módulo a ≥ 1,3× su tamaño de hoy (el peor, `picos-roca/14`,
  necesita ×1,3 para 120 px por casilla), con la misma silueta y proporciones.
- Al engancharlo se rehace el catálogo (`pnpm taller catalogo-escena`) y se mira
  si cambia la escena de alguna semilla; no lo he comprobado, porque depende de
  cómo lea `componer` el tamaño nuevo.
- Se sacó con `escenarioDe` + `separar` (la misma cuenta que el plan de
  `docs/agents/2026-10-05-nitidez-del-mapa/plan.md`, §2).

## 16. Paredes de acantilado vistas de lado: este y oeste (sesión de reglas, 06-10-2026)

El usuario: «Un problema que veo es que hay paredes de roca y en el mapa van
todas con la misma orientación». Y sobre el oeste: «Se pide nuevo arte» (no se
espeja el del este).

- **Hoy**: el relieve (`escenario/relieve.ts`) solo dibuja pared en las caídas
  hacia el sur (`caras`), con los 16 módulos frontales de cada material
  (`modulos/paredes-{roca,arenisca,basalto,nevadas}`). Las caídas al este y al
  oeste (`cantos`) son un borde oscurecido y peñascos (`rocas-caidas`), y las del
  norte (`rebordes`), solo el reborde. Por eso toda pared corre de este a oeste y
  mira a cámara, y un risco que baja de norte a sur se lee como una escalera de
  paredes frontales.
- **Qué pedir**, por material (roca, arenisca, basalto, nevada):
  - **pared que cae al este**: la cara mira al este y se ve en escorzo con la
    cámara de siempre (25°, `src/shared/`), la parte alta a la izquierda y la
    cara de roca a la derecha, en módulos que encadenan de norte a sur;
  - **pared que cae al oeste**: su simétrica, **generada aparte** (no espejada),
    para que la luz (`src/shared/`, la del resto del mapa) caiga bien en las dos;
  - el mismo estilo, paleta y textura que el módulo frontal del mismo material
    (referencia: `modulos/paredes-roca/*.webp` y `acantilado-roca-ancho-1.webp`);
  - alturas para caídas de 1 y 2 niveles (`ALTO_DE_NIVEL`), y una pieza de
    esquina por lado para empalmar con la pared frontal donde la caída gira;
  - resolución para 120 px por casilla en el zoom máximo (ver §15).
- **Al engancharlo** (ciclo aparte, issue en GitHub): `relieve` da caras laterales
  con su material, `colocar` pone esos módulos a lo largo del canto y las rampas
  de #150 también cortan esas caras.
- **Abierto**: si las caídas al norte (de espaldas) piden algo más que el
  reborde. Mientras no se diga, se quedan como hoy.

## 17. Puentes que casan con el río (sesión de reglas, 06-10-2026)

El usuario: «Otro problema son los puentes, van todos con la misma orientación y
no tienen unión con las zonas que conectan». Diagnóstico con las semillas 1-10:
26 puentes, 17 cruces rectos (8 N-S y 9 E-O) y 9 en diagonal. La variante
`ancho`/`hondo` acierta en los 17 rectos. Lo que no funciona:

- los dos dibujos (`nodo-puente-{ancho,hondo}.webp`) vienen torcidos de origen:
  `ancho` se desvía unos 20° al noreste y `hondo` baja hacia la derecha, en
  escorzo y con la misma piedra, así que se leen como uno solo;
- no hay arte para los cruces en diagonal (35 %);
- en 21 de 26 cruces las orillas están a distinto nivel.

**Qué pedir:**
- **Puente de piedra recto de verdad**, en dos piezas, una **N-S** (cruza de
  delante al fondo) y otra **E-O** (cruza de izquierda a derecha), con la cámara
  de siempre (25°, `src/shared/`). Tablero paralelo a la rejilla, una casilla de
  agua de luz y estribos que llegan al borde de las dos casillas de orilla.
- **Dos diagonales** de piedra: **NE-SO** y **NO-SE**, generadas por separado.
- **Estribos para orillas a distinto nivel**: el puente sube de la orilla baja a
  la alta, un nivel (`ALTO_DE_NIVEL`), o estribos separables.
- **Puentes rudimentarios para los pasos sin camino** (16 de 26: entre dos
  regiones solo un paso lleva camino desde #149). Lo pidió el usuario: «Otro
  tipo de puentes, rudimentarios con unos cuantos troncos y rocas». Unos troncos
  sobre piedras del río, en las mismas cuatro orientaciones (N-S, E-O, NE-SO y
  NO-SE). Dejan claro que se cruza, pero sin calzada.
- Resolución para 120 px por casilla (§15). El ancla, en el centro del tablero
  y no en la mediana de la fila de abajo (la de `derivar.ts` está pensada para
  figuras y descentra `hondo` 0,38 casillas).

**Lo que se hace en código** (issue aparte): agua bajo el puente en vez del
tapón de tierra; ancla y escala a las orillas; la senda hasta los estribos; que
la pared de la cara de detrás no tape el puente; piedra si el nodo lleva camino
y troncos si no.

## 18. Respuesta a la §16 y la §17: paredes laterales y puentes (rama `arte-paredes-puentes`, 06-10-2026)

Generado con `pnpm taller` (Codex por la suscripción), sin fal.ai. Hojas de
contacto a 110 px por casilla en `docs/art/revision-paredes-puentes/`
(`puentes.png`, `paredes-{roca,arenisca,basalto,nevadas}.png`; las rehace
`python3 docs/art/revision-paredes-puentes/hojas.py`). Son maquetas, no el
escenógrafo: nada está enganchado (#156, #157).

**Cómo se consiguió la orientación.** Cada encargo lleva una tercera
referencia, una **guía de geometría** (`papel: 'guia'`, nuevo en
`encargo.ts`): un volumen gris dibujado con la proyección del mapa (suelo en
casillas cuadradas, un nivel = 0,6 casillas hacia arriba). La escribe
`tools/taller/paredes-puentes.ts` en `assets/mapa/guias/` (`pnpm taller guias`).
Con ella los puentes salen rectos a la primera; sin ella salían torcidos.

```bash
pnpm taller encolar --paredes-puentes [--solo=puente-piedra-ns,laterales-roca-este] [--rehacer]
pnpm taller derivar-puentes assets/mapa/puente-*.webp
```

### §17 · Puentes (`assets/mapa/puente-*.webp`)

| Pieza | Qué es |
|---|---|
| `puente-piedra-{ns,eo}` | piedra, un arco, tablero paralelo a la rejilla |
| `puente-piedra-{ne-so,no-se}` | las dos diagonales, generadas por separado |
| `puente-piedra-{ns,eo}-sube` | orillas a distinto nivel: sube un nivel hacia el norte (N-S) o hacia el este (E-O) |
| `puente-troncos-{ns,eo,ne-so,no-se}` | cuatro troncos atados sobre tres montones de piedras, sin calzada |

- **El ancla es el centro del tablero** (`ancla` en su `.json`, con
  `anclaEs`), llevada desde la guía por las cajas; `pxPorCasilla` dice cuánto
  mide una casilla en la pieza, medida a lo largo del puente (la luz es una
  casilla). Todas pasan de 370 px por casilla: sobran para 120.
  `test/arte-hojas.test.ts` comprueba ese JSON como el de las demás piezas.
- Largo: la fábrica, unas 2,2 casillas la piedra y 1,8 los troncos (una
  casilla de agua y media de estribo en cada orilla), más la rampa de tierra
  de cada punta (ver los retoques, abajo). Sin agua y **sin el poste de la
  bandera** (lo pone el juego).

### §16 · Paredes laterales (`assets/mapa/modulos/laterales-<material>-<lado>/`)

Una hoja de 8 módulos por material (`roca`, `arenisca`, `basalto`, `nevadas`)
y lado (`este`, `oeste`), el oeste generado aparte con su luz: `tramo-1-{a,b,c}`
y `tramo-2-{a,b,c}` (una casilla de norte a sur, caída de 1 y 2 niveles) y
`esquina-1`, `esquina-2` (la frontal que gira y sube hacia el fondo). El filo
de la meseta es una vertical; la ladera cae en talud, porque en la proyección
del mapa una cara vertical que mira al este no se vería. Unos 200 px por
casilla en su hoja. Roca y nieve se rehicieron una vez (al pie salían tres
bolas en fila); el prompt ya lo dice.

### Lo que queda para quien enganche, o para decidir

- **Tono.** Los frontales de roca y arenisca se pintan con filtro (`TONO`, en
  `colocar.ts`); las laterales no lo necesitan igual: en las hojas van sin él.
- Faltan las subidas al sur y al oeste, y las de las diagonales (o estribos
  separables).
- `assets/mapa/escena.json` está rehecho (`pnpm taller catalogo-escena`): lleva
  las piezas y hojas nuevas, que `componer` aún no usa.

### Retoques de los puentes tras la revisión del usuario (06-10-2026)

Las paredes laterales valen tal cual y no se han tocado. De los puentes, el
usuario pidió tres cosas: «Los arcos de los puentes deben ser más grandes o
integrados con el fondo, no veo cómo conectan con la tierra alrededor»; que el
N-S que sube se distinga del llano, y que los troncos E-O no se lean apilados.
Se rehicieron los diez puentes desde cero (sin `resume`), con guías nuevas y
otro prompt. **Antes y después, pareja a pareja:**
`docs/art/revision-paredes-puentes/puentes-antes-despues.png`. La primera tanda
se guarda en `docs/art/revision-paredes-puentes/antes/`, con sus JSON y sus guías.

- **Estribos de tierra (los diez).** La primera tanda pedía «solo el puente,
  sin las orillas», y por eso los puentes acababan en seco sobre la hierba. Ahora
  la guía dibuja en cada punta un estribo de tierra (`estribo()`): taludes a los
  dos lados que bajan al suelo y, por el lado del río, hasta el agua, con
  peñascos al pie, y una rampa de tierra por la que se sube al tablero. El
  prompt (`ESTRIBO_DICHO`) pide que los bordes se deshagan en matas, terrones y
  piedras sueltas, sin corte recto, para fundirse con el suelo del juego. El
  fondo sigue transparente: ni agua ni suelo llano.
- **Arcos más grandes** (piedra E-O, NE-SO, NO-SE y E-O que sube). Son de
  medio punto y salvan la casilla de agua entera, de orilla a orilla: antes
  medían 0,88 casillas. Arrancan del agua, llevan un anillo de dovelas y el
  tablero sube a 0,4. Bajo el arco queda transparente, así que se ve el agua
  del juego.
- **Piedra N-S.** Con esta cámara el arco de un puente N-S queda debajo del
  tablero y no se ve, así que la integración la llevan el estribo y la rampa de
  tierra de delante. El primer intento se inventó dos arcos en los taludes del
  norte; el prompt ahora lo prohíbe y se rehízo.
- **Piedra N-S que sube: escalones.** Una rampa que sube hacia el fondo solo
  alarga el tablero en pantalla. Un escalón, en cambio, enseña su tabica, que
  mira al sur, a la cámara. El tablero son cinco tramos escalonados (`ESCALONES`)
  de 0,15 casillas de tabica cada uno (unos 16 px a 110 px por casilla), con los
  pretiles escalonados también. A 110 px se leen como cuatro franjas de sillar
  cruzadas: es la señal de subida que mejor se ve a esa escala. El primer
  intento las pintó oscuras, como vigas, y con arcos falsos en el estribo alto;
  el prompt pide ahora tabicas iluminadas y ningún arco.
- **Troncos.** Son cinco troncos tendidos como una balsa vista desde arriba,
  con dos travesaños atados encima, de través, que los cosen en un solo suelo.
  Los montones de piedras de las orillas pasan a estribos de tierra con
  piedras, y queda un solo montón en medio del río. En E-O los travesaños son
  lo que hace leer los troncos uno al lado del otro y no apilados.
- **Medidas.** El ancla sigue en el centro del tablero (en el N-S que sube, el
  del escalón del medio). La guía se encaja sola en su lienzo (`encajar`). Van
  de 378 a 621 px por casilla, siempre por encima de 120. La pieza es más larga
  que antes porque lleva los estribos de tierra: unas 3 casillas la piedra y
  2,3 los troncos.
- `assets/mapa/escena.json` está rehecho (`pnpm taller catalogo-escena`).

**Revisión del usuario (06-10-2026): aprobado.** Las paredes laterales, tal cual;
los puentes, tras los retoques. Quedan dos detalles por si se ven mal al
engancharlos (#156, #157): en `puente-piedra-ns-sube` los taludes de detrás salen
como dos brazos sobre el agua, y en las diagonales hay más tierra en el extremo de
delante que en el de detrás. Las hojas de revisión (`docs/art/revision-paredes-puentes/*.png`
y `antes/`) no se commitean por su peso (unos 24 MB); se rehacen con `hojas.py`.

## 19. Lo que falta de las paredes laterales al engancharlas (#156, 06-10-2026)

Las laterales de la §16 ya van en el mapa (`componer`, sección de las
laterales; `docs/agents/2026-10-06-paredes-laterales/`). Lo que el arte no
tiene y se suple con la pieza más cercana:

- **Caída de 3 niveles: tramo y esquina.** En las semillas 1-10 hay 88 cantos
  de caída 3 (de 1 775). Hoy llevan el tramo y la esquina de 2, estirados hasta
  su pie (`colocarLateral`): más anchos que los demás de su cadena, sin hueco.
  Se piden `tramo-3-{a,b,c}` y `esquina-3` en las ocho hojas, con la misma guía
  (`tramoLateral` y `esquinaLateral` en `tools/taller/paredes-puentes.ts`, con
  `niveles` = 3).
- **Esquina entre caídas distintas** (opcional). Donde la cara al sur y la
  lateral caen distinto (76 de 577 esquinas posibles en las semillas 1-10) no
  se pone esquina: van tramo y frontal, como antes. Solo si las capturas lo
  piden.
- **Tramos que encadenen sin corona** (para valorar). En una cadena larga, cada
  tramo enseña arriba su corona de matas, y en las hojas de roca y nieve se lee
  como una muesca en el filo a cada casilla (`capturas-ingeniero/s8-x15-y5-*`).
  Un tramo «de en medio» con el filo continuo arriba y abajo lo evitaría.

**Resuelto con la §20 (07-10-2026):** las laderas traen caída 3 (`laderas-*-3`),
no tienen corona y su `esquina` se usa en todas las caídas. Sigue sin esquina
entre caídas distintas: allí va el remate (`fin`) y la frontal entera.

## 20. Laderas: paredes laterales que encadenan (rama `arte-laterales-2`, 07-10-2026)

El usuario vio las laterales de la §18 en el juego (#156; capturas en
`docs/agents/2026-10-06-paredes-laterales/capturas-ingeniero/pares/`) y dijo:
«la pared lateral no esta bien conseguida y su repeticion se nota mucho, hace
fata arte nuevo, evitar bordes rectos, que tenga un poco de giros». Lo que se
veía:

- el filo y el pie, rectos y verticales;
- cada casilla repite la misma silueta;
- la corona de matas de cada tramo hace muesca en cada junta (§19);
- en roca y basalto, muros de columnas apiladas que tapan la meseta.

Primero se hizo un piloto de roca-este. Al verlo, el usuario dijo «Vale:
corregir y generar todo» y pidió tres correcciones:

1. la cinta verde amarilla del borde;
2. el `inicio` como bloque cuadrado;
3. las columnas del escarpe en caída 3.

Además, el corte diagonal al final de una cadena sin esquina.

**Maquetas** (en `docs/art/revision-laterales-2/`, no se commitean):

- `maqueta-<material>-<lado>.png`, una por hoja. Arriba el arte nuevo, abajo el de hoy colocado como lo hace `colocarLateral`. A 110 px por casilla, sobre el suelo de su material y con la frontal `paredes-<material>` con el tono del juego. Cada una lleva:
  - una cadena de 6 casillas de caída 1;
  - otra de 4 de caída 2;
  - otra de 2 de caída 3;
  - un escalón de caída 2 a caída 1 que remata en `fin`;
  - en todas las cadenas, su esquina y su frontal.
- `resumen.png`: las ocho, nuevo contra hoy.
- `piloto/`: el piloto que vio el usuario.
- `intento-1-*`: el primer intento fallido del piloto.

Las rehace `python3 docs/art/revision-laterales-2/maqueta.py [roca-este …]`.
No es el escenógrafo: nada está enganchado.

### Guías y prompts (`tools/taller/laderas.ts`)

`pnpm taller encolar --laderas [--solo=roca-este-1,…] [--rehacer]`. La
orden `pnpm taller guias` también escribe `assets/mapa/guias/laderas-{este,oeste}-{1,2,3}.{png,json}`.
La §18 sigue intacta en `paredes-puentes.ts`, que ahora exporta `Guia`, `NIVEL` y los
colores de la guía.

- **Un risco continuo cortado en trozos.**
  - Filo y pie son curvas que giran (`sin²` y `sin(πt)·sin(kπt)`, más un ruido suave). En las juntas valen cero y tienen tangente recta.
  - Los extremos se cortan por la línea de máxima pendiente.
  - La cara va en dos tonos: un escarpe en sombra y un derrubio más claro.
  - Los bloques son polígonos angulosos, no elipses.
- **Sin corona.** Sobre el filo solo hay un labio de roca estrecho (`LABIO` = 0,06) y unas matas sueltas. El prompt prohíbe la franja y la cinta, y dice de qué es la meseta de cada material (prado oliva oscuro, arena, ceniza, nieve). El piloto llevaba una franja verde que salió amarilla.
- **`inicio` sin bloque.** El labio ya no dobla hacia la meseta: salía como una lengua de piedra plana, y el reborde norte lo pinta el juego. La cara se cierra en un morro convexo más allá de la junta. Al norte no hay cono de derrubio, porque lo taparía la propia ladera en esta proyección.
- **`fin`, nuevo.** Morro al sur y un cono de derrubio que se derrama por delante (`CONO` = 0,26). Tapa el corte diagonal al final de una cadena sin esquina.
- **Canales de derrubio.** Desde la caída 2, el escarpe lo parten canales de derrubio en diagonal, uno en caída 2 y tres en caída 3. En esta proyección, los estratos de una ladera que mira al este o al oeste salen verticales en pantalla. Por eso un escarpe alto sin cortes se pintaba en columnas.
- **Prompt.**
  - Pide calcar la silueta de la guía.
  - Dice que no hay nada del lado de la meseta: no es una cresta.
  - En caída 3 prohíbe columnas y láminas largas y lisas.
  - Pide que la frontal de la esquina tenga «el relieve de las paredes, nunca una losa lisa».
- **Referencias.**
  - Estilo.
  - **Identidad: `rocas-caidas`**, para la forma. Con `paredes-roca` de identidad, el primer intento volvió a salir en columnas.
  - **Material: `paredes-<material>`**, solo para el color, para que case en la esquina. Es un papel nuevo en `encargo.ts`, `material`: «se toman SOLO el color, la textura y la paleta… NO su forma».
  - La guía.
- **Oeste.** Cada hoja oeste se genera aparte, con su luz (la ladera de cara a la luz) y su guía (`s = −1`). Nunca se espeja.

### La familia y su contrato

24 hojas: `assets/mapa/modulos/laderas-<material>-<lado>-<caída>`, con material
`roca`, `arenisca`, `basalto` o `nevadas`, lado `este` u `oeste` y caída 1, 2
o 3. Cada hoja lleva ocho módulos:

| Módulo | Casillas | Qué es |
|---|---|---|
| `inicio` | 1 | Remata el norte de una cadena (rincón de la meseta): morro. |
| `medio-a` | 1 | Entrante con cono de derrubio. |
| `medio-b` | 1 | Espolón. |
| `medio-c` | 1 | S suave. |
| `largo-a` | 2 | Espolón y entrante. |
| `largo-b` | 2 | Entrante, espolón y entrante. |
| `fin` | 1 | Remata el sur de una cadena sin esquina: morro y cono. |
| `esquina` | 1 | La lateral dobla redondeada en `FRONTAL_DE_ESQUINA` (0,85) casillas de frontal hacia la meseta, abierta por su punta para que sigan los `paredes-*`. Ocupa su casilla entera. |

Casilla en la guía: unos 186 px en caída 1, 153 en caída 2 y 140-144 en caída 3.
La hoja de caída 3 va en vertical para que quepan sus dos filas. El pintor
respeta esa escala.

**Encadenado.** En el marco de `colocarLateral` (casilla `y`; filo arriba en
`y`; pie en `y + largo + caída · ALTO_DE_NIVEL`):

- **Juntas.** En la junta norte, el filo está en `(xFilo, y)`. En la sur, el pie está en `(xFilo ± TALUD[caída], y + largo + caída · 0,6)`, con `TALUD` = 0,45 / 0,65 / 0,85. Cualquier tramo empalma con cualquiera de su caída. Las juntas son abiertas: se pinta de norte a sur, la de delante encima.
- **Geometría.** La guía guarda por pieza `filoNorte`, `pieNorte`, `filoSur`, `pieSur` y `caja`, en píxeles de la guía (`laderas-<lado>-<n>.json`).
- **Registro.** El pintor respeta la escala de la guía, pero no siempre su sitio. La maqueta encuentra cada módulo sobre su guía por correlación de siluetas (`registro`, en `maqueta.py`) y de ahí lleva esos puntos al módulo. Para engancharlo:
  - eso pasa a `derivar.ts`;
  - el catálogo trae `filo` y `pie` por módulo;
  - sustituye a `derivarFilo`, que con un filo ondulado no vale.
- **Elección, propuesta.**
  - `inicio` si la cadena empieza en un rincón.
  - Después, al azar entre `medio-*` y `largo-*`, sin repetir la de al lado; `largo` solo si quedan dos casillas.
  - `esquina` al final si la hay; si no, `fin`.
  - En un escalón de caída, `fin` en la caída mayor y la cadena siguiente empieza con un `medio`.
- **Lo que ya no hace falta.** No hay que estirar la caída 3 (§19). Tampoco valen `CORONA`, `LARGO_DE_ESQUINA` ni `SOLAPE_DE_ESQUINA` para estas hojas.
- **Tono.** En las maquetas las laderas van sin el filtro `TONO`. La arenisca de hoy lleva `CHILLONA` y la nueva no lo necesita.

### Lo que quedó flojo, por hoja

En todas:

- El morro de `inicio` suele acabar en punta, como un pico más que como una loma. Ya no es un bloque.
- En caída 3 el escarpe sale en losas largas tendidas en diagonal, por la línea de máxima pendiente. No son columnas, pero son lisas y repetidas.
- La frontal de la esquina va en columnas a propósito, para casar con `paredes-*`.

Por hoja:

- **roca-este:** bien. La esquina de caída 3 tiene una frontal grande y algo lisa.
- **roca-oeste:** las esquinas de caída 2 y 3 son una losa clara grande en el rincón.
- **arenisca-este y oeste:** la ladera iluminada del oeste sale más clara y anaranjada que su frontal entonada. Si en el juego desentona, va `CHILLONA`. La esquina de caída 3 del oeste, pesada.
- **basalto-este y oeste:** el labio sale casi blanco sobre la ceniza negra y se lee como un hilo claro. Pide oscurecerlo con tono o rehacer con «labio negro». Apenas hay brasa, a diferencia de su frontal.
- **nevadas-este y oeste:** la nieve del filo apenas se distingue de la meseta, que es lo que se pedía. En caída 3, losas en diagonal como en las demás.

**Coste.** 31 generaciones de Codex por la suscripción, sin fal.ai ni fallos:

- 4 en el piloto;
- 3 en roca-este con las correcciones;
- 24 en las 24 hojas definitivas, porque roca-este se rehízo con la guía final.

`assets/mapa/escena.json` está rehecho (59 hojas). `componer` aún no usa
las laderas.

**Enganchado (#156, vuelta 2, 07-10-2026;
`docs/agents/2026-10-06-paredes-laterales/capturas-vuelta2/pares/`).** El usuario
aprobó las maquetas («Valen: commit y enganchar»). Cómo quedó:

- **Registro.** `registrarLadera` (`tools/taller/derivar.ts`) es el `registro()`
  de la maqueta por FFT, salvo que toma el **centro** de la meseta de
  desplazamientos con el solape máximo (la guía cabe entera en el módulo en una
  zona de hasta 40 px) en lugar del que dé el ruido de la FFT. Frente a la
  maqueta: 187 de los 192 módulos a ≤ 16 px, el peor a 34. `pnpm taller
  derivar-laderas` apunta las juntas de cada módulo en el índice de su hoja
  (`ladera`: `filo`, `pie`, `largo` y `papel`, que es lo que lee la cadena); el
  trabajador lo hace solo al terminar una hoja de laderas. La maqueta
  correlaciona en circular sobre la guía entera; el registro, en lineal sobre
  la caja de la pieza (igual salvo cuando la silueta da la vuelta por el borde).
- **Elección.** La propuesta, tal cual, más dos reglas: una cadena de una casilla
  lleva la esquina, si no el `fin`, si no el `inicio`; y lo que no entra (senda o
  reserva) se prueba casilla a casilla con los `medio-*`, y la esquina antes con
  el `fin`. `largo-*` sale poco (casi todas las cadenas miden 1-3 casillas).
- **Tono.** La arenisca oeste, `CHILLONA`; el basalto (los dos lados), desde
  /simplify (07-10-2026), `contrast(0.9) brightness(0.72) sepia(0.3)
  saturate(1.3) hue-rotate(-10deg)`: más oscuro y algo más cálido, sin el labio
  claro (antes, `contrast(0.8) brightness(0.8)`, que lo dejaba gris y frío).
  Medido con `tono-laderas.mts` y `tono-basalto.mts` en
  `docs/agents/2026-10-06-paredes-laterales/`.
- **Caídas de 4 o más** (raras: alguna en nieve) usan la hoja de 3, estirada.
- **Pendiente para el arte:** si el basalto entonado no basta, rehacerlo con
  «labio negro». Las `laterales-*` (§18) quedan en disco sin usar: no se borran
  sin preguntar. Desde /simplify no van en el catálogo, y su encargo y su guía
  salen de `paredes-puentes.ts` (están en la historia de git).

### Retoques del arte (#160, rama `arte-laderas-3`, 07-10-2026)

Se atacaron dos de los flojos de arriba: el `inicio` que acababa en punta y las
losas de caída 3. El usuario, al ver las maquetas: «Quedarse los comienzos, no
la caída 3».

**Entra: el `inicio` nuevo de caída 1 y 2.** En las 16 hojas
(`tools/taller/laderas.ts`):

- **El problema.** El filo y el corte norte se juntaban en un ángulo agudo, y
  eso se pintaba como un pico.
- **La guía.** El risco pierde algo de alto en la primera `LOMA` (0,6) de la
  casilla, como mucho lo que deja el filo subiendo en pantalla
  (`PENDIENTE_DE_LOMA`). El corte norte baja del filo al pie en un hombro
  convexo: la cara da la vuelta hacia el fondo y el derrubio se deshace en el
  suelo.
- **El prompt.** Pide «un morro ancho y redondeado, como el hombro de una loma».
  Prohíbe la punta, el pico, la aguja y la arista.
- **La junta norte.** El filo norte del `inicio` es la referencia de la junta,
  más alta que la loma, y en seis módulos cae hasta 21 px por encima de lo
  pintado. `test/laderas.test.ts` lo admite solo en el `inicio`, hasta el 12 %
  de su alto.
- **Regeneración.** El taller rehace hojas, no piezas. Se rehicieron las 16
  hojas y de cada una se quedó solo el `inicio`
  (`docs/art/revision-laderas-3/conservar.py`):
  - los otros siete módulos y sus entradas del índice son los de antes, con el
    mismo sha;
  - la hoja `.webp` y su procedencia son las de la generación nueva.
- **Guía de la fila 1.** Se reparte por el ancho del `inicio`, así que sus
  otras piezas se corren unos píxeles en x. Al volver a registrar, sus juntas se
  mueven 1 px, salvo `roca-oeste-2/medio-c`, que se mueve 13 px. El registro ya
  erraba hasta 34 px.
- **Lo que quedó flojo.** La mayoría acaba ya en morro, pero `roca-oeste-2`,
  `nevadas-oeste-2` y `basalto-este-1` siguen bastante afilados, y alguno sale
  como un bloque. El `inicio` es de otra generación que sus hermanos: en roca
  sale algo más claro y gris.

**Se probó y se descartó: la caída 3 sin losas.** Las 8 hojas de caída 3, su
guía y su prompt siguen como en HEAD. `laderas.ts` dibuja su `inicio` con el
morro de antes (`INICIO_DE_TRES` en el prompt). La guía y el prompt que salen
hoy son, byte a byte, los de sus hojas. Lo aprendido:

- **De dónde salían las losas.** De la guía: los canales de derrubio de caída 3
  son largos y van en diagonal por la línea de máxima pendiente, y el pintor los
  calcaba como losas lisas.
- **Lo que se probó.**
  - Un escarpe corto bajo el filo (0,22 de la caída).
  - Debajo, dos bandas de estrato roto cortadas a trozos.
  - De quinta referencia de material, la hoja de caída 1 de su material y lado.

  Las losas desaparecieron, pero el talud salió grumoso, se leía como un
  pedregal y en nieve se perdía casi toda la nieve.
- **Por qué no vale lo obvio.** Cualquier cosa sobre una ladera que mira al este
  o al oeste sale estrecha en pantalla: o en tiras verticales (columnas) o en
  diagonal (losas). Partir el escarpe en trozos pequeños quita las dos cosas,
  pero también la roca.
- **Si se retoma.** Pedir pocos trozos grandes de roca y no muchos pequeños,
  conservar la nieve en las repisas, y no tomar la caída 1 como referencia de
  material: arrastra su escala.

**Coste.** 25 generaciones de Codex por la suscripción, sin fal.ai, de las que
se aprovechan 16:

- 2 pilotos (`roca-este-3` y `roca-este-1`);
- las 23 hojas restantes.

Además, Codex cortó («websocket closed») 2 intentos de corregir `roca-este-1`
en su hilo, sin generar nada.

**Revisión** (en `docs/art/revision-laderas-3/`, no se commitea):

- `laderas-<material>-<lado>.png`: después arriba y antes abajo, a 110 px por
  casilla. Los recortes de caída 3 de «después» son los descartados.
- `inicios.png`: los 24 `inicio`, antes y después.
- `juego/{antes,despues}/`: el escenógrafo a 110 px de s5, s6, s8, s9 y s22.
- `juego/par-*.png`: recortes antes y después.

## 21. Lo que falta de los puentes al engancharlos (#157, 07-10-2026)

Los puentes de la §17-§18 ya van en el mapa: la pieza sale de las orillas que
une el nodo (`src/client/render/escenario/puentes.ts`), de piedra si el nodo
lleva camino y de troncos si no, apoyada por el centro de su tablero. Medido en
las semillas 1-40 (101 puentes; `docs/agents/2026-10-07-puentes/`), lo que el
arte no cubre y se pinta con la pieza plana más cercana:

| Qué falta | Cuántos (de 101) | Qué se pone hoy |
|---|---|---|
| Piedra que sube al **sur** (`ns`) o al **oeste** (`eo`) | 3 + 2 | la plana: la punta alta queda un nivel corta |
| **Troncos** que suben, en cualquier sentido (no hay ninguno) | 3 norte, 3 sur, 8 este, 7 oeste | la plana de troncos |
| Diagonales que suben (`ne-so`, `no-se`), de las dos clases | 4 de piedra, 2 de troncos | la diagonal plana |
| Subida de **dos niveles** (los `-sube` salvan uno) | 17 de los 42 rectos con desnivel | el `-sube` de un nivel, o la plana |
| **Puente en codo**: las orillas no se miran (oeste ↔ noreste, suroeste ↔ norte…) | 35 | la diagonal más cercana, corrida hasta 0,6 casillas del punto medio de las orillas y escalada entre 0,85 y 1,15 hasta que los dos estribos caen en tierra (`asentar`): 0 en el agua (antes 15); 15 de los 35 van a escala 0,85-0,9 |

Lo del codo lo resolvería mejor el generador, con los nodos de agua entre
orillas enfrentadas (issue aparte, #161 del núcleo); con eso, el resto de la
tabla baja también. Si se pide arte, en este orden: troncos que suben al este y
al oeste (15), piedra que sube al sur y al oeste (5), y las dos diagonales que
suben.

**El de piedra N-S se lee largo y estrecho, como una escalera de mano** (lo
vio el usuario en la vuelta visual de #157, s1, s2 y s5). Es la proporción del
arte: escalarlo no lo arregla, porque la escala es uniforme y la proporción no
cambia; encogerlo solo lo haría más corto, con los estribos más lejos de la
orilla. Lo que se pide: un `puente-piedra-ns` (y su `-sube`) con el tablero más
ancho en pantalla —o con pretiles más bajos y más separados—, que leído desde la
cámara a 25° se vea tan ancho como el `eo`.

Las piezas `nodo-puente-{ancho,hondo}` de la primera tanda se borraron con
#157: ya no las usaba nada (su `.procedencia.json` y su encargo están en la
historia de git). El encargo de los puentes de piedra las llevaba como
identidad; ahora lleva `puente-piedra-eo.webp`.

## 22. Agujas esbeltas con resolución para las cumbres (defecto C de la auditoría 2, 07-10-2026)

Desde `2026-10-07-cumbres-nitidas`, ningún pico se amplía más de ×1,3 al zoom
máximo (120 px de dispositivo por casilla): un módulo de `nh` px de alto llega
como mucho a `nh × 1,3 / 120` casillas (`altoMaximoDe`, `macizo.ts`). Una cumbre
del macizo pide hasta ~4 casillas (las agujas grises llegan a 3,62 en las
semillas 1-10, 13, 24, 34 y 57; la auditoría midió cumbres de 2,9 a 3,6), y la cresta quiere los módulos más esbeltos.

Las agujas de roca (`picos-afilados`, 280-374 px, nw/nh 0,60-0,75) llegan. Las
de los otros tres materiales no: sus módulos esbeltos son los de menos
resolución, así que en la cumbre `siluetaDe` cae a uno más chato que sí llega
o, si ninguno llega, baja el alto de la cumbre.

| Hoja (`assets/mapa/modulos/`) | Esbeltos (nw/nh ≤ 1,0) | Llegan a | Cumbres rebajadas (14 semillas) |
|---|---|---|---|
| `picos-volcan` | 6 (210×220), 2 (142×149), 4 (128×174) | 2,38 / 1,61 / 1,89 casillas | 0, pero sus cumbres salen con módulos chatos |
| `picos-nevados` | 7 (241×242) | 2,62 casillas | 3 (a 3,10, el tope del 1) |
| `picos-arenisca` | 2 (202×287), 14 (218×246), 5 (214×230), 12 (174×177) | 3,11 / 2,67 / 2,49 / 1,92 casillas | 3 (a 3,11) |

- **Qué pedir**: 4-6 agujas por hoja de volcán, nieve y arenisca con nw/nh ≤ 0,8
  y **≥ 370 px de alto** (370 × 1,3 / 120 = 4 casillas), como las de
  `picos-afilados`, con el material de su hoja.
- Al engancharlas, `siluetaDe` las escoge solas por esbeltez; no hace falta tocar
  el código. Se mira con `pnpm taller escenario 9 57` y el test «ningún pico pasa
  de ×1,3» de `test/macizo.test.ts`.

## 23. Diagonales y bajadas del relieve por celdas: piloto de roca, caída 1 (R4/R5, 07-10-2026)

**Estado: propuesta, pendiente del visto bueno del usuario.** Diseño en
`docs/agents/2026-10-07-relieve-esquinas/plan.md`; los conteos salen de
`prototipo.ts`, en la misma carpeta.

**Por qué.** El relieve pasa a leerse por **celdas de vértice** (*dual grid*):
cada vértice mira sus cuatro casillas y da un tipo de pared. Medido en las
semillas 1-40, el **54 %** de las paredes que se ven son **diagonales**, y hoy
salen como escaleras de frontal y ladera (#160). Las rectas ya tienen arte:
al sur, `paredes-*`; al este y al oeste, los `medio`/`largo`/`inicio`/`fin` de
las laderas (§20). Falta la diagonal, en sus dos formas:

- la **convexa**, que es la esquina de una meseta, cortada a 45°;
- la **cóncava**, que es el rincón.

Las bajadas tampoco tienen pieza. De las 287 que se ven, 192 bajan en
diagonal hacia la cámara (SE y SO).

**Contrato de junta**, igual que el de §20. La junta cae en el medio de un lado
de casilla, y su tipo lo fija ese lado, no la pieza:

- **Junta S** (lado horizontal): el filo está en la junta y el pie justo debajo,
  a `c · ALTO_DE_NIVEL` (0,6 por nivel).
- **Junta E/O** (lado vertical): el pie se aparta además `TALUD_DE_LADERA[c]`
  (0,45 en caída 1) hacia fuera de la meseta, como en las laderas.

Así casan con todo lo que ya hay. Con el vértice en (0, 0) y las casillas en
±0,5:

| Pieza | Junta de un extremo | Junta del otro extremo |
|---|---|---|
| `convexa` SE | E en (0, −0,5) | S en (−0,5, 0) |
| `concava` SE | S en (0,5, 0) | E en (0, 0,5) |
| `convexa` SO | O en (0, −0,5) | S en (0,5, 0) |
| `concava` SO | S en (−0,5, 0) | O en (0, 0,5) |

Entre una junta y otra, el filo y el pie giran (con `joroba` y `onda`, como en
§20). Las juntas son abiertas: se cortan por la línea de máxima pendiente, y la
pieza de delante pinta encima.

### Lo que se pide (piloto: solo roca y caída 1)

| Hoja | Módulos | Qué es |
|---|---|---|
| `diagonales-roca-se-1` | `convexa-a`, `convexa-b`, `concava-a`, `concava-b` | La pared que mira al sureste. La convexa remata la esquina de la meseta a 45° (la parte de arriba hacia el noroeste); la cóncava es el rincón donde una frontal se encuentra con una ladera este. |
| `diagonales-roca-so-1` | los mismos | La que mira al suroeste, **generada aparte, con su luz**. Nunca se espeja. |
| `bajadas-roca-1` | `s`, `se`, `so`, `e`, `o` | Un paso de tierra pisada que baja la caída en cada rumbo hacia la cámara, entre dos hombros de roca que se deshacen en la pared. Sin escalones tallados ni corte recto: la escalera fija de #168 no seguía el camino. Al norte no hace falta nada, porque se baja de espaldas. |

- **Cámara**: la de siempre, a 25° (`src/shared/`). Por encima de 120 px por
  casilla; las laderas de caída 1 van a unos 186.
- **Guías**, que escribe `pnpm taller guias`, en
  `tools/taller/diagonales.ts` y `bajadas.ts`, con la `Guia`, `NIVEL` y las
  curvas de `laderas.ts`:
  - **Diagonal.** La meseta en su esquina, en `ARRIBA`. La cara, del filo al pie,
    con el escarpe en `SOMBRA` y el derrubio en `DERRUBIO`, como §20. Lleva los
    canales de derrubio en diagonal desde la caída 2.
  - **Bajada.** La cuña de la rampa, del filo de una pared de su rumbo al pie,
    con la senda en un gris claro de 0,25 casillas de ancho y los dos hombros
    en `SOMBRA`. Sus juntas:
    - `arriba`: en el filo;
    - `abajo`: en el pie, que está a `c · 0,6` y además, en E y O, a `±TALUD`;
      en SE y SO, a `±TALUD/2`.
- **Referencias**, como en §20:
  - estilo;
  - **identidad**: `rocas-caidas`, para la forma;
  - **material**: `paredes-roca`, solo para el color;
  - la guía.
  Para las bajadas, además, el estribo de tierra de `puente-piedra-eo`, que en
  §18 salió bien fundido con el suelo.
- **Prompt**:
  - calcar la silueta de la guía;
  - ni corona ni cinta en el filo, solo el labio de §20;
  - roca en bloques grandes, sin columnas ni losas;
  - la cóncava, con el relieve de las paredes, nunca una losa lisa;
  - la bajada, con el camino del mismo color que las sendas del juego y bordes
    que se deshacen en terrones y matas.

### Cómo se derivan sus juntas

`pnpm taller derivar-relieve` sustituye a `derivar-laderas` y vale para las tres
familias. Registra cada módulo sobre su guía con `registrarPieza`, que es la FFT
de `registrarLadera` sin nada propio de la ladera. Después apunta en el índice
de la hoja:

- en las diagonales: `filo` (los dos puntos de junta) y `papel` (`convexa` o
  `concava`);
- en las bajadas: `arriba` y `abajo`.

Después, `pnpm taller catalogo-escena`. Si un módulo no tiene juntas,
`catalogoValidado` lanza. Se acepta un error de registro de hasta 34 px, el peor
de §20.

### Coste y revisión

Unas 5 generaciones de Codex por la suscripción: las 3 hojas y un par de
rehechas, sin fal.ai. El usuario las ve:

- **en el juego**: `pnpm taller escenario 5` a 110 px, antes y después, en la
  rama `relieve-esquinas`, donde lo que no es roca-1 va con marcador;
- **sobre su guía**: una hoja de contacto de cada módulo.

Solo con su visto bueno se pide el resto. Por material, las diagonales SE y SO
de caída 1 y 2 (más la 3, si se decide no estirarla) y las bajadas de caída 1 y
2: de 6 a 8 hojas por material, de 24 a 32 en total.

### Respuesta del piloto (rama `relieve-esquinas`, 07-10-2026)

Generado con `pnpm taller encolar --relieve --solo=…` (Codex por la suscripción,
sin fal.ai): `diagonales-roca-se-1`, `diagonales-roca-so-1` y `bajadas-roca-1`,
cada una con su `.json` (las juntas, `pnpm taller derivar-relieve`) y su
`.procedencia.json`. Lámina y capturas en
`docs/agents/2026-10-07-relieve-esquinas/capturas/` (no se commitean;
`lamina.py` y `capturar.ts` las rehacen).

- **Guías.** La diagonal no es un chaflán a 45°: es un cuarto de círculo de
  media casilla, centrado en la casilla alta (convexa) o en la baja (cóncava),
  que sale de cada junta con la dirección de su vecina (vertical en la de la
  ladera, horizontal en la de la frontal). Con el chaflán quedaba un codo de 45°
  en cada junta.
- **La bajada sigue a la senda pintada**, no a la pared. La primera guía bajaba
  por la línea de máxima pendiente (del filo al pie): de cara a la cámara casaba,
  pero de lado y en diagonal la rampa acababa hasta 0,6 casillas por debajo de
  la senda, que en el juego no sube ni baja (s40). La segunda guía lleva la rampa
  en la dirección de la senda en pantalla (`largoDeBajada`, `rampaDe`): de lado
  sale casi horizontal, entre ribazos de roca. `arriba` y `abajo` siguen siendo
  el filo y el pie de la pared bajo él: solo dan la escala.
- **Lo que salió bien.** Las tres hojas calcan la silueta, el sitio y el rumbo
  de su guía a la primera; el registro pone los dos filos de cada diagonal sobre
  el labio pintado (lámina de registro). La bajada al sur se lee como un paso
  por el risco (s37).
- **Lo que salió flojo.**
  - **El labio sale como un bordillo** de piedras en hilera, en las dos hojas de
    diagonales y en las dos tandas, aunque el prompt de la segunda lo prohíbe. A
    110 px se lee como un canto claro; a 60, como una línea que recorre el
    contorno (como el labio de las laderas, algo más marcado).
  - **La del suroeste sale en bloques cúbicos** y algo columnar, de cara a la
    luz; la del sureste, mejor. Cubos grandes al pie en las dos.
  - **El `resume` no funciona**: 6 intentos de corregir en su hilo (3 por hoja de
    diagonales) cortaron con «websocket closed by server», sin imagen. Se
    rehicieron desde cero con la corrección en el prompt.
- **Coste.** 6 generaciones (2 por hoja) y 6 `resume` fallidos, sin fal.ai.
- **Lo que queda para el lote entero** (14 hojas de diagonales y 7 de bajadas,
  con la caída 3 estirada de la 2): quitar el labio claro de la guía de las
  diagonales o dibujarlo roto (en trozos), y pedir la roca «como las laderas de
  la imagen N» con una ladera de su material como segunda referencia de
  material, que es su vecina en el mapa.

### Respuesta del lote (rama `relieve-esquinas`, 07-10-2026)

Con el visto bueno del usuario: **todas las hojas** de diagonales (SE y SO, caída 1 y 2) y
de bajadas (caída 1 y 2) de roca, basalto, arenisca y nieve, 24 en disco. La caída 3 estira
la de 2. Codex por la suscripción, sin fal.ai y sin `resume`: **27 generaciones**, de
87 a 164 s, ninguna fallida. Lámina en
`docs/agents/2026-10-07-relieve-esquinas/capturas/lamina-lote.png` (y `-registro`).

- **Lo que se cambió antes de encolar**, como pedía el piloto:
  - **El labio de la guía va roto**: trozos sueltos del gris de la roca (`LABIO_ROTO`) con
    huecos, no la cinta clara seguida. Con eso el bordillo de piedras en hilera desapareció
    de las convexas en casi todas las hojas a la primera; la guía manda más que el prompt.
  - **La referencia de material es la ladera vecina** (`laderas-<material>-<este|oeste>-
    <caída>`; en las bajadas, la del este) en vez de la frontal en columnas: el color y el
    musgo casan con la ladera que sigue en el mapa.
  - Bloques del pie más pequeños en la guía.
- **Rehechas**: `diagonales-roca-se-1` y `-so-1` (sin bordillo; la SO, menos cúbica) y
  `bajadas-roca-1` (de lado sigue casi horizontal: es la proyección, no el material).
- **Las que costaron más**: `diagonales-roca-so-2` (3: cubos; luego bordillo claro; la 3.ª
  bien) y `diagonales-arenisca-so-1` (2: bordillo de bloques). Para ellas se añadió al
  prompt del suroeste que la luz de frente no la hace de cubos ni el filo una fila de
  piedras.
- **Registro**: los 104 módulos tapan del 96 al 100 % de la silueta de su guía.
- **Flojo**: el basalto de diagonales y laderas, más claro que su frontal (heredado de
  §20); el suroeste algo más en bloques que el sureste; en las cóncavas estrechas de caída 2
  aún asoma un canto claro, como el de las laderas.

## 24. Hitos sin cruz para los nodos sin pieza de paso (#176, rama `mojones`, 07-10-2026)

**Petición.** El nodo de acantilado y el que no cruza barrera llevaban `nodo-hito`, la pieza
2 de la lámina pintada: un mojón con una **cruz** tallada que, recortado sin su poste (#168)
y repetido por los llanos (22 en las semillas 1-6), se leía como una **lápida**. Se piden
tres hitos **sin cruz ni símbolo**, del mismo estilo y cámara que las piezas del mapa, que
el juego reparte por el id del nodo (`HITOS` y `varianteDeId`, `nodos.ts`):

| Pieza | Qué es |
|---|---|
| `nodo-hito-miliar` | miliario: columna cilíndrica corta de tapa plana sobre un pedestal bajo |
| `nodo-hito-mojon` | montón de piedras de campo con un poste corto atado |
| `nodo-hito-tablilla` | poste calzado con piedras y una tablilla en flecha hacia un solo lado |

Sin poste alto ni bandera: la bandera la planta el juego con su mástil. Encargos en
`tools/taller/mapa.ts` (`HITOS_DE_NODO`, `pnpm taller encolar --hitos`); referencia de
estilo, la lámina elegida (`muestras/pintado.webp`), sin pedir copiar su pieza 2 para que
no herede la cruz. Se miden por el alto (una casilla), no por el ancho.

### Respuesta (rama `mojones`, 07-10-2026)

Codex por la suscripción, sin fal.ai y sin `resume`: **5 generaciones**, de 73 a 101 s,
ninguna fallida. `nodo-hito` (la de la cruz) se retira de `assets/mapa/` y de
`encargosDePiezas`.

- **Rehechas desde cero**: la tablilla (la 1.ª, una tabla atravesada en el poste, **era una
  cruz**: el prompt dice ahora una sola flecha hacia la derecha, sin que el poste asome por
  encima) y el miliario (la 1.ª, una losa de tapa redonda con banda, seguía pareciendo una
  lápida: ahora columna de tapa plana).
- **Reparto en las semillas 1-40**: mojón 52, tablilla 41, miliario 40.
- Recortes antes/después de la semilla 34 en `docs/agents/2026-10-07-mojones/capturas/`.
- **Flojo**: el miliario se ve algo más desde arriba que los 25° de la cámara.

## 25. El cofre del mapa como pieza suelta (#147, rama `cofre`, 08-10-2026)

**Petición.** El cofre era lo único que el mapa de aventura sacaba todavía del atlas viejo
`assets/rpg/map-atlas.png` (su celda 8, la de §4): para pintar unas decenas de píxeles se
cargaba el atlas entero y se escalaba desde la imagen nativa en cada fotograma, fuera de la
caché de copias. Se pide **una pieza suelta** `assets/mapa/cofre`, como `oro`, `piedra` y
`madera`, en el mismo estilo y cámara que las piezas del mapa: un cofre **cerrado** de madera
oscura con flejes y cantoneras de hierro y un candado, sin oro a la vista. Cerrado porque el
recurso oro ya es un arcón abierto rebosante de monedas y lingotes, y el cofre de la celda 8
también lo era: los dos juntos en un mapa no se distinguían de un vistazo. Encargo en
`tools/taller/mapa.ts` (`encargoDeCofre`, `pnpm taller encolar --cofre`); referencia de
estilo, la lámina elegida (`muestras/pintado.webp`).

### Respuesta (rama `cofre`, 08-10-2026)

Codex por la suscripción, sin fal.ai: **1 generación**, 75 s, sin fallos ni correcciones.
Crudo 1374×1145; pieza 1037×905 con el ancla en (678, 880), derivada por el taller.

- El juego la pinta con `pintarPieza` (caché de copias), a 0,6 casillas de ancho y con el pie
  a 0,3 bajo el centro de la casilla, como los recursos; sin ella, el ladrillo de siempre.
- El cliente ya no pide `map-atlas.png`, y nada más lo leía salvo su compositor y los
  encargos de §4, ya hechos: se retiran el atlas, su `.json`, `pnpm taller
  componer-atlas-mapa`, `--atlas-mapa` y el estilo «pixel» de las muestras, que lo tenía de
  referencia. Las celdas pintadas de `assets/mapa/atlas/` se quedan (la mina las usa);
  `atlas/cofre.webp` queda sin lector.
- Recortes antes/después de tres cofres (semillas 3, 1 y 9) en
  `docs/agents/2026-10-08-cofre/capturas/`.

## 26. Lo que quedó flojo del relieve por celdas (rama `arte-relieve-2`, 08-10-2026)

**Petición.** Tras el lote de §23 quedaban cuatro defectos: el basalto de diagonales y
laderas más claro que su frontal (s28, s36), el suroeste algo cúbico en todos los
materiales, las bajadas E/O casi llanas de lado y un canto claro seguido en las cóncavas
estrechas de caída 2. Se priorizó por lo que más se ve en las semillas 1-40
(`docs/agents/2026-10-08-arte-relieve-2/medir.ts --hojas`): `diagonales-roca-so-1` sale
696 veces y `-so-2` 196; de basalto, 377 diagonales, 152 laderas y 35 bajadas; las
bajadas E/O, unas 40 de 235.

### Respuesta

Codex por la suscripción, sin fal.ai y sin `resume`: **18 generaciones** (de 107 a 154 s,
ninguna fallida), **12 hojas nuevas en disco y 6 descartadas** (se quedó la que había).

- **Basalto: un tono, no arte nuevo.** Medido, el basalto de las diagonales no es más
  claro que la frontal de media (luz 52-63 frente a 72): lo que se leía claro era el
  derrubio gris y frío junto a la ceniza rojiza, porque las diagonales y bajadas tomaron
  de referencia la ladera **sin entonar**, y la ladera en el juego va con
  `BASALTO_DE_LADERA`. Ahora llevan el mismo filtro que su ladera (`TONO` en `colocar.ts`):
  diagonales a luz 46-53 y R−B 13-20, en la de sus laderas (52-59, 15-17). En s28 y s36
  dejan de verse como cascajo gris sobre la ceniza. Lo vigila un test (`celdas.test.ts`).
- **El canto claro de las cóncavas de caída 2 era el canal de la guía**: la franja clara
  de derrubio que baja del filo, que en el rincón estrecho Codex pintaba como un canto
  claro seguido. La guía ya no lo dibuja en las cóncavas (`diagonales.ts`; las tiradas de
  azar no cambian, ni la máscara). Rehechas `diagonales-roca-se-2`, `-arenisca-se-2` y
  `-nevadas-se-2`, sin la franja.
- **El suroeste.** Tres intentos en `diagonales-roca-so-1`:
  1. «luz rasante, estratos inclinados»: menos cubos, pero **un labio claro seguido** que
     en el mapa se leía como un camino;
  2. lo mismo, más «el labio no es claro» y la hermana del sureste como 5.ª referencia:
     el mismo labio claro (nombrarlo lo atrae);
  3. la frase corta («se rompe como la hermana de la imagen 5…»), la hermana `se` como
     referencia y **el labio de la guía oscuro en el suroeste** (`LABIO_EN_LUZ`): sin
     labio claro y menos en cubos. **Se queda.** Es algo más plana de contraste que la de
     antes (menos sombra entre bloques).

  `diagonales-roca-so-2`: se queda la del 2.º intento (sin labio claro y menos cúbica en el
  mapa, s37). Con el prompt del 3.º: `diagonales-nevadas-so-1` y `-basalto-so-1` se quedan
  (con el tono, el basalto casa); `diagonales-arenisca-so-1`, `-arenisca-so-2` y
  `-nevadas-so-2` salieron **más en columnas** o con el canto claro: se quedan las de antes.
- **Bajadas E/O.** El prompt pide ahora que se lea que baja aunque vaya casi horizontal: en
  el extremo alto el camino va hundido entre dos paredes que le sacan casi toda la caída,
  la de delante con su cara cortada, que se acortan hasta quedar a ras en el extremo bajo
  (`SE_VE_BAJAR`, `bajadas.ts`). A la primera, en las cinco hojas rehechas
  (`bajadas-roca-1`, `-roca-2`, `-basalto-1`, `-nevadas-1`, `-arenisca-1`), la pared alta
  en el extremo del filo y la rampa que sale al llano se leen como bajada. Las de caída 2
  de basalto, arenisca y nieve (4-6 apariciones cada una) no se rehicieron.
- **Registro**: los 53 módulos rehechos tapan del 97 al 100 % de la silueta de su pieza en
  la guía (`registro.py`). `diagonales-arenisca-so-2`, que no se rehízo, se rederivó sobre
  la guía con el labio oscuro: su cóncava-b se movió 3 px.
- **Medidas** (1-40): todos los guardias del informe a 0, 3 203 diagonales y 235 bajadas,
  ninguna con marcador.

### Lo que sigue flojo

- **El labio claro seguido de las laderas oeste** (§20) sigue: en s37 la cadena del oeste
  lo lleva, y casa con él la `so-2` de antes de arenisca y nieve.
- **Arenisca y nieve en el suroeste**, sin mejora: la arenisca tiende a columnas por su
  propia roca.
- **La `so-1` de roca**, menos cúbica pero más plana de contraste: a 60 px por casilla
  pierde algo de relieve frente a la del sureste.
- **Las bajadas `o` de nieve y arenisca** pintan su pared alta algo fuera de la silueta de
  la guía (sale el 54-55 % del módulo, frente al 37-39 %). Los guardias siguen a 0.

## 27. Variantes de cada suelo para el suelo sin rejilla (R2, rama `suelo-r2`, 08-10-2026)

El suelo ya no enseña la rejilla de 4 casillas: encima del patrón van parches con otro
trozo de la misma textura (`parches.ts`). Con una sola textura por suelo, los parches
repiten el mismo dibujo en otro sitio: al alejar ya no se ven filas, pero de cerca la misma
mata o la misma mancha de nieve puede salir dos veces en pocas casillas. **No se ha
generado nada**; queda como petición:

- **2 variantes más por suelo** (`grass`, `dirt`, `snow`, `sand`, `swamp`, `lava`):
  `suelos/<suelo>-2.webp`, `-3.webp`, 512 × 512, repetibles, con la misma luz, el mismo
  color medio y la misma escala que la que hay (que fundidas no se note el cambio de
  tono), y dibujo distinto: otras matas, otras manchas, otras ondas de la arena (siempre
  horizontales).
- Al llegar, cada `Variante` de `encajeDe` elegiría también textura; las fronteras leen
  la altura de la que se ve (`enElEncaje`).

## 29. Tablillas por rumbo y muralla de norte a sur (rama `detalles-mapa`, 08-10-2026)

**Petición.** Dos detalles del defecto 6 de la auditoría 3
(`docs/agents/2026-10-08-auditoria-3/defectos.md`) y uno que dejó #183
(`docs/agents/2026-10-08-murallas/implementacion.md`):

- **La tablilla** (`nodo-hito-tablilla`, §24) apunta siempre al este, vaya donde vaya el
  paso. El juego no espeja piezas (la luz viene de la izquierda: la del oeste espejada la
  tendría de la derecha), así que se piden **cuatro tablillas más**, una por rumbo, con la
  del este de referencia de **material** (su madera y su piedra, no su forma):
  `nodo-hito-tablilla-oeste`, `-norte` (hacia el fondo), `-noreste` y `-noroeste`. El juego
  elige por el eje del paso (`tablillaDelEje`, `nodos.ts`): de los dos sentidos de un eje,
  el que va al fondo; en el este-oeste, uno u otro por el sitio.
- **El tramo de muralla de norte a sur** de la hoja `muro` (`profundidad`) está visto desde
  su extremo: una tira de almenas de 0,55 casillas. Se piden **dos tramos de lado**,
  `muro-ns-1` y `-2`: el muro se aleja de la cámara y se le ve el adarve con sus almenas y
  la cara del este, con cortes limpios para empalmar. Referencia de identidad, el
  `horizontal` de la hoja.
- **La puerta N-S** (`nodo-puerta-hondo`) era la del este-oeste girada a medias por una
  corrección de Codex, con el arco al sureste. Se pide de nuevo: casa de la puerta entre dos
  torres, la muralla hacia el fondo y el arco abierto al este. Referencia de identidad,
  `nodo-puerta-ancho`.

Encargos en `tools/taller/mapa.ts` (`TABLILLAS_POR_RUMBO`, `MURALLA_NORTE_SUR`;
`pnpm taller encolar --tablillas | --muralla-ns [--solo=…]`); estilo, la lámina elegida
(`muestras/pintado.webp`).

### Respuesta (rama `detalles-mapa`, 08-10-2026)

Codex por la suscripción, sin fal.ai y sin `resume`: **8 generaciones** (de 70 a 128 s,
ninguna fallida), dos trabajadores a la vez. Se quedan 7; la 1.ª puerta se descarta.

| Pieza | Hilo | sha256 del crudo | Pieza (px) |
|---|---|---|---|
| `nodo-hito-tablilla-oeste` | `01a11a7f-e2d9-…` | `25ad52806aad…` | 1174 × 1049 |
| `nodo-hito-tablilla-norte` | `01a11a7f-9cb3-…` | `7a1aee7f0231…` | 613 × 915 |
| `nodo-hito-tablilla-noreste` | `01a11a7e-37e7-…` | `1d682cf17b2b…` | 908 × 1088 |
| `nodo-hito-tablilla-noroeste` | `01a11a7e-b113-…` | `b386ac06572b…` | 940 × 1097 |
| `muro-ns-1` | `01a11a7d-2a19-…` | `83ce7ebd64ac…` | 541 × 1489 |
| `muro-ns-2` | `01a11a7d-29fe-…` | `d55cca80ca78…` | 540 × 1429 |
| `nodo-puerta-hondo` (2.ª) | `01a11a84-65f6-…` | `ecc13218125a…` | 424 × 1536 |

El hilo entero, el prompt y los sha256 de referencias y salida, en el `.procedencia.json`
de cada una.

- **La 1.ª puerta** salió con el arco al este, pero la muralla subía en diagonal hacia la
  derecha: la torre de atrás quedaba 0,55 casillas al este de la de delante. Rehecha desde
  cero con «la muralla va VERTICAL en la imagen, sin inclinarse». La 2.ª va recta, con el
  paso abierto a través de la casa de la puerta.
- **Reparto de las tablillas en 1-40**: este 6, oeste 6, norte 15, noroeste 12, noreste 9.
- **La tablilla del norte** se lee como un poste con la flecha hacia arriba: en escorzo
  apenas se ve su cara. Es la única que pierde la forma de flecha de lado.
- **Los tramos N-S** salen un poco más cálidos que la hoja (R−B 34-40 frente a 23-24, luz
  85-88 frente a 76-84) y su adarve, al sol, algo más claro. Su arranque se corre al este
  según se aleja (0,26 de su ancho): el juego los apoya por el medio.
- **Cómo los pone el juego**: el tramo, a 1,6 casillas de alto por el medio
  (`ALTO_DEL_TRAMO_NORTE_SUR`, `colocar.ts`); la puerta, a 2,6 de alto y por el pie de su
  arco, el 62,5 % de la pieza (`PUERTA_NORTE_SUR`). Solo en la muralla: la ruina
  (`uso: obstaculo`) sigue con el `profundidad` de su hoja.
- Recortes antes/después en `docs/agents/2026-10-08-detalles-mapa/capturas/`.

## 30. Textura propia de camino (#191, rama `senda-aspecto`, 08-10-2026)

La senda del mapa es ya una banda de tierra de 0,32 casillas (`huella.ts`), pero su
textura es la del suelo `dirt` (`suelos/dirt.webp`) aclarada con un filtro
(`ENTONADO_DE_LA_HUELLA`) hasta el tono de las rampas de las bajadas. Sirve, y no se ha
generado nada; lo que falta para que se parezca de verdad al camino de HoMM2:

- **`texturas/camino.webp`**: tierra pisada de camino, 512 × 512 sin costura, vista a 90°
  como el resto de `texturas/`, clara (la media del centro de `bajadas-*-1/s.webp`,
  ~150,125,95), con chinas y rodadas finas y sin hierba. La cuadrícula de grano: una
  vuelta cubre 1,5 casillas (`CASILLAS_POR_VUELTA`), así que una china mide ~4 px.
- **Opcional, `texturas/adoquin.webp`**: el empedrado de los caminos junto a las ciudades.
  El juego no distingue hoy un camino de otro; sería una regla nueva.

Con la primera, `TEXTURA_DE_LA_HUELLA` apunta a ella y el filtro se quita. La trocha de
los pasos sin camino (#190) usa la misma.

## 31. El paso de bosque sin pieza (#196, rama `paso-bosque`, 08-10-2026)

No se pide arte. `nodo-paso-bosque` (un portillo de abetos verdes sin nieve, con
poste y mojón) desentonaba en un bosque nevado (marca de s1 (16,16)) y en los de
árboles muertos, y la mitad de los pasos de bosque de 1-40 separan dos suelos con
dos hojas distintas: ninguna variante de la pieza casaba con los dos lados. Por
decisión del usuario («que se abra con los árboles del propio bosque») el nodo de
bosque lleva el hito de `HITOS`, como el de acantilado; la pieza se queda en
`assets/mapa/` sin uso.

## 32. El paso de montaña sin pieza (#203, rama `montanas`, 08-10-2026)

No se pide arte. `nodo-paso-montana` (dos picos pardos con una garganta de tierra
de norte a sur) solo casaba con 2 de los 23 nodos de montaña de la auditoría 4: en
los demás el paso va de este a oeste o en diagonal, y el camino o la trocha entraba
bajo la roca por un costado; tampoco se entonaba (en la nieve de s443 salía parda).
Con la idea del paso de bosque (§31, «que se abra con los árboles del propio
bosque»), el nodo de montaña lleva el hito de `HITOS` y la garganta la abren los
picos de la propia cordillera por el eje (`pasosALaVista`), con su trocha o su
camino. La pieza se queda en `assets/mapa/` sin uso. Si algún día se quiere una
garganta pintada, haría falta una por eje (este-oeste, norte-sur y las dos
diagonales) y por material (nieve, roca, lava, arena): 16 piezas.

## 33. Cumbres de cordillera (#204, rama `montanas`, 08-10-2026)

Sin generar. La cordillera ya va en dos escalas (pocas cumbres de 2,5-3 casillas y
picos medianos), pero cada módulo de `picos-*` es él mismo un racimo de diez o veinte
agujas: aun con menos piezas, de cerca la masa sigue leyéndose «con pinchos». Lo que
acercaría el mapa a HoMM2 es una hoja `cumbres-<material>` (nieve, roca, lava, arena)
de 4-6 moles de una sola cima clara, de 380-420 px de alto (3,0-3,2 casillas a ×1,3),
con la falda lisa y el pie ancho, para la pieza de `Macizo.cumbres`. Hasta entonces la
cumbre usa el módulo de la hoja de picos que llega a su alto.

## 34. Laderas que bajan de la meseta, y su reborde de espaldas (#212, rama `laderas-borde`, 08-10-2026)

Sin generar: **pendiente de que lo apruebe el usuario.** El usuario, del relieve
de #143: «se pone la imagen de desnivel pero no representa nada, no encaja con el
mapa que hay a continuacion, no parece mas elevado, una elevacion no puede acabar
de repente, sin continuidad». La auditoría 5 (defecto 1) lo midió: la mitad de los
lados con desnivel son laderas este u oeste, y se leen como cuchillas que suben del
suelo, no como el borde de una meseta.

**Lo que se arregló sin arte** (#212): el reborde de peñascos en toda espalda, las
cadenas que no rematan en el borde del mapa, la roca de lo alto del color de su
cara y la montaña de arena sin mesas. Lo de fuera de las piezas lo llevan #210 (sin
espigas ni caída 3 en los cauces) y #211 (el agua fuera de lo alto, el tono por
nivel y la sombra al pie).

**Por qué hace falta arte.**

- La cara de una ladera, en esta proyección, es una tira de 0,45-0,85 casillas de
  ancho (`TALUD_DE_LADERA`) que cuelga `1 + caída · 0,6`. Lo que dice qué lado es
  el alto es la luz y el canto, y la pieza de hoy no lo dice:
  - junto al filo va un escarpe oscuro y hacia el pie un derrubio claro; su
    frontera corre de norte a sur por el medio de la tira y se lee como la arista
    de una cresta con dos flancos;
  - del 6 al 16 % de la silueta (10 % de media en las 24 hojas, sin contar la
    `esquina`) cae del lado de la meseta, más allá del `LABIO` (0,06): el morro
    del `inicio` y rocas detrás del filo;
  - una caída 1 se ve tan alta como una 3 (s443 (20, 19-22) contra (18, 19-22)).
- Recortar en el juego lo que cae detrás del filo **no sirve**: se probó en #212 y
  deja un corte vertical recto que se lee peor que la cresta.
- La espalda (el borde norte, de espaldas a la cámara) lleva peñascos sueltos de
  `rocas-caidas` entonados: cierran el borde, pero se leen como piedras, no como el
  canto de una meseta.

**Lo que se pide.**

1. **`laderas-<material>-<este|oeste>-<1|2|3>` rehechas como talud**: las 24 hojas
   de §20, con los mismos ocho módulos, las mismas juntas (`filo`, `pie`, `TALUD`)
   y la misma luz por lado (el oeste, de cara a la luz). Cambia el dibujo:
   - del lado de la meseta, **nada** más allá del labio: el suelo de arriba llega
     hasta el filo;
   - el filo es el canto del suelo de arriba (prado, arena, nieve, ceniza) que se
     dobla: una banda clara y estrecha donde le da la luz;
   - la cara, en sombra junto al filo y más clara hacia abajo, **sin una arista de
     norte a sur por el medio**: el escarpe y el derrubio se funden en la línea de
     máxima pendiente;
   - el pie se abre en abanico sobre lo bajo, sin bloques en fila que hagan de
     murete;
   - lo alto se nota en el ancho de la sombra: la caída 1, tendida y corta; la 3,
     un cantil.
2. **`reborde-<material>`** (roca, arenisca, basalto, nevadas), 4-6 módulos de una
   casilla de ancho y 0,2-0,3 de alto: el canto de una meseta visto **desde
   detrás**, una cornisa del material con el suelo de arriba encima, que encadena
   de oeste a este sin junta visible. Sustituiría a los peñascos de la espalda.

**Guía.** La de §20 (`tools/taller/laderas.ts`) vale tal cual para la silueta; lo
que cambia es el prompt (el lado de la meseta, vacío; sin arista central; la luz
por el canto). El reborde necesita una guía nueva: una banda de 1 × 0,25 casillas
con el canto arriba, a 25° como las frontales.

**Coste.** Como §20: 24 generaciones de Codex por la suscripción para las laderas
(más un piloto de roca-este) y 4 para el reborde. Nada de fal.ai.

**Cómo verlo.** Las maquetas de §20 (`docs/art/revision-laterales-2/maqueta.py`) y,
enganchado, los recortes de `docs/agents/2026-10-08-laderas-borde/capturas/`. Lo que
se pide del lado de la meseta se mide como en #212: la parte de la silueta más allá
del labio tiene que bajar del 10 % a casi nada.

## 35. La rampa abre la pared: cuerpo y dos costados (#225, rama `rampas-225`, 09-10-2026)

**Estado: piloto generado otra vez (roca y arenisca, caída 1, rumbo `s`) con la
forma de muro a cuesta que pidió el usuario al ver el primero; pendiente de que lo
vea.** Nada más se genera hasta entonces.

**Por qué.** El usuario: «fallan los caminos que pasan a otro nivel, hace falta
arte específico; hay una transición de muro a cuesta, mira otros juegos». La bajada
de §23 va ENCIMA de la pared, que sigue entera detrás, y se lee como una tira de
tierra pegada a la roca (s55 node-4, (30, 15)). En StarCraft, Warcraft III, SC2 y
los tilesets de acantilados (Slynyrd, Pixelblog 43; la guía de Tiny Swords) la rampa
ABRE un hueco en el muro con tres piezas: el cuerpo y dos costados donde la cara
baja de su alto entero junto al filo a cero al pie de la rampa; solo en bordes
rectos; la cuesta más clara que la roca, con estrías, y su sombra al pie.

**Lo que se pide.** Por material y caída, UNA imagen del conjunto
(`assets/mapa/modulos/rampa-<material>-<caída>.webp`) sobre la guía
`assets/mapa/guias/rampas-<caída>.png`, que el taller corta por ella en tres piezas
(`rampa-<material>-<caída>/s-costado-izq|s-cuerpo|s-costado-der.webp`, con sus
juntas en `rampa-….json`). Pedidas por separado, las juntas entre el costado y el
cuerpo no casarían. Los cortes caen en el filo, en `TRAMO_DE_PIEZA_DE_RAMPA`
(`celdas.ts`): los costados miden casilla y media porque las paredes S del *dual
grid* van de vértice a vértice; por fuera siguen en la frontal (`paredes-*`), que
se pinta después y tapa el corte.

**Guía** (`tools/taller/rampas.ts`, segunda forma, 09-10-2026): la transición de
MURO A CUESTA (*wall-to-slope*). En cada costado la cara frontal, la misma que la
frontal vecina, tiene su alto entero en el extremo de fuera (0,4 casillas) y baja
en diagonal hasta nada en el borde de la cuesta, al pie: un trapecio de pared con
la cresta siguiendo la inclinación; por encima, la meseta baja también hacia la
cuesta. Sin caras laterales. La cuesta va de lo alto (0,55 dentro de la meseta) al
pie, con cuatro estrías, la senda y un abanico. La pared sigue 0,15 por fuera de
cada costado (`SOLAPE`): esa franja se corta con la pieza y se funde a
transparente, y en el juego la tapa la frontal más estrecha de su material, puesta
encima del extremo.

**Referencias**: 1, el estilo del mapa; 2, `paredes-<material>` (la pared con la que
casa por los dos lados); 3, `bajadas-<material>-1` (la tierra de la cuesta); 4, la guía.

**Lotes** (codex por la suscripción, 100-230 s cada uno, con el corte).
- Primera forma (alas triangulares que miraban a la cuesta y un hombro encima),
  vuelta 1: piedras flotando bajo el pie, el pie de la pared en línea recta y la
  cresta como una franja de tierra. Vuelta 2, sin bloques en la guía y con el
  párrafo de la cresta y el pie: buena, pero **el usuario la rechazó**: los
  costados se leían como paredes de desfiladero, la arenisca salía más oscura
  que su frontal y en una esquina se veía la arista del corte.
- Segunda forma (esta guía y este prompt): la arenisca salió bien a la primera;
  la roca dejó columnas altas junto al camino. El `corregir` sobre su hilo se cortó
  («websocket closed») y se rehízo desde cero con la frase «Junto a la cuesta la
  pared NUNCA sigue alta…», que es el prompt de abajo (la arenisca se pintó sin
  ella, con el resto igual).
- El pintor la dibuja un 12-17 % mayor que la guía: el corte la registra con su
  escala (`registrarConEscala`, 1,125 en las dos; solape 93,5 y 83,1 %).
- Tono, medido en el tercio de fuera del costado contra la frontal sin entonar:
  arenisca luz 84 contra 84 y R−B 66 contra 80 → `brightness(0.8) saturate(0.85)`;
  roca 73 contra 107 (77 entonada) → solo `saturate(0.85)`.

**Prompt** (el de roca; el de arenisca cambia el material y la meseta; el entero,
con las referencias, en cada `.procedencia.json`):

```text
Genera UNA imagen con la herramienta de imágenes integrada. No escribas código ni ficheros: solo la imagen.

La imagen 1 es la referencia de ESTILO: el acabado pintado, los materiales y la paleta que hay que seguir. No copies su contenido ni su composición.
La imagen 2 es la IDENTIDAD DEL PERSONAJE: define su aspecto (cara, ropa, armadura, armas, colores) y su acabado pintado. No determina la cámara, la anatomía ni la pose.
La imagen 3 es la referencia de MATERIAL: de ella se toman SOLO el color, la textura y la paleta de la roca y de lo que crece en ella, para que case con estas piezas. NO copies su forma (columnas, prismas, bloques en fila) ni su composición.
La imagen 4 es la GUÍA DE GEOMETRÍA: un volumen gris sin acabado, dibujado con la cámara del juego. Manda en la ORIENTACIÓN, la forma, las proporciones, el tamaño y la posición de cada pieza dentro de la imagen: cópialas con exactitud, sin girar ni torcer nada. NO copies su gris liso, sus aristas de esquema ni su fondo plano: el material, el detalle y la luz son los de la imagen de estilo.

Una RAMPA para el mapa de aventura de un juego de estrategia: el borde recto de una meseta de roca gris pizarra con musgo oliva oscuro, del color de las paredes de la imagen 3 que cae UN nivel hacia la cámara, y en su centro un camino de tierra que BAJA DE FRENTE hacia la cámara por una CUESTA. Es la transición de MURO A CUESTA de los acantilados de StarCraft y Warcraft III (wall-to-slope): el muro no se corta en un desfiladero, sino que a cada lado de la cuesta SE VA HUNDIENDO hasta desaparecer en ella.
LA PARED ES LA MISMA PARED FRONTAL DE LA IMAGEN 2, con su misma roca, el MISMO COLOR Y LA MISMA LUZ (ni más oscura ni más clara), el mismo TAMAÑO de columnas y bloques, su remate de arriba y su musgo: sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas y tiene que casar con ellas sin que se note la junta. Sus dos extremos de fuera están a su alto entero y cortados limpios en vertical, como si continuara.
A CADA LADO DE LA CUESTA, LA CARA FRONTAL DEL MURO (la que mira a la cámara, como en la imagen 2) BAJA EN DIAGONAL: tiene su alto entero en el extremo de fuera y se va haciendo más y más baja hacia el centro hasta quedar en NADA, a ras del suelo, en el borde de la cuesta al pie. Su perfil de arriba es una LÍNEA INCLINADA, como la de la guía: un triángulo o un trapecio de pared, con su cresta de roca y musgo siguiendo esa inclinación. Por encima de esa línea, el suelo de la meseta BAJA TAMBIÉN, en pendiente, hacia la cuesta, y se funde con ella.
NO HAY CARAS LATERALES: nada de paredes verticales que flanqueen el camino ni que miren hacia él, nada de desfiladero, garganta ni corte en la roca. La cuesta y los dos costados son una sola pendiente que se abre de la meseta al llano. Junto a la cuesta la pared NUNCA sigue alta: allí no hay columnas altas, solo la punta baja del triángulo de pared, a ras del suelo, y encima la meseta en pendiente, de hierba y tierra.
La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; arriba se mete en la meseta y abajo se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Al pie de la pared y de la cuesta, una sombra de contacto oscura y estrecha.
POR ENCIMA DEL FILO, en los extremos, la cresta es la de la imagen 2: las CABEZAS de la misma roca de la pared, con musgo, matas y hierba entre ellas; NUNCA una franja de tierra ni un suelo llano encima de la pared. La meseta (un prado de hierba corta verde oliva OSCURO y apagado) la pone el juego: por detrás de la cresta, la imagen es transparente. Al PIE de la pared, como en la imagen 2: bloques caídos y derrubio de tamaños distintos, irregular; NUNCA un borde recto ni una línea horizontal limpia, y ninguna piedra suelta separada del resto.
LA SILUETA ES LA DE LA GUÍA (imagen 4), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones, sin girar ni torcer nada. En la guía: lo gris medio de abajo a los lados es la CARA FRONTAL, que baja en diagonal hacia el centro; lo gris claro de encima de esa diagonal, la meseta que baja hacia la cuesta; lo más claro de los extremos, la cresta; lo pardo del centro, la cuesta con sus estrías más oscuras y el camino claro.
La luz viene de arriba a la izquierda, la misma que en la imagen 2; las sombras caen hacia la derecha y hacia abajo.
Estilo de la imagen de estilo, que manda sobre cualquier otra idea: fantasía medieval OSCURA y sombría, pintura digital muy detallada como una maqueta en miniatura, con muchísimo detalle menudo (piedras, matas, grietas, raíces). Paleta APAGADA y poco saturada: verdes oliva y musgo oscuros, grises pizarra, pardos terrosos, rojos óxido; nada de colores vivos ni de aspecto de juego para móvil. Sombras profundas y oclusión marcada entre los detalles, luz tenue y algo fría, con contraste dramático.

Todo lo dibujado cabe en la imagen con margen. Fondo con alfa real totalmente transparente: sin suelo, sin sombra pintada, sin halo, sin brillo, sin rejilla y sin texto. Iluminación desde arriba a la izquierda y por delante, del lado del espectador: la cara visible del personaje está iluminada y las sombras propias caen hacia la derecha y hacia el fondo. Sin contraluz.
```

**Cuántas salen** (generador de #224, 09-10-2026, tramos del núcleo que bajan al
sur): en 1-1000 hay 1 070 bajadas `s` de caída 1; 44 caen en un borde recto de cinco
casillas (4 %) y 27 de ellas son de roca o arenisca (20 y 7): las rampas con arte.
El 90 % (961) baja a un rincón: casi siempre a la muesca de una casilla de un nodo
o la puerta de una ciudad o mina (lo bajo entre dos casillas altas) o a una
esquina, donde la pared dobla; otras 65 (6 %) tienen el hueco recto pero menos de
cinco casillas. En 1-200, 5 de 199 (todas de roca). La muesca es el siguiente caso
que merece pieza: una rampa entre dos laderas.

**Lo que falta** (cuando el usuario lo apruebe): basalto y nevadas; caída 2; los
rumbos `e` y `o` (la rampa de lado). El rincón (s55) no es un borde recto y sigue con
la bajada: lo resuelve el generador cruzando el desnivel de frente (#224).

## 36. La rampa de muesca: la cuesta entre dos laderas (#225, rama `rampa-muesca`, 09-10-2026)

**Estado: generada (roca y arenisca, caída 1, rumbo `s`) y montada; pendiente de que la vea el usuario.**

**Por qué.** El piloto de §35 abre la pared solo en un borde recto de cinco casillas: 27 de las 1 070 bajadas
`s` de caída 1 de 1-1000. El 90 % cae en un rincón. El patrón concreto más frecuente (185) es la **muesca de
una casilla de hondo**: la casilla baja (un nodo con camino, o una ciudad que entra por detrás) entre dos altas, con lo
bajo delante de las dos (`HHH/HlH/lll`). Ahí iban cuatro diagonales (los rincones SE y SO del fondo y las
esquinas SE y SO de delante) y la bajada vieja encima.

**Lo que se pide.** Por material y caída, UNA pieza entera (`assets/mapa/modulos/rampa-muesca-<material>-<caída>.webp`,
su módulo `rampa-muesca-…/s-muesca.webp`) sobre la guía `assets/mapa/guias/rampas-muesca-<caída>.png`. Sustituye
las cuatro diagonales y casa con lo de fuera por sus dos juntas S, las de las esquinas (`TRAMO_DE_PIEZA_DE_RAMPA.muesca`,
de `x − 0,5` a `x + 1,5` en la línea de delante, `FILA_DEL_FILO`). La cuesta baja de la meseta de detrás a la
línea de delante. A cada lado, una ladera en triángulo: entera delante y a nada arriba, donde la cuesta llega a lo alto
(de muro a cuesta, de lado). Su filo se mete en la meseta en diagonal (`MESETA_DE_MUESCA`) y su pie entra en la muesca
(`TALUD_DE_MUESCA`). Por delante, media casilla de frontal en cada esquina.

**Referencias**: 1, el estilo del mapa; 2, `paredes-<material>` (las frontales de las esquinas); 3, `bajadas-<material>-1`
(la tierra); 4, `laderas-<material>-oeste-1` (las paredes de lado); 5, la guía.

**Lotes** (codex por la suscripción, ~270-340 s cada uno con el registro; escala 1,28-1,35, solape 87-93 %):

1. Guía con la cresta ancha a lo largo de cada lado: el pintor levantó dos torres de roca a los lados. Era un desfiladero.
2. Labio estrecho y filo recto en el borde de la casilla: con esta cámara la cara de lado no se ve, y salió una ranura
   de paredes paralelas.
3. **Esta**: el filo de cada ladera se mete en la meseta (V abierta hacia la cámara). Queda un labio claro a lo largo de
   cada filo, que se lee como un murete fino.
4. Sin labio: rellenó de roca la meseta de los lados y la muesca salió un monte. Descartada; va la 3.

**Tono**, medido en el tercio de fuera de cada frontal: la roca, 73-76 de luz y R−B 25, contra 77 y ~28 de su frontal
entonada, va sin filtro. La arenisca, 67-71 y 54-59, contra 69 y ~47, va con `saturate(0.85)`.

**Cobertura en 42×42** (#226, 09-10-2026): 160 de las 992 bajadas `s` de caída 1 de 1-1000 son esta muesca. Con arte, 89
(más las 19 rectas de §35); en 1-200, 27 (más 1 recta). Las cifras de 34×34 de arriba son de antes de #226.

**Lo que falta** (#228; en 1-1000 de 42×42): la muesca con un lado que sigue al sur (213), la honda (70, barranco), el
rincón de un solo lado (~300), basalto y nevadas, y caída 2.

**Prompt** (el de roca; el de arenisca cambia el material y la meseta; el entero, con las referencias, en cada `.procedencia.json`):

```text
Genera UNA imagen con la herramienta de imágenes integrada. No escribas código ni ficheros: solo la imagen.

La imagen 1 es la referencia de ESTILO: el acabado pintado, los materiales y la paleta que hay que seguir. No copies su contenido ni su composición.
La imagen 2 es la IDENTIDAD DEL PERSONAJE: define su aspecto (cara, ropa, armadura, armas, colores) y su acabado pintado. No determina la cámara, la anatomía ni la pose.
La imagen 3 es la referencia de MATERIAL: de ella se toman SOLO el color, la textura y la paleta de la roca y de lo que crece en ella, para que case con estas piezas. NO copies su forma (columnas, prismas, bloques en fila) ni su composición.
La imagen 4 es la referencia de MATERIAL: de ella se toman SOLO el color, la textura y la paleta de la roca y de lo que crece en ella, para que case con estas piezas. NO copies su forma (columnas, prismas, bloques en fila) ni su composición.
La imagen 5 es la GUÍA DE GEOMETRÍA: un volumen gris sin acabado, dibujado con la cámara del juego. Manda en la ORIENTACIÓN, la forma, las proporciones, el tamaño y la posición de cada pieza dentro de la imagen: cópialas con exactitud, sin girar ni torcer nada. NO copies su gris liso, sus aristas de esquema ni su fondo plano: el material, el detalle y la luz son los de la imagen de estilo.

Una RAMPA EN UNA MUESCA para el mapa de aventura de un juego de estrategia, vista con la cámara del juego (desde el sur, elevada). El borde de una meseta de roca gris pizarra con musgo oliva oscuro, del color de las paredes de la imagen 2 cae UN nivel hacia la cámara, y tiene una MUESCA de una casilla: un entrante estrecho por el que un camino de tierra BAJA DE FRENTE hacia la cámara por una CUESTA. Es la transición de MURO A CUESTA de los acantilados de StarCraft y Warcraft III (wall-to-slope), pero de LADO: la cuesta va metida entre DOS LADERAS, la de la IZQUIERDA mira a la DERECHA (hacia la cuesta) y la de la DERECHA mira a la IZQUIERDA (hacia la cuesta).
CADA LADERA BAJA HASTA FUNDIRSE CON LA CUESTA: junto a la línea de delante tiene su alto entero, y hacia el fondo se va haciendo más y más baja hasta quedar en NADA arriba, donde la cuesta llega a lo alto de la meseta. Su filo de arriba es una LÍNEA INCLINADA que se abre hacia delante, metiéndose en la meseta, y su pie sube con la cuesta: cada ladera es un TRIÁNGULO de roca en talud, ancho y alto delante y en punta al fondo, como en la guía. La muesca es una V abierta hacia la cámara, NO una ranura de paredes paralelas. Son paredes de la misma roca que las laderas de la imagen 4 (losas y bloques escalonados, derrubio al pie), NUNCA columnas verticales lisas ni un desfiladero de paredes altas en todo su largo.
POR DELANTE, cada ladera dobla una esquina y sigue a cada lado como un trozo de PARED FRONTAL a su alto entero: la misma pared de la imagen 2, con su misma roca, el MISMO COLOR Y LA MISMA LUZ, el mismo TAMAÑO de columnas y bloques, su remate de arriba y su musgo; sigue fuera de la imagen por la izquierda y por la derecha en esas mismas piezas y tiene que casar con ellas sin que se note la junta. Sus dos extremos de fuera están a su alto entero y cortados limpios en vertical, como si continuara.
La CUESTA es tierra pisada en pendiente, MÁS CLARA QUE LA ROCA, del color de la tierra de la imagen 3: con ESTRÍAS (regueros y surcos a lo largo de la pendiente, piedrecillas arrastradas hacia abajo) y un camino claro y gastado por el medio; arriba se mete en la meseta y abajo, entre las dos esquinas, se derrama en un abanico sobre el suelo llano. Es un paso natural: sin escalones, sin peldaños, sin barandillas, sin muretes ni bordillos. Al pie de las paredes, una sombra de contacto oscura y estrecha.
POR ENCIMA DEL FILO: sobre cada trozo de pared frontal, la cresta de la imagen 2 (las CABEZAS de la misma roca, con musgo y matas); a lo largo de cada ladera, SOLO un labio de roca estrecho y roto en el borde de la meseta. A los dos lados de la cuesta NO HAY TORRES, PILARES NI MUROS ALTOS: la meseta (un prado de hierba corta verde oliva OSCURO y apagado) está a la altura del borde y la pone el juego, así que ahí la imagen es TRANSPARENTE. Al PIE de las paredes: bloques caídos y derrubio de tamaños distintos, irregular; nunca una línea recta limpia, y ninguna piedra suelta separada del resto.
LA SILUETA ES LA DE LA GUÍA (imagen 5), CALCADA: mismo sitio, mismo alto, mismo ancho, mismas proporciones, sin girar ni torcer nada. En la guía: lo gris medio de abajo a los lados es la PARED FRONTAL de cada esquina; lo gris oscuro de la izquierda, la ladera de la izquierda (en penumbra), y lo gris medio de la derecha junto a la cuesta, la ladera de la derecha (a la luz), las dos en punta hacia arriba; lo más claro, la cresta de las frontales y el labio de las laderas (y fuera de eso, transparente); lo pardo del centro, la cuesta con sus estrías más oscuras y el camino claro, y el abanico de abajo.
La luz viene de arriba a la izquierda, la misma que en la imagen 2: la ladera de la izquierda queda en penumbra y la de la derecha recibe la luz; las sombras caen hacia la derecha y hacia abajo.
Estilo de la imagen de estilo, que manda sobre cualquier otra idea: fantasía medieval OSCURA y sombría, pintura digital muy detallada como una maqueta en miniatura, con muchísimo detalle menudo (piedras, matas, grietas, raíces). Paleta APAGADA y poco saturada: verdes oliva y musgo oscuros, grises pizarra, pardos terrosos, rojos óxido; nada de colores vivos ni de aspecto de juego para móvil. Sombras profundas y oclusión marcada entre los detalles, luz tenue y algo fría, con contraste dramático.

Todo lo dibujado cabe en la imagen con margen. Fondo con alfa real totalmente transparente: sin suelo, sin sombra pintada, sin halo, sin brillo, sin rejilla y sin texto. Iluminación desde arriba a la izquierda y por delante, del lado del espectador: la cara visible del personaje está iluminada y las sombras propias caen hacia la derecha y hacia el fondo. Sin contraluz.
```
