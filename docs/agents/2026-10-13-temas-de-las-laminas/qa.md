# Los temas como las láminas: QA de la parte de hoy

QA, 13-10-2026, sobre el árbol sin commit del worktree (HEAD `a22ac46` más el diff de las tandas A, B y «Tras /simplify»). Los criterios son el 1-8 de `requisitos.md`; el 9, el de las piezas de Codex, es de mañana. No se arregló nada y no se lanzó ningún encargo a Codex.

## Veredicto: **Hallazgos** (apto con reservas)

Ningún hallazgo bloquea. Los ocho criterios de hoy se cumplen al pie de la letra, y la paleta, la letra y la forma de los paneles recuerdan a cada lámina. Queda uno importante, el **H1**, que choca con la lámina y que las piezas de mañana no van a tapar: en cuatro temas el fondo del escenario (los canales de las figuras y el hueco alrededor del mapa) es un color de material plano y claro, mientras que la lámina es oscura. En el imperio a 1920 se ve beis. Es justo lo que vio el coordinador.

## Cómo se probó

- **`pnpm verify`**, una vez, salida 0 en 55 s:
  - `Test Files 129 passed | 1 skipped (130)`
  - `Tests 3106 passed | 14 skipped (3120)`
- **`pnpm capturas`**, una vez, salida 0 en 383 s, con «sin errores en consola». Los 65 PNG quedaron en el scratchpad; juega con el caballero, así que el tema es templarios. Miré la base, la batalla, el final de la partida y el mapa sin arte.
- **`verify:lento`** no se repitió. Lo cita `implementacion.md` («Tras /simplify»: 4957 passed, salida 0), y desde entonces no ha cambiado nada.
- **Navegador**: Playwright sin pantalla, con vite propio (`arrancarVite`, puerto del sistema y su grupo, muerto al final). Los guiones están en `.cache/qa-temas/`, que es ignorado: `mirar.mts` y `adv.mts`.
  - Templarios y no muertos se abren por el **flujo real**: `/?seed=42644&faccion=knight` y `&faccion=necromancer`.
  - Imperio, elfos y orkos no tienen facción en el juego. Se abren con **el mismo mecanismo que el ingeniero**: `import('/temas.ts')` y `ponerTema(t)` + `letrasListas()` desde la página, sobre la partida del caballero. En la arena, con su **selector «Tema»**, eligiendo la opción.
- **Procesos**:
  - `vite preview` en el 4791, arrancado con `set -m` en su línea, `$!` comprobado como grupo y matado por grupo. `ss` dice «4791 libre».
  - Los vite de los guiones, en su grupo.
  - Al final no queda escuchando ningún `node` mío; el 3100, el 3150 y el 3636 no se tocaron.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Paleta medida de la lámina; pergamino con tinta oscura en templarios y elfos; contraste ≥ 4,5 | ✅ | `paleta-de-las-laminas.test.ts` verde dentro de `verify`. **Contraste medido en vivo** (cada nodo de texto de `#topbar`, `#lateral`, `#statusbar` y `#herramientas` contra su fondo compuesto, a 1440, 1920 y 390): **ninguno < 4,5** en los cinco temas. Los mínimos son orkos 4,50 (`.eyebrow` y los `h3`, 11-12 px), elfos 4,77 (filas verde azulado), no muertos 6,21, imperio 6,76 y templarios 7,28; con el aviso «Aún puede andar hoy…» visible, templarios baja a 5,83. En la arena, el mínimo es orkos 4,57 (la marca «ARENA»). Pergamino: el `#lateral` de templarios es `#e1cdb2` con tinta `#251c15`, y el de elfos `#ede8dc` con `#2f414a` (`templarios-1440`, `lado-elfos-1440.png`). |
| 2a | Barras de sección con su forma y su adorno de CSS | ✅ | ✠ rojo en templarios, ❦ en elfos, rótulo centrado entre filos de oro en el imperio, goterones rojos en orkos y versalitas IM Fell en no muertos (`lado-*-1440.png`, recorte en el scratchpad `paneles.png`). |
| 2b | Botones redondeados en elfos y cuadrados en los demás | ✅ | `lado-elfos-1440.png` (Dormir, Centrar héroe y Fin de turno en píldora) frente a los otros cuatro. |
| 2c | «Fin de turno» destacado | ✅ | Templarios: rojo con ✠ y Cinzel. No muertos: brillo verde. Imperio: morado con filo de oro. Elfos: dorado en píldora. Orkos: rojo con filo naranja. En el móvil cabe en los 390 en los cinco (`movil-los-cinco.png`, `scrollWidth` = 390). |
| 2d | Marco del mapa grueso y con el color del material | ✅ con reservas | Lleva borde `--marco` y anillos `--brass` en los cinco. El color del material, además, rellena todo `#stage`: ver **H1**. |
| 3a | Una OFL por tema, servida de `assets/letras/` y con `OFL.txt` | ✅ | `CSS.getPlatformFontsForNode` (CDP) sobre la marca, los `h3`, el nombre del héroe y «Fin de turno»: `Cinzel*`, `IM FELL English SC*`, `Marcellus*`, `Almendra*` y `Germania One*` (el `*` es la fuente web). Todas las peticiones a `/letras/…ttf` dan **200**; ninguna petición ≥ 400; las cinco carpetas llevan `OFL.txt`. El texto corrido va con la del sistema: P052, Gentium, Libertine, Charis y C059. |
| 3b | `font-display` que no bloquee | ✅ | Todas son `swap`; lo vigila `fuentes.test.ts`, verde. |
| 3c | El lienzo usa la del título al llegar y, mientras, su respaldo | ✅ (por código) / ⚠️ (en pantalla, parcial) | `render/batalla.ts:1792` pinta las cifras de daño con `temaDelLienzo().letraTitulo`, y `ponerTema` borra lo leído cuando llega la letra. En imperio y orkos no vi una cifra de daño en el lienzo: `capturas` solo juega templarios, cuyas cifras salen del respaldo a propósito porque Cinzel no cubre 0-9. |
| 4a | Cada pieza tiene ranura en el CSS | ✅ | `piezas-de-tema.test.ts` verde. **`pnpm taller colocar`** con tres PNG sintéticos del imperio (marco de 1024² con esquinas rojas, remate y figura): la hoja pasó a llevar sus `--pieza-*`, y en la página (`qa/colocar/imperio-1920.png`) se ven el marco en 9 trozos con sus esquinas, el remate en el centro de arriba y la figura izquierda apoyada abajo, sin errores ni 404. Después los borré: `rm` de los 6 ficheros y `pnpm taller piezas-de-tema` → «0 piezas en disco». `cmp` de la hoja: igual. `ls -R assets/temas`: igual. `git status`: igual. |
| 4b | Sin la imagen el tema se ve completo, sin huecos ni errores | ✅ con reservas | Ningún error de consola ni petición ≥ 400 en la partida (5 temas × 3 tamaños), en la arena (5 temas) ni en el build. Hay respaldo para el escudo, la cinta, el sello y los estandartes. Pero a ≥ 1820 el canal de cada figura es más de la mitad color plano bajo el estandarte (**H2**). |
| 4c | Las piezas que faltan no rompen `vite build` ni `pnpm capturas` | ✅ | `vite build` salió 0 en 2,15 s, sin avisos. `pnpm capturas` salió 0. |
| 5 | Encargos para Codex listos, con una orden | ✅ | `pnpm taller encolar --temas --prueba` sale 0 y dice «53 encargos; no se ha encolado ninguno (--prueba)». La cola (`pnpm taller estado`) tiene 0 en las cuatro carpetas antes y después, las guías dan el mismo sha256 y `git status` no cambia. Leí dos prompts enteros (`tema-01-marco-mapa-elfos` y `tema-10-figura-izquierda-no-muertos`): llevan la lámina como estilo, el recorte de la maqueta, la guía de corte, el 12,5 % de las esquinas, «sin ningún texto», el fondo opaco o con alfa real, la `salida` y `despues: piezas-de-tema`. La orden de mañana está en `implementacion.md` y en `CLAUDE.md`. |
| 6 | Figuras solo desde un ancho documentado; por debajo, el mapa como hoy (1440 y 390) | ✅ | **Caja del lienzo**, en los cinco temas, igual que el neutro que midió el ingeniero: 1440 → `[21,58,1080,770]`; 390 → `[13,127,364,513]`; 1920 → `[181,58,1240,950]` (mapa 1254, canales 146). **Redimensionando en vivo** (no muertos): 1819 → sin figuras, lienzo 1459; 1820 → figuras, lienzo 1240; 1600 → 1240; 1440 → 1080; 2560 → canales de 180 y mapa 1826. A 390 no salen figuras, ni adornos, ni sello, y `scrollWidth` es 390. |
| 7 | Sin `data-tema` no cambia nada | ✅ | `npx tsx tools/qa/neutro.ts` sale 0 con 0 diferencias en seis escenas: partida (mapa y base), arena (montaje, edición y equipo) y espectador. En el espectador en vivo, `data-tema` es `null` y no se carga ninguna letra web. |
| 8 | `verify` verde; `capturas` y `verify:lento` al cerrar | ✅ | Arriba. |

