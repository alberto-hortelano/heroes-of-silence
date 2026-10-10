# Hallazgos de QA: decididos

El veredicto de QA es «apto con reservas» (`qa.md`). Todos se arreglan en esta vuelta salvo los que se indican.

1. **H1: la plaza de 58 pasos se recorre a trozos.** Decisión del usuario: **lista de edificios**.
   - El panel general de la base lista los edificios construidos.
   - Al pulsar uno, la cámara va a él, quien camina aparece en su puerta y se abre su panel, igual que al llegar andando.
   - Se sigue pudiendo pasear.
   - Lleva su test de escena: pulsar en la lista → `abierto = sitio`, cámara y caminante en su puerta.
   - Se añade un paso a `capturas.ts`, o se usa la lista para llegar a los sitios lejanos en vez de `acercarseA`, si así queda más simple.
2. **H2: al volver a entrar se conserva el estado de antes.** Al abrir la base (en `openTown`, o cuando la escena detecta una apertura nueva), quien camina vuelve a la entrada y lo abierto se cierra. «Volver al mapa» cierra lo abierto. Va con test.
3. **H3: la comparación combate/base del criterio 11' es de la vuelta 2.**
   - Hay que regenerar `capturas/comparacion-combate-base-1440x900.png` y sus recortes ×4 con la versión actual: misma figura y misma pose, a 1440×900.
   - Hay que medir los dos altos.
4. **H4: la barra de estado de la base** dice «Haz clic en el mapa para mover a tu héroe…». Debe decir lo de la base, o nada.
5. **H5: en móvil, el cuadro de la conversación tapa a quien habla.** Se coloca en el lado contrario de quien habla, o arriba.
6. **H6: en móvil, al abrir la base desde la lista**, la página no sube y el lienzo queda medio tapado. Hay que llevar el lienzo a la vista al abrir.
7. **H7: en los extremos, la figura se corta contra el marco.** El recorte de lo que se pisa en x se mantiene a media figura del borde del escenario.
8. **H8: el panel del mercado enseña «(#14)».** Fuera la referencia interna; el texto, solo para quien juega.
9. **H9: «Construir» y «Todo (0)» parecen activos cuando no se puede.** Se pintan deshabilitados cuando hay `buildBlocker` o no queda nada que reclutar, con el motivo en `title`, como ya hace la armería.
10. **H10: sin arte, una banda oscura en el borde derecho del lienzo.** El marcador cubre el ancho entero.

**No se hace:** la disposición del nigromante en el navegador (no se alcanza sin estado sintético; la cubren los tests), el turno del rival con la base abierta, y las voces en el espectador (las cubre `pnpm qa`).
