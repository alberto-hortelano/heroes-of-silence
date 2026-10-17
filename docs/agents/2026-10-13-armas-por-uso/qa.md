# QA — Cada arma para lo suyo (arena)

13-10-2026. Contra la petición literal y los criterios 1-7 de `requisitos.md`, con las «Decisiones
tras el plan» (Q1: todo jinete pega con espada y carga con lanza; Q2: daga inventada, el arco a la
espalda deja escudo; Q3: la lanza sin Carga se pone y no se usa).

**Qué se citó y qué se corrió.** Ningún fichero de `src/`, `test/`, `tools/` ni `data/` es más
nuevo que `implementacion.md` (21:56), así que se citan sus verdes de la pasada de simplify:
`pnpm verify` (3144 tests), `pnpm banco` (`066767b4…`, «ancla: igual»), `pnpm qa` (agente con
`weapon/armor/accessory/shield`) y `CAPTURAS_SOLO=armas,rueda-del-golpe pnpm capturas` (sale 0).
Corrí yo: tres guiones contra el núcleo por el camino real de la arena (`unidadPorDefecto` de las
hojas del taller → `batallaDeArena` → `chooseBattleAction` → `applyAction`) y el navegador:
Playwright sin pantalla contra un vite propio en el 39143 (el 3150 del usuario intacto), parado
por su grupo y con el puerto comprobado libre al acabar. Los borradores que escribí en
`data/borradores/` para probar se borraron (la carpeta no existía antes). No se tocó código.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | A la vez arma cuerpo a cuerpo, a distancia y de carga, cada una en su hueco del editor y de la ficha | ✅ | Editor: cabeceras `ARMA · ARMA A DISTANCIA · ARMA DE CARGA · ARMADURA · ACCESORIO · ESCUDO`, el arco y la ballesta en la segunda y la lanza en la tercera (captura `06-jabalina.png`). Ficha del jinete élfico: Arma = Espada, Arma a distancia = Arco, Arma de carga = Lanza de jinete, Armadura = Barda, y cada hueco con su «Poner» que solo ofrece piezas de ese hueco. Igual a 390 px de ancho, sin scroll horizontal (`scrollWidth` 390). |
| 2 | Disparo con el arma a distancia; golpe y contraataque con la de cuerpo a cuerpo (sin ella, el cuerpo); carga con la lanza (sin ella, la de cuerpo a cuerpo) | ✅ | **150 peleas al azar** de 2 contra 2 entre siete hojas (arquero élfico y goblin, ballestero, jinete élfico, hermano de carga, jinete de plaga, orko), la mitad con el tirador de fheroes2: **2165 golpes** (1021 disparos, 986 cuerpo a cuerpo, 158 cargas) y **828 contraataques**. 0 golpes fuera de la horquilla de su previsión, 0 con el arma mal nombrada y 0 contraataques mal nombrados. **Flujo real**, semilla 2, arquero (yo) contra el hermano de carga (IA): «carga de 3 hexes: 139 de daño». Con la lanza la horquilla es 50–90 ×1,7 ×1,3 = 111–199; con la espada habría sido 20–40 ×1,2 ×1,3 = 31–62. Semilla 3, el jinete mío pegado: «con Espada (cuerpo a cuerpo)», 24–48; el arquero devuelve 9 (daga, 9–18) y pega 16. Sin arma: el arquero sin daga dice «sin arma, con el cuerpo · Ataque 3 · Daño 10–10». |
| 3 | Ficha y previsión enseñan las cifras de cada arma, dónde se usa y qué daño hace | ✅ con H1 y H3 | Ficha del jinete élfico, «Armas»: `Cuerpo a cuerpo · Espada · Ataque 5 · Daño 20–40`, `A distancia · Arco · Ataque 5 · Daño 20–30`, `Carga · Lanza de jinete · Ataque 10 · Daño 50–90`, cada fila con su ⓘ. La lanza sin Carga en un arquero: «Lanza de jinete · no carga: no se usa». Barra: «Dispararías. Daño 9–14 … Cuenta: con Arco (a distancia); ataque 5 contra defensa 8 ×0,93; disparo a 11 casillas, más de 5 ×0,5». El panel de la pelea enseña las mismas filas del stack activo. Lo que falla: un arma a distancia sin disparos no sale en «Armas» (H1), y la barra no nombra el arma del contraataque (H3). |
| 4 | Arquero con arco y arma corta; jinete élfico con lanza, espada y arco y un solo perfil; los demás como hoy salvo lo dicho | ✅ | `elfo-arquero` y `goblin-arquero`: `{arma: daga, distancia: arco, armadura: jubon_de_arquero}`, 12 tiros. `imperio-ballestero`: daga + ballesta + gambesón, 8 tiros. `elfo-jinete`: `{arma: espada, distancia: arco, carga: lanza_de_jinete, armadura: barda}`, rasgo `charge`, 12 tiros, perfil `montado-arco` (`perfilEnLaArena`). Hermano de carga y jinete de plaga: espada + lanza (Q1). El disparo y la carga dan las cifras de ayer (Arco 5 / 20–30, Lanza 10 / 50–90). `orko-dos-armas` sigue con mandoble + arnés (8 / 40–70), sin armas por uso. |
| 5 | Dos manos solo con el arma cuerpo a cuerpo y el escudo; castigo del tirador; rueda del golpe | ✅ | **Navegador**: con el mandoble en Arma, poner el Pavés deja el escudo vacío y la barra dice «No se cambia: … Pavés no se puede llevar con Mandoble: es un arma a dos manos…». Con el Pavés, el Mandoble tampoco entra («quita antes el escudo»). Arco + Pavés sí entra. **Núcleo**: el jinete élfico + Pavés vale; mandoble + arco + pavés escrito a mano se rechaza. **Castigo**: en las 75 peleas con el tirador de fheroes2, todos los golpes caen en su previsión, que lleva el ×0,5 sobre la daga. **Rueda**: el hermano de carga de la arena carga 4 casillas desde (6,4) con `golpe: 'rueda'`. Normal = 167 = 70 (el cuarto 2 de la lanza: 50 + ⌊40·2/4⌋) ×1,7 ×1,4, y la misma cifra de una vez y plantándose antes de elegir (la carga guardada, 4, elige la lanza). Fuerte 208, Rápido 100. La previsión de la rueda da «normal 167–167» y «fuerte 149–268». La pasada `rueda-del-golpe` de capturas está en verde (cita). |
| 6 | Se leen los `?montaje=` y borradores de antes, convertidos | ✅ con H2 | **Enlace v6** en el navegador, con el arco en `arma` (y una pieza «Arco» cambiada, `manos: 2`) y la lanza del jinete en `arma`. La barra: «La pieza «Arco» iba en Arma: pasa a Arma a distancia, y ya no es a dos manos. La unidad «Arquero» llevaba Arco en Arma: pasa a Arma a distancia, y cuerpo a cuerpo pega sin arma (ponle una en su ficha). La unidad «Jinete (a caballo)» llevaba Lanza de jinete en Arma: pasa a Arma de carga…». Las fichas: arquero «sin arma … / Arco 6 / 20–30»; jinete «sin arma … / Lanza 10 / 50–90». **Borrador de antes en disco** (arco cambiado, honda nueva con tiros en `arma`, arquero y guerrero con cuerpo y el arma en `arma`, y un jinete élfico de antes de cuerpo y equipo): «Convertidas al formato de hoy al leerlas…», con un aviso por pieza y por unidad. El jinete de antes queda con cuerpo 5 / 60–120 y lanza 12 / 100–200 (pelea como ayer). Lo que no convierte: H2. |
| 7 | El juego no cambia: banco igual, el agente no ve los huecos nuevos, guardias vistos morder | ✅ (citado) | `pnpm banco` `066767b4…` «igual» y `pnpm qa` con los cuatro slots, en `implementacion.md` (sin cambios después). `git diff` de `src/core/contract`, `src/server` y `src/core/state`: vacío. `Hero.equipo` y `Veterania.equipo` siguen en `Equipo` (cuatro huecos, el compilador lo cierra). El héroe de la arena no tiene editor de equipo (ni cuatro ni seis huecos). Guardias vistos morder: los cita el ingeniero, no los repetí. |

