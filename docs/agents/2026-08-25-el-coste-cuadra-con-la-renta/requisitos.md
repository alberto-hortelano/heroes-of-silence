# Requisitos — el coste cuadra con la renta

**Issues**: #68 (no hay minas de gemas, mercurio ni azufre: seis edificios son
inalcanzables) y la mitad de #66 que **no** es una decisión de diseño.

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

## La crítica ya está hecha, y está en otra carpeta

**No se lanza crítico.** El diagnóstico completo vive en
`docs/agents/2026-08-25-la-partida-dura-lo-que-tiene-que-durar/critica.md`, que
es una investigación de 198 líneas con contrafácticas de 200 semillas por
escenario. Ese documento **es** la crítica de esta tarea y hay que leerlo entero
antes de diseñar nada.

Su conclusión, en una frase: **la cadena de moradas cuesta 30 de madera y 25 de
mineral, y el mapa reparte 18 y 18 en el tiempo que dura la partida — mientras el
oro sobra por un factor de 20.**

## La línea que separa lo que se hace de lo que no

Esto es lo más importante de este documento, porque el usuario no está para
trazarla:

- **Que gemas, mercurio y azufre no tengan mina mientras seis edificios los piden
  es un bug inequívoco.** Contenido declarado, con datos, con arte generado y con
  la puerta tapiada a cualquier duración de partida. **Se arregla.**
- **Que el coste de los edificios no cuadre con la renta también se arregla**, y
  el motivo es del repositorio, no mío: `CLAUDE.md` dice que las reglas están
  «verificadas contra fheroes2». **La renta se copió cifra a cifra**
  (`MINE_YIELD` es exactamente `ProfitConditions::FromMine`) **y el coste se
  inventó**. Cuadrarlos es corregir una divergencia no declarada, que es
  exactamente lo que este repositorio hace cuando la encuentra.
- **Que la partida dure siete días NO se toca.** Eso sí es diseño: es lo que
  produce un mapa de 2,26 días de ancho con dos castillos y una sola condición de
  victoria. Y no hace falta tocarlo: **con el material cuadrado, ocho días bastan
  para levantar la cadena entera** (194 de 200 llegan a la morada 6). Alargar la
  partida es una decisión del usuario y se queda esperándole.

## Criterios de aceptación

### El bug de las minas (#68)

1. `generateMapPlan` coloca minas de **gemas, mercurio y azufre** además de las
   cuatro de hoy (`src/core/map/generate.ts`, `recursosMina`).
2. Cuántas y dónde sale de la misma regla que gobierna a las otras cuatro: no se
   inventa un caso especial para las tres nuevas.
3. **El reparto es simétrico entre los dos bandos.** Si un jugador nace con una
   mina de gemas a mano y el otro no, la partida está decidida por el generador.
   Hoy la distancia inicial **no varía con la semilla** —siempre (3,3) y
   (20,20)—, así que esto se puede comprobar de verdad.
4. Test: en N mapas generados, los siete recursos tienen al menos una mina.

### El coste (la mitad de #66 que es corrección)

5. El coste de las moradas se cuadra con la renta, **tomando fheroes2 como
   referencia** y no como inspiración. En el original la morada 5 del caballero
   son 3000 de oro y 20 de madera, y **los niveles 1-4 no piden un solo recurso
   raro en ninguna facción**.
6. **La asimetría entre facciones se corrige o se justifica.** Hoy la cadena del
   nigromante hasta la morada 5 pide **55 de mineral** y la del caballero 30 de
   madera + 25 de mineral, teniendo los dos una mina de cada: son 55 unidades a
   2/día, o sea el día 23 en el mejor caso. Si en fheroes2 la asimetría existe,
   se copia y se dice; si no, se cuadra.
7. Cada cifra que se cambie lleva **su fuente escrita al lado** — fichero del
   original o cifra medida—. Es lo que separa esto de retocar números hasta que
   salga bonito.
