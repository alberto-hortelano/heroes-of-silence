/**
 * Del espejo al píxel: la cámara del mapa de aventura, que se arrastra hasta una casilla
 * y la pulsa (`Mapa`, con el aviso de un ataque y la guarnición que se abren al llegar), el
 * centro de una unidad en el tablero de batalla (`pixelDeUnidad`, `alcanzar`,
 * `escenaDelEspejo`) y los píxeles del lienzo. Vivía en `tools/qa/capturas.ts` (H5 de la reorganización, 08-11-2026).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright';
import { EscenaBatalla } from '../../../src/client/batalla/escena.js';
import { EscenaAventura } from '../../../src/client/partida/mapa/escena.js';
import { cajaDeFigura } from '../../../src/client/render/batalla/figura.js';
import { casillaAPixel, centrarEn, type Encuadre } from '../../../src/client/render/mapa/camara.js';
import { centroDeStack, centroHex, tableroPara } from '../../../src/client/render/proyeccion.js';
import type { ControlDeBatalla } from '../../../src/client/sesion/batalla/control.js';
import type { Session } from '../../../src/client/sesion/partida.js';
import { stackHexes } from '../../../src/core/battle/consultas.js';
import type { BattleAction, BattleStack } from '../../../src/core/battle/types.js';
import type { Point } from '../../../src/core/types.js';
import { type Caja, encuadreDe } from './escenas.js';
import { caja, captura, desplegarTalCual, esperarLaMarcha } from './pagina.js';

// ------------------------------------------------------------ el mapa en píxeles

/**
 * Lo que se deja libre en los bordes del lienzo al arrastrar el mapa: el
 * arrastre empieza y acaba lejos de ellos, y abajo lejos de los botones de la
 * cámara, que se llevarían el `pointerdown`.
 */
const HOLGURA_DEL_ARRASTRE = { lados: 40, arriba: 40, abajo: 120 } as const;
/**
 * Por debajo de esto no se arrastra: el cliente lee un gesto de 8 px o menos
 * (`UMBRAL_ARRASTRE`) como un CLIC, y un clic en el mapa mueve al héroe.
 */
const ARRASTRE_MINIMO = 20;

/**
 * El mapa de aventura de la página en píxeles. La cámara la lleva la MISMA
 * escena del cliente (`EscenaAventura`) sobre el espejo, con los gestos que se
 * le hacen a la página —rueda, arrastre, «Centrar héroe»—: sigue al héroe
 * cuando se mueve, se queda donde la dejó un arrastre, acota en los bordes.
 * Antes la cuenta suponía la cámara siempre en el héroe, y por eso las guardias
 * lejanas se buscaban alejando la vista a ojo (#131).
 */
export class Mapa {
  private readonly escena: EscenaAventura;
  constructor(
    readonly page: Page,
    private readonly espejo: Session,
  ) {
    this.escena = new EscenaAventura(() => espejo);
  }

  /** Píxeles por casilla de la cámara de ahora. */
  get tile(): number {
    return this.escena.camaraActual.tile;
  }

  /**
   * La caja del lienzo y el encuadre, con la cámara de la escena puesta al día:
   * la recentra en el héroe si se ha movido, como hace la página en cada fotograma.
   */
  async encuadre(): Promise<{ b: Caja; e: Encuadre }> {
    const b = await caja(this.page);
    // `encuadreDe` compone el escenario de la partida, y con él hecho la escena
    // tiene el tope de alejar que tiene la página; sin él tomaría el de
    // legibilidad mientras «se compone».
    const e = encuadreDe(b, this.espejo);
    this.escena.encuadrar(b.width, b.height);
    return { b, e };
  }

  /** Dónde cae en la página el centro de una casilla, con la cámara de ahora. */
  async pixel(p: Point): Promise<{ x: number; y: number }> {
    const { b } = await this.encuadre();
    const c = casillaAPixel(this.escena.camaraActual, p);
    return { x: b.x + c.x, y: b.y + c.y };
  }

