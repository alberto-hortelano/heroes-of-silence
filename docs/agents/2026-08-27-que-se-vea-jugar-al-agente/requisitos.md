# Que se vea jugar al agente — #63 y #30

## De dónde sale

El usuario, literal:

> «Revisa los issues y planifica el orden de actuacion, descarta los que ya no
> tengan sentido, agrupa los similares para atacarlos en la misma tanda»

y, sobre el plan que salió de ahí:

> «Adelante con la tanda 1»

La tanda 1 es **#63 → #30**, y cierra **#97**.

## Por qué estos dos y en este orden

Hoy, **ver jugar al agente consiste en leer los `console.log` del servidor**. En
un proyecto cuya primera línea dice que es un banco de pruebas para un juego con
IA, ese es el agujero más grande que queda: la demo del proyecto no se puede
enseñar.

`#30` es la forma barata de taparlo —el canal de espectadores **ya emite** un
snapshot completo en cada turno y no lo lee nadie— y `#63` va delante porque un
espectador pinta **nombres de pueblo que escribe el agente**. Esa es exactamente
la cadena que `#97` registró, eslabón a eslabón, y de sus dos accidentes
protectores ya cayó uno: `map_generate` está enchufado desde `#27`. El que queda
es justo el que este ciclo quita.

## Criterios de aceptación

### #63 — escapar al pintar

1. **Ningún texto que no escriba este repositorio llega sin escapar al DOM.** Los
   conocidos son el **`name`** de un pueblo —el `id` ya lo acota `mapPlanSchema`
   desde `bc2ac96`—, el del héroe (que `hireHero` **deriva del pueblo**:
   `Capitán de ${town.name}`, así que sanear «en la entrada» nace con fuga) y
   **`view.directorLog`, que lleva el `reasoning` del agente sin acotar** —2000
   caracteres de prosa libre de un modelo, que es el texto ajeno con más
   probabilidad de llevar un `<`—. El criterio es la clase, no la lista.
2. **La forma de escapar es una sola puerta, y olvidarse no compila o no pasa el
   guardia.** Un `escape()` que hay que acordarse de llamar es un guardia que no
   muerde: la primera vez que alguien añada un campo, se olvidará. Esta casa ya
   tiene el patrón —`emit` es el único que escribe en `state.log`, y por eso el
   candado es un `as` visible— y aquí se pide lo mismo. Y la puerta es **una sola
   para los dos pintores**: la usa `panels.ts` y la usa el espectador. Dos puertas
   es no tener ninguna.
3. **Escapar para texto y escapar para atributo no son la misma operación**, y
   las dos hacen falta: `data-town="${t.id}"` va dentro de un atributo, donde una
   comilla sola rompe el atributo y deja inyectar los que vengan detrás. El `id`
   ya no es el agujero abierto —lo cierra el esquema—, así que su prueba entra
   como **defensa en profundidad**: el día que alguien relaje ese patrón, el
   pintor aguanta.
4. **El guardia se ve rojo antes de darlo por bueno**, con un nombre que hoy
   ejecuta —del tipo `<img src=x onerror=…>`— y con una comilla que rompe el
   atributo. Esta casa no da por bueno un guardia que no ha mordido.
5. La pantalla pinta **el mismo píxel** con nombres normales. No cambia el diseño
   de los paneles, pero sí toca las **169 interpolaciones** de sus 15 funciones:
   está presupuestado, no es alcance que se cuela.

### #30 — que se pueda mirar

6. **Hay una orden documentada que abre la partida del agente en el navegador**, y
   se la ve arrancar. Si se documenta y no se ejecuta, no cuenta: en este repo ya
   pasó con `pnpm server`, que salía 0 en silencio sin arrancar nada.
7. **El espectador no juega.** No manda intents, no aplica reglas, no llama a
   `session.ts`. Solo lee del canal y pinta.
8. **Se ve lo que hace falta para entender la partida**: el mapa, los héroes, los
   castillos, de quién es cada cosa, el día y a quién le toca.
9. **Se ve terminar la partida.** Cuando llega `finished`, lo dice y dice quién
   ganó — igual que `game_over` se lo dice al agente en vez de dejarlo colgado.
10. **Sin servidor levantado lo dice**, con el motivo y cómo salir, en vez de
    quedarse en blanco. Y si el servidor se cae en marcha, también.
11. **El juego local no cambia ni un byte.** `pnpm dev` con `?seed=N` sigue
    abriendo la partida contra la IA de reglas, con su semilla y su barra.
12. **La prueba de que #63 llegó**, partida en dos porque `vitest.config.ts` es
    `environment: 'node'` y no hay jsdom ni playwright:
    - **12a, de máquina**: con un pueblo llamado `<img src=x onerror=alert(1)>` en
      el plan del mapa, lo que sale del pintor lleva `&lt;img` y no `<img`. Esto
      es un test y va en `pnpm verify`.
    - **12b, de persona**: visto en el navegador, con la partida del servidor
      delante. No es un test; es una comprobación que se hace y se cuenta.

    Es el criterio que ata los dos issues y el que cierra #97.

