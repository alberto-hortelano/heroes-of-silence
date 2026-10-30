"""Los paneles que se enseñan a los jueces de visión (Claude y ChatGPT).

Cada uno es una imagen PNG de un clip:
- `tira`: arriba el maniquí, abajo lo pintado, numerados y a la misma escala.
- `superposicion`: lo pintado con el muñeco esperado (fino; izquierda azul,
  derecha rojo, arma amarillo) y el estimado (grueso; izquierda cian, derecha
  naranja).
- `encuadre`: los fotogramas con guías (la vertical del ancla, el suelo y la
  cadera esperada) y, a la derecha, la piel de cebolla.
- `coherencia`: los fotogramas ampliados junto al giro de la unidad.
- `bucle`: el último y el primero lado a lado.
"""
import os
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import esqueleto

FONDO = (34, 34, 38, 255)
TEXTO = (235, 235, 235, 255)
LIDER = (90, 90, 96, 255)
EST = {"c": (255, 255, 255), "i": (0, 230, 230), "d": (255, 150, 0)}


@lru_cache(maxsize=None)
def fuente(tam=16):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, tam)
    return ImageFont.load_default()


def caja_comun(celdas, margen=12):
    """La caja que contiene la figura en todas las celdas (para recortar igual)."""
    x0 = y0 = 10**9
    x1 = y1 = -1
    for c in celdas:
        if c is None:
            continue
        a = np.asarray(c)[..., 3]
        ys, xs = np.nonzero(a >= 32)
        if len(xs):
            x0, y0, x1, y1 = min(x0, xs.min()), min(y0, ys.min()), max(x1, xs.max()), max(y1, ys.max())
    if x1 < 0:
        return (0, 0, 384, 384)
    return (max(0, x0 - margen), max(0, y0 - margen), min(384, x1 + margen), min(384, y1 + margen))


def sobre_fondo(im, color=FONDO):
    f = Image.new("RGBA", im.size, color)
    f.alpha_composite(im.convert("RGBA"))
    return f


def rotular(draw, xy, texto, tam=16):
    draw.text(xy, texto, fill=TEXTO, font=fuente(tam))


def pintar_estimado(draw, est, desplazar, ancho=4):
    for a, b, lado in esqueleto.SEGMENTOS:
        if a in est and b in est:
            draw.line([desplazar(est[a][:2]), desplazar(est[b][:2])], fill=EST[lado] + (255,), width=ancho)


