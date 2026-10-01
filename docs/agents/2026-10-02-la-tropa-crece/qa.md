# QA — La tropa crece, ciclo A (sin commitear)

Validado contra `requisitos.md`: criterios 1-5 y 7-9, y las decisiones finales del
usuario (ciclo partido A/B, tope 5 solo de la tropa, escala única con el héroe
naciendo en 5, `NuevaJugabilidad.md` fuera del repo con el catálogo en
`data/habilidades.json`, frecuencia de veteranos aceptada). El criterio 6 es del
ciclo B y no se evalúa. No se ha tocado código; los guiones de sonda viven en el
scratchpad de la sesión, fuera del repo.

## Comprobaciones de máquina (salida real, de esta sesión)

| Orden | Resultado |
|---|---|
| `pnpm verify` | exit 0 · `Tests 709 passed (709)` · 6,56 s · lint: el `info` de siempre (`notas.ts:381`) |
| `pnpm banco` | `sha256 0c8fc759950dfd95e11c22bdf7ad7ca33b523c47bbaa3cddb6a8cd569544bc45` · 62 531 líneas · `ancla: igual` · 0/200 sin terminar · 9/18/35 días · 4 145 ms |
| barrido 40 | `sin terminar: 0/40` · 9/18/35 · peor batalla 9 rondas |
| barrido 1000 | `sin terminar: 0/1000` · 9/17/54 · peor batalla 10 rondas |
| `tools/qa/veterania.ts 1000` | 2→9.35 · 3→3.88 · 4→1.69 · 5→0.51 por partida · 207/1000 con algún 5 · **59 veteranos de 5 vivos en su base (43 partidas)** · 4,31 subidas de héroe por partida · niveles finales 5:301 … 15:2 · 9/17/54 días · j0 484/1000. **Idéntico a lo publicado en `implementacion.md`.** |
| `pnpm qa` | exit 0 · `31 veredictos, 31 entraron, 0 descartadas` · 1 mapa, 6 turnos, 25 decisiones de batalla · las 6 consultas · 3 `recruit` rechazados por guarnición llena (legítimos, del guion) |
| `pnpm capturas` (Playwright) | exit 0 · `2 veterano(s) en el panel — Arquero nivel 2, 24 exp; Arquero nivel 1, 18 exp` · `«Arquero · nivel 2» en el campo, 1 galón(es)` · `sin errores en consola` · 87,1 s |
| `tools/datos/habilidades.ts` en copia del scratchpad | 37 habilidades, **JSON byte a byte idéntico** al de `data/` (`diff` vacío). Contadas a mano en la sección del cuaderno: 37 de 37, «Sin flanqueo» (sin guion) incluida |

## Criterios

