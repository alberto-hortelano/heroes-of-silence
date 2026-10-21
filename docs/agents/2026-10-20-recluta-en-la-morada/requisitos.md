# Reclutar dentro de la morada (20-10-2026)

Rama `claude/game-tuning-start-a0b1d8` (sin fusionar). Sigue a la escena de la tropa
(`docs/agents/2026-10-19-tropa-en-escena/`), que es el patrón a copiar.

## Petición literal

> «Haz que la interfaz para reclutar sea en el juego. Al hacer click en el edificio se entra y se
> ven las tropas para reclutar, a la izquierda las caracteristicas»

Y al preguntarle dónde van los botones:

> «Al hacer click en la figura se muetran en la derecha sus caracteristicas con el boton para
> reclutar, no queria decir izquierda»

## Decisiones del usuario (20-10-2026)

- **Fondo: arte de interior por morada, pedido a Codex** (por la suscripción, `tools/taller/codex.ts`,
  nunca fal.ai). Mientras no esté, un respaldo.
- **Una figura por unidad** que produce la morada (1-3 hoy; `unidadesDeMorada`), no tantas como
  disponibles.
- **La ficha y el botón de reclutar, en el lateral de la derecha** (`#side`, el de siempre), y
  salen al pulsar la figura.
- Las figuras, **al tamaño de la batalla como mucho** (decisión del 20-10-2026 en la tropa: las
  hojas pixelan si se agrandan; `pasoDeLaBase`, el tope de `render/tropa/arco.ts`).

## Hoy

En la base caminable (`escenas/castillo.ts`), un clic en una morada lleva al héroe (o al alcaide) a
su puerta y al llegar abre una sección de texto encima del panel general de `#side`
(`renderAbierto` → `morada` → `reclutable`, `views/base.ts:65-93`): nombre, disponibles, precio,
cupo, «+1» y «Todo», sin cifras de combate.

## Criterios de aceptación

1. Al llegar a la puerta de una morada construida (con el clic en el edificio o desde la lista del
   panel, `irA`), la partida **entra en una escena de la morada** (`Scene = 'morada'`): el lienzo
   cambia y deja de verse la plaza.
2. En el lienzo, **una figura por unidad** que produce esa morada, de pie, mirando a cámara (`S`,
   `idle`), en fila, enteras, sin pisarse y **no más grandes que en una batalla** en ese lienzo (de 1
   a 4 figuras, en los lienzos de escritorio y del móvil). Sin arte de la unidad, su marcador; nunca
   el Y Bot en lugar de un arte que exista.
3. **Pulsar una figura la elige**: aro grueso en la elegida y fino bajo el puntero (los de
   `render/aro.ts`, en los pies). Al entrar, la elegida es la primera.
4. En el **lateral de la derecha**, de la elegida: su nombre, nivel e índice, Vida, Ataque,
   Defensa, Daño, Armadura, Velocidad, sus rasgos y su equipo de serie; y Disponibles (+crecimiento
   por semana), Precio, el cupo (quién la lleva, cuánto ocupa, caben), **«+1» y «Todo (n)»**. La
   lista de las unidades de la morada también está en el lateral como botones y elige igual que el
   clic en la figura.
5. **Reclutar desde la escena** usa las mismas acciones de siempre (`session.recruit` /
   `recruitAll`, `reclutarBlocker`): el núcleo no cambia. Si no se puede, los botones salen apagados
   y **el motivo del núcleo va escrito debajo** (como en la tropa: en el móvil no hay `title`).
   Tras reclutar, disponibles y cupo se actualizan sin salir.
6. La mejora de la morada, si le queda alguna, sigue a mano en el lateral.
7. **Salir**: Escape o «Volver a la base» devuelven a la base caminable, con quien anduvo quieto en
   la puerta de esa morada. «Ampliar», el gremio, la armería, la taberna, el mercado y la gente
   siguen como hoy (sección en el panel o conversación).
