# Calidad

Lo que dice cómo se comprueba el juego y por qué está como está. Lo amplía la fase Doc de la
reorganización de la arquitectura con el detalle de «Control de calidad» de `CLAUDE.md`.

## Las semillas de `pnpm capturas`

Sale del comentario de `DESTINO` en `tools/qa/capturas.ts` (hoy `tools/qa/capturas/pagina.ts`),
donde vivió hasta H5 de la reorganización (08-11-2026); el texto va tal cual, primero el bloque y
después la nota de debajo. Hoy ninguna pasada escribe su semilla: la busca en el espejo.

Las semillas cambiaron todas con el mapa de 28 y los asaltantes (ciclo «el
camino cuesta»): con un grupo en cada región sin dueño, la guardia que se
alcanza hoy SIN pisar la región de un grupo que embosque es rara —3 de las 60
primeras semillas—, y cada pasada necesita una. Se buscaron con el espejo,
como `guardiaALaVista`: la 282 tiene una a tres casillas y, además, una ruta
de dos días a la vista (`rutaDoradaYGris`), que de las candidatas solo tenían
cuatro.

Se volvieron a probar las de siempre (2, 29 y 4) cuando la IA dejó de entrar
en emboscadas: no cambia nada, porque lo que las descarta es la ruta de la
PERSONA, no la de la IA. En las tres, la única guardia a la que se llega hoy
está detrás de una región que embosca al héroe de salida.

**Y otra vez con los mapas densos (03-10-2026)**: fronteras gruesas,
obstáculos que bloquean y el lado de 34 se llevaron las cinco. Se buscaron con
el espejo, igual que entonces, en las 300 primeras: la 238 tiene una guardia a
tres pasos y una ruta de dos días a la vista; la 21 pierde la suya; en la 208
la guardia deja veterano y al día siguiente hay otra; y la 3 tiene una ruta a
(11,0) que pisa, a la vista, la región de un grupo que embosca. El móvil
comparte la 238: en las 300 primeras ninguna guardia alcanzable cae a dos
casillas del héroe, y la de la 238 está a (1,3).

**Y una vez más con la vuelta de simplify (03-10-2026)**: el vestido del mapa
consume el `rng` de otra manera y cambió el mapa de todas. Buscadas con el
espejo en las 1 500 primeras —y hasta la 4 000 para los veteranos— y
probadas cada una con su pasada: la 993 tiene una ruta de dos días a la vista
y, tras entrar al castillo, una guardia a (4,−1); la 534 pierde la suya; en la
1 454 la guardia deja veterano y la del día siguiente cae a (6,1); la 3 sigue
dando emboscada, ahora con la ruta a (11,5); y el móvil pasa a la 810, con la
guardia a (0,2) del castillo. Es la búsqueda que el issue de las semillas de
capturas propone automatizar.

**Y con la vuelta 1 de QA (03-10-2026)**: los caminos en árbol y la frontera
forzada movieron otra vez el mapa y el camino de todas. Prefiltradas con el
espejo (una `Session` por semilla, sin navegador) y probadas cada una con su
pasada: la 50 tiene la ruta de dos días y la guardia tras el castillo; la 97
pierde la suya; en la 2 199 —de las 5 000 primeras solo seis dejaban veterano
con otra guardia al día siguiente, y solo esta cae dentro del marco— la
guardia está a seis pasos y la del día 2 a ocho; la 3 da la emboscada con la
ruta a (8,8); y el móvil sigue en la 810.

**Con «menos caminos» (06-10-2026)** la emboscada y los veteranos se
quedaron sin escena, y dejaron de fijarse a mano: las buscan sus pasadas
(`buscarEmboscada`, `buscarVeteranos`), y con ellas la que pierde
(`buscarDerrota`). Las que siguieron aquí (la 50 y la 810) aguantaron ese
cambio, y cayeron con el siguiente: las entradas de nodo en eje (#161) le
quitaron a la 50 su ruta de dos días y a la 810 su guardia a la vista (QA de
#161, H1). Desde entonces las buscan también sus pasadas, cada una con lo que
de verdad necesita: `buscarEscritorio`, `buscarMovil` (móvil y táctil, con la
caja del móvil medida en una página) y `buscarSinArte`.

**Y con #131 (08-10-2026) no queda ninguna escrita**: la del espectador (la 50
del servidor con el plan 7 de la política) la busca `semillaDelEspectador`
jugando su partida en el proceso, y la de la arena (la 6), `buscarArena` con
la pauta de la pasada. Las guardias ya no se buscan «a la vista desde el
héroe» alejando la vista a ojo: `guardiaALaVista` lleva la cámara hasta la
que toca arrastrando el mapa (`Mapa.mirar`). La semilla 1 con que se mide el
lienzo no es una escena: la caja no depende de la partida (`abrir` lo exige).

Las semillas de la emboscada avisada, de los veteranos y de la batalla que se
pierde ya no se escriben aquí: las buscan sus pasadas en el espejo
(`capturas/escenas.ts`). Eran la 3 con destino (8,8), la 2 199 y la 97;
«menos caminos» (06-10-2026) rompió las dos primeras a la vez, como cada
cambio del generador antes, y la 97 había caído ya dos veces.
