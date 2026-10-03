# Requisitos: #136 — el Y Bot con arco y ballesta en 8 direcciones

Petición del usuario (03-10-2026): «Ponte con el #136». Plan aprobado por el usuario, que sigue.

## Contexto

Hoy los arqueros, ballesteros y arcabuceros se pintan con el Y Bot de `espada-escudo`, porque no hay render de arco ni de ballesta en 8 direcciones. Solo existen los de una dirección: `_poses/arco.png` y `ballesta.png`, sin arma visible.

Al usuario se le prometió en el ciclo de las 8 direcciones que esas unidades usarían el arma que llevan en cuanto existiera el render. Este ciclo lo cumple: añade los juegos `arco` y `ballesta` con sus 6 acciones en 8 direcciones y se los asigna a las unidades que los llevan.

Cómo se renderiza hoy (no hay Blender):
- `tools/art/poses.ts --8d <juego>` copia `../sprite-forge` (three.js en Chrome sin pantalla, swiftshader), lo parchea como texto y lo lanza con los FBX de Mixamo de `../ne-fan/assets/characters`. Las dos dependencias están en la máquina.
- `pnpm taller derivar-poses` vuelve a escribir `assets/unidades/_poses/atlas-8d.json`.
- Las armas son geometría three.js inyectada (`crearAtrezo` y `colocarAtrezo`, en poses.ts:139-291). Siempre van en la mano derecha.
- La pose de disparo ya existe para una dirección: `rangedPose` en `tools/art/ybot-a-distancia.ts`. Tiene dos variantes:
  - arco: tensar y soltar;
  - ballesta: subirla al hombro y disparar.

Se ejecuta con el ciclo `/feature` (memoria del proyecto). El crítico se salta porque el usuario ha nombrado el issue. El orden es:
1. arquitecto;
2. revisión mía del plan;
3. ingeniero;
4. /simplify;
5. QA.

## Diseño

### 1. Juegos nuevos en `JUEGOS_DE_ARMAS` (`tools/art/poses.ts`)

**`arco`:**
- `ataque: 'bow'`, reposo `idle4`.
- Atrezo nuevo con un **arco en la mano izquierda**: una curva de tubo con su cuerda, que en el disparo se tensa hacia la mano derecha si sale barato.
- La mano derecha va vacía. Se puede añadir una aljaba a la espalda si es barato.

**`ballesta`:**
- `ataque: 'crossbow'`.
- Atrezo con **culata en la mano derecha y arco transversal**. En el disparo, la mano izquierda se coloca en la culata con la IK que ya usa `dosManos`.

**Cambios en `crearAtrezo` y `colocarAtrezo`:** se extienden con un tipo de arma a distancia. Así no se le aplican las reglas de inclinación de la espada y se puede anclar a la mano izquierda. El campo `Atrezo.espada` deja de ser obligatorio para estos dos juegos, con una unión discriminada y no con un opcional suelto.

**Arreglar el fallo de fotogramas** (poses.ts:886). En 8 direcciones, el clip `bow`/`crossbow` a 12 fps da 12 fotogramas, pero `rangedPose` usa `frame % 6`, y las 7 columnas mezclan dos ciclos. La curva de tensado pasa a depender del **progreso del clip** (0..1) y no del índice módulo 6. Así sirve para 1 y para 8 direcciones, y desaparece el caso especial `total = 6` de la L514.

**Reposo, marcha, carga, daño y muerte** siguen siendo los clips de espada y escudo, con el arma colocada de forma creíble. En la muerte el arma cae con la mano. Esto hay que verlo en `giro.png` y en `pnpm taller vista-8d`.

### 2. Render y atlas

Se ejecuta:
```bash
npx tsx tools/art/poses.ts --8d arco
npx tsx tools/art/poses.ts --8d ballesta
pnpm taller derivar-poses
```

