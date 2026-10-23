---
name: motor-de-mundos
description: El motor de narrativa de Heroes of Silence. Dado el id de un mundo (assets/mundos/<id>/, con su mundo.json y su plan congelado), escribe primero su biblia.md —la trama en prosa: qué pasó, quién es quién, cómo se cruzan los sitios y sus desenlaces— y después su historia.json, que la traduce —lugares con gente, diálogos en árbol hondos, encuentros— con sentido en ese mapa; valida las dos con `pnpm mundo validar <id>` hasta que no tengan problemas y relee la historia contra la biblia. Úsala con «/motor-de-mundos <id>».
---

# El motor de mundos

Escribes la **trama** de un mundo del juego y los sitios donde se juega: los lugares con
historia que el jugador se encuentra en el mapa al andar —un puente con un guardián viejo,
un pozo con algo dentro, unos desertores en un campamento—, cada uno con su gente, sus
conversaciones en árbol, lo que se puede encontrar y lo que se puede pelear. Es lo que
sustituye a recoger recursos: el juego quiere un mapa vivo con sitios que visitar.

Y no sueltos: **detrás tiene que verse una historia**. Cada persona con un secreto, una
decisión que se nota en otro sitio (el que ayuda a los orkos es un traidor para la Orden;
la aldea se levanta esa noche si alguien abre la cripta) y gente que habla como quien es.
Un mundo de tres sitios sueltos con diálogos de dos frases es justo lo que no hay que
escribir.

El mapa ya está hecho (lo hizo el generador). Tú no lo cambias: lees dónde está cada
cosa y pones encima lugares que tengan sentido allí.

## Lo que tienes

El argumento es el id del mundo (`<id>`). Con él:

1. `assets/mundos/<id>/mundo.json`: el héroe de quien juega (`jugador.heroe`) y la
   semilla. **No lo toques.** Su facción es la de su base en el plan, y la lectura la dice
   (`jugador.faccion`).
2. `assets/mundos/<id>/plan.json`: el mapa congelado. **No lo toques.**
3. `.cache/mundos/<id>/lectura.json`: **el mapa leído para ti**. Léelo entero antes de
   escribir nada. Trae:
   - `regiones`: nombre, suelo (`grass`, `snow`, `swamp`, `lava`, `rough`, `dirt`, `sand`…),
     nivel (0 hondo, 1 llano, 2 meseta), `vecinas`, `casaDe` (la región de la base del
     jugador 0 o del rival), ciudades, pueblos, si la toca el río y **`admitenUnLugar`**:
     casillas donde un lugar puede ir. Usa una de esas, tal cual.
   - `ciudades` (con su facción y su dueño), `pueblos`, `rio`.
   - `unidades` y `piezas`: el catálogo por id. Solo existe lo que está ahí.
   - `vocabulario`: **las condiciones, los efectos y las reglas**. Es cerrado: no inventes
     claves.
   - `lugares`: **de cuántos a cuántos lugares** lleva este mundo (`de`, `a`), los de su
     tamaño de mapa.
   - `npcs`: **el banco de figuras de la gente** (ver «La gente y sus figuras»): las
     `etiquetas` (cerradas, con su frase), las `acciones` que puede llevar una figura, el
     `tope` de figuras nuevas por mundo, las `figuras` que ya hay y la `gente` de la base
     de quien juega (sus ids, nombres, papeles y etiquetas).
4. `.cache/mundos/<id>/mapa.png`: el mapa pintado, para verlo (el norte arriba). Las
   coordenadas buenas son las de la lectura, no las de los píxeles.
5. `assets/mundos/prueba/historia.json`: **un ejemplo completo** del formato. Léelo. Su
   `biblia.md` enseña las secciones de una biblia, no su largo ni su hondura: `prueba` es un
   mundo de dos lugares escrito a mano para los tests. No copies su tamaño.

## Lo que escribes

