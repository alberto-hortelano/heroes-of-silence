# QA — la tropa del héroe en escena

Validado sobre `686d8110` (y `791f03c0` debajo), árbol limpio en `src/`, `test/` y `tools/`.
Playwright sin pantalla contra un vite propio en :3233, arrancado con `set -m` en su propia línea
y matado por su grupo (`ss` dijo «3233 libre» después; el :3201 del coordinador no se tocó). El
espejo `Session` en Node sirvió para saber qué esperar y dónde pulsar, con la misma `EscenaTropa`
que la página. Capturas en `qa/`. Gasto en fal.ai: 0.

Petición literal: «Una vez en el mapa me gustaria poder ver a la tropa del heroe, en un escenario
con todos en semicirculo mirando a camara, y ahi podria repartir equipo y ver caracteristicas y
experiencia».

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1a | Botón «Tropa» en el panel del héroe y tecla T abren la escena | ✅ | Partida real desde el menú (Nuevo juego → orkos → héroe → base → mapa, s24649): botón visible y encendido, T abre (`flujo-02-tropa-T.png`), el botón también (`flujo-03`). Lo mismo en s4, s7 y s12, en el día 1 y en el día 4, con el héroe en el castillo y fuera (`s4-fuera-del-castillo-tropa.png`). |
| 1b | Escape y «Volver al mapa» vuelven al mapa como estaba | ✅ | s4, cámara movida antes con rueda y arrastre: al volver con Escape cambia el **0,1 %** de la muestra del lienzo, con «Volver al mapa» otro 0,1 %. Mismo `selectedHeroId`. La rueda y el arrastre dentro de la tropa no mueven el mapa de debajo (lo mide ese 0,1 %). Con el diálogo «Menú» abierto, Escape cierra el diálogo y deja la tropa abierta. |
| 2a | Escenario lateral, semicírculo mirando a cámara, héroe al centro y al fondo | ✅ | `s4-01-tropa-7-figuras.png`, `flujo-02`, `s7-veterano-2.png`: se lee como arco, con los extremos delante y más grandes, el héroe atrás en medio; el grupo sobre el empedrado y el horizonte alto (E1-E3 del coordinador cumplidos). |
| 2b | Hoja de su unidad o del tipo de héroe, nunca el Y Bot; reposo | ✅ | s4: `heroe-elfo-danzante-de-espadas`, `elfo-arquero`, `elfo-guardia-del-bosque`; s24649: `heroe-orko-kaudillo`. La pose cambia entre capturas (respira). |
| 2c | De 1 a 7 figuras enteras y sin solaparse en 1440×900, 1280×720, 1024×768 y 375×812 | ✅ | 7 figuras: héroe 45,3 / 45,4 / 45,6 / 45,9 % del alto; huecos entre cajas vecinas 13,8-25,9 px (1280), 10,0-18,7 (1024), 5,3-9,8 (móvil). 1 figura (`s7-heroe-solo.png`), 2 (`s7-tropa-de-1.png`), 3 (`s7-veterano-2.png`), 6 y 7. Las armas que sobresalen de la caja se tocan entre vecinos (escudo y lanza de las dos guardias); las cajas no. |
| 3a | Pulsar una figura la elige y se nota en la escena | ✅ (ver H1) | Las 7 de s4 pulsadas en el lienzo una a una y luego las 7 por la lista: `canvas[data-tropa]` y el título de la ficha coinciden con el espejo en las 14. Tocar en el móvil también (figura 5 → `hero-0-puesto-4`). Pulsar el suelo vacío no cambia nada. El cursor pasa a mano y la barra dice «Arquero: pulsa para ver su ficha.». **El aro sale delante de los pies** (H1). |
| 3b | Ficha: nombre, unidad o tipo, nivel e índice, rango, experiencia actual y la siguiente | ✅ | Héroe s4: «HÉROE · GUERRERO (DANZANTE DE ESPADAS)», «Índice 433 · nivel 4», rango 5, «99 000 / 171 000». Tras una defensa (s7 día 4): héroe rango 7, «343 488 / 477 000». |
| 3c | Batallas y bajas si es veterano | ✅ | s7 día 4 tras defender la base: «VETERANO · GUERRERO CON ESCUDO», rango 2, «18 056 / 27 000», Batallas 1, Bajas 1 (`s7-veterano-2.png`); s12: «Orko con dos armas» 8 512 / 9 000, Batallas 1, Bajas 1. El novato sin hoja no las enseña; el que se vistió (con hoja) enseña 0 y 0. |
| 3d | Características finales con lo de serie y lo suyo; lo que suma el equipo | ✅ | Vida, Ataque, Defensa, Daño, Armadura, Velocidad; cada pieza con sus pastillas (`+2 Ataque`, `+10–30 Daño`…). Solo lectura: no hay casillas. |
| 4a | Equipo por hueco y mochila del héroe | ✅ | Los cinco huecos, «de serie» con su «ⓘ», la mochila con su cuenta («MOCHILA DEL HÉROE · 2»). |
| 4b | Poner de la mochila; lo que no vale, apagado con el motivo del núcleo | ✅ | Mandoble a la Guardia (escudo de serie): «Poner» apagado y debajo «Mandoble es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo» (`s4-03`); un `click()` forzado por JS en el apagado no hace nada. Rodela al arquero con mandoble: apagada (espejo: «Rodela no se puede llevar con Mandoble…»). Ver H4 sobre lo que dice ese motivo. |
| 4c | Quitar a la mochila; lo de serie y el arma no se quitan | ✅ | Gambesón del héroe: × → mochila, Armadura 4 → 0, barra «Gambesón vuelve a la mochila de Aerin del Roble.». La Espada del héroe: × apagado con «…se quedaría sin arma de cuerpo a cuerpo… cámbiala por otra en vez de quitarla»; con el Mandoble puesto, igual, y la Espada en la mochila se puede poner. Lo de serie de las unidades no lleva × (`s4-03`, escudo de la guardia: 0 botones). |
| 4d | Dar de uno a otro = quitar y poner | ✅ | Mandoble del arquero → mochila → al héroe: Ataque 4 → 7, Daño 30–70 → 50–100, índice 433 → 478, la Espada a la mochila. |
| 4e | A un novato se le puede equipar | ✅ (ver H2) | Rodela a la 2.ª guardia y mandoble al 4.º arquero, los dos novatos: se ponen, pero **a otro individuo** del mismo tipo y el aro salta a él (H2). |
| 5 | Las cifras cambian al momento (y el nivel) | ✅ | Arquero con mandoble, en el mismo clic: Ataque 5 → 9, Daño 10–20 → 40–70, «Índice 291 · nivel 2» → «Índice 338 · nivel 3»; quitado, vuelve a 5. Guardia con rodela: Defensa 7 → 5. La escena no enseña cifras, así que no hay nada más que cambie. |
| 6 | Todo por la sesión y el núcleo; lo ilegal no se lanza y, si llega, falla con su motivo | ✅ | Oro, elegida y ficha de la página iguales al espejo en la comprobación que sigue a cada paso: ninguna diferencia. Lo que llega tarde falla con su motivo: un doble clic en «Poner» manda el segundo clic al botón viejo y la barra dice «no se puede equipar: Aerin del Roble no lleva Gambesón en la mochila», sin tocar el estado (H6). Los tests de la sesión (`test/tropa-en-escena.test.ts`) cubren el resto. |
| 6b | Fuera de turno no se abre | ⚠️ en el navegador / ✅ en Node | En la página el turno del rival es instantáneo: en 60 sondeos tras «Fin de turno» no se llegó a ver un momento fuera de turno, y durante una defensa la escena es `battle` y la T no hace nada. Partida terminada (s4 y s13, base perdida): ni botón ni T, la barra sigue con «Derrota: has perdido tu base.». El caso del turno del rival lo cubren `test/tropa-en-escena.test.ts` y el ancla de `paneles.txt` («todavía no es tu turno…»). |
| 7a | Sin arte, cada figura su marcador | ✅ (ver H5) | Con `/unidades/*.webp` en 404 (s4): siete óvalos con su inicial, ningún Y Bot (`s4-sin-arte-tropa.png`). Se pisan mucho y los extremos tocan el borde del lienzo (H5). |
| 7b | Sin agente, todo igual | ✅ | Todo lo de arriba es sin agente (`pnpm dev`). Con agente: ⚠️ no probado (ver abajo). |
| 8 | `pnpm verify` verde; pasada de capturas; banco igual | ✅ | `pnpm verify` mío sobre `686d8110`: exit 0, 149 ficheros, 3 484 tests en verde, 108 s (máquina con carga 18). `CAPTURAS_SOLO=tropa pnpm capturas` en verde sobre `686d8110` y `pnpm banco` «igual» sobre `791f03c0`: citados de `implementacion-2.md` e `implementacion.md`, no repetidos; `686d8110` no toca `src/core` ni `src/server` (`git diff --stat` vacío). |

