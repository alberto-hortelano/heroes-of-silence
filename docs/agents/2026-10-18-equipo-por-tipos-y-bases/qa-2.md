# QA, vuelta 2: la rueda del arma por niveles absolutos (0-6)

Validado contra la petición literal de la vuelta 2 y las decisiones del usuario de `requisitos.md`
(incluido el visto bueno de `plan-2.md`), sobre el diff sin commitear del worktree
`arena-equipment-ui-e47459` (HEAD `a20f06ee`). Nada tocado del código ni de los datos: el borrador
de unidades se modificó un momento para una prueba y se devolvió byte a byte (`cmp`, igual).

## Cómo se probó

- `pnpm verify` una vez: exit 0, «Test Files 138 passed | 1 skipped (139)», «Tests 3372 passed |
  14 skipped (3386)», 73,9 s.
- **No repetidos** (implementacion-2.md los da en verde sobre este mismo diff, y no hay motivo de
  duda): `pnpm banco` (sha256 `4ec21762…867d`, «ancla: igual», 0/200 sin terminar), `arena-ia.ts`
  (tanda «rueda: mezcla» con 0 sin terminar en azar y en rueda; las 2 + 1 de las tandas viejas,
  idénticas en HEAD), `capturas` (pasadas equipo, armas, rueda-del-golpe, rueda-contrincantes,
  arena, sin errores en consola). `pnpm qa`: no aplica (no se toca `src/server/` ni el contrato).
- Flujo real: `npx vite --port 3471` (grupo propio con `set -m`, PID 254392, matado por su grupo;
  `ss` dice el 3471 libre al acabar; el 3320 y el 3100 no se tocaron) y Chromium de Playwright sin
  pantalla, con clics y teclas de verdad desde `/arena/` (sin `?montaje=` preparado: todo montado
  con la lista, la ficha y el editor). Consola sin errores ni avisos en todas las pasadas.
- Núcleo con `tsx` solo para leer lo que no se ve en pantalla (el arma con que pelea cada stack de un
  enlace reabierto, las velocidades de las hojas y la Finta por nivel).

## Criterios

