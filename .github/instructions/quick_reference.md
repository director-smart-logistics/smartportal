# NestJS + better-auth Migration - Quick Reference Guide

## 🎯 Executive Overview

Converting Smart Portal from Express + Supabase auth → **NestJS + better-auth + PostgreSQL**

**Timeline**: 6 weeks | **Complexity**: High | **Impact**: Zero downtime needed

---

## Key Decisions Made

### Why NestJS?
✅ Enterprise-grade framework
✅ Full TypeScript support
✅ Modules & dependency injection
✅ Built-in validation & guards
✅ Swagger/OpenAPI integration
✅ Mature ecosystem

### Why better-auth?
✅ Framework-agnostic
✅ OAuth provider support (MCP!)
✅ Session management
✅ 2FA built-in
✅ RBAC ready
✅ Rate limiting
✅ Automatic migrations

### Why Keep Supabase for DB?
✅ Minimal migration complexity
✅ Existing data in PostgreSQL
✅ Reduces custom database management
✅ NestJS can directly connect to PostgreSQL

**New Flow**:
```
React App → NestJS API → PostgreSQL (Supabase DB)
        ↓
      better-auth
```

**Old Flow**:
```
React App → Supabase Auth → Supabase DB
        ↓
      Mock auth in client
```

---

## Project Structure Overview

```
├── .github/instructions/
│   ├── nestjs_better_auth_migration.md    (This guide - full strategy)
│   ├── phase1_nestjs_setup.md            (Week 1 - Foundation)
│   ├── phase2_auth_modules.md            (Week 2-3 - Authentication)
│   ├── phase3_frontend_integration.md    (Week 3-4 - React updates)
│   ├── phase4_data_migration.md          (Week 4 - Supabase migration)
│   └── phase5_deployment.md              (Week 5-6 - Production)
│
├── server/                        (NEW - to create or overwrite)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth/                         (better-auth integration)
│   │   ├── users/
│   │   ├── packages/
│   │   ├── customers/
│   │   ├── deliveries/
│   │   ├── database/
│   │   ├── common/
│   │   ├── config/
│   │   └── mcp/                          (MCP servers)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── test/
│   ├── .env.example
│   └── docker-compose.yml
│
├── client/                               (EXISTING - will update)
│   └── (Remove Supabase auth, use NestJS + better-auth client)
│
└── old-server/                           (ARCHIVE old server folder)
    └── (Keep Express server as backup)
```

---

## 6-Week Migration Timeline

### Week 1: Foundation ⚙️
- [ ] Create NestJS project
- [ ] Install dependencies
- [ ] Setup Prisma schema
- [ ] Configure better-auth
- [ ] Setup MCP servers
- **Deliverable**: Working NestJS + database connected

### Week 2-3: Authentication 🔐
- [ ] Auth module (login, signup, 2FA)
- [ ] User roles & permissions
- [ ] JWT/Session guards
- [ ] OAuth providers (Google, GitHub)
- [ ] API tests
- **Deliverable**: All auth endpoints working

### Week 3-4: Frontend 📱
- [ ] Install better-auth client in React
- [ ] Update auth context
- [ ] Replace API calls (Supabase → NestJS)
- [ ] Test all pages
- [ ] Remove Supabase auth
- **Deliverable**: Frontend fully migrated

### Week 4: Data Migration 📊
- [ ] Export Supabase data
- [ ] Import to PostgreSQL
- [ ] Data validation
- [ ] Verify relationships
- **Deliverable**: All data safely migrated

### Week 5: Testing & Optimization 🧪
- [ ] Load testing
- [ ] Security audit
- [ ] Performance tuning
- [ ] Production checklist
- **Deliverable**: Production-ready

### Week 6: Deployment & Cutover 🚀
- [ ] Blue-green setup
- [ ] Gradual traffic shift
- [ ] Monitor logs
- [ ] Decommission Express
- **Deliverable**: Live in production!

---

## Database Schema Summary

