**REENCUADRADA**: el issue pide «decidir», y el código ya lo decide. La razón de #158 d nunca fue que «Continuar» tuviera que salir pronto, sino arreglar el doble clic que eso causaba. Desde #257 es lo único de la partida que adelanta el final. Hay que esperar a que el tablero acabe, con criterios cerrados.

# Crítica: continuar-tras-el-tablero (#341)

## El problema real

En la batalla de la partida, mientras el tablero cuenta el golpe que decide, la barra de acciones cambia «Resolver sola» por «Continuar». Eso avisa de que ese golpe acaba la batalla, aunque el lateral y la línea de estado callan hasta verlo.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| «Continuar» sale en cuanto el estado trae `finished` | **Cierto.** `partida/paneles.ts:162-164` mira solo `batallaALaVista.finished`. No mira `contandoAun`, aunque lo recibe (`:143`) |
| Lo decidió #158 d | **A medias.** `docs/historia.md:796-800` no lo decide: lo da por hecho («El botón sale en cuanto la batalla termina, con la última muerte aún contándose»). El fallo era otro: la puerta de los gestos rechazaba el clic con el aviso de espera y había que pulsar dos veces. El arreglo fue atender el clic antes de esa puerta (`reparto-del-clic.ts:65`, `'al-acabar'`) y esperar a que se vaciara la cola (`batalla/escena.ts:243-250`, `alAcabar`). Ese día el lateral también cantaba «Victoria» en el acto, así que no había nada que destripar. **La razón no sigue en pie**: #257 congeló el lateral (`docs/areas/batalla.md:331-347`) y «Continuar» se quedó solo |
| Lo defiende `test/escenas.test.ts` hacia la línea 594 | **Ha cambiado de línea.** Es la `:658`, «“Continuar” no se apaga con la jugada contándose: espera él solo (#165, #158 d)». Afirma `data-action="finish-battle"` con `ocupada` verdadero. Las de `:404`, `:432` y `:675` prueban el mecanismo de espera, no cuándo sale el botón |
| Destripa el desenlace | **En pequeño.** El botón no dice quién gana, porque eso lo calla el lateral (`escenas.test.ts:597-641`). Sí dice que el golpe que se está viendo es el último |
| El cliente repinta las acciones al acabar la cuenta | **Cierto.** `partida/dibujo.ts:140` repinta cuando cambia `contando`, y `:157` pinta `renderActions(session, contando)`. Esperar no necesita ningún fotograma nuevo |
| Fuera de la partida | La arena no tiene «Continuar» y su rótulo ya calla contando (`arena/paneles/batalla.ts:55`, «Contando…»). El espectador va con su `sinElFinal` (`espectador/paneles.ts:172-183`). Ninguno de los dos está afectado |

## El día después

- **Para quien juega**: ve caer el último golpe y después aparece «Continuar», a la vez que «Victoria» o «Derrota» y «La batalla ha terminado.». Pierde algo pequeño: ya no puede pulsar antes y dejar el clic en cola, que hoy espera de todos modos (`clic.ts:40-48`). No pierde ninguna forma de saltarse la animación, porque esa forma no existe.
- **Lo que queda sin uso**: la rama de espera de `alAcabar` (`escena.ts:186-191`, `pendiente`) y lo que cuenta su comentario y el de `reparto-del-clic.ts:14`. Ya no se llega a ella, porque el botón solo existe con la cola vacía. Puede quedarse como cinturón o borrarse con sus tests (`:404`, `:675`). Decidirlo es del arquitecto, pero los comentarios que dejarían de ser verdad («Continuar sale con la última muerte aún contándose») hay que corregirlos.
- **Lo que hay que reescribir**: el test de `:658` se invierte. La línea «“Continuar” sigue saliendo en cuanto el estado termina (#158 d)» de `docs/areas/batalla.md:345` y la entrada de `docs/historia.md:796` se completan con fecha.
- **CLAUDE.md**: no contradice nada. La regla común del «mientras cuenta» es `panelDeBatalla`, y el guardia de #257 (`invariantes-cliente.test.ts:514-538`) solo mira `partida/batalla/` y la arena. No vería un `contandoAun &&` en `partida/paneles.ts`, de modo que lo nuevo puede quedar como una regla aparte que nadie vigila.

## Conflictos

- **#334 + #338** (contrato de batalla, servidor), **#336** (ruta, `sesion/partida/marcha.ts`), **#335** y **#340** (mapa, motivos): no tocan el cliente de batalla. No hay choque.
- **#303** (dueños en la vista): toca los paneles del espectador y quizá el lateral del mapa (`renderSide`). Puede rozar `partida/paneles.ts`, pero en otra función (esta tarea solo toca `renderActions`). Si los dos lo editan, se rebasa uno sobre el otro. No hay contradicción.
- **#342** (previsión de la batalla, en la cola pero no en esta tanda): toca la barra y la previsión, no las acciones. Sin choque.
- No contradice #165: los botones apagados siguen en su sitio, siempre que no se cambie el contenido de la barra contando (ver abajo).

## Coste contra valor

Coste pequeño: una condición, un test invertido que se ve morder, comentarios y dos líneas de documentación, y una comprobación en el navegador. Valor pequeño pero real, porque cierra lo que #257 dejó a medias. Sin esto, la regla «el final no se adelanta» tiene una excepción visible en cada batalla que gana o pierde un golpe. Si no se hiciera nunca, el juego funciona igual y solo queda la incoherencia. Por este precio vale la pena.

**Qué no debería hacerse**:
- Enseñar «Continuar» apagado mientras se cuenta: el rótulo sigue destripando.
- Tocar la arena o el espectador.
- Añadir una forma de saltarse la animación con «Continuar».
- Volver a abrir lo que #257 decidió del lateral.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación (reencuadrados por la crítica)
>
> Decidido: «Continuar» espera a que el tablero cuente el último golpe. #158 d no lo eligió así; arregló el doble clic que causaba (`docs/historia.md`, «“Continuar” pedía dos clics»), y desde #257 era lo único de la partida que adelantaba el final.
>
> 1. **«Continuar» no sale mientras se cuenta.** Con la batalla terminada y `EscenaBatalla.ocupada`, la barra de acciones de la partida no lleva `finish-battle`, ni encendido ni apagado. Lleva lo que llevaba antes de esa jugada, con los botones apagados en su sitio (#165). Con la cuenta acabada, «Continuar» sale en el mismo fotograma que «Victoria»/«Derrota» en el lateral. Se invierte `test/escenas.test.ts` («“Continuar” no se apaga con la jugada contándose») y se ve morder quitando la condición.
> 2. **Un clic basta.** Pulsar «Continuar» en cuanto sale vuelve al mapa, o abre lo que sobra (`abrirLoQueSobra`), sin aviso de espera ni segundo clic. Siguen en verde los tests de #158 d de `escenas.test.ts` que se conserven; si se borra la espera de `alAcabar` por quedarse sin uso, se borran sus tests y se dice por qué.
> 3. **Se corrige lo que deje de ser verdad**: los comentarios de `batalla/escena.ts` (`pendiente`) y `partida/reparto-del-clic.ts` (`al-acabar`), `docs/areas/batalla.md` («“Continuar” sigue saliendo…») y la entrada de #158 d en `docs/historia.md`, con fecha.
> 4. **Fuera**: la arena (no tiene «Continuar» y su rótulo ya calla contando), el espectador (`sinElFinal`), el lateral (#257) y cualquier forma de saltarse la animación.
> 5. **Navegador** (Playwright sin pantalla): una batalla de la partida que acaba con un golpe. Una captura de la barra de acciones durante la cuenta (sin «Continuar») y otra al acabar (con él), y un solo clic que vuelve al mapa.
