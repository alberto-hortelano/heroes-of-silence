# Requisitos — pueblo-en-la-puerta

Tarea: `2026-11-11-pueblo-en-la-puerta`. Issues: 305. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #305 — Plan del agente: acepta un pueblo de región en el acceso de la puerta de una ciudad

> `problemasDeRecintos` solo mira el 3 × 3, así que un plan del agente puede poner un pueblo de región en el acceso de la puerta de una ciudad. El generador nunca lo hace (QA, vuelta 2, H5).
> Qué hacer: que la validación del plan rechace un pueblo en el acceso de una puerta, con la misma regla que usa el generador, y dicha para el agente.
> 
> De la tarea «Ciudades y pueblos fuera de los nodos, y la ocupación» (`docs/agents/2026-11-05-ciudades-en-su-region/`, rama `claude/nifty-kare-5bc168`, sin fusionar).

## Criterios de aceptación

1. `validateMapPlan` rechaza un plan del agente que pone un pueblo de región en el acceso de la puerta de una ciudad, con la misma regla (la misma función) que usa el generador para no hacerlo, no una copia.
2. El motivo lo entiende el agente (en el idioma de los motivos del plan; ver cómo se le dicen hoy los demás problemas del plan).
3. Test que construye ese plan y ve el rechazo (visto morder), y que un plan válido parecido sigue valiendo.
4. `pnpm banco` no cambia (el generador no debe cambiar sus partidas); si cambia, se explica por qué.

## Fuera de alcance

#304, #306, #307 (otros fallos del generador).

## Contexto

Área: `docs/areas/mapa.md`. `problemasDeRecintos` (`map/recinto.ts`), `pueblosEnElMuro`/`ciudadesDeRegion` (`map/generar/poblar.ts`), `validateMapPlan` (`map/generar/validar.ts`). Presupuesto de pruebas: solo los tests de lo que se toca; `pnpm banco` una vez.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance: es la misma regla del generador, dicha una vez y aplicada a lo que el plan puede poner donde no debe. Los criterios de arriba quedan **sustituidos** por estos:

**Contexto corregido**: la rama `claude/nifty-kare-5bc168` está fusionada en main (`b5599489`); el hallazgo es H5 de `docs/agents/2026-11-05-ciudades-en-su-region/qa.md`.

**Alcance**: la regla del generador es «nada en el recinto ni en los accesos de una ciudad: son su entrada» (`vestir-la-red.ts`, `marcarElRecinto` + `sinUsar`), y vale para pueblos, monstruos y cofres por igual. El plan del agente la cumple para los tres. Los asaltantes quedan fuera (tienen su regla).

1. `validateMapPlan` rechaza un pueblo de región, un monstruo o un cofre a `HASTA_LOS_ACCESOS` o menos de una ciudad. La pregunta «¿está en el 5 × 5 de una ciudad?» vive en **un** sitio, y la leen el plan (pueblo del muro, pueblo de región y objetos) y el vestido del generador, que deja de llevar su copia. La regla del borde de `puebloDelMuroBlocker` sigue siendo solo del pueblo del muro.
2. El motivo dice que el acceso es la entrada de la ciudad (no «un nodo no puede ir ahí»). La prosa de `contract/peticion-de-mapa.ts` («nada dentro de un recinto») dice también lo de los accesos, con la constante, no con un número tecleado.
3. Hay un test por cada clase de objeto (pueblo de región, monstruo, cofre) en un acceso, que se rechaza, y otro con el mismo objeto a 3 casillas, que vale. Hay que verlo morder. Hay que pasar los tests de plan que ya llaman a `validateMapPlan` (`pueblos-en-un-nodo`, `recinto-nucleo`, `lado-del-generador`, `asaltantes`, `regiones`) y `pnpm mundo validar ejemplo` y `prueba`.
4. `pnpm banco` no cambia. Si se hace después de #304, se compara con su ancla.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` tal cual. Pregunta abierta resuelta: **sí** se toca `contract/formato.ts` (`RESPONSE_FORMAT.map_generate`), en sus líneas del mapa; #313/#317 tocan otras líneas de ese fichero y el conflicto de texto, si sale, lo resuelve el coordinador al fusionar. El 3 × 3 de las ciudades del muro escrito a mano va a un issue aparte.