## Hallazgos

### H1 — importante: un arma a distancia sin disparos no se usa, y nada lo dice

«+ Nueva pieza» en Arma a distancia nace con `Disparos 0` («sin nada que sumar»). Así, puesta en
una unidad que no dispara por su cuerpo:
- no se usa nunca;
- la lista «Armas» de la ficha no la enseña;
- el editor y la barra no avisan.

La lanza sin el rasgo Carga, en cambio, sí sale: «no carga: no se usa». Va contra el criterio 3
(«dónde se usa cada una»).

Reproducción (`pnpm arena`, `?seed=1`):
1. «Editar equipo» → en ARMA A DISTANCIA, «+ Nueva pieza». Nombre «Jabalina», Ataque 3, Daño 20–40,
   Disparos sin tocar (0).
2. «Volver al montaje». Añade el arquero al bando izquierdo y abre su ficha. En «Arma a distancia →
   Poner», elige Jabalina: sustituye al arco.
3. «Armas» enseña solo `Cuerpo a cuerpo · Daga · Ataque 4 · Daño 10–20`. El arquero ya no
   dispara, y la Jabalina sigue en su hueco sin ninguna frase.

Igual con el guerrero con escudo: Jabalina en su hueco y «Armas» con solo la Espada. En el núcleo,
`validarPiezaDeArena` acepta `{hueco: 'distancia'}` sin `disparos` o con 0, y `armasDe` solo añade
la fila de distancia si `isShooter(unit)`.

