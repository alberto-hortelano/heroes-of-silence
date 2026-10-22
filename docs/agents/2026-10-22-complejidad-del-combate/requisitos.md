# Complejidad del combate (3 / 5 / 7) y rueda solo del héroe

## Petición literal (22-10-2026)

> 2) Tres niveles de complegidad para tropa y combate. El numero total de tropa podra ser 3, 5 o 7
> y las acciones de la rueda de combate tambien. En la version de 3 quedaria ofensivo, fusionando
> ofensivo y fuerte, defensivo, fusionando defensivo y finta, y rapido que es la fusion de romper
> guardia y rapido. Defensivo gana a ofensivo, ofensivo a rapido y rapido a defensivo. En la version
> de 5 quedarian, ofensivo-fuerte, defensivo-finta, romper guardia y rapido. Con el normal en el
> centro. Hay que limitar un poco los efectos de las fusiones para que hagan una media de los dos
> efectos en lugar de sumarlos todos es decir que ofensivo-fuerte suma menos daño y menos a atacar
> que cada uno por separado.
>
> 3) Se podra elegir manejar solo la rueda de combate del heroe y que el resto las maneje la IA
> igual que a los enemigos

## Decisiones del usuario (AskUserQuestion, 22-10-2026)

1. **Rueda de 5: ciclo, como la de 3.** Cada tipo gana a uno, pierde con otro y queda en tablas con
   el de enfrente: Defensivo-finta > Ofensivo-fuerte > Rápido > Romper guardia > Defensivo-finta.
   Conserva «defensivo gana a ofensivo» y «ofensivo gana a rápido».
2. **Dónde cae el golpe en el piedra, papel o tijera** (niveles 3 y 5): gana quien pega → su golpe
   en el máximo (punto 4) y el contraataque en el mínimo; gana quien responde → golpe en el mínimo
   (0) y contraataque en el máximo; el mismo tipo (y, en el de 5, los de enfrente) → el medio (2)
   para los dos. Normal, como hoy: siempre el medio.
3. **Dos selectores separados**: el tope de tropa (3, 5, 7) y los tipos de la rueda (3, 5, 7) se
   eligen cada uno por su lado.
4. **Solo la rueda del héroe**: la persona sigue moviendo y atacando con toda su tropa; la rueda
   solo se le abre para su héroe (al golpear y al responder). La de las demás unidades suyas la
   elige la IA a ciegas, como la del enemigo. Es una opción del menú y se puede cambiar en la
   batalla.

## Criterios de aceptación

### Tope de tropa
1. Hay tres topes de tropa por bando: 3, 5 y 7 individuos sobre el tablero, con el héroe incluido
   (hoy `maxPorBando` = 7: el héroe más 6). El liderazgo sigue decidiendo qué cabe dentro de ese tope.
2. El tope de la partida vale para todo bando de toda batalla de esa partida (héroes, guarniciones,
   monstruos, asaltantes, ciudades neutrales) y para lo que se recluta y se cambia en la base: con
   tope 3, un héroe lleva como mucho 2 de tropa. El ejército de salida y las guarniciones caben.
3. Las IA de reglas (estratégica y táctica) y el agente juegan con el tope de la partida. El agente
   lo sabe por su contrato.

### Rueda de 3, 5 y 7
4. **Rueda de 7**: la de hoy, igual (seis tipos en anillo más Normal, la regla de la distancia).
   `pnpm banco` con 7 / 7 no cambia de hash.
5. **Rueda de 5**: Ofensivo-fuerte, Defensivo-finta, Rápido y Romper guardia, más Normal en el
   centro; cruce en ciclo (decisión 1) con los puntos de la decisión 2.
6. **Rueda de 3**: Ofensivo (= ofensivo + fuerte), Defensivo (= defensivo + finta) y Rápido
   (= rápido + romper guardia), sin Normal; Defensivo gana a Ofensivo, Ofensivo a Rápido y Rápido a
   Defensivo; puntos de la decisión 2.
7. **Las fusiones hacen la media, no la suma**: un tipo fusionado tiene el efecto de cada una de sus
   partes **a la mitad**, de modo que cada parte queda por debajo de lo que da su tipo suelto (o igual
   donde su tipo suelto da 0). Ejemplo con la Espada (todo a 3): Ofensivo-fuerte suma menos ataque que
   Ofensivo (+3) y menos daño que Fuerte (×1,5). Las cifras salen de los niveles del arma de cada parte
   (`Pieza.rueda`); el redondeo, en enteros, lo decide el arquitecto y queda escrito en `data/rueda.json`.
