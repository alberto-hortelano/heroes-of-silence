# QA — complejidad del combate (tope 3/5/7, rueda 3/5/7) y «Solo la rueda del héroe»

22-10-2026. Contra la petición literal de `requisitos.md`, en el flujo real: `pnpm dev` del usuario en
http://localhost:3177/ (no lo he tocado: sigue vivo, PID 100379) y un Chromium de Playwright sin pantalla,
mío, por CDP (ya parado, comprobado el puerto). Las capturas y los registros están en el scratchpad de la
sesión de QA (`…/scratchpad/*.png`, `ruedas.log`).

## Veredicto: **NO APTO**

Con la rueda de 3, la persona no puede golpear cuerpo a cuerpo a nadie que pueda devolverle el golpe: la
rueda no se abre, sale un error en la barra y la unidad queda plantada sin salida (en la partida solo sale
con «Resolver sola»; en la arena, ni así). Esto rompe la rueda de 3 en la partida y en la arena, y
«Solo la rueda del héroe» con la rueda de 3, porque justo el golpe del héroe es el que se atasca. Lo demás
(tope de tropa, rueda de 5, rueda de 7, ciclo, medias, selectores, URL, enlace de la arena, agente) cumple.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Topes 3, 5 y 7 por bando, héroe incluido | ✅ | Partida `?seed=1&tropa=3&rueda=3` (día 3): 3 contra 3, los dos con su héroe («Pistolero montado A, B, Margarethe Eisen» / «Arquero A, B, Aerin del Roble»). `?seed=2&tropa=5&rueda=5`: 5 contra 4 (4 orkos + Grommash). Arena: la cabecera dice «Bando izquierdo · 0 de 3». |
| 2 | El tope vale para todo bando y para lo que se recluta | ✅ | Tope 3, base elfa: la tropa del héroe son 2 arqueros; la morada dice «no cabe: el ejército ya lleva 2 de 2 individuos» y «caben 0». Guarnición de 3; monstruos «3» en el mapa de s1 con tope 3 y «4» en s2 con tope 5; la defensa de la guarnición, 3 contra 3. Recoger la guarnición: `takeGarrison` usa `capacidadDe(hero, state.combate.tope)` (game.ts:1827) y lo cubre `tropa.test.ts`. No lo he hecho en el navegador. |
| 3 | IA y agente juegan con el tope; el agente lo sabe | ✅ | Barrido de 4 semillas: `--tropa 3 --rueda 7` → `sin terminar: 0/4`, 3 / 4 / 4 días; `--tropa 7 --rueda 3` → 0/4, 4 / 10 / 10; `--tropa 3 --rueda 3` → 0/4, 3 / 5 / 5. El contrato trae `you.combat.troopCap` (serialize.ts:508). |
| 4 | La rueda de 7, igual; banco 7/7 con el mismo hash | ✅ | No he repetido el banco: según `implementacion.md`, dos pasadas con `sha256: b9dbd8a1…`, «ancla: igual». `pnpm qa` 7/7 en verde (también en la tanda del ingeniero). La de 7 la pinta y la juega igual (la arena con la rueda de 7, en las capturas del ingeniero). |
| 5 | La de 5: cuatro tipos más Normal, en ciclo | ✅ | Partida s2 5/5 y arena 7/5, leído en el parte: «Ofensivo-fuerte contra Rápido: máximo; contraataque mínimo», «Rápido contra Romper guardia: máximo», «Defensivo-finta contra Romper guardia: mínimo; contraataque máximo», «Defensivo-finta contra Ofensivo-fuerte: máximo», «Rápido contra Defensivo-finta: medio» (enfrente), «Ofensivo-fuerte contra Romper guardia: medio» (enfrente), «Normal contra Rápido: medio». Es el ciclo de la decisión 1. |
| 6 | La de 3: Ofensivo, Defensivo y Rápido, sin Normal, en ciclo | ❌ | Los cruces que se pueden ver están bien: «Ofensivo contra Defensivo: mínimo; contraataque máximo», «Rápido contra Rápido: medio» (con sus dos golpes), «Ofensivo contra Ofensivo: medio». **Pero la persona no puede dar un golpe**: hallazgo 1. |
| 7 | Las fusiones hacen la media, no la suma | ✅ (con la observación del hallazgo 4) | `efectoDelTipo` sobre las armas de verdad. **Espada** (todo a 3): Ofensivo +3 → Of-f +1; Fuerte ×1,5 → ×1,25; Defensivo +3 → Def-f +1; Rápido 2×0,63 → 2×0,56; Romper guardia 0,0,−1,−2,−3 → 0,0,0,−1,−1. **Mandoble** (troll): Ofensivo +4 → +2; Fuerte ×1,83 → ×1,41; Defensivo +2 → +1; Romper guardia 0,−1,−2,−3,−4 → 0,0,−1,−1,−2. **Maza**: Fuerte ×1,83 → ×1,41; Ofensivo +3 → +1; Romper guardia hasta −5 → hasta −2. En la partida, «Defensivo-finta sobre Orko…: defensa +1». La Finta fusionada deja andar la mitad (nota: «puedes andar la mitad de las casillas que te queden menos …»). |
| 8 | Las tres ruedas en partida, arena y espectador | ❌ | De 5: disco de 4 sectores más Normal, iconos de las dos partes, «1–5», notas y desenlace, en la partida (golpe y respuesta del héroe, golpe y respuesta de la tropa) y en la arena. De 3: tres sectores, «1–3», solo en la **respuesta**; el **golpe** no abre (hallazgo 1). Espectador: no lo he probado (ver «No probado»). |
| 9 | La IA elige entre los del nivel; el agente recibe los suyos y se le rechaza otro | ✅ | En los partes, la IA solo juega tipos de la rueda de la batalla. `HEROES_TROPA=7 HEROES_RUEDA=3 pnpm qa` en verde: «Golpeaste con "offensive_strong"; attacker-1 respondió "defensive_feint": el golpe cayó en el punto mínimo», y una respuesta mala: «"mega" no es un golpe de la rueda; valen offensive_strong, quick_guard_break, defensive_feint … La batalla sigue siendo tuya». El hit de otra rueda: `golpeDelHit('quick', RUEDAS[3])` lanza «… no es un golpe de la rueda de 3 de esta batalla; valen …» (agent-contract.test.ts:1821). |
| 10 | Selectores en «Nuevo juego», URL, recarga, valores malos, 7/7 por defecto | ✅ (hallazgo 5, menor) | «Nuevo juego»: Tropa 3/5/7 y Rueda 3/5/7, marcados en 7; lo elegido sobrevive a cambiar de facción y a «Volver». Empezar → `/?seed=16241&faccion=elfos&heroe=guerrero&tropa=3&rueda=3&solo-heroe=1`, y recargar deja la misma. «Partida rápida» → `…&tropa=7&rueda=7`; un enlace sin ellos (`?seed=9&faccion=elfos&heroe=guerrero`) → con `&tropa=7&rueda=7`. Rechazos con su motivo: `rueda=4`, `tropa=6`, `tropa=03`, `solo-heroe=0`, `solo-heroe=true`, `rueda=5&rueda=5` («va 2 veces»). Vacío = el de siempre; `tropa= 3` (con espacio) vale 3. |
| 11 | La arena, con los dos selectores y el enlace v14 | ✅ | Selectores en la barra; con 3 por bando, el tercero dice «El bando izquierdo ya lleva 3: no cabe ninguna más». El enlace copiado lleva `"v":14` y `"combate":{"tope":3,"rueda":3}`; abrirlo monta con 3/3 marcado. Rechazados, cada uno con su motivo: v13 («es de una versión anterior … (la 13; la de hoy es la 14)»), sin `combate` («falta «combate»»), rueda 4, y cuatro unidades con tope 3 («lleva 4 unidades y caben 3: quita 1»). Tope 7 con rueda 3 monta bien. |
| 12 | «Solo la rueda del héroe», conmutable en la batalla | ❌ con la rueda de 3 · ✅ con la de 5 | Rueda de 5 (s2, batalla contra 4 coraceros): con la casilla marcada, la rueda se abre para el golpe y la respuesta de Grommash; los golpes y las respuestas de los orkos los elige la IA sin abrir nada («Defensivo-finta contra Defensivo-finta», «Romper guardia contra Romper guardia»). Desmarcada a media batalla («Eliges en la rueda con toda tu tropa.», la URL pierde `solo-heroe`), desde el golpe siguiente se abre para los orkos. Marcada otra vez en la batalla siguiente, la URL vuelve a llevar `&solo-heroe=1`. Rueda de 3: el golpe del héroe se atasca (hallazgo 1). |
| 13 | Sin su héroe y con la opción, ninguna rueda | ✅ | `?seed=1&tropa=3&rueda=3&solo-heroe=1`, con el héroe fuera de la base: el día 3 atacan la guarnición (3 arqueros). En toda la batalla no se abre ninguna rueda; los tres cruces de mi bando los elige la IA («Ofensivo contra Ofensivo», «Rápido contra Rápido», «Ofensivo contra Defensivo: mínimo; contraataque máximo»). |

