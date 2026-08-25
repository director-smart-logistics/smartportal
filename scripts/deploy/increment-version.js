#!/usr/bin/env node

/**
 * Increment build number (patch version) in root package.json
 * This script is run automatically before each deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version || '0.0.0';
  
  // Parse semantic version (MAJOR.MINOR.PATCH)
  const parts = version.split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  
  // Increment patch version (build number)
  const newVersion = `${major}.${minor}.${patch + 1}`;
  
  packageJson.version = newVersion;
  
  // Write back to package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  
  console.log(`✅ Version incremented: ${version} → ${newVersion}`);
  
} catch (error) {
  console.error('❌ Error incrementing version:', error.message);
  process.exit(1);
}
