# Hallazgos de QA — vuelta 1

El informe completo está en `qa.md`. Los 13 criterios se cumplen. Lo que sigue son los hallazgos de QA con la decisión del coordinador.

## Se arreglan

**H1 (importante). El selector «Ejército» se queda con el foco del teclado.**
- Mientras lo tiene, Espacio no pasa el turno.
- Una flecha o una letra («c», «n») cambia de ejército y descarta la partida, también después de abrirlo solo para mirar y cerrarlo con Escape.
- Para reproducirlo:
  1. Abrir `?seed=7`.
  2. Hacer clic en el selector, pulsar ↓ e Intro.
  3. Pulsar Espacio: el turno no pasa.
  4. Pulsar Escape y luego ↑: vuelve el caballero con otra partida.
- Decisión:
  - Al cambiar el valor, y también al cerrarse sin cambiarlo, el foco vuelve al lienzo (`#canvas`), igual que tras cualquier otro control de la barra. Si ya hay una forma común de devolver el foco, se usa esa.
  - Con el foco de vuelta, Espacio pasa el turno y las flechas no tocan el selector.
  - Se revisa si el selector «Tema» de la arena tiene el mismo problema. Ahí cambiar no destruye nada, pero el foco debe volver igual si la arena tiene atajos de teclado.
  - Si se puede, test que lo demuestre. Si no, prueba en Playwright con los mismos pasos.

**H2. Las letras de cada tema cambian las medidas.**
- La barra de arriba mide 34 px en templarios y 40 en no-muertos.
- En el panel de combate de no-muertos, «Rayo» queda fuera de la vista.
- Decisión:
  - La barra de arriba mide lo mismo en los seis temas: alto fijo o `line-height` común, no el de cada letra.
  - Probar a igualar el tamaño visual entre letras con `font-size-adjust` (por ejemplo, `font-size-adjust: from-font` o un valor común de altura x) en las fichas `--letra-*` o en `body`. El neutro no puede cambiar: el estilo calculado sin `data-tema` sigue igual que en HEAD.
  - En el combate, todos los hechizos se pueden alcanzar en todos los temas: el panel se desplaza como en el neutro o cabe.
  - Medir la barra y el panel de combate en los seis temas, a 1440×900 y a 390 px.

**H3. En orkos los botones y la edición se leen pequeños.**
- La causa es la letra estrecha de interfaz a 13 px.
- Decisión: otra letra de interfaz menos condensada, o un tamaño compensado (vale el mismo mecanismo de H2). Comprobarlo con una captura de la edición y de los botones de orkos.

**H4. Con `?seed=abc&faccion=xyz` solo se avisa de la semilla.**
- Decisión: se avisa de los dos problemas a la vez, cada uno con su salida.

**H5. El mensaje de error habla en ids.**
- Ahora dice «valen knight, necromancer», mientras el selector dice Caballero / Nigromante.
- Decisión: el mensaje para la persona da el valor que se escribe y su nombre, por ejemplo «valen knight (Caballero) y necromancer (Nigromante)», con los nombres de `nombreDeTipoDeHeroe`, sin escribirlos otra vez.
- Si `parseFaccion` vive en `core`, ahí no hay nombres para la persona: el cliente compone la frase o `core` recibe los nombres; decide y apúntalo.

**H7. En el móvil, el selector mide 19 px de alto.**
- Decisión: mínimo de 44 px a ≤ 760 px, como los demás botones de `#actions`, y lo mismo para el selector «Tema» de la arena (comparten regla).

## No se arregla

**H6. Tras cambiar de ejército, la barra de estado queda vacía.**
- Ya pasaba con «Partida nueva». Es un comportamiento anterior, fuera del alcance de esta tarea.

## Reglas para el ingeniero

- Sin `data-tema` el estilo calculado sigue igual que en HEAD. Repetir la comparación.
- Presupuesto:
  - `pnpm verify` una vez por tanda;
  - no hace falta `verify:lento` ni `banco` salvo que se toque el núcleo o el arte;
  - no correr `pnpm capturas`, que lo hace QA.
- Playwright sin pantalla. Rehacer y mirar las capturas afectadas.
- Procesos: PID y grupo. Nada de pkill.
- Sin commit.
