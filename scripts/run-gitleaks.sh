#!/usr/bin/env bash
# Run gitleaks locally (SEC-01.4). CI uses .github/actions/gitleaks-cli (same CLI, no license).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --redact --verbose
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$ROOT:/repo" zricethezav/gitleaks:latest detect --source /repo --redact --verbose
  exit 0
fi

echo "Install gitleaks or Docker to run secret scanning."
exit 1
