---
description: Nova AI Manifest Processor — architecture, patterns and constraints
---

# Nova Module — AI Context Rules

Nova is SmartLogistics' AI-powered manifest processing engine. These rules exist so the AI assistant always understands the architecture before suggesting or making changes.

---

## Module Structure

```
client/lib/nova/
  types/     → shared interfaces only (no runtime code)
  core/      → manifest-processor, permit-detector, pricing-service
  ai/        → gemini-client (name verification, validation, weight correction)
  matching/  → customer-matcher, match-learning, customer-sync
  learning/  → ai-manifest-service, manifest-learning-service
  agent/     → nova-agent-engine, nova-tools

client/lib/services/           ← canonical implementation files (never move these)
client/components/nova/        ← all React components for the Nova UI
client/hooks/use-nova-chat.ts  ← state management for the Nova page
client/hooks/use-manifest-agent.ts ← agent lifecycle and greeting logic
client/pages/Nova.tsx          ← route /nova (ProtectedRoute resource="manifests")
```

**Import rule:** Always import from the barrel (`@/lib/nova`) or submodule barrel (`@/lib/nova/core`). Never reach directly into `@/lib/services/manifest-processor` from a component or page.

---

## Dependency Order (innermost → outermost)

```
pricing (lib/pricing) ← pure math, no Firebase
  ↓
permit-detector       ← pure string logic, no Firebase
  ↓
gemini-client         ← AI calls, no Firebase
  ↓
customer-matcher      ← Firebase reads + AI
  ↓
manifest-processor    ← orchestrates all of the above
  ↓
manifest-learning-service ← analysis + Cloud Function call
  ↓
ai-manifest-service   ← Firestore persistence
  ↓
nova-tools            ← Firestore reads for agent
  ↓
nova-agent-engine     ← Gemini multi-turn loop
```

**Never introduce circular dependencies across these layers.**

---

## Critical Constraints

### Pricing
- **NEVER** ask Gemini to calculate prices.
- All pricing goes through `@/lib/pricing` — deterministic, testable functions.
- `calculatePrice(peso, country, shippingType, category, requiresPermit)` is the single entry point.

### AI Calls (Gemini)
- Always **batch** Gemini calls — never call per-row in a loop.
- `verifyNames(names[])` and `correctWeights(weights[])` accept arrays.
- `geminiDisabled` flag auto-disables after the first hard failure — respect it.
- Model: `gemini-2.5-flash` for the agent, `gemini-2.5-flash` for manifest validation.

### Customer Matching
- Match pipeline: **exact → normalised → fuzzy → learned → AI** (in that order).
- Learned matches (`match-learning.ts`) take priority over AI suggestions.
- `batchFindCustomerMatchesWithAI()` is the canonical entry point from `manifest-processor`.
- `invalidateCustomerCache()` must be called after bulk customer imports.

### Firestore Collections
| Collection | Purpose |
|---|---|
| `CUSTOMERS` | Customer slCode + ruta lookup |
| `PRICING` | Dynamic pricing configurations |
| `ai_manifest_interactions/{uid}/sessions` | Chat sessions |
| `ai_manifest_interactions/{uid}/manifests` | Processed manifest history |
| `ai_manifest_interactions/{uid}/context/current` | Agent context snapshot |
| `manifest_learning/{id}` | Per-manifest bug & improvement records |
| `manifest_learning_patterns/{type}` | Aggregated patterns by manifest type |
| `match_learning` | Confirmed customer-name → slCode mappings |

### Email Reports
- After every manifest, `recordManifestLearning(result, userId)` is called in `use-nova-chat.ts`.
- It saves to Firestore then calls Firebase Function `slManifestReport` → Resend → `director@smartlogisticscr.com`.
- This is **non-blocking** — errors must not break the UI flow.

---

## Component Responsibilities

| Component | Responsibility |
|---|---|
| `NovaDropzone` | File input (Excel/CSV), validates type/size |
| `NovaMessage` | Renders a single chat message with result summary, corrections, pricing breakdown |
| `NovaRowModal` | Multi-match resolution UI — grouped by slCode with collapsible headers |
| `NovaChatArea` | Scrollable message list |
| `NovaInputArea` | Textarea input + send button |
| `NovaWelcome` | Empty-state welcome screen |
| `NovaHeader` | Page header with clear button |
| `NovaProcessingIndicator` | Step-by-step progress display |

---

## Testing Requirements

- Every pure function in `core/` and `matching/` **must** have a corresponding Vitest spec.
- Spec files live next to the implementation: `manifest-processor.spec.ts`, `permit-detector.spec.ts`, etc.
- AI-dependent functions are tested with **mocked** Gemini responses — never call the real API in tests.
- See `.windsurf/rules/testing.md` for the full testing contract.

---

## When Modifying Nova

1. Run `pnpm typecheck` — zero new errors allowed.
2. Run `pnpm test` — no existing tests may regress.
3. If you add a new service function, add it to the appropriate barrel (`lib/nova/<submodule>/index.ts`).
4. If you add a new component, export it from `components/nova/index.ts`.
5. If you change a `ManifestRow` or `ProcessingResult` field, update the spec fixtures in `manifest-processor.spec.ts`.
