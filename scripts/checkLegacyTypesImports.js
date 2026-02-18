const fs = require('fs');
const path = require('path');

const roots = ['app', 'components', 'hooks', 'utils'];
const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const pattern = '@/types/';

const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!allowedExt.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(pattern)) {
        findings.push(`${fullPath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

for (const root of roots) walk(root);

if (findings.length) {
  console.error('Legacy @/types imports found:');
  for (const finding of findings) {
    console.error(finding);
  }
  process.exit(1);
}

console.log('No legacy @/types imports in app/components/hooks/utils');
