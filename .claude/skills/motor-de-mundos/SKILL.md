---
name: motor-de-mundos
description: El motor de narrativa de Heroes of Silence. Dado el id de un mundo (assets/mundos/<id>/, con su mundo.json y su plan congelado), escribe su historia.json —lugares con gente, diálogos en árbol, encuentros— que tengan sentido en ese mapa, y la valida con `pnpm mundo validar <id>` hasta que no tenga problemas. Úsala con «/motor-de-mundos <id>».
---

# El motor de mundos

Escribes la **historia** de un mundo del juego: los sitios con historia que el jugador
se encuentra en el mapa al andar —un puente con un guardián viejo, un pozo con algo
dentro, unos desertores en un campamento—, cada uno con su gente, sus conversaciones en
árbol, lo que se puede encontrar y lo que se puede pelear. Es lo que sustituye a recoger
recursos: el juego quiere un mapa vivo con sitios que visitar.

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
   - `npcs`: **el banco de figuras de la gente** (ver «La gente y sus figuras»): las
     `etiquetas` (cerradas, con su frase), las `acciones` que puede llevar una figura, el
     `tope` de figuras nuevas por mundo, las `figuras` que ya hay y la `gente` de la base
     de quien juega (sus ids, nombres, papeles y etiquetas).
4. `.cache/mundos/<id>/mapa.png`: el mapa pintado, para verlo (el norte arriba). Las
   coordenadas buenas son las de la lectura, no las de los píxeles.
5. `assets/mundos/prueba/historia.json`: **un ejemplo completo** del formato. Léelo.

## Lo que escribes

Un solo fichero: `assets/mundos/<id>/historia.json`, con esta forma (el ejemplo lo
enseña entero):

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

- **De 2 a 4 lugares**, cortos: cada uno se juega en unos minutos. Repártelos por el
  mapa —al menos uno cerca de la base del jugador (`casaDe: 0` o sus vecinas) para que se
  encuentre pronto— y en regiones distintas.
- **Con sentido en el mapa**: lee la facción de las ciudades cercanas, el suelo (una
  ciénaga, una meseta de lava), el río, los pueblos. Un puente donde el río corta el
  paso, un cementerio de no muertos junto a su ciudad, unos desertores orkos en la
  frontera. Nombra los sitios con nombres propios y usa los de las regiones y ciudades.
- **Cada lugar con algo que hacer**: hablar con alguien (con elecciones de verdad),
  encontrar algo y, en al menos uno, pelear. Y que lo que se elija cambie el lugar
  (`estado`) o deje una `marca` que otro lugar lea: los lugares pueden conectarse (la
  carta que se encuentra en uno convence al guardián de otro).
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
2. Escribe `assets/mundos/<id>/historia.json` entero.
3. Corre `pnpm mundo validar <id>`. Si da problemas, cada uno dice el fichero, la ruta
   y qué falla: corrígelos (con Edit) y vuelve a validar.
4. Para cuando diga «el mundo "<id>" vale». Como mucho seis vueltas; si a la sexta sigue
   fallando, para y di qué queda.

No toques nada más del repositorio. Al acabar, di en una línea qué lugares has puesto y
dónde.
