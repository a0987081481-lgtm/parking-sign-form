const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp() {
  const appPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const context = {
    console,
    document: undefined,
    navigator: { userAgent: 'node' },
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app.js' });

  return context.ParkingSignForm;
}

test('總覽模式會顯示進入簽名畫面的摘要文案', () => {
  const app = loadApp();
  const model = app.buildSignatureSectionModel(false, { tester: '', owner: '' });

  assert.equal(model.mode, 'summary');
  assert.equal(model.primaryActionLabel, '進入簽名畫面');
  assert.equal(model.signers[0].statusLabel, '尚未簽名');
  assert.equal(model.signers[1].statusLabel, '尚未簽名');
});

test('編輯模式會顯示儲存並返回與已簽名預覽', () => {
  const app = loadApp();
  const model = app.buildSignatureSectionModel(true, {
    tester: 'data:image/png;base64,abc',
    owner: '',
  });

  assert.equal(model.mode, 'editor');
  assert.equal(model.primaryActionLabel, '儲存並返回');
  assert.equal(model.signers[0].hasPreview, true);
  assert.equal(model.signers[1].statusLabel, '尚未簽名');
});
