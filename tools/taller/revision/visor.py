"""El visor para la persona: lo que solo se juzga viéndolo moverse.

La página con los casos (cada uno, unas animaciones lado a lado y una pregunta con
sus respuestas) y su servidor, que guarda cada respuesta en
<carpeta>/respuestas.json al pulsarla. Lo arranca `vision.py visor <carpeta>`,
que anima los casos de <carpeta>/casos.json (los escribe el taller).
"""
import html
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paneles  # noqa: E402

FONDO = (52, 54, 60, 255)


def animacion(celdas, fps, ruta, caja=None, escala=1.5, suelo=None):
    """Un WebP animado de las celdas, recortadas a la misma caja y a la velocidad
    del juego (bucle infinito); con `suelo`, una línea tenue en esa y."""
    caja = caja or paneles.caja_comun(celdas, 16)
    w, h = int((caja[2] - caja[0]) * escala), int((caja[3] - caja[1]) * escala)
    cuadros = []
    for c in celdas:
        f = Image.new("RGBA", (w, h), FONDO)
        if suelo is not None:
            y = int((suelo - caja[1]) * escala)
            f.paste((80, 84, 92, 255), (0, y, w, y + 1))
        f.alpha_composite(c.crop(caja).resize((w, h), Image.LANCZOS))
        cuadros.append(f.convert("RGB"))
    cuadros[0].save(ruta, save_all=True, append_images=cuadros[1:], duration=int(1000 / fps), loop=0, quality=90)
    return caja


def pagina(casos):
    tarjetas = []
    for c in casos:
        anims = "".join(
            f'<figure><img src="{html.escape(a["src"])}" alt=""><figcaption>{html.escape(a["rotulo"])}</figcaption></figure>'
            for a in c["animaciones"])
        botones = "".join(
            f'<button data-caso="{html.escape(c["id"])}" data-valor="{html.escape(o)}">{html.escape(o)}</button>'
            for o in c["opciones"])
        tarjetas.append(
            f'<section id="{html.escape(c["id"])}"><h2>{html.escape(c["titulo"])}</h2>'
            f'<p>{html.escape(c["texto"])}</p><div class="anims">{anims}</div>'
            f'<div class="botones">{botones}</div>'
            f'<textarea data-caso="{html.escape(c["id"])}" placeholder="Nota (opcional)"></textarea></section>')
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Revisión de animaciones</title>
<style>
:root {{ color-scheme: dark; }}
body {{ margin: 0; padding: 16px; background: #1e1f24; color: #e8e8ea; font: 15px/1.45 system-ui, sans-serif; }}
h1 {{ font-size: 20px; }} h2 {{ font-size: 16px; margin: 0 0 6px; }}
section {{ background: #2a2c33; border-radius: 10px; padding: 14px; margin: 0 0 16px; }}
section.hecho {{ outline: 2px solid #3f8f5a; }}
.anims {{ display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0; }}
figure {{ margin: 0; text-align: center; }} figure img {{ display: block; image-rendering: auto; max-width: 100%; }}
figcaption {{ font-size: 13px; color: #b9bac2; margin-top: 4px; }}
.botones {{ display: flex; flex-wrap: wrap; gap: 8px; }}
button {{ background: #3a3d47; color: #fff; border: 1px solid #555a66; border-radius: 6px; padding: 7px 12px; font-size: 14px; cursor: pointer; }}
button.elegido {{ background: #3f8f5a; border-color: #6fcf8f; }}
textarea {{ width: 100%; box-sizing: border-box; margin-top: 8px; min-height: 34px; background: #1e1f24; color: #e8e8ea; border: 1px solid #444; border-radius: 6px; }}
#cuenta {{ position: sticky; top: 0; background: #1e1f24; padding: 6px 0; }}
</style></head><body>
<h1>Revisión de animaciones</h1>
<p id="cuenta"></p>
{''.join(tarjetas)}
<script>
const total = {len(casos)};
const resp = {{}};
// solo los casos de esta página: respuestas.json guarda también las de rondas anteriores
const cuenta = () => `${{[...document.querySelectorAll('.hecho')].length}} de ${{total}} respondidos (se guardan solos)`;
async function guardar(caso) {{
  await fetch('respuesta', {{method: 'POST', headers: {{'Content-Type': 'application/json'}}, body: JSON.stringify({{caso, ...resp[caso]}})}});
  document.getElementById(caso).classList.toggle('hecho', !!resp[caso].valor);
  document.getElementById('cuenta').textContent = cuenta();
}}
fetch('respuestas.json').then(r => r.ok ? r.json() : {{}}).then(previas => {{
  for (const [caso, r] of Object.entries(previas)) {{
    resp[caso] = r;
    document.querySelectorAll(`button[data-caso="${{caso}}"]`).forEach(b => b.classList.toggle('elegido', b.dataset.valor === r.valor));
    const t = document.querySelector(`textarea[data-caso="${{caso}}"]`); if (t && r.nota) t.value = r.nota;
    document.getElementById(caso)?.classList.toggle('hecho', !!r.valor);
  }}
  document.getElementById('cuenta').textContent = cuenta();
}}).catch(() => {{}});
document.querySelectorAll('button[data-caso]').forEach(b => b.addEventListener('click', () => {{
  const c = b.dataset.caso; resp[c] = {{...(resp[c] || {{}}), valor: b.dataset.valor}};
  document.querySelectorAll(`button[data-caso="${{c}}"]`).forEach(x => x.classList.toggle('elegido', x === b));
  guardar(c);
}}));
document.querySelectorAll('textarea[data-caso]').forEach(t => t.addEventListener('change', () => {{
  const c = t.dataset.caso; resp[c] = {{...(resp[c] || {{}}), nota: t.value}}; guardar(c);
}}));
</script></body></html>"""


class Manejador(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Sin respuestas aún, un objeto vacío y no un 404 en la consola (QA, H13).
        if self.path.split("?")[0].rstrip("/").endswith("respuestas.json") and not os.path.exists(
                os.path.join(self.directory, "respuestas.json")):
            self.responder(b"{}")
            return
        super().do_GET()

    def responder(self, cuerpo):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        if self.path.rstrip("/").endswith("respuesta"):
            n = int(self.headers.get("Content-Length", 0))
            r = json.loads(self.rfile.read(n))
            ruta = os.path.join(self.directory, "respuestas.json")
            todas = json.load(open(ruta)) if os.path.exists(ruta) else {}
            caso = r.pop("caso")
            todas[caso] = r
            json.dump(todas, open(ruta, "w"), ensure_ascii=False, indent=1)
            # Un 200 con cuerpo: un 204 lo cuenta el navegador como petición abortada.
            self.responder(b"{}")
        else:
            self.send_error(404)

    def log_message(self, *a):
        pass

