# Hallazgos de QA que se arreglan (vuelta 1, 11-11-2026)

Del `qa.md` de esta carpeta, sobre `9329a743` (rama `worktree-agent-a632a1afa9707deec`). Decisión del coordinador:

- **H1 (se arregla).** A 760 px o menos el lateral queda debajo del mapa: tocar una línea de la crónica mueve la cámara pero el mapa está fuera de la pantalla (`#stage.scrollTop` 1197) y no se ve que pase nada. Semilla 5, orkos, 380×800. Arreglo: al pulsar la línea, si el lienzo del mapa no está a la vista, se lleva a la vista (`scrollIntoView` o equivalente, sin animación forzada) y luego se centra. La línea sigue siendo botón también en el móvil. Comprobarlo en el navegador a 380×800 (el mapa a la vista tras pulsar) y a 1920 (sin desplazamiento de la página).
- **H2 (se arregla).** En el móvil (≤ 760 px) cada línea-botón mide 18,6 px de alto, por debajo del mínimo táctil de 44 px que tienen los demás botones. Arreglo: en el móvil, la línea-botón alcanza el mínimo táctil de los demás botones (la misma regla o variable que ellos), sin cambiar el escritorio. `neutro.ts` y una captura a 380.

Fuera: «deja fuera 1» sin sustantivo (otro sitio de la crónica; si es de una línea, se puede arreglar aquí diciéndolo).
