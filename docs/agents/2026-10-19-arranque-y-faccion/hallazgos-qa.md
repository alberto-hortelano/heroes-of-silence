# Hallazgos de QA (vuelta 1), con la decisión tomada

Detalle y capturas en `qa.md` y `qa/`.

## Se arregla

- **H1 (bloqueante, móvil).** A 375×812 y 375×667 «Volver» y «Empezar» de la elección quedan bajo
  la pantalla y no hay forma de llegar (ni rueda, ni End, ni deslizar): `html, body { overflow: hidden }`
  con `#inicio { min-height: 100dvh }` sin scroll propio. → `#inicio` con su propio desplazamiento
  (`height: 100dvh; overflow-y: auto`, o lo equivalente), y que la elección quepa o se desplace a
  375×667. Verifícalo deslizando de verdad (toques por CDP o rueda), no con `tap()` sobre el botón,
  que desplaza por programa. Que la pasada «arranque» de `pnpm capturas` lo vigile a ancho de móvil
  sin ese atajo, y velo morder con el CSS de antes.
- **H2 (menor).** Tras pulsar «Nuevo juego» con el ratón y sin moverlo, la elección se abre con el
  puntero sobre «No muertos» y se viste de no muertos aunque esté marcado «Templarios». → La vista
  previa del puntero solo cuenta tras un movimiento real del puntero desde que se abrió la elección
  (un `pointermove` cuyo punto cambió); hasta entonces el tema es el de la marcada. Lo mismo al volver
  del menú. Que lo vigile la pasada «arranque» (abrir con clic y ratón quieto → tema de la marcada),
  vista morder.

## No se arregla aquí (dicho al usuario)

- **H3**: cabeceras «LIBRO/TROPA DE ALDO DE VA…» cortadas en el panel de la base. Si ya pasaba en
  main, se deja; si lo trae el tema, se arregla con H1 (dilo en `implementacion-3.md`).
- Las faltas de los rasgos («Rapidos», «resuzitar») son literales del cuaderno: se corrigen en
  `NuevaJugabilidad.md` (fuera del repo) y se vuelve a extraer.
- «Atrás» del navegador desde la partida no vuelve al menú: el menú no se apila en el historial.
