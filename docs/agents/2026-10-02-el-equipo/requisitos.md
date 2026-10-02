# El equipo: botín, compra en la armería y héroes equipados

## Petición literal

`NuevaJugabilidad.md`:

> «Las tropas tambien ganan experiencia y equipo. Cuando mueren se pierde pero dura
> toda la campaña»
> «En las ciudades puedes construir armeria y comprar equipo mejorado para la
> tropa, los heroes ya lo llevan.»
> «Armas magicas: Las puedes conseguir de botin en misiones secundarias o
> construirlas si tienes armeria, biblioteca y mago»

Decisiones del usuario:

- 02-10-2026: «botin, se compra y tambien con misiones secundarias».
- Hoy: «sigue con 1 y 2» (este es el 2).

Respuestas del usuario a las preguntas de hoy:

- **Huecos:** «Arma, armadura y accesorio».
- **Botín en este ciclo:** «Asaltantes y guarniciones». Vencer a un grupo de
  asaltantes o tomar una ciudad neutral suelta una pieza, sorteada con `createRng`.
- **Compra:** «Edificio Armería en la ciudad». Es un edificio construible nuevo, y
  en una ciudad propia que lo tenga se compra equipo para la tropa del héroe que
  está dentro.
- **Héroe:** «También se equipa». El héroe tiene los mismos tres huecos.

## Criterios de aceptación (borrador: se cierran al empezar el ciclo)

1. **Tres huecos por individuo y por héroe: arma, armadura y accesorio.**
   - El equipo vive en el individuo, junto a `Troop.veterania`, así que dura toda
     la campaña y se pierde si muere.
   - Las cifras se aplican en la misma puerta única de las cifras
     (`cifrasDeCatalogo` y `heroUnit`), no repartidas por el motor.
2. **Un catálogo de piezas en `data/`**, provisional e inventado, y declarado como
   tal. Cada pieza tiene un hueco, sus cifras y un precio. Por ahora el accesorio
   da cifras sencillas, sin habilidades.
3. **Botín.**
   - Al vencer a un asaltante o al tomar una ciudad neutral guarnecida, el
     vencedor recibe una pieza.
   - La pieza va a un sitio que el arquitecto decide (por ejemplo, la mochila del
     héroe) y se puede equipar.
   - Fail-loud y reproducible: pasa por `createRng`.
4. **Armería.**
   - Es un edificio nuevo en `data/buildings.json`, con coste y su solar en la
     pantalla de castillo.
   - En una ciudad propia con armería se compran piezas para el héroe que está
     dentro o para su tropa, y se equipan y desequipan.
5. **El agente y la IA lo usan.**
   - Las acciones de equipar y comprar están en el contrato, con su prosa.
   - La IA de reglas construye la armería y compra o equipa con una heurística
     sencilla.
   - `pnpm qa` lo cruza.
6. **Se ve.**
   - El panel de tropa y el de héroe enseñan el equipo.
   - La pantalla de castillo enseña la armería.
   - La crónica cuenta el botín.
7. **Se mide y se re-ancla una vez.** Se publican la duración, el ganador y cuántas
   piezas por partida. Barrido 0/40 y 0/1000.

## Fuera de alcance

- Las misiones secundarias y las armas mágicas, que necesitan biblioteca, mago y
  el narrador.
- Los efectos de habilidad del equipo: van con el motor de habilidades.
- El arte de las piezas: se usan iconos o texto, porque no hay créditos de ChatGPT
  (la rama `arte` ya está en `main`, pero no trae arte de equipo).

## Contexto

- Empieza **después** del ciclo B («la tropa se hace héroe»). Antes de lanzarlo,
  revisar qué deja B en `Troop` y `Hero`.

## Decisiones del usuario sobre el plan (02-10-2026)

> «Adelante, menos lo de que el heroe nace sin equipo, lo de los heroes ya lo
> llevan me referia al equipo de mejor calidad que se puede comprar en la armeria,
> el equipo del heroe ya es de esa calidad pero sigue pudiendo encontrar armas
> magicas y equipo que de otro tipo de ventajas, al crear un heroe hay que crear
> su equipo base»

- **El héroe nace equipado.** Al crearlo (inicial, contratado o nacido de la
  tropa) se le da su **equipo base** en los tres huecos, y ese equipo es de
  **calidad de armería**: la mejor que se puede comprar.
  - Hay una sola construcción, `heroeRecienHecho`, y el equipo base sale de ahí.
  - El equipo base sale de datos y no se escribe al lado.
- **El catálogo distingue la calidad.** Hay lo común, que cae como botín. Hay lo
  de armería, que se compra para la tropa y es lo que el héroe trae de serie. Y
  hay lo especial: piezas con otro tipo de ventaja (velocidad, PV, moral…) y,
  más adelante, armas mágicas.
  - El héroe solo mejora con lo especial o lo mágico, que encuentra como botín.
  - La forma en datos la decide el arquitecto, de modo que «calidad de armería»
    sea una propiedad leíble y no una lista copiada.
- **El veterano que se hace héroe** recibe también el equipo base. Sus piezas
  propias pasan a su mochila.
- **Consecuencia:** el equipo base sube las cifras de todo héroe y mueve el banco
  desde el primer paso. El plan de dos pasos pasa a ser así:
  - **Paso 1:** botín, mochila y equipo base. Se re-anclan a propósito.
  - **Paso 2:** armería e IA.
  - Se mide y se publica el equilibrio (duración, ganador, emboscadas) antes de
    re-anclar. No se compensa por cuenta propia.
- El resto del plan se aprueba tal cual: equipar en cualquier sitio fuera de
  batalla, mochila sin tope y que lo licenciado devuelva sus piezas a la mochila.