Consola: sin errores en todas las páginas. Avisos: el de `willReadFrequently`, que provoca mi
`getImageData`, y en el móvil el de siempre del suelo («se pinta a 133 px por casilla y esta
pantalla pide 220…»), que no es de esta tarea.

## Hallazgos

### Importantes

**H1. El aro de la elegida queda delante de los pies, no debajo.** Se ve en todas las figuras y en
todos los tamaños, más cuanto más grande es la figura. Es lo que vio el coordinador, y sale de cómo
está hecho:
`pintarAroDeFigura` centra la elipse (0,3 × 0,11 del alto) en `c.suelo`, el ancla de la hoja, y el
ancla del atlas es **el píxel opaco más bajo**: la suela del pie que va delante (`heroe-orko-kaudillo`,
`orko-hacha-escudo` y `orko-dos-armas` d0: ancla y = 341-342 = fondo de la caja opaca). Así que la
mitad delantera del aro (≈ 0,11 del alto, unos 29 px en una figura de 266) cae entera por delante de
esa suela, y el otro pie queda en el borde de atrás. En `zoom-aro-s4-heroe.png` el pie izquierdo
pisa el centro del aro y el derecho su borde trasero; en `zoom-aro-heroe.png` (orko, piernas
abiertas) los dos pies quedan en la mitad de atrás; en `s4-03` (la guardia de la derecha) y `s7-veterano-2.png`, el aro está por delante y a la izquierda de las botas. Además el aro se pinta
**antes** que la sombra de la figura (`pintarFiguraConSombra`), que lo oscurece por encima, al
contrario de lo que dice el comentario de `pintarSombraDeFigura` («se pinta ANTES que ella y que su
aro»). Como la base usa la misma función, allí pasa lo mismo, pero con figuras pequeñas casi no se
nota. Para verlo: `?seed=4`, salir de la base, T: el aro del héroe.
Quien juega esperaba: un aro en el suelo alrededor de los dos pies, como una peana.

