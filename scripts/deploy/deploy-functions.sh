#!/bin/bash

# Smart Portal Admin - Firebase Functions Deployment Script
# Deploys Firebase Cloud Functions

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure we're in the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Error: Firebase CLI not found. Please install it first.${NC}"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Banner
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Smart Portal Admin - Firebase Functions Deployment   ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Install functions dependencies
echo -e "${BLUE}📦 Step 1: Installing functions dependencies...${NC}"
echo "─────────────────────────────────────────────────────────"

cd functions
if npm install 2>&1; then
    echo -e "${GREEN}✅ Functions dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install functions dependencies${NC}"
    exit 1
fi
cd ..
echo ""

# Step 2: Build functions
echo -e "${BLUE}🔨 Step 2: Building functions...${NC}"
echo "─────────────────────────────────────────────────────────"

cd functions
if npm run build 2>&1; then
    echo -e "${GREEN}✅ Functions build successful${NC}"
else
    echo -e "${RED}❌ Functions build failed${NC}"
    exit 1
fi
cd ..
echo ""

# Step 3: Deploy functions
echo -e "${BLUE}🚀 Step 3: Deploying Firebase Functions...${NC}"
echo "─────────────────────────────────────────────────────────"

if firebase deploy --only functions 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Functions deployed successfully!${NC}"
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   ✅ Functions Deployment Complete!                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
else
    echo -e "${RED}❌ Functions deployment failed${NC}"
    exit 1
fi
