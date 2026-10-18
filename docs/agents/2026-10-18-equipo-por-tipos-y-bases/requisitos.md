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
