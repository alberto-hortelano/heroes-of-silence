# La interfaz

Se lee antes de tocar: `src/client/comun/`, `src/client/views/`, `src/client/render/figuras/`, `src/client/render/clima/`, las hojas de estilo de `src/client/`, `src/shared/`, `tools/fuentes/`, `tools/taller/temas/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Arrancar

- **`?clima=` fuerza el clima para mirarlo** (22-10-2026) en la partida, la arena y el espectador:
  un tiempo (`despejado`, `niebla`, `lluvia`, `tormenta`), `noche` o `dia`, y lo mismo para una
  región (`region-0:tormenta`), separados por comas (`parseClima`; uno que no existe se rechaza
  diciendo qué vale, y una región que el mapa no tiene, cuáles hay: `validarForzado`, al fijarlo; en
  la arena, una región, «la arena no tiene regiones»; las tres páginas lo leen con
  `comun/clima-de-la-url.ts`). Fuerza lo que se pinta, no la noche que leen las reglas, y
  `hayQuePreguntar` no lo mira: con el menú, lo que no se entiende se dice al cargar (`pedirPartida`)
  y una región que el mapa no tiene, al abrir la partida, pidiendo quitar solo `?clima=`. `pnpm capturas` abre toda partida y todo espectador con
  `clima=despejado,dia`, decidido una vez para su navegador (`conElClimaDespejado`): `despejado`
  solo fija el tiempo, y la noche de la semilla seguía en sus regiones.

## Puertas únicas

### Con qué hoja se pinta un héroe (vuelta 2 del arranque, 19-10-2026)

`figuraDelHeroe` (`hero/tipos-de-heroe.ts`): la de su tipo en `data/figuras-de-heroe.json`, comprobada al cargar contra los tipos (`validarFigurasDeHeroe`) y contra el disco en `test/figuras-de-heroe.test.ts` (ocho direcciones, identidad, y ninguna hoja `heroe-*` sin tipo). Derivada, no guardada en el `Hero`: la leen el mapa (`HeroeEnElMapa` lleva `faction` y `tipo`), la base caminable, el retrato del menú, la batalla (`HeroeDelBando.figura`, sin opcional: la arena pone la suya o la genérica) y el espectador, con la facción y el tipo que trae el cable. Lo que el héroe ES para la crónica y el agente es `HERO_BODY` (`battle/types.ts`, `queEs`), no su figura

### Formatear un precio

`describirCoste(oro)` («15 000 oro», o «gratis»); un entero con miles («176 000»), `conMiles`

### Tema de la interfaz (uno por facción, 19-10-2026, traído de `claude/army-game-theme-ui-28d2ad`)

el tema es la facción tal cual (`FactionId`, `FACTION_IDS`, `esFaccion`, sin alias); las fichas, en el `:root` neutro de `style.css` (las que se leen sin tema) y en `temas.css`: un bloque común (`:root[data-tema]`, lo que los cinco derivan igual, también las de la rueda del golpe, `--rueda-*`) y uno por tema con lo medido en su lámina (`MUESTRAS`, `medirPaleta`, `tools/taller/temas/paleta.ts`); `style.css` las importa con `fuentes.css` (generada de `FUENTES`, `tools/fuentes/bajar.ts`), `forma.css` (la única hoja con reglas de tema, todas bajo `:root[data-tema]`) y `piezas-de-tema.css`. Que «común ∪ tema» defina toda ficha que leen las hojas con tema y el neutro las que se leen sin él (salvo las fijas `--info-*`, solo en el neutro: lo que es información, como el calor de la rueda y el nivel de un arma), lo vigila `temas.test.ts`; quién manda, `ponerTema` y `quitarTema` (los únicos que escriben `data-tema`, `src/client/comun/temas.ts`); el lienzo las lee con `temaDelLienzo` y no escribe ninguna familia de letra a mano; ninguna hoja lleva un color fijo fuera del `:root` (los tres, en `invariantes-cliente.test.ts`). La partida pone el de su jugador (`main.ts`); la arena y el espectador van en neutro (el selector «Tema» de la arena y los encargos de piezas del taller se quedaron en la rama: backlog)

### Piezas en imagen de los temas (marcos en 9 trozos, barra de sección, cartela, remate, sello, texturas)

la lista cerrada y su corte, `PIEZAS`/`DEFINICIONES`, y lo que enseña cada lámina y dónde, `POR_TEMA` (`tools/taller/temas/piezas.ts`); su sitio, su respaldo y todas sus reglas, en `forma.css`; `src/client/piezas-de-tema.css`, **generada** y solo de fichas (`cssDePiezas`, `escribirPiezasDeTema`: las medidas de la tabla y, por pieza en disco, `--pieza-<x>` con su `url()` y la marca vacía `--con-pieza-<x>`; de un marco, su corte medido, `corteDeMarco`; nadie la edita a mano: lo vigila `piezas-de-tema.test.ts`)

## El cliente

- **El clima** (22-10-2026, `docs/agents/2026-10-22-clima/`): niebla (bancos claros y fríos que
  van a la deriva y una bruma clara), lluvia (gotas de un píxel de dispositivo en dos planos y la luz
  algo más baja), tormenta (más lluvia, la luz pizarra y un rayo cada 4-9 s por región: un destello
  local de 160 ms con su trazo) y la noche (una luz azul **multiplicada**, que conserva el
  contraste —con un velo encima se leía como bruma gris—, y un azul de luna **sumado** encima,
  `NOCHE.alza`: multiplicar por azul no vuelve azul un bosque pardo, y la noche se parecía al velo de
  lo que no se mira; con los fuegos de ciudades y pueblos y las puertas de la base encendidos: un
  hueco en esa luz y un resplandor cálido). En las escenas (base, morada, batalla) las figuras llevan
  siete décimas de esa luz (`luzDeLasFiguras`, `Figura.luz`, en la celda teñida guardada; aro,
  casillas, barras y chapas sin teñir). En el mapa, la luz por regiones se **guarda** a resolución de
  dispositivo pegada al mundo (`pintarLaLuzDelMundo`) y cada fotograma es una copia entera sin escalar:
  componerla desde un cuarto costaba 5,3 ms por fotograma de noche al tope de alejar en 2560×1440 (QA
  del 22-10-2026, H9). Las gotas, del grueso de un píxel CSS en píxeles de dispositivo. Un solo pintor
  (`render/clima/clima.ts`) para el mapa y toda escena: lo que cambia es el campo, qué clima hay bajo
  cada píxel. En el mapa, por región y con el borde ondulado y blando (un frente, no el contorno por
  casillas de la niebla de guerra), tras los volúmenes y **bajo** los identificadores y la niebla de
  guerra: lo inexplorado sigue siendo `#080a10`. En la batalla, el cielo es el del tiempo (con
  tormenta no se ve el sol: gris pizarra con nubes bajas; de noche despejada, azul con luna y
  estrellas, `pintarNubesBajas`, `pintarAstros`), la luz y la bruma van horneadas en el fondo, los bancos bajo las casillas
  y la lluvia y el rayo bajo las barras y los nombres. Una escena lateral se enchufa con su
  `ClimaDelSitio` (`campoDeEscena`): `pintarSueloDelClima` entre lo suyo y las figuras y
  `pintarAireDelClima` al final; la base y la morada (`pintarBase`) heredan el de la región de su
  ciudad, y la tropa no lleva (es una ficha). Lo blando va en una capa a un cuarto que se compone
  **sin suavizado** (con el bilineal, 7-10 ms por fotograma sin GPU; con el vecino, 1 ms). El juego no
  mira `prefers-reduced-motion` (decisión del usuario, 22-10-2026: «eso es para páginas web donde
  estás leyendo, no para un videojuego»): la lluvia, el rayo y la rueda se animan siempre. Medido con `tools/qa/navegador/clima.ts` (la tabla, en
  `docs/agents/2026-10-22-clima/implementacion.md`).