**Pasada adversarial, lo que salió bien:**
- **El build no lleva `art/`**: `dist/art` no existe, y ningún `.js`, `.css` ni `.html` construido nombra `/art/`. El CSS pide `url(/letras/…)`; `dist/letras/` lleva las cinco familias con su `OFL.txt` y `procedencia.json`.
- **`vite preview`** (el build servido) con la partida de no muertos, la de templarios y la arena: el tema correcto, la letra cargada (200), sin errores de consola y sin peticiones ≥ 400.
- **El remate y la cartela no reciben el ratón**: `elementFromPoint` en la cartela da `CANVAS#canvas`, y encima del borde, `MAIN#stage`. No tocan las herramientas del mapa. Se esconden en la base y en la batalla (capturas `desktop-04-castillo` y `desktop-08-batalla-en-curso`) y en el móvil.
- **Los dos estados de turno**: el clic real en «Fin de turno» con movimiento pendiente abre la confirmación («Seguir jugando / Terminar el turno»), con el aviso a 5,83 de contraste y el tema intacto (`adv-templarios-1440-dia2.png`). En la partida terminada, «Partida perdida» y la crónica se leen sobre el pergamino (`desktop-12-fin-de-partida` de `capturas`).
- **Espectador**: sin tema y sin letras web. Sus únicos errores son el WebSocket a `ws://localhost:9880` porque no hay servidor (`pnpm partida` no estaba corriendo). No es de esta tarea.

## Hallazgos

### H1 — importante: el fondo del escenario es el material del marco, plano y mucho más claro que la lámina (imperio, elfos, templarios, orkos)

`forma.css` pone `:root[data-tema] #stage { background: var(--marco); }`. `--marco` es el color medido del **material del marco**: el mármol de las columnas del imperio, la plata de los elfos. Ese color rellena todo el escenario: los 12 px alrededor del mapa y, desde 1820 px, los dos canales de las figuras, de 146-180 px de ancho y 964 px o más de alto. En las láminas, el material es solo la moldura, y el margen de alrededor es oscuro.

**Medido** (mediana de luz Rec. 709 del margen izquierdo de la lámina, columna x 0-75, frente al canal izquierdo de la captura a 1920):

| Tema | Lámina | Captura | |
|---|---|---|---|
| imperio | 51 | **127** | ×2,5, beis `#917c66` |
| elfos | 117 | **180** | `#c9b196` |
| templarios | 49 | **94** | |
| orkos | 30 | **62** | gris pardo; la lámina es rojiza oscura |
| no muertos | 30 | 35 | casa |

**Las piezas de mañana no lo arreglan.** Con una figura sintética puesta (`qa/colocar/imperio-1920.png`), alrededor de la figura transparente sigue el beis: el canal es `#stage`, y la figura es `contain`. La textura del marco se mezcla en `soft-light` con este mismo color.

Para reproducirlo:
1. `pnpm dev`, ventana de 1920×1080, `/?seed=42644`.
2. En la consola, `(await import('/temas.ts')).ponerTema('imperio')`.
3. Los dos canales laterales y el hueco alrededor del mapa salen beis claro (`qa/lado-imperio-1920.png`). La lámina es azul marino casi negro, con columnas de mármol solo junto al mapa.

Lo que esperaba quien juega: margen oscuro, como en la lámina, y el material solo en el marco.

### H2 — menor: el respaldo de la figura de margen deja medio canal vacío

El estandarte de respaldo mide `min(46%, 420px)`. Debajo quedan unos 540 px de color plano a 1920×1080, y unos 900 px a 2560×1440 (`qa/lado-*-1920.png`, `qa/adv-no-muertos-2560.png`).

En templarios el estandarte (`#af9c83`) sobre el canal (`#745b40`) se queda en unos 2,8:1, así que se lee poco. Junto con el H1, a 1920 los márgenes parecen columnas de color en vez de adorno. No es un error y no hay cajas vacías con borde, pero es el «hueco» que quien juega ve más grande hasta que lleguen las figuras.

Para reproducirlo: cualquier tema a 1920×1080, en la partida.

### H3 — menor: el aviso de la barra de abajo va pegado arriba de su cartela

`#status` mide 38 px (y = 855-893), pero su texto empieza en 858 y ocupa 13 px. No queda centrado, como sí está en las cinco láminas. `forma.css` lleva `-webkit-box-pack: center`, que en Chromium no lo centra: el `display` computado sale `flow-root`.

Se ve en los cinco temas: `bots.png` en el scratchpad y el pie de todas las capturas. Para reproducirlo: cualquier tema a 1440×900, en la barra de abajo.

### H4 — menor: la «×» de quitar equipo se queda en un punto con las letras de los temas

El botón mide 34×34 px, pero el glifo, a 13 px con la serifa del tema, ocupa unos 4 px en el imperio y unos 6 px en templarios; en el neutro, unos 8 px. Comparado ampliado ×4 en `equis.png` del scratchpad. En las láminas es una X grande y gruesa. El contraste aguanta (6,8 y 7,3), pero la acción cuesta de ver.

Para reproducirlo: imperio a 1920, en el panel «Equipo», mirar la «×» de cada fila.

### H5 — menor, para mañana: la ranura del remate es mucho menor que el remate de la lámina

El remate cabe en 112×36 px: es lo que deja tapar solo 32 px del mapa, como decidió el usuario. En las láminas, en cambio, el remate mide aproximadamente:
- el escudo de los templarios, 70×90;
- el águila del imperio, 180×60;
- el cráneo de los orkos, 90×80.

Un encargo de 512×256 en esa caja sale a 72×36: el remate sintético se vio como un óvalo de unos 25 px (`qa/colocar/imperio-1920.png`). No es un fallo de hoy, pero el C9 lo va a notar. Hay que elegir entre parecerse a la lámina y tapar solo 32 px, y esa elección es del usuario.

### H6 — menor: detalles de letra

