# QA — prevision-de-la-batalla (#253, #264), 11-11-2026

Código validado: worktree `agent-ab3a790b208b60f85`, rama `worktree-agent-ab3a790b208b60f85`, commit
`560ea2bf` (sin cambios pendientes de código; no se ha tocado nada). Mandan «Tras la crítica» y «Tras el
plan» de `requisitos.md`; desviación aceptada por el coordinador: cuatro líneas de barra en batalla.

Lo que ya corrió el ingeniero sobre este commit y **no se repite** (se cita, `implementacion.md`):
typecheck, lint, 9 ficheros de test (164 en verde; `prevision` también con `HEROES_LENTO=1`), `pnpm
banco` (ancla igual), `exportaciones.ts`, `neutro.ts`, `CAPTURAS_SOLO=arena` (aserción de #status a
1024/1100/1440, vista morder con la hoja de dos líneas).

Guiones de esta QA, para repetir: `capturas/guiones/` (`horquilla.mts` el barrido del núcleo,
`partida.mts`, `arena.mts`, `granada.mts`, `mapa.mts`). Vite propio en el 3187, parado por su grupo y
comprobado con `ss -ltnp` («3187 libre»).

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | La barra cubre todo cruce (golpe y contraataque, Fuerte, Rápido, cuántos golpes) en las ruedas de 3, 5 y 7 | ✅ cumple | Barrido adversarial propio (`horquilla.mts`) sobre **200 peleas reales** de las tandas de `arena-ia` (mezcla, armaduras, jinete contra floja, con héroes, murallas del mapa), la rueda alternando 3/5/7 por semilla, semillas 1-40 por tanda: en cada golpe cuerpo a cuerpo que decide la IA a media pelea, la previsión sin elegir contra **todo cruce** jugado sobre una copia. **3 429 golpes, 94 053 cruces, 0 fallos** (golpe fuera de `danio`, golpes > `golpes.max`, bajas, PV que quedan, contraataque fuera, devueltos > máximo, contraataque «seguro» que no llega, contraataque sin prever, y el cruce elegido exacto). Pasaron por héroe que pega 1 223, héroe atacado 1 278, carga 2 758, contraataque de varios golpes 10 734, sin contraataque 831, tras muralla 837. 22 s. |
| 1b | No remite a la rueda para el contraataque | ✅ | La frase lo dice en la barra: «Contraataque con Espada (cuerpo a cuerpo), si sobrevive: 1–12 por golpe (1–2 golpes).» (partida, semilla 5). |
| 2 | El barrido de `test/prevision.test.ts` ya no excluye Fuerte ni Rápido y muerde | ✅ (citado) | Leído el fichero: `RESPUESTAS`/`conLaRueda`/`EN_LA_PUNTA` fuera, barrido de todo golpe × toda respuesta en `LAS_TRES_RUEDAS`; mordida documentada por el ingeniero («308 fuera de [47, 193]»). No repetido. |
| 3 | `previsionDeLaRueda` igual para el agente; banco igual | ✅ | El agente solo lee `sector.danio` y `sector.golpes` (`contract/batalla.ts:350-357`), que no cambian; el campo nuevo `PrevisionDeContraataque.golpes` no viaja. Banco: citado del ingeniero. `pnpm qa` no hace falta (sin cambios en `server/` ni en el contrato). |
| 4a | A 1024/1100/1440, la previsión de un golpe con carga se lee entera en la **partida** | ✅ (sin armadura) | `partida.mts`: la batalla de la guardia de escritorio (semilla 5, jugada a clics), 29 golpes señalados × 3 anchos = **87 lecturas**: ninguna desborda (`scrollHeight 78 = clientHeight 78`), la frase de la barra = `textoDePrevision` del espejo en las 87, la más larga 324 car. («…cargando 3 casillas (+15 % de daño). Según la rueda, daño 2–37 por golpe (1–2 golpes)… carga de 3 casillas ×1,15.») entera a 1024. Captura `capturas/qa-partida-carga-1024.png`. La guardia no llevaba armadura: **la carga contra armadura en la partida, no probada** (ver abajo). |
| 4b | Lo mismo en la **arena** | ✅ | `arena.mts` (rueda 7, seis contra seis, carga, arcabuz, arco, armaduras de −1 a −3): **150 lecturas** (1024 en cada turno; 1100 y 1440 cada tres), y `granada.mts` 19 más (granada a dos alcanzados, 59 px): ninguna desborda, la barra = la previsión del espejo en todas. Captura `capturas/qa-arena-golpe-armadura-1024.png` («…−3 armadura.» entera en dos líneas). |
| 4c | El lienzo no cambia de alto al pasar de una casilla a otra | ✅ | En las 256 lecturas, el alto de `#canvas` con el puntero fuera = con el puntero sobre el enemigo (partida 585/617/717 px; arena 602/634/734 px). |
| 4d | Lo que no cabe se recorta por frases y dice dónde se lee entero, no a mitad de cifra | ❌ **NO cumple** en un caso | Ver H1: cuando **una sola frase** no cabe (un hechizo de área: los alcanzados van unidos por «;» en una frase), no se corta nada y la hoja la recorta a mitad, sin el aviso. Visto de verdad en el móvil (la ayuda de la tropa: el aviso queda fuera, `scrollHeight 78 > clientHeight 39`, captura `capturas/qa-movil-tropa-corte.png`); en la batalla de escritorio, por el código y la longitud medida (708 car.). El corte por frases de varias frases no se dio en ningún flujo real que jugué (nada desbordó cuatro líneas); lo cubren `barra.test.ts` y la pasada roja del ingeniero. |
| 5 | Aserción `scrollHeight ≤ clientHeight` en la pasada de la arena a 1024 | ✅ (citado) | `laCargaALosTresAnchos` en `tools/qa/capturas/pasadas/arena.ts`, leída; verde y vista morder por el ingeniero. |
| — | La barra del mapa (misma función) | ✅ | `mapa.mts` a 1024 y 1440: base, mapa y tropa caben en dos líneas, sin `title` en el lienzo, sin errores. |
| — | Móvil con cuatro líneas en batalla | ✅ | `CAPTURAS_SOLO=movil pnpm capturas`: salida 0, «sin errores en consola», 31,6 s (`capturas/qa-movil-03-batalla.png`, `qa-movil-04-batalla-jugada.png`): la barra no le roba alto al tablero visible. |