8. Se toca `data/*.json` y lo mínimo imprescindible de código. Los datos se
   editan sin recompilar: esa es su gracia y es lo que hace este cambio el más
   barato de revertir del repositorio.

### Lo que tiene que pasar después, que es cómo se sabe que ha funcionado

9. **La morada 5 se construye** en una fracción sustancial de las 200 semillas,
   frente a **0 de 200** hoy. El número exacto lo fija el arquitecto; lo que no
   vale es que siga en cero.
10. **Las criaturas de nivel ≥5 pisan el tablero.** Hoy son 1 de 7. Y el **dragón
    óseo** es el caso que solo se desbloquea con las dos mitades a la vez —minas
    y coste—, así que es la prueba de que ambas entraron.
11. La partida **no tiene que durar más**. Si la duración se dispara, es señal de
    que se ha pasado de frenada: con el material cuadrado bastan ocho días.

### Lo que no puede cambiar

12. `pnpm verify` verde. Habrá tests que fijen costes de edificio: **se miran uno
    a uno**, porque un test de coste que cambia puede ser el ajuste o puede ser
    una regla que se ha roto.
13. **`npx tsx tools/qa/barrido-semillas.ts` sigue en 0 partidas sin terminar.**
    Y este es el criterio peligroso, no un trámite: la investigación midió que
    **las moradas a mitad de precio dejan 1 de 200 sin terminar**. La causa
    conocida es que dos ejércitos que crecen a la par nunca alcanzan el margen de
    1,05 de `chooseHeroDestination`. Si el ajuste elegido rompe el barrido, **el
    ajuste está mal**: no se relaja el guardia.
14. `pnpm qa` verde.
15. **0 € de fal.ai.** Las criaturas que aparezcan por primera vez ya tienen arte
    generado: de eso trata el issue.

## Fuera de alcance

- **Alargar la partida** por cualquier vía: mapa más grande, más pueblos
  neutrales, condiciones de victoria nuevas (#23). Todo eso son días comprados
  caros y la investigación lo mide.
- **`MINE_YIELD`**: es la única cifra verificada contra fheroes2 en toda la
  economía. Multiplicarla rinde algo más, pero rompe lo único que estaba bien.
- **Tocar `chooseBuilding`** como arreglo principal: vale 25 partidas de 200.
- **El margen de 1,05 de `chooseHeroDestination`**: `CLAUDE.md` ya avisa de que
  con 1,4 vuelven 3 partidas eternas de 200.
- **Contenido nuevo**: ni criaturas, ni hechizos, ni facciones (#26).

## Preguntas abiertas, con su suposición por defecto

- **¿Bajar el coste o subir la renta?** *Por defecto, bajar el coste*: la renta
  es la única cifra verificada contra el original y el coste es el inventado.
- **¿Cuánto?** *Por defecto, lo que diga fheroes2 edificio por edificio*, no un
  porcentaje plano. Un porcentaje es más fácil de escribir y no tiene fuente.
- **¿Y si al cuadrarlo con el original la partida se desequilibra?** Entonces la
  divergencia se declara, como ya se declaró la del `fear` del dragón óseo: con
  su motivo escrito en `CLAUDE.md`, no en silencio.

## Decisiones tomadas en ausencia del usuario

1. **Separo el bug del diseño y solo hago el bug.** La duración de la partida se
   queda como está y esperando al usuario; el coste que no cuadra con la renta y
   las minas que no existen se arreglan, porque son divergencias no declaradas
   respecto a la referencia que el propio repositorio se ha dado.
2. **No lanzo crítico**: la investigación de #66 ya lo es, y repetirla costaría
   otro contexto para llegar a lo mismo.
3. **Este ciclo va el último de los cuatro en cola**, porque cambia todas las
   partidas y evapora las líneas base byte a byte que los dos ciclos anteriores
   necesitan.
