const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAdminPage() {
  const adminPath = path.join(__dirname, '..', 'admin.js');
  const source = fs.readFileSync(adminPath, 'utf8');
  const context = {
    console,
    document: undefined,
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'admin.js' });

  return context.AdminPage;
}

test('renderStatusBanner 會把結果顯示成醒目的橫幅並捲到畫面中', () => {
  const page = loadAdminPage();

  assert.equal(typeof page.renderStatusBanner, 'function');

  let scrollOptions = null;
  const statusElement = {
    textContent: '',
    dataset: {},
    scrollIntoView(options) {
      scrollOptions = options;
    },
  };

  page.renderStatusBanner(statusElement, '已同步到所有人的公版頁面。', 'success');

  assert.equal(statusElement.textContent, '已同步到所有人的公版頁面。');
  assert.equal(statusElement.dataset.tone, 'success');
  assert.equal(scrollOptions.behavior, 'smooth');
  assert.equal(scrollOptions.block, 'center');
});

test('renderStatusBanner 允許 info 訊息不捲動', () => {
  const page = loadAdminPage();

  let scrolled = false;
  const statusElement = {
    textContent: '',
    dataset: {},
    scrollIntoView() {
      scrolled = true;
    },
  };

  page.renderStatusBanner(statusElement, '載入中', 'info', { reveal: false });

  assert.equal(scrolled, false);
});
