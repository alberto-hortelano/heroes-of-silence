# Unidades con arte: ids provisionales

Las facciones nuevas todavía no están en el catálogo del juego (llegan en la
fase 4). Las hojas se nombran con ids provisionales en kebab-case y esta tabla
dice a qué unidad de `NuevaJugabilidad.md` corresponde cada una. La fuente de
los ids, las descripciones y los perfiles de pose es `tools/taller/unidades.ts`.

Cada unidad tiene en `assets/unidades/<id>/`:

| Fichero | Qué es |
|---|---|
| `identidad.webp` | lámina del aspecto, ya a la cámara del juego (25°) |
| `atlas.webp` | 7 columnas × 3 filas de 256: reposo, marcha y ataque |
| `atlas.json` | ancla, altura, fotogramas y caja de clic, **derivados** de la imagen |
| `*.procedencia.json` | referencias con su sha256, hilo de Codex, prompt y sha256 del resultado |

## Sustituciones decididas por el usuario

No hay rigs de animales, así que las monturas y las bestias pasan a ir a pie:

| Antes | Ahora |
|---|---|
| Caballero montado | Hermano de carga |
| Jinetes de ciervo | Corredores del bosque |
| Jinete de jabalí | Orko berserker |
| Señor de la guerra en jabalí | Señor de la guerra a pie |
| Halcón o Lobo | Hostigador elfo |

El Ent y el artillero con culebrina se quedan.

## Templarios

| id provisional | Unidad | Perfil de pose |
|---|---|---|
| `templario-escudo` | Guerrero con escudo | espada-escudo |
| `templario-mandoble` | Guerrero con arma a dos manos | dos-manos |
| `templario-monje` | Monje | baston |
| `templario-escudero` | Escudero | espada-escudo |
| `templario-hermano-de-carga` | Hermano de carga (antes Caballero montado) | espada-escudo |
| `templario-penitente` | Penitente | dos-manos |

## No muertos

| id provisional | Unidad | Perfil de pose |
|---|---|---|
| `esqueleto-guerrero` | Esqueleto guerrero | espada-escudo |
| `esqueleto-arquero` | Esqueleto arquero | arco |
| `zombi` | Zombie | espada-escudo |
| `necrofago` | Necrófago o Ghoul | espada-escudo |
| `espectro` | Espectro | espada-escudo |
| `golem-de-huesos` | Gólem de huesos | dos-manos |

## Estado

| id | identidad | atlas | visto bueno del usuario |
|---|---|---|---|
| (se rellena por lotes) | | | |