`pnpm verify` (una vez): exit 1, con `Tests 1 failed | 3842 passed | 12 skipped (3855)`. Typecheck y lint en
verde («Checked 448 files … No fixes applied»). Los dos fallos son de tiempo:
`escenario.test.ts › junto a un puente (#157)` («62483ms») y un «Timeout calling "onTaskUpdate"», con carga
entre 7 y 17. Ese test, solo: `✓ … 15868ms`, `Tests 1 passed`, 18,85 s. Pinta el suelo de un mapa y nada
en él es de esta tarea (el mapa no depende del tope, y el banco lo confirma). **Confirmado: no es un
hallazgo.** Pero los tests tampoco cazan el hallazgo 1.

## Hallazgos

### 1. BLOQUEANTE: con la rueda de 3, el golpe de la persona contra quien puede devolverlo se queda atascado

Quien juega pulsa un enemigo con «Golpearías desde …». La unidad anda y se planta, pero la rueda no se
abre. La barra dice:

> «normal» no es un golpe de la rueda de 3: valen ofensivoFuerte, rapidoRomper, defensivoFinta

(con los ids de dentro, que la persona no entiende). Después, nada saca a la unidad de ahí:

- Escape no hace nada.
- Pulsar otra vez al enemigo da el mismo error.
- «Terminar turno» contesta «attacker-heroe está plantado ante defender-1: elige en la rueda o cancela el golpe».
- «Defender» está apagado.