  /**
   * Un paso de rueda sobre el centro del lienzo, en la página y en la escena:
   * el zoom lo calcula la MISMA función que el cliente, topes incluidos.
   */
  async rueda(direccion: 1 | -1): Promise<void> {
    const { b, e } = await this.encuadre();
    await this.page.mouse.move(b.x + e.ancho / 2, b.y + e.alto / 2);
    await this.page.mouse.wheel(0, direccion === 1 ? -200 : 200);
    this.escena.zoom(direccion);
    await sleep(100);
  }

  /**
   * Arrastra el mapa `dx, dy` píxeles enteros, de un punto del lienzo a otro.
   * El movimiento va de un solo paso: el primer `pointermove` ya pasa el umbral
   * y la escena no llega a señalar la casilla de debajo.
   */
  async arrastrar(dx: number, dy: number): Promise<void> {
    if (Math.abs(dx) + Math.abs(dy) < ARRASTRE_MINIMO) {
      throw new Error(`un arrastre de (${dx},${dy}) px lo leería el cliente como un clic`);
    }
    const { b } = await this.encuadre();
    const h = HOLGURA_DEL_ARRASTRE;
    const izquierda = Math.ceil(b.x + h.lados);
    const derecha = Math.floor(b.x + b.width - h.lados);
    const arriba = Math.ceil(b.y + h.arriba);
    const abajo = Math.floor(b.y + b.height - h.abajo);
    if (Math.abs(dx) > derecha - izquierda || Math.abs(dy) > abajo - arriba) {
      throw new Error(
        `un arrastre de (${dx},${dy}) px no cabe en el lienzo de ${b.width}×${b.height}`,
      );
    }
    const x0 = dx > 0 ? izquierda : derecha;
    const y0 = dy > 0 ? arriba : abajo;
    await this.page.mouse.move(x0, y0);
    await this.page.mouse.down();
    await this.page.mouse.move(x0 + dx, y0 + dy);
    await this.page.mouse.up();
    this.escena.bajar(x0 - b.x, y0 - b.y);
    this.escena.mover(x0 + dx - b.x, y0 + dy - b.y);
    if (this.escena.soltar())
      throw new Error(`la escena leyó como clic el arrastre de (${dx},${dy}) px`);
    await sleep(100);
  }

  /**
   * Lleva la cámara a `p` arrastrando el mapa, como lo haría la persona: en
   * tramos que quepan en el lienzo, hasta que `p` quede en el centro o la
   * cámara no pueda ir más allá del borde del mapa.
   */
  async mirar(p: Point): Promise<void> {
    const h = HOLGURA_DEL_ARRASTRE;
    for (let tramo = 0; tramo < 8; tramo++) {
      const { b, e } = await this.encuadre();
      const camara = this.escena.camaraActual;
      const destino = centrarEn(camara, p, e);
      const dx = Math.round((camara.x - destino.x) * camara.tile);
      const dy = Math.round((camara.y - destino.y) * camara.tile);
      if (Math.abs(dx) + Math.abs(dy) < ARRASTRE_MINIMO) return;
      const anchoUtil = Math.floor(b.width - 2 * h.lados) - 1;
      const altoUtil = Math.floor(b.height - h.arriba - h.abajo) - 1;
      const paso = (v: number, tope: number) => Math.max(-tope, Math.min(tope, v));
      await this.arrastrar(paso(dx, anchoUtil), paso(dy, altoUtil));
    }
    throw new Error(`la cámara no llega a (${p.x},${p.y}) en ocho arrastres`);
  }

  /** «Centrar héroe», en la página y en la escena. */
  async centrarHeroe(): Promise<void> {
    await this.page.getByRole('button', { name: 'Centrar héroe' }).click();
    this.escena.centrar();
    await sleep(200);
  }

