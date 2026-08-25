# Smart Portal Admin - Firebase Serverless Deployment Guide

> **📖 Who is this guide for?**  
> This guide is written for developers and team members who deploy the Smart Portal Admin application on Google Cloud Platform and Firebase. This is a step-by-step, clean guide with exact commands to run.

---

## 📋 Table of Contents

1. [Quick Start Overview](#-quick-start-overview)
2. [Prerequisites](#-prerequisites)
3. [Firebase Project Setup](#-firebase-project-setup)
4. [Real-Time Synchronization Architecture](#-real-time-synchronization-architecture)
5. [Backend Deployment (Firebase Functions)](#-backend-deployment-firebase-functions)
6. [Frontend Deployment (Firebase Hosting)](#-frontend-deployment-firebase-hosting)
7. [Database & Storage Setup](#-database--storage-setup)
8. [Domain Configuration (Cloudflare)](#-domain-configuration-cloudflare)
9. [Testing & Verification](#-testing--verification)
10. [Troubleshooting](#-troubleshooting)
11. [Deploy Changes Workflow](#-deploy-changes-workflow)
12. [💰 Cost Analysis & Optimization](#-cost-analysis--optimization)

---

## 🚀 Quick Start Overview

**What are we deploying?**
- **Backend API**: Firebase Cloud Functions (serverless, auto-scaling) on `us-central1-smart-portal-admin.cloudfunctions.net`
- **Frontend React App**: Firebase Hosting (global CDN) on `portal.smartlogisticscr.com`
- **Database**: Cloud Firestore (serverless, document-based, database: `portal` in project `smart-portal-admin`)
- **Authentication**: Firebase Authentication
- **Storage**: Cloud Storage for Firebase (for PDFs, invoice photos, and manifests)

**Architecture:**
```
portal.smartlogisticscr.com (Firebase Hosting)
├── React SPA (Frontend)
└── /api (Firebase Cloud Functions Backend)
    ├── Firestore (Serverless Database)
    ├── Cloud Storage (File Storage)
    └── Firebase Authentication
```

---

## 📚 Prerequisites

### Required Tools:
```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Install Firebase CLI
npm install -g firebase-tools

# Install pnpm (if not already installed)
npm install -g pnpm@10.25.0
```

### Required Accounts:
- **Google Cloud / Firebase Account** with billing enabled (required for Cloud Functions deployment via Blaze plan)
- **Cloudflare Account** (for domain management and SSL redirection)

---

## 🏗 Firebase Project Setup

### 1. Configure Firebase Project
```bash
# Set your project ID
export PROJECT_ID="smart-portal-admin"
gcloud config set project $PROJECT_ID

# Link Firebase to GCP project
firebase use $PROJECT_ID
```

### 2. Enable Required APIs on GCP
```bash
# Enable Firebase and Cloud Function APIs
gcloud services enable firestore.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable iam.googleapis.com
```

---

## 🔄 Real-Time Synchronization Architecture

### Overview: Smart Logistics Ecosystem
Smart Portal 1 (Admin System) and Smart Portal 2 (Customer Portal) work together as a unified logistics system with bidirectional real-time data synchronization:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SMART PORTAL 1 (Admin System)               │
│  portal.smartlogisticscr.com                                   │
│                                                                 │
│  React Admin → Firestore → Cloud Functions                      │
│  - CSV manifest imports (1000+ records)                       │
│  - Package status management                                  │
│  - Invoice generation                                          │
│  - Operational reconciliation                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Webhooks & Firestore listeners (real-time)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SMART PORTAL 2 (Customer Portal)               │
│  smartlogisticscr.com                                          │
│                                                                 │
│  React App → Firestore → Cloud Functions                       │
│  - Pre-alerts created by users                                │
│  - Real-time package/invoice tracking                         │
│  - Address confirmations                                       │
│  - Customer notifications                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Key Firebase Collections

#### `/packages/{trackingId}`
```typescript
{
  trackingId: string;           // Unique package identifier
  userId: string;              // Firebase user who owns this package
  status: 'announced' | 'received' | 'in_transit' | 'delivered' | 'processed' | 'on_route';
  weight?: number;             // Package weight
  dimensions?: {               // Package dimensions
    length: number;
    width: number;
    height: number;
    unit: 'in' | 'cm';
  };
  manifestId?: string;         // Link to admin manifest
  sourceWarehouseId: string;   // Origin warehouse
  isPreAlert: boolean;         // True if created by customer
  syncedFromAdmin: boolean;    // True if data came from admin system
  lastSyncedAt: Timestamp;     // Last sync timestamp
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `/invoices/{invoiceId}`
```typescript
{
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;          // Link to customer
  amount: number;              // Invoice amount
  currency: 'USD' | 'CRC';     // Currency
  pdfUrl: string;              // Signed URL to PDF in Cloud Storage
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'pending' | 'deleted';
  dueDate: Timestamp;          // Payment due date
  syncedFromAdmin: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `/prealerts/{prealertId}`
```typescript
{
  prealertId: string;
  trackingId: string;
  userId: string;
  description?: string;        // User-provided description
  estimatedWeight?: number;    // User's weight estimate
  userEmail: string;           // User's email for notifications
  status: 'pending_arrival' | 'matched' | 'orphaned';
  matchedPackageId?: string;   // Linked when package arrives
  matchedAt?: Timestamp;       // When package was matched
  createdAt: Timestamp;
  expiresAt: Timestamp;        // Auto-expire after 90 days
}
```

---

## 🚀 Backend Deployment (Firebase Functions)

Our backend logic runs fully serverless as Cloud Functions inside the `functions` directory.

### 1. Build and Deploy Functions
```bash
# Navigate to functions folder
cd functions

# Install dependencies and build
npm install
npm run build

# Deploy only functions to Firebase
firebase deploy --only functions
```

### 2. Verify Function Deployment
Verify that your callable functions and HTTP endpoints are active in the Firebase Console under **Functions** or run:
```bash
firebase functions:log
```

---

## 🔥 Frontend Deployment (Firebase Hosting)

The frontend is a React Single Page Application (SPA) deployed to Firebase Hosting.

### 1. Configure Firebase Hosting
Update `firebase.json`:
```json
{
  "hosting": {
    "site": "smart-portal-admin",
    "public": "dist/spa",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Frame-Options",
            "value": "SAMEORIGIN"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          }
        ]
      }
    ]
  }
}
```

### 2. Build and Deploy Frontend (Manual Steps)
```bash
# Clean previous build
rm -rf dist

# Install packages
pnpm install

# Build the frontend assets
pnpm run build

# Deploy only hosting
firebase deploy --only hosting
```

---

## 🗄 Database & Storage Setup

All data is stored serverless-ly in **Cloud Firestore** and **Cloud Storage**.

### 1. Firestore Security Rules and Indexes
The Firestore security rules are maintained in `firestore.rules`, and database queries indexes in `firestore.indexes.json`. To deploy them:
```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore
```

### 2. Cloud Storage Rules
Deploy storage rules for secure file downloads:
```bash
# Deploy Cloud Storage rules
firebase deploy --only storage
```

---

## 🌐 Domain Configuration (Cloudflare)

To point `portal.smartlogisticscr.com` to Firebase Hosting:

1. **In Cloudflare Dashboard:**
   - Add a `CNAME` record for `portal` pointing to `smart-portal-admin.web.app`.
   - Set proxy status to `DNS only` (gray cloud) initially to let Firebase provision the SSL certificate, then you can toggle it to `Proxied` (orange cloud) for DDoS protection and edge caching.

---

## ✅ Testing & Verification

### 1. Test Functions HTTP Endpoint
```bash
# Test Resend webhook receiver or API health endpoint
curl -I https://us-central1-smart-portal-admin.cloudfunctions.net/resendWebhook
```

### 2. Test Frontend
Open [https://portal.smartlogisticscr.com](https://portal.smartlogisticscr.com) in your browser. Ensure:
- Login page loads successfully.
- Navigation between *Invoices*, *Packages*, and *Encomiendas* works without flashes or crashes.
- Search filters execute properly upon clicking "Buscar".

---

## 🔧 Troubleshooting

### "Firebase deployment failed"
If hosting or functions deploy fails:
- Check Node version: Firebase Functions deployment requires Node 20 or higher.
- Review error logs in `firebase-debug.log`.
- Ensure you have run `npm run build` inside the `functions` directory before deploying.

---

## 🔄 Deploy Changes Workflow

We use automated deployment scripts in the `scripts/deploy/` directory:

```bash
# Deploy only frontend
./scripts/deploy/deploy-hosting.sh

# Deploy only functions
./scripts/deploy/deploy-functions.sh
```

---

## 💰 Cost Analysis & Optimization

### Monthly Cost Estimates (USD)

Because we use a purely serverless Firebase stack, our monthly operational costs are extremely low. In normal operations, usage stays mostly within the Firebase Free Tier.

| Service | Pricing Model | Monthly Cost | Notes |
|---------|---------------|--------------|-------|
| **Firebase Hosting** | Free up to 10GB storage / $0.15 per GB transfer | $0.00 - $3.00 | Static asset CDN caching |
| **Cloud Firestore** | Free up to 50k reads / 20k writes per day | $0.00 - $10.00 | Serverless document database |
| **Firebase Functions**| Free up to 2M invocations/month | $0.00 - $2.00 | Pay-as-you-go backend logic |
| **Firebase Auth** | Free up to 50k MAU | $0.00 | Identity & access management |
| **Cloud Storage** | Free up to 5GB storage | $0.00 - $3.00 | Invoice PDFs and photos |
| **Resend (Email API)**| Free up to 3k emails/month | $0.00 - $20.00 | Free plan handles standard notifications |
| **Total** | | **$0.00 - $38.00** | **Scales elastically based on exact usage** |

### Cost Optimization Strategies

We have implemented several software-level cost-saving optimizations in the SP1 code:

#### 1. Client-First Search Bypass (Firestore Read Reducer)
To avoid query reads inside the expensive `packages` and `invoices` collections, we implemented client-side memory searching:
- **How it works**: Before querying Firestore, hooks check if search terms match identifier patterns (like unique tracking numbers, SL Codes, or invoice IDs) already loaded in memory or within manifest-bounded scopes.
- **Cost Reduction**: Reduces Firestore read billing by **up to 90%** for repetitive, localized, and unique identifier search actions.

#### 2. Deferred Filter Querying (Lazy Fetching)
Instead of executing a search query on the server every time a user types a letter or selects a secondary dropdown, filter changes in both `Packages.tsx` and `Invoices.tsx` are kept strictly in UI state:
- **Action**: Database reads are only triggered when the user explicitly clicks the consolidated action button (**"Buscar"**).
- **Cost Reduction**: Prevents accidental and repetitive queries during filter selection.

#### 3. Caching of Assets (Hosting Edge CDN)
We configured `Cache-Control` headers in `firebase.json` so compiled JS/CSS files are cached permanently on CDN edge nodes:
- **Cost Reduction**: Minimizes data transfer bandwidth costs out of Firebase Hosting.