8. **El fondo**, por orden: el interior de esa morada si existe
   (`assets/bases/<f>/interiores/<edificio>.webp`, con su línea de suelo medida, donde pisan las
   figuras); si no, el recorte del edificio en la base ampliado y en penumbra (hoy solo templarios);
   si no, el campo de la escena de la tropa. Lo que falte no rompe ni escribe errores en consola.
9. **El taller sabe pedir el interior** de cada morada por Codex (`pnpm taller`): un encargo por
   morada con su guía (línea del suelo y silueta del adulto como vara de medir, la cámara a 25° del
   contrato) y su identidad (el recorte del edificio o su descripción), y lo derivado va al build
   (las fuentes no). **Piloto: las 4 moradas de los templarios** (pueblo, forja, establos,
   monasterio), para que el usuario las vea antes de pedir las otras 15.
10. Funciona en escritorio y en el móvil (marco de 380 px como la tropa y la batalla), con tema.
11. Lo vigilan tests (la fila, entrar y salir, elegir, reclutar desde la escena, el motivo) y la
    pasada de `pnpm capturas` (el reclutamiento de `jugarEscritorio` pasa por la escena, y una
    pasada `morada`). Cada guardia nuevo se ve morder.

## Fuera de alcance

- Escenas para «Ampliar», el gremio, la armería, la taberna o el mercado.
- Más de una figura por unidad, animaciones de entrar o de reclutar, sonido.
- Cambiar reglas o cifras del reclutamiento (el banco debe quedar en `3406f518…`).
- Las 15 moradas no templarias del arte: se encargan solo si el usuario da por bueno el piloto.
- El backlog de la tropa (H5, H7, H8, M1-M3).

## Contexto

- Máquina compartida: nada de `pkill`/`kill` por nombre; Playwright sin pantalla, nunca el Chrome
  del usuario; presupuesto de pruebas (lo caro, una vez al cerrar).
- Sin compatibilidad hacia atrás.
- Vite sigue en :3201 (tarea `b3fa34puy` del coordinador): no lo matéis; usad otro puerto.
- Codex: binario `/usr/lib/chatgpt/resources/codex`, una imagen ~1,5 min; si se acaba la cuota
  (`FalloDeCodex.sinCuota`), se para y se dice.

## Preguntas abiertas (con la suposición por defecto)

- ¿El interior lleva gente pintada? → No: un interior vacío con suelo despejado delante, para que
  las figuras del juego estén solas.
- ¿Qué pasa con una morada sin ninguna unidad? → No existe (`moradasBlocker`); no se trata.
- ¿Se entra con el alcaide (sin héroe dentro)? → Sí, igual; el cupo es el de la guarnición.

---

## Vuelta 2 (20-10-2026, tarde): la morada dentro de la base

Hecho antes de esta vuelta y en el árbol de trabajo (sin commitear):
- la escena `'morada'` (C1-C11);
- las figuras de pie a la resolución de su hoja (`pasoDeLaHoja`, 160 px de dispositivo; decisión
  del usuario: «se ve muy pequeña» al tamaño de la batalla, y «pixelan» más grandes);
- licenciar dentro;
- los cuatro interiores templarios (segunda tanda de Codex), medidos a mano por su puerta
  (`MEDIDAS_DE_LOS_INTERIORES`) y encogidos a la escala de las figuras, con los bordes fundidos a
  oscuro.

### Petición literal

> «En el ordenador se ve muy pequeño. Queda una sala en el vacio. Que se muestre integrada en la
> base, que la imagen del exterior pase a ser la del interior. A parte de eso, la imagen del
> exterior de la casa de reclutamiento esta torcida, hay que arreglarla. Mirala primero para
> entender lo que esta mal. Otra cosa mas, al hacer la pantalla mas estrecha se encoje la parte
> donde se ve la base. Eso no pasa en el mapa y no debe pasar en la base. Que se ajuste a maxima
> altura y muestre lo que quepa de ancho»

### Decisiones del usuario

- **«Casa abierta»:**
  - Al entrar en una morada no se sale de la base: el edificio de la plaza se cambia por él mismo
    sin la fachada (casa de muñecas), con la sala dentro de su silueta. La plaza de alrededor sigue
    igual.
  - Los reclutas, una figura por unidad, se ponen delante, en el empedrado. Se eligen igual que
    ahora, y el lateral sigue como ahora.
  - Para cada morada se pide a Codex una versión «abierta», a la escala y en el sitio de su
    exterior.
