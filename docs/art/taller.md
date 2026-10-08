# El taller de imágenes

Genera el arte con **ChatGPT por la suscripción**, a través de Codex CLI. Nunca
fal.ai, nunca `pnpm gen -- --go`, nunca una API de pago.

```bash
npx tsx tools/art/poses.ts --todos          # referencias de pose del Y Bot (render local)
pnpm taller encolar templario-escudo        # la lámina de identidad
pnpm taller                                 # trabaja hasta vaciar la cola
pnpm taller encolar templario-escudo --atlas
pnpm taller
pnpm taller corregir templario-escudo-atlas "el escudo va en el brazo izquierdo"
pnpm taller estado
pnpm taller encolar --rehacer templario-escudo   # vuelve a pedir lo ya hecho
pnpm taller retirar <id>                    # borra un pendiente que ya no vale
pnpm taller devolver <id>                   # de en-curso/ o fallido/ otra vez a pendiente/
pnpm taller derivar assets/unidades/<id>/atlas.webp
```

## La cola

`tools/taller/cola/{pendiente,en-curso,hecho,fallido}/<id>.json`, fuera de git.
El estado de un encargo es la carpeta en la que está, y tomarlo es un `rename`
atómico: pueden correr varios `pnpm taller` a la vez sobre la misma cola. Un
fallo no para la cola: el encargo va a `fallido/` con el motivo.

## Qué hace con cada encargo

1. Pasa las referencias a PNG y lanza `codex exec` con ellas **en su orden**. El
   prompt lo compone el taller: antepone el papel de cada imagen («la imagen 1 es
   la REFERENCIA DE POSE…, la imagen 2 es la IDENTIDAD DEL PERSONAJE…») y añade
   las reglas del tipo (rejilla, cámara a 25°, nunca de perfil, fondo
   transparente). Un atlas que no lleve la pose primero y la identidad después no
   entra en la cola.
2. Recoge el PNG de `~/.codex/generated_images/<hilo>/`.
3. **Recorta el halo**: ChatGPT devuelve el cuerpo con alfa 240-254 y un borde
   tenue. Lo tenue conectado al borde de la imagen pasa a 0 (relleno desde los
   bordes, no umbral) y el cuerpo pasa a opaco.
4. Si es un atlas, **busca las figuras** en vez de fiarse de una rejilla que la
   herramienta no respeta, las escala con un solo factor para toda la hoja y las
   coloca con los pies en `FIGURA.base`. Si una fila no tiene siete figuras, lo
   dice.
5. Valida con sharp (tamaño, cuerpo opaco, sin halo suelto, nada tocando el borde
   de su celda), escribe el WebP, **deriva** el JSON y escribe la procedencia.

Que el taller dé por bueno un encargo es una condición técnica, no la
aceptación: esa la da el usuario mirando capturas dentro del juego.

## Las referencias de estilo

`assets/art/<facción>/<unidad>.png` son las láminas de referencia que fijan el
estilo de cada unidad (decisión del usuario, 01-10-2026), con sus prompts en
`assets/art/prompts.json`. Están dibujadas de frente y a la altura de los ojos,
así que mandan en el aspecto y el acabado, nunca en la cámara ni en la pose.
Existen para que **la animación siga ese estilo**:

| Encargo | Imagen 1 | Imagen 2 | Imagen 3 |
|---|---|---|---|
| lámina de identidad a 25° | pose del Y Bot | lámina de `assets/art/` (identidad) | — |
| atlas | pose del Y Bot | lámina de identidad a 25° | lámina de `assets/art/` (estilo) |

El atlas de Liora ya no es referencia de nada.

## Las referencias de pose

`tools/art/poses.ts` renderiza el rig `y_bot` con sprite-forge a la cámara del
juego (`tactical_25`: ortográfica, 25° hacia abajo, dirección 2 de 8). Un perfil
es qué clip hace de ataque:

| Perfil | Ataque |
|---|---|
| `espada-escudo` | `sword and shield attack (4)` |
| `dos-manos` | `sword and shield slash` |
| `baston` | `sword and shield casting` |
| `arco` | poses de brazo escritas sobre el rig (no hay clip de arco) |
| `ballesta` | las mismas, encarando el arma al hombro |

`liora-walk-v2` está rechazado: no se usa como referencia.