- El ✠ y el ❦ (adorno de las barras y de «Fin de turno») no están en Cinzel ni en Almendra. Salen de la letra de respaldo del sistema, DejaVu Sans (CDP: `DejaVu Sans:1 + Cinzel*:8`). En Windows y en macOS el glifo será otro.
- En no muertos, a 1440, el rótulo «HÉROE · RANGO 5 · NIVEL 3 · NIGROMANTE» se parte en dos líneas por lo ancho de IM Fell (`lado-no-muertos-1440.png`). En la lámina cabe en una.

### Nota, no es hallazgo: el salto del mapa a 1820 px

Al pasar la ventana de 1819 a 1820 px, el lienzo encoge de 1459 a 1240 px de ancho, porque los canales entran de golpe. Es lo que decidió el usuario («el mapa no baja nunca de 1254»). Se apunta porque, a quien redimensione, el mapa le pega un salto de 219 px.

## Workarounds usados

- **`ponerTema` desde la consola** para imperio, elfos y orkos en la partida. El juego solo tiene caballero y nigromante, y no hay otra forma de verlos en la partida. Quien juega no tiene ese obstáculo: nunca ve esos tres temas fuera de la arena, donde sí hay selector, y ahí se probaron con el selector real.
- **Piezas sintéticas con `pnpm taller colocar`**: lo pide la tarea. Las borré después, comprobado con `cmp` y `git status`.
- **`isMobile` con `hasTouch`** a 390 px, como el arnés del ingeniero.

## No probado

- **Firefox y Safari**: no hay navegador. Queda sin ver el `border-image` sin `border-style`, ya apuntado por el ingeniero.
- **Las letras de respaldo de Windows y macOS** (Trajan, Rockwell, Iowan…).
- **Las cifras de daño del lienzo en imperio y orkos**, que sí usan su OFL. Hace falta una batalla con esos temas, y `capturas` solo juega templarios.
- **El contraste sobre las texturas reales**: no hay texturas hasta mañana.
- **El turno del rival a mitad de animación**: la IA juega al instante y no dio tiempo a capturarlo. La barra se vio en «Tu turno» antes y después.

## Parecido por tema (sin piezas; juicio de paleta, letra y forma de los paneles)

| Tema | Paleta | Letra | Forma de los paneles | Juicio |
|---|---|---|---|---|
| **templarios** | Sí: pergamino, tinta oscura, rojo lacre en «Fin de turno» y en las cruces. El marco es pardo, no la piedra gris de la lámina. | Cinzel, como los rótulos romanos de la lámina. | Barras con ✠, botones de madera oscura, sello de lacre y día en cartela de pergamino. | Se reconoce. Le falta la piedra gótica, que es pieza. A 1920, los márgenes salen pardos claros (H1). |
| **no muertos** | Es el que más se parece: casi negro, tinta hueso y acento cian, y la barra de abajo con su brillo verde. | IM Fell SC, que va bien con lo gótico. | Panel oscuro verdoso, filas con filo cian y «Fin de turno» verde con brillo. | Se reconoce sin piezas. Faltan calaveras, telarañas y velas, que son piezas. |
| **imperio** | El panel sí casa: oscuro, filos de oro, morado en «Fin de turno». El escenario no: beis, frente a la lámina oscura (H1). | Marcellus, adecuada para el lapidario. | Rótulos centrados entre filos de oro y cartela «VIRTUS · DISCIPLINA · AETERNA VICTORIA». | Es el que menos se parece a 1920: el beis domina la pantalla. A 1440 se parece bastante. |
| **elfos** | Sí: pergamino claro, filas verde azulado y oro en «Fin de turno». El marco es tostado; la lámina es plata blanquecina. | Almendra, que va bien. | Botones en píldora, ❦ y filas redondeadas. | Se reconoce. El marco y los márgenes salen más cálidos y oscuros que la plata de la lámina (H1). |
| **orkos** | Sí: oscuro, rojo de títulos, goterones y «Fin de turno» rojo. El escenario es gris pardo; la lámina es pardo rojizo casi negro. | Germania One: rota, como la marca de la lámina. | Barras con goterones y rótulos rojos. | Se reconoce. Le falta el hierro remachado y los colmillos, que son piezas. |

## Ficheros

- Capturas: `docs/agents/2026-10-13-temas-de-las-laminas/qa/`
  - `lado-<tema>-{1440,1920}.png`: la partida junto a su lámina;
  - `imperio-1920.png`, `<tema>-390.png` y `movil-los-cinco.png`;
  - `adv-*.png` (mapa entero, día 2 y 2560);
  - `arena-<tema>-1440.png` y `espectador-1440.png`;
  - `colocar/imperio-1920.png`: con las tres piezas sintéticas, ya borradas.
- Guiones (ignorados): `.cache/qa-temas/mirar.mts`, `adv.mts`, `prev.mts` y `prompt.mts`.

---

# Vuelta 2

QA, 13-10-2026, sobre el árbol sin commit del worktree tras la «Vuelta de QA 1» y la decisión del coordinador (opción c en el imperio, b en los elfos). Solo lo afectado: H1, H3, H4, H6 y el neutro, más una pasada adversarial sobre lo cambiado. No se arregló nada y no se lanzó ningún encargo a Codex.

## Veredicto: **Apto**

H1, H3, H4 y H6 quedan resueltos tal y como se decidió, y el neutro no cambia. Hay dos hallazgos nuevos, los dos **menores**, y ninguno pide cambiar nada hoy (N1 y N2, abajo). En la pasada adversarial salieron dos cosas que ya venían de antes y que el neutro hace igual; se apuntan como notas.

## Cómo se probó

- **`pnpm verify`**, una vez: salida 0 en 54 s, `Test Files 129 passed | 1 skipped (130)` y `Tests 3107 passed | 14 skipped (3121)`.
- **`npx tsx tools/qa/neutro.ts`**: salida 0, con «0 diferencias» en las seis escenas (partida: mapa y base; arena: montaje, edición y equipo; espectador). Línea final: «neutro igual que en HEAD: 0 diferencias».
- **`pnpm capturas`**, una vez al cerrar: **salida 0** en 382 s, con «sin errores en consola» y 65 PNG en el scratchpad. Juega templarios. En `desktop-02-mapa-ruta-dorada-y-gris`, el aviso real de la ruta («Ruta: hoy llegas a 7 de 8 pasos…») sale **centrado en su cartela**, por el flujo real y con un clic de verdad. El canal del mapa sale pardo oscuro.
- **Navegador**: Playwright sin pantalla, con un vite propio (`arrancarVite`, puerto del sistema y su grupo, muerto con `matarGrupo`). Al terminar, `ss -ltnp` solo enseña el 3100, el 3150 y el 3636, que son de otros y no se tocaron. Los guiones están en `.cache/qa-temas2/v2.mts` y `arena.mts` (ignorados).
  - Templarios y no muertos se abren por el flujo real (`?seed=42644&faccion=knight|necromancer`). Imperio, elfos y orkos, con `ponerTema` desde la página, como en la vuelta 1; en la arena, con su selector «Tema».
  - En todas las pasadas (partida a 1440, 1920, 2560 y 390, y arena a 1440 y 1920): **ningún error ni aviso de consola** y ninguna petición ≥ 400 («ERRORES []»).
- Capturas en `qa/v2/`.

## Punto por punto

