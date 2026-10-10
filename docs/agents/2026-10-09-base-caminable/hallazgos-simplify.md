# Hallazgos de /simplify: decididos

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el cambio sin
commitear. Están deduplicados y cada uno lleva su decisión. Rutas desde la raíz del repo.

## Se aplican

### Restos de vueltas anteriores
1. **`escenas/castillo.ts` `Marcha`/`enElCamino`/`largo`**: el camino siempre tiene dos puntos.
   - Pasar a `porElCamino` de `anim.ts`, exportando `largoDe`, o a un `lerp` desde→hasta.
   - Quitar el bucle y los `as Plano`.
2. **El papel `contigua`** de `tools/taller/encargo.ts` no lo usa nadie.
   - Quitarlo de `PAPELES` y del `z.enum`; el enum se deriva de `Object.keys(PAPELES)`.
   - Retocar el comentario de `test/base-arte.test.ts`.
3. **Comentarios** que ya no son ciertos:
   - `shared/base.ts` y `vista-base.ts` dicen que `vista-base` y `capturas` leen `planoDelCuadro`;
   - `arte.ts:11-13`, sobre la costura de los dos primeros tramos;
   - el bloque `aspect-ratio` de `style.css`, que habla de la vuelta 2.
   - `capturas.ts` `laFachada` pasa a llamarse `laPuerta`.
4. **`vista-base.ts`**: la carpeta (`docs/agents/...`) y el prefijo `v3c` pasan a ser argumentos, con `.cache/vista-base/` por defecto.

### Un hecho, un sitio
5. **`sitioDeEdificio`** (`core/town/sitios.ts`) sustituye las cuatro búsquedas `SITIOS.find(...cadena.includes(id))` de `taller/base.ts` (193, 252, 352) y `recorte-base.ts:554`.
   - **`maestroDelTramo`** sustituye a `recorte-base.ts:865` y `vista-base.ts:229`, quitando el `?? 'hall'`.
   - **`sitiosDelTramo`** sustituye a `vista-base.ts:245`.
6. **`construidoEn`** en `views/base.ts:85` (y 440, si es otra).
7. **`cajaDelEdificio(t, d, e, arte)`** en `render/base/recortes.ts`, para la elección recorte/bloque que hoy está en `golpe.ts` y en `pintar.ts`.
   - Quitar el `drawImage` duplicado del if/else de `pintar.ts`.
8. **La caja de la figura, una sola función**:
   - Sacar de `render/batalla.ts` `cajaDeFiguraEn` y `dentroDeLaFigura`, que usan la batalla y `golpe.ts`.
   - Se quitan así el `0.42` y la holgura escritos a mano.
9. **Qué sitio abre «Ampliar»**: `abreAmpliar(sitio)` en `core/town/sitios.ts`.
   - Lo leen `castillo.ts` (281, 307) y el comentario de `views/base.ts`.
10. **`Vecino`**: lleva su `clave` de `data/bases`, para que `escena.ts:100` no tenga que deshacer el prefijo `vecino-`.
11. **El cuerpo civil se decide en un sitio**: `vistaDeLaBase` pone el cuerpo que se pinta.
    - Se quita `PersonaEnLaBase.cuerpo`, que nadie lee, y también `VistaDeLaBase.nombre` y `caminante.esHeroe`.
    - `civil` entra como un juego más en `JUEGO_DEL_CUERPO` en lugar del `|| id === CUERPO_DE_VECINO`.
    - El color del caminante: la sesión da `owner` y la escena pone `playerColor`, así la sesión no importa de `render/`.
12. **La moral de la taberna** (`views/base.ts:95`) se lee del dato (`moraleBonus` de `data/buildings.json`) y deja de estar escrita a mano.
13. **`heroeEnLaBase(state, player, town)` en core**, que leen `session.ts` y `serializeTownVoices`.
14. **Constantes de la escala, a `shared/arte.ts`**: `MARGEN_ABAJO`, `ALTO_DE_FILA` y `BOARD_HEIGHT`, junto a `COMPRESION_SUELO`.
    - Las importa `proyeccion.ts`.
    - `FONDO_DE_LA_FRANJA` se deriva como la mitad del fondo del combate.
    - El test que comparaba los dos valores se borra o se simplifica.
