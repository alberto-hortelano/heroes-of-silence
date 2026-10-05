# Unidades con arte: ids del catálogo

Las facciones nuevas llegan al catálogo en la fase 4 **con estos mismos ids**
(decisión de la sesión de reglas, 01-10-2026): no se renombran. Esta tabla dice
a qué unidad de `NuevaJugabilidad.md` corresponde cada uno. La fuente de
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
| `templario-hermano-de-carga` | Hermano de carga, **montado** (antes Caballero montado) | montado-lanza (celda 384, 4 filas: reposo, paso, carga, ataque con espada) |
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

## Héroes

Sin lámina propia en `assets/art/`: aspecto de la descripción, acabado de la
lámina de su facción (`ESTILO_DE_FACCION` en `tools/taller/unidades.ts`).

| id provisional | Héroe | Perfil de pose |
|---|---|---|
| `heroe-templario-caballero` | Caballero | espada-escudo |
| `heroe-templario-abad` | Monje (Abad) | baston |
| `heroe-templario-inquisidor` | Inquisidor | espada-escudo |
| `heroe-templario-gran-maestre` | Gran Maestre | dos-manos |
| `heroe-nigromante` | Nigromante | baston |
| `heroe-vampiro` | Vampiro | espada-escudo |
| `heroe-lich` | Lich | baston |
| `heroe-caballero-de-la-muerte` | Caballero de la muerte | dos-manos |

Lote 2 (héroes): **aprobado por el usuario el 01-10-2026**, visto animado.
Correcciones en su hilo: `heroe-templario-caballero` y
`heroe-caballero-de-la-muerte` (`-c1`) y `heroe-templario-gran-maestre` (`-c2`),
todas por la espada invadiendo la celda vecina en el ataque.

## Imperio

| id | Unidad | Perfil de pose |
|---|---|---|
| `imperio-alabardero` | Alabardero | dos-manos |
| `imperio-piquero` | Piquero | dos-manos |
| `imperio-ballestero` | Ballestero | ballesta |
| `imperio-coracero` | Coracero | espada-escudo |
| `imperio-arcabucero` | Arcabucero | ballesta |
| `imperio-rodelero` | Rodelero | espada-escudo |
| `imperio-artillero-culebrina` | Artillero con culebrina | ballesta |
| `imperio-pistolero-montado` | Pistolero montado (04-10-2026) | montado-lanza (Y Bot: `montado-pistola`) |
| `imperio-granadero` | Granadero (04-10-2026) | ballesta (Y Bot: `granada`) |
| `heroe-imperio-duelista` | Duelista (héroe; sustituye al Noble, 04-10-2026) | espada-escudo |
| `heroe-imperio-mago` | Mago de batalla (héroe) | baston |
| `heroe-imperio-capitan-mercenario` | Capitán mercenario (héroe) | espada-escudo |
| `heroe-imperio-ingeniero` | Ingeniero (héroe; con rifle desde el 04-10-2026) | ballesta |

## Elfos

Las de `NuevaJugabilidad.md` (decisión del usuario, 05-10-2026): fuera el ent, el hostigador, el corredor del bosque y el señor de las bestias; entran el jinete, la sacerdotisa y el asesino.

| id | Unidad | Perfil de pose |
|---|---|---|
| `elfo-arquero` | Arquero | arco |
| `elfo-explorador` | Explorador | espada-escudo |
| `elfo-guardia-del-bosque` | Guardia del bosque | espada-escudo |
| `elfo-jinete` | Jinete a caballo (05-10-2026) | montado-lanza (Y Bot: `montado-arco`) |
| `elfo-sacerdotisa` | Sacerdotisa (05-10-2026) | baston |
| `elfo-asesino` | Asesino (05-10-2026) | espada-escudo |
| `heroe-elfo-danzante-de-espadas` | Danzante de espadas (héroe) | espada-escudo |
| `heroe-elfo-druida` | Druida (héroe) | baston |
| `heroe-elfo-cantora` | Cantora (héroe) | baston |

## Orkos

| id | Unidad | Perfil de pose |
|---|---|---|
| `orko-hacha-escudo` | Orko con hacha y escudo | espada-escudo |
| `orko-dos-armas` | Orko con dos armas | dos-manos |
| `goblin-lancero` | Goblin lancero | espada-escudo |
| `goblin-arquero` | Goblin arquero | arco |
| `troll-maza` | Troll con maza | dos-manos |
| `orko-berserker` | Orko berserker (antes Jinete de jabalí) | dos-manos |
| `goblin-fanatico` | Goblin fanático | espada-escudo |
| `heroe-orko-kaudillo` | Kaudillo (héroe) | dos-manos |
| `heroe-goblin-jefe` | Jefe goblin (héroe) | espada-escudo |
| `heroe-orko-chaman` | Chamán (héroe) | baston |
| `heroe-orko-senor-de-la-guerra` | Señor de la guerra a pie (héroe) | dos-manos |

Lote 3 (Imperio, Elfos y Orkos, tropas y héroes): **aprobado por el usuario el
01-10-2026**, visto animado. Corregidos en su hilo (`-c1`), por el arma invadiendo
la celda vecina en el ataque: `elfo-corredor-del-bosque`, `elfo-guardia-del-bosque`,
`goblin-lancero`, `heroe-orko-senor-de-la-guerra`, `imperio-alabardero`,
`imperio-piquero` y `troll-maza`. Desde este lote la regla del aire entre figuras va
en el prompt base de todo atlas. Ballestero, arcabucero y artillero usan el perfil
`ballesta` (encarar el arma al hombro); el piquero lleva la pica a vez y media su
altura para que quepa en su celda.

## Estado

Lote 1 (Templarios y No muertos): **aprobado por el usuario el 01-10-2026**, visto
animado en `pnpm taller vista` y en capturas de batalla.

| id | identidad | atlas | notas |
|---|---|---|---|
| `templario-escudo` | ✔ | ✔ | |
| `templario-mandoble` | ✔ | ✔ | |
| `templario-monje` | ✔ | ✔ | el ataque es `casting`: acaba de rodillas golpeando con el bastón |
| `templario-escudero` | ✔ | ✔ | |
| `templario-hermano-de-carga` | ✔ | ✔ | **montado desde el 02-10-2026**: caballo 3D de referencia (`tools/art/montura.ts`) y celda de 384; el arte a pie anterior queda en el historial |
| `templario-penitente` | ✔ | ✔ | |
| `esqueleto-guerrero` | ✔ | ✔ | corrección `-c1`: la espada invadía la celda vecina |
| `esqueleto-arquero` | ✔ | ✔ | |
| `zombi` | ✔ | ✔ | |
| `necrofago` | ✔ | ✔ | |
| `espectro` | ✔ | ✔ | corrección `-c1`: la espada invadía la celda vecina |
| `golem-de-huesos` | ✔ | ✔ | |

**Pendiente conocido, aceptado:** algunos ciclos de marcha no son del todo finos
(los pies no siempre alternan limpios). Es un límite del modelo de imagen al
repintar las poses del Y Bot; el usuario decidió seguir con ellos. Si se rehacen,
`pnpm taller corregir <id>-atlas "…"` reabre el mismo hilo y conserva la identidad.
