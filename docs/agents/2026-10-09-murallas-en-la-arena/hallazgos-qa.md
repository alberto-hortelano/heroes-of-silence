# Hallazgos de QA (vuelta 1), con la decisión tomada

Fuente: `qa.md` de esta carpeta (veredicto: apto con reservas). Reproductor del
fuzz: `npx tsx .cache/qa-muralla/fuzz.ts 1 300` (ignorado por git).

## Se arregla

- **M1 (C3, importante).** La cola de una unidad de dos hexes atraviesa muro (o
  puerta, siendo atacante) a mitad del recorrido: el camino se busca solo por la
  cabeza. Ejemplo: fuzz `1 300`, batalla 14, troll de (9,3) a (7,3) con la cola en
  el muro (8,3). C3 dice «ni lo atraviesa». Arreglo en el núcleo: con muralla, el
  recorrido de una unidad grande que camina comprueba también la cola en cada
  paso contra lo cerrado por la muralla para su bando (la misma regla
  `cerradaPara`), y `distanciaHasta`/la IA ven lo mismo que `movableFrom`.
  **Sin muralla nada cambia**: no se tocan las reglas de la cola frente a
  unidades (el banco debe dar el mismo hash). Un test que lo muerda (el caso del
  troll) y el fuzz de QA a 0 tramos.
- **M2.** Frases de rechazo: al volador que pulsa una puerta no se le dice «solo
  la cruza quien defiende» (sí la cruza; lo que no puede es posarse en ella si
  ataca: dígase eso); al grande cuya cola cae en la puerta o el muro, la frase
  nombra la cola. Las escribe el núcleo (`porQueNoCabe`).
- **M3.** Una forma repetida del borrador, anunciada como «se conserva tal cual»,
  se pierde al guardar otra. Que se conserve de verdad (como promete el aviso),
  y lo mismo en el borrador de unidades si comparte el defecto (`claveSinValidar`).
- **M4.** Borrador ilegible: «Guardar forma» deshabilitado lleva su motivo en
  `title`, y el motivo no desaparece de la barra al primer clic en la rejilla
  (que siga visible mientras el borrador no se pueda guardar).
- **M6.** Textos: plurales bien («9 muros · 0 puertas», «1 fila»).
- **M7.** A 1280×720 el editor deja bandos y ficha en ~250 px: el editor se puede
  plegar (o se compacta) para que el montaje siga usable. Si plegarlo, que
  recuerde el estado por `localStorage` (con try/catch).

## Se deja (backlog)

- **M5.** El cadáver de un grande que muere en su puerta se tiende sobre los muros
  de al lado: es cosmético y del pintor de bajas; va a issue.
- La IA cuerpo a cuerpo contra una «Línea recta» sin puerta acaba en la ronda 100:
  es lo esperado sin catapulta (fuera de alcance).
