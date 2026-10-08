#!/usr/bin/env bash
# Copies SP1's route map (functions/src/customers/route-segmentation.ts — the ONE source) into SP2 as
# src/domain/address/route-map.ts. SP2 must never edit its copy: change SP1's file and run this again.
#   scripts/route-map/export-to-sp2.sh [SP2 repo dir]        (default ../smart-portal-2)
#   scripts/route-map/export-to-sp2.sh [SP2 repo dir] --check   exit 1 when SP2's copy differs
set -euo pipefail
cd "$(dirname "$0")/../.."
SP2="${1:-../smart-portal-2}"
SRC=functions/src/customers/route-segmentation.ts
DST="$SP2/src/domain/address/route-map.ts"
TMP="$(mktemp)"
{ echo "// GENERATED from smart-portal-1 $SRC by scripts/route-map/export-to-sp2.sh — do not edit here."; cat "$SRC"; } > "$TMP"
if [ "${2:-}" = "--check" ]; then
  if cmp -s "$TMP" "$DST"; then echo "mapa de rutas SP2 = SP1 ✅"; rm -f "$TMP"; exit 0; fi
  echo "❌ el mapa de rutas de SP2 difiere del de SP1: correr scripts/route-map/export-to-sp2.sh"; rm -f "$TMP"; exit 1
fi
mv "$TMP" "$DST"; echo "copiado → $DST"
