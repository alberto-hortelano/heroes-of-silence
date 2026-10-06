"""Hojas de contacto de la §16 (paredes laterales) y la §17 (puentes).

Cada pieza nueva sobre terreno a 110 px por casilla —la escala del zoom máximo
en CSS—, con el río o la meseta montados a mano y, al lado, el módulo frontal o
el puente de antes. No es el escenógrafo: es una maqueta para juzgar el arte.

    python3 docs/art/revision-paredes-puentes/hojas.py

`puentes-antes-despues.png` pone cada puente junto a su versión anterior, la
que guarda `antes/` (la primera tanda, antes de los retoques del 06-10-2026).
"""

import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SALIDA = os.path.join(RAIZ, "docs/art/revision-paredes-puentes")
T = 110
NIVEL = 0.6
FUENTE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
FUENTE_G = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)


def ruta(*p):
    return os.path.join(RAIZ, *p)


def imagen(r):
    return Image.open(ruta(r)).convert("RGBA")


def mosaico(textura, ancho, alto, desfase=(0, 0), brillo=1.0):
    """Una textura de suelo repetida: 4 casillas por textura, como en el juego."""
    t = imagen(textura).resize((4 * T, 4 * T), Image.LANCZOS)
    if brillo != 1.0:
        t = ImageEnhance.Brightness(t).enhance(brillo)
    out = Image.new("RGBA", (ancho, alto))
    for y in range(-4 * T, alto + 4 * T, 4 * T):
        for x in range(-4 * T, ancho + 4 * T, 4 * T):
            out.paste(t, (x + desfase[0] % (4 * T), y + desfase[1] % (4 * T)))
    return out


def tono(im, brillo, saturacion):
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(brillo)
    rgb = ImageEnhance.Color(rgb).enhance(saturacion)
    rgb.putalpha(im.getchannel("A"))
    return rgb


def pegar(lienzo, im, ancla, escala, destino):
    """Pega `im` escalada, con su `ancla` (en píxeles suyos) sobre `destino`."""
    w = max(1, round(im.width * escala))
    h = max(1, round(im.height * escala))
    r = im.resize((w, h), Image.LANCZOS)
    x = round(destino[0] - ancla[0] * escala)
    y = round(destino[1] - ancla[1] * escala)
    lienzo.alpha_composite(r, (x, y)) if x >= 0 and y >= 0 else lienzo.paste(r, (x, y), r)


def rejilla(lienzo, alfa=40):
    d = ImageDraw.Draw(lienzo, "RGBA")
    for x in range(0, lienzo.width, T):
        d.line((x, 0, x, lienzo.height), fill=(255, 255, 255, alfa))
    for y in range(0, lienzo.height, T):
        d.line((0, y, lienzo.width, y), fill=(255, 255, 255, alfa))


def rotulo(lienzo, texto, xy=(8, 6)):
    d = ImageDraw.Draw(lienzo, "RGBA")
    caja = d.textbbox(xy, texto, font=FUENTE)
    d.rectangle((caja[0] - 5, caja[1] - 4, caja[2] + 5, caja[3] + 4), fill=(0, 0, 0, 170))
    d.text(xy, texto, font=FUENTE, fill=(240, 232, 210, 255))


