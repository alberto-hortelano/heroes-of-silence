# Hallazgos de /simplify sobre la labranza en campos (20-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia y altura), deduplicados. En cada uno va la decisión ya tomada. Las líneas son las del árbol de trabajo de cuando se revisó; buscad por nombre.

**Eficiencia, en resumen**: nada caro. `labranzaDe` cuesta ~1,3 ms por mapa, `ponerLaLabranza` ~1,1 ms, y no hay trabajo por fotograma (`esVolumen` corre en `separar`, una vez por escena). Lo que sigue se aplica por claridad, no por rendimiento.

## Se aplica

1. **El ancla y la escritura de las casas, con lo que ya hay** (`tools/taller/casas.ts`: `anclaDeCasa`, `escribirCasas`). Es la tercera copia de la regla del ancla (`derivarPieza` en `derivar.ts:351`; `anclaDe` en `escenario/modulos.ts:351`). Se escribe el webp y se mide con `derivarPieza(ruta)`, o con `anclaDe` sobre el raster escrito; `derivarPieza` devuelve `{imagen, sha256, ancho, alto, ancla}` medido sobre lo escrito. Fuera `anclaDeCasa` y el `sha256` local (está `sha256` en `poses-8d.ts:81`). `casas.json` va con la forma de `IndiceDeHoja` (`escenario/catalogo-disco.ts:37`), con `hoja` y no `fuente`, y tipado con `Modulo`.
2. **`ponerEntera`, una sola construcción y una sola pregunta** (`colocar.ts`: `ponerEntera` y la guarda nueva de `poner`). Hoy construye el sprite, comprueba `entra` y `altoLibre`, y `poner` lo vuelve a construir y a comprobar; la guarda «por nombre no se sustituye» de `poner` no se alcanza nunca. La pieza se construye una vez y, si `!obstaculos.pisa(s)` (pisar es monótono en el alto: equivale a «entra entera»), se mete. Elegid la forma más corta: un indicador «entera» en `poner` o que `ponerEntera` haga `meter` directamente. La guarda muerta y el decimoquinto parámetro posicional (`plano`) se van si dejan de hacer falta.
3. **Las tiradas que se gastan en la tierra, junto a `mata`** (`colocar.ts`, el `deHoja` que se tira en la rama sin relleno). Hoy se construye un sprite entero para gastar tiradas, y el recuento es una copia muda de lo que hacen por dentro `mata`, `poner` y `deHoja`. Un `gastarTiradasDeMata` (o como se llame) **al lado de `mata`**, que gaste exactamente las mismas tiradas sin construir nada y con un comentario que diga de qué depende. `sin-cambios.mts` tiene que seguir en 0 después.
4. **`deHoja` lanza con un nombre que la hoja no tiene** (fail-loud, `CLAUDE.md`). Hoy sortea otro módulo en silencio. Comprobad que ningún llamador de antes depende de ese sorteo (las cordilleras eligen el nombre de la propia lista). El cambio de corriente alrededor de `ponerLaLabranza` se queda salvo que `sin-cambios.mts` demuestre que sobra.
5. **El molde del dardo, de las hojas que esparce** (`colocar.ts`, `moldes`, de `APARTE.cubierta.hojas`). Sale de las hojas de `MEZCLA`, que es lo que sortea el esparcido; con las hojas de hoy da lo mismo. Con eso `casas` deja de necesitar el centinela `'todos'` en `SOLO_POR_SU_NOMBRE`, y las casas se piden por nombre con `deHoja` en vez de elegir el módulo a mano con `Math.floor(c.t * casas.length)`.
6. **Las hojas de la labranza, declaradas en un sitio** (`HOJA_DE_CASAS` en `HOJAS_DE_LA_CUBIERTA` con un ternario, `APARTE.cubierta.hojas`, `TONO` y `SOLO_POR_SU_NOMBRE`). Una sola declaración (p. ej. las hojas que pone la regla de cada suelo) de la que salgan las demás. `SOLO_POR_SU_NOMBRE` queda como un predicado de los módulos de la labranza (`MODULOS_DE_LA_LABRANZA`, de `PARCELAS` y `ATREZO`), aplicado una vez en el filtro de `modulosDe` (o donde filtre una sola lista para `deHoja` y `masEstrecho`): fuera la segunda caché `sorteables` y la doble llamada a `modulosDe` de `alAzarDe`.
7. **`plano` que no se pierde por el camino.** El tipo que recibe `esVolumen` lleva `plano` obligatorio (`plano: boolean | undefined`), para que TypeScript avise del literal que lo olvide (como pasó en `formaDeLosPasos`). En `formaDeLosPasos.mide`, sin el objeto de `conAlto` en el bucle de la bisección: mirad `s.plano` o pasad un literal mínimo.
8. **`labranza.ts`, limpieza:**
   - Las cercas, en el bucle de parcelas: `if (!mismo(0, 1)) cercas.push(i)`, sin el filtro de después (`p.escala < 1` sobra y no excluía las juntas).
   - `juntoAUnCampo`: que haga lo que dice (vecina en cruz de un campo cultivado) y los llamadores pasen solo lo suyo, o que se llame por lo que hace.
   - El bucle del atrezo con un `Record<Atrezo, number[]>`, `findIndex` + `splice`, y el tope `3 * tope + 3` con nombre.
   - `PiezaDeAtrezo.nombre` fuera (es `ATREZO[cual]`), y su test con él.
   - `deRelleno` deja de ser un cierre dentro del resultado: un dato (`ocupadas` o una máscara), para que el resultado se compare por igualdad sin el parche del test.
   - `nombreDe`, un array de W×H recorrido en orden, sin `Map` ni `sort`.
   - El corrimiento hacia dentro, un helper que usen la parcela y la junta.
   - Las vecinas: `VECINAS` de `src/core/map/regiones.ts:70` (o una constante `OCHO`), no un array nuevo por llamada; la cruz, la de algún módulo que ya la tenga si se puede importar sin ciclo.
   - `CULTIVOS` como constante; fuera el `?? null` sobrante.
   - El Fisher-Yates, uno exportado desde `escenario/esparcir.ts` (junto a `azarDe`) que usen labranza y `parches.ts:114`.
