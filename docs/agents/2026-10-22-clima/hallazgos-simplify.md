# Hallazgos de /simplify sobre el clima (22-10-2026), decididos por el coordinador

Alcance: `git diff e9a3c595..HEAD`. Cuatro revisores: reutilización (R), simplificación (S),
eficiencia (E) y altitud (A). Abajo, deduplicados y con la decisión tomada. **Se aplica todo lo
de «Aplicar»**, en commits nuevos sobre la rama. Las líneas citadas son de HEAD = `e78750fd`.

## Aplicar

### 1. La escena lateral se enchufa en la escena, no en `main.ts` (A2, S5)
- Hoy la base y la morada pintan el clima desde `dibujarFotograma`. Lo hacen con un cierre
  `climaDeLaBase`, un `if (escena === 'morada')` y un getter `lucesDeNoche` que se rellena como
  efecto de `dibujar`.
- Todo el clima va encima de las figuras.
- El cambio:
  - `pintarBase` (o un pintor común de escena lateral) recibe `clima: ClimaDelSitio`;
  - pinta la pasada de suelo (velo, niebla, noche) entre los edificios y las figuras, y la del
    aire (lluvia, rayo) al final, como `drawBatalla`;
  - las luces las calcula ella, en local y solo si es de noche (E9).
- Se van el campo, el getter, el cierre y la rama de `main.ts`.
- Una escena del mapa vivo solo pasa su `ClimaDelSitio`. Dilo en la cabecera de
  `render/clima/clima.ts`.

### 2. Un solo pintor con la receta de cada región (A1, S10, A10)
- Hoy `pintarClimaDelMapa` es una segunda implementación:
  - los bancos llevan siempre el color de `niebla`;
  - la lluvia del mapa elige su receta por el nombre `'tormenta'`, así que una región con lluvia se
    pinta con la densidad de la tormenta si otra región la tiene.
- El cambio: el mapa y la escena son el mismo código. La entrada es «qué `ClimaDelSitio` hay bajo
  este píxel» (en una escena sin regiones, una constante), y se recorren las recetas a la vista con
  una máscara por receta.
- El color de los bancos se fija en `bancosDe`: fuera el parámetro y la mitad de la clave.
- `cieloDe` entra en la tabla, con campos `cielo` y `cieloDeNoche` en `Receta`.
- Un clima nuevo tiene que ser de verdad una fila más.

### 3. El sitio y la región de un clima, en un solo lugar del núcleo (S1, A3, R1, R7)
- `regionDelSitio(map, p)` en `core/state/clima.ts`, que usan `tiempoDelSitio`, `pedirClima` y el
  servidor.
- El sitio de una batalla es **`lugarDelRival`** (`game.ts:2477`), no una copia: fuera
  `sitioDeLaBatalla`, o que sea una línea sobre él.
- `climaDeLaBatalla(state, clima, pending)` en el núcleo, que usan `Session` y `vista-espectador`.
- `VistaBatalla` lleva **solo `region`**: fuera `tiempo`. El espectador saca el clima con la misma
  fórmula que la partida.

### 4. La caducidad de un pedido, una sola lectura (S3, R6)
- `pedidoVigente` exportado y única lectura de `state.climaPedido`.
- La usan `climaDeLaPartida`, `pedirClima` y `climaALaVista` (`serialize.ts`).

### 5. La noche desde el núcleo, barata y por casilla (A4, R9)
- `climaEn(state, p)` (o `esDeNocheEn` por casilla) calcula **solo esa región**.
- El dueño se lee con `regionOwner`/`dueñoComun`, sin `territorio` entero ni `conexion`.
- La facción, de `playerById(...).faction`.
- Se queda aunque hoy solo lo lea el test: es para el mapa vivo (decisión del usuario).

### 6. Las cachés
- **El espectador no acierta ninguna (E1)**. `adaptarEscena` crea un `map` nuevo con cada
  fotograma.
  - La clave pasa a ser `map.terrain` (estable) más la semilla, o `regions`.
  - `climaQueSeVe` se memoriza por `vista`.
- **Las cadenas del núcleo** (`generales`, `regionales`, `noches`) son `Map` de módulo sin tope
  (A5, E12). Se limpian al cambiar de semilla, o van con tope.
- **`Session.clima`** se rehace con cada `version` (E6, S4). La clave pasa a ser lo que cambia el
  clima: el día, `climaPedido`, la firma de los dueños y lo forzado.
- **`Session` del sitio de la batalla**, memorizado por `pendingBattle` (E7).
- **El servidor** (`construirVista` y `serializeAdventureTurn`) memoriza el clima por la misma clave
  (E11).
- **La caché de los fuegos** no tiene tope (E10) y va a `CacheDeLienzos` (`render/copias.ts`). La
  LRU hecha a mano de `bancosDe`, también (R5).

### 7. Rendimiento de la base y de la batalla (E2, E3, E4, E5, E8, A9)
- **El velo de color liso**, sin niebla ni luces, es un `fillRect` directo, sin capa.
- **De noche con fuegos**, la capa se guarda y se rehace solo si cambia algo.
- **La lluvia en píxeles de dispositivo**: `setTransform(1,0,0,1,0,0)`, `lineWidth` 1 real y
  alineada en dispositivo. Con un tope de gotas en pantallas enormes.
- **La batalla**: el velo liso se hornea en el `fondo` que ya se guarda en caché por `tiempo|noche`.
  Por fotograma solo van los bancos que se mueven.
