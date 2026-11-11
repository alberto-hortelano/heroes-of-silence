**REENCUADRADA** — la mitad del enunciado ya no tiene sujeto (los tiros), el espectador está casi resuelto, y falta lo más visible: en la partida, el panel canta «Victoria»/«Derrota» antes de que el tablero cuente el último golpe.

# Crítica — panel-durante-la-jugada (#257)

## El problema real

En la **partida**, mientras el tablero cuenta una tanda de jugadas (las de la IA hasta que le toca a la persona, o la última de una batalla), el lateral, la línea de estado y el aviso «Enemigo (N)» enseñan ya el estado de después: quién cae, qué dice el parte, cómo acaba.

## La premisa, afirmación por afirmación

| Afirmación del issue | Hoy |
|---|---|
| «el `↑N` del tablero (`src/client/render/batalla.ts`, `tirosQueQuedan`)» | **Ya no existe.** `render/batalla` es carpeta; `tirosQueQuedan` no aparece en `src/`. Sin munición: `battle/armas.ts:280` («sin munición»), `arena/retoque.ts:401`. Lo dice también el comentario del dueño del 11-11 |
| «que el animador retenga también los tiros (cada `shoot`)» | **Obsoleto.** Lo que lee el estado ahora es la recarga (`views/campo.ts:63`, `batalla/panel.ts:306`) y las granadas (`views/campo.ts:68-75`), no tiros |
| El animador retiene vida y quién actúa | **Cierto, y más.** `batalla/anim.ts`: `vidaVista`/`porContar` (:610, :718-720), `caidas` (:671), `porAparecer`, `actor` (:629), y una foto de efectos `efectosLeidos` (:619) |
| El panel «En el campo» lee el estado final | **Cierto.** `batalla/panel.ts:168` pinta `listaDelCampo(battle…)` con `batallaALaVista`; `views/campo.ts:38` filtra por `count > 0` del estado, así que quien va a caer desaparece antes del golpe. Igual el parte (`panel.ts:169`), la ronda (`:165`) y la ficha de la activa (`partida/batalla/panel.ts:36`, «Efectivos») |
| `contandoAun` solo apaga los botones en la partida | **Cierto.** `panelDeBatalla` lo usa solo en `fieldsetApagado` (`panel.ts:136`) y en el despliegue (`:126`) |
| **No lo dice el issue: el final** | `panel.ts:119` devuelve `p.final(...)` **antes** de mirar `contandoAun`. En la partida (`partida/batalla/panel.ts:29`, `finalDeLaBatalla`) sale «Victoria»/«Derrota» con el parte entero mientras se anima el golpe que decide. Y `sesion-de-batalla.ts:378` pone «La batalla ha terminado.» en el estado, que `partida/dibujo.ts:174` escribe en cuanto llega |
| `enemigosFuera` lee el final | **Cierto, en pequeño.** `batalla/escena.ts:491-503`: la posición es la del animador, pero `isAlive(st)` y `st.count` son del estado, y con `battle.finished !== null` devuelve cero de golpe (`:496`). Solo se ve en el móvil (`partida/dibujo.ts:214`) |
| «hoy dice “Contando la jugada…” en la arena» | **Cierto.** `arena/paneles/batalla.ts:234-237`: calla el panel entero mientras cuenta, final incluido |
| «Solo afecta a la partida y al espectador» | **Media verdad.** El espectador ya va acotado: el servidor manda un fotograma por acción (`server/partida.ts:310-314`), el telón no aplica el siguiente mientras el animador cuenta (`espectador/telon.ts:69-80`) y el panel quita el final con `sinElFinal` (`espectador/paneles.ts:152, 176-183`). Le queda un desfase de **una** acción (la baja de la acción que se anima sale en «En el campo» antes del impacto). La partida, en cambio, aplica la IA de golpe hasta el turno de la persona (`sesion/batalla/control.ts:351-372`), cortando solo en un cuerpo a cuerpo contra la persona (`sesion-de-batalla.ts:364-375`): el desfase son varias jugadas |

## El día después

