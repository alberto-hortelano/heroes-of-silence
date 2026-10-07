# QA — #156, laderas de acantilado laterales (vuelta 2 + /simplify)

Fecha: 07-10-2026. Árbol: `main` (fba6ef4) con el diff sin commitear. Comparación con HEAD: worktree `scratchpad/head0` (fba6ef4 limpio), solo leído.

Petición literal: «hay paredes de roca y en el mapa van todas con la misma orientación» (+ «se pide nuevo arte», + 07-10: «evitar bordes rectos, que tenga un poco de giros», repetición que no se note).

Semillas mías: 11-20 (taller a 110 px, mapa entero) y 2 (barrancos); cliente real en 12, 15 y 19. Capturas en `capturas-qa/` (`par-*` = HEAD a la izquierda, ahora a la derecha).

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 0 | La petición: las paredes ya no van todas de frente | ✅ | Todas las capturas: los riscos N-S llevan ladera que mira al este o al oeste (`s17-roca-este-x25-y0.png`, `s19-riscos-x26-y4.png`, `par-s15-basalto-x5-y9.png`). |
| 1a | Toda caída E/O lleva ladera del material de su meseta | ⚠️ parcial, declarado | 3 731 de 6 798 casillas de canto (55 %) en 1-40 (`medir.ts 1 40`, lo he vuelto a correr: las mismas cifras). En 11-20 hay semillas por debajo de la mitad: s13 tiene 95 casillas sin ladera de 160. Casi todas las que no llevan ni ladera ni peñascos («nada») están a ≤ 2 casillas de una ciudad, un nodo, una mina o un pueblo (lista en `analizar.mts`). Unas pocas no tienen objeto cerca: s15 (12,14 e), (21,19 o), (26,3 o); s17 (1,18 e), (2,19 e), (32,15 o), (33,16 o); s20 (11,32 e), (12,31 e), (22,4 e), (33,14 o). Son sendas. |
| 1b | La hoja del lado y de la caída correctos | ✅ | `laderasMalCubiertas` = 0 en 1-40. Comprueba la hoja (lado, caída y material) desde la geometría del sprite. En 11-20 salen las 21 combinaciones material×lado×caída que hay, y caída 3 en los cuatro materiales salvo basalto-3 y arenisca-este-3, que no aparecen en estas semillas. |
| 1c | Cadena N-S sin huecos ni solapes que dupliquen roca | ❌ en los barrancos de una casilla | Dentro de una cadena, bien: no hay muesca, y el filo y el pie ondulan. **Pero donde una casilla baja tiene ladera a los dos lados** (este desde x y oeste desde x+2), las dos laderas se montan en la misma columna. Son 212 casillas en 1-40, 136 de ellas de agua. Ver H1. |
| 2 | Esquina frontal↔lateral continua | ✅ con reserva | 792 esquinas en 1-40. En s19 x22-32 y13-21 (`s19-escaleras-x24-y14.png`) las laderas cruzan en diagonal la fila de columnas frontales y la lectura queda enmarañada (H3). En las escaleras simples se ve continua. |
| 3 | Nada se espeja; el oeste usa su hoja | ✅ | Las hojas `laderas-*-oeste-*` están en disco y las usa `hojaDeLadera`; `recortadas` = 0. |
| 4 | Rampas: la ladera se aparta; guardias a 0 en 1-40 | ✅ | `medir.ts 1 40`: sobreSenda, sobreRampa, fueraDelPie, malCubiertas, sobreReserva, recortadas y faltan a 0, «semillas con algún guardia distinto de 0: ninguna». En 11-20 (`analizar.mts`), el informe a 0 en las diez. |
| 5 | Peñascos del canto solo donde no hay ladera | ✅ | `laderasMalCubiertas` detecta «ladera y peñascos» y da 0. En las capturas no veo peñascos bajo laderas. |
| 6 | Caídas al norte como hoy | ✅ | Lo indica la huella: rebordes iguales. En los pares no veo cambios en los rebordes. |
| 7 | Rendimiento | ⚠️ no probado por mí | Me fío de la medida del ingeniero (s1 y s7, 2560×1440, sin cambios dentro del ruido). En el cliente real, el suelo queda pintado en 6,5-7,8 s en 2560×1440 (s12, s15, s19). |
| 8 | verify / banco / capturas / tests | ✅ | `pnpm verify`: 56 ficheros, 1 910 tests verdes. `pnpm banco`: «ancla: igual», 0/200 sin terminar. `pnpm capturas`: salida 0, «sin errores en consola», 228,8 s. |
| 9 | Capturas antes/después | ✅ | Las del ingeniero, más las mías en 2, 14, 15, 16, 17 y 19. |
| 10 | Arte sin bordes rectos, con giros, sin muesca, con caída 3, repetición que no se note | ✅ con reserva | Las cadenas largas (s17 e25 y0-5, s19 e29/o31 y6-10, s12 e17 y0-7) no muestran muesca y no veo repetición evidente en 5-6 casillas. Quedan bordes rectos que no son del arte de las laderas: H2 y H4. |
| 12 | Peso visual: que no se lean como muros que tapan la meseta | ⚠️ | Mejor que la vuelta 1. En s16 x14-17 y11-14 (`par-s16-ciudad-x17-y15.png`), en cambio, una ladera nevada sustituye a una frontal pequeña y se lee como un bloque grande sobre el pantano. |
| — | Tono del basalto y de la arenisca oeste | ✅ | `par-s15-basalto-x5-y9.png`: el basalto ya no lleva el labio gris y casa con la ceniza; queda algo más oscuro que sus frontales, que son claras y columnares, pero se lee. `par-s14-arenisca-oeste-x14-y14.png`: la arenisca oeste casa con su frontal. |
| — | Cliente real sin errores | ✅ | Playwright sin pantalla, 2560×1440, s12, s15 y s19: inicio, zoom máximo, tope de alejar y dos días pasados con Espacio. Consola sin errores ni avisos. `cliente-s*-*.png`. |