### Que se vean las batallas

Decidido por el usuario al leer la crítica, que avisó de que el snapshot **no
lleva batalla** y de que `broadcast()` corre una vez por turno: el visor sería un
pase de tres diapositivas con las batallas resueltas fuera de cámara. En la
cobertura de `pnpm qa` son **15 de 18 decisiones** las que no se verían, y son
justo las que más toma el agente.

16. **El espectador enseña las batallas**, no solo el mapa entre turnos: la
    rejilla, los stacks, de quién es cada uno y qué acaba de pasar.
17. **El snapshot llega con la frecuencia que hace falta para verlo**: hoy se
    emite una vez por turno. Quien lo diseñe decide si eso es una acción de
    batalla o una ronda, y **lo justifica** — un fotograma por ronda puede
    bastar y cuesta mucho menos que uno por acción.
18. **Y el espectador no se cuelga si no hay batalla**: la mayor parte de la
    partida no la hay. Cambiar de escena es parte del criterio, no un extra.

### De los dos

13. `pnpm verify` verde, y `pnpm qa` verde porque se toca `src/server/`.
14. **`pnpm banco` en su ancla** `297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767`,
    32 177 líneas, 0/200. Nada de esto debería tocar `core`; si lo toca y el
    ancla se mueve, eso es el hallazgo.
15. **0 € de fal.ai.** Este trabajo no genera arte. El espectador pinta con los
    PNG que ya hay, y sin ellos con los marcadores de color, como el cliente.
19. **La página entra en `vite build`** y se comprueba que está en `dist/`.
    `vite.config.ts` no declara `build.rollupOptions.input`, así que `pnpm dev`
    serviría una segunda página que `vite build` **omite en silencio** con CI en
    verde — la clase exacta de fallo que cita el criterio 6.
20. **El puerto no va escrito a mano.** `HEROES_SPECTATOR_PORT` lo mueve y acepta
    `0` para que lo elija el sistema (#61). Si no se puede resolver, **se dice**;
    no se supone 9880.

## Fuera de alcance, dicho para que nadie lo amplíe

- **#34** — que el navegador *juegue* contra el servidor. Es otro contrato
  entero: exige mandar intents y decidir quién manda las reglas. #30 es de solo
  lectura a propósito.
- **#64** — que el lienzo pinte con `visibleNow` en vez de con `fog`. Espera a la
  decisión de #34: si el navegador pasa a recibir el estado del servidor, lo
  recibirá ya filtrado y #64 se disuelve solo. Y un **espectador** lo ve todo por
  definición, así que aquí no aplica.
- **#16** (minimapa), **#18** (la crónica), **#12** (ficha de héroe) y cualquier
  mejora de la pantalla **de juego** que no haga falta para mirar.
- **#42** (las unidades se teletransportan en batalla). Lo metí en esta tanda al
  planificar por no costar arte, y el crítico dijo que fuera: la interpolación de
  movimiento es de la pantalla que **juega**, y el espectador dibuja fotogramas
  discretos de lo que le llega por el cable. Fuera.
- Arte nuevo.

## Preguntas abiertas, con su suposición por defecto

Para que las recoja el crítico en vez de decidirlas el ingeniero a mitad:

- **¿#30 es trabajo tirado si #34 entra después?** *Suposición: no.* El espectador
  es de solo lectura y el cliente que juega tendría que mandar intents; son dos
  cosas distintas que comparten, como mucho, los renderizadores. Si el crítico
  cree que sí, esto cae y la tanda pasa a ser #63 solo.
- **¿El espectador reutiliza `src/client/render/adventure.ts` o es una vista
  propia?** *Suposición: reutiliza.* Pero ojo: el snapshot es una **vista
  serializada**, no un `GameState`, y los renderizadores esperan lo segundo.
  Quien lo decida tiene que decir qué se adapta y dónde.
- **¿Se tipa el `view: unknown` del `SpectatorSnapshotMsg`?** *Suposición: sí.*
  Un espectador que parsea `unknown` reimplementa el esquema del emisor por su
  cuenta, y entonces hay dos declaraciones de lo mismo que nadie compara — que es
  exactamente lo que acaba de morder en `MapPlan` vs `mapPlanSchema`.
- **¿Cómo se llega al espectador?** *Suposición: una página aparte servida por el
  mismo Vite*, para no meter un modo dentro del cliente que juega. Lo contrario
  —un parámetro en la URL— arriesga el criterio 11.
- **¿Escapar o construir el DOM?** *Suposición: lo que haga que el criterio 2 sea
  cierto.* Un `escape()` suelto no lo cumple; una plantilla etiquetada que escape
  por defecto, o construir nodos, sí. Que lo decida quien diseñe, con su motivo.
