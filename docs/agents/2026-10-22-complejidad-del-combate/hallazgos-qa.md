# Hallazgos de QA (vuelta 1) — con la decisión del coordinador

Fuente: `qa.md` (veredicto: no apto). Deduplicados; el orden es el de arreglo.

## Arreglar

1. **Bloqueante — con la rueda de 3, el golpe cuerpo a cuerpo de la persona se atasca.** La unidad anda y
   se planta, la rueda no se abre y la barra dice «"normal" no es un golpe de la rueda de 3: valen …». No
   hay salida (Escape no hace nada, «Terminar turno» la remite a la rueda, «Defender» apagado; en la arena,
   ninguna). Causa: `src/core/battle/battle.ts:3458`,
   `contraataque: conContraataque ? contraataqueCon(delSector('normal')) : null`: la previsión del
   contraataque supone que la rueda tiene Normal. Arreglo en el núcleo, a la altura de la forma: lo que
   represente «el contraataque sin saber la respuesta» tiene que salir de la forma de la batalla (en la de 3,
   sin nombre de tipo, como ya espera el cliente en `client/rueda/rueda.ts:217`), no de `'normal'` escrito a
   mano. Busca cualquier otro `'normal'` literal en caminos que juegan la rueda de la batalla (previsión,
   IA, sesión, director, serialización) y trátalo igual. **Tests que lo cacen** (hoy ninguno lo hace):
   - la persona golpea con la rueda de 3 en la partida (sesión) y en la arena: se abre la rueda con tres
     sectores, elige y el golpe se resuelve;
   - lo mismo con «Solo la rueda del héroe» y la rueda de 3 (el héroe golpea; una unidad que no es el héroe
     golpea sin rueda);
   - `previsionDeLaRueda` con las tres formas, con y sin contraataque.
   Repro de QA, partida: `?seed=2&tropa=5&rueda=3&solo-heroe=1`, «Volver al mapa», doble clic en (700,600),
   clic en los coraceros (697,505), defender dos rondas; en la ronda 3, Grommash golpea y se atasca. Arena:
   tope 7, rueda 3, héroe + 2 trolls contra 3 guerreros con escudo (IA), semilla 81387; ronda 3.
   Compruébalo en el navegador en los dos sitios después del arreglo.

2. **La guía de la respuesta no explica el ciclo.** `client/rueda/rueda.ts:359` dice para toda rueda «si lo
   aciertas recibes el mínimo y devuelves el máximo», que solo vale para la de 7; en la de 3 y la de 5,
   elegir el mismo da el medio, y ni la guía ni las notas de la respuesta dicen quién gana a quién. Arreglo:
   la guía de la respuesta, como la del golpe, sale de `DICHO_DEL_CRUCE` de la forma de la batalla, y en un
   ciclo la nota de cada respuesta dice a qué gana y con qué pierde (derivado de la forma, sin nombres
   escritos a mano). Quien ve la rueda por primera vez puede hacerlo en una defensa.

3. **El arnés de `pnpm qa` escribe el tope por su cuenta.** `tools/qa/politica.ts:70` solo licencia con
   `lleva >= 6`, así que con tope 3 o 5 `pnpm qa` sale 1 («el agente no ha licenciado tropa ni una vez").
   Arreglo: que lea `you.combat.troopCap - 1` del contrato. Verifica `pnpm qa` con 7/7 y con
   `HEROES_TROPA=3 HEROES_RUEDA=3`.

4. **Una URL con solo `?tropa=&rueda=&solo-heroe=` se trata de dos maneras.** Abre el menú; «Nuevo juego»
   enseña 7/7 sin marcar y al empezar pisa lo que traía la URL, mientras que «Partida rápida» lo conserva.
   Arreglo: los selectores de «Nuevo juego» arrancan con lo que trae la URL (`combateDeLaURL`), y así los
   dos caminos juegan lo mismo.

## No se arregla (con motivo)

- **Con el Mandoble o la Maza (Rápido al nivel 1), el Rápido fusionado pega más que el suelto** (2 × 0,44
  frente a 2 × 0,38). La regla es «la media de los dos efectos»: cuando el suelto es un castigo (por
  debajo del golpe normal), su mitad también se acerca al neutro. Es lo que pide la media; se le cuenta al
  usuario al cerrar y decide él.
- **`pnpm verify` rojo por el tiempo de `escenario.test.ts › junto a un puente (#157)`**: no es de esta
  tarea (pasa solo en 18 s).

## Al terminar
`pnpm verify` una vez; `pnpm banco` con el mismo sha (`b9dbd8a1…`) si tocas el núcleo; el barrido con 3/3
y 5/5; `pnpm qa` como dice el hallazgo 3; el navegador para los hallazgos 1, 2 y 4 (el servidor de 3177,
PGID 100357, sigue vivo; no lo mates). Sin `capturas` salvo que el cambio toque lo que capturan más allá de
la rueda. Añade a `implementacion.md` una sección «Vuelta de QA 1».

# Vuelta 2 de QA (apto con reservas) — el usuario pide arreglar las dos reservas y commitear

5. **V2-2, las notas de las ruedas de 3 y 5 hablan de puntos que no existen.** En un ciclo el golpe solo
   cae en máximo, medio o mínimo (4, 2, 0), pero las notas listan «alto» y «bajo» (Rápido, Defensivo,
   Romper guardia: «… en: máximo, 8–29; alto, 8–30; medio, 8–30»), la guía de la rueda de 3 dice «o el de
   enfrente» (con tres tipos no hay ninguno enfrente) y el medidor del desenlace enseña cinco muescas.
   Arreglo de raíz: la forma dice qué puntos puede dar su cruce (`puntosDeLaForma`, o como se llame, junto
   a `DICHO_DEL_CRUCE`: distancia → 0-4; ciclo → 0, 2, 4), y de ahí leen las notas por éxito, la horquilla
   de cada sector y las muescas del medidor; «o el de enfrente» solo si la forma tiene un enfrente (anillo
   par). Corrige `test/rueda.test.ts:1301`, que da por bueno «alto» en la rueda de 3.
6. **V2-1, el arnés de `pnpm qa` busca su semilla jugando 7/7.** `jugarPartidaDelArnes`
   (`tools/qa/partida-del-arnes.ts:121`) monta el `Director` sin `combate`, así que con 3/7, 3/5 y 5/3 la
   semilla elegida no da las ocasiones en la partida real. Arreglo: la búsqueda y la partida, con el
   `combate` del entorno; y que `faltaParaElArnes` pida también un ataque cuerpo a cuerpo del agente con su
   `hit`, que es lo que fallaba. Verifica `pnpm qa` con 7/7, 3/3, 3/7, 3/5 y 5/3.