15. **`Plano` y `MIRADAS`/`Mirada`**: los define `shared` y los reexportan `proyeccion.ts` y `direccion.ts`, así desaparece el cast `as Direccion`.
16. **El tipo del índice del arte** (`IndiceDeLaBase` / `RecorteEnElIndice`) pasa a `shared/base.ts` y lo importan el cliente (`arte.ts`) y el taller.
17. **`bajarDe(d, tramo)`** exportado de `shared/base.ts`, que leen `planoDelCuadro` y `filaDeLasPuertas`.
    - **`pieDelTramo`** en `derivarTramo` y `empedradoDe`.
18. **Taller**:
    - `faccionDe(arg)` con `FACTION_IDS`, en lugar de los cuatro `knight|necromancer` y las regex.
    - `medir-base` toma sus tramos de `disposicionDe(f).tramos`.
    - `satisfies Record<FactionId, …>` en los imports JSON de `shared/base.ts`.
    - `mejorasDe(f)` como generador `{sitio, id, antes}`, con `edificioDeAntes` dentro.
    - `escribirFuentesDeLaBase` y `escribir()` se unifican con un parámetro.
    - `CRUDOS` se importa de `codex.ts` (`IMAGENES`).
    - `sha256` de `poses-8d.ts`.
    - Se exporta `APARTE` y se usa en `vista-base.ts:277`.
    - Fuera `escapar`.
    - `alLienzo(tramo, punto)` en `vista-base`, para las cuatro cuentas iguales.
    - Se quitan los restos de `vista-base`: `raya` dos veces, la composición repetida, el `H` sombreado y el envoltorio `placa`.
    - `Canal` y `Rgb` pasan a ser un solo tipo, y `rgbaDe` sustituye a los dos bucles.
    - Fuera el `Math.min` que sobra.
    - `juntasDelTramo` se calcula una vez.
    - `edificiosConArte` se deriva de `SITIOS`/cadena y `DESCRIPCION_DEL_CABALLERO` se queda solo con lo que lee algún encargo.
19. **`postprocesar` (`trabajador.ts`)** deja de mirar la ruta.
    - El `Encargo` declara lo que pide: tamaño `TRAMO` y `despues: 'recortar-base'`.
    - Se quita el `encargo.fondo !== 'opaco'` defensivo si no tiene causa.
20. **`hashDeTexto` exportado de `core/rng.ts`**, que usa `voces.ts`. Las otras tres copias están fuera del diff y no se tocan.
21. **`mediana`**: la exporta `shared/base.ts`. Las copias del taller (`derivar`, `evaluar`, `empaquetar`) están fuera del diff y no se tocan.
22. **Estado derivable**:
    - fuera `SitioEnLaPlaza.x` (es `umbral.en.x`);
    - fuera el parámetro `_d` y el alias de `camaraDeLaBase`;
    - el elemento edificio de `escena.ts` guarda solo `sitio`;
    - `señalado` pasa a ser `Exclude<Golpe, {tipo:'suelo'}>`;
    - `'rgb(0, 0, 0)'` pasa a la constante `CIELO_SIN_ARTE`.
23. **Exports sin uso fuera de su fichero**: se les quita el `export`. La lista está en el informe de simplificación: `taller/base.ts`, `recorte-base.ts`, `shared/base.ts` (`MIRADAS` según el 15), `FUERA_MAXIMO` y `PUERTA_LEJOS_DE_LA_RAYA`.
24. **`direccionHacia`** en lugar de `direccionEnPantalla` con un vector del plano (`castillo.ts:79`, `:323`).
    - Cambia el sector de las diagonales y lo alinea con el combate.
    - Es la regla de la batalla, así que se aplica.
