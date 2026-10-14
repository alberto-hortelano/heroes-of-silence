# Cambio: primero se anda, luego la rueda (13-10-2026)

## Lo que dice el usuario

> El combate se debe resolver despues de mover, ahora sale primero la rueda y luego se mueve

Lo que decidió al preguntarle:

- **Orden: andar → elegir → golpe.** La unidad llega a su casilla y solo entonces se abre la rueda.
  Vale también para la respuesta de la persona cuando ataca la IA: el atacante de la IA anda, y al
  llegar se abre la rueda de respuesta. Luego vienen el desenlace y el golpe.
- **Escape con la unidad ya en su sitio: sí.** Cancela y la unidad se queda donde llegó, como si
  hubiera andado un tramo. Sigue su turno desde allí y pierde la carga de esa carrera.

## Diseño (del coordinador)

### Núcleo

1. **`BattleState.golpeEnCurso`** es `{ stack, target, carga } | null`. Siempre vale `null` en
   `'azar'` y en el juego.
   - Es lo que se ve: quién se ha plantado ante quién y con qué carga.
   - **El golpe que ya ha elegido la IA o la primera persona no va aquí**: sigue en la sesión, a
     ciegas para el otro, como ahora.
   - Lo crea `crearBatallaConReglas`.
2. **Con la rueda, un `attack` sin `golpe` ni `respuesta` es «plantarse»**:
   - comprueba lo de siempre (`golpePreparado`, con `from`);
   - calcula la carga **antes** de andar;
   - anda si hay `from` (`moveTo`);
   - escribe `golpeEnCurso`;
   - **no** cierra el turno, ni siquiera si el movimiento agota las casillas;
   - no escribe todavía ningún `cruce`.

   Sin `from` (el enemigo ya está al lado) solo escribe `golpeEnCurso`.
3. **Con `golpeEnCurso` puesto**, la única jugada que vale es el `attack` con `golpe` y
   `respuesta` contra ese mismo `target` y sin `from`.
   - Usa la `carga` guardada, escribe `cruce`, hace `melee`, cierra el turno y limpia
     `golpeEnCurso`.
   - Cualquier otra jugada lanza con un motivo para la persona, con un `*Blocker`, por ejemplo
     «elige en la rueda o cancela el golpe».
   - `legalActions` lo refleja.
4. **`soltarElGolpe(state)`**, exportada desde `battle.ts` y llamada solo por la sesión, deja
   `golpeEnCurso` en `null`.
   - La unidad sigue activa donde llegó, con lo que le quede del turno (tramos).
   - Pierde la carga.
   - Si ya no le queda nada que hacer (`quedaAlgoQueHacer`), cierra el turno, igual que hace el
     `move` que agota.
5. **El `attack` completo de un golpe** (con `from`, `golpe` y `respuesta` y sin `golpeEnCurso`) se
   sigue admitiendo de una vez. Es lo que usan `autoResolve` y la IA contra la IA. El orden de los
   hechos pasa a ser `move` → `cruce` → `attack`, el mismo que en dos pasos.
6. **La carga va en el `move`.**
   - El hecho `move` gana `charge?: true` cuando ese tramo es una carrera de carga. Lo escribe el
     núcleo, que la conoce, en los dos modos.
   - El animador deja de deducirla mirando el paso de al lado (`cola.at(-2)`, `nuevos[i+1]`) y la
     lee del `move`.
   - Se borra el comentario de «la rueda se cuenta antes de andar».
   - El espectador recibe el hecho tal cual; comprueba `adaptar.ts`.
   - El banco no ve el registro de la batalla, así que su hash no debe cambiar: compruébalo.

### Sesión y vista (la arena)

7. **Persona contra IA**: el clic sobre el enemigo aplica «plantarse» enseguida, y la unidad anda.
   - Cuando el animador acaba, se abre la rueda en fase `golpe`.
   - Al elegir: respuesta de la IA, golpe y desenlace.
   - Escape en esta fase: `soltarElGolpe` y la rueda se cierra.
8. **IA contra persona**: la IA elige su jugada y su golpe (`completarCruce`, mismo orden de
   tiradas).
   - La sesión aplica «plantarse», guarda el golpe a ciegas y se para.
   - Cuando el animador acaba, se abre la rueda de respuesta.
   - Al elegir, se aplica el golpe completo y la IA sigue.
9. **Persona contra persona**: plantarse, la rueda del golpe, la rueda de la respuesta (a ciegas)
   y el golpe.
10. **La previsión de la rueda** (`previsionDeLaRueda`) se calcula con la unidad ya en su casilla y
    con la `carga` de `golpeEnCurso`. Después de plantarse, las cifras deben coincidir con las de
    antes de andar.
11. **`pnpm capturas`**: la pasada `rueda-del-golpe` espera a que acabe la marcha antes de buscar
    `#rueda[open]`. Que compruebe:
    - que la figura ya está en la casilla de destino cuando se abre la rueda;
    - que el Escape tras andar deja la unidad allí, con su turno abierto.

## Tests

- **Plantarse**: con `from` anda y deja `golpeEnCurso` con la carga de esa carrera, sin cerrar el
  turno, ni siquiera agotando las casillas.
- **El golpe tras plantarse**: usa la carga guardada, con cifras exactas, contra un golpe de una
  vez con la misma carrera.
- **Con `golpeEnCurso` puesto**: otra jugada lanza con su motivo.
- **`soltarElGolpe`**: deja la unidad allí y el turno abierto; si no queda nada, lo cierra.
- **El orden de los hechos**: `move` (con `charge` si carga), `cruce` y `attack`, en un paso y en
  dos.
- **Al azar**: el registro de una batalla es idéntico salvo la nueva marca `charge` del `move`. El
  hash de `pnpm banco` no cambia.
- **Animador** (`test/anim.test.ts`): la carga se marca desde el `move`, con un `cruce` en medio y
  sin él. `duracionDeLaJugada` sigue cuadrando.
- **Sesión**: los tres casos de 7-9, y el Escape tras andar.
