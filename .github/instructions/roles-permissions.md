# Roles & Permissions — Smart Portal 1

> Single source of truth for role definitions, page access, resource permissions, and user management operations.

---

## 1. Roles

Defined in `client/types/index.ts` as `UserRole`. Set as a **Firebase Auth custom claim** (`token.claims.role`) via the `slSetUserRole` callable function.

| Role | Description | Firestore Rule Group |
|------|-------------|----------------------|
| `ADMIN` | Full system access. Can manage users, settings, payroll, all data. | `isAdmin()` |
| `MANAGER` | Manages operations: packages, invoices, routes, customers, analytics, nova, payroll. | `isAgent()` |
| `STAFF` | Internal staff: packages, manifests, invoices, scanner, labels. | `isAgent()` |
| `AGENT` | Field agents: packages, tracking, scanner, deliveries. | `isAgent()` |
| `DELIVERY` | Delivery drivers: scanner, deliveries, routes (read). | `isDelivery()` |
| `CUSTOMER` | End customers (smart-portal-2). Not used as a portal login role. | — |

> **Note:** `MANAGER`, `STAFF`, `AGENT` all satisfy the Firestore `isAgent()` helper. `DELIVERY` satisfies `isDelivery()` only.

---

## 2. Resource Permissions Matrix

Managed in `client/lib/hooks/usePermissions.ts`. Actions: `view` · `create` · `update` · `delete`.

| Resource | ADMIN | MANAGER | STAFF | AGENT | DELIVERY |
|----------|-------|---------|-------|-------|----------|
| `dashboard` | ✅ all | view | view | view | view |
| `packages` | ✅ all | view/create/update | view/create/update | view/create | view |
| `tracking` | ✅ all | view | view | view | view |
| `manifests` | ✅ all | view/create | view/create | view | — |
| `nova` | ✅ all | view/create | view/create | — | — |
| `customers` | ✅ all | view/create/update | view | — | — |
| `invoices` | ✅ all | view/create/update | view/create | — | — |
| `quotes` | ✅ all | view/create | view | — | — |
| `routes` | ✅ all | view/create | view | — | view |
| `deliveries` | ✅ all | view/update | view | view/update | view/update |
| `analytics` | ✅ all | view | — | — | — |
| `users` | ✅ all | view | — | — | — |
| `settings` | ✅ all | — | — | — | — |
| `payroll` | ✅ all | — | — | — | — |
| `scanner` | ✅ all | view | view | view | view |
| `calculator` | ✅ all | view | view | view | — |
| `support` | ✅ all | view | view | — | — |
| `banks` | ✅ all | view | — | — | — |
| `shipping-labels` | ✅ all | view/create | view/create | — | — |
| `ai` | ✅ all | view | view | view | — |

---

## 3. Route → Resource Guard Map

All protected routes pass a `resource` prop to `<ProtectedRoute>`, which calls `canView(resource)` from `usePermissions`.

| Route | `resource` | Min. Role |
|-------|-----------|-----------|
| `/dashboard` | `dashboard` | DELIVERY |
| `/packages` | `packages` | DELIVERY |
| `/manifests` | `manifests` | STAFF |
| `/tracking` | `tracking` | DELIVERY |
| `/users` | `users` | MANAGER |
| `/users/create` | `users` | ADMIN |
| `/users/:id/edit` | `users` | ADMIN |
| `/customers` | `customers` | STAFF |
| `/customers/:id` | `customers` | STAFF |
| `/analytics` | `analytics` | MANAGER |
| `/profile` | *(none — any auth)* | any |
| `/deliveries` | `deliveries` | DELIVERY |
| `/routes` | `routes` | DELIVERY |
| `/invoices` | `invoices` | STAFF |
| `/invoices/create` | `invoices` | STAFF |
| `/quotes` | `quotes` | STAFF |
| `/quotes/create` | `quotes` | STAFF |
| `/settings` | `settings` | ADMIN |
| `/scanner` | *(none — any auth)* | any |
| `/scanner/bodega` | `scanner` | DELIVERY |
| `/scanner/admin` | `scanner` | DELIVERY |
| `/calculator` | *(none — any auth)* | any |
| `/ai` | `ai` | AGENT |
| `/support` | `support` | STAFF |
| `/banks` | `banks` | MANAGER |
| `/labels` | `shipping-labels` | STAFF |
| `/nova` | `manifests` | STAFF |
| `/payroll/*` | `payroll` | ADMIN |

---

## 4. Firestore Security Rules Summary

File: `firestore.rules`

| Helper | Roles Included |
|--------|---------------|
| `isAuthenticated()` | Any logged-in user |
| `isAdmin()` | SUPER_ADMIN, ADMIN |
| `isAgent()` | SUPER_ADMIN, ADMIN, MANAGER, STAFF, AGENT |
| `isDelivery()` | SUPER_ADMIN, ADMIN, MANAGER, STAFF, AGENT, DELIVERY |

> ⚠️ `MANAGER` and `STAFF` must be added to the Firestore `isAgent()` helper to grant them write access at the database level.

| Collection | read | create | update | delete |
|-----------|------|--------|--------|--------|
| `users` | auth | admin\|owner | admin\|owner | admin |
| `customers` | auth | agent | agent | admin |
| `packages` | auth | agent | delivery | admin |
| `invoices` | auth | agent | agent | admin |
| `quotes` | auth | agent | agent | admin |
| `routes` | auth | agent | delivery | admin |
| `deliveries` | auth | agent | delivery | admin |
| `manifests` | agent | agent | agent | admin |
| `auditLogs` | admin | auth | ❌ | ❌ |
| `settings` | auth/public | admin | admin | admin |
| `pricing` | auth | admin | admin | admin |
| `payroll` | admin | admin | admin | admin |
| `departments` | admin | admin | admin | admin |
| `employees` | admin\|owner | admin | admin | admin |