def tira(clip, escala=2):
    pint = [f.pintada for f in clip.fotogramas]
    man = [f.maniqui for f in clip.fotogramas]
    caja = caja_comun(pint)
    w, h = (caja[2] - caja[0]) * escala, (caja[3] - caja[1]) * escala
    cm = caja_comun(man) if any(man) else None
    n = len(pint)
    alto_m = int(h * 0.8) if cm else 0
    out = Image.new("RGBA", (n * w, 30 + alto_m + h + 30), FONDO)
    d = ImageDraw.Draw(out)
    rotular(d, (6, 6), f"d{clip.direccion} «{clip.nombre}»: arriba el maniquí, abajo lo pintado")
    for i in range(n):
        if cm and man[i] is not None:
            m = man[i].crop(cm)
            m = m.resize((int(m.width * alto_m / m.height), alto_m), Image.LANCZOS)
            out.alpha_composite(sobre_fondo(m), (i * w + (w - m.width) // 2, 30))
        p = pint[i].crop(caja).resize((w, h), Image.LANCZOS)
        out.alpha_composite(sobre_fondo(p), (i * w, 30 + alto_m))
        rotular(d, (i * w + 6, 30 + alto_m + h + 4), f"{i + 1}")
        d.line([(i * w, 30), (i * w, out.height)], fill=LIDER, width=1)
    return out


def superposicion(clip, estimados=None, escala=2):
    pint = [f.pintada for f in clip.fotogramas]
    caja = caja_comun(pint, 24)
    w, h = (caja[2] - caja[0]) * escala, (caja[3] - caja[1]) * escala
    n = len(pint)
    out = Image.new("RGBA", (n * w, 30 + h + 26), FONDO)
    d = ImageDraw.Draw(out)
    rotular(d, (6, 6), f"d{clip.direccion} «{clip.nombre}»: fino = maniquí (izq. azul, der. rojo, arma amarillo); grueso = lo pintado (izq. cian, der. naranja)", 14)
    for i, f in enumerate(clip.fotogramas):
        p = sobre_fondo(f.pintada.crop(caja).resize((w, h), Image.LANCZOS))
        dp = ImageDraw.Draw(p)
        mover = lambda q: ((q[0] - caja[0]) * escala, (q[1] - caja[1]) * escala)
        if estimados is not None and estimados[i]:
            pintar_estimado(dp, estimados[i], mover, 5)
        if f.esperado is not None:
            esqueleto.pintar(dp, f.esperado, mover, 2)
        out.alpha_composite(p, (i * w, 30))
        rotular(d, (i * w + 6, 30 + h + 4), f"{i + 1}")
        d.line([(i * w, 30), (i * w, out.height)], fill=LIDER, width=1)
    return out


def encuadre(clip, escala=2):
    """Cada fotograma en su sitio de la celda, con la vertical del ancla, la línea
    del suelo y la cadera que espera el maniquí (una cruz); y la piel de cebolla."""
    pint = [f.pintada for f in clip.fotogramas]
    caja = caja_comun(pint, 24)
    caja = (caja[0], caja[1], caja[2], max(caja[3], clip.ancla[1] + 12))
    w, h = (caja[2] - caja[0]) * escala, (caja[3] - caja[1]) * escala
    n = len(pint)
    out = Image.new("RGBA", ((n + 1) * w + 20, 30 + h + 26), FONDO)
    d = ImageDraw.Draw(out)
    rotular(d, (6, 6), f"d{clip.direccion} «{clip.nombre}»: verde = ancla y suelo; cruz = cadera del maniquí; a la derecha, todos superpuestos", 14)
    ax, ay = (clip.ancla[0] - caja[0]) * escala, (clip.ancla[1] - caja[1]) * escala
    cebolla = Image.new("RGBA", (w, h), FONDO)
    for i, f in enumerate(clip.fotogramas):
        p = sobre_fondo(f.pintada.crop(caja).resize((w, h), Image.LANCZOS))
        dp = ImageDraw.Draw(p)
        dp.line([(ax, 0), (ax, h)], fill=(0, 220, 0, 255), width=1)
        dp.line([(0, ay), (w, ay)], fill=(0, 220, 0, 255), width=1)
        if f.esperado and "Hips" in f.esperado["huesos"]:
            hx, hy = f.esperado["huesos"]["Hips"][:2]
            hx, hy = (hx - caja[0]) * escala, (hy - caja[1]) * escala
            dp.line([(hx - 8, hy), (hx + 8, hy)], fill=(255, 0, 255, 255), width=2)
            dp.line([(hx, hy - 8), (hx, hy + 8)], fill=(255, 0, 255, 255), width=2)
        out.alpha_composite(p, (i * w, 30))
        rotular(d, (i * w + 6, 30 + h + 4), f"{i + 1}")
        capa = f.pintada.crop(caja).resize((w, h), Image.LANCZOS)
        a = np.asarray(capa).copy()
        a[..., 3] = (a[..., 3] * (1.6 / n)).clip(0, 255).astype(np.uint8)
        cebolla.alpha_composite(Image.fromarray(a))
    dc = ImageDraw.Draw(cebolla)
    dc.line([(ax, 0), (ax, h)], fill=(0, 220, 0, 255), width=1)
    dc.line([(0, ay), (w, ay)], fill=(0, 220, 0, 255), width=1)
    out.alpha_composite(cebolla, (n * w + 20, 30))
    rotular(d, (n * w + 26, 30 + h + 4), "todos")
    return out


def coherencia(clip, giro, escala=2):
    pint = [f.pintada for f in clip.fotogramas]
    caja = caja_comun(pint)
    w, h = (caja[2] - caja[0]) * escala, (caja[3] - caja[1]) * escala
    g = giro.copy()
    g.thumbnail((10**6, h))
    n = len(pint)
    out = Image.new("RGBA", (g.width + 20 + n * w, 30 + h + 26), FONDO)
    d = ImageDraw.Draw(out)
    rotular(d, (6, 6), f"d{clip.direccion} «{clip.nombre}»: a la izquierda el giro (la identidad); a la derecha cada fotograma", 14)
    out.alpha_composite(sobre_fondo(g), (0, 30))
    for i, p in enumerate(pint):
        out.alpha_composite(sobre_fondo(p.crop(caja).resize((w, h), Image.LANCZOS)), (g.width + 20 + i * w, 30))
        rotular(d, (g.width + 26 + i * w, 30 + h + 4), f"{i + 1}")
    return out


def bucle(clip, escala=3):
    pint = [f.pintada for f in clip.fotogramas]
    caja = caja_comun([pint[0], pint[-1]], 24)
    w, h = (caja[2] - caja[0]) * escala, (caja[3] - caja[1]) * escala
    out = Image.new("RGBA", (2 * w + 10, 30 + h), FONDO)
    d = ImageDraw.Draw(out)
    rotular(d, (6, 6), f"«{clip.nombre}»: el último ({len(pint)}) y el primero (1); el bucle salta de uno a otro", 14)
    out.alpha_composite(sobre_fondo(pint[-1].crop(caja).resize((w, h), Image.LANCZOS)), (0, 30))
    out.alpha_composite(sobre_fondo(pint[0].crop(caja).resize((w, h), Image.LANCZOS)), (w + 10, 30))
    return out
