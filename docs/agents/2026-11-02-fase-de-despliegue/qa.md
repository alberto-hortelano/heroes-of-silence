# QA — fase de despliegue (y la tropa como despliegue)

02-11-2026. Sobre el árbol sin commitear del worktree `troop-battle-ordering-b96a77` (HEAD `3d6922d9` + las
fases A, B, C y el /simplify; el código no cambió después de `implementacion-simplify.md`). No toqué código.

Lo que pidió el usuario, literal: «No puedo ordenar al heroe, no es visual. Añade al combate una fase previa de
despliegue y en tropa, que se vea como en el combate en la fase de despliegue … La vista de tropa pasa a ser la de
despliegue. En un combate el despliegue lo hace primero el atacado, sin los enemigos, y luego el atacante con los
enemigos visibles».

## Cómo lo probé

- **Navegador**: Playwright sin pantalla (el Chromium de `~/.cache/ms-playwright`), contra un `vite` propio en el
  **3211** (arrancado con `set -m` en su línea, PID 264240 = su grupo, `cwd` del que escucha comprobado con
  `readlink`; matado por el grupo y `ss` después: «3211 libre»). El 3100 y el 3196 no se tocaron. Cuatro guiones
  propios en el scratchpad (`qa1` tropa + reclutar + atacar, `qa2` la defensa en cuatro modos, `qa3` la arena,
  `qa4` licenciar + «Resolver sola» en el despliegue, `qa5` la defensa desde una formación guardada), todos desde
  el arranque de la página (`/?seed=N&heroe=…`), con un espejo `Session` solo para saber dónde caen las casillas en
  píxeles y cuándo llega la defensa.
