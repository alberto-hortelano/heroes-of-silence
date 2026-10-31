"""La puerta del taller al entorno de visión (`tools/taller/revision/vision.ts` la
llama; nadie más). Solo produce imágenes y cifras para los jueces y la persona:
lo que decide, rechaza o escribe en `assets/` es del taller, en TypeScript.

vision.py paneles <trabajo.json>      los paneles de cada clip y lo que es (cifras.json)
vision.py comparacion <trabajo.json>  el panel a ciegas de dos versiones, por clip
vision.py visor <carpeta>             anima los casos de <carpeta>/casos.json y los sirve
vision.py troncos <trabajo.json> <salida.json>  el tronco que ve el estimador en cada celda

Cada trabajo es un JSON que escribe el taller (ver `vision.ts`). Todo lo que se
escribe va en la carpeta `salida` del trabajo, en `.cache/taller/revision/`.
"""
import json
import os
import random
import sys
from http.server import ThreadingHTTPServer

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos  # noqa: E402
import paneles  # noqa: E402
import pose  # noqa: E402
import visor  # noqa: E402

# Lo que es cada panel, junto a quien lo dibuja: el taller copia estas frases al
# prompt de los jueces (`paneles.json`), así que dibujo y descripción no se separan.
DESCRIPCION = {
    "tira.png": "la tira: arriba el maniquí (gris, en profundidad: más claro, más cerca) y abajo lo pintado, numerados",
    "superposicion.png": "la superposición: lo pintado con el muñeco de palos del maniquí (fino: izquierda azul, derecha rojo, arma amarillo) y el que un estimador automático ve en lo pintado (grueso: izquierda cian, derecha naranja; el estimador se equivoca a veces con armaduras y capas)",
    "encuadre.png": "el encuadre: cada fotograma en su sitio de la celda con la vertical del ancla y la línea del suelo en verde y una cruz magenta donde el maniquí tiene la cadera; a la derecha, todos los fotogramas superpuestos (la vibración se ve como un fantasma movido)",
    "coherencia.png": "la coherencia: a la izquierda la lámina de giro del personaje (su identidad, en ocho direcciones) y a la derecha cada fotograma ampliado",
    "bucle.png": "el bucle: el último fotograma y el primero, lado a lado",
}