En la partida solo se sale con «Resolver sola», que regala la batalla a la IA. En la arena no hay salida.
No sale nada en la consola.

**Causa** (probada contra el núcleo): `previsionDeLaRueda(state, accion, 'golpe')`, cuando hay
contraataque, calcula el de referencia con Normal: `contraataque: conContraataque ?
contraataqueCon(delSector('normal')) : null` (`src/core/battle/battle.ts:3458`). La rueda de 3 no tiene
Normal, así que `nombreEnLaRueda('normal', forma)` lanza. Con un script sobre `createBattle` (dos guerreros
con escudo adyacentes):

```
rueda 3 golpe LANZA: «normal» no es un golpe de la rueda de 3: valen ofensivoFuerte, rapidoRomper, defensivoFinta
rueda 3 respuesta ok · rueda 5 golpe ok · rueda 5 respuesta ok · rueda 7 golpe ok · rueda 7 respuesta ok
```

El cliente ya contaba con ese caso: `contraataqueRebajado` (`client/rueda/rueda.ts:217`) dice «en la de 3,
dicho sin nombre». El núcleo no lo hace.

**Por qué no lo cazó nadie:**

- Los tests de «Solo la rueda del héroe» (`session.test.ts:849`) juegan la rueda de 7 y eligen `'normal'`.
- Ningún test pide la previsión del golpe en la de 3 con contraataque.
- En el navegador, el ingeniero vio la de 3 solo en la respuesta y en la arena IA contra IA.
- `capturas` no pasa por la de 3.

**Reproducir en la partida** (1440×900):

