# La arena — QA

Validado el 02-10-2026 contra la petición literal de `requisitos.md`, con el árbol
sin commitear de `/home/al/code/heroes`. Navegador: Playwright (Chromium 1234 de la
caché), clics reales, contra un `vite` propio en el puerto 3197 (arrancado con
`set -m` en su línea, matado por su grupo y comprobado libre con `ss`). Cada pelea
se jugó con un **espejo** `SesionDeArena` con las mismas unidades y semilla, y tras
cada jugada se comparó la lista «En el campo» de la página con la del espejo.
Capturas en `capturas/` (prefijo `q`).

## Criterios

| # | Criterio (requisitos.md) | Veredicto | Evidencia |
|---|---|---|---|
| 1 | `/arena/` en el servidor de desarrollo; dos bandos con unidades de las cinco facciones, viendo su imagen | ✅ cumple | `GET /__arena/hojas` da 52 hojas (templarios 10, no-muertos 10, imperio 11, elfos 10, orkos 11; 20 son héroes). 0 `identidad.webp` sin cargar en el catálogo; las 7 miniaturas animadas del montaje pintan (2 010–8 964 píxeles opacos cada una). `q02-montaje-cinco-facciones.png`, `q03`/`q04` (ficha del jinete con su clip de carga). `pnpm arena --port 3198` arranca y sirve `/arena/` (200). |
| 2 | Cada unidad enseña sus atributos, se pueden cambiar y valen en la batalla siguiente | ✅ cumple | Semilla 11, monje (IA) contra orko berserker (IA): por defecto gana el derecho en la ronda 2; con vida 5000 y ataque 200 al monje gana el **izquierdo** en la ronda 3, igual que el espejo (monje acaba con 4 971 PV). Velocidad «rapidísima» → el panel dice «Le quedan 7 casillas» (4 por defecto); disparos 3 → fila «Munición 3» y `shoot` en la lista legal; hexes 2 → la figura ocupa dos hexes (`q41`); el jinete carga en recta: «Golpearías desde (5,4), cargando 5 casillas (+50 % de daño)» y el parte dice «Ataque (carga de 5 hexes)» (semillas 21, 4 y 9, `q53-carga-angulo-s21.png`). Pero ver H1 y H4. |
| 3 | «Yo» o «IA» por unidad, la batalla lo respeta unidad a unidad, con los controles del juego | ✅ cumple, con reservas | Mezcla en los dos bandos (izq. Yo/Yo/IA, der. IA/Yo/IA), semilla 7: 2 tramos, 2 golpes y 2 disparos con clics reales, 0 separaciones página/espejo, gana el derecho en la ronda 3 como el espejo (`q10`–`q12`). Todo «Yo» en los dos bandos, semilla 21: 0 separaciones, gana el izquierdo en la ronda 5 (`q51`). 7 contra 7 con unidades de 2 hexes y héroes, el derecho entero en «Yo»: 7 tramos, 12 golpes, 0 separaciones. Espacio termina el turno con el foco en el lienzo (usado en todas las pasadas «Yo»). Ángulo y carga: los mismos rótulos que la partida. **Todo «IA» no se ve pelear: H1.** |
| 4 | «Guardar» escribe `data/borradores/unidades.json` con los atributos, en formato pasable al catálogo; se valida antes de escribir | ⚠️ cumple a medias | Guarda y recarga: ataque 11, nombre, rasgo `double_attack` y habilidades «Salto», «Sigilo» vuelven al reabrir (`q90`, `q91`). La ficha rechaza diciéndolo vacío, negativo, decimal, `min > max`, 0 PV, 3 hexes, nombre vacío (18 casos, el campo vuelve a su valor; `q60`), y el endpoint devuelve 400 con la frase a negativo, `min > max`, nombre vacío, campo que falta, número como texto y unidad repetida, sin tocar el archivo. **Pero** el archivo no se pega en el catálogo tal cual aunque su `_comment` diga que sí (H3), y hay dos caminos por los que «Guardar» borra unidades guardadas sin decirlo (H2). |
| 5 | El juego no cambia: `pnpm banco` con el ancla igual | ✅ cumple | `pnpm banco`: `sha256 da7609d5…`, «ancla: igual», 0/200 sin terminar, 9 / 17 / 37 días. `pnpm verify`: 36 ficheros, **1121 tests**, salida 0. |

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