- **Capturas** en `capturas/qa/` (`qa*-…png` mías; `cap-…png` copiadas de `pnpm capturas`).
- **Tests por partes** y una prueba al azar temporal (creada en `test/`, corrida y borrada).

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | La tropa es el tablero de despliegue: casillas, zona marcada, figuras, solo lo propio, el héroe incluido; colocar en una casilla libre de la zona o intercambiar; se guarda; ficha y equipo siguen | ✅ | `qa1-01-tropa.png` (el mismo tablero, fondo, figuras y zona verde que `qa1-06-atacante-despliega.png`; panel con lista, ficha y equipo). Semilla 1: héroe a (2,4) «Aerin del Roble sale en (2,4).»; doble clic en (1,8) lo pone ahí; «Arquero y Aerin del Roble se cambian de sitio.» al pulsar la casilla del héroe con el arquero elegido; Escape y T otra vez: «al volver a abrir, igual: true». `pnpm capturas` pasada `tropa`: «Guerrero con escudo y Aldo de Valdeluz se cambian de sitio», gambesón puesto con doble clic, a 1440, 1280, 1024 y en el móvil (`cap-tropa-movil-escena.png`); sin arte, marcadores (`cap-sin-arte-03-tropa.png`) |
| 2 | La formación sobrevive a reclutar, licenciar, perder a alguien en batalla, recoger la guarnición o cambiar el tope; nunca dos en una casilla ni nadie fuera de zona | ✅ (⚠️ guarnición y tope) | **Reclutar** (morada, +1): `Arquero D (0,4)` cae en un hueco libre, «los de antes, en su casilla: true; repetidas 0» (`qa1-04-tras-reclutar.png`). **Licenciar** (−1 en la base): se va `Arquero C (0,2)`, «cada uno de los que quedan, en su casilla de antes: true (antes 6, ahora 5)» (`qa4-05-tras-licenciar.png`). **Morir**: tras la batalla contra el monstruo caen los dos guardias; «todos en casillas de la formación de antes: true; repetidas 0» (`qa1-08-tropa-tras-batalla.png`). **Al azar** (temporal, borrado): 40 semillas × 40 pasos de `formar` con casillas y puestos al azar (fuera del tablero, (0.5,4), puesto −1 y fuera de rango) mezclados con quitar y añadir tropa: 1 330 `formar`, 1 192 rechazados por `formarBlocker` (y `applyAdventureAction` lanza en cada uno), **0** formaciones con dos en una casilla o alguien fuera de su zona, y 40/40 batallas siguientes salen de la formación. Recoger la guarnición y cambiar el tope: no hay gesto en la partida que lo haga (ver «No probado») |
| 3 | Toda batalla empieza en despliegue: primero el defensor sin ver al enemigo (ni figuras, ni casillas, ni lista), luego el atacante viéndolo; sin turnos hasta acabar | ✅ | **Defensa** (semilla 2, tres «Fin de turno»): `qa2-mirar-01-defensor-sin-ver.png` sin un solo atacante en el tablero; el texto entero de la página no nombra a ninguno de los 4 tipos atacantes ni a la heroína rival («Serena la Pálida»); ningún atributo del DOM lleva «attacker»; la pista «Enemigo ▸» oculta; puntero (centro y cuerpo) y **clic** sobre las 5 casillas de los atacantes: la barra los nombra 0 veces y nadie se mueve; Tab por toda la página recorre solo botones propios. Igual en el móvil (`qa2-movil-01-defensor-sin-ver.png`). Tras «Listo» aparecen y la página los nombra 4/4 (`qa2-mirar-03-tras-listo-0s5.png`). **Ataque** (semilla 1): `qa1-06-atacante-despliega.png`, el monstruo en su sitio y en «En el campo». Sin cola ni turno en el despliegue: Espacio, Escape, Q e Intro no hacen nada («Listo» sigue). Emboscada: `cap-despliegue-01-emboscado.png` (despliega primero, sin ver). Arena Yo contra Yo: el derecho despliega sin ver al izquierdo (`qa3-yo-contra-yo-1.png`; la página no nombra «Guerrero con escudo»), luego el izquierdo viéndolo (`qa3-yo-contra-yo-3.png`) |
| 4 | El bando de la persona despliega desde la formación guardada (o la regla de hoy), retocando igual que en la tropa, y lo cierra con «Listo»; IA, agente y sin dueño, solos | ✅ | Ataque: «sale desde la formación: true» (las 7 casillas de la tropa son las de la batalla). Defensa con formación guardada (`qa5`): héroe a (2,4) y el primero a (1,8) en la tropa → al defender, `♛ Grommash Dientenegro (9,4)` y `Orko con hacha y escudo A (10,8)`, su espejo. Retoque igual: clic, intercambio con el héroe («Grommash Dientenegro y Orko con hacha y escudo se cambian de sitio.»), flechas («(12,4) no es una casilla del tablero.»). «Listo» abre la ronda 1 («¡A la batalla!»). «Resolver sola» en el despliegue (ataque y defensa) cierra la batalla sin errores. La IA y el agente sin pantalla: `pnpm banco` mismo sha y `pnpm qa` en verde (abajo) |
| 5 | Las reglas son del núcleo (zona, orden, casilla válida con su frase, colocar y cerrar); el cliente pinta y manda por `session.ts` | ✅ | Toda frase que vi en la barra es de `colocarBlocker`/`formarBlocker` («(4,4) queda fuera de la zona de salida de Aerin del Roble: las 3 columnas de su borde.», «En (1,4) hay muro.», «Coracero no es del bando que despliega.»). `test/invariantes.test.ts` (65) en verde: «la fase de despliegue la mueve solo `battle.ts`», «la escena y los paneles leen la batalla ya ocultada», «solo importan tipos del núcleo» de `escenas/tropa.ts` |
| 6 | Preparado para infiltración: zona y momento por unidad, con un test | ✅ | `test/despliegue.test.ts`, `describe('preparado para la infiltración…(C6)')`: zona de 5 columnas aceptada donde al vecino se le rechaza, `tras_el_enemigo` en su tanda, la casilla del enemigo oculto cuenta libre y se reasienta al abrir. En verde (abajo). La infiltración misma, fuera de alcance |
| 7 | Muralla de la arena: nadie en un muro ni en una puerta; la zona se recorta como hoy | ✅ (con la desviación dicha) | Yo contra IA con muros en (1,4), (2,4), (9,4), (10,3): clic en (1,4) y (2,4) → «En (1,4) hay muro.» / «En (2,4) hay muro.»; 6 clics rápidos alternando (0,7)/(0,8) dejan a cada uno en una casilla; sin errores (`qa3-yo-contra-ia-*.png`). **Puertas**: siguen valiendo para salir, como en HEAD (la desviación de la fase A, aceptada por el coordinador); no la cuento como fallo |
| 8 | El espectador ve el despliegue o, como poco, no se rompe | ✅ (como poco) | `pnpm capturas` pasada `espectador`: «1 final(es) de batalla vistos, 23 turnos de batalla», el fin de partida a tiempo, sin errores (`cap-espectador-02-batalla.png`). Las batallas del servidor no despliegan a mano: no hay despliegue que ver. `test/espectador.test.ts` (22) en verde |
| 9 | `pnpm banco` mismo sha; `pnpm qa` en verde | ✅ | `sha256: e48a2f0f868d90e534eebf79aeff9fa8c196a0379323ed5c7ae99634deb648e0`, «ancla: igual», 0/20 sin terminar. `pnpm qa` sale 0: «batallas del agente: 1, 26.0 peticiones de batalla por batalla (21.0 turnos y 5.0 respuestas)» |
| 10 | typecheck, lint y tests de lo tocado; navegador: tropa, defensa, ataque, arena | ✅ | `tsc --noEmit` sale 0; `Checked 513 files … No fixes applied. Found 10 infos.` (las de siempre). Tests y navegador, abajo |

