# Evaluar y mejorar las animaciones del taller: experimentos (30-10-2026)

Petición del usuario: «inspecciona las animaciones generadas y mira cómo mejorarlas.
Necesitamos primero una forma de evaluación que funcione bien, combina métodos
automáticos con tus capacidades de visión y las de ChatGPT […] sacar un esquema de
muñeco de palos de cada frame […] fallos de encuadre […] el personaje vibra […] fallos
de coherencia». Los métodos programáticos son herramientas de los jueces, no jueces.

Todo lo de aquí vive en `tools/taller/revision/` (Python en un entorno `uv` aislado en
`.cache/vision/`, decisión del usuario) y sus salidas en `.cache/taller/revision/`.

## 1. El muñeco de palos de verdad: el esqueleto del maniquí

`pnpm taller maniqui <id> --huesos` vuelve a renderizar el maniquí de la unidad en la
caché y, por hoja, escribe `d<n>-<h>.huesos.json`: cada hueso de Mixamo
(`HUESOS_DEL_MANIQUI`, 20) proyectado por la cámara a píxeles de la celda, con su
profundidad, y cada pieza del atrezo por los dos extremos de su eje más largo (el arma).
Se apunta en la página de sprite-forge antes de pintar cada fotograma (`apuntarHuesos`),
así que la imagen sale igual: **las hojas del render con huesos son idénticas byte a byte
a las de `assets/`** (sha256 de `d0-a.png`, `d0-a.profundidad.png` y `d3-b.png` del
caballero de la muerte). Comprobado a ojo sobre la profundidad y sobre el color (pierna
roja = derecha, azul = izquierda). Se lleva al atlas con el `deLaPose` de la procedencia
de la hoja (`origen + k · (p − apoyoReposo)`, `datos.py`).

## 2. El muñeco de palos de lo pintado: estimadores de pose

Medidos sobre el maniquí en color (280 celdas, 8 direcciones, sin la muerte), PCK con un
error ≤ 0,2 del tronco:

| Estimador | PCK@0,2 | Muñecas | Piernas cruzadas | Tiempo (CPU) |
|---|---|---|---|---|
| RTMPose-x body7 (`rtmpose-x`) | **0,83** | 0,29 / 0,43 | 0 | 23 s |
| RTMW-x cocktail14 (`rtmw-x`) | 0,79 | 0,36 / 0,40 | 0 | 25 s |
| DWPose (`dwpose`) | — (el modelo ya no se descarga) | | | |

Sobre lo pintado, a ojo: las piernas y la cadera las encuentra bien; los brazos con
arma, capa o escudo, a menudo mal (los jueces lo confirman: «la mayoría de los desvíos
de brazo del estimador salen del escudo, la capa o la armadura»). **Sirve para colocar
(la cadera, el tronco) y para enseñar, no para juzgar la pose de los brazos.**

## 3. La vibración, medida

- Con el centro del cuerpo estimado frente al esperado del maniquí: con un fotograma
  movido a mano, encuentra el salto de 12 px el 100 % de las veces, el de 6 px el 60 %
  y el de 3 px el 25 %; el ruido es de unos 2 px.
- Con la correlación del tronco entre fotogramas seguidos (`deriva_del_tronco`), menos
  lo que se movió la cadera del maniquí: con correlación ≥ 0,7, el desplazamiento
  fabricado se recupera exacto (error mediano 0 px, ≤ 1 px el 75-85 %).
- En los clips reales salen saltos verticales de 4 a 20 px con buena correlación: el
  empaquetado coloca cada figura de la hoja A por **su** píxel más bajo y la mediana de su
  caja (`apoyoEn`), y el maniquí, que sube y baja la cadera al correr, no cuenta. Los
  árbitros lo confirman en 9 de 18 clips reales: el casco sube y baja 20-60 px a
  contrafase del maniquí, o los pies resbalan 8-15 px.

## 4. Los jueces de visión

**Corpus 1**: 42 clips de 6 unidades (caballero de la muerte, elfo arquero, vampiro,
piquero, templario de escudo, zombi). 24 con un defecto fabricado y oculto (desplazar 6 o
12 px, escala ±12 %, espejo, fotograma de otra dirección, color, dos fotogramas
permutados, ninguno) y 18 reales. Clips con nombre ciego (`c01…`); las etiquetas fuera
de su carpeta. Rúbrica cerrada: `rubrica.schema.json`.

