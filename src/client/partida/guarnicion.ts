/**
 * Las dos pantallas de la guarnición (puesto fronterizo, fase 1, 04-11-2026), cada
 * una en su `<dialog>`, por la puerta del marcado:
 *
 *  - **repartir** (`<dialog id="guarnicion">`): el ejército del héroe y la
 *    guarnición del sitio suyo donde está, en dos columnas, como quedarían con lo
 *    que se edita: «Dejar ›» y «‹ Recoger» pasan uno al otro lado (el veterano, él)
 *    sin tocar la partida, y «Confirmar» manda el reparto entero, que el núcleo
 *    juzga solo al final (D9: con los dos llenos se cambia uno por otro). «Cancelar»
 *    y Escape lo descartan;
 *    En un paso (un puesto), debajo, **su obra** (fase 3): la que tiene, qué se
 *    pelea tras ella y el botón de la siguiente con su precio, apagado con el motivo
 *    del núcleo (`laObraDelPuesto`);
 *  - **la defensa** (`<dialog id="defensa">`): con quién defiende el héroe atacado
 *    en su sitio, de su ejército y la guarnición, con la propuesta de la IA de
 *    partida y «−»/«+» por tipo.
 *
 * Lo que no se puede hacer sale apagado (`atributosDeApagado`, que deja leerlo y
 * enfocarlo) con su motivo debajo (`motivoDelRechazo`), que escribe el núcleo
 * (`elReparto`, `defensaPorElegir`): la persona lee por qué, no un botón gris mudo,
 * como en la conversación de un lugar. Lo que solo informa (ya pelean todos) va en
 * el tono apagado (`notaDelApagado`), no en el del rechazo (H5 del QA de la fase 1).
 */

import type { TroopGroup } from '@core/hero/troop.js';
import { OBRAS_DE_UN_PUESTO } from '@core/map/tipos.js';
import type { LadoDelReparto, LaObraDelPuesto } from '@core/state/sitios.js';
import { describirCoste } from '@core/texto.js';
import { DICHO_DE_LA_OBRA, SE_VE_EN_EL_PUESTO } from '../comun/dichos.js';
import { type Html, html, NADA, unir } from '../comun/html.js';
import type { VistaDeLaDefensa } from '../sesion/partida/defensa.js';
import type { VistaDeLaGuarnicion } from '../sesion/partida/guarnicion.js';
import type { VistaDeLoQueSobra } from '../sesion/partida/sobrantes.js';
import {
  atributosDeApagado,
  filaDeCifra,
  motivoDelRechazo,
  notaDelApagado,
} from '../views/cifras.js';
import { filaDeTropa, filaLiderazgo } from './ejercito.js';

/** Un botón que pasa uno del grupo `g` al otro lado del reparto (`data-hacia`). */
function botonDeMover(hacia: 'heroe' | 'guarnicion', g: TroopGroup): Html {
  const veterano = g.veterania?.id;
  return html` <button data-action="mover-en-el-reparto" data-hacia="${hacia}" data-creature="${g.creature}"${
    veterano === undefined ? NADA : html` data-veterano="${veterano}"`
  }>${hacia === 'heroe' ? '‹ Recoger' : 'Dejar ›'}</button>`;
}

/** Una columna: sus filas con su botón. */
function columna(lado: LadoDelReparto, hacia: 'heroe' | 'guarnicion', vacia: string): Html {
  if (lado.filas.length === 0) {
    return html`<div class="stack-list"><div class="stack empty"><span>${vacia}</span></div></div>`;
  }
  return html`<div class="stack-list">${unir(
    lado.filas.map((g) => filaDeTropa(g, { boton: botonDeMover(hacia, g) })),
  )}</div>`;
}

/**
 * La obra del puesto: la que tiene, tras qué se pelea en él y el botón de la
 * siguiente con su precio. Apagado, con lo que diga el núcleo debajo: sin oro, un
 * rechazo (`motivo`); ya amurallado, una nota (`nota`: no hay nada que arreglar).
 */
function seccionDeLaObra(o: LaObraDelPuesto): Html {
  const hoy = o.materiales[o.ahora];
  const boton =
    o.siguiente === null
      ? 'Mejorar'
      : `${DICHO_DE_LA_OBRA[o.siguiente.obra].boton} · ${describirCoste(o.siguiente.precio)}`;
  // El botón dice qué obra compra (QA de la fase 3, H-F3-1): el clic la manda tal
  // cual y, si el diálogo ya no la ofrece, el núcleo la rechaza sin cobrar.
  const queObra = o.siguiente === null ? NADA : html` data-obra="${o.siguiente.obra}"`;
  const cadaObra = OBRAS_DE_UN_PUESTO.map(
    (obra) =>
      `${DICHO_DE_LA_OBRA[obra].nombre} (en el mapa, ${SE_VE_EN_EL_PUESTO[obra]}) pone una muralla de ${o.materiales[obra]} en la batalla`,
  ).join(', y ');
  return html`<section class="obra-del-puesto">
      <h4>El puesto · ${SE_VE_EN_EL_PUESTO[o.ahora]}</h4>
      <p class="cost">Hoy la batalla en el paso se pelea ${hoy === null ? 'sin muralla' : `tras una muralla de ${hoy}`}. Se mejora de una en una y no se baja: ${cadaObra}. La obra se queda con el paso si cambia de dueño.</p>
      <div class="botones"><button data-action="mejorar-el-puesto"${queObra}${atributosDeApagado(o.motivo ?? o.nota)}>${boton}</button></div>
      ${motivoDelRechazo(o.motivo)}${notaDelApagado(o.nota)}
    </section>`;
}

