# QA — Solo oro: sin minas ni recursos (21-10-2026)

Rama `claude/game-tuning-start-a0b1d8`, árbol de trabajo sin commit. Lo valido como quien juega,
con lo que pide «Cómo se prueba» de `requisitos.md`: mirar el juego, no hacer tests de jugabilidad.

**Ya en verde y no repetido** (lo dice el coordinador): `pnpm verify` (3801 pasados), `pnpm qa`
con el contrato final, `pnpm banco` y los guardias lentos de los ficheros tocados.

**Corrido aquí:**
- `pnpm capturas`, una vez, a `scratchpad/capturas/`. Salió **0**, «sin errores en consola», en
  763 s (la máquina iba cargada: load 5-8). Las pasadas de arena devolvieron `data/unidades.json` y
  `data/equipo.json` como estaban: `git status` no los marca.
- Tres recorridos con Playwright sin pantalla, contra un `vite` propio:
  - el puerto 3187 (`--strictPort`); el 3100 era de `/home/al/code/heroes`, de otra sesión, y no
    lo toqué;
  - lo arranqué con `set -m` y lo maté por su grupo; `ss` dice que el puerto quedó libre.

  Las tres semillas son la 1, con templarios: `?seed=1&faccion=templarios`. Consola vacía en las
  tres.

## Criterios

| Criterio (petición literal y decisiones) | | Evidencia |
|---|---|---|
| La barra enseña un solo oro y «+N/día» | ✅ | `desktop-01-mapa-dia-1.png`, recortada: «28 000 +500/día ⓘ», con el icono de las monedas y sin ningún otro recurso. En el móvil (`movil-01-mapa.png`) cabe en una línea con el día. |
| La nota de la barra dice de dónde sale el oro | ✅ | El `aria-label`, tal cual: «Oro al día: cobras Valdeluz 500. Cobran las ciudades y los pueblos unidos a tu base; uno que cortan deja de darte oro.» El bocadillo se abre al pasar el ratón, bajo la barra, sin cortarse (`recorrido/01-nota-de-la-barra.png`). Con El Soto cobrado dice «cobras Valdeluz 500, El Soto 250». |
| La base produce oro | ✅ | «+500/día» el día 1. El castillo, en «Ingresos», dice «500 oro/día». En s2 (orkos), el día 3 de `desktop-15` marca 13 460. |
| Un pueblo da 250 al día **si su región está unida a la base** | ✅ | s1, día 1: tomé node-4 (8,14) y node-5 (2,17), los dos nodos de la región de El Soto que no eran míos (el otro es la base). Con el primero la barra sigue en «+500/día»; con el segundo pasa a «+750/día». El día 2 empieza con **28 750** (28 000 + 750). |
| El pueblo, al señalarlo en el mapa, dice que da 250 y si te paga | ✅ | Antes de tomarlo: «El Soto: da 250 de oro al día a quien tenga su región unida a su base (a ti no te paga) · llegas hoy (6 pasos).» Después: «… (ya te paga) · …» (`recorrido/07-pueblo-que-paga.png`). Aldea del Pozo y Hontanar, con «a ti no te paga». |
| El lateral del reino, con las ciudades y los pueblos que cobran | ✅ | Sin pueblos: «CASTILLOS Valdeluz +500». Con El Soto: «CASTILLOS Valdeluz +500 · PUEBLOS El Soto +250», y la crónica dice «Paso tomado en (8, 14)», «Paso tomado en (2, 17)». La ciudad cortada que da «+0» no la vi pintada (ver «No probado»). |
| Costes en oro | ✅ | «Ampliar» del día 1, s1: casa consistorial 2500, castillo **15 000**, gremio I 4500, taberna y mercado 1750, armería 4500, forja 2250, establos 7000 y monasterio 2250, todo en «oro». La armería vende en oro (brigantina 700, barda 2000). Las moradas, «210 oro cada uno» (`desktop-05-morada…`). En la arena, el precio en oro y «gratis» con 0 (`arena-12-equipo.png`). |
| Construir algo caro dice «no alcanza el oro: cuesta … y tienes …» | ✅ | s1: el día 1 compré 8 bardas y me quedé en 7500 oro; el día 2 tenía 8000. El castillo sale apagado, y su `title` y la línea roja de su fila dicen «no alcanza el oro: cuesta 15 000 oro y tienes 8000 oro» (`recorrido/06-castillo-sin-oro.png`). Lo demás que cabía, encendido. |
| No hay minas en el mapa, ni montones, ni huecos raros donde estaban | ✅ | Miré `desktop-01/02/03`, `desktop-15` (el mapa entero), `inicio-04`, `movil-01`, `espectador-01`, `sin-arte-01` y mis capturas `04`, `05` y `07`: solo hay pueblos, cofres, nodos, ciudades y asaltantes. Ninguna senda acaba en un claro vacío ni lleva un ramal que no va a nada. |
| Nada visible nombra madera, mineral, minas ni recursos | ⚠️ casi | Barra, lateral, paneles de base y morada, armería, arena, espectador, prosa del agente y crónica: limpios (grep abajo). **Quedan voces de vecinos** en `data/vecinos.json`, ver H2. |
| El espectador sin recursos | ✅ | `espectador-01-mapa.png`: cada jugador lleva una fila «oro» y nada más. |
| Consola sin errores | ✅ | `pnpm capturas`: «sin errores en consola». Mis tres recorridos: `consola: []`. |

## Hallazgos

### Importante

Ninguno.

### Menor

