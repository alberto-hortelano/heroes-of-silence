# Requisitos: el editor de equipo de la arena por tipos, con bases y armas que cambian la rueda

## Petición literal (18-10-2026)

> Mejora la ui de editar equipo de la arena. Deja solo oro para precio, quita PV y diferencia por
> tipo, armas, aramadura, arma a distancia, de momento ignora accesorios. Deberian poder tomar otro
> equipo como base, una espada de herreria deberia poder ser una espada normal con extras, y una
> bendita una espada de herreria con extras. Las armas cuerpo  a cuerpo deberian poder modificar los
> efectos de la rueda de combate, una maza es mejor en ataque fuerte y peor en rapido, una espada es
> la mas versatil, etc

## Decisiones del usuario (preguntadas en la conversación, 18-10-2026)

1. **El arma cambia la cifra propia de cada tipo de la rueda** (la de `data/rueda.json`), no un
   único % de daño: Fuerte, Rápido y Normal en puntos de % de daño; Ofensivo en ataque; Defensivo en
   defensa; Romper guardia en ataque quitado; Finta en casillas.
2. **El editor enseña solo las piezas de calidad `arena`** (las de `data/equipo.json` y las nuevas):
   fuera garrote, espada de armería, accesorios y demás del juego. El juego sigue leyendo
   `data/equipo.json` como hoy.
3. **Cuatro tipos**: Cuerpo a cuerpo (hueco `arma` y la lanza de `carga`, que también lleva lo de la
   rueda), A distancia, Armadura y Escudo. Accesorios fuera.

El usuario aprobó el plan de dirección: `/home/al/.claude/plans/mejora-la-ui-de-velvety-canyon.md`
(léelo: trae los ficheros, las funciones que tocar y las cifras de ejemplo). El arquitecto lo concreta.

## Criterios de aceptación

1. En «Editar equipo» las piezas salen en cuatro secciones, Cuerpo a cuerpo, A distancia, Armadura
   y Escudo, solo las de calidad `arena`; no sale ningún accesorio ni ninguna pieza de otra calidad.
2. La ficha de una pieza no tiene campo de PV ni fila de calidad, y tiene **un solo precio, en oro**.
   El núcleo rechaza, diciéndolo, una pieza de la arena con precio en otro recurso.
3. Cada tipo enseña solo sus campos: cuerpo a cuerpo, ataque, daño, manos (solo `arma`) y rueda; a
   distancia, ataque y daño; armadura, defensa, armadura y velocidad; escudo, defensa y velocidad
   (≤ −1). El núcleo rechaza, diciéndolo, una pieza de la arena con una cifra que su tipo no admite.
4. Una pieza puede tomar otra de su mismo hueco como **base**: se elige en su ficha (o «Nueva sobre
   esta») y sus cifras son las de la base más sus extras. Se puede encadenar: Espada → Espada de
   herrería → Espada bendita, y la ficha dice la cadena y, por cifra, el extra y el final.
5. El vínculo es vivo: cambiar la Espada cambia la Espada de herrería, la bendita y a quien las
   lleve, en el montaje y a media pelea.
6. No vale (con su motivo): base que no existe, de otro hueco, ciclo, borrar la base de otra pieza,
   y una pieza resuelta que no cumpla la regla de una pieza.
7. Una pieza de cuerpo a cuerpo tiene una tabla «Rueda del golpe», una fila por tipo, con lo que
   suma el arma y el resultado. Con «Golpe: rueda», el golpe usa las cifras de la rueda con el arma
   de ese golpe (la lanza en el primer golpe de una carga; la de cuerpo a cuerpo en lo demás; en el
   contraataque, la del que responde), y la rueda que se abre enseña el daño y la nota de cada tipo
   con esas cifras. Sin arma, o sin modificadores, todo es como hoy.
8. `data/equipo.json` trae perfiles de ejemplo: Espada sin nada (la versátil), Maza nueva (mejor en
   Fuerte, peor en Rápido), y los de Mandoble, Daga, Bastón y Lanza; y las nuevas Espada de herrería
   (base Espada) y Espada bendita (base Espada de herrería). Todo inventado y dicho en `_comment`.
