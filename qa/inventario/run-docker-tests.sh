#!/usr/bin/env bash

set -u

API_URL="${API_URL:-http://127.0.0.1:3011}"
WEB_URL="${WEB_URL:-http://127.0.0.1:5173}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
RUN_ID="$(date +%s)"
BARCODE="9900000${RUN_ID: -6}"
ITEM_ID=""
PASS_COUNT=0
FAIL_COUNT=0
BLOCKED_COUNT=0
BODY_FILE="$(mktemp)"

cleanup() {
  if [[ -n "$ITEM_ID" ]]; then
    curl -sS -o /dev/null -X DELETE "$API_URL/inventory-items/$ITEM_ID" || true
  fi
  rm -f "$BODY_FILE" /tmp/inv-concurrent-"$RUN_ID"-*.body
}
trap cleanup EXIT

result() {
  local status="$1"
  local id="$2"
  local detail="$3"

  case "$status" in
    APROBADO) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    FALLIDO) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    BLOQUEADO) BLOCKED_COUNT=$((BLOCKED_COUNT + 1)) ;;
  esac

  printf '[%s] %s | %s\n' "$status" "$id" "$detail"
}

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ -n "$data" ]]; then
    HTTP_CODE="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$API_URL$path" \
      -H 'Content-Type: application/json' \
      --data "$data")"
  else
    HTTP_CODE="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$API_URL$path")"
  fi
}

db_scalar() {
  docker compose -f "$COMPOSE_FILE" exec -T inventario-db \
    mysql -u"${INVENTARIO_DB_USER:-infounsa}" -p"${INVENTARIO_DB_PASSWORD:-infounsa_inventario_dev}" -D"${INVENTARIO_DB_NAME:-infounsa_inventario}" -ss -e "$1" 2>/dev/null
}

printf 'Suite Docker de Inventario InfoUNSA\n'
printf 'Ejecución: %s\n\n' "$(date --iso-8601=seconds)"

request GET /health
if [[ "$HTTP_CODE" == "200" ]] && [[ "$(jq -r '.database' "$BODY_FILE")" == "connected" ]]; then
  result APROBADO CPI-INV-INF-01 "API y MySQL responden correctamente."
else
  result FALLIDO CPI-INV-INF-01 "Health check HTTP $HTTP_CODE."
fi

WEB_CODE="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' "$WEB_URL/")"
if [[ "$WEB_CODE" == "200" ]] && grep -q 'InfoUNSA' "$BODY_FILE"; then
  result APROBADO CPS-RF-INV-05-01 "La interfaz web carga mediante Nginx."
else
  result FALLIDO CPS-RF-INV-05-01 "La interfaz respondió HTTP $WEB_CODE."
fi

CREATE_PAYLOAD="$(jq -n \
  --arg barcode "$BARCODE" \
  '{barcode:$barcode,name:"Bien QA Docker",description:"Registro temporal de prueba",quantity:10,min_stock:3,unit:"unidad",category_id:1,sede_id:1}')"
request POST /inventory-items "$CREATE_PAYLOAD"
ITEM_ID="$(jq -r '.id // empty' "$BODY_FILE")"
if [[ "$HTTP_CODE" == "201" ]] && [[ -n "$ITEM_ID" ]]; then
  result APROBADO CPI-RF-INV-01-01 "Bien registrado con ID único $ITEM_ID."
else
  result FALLIDO CPI-RF-INV-01-01 "No se pudo registrar el bien; HTTP $HTTP_CODE."
  printf '\nResumen: %d aprobadas, %d fallidas, %d bloqueadas.\n' "$PASS_COUNT" "$FAIL_COUNT" "$BLOCKED_COUNT"
  exit 1
fi

request GET "/inventory-items/$ITEM_ID"
if [[ "$HTTP_CODE" == "200" ]] && [[ "$(jq -r '.barcode' "$BODY_FILE")" == "$BARCODE" ]]; then
  result APROBADO CPI-RF-INV-01-02 "El bien persiste y puede consultarse."
else
  result FALLIDO CPI-RF-INV-01-02 "Consulta del bien HTTP $HTTP_CODE."
fi

request POST /inventory-items '{"barcode":"'"$BARCODE"'","name":"Duplicado QA","quantity":1,"min_stock":0}'
if (( HTTP_CODE >= 400 )); then
  result APROBADO CPI-RF-INV-01-03 "La base de datos rechaza el código de barras duplicado."
else
  result FALLIDO CPI-RF-INV-01-03 "Se aceptó un código de barras duplicado."
fi

request POST /inventory-items '{"barcode":"QA-NEG-'"$RUN_ID"'","name":"Cantidad negativa","quantity":-1}'
if [[ "$HTTP_CODE" == "400" ]]; then
  result APROBADO CPI-RF-INV-01-04 "Se rechaza cantidad inicial negativa."
