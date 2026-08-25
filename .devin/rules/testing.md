---
description: Testing contract — Vitest rules to prevent regressions across the codebase
---

# Testing Rules

## Stack
- **Runner:** Vitest (configured in `vite.config.ts`)
- **Command:** `pnpm test` (watch), `pnpm test --run` (CI)
- **Coverage:** `pnpm test --coverage`

---

## Golden Rules

1. **Never delete or weaken a test.** Tests are the ground truth. If a test fails, fix the production code — never change, skip, or weaken the test to make it pass.
2. **Run `pnpm test --run` after every code change.** If any test fails, stop and fix the implementation before proceeding or deploying.
3. **Tests failing = broken code, not broken tests.** Investigate the root cause in the implementation. Only modify a test if the business requirement itself changed and the user explicitly confirmed it.
4. **Spec files live next to the implementation** — `foo.ts` → `foo.spec.ts` in the same folder.
5. **No real API calls in tests.** Mock Gemini, Firebase, and Resend using `vi.mock`.
6. **No real Firestore in tests.** Use `vi.mock('@/lib/firebase/config')` returning a mock `db`.
7. **Test the contract, not the implementation.** Assert on inputs/outputs, not internal variables.
8. **Every bug fix MUST include a regression test.** Before closing any bug, add at least one test that would have caught it. The test must document the exact failure mode (e.g. "regression: old code produced X, correct code produces Y"). No exceptions.

---

## Mandatory Test Workflow (STRICT — no exceptions)

Every time code is changed:

```
1. Make the code change
2. Run: pnpm test --run
3. If ALL tests pass → proceed / commit / deploy
4. If ANY test fails:
   a. Read the failure output carefully
   b. Find the root cause in the IMPLEMENTATION (never in the test)
   c. Fix the implementation
   d. Re-run pnpm test --run
   e. Repeat until all pass
5. Never commit or deploy with failing tests
```

**FORBIDDEN actions when a test fails:**
- Deleting the failing test
- Adding `.skip` or `xit` / `xdescribe`
- Weakening an assertion (e.g. changing `toBe(12)` to `toBeGreaterThan(0)`)
- Commenting out the test or the assertion
- Changing expected values to match wrong output

---

## File Naming

| What | Convention |
|---|---|
| Unit test | `<file>.spec.ts` |
| Component test | `<Component>.spec.tsx` |
| Integration test | `<feature>.integration.spec.ts` |

---

## What Must Be Tested

### Nova Core (`client/lib/services/`)

| File | Must test |
|---|---|
| `manifest-processor.ts` | `generateCSV`, `generateXLSX` output shape; row sort order by slCode; pricing fields populated; unmatched rows last |
| `permit-detector.ts` | All 4 detection functions with permit/no-permit inputs |
| `customer-matcher.ts` | Score ranking; exact match returns score=1; unknown name returns candidates sorted desc |
| `match-learning.ts` | `lookupLearned` exact, token, and no-match cases |
| `manifest-learning-service.ts` | Bug detection: B001 unmatched, B003 zero-price, B004 duplicates; improvement generation |
| `gemini-client.ts` | All functions with mocked Gemini responses |

### Pricing (`client/lib/pricing/`)

| File | Must test |
|---|---|
| `calculator.ts` | All weight tiers for USA air; permit surcharge addition; zero-weight edge case |

---

## Mock Patterns

### Mock Gemini
```typescript
vi.mock('@/lib/services/gemini-client', () => ({
  verifyNames: vi.fn().mockResolvedValue(new Map()),
  validateManifestData: vi.fn().mockResolvedValue({ isValid: true, issues: [], suggestions: [] }),
  aiSelectBestMatch: vi.fn().mockResolvedValue(null),
  aiFindPotentialMatches: vi.fn().mockResolvedValue([]),
  correctWeights: vi.fn().mockResolvedValue(new Map()),
}));
```

### Mock Firebase
```typescript
vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  serverTimestamp: vi.fn(() => 'mock-ts'),
  // ... add as needed
}));
```

### Mock pricing service (for manifest-processor tests)
```typescript
vi.mock('@/lib/pricing', () => ({
  calculatePrice: vi.fn().mockReturnValue({ price: 8, priceWithPermit: 11 }),
  pricingService: { calculate: vi.fn().mockReturnValue({ price: 8, priceWithPermit: 11 }) },
}));
```

---

## Fixture Pattern

Always define typed fixtures at the top of each spec file:

```typescript
const ROW: ManifestRow = {
  tracking: 'TEST123',
  nombre: 'JUAN PEREZ',
  guia: '',
  manifiesto: 'M001',
  peso: 1.5,
  precio: 12,
  precioSinPermiso: 12,
  precioConPermiso: 15,
  slCode: 'SL-001',
  nombreCliente: 'JUAN PEREZ',
  ruta: 'RUTA-A',
  consolidacion: false,
  descripcion: '',
  permisos: false,
  pesoRedondeo: 2,
  diferenciaRedondeo: 0.5,
  pesoConsolidacion: 0,
  originalData: {},
};
```

---

## Coverage Targets

| Area | Target |
|---|---|
| `lib/pricing/` | 90%+ |
| `lib/services/permit-detector.ts` | 95%+ |
| `lib/services/manifest-learning-service.ts` | 80%+ |
| `lib/services/manifest-processor.ts` | 70%+ |
| `lib/services/customer-matcher.ts` | 60%+ |

---

## CI Check

All of these must pass before merging:
```bash
pnpm typecheck   # zero errors
pnpm test --run  # zero failures
```
