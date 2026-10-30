# Requisitos: el flujo de revisión de animaciones (30-10-2026)

## Petición literal

> Tenemos creditos de sobra en chatgpt, inspecciona las animaciones generadas y mira como
> mejorarlas. Necesitamos primero una forma de evaluacion que funcione bien, combina metodos
> automaticos con tus capacidades de vision y las capacidades de vision de chatgpt, busca
> procedimientos y haz experimentos y evalualos. Por ejemplo sacar un esquema de "muñeco de
> palos" de cada frame y ver cuanto se parecen la base y la animacion generada. Tambien hay
> fallos de encuadre en los que los frames no estan bien centrados y el personaje bibra. Y
> algunos fallos de coherencia dentro del personaje. Tu objetivo es probar varios metodos de
> evaluacion y las correciones que se pueden pedir al modelo para diseñar un workflow que
> permita evaluar las animaciones y generar instrucciones e imagenes de referencia para
> mejorar las animaciones. No escatimes en el uso de agentes para evaluar, no confies en
> metodos programaticos, usalos solo como herramientas o apoyo para los agentes y combina tus
> capacidades de vision con las de chatgpt

Durante la sesión el usuario decidió:
- **El alcance:** los experimentos y el flujo, implementado y probado en el piloto. El
  catálogo entero, después.
- **El ML local:** permitido en un entorno `uv` aislado en `.cache/vision/`.
- **El maniquí:** «Clips hacia delante». `walk (2)` y `run (2)` andan hacia atrás y se
  cambian por `walk` y `run`; se vuelven a renderizar esos maniquíes y se repintan sus
  hojas A.
- **«Sí, primer paso»:** el flujo empieza revisando el propio maniquí.
- **«Sí, primer paso»:** el flujo empieza revisando el propio maniquí.
- **En el visor del maniquí:**
  - guardia `idle` → `block_idle`;
  - ligeros `idle_look_around` → `idle4`;
  - ataque `quick` → `precise`;
  - `heavy` a dos manos → `precise`;
  - `slash4` → `precise`.

  Ya está cambiado en `unidades.ts` y `poses.ts`, y los 45 maniquíes se renderizan de
  nuevo.
- **«En cualquier momento me puedes pedir que yo compruebe algo visualmente»:** el
  visor animado (`visor.py`) es parte del flujo.

Lo medido está en `experimentos.md`, en esta misma carpeta.

## Criterios de aceptación

1. **El esqueleto del maniquí como dato del taller.** `pnpm taller maniqui <id> --huesos`
   escribe, por hoja, el esqueleto proyectado de cada celda y su posición en el mundo. Las
   hojas salen idénticas byte a byte a las de sin huesos. Lo vigila un test.
2. **La revisión del maniquí.** `pnpm taller revisar-maniqui <id>` dice:
   - si una marcha o una carga anda hacia atrás, con el esqueleto en el mundo, no en
     pantalla;
   - si el reposo se mueve más de lo tolerable;
   - en qué fotogramas el arma no se lee: de punta, o detrás del cuerpo solo en unos.

   Un maniquí con avisos de sentido no se manda a pintar: el trabajador lo rechaza
   diciéndolo.
3. **La revisión de lo pintado.** `pnpm taller revisar <id> [dN…]` deja por clip los
   paneles (tira, superposición de muñecos, encuadre con piel de cebolla, coherencia con el
   giro, bucle) y las cifras de apoyo, y lanza el jurado de ChatGPT (`codex exec` con
   `rubrica.schema.json`).
4. **Una skill, `/revisar-animaciones <id>`,** que conduce el flujo:
   1. el maniquí;
   2. el jurado de Claude (subagentes) junto al de ChatGPT, con la **unión** de sus
      hallazgos: los dos se equivocan en cosas distintas, y la unión pasa del 86 % al 95 %;
   3. el árbitro (Claude y ChatGPT);
   4. el visor para la persona con lo que está en disputa;
   5. las correcciones;
   6. la comparación a ciegas.
5. **La corrección del encuadre (C1)**, sin el modelo: cada fotograma se mueve para que el
   tronco siga la trayectoria del maniquí en x y en y. Es lo que eligió el usuario en el
   visor (tabla en `experimentos.md`). Se aplica al derivar, o se escribe en la hoja, según
   decida el arquitecto. Lo vigila un test con un desplazamiento fabricado.
6. **La corrección de la pose y la coherencia es una selección, no una receta**: ninguna
   gana siempre (`experimentos.md` §7). Por hoja se piden varias versiones:
   - otra tirada;
   - `pose-esqueleto` con el aviso del giro;
   - esa misma, más las instrucciones del jurado y las notas del arma.

   Entra en `assets/` la que gana a ciegas a la de ahora en los dos órdenes
   (`comparar.py`). Si ninguna gana, se queda la de ahora y se dice.
7. **El empaquetado no tira una hoja buena**: cuando cuenta mal las figuras (filas que se
   tocan por un arma alta, que falló 3 de unas 20 hojas), corta el crudo por su rejilla
   antes de fallar.
8. **El piloto:** con el flujo, se vuelven a pintar las hojas cuyo maniquí cambió en tres
   unidades de juegos distintos (caballero de la muerte, templario de escudo y elfo
   arquero). Se revisan y se enseñan al usuario en el visor antes de dar nada por bueno. El
   resto del catálogo (unas 570 hojas) lo decide el usuario con el piloto delante.

## Fuera de alcance

- Pasar el flujo por el catálogo entero (50 unidades y 22 NPC) más allá del piloto.
- Las unidades montadas y su Y Bot de juego (`montado-*`): no tienen maniquí propio.
- Equilibrio y jugabilidad.

## Preguntas abiertas

- ¿C1 se hornea en la hoja o se guarda como desplazamiento por celda en `atlas.json`?
  Por defecto, en la hoja: el cliente no cambia.
- ¿Cuántas versiones por hoja? Por defecto tres (otra tirada, esqueleto y todo): el gasto
  es de la suscripción, y el usuario tiene «creditos de sobra».

## Decisiones del usuario sobre el plan (30-10-2026)

- **Plan:** «Sí, adelante».
- **Selección por hoja entera** («Hoja entera»): no se mezclan clips de versiones con escala
  distinta.
- **Se retiran** `experimento.ts`, `evaluar.ts` (con el borde rojo de `vista-8d`) y las
  `.mezcla.png` («Sí, retirar»).
