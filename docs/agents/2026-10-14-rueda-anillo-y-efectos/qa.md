# QA: la rueda del golpe (#263, #258 y #261), ya juntas y simplificadas

QA, 14-10-2026. Rama `claude/combat-decision-system-88e11e`, commit `9b179e7d` (sin cambios
locales salvo `data/borradores/`, que no es mío). Lo validé contra la petición literal de cada
`requisitos.md` y contra las decisiones del usuario de `hallazgos-simplify.md`.

## Cómo lo probé

- `pnpm verify` una vez: `Checked 364 files … No fixes applied.`, `Test Files 129 passed | 1
  skipped (130)`, `Tests 3251 passed | 14 skipped (3265)`, salida 0.
- `pnpm banco`: `ancla: igual — las 200 partidas se juegan hexágono a hexágono igual`,
  `sin terminar: 0/200`. El juego no cambia.
- `verify:lento` y `capturas` están en verde en este commit (lo dice `implementacion-simplify.md`).
  No los repetí.
- El navegador, con el flujo real:
  - un Vite propio en el **3400**, con `--config` sombra (la del worktree más un `cacheDir` en mi
    scratchpad, sin tocar `node_modules/.vite`);
  - Chromium de Playwright sin pantalla, gobernado por un guion propio en el scratchpad (puerto
    3401);
  - la arena montada con clics (`/arena/?seed=N&golpe=rueda[&contacto=paga]`), «Yo» o «IA» por
    bando, «Luchar», y clics de ratón o toques en el lienzo y en la rueda;
  - la página, comparada en cada paso con un espejo `SesionDeArena`, la misma técnica que
    `capturas.ts`. El espejo lee las mismas unidades del borrador que la página, por
    `/__arena/unidades`;
  - escritorio a 1440×900, y móvil a 390×844 táctil (`isMobile`, `hasTouch`, dpr 2).
- Al acabar, maté mis dos grupos (Vite y el guion) por su PGID, después de comprobar el dueño por
  puerto y por `cwd`. Comprobé que **3400 y 3401 quedan libres**. El 3187 del usuario sigue
  escuchando y no lo toqué.
- La consola salió **vacía** (sin errores ni avisos) en todas las páginas.

Las capturas están en `capturas/`, junto a este fichero. La semilla y el montaje de cada prueba
van en su fila.

## #263: el anillo nuevo y sus efectos

