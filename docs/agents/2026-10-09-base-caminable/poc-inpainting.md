# Prueba de concepto: cuadro maestro → placa vacía → recorte por diferencia (vuelta 3)

09-10-2026. Este documento prueba el método del usuario con la mitad izquierda de la plaza del caballero. Tiene los seis sitios: catedral (lvl6), morada 4, gremio, taberna, morada 2 y morada 1. El ayuntamiento cae en la costura y queda fuera.

No se ha tocado `src/`. Todo está en `tools/poc-base/` y se retira borrando la carpeta. Los intermedios van a `.cache/poc-base/`, que está ignorado. Codex se ha usado con la suscripción: **0 $**.

## Qué se hizo

| Paso | Orden | Resultado |
|---|---|---|
| Guía e identidad | `npx tsx tools/poc-base/maestro.ts guia` | La guía del panorama izquierdo con cada RELLENO numerado del 1 al 6, y una hoja con las seis fachadas actuales numeradas |
| Maestro | `… maestro` (campo.webp + lámina templaria + guía + identidad) | 1 intento, 97 s. **Bueno**: un solo cuadro, con la misma luz en todo |
| Placa por `exec resume` del hilo | `… placa <hilo>` | **Falló dos veces**: `websocket closed by server before response.completed`. Es el mismo fallo de `pnpm taller corregir` en la vuelta 2: hoy `resume` con imagen no es fiable |
| Placa como petición nueva, con el maestro adjunto | `… placa-nueva` | 1 intento, 64 s. **Buena** |
| Mejora (morada 2 → `knight_upgrade_2`) | `… mejora` (maestro + la fachada de la mejora) | 1 intento, 73 s. **Buena**: solo cambia ese edificio |
| Variante B: el maestro como edición del panorama vacío que ya está en el juego | `… maestro-sobre-panorama` | 85 s. **Peor**; ver «Variante B» |
| Recorte y composición | `npx tsx tools/poc-base/recorte.ts` | Máscaras, recortes y cinco composiciones |

**Cómo es el recorte** (`recorte.ts`):
1. La diferencia entre el maestro y la placa: el canal que más cambia.
2. Un desenfoque de σ 4 y un umbral de 30.
3. Una apertura (σ 3) para quitar motas y un cierre (σ 10) para unir los trozos.
4. Un relleno por columna, del primer píxel encendido al último.
5. Se recorta a la región del sitio y se funde a 2 px.

La morfología está en JS: con `raw` de un canal, sharp devolvía más canales y las máscaras salían al 150 % de su región. sharp hace la lectura y la composición.

La composición se hace a la escala del juego: 1440×900, paso 89,26 px, ×0,70 del panorama. Lleva tres Y Bot `civil` de 0,95 pasos como vara de medir.

## Medidas de deriva (placa frente a maestro, fuera de los edificios)

`deriva.py`, en el scratchpad. Mide la diferencia por zona y el desplazamiento por correlación de fase, en la zona entera y en bloques de 128×128 del suelo.

| Zona | \|Δ\| medio por píxel | Con desenfoque σ 3 | Color medio (maestro → placa) | Desplazamiento |
|---|---|---|---|---|
| Suelo lejos (y 760-1024) | 13,4 / 255 | **2,3** | (159,112,63) → (160,109,60) | **(0, 0)**, también en los 16 bloques |
| Suelo junto al pie (y 640-760) | 15,4 | **3,1** | (167,118,65) → (168,116,63) | (0, 0) |
| Cielo (y 0-50) | 5,3 | 2,1 | (149,93,50) → (152,93,50) | (0, 0) |

**Qué dicen las cifras:**
- **Geométricamente no deriva nada**: ni un píxel de desplazamiento, ni global ni por bloques.
- **El color medio** se mueve 1-3 niveles.
- **La textura fina sí se repinta**: el pico de la correlación es 0,28-0,43 (con píxeles idénticos sería ~1), y por eso el \|Δ\| crudo es de 13-15. Desenfocado baja a 2-3: es la misma imagen en baja frecuencia con otro grano encima.
- Por filas, la diferencia salta del 0 % (y ≥ 704) al 77-90 % (y 192-576), justo donde están los edificios. Ver `capturas/poc-diferencia.png`.

**La mejora frente al maestro** es del mismo orden:
- en el suelo, 12,8 crudo y 2,0 desenfocado, con desplazamiento (0, 0);
- fuera de su sitio, entre el 0,4 % y el 1,1 % de los píxeles pasan de 25;
- en su sitio, el 49 %.

La edición es local.

**Riesgo principal, medido**: la deriva de las ediciones de Codex se queda en el grano, no en la posición ni en el tono. Con el umbral sobre la diferencia desenfocada, el grano no entra en la máscara: la deriva queda 10 veces por debajo del umbral.

## El riesgo que de verdad aparece: Codex no respeta la geometría de la guía

Se mide el pie y el centro de cada edificio en su máscara y se comparan con la guía (`arcoDeLaPlaza`):

| Sitio | Centro pintado / guía (px) | Pie pintado / guía (fila) |
|---|---|---|
| 1 lvl6 | 144 / 134 | 667 / 888 |
| 2 lvl4 | 408 / 358 | 628 / 803 |
| 3 guild | 632 / 582 | 617 / 750 |
| 4 tavern | 878 / 806 | 607 / 715 |
| 5 lvl2 | 1150 / 1030 | 602 / 691 |
| 6 lvl1 | 1413 / 1254 | 621 / 677 |

