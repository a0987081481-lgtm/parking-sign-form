const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadApp(overrides = {}) {
  const appPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const context = {
    Blob,
    console,
    document: overrides.document,
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
    TextDecoder,
    URL: overrides.URL,
    setTimeout: overrides.setTimeout,
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

test('getPdfSlicePlan moves a complete device card to the next page', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 120,
    contentToPdfRatio: 1,
    cursorY: 240,
    pageTop: 10,
    pageBottom: 287,
    safeBreaks: [],
  });

  assert.equal(plan.cursorY, 130);
  assert.deepEqual(Array.from(plan.slices, (slice) => ({ ...slice })), [
    { offset: 0, height: 120, pageBreakBefore: true },
  ]);
});

test('getPdfSlicePlan starts a bottom-aligned tall card on a new page', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 520,
    contentToPdfRatio: 1,
    cursorY: 210,
    pageTop: 10,
    pageBottom: 210,
    safeBreaks: [],
  });

  assert.equal(plan.slices[0].pageBreakBefore, true);
  assert.equal(plan.slices[0].height, 200);
  assert.equal(plan.injected, undefined);
  assert.equal(plan.slices.injected, undefined);
});

test('getPdfSlicePlan starts on a new page when fractional cursor leaves less than one pixel', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 520,
    contentToPdfRatio: 1,
    cursorY: 209.5,
    pageTop: 10,
    pageBottom: 210,
    safeBreaks: [],
  });

  assert.deepEqual(Array.from(plan.slices, (slice) => ({ ...slice })), [
    { offset: 0, height: 200, pageBreakBefore: true },
    { offset: 200, height: 200, pageBreakBefore: true },
    { offset: 400, height: 120, pageBreakBefore: true },
  ]);
  assert.equal(plan.cursorY, 130);
});

test('getPdfSlicePlan breaks a tall device card at safe item boundaries', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 520,
    contentToPdfRatio: 1,
    cursorY: 10,
    pageTop: 10,
    pageBottom: 210,
    safeBreaks: [160, 310, 460],
  });

  assert.deepEqual(Array.from(plan.slices, (slice) => ({ ...slice })), [
    { offset: 0, height: 160, pageBreakBefore: false },
    { offset: 160, height: 150, pageBreakBefore: true },
    { offset: 310, height: 150, pageBreakBefore: true },
    { offset: 460, height: 60, pageBreakBefore: true },
  ]);
});

test('getPdfSlicePlan ignores custom constructors on input and safeBreaks', () => {
  const app = loadApp();
  const injectedPrototype = { injected: true };
  function InjectedConstructor() {
    const value = { injected: true };
    Object.setPrototypeOf(value, injectedPrototype);
    return value;
  }

  const input = {
    contentHeight: 120,
    contentToPdfRatio: 1,
    cursorY: 10,
    pageTop: 10,
    pageBottom: 210,
    safeBreaks: [],
  };
  input.constructor = InjectedConstructor;
  input.safeBreaks.constructor = InjectedConstructor;

  const plan = app.getPdfSlicePlan(input);

  assert.equal(plan.injected, undefined);
  assert.equal(plan.slices.injected, undefined);
  assert.equal(plan.slices[0].injected, undefined);
});

test('getDevicePdfBreakpoints returns valid increasing canvas positions', () => {
  const app = loadApp({ devicePixelRatio: 2 });
  const items = [
    { getBoundingClientRect: () => ({ bottom: 180 }) },
    { getBoundingClientRect: () => ({ bottom: 260 }) },
    { getBoundingClientRect: () => ({ bottom: 260 }) },
    { getBoundingClientRect: () => ({ bottom: 120 }) },
  ];
  const node = {
    getBoundingClientRect: () => ({ top: 100, width: 400 }),
    querySelectorAll: () => items,
  };

  assert.deepEqual([...app.getDevicePdfBreakpoints(node, { width: 400, height: 250 })], [100, 200]);
  assert.deepEqual([...app.getDevicePdfBreakpoints(null, { width: 400, height: 250 })], []);
});

test('getPdfBlockBreakpoints supports signature cards as safe page boundaries', () => {
  const app = loadApp({ devicePixelRatio: 2 });
  const cards = [
    { getBoundingClientRect: () => ({ bottom: 220 }) },
    { getBoundingClientRect: () => ({ bottom: 360 }) },
  ];
  const node = {
    getBoundingClientRect: () => ({ top: 100, width: 400 }),
    querySelectorAll: (selector) => {
      assert.equal(selector, '.signature-summary-card, .signature-card');
      return cards;
    },
  };

  assert.deepEqual(
    [...app.getPdfBlockBreakpoints(node, { width: 400, height: 600 }, '.signature-summary-card, .signature-card')],
    [150, 325],
  );
});

test('downloadPdfBlob revokes the object URL when clicking fails', () => {
  let revokedUrl = null;
  const app = loadApp({
    URL: {
      createObjectURL() {
        return 'blob:test';
      },
      revokeObjectURL(url) {
        revokedUrl = url;
      },
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      createElement() {
        return {
          click() {
            throw new Error('click failed');
          },
        };
      },
    },
  });

  assert.throws(() => app.downloadPdfBlob(new Blob(['pdf']), 'test.pdf'), /click failed/);
  assert.equal(revokedUrl, 'blob:test');
});

test('createPdfBlob validates application/pdf and the PDF header', async () => {
  const app = loadApp();
  const fakePdf = {
    output(mode) {
      assert.equal(mode, 'blob');
      return new Blob(['%PDF-1.3\n'], { type: 'application/pdf' });
    },
  };

  const blob = await app.createPdfBlob(fakePdf);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), '%PDF-1.3\n');
});

test('createPdfBlob rejects a non-PDF MIME type', async () => {
  const app = loadApp();
  const fakePdf = {
    output(mode) {
      assert.equal(mode, 'blob');
      return new Blob(['%PDF-1.3\n'], { type: 'application/octet-stream' });
    },
  };

  await assert.rejects(
    () => app.createPdfBlob(fakePdf),
    /PDF Blob MIME 類型不正確/,
  );
});

test('createPdfBlob rejects an invalid PDF header', async () => {
  const app = loadApp();
  const fakePdf = {
    output(mode) {
      assert.equal(mode, 'blob');
      return new Blob(['NOTPDF'], { type: 'application/pdf' });
    },
  };

  await assert.rejects(
    () => app.createPdfBlob(fakePdf),
    /PDF 檔案標頭不正確/,
  );
});
