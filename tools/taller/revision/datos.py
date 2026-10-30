"""Lo que la revisión lee de una dirección: los clips, celda a celda, con lo que el
maniquí esperaba en cada una.

`direccion(trabajo)` lee el atlas de la dirección (lo que está en el juego);
`hojas(trabajo, rutas)` lee hojas sueltas con su procedencia al lado (las versiones
que se comparan, antes de juntarlas al atlas). Cada fotograma lleva la celda
pintada (RGBA), la del maniquí en profundidad y su esqueleto llevado a píxeles de
la celda pintada (`esperado`) con la misma regla que el empaquetado:
`origen + k · (p − apoyoReposo)` (`deLaPose` de la procedencia de su hoja).

El esqueleto es el del maniquí de hoy, junto a su hoja de pose:
`<maniqui>/d<n>-<h>.huesos.json` (`pnpm taller maniqui <id> --huesos`). Quien llama
dice dónde está el maniquí (`trabajo["maniqui"]`): lo decide el taller, no esto.
"""
import json
import os
from dataclasses import dataclass, field, replace
from functools import lru_cache

from PIL import Image

import esqueleto

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

# Las filas de cada hoja: `HOJAS_DE_FIGURA` de `src/shared/arte.ts`, que el taller pasa
# en el trabajo; esto es solo el respaldo de la calibración.
FILAS_DE_HOJA = {"a": ["idle", "walk", "charge"], "b": ["attack", "hurt", "death"], "c": ["shoot"]}
EN_BUCLE = {"idle", "walk", "charge"}


@dataclass
class Fotograma:
    pintada: Image.Image
    maniqui: Image.Image | None  # la profundidad del maniquí en su celda (sin llevar al atlas)
    huesos: dict | None  # el esqueleto del maniquí en su celda
    esperado: dict | None  # el mismo, en píxeles de la celda pintada


@dataclass
class Clip:
    unidad: str
    direccion: int
    nombre: str
    hoja: str
    fila_hoja: int
    fps: float
    bucle: bool
    ancla: tuple
    de_la_pose: dict | None
    fotogramas: list = field(default_factory=list)


def ruta(r):
    return r if os.path.isabs(r) else os.path.join(RAIZ, r)


def _esperado(h, dlp, fila_hoja):
    if h is None or dlp is None:
        return None
    elev = (dlp.get("elevaciones") or [0, 0, 0])[fila_hoja] if dlp.get("elevaciones") else 0

    def mover(p):
        x, y = esqueleto.al_atlas(p, dlp)
        return (x, y - elev)

    return {
        "huesos": {n: [*mover(p), p[2]] for n, p in h["huesos"].items()},
        "atrezo": [[[*mover(a), a[2]], [*mover(b), b[2]]] for a, b in h.get("atrezo", [])],
    }


def _maniqui(trabajo, d, letra):
    """(filas de huesos por clip, imagen de profundidad) del maniquí de una hoja, o (None, None)."""
    m = trabajo.get("maniqui")
    if not m:
        return None, None
    return _maniqui_de(m, d, letra)


@lru_cache(maxsize=64)
def _maniqui_de(m, d, letra):
    """Leído una vez por hoja: una comparación lo pide para A y para B, y el visor por animación."""
    r = ruta(os.path.join(m, f"d{d}-{letra}.huesos.json"))
    if not os.path.exists(r):
        return None, None
    filas, _ = esqueleto.leer(r)
    pp = ruta(os.path.join(m, f"d{d}-{letra}.profundidad.png"))
    if not os.path.exists(pp):
        pp = ruta(os.path.join(m, f"d{d}-{letra}.png"))
    return filas, Image.open(pp).convert("RGBA")