9. **`tools/taller/casas.ts`, limpieza**: `TINTES` como tuplas `[r, g, b]`; un solo recorrido de ocho vecinas (o la etiqueta por píxel de `componentes`, `empaquetar.ts:39`, devuelta opcionalmente); fuera `bytes` de `pueblosPartidos`, que no lee nadie.
10. **`colocar.ts`, menores**: `TONO_DE_LA_LABRANZA` encima del JSDoc de `BASALTO_DE_LADERA` (hoy lo deja huérfano) y con el porqué que tiene el comentario de `TONO`; `ANCHO_DE_CASA` → `ALTO_DE_CASA` (es un alto); el desplazamiento `[ox, oy]` calculado una vez en vez de tres ternarios; `PX_POR_CASILLA_DE_CASA` derivado del ancho del pueblo (1,9, hoy un literal en la tabla de anchos), con ese ancho como constante con nombre.
11. **El cambio de corriente con `try/finally`**, ya cuatro copias en `componer`: un `conCorriente(otra, fn)` local que usen las cuatro.
12. **Exportaciones que solo se usan dentro**: fuera el `export` de `PASO_DEL_CAMPO`, `PESO_DEL_CULTIVO`, `OTRA_VARIANTE`, `CAMPO_EN_BARBECHO`, `PARTE_EN_BARBECHO`, `HOJA_DE_CASAS`, `anclaDeCasa`, `soloLoMayor`, `CASAS_MIRADAS_EL` (salvo que un test los necesite).
13. **Tests** (`test/labranza.test.ts`): los módulos, de `PARCELAS`, `ATREZO` y `MODULOS_DE_LA_LABRANZA`, no `<= 8` ni `['9','10','11']` a mano; la cruz y `dentro` una vez; la entrada común del atrezo y de las casas (camino y pueblo), una constante.

## Se descarta, con motivo

- **Partir la hoja `cubierta-dirt` en `labranza` (1-11) y `cubierta-dirt` (12-16)** (altura 1). Es el arreglo de fondo, pero la hoja sale de una sola imagen generada y derivada por el taller (`tools/taller/escenario/modulos.ts`, sha256 vigilado por `test/pisable-junto-al-bosque.test.ts` y por `verify:lento`): partirla toca la cadena de derivación del arte, no solo el código. Con 5 y 6 la exclusión queda en un predicado de una línea. **Backlog**, junto con unificar en una tabla de «papel de cada módulo» `ARBOLES_DE_LA_CUBIERTA`, `FUERA_DE_LO_QUE_SE_PISA` y la de la labranza.
- **Una corriente de azar por punto o por suelo para la cubierta** (altura 5). Quitaría el «gastar tiradas» de raíz, pero cambia todas las escenas una vez y obliga a re-anclar los guardias que citan semillas y coordenadas. **Backlog.**
- **Pasar los parámetros posicionales de `poner` a un objeto de opciones** (altura 3, la parte general). **Backlog.**
- **Renumerar los campos vaciados** (simplificación 14): de poco peso y obliga a saltar tiradas con cuidado. Se queda.
- **`Promise.all` al leer los pueblos** (eficiencia 7): la orden del taller tarda 146 ms. Se queda.
- **Sorteo por pesos con `sortearPorPesos` de `core/rng.ts`** (reutilización 9): pide `Rng` y pesos enteros; el escenógrafo usa cierres `azarDe`. Se queda.
- **`ALTO_DE_PARCELA = 1`** (simplificación 18): se queda; su doc dice por qué es 1.
- **Las parcelas de la junta** (altura, menores): son el apaño previsto del damero; la respuesta de fondo es la opción C. Se queda.
