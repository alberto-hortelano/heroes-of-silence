# Requisitos — #171, masas de roca con cumbre y valle

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Encargos anteriores del usuario que siguen en pie: que la repetición no se note; evitar bordes rectos.

## Contexto
- **Issue #171**, de la auditoría visual. La auditoría, con recortes, está en /tmp/claude-1000/-home-al-code-heroes/3fde2e67-6d95-4c33-b554-bc6eb38aae58/scratchpad/auditoria/ (defectos.md, entrada 9, y `recortes/10-alfombra-de-roca-s1.png`).
- **Las masas** (montaña, picos) se colocan en `src/client/render/escenario/` (`colocar.ts`, `esparcir.ts`); mira cómo se rellenan hoy y con qué escala.
- **Los límites que no se tocan:** el presupuesto de volúmenes (`topeDeAlejar`, ≤ 2 000 volúmenes a la vista, `PIXELES_DEL_MAPA`) y los fps al tope de alejar.
- **En paralelo, en otros worktrees:**
  - #159 toca `ponerPared`, las caras y `relieve.ts`;
  - #161 toca el generador del núcleo (`vestir.ts`).
  - No toques esas zonas.

## Criterios de aceptación
1. **Una región de montaña o picos se lee como un macizo**, con módulos mayores hacia el interior (la distancia al borde de la región) y menores en las estribaciones. Quizá también algún claro o valle. Sin arte nuevo, salvo que sea imprescindible: en ese caso se dice y se apunta en `docs/art/peticiones.md`.
2. **Capturas antes y después** de s1 (22-31, 2-11), s57 (28-33, 13-17) y s34 (la masa roja del centro), a zoom medio y al tope de alejar.
3. **El número de volúmenes y los fps al tope de alejar** no empeoran de forma apreciable. Se mide.
4. **`informe.spritesSobreSenda`** y los demás contadores del informe siguen a 0; los picos no tapan sendas ni objetos.
5. **El banco no cambia**: es solo el cliente.
