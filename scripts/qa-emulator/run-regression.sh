#!/usr/bin/env zsh
# Full SP1 ↔ SP2 regression on the combined QA emulator (never production), in flow order:
#   build → seed (twice: functions are cold on the first run) → Nova scenarios → N13 close →
#   Nova: process manifest, verify pre-alerts, save, reopen (+ diff vs golden) → invoice sync by
#   pre-alert id → ownership / reassign / no-twin → dashboard scenarios → delete → SP2 dashboard UI.
# Needs: start.sh running, web-sp1.sh (5174) and the SP2 app on 5175, and Playwright:
#   NODE_PATH=<playwright dir>/node_modules OUT=<folder> scripts/qa-emulator/run-regression.sh
# Note: the very first Nova login after an emulator reset may return 403 once — run again.
SP1="$(cd "$(dirname "$0")/../.." && pwd)"
SP2="${SP2_DIR:-$SP1/../smart-portal-2}"
OUT="${OUT:-${TMPDIR:-/tmp}/sp-qa-regression}"; mkdir -p "$OUT"
export FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 GCLOUD_PROJECT=demo-sp-qa
unset GOOGLE_APPLICATION_CREDENTIALS
cd "$SP1"
step() { print -- "\n######## $1"; }
e2e() { node scripts/qa-emulator/e2e/$1.cjs 2>&1 | grep -E "✅|❌|ERR|^[0-9]+/[0-9]+" | cut -c1-220; }
step build; (cd functions && npx tsc) && (cd "$SP2/src/functions" && npx tsc) && print "ok"
# The emulator loads lib/ through the wrappers start.sh writes and does not watch lib/: touching
# them makes it load the code just compiled.
QA="${QA_DIR:-${TMPDIR:-/tmp}/sp-qa-emulator}"; touch "$QA/sp1/index.js" "$QA/sp2/index.js"
# The Firestore emulator does not reload rules from the file: load SP2's current rules through its API.
python3 -c "import json,sys;print(json.dumps({'rules':{'files':[{'name':'firestore.rules','content':open(sys.argv[1]).read()}]}}))" "$SP2/firestore.rules" \
  | curl -s -o /dev/null -w "SP2 rules → %{http_code}\n" -X PUT -H 'Content-Type: application/json' --data @- "http://localhost:8080/emulator/v1/projects/demo-sp-qa/databases/(default):securityRules"