| Criterio | | Evidencia |
|---|---|---|
| C1 · experiencia = daño quitado × nivel del que recibe; sustituye a la de fheroes2 | ✅ | `herir` (`damage.ts`) es el único que quita vida (golpe, contraataque, disparo, salpicadura, hechizo: 5 llamantes, `applyDamage` sin exportar); acredita `antes − después` (sin sobrante) y solo contra el otro bando. `experienceFor`/`+500` borrados. Escenario propio: héroe que **pierde** una emboscada (semillas 11-15) cobra igual: 220→364/580/588/652/499. |
| C1 · «nivel» definido para criatura, veterano y héroe | ✅ | `UnitInfo.nivel`: catálogo = morada; `cifrasVeteranas` suma veteranía − 1; héroe = su nivel (≥5). Escrito en `data/experiencia.json._comment`, en la prosa del agente y en CLAUDE.md. |
| C2 · una tabla Fibonacci en datos, para tropa y héroe | ✅ | `base 20, incrementos [1,2,3,5]` → 20/60/120/220; el héroe sigue la recurrencia (380, 640…). Validador probado con 13 sondas, todas lanzan con frase (base 0/−20, tope 0, incrementos `[]`/`[0…]`, etc.). |
| C2 · tope 5 solo para la tropa; héroe sin tope | ✅ | Auditoría propia de 1000 partidas: `maxTropa 5`, `troop_level_up` fuera de 2..5: **0**; héroes hasta nivel 15. |
| Escala única: todo héroe nace en 5 con 220, cifras reindexadas | ✅ | Auditoría: `heroesNacenMal 0` en 1000 partidas; `level_up` por debajo del 6: **0**; contratados seguidos desde 5 sin saltos. Agente ve `{"level":5,"experience":220,"nextLevelAt":380}`. Captura: «HÉROE · NIVEL 6», «478 / 640», liderazgo 6/25 (20 + 5). |
| Héroe que salta niveles | ✅ | Auditoría: `levelUpSaltos 0` (cada `level_up` es el anterior + 1 y el último coincide con `nivelDeHeroe`). Test del salto doble 5→7. |
| C3 · la veteranía vive en el individuo y no se pierde ni se duplica | ✅ | Auditoría de 1000 partidas mirando cada ejército y guarnición tras cada turno: **ids duplicados 0, ids que reaparecen tras morir 0, experiencia que baja 0, veteranos en asaltantes 0**. Rendición: el veterano vuelve con su hoja y `batallas` +1 (escenario, semilla 11). Licenciar: `A,B,C` con 50/30/30 → se va C (empate: el último), luego B; el veterano A se queda. |
| C3 · muere → se pierde | ✅ | Emboscada perdida sin rendición: el piquero veterano no vuelve; reaparecidos 0. |
| C4 · cifras por nivel en una sola puerta | ✅ | `cifrasDeCatalogo`/`cifrasVeteranas` usadas por `troopUnit`, `resolveUnit` y `adaptar.ts`; test de contacto entre las dos puertas en verde. |
| C5 · habilidades en datos, inertes, con guardia de nombres | ✅ | Sondas propias contra `validarExperiencia`: nombre inventado, minúscula, espacio final y «Antiinfanteria» sin tilde **lanzan nombrando el fallo**; 3 en vez de 4 y no-lista también. Nadie las lee fuera de `data.ts`. |
| `NuevaJugabilidad.md` fuera del repo; catálogo extraído, no tecleado | ✅ con reserva | Sin trackear y sin tocar (idéntico a su `.backup`, mtime 21:19); el JSON se regenera igual. **Pero no está en `.gitignore`** (hallazgo I1). |
| C7 · el agente ve experiencia y nivel | ✅ (por serializador) / ⚠️ (circuito MCP) | Serializador: `{"level":5,"experience":99999,"nextLevelAt":null}`, `{"level":1,"experience":5,"nextLevelAt":20}`, novato sin campos. Prosa de `RESPONSE_FORMAT` leída en vivo por MCP (`heroes_listen`, servidor arrancado por mí): explica la escala, `veteranLevel` y el orden de `dismiss`. No llegué a ver un veterano en un turno vivo (ver «No probado»). |
| C7 · panel: nivel, experiencia y lo que falta | ✅ | Captura: «Veterano · nivel 2 · 24 / 60 exp», «Nivel 1 · 18 / 20 exp»; ancla de paneles: «Veterano · nivel 5 · 400 exp · nivel máximo». |
| C7 · marca en la figura | ✅ con reserva | Captura `veteranos-02-batalla-galones.png`: una uve dorada sobre la barra del arquero veterano; legible pero pequeña (M2). |
| C7 · la crónica cuenta los ascensos | ✅ | Ancla de paneles: «Un Arquero tuyo sube a veterano de nivel 2», «Un Esqueleto del jugador 1 sube a veterano de nivel 4»; pasa la niebla como `level_up` (test). |
| C7 · `pnpm capturas` lo recorre | ✅ | Pasada «veteranos», semilla 177, exit 0. |
| C8 · la IA despide al novato antes que al veterano | ✅ | Auditoría en 1000 partidas, re-simulando cada `planRecruits` sobre un clon: **3 281 cambios de tropa, 0 que suelten a un veterano de nivel ≥ 2 mientras quede un novato más flojo que el recluta**. 315 (9,6 %) sí sueltan a un veterano, siempre cuando no quedaba novato que valiera. Una primera versión de mi sonda daba 16 «fallos», y eran falsos: se partía el cambio por tipo de criatura. |
| C9 · se mide y se publica; re-anclado una vez | ✅ | Cifras reproducidas exactas (tabla de arriba). Ancla `0c8fc759…` reproducida. Emboscadas IA contra IA: 0 antes y 0 después, ya dicho en la implementación. |
| C9 · verify, barrido 0/40 y 0/1000, qa y capturas en verde | ✅ | Arriba. |
| CLAUDE.md ya no presenta la tabla de fheroes2 como vigente | ✅ | §«El héroe cobra lo que mata»: «**Esa fórmula ya no es la vigente** … Lo de aquí es historia». La lección de la cita falsa pasa a pasado («Aquella tabla se extrajo… se retiraron con La tropa crece»). §«La tropa crece: la experiencia es regla nuestra». Párrafo del guardia de coma flotante con su nota. |
| El cable del espectador sin la hoja | ✅ (código + test) / ⚠️ (navegador) | `stackAlCable` manda `origen.veterania = {id, experiencia}`, sin `ganado`, `oro`, `batallas`, `bajas` ni `heroes`; `adaptar.ts` rehace las cifras con `cifrasDeCatalogo` y lo que no viaja vuelve vacío, y lo dice. La pasada de capturas del espectador da 0 errores de consola, pero sin ningún veterano en el tablero. |

## Hallazgos

**Bloqueantes:** ninguno.

**Importantes**