## La luz (02-10-2026)

Una sola luz para todo, la de `ARTE.luz` (`src/shared/arte.ts`): desde la
izquierda y del lado de la cámara. La sombra cae a la derecha y hacia el fondo,
unos 31° en pantalla. De ahí salen:

- `luzEnElMundo()`: el sol del render 3D del maniquí, que sustituye a la luz de
  sprite-forge (venía de la derecha). `test/arte-luz.test.ts` comprueba que,
  proyectado con la cámara a 25°, da la sombra del contrato.
- `proyeccionDeSombra()`: la sombra de una figura es su SILUETA aplastada sobre el
  suelo (una afín y un `drawImage`), no una mancha. La figura se pinta sin sombra
  en el suelo; el prompt lo pide.

Los edificios y las piezas del mapa ya generados llevan una sombra pintada que no
sigue esta regla; se rehacen cuando toque.

## Los mapas densos (§8 de `peticiones.md`, issue #134)

```bash
pnpm taller encolar --muestras-densas          # las dos láminas de 3×3: bordes, y nodos y montes
pnpm taller encolar --texturas-suelo           # las siete texturas del suelo
pnpm taller encolar --piezas-densas [--solo=bosque-verde-1,nodo-puerta-ancho]
pnpm taller vista-mapa [semilla]               # .cache/taller/vista/mapa-denso.html
```

El catálogo está en `tools/taller/mapa-denso.ts`. Se produce como el mapa del
01-10: primero las láminas, que aprueba el usuario, y después cada pieza copiando
la suya de la lámina. Las referencias de estilo son la muestra elegida
(`assets/mapa/muestras/pintado.webp`) y el mapa que eligió el usuario
(`assets/art/mapas/`).

- **Las piezas van con el suelo**, no solo con la barrera (decisión del usuario,
  03-10-2026): bosque verde, nevado y de ciénaga; acantilado de arenisca, de
  basalto y de roca. Una familia dice qué barrera viste, junto a qué suelos y si
  es borde u obstáculo. `test/taller-mapa-denso.test.ts` comprueba que cada
  pareja de barrera y suelo de `data/barreras.json` tenga la suya.
- **Los tramos con cara** (acantilado, muro) se piden en dos orientaciones:
  - `ancho`: la frontera corre a lo ancho de la pantalla;
  - `hondo`: la frontera se aleja hacia el fondo.

  El puente y la puerta, también: en un nodo el eje es el de la frontera que
  cruzan.
- **Los obstáculos** son versiones de una casilla de una pieza de la lámina, para
  componer las manchas de 3-6.
- **Las texturas** son el tipo `textura`, con las reglas de `tools/gen/prompts.ts`
  en español: material a 90°, liso y sin nombrar el agua. La costura no se le pide
  a ChatGPT, la fabrica `textura.ts`:
  - cada eje se mezcla con su copia desplazada medio lado, con un peso que vale 1
    en el centro y 0 en el borde;
  - salen a 512×512;
  - el taller rechaza una textura con la costura por encima de `UMBRAL_DE_COSTURA`.

  Eje a eje y no con una sola máscara: con una máscara a cero en todo el borde, la
  costura de la copia asoma en mitad del borde izquierdo.
- **La composición de prueba** pinta un mapa de `newGame` con todo esto. Por
  casilla de barrera, la regla es `piezaDeCasilla`; por nodo, `nodoDePaso` con
  `pasoDeNodo` (la barrera que guarda el mapa y el eje de su frontera). Lo que falta sale con su pigmento. No es el render del juego:
  es la propuesta para la sesión de reglas.

## El escenógrafo: el mapa como escenario continuo (04-10-2026)

```bash
pnpm taller encolar --modulos [--solo=pinos,muro] [--rehacer]   # hojas de módulos
pnpm taller encolar --texturas-relieve                          # caras de roca, agua, barro
pnpm taller escenario 1 3 9                                     # compone, pinta, captura y mide
```

La composición de una pieza por casilla (arriba) se leía como «un mapa con cosas
encima»: piezas montadas, tramos de muro en paralelo y ni alturas ni ríos. El
usuario pidió formaciones grandes hechas de módulos que encajen, muros en 8
direcciones, relieve, ríos y barrancos, y casi nada de suelo desnudo, sin tocar el
código del juego. Todo vive en `tools/taller/escenario/` y es una **función pura
del `GameMap` y la semilla** (`componer`), que devuelve una escena: suelo, niveles,
agua, caras, sendas, luces y sprites colocados. El pintor la dibuja en un canvas y
`escenario.ts` la captura con Chromium y la mide.