25. **`capturas.ts`**:
    - Se exporta `AL_LADO` (o `dondeHablarCon`) y los destinos se escriben con `FONDO_DE_LA_FRANJA`.
    - Los tipos `ReturnType<…>` se cambian por `Disposicion` y `Tablero` importados.
26. **`cajaQuieta`**:
    - Se reserva el tamaño de los iconos de recursos en `style.css` (ancho y alto fijos), de modo que la barra no crece y vuelve `caja()`.
    - Fuera los `sleep(120)` y `sleep(150)`: se espera a que `data-base` cambie.

### Eficiencia
27. **El fondo se cachea por fotograma** (`pintar.ts`):
    - Un lienzo fuera de pantalla con la clave (camaraX, tamaño, arte, edificios, señalado).
    - Así se cubren el patrón, la `DOMMatrix`, los degradados y las cadenas de cielo por fotograma.
    - El resaltado se hornea en él: nada de `drop-shadow` por fotograma.
28. **`base()` se resuelve una vez por `dibujar`** y se pasa hacia abajo. `main.ts` lee `castillo.marca` una vez por fotograma.
29. **La carga del arte va en un solo `Promise.all`.**
    - Los recortes se piden según `vista.edificios`; el resto, al construirse, avisando con `tandaDeArte`.
    - Las máscaras se hacen perezosas: en el primer golpe.
30. **Lo derivable se hornea en el taller**: el solape fundido en `tramo-<n>.webp` y el color del cielo en `indice.json`.
    - El cliente deja de crear lienzos en la carga.
    - Hay que rederivar con `recortar-base`; el arte aprobado no cambia de aspecto, se comprueba con `vista-base`.
31. **Taller**:
    - memoizar la decodificación por fichero (`pieDe` recibe lo ya decodificado);
    - `Promise.all` con un límite de 4 en los bucles de tramos y recortes;
    - memoizar `siluetaDelAdulto`.
32. **Tests**:
    - `base-arte` deriva los tramos con `segunPrisa` (uno en `verify`, todos en `verify:lento`);
    - el suelo, con `itLento`;
    - `indiceDe` se memoiza.

## Se descartan, con motivo
- **Las puertas medidas a mano en `data/bases/knight.json`** (altitud 19): derivarlas exige un marcador en la guía y volver a pedir los maestros. Su coste es alto, ya están acotadas por `leerDisposicion` y el arte está aprobado. Queda anotado para el nigromante.
- **Las heurísticas del pie de `recorte-base.ts`** (altitud 20): son herramienta de taller, ya están anclables a la fila de las puertas y sus tests muerden. No se tocan sin un cuadro nuevo que las rompa.
- **Que la firma de voces la guarde el núcleo cuando falla la petición** (altitud 9): con `ponerVoces([])` se borrarían las líneas anteriores y no queremos esa semántica. Se queda el mapa del director, calculando la firma una sola vez (eficiencia 14).
- **El `desenfocar` de `escalon.ts`** (reutilización 10): trabaja en `Float32Array`, y los tests del recorte miden al píxel y los sha256 del arte derivado cambiarían. No compensa.
- **`copiaReducida` para los `drawImage` grandes** (reutilización 13): queda cubierto por el fondo cacheado (27).
- **`soltar` el arte al salir de la base** (eficiencia 12): se acepta como caché para volver a entrar.
- **`ANCHO_DEL_COMBATE_EN_MOVIL` frente al `860px` del CSS** (altitud 11): ya lo ata un test.
- **`aspect-ratio: 20/11`** (altitud 21): es razonable tal cual.
- **El O(n²) de `vozDe`** (eficiencia 13): despreciable.
- **El parámetro `conFrases` de voces y renombrar `escenas/castillo.ts`**: son de nombres o menores, y harían ruido en la fusión.