- **El mapa**:
  - si toda la lluvia a la vista tiene la misma receta, o llueve en todo el mapa, `dentro = null`;
  - si no, un `Uint8Array` hecho en `hacerMascaras` y leído con aritmética;
  - el bucle de los fuegos se salta si no es de noche en ninguna región.
- **Después se mide otra vez la base** con `tools/qa/clima.ts`. Si la lluvia o la tormenta aún
  pierden más de un 10 % en 2560×1440, la capa del aire va a su resolución reducida y se compone
  una vez. Se dice en `implementacion.md` con la tabla y la fecha.

### 8. `prefers-reduced-motion` dentro de la pieza (S6, A7)
- `render/clima/` llama a `movimientoReducido()` por dentro.
- Fuera `quieto` de `ClimaDeEscena` y `ClimaDelMapa`, y los tres imports.

### 9. `?clima=` en las páginas (S4, S7, S8, A8, R11)
- Un ayudante de cliente, `climaDeLaURL(params)`, devuelve `{ forzado, aviso }`, con la frase del
  aviso una vez.
- **Validar contra el mapa** va separado de `forzarClima` (`validarForzado(forzado, map)`) y se llama
  al fijar lo forzado:
  - en `Session`, por constructor o por un método que valida en el acto, sin `void abierta.clima`;
  - en el espectador, al llegar la primera vista, sin escribir estado global mientras pinta.
- `SesionDeArena`: el clima va al constructor.
- `mensaje(err)` compartido si cabe sin salir del diff. Si no, se deja.

### 10. El director cuenta el clima una vez (S9)
- Los rechazos van solo a `problems`.
- `notaClima` lleva solo lo aceptado y se usa una vez para la nota y el veredicto.

### 11. Reutilizar lo que ya hay (R2, R3, R4, R5, R8, R12 en parte)
- **El ruido del frente y de las texturas**: `ruidoDe`, `fbm` y `desvio` de
  `render/escenario/fronteras.ts`. La variante que da la vuelta, como parámetro.
- **Los hashes**: `hash01` y `hashDe` salen de `hashDeTexto` y de `mezclar` (`fronteras.ts`).
- **`regionDelClima`**: con la BFS de `cercanaDe` (`regiones.ts`) y `vecindad(W, H)`.
- **Los lienzos**: `lienzoCon` (`escenario/pintar.ts`). El desenfoque por cajas se comparte con
  `escalon.ts` si sale limpio.
- **La forma de un id de región**: `esIdDeMapa` en `core/validar.ts`, que leen el contrato y
  `parseClima`.
- **En `tools/qa/clima.ts`**: `mediana` de `estadistica.ts` y `FONDO_INEXPLORADO` de `minimapa.ts`.

### 12. Limpieza (S2, S11, S12, A10)
- `ClimaDeLaPartida.dia` fuera, si nadie que pinte lo lee.
- `PedidoDeClima extends ClimaForzadoDelSitio`. `parseClima` sin el tipo repetido en línea.
- Fuera las exportaciones sin uso: `ESCALA_DEL_AIRE`, `DURACION_DEL_RAYO`, `PX_DE_LA_MASCARA`,
  `LADO_DE_LA_NIEBLA`, `encima` de `recetas.ts`.
- **Los nombres**: `ControlDeBatalla.tiempo` y los demás `tiempo` que son un `ClimaDelSitio` pasan
  a `clima` (o `climaDelSitio`). `tiempo` queda para el tipo `Tiempo` y para el reloj.
- `tools/qa/verify-agent.ts:520-530`: el comentario de `exigeElEscudo` vuelve con su función.

### 13. Las capturas fuerzan el despejado en un solo sitio (A6)
- Hoy se fuerza URL a URL y se escapan el menú y el espectador.
- Se decide una vez, por contexto o por opción de `abrir`, o la medida deja de depender de lo que
  se anima.
- Que la pasada «arranque» y el espectador de `pnpm capturas` no fallen por la lluvia.

## Del coordinador, al mirar las capturas (antes de QA)
- **La noche no se lee como noche.** En `mapa-noche-entero.png` y `base-noche.png` parece una bruma
  gris o un día nublado. El criterio 1 pide que la escena se oscurezca y se enciendan luces.
  - Tiene que verse azul oscura, con el contraste justo para jugar.
  - Los fuegos de las ciudades y las puertas, o ventanas, de la base tienen que verse encendidos.
  - De noche no debe salir niebla de más, salvo que el tiempo sea niebla.
- **El frente de la niebla en `mapa-mezcla.png`** tiene un borde recto vertical a la izquierda
  (x≈90) y otro arriba. Comprueba si es el frente o el marco. Si es el frente, que ondule como dice
  el criterio 3.

## Descartado a conciencia
- **El clima de la base en un `<canvas>` superpuesto a densidad 1 (E2, opción grande)**. La crítica
  pide no poner DOM encima, y además rompería el orden suelo y aire de la base que pide el
  punto 1. Se prueba antes lo barato del punto 7.
- **Sacar a un módulo común las utilidades de Playwright y el agente de prueba por WebSocket**
  (`capturas.ts`, `temas-con-piezas.ts`; R12). Cae fuera del diff: va al backlog.
- **`validarClima` con `objetoCon` y `entero` de `validar.ts` en versión que acumula (R10)**. No
  existe la variante que acumula, y hacerla toca otros validadores. Si `entero` encaja sin más,
  úsese.
- **Recortar los modos de `tools/qa/clima.ts`** (`SOLO_RAYO`…; S12). Es una herramienta de medida,
  y los modos abaratan repetir una parte. Que su cabecera los diga.
