#!/bin/bash

# Smart Portal Admin - Frontend Deployment Script
# Builds frontend and deploys to Firebase Hosting

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

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ Error: pnpm not found. Please install it first.${NC}"
    echo "   npm install -g pnpm"
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Banner
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Smart Portal Admin - Frontend Deployment             ║${NC}"
echo -e "${CYAN}║   Version: Will be incremented                        ║${NC}"
echo -e "${CYAN}║   Target: portal.smartlogisticscr.com                  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Clean previous build
echo -e "${BLUE}🧹 Step 1: Cleaning previous build...${NC}"
if [ -d "dist" ]; then
    rm -rf dist
    echo -e "${GREEN}✅ Cleaned dist folder${NC}"
else
    echo -e "${YELLOW}  ℹ️  No previous build found${NC}"
fi
echo ""

# Step 2: Increment version
echo -e "${BLUE}📝 Step 2: Incrementing version...${NC}"
echo "─────────────────────────────────────────────────────────"

if node scripts/deploy/increment-version.js 2>&1; then
    echo -e "${GREEN}✅ Version incremented${NC}"
else
    echo -e "${RED}❌ Failed to increment version${NC}"
    exit 1
fi

# Get updated version
VERSION=$(node -p "require('./package.json').version")
echo -e "${CYAN}  New version: ${VERSION}${NC}"
echo ""

# Step 3: Install dependencies
echo -e "${BLUE}📦 Step 3: Installing dependencies...${NC}"
echo "─────────────────────────────────────────────────────────"

if pnpm install 2>&1; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Step 4: Build frontend
echo -e "${BLUE}🔨 Step 4: Building frontend (Vite)...${NC}"
echo "─────────────────────────────────────────────────────────"

# Load production environment variables
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}  📝 Loading production environment variables${NC}"
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}  ⚠️  No .env.production file found, using defaults${NC}"
fi

# Run build
if pnpm run build 2>&1; then
    echo -e "${GREEN}✅ Frontend build successful${NC}"
else
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
fi

# Verify dist folder exists and has content
if [ ! -d "dist/spa" ]; then
    echo -e "${RED}❌ Error: dist/spa folder not created${NC}"
    echo -e "${RED}   Current directory: $(pwd)${NC}"
    echo -e "${RED}   Contents: $(ls -la | head -10)${NC}"
    exit 1
fi

if [ -z "$(ls -A dist/spa 2>/dev/null)" ]; then
    echo -e "${RED}❌ Error: dist/spa folder is empty${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build output verified: $(du -sh dist/spa | cut -f1)${NC}"
echo ""

# Step 5: Verify build contents
echo -e "${BLUE}🔍 Step 5: Verifying build contents...${NC}"
if [ -f "dist/spa/index.html" ]; then
    echo -e "${GREEN}  ✅ index.html found${NC}"
else
    echo -e "${RED}  ❌ index.html missing${NC}"
    echo -e "${RED}     Looking in: $(pwd)/dist/spa/${NC}"
    exit 1
fi

JS_FILES=$(find dist/spa -name "*.js" | wc -l | tr -d ' ')
CSS_FILES=$(find dist/spa -name "*.css" | wc -l | tr -d ' ')

echo -e "${GREEN}  ✅ Found $JS_FILES JavaScript file(s)${NC}"
echo -e "${GREEN}  ✅ Found $CSS_FILES CSS file(s)${NC}"

# Check for API URL in built files
if grep -q "portal.smartlogisticscr.com/api" dist/spa/index.html 2>/dev/null; then
    echo -e "${GREEN}  ✅ Production API URL configured${NC}"
else
    echo -e "${YELLOW}  ⚠️  Production API URL not found in build${NC}"
fi
echo ""

# Step 6: Deploy to Firebase Hosting
echo -e "${BLUE}🚀 Step 6: Deploying to Firebase Hosting...${NC}"
echo "─────────────────────────────────────────────────────────"

if firebase deploy --only hosting 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Hosting deployed successfully!${NC}"
    echo ""
    
    # Get hosting URL
    HOSTING_URL="https://portal.smartlogisticscr.com"
    
    echo -e "${CYAN}🌐 Your site is live at:${NC}"
    echo -e "${CYAN}   ${HOSTING_URL}${NC}"
    echo ""
    echo -e "${CYAN}🔗 API endpoint:${NC}"
    echo -e "${CYAN}   ${HOSTING_URL}/api${NC}"
    echo ""
    
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   ✅ Deployment Complete!                               ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}📋 Git Commit Message (copy & paste):${NC}"
    echo -e "${CYAN}   RELEASE ${VERSION} - Frontend deployment to portal.smartlogisticscr.com${NC}"
    echo ""
    echo "Next steps:"
    echo "  • View site: open ${HOSTING_URL}"
    echo "  • Check API: curl ${HOSTING_URL}/api/health"
    echo "  • Clear cache: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)"
    echo ""
    echo "Firebase commands:"
    echo "  • View channels: firebase hosting:channel:list"
    echo "  • Rollback: firebase hosting:rollback"
    echo ""
else
    echo -e "${RED}❌ Hosting deployment failed${NC}"
    exit 1
fi
