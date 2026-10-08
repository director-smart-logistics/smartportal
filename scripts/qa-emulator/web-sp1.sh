#!/usr/bin/env bash
# SP1 app (Nova) against the combined QA emulator. Dev server only.
# Every external destination the client reads from .env is overridden here (process env wins
# over .env in Vite): SP2 = local emulator, sync secret = local value, Gemini / API / keys off.
set -euo pipefail
cd "$(dirname "$0")/../.."
FN="http://127.0.0.1:5001/demo-sp-qa/us-central1"
BLOCKED="http://127.0.0.1:9/emulator-blocked"
export VITE_USE_FIREBASE_EMULATORS=true
export VITE_FIREBASE_PROJECT_ID="demo-sp-qa"
export VITE_SP2_PROJECT_ID="demo-sp-qa"
export VITE_FIREBASE_API_KEY="qa-emulator-key"
export VITE_SP2_FIREBASE_API_KEY="qa-emulator-key"
export VITE_FIREBASE_AUTH_DOMAIN="localhost"
export VITE_FIREBASE_STORAGE_BUCKET="demo-sp-qa.appspot.com"
export VITE_FIREBASE_VAPID_KEY=""
export VITE_SP2_SYNC_URL="$FN/slEncomiendaSync"
export VITE_SP2_SHIPMENT_SYNC_URL="$FN/slSyncShipmentsFromSp1"
export VITE_SP2_INVOICE_SYNC_URL="$FN/slSyncInvoicesFromSp1"
export VITE_SP2_SYNC_SECRET="qa-local-sync-secret"
export VITE_API_URL="$BLOCKED"
export VITE_GEMINI_API_KEY="emulator-disabled"
export VITE_SUPABASE_URL="$BLOCKED"
export VITE_SUPABASE_ANON_KEY="emulator-disabled"
exec npx vite --port 5174 --strictPort