| Punto | Estado | Evidencia |
|---|---|---|
| **H1**: el fondo del escenario se parece a la lámina | ✅ | Luz mediana (Rec. 709) del margen izquierdo, del borde de la ventana al marco del mapa y de arriba abajo de `#stage`, frente a la franja x 0-75 de la lámina. A 1920: **templarios 39/48 (−9), no muertos 19/30 (−11), imperio 29/48 (−19), elfos 110/113 (−3), orkos 31/32 (−1)**. A 2560, lo mismo. Cuatro de cinco caen en ±15. El imperio se queda fuera **por decisión del coordinador** (opción c): lo que no es figura ni marco es casi negro, como en la lámina. **Lado a lado** (`qa/v2/lado-<tema>-1920.png`, mirados los cinco): el beis del imperio ha desaparecido, y ahora es un fondo oscuro con estandarte morado, como la lámina. Templarios, en pardo oscuro con el paño claro bien despegado, se acerca a la piedra oscura de la lámina. Orkos y no muertos salen casi negros, como la suya. Los elfos aciertan en la luz y se quedan cortos en el color (**N1**). |
| **H2**, medido de paso (contraste del estandarte con el canal) | ℹ️ | Templarios **5,60** (antes, 2,39-2,8): el paño claro se despega, que es lo que pedía H2. No muertos 1,20, imperio 1,08, elfos 1,29, orkos 1,66: en esos cuatro, el paño se lee por su filo de `--brass` (2,43 en el imperio, 2,33 en los elfos, 4,03 en no muertos y 11,7 en orkos). Es decoración y la decisión no le exige 4,5 (`qa/v2/canales-1920.png`). |
| **H3**: el aviso, centrado | ✅ | Holgura entre la caja de `#status` y su línea de texto (`Range.getClientRects`), a 1440 con el aviso real de una línea: templarios 12/13, no muertos 9/10, imperio 11/12, elfos 7/9 y orkos 12/13. Antes era 3/22, 0/19, 2/21, −2/18 y 3/22. **El alto no cambia**: `#status` mide 38 y la barra 53 en los cinco. Con el texto fijado a mano y ocho frases, se ven **dos líneas** y el resto se recorta (holgura 3/4, 0/1, 2/3, −2/0 y 3/4, con la caja de 39 y la barra de 54). Ese píxel de más ya pasa en el neutro (20 → 39 y 53 → 54). Capturas: `qa/v2/avisos-dos-lineas-1440.png`. |
| **H3 en el móvil** (390, con un aviso de dos líneas de verdad) | ✅ | El aviso de arranque («Haz clic en el mapa…; Espacio pasa el turno.») ocupa dos líneas a 390 en los cinco temas. La caja mide 39 y el texto la llena (holgura 3/4; 0/1 en no muertos; −2/0 en elfos), sin cortar ningún glifo. Con un aviso de ruta de tres líneas (fijado a mano), se recorta a dos con «…» y la barra no crece (113). `scrollWidth` es 390 en todos (`qa/v2/avisos-dos-lineas-390.png`). |
| **H4**: la «×» de quitar equipo | ✅ | Tinta del glifo (la caja de lo que pasa de la mitad del contraste máximo con el fondo del botón): **7×6 en los cinco temas y en el neutro**, a 1440, a 1920 y a 390. Según CDP, la letra es `DejaVu Sans:1` en los seis, la misma que en el neutro. Ampliada ×4: `qa/v2/equis-los-seis-1440.png`. Los «× nombre» de la tropa no tienen esta regla (no hay `.quitar-equipo` en la partida de la semilla 42644). |
| **H6**: emblemas con su cadena de símbolos | ✅ | La `font-family` computada de los cinco pseudoelementos que pintan `--emblema` o `--adorno` (`#side h3::before`, `#actions button.primary::before`, `#statusbar::before`, `.remate::before`, `.figura-del-margen::before`) y de la «×» es `"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Sans Symbols2", "DejaVu Sans", sans-serif`, en los cinco temas. Según CDP (`getPlatformFontsForNode` sobre el pseudoelemento), en esta máquina el ✠ y el ⚔ salen de `Noto Sans Symbols`, y el ❦, el ☠ y el ❖ de `Noto Sans Symbols2`. Ninguno sale ya de DejaVu ni como cuadro. En no muertos, imperio y orkos, el `h3::before` y el de «Fin de turno» no existen porque `--adorno: none`, como en sus láminas. En el móvil no hay sello, remate ni estandarte, y el resto, igual. |
| **H6**: el rótulo de no muertos en una línea | ✅ | «HÉROE · RANGO 5 · NIVEL 3 · NIGROMANTE» va en **1 línea** a 1440, 1920 y 390, con 1,32 px de espaciado (0,12 em) y 282 px de ancho (`qa/v2/rotulo-no-muertos-1440.png`). Los otros cuatro siguen en 1,76 px. Adversarial: con «RANGO 12 · NIVEL 10» (el héroe sube sin tope), no muertos sigue en una línea en los tres anchos. |
| El neutro no cambia | ✅ | `neutro.ts`: 0 diferencias (arriba). |

## Pasada adversarial

- **Texto sobre el nuevo fondo.** Recorrí todos los nodos de texto visibles de `#stage` cuyo fondo opaco más cercano es el propio `#stage`. En la partida (cinco temas, a 1920 y 2560) y en la arena (cinco temas por el selector, a 1440 y 1920) hay **0**: todo el texto va sobre el panel, sobre cartelas o sobre el lienzo. La cartela del lema cae sobre el mapa y no cambia. El nuevo fondo no deja ningún texto con poco contraste.
- **La arena** también tiene `#stage` y recibe `--fondo-escenario`, pero sus columnas lo tapan: en pantalla no cambia nada (`qa/v2/arena-<tema>-{1440,1920}.png`), y no hay errores.
- **El remate y su escudo** (`--brass`) sobre el nuevo fondo: 3,8 en templarios, 4,0 en no muertos, 2,4 en el imperio, 2,3 en los elfos y 11,7 en orkos. Se ve en las cinco capturas.
- **La cadena de símbolos**: comprobada arriba. No queda ningún `content: var(--emblema|--adorno)` sin ella (`grep` en `src/client`: las cinco reglas de `forma.css`, y lo vigila el test nuevo de `temas.test.ts`, que pasó en `verify`).
- **El centrado, con avisos de una, dos y ocho líneas**, a 1440 y en el móvil: arriba. No se pierde el recorte a dos líneas en ningún tema.

## Hallazgos nuevos

### N1 — menor: el canal de los elfos acierta en luz pero sale caqui, no plata

`--fondo-escenario: #796e52` da la luz de la lámina (110 frente a 113). Pero el margen de la lámina, visto de cerca (`qa/v2/lamina-elfos-margen.png`), es **plata marfil** (media de las dos zonas de plata: `#ad9e82` y `#a79a85`, luz ~158) con hiedra verde oscura encima, y una sombra azul marino (`#0d0f16`) junto al marco. El color que sale es un píxel real de la lámina, de la parte en sombra de la plata, y a 1920 los dos canales y el hueco del mapa se ven como **un pardo caqui liso** (`qa/v2/lado-elfos-1920.png`). Es más oscuro y más oliva que la plata que se ve en la lámina. No es un error: es la consecuencia de igualar la luz con un solo color plano donde la lámina mezcla un material claro y una sombra. Seguramente se resuelve mañana con la `figura-derecha` y la textura del marco. Si se quiere ya, habría que elegir entre «la luz» y «el color de la plata».

Para reproducirlo: elfos a 1920×1080 en la partida (`ponerTema('elfos')`), y comparar el canal con el borde izquierdo de `assets/art/temas/elfos.png`.

