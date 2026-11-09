/**
 * El ejército en los paneles de la partida: la fila de una tropa (`filaDeTropa`, la
 * única, con su veteranía y lo que lleva), el ejército agrupado (`renderArmy`), la tropa
 * del héroe en su castillo con un «−1» por tipo (`renderTropaLicenciable`; el mismo
 * botón, `botonDeLicenciar`, va en el panel del héroe en el mapa) y la fila del
 * liderazgo (`filaLiderazgo`). La pintan el mapa, la base, la morada, el
 * ayuntamiento y la guarnición. Era parte de `views/panels.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { isShooter } from '@core/battle/armas.js';
import { pieza } from '@core/equipo/pieza.js';
import { elQueSeIria, type TroopGroup, troopSummary } from '@core/hero/troop.js';
import { conMiles } from '@core/texto.js';
import { type Army, HUECOS } from '@core/types.js';
import { nivelDeUnidad } from '@core/unidad/nivel.js';
import { type Html, html, NADA, unir } from '../comun/html.js';
import { filaDeCifra } from '../views/cifras.js';

/**
 * El liderazgo ocupado sobre el tope, con su barra. Lo pinta el héroe del mapa y
 * el castillo: es la cifra que decide cuántos más caben, y sin verla «todo»
 * parecía reclutar menos de lo que había por capricho.
 */
export function filaLiderazgo({ ocupado, tope }: { ocupado: number; tope: number }): Html {
  return html`${filaDeCifra('Liderazgo', `${ocupado} / ${tope}`)}
    <progress class="liderazgo" max="${tope}" value="${Math.min(ocupado, tope)}"></progress>`;
}

/**
 * El rango de un veterano, su nivel y lo que le falta para el rango siguiente, o
 * nada si es una fila de novatos: «Rango 3 · nivel 4». Las cifras salen de
 * `troopSummary` y el nivel de `nivelDeUnidad`: el panel no sabe qué umbral
 * tiene cada rango ni cómo se mide un nivel.
 */
function lineaDeVeterania(g: TroopGroup): Html {
  if (g.veterania === undefined) return NADA;
  const exp = conMiles(g.veterania.experiencia);
  const falta =
    g.siguiente === null ? `${exp} exp · rango máximo` : `${exp} / ${conMiles(g.siguiente)} exp`;
  // «Veterano» desde el rango 2: a punto del primer umbral todavía es un novato
  // que ha empezado a aprender, y llamarlo veterano sería mentirle.
  const nivel = `nivel ${nivelDeUnidad(g.unit)}`;
  const quien = g.rango >= 2 ? `Veterano · rango ${g.rango} · ${nivel}` : `Rango 1 · ${nivel}`;
  return html`<span class="veterania">${quien} · ${falta}</span>`;
}

/**
 * Lo que lleva puesto el individuo de una fila, en una línea, o nada. Solo la
 * puede tener una fila de uno —quien lleva algo tiene hoja y va solo
 * (`troopSummary`)—, y por eso basta con mirar su hoja. Con `heroId`, debajo va
 * una línea aparte con un botón por pieza para devolverla a la mochila de ese
 * héroe: **una sola línea de equipo**, con o sin los botones.
 *
 * Los botones no van dentro de «Lleva:»: metidos entre los nombres eran «×» de
 * tamaño completo con la coma pegada detrás («[×] , Cota de malla»). En su línea
 * llevan el nombre de lo que quitan, que es lo que el «×» solo no decía.
 */
function lineaDeEquipo(g: TroopGroup, heroId?: string): Html {
  const hoja = g.veterania;
  if (hoja === undefined) return NADA;
  const puestas = HUECOS.flatMap((hueco) => {
    const id = hoja.equipo?.[hueco];
    return id === undefined ? [] : [{ hueco, nombre: pieza(id).nombre }];
  });
  if (puestas.length === 0) return NADA;
  const lleva = html`<span class="veterania">Lleva: ${puestas.map((p) => p.nombre).join(', ')}</span>`;
  if (heroId === undefined) return lleva;
  const botones = unir(
    puestas.map(
      (p) =>
        html`<button data-action="unequip" data-hero="${heroId}" data-slot="${p.hueco}" data-veteran="${hoja.id}" title="Quitársela y guardarla en la mochila">× ${p.nombre}</button>`,
    ),
  );
  return html`${lleva}<span class="quitar-equipo">${botones}</span>`;
}

/**
 * Una fila de la tropa: el nombre, la marca de tirador, la veteranía, lo que
 * lleva y el recuento, con lo que cada panel le añada —un botón al lado del
 * recuento, los «×» del equipo—. **La única fila de tropa**: la comparten la del
 * mapa, la que licencia y la que equipa.
 */
export function filaDeTropa(
  g: TroopGroup,
  extras: { readonly boton?: Html; readonly quitarDe?: string } = {},
): Html {
  const marca = isShooter(g.unit) ? ' ↑' : '';
  return html`<div class="stack"><span>${g.unit.name}${marca}${lineaDeVeterania(g)}${lineaDeEquipo(g, extras.quitarDe)}</span><span class="count en-linea">${g.count}${extras.boton ?? NADA}</span></div>`;
}

/**
 * El ejército agrupado: una fila por criatura con cuántos individuos lleva, y
 * una por veterano, con su nivel y lo que le falta. Agrupa `troopSummary`, no
 * este panel.
 */
export function renderArmy(army: Army): Html {
  if (army.length === 0) {
    return html`<div class="stack-list"><div class="stack empty"><span>—</span></div></div>`;
  }
  const filas = unir(troopSummary(army).map((g) => filaDeTropa(g)));
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * El «−1» de la fila `g` del ejército `army`: licencia uno de ese tipo. Solo en la
 * fila de quien se iría de verdad (si no, `NADA`). Sin comprobar reglas: si no se
 * puede, lo dice el núcleo en la barra. La pintan la base y la morada
 * (`renderTropaLicenciable`) y el panel del héroe en el mapa, que licencia en
 * cualquier casilla desde el 09-11-2026.
 */
export function botonDeLicenciar(heroId: string, army: Army, g: TroopGroup): Html {
  // `dismiss` licencia POR TIPO, y de cada tipo se va primero quien diga
  // `elQueSeIria`. Así que el botón va solo en la fila de quien se iría de
  // verdad: puesto en la de un veterano con novatos de su tipo detrás, el clic
  // se habría llevado a otro sin decirlo.
  const t = elQueSeIria(army, g.creature);
  if (t === null || t.veterania?.id !== g.veterania?.id) return NADA;
  return html` <button data-action="dismiss" data-hero="${heroId}" data-creature="${g.creature}" title="Licenciar uno: de cada tipo se va primero el de menos experiencia">−1</button>`;
}

/**
 * La tropa del héroe que está en su castillo, con un botón por criatura para
 * licenciar uno: es donde se cambia tropa barata por otra mejor. Un veterano
 * solo lo lleva si es él quien se iría (`botonDeLicenciar`).
 */
export function renderTropaLicenciable(heroId: string, army: Army): Html {
  if (army.length === 0) return renderArmy(army);
  const filas = unir(
    troopSummary(army).map((g) => filaDeTropa(g, { boton: botonDeLicenciar(heroId, army, g) })),
  );
  return html`<div class="stack-list">${filas}</div>`;
}
