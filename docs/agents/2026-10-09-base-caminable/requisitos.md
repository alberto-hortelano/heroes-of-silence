# Requisitos — la base como escena caminable (caballero), con PNJ y narrador

Rama `bases`, worktree `/home/al/code/heroes-bases`. Diseño aprobado por el usuario
(modo plan, 09-10-2026): `diseno-aprobado.md` en esta carpeta. El arquitecto parte de él.

## Petición literal

> Vamos a mejorar las bases donde empiezan los jugadores

> Vamos a empezar con un rediseño de la base, que no tenga unos huecos con edificios
> flotando sino que sea una escena con sentido con todo integrado.

> Fondo con edificios sobre una escena con profundidad donde te puedes mover, como en las
> escenas cuando entras a un pueblo o ciudad. Puedes moverte y hablar con gente y puedes
> hacer click en la base para ampliarla. Asi la puede usar el motor de narrativa para la historia

Respuestas del usuario a las preguntas:
- Cámara y estilo: **25° pintado oscuro** (el del mapa y `assets/edificios/`).
- Solar sin construir: **nada hasta construirlo** (fuera los recuadros punteados).
- Arte: **Codex (suscripción)**, por el taller.
- Quién camina: **el héroe; si no hay, un alcaide**.
- PNJ: **con narrador ya** (petición nueva al agente; frases de respaldo sin agente).
- Fases: **motor primero, arte de caballero**; el nigromante en otro ciclo, con marcadores.

## Criterios de aceptación

1. Al abrir una base propia se ve una escena: un fondo con suelo, calles y muralla, y los
   edificios construidos asentados en él, anclados por el pie, sin isla propia ni hueco.
   No hay recuadros de solares vacíos ni franja de recluta.
2. Un sitio sin construir no pinta nada.
3. En la escena camina el héroe si está en la base; si no, el alcaide de la facción.
   - Un clic en el suelo lo lleva andando (clip `walk`, mirando hacia donde va) sin salir
     de la zona caminable.
   - Un clic fuera de la zona lo lleva al punto más cercano dentro.
4. Profundidad: quien está delante de un edificio lo tapa, y quien está detrás queda
   tapado por él.
5. Un clic en el ayuntamiento (o en el castillo, si está construido) lleva a su puerta y
   abre la ampliación. La ampliación lista cada edificio construible con su coste; si no
   se puede, da el motivo de `buildBlocker`. Construir lo hace aparecer en su sitio.