else
  result FALLIDO CPI-RF-INV-01-04 "Cantidad negativa respondió HTTP $HTTP_CODE."
fi

request POST /inventory-items '{}'
if (( HTTP_CODE >= 400 )); then
  result APROBADO CPI-RF-INV-01-05 "Se rechaza el registro vacío."
else
  result FALLIDO CPI-RF-INV-01-05 "El API aceptó un registro vacío."
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ENTRY_ID="qa-entry-$RUN_ID"
request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"entrada","quantity":5,"user_id":1,"registered_at":"'"$NOW"'","id_operacion_local":"'"$ENTRY_ID"'","observations":"Entrada automatizada"}'
if [[ "$HTTP_CODE" == "201" ]]; then
  request GET "/inventory-items/$ITEM_ID"
  if [[ "$(jq -r '.quantity' "$BODY_FILE")" == "15" ]]; then
    result APROBADO CPI-RF-INV-02-01 "La entrada incrementó el stock de 10 a 15."
  else
    result FALLIDO CPI-RF-INV-02-01 "Stock distinto de 15 después de la entrada."
  fi
else
  result FALLIDO CPI-RF-INV-02-01 "Registro de entrada HTTP $HTTP_CODE."
fi

TRACE_COUNT="$(db_scalar "SELECT COUNT(*) FROM inventory_movements WHERE id_operacion_local = '$ENTRY_ID' AND user_id = 1 AND registered_at IS NOT NULL;")"
if [[ "$TRACE_COUNT" == "1" ]]; then
  result APROBADO CPI-RF-INV-02-02 "La entrada conserva operador, fecha y hora."
else
  result FALLIDO CPI-RF-INV-02-02 "No se encontró trazabilidad completa para la entrada."
fi

request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"entrada","quantity":0,"user_id":1,"registered_at":"'"$NOW"'"}'
if [[ "$HTTP_CODE" == "400" ]]; then
  result APROBADO CPI-RF-INV-02-03 "Se rechaza una entrada con cantidad cero."
else
  result FALLIDO CPI-RF-INV-02-03 "Cantidad cero respondió HTTP $HTTP_CODE."
fi

request POST /inventory-movements \
  '{"item_id":999999999,"type":"entrada","quantity":1,"user_id":1,"registered_at":"'"$NOW"'"}'
if [[ "$HTTP_CODE" == "400" ]]; then
  result APROBADO CPI-RF-INV-02-04 "Se rechaza una entrada para un bien inexistente."
else
  result FALLIDO CPI-RF-INV-02-04 "Bien inexistente respondió HTTP $HTTP_CODE."
fi

EXIT_ID="qa-exit-$RUN_ID"
request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"salida","quantity":4,"user_id":2,"registered_at":"'"$NOW"'","id_operacion_local":"'"$EXIT_ID"'","observations":"Salida automatizada"}'
if [[ "$HTTP_CODE" == "201" ]]; then
  request GET "/inventory-items/$ITEM_ID"
  if [[ "$(jq -r '.quantity' "$BODY_FILE")" == "11" ]]; then
    result APROBADO CPI-RF-INV-04-01 "La salida redujo el stock de 15 a 11."
  else
    result FALLIDO CPI-RF-INV-04-01 "Stock distinto de 11 después de la salida."
  fi
else
  result FALLIDO CPI-RF-INV-04-01 "Registro de salida HTTP $HTTP_CODE."
fi

request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"salida","quantity":99,"user_id":2,"registered_at":"'"$NOW"'"}'
OVERDRAW_CODE="$HTTP_CODE"
request GET "/inventory-items/$ITEM_ID"
CURRENT_STOCK="$(jq -r '.quantity' "$BODY_FILE")"
if [[ "$OVERDRAW_CODE" == "400" ]] && [[ "$HTTP_CODE" == "200" ]] && [[ "$CURRENT_STOCK" == "11" ]]; then
  result APROBADO CPI-RF-INV-04-02 "Se bloquea la salida superior al stock y se conserva el saldo."
else
  result FALLIDO CPI-RF-INV-04-02 "Respuesta HTTP $OVERDRAW_CODE; stock posterior $CURRENT_STOCK."
fi

request PUT "/inventory-items/$ITEM_ID" '{"min_stock":20}'
request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"salida","quantity":1,"user_id":1,"registered_at":"'"$NOW"'","id_operacion_local":"qa-alert-'"$RUN_ID"'"}'
ALERT_ACTIVE="$(db_scalar "SELECT COUNT(*) FROM alerts WHERE item_id = $ITEM_ID AND resolved_at IS NULL;")"
if [[ "$ALERT_ACTIVE" == "1" ]]; then
  result APROBADO CPI-RF-INV-03-01 "Se genera una alerta persistente al quedar bajo el stock mínimo."
