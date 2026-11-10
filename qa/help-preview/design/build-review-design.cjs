const fs = require('node:fs');
const path = require('node:path');
let html = fs.readFileSync(path.join(__dirname, 'review-minimal.template.html'), 'utf8');
for (const [key, name] of Object.entries({ pencil: 'pencil', back: 'arrow-back', send: 'arrow-up', check: 'checkmark' })) {
  const svg = fs.readFileSync(path.join(__dirname, 'assets', `${name}-outline.svg`), 'utf8').trim();
  html = html.replaceAll(`{{${key}}}`, svg);
}
fs.writeFileSync(path.join(__dirname, 'review-minimal.html'), html);
