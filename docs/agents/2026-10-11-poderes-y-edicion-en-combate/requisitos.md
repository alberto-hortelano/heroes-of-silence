# Poderes activos de unidad y edición en combate (arena)

## Petición literal

Tras explicarle que el monje de la arena no tiene ningún poder utilizable
(las `habilidades` de `UnidadDeArena` son inertes y solo el héroe lanza hechizos),
el usuario preguntó primero:

> «Como se usa un poder del monje?»

y luego pidió:

> «Abrelo y haz que pueda modificar los personajes durante el combate, en el menu de la derecha con un boton que abra el panel de edicion»

(«Ábrelo» = abrir el trabajo del motor de habilidades activas que se le propuso:
que el monje pueda lanzar algo él mismo, curar a un aliado o bendecir.)

Respuestas del usuario a las preguntas del coordinador (11-10-2026):

- Poderes: **Curar y Bendecir** (no solo Curar, no todas las activas).
- Editar a mitad de combate afecta **al tipo entero**, como la ficha del montaje.
- Alcance: **solo la arena**. Las habilidades del juego siguen inertes.

## Criterios de aceptación

### A · Poderes del monje

1. En la arena, una unidad con la habilidad **Curar** puede, en su turno y si la
   mueve la persona, elegir «Curar» y un aliado vivo herido: el aliado recupera
   PV (sin pasar de su máximo) y el turno de la unidad se cierra.
2. Igual con **Bendecir**: elige un aliado vivo y le aplica el efecto de
   bendición (el de `bless` de `data/spells.json`, «suerte +1», o el que decida
   el arquitecto declarándolo), con duración en rondas y la regla de «dos efectos
   del mismo origen refrescan, no se acumulan».
3. La hoja `templario-monje` sale por defecto con Curar y Bendecir (o la unidad
   de perfil `baston`, según decida el arquitecto), y la ficha deja de decir «sin
   efecto todavía» para las habilidades que sí tienen efecto. Las demás siguen
   declaradas como inertes.
4. Cuando la unidad la lleva la IA, la IA de batalla usa también los poderes
   (curar a un aliado herido cuando compense, bendecir); `enfrentamiento.ts` no
   tiene por qué cambiar si las unidades del juego no tienen poderes.
5. Una acción ilegal (objetivo enemigo, muerto, sin herida para Curar, fuera de
   alcance si lo hay, tras moverse si la regla lo prohíbe) la rechaza un
   `*Blocker` del núcleo con un motivo para la persona; la barra lo enseña.
6. La cantidad de Curar y la duración de Bendecir son cifras de la unidad o de
   datos, **declaradas inventadas** en su `_comment`; editables en la ficha si
   el arquitecto lo ve razonable.
7. El panel de la batalla y la previsión enseñan qué hará el poder (cuánto cura;
   a quién bendice). El registro de la batalla cuenta el uso del poder.
8. Las batallas del juego (mapa) no cambian: `pnpm banco` con el mismo hash.

### B · Editar en combate

9. Durante una batalla de la arena, el panel de la derecha (`#side`) tiene un
   botón que abre el panel de edición de la unidad (sus cifras, como la ficha del
   montaje: ataque, defensa, daño, PV, rasgos, habilidades…).
10. Cambiar una cifra cambia el **tipo entero**: todas las unidades vivas de ese
    tipo en la batalla (las dos caras, si las hay) y el borrador / la prueba de
    catálogo para la siguiente pelea, como hace hoy la ficha del montaje.
11. El cambio se nota en la batalla en curso a partir de ese momento (siguiente
    golpe, previsión, panel). Qué pasa con los PV actuales al cambiar los PV
    máximos lo decide el arquitecto y lo dice la interfaz.
12. Cerrar el panel devuelve a la batalla tal como estaba (turno, selección).
13. Se puede editar también el héroe del bando si lo hay (su ficha).
14. Fail-loud: un valor que no valida no entra y se dice (como en el montaje).

## Fuera de alcance

- Habilidades activas que no sean Curar y Bendecir; las pasivas y automáticas
  siguen inertes.
- Que las criaturas del juego (mapa, IA estratégica, agente MCP) usen poderes.
- Cambiar las reglas de la batalla del juego.
- Arte nuevo (animación de lanzar): se usa la acción que haya (`attack` o la del
  hechizo).

## Contexto

- El selector Yo/IA de la arena acaba de pasar a ir **por bando** (sin commit, en
  el árbol de trabajo: `src/client/arena/{main,paneles}.ts`, `arena.css`,
  `test/arena.test.ts`, `test/muralla-alta.test.ts`, `tools/qa/capturas.ts`).
  No se deshace.
- `data/habilidades.json` es GENERADO desde `NuevaJugabilidad.md` (no se edita a
  mano). Tiene «Curar (X)» como activa; **«Bendecir» no está** (está
  «Bendecido», pasiva). Cómo nombrar Bendecir sin teclear un nombre falso en el
  catálogo generado es una pregunta para el crítico/arquitecto.
- El héroe ya lanza `cure` y `bless` (`battle/spells.ts`); reutilizar sus efectos
  es lo natural (Un hecho, un sitio).
- La arena es `SesionDeArena` en `session.ts`; reglas por pelea en
  `battle/reglas.ts`. El enlace `?montaje=` lleva las unidades: si los poderes
  son cifras de la unidad, viajan con ella.
- Máquina compartida: presupuesto de pruebas del CLAUDE.md.

## Preguntas abiertas (con suposición por defecto)

- ¿Curar tiene alcance (adyacente) o es a distancia? → a cualquier aliado, como
  el hechizo del héroe, salvo que el arquitecto vea mejor adyacente.
- ¿Usos por batalla o recarga? → una vez por turno, sin límite por batalla,
  declarado inventado.
- ¿Se puede usar tras moverse? → no, como disparar (regla nuestra del turno).
- ¿Editar en combate se permite en el turno de la IA? → sí, el panel está
  siempre; el cambio entra antes de la siguiente jugada.