- **El arco sale casi plano**: del centro al extremo la guía baja 211 px y el cuadro solo 65.
- **Los edificios casi no giran.**
- **Los apretó hacia la derecha**, hasta 159 px.
- **Las puertas miden 130-140 px**: el encargo pedía 166 (1,3 pasos), así que miden ~1,1 adultos.

Las regiones de `recorte.ts` están medidas sobre el cuadro, no tomadas de la guía. **Con este método, la disposición se deriva del maestro, no al revés**:
- la `x` y el pie de cada sitio salen de su máscara;
- el borde de lo que se pisa sale del empedrado de la placa;
- la puerta se mide a mano, como ya se hace en `fachadas`.

Así el semicírculo queda en lo que Codex quiera pintar: más plano que el ajuste 2 aprobado.

## Juicio de cada captura (miradas con Read)

- **`poc-maestro.png`**:
  - Cumple lo que pedía el usuario: un solo cuadro con una luz, los seis edificios reconocibles, cada uno con su identidad (rosetón y campanario de la catedral, torre del gremio, dianas de la morada 2), y el pie apoyado en el mismo empedrado.
  - En contra: la curva es mucho más plana que la guía, y la paleta es otoñal y más cálida que el panorama actual (hojas naranjas por todas partes).
- **`poc-placa.png`**:
  - Plaza creíble: un muro bajo de piedra con hiedra y árboles de otoño, y casas detrás.
  - Se mantienen el mismo empedrado, el cielo y el encuadre.
  - Queda un resto de un anexo de la catedral en el borde izquierdo (x < 35, y 590-690).
- **`poc-mascaras.png`**: limpias. Cada edificio entero, con el tejado y el estandarte, y sin los huecos de hiedra entre edificios, que pasan a la placa. Cubren entre el 68 % y el 79 % de su región.
- **`poc-compuesta-1.png`** (solo el gremio):
  - **Integrado.** La torre se apoya en el empedrado, delante del muro de la placa, con su sombra de contacto y las hojas al pie.
  - No se nota que sea un añadido.
- **`poc-compuesta-3.png`** (catedral, gremio y morada 2): igual. Los huecos entre ellos enseñan muro y árboles de la placa y se leen como plaza.
- **`poc-compuesta-todos.png`**: casi idéntica al maestro. A ×0,7 no se distingue.
- **`poc-compuesta-vecinos.png`** (morada 4 y taberna, sin el gremio que va entre ellas):
  - El costado derecho de la morada 4, que en el maestro tocaba la torre, queda limpio.
  - Aquí casi no se solapaban. No he probado un caso de solape fuerte, donde un edificio tape media fachada de su vecino; allí el recorte del de detrás llevaría un trozo del de delante.
- **`poc-mejora.png`** (catedral, gremio y la morada 2 mejorada):
  - **Integrada.** Mismo pie y giro, con tejado de teja roja y una galería más.
  - No se nota la costura con el muro de la placa.
- **`poc-costuras-x2.png`**: cuatro recortes a ×2, a resolución completa (pie del gremio, tejado del gremio, pie de la catedral y borde derecho de la morada 2 con su estandarte).
  - **La costura no se ve en ninguno**: el fundido de 2 px cae sobre el grano repintado y lo esconde.
  - Lo único que delata la máscara es que el estandarte del gremio flota delante de una casa de la placa que en el maestro no estaba detrás. Se lee bien igualmente.
- **`poc-variante-b-maestro.png`**: ver abajo.

**Veredicto visual: el método integra.** Es justo lo que no tenían las fachadas sueltas. El fallo está en la geometría, no en la integración.

## Variante B: maestro = editar el panorama actual (descartada)

La idea era aprovechar que el panorama del juego sí siguió la curva, y usarlo directamente como placa. No vale:
- Codex **movió el borde del empedrado** para hacer sitio (a la derecha subió de ~500 a ~590 px).
- **El suelo derivó más**:
  - junto al pie, 10,1 desenfocado, frente a 3,1;
  - correlación 0,13-0,20, frente a 0,3;
  - desplazamientos de 1-2 px por bloque.
- La curva sigue casi igual de plana.

Una placa que no sale del mismo maestro no sirve.

## Lo que no se hizo: ponerlo en el juego

No era barato:
- el juego coloca cada fachada por `colocarFachada` en la `x` del sitio, y aquí las `x` y los pies salen del cuadro (tabla de arriba);
- habría que cambiar el índice del arte (placa + recortes en su sitio), el modo de pintar y la disposición;
- la mitad derecha no existe en este estilo: el panorama de la derecha que hay es de otra paleta.

Por eso las composiciones son PNG a la escala del juego, con figuras.

## ¿Escala?

**Las dos mitades y la costura.**
- La mitad derecha se pide con la placa izquierda como `contigua`, como ya hace el taller, para el borde y la luz.
- Su placa se pide igual, con el maestro derecho adjunto.
- La costura queda en x = 12, **detrás del ayuntamiento**, que siempre existe (village_hall, town_hall, city_hall). No hace falta su placa: nunca se ve vacío.

**El ayuntamiento.**
- Se hace con un encargo «central»: un recorte de 1536 px centrado en la costura (768 de cada maestro), editado para poner el `village_hall`.
- Encima van las ediciones de `town_hall` y `city_hall`, recortadas a su región.
- Esa misma pieza central funde la costura de las dos mitades.

**Cuántos encargos tiene el caballero.**

| Qué | Encargos |
|---|---|
| Maestro izquierdo y derecho, con los 11 sitios no-ayuntamiento en su primer eslabón | 2 |
| Dos placas | 2 |
| Pieza central: los tres ayuntamientos | 3 |
| Ediciones de los otros eslabones: `mage_guild_2` y `knight_upgrade_2…6` | 6 |
| **Total** | **13**, frente a los 22 de la vuelta 2 |