- **Módulos, no tramos.** Cada hoja es una rejilla de 4×4 (o 4×2) de piezas
  pequeñas del mismo tipo, pedida con el mapa de referencia como única referencia
  de estilo (`tools/taller/escenario/modulos.ts`, `HOJAS`). Se corta por
  componentes conexas a tamaño nativo, con el ancla en la base, en
  `assets/mapa/modulos/<hoja>/`. Si una hoja da más trozos que módulos —un pueblo
  de casas, pozo y huerto; un campo con su cerca—, se agrupan por celda de la
  rejilla. `pnpm taller reprocesar` rehace el corte desde la imagen cruda sin
  volver a pedirla.
- **El relieve no separa regiones** (corrección del usuario): la ciénaga va abajo,
  la nieve, la lava y lo montañoso arriba, y el resto a nivel 1 o 2 según una
  tirada. Dos regiones al mismo nivel se separan por su río o por un cañón. Cada
  franja toma un solo nivel de sus dos orillas (`relieve.ts`): el agua uno por
  debajo de la más baja, el acantilado de borde el de la más alta o un cañón. Las
  caras cuelgan siempre hacia el sur de pantalla.
- **Muros en 8 direcciones.** La franja se adelgaza a su línea central
  (`esqueleto.ts`, Zhang–Suen) y cada paso se pinta con el segmento de su eje,
  con una torre en cada giro, cada extremo y cada tres pasos: la torre tapa la
  junta, así que dos imágenes no tienen que casar al píxel. Una línea por franja.
- **Masas** de bosque y montaña por disco de Poisson, con el tamaño creciendo con
  la distancia al borde de la franja: picos grandes en el centro de la cordillera.
  Junto a un camino que cruza, los de delante van bajos para que el paso se vea.
- **Cubierta en manchas**, no en motas: un ruido suave decide dónde hay
  bosquecillo, campos (junto a pueblos y ciudades) o claro de prado. Junto a un
  bosque de frontera el bosque sigue sobre el suelo que se pisa, más claro.
- **Sendas**: los tramos de camino se encadenan de cruce a cruce y se suavizan
  con un vaivén menor que su reserva (`sendas.ts`).
- **Luz y aire**: resplandor de ciudades y pueblos, brasas en el interior de la
  lava, niebla baja sobre agua y ciénaga, nubes en el borde y viñeta.
- **Primero se reserva**: objetos, caminos y nodos reservan su sitio antes de
  colocar nada, así que nada se apoya encima.
- **Dos puertas para el juego**: `componer(map, semilla, catalogo)` y
  `pintarEscena(ctx, escena, opciones)` (`pintar.ts`) no importan nada de Node. El
  catálogo es `assets/mapa/escena.json` (`pnpm taller catalogo-escena`), y la
  página del taller empaqueta `pintar.ts` con Vite: la página y el juego pintan
  con el mismo código. El contrato del enganche está en `peticiones.md` §11.

**Lo que mide** (`.cache/taller/escenario/<semilla>.json`, y lo vigila
`test/taller-escenario.test.ts`): murallas partidas, piezas sobre una reserva y
casillas de barrera sin formación —las tres a 0— y el suelo desnudo, objetivo
< 20 %. En las semillas 1, 3, 9, 5 y 12: 13,1 / 20,1 / 16,1 / 16,6 / 13,9 %. La
semilla 3 roza el objetivo por los claros de prado, que son a propósito.

## Paredes laterales y puentes (§16-§17 de `peticiones.md`, 06-10-2026)

```bash
pnpm taller guias                                   # las guías de geometría, en assets/mapa/guias/
pnpm taller encolar --paredes-puentes [--solo=…]    # puentes y hojas de paredes laterales
pnpm taller derivar-puentes assets/mapa/puente-*.webp
```

Lo que tiene que casar con la rejilla (un puente recto, una pared que cae al
este) lleva una **guía de geometría** (`papel: 'guia'`): un volumen gris con la
proyección del mapa que manda en la orientación y la forma. Con palabras solas,
el puente salía torcido. La guía guarda en su `.json` el centro del tablero y la
casilla, y de ahí sale el ancla del puente (`paredes-puentes.ts`).

