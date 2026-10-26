# Bajar las cifras del combate (26-10-2026)

Sigue a `docs/agents/2026-10-25-fuerza-agilidad-y-disparo/` y `docs/agents/2026-10-26-montura/`.
Rama `claude/objective-almeida-2011b2`. **Cifras a ojo**: ni tests de jugabilidad ni medidas de
equilibrio (CLAUDE.md).

## Petición literal del usuario

> Falta lo que había hecho en la tropa, que se ha perdido, la idea es bajar los números. La fuerza es
> excesiva y importa mucho más que la habilidad, debería tener un número similar. Los pesos son
> enormes, por eso los he bajado. Baja todos los pesos. La daga 0, la espada 1, el mandoble 2. Lo más
> pesado son las armaduras y menos PV

Además, sus cambios de equipo de antes de la rama (en el formato viejo, descartados al fusionar): ataque
de espada 3, mandoble 2, maza 1, daga 0; la daga con más daño (5-20 frente al 10-30 de la espada); maza
y pavés en la armería; rueda: daga Ofensivo 1, maza Defensivo 2; la barda se llama «Coraza»; el arnés y
la coraza frenan y la rodela no (hoy eso es su peso); pavés defensa 6; dos armas nuevas a dos manos en la
armería: Alabarda (ataque 3, rueda toda a 4, 400 oro, daño como la espada) y Lanza de infantería, que se
llama «Lanza» (ataque 4, rueda O3 F2 Fi3 D4 R4 RG4, 100 oro, daño como la espada, sin marca de lanza);
la lanza de hoy, la de la carga, pasa a llamarse «Lanza de jinete». El alabardero lleva la alabarda y el
piquero la lanza de infantería. Su escudero lleva la lanza de jinete (una mano, con rodela).

Sus muestras de escala, ya en `data/unidades.json` sin commitear: templario-mandoble fuerza 28 → 8,
templario-escudero fuerza 18 → 6 y agilidad 6 → 4 con arma `lanza`, elfo-arquero fuerza 14 → 6.

## La escala (decidida por el coordinador sobre esas muestras)

El daño medio baja ~3,2× (espada: cuerpo 22 + arma 10 = 32 → 7 + 3 = 10). Lo que se mide contra él baja
igual: **PV y armadura × 0,3**.

### Fuerza del cuerpo (unidades)

| unidad | F hoy → nueva | | unidad | F hoy → nueva |
|---|---|---|---|---|
| templario-escudo | 22 → 7 | | imperio-coracero | 24 → 7 |
| templario-mandoble | 8 (ya) | | imperio-arcabucero | 18 → 6 |
| templario-monje | 15 → 6 | | imperio-rodelero | 18 → 6 |
| templario-escudero | 6 (ya) | | imperio-artillero-culebrina | 20 → 6 |
| templario-hermano-de-carga | 22 → 7 | | imperio-pistolero-montado | 20 → 6 |
| templario-penitente | 25 → 8 | | imperio-granadero | 20 → 6 |
| esqueleto-guerrero | 14 → 5 | | elfo-arquero | 6 (ya) |
| esqueleto-arquero | 12 → 4 | | elfo-explorador | 15 → 6 |
| zombi | 30 → 9 | | elfo-guardia-del-bosque | 18 → 6 |
| espectro | 15 → 6 | | elfo-jinete | 16 → 6 |
| caballero-de-la-muerte | 30 → 9 | | elfo-sacerdotisa | 12 → 4 |
| jinete-de-plaga | 24 → 7 | | elfo-asesino | 15 → 6 |
| imperio-alabardero | 26 → 8 | | orko-hacha-escudo | 28 → 8 |
| imperio-piquero | 26 → 8 | | orko-dos-armas | 28 → 8 |
| imperio-ballestero | 18 → 6 | | goblin-lancero | 12 → 4 |
| | | | goblin-arquero | 11 → 4 |
| | | | troll-maza | 40 → 12 |
| | | | goblin-jinete-de-hiena | 12 → 4 |
| | | | orko-armadura-pesada | 22 → 7 |

El ataque y la agilidad de las unidades no cambian (salvo la del escudero, que ya cambió el usuario).
Héroe (`data/heroe.json`): fuerza 20 → 6 y por rango 2 → 1; PV 1000 → 300 y por rango 200 → 60. Tropa
por rango (`data/experiencia.json`, `porRango.fuerza`): 2 → 1.

### PV de las unidades: × 0,3, redondeado a 5

160 → 50, 140 → 40, 100 → 30, 280 → 85, 200 → 60, 180 → 55, 120 → 35, 170 → 50, 300 → 90.

### Piezas (`data/equipo.json`)

