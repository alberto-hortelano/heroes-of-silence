"""El muñeco de palos de lo pintado: un estimador de pose sobre cada celda.

Las figuras miden ~160 px en una celda de 384 y se ven desde arriba a 25°: se
recortan a su caja, se amplían ×3 sobre gris y se le da la caja al estimador
(sin detector). Devuelve los puntos con los nombres de los huesos del maniquí
(`esqueleto.SEGMENTOS`), en píxeles de la celda.

Estimadores (rtmlib, ONNX en la GPU; los modelos se bajan a ~/.cache/rtmlib):
- `rtmpose-x`: RTMPose-x body7, 17 puntos COCO.
- `rtmw-x`: RTMW-x cocktail14 (cuerpo entero, entrenado también con arte), 133.
"""
import hashlib
import os

import numpy as np
from PIL import Image

# (url, tamaño de entrada, el ONNX que rtmlib deja en su caché y su sha256). El sha
# se comprueba: un modelo que cambia en el servidor cambia lo que se mide, y las
# cifras de los experimentos (30-10-2026) son de estos. DWPose ya no se descarga.
MODELOS = {
    "rtmpose-x": ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-x_simcc-body7_pt-body7_700e-384x288-71d7b7e9_20230629.zip", (288, 384),
                  "rtmpose-x_simcc-body7_pt-body7_700e-384x288-71d7b7e9_20230629.onnx",
                  "df0c0fa91e9870b1515dcaff741fd76cc753dcfb12786862f61b243bae81cd52"),
    "rtmw-x": ("https://download.openmmlab.com/mmpose/v1/projects/rtmw/onnx_sdk/rtmw-dw-x-l_simcc-cocktail14_270e-384x288_20231122.zip", (288, 384),
               "rtmw-dw-x-l_simcc-cocktail14_270e-384x288_20231122.onnx",
               "bd033156e5104c4f5d2edfe0453e02661e30a2f3da453ec93c8764d561b83054"),
}
CACHE_DE_RTMLIB = os.path.expanduser("~/.cache/rtmlib/hub/checkpoints")

# COCO 17 → hueso del maniquí. «Left» es el del personaje en los dos.
COCO = {
    5: "LeftArm", 6: "RightArm", 7: "LeftForeArm", 8: "RightForeArm", 9: "LeftHand", 10: "RightHand",
    11: "LeftUpLeg", 12: "RightUpLeg", 13: "LeftLeg", 14: "RightLeg", 15: "LeftFoot", 16: "RightFoot",
}
CABEZA = (0, 1, 2, 3, 4)  # nariz, ojos, orejas → `Head`, su media
# Del cuerpo entero (133): la punta del pie grande → `*ToeBase`.
PIES = {17: "LeftToeBase", 20: "RightToeBase"}

AMPLIAR = 3
GRIS = (128, 128, 128)

_cache = {}


def _comprobar(onnx, sha):
    ruta = os.path.join(CACHE_DE_RTMLIB, onnx)
    with open(ruta, "rb") as f:
        visto = hashlib.sha256(f.read()).hexdigest()
    if visto != sha:
        raise SystemExit(f"el modelo de pose {ruta} no es el medido (sha256 {visto}, se esperaba {sha}): "
                         "bórralo para que se baje otra vez, o vuelve a medir el estimador")


def estimador(nombre):
    if nombre not in _cache:
        from rtmlib import RTMPose
        url, tam, onnx, sha = MODELOS[nombre]
        # En la CPU: en esta máquina onnxruntime-gpu pide CUDA 13 y cuDNN 9, que no
        # están, e intentarlo pinta un error rojo antes de caer en la CPU (QA, H13).
        # Una cuadrícula de 7 celdas tarda ~1 s en la CPU. Con HEROES_VISION_GPU=1, la GPU.
        import onnxruntime
        onnxruntime.set_default_logger_severity(3)
        dispositivo = "cuda" if os.environ.get("HEROES_VISION_GPU") == "1" else "cpu"
        modelo = RTMPose(url, model_input_size=tam, backend="onnxruntime", device=dispositivo)
        _comprobar(onnx, sha)
        _cache[nombre] = modelo
    return _cache[nombre]


def caja(alfa, umbral=64):
    ys, xs = np.nonzero(alfa >= umbral)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def estimar(celda: Image.Image, nombre="rtmw-x"):
    """{hueso: (x, y, confianza)} en píxeles de la celda, o {} si está vacía."""
    rgba = np.asarray(celda.convert("RGBA"))
    c = caja(rgba[..., 3])
    if c is None:
        return {}
    x0, y0, x1, y1 = c
    m = 16
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(rgba.shape[1], x1 + m), min(rgba.shape[0], y1 + m)
    recorte = Image.fromarray(rgba[y0:y1, x0:x1])
    fondo = Image.new("RGBA", recorte.size, GRIS + (255,))
    fondo.alpha_composite(recorte)
    grande = fondo.convert("RGB").resize((recorte.width * AMPLIAR, recorte.height * AMPLIAR), Image.LANCZOS)
    img = np.asarray(grande)[..., ::-1].copy()  # BGR
    kp, sc = estimador(nombre)(img, bboxes=[[0, 0, grande.width, grande.height]])
    kp, sc = kp[0], sc[0]
    a_celda = lambda p: (float(p[0] / AMPLIAR + x0), float(p[1] / AMPLIAR + y0))
    out = {}
    for i, n in COCO.items():
        out[n] = (*a_celda(kp[i]), float(sc[i]))
    cab = np.mean([kp[i] for i in CABEZA], axis=0)
    out["Head"] = (*a_celda(cab), float(np.mean([sc[i] for i in CABEZA])))
    if len(kp) > 17:
        for i, n in PIES.items():
            out[n] = (*a_celda(kp[i]), float(sc[i]))
    # La cadera y el pecho, de sus dos lados: `Hips` y `Spine2` del maniquí.
    for n, (a, b) in {"Hips": ("LeftUpLeg", "RightUpLeg"), "Spine2": ("LeftArm", "RightArm")}.items():
        out[n] = ((out[a][0] + out[b][0]) / 2, (out[a][1] + out[b][1]) / 2, min(out[a][2], out[b][2]))
    return out
