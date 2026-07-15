const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('public page loads config-loader before app.js so config.json can update the form', () => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const configLoaderIndex = html.indexOf('config-loader.js');
  const appScriptIndex = html.indexOf('app.js');

  assert.ok(configLoaderIndex >= 0, 'index.html should include config-loader.js');
  assert.ok(appScriptIndex >= 0, 'index.html should include app.js');
  assert.ok(
    configLoaderIndex < appScriptIndex,
    'config-loader.js must load before app.js so the public page can fetch config.json',
  );
});

test('public page cache-busts local assets so GitHub Pages does not keep stale scripts', () => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');

  const expectedFragments = [
    'href="style.css?v=20260715-1"',
    'src="config.js?v=20260715-1"',
    'src="config-loader.js?v=20260715-1"',
    'src="app.js?v=20260715-1"',
  ];

  for (const fragment of expectedFragments) {
    assert.ok(html.includes(fragment), `index.html should include ${fragment}`);
  }
});

test('admin page cache-busts local assets so maintenance UI also refreshes', () => {
  const adminPath = path.join(__dirname, '..', 'admin.html');
  const html = fs.readFileSync(adminPath, 'utf8');

  const expectedFragments = [
    'href="style.css?v=20260715-1"',
    'src="config.js?v=20260715-1"',
    'src="maintenance-settings.js?v=20260715-1"',
    'src="config-loader.js?v=20260715-1"',
    'src="github-contents.js?v=20260715-1"',
    'src="maintenance-sync.js?v=20260715-1"',
    'src="admin-config-form.js?v=20260715-1"',
    'src="admin.js?v=20260715-1"',
  ];

  for (const fragment of expectedFragments) {
    assert.ok(html.includes(fragment), `admin.html should include ${fragment}`);
  }
});
