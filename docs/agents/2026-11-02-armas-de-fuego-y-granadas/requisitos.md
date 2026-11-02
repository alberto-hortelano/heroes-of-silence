# Armas de fuego y granadas — requisitos

## Petición literal

> «Como podrian funcionar las armas de fuego? Y las granadas? Me gustaria evitar meter un factor aleatorio»

Tras la propuesta del coordinador, el usuario: «Sí, con /feature». Respuestas a las preguntas de
alcance (02-11-2026):

- Opcionales de las armas de fuego (humo, pistola que dispara con un enemigo al lado): **«Ninguno»**.
- Cuánta armadura resta un arma de fuego: **«Nada, fija»** — toda arma de fuego ignora la armadura
  entera.
- Quién las lleva: **«Las 4 del imperio: Arcabuz, culebrina, pistola y granada. Ya tienen tropa
  esperandolas.»**
- El agente las usa por su contrato en esta tarea: **«Sí»**.

## La propuesta de partida (dada en la conversación, aceptada por el usuario)

Ningún dado: la incertidumbre la pone lo que hace el rival al verlo venir. Hoy el disparo ya es
determinista: el disparo diferido cae en un cuarto fijo de la horquilla (`cuartoDelDisparo`,
`DamageOptions.cuarto`, no gasta `rng.int`).

**Armas de fuego** (hueco `distancia`, la mecánica del disparo diferido tal cual: apuntar a una
casilla, el disparo sale al empezar su siguiente turno, da al primero de la recta, cuarto fijo):
1. **Recarga**: tras disparar, el arma pasa N turnos sin poder apuntar, con el contador a la vista.
2. **Perfora la armadura**: el daño que llega no resta armadura (decisión: nada, fija, en toda arma
   de fuego).
3. **Pegada pareja**: horquilla estrecha (eso son cifras de la pieza, no una regla).

**Granadas**: generalizan la salpicadura del liche (`splash_shot`, que reparte el mismo daño sin
volver a tirar).
1. Se lanzan a una casilla **por encima**: no las para nadie en la recta, ni un muro ni una puerta.
   El alcance sale de la fuerza de quien la lanza (p. ej. fuerza ÷ 2 casillas).
2. **Explotan al empezar el siguiente turno de quien la lanzó**, como el disparo; la diana y su
   radio se ven en el tablero para los dos bandos.
3. **Daño por anillos, fijo**: en la casilla del centro, el cuarto 4; en las 6 vecinas, el cuarto 2;
   más allá, nada. Da a los dos bandos (también a quien la lanzó si sigue cerca); la armadura se
   resta como siempre.
4. **Se gastan**: N por batalla, con el contador a la vista (vuelve la munición, solo para ellas).

## Criterios de aceptación

1. **Sin azar nuevo**: ningún camino nuevo (disparo de arma de fuego, explosión, previsión, IA de
   batalla al decidir) gasta `rng`; la misma batalla con la misma semilla da lo mismo.
2. **Cuatro piezas nuevas** en `data/equipo.json`: Arcabuz, Culebrina, Pistola (armas de fuego) y
   Granada, con cifras a ojo declaradas como inventadas en su `_comment` (la culebrina, la más lenta
   en recargar y la que más pega; la pistola, la que menos; horquillas estrechas). Validan por la
   regla de la pieza (`problemasDePieza`): los campos nuevos solo en su hueco, con sus rangos.
3. **Las cuatro unidades del imperio las llevan de serie** en vez de lo que llevan hoy en ese hueco:
   `imperio-arcabucero` el arcabuz, `imperio-artillero-culebrina` la culebrina,
   `imperio-pistolero-montado` la pistola (hoy no dispara: pasa a tirador) e `imperio-granadero` la
   granada. El catálogo carga y el juego las recluta como hoy.
4. **Recarga**: tras el disparo de un arma con recarga N, esa unidad no puede apuntar durante sus N
   turnos siguientes; `apuntarBlocker` lo dice con una frase para la persona («recargando: le faltan
   k turnos»); al acabarlos, vuelve a poder. Un arma sin recarga (arco, ballesta) sigue como hoy.
5. **Perforación**: el disparo de un arma de fuego llega sin restar la armadura del alcanzado (la
   previsión, la tirada y lo que mide la IA, igual); el de arco o ballesta, como hoy.
6. **Granada, lanzar**: quien lleva granada y le quedan cargas puede elegir una casilla a su alcance
   (fuerza ÷ 2, o la cifra que fije el plan) y eso cierra su turno, como apuntar; fuera del alcance,
   sin cargas, tras moverse o con un enemigo al lado se rechaza con su motivo (`*Blocker`). La recta
   no importa: no la paran unidades, muros ni puertas.
7. **Granada, explosión**: al empezar el siguiente turno de quien la lanzó, antes de que elija, daña a
   todo vivo en la casilla (cuarto 4) y en sus 6 vecinas (cuarto 2), de cualquier bando, con la
   armadura restada; deja hechos en el registro (lanzada, explosión y a quién y cuánto). Si quien la
   lanzó muere antes o acaba la batalla, no explota (como el disparo).
8. **Cargas**: cada portador empieza cada batalla con las cargas de la pieza; lanzar gasta una; con 0
   no se lanza. Fuera de batalla no se gastan ni se compran.
9. **A la vista**: en la partida, la arena y el espectador, el panel de la unidad dice los turnos de
   recarga que le faltan y las cargas de granada; el tablero pinta, para los dos bandos, la diana de
   la granada pendiente con su anillo de vecinas, teñida por la tirada que daría (como la recta del
   disparo); al pasar el ratón sobre una casilla en el modo de la granada, la barra dice a quién daría
   y cuánto (previsión del núcleo, «¡tuyo!» si es propio).