## Unidades en 8 direcciones

La unidad definitiva tiene 8 direcciones y 6 acciones: quieto, andando, carga,
ataque, daño y muerte. La muerte arranca de la pose final del daño y su último
fotograma es el cadáver (`cadaver` en el JSON).

1. **Las poses**, por juego de armas: `npx tsx tools/art/poses.ts --8d` escribe
   `assets/unidades/_poses/<juego>-8d/`, con dos hojas de 3 filas por dirección
   (`d<n>-a`: quieto, andando y carga; `d<n>-b`: ataque, daño y muerte) y el giro
   (`giro.png`, el reposo de las 8). El maniquí:
   - lleva atrezo gris colocado con la anatomía en cada fotograma: la espada
     sigue la línea de los nudillos y el escudo cuelga por fuera del antebrazo;
   - se apoya en el suelo por el punto más bajo de su malla, así que no flota;
   - al morir no se desplaza (el cadáver cae en su casilla) y el escudo se
     tumba plano en el suelo;
   - en `arco`, el arco va en la mano IZQUIERDA y la derecha tensa la cuerda al
     disparar, con la flecha en ella hasta la suelta y la aljaba a la espalda; en
     `ballesta`, el arma va en la DERECHA y al disparar la izquierda sujeta el
     tablero con la IK del agarre a dos manos. La curva del disparo va por el
     progreso del clip (la misma en 1 y en 8 direcciones) y suelta en su último
     nudo alto. `derivar-poses` escribe esa columna en el ataque de
     `atlas-8d.json` (`suelta`), y el cliente lanza ahí el proyectil.
   En `granada` (04-10-2026) el ataque arma el brazo derecho sobre el hombro
   con la granada en el puño, la suelta en lo más alto y acompaña el tiro
   hacia delante; la curva es `grenade` y la granada desaparece al soltarla.
   - El jinete sale de `npx tsx tools/art/montura.ts --8d`, con la lanza; con
     `--pistola` sale `montado-pistola-8d`, sin lanza ni escudo, con la pistola
     alzada al paso, apuntando en la carga y disparando en el ataque (curva
     `pistol`, un segundo de clip).
     Con `--arco` sale `montado-arco-8d`, el jinete elfo (05-10-2026): la
     lanza en alto al paso y bajada en la carga, el arco a la espalda y sin
     escudo; el ataque es el tajo de espada, y el disparo (hoja C), el arco en
     la izquierda extendida y la derecha tensando hasta la mejilla, con la curva
     `bow` del arquero a pie y el arco de su mismo atrezo. Un jinete nuevo es
     una fila de `JUEGOS_MONTADOS`: su arma sale de la clave (`--<arma>`).
   - **El maniquí de una unidad** (04-10-2026): el Y Bot no es sagrado. Si el
     atrezo de su juego no se parece a lo que lleva el personaje —una daga y no
     un escudo, un arcabuz y no una ballesta, una rodela, una alabarda—, la
     unidad declara su `maniqui` en `tools/taller/unidades.ts` y
     `pnpm taller maniqui <id>` lo renderiza en `_poses/unidades/<id>-8d/` con
     los clips de su juego. Sus hojas se pintan sobre él. El juego de
     `JUEGO_DEL_YBOT` sigue siendo el respaldo del cliente mientras no hay arte.
     El atrezo nuevo: `daga` en la izquierda, `rodela`, `remate` `esfera` y
     `hacha`, y la ballesta con `palas: 0`, que es un arma de fuego.
     Además, el prompt trata el atrezo como punto de partida: el arma que se
     pinta es la del personaje.
2. **El giro**: `pnpm taller encolar <id> --giro`. Es la lámina de identidad por
   los ocho lados y fija la espalda antes de pintar.