- Cada uno tarda unos 75 s.
- Si hay que repetir uno de cada dos, son unos 20 y ~10 min con 3 trabajadores.

**Lo que hay que cambiar en el código si sigue adelante:**
- un índice de base de placa + recortes (cada uno, una imagen del tamaño de su región con su origen);
- la disposición medida del cuadro: la `x` y el pie salen de la máscara, la puerta se mide a mano;
- `arcoDeLaPlaza` ajustado a los pies medidos, o las fachadas sin giro propio, porque el giro ya viene pintado;
- la máscara de clic, que ya existe, sale del recorte.

**Lo que no queda resuelto:**
- **El solape fuerte entre vecinos.** Con regiones por columnas, un edificio que tape a otro deja un trozo del de delante en el recorte del de detrás. Se resolvería con una edición por sitio en un maestro sin ese vecino, que son más encargos.
- **Las mejoras más anchas que su región** se cortan en el borde de la región.
- **El maestro solo se puede rehacer en bloque.** Cambiar un edificio de primer eslabón es una edición del maestro, pero si el maestro cambia, se rehacen todos los recortes y la placa.

## Recomendación

**Seguir con el método**, que resuelve la queja («no quedan integradas, se nota que es un extra»): en las composiciones no se nota.

Lo que hay que aceptar es que **la geometría la pone Codex**:
- el arco sale más plano y los edificios casi sin girar;
- la disposición se mide sobre el maestro, no se le impone.

Antes del pipeline entero, recomiendo dos cosas:
1. **Volver a pedir el maestro izquierdo con más peso en la curva.** Por ejemplo, la guía con el empedrado ya pintado del panorama actual en vez del gris, y las filas del pie de cada sitio. Si el arco sigue plano, que el usuario decida si lo acepta así.
2. **Que el usuario vea `poc-compuesta-1/3/todos` y `poc-mejora`** y elija la paleta: la otoñal de este maestro o la más apagada del panorama actual. Hay que fijarla antes del maestro derecho.

Con eso, el pipeline para el caballero son ~13 encargos. **`exec resume` no sirve hoy para editar**: cada edición tiene que ser una petición nueva con la imagen adjunta, y funcionó a la primera las tres veces.

## Verificación ejecutada

```
$ pnpm typecheck        → sin errores (tras tipar los índices de `recorte.ts`)
$ npx biome check tools/poc-base → Checked 2 files … No fixes applied.
$ pnpm vitest run test/invariantes.test.ts
 Test Files  1 passed (1)
      Tests  26 passed (26)
$ npx tsx tools/poc-base/recorte.ts
sitio 1 (lvl6): máscara 153193 px, 77 % de su región
sitio 2 (lvl4): máscara 126648 px, 79 % de su región
sitio 3 (guild): máscara 101386 px, 72 % de su región
sitio 4 (tavern): máscara 115411 px, 68 % de su región
sitio 5 (lvl2): máscara 126954 px, 71 % de su región
sitio 6 (lvl1): máscara 110601 px, 73 % de su región
mejora recortada y compuesta
```

No he tocado `src/`, así que no he corrido `pnpm verify` entero, como pedía el encargo. No se arrancó ningún servidor.

**Hilos de Codex**, para retomarlos:
- maestro: `01a1211d-7149-7a50-91f0-a905e1174026`
- placa: `01a12121-c567-7380-bb17-d7424f7669f9`
- mejora: `01a12122-ecab-76c1-99a0-5a94aed3e65d`
- variante B: `01a12126-61ab-78c1-8d75-f6cab4e8cdc7`

Los PNG crudos están en `~/.codex/generated_images/<hilo>/` y copiados en `.cache/poc-base/`.

**Para retirar la prueba:** borrar `tools/poc-base/`, `.cache/poc-base/` y `capturas/poc-*`.

# Segunda prueba (09-10-2026, tarde)

Repite la primera con lo decidido tras verla (requisitos, «Vuelta 3, decisiones tras la primera prueba»): identidad sin las fachadas giradas, guía solo de suelo, prompt sin altura ni giro, y dos paletas. Mismo alcance: la mitad izquierda, seis sitios. Código nuevo en `tools/poc-base/maestro2.ts` y `tools/poc-base/recorte2.ts` (la primera prueba queda intacta); intermedios en `.cache/poc-base/p2/`. Codex por la suscripción: **0 $**. Nada de `src/` tocado.

## Qué cambió

| | Primera prueba | Segunda |
|---|---|---|
| Identidad | las fachadas «giradas» de la vuelta 2 (paralelogramos) | **los crudos de la vuelta 1**, edificios sueltos y proporcionados (`capturas/poc2-identidad.png`) |
| Guía | cielo, anillo y cuadriláteros altos inclinados con RELLENO | **solo el empedrado** (gris claro bajo la curva del arco) y un punto oscuro numerado por puerta, nada más (`capturas/poc2-guia.png`) |
| Prompt | «alto», «girado como su cuadrilátero», «puede salirse por arriba», puerta 160 px | proporciones normales «las de la hoja», paredes verticales, puerta ~150 px para un adulto de ~120, los seis a la misma escala, «alrededor de la plaza como en una plaza real; la curva la marcan el borde del empedrado y dónde está cada uno»; cámara ortográfica 25°, de frente, como el combate. Se pide quitar carretas, huertos, patios y escalinatas de la hoja |
| Paleta | otoñal (campo.webp) | **a**: otoñal cálida (campo.webp); **b**: sobria, `assets/mapa/muestras/pintado.webp`, luz de tarde neutra, sin naranja ni hojas |

