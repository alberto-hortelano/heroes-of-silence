**REENCUADRADA** (en pequeño). El problema es real y la tarea lo ataca bien. Hay que corregir cuatro cosas del texto: el mapa no admite una capa del clima puesta encima de todo; `Math.random` está prohibido también en las partículas; el taller no tiene día; y el «mapa vivo» cuenta con que esta sesión haga el día y la noche.

## El problema real

El mundo se ve siempre igual, bajo la misma luz de atardecer. La petición pide ambiente, no reglas, y la tarea (efectos de presentación encima de lo que ya se pinta) ataca justo eso.

## La premisa, afirmación por afirmación

- **«El suelo lo pinta un Worker una vez por partida»**: es cierto, y tiene una consecuencia. El clima cambia por día, así que **nada del clima puede ir en el suelo pintado**: ni charcos ni suelo mojado. Repintar el suelo cuesta unos 5 s por superficie (`CLAUDE.md`, «Mapa de aventura»). La niebla baja que ya existe está horneada en el suelo (`colocar.ts:7038-7073`, `pintar.ts:836-850`) y es fija.
- **«Los volúmenes se pintan en cada fotograma con un presupuesto»**: cierto. `principal.preparar` recibe presupuesto **solo en el mapa** (`main.ts:352-357`). La batalla, la base y la morada pintan siempre a densidad plena. «El clima baja su densidad en 4K» vale de serie en el mapa, si el clima se pinta en el mismo lienzo. En la batalla y la base no hay nada que lo baje.
- **«Una pieza que se enchufa en cualquier escena lateral»**: viable. Todas las escenas pintan en el mismo `ctx` desde `dibujarFotograma` (`main.ts:359-373`). La morada y la tropa son escenas de pie (`DENTRO`, `main.ts:210-219`). Hay otros dos bucles aparte: la arena (`arena/main.ts:1821`) y el espectador (`espectador/main.ts:184`).
- **El mapa no se deja tapar desde fuera**: `drawMapa` pinta en este orden (`mapa.ts:416-449`): volúmenes, identificadores, niebla de guerra y, encima de ella, los grupos que se ven sin explorar, la ruta y la casilla señalada. Si el clima va encima de todo, una niebla clara sobre lo inexplorado (`#080a10`, `mapa.ts:1235-1239`) lo deja gris. Eso es justo lo que el criterio 3 prohíbe, y gris es como se lee hoy «lo que no se mira» (`rgba(8,13,22,0.42)`). Así que en el mapa la pieza se llama **dentro** de `drawMapa`, por debajo de la niebla de guerra. En el resto de escenas sí puede ir encima.
- **«Bucle de animación»**: no hay uno perpetuo. Se pide fotograma solo mientras algo se mueve (`main.ts:251-262`). Con el arte cargado, `hayFigurasAnimadas` ya da `true` siempre (`figura.ts:53-55`, `assets.ts:143`), así que el clima no añade fotogramas. Sin arte, la puerta para pedir más es `animarHasta` (`figura.ts:44`), como dice el propio comentario: no abrir un segundo mecanismo al lado.
- **«Ni un `Math.random` que decida qué tiempo hace»**: el texto se queda corto. El guardia prohíbe `Math.random` en todo el cliente (`invariantes.test.ts:677-680`). Las partículas también tienen que salir de un hash o de `createRng`, como el compás de las figuras (`compas.ts:7`).
- **«La semilla y el día llegan a cada pantalla»**:
  - **Partida**: `GameState.seed` y `GameState.day` (`core/state/game.ts:251-253`).
  - **Espectador**: tiene `vista.seed` (`espectador/main.ts:255`) y `snapshot.day` (`:464`). Puede derivar el tiempo sin tocar el cable, igual que ya hace con la escena (`escenarioListo(…, vista.seed)`).
  - **Arena**: no tiene día. Lo de «despejado salvo `?clima=`» encaja.
  - **Taller**: `pnpm taller escenario` compone con la semilla y saca una página y un PNG quietos, sin día ni animación (`tools/taller/escenario/escenario.ts:129-135`). «El mismo tiempo en el taller» no tiene sujeto.
- **`?clima=` en la línea de `?seed=`**: cabe. `aLaBarra` conserva el resto de la query (`semilla.ts:22`), así que el menú no la pierde. `hayQuePreguntar` no la mira (`semilla.ts:33-37`): con solo `?clima=`, la página pregunta antes de jugar. Es razonable, pero hay que decirlo.
- **`prefers-reduced-motion`**: hoy solo lo lee `rueda.css:447`. En el lienzo no lo lee nadie, así que esto es nuevo.
- **«Sin arte de pago»**: no hay nada de clima en `assets/` ni en `tools/taller/efectos*.ts` (iconos de estado y efectos de batalla). Tampoco hay partículas de lienzo que reutilizar. Va todo procedural.

## El día después

- **Para quien juega**: ambiente en las tres pantallas. Es lo pedido.
- **Lo que se vuelve más difícil**:
  - Cada medida de fps del mapa (`PIXELES_DEL_MAPA`, `mapa.ts:309-322`) habrá que tomarla también con clima.
  - En `pnpm capturas` las imágenes cambian de un fotograma a otro, porque las partículas van por reloj.
  - Si se fuerza `?clima=` donde se mide, dejan de cambiar.
- **Lo que queda sin decir**:
  - La escena de la tropa: es de pie, sobre el campo de la batalla (`DENTRO.tropa`). Hay que decir si lleva clima o no.
  - El cielo de la batalla es un atardecer fijo y en caché (`batalla.ts:1481-1494`): con tormenta, detrás seguiría el sol.
