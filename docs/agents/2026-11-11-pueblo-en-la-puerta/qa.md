# QA — pueblo-en-la-puerta (#305)

Código validado: worktree del ingeniero `agent-a5c578828d7aa140f`, commit `d931fbe2` (sobre `d791d03c`). Mandan los criterios de «Tras la crítica» y «Tras el plan» de `requisitos.md`. No toqué su código: los guiones y las mutaciones van en el scratchpad (`gen-hash.mts`, `borde.mts`, `varios.mts`, `s12.mts` y una copia `mut/` del árbol con `node_modules` enlazado).

No repetí lo que el ingeniero ya dejó en verde sobre el mismo commit: typecheck, lint, los siete ficheros de test del plan, `agent-contract`, `documentacion`, `mundo validar ejemplo|prueba`, `pnpm banco` (ancla igual), el barrido, las exportaciones y `pnpm qa` (`implementacion.md`, «Verificación ejecutada»). No hay nada que mirar en el navegador: el cambio no se ve en el cliente.

## Criterios

| Criterio | Veredicto | Evidencia |
|---|---|---|
| 1a. `validateMapPlan` rechaza un pueblo de región, un monstruo o un cofre a ≤ `HASTA_LOS_ACCESOS` de una ciudad | ✅ | Pasada adversarial (`borde.mts`, semillas 1-40 del procedimental, 263 ciudades: 80 del muro, 183 de región y 2 con agua a dos casillas). Probé cada casilla libre y pisable del anillo a 2, con las cuatro esquinas diagonales y las del borde del mapa. Las tres clases van rotando. Hay **3451** casos con exactamente un motivo, el de los accesos. Otros 19 los para antes una regla previa (un pueblo que parte su región o deja zona sin región); ninguno pasa. |
| 1b. A 3 casillas vale | ✅ | En la misma pasada, **4025** casos a 3 casillas: 0 con el motivo de los accesos (`r3malN: 0`). Los que no dan `[]` los para una regla previa ajena a esta (un pueblo que parte su región). |
| 1c. La pregunta del 5 × 5 vive en un sitio y la leen el plan y el vestido | ✅ | `parteDeLaEntrada` (`recinto.ts`). La leen `problemasDeRecintos`, `puebloDelMuroBlocker`, `enAlgunRecinto` y `marcarElRecinto`. Desaparecen la constante privada de `validar.ts` y los `±2`/`≤ 1` del vestido (diff). |
| 1d. El borde de `puebloDelMuroBlocker` sigue siendo solo del pueblo del muro | ✅ | En la pasada, un pueblo de región a 2 casillas en la columna 0 (s18 (0,5), s25 (0,15)) no recibe el motivo del borde. Un pueblo sobre barrera a 2 casillas recibe el suyo («en su recinto o en un acceso… un nodo no puede ir ahí»), el del borde o uno previo, y **nunca** además el de los accesos (`muroMalN: 0` en 628 casos): no sale duplicado. |
| 1e. Dentro del 3 × 3, el motivo de siempre y no el nuevo | ✅ | 1595 casos a 1 casilla con «cae dentro del recinto» y sin el de los accesos (es un `else if`). Los 17 restantes los para una regla previa. |
| 2a. El motivo habla de la entrada, no de «un nodo» | ✅ | «el cofre de (7,2) está a 2 casillas de la ciudad "Valdeluz" (town-0, en (5,4)), en el anillo de los accesos de sus puertas: es la entrada de la ciudad, por donde su región llega a ella, y ahí no va nada; ponlo a 3 casillas o más de toda ciudad, contando la diagonal como una». Dice qué objeto, dónde y de qué ciudad, por qué no, y cómo arreglarlo. |
| 2b. La prosa del agente lo dice con la constante | ✅ | `formato.ts` (`map_generate`) y `peticion-de-mapa.ts` interpolan `${HASTA_LOS_ACCESOS}` (diff). El test de la prosa lo comprueba. |
| 3a. Un test por clase en un acceso que se rechaza, y a 3 que vale | ✅ | `recinto-nucleo.test.ts`, «en los accesos de una ciudad…»: (7,5), (7,6) y (7,2) contra (8,5), (8,6) y (8,2). Dos de las tres casillas son esquinas diagonales. |
| 3b. Visto morder | ✅ | Lo repetí en una copia del árbol (`mut/`). Quitar `'chest'` de la regla deja «expected [] to deeply equal [ Array(1) ]» en `recinto-nucleo.test.ts:341` (1 fallo de 19). Con `HASTA_LOS_ACCESOS + 1` en `parteDeLaEntrada` fallan 6 tests: también muerde el error por uno. |
| 3c. Pasan los tests de plan que ya existían y `mundo validar` | ✅ (citado) | `implementacion.md`: 5 ficheros, 114 en verde; «ejemplo» y «prueba» valen. En la copia mutada, los otros 18 tests de `recinto-nucleo` siguen verdes. |
| 4. El generador no cambia | ✅ | Además del banco del ingeniero (20 partidas), comparé `generateMapPlan` entero (con `vestirRed`) entre `d791d03c` y `d931fbe2`: sha256 del plan en las semillas 1-100 al lado por defecto y en las 1-15 a 26, 40 y 64. **145 de 145 iguales.** Y el generador viejo no deja nunca un pueblo, un monstruo ni un cofre a ≤ 2 de una ciudad (0 en los 145), así que el chequeo final del vestido, ahora más estricto, no puede tirar ningún vestido que antes valiera. |
| Varios a la vez | ✅ | Un pueblo y un cofre en la entrada de Valdeluz, y un monstruo y un cofre en la de Torreblanca: 4 motivos, uno por objeto y con su ciudad (`varios.mts`). |

