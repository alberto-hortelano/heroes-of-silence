# Requisitos — la experiencia llega a alguna parte y el gremio se construye

**Issues**: #87 (la experiencia ignora el tamaño del stack y solo la cobra el
atacante) y #88 (el gremio de magia se construye en 1 partida de 40).

## Petición literal del usuario

> «Ok, sigue con #87 + #88»

Dicho después de leer el informe del crítico que los descubrió, y de la propuesta
de hacerlos juntos con este argumento, que es el que hay que sostener o refutar:
*«los dos son de dos líneas y son los que hacen que dos capas ya escritas
—niveles y magia— dejen de ser ficción»*.

## No se lanza crítico, y no por prisa

El diagnóstico de los dos issues **es** el trabajo del crítico del ciclo «el héroe
progresa», en
`docs/agents/2026-08-25-el-heroe-progresa/critica.md`. Léelo entero antes de
diseñar nada: mide lo que aquí se afirma y explica por qué el racimo de #6+#15+#3
se cayó. Repetirlo costaría otro contexto para llegar a lo mismo.

## Qué está roto, verificado en el código

**#87 — dos defectos en la misma función.** `experienceFor`
(`src/core/state/game.ts:1137-1146`):

```ts
for (const s of pending.battle.stacks) {
  if (s.side !== 'defender') continue;
  const info = creature(s.creature);
  exp += info.hp * info.level * 2;
}
```

1. **No mira `s.count`.** `createBattle` guarda el recuento
   (`src/core/battle/battle.ts:95`) y aquí no lo lee nadie: **cien campesinos y
   uno valen los mismos 2 puntos**.
2. **Solo la cobra el atacante que gana**: la llamada vive dentro de
   `if (heroeAtacanteVivo)` (`game.ts:1120`), así que **quien defiende y repele no
   gana experiencia nunca** — la mitad de las batallas del agente desde que
   defiende.

Y `levelFromExperience()` (`src/core/hero/hero.ts:150`) existe, está probada y
**no la llama nadie**. La curva es `1000 · 1,4^(n−2)`.

Medido: **65 héroes en 40 semillas, 0 alcanzan el nivel 2.** Exp pico mediana 68.

**#88 — el gremio no gana nunca una prioridad.** `chooseBuilding`
(`src/core/ai/strategy.ts:210-217`) puntúa `mageGuildLevel` con **40**, contra
`100 + dwellingLevel` de las moradas, 95 de los abre-puertas, 90 del ingreso y
`50 + upgradesLevel` de las mejoras. Medido: `mage_guild_1` en **1 partida de
40**, gremio máximo 0 en 39 de 40, y `syncSpellbooks` **no enseña un solo
hechizo** en 40 partidas.

## Criterios de aceptación

### #87 — el surtidor de experiencia

1. La experiencia de una batalla **cuenta las criaturas muertas, no los stacks**.
   La fórmula sale de fheroes2 y se escribe con su fuente al lado, como se hizo
   con las 18 filas de coste: el arquitecto la trae de la fuente, no la deduce.
2. **Quien defiende y gana cobra experiencia.** Si en el original el defensor cobra
   distinto que el atacante, se copia y se dice; si cobra igual, se cuadra.
3. Test determinista por semilla: la misma batalla ganada contra 100 campesinos da
   más experiencia que contra 1, y la cifra es la que dice la fórmula.
4. Test: un héroe que **defiende** y repele el ataque termina con más experiencia
   de la que tenía.

### La parte de #6 que este arreglo desbloquea, y solo esa

5. `hero.level` se actualiza con `levelFromExperience()` — la función que ya
   existe, no otra nueva.
6. Subir de nivel **se dice**: entra en la crónica con protagonista y sitio, como
   cualquier otro `GameEvent`, y por tanto pasa por el sello de `emit`.
7. Se puede subir **más de un nivel de golpe** y se cobran todos, no el último.
8. **Medida, no impresión**: sobre las 200 semillas del banco, cuántos héroes
   alcanzan nivel 2, 3 y 5. La línea base es **0 de 65 en 40 semillas**; lo que no
   vale es que siga en cero.

