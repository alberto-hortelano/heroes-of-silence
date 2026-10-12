# QA — «Nueva unidad», perfiles como equipo y el escudo (ciclo 2 del nivel único)

QA del 12-10-2026 sobre el árbol de trabajo de `main`, sin commitear y después de la vuelta de /simplify.

**Cómo se probó:**
- Vite propio en el puerto 3198 (`set -m`, PID 324674, matado por su grupo y comprobado `3198 libre`). El 3100 no se tocó.
- Chromium sin pantalla con Playwright.
- Un borrador de antes en `data/borradores/unidades.json`, borrado al acabar (no existía).
- Los scripts están en el scratchpad de la sesión (`qa/nucleo.mts`, `una-cifra.mts`, `arena1.mjs`, `arena2.mjs`, `arena390.mjs`, `colision.mjs`, `figuras.mjs`). No se copian aquí porque llevan rutas de esta máquina.
- Las capturas están en `capturas-qa/`.

## Comprobaciones corridas

- **`pnpm verify`**: `Test Files 121 passed | 1 skipped (122)`, `Tests 3013 passed | 14 skipped (3027)`, `exit 0` (50 s).
- **`pnpm qa`** (una vez, como evidencia de C8):
  - `69 veredictos, 69 entraron, 0 descartadas`;
  - `lleva {"weapon":"espada_de_armeria","armor":null,"accessory":null,"shield":null}`;
  - `unequip shield de hero-1: no se puede desequipar: Serena la Pálida no lleva nada en Escudo`;
  - `exit 0`.
- **Citados del ingeniero y no repetidos** (no ha cambiado nada desde entonces):
  - `verify:lento`: 4864 passed;
  - banco: `066767b4…`, igual;
  - `capturas`: exit 0;
  - `vite build`: exit 0.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | El cuerpo es común; mismo índice dentro de un personaje | ✅ | `nucleo.mts`: las 51 hojas por defecto dan nivel 1 y cada personaje tiene una sola lectura de «Índice · nivel». En el navegador, las nuevas «Guerrero con escudo 2» (espada y escudo, 3 casillas) y «3» (mandoble, 4 casillas) salen las dos con «Índice 177 · nivel 1» (el ingeniero; lo repetí en 390 px). |
