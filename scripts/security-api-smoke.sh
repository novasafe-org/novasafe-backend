#!/usr/bin/env bash
# API security regression smoke tests (SEC-01.2).
# Run against staging or local core API.
#
# Usage:
#   ./scripts/security-api-smoke.sh
#   ./scripts/security-api-smoke.sh https://mobile-api.novasafe.io

set -euo pipefail

BASE="${1:-http://127.0.0.1:8085}"
FAIL=0

assert_status() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  shift 4
  local body="${1:-}"
  local headers=("${@:2}")

  echo "── $name"
  echo "   $method $url (expect HTTP $expected)"

  local args=(-sS -m 20 -o /tmp/ns-smoke-body.txt -w "%{http_code}" -X "$method")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  for h in "${headers[@]}"; do
    args+=(-H "$h")
  done

  local code
  code=$(curl "${args[@]}" "$url" || echo "000")
  if [ "$code" = "$expected" ]; then
    echo "   ✓ HTTP $code"
  else
    echo "   ✗ HTTP $code (expected $expected)"
    head -c 200 /tmp/ns-smoke-body.txt 2>/dev/null || true
    echo ""
    FAIL=1
  fi
  echo ""
}

echo "NovaSafe API security smoke"
echo "Base: $BASE"
echo ""

assert_status "Signup without proof rejected" POST "$BASE/api/v1/onboarding/create-account" 403 \
  '{"email":"smoke-test@example.com","fullName":"Smoke","password":"SmokeTest123!"}'

assert_status "Password reset confirm without OTP" POST "$BASE/api/v1/auth/password-reset/confirm" 400 \
  '{"email":"smoke-test@example.com","otp":"","newPassword":"Short1"}'

assert_status "Extension redeem without code" POST "$BASE/api/v1/auth/extension/redeem-pairing" 400 \
  '{"pairingCode":"","installationId":"","state":""}'

echo "── CORS blocks disallowed Origin preflight"
HEADERS=$(curl -sS -m 20 -D - -o /dev/null -X OPTIONS "$BASE/api/v1/auth/login" \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST" || true)
if echo "$HEADERS" | grep -qi "access-control-allow-origin: https://evil.example"; then
  echo "   ✗ evil origin reflected in ACAO"
  FAIL=1
else
  echo "   ✓ disallowed origin not reflected"
fi
echo ""

assert_status "Validate session without token" GET "$BASE/api/v1/auth/validate-session" 401

if [ "$FAIL" -eq 0 ]; then
  echo "All security smoke checks passed."
  exit 0
fi

echo "One or more security checks failed."
exit 1
