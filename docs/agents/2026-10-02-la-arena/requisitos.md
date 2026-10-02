# La arena: crear unidades y hacerlas luchar

## Petición literal (02-10-2026)

> «Ahora crea una pagina de testing para que pueda crear unidades y hacerlas
> luchar, puediendo elegir si cada una la manejo yo o una IA. Que pueda ver la
> imagen de cada unidad y sus atributos y modificarlos para poder probarlos. Un
> boton para guardar que cree un archivo con los atributos de forma que luego se
> pueda implementar en el juego»

## Decisiones del usuario

- **Unidades:** las de las cinco facciones (las hojas de `assets/unidades/`). No
  tienen cifras: se parte de unas por defecto y se ajustan. Las del catálogo actual
  pueden servir de plantilla.
- **Guardar:** en el repo, vía `pnpm dev` → `data/borradores/unidades.json`; al
  abrir se recarga lo guardado.
- **Habilidades:** asignables pero inertes (se guardan, «sin efecto todavía»); en
  la pelea solo actúan los rasgos del motor.

## Criterios de aceptación

1. Una página `/arena/` en el servidor de desarrollo donde se montan dos bandos con
   unidades de las cinco facciones, viendo la imagen de cada una.
2. Cada unidad enseña sus atributos y se pueden cambiar; los cambios valen en la
   batalla siguiente.
3. Para cada unidad del bando se elige «Yo» o «IA», y la batalla respeta esa
   elección unidad a unidad, con los mismos controles de batalla del juego.
4. «Guardar» escribe `data/borradores/unidades.json` con los atributos, en un
   formato que se pueda pasar al catálogo; se valida antes de escribir.
5. El juego no cambia: `pnpm banco` con el ancla igual.

El plan aprobado por el usuario está en `plan.md` (sigue sus decisiones de diseño).