**H2. Al vestir a un novato, la pieza va a otro individuo y el aro salta a él.** Para verlo:
`?seed=4`, construir la armería y comprar el mandoble, salir, T, pulsar al **4.º arquero** (el de
más a la derecha de los cuatro) y «Poner» el mandoble: lo lleva el **1.º arquero** (el extremo
izquierdo), el aro y la ficha saltan allí y la barra dice «Mandoble va al primer Arquero sin equipar,
que es igual que el que mirabas: ahora es el elegido.» (`s4-05`). Con la rodela a la 2.ª guardia, lo
mismo hacia la 1.ª (`s4-04`). Es la regla de `destinoDeEquipo` (`{ creature }`, el primer novato) y
la implementación lo da por sabido («Qué NO queda cubierto»), y el criterio 4 dice «como hoy». Pero
esta pantalla es la primera donde cada individuo tiene **su sitio** en el arco, y quien juega eligió
a ese y ve que lo coge otro. Quien juega esperaba que se lo pusiera al que había pulsado.

### Menores

**H3. El panel de la tropa se abre con el desplazamiento del panel del mapa.** Con el panel del mapa
bajado del todo (`#lateral.scrollTop` 608, `?seed=4` tras comprar en la armería) y la T, la tropa se
abre en 217: la lista de a quién elegir y el título quedan por encima y no se ven
(`s4-tropa-con-panel-desplazado.png`; también `s4-01`, donde se llegó sin tocar nada, solo viniendo de
la armería). Con el panel arriba (0 o 300), se abre arriba. Quien juega esperaba la escena nueva
empezando por arriba.

