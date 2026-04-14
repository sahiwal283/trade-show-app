#!/usr/bin/env node
/**
 * Enforce architecture boundary:
 * Trade Show backend must ONLY use zohoIntegrationClient.
 * Direct Zoho services are forbidden.
 */

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

const forbiddenPatterns = [
  'zohoMultiAccountService',
  'zohoBooksService',
  '../config/zohoAccounts',
  './config/zohoAccounts',
];

const allowedSelfFiles = new Set([
  path.join(srcRoot, 'services', 'zohoIntegrationClient.ts'),
]);

function collectFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      collectFiles(fullPath, out);
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
      out.push(fullPath);
    }
  }
  return out;
}

const files = collectFiles(srcRoot);
const violations = [];

for (const file of files) {
  if (allowedSelfFiles.has(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      violations.push({ file, pattern });
    }
  }
}

if (violations.length > 0) {
  console.error('Forbidden direct Zoho integration references found:');
  for (const v of violations) {
    const relative = path.relative(backendRoot, v.file);
    console.error(`- ${relative}: "${v.pattern}"`);
  }
  process.exit(1);
}

console.log('Zoho architecture boundary check passed.');
