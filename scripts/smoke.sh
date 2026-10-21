#!/usr/bin/env bash
# Prueba de humo de la API (plan, fase 2): proyecto, tarjeta, nota, mover a blocked con motivo,
# búsqueda y /summary. Corre contra una API ya levantada; no necesita jq.
#
#   LOGBOOK_TOKEN=lb_... bash scripts/smoke.sh
#   LOGBOOK_URL=http://localhost:3200/api/v1 (por defecto)
set -euo pipefail

URL="${LOGBOOK_URL:-http://localhost:3200/api/v1}"
URL="${URL%/}"
if [ -z "${LOGBOOK_TOKEN:-}" ]; then
  echo "Falta LOGBOOK_TOKEN: un Bearer token de API (ver README, 'Autenticación en desarrollo')." >&2
  exit 1
fi

STAMP="$(date +%s)"
WORD="humo${STAMP}"
BODY_FILE="$(mktemp)"
SLUG=""
STEPS=0
trap 'rm -f "$BODY_FILE"' EXIT

CODE=""
BODY=""

# call <método> <ruta> [json]: deja el código HTTP en CODE y el cuerpo en BODY.
call() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $LOGBOOK_TOKEN")
  if [ -n "$data" ]; then
    args+=(-H 'Content-Type: application/json' --data "$data")
  fi
  CODE="$(curl "${args[@]}" "$URL$path")"
  BODY="$(cat "$BODY_FILE")"
}

fail() {
  echo "FALLO $1: esperaba $2, HTTP $CODE" >&2
  echo "$BODY" >&2
  exit 1
}

# check <paso> <código esperado> <patrón grep -E que debe estar en el cuerpo>
check() {
  local step="$1" want="$2" pattern="$3"
  if [ "$CODE" != "$want" ]; then fail "$step" "HTTP $want"; fi
  if ! printf '%s' "$BODY" | grep -Eq -- "$pattern"; then fail "$step" "cuerpo con /$pattern/"; fi
  STEPS=$((STEPS + 1))
  echo "OK $step"
}

# field <nombre>: primer valor string de "nombre":"valor" en BODY.
field() {
  printf '%s' "$BODY" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1
}

call GET /me
check "auth (GET /me)" 200 '"auth":"token"'

call POST /projects "{\"name\":\"Humo $STAMP\",\"color\":\"violeta\"}"
check "crear proyecto" 201 '"slug":"[^"]+"'
SLUG="$(field slug)"

call POST /cards "{\"project\":\"$SLUG\",\"title\":\"Tarjeta de $WORD\"}"
check "crear tarjeta" 201 '"ref":"T-[0-9]+"'
REF="$(field ref)"

call POST "/cards/$REF/log" "{\"body\":\"Nota de prueba de humo $STAMP\"}"
check "agregar nota" 201 '"kind":"note"'

call POST "/cards/$REF/move" '{"status":"blocked","reason":"Bloqueo de prueba de humo"}'
check "mover a blocked con motivo" 200 '"status":"blocked"'

call GET "/search?q=$WORD"
check "buscar por título" 200 "\"ref\":\"$REF\""

call GET "/summary?format=md"
check "resumen md del día" 200 "$REF"

call POST "/projects/$SLUG/archive"
if [ "$CODE" = "200" ]; then
  check "archivar proyecto" 200 '"archivedAt":"[^"]+"'
  ARCHIVED="archivado"
else
  echo "AVISO no se pudo archivar el proyecto $SLUG (HTTP $CODE): $BODY" >&2
  ARCHIVED="NO archivado"
fi

echo "Resumen: $STEPS pasos OK; proyecto $SLUG, tarjeta $REF ($ARCHIVED)."
