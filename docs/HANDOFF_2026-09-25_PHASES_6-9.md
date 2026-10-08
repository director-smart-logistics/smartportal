# Handoff: Phases 6–9 (SP1 ↔ SP2), 2026-09-25

This is for a developer who joins without the context of the conversation. It covers what changed, why, where it lives, how it is tested, and what is still pending.

Earlier context:
- Phases 1–5 (pre-alerts, Nova, SP2 dashboard): see `docs/NOVA_PREALERT_MATCH_SCENARIOS.md` and `docs/HANDOFF_2026-09-25_NOVA_PREALERTS.md`.
- Phase 8 plan and gaps: see `docs/F8_ADDRESS_ENCOMIENDA_PLAN.md`.

**Branches:**
- SP1 (`smart-portal-1`): `fix/nova-prealert-match`
- SP2 (`smart-portal-2`): `fix/prealert-close-on-delivery`

Nothing is pushed or deployed.

## Working rules we followed

- **One fix per commit.** The commit message says what was wrong in production and how it was proved.
- **Every rule lives in a small pure function**, with a header comment and its own unit tests. The UI or the function only calls it.
- **Every cross-system fix has an e2e on the combined QA emulator**, run before (it must fail) and after (it must pass). Some also have a mutation check.
- **Production is read-only.** Data scripts are dry-run by default; `--apply` only with approval. Nothing is deleted.
- **No UI changes beyond the ones requested.**

## What changed

### Phase 6: SP2 admin, Paquetes: every ML Cargo detail

| Where | What |
|---|---|
| SP2 `src/functions/src/tracking-middleware.ts` | **Security.** The cache never stores the provider raw data (`_raw`). Before, a lookup with `includeRaw` could leave it for the next public lookup of the same number. Test: `tests/unit/middleware-raw-cache.test.ts`. |
| SP2 `pages/admin/mlcargo-details.ts` (+ `tests/unit/mlcargo-details.test.ts`) | Pure mapping of the ML Cargo answer: customer, code, destination, pieces, shipper, ML invoice, notes, SIN DESTINO / REQUIERE PERMISO. |
| SP2 `pages/admin/PackagesManagement.tsx` | Both ML Cargo lookups ask for `includeRaw`. The provider card shows those details. |

### Phase 7: full regression, reusable

- `scripts/qa-emulator/run-regression.sh` runs the whole flow in order on the emulator:
  1. Nova manifest → verify → save → reopen (diff against the golden);
  2. invoice sync by pre-alert id;
  3. ownership / reassign / delivered copies / no twin;
  4. delete;
  5. addresses;
  6. SP2 dashboard.

  Usage is in its header.
- New e2e tests: `sp2-dashboard.cjs`, `sp2-address-sync.cjs`, `sp2-address-ui.cjs`, `sp1-delivered-copies.cjs`.
- Emulator gotcha: it loads `lib/` through the wrappers `start.sh` writes, and does **not** watch `lib/`. After `tsc`, touch `$TMPDIR/sp-qa-emulator/sp{1,2}/index.js`; the runner already does this.

### Phase 8: one address per customer, instant and correct SP2 → SP1 sync, encomienda service

The gaps G1–G7 are in `docs/F8_ADDRESS_ENCOMIENDA_PLAN.md`.

