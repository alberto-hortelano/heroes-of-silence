# Cifras propuestas — fuerza, agilidad y peso (25-10-2026)

**Todo inventado y a ojo**, para que el sistema nuevo se pueda jugar; no está equilibrado ni medido
(«no se prueba la jugabilidad»). Se dice así en el `_comment` de cada JSON.

## Las reglas con que se calcula

- **Peso**: la suma de todo lo puesto. Hasta la fuerza del cuerpo no resta; por encima, −1 de
  agilidad por cada 50 % de la fuerza que se pase, truncado (fuerza 20: peso 30 → −1, 40 → −2,
  25 → 0). Agilidad efectiva, como poco 1.
- **Casillas** = agilidad efectiva (tope 7). **Defensa** = agilidad efectiva + escudo (+ la Defensa
  del héroe). **Daño** = [F, F × agilidad efectiva], con F = fuerza del cuerpo + la del arma.
  **Disparo**: igual, con la fuerza del arco o la ballesta. **Ataque** = el del cuerpo + el del arma.
- **Dos armas**: ataque y fuerza, los de la mejor; la rueda, tipo a tipo, el mejor nivel; el peso,
  la suma.
- **Carga**: +10 %/casilla con el rasgo `charge` y una lanza puesta; si no, +5 %/casilla (a pie).
- La armadura resta del daño como hoy y ya **no da defensa** (el arnés daba +1, la barda +5).
- **PV ×2** respecto a hoy (propuesta, a decidir): el golpe medio sube ~3× (una espada de hoy daba
  20-40; un espadachín de fuerza 22 y agilidad 4 da 32-128), y con los PV de hoy casi todo caería de
  un golpe. Con ×2, unos dos golpes.

## Las piezas (`data/equipo.json`)

| pieza | hueco | ataque | fuerza | defensa | armadura | peso | manos | lanza | hoy |
|---|---|---|---|---|---|---|---|---|---|
| daga | arma | 1 | 4 | — | — | 1 | 1 | | daño 0-10 |
| espada | arma | 2 | 10 | — | — | 4 | 1 | | daño 10-30 |
| maza | arma | 3 | 15 | — | — | 8 | 1 | | daño 20-40 |
| lanza (era `lanza_de_jinete`, hueco `lanza`) | arma | 3 | 12 | — | — | 8 | 1 | sí | ataque 7, daño 40-80 |
| mandoble | arma | 4 | 20 | — | — | 12 | 2 | | ataque 5, daño 30-60 |
| bastón | arma | 0 | 6 | — | — | 4 | 2 | | daño 0-20 |
| arco | distancia | 2 | 10 | — | — | 3 | — | | daño 10-20 |
| ballesta | distancia | 3 | 20 | — | — | 10 | — | | daño 20-40 |
| jubón de arquero | armadura | — | — | — | 2 | 3 | — | | |
| gambesón | armadura | — | — | — | 4 | 6 | — | | defensa 1 |
| brigantina | armadura | — | — | — | 7 | 12 | — | | |
| arnés de placas | armadura | — | — | — | 10 | 22 | — | | defensa 1 |
| barda | armadura | — | — | — | 22 | 30 | — | | defensa 5 |
| rodela | escudo | — | — | 2 | — | 3 | — | | velocidad −1 |
| escudo | escudo | — | — | 3 | — | 8 | — | | defensa 4, velocidad −1 |
| pavés | escudo | — | — | 6 | — | 18 | — | | defensa 7, velocidad −2 |
| espada de herrería (sobre la espada) | | +1 | +3 | | | +0 | | | daño +5/+5 |
| espada bendita (sobre la de herrería) | | +1 | +0 | | | +0 | | | |

Rueda, precios y de dónde se consigue, como hoy. La lanza conserva la rueda de la lanza de jinete.

## Las 34 unidades (`data/unidades.json`)

F = fuerza del cuerpo, Ag = agilidad del cuerpo, A = ataque del cuerpo. Lo de la derecha de «peso»
es derivado. Las agilidades son las casillas de cuerpo de hoy (`tools/arena/velocidades.ts`, el
criterio del usuario del 02-10-2026), salvo el troll (3 → 2: fuerte y torpe). En **negrita**, el
equipo que cambia.