| pieza | ataque | fuerza | peso | otro |
|---|---|---|---|---|
| daga | 0 | 2 | 0 | rueda Ofensivo 1 |
| espada | 3 | 3 | 1 | |
| mandoble | 2 | 6 | 2 | dos manos |
| bastón | 0 | 2 | 1 | |
| maza | 1 | 5 | 1 | armería; rueda Defensivo 2 |
| lanza (id `lanza`) → nombre «Lanza de jinete» | 3 | 4 | 2 | marca de lanza, una mano |
| alabarda (nueva, `alabarda`) | 3 | 3 | 2 | dos manos, rueda toda a 4, 400 oro, armería |
| «Lanza» de infantería (nueva, `lanza_de_infanteria`) | 4 | 3 | 2 | dos manos, rueda O3 F2 Fi3 D4 R4 RG4, 100 oro, armería, sin marca de lanza |
| arco | 2 | 3 | 1 | |
| ballesta | 3 | 6 | 2 | |
| espada de herrería (extras) | +1 | +1 | | (era +3 de fuerza) |
| jubón de arquero | | | 1 | armadura 1 |
| gambesón | | | 2 | armadura 1 |
| brigantina | | | 5 | armadura 2 |
| arnés de placas | | | 10 | armadura 3 |
| barda → nombre «Coraza» (id `barda`) | | | 12 | armadura 7 |
| rodela | | | 1 | defensa 2 |
| escudo | | | 2 | defensa 3 |
| pavés | | | 3 | defensa 6, armería |
| caballo de guerra | | 16 | 3 | agilidad 6 (era F 50, peso 10) |
| caballo de silla | | 10 | 2 | agilidad 7 (era F 30, peso 6) |
| hiena de guerra | | 10 | 2 | agilidad 6 (era F 30, peso 6) |

Con eso (regla del peso: −1 de agilidad por cada 50 % de la fuerza que se pase): el arnés quita 1 a
quien lo lleva con mandoble y F 7-8 (alabardero, piquero, templario del mandoble, orko pesado) y nada al
caballero de la muerte (F 9); brigantina, escudo y rodela no quitan a sus portadores de hoy; el caballo
de guerra carga al hermano de carga (espada 1 + lanza 2 + coraza 12 + caballo 3 = 18 frente a 16: 0) y al
jinete élfico con su arco (19: 0), como hoy. **Si alguna unidad sale con −2 o más por el peso, ajústalo
y dilo.**

### Unidades: equipo

- imperio-alabardero: `arma: alabarda` (sigue con arnés).
- imperio-piquero: `arma: lanza_de_infanteria` (sigue con arnés).
- El resto, como está (el escudero, con `lanza` = la de jinete, y rodela).

## Lo que se recalibra porque depende de la escala (lo decide el ingeniero, diciéndolo)

- Hechizos y poderes que quitan o curan PV, y lo que haga falta de `ESCALA_DE_CIFRAS` (× 0,3, la misma
  proporción): que un hechizo de daño no mate de un golpe lo que antes aguantaba tres.
- Lo que derivan el índice de poder y la IA (umbral del nivel 2 en `data/poder.json`, `DIVISOR_DEL_PODER`,
  `fuerzaMax` de los asaltantes, el divisor de `oroDelIndice`): que las 34 sigan del nivel 2 al 4, que la
  mediana del precio del catálogo siga como hoy (decisión del usuario del 25-10) y que la IA mida igual.
  Como en la fase 1 de fuerza y agilidad.
- La experiencia (`data/experiencia.json`, base): cobra PV × índice; si los dos bajan, que los umbrales
  bajen en la misma proporción para que un rango cueste lo mismo en golpes.
- El personaje de `core/rpg/` si tiene sus propias cifras de fuerza y PV.

## Criterios

1. Las cifras de arriba en los datos, con su `_comment` diciendo que son a ojo (26-10-2026).
2. Sin cambios de reglas: solo datos y las calibraciones que dependen de la escala.
3. La tabla final en `docs/agents/2026-10-26-escala-baja/cifras.md`: unidad por unidad, F, agilidad
   efectiva, PV, peso, defensa, daño cuerpo a cuerpo, disparo y carga, casillas, nivel y precio —
   **sacada del código** (un script con el núcleo), no a mano.
4. `pnpm typecheck`, `pnpm lint` y solo los tests que toque la reescala, justificados en
   `implementacion.md` de esta carpeta. Las anclas numéricas se re-anclan sin juzgarlas. `pnpm qa`,
   `pnpm banco` re-anclado diciendo la forma del diff, barrido con 0 sin terminar.
5. Commit en la rama sin push; el 3150 sirviendo lo nuevo.