### Tests (por partes, con su porqué)

`pnpm vitest run` de `despliegue`, `formacion`, `despliegue-en-escena`, `tropa-en-escena` (lo nuevo y lo que la tropa
y la batalla pintan y pulsan), `invariantes` (las puertas), `espectador` (`BattleState` y `OrigenDelStack.salida` por
el cable), `paneles` (el panel del despliegue y de la tropa), y `rueda-contrincantes`, `escenas`, `session`, `anim`
(para confirmar los rojos conocidos): **8 rojos | 270 verdes**, y los 8 son exactamente los de HEAD. Lo comprobé en un
worktree limpio de `3d6922d9` (`node_modules` enlazado, borrado después): `rueda-contrincantes`, `escenas`, `session`
y `anim` dan **los mismos 8 nombres** (2 de `rueda-contrincantes`, 4 de «la batalla en el lienzo», «cuando golpean a
la persona… no se cancela» y «la cura de un poder…»). No los cuento como hallazgos.

### `pnpm capturas` entero (una vez) y lo que quedó detrás

Una pasada entera: `arranque`, `escritorio` (ataque y defensa con «Listo»), `emboscada`, `perdida`, `veteranos`,
`movil`, `tactil`, `sin-arte`, `tropa`, `morada`, `base-anchos`, `espectador` y `arena` **en verde**; paró en
`edicion`. Como al parar no corren las de detrás, corrí aparte las que abren batallas: `poderes`, `rueda-del-golpe`
y `rueda-contrincantes` en verde («sin errores en consola»). Fallan `edicion` (espera `ir-a-edicion` tras recargar),
`equipo` (espera el campo `danio-max`) y `armas` (la ficha del orco con lanza): **las tres fallan igual en HEAD**,
corridas en el worktree limpio con el mismo error. Ninguna toca el despliegue.

## Hallazgos

Ninguno bloqueante. Lo de quien juega, de más a menos:

1. **Importante (no de quien juega): CLAUDE.md no dice nada del despliegue ni de la formación.** El plan lo pone
   como «necesario ahora» (§6: filas en «Puertas únicas» y una fila «Despliegue» en las reglas); ninguna fase lo
   hizo, por no tocar CLAUDE.md a petición de un agente, y dejaron el texto propuesto en `implementacion-A/B/C.md`
   y `implementacion-simplify.md`. `grep` de «despliegue», «formación», `asentar`, `batallaALaVista` en CLAUDE.md:
   nada. Mientras no esté, la próxima sesión no sabe que `asentar` es la única regla de salida ni que la escena lee
   solo `batallaALaVista`. Lo tiene que decidir el coordinador o el usuario.
2. **Menor: doble clic en «Listo» en la partida deja una frase que no toca.** Pasos: semilla 1, cerrar la base,
   pulsar el monstruo de (1,12), doble clic en «Listo». La barra dice «Ahora no hay nadie tuyo que desplegar.» en vez
   de «¡A la batalla!» (el segundo clic llega al mismo botón ya cerrado). En la defensa el segundo clic da «Espera a
   que termine la jugada.». No rompe nada (ronda 1 normal, sin errores), pero quien juega lee un aviso como si
   hubiera hecho algo mal. La arena tiene la guarda del doble clic y allí da «¡A la batalla!».
