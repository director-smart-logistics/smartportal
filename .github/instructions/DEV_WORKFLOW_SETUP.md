# Development Workflow Setup

## Overview

The monorepo is now configured to run both the NestJS backend server and Vite frontend client with a single command.

## Quick Start

```bash
# From the root directory
pnpm dev
```

This will start:
- **NestJS Server** on `http://localhost:3000`
- **Vite Client** on `http://localhost:5173`

## Configuration Details

### Root Package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:client\" --names \"server,client\" --prefix-colors \"cyan,magenta\"",
    "dev:server": "cd server && PORT=3000 pnpm start:dev",
    "dev:client": "vite"
  }
}
```

### Port Configuration

| Service | Port | URL |
|---------|------|-----|
| NestJS Server | 3000 | http://localhost:3000 |
| Swagger Docs | 3000 | http://localhost:3000/api/docs |
| Vite Client | 5173 | http://localhost:5173 |

### CORS Configuration

The NestJS server is configured to allow requests from the Vite client:

**File:** `server/src/main.ts`
```typescript
app.enableCors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});
```

**Environment Variable:** `server/.env.local`
```env
CLIENT_URL="http://localhost:5173"
PORT=3000
```

## Development Workflow

### Starting Development

1. **Kill any existing processes:**
   ```bash
   pkill -9 -f "nest"
   ```

2. **Start both servers:**
   ```bash
   pnpm dev
   ```

3. **Verify servers are running:**
   - Server: `curl http://localhost:3000/api/health`
   - Client: Open `http://localhost:5173` in browser

### Expected Output

When you run `pnpm dev`, you should see:

```
[server] [Nest] Starting Nest application...
[server] ✅ Application is running on: http://localhost:3000
[server] 📚 API Documentation: http://localhost:3000/api/docs
[client] VITE v5.x ready in X ms
[client] ➜  Local:   http://localhost:5173/
```

### Hot Reload

Both servers support hot reload:
- **Server:** NestJS watch mode automatically reloads on file changes
- **Client:** Vite HMR (Hot Module Replacement) updates instantly

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T19:21:22.000Z",
  "uptime": 123.456
}
```

### Authentication

**Signup:**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "fullName": "Test User",
    "phone": "+1234567890"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@smartlogistics.com",
    "password": "admin123"
  }'
```

### Packages

**List Packages:**
```bash
curl http://localhost:3000/api/packages \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get Package by ID:**
```bash
curl http://localhost:3000/api/packages/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE` errors:

```bash
# Kill all NestJS processes
pkill -9 -f "nest"

# Kill all Node processes (nuclear option)
pkill -9 node

# Check what's using the port
lsof -i :3000
lsof -i :5173
```

### Server Not Starting

1. **Check environment variables:**
   ```bash
   cat server/.env.local
   ```

2. **Verify database connection:**
   ```bash
   cd server && pnpm prisma db pull
   ```

3. **Check for TypeScript errors:**
   ```bash
   cd server && pnpm build
   ```

### Client Not Starting

1. **Check Vite configuration:**
   ```bash
   cat vite.config.ts
   ```

2. **Clear Vite cache:**
   ```bash
   rm -rf node_modules/.vite
   pnpm install
   ```

### CORS Errors

If you see CORS errors in the browser console:

1. **Verify CORS configuration in `server/src/main.ts`**
2. **Check `CLIENT_URL` environment variable in `server/.env.local`**
3. **Ensure both servers are running on correct ports**

## Build Commands

### Development Build
```bash
pnpm dev
```

### Production Build
```bash
# Build both client and server
pnpm build

# Build separately
pnpm build:client  # Vite build
pnpm build:server  # NestJS build
```

### Start Production Server
```bash
cd server && pnpm start:prod
```

## Next Steps

### 1. Install better-auth in Client

```bash
pnpm add better-auth @tanstack/react-query axios
```

### 2. Create Client Environment File

Create `client/.env.local`:
```env
VITE_API_URL=http://localhost:3000
```

### 3. Test API Integration

Open the client in browser and test API calls:

```typescript
// In browser console
fetch('http://localhost:3000/api/health')
  .then(r => r.json())
  .then(console.log)
```

### 4. Migrate Authentication

Update `client/lib/context/AuthContext.tsx` to use better-auth client.

### 5. Migrate Data Fetching

Replace Supabase queries with React Query hooks:
- Use `usePackages()` for packages
- Use `useCustomers()` for customers
- Create hooks for deliveries, routes, invoices

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Root (pnpm workspace)                 │
│                                                 │
│  ┌───────────────────┐  ┌──────────────────┐   │
│  │   NestJS Server   │  │   Vite Client    │   │
│  │   Port: 3000      │←─┤   Port: 5173     │   │
│  │                   │  │                  │   │
│  │  - REST API       │  │  - React 18      │   │
│  │  - Prisma ORM     │  │  - React Router  │   │
│  │  - better-auth    │  │  - TailwindCSS   │   │
│  │  - Swagger Docs   │  │  - React Query   │   │
│  └─────────┬─────────┘  └──────────────────┘   │
│            │                                     │
│            ▼                                     │
│  ┌─────────────────────┐                       │
│  │  Neon PostgreSQL    │                       │
│  │  (Serverless)       │                       │
│  └─────────────────────┘                       │
└─────────────────────────────────────────────────┘
```

## Resources

- **Server README:** `server/README.md`
- **Client Migration Plan:** `.github/instructions/CLIENT_MIGRATION_PLAN.md`
- **NestJS Best Practices:** `.github/instructions/NESTJS_BEST_PRACTICES.md`
- **Swagger API Docs:** http://localhost:3000/api/docs (when server is running)
