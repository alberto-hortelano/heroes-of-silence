# Requisitos: las unidades en 8 direcciones

## Petición

Tras la fusión de `templario-definitivo` (03-10-2026), el usuario dijo «adelante» a
esta propuesta del coordinador:

> En el juego aún no se usan las 8 direcciones: hace falta que el animador lea
> `dN/atlas.webp` según la dirección que ya calcula `src/client/direccion.ts`, que
> deje de espejar, que pinte la sombra por silueta y que deje el cadáver. Está en la
> §9 de `peticiones.md`.

La especificación del arte está en la §9 de `docs/art/peticiones.md`:
- `assets/unidades/<id>/d0` … `d7`: un atlas de 6 filas por dirección (`idle`,
  `walk`, `charge`, `attack`, `hurt`, `death`), con celda de 384, pies en y=342 y
  `cadaver: { clip: 'death', frame: 6 }`.
- La numeración de direcciones está en `tools/taller/direcciones.ts`: 0 de frente,
  2 derecha, 4 espalda, 6 izquierda.
- No se debe espejar, porque con la luz fija el espejo la trae del otro lado.
- La sombra va por silueta (`proyeccionDeSombra()`) en lugar del óvalo de
  `sombra.ts`.
- Al morir, se deja en la casilla el fotograma `cadaver`.
- El `atlas.webp` raíz (una dirección, 3 filas) se queda para lo que ya lo lee.

Contexto que ya hay en `main`:
- La mirada se decide en **ocho sectores** en `src/client/direccion.ts`.
- `espejadoPara` es la traducción temporal al arte de perfil. CLAUDE.md, en «La
  arena», dice: «El arte de perfil es temporal (decisión del usuario: “tendrá las 8
  direcciones”): cuando llegue, cambia esa traducción y la regla no».
- `render/personajes.ts` registra las hojas de `assets/unidades/` a demanda
  (`registrarHojaDeUnidad`).

## Criterios de aceptación

1. **Unidades con 8 direcciones**: toda unidad que tenga `d0`…`d7` en
   `assets/unidades/<id>/` se pinta, allí donde se pintan esas hojas (arena y lo que
   las use), con el atlas de la dirección en la que mira. La dirección la decide la
   regla de los ocho sectores que ya existe. Al andar mira a la casilla siguiente,
   al golpear mira al objetivo y, estando quieta, mantiene la última dirección.
2. **Espejo**: esas unidades no se espejan nunca. Las unidades sin `dN` siguen como
   hoy, con el atlas raíz y espejadas.
3. **Animación**: se usan las 6 acciones, incluida `charge` en el tramo que acaba
   en una carga y `hurt` al recibir un golpe.
4. **Cadáver**: al morir, la unidad deja en su casilla el fotograma `cadaver` hasta
   el final de la batalla.
5. **Sombra**: las unidades con 8 direcciones proyectan su sombra por silueta con la
   luz del contrato (`ARTE.luz`). Las demás siguen con su sombra de hoy, salvo que
   pasar todas a silueta sea más simple y no se vea peor.
6. **Sin arte**: si falta el arte de una dirección o no ha cargado, la unidad cae al
   atlas raíz o al marcador y no rompe nada (contrato «se juega sin arte»).
7. **Verificación**: `pnpm verify` en verde, `pnpm banco` con el ancla igual (esto es
   solo cliente) y `pnpm capturas` sin errores. Además, una comprobación en el
   navegador de la arena con los templarios: se mueven en varias direcciones,
   golpean, mueren y dejan su cadáver. Las capturas se guardan en la carpeta de la
   tarea.

## Fuera de alcance

- Generar arte nuevo o pedirlo.
- Dar 8 direcciones a las criaturas del catálogo del juego (caballeros y
  nigromantes) que aún no tienen hojas `dN`.
- Cambiar reglas del núcleo. La dirección la guarda el animador, nunca el núcleo
  (CLAUDE.md).

## Preguntas abiertas

- Si las criaturas del juego en el mapa de aventura o en batalla usan ya alguna hoja
  de `assets/unidades/`, entran también. Por defecto: sí, allí donde se use la hoja.
- Si las ocho direcciones se cargan todas al montar la unidad o a demanda. Por
  defecto: lo decide el arquitecto midiendo el peso.

## Corrección del usuario tras el primer plan (03-10-2026)

> La imagen por defecto deberia ser el y_bot, el arte antiguo se elimina. Todas
> tienen 8 direcciones porque por defecto es el y_bot que las tiene, y todas las
> animaciones.

Lo que cambia respecto a lo de arriba:

- **El respaldo por defecto de cualquier figura es el Y Bot en 8 direcciones y con
  las 6 acciones**, es decir, los renders de `assets/unidades/_poses/<juego>-8d/`
  (`dN-a.png`: idle, walk, charge; `dN-b.png`: attack, hurt, death; 7 × 3 celdas de
  384; `poses.json` con los índices). Ya no lo es el maniquí de una dirección
  `liora-poses-v3`. Toda unidad tiene 8 direcciones: la suya si tiene `dN`, y si
  no, la del Y Bot. El juego de armas del Y Bot de cada unidad sale de lo que ya
  declara el taller (`EN_OCHO_DIRECCIONES` / perfil). Si no declara ninguno, se usa
  `espada-escudo`. El Y Bot se sigue tiñendo del color de su bando.
