# QA: equipo de la arena por tipos, con bases y armas que cambian la rueda

Validado contra la petición literal y los 10 criterios de `requisitos.md`, sobre el diff sin commitear
del worktree (ningún fichero de `src/`, `test/`, `data/` ni `tools/` es más nuevo que `implementacion.md`:
`find … -newer` vacío). Flujo real: `npx vite --port 3311 --strictPort` (arrancado con `set -m` en su
línea, PID 153588 = su grupo; matado por grupo y comprobado con `ss`: «3311 libre») y Playwright sin
pantalla, 1440×900, con los POST del borrador interceptados (no se escribió nada en disco:
`data/borradores/unidades.json` sin cambios en `git diff`). Consola: **0 errores y 0 avisos** en todas
las páginas abiertas.

No repetí `pnpm verify`, `pnpm banco`, `arena-ia` ni `capturas` (implementación los da en verde tras
/simplify y nada cambió desde entonces). Sí corrí los cuatro tests de la tarea: `npx vitest run
test/equipo-bases.test.ts test/rueda-del-arma.test.ts test/arena-equipo.test.ts test/equipo.test.ts` →
4 ficheros, 89 tests en verde. Las pruebas del núcleo las hice en un test temporal
(`test/_qa_tmp_core.test.ts`), borrado al acabar.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Cuatro secciones, solo calidad `arena`, sin accesorios | ✅ | `data-seccion-de-equipo` = `cuerpo,distancia,armadura,escudo`; el texto del editor lista solo Espada, Mandoble, Bastón, Lanza, Daga, Maza, herrería, bendita / Arco, Ballesta / 5 armaduras / Rodela, Escudo, Pavés. Ni garrote, ni espada de armería, ni accesorios. `capturas/qa-01-editor.png` |
| 2 | Sin PV ni Calidad, un precio en oro; el núcleo rechaza otro recurso | ✅ | Campos de la Espada: `nombre,base,manos,ataque,danio-min,danio-max,precio-gold,rueda-*`; «Calidad»/«PV» no salen en el texto de ninguna ficha. Núcleo: `validarEquipo` → «"x" es de la arena y cuesta madera: en la arena el precio es solo en oro»; `catalogoDeLaArena` igual con «Espada»; PV 10 → «…se protege con armadura… no con PV» |
| 3 | Cada tipo, solo sus campos; el núcleo rechaza lo que el tipo no admite | ✅ | Lanza (carga): ataque, daño, precio y rueda, sin manos; Arco: ataque, daño, precio; Brigantina: defensa, armadura, velocidad, precio; Escudo: defensa, velocidad, precio; tabla de rueda solo en Espada y Lanza. Escudo a velocidad 0 en la página → «No se cambia: «Escudo» es un escudo y tiene que restar velocidad…», la casilla vuelve a −1. Núcleo: defensa en arma, ataque en armadura, velocidad en arma, rueda en distancia y en armadura: rechazados con su frase |
| 4 | Base elegida en la ficha o «Nueva sobre esta», encadenable, cadena dicha y extra/final por cifra | ✅ | Desde la página: Espada → «Nueva sobre esta» → «Mi herrería» (+1 ataque, +5/+5, +150 oro) → «Nueva sobre esta» → «Mi bendita» (+1 ataque, Normal +10, +300 oro): cadena «Espada → Mi herrería → Mi bendita», finales ataque 4, daño 15–35, precio 450, «Normal: Daño ×1,1»; columnas «Extra» y «Final». `capturas/qa-03-mi-bendita.png`, `qa-02-bendita.png` |
| 5 | Vínculo vivo: montaje y media pelea | ✅ | Espada a ataque 4 y daño máx. 50 → herrería, bendita, Mi herrería y Mi bendita pasan a ataque 5/6/5/6 y 15–55. A media pelea (guerrero con la bendita, `?seed=1&golpe=rueda`): «Editar equipo» del panel, Espada daño máx. 60 y Fuerte +30 → el guerrero pasa de «Daño 23–45» a «23–75» y el parte dice «Cambian las cifras de Espada bendita a media pelea (daño 15-35 → 15-65; por su base, «Espada de herrería»)» y la de la rueda «Normal +10 → Fuerte +30, Normal +10». `capturas/qa-11-media-pelea-equipo.png`, `qa-12-media-pelea-retoque.png` |
| 6 | Rechazos con motivo | ✅ | Inexistente: «toma de base «nada», que no existe»; otro hueco (`conBase`): «Arco va en Arma a distancia y «Espada» en Arma: la base es del mismo hueco»; de calidad armería: «…que no es de la arena»; ciclo: «sus bases dan la vuelta («Espada» → «Espada bendita» → «Espada de herrería» → «Espada»)» (también entre dos nuevas, A → B → A); borrar la base en la página: «No se cambia: «Mi herrería» es la base de «Mi bendita»: cámbiale la base o bórrala antes» y la pieza sigue; resuelta que no cumple: ataque −9 sobre la herrería → «…ataque tiene que ser un entero ≥ 0 y es -7», Maza con Rápido −60 → «Rápido haría el 0 % del daño». El desplegable de base no ofrece la propia ni sus dependientes (Espada: ninguna, Mandoble, Bastón, Daga, Maza). `capturas/qa-04-borrar-base.png`, `qa-14-rechazo.png` |
| 7 | Tabla «Rueda del golpe»; la rueda usa el arma de cada golpe y la que se abre lo enseña | ✅ | Tabla de 7 filas con Suma/Extra y Final. Rueda que se abre (guerrero contra orko con mandoble): con **Maza**, Fuerte 39–77 «Daño ×1,45», Rápido 2 × 3–14 «×0,4», Romper guardia «−4 máximo … −1 bajo o mínimo»; con **Espada**, Fuerte 15–45 «×1,25», Rápido 2 × 2–16 «×0,6», «−3 … nada bajo o mínimo»; con la **bendita**, Normal 39 «Daño ×1,1». Respuesta del orco (mandoble, el arma del que responde): Fuerte 49–91 «tu contraataque hace daño ×1,4», Rápido «2 golpes de daño ×0,45»; el parte da el contraataque en 91, el máximo previsto. Carga con lanza (primer golpe con la lanza, el segundo con la espada): solo por test (`rueda-del-arma.test.ts`, en verde). `capturas/qa-08-rueda-golpe-maza.png`, `qa-08-rueda-golpe-espada.png`, `qa-09-rueda-respuesta-maza.png`, `qa-10-tras-cruce-maza.png` |
| 8 | Perfiles de ejemplo en `data/equipo.json`, dichos inventados | ✅ | Espada sin `rueda`; Maza `{fuerte: 20, rapido: -20, romperGuardia: 1}`; Mandoble, Daga, Bastón y Lanza con la suya; `espada_de_herreria` (base espada) y `espada_bendita` (base herrería); el `_comment` dice «INVENTADOS y provisionales» (rueda y bases) |
| 9 | El enlace lleva las bases, se reabre igual y sube la versión | ✅ | Espada cambiada (ataque 5) y «Espada del rey» nueva sobre la bendita, puesta en el guerrero: el enlace es `v: 10` y lleva la Espada cambiada y la nueva (herrería y bendita no, son de serie y salen del fichero). Reabierto en otra pestaña: la tarjeta dice lo mismo, «A 10 · D 8 · 23–45 daño … lleva Espada del rey». El de la versión 9 rechazado: pasada `arena` de capturas (implementación) y test. `capturas/qa-13-enlace-reabierto.png` |
| 10 | `pnpm banco` con el mismo hash | ✅ (citado) | implementación, tras /simplify: `sha256 4ec21762…683867d`, «ancla: igual». No lo repetí: no cambió nada desde entonces |