**Dos ficheros, en este orden**: primero `assets/mundos/<id>/biblia.md` (la trama en prosa)
y después `assets/mundos/<id>/historia.json` (la biblia traducida al formato del juego). La
biblia se escribe entera antes de tocar la historia: decidir qué pasa y quién es quién en
prosa es lo que hace que la historia no salga plana.

### Primero, la biblia

`biblia.md`, en español, en prosa y **sin JSON**: de 1 500 a 4 000 palabras (el validador
rechaza una de menos de 400, y una de 400 sigue siendo poca). Con estas secciones, en este
orden:

- `## Antes de que llegue el héroe`: qué pasó en esta tierra —la guerra, el crimen, la
  promesa rota, lo que se enterró— y por qué hoy hay algo pendiente.
- `## Quién es quién`: por cada persona de la trama, qué quiere, qué esconde, cómo habla
  (dos o tres giros suyos) y a quién conoce de **otros** lugares.
- `## Los lugares`: cada lugar, en qué región de la lectura y por qué ahí (el suelo, la
  ciudad de al lado, el río, el pueblo).
- `## La trama`: el hilo principal, que cruza **al menos tres lugares**: qué se sabe o se
  hace en cada uno y qué abre, cierra o cambia en el siguiente.
- `## Desenlaces`: **al menos dos**, excluyentes: cómo se llega a cada uno, qué lo cierra,
  qué se gana y qué se pierde, y qué encuentra quien llega si el rival eligió antes.
- `## Marcas`: cada marca de la historia, por su id: quién la pone y quién la lee.

La biblia no repite lo que el validador ya mira (casillas, cifras de tropa): cuenta la
historia.

### Después, la historia

`historia.json`, con esta forma (el ejemplo lo enseña entero):

```json
{
  "titulo": "…", "resumen": "…",
  "marcas": { "<id>": { "falta": "por qué falta, para la persona", "ya": "por qué ya está" } },
  "lugares": [ {
    "id": "<id>", "nombre": "…", "at": { "x": 0, "y": 0 },
    "fondo": { "plaza": "<facción>" },
    "estados": { "<id>": "nombre del estado" }, "estadoInicial": "<id>",
    "puntos": [ { "id": "<id>", "x": 0.5, "si": [ …condiciones ],
                  "persona": { "nombre": "…", "papel": "…", "figura": "<figura del banco>" } | "cosa": { "nombre": "…" },
                  "dialogo": "<id>" } ],
    "dialogos": { "<id>": { "inicio": "<nodo>", "nodos": { "<nodo>": {
        "texto": "lo que dice o lo que se ve",
        "opciones": [ { "texto": "…", "si": [ … ], "hace": [ …efectos ], "ir": "<nodo>" } ] } } } },
    "encuentros": { "<id>": { "nombre": "…", "tropa": [ { "creature": "<unidad>", "count": 3 } ],
                              "alGanar": [ … ], "alPerder": [ … ] } }
  } ],
  "figuras": { "<id nuevo>": { "descripcion": "…", "etiquetas": { … }, "talla": 1, "acciones": "reposo-y-marcha" } },
  "base": { "<persona de la base>": "<figura>" }
}
```

`figuras` y `base` son opcionales (ver «La gente y sus figuras»).

- Ids: minúsculas, cifras, `-` y `_`. Textos de una línea (sin saltos), en español.
- `x` de un punto: dónde está en la escena lateral, de 0 (izquierda) a 1 (derecha).
- `fondo.plaza`: la facción cuya plaza sirve de fondo (la del sitio, por su historia).
- Una opción sin `ir` cierra la conversación. Una opción sin `hace` solo navega.

## Qué historia escribir

- **Entre `lugares.de` y `lugares.a` lugares** (de la lectura), **cada uno en una región
  distinta**. Repártelos por el mapa —al menos uno cerca de la base del jugador
  (`casaDe: 0` o sus vecinas) para que se encuentre pronto—.
- **Una trama principal** que encadena al menos tres de ellos por marcas: lo que se hace
  o se sabe en uno abre, cierra o cambia algo en otro (quién está, qué ofrece, qué se le
  puede decir). Los demás pueden ser lugares de paso, más cortos, con su propia historia
  pequeña, mejor si tocan la grande de refilón.
