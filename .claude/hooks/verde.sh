#!/usr/bin/env bash
# Impide dar una tarea por terminada con la verificación en rojo.
# Hook `Stop` — ver .claude/settings.json.
#
# Por qué existe: "creo que funciona" y "pnpm verify está verde" no son lo
# mismo, y la diferencia solo se nota cuando ya se ha dicho que estaba hecho.
#
# Por qué no estorba: `pnpm verify` son seis segundos (typecheck + lint + 208
# tests), y ni siquiera se lanza si no ha cambiado nada en el repo desde la
# última vez que salió verde. En una conversación de preguntas no se ejecuta una
# sola vez.
#
# Fail-open en todo lo demás: sin repo, sin pnpm o con la orden colgada, sale en
# silencio. Un guardia que bloquea por su propia avería se desactiva el primer
# día, y entonces ya no guarda nada.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
gitdir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
command -v pnpm >/dev/null 2>&1 || exit 0

# Huella del contenido que la verificación puede volver rojo. Se incluye la
# lista de ficheros además de su contenido para que un borrado también cuente.
#
# El repo ENTERO, sin excluir nada, en vez de una lista de rutas: esa lista era
# la TERCERA redacción de «qué cubre pnpm verify» —junto a `tsconfig.include` y
# `biome.files.includes`— y a las tres les faltaba lo mismo, `vite.config.ts`,
# así que tocarlo podía poner el typecheck en rojo con el guardia dormido. Y
# excluir `assets` y `docs` dejaba abierta la misma puerta por el otro lado: el
# guardia de rutas absolutas de `test/invariantes.test.ts` SÍ mira los ficheros
# de máquina que vivan ahí, así que un `.json` con una ruta dentro de
# `assets/generated/` ponía `pnpm verify` en rojo sin despertar al hook. Que el
# hook corra de más cuesta seis segundos; que no corra cuando debía es
# exactamente el fallo que este guardia existe para evitar.
#
# Con `-z` y `xargs -0` porque un nombre con un espacio se partía en dos y `cat`
# no leía su contenido —EN SILENCIO—: a partir de ahí los cambios dentro de ese
# fichero dejaban de despertar al guardia.
lista() { git ls-files -c -o --exclude-standard -z 2>/dev/null; }
[ -n "$(lista | tr '\0' '\n' | head -1)" ] || exit 0
huella=$( { lista; lista | xargs -0 -r cat 2>/dev/null; } | sha1sum | cut -d' ' -f1)

verde="$gitdir/claude-verde"
[ "$(cat "$verde" 2>/dev/null)" = "$huella" ] && exit 0

# Backstop de bucle: si ya ha bloqueado tres veces por esta misma huella, deja
# pasar con aviso. Sin esto, un fallo que no se sabe arreglar atasca la sesión.
intentos="$gitdir/claude-verde-intentos"
veces=$(( $(grep -c "^$huella\$" "$intentos" 2>/dev/null || echo 0) ))
if [ "$veces" -ge 3 ]; then
  printf '{"systemMessage":"pnpm verify sigue en rojo, pero el guardia ya ha avisado %s veces por el mismo estado: deja de bloquear. Arréglalo o dilo explícitamente al usuario."}\n' "$veces"
  exit 0
fi

salida=$(timeout 180 pnpm verify 2>&1)
codigo=$?

if [ "$codigo" -eq 0 ]; then
  printf '%s' "$huella" > "$verde"
  exit 0
fi
# 124 = se agotó el tiempo; 127 = no se encontró la orden. Ninguno es un fallo
# del código, así que no se bloquea por ellos.
case "$codigo" in 124 | 127) exit 0 ;; esac

echo "$huella" >> "$intentos"

python3 - "$salida" <<'PY'
import json, sys
cola = "\n".join(sys.argv[1].splitlines()[-40:])
motivo = (
    "`pnpm verify` está EN ROJO. No des la tarea por terminada: arréglalo, o "
    "dile al usuario explícitamente qué falla y por qué lo dejas así.\n\n"
    "Últimas líneas:\n\n```\n" + cola + "\n```"
)
print(json.dumps({"decision": "block", "reason": motivo}))
PY
