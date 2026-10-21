# Solo oro: sin minas ni recursos (21-10-2026)

Rama `claude/game-tuning-start-a0b1d8`. Es la siguiente tanda de «afinar desde el arranque».

## Petición literal

> «Elimina las minas y el sistema de minerales, solo oro que sale de las ciudades y pueblos que se
> controlan, la base produce tambien oro»

## Decisiones del usuario (21-10-2026, preguntadas antes de empezar)

- **Los costes en otros recursos se pasan a oro** con un precio fijo inventado:
  - madera y mineral, 250 de oro cada unidad;
  - mercurio, azufre, cristal y gemas, 500 cada una.

  Por ejemplo, el castillo (5000 + 20 madera + 20 mineral) pasa a 15 000. La conversión se dice en
  el `_comment` del JSON.
- **Un pueblo da 250 de oro al día** a quien lo controla. Es una cifra inventada.
- **Un pueblo, como hoy la mina, cobra solo si su región es del jugador y está unida a su base**
  (la foto de `territorio`).
- **Los montones de recursos del mapa se quitan** (`MapObject.kind === 'resource'`). Del mapa, el
  oro suelto solo sale de los cofres.
- La base y las ciudades siguen cobrando por su ayuntamiento, como hoy (`dailyIncome`), si están
  unidas a la base. La base ya produce oro, y tiene que seguir haciéndolo.

## Criterios de aceptación

1. **No hay minas.**
   - Ningún `MapObject` de tipo `mine`.
   - Ni el generador procedimental ni el plan del agente ponen minas. Un plan del agente que traiga
     minas se rechaza diciéndolo, sin compatibilidad.
   - Sin `MINE_YIELD`, sin `minasDeLasRegiones`.
   - El escenógrafo no pinta minas, ni sus raíles ni su ramal.
2. **No hay más recurso que el oro**, en ningún sitio: núcleo, contrato del agente, cliente
   (barra, paneles, previsión de costes), espectador y crónica.
   - Madera, mercurio, mineral, azufre, cristal y gemas no existen en el código ni en `data/`.
   - Cómo se representa el oro (un número o un tipo de un solo recurso) lo decide el arquitecto,
     buscando lo más simple. Sin compatibilidad hacia atrás.
3. **Renta diaria** = el ayuntamiento de cada ciudad propia unida a la base, la base incluida, más
   250 por cada pueblo cuya región es del jugador y está unida a su base.
   - Un test lo comprueba cortando un nodo.
   - Lo que lee el agente y lo que ve el jugador dice cuánto da cada cosa.
4. **Costes en oro**: los de `data/buildings.json` y `data/economia.json` (`costeDeLaMorada`),
   convertidos con el precio de arriba. Nada más cuesta recursos.
5. **Sin montones de recursos** en el mapa: ni en el generador, ni en el plan del agente (se
   rechaza diciéndolo), ni en el render, ni en el contrato.
6. **La IA de reglas** deja de valorar minas y recursos, y valora los pueblos por su renta.
   - El barrido de semillas sale con 0 partidas sin terminar.
   - Se mide la duración en 1-100 y se compara con lo de antes (4 / 6 / 19, j0 46, del CLAUDE.md).
7. **El mapa sigue saliendo**: 0 sin mapa en las comprobaciones del generador, guardias del mapa
   en verde y `rectitud.ts` dentro de sus techos, o re-medida con su fila si cambia por quitar las
   minas.
   - Tests que solo vigilan minas (ramales, puertas de mina) se quitan o se reescriben para los
     pueblos.
   - El arte de las minas se queda en `assets/` si el build no lo copia. Si lo copia, se quita del
     build.
8. **El banco** cambia a propósito. Se re-ancla juzgando la forma del diff y se dice el primer
   hecho distinto.
9. `pnpm verify`, `verify:lento`, `pnpm qa` y `pnpm capturas` en verde al cerrar. `CLAUDE.md` y
   `docs/historia.md` dicen la regla nueva con su fecha, y lo que hablaba de minas se reescribe o
   se quita.

## Fuera de alcance

- El mercado (`marketplace`): ya no hace nada («no hay con quién comerciar») y se queda como
  está.
- Equilibrar las facciones o la economía más allá de las cifras de arriba.
- La narrativa (fase 2).
- Pedir arte nuevo.

## Contexto

- Hoy:
  - Cada región de fuera lleva una mina rara y una básica (`minasDeLasRegiones`), y la de casa
    oro, madera y mineral.
  - Cada región de fuera lleva un pueblo (`colocarPar(r, 'village')`). Hoy los pueblos no producen
    nada («lo que produce es de la fase 3»).
  - Las minas tienen dos puertas (#230) y mucha regla del generador gira alrededor de ellas.
- El generador ya coloca pueblos con `colocarPar`. Quitar las minas debería simplificarlo, no
  añadirle nada.
- **Máquina compartida**:
  - nada de `pkill`;
  - los tests caros, una vez al cerrar;
  - Playwright sin pantalla.
- Codex no hace falta: no se pide arte.

## Preguntas abiertas (con la suposición por defecto)

- **¿Se queda alguna regla del generador que existía solo por las minas?** Por defecto, se quita
  con ellas: la mina con dos puertas, los ramales y sus guardias.
- **¿Algo más que las minas da sentido a tomar una región?** Por defecto, el pueblo (250) y el
  paso hacia las ciudades. El usuario lo juzgará jugando.

## Correcciones tras el plan (21-10-2026)

- **Oro de salida: 27 500** (`oroDeSalida` en `data/economia.json`). Es el monedero de hoy
  (7 500 de oro, 20 de madera, 20 de mineral y 5 de cada raro) convertido al mismo precio: así el
  castillo sigue cabiendo el día 1.
- El plan se aprueba como está. No se compensa la renta que se pierde con la mina de oro de casa:
  se mide.

## Cómo se prueba (21-10-2026, el usuario, a mitad de implementación)

> «No hagas tests que comprueben la jugabilidad, la estamos cambiando. Analiza que mira un test antes
> de ejecutarlo, que no se convierta en una rutina porque estamos gastando mas tiempo en ejecutar
> tests que en implementar y en la mayoria de los casos no aportan nada»

Esto deja sin efecto los criterios de arriba que piden tests o medidas de jugabilidad:
- el test de la renta cortando un nodo (3);
- el barrido y la duración en 1-100 (6);
- juzgar la forma del diff del banco (8), que solo se re-ancla.

Lo que sí se comprueba:
- los guardias que impiden que el código mienta, como «no queda más recurso que el oro»;
- el contrato que rechaza `mines` y `resources`;
- `pnpm verify`, al final de cada tanda;
- `pnpm qa`, porque el contrato cambia;
- en el navegador, que se ve y se juega.

Las demás órdenes caras se corren solo si el cambio toca lo que vigilan, y diciendo por qué.