- **Desaparece el arte antiguo**: no se usa ni se carga, y sus ficheros se borran
  del repo. Entra aquí:
  - el `atlas.webp` raíz de una dirección de cada unidad;
  - el maniquí `liora-poses-v3`;
  - los atlas propios de una dirección (Liora, Doran, guardia, Nara, `combat-actions`);
  - los sprites de perfil que sigan cargándose.

  Con eso **desaparecen también el espejado y `espejadoPara`**.
- **Alcance**: en todas partes donde se pinta una figura, no solo en la arena. Eso
  incluye la batalla de la partida, el espectador, la arena y la figura del héroe en
  el mapa de aventura si usa estas hojas.
- **Respaldo cuando no hay arte**: si un PNG no ha cargado, se pinta el marcador de
  color (contrato «se juega sin arte»). Ya no se cae a un atlas antiguo.
- **Antes de borrar** se enseña al usuario la lista exacta de ficheros y carpetas, y
  quién los lee hoy. Puede haber herramientas del taller que dependan del `atlas.webp`
  raíz o del atlas de Liora.

## Decisiones del usuario sobre el plan (03-10-2026)

- **El borrado se aprueba tal cual** (§5 del plan). Se borra en su propio paso, al
  final, y `pnpm verify` tiene que estar en verde antes y después. Se conservan
  `identidad.webp`, las hojas de procedencia `dN/hoja-*` y `giro`, las `_poses` de una
  dirección y `assets/generated/` (retirar esto último va a una issue).
- **Habrá una tabla de juego de armas para cada criatura del catálogo y para los
  héroes.**
  - piquero → `lanza`;
  - caballería → `montado-lanza`;
  - monje o mago → `baston`;
  - el resto → `espada-escudo`;
  - arqueros y ballesteros → `espada-escudo` hasta que exista un render de arco en
    8 direcciones.

## Ritmo de las animaciones (usuario, 03-10-2026)

> Las animaciones de iddle son demasidado lentas, las de movimiento, el
> desplazamiento, demasiado rapido

- **El reposo va lento.** Hoy `idle` se pinta a 3 fps (`RELOJ` en
  `tools/taller/derivar.ts`). Hay que subirlo a un ritmo natural, del orden de
  8 fps, y verlo en el navegador.
- **El desplazamiento va rápido.** `DURACION.move` son 520 ms para el tramo
  **entero**, sea de 1 casilla o de 6 (`src/client/anim.ts`), así que la figura se
  desliza y sus pies no acompañan a la marcha. Lo que hay que hacer:
  - la duración del tramo pasa a ser **por casilla recorrida**;
  - ese ritmo se calcula para que el paso de la animación `walk` cuadre con lo que
    avanza la figura y no patine. Se mide sobre el Y Bot: cuánto avanza un ciclo de
    marcha a la escala del tablero;
  - lo mismo vale para la carga (`charge`);
  - el héroe en el mapa de aventura también se mueve, y va con el mismo criterio si
    su movimiento se anima;
  - `capturas` y el espectador tienen plazos y ritmo (`ritmo`, finales retenidos):
    se ajustan con cifras medidas, no a ojo.

## Ritmo, tras verlo (usuario, 03-10-2026)

> De velocidad de animacion esta bien, el desplazamiento un poco mas rapido. Y una
> cosa, que no vayan todos a la vez, que tengan un desfase una velocidad de
> animacion ligeramente distinta, con un poco de ruido para que no se muevan todos a
> la vez que hace un efecto de coreografia

- **Los fps de las animaciones no cambian**: el reposo se queda en 8 y el resto
  como esté.
- **El desplazamiento va un poco más rápido** que los ~1,3 s por casilla andando y
  ~0,8 s cargando de ahora. La propuesta es subirlo en torno a un 30-40 %, unos
  0,9 s por casilla andando, aunque los pies patinen un poco. La cifra tiene que
  estar en un solo sitio (`marcha.ts`) para poder afinarla.
- **Sin coreografía**: cada figura lleva un **desfase** de fase y una **velocidad
  de animación ligeramente distinta**, con un ruido de ±8 % orientativo.
  - Se deriva **de forma determinista del id de la figura** (un hash), no de
    `Math.random`. Así `pnpm capturas` y el espectador son reproducibles y una
    figura no cambia de ritmo entre un fotograma y otro.
  - Vale para todas las animaciones en bucle (reposo, marcha, carga) en batalla,
    arena, mapa y castillo.
  - Los clips de un solo uso (ataque, daño, muerte) arrancan cuando ocurren. Su
    fase no se desplaza; como mucho cambia ligeramente su velocidad.
  - Es solo cliente, así que el banco no puede moverse.
