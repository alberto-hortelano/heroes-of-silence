# Hallazgos de QA (vuelta 1) — qué se arregla

Fuente: `qa.md`, en esta misma carpeta. Decisiones del coordinador y del usuario, 09-10-2026.

## Se arreglan

- **H1: el final de una pelea en que muere un héroe.** Hoy dice «Sin vencedor en 100 rondas: por tiempo» aunque sea la ronda 1.
  - Receta: `/arena/?seed=11`, un piquero y un héroe por defecto en cada lado, todo en IA, y Luchar.
  - Dónde: `finalDeArena` en `src/core/arena.ts`.
  - Arreglo: el final dice quién ganó y por qué, con la misma regla del motor que la batalla del juego.
  - Test: uno que reproduzca la receta.
- **H3: el guardia de las reglas no muerde con `batallaDeArena`.** Con `batallaDeArena` y reglas a mano metido en `director.ts`, el guardia seguía en verde.
  - Arreglo: el guardia vigila **toda** puerta que deja elegir reglas, `batallaDeArena` incluida (o la puerta se estrecha para que solo la arena del cliente pueda pasar reglas).
  - Hay que verlo morder: metido en `director.ts` y en `state/game.ts`, en rojo; quitado, en verde.
- **H4: `?reglas` repetido.** `?reglas=tirador&reglas=bendicion` se queda en silencio con la primera. Se rechaza diciéndolo, como el resto de reglas raras, o se aceptan las dos. Elige lo coherente con `parseSeed` y fail-loud, y que la página lo diga.
- **H5: «1 rondas».** La ficha del héroe concuerda en número (1 ronda, 2 rondas). `implementacion.md` dice que la línea era anterior; corrígelo allí.
- **H6, decisión del usuario: «Sí, en esta tarea».** La URL reproduce la pelea entera, no solo la semilla y las reglas. Abrirla monta la misma pelea:
  - las unidades de cada bando, del catálogo o del borrador;
  - las cifras de prueba sobre el catálogo y las del borrador sin guardar que se usan;
  - el héroe de cada lado, con su figura, sus cuatro cifras y su libro;
  - Yo o IA por unidad;
  - la semilla y las reglas.

  Requisitos:
  - Un enlace de pelea mal formado o con unidades que no existen se rechaza diciéndolo, sin montar a medias.
  - Si el montaje no cabe con comodidad en la URL, un botón «Copiar enlace de la pelea» que la genere; abrirla monta y se queda en el montaje, sin luchar sola.
  - El formato se valida en `core` (`arena.ts`), con un test de ida y vuelta.
  - `pnpm capturas` lo ejercita: monta, copia el enlace, lo abre en otra página y comprueba que el parte de las dos peleas es idéntico.

## No se toca

- **H2: el Rayo de Poder 1 mata al héroe en la ronda 1.** Decisión del usuario: «Como ahora, la magia está provisional». El libro por defecto sigue siendo el completo.

## Sin probar en la vuelta 1, que se cubra ahora

- `pnpm verify:lento` entero.
- La previsión de un hechizo en la batalla del juego, no solo en la arena.
