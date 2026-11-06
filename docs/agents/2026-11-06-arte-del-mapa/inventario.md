# El arte de quien sale en el mapa (06-11-2026)

Petición del usuario: «Me asaltaron unos bandidos y no tenían arte, comprobar que la tengan y si
falta algún personaje del mapa.»

## Lo que se miró

- **En disco**: cada figura con sus ocho `dN/atlas.json` y `dN/atlas.webp`
  (`arteEnOchoDirecciones`), en este worktree y en la copia de trabajo de `main`
  (`/home/al/code/heroes`), la que sirve el `pnpm dev` del 3100.
- **Lo que se registra**: la lista de `/__arena/hojas` (`hojasDelTaller`), la de este worktree y la
  que sirve ahora el 3100: las 50 hojas (34 de tropa y 16 de héroe) llegan con su arte, ninguna
  incompleta ni con el Y Bot.
- **Cada atlas por dentro** (las 50 × 8): la imagen mide lo que piden sus filas y columnas, el
  `sha256` es el de la imagen, ninguna fila de un clip está vacía (alfa) y ningún clip pide más
  fotogramas que columnas.
- **En la página** (Playwright, `pnpm dev` en el 3118): los 8 grupos de asaltantes de las semillas 2
  y 3 de cerca, de día y de noche con tormenta, y una emboscada (s11, 6 × caballero de la muerte) en
  el despliegue y en la batalla. Sin errores ni avisos en la consola, ni un 404.

## Inventario

| Quién sale | De dónde | Unidades | Arte en 8 direcciones |
|---|---|---|---|
| Asaltantes | `data/asaltantes.json`, `composiciones` | goblin-lancero, esqueleto-guerrero, zombi, orko-hacha-escudo, troll-maza, caballero-de-la-muerte, orko-armadura-pesada, jinete-de-plaga | las 8, enteras |
| Monstruos que guardan | el generador, del catálogo | cualquiera de las 34 | las 34, enteras |
| Guarnición neutral | `data/ciudades.json`, `guarnicionNeutral` | templario-escudo, templario-escudero, esqueleto-guerrero, zombi, imperio-alabardero, imperio-piquero, elfo-arquero, elfo-guardia-del-bosque, goblin-lancero, goblin-arquero | enteras |
| Guarnición de base y reclutas | `data/ciudades.json`, `data/unidades.json` (`edificio`) | las 34 del catálogo: 6 templarios, 6 no muertos, 9 imperio, 6 elfos, 7 orkos | las 34, enteras |
| Héroes | `data/figuras-de-heroe.json` (`figuraDelHeroe`) | 16 tipos: caballero, abad, inquisidor; nigromante, vampiro, lich; duelista, mago, capitán mercenario, ingeniero; danzante de espadas, druida, cantora; kaudillo, jefe goblin, chamán goblin | las 16, enteras |
| Gente de la base y de los lugares | `data/npcs.json` (banco de NPC) | 22 figuras, de las cinco facciones | las 22, enteras (hoja A) |
| Encuentros de los mundos | `assets/mundos/*/historia.json` | esqueleto-guerrero, goblin-arquero, goblin-lancero, imperio-ballestero, imperio-coracero, orko-dos-armas, orko-hacha-escudo, zombi, espectro, elfo-arquero, elfo-guardia-del-bosque, imperio-alabardero | enteras |
| Personaje (`core/rpg/`) | — | sin hoja a propósito (`JUEGO_SIN_HOJA`): el Y Bot. Una partida nueva no tiene ninguno | — |

**No falta arte de nadie.** Nada se ha encolado en el taller.

## Por qué los bandidos salían «sin arte»

Tienen arte y se pinta con él, en el mapa y en la batalla. Lo que se veía es que **un grupo de
asaltantes detrás de un volumen quedaba tapado entero**, y en el mapa solo quedaban su estandarte
morado y su chapa con el número, que se pintan encima de todo (`pintarIdentificador`): eso se lee
como un marcador sin arte.

- El mapa funde figuras y volúmenes por profundidad, y una figura puede quedar detrás de un árbol
  (decisión del usuario). Un **monstruo** no queda tapado: es un objeto y su reserva no deja que un
  volumen de delante lo cubra. Un **héroe** tapado sigue con su inicial. Un **grupo de asaltantes**
  anda por donde quiere y no lleva reserva: un pico de la fila de delante, que sube dos o tres
  casillas, lo cubre entero.
- Medido al empezar, en las semillas 1-20 (`.cache/arte-del-mapa/tapados.ts`, caja de la figura
  contra la silueta de lo que se pinta después): de 160 grupos, 6 tapados en un 80 % o más (5 casi
  enteros: s4 raider-6, s9 raider-0, s10 raider-5, s11 raider-1, s16 raider-5); de 160 monstruos,
  ninguno. Y como patrullan, a lo largo de la partida pasan por más sitios así.
- De noche o en la ciénaga, el zombi y el esqueleto, grises y oscuros, casi no se distinguen aunque
  no los tape nada (s2, raider-0 y raider-1): no es falta de arte.

## Lo que se cambió

`pintarAsaltantesAlTrasluz` (`src/client/render/mapa.ts`): tras pintar lo que tiene altura, y antes
del clima (que los tiñe igual que a lo demás), cada grupo de asaltantes se vuelve a pintar con su
arte a 0,7 (`pintarFiguraAlTrasluz`, `render/figura.ts`: la celda y nada más, sin sombra ni
marcador). Encima de sí mismo no cambia nada —los mismos píxeles sobre los mismos—; detrás de un
pico o de un árbol, se ve quién está. Capturas: `.cache/arte-del-mapa/asaltantes-tapados-antes-y-despues.png`
(con 0,45) y `.cache/arte-del-mapa/s9-trasluz-07.png` (con 0,7).

Lo que cuesta: un `drawImage` más por grupo a la vista y fotograma, de la celda ya guardada. Un
héroe delante de un grupo lleva encima el grupo a 0,7 donde se solapan (raro: emboscan al pisar su
región, no al lado).

## Dudas para el usuario

1. ¿Vale el trasluz a 0,7, o se prefiere otra cosa (una silueta morada solo de lo tapado, o que el
   grupo vaya siempre delante de la masa)? La silueta pide saber qué píxeles tapa cada volumen.
2. ¿Lo mismo para el héroe rival y para la tropa propia tapados por un pico? Hoy solo los asaltantes.
3. Si los bandidos salieron en la batalla con el Y Bot gris (y no solo en el mapa), no se ha podido
   reproducir con el código de hoy: diría en qué semilla y día, o con una marca (M).
