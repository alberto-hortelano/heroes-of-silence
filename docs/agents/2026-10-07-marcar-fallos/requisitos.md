# Requisitos — marcar fallos del mapa para revisión

## Petición literal
> «Pon alguna forma de marcar fallos en los mapas para que los pueda pasar para revision»

Decisiones del usuario (07-10-2026):
- **Dónde:** «Cliente (pnpm dev)». No van ni el espectador ni el taller.
- **Cómo llegan:** «Fichero en el repo». Cada marca se guarda en disco, sin commitear, con la semilla, la casilla, el zoom, la nota, un recorte de la pantalla y los sprites que hay en ese punto. El usuario dice «revisa las marcas», el coordinador las lee y luego las da por resueltas.

## Contexto
- **Los fallos que se buscan son visuales del escenógrafo:** caras lisas, bordes rectos, puentes mal casados, sprites que tapan sendas. Hasta ahora llegaban como capturas sueltas y descripciones a mano.
- **Lo que pinta el mapa:** el escenógrafo (`render/escenario/`, `componer` con la semilla de la partida) pinta el suelo en un Worker y los volúmenes en cada fotograma. Una casilla tiene sprites con su clase, su hoja o pieza, su caja y su tono.
- **Contratos:**
  - todo el marcado pasa por `html.ts`;
  - la lógica, en `core`;
  - el cliente solo pinta;
  - **nada llega al navegador que no deba:** la marca es una herramienta de desarrollo, y en `vite build` no debe quedar ni el endpoint ni nada que escriba en disco;
  - fail-loud.
- **La máquina es compartida:** sin puertos fijos nuevos. Lo que escribe en disco lo hace el servidor de Vite de `pnpm dev`, con un middleware de desarrollo.

## Criterios de aceptación
1. **En el cliente** (`pnpm dev`), una tecla y un botón discreto activan el modo «marcar fallo».
   - En ese modo, un clic en el mapa no mueve al héroe: marca ese punto y abre un cuadro para escribir la nota.
   - Escape cancela.
   - Se ve qué punto se marcó.
2. **Al guardar,** se escribe en disco, en una carpeta del repo ignorada por git (por ejemplo `.cache/marcas/` o `docs/revision/marcas/`; lo decide el arquitecto), una marca con:
   - fecha;
   - semilla y día;
   - casilla y punto exacto en coordenadas del mundo;
   - zoom y tamaño de pantalla;
   - la nota;
   - un PNG recortado alrededor del punto, a la resolución de pantalla;
   - **qué hay ahí:** los sprites del escenario cuya caja cubre el punto o su casilla (clase, pieza u hoja, módulo, caja, tono), el terreno, el nivel, si hay cara, rampa, ladera o puente, y el objeto o nodo.
3. **Después se puede reproducir:**
   - con `?seed=N` y los datos de la marca, el mismo sitio se puede volver a ver;
   - `pnpm taller escenario N` u otra orden documentada saca ese mismo recorte desde la marca.
4. **El coordinador puede listar y leer las marcas pendientes, y darlas por resueltas:**
   - una orden o un fichero índice, con estado y con la referencia a la issue o al commit que la resolvió;
   - el usuario no tiene que tocar ficheros.
5. **En `vite build` no queda nada de esto,** ni el middleware ni el botón. Se comprueba.
6. **Comprobaciones:**
   - `pnpm verify`;
   - `pnpm banco` igual, porque no se toca el núcleo;
   - el navegador con Playwright sin pantalla: marcar dos fallos, ver que se escriben y reproducir uno;
   - `pnpm capturas` sin errores al cerrar.

## Fuera de alcance
- El espectador, el taller y la arena.
- Subir las marcas a GitHub.
- Marcas de fallos de reglas, como batallas o IA: solo el mapa de aventura.

## Preguntas abiertas, con su suposición por defecto
- **La tecla:** una que no use ya el cliente. Hay que mirar los atajos actuales.
- **Varias marcas en una sesión:** sí, cada una en su fichero.
- **Niebla:** se marca lo que se ve. Con «Ver mapa entero» se puede marcar todo.

## Punto de control (07-10-2026)
El usuario aprueba `plan.md` tal cual: «Adelante».
