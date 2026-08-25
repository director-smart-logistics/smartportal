# Deploy Scripts

Scripts for deploying Smart Portal Admin to Firebase.

## Scripts

### deploy-hosting.sh
Builds and deploys the frontend to Firebase Hosting.
- Increments version in package.json automatically
- Builds the Vite SPA
- Deploys to Firebase Hosting

```bash
./scripts/deploy/deploy-hosting.sh
```

### deploy-functions.sh
Builds and deploys Firebase Cloud Functions.

```bash
./scripts/deploy/deploy-functions.sh
```

### increment-version.js
Utility script to increment the patch version in package.json.
Called automatically by deploy-hosting.sh.

## Quick Deploy

```bash
# Deploy frontend only
./scripts/deploy/deploy-hosting.sh

# Deploy functions only
./scripts/deploy/deploy-functions.sh

# Deploy everything
./scripts/deploy/deploy-hosting.sh && ./scripts/deploy/deploy-functions.sh
```
