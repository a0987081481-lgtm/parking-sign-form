const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('mobile signature toolbar should not be sticky', () => {
  const stylePath = path.join(__dirname, '..', 'style.css');
  const css = fs.readFileSync(stylePath, 'utf8');

  assert.match(
    css,
    /@media \(max-width:\s*860px\)[\s\S]*body\.signature-mode \.signature-editor-toolbar\s*\{[\s\S]*position:\s*static;/,
  );
});