8. Las tres ruedas se ven y se juegan en las tres pantallas (partida, arena, espectador): el disco
   pinta los sectores del nivel, las teclas son 1..N, las notas dicen lo que hace cada tipo en esa
   fase y el desenlace se cuenta igual. El espectador ve la rueda del nivel de la partida que mira
   (`adaptar.ts` sigue siendo la inversa exacta).
9. La IA de reglas elige a ciegas entre los tipos del nivel. El agente recibe los tipos del nivel
   (`hits`) y su regla de cruce; un tipo que no es del nivel se rechaza con su motivo.

### Selectores
10. «Nuevo juego» lleva dos selectores, tope de tropa (3/5/7) y rueda (3/5/7), los dos en 7 por
    defecto; lo elegido va a la URL y una recarga juega lo mismo; un valor que no vale se rechaza
    diciéndolo (como `?seed=`, `?faccion=`). «Partida rápida» y un enlace sin ellos, 7 / 7.
11. La arena lleva los mismos dos selectores para la pelea que se monta (y viajan en su enlace,
    subiendo `VERSION_DEL_ENLACE`).

### Solo la rueda del héroe
12. Una opción «Solo la rueda del héroe» en «Nuevo juego», que se puede cambiar durante la batalla.
    Activa: la rueda se abre a la persona solo cuando su héroe golpea o responde; para el resto de su
    tropa la elige la IA a ciegas (como para el enemigo) y el desenlace del cruce se cuenta igual.
    Apagada: como hoy.
13. Una batalla de la persona sin su héroe (la defensa de una guarnición) con la opción activa no
    le abre ninguna rueda.

## Fuera de alcance
- Equilibrar facciones o recalibrar el índice de poder y el coste por nivel de complejidad.
- Nuevo arte para la rueda (los sectores se pintan con lo que hay).
- «Solo la rueda del héroe» en la arena (allí ya existe Yo / IA por bando).
- Fusionar a main o subir nada.
- Tests o medidas nuevas de jugabilidad (memoria del usuario: «pocas pruebas de jugabilidad»). Basta
  con que las partidas con 3 y 5 terminen (barrido de 4 semillas).

## Contexto
- Otras sesiones trabajan en paralelo, cada una en su worktree: el héroe elegido en la base con coste
  (toca `inicio/`, la base y la morada), el clima (render del mapa, del combate y de las escenas
  laterales) y el mapa vivo (lugares, personajes, conversaciones). Los selectores de «Nuevo juego»
  van a chocar con la primera al fusionar: tocar `inicio/` lo justo y apuntarlo.
- La rueda de hoy: `src/core/battle/rueda.ts`, `battle/cifras-de-la-rueda.ts`, `TIPOS_DEL_ANILLO` y
  `TIPOS_DE_GOLPE` (`core/types.ts`), `data/rueda.json`, `Pieza.rueda`, `ai/rueda.ts`, el contrato
  (`HIT_DE_GOLPE` en `contract/vocabulario.ts`), `client/rueda/` y `CruceDeLaRueda`. El tope:
  `LIDERAZGO.maxPorBando` (`data/liderazgo.json`, `core/data.ts`).
- La máquina es compartida: presupuesto de pruebas de `CLAUDE.md`.

## Preguntas abiertas (con su suposición)
- ¿El nivel de la rueda cambia lo que vale un arma (índice de poder)? Suposición: no; el índice se
  mide con la rueda de 7.
- ¿Nombres de los tipos fusionados en el contrato del agente? Suposición: los decide el arquitecto, en
  inglés como los de hoy (p. ej. `offensive_strong`), y en el nivel 3 «Ofensivo», «Defensivo» y
  «Rápido» para la persona.
- ¿La partida guarda el nivel en el `GameState`? Suposición: sí, al crearla (`newGame`), y viaja al
  espectador y al agente.

## Plan aprobado (22-10-2026)
El usuario aprueba `plan.md` con los valores por defecto de sus preguntas abiertas: la Finta a medias
deja andar la mitad de lo que dejaría; en la rueda de 3, «Ofensivo», «Rápido» y «Defensivo»;
`?solo-heroe=1` en la URL; el servidor elige el nivel con `HEROES_TROPA` y `HEROES_RUEDA`.