- **Tema por facción** (13-10-2026 en su rama; en el juego desde el 19-10-2026): cinco, uno por
  facción, **como sus láminas** (`assets/art/temas/<tema>.png`): la paleta se mide en la lámina y
  `temas.css` la copia (`paleta-de-las-laminas.test.ts`); la forma (barras de sección con su adorno,
  botones, el día en su cartela, los emblemas, el marco del mapa con anillos de `box-shadow` que no
  mueven el lienzo), en `forma.css`; los títulos, con una OFL por tema (Cinzel, IM Fell English SC,
  Marcellus, Almendra, Germania One) desde `assets/letras/`; las piezas en imagen de Codex (43, ya
  hechas) encima de su respaldo de CSS. Sin tema nada cambia: `npx tsx tools/qa/navegador/neutro.ts main`, 0
  diferencias (19-10-2026). En la partida, el de la facción de quien juega; en el lienzo, solo lo que
  es interfaz (chapas, fondo de la vida, galones, la corona, rótulos de la base, recuadro del
  minimapa, letras). La historia y el porqué, en `docs/historia.md` y
  `docs/agents/2026-10-13-tema-por-ejercito/`, `docs/agents/2026-10-13-temas-de-las-laminas/`.

- **Figuras**: 8 direcciones y 6 acciones (`idle`, `ready`, `attack`, `hit`,
  `die`, `win`), **salvo la gente** del banco de NPC (22-10-2026: solo la hoja A, de pie y
  andando, `ArteDeFigura.clips`; no pelea y no llega a una batalla). Arte propio (`dN/atlas.webp`) o el Y Bot de su juego de armas
  teñido del color del bando; lo sin dueño, en gris. **Nunca se espeja.** Tablas:
  `JUEGO_SIN_HOJA` (el héroe genérico de la arena y el vecino), `JUEGO_DEL_YBOT`,
  `DIRECCION_DE_HOJA`. Una tropa del catálogo se pinta con la hoja de su unidad (`hojaDeUnidad`; el
  `body` de su stack es esa hoja) y un héroe con la de su tipo (`figuraDelHeroe`), que registra
  `registrarLasHojas` al arrancar (`cargarArte`) en la partida, el espectador y la arena; hasta que
  contesta, lo que no está registrado no se pinta, ni con el Y Bot (`arteSabido`). **Una figura cuya hoja va en camino no se pinta** (20-10-2026, «quita unos círculos rojos con una letra que aparecen antes de cargar»: `FiguraColocada.cargando`, `figuraEnCamino`); el óvalo de color con su inicial queda para la que no tiene arte, porque su imagen falló o no existe. Anclas del Y Bot en `_poses/atlas-8d.json` (`pnpm taller derivar-poses`).

- Ritmo: `marcha.ts` (`PRISA_DE_LA_MARCHA`), compás propio por figura con hash
  del id (`render/figuras/compas.ts`), sombra por silueta, carga hoja a hoja con cachés LRU.
