# Agent Execution Rules for SmartLogistics Workspace

These rules govern the development, auditing, and maintenance of the SmartLogistics codebase. Always adhere strictly to these constraints.

## 0. REGLAS CARDINALES DE AUTORIZACIÓN Y CONTROL OPERATIVO (STRICT MANDATORY)
1. **PROHIBICIÓN TAXATIVA DE MUTACIÓN O ALTERACIÓN DE DATOS SIN AUTORIZACIÓN**:
   - Queda estrictamente prohibido crear, alterar, sobreescribir o eliminar datos en bases de datos (Firestore SP1 / SP2, Storage, etc.) de forma ad-hoc sin la autorización explícita previa del usuario.
2. **PROHIBICIÓN DE DISPARO DE FUNCIONES O APIS SIN AUTORIZACIÓN**:
   - Queda estrictamente prohibido ejecutar Cloud Functions, enviar correos (Resend/SendGrid), emitir SMS o invocar APIs externas que afecten a usuarios o al backend sin autorización explícita previa, incluso si es para propósitos de prueba o diagnóstico.
3. **PROHIBICIÓN DE DEPLOYS, BUILDS AUTOMÁTICOS O EJECUCIÓN DE PRUEBAS SIN AUTORIZACIÓN**:
   - Queda estrictamente prohibido desplegar a producción (Firebase Hosting, Functions), realizar force-pushes de tags o ejecutar suites de pruebas de forma automática sin la instrucción y autorización directa del usuario.

## 1. Zero-Regression & Type Safety
- **Defensive Type Conversions**: Always parse Firestore fields defensively before applying numeric operations (e.g. `.toFixed()`). Use `safeToFixed` or cast objects as `any` where schemas don't match, keeping typescript compilation 100% clean.
- **Run Type Checks**: After editing any TypeScript file in either frontend or backend, always run the project's type checker (`npm run typecheck` or `npx tsc --noEmit`) to verify there are zero compilation errors before proposing deployment.
- **Idempotency**: Maintain idempotent sync functions. Syncs must use the source entity's ID as the document ID in the destination, allowing re-syncs to update rather than duplicate.

## 2. Token & Execution Efficiency (Harness-First Protocol)
- **Token Conservation & Deep Planning**: Plan deeply and accurately before executing any diagnostic. Avoid generating multiple redundant scripts or verbose exploratory files for a single debugging task. Consolidate inspections into concise, high-impact queries.
- **Harness-First Approach**: Always leverage existing test harnesses, built-in utilities, existing spec files (`.spec.ts`), and native Firestore / API discovery tools before writing new scripts.
- **Targeted Deployment**: Never deploy the entire suite of Cloud Functions unless requested. Only deploy the specific function you modified using firebase CLI filters (e.g., `--only functions:smartlogistics:<FunctionName>`).
- **Contiguous Edits**: Use `replace_file_content` for single contiguous edits. Only use `multi_replace_file_content` for non-adjacent changes. Avoid replacing entire file contents.

## 3. Date & Timeline Consistency
- **Safe Date Parsing**: When formatting dates, use `safeFormatDate` to parse and format them locally (`es-CR` for Costa Rica local time representation). Never perform double formatting on strings that are already formatted (like `DD/MM/YYYY`).
- **No Cascade Loops**: Always check `sp1LastPushAt` or similar sync markers before propagating user updates to avoid infinite ping-pong triggers between the portals.

## 4. Mandatory Automated Testing & Spec Inviolability Mandate
- **Mandatory Automated Testing for Every Change**: Every feature, bug fix, or data transformation MUST include solid, high-integrity automated tests (`.spec.ts`) capable of catching regressions, edge cases, and systemic failures.
- **Strict Prohibition Against Relaxing / Tampering with Specs**: When an existing test in `.spec.ts` fails, the agent is **STRICTLY PROHIBITED** from altering, deleting, or relaxing test assertions just to make the suite pass. The agent MUST analyze deeply whether the failure exposes a real regression or bug in the system. Test expectations represent frozen architectural contracts.
- **E2E Pre-flight Checklist**: Whenever modifying routes, layout, permissions, or components on critical views (such as the Nova table), you MUST execute `npm run test` and Playwright E2E tests in headless mode (`headless: true` in CI) to verify the application operates correctly.