9. «Copiar enlace de la pelea» lleva las bases de lo que lleva y se reabre igual; la versión del
   enlace sube.
10. El juego no cambia: `pnpm banco` con el mismo hash.

## Fuera de alcance

- Accesorios en la arena (ni piezas, ni sección).
- Que la IA elija en la rueda según el arma: sigue a ciegas con los pesos de hoy y el mismo consumo
  del `rng`.
- Cambiar el equipo del juego, la armería o el botín; las piezas del juego no ganan base ni rueda.
- Compatibilidad con borradores o enlaces de antes (memoria: sin compatibilidad hacia atrás; lo
  viejo se rechaza diciéndolo).

## Contexto

- Presupuesto de pruebas: la máquina es compartida; tests caros (`verify:lento`, `capturas`,
  `banco`) una vez al cerrar. Las pasadas de capturas del editor: `CAPTURAS_SOLO=equipo,armas`.
- El usuario no abre nada en los worktrees: al final se levanta `pnpm arena` en otro puerto y se le
  da la URL.
- Ningún `pkill`: lo que se arranca se apunta y se mata por su grupo (CLAUDE.md).

## Preguntas abiertas (con suposición)

- ¿El precio de una pieza con base se hereda? Supuesto: sí, precio = el de la base + el extra en oro.
- ¿Los extras pueden restar? Supuesto: sí en velocidad y en la rueda; las demás cifras, extras ≥ 0
  (lo que pide «con extras»). El arquitecto decide si con negativos simplifica.
- ¿Precios en oro para las de la arena (hoy 0)? Supuesto: se pueden dejar a 0; si se ponen, inventados.

## Visto bueno del plan (18-10-2026)

El usuario aprobó plan.md tal cual, incluido que el borrador y el enlace solo admitan piezas de
calidad `arena` (fuera `armaduraDePV`, `PV_POR_PUNTO_DE_ARMADURA` y `avisoDeLaCopia`).

# Vuelta 2: la rueda del arma por niveles absolutos (18-10-2026)

Ya hecho y commiteado: la rueda del arma suma a las cifras sin arma (`Pieza.rueda`, puntos de % y
cifras con signo) y se edita en barras centradas con la rueda teñida al lado (commit `a20f06ee`).

## Petición literal

> Finta esta al reves, mas casillas aparece como negativo. La idea es que positivo sea a la derecha y
> negativo a la izquierda, no sumar y restar. La mayoria no tienen punto medio.  Ofensivo, Fuerte,
> finta, romper guardia... Vamos a hacer que los valores de las barras sean absolutos y no relativos a
> la base del arma o a un punto concreto, para que sea mas facil ver la diferencia entre armas. La peor
> arma posible tendria todo al 0, a la izquierda, Ofensivo +0, Fuerte x1, finta -10 casillas, Defensivo
> +0, rapido 2x0.25, romper guardia -0 y normal lo quitamos, simpre x1
> La mejor seria: Ofensivo +7, Fuerte x2, finta -0 casillas, Defensivo +7, rapido 2x0.25, romper
> guardia -7. Variando con el exito del ataque hasta 0.  Se puden retocar un poco los numeros para que
> encajen en 7 niveles.

## Decisiones del usuario (preguntadas, 18-10-2026)

- **Siete niveles, del 0 al 6**, en cada tipo. El nivel es absoluto: la barra va de 0 (izquierda, lo
  peor) a 6 (derecha, lo mejor), sin punto medio, y la misma para todas las armas.
- **Rápido** de 2 × 0,25 a **2 × 1**.
- **La Finta**: el nivel fija lo que resta con éxito máximo (nivel 0: 10 casillas; nivel 6: 0), y con
  menos éxito resta más, hasta 10 en el mínimo (como hoy: con más éxito, resta menos).
- **Romper guardia**: el nivel fija lo que quita con éxito máximo (0 a −6), y con menos éxito quita
  menos, hasta 0 en el mínimo.