3. **Menor: con el puntero sobre una figura, la barra se vacía.** En el despliegue del atacante, pasar por encima
   del enemigo (11,4) deja la barra en blanco (borra la ayuda), y el clic dice «Coracero no es del bando que
   despliega.», la frase de la regla, no lo que quien juega intentó (pulsar a un enemigo). Lo mismo al pasar por la
   figura del elegido en la arena (en blanco). Esperaba la ayuda intacta o «Es del enemigo».
4. **Menor: elegir a alguien con su botón del panel de la tropa no dice nada en la barra.** Semilla 1, T, pulsar
   «Arquero A» en la lista: la ficha cambia pero la barra sigue con la ayuda larga; por el tablero sí dice «Arquero:
   su ficha está en el panel; pulsa la casilla verde donde sale.». En el despliegue de la batalla el botón sí lo
   dice («Grommash Dientenegro: pulsa la casilla verde donde sale.»). Ya lo dejó dicho la fase C.
5. **Menor, visual: el rótulo del elegido tapa la corona del héroe** cuando están en casillas vecinas
   (`qa2-mirar-01-defensor-sin-ver.png`: «Orko con hacha y escudo A» sobre la corona de Grommash;
   `cap-despliegue-01-emboscado.png`: «Alabardero A» igual). Se lee, pero se pierde de un vistazo quién es el héroe,
   que es justo lo que el usuario echaba en falta. Probablemente ya pasaba en la batalla con la activa; en la tropa
   se ve siempre.

Visto y no hallazgo de esta tarea: en la defensa la cabecera dice «Turno del rival…» mientras quien juega despliega
(es el turno del rival en el mapa, como en HEAD); recargar a media fase vuelve a la base del día 1 (no hay guardado,
como en HEAD); «Resolver sola» deja el mapa con la barra vacía, sin decir quién ganó (como en HEAD).

## Workarounds usados

- **El espejo `Session`** en los guiones: solo para calcular en qué píxel cae cada casilla y saber cuándo llega la
  defensa. Todo gesto fue un clic, toque o tecla real en la página, desde el arranque. No afecta a quien juega.
- **`&clima=despejado,dia`** en la URL, como `pnpm capturas`: para que las capturas se lean. No afecta.
- **La prueba al azar** se hizo por el núcleo (`applyAdventureAction`), quitando y añadiendo tropa a mano en el
  `army` para imitar licenciar, morir y reclutar: es la regla, no el flujo; el flujo de reclutar, licenciar y morir
  se probó en la página aparte.
- El clic de las flechas en el móvil fue con ratón en un contexto táctil (`qa2 movil`); el toque real del móvil lo
  cubren la pasada `tactil` y la de la tropa de `pnpm capturas`, y el `c-06-movil.png` del ingeniero.

## No probado

- **Recoger la guarnición** y **cambiar el tope** (criterio 2): en la partida no hay acción que recoja la guarnición
  en la tropa del héroe ni que cambie el tope a media partida (el tope es de la URL). El núcleo los cubre con la
  misma regla (`asentar`: quien no tiene casilla toma un hueco), que la prueba al azar ejercitó al añadir tropa.
- **La defensa de una guarnición sin héroe** de la persona en el navegador (sin semilla a mano que la dé); la cubre
  `despliegue-en-escena.test.ts` según la fase B.
- **El agente desplegando**: fuera de alcance (backlog); su batalla sigue igual (`pnpm qa`).

## Veredicto

**Apto con reservas.** Lo que pidió el usuario se cumple en el flujo real: la tropa es el tablero del despliegue con
el héroe incluido y se ordena con el ratón, el dedo y las flechas; la formación se guarda y sobrevive a reclutar,
licenciar y morir; la batalla despliega desde ella, el defensor primero y sin ver nada del rival (ni tablero, ni
panel, ni barra, ni foco, ni atributos), el atacante después viéndolo; la arena igual con la muralla; el banco no se
mueve y el agente sigue en verde. La reserva es el hallazgo 1 (CLAUDE.md sin las filas que el plan exigía); los
otros cuatro son menores de texto y de lectura.

## Corrección del coordinador tras QA (02-11-2026)

- **H2**: «Listo» de la partida ignora el segundo clic de un doble clic (`ev.detail > 1`), como la arena.
  `pnpm typecheck` y `pnpm lint` en verde.
- **H1** (CLAUDE.md): pendiente de decisión del usuario; el texto propuesto está en los `implementacion-*.md`.
- H3-H5: menores, sin tocar.
