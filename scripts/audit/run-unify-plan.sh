#!/usr/bin/env bash
# Applies every "FROM TO" line of a plan with unify-sl-codes.cjs (one by one, backup each), stops at the first
# problem, then runs the read-only verification. Usage: scripts/audit/run-unify-plan.sh audit-output/<plan>.txt (plan files stay out of git)
set -u
cd "$(dirname "$0")/../.."
PLAN="$1"
while read -r F T; do
  [ -z "$F" ] && continue
  echo "=== $F → $T"
  out=$(node scripts/audit/unify-sl-codes.cjs --from "$F" --to "$T" --fix 2>&1 | grep -v -i "deprecat\|trace-dep")
  echo "$out" | grep -E "Respaldo|✅|⚠|⛔|ERR"
  if ! echo "$out" | grep -q "✅"; then echo "Se detiene: revisar $F → $T antes de seguir."; exit 1; fi
done < "$PLAN"
echo; echo "=== Verificación (solo lectura)"
node scripts/audit/verify-unified-codes.cjs "$PLAN" 2>&1 | grep -v -i "deprecat\|trace-dep"