**Decisión sobre la identidad**: los edificios de la vuelta 1, no la descripción por palabras. Se encontraron por los hilos de `tools/taller/cola/hecho/base-knight-<id>.json` (los de las procedencias de la vuelta 1 ya no están: la vuelta 2 reescribió `assets/bases/knight/*.procedencia.json`). Los miré con Read: son las maquetas proporcionadas, de frente y con su atrezo. De los que tenían dos intentos tomé el último. Los hilos están en `SITIOS_IZQ` de `maestro2.ts`. Además de la hoja, el prompt nombra cada edificio con palabras (catedral, salón de armas, torre del gremio, taberna, barracón de arqueros, choza).

## Qué se hizo

| Paso | Orden | Resultado |
|---|---|---|
| Guía e identidad | `npx tsx tools/poc-base/maestro2.ts guia` | `p2/guia.png`, `p2/identidad.png` |
| Maestro a (otoñal) | `… maestro a` | 1 intento, 94 s, hilo `01a12156-1c9b-7fe2-850d-ea3955489397` |
| Maestro b (sobrio) | `… maestro b` (en paralelo) | 1 intento, 93 s, hilo `01a12156-2084-7463-b890-5835a0791372` |
| Placa a | `… placa a` (petición nueva con el maestro adjunto) | 1 intento, 66 s, hilo `01a12157-c139-7171-853d-b8335cb001f0` |
| Placa b | `… placa b` | 1 intento, 65 s, hilo `01a12157-c2d3-7b02-b854-4e099c5ed441` |
| Recorte, medidas y composiciones | `npx tsx tools/poc-base/recorte2.ts a` y `… b` | máscaras, `medidas-<p>.json` y tres compuestas por paleta |

Las placas eran baratas (gratis y un minuto), así que se hicieron las dos versiones enteras. El recorte es el de la primera prueba sin cambios; las regiones por columnas se midieron a ojo sobre cada maestro y su diferencia (`p2/dif-<p>.png`).

## Medidas

**Pie y centro, de la máscara** (pie = mediana del borde de abajo por columna). **Puerta, a mano** sobre recortes ×2 con rejilla de 10 px. El adulto de juego mide 122 px en estas imágenes (0,95 pasos). Guía: centro y pie del punto de cada puerta.

| Sitio | Guía x / pie | **b** centro / pie | b puerta (x, alto) | **a** centro / pie | a puerta (x, alto) |
|---|---|---|---|---|---|
| 1 catedral | 134 / 888 | 153 / 588 | 141, **125** px | 160 / 498 | 129, ~106 px |
| 2 salón de armas | 358 / 803 | 461 / 552 | 492, **110** | 489 / 474 | 500, ~108 |
| 3 torre del gremio | 582 / 750 | 720 / 545 | 727, **80** | 749 / 475 | 752, ~70 |
| 4 taberna | 806 / 715 | 929 / 544 | 931, **69** | 940 / 492 | 946, ~55 |
| 5 barracón | 1030 / 691 | 1192 / 550 | 1188, **82** | 1186 / 508 | 1193, ~80 |
| 6 choza | 1254 / 677 | 1438 / 564 | 1440, **80** | 1436 / 533 | 1450, ~75 |

**Deriva de la placa** frente a su maestro, fuera de los edificios (|Δ| medio por canal, 0-255):

| Zona | a crudo / σ 3 | b crudo / σ 3 | Primera prueba (σ 3) |
|---|---|---|---|
| Suelo lejos (y 760-1024) | 13,3 / 3,1 | 10,5 / 3,6 | 2,3 |
| Suelo junto al pie (y 620-760) | 14,2 / 3,1 | 11,8 / 3,0 | 3,1 |
| Cielo (y 0-50) | 2,6 / 1,8 | 1,5 / 1,2 | 2,1 |

El color medio se mueve 1-5 niveles. Del mismo orden que la primera: la placa sigue sirviendo.

## Juicio de cada captura (miradas con Read)

- **`poc2-guia.png`**: lo pedido. Solo el empedrado con su borde curvo y seis puntos numerados. Ni una caja.
- **`poc2-maestro-a.png`** (otoñal):
  - **Proporciones normales**: los seis son los de la hoja, derechos, con las paredes verticales, ni estirados ni torcidos. La queja de la primera prueba («alargados y torcidos») **queda resuelta**.
  - Perspectiva: de frente, con un poco de tejado; coherente entre ellos y con el suelo. El salón de armas conserva su patio de la hoja (un murete con estandartes delante), pese al prompt.
  - Quitó carretas, huertos y mesas, como se pedía.
  - Pero: los seis van **en línea casi recta** sobre una franja alta (pie 474-533), y muy **pequeños**: debajo queda una plaza enorme y vacía. Muros bajos con hojas en los bordes izquierdo y derecho que no se pidieron.
- **`poc2-maestro-b.png`** (sobria):
  - Igual de bien en proporciones, más de frente aún, y algo más grandes que en a.
  - La paleta es gris y fría, de luz nublada: sobria, pero más «fotográfica/3D» que el pintado del mapa, que es más cálido y pardo. No es exactamente «pintado oscuro»; está entre medias.
  - La misma línea casi recta (pie 544-588) y la misma escala corta.