**H1. Cuando la IA juega antes que la persona, la pelea no se ve: con todo «IA», solo se ve el final.**
`SesionDeArena` juega a la IA en el constructor (`avanzarIA()`), y el animador, al
ver una batalla nueva, da el registro entero por ya contado (`anim.ts`, `observe`:
identidad nueva → `leidos = log.length`). Así que nada de lo que la IA juega antes
del primer turno de la persona se anima.
- Todo «IA» (lo que más usará quien quiera mirar cómo pelean dos unidades): a los 100 ms
  de pulsar «Luchar» el tablero ya está en su estado final, el panel dice «Gana el
  bando derecho» y la barra «La batalla ha terminado» (`q30-todo-ia-100ms.png`,
  idéntico a 1,5 s). Pasa igual con 7 contra 7 (`q70`).
- Mezcla: la persona lleva un zombi (izq.) y la IA un goblin arquero rapidísimo
  (der.). Semilla 5, ronda 1: a los 80 ms el zombi ya tiene 14/15 PV, sin ver el
  disparo y sin «Contando la jugada…» (`q80-ia-primero-80.png`).
- Repetir: `/arena/?seed=11`, monje + guerrero con escudo a la izquierda en «IA»,
  orko berserker + goblin arquero a la derecha (IA), «Luchar».
- Lo que espera quien juega: ver a sus unidades luchar —la petición es «hacerlas
  luchar»—, y con todo en IA eso es justo lo que quiere mirar.
- El docstring de `avanzarIA` dice «el animador la cuenta después»; no la cuenta.

**H2. «Guardar» puede borrar unidades del borrador sin avisar.**
- (a) **Borrador que no valida al abrir.** Con una sola unidad mala en el archivo
  (`hp: -1`, por ejemplo editado a mano), la página lo dice («… la vida tiene que
  ser 1 o más, y es -1 — se empieza con las cifras por defecto») y arranca con el
  borrador vacío. Si se añade un zombi y se pulsa «Guardar», el archivo pasa a
  llevar **solo** `zombi`: las otras dos unidades válidas (una con nombre, ataque,
  rasgo y dos habilidades editados) se pierden. La barra dice «Guardado … 1
  unidades.».
- (b) **Unidad del borrador sin hoja.** Un archivo con `templario-fantasma`
  (válida, pero sin hoja en `assets/unidades/`): al abrir dice «Sin hoja (no se
  pueden montar): templario-fantasma», y al pulsar «Guardar» el archivo sale **sin
  ella**. El comentario de `arrancar()` promete lo contrario («Una unidad del
  borrador sin hoja no se tira: se queda en el borrador y se vuelve a guardar»),
  pero el código solo mete en `borrador` las que tienen hoja. Le pasa a cualquier
  unidad cuya hoja se renombre en el taller.
- Repetir: cualquier borrador guardado, editar el JSON como se dice arriba,
  recargar `/arena/` y pulsar «Guardar».
- Lo que espera quien juega: que «Guardar» no tire lo que no ha tocado, o que avise
  antes de pisarlo.

**H3. El archivo no «se pega en el catálogo copiándolo», como dice su `_comment`.**
El formato usa los mismos nombres de campo que `data/creatures.json` y eso es
verdad. Lo probé en una copia del repo (no en este): metí en `creatures.json` una
unidad tal cual sale del borrador.
- Con su facción de la arena (`elfos`), el juego no arranca: `data/ciudades.json:
  falta la guarnición neutral de elfos`.
- Con la facción cambiada a `knight`, tampoco: `data/experiencia.json: habilidades:
  falta la criatura "elfo-hostigador"`.
