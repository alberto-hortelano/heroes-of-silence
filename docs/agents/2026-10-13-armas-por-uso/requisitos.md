# Cada arma para lo suyo (arena)

## Petición literal (13-10-2026)

> Como le pongo dos armas a un personaje? Como le pongo arma secundaria a los arqueros? El jinete
> elfico tiene lanza, espada y arco

## Lo que hay hoy (lo comprobó el coordinador)

- Cuatro huecos: `HUECOS = ['arma', 'armadura', 'accesorio', 'escudo']` (`src/core/types.ts:307`).
  En `arma` cabe una pieza y sus cifras se suman al cuerpo (`conEquipo`) para todo: disparar y
  pegar.
- **Arqueros** (perfil `arco`): llevan `arco` en `arma`. Cuerpo a cuerpo pegan con las cifras del
  arco.
- **«Orko con dos armas»**:
  - en el taller (`tools/taller/unidades.ts:460`) tiene perfil `dos-manos`;
  - en el mapa de perfiles de la arena (`:890`) tiene `espada-escudo`;
  - nada lo hace pelear con dos armas.
- **Jinete élfico** (`elfo-jinete`):
  - el arte y la descripción llevan lanza para la carga, arco y espada;
  - en `KIT_DEL_PERFIL` (`src/core/arena.ts:287`) solo `montado-lanza`: lanza de jinete y barda,
    con el rasgo `charge`;
  - el taller dice `montado-arco` en un sitio (`:886`) y `montado-lanza` en otro (`:410`).

## Decisiones del usuario (13-10-2026)

- **Cada arma para lo suyo**: un arma cuerpo a cuerpo y un arma a distancia, y la lanza para la
  carga.
  - El arquero dispara con el arco y pega con una daga o una espada corta.
  - El jinete carga con la lanza, pega con la espada y dispara con el arco.
  - Las cifras de cada golpe son las del arma que se usa en ese golpe.
- **Solo la arena.** El juego, el botín, la armería, el agente y el banco no cambian. Adoptarlo en
  el juego es otra tarea.

## Criterios de aceptación

1. En la arena, una unidad puede llevar a la vez:
   - un arma cuerpo a cuerpo;
   - un arma a distancia (con disparos);
   - un arma de carga (la lanza).

   Cada una en su hueco, en el editor de equipo y en la ficha.
2. **Al disparar** cuentan las cifras del arma a distancia. **Al pegar cuerpo a cuerpo**, las del
   arma cuerpo a cuerpo; si no hay, se pega sin arma, con el cuerpo, y la ficha lo dice. **Al
   cargar** (golpe con carga), las de la lanza si la lleva; si no, las del arma cuerpo a cuerpo.
   El contraataque se da con el arma cuerpo a cuerpo.
3. La ficha y la previsión de daño enseñan las cifras de cada arma: dónde se usa cada una y qué
   daño hace con ella.
4. El arquero de la arena lleva por defecto el arco y un arma corta para el cuerpo a cuerpo. El
   jinete élfico lleva lanza, espada y arco, y su perfil es uno solo y coherente. Las demás hojas
   pelean como hoy, salvo donde el cambio sea intencionado y quede dicho.
5. Las reglas que dependen del arma siguen valiendo con varias armas:
   - el arma a dos manos no admite escudo (`manosBlocker`);
   - el castigo del tirador cuerpo a cuerpo;
   - la rueda del golpe (que es cuerpo a cuerpo).

   La regla de las manos solo mira el arma cuerpo a cuerpo y el escudo. Si el arquero lleva el
   arco a la espalda, no le quita el escudo. Esto es una suposición: va en las preguntas abiertas.
6. Siguen leyéndose los enlaces `?montaje=` y los borradores de antes, convertidos si hace falta.
7. El juego no cambia: `pnpm banco` con el mismo hash; el agente no ve los huecos nuevos; guardias
   en `invariantes.test.ts`, vistos morder.

## Fuera de alcance

- El juego (héroes y tropa de la partida), el botín, la armería y el contrato del agente.
- Cambiar de arma a mano en mitad de un turno: se usa la que toca según lo que se hace.
- Arte nuevo.

## Preguntas abiertas (con suposición por defecto)

- **El nivel** (índice de poder sin equipo) no cambia: el equipo no lo mueve.
- **El arma a distancia y el escudo**: el arco a la espalda no impide llevar escudo. Solo cuentan
  las manos del arma cuerpo a cuerpo.
- **El nombre de los huecos.** Suposición:
  - `arma` pasa a ser el arma cuerpo a cuerpo;
  - se añaden `distancia` y `carga`;
  - las piezas de arma declaran para qué sirven (`uso`).

  El arquitecto decide.
- **Una pieza de `arena` del juego cambiada** (la de `data/borradores/equipo.json`) sigue siendo
  posible con los huecos nuevos.

## Decisiones tras el plan (13-10-2026, del usuario)

- **Q1**: espada para el cuerpo a cuerpo y lanza solo para la carga, **para todos los jinetes**, no
  solo el élfico.
- **Q2**: la daga con las cifras inventadas del plan. El arco a la espalda **sí** deja llevar
  escudo.
- **Q3**: se queda la opción por defecto del plan.
