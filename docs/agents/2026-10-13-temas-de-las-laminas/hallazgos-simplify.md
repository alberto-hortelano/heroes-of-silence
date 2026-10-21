# Hallazgos de /simplify: temas como las láminas (tandas A y B)

Junta las cuatro revisiones (reutilización, simplificación, eficiencia y altitud) sin duplicados. Cada punto lleva la decisión ya tomada. Las líneas son las del worktree en el momento de la revisión.

## Se aplican

### Fichas y CSS

1. **Bloque común `:root[data-tema]`** delante de los cinco temas en `temas.css`.
   - Tiene la misma especificidad que cada tema, así que gana el orden.
   - Lleva:
     - las 19 fichas idénticas en los cinco temas (`--panel-alt`, `--ink-dim`, `--lateral-tenue`, `--boton-encima`, `--boton-primario-encima`, `--herramienta`, `--fondo-*`, `--etiqueta*`, `--fin-gana-filo`, `--galon`, `--rotulo`, `--vida-fondo`, `--letra-ui`, `--letra-encabezado`…), escritas como derivación;
     - el valor por defecto de las fichas que solo lee `forma.css`;
     - `--adorno: var(--emblema)` donde coincide.

     Cada tema escribe solo lo medido o lo que difiere. Las que coinciden en 3 o 4 temas van al común, y el tema que difiere las sobrescribe.
   - Las ~28 fichas del neutro que nadie lee sin tema (`--lateral-*`, `--dia-*`, `--lema`, `--cartela-*`, `--estandarte-*`, `--emblema`…) **salen de `style.css`** y viven en el común.
   - `temas.test.ts` pasa a exigir:
     - que «común ∪ tema» defina todas las fichas que leen las hojas;
     - que el neutro defina las que se leen sin tema;
     - que las parejas de contraste se resuelvan en cada tema a través del común.
   - `test/hojas-de-estilo.ts` funde el común con cada tema.
   - **El estilo computado no cambia en ningún tema**, ni con tema ni sin él: compruébalo con `neutro.ts` y comparando el estilo computado de los cinco temas antes y después.
2. **`--chapa-fondo: var(--panel)`**, no el hex repetido. Comprueba que `temaDelLienzo` lo lee resuelto, como ya pasa con `--chapa-tinta`.
3. **La hoja generada escribe fichas, no reglas.**
   - `piezas-de-tema.css` pone por tema solo `--pieza-<x>: url(...)` y las medidas derivadas del corte: anchos del 9-slice, `--remates-de-la-barra`…
   - `forma.css` es la dueña de todas las reglas, y las lee con `var(--pieza-x, none)` y el respaldo.
   - Desaparecen los `apaga` de TS y los guardias de selector de la hoja generada.
   - Los anchos del 9-slice de la barra y de la cartela salen de la tabla (corte × proporción) en un solo sitio.
   - Si alguna pieza no se puede apagar solo con fichas (por ejemplo, el respaldo en `box-shadow` o `clip-path`), usa el patrón que ya existe (`display: var(--respaldo, …)`) con una ficha booleana como `--con-pieza-x`, y apúntalo.
4. **`fuentes.css` generado** desde la tabla `FUENTES` de `tools/fuentes/bajar.ts`, añadiendo un `peso` por fichero. Es el mismo patrón que `piezas-de-tema.css`: un generador y un test de igualdad con el disco. Desaparecen `caras()` y los tests que reflejaban la tabla.
5. **Las letras pasan de `assets/fuentes/` a `assets/letras/`.**
   - `fuentes/` choca con la convención del taller, `<x>/fuentes/`.
   - `tools/build/publico.ts` queda con reglas generales: `(^|/)(fuentes|_guias)/` y **`^art/`**, que deja fuera del build `assets/art/` entero, 134 MB que el cliente no lee.
   - Antes de quitarlo, comprueba con grep y con `vite build` + `pnpm capturas`, que corre QA, que nada de `src/client` ni del build lee `art/`.
   - Actualiza CLAUDE.md, `publico.test.ts` y la procedencia.
6. **`grid-template-areas` en `#stage`**, en lugar de colocar celda a celda con `:has()`: `"mapa panel"` y, desde 1820 px, `"izq mapa panel der"`. Los adornos del mapa, en la misma área o con `position: absolute`.
   - Fichas `--relleno-del-escenario` y `--borde-del-mapa` en `style.css`, que leen las dos hojas con `calc()`, en lugar de 12, 7, 19, 13, 51 y −12 escritos a mano.
   - Hay que medir el lienzo de nuevo a 390, 1440, 1819, 1820 y 1920, en neutro y en los cinco temas, y debe salir igual que ahora.

### Tests y guardias

7. **Un solo analizador de CSS.**
   - `bloquesCss` (`test/hojas-de-estilo.ts`) devuelve también las declaraciones, con su línea y su selector. El guardia de colores de `invariantes.test.ts` lo usa en lugar de su bucle carácter a carácter.
   - Se exporta `COLOR` desde `hojas-de-estilo.ts`, y la expresión regular más débil de `piezas-de-tema.test.ts` se cambia por ella.
   - `hojasDelCliente()` va también en `hojas-de-estilo.ts`, y la usan `invariantes.test.ts` y `fuentes.test.ts`.
   - `HOJAS_CON_REGLAS` se deriva del disco (todas las `.css` de `src/client` menos `temas.css`), así que sobran la lista y su test.