## Hallazgos

Ninguno bloqueante ni importante.

- **Menor (redacción).** «y ahí no va nada» exagera un poco: en el acceso sí va el camino (es justo por donde se entra), y también un lugar de un mundo, que queda fuera de la regla. El contexto («es la entrada de la ciudad, por donde su región llega a ella») lo aclara, y el agente no debería sacar de ahí que no puede trazar el camino. Una alternativa sería «ahí no va ni pueblo, ni monstruo, ni cofre». No bloquea.
- **Menor (cobertura).** Ningún test caza que el vestido vuelva a escribir su 5 × 5 a mano: el guardia de `invariantes-partida` solo vigila que la constante no se declare otra vez. Una regresión así la cazaría el banco si cambiara algo, y si no, nadie. Lo mismo para un «2» tecleado en la prosa, que el ingeniero ya declara en «Qué no queda cubierto».
- **Fuera de alcance (no es de esta tarea, ya pasaba en `d791d03c`).** Con la semilla 12, un pueblo de región en (9,7), a 2 de la base `town-0`, se rechaza con «la ciudad "town-0" es la base del jugador 0 y está dentro de la región "region-4"…». El agente pone un pueblo y le responden sobre la base. En la base sale el mismo motivo (`s12.mts`). Del mismo estilo: los motivos de `problemasDeLosPueblos` nombran el pueblo por su id («el pueblo "village-8"») y no por el nombre que le dio el agente. Si el coordinador lo ve útil, es material para un issue.

## Workarounds usados

- Para comparar el generador de antes y el de ahora, extraje `d791d03c` (`git archive` de `src`, `data` y la configuración) al scratchpad, con `node_modules` enlazado. Es solo para medir y no afecta a quien juega.
- Para ver morder las mutaciones, una copia de `d931fbe2` en el scratchpad. El worktree del ingeniero no se tocó.

## No probado

- `lugar` y asaltantes en un acceso: fuera de alcance por los requisitos.
- Las ciudades-puente son pocas en la muestra (2 con agua a dos casillas en 40 semillas). La regla no las trata aparte, y el puente es agua, donde no cabe ningún objeto.
- No repetí `pnpm qa`, `banco`, `mundo validar` ni `exportaciones`: se citan del ingeniero, mismo commit.

## Veredicto

**Apto.** Los dos menores son de redacción y de cobertura, y no piden otra vuelta.