| 2 | Las piezas suman daño y tiros y restan velocidad, y no mueven el índice | ✅ | 1 377 combinaciones de pieza × hoja (las 27 piezas de `EQUIPO` sobre las 51 hojas): ninguna mueve `indiceDePoder`. El esqueleto 2 con arco pasa de «10–10 daño» a «20–30 daño · 12 tiros» y sigue con el índice 177. |
| 3 | El escudo tiene su hueco y resta velocidad; dos manos no admite escudo, en una regla; el héroe sin escudo | ✅ | Matriz de 6 armas × 3 escudos: `manosBlocker` rechaza en las dos direcciones solo con las 5 armas a dos manos. Velocidad, cuerpo → combate: 4 → 3 con el escudo, 4 → 2 con el pavés; con 2 casillas no baja. `EQUIPO_BASE` = `{arma: espada_de_armeria, armadura: cota_de_malla, accesorio: brazal_de_armeria}`. En el montaje: «No se puede poner Pavés a Esqueleto 2: Pavés no se puede llevar con Arco…» (`03`). En plena pelea, el mismo rechazo dentro del editor (`08b`). |
| 4 | El juego no cambia | ✅ | Ni el botín, ni la armería, ni `PIEZAS_DEL_JUEGO` llevan piezas `arena` (`nucleo.mts`). Banco idéntico (cita del ingeniero). La prosa del agente no las ofrece (`agent-contract.test.ts`, en verde). |
| 5 | La arena tiene equipo | ✅ | Cuatro huecos con × y desplegable, en el montaje (`03`, `14b`) y en el editor de la pelea (`08`). La fila «En la pelea» cambia y «Índice · nivel» no. En combate, el parte escribe «(escudo: + Rodela, − Pavés)», «(escudo: − Rodela)» y «(arma: + Ballesta)», y la unidad pasa a tirar («8 tiros»). Las hojas por defecto nacen con el kit de su perfil (`17`: «lleva Espada, Brigantina, Escudo»). |
| 6 | Botón «Nueva unidad» | ✅ | Desde una hoja: `templario-escudo-2` y `-3`. Desde el catálogo: `peasant-2`, `skeleton-2` y `archer-2`. Todas con índice 1xx y nivel 1, sin equipo y con id único: 123 creadas en el núcleo, todas validan y vuelven igual por JSON. Pelean (la pelea de campesino 2 contra esqueleto 2 acaba en la ronda 6), se guardan y al recargar conservan el pavés. Crear sin cuerpo dice «Elige primero un cuerpo». El arte es el de su cuerpo; la nueva de criatura se pinta igual que esa criatura en el catálogo (ver H3). **Pero ver H1**: un id nuevo puede pisar una unidad conservada que no vale. |
| 7 | Compatibilidad: borrador de antes y enlace v4 → v5 | ✅ | El templario con ataque 6 pelea con «A 6 · D 7 · 20–40 · 150 PV · 4 casillas», sus cifras de antes. El esqueleto arquero con `level` + `speed` pelea con «A 5 · D 3 · 20–30 · 100 PV · 3 casillas · 12 tiros». El mandoble con 45–70 no cabe: se queda sin equipo y la barra lo dice (`01`). 300 borradores de antes al azar: los 300 pelean igual que antes y ninguno se convierte dos veces. Al recargar después de «Guardar», la barra ya no avisa de ninguna conversión. Enlace v4 → v5 con `{unidad}` y `{criatura}`; sin `perfilDe` lanza diciéndolo. Ver H2 sobre cuántos no caben. |
| 8 | El contrato y el agente: `shield` en inglés | ✅ | `pnpm qa` (arriba). La traducción vive solo en `contract/huecos.ts`. El motivo de un `unequip` vacío dice «Escudo», el nombre para leer, no la clave; pero la línea empieza por «unequip shield», así que el agente ve su clave (ver M4). |
| 9 | Verificación y documentación | ✅ | `verify` (yo); `verify:lento`, banco, `capturas` y build (citados). Playwright: crear, editar, pelear, mismo nivel con dos armas, el escudo resta y dos manos lo rechazan, todo con clics reales. CLAUDE.md lleva `unidadNueva` y `manosBlocker`; `historia.md`, la entrada «Nueva unidad…». |
| — | **Punto de control 1**: la velocidad es igual dentro de un personaje | ✅ | Una sola lectura de índice por personaje (`nucleo.mts`). Una unidad de antes convertida conserva su combate y no la velocidad de su personaje: el templario del borrador queda con un cuerpo de 5 casillas e índice 182/185. El ingeniero ya lo había declarado. |
| — | **Punto de control 2**: weapon/armor/accessory/shield en el contrato | ✅ | `equipment` trae las cuatro claves y `shield: null`. `unequip` con `"shield"` llega al núcleo. Con `"arma"` o `"casco"` se descarta diciendo los cuatro en inglés (tests en verde). |

**A 390 px** (los huecos que dejó el ingeniero):
- En el montaje y en la edición, `scrollWidth` = 390 y no se sale ningún elemento, también después de crear una unidad y de poner la «Lanza de jinete», el desplegable más ancho.
- El selector ocupa 358 px; el botón «Crear» va a su derecha.
- Las tarjetas «nueva» llevan el sello y los botones a la derecha de la figura y dentro de la tarjeta: la caja es 14–372 y los botones 73–367 (`11`, `13`, `12-*`, `15`).

## Hallazgos

### Importante

**H1. Una unidad nueva puede pisar sin avisar una unidad del borrador que no vale y que se conservaba.**
- **Qué pasa:** `crearUnidad` calcula el id libre con `[...borrador.keys(), ...hojasPorId.keys()]`, y ahí no entran las unidades que no validan. Esas se conservan tal cual al guardar, pero «mandar una válida con su clave es arreglarla» (`claveSinValidar`), así que la nueva sustituye a la conservada.
- **Pasos:**
  1. Pon en el borrador una unidad de hoy que no valga con id `templario-mandoble-2`. Por ejemplo, «Tramposo», con `equipo: {arma: mandoble, escudo: escudo}`. La barra al cargar dice «No valen y se conservan tal cual al guardar: templario-mandoble-2…».
  2. Crea «Nueva unidad» desde «Guerrero con arma a dos manos». Sale `templario-mandoble-2`.
  3. Pulsa «Guardar». La barra dice «Guardado…: 6 unidades.», sin el «Y 1 que no vale, tal como estaba» que salía antes.