- Además faltan `growth` (que el cargador copia sin comprobar) y `upgradesTo`.
  `habilidades` es una lista suelta, y la tabla del juego asigna una habilidad por
  nivel en `experiencia.json`: no hay correspondencia.

El fallo es ruidoso, que está bien, pero el `_comment` del archivo
(`COMENTARIO_DEL_BORRADOR`) dice «para pasar una unidad al catálogo copiándola», y
quien lo lea —una persona o un agente— lo creerá. `implementacion.md` sí reconoce
que `growth`, `upgradesTo` y la facción se decidirán al pasar la unidad; ni la
facción del juego ni la entrada de `experiencia.json` aparecen en el archivo. Lo
que se espera: que el archivo diga qué falta para pasarlo, o que lo traiga.

**H4. Un empate por tope de rondas se anuncia como victoria.**
Con dos unidades que no pueden hacerse daño (vida 100 000 y defensa 500 en las dos,
ataque 0 en el monje), semilla 11, la pelea llega a la ronda 100 (`MAX_ROUNDS`). El
panel dice «Gana el bando derecho. Ronda 100.» con los dos vivos (99 651 y 99 802
PV), sin decir que es por tiempo (`q2x-eterna.png`). Es la regla del motor (gana el
defensor), pero en una página para probar cifras, quien la lea concluirá que la
derecha es más fuerte. Lo que se espera: «Sin vencedor en 100 rondas: gana el
defensor» o algo así.

### Menores

- **M1.** Con los bandos vacíos se lee «Sin unidades: añádelas desde la lista de
  abajo.», pero la lista está a la izquierda (`q01-abrir.png`).
- **M2.** Un campo numérico vacío se rechaza con «el ataque tiene que ser un número
  entero, y es null» (`JSON.stringify(NaN)`): quien juega no ha escrito «null».
  Debería decir que está vacío.
- **M3.** Disparos `-1` → «la munición tiene que ser 1 o más», pero el rótulo del
  campo dice «0 = cuerpo a cuerpo» y 0 se acepta. «los hexes tiene que ser»
  (concordancia). «Guardado … 1 unidades.».
- **M4.** `1e3` en «Ataque» entra como 1000 sin avisar. No es un fallo, porque el
  navegador lo convierte, pero el campo pasa de «1e3» a «1000».
- **M5.** Recargar la página a mitad de batalla, o con cifras sin guardar, lo pierde
  todo sin aviso: el montaje vuelve vacío y las ediciones no guardadas desaparecen
  (`q40-recargar-a-mitad.png`). La barra solo avisa de que se pierden cuando no hay
  servidor de desarrollo.
- **M6.** La semilla sorteada se ve en la barra («semilla 31294»), pero la URL no se
  reescribe (`/arena/` a secas), al revés que en la partida: para repetir una pelea
  rara hay que teclear `?seed=N` a mano.
- **M7.** Las cifras por defecto no ponen los rasgos que la hoja pide: el zombi, el
  esqueleto y el espectro salen sin `undead`, y el espectro sin `flying`. Las cifras
  son inventadas y se declaran así, pero en la arena un «esqueleto» vivo es raro.
- **M8.** Nombres de taller usados como nombre de juego: «Orko berserker (antes
  Jinete de jabalí)», «Hermano de carga (montado; antes Caballero montado)». En la
  batalla, el rótulo del jinete se sale por el borde izquierdo del lienzo
  («(montado; antes Caballero montado)», `q53`). Se cambian en la ficha, pero salen
  así.
- **M9.** La tarjeta del bando y el panel de la unidad activa no enseñan rasgos ni
  hexes: un guerrero con «vuela» y 2 hexes se ve igual que uno normal hasta que
  se mueve (`q41`).
- **M10.** En la salida, las figuras del mismo lado se tapan: con tres unidades a
  la derecha, el Ent, el orko y el jinete se montan unos sobre otros (`q10`), y
  con 7 contra 7 los héroes orkos quedan tras los caballos (`q70`). El jinete pisa
  el hex vecino, como ya avisaba `implementacion.md`.
