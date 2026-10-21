# Hallazgos de QA (vuelta 1), con la decisión tomada (20-10-2026)

Detalle y capturas en `qa.md` y `qa/`. El usuario elige arreglar los tres primeros antes de seguir.

## Se arregla

- **H1. El aro de la elegida, bajo los pies.** Hoy `pintarAroDeFigura` centra la elipse en
  `c.suelo` (el píxel opaco más bajo: la suela del pie adelantado) y medio aro cae por delante; y se
  pinta antes que la sombra, al revés de lo que dice `pintarSombraDeFigura`. → El aro centrado en el
  punto de apoyo de la figura (el centro del pie, como el de la batalla: mira cómo lo hace la
  casilla resaltada / el aro de quien actúa en `render/batalla.ts` y usa la misma regla si la hay,
  no una nueva) y en el orden que dice el comentario. Que lo vigile un test o la pasada `tropa` (el
  centro del aro a menos de X del centro de los pies de su figura), visto morder.
- **H2. Equipar a un novato se lo pone al que pulsaste.** Hoy `equip` con `creature` viste al
  primer novato de ese tipo y la elegida salta al otro extremo del arco. → El núcleo nombra al
  individuo: la acción `equip` admite el puesto en la tropa (el `Portador` `{ indice }` de
  `hero/equipo.ts` ya existe; `destinoDeEquipo`/`pedidoDeEquipo` como su inversa) y la escena lo
  usa; el contrato del agente no cambia (sigue con `veteran`/`creature`, que se traducen al puesto).
  Si un `unequip` del novato recién vestido lo necesita, igual. La elegida no salta. El banco no debe
  cambiar (la IA sigue pidiendo por tipo); si cambia, se explica la forma del diff.
- **H3. El panel de la tropa abre arriba.** Hoy hereda el desplazamiento del panel del mapa
  (`#lateral`, 608 → 217) y la lista de a quién elegir queda fuera de la vista. → Al abrir la escena
  el lateral vuelve arriba; al volver al mapa, el panel del mapa como estaba si es barato, si no
  arriba también.
- **H4 (menor, núcleo). El motivo no pide lo imposible.** Un arma a dos manos sobre quien lleva un
  escudo **de serie** dice «quita antes el escudo», que no se puede. → `manosBlocker` /
  `equipoDelPortadorBlocker` dicen otra cosa cuando el escudo es de serie (p. ej. «no admite un arma
  a dos manos: su escudo es de serie»); `REGLA_DEL_ESCUDO` sigue siendo la regla.
- **H6 (menor). Doble clic en «Poner».** El segundo clic escribe un error en la barra («no lleva
  Gambesón en la mochila»). → El botón no lanza dos veces la misma jugada (se apaga hasta repintar,
  o la sesión ignora la repetida diciendo nada), sin tocar el fail-loud del núcleo.

## Se deja (dicho al usuario)

- H5 (marcadores sin arte que se tapan), H7 (hueco bajo la escena en escritorio), H8 (en el móvil la
  ficha queda bajo la lista): backlog.