  async pulsar(p: Point): Promise<void> {
    const px = await this.pixel(p);
    await this.page.mouse.click(px.x, px.y);
    this.espejo.clickTile(p);
    // La escena del espejo se pone al día con el héroe ya donde lo dejó el clic, como
    // la página en el fotograma en que acaba su marcha (06-11-2026, `9c80bc5f`) o en
    // que avisa del ataque: se recentra en él y lo da por seguido. El espejo solo mira
    // cuando se le pregunta, y sin esto no veía la ida: una batalla que acaba en
    // rendición devuelve al héroe a su base, la página se recentraba allí (la seguía
    // desde la llegada) y el espejo, que lo seguía en la base desde antes, se quedaba
    // donde lo dejó el arrastre, dos casillas más allá; desde ahí cada píxel del mapa
    // caía fuera de sitio (desktop-15 miraba la patrulla donde no estaba).
    await this.encuadre();
    await esperarLaMarcha(this.page);
    await sleep(250);
    await cerrarLaGuarnicion(this.page, this.espejo, `(${p.x},${p.y})`);
    // Una emboscada avisa antes de su batalla: «Defender».
    await aceptarElAviso(this.page, this.espejo, `(${p.x},${p.y})`);
    // Si el clic abre una batalla, abre en el despliegue de la persona: se acepta
    // tal cual, y la primera vez se captura (el atacante ve al defensor ya colocado;
    // el emboscado, nada del rival).
    await desplegarTalCual(
      this.page,
      this.espejo,
      `el clic en (${p.x},${p.y})`,
      `despliegue-01-${this.espejo.miBando === 'defender' ? 'emboscado' : 'atacante'}`,
    );
  }
}

/**
 * El aviso de un ataque a la persona (arreglo 3 del 06-11-2026): antes de la
 * batalla de una defensa o de una emboscada, sobre el mapa centrado en el ataque.
 * Se pulsa «Defender», en la página y en el espejo. La primera vez, su foto.
 */
let avisoFotografiado = false;
export async function aceptarElAviso(page: Page, espejo: Session, donde: string): Promise<void> {
  if (espejo.avisoDelAtaque === null) return;
  await page
    .locator('#aviso[open]')
    .waitFor({ timeout: 20_000 })
    .catch(() => {
      throw new Error(`${donde}: el espejo avisa del ataque y la página no`);
    });
  if (!avisoFotografiado) {
    avisoFotografiado = true;
    await sleep(300);
    await captura(page, 'aviso-del-ataque');
  }
  await page.locator('#aviso [data-action="aviso-defender"]').click();
  espejo.defenderElAtaque();
}

/**
 * Parar en un paso o un pueblo propio abre su guarnición, modal (puesto
 * fronterizo, 04-11-2026): las pasadas que andan por el mapa la cierran con
 * Escape, como la persona, en la página y en el espejo, y siguen. La primera vez,
 * su foto.
 */
let guarnicionFotografiada = false;
export async function cerrarLaGuarnicion(
  page: Page,
  espejo: Session,
  donde: string,
): Promise<void> {
  if (espejo.guarnicionAbierta === null) return;
  await page
    .locator('#guarnicion[open]')
    .waitFor({ timeout: 10_000 })
    .catch(() => {
      throw new Error(`${donde}: el espejo abre la guarnición y la página no`);
    });
  if (!guarnicionFotografiada) {
    guarnicionFotografiada = true;
    await captura(page, 'guarnicion-al-parar');
  }
  await page.keyboard.press('Escape');
  espejo.cerrarLaGuarnicion();
  await sleep(150);
  if (await page.locator('#guarnicion[open]').count()) {
    throw new Error(`${donde}: Escape no cierra la guarnición`);
  }
}
// --------------------------------------------------------- la batalla en píxeles