**Lo que NO entra de #6**: el reparto de atributos por clase al subir de nivel, y
las habilidades secundarias (#15). Un nivel que sube sin dar nada es un número
que sube — lo sé, y es deliberado: **arreglar el surtidor es el prerrequisito de
esa decisión, no la decisión**. Si el arquitecto sostiene que el nivel sin premio
no vale la pena y que el reparto de atributos cabe aquí con su fuente, que lo
argumente en `plan.md` y lo decido yo antes de que se implemente.

### #88 — que el gremio se construya

9. `chooseBuilding` construye el gremio en una **fracción sustancial** de las 200
   semillas, frente a **1 de 40** hoy. El número lo fija el arquitecto; lo que no
   vale es que siga siendo testimonial.
10. La regla nueva **no es un número mágico nuevo en la cascada**. Hoy la cascada
    es una lista de constantes; si la reparación consiste en subir el 40 a 96, hay
    que decir por qué ese y no otro, y qué pasa con el siguiente edificio que
    llegue. Una prioridad que dependa de **lo que el pueblo ya tiene** —el gremio
    sube cuando ya hay moradas que alimentar, o cuando el héroe tiene maná que
    gastar— es preferible a un número más alto, si sale más barata de defender.
11. **Se mide que la magia se ejerza de verdad**, que es lo que el issue denuncia:
    sobre 200 semillas, cuántos hechizos enseña `syncSpellbooks` y cuántos `cast`
    se lanzan en partida. Hoy: **cero y cero**. Un gremio construido que no acaba
    en un hechizo lanzado no cierra #88.

### Lo que no puede romperse

12. `pnpm verify` verde.
13. **`barrido-semillas` sigue en 0/40 sin terminar**, y este es el criterio
    peligroso, no un trámite. Héroes que suben de nivel y magos que lanzan cambian
    el equilibrio de las batallas, y dos ejércitos que crecen a la par son
    exactamente lo que produce partidas eternas. Si el cambio rompe el barrido,
    **el cambio está mal**: no se relaja el guardia.
14. `pnpm banco` **se moverá entero y a propósito**: cambia la economía de todas
    las partidas. Por eso **el criterio de aceptación no es el hash**, igual que en
    el ciclo del radio de visión del castillo: es la **forma del diff**. Se dice
    qué clase de líneas cambian y se comprueba que no cambia ninguna otra. El
    ancla de `tools/qa/banco.ts` se actualiza en el mismo commit que la mueve, con
    la forma del diff escrita en el mensaje.
15. `pnpm qa` verde.
16. **0 € de fal.ai.**

## Fuera de alcance

- **Habilidades secundarias** (#15) y **el reparto de atributos** por subir de
  nivel, salvo que el arquitecto lo defienda y yo lo apruebe.
- **`mage_guild_3`, `_4` y `_5`** (#3). Tentador, porque son entradas de JSON y
  porque el crítico señaló que `lightning_bolt` y `cure` ya existen y son de nivel
  3. Pero **añadir peldaños encima de un edificio que no se construye es poner
  solares vacíos sobre un solar vacío**: primero #88, y entonces #3 se mide de
  verdad. Si al terminar esto el gremio 2 se construye de sobra, `mage_guild_3` es
  el siguiente ciclo y será de una línea.
- **Alargar la partida** (#66) y **el desequilibrio del nigromante** (#89). Ojo con
  el segundo: si el gremio se construye, el nigromante puede salir beneficiado o
  perjudicado. **Se mide y se apunta en #89; no se compensa aquí.**
- **Contenido nuevo**: ni hechizos, ni criaturas, ni facciones.

## Preguntas abiertas, con su suposición por defecto

- **¿La fórmula de experiencia de fheroes2 o una propia?** *Por defecto la del
  original*, con su fuente escrita. Es lo que este repositorio hace cuando
  encuentra una cifra inventada, y acaba de hacerlo con 18 filas de coste.
- **¿Y si la curva `1000 · 1,4^(n−2)` no cuadra con el surtidor arreglado?**
  Entonces **la curva también es una cifra inventada** y se cambia por la del
  original, con su fuente. Lo que no vale es dejar el desajuste y compensarlo
  multiplicando la experiencia.
- **¿El defensor cobra igual que el atacante?** *Por defecto sí*, hasta que la
  fuente diga lo contrario.
- **¿Prioridad nueva o número más alto en `chooseBuilding`?** *Por defecto, lo que
  salga más barato de defender por escrito.* Si es un número, va con su razón.

## Decisiones tomadas

1. **Los dos juntos.** Comparten la propiedad de ser un surtidor cerrado con toda
   la tubería detrás ya construida, y comparten la única medida que los valida:
   una tirada de 200 semillas contando lo que pasa en partida. Separarlos es pagar
   dos veces por la misma instrumentación.
2. **La parte mínima de #6 entra**, porque sin ella #87 no se puede comprobar
   jugando: la experiencia seguiría siendo un número que sube sin consecuencia y
   el criterio 8 no significaría nada.
3. **#3 no entra**, aunque sea barato y esté a mano. Es la lección de este ciclo
   anterior: contenido encima de una puerta que no se abre.