## 5. Firebase Hosting & Environment Separation
- **Strict Project Isolation**: 
  - **smart-portal-1 (Admin/Nova Portal)**: MUST ONLY be deployed to the Firebase project `smart-portal-admin` under the hosting site `smart-portal-admin`. Canonical domain: `https://portal.smartlogisticscr.com`.
  - **smart-portal-2 (Customer Portal)**: MUST ONLY be deployed to the Firebase project `smart-portal-2` under the hosting site `smart-portal-2` (target: `portal-2`). Canonical domain: `https://smartlogisticscr.com`.
- **No Target Mixing**: Never map `smart-portal-2` deployment targets or configurations to `smart-portal-admin`.

## 6. Nova Manifest Data Immunity & Route Overwrite Safety
- **`FIRESTORE_POLICY.allowAutoDivergentRematch: false`**: Master customer route profiles (`customers/{slCode}.ruta`) MUST NEVER be auto-overwritten during table rendering or background auto-saves when re-opening existing manifests.

## 7. ENC-MEGA-MAN Encomienda Isolation & Embedded Array Cleaning Safety
- **Strict Exclusion Guard**: When loading any non-ENC manifest (e.g. source manifest like `23-07-2026DAN`), `loadMegaManFromFirestore` MUST filter both `packages` collection queries AND `embeddedSupplement` array to exclude any package where `ruta === 'Encomiendas'` or `manifestNumber` starts with `ENC-MEGA-MAN-`.

## 8. Git Branching, Release & Rollback Protocol (Synchronized with `docs/ROLLBACK_AND_MITIGATION_RUNBOOK.md`)
- **Branch Topology**:
  - `main`: Protected production trunk. Deployed to production hosting site `smart-portal-admin`.
  - `staging`: Protected pre-production validation branch for QA review.
  - `feature/*` / `fix/*`: Short-lived branches merged via PR after full test pass.
  - `hotfix/*`: Emergency patches branching from `main`, fast-tracked with tests and dual back-merged to `main` and `staging`.
- **Release & Tagging Workflow**:
  1. Increment the version in `package.json` (`node scripts/deploy/increment-version.js`).
  2. Document the release changes under the correct version in `CHANGELOG.md`.
  3. Create an annotated tag for the release version (e.g. `v0.0.1568`).
  4. Move floating `prod` tag: `git tag -f prod && git push origin prod --force`.
  5. Push the version tag: `git push origin "v$VERSION"`.
- **Rollback Protocol**: In case of deployment incident, follow Protocol A from `docs/ROLLBACK_AND_MITIGATION_RUNBOOK.md` (checkout last stable tag, build, and deploy to hosting).

## 9. Strict Code Modification & Safety Protocol
- **Dual Analysis Mandate**: Under no circumstances can you modify any codebase files without analyzing the affected logic, existing comments, and dependencies **at least twice** beforehand.
- **Scenario Planning**: You must elaborate detailed validation scenarios and write a solid implementation plan before executing edits to ensure zero regressions and prevent introducing issues in other system functions.
- **Documentation Mandate**: Every code modification must be accompanied by clear, descriptive inline comments explaining the context, logic, date, and safeguard mechanisms implemented. This prevents future developers or AI agents from accidentally breaking safeguards and saves token overhead by maintaining explicit context within the files.

