# Ataque y disparo: la séptima acción de las figuras

## Petición literal (usuario, 04-10-2026)

> Otra cosa, hay que añadir una accion mas. Hay que dividir el ataque en dos,
> cuerpo a cuerpo y a distancia, muchos no tendran a distancia pero la mayoria
> de los que disparan tienen un ataque cuerpo a cuerpo, el granadero tendra
> lanzar la granada y sable, los arqueros disparo y daga, etc.

## Decisiones del usuario (misma conversación)

- **Esta sesión lo hace entero**: el contrato (`src/shared/arte.ts`), el
  maniquí y el taller (`tools/art/*`, `tools/taller/*`) y el cliente
  (`src/client/render/personajes.ts`, `src/client/anim.ts` y, si hace falta,
  `src/client/render/batalla.ts`). También se pueden cambiar los tests previos
  que hoy fijan que la suelta del disparo va en `attack`.
- **El arma cuerpo a cuerpo de cada tirador**:

  | Tirador | Cuerpo a cuerpo |
  |---|---|
  | granadero | sable |
  | ballestero y arcabucero | espada corta |
  | artillero (culebrina) | golpea con el botafuego |
  | ingeniero | su martillo |
  | pistolero montado | la espada (`montura.ts` ya tiene el tajo montado) |
  | arqueros (juego `arco`) | daga |

  El mago sigue con su golpe de báculo (`casting`) y no tiene disparo.
- **El Y Bot no es sagrado**: cada unidad puede llevar su propio maniquí
  (`maniqui` en `tools/taller/unidades.ts`, que se renderiza con
  `pnpm taller maniqui <id>` en `_poses/unidades/<id>-8d/`). Se acorta, se
  alarga o se cambia el atrezo para que se parezca a lo que lleva el personaje.
  No se ponen limitaciones innecesarias.

## Criterios de aceptación

1. **Un clip nuevo `shoot`**, a distancia, además de los seis de
   `CLIPS_DE_FIGURA`. Es opcional: solo lo tiene quien dispara. Una figura sin
   `shoot` sigue siendo válida.
2. **`attack` es siempre cuerpo a cuerpo**, también en quien dispara.
3. **Las poses del Y Bot**, para cada juego que dispara —`arco`, `ballesta`,
   `granada`, `montado-pistola`— y para cada maniquí propio de un tirador:
   - pintan `attack` con el arma cuerpo a cuerpo de la tabla;
   - pintan `shoot` con el arma de tiro;
   - llevan la curva de disparo de hoy en `shoot`.
4. **La suelta del proyectil** (`suelta`) vive en `shoot`, no en `attack`.
   `atlas-8d.json` y los atlas pintados lo dicen así. La deriva el mismo
   código que hoy y no se escribe a mano.
5. **El taller encarga la acción nueva**:
   - Una unidad que dispara genera la hoja o las hojas que hagan falta para
     `shoot` en sus 8 direcciones, con su referencia de pose.
   - `encolar --ocho` las incluye.
   - El empaquetado y el derivado producen un atlas con `shoot`.
   - Quien no dispara genera exactamente lo mismo que hoy.
6. **El cliente**:
   - pinta un paso `shoot` del núcleo con el clip `shoot` y un paso `attack`
     con `attack`;
   - lanza el proyectil en la suelta de `shoot`;
   - una figura que dispara pero no tiene `shoot` (arte antiguo) cae a `attack`
     sin romperse y sin silencio: si cae, se dice dónde.
7. **Las unidades ya pintadas en 8 direcciones** (templarios e Imperio) siguen
   cargando y animando.
   - Los templarios no disparan: no cambian.
   - Los tiradores del Imperio pueden quedar sin `shoot` hasta que se
     regeneren sus hojas, cayendo al respaldo del criterio 6.
8. **Los tests**:
   - Los guardias que hoy fijan la suelta en `attack` pasan a fijarla en
     `shoot`.
   - Cada guardia nuevo se ve fallar al romperlo a mano.
   - `pnpm verify` acaba en verde.
9. **La arena** (`pnpm arena`) puede mostrar el clip `shoot`, si su panel de
   clips lo permite sin tocar `src/core`.

## Fuera de alcance

- **Generar imágenes.** La regeneración con ChatGPT/Codex la hace el
  coordinador después del ciclo. Nada de fal.ai ni de APIs de pago.
- `src/core/**`, `src/server/**`, `data/**` y `CLAUDE.md`. El núcleo ya emite
  pasos `attack` y `shoot` distintos.
- Las facciones sin arte en 8 direcciones (elfos, orkos, no muertos), más allá
  de que el juego `arco` traiga su daga.
- **Commitear.** Lo aprueba el usuario.

## Contexto

- **El contrato de hoy**:
  - `CLIPS_DE_FIGURA = ['idle','walk','charge','attack','hurt','death']`, en
    `src/shared/arte.ts`;
  - atlas de 6 filas en 2 hojas de 3: `hoja-a` con idle, walk y charge; `hoja-b`
    con attack, hurt y death;
  - celda de 384 y 7 columnas.
- **Dónde se usa**:
  - `tools/taller/derivar.ts`, `empaquetar.ts` y `poses-8d.ts`;
  - `src/client/render/personajes.ts` (`comoDireccion8d`);
  - `src/client/anim.ts`, que pinta los pasos `attack` y `shoot` con el clip
    `attack` (línea ~511), y `msDeSuelta`.
- **Las curvas de disparo** (`bow`, `crossbow`, `grenade`, `pistol`) están en
  `tools/art/ybot-a-distancia.ts`, y `clipDeDisparoDe` en `tools/art/poses.ts`.
- **El maniquí montado** (`tools/art/montura.ts` y `montura/escena.js`) ya hace
  el tajo de espada parado y, con `--pistola`, el disparo.
- **Los tiradores del Imperio con 8 direcciones**:
  - ballestero, arcabucero, artillero-culebrina, granadero, ingeniero y
    pistolero-montado;
  - los maniquíes propios de arcabucero, artillero e ingeniero están en
    `_poses/unidades/`.
- **No tocar sin coordinar**:
  - En el árbol hay trabajo sin commitear del Imperio. Los trabajadores de
    `pnpm taller` están generando hojas en `assets/unidades/` ahora mismo: no se
    tocan esas carpetas, ni la cola, ni se lanzan trabajadores.
  - Re-renderizar poses del Y Bot (`npx tsx tools/art/poses.ts --8d <juego>`,
    `npx tsx tools/art/montura.ts --8d [--pistola]`, `pnpm taller maniqui`) sí
    está permitido: es render local y gratis. Después hay que hacer
    `pnpm taller derivar-poses`.
- La máquina es compartida: nada de matar procesos por nombre.

## Preguntas abiertas (con su suposición)

- **¿Una hoja C de una sola fila para `shoot`, o reorganizar las hojas?**
  Suposición: hoja C de una fila, solo para quien dispara, para no tocar las
  dos hojas que ya están pintadas. Lo decide el arquitecto.
- **¿El respaldo del cliente cuando falta `shoot`?** Suposición: usar `attack`
  con la suelta que tenga. Lo decide el arquitecto, sin perder el aviso.