---

## 5. User Management Operations

All user management operations that touch Firebase Auth **must** go through Firebase Callable Functions (`firebaseApi.*`) — not direct Firestore writes. Direct Firestore writes only update the profile document; they do not create/disable/delete the Firebase Auth account.

### 5.1 Create User
- **Function:** `firebaseApi.users.create({ email, password, fullName, role, phone? })`
- **Firebase callable:** `slCreateUser`
- **Effect:** Creates Firebase Auth account + Firestore `users/{uid}` profile document
- **Guard:** ADMIN only (UI + route-level)
- **Role claim:** Automatically set by the function via `slSetUserRole`

### 5.2 Update User
- **Function:** `firebaseApi.users.update({ userId, email?, fullName?, phone?, role?, disabled? })`
- **Firebase callable:** `slUpdateUser`
- **Effect:** Updates Firebase Auth account + Firestore profile
- **Guard:** ADMIN only
- **Role claim:** When `role` field changes, function calls `setCustomUserClaims` on the Auth account

### 5.3 Delete User
- **Function:** `firebaseApi.users.delete(userId)`
- **Firebase callable:** `slDeleteUser`
- **Effect:** Deletes Firebase Auth account + Firestore profile document
- **Guard:** ADMIN only. Cannot delete own account.

### 5.4 Inactivate / Suspend User
- **Function:** `firebaseApi.users.update({ userId, disabled: true })`
- **Firebase callable:** `slUpdateUser` with `disabled: true`
- **Effect:** Disables Firebase Auth account (user can no longer sign in). Firestore status set to `"inactive"`.
- **Guard:** ADMIN only

### 5.5 Restore / Activate User
- **Function:** `firebaseApi.users.update({ userId, disabled: false })`
- **Firebase callable:** `slUpdateUser` with `disabled: false`
- **Effect:** Re-enables Firebase Auth account. Firestore status set to `"active"`.
- **Guard:** ADMIN only

### 5.6 Reset Password
- **Function:** `firebaseApi.users.sendPasswordReset(email)`
- **Firebase callable:** `slSendPasswordReset`
- **Effect:** Sends a password reset email via Firebase Auth. Does NOT require the user's current password.
- **Guard:** ADMIN only (triggered from user list or user detail)

### 5.7 Send Email Verification
- **Function:** `firebaseApi.users.sendEmailVerification(userId)`
- **Firebase callable:** `slSendEmailVerification`
- **Guard:** ADMIN only

### 5.8 Set Role (standalone)
- **Function:** `firebaseApi.auth.setUserRole(userId, role)`
- **Firebase callable:** `slSetUserRole`
- **Effect:** Sets the `role` custom claim on the Firebase Auth token. User must sign out and back in for the new claim to take effect in their ID token.
- **Guard:** ADMIN only

---

## 6. Known Issues / Gaps (Pre-fix)

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `UserCreate.tsx` used `firestoreApi.users.create()` → no Firebase Auth account created | 🔴 Critical | Use `firebaseApi.users.create()` |
| 2 | `UserEdit.tsx` used `firestoreApi.users.update()` → role claim never updated in Auth | 🔴 Critical | Use `firebaseApi.users.update()` |
| 3 | `Users.tsx` delete used `firestoreApi.users.delete()` → Firebase Auth account not deleted | 🔴 Critical | Use `firebaseApi.users.delete()` |
| 4 | No "Inactivate" / "Activate" toggle in Users.tsx UI | 🟠 High | Add toggle using `firebaseApi.users.update({ disabled })` |
| 5 | No "Reset Password" action in Users.tsx UI | 🟠 High | Add button using `firebaseApi.users.sendPasswordReset()` |
| 6 | `STAFF` role has no permissions defined → falls back to VIEWER | 🟠 High | Add STAFF permissions in `usePermissions.ts` |
| 7 | `DELIVERY` role has no permissions defined → falls back to VIEWER | 🟠 High | Add DELIVERY permissions |
| 8 | `manifests`/`nova` resources missing from MANAGER + STAFF permissions | 🟠 High | Add to `usePermissions.ts` |
| 9 | `quotes`, `support`, `banks` resources missing from MANAGER/STAFF | 🟡 Medium | Add to `usePermissions.ts` |
| 10 | Firestore `isAgent()` excludes MANAGER and STAFF | 🟠 High | Update `firestore.rules` |
| 11 | `/scanner` and `/calculator` have no `resource` guard — any authenticated user | 🟡 Medium | Add resource guards |
| 12 | `/ai` has no `resource` guard | 🟡 Medium | Add `resource="ai"` guard |
| 13 | `users` resource only grants MANAGER `view` — MANAGER can see list but cannot create/edit (correct by design) | ℹ️ Info | Documented |

---

## 7. Auth Flow

```
User signs in with Google
  → Firebase Auth issues ID token
  → mapFirebaseUserToAuthUser() reads token.claims.role
  → AuthUser.role set (defaults to "AGENT" if no claim)
  → FirebaseAuthProvider stores user in context
  → ProtectedRoute checks canView(resource) via usePermissions
  → Page renders or redirects to /403
```

Role claim is set server-side by an ADMIN calling `slSetUserRole`. The user must **sign out and sign back in** for a new role claim to appear in their token.

---

## 8. Adding a New Protected Page

1. Add the route in `client/App.tsx` wrapped in `<ProtectedRoute resource="your-resource">`.
2. Add `your-resource` permissions for each role in `client/lib/hooks/usePermissions.ts`.
3. If the page writes to a Firestore collection, add the appropriate rule in `firestore.rules`.
4. Update the table in Section 3 and Section 2 of this document.
