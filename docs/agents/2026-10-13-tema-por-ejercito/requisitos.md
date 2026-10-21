# Un tema de UI por ejército — requisitos

## Petición literal

> crea un tema para el juego para cada ejercito que afecte a los elementos de UI

## Decisiones del usuario (13-10-2026, en la conversación; no se reabren)

Se le preguntó y eligió en las cuatro preguntas la opción recomendada:

1. **Ejércitos**: los cinco, con las ids de la arena: `templarios`, `no-muertos`, `imperio`, `elfos`, `orkos` (`FACCIONES_DE_ARENA`). El caballero del juego toma el de templarios y el nigromante el de no-muertos (`FACCION_DE_LA_ARENA`).
2. **Qué decide el tema**: en la partida, la facción de quien juega. Se añade `?faccion=knight|necromancer` para poder jugar con el nigromante; eso cambia la partida, no solo el aspecto. En la arena decide un selector de tema.
3. **Alcance**: todo el CSS (barras, paneles, botones, marcos, crónica, diálogos) y lo que es interfaz dentro del canvas: chapas, fondo de la barra de vida, rótulos de la base, recuadro del minimapa y fuentes del canvas. Quedan fuera el terreno, las figuras, `playerColor` y `COLOR_BANDO`.
4. **Fuentes**: solo las del sistema; no se descarga nada.

El usuario aprobó el plan de diseño, que está en `plan.md` de esta misma carpeta (copiado del plan aprobado). Por eso no se pasó por el crítico ni por el arquitecto: la tarea la acaba de describir el usuario y el diseño ya tiene su visto bueno.

## Criterios de aceptación

1. Hay cinco temas, uno por cada id de `FACCIONES_DE_ARENA`. Cada uno tiene su paleta, su letra (fuentes del sistema) y su estilo de marco, y se distinguen a simple vista.
2. Sin tema puesto (sin `data-tema`), la página se ve como hoy. El espectador sigue así.
3. Con `pnpm dev` y `?seed=7`, la partida sale con el tema `templarios`.
4. Con `?seed=7&faccion=necromancer`, el jugador 0 (la persona) es nigromante: su ciudad, su héroe y su tropa de salida son nigromantes, y la partida sale con el tema `no-muertos`.
5. Con `?faccion=xyz`, la partida no arranca y dice por qué, igual que con una semilla mala. `?faccion=` vacío cuenta como no haber pedido ninguna.
6. En la barra de la partida hay un selector «Ejército». Cambiarlo recarga la partida con la misma semilla y la facción elegida, y la barra de direcciones lo refleja.
7. En la arena hay un selector de tema. Se recuerda entre recargas (`localStorage`, que puede fallar sin romper la página) y cambia a la vez los paneles (montaje, edición, editor de equipo) y lo que es interfaz en el canvas del combate.
8. Dentro del canvas cambian con el tema:
   - en el mapa, el fondo, el borde, la tinta y la fuente de las chapas;
   - en la batalla, el fondo de la barra de vida, la chapa del nombre, los galones y las fuentes;
   - los rótulos de las puertas de la base;
   - el recuadro de la vista en el minimapa.

   Los colores de jugador y bando, los verdes, amarillos y rojos de la vida, los aros de selección, el terreno y las figuras no cambian.
9. En `style.css` y `arena.css` no queda ningún color fijo fuera de las fichas (`:root` y bloques de tema), salvo una lista con su motivo. Lo vigila un guardia.
10. Cada tema define exactamente las mismas fichas que el `:root` neutro. El contraste de la tinta sobre el panel y de la tinta del botón sobre el botón es ≥ 4,5 en los seis (neutro y cinco temas). Lo vigila un test.
11. Solo `temas.ts` escribe `dataset.tema`. Lo vigila `invariantes.test.ts`.
12. Sin `?faccion=`, la partida es la de siempre: `pnpm banco` da el mismo hash.
13. `pnpm verify` en verde; `pnpm verify:lento` y `pnpm capturas`, en verde al cerrar.

## Fuera de alcance

- Fuentes descargadas o incluidas en el repo.
- Arte nuevo de UI: marcos en imagen, iconos, emblemas, y cualquier cosa de fal.ai o Codex.
- Cambiar `playerColor`, `COLOR_BANDO`, el terreno o el tinte de las figuras.
- Que el agente o el servidor elijan facción, y el hot-seat.
- Tema en el espectador: se queda en el neutro.
- Rehacer la maquetación: solo cambian el aspecto y la letra, no las medidas. La regla literal que exige `test/base-escala.test.ts:41` no se toca.

## Contexto

- Hoy el `:root` de `style.css` tiene 10 variables, y hay unos 60 colores hexadecimales fijos en `style.css` y `arena.css` (inventario en `plan.md`).
- `html.ts` rechaza huecos dentro de `style=`, así que el tema va por CSS y `data-tema`, no por estilos en línea.
- `setAttribute` está vetado fuera de `html.ts` y `render/assets.ts`; `dataset` sí se permite.
- `Session.viewer` es siempre 0. Hoy la facción de cada jugador sale del primer castillo que tiene en el plan; `generate` ya admite `opts.factions`.
- La máquina es compartida: cumplir el presupuesto de pruebas de `CLAUDE.md` y no matar procesos por nombre.

## Preguntas abiertas (con su suposición por defecto)

- **Tema por defecto en la arena**: `templarios`.
- **Nombres del selector «Ejército»**: los del tipo de héroe (Caballero / Nigromante, `nombreDeTipoDeHeroe`). Si no encaja, los de la facción de la arena (Templarios / No muertos).
- **Partida ya empezada**: cambiar el ejército la descarta y empieza otra con la misma semilla. No se pide confirmación, igual que al cambiar la semilla a mano.