| # | Criterio (vuelta 2) | | Evidencia |
|---|---|---|---|
| 1 | Toda arma de cuerpo a cuerpo de la arena lleva un nivel 0-6 en los seis tipos; Normal sin nivel, ×1; la tabla en `data/rueda.json` | ✅ | `data/rueda.json`: siete enteros por tipo (Fuerte 100…200, Rápido 25…100 con `golpes: 2`, Ofensivo y Defensivo 0…6, Romper guardia 0…−6, Finta 10…0 con `conExitoMinimo: 10`), sin `normal`. Las ocho de cuerpo a cuerpo del editor salen con sus seis niveles («Rueda: Ofensivo 3, Fuerte 5, Finta 1, …»). Una de la arena sin rueda o con `normal` no carga (tests de `equipo.test.ts` en verde). Rápido llega a 2 × 1 (decisión del usuario). |
| 2 | Barra 0-6 llena desde la izquierda, «−» a la izquierda y «+» a la derecha (también la Finta), lo que da al lado, sin Normal, sin pasar de 0 ni de 6 | ✅ | Seis filas por arma, orden `rótulo · − · barra · + · casilla · final`, «−» en x=775 y «+» en x=881 en las seis (`qa2-01-espada.png`). Relleno del SVG desde x=0: nivel 3 → 30 de 60, 6 → 60, 0 → sin relleno. Daga Rápido 6: «+» `disabled` y un clic forzado no lo mueve; Fuerte 1 → «−» → 0 («Daño ×1», «−» `disabled`). Finta: «+» sube (Daga 5 → 6, «resta 0 a 10 casillas»; Maza 1 → 2, «resta 8 a 10» → «resta 7 a 10»), «−» baja hasta 0 («resta 10 casillas») (`qa2-02`, `qa2-04`). Teclear 7, −1, 2.5 o vaciar no entra: «No se cambia: «Daga»: el nivel de Ofensivo es 7: va de 0 a 6.» y la casilla vuelve a 3 (`qa2-03`). Ninguna fila de Normal. |
| 3 | Con base, nivel final = base + extra; la barra enseña el final; final fuera de 0-6 no vale, con su motivo | ✅ | «Nueva sobre esta» de la Maza: casillas a 0 (sin `min`), barras en el final (Fuerte 5, Rápido 1). «+» en Fuerte → final 6 «Daño ×2», casilla 1, «+» `disabled`. Teclear extra 2 → «No se cambia: «Maza 2» (sobre «Maza»): el nivel de Fuerte es 7: va de 0 a 6.»; extra −3 en Rápido → «…el nivel de Rápido es -2…» (`qa2-05`). **El vínculo vivo no saca de rango**: subir el Fuerte de la propia Maza a 6 o bajar su Rápido a 0 se rechaza nombrando «Maza 2» (`qa2-06`); subir la Espada a Fuerte 6 se rechaza por «Espada de herrería» (sería 7), y con la Espada en 5 la bendita sale en 6 con «+» `disabled` (`qa2-07`). Cadena «Espada → Espada de herrería → Espada bendita», final 4/4/3/4/4/3. |
| 4 | La rueda teñida de al lado, con el tinte por nivel absoluto | ✅ | Cada sector con `data-nivel`, el centro (Normal «×1») sin nivel ni tinte. En la Maza, Fuerte y Romper guardia (5) en verde, Finta y Rápido (1) en rojo, Ofensivo y Defensivo (3) neutros; la barra y el final con el mismo tono (`qa2-12-maza.png`). Tras «+» en la Finta, el sector pasa a `data-nivel="2"`. |
| 5 | Golpe, contraataque, previsión y notas con las cifras del nivel del arma de cada golpe | ✅ | Pelea Yo contra Yo con «Golpe: rueda», semilla 7, Guerrero con escudo contra Orko con hacha y escudo, uno con Maza y otro con Daga, abriendo la rueda con un clic en el enemigo (`qa2-a-*`, `qa2-b-*`). **Maza golpeando**: Fuerte «×1,83» 49–87 frente a Normal 34 y Finta 23–44; Rápido «2 golpes ×0,38» 2 × 5–12; Ofensivo +3; Defensivo +3; Finta «menos 8 con éxito máximo o alto, 9 medio o bajo, 10 mínimo»; Romper guardia «−5 con éxito máximo, −3 alto, −2 medio, −1 bajo, nada mínimo». **Daga golpeando**: Fuerte «×1,17»; Rápido «2 golpes ×1», 2 × 4–15 (igual que la tirada sin modificar); Ofensivo +3; Defensivo +2; Finta «menos 2 … 4 alto, 6 medio, 8 bajo, 10 mínimo»; Romper guardia «−1 con éxito máximo, nada …». Todas casan con las fórmulas `⌊q·p/4⌋` y `v + ⌊(10−v)(4−p)/4⌋`. **Contraataque**: con la Maza respondiendo, «tu contraataque hace daño ×1,83» y Rápido ×0,38; con la Daga, ×1,17 y ×1. **Normal**: «Sin modificar» en los cuatro casos. La previsión de la barra nombra el arma («Cuenta: con Maza (cuerpo a cuerpo)», «Contraataque con Daga»). **A media pelea**: «Editar equipo» desde el panel, Fuerte de la Maza a 0, y la rueda siguiente dice «Fuerte … 23–44 de daño. Daño ×1.» (`qa2-c-*`). |
| 6 | Unidad de la arena sin arma de cuerpo a cuerpo no vale y lo dice; la Espada de la arena es la del héroe | ✅ | En la ficha del Guerrero con escudo, «×» del arma → «No se cambia: La unidad «Guerrero con escudo»: no lleva arma de cuerpo a cuerpo: en la arena nadie pelea sin ella; ponle una en Arma.» y sigue con la Espada (`qa2-08`); Garrote o Espada de armería → «…lleva «Garrote», que es del juego: el arma de cuerpo a cuerpo de la arena es una de la arena.» Con el `elfo-arquero` del borrador sin `"arma"` (cambio temporal, restaurado): «Avisos al leer (1)… elfo-arquero: la unidad «Arquero»: no lleva arma de cuerpo a cuerpo…», 11 unidades cargadas (`qa2-11`). Con el borrador real, sin avisos: los dos arqueros llevan «Daga, Arco, Jubón de arquero». El héroe en combate: «Cuerpo a cuerpo: Espada · Ataque 5 · Daño 30–70» (`qa2-10`); en el enlace reabierto, `attacker-heroe` pelea con `arma: "espada"` y la rueda de la Espada del enlace. |
| 7 | `data/equipo.json` con los seis niveles de cada arma y herrería/bendita con extras en niveles, inventado y dicho | ✅ | Espada 3/3/3/3/3/3, Maza 3/5/1/3/1/5, Mandoble 4/5/2/2/1/4, Daga 3/1/5/2/6/1, Bastón 2/2/4/5/3/2, Lanza 5/4/2/3/1/3; herrería `rueda {fuerte 1, rapido 1}`, bendita `rueda {ofensivo 1, defensivo 1}`; el `_comment` lo dice («LA RUEDA DEL ARMA … por niveles absolutos … INVENTADOS y provisionales»). |
| 8 | El juego no cambia; `arena-ia` sin peleas nuevas sin terminar | ✅ (citado) | De implementacion-2.md, sobre este diff: banco con el mismo hash; arena-ia, 0 sin terminar en la tanda nueva y las de antes idénticas a HEAD. No repetido (presupuesto). |
| V2 | «+ Nueva pieza» de cuerpo a cuerpo nace como la Espada (todo a 3) | ✅ | «Arma 2»: los seis en 3, «Daño ×1,5», «resta 5 a 10 casillas», «quita 0 a 3 de ataque». Nace sin ataque ni daño (la Espada da +2 y 10–30): el usuario pidió los niveles «como la Espada», no sus cifras. |
| V2 | Enlace v11 con las bases, se reabre igual; el de la 10 se rechaza | ✅ | Montaje: héroe y Guerrero con «Maza 2» (Maza + Fuerte 1) a la izquierda, Orko con Espada a la derecha, la Espada con Fuerte 2. El enlace lleva `version: 11` y las piezas `maza-2` (`base: "maza"`, `extras.rueda.fuerte: 1`) y la Espada cambiada. Abierto en otra página: «Montada la pelea del enlace (semilla 11)…», los dos bandos dicen lo mismo, y en la batalla del enlace la Maza 2 pega con Fuerte 200 % y el héroe y el Orko con 133 % (la Espada del enlace). Con `version: 10` a mano: «este enlace es de una versión anterior de la arena (la 10; la de hoy es la 11): vuelve a copiarlo». |