def direccion(trabajo):
    """Los clips del atlas de una dirección, en su orden (leídos una vez por dirección)."""
    leidos = _direccion(trabajo["unidad"], trabajo["direccion"], trabajo["carpetaDelArte"], trabajo.get("maniqui"))
    # Copias: quien las recibe puede cambiar un fotograma (la calibración fabrica
    # defectos) sin tocar lo guardado.
    return [replace(c, fotogramas=[replace(f) for f in c.fotogramas]) for c in leidos]


@lru_cache(maxsize=32)
def _direccion(unidad, d, carpeta_del_arte, maniqui):
    trabajo = {"unidad": unidad, "direccion": d, "carpetaDelArte": carpeta_del_arte, "maniqui": maniqui}
    dd = ruta(os.path.join(trabajo["carpetaDelArte"], f"d{d}"))
    atlas = json.load(open(os.path.join(dd, "atlas.json")))
    comp = json.load(open(os.path.join(dd, "atlas.composicion.json")))
    img = Image.open(os.path.join(dd, atlas["imagen"])).convert("RGBA")
    lado = atlas["cell"]
    # De qué hoja sale cada fila del atlas, y en qué fila de la hoja.
    origen_de_fila = []
    for h in comp["hojas"]:
        letra = h["imagen"].split("-")[1].split(".")[0]
        for i, _ in enumerate(h["filas"]):
            origen_de_fila.append((letra, i))
    clips = []
    for nombre, c in atlas["clips"].items():
        letra, fila_hoja = origen_de_fila[c["row"]]
        proc = json.load(open(os.path.join(dd, f"hoja-{letra}.procedencia.json")))
        dlp = proc.get("deLaPose")
        clip = Clip(trabajo["unidad"], d, nombre, letra, fila_hoja, c["fps"], c["loop"], tuple(c["anchor"]), dlp)
        filas, prof = _maniqui(trabajo, d, letra)
        huesos = filas.get(nombre) if filas else None
        for col in range(c["frames"]):
            pintada = img.crop((col * lado, c["row"] * lado, (col + 1) * lado, (c["row"] + 1) * lado))
            h = huesos[col] if huesos and col < len(huesos) else None
            man = prof.crop((col * lado, fila_hoja * lado, (col + 1) * lado, (fila_hoja + 1) * lado)) if prof else None
            clip.fotogramas.append(Fotograma(pintada, man, h, _esperado(h, dlp, fila_hoja)))
        clips.append(clip)
    return clips


def hojas(trabajo, rutas, fps=None):
    """Los clips de unas hojas sueltas (`{letra: ruta de hoja-x.webp}`), con la
    procedencia al lado. Siete fotogramas por fila; el ancla, la de siempre (la
    muerte, 64 px más arriba); el ritmo, el del atlas si se da (`fps`)."""
    d = trabajo["direccion"]
    filas_de_hoja = trabajo.get("filasDeHoja") or FILAS_DE_HOJA
    clips = []
    for letra, r in rutas.items():
        img = Image.open(ruta(r)).convert("RGBA")
        proc = json.load(open(ruta(r).replace(".webp", ".procedencia.json")))
        dlp = proc.get("deLaPose")
        lado = img.width // 7
        filas, prof = _maniqui(trabajo, d, letra)
        for fila, nombre in enumerate(filas_de_hoja[letra]):
            ancla = (lado // 2, round(342 * lado / 384) - (64 if nombre == "death" else 0))
            clip = Clip(trabajo["unidad"], d, nombre, letra, fila, (fps or {}).get(nombre, 8),
                        nombre in EN_BUCLE, ancla, dlp)
            for col in range(7):
                pintada = img.crop((col * lado, fila * lado, (col + 1) * lado, (fila + 1) * lado))
                h = filas[nombre][col] if filas and nombre in filas else None
                man = prof.crop((col * lado, fila * lado, (col + 1) * lado, (fila + 1) * lado)) if prof else None
                clip.fotogramas.append(Fotograma(pintada, man, h, _esperado(h, dlp, fila)))
            clips.append(clip)
    return clips