- **Resultado:** en el archivo, `templario-mandoble-2` es ahora «Guerrero con arma a dos manos 2» y «Tramposo» ha desaparecido (`colision.mjs`).
- **Qué esperaba quien juega:** que lo que la barra promete conservar se conserve, y que la nueva tome el siguiente número libre (`-3`).
- **Cuándo pasa de verdad:** basta con que una unidad nueva guardada deje de validar, por ejemplo porque se retire o se renombre una pieza de `equipo.json`, o porque alguien toque el JSON a mano.

### Menor

**H2. Casi cualquier ajuste del daño o de los tiros en un borrador de antes hace que la conversión no quepa.**
- **Por qué:** el cuerpo común tiene daño 10–10, así que el cuerpo = antes − arma solo cabe si el abanico de daño de antes es al menos el del arma.
- **Medido** sobre las 51 hojas por defecto, cambiando una sola cifra (`una-cifra.mts`):

  | Cambio en el borrador de antes | Sin convertir |
  |---|---|
  | daño mínimo +5 | 51 de 51 |
  | daño máximo −5 | 51 de 51 |
  | 4 tiros menos (arco y ballesta) | 8 de 51 |
  | casillas +1 | 1 de 51 |
  | daño ×1,5, ataque −2, PV −50 | 0 de 51 |

  En los 300 borradores al azar, 201 se quedaron sin equipo.
- **Por qué no es más grave:** C7 lo admite («si no se puede, se dice»): pelean igual y se avisa. Pero una unidad sin convertir conserva el nivel de antes (el mandoble del borrador, «Índice 357 · nivel 3»).
- **El aviso habla de cifras que quien juega no escribió:** «el daño mínimo (15) no puede pasar del máximo (10)», cuando el borrador decía 45–70. Esos 15 y 10 son los del cuerpo calculado. Sería más claro algo como «su daño 45–70 es más estrecho que el del Mandoble (+30/+60)».
- Hoy no hay ningún borrador real en el repositorio, así que el impacto inmediato es pequeño.

**H3. Una unidad nueva con cuerpo del catálogo se pinta con el Y Bot teñido.**
- La figura es la misma que la de esa criatura en el catálogo de la arena: `data-figura="skeleton"` en las dos, `17`.
- No es «el Y Bot en lugar del arte», porque esa criatura no tiene arte propio, y lo que pide C6 se cumple.
- Pero en el selector «Esqueleto» del catálogo y la hoja «Esqueleto guerrero», que sí tiene arte, están a un clic, y nada avisa de que la primera sale como maniquí.
- Es una decisión para el usuario, no un fallo.

**H4. Una unidad nueva desde una criatura pierde los rasgos de su cuerpo salvo `charge` y `undead`.**
- Una nueva desde `bone_dragon` no vuela; tampoco hereda `double_attack`.
- `unidadNueva` lo hace así a propósito («`charge` si carga»), y C6 solo pide las cifras mínimas.
- Pero `flying` es del cuerpo, no del equipo, y quien elige un dragón como cuerpo esperaría que volara. Se decide y se documenta.

**H5. En el editor de la pelea, la barra de abajo se queda con el mensaje anterior.**
- Si se rechaza un cambio (por ejemplo, la ballesta con la rodela puesta), el motivo sale bien dentro del editor, en `#aviso-del-editor`: «No se cambia: No se puede poner Ballesta a Esqueleto 2: … quita antes el escudo.».
- Pero la barra de debajo sigue diciendo «Cambiado: vale ya en esta pelea.», que es justo lo contrario (`08b`).
- **Pasos:** monta el esqueleto 2 (lo llevas tú) contra el campesino 2. Pulsa «Luchar», luego «Editar» en Esqueleto 2, pon una rodela y después elige una ballesta.

