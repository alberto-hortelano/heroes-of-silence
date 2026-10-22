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
                  "persona": { "nombre": "…", "papel": "…", "cuerpo": "<unidad>" } | "cosa": { "nombre": "…" },
                  "dialogo": "<id>" } ],
    "dialogos": { "<id>": { "inicio": "<nodo>", "nodos": { "<nodo>": {
        "texto": "lo que dice o lo que se ve",
        "opciones": [ { "texto": "…", "si": [ … ], "hace": [ …efectos ], "ir": "<nodo>" } ] } } } },
    "encuentros": { "<id>": { "nombre": "…", "tropa": [ { "creature": "<unidad>", "count": 3 } ],
                              "alGanar": [ … ], "alPerder": [ … ] } }
  } ]
}
```

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

Las reglas que más fallan (todas las dice el vocabulario):

- **Cada premio se cobra una vez**: una opción que da algo (oro > 0, `pieza`, `tropa`) o
  abre una `batalla` tiene que apagarse sola. Lo normal: la opción pide un estado
  (`"si": [{"estado": "guardado"}]`, o el `si` de su punto) y sus efectos (o los de
  `alGanar`) cambian a otro; o pide `{"no": {"marca": "x"}}` y pone la marca `x`.
- La `batalla` va la **última** de su lista. `alGanar` admite estado, marca, oro > 0 y
  pieza; `alPerder`, solo estado y marca.
- Toda marca se declara en `marcas` (con su `falta` y su `ya`) y algún efecto la pone.
- Todo nodo se alcanza desde el `inicio`; cada punto lleva su propio diálogo (dos
  puntos no comparten uno) y todo diálogo es de algún punto; todo encuentro lo abre
  alguna opción.
- Una opción que **hace algo** va en un nodo al que se llega desde el `inicio` por
  opciones **sin `hace`**: el juego solo deja elegirla si se llega a su nodo navegando, con
  el `si` de cada opción del camino cumplido ahora. Tras una opción que hace algo, la
  conversación puede seguir (un nodo que cuenta lo que pasó, con «Seguir» o «Volver»),
  pero lo que haga algo no va ahí.

## El bucle

1. Lee `lectura.json`, mira `mapa.png` y el ejemplo.
2. Escribe `assets/mundos/<id>/historia.json` entero.
3. Corre `pnpm mundo validar <id>`. Si da problemas, cada uno dice el fichero, la ruta
   y qué falla: corrígelos (con Edit) y vuelve a validar.
4. Para cuando diga «el mundo "<id>" vale». Como mucho seis vueltas; si a la sexta sigue
   fallando, para y di qué queda.

No toques nada más del repositorio. Al acabar, di en una línea qué lugares has puesto y
dónde.
