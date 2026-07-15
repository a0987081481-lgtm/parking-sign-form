const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadApp(overrides = {}) {
  const appPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const context = {
    console,
    document: undefined,
    devicePixelRatio: overrides.devicePixelRatio ?? 1,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
      clear() {},
    },
    navigator: { userAgent: 'node' },
    scrollY: overrides.scrollY ?? 0,
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app.js' });

  return context.ParkingSignForm;
}

test('getPdfCaptureScale caps html2canvas capture scale for smaller PDFs', () => {
  const app = loadApp();

  assert.equal(app.getPdfCaptureScale(3), 1.25);
  assert.equal(app.getPdfCaptureScale(1.2), 1.2);
  assert.equal(app.getPdfCaptureScale(0.5), 1);
  assert.equal(app.getPdfCaptureScale('not-a-number'), 1);
});

test('createPdfDocument enables jsPDF compression', () => {
  const app = loadApp();
  let receivedOptions = null;

  function FakeJsPdf(options) {
    receivedOptions = options;
    this.internal = { pageSize: { getHeight() { return 297; } } };
  }

  const pdf = app.createPdfDocument(FakeJsPdf);

  assert.ok(pdf instanceof FakeJsPdf);
  assert.equal(receivedOptions.orientation, 'p');
  assert.equal(receivedOptions.unit, 'mm');
  assert.equal(receivedOptions.format, 'a4');
  assert.equal(receivedOptions.compress, true);
});

test('createPdfImageAsset encodes canvases as JPEG with a quality hint', () => {
  const app = loadApp();
  let receivedArgs = null;

  const canvas = {
    toDataURL(type, quality) {
      receivedArgs = [type, quality];
      return 'data:image/jpeg;base64,abc';
    },
  };

  const asset = app.createPdfImageAsset(canvas);

  assert.equal(asset.dataUrl, 'data:image/jpeg;base64,abc');
  assert.equal(asset.format, 'JPEG');
  assert.equal(receivedArgs[0], 'image/jpeg');
  assert.equal(receivedArgs[1], 0.82);
});

test('createPdfImageAsset falls back to PNG when JPEG encoding fails', () => {
  const app = loadApp();
  const canvas = {
    toDataURL(type) {
      if (type === 'image/jpeg') {
        throw new Error('jpeg unsupported');
      }
      return 'data:image/png;base64,xyz';
    },
  };

  const asset = app.createPdfImageAsset(canvas);

  assert.equal(asset.dataUrl, 'data:image/png;base64,xyz');
  assert.equal(asset.format, 'PNG');
});