## 11. Strict Email Template Immutability & Corporate Image Protection
- **No Ad-Hoc Email Templates**: Under NO circumstances may any script, function, or tool call construct, modify, or send custom ad-hoc email templates to customers. All invoice and transactional emails MUST strictly and exclusively use the official canonical templates located in `functions/templates/` (e.g. `functions/templates/invoice-email.html`).
- **No Direct Diagnostic Email Dispatch to Live Customers**: The agent and automated scripts are STRICTLY PROHIBITED from sending live emails to real customer email addresses during debugging, diagnostics, or repairs. Testing must strictly target internal test mailboxes or mock assertions. Live customer communications must only be triggered through the official web application UI by human operators.
- **Zero Raw Placeholders**: All template variables (including `{{TC_CRC_ROW}}`, `{{CONSOLIDATION_BADGE}}`, `{{PERMIT_DISCLAIMER}}`, etc.) MUST be completely resolved and sanitized before dispatch. Sending unrendered placeholder tags (like `{{...}}`) is strictly prohibited as it compromises the legal, commercial, and professional image of the enterprise.
- **Official Delivery Pipeline**: Any email dispatch must always go through the authoritative server pipeline (`sendInvoiceEmailFunction` / `email-service.ts`) using verified sender identities (`facturacion@smartlogisticscr.com` / `no-reply@smartlogisticscr.com`).
- **Mandatory Dynamic Update**: Every time these expert sub-agents or skills are invoked, their respective instruction files (`SKILL.md`) **MUST** be updated to document the latest scenarios, constraints, or configurations discovered during the session, ensuring they remain continuously up to date and aligned with the codebase.
- **Dedicated Subagent Roles**:
  1. **Verification & Peer Review Subagent**: Responsible for verifying code correctness, performing code reviews, and validating PR integration.
  2. **Security & Performance Auditor Subagent**: Responsible for checking queries, Firestore rules, API security, bundles size, and execution speed.
  3. **Miscellaneous Subagent**: Responsible for repo cleaning, formatting, git tags, and metadata chores.
  4. **QA Quality Assurance Subagent**: Responsible for running tests, double-checking test coverage, edge cases, and certifying changes before any deployment.

