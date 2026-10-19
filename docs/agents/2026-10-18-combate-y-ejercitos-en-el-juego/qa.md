# QA — el combate y los ejércitos de la arena pasan a ser los del juego

QA, 19-10-2026, sobre d099a13f (F1-F6 y el simplify), sin cambios en el árbol (`git status` limpio al
acabar). Petición literal: «Mete el sistema de combate y los ejércitos en el juego sustituyendo a lo
que hay, que no se limiten a la arena». CLAUDE.md se reescribe en F7: no cuenta como hallazgo.

Cómo se probó: `pnpm verify` una vez; `pnpm qa`; `barrido-semillas.ts`; `pnpm banco`; `pnpm capturas`
(entera y luego por tandas, para saber cuánto falla); y cuatro guiones propios con Playwright sin
pantalla contra mi `vite --port 3311` (clics y teclas reales; un espejo `Session` en Node solo para
saber dónde pulsar, como `capturas.ts`), más el servidor de `pnpm partida` (`ws-server.ts`, vía
`arrancarServidor`) con un agente que contesta con `politica.ts`. Guiones y capturas en el scratchpad
de la sesión (`qa/*.mts`, `shots*/`).

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Dos de las cinco facciones; el castillo recluta las suyas con su hoja; guarniciones de su facción; ni `creatures.json` ni `knight`/`necromancer` | ✅ cumple | s30 templarios: base con el arte heredado (`p03`: el Monasterio es la iglesia de los paladines), el Monasterio ofrece Monje y Penitente; s16 orkos: base de marcadores, el Pueblo ofrece orko con hacha y escudo, orko con dos armas, goblin lancero y goblin arquero (`capturas/desktop-04`). En la batalla, templarios y goblins con su hoja (`p05`, `p09`). Guarniciones de 1-40: 1 153 individuos, 0 de otra facción. `data/creatures.json` no existe; el guardia «no quedan caballeros ni nigromantes» muerde (sonda `tools/qa/zz-sonda-qa.ts` con «necromancer» → rojo con su línea; borrada → verde) |
| 2 | Batalla del mapa con rueda, contacto, carga a pie, armadura, armas por uso, sin munición y poderes | ✅ cumple | s30, guardia de goblins (10,4): 7 cruces, 11 golpes con `parado` («44 de daño (−7 armadura)», «¡Parado!» en el desenlace), 1 carga, Bendecir del monje (`{"kind":"power","stack":"attacker-5","poder":"bendecir","target":"attacker-0"}`); en la defensa de s1 los arqueros elfos disparan cada ronda sin munición. El contacto no lo miré aparte: lo cubre «una puerta para montar batallas» (`createBattle`) |
| 3 | La persona anda y elige su golpe; elige su respuesta; la IA, a ciegas | ✅ cumple | s30: el clic en un enemigo anda y abre «Tu golpe · Escudero A (tú) ataca a Goblin lancero A (rival)» con los siete tipos y su daño (`p06`); tecla 2 → `{"golpe":"fuerte","respuesta":"fuerte","punto":0}`. «Tu respuesta · Goblin lancero B (rival) ataca a Escudero A (tú)» (`p07`), 7 respuestas. Defensa (#116), s1 día 3, sin tocar nada y con «Fin de turno»: «¡Te atacan! Defiéndete.» (`d01`), 7 respuestas en la rueda, derrota, «Partida perdida» (`d04`). Página y espejo, con el mismo oro y día en cada paso |
| 4 | El agente manda golpe y respuesta; lo ilegal se descarta con motivo; `pnpm qa` verde | ✅ cumple | `pnpm qa` exit 0: «Golpeaste con "strong"; attacker-1 respondió "normal"…»; la «mega» se descarta con «"mega" no es un golpe de la rueda; valen offensive…», la elige la IA, «La batalla sigue siendo tuya»; 82 respuestas pedidas, 81 entraron; 22,7 peticiones por batalla. En vivo (s7): la `battle_response` trae `kind, round, yourSide, turnId, attacker, target, responses, board, stacks, log`, sin `hit` ni `golpe` |
| 5 | El espectador ve rueda, cruce y lo parado sin aplicar reglas | ✅ cumple | `ws-server.ts` (s7) + agente + `/espectador/`: 13 ruedas distintas contadas («Fuerte contra Fuerte… ¡Parado! Mínimo», «Finta contra Fuerte…»), 26 `battle_turn` y 7 `battle_response`, 0 errores de consola. La pasada «espectador» de `capturas` sale verde |
| 6 | Armería y botín de la arena; el héroe con la Espada; ninguna pieza da PV | ✅ cumple | Armería: espada, mandoble, bastón, arco, ballesta, lanza, brigantina, arnés, jubón, gambesón, barda, rodela, escudo y daga; botín: pavés, maza, espada de herrería y espada bendita. El héroe nace con `{"arma":"espada","armadura":"gambeson"}` (armadura 4 en la batalla). Ninguna pieza con `pv`. En el espectador, el héroe de la IA «Lleva: Maza, Gambesón, Pavés» (botín). `pnpm qa`: «1 compras» |
| 7 | Guardar en la arena cambia lo que se recluta en `pnpm dev` | ✅ cumple (unidades) · ⚠️ piezas no probadas | Arena: «✎ Editar», «Guerrero QA», «Guardar» → «Guardado en data/unidades.json: 34 unidades. Y en data/equipo.json: 18 piezas.»; la partida s30, Pueblo: «Guerrero QA · Disponibles 8 · Precio 170 oro». Devuelto con `git checkout -- data/unidades.json`. Cambiar una pieza y comprarla en la armería, no lo probé |
| 8 | La arena sin interruptores; `?reglas=`, `?golpe=`, `?contacto=` se rechazan diciéndolo | ✅ cumple | Cada uno: «la arena pelea con las reglas del juego: quita «?reglas=» de la dirección» (y los dos a la vez, las dos frases); 0 interruptores (`[data-arena="regla"|"modo"]`). `reglas.ts` y `modos.ts` no existen; ni `crearBatallaConReglas`, `MODOS_*`, `piezasDeArena`, `upgradesTo` ni accesorio en `src/` (solo comentarios con fecha) |
| 9 | Templarios con el arte de los caballeros; las otras cuatro, marcadores | ✅ cumple | `p01`/`p03` (templarios, arte), `capturas/desktop-04` (orkos, marcadores). Imperio, elfos y no muertos no los abrí en la base: los cubre `base-arte.test.ts` |
| 10 | Guardias reescritos y vistos morder | ✅ cumple | Una sonda mía, arriba. Los demás, con sus sondas en `implementacion.md` (F2-F6 y el simplify) |
| 11 | Barrido en 0; duración y equilibrio en CLAUDE.md con fecha | ✅ barrido · ⚠️ CLAUDE.md, F7 | `barrido-semillas.ts`: 0/40, duración 4 / 11 / 14, peor batalla 7 rondas. Las cifras con fecha van en F7 |
| 12 | `verify`, `verify:lento`, `qa`, `capturas` en verde; banco re-anclado | ❌ NO cumple (`capturas`) | `pnpm verify` exit 0 (139 ficheros, 3 356 tests, 78 s). `pnpm qa` exit 0. `pnpm banco`: `1c496b88…`, «ancla: igual», 0/200 sin terminar. **`pnpm capturas` en rojo, en 5 pasadas** (H1). `verify:lento`, no lo corrí (cierre) |
| 13 | CLAUDE.md al día | ⚠️ no probado | Es F7 por decisión del coordinador |

## Hallazgos

**H1 · importante · `pnpm capturas` en rojo (C12).** Al ir por tandas, porque cada pasada que lanza
para la ejecución, fallan cinco. Las cinco son del guion, que espera el juego de antes. Ninguna la
reproduje como fallo del juego, salvo la del móvil, que no está claro:
- **escritorio** (`capturas.ts:1282`): `locator.hover` en modo estricto: `button[data-action="recruit"][data-todo="si"]` encuentra 4 (la morada ofrece varias unidades). s16, orkos.
- **perdida** (`escenas-de-capturas.ts:340`): «en las semillas 201–400 ninguna guardia a la vista a la que se llegue hoy gana al héroe resuelta sola».
- **movil** (`capturas.ts:1086`): «la jugada ha terminado y la barra sigue diciendo que se espere» (s2, `desktop-batalla-contando-la-jugada.png`). En escritorio, en mis tres batallas, el aviso siempre se retiró solo. Puede ser que la espera del guion no cuente el desenlace de la rueda, o que sea un fallo de verdad del aviso con la rueda. **Sin diagnosticar.**
- **arena** (`capturas.ts:2794`): «el espejo devuelve el control sin que le toque a la persona». La pauta de `buscarArena` no contesta la respuesta de la rueda, que ahora se pide siempre.
- **equipo** (`capturas.ts:4671`): la ficha de la Espada dice «todo héroe (su equipo base)» y el guion busca «todo héroe de la arena».
- Verdes: emboscada, veteranos, tactil, sin-arte, espectador y edición. Sin correr, por quedar detrás de un fallo: poderes, rueda-del-golpe, armas y rueda-contrincantes.

**H2 · menor · «Este héroe no conoce ninguno» en una defensa sin héroe.** Para reproducirlo: s1, «Fin de
turno» tres veces sin mover nada. El día 3 el imperio ataca la base y la guarnición de elfos se
defiende sola, sin héroe. Aun así, el panel de la batalla pone «HECHIZOS · Este héroe no conoce
ninguno» (`d01`). Antes de #116 la persona no jugaba defensas, así que esta pantalla es nueva para
ella. Lo esperado: que diga que no hay héroe en la batalla, o que no saque la sección.

**H3 · menor · con la rueda abierta, botones que parecen encendidos y no hacen nada.** Para
reproducirlo: s30, en la batalla de la guardia (10,4), clic en un goblin. Con «Tu golpe» abierto,
«Terminar turno» y «Resolver sola» se ven encendidos (`p06`), pero un clic real en ellos no hace
nada: el diálogo es modal. No sale ningún mensaje y el estado no cambia (comprobado). Pasa lo mismo
con «Resolver sola» en la fase de respuesta. Lo esperado: verlos apagados mientras la rueda espera,
como ya están «Esperar» y «Defender».

**H4 · menor · un clic durante el desenlace de la rueda se pierde sin decir nada.** Mientras el
diálogo cuenta el cruce, un clic en el tablero no hace nada. Durante una marcha, en cambio, la barra
dice «Espera a que termine la jugada.». Lo vi en la defensa de s1: el disparo pulsado justo tras
elegir la respuesta no se aplicó y la página no avisó. La persona no sabe si tiene que volver a pulsar.

## Workarounds usados

- **El espejo en Node** (la `Session` con la misma semilla) solo traduce la casilla a píxeles. No
  fuerza ningún estado: la página recibe clics y teclas reales, y en cada paso se comprueba que el
  oro, el día y la unidad activa coinciden. No afecta a quien juega.
- **Repetir el clic que la página rechaza mientras cuenta una jugada.** Quien juega ve «Espera a que
  termine la jugada.» y vuelve a pulsar, así que es su mismo gesto. El caso que no avisa es H4.
- **Licenciar un escudo para que quepa el monje.** Es lo que haría quien juega: el ejército sale lleno
  (6 de 6) en ~30 % de las partidas. Pasaba igual antes de la tarea (el mismo `startingArmy` 2-4 + 2
  en `main`).
- **Guardar de verdad en la arena** escribe `data/unidades.json`. Lo devolví con `git checkout`, y el
  árbol quedó limpio.

## No probado

- `verify:lento`: es del cierre.
- C7 con una pieza (cambiarla en la arena y comprarla en la armería de la partida).
- Las pasadas de `capturas` que quedan detrás de un fallo: poderes, rueda-del-golpe, armas y rueda-contrincantes.
- La base de imperio, elfos y no muertos en el navegador.
- Salir del contacto, mirado aparte en la partida.
- Un `power` del agente en `pnpm qa`, que juega no muertos; lo cubre `agent-link.test.ts`.
- Recargar a media rueda: empieza una partida nueva del día 1 (8 000 de oro), sin errores. No hay
  guardado, así que no es un hallazgo.

## Veredicto

**Apto con reservas.** Las 3 reservas:
1. `pnpm capturas` en rojo en 5 pasadas (H1). C12 no se cumple hasta que pase, y el aviso de espera
   del móvil hay que diagnosticarlo antes de darlo por fallo del guion.
2. H2-H4, menores de pantalla.
3. CLAUDE.md y las medidas con fecha, que van en F7.

Para quien juega, la petición se cumple: el juego pelea con el combate y los ejércitos de la arena,
en el mapa, en las defensas, con el agente y en el espectador, y lo que se guarda en la arena es lo
que se recluta.