def montar(paneles, columnas, titulo, fichero, fondo=(24, 22, 20, 255)):
    hueco = 14
    filas = math.ceil(len(paneles) / columnas)
    w = max(p.width for p in paneles)
    h = max(p.height for p in paneles)
    hoja = Image.new("RGBA", (columnas * (w + hueco) + hueco, filas * (h + hueco) + hueco + 44), fondo)
    ImageDraw.Draw(hoja).text((hueco, 10), titulo, font=FUENTE_G, fill=(240, 232, 210, 255))
    for i, p in enumerate(paneles):
        hoja.alpha_composite(p, (hueco + (i % columnas) * (w + hueco), 44 + hueco + (i // columnas) * (h + hueco)))
    hoja.convert("RGB").save(os.path.join(SALIDA, fichero), optimize=True)
    print("→", os.path.relpath(os.path.join(SALIDA, fichero), RAIZ))


# ------------------------------------------------------------------ puentes

def rio(lienzo, eje, n):
    """El agua de un cauce de una casilla que cruza la del centro, con barro en la orilla."""
    agua = mosaico("assets/mapa/texturas/agua.webp", lienzo.width, lienzo.height, brillo=0.85)
    barro = mosaico("assets/mapa/texturas/barro.webp", lienzo.width, lienzo.height)
    c = n // 2
    mascara = Image.new("L", lienzo.size, 0)
    orilla = Image.new("L", lienzo.size, 0)
    d = ImageDraw.Draw(mascara)
    o = ImageDraw.Draw(orilla)
    m = 0.18 * T
    if eje == "ns":  # el río corre a lo ancho
        o.rectangle((0, c * T - m, lienzo.width, (c + 1) * T + m), fill=255)
        d.rectangle((0, c * T, lienzo.width, (c + 1) * T), fill=255)
    elif eje == "eo":  # el río corre hacia el fondo
        o.rectangle((c * T - m, 0, (c + 1) * T + m, lienzo.height), fill=255)
        d.rectangle((c * T, 0, (c + 1) * T, lienzo.height), fill=255)
    else:  # el río va por la otra diagonal
        cx = cy = (c + 0.5) * T
        sentido = 1 if eje == "ne-so" else -1  # ne-so: el río va de NO a SE
        L = n * T
        a = 0.62 * T
        for dib, ancho in ((o, a + m), (d, a)):
            ux, uy = 1 / math.sqrt(2), sentido / math.sqrt(2)
            vx, vy = -uy, ux
            pts = [
                (cx - ux * L + vx * ancho, cy - uy * L + vy * ancho),
                (cx + ux * L + vx * ancho, cy + uy * L + vy * ancho),
                (cx + ux * L - vx * ancho, cy + uy * L - vy * ancho),
                (cx - ux * L - vx * ancho, cy - uy * L - vy * ancho),
            ]
            dib.polygon(pts, fill=255)
    lienzo.paste(barro, (0, 0), orilla)
    lienzo.paste(agua, (0, 0), mascara)


def panel_de_puente(fichero, eje, texto, n=5, antes=None, carpeta="assets/mapa"):
    lienzo = mosaico("assets/mapa/suelos/grass.webp", n * T, n * T, desfase=(37, 81))
    rio(lienzo, eje, n)
    rejilla(lienzo)
    centro = ((n // 2 + 0.5) * T, (n // 2 + 0.5) * T)
    if antes is not None:
        im = imagen(f"assets/mapa/{antes}.webp")
        a = im.getchannel("A").getbbox()
        # El de antes, a 1,7 casillas de ancho (§10), centrado en su caja.
        escala = 1.7 * T / (a[2] - a[0])
        pegar(lienzo, im, ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2), escala, centro)
    else:
        im = imagen(f"{carpeta}/{fichero}.webp")
        j = json.load(open(ruta(f"{carpeta}/{fichero}.json")))
        pegar(lienzo, im, j["ancla"], T / j["pxPorCasilla"], centro)
        d = ImageDraw.Draw(lienzo)
        x, y = centro
        d.line((x - 7, y, x + 7, y), fill=(255, 60, 40, 255), width=2)
        d.line((x, y - 7, x, y + 7), fill=(255, 60, 40, 255), width=2)
        texto += f"  ·  {j['pxPorCasilla']} px/casilla"
    rotulo(lienzo, texto)
    return lienzo


def hoja_de_puentes():
    paneles = []
    for clase in ("piedra", "troncos"):
        for eje in ("ns", "eo", "ne-so", "no-se", "ns-sube", "eo-sube"):
            f = f"puente-{clase}-{eje}"
            if os.path.exists(ruta(f"assets/mapa/{f}.webp")):
                paneles.append(panel_de_puente(f, eje.replace("-sube", ""), f"{clase} {eje.upper()}"))
    paneles.append(panel_de_puente(None, "ns", "ANTES: nodo-puente-ancho (N-S)", antes="nodo-puente-ancho"))
    paneles.append(panel_de_puente(None, "eo", "ANTES: nodo-puente-hondo (E-O)", antes="nodo-puente-hondo"))
    montar(
        paneles,
        4,
        "§17 · Puentes a 110 px por casilla, sobre un cauce de una casilla. Cruz roja: el ancla (centro del tablero)",
        "puentes.png",
    )


ANTES = "docs/art/revision-paredes-puentes/antes"


def hoja_antes_despues():
    """Cada puente retocado (06-10-2026) junto a su versión anterior, guardada en `antes/`."""
    paneles = []
    for clase in ("piedra", "troncos"):
        for eje in ("ns", "eo", "ne-so", "no-se", "ns-sube", "eo-sube"):
            f = f"puente-{clase}-{eje}"
            if not os.path.exists(ruta(f"{ANTES}/{f}.webp")):
                continue
            e = eje.replace("-sube", "")
            paneles.append(panel_de_puente(f, e, f"ANTES {clase} {eje.upper()}", carpeta=ANTES))
            paneles.append(panel_de_puente(f, e, f"AHORA {clase} {eje.upper()}"))
    montar(
        paneles,
        4,
        "§17 · Puentes retocados: a la izquierda de cada pareja el de antes, a la derecha el de ahora (110 px por casilla)",
        "puentes-antes-despues.png",
    )


# ------------------------------------------------------------------ paredes

SUELO = {"roca": "grass", "arenisca": "sand", "basalto": "lava", "nevadas": "snow"}
CARA = {"roca": "cara-roca", "arenisca": "cara-arenisca", "basalto": "cara-basalto", "nevadas": "cara-nevada"}
TONO = {"roca": (0.72, 0.85), "arenisca": (0.8, 0.72), "basalto": (1, 1), "nevadas": (1, 1)}


def modulos(hoja):
    j = json.load(open(ruta(f"assets/mapa/modulos/{hoja}.json")))
    return {m["imagen"][:-5]: (imagen(f"assets/mapa/modulos/{hoja}/{m['imagen']}"), m) for m in j["modulos"]}


def px_por_casilla_lateral(mods):
    """La casilla de una hoja lateral: un tramo de un nivel mide 1 + 0,6 casillas de filo a pie."""
    altos = [mods[k][0].getchannel("A").getbbox() for k in ("tramo-1-a", "tramo-1-b", "tramo-1-c") if k in mods]
    return sum(b[3] - b[1] for b in altos) / len(altos) / (1 + NIVEL + 0.12)


def meseta(lienzo, material, x0, x1, y0, y1, niveles, lat_e, lat_o, frontales, s_lat, azar):
    """Una meseta de `niveles` sobre el suelo, con su pared frontal y las dos laterales."""
    H = niveles * NIVEL
    br, sat = TONO[material]
    # La tapa de la meseta, subida H, y la cara de fondo, como hace el pintor.
    tapa = mosaico(f"assets/mapa/suelos/{SUELO[material]}.webp", lienzo.width, lienzo.height, (11, 53), 1.3)
    cara = mosaico(f"assets/mapa/texturas/{CARA[material]}.webp", lienzo.width, lienzo.height, (0, 0), 0.7)
    m = Image.new("L", lienzo.size, 0)
    ImageDraw.Draw(m).rectangle((x0 * T, (y1 - H) * T, x1 * T, y1 * T), fill=255)
    lienzo.paste(cara, (0, 0), m)
    m = Image.new("L", lienzo.size, 0)
    ImageDraw.Draw(m).rectangle((x0 * T, (y0 - H) * T, x1 * T, (y1 - H) * T), fill=255)
    lienzo.paste(tapa, (0, 0), m)
    # Lo que se pinta, por orden de profundidad (el pie más abajo, después).
    sprites = []
    # Laterales: los tramos de un nivel o dos, de una casilla, de arriba abajo, y la esquina.
    tramos = [k for k in lat_e if k.startswith(f"tramo-{niveles}")]
    esquina = f"esquina-{niveles}"
    for lado, mods, x in (("este", lat_e, x1), ("oeste", lat_o, x0)):
        sg = 1 if lado == "este" else -1
        # La esquina cubre la lateral desde 0,85 casillas por encima del borde sur.
        if esquina in mods:
            im, _ = mods[esquina]
            b = im.getchannel("A").getbbox()
            # En la guía, la caja de la esquina va de -0,85 (la frontal) a d+0,17 en x,
            # y de yS-0,85-H a yS+0,2 en y; se coloca por su lado de la frontal y su tope.
            esc = T / s_lat
            if lado == "este":
                ax, dx = b[0], (x - 0.85) * T
            else:
                ax, dx = b[2], (x + 0.85) * T
            ay, dy = b[1], (y1 - 0.85 - H) * T
            sprites.append((y1 + 0.2, im, (ax, ay), esc, (dx, dy)))
        y = y1 - 0.85 - 0.5
        i = 0
        while y > y0 - 0.2:
            k = tramos[i % len(tramos)]
            im, _ = mods[k]
            b = im.getchannel("A").getbbox()
            esc = T / s_lat
            # El tramo: su caja empieza 0,24 casillas detrás del filo y su tope es el filo subido H.
            ax = b[0] if lado == "este" else b[2]
            dx = (x - sg * 0.24) * T
            sprites.append((y + 0.5, im, (ax, b[1]), esc, (dx, (y - 0.5 - H) * T)))
            y -= 0.92
            i += 1
    # La pared frontal, como la pone `colocar`: trozos solapados con el ancla al pie.
    claves = sorted(frontales)
    x = x0 + 0.5
    while x < x1 - 0.5:
        im, mm = frontales[claves[int(azar() * len(claves))]]
        alto = H + 0.35 + azar() * 0.2
        esc = alto * T / im.height
        sprites.append((y1 + 0.05, tono(im, br, sat), mm["ancla"], esc, (x * T, (y1 + 0.05) * T)))
        x += 0.42 + azar() * 0.22
    for _, im, a, esc, d in sorted(sprites, key=lambda s: s[0]):
        pegar(lienzo, im, a, esc, d)


def panel_de_paredes(material):
    lat_e = modulos(f"laterales-{material}-este")
    lat_o = modulos(f"laterales-{material}-oeste")
    frontales = {k: (im, m) for k, (im, m) in modulos(f"paredes-{material}").items()}
    s_lat = (px_por_casilla_lateral(lat_e) + px_por_casilla_lateral(lat_o)) / 2
    estado = [12345]

    def azar():
        estado[0] = (estado[0] * 1103515245 + 12345) % 2**31
        return estado[0] / 2**31

    lienzo = mosaico(f"assets/mapa/suelos/{SUELO[material]}.webp", int(14.5 * T), 7 * T, (0, 0), 0.85)
    meseta(lienzo, material, 1.5, 6, 2.2, 5.6, 1, lat_e, lat_o, frontales, s_lat, azar)
    meseta(lienzo, material, 8.6, 13, 2.4, 5.6, 2, lat_e, lat_o, frontales, s_lat, azar)
    rotulo(lienzo, f"{material}: meseta de 1 nivel (izq.) y de 2 (der.) · laterales {round(s_lat)} px/casilla en su hoja · frontales con el tono del juego, laterales sin tono")
    return lienzo


def panel_de_modulos(material):
    """Los módulos sueltos, a 110 px por casilla, sobre su suelo, junto a dos frontales.

    Los frontales llevan el tono con el que los pinta el juego (`TONO` de `colocar.ts`);
    los laterales van tal cual, sin tono: no lo tienen todavía.
    """
    lat_e = modulos(f"laterales-{material}-este")
    lat_o = modulos(f"laterales-{material}-oeste")
    s = (px_por_casilla_lateral(lat_e) + px_por_casilla_lateral(lat_o)) / 2
    br, sat = TONO[material]
    lienzo = mosaico(f"assets/mapa/suelos/{SUELO[material]}.webp", 14 * T, 6 * T, (0, 0), 0.85)
    fr = modulos(f"paredes-{material}")
    x = 0.3 * T
    for fila, mods in enumerate((lat_e, lat_o)):
        x = 0.3 * T
        base = (2.75 + fila * 3) * T
        for k in ("tramo-1-a", "tramo-1-b", "tramo-1-c", "esquina-1", "tramo-2-a", "tramo-2-b", "tramo-2-c", "esquina-2"):
            if k not in mods:
                continue
            im, m = mods[k]
            b = im.getchannel("A").getbbox()
            esc = T / s
            pegar(lienzo, im, (b[0], b[3]), esc, (x, base))
            x += (b[2] - b[0]) * esc + 0.15 * T
        # Un frontal de cada alto, a su escala de juego, para comparar.
        for niveles in (1, 2):
            im, m = fr["5" if niveles == 1 else "9"]
            alto = niveles * NIVEL + 0.45
            esc = alto * T / im.height
            pegar(lienzo, tono(im, br, sat), (0, im.height), esc, (x + 0.1 * T, base))
            x += im.width * esc + 0.2 * T
    rotulo(lienzo, f"{material}: fila de arriba ESTE, de abajo OESTE · al final de cada fila, dos frontales de hoy (1 y 2 niveles)")
    return lienzo


def hoja_de_paredes(material):
    if not os.path.exists(ruta(f"assets/mapa/modulos/laterales-{material}-este.json")) or not os.path.exists(
        ruta(f"assets/mapa/modulos/laterales-{material}-oeste.json")
    ):
        print(f"· {material}: faltan las laterales")
        return
    montar(
        [panel_de_modulos(material), panel_de_paredes(material)],
        1,
        f"§16 · Paredes laterales de {material} a 110 px por casilla, con los módulos frontales de hoy",
        f"paredes-{material}.png",
    )


if __name__ == "__main__":
    que = sys.argv[1:] or ["puentes", "roca", "arenisca", "basalto", "nevadas"]
    for q in que:
        if q == "puentes":
            hoja_de_puentes()
            hoja_antes_despues()
        else:
            hoja_de_paredes(q)
