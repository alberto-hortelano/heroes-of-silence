# Requisitos — #156, paredes de acantilado de lado (este y oeste)

## Petición literal

> «Un problema que veo es que hay parades de roca y en el mapa van todas con la misma orientacion»

Y, sobre el arte del oeste: «Se pide nuevo arte» (no se espeja el del este).
Para arrancar el ciclo: «Adelante» (06-10-2026), tras proponer enganchar #156 y #157 ahora que el arte está en `main`.

## Contexto

- **Issue:** #156.
- **Arte**, ya en `main` (e893db9). Lo describe `docs/art/peticiones.md` §16 y §18.
  - Una hoja por material y lado: `assets/mapa/modulos/laterales-{roca,arenisca,basalto,nevadas}-{este,oeste}/`.
  - Cada hoja tiene `tramo-1-{a,b,c}`, `tramo-2-{a,b,c}`, `esquina-1` y `esquina-2`, con su `.json` (ancho, alto, ancla).
  - Los tramos cubren una casilla de norte a sur, con caída de 1 o 2 niveles.
  - La esquina es la pared frontal que gira y sube hacia el fondo.
  - El usuario dio las laterales por buenas tal cual.
  - `assets/mapa/escena.json` ya las lleva, pero `componer` no las usa.
- **Hoy:**
  - `relieve.ts` solo da pared en las caídas al sur (`caras`), con los módulos frontales.
  - Las caídas al este y al oeste (`cantos`) son un borde oscurecido más peñascos de `rocas-caidas`.
  - Las caídas al norte (`rebordes`) solo llevan el reborde.
- **Lo que dejó #150** (rampas, 1b052c1):
  - `rampas()`, `junto`, `ponerPared`, que aparta, encoge o quita y **nunca corta**, `bandaDeCara`, `pieDeCara`;
  - los guardias `paredesSobreRampa`, `paredesFueraDelPie`, `spritesSobreSenda` y `basesSobreReserva`, todos a 0 en las semillas 1-40.
- **#159**, abierto: caras lisas junto a ciudades, minas y rampas. Una de las vías previstas son las esquinas laterales de este arte. Si cae solo, se dice; no es objetivo de este ciclo.
- **#157** (puentes) va después, en otro ciclo, porque toca los mismos ficheros.
- **El crítico se salta:** la tarea la describió el usuario en esta conversación.

## Criterios de aceptación

1. Toda caída al este o al oeste que hoy es `canto` lleva pared lateral del material de su meseta.
   - Se usa la hoja del lado correcto: la cara mira hacia donde cae.
   - Se usa el tramo de 1 o de 2 niveles según la caída.
   - Los módulos se encadenan de norte a sur a lo largo del canto, sin huecos visibles entre casillas seguidas ni solapes que dupliquen roca.
2. Donde una caída al sur gira y sigue al este o al oeste, la pared frontal y la lateral empalman con `esquina-1`/`esquina-2`, o con otra solución que se vea continua en las capturas.
3. Nada se espeja: el oeste usa su propia hoja.
4. Las rampas de #150 también valen para las caras laterales.
   - Donde una senda baja por un canto, la pared lateral se aparta como la frontal (`ponerPared`, sin cortes rectos).
   - Los guardias siguen a 0 en las semillas 1-40, contando las paredes nuevas: `paredesSobreRampa`, `paredesFueraDelPie`, `spritesSobreSenda` y `basesSobreReserva`.
5. Los peñascos de `rocas-caidas` del canto quedan solo donde no haya pared lateral, por ejemplo donde se quitó por una rampa.
6. Las caídas al norte siguen como hoy.
7. Rendimiento: lo nuevo pasa por las mismas copias reducidas (`copias.ts`) y el mismo presupuesto que las paredes frontales. Los fps al tope de alejar y en 2560×1440 no empeoran de forma apreciable; se mide antes y después.
8. Las comprobaciones fijas:
   - `pnpm verify` en verde;
   - `pnpm banco` sin cambios, porque el núcleo no se toca;
   - `pnpm capturas` sin errores al cerrar.
   - Tests nuevos para el encadenado y la esquina, con algún guardia visto morder.
9. Capturas de antes y después (taller o Playwright sin pantalla, a 110 px):
   - en las semillas 5, 6 y 9 de las capturas de #150;
   - en al menos un risco que baje de norte a sur, que hoy se lee como escalera de frontales.

## Fuera de alcance

- Puentes (#157).
- Caídas al norte.
- Arte nuevo. Si falta una pieza, por ejemplo una esquina hacia otro lado o una caída de 3 niveles, se usa la más cercana y se apunta en `peticiones.md`; no se genera.
- #151 (encoger en vez de quitar) y #159 como objetivo.
- El núcleo: `relieve` es cliente.

## Preguntas abiertas, con su suposición por defecto

- **Caídas de más de 2 niveles en un canto:** el tramo de 2, o apilar. Lo decide el arquitecto mirando cuántas hay.
- **Un canto de una sola casilla entre dos caras frontales**, en zigzag: lo que se vea mejor en capturas. Lo decide el arquitecto o el ingeniero con capturas.
- **Tono:** las laterales van sin el filtro `TONO` de los frontales salvo que en capturas desentonen junto a ellos.

## Punto de control (06-10-2026)

El usuario aprueba el plan tal cual: «Adelante (Recomendado)». Eso incluye la opción A (`filo` derivado de la imagen), una esquina por peldaño en los zigzags y las preguntas abiertas resueltas como dice `plan.md`.

## Estado al parar (06-10-2026, noche)

El ingeniero ya entregó (`implementacion.md`). El diff está sin commitear en `main`. Pasan `verify`, `banco` y los guardias.

Al mirar las capturas (`capturas-ingeniero/pares/`), el coordinador ve tres problemas:
- una muesca entre casillas en las cadenas largas;
- riscos pesados en s8 y s9, como muros de columnas que tapan meseta y una mina;
- solo la mitad de las casillas de canto llevan lateral.

Se propuso al usuario una vuelta visual antes de `/simplify` y QA. El usuario: «Lo vemos mañana, ahora tengo que cerrar».

**Pendiente:** su decisión sobre las capturas.

## Decisión del usuario sobre las capturas (07-10-2026)

> «Si, que siga iterando, la pared lateral no esta bien conseguida y su repeticion se nota mucho, hace fata arte nuevo, evitar bordes rectos, que tenga un poco de giros»

Criterios que se añaden:

10. **Arte nuevo de las laterales.** Va en una rama de arte aparte, con `pnpm taller`/codex y sin fal.ai.
    - Ni el filo ni el pie son una recta: el contorno gira, con entrantes y salientes.
    - La repetición no se nota en una cadena de 4 o más casillas. Para eso, el arte trae más variantes y piezas de más de una casilla, o piezas «de en medio» sin corona en la junta.
    - Se acaba la muesca a cada casilla.
    - Hay piezas de caída 3.
11. **Primero un piloto** con un material y lado (roca este). Se enseña al usuario, que aprueba la dirección antes de generar las ocho hojas.
12. **Después, el código se adapta al arte nuevo** (ingeniero) y se vuelve a revisar el peso visual: que no se lean como muros de columnas que tapan la meseta.

## Visto bueno de la vuelta 2 (07-10-2026)
El usuario: «Seguir a simplify y QA». Con el encargo de oscurecer y calentar un poco el tono del basalto, sin regenerar.