- **`poc2-placa-a.png`** y **`poc2-placa-b.png`**: plazas creíbles, mismo empedrado, cielo y encuadre. a pone un murete con árboles y casas detrás; b, un muro bajo de piedra con cipreses y casas. En a el muro de detrás cambia más que en b (ver máscaras).
- **`poc2-mascaras-b.png`**: **limpias**, cada edificio entero sin trozos de fondo.
- **`poc2-mascaras-a.png`**: arrastran trozos del muro de detrás (taberna, barracón y choza), porque la placa a rehízo ese muro distinto. Se arreglaría con regiones más ceñidas por arriba, pero b sale limpia sin tocarlas.
- **`poc2-compuesta-1-b/3-b/todos-b.png`**: **integradas**, como en la primera prueba: el pie se asienta en el empedrado y no se ve la costura; en la de 1 y 3, los huecos enseñan el muro de la placa y se leen como plaza. `todos-b` no se distingue del maestro.
- **`poc2-compuesta-*-a.png`**: integradas también, salvo el trozo de muro que arrastran las tres de la derecha en `todos-a` (se nota poco a ×0,7).
- **Las figuras** (Y Bot civil a 122 px, la escala del juego): junto a la catedral, la figura llega a la mitad de su puerta y se lee bien. **Junto a la torre del gremio, la figura es tan alta como su puerta**, y la de la taberna (55-69 px) mide la mitad que un adulto. A la escala del juego, los edificios pequeños parecen de juguete.

## Veredicto franco

- **Proporciones y perspectiva: sí, normales.** Era el fallo de la primera prueba y venía de la identidad deformada y de las cajas inclinadas. Con la vuelta 1 como identidad y la guía solo de suelo, los edificios salen como edificios.
- **Geometría: Codex sigue sin seguirla, y ahora menos.** Sin cajas que lo sujeten:
  - el arco sale casi recto, y además en U poco honda, no en media elipse. La guía baja 211 px de la choza (6) a la catedral (1). En b los pies van 588, 552, 545, 544, 550 y 564: la catedral baja 43 px, pero la choza también baja 20. En a van 498, 474, 475, 492, 508 y 533, **más bajo a la derecha que a la izquierda**, al revés de la guía;
  - todo sube 200-300 px: el pie queda en la mitad de la imagen, no en la curva de la guía;
  - los empuja a la derecha, entre 19 y 184 px;
  - **la escala sale a la mitad o menos**: puertas de 55-125 px frente a los ~150 pedidos. Solo la catedral y el salón de armas tienen puertas de adulto; torre, taberna, barracón y choza no llegan a 0,7 adultos.
- **El método (maestro → placa → recorte) vuelve a integrar** y la deriva de la placa es la misma. Lo que hace falta es fijar la escala.
- **Mejor versión: b**, por las máscaras limpias y porque es más de frente. La paleta la elige el usuario: a es más cálida y de cuento, b más sobria y más «render».

## Qué propongo para la tercera, si se quiere seguir

1. **Escala**: poner en la guía, junto a cada punto de puerta, la silueta de un adulto de 122 px (no un edificio, solo la vara de medir). Pedir «la puerta, algo más alta que la silueta». Es lo que sujetó la escala en las fachadas sueltas de la vuelta 2.
2. **La curva**: aceptar que Codex la pinta casi recta (dos pruebas, dos veces), y derivar la disposición del cuadro, como ya se decidió («manda el cuadro»). O bien recortar el maestro por debajo: si los pies quedan a 545-590 px de 1024, la plaza tiene ~450 px de suelo, más de lo que el juego enseña.
3. **El patio del salón de armas**: si se quiere sin patio, decirlo con su nombre; «sin patios» en general no bastó.

## Verificación ejecutada

```
$ npx tsx tools/poc-base/maestro2.ts guia
guía e identidad en /home/al/code/heroes-bases/.cache/poc-base/p2
$ npx tsx tools/poc-base/maestro2.ts maestro a   (y b, en paralelo)
maestro-a: hilo 01a12156-1c9b-7fe2-850d-ea3955489397, 94 s
maestro-b: hilo 01a12156-2084-7463-b890-5835a0791372, 93 s
$ npx tsx tools/poc-base/maestro2.ts placa a     (y b, en paralelo)
placa-a: hilo 01a12157-c139-7171-853d-b8335cb001f0, 66 s
placa-b: hilo 01a12157-c2d3-7b02-b854-4e099c5ed441, 65 s
$ npx tsx tools/poc-base/recorte2.ts a
sitio 1 (lvl6): x 0-300, centro 160, de 29 al pie 498 (469 px de alto)
sitio 2 (lvl4): x 301-671, centro 489, de 150 al pie 474 (324 px de alto)
sitio 3 (guild): x 668-827, centro 749, de 148 al pie 475 (327 px de alto)
sitio 4 (tavern): x 826-1057, centro 940, de 224 al pie 492 (268 px de alto)
sitio 5 (lvl2): x 1057-1329, centro 1186, de 264 al pie 508 (244 px de alto)
sitio 6 (lvl1): x 1333-1535, centro 1436, de 271 al pie 533 (262 px de alto)
$ npx tsx tools/poc-base/recorte2.ts b
sitio 1 (lvl6): x 0-299, centro 153, de 96 al pie 588 (492 px de alto)
sitio 2 (lvl4): x 298-626, centro 461, de 202 al pie 552 (350 px de alto)
sitio 3 (guild): x 645-799, centro 720, de 192 al pie 545 (353 px de alto)
sitio 4 (tavern): x 811-1050, centro 929, de 254 al pie 544 (290 px de alto)
sitio 5 (lvl2): x 1056-1329, centro 1192, de 349 al pie 550 (201 px de alto)
sitio 6 (lvl1): x 1329-1535, centro 1438, de 323 al pie 564 (241 px de alto)
$ npx biome check tools/poc-base   → Checked 4 files … No fixes applied.
$ npx tsc --noEmit -p .            → sin salida (sin errores)
```