Lo que esperaba quien juega: que la ficha diga «Jabalina · no dispara: no se usa» o el editor
pida disparos. No vale rechazarla: un cuerpo con disparos propios sí la usaría.

### H2 — menor: los disparos fuera del arma, en un borrador de esta mañana, no se convierten

Hasta esta tarea, el editor de equipo (e30d4af) ofrecía «Disparos» en cualquier hueco. Hoy
`problemasDePieza` solo los admite en `distancia`, y `piezaDeAntesDeLasArmas` solo convierte lo que
viene en `arma`. Dos casos de antes no se convierten:
- un accesorio «Carcaj» con +6 disparos;
- una pieza del juego de `arma` cambiada con disparos (Espada + 4 disparos).

En los dos, la pieza pasa a no valer. La unidad que la llevaba también deja de valer: «la unidad
«Arquero goblin»: no existe ninguna pieza "carcaj"», y se monta con la hoja por defecto.

Se conserva en disco tal cual («No valen y se conservan tal cual al guardar»), y la barra lo dice.
Por eso no se pierde nada. Pero el criterio 6 pide que se lea convertido.

Reproducción:
1. `data/borradores/equipo.json` con
   `{id:'carcaj', hueco:'accesorio', calidad:'arena', disparos:6, …}`.
2. `unidades.json` con un `goblin-arquero` con cuerpo y `equipo: {arma:'arco', accesorio:'carcaj'}`.
3. Abrir la arena.

No hay borradores reales en el repo principal ni en los worktrees: es hipotético, de datos hechos
entre las 12:00 y ahora.

### H3 — menor: la barra nombra el arma del golpe, no la del contraataque

La barra dice «Contraataque: 9–18.» sin más. La previsión del núcleo sí lo trae
(`contraataque.modificadores[0]` = «con Daga (cuerpo a cuerpo)», lo prueba `test/armas.test.ts`),
pero la barra no lo pinta.

Quien juega ve el arma de su golpe y no ve con qué le devuelven el suyo, que es justo lo que cambia
en esta tarea: el jinete devuelve con la espada, no con la lanza. Se ve en la semilla 3, hermano
de carga contra el arquero, al pasar el ratón por el arquero pegado.