6. Un clic en una morada lleva a su puerta y abre su reclutamiento («+1» y «Todo» con el
   mismo resultado que hoy). Los demás edificios abren lo suyo: gremio, armería
   (comprar), mercado (dice que aún no hace nada, #14). **Contratar héroe** sigue accesible
   sin construir nada, desde el ayuntamiento o el panel general, porque `hireHero` no exige
   taberna (crítica). La taberna puede repetirlo, no quedárselo.
   - La muralla del fondo es decorado y no debe leerse como la defensa del `castle`
     (`grantsWalls`, #7): una empalizada o cerca baja, no una muralla de castillo.
   - Se mide cuántos `town_voices` añade el narrador por partida en `pnpm qa` y se anota
     en `implementacion.md`. Si llega a casi doblar las peticiones, se agrupan por día.
7. Hay gente: un encargado por edificio construido y vecinos por facción. Un clic en una
   persona lleva a su lado y abre una conversación con su nombre, papel y una línea.
8. Narrador:
   - La petición `town_voices` (listen/respond) pide al agente las líneas de los PNJ de
     sus bases cuando cambian sus edificios o empieza semana.
   - Su respuesta se valida: el PNJ existe en esa base, la línea es legible y tiene
     longitud acotada. Cada línea se rechaza sola, con su motivo.
   - Un fallo no detiene el turno.
   - El veredicto llega con la siguiente petición.
   - El espectador muestra esas voces.
   - Sin agente, frases de respaldo de `data/`, deterministas.
9. El caballero tiene arte propio, revisado por el usuario antes del commit: el fondo y
   los 20 edificios de su catálogo, con la villa. El nigromante funciona con marcadores,
   es decir, polígono de suelo y bloques con su nombre.
10. El juego se juega entero sin arte y sin agente.
11. Pasan `pnpm verify`, `pnpm qa`, `pnpm banco` (mismo hash), `pnpm verify:lento` y
    `pnpm capturas`, con las capturas del castillo rehechas y dos nuevas: ampliar y
    conversación.

## Fuera de alcance

- Arte del nigromante.
- La escena caminable dentro del espectador: allí solo la lista de voces.
- Que el agente narre la base del humano.
- Figuras propias para los PNJ.
- Vecinos que pasean.
- Teclado (WASD).
- #5 (intercambio de guarnición) y #20 (nombres de morada): pueden encajar después en el
  panel de cada edificio, pero no se hacen aquí.
- **No se toca el generador del mapa** (#226 lo va a cambiar mucho).
- Lo mínimo posible en `core/battle` y `state` (ramas `combate` y `asalto` en paralelo).

## Contexto

- Hay otras sesiones en otras copias del repo:
  - pasar **siempre `--port`** a `pnpm dev/mirar/arena`, y nunca el 3100 (lo usa la
    sesión del mapa; otro puerto lo ocupa algo ajeno);
  - nada de matar por nombre;
  - sin push;
  - navegador con Playwright, nunca el Chrome del usuario.
- El arte se pide con codex exec (memoria del usuario): el binario está en
  `/usr/lib/chatgpt/resources/codex`; el PNG se recoge en
  `~/.codex/generated_images/<thread_id>/`; deja halo, así que hay que recortarlo.
  Precedente: `tools/taller/edificios.ts`. El usuario revisa el arte antes del commit.
- Datos comprobados:
  - la base nace con `village_hall` y `knight_dwelling_1`;
  - `pnpm banco` solo calcula el hash de `state.log`;
  - el `Session` del navegador es local y nunca habla con el agente;
  - el espectador no tiene pantalla de castillo.

## Preguntas abiertas (con suposición por defecto)

- ¿Dónde se pulsa para ampliar si no hay castillo? → En el ayuntamiento (siempre existe),
  y también en el castillo cuando esté hecho.
- ¿Cuerpos de los PNJ? → Criaturas del catálogo con el Y Bot teñido, hasta que haya
  figuras propias.
- ¿Tamaño del fondo? → 1536×1024; si se ve blando a 2560 px, en dos mitades cosidas.

## Correcciones del usuario al plan (09-10-2026)

- Plan aprobado tal cual, con las concreciones del arquitecto.
- **Retirar ya el arte viejo de la ciudad**: `assets/generated/{buildings,towns}`, sus entradas en
  `tools/gen` y su grupo en `GRUPOS_QUE_SE_PINTAN`. No se regenera nada.

## Vuelta 2 (09-10-2026): rehacer como escenario lateral

Tras ver la primera vuelta (plaza cenital con solares de tierra, figuras diminutas), el usuario:

> Rehacer completo. Como en las pantallas del rpg o como las de combate pero sin casillas. En primer plano un espacio por el que moverse, a escala de personaje, mas estrecho que el de combate, como a la mitad, ahi puede haber npcs con los que hablar, de momento usa las bases del y_bot. Detras los edificios, se ve la puerta y lo que entre de alto, como en una plaza, haciendo un semicirculo. Todo a escala de personaje, la misma que en combate. Por aclarar los espacios para rpg son como los de combate pero con scroll horizontal y sin casillas, con movimiento libre

Respuestas: **fachadas nuevas** (altas, recortadas por arriba, giradas según su sitio del arco);
**sitio vacío = el fondo de la plaza** (relleno neutro pintado en el panorama); **solo ratón**.

Diseño aprobado: `diseno-vuelta-2.md`. Criterios que SUSTITUYEN a los de arriba:

1'. Al abrir la base se ve un escenario lateral como el de combate, sin casillas, con scroll
   horizontal (~24 pasos de ancho): delante la franja de la plaza, detrás las fachadas en
   semicírculo (las del centro más hondas, las de los extremos giradas hacia el centro), con
   la puerta a la vista y recortadas por arriba si no caben.
2'. Un sitio sin construir enseña el relleno neutro del panorama (muro, árboles, callejón):
   no se nota que falte nada. Construir pone la fachada encima.
3'. La franja caminable mide la mitad de fondo que la rejilla de combate (3,5 pasos) y el
   adulto mide lo mismo que en combate en el mismo lienzo. Movimiento libre con el ratón;
   un clic fuera se recorta al punto más cercano dentro. La cámara sigue a quien camina en
   horizontal, con tope en los bordes.
4'. Las figuras van siempre delante de las fachadas.
11'. Capturas: castillo al entrar, scroll a un extremo, ampliar, morada, conversación y móvil;
   y una comparación combate/base a la misma resolución con la figura del mismo alto.

Siguen vigentes 5-10 (ampliar, moradas, PNJ, narrador, arte revisado por el usuario,
jugable sin arte ni agente). Los 20 edificios «maqueta» y el fondo cenital de la vuelta 1 se
retiran (nunca se commitearon).

Respuestas del usuario a las preguntas abiertas del plan de la vuelta 2:
- **A (móvil)**: la base usa el mismo marco que el combate (860×380 con scroll); se acepta que en
  un escritorio de lienzo < 860 px la figura de la base salga hasta un 20 % mayor.
- **B (escala)**: la base comparte solo el `paso` (tamaño de figura) del combate; el suelo se
  aplasta con `COMPRESION_SUELO` (25°), como el arte.

## Ajustes tras ver la vuelta 2 (aprobados por el usuario: «me parecen buenas ideas, adelante»)

1. **Encuadre**: bajar la cámara o subir la línea de fachadas para que las fachadas se recorten
   por arriba (se ve la puerta y lo que entre de alto) y la plaza no parezca un descampado.
2. **Arco**: curvar más el semicírculo; los extremos más adelantados y más girados hacia el
   centro, para que se lea plaza y no calle recta.
3. **PNJ**: los vecinos no van en pose de guardia con arma; en reposo de civil (si el `idle` del
   juego de armas es la guardia, buscar un juego sin armas o el más civil que haya).

## Vuelta 3 (09-10-2026): integrar los edificios en un solo cuadro

Tras ver los ajustes, el usuario:

> No quedan integradas, se nota que es un extra. Se me ocurre una forma de hacerlo. Pedir que sea
> una imagen con todos los edificios hechos, con la misma perspectiva, y luego recortarlos y hacer
> un inpainting.

Método (coordinador):
1. **Cuadro maestro**: el panorama de la plaza con TODOS los sitios construidos (primer eslabón
   de cada cadena), pintado de una vez sobre la guía del arco: misma luz, perspectiva y suelo.
2. **Placa vacía**: el maestro editado para quitar los edificios (inpainting: relleno neutro en
   cada sitio). Se usa solo dentro de la región de cada sitio; fuera manda el maestro.
3. **Recorte**: cada edificio sale del maestro por la diferencia maestro/placa dentro de la región
   de su sitio (máscara limpiada y fundida), en su posición exacta: sin ancla, escala ni giro
   que cuadrar.
4. **Mejoras y otros eslabones**: edición del maestro cambiando solo ese edificio; se recorta solo
   su región.
5. Antes del pipeline entero, **una prueba de concepto** (un maestro, su placa, dos o tres
   sitios recortados y compuestos en el juego) que se enseña al usuario.

### Vuelta 3, decisiones tras la primera prueba (09-10-2026)
- **Manda el cuadro**: la geometría (x, pie, puerta, curva) se mide sobre el maestro; no se impone.
- El usuario vio los edificios «alargados y torcidos, con una perspectiva extraña». Causa: la hoja
  de identidad eran las fachadas «giradas» de la vuelta 2 (paralelogramos), la guía eran cajas
  altas inclinadas y el prompt pedía «alto» y «girado». Segunda prueba (aprobada: «adelante»):
  sin hoja de identidad deformada (descripción por palabras, o los edificios proporcionados de la
  vuelta 1 como identidad), guía solo de suelo (borde curvo del empedrado y una marca por puerta),
  prompt sin altura ni giro: proporciones normales, puerta a escala de adulto.
- Paleta: sacar el maestro en dos versiones (otoñal cálida / sobria, cercana al mapa «pintado
  oscuro») para que el usuario elija.

### Tras la segunda prueba (09-10-2026)
- Proporciones y perspectiva resueltas; integración buena. Fallo: escala (puertas de 0,5-0,7
  adultos) y plaza enorme vacía delante.
- **Paleta elegida: b (sobria)**.
- **Tercera prueba con vara de medir**: silueta de adulto junto a cada puerta en la guía y plaza
  mucho menos honda (empedrado solo en la franja de abajo), cámara cerca. Si sale, se sigue con
  el pipeline completo.

### Tras la tercera prueba (09-10-2026): se pasa al pipeline
- La vara de medir funciona con **tres edificios por tramo de 1536 px** (128 px/paso, la escala
  del juego). Con seis por tramo los pequeños se encogen a 0,85 adultos.
- **Decisión del usuario: plaza de ~50 pasos** (el doble de scroll), cinco tramos con el
  ayuntamiento en el central, paleta b, manda el cuadro (la disposición se mide sobre los
  maestros: x, pie y puerta de cada sitio; la curva se da por perdida).
- Antes de los ~18 encargos, un segundo tramo de prueba con el primero como `contigua` para ver
  la costura entre dos tramos.
- Sustituye a lo de la vuelta 2: fachadas sueltas giradas, `arcoDeLaPlaza` y las medidas de
  `fachadas` se retiran. Se mantiene: franja caminable de 3,5 pasos, paso del combate, cámara
  horizontal, paneles, PNJ civiles, narrador.
- Preguntas abiertas del plan de la vuelta 3, decididas por el coordinador (menores): el ancho
  se queda en **~50 pasos** (lo que dijo el usuario), recortando 5 pasos de fuera en T1 y T5;
  la `contigua` es **la placa del tramo anterior** (encargos en serie).

### Tras F2 (09-10-2026): la costura
- T1+T2: escala (puertas 1,1-1,6 adultos), proporciones e integración buenas. La junta falla:
  Codex sube la plaza ~55 px tras el solape (escalón al pie del muro y raya en el adoquinado).
- **Decisión del usuario: suelo propio + pilar en la junta.** El empedrado de la franja es UNA
  capa continua para toda la plaza (textura de adoquín sacada del cuadro, repetible sin junta);
  cada tramo aporta solo lo que hay por encima de su pie, alineado por su pie medido; en cada
  junta el encargo pide un elemento vertical (pilar de muro, árbol, esquina de casa) que la tape.

### Cierre del arte (09-10-2026)
- El usuario aprueba el arte de la vuelta 3 («Lo veo bien»): 5 tramos, 20 recortes, 58 pasos
  (se acepta en lugar de los ~50). Siguen /simplify, comprobaciones de cierre una vez y QA.