def montar(clip, carpeta, giro):
    """Los cinco paneles de un clip (el bucle, solo si lo es), lo que es el clip y qué es
    cada panel. Las cifras automáticas en el prompt no ayudaron a los jueces
    (experimentos §4): no se calculan."""
    os.makedirs(carpeta, exist_ok=True)
    est = [pose.estimar(f.pintada) for f in clip.fotogramas]
    hechos = {
        "tira.png": paneles.tira(clip),
        "superposicion.png": paneles.superposicion(clip, est),
        "encuadre.png": paneles.encuadre(clip),
        "coherencia.png": paneles.coherencia(clip, giro),
    }
    if clip.bucle:
        hechos["bucle.png"] = paneles.bucle(clip)
    for nombre, im in hechos.items():
        im.save(os.path.join(carpeta, nombre))
    json.dump([{"imagen": n, "descripcion": DESCRIPCION[n]} for n in hechos],
              open(os.path.join(carpeta, "paneles.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"clip": clip.nombre, "hoja": clip.hoja, "fila": clip.fila_hoja, "bucle": clip.bucle,
               "fotogramas": len(clip.fotogramas)},
              open(os.path.join(carpeta, "cifras.json"), "w"), ensure_ascii=False, indent=1)


def giro_de(trabajo):
    return Image.open(datos.ruta(os.path.join(trabajo["carpetaDelArte"], "giro.webp"))).convert("RGBA")


def orden_paneles(trabajo):
    giro = giro_de(trabajo)
    solo = trabajo.get("clips")
    for c in datos.direccion(trabajo):
        if solo and c.nombre not in solo:
            continue
        if not any(f.huesos for f in c.fotogramas):
            raise SystemExit(f"{c.unidad} d{c.direccion} «{c.nombre}»: el maniquí no tiene esqueleto en "
                             f"{trabajo.get('maniqui')} (pnpm taller maniqui <id> --huesos)")
        montar(c, datos.ruta(os.path.join(trabajo["salida"], c.nombre)), giro)
        print(c.nombre, flush=True)


def panel_a_ciegas(ca, cb, salida):
    """Por clip: el maniquí arriba, A en medio y B abajo, con la misma caja y escala."""
    celdas = [f.pintada for f in ca.fotogramas] + [f.pintada for f in cb.fotogramas]
    caja = paneles.caja_comun(celdas)
    man = [f.maniqui for f in ca.fotogramas]
    cm = paneles.caja_comun(man)
    e = 2
    w, h = (caja[2] - caja[0]) * e, (caja[3] - caja[1]) * e
    hm = int(h * 0.8)
    n = len(ca.fotogramas)
    im = Image.new("RGBA", (60 + n * w, 30 + hm + 2 * h + 30), paneles.FONDO)
    d = ImageDraw.Draw(im)
    paneles.rotular(d, (6, 6), f"«{ca.nombre}»: arriba el maniquí, en medio A, abajo B")
    for i in range(n):
        x = 60 + i * w
        if man[i] is not None:
            m = man[i].crop(cm)
            m = m.resize((max(1, int(m.width * hm / m.height)), hm), Image.LANCZOS)
            im.alpha_composite(paneles.sobre_fondo(m), (x + (w - m.width) // 2, 30))
        im.alpha_composite(paneles.sobre_fondo(ca.fotogramas[i].pintada.crop(caja).resize((w, h), Image.LANCZOS)), (x, 30 + hm))
        im.alpha_composite(paneles.sobre_fondo(cb.fotogramas[i].pintada.crop(caja).resize((w, h), Image.LANCZOS)), (x, 30 + hm + h))
        paneles.rotular(d, (x + 6, 30 + hm + 2 * h + 4), str(i + 1))
        d.line([(x, 30), (x, im.height)], fill=paneles.LIDER, width=1)
    paneles.rotular(d, (12, 30 + hm + h // 2), "A", 28)
    paneles.rotular(d, (12, 30 + hm + h + h // 2), "B", 28)
    d.line([(0, 30 + hm + h), (im.width, 30 + hm + h)], fill=(200, 200, 200, 255), width=2)
    im.save(salida)


def orden_comparacion(trabajo):
    """`versiones`: {"A": ruta, "B": ruta} de una misma hoja; un panel por clip y el giro."""
    salida = datos.ruta(trabajo["salida"])
    os.makedirs(salida, exist_ok=True)
    letra = trabajo["hoja"]
    ca = datos.hojas(trabajo, {letra: trabajo["versiones"]["A"]}, trabajo.get("fps"))
    cb = datos.hojas(trabajo, {letra: trabajo["versiones"]["B"]}, trabajo.get("fps"))
    for a, b in zip(ca, cb):
        panel_a_ciegas(a, b, os.path.join(salida, f"{a.nombre}.png"))
        print(a.nombre, flush=True)
    giro_de(trabajo).save(os.path.join(salida, "giro.png"))


class SoloManiqui:
    """Lo que el visor necesita de un clip del maniquí solo: su ritmo y su ancla."""

    def __init__(self, fps, lado, muerte):
        self.fps = fps
        self.ancla = (lado // 2, round(342 * lado / 384) - (64 if muerte else 0))


def celdas_del_maniqui(anim):
    """Las celdas de un clip del maniquí, de su hoja de pose en color (el visor del maniquí)."""
    hoja = Image.open(datos.ruta(os.path.join(anim["maniqui"], f"d{anim['direccion']}-{anim['letra']}.png"))).convert("RGBA")
    fila = anim["filasDeHoja"][anim["letra"]].index(anim["clip"])
    lado = hoja.width // 7
    celdas = [hoja.crop((c * lado, fila * lado, (c + 1) * lado, (fila + 1) * lado)) for c in range(7)]
    return celdas, SoloManiqui(anim.get("fps") or 8, lado, anim["clip"] == "death")


def celdas_de(anim):
    """Las celdas de una animación de un caso: lo pintado (del atlas o de una hoja) o el maniquí."""
    if anim.get("de") == "solo-maniqui":
        return celdas_del_maniqui(anim)
    trabajo = {k: anim[k] for k in ("unidad", "direccion", "carpetaDelArte", "maniqui", "filasDeHoja") if k in anim}
    clips = datos.hojas(trabajo, {anim["letra"]: anim["hoja"]}) if anim.get("hoja") else datos.direccion(trabajo)
    c = next((c for c in clips if c.nombre == anim["clip"]), None)
    if c is None:
        raise SystemExit(f"no está el clip «{anim['clip']}» en {anim.get('hoja') or anim['carpetaDelArte']}")
    if anim.get("de") == "maniqui":
        return [f.maniqui for f in c.fotogramas], c
    return [f.pintada for f in c.fotogramas], c


def orden_visor(carpeta, puerto=0):
    """Anima cada caso (WebP a la velocidad del juego, o la pedida) y sirve la página."""
    carpeta = datos.ruta(carpeta)
    casos = json.load(open(os.path.join(carpeta, "casos.json")))
    os.makedirs(os.path.join(carpeta, "anim"), exist_ok=True)
    pagina = []
    for caso in casos:
        anims = []
        # Un caso ya animado (con `src`) pasa tal cual.
        if all("src" in a for a in caso["animaciones"]):
            pagina.append(caso)
            continue
        # Lo pintado de un caso, a la misma caja: así se ve si una versión baila.
        celdas = [celdas_de(a) for a in caso["animaciones"]]
        pintadas = [x for (cs, _), a in zip(celdas, caso["animaciones"]) if a.get("de") in (None, "pintado") for x in cs]
        caja = paneles.caja_comun(pintadas, 16) if pintadas else None
        for k, (a, (cs, clip)) in enumerate(zip(caso["animaciones"], celdas)):
            rel = os.path.join("anim", f"{caso['id']}-{k}.webp")
            pintado = a.get("de") in (None, "pintado")
            visor.animacion(cs, a.get("fps") or clip.fps, os.path.join(carpeta, rel),
                            caja if pintado else None, suelo=clip.ancla[1] if pintado else None)
            anims.append({"rotulo": a["rotulo"], "src": rel})
        pagina.append({**{k: caso[k] for k in ("id", "titulo", "texto", "opciones")}, "animaciones": anims})
    # Los casos en orden al azar: el orden no debe decir nada.
    random.Random(len(pagina)).shuffle(pagina)
    open(os.path.join(carpeta, "index.html"), "w").write(visor.pagina(pagina))
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto),
                                   lambda *a, **k: visor.Manejador(*a, directory=carpeta, **k))
    print(f"http://127.0.0.1:{servidor.server_address[1]}/", flush=True)
    servidor.serve_forever()


TRONCO = ("LeftUpLeg", "RightUpLeg", "LeftArm", "RightArm")
CONFIANZA_DEL_TRONCO = 0.45


def orden_troncos(trabajo, salida):
    """El tronco que ve el estimador en cada celda (`trabajo["celdas"]`, PNG): la media
    de caderas y hombros si los cuatro tienen confianza, o null. Lo pide C1 al
    empaquetar (`encuadre.ts`, `absolutosDe`): la medida absoluta del tronco."""
    fuera = []
    for ruta in trabajo["celdas"]:
        e = pose.estimar(Image.open(ruta).convert("RGBA"))
        if e and all(e[n][2] >= CONFIANZA_DEL_TRONCO for n in TRONCO):
            fuera.append([sum(e[n][0] for n in TRONCO) / 4, sum(e[n][1] for n in TRONCO) / 4])
        else:
            fuera.append(None)
    json.dump(fuera, open(salida, "w"))


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else ""
    if orden == "paneles":
        orden_paneles(json.load(open(sys.argv[2])))
    elif orden == "comparacion":
        orden_comparacion(json.load(open(sys.argv[2])))
    elif orden == "troncos":
        orden_troncos(json.load(open(sys.argv[2])), sys.argv[3])
    elif orden == "visor":
        orden_visor(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else:
        raise SystemExit("vision.py paneles|comparacion <trabajo.json> | visor <carpeta> [puerto]")
