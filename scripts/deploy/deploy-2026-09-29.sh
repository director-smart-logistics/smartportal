#!/usr/bin/env zsh
# Controlled SP1 + SP2 deploy (2026-09-29) — SP1 PR #5 (fix/sp1-sp2-integrity) + SP2 PR #8 (fix/sp2-integrity-guards).
# Full regression green before this: 438 ✅ / 0 ❌ (+ account-delete 9/9).
# Order: SP1 functions → SP2 functions → rules (SP1 portal, SP2) → hosting (SP1, SP2). Stops at the first failure.
# Already deployed (2026-09-29): SP1 slDeleteAccountFromSp2, slDeleteCustomerAccount.
#
# Rollback (if needed):
#   SP1 hosting 414505570daef31f · SP2 hosting d7d2d8891379c35a (Firebase console → Hosting → release history → Rollback)
#   SP1 rules (portal) ruleset e96f8278-429c-41b4-84ec-7b62e849fcf8 · SP2 rules ruleset 6bb91494-e297-4b90-a618-751e4f32dd00
#   Functions: redeploy the same names from origin/main of each repo.
# Run:  zsh scripts/deploy/deploy-2026-09-29.sh [--from <step>]   steps: sp1fn sp2fn rules sp1web sp2web
set -u
SP1=/Users/jbricenoz/Workspace/smartlogistics/smart-portal-1
SP2=${SP2_DIR:-/Users/jbricenoz/.claude/jobs/17f4d5c8/tmp/fix-integrity-sp2}
FB=(npx firebase --non-interactive)
export GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/application_default_credentials.json
export XDG_CONFIG_HOME=${FB_CONFIG_HOME:-/Users/jbricenoz/.claude/jobs/17f4d5c8/tmp/fbcfg}
FROM=${2:-sp1fn}; [[ "${1:-}" == "--from" ]] || FROM=sp1fn
STEPS=(sp1fn sp2fn rules sp1web sp2web); START=${STEPS[(i)$FROM]}
LOG=$SP1/audit-output/deploy-2026-09-29.log; mkdir -p $SP1/audit-output
say() { print -- "$*" | tee -a $LOG; }
run() { local tries=${TRIES:-3} i out; for i in $(seq 1 $tries); do out=$("$@" 2>&1); print -- "$out" >> $LOG
  if print -- "$out" | grep -q "Deploy complete"; then say "   ✅ $*"; return 0; fi; say "   ⚠ intento $i falló: $(print -- "$out" | grep -iE 'error' | head -1)"; sleep 40; done
  say "❌ FALLÓ: $* — se detiene aquí (ver $LOG)"; exit 1; }

# Both branches must be clean and at the pushed commit
[[ -z "$(git -C $SP1 status --short -- . ':!scripts/deploy' ':!audit-output')" ]] || { say "❌ SP1 tiene cambios sin commit"; exit 1; }
[[ -z "$(git -C $SP2 status --short | grep -v 'src/functions/lib/\|package.json\|\.firebase/')" ]] || { say "❌ SP2 tiene cambios sin commit"; exit 1; }
say "== deploy $(date -u +%FT%TZ) · SP1 $(git -C $SP1 rev-parse --short HEAD) · SP2 $(git -C $SP2 rev-parse --short HEAD)"

if (( START <= 1 )); then say "1/5 funciones SP1"
  cd $SP1
  for fn in slDeleteCustomer slSyncCustomerFromSp2 slForceSyncCustomerFromSP2 triggerCustomerSync slUpdateCustomerProfile \
            slResolveRouteReview slCheckRouteIntegrity slMovePackagesToCustomerRoute onCustomerWritten; do
    run $FB deploy --only functions:$fn --project smart-portal-admin; done
fi
if (( START <= 2 )); then say "2/5 funciones SP2 (codebase smartlogistics)"
  cd $SP2
  for fn in slDeleteLoginFromSp1 slAdminSoftDeleteUser slRegisterUser slRegisterAccount slVerifyAccount slVerifyAccountConfirmation \
            slResendConfirmationEmail slAdminCreateUserQuick slCompleteMyProfile slUpdateMyIdentity slAdminUpdateIdentity \
            slUserProfileCreated slUserProfileUpdated onUserProfileWritten onAddressWrittenAlert slAdminConfirmAddressToSp1 slAdminResolveRouteReview; do
    run $FB deploy --only functions:smartlogistics:$fn --project smart-portal-2; done
  git -C $SP2 checkout -q -- src/functions/package.json 2>/dev/null
fi
if (( START <= 3 )); then say "3/5 reglas"
  cd $SP1 && run $FB deploy --only firestore:rules --project smart-portal-admin
  cd $SP2 && run $FB deploy --only firestore:rules --project smart-portal-2
fi
if (( START <= 4 )); then say "4/5 web SP1"
  cd $SP1 && npm run build >> $LOG 2>&1 || { say "❌ build SP1"; exit 1; }
  run $FB deploy --only hosting --project smart-portal-admin
fi
if (( START <= 5 )); then say "5/5 web SP2"
  cd $SP2 && npm run build >> $LOG 2>&1 || { say "❌ build SP2"; exit 1; }
  run $FB deploy --only hosting:portal-2 --project smart-portal-2
  git -C $SP2 checkout -q -- src/functions/package.json 2>/dev/null
fi
say "✅ deploy completo $(date -u +%FT%TZ)"
