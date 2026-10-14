# Hallazgos de QA: las cinco tareas de la arena juntas (14-10-2026)

Los informes de QA están en `docs/agents/2026-10-14-<tarea>/qa.md`, con sus capturas en `capturas/`:

| Issue | Tarea | Veredicto |
|---|---|---|
| #258, #261, #263 | `rueda-anillo-y-efectos` (cubre también `rueda-sectores-y-contrincantes`) | apto con reservas |
| #259 | `salir-del-contacto` | apto |
| #260 | `carga-para-todos` | apto |
| #262 | `armadura` | **hallazgos** |

Los hallazgos están deduplicados y cada uno lleva la decisión del coordinador.

**Reglas**:

- El juego no cambia: `pnpm banco` debe dar `066767b4…af995`.
- Lo que se toque de la IA tiene que dar lo mismo cuando no hay armadura. Las unidades del juego no tienen, así que el banco no se mueve.

## Importantes

### Q1. La IA elige blanco sin mirar la armadura (#262, criterio 4)

`bestTarget` (`src/core/ai/tactics.ts:~89`) puntúa la amenaza entre los PV sin el daño que llega. Lo usan el disparo y el golpe a quien ya alcanza. Desde #262 el jinete con barda tiene 80 PV, y la IA lo ve como el blanco más rentable.

Ejemplo, en 40 semillas: un goblin dispara al jinete con barda 40 de 40 veces, con 0 de daño medio. Antes disparaba al monje, con 14,9 por tiro.

**Arreglo**:

- La puntuación del blanco cuenta el daño que de verdad llega tras la armadura, a partir de `expectedDamage` o `trasLaArmadura`.
- Sin armadura tiene que salir exactamente el mismo número que hoy, para que el banco no cambie. Por ejemplo, un factor que solo existe cuando `armaduraDe(objetivo) > 0`.
- Test: el caso del goblin, que ahora dispara al monje, y el banco igual.
- Es la única excepción a «no se toca la IA», porque la pide el criterio 4 de la armadura.

### Q2. Un enlace viejo con el kit de siempre se abre sin aviso (#262)

Un enlace hasta la versión 8 con la brigantina, el arnés o la barda del kit se abre en silencio. Pero pelea otra pelea: el templario pasa de 150 PV a 80 y 7 de armadura.

**Arreglo**:

- Al leer un enlace de la versión 8 o anterior, si alguna unidad lleva una pieza de la arena que antes daba PV y ahora da armadura, sale un aviso con lo que cambia, por ejemplo: «Desde la versión 9 las armaduras de la arena dan armadura y no PV: el Guerrero con escudo tiene 80 PV y 7 de armadura (antes 150 PV)». Va en el mismo recuadro de avisos de lectura.
- El borrador del usuario no lleva versión y **no** avisa. Es el mismo cambio de regla que pidió el usuario, y se ve en la ficha.

## Menores, se arreglan

### Rueda