### N2 — menor: el paño del estandarte de respaldo apenas se separa del canal en cuatro temas

Con el fondo oscuro, el paño del estandarte es casi del mismo tono que el canal: 1,08 en el imperio, 1,20 en no muertos, 1,29 en los elfos y 1,66 en orkos. Solo lo dibuja el filo de 2 px de `--brass`. En el imperio y en no muertos, a 1920, el estandarte se lee como un rectángulo con borde fino más que como una colgadura (`qa/v2/canales-1920.png`). La decisión de H1 lo aceptaba («es decoración»), y las figuras de mañana lo sustituyen, así que no pide arreglo hoy. Se apunta porque en templarios H1 lo mejoró y en estos cuatro lo empeoró: en el imperio, de 4,54 a 1,08.

### Notas (no son de esta vuelta: el neutro hace lo mismo)

- **El ⚔ de orkos sobre su estandarte** sale negro sobre rojo, con un contraste de 1,95: se lee, pero poco. Los colores del estandarte no cambiaron en esta vuelta; solo cambió la letra del glifo.
- **La barra del móvil cambia de alto con el aviso**: de 113 px con dos líneas a 93 px con una («No hay camino hasta (13,2).»). Pasa igual en el neutro (113 → 93): es la barra de siempre, con `flex-wrap`, y no la tocó H3.
- **«RANGO 12 · NIVEL 10»** se parte en dos líneas en templarios con Cinzel a 1440 y 1920, igual que en el neutro. H6 solo pedía el rango 5 en no muertos.
- **El margen derecho de la lámina** de templarios es más claro que el izquierdo (luz 79 frente a 48: el sello y el pergamino «TEMPLI MILITIA CHRISTI»). La ficha se mide en el izquierdo, como decidió H1, y el canal derecho sale igual que el izquierdo (39).

## Workarounds usados

- **`ponerTema` desde la página** para el imperio, los elfos y los orkos en la partida. Es lo mismo que en la vuelta 1: el juego no tiene esas facciones, y en la arena se usó el selector real.
- **El texto de `#status`, fijado a mano** (sobrescribiendo el `textContent` de ese elemento) para medir avisos de dos y ocho líneas a 1440. A ese ancho, el juego no da un aviso real tan largo en la semilla 42644 sin jugar varios días. **En el móvil sí se midió un aviso real de dos líneas**, el de arranque.
- **El rótulo, reescrito a «RANGO 12 · NIVEL 10»** para ver si cabe, sin jugar hasta ese rango.

Ninguno esconde un obstáculo de quien juega.

## No probado

- Windows y macOS: no se ha visto qué glifo da `Segoe UI Symbol` ni `Apple Symbols`. Solo está comprobado que la cadena los nombra primero.
- Firefox y Safari.
- Cómo queda el nuevo fondo bajo la textura del marco (`soft-light`), que llega mañana.

---

# Vuelta 3: afinado con las piezas

QA, 18-10-2026, sobre el árbol sin commit del worktree, con las 53 piezas de Codex en `assets/temas/` y el «Afinado con las piezas» de `implementacion.md`. Se valida:

- los cuatro puntos de `hallazgos-afinado.md`;
- el criterio 9 (el parecido con cada lámina);
- una pasada adversarial con las piezas reales.

No se arregló nada, no se lanzó ningún encargo a Codex y no se regeneró ninguna pieza.

## Veredicto: **Hallazgos** (apto con reservas)

**Los cuatro puntos se cumplen y se miden**, con la orden del ingeniero y con mis propias pasadas, y las cifras coinciden con las de `implementacion.md`:

1. Los rótulos de sección se leen en los cinco temas.
2. El marco tiene la moldura de la lámina y el lienzo no se mueve.
3. El remate y la cartela tienen el tamaño de la lámina y no bajan de 64 px.
4. El margen vuelve a su luz.

**El parecido con las láminas es alto a 1920** en templarios, no muertos, imperio y orkos, y **medio-alto** en elfos.

Ningún hallazgo bloquea, pero hay dos importantes:

- **V3-1**: las esquinas estiradas no son de dos temas, sino de cuatro. En los orkos se ven a simple vista: los colmillos quedan como dos manchas largas y borrosas en la banda de arriba.
- **V3-2**: la moldura no tiene tope. Crece con el alto de la ventana y, en una pantalla vertical, tapa 40-62 px del mapa por lado.

Además, la orden que mide (`temas-con-piezas.ts`) no vigila lo que tapa: lo escribe, pero no falla (**V3-3**).

## Cómo se probó

- **`pnpm verify`**, una vez: salida 0 en 61 s.
  - `Test Files 129 passed | 1 skipped (130)`
  - `Tests 3109 passed | 14 skipped (3123)`
- **`npx tsx tools/qa/temas-con-piezas.ts docs/agents/2026-10-13-temas-de-las-laminas/qa/v3`**: salida 0 en 83 s, con «todo en su sitio».
  - Las cifras son las de `implementacion.md`, una a una (abajo).
  - Las capturas lado a lado quedan en `qa/v3/afinado-*.png`.
- **`npx tsx tools/qa/neutro.ts`**: salida 0, con 0 diferencias en las seis escenas (partida: mapa y base; arena: montaje, edición y equipo; espectador), y «neutro igual que en HEAD: 0 diferencias».
- **`pnpm capturas`**, una vez al cerrar: **salida 0** en 388 s, «sin errores en consola», 65 PNG en el scratchpad. Juega con el caballero, así que el tema es templarios con sus piezas. Copié a `qa/v3/capturas/` el mapa del día 1, la base (`desktop-04-castillo`, con arte), la batalla en curso, el final de la partida y el móvil.
- **`verify:lento`** no se repitió. Lo cita `implementacion.md` (afinado: 4960 passed, salida 0), y desde entonces no ha cambiado ningún fichero.
- **Navegador**: Playwright sin pantalla, con vite propio (`arrancarVite`, puerto del sistema y su grupo, muerto con `matarGrupo`). Los guiones están en `.cache/qa-v3/`, que es ignorado:
  - `adv.mts`: la partida real, la base y la batalla;
  - `adv2.mts`: ventanas raras y la arena;
  - `adv3.mts`: el combate de la arena y la ventana baja;
  - `preview.mts`: el build.
- **Flujo real**:
  - Templarios y no muertos se abren con `?seed=7&faccion=knight|necromancer`.
  - Se entra a la base con un clic en el castillo y a la batalla con un clic en la guardia.
  - Imperio, elfos y orkos, con `ponerTema` desde la página, como en las vueltas 1 y 2 y como la orden del ingeniero. En la arena, con su selector «Tema».
- **Procesos**:
  - `vite preview` en el 4793, arrancado con `set -m` en su propia línea; su `$!` es el líder de su grupo (pgid 43044, `cwd` este worktree), y se mató por grupo. `ss` dice «4793 libre».
  - Los vite de los guiones, en su grupo.
  - Al final solo escuchan el 3100, el 3197 y el 3636, que no se tocaron.

## Los cuatro puntos