**H4. El motivo del mandoble sobre un escudo de serie pide algo imposible.** «Mandoble es un arma a
dos manos y no se puede llevar con Escudo: quita antes el escudo», pero ese escudo es de serie y no
tiene ×. Si le pones una rodela, el motivo pasa a «…con Rodela: quita antes el escudo», y al quitar
la rodela vuelve el de serie: no hay salida, y la frase no lo dice. El texto es del núcleo
(`ponerseBlocker` / `manosBlocker`) y no es de esta tarea, pero aquí es donde se lee a la vez que el
«de serie» sin ×. `?seed=4`, armería, comprar el mandoble, T, pulsar una «Guardia del bosque».

**H5. Sin arte, los marcadores se pisan y tocan el borde.** El marcador mide de ancho 0,76 del alto
(`pintarMarcador`: semieje 0,38) y el encuadre reserva una caja de 0,42: con siete figuras al tamaño
nuevo, los óvalos se tapan casi la mitad unos a otros, el del héroe queda casi entero detrás de sus
dos vecinos y los extremos llegan al marco (x ≈ 18 y ≈ 1102 en un lienzo que empieza en 21 y acaba en
1101; `s4-sin-arte-tropa.png`). Con la escala del combate no se notaba. Es el respaldo, pero el
criterio 2 dice «sin solaparse».

**H6. Un doble clic en «Poner» escribe un error en la barra.** El primer clic pone la pieza y el
segundo, que llega antes de repintar, pulsa el botón viejo: «no se puede equipar: Aerin del Roble no
lleva Gambesón en la mochila». No cambia nada (el núcleo lo rechaza, que es lo que pide el criterio
6), pero quien hizo doble clic lee que algo falló cuando no falló.

**H7. En el escritorio, un tercio del alto queda vacío bajo la escena.** El marco 20/11 heredado de
la base deja en 1440×900 unos 170 px vacíos bajo el lienzo y en 1024×768 unos 270
(`s4-1024x768-tropa.png`: la escena ocupa la mitad de arriba), mientras la ficha se desplaza dentro
del panel. Con un lienzo más alto las figuras podrían ser más grandes. La implementación lo da por
sabido (decisión de la base).

**H8. En el móvil, al tocar una figura su ficha no se ve.** Los siete botones de la lista ocupan la
pantalla bajo la escena; la ficha cambia más abajo y la barra dice «su ficha está en el panel», pero
hay que bajar para verla (`s4-movil-tropa-tocada.png`). Se puede usar; solo falta llevar la vista a
la ficha.

## Workarounds usados

- **La armería construida y la compra del mandoble y la rodela**, por los clics de la base
  (Ampliar → Armería → andar a la armería → Comprar), como quien juega: sin ellos la mochila sale
  vacía y no hay nada que poner salvo lo que se le quita al héroe. No falsea nada; es el único
  camino del juego para tener un arma a dos manos el día 1.
- **Licenciar en la base** para la tropa de 1 y la de 0 (s7), con el «−1» del panel.
- **Pulsar por el espejo**: las coordenadas de cada figura salen de `EscenaTropa` y
  `cajaEnLaTropa` en Node, con el lienzo medido en la página. Es la caja que usa la página para
  pulsar, así que no esconde nada. Sí esconde que **la caja pulsable no es la silueta**: un clic en
  el arma o el escudo que sobresalen no elige a nadie (sin consecuencias para quien juega: el
  cuerpo es lo que se pulsa).