- **I1 · `NuevaJugabilidad.md` y `NuevaJugabilidad.md.backup` no están en `.gitignore`.**
  El usuario decidió que el cuaderno no se commitea, y hoy eso solo depende de que
  quien haga el commit no use `git add -A`/`git add .`. Para reproducirlo:
  `git check-ignore -v NuevaJugabilidad.md` sale 1 y `git status` los lista como
  `??`. Lo esperado es que el commit del ciclo no pueda llevárselos por accidente.
  Lo arregla el coordinador al commitear: añadiendo los ficheros con nombre, o con
  una entrada en `.gitignore` si el usuario la quiere.

**Menores**

- **M1 · Un docstring desmentido por la medida.** `src/core/hero/experiencia.ts`,
  junto a `UMBRALES`, dice «ningún héroe pasa del 12 en mil partidas». La medida
  publicada de este mismo ciclo da 4 héroes de nivel 13, 4 de 14 y 2 de 15. Es la
  cifra en presente que CLAUDE.md pide no escribir.
- **M2 · El galón es muy pequeño.** En la captura de 1440×900 es una uve de unos
  8 px encima de la barra, junto a la corona del héroe. Se ve si sabes buscarla. En
  nivel 2 a 5 son de 1 a 4 uves; no he visto 4 en una captura real. Si quien
  juega no sabe que existe, se le puede escapar.
- **M3 · Licenciar a un veterano de nivel 5 cuesta un clic y no pide confirmación.**
  Si es el único de su tipo, el −1 va en su fila (ancla de paneles, escena «con
  veteranos»: «Arquero · Veterano · nivel 5 · nivel máximo · −1»). En el ciclo B
  ese individuo es un futuro héroe. Es coherente con la regla, pero un clic se lo
  lleva para siempre.
- **M4 · El panel del héroe enseña solo «478 / 640»**, sin decir qué da el nivel.
  No lo pedía ningún criterio; lo apunto como fricción.
- **Observación, no fallo:** el 9,6 % de los cambios de tropa de la IA licencia a
  un veterano de nivel ≥ 2, siempre porque no quedaba un novato más flojo que el
  recluta. Cumple «lo barato y novato primero». Lo dejo dicho porque, con 59
  veteranos de nivel 5 en mil partidas, la IA también contribuye a que lleguen
  pocos.

## Workarounds usados

- **El circuito del agente con el respaldo procedimental**: contesté `map_generate`
  con un plan vacío a propósito. Es uno de los ocho caminos documentados de
  respaldo y no afecta a nadie.
- **Escenarios con ejércitos puestos a mano** (hoja sintética, héroe colocado en
  la región del asaltante, emboscada sin rendición): son sondas del motor por la
  API pública, igual que en `asaltantes.test.ts`. Lo que juega la persona lo
  cubren las capturas de Playwright y las auditorías de partidas IA contra IA, que
  no tocan el estado.
- **La auditoría de la IA re-simula `planRecruits` sobre un `structuredClone`** al
  empezar cada turno, antes de las contrataciones y las construcciones de ese
  turno. Es una aproximación: no ve los reclutas que entran antes en el mismo
  plan. Eso solo podría esconder algún novato, no fabricar un veterano.

## No probado

- **Un veterano llegando al agente en un turno vivo por MCP.** Arranqué
  `pnpm partida` y `pnpm dev`, conecté el MCP y llegué a jugar la emboscada del
  día 1. Lo dejé: cada `battle_turn` son unos 10 K tokens y hacía falta una batalla
  entera. Lo cubren el test del serializador y mi escenario de
  `serializeAdventureTurn`. `pnpm qa` no comprueba que la veteranía llegue (lo
  dice la propia implementación).
- **El espectador en el navegador con un veterano en el tablero.** Solo está
  cubierto por `espectador.test.ts` y la lectura del código. La batalla de la
  pasada de capturas del espectador no tiene ninguno.
- **El personaje veterano en partida.** Solo existe en tests: en las partidas de
  estrategia no hay personajes (auditoría: 0 personajes en 1000 partidas).
- **El equilibrio de las emboscadas contra la persona.** IA contra IA siguen en 0.
- **Lo que queda fuera de alcance por decisión**: la tropa que se hace héroe
  (ciclo B), el equipo, #115 y la identidad desde el reclutamiento. No los evalúo.

Procesos: `pnpm partida` (PGID 711043) y `pnpm dev` (PGID 711044) los arranqué yo
y los maté por su grupo. Después, 3100, 9880 y 9881 quedan libres (`ss -ltnp`).
`qa` y `capturas` gestionan sus propios servidores. No he tocado
`/home/al/code/heroes-arte`, `tools/qa/tmp-scratch` ni `NuevaJugabilidad.md`.

## Veredicto

**Apto con reservas.** Todos los criterios del ciclo A se cumplen con evidencia.
El ancla, los barridos y la medida se reproducen exactos, y la pasada adversarial
no encontró pérdidas ni duplicados de experiencia en 1000 partidas. La reserva
que importa es I1: cerrar la puerta a que el cuaderno se commitee por accidente.
M1-M4 son menores y no bloquean.
