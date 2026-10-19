# Hallazgos de QA (vuelta 1, 19-10-2026) para el ingeniero

Copiados de qa.md, deduplicados. Se arreglan los cuatro. Detalle y reproducción en qa.md (sección «Hallazgos»).

**H1 · importante · `pnpm capturas` en rojo (C12).** Al ir por tandas, porque cada pasada que lanza
para la ejecución, fallan cinco. Las cinco son del guion, que espera el juego de antes. Ninguna la
reproduje como fallo del juego, salvo la del móvil, que no está claro:
- **escritorio** (`capturas.ts:1282`): `locator.hover` en modo estricto: `button[data-action="recruit"][data-todo="si"]` encuentra 4 (la morada ofrece varias unidades). s16, orkos.
- **perdida** (`escenas-de-capturas.ts:340`): «en las semillas 201–400 ninguna guardia a la vista a la que se llegue hoy gana al héroe resuelta sola».
- **movil** (`capturas.ts:1086`): «la jugada ha terminado y la barra sigue diciendo que se espere» (s2, `desktop-batalla-contando-la-jugada.png`). En escritorio, en mis tres batallas, el aviso siempre se retiró solo. Puede ser que la espera del guion no cuente el desenlace de la rueda, o que sea un fallo de verdad del aviso con la rueda. **Sin diagnosticar.**
- **arena** (`capturas.ts:2794`): «el espejo devuelve el control sin que le toque a la persona». La pauta de `buscarArena` no contesta la respuesta de la rueda, que ahora se pide siempre.
- **equipo** (`capturas.ts:4671`): la ficha de la Espada dice «todo héroe (su equipo base)» y el guion busca «todo héroe de la arena».
- Verdes: emboscada, veteranos, tactil, sin-arte, espectador y edición. Sin correr, por quedar detrás de un fallo: poderes, rueda-del-golpe, armas y rueda-contrincantes.

**H2 · menor · «Este héroe no conoce ninguno» en una defensa sin héroe.** Para reproducirlo: s1, «Fin de
turno» tres veces sin mover nada. El día 3 el imperio ataca la base y la guarnición de elfos se
defiende sola, sin héroe. Aun así, el panel de la batalla pone «HECHIZOS · Este héroe no conoce
ninguno» (`d01`). Antes de #116 la persona no jugaba defensas, así que esta pantalla es nueva para
ella. Lo esperado: que diga que no hay héroe en la batalla, o que no saque la sección.

**H3 · menor · con la rueda abierta, botones que parecen encendidos y no hacen nada.** Para
reproducirlo: s30, en la batalla de la guardia (10,4), clic en un goblin. Con «Tu golpe» abierto,
«Terminar turno» y «Resolver sola» se ven encendidos (`p06`), pero un clic real en ellos no hace
nada: el diálogo es modal. No sale ningún mensaje y el estado no cambia (comprobado). Pasa lo mismo
con «Resolver sola» en la fase de respuesta. Lo esperado: verlos apagados mientras la rueda espera,
como ya están «Esperar» y «Defender».

**H4 · menor · un clic durante el desenlace de la rueda se pierde sin decir nada.** Mientras el
diálogo cuenta el cruce, un clic en el tablero no hace nada. Durante una marcha, en cambio, la barra
dice «Espera a que termine la jugada.». Lo vi en la defensa de s1: el disparo pulsado justo tras
elegir la respuesta no se aplicó y la página no avisó. La persona no sabe si tiene que volver a pulsar.


## Decisiones del coordinador

- H1: `pnpm capturas` tiene que salir en verde entero. Lo que es del guion (selector de reclutar con 4 botones, la búsqueda de una guardia que gane al héroe en «perdida», la respuesta de la rueda en la pasada de la arena, el texto esperado de la Espada en «equipo») se adapta al juego de hoy. **El aviso «Espera a que termine la jugada» que no se retira en móvil se diagnostica primero**: si es un fallo del cliente (la sesión o la rueda), se arregla en el cliente, no en el guion.
- H2: en una defensa sin héroe, el panel no habla de «este héroe»: dice que no hay héroe (o no enseña el libro).
- H3: con la rueda abierta, los botones que no se pueden usar se ven apagados (`disabled` con su motivo).
- H4: un clic durante el desenlace de la rueda dice por qué no hace nada (el mismo aviso de espera que el resto), o se encola si es lo natural en esa pantalla.