Sin servidores arrancados, sin tests (no se tocó nada con test), sin `src/`. **Para retirar**: `tools/poc-base/`, `.cache/poc-base/` y `capturas/poc-*` y `capturas/poc2-*`.

# Tercera prueba (09-10-2026, noche)

Solo la paleta b (sobria), la misma identidad (los crudos de la vuelta 1, `p2/identidad.png`) y una **vara de medir** en la guía. Código en `tools/poc-base/maestro3.ts` y `tools/poc-base/recorte3.ts` (el recorte de la segunda sin cambios, con regiones nuevas). Intermedios en `.cache/poc-base/p3/`. Codex por la suscripción: **0 $**. Nada de `src/` tocado.

## Qué cambió frente a la segunda

- **Escala del cuadro: 128 px por paso, la del juego.** Así el recorte entra en el juego sin remuestrear. Con la franja caminable abajo quedan ~790 px (6,5 adultos) para los edificios: a tamaño real, la taberna llena dos tercios y la catedral y la torre se salen por arriba sin pedirlo. Una escala mayor empeoraría lo que ya no cabe a lo ancho (ver «La cuenta que no cuadra»).
  - Adulto: 0,95 pasos = **122 px**. Puerta: 1,2-1,3 pasos = 154-166 px.
- **Guía** (`capturas/poc3-guia-seis.png`):
  - empedrado solo en la franja baja. El borde de atrás va en la fila 790 en el centro de la plaza (borde derecho), que es `filaDelPanorama(0)`: 3,5 pasos de fondo a 25° más el margen de abajo. Se adelanta en parábola hasta la 900 en el borde izquierdo;
  - un punto por puerta, en las mismas `x` que la segunda prueba;
  - a 78 px a su izquierda, **la silueta del Y Bot civil**, rellena de gris oscuro, de 122 px.
- **Prompt**:
  - «LA SILUETA ES LA VARA DE MEDIR»: la puerta es un poco más alta que la silueta (155-165 px frente a 122), con ventanas, plantas y aleros a esa escala;
  - los edificios llenan el alto y los altos se salen por arriba, «no los encojas para que quepan»; si no caben, se tocan o uno queda detrás del de al lado;
  - proporciones normales, las de la hoja;
  - **«EL SALÓN DE ARMAS VA SIN SU PATIO»**: sin murete, arena, muñecos ni estandartes del patio;
  - **«NO AÑADAS PLAZA DELANTE»**: el pie, justo en el borde de atrás de la franja.
- **Variante** (la única que se probó, porque la primera se quedó corta en los pequeños): **tres edificios en la mitad** (catedral, torre y choza; guía `poc3-guia-tres.png`), con el mismo prompt.

## Qué se hizo

| Paso | Orden | Resultado |
|---|---|---|
| Guías | `npx tsx tools/poc-base/maestro3.ts guia seis` (y `tres`) | `p3/guia-seis.png`, `p3/guia-tres.png` |
| Maestro, seis | `… maestro seis` | 1 intento, 88 s, hilo `01a12172-238c-7872-9ce1-289f45f43389` |
| Placa, seis | `… placa seis` (petición nueva con el maestro adjunto) | 1 intento, 65 s, hilo `01a12173-a56b-70c3-b0bb-2b7b7bd31bb7` |
| Maestro, tres (variante) | `… maestro tres` | 1 intento, 88 s, hilo `01a12173-facc-7ee3-b33b-d81653e5def6` |
| Placa, tres | `… placa tres` | 1 intento, 52 s, hilo `01a12175-62ee-77b0-9595-a6e83450376e` |
| Recorte, medidas y composiciones | `npx tsx tools/poc-base/recorte3.ts seis` (y `tres`) | máscaras, `p3/medidas-<v>.json`, compuestas y `poc3-vara-<v>` |

Codex no pintó ninguna silueta, punto ni número de la guía, en ninguno de los dos.

## Medidas

**Puerta, a mano**, sobre recortes ×2 con rejilla de 10 px: del arco por dentro al umbral. **Pie, de la máscara** (mediana del borde de abajo). En adultos: puerta / 122.

| Sitio | Guía: x de la puerta / pie | **Seis**: x puerta / pie | Seis: puerta | Segunda prueba (b) | **Tres**: x puerta / pie | Tres: puerta |
|---|---|---|---|---|---|---|
| 1 catedral | 134 / 882 (tres: 300 / 861) | 85 / 798 | 212 px, **1,74** | 125 px, 1,02 | 295 / 742 | 235 px, **1,93** |
| 2 salón de armas | 358 / 855 | 480 / 776 | 153 px, **1,25** | 110, 0,90 | — | — |
| 3 torre del gremio | 582 / 832 (tres: 800 / 815) | 720 / 772 | 104 px, **0,85** | 80, 0,66 | 858 / 700 | 150 px, **1,23** |
| 4 taberna | 806 / 815 | 905 / 777 | 103 px, **0,84** | 69, 0,57 | — | — |
| 5 barracón | 1030 / 802 | 1165 / 773 | 118 px, **0,97** | 82, 0,67 | — | — |
| 6 choza | 1254 / 794 (tres: 1250 / 794) | 1430 / 769 | 105 px, **0,86** | 80, 0,66 | 1350 / ~712* | 128 px, **1,05** |

