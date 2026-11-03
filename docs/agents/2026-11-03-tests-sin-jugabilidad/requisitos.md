# Fuera los tests de jugabilidad y los que fijan cifras del catálogo

## Petición literal

> «Analiza bien esos tests y elimina todo lo que sea jugabilidad. No podemos tener tests de una jugabilidad
> que no esta acabada. No nos puede frenar a la hora de modificar el sistema los tests de algo que no queremos
> mantener como esta»

Contexto (03-11-2026): al retocar el usuario el catálogo a mano («equipo y unidades», `0f715185`) se rompieron
61 tests; 57 se actualizaron a las cifras nuevas (`5697941f`) y quedaban 4 rojos que no eran «cifras»: la Lanza
corta a 0 de oro, el techo de los asaltantes (dos, ya arreglados en `a07d8945` recalibrando a 310) y el reparto
de velocidades del catálogo («17 de 34 unidades andan 3 casillas»).

Pregunta del coordinador y respuesta del usuario: además de la jugabilidad pura (equilibrio, calibraciones como
el techo de asaltantes, el reparto de velocidades, qué hace la IA, frecuencias y duraciones), ¿qué hacer con los
tests de reglas que fijan cifras del catálogo real? → **«Borrar también esos»: todo test que dependa de una cifra
del catálogo real se elimina.**

Ya estaba escrito en CLAUDE.md (23-10-2026, decisión del usuario): «No se prueba la jugabilidad… El equilibrio, la
duración de las partidas, … qué decide la IA y si una facción gana más no son hallazgos ni criterios de
aceptación».

## Qué se borra

Un test (un `it`, o un `describe` entero si todo él lo es) se borra si cumple **cualquiera** de estas:

1. **Jugabilidad**: equilibrio, calibración de cifras contra el juego (el techo de los asaltantes frente a la
   fuerza de un héroe, el margen contra neutrales, que la economía alcance), el reparto de velocidades o niveles
   del catálogo, lo que decide o consigue la IA (que gane, que compre lo mejor, que no se emboscada «casi
   nunca», que licencie, cuántas batallas o rondas, quién gana), frecuencias, duraciones y medidas.
2. **Depende de una cifra del catálogo real**: su resultado cambia si se edita `data/unidades.json` o
   `data/equipo.json` (o los demás datos de cifras del juego: economía, liderazgo, experiencia, poder, carga,
   rueda, asaltantes, ciudades, poderes, hechizos…) dejándolos **válidos**. Fijar el índice o el nivel de una
   unidad del catálogo, el daño de la Espada, el nombre de una unidad, una semilla escogida porque con el
   catálogo de hoy pasa algo, el ancla de un volcado de paneles con cifras, etc.

## Qué se queda

- Las **reglas** probadas con datos de prueba propios del test (unidades, piezas o cuerpos construidos en el
  test), o con lo esperado **derivado** de los datos (no escrito a mano), que no se rompen al editar datos
  válidos.
- La **validación** de los datos (que un catálogo roto se rechace con su frase), los guardias de
  `invariantes.test.ts`, el contrato del agente, la serialización y su inversa, el mapa y su generación (no son
  catálogo de cifras), el cliente, el taller y el arte.
- Un test que mezcla una regla y una cifra del catálogo: **se borra** (decisión del usuario: «borrar también
  esos»); si la regla que cubría se queda sin ningún otro test, se dice en el informe (no se reescribe en esta
  tarea salvo que sea trivial).

## Criterios de aceptación

1. Ningún test que quede se rompe al editar el catálogo de forma válida. Se comprueba **por experimento**:
   varias perturbaciones válidas de los datos (p. ej. fuerza y PV de todas las unidades ×2, otros nombres, otros
   precios, otra agilidad, otras cifras de las piezas, otro techo de asaltantes), cada una con la suite por
   tandas; todo test que se ponga rojo con una perturbación válida y no lo estuviera antes, se borra (o se
   explica por qué no).
2. Ningún test de jugabilidad (la lista de arriba) queda.
3. `pnpm typecheck` y `pnpm lint` en verde; ayudas de test que se quedan sin uso, fuera.
4. CLAUDE.md y los comentarios del código que citan un test borrado (p. ej. `TABLA_DEL_CATALOGO`,
   `test/nivel.test.ts`) se corrigen.
5. Informe: cada test borrado con su motivo (1 jugabilidad / 2 cifra del catálogo), y las reglas que quedan sin
   test.

## Fuera de alcance

- `pnpm banco` (ancla de volcado) y `tools/qa/*`: son herramientas, no tests; se dejan. Se dice en el informe que
  el banco se reancla con cada cambio de datos.
- Reescribir tests con datos de prueba (salvo trivial).
- Cambiar datos o código de producción.