else
  result FALLIDO CPI-RF-INV-03-01 "No se generó la alerta de stock crítico."
fi

request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"entrada","quantity":20,"user_id":1,"registered_at":"'"$NOW"'","id_operacion_local":"qa-resolve-'"$RUN_ID"'"}'
ALERT_RESOLVED="$(db_scalar "SELECT COUNT(*) FROM alerts WHERE item_id = $ITEM_ID AND resolved_at IS NOT NULL;")"
if [[ "$ALERT_RESOLVED" == "1" ]]; then
  result APROBADO CPI-RF-INV-03-02 "La alerta se resuelve cuando el stock se recupera."
else
  result FALLIDO CPI-RF-INV-03-02 "La alerta no se resolvió al recuperar stock."
fi

request PUT "/inventory-items/$ITEM_ID" '{"quantity":4,"min_stock":3}'
request POST /inventory-movements \
  '{"item_id":'"$ITEM_ID"',"type":"salida","quantity":1,"user_id":1,"registered_at":"'"$NOW"'","id_operacion_local":"qa-boundary-'"$RUN_ID"'"}'
ALERT_AT_LIMIT="$(db_scalar "SELECT COUNT(*) FROM alerts WHERE item_id = $ITEM_ID AND resolved_at IS NULL;")"
if [[ "$ALERT_AT_LIMIT" == "1" ]]; then
  result APROBADO CPI-RF-INV-03-03 "Se genera alerta cuando el stock alcanza exactamente el mínimo."
else
  result FALLIDO CPI-RF-INV-03-03 "No se genera alerta cuando stock y mínimo son iguales."
fi

request GET "/inventory-items?page=1&limit=2"
if [[ "$HTTP_CODE" == "200" ]] && [[ "$(jq '.data | length' "$BODY_FILE")" -le 2 ]] && [[ "$(jq -r '.page' "$BODY_FILE")" == "1" ]]; then
  result APROBADO CPI-RF-INV-05-02 "El catálogo aplica paginación mediante limit y offset."
else
  result FALLIDO CPI-RF-INV-05-02 "La respuesta no respeta la paginación."
fi

request GET "/inventory-items/barcode/$BARCODE"
if [[ "$HTTP_CODE" == "200" ]] && [[ "$(jq -r '.id' "$BODY_FILE")" == "$ITEM_ID" ]]; then
  result APROBADO CPI-RF-INV-05-03 "La consulta por código de barras retorna el bien correcto."
else
  result FALLIDO CPI-RF-INV-05-03 "Búsqueda por código respondió HTTP $HTTP_CODE."
fi

request GET '/inventory-movements/report?startDate=2026-01-01T00:00:00Z&endDate=2026-04-15T00:00:00Z'
if [[ "$HTTP_CODE" == "400" ]]; then
  result APROBADO CPI-RNF-INV-RANGO-01 "Se rechazan reportes con rango mayor a 90 días."
else
  result FALLIDO CPI-RNF-INV-RANGO-01 "Rango mayor a 90 días respondió HTTP $HTTP_CODE."
fi

LARGE_BATCH="$(jq -cn '[range(0;501) | {item_id:1,type:"entrada",quantity:1,registered_at:"2026-06-20T00:00:00Z"}] | {batch:.}')"
request POST /inventory-movements/sync "$LARGE_BATCH"
if [[ "$HTTP_CODE" == "400" ]]; then
  result APROBADO CPI-RF-INV-OFFLINE-01 "Se aplica el límite transaccional de 500 movimientos."
else
  result FALLIDO CPI-RF-INV-OFFLINE-01 "Lote de 501 respondió HTTP $HTTP_CODE."
fi

request PUT "/inventory-items/$ITEM_ID" '{"quantity":10,"min_stock":0}'
SYNC_ID="qa-sync-$RUN_ID"
SYNC_PAYLOAD='{"batch":[{"item_id":'"$ITEM_ID"',"type":"entrada","quantity":2,"user_id":1,"registered_at":"'"$NOW"'","id_operacion_local":"'"$SYNC_ID"'"}]}'
request POST /inventory-movements/sync "$SYNC_PAYLOAD"
request POST /inventory-movements/sync "$SYNC_PAYLOAD"
request GET "/inventory-items/$ITEM_ID"
if [[ "$(jq -r '.quantity' "$BODY_FILE")" == "12" ]]; then
  result APROBADO CPI-RF-INV-OFFLINE-02 "La idempotencia evita aplicar dos veces el mismo movimiento."