Los jueces:
- **Claude:** subagentes de 6 a 8 clips cada uno, que leen el prompt y las imágenes.
- **ChatGPT:** `codex exec -s read-only --ephemeral -i … --output-schema`, unos 30-60 s
  por clip.

Las variantes:
- **tira:** el maniquí y lo pintado.
- **paneles:** la tira más la superposición de los muñecos, el encuadre con guías y piel
  de cebolla, la coherencia con el giro y el bucle.
- **cifras:** los paneles más las cifras automáticas en el prompt.

Detección de lo fabricado («vio» = marca el fotograma; «estricto» = con la categoría
buena), 21 casos:

| Juez y variante | Vio | Estricto | Bien en reales |
|---|---|---|---|
| Claude, tira | 0,81 | 0,71 | 8/18 |
| Claude, paneles | **0,95** | **0,86** | 8/18 |
| Claude, cifras | 0,95 | 0,81 | 7/18 |
| ChatGPT, tira | 0,80 | 0,67 | 2/13 |
| ChatGPT, paneles | **0,95** | **0,86** | 3/18 |
| Claude ∪ ChatGPT (paneles) | | **0,95** | |
| Claude ∪ Claude cifras ∪ ChatGPT | | 1,00 | |
| Claude ∩ ChatGPT (paneles) | | 0,76 | |

- Los paneles ganan a la tira en los dos jueces. Las cifras en el prompt no ayudan a
  Claude.
- **Se equivocan en cosas distintas**: Claude se deja 2 de 3 espejos; ChatGPT, 2 de 3
  desplazamientos de 6 px. La unión cubre lo que falla cada uno; exigir que coincidan
  pierde la cuarta parte.
- En los clips reales, ChatGPT es mucho más severo (da por buenos 3 de 18, frente a 8 de
  18 de Claude).

**El oro de los reales**: dos árbitros independientes (un Claude y ChatGPT, `arbitrar.py`)
deciden hallazgo a hallazgo real / falso / dudoso y añaden lo omitido; lo que no comparten
lo mira el usuario en el visor (`visor.py`, animado a la velocidad del juego).

## 5. Lo que ve la persona: el visor animado

El jurado mira paneles quietos, y la vibración y el sentido de un movimiento solo se ven
moviéndose. `visor.py` sirve en local una página con las animaciones a la velocidad del
juego, en orden al azar, y guarda cada respuesta (36 casos el 30-10-2026, respondidos por
el usuario):

- **El oro:**
  - De 17 hallazgos que los dos árbitros dieron por reales, el usuario ve 15: 9 se notan
    jugando y 6 apenas. Los árbitros son algo indulgentes, con un 88 % de acierto.
  - De 5 en disputa, 4 eran reales: **una disputa hay que tratarla como defecto probable**.
- **Los jueces:**
  - Todo lo que marca Claude con paneles se ve, y 4 de 6 se notan jugando.
  - ChatGPT con paneles acierta 8 de 9, pero 6 de ellos apenas se ven: es más sensible y
    caza lo fino. **Unión de los dos, y la severidad para ordenar.**
- **La vibración:** la recolocación C1 gana en 6 de 8 clips (4 en x e y, 2 solo en x). La
  original gana solo en los 2 donde el maniquí estaba mal.
- **La base falla.** En 7 de 22 casos el usuario culpa al maniquí:
  - anda hacia atrás;
  - el reposo se mueve demasiado;
  - el ataque solo amaga el golpe;
  - la espada se pierde de punta o detrás del cuerpo, y el pintor la inventa o la quita.

  El jurado no lo puede ver, porque juzga contra el maniquí dándolo por bueno.

## 6. La base: el maniquí

- **Hacia atrás.** `walk (2)` y `run (2)` del pack de espada y escudo andan y corren hacia
  atrás. Medido con el esqueleto: el pie de apoyo va hacia donde mira el cuerpo. Las
  llevaban 10 marchas y 26 cargas de 45 unidades. Se cambian por `walk` y `run`, que
  quedan fuera del catálogo de clips (`poses.ts`).
