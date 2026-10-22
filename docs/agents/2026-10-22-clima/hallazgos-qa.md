# Hallazgos de QA del clima, vuelta 1 (22-10-2026), decididos por el coordinador

El informe entero está en `qa.md`. Abajo, lo que se arregla y lo que no, con el motivo. Va sobre
HEAD = `ad655e51`.

## Arreglar

1. **H1: un pedido mal tipado tumba el turno entero del agente** (criterio 9).
   - Casos: `weather` de más de 16 letras, `days` no entero o en texto, `night` no booleano, o más
     entradas del tope.
   - Hoy falla `adventureTurnResponseSchema` y la IA juega el turno.
   - Lo que se pide:
     - el esquema admite cada entrada con tipos laxos (`unknown` o uniones), sin `.int()` ni
       `.max()` que tumben el turno;
     - cada entrada se juzga sola en `climaBlocker`, con su motivo;
     - lo que pase del tope se descarta diciéndolo y el resto sigue.
   - Un test con los cuatro casos: el turno sigue siendo del agente y cada entrada mala sale en el
     veredicto.
2. **H2: de noche, las figuras de la base y de la batalla van con luz de día.** Parecen pegadas y los
   vecinos dorados del Y Bot brillan. En el mapa la noche sí las oscurece.
   - La noche oscurece también las figuras en la base, la morada y la batalla, en parte, para que se
     lean.
   - Las chapas, las barras de vida, los nombres, el aro y las casillas resaltadas van encima, sin
     teñir.
   - Que las tres pantallas cuenten la misma noche.
   - La lluvia y la tormenta también oscurecen las figuras, en la medida en que oscurecen el suelo.
3. **H9: rendimiento del mapa de noche.** Con la mediana de las mismas ventanas, el mapa de noche
   pierde un 22 % (y la mezcla, un 11 %), con la CPU de 13,5 a 19,5 ms por fotograma.
   - Busca qué cuesta. Lo probable es el `multiply` a pantalla entera, más los huecos de los fuegos.
   - Abarátalo: por ejemplo, componer la noche a la resolución de la capa, o hacer el tinte con una
     sola operación sin capa intermedia.
   - `tools/qa/clima.ts` tiene que dar **la mediana además de la mejor ventana**. El criterio 6 se
     juzga por la mediana: como mucho un 10 % menos en el mapa, la batalla y la base, en 2560×1440.
   - Mide también la batalla. La tabla, con fecha, en `implementacion.md`.
4. **H4: de noche, una región que se mira se parece al velo de lo que no se mira** (criterio 3).
   Luces 43-45 azuladas frente a 35 gris.
   - Que se distingan a simple vista: la noche más azul y algo más clara, o con los fuegos más
     presentes, pero sin tocar el velo de la niebla de guerra.
   - Comprobación: en una captura de noche junto a una zona que no se mira, la diferencia de luz y
     de tono se mide y se dice.
5. **H5: con el menú, un `?clima=` malo solo se dice después de elegir facción y héroe.**
   - Lo que no depende del mapa (que sea un tiempo, la forma) se dice al cargar, como `?seed=`.
   - Lo que depende del mapa (una región que no existe), al abrir la partida.
6. **H6: con una región que no existe, el mensaje pide quitar también `?seed=`.** Que pida quitar
   solo `?clima=`.
7. **H7: la lluvia del mapa se ve poco, y menos con dpr 3.**
   - Que se vea al alejar y con dpr alto: el trazo en píxeles de dispositivo, de grosor y largo según
     el dpr, y algo más de contraste.
   - Sin tapar las figuras ni la ruta.
8. **H8: en la batalla, el cielo de tormenta y el de noche son casi iguales.**
   - Que se distingan: la noche con luna o estrellas y más azul; la tormenta, gris pizarra con nubes
     bajas.

## No se arregla (con motivo)

- **H3: tomar una región cambia su noche en el acto**, porque el peso va con el dueño de ahora. Pasa
  en el 10,9 % de las tomas, y en el 44 % si la toma un no muerto.
  - Se acepta: narrativamente, «cae la noche cuando llegan los no muertos» encaja con lo que pidió
    el usuario.
  - Fijarlo al principio del día pediría guardar estado solo para eso.
  - Se dice en `CLAUDE.md` y en la cabecera de `core/state/clima.ts`.