| Punto | Estado | Evidencia |
|---|---|---|
| **1. Rótulo de sección legible sobre la pieza real** | ✅ | `temas-con-piezas.ts`, mediana WCAG de la tinta sobre los píxeles de la barra bajo cada letra, 7 rótulos por tema, igual a 1440 y a 1920. **Templarios** 12,13-12,34 (peor décimo ≥ 11,38). **No muertos** 8,58-8,63 (≥ 8,36). **Imperio** 7,78-7,84 (≥ 7,50). **Elfos** 6,75-6,84 (≥ 6,56; antes, 1,35). **Orkos** 4,94-5,00 (≥ 4,33). Todos ≥ 4,5. La medida es reproducible y sale con 1 si no llega: el ingeniero la vio en rojo con el estado de antes. En `qa/v3/afinado-elfos-1920.png` se lee «HECHIZOS», «EQUIPO», «MOCHILA» en hueso sobre la barra verde azulada. **Comprobado a mano**: el método (dos fotos, con y sin tinta, y los píxeles que cambian > 60) mide lo que dice; no mide el borde suavizado, que es lo de menos. **Lo que no mira**: los orkos quedan a 0,44 del umbral, y su peor décimo (4,33-4,53) baja de 4,5. Se lee bien en pantalla (`afinado-orkos-1920.png`), pero es el más justo. |
| **2. El marco con la moldura de la lámina** | ✅ con reservas | **Grosor**: a 1920×1080, la banda entra en el mapa 12,4-14,5 px por arriba y por los costados y 18,3-23,8 por el pie; a 1440×900, 2,2-8,1 y 11,2-15,7 (tabla abajo). Con los 12 px que salen sobre el relleno, a 1920 la moldura mide 25-36 px: está dentro de los 25-40 de las láminas, y en `costado-izq-1920.png` se ve como moldura, no como línea. **El lienzo no se mueve**: `#canvas` mide igual que lo apuntado a 390, 1440, 1819, 1820 y 1920, en el neutro y en los cinco temas (30 de 30 «igual»). **El neutro**: `neutro.ts` da 0. **Los clics llegan al mapa**: ver la pasada adversarial. **El corte medido**: `piezas-de-tema.test.ts` (en `verify`) compara la hoja con el disco. Al ojo, en `qa/v3/piezas-marco-mapa.png` (las cinco piezas), el corte casa con la banda en templarios e imperio. **Reservas**: V3-1 (esquinas estiradas en cuatro temas) y V3-2 (sin tope en ventanas altas). |
| **3. Remate y cartela del tamaño de la lámina** | ✅ | Tapan, desde el borde de arriba de lo que se ve del mapa (remate / cartela): a 1920, templarios 64/43, no muertos 64/40, imperio 42/64, elfos 53 y orkos 64; a 1440, 61/41, 60/37, 39/61, 39 y 56. **Nunca más de 64** en ninguna ventana que probé, tampoco en 2560×1440 ni en 1080×1920: el tope de `--px-lamina` muerde. **`pointer-events: none`**: `elementFromPoint` en el remate da `CANVAS#canvas`. **Ocultos** en el móvil (`afinado-movil-390.png`), en la base y en la batalla (`adornos: none` en los diez casos medidos). **Proporción**: en `afinado-templarios-1440.png`, el escudo con las dos cintas ocupa el 64 % del ancho del mapa, y en la lámina, el 63 %. `remates-1920.png`: escudo entre «IN HOC» y «SIGNO VINCES», calavera entre «MEMENTO» y «MORI», águila sobre «VIRTUS · DISCIPLINA · AETERNA VICTORIA», cristal entre hiedra y cráneo con cuernos, como en cada lámina. |
| **4. Margen del imperio, otra vez casi negro** | ✅ | Luz mediana del margen izquierdo a 1920, frente a la lámina: **templarios 42/48 (−6), no muertos 19/31 (−12), imperio 31/48 (−17), elfos 111/113 (−1), orkos 31/32 (−1)**. Cuatro caen en ±15, y el imperio en el −12…−22 de la opción c. En `afinado-imperio-1920.png` el pardo ya no está: azul noche casi negro, con la columna, el estandarte morado y el legionario. **Nota**: el rango del imperio (−22…−12) se fijó después de medir (`implementacion.md` lo dice) y no se vio en rojo con la textura de antes. El experimento de `margen.mts` da +13, que queda fuera, así que en la práctica sí muerde. |

**Lo que tapa el marco, por ventana** (px que la banda entra en lo que se ve del mapa: arriba / derecha / abajo / izquierda). A 1440 y 1920 lo da `temas-con-piezas.ts`; el resto, `adv2.mts`:

| Ventana | templarios | no muertos | imperio | elfos | orkos |
|---|---|---|---|---|---|
| 1440×900 | 6,9/6,9/11,7/6,5 | 8,1/7/15,5/6,4 | 4,1/6,7/12,6/6,7 | 2,2/6,5/11,2/7 | 7,8/6,7/15,7/6,7 |
| 1920×1080 | 13/13/18,9/12,5 | 14,5/13,1/23,6/12,4 | 9,6/12,7/20/12,7 | 7,2/12,4/18,3/13,1 | 14,1/12,7/23,8/12,7 |
| 2560×1440 | 25,1/25,1/33,3/24,4 | 27,2/25,2/39,7/24,3 | 20,4/24,8/34,8/24,8 | 17,1/24,3/32,4/25,2 | 26,6/24,8/40/24,8 |
| **1080×1920** (vertical) | **41,3/41,3/52,4/40,3** | **44,1/41,5/61,2/40,1** | 34,8/40,8/54,5/40,8 | 30,3/40,2/51,3/41,4 | **43,4/40,8/61,6/40,8** |
| 1920×700 | 0,2/0,2/3,7/0 | 1,1/0,3/6,5/0 | −1,9/0/4,4/0 | −3,3/0/3,4/0,2 | 0,9/0/6,7/0 |

En 1920×700, el −1,9 del imperio y el −3,3 de los elfos dejan una rendija de 2-3 px entre la moldura y el terreno, por arriba (`rendija-1920x700.png`, ampliada ×3). En la ventana es un hilo oscuro que apenas se ve: no lo cuento como hallazgo.

## Criterio 9: el parecido con cada lámina

Mirado en `qa/v3/afinado-<tema>-{1440,1920}.png` (la captura y la lámina, una al lado de la otra), `afinado-movil-390.png` y los recortes `remates-1920.png`, `banda-arriba-1920.png`, `costado-izq-1920.png` y `esquinas-*-1920.png`. No juzgo lo que la tarea deja fuera: el terreno, el minimapa en sí (que el día 1 es una mancha pequeña en un recuadro negro) ni lo que dice cada panel.