1. Abre `http://localhost:3177/?seed=2&tropa=5&rueda=3&solo-heroe=1` y pulsa «Volver al mapa».
2. Haz clic dos veces en el camino de abajo (700, 600).
3. Haz clic en el grupo de 4 coraceros (697, 505): empieza la batalla.
4. Pulsa «Defender» con todos durante dos rondas.
5. En la ronda 3, Grommash golpea a Coracero B: sale el error.

Pasa igual sin `solo-heroe`, con cualquier unidad.

**Reproducir en la arena:**

1. Pon Tropa 7 y Rueda 3.
2. Izquierda (Yo): «+ Héroe» y 2 «Troll con maza». Derecha (IA): 3 «Guerrero con escudo».
3. Pulsa Luchar (semilla 81387).
4. Defiende dos rondas. En la ronda 3, el héroe carga contra el Guerrero con escudo A.

**Qué esperaba quien juega:** la rueda de 3 para elegir su golpe.

### 2. IMPORTANTE: en las ruedas de 3 y 5, la guía de la respuesta no explica el ciclo y engaña

En la respuesta, la guía dice siempre:

> Elige tu respuesta sin ver su golpe: si lo aciertas recibes el mínimo y devuelves el máximo.

Esa frase es la de la rueda de 7 (`client/rueda/rueda.ts:359`, sin tocar), donde «acertar» es elegir el
mismo tipo. En un ciclo, elegir el mismo da el **medio**. Para recibir el mínimo hay que elegir el tipo que
**gana** al suyo, y eso no se dice en ninguna parte de la respuesta: ni en la guía ni en las notas de los
sectores (`efectoDeGolpe` solo dice lo que hace cada tipo). La regla del ciclo (`DICHO_DEL_CRUCE`) solo
sale en la guía del golpe.

Quien defiende su base el día 3 ve la rueda por primera vez en la respuesta, así que juega la de 3 sin
saber que «Defensivo gana a Ofensivo».

Se ve en `rueda-3-respuesta-20.png` (s1 3/3, día 3) y en `rueda-5-respuesta-15.png` (s2 5/5, día 3).

**Qué esperaba quien juega:** que la respuesta le diga a quién gana cada uno, como el golpe.

### 3. MENOR: `pnpm qa` con tope 3 o 5 sale 1 por un 7 escrito a mano en la política del arnés

Lo he comprobado:

- `HEROES_TROPA=3 HEROES_RUEDA=3`, `3 / 7` y también **`5 / 5`** salen 1 con «el agente no ha licenciado
  tropa ni una vez».
- `7 / 3` sale en verde, con la rueda de 3 cruzando entera («defender-4: ataque a attacker-1 con
  "offensive_strong"…», 18 peticiones por batalla).

El motivo está en `tools/qa/politica.ts:70`, que solo licencia con `lleva >= 6` (el tope de 7 menos el
héroe). Con tope 3 o 5 el héroe nunca llega a 6.

**Juicio:** es una limitación del arnés, no un fallo del juego. Se puede aceptar para cerrar, porque el
circuito que esta tarea toca (rueda, `hit`, `response`, `you.combat`) cruza en verde con 7/3. Pero es el
tope escrito dos veces, y el contrato ya trae `you.combat.troopCap`: el arnés debería licenciar con
`troopCap − 1`. Así `pnpm qa` valdría con cualquier nivel. Ojo: no falla solo con 3, como decía el
encargo; con 5 también.

### 4. MENOR (lo decide el usuario): con un arma de Rápido bajo, «Rápido» fusionado pega más que el Rápido suelto

Con el Mandoble y la Maza (Rápido al nivel 1):

- Rápido suelto: 2 × 0,38.
- Rápido-romper guardia (el «Rápido» de la de 3): 2 × 0,44.

La regla del plan, |fusionado − neutro| ≤ |suelto − neutro|, se cumple: a ese nivel el Rápido es un castigo,
y la mitad de un castigo castiga menos. Pero no encaja con lo literal de la petición: «limitar un poco los
efectos de las fusiones … que suma menos daño … que cada uno por separado». Con la Espada no pasa
(2 × 0,63 → 2 × 0,56). Todo lo demás de esas armas baja como debe.

### 5. MENOR: una URL con solo la complejidad se trata de dos maneras

`/?tropa=3&rueda=5&solo-heroe=1` (sin semilla) abre el menú:

- «Nuevo juego» enseña 7 / 7 y la casilla sin marcar, y al empezar pisa lo que traía la URL.
- «Partida rápida» lo conserva y juega 3 / 5 con la opción (`…?tropa=3&rueda=5&solo-heroe=1&seed=8156…`).

Una de las dos cosas sobra: o el menú parte de lo que trae la URL, o la rápida lo quita.

### Observaciones (sin más)

- En la rueda de 3, el centro es un plato vacío que parece un botón sin nada.
- En el móvil (390 px) el selector «7 por bando» salta a la línea siguiente. No hay desplazamiento lateral.
- Un héroe muerto en una batalla de defensa la pierde aunque le quede la tropa entera: s1 y s2, día 3, las
  dos Flechas mágicas y una carga. Así era antes: no es de esta tarea, pero hace muy difícil ver la rueda
  del héroe en defensa.

## Workarounds usados

- **Mi propio Chromium sin pantalla** por CDP, con un monitor de consola. No afecta a quien juega.
- **Clics en el mapa por coordenadas** y un barrido del ratón sobre el tablero para encontrar un
  «Golpearías desde …». Es lo mismo que hace quien juega a mano; no afecta.
- **«Defender» hasta que el enemigo llega al contacto**, para tener golpes cuerpo a cuerpo. Es una forma
  de jugar legal; no afecta.
- **Permiso del portapapeles** para leer el enlace de la arena. La persona lo pega con el suyo; no afecta.
- **«Resolver sola»** para salir de la batalla atascada de la rueda de 3. **Es el hallazgo 1**: quien juega
  necesitaría lo mismo, y en la arena ni siquiera existe esa salida.

## No probado

- **El espectador con la rueda de 3.** El ingeniero lo vio con la de 5. El espectador no llama a
  `previsionDeLaRueda` (solo `session.ts` la usa) y su desenlace es el mismo código que el de la partida,
  que sí he visto con la de 3. Riesgo bajo, pero sin verlo.
- **Recoger la guarnición en el navegador.** Lo cubren el código y `tropa.test.ts`.
- **La rueda de 3 y la de 5 en el móvil.**
- **`verify:lento`, `capturas` y `banco`.** No los he repetido: los cito de `implementacion.md`, en verde
  tras la última vuelta. Ninguno pasa por el golpe de la persona con la rueda de 3.

## Vuelta 2 (22-10-2026)

Re-verificación de lo que tocó la «Vuelta de QA 1» de `implementacion.md`, en el flujo real. Usé el `pnpm dev` de
http://localhost:3177/ (PGID 100357, sin tocarlo: sigue escuchando) y un Chromium sin pantalla mío, por CDP (puerto
9333, parado por su grupo y comprobado libre). Para el espectador arranqué un servidor `HEROES_TROPA=3 HEROES_RUEDA=3`
en puertos del sistema (44617 y 46481), con un agente de prueba que juega con la política de `pnpm qa` y tarda 1,8 s
por jugada de batalla. Salió solo al acabar la partida y comprobé que los dos puertos quedaron libres. Los scripts, los
registros y las capturas están en el scratchpad de esta sesión (`…/scratchpad/`: `p2-rueda-*.png`, `ar-rueda-*.png`,
`esp-*.png`, `a4.log`, `a5.log`, `p5.log`, `sp.log`, `qa-*.log`).

No he repetido `verify`, `verify:lento`, `banco` ni `capturas`. Cito `implementacion.md` («Vuelta de QA 1 ›
Verificación»):
- `pnpm verify`: exit 0, 3852 tests.
- `pnpm banco`: `b9dbd8a1…`, «ancla: igual».
- Barrido 3/3 y 5/5: 0/4 sin terminar.

### Veredicto: **APTO CON RESERVAS**

El bloqueante está arreglado. Con la rueda de 3, la persona golpea y responde en la partida y en la arena, con y sin
«Solo la rueda del héroe». Escape antes de elegir cancela y devuelve el turno. El espectador cuenta la rueda de 3.
«Nuevo juego» arranca con lo que trae la URL.