3. **Las 16 hojas**: `pnpm taller encolar <id> --ocho`. Cada hoja se escala
   contra su maniquí, celda a celda, y el taller junta las dos de una dirección en
   `assets/unidades/<id>/d<n>/atlas.webp` (celda de 384). `atlas.composicion.json`
   apunta de qué hojas sale.
   - **La talla** (05-10-2026): el reposo se empaqueta a la altura de un adulto
     (`FIGURA.alturaAdulto`, 160 px) por la `talla` de la unidad, que vale 1 si
     no la declara: los goblins y el jinete de hiena van a 0,7, y el troll a 1,45. El cliente escala
     por la celda, así que en el tablero se ve con esa talla. Si el fotograma más
     ancho no cabe, el post-proceso reduce esa hoja y lo dice en su procedencia.
     Para cambiar la talla no hace falta volver a pintar: se pone `talla` en la
     ficha de cada hoja hecha de la cola y se pasa `pnpm taller reprocesar <id>`.
4. **La vista**: `pnpm taller vista-8d [<id>]` escribe un solo visor, `.cache/taller/vista/visor-8d.html`, con un selector de todas las unidades que ya tienen sus 8 direcciones y de las poses de cada juego de armas; el `<id>` solo elige con cuál se abre (va en el `#` de la URL). Todas a la misma escala, para poder compararlas: el lienzo crece hasta que quepa la más alta. Con la sombra por silueta.

Las direcciones son las de sprite-forge: 0 mira a la cámara, 2 a la derecha, 4 de
espaldas y 6 a la izquierda (`NOMBRES_DE_DIRECCION`, en `src/shared/arte.ts`).
Ninguna se espeja, porque la luz vendría del otro lado.

### Lo que el maniquí guía, además de la pose

- **La posición.** Cada figura pintada se coloca desplazada lo mismo que el
  maniquí respecto a su reposo (`EscalaDePose.apoyos`). Antes se colocaba por su
  propio apoyo y un cadáver tendido quedaba levitando. La transformación se
  apunta en la procedencia (`deLaPose`).
- **El tamaño.** La escala de cada hoja es la que mejor superpone la SILUETA de
  cada figura pintada a la del maniquí, apoyadas las dos por su apoyo (la
  mediana de las 21 celdas, `escalaPorSilueta`). Antes era la razón entre los
  altos de las cajas, y el alto engaña: el maniquí lleva siempre el arma entera,
  y de espaldas el asta se le junta con la cabeza. El escudero salía 1,7 veces
  más alto de espaldas que de frente.
- **La muerte, más arriba.** En las 6 filas, la de la muerte va
  `ELEVACION_DEL_CADAVER` (64 px) más arriba en su celda, y su ancla con ella.
  Bajo los pies solo quedaban 42 px y un cuerpo tendido hacia la cámara ocupa
  ~70: el empaquetado lo metía en la celda subiéndolo y el cadáver flotaba sobre
  su sombra.
- **Las piernas.** En los juegos de armas con `piernasDeColor`, la pierna derecha
  del maniquí es roja y la izquierda azul. El prompt dice que solo sirven para
  distinguirlas.
- **El fondo.** La hoja del maniquí se le enseña a ChatGPT sobre verde de croma
  (`FONDO_DE_POSE`), no transparente ni gris: el transparente le llega como negro, y ahí
  se pierden el atrezo negro (escudo, asta) y el lado en sombra del maniquí; el
  gris claro se confunde con el propio maniquí.

### El evaluador

`pnpm taller evaluar <id>` compara cada figura pintada con su maniquí, llevado
al atlas con la misma transformación: la silueta del maniquí menos lo que cubre
la figura. Por fila da el **nivel** (la mediana: la figura entera desviada,
girada) y el **pico** (el peor fotograma menos la mediana: uno que se encoge o
pierde el arma). Escribe `.cache/taller/evaluacion/<id>.json` y la vista 8d pone
un borde rojo en lo que avisa.

Calibrado el 03-10-2026 contra la revisión del usuario del templario del
mandoble:

- **Lo que ve:** «se gira hacia atrás», «se encoge en un fotograma» y una espada
  que desaparece en una carga.
- **Lo que no ve:** una espada fina que falta, una pierna levantada o pasos
  repetidos.
- **Falsas alarmas:** en el templario con escudo, ya aprobado, avisa de 9 filas
  de 48.

Es un aviso de revisión, no una aceptación.

Además avisa, sin ambigüedad, de las celdas con el **azul guía** del maniquí
copiado en una pierna (`esAzulGuia`, más de `UMBRAL_AZUL` píxeles): ningún
templario lleva azul. El rojo de la otra pierna no se busca, porque se confunde
con las cruces.
