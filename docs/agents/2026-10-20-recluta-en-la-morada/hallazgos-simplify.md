# Hallazgos de /simplify sobre la escena de la morada (20-10-2026), con la decisión tomada

Cuatro revisores (reutilizar, simplificar, eficiencia y altura) sobre el diff sin commitear.
Están deduplicados. Ninguno cambia lo que ve quien juega, salvo S9 (el nombre de Curar con su
cifra) y S11 (un solo tamaño para el motivo apagado).

## Se aplica

- **S1. Una escena de figuras de pie, no dos copias.** `EscenaMorada` es `EscenaTropa` con los
  nombres cambiados. Comparten:
  - el estado `lienzo` y `señalada`;
  - los métodos `encuadrar`, `salir`, `bajo`, `mover` (el texto del estado y la ayuda) y `pulsar`
    (elegir más el estado);
  - el recorte de `señalada` en `dibujar`.

  → Una `EscenaDePie<V>` junto a `render/de-pie.ts`, configurada con la vista, el encuadre y las
  cajas, `elegir` y las frases. Tropa y morada quedan como dos configuraciones.
  - Las constantes de encuadre copiadas de `render/tropa/arco.ts` también van a `de-pie.ts`:
    `MARGEN`, `AL_PIE`, `UNA`, `LIBRE_DEBAJO`, `HORIZONTE_EN_*` y `SEPARACION.minima`.
- **S2. `main.ts` con una tabla, no con ramas paralelas.** Hoy cada escena tiene su propia copia
  de:
  - la bandera `enX`, el dibujo y la marca `dataset.X`;
  - los punteros (move, up, leave);
  - `cerrarX` y Escape;
  - y el ternario `escenaPintada === 'tropa' ? 'adventure' : 'town'`.

  → Una tabla de escenas de dentro: la escena, su `EscenaDePie`, su marca en el lienzo y su
  cerrar, que es el de la sesión. Un solo `cerrarDentro()` y un Escape que recorre la tabla,
  manteniendo que un Escape cierra solo la morada y no la base.
  - El scroll del lateral guarda la escena de la que se vino (`escenaDeAntes`, junto a
    `lateralDeAntes`) en vez de deducirla.
  - En `style.css`, los tres selectores que listan `town`, `tropa` y `morada` pasan a un
    `:is(...)`, y con eso basta.
- **S3. La sesión, con un solo interruptor.**
  - Fuera los `moradaAbierta = null` de `openTown`, `closeTown` y `cerrarLaMorada`: `scene` manda,
    como en la tropa.
  - La clave de la caché de `vistaDeLaMorada` queda en `version` más la morada abierta.
  - La comprobación «esa unidad no es de esta morada» y «aquí no hay morada» se hace en un solo
    sitio: `componerVistaDeLaMorada` o `moradaEn`. La sesión la dispara pidiendo la vista.
- **S4. Un hecho, un sitio: la fila del interior.** `HONDO_DE_LA_FILA` y lo que comparten la
  guía del taller y el cliente (`FILA_DE_LOS_PIES`, `FONDO_DEL_SUELO` y lo que haga falta) van a
  `src/shared/base.ts`, junto a `TRAMO` e `InteriorEnElIndice`.
  - Se quitan la copia `HONDO_DE_LA_FILA_EN_LA_GUIA`, el alias `PX_POR_PASO_DEL_INTERIOR` y el
    test que solo comprobaba que las dos fueran iguales.
  - `test/morada.test.ts` ya no importa `tools/taller/` (cargaba `sharp` y medio taller).
  - Un `INDICE_VACIO` compartido sustituye al literal repetido en `render/base/arte.ts` y en
    `recorte-base.ts`.
- **S5. «Qué morada hay en este sitio» es del núcleo.** `moradaEn` pasa de `morada/vista.ts` a
  `src/core/town/sitios.ts`, junto a `construidoEn`, con su motivo.
  - La usan la vista, la sesión, `castillo.abiertoAlLlegar` y `views/base.ts`, en vez de las
    cuatro maneras de preguntarlo.
  - Es una lectura pura y el banco no cambia.
- **S6. El suelo del interior, sin el sesgo de la plaza.** `sueloDelInterior` toma la mediana de
  `lineaDelPie`, que por diseño solo yerra hacia abajo porque la plaza repinta su suelo. Así mide
  +5 y el test tuvo que aflojarse a 0..+8.
  - → Usar el corte por filas de todo el cuadro que `lineaDelPie` ya calcula dentro
    (`todo = corte(filas, …)`), sacado a una función.
  - Volver a una tolerancia simétrica en el test: ±4, o la que se mida, dicha.
- **S7. Una sola geometría en QA.** `EscenaMorada` llama a `interiorDe` (el cargador), y
  `capturas.ts` vuelve a leer `indice.json` y encuadra por su cuenta. Con el primer interior
  indexado, el clic del espejo en Node y el de la página saldrían de encuadres distintos.
  - → Inyectar en la escena de dónde sale el interior, con `interiorDe` por defecto. `capturas`
    le pasa su lector del índice.
  - Volver a correr la pasada `morada` ahora que hay interiores reales.
- **S8. Los `Pintado*` heredan de `PintadoDePie`** (`extends`). En la morada:
  - el interior va una sola vez, en el `cuadro` del encuadre o solo `interior`, no los dos
    nulables a la vez;
  - fuera el `export type { FiguraEnLaEscena }` muerto de `render/tropa/pintar.ts`.
