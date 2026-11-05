# Hallazgos de QA, vuelta 1 (05-11-2026), decididos

QA dio «apto con reservas» (`qa.md`). Se arreglan los cuatro. Ninguno debe cambiar el juego: `pnpm banco` sigue en
`8e45709f…` (si se mueve, se para y se explica).

## H1 (importante). La ficha de una ciudad ocupada se contradice
Arriba dice que no da oro, ni recluta, ni construye, ni crecen sus moradas; debajo, «Ingresos 500 oro/día»,
«Construir hoy: disponible», «Crecimiento semanal +8», y la sección «Guarnición» enseña la tropa neutral ocupante como
si fuera la suya. Reproducir: `?seed=3&heroe=caballero`, tomar (17,7), (9,17), (21,21) y (22,17), abrir Torreblanca
desde «Castillos» (captura `capturas/qa-03-s3-ciudad-ocupada.png`).
**Decisión**: cada fila sale de la regla del núcleo, no de la cifra cruda: los ingresos, como la ciudad aislada
(«500 oro/día · sin cobrar: ocupada», o lo que ya diga `rentaDelDia` con su `ocupada`); «Construir hoy» con el motivo
de `ciudadQueMandaBlocker`; el crecimiento con su nota («no crece mientras esté ocupada»); y la guarnición ajena se
dice como ocupante («La ocupa: una guarnición neutral · …»), no como la guarnición propia. Que la frase y las cifras
salgan de un sitio: si hay un panel del espectador o de la base que pinte lo mismo, que lea lo mismo.

## H2 (menor). El pueblo del muro tomado
La crónica dice «Paso tomado en (8, 14)» y el pueblo no sale en «Pueblos» mientras no está unido a la base, así que no
se sabe por qué no da oro. Reproducir: `?seed=1&heroe=guerrero`, llevar el héroe a El Soto (captura
`capturas/qa-09-s1-el-soto-tomado.png`).
**Decisión**: la crónica nombra el sitio por lo que es («Pueblo tomado: El Soto», con `sitioDeLaCronica`/el nombre del
núcleo, también en el espectador sin sesión, que diga «pueblo» aunque no tenga el nombre); y «Pueblos» lista todo
pueblo propio, el no unido con su nota «sin cobrar: no está unido a tu base» (la misma forma que la ciudad aislada), y
el ocupado con la suya.

## H3 (menor). El contrato del agente con una ciudad ocupada
`towns[]` trae `occupied` con su frase, pero también `income: 500`, `canBuildNow` con 9 edificios y `recruitable` con
`available: 8`: todo se le rechazará.
**Decisión**: lo que se le ofrece sale de los mismos `*Blocker` que lo juzgan: `canBuildNow` filtrado por
`buildBlocker` (que ya lee `ciudadQueMandaBlocker`), lo reclutable con lo que `recruitBlocker`/la ocupación deje
(vacío u omitido con `occupied` diciéndolo; elige lo coherente con cómo se dice hoy una ciudad sin oro), y `income`
lo que da de verdad (0 ocupada, como `rentaDelDia`). Test en `test/agent-contract.test.ts`.

## H4 (menor). `validateMapPlan` acepta pueblos del muro que el generador evita
Un pueblo del muro en la fila 0 del mapa (o cualquier borde) y otro en el acceso norte de una base pasan la
validación; el generador los evita (desviaciones 3 y 6 de la fase 3).
**Decisión**: una sola regla en `problemasDeLosPueblos` (ni en el borde del mapa ni en un acceso del recinto de una
ciudad / a la distancia que ya evita el generador), con su frase para el agente, y que el generador use **la misma**
pregunta en vez de la suya. Test en `test/pueblos-en-un-nodo.test.ts` o `test/regiones.test.ts`. Si el guardia es
nuevo, romperlo a mano y verlo rojo.