- **Contra `CLAUDE.md`**: nada, si el clima es solo presentación, fuera del `GameState` y de la crónica, y sin tocar el cable. Meterlo en el estado movería el banco y pediría contrato.

## Conflictos

- **Mapa vivo** (`claude/mapa-vivo-de40b2`, solo requisitos): su «Fuera de alcance» dice «ciclo día/noche: el clima lo hace otra sesión». Sus ideas incluyen «un comerciante que aparece solo de noche». **Estos requisitos no lo recogen.** Hay que cerrarlo antes de planificar (ver la pregunta D).
- **También del mapa vivo**: sus condiciones de lugar viven en `core` y querrán leer «qué tiempo hace» («si llueve…»). Si el tiempo de un día queda dentro de `render/`, `core` no podrá leerlo.
- **Combate** (`claude/heroes-combat-complexity-5d77b0`, sin cambios aún): toca `battle/rueda` y `client/rueda`. El clima solo pinta en el lienzo del tablero, y la rueda es un `<dialog>`, así que no se cruzan. Si el clima cambiara reglas de la batalla, sí chocaría (la pregunta A).
- **Héroe en la base** (`claude/heroe-en-la-base-651fe0`): puede añadir otra escena de pie. Es otra razón para enchufar el clima en el bucle de dibujo y no en `castillo.ts`.
- **Backlog** (`gh issue list`): nada sobre clima. El #272 (las nubes del borde del taller) no se toca.

## Coste contra valor

- **Coste**: medio, todo en el cliente.
  - Una función pura que da el tiempo de un día.
  - Una pieza que pinta y se llama en cuatro sitios: dentro de `drawMapa`, en `dibujarFotograma`, en la arena y en el espectador.
  - `?clima=` en tres páginas, y la medida de fps.
- **Riesgo**: casi todo en los fps del mapa. Con un Chromium sin GPU, una capa de pantalla entera con `screen` en 2560×1440 puede costar más que todo el presupuesto que se ganó en `mapa.ts:309-320`.
- **Si no se hace nunca**: no se rompe nada. Pero es lo pedido, y barato frente al mapa vivo.
- **Qué NO debería hacerse**:
  - meter el tiempo en `GameState`, la crónica o el cable;
  - repintar el suelo por el tiempo;
  - pintar el clima en el mapa encima de la niebla de guerra;
  - poner un `<canvas>` o un DOM encima que reciba eventos;
  - enterrar en `render/` el sorteo del tiempo de un día.

## Las tres preguntas abiertas, y una que falta

- **A · ¿Solo presentación? No hace falta preguntarla.** La petición dice «efectos», y que el clima cambie reglas de la batalla choca con la sesión del combate (`battle/` es suyo). La respuesta es solo presentación. Que el sorteo sea puro y lo pueda leer `core` deja abierta una fase de reglas más adelante.
- **B · Grano: le toca al usuario, pero la suposición es segura.** Si se pregunta, que vaya junto a la D:
  - (a) todo el mapa, por día, con rachas. **Recomendada**: cubre las tres pantallas sin ambigüedad y se distingue mejor de la niebla de guerra;
  - (b) por región: un frente de lluvia que se ve en parte del mapa. La batalla y la base heredan el de su región. Manchas grises por regiones se parecen más a «lo que no se mira».

  Cuántos días despejados hay se inventa y va en un `_comment`. No se pregunta.
- **C · ¿Apagar? No es del usuario por ahora.** Sin botón: basta `prefers-reduced-motion` y, para mirar, `?clima=despejado`. Un interruptor en la barra va al backlog.
- **D · Día y noche: es del coordinador o del usuario, y hay que cerrarla antes de planificar.**
  - (a) Fuera de esta tarea, al backlog. **Recomendada**: un turno es un día, dentro no hay hora, y el mapa vivo lo pide para reglas («solo de noche»), no como efecto.
  - (b) Entra aquí como un cuarto efecto: oscurecer y encender luces.

  Elija lo que elija, se avisa a la sesión del mapa vivo.

## Lo que le cambiaría a `requisitos.md` (para pegar)

> **2.** Determinista. El tiempo de cada día es una función pura de la semilla y el día, con su propia corriente, sin consumir el azar de la partida. El espectador la deriva de la semilla y el día que ya recibe, sin campos nuevos en el cable. Ni un `Math.random`, **tampoco en las partículas** (`invariantes.test.ts`): su animación va por reloj, con posiciones de un hash o de `createRng`. `pnpm banco` no cambia. El taller no pinta clima.
>
> **3 (añadido).** En el mapa, el clima se pinta **por debajo de la niebla de guerra** y de lo que va encima de ella (los grupos vistos por su región, la ruta y la casilla señalada). Lo inexplorado sigue siendo `#080a10` y lo que no se mira, el mismo velo. Nada del clima va en el suelo que pinta el Worker.
>
> **6.** Rendimiento, medido en el Chromium de `pnpm capturas`, con fecha:
> - mapa en 2560×1440, al tope de alejar y arrastrando: con cualquier efecto, como mucho un 10 % menos de fps que despejado;
> - en 3840×2160, la densidad la baja el presupuesto que ya tiene el mapa;
> - la batalla y la base, que no tienen presupuesto, se miden igual en 2560×1440.
>
> **Alcance (añadido).** La escena de la tropa no lleva clima (es una ficha, no un sitio). El día y la noche quedan fuera (backlog), y se avisa a la sesión del mapa vivo. Si se decide la opción D (b), esta línea cambia.
