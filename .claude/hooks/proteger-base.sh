#!/bin/bash
# Bloquea cualquier comando que pueda resetear o borrar la base de datos de Revolución 360.
# La base que usamos es la de PRODUCCIÓN: esto no se ejecuta nunca, ni en pruebas ni en un deploy.
# Lee del stdin el JSON de la herramienta (PreToolUse de Bash) y sale con 2 para bloquear.
input=$(cat)
if printf '%s' "$input" | grep -qiE 'db[[:space:]]+reset|db:reset|db:start|--no-backup|include-seed|seed\.sql|dropdb|supabase[[:space:]]+projects[[:space:]]+delete|d[r]op[[:space:]]+(database|schema|table)|t[r]uncate'; then
  echo "Bloqueado: este comando puede resetear o borrar la base de datos de producción de Revolución 360. Está prohibido por CLAUDE.md (regla 0). Si de verdad hace falta, lo corre Jonathan a mano." >&2
  exit 2
fi
exit 0