**M4. El motivo de un `unequip` vacío dice «Escudo», no `shield`.**
- No es un fallo: la línea del veredicto empieza por `unequip shield de hero-1:`, así que la clave le llega al agente.
- La decisión del usuario decía «cualquier sitio donde viaje un hueco». Si se quiere a la letra, el motivo debería decir `shield`.

**M5.** Al crear una unidad en la vista de edición, la barra dice «añádela a un bando o cambia su ficha». En esa vista no hay bandos y la ficha ya está abierta.

**M6.** No se puede borrar desde la página una unidad nueva que se creó por error: no hay gesto para quitarla del borrador, y hay que editar el JSON a mano. Ningún criterio lo pide, pero «Nueva unidad» sin «Borrar» va llenando la lista.

## Workarounds usados

- **Escribir a mano un borrador de antes** en `data/borradores/unidades.json` para C7. Es el caso real que el criterio describe (un borrador antiguo en disco), no un atajo; quedó borrado y `git status data/` está como al principio.
- **Selectores `:visible` en el editor de la pelea:** la ficha del montaje sigue en el DOM, oculta, con los mismos `data-arena-pieza`. A quien juega no le afecta, porque solo ve una.
- **Elegir lo que lleva la IA** para que la pelea avance sola en la prueba de criaturas: es el botón «IA» de la página, el mismo que usaría quien juega.

## No probado

- **El panel del héroe del juego con «Escudo: —» en el navegador:** lo cubre el fixture `paneles.txt` (verde en `verify`), y no levanté `pnpm dev`.
- **Un enlace v4 con héroe o con muralla:** solo probé puestos de unidad y de criatura (el ingeniero, `?seed=9` en el navegador; yo, en el núcleo).
- **Equilibrio de rodela, pavés y cuerpo común:** las cifras son inventadas y no las he medido en peleas; queda fuera de alcance.
- **`capturas`, `verify:lento` y banco** no los repetí: están citados del ingeniero sobre el mismo árbol.

## Veredicto

**Apto con reservas.** Se cumplen los nueve criterios y las dos decisiones del punto de control: los probé en el núcleo, en Chromium (a 1440 y 390 px) y con `pnpm qa`, sin errores en la consola. La reserva es **H1**: una unidad conservada que no vale se pierde sin aviso cuando una nueva toma su id. Hay que corregirlo antes de cerrar (que `existentes` incluya los ids de lo que no vale). Los demás hallazgos son menores o decisiones para el usuario.

---

## Re-verificación (12-10-2026, tras la «Vuelta de QA» de `implementacion.md`)

Se mira solo lo de «Se corrigen» de `hallazgos-qa.md`, más una pasada adversarial sobre esos cambios. Todo sobre el árbol de trabajo de `main`, sin commit.

- **Montaje:**
  - un vite propio en el **3198**, arrancado con `set -m` (PID 340394);
  - matado por su grupo y comprobado: `3198 libre`. El 3100, de otra sesión, no se ha tocado.
- **Navegador:** Chromium sin pantalla (Playwright). Los scripts están en el scratchpad (`re/pw.mjs`, `re/pw2.mjs`, `re/adv.mts`).
- **Borradores temporales:** puse en `data/borradores/unidades.json` los ficheros `solo-invalidas.json` y `viejos.json`, y los borré al acabar. `data/borradores/` no existe, como al principio.
- **`pnpm verify`** (una vez): `Test Files 121 passed | 1 skipped`, `Tests 3016 passed | 14 skipped`, exit 0.
- **No repetidos**, se citan de `implementacion.md` sobre este mismo árbol: `pnpm banco` `066767b4…` (ancla igual, 0/200 sin terminar), `pnpm capturas` exit 0 sin errores en consola, y `verify:lento` no corrido (del núcleo solo cambia `core/arena.ts`).