| Criterio (petición literal) | Resultado | Evidencia |
|---|---|---|
| «cambia el orden de la rueda» (Ofensivo arriba, Fuerte arriba a la derecha, Finta abajo a la derecha, Defensivo abajo, Rápido abajo a la izquierda, R. guardia arriba a la izquierda, Normal en el centro) | ✅ | `01-golpe-escritorio.png`. El disco lleva el orden `ofensivo, fuerte, finta, defensivo, rapido, romperGuardia, normal`. Los opuestos se ven en los cruces: Ofensivo contra Defensivo da máximo (`34-movil-desenlace.png`) y Finta contra R. guardia también (s2). |
| «Ofensivo suma en este ataque» | ✅ | Nota: «+1 ataque en este golpe.». s1, el orko con Ofensivo contra Defensivo: 70 de daño, el máximo de la horquilla 37–70 que enseña su sector. |
| «defensivo suma hasta el proximo turno del personaje» (hasta que **empiece**) | ✅ | s1: evento `effect … defense +1 … vence: "empezar"`. La vista previa del orko en el turno del guerrero dice «Defensivo: defensa +1 hasta que empiece su próximo turno» (`23-vista-previa-defensivo.png`). En la pelea de los rodeleros contra los zombis (s2), el `effect_end` del Defensivo del zombi B llega justo al empezar su turno. |
| «Romper guardia quita ataque en el proximo turno del personaje atacado y en la contra; −3 máximo, −2 alto, −1 normal y 0 en los demás» | ✅ | s2, Rodelero B con R. guardia contra Fuerte, éxito alto. El parte dice «Romper guardia sobre Zombie A, del defensor: ataque -2 hasta que termine su próximo turno». El efecto entra **antes** del contraataque (orden del registro: golpe, `effect`, contraataque). En su turno, la barra dice «ataque 2 contra defensa 7» y la vista previa «(en la pelea, 2 / 7)» y su efecto (`17-vista-previa-con-romper-guardia.png`). Al cerrar ese turno, «Se disipa Romper guardia de Zombie A». Los cinco niveles y el refresco los cubren los tests con cifras (verde en `verify`); en el navegador solo vi el alto. |
| «finta permite mover despues de atacar con −1 si es éxito máximo y −1 por cada nivel menos hasta −5» | ✅ | s2, rodeleros (5 casillas) contra zombis, todos «Yo»: **sin andar**, Finta máxima: «Le quedan 4 casillas» y el alcance más lejano a 4 (`13-…png`). **Tras andar 2**, Finta máxima: 5 − 2 − 1 = 2, y «Le quedan 2 casillas» con alcance 2 (`27-finta-tras-andar.png`, s3). El zombi (2 casillas) que anda 1 y finta con máximo: 0, y el turno se cierra. El zombi sin andar con éxito bajo (−4): 0, y el turno se cierra. |
| «automaticamente se muestran las casillas de movimiento posibles» | ✅ | Al acabar el desenlace, sin otro clic, se resaltan las casillas (`13-…png`, y en el móvil `35-movil-finta-casillas.png`). La lista legal trae solo `move` y `end_turn`. «Defender» y «Esperar» quedan deshabilitados. |
| «Si ha movido antes solo el movimiento que le quede y si no le queda pues nada» | ✅ | Los tres casos de arriba. s1: el orko gastó sus 4 casillas antes de golpear, finta con máximo y el turno pasa solo al guerrero (`08-…png`). |
| La Finta: andar cierra el turno; no puede volver a golpear | ✅ | Un clic en (4,5) a 4 casillas: un `move` y el turno pasa a Rodelero B (`16-…png`). Pasar el ratón por un enemigo o hacer clic en él dice «Tras golpear con Finta solo puede andar o terminar el turno.», no abre la rueda ni cambia nada (`14-`, `15-…png`). |
| La respuesta no da bonificadores (decisión del usuario) | ✅ | En la respuesta, las notas de Ofensivo, Defensivo, Finta y R. guardia dicen «En la respuesta no tiene efecto: solo cuenta para el cruce…». Las de Fuerte y Rápido dicen lo que hace su contraataque (`07-respuesta-escritorio.png`). Responder con Defensivo (s1, móvil), con R. guardia (s1) o con Ofensivo (s4) no escribe ningún `effect`. |
| Finta con el contacto encendido: su tramo paga el contacto y la nota lo dice (decisión del usuario) | ✅ | `?contacto=paga`, s2. La nota de la Finta añade «Salir del contacto cuesta encima, como cualquier paso: 1 más por cada enemigo a tu lado.» (`20-…png`). Con 2 enemigos al lado y la Finta máxima, le quedan 4, salir le cuesta 3 y le quedan 6 casillas a una de distancia (`21-…png`). Con la Finta media le quedan 2, salir cuesta 3 y el turno **se cierra solo**, sin dejar un tramo sin salida (`22-…png`). |
| Rápido pierde contra armadura, y su nota lo dice (decisión del usuario) | ✅ | Nota: «Cada golpe resta la armadura del rival: contra armadura, pierde.». En la rueda, Rápido «2 × 17–35» frente a 33–63 de los demás contra el guerrero de armadura 7 (`01-…png`). |
| Rápido cobra la carga solo en el primer golpe (decisión del usuario) | ✅ | s3, un rodelero que carga 4 casillas contra un zombi. El sector dice «7–20 + 4–16». El registro da el primer golpe con `charge: 4` (14 de daño) y el segundo sin carga (10). |
| La IA con Finta | ✅ | En el espejo, 200 peleas IA contra IA con la rueda (3 contra 3, semillas 1-100, con y sin contacto): las 200 terminan. Hay 291 Fintas: en 64 anda después y en 227 se le cierra el turno. |
| Cifras en `data/rueda.json`, marcadas como inventadas; `CLAUDE.md` y la historia al día; el juego no cambia | ✅ | `romperGuardia.ataque` y `finta.casillas` van por éxito, con el `_comment` de «INVENTADO y PROVISIONAL». La fila «Rueda del golpe» de `CLAUDE.md` está al día y hay sección en `docs/historia.md` (l. 4634). `pnpm banco` sale igual. |
| «Se ve en la previsión del contraataque» (criterio del coordinador, no de la cita) | ⚠️ | Está en el núcleo (`previsionDelContraataque(…, golpe)`, con tests). En pantalla nadie lo enseña antes de elegir, porque la rueda del golpe solo da el daño del golpe (ver M3). Después sí se ve: en el parte y en la barra del turno siguiente. |