**H1. Con 0 de oro el motivo dice «y tienes gratis».**
- `oroBlocker` formatea lo que tienes con `describirCoste`, y `describirCoste(0)` es «gratis».
- Lo comprobé en el núcleo: `oroBlocker(15000, 0)` → «no alcanza el oro: cuesta 15 000 oro y
  tienes gratis».
- Se llega gastando justo hasta 0. Todo cuesta decenas, así que es raro, pero posible.
- Lo leen construir, reclutar, la armería y contratar héroe.
- Lo esperado: «y tienes 0 oro».
- Reproducir:
  1. Abre `?seed=1&faccion=templarios`.
  2. Gasta en la armería y en la morada hasta dejar el oro a 0.
  3. Señala «Construir» de cualquier edificio al día siguiente.

  Visto solo en el núcleo, no llegué a 0 en pantalla.

**H2. Hay vecinos que hablan de la madera y la piedra como si hiciera falta traerlas.** Son las
voces de respaldo, sin agente, de `data/vecinos.json`:
- `templarios/encargados/market/frases/1`: «La madera sube, el mineral baja. O al revés, según
  quién pregunte.» Habla del precio de recursos que ya no existen, y lo dice el encargado del
  mercado.
- `orkos/encargados/hall/frases/1`: «Si quieres construir algo, trae piedras. Muchas.» Lo dice el
  del ayuntamiento, que es donde se construye, y suena a requisito.
- `templarios/encargados/hall/frases/0` («lo que cuesta la piedra»), `templarios/encargados/lvl2/frases/1`
  («Piedra hay. Lo que falta es quien la pague»), `elfos/encargados/fort/frases/0` y
  `orkos/encargados/lvl6/frases/1` son ambiente. Con solo oro se leen bien.

El guardia «no queda más recurso que el oro» busca nombres en inglés, así que no los ve.
- Lo esperado: el vecino no nombra un recurso que no existe.
- Reproducir: en una base templaria con mercado, o una orka, sin agente, habla con su encargado.
  No lo vi en pantalla: lo saqué con grep.

**H3. El `<li>` del oro lleva `title="Oro"` y además su «ⓘ».**
- Al pasar el ratón por la nota, el navegador puede enseñar el tooltip nativo «Oro» junto al
  bocadillo.
- En las capturas sin pantalla no sale. Es cosmético.

**H4. El espectador escribe el oro sin separador de miles.**
- Dice «oro 20000», y la barra de quien juega, «28 000».
- Ya era así antes (`p.resources.gold`): no es una regresión. Lo apunto porque ahora es la única
  cifra de economía que se ve allí.

## Workarounds usados

- **«Ver mapa entero» y alejar 8 pasos** para señalar pueblos lejos del héroe. Es un botón del
  juego: quien juega lo tiene igual. No falsea nada.
- **Comprar 8 bardas** para quedarme sin oro y ver «no alcanza el oro». Es un flujo legítimo del
  juego. Con 27 500 de salida no hay nada que no quepa el día 1, porque «ya se ha construido hoy»
  va antes que el oro.
- **El punto exacto de los nodos** lo saqué del núcleo con `tsx`: la región de El Soto y sus
  nodos node-4 y node-5. Lo usé solo para saber dónde pulsar. Los clics y lo que se lee son los de
  la página.

## No probado

- **El «+0» de una ciudad propia cortada de la base**, con su `title` «No está unida a tu base: no
  da oro». Hace falta tener una segunda ciudad y que te corten un paso: varios días de partida,
  fuera del presupuesto. El ancla de los paneles (`test/paneles.test.ts`, en `verify`) cubre ese
  `title`.
- **El oro de un cofre en la crónica** («+N de oro»). No abrí ninguno.
- **`tools/qa/neutro.ts`**: la barra cambia a propósito y daría diferencias.
- **El mercado**: está fuera de alcance. Sigue diciendo «El mercado aún no hace nada: no hay con
  quién comerciar.»

## Pasada adversarial: el grep

- En `src/` (`.ts`, `.css`, `.html`, sin comentarios), las palabras en español madera, mineral,
  mercurio, azufre, cristal, gemas, mina(s) y recurso(s) solo salen en tres sitios:
  - la prosa del agente, que dice que **no** hay minas ni otros recursos, y el rechazo de `mines`
    y `resources`;
  - `--info-madera`, el color de las puertas de la muralla de la arena;
  - `data-veta="madera"`, la veta de la rueda.
- En inglés (resource, mine, wood, ore…) en `src/client` y `src/server`: solo el id `#resources`
  de la barra y la clave `top.resources`, que quedaron fuera a conciencia (`hallazgos-simplify.md`,
  «Descartado»). Nadie los ve.
- En `data/`: solo los `_comment` de la conversión y las voces de H2.
- `assets/iconos/recursos/` sigue y va al build. Está en el backlog del plan y el juego no lo lee.

## Veredicto

**Apto con reservas.**

La petición se cumple en el flujo real:
- un solo oro en la barra, con «+N/día» y una nota que dice de dónde sale;
- la base cobra;
- el pueblo cobra 250 justo cuando su región queda unida a la base (visto en s1: +500 → +750 y
  28 000 → 28 750), y al señalarlo lo dice;
- todo cuesta oro, y lo caro dice «no alcanza el oro: cuesta 15 000 oro y tienes 8000 oro»;
- el mapa sale sin minas ni montones y sin huecos;
- consola limpia en `capturas` y en el recorrido.

Las reservas son menores y de texto: «tienes gratis» con 0 de oro (H1) y dos voces de vecinos que
nombran madera, mineral y piedras (H2).