## 11. Nova Contextualization & Code Verification Mandate
- **Mandatory Documentation Reference**: Any agent interacting with, modifying, or auditing the Nova manifest module MUST read and use the canonical reference [docs/nova_scenarios_and_workflows.md](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/docs/nova_scenarios_and_workflows.md) to contextualize state transitions, database field changes, and dependencies.
- **Mandatory Code Investigation**: Agents are strictly obligated to read and analyze the actual code in the workspace (such as [fusion.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/manifest-processor/fusion.ts), [ingestion.ts](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/lib/services/manifest-processor/ingestion.ts), and [NovaTableModal.tsx](file:///Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/client/components/nova/NovaTableModal.tsx)) to ensure full alignment and prevent regressions in all associated components (pre-alerts, invoices, SP2 sync, etc.) before proposing plan updates or executing changes.

## 12. Bug Documentation & Test-Driven Safeguards
- **Mandatory Bug Documentation**: Every scenario or bug identified must be explicitly documented in the codebase (inline comments detailing context, date, root cause, and safeguard) and in the canonical documentation (e.g. `docs/nova_scenarios_and_workflows.md`) to guide future developers and prevent regression errors.
- **Mandatory Regression Tests**: For every bug fix, the agent MUST write automated regression tests (using Vitest or appropriate frameworks) that emulate the exact failure scenario and assert that the fix successfully prevents it from re-appearing, guaranteeing type checking and test suites remain 100% clean.

## 13. Encomienda Service ID Resolution & Pre-alert Priority
- **Firestore Courier ID Resolution**: Custom approved courier services in Firestore (SmartWeb) use alphanumeric document IDs (e.g., `pDc38GwsIiAyt6cfP2Y5`) for `encomiendaServiceName` and `encomiendaProvider`. AI agents MUST always use the `useEncomiendaLookup` hook or `resolveEncomiendaName` utility (from `client/lib/services/encomienda-lookup.ts`) to resolve these IDs to human-readable names (e.g., "Transportes Guanacaste") before rendering them in Nova badges, tooltips, or printing them on shipping labels.
- **Pre-alert Priority and Name Discrepancies**: Pre-alerts have the highest matching priority (Priority 1) in Nova. If a tracking matches a pre-alert, the package is assigned to the matching customer even if the name on the manifest (e.g., "DION E PRINCE") is different from the customer name (e.g., "ERIKA LOBO SANCHEZ"). This is the correct behavior; a yellow `1 diferente` badge is displayed to warn the operator, but the match must be preserved.

## 14. Encomienda Bulk Labels Printing & Fallback Isolation
- **Fallback for Unregistered/Failed Lookups**: In `EncomiendaBulkLabelModal.tsx`, when loading customer data, if the client lookup fails or is not registered, the code MUST NOT return `preview: null`. Instead, it must construct a fallback `ParcelPreview` using the basic manifest/queue fields (with empty strings for phone/DNI/address and default underscores for address line writing), ensuring that the label is generated and printed.
- **Amber Warning Contours**: Any label with missing data (`hasMissingData: true`) must be highlighted with an amber border and the flag `"FALTAN DATOS (IMPRIME EN BLANCO)"` on screen, with failed lookup clients listed in the warning banner at the top of the modal.
- **Coexistence of Print Action Buttons**:
  - **Imprimir todas (M)**: Always prints the entire selection, including fallbacks, guaranteeing the total sheet count matches the selection.
  - **Imprimir completas (N)**: Filters out labels with `hasMissingData: true`, printing only the ones with complete data. This button is only rendered if `okCount - failCount > 0`.

## 15. Zero-Price Lock & Manifest Pricing Invariants (Non-Bypassable Constraint)
- **Absolute Pricing Invariant**: Under NO circumstances can any item with `peso > 0` have a price of `0` / `$0.00` in the Nova table, footer calculations, Firestore persistence (`saveManifestRecord`), Firestore hydration (`loadMegaManFromFirestore`), or invoice generation (`buildInvoiceData`) across ANY manifest type (USA Air/Sea, China Air/Sea, Colombia Air/Sea, Mexico Air/Sea, Encomiendas, Mega-Man).
- **Post-Mortem: AI Regression Root Cause**: In JavaScript, the nullish coalescing operator (`??`) treats numeric `0` as a valid truthy value (since `0 !== null && 0 !== undefined`). A previous AI code refactor erroneously implemented `(loadedFromFirestore ? row.precio : undefined) ?? fallback`. When packages were loaded from Firestore with a stored `precio: 0` (or unpriced imports), `0` blocked the fallback calculation, resulting in $0.00 prices being displayed and invoiced.
- **Enforcement Rules for All Future Edits**:
  1. **Strict Positive Check**: Any check for saved prices MUST explicitly validate `typeof row.precio === 'number' && row.precio > 0`. Numeric `0` or negative values MUST be treated as invalid and rejected.
  2. **Deterministic Calculation Fallback**: If a row has `peso > 0` and resolved price is `<= 0`, the system MUST calculate the price deterministically via `calculatePrice(peso, country, shippingType, 'regular', row.permisos)`.
  3. **Invoice Shield**: In `invoice-service.ts`, `buildInvoiceData` MUST inspect each item before emission, recalculating via `calculatePrice` if `amount <= 0` and deriving `rowsTotalUSD` strictly as the sum of line items to prevent invoice drift.
  4. **Preservation of Overrides**: Manual operator overrides (`priceOverrides[tracking]`) and price adjustments (`ajustePrecio`) MUST always maintain highest priority in the resolution cascade.
  5. **Automated Vitest Regression Suite**: All price calculations and invariants are covered by `use-nova-price-invariants.spec.ts` and `NovaCalculationsAndGroups.spec.tsx`. No PR or commit may be merged if any invariant fails.
  6. **DUA & Customs Retention Isolation (Zero-Weight Rule)**: When an item arrives with `peso === 0` (or `peso <= 0`), it represents a DUA / package retained in customs. The system MUST preserve `peso: 0` and `precio: 0` (rendering the red `DUA` badge in table), without triggering automatic minimum weight tariffs ($8.00). If an operator assigns a manual clearance fee via price override, that fee is honored. When customs releases the parcel and the real weight is recorded (`peso > 0`), standard tariff calculations automatically activate.

## 16. Multi-Repository Dual-Sync Mandate (`smart-portal-1` ➔ `smartportal`)
- **Architecture & Separation**:
  - `smart-portal-1` is the active development workspace repository (`git@github.com:jbricenoz/smart-portal-1.git`).
  - `smartportal` is the client/organization clean delivery repository (`git@github.com:director-smart-logistics/smartportal.git`).
- **Strict Parity Mandate**: Whenever the user requests to sync, release, or deploy changes, the AI agent MUST execute `npm run sync:smartportal` (or run `node scripts/deploy/sync-to-smartportal.mjs "<description>"`) to propagate all changes cleanly to `director-smart-logistics/smartportal:main`.
- **Internal Script Isolation**: `scripts/deploy/sync-to-smartportal.mjs` and sync commands MUST ONLY live in `smart-portal-1` and are explicitly excluded from `smartportal`.
- **Push Protection Compliance**: Never commit hardcoded secrets, sample API keys, or raw OAuth tokens to any repository. All credentials must be read via `process.env`.
