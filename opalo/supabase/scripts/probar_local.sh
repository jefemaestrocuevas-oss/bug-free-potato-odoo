#!/usr/bin/env bash
# Ópalo · prueba la base completa en un PostgreSQL local (16+).
#
#   opalo/supabase/scripts/probar_local.sh
#
# (Re)crea la base $OPALO_DB (opalo_test) y aplica, en orden y con ON_ERROR_STOP:
#   local/auth_shim.sql → migrations/*.sql → seed.sql → seed_demo.sql → local/pruebas.sql → tests/*.sql
# Sale con código ≠ 0 si algo falla e imprime un resumen.
#
# Variables:
#   PSQL       comando psql a usar (por defecto: "runuser -u postgres -- psql" si eres root, si no "psql").
#              Ej.: PSQL="psql -h localhost -U postgres" opalo/supabase/scripts/probar_local.sh
#   OPALO_DB   nombre de la base de pruebas (por defecto opalo_test). Se BORRA y se vuelve a crear.
#   SOLO       patrón para correr sólo algunas pruebas (ej. SOLO=03 → tests/03_*.sql).

set -uo pipefail
shopt -s nullglob

SUPA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${OPALO_DB:-opalo_test}"

if [[ -n "${PSQL:-}" ]]; then
  read -r -a PSQL_CMD <<< "$PSQL"
elif [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then
  PSQL_CMD=(runuser -u postgres -- psql)
else
  PSQL_CMD=(psql)
fi

psql_en() {   # psql_en <base> [args…]
  local base="$1"; shift
  "${PSQL_CMD[@]}" -X -q -v ON_ERROR_STOP=1 -d "$base" "$@"
}

ok=0
fallas=0
resumen=()

paso() {      # paso <etiqueta> <archivo>   (se pasa por stdin: no importa quién sea dueño del archivo)
  local etiqueta="$1" archivo="$2" salida
  if salida="$(psql_en "$DB" -f - < "$archivo" 2>&1)"; then
    resumen+=("  OK     $etiqueta")
    ok=$((ok + 1))
    return 0
  fi
  resumen+=("  FALLA  $etiqueta")
  fallas=$((fallas + 1))
  echo "----- FALLA en $etiqueta -----"
  echo "$salida" | grep -v 'NOTICE:  OK' | tail -n 25
  echo "------------------------------"
  return 1
}

terminar() {
  echo
  echo "================ Resumen ================"
  printf '%s\n' "${resumen[@]}"
  echo "-----------------------------------------"
  echo "  $ok pasos bien, $fallas con falla · ${comprobaciones:-0} bloques de prueba"
  echo "========================================="
  if (( fallas > 0 )); then exit 1; fi
  exit 0
}

# 0) ¿Hay servidor?
if ! "${PSQL_CMD[@]}" -X -q -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "PostgreSQL no responde; intento iniciarlo (service postgresql start)…"
  service postgresql start >/dev/null 2>&1 || true
  sleep 2
  if ! "${PSQL_CMD[@]}" -X -q -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "No pude conectarme a PostgreSQL con: ${PSQL_CMD[*]}"
    exit 2
  fi
fi

# 0.1) ¿seed.sql está al día con datos/? Si no, se detiene: la base tendría otro texto que el demo
#      (por ejemplo, políticas viejas). Con OPALO_SEED_DESFASADO=1 sólo avisa.
if command -v node >/dev/null 2>&1; then
  if ! node "$SUPA/scripts/generar_seed.mjs" --stdout 2>/dev/null | cmp -s - "$SUPA/seed.sql"; then
    echo "FALLA: seed.sql no coincide con datos/ — corre: node opalo/supabase/scripts/generar_seed.mjs"
    if [[ "${OPALO_SEED_DESFASADO:-}" != "1" ]]; then
      exit 1
    fi
  fi
else
  echo "AVISO: no hay node; no pude revisar que seed.sql esté al día con datos/."
fi

# 1) Base limpia
echo "Recreando la base $DB…"
psql_en postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1 || true
if ! psql_en postgres -c "create database \"$DB\"" >/dev/null; then
  echo "No pude crear la base $DB"; exit 2
fi

# 2) Shim de Supabase, migraciones, seeds
paso "local/auth_shim.sql" "$SUPA/local/auth_shim.sql" || terminar
for f in "$SUPA"/migrations/*.sql; do
  paso "migrations/$(basename "$f")" "$f" || terminar
done
paso "seed.sql" "$SUPA/seed.sql" || terminar
paso "seed.sql (2a vez: idempotente)" "$SUPA/seed.sql" || terminar
paso "seed_demo.sql" "$SUPA/seed_demo.sql" || terminar
paso "local/pruebas.sql" "$SUPA/local/pruebas.sql" || terminar

# 3) Pruebas (cada archivo es begin … rollback; se corren todas aunque alguna falle)
comprobaciones=0
for f in "$SUPA"/tests/*.sql; do
  nombre="$(basename "$f")"
  if [[ -n "${SOLO:-}" && "$nombre" != *"$SOLO"* ]]; then continue; fi
  if salida="$(psql_en "$DB" -f - < "$f" 2>&1)"; then
    n="$(grep -c 'NOTICE:  OK' <<< "$salida" || true)"
    comprobaciones=$((comprobaciones + n))
    resumen+=("  OK     tests/$nombre ($n bloques)")
    ok=$((ok + 1))
  else
    resumen+=("  FALLA  tests/$nombre")
    fallas=$((fallas + 1))
    echo "----- FALLA en tests/$nombre -----"
    echo "$salida" | grep -v 'NOTICE:  OK' | tail -n 25
    echo "----------------------------------"
  fi
done

terminar