| Tema | 1920 | 1440 | 390 | Juicio |
|---|---|---|---|---|
| **templarios** | **Alto** | Medio-alto | Bien | Es el que más se parece. Tiene la moldura de piedra con las cruces paté en las esquinas y el escudo entre «IN HOC» y «SIGNO VINCES» en cinta roja, como en la lámina. En el margen izquierdo, la hornacina con el caballero, el estandarte y las velas; en el derecho, el estandarte blanco con cruz y el lacre. El panel es pergamino con barras de cruz, y «Fin de turno» es rojo con cruz. Las esquinas casan sin estirarse. Le falta, como a todos, el grosor de las columnas entre el mapa y el panel de la lámina, que aquí es un hueco de 12 px. |
| **no muertos** | **Alto** | Medio-alto | Bien | Hierro negro con telarañas y velas cian, la calavera entre «MEMENTO» y «MORI», el segador en el margen derecho y el estandarte morado con la cruz invertida en el izquierdo. El panel es oscuro con tinta hueso, y «Fin de turno» tiene brillo verde. La lámina lleva runas en la cinta; aquí va el lema, como se decidió. Las esquinas estiran la vela y la telaraña (V3-1), pero se lee como más telaraña. |
| **imperio** | **Alto** | Medio | Bien | La columna de mármol con capitel dorado, el águila sobre la cartela «VIRTUS · DISCIPLINA · AETERNA VICTORIA», el estandarte morado con la laurea, la brújula, el legionario dorado y el grifo al pie de la columna izquierda: es la lámina. El fondo es azul noche casi negro. A 1440, sin las figuras, se queda en la moldura dorada con la franja morada. |
| **elfos** | **Medio-alto** | Medio | Bien | Tiene la plata con hiedra y cristales cian, el remate de cristal, la elfa del báculo y las columnas de filigrana. Se aleja de la lámina en tres cosas. **La barra de arriba y la de abajo son verde azulado oscuro**, mientras que en la lámina son plata clara con la luna. **El canal sigue caqui** (N1 de la vuelta 2, que la textura no arregló). Y **los rótulos de sección van en barra oscura con tinta clara**, cuando en la lámina son tinta oscura sobre el pergamino. Las barras verde azuladas y la hiedra sí están. |
| **orkos** | **Alto** | Medio-alto | Bien | Hierro remachado rojizo, el cráneo con cuernos sobre el mapa, los estandartes rojos de la Horda en los dos márgenes con la calavera de cuernos, el panel oscuro con títulos rojos en letra rota y «Fin de turno» rojo. **Lo que más lo afea son las esquinas** (V3-1): los colmillos, estirados, quedan como dos manchas beis de unos 150 px a lo largo de la banda de arriba, junto a las esquinas. La lámina tampoco tiene el rótulo «HEROES SILENCE» en letra rota roja: aquí va la marca de siempre. |

A **1440**, todos bajan un escalón por la misma razón, que es la que decidió el usuario: sin figuras en los márgenes por debajo de 1820, se pierde la mitad de lo que hace reconocible cada lámina, y la moldura es más fina (2-8 px dentro del mapa por arriba y por los costados). Aun así se reconoce cada tema por el marco, el remate y la cartela.

En el **móvil a 390**, los cinco están bien: el marco va en el borde del mapa, sin remate, cartela, figuras ni sello. `scrollWidth` es 390.

## Pasada adversarial

- **El marco no se queda con los clics.** `elementFromPoint` da `CANVAS#canvas` en los 7 puntos del mapa de cada una de las 4 pasadas: la guardia, la cabeza de su figura, el héroe, el castillo, la banda izquierda a 15 px del borde de lo que se ve, la banda del pie y el remate. Medido en templarios y no muertos, por el flujo real, a 1440 y 1920. Los botones de las herramientas dan su propio `BUTTON` (`zoom-out`, `centrar`, `zoom-in` y «Marcar»), y quedan a 17-23 px del borde derecho y a 22-34 del pie, fuera de la banda (que entra 13 y 24).
- **Una guardia en la fila 0, bajo la cartela.** Con la semilla 7 hay una guardia a (12,0), en la primera fila del mapa: a 1440 cae a 70 px del borde de arriba y bajo la punta derecha de «SIGNO VINCES».
  - **Su chapa «4» queda a la vista** (`guardia-fila-0.png`) y la cartela solo roza el tope de la figura.
  - **El hover** dice «4 monstruos de guardia · llegas hoy (8 pasos).».
  - **Un clic** en ella abre la batalla («¡Batalla!»), a 1920 en templarios y en no muertos.
  - Un héroe parado en la fila 0, en el centro del mapa, sí quedaría bajo el remate: es lo que el usuario aceptó al decidir que tape («tapan unos 32 px», luego hasta 64).
- **La base con los cinco temas** (`base-los-cinco-1920.png`; partida del nigromante, que no tiene arte de base y pinta sus marcadores, como documenta `CLAUDE.md`). Entra por un clic real en el castillo.
  - El adorno está oculto (`display: none`).
  - El marco va en el borde del mapa, con su pieza: 19 px, de los que salen 12.
  - El lienzo no cambia de un tema a otro (`[181,58,1240,676]` en los cinco), y no hay errores.
  - La base de templarios con su arte: `qa/v3/capturas/desktop-04-castillo.png` (de `pnpm capturas`). El marco de piedra con las cruces va en el borde y el panel es pergamino. Ver V3-5.
- **La batalla con los cinco temas** (`batalla-los-cinco-1920.png`), con un clic real en la guardia: el adorno está oculto y el marco va en el borde (`outset` 12 px, ancho 19), sin tapar el tablero. Las filas atenuadas de «En el campo» se leen poco en los cinco temas; son botones deshabilitados (`opacity: 0.45`, `style.css`), como en el neutro, y no son de esta tarea.
- **La arena con los cinco temas**, por su selector, a 1440 y 1920: montaje y combate (`arena-combate-los-cinco-1920.png`, `arena-<tema>-<ancho>-combate.png`). El combate lleva `marco-mapa` con 19 px y `outset` 12. Se piden `marco-panel` y las dos texturas. Ningún error.
- **El espectador sigue neutro**: `neutro.ts`, 0 diferencias. En el build, `data-tema` es `null` y no pide ni una pieza.
- **Ningún 404 ni error de consola**:
  - en la orden del ingeniero (390-1920, seis estados): ninguno;
  - en `adv.mts` (partida, base y batalla, dos facciones, 1440 y 1920): «ERRORES []»;
  - en `adv2.mts` (cuatro ventanas raras × cinco temas, arena a 1440 y 1920): «ERRORES []»;
  - en `adv3.mts`: «ERRORES []».
- **El build con las piezas**: `vite build --outDir <scratchpad>/dist` sale 0 en 2,9 s.
  - En `dist/temas/` están los cinco temas, las 53 `.webp` (2,4 MB) y su `procedencia.json`, como el resto de `assets/`.
  - **No hay `_guias/`, `art/` ni `fuentes/`** en ninguna parte de `dist`, y ningún `.css` ni `.js` construido los nombra.
  - El CSS construido nombra exactamente 53 `url(/temas/…webp)`.
  - Con `vite preview`, el caballero abre templarios y pide sus 11 piezas, todas con 200. El nigromante pide las 11 de no muertos, con 200. La arena, al cambiar de tema, pide las de cada uno, con 200. El espectador no pide ninguna.
  - El único error es el WebSocket del espectador a `ws://localhost:9880`, porque no había `pnpm partida`. Es el mismo de las vueltas 1 y 2 y no es de esta tarea.
- **Ventanas raras**: ver la tabla del punto 2 y V3-2. En 2560×1440, el remate tapa como mucho 64 y la página no se desborda (`scrollWidth` igual al ancho en las cuatro).

## Hallazgos

### V3-1 — importante: las esquinas estiradas están en cuatro temas, y en los orkos se ven

El ingeniero las reconoce en no muertos y orkos. Pasan también en el **imperio** (el ala del grifo de la esquina de abajo se estira hacia arriba por la columna) y en los **elfos** (la punta del cristal y las hojas se estiran junto a cada esquina). Solo templarios casa limpio.

Cuánto se nota, a 1920 y a tamaño real (`banda-arriba-1920.png`, `costado-izq-1920.png`; ampliado ×2 en `esquinas-abajo-izq-1920.png` y `esquinas-arriba-der-1920.png`):

- **Orkos: se nota a simple vista.** El colmillo y el paño rojo de cada esquina de arriba se estiran en una mancha beis y roja de unos 150 px por 20 a lo largo de la banda. No se lee como colmillo, sino como algo borroso. En la esquina de abajo pasa lo mismo, más corto.
- **No muertos: poco.** La vela cian deja una estela de unos 80 px hacia arriba por el costado, y la telaraña se alarga; se lee como más telaraña y una llama larga.
- **Elfos: poco.** Hoja y cristal alargados en unos 40-60 px junto a cada esquina.
- **Imperio: muy poco.** Del grifo y del capitel se estiran unos 60 px, y la columna los disimula.