Quedan dos hallazgos menores, ninguno del juego en sí:
- `pnpm qa` sale rojo con tope 3 y la rueda de 5 o 7, por la semilla que elige el arnés.
- En las ruedas de ciclo, las notas cuentan éxitos («alto», «bajo») que no pueden salir.

### Criterios afectados

| # | Criterio | | Evidencia |
|---|---|---|---|
| 6 | La de 3: Ofensivo, Defensivo y Rápido, sin Normal, en ciclo | ✅ | **Partida** `?seed=2&tropa=5&rueda=3` (orkos), día 1, contra 4 coraceros. Tres sectores (`ofensivoFuerte`, `rapidoRomper`, `defensivoFinta`), «1–3». Golpean el héroe y los cuatro orkos, 17 ruedas sin atascarse, y la batalla acaba en «Victoria». En el parte: «Defensivo contra Rápido: mínimo», «Rápido contra Defensivo: máximo; contraataque mínimo», «Ofensivo contra Ofensivo: medio», «Rápido contra Rápido: medio; contraataque medio». **Arena** (tope 3, rueda 3, héroe + Troll + Orko con dos armas contra 3 guerreros con escudo, IA, `?seed=81387`): «Gana el bando izquierdo en la ronda 5». En el parte: «Ofensivo contra Rápido: máximo», «Defensivo contra Rápido: mínimo; contraataque máximo», «Rápido contra Defensivo: máximo». |
| 8 | Las tres ruedas en partida, arena y espectador | ✅ | **Partida y arena con la de 3**: lo de la fila 6. **Arena con la de 5**: golpe y respuesta, cuatro sectores más Normal, «1–5». **Espectador con la de 3**: lo había dejado sin probar en la vuelta 1. Lo veo con la partida del servidor 3/3: la batalla del agente es 3 contra 3. Cuento 11 desenlaces con tres sectores (`esp-9.png`), cada uno con su rótulo bien según el ciclo: «Defensivo contra Rápido · ¡Parado! Mínimo · contraataque máximo», «Rápido contra Defensivo · ¡Máximo!», «Defensivo contra Ofensivo · ¡Máximo! · contraataque mínimo», «Rápido contra Ofensivo · ¡Parado! Mínimo · contraataque máximo». El agente recibe `wheel: {"types":3,"ring":["offensive_strong","quick_guard_break","defensive_feint"],"center":false,"crossing":"cycle"}`. Ningún error de consola en el espectador. |
| 10 | Selectores, URL, recarga y valores malos | ✅ (hallazgo 5 de la vuelta 1, arreglado) | Al pulsar «Nuevo juego», los selectores marcan lo que trae la URL: `?tropa=3&rueda=5&solo-heroe=1` → 3, 5 y la casilla; `?tropa=5` → 5 y 7; `?solo-heroe=1` → 7, 7 y la casilla; `?rueda=3` → 7 y 3. Si desde `?tropa=3&rueda=5&solo-heroe=1` elijo en el menú 7, 3 y sin casilla, la partida empieza en `?tropa=7&rueda=3&seed=13895&faccion=orkos&heroe=orko`, sin `solo-heroe`: manda lo elegido. Al recargar, sigue igual. «Partida rápida» desde `?tropa=3` → `…&tropa=3…&rueda=7`. Con `?rueda=4` o `?solo-heroe=si` la página no arranca y dice por qué y qué quitar. `?seed=&tropa=5` abre el menú. |
| 12 | «Solo la rueda del héroe», cambiable en la batalla, con la de 3 | ✅ | Partida `?seed=2&tropa=5&rueda=3` sin la casilla. Ya en la batalla marco «Solo la rueda del héroe»: la barra dice «Solo eliges en la rueda con tu héroe: la de tu tropa la elige la IA.» y la URL gana `&solo-heroe=1`. Desde ahí se me abren para elegir los 3 golpes y las 3 respuestas de Grommash (`fase=golpe`/`respuesta`, tres sectores). Los golpes de los orkos y los golpes del rival a los orkos salen solo como desenlace, sin elegir nada: «Rápido contra Defensivo · ¡Máximo!», «Ofensivo contra Rápido», «Defensivo contra Defensivo · Medio». |
| Guía de la respuesta (hallazgo 2 de la vuelta 1) | Ruedas de 3 y 5 | ✅ | En las dos ruedas, la guía de la respuesta dice: «Elige tu respuesta sin ver su golpe; cada tipo gana al siguiente en el sentido del reloj (y el último al primero): si gana el golpe, cae en el máximo; si gana la respuesta, en el mínimo; con el mismo o el de enfrente, en el medio. Tu contraataque cae en el punto contrario.» Y cada nota dice a quién gana su tipo. En la de 3: «Ofensivo … Gana a Rápido y pierde con Defensivo», «Rápido … Gana a Defensivo y pierde con Ofensivo», «Defensivo … Gana a Ofensivo y pierde con Rápido». En la de 5: «Rápido … Gana a Romper guardia y pierde con Ofensivo-fuerte», «Romper guardia … Gana a Defensivo-finta y pierde con Rápido», «Defensivo-finta … Gana a Ofensivo-fuerte y pierde con Romper guardia». Normal: «Contra cualquier golpe, el cruce cae en el medio, y tu contraataque también». Va igual al golpear y en la respuesta sin contraataque. |
| `pnpm qa` con tope 3 (hallazgo 3 de la vuelta 1) | | ⚠️ parcial (hallazgo V2-1) | `HEROES_TROPA=3 HEROES_RUEDA=3`: exit 0. Da «licencias: 1», la respuesta mala la rechaza con «"mega" no es un golpe de la rueda; valen offensive_strong, quick_guard_break, defensive_feint», y hace 9,0 peticiones por batalla. Con 7/7, 5/5, 5/7 y 7/3: exit 0. **Con 3/7 y 3/5: exit 1**, «ningún "attack" del agente ha entrado con su "hit"». **Con 5/3: exit 1**, «ningún individuo de la tropa del agente ha llegado equipado». La licencia ya no falla en ninguna. |

