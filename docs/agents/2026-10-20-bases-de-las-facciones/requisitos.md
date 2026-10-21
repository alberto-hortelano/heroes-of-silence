# El arte de la base de las otras cuatro facciones (20-10-2026)

Rama `claude/game-tuning-start-a0b1d8` (sin fusionar). Sigue a la morada dentro de la base
(`docs/agents/2026-10-20-recluta-en-la-morada/`), que dejó el arte solo para los templarios.

## Petición literal

> «Haz que el selector de elegir faccion no cambie de tema en hover sino en click y crea el arte
> de las demas facciones con codex»

## 1. El selector de facción

- Pasar el puntero o el foco por una facción **no** cambia el tema. Lo cambia marcarla: con el
  clic, con el dedo o con las flechas (`change` del radio).
- Escape sigue volviendo al menú, en el neutro. La elección del héroe sigue con el tema elegido.
- Lo juega la pasada «arranque» de `pnpm capturas`. Antes comprobaba la vista previa al pasar el
  puntero; ahora comprueba que pasar el puntero o el foco no viste y que el clic y las flechas sí.

## 2. El arte de la base de no muertos, imperio, elfos y orkos

Va igual que el de los templarios (`tools/taller/base.ts`, `docs/agents/2026-10-09-base-caminable/`):

- por tramo, un **maestro** con sus edificios y una **placa** sin ellos;
- una **edición** por mejora (`town_hall`, `city_hall`, `mage_guild_2`);
- la **versión abierta** de cada morada;
- todo por Codex y la suscripción (`pnpm taller`), nunca fal.ai.

**Manda el cuadro**: las puertas y las regiones se miden sobre lo pintado y se escriben en
`data/bases/<f>.json`. Luego `recortar-base` deriva los recortes y el índice.

Lo que cambia respecto a los templarios:

- **Sin hoja de identidad.** Los templarios heredaron los crudos de la vuelta 1 del caballero. Las
  otras cuatro no tienen crudos, así que cada edificio va descrito en el prompt
  (`ARTE_DE_LA_BASE`).
- La villa, la heráldica, el suelo, lo que cierra la plaza, la junta y la paleta van por facción.
  El estilo sale de la lámina de su facción en `assets/art/`.
- **Los sitios sin edificio** (el 4, 5 y 6 de los no muertos, por ejemplo) no se piden: son plaza.
  En no muertos y elfos el tramo 1 se quedaba sin nada. Su morada 2 pasa a él, porque cada tramo
  necesita alguna puerta.

### Criterios

1. Las cuatro facciones tienen sus cinco tramos, el suelo y un recorte por edificio que se levanta
   en su base: cada primer eslabón y cada mejora.
2. Cada morada tiene su versión abierta, que se ve al reclutar en ella.
3. De frente, a la escala de la silueta del adulto y con el pie de cada edificio en el borde del
   suelo, como los templarios. Lo que salga torcido se retoca sobre la placa (`retoques`).
4. En el juego, con `?faccion=<f>`, la base se ve pintada; con un clic en una morada, la casa se
   abre y los reclutas salen delante.
5. `pnpm verify` y `verify:lento` en verde. El banco no cambia, porque el núcleo no se toca.

## Fuera de alcance

- Volver a pedir el arte de los templarios.
- Sitios nuevos o moradas nuevas.

## Contexto

- Vite sigue en :3201 (tarea `b3fa34puy`).
- Codex: binario `/usr/lib/chatgpt/resources/codex`, ~1,5 min por imagen. Dos trabajadores en
  paralelo. Si se acaba la cuota (`FalloDeCodex.sinCuota`), se para y se dice.
- Primero un piloto: el tramo 3 de cada facción (pueblo, ayuntamiento y castillo), que se mira
  antes de pedir lo demás.

## Lo que pasó (20-10-2026, coordinador)

- **El piloto** (el tramo 3 de cada facción, con tres edificios) salió a escala y de frente, y se
  dio por bueno.
- **Los tramos de uno o dos edificios salieron grandes.** Codex llenó el tramo y pintó la puerta de
  230-320 px. Se repitieron con el recuadro de cada edificio dibujado en la guía (`huecosPedidos`).
  Salieron más pequeños, pero con la puerta aún de 190-275 px.
- **Así que se encogen sobre la placa** (`encoger-base`): cada edificio de puerta mayor de ~195 px
  se recorta de lo pintado por su diferencia con la placa, se encoge hasta una puerta de ~165 px con
  la puerta y el pie quietos, y se pega encima. Los castillos no se tocan: su portón es alto. Los
  factores, a ojo sobre la rejilla, van en `ARTE_DE_LA_BASE[f].encoger`.
- **El suelo repetible** pide 192 filas de empedrado limpio. Con una sola placa no había. Las placas
  que llegaron antes que las demás «fallaron» en el paso de después y se reprocesaron al estar todas.
- **Las puertas se midieron así**: la columna, a ojo sobre una rejilla del maestro; la fila, por la
  mediana de la línea del pie en ±80 px alrededor de la puerta. Si se apartaba más de 20 px del
  suelo medido a ojo, se tomó el de a ojo: con la puerta oscura, la línea se iba a la sombra.
- Codex hizo unas 80 imágenes: 33 maestros (13 repetidos), las placas (alguna repetida con su
  maestro), 12 mejoras y 15 versiones abiertas.