- **El visor del maniquí** (`casos_maniqui.py`): el usuario juzgó los 20 clips en uso y 35
  candidatos del muestrario (`pnpm taller muestrario <u> --fotogramas`).

  | Clip | Unidades | Juicio | Sustituto |
  |---|---|---|---|
  | `idle` (en guardia) | 4 | gira la cabeza y confunde al pintor | `block_idle` |
  | `idle_look_around` (ligeros) | 13 | se mueve demasiado | `idle4` |
  | `quick` (golpe corto) | 20 | amaga, no golpea | `precise` |
  | `heavy` con el mandoble | 4 | clava la espada y la hace bailar | `precise` |
  | `slash4` | 2 | da una voltereta | `precise` |

  Siguen `heavy` con espada y escudo, maza y mayal (le gusta) y los reposos, daños y
  muertes restantes.
- **`revisar_maniqui.py`** avisa de tres cosas:
  - una marcha o una carga hacia atrás;
  - un reposo que se mueve más de 0,08 del alto;
  - un arma que se lee en unos fotogramas y en otros no, de punta (escorzo) o detrás del
    pecho.

  En el zombi d1 marca el 3, el 4 y el 5 del ataque, justo donde el usuario vio
  desvanecerse la espada. El sentido se mide en pantalla, y la carrera lo confunde: falsos
  avisos en d0 y d4. Hace falta el esqueleto en el mundo.

## 7. Las correcciones


Sobre `caballero-de-la-muerte` d0, la hoja A (reposo, marcha y carga) y la B (ataque,
daño y muerte), cada variante es una hoja nueva pedida a Codex (`correcciones.ts`). Se
compara con la original **a ciegas**: el maniquí arriba y A / B debajo, en los dos órdenes
(`comparar.py`, juez ChatGPT). Solo cuenta lo que gana en los dos órdenes.

| Variante (hoja A) | Gana / pierde / no coincide (de 3 clips) |
|---|---|
| `control` (otra tirada, lo de siempre) | 1 / 1 / 1: el ruido de base |
| `esqueleto` (la profundidad con el muñeco encima) | 2 / 1 / 0: reposo y carga con confianza 3 |
| `sin-pose-del-giro` (el aviso en el texto) | 2 / 1 / 0 |
| `todo` (esqueleto + aviso + instrucciones) | **3 / 0 / 0** |
| `editar` (la hoja pintada para editar, con el esqueleto y las instrucciones de los jueces) | 2 / 1 / 0 |
| `instrucciones` (por fotograma, en una hoja nueva) | no se pudo juzgar: falló dos veces de dos |

- Todas pierden la marcha, que en la original ya estaba bien.
- **La fuga de pose del giro es sistemática**: la otra tirada de lo de siempre vuelve a
  pintar el reposo en guardia abierta y cambia de pose en el 6 y el 7.
- **Las instrucciones por fotograma en una hoja nueva fallan al empaquetar**: el crudo
  trae las 21 figuras, pero con la espada vertical que piden las filas se tocan y el
  detector de figuras las funde. Es un fallo de robustez del recorte.

Hoja B del caballero (ataque, daño y muerte): otra tirada, 0 / 2 / 1; `editar`, 0 / 2 / 1;
`instrucciones`, 1 / 0 / 2. El usuario, en el visor, elige `instrucciones` para el ataque y
el daño, y `editar` para la muerte.

**En otras unidades no generaliza** (hoja A; gana / pierde / no coincide):

| Unidad | Otra tirada | `esqueleto` | `todo` |
|---|---|---|---|
| caballero d0 | 1/1/1 | 2/1/0 | 3/0/0 |
| vampiro d3 | — | 2/1/0 | 2/1/0 |
| elfo arquero d1 | **2/0/1** | 0/2/1 | 0/2/1 |

En el elfo, `todo` le lleva la mano al carcaj, una acción que no está en el maniquí.
**Ninguna receta gana siempre**: lo que mejora la animación es pedir varias versiones y
quedarse con la que gana a ciegas en los dos órdenes. La compuerta de la comparación es la
corrección.

## 8. El flujo que sale de aquí

1. **El maniquí primero:** `revisar_maniqui.py` y el visor del maniquí. Lo que falla se
   corrige en el maniquí, no en el pintor.
2. **Los paneles de cada clip** y el jurado: Claude y ChatGPT, con la **unión** de sus
   hallazgos.
3. **El árbitro**, y lo que esté en disputa al visor de la persona.
4. **El encuadre** se corrige sin modelo (C1 en x e y).
5. **La pose y la coherencia:** varias versiones (otra tirada, `esqueleto` y `todo`, con las
   instrucciones del jurado y las notas del arma), y entra la que gana a ciegas en los dos
   órdenes; si no gana ninguna, se queda la que había.

