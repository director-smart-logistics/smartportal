#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const SOURCE_DIR = path.resolve('/Users/jbricenoz/Workspace/smartlogistics/smart-portal-1');
const TARGET_DIR = path.resolve('/Users/jbricenoz/Workspace/smartlogistics/smartportal');

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`Target directory ${TARGET_DIR} does not exist.`);
  process.exit(1);
}

// Read version from package.json
let version = 'latest';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'package.json'), 'utf8'));
  version = pkg.version || version;
} catch {}

const customMsg = process.argv.slice(2).join(' ');
const commitMsg = customMsg || `chore: sync release v${version} from smart-portal-1`;

console.log(`🔄 Sincronizando smart-portal-1 hacia smartportal (${commitMsg})...`);

// 1. Rsync cleanly (excludes .git, node_modules, internal sync script, etc.)
execSync(`rsync -av \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='functions/node_modules' \
  --exclude='dist' \
  --exclude='coverage' \
  --exclude='playwright-report' \
  --exclude='playwright-videos' \
  --exclude='test-results' \
  --exclude='scratch' \
  --exclude='.pnpm-store' \
  --exclude='.DS_Store' \
  --exclude='scripts/deploy/sync-to-smartportal.mjs' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"`, { stdio: 'inherit' });

// 2. Ensure environment secrets stay synchronized locally (ignored by .gitignore)
if (fs.existsSync(`${SOURCE_DIR}/.env`)) fs.copyFileSync(`${SOURCE_DIR}/.env`, `${TARGET_DIR}/.env`);
if (fs.existsSync(`${SOURCE_DIR}/.env.production`)) fs.copyFileSync(`${SOURCE_DIR}/.env.production`, `${TARGET_DIR}/.env.production`);
if (fs.existsSync(`${SOURCE_DIR}/functions/.env`)) fs.copyFileSync(`${SOURCE_DIR}/functions/.env`, `${TARGET_DIR}/functions/.env`);

// 3. Check git status in target
const gitStatus = execSync('git status --porcelain', { cwd: TARGET_DIR }).toString().trim();
if (!gitStatus) {
  console.log('✅ El repositorio smartportal ya se encuentra 100% al día.');
  process.exit(0);
}

// 4. Commit and push in target
console.log(`📦 Creando commit en smartportal: "${commitMsg}"...`);
execSync('git add .', { cwd: TARGET_DIR, stdio: 'inherit' });
execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: TARGET_DIR, stdio: 'inherit' });

console.log('🚀 Publicando a origin/main en director-smart-logistics/smartportal...');
execSync('git push origin main', { cwd: TARGET_DIR, stdio: 'inherit' });

console.log('✅ Sincronización con director-smart-logistics/smartportal completada exitosamente.');
