# El héroe se elige en la base, con su coste

## Petición literal

Del usuario, punto 1 de una lista de seis (22-10-2026), en sus palabras:

> «El selector de héroe al iniciar la partida similar al reclutamiento, mostrándolos en la base,
> con coste que se descuenta de lo que queda para reclutar más tropa.»

Llega por la sesión que coordina la lista; los puntos 2-6 van en otras sesiones (ver «Contexto»).

## Cómo está hoy (comprobado en el código el 22-10-2026)

- El menú de inicio (`src/client/inicio/inicio.ts`, `inicio/pantallas.ts`): «Nuevo juego» elige
  la facción y luego el tipo de héroe (retrato `identidad.webp`, descripción del cuaderno) y deja
  `?seed=&faccion=&heroe=` en la URL, que lee `main.ts`. «Partida rápida» saca semilla, facción y
  el tipo por defecto (`tipoDeHeroePorDefecto`).
- `newGame` (`core/state/setup.ts`) recibe `tipoDelHeroe` y crea el héroe del jugador 0 con
  `heroeRecienHecho` **dentro de su base**, en la casilla de la ciudad; el rival, con el tipo por
  defecto. Los tipos (`data/tipos-de-heroe.json`, generado del cuaderno) aún no tienen efecto en
  las reglas: dan nombre, descripción y figura (`figuraDelHeroe`).
- Contratar un héroe después cuesta `HERO_HIRE_COST` = 2 500 (constante en `game.ts`, sin
  `_comment` ni JSON), `hireHero`, con el tipo por defecto de la facción del pueblo.
- El reclutamiento de tropa es la escena de la morada (`escenas/morada.ts`, `views/morada.ts`):
  la cámara se acerca al edificio abierto y delante hay una figura por unidad, que se elige con
  clic o con su botón del lateral, con su ficha, su coste y «+1»/«Todo» (o el motivo del núcleo).
- El oro: `Player.oro`, `oroDeSalida` 27 500, `oroBlocker`, `costeDeUnaUnidad`/`oroDelIndice`
  (índice² / 500).

## Criterios de aceptación

1. Al empezar una partida (desde «Nuevo juego» o desde un enlace sin héroe elegido), quien juega
   ve los candidatos a héroe **en su base**, como se ve la tropa al reclutar en la morada: una
   figura por candidato, con su hoja (`figuraDelHeroe`), que se elige con clic o con su botón, y
   una ficha con nombre, tipo, descripción y **coste**.
2. Cada candidato tiene un coste en oro, que se lee en su ficha antes de elegirlo.
3. Al elegir uno, el coste se descuenta del oro del jugador; la barra y el lateral enseñan lo que
   queda, y la tropa se recluta con ese resto (la morada lo lee).
4. Si no alcanza el oro para un candidato, no se elige y se dice por qué (el motivo del núcleo,
   `oroBlocker`).
5. Lo que decida el crítico/usuario sobre el menú de inicio, `?heroe=` y «Partida rápida» se
   cumple tal cual y se ve en el navegador (estados: «Nuevo juego», «Partida rápida», enlace con
   `?heroe=`, enlace sin él, recarga a media elección).
6. La IA de reglas y el agente eligen y pagan su héroe de salida con la misma regla (una sola
   puerta en el núcleo), o queda escrito por qué no.
7. `pnpm verify` en verde; `pnpm banco` re-anclado si cambia a propósito, juzgando la forma del
   diff; `barrido-semillas.ts` con 0 sin terminar; `pnpm qa` si se toca el contrato; `pnpm
   capturas` una vez al cerrar.
8. Un servidor levantado en otro puerto con la URL para que el usuario lo pruebe, y un commit en
   la rama `claude/heroe-en-la-base-651fe0`. Sin fusionar a main ni subir nada.

## Fuera de alcance

- Que los tipos de héroe tengan efecto en las reglas (habilidades): siguen siendo figura y texto.
- Cambiar la contratación de héroes a media partida (`hireHero`), salvo que el crítico vea que
  debe compartir regla de precio con la elección inicial.
- Equilibrar la economía: el precio se inventa y se dice inventado, sin ajustar a ojo.
- Arte nuevo (retratos o versiones abiertas de edificios): se usa lo que hay.
- Los niveles de complejidad del combate y los personajes fijos de la base (otras sesiones).