- **R1 (#258)**. El «ⓘ» de cada sector, de unos 13×13 px en la esquina de fuera, es un hueco muerto: no enciende el sector ni lo elige. Lo que se quiere:
  - con ratón, pasar por el «ⓘ» enciende su sector y abre la nota;
  - un clic de ratón en él elige el sector;
  - en una pantalla táctil, tocarlo abre la nota, como hoy.

  O se mueve el «ⓘ» donde no quite superficie. Lo decide el ingeniero. La pasada de capturas `rueda-contrincantes` mide la rejilla con el «ⓘ» incluido.
- **R2 (#263)**. Tras la Finta nada explica el tramo: la barra se queda vacía y la ayuda invita a golpear. Hace falta una línea en la barra o el panel: «Finta: puede andar N casillas; andar termina el turno».
- **R3 (#263)**. Antes de elegir no se ve cuánto baja R. guardia el contraataque. En la fase golpe, la nota o el sector de R. guardia dicen en cuánto quedaría el contraataque del rival con cada éxito, o al menos con el del cruce medio. Sale de `previsionDeLaRueda` (el núcleo ya lo calcula).
- **R4 (#261)**. En la ficha de solo lectura, «✎ Editar», las «×» y los desplegables parecen vivos aunque están apagados. Hay que darles el aspecto de apagados, o quitarlos de la ficha de solo lectura.
- **R5 (#260)**. En la rueda, «48–91 + 4–16» se sale del sector de Rápido y se come un dígito. Tiene que caber, o partirse en dos líneas dentro del sector, en escritorio y en móvil.
- **R6 (#260)**. La rueda que se abre tras una carrera no dice que sus cifras ya llevan la carga. Hace falta una línea en la cabecera o el pie: «con la carga de N casillas (+X %)». Con Escape, la barra dice «Golpe cancelado: se pierde la carga».

### Armadura

- **A1**. La barra de un hechizo resta la armadura, pero no lo dice: tiene que poner «−7 armadura», como el golpe.
- **A2**. «0 de daño: lo para la armadura (11)» se lee como si 11 fuera la armadura. Hay que decirlo claro, por ejemplo «0 de daño: la armadura (22) para los 11».
- **A3**. «Duplicar» una pieza del juego con PV la convierte a armadura en silencio: el Talismán vital pasa de +50 PV a +5 de armadura. Tiene que salir un aviso en el editor.
- **A4**. La frase de una pieza que queda con 0 de armadura suena rara. Y el editor no pone tope a la armadura: `1e3` entra como 1000. Va un tope razonable, validado en `validarPiezaDeArena`: el de las demás cifras de pieza, o 99.
- **A5**. El final de la Armadura en la tabla de cifras no lleva el tono de «cambia» (`paneles.ts:~905`).

### Contacto y carga

- **C1 (#259)**. Con un `?contacto=` o un `?golpe=` mal escrito, o repetido, junto a un `?montaje=`, la barra dice «la semilla o las reglas del enlace no valen». Tiene que nombrar el parámetro que falla (`montarDelEnlace`, `arena/main.ts`).
- **C2 (#259)**. Rodeado, la ayuda sigue diciendo «Haz clic en un hexágono verde» y no hay ninguno. Tiene que decir lo de `contactoBlocker`, o callar esa línea.
- **C3 (#260)**. La ayuda de la carga pone siempre «»3» de ejemplo, también con el jinete. Tiene que sacar el ejemplo de las cifras de la unidad, o no poner número.

### Barra

- **B1**. La barra de abajo crece 1 px cuando la previsión ocupa dos líneas, y con el «−N armadura» pasa más. Con el puntero en la frontera entre dos casillas, la casilla elegida oscila y el clic golpea desde la otra: la barra prometía cargar y el golpe salió sin carga.
  - La barra reserva su alto, para que el lienzo no se mueva al cambiar el texto.
  - Si el fallo es otro, por ejemplo que el clic usa una casilla distinta de la que enseña la barra, se arregla en la raíz: el clic usa la casilla que se enseña.

## No se tocan (con motivo)

- **Con Rápido, el segundo golpe cambia de arma**: el primero va con la lanza y la carga, y el segundo con la espada. Es «cada arma para lo suyo», decidido por el usuario: la lanza es solo para cargar. Se le dirá al usuario.
- **El guerrero con escudo anda 3 casillas y casi nunca está a 4 en recta**: es la regla que pidió el usuario (la recta de al menos 3 casillas). Se le dirá.
- **Las peleas con muralla de 3 contra 3 duran entre 54 y 85 rondas**: es de la IA del asalto y es anterior a estas tareas.
- **La previsión del hechizo de A1, si exige rehacer `PrevisionDeLanzar`**: va lo mínimo que diga «−N armadura».

## Cómo se cierra

- `pnpm verify` una vez por tanda.
- Al final, `pnpm banco` (mismo hash) y `pnpm capturas` con las pasadas de la arena (`CAPTURAS_SOLO`) que cubran lo tocado.
- `implementacion-qa.md` en esta carpeta.
- Un commit al final.