- `getImageData` para medir la cámara (y su aviso de consola, que es mío).

## No probado

- **Fuera de turno en la página**: el rival juega al instante y no hay un momento que pillar (ver
  6b). Lo cubren los tests de Node.
- **Con agente conectado**: la escena es del cliente y no toca servidor ni contrato
  (`src/server` y `src/core/contract` sin cambios); `pnpm qa` no se corrió.
- **Un personaje en la tropa** (el «Poner» apagado con el motivo de `pedidoDeEquipo`): hoy el juego
  no mete ninguno en una tropa.
- **El veterano vestido sin hoja previa**, después de una batalla, en el lienzo: probado el veterano
  y el vestido por separado.
- `verify:lento`, `banco` y `capturas` no se repitieron: citados arriba, sin cambios desde su verde.

## Veredicto

**Apto con reservas.** Lo que pide el usuario está: desde el mapa se ve la tropa en semicírculo
mirando a cámara, con figuras grandes, se reparte equipo con las reglas del núcleo y se leen
características y experiencia, sin errores en consola y con el mapa intacto al volver. Las reservas
son H1, el aro delante de los pies, que es lo que marca a la elegida y se ve en cada captura, y H2,
que la pieza de un novato vaya a otro y el aro salte. Ninguna bloquea el uso.

---

# Vuelta 2 (20-10-2026): re-verificación de H1, H2, H3, H4 y H6

Sobre `59b54b14` (árbol limpio salvo `hallazgos-qa.md`, sin seguimiento). Playwright sin pantalla
contra un vite mío en :3263 (arrancado con `set -m` en su propia línea, dueño comprobado por puerto y
`readlink /proc/<pid>/cwd`, parado por su grupo; `ss` dijo «3263 libre» después). El :3201 del
coordinador no se tocó. El espejo `Session` en Node solo para saber dónde pulsar (las cajas de
`EscenaTropa`/`cajaEnLaTropa`); lo comprobado se lee **en la página** (`canvas[data-tropa]`, el botón
`aria-pressed` de la lista, la ficha, la mochila y la barra). Capturas en `qa/vuelta-2/`. fal.ai: 0.
Consola: **ningún error** en ninguna de las páginas abiertas.

No repetidos (citados de `implementacion-3.md`, mismo commit): `pnpm verify` (exit 0, 3 496 tests),
`pnpm banco` («igual», `3406f518…`), `CAPTURAS_SOLO=tropa pnpm capturas` (exit 0). Corridos por mí,
baratos: `pnpm vitest run test/agent-contract.test.ts test/equipo.test.ts test/tropa-en-escena.test.ts
test/aro-de-figura.test.ts` → 4 ficheros, 143 tests en verde (6,7 s); `pnpm qa` → exit 0, «299
veredictos, 298 entraron, 0 descartadas», partida terminada el día 4.