- **S9. El nombre de un poder de cura, con su cifra.** `morada/vista.ts:149` usa
  `poder(p).nombre` y sale «Curar» sin cifra: lo que arregló el M3 de la arena con
  `nombreDeHabilidad` («Curar (4 PV)»).
  - → Llevar esa lógica junto a `esDeCura`, en `core/battle/poderes.ts`, y que la llamen la arena
    y la morada. `core/arena` está vallado y no se puede importar desde la morada.
- **S10. `encolarConSolo` en `trabajador.ts`.** `--interiores` copia `--base` (el `--solo=`, el
  error de id desconocido, `preparar` y el bucle de olvidar, «ya está» y encolar), y `--tablillas`
  repite el `--solo`. Los tres pasan a una función.
- **S11. Un solo `.motivo-apagado`**, sin acotar, a 0,8em: hoy sale a 0,75 en la tropa y a 0,85
  en la morada con el mismo ayudante. Comprobarlo con `tools/qa/neutro.ts HEAD`; si cambia algo
  sin tema, decirlo.
- **S12. Lo que `interiores.ts` copia de `base.ts`.**
  - La primera mitad de `PALETA` va exportada como prefijo común.
  - El gris de identidad (`#c8c8c8`, escrito a mano en `base.ts:447` y `:474`) pasa a una
    constante.
  - La ruta del recorte pasa a `recorteDelJuego(f, id)` junto a `tramoDelJuego`, y la usan
    `interiores.ts` y `recorte-base.ts:935`.
- **S13. `capturas.ts`: la morada con los ayudantes de la tropa.**
  - `cotaDeLaFila` se une a `cotaDelEncuadre`: recibe la lista de cajas.
  - `entrarEnLaMorada` usa `mismaBarra` con el prefijo como parámetro.
  - `pulsarEnLaMorada` usa la secuencia de `pulsarEnLaTropa`.
- **S14. `derivarInterior` no repite lo que no cambió.** Si el sha256 de la fuente es el de la
  entrada del índice, se reutiliza la entrada sin medir ni codificar: hoy cada encargo que llega
  vuelve a derivar todos los interiores. Si el índice no guarda el sha de la fuente, se añade.
- **S15. El interior, decodificado antes de darlo por listo.** Se hace `await img.decode()` antes
  de `interiores.set(...)` en `render/base/arte.ts`. Así, el primer `drawImage` de 1536×1024 no
  decodifica dentro de un fotograma.

## Se descarta, con motivo

- **`edificio()` lanza en un sitio de morada** (`views/base.ts:60-64`). Se queda. Es fail-loud y
  hoy no se alcanza, y con S5 hay una sola pregunta de si es morada. Si se alcanzara sería un
  fallo nuestro, y debe verse.
- **Precargar el interior al echar a andar hacia la puerta.** Queda para después, si el usuario ve
  el salto del respaldo al interior. Con S15 el salto es de un fotograma.
- **Soltar los interiores al salir** (~6 MB cada uno, 25 MB con los cuatro). Son pocos, y una
  vuelta a la morada los necesita otra vez.
- **Pedir solo el índice si se entra sin pasar por la base.** Hoy no se puede entrar sin pasar por
  ella.
- **Paralelizar las identidades, el pool de interiores con los recortes y los 4 contextos de la
  pasada `morada`.** La máquina es compartida y las capturas van en serie a propósito. Lo que
  ahorra es poco.
- **Abaratar `test/interiores.test.ts` y las sesiones de `test/morada.test.ts`.** Cuestan menos de
  un segundo en total. Se miran solo si `verify` se resiente.
- **Los `throw` de «no produce ninguna unidad» y `n < 1`.** Con S3 queda uno, el de la vista. El
  `n < 1` de `encuadrarLaMorada` se queda como guardia de una función pura.

## Del piloto de arte (Codex, 20-10-2026): se aplica

Los cuatro interiores están en `assets/bases/templarios/fuentes/interior-*.webp` y se ven bien.
De los cuatro, solo la forja entró en el índice (suelo 561). Al rederivar, el resto dio:

| Interior | Suelo medido | Suelo a ojo | Resultado |
|---|---|---|---|
| Pueblo | 613 | ~600 | rechazado (+50) |
| Monasterio | 624 | ~620 | rechazado (+61) |
| Establos | 870 | ~490 | rechazado: **mide mal** |

Los establos tienen suelo de tierra con paja y muro de madera, y la medida no los distingue.

- **A1. La medida no falla en los establos.** S6, el corte de filas del cuadro entero, debería
  arreglarlo; si no, buscar otra señal (el cambio de textura o de luz entre pared y suelo).
  Comprobarlo con los cuatro reales: los cuatro tienen que salir a menos de ~15 px de lo que se ve
  a ojo (los de arriba).
- **A2. No se rechaza un interior porque Codex pintó el suelo más bajo que la guía.** La fila de
  figuras ya se apoya en el suelo medido. Mientras el suelo caiga en una franja razonable (p. ej.,
  del 40 % al 75 % del alto del cuadro), se indexa con su medida y se avisa del desvío. El
  respaldo solo entra si el suelo queda fuera de esa franja o no se puede medir. Hay que ajustar
  el test y el guardia del suelo en 700 (que siga mordiendo con lo que quede fuera de la franja).
- **A3. Rederivar** (`pnpm taller recortar-base templarios`) para que entren los cuatro, y mirar
  con las capturas de la pasada `morada` de templarios que las figuras pisan el suelo de cada
  interior en escritorio y en el móvil.