| Step | Where | What |
|---|---|---|
| F8.1 | SP1 `functions/src/customers/address-freshness.ts` + `customers/sync.ts` (`slSyncCustomerFromSp2`) | One address save in SP2 fires several pushes. SP1 now **reads the addresses from the SP2 `addresses` collection** when the push arrives, and writes in a transaction that drops a read older than the saved one (`sp2AddressesReadAt`). Before, an old snapshot could win, and the shipping label printed the old address. |
| F8.2 | SP1 `customers/encomienda-suggestion.ts` + `customers/sync.ts`; client `lib/services/encomienda-lookup.ts` | The service the customer **proposed** (not in the list) reaches SP1 as `encomiendaSuggestedName`, plus a note at the start of `deliveryInstructions`, which the label prints. An official service removes both. When a current SP2 address states `requiresEncomienda`, SP2 is the truth for the address encomienda; legacy documents keep SP1's value (G7). The SP1 admin's choice (top-level `encomiendaServiceName`) is never touched. |
| F8.3 | SP1 `client/lib/nova/encomienda-badge.ts` + `NovaTableModal.tsx`; `invoice-service.ts` | In Nova, only customers on the Encomiendas route show a badge: their service, or **"Servicio de terceros"** when it is not in the list (the admin checks it by hand). The default address comes first (G2). |
| F8.4 | SP2 `components/dashboard/address-modal/single-address.ts` + `DeliveryAddresses.tsx`, `EnhancedAddressModal.tsx`, `AddressManagerModal.tsx`, `SupportChat.tsx` | **One address.** The card shows it directly with the edit button. The modal opens straight on the edit screen, and Cancelar closes it. There is no "Agregar Nueva Dirección" (a new address only while there is none). The existing rule still applies: the address can't change while invoiced packages are in process. |
| F8.5 | SP2 `scripts/single-address-cleanup.cjs` | Data: customers with more than one active address keep the principal; the others become **inactive (not deleted)**. When several are marked principal, it keeps the one SP1 labels use today. **Production dry-run:** 176 of 2629 customers, 199 addresses. |

### Phase 9: SP1 RoutesManagement "Entregado" → SP2 (the reported gap)

SP2 `src/functions/src/sp1-shipment-copies.ts`, `sp1-shipment-sync.ts`, `sp1-tracking-match.ts`. Found with production data:

1. **Recycled number.** The status sync took the newest document with that number, which was another customer's. Because the admin sync is forced, it reassigned that package and marked it delivered, while the real one stayed "En ruta". Now the document of the package's own customer is taken first (`pickCustomerDoc`).
2. **Two copies of one package.** The legacy pre-alert twin (`{tracking}_{uid}`) and the invoice-sync copy. Only one was updated, so the other stayed "En ruta" and the invoice card never reached Entregados. For long USPS barcodes, neither was updated: the matcher returned "ambiguous", and the admin saw "SP2 sin cambios".

   Now:
   - copies of one package (same number, same customer) resolve to the preferred copy (`preferredCopyOfOnePackage`);
   - the same status goes to every copy of that customer (`isSameCustomerCopy`);
   - it never touches another customer's copy and never goes backwards unless forced.

e2e `sp1-delivered-copies.cjs`: **0/5 before, 5/5 after**.

### Small SP2 adjustments requested

- **Dashboard:** the status selector (Facturados / Pre-alertados / Entregado) uses the Paquetes/Facturas tab design, and the "+ Pre-alertar" hint is gone.
- **Encomienda search:** matches "starts with" (`encomienda-search.ts`): "CO" → Correos first; "Correos C" → Correos de Costa Rica.
- **Atenas** is inside the GAM (`public/data/encomiendas.json`). `routes.json` already had it in the metropolitan route Occidente.

## Test status (last full round)

- Emulator runner: 75/75, 0 changes against the Nova golden. After that round: F9 5/5, addresses 8/8 + UI 20/20.
- SP1 suite: 2829/2829. `npx vitest --run` includes `functions/test`; the old `jest` runner of `functions/` does not compile TypeScript, so do not use it.
- SP2 functions: 796/796.
- SP2 browser suite: 1616/1617. The only failure is a live test against the production middleware (network, flaky).

## Pending: needs approval or a decision

1. **Deploy together:**
   - SP1 functions (F8.1, F8.2) and SP1 hosting (F8.2, F8.3);
   - SP2 functions (Phase 6 cache, F9, and the earlier Phases 3–4) and SP2 hosting.
2. **Data**, each script dry-run first, then `--apply` with approval:
   - `single-address-cleanup.cjs` (F8.5);
   - the N13 close backfill;
   - F4.0 cleanup;
   - the packages stuck behind their copy (F9, being counted).
3. **Queued phases:**
   - F10: consolidation "Día 1" per invoice;
   - F11: label and encomienda-manifest address audit;
   - "Pre-Alertar Rápido" visual refinement.
4. **Demo data** QADEMO on SL25001 (production): remove with `node scripts/qa-demo-account-scenarios.cjs --project smart-portal-2 --cleanup --apply` when done.
