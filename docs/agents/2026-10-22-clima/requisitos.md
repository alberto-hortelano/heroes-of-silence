# Clima: niebla, lluvia y rayos (22-10-2026)

Rama `claude/clima-69dcf3` (worktree `clima-69dcf3`). Es el punto 4 de una lista de seis que el
usuario dio a una sesión coordinadora; las demás van en otras sesiones y otras ramas:

- el héroe elegido en la base con su coste;
- la complejidad del combate y manejar solo la rueda del héroe (toca `battle/rueda` y `client/rueda`);
- el «mapa vivo»: lugares visitables en escenas laterales y personajes con personalidad.

## Petición literal

> «Efectos como niebla, lluvia, rayos... Tanto en el mapa como en los escenarios de combate y de
> rpg»

## Dónde cae

- **El mapa de aventura**: el escenógrafo (`src/client/render/escenario/`, `render/mapa.ts`). El
  suelo lo pinta un Worker una vez por partida. Los volúmenes se pintan en cada fotograma con un
  presupuesto de píxeles (`presupuestoDelMapa`). Ver «Mapa de aventura» en `CLAUDE.md`.
- **El combate**: el tablero hexagonal (`render/batalla.ts`, `escenas/batalla.ts`,
  `escalaDelCombate`). Sale en la partida, en la arena y en el espectador.
- **«Los escenarios de rpg»**: las escenas laterales, con scroll y sin rejilla.
  - Hoy son la base (`render/base/`, `escenas/castillo.ts`) y la morada (`escenas/morada.ts`).
  - Otra sesión está creando ahora lugares visitables con escenas así (el «mapa vivo»). **El efecto
    tiene que poder usarse en cualquier escena lateral**, no solo en la base: una pieza que se
    enchufa, no un parche dentro de `castillo.ts`.

## Criterios de aceptación

1. **Cuatro efectos y el despejado**:
   - **niebla** (bancos que se mueven despacio);
   - **lluvia** (gotas que caen, con viento);
   - **tormenta**: lluvia con rayos (el destello y, si cabe, el trazo del rayo);
   - **noche** (decisión del usuario, 22-10-2026): la escena se oscurece y se encienden luces (los
     fuegos de las ciudades, ventanas). Cuándo es de noche lo propone el arquitecto y lo decide el
     usuario en el punto de control del plan; tiene que poder leerlo `core` (el mapa vivo quiere
     «un comerciante que aparece solo de noche»).

   Cada uno se ve en los tres escenarios: el mapa, el combate y la escena lateral (la base y la
   morada).
2. **Determinista** (texto del crítico). Lo que no pide el agente, el tiempo de cada día y región,
   es una función pura de la semilla, el día y la región, con su propia corriente, sin consumir el
   azar de la partida, y puede leerla `core`. Lo que pide el agente (criterio 9) viaja y se guarda
   como presentación, al estilo de `town_voices`: no escribe en la crónica y `pnpm banco` no lo ve
   (sin agente, el banco no cambia). El espectador ve lo mismo que la partida. Ni un `Math.random`,
   **tampoco en las partículas** (`invariantes.test.ts`): su animación va por reloj, con posiciones
   de un hash o de `createRng`. El taller no pinta clima.
3. **No se confunde con la niebla de guerra**. La niebla del clima se distingue a simple vista de lo
   inexplorado y de lo que no se mira (otro color, otra forma, movimiento). La niebla de guerra
   sigue leyéndose igual: el clima no tapa ni revela nada que la niebla de guerra tape o revele.
   En el mapa, el clima se pinta **por debajo de la niebla de guerra** y de lo que va encima de
   ella (los grupos vistos por su región, la ruta y la casilla señalada): lo inexplorado sigue
   siendo `#080a10` y lo que no se mira, el mismo velo. Nada del clima va en el suelo que pinta el
   Worker. **Por región** (decisión del usuario): cada región puede tener su tiempo, y el borde
   entre dos se ve como un frente, no como el contorno de casillas de la niebla de guerra.
4. **No estorba al jugar**:
   - las figuras, las chapas, la ruta, las casillas de la batalla y la interfaz se siguen leyendo;
   - el clima no recibe clics;
   - el destello del rayo es breve y no ciega la pantalla entera.
5. **`prefers-reduced-motion: reduce`**: sin destellos y sin partículas que se muevan deprisa. El
   tiempo se sigue notando, quieto o casi quieto.
