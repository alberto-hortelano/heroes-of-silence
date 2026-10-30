"""Defectos fabricados con la verdad conocida: miden a cada evaluador.

Cada corrupción toma un clip (sus celdas) y devuelve las celdas cambiadas y la
etiqueta de lo que se hizo, en la taxonomía de `rubrica.json`.
"""
import random

import numpy as np
from PIL import Image, ImageOps


def desplazar(celda, dx, dy):
    out = Image.new("RGBA", celda.size, (0, 0, 0, 0))
    out.alpha_composite(celda, (dx, dy)) if dx >= 0 and dy >= 0 else out.paste(celda, (dx, dy), celda)
    return out


def escalar(celda, s, pie):
    """Escala `s` desde el pie (`pie` = (x, y)): el apoyo no se mueve."""
    px, py = pie
    inv = (1 / s, 0, px - px / s, 0, 1 / s, py - py / s)
    return celda.transform(celda.size, Image.AFFINE, inv, resample=Image.BICUBIC)


def espejar(celda, x):
    """Espejo por la vertical de x (lados cambiados, la figura en su sitio)."""
    e = ImageOps.mirror(celda)
    return desplazar(e, int(round(2 * x - celda.width)), 0)


def recolorear(celda, matiz=0.35):
    """Cambia el color (no el alfa): otra armadura, otra ropa."""
    rgb, a = celda.convert("RGB"), celda.getchannel("A")
    hsv = np.asarray(rgb.convert("HSV")).copy()
    hsv[..., 0] = (hsv[..., 0].astype(int) + int(255 * matiz)) % 256
    hsv[..., 1] = np.clip(hsv[..., 1].astype(int) + 60, 0, 255)
    out = Image.fromarray(hsv, "HSV").convert("RGB")
    out.putalpha(a)
    return out


CORRUPCIONES = ["desplazar3", "desplazar6", "desplazar12", "escala", "espejo", "otra_direccion", "color", "permutar", "ninguna"]


def corromper(celdas, tipo, rng: random.Random, otra=None, pie=(192, 342)):
    """→ (celdas nuevas, etiqueta {tipo, fotogramas, categoria})."""
    c = [x.copy() for x in celdas]
    n = len(c)
    i = rng.randrange(1, n - 1) if n > 2 else 0
    if tipo.startswith("desplazar"):
        px = int(tipo[len("desplazar"):])
        ang = rng.choice([0, 90, 180, 270, 45, 135])
        dx, dy = int(round(px * np.cos(np.radians(ang)))), int(round(px * np.sin(np.radians(ang))))
        c[i] = desplazar(c[i], dx, dy)
        return c, {"tipo": tipo, "fotogramas": [i + 1], "categoria": "encuadre", "dx": dx, "dy": dy}
    if tipo == "escala":
        s = rng.choice([0.88, 1.12])
        c[i] = escalar(c[i], s, pie)
        return c, {"tipo": tipo, "fotogramas": [i + 1], "categoria": "encuadre", "s": s}
    if tipo == "espejo":
        c[i] = espejar(c[i], pie[0])
        return c, {"tipo": tipo, "fotogramas": [i + 1], "categoria": "pose"}
    if tipo == "otra_direccion":
        c[i] = otra.copy()
        return c, {"tipo": tipo, "fotogramas": [i + 1], "categoria": "camara"}
    if tipo == "color":
        c[i] = recolorear(c[i])
        return c, {"tipo": tipo, "fotogramas": [i + 1], "categoria": "coherencia"}
    if tipo == "permutar":
        j = i + 2 if i + 2 < n else i - 2
        c[i], c[j] = c[j], c[i]
        return c, {"tipo": tipo, "fotogramas": sorted([i + 1, j + 1]), "categoria": "pose"}
    return c, {"tipo": "ninguna", "fotogramas": [], "categoria": None}
