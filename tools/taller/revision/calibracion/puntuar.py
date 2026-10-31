"""Puntúa los juicios del corpus contra lo que se fabricó (los sintéticos) y mide el
acuerdo entre jueces (los reales).

puntuar.py <corpus> <etiquetas.json> [juez.variante …]
"""
import glob
import json
import os
import sys
from collections import defaultdict

# Qué categoría de hallazgo cuenta como haber visto cada corrupción.
ACEPTA = {
    "desplazar6": {"encuadre"}, "desplazar12": {"encuadre"}, "escala": {"encuadre", "coherencia"},
    "espejo": {"pose", "coherencia"}, "otra_direccion": {"camara", "pose"},
    "color": {"coherencia"}, "permutar": {"pose", "bucle", "encuadre"},
}


def cargar(corpus):
    juicios = defaultdict(dict)  # juez.variante → {clip: juicio}
    for f in glob.glob(os.path.join(corpus, "juicios", "*.json")):
        partes = os.path.basename(f)[:-5].split(".")
        cid, quien = partes[0], ".".join(partes[1:])
        try:
            juicios[quien][cid] = json.load(open(f))
        except json.JSONDecodeError:
            print("ilegible:", f)
    return juicios


def acierto(j, lab):
    """(vio el fotograma, vio el fotograma con la categoría buena)."""
    if lab["tipo"] == "ninguna":
        return None
    marcados = set(lab["fotogramas"])
    vio = estricto = False
    for h in j["hallazgos"]:
        if marcados & set(h["fotogramas"]):
            vio = True
            if h["categoria"] in ACEPTA[lab["tipo"]]:
                estricto = True
    return vio, estricto


def falsas(j, lab):
    """Hallazgos que no tocan lo fabricado (pueden ser defectos reales del clip)."""
    marcados = set(lab["fotogramas"]) if lab else set()
    return sum(1 for h in j["hallazgos"] if not (marcados & set(h["fotogramas"])))


def main():
    corpus, etiquetas = sys.argv[1], json.load(open(sys.argv[2]))
    juicios = cargar(corpus)
    quienes = sys.argv[3:] or sorted(juicios)
    print(f"{'juez.variante':24s} {'n':>3s} {'vio':>5s} {'estricto':>8s} {'sev≥2':>6s}  por tipo (estricto)        otros hallazgos/clip  veredicto bien en reales")
    for q in quienes:
        js = juicios[q]
        vistos, estrictos, sev2, n = 0, 0, 0, 0
        por_tipo = defaultdict(lambda: [0, 0])
        otros, reales_bien, reales = 0, 0, 0
        for cid, et in etiquetas.items():
            if cid not in js:
                continue
            j = js[cid]
            if et["sintetico"]:
                lab = et["corrupcion"]
                a = acierto(j, lab)
                otros += falsas(j, lab)
                if a is None:
                    continue
                n += 1
                vistos += a[0]
                estrictos += a[1]
                por_tipo[lab["tipo"]][0] += a[1]
                por_tipo[lab["tipo"]][1] += 1
                sev2 += any(set(lab["fotogramas"]) & set(h["fotogramas"]) and h["severidad"] >= 2 for h in j["hallazgos"])
            else:
                reales += 1
                reales_bien += j["veredicto"] == "bien"
        tipos = " ".join(f"{t[:6]}{v[0]}/{v[1]}" for t, v in sorted(por_tipo.items()))
        total = sum(1 for c in etiquetas if c in js)
        print(f"{q:24s} {n:3d} {vistos / max(n, 1):5.2f} {estrictos / max(n, 1):8.2f} {sev2 / max(n, 1):6.2f}  {tipos}  {otros / max(total, 1):.1f}  {reales_bien}/{reales}")


if __name__ == "__main__":
    main()