## Hallazgos

Ninguno bloqueante. Tres menores, de presentación; ninguno contradice un criterio a 1440 px.

### Menor 1 — Con el teclado, cada «+» o «−» de la rueda pierde el foco

Pasos: `/arena/` → «Editar equipo» → Maza → foco en la casilla de la Finta → Shift+Tab (el foco
queda en «+», `:focus-visible`) → Intro. La Finta sube a 2 y el foco se va a `<body>`: el segundo
Intro no hace nada (la Finta sigue en 2), y para subir otro nivel hay que volver a tabular. Igual con
Espacio en Ofensivo. Quien juega con teclado esperaba seguir pulsando «+». Causa probable: la
identidad con que `pintar` devuelve el foco incluye los `data-*` de los antepasados, y la fila
(`.barra-de-la-rueda`) lleva `data-nivel`, que cambia con cada paso, así que tras repintar no
encuentra el botón. Con el ratón no se nota (por diseño no se conserva).

### Menor 2 — Entre ~750 y ~850 px y por debajo de ~500 px, la columna «lo que da» queda cortada

Pasos: `/arena/` con la ventana a 768 px (o 840, 480, 390) → «Editar equipo» → Maza. Los finales
(«Daño ×1,83», «resta 8 a 10 casillas», «quita 0 a 5 de ataque»…) caen fuera del contenedor y solo
asoman sus primeras letras (`qa2-14-maza-768.png`, `qa2-13-maza-movil.png`; a 600, 680, 720, 900,
960, 1024, 1280 y 1440 se ven enteros). El disco de al lado sí da la cifra corta, así que la
información no se pierde del todo, pero el criterio 2 pide lo que da cada nivel «al lado» de la
barra. Probablemente lo empuja la columna del final ensanchada a 10,6 rem en esta vuelta. Ni
`capturas` (solo 1440) ni `cifrasCortadas` lo miran a esos anchos.

### Menor 3 — El arma del héroe no se ve fuera del combate, y la ficha de la unidad ofrece armas que siempre se rechazan

- La ficha del héroe en el montaje no nombra la Espada ni su rueda (sí su daño final 30–70), y la
  Espada en el editor dice «La llevan: Guerrero con escudo, …, Goblin lancero» sin el héroe. Quien
  retoca la Espada no sabe que cambia al héroe hasta verlo pelear (en combate sí lo dice: «Cuerpo a
  cuerpo: Espada»).