| Punto | Estado | Evidencia |
|---|---|---|
| H1: el id libre cuenta también las que no valen | ✅ | **Navegador:** cargué un borrador con solo inválidas (`templario-mandoble-2`, `-3` y `bone-dragon-2`). Al crear dos mandobles y un dragón salen `templario-mandoble-4`, `-5` y `bone-dragon-3`. Al guardar, la barra dice «Guardado …: 3 unidades. Y 3 que no valen, tal como estaban.», el archivo tiene las seis y al recargar se ven las 3 válidas y las 3 conservadas (`20-reverif-solo-invalidas.png`). **Núcleo:** con `sinValidar` −2, −3 y −5 sale `-4`; con la válida −2 y las inválidas −3 y −4 sale `-5`. |
| H2: el aviso habla de las cifras de quien juega | ✅ (con un menor) | **Navegador:** cargué un borrador de antes con ataque 1, defensa 0 y vida 5. El aviso dice «su ataque 1 es menos de lo que suma Espada (+2); se queda con sus cifras, sin equipo.» (`21-reverif-viejos.png`). **Núcleo:** «su daño 45–70 es más estrecho que el de Mandoble», «su vida 20 no pasa de lo que suma Arnés de placas (+100)», «con sus 7 casillas, sin lo que pone Escudo (−1), se saldría de 2 a 7», «lleva 0 tiros y Arco suma 12». La regla no cambia: equipo `{}` y sus cifras. Ver **R2** y **R3** más abajo. |
| H4: una nueva desde una criatura conserva sus rasgos | ✅ | **Núcleo:** las 21 criaturas salen con sus rasgos y `undead` si es no muerta. Corrí 105 peleas contra un campesino nuevo (5 semillas por criatura) y todas acaban, sin excepciones. **Navegador:** en la pelea, el panel del Dragón óseo 2 dice «Rasgos no-muerto, vuela, terror». La ficha del Señor vampiro 2 dice «no-muerto, vuela, sin contraataque, drena vida». Tamaño: 1 hex, como dice la implementación. Ver **R1**. |
| H5: un rechazo en la pelea no deja «Cambiado…» en la barra | ✅ | Lo probé con el Dragón óseo 2 contra el Campesino 2, en este orden: la rodela da «Cambiado: vale ya en esta pelea.»; la ballesta da «No se cambia: … quita antes el escudo.»; un segundo rechazo seguido (mandoble) da su propio motivo; un cambio que vale (armadura) vuelve a «Cambiado…»; y otro rechazo, otra vez el suyo. Tras una jugada (Esperar), la barra queda vacía: el rechazo no se queda pegado (`24-reverif-h5-pelea.png`). En el montaje, sin pelea, el rechazo sale igual y sin errores. |
| Texto de la barra en la vista de edición | ✅ (con un fallo nuevo, R1) | En la edición, «Nueva unidad «Paladín 2», nivel 1 y sin equipo: su ficha está abierta.». En el montaje sigue «añádela a un bando o cambia su ficha». |
| H3: rótulo del maniquí en el selector | ✅ | Los grupos del selector son «Hojas» (51 opciones) y «Catálogo del juego (con el maniquí)» (21). |
| Consola | ✅ | `errores: []` en las dos pasadas de Playwright. |

### Hallazgos nuevos

**R1 (importante): la barra dice «nivel 1» y la ficha, «nivel 2».** Es una consecuencia de H4.
- **Qué pasa:** con los rasgos de la criatura, tres de las 21 criaturas nacen en el nivel 2: Paladín 2 (índice 217, `double_attack`), Cruzado 2 (225, `double_attack` y `bane_undead`) y Montaraz 2 (209, `double_shot`).
- **Qué dice la página:**
  - la barra, escrita a mano en `crearUnidad` (`src/client/arena/main.ts`), dice «Nueva unidad «Paladín 2», nivel 1 y sin equipo…»;
  - la ficha de al lado dice «Índice 217 · nivel 2» (`22-reverif-paladin-nivel2.png`, `23-reverif-montaraz-cruzado-liche.png`).
- **Contra el requisito:** `requisitos.md` dice «La unidad nace con unas cifras mínimas (índice 1xx, nivel 1)», y eso ya no se cumple para esas tres. Que el índice cuente los rasgos lo pidió `hallazgos-qa.md` («el índice los cuenta como siempre»), así que es una **decisión pendiente para el coordinador o el usuario**: o nacen en el 2, o los rasgos no cuentan para el índice de una nueva.
- **Lo que sí es un fallo:** la barra afirma un nivel que no deriva.
- **Pasos:** `/arena/` → «Editar fichas» → «Nueva unidad» → Paladín → Crear.
- **Qué esperaba quien juega:** que la barra y la ficha digan el mismo nivel.