## Contexto

- **Otras sesiones a la vez** (el coordinador fusiona): una mete niveles de complejidad del
  combate, probablemente con un selector en «Nuevo juego» de `inicio/`; otra mete personajes fijos
  en la base (`render/base/`, `escenas/castillo.ts`, conversaciones). Tocar de esos sitios solo lo
  necesario y **apuntar en la entrega los ficheros compartidos**.
- Decisiones de siempre del usuario: sin compatibilidad hacia atrás (lo viejo se rechaza
  diciéndolo); cifras inventadas declaradas en su `_comment`; pocas pruebas de jugabilidad; lo
  visual se mira en imágenes.
- Presupuesto de pruebas de `CLAUDE.md`: máquina compartida; verify por tanda, banco y capturas
  una vez al cerrar.
- No hay presupuesto de fal.ai para esto.

## Preguntas abiertas (con la suposición por defecto)

1. **¿Qué hace el menú con el paso del héroe?** Por defecto: se quita; «Nuevo juego» elige solo la
   facción y la partida abre en la base con la elección del héroe.
2. **¿`?heroe=` en la URL?** Por defecto: se retira y se rechaza diciéndolo
   (`PARAMETROS_RETIRADOS`-like), o se conserva como «ya elegido y pagado» para que la recarga
   reproduzca la partida. El crítico decide cuál cuadra con «la URL lleva las tres tras empezar».
3. **¿«Partida rápida»?** Por defecto: héroe por defecto, pagado igual, sin preguntar.
4. **¿De dónde sale el precio?** Por defecto: derivado del índice del héroe recién hecho de ese
   tipo como la tropa si los tipos difieren en cifras; si no difieren, una cifra inventada en
   `data/` con `_comment`. ¿Comparte cifra con `HERO_HIRE_COST`?
5. **¿Se puede salir de la base sin héroe?** Por defecto: no; hasta elegir no hay héroe en el mapa,
   pero el turno no avanza sin él.
6. **¿Cómo eligen la IA y el agente?** Por defecto: la IA, el por defecto pagado; el agente, el por
   defecto pagado sin pedirle nada nuevo al contrato (o una acción nueva si el crítico lo ve
   necesario).
7. **¿Cuántos candidatos?** Por defecto: los tipos de su facción (tres), uno por tipo.

## Decisiones del usuario tras la crítica (22-10-2026)

La crítica (`critica.md`, REENCUADRADA) cierra las siete preguntas; el usuario decidió las tres
suyas:

- **D1 · Precio**: **2 500, uno para todo héroe** (el de salida y el contratado), movido de
  `HERO_HIRE_COST` a `data/economia.json` con su `_comment` (inventado); lo leen todos, también el
  botón del panel. Se le avisó de que hoy los tipos no difieren en cifras (índice 433 todos): elegir
  es cosmético y el precio es fijo.
- **D2 · Dónde**: **escena de pie ante el ayuntamiento** (`village_hall`), como la de la morada:
  la cámara se acerca al edificio (su exterior; no tiene versión abierta) y delante una figura por
  tipo de héroe de la facción.
- **D3 · Contratar a media partida**: **sí, la misma escena**. Contratar un héroe (hoy el botón
  «Contratar héroe» del panel de la base, `hireHero` con el tipo por defecto) abre la misma
  elección de candidatos y contrata el tipo elegido, al mismo precio. (Criterio de aceptación
  nuevo: 9. Contratar desde la base enseña los candidatos ante el ayuntamiento y el héroe
  contratado es del tipo elegido.)

Lo demás, como lo cierra la crítica: «Nuevo juego» elige solo la facción; `?heroe=` se conserva
como «ya elegido y pagado» y sin él la base pregunta; «Partida rápida» lleva el por defecto pagado
y lo escribe en la URL; hasta elegir el de salida no se recluta, ni se construye, ni se pasa el
turno (regla «héroe de salida pendiente», no general); IA y agente, el por defecto pagado por la
misma función del núcleo; todos los tipos de la facción (el imperio tiene cuatro); `newGame` por
defecto sigue dando el héroe ya pagado y el estado «por elegir» es opcional.