6. **Rendimiento**, medido en el Chromium de `pnpm capturas`, con fecha:
   - mapa en 2560×1440, al tope de alejar y arrastrando: con cualquier efecto, como mucho un 10 %
     menos de fps que despejado;
   - en 3840×2160, la densidad la baja el presupuesto que ya tiene el mapa;
   - la batalla y la base, que no tienen presupuesto, se miden igual en 2560×1440.

7. **Sin arte de pago**. Procedural en Canvas 2D o con imágenes que ya existan. Presupuesto de
   fal.ai: 0.
8. **Se puede forzar para mirarlo**: un `?clima=<id>` (o lo que diga el arquitecto, en la línea de
   `?seed=`) que fija el tiempo en la partida, la arena y el espectador. Uno que no existe se
   rechaza diciéndolo, como `parseSeed`.
9. **El agente lo usa como elemento narrativo** (decisión del usuario, 22-10-2026): el narrador
    puede pedir el tiempo de una región (y la noche, si la regla lo admite) por el contrato, por
    ejemplo una tormenta antes de un asedio o niebla en un lugar. Sin agente, o donde no lo pide,
    sale de la semilla. Un pedido que no vale se descarta con su motivo, como toda acción del
    agente. Lo vigila `pnpm qa`.
10. **La batalla y la escena lateral heredan** el tiempo de la región donde ocurren (la base, el de
    la región de su ciudad). La escena de la tropa no lleva clima (es una ficha, no un sitio). El
    cielo de la batalla (hoy un atardecer fijo) cambia con el tiempo: con tormenta no se ve el sol.
11. **Cierre**:
   - `pnpm verify` en verde;
   - capturas de los tres escenarios con cada efecto;
   - un servidor levantado en otro puerto con su URL para el usuario;
   - un commit en esta rama, sin fusionar a `main` ni subir nada.

## Fuera de alcance

- Que el clima cambie reglas (vista, tiro, movimiento): solo presentación (la petición dice
  «efectos», y `battle/` es de la sesión del combate). La noche sí la puede leer `core`.
- Otros climas: nieve que cae, viento de arena, ceniza. Pueden ir al backlog. Si la arquitectura
  deja añadirlos con una tabla, mejor.
- Sonido.
- Tocar la rueda del golpe y `battle/` del núcleo (es de otra sesión).
- Tocar las escenas visitables del «mapa vivo»: se deja la pieza lista para que las use.

## Contexto

- Memorias del usuario que aplican:
  - «Lo visual, sin tests»: mientras se itera, imágenes, y `verify` al cerrar.
  - «Pocas pruebas de jugabilidad».
  - «Presupuesto de pruebas»: la máquina es compartida.
  - «Levantar y dar URL»: levanto yo el servidor en otro puerto y paso la URL.
  - «Playwright, no el Chrome del usuario».
- El usuario no está en esta conversación de forma continua. Las decisiones que sean suyas se le
  preguntan una vez y con opciones cerradas.
- Los temas de la interfaz son por facción. El clima es del mundo, no de la interfaz: no lleva tema.

## Decisiones (22-10-2026)

- **Solo presentación** (crítica, pregunta A).
- **Por región** (usuario). El crítico recomendaba todo el mapa: por región se parece más al velo de
  «lo que no se mira», así que el criterio 3 obliga a que el borde se lea como un frente.
- **Narrativo: el agente lo pide** (usuario). Sin agente, la semilla.
- **Sin botón para apagarlo**: `prefers-reduced-motion` y `?clima=despejado`. El interruptor va al
  backlog (crítica, pregunta C).
- **La noche entra como cuarto efecto** (usuario). Se avisa a la sesión del mapa vivo.

## La noche (decisión del usuario en el punto de control del plan, 22-10-2026)

> «Segun narrativa, los dias pasan de forma automatica pero cuando ocurren los eventos depende del
> motor de narrativa, en no muertos habra muchos mas nocturnos»

Se lee así:

- Los días pasan solos, como hoy: un turno es un día.
- **Si es de noche lo decide la narrativa**, igual que el tiempo: el agente la pide por región y por
  días, en el mismo campo del contrato.
- **Sin agente, o donde no la pide**, sale de la semilla por día y región, con un peso que depende de
  la facción dueña de la región. En las de **no muertos**, mucho más a menudo; en las neutrales y en
  las demás facciones, de vez en cuando. Las cifras se inventan y se dicen en `data/clima.json`.
- La prosa del agente le dice que las tierras de los no muertos son más nocturnas.
- `core` la lee por región (el «comerciante solo de noche» del mapa vivo).
- Se descartan las noches fijas cada 3 días, el segundo turno del día y la hora por lo andado.

El plan aprobado sigue en todo lo demás.