sleep 25
step route-map-sp1-sp2; scripts/route-map/export-to-sp2.sh "$SP2" --check
step seed; scripts/qa-emulator/seed.sh > "$OUT/seed1.log" 2>&1; scripts/qa-emulator/seed.sh > "$OUT/seed2.log" 2>&1; print "exit=$?"
step seed-nova; node scripts/qa-emulator/seed-nova-scenarios.cjs 2>&1 | grep -E "✅|❌"
step close-n13; (cd "$SP2" && node scripts/close-prealerts-of-finished-shipments.cjs --apply 2>&1 | grep -c "←" | sed 's/^/cerradas: /')
step nova; E2E_OUT="$OUT/nova" VERIFY=1 SAVE=1 REOPEN=1 READ_PKG=1 node scripts/qa-emulator/e2e/nova-upload.cjs > "$OUT/nova.log" 2>&1; print "exit=$?"
E2E_OUT="$OUT/nova" GOLDEN=scripts/qa-emulator/golden/nova-phase1-baseline.json python3 scripts/qa-emulator/e2e/nova-diff.py 2>&1 | tail -1
sed -n '/reabierto desde Firestore/,/aprendizaje/p' "$OUT/nova.log"
for s in sp1-invoice-prealert-link sp1-invoice-ownership sp1-invoice-reassign sp1-delivered-copies sp2-prealert-no-twin; do step $s; e2e $s; done
step seed-dashboard; node scripts/qa-emulator/seed-dashboard-scenarios.cjs 2>&1 | grep -E "✅|❌"
step sp2-prealert-delete; e2e sp2-prealert-delete
step seed-dashboard; node scripts/qa-emulator/seed-dashboard-scenarios.cjs 2>&1 | grep -E "✅|❌"
step sp2-address-sync; e2e sp2-address-sync
step sp2-principal-address; e2e sp2-principal-address
step sp2-migrate-principal; e2e sp2-migrate-principal
step sp1-label-address-sp2; e2e sp1-label-address-sp2
step sp1-override-cleanup; e2e sp1-override-cleanup
step sp1-consolidation-day-one; mkdir -p "$OUT/f10"; (export OUT="$OUT/f10"; e2e sp1-consolidation-day-one)
step sp1-routes-ui-jump; mkdir -p "$OUT/routes"; (export OUT="$OUT/routes"; e2e sp1-routes-ui-jump)
step sp1-nova-invoice-scope; mkdir -p "$OUT/scope"; (export OUT="$OUT/scope"; e2e sp1-nova-invoice-scope)
step sp1-nova-route-assign; mkdir -p "$OUT/route"; (export OUT="$OUT/route"; e2e sp1-nova-route-assign)
step sp1-nova-save-scope; mkdir -p "$OUT/scope"; (export OUT="$OUT/scope"; e2e sp1-nova-save-scope)
step sp1-nova-save-scope-external; mkdir -p "$OUT/scope"; (export OUT="$OUT/scope" EXTERNAL=1; e2e sp1-nova-save-scope)
step sp1-nova-move-manifest; mkdir -p "$OUT/move"; (export OUT="$OUT/move"; e2e sp1-nova-move-manifest)
step sp1-encomienda-dispatch-labels; mkdir -p "$OUT/disp"; (export OUT="$OUT/disp"; e2e sp1-encomienda-dispatch-labels)
step sp1-encomienda-label-sp2; mkdir -p "$OUT/lbl"; (export OUT="$OUT/lbl"; e2e sp1-encomienda-label-sp2)
step sp1-label-modal-both-addresses; mkdir -p "$OUT/lbl"; (export OUT="$OUT/lbl"; e2e sp1-label-modal-both-addresses)
step sp2-sec1-profile-create; e2e sp2-sec1-profile-create
step sp2-d1-cedula-zero; e2e sp2-d1-cedula-zero
step sp2-d3-d5-identity; e2e sp2-d3-d5-identity
step sp2-d4-register-validation; e2e sp2-d4-register-validation
step sp2-register-home-form; e2e sp2-register-home-form
step sp2-login-home-form; e2e sp2-login-home-form
step sp2-admin-quick-create; e2e sp2-admin-quick-create
step sp2-admin-quick-create-ui; e2e sp2-admin-quick-create-ui
step sp1-sp2-integrity-guards; e2e sp1-sp2-integrity-guards
step sp2-d2-login-no-profile; e2e sp2-d2-login-no-profile
step sp2-d8-admin-identity; e2e sp2-d8-admin-identity
step sp2-d6-d7-o6-alerts-merge; e2e sp2-d6-d7-o6-alerts-merge
step sp2-auth-flows; e2e sp2-auth-flows
step sp2-address-ui; mkdir -p "$OUT/addr"; (export OUT="$OUT/addr"; e2e sp2-address-ui)
step sp2-dashboard; mkdir -p "$OUT/dash"; (export OUT="$OUT/dash"; e2e sp2-dashboard)
step sp2-account-flows; mkdir -p "$OUT/acct"; (export OUT="$OUT/acct"; e2e sp2-account-flows)
step sp2-admin-prealert-search; mkdir -p "$OUT/pa"; (export OUT="$OUT/pa"; e2e sp2-admin-prealert-search)
step sp2-tracking-backfill-rehearsal; mkdir -p "$OUT/pa"; (export OUT="$OUT/pa"; e2e sp2-tracking-backfill-rehearsal)
step sp2-admin-user-actions; mkdir -p "$OUT/acc"; (export OUT="$OUT/acc"; e2e sp2-admin-user-actions)
step sp2-admin-delete-user; mkdir -p "$OUT/del"; (export OUT="$OUT/del"; e2e sp2-admin-delete-user)
step sp1-sp2-account-delete; e2e sp1-sp2-account-delete
step sp2-admin-edit-address; mkdir -p "$OUT/addr"; (export OUT="$OUT/addr"; e2e sp2-admin-edit-address)
step sp2-admin-address-encomienda; mkdir -p "$OUT/enc"; (export OUT="$OUT/enc"; e2e sp2-admin-address-encomienda)
step sp2-admin-packages-status; mkdir -p "$OUT/estado"; (export OUT="$OUT/estado"; e2e sp2-admin-packages-status)
step sp2-client-address-flow; mkdir -p "$OUT/cliaddr"; (export OUT="$OUT/cliaddr"; e2e sp2-client-address-flow)
step sp2-new-deploy-reload; SP2_DIR="$SP2" e2e sp2-new-deploy-reload
step sp2-admin-invoice-status; mkdir -p "$OUT/invst"; (export OUT="$OUT/invst"; e2e sp2-admin-invoice-status)
step sp1-sp2-route-review; mkdir -p "$OUT/rr"; (export OUT="$OUT/rr"; e2e sp1-sp2-route-review)
step sp1-bulk-status-sp2; e2e sp1-bulk-status-sp2
step sp1-status-trigger-sp2; e2e sp1-status-trigger-sp2
step sp1-packages-invoice-siblings; mkdir -p "$OUT/sib"; (export OUT="$OUT/sib"; e2e sp1-packages-invoice-siblings)
step sp2-permit-indicators; mkdir -p "$OUT/permit"; (export OUT="$OUT/permit"; e2e sp2-permit-indicators)
step sp1-manifest-cell-transitoria; e2e sp1-manifest-cell-transitoria
step sp1-annul-to-transitoria; e2e sp1-annul-to-transitoria
step sp1-gti-download; mkdir -p "$OUT/gti"; (export OUT="$OUT/gti"; e2e sp1-gti-download)
step sp1-sp2-consolidation-tab; mkdir -p "$OUT/constab"; (export OUT="$OUT/constab"; e2e sp1-sp2-consolidation-tab)
step sp1-sp2-consolidation-shots; mkdir -p "$OUT/conshots"; (export OUT="$OUT/conshots"; e2e sp1-sp2-consolidation-shots)
