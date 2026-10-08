# Phase 8: one address per customer, instant SP2 → SP1 sync, encomienda service

2026-09-25. The change is functional. There are no UI/UX changes other than the two requested:
- the "Agregar Nueva Dirección" step is removed;
- the encomienda service is shown in Nova.

## Rules (user's decision)

1. **One address per customer in SP2.** It is the principal (default) address. The customer can edit it, but cannot add another one.
2. **What the customer saves in SP2 must be in SP1 right away** (`customers/{slCode}`). This data feeds the shipping labels and the encomienda manifest. The sync is create/update with no queue that delays it, and it must never leave data out of date.
3. **Zone outside the GAM:** the customer picks a service from the list. If theirs is not listed, they propose it. The proposal:
   - goes to SP1 for approval, as today;
   - is ALSO stored as a note on the address, so the label shows it.

   The SP1 admin decides whether to edit it.
4. **Nova:** for customers on the Encomiendas route, show WHICH service. If the service is not one of the list, show **"Servicio de terceros"** so the admin checks it by hand.

## Current flow (analysis)

### When the customer saves an address in SP2

- The source of truth is the SP2 `addresses` collection.
- One save writes the address. Then both the client (`syncLocationFromAddresses`) and the server (`slAddressDenormalizer`) copy the list into `users.addresses`.
- Each write fires triggers that call SP1 `slSyncCustomerFromSp2`:
  - `onAddressWrittenAlert`
  - `onUserProfileWritten` (×2)
  - `slUserProfileUpdated` (×2)
- Result: **up to 5 concurrent pushes, each with its own snapshot.**

### SP1 `slSyncCustomerFromSp2`

- It trusts the payload's addresses and writes with no ordering check. The last push to arrive wins.
- A push that left earlier with an old snapshot (for example, `users.addresses` before the denormalizer ran) can arrive last. **SP1 then keeps the OLD address and the labels print it.**

### Labels and encomienda manifest (SP1)

They read `customers/{slCode}`:
- `defaultAddress`, else the `isDefault` address, else `addresses[0]`;
- `resolveCustomerEncomiendaService`.

## Gaps found

| # | Gap | Effect |
|---|---|---|
| G1 | SP1 applies pushes "last one wins", with no order check, and trusts the payload | Out-of-date address in SP1, so the label shows the wrong address |
| G2 | Several addresses per customer | Ambiguous default. Nova (`invoice-service` l.204) takes the FIRST address with an encomienda, not the default |
| G3 | The service the customer proposes (`encomiendaPendingReview` / `encomiendaSubmittedName`) is lost in the SP1 transform | The label and Nova don't know which service it is |
| G4 | Nova shows only `encomiendaServiceName`, and only when it exists | An Encomiendas customer without a known service shows nothing. There is no "Servicio de terceros" |
| G5 | The Nova badge shows even when the route is NOT Encomiendas (leftover from an old address) | Confuses the admin |
| G7 | SP1 "preserves" the address encomienda even when SP2 says it is no longer needed (customer back inside the GAM) | The label still shows encomienda with the old service |
| G6 | Proposal limit: 1 per month. If it is used up and the service is not in the list, the address cannot be saved | The customer gets stuck (to review in F8.4) |

## Plan, in order (one fix per commit, tests + emulator)

| Step | System | Change |
|---|---|---|
| F8.1 | SP1 functions | `slSyncCustomerFromSp2`: the addresses are READ from the SP2 `addresses` collection at the moment of the push (not from the payload). The write is ordered: a transaction on `sp2AddressesReadAt` drops a snapshot older than the one already saved. If the SP2 read fails, it falls back to the current behavior. |
| F8.2 | SP1 functions + client | The transform keeps `encomiendaPendingReview` / `encomiendaSubmittedName`. The customer's proposal goes into the address as a note ("Encomienda sugerida por el cliente: X"), which the label already prints, and `resolveCustomerEncomiendaService` uses it when there is no official service. Admin changes in SP1 are still preserved (`encomiendaServiceName`). G7: when SP2 says `requiresEncomienda:false` the old address encomienda is cleared; when it does not say (legacy) it is kept as before. |
| F8.3 | SP1 Nova | Only when the route is Encomiendas: show the service from the DEFAULT address or from the SP1 assignment. If it is not in the list, or there is none: **"Servicio de terceros"**. `invoice-service` uses the default address. |
| F8.4 | SP2 UI | With 1 address, "Agregar Nueva Dirección" disappears. With 0 it stays (onboarding). The list shows only the principal. Support chat text updated. G6 reviewed. |
| F8.5 | Data | Script, dry-run first: customers with more than one active address. Keep the principal (else the newest); the others are marked `isActive:false` (**not deleted**), with a log. Apply ONLY with approval. |
| F8.6 | QA | Emulator e2e for the address change SP2 → SP1: 3 fast edits must leave the LAST one in SP1 in seconds. Also: proposed encomienda reaches the label, Nova shows service / "Servicio de terceros", and the F7 regression runs again. |

No push or deploy without approval. Deploy together: SP1 functions (F8.1, F8.2), SP1 hosting (F8.2, F8.3), SP2 hosting (F8.4).