## Hallazgos

### H1 — importante: un barranco de una casilla se rellena con dos laderas y se lee como una cresta; el agua desaparece
- **Reproducir:** `?seed=2`, casillas (3,4)-(3,6) y (30,27)-(30,29); `?seed=19`, columna x30, y7-10. En el taller: `par-s2-barranco-x3-y4.png`, `par-s2-barranco-x30-y28.png` y `par-s19-x26-y4.png`.
- **Qué pasa:** la casilla baja (agua, nivel −1 en s19) tiene meseta a los dos lados. La ladera este de x29 y la oeste de x31 anclan las dos en x ≈ 30,45-30,55 (volcado de `caja.mts`), una encima de la otra. En HEAD se veía un arroyo o un estanque con su orilla; ahora se ve una espina de roca doble que tapa el agua entera. El relieve se lee al revés: lo bajo parece lo alto.
- **Alcance:** 212 casillas en las semillas 1-40, 136 de ellas de agua (`barrancos.mts`).
- **Por qué no lo caza nada:** `laderasMalCubiertas` cuenta por casilla de canto, que son dos distintas (x29 este y x31 oeste), así que no ve que se pisan en la casilla baja.
- **Qué espera quien juega:** ver el agua o el barranco: o una sola ladera, o dos que no se monten, o peñascos.

### H2 — menor (regresión local): cara frontal lisa con bordes rectos junto a un nodo
- **Dónde:** s19, cara al sur de caída 2 en x27, y5. En el taller, `par-s19-x26-y4.png`, a la derecha del nodo con escalera.
- **Qué pasa:** queda un rectángulo oscuro de roca lisa, de bordes verticales rectos.
  - En HEAD llevaba la frontal `paredes-roca/3` (x27,78 y7,24).
  - Ahora no lleva ni frontal ni esquina: la esquina de la ladera este x27 y4-5 no se puso, y la frontal tampoco entra.
  - Supongo que es por `junto`: la senda que pasa al pie suma ahora `ENTORNO_DE_LADERA`. No lo he confirmado.