| unidad | F | Ag | A | PV | equipo | peso | −Ag | Ag ef. | casillas | defensa | ataque | daño c/c | disparo (ataque, daño) | armadura | carga |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Guerrero con escudo | 22 | 4 | 3 | 160 | espada + brigantina + escudo | 24 | 0 | 4 | 4 | 7 | 5 | 32–128 | — | 7 | +5 % |
| Guerrero a dos manos | 28 | 4 | 3 | 160 | mandoble + arnés | 34 | 0 | 4 | 4 | 4 | 7 | 48–192 | — | 10 | +5 % |
| Monje | 15 | 4 | 2 | 140 | bastón | 4 | 0 | 4 | 4 | 4 | 2 | 21–84 | — | 0 | +5 % |
| Escudero | 18 | 6 | 3 | 140 | espada + **gambesón + rodela** | 13 | 0 | 6 | 6 | 8 | 5 | 28–168 | — | 4 | +5 % |
| Hermano de carga | 28 | 7 | 4 | 200 | espada + **lanza** + barda | 42 | 1 | 6 | 6 | 6 | 7 | 40–240 | — | 22 | +10 % |
| Penitente | 25 | 4 | 3 | 160 | mandoble + **gambesón** | 18 | 0 | 4 | 4 | 4 | 7 | 45–180 | — | 4 | +5 % |
| Esqueleto guerrero | 14 | 3 | 3 | 100 | espada + brigantina + **rodela** | 19 | 0 | 3 | 3 | 5 | 5 | 24–72 | — | 7 | +5 % |
| Esqueleto arquero | 12 | 3 | 3 | 100 | daga + arco + jubón | 7 | 0 | 3 | 3 | 3 | 4 | 16–48 | 5, 22–66 | 2 | +5 % |
| Zombi | 30 | 3 | 2 | 280 | espada + brigantina + escudo | 24 | 0 | 3 | 3 | 6 | 4 | 40–120 | — | 7 | +5 % |
| Espectro | 15 | 6 | 3 | 140 | espada + brigantina + escudo | 24 | 1 | 5 | 5 | 8 | 5 | 25–125 | — | 7 | +5 % |
| Caballero de la muerte | 30 | 3 | 4 | 200 | mandoble + arnés | 34 | 0 | 3 | 3 | 3 | 8 | 50–150 | — | 10 | +5 % |
| Jinete de plaga | 32 | 5 | 3 | 180 | espada + **lanza** + barda | 42 | 0 | 5 | 5 | 5 | 6 | 44–220 | — | 22 | +10 % |
| Alabardero | 26 | 3 | 3 | 160 | mandoble + arnés | 34 | 0 | 3 | 3 | 3 | 7 | 46–138 | — | 10 | +5 % |
| Piquero | 26 | 3 | 3 | 160 | mandoble + arnés | 34 | 0 | 3 | 3 | 3 | 7 | 46–138 | — | 10 | +5 % |
| Ballestero | 18 | 3 | 3 | 140 | daga + ballesta + gambesón | 17 | 0 | 3 | 3 | 3 | 4 | 22–66 | 6, 38–114 | 4 | +5 % |
| Coracero | 24 | 4 | 3 | 180 | espada + brigantina + escudo | 24 | 0 | 4 | 4 | 7 | 5 | 34–136 | — | 7 | +5 % |
| Arcabucero | 18 | 3 | 3 | 140 | daga + ballesta + gambesón | 17 | 0 | 3 | 3 | 3 | 4 | 22–66 | 6, 38–114 | 4 | +5 % |
| Rodelero | 18 | 6 | 3 | 140 | espada + **gambesón + rodela** | 13 | 0 | 6 | 6 | 8 | 5 | 28–168 | — | 4 | +5 % |
| Artillero con culebrina | 20 | 3 | 3 | 140 | daga + ballesta + gambesón | 17 | 0 | 3 | 3 | 3 | 4 | 24–72 | 6, 40–120 | 4 | +5 % |
| Pistolero montado | 30 | 5 | 3 | 180 | espada + **lanza** + barda | 42 | 0 | 5 | 5 | 5 | 6 | 42–210 | — | 22 | +10 % |
| Granadero | 20 | 4 | 3 | 140 | daga + ballesta + gambesón | 17 | 0 | 4 | 4 | 4 | 4 | 24–96 | 6, 40–160 | 4 | +5 % |
| Arquero élfico | 14 | 5 | 4 | 120 | daga + arco + jubón | 7 | 0 | 5 | 5 | 5 | 5 | 18–90 | 6, 24–120 | 2 | +5 % |
| Explorador | 15 | 6 | 4 | 120 | espada + **gambesón + rodela** | 13 | 0 | 6 | 6 | 8 | 6 | 25–150 | — | 4 | +5 % |
| Guardia del bosque | 18 | 6 | 4 | 140 | espada + brigantina + escudo | 24 | 0 | 6 | 6 | 9 | 6 | 28–168 | — | 7 | +5 % |
| Jinete élfico | 32 | 5 | 4 | 170 | espada + **lanza** + arco + barda | 45 | 0 | 5 | 5 | 5 | 7 | 44–220 | 6, 42–210 | 22 | +10 % |
| Sacerdotisa | 12 | 5 | 2 | 120 | bastón | 4 | 0 | 5 | 5 | 5 | 2 | 18–90 | — | 0 | +5 % |
| Asesino | 15 | 6 | 5 | 120 | espada + **daga + jubón** | 8 | 0 | 6 | 6 | 6 | 7 | 25–150 | — | 2 | +5 % |
| Orko con hacha y escudo | 28 | 4 | 3 | 200 | **maza** + brigantina + escudo | 28 | 0 | 4 | 4 | 7 | 6 | 43–172 | — | 7 | +5 % |
| Orko con dos armas | 28 | 4 | 3 | 180 | **espada + maza + brigantina** | 24 | 0 | 4 | 4 | 4 | 6 | 43–172 | — | 7 | +5 % |
| Goblin lancero | 12 | 4 | 2 | 100 | **lanza + gambesón + rodela** | 17 | 0 | 4 | 4 | 6 | 5 | 24–96 | — | 4 | +5 % |
| Goblin arquero | 11 | 4 | 2 | 100 | daga + arco + jubón | 7 | 0 | 4 | 4 | 4 | 3 | 15–60 | 4, 21–84 | 2 | +5 % |
| Troll con maza | 40 | 2 | 3 | 300 | **maza** | 8 | 0 | 2 | 2 | 2 | 6 | 55–110 | — | 0 | +5 % |
| Jinete de hiena | 24 | 5 | 3 | 140 | espada + **lanza + gambesón** | 18 | 0 | 5 | 5 | 5 | 6 | 36–180 | — | 4 | +10 % |
| Orko con armadura pesada | 22 | 4 | 3 | 200 | mandoble + arnés | 34 | 1 | 3 | 3 | 3 | 7 | 42–126 | — | 10 | +5 % |

