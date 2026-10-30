---
name: revisar-animaciones
description: La revisión de las animaciones de una figura del taller (Heroes of Silence). Dado el id de una unidad, revisa primero su maniquí (que no ande hacia atrás, que el reposo no baile, que el arma se lea), después lo pintado con dos jurados —subagentes de Claude y ChatGPT por Codex— y la UNIÓN de sus hallazgos, dos árbitros, el visor animado para la persona con lo que está en disputa, el encuadre corregido sin modelo (C1), y para la pose y la coherencia varias versiones de cada hoja de las que entra la que gana a ciegas en los dos órdenes. Úsala con «/revisar-animaciones <id> [dN…]».
---

# Revisar las animaciones de una figura

Juzgas si las animaciones pintadas de una figura valen y, si no, consigues otras mejores
**sin dar nada por bueno que no haya visto la persona**. Lo medido que justifica cada paso
está en `docs/agents/2026-10-30-evaluar-animaciones/experimentos.md`; si cambias el orden o
quitas un paso, léelo antes.

Tres ideas que no se negocian:

- **El maniquí primero.** Lo pintado se juzga contra el maniquí dándolo por bueno; si el
  maniquí anda hacia atrás o su reposo baila, ningún jurado lo ve y ninguna versión lo
  arregla. En 7 de 22 casos del visor el defecto era del maniquí.
- **Unión, no intersección.** Claude y ChatGPT se equivocan en cosas distintas: juntos ven
  el 95 % de lo fabricado; exigir que coincidan pierde la cuarta parte. La severidad sirve
  para ordenar, no para filtrar.
- **Una corrección es una selección.** Ninguna receta gana siempre: se piden varias
  versiones y entra la que gana a ciegas a la de ahora en los dos órdenes; si ninguna gana,
  se queda la de ahora y se dice.

Los programas (`pnpm taller …`) son herramientas de los jueces, no jueces: dibujan paneles,
miden, piden juicios y escriben. Tú y los subagentes miráis las imágenes.

## Lo que tienes

El argumento es el id de una unidad de `tools/taller/unidades.ts` (y, si se dan, las
direcciones: `d0 d1`; sin ellas, las ocho). Todo lo de la revisión queda en
`.cache/taller/revision/<id>/`:

- `d<n>/<clip>/`: los paneles (`tira.png`, `superposicion.png`, `encuadre.png`,
  `coherencia.png` y, en un bucle, `bucle.png`), `paneles.json` (qué es cada uno, en el
  orden del prompt), `cifras.json`, `prompt.md` (el mismo para los dos jurados) y los
  juicios.
- `d<n>/veredicto.json` e `instrucciones-<h>.txt`: lo que queda tras los árbitros.
- `d<n>/versiones/` y `d<n>/eleccion-<h>.json`: las versiones de cada hoja y la elegida.
- `visor/`: los casos para la persona y sus respuestas.

El entorno de visión (Python, en `.cache/vision/.venv`) lo crea `pnpm taller vision-instalar`
si falta. Codex va por la suscripción: no cuesta dinero, pero tiene cuota; si una orden dice
que no hay cuota, para y dilo.

## El flujo

### 1. El maniquí

```bash
pnpm taller maniqui <id> --huesos      # el esqueleto de cada hoja, junto a ella (no toca las hojas)
pnpm taller revisar-maniqui <id>
```

`revisar-maniqui` dice si una marcha o una carga anda hacia atrás (medido en el mundo), si el
reposo se mueve más de lo tolerable y en qué fotogramas el arma no se lee (de punta o detrás
del cuerpo), y qué hojas pintadas se pintaron sobre otro render del maniquí.

- **Un aviso de sentido: PARA.** El arreglo va en el maniquí (`tools/taller/unidades.ts` o
  `tools/art/poses.ts`) y lo decide la persona: pregúntale enseñándole el aviso. El
  trabajador tampoco pinta sobre él (lo rechaza diciéndolo).
- Un reposo que se mueve o un arma que no se lee: díselo a la persona, con el visor del
  maniquí (`pnpm taller visor-maniqui <id>`, arrancado como el visor del paso 4: cada clip
  de tres cuartos, de lado y de espaldas, con sus avisos), y sigue si no lo cambia. Las
  notas del arma llegan solas a la versión `todo` (paso 5).
- **Hojas pintadas sobre OTRO maniquí** (`revisar-maniqui` y `revisar` las avisan con ⚠):
  el maniquí cambió desde que se pintaron, así que no son un fallo del pintor ni se pueden
  «dejar como están». **Van directas a `versiones` (paso 5)**. Juzgarlas (paso 2) solo
  sirve para sacar instrucciones: el prompt del juez ya sabe que lo que difiera por el
  cambio de maniquí no es culpa de la pintura. Y en el paso 6 la de ahora no vale como
  referencia: `elegir` hace un torneo entre las versiones.

### 2. Los dos jurados

```bash
pnpm taller revisar <id> [dN…]          # los paneles, prompt.md y juicio.gpt.json de cada clip
```

Lanza `revisar` en segundo plano (ChatGPT tarda de 30 a 60 s por clip, tres a la vez) y, a la
vez, el jurado de Claude: **subagentes de 6 a 8 clips cada uno** (no más: con más, se
cansan y empiezan a dar por buenos los últimos). Si `revisar` aún no ha dejado los paneles,
espera a que estén (`prompt.md` en la carpeta del clip). A cada subagente le das, por clip, la
carpeta, y le pides que:

