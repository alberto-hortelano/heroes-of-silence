# Hallazgos de QA (vuelta 1) — decididos por el coordinador, 05-11-2026

Veredicto de QA: apto con reservas (`qa.md`). Se arreglan H1 y H2; H3 es el riesgo ya aceptado por
el usuario en I10 y no se toca (va al backlog).

## H1 — se arregla. El héroe en una barrera pegada a un recinto se pinta encima de la muralla

Reproducción y capturas en `qa.md` (H1) y `capturas/qa/zoom-06-dentro-dia2.png`,
`zoom-07-dentro-dia3.png`: s8, goblin parado en (6,5) o (7,5), montaña al norte del recinto de
Valdeluz; la figura sube por delante de las torres y el aro cae sobre los tejados.

Causa: la subida en una barrera (`delanteDeLasPiezas` con el filtro de barrera,
`Escenario.enUnaBarrera`) sube la figura por delante de **toda** pieza que la tape, también las que
tienen el pie más al sur que ella (las torres y tramos del recinto, una casa, un objeto), que la
tapan con razón porque están delante.

Lo que se pide: en una casilla de barrera, la figura sube solo por delante de lo que **cuelga de su
fila o de más al norte** (la masa de su casilla y de las de atrás: picos, árboles, paredes), como la
regla de `delanteDeLasParedes` (`Sprite.filaAlta`/el pie); lo que tiene el pie al sur de la figura
(el recinto, objetos, lo de delante) sigue pintándose delante. Test en `test/figuras.test.ts` que lo
muerda (un volumen del sur que la tapa no la sube; uno de su fila, sí), y captura de s8 con el
goblin en (7,5) que lo enseñe (mírala). Que el goblin parado en el bosque de las capturas del
ingeniero se siga viendo.

## H2 — se arregla. La marcha que se para en el borde de una barrera no dice por qué

1. La frase de `moveHero` con `hoy === 0` se lee contradictoria («No quedan puntos de movimiento para
   dar ni un paso: … y te quedan 1436»). Que diga lo que pasa sin contradecirse, p. ej. «hoy no da ni
   un paso: el primero, a (x,y), cuesta 1616 (el día entero de marcha) y le quedan 1436». Ajustar los
   tests que la fijan.
2. La vista previa de la ruta (la barra con «hoy llegas a k de n pasos») dice, cuando el corte de hoy
   es porque el paso siguiente es una barrera, que esa casilla cuesta el día entero y se entra
   mañana (p. ej. «… la montaña de (6,5) cuesta el día entero: se entra mañana»). La cuenta es del
   núcleo (`pasosDeHoy`, `barreraEn`); el cliente solo la pinta, por `Session`.

## H3 — no se toca

El rodeo sale más barato que una barrera cercana (I10, riesgo aceptado). Al backlog con lo demás.

# Hallazgos de QA (vuelta 2) — decididos por el coordinador, 05-11-2026

Veredicto de QA: apto con reservas (`qa.md`, «Vuelta 2»). El usuario pidió una vuelta más. Se
arreglan N1 y N2; los dos son solo de cómo se pinta (ni reglas ni banco). H2 queda cerrado: no tocar.

## N1 — se arregla. En una barrera al norte de un recinto, un pueblo o un nodo, la figura se pinta encima de él

Reproducción: s8, goblin parado en (6,5) (`capturas/qa2/a3-en-6-5-de-cerca.png`): pies y aro sobre la
torre del noroeste del recinto de Valdeluz. Lo que se espera es lo de (7,5) (`a5-en-7-5-de-cerca.png`):
la figura en la ladera, detrás de la muralla.

Causa (QA): no es la regla nueva sino `claveDeFigura` con `esc.cubiertas`, que sube la figura a la
clave de todo objeto horneado cuya imagen cubre el centro de su casilla, aunque su pie esté al sur. En
lo que se pisa es a propósito («la ciudad tapaba al héroe que nace en la casilla de encima») y **no se
toca**. `pisada` toma el máximo de las dos claves, así que `delanteEnUnaBarrera` no puede corregirlo.

Lo que se pide:
1. **En una casilla de barrera** (la que lee `Escenario.enUnaBarrera`), la clave de la figura no sube
   por `cubiertas` por delante de lo hecho (`esAlgoHecho`: recinto, objeto, puesto) con el pie al sur
   del de la figura. La regla de H1 entera: en una barrera, lo hecho del sur se pinta delante. Que siga
   costando solo en casillas de barrera pisadas, y que lo que se pisa no cambie (mismo resultado en
   todos los tests de figuras y escenas que ya había).
2. **`filaDeLaPieza` mira el pie, no `Math.floor(s.y)`**, si eso es lo que deja subir la figura por
   encima de algo hecho de su misma fila con el pie más al sur (12 casillas en s1-40, 6 nodos y 6
   pueblos). Si el ingeniero ve que `s.y` ya es el pie y la causa es otra, que lo diga y arregle la causa.
3. **El test muerde de verdad**: en s8 (6,5) y (7,5), no basta con `> 0`; que exija que ninguna parte
   de la caja de la figura quede pintada encima de una pieza hecha con el pie al sur del suyo (o un
   tope pequeño y declarado, si la silueta lo obliga), y verlo rojo con el código de ahora antes de
   arreglarlo. Una medida en s1-40 como la de la sonda de QA (`capturas/qa2/qa2-sonda.test.ts.txt`):
   casillas de barrera con ≥ 20 % de la figura encima de algo hecho del sur, que baje de 169 / 165 / 51
   (recinto / pueblo / nodo) a 0 o lo más cerca y diga qué queda y por qué.
4. Que no vuelva H1 por el otro lado: el goblin en (6,5) y (7,5) se ve (cabeza y torso, no tapado
   entero por la torre), y en las barreras sueltas (s10 (3,10), (4,7)) sigue leyéndose. Capturas de s8
   (6,5) y (7,5) de cerca, miradas.

## N2 — se arregla. Las obras de un puesto que no se pintan cuentan como tope

`delanteEnUnaBarrera` recorre todos los volúmenes, también las tres obras de cada nodo, que se pintan
o no según `seVeConSuNodo`; las que no se ven hacen de tope y la masa de delante deja de subir la
figura (s24 (15,8), s36 (8,22), s39 (23,9), s10 (3,10) en s1-40).

Lo que se pide: que la pregunta mire **solo lo que se pinta**. Preferido: las obras (`Sprite.deNodo`)
cuentan solo si `seVeConSuNodo` con lo que se sabe de su nodo, y la caché por casilla
(`Escenario.enUnaBarrera`) no da una respuesta vieja cuando el nodo cambia de dueño o de obra (en la
clave, o sin cachear las casillas que tocan una obra: lo más simple que sea correcto). Si eso pide
meter estado de la partida en el escenario de forma fea, alternativa aceptable: las obras no cuentan
nunca como tope (ni suben ni paran), midiendo en s1-40 en cuántas casillas la figura queda entonces
pintada encima de una obra visible, y diciéndolo. Test que muerda con un caso de esos cuatro.

## Para los dos

- Tests por partes y con su porqué (`figuras`, `escenas`, `infiltracion` si se toca); nada de
  `pnpm verify`. Banco: no debería moverse (es cliente); citar que no se tocó el núcleo o pasarlo.
- Documentar en `implementacion.md`, sección «Vuelta de QA 2», y actualizar la fila de CLAUDE.md
  («La infiltración», lo de `delanteEnUnaBarrera`) si cambia lo que dice.
