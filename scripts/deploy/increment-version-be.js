#!/usr/bin/env node

/**
 * Increment build number (patch version) in functions/package.json (BE)
 * Run manually before deploying Firebase Functions:
 *   node scripts/deploy/increment-version-be.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const pkgPath = path.join(__dirname, '..', '..', 'functions', 'package.json');

try {
  const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '0.0.0';

  const [major, minor, patch] = version.split('.').map(Number);
  const newVersion = `${major}.${minor}.${patch + 1}`;

  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  console.log(`✅ BE version bumped: ${version} → ${newVersion}`);
} catch (err) {
  console.error('❌ Error incrementing BE version:', err.message);
  process.exit(1);
}