## #258: todo el sector responde al ratón

| Criterio | Resultado | Evidencia |
|---|---|---|
| Toda la superficie visible de cada sector y del círculo de Normal responde al `:hover` y al clic, y solo esa | ✅ con una salvedad (M1) | Una rejilla de 21 316 puntos sobre el plato (cada 1,5 unidades del `viewBox`). Para cada punto comparo el sector que se pinta (`isPointInFill` de los `<path>` del disco) con el botón que recibe el puntero (`elementFromPoint`): coinciden 21 160. Los **156** que no coinciden son todos el «ⓘ» de algún sector (≈ 22 por sector), que no elige ni enciende el suyo (`02-hover-sobre-la-i-de-fuerte.png`). Fuera de la corona, en las juntas y en el hueco entre Normal y la corona no elige nada. En el móvil, 11 997 de 12 100 puntos, y los 103 que fallan son también el «ⓘ». |
| El sector se enciende en sus esquinas | ✅ | El ratón de verdad en el pico de fuera, el pico de dentro y el borde de fuera de Fuerte, y en el borde de Normal: `:hover` en su botón y su relleno encendido. A 103 unidades (fuera), en una junta y en el hueco: nada. |
| Elegir por la esquina | ✅ | En el móvil, un toque en el borde de fuera de Ofensivo elige Ofensivo, y uno en el pico de dentro de Defensivo elige Defensivo. El espejo da el mismo cruce (`34-movil-desenlace.png`). |
| Teclado (1–7, flechas, Intro), notas, `aria-label`, `data-quieta`, el giro del desenlace | ✅ | Dos ArrowRight e Intro eligen Fuerte. «7» y «1» eligen en la respuesta. Cada botón lleva su `aria-label` con tecla, daño y nota. `data-quieta` sigue puesto al abrir y al pasar solo por los iconos, sin encender nada. El desenlace gira (`29-`, `34-…png`). |

## #261: los dos contrincantes con icono, vista previa y ficha