La causa es la que dice el ingeniero: el adorno de la esquina es más ancho que la banda medida, y lo que sobra cae en el trozo que se estira. **Solo se arregla rehaciendo la pieza** con la esquina dentro de su banda, y eso lo decide el coordinador.

**Reproducir**: `npx tsx tools/qa/temas-con-piezas.ts /tmp/x` y mirar `/tmp/x/afinado-orkos-1920.png` en la banda de arriba del mapa, junto a sus dos esquinas.

Lo que esperaba quien juega: colmillos enteros en las esquinas, como en la lámina.

### V3-2 — importante: la moldura del mapa no tiene tope; en una ventana alta tapa 40-62 px por lado

`--a-la-lamina` se calcula con el **alto** de la ventana, `(100vh − 130px) / 928`, y `--moldura-del-mapa` no tiene máximo. El remate sí lo tiene: 64. Así, la banda que monta sobre el mapa crece con el alto aunque el mapa sea estrecho:

- **1080×1920** (un monitor vertical): 40-44 px por arriba y por los costados y **51-62 por el pie**, sobre un lienzo de 720 de ancho. Son unos 80 px de los 720, un 11 % del ancho, bajo la moldura (`ventana-<tema>-1080x1920.png`).
- **2560×1440**: 24-27 px por arriba y por los costados y **32-40 por el pie**. El pie pasa de los «~24 por lado» del hallazgo; aquí el mapa es más grande, así que se nota menos.

El hallazgo pedía «como mucho ~24 px por lado a 1920», y a 1920×1080 se cumple (23,8 en el pie de los orkos). Pero nada impide que una ventana más alta tape más: no hay `min()` como el del remate.

Las herramientas sí se apartan bien: a 1080×1920 quedan a 61-72 del pie, fuera de la banda.

**Reproducir**: `pnpm dev`, una ventana de 1080×1920, `/?seed=42644`, y en la consola `(await import('/temas.ts')).ponerTema('orkos')`. La moldura del pie tapa unos 62 px del mapa.

Lo que esperaba quien juega: una moldura del grosor de la lámina, también en pantallas altas, sin perder más mapa que a 1920.

### V3-3 — menor: `temas-con-piezas.ts` escribe lo que tapa el marco, pero no lo vigila

La orden falla por el contraste, por el lienzo, por la luz del margen, por la consola y por la red, pero **cuánto tapan el marco, el remate y la cartela solo lo imprime**. Si mañana la moldura pasa de 24 a 60 px a 1920, o se quita el tope de 64 del remate, la orden sigue dando «todo en su sitio».

`hallazgos-afinado.md` pone dos límites («~24 px por lado a 1920», «como mucho ~64 px»). Hoy se cumplen, pero nada los guarda. Es la regla de `CLAUDE.md` «un guardia hay que verlo morder»: aquí falta el guardia.

**Reproducir**: en `forma.css`, cambiar `calc(31 * var(--a-la-lamina))` por `calc(80 * var(--a-la-lamina))` y correr la orden. Sale 0. (No lo hice: QA no toca el código. Se deduce de leer `tools/qa/temas-con-piezas.ts`, líneas 350-353: `m.marco`, `m.remate` y `m.cartela` solo van a `linea`, nunca a `fallos`.)

### V3-4 — menor: en los elfos, las barras de arriba y abajo siguen oscuras y el canal caqui

Comparado con la lámina, en `afinado-elfos-1920.png`:

- la barra de arriba y la de abajo son verde azulado oscuro, y en la lámina son **plata clara** (con la luna arriba);
- el canal de los márgenes es el caqui de N1 (vuelta 2), y en la lámina es plata marfil.

Es lo que más separa este tema de su lámina. Es paleta (criterio 1, medido así a propósito) y no de las piezas: lo apunto para el juicio del criterio 9, no como fallo de esta vuelta.

### V3-5 — menor: un rótulo de sección de dos líneas aprieta su barra

En la base, «LIBRO DE ALDO DE VALDELUZ» y «TROPA DE ALDO DE VALDELUZ» no caben en una línea del panel y se parten en dos. La barra (`barra-seccion`, cortada solo a lo ancho: `0% 14% fill`) se estira a lo alto con ellas, y la línea de arriba queda pegada a la moldura de arriba de la pieza (`qa/v3/rotulo-dos-lineas-templarios-1440.png`, de `desktop-04-castillo` de `pnpm capturas`, ampliado ×3). Se lee, pero el respaldo de CSS no tenía esa moldura que pisar.

La orden del ingeniero solo mide los 7 rótulos de la aventura, que caben en una línea.

**Reproducir**: `pnpm capturas` y mirar `desktop-04-castillo.png`; o entrar al castillo con el caballero de la semilla 27 a 1440.

## Workarounds usados

- **`ponerTema` desde la página** para imperio, elfos y orkos en la partida, la base y la batalla. Es el mismo de las vueltas 1 y 2 y de la orden del ingeniero: el juego no tiene esas facciones. Templarios y no muertos van por el flujo real (`?faccion=`), y en la arena, el selector.
- **La base y la batalla con los cinco temas**: se entró por el flujo real (clic en el castillo, clic en la guardia) y se cambió el tema estando dentro. Quien juega no puede hacer eso con imperio, elfos ni orkos, pero el objetivo era ver la hoja con cada tema en esas escenas, no el flujo.
- **La semilla 7** en vez de la 42644: tiene una guardia en la fila 0 a la que se llega hoy, que es el caso adversarial que buscaba (la busqué con el espejo, `.cache/qa-v3/buscar.mts`).

Ninguno esconde un obstáculo de quien juega.

## No probado

- **Firefox y Safari**, como en las vueltas anteriores. `border-image` con `outset` puede pintar distinto.
- **dpr > 1**: todo se midió con `deviceScaleFactor: 1`. Las piezas miden 512 px de lado; a dpr 2 y 2560 de ancho, la banda de 25-40 px CSS sale de 48-86 px de la imagen, así que no debería verse borrosa, pero no lo miré.
- **El clic en una guardia bajo el remate** (en el centro): no encontré una a la que se llegue hoy en las semillas probadas. Bajo la cartela sí (arriba). Que el remate deja pasar el clic, `elementFromPoint` lo dice.
- **Windows y macOS** (letras del sistema y símbolos), como en la vuelta 2.

## Ficheros

- Capturas: `qa/v3/`.
  - `afinado-*` (lado a lado, de la orden del ingeniero), `afinado-movil-390.png`;
  - `remates-1920.png`, `banda-arriba-1920.png`, `costado-izq-1920.png`, `esquinas-abajo-izq-1920.png`, `esquinas-arriba-der-1920.png`;
  - `adv-*-mapa.png`, `adv-*-guardia.png`, `guardia-fila-0.png`;
  - `base-*-1920.png`, `base-los-cinco-1920.png`, `batalla-*-1920.png`, `batalla-los-cinco-1920.png`, `batalla-lista-1920.png`;
  - `arena-*-combate.png`, `arena-combate-los-cinco-1920.png`;
  - `ventana-*-{2560x1440,1080x1920,1920x700,800x600}.png`, `rendija-1920x700.png`;
  - `preview-*-1920.png`;
  - `capturas/` (cinco de `pnpm capturas`), `piezas-marco-mapa.png`, `rotulo-dos-lineas-templarios-1440.png`.
- Guiones (ignorados): `.cache/qa-v3/`.