## Hallazgos

Nada bloqueante ni importante. Lo menor:

1. **Menor: la tarjeta de una pieza del enlace se resuelve contra la base de tu arena, no contra la del
   enlace.** Para reproducirlo: cambia la Espada (ataque 5), crea «Espada del rey» sobre la bendita,
   pónsela al guerrero, «Copiar enlace» y ábrelo en otra pestaña con el borrador sin la Espada cambiada.
   La unidad pelea con ataque 10 (bien), pero en «Editar equipo» la tarjeta de «Espada del rey» dice
   «+4 Ataque» (contra la Espada de tu arena, ataque 2), sin la marca «en la pelea, la del enlace» que sí
   lleva la Espada. Quien juega esperaba ver el +7 con que pelea. El plan lo aceptó como riesgo
   («resolverá contra la tuya»); lo apunto porque en pantalla no hay ninguna pista.
2. **Menor: el sello «de serie» de una pieza cuya base cambió.** Si cambias la Espada, la herrería y la
   bendita siguen diciendo «DE SERIE» con cifras distintas a las del fichero (están escritas igual: es
   coherente con `esDeSerie`, pero quien mira la tarjeta lee «como en el fichero»).
3. **Menor: el parte nombra la base de al lado, no la que cambiaste.** Al cambiar la Espada a media pelea,
   el parte dice «por su base, «Espada de herrería»». Es cierto en cadena, pero quien tocó la Espada
   esperaba leer «Espada».
