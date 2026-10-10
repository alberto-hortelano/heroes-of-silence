# Hallazgos de QA (vuelta 1), con la decisión tomada

Fuente: `qa.md` (apto con reservas). Sondas del QA en
`/tmp/claude-1000/-home-al-code-heroes-asalto/5e114b15-cb5a-435e-8f7a-94a12ce04234/scratchpad/probe/`.

## Se arregla

- **I1.** La ayuda del editor (`src/client/arena/paneles.ts:454`) y el
  `_comment` del borrador (`src/core/arena-murallas.ts:119`) describen la regla
  vieja. Reescribirlos con la nueva: el muro es alto; el defensor sube andando;
  el atacante, con escalera (un turno ponerla, otro subir) o sabiendo escalar; las
  voladoras se posan; la puerta solo la cruza el defensor; en el suelo no se
  dispara a través. Buscar otros textos con la regla vieja (`grep` de «no se
  posan», «cierra el paso»…).
- **I2.** `escalaBlocker` mira el primer muro de `murosAlPie` y no el que
  importa: con la escalera en 6,3→7,2 y 7,2 ocupada, dice «No hay escalera puesta
  ahí y no sabe escalar.» en vez de «En ese muro está Escudero». El motivo
  agregado debe ser el más informativo: si algún muro al pie tiene escalera (o
  la unidad escala), el de ese muro. Test con el caso de la semilla 21.
- **M1.** «Lleva escalera» no se ofrece (o sale deshabilitada con su motivo, que
  escribe el núcleo) en unidades de dos casillas o voladoras, en vez de
  descartarla en silencio.
- **M3.** Regla: **subir y poner la escalera cierran el turno sin turno extra de
  moral** («al subir se quedan arriba y no pueden atacar ni hacer nada más ese
  turno»). Solo afecta a esas dos acciones (sin muralla nada cambia). Test que lo
  muerda con moral +3.
- **M5.** Los botones de escala no salen en el panel del defensor (nunca puede
  usarlos).
- **M2 (parte).** La escalera se ve: más grande y pintada encima de la columna a
  la que va, no tapada por ella. El solape de rótulos de figuras en columnas
  vecinas, al backlog.

## Se deja (backlog)

- M2, solape de cuerpos y rótulos en columnas vecinas.
- M4, IA del atacante a veces pasiva o que baja dentro y vuelve a subir.
- Espectador con muralla (ninguna batalla del juego la tiene todavía).

## Presupuesto de pruebas (regla del usuario)

Iterando, solo `pnpm vitest run test/<fichero>.test.ts`. `pnpm verify` una vez
por tanda. `pnpm banco` y `pnpm qa` una vez al cerrar; `verify:lento` una vez al
cerrar (si solo falla por timeouts con todo verde, repetirlo una vez, no en
bucle). Fuzz en cientos (~200 batallas). Nada de barridos en paralelo.