10. **Selector de arma**: quien lleva granada la elige como su modo de distancia (o un tercer botón si
    un portador pudiera llevar arco y granada a la vez; el plan decide la forma) y el clic en una
    casilla la lanza.
11. **La IA de reglas** dispara con las armas de fuego respetando la recarga y lanza granadas por la
    misma regla que el núcleo (sin lanzarla donde daría sobre todo a los suyos).
12. **El agente**: el contrato de `battle_turn` trae la jugada de lanzar (en `legalActions`, con su
    casilla), en cada stack la recarga que le falta, las cargas que le quedan y la granada pendiente
    (también las del rival), y el registro cuenta lanzada y explosión; la prosa de `battle_turn` dice
    las reglas. Una jugada ilegal se descarta con su motivo. `pnpm qa` pasa. El espectador recibe lo
    mismo (`adaptar.ts` sigue siendo la inversa exacta).
13. **El índice de poder** mide las piezas nuevas de algún modo declarado (a ojo): la recarga baja el
    disparo, la perforación lo sube, la granada cuenta. Ninguna unidad del catálogo deja de medirse
    (`medidaBlocker`) y la tabla del catálogo (`TABLA_DEL_CATALOGO`, `test/nivel.test.ts`) se
    reancla con lo que salga, sin recalibrar la escala.
14. **La arena**: el editor de equipo escribe los campos nuevos de cada pieza (recarga, perforación
    si es un campo, alcance/cargas de la granada) con su tooltip, y una pelea montada con las cuatro
    unidades se juega.
15. CLAUDE.md (reglas, puertas únicas, contrato) y `docs/historia.md` lo cuentan con fecha.

## Fuera de alcance

- Humo, y que la pistola dispare con un enemigo al lado (decisión del usuario: ninguno de los
  opcionales). La pistola es un arma de fuego más, con sus cifras.
- Cambiar el disparo diferido en sí (la recta, el cuarto, a quién da).
- Arte nuevo: las cuatro unidades ya tienen hoja; ni proyectiles ni explosiones dibujadas más allá de
  lo que pinte el animador con lo que hay (un marcador o el proyectil de siempre vale).
- Equilibrio, cifras medidas, duración de batallas (CLAUDE.md: «No se prueba la jugabilidad»).
- Granadas para el héroe o en el mapa de aventura más allá de que la pieza exista en la armería.

## Contexto

- El disparo diferido es **regla nuestra sin validar por el usuario y sin ningún test, por su
  decisión** (CLAUDE.md). Lo nuevo se apoya en él.
- La suerte se quitó el 02-11-2026 (commit `3d6922d9`): no queda azar en el daño del disparo.
- La munición se quitó el 13-10/19-10-2026 («llevarla ya es disparar», `isShooter`). Las cargas de la
  granada son una excepción explícita, solo para ella.
- La máquina es compartida: tests por partes y con su porqué, nunca la suite entera; `capturas` y
  `banco` una vez al cerrar (CLAUDE.md, «Control de calidad»).

## Preguntas abiertas (con la suposición por defecto)

- **Tests**: el disparo diferido no lleva tests por decisión del usuario. Suposición: las reglas
  nuevas (recarga, perforación, granada, cargas, validación de piezas) sí llevan los tests de que
  hacen lo que dicen, pocos; el disparo diferido sigue sin los suyos.
- **Hueco de la granada**: suposición, una pieza de `distancia` con su forma de uso (lanzar en vez de
  apuntar); el arquitecto puede proponer otro hueco si sale más limpio.
- **Recarga N y cargas N**: cifras de cada pieza (a ojo), no constantes globales.
- **El banco**: sin mundo ni agente, las partidas cambian (las cuatro unidades disparan distinto);
  se re-ancla juzgando la forma del diff.

## Decisiones del usuario sobre el plan (02-11-2026)

- **Horquilla estrecha**: «Agilidad del arma». El arma de fuego dice su propia `agilidad` (1-7) y
  tira [F, F × agilidad del arma]; toca `cifrasDelCuerpo`, que sigue siendo la única cuenta.
- **Recarga**: «Cuenta ese turno». El turno en que sale el disparo es el primero de los N: con
  recarga 1, dispara un turno sí y otro no.
- **Alcance de la granada**: **«Fuerza. Mira las caracteristicas de los humanos en general. Estoy
  reduciendo los numeros y suelen tener 3/3/3»**. El alcance es la fuerza del cuerpo de quien la
  lanza (no ÷ 2), al menos 1; a su propia casilla no se lanza. Con un humano de fuerza 3, 3 casillas.
- **Dónde se consiguen**: como el plan. Pistola, arcabuz y granada en la armería; la culebrina solo
  en el kit del artillero.

**Ojo con la escala**: el usuario está bajando las cifras en el checkout de main
(`/home/al/code/heroes`, cambios sin commitear en `data/unidades.json` y `data/equipo.json`: los
humanos a fuerza 3 y agilidad 3, las armas a fuerza 1-2 y peso 0-1). Esos cambios **no son de esta
tarea y no se tocan**. Las cifras de las piezas nuevas se eligen ya en esa escala (fuerza de la pieza
de 1 a 3, peso 0-1; la culebrina, la que más), y los cambios a esos dos ficheros se reducen a lo
mínimo (las cuatro piezas nuevas y el hueco cambiado de las cuatro unidades) para que la fusión con
la reducción sea fácil.
