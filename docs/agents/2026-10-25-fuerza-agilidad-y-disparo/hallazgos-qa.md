# Hallazgos de QA, vuelta 1 (26-10-2026), para el ingeniero

Detalle y reproducción en `qa.md`. Los cuatro se arreglan; ninguno toca la regla del disparo ni pide
tests del disparo.

1. **H1 (bloqueante): «A la segunda mano» de la tropa pierde la pieza.** En `pnpm dev`,
   `/?seed=1&faccion=elfos&heroe=guerrero` → Armería → comprar Espada → Tropa → primer Arquero →
   «A la segunda mano»: el botón sale encendido, la acción lanza y la Espada desaparece de la mochila
   (`src/core/state/game.ts`, `case 'equip'`, ~1516-1535: saca de la mochila antes de `ponerPieza`).
   Arreglo: (a) **todo o nada**: la acción pregunta su `*Blocker` entero antes de tocar el estado, y si
   lanza no cambia nada (mira si `unequip` y el resto de acciones de equipo tienen el mismo orden);
   (b) **el botón pregunta al núcleo lo mismo que la acción**: si el núcleo lo rechaza, sale apagado con
   ese motivo; si lo admite, funciona. Averigua cuál de los dos dice la verdad en este caso (un arquero
   con daga de serie y arco: ¿puede llevar la Espada en la segunda?) y que los dos digan lo mismo. Vale
   también para el agente con `slot: "second_melee_weapon"`. Aquí sí: un test que impide que mienta
   (la acción rechazada deja la mochila igual), porque no es del disparo.
2. **H2: el motivo de las opciones apagadas de la ficha de la arena da el remedio al revés**
   («quita antes Espada» en la Segunda arma con mandoble, siendo la Espada lo que se intenta poner;
   «con Rodela … quita antes el escudo» en el Escudo con dos armas). Viene del orden en que
   `equipoBlocker`/`manosBlocker` nombran la pieza puesta y la nueva en `opcionesDelHueco`. Que el
   motivo diga qué estorba de lo que ya lleva y qué quitar de verdad.
3. **H3: la previsión al pasar el ratón por un enemigo con un aliado delante** da el daño y los PV del
   aliado («le quedarían 144 PV») sin nombrarlo ni decir «¡tuyo!». Con «Apuntar» + casilla sí lo dice:
   que el tanteo sobre un enemigo use la misma frase (nombre del alcanzado y «¡tuyo!» si es propio).
4. **H4 (menor): los rechazos de `apuntarBlocker` enseñan el id interno** («Attacker-0 no puede apuntar
   a su propia casilla.»): que digan el nombre de la unidad, como los demás `*Blocker`.