**R2 (menor): un rasgo de tiro en una unidad que no tira.**
- El Montaraz 2 lleva «disparo doble» y el Liche 2 «disparo con salpicadura», pero el cuerpo común no dispara (Disparos 0).
- La ficha enseña los dos rasgos, y el `double_shot` sube el índice del Montaraz de 177 a 209, hasta el nivel 2, por un rasgo que no actúa.
- Quien juega ve un tirador que pelea cuerpo a cuerpo.

**R3 (menor): el aviso de conversión de H2 tiene dos límites.**
- **Solo dice la primera cifra que no cabe.** Con ataque 1, defensa 0 y vida 5 a la vez, dice solo el ataque. Quien lo arregle volverá a ver otro aviso al recargar.
- **Con un borrador de la escala de fheroes2** (con `level`), habla de cifras ya multiplicadas por 10. Escribí vida 9 y el aviso dice «su vida 90 no pasa de lo que suma Arnés de placas (+100)» (`21-reverif-viejos.png`). Es justo el defecto de H2 («cifras que nadie había escrito»), en el caso del borrador antiguo.

**R4 (menor): «Sin borrador guardado todavía» con un borrador que solo trae unidades que no valen.** Es lo que el ingeniero vio y no tocó.
- **No esconde nada:** en la misma barra sigue «No valen y se conservan tal cual al guardar: templario-mandoble-2 (…); templario-mandoble-3 (…); bone-dragon-2 (…)», con cada motivo. Al guardar, «Y 3 que no valen, tal como estaban.», y el archivo las conserva.
- **Pero la primera frase es falsa y se contradice con la siguiente:** sí hay un borrador guardado, y lo que no vale tampoco «sale con cifras por defecto». Alguien que lea solo el principio puede creer que su archivo no se ha leído.
- **Pasos:** dejar en `data/borradores/unidades.json` solo unidades que no validan y abrir `/arena/`.
- **Qué esperaba quien juega:** algo como «Cargado …: ninguna unidad vale; 3 se conservan tal cual…».

### Workarounds

- **Borradores escritos a mano en disco** (solo inválidas y de antes): son el caso real que se prueba, no un atajo. Se quitaron al acabar.
- **Selectores `:visible`** en el editor de la pelea, como en la primera pasada: la ficha oculta del montaje sigue en el DOM. A quien juega no le afecta.

### No probado

- **El dragón de dos hexes ocupando uno en la pelea, visto en pantalla:** la regla está dicha y es una decisión. Solo leí «Hexes (1 o 2): 1» en la ficha.
- **El movimiento en vuelo del dragón en el tablero** (pasar por encima de otras unidades): solo comprobé que el rasgo llega al stack y al panel.

### Veredicto de la re-verificación

**Apto con reservas.** Los seis puntos de «Se corrigen» están hechos y los he visto funcionar en Chromium y en el núcleo, con `pnpm verify` en verde y sin errores en consola. H1, que era la reserva de la primera pasada, queda cerrado también con varias inválidas seguidas y con criaturas. La reserva nueva es **R1**: H4 hace que tres criaturas nazcan en el nivel 2, mientras la barra sigue diciendo «nivel 1» y el requisito pide «nivel 1». Hay que corregir el texto de la barra, que se derive del índice, y decidir qué nivel debe tener una nueva desde una criatura con rasgos. R2, R3 y R4 son menores.

## Re-verificación 2 (12-10-2026)

Solo los cinco puntos de «Segunda vuelta» de `hallazgos-qa.md`. No se han repetido `verify`, `verify:lento` ni `banco`: se citan de `implementacion.md`.
- `verify`: 3020 passed.
- `verify:lento`: 4871 passed.
- `banco`: sha `066767b4…`, `ancla: igual`, 0/200 sin terminar.

