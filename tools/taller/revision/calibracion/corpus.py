"""La calibración del jurado: monta un corpus de clips para juzgar, los paneles de
cada uno y sus cifras, en una carpeta por clip con un nombre que no dice qué es
(c01, c02…). Lo que se le hizo a cada clip fabricado va aparte, en
`etiquetas.json`, que los jueces no ven. Con `puntuar.py` se mide el jurado otra vez
cuando cambia `juez.md` (los resultados del 30-10-2026, en
`docs/agents/2026-10-30-evaluar-animaciones/experimentos.md` §4). Sin CI.

.cache/vision/.venv/bin/python -I tools/taller/revision/calibracion/corpus.py <salida> <semilla> <n_sinteticos> <n_reales> <unidad>…
"""
import json
import os
import random
import sys


AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.dirname(AQUI))
import datos  # noqa: E402
import sinteticos  # noqa: E402
import vision  # noqa: E402

def trabajo_de(u, d):
    """El trabajo de una dirección de una unidad, con su maniquí de hoy en `_poses`."""
    return {"unidad": u, "direccion": d, "carpetaDelArte": f"assets/unidades/{u}",
            "maniqui": f"assets/unidades/_poses/unidades/{u}-8d"}


TIPOS = ["desplazar6", "desplazar12", "escala", "espejo", "otra_direccion", "color", "permutar", "ninguna"]


def main():
    salida, semilla, n_sin, n_real = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    unidades = sys.argv[5:]
    rng = random.Random(semilla)
    os.makedirs(salida, exist_ok=True)
    elegidos = set()
    casos = []
    for i in range(n_sin + n_real):
        u = unidades[i % len(unidades)]
        while True:
            d = rng.randrange(8)
            clips = [c for c in datos.direccion(trabajo_de(u, d)) if c.nombre != "death"]
            c = rng.choice(clips)
            if (u, d, c.nombre) not in elegidos:
                break
        elegidos.add((u, d, c.nombre))
        casos.append((u, d, c.nombre, TIPOS[i % len(TIPOS)] if i < n_sin else None))
    rng.shuffle(casos)
    etiquetas = {}
    for n, (u, d, nombre, tipo) in enumerate(casos, 1):
        cid = f"c{n:02d}"
        clip = next(c for c in datos.direccion(trabajo_de(u, d)) if c.nombre == nombre)
        giro = vision.giro_de(trabajo_de(u, d))
        et = {"unidad": u, "direccion": d, "clip": nombre, "sintetico": tipo is not None}
        if tipo is not None:
            otra = next(c for c in datos.direccion(trabajo_de(u, (d + 3) % 8)) if c.nombre == nombre)
            i_otra = min(len(otra.fotogramas) - 1, len(clip.fotogramas) // 2)
            nuevas, lab = sinteticos.corromper([f.pintada for f in clip.fotogramas], tipo, rng,
                                               otra=otra.fotogramas[i_otra].pintada, pie=clip.ancla)
            for f, cel in zip(clip.fotogramas, nuevas):
                f.pintada = cel
            et["corrupcion"] = lab
        # El nombre del clip en los paneles es el de verdad; la unidad no dice nada.
        clip.unidad = cid
        vision.montar(clip, f"{salida}/{cid}", giro)
        etiquetas[cid] = et
        print(cid, et, flush=True)
    json.dump(etiquetas, open(f"{salida}/etiquetas.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