\* El pie de la máscara de la choza en la variante sale a 661: le falta la esquina de abajo a la izquierda, donde los arbustos de la placa se parecen a los del maestro. 712 está medido a ojo.

**La plaza** (el empedrado entre el pie y el borde de abajo):
- **Seis**: 226-255 px, con el pie entre las filas 769 y 798. Lo pedido eran 234 en el centro y 124 en el borde izquierdo. **Cumplido**: ya no hay plaza vacía delante.
- **Tres**: 282-363 px, con el pie entre 661/712 y 742. Unos 80-130 px más honda de lo pedido.

**La curva**:
- En la guía, el pie baja 88 px de la choza a la catedral.
- **Seis**: baja 29 px. **Tres**: baja 30 px (712 → 742).
- Sigue casi plana, como en las dos primeras pruebas.

**La `x`**:
- **Seis**: los empuja a la derecha hasta 176 px, salvo la catedral, que se va 49 px a la izquierda, como en la segunda.
- **Tres**: entre 5 y 100 px.

## Juicio de cada captura (miradas con Read)

- **`poc3-maestro-seis.png`**:
  - **Escala mucho mejor**: puertas 1,3-1,5 veces las de la segunda. Los edificios llenan el alto y la catedral se sale por arriba, cortada, con naturalidad.
  - **Proporciones normales.** Siguen siendo los de la hoja, derechos, sin estirar.
  - **El salón de armas, sin patio**: quedan dos machones bajos a los lados de la puerta, pero ni murete, ni arena, ni muñecos.
  - **Sin plaza delante.**
  - Pero, para que quepan los seis, **los pega en una fila continua, como una calle**: no se ve un hueco entre edificios. Y los cuatro pequeños siguen con la puerta **por debajo del adulto** (0,84-0,97).
- **`poc3-placa-seis.png`**:
  - plaza creíble: un muro con hiedra, árboles y casas detrás;
  - el empedrado sube ~40 px donde estaban los edificios: el pie del muro va en la ~730 y el de los edificios en la 770-800;
  - mismo cielo y mismo encuadre.
- **`poc3-mascaras-seis.png`**: limpias, cada edificio entero.
  - Dos defectos de las regiones por columnas, que estaban anunciados en la primera prueba:
    - la torre del campanario de la catedral se sale de su región y su lado derecho entra en la del salón;
    - entre las agujas de la catedral queda algo de cielo.
  - En el maestro todo esto se toca, así que el **solape entre vecinos ya es la norma**, no la excepción.
- **`poc3-compuesta-1-seis.png`** (solo la torre):
  - **integrada**: la torre queda delante del muro de la placa, a ras del empedrado;
  - por los 40 px de diferencia de pie, se lee como una torre exenta en la plaza, no como parte de un frente. Se lee bien.
- **`poc3-compuesta-3-seis.png`** (catedral, torre y barracón): **integrada**. Los huecos enseñan el muro y se leen como plaza.
- **`poc3-compuesta-todos-seis.png`**: no se distingue del maestro.
- **`poc3-vara-seis.png`** (el maestro con los Y Bot a la escala del juego):
  - junto a la catedral, el adulto llega a algo más de la mitad del portal;
  - **junto a la torre, el adulto es casi tan alto como la puerta**: la mejora no basta para los pequeños.
  - El Y Bot civil gris claro se confunde con la piedra a ×0,7: es la vara, no el arte.
- **`poc3-maestro-tres.png`** (variante):
  - **La escala sale bien**: la torre tiene puerta de 1,23 adultos y la choza de 1,05, donde en seis tenían 0,85-0,86.
  - Los edificios son grandes, con proporciones normales y un cielo mínimo, y la catedral y la torre se salen por arriba.
  - Entre ellos hay aire, con murete y casas detrás: **se lee como plaza**, no como calle.
  - En contra: la plaza sale más honda (282-363 px) y el borde, casi recto. Codex vuelve a meter algo de plaza cuando le sobra sitio.
- **`poc3-placa-tres.png`**: plaza creíble, pero rehace todo el fondo, con tejados de teja roja donde había pizarra. Dentro de las regiones da igual, porque los recortes lo tapan; fuera manda el maestro.
- **`poc3-mascaras-tres.png`**:
  - la de la torre arrastra un trozo de murete por la izquierda;
  - a la de la choza le falta la esquina de abajo a la izquierda.
  - En las compuestas apenas se nota: ese hueco enseña arbustos de la placa delante de la choza.
- **`poc3-compuesta-1-tres.png`** y **`poc3-compuesta-todos-tres.png`**:
  - **integradas**, con los edificios a escala de persona: el Y Bot junto a la torre llega a ~0,8 de su puerta;
  - es la que mejor responde a «todo a escala de personaje».

## La cuenta que no cuadra (por qué los pequeños se encogen)

Es geometría, no prompt. A escala real, cada edificio mide de ancho ~3-5 veces su puerta. Lo medí en la hoja de identidad: catedral 4,0, salón 3,5, torre 2,9, taberna 4,6, barracón 4,9 y choza 3,8.

- Con puertas de 155 px, los seis piden **~3 500 px**. La mitad tiene 1 536.
- Codex hace lo único posible: los pega y encoge los pequeños.
- En la variante caben a su tamaño: tres edificios ocupan los 1 536 px (catedral 660, torre 350, choza 460).

**El escenario de 24 pasos, con 13 sitios (1,85 pasos por sitio), no admite edificios a escala de personaje.** A escala real, el caballero pide unos **50 pasos de ancho**: ~4 piezas de 1 536 px más el ayuntamiento, el doble de scroll.