- **Conversaciones hondas con la gente de la trama**: preguntarle por su pasado, por los
  otros lugares y su gente, mentirle, presionarla, y que conteste distinto según lo que ya
  se sepa (`si` con marcas). Ramas que vuelven a un tronco, no una lista de preguntas
  sueltas. Orientativo: la gente principal, **seis nodos o más y tres niveles de hondo** (el
  inicio es el primero: inicio → pregunta → respuesta son tres).
  **Sin relleno**: cada nodo dice algo nuevo —un dato, un secreto, una mentira, un cambio
  de tono—; nada de «¿y qué más?» para llegar a la cifra. Mentir y presionar son opciones
  que ponen una marca sin premio o llevan a otro nodo; la gente de paso puede ser más
  corta.
- **Con sentido en el mapa**: lee la facción de las ciudades cercanas, el suelo (una
  ciénaga, una meseta de lava), el río, los pueblos. Un puente donde el río corta el
  paso, un cementerio de no muertos junto a su ciudad, unos desertores orkos en la
  frontera. Nombra los sitios con nombres propios y usa los de las regiones y ciudades.
- **Cada lugar con algo que hacer**: hablar con alguien (con elecciones de verdad),
  encontrar algo y, en al menos uno, pelear. Y que lo que se elija cambie el lugar
  (`estado`) o deje una `marca` que otro lugar lea (la carta que se encuentra en uno
  convence al guardián de otro).
- **Gente con personalidad**: cada persona habla como quien es (un soldado viejo que no
  sabe que la guerra acabó, un sirviente no muerto que llama «amo» al héroe). El tono, el
  de la facción: templarios solemnes, no muertos lúgubres e irónicos, imperio burocrático
  y orgulloso, elfos distantes, orkos brutos y directos.
- **Premios medidos**: oro de 100 a 500, una pieza del catálogo, 1-3 de tropa. Los
  encuentros, de 3 a 6 individuos de unidades de nivel 2-3 (el validador pone el tope).
- **La tropa tiene que caber**: `jugador.tropa` de la lectura dice con qué sale el héroe,
  cuántos individuos y cuánto liderazgo le caben, y su `nota` lo resume. Si sale lleno,
  una `tropa` ofrecida al principio sale apagada («no cabe»): ponla donde tenga sentido
  que haya bajas (tras una pelea) o no la pongas.

Las reglas que más fallan (todas las dice el vocabulario):

- **Cada premio se cobra una vez**: el juego recuerda cada opción que dio algo y cada
  encuentro ganado, y no deja cobrarlos otra vez. El mundo es de los dos jugadores: lo
  que se lleva el rival ya no lo encuentra quien juega (el juego dice quién se lo llevó).
  Una opción con `batalla` da lo suyo (oro, pieza, tropa) **al ganarla**, junto con
  `alGanar`; si se pierde, no da nada y se puede volver a pelear. Aun así, una opción que da algo (oro > 0,
  `pieza`, `tropa`) o abre una `batalla` tiene que apagarse sola, para que salga apagada
  con tu frase. Lo normal: la opción pide un estado (`"si": [{"estado": "guardado"}]`, o
  el `si` de su punto) y sus efectos (o los de `alGanar`) cambian a otro; o pide
  `{"no": {"marca": "x"}}` y pone la marca `x`.
- La `batalla` va la **última** de su lista. `alGanar` admite estado, marca, oro > 0 y
  pieza; `alPerder`, solo estado y marca.
- Toda marca se declara en `marcas` (con su `falta` y su `ya`) y algún efecto la pone.
- Todo nodo se alcanza desde el `inicio`; cada punto lleva su propio diálogo (dos
  puntos no comparten uno) y todo diálogo es de algún punto; todo encuentro lo abre
  alguna opción.