### H4 — menor (presentación)

- En la ficha del montaje a 1440 px, la fila «Cuerpo a cuerpo» de un arquero sin daga parte el
  texto en dos líneas: «sin arma, con el cuerpo · Ataque 3 · Daño / 10–10». Queda desalineada
  respecto a las otras dos, que caben en una (captura `04-arquero-lanza-sin-carga.png`).
- El parte de guerra no dice con qué arma fue un golpe («carga de 3 hexes: 139 de daño»). Ningún
  criterio lo pide. Se apunta porque es donde quien juega mira después.

## Observaciones (no son fallos de los criterios)

- **«¿Cómo le pongo dos armas a un personaje?»**:
  - la petición literal la responde «cada arma para lo suyo»: cuerpo a cuerpo + distancia + carga;
  - el «Orko con dos armas» sigue con el mandoble y sin forma de llevar dos armas de cuerpo a cuerpo.

  Las decisiones del usuario no lo piden, pero la pregunta pudo ir por ahí. Que lo confirme el
  coordinador.
- **La IA con el jinete élfico ya no carga.** Ahora tiene arco, y en la semilla 1, como IA contra
  el arquero, se quedó a 11 casillas disparando hasta ganar. No es un fallo, pero cambia cómo pelea
  esa hoja en la arena. Va con la issue de backlog: la IA mide la fuerza por el arma de cuerpo a
  cuerpo.
- El retoque en plena pelea funciona con las armas (núcleo):
  - cambiar el daño del arco cambia `armas.distancia` y conserva los 12 disparos que quedaban;
  - pasar de daga a espada cambia `armas.cuerpo`;
  - quitar el arco deja `shotsLeft` 0, y sin disparo legal;
  - subir el daño de la honda nueva escribe «daño 5-10 → 30-40» en el parte;
  - pasar la honda puesta de `distancia` a `arma` se rechaza: «la lleva «Arquero»: Honda va en
    Arma, no en Arma a distancia».

## Workarounds usados

- Las batallas al azar, la rueda y el retoque se probaron por el núcleo y no por clics. Usan las
  mismas funciones que la página (`batallaDeArena`, `previsionDe`, `retocarEnBatalla`), y no
  falsean nada que vea quien juega.
- En el navegador, para encontrar al enemigo barrí el lienzo con el ratón hasta que la barra dijo
  «Cuenta:». Es lo mismo que hace quien juega. Las fichas, el editor y la previsión se leyeron de la
  página real.
- Los borradores de antes se escribieron a mano en disco: es la única forma de tener datos de
  antes. Se borraron al acabar.

## No probado

- **La previsión de la carga en la barra, como jugador.** En dos semillas (barrido entero del
  lienzo), el jinete propio solo pudo golpear desde (10,3), sin línea recta. La cubren
  `test/armas.test.ts` y la previsión del núcleo, y la carga de la IA se vio en el flujo real con
  cifras de lanza.
- **La rueda del golpe en la página con un jinete cargando.** Se probó en el núcleo, de una vez y
  plantándose. La pasada `rueda-del-golpe` de capturas usa al guerrero con escudo, no a un jinete.
- **El enlace reescrito en la 7 desde la página.** El portapapeles está denegado en headless, así
  que no lo leí. Lo cubre `test/arena.test.ts`.
- **`pnpm verify:lento`.** No se corrió tras simplify; el ingeniero lo justifica: no toca el
  escenógrafo, el mapa ni el arte.

## Veredicto

**Apto con reservas.** Las cifras de cada golpe son las de su arma en todos los casos medidos:
- 2165 golpes y 828 contraataques al azar, sin ningún fallo;
- la carga de la IA con la lanza en el flujo real;
- la rueda con la lanza.

Además, el juego no cambia (banco y agente citados) y lo de antes se lee convertido y avisado. La
reserva es **H1**: un arma a distancia nueva nace sin disparos y queda muerta sin que la ficha lo
diga. Conviene corregirla antes de cerrar. H2-H4 son menores.
