/**
 * El parte de guerra (`renderBattleLog`): lo que pasó en una batalla, contado para quien
 * lo lee, en la partida, la arena y el espectador. Era parte de `views/panels.ts` hasta
 * la fase C de la reorganización (07-11-2026).
 */
import { cargaMontada, dichoDeLaCarga } from '@core/battle/carga.js';
import { stackById } from '@core/battle/consultas.js';
import { cifraDeEfecto } from '@core/battle/effects.js';
import { formaDeLaBatalla, nombreEnLaRueda } from '@core/battle/formas-de-la-rueda.js';
import { contraataqueDelCruce, NOMBRE_DEL_PUNTO } from '@core/battle/rueda.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import { nombreDeHechizo } from '@core/magia/catalogo.js';
import { type Html, html, NADA, unir } from '../comun/html.js';
import { nombreEnElCampo } from '../render/batalla/distintivo.js';
import { clase, duracionDeEfecto, nombreFuente } from '../views/notas.js';

/**
 * El parte de guerra. `mio` es el bando de quien lo lee: sin él, «gana el
 * defensor» se pintaría en rojo de derrota aunque el defensor fueras tú.
 *
 * Toma la BATALLA y no su log, y es por una línea: un `perished` dice qué stack
 * cayó y no de quién era, así que sin los stacks delante no se puede pintar. Se
 * pintaba **siempre** en rojo de derrota, y la mitad de las veces la unidad
 * aniquilada era la del rival — la misma misatribución que `renderLog` acaba de
 * quitarse un piso más arriba, en el mismo fichero.
 *
 * Se exporta porque lo pinta también el espectador, que es quien de verdad
 * ejercita el `mio === null`: mira desde fuera y no lleva ninguno de los dos
 * bandos, así que no se le pinta ni victoria ni derrota. Esa rama existía desde
 * que existe la función y hasta hoy no la llamaba nadie.
 *
 * Y el `switch` ya no tiene `default`, por lo mismo que el de `renderLog`: se
 * tragaba en silencio los tres eventos que nadie escribió (`move`, `wait`,
 * `defend`) y se tragaría igual el que se añada mañana. Quien decide es el
 * `never` del final.
 *
 * La espera y la defensa tienen su línea desde #82: se callaban cuando la IA no
 * las jugaba nunca, y desde #52 espera en 49 de cada 100 batallas espejo (84
 * esperas en 100 semillas, 08-10-2026). Sin la línea, quien mira ve a una
 * unidad quedarse quieta sin saber que ha cedido la iniciativa a propósito.
 * Nombran a QUIÉN porque, a diferencia de un ataque, no dejan nada en el
 * tablero que lo diga.
 */
