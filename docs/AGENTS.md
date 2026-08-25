# Fusion Starter

A production-ready full-stack React application template with integrated Express server, featuring React Router 6 SPA mode, TypeScript, Vitest, Zod and modern tooling.

While the starter comes with a express server, only create endpoint when strictly neccesary, for example to encapsulate logic that must leave in the server, such as private keys handling, or certain DB operations, db...

## Tech Stack

- **PNPM**: Prefer pnpm
- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Dashboard, Packages, Invoices, etc.)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

server/                   # Express API backend
├── index.ts              # Main server setup (express config + routes)
└── routes/               # API handlers

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- The root route `/` redirects dynamically based on user role (e.g. `/dashboard` or `/deliveries`).
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<RootRedirect />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css` 
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Express Server Integration

- **Development**: Single port (8080) for both frontend/backend
- **Hot reload**: Both client and server code
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes
- `GET /api/ping` - Simple ping api
- `GET /api/demo` - Demo endpoint  

### Shared Types
Import consistent types in both client and server:
```typescript
import { DemoResponse } from '@shared/api';
```

Path aliases:
- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
pnpm dev        # Start dev server (client + server)
pnpm build      # Production build
pnpm start      # Start production server
pnpm typecheck  # TypeScript validation
pnpm test          # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route
1. **Optional**: Create a shared interface in `shared/api.ts`:
```typescript
export interface MyRouteResponse {
  message: string;
  // Add other response properties here
}
```

2. Create a new route handler in `server/routes/my-route.ts`:
```typescript
import { RequestHandler } from "express";
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

export const handleMyRoute: RequestHandler = (req, res) => {
  const response: MyRouteResponse = {
    message: 'Hello from my endpoint!'
  };
  res.json(response);
};
```

3. Register the route in `server/index.ts`:
```typescript
import { handleMyRoute } from "./routes/my-route";

// Add to the createServer function:
app.get("/api/my-endpoint", handleMyRoute);
```

4. Use in React components with type safety:
```typescript
import { MyRouteResponse } from '@shared/api'; // Optional: for type safety

const response = await fetch('/api/my-endpoint');
const data: MyRouteResponse = await response.json();
```

### New Page Route
1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:
```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- **Standard**: `pnpm build`
- **Binary**: Self-contained executables (Linux, macOS, Windows)
- **Cloud Deployment**: Use either Netlify or Vercel via their MCP integrations for easy deployment. Both providers work well with this starter template.

## Architecture Notes

- Single-port development with Vite + Express integration
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Production-ready with multiple deployment options
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces

## AI Agent Rules & Constraints

### Role-Based Access Control (RBAC) Requirements
**CRITICAL RULE:** Whenever you create or modify features, UI components, pages, or API endpoints, you **MUST ALWAYS** consider the RBAC system:
1. **Frontend Hooks:** Use the `usePermissions()` hook (`import { usePermissions } from "@/lib/hooks/usePermissions";`) to check permissions (`canView`, `canCreate`, `canUpdate`, `canDelete`, `canManage`).
2. **UI Protection:** Wrap restricted buttons and actions in `<PermissionTooltip allowed={canX('resource')} message="...">`. Never leave administrative or destructive actions unprotected.
3. **Route Protection:** Protect sensitive frontend routes by passing required actions to `<ProtectedRoute action="create">`.
4. **Backend Security:** Ensure Firebase/Firestore rules (`firestore.rules`) and backend endpoints also validate user roles when appropriate.

### Database Performance & Cost Constraints (Firestore)
**CRITICAL RULE:** To prevent astronomical Firebase bills, all developers and AI agents must follow these rules strictly:
1. **No open-ended queries on Mount (`list` scans)**: Never run broad, unpaginated Firestore queries (like `.list({})` or empty `.get()`) during component mounts. Always enforce filtering, pagination, or query only after explicit user actions (e.g., clicking "Buscar").
2. **No Double-Writes (Client-Server)**: Operational status changes and metadata updates (such as package signatures, delivery attempts, and payment updates) must be processed through backend Cloud Functions (e.g., `slUpdatePackageStatus`) rather than multiple client-side direct writes to Firestore.
3. Trigger Batching & Cache Limits: In Firebase triggers (such as `onInvoiceWritten`), never query Firestore inside individual loops. Batch queries using `in` operators (chunks of 30), group results in memory, and memoize candidate queries (such as invoice candidates lookup) to ensure database reads are kept to a minimum.
4. i18n & Dead Code hygiene: Regularly audit files in `client/pages/`. Never leave dead routes, components, or unused translation keys registered in `client/i18n/config.ts`.

### Firebase Hosting & Environment Separation
- **Strict Project Isolation**: 
  - **smart-portal-1 (Admin/Nova Portal)**: MUST ONLY be deployed to the Firebase project `smart-portal-admin` under the hosting site `smart-portal-admin`. Canonical domain: `https://portal.smartlogisticscr.com`.
  - **smart-portal-2 (Customer Portal)**: MUST ONLY be deployed to the Firebase project `smart-portal-2` under the hosting site `smart-portal-2` (target: `portal-2`). Canonical domain: `https://smartlogisticscr.com`.
- **No Target Mixing**: Never map `smart-portal-2` deployment targets or configurations (such as `.firebaserc` or `firebase.json` configs) to the `smart-portal-admin` project or hosting site.
- **Clean Configuration**: Deprecated sites `smart-portal-3` and `smart-portal-4` must never be re-introduced or mapped in any configuration files.
- **Cross-Deploy Safety**: Do not run `firebase deploy` targeting the `smart-portal-admin` project from the `smart-portal-2` directory.
