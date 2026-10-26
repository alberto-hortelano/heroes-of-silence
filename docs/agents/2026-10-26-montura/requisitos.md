# La montura aparte del jinete (26-10-2026)

Sigue a `docs/agents/2026-10-25-fuerza-agilidad-y-disparo/` (fuerza, agilidad y peso; la lanza es un
arma; dos armas). Misma rama, `claude/objective-almeida-2011b2`.

## Petición literal del usuario

> Vamos a separar la montura del personaje, la lanza lo unico que hara es usar la fuerza de la montura
> en la carga. Se usa la fuerza de la montura para el peso y su movimiento. Tambien vamos a dar la
> opcion de comprar caballos que no sean de guerra para que puedan mover mas en el mapa pero sigue
> limitado al mas lento del grupo

## Decisiones del usuario (26-10-2026, a las preguntas del coordinador)

- **La montura es un hueco nuevo del equipo** (`montura`), con piezas: caballo de guerra, caballo de
  silla… cada una con su fuerza, agilidad (o casillas), peso y precio. Se compra, se pone y se quita como
  el resto; los jinetes del catálogo la llevan de serie.
- **Un caballo de silla no entra en batalla**: en batalla esa unidad pelea a pie (sus casillas y su
  fuerza). Solo sirve en el mapa de aventura.
- **El héroe puede montar**, como cualquiera.
- **Se compran en la armería**, los dos tipos, con su precio (inventado).
- **La carga montada con lanza**: F = fuerza de la montura + fuerza de la lanza, con la horquilla
  [F, F × agilidad del jinete]; el +% por casilla de la recta sigue como la carga a pie (+5 %). **El +10 %
  del jinete desaparece.** Sin lanza, montado, la carga es la de a pie con la fuerza del jinete.
- **Montado (de guerra), en batalla**: el peso (el jinete y su equipo) se mide contra la **fuerza de la
  montura**, no la del jinete, y las **casillas son las de la montura** (su agilidad, tras ese peso).
- **En el mapa**: cada individuo vale por las casillas de su montura (de guerra o de silla) o las suyas a
  pie, y la marcha del héroe sale del más lento, como hoy.

## Lo que se pregunta al arquitecto que decida (con propuesta)

- Qué pasa con el rasgo `charge` (hoy: «montado») ahora que montar es llevar un caballo de guerra puesto.
- Defensa del montado: ¿la agilidad efectiva del jinete o la de la montura? (propuesta: la del jinete, que
  es quien esquiva; la montura da casillas).
- Cómo se ve en la arena (ficha, editor de equipo con la sección Montura) y en la tropa de la partida.
- El arte: un jinete desmontado no tiene figura propia (fuera de alcance: se pinta con su hoja).

## Criterios

1. Hueco `montura` con piezas validadas (`problemasDePieza`): fuerza, agilidad, peso, precio, y si es de
   guerra o de silla. Caballo de guerra y caballo de silla en `data/equipo.json`, en la armería.
2. Los jinetes del catálogo llevan un caballo de guerra de serie; el peso y las casillas en batalla salen de
   la montura; la carga con lanza usa su fuerza; sin +10 %.
3. Un caballo de silla no cambia nada en batalla; en el mapa, sube la marcha si todos los del grupo la
   suben (el más lento manda).
4. El héroe y la tropa pueden ponerse y quitarse montura (arena, tropa de la partida, agente con su slot).
5. El contrato del agente nombra el slot nuevo y la prosa lo explica; `creature_stats` dice la montura.
6. Sin compatibilidad hacia atrás (sube `VERSION_DEL_ENLACE`). Tests por partes, solo lo que mienta;
   nada de jugabilidad; el disparo, sin tests. CLAUDE.md al día. Se ve en `pnpm dev` y la arena en el 3150.

## Visto bueno del plan (26-10-2026, decisiones del usuario)

- Plan del arquitecto (`plan.md`) aprobado tal cual, con sus cifras y el rasgo `charge` retirado.
- **P1: el héroe cuenta en «el más lento del grupo»** del mapa (un héroe a pie frena; a caballo, no).
- **P2: montado de guerra, el jinete pelea con su agilidad entera**: el peso lo carga el caballo.
