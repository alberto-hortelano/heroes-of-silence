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
una dirección) se queda como estaba para no romper lo que ya lo lee. Lo que haría
falta en el juego:

- Elegir la dirección por hacia dónde se mueve o ataca la unidad
  (`tools/taller/direcciones.ts`: 0 de frente, 2 derecha, 4 espalda, 6 izquierda)
  y **dejar de espejar**: con la luz fija, el espejo la trae del otro lado.
- La sombra por silueta: `proyeccionDeSombra()` en lugar del óvalo de `sombra.ts`.
- Al morir, dejar el fotograma `cadaver` en la casilla (los no muertos lo usan).
- **La luz del contrato ha cambiado**: `ARTE.luz.direccionSombra` pasa de
  `(1, 0,6)` a `(1, −0,6)`, así que la sombra que pinta hoy el juego ya cae hacia
  el fondo.
