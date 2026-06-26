#!/usr/bin/env bash
# Smoke-test mobile-api after deploy (C-01 verification).
# Usage:
#   ./scripts/smoke-mobile-api.sh
#   ./scripts/smoke-mobile-api.sh https://mobile-api.novasafe.io
#   ./scripts/smoke-mobile-api.sh http://127.0.0.1:8085

set -euo pipefail

BASE="${1:-https://mobile-api.novasafe.io}"
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  echo "── $name"
  echo "   GET $url"
  BODY=$(curl -sS -m 15 "$url" || true)
  if echo "$BODY" | grep -q "$expect"; then
    echo "   ✓ ok ($expect)"
  else
    echo "   ✗ expected: $expect"
    echo "   response: ${BODY:0:200}"
    FAIL=1
  fi
  echo ""
}

echo "NovaSafe mobile-api smoke test"
echo "Base: $BASE"
echo ""

check "Health (/mobile/health)" "$BASE/mobile/health" '"service":"core"'
check "Health success" "$BASE/mobile/health" '"success":true'
check "Version" "$BASE/version" '"repository":"novasafe-mobile-api"'
check "API v1 health" "$BASE/api/v1/health" '"service":"core"'

if [ "$FAIL" -eq 0 ]; then
  echo "All checks passed."
  curl -sS -m 10 "$BASE/version" | python3 -m json.tool 2>/dev/null || curl -sS "$BASE/version"
  exit 0
fi

echo "One or more checks failed."
exit 1
