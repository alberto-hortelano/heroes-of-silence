# Los temas como las láminas — requisitos

Continúa a `docs/agents/2026-10-13-tema-por-ejercito/` (cinco temas, `temas.css`, `temas.ts`, `?faccion=`, selector de la arena). Esa tarea está terminada y validada por QA, pero **sin commit** en este mismo worktree: se construye encima.

## Petición literal

> Haz que los temas sean como los diseños de assets/art/temas

## Las láminas

`assets/art/temas/{templarios,no-muertos,imperio,elfos,orkos}.png`, a 1315×1196. Son maquetas de la pantalla de la partida (la misma partida, semilla 42644) con la interfaz de hoy vestida con el tema. El usuario las dejó en la copia principal y se copiaron a este worktree, comprobadas por sha256. Se commitean tal cual en PNG, como el resto de `assets/art/`.

Lo que se ve en cada una:

- **templarios**
  - Marco de piedra gótica con tracería; esquinas y remates con cruz paté roja.
  - Encima del mapa, un escudo y la cinta roja «IN HOC · SIGNO VINCES».
  - Panel lateral de **pergamino claro con tinta oscura**: barras de sección con cruz roja, botones de madera oscura y un «Fin de turno» rojo con cruz.
  - Sello de lacre rojo en la barra de abajo.
  - En los márgenes, estatuas de caballero, estandartes blancos con cruz roja y velas.
- **no-muertos**
  - Hierro negro con calaveras, telarañas y velas de llama verde-cian.
  - Cinta de runas cian sobre el mapa.
  - Panel oscuro verdoso, con tinta hueso y acentos cian.
  - Un segador junto al héroe, estandartes morados con cruz invertida y «Fin de turno» con brillo verde.
- **imperio**
  - Columnas de mármol con capitel dorado y un águila dorada sobre el mapa.
  - Cartela «VIRTUS · DISCIPLINA · AETERNA VICTORIA» y colgaduras moradas.
  - Panel oscuro, con barras de sección rematadas en oro, una laurea y una brújula.
  - En los márgenes, «SPQR / IMPERIUM OMNIA VINCIT», grifos dorados y antorchas.
- **elfos**
  - Plata clara con hiedra, filigrana y cristales cian, con una luna y una ciudad élfica en la barra de arriba.
  - Panel de **pergamino claro** con barras de sección verde azulado y hojas, y botones redondeados verde azulado.
  - En los márgenes, una elfa con báculo de cristal.
- **orkos**
  - Hierro remachado, colmillos, cráneo con cuernos sobre el mapa y cadenas.
  - Estandartes rojos de la Horda y el rótulo «HEROES SILENCE» en letra rota roja.
  - Panel oscuro con tinta clara, títulos rojos y barras de sección con goterones de sangre.

## Decisiones del usuario (13-10-2026, en la conversación; no se reabren)

1. **Fidelidad**: paleta, letra y forma de los paneles copiadas de las láminas, **más marcos y adornos en imagen**: bordes 9-slice, esquinas, remate del mapa y cartelas. Se generan como **piezas sueltas**, no recortadas de las láminas: están a 1315 px y llevan contenido.
2. **Generador**: **Codex** (`codex exec`, suscripción; ver `tools/taller/codex.ts` y la cola del taller). La cuota vuelve el **14-10-2026 a las 5:29**. Hoy se deja hecho todo lo que no es generar: CSS, fuentes, la ranura de cada pieza con su respaldo en CSS y **los encargos de las piezas escritos y listos para lanzar**. Mañana se generan, sin fal.ai.
3. **Figuras de los márgenes** (estatuas, velas, estandartes, la elfa, los grifos…): **solo cuando sobra ancho**. Nunca le quitan espacio al mapa, y en pantallas estrechas y en el móvil no salen.
4. **Fuentes**: se revoca «solo fuentes del sistema» para títulos y rótulos. Una fuente **OFL** por tema, descargada de `github.com/google/fonts` (el usuario dio permiso), en woff2 dentro de `assets/fuentes/` y con su licencia al lado. El texto corrido sigue con las del sistema. Candidatas: Cinzel, IM Fell English, Pirata One, Uncial Antiqua y Marcellus, u otras OFL que se parezcan más a la lámina.
5. **Iconos de contenido** (los de equipo, los retratos de tropa y héroes y los de los hechizos): **fuera**, son otra tarea.

## Criterios de aceptación

### Hoy

1. Cada tema lleva la **paleta medida de su lámina**, no inventada: fondo, panel, tinta, títulos, acentos, botones y botón primario. En templarios y elfos el panel lateral es pergamino claro con tinta oscura, y el contraste de texto sobre panel y de botones es ≥ 4,5, como ya vigila `temas.test.ts`.
2. **La forma de los paneles se parece a la lámina**:
   - las barras de sección («HECHIZOS», «EQUIPO»…) con su forma y su adorno de CSS mientras no haya pieza;
   - los botones con su forma (redondeados en elfos, cuadrados en los demás);
   - «Fin de turno» destacado como en la lámina;
   - el marco del mapa grueso y con el color del material.
3. **Fuentes**:
   - títulos y rótulos de cada tema con su fuente OFL, servida desde `assets/fuentes/` (nada de CDN en tiempo de ejecución) y con su `OFL.txt`;
   - `font-display` que no bloquee el primer pintado;
   - el canvas usa la del título cuando la fuente ya ha cargado y, mientras tanto, su respaldo.