export function renderBattleLog(battle: BattleState, mio: Side | null): Html {
  /**
   * El stack del que habla un hecho. Lanza si no aparece: un id del registro
   * que no está en el campo es un fallo nuestro, y disimularlo con «una unidad»
   * sería volver a la misatribución por otro camino.
   */
  const stackDe = (id: string): BattleStack => {
    const s = battle.stacks.find((x) => x.id === id);
    if (s === undefined)
      throw new Error(`el parte habla de una unidad que no está en el campo: ${id}`);
    return s;
  };

  /**
   * «Arquero, de tu bando»: la unidad y su bando dicho desde quien lee. Sin
   * bando, el atacante o el defensor, como `surrender`.
   */
  const quienEs = (id: string): string => {
    const s = stackDe(id);
    const lado =
      mio === null
        ? `del ${s.side === 'attacker' ? 'atacante' : 'defensor'}`
        : s.side === mio
          ? 'de tu bando'
          : 'del enemigo';
    return `${nombreEnElCampo(battle, s)}, ${lado}`;
  };

  /**
   * El color de un hecho que es bueno o malo para la unidad que lo vive, dicho
   * desde quien lee: lo bueno para el enemigo es mala noticia para ti. Se
   * pintaba por el signo, y la «Moral alta: turno extra» del enemigo (la moral
   * ya no da turnos, 26-10-2026) salía en verde (#198).
   *
   * Sin bando —espectador y arena— no se pinta: verde y rojo dicen «bien para
   * ti» y «mal para ti» en todo el parte (el final, la rendición, la unidad
   * aniquilada), y quien mira desde fuera no tiene un «ti». Pintarlo por bando
   * pedía un tercer código de color que se leería como victoria o derrota de
   * uno de los dos; el bando ya va escrito en la línea («del atacante»).
   */
  /**
   * Quién da o recibe un golpe: «Piquero B». El bando va solo cuando el nombre
   * está en los dos lados —la batalla espejo, con Piquero A en cada uno—, porque
   * ahí «Piquero A → Piquero A» no dice nada; en lo demás, el tablero y la
   * columna «En el campo» ya dicen de quién es cada cual y una línea de ataque
   * con dos «, del enemigo» dentro no cabía en la caja.
   */
  const quien = (id: string): string => {
    const s = stackDe(id);
    const nombre = nombreEnElCampo(battle, s);
    const enLosDos = battle.stacks.some((x) => x.side !== s.side && x.unit.name === s.unit.name);
    if (!enLosDos) return nombre;
    const lado =
      mio === null
        ? s.side === 'attacker'
          ? 'atacante'
          : 'defensor'
        : s.side === mio
          ? 'tuyo'
          : 'enemigo';
    return `${nombre} (${lado})`;
  };

  /**
   * «Piquero B → Esqueleto A»: quién a quién (#18). El espacio de antes de la
   * flecha es duro para que la flecha no abra nunca una línea en la caja
   * estrecha del parte, lejos de quien la lanza.
   */
  const golpe = (de: string, a: string): string => `${quien(de)}\u00a0→ ${quien(a)}`;

  /** «1 baja», «3 bajas»: «1 bajas» salía en cada golpe que mataba a uno. */
  const bajas = (n: number): string => `${n} ${n === 1 ? 'baja' : 'bajas'}`;

  /**
   * El daño de un hecho con lo que paró la armadura (#262): «12 de
   * daño (−7 armadura), 1 baja», o «0 de daño: la armadura para los 18» si no
   * llegó nada. Sin armadura, lo de siempre. Con «lo para la armadura (18)» el 18
   * se leía como la armadura, y es el golpe parado (A2 de QA de #262); la
   * armadura no se escribe: un retoque a media pelea la cambiaría en las líneas
   * de antes.
   */
  const danio = (d: number, muertos: number, parado: number | undefined): string => {
    if (parado === undefined) return `${d} de daño, ${bajas(muertos)}`;
    if (d === 0) return `0 de daño: la armadura para los ${parado}`;
    return `${d} de daño (−${parado} armadura), ${bajas(muertos)}`;
  };

  const paraQuienLee = (id: string, buenoParaSuBando: boolean): Html => {
    if (mio === null) return NADA;
    const bueno = (stackDe(id).side === mio) === buenoParaSuBando;
    return clase(bueno, !bueno);
  };

  const ultimos = battle.log.slice(-40);
  const desde = battle.log.length - ultimos.length;
  const forma = formaDeLaBatalla(battle);
  const lineas = ultimos
    .map((e, i): Html => {
      switch (e.kind) {
        case 'round_start':
          return html`<div>— Ronda ${e.round} —</div>`;
        // Quién a quién (#18): «Ataque: 12 de daño, 3 bajas» no decía ni lo uno
        // ni lo otro, y en una ronda con siete unidades por bando no había forma
        // de casar la línea con el tablero. El modo va entre paréntesis detrás,
        // porque lo que se busca al leer es el nombre.
        case 'attack': {
          const modo = `${e.retaliation ? ' (contraataque)' : ''}${
            e.charge === undefined
              ? ''
              : ` (${dichoDeLaCarga(e.charge, cargaMontada(stackById(battle, e.stack).unit))})`
          }`;
          return html`<div>${golpe(e.stack, e.target)}${modo}: ${danio(e.damage, e.killed, e.parado)}</div>`;
        }
        // El disparo diferido (25-10-2026): a qué casilla y a quién dio, o a nadie.
        case 'aimed':
          return html`<div>${quienEs(e.stack)} apunta a (${e.at.col},${e.at.row}): dispara al empezar su siguiente turno</div>`;
        case 'shoot':
          if (e.target === null) {
            return html`<div>${quienEs(e.stack)} dispara a (${e.at.col},${e.at.row}) y no da a nadie</div>`;
          }
          return html`<div>${golpe(e.stack, e.target)} (${e.splash === true ? 'salpicadura' : `disparo a (${e.at.col},${e.at.row})`}): ${danio(e.damage, e.killed, e.parado)}</div>`;
        case 'thrown':
          return html`<div>${quienEs(e.stack)} lanza una granada a (${e.at.col},${e.at.row}): explota al empezar su siguiente turno</div>`;
        case 'blast':
          if (e.target === null) {
            return html`<div>Explota la granada de ${quienEs(e.stack)} en (${e.at.col},${e.at.row}) y no da a nadie</div>`;
          }
          // Con la flecha, «Granadero → Granadero» (H3 del QA de las granadas, 02-11-2026).
          if (e.target === e.stack) {
            return html`<div>${quien(e.stack)} se alcanza con su propia granada en (${e.at.col},${e.at.row}): ${danio(e.damage, e.killed, e.parado)}</div>`;
          }
          return html`<div>${golpe(e.stack, e.target)} (granada en (${e.at.col},${e.at.row})): ${danio(e.damage, e.killed, e.parado)}</div>`;
        case 'cast': {
          // El nombre, no el id: `spell()` ya lo tiene y quien lee el parte no
          // sabe qué es un "magic_arrow". Quien lanza es siempre el héroe de su
          // bando, así que basta con el bando.
          const lanza =
            mio === null
              ? `El ${e.side === 'attacker' ? 'atacante' : 'defensor'} lanza`
              : e.side === mio
                ? 'Lanzas'
                : 'El enemigo lanza';
          const sobre =
            e.target !== undefined
              ? ` sobre ${quien(e.target)}`
              : e.at !== undefined
                ? ` sobre (${e.at.col},${e.at.row})`
                : '';
          const efecto =
            e.damage || e.parado !== undefined
              ? `: ${danio(e.damage ?? 0, e.killed ?? 0, e.parado)}`
              : '';
          const cae = e.diferido === true ? ' (caerá al empezar su siguiente turno)' : '';
          return html`<div>${lanza} ${nombreDeHechizo(e.spell, battle.libro)}${sobre}${efecto}${cae}</div>`;
        }
        case 'power': {
          // Lo que deje un poder va detrás en su propia línea (`effect`); aquí,
          // quién a quién y, si cura, cuánto.
          const cura = e.cura === undefined ? '' : `: cura ${e.cura} PV`;
          const sobre =
            e.target !== undefined
              ? ` sobre ${quien(e.target)}`
              : e.at !== undefined
                ? ` sobre (${e.at.col},${e.at.row})`
                : '';
          return html`<div${paraQuienLee(e.target ?? e.stack, true)}>${quienEs(e.stack)}, usa ${nombreDeHechizo(e.poder, battle.libro)}${sobre}${cura}</div>`;
        }
        // Lo que hizo un hechizo a uno de los que alcanzó.
        case 'spell_hit': {
          const hace: string[] = [];
          if (e.damage > 0 || e.parado !== undefined)
            hace.push(danio(e.damage, e.killed, e.parado));
          if (e.cura !== undefined) hace.push(`cura ${e.cura} PV`);
          return html`<div${paraQuienLee(e.stack, e.cura !== undefined)}>${nombreDeHechizo(e.spell, battle.libro)} alcanza a ${quienEs(e.stack)}${hace.length === 0 ? '' : `: ${hace.join(', ')}`}</div>`;
        }
        case 'triggered':
          return html`<div>Salta ${nombreDeHechizo(e.spell, battle.libro)} de ${quienEs(e.stack)}</div>`;
        // Un cadáver levantado (08-11-2026, «Levantar zombi»): lo de quien lo
        // levanta, bueno para su bando, como lo que cura.
        case 'raised':
          return html`<div${paraQuienLee(e.stack, true)}>${nombreDeHechizo(e.spell, battle.libro)}: se levanta ${quienEs(e.stack)} del cadáver de ${quienEs(e.from)} en (${e.at.col},${e.at.row})</div>`;
        // La arena cambió unas cifras a media pelea (el editor): no es una
        // jugada, pero desde aquí la pelea se juega con las nuevas. Entre
        // paréntesis y con «;», porque un cambio de lista ya lleva sus dos
        // puntos y sus comas («habilidades: + Salto, − Curar (12 PV)»).
        case 'retoque':
          return html`<div>Cambian las cifras de ${e.nombre} a media pelea${e.cambios.length === 0 ? '' : ` (${e.cambios.join('; ')})`}</div>`;
        // Los efectos dicen de quién: con el color puesto desde quien lee, una
        // línea verde sin nombre no deja saber si es bueno para los tuyos o para
        // el rival.
        case 'effect':
          return html`<div${paraQuienLee(e.stack, e.amount >= 0 && e.effect !== 'impide')}>${nombreFuente(e.source, forma, battle.libro)} sobre ${quienEs(e.stack)}: ${e.dicho ?? cifraDeEfecto(e.effect, e.amount)} ${
            e.turnoDe === undefined || e.vence === undefined
              ? duracionDeEfecto(e)
              : `hasta que ${e.vence === 'empezar' ? 'empiece' : 'termine'} el próximo turno de ${quienEs(e.turnoDe)}`
          }</div>`;
        // La rueda del golpe: qué eligió cada uno y dónde cayó,
        // antes de las líneas del golpe. El contraataque, solo si lo hubo.
        case 'cruce': {
          const devuelto = contraataqueDelCruce(battle.log, desde + i);
          const contra = devuelto === null ? '' : `; contraataque ${NOMBRE_DEL_PUNTO[devuelto]}`;
          return html`<div class="cruce">${golpe(e.stack, e.target)}, ${nombreEnLaRueda(e.golpe, forma)} contra ${nombreEnLaRueda(e.respuesta, forma)}: ${NOMBRE_DEL_PUNTO[e.punto]}${contra}</div>`;
        }
        case 'effect_end':
          return html`<div>Se disipa ${nombreFuente(e.source, forma, battle.libro)} de ${quienEs(e.stack)}</div>`;
        case 'perished': {
          // Quién cae decide el color, igual que en `hero_defeated` un piso más
          // arriba: lo tuyo es la derrota y lo suyo la victoria. Sin bando —el
          // parte de quien no lleva ninguno de los dos— no se pinta ninguna de
          // las dos cosas, en vez de inventarse una.
          const suya = stackDe(e.stack).side === mio;
          return html`<div${clase(mio !== null && !suya, suya)}>Aniquilada la unidad ${quienEs(e.stack)}</div>`;
        }
        case 'surrender': {
          // Quien se rinde pierde: en rojo si eres tú, en verde si es el rival,
          // y sin color si no llevas bando. El precio está una vez, en `finished`.
          const precio = battle.finished?.surrender?.gold;
          if (precio === undefined) {
            throw new Error('el parte cuenta una rendición y la batalla no dice qué costó');
          }
          const tuya = e.side === mio;
          return html`<div${clase(mio !== null && !tuya, tuya)}>${
            mio === null
              ? `Se rinde el ${e.side === 'attacker' ? 'atacante' : 'defensor'}`
              : tuya
                ? 'Te rindes'
                : 'El enemigo se rinde'
          } por ${precio} de oro</div>`;
        }
        case 'finished':
          return html`<div${clase(e.winner === mio, mio !== null && e.winner !== mio)}>Fin: gana el ${e.winner === 'attacker' ? 'atacante' : 'defensor'}</div>`;

        case 'ladder_placed':
          return html`<div>${quienEs(e.stack)} apoya su escalera en el muro de (${e.muro.col},${e.muro.row}): se queda puesta</div>`;
        case 'climbed':
          return html`<div>Sube a la muralla ${quienEs(e.stack)}, en (${e.to.col},${e.to.row}): este turno no hace nada más</div>`;
        case 'gate_opened':
          return html`<div>${quienEs(e.stack)} abre la puerta de entre (${e.puerta.a.col},${e.puerta.a.row}) y (${e.puerta.b.col},${e.puerta.b.row}): ahora pasa cualquiera</div>`;
        case 'gate_closed':
          return html`<div>${quienEs(e.stack)} cierra la puerta de entre (${e.puerta.a.col},${e.puerta.a.row}) y (${e.puerta.b.col},${e.puerta.b.row}): no pasa nadie</div>`;

        // El único que el parte NO cuenta, escrito aparte en vez de caer por un
        // `default`: el tablero ya enseña dónde está cada unidad, y el paso a
        // paso (la mitad de los hechos de una batalla) ahogaría el resto.
        case 'move':
          return NADA;
      }
      // Exhaustivo: con un `kind` nuevo, `e` deja de ser `never` aquí y esta
      // línea no compila hasta que alguien decida si se pinta o no.
      const sinFrase: never = e;
      throw new Error(`hecho del parte de guerra sin frase: ${JSON.stringify(sinFrase)}`);
    })
    // Las líneas vacías se van igual que antes. Se comparan con `NADA` por
    // identidad y no por su contenido: `NADA` es el único hueco vacío que
    // escriben las ramas de arriba, así que es exacto y no hay que abrir el
    // fragmento para mirarlo.
    .filter((linea) => linea !== NADA);
  return html`<div class="log" data-al-final="parte">${unir(lineas)}</div>`;
}