8. **Tests que se solapan.** Se borran:
   - el de `paleta-de-las-laminas.test.ts:24-29`, que ya lo garantiza el tipo;
   - la tautología `ids == esperados` (`piezas-de-tema.test.ts:~241`), dejando el `53`;
   - lo que repite `cssDePiezas` en el test;
   - la doble comprobación de `url()` en `fuentes.test.ts`;
   - de la pareja guardia de forma (invariantes) / `piezas-de-tema.test.ts`, el que sobre tras el punto 3;
   - `LAMINA` escrito a mano.

   En `publico.test.ts`, los temas salen de `FACCIONES_DE_ARENA`.
9. **El test de la paleta tarda 1,1 s en cada verify.**
   - Mediana y percentiles por histograma de 256 cubos, sobre el `Buffer`, y luminancia calculada una vez por píxel.
   - Objetivo: ≤ 0,25 s y **las mismas cifras medidas**.
   - Arregla el comentario desfasado de `paleta.ts:10-13`: el fondo es el grupo más cercano al borde, no el más grande.
   - Fábricas `muestra(que)` y `par(rect, …)` en `MUESTRAS`.
   - `conComa` de `core/types.ts` en lugar de los suyos (`paleta.ts`, y `pct` de `encargo.ts`).
   - `esTema` de `temas.ts` para validar el nombre.

### Taller

10. **Una tabla de piezas por tema**, en lugar de `DESCRIPCIONES` + `REFERENCIAS`. Se borran el `throw` y el `toBeDefined` que comprobaban que las dos casaran.
    - Se borra el campo muerto `DefDePieza.respaldo`.
    - `Corte = NonNullable<Encargo['corte']>`.
    - Se borra la rama sin uso de `sliceDe`.
    - `svgDeGuia` busca con `DEFINICIONES[p].guia`.
    - `reglasDePiezaDeTema` sabe si es tira o marco por `guia`, no por los valores del corte.
11. **Las referencias se recortan al vuelo.**
    - `encargoSchema.referencia` admite `recorte: Rect`, y `procesar` recorta la lámina en el temporal donde ya pasa cada referencia a PNG.
    - Se borran los 53 `ref-*.png` del repo (~5 MB) y su alternativa en `SOLO_DEL_TALLER`.
    - Las 4 guías se quedan: no se derivan de la lámina.
12. **`tipo: 'interfaz'`** en el enum de `tipo` del encargo. Elige el prompt y la validación por el tipo; `despues` se queda solo como gancho.
13. **`aMano` se deriva** de `gen.hilo === 'a-mano'` dentro de `postprocesar`, sin pasarlo como parámetro.
    - `colocar` acepta cualquier encargo de la cola o de las familias conocidas, no solo piezas, si es barato. Si no, se queda para piezas y se apunta.
14. **`encolarUno(bruto, { rehacer })`** en `cola.ts` (o en el trabajador) y `soloDe(args)`, compartidos por la rama `--temas` y la `--base`.
    - `encargosDeTemas()` devuelve un tipo con `id`, sin casts.
    - Haz que `--prueba` valga para todas las familias si sale con la refactorización. No es obligatorio.

### QA y fuentes

15. **`tools/qa/neutro.ts`**:
    - `chromiumInstalado` pasa a `vite-propio.ts` junto a `arrancarVite`;
    - `esperarElSuelo` se exporta de `capturas.ts` (o se mueve allí) y se espera `esbozado`, no `pintado`, porque solo se compara el estilo computado;
    - la base se mide en la misma página que el mapa;
    - el bloque «apagar hojas + `<style>`» va una sola vez;
    - una sola constante de pseudoelementos, sin el `4` mágico;
    - `NUEVOS = ['.selector-de-la-barra', ...OCULTOS_SIN_TEMA]`.
16. **`ponerTema`** carga solo el peso normal de la letra del título, o con el texto `'−0123456789'`, en lugar de `bold`.
17. **`bajar.ts`** se salta los ficheros que ya tienen el sha256 bueno. `fuentes.test.ts` usa `sha256` de `test/helpers.ts`.

## Se descartan a conciencia

- **Medir la eliminación del fondo sin recortar en todo encargo transparente (altitud 2).** Cambia la validación de las demás familias y obliga a medir otra vez el umbral, fuera de esta tarea. `aValidar` se queda para las piezas.
- **Una ficha base por tema para la familia de los filos (simplificación 16).** Cambia los alfas de imperio y orkos, es decir, el aspecto medido.
- **Construir `temaDelLienzo` con `Object.fromEntries` (simplificación 17).** Ya se descartó en la tarea anterior porque se pierde el tipado estricto.
- **Hornear `soft-light` en la textura (eficiencia 3).** Hoy no hay texturas. Se decide mañana con las piezas reales y se apunta en implementacion.md como pendiente.
- **Quitar el ocultado de `NUEVOS` en `neutro.ts` (simplificación 13).** Solo tiene sentido después del commit. Va al backlog del cierre.
- **El tipo ráster propio de `paleta.ts` (reutilización 12), las fábricas `marco` y `figura` (simplificación 23), derivar `Fichero.local` (simplificación 26), escribir solo si cambian los bytes (reutilización 11) y el texto de guía con la vista como parámetro (altitud 13).** Ganan poco y no merecen el cambio.
- **Un módulo virtual de Vite para la hoja generada.** Se perdería el diff en git.
- **CSS anidado en `forma.css`.** Con el punto 3 la hoja generada ya no lleva reglas, y el guardia de prefijo se queda como está.