/**
 * Lleva el marco del lienzo hasta `xEnLienzo` si el tablero es más ancho que la
 * pantalla (el móvil), y devuelve la caja del lienzo después de desplazarlo.
 */
export async function alcanzar(
  page: Page,
  xEnLienzo: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await page.evaluate((x) => {
    const l = document.getElementById('lienzo');
    if (l !== null && l.scrollWidth > l.clientWidth) {
      const visible = x - l.scrollLeft;
      if (visible < 30 || visible > l.clientWidth - 30) l.scrollLeft = x - l.clientWidth / 2;
    }
  }, xEnLienzo);
  return await caja(page);
}

/**
 * Una escena de batalla sobre el espejo, ya en hora y encuadrada en el lienzo de
 * la página: la MISMA clase que lee los clics allí. Es la única forma que tiene
 * este guion de convertir un píxel en una acción, así que lo que aplica el
 * espejo es por construcción lo que manda la página.
 */
export function escenaDelEspejo(
  espejo: ControlDeBatalla,
  ancho: number,
  alto: number,
): EscenaBatalla {
  const escena = new EscenaBatalla(() => espejo);
  escena.sincronizar(Number.MAX_SAFE_INTEGER);
  escena.encuadrar(ancho, alto);
  return escena;
}

/**
 * Dónde pulsar una unidad: un punto de su cuerpo que el cliente lea como ESA
 * unidad. Lo decide una escena de batalla sobre el espejo —la misma clase que en
 * la página—, porque el centro de un hex al que se puede ir gana a la figura que
 * lo tapa, y el medio del cuerpo puede caer justo ahí.
 */
export async function pixelDeUnidad(
  page: Page,
  espejo: ControlDeBatalla,
  s: BattleStack,
): Promise<{ x: number; y: number; accion: BattleAction | undefined }> {
  const b0 = await caja(page);
  const t0 = tableroPara(b0.width, b0.height);
  const b = await alcanzar(page, centroHex(t0, s.hex).x);
  const t = tableroPara(b.width, b.height);
  const c = cajaDeFigura(t, centroDeStack(stackHexes(s)));
  const escena = escenaDelEspejo(espejo, b.width, b.height);
  for (const alto of [0.5, 0.35, 0.65, 0.8, 0.2]) {
    // En un píxel entero de la página: el ratón llega entero al navegador, y
    // con la caja en media fila (el móvil, `y` 45,78) el espejo leía otro punto.
    // Junto a la bisectriz de dos casillas, ese medio píxel cambiaba desde dónde
    // se golpea: la página se plantaba en (4,3) y el espejo en (3,3).
    const px = Math.round(b.x + c.x);
    const py = Math.round(b.y + c.suelo - c.alto * alto);
    const [x, y] = [px - b.x, py - b.y];
    if (escena.objetivoEn(x, y)?.id === s.id) {
      // La acción que el cliente mandará al pulsar AHÍ: con el ángulo, el píxel
      // decide desde qué casilla se golpea, así que el espejo tiene que saberlo.
      return { x: px, y: py, accion: escena.accionContraEn(x, y) };
    }
  }
  throw new Error(`no hay un punto del cuerpo de ${s.id} que el clic lea como suyo`);
}

/** Los píxeles RGBA de un cuadrado de 9×9 del lienzo, alrededor de un punto en CSS px. */
export async function pixelesDelLienzo(page: Page, x: number, y: number): Promise<number[]> {
  return await page.evaluate(
    ([cx, cy]) => {
      const lienzo = document.getElementById('canvas') as HTMLCanvasElement;
      const c = lienzo.getContext('2d');
      if (c === null) throw new Error('el lienzo no tiene contexto 2D');
      const escala = lienzo.width / lienzo.getBoundingClientRect().width;
      const d = c.getImageData(Math.round(cx * escala) - 4, Math.round(cy * escala) - 4, 9, 9).data;
      return Array.from(d);
    },
    [x, y] as const,
  );
}