export function renderGuarnicion(v: VistaDeLaGuarnicion): Html {
  return html`<h3 id="titulo-de-la-guarnicion">Guarnición ${v.delSitio}</h3>
    <p class="cost">Reparte la tropa entre ${v.hero.name} y la guarnición y confirma: lo que no cabe a un lado se puede mover mientras el reparto final quepa. Lo que se deja guarda el sitio: si atacan con el héroe dentro, defiende con lo que elija de los dos; sin él, la guarnición entera.</p>
    <div class="columnas-de-la-guarnicion">
      <section>
        <h4>Con ${v.hero.name} · ${v.heroe.individuos} de ${v.heroe.cupo} individuos</h4>
        ${filaLiderazgo({ ocupado: v.heroe.liderazgo, tope: v.heroe.tope })}
        ${columna(v.heroe, 'guarnicion', 'No lleva tropa.')}
      </section>
      <section>
        <h4>En la guarnición · ${v.guarnicion.individuos} de ${v.guarnicion.cupo} individuos</h4>
        ${filaLiderazgo({ ocupado: v.guarnicion.liderazgo, tope: v.guarnicion.tope })}
        ${columna(v.guarnicion, 'heroe', 'No guarda a nadie.')}
      </section>
    </div>
    ${v.obra === null ? NADA : seccionDeLaObra(v.obra)}
    ${motivoDelRechazo(v.motivo)}
    <div class="botones">${
      v.cambia
        ? html`
      <button data-action="cerrar-guarnicion">Cancelar</button>
      <button data-action="confirmar-reparto"${atributosDeApagado(v.motivo, 'primary')}>Confirmar</button>`
        : html`
      <button data-action="cerrar-guarnicion" class="primary">Cerrar</button>`
    }
    </div>`;
}

export function renderDefensa(v: VistaDeLaDefensa): Html {
  const filas = unir(
    v.filas.map((f) => {
      const cambio =
        f.pelean === f.propuesta
          ? NADA
          : html` <span class="veterania">(la IA: ${f.propuesta})</span>`;
      return html`<div class="stack"><span>${f.nombre}${cambio}</span><span class="count">
          <button data-action="defensa-menos" data-creature="${f.creature}"${atributosDeApagado(f.motivoMenos)} aria-label="Uno menos de ${f.nombre}">−</button>
          ${f.pelean} de ${f.hay}
          <button data-action="defensa-mas" data-creature="${f.creature}"${atributosDeApagado(f.motivoMas ?? f.notaMas)} aria-label="Uno más de ${f.nombre}">+</button>
        </span></div>${motivoDelRechazo(f.motivoMas)}${notaDelApagado(f.notaMas)}`;
    }),
  );
  return html`<h3 id="titulo-de-la-defensa">¡Te atacan en ${v.sitio}!</h3>
    <p class="cost">${v.hero.name} pelea siempre. Elige quién pelea con él, de su tropa y de la guarnición; lo que no pelea se queda fuera y, si pierde, se pierde con el sitio. Viene marcado lo que propone la IA: lo más fuerte que cabe.</p>
    <p class="cost">Los que elijas se quedan con ${v.hero.name} después de la batalla, y los demás, en la guarnición.</p>
    ${filaDeCifra('Pelean con él', `${v.ocupa.individuos} de ${v.cabe.cupo} · liderazgo ${v.ocupa.liderazgo} de ${v.cabe.tope}`)}
    <div class="stack-list">${filas}</div>
    ${motivoDelRechazo(v.motivo)}
    <div class="botones">
      <button data-action="defensa-de-la-ia">Como propone la IA</button>
      <button data-action="defensa-confirmar"${atributosDeApagado(v.motivo, 'primary')}>Defender</button>
    </div>`;
}

/**
 * Lo que sobra al volver de una batalla (`<dialog id="sobrantes">`, 08-11-2026,
 * «Levantar zombi»): una fila por tipo con cuántos se dejan, la frase del núcleo en
 * directo (`dejarBlocker`) y «Seguir», apagado mientras no valga. Viene marcado lo
 * que propone la IA.
 */
export function renderLoQueSobra(v: VistaDeLoQueSobra): Html {
  const filas = unir(
    v.filas.map((f) => {
      const cambio =
        f.deja === f.propuesta
          ? NADA
          : html` <span class="veterania">(la IA: ${f.propuesta})</span>`;
      return html`<div class="stack"><span>${f.nombre}${cambio}</span><span class="count">
          <button data-action="sobra-menos" data-creature="${f.creature}"${atributosDeApagado(f.deja <= 0 ? 'no deja ninguno' : null)} aria-label="Uno menos de ${f.nombre}">−</button>
          deja ${f.deja} de ${f.vuelven}
          <button data-action="sobra-mas" data-creature="${f.creature}"${atributosDeApagado(f.deja >= f.vuelven ? 'ya los deja todos' : null)} aria-label="Uno más de ${f.nombre}">+</button>
        </span></div>`;
    }),
  );
  return html`<h3 id="titulo-de-lo-que-sobra">No cabe todo lo que vuelve</h3>
    <p class="cost">Lo levantado en la batalla vuelve con ${v.quien}, y ya no cabe: caben ${v.cupo} individuos y ${v.tope} de liderazgo. Elige qué se deja, justo lo que sobra. Lo que llevaban puesto va a la mochila del héroe; el de una guarnición se pierde.</p>
    <div class="stack-list">${filas}</div>
    ${motivoDelRechazo(v.motivo)}
    <div class="botones">
      <button data-action="sobra-de-la-ia">Como propone la IA</button>
      <button data-action="sobra-seguir"${atributosDeApagado(v.motivo, 'primary')}>Seguir</button>
    </div>`;
}