- **«Acercar a 160 px»:** dentro de la morada, la cámara de la base se acerca hasta que las figuras
  miden lo máximo de su hoja (`pasoDeLaHoja`). La plaza y la casa se amplían (unas ×1,3) y se
  aceptan algo más blandas.

### Lo que está mal en el exterior del pueblo (mirado por el coordinador)

`assets/bases/templarios/templarios_pueblo.webp` (la choza, tramo 3) está pintada en tres cuartos:
- se le ven la pared del lado derecho y el faldón del tejado en escorzo;
- el zócalo de piedra va en diagonal.

El resto de la plaza va de frente (el ayuntamiento, los muros). Además lleva un halo verdoso
alrededor. Hay que volver a pedirla **de frente**, con la fachada paralela al plano del cuadro como
las demás, y sin halo.

### Criterios de esta vuelta

12. **Entrar no saca de la base.** Al llegar a la puerta de una morada:
    - la cámara de la base se acerca a ella al paso de la hoja (`pasoDeLaHoja(densidad)`) y la
      centra en horizontal, con el tope de la base;
    - el recorte de ese edificio se sustituye por su versión abierta, si la hay; sin ella, se queda
      el exterior;
    - delante, en la franja que se pisa, sale una figura por unidad, en fila, sin pisarse y sin
      salirse del lienzo;
    - el que anduvo se queda en la puerta, o se aparta si estorba.

    Se elige con el clic en la figura o en su botón del lateral. Escape y «Volver a la base»
    devuelven la cámara de la base y el exterior.
13. **No queda «una sala en el vacío»:** nunca se ve fondo oscuro ni un cuadro flotante. Alrededor
    está la plaza de la base, sin el fundido a oscuro.
14. **La versión abierta de cada morada** se pide a Codex como una edición del tramo, igual que las
    mejoras de la base (`encargoDeEdicion`):
    - el mismo edificio, en el mismo sitio, con el mismo tamaño y el mismo contorno, sin la pared
      de delante, y dentro su sala (lo que describe `INTERIOR_DE_LOS_TEMPLARIOS`), a la escala del
      adulto de la base (`ADULTO_EN_EL_CUADRO`);
    - la sala se ve desde la plaza;
    - se recorta como cualquier edición (`recortarLaBase`, la diferencia con la placa) y va al
      índice.

    Piloto: las cuatro moradas templarias. La del pueblo, sobre su exterior ya arreglado (C15).
15. **El exterior del pueblo, de frente** (una edición de su tramo): la fachada paralela al cuadro,
    sin pared lateral en escorzo y sin halo, en el mismo sitio y con su puerta en la raya (la
    disposición, `data/bases/templarios.json`, no cambia salvo que la medida lo pida).
16. **La base ocupa siempre el alto máximo.** Al estrechar la ventana, el lienzo de la base (y el de
    la morada dentro de ella) no encoge en alto: se queda con el alto máximo, como el mapa, y
    enseña lo que quepa de ancho. La cámara sigue a quien anda en horizontal, con su tope. Se
    comprueba en escritorio a varios anchos (1440, 1100, 800) y en el móvil.
17. La escena de la tropa (T) no cambia, salvo lo que comparta.

### Qué se retira

- La escena aparte de la sala: los interiores de pantalla entera, `MEDIDAS_DE_LOS_INTERIORES`, el
  fundido a oscuro y `interiores/`. Se retiran si la casa abierta los sustituye: sin compatibilidad.
  Lo decide el arquitecto, diciéndolo.
- El campo y el recorte de respaldo de la escena de la morada: el respaldo es la base con su
  exterior.

### Fuera de alcance

- Las moradas de las otras cuatro facciones: no tienen arte de base y siguen con sus marcadores.
  Su morada se ve con los reclutas delante del marcador.
- Reencargar el arte de la tropa (T).
