/**
 * Lo que vuela por encima del tablero de batalla (`pintarEfecto`): el proyectil, el
 * hechizo, la cifra del daño y el «parado» de lo que la armadura paró entero, cada uno a
 * la altura de quien tira y de su blanco. Era parte de `render/batalla.ts` hasta la fase
 * C de la reorganización (07-11-2026).
 */
import { temaDelLienzo } from '../../comun/temas.js';
import { enPantalla, type Tablero } from '../proyeccion.js';
import { tableroA } from './muralla.js';
import type { Efecto } from './tablero.js';

export function pintarEfecto(ctx: CanvasRenderingContext2D, t: Tablero, e: Efecto): void {
  const alto = t.paso * 0.9;
  ctx.save();
  switch (e.tipo) {
    case 'proyectil': {
      const a = enPantalla(tableroA(t, e.altoDesde), e.desde);
      const b = enPantalla(tableroA(t, e.altoHasta), e.hasta);
      const x = a.x + (b.x - a.x) * e.t;
      // Un arco: sube y baja sobre la línea recta entre los dos.
      const y = a.y - alto * 0.7 + (b.y - a.y) * e.t - Math.sin(e.t * Math.PI) * t.paso * 0.6;
      const dx = (b.x - a.x) * 0.04;
      const dy = (b.y - a.y) * 0.04;
      ctx.strokeStyle = '#fff1be';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x, y);
      ctx.stroke();
      break;
    }
    case 'hechizo': {
      const p = enPantalla(tableroA(t, e.alto), e.en);
      ctx.strokeStyle = '#b5d9ff';
      ctx.shadowColor = '#b5d9ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - e.t * 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - alto * 0.5, 14 + e.t * 30, 8 + e.t * 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'danio': {
      const p = enPantalla(tableroA(t, e.alto), e.en);
      ctx.globalAlpha = Math.min(1, (1 - e.t) * 3);
      ctx.fillStyle = '#ffe1c2';
      ctx.strokeStyle = '#2a0e06';
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(14, Math.round(t.paso * 0.28))}px ${temaDelLienzo().letraTitulo}`;
      ctx.textAlign = 'center';
      const y = p.y - alto - e.t * t.paso * 0.45;
      ctx.strokeText(`−${e.cifra}`, p.x, y);
      ctx.fillText(`−${e.cifra}`, p.x, y);
      break;
    }
    case 'parado': {
      // Lo que la armadura paró entero (#262): el mismo vuelo que la cifra, en el
      // tono frío del metal, para que no se lea como un «−0».
      const p = enPantalla(tableroA(t, e.alto), e.en);
      ctx.globalAlpha = Math.min(1, (1 - e.t) * 3);
      ctx.fillStyle = '#d6e2ee';
      ctx.strokeStyle = '#10202e';
      ctx.lineWidth = 3;
      // Con la letra de la interfaz y no la de título: de esa, el lienzo solo
      // pide las cifras (`cargarLetraDeTitulo`), y estas letras saldrían con el
      // respaldo hasta que otra cosa la bajara.
      ctx.font = `bold ${Math.max(13, Math.round(t.paso * 0.24))}px ${temaDelLienzo().letraUi}`;
      ctx.textAlign = 'center';
      const y = p.y - alto - e.t * t.paso * 0.45;
      ctx.strokeText('parado', p.x, y);
      ctx.fillText('parado', p.x, y);
      break;
    }
  }
  ctx.restore();
}