## La frase, como quien juega

Se entiende: «Según la rueda» avisa de que no es un dado; «por golpe (1–2 golpes)» dice que Rápido
puede doblar; «si sobrevive» y «Sin contraataque» son ciertos en todos los cruces del barrido. No miente
en: disparo y granada (sin «Según la rueda», cifras de la tirada fija), unidad que ya devolvió el golpe
o lo mata en todos los cruces («Sin contraataque», visto en partida y arena), héroe atacado y héroe que
pega (núcleo), carga (el primer golpe la cobra, el segundo no: cubierto), rueda de 3/5/7 (núcleo), golpe
y respuesta elegidos (exacto). Lo que no es fallo pero se nota: la horquilla de todos los cruces es
ancha («daño 8–92 por golpe»), como anticipó la crítica; la cifra útil por tipo sigue en la rueda.

## Hallazgos

**H1 — importante. Una frase que no cabe sola se recorta a mitad y sin decir dónde se lee entera.**
`ponerEnLaBarra` corta por `(?<=\.)\s+`; si la primera frase ya no cabe, deja el texto (o la primera
frase más « … (entera, con el ratón quieto)») y es la hoja (`line-clamp`) la que corta: a mitad de cifra
y con el aviso fuera de la vista. El caso de batalla: un hechizo de área dice a todos los alcanzados en
**una** frase unida por «;» (`deLanzar`, `client/batalla/prevision.ts`). Medido con el núcleo
(`hechizo.mts`, peleas «con héroes» de `arena-ia`, Tormenta de granizo a seis): **708 caracteres en una
frase**; en la partida a 1024 caben ~340 en cuatro líneas, en la arena ~560. Lo mismo, visto en el
navegador, en el móvil: la ayuda de la tropa (`AYUDA_DE_LA_TROPA`) a 390 px: la barra enseña «…casilla
verde de su zona…» y el aviso queda cortado (`scrollHeight 78`, `clientHeight 39`); el `title` sí lleva
la entera. Pasos (batalla): partida o arena a 1024 → héroe con Tormenta de granizo o Bola de fuego →
apuntar a un grupo de cinco o seis → la barra corta a mitad de un alcanzado, sin « … (entera…)». Lo que
esperaba quien juega: el corte en un «;» (o por palabras) con el aviso a la vista. Criterio 4, literal:
«se recorta diciendo dónde se lee entero, no a mitad de cifra». **No reproducido a clics en la batalla**
(no monté un héroe con hechizo de área en la página): visto en el código, medido el texto, y el mismo
mecanismo visto en el móvil.

**H2 — menor. «(entera, con el ratón quieto)» en el móvil.** En táctil no hay ratón ni bocadillo
(`title`): el aviso remite a algo que no existe. Fuera del criterio (es «escritorio desde 1024»), pero
la función es la misma para toda la barra de la partida, también en el móvil. Y fuera de la batalla
(«entera» sin sujeto: ¿la qué?) se lee raro; en la batalla se entiende por contexto.

## Workarounds usados

- **El espejo para saber dónde pulsar** (`pixelDeUnidad`, `escenaDelEspejo(...).pulsar` con el mismo
  píxel que la página): el guion necesita saber qué hay bajo el puntero; quien juega lo ve. No afecta.
  Al principio la arena se me separó del espejo por pulsar centros de casilla tapados por una figura
  (mío, no del juego): arreglado pasando el mismo píxel a la escena del espejo.
- **La arena se monta a 1440 y se mira a 1024**: a 1024, Playwright no pudo pulsar «Yo» del bando
  derecho (`#montaje intercepts pointer events`, el botón está en un panel que se desplaza). No lo
  investigué: puede ser solo el desplazamiento del arnés; **no probado** si a una persona le pasa.
- **La rueda del barrido del núcleo se fija escribiendo `batalla.rueda`** (equivale a `combateCon`).
- **El libro del héroe con hechizos de área** (`hechizo.mts`) se le pone a mano solo para medir la
  longitud de la frase de H1, no para juzgar el juego.

## No probado

- **La carga contra armadura en la partida a clics**: la guardia de la semilla 5 no lleva armadura. La
  frase con armadura se vio en la arena; la medida del ingeniero puso la frase de la carga del banco
  (~370 car.) en la barra de la partida a 1024 y cupo en cuatro líneas.
- **Las ruedas de 3 y 5 en el navegador**: el texto no depende de la forma; el núcleo, sí cubierto en las
  tres (criterio 1).
- **Una granada de tres o más alcanzados y el corte por frases en una batalla de escritorio real**: no
  se dio; lo cubren `barra.test.ts` y la pasada roja del ingeniero.
- Errores de consola: ninguno en todas las páginas abiertas (partida, arena, mapa, móvil).

## Veredicto

**Hallazgos.** Lo de #253 está bien y sin una sola fuga en 94 053 cruces; la barra de #264 cabe y el
lienzo no salta en todo lo jugado. Queda H1 (importante): una frase que no cabe sola (un hechizo de
área) se recorta a mitad y sin el aviso, contra el criterio 4. H2, menor.