### Pasada adversarial

- **Escape antes de elegir con la de 3**, en la partida (Grommash) y en la arena (Orko con dos armas): la rueda se
  cierra, la barra dice «Golpe cancelado.», la unidad sigue activa donde llegó y puede volver a golpear desde ahí. La
  rueda vuelve a abrirse y el golpe se da. No se atasca.
- **La previsión con la de 3**: la nota del Rápido dice, por ejemplo, «Su contraataque (sin quitarle nada, 20–44)
  queda, según el éxito, en: máximo, 18–40; alto, 18–40». La referencia «20–44» es la misma cifra que pone la barra
  al pasar el ratón («Contraataque con Espada: 20–44»), así que las dos cuentan lo mismo. En este caso no sale más
  ancha que la de la rueda de 5: con el mismo montaje en la arena, la de 5 dice «(con Normal, 10–34)» y la de 3,
  «(sin quitarle nada, 10–34)». «Sin quitarle nada» se entiende como «si no le quitas ataque», que es lo que
  significa. El problema de la nota es otro: el hallazgo V2-2.
- **Respuesta sin contraataque** («ya devolvió un golpe esta ronda»): con la de 3, las notas dicen a quién gana cada
  tipo y que solo cuenta para el cruce. Bien.
- **Con 3 por bando**: en el servidor, en la partida y en la arena, la batalla es 3 contra 3. Las ruedas de la tropa
  no salen cuando está marcado «Solo la rueda del héroe».
- **La batalla de defensa** de `?seed=1&tropa=3&rueda=3`, con el héroe dentro de la base: el día 3 se abre la
  respuesta de Aerin con la guía nueva. Muere en la ronda 2 (dos Flechas mágicas y una carga), como en la vuelta 1.
  No es de esta tarea.
- **Consola**: ningún error ni aviso en la partida, la arena ni el espectador. Los dos únicos errores son los que
  tienen que salir: el «[arranque] la página no arranca» de `?rueda=4` y el de `?solo-heroe=si`.

### Hallazgos de la vuelta 2

#### V2-1. MENOR (arnés): `pnpm qa` sale rojo con tope 3 y la rueda de 5 o 7, y con 5/3