- Una opción que **hace algo** se elige en un nodo al que se llega ahora desde el
  `inicio` por opciones sin `hace` cuyo `si` se cumple, o desde el nodo al que llevó la
  última opción con `hace` elegida en ese punto (pagar el peaje con `"ir": "dentro"` deja
  elegir lo de `dentro`). Si quien juega se va y vuelve, la conversación **sigue donde
  quedó** (en `dentro`), con una opción «Volver al principio» que pone el juego.
- **Una opción con `hace` e `ir` no corta su propio camino**: si tras ella hay opciones con
  `hace`, su estado y sus marcas no pueden sacar de la escena a su punto (su `si`) ni
  dejar de cumplir el `si` de las opciones a las que solo se llega por ella. Si el pago
  pasa el lugar a `pagado`, el arcón de detrás pide `pagado` (no `guardado`), y quien lo
  guarda no puede llevar `"si": [{"estado": "guardado"}]` si tras pagar se abre algo con
  él; o el pago lleva a un nodo de despedida sin `hace` (Corvo, «Pase, pase»).
- Un lugar va en una de las casillas que `admitenUnLugar` de su región: nunca en el borde
  del mapa, ni pegado a otro objeto, ni en un recinto.

## Desenlaces excluyentes

La trama se resuelve de al menos dos maneras, y **elegir una cierra la otra**. No hace falta
nada nuevo: dos marcas, y cada opción pide que no esté ninguna de las dos y pone la suya, con
su premio distinto. En otro lugar, lo que cambia se lee con la marca (un punto que solo está
con ella, una opción que solo se ofrece con ella). Así, con el sello del abad (`nodo` va en
un diálogo de un lugar; `enOtroLugar`, un punto y su diálogo en otro):

```json
{
  "marcas": {
    "sello-a-la-orden": { "falta": "nadie ha llevado aún el sello del abad a la Orden", "ya": "el sello del abad ya está en manos de la Orden" },
    "sello-a-los-orkos": { "falta": "nadie ha vendido aún el sello del abad a los orkos", "ya": "el sello del abad ya está en manos de los orkos" }
  },
  "nodo": {
    "texto": "El abad te pone el sello en la mano. «Solo hay uno. Llévaselo a la Orden o véndeselo a Gruk; los dos no pueden tenerlo.»",
    "opciones": [
      { "texto": "Llevárselo a la Orden", "si": [{ "no": { "marca": "sello-a-la-orden" } }, { "no": { "marca": "sello-a-los-orkos" } }], "hace": [{ "marca": "sello-a-la-orden" }, { "pieza": "brigantina" }] },
      { "texto": "Vendérselo a Gruk (400 de oro)", "si": [{ "no": { "marca": "sello-a-los-orkos" } }, { "no": { "marca": "sello-a-la-orden" } }], "hace": [{ "marca": "sello-a-los-orkos" }, { "oro": 400 }] }
    ]
  },
  "enOtroLugar": {
    "punto": { "id": "estandarte", "x": 0.5, "si": [{ "marca": "sello-a-los-orkos" }], "cosa": { "nombre": "El estandarte de Gruk" }, "dialogo": "estandarte" },
    "dialogo": { "inicio": "asta", "nodos": { "asta": { "texto": "Del asta cuelga el sello del abad, atado con tripa. Los orkos ya no te dejan pasar.", "opciones": [{ "texto": "Seguir" }] } } }
  }
}
```

- Cada opción pide primero que no esté **su** marca: apagada tras elegirla, dice su propio
  `ya`; apagada por la otra, el `ya` de la otra.
- El premio va en la misma opción que pone la marca: así se apaga sola y el validador no
  protesta («da algo y no se apaga a sí misma»).
- Lo que se gana y lo que se pierde tiene que ser **distinto** en cada desenlace (aliados
  distintos, una pieza o el oro, un lugar que se abre y otro que se cierra).

## El mundo es de los dos

Los estados y las marcas son de la partida, no de cada jugador: **el rival también entra en
los lugares**, y si elige un desenlace primero, el otro se le cierra a quien juega. Por eso:

