# Hallazgos de QA para corregir (coordinador, 12-10-2026)

Fuente: `qa.md` (apto con reservas). Criterio vigente del usuario: pocas pruebas de jugabilidad (reglas y flujos, nada de comparar combates).

## Se corrigen

1. **I1: «Guardar» nunca borra ni sustituye una pieza tuya por la de un enlace.** Decisión del coordinador: de la capa de un enlace v6, «Guardar» escribe solo las piezas **nuevas** (id que no está ni en el juego ni en tu borrador) que llevan las unidades del enlace que entran en el borrador; una pieza cambiada tuya se queda como está, y la que el enlace trae cambiada para un id que tú no tocaste tampoco se escribe (las unidades guardadas pelearán con tus piezas, como en los enlaces de antes). La barra lo dice en una frase al abrir y al guardar. Mientras el enlace está abierto, la vista «Editar equipo» enseña tu pieza (con su sello) y avisa de que en esta pelea se usa la del enlace. Test: con `brigantina` cambiada en el borrador, abrir un v6 que lleva la del juego y guardar → la tuya sigue en disco.
2. **I2: a 390 px, elegir una pieza lleva a su ficha** (desplazar la ficha a la vista, o la ficha encima de la lista en estrecho).
3. **M1: mensajes para la persona**: «cuesta −5 de oro» con el nombre del recurso en español (el que ya usen `describirCoste`/los paneles), sin «como texto» ni «NaN» (un campo vacío o no numérico dice qué espera).
4. **M2: «Sin guardar» cuenta piezas distintas de lo guardado**, no piezas tocadas.
5. **M3: dos piezas no se llaman igual** en la arena: se rechaza el nombre repetido con su motivo (la copia nace con un nombre distinto, p. ej. «Espada (2)»).
6. **M4: la barra dice algo al entrar en «Editar equipo» a media pelea** (qué cambia y que la IA espera).
7. **M5: `enElHueco` al salir del escudo** no deja la velocidad negativa que el escudo exigía: fuera del escudo, la velocidad baja a 0 si era negativa por el escudo (o, más simple, `max(0, v)`).
8. **M6: la barra de un v6 sin borrador** no se contradice: una sola frase.

## No se corrige

- El botón «Editar equipo» no sale a media pelea con los dos bandos en IA: diseño de antes (no hay turno humano en que pararse).