- **Alcance:** en 1-40, «caraSinPared» pasa de 622 a 625. Son pocas, pero son justo los «bordes rectos» que el usuario pidió evitar.

### H3 — menor: donde se cruzan laderas y frontales, la lectura se enmaraña
- **Dónde:** s19 x22-32 y13-21 (`s19-escaleras-x24-y14.png`).
- **Qué pasa:** varias laderas bajan en diagonal por encima de una fila de columnas frontales. No hay hueco ni solape que mida un guardia, pero cuesta leer qué está arriba y qué abajo.

### H4 — menor: casillas de canto sin nada (1 711 en 1-40)
- **Dónde:** s17 (1,18)-(2,19), `par-s17-sin-nada-x1-y18.png`.
- **Qué pasa:** la caída no se ve. Ni ladera, ni peñascos, ni más que la franja difuminada. Es igual que en HEAD, así que no hay regresión.
- **Cómo se reparte:** casi todas están junto a ciudades, nodos y minas (#159) o junto a sendas (#151). Es la desviación declarada del guardia: acepto que no lo cuente, pero queda visualmente plano.

### H5 — menor, sin consecuencia: decoración distinta respecto a HEAD
- **Qué pasa:** en los pares cambia la decoración (árboles, vallas) respecto a HEAD (s2, s14). Es el efecto esperado de que las laderas reserven sitio antes.
- **Qué compruebo:** no he visto que tape nada.

## Workarounds usados
- **Página del taller sin nubes, mapa entero a 110 px**, para ver lo que la niebla oculta en el cliente.
  - Usa el mismo `componer`/`separar` que el cliente.
  - Quien juega no ve esto sin explorar, pero sí verá lo mismo al explorar.
  - En el cliente real comprobé las zonas visibles al empezar.
- **Worktree `head0`, solo lectura**, para los pares. No lo he modificado.

## No probado
- **Fps:** no los medí. El cambio de /simplify solo toca un filtro de color, y me fío de la medida de la vuelta 2.
- **El espectador:** solo a través de `pnpm capturas`, que pasó sin errores.
- **La región en concreto en el cliente**, más allá de lo explorado los días 1-3: el cliente no tiene forma de quitar la niebla.
- **Caída 3 de basalto y de arenisca este:** no salen en 11-20.

## Procesos
- **Vite:** lo arranqué en 127.0.0.1:3197, en su propio grupo (PID 82210). Lo maté por su grupo, y `ss` lo da libre.
- **`pnpm capturas`:** gestionó sus propios puertos.
- **Lo demás:** no he matado nada ajeno ni tocado stash, worktrees ni código.

## Veredicto
**Apto con reservas.**
- La petición se cumple: los riscos N-S ya no son una escalera de frontales, y el arte nuevo encadena sin muesca y con giros.
- Las comprobaciones fijas están en verde, y los guardias a 0 en 1-40.
- Reserva principal, H1: antes de commitear conviene resolver o aceptar explícitamente los barrancos de una casilla tapados por dos laderas. Son 136 casillas de agua ocultas en 40 mapas, y el relieve se lee al revés.
- H2-H4 pueden ir a backlog (#159/#151).

---

# Re-verificación tras el arreglo de H1 y H2 (07-10-2026)

Alcance: solo lo que tocó el arreglo (`sinBarrancos` y su guardia `laderasEnfrentadas`, los dos pasillos `junto`/`juntoDeLadera`, `pieDeCara.en`), más una pasada adversarial. Semillas nuevas: 21-30 (medidas y taller), 41-100 (medidas), 50 (cliente, por `pnpm capturas`), 51, 52 y 85 (casos raros que salieron). Las de H1/H2: 2, 5, 19. Capturas en `capturas-qa2/` (`par-*` = HEAD fba6ef4 a la izquierda, ahora a la derecha). Medidas propias con `scratchpad/qa2/medir.mts` (independiente del informe: pies de ladera desde `juntasColocadas`, paredes sobre la senda con media anchura 0,1).

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| H1 | Un barranco de una casilla ya no lleva dos laderas; se ve el agua o el suelo | ✅ | `s2-barranco-x3-y4.png` y `s2-barranco-x30-y28.png`: el estanque vuelve a verse, con peñascos. `s19-x26-y4.png`: el río de x30 y6-10 se ve entero. Mi recuento independiente (pies opuestos en la misma fila a < 0,6 casillas): 3 casos en 1-40, 0 en 21-30, 8 en 41-100, ninguno con los pies en la misma casilla salvo el de s52 (abajo). |
| H1g | Guardia `laderasEnfrentadas` = 0 | ❌ fuera de las semillas medidas | 1-40: 0 (lo confirmo). **41-100: s52 da 1** (`13,12: laderas de los dos lados al pie`). Ver R1. |
| H1c | Lo que deja el barranco: canto con peñascos, no plano | ✅ | Barrancos (cantos este con canto oeste a dos columnas) sin ningún sprite de pared en su caja: HEAD 271, ahora 172 en 1-40; 64 → 46 en 21-30. Mejor que HEAD. |
| H2 | s19 x27 y5 vuelve a llevar frontal | ✅ | `s19-x26-y4.png`: la cara a la derecha del nodo con escalera lleva columnas, sin el rectángulo liso. |
| H2b | La frontal no tapa sendas más que en HEAD | ✅ | Paredes no-ladera cuyo rectángulo pisa la línea de una senda (0,1): HEAD 798, ahora 707 en 1-40; 215 → 185 en 21-30. Sobre lo que baja por una ladera, en estricto: 244 en 1-40 (349 con el pasillo de 0,3+0,5 que cita el ingeniero; yo cuento 349, él 347). `s5-frontal-ladera-x18-y4.png`: la senda que baja por la ladera llega a la frontal y queda bajo ella; es el coste declarado y a la vista se lee como que la senda pasa detrás. |
| P | `pieDeCara.en` con caída que cambia | ✅ | 59 escaleras con caída distinta en 21-30 (`escal.mts`). Pares en s22, s24, s27 y s28 (`par-s*-escalera-*.png`): las frontales siguen apoyadas, sin flotar ni hundirse en la cara de abajo. `paredesFueraDelPie` = 0 en 1-100. |
| G | Resto de guardias del informe | ✅ | 0 en 1-100 salvo `laderasEnfrentadas` en s52. |
| V | `pnpm verify` | ❌ | **1 test rojo**: `invariantes > ningún fichero que una máquina lee lleva dentro la ruta de esta máquina`. Ver R2. Los otros 1 919, verdes. |
| B | `pnpm banco` | ✅ | `ancla: igual`, 0/200 sin terminar. |
| C | `pnpm capturas` | ✅ | Salida 0, «sin errores en consola», 228,6 s; PNG en `capturas-qa2/capturas/`. Cliente en la semilla 50. |
| T | Taller sin errores | ✅ | 17 semillas ahora y 14 en HEAD, `errores: []` salvo un 404 en la primera página de cada tanda (favicon del servidor del script, igual en HEAD). |

## Hallazgos

### R2 — bloqueante para cerrar: `pnpm verify` en rojo por los scripts nuevos de la carpeta
- `barrancos-arreglo.mts:2`, `frontal-ladera.mts:3` y `trio-arreglo.mts:2` llevan `/home/al/code/heroes` dentro, y el invariante de rutas los caza (`docs/agents/` cuenta).
- Reproducir: `pnpm verify` → `Tests 1 failed | 1919 passed`. El informe del ingeniero dice 1 920 verdes: los scripts debieron de escribirse después.
- El hook `Stop` no dejará cerrar así. Arreglo de ingeniero (quitar las rutas o los scripts), no mío.

### R1 — menor: el guardia `laderasEnfrentadas` sale 1 en s52; la regla solo cubre barrancos de una casilla
- `?seed=52`, x13 y12 (`par-s52-enfrentada-x10-y9.png`). Lo bajo mide dos casillas (x12-13, agua), así que `sinBarrancos` no actúa; pero la ladera este de x11 tiene caída 4 (basalto, nivel 3 → −1) y su pie llega a 13,03, en la misma columna que el de la ladera oeste de x14 (13,55).
- A la vista no se montan del todo (queda agua entre las dos), pero la losa de basalto de caída 4 tapa la mitad del canal y se lee como un bloque oscuro grande sobre el agua y la montaña roja.
- El contrato es «el informe a 0»; los tests solo miran s1, 3, 7 y 9, y `medir.ts 1 40` no llega. En 1-100 es un solo caso: la regla o el guardia tienen que decidir qué pasa con lo bajo de dos casillas y talud ≥ 1 casilla.

### R3 — menor: borde recto donde termina la frontal junto al estanque del barranco
- `s2-barranco-x30-y28.png`: a la izquierda del agua, la cara de la fila 27 acaba en un corte vertical liso (la frontal se para antes del barranco y la cara pintada queda al aire). En HEAD la frontal llegaba al agua con peñascos.
- Es pequeño, pero es exactamente el «borde recto» que pidió evitar el usuario. No he medido cuántos barrancos lo tienen.

### Observado, no nuevo
- Rectángulos de cara lisa junto a ciudades y sendas (s27 x15 y26, s50 junto al castillo del jugador, visible en `capturas-qa2/capturas/desktop-03-mapa-zoom-y-arrastre.png`): iguales en HEAD (`par-s50-castillo-x19-y26.png`). Van con #159/#151.
- H3 se repite en semillas nuevas: s28 x9-15 y1-7 (`par-s28-escalera-x9-y1.png`), el basalto lleno de laderas se lee peor que en HEAD; y en s24 x5 y22 una ladera nevada asoma por encima de la fila de frontales. Ya va a issue.
- Cañones de dos casillas con laderas a los dos lados (s85 x22-25 y4-9 y x10-12 y10-13, `s85-pies-cerca-*.png`): queda un hilo de agua o de suelo; se lee como cañón, lo doy por bueno.

## Workarounds
- Página del taller sin nubes a 110 px (como en la primera pasada): mismo `componer`; el cliente real, por `pnpm capturas`.

## No probado
- Fps: hay menos sprites que en la vuelta anterior; no lo medí.
- R3 sin recuento.

## Procesos
- No arranqué ningún servidor de puerto fijo; el taller usa el puerto 0 dentro de su proceso, y `pnpm capturas` gestionó los suyos. Al acabar, `ss` solo muestra el 3636 (ajeno, no tocado). Nada matado; ni código, ni stash, ni worktrees tocados.

## Veredicto de la re-verificación
**No apto** tal como está, solo por R2: `pnpm verify` está en rojo y el hook no deja cerrar. El arreglo en sí cumple: H1 y H2 resueltos en las capturas, la frontal no tapa más sendas que en HEAD, `pieDeCara` bien en 59 escaleras nuevas, banco igual y capturas sin errores. Quitadas las rutas absolutas de los tres scripts, pasaría a **apto con reservas** (R1: el guardia no está a 0 en s52; R3: borde recto en un barranco).

### Nota del coordinador (07-10-2026)
R2 está arreglado: los tres scripts de la carpeta ya no llevan la ruta de esta máquina (`new URL('../../..', import.meta.url)` e `import 'sharp'`). Tras el arreglo, `pnpm verify` da 1920/1920. Según el propio veredicto de QA, la tarea queda **apta con reservas** (R1 y R3).