- **Normal sin nivel**: siempre ×1, el arma no lo toca.
- **Sin arma no se combate**: «si hubiese un lobo, los colmillos serían su arma». En la arena, **una
  unidad sin arma de cuerpo a cuerpo no se puede montar** (no vale, con su motivo, como cualquier
  unidad que no vale; «Guardar» la conserva tal cual). Hoy, en el borrador, el elfo arquero y el goblin
  arquero no la llevan.
- **El héroe de la arena pelea con la Espada de la arena** (con sus niveles), no con la Espada de
  armería del juego.

## Tabla propuesta (niveles 0 a 6; cifras inventadas, se retocan probando)

| Tipo | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Ofensivo (ataque) | +0 | +1 | +2 | +3 | +4 | +5 | +6 |
| Fuerte (daño) | ×1 | ×1,17 | ×1,33 | ×1,5 | ×1,67 | ×1,83 | ×2 |
| Finta (resta con éxito máximo) | 10 | 8 | 7 | 5 | 3 | 2 | 0 |
| Defensivo (defensa) | +0 | +1 | +2 | +3 | +4 | +5 | +6 |
| Rápido (2 golpes de) | ×0,25 | ×0,38 | ×0,5 | ×0,63 | ×0,75 | ×0,88 | ×1 |
| Romper guardia (quita con éxito máximo) | 0 | −1 | −2 | −3 | −4 | −5 | −6 |

Por éxito (`p`, de 0 el mínimo a 4 el máximo), una propuesta en enteros: Romper guardia quita
`⌊q · p / 4⌋`; la Finta resta `v + ⌊(10 − v) · (4 − p) / 4⌋`. El arquitecto puede ajustarlo.

## Criterios de aceptación (vuelta 2)

1. Toda arma de cuerpo a cuerpo de la arena (`arma`, `carga`) lleva un nivel de 0 a 6 en cada uno
   de los seis tipos del anillo (Ofensivo, Fuerte, Finta, Defensivo, Rápido, Romper guardia). Normal no
   tiene nivel y siempre es ×1. Las cifras de cada nivel viven en `data/rueda.json`.
2. En el editor, cada tipo es una barra de 0 a 6 que se llena desde la izquierda, con «−» a la
   izquierda (baja un nivel, peor) y «+» a la derecha (sube, mejor); la Finta también: «+» resta menos
   casillas. Al lado, lo que da ese nivel («×1,5», «resta 5 a 10 casillas»…). Sin fila de Normal. No se
   pasa de 0 ni de 6.
3. Con base, el nivel final es el de la base más el extra de la pieza (los extras de la rueda, en
   niveles), y la barra enseña el final. Un final fuera de 0 a 6 no vale, con su motivo.
4. La rueda teñida de al lado sigue, con el tinte por nivel (absoluto, no relativo a nada).
5. El golpe, el contraataque, la previsión y las notas de la rueda del combate usan las cifras del
   nivel del arma de cada golpe, como en la vuelta 1.
6. Una unidad de la arena sin arma de cuerpo a cuerpo no vale y lo dice; la Espada de la arena es la
   del héroe.
7. `data/equipo.json`: cada arma de la arena con sus seis niveles (la Espada, pareja y versátil; la
   Maza, fuerte en Fuerte y Romper guardia, floja en Rápido; la Daga, Rápido y Finta…), y la Espada de
   herrería y la bendita con extras en niveles. Inventado, dicho en `_comment`.
8. El juego no cambia (`pnpm banco` igual). `arena-ia.ts` sin peleas nuevas sin terminar.

## Fuera de alcance (vuelta 2)

- Que la IA elija en la rueda según el arma (sigue a ciegas).
- Las piezas del juego (no tienen rueda; en la arena no se usan como arma de cuerpo a cuerpo).

## Visto bueno de plan-2.md (18-10-2026)

El usuario aprueba plan-2.md, con estas respuestas a sus preguntas abiertas:

- **Los arqueros del borrador** (`elfo-arquero`, `goblin-arquero`): se les pone la Daga en
  `data/borradores/unidades.json` (`"arma": "daga"`) y siguen peleando con sus cifras.
- **Un arma nueva en blanco** («+ Nueva pieza» en cuerpo a cuerpo) nace con **todo a 3**, como la Espada.