| Criterio (petición literal) | Resultado | Evidencia |
|---|---|---|
| «que la rueda muestre un icono con los dos contrincantes»: los mismos iconos que los botones de edición | ✅ | Dos `canvas.figura` animados (`orko-dos-armas/derecha`, `templario-escudo/izquierda`), en el orden «quien pega · ataca a · quien recibe». Van en el golpe, en la respuesta y en el desenlace (`01-`, `07-`, `29-…png`). En 3 contra 3 del mismo tipo, «Orko con dos armas A ataca a Guerrero con escudo A» (`28-…png`). |
| «una preview mínima en hover» | ✅ | El bocadillo junto al icono lleva nombre, PV actuales y máximos, ataque, defensa, daño y velocidad con lo que suma el equipo, armadura, efectos con su duración y si ya contraatacó (`03-`, `04-`, `17-`, `23-…png`). |
| «que se puedan ver sus características con un click» | ✅ | El clic abre «Ficha de Guerrero con escudo» encima de la rueda, de solo lectura: el único control vivo es «Volver a la rueda» (`05-…png`). Al volver, la rueda sigue en la misma fase. |
| Reconocerlos en el tablero | ✅ | Con la rueda abierta y en el desenlace, el aro del color de cada bando bajo el atacante y el objetivo (`01-`, `28-`, `29-…png`). |
| A ciegas, con los dos bandos «Yo» | ✅ | s1, «Yo» contra «Yo». Probé seis golpes distintos (Fuerte, Finta, R. guardia, Defensivo, Ofensivo, Rápido) y la rueda de la respuesta es **idéntica byte a byte** en los seis, sin lienzos ni `style`. Lo mismo el panel lateral, la barra y los atributos de `#app` y de `#rueda`. Ningún `[data-elegido]`. La ficha de la respuesta sale del estado, que no lleva la elección. |
| Móvil: dos líneas como mucho; tocar el icono abre la ficha | ✅ | La cabecera queda en dos líneas («Orko con dos armas» / «ataca a Guerrero con escudo»), sin desbordar en horizontal (`scrollWidth` 390) (`30-movil-golpe.png`). Al tocar el icono se abre la ficha sin vista previa (`31-`), y «Volver a la rueda» vuelve (`32-`). |

## Pasada adversarial

- **Dos bandos «Yo», que no se vea la elección del otro**: ✅, en la fila «A ciegas».
- **Finta sin casillas**, en tres formas:
  - lo andado ya se lo comió (s1);
  - la penalización se lo comió (el zombi, s2);
  - el contacto se lo comió (`?contacto=paga`, s2).

  En las tres, el turno se cierra solo y no se resalta nada. ✅
- **Finta con el contacto**: ✅, en su fila.
- **Escape con la ficha abierta encima de la rueda**: ✅.
  - En el golpe (s1), el primer Escape cierra solo la ficha: la rueda sigue en «golpe», sin «Golpe
    cancelado» (`06-…png`). El segundo Escape cancela el golpe, como siempre.
  - En la respuesta (s4, con el teclado): Tab al icono, Intro abre la ficha y Escape la cierra. Un
    segundo Escape no hace nada, porque la respuesta no se cancela. «1» elige y el golpe se resuelve.
  - Con el foco en el icono, las teclas 1–7 siguen eligiendo.
- **El móvil**: ✅, en sus filas. El tramo de la Finta también se ve resaltado en el lienzo
  desplazado (`35-…png`).
- **Acción repetida**: tras la Finta, un segundo clic en el enemigo sigue rechazado con la misma
  frase y sin cambiar nada. ✅
- **Partida terminada**: la rueda se cierra y la página coincide con el espejo, que da ganador el
  defensor. ✅

## Hallazgos

Ninguno es bloqueante ni importante.

### Menores