- El `ya` de una marca de desenlace **describe el mundo**, nunca a quien la puso: «el sello
  del abad ya está en manos de los orkos», no «ya se lo vendiste a Gruk» ni «tú». El juego
  no dice quién puso una marca.
- La biblia dice, en `## Desenlaces`, qué encuentra quien llega tarde.
- La IA del rival elige **la primera opción con premio** en el orden escrito: el desenlace
  que va primero es el que tomará si llega antes.

## La gente y sus figuras

Cada persona se pinta con una **figura del banco de NPC**: un muñeco pintado de cuerpo
entero, de pie y andando, que reutilizan todos los mundos. El banco lo trae la lectura en
`npcs.figuras`, cada una con su `descripcion` y sus `etiquetas` (oficio, sexo, edad,
especie, facción, clase).

- **Reutiliza antes de pedir.** Para cada persona, busca en `npcs.figuras` una con su
  facción, especie y sexo, y que su descripción le pegue; nómbrala en
  `"persona": { …, "figura": "<id>" }`. Una figura puede servir a varias personas de
  lugares distintos. Si la que eliges aún no está pintada, el juego pinta a esa persona con
  la más parecida hasta que llegue.
- **Pide una nueva solo si ninguna le pega**, en `figuras` (como mucho `npcs.tope`, 4, y
  cada una usada por alguien): un id nuevo (minúsculas, cifras y `-`, que no esté en el
  banco) con
  - `descripcion`: cómo es **de cuerpo entero**, una línea de hasta 400 caracteres: ropa,
    colores, materiales, pelo, lo que lleva en las manos (pequeño: el muñeco va con las
    manos vacías). Es lo que se le dice al pintor y lo que leerá el próximo mundo para
    reutilizarla: nada de su historia, solo su aspecto.
  - `etiquetas`: una palabra de cada lista de `npcs.etiquetas`.
  - `talla`: 1 un adulto; un goblin 0,7, un troll 1,3 (de 0,5 a 2,5).
  - `acciones`: `"reposo-y-marcha"` casi siempre. `"todas"` (ataque, daño y muerte) son 8
    imágenes más que **hoy ninguna escena pinta**: pídelo solo si la historia lo necesita
    de verdad.
  Las figuras nuevas se pintan después, en segundo plano: el mundo se juega ya.
- **La gente de la base de quien juega** (`npcs.gente`: el alcaide, los encargados de
  cada edificio y los vecinos) puede llevar figura tuya en `base`, por el id de la
  persona: `"base": { "alcaide": "<figura>", "encargado-tavern": "<figura>" }`. La que no
  pongas la elige el juego del banco. Úsalo para que la base cuente tu historia (un alcaide
  anciano, una tabernera con cicatrices), con las mismas reglas: reutiliza o pide.

## El bucle

1. Lee `lectura.json`, mira `mapa.png` y el ejemplo.
2. Escribe `assets/mundos/<id>/biblia.md` entera, con sus seis secciones.
3. Escribe `assets/mundos/<id>/historia.json` entero, traduciendo la biblia.
4. Corre `pnpm mundo validar <id>` (juzga también la biblia). Si da problemas, cada uno dice
   el fichero, la ruta y qué falla: corrígelos (con Edit) y vuelve a validar. Como mucho
   **ocho vueltas**; si a la octava sigue fallando, para y di qué queda.
5. Cuando diga «el mundo "<id>" vale», **relee la biblia contra la historia**:
   - cada lugar y cada persona de la biblia están en la historia, y al revés;
   - la trama cruza al menos tres lugares por las marcas de `## Marcas`;
   - hay al menos dos desenlaces y cada uno pide `no` de la marca del otro;
   - nada de la historia contradice la biblia (nombres, quién sabe qué, qué pasó).
   Lo que no case se arregla en el fichero que esté mal, y se vuelve a validar.

No toques nada más del repositorio. Al acabar, di en una línea qué lugares has puesto y
dónde, y cuáles son los desenlaces.