## Veredicto franco

- **La vara de medir funciona**: en las mismas condiciones, la escala sube 1,3-1,5 veces. Cuando hay sitio (variante tres), **la puerta queda un poco más alta que el adulto, como se pedía**.
- **Seis por mitad: falla la escala de los pequeños** (0,84-0,97 adultos). No es de prompt, sino de espacio. Lo demás sale bien: sin plaza delante, sin patio y con proporciones normales.
- **Tres por mitad: la escala sale bien** (1,05-1,93). La plaza se hace algo más honda de lo pedido, pero se recorta por abajo.
- **El método sigue integrando** en las dos. La deriva de la placa no se ha medido esta vez, pero a ojo es la de antes en el empedrado.
- **La curva sigue casi plana** (29-30 px frente a 88) en las tres pruebas. Hay que darlo por perdido: la disposición se mide sobre el cuadro.
- **El solape entre vecinos ya es la norma** en «seis», porque se tocan todos. Con regiones por columnas, la catedral pierde un trozo de su campanario en la región del salón.

## Recomendación

**Pasar al pipeline completo, pero no con la disposición de hoy.** Hay que decidir antes, y es decisión del usuario, una de dos:

- **A. Escala de verdad (recomendada)**: **tres edificios por pieza de 1 536 px**, con la escala de la variante, y el escenario más ancho, de ~50 pasos. Encargos para el caballero:

  | Qué | Encargos |
  |---|---|
  | Maestros: 4 piezas de 3 sitios y 1 con el ayuntamiento y otro sitio; cada pieza pedida con su vecina como `contigua` | 5 |
  | Placas | 5 |
  | Otros eslabones: `town_hall`, `city_hall`, `mage_guild_2` y `knight_upgrade_2…6` | 8 |
  | **Total** | **18**, ~24 con repeticiones; unos 75 s cada uno, 0 $ |

  - El solape entre vecinos casi desaparece (hay aire entre edificios).
  - Cuesta código: un escenario más ancho, con más scroll y la disposición medida de cada pieza.
  - Hay que **recortar la plaza** a la franja de 3,5 pasos (unos 80-130 px por abajo) o pedirla más corta. Y queda por probar la costura entre dos piezas.

- **B. El escenario de hoy (24 pasos, seis por mitad)**:
  - **13 encargos**, como en la primera prueba;
  - los pequeños se quedan con la puerta a 0,85 adultos: el héroe es casi tan alto como la puerta de la torre y la taberna;
  - todos pegados, en un frente continuo como una calle, con solape fuerte entre vecinos.

  No lo recomiendo: es justo la queja de «a escala de personaje».

Antes de los 18 encargos de A, propongo **una pieza más de prueba**: la mitad derecha de A (la siguiente pieza, con `poc3-maestro-tres.png` como `contigua`). Así se ve la costura entre dos piezas, que es lo único de A que no se ha probado.

## Verificación ejecutada

```
$ npx tsx tools/poc-base/maestro3.ts guia seis
guía seis: adulto 122 px, puerta 154-166 px, borde de atrás 790 (centro) a 900 (izquierda); pies 1:134,882 2:358,855 3:582,832 4:806,815 5:1030,802 6:1254,794
$ npx tsx tools/poc-base/maestro3.ts guia tres
guía tres: adulto 122 px, puerta 154-166 px, borde de atrás 790 (centro) a 900 (izquierda); pies 1:300,861 2:800,815 3:1250,794
$ npx tsx tools/poc-base/maestro3.ts maestro seis
maestro-seis: hilo 01a12172-238c-7872-9ce1-289f45f43389, 88 s
$ npx tsx tools/poc-base/maestro3.ts placa seis
placa-seis: hilo 01a12173-a56b-70c3-b0bb-2b7b7bd31bb7, 65 s
$ npx tsx tools/poc-base/maestro3.ts maestro tres
maestro-tres: hilo 01a12173-facc-7ee3-b33b-d81653e5def6, 88 s
$ npx tsx tools/poc-base/maestro3.ts placa tres
placa-tres: hilo 01a12175-62ee-77b0-9595-a6e83450376e, 52 s
$ npx tsx tools/poc-base/recorte3.ts seis
sitio 1 (lvl6): x 0-321, centro 164, de 0 al pie 798 (798 px de alto)
sitio 2 (lvl4): x 322-639, centro 469, de 56 al pie 776 (720 px de alto)
sitio 3 (guild): x 640-789, centro 714, de 94 al pie 772 (678 px de alto)
sitio 4 (tavern): x 790-1029, centro 908, de 396 al pie 777 (381 px de alto)
sitio 5 (lvl2): x 1030-1284, centro 1158, de 469 al pie 773 (304 px de alto)
sitio 6 (lvl1): x 1285-1535, centro 1415, de 397 al pie 769 (372 px de alto)
$ npx tsx tools/poc-base/recorte3.ts tres
sitio 1 (lvl6): x 0-658, centro 332, de 0 al pie 742 (742 px de alto)
sitio 2 (guild): x 667-1015, centro 852, de 0 al pie 700 (700 px de alto)
sitio 3 (lvl1): x 1076-1535, centro 1333, de 277 al pie 661 (384 px de alto)
$ npx biome check tools/poc-base   → Checked 6 files … No fixes applied.
$ npx tsc --noEmit -p .            → sin salida (sin errores)
```

Sin servidores, sin tests y sin `src/`. **Para retirar**: `tools/poc-base/`, `.cache/poc-base/` y `capturas/poc-*`, `poc2-*` y `poc3-*`.