**M1. El «ⓘ» de cada sector es un hueco que no elige ni enciende su sector (#258).**

- Pasos: `?seed=1&golpe=rueda`, el guerrero con escudo «Yo» contra el orko con dos armas «Yo».
  Anda hasta que el orko golpea. Con la rueda abierta, pasa el ratón por el «ⓘ» de Fuerte (arriba a
  la derecha del sector) y haz clic.
- Lo que pasa: se abre la nota «Daño ×1,25.», pero el sector no se enciende y el clic no elige
  (`02-hover-sobre-la-i-de-fuerte.png`).
- Mide unos 13×13 px por sector en el escritorio, y es el 0,7 % de los puntos de la rejilla.
- La petición dice «ni un hueco muerto». Es el disparador de la nota y quizá sea a propósito, pero
  quien juega y apunta a la esquina de fuera, donde está el «ⓘ», hace clic y no pasa nada.
- Lo que esperaba: que el clic en el «ⓘ» también eligiera el sector, o que el «ⓘ» quedara fuera
  de la zona donde se apunta.

**M2. El tramo de la Finta no se explica en pantalla (#263).**

- Pasos: s2, rodeleros contra zombis, «Yo» contra «Yo», golpe con Finta y respuesta R. guardia.
- Lo que pasa:
  - Tras el desenlace, la barra queda vacía. El panel dice solo «Le quedan 4 casillas».
  - La ayuda del panel sigue diciendo «o pasa el ratón por un enemigo y elige desde qué casilla
    golpearlo… se le puede cargar» (`13-…png`), y eso es justo lo que no se puede hacer.
  - La razón solo aparece si pasas el ratón por un enemigo.
- Lo que esperaba: una línea en la barra o en el panel, del tipo «Tras la Finta: anda hasta 4
  casillas o termina el turno».
- La implementación ya lo apunta como no cubierto, porque no hay un hecho en el registro.

**M3. La rueda no enseña cuánto quita R. guardia al contraataque antes de elegir (#263).**

- El núcleo lo prevé (`previsionDelContraataque` con `golpe`) y los tests lo cubren.
- Pero en pantalla nadie lo pide:
  - el sector solo da el daño del golpe;
  - la barra, al pasar el ratón, prevé el contraataque sin golpe.
- Quien elige R. guardia no ve, antes del cruce, el contraataque más flojo. Lo ve después, en el
  parte.
- La cita del usuario no lo pide. El criterio 2 del coordinador («se ve en la previsión del
  contraataque») solo se cumple en el núcleo.

**M4. La ficha de solo lectura enseña controles que parecen vivos (#261).**

- En la ficha abierta desde la rueda, «✎ Editar», las «×» del equipo y los desplegables «— elige —»
  se ven como siempre, aunque el `<fieldset disabled>` los apaga (`05-…png`).
- La frase de arriba lo dice («Solo para mirar…»), pero un clic en ellos no hace nada y no se ve
  apagado.

## Workarounds usados

- **Un guion propio de Playwright con espejo `SesionDeArena`**, para saber dónde hacer clic en el
  lienzo y qué esperar. No cambia la página: los clics y las teclas son reales y la página se
  compara con el espejo tras cada jugada. A quien juega no le afecta.
- **Una configuración sombra de Vite** (`cacheDir` propio). Es por el entorno compartido y no toca
  lo que se sirve.
- **No aparté el borrador** (`data/borradores/unidades.json`, de otra sesión). La página arranca
  con él y enseña el recuadro «Al leer lo de antes · 2 avisos». El espejo lee lo mismo. Ese
  recuadro sale en las capturas y no es de estas tareas.
- En una pelea larga usé «Terminar turno» y tramos cortos para llegar a situaciones concretas:
  pegado al enemigo sin andar, o una recta para cargar. Son jugadas legales que haría cualquiera.

## No probado

- **R. guardia en los cinco niveles en el navegador.** Solo vi el alto (−2). Medio, bajo, mínimo y
  máximo, y el refresco, los cubren los tests con cifras (`test/rueda.test.ts`, en verde).
- **El clic recortado en Firefox y Safari.** Solo Chromium.
- **Un héroe como contrincante en la cabecera.**
- **La IA andando tras su Finta, animada en la página.** Solo lo vi en el espejo (64 casos en 200
  peleas). La pasada «todo en IA» de `capturas` está en verde en este commit.

## Veredicto

**Apto con reservas** para las tres: #263, #258 y #261.

Las tres peticiones se cumplen en el flujo real: escritorio y móvil, «Yo» contra «Yo» y contra la
IA, y con y sin contacto. La elección sigue a ciegas, la consola queda limpia y el banco no cambia.
Las reservas son los cuatro menores de arriba, ninguno bloqueante:

- M1, el «ⓘ» como hueco en el sector;
- M2, el tramo de la Finta sin una frase que lo explique;
- M3, la previsión del contraataque con R. guardia solo en el núcleo;
- M4, controles que parecen vivos en la ficha de solo lectura.
