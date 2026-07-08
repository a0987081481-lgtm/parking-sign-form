const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadApp() {
  const appPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const context = {
    console,
    document: undefined,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
      clear() {},
    },
    navigator: { userAgent: 'node' },
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app.js' });

  return context.ParkingSignForm;
}

test('buildPdfFilename uses the project name and fallback name correctly', () => {
  const app = loadApp();

  assert.equal(
    app.buildPdfFilename('2026-07-07', '信義停車場'),
    '2026-07-07_信義停車場_功能測試完成簽認單.pdf'
  );

  assert.equal(
    app.buildPdfFilename('2026-07-07', '   '),
    '2026-07-07_未命名案場_功能測試完成簽認單.pdf'
  );
});

test('formatDateInputValue returns a local yyyy-mm-dd string', () => {
  const app = loadApp();

  assert.equal(app.formatDateInputValue(new Date(2026, 6, 7)), '2026-07-07');
});

test('formatDateTimeValue returns a local yyyy-mm-dd hh:mm:ss string', () => {
  const app = loadApp();

  assert.equal(
    app.formatDateTimeValue(new Date(2026, 6, 7, 9, 5, 3)),
    '2026-07-07 09:05:03'
  );
});

test('normalizeFilenamePart trims and replaces invalid filename characters', () => {
  const app = loadApp();

  assert.equal(app.normalizeFilenamePart('  信義/北區  '), '信義_北區');
});
