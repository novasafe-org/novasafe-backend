#!/usr/bin/env bash
# Fast secret scan on staged files only (Husky pre-commit). Free: gitleaks CLI or Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_protect() {
  local runner=(gitleaks protect --staged --redact --verbose)
  if command -v gitleaks >/dev/null 2>&1; then
    "${runner[@]}"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    docker run --rm -v "$ROOT:/repo" -w /repo zricethezav/gitleaks:latest "${runner[@]}"
    return
  fi
  echo "gitleaks pre-commit skipped: install gitleaks or Docker to scan staged changes."
  exit 1
}

run_protect