4. **Menor, ya en el backlog del plan:** el desplegable de equipo de la ficha de una unidad sigue
   ofreciendo piezas del juego, algunas con PV («Hacha de leñador · +1 Ataque, +10 PV», Garrote, Espada
   de armería, Estoque ligero). Va contra el espíritu de «quita PV», aunque el criterio 1 habla solo de
   «Editar equipo».
5. **Menor, de lectura:** en la tabla de la rueda, Finta «1/2/3/4/5» y Romper guardia «−3/−2/−1/0/0» van
   del éxito máximo al mínimo y solo lo explica el «ⓘ».

## Workarounds usados

- **Los POST del borrador se interceptaron** (no se guardó nada): así no se ensucia el repo. No afecta a
  quien juega: el flujo probado es el de antes de pulsar «Guardar», y lo que guarda está en la pasada de
  capturas y en los tests.
- **Los sectores de la rueda se eligieron con las teclas (2) y se leyeron por su `aria-label`:** el clic
  de Playwright en el centro del botón de Fuerte lo intercepta el «ⓘ» del sector Normal (comprobación de
  geometría de Playwright, no un clic de verdad). La rueda lo admite por diseño (teclas 1-7); `pnpm
  capturas` ya hace clic de verdad en los sectores, así que no lo cuento como hallazgo.
- Las comprobaciones del núcleo (ciclos, otro hueco, oro, cadena de 300) se hicieron en un test
  temporal, borrado. Una cadena de 300 piezas resuelve en 9 ms.

## No probado

- La carga con lanza en el navegador (el primer golpe con la lanza y el segundo con la de cuerpo a
  cuerpo): solo por el test `rueda-del-arma.test.ts`, en verde.
- Que el cambio de rueda a media pelea (Fuerte +30) se vea en la rueda que se abre después: el parte lo
  registra y `mismasArmas` compara la rueda (test), pero no llegué a abrir otra rueda tras el retoque.
- «Guardar» de verdad y los «Avisos al leer» de un borrador viejo: cubiertos por tests y por la pasada
  `equipo` de capturas, no por mí.
- `pnpm verify`, `banco`, `arena-ia` y `capturas`: los cito de `implementacion.md`; no los repetí.

## Veredicto

**Apto.** Los diez criterios se cumplen en el flujo real y en el núcleo, y la pasada adversarial (cadena
desde la página, vínculo vivo en el montaje y a media pelea, borrar una base, ciclos, rebase a un arma de
dos manos con escudo puesto, enlace con bases, la rueda con Maza frente a Espada y el contraataque con el
arma del que responde) no rompe nada. Los cinco hallazgos son menores y de presentación.

## Correcciones tras QA (coordinador, 18-10-2026)

A petición del usuario se arreglaron los hallazgos menores 1, 2, 3 y 5 (el 4 sigue en el backlog):

1. La tarjeta y la ficha marcan «en la pelea, la del enlace» también cuando la pieza pelea distinto
   porque su base viene del enlace (`peleanDistinto`, `main.ts`: compara las piezas resueltas, no las
   escritas), y el aviso enseña las cifras con que pelea. Comprobado por lectura del código y con la
   pasada `arena` de capturas, no reproducido en el navegador.
2. Una pieza de serie cuya base no lo es dice «su base cambió», con cuál en el `title`
   (`baseCambiada`, `core/arena.ts`). Test en `arena-equipo.test.ts` y `equipo-bases.test.ts`.
3. El parte de un retoque nombra la base que se tocó («por su base, «Espada»» en la bendita), con
   `primeraBaseQue`. Test ajustado en `equipo-bases.test.ts`.
5. La tabla de la rueda dice Romper guardia y la Finta del éxito mínimo al máximo con su unidad
   («−1 a −4 ataque», «5 a 1 casillas»), y la nota de la fila trae cada éxito.

`pnpm verify` en verde (3 366 tests) y `CAPTURAS_SOLO=equipo,arena pnpm capturas` sin errores.