Lo corrido aquí:
- `pnpm vitest run test/arena.test.ts test/arena-edicion.test.ts test/nivel.test.ts`: **151 passed**.
- Un script de núcleo en el scratchpad (`rv2/adv.mts`).
- Chromium sin pantalla (Playwright) con mi vite en el **3198**: PID 358178, que era su propio grupo, matado por el grupo y comprobado «3198 libre». El 3100 no se ha tocado. `data/borradores/` no existe al acabar, como al empezar.

| Punto | | Evidencia |
|---|---|---|
| 1. R1: la barra lee el nivel del índice | ✅ | En el navegador, al crear: «Nueva unidad «Cruzado 2», sin equipo (Índice 225 · nivel 2)…», «Dragón óseo 2 … (Índice 177 · nivel 1)», «Montaraz 2 … (Índice 177 · nivel 1)» y «Guerrero con arma a dos manos 2 … (Índice 177 · nivel 1)». Ningún «nivel 1» escrito a mano. En el núcleo, las 21 criaturas: el texto de `avisoDeNuevaUnidad` contiene siempre `lecturaDelNivel(unidadDeCombate(u))`. Solo el Paladín (217) y el Cruzado (225) nacen en el 2. |
| 2. R2: un rasgo de tiro sin tiros no cuenta | ✅ | El Montaraz nuevo sale con índice 177 (antes 209). La tabla del catálogo de `nivel.test.ts` está en verde, y el banco es idéntico (citado). |
| 3. Tamaño | ✅ | `bone_dragon` es la única criatura del catálogo con `hexes: 2`, y su nueva sale con 2. Las otras 20 no lo escriben. **Adversarial**: 60 peleas (semillas 1-60), de 1 a 7 dragones nuevos contra dragones o campesinos, jugadas hasta el final con la IA de batalla. En cada jugada se comprobó que ninguna casilla de un stack vivo cae fuera del tablero (`isInside`), que no se solapan y que cada dragón ocupa 2. Resultado: **60/60 terminan, 0 fallos**. |
| 4. R3: todas las cifras y en su escala | ✅ | Probado con 6 perfiles y 4 borradores (con `level` y sin él, con `speed` y con varias cifras malas). El aviso enumera todas las que no caben, separadas por «;»: ataque, defensa, vida, daño y tiros. Con `level` dice «su vida 3 (30 en la escala de hoy, ×10)» y «su daño 1–9 (10–90 …)». Sin `level`, sin paréntesis. En el navegador, con un borrador `level` del mandoble (ataque 1, defensa 0, vida 9, daño 2–3) salen las cuatro: «…su vida 9 (90 en la escala de hoy, ×10) no pasa de lo que suma Arnés de placas (+100); su daño 2–3 (20–30 …)…». |
| 5. R4: la barra con un borrador de solo inválidas | ✅ | `avisoDelBorradorLeido`: con (0 válidas, 1 inválida) dice «Cargado r: ninguna unidad vale, y la que trae se conserva…». Con (0, 0), «Sin borrador guardado todavía». Con (2, 1), «Cargado r: 2 unidades.». En el navegador, con una mezcla (1 válida, más un dragón con `hexes: 3`, más una de facción inexistente): «Cargado data/borradores/unidades.json: 1 unidad. No valen y se conservan tal cual al guardar: bone-dragon-9 (… ocupa 1 hex o 2, y esta dice 3); templario-mandoble-7 (… la facción "caballeros" no existe…)». Con la vieja convertible, «2 unidades» más el aviso de R3 y la inválida. Consola: `errores []` en las tres cargas. |

**Hallazgos nuevos:** ninguno de lo pedido.
- Una observación, no un defecto: el dragón óseo nuevo nace en el nivel 1 (177), porque su cuerpo es el común y el índice no mira el tamaño. Es coherente con la decisión del usuario («nace donde caiga su índice»).
- No probado: el dragón en el borde, visto en pantalla dentro de la pelea. Lo cubren las 60 peleas del núcleo y la captura del ingeniero (`2-dragon-pelea.png`).

**Workarounds:** borradores escritos a mano en disco. Es el caso real que se prueba, y se quitaron al acabar.

**Veredicto final: apto.**