| # | Hallazgo | | Evidencia |
|---|---|---|---|
| H1 | El aro bajo los pies, en varias facciones y figuras | ✅ | Diez partidas a 1440×900 (s4 elfos con guerrero y con cantora, s2 orkos con orko y con goblin, s6 imperio con duelista e ingeniero, s7 templarios con caballero y con monje, s14 no muertos con nigromante y con lich), **cada figura pulsada** en el lienzo (62 en total) y recortada a sus pies: el aro va centrado entre los dos pies, el de delante dentro y el de atrás dentro o sobre su borde de atrás, también en las guardias abiertas (`h1-pies-de-los-diez-heroes.png`, `h1-s*-pies.png`, `h1-s7-escena.png`). Se pinta sobre la sombra y bajo la figura (las botas tapan el aro). La elegida de la página coincide con el espejo en las 62. En la **base caminable** (s4, s7, s2), el aro de quien señala el ratón también queda bajo el Y Bot (`h1-base-caminable.png`). Ver M1 (el aro del extremo se corta en el borde). |
| H2 | Equipar y quitar a un novato concreto: la pieza va al pulsado y la elegida no salta | ✅ | s7: gambesón del héroe → pulsado el **2.º** guerrero con escudo (`hero-0-puesto-1`) → «Poner»: lo lleva el puesto 1 (espejo `1:escudo[{"armadura":"gambeson"}]`, ficha «Armadura: Gambesón ×», barra «Guerrero con escudo lleva ahora Gambesón.»), y la elegida sigue en él (pasa a `veterano-1`, el id que coge al tener hoja; el botón pulsado de la lista, el mismo). La × se lo quita a él y la elegida no se mueve. Lo mismo con el 2.º escudero. s4: cuatro arqueros, a cada uno su pieza (jubón, bastón, rodela, escudo), cada una en el pulsado (`aria-pressed` de 1, 2, 3, 4 antes y después). **Tras licenciar** un arquero en la base (s4, tropa de 5): el 3.º arquero pulsado recibe el gambesón y los demás no (fichas leídas una a una: solo el puesto 2 lleva «Gambesón ×»; `h2-tras-licenciar.png`). |
| H3 | El panel de la tropa abre arriba y el del mapa vuelve como estaba | ✅ | s7: panel del mapa bajado a 591 → T → la tropa abre en **0**; bajado el de la tropa a 156 y Escape → el mapa vuelve a **591** (fondo 681). Con el botón «Tropa» y el panel en 120: abre en 0 y vuelve a 120. |
| H4 | El motivo con escudo de serie | ✅ | s4, armería construida y piezas compradas por clics: a la Guardia del bosque (escudo de serie), «Poner» del mandoble y del bastón apagados con «esa unidad de Guardia del bosque no admite Mandoble: es un arma a dos manos y su Escudo es de serie, que no se quita» (`h4-guardia-mandoble.png`); con una rodela suya encima, la misma frase (bien: quitarla deja el de serie). Al héroe con un escudo **suyo** sigue diciendo «…quita antes el escudo», que sí se puede. Ver M2 (la forma de la frase). |
| H6 | Doble clic en «Poner» | ⚠️ arreglado lo que se pidió; queda una variante (N1) | El doble clic de Playwright (`dblclick`, los dos clics antes de repintar) pone una vez y la barra dice «Aldo de Valdeluz lleva ahora Gambesón.», sin error; lo mismo con dos clics a 130 ms en «Poner» y en la ×, cuando lo que queda bajo el puntero tras repintar no es un botón. **Pero con un doble clic a ritmo de persona (140 y 250 ms) el segundo clic cae en el panel ya repintado y, si debajo hay otro «Poner», lanza otra jugada**: ver N1. |

## Hallazgos nuevos

### Importante

**N1. Un doble clic en «Poner» puede ponerle otra pieza.** Con dos clics a 140 ms o a 250 ms (un
doble clic normal de persona; con 40-220 ms entre el primero y el repintado pasan varios fotogramas)
el primer clic pone la pieza, el panel se repinta y el segundo clic cae en lo que haya quedado bajo el
puntero. Si es el «Poner» de otra pieza, la pone: `repiteLaJugada` solo ignora **la misma** jugada.
Reproducción (determinista, dos veces de dos): `?seed=4`, en la base ayuntamiento → «Construir»
Armería → la armería → comprar **Bastón** y luego **Daga** → «Volver al mapa» → T → pulsar al 2.º
arquero → bajar el panel hasta la mochila (queda al fondo: Bastón, Daga) → doble clic en el «Poner»
de la **Daga**. Resultado: el arquero lleva **Bastón** (a dos manos), la Daga vuelve a la mochila y la
barra dice «Arquero lleva ahora Bastón.» (`h6-daga-acaba-en-baston.png`: a la izquierda antes, a la
derecha después). Con un solo clic, «Arquero lleva ahora Daga.» y el bastón sigue en la mochila. Por
qué: con el panel al fondo, la mochila pierde una fila, el navegador recorta el desplazamiento y todo
baja unos 52 px, así que el «Poner» de la fila de encima queda donde estaba el pulsado. No es un error
del núcleo (las dos jugadas son legales y la barra dice la verdad de la segunda), pero quien hizo
doble clic en la Daga se encuentra con un Bastón y una frase que no esperaba. Quien juega esperaba la
Daga puesta y nada más. (Sugerencia, no arreglo: el clic con `event.detail > 1` en `tropa-poner` y
`tropa-quitar` no se lanza, o el panel no recorta el desplazamiento en el repintado.)