Liderazgo, rasgos, habilidades y morada, como hoy. Lo que se lee:

- **Poca variación en lo torpe**: troll 55–110 (×2), zombi 40–120; **mucha en lo ágil**: asesino
  25–150, explorador 25–150 (×6).
- **El peso muerde** en el hermano de carga (la barda: 6 casillas en vez de 7), el espectro (brigantina
  y escudo: 5 en vez de 6) y el orko con armadura pesada (el arnés: 3 en vez de 4). El esqueleto guerrero lleva rodela en vez de
  escudo para no quedarse en 2.
- **Cambios de equipo**, para que se vea lo nuevo: los jinetes llevan espada y lanza (piden los
  requisitos); el orko con dos armas, espada y maza; el asesino, espada y daga; el goblin lancero, una
  lanza con rodela (a pie: +5 %); el troll y el orko con hacha, la maza; escudero, rodelero y
  explorador, rodela y gambesón (ligeros); el penitente, gambesón (iba descalzo y sin armadura, y
  llevaba arnés); el jinete de hiena, gambesón en vez de barda (una hiena con barda pesaba −1).

## El héroe (`data/heroe.json`) y los rangos (`data/experiencia.json`)

| | hoy | propuesta |
|---|---|---|
| PV | 500 + 100/rango | 1000 + 200/rango (×2, como la tropa) |
| fuerza | — (daño 20-40 + 10 de máximo/rango) | 20 + 2/rango |
| agilidad | velocidad `average` (4) | 4 |
| ataque y defensa | los del héroe + 1/rango | igual; su Defensa suma a la defensa, no a la agilidad |
| con Espada y gambesón (recién hecho, 2/2) | ataque 4, defensa 3, daño 30-70, 4 casillas | ataque 4, defensa 6, daño 30–120, 4 casillas, peso 10 |

**Lo que suma cada rango de tropa** (`porRango`): hoy ataque +1 y defensa +1. Propuesta: **ataque +1,
fuerza +2, agilidad +0**. La agilidad por rango movería también las casillas (un rango 5 andaría 4
más, y el tope es 7); si se quiere, se pone a 1 y se dice. La defensa por rango desaparece con la
defensa escrita.

## Lo que no se ha calculado

El índice de poder, el nivel, el coste y el crecimiento de cada unidad salen de estas cifras al
implementarlas (`core/nivel.ts`, `data/economia.json`) y no se escriben. Con el daño medio ~3× y
los PV ×2, se espera ~1-2 niveles más por unidad y ~2× de oro por tropa; si en `pnpm dev` no se
puede reclutar, es lo primero que habrá que ajustar (`oroDelIndice` o `umbralDelNivel2`), con el
usuario.
