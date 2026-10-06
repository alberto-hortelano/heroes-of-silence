# QA — Rampas de acantilado (#150), tras la vuelta de /simplify

Fecha: 06-10-2026. Árbol: `main` (857a849) con el diff de #150 sin commitear (11 ficheros, +679/−93, más `test/rampas.test.ts`). QA no ha tocado ningún fichero rastreado: `git diff --stat` da lo mismo antes y después.

Todo lo de QA está en `capturas-qa/`. Los guiones son `qa-*.ts`, en la carpeta de la tarea. «Antes» es HEAD, sacado con `git archive` en el scratchpad (solo cambian los 4 ficheros del escenario).

## Criterios

| # | Criterio (requisitos + punto de control + encargo) | | Evidencia |
|---|---|---|---|
| C1 | Un único hecho «dónde baja un camino por una cara», derivado de los tramos y leído por la pared y por la cara | ✅ | `grep "rampas("`: solo `relieve.ts:272` (definición) y `colocar.ts:550` (una llamada en `componer`, sobre `trazos` = `sendas(map.caminos.tramos)`). `pintar.ts` y el bucle de paredes leen `c.rampas`. |
| C2 | Donde un camino baja por una cara, la senda se ve de punta a punta: **la cara** no se pinta encima | ✅ | `qa-adversarial.ts`, semillas 1-10. Con la senda (centro ± 0,1) a ≥ 0,2 dentro de la cara: **0,00 casillas** de senda que baja quedan fuera del tajo. Con 0,1 quedan 2,26 casillas, todas en el canto de la cara. La que corre al pie (35,6) queda fuera de alcance. |
| C2 | … **sin rectángulo liso** | ❌ | Mejora en conjunto. Cara lisa a ≤ 1 casilla de una rampa, en las semillas 1-10 (`qa-cara-lisa.ts`): **63,7 → 41,5 casillas**. Pero el corte **crea rectángulos lisos nuevos** (12,4 casillas que antes tenían pared): H2, H3. |
| C2/C7 | … **sin pared encima, también en las diagonales** | ❌ | En una diagonal que baja por una escalera, la senda **se mete bajo la pared** de la cara de al lado (H1, `zoom-s5-x3-y9-pared-sobre-senda.png`). `paredesSobreRampa` = 0 no lo ve: solo mide el trazo dentro de la banda de la cara de la rampa. |
| PC | Punto de control: tajo **sin pelar las escaleras**; el corte, poco más que la senda y su arcén; los bordes conservan pared | ⚠️ | Tajo medio de 0,72 casillas en caras de 1,70 de media (`medir.ts`, reproducido). La escalera de `s5-x15-y4` conserva la pared de los peldaños hasta el paso. Pero la salida actual es **peor que la aprobada** abajo a la derecha: ~0,75 casillas de cara lisa (y5 x15,03-15,78) donde la aprobada tenía pared (`zoom-s5-escalera-aprobada-simplify-qa.png`). Lo exigía `hallazgos-simplify.md` («iguales o mejor»). H4. |
| C3 | Fuera la sonda pie/filo | ✅ | `colocar.ts` ya no tiene `contiene`; `Pasillo.contiene` se ha borrado. |
| C4 | `spritesSobreSenda` = 0, `paredesSobreRampa` = 0, sin errores, semillas 1-10 | ✅ (literal) | `medir.ts`: 0 y 0 en las 10 semillas. También en el taller (semillas 5, 6, 9, 23 y 27): `errores: []`. **Reserva:** el 0 de `paredesSobreRampa` no cubre H1. |
| C5 | Ni núcleo ni banco | ✅ | `pnpm banco`: `sha256 020ccc584552b1bae38d02cbc57879a488d5c39c08b20b51ab28eafc1ab27e36`, «ancla: igual», 0/200 sin terminar. `git diff --stat` sin `src/core`. |
| C6 | `pnpm verify` en verde | ✅ | 55 ficheros y 1829 tests, exit 0, 69 s de reloj (la máquina va cargada). |
| C6 | `pnpm capturas` al cerrar | ✅ | Exit 0: «sin errores en consola; … 196.4 s», en `capturas-qa/pnpm-capturas/`. La del espectador no vale como prueba (#154). |
| C7 | Las capturas de antes y después incluyen una diagonal | ✅ | `trio-s9-x27-y22.png`: antes, la aprobada y la de QA. La senda no pasa bajo la pared y la pared termina en el borde del paso. |
| — | Los fps no empeoran | ⚠️ | Ver la sección siguiente: hay un empeoramiento leve al tope de alejar que el ruido no deja separar. |
| — | El juego en vivo, semillas 5 y 9 | ✅ con límite | Vite propio en el 3188 y `qa-vivo.ts` con Playwright sin pantalla: `{"escenario":"pintado","consola":[]}` en las dos semillas, y el suelo pintado en 7,4-8,6 s. En s5, `vivo-s5-x7.5-y5.5.png` muestra el rectángulo liso de H2b, igual que el taller. En s9, la niebla del día 1 tapa todas las rampas salvo la del castillo (`vivo-s9-x6.5-y6.5.png`, la senda se ve). Las demás de s9 solo se ven en el taller. |

### Los fps

Medidos con `medir-fps.ts`: HEAD contra el árbol actual, semillas 1-10, 1920×1080, versiones alternadas y sin errores de consola en las 20 cargas. Son medianas:

| | Tope de alejar | Zoom máximo | Carga |
|---|---|---|---|
| Antes (HEAD) | 109 fps, 3,04 ms/fot. (p95 6,1) | 167,5 fps, 1,04 ms | 74,6 ms |
| Después | 98,5 fps, 3,65 ms/fot. (p95 6,6) | 161 fps, 1,15 ms | 83,7 ms |

- Al tope de alejar, el fotograma sube en 8 de las 10 semillas. La diferencia por semilla tiene una mediana de **+0,26 ms** (de −0,50 a +1,19).
- Los trozos (`drawImage` de 9 argumentos) cuestan 0,03-0,08 ms por fotograma, así que no explican la subida. Puede deberse a que hay más paredes (1 421 → 1 470) o al ruido de la máquina compartida.
- Todo queda muy por debajo de 16,7 ms. **No es bloqueante, pero tampoco puedo afirmar que «no empeora».**

## Hallazgos

### Importante

**H1. En una diagonal que baja por una escalera, la senda se mete bajo la pared de la cara de al lado.**
- Reproducción: `npx tsx docs/agents/2026-10-06-rampas-de-acantilado/qa-pintar.ts 5` (o `capturar.ts`) y la escena (3, 9,5) de la semilla 5. Está en `capturas-qa/adv-s5-x3-y9.png` y en `zoom-s5-x3-y9-pared-sobre-senda.png`.
- La senda baja junto a la cara y8 x3-3 y se corta en seco contra el borde vertical del bloque de pared de la izquierda: desaparece debajo.
- Datos (`qa-zona.ts 5 1 8 4.5 11`): la rampa de y8 x3 tiene el trazo `(3.17,9.00)→(3.00,9.13)` y el paso en x [2,70, 3,47]. Los trozos de pared de x [0,73-2,26, 2,70] y y 8,06-9,35… pisan la senda en (2,60, 9,41). Ese punto queda por encima del filo de la cara siguiente (y9 x2, filo en 10) y fuera de la banda de y8, así que no cuenta como rampa y ninguna pared se aparta.
- En las semillas 1-10 hay 47 paredes cuyo rectángulo pisa el centro de la senda a ≥ 0,2 de su borde, a ≤ 1 casilla de una rampa (17 de ellas por encima del filo): `PROF=0.2 qa-adversarial.ts`, columna B. Son unos 30 sitios, y no todos se ven, porque el rectángulo no es opaco entero. Confirmado a ojo en s5 (3, 9,5). En s9 (9,5, 23,5) va en la misma línea.
- Quien juega esperaba poder seguir el camino hasta el puente. Ve un camino que se acaba contra la roca.
- `paredesSobreRampa` da 0 aquí, porque solo mide la senda dentro de la banda de la cara de la rampa.

**H2. El paso de una rampa corta las paredes de una cara vecina que no tiene tajo, y deja rectángulos lisos nuevos.** Las paredes se filtran solo por altura (`colocar.ts:910`), así que el paso de la cara de al lado corta también las de una cara que se sigue pintando entera.
- (a) s5, cara y12 x5-9, x 9,72-10,03 (`zoom-s5-x10-y14-bloque.png`). Lo corta el paso de la rampa de y13 x10-16, cuyo trazo mide 0,02 casillas. Queda una placa lisa de cara de ~0,3 × 0,6 casillas con los cantos rectos, junto a la mina. Antes había pared (`adv-s5-x10-y14-antes-qa.png`).
- (b) s5, junto a la ciudad de (7,5, 4,85): queda una banda lisa de ~0,5 × 1,8 casillas en la cara y4 x6-7, de caída 3 (`adv-s5-x7-y5-antes-qa.png` y `vivo/vivo-s5-x7.5-y5.5.png`). La reserva de la ciudad ya la dejaba sin pared, pero antes la tapaban las paredes de arenisca de la cara de al lado, y el tajo de [8, 9,52] las ha quitado. A cambio, la senda que antes iba tapada ahora se ve.
- Recuento (`qa-cara-lisa.ts`, comparado con HEAD): 12,4 casillas de cara lisa nueva junto a rampas en 10 semillas, frente a 34,6 que se arreglan.

**H3. Escalones altos cortados en vertical: ranuras rectangulares de arriba abajo.**
- s9, bajo el castillo de (9,5, 23,85): `adv-s9-x9-y24-grande-qa.png` (antes en el scratchpad, `s9g-antes.png`) y `adv-s9-x9-y23-ingeniero-simplify.png`. La aprobada y la de /simplify salen igual.
- Son caras de caída 3, con módulos de pared de 2,2 casillas de alto. Se cortan en vertical por todo su alto, también la corona que asoma sobre el filo. El acantilado queda en bloques de cantos rectos con huecos entre ellos, y eso es exactamente «un hueco recortado».
- Lo agrava que 45 de las 110 rampas tienen menos de 0,25 casillas de senda dentro de la banda (`qa-rampas-cortas.ts`). Algunas tienen 0,00-0,02 (s2 y20 x28, s5 y13 x10-16, s10 y28 x20). Una senda que solo roza la esquina de una cara abre un tajo de ~0,5-0,8 y corta paredes altas de las caras vecinas. Hay 35 trozos de pared de ≥ 1,8 casillas de alto (de 0 a 10 por semilla).
- Esta escena no estaba entre las que vio el usuario. Él aprobó el tajo con caras de caída 1-2.

**H4. La escalera aprobada de s5 sale peor que la aprobada.**
- `zoom-s5-escalera-aprobada-simplify-qa.png`, de izquierda a derecha: la aprobada, la de /simplify y la de QA (las dos últimas son idénticas byte a byte).
- Abajo a la derecha de la senda, en la cara y5 x15,03-15,78, la aprobada tenía un bloque de pared. Ahora hay un pilar estrecho y ~0,75 casillas de cara lisa.
- El ingeniero ya lo apuntó (la caja de un módulo alto entra en el paso de la cara de arriba). Pero `hallazgos-simplify.md` pedía como innegociable que la escena saliera «igual o mejor».

### Menor

- **H5.** Una cara con dos rampas y una reserva entre ellas queda como una losa lisa exenta: s27, cara y25 x15-16, bajo la ciudad (`adv-s27-x15-16-y25-dos-rampas.png` contra `-antes.png`). El liso ya estaba por la reserva (backlog §6.3 del plan) y ahora es más estrecho. Además, la senda de la derecha, que antes iba tapada por el basalto, ahora se ve. Mejora neta, pero el recorte recto se nota más.
- **H6.** Con un mínimo de 0,1 dentro de la cara (`PROF=0.1`), una senda que baja asoma bajo la cara en 2,26 casillas en 10 semillas, todas en el canto, a ≤ 0,1 del borde. En s16 hay un caso de 0,1 casillas al pie de la cara y24 x6. Apenas se ve.

## Pasada adversarial (resumen)

- **Caras cortas** (rampas en caras de una casilla): 70 de 110. Son las de la escalera (H3, H4) y la diagonal de H1.
- **Rampas en el borde del mapa**: 6 caras en las semillas 1-10. En s23 (cara y0 x19-23, dos rampas, `adv-s23-x19-23-y0-borde.png`) la senda se ve y no hay pared encima.
- **Dos o más rampas en la misma cara**: ninguna en las semillas 1-10 (`RESTO_MINIMO` funde). En las semillas 11-40 hay 3: s23 y0 x19-23, **s23 y10 x8-13 con tres** y s27 y25 x15-16.
  - En s23 y10 (`adv-s23-x8-13-y10-tres-rampas.png`) las tres sendas bajan visibles entre bloques de pared. Los bordes son rectos, pero se lee.
  - s27 es H5.
- **Junto a una ciudad o una mina**: H2a (mina, s5), H2b (ciudad, s5), H3 (ciudad, s9) y H5 (ciudad, s27). Es el estado donde más falla.

## Workarounds usados

- **Las escenas se miran en el taller** (`capturar.ts` / `qa-pintar.ts`, el pintor real a 110 px sobre el mapa entero) y no en el juego. En el juego, el día 1 la niebla tapa casi todas las rampas, también en s9 (`vivo/vivo-s9-x9.5-y23.5.png` sale negra). No afecta a quien juega: verá lo mismo cuando explore, porque el taller usa la misma `componer` y el mismo `pintarSuelo`, y en s5 el juego y el taller coinciden (H2b).
- **En `qa-vivo.ts`, la cámara se mueve arrastrando**, con la cuenta de cámara del cliente. Algún arrastre se tomó como clic y dejó una ruta marcada. No afecta a la evidencia.

## No probado

- **`pnpm qa`**: no se toca ni `src/server/` ni el contrato.
- **`barrido-semillas.ts` y `enfrentamiento.ts`**: ni IA ni economía.
- **Las rampas de s9 en el juego**, más allá de la de la base: la niebla obliga a jugar días hasta descubrirlas. Visto en el taller.
- **Los fps en 4K**: no medidos.

## Veredicto

**No apto.**

El cambio mejora lo que había:
- la cara ya no tapa nunca una senda que baja;
- la cara lisa junto a las rampas baja un 35 %;
- los guardias, el banco, `verify` y `capturas` están en verde.

Pero falla lo que el encargo pedía comprobar de forma explícita:
- **«sin pared encima, también en las diagonales»**: H1. La senda se mete bajo la pared en las escaleras en diagonal, y el guardia que debería verlo da 0.
- **«sin rectángulo liso»**: H2 y H3. El propio corte crea placas lisas y ranuras rectangulares, sobre todo junto a ciudades y minas y en las caras altas.
- **La escalera de s5 sale peor que la aprobada** (H4), cuando se exigía «igual o mejor».

H1 y H3 piden decidir dos cosas:
- qué se hace con la senda fuera de la banda de su cara;
- qué se hace con las paredes altas de una cara vecina que no tiene tajo: encogerlas en vez de cortarlas, o abrirle también el tajo.

H3 conviene enseñárselo al usuario: él aprobó el tajo viendo caras de caída 1-2, no estas.

---

## Re-verificación (06-10-2026, tras la vuelta «sin cortes rectos»)

Árbol: `main` (857a849) con el diff de #150 sin commitear. QA no ha tocado ningún fichero rastreado: el `md5` de `git diff` es el mismo antes y después (`92f9bfde…`). «HEAD» es `git archive HEAD` en el scratchpad.

- Capturas: `capturas-reverif-qa/`. `par-*.png` lleva HEAD a la izquierda y el árbol de ahora a la derecha, a 110 px con el taller.
- Guiones nuevos, todos de solo lectura: `qa-reverif.ts`, `qa-reverif-pie.ts`, `qa-reverif-pedregal.ts` y `qa-reverif-capturar.ts`. Corren igual contra HEAD (`RAIZ=`) y contra el árbol de ahora, y no leen ni `rampas` ni `junto`: son independientes del guardia del ingeniero.

### Comprobaciones fijas

| Comprobación | | Evidencia |
|---|---|---|
| `pnpm verify` | ✅ | `Checked 216 files … No fixes applied`, `Test Files 55 passed`, `Tests 1827 passed`, exit 0 |
| `pnpm banco` | ✅ | `sha256 020ccc584552b1bae38d02cbc57879a488d5c39c08b20b51ab28eafc1ab27e36`, «ancla: igual», 0/200 sin terminar |
| `pnpm capturas` | ✅ | exit 0, «sin errores en consola; … 187.2 s», en `capturas-reverif-qa/pnpm-capturas/` |
| El juego en vivo, s5 y s9 | ✅ con límite | Vite propio en el 3241 (`set -m` en su línea, parado por su grupo, después «3241 libre»). `qa-vivo.ts`: `{"semilla":5,"escenario":"pintado","consola":[]}` y `{"semilla":9,…,"consola":[]}`, con el suelo pintado en 8,0 y 7,4 s. En s5 (`vivo/vivo-s5-x15-y4.png`) se ve lo mismo que en el taller: la senda baja visible junto a la ciudad, y la losa de la reserva lleva pedregal. En s9 el castillo de (9,5, 23,5) sigue bajo la niebla del día 1 (`vivo/vivo-s9-x9.5-y23.5.png`, negra), igual que en la primera vuelta. |
| Fps (`medir-fps.ts`, semillas 1-10, 1920×1080, alternadas, 0 errores en las 20 cargas) | ✅ | Al tope de alejar, de 3,005 a 3,125 ms por fotograma (mediana). Por semilla `[0,17 0,03 0,13 0,27 0,09 0,16 0,11 0,26 0,10 −0,12]`, con una mediana de **+0,12 ms** (en la primera vuelta, +0,26). Zoom máximo: de 0,94 a 0,98 ms. Carga: de 78,8 a 77,2 ms. Está dentro del ruido. |

### Hallazgos de la primera vuelta

| | Pedido (`hallazgos-qa.md`) | | Evidencia |
|---|---|---|---|
| H1 | 0 paredes sobre la senda cerca de una rampa, con la medida ampliada | ✅ | `PROF=0.2 qa-adversarial.ts`: `paredSobreSenda 0` en las semillas 1-10 y en las 11-40 (antes, 47). Con `PROF=0` y `PROF=0.1`, también 0. La medida independiente (`qa-reverif.ts`: paredes cuya caja pisa la senda a ≤ 1,5 de cualquier senda que entra en una banda de cara, roces incluidos) baja de **188 en HEAD a 39**. Esas 39 las he mirado (s3 9,17,5 y 11,5,29,5; s8 20,5,19,5): son sendas que corren al pie o junto a una ciudad, sin bajar por ninguna cara, y salen igual en HEAD. Están fuera del alcance de #150. `capturas-reverif-qa/par-s5-x3-y9.5.png`: la senda baja hasta el puente sin meterse bajo ninguna pared. |
| — | 0 paredes con `recorte` | ✅ | `qa-reverif.ts` y `medir.ts`: `recortadas 0` (antes, 224). Además lo vigila el test de `taller-escenario`. |
| — | Cara lisa junto a las rampas no peor que HEAD | ✅ | `qa-cara-lisa.ts`: 170,25 en total (HEAD 201,25), y 25,80 junto a una rampa (HEAD 40,65). Esa medida no ve los roces, porque ya no son rampas. Con la medida independiente (cara lisa a media banda a ≤ 1,5 de **cualquier** senda que entra en una banda): **82,4 frente a 86,55** en HEAD. Empeora por semilla en s5 (de 10,25 a 15,05), s7 y s8. Ver N2. |
| — | `spritesSobreSenda` = 0, `basesSobreReserva` = 0 | ✅ | Informe del taller con las semillas 2, 3, 5, 6, 7, 8, 9, 10 y 27: `{"s":0,"p":0,"b":0,"errores":[]}` en todas. `medir.ts`: 0 y 0 en las semillas 1-10. |
| H2 | La cara vecina no se corta | ✅ | No hay cortes. Pero en s5, junto a la mina, quedan dos losas lisas rectangulares donde HEAD tenía pared (`par-s5-x10-y14.png`, `zoom-s5-x10-y14-ahora.png`): cara y12 en x ≈ 9,3-10 y cara y13 en x 10-10,6, la del roce. Junto a la ciudad (`par-s5-x7.5-y5.5.png`), la losa de la reserva de la cara y4 x6-7 mide ahora ~1,45 casillas de ancho, contra ~0,4 en HEAD (allí la tapaba la arenisca de la cara de al lado), y lleva pedregal en su mitad de abajo. A cambio, en los dos sitios se ve la senda, que en HEAD iba tapada. N2. |
| H3 | s9 bajo el castillo | ⚠️ aceptado | `par-s9-x9.5-y23.5.png`: no hay ranuras ni bloques recortados. Quedan caras altas lisas con pedregal, que el usuario ya conoce y van a un issue aparte. No lo cuento como bloqueante. |
| H4 | La escalera de s5, igual o mejor que la aprobada | ✅ | `par-s5-x15-y4-aprobada-ahora.png`. Abajo a la derecha, donde la aprobada tenía un pilar y una losa, ahora hay un bloque de pared entero. La izquierda conserva sus peldaños. Queda una tira lisa de ~0,25 casillas entre la senda y ese bloque (`zoom-s5-x15-y4-ahora.png`), más estrecha que la de la aprobada. |
| H5 | s27, la losa entre dos rampas | ✅ anotado | `par-s27-x15.5-y25.png`: la losa sigue, sin cortes y con pedregal al pie. Es la reserva de la ciudad. |
| H6 | Bordes de 0,1 en el canto | ✅ / anotado | No queda ningún borde de pared cortado. Senda que baja bajo la cara: `PROF=0` 26,86 casillas, `PROF=0.1` 7,98 y `PROF=0.2` **0,84**, en las semillas 1-10 (en las 11-40, 1,90 con 0,2). Son los roces de menos de 0,25 por cara, que no abren tajo por decisión del usuario. |

### Pasada adversarial sobre el mecanismo nuevo

**N1 (importante). `ponerPared` corre la pared en x pero conserva la y del pie de su sitio original, y en las escaleras la deja fuera de su acantilado.**
- La y viene de `pieEn(x)` en el sitio original, y en la escalera el pie está inclinado: baja una casilla por casilla de x. `cerca(s.x)` prueba hasta ±1 casilla (`DESVIOS`) sin recalcularla. Así, una pared que nació al fondo de la escalera y se corre hacia arriba queda hasta una casilla por debajo del pie de su cara, metida en el suelo de abajo o en el agua.
- Medida, `qa-reverif-pie.ts`, semillas 1-10. Repite `pieEn` y mide la distancia del ancla al pie más cercano. HEAD da 0 de 1 421 (el guion es fiel). Ahora, **39 de 1 470 a más de 0,25 casillas, y 14 a 0,5 o más**: s2, s3, s5, s7, s8 y s10. Peor caso: s8 (25,32, 20,29), a 0,99.
- Peor sitio a la vista: **s7 (9,1, 11,2)**, entre dos ciudades, junto a la senda (`zoom-par-s7-x9.1-y11.2.png`). La cara y9 x9 queda como una losa lisa con los cuatro cantos rectos, flotando sobre el río, y su fila de pared está corrida 0,6-0,9 casillas más abajo, de pie en el agua. En HEAD había pared encima de esa cara.
- Otros casos:
  - s5 (8,88, 14,47): el pilar exento en el agua junto a la mina (`zoom-s5-x10-y14-ahora.png`, a la izquierda).
  - s8 (25,32, 20,29): un pilar suelto en la orilla (`par-s8-x25.3-y19.8.png`).
  - s10 (17,99, 29,78): una pared de 2,1 de alto que se lee como un espolón (`zoom-par-s10-x18-y29.png`).
- Quien juega ve rocas de acantilado de pie en el río, separadas del acantilado, y una losa lisa donde estaban. Esperaba la pared sobre su cara o, si no cabe, la cara con su pedregal.
- Reproducción: `npx tsx docs/agents/2026-10-06-rampas-de-acantilado/qa-reverif-capturar.ts ahora 7:9.1:11.2:5:4`. Para la lista: `DETALLE=1 UMBRAL=0.45 npx tsx …/qa-reverif-pie.ts`.
- Ningún guardia lo ve: `paredesSobreRampa`, `basesSobreReserva` y `spritesSobreSenda` dan 0.

**N2 (importante, la misma familia que el issue de s9). Donde la pared se quita junto a la senda, queda una losa lisa rectangular.** No es un corte de pared. Es la cara desnuda, con su borde recto vertical, junto a la senda que ahora se ve.
- s5, la mina: dos losas.
- s5, la ciudad: una losa de 1,45 casillas.
- s7: la losa de N1.
- s6 (14, 12,5): una losa pequeña al final de una fila (`par-s6-x14-y12.5.png`).
- s27: H5.

En el conjunto no empeora: 82,4 frente a 86,55 a ≤ 1,5 de una senda que cruza una cara. Pero en s5 sube de 10,25 a 15,05. El pedregal no llega junto a la senda porque pasa por la misma puerta y se le aparta. Propongo meterlo en el issue de s9.

**N3 (menor). El pedregal.**
- `qa-reverif-pedregal.ts`, semillas 1-10: 596 peñascos de clase `pared`. **4 pisan una senda** que no está en `junto`:
  - s6 (5,37, 20,20), junto a una mina en arenisca: peñascos grises sobre suelo rojo (`par-s6-x5.4-y20.png`);
  - s10 (24,71, 6,74), en el paso de una muralla (`par-s10-x24.7-y6.7.png`);
  - s9 (12,19, 28,69).
- Al ser de clase `pared`, no pasan por el margen de `APARTE.roca`.
- 26 caen fuera de toda banda de cara. Siguen el pie inclinado de la escalera, como en N1, pero son bajos y apenas se notan.
- El gris de `rocas-caidas` desentona sobre la arenisca.

**`ENTORNO_DE_RAMPA` y `RAMPA_MINIMA`.**
- Con el entorno de 1,5, la medida de H1 da 0 en las semillas 1-40.
- Con el mínimo de 0,25, hay 65 rampas con tajo y 45 roces sin él. La senda de los roces queda bajo el canto: 0,84 casillas a 0,2 de profundidad, que se ven como una senda que entra un poco bajo la esquina de la cara. Es lo que decidió el usuario.
- La excepción «senda que tapa una cara sin tajo lejos de todo tajo» deja la pared encima de la senda en sitios como s3 (9, 17,5). Ahí la senda va al pie, y HEAD sale igual.

### Workarounds usados

- **Las escenas se miran en el taller** (`qa-reverif-capturar.ts`: el mismo `componer` y el mismo pintor, a 110 px), porque el día 1 la niebla las tapa en el juego. No afecta a quien juega: en s5, el juego y el taller coinciden.
- **En `qa-vivo.ts`, el arrastre a (15, 4) en s5 no centró la escena.** La captura enseña la de la ciudad (7,5, 5,5), que también vale. No afecta a quien juega.

### No probado

- **`pnpm qa`**: el cambio no toca ni el servidor ni el contrato.
- **Los fps en 4K.**
- **N1 en el juego.** s7 no se ha jugado hasta destapar (9, 11), solo se ha visto en el taller, que pinta lo mismo.

### Veredicto

**Apto con reservas.**

Lo que pedía `hallazgos-qa.md` se cumple con medidas propias:
- H1: 0 paredes sobre la senda junto a una rampa (188 → 39 con la medida independiente, y las 39 son sendas al pie que ya estaban así).
- 0 paredes con `recorte`.
- La cara lisa no empeora en el conjunto.
- `spritesSobreSenda` y `basesSobreReserva` dan 0.
- La escalera de s5 sale mejor que la aprobada.
- Los fps vuelven (+0,12 ms).
- `verify`, `banco` y `capturas` en verde, con la consola limpia.

Las reservas:
- **N1** es un defecto nuevo del mecanismo de correr la pared: la pared conserva el pie de su sitio original. Debería arreglarse antes de cerrar, o al menos entrar en el issue de s9 con `s7 (9,1, 11,2)` como caso. Es el sitio más visible que he encontrado, y si el usuario lo juzga como un «rectángulo liso», pasa a bloqueante.
- **N2** es la misma familia que lo que el usuario ya aceptó en s9.
- **N3** es menor.