- Para quien juega: deja de leer en el lateral «Derrota» o «Esqueleto cae» antes de verlo. Es un fallo de lo que se ve, no de jugabilidad: entra en lo que CLAUDE.md sí manda probar.
- Puertas que cierra: si se elige callar el panel como la arena, la partida se queda sin «En el campo» ni parte durante cada turno de la IA (segundos, varias veces por batalla); si se elige retener, el animador pasa a ser la fuente de lo que el panel enseña y cada cifra nueva del lateral tendrá que pasar por él. Las dos son defendibles; la elección es del arquitecto, pero tiene que quedar escrita con su porqué en `docs/areas/batalla.md`.
- Lo que nadie borrará: si cada página resuelve el «mientras cuenta» a su manera, quedan tres (callar en la arena, `sinElFinal` en el espectador, lo nuevo en la partida). `panelDeBatalla` es ya común a partida y arena (`panel.ts:1-12`, R2): lo nuevo no debería ser una cuarta copia.
- No contradice ninguna decisión de CLAUDE.md. Toca la puerta «La batalla contada en cola» (`BattleAnimator`). El marcado del panel está anclado byte a byte en `test/fixtures/paneles.txt` (`panel.ts:112-114`): si cambia, se re-ancla y se dice qué cambió.

## Conflictos

- **#253 + #264** (previsión y barra): tocan la barra de estado del tablero, no el lateral. Sin contradicción; posible roce de fichero en `batalla/escena.ts` si los dos lo editan. Fusionar después de uno y rebasar.
- **#202** (crónica, en QA): su implementación toca `espectador/paneles.ts` (la crónica, no `batalla()`). Si esta tarea se mete en el espectador, choca de fichero; razón de más para dejar el espectador fuera.
- **#246, #283, #284**: sin relación.
- Sin dependencia oculta: nada de la cola necesita esto antes.

## Coste contra valor

Pequeño-medio: un fichero de panel común, el aviso del móvil y un test que muerda. El valor es real para lo que se ve (el final adelantado es lo más feo, y no estaba en el issue). No hacerlo nunca: el juego funciona, pero cada batalla de la partida se «destripa» en el lateral. Vale lo que cuesta si **no** se infla con el espectador ni con tiros.

**Qué no debería hacerse**: retener tiros o reintroducir un contador de munición; tocar el telón del espectador; cambiar la conducta de la arena salvo que salga gratis de la solución común.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación (reencuadrados por la crítica)
>
> El `↑N` de tiros ya no existe (sin munición desde el 13-10): no se retienen tiros. Lo que queda es la **partida**.
>
> 1. **El final no se adelanta.** Mientras el tablero de la partida cuenta (`batalla.ocupada`), el lateral no enseña «Victoria»/«Derrota» ni el parte del final, y la línea de estado no dice «La batalla ha terminado.»; salen cuando el tablero cuenta el último golpe. Test que muerde: una batalla que acaba por una jugada (de la IA o de la persona), panel con `contandoAun` sin el final; con `contandoAun` falso, con él.
> 2. **Nada de después de lo contado en el lateral.** Mientras cuenta, «En el campo» no quita a quien aún no se ha visto caer ni enseña recarga, granadas o efectos que trae una jugada aún no contada; el parte no trae líneas de jugadas no contadas; la ronda no salta antes de tiempo. Si se calla en vez de retener (como la arena), se calla entero y se dice qué se enseña en su lugar. La elección, con su porqué y fecha, en `docs/areas/batalla.md`.
> 3. **El aviso «Enemigo (N)» del móvil** (`enemigosFuera`) no descuenta a un enemigo antes de verlo caer ni se vacía en cuanto el estado trae el final.
> 4. **Una sola regla para el «mientras cuenta»** en `panelDeBatalla` (partida y arena); la arena puede seguir callando, pero no por una copia aparte si la regla común la cubre. Si cambia `test/fixtures/paneles.txt`, se re-ancla diciendo qué cambió.
> 5. **El espectador queda fuera** (ya acotado a una acción por el telón y `sinElFinal`); no se toca `espectador/`.
> 6. Navegador (Playwright sin pantalla): una partida en la que la IA juega varias jugadas seguidas y otra que acaba por un golpe; capturas del lateral durante la cuenta y al acabar.