4. **Ranuras de piezas**:
   - cada pieza tiene un sitio en el CSS: el marco del mapa (9-slice con `border-image`), el remate y la cartela sobre el mapa, las esquinas del panel, el marco del minimapa, el sello y las figuras de los márgenes;
   - sin la imagen, el tema se ve completo con su respaldo de CSS, sin huecos ni errores en consola («el juego se juega sin arte»);
   - las piezas que falten no rompen `vite build` ni `pnpm capturas`.
5. **Encargos escritos para Codex**, uno por pieza y por tema, con:
   - su prompt;
   - la lámina como referencia de estilo;
   - su tamaño y sus cortes de 9-slice;
   - si va con fondo transparente;
   - dónde cae el fichero y cómo se recorta.

   Tienen que estar listos para lanzarse mañana con una sola orden, documentada, y con la forma de la cola del taller si encaja. No se gasta nada: hoy no se lanza ni uno.
6. **Márgenes**: hay una ranura para las figuras de los márgenes que solo aparece a partir de un ancho, que se decide y se documenta. Por debajo de ese ancho, el mapa mide lo mismo que hoy; se comprueba midiendo a 1440 y a 390 px.
7. **Sin `data-tema` no cambia nada** (el espectador): mismo estilo computado que HEAD, y lo que vigilaba la tarea anterior sigue en verde.
8. `pnpm verify` en verde; `pnpm capturas` y `pnpm verify:lento` al cerrar (se toca `assets/`).

### Mañana (con Codex)

9. Se generan las piezas, se recortan y se colocan. Cada tema, a 1440×900 y en pantalla ancha, se compara lado a lado con su lámina, y QA juzga el parecido.

## Fuera de alcance

- Iconos de equipo, retratos de tropa y de héroe, e iconos de hechizo.
- El contenido de las láminas que no es tema: el terreno, el minimapa en sí y lo que dice cada panel.
- fal.ai.
- El espectador, que sigue en neutro.
- Rehacer la maquetación: el mapa y el panel siguen donde están. Las figuras de los márgenes solo ocupan ancho sobrante.

## Contexto que solo tiene el coordinador

- **La máquina es compartida.** Rige el presupuesto de pruebas de `CLAUDE.md`, y nada de `pkill`.
- **El cliente sirve `assets/` como `publicDir`.** `vite build` copia `assets/` filtrando lo que solo lee el taller (`seCopiaAlBuild`, `tools/build/publico.ts`): las láminas y las fuentes de las piezas no deben ir al build; las piezas finales y las fuentes woff2, sí.
- **Codex:**
  - el binario es `/usr/lib/chatgpt/resources/codex` y se lanza con `codex exec --skip-git-repo-check -s read-only --json` con `</dev/null`;
  - el PNG cae en `~/.codex/generated_images/<thread_id>/`;
  - con fondo transparente deja halo, así que hay que recortar en post-proceso (`tools/gen/cutout.ts`);
  - `codex exec resume <thread_id>` sirve para correcciones;
  - en el taller ya hay `codex.ts`, `cola.ts`, `encargo.ts` y `trabajador.ts` (`pnpm taller trabajar`).
- **Restricciones de `html.ts`:**
  - rechaza huecos dentro de `style=`;
  - el tema va por CSS y `data-tema`;
  - las imágenes del CSS van por `url()` en la hoja, con rutas relativas al `publicDir`, nunca absolutas de la máquina (`invariantes.test.ts:127`).

## Preguntas abiertas (con su suposición por defecto)

- **El ancho a partir del cual salen las figuras de los márgenes.** Lo decide el arquitecto midiendo el tamaño del mapa: por defecto, cuando el viewport pasa de 1600 px.
- **Las cartelas con lema** («IN HOC SIGNO VINCES», «SPQR»…). Van como **texto en la fuente del tema sobre una pieza de cartela vacía**, no pintadas en la imagen: así se leen nítidas y se pueden cambiar.
- **Si la arena lleva los mismos marcos.** Sí: los paneles comparten fichas. Las figuras de los márgenes, solo en la partida.

## Decisiones del usuario sobre el plan (13-10-2026, punto de control)

1. **Márgenes**: las figuras salen desde **1820 px** de ancho de ventana. El mapa no baja nunca de lo que mide a 1600 px (1254 px).
2. **Remate y cartela**: **sobre el borde de arriba del mapa**, como en las láminas. Tapan unos 32 px del centro.
3. **Fuentes de título**:

   | Tema | Fuente |
   |---|---|
   | templarios | Cinzel |
   | imperio | Marcellus |
   | no-muertos | IM Fell English SC |
   | elfos | **Almendra** |
   | orkos | **Germania One** |

4. **Lema de los no-muertos**: «MEMENTO MORI». Elfos y orkos van sin cartela, como en sus láminas.

## Decisión del coordinador

- **Formato de las fuentes**: se sirven los **.ttf tal cual** desde `assets/fuentes/`, sin codificador woff2 propio. Chromium y Firefox las cargan sin conversión y pesan entre 50 y 300 KB. Un codificador hecho a mano no compensa ese ahorro por el riesgo que añade (el plan ya lo apuntaba: transformación nula rechazada). Donde los criterios dicen «woff2», léase «ttf».
- **Se descarga** de `raw.githubusercontent.com/google/fonts` en un commit fijo, que es el repositorio que permitió el usuario. Cada familia va con su `OFL.txt` al lado.
- **El ciclo va en dos tandas** de ingeniero, en este orden:
  - **A**: paleta, forma, fuentes y `tools/qa/neutro.ts`.
  - **B**: ranuras, `piezas-de-tema.css` generado, figuras de margen y encargos de Codex.

  QA entra al final de las dos.
