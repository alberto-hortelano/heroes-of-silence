# Hallazgos de QA, vuelta 1 (decididos por el coordinador)

De `qa.md` (veredicto: Hallazgos). Lo jugable cumple; esto es lo que se arregla.

## Se arreglan

- **H1 (bloqueante): `pnpm capturas` sale 1 en «arranque, con el dedo».** El guion, no el juego:
  `bajarHasta` (`tools/qa/capturas.ts` ~1606) desliza desde y = 560, que a 375×667 cae sobre
  `#statusbar` (554-667) y no desplaza nada; lo que se desplaza es `#stage`. Deslizar sobre la franja
  visible del panel (o lo que desplace `#stage` de verdad). Si H2 cambia la disposición, el guion se
  adapta a ella.
- **H2 (experiencia, móvil): a 375×667 quien toca un candidato no ve que pase nada**: el panel asoma
  45 px con el título cortado y la ficha y «Contratar» quedan debajo. Arreglo mínimo: al elegir un
  candidato con el dedo (o en una pantalla donde la ficha no se ve), llevar la ficha con «Contratar»
  a la vista (desplazar `#stage`/el panel). No rehacer la disposición del móvil. Si el mismo arreglo
  sirve tal cual a la morada sin riesgo, vale; si no, solo el ayuntamiento.
- **H3 (textos con el héroe pendiente).** En la base, «Sin héroe dentro, lo que reclutes se queda de
  guarnición.» no vale cuando no se puede reclutar; en el mapa, «Contrata uno en tu castillo.» debe
  decir que hay que elegir el de salida; «Fin de turno» debe salir apagado con el motivo (la compuerta
  `bloqueoDeTurno()` ya lo sabe: que el botón lo lea, como lo demás).
- **H4 (navegación con el héroe pendiente).** Andar hasta el ayuntamiento abre «Ampliar» y no la
  elección; entrar en la base desde la lista de castillos del mapa abre la base y no el ayuntamiento.
  Con el héroe pendiente, los dos llevan a la elección (lo mismo que `abrirSuBase`). Sin pendiente,
  como hoy.
- **H5 (visual, encuadre).** A 1440×900 el ayuntamiento sale cortado por arriba y la mitad de abajo del
  lienzo queda vacía; en el móvil el aro del primer candidato se corta por la izquierda. El encuadre
  del ayuntamiento debe enseñar el edificio entero (o casi: al menos sin cortar el tejado) con los
  candidatos delante y todos sus aros dentro. Es un exterior, no una sala abierta: puede encuadrar
  distinto que la morada (sin cambiar la morada). Mirar 1440×900, 1920×1080 y 375×667 en imágenes.

## No se arreglan aquí (backlog)

- **El nombre de salida es de la facción, no del tipo** («Grommash Dientenegro» para un chamán
  goblin): los nombres por tipo son trabajo de nombres/narrativa, fuera del alcance.
- **El contratado que recoge guarnición enseña «Movimiento 1837 / 1592»**: ya pasaba antes del cambio.
