/**
 * La escena del castillo: un solar levanta su siguiente eslabón y la franja de
 * abajo recluta. Las reglas viven en el núcleo; aquí solo se traduce el píxel.
 */
import { dwellings } from '@core/town/town.js';
import {
  describeHit,
  drawTown,
  hitAtPixel,
  nextOf,
  type PlanDeRecluta,
  plotById,
  type TownHit,
  type TownTransform,
  townLayout,
} from '../render/town.js';
import type { Session } from '../session.js';

export class EscenaCastillo {
  private transform: TownTransform = { scale: 1, x: 0, y: 0 };
  private hover: TownHit | null = null;

  constructor(private readonly sesion: () => Session) {}

  /**
   * Lo que «todo» pediría ahora en cada morada, según el núcleo. Solo cambia
   * cuando cambia la partida, así que se rehace con la versión de la sesión y no
   * en cada fotograma.
   */
  private planes(): ReadonlyMap<string, PlanDeRecluta> {
    const s = this.sesion();
    const c = this.cachePlanes;
    if (c !== null && c.sesion === s && c.version === s.version) return c.planes;
    const town = s.activeTown;
    const planes = new Map<string, PlanDeRecluta>();
    if (town !== null) {
      for (const { creature } of dwellings(town)) {
        const plan = s.recruitPlan(creature);
        if (plan !== null) planes.set(creature, plan);
      }
    }
    this.cachePlanes = { sesion: s, version: s.version, planes };
    return planes;
  }
  private cachePlanes: {
    sesion: Session;
    version: number;
    planes: ReadonlyMap<string, PlanDeRecluta>;
  } | null = null;

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number): void {
    const s = this.sesion();
    const town = s.activeTown;
    if (town === null) return;
    this.transform = townLayout(ancho, alto);
    drawTown(ctx, {
      town,
      purse: s.resources,
      planes: this.planes(),
      tiempo: ahora,
      transform: this.transform,
      hover: this.hover,
      interactive: s.isPlayersTurn,
    });
  }

  mover(px: number, py: number): boolean {
    const s = this.sesion();
    const town = s.activeTown;
    if (town === null) return false;
    this.hover = hitAtPixel(town, px, py, this.transform);
    const plan = this.hover?.kind === 'recruit' ? s.recruitPlan(this.hover.creature) : null;
    s.status = describeHit(town, s.resources, this.hover, plan);
    return this.hover !== null;
  }

  salir(): void {
    this.hover = null;
  }

  pulsar(px: number, py: number): void {
    const s = this.sesion();
    const town = s.activeTown;
    if (town === null) return;
    const hit = hitAtPixel(town, px, py, this.transform);
    if (hit === null) return;

    if (hit.kind === 'recruit') {
      if (hit.all) s.recruitAll(hit.creature);
      else s.recruit(hit.creature, 1);
      return;
    }

    const next = nextOf(town, plotById(town.faction, hit.plot));
    if (next === null) {
      s.status = 'En ese solar ya está todo construido.';
      return;
    }
    s.build(next);
  }
}
