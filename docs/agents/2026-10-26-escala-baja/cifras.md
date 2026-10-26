# Cifras del catálogo con la escala baja (26-10-2026)

**Cifras a ojo** (petición del usuario, «la idea es bajar los números»; ver `requisitos.md`), sin
medir el equilibrio. Sacada del núcleo, no a mano:

    npx tsx tools/qa/cifras-del-catalogo.ts --medianas

Cada unidad con su equipo de serie, como la recluta la partida (`unidadesDelJuego`). **F** es la
fuerza del cuerpo; la agilidad, la que le deja el peso (entre paréntesis, lo que le quita; montado
de guerra, la entera: el peso lo carga la montura); el peso, el de lo que lleva (y, si monta, el de la
montura con su fuerza); el daño cuerpo a cuerpo y el disparo, [F + la del arma, × agilidad]; la
carga, su horquilla antes del +5 %/casilla (montada: con la fuerza de la montura más la de la lanza);
casillas, las de batalla; nivel, la primera cifra del índice; precio, índice² / 500 en oro.

| unidad | F | agilidad efectiva (−peso) | PV | peso | defensa | armadura | cuerpo a cuerpo | disparo | carga | casillas | nivel (índice) | precio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| templario-escudo | 7 | 4 | 50 | 8 | 7 | 2 | 10–40 | — | 10–40 | 4 | 3 (316) | 200 |
| templario-mandoble | 8 | 3 (−1) | 50 | 12 | 3 | 3 | 14–42 | — | 14–42 | 3 | 3 (303) | 180 |
| templario-monje | 6 | 4 | 40 | 1 | 4 | 0 | 8–32 | — | 8–32 | 4 | 2 (227) | 100 |
| templario-escudero | 6 | 4 | 40 | 5 | 6 | 1 | 10–40 | — | 10–40 | 4 | 2 (285) | 160 |
| templario-hermano-de-carga | 7 | 4 | 60 | 15 + 3 de Caballo de guerra (F 16) | 4 | 7 | 11–44 | — | 20–80 montada | 6 | 4 (479) | 460 |
| templario-penitente | 8 | 4 | 50 | 4 | 4 | 1 | 14–56 | — | 14–56 | 4 | 3 (312) | 190 |
| esqueleto-guerrero | 5 | 3 | 30 | 7 | 5 | 2 | 8–24 | — | 8–24 | 3 | 2 (225) | 100 |
| esqueleto-arquero | 4 | 3 | 30 | 2 | 3 | 1 | 6–18 | 7–21 | 6–18 | 3 | 2 (209) | 90 |
| zombi | 9 | 3 | 85 | 8 | 6 | 2 | 12–36 | — | 12–36 | 3 | 3 (329) | 220 |
| espectro | 6 | 6 | 40 | 8 | 9 | 2 | 9–54 | — | 9–54 | 6 | 3 (341) | 230 |
| caballero-de-la-muerte | 9 | 3 | 60 | 12 | 3 | 3 | 15–45 | — | 15–45 | 3 | 3 (321) | 210 |
| jinete-de-plaga | 7 | 4 | 55 | 15 + 3 de Caballo de guerra (F 16) | 4 | 7 | 11–44 | — | 20–80 montada | 6 | 4 (466) | 430 |
| imperio-alabardero | 8 | 2 (−1) | 50 | 12 | 2 | 3 | 11–22 | — | 11–22 | 2 | 2 (250) | 130 |
| imperio-piquero | 8 | 2 (−1) | 50 | 12 | 2 | 3 | 11–22 | — | 11–22 | 2 | 2 (252) | 130 |
| imperio-ballestero | 6 | 3 | 40 | 4 | 3 | 1 | 8–24 | 12–36 | 8–24 | 3 | 2 (271) | 150 |
| imperio-coracero | 7 | 4 | 55 | 8 | 7 | 2 | 10–40 | — | 10–40 | 4 | 3 (322) | 210 |
| imperio-arcabucero | 6 | 3 | 40 | 4 | 3 | 1 | 8–24 | 12–36 | 8–24 | 3 | 2 (271) | 150 |
| imperio-rodelero | 6 | 6 | 40 | 4 | 8 | 1 | 9–54 | — | 9–54 | 6 | 3 (328) | 220 |
| imperio-artillero-culebrina | 6 | 3 | 40 | 4 | 3 | 1 | 8–24 | 12–36 | 8–24 | 3 | 2 (271) | 150 |
| imperio-pistolero-montado | 6 | 4 | 55 | 15 + 3 de Caballo de guerra (F 16) | 4 | 7 | 10–40 | — | 20–80 montada | 6 | 4 (466) | 430 |
| imperio-granadero | 6 | 4 | 40 | 4 | 4 | 1 | 8–32 | 12–48 | 8–32 | 4 | 3 (306) | 190 |
| elfo-arquero | 6 | 5 | 35 | 2 | 5 | 1 | 8–40 | 9–45 | 8–40 | 5 | 3 (305) | 190 |
| elfo-explorador | 6 | 6 | 35 | 4 | 8 | 1 | 9–54 | — | 9–54 | 6 | 3 (323) | 210 |
| elfo-guardia-del-bosque | 6 | 6 | 40 | 8 | 9 | 2 | 9–54 | — | 9–54 | 6 | 3 (345) | 240 |
| elfo-jinete | 6 | 5 | 50 | 16 + 3 de Caballo de guerra (F 16) | 5 | 7 | 10–50 | 9–45 | 20–100 montada | 6 | 4 (485) | 470 |
| elfo-sacerdotisa | 4 | 5 | 35 | 1 | 5 | 0 | 6–30 | — | 6–30 | 5 | 2 (225) | 100 |
| elfo-asesino | 6 | 6 | 35 | 2 | 6 | 1 | 9–54 | — | 9–54 | 6 | 3 (325) | 210 |
| orko-hacha-escudo | 8 | 4 | 60 | 8 | 7 | 2 | 13–52 | — | 13–52 | 4 | 3 (334) | 220 |
| orko-dos-armas | 8 | 4 | 55 | 7 | 4 | 2 | 13–52 | — | 13–52 | 4 | 3 (329) | 220 |
| goblin-lancero | 4 | 4 | 30 | 5 | 6 | 1 | 8–32 | — | 8–32 | 4 | 2 (238) | 110 |
| goblin-arquero | 4 | 4 | 30 | 2 | 4 | 1 | 6–24 | 7–28 | 6–24 | 4 | 2 (232) | 110 |
| troll-maza | 12 | 2 | 90 | 1 | 2 | 0 | 17–34 | — | 17–34 | 2 | 2 (285) | 160 |
| goblin-jinete-de-hiena | 4 | 5 | 40 | 5 + 2 de Hiena de guerra (F 10) | 5 | 1 | 8–40 | — | 14–70 montada | 6 | 3 (334) | 220 |
| orko-armadura-pesada | 7 | 3 (−1) | 60 | 12 | 3 | 3 | 13–39 | — | 13–39 | 3 | 3 (309) | 190 |
| héroe recién hecho (1/1, Espada y gambesón) | 6 | 4 | 300 | 3 | 5 | 1 | 9–36 | — | 9–36 | 4 | 4 (411) | — |

## Las varas de la recalibración

- poder bruto: mediana 1380
- poder bruto²: mediana 1904689
- índice: 209–485, mediana 310.5
- precio: 90–470, mediana 190
- fuerza de la IA (unitPower): mediana 30.2

Antes de la escala baja (en `f390d2b8`, con el mismo script): poder bruto, mediana 4 649,5; poder
bruto², mediana 21 619 332,5; índice 202–462, mediana 310; precio 80–430, mediana 190; fuerza de la
IA, mediana 30,2. De ahí `umbralDelNivel2` 2 098 → 623 y `DIVISOR_DEL_PODER` 714 961 → 62 989.