### Core Tables (better-auth creates these)
- `User` - Accounts
- `Account` - OAuth connections
- `Session` - Active sessions
- `Verification` - Email verification codes
- `TwoFactorSettings` - 2FA configuration

### Domain Tables (We define)


here the current database schema in supabase 

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL CHECK (action = ANY (ARRAY['CREATE'::text, 'READ'::text, 'UPDATE'::text, 'DELETE'::text, 'LOGIN'::text, 'LOGOUT'::text])),
  entity text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  status text NOT NULL DEFAULT 'success'::text CHECK (status = ANY (ARRAY['success'::text, 'failed'::text])),
  error_message text,
  affected_rows integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  phone character varying,
  address text,
  city character varying,
  country character varying,
  zip_code character varying,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  sl_account_code character varying,
  delivery_address_1 text,
  delivery_address_2 text,
  delivery_address_3 text,
  notes text,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT customers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  address text NOT NULL,
  latitude numeric,
  longitude numeric,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])),
  route_id uuid,
  assigned_to uuid,
  package_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT deliveries_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id)
);
CREATE TABLE public.delivery_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_package_id uuid NOT NULL,
  photo_url text NOT NULL,
  photo_path text,
  delivery_agent_id uuid NOT NULL,
  caption text,
  latitude numeric,
  longitude numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT delivery_photos_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_photos_route_package_id_fkey FOREIGN KEY (route_package_id) REFERENCES public.route_packages(id),
  CONSTRAINT delivery_photos_delivery_agent_id_fkey FOREIGN KEY (delivery_agent_id) REFERENCES public.users(id)
);
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  package_id uuid NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT invoice_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  invoice_number character varying NOT NULL UNIQUE,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::invoice_status,
  total_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  currency character varying DEFAULT 'USD'::character varying,
  invoice_date timestamp with time zone DEFAULT now(),
  due_date timestamp with time zone,
  sent_at timestamp with time zone,
  paid_at timestamp with time zone,
  notes text,
  email_sent boolean DEFAULT false,
  sms_sent boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.package_consolidations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consolidation_name character varying NOT NULL,
  description text,
  total_weight numeric NOT NULL,
  total_cost numeric NOT NULL,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by uuid,
  CONSTRAINT package_consolidations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_number character varying NOT NULL UNIQUE,
  customer_id uuid,
  customer_name character varying NOT NULL,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'intake'::character varying, 'in_transit'::character varying, 'delivered'::character varying, 'failed'::character varying, 'custom_released'::character varying, 'consolidated_completed'::character varying, 'returned'::character varying]::text[])),
  weight numeric NOT NULL,
  origin character varying NOT NULL,
  destination character varying NOT NULL,
  description text,
  consolidated_id uuid,
  is_consolidated boolean DEFAULT false,
  calculated_cost numeric,
  cost_calculation_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by uuid,
  CONSTRAINT packages_pkey PRIMARY KEY (id),
  CONSTRAINT packages_consolidated_id_fkey FOREIGN KEY (consolidated_id) REFERENCES public.package_consolidations(id)
);
CREATE TABLE public.route_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_agents_pkey PRIMARY KEY (id),
  CONSTRAINT route_agents_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id),
  CONSTRAINT route_agents_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id)
);
CREATE TABLE public.route_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  package_id uuid NOT NULL,
  sequence_order integer,
  delivery_status text NOT NULL DEFAULT 'pending'::text CHECK (delivery_status = ANY (ARRAY['pending'::text, 'in_delivery'::text, 'delivered'::text, 'failed'::text, 'returned'::text])),
  delivery_notes text,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT route_packages_pkey PRIMARY KEY (id),
  CONSTRAINT route_packages_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id),
  CONSTRAINT route_packages_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id)
);
CREATE TABLE public.routes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  origin_location text NOT NULL,
  destination_location text NOT NULL,
  estimated_distance numeric,
  estimated_duration text,
  vehicle_plate text,
  vehicle_type text CHECK (vehicle_type = ANY (ARRAY['car'::text, 'van'::text, 'truck'::text])),
  assigned_agent_id uuid,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])),
  total_packages integer DEFAULT 0,
  completed_packages integer DEFAULT 0,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT routes_pkey PRIMARY KEY (id),
  CONSTRAINT routes_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.users(id),
  CONSTRAINT routes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key character varying NOT NULL UNIQUE,
  setting_value jsonb NOT NULL,
  description text,
  data_type character varying DEFAULT 'number'::character varying,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'AGENT'::text CHECK (role = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text, 'AGENT'::text, 'CUSTOMER'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

| **Relationships**: Fully defined | **Indexes**: Optimized for queries

---

## Authentication Flow

### Login Flow
```
1. User enters email + password
   ↓
2. better-auth validates
   ↓
3. Generate JWT token
   ↓
4. Return token + user data
   ↓
5. Client stores token (localStorage)
   ↓
6. Subsequent requests include token in Authorization header
```

### MCP Integration Flow
```
1. AI Assistant (Claude/Copilot) makes request
   ↓
2. OAuth discovery endpoint returns auth server URL
   ↓
3. AI redirects user to login page
   ↓
4. User authenticates
   ↓
5. AI receives access token
   ↓
6. AI can now invoke tools (list packages, create package, etc.)
```

---

## Important Files to Create

### Phase 1 (This week)
```bash
server-nestjs/
├── src/main.ts                    # Entry point
├── src/app.module.ts              # Root module
├── src/config/auth.config.ts      # better-auth setup
├── src/database/
│   ├── database.service.ts
│   └── database.module.ts
├── prisma/schema.prisma           # Data model
├── prisma/seed.ts                 # Test data
├── .env.example                   # Config template
└── docker-compose.yml             # Local dev environment
```

### Phase 2 (Weeks 2-3)
```bash
server-nestjs/src/auth/
├── auth.service.ts                # Login/signup logic
├── auth.controller.ts             # Auth endpoints
├── strategies/jwt.strategy.ts
├── guards/jwt-auth.guard.ts
├── guards/roles.guard.ts
├── decorators/roles.decorator.ts
└── dto/
    ├── login.dto.ts
    ├── signup.dto.ts
    └── refresh-token.dto.ts
```

### Phase 3 (Weeks 3-4)
```bash
client/
├── lib/context/AuthContext.tsx    # Use better-auth client
├── hooks/useAuth.ts               # Updated auth hook
├── lib/api/                       # Update all API calls
└── pages/                         # Test all pages work
```

---

## Key Commands Reference

### Setup (Week 1)
```bash
# Create NestJS project
nest new server-nestjs

# Install dependencies
pnpm install

# Setup Prisma
npx prisma init

# Create database
npx prisma migrate dev --name init

# Seed data (optional)
pnpm exec ts-node prisma/seed.ts
```

### Development
```bash
# Start dev server
pnpm start:dev

# Generate Prisma
npx prisma generate

# View database UI
npx prisma studio

# Run tests
pnpm test

# Build for production
pnpm build
```

### MCP Setup (Phase 1)
```bash
# Add to Cursor
npx @better-auth/cli mcp --cursor

# Add to Claude Desktop
claude mcp add --transport http better-auth https://mcp.chonkie.ai/better-auth/better-auth-builder/mcp

# Add to VS Code
# Manually edit .vscode/mcp.json
```

---

## API Endpoints (Phase 2)

### Authentication
```
POST   /api/auth/login
POST   /api/auth/signup
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/session
POST   /api/auth/verify-email
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/2fa/enable
POST   /api/auth/2fa/verify
```

### Users
```
GET    /api/users/me
PATCH  /api/users/me
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id
```

### Packages
```
GET    /api/packages
POST   /api/packages
GET    /api/packages/:id
PATCH  /api/packages/:id
DELETE /api/packages/:id
GET    /api/packages/:id/tracking
```

### Other Modules
- `/api/customers` - Customer management
- `/api/deliveries` - Delivery assignments
- `/api/routes` - Route management
- `/api/branches` - Locations
- `/api/vehicles` - Fleet management

---

## React Frontend Changes (Phase 3)

### Install better-auth client
```bash
pnpm add @better-auth/react
```

### Update auth context
```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
  endpoints: {
    signUpEmail: `${import.meta.env.VITE_API_URL}/api/auth/signup`,
    signInEmail: `${import.meta.env.VITE_API_URL}/api/auth/login`,
  },
});
```

### Remove Supabase
```bash
pnpm remove @supabase/supabase-js
```

---

## Environment Variables (.env)

### Minimal Setup (Phase 1)
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/courierflow_dev
BETTER_AUTH_SECRET=change-me-in-production
JWT_SECRET=change-me-in-production
PORT=3000
```

### Full Setup (Phase 2+)
```bash
# Database
DATABASE_URL=...
DATABASE_SSL=true

# Authentication
BETTER_AUTH_SECRET=...
JWT_SECRET=...

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Application
APP_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173
NODE_ENV=development

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# MCP
MCP_ENABLED=true
```

---

## Testing Strategy

### Unit Tests (Services)
```bash
pnpm test src/auth/auth.service.spec.ts
```

### Integration Tests (API)
```bash
pnpm test:e2e src/auth/auth.e2e-spec.ts
```

### Load Testing
```bash
k6 run tests/load-test.js
```

### Security Testing
```bash
owasp-zap scan http://localhost:3000
```

---

## Rollback Plan

If issues occur during deployment:

1. **Keep Express server running** as fallback
2. **DNS/Load balancer** routes to Express temporarily
3. **Investigate issue** on staging
4. **Fix and redeploy** NestJS
5. **Cutover again** when ready

**Rollback Time**: < 5 minutes

---

## Success Criteria

### Functionality
✅ All pages load
✅ Login/logout works
✅ All data displays correctly
✅ Create/update/delete operations work

### Performance
✅ Response times < 200ms
✅ Database queries < 50ms
✅ Throughput > 1000 req/s

### Reliability
✅ Uptime 99.9%
✅ Error rate < 0.1%
✅ Zero data loss

### Security
✅ OWASP Top 10 passed
✅ JWT validation on all routes
✅ Rate limiting active
✅ Audit logging working

---

## Getting Help

### Resources
- 📚 NestJS Docs: https://docs.nestjs.com
- 🔐 better-auth Docs: https://www.better-auth.com/docs
- 📊 Prisma Docs: https://www.prisma.io/docs
- 💬 Discord communities for each framework

### Common Issues

**Q: How do I connect to PostgreSQL from NestJS?**
A: Use Prisma ORM with PostgreSQL driver. See Phase 1 guide.

**Q: Can I use Supabase for database?**
A: Yes! Configure DATABASE_URL to point to Supabase PostgreSQL.

**Q: What about existing data?**
A: Phase 4 covers migration. Data stays in PostgreSQL.

**Q: Can I rollback?**
A: Yes! Express server runs in parallel until cutover complete.

**Q: How long will this take?**
A: ~6 weeks for full migration. Can be faster with larger team.

---

## Next Steps

1. **Read** `nestjs_better_auth_migration.md` (detailed strategy)
2. **Review** `phase1_nestjs_setup.md` (week 1 implementation)
3. **Create** NestJS project folder
4. **Follow** Phase 1 checklist
5. **Test** database connection
6. **Proceed** to Phase 2

---

## Document Versions

| Phase | Document | Status |
|-------|----------|--------|
| Overview | `quick_reference.md` | ✅ This file |
| Strategy | `nestjs_better_auth_migration.md` | ✅ Complete |
| Phase 1 | `phase1_nestjs_setup.md` | ✅ Complete |
| Phase 2 | `phase2_auth_modules.md` | 📝 Draft |
| Phase 3 | `phase3_frontend_integration.md` | 📝 Draft |
| Phase 4 | `phase4_data_migration.md` | 📝 Draft |
| Phase 5 | `phase5_deployment.md` | 📝 Draft |

---

**Last Updated**: November 24, 2025
**Created By**: Development Team
**Status**: Ready for Phase 1 Start
**Questions?**: Contact team lead