### Menores

**M1. El aro del extremo del arco se sale del lienzo.** Con el aro medido, una figura en guardia
abierta lleva un aro más ancho que la caja del encuadre: el guerrero con escudo del extremo izquierdo
de s7 lo tiene cortado por el borde, un cuarto fuera, a 1440×900 (`h1-s7-extremos-1440.png`, a la
izquierda), y en el móvil (s6, 375×812) el del extremo izquierdo toca el borde
(`h1-s6-extremos-movil.png`). Se lee igual qué figura es la elegida. Lo da por sabido
`implementacion-3.md`.

**M2. La frase del escudo de serie empieza en minúscula y suena rara.** Bajo la pieza se lee «esa
unidad de Guardia del bosque no admite Mandoble: …», cuando las demás de esa lista empiezan por la
pieza en mayúscula («Rodela no se puede llevar con Mandoble: …», «Mandoble es un arma a dos manos y
no se puede llevar con Escudo: …»). Dice lo que tiene que decir; es la forma.

**M3 (observación, no regresión). Un `puesto` del agente se descarta en silencio.** El esquema del
agente quita la clave (lo comprueba `test/agent-contract.test.ts`), así que un
`{ type: 'equip', item, puesto: 2 }` llegaría al núcleo sin destino y vestiría al **héroe**. El
contrato no anuncia `puesto` y zod quita toda clave desconocida, así que el agente no tiene por qué
escribirlo; se apunta porque el núcleo sí lo entiende.

## Workarounds usados

- **Armería y compras por clics en la base** (escaneando con el ratón el lienzo hasta que la barra
  dice «Ayuntamiento…» y «Armería…», y andando por el suelo si no está a la vista): es el camino del
  juego. No falsea nada.
- **Licenciar** con el «−1» del panel de la base: el gesto del juego.
- **Pulsar por el espejo**: las coordenadas salen de la misma `EscenaTropa` que lee el clic en la
  página. En las partidas con armería el espejo no compra (no anda hasta la armería), así que solo se
  usó para las posiciones (la tropa tiene el mismo largo) y todo lo comprobado se leyó en la página.
- Para el doble clic «humano», dos `mouse.click` en el mismo punto con 40-250 ms entre ellos: es lo
  que hace un ratón.

## No probado

- **Puestos tras una batalla que mata a alguien**, en la página: no se buscó una semilla con una
  batalla así antes del turno (el coste no lo justificaba). Por construcción, abrir la tropa vuelve a
  elegir al héroe, el puesto se lee del `hero.army` del momento del clic y `elegidoEnLaTropa` vuelve al
  héroe si el puesto ya no existe; la tropa no cambia mientras la escena está abierta (solo en tu
  turno, y lo único que se juega en ella es equipar y quitar). Licenciar, que también reindexa, sí se
  probó.
- **El agente vistiendo a un novato concreto**: `pnpm qa` en verde y el test del contrato; el agente
  sigue nombrando por tipo (`creature`, el primer novato), como antes.
- `verify:lento` y las demás pasadas de `pnpm capturas`: no se corrieron (presupuesto), como en
  `implementacion-3.md`.

## Veredicto (vuelta 2)

**Apto con reservas.** H1, H2, H3 y H4 están arreglados y se ven en la página real, en las cinco
facciones, con dos tipos de héroe cada una y en la base. H6 está arreglado para lo que se pidió (el
segundo clic sobre el botón de antes ya no escribe un error), pero el doble clic de una persona puede
lanzar **otra** jugada sin querer (N1), lo que es peor que el error de antes porque cambia el equipo
en silencio. Ninguna de las reservas bloquea el uso; N1 es la que habría que arreglar antes de dar la
escena por cerrada.