1. lea `prompt.md` y mire las imágenes de `paneles.json` en ese orden, con cuidado;
2. escriba `juicio.claude.json` en la misma carpeta, SOLO el JSON del esquema que dice el
   prompt (el de `tools/taller/revision/esquemas.ts`, `juicioSchema`), con `clip` el id que
   pide el prompt;
3. no lea los juicios de ChatGPT ni de otros subagentes.

Cuando estén los dos juicios de los clips:

```bash
pnpm taller jurado unir <id> [dN…] [--clips=idle,walk]   # valida los dos y une sus hallazgos (union.json)
```

Si un juicio no cumple el esquema, nombra otro clip o fotogramas fuera de 1..7, o es de
antes de la hoja de hoy, `unir` dice cuál, qué y con qué se rehace: que el subagente lo
rehaga. Los juicios de ChatGPT llevan al lado la huella de lo que juzgaron (`.huella`):
si la hoja cambió, `revisar` los rehace solos. `--clips` vale también en `arbitrar` y
`cruzar`.

### 3. Los árbitros

```bash
pnpm taller jurado arbitrar <id> [dN…]  # el árbitro de ChatGPT y arbitraje.prompt.md
```

El árbitro de Claude es otro subagente (uno o dos para toda la figura): lee
`arbitraje.prompt.md` de cada clip, mira las imágenes de `paneles.json` y escribe
`arbitraje.claude.json` (el esquema `arbitrajeSchema`: una decisión por hallazgo de la unión,
con su `indice`, y lo que nadie vio en `omitidos`). Que no lea `arbitraje.gpt.json`. Después:

```bash
pnpm taller jurado cruzar <id> [dN…]    # veredicto.json e instrucciones-<h>.txt
```

Real si los dos árbitros dicen real, falso si los dos falso; lo demás, **disputa, que cuenta
como defecto probable** (de 5 disputas, 4 eran reales).

### 4. El visor, con lo que está en disputa

```bash
set -m
pnpm taller visor <id> > /tmp/visor-<id>.log 2>&1 &
VISOR=$!
set +m
```

Imprime la URL (el puerto lo elige el sistema): pásasela a la persona y dile cuántos casos
hay. Cada respuesta se guarda sola. Cuando diga que ha terminado, para el visor por su grupo
(`kill -TERM -"$VISOR"`, comprobando antes que `$VISOR` es su propio líder de grupo) y vuelve
a cruzar, que lee sus respuestas:

```bash
pnpm taller jurado cruzar <id> [dN…]
```

### 5. Las correcciones

- **El encuadre** (la figura que baila o resbala) se corrige sin el modelo: C1 va en el
  empaquetado, con los pies en el suelo. `pnpm taller reprocesar <id>-d<n>-<h>` rehace el
  post-proceso desde el crudo de Codex **solo si ese encargo sigue en la cola** (`hecho/` o
  `fallido/`) y su crudo en `~/.codex`, y su maniquí no ha cambiado desde que se pintó; para
  casi todo el catálogo no es así, y lo pintado antes se arregla repintándolo (`versiones`).
  No pidas una versión solo por un defecto de encuadre si se puede reprocesar.
- **La pose y la coherencia**, por hoja con algún defecto real o en disputa de severidad 2 o
  más (las de `instrucciones-<h>.txt`):

  ```bash
  pnpm taller versiones <id> d<n> <h>   # encola la otra tirada, «esqueleto» y «todo»
  pnpm taller                           # las pinta
  ```

  Dile a la persona cuántas pinturas son antes de lanzarlas si son muchas (más de una docena).

### 6. Elegir, ver y adoptar

```bash
pnpm taller elegir <id> d<n> <h>        # cada versión contra la de ahora (o entre sí), a ciegas y en los dos órdenes
```

- **Contra la de ahora** (lo normal): vale la versión que gana algún clip sin perder
  ninguno; si ninguna, `eleccion-<h>.json` lo dice y **se queda la de ahora**: díselo a la
  persona, con el motivo. Si hay ganadora, vuelve al visor (paso 4): enseña la ganadora
  frente a la de ahora a ciegas.
- **Torneo** (si la de ahora se pintó sobre otro maniquí, y entonces quedarse con ella no
  es una opción): las versiones se comparan entre sí, todas contra todas. Gana la que gana
  todos sus duelos; si no hay una clara, lo dice y propone las dos mejores. En los dos
  casos el visor enseña las dos finalistas y decide la persona.

Las comparaciones guardadas llevan la huella de lo que compararon: si una versión se
repinta, `elegir` la compara otra vez. Solo si la persona prefiere la ganadora (o, en un
torneo sin ganadora clara, elige una de las dos):

```bash
pnpm taller adoptar <id> d<n> <h>       # a assets/, con la elección en su procedencia, y junta la dirección
```

`adoptar` lanza si no hay ganadora (contra la de ahora) o si la persona no la eligió: no lo
fuerces.

Lo adoptado se vuelve a revisar (paso 2, solo esa dirección). **Como mucho dos rondas por
hoja**: si tras la segunda sigue mal, déjalo dicho para la persona.

## Al acabar

Escribe, por hoja revisada, qué pasó: la versión adoptada, o «se queda la de ahora» y por
qué, y lo que queda mal. Si cambiaste `tools/taller/revision/juez.md`, el jurado hay que
volver a medirlo con `tools/taller/revision/calibracion/` antes de fiarse de él.
