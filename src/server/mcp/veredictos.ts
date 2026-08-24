/**
 * Los veredictos que el puente le debe al agente.
 *
 * El puente los recibe cuando llegan y se los entrega en el siguiente
 * `heroes_listen`, que es cuando el agente puede hacer algo con ellos. Era una
 * ranura de uno que además **tiraba el veredicto cuando había ido bien** y no
 * leía `note` en ninguna de las dos ramas: informar de un turno perfecto no
 * llegaba a ningún sitio, y dos `result` seguidos entre dos escuchas dejaban
 * solo el último.
 *
 * Vive fuera de `server.ts` porque allí no se puede probar: ese módulo abre el
 * transporte de stdio en cuanto se importa.
 */
import { lineaDeVeredicto } from '../notas.js';
import type { AgentResultMsg } from '../protocol.js';

/**
 * Tope de veredictos sin recoger. Es una red, no una cola de verdad.
 *
 * **El protocolo no deja llegar ni a tres.** El servidor solo manda `result` en
 * respuesta a un `response`, y `heroes_respond` exige un `enCurso` que solo pone
 * `heroes_listen`: una respuesta por escucha, así que entre dos lecturas caben
 * como mucho **dos** —el acuse de la última acción de batalla y el informe del
 * turno que se cierra justo después—. Llegó a llevar contabilidad de descartes
 * con su coletilla y su getter, y era maquinaria para un estado inalcanzable:
 * nunca podó, `descartados` nunca pasó de 0 y esa frase no se imprimió jamás.
 *
 * Se queda el tope, que cuesta una línea, por si algún día el servidor informa
 * de algo que el agente no ha pedido. Se descarta el más viejo: lo último que
 * pasó es lo que todavía se puede corregir.
 */
const MAX_VEREDICTOS = 40;

export class ColaDeVeredictos {
  private readonly lineas: string[] = [];

  /** Anota un veredicto. Se guardan LOS DOS signos: coló y no coló. */
  anota(msg: AgentResultMsg): void {
    if (this.lineas.length >= MAX_VEREDICTOS) this.lineas.shift();
    // El formato de la línea lo escribe `notas.ts`, que es donde vive el parser
    // que la vuelve a leer. Aquí se compone solo el veredicto: esta clase es un
    // anillo, no un codec. Escrito a mano en los dos sitios, un cambio en uno
    // dejaba al otro leyendo lo que ya no se escribe.
    this.lineas.push(
      lineaDeVeredicto({
        requestId: msg.requestId,
        ok: msg.ok,
        nota: msg.note ?? (msg.ok ? 'aplicada.' : 'no se pudo aplicar.'),
        problemas: msg.problems ?? [],
      }),
    );
  }

  /** Se lo lleva todo y se vacía. Cadena vacía si no había nada que contar. */
  recoge(): string {
    if (this.lineas.length === 0) return '';
    const texto = this.lineas.join('\n');
    this.lineas.length = 0;
    return texto;
  }
}