else
  result FALLIDO CPI-RF-INV-OFFLINE-02 "El reintento duplicó el movimiento; stock $(jq -r '.quantity' "$BODY_FILE")."
fi

request PUT "/inventory-items/$ITEM_ID" '{"quantity":1,"min_stock":0}'
CONCURRENT_PAYLOAD='{"item_id":'"$ITEM_ID"',"type":"salida","quantity":1,"user_id":1,"registered_at":"'"$NOW"'"}'
curl -sS -o "/tmp/inv-concurrent-$RUN_ID-1.body" -w '%{http_code}' \
  -X POST "$API_URL/inventory-movements" -H 'Content-Type: application/json' --data "$CONCURRENT_PAYLOAD" > "/tmp/inv-concurrent-$RUN_ID-1.code" &
PID_ONE=$!
curl -sS -o "/tmp/inv-concurrent-$RUN_ID-2.body" -w '%{http_code}' \
  -X POST "$API_URL/inventory-movements" -H 'Content-Type: application/json' --data "$CONCURRENT_PAYLOAD" > "/tmp/inv-concurrent-$RUN_ID-2.code" &
PID_TWO=$!
wait "$PID_ONE" "$PID_TWO"
CODE_ONE="$(<"/tmp/inv-concurrent-$RUN_ID-1.code")"
CODE_TWO="$(<"/tmp/inv-concurrent-$RUN_ID-2.code")"
request GET "/inventory-items/$ITEM_ID"
if [[ "$(jq -r '.quantity' "$BODY_FILE")" == "0" ]] && \
   { [[ "$CODE_ONE" == "201" && "$CODE_TWO" == "400" ]] || [[ "$CODE_ONE" == "400" && "$CODE_TWO" == "201" ]]; }; then
  result APROBADO CPI-RNF-INV-02-01 "El bloqueo transaccional permite una sola salida concurrente."
else
  result FALLIDO CPI-RNF-INV-02-01 "Respuestas concurrentes $CODE_ONE/$CODE_TWO; stock $(jq -r '.quantity' "$BODY_FILE")."
fi
rm -f "/tmp/inv-concurrent-$RUN_ID-1.code" "/tmp/inv-concurrent-$RUN_ID-2.code"

RBAC_BARCODE="RBAC-$RUN_ID"
request POST /inventory-items '{"barcode":"'"$RBAC_BARCODE"'","name":"Bien temporal RBAC","quantity":0,"min_stock":0}'
RBAC_ITEM_ID="$(jq -r '.id // empty' "$BODY_FILE")"
if [[ -n "$RBAC_ITEM_ID" ]]; then
  request DELETE "/inventory-items/$RBAC_ITEM_ID"
  if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
    result APROBADO CPI-RNF-INV-04-01 "DELETE exige autenticación y rol administrador."
  else
    result FALLIDO CPI-RNF-INV-04-01 "DELETE sin token fue permitido con HTTP $HTTP_CODE."
  fi
else
  result BLOQUEADO CPI-RNF-INV-04-01 "No se pudo crear el dato temporal para verificar RBAC."
fi

AUDIT_TRIGGER_COUNT="$(db_scalar "SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_table = 'inventory_items';")"
if (( AUDIT_TRIGGER_COUNT > 0 )); then
  result APROBADO CPI-RNF-INV-01-01 "Existe un trigger de auditoría sobre inventory_items."
else
  result FALLIDO CPI-RNF-INV-01-01 "No existe trigger de auditoría inmutable."
fi

DB_PORTS="$(docker compose -f "$COMPOSE_FILE" port inventario-db 3306 2>/dev/null || true)"
if [[ -z "$DB_PORTS" ]]; then
  result APROBADO CPI-RNF-INV-05-01 "MySQL no publica un puerto hacia el host."
else
  result FALLIDO CPI-RNF-INV-05-01 "MySQL está expuesto al host en $DB_PORTS."
fi

result BLOQUEADO CPS-RF-INV-03-03 "La web usa datos simulados y no consulta las alertas persistidas por la API."
result BLOQUEADO CPS-RF-INV-05-04 "No existen filtros por nombre, categoría y estado conectados al backend."
result BLOQUEADO CPI-RF-INV-OFFLINE-03 "No existe persistencia local SQLite/SQLCipher para probar operación offline."
result BLOQUEADO CPI-RNF-INV-03-01 "No se dispone de un conjunto controlado de 100000 registros para la prueba de 2 segundos."

printf '\nResumen: %d aprobadas, %d fallidas, %d bloqueadas.\n' "$PASS_COUNT" "$FAIL_COUNT" "$BLOCKED_COUNT"

if (( FAIL_COUNT > 0 )); then
  exit 1
fi