- El desplegable «Poner» del hueco Arma de la ficha de una unidad sigue ofreciendo Garrote, Hacha de
  leñador, Espada de armería y Estoque ligero, que ahora se rechazan siempre («que es del juego»); y
  el «×» del arma, que también se rechaza siempre. El motivo está bien dicho, pero son cuatro
  opciones y un botón sin salida.

## Workarounds usados

- **Dos unidades distintas para comparar armas.** La ficha de la unidad cambia el tipo, no el
  puesto: con el mismo Guerrero en los dos bandos, poner la Daga a uno se la ponía a los dos. Es el
  comportamiento de la arena de antes (la ficha edita la unidad del borrador), no de esta vuelta: no
  afecta a lo validado.
- **Mover con clics en coordenadas del tablero** (columna × 86 px a 1440×900) y pasar turnos con
  «Terminar turno» para acercar a los dos; el golpe se dio con un clic en la figura del enemigo, como
  lo haría quien juega. No se forzó ningún estado.
- **Borrador sin la Daga del elfo arquero**, un momento, para ver el aviso de una unidad sin arma:
  devuelto con `cp` de la copia y comprobado con `cmp`. No afecta al usuario.
- No se pulsó «Guardar» en ningún momento (escribiría el borrador del worktree).

## No probado

- `banco`, `arena-ia`, `capturas` y `verify:lento`: citados de implementacion-2.md, no repetidos.
- La IA eligiendo en la rueda con armas distintas (fuera de alcance: sigue a ciegas).
- La lanza de carga en el primer golpe de una carga en el navegador: lo cubren los tests de
  `rueda-del-arma.test.ts` (en verde); no se montó una carga a mano.

## Observación de juego: ¿sirve la Finta con la Espada?

Casi nunca. La Espada tiene la Finta en 3: resta 5 casillas con el éxito máximo, 6 alto, 7 medio,
8 bajo y 10 mínimo, de lo que **le queda** tras golpear. De las 51 hojas de la arena con su equipo
por defecto, 49 tienen de 2 a 5 casillas (2 de 2, 16 de 3, 13 de 4, 18 de 5) y solo una 6 y otra 7.
Así, una unidad que golpea sin moverse y saca el éxito máximo se queda con 0 casillas salvo esas dos
(1 y 2 casillas), y el éxito máximo es 1 de cada 7 respuestas al azar. En la pelea de la prueba, el
Orko de 3 casillas llegó con 1 por andar: con la Maza (8 a 10) o con la Espada (5 a 10), 0. Con la
Espada, la Finta es en la práctica un Normal con otro sitio en el anillo. Para que sirva hace falta
la Finta en 5-6 (la Daga en 5: 3 casillas − 2 = 1 con el máximo) o una tabla más generosa
(`finta.conExitoMaximo` y `conExitoMinimo` en `data/rueda.json`); además, los niveles 4 y 5 solo
se distinguen en el éxito máximo (3 frente a 2), y el 0 resta 10 siempre: es un tipo sin efecto.

## Veredicto

**Apto con reservas.** Los ocho criterios de la vuelta 2 y lo pedido en el visto bueno (la Daga de
los arqueros, el arma nueva como la Espada, el héroe con la Espada de la arena, el enlace 11) se
cumplen en el flujo real, con las cifras de la rueda del combate casando con la tabla en la Maza y
la Daga, y el vínculo vivo sin salirse de 0-6. Las reservas son los tres menores de presentación:
el foco del teclado en los pasos, los finales cortados a algunos anchos y lo que no se ve del arma
del héroe.

Capturas: `capturas/qa2-*.png` (en esta carpeta).

## Correcciones tras QA (coordinador, 18-10-2026)

- **H1, el foco con el teclado**: el nivel ya no va en la fila (`data-nivel` pasa a la barra y a lo
  que da), que era un antepasado de los botones; `pintar` conserva el foco. En la arena, dos Intro
  sobre «+» de Ofensivo lo suben de 3 a 5 con el foco en el botón. Test en `arena-equipo.test.ts`.
- **H2, la columna cortada**: con menos de 28rem para las barras (`@container`), lo que da cada nivel
  va en su línea bajo la barra. En la arena, a 390 y 768 px: 0 cortadas y sin desbordar la página.
- **H3** (el arma del héroe fuera del combate y el desplegable de la ficha con armas del juego) queda
  para otra tarea.

`pnpm verify` en verde (3 372 tests) y `CAPTURAS_SOLO=equipo pnpm capturas` sin errores (la pasada
lee ahora el nivel de la barra).
