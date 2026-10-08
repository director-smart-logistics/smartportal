#!/usr/bin/env bash
# Seed the combined QA emulator (scripts/qa-emulator/start.sh must be running).
#   - SP2: customer accounts and real-case pre-alerts/shipments (smart-portal-2/scripts/emulator-seed.cjs).
#     SP2 pushes each customer to SP1 by itself (real sync) → portal/customers.
#   - SP1: an ADMIN invitation for the QA Google account (the real SP1 access mechanism).
# Refuses to run unless both emulator hosts are localhost and the project is a demo project.
set -euo pipefail
SP1_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SP2_DIR="${SP2_DIR:-$(cd "$SP1_DIR/../smart-portal-2" && pwd)}"
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export GCLOUD_PROJECT="demo-sp-qa"
unset GOOGLE_APPLICATION_CREDENTIALS || true

(cd "$SP2_DIR" && node scripts/emulator-seed.cjs)
node "$SP1_DIR/scripts/qa-emulator/seed-sp1.cjs"
