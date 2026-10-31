"""El muñeco de palos: los huesos del maniquí (`*.huesos.json`) y cómo se pintan.

Lo comparten las medidas y los paneles de la revisión. La referencia
`pose-esqueleto` (la hoja de pose con el muñeco encima) la dibuja el taller
(`versiones.ts`), con los mismos colores. Las coordenadas son de la
celda del maniquí; `al_atlas` las lleva a la del atlas con el `deLaPose` de la
procedencia de la hoja (k y el apoyo del reposo de los dos).
"""
import json
from PIL import Image, ImageDraw

# Segmentos del muñeco: (de, a, lado). El lado colorea: izquierda azul, derecha
# rojo, como las piernas del maniquí; el tronco en blanco.
SEGMENTOS = [
    ("Hips", "Spine2", "c"), ("Spine2", "Neck", "c"), ("Neck", "Head", "c"), ("Head", "HeadTop_End", "c"),
    ("Spine2", "LeftArm", "i"), ("LeftArm", "LeftForeArm", "i"), ("LeftForeArm", "LeftHand", "i"),
    ("Spine2", "RightArm", "d"), ("RightArm", "RightForeArm", "d"), ("RightForeArm", "RightHand", "d"),
    ("Hips", "LeftUpLeg", "i"), ("LeftUpLeg", "LeftLeg", "i"), ("LeftLeg", "LeftFoot", "i"), ("LeftFoot", "LeftToeBase", "i"),
    ("Hips", "RightUpLeg", "d"), ("RightUpLeg", "RightLeg", "d"), ("RightLeg", "RightFoot", "d"), ("RightFoot", "RightToeBase", "d"),
]
COLOR = {"c": (255, 255, 255), "i": (40, 120, 255), "d": (255, 50, 50), "arma": (255, 210, 0)}


def leer(ruta):
    """{clip: [celda, …]} con cada celda {huesos: {nombre: [x, y, z]}, atrezo: [[a, b], …]}."""
    d = json.load(open(ruta))
    return {f["clip"]: f["celdas"] for f in d["filas"]}, d["celda"]


def al_atlas(punto, de_la_pose):
    """Del píxel de la celda del maniquí al de la celda del atlas: escala k desde
    su apoyo del reposo hasta el origen del atlas (lo que hace `empaquetar`)."""
    k = de_la_pose["k"]
    ox, oy = de_la_pose["origen"]
    ax, ay = de_la_pose["apoyoReposo"]
    return (ox + k * (punto[0] - ax), oy + k * (punto[1] - ay))


def pintar(draw: ImageDraw.ImageDraw, celda, desplazar=lambda p: p, ancho=2, tono=1.0, arma=True):
    """Pinta el muñeco de una celda; los huesos de detrás, más finos."""
    h = celda["huesos"]
    for a, b, lado in SEGMENTOS:
        if a not in h or b not in h:
            continue
        c = tuple(int(v * tono) for v in COLOR[lado])
        draw.line([desplazar(h[a][:2]), desplazar(h[b][:2])], fill=c + (255,), width=ancho)
    if arma:
        for p, q in celda.get("atrezo", []):
            draw.line([desplazar(p[:2]), desplazar(q[:2])], fill=COLOR["arma"] + (255,), width=ancho)
    for nombre, p in h.items():
        x, y = desplazar(p[:2])
        draw.ellipse([x - ancho, y - ancho, x + ancho, y + ancho], fill=(255, 255, 255, 255))


