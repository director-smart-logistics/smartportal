---
description: Smart Portal Admin — project conventions, architecture rules, and AI coding standards
---

# Smart Portal Admin — Project Rules

## Tech Stack (non-negotiable)

- **Package manager**: `pnpm` — never use `npm` or `yarn`
- **Frontend**: React 18 + React Router 6 (SPA) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server (port 8080)
- **Database**: Firebase Firestore (client SDK)
- **Auth**: Firebase Auth via `FirebaseAuthProvider`
- **Testing**: Vitest — run `pnpm test` before every commit
- **UI components**: Radix UI + shadcn/ui in `client/components/ui/`
- **Icons**: Lucide React only — see `.windsurf/rules/icons.md`

---

## Architecture Rules

### Routing
- All routes defined in `client/App.tsx` — one file, one source of truth
- Every new route must use `<ProtectedRoute resource="...">` unless it is a public auth page
- Lazy-load all page components with `lazy(() => import(...))`
- Add the nav item to `client/config/navigation.tsx` — include `roles`, `section`, `keywords`

### i18n
- All user-facing strings go through `useLocale('namespace')` — no hardcoded Spanish/English
- New feature = new namespace file in both `client/i18n/en/` and `client/i18n/es/`
- Register namespace in `client/i18n/config.ts` (import + add to both `en` and `es` resource objects)
- Add menu keys to `client/i18n/en/menu.json` and `client/i18n/es/menu.json`
- Key parity rule: every key in `en/` must exist in `es/` and vice versa — enforced by tests

### Styling
- **No inline styles** — use TailwindCSS utility classes only
- Use `cn()` from `@/lib/utils` for conditional classes
- Brand red: `red-500` / `red-600` for primary interactive elements (focus rings, active states, badges)
- Follow existing color patterns — check adjacent components before picking new colors
- Responsive design: always add media query breakpoints (`sm:`, `md:`, `lg:`, `xl:`)
- Accessibility: ARIA roles, `aria-label`, `role="status"` + `aria-live` for dynamic regions

### State & Data
- Firestore reads use `getDocs` / `onSnapshot` from `@/lib/firebase/config`
- Collection constants live in `@/lib/firebase/firestore-client` (`COLLECTIONS.*`)
- Never hardcode collection names — always use `COLLECTIONS.*`
- React Query (`@tanstack/react-query`) for server state — `staleTime: 0`, `gcTime: 0`
- Local session state: `sessionStorage` (scanner, temporary UI state)
- Persistent user prefs: `localStorage`

### Server / API endpoints
- Only create Express endpoints for: private key handling, server-side DB operations, proxies
- All endpoints prefixed with `/api/`
- Shared types between client and server in `shared/api.ts`

---

## File Conventions

### New page checklist
1. Create `client/pages/<feature>/<FeatureName>.tsx`
2. Add lazy import in `client/App.tsx`
3. Add `<Route>` with `<ProtectedRoute>` in `client/App.tsx`
4. Add nav item in `client/config/navigation.tsx`
5. Create `client/i18n/en/<feature>.json` + `client/i18n/es/<feature>.json`
6. Register namespace in `client/i18n/config.ts`
7. Add menu keys to both `menu.json` files
8. Write at least smoke tests in `__tests__/`

### Component naming
- Pages: PascalCase, named export default
- UI components: PascalCase, named exports
- Hooks: `use<Name>.ts` — always in `client/hooks/`
- Services: `<name>-service.ts` — always in `client/lib/services/`

### Test files
- Tests live next to their subject in `__tests__/` directory
- Accessibility tests: `a11y.test.tsx`
- i18n completeness tests: `i18n-completeness.test.ts`
- Performance / logic tests: `performance.test.ts`
- Run `pnpm test` — all 756+ tests must pass before every commit

---

## Release & Deploy Process

### Every deploy MUST include:
1. `pnpm typecheck` — zero TypeScript errors
2. `pnpm test` — all tests pass
3. New entry at the TOP of `client/data/changelog.ts`
4. `git add . && git commit -m "<message>" && git push`
5. `pnpm build` — production build success
6. `firebase deploy --only hosting --project smart-portal-admin`

### Use the `/deploy` workflow
Trigger `/deploy` in Windsurf to walk through all steps with release notes collection.

### Release notes format
```typescript
{
  version: '2.x.x',       // semver — patch for fixes, minor for features, major for breaking
  date: 'YYYY-MM-DD',
  layer: 'fe' | 'be' | 'both',
  type: 'feature' | 'fix' | 'perf' | 'security' | 'refactor' | 'breaking' | 'chore',
  title: 'One-line summary',
  description: 'Optional detail',
  author: 'SmartLogistics Team',
}
```

---

## AI Coding Guards (NEVER violate these)

- **NEVER** hardcode collection names — use `COLLECTIONS.*`
- **NEVER** use inline CSS styles — TailwindCSS only
- **NEVER** skip typecheck or tests before a deploy
- **NEVER** add a route without `<ProtectedRoute>`
- **NEVER** add a user-facing string without an i18n key in both en/es
- **NEVER** create a new feature page without adding it to `navigation.tsx`
- **NEVER** omit the release note entry when running `/deploy`
- **NEVER** restore the `mayorista`/`mlcargo` `canHandle()` old regex pattern (causes 15-20s timeouts)
- **NEVER** add burst/debounce inline email logic to `recordTrackingFailure` (daily digest only)
- **NEVER** revert Promise-based registry guard to a boolean flag
- **NEVER** use `'*'` as CORS origin fallback

---

## Firebase Project
- Project ID: `smart-portal-admin` (`.firebaserc`)
- Hosting: `firebase deploy --only hosting --project smart-portal-admin`
- Functions: `firebase deploy --only functions --project smart-portal-admin`