**Qué se ve**: con 3/7 y 3/5 falla `exigeLaRueda`. En la batalla del agente hay 6 `battle_turn` y 2
`battle_response`, y ningún `attack` es legal, porque la política defiende y se mueve. Con 5/3 falla
`cruzaElEquipo`.

**La causa** es de la misma familia que el hallazgo 3 de la vuelta 1: el arnés no sabe en qué complejidad se juega.
- La semilla la busca `semillaDelArnes` → `jugarPartidaDelArnes` (`tools/qa/partida-del-arnes.ts:121`). Monta un
  `Director` sin `combate`, así que busca con 7/7 aunque el servidor juegue con `HEROES_TROPA`/`HEROES_RUEDA`.
- Por eso sale la semilla 1 en las nueve combinaciones (lo dice «[qa] semilla 1, buscada…» en cada registro), y las
  ocasiones que la búsqueda dio por buenas no se dan en la partida de verdad.
- Además, `faltaParaElArnes` no pide un ataque cuerpo a cuerpo del agente, que sí exige `exigeLaRueda`.

**Qué no es**: ningún rechazo del juego («0 descartadas» en la batalla).

**Reproducir**:

```
HEROES_TROPA=3 HEROES_RUEDA=7 pnpm qa
```

Sale con exit 1 y «ha fallado: Error: ningún "attack" del agente ha entrado con su "hit": el golpe no cruza el
contrato».

**Qué se esperaba**: que `pnpm qa` valga con cualquier nivel, como pedía el arreglo del hallazgo 3.

#### V2-2. MENOR (texto): en las ruedas de ciclo, las notas cuentan éxitos que no pueden salir

En las ruedas de 3 y 5 el golpe solo cae en máximo, medio o mínimo (`puntoDelCruce`, `rueda.ts:130-133`). Aun así,
las notas, sacadas de la tabla de cinco puntos de la de 7, cuentan también «alto» y «bajo». Lo vi en la arena:
- **Rueda de 3, «Rápido»**: «−2 con éxito máximo, −1 alto o medio, nada bajo o mínimo. Su contraataque (sin quitarle
  nada, 10–34) queda, según el éxito, en: máximo, 8–29; alto, 8–30; medio, 8–30».
- **Rueda de 3, «Defensivo»**: «puedes andar la mitad … menos 2 con éxito máximo, 3 alto, 4 medio, 5 bajo, 6
  mínimo».
- **Rueda de 5, «Romper guardia»**: «−4 con éxito máximo, −3 alto, −2 medio, −1 bajo, nada mínimo … en: máximo,
  7–27; alto, 7–28; medio, 8–29; bajo, 8–30».

En el mismo diálogo, la guía de arriba dice que solo hay máximo, medio y mínimo. En la de 3, la guía dice además «con
el mismo o el de enfrente, en el medio», y con tres tipos no hay ninguno enfrente: es la frase única de
`DICHO_DEL_CRUCE.ciclo`, escrita para la de 5. El medidor del desenlace también enseña las cinco muescas.

Ya pasaba en la vuelta 1 con la de 5; no lo apunté. `test/rueda.test.ts:1301` fija el punto 3 («alto») para la
rueda de 3.

**Qué esperaría quien juega**: que las notas de una rueda de ciclo solo hablen de los tres resultados posibles.

### Workarounds de la vuelta 2

- **Chromium sin pantalla por CDP**, el barrido del ratón para encontrar «Golpearías desde…» y «Defender» hasta que
  llega el contacto: lo mismo que en la vuelta 1. No afectan a quien juega.
- **El agente de prueba del espectador** es la política de `pnpm qa` con una pausa. No afecta: quien mira juega con
  un agente de verdad.
- **En la batalla de «Solo la rueda del héroe»**, mi script pulsó teclas durante el desenlace de la tropa. El juego
  contestó «Espera a que termine la jugada.» y no hizo nada: es lo correcto.

### No probado (vuelta 2)

- La rueda de 3 y la de 5 en el móvil.
- El espectador con la rueda de 5 en esta vuelta: lo vio el ingeniero y no cambió nada que lo toque.
- `verify:lento`, `capturas` y `banco`: citados de `implementacion.md`. No he repetido `pnpm verify`: nada me hizo
  sospechar.
