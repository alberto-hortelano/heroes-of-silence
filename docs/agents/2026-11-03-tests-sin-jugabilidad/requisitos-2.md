# Vuelta 2 — las reglas que se quedaron sin test, otra vez con test

## Petición literal

> «Sí, reescríbelos» (03-11-2026), a la pregunta «¿Reescribo con datos propios los tests de las reglas
> que se quedaron sin cubrir?», tras borrar 368 tests (`b0e0ba5f`, `informe.md`).

## Qué se reescribe

Las reglas que el borrado dejó **sin ningún test** (`informe.md`, «Reglas que se quedan sin test»):

1. La marcha del grupo (`marchaDe`, `slowestSpeed`): el más lento con el héroe incluido, el caballo de
   silla que solo sube la marcha si lo llevan todos, Logística.
2. La marcha que se para al ver un grupo que la emboscaría (#130, `vigiaDeLaMarcha`, `march_halted`) y su
   revisión cuando la marcha gana fuerza (H1/H2); la ruta que avisa.
3. El id de un héroe contratado no se repite (#126).
4. La carga montada (fuerza de la montura + la de la lanza, `cargaMontada`).
5. Los efectos de la rueda: Defensivo hasta que empiece su turno, Romper guardia por éxito, la Finta
   que deja andar tras golpear (#263), y el parte que cuenta el cruce.
6. Los modificadores de los dos en la cabecera de la rueda.
7. Un arma a dos manos sobre un escudo de serie (H4).
8. «A distancia» con el puntero: el motivo de la granada fuera de alcance y del arco.
9. Los poderes de la tropa en la batalla del mapa (la persona usa Curar).
10. `expectedDamage` con la armadura.
11. «Sin el catálogo del juego»: un cuerpo de criatura no vale.
12. El defensor que despliega sin ver al atacante, en la partida.

Las «muy mermadas» del informe, no (fuera de alcance).

## Cómo

- Cada test prueba **una regla**, no jugabilidad: nada de qué decide la IA, equilibrio ni frecuencias.
- **Datos propios**: unidades, piezas y cuerpos construidos en el test, o del catálogo **con lo esperado
  derivado** de él por las funciones del núcleo (nunca una cifra, un nombre ni un id elegido porque hoy
  pasa algo, escrito a mano).
- Las versiones borradas están en git (`git show a07d8945:test/<x>.test.ts`): sirven para saber qué
  miraban, no para copiarlas.

## Criterios de aceptación

1. Cada una de las 12 reglas tiene al menos un test que muerde: roto a mano el código de la regla, se
   pone rojo (se dice cómo se rompió).
2. Ningún test nuevo se rompe con las perturbaciones válidas de `perturbar.py`.
3. `pnpm typecheck` y `pnpm lint` en verde; los ficheros tocados, en verde.
4. Un `informe-2.md` con cada regla, su test, cómo se vio morder y lo que no se pudo cubrir y por qué.