Esto genera:
- `_poses/arco-8d/` y `ballesta-8d/`, con `d0..7-{a,b}.png`, `giro.png` y `poses.json`;
- `atlas-8d.json` con las dos claves nuevas.

`JuegoDelYBot` (personajes.ts:168) y `JUEGOS_EN_8D` se amplían solos.

### 3. Asignación

- **Catálogo**, en `JUEGO_DEL_CUERPO` (`src/client/render/personajes.ts`): `archer` y `ranger` pasan a `arco`. Se quita el comentario de «hasta que haya arco» (L207-208). Los liches siguen con `baston`.
- **Taller**, en `JUEGO_DEL_YBOT` (`tools/taller/unidades.ts`):
  - pasan a `arco`: `esqueleto-arquero`, `elfo-arquero` y `goblin-arquero`;
  - pasan a `ballesta`: `imperio-ballestero`, `imperio-arcabucero` e `imperio-artillero-culebrina` (igual que en una dirección, donde la ballesta ya hacía de arcabuz);
  - `elfo-explorador` sigue con su juego actual, porque pelea con cuchillos;
  - se actualiza el comentario de la regla (L544-558).
- **Lo que sigue igual:** un arquero en cuerpo a cuerpo usa la misma fila `attack` (el disparo), porque el motor tiene un solo clip de ataque. Un clip de golpe propio para los tiradores se apunta como issue si se ve mal.

### 4. Flecha y suelta (cliente, opcional, lo decide el arquitecto midiendo)

Hoy el proyectil sale en t=0 (`anim.ts` L495-500) y el arco suelta a mitad del clip. Si se ve desacompasado, el proyectil arranca en la fracción de suelta. Esa fracción va como dato del clip o como constante única, no como un número suelto. Si cambia el ritmo del espectador, los plazos de `capturas` se vuelven a medir.

### 5. Documentación y tests

**Tests:**
- `test/personajes.test.ts`:
  - L44: `archer` pasa a `arco`;
  - L73-81: la lista pasa a 9 juegos;
  - L111: el ejemplo de juego sin poses deja de ser `'arco'` y pasa a ser un nombre inventado.
- `test/arena.test.ts` L313-315: se esperan `arco` y `ballesta`.
- `test/taller-8d.test.ts`: los sha de las hojas nuevas.
- Un test nuevo para la curva de tensado por progreso: monótona hasta la suelta y la misma en 1 y en 8 direcciones.

**Documentación:**
- `docs/art/taller.md`: la tabla de perfiles, y una línea en «Unidades en 8 direcciones».
- CLAUDE.md, en «La arena» y en «Toda figura tiene 8 direcciones»: se quita «arqueros incluidos, hasta que haya arco en 8 direcciones».

## Ficheros clave

- `tools/art/poses.ts`, `tools/art/ybot-a-distancia.ts`
- `tools/taller/unidades.ts`, `tools/taller/poses-8d.ts` (solo se ejecuta)
- `src/client/render/personajes.ts`, y `src/client/anim.ts` si entra el punto 4
- `assets/unidades/_poses/{arco,ballesta}-8d/`, `atlas-8d.json`
- los tests del punto 5, `docs/art/taller.md` y `CLAUDE.md`

## Verificación

1. `pnpm verify` en verde.
2. `pnpm banco` con el ancla igual (`1b90bfd9…`), porque el cambio es solo de cliente y taller.
3. `pnpm capturas` sin errores.
4. En el navegador, en un puerto propio (`pnpm arena`):
   - montar arqueros y ballesteros, girarlos por las 8 direcciones y verlos disparar, recibir y morir;
   - en la partida (`pnpm dev`, `?seed=N`), una batalla con `archer`/`ranger`;
   - capturas en `docs/agents/2026-10-03-arco-y-ballesta/capturas/`.
5. `giro.png` de los dos juegos, revisado a ojo: el arma está en la mano en las 6 acciones y las 8 direcciones.