- **M11.** El parte de guerra empieza por arriba (las últimas 40 líneas, de la más
  antigua a la más nueva) en una caja de 12 rem: al terminar, lo último que pasó
  queda fuera de la vista hasta que se desplaza (`q12`, `q70`). Es el mismo
  componente que en la partida.
- **M12.** Doble clic en «Terminar turno» cierra también el turno de la siguiente
  unidad «Yo» sin ningún aviso: con dos tuyas seguidas, semilla 2, el monje pierde
  su turno. La partida hace lo mismo.
- **M13.** Un borrador que no valida deja en la consola «Failed to load resource:
  … 500». La página lo explica en la barra, pero `pnpm capturas` sale 1 con un error
  de consola, así que esa situación no se puede ensayar en Playwright.
- **M14.** El endpoint acepta campos extra y los descarta en silencio: un `growth: 3`
  añadido a mano al JSON desaparece en el siguiente «Guardar».
- **M15.** En el móvil (390 px), el catálogo de 52 hojas va antes que los bandos y la
  ficha (`q96`); hay que desplazarse por todo el catálogo para llegar a ellos.
  `implementacion.md` ya lo daba por no cubierto. No hay desplazamiento horizontal
  (0 px a 390 y 1024).

## Workarounds usados

- **El espejo** (`SesionDeArena` en Node con las mismas unidades y semilla) sirvió
  para saber dónde hacer clic y qué esperar. No le cambia nada a la página: los
  clics son reales y cada jugada se comprobó contra lo que la página pinta. No
  afecta a quien juega.
- **Para encontrar el píxel de una carga** se recorrió el cuerpo del enemigo con
  `EscenaBatalla.accionContraEn`. Quien juega hace lo mismo moviendo el ratón y
  leyendo la barra («Golpearías desde…»). No afecta.
- **Borradores escritos a mano** (`hp: -1`, una unidad sin hoja) para probar H2. Es
  justo el caso que la página dice soportar. Es un hallazgo, no un truco.
- **El catálogo, en una copia en el scratchpad** para H3: no se tocó
  `data/creatures.json`.

`pnpm capturas` (completo, tras retirar mis borradores): salida 0 en 110,9 s; la
pasada de la arena da «1 tramo, 1 golpe; gana el bando derecho en la ronda 3», con
el guardado y la recarga, «sin errores en consola», y vuelve a retirar el borrador.
Un detalle: guarda sus capturas en `docs/agents/2026-10-01-cliente-nuevo/capturas`,
otra carpeta y no la de esta tarea. No cambia nada en git.

## No probado

- El clip `charge` del jinete **mientras carga en la batalla**: se vio en la ficha
  (`q04`); en el tablero solo el resultado y el parte.
- `vite build` + `vite preview`: no lo repetí; lo da por probado `implementacion.md`.
- `pnpm qa`: no toca `src/server/` ni el contrato.
- Pantallas retina (miniaturas «blandas», según `implementacion.md`).

## Limpieza

- `data/borradores/` no existía al empezar y no existe al acabar.
- Los guiones de QA (`tools/qa/tmp-qa-arena/`) los borré yo.
- El vite del 3197 y el `pnpm arena` del 3198 se mataron por su grupo; los dos
  puertos quedaron libres (`ss -ltnp`).
- No se tocaron `/home/al/code/heroes-arte`, `tools/qa/tmp-scratch` ni
  `NuevaJugabilidad.md`.

## Veredicto

**Apto con reservas.** Los cinco criterios se cumplen en el flujo real: se monta con
las cinco facciones viendo el arte, las cifras cambian la pelea, Yo/IA se respeta
unidad a unidad con los controles del juego, se guarda y vuelve, y el ancla del
banco no se mueve. Las reservas son tres, y conviene cerrarlas antes de darle la
página al usuario como herramienta:
- **H1**: con todo en IA no se ve pelear.
- **H2**: «Guardar» puede borrar unidades guardadas sin decirlo.
- **H3**: el archivo promete que se pega en el catálogo copiándolo, y no es así.
