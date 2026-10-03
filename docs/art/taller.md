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
     tumba plano en el suelo.
2. **El giro**: `pnpm taller encolar <id> --giro`. Es la lámina de identidad por
   los ocho lados y fija la espalda antes de pintar.
3. **Las 16 hojas**: `pnpm taller encolar <id> --ocho`. Cada hoja se escala
   contra su maniquí, celda a celda, y el taller junta las dos de una dirección en
   `assets/unidades/<id>/d<n>/atlas.webp` (celda de 384). `atlas.composicion.json`
   apunta de qué hojas sale.
4. **La vista**: `pnpm taller vista-8d [<id>]` escribe un solo visor, `.cache/taller/vista/visor-8d.html`, con un selector de todas las unidades que ya tienen sus 8 direcciones y de las poses de cada juego de armas; el `<id>` solo elige con cuál se abre (va en el `#` de la URL). Con la sombra por silueta.

Las direcciones son las de sprite-forge: 0 mira a la cámara, 2 a la derecha, 4 de
espaldas y 6 a la izquierda (`tools/taller/direcciones.ts`).
Ninguna se espeja, porque la luz vendría del otro lado.

### Lo que el maniquí guía, además de la pose

- **La posición.** Cada figura pintada se coloca desplazada lo mismo que el
  maniquí respecto a su reposo (`EscalaDePose.apoyos`). Antes se colocaba por su
  propio apoyo y un cadáver tendido quedaba levitando. La transformación se
  apunta en la procedencia (`deLaPose`).
- **Las piernas.** En los juegos de armas con `piernasDeColor`, la pierna derecha
  del maniquí es roja y la izquierda azul. El prompt dice que solo sirven para
  distinguirlas.

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
