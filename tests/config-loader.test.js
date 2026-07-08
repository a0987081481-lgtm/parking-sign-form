const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizePublicConfig,
  mergePublicConfig,
} = require('../config-loader');

test('normalizePublicConfig trims text and keeps valid items', () => {
  const result = normalizePublicConfig({
    title: '  停車場設備功能測試完成簽認單  ',
    basicFields: [
      { key: 'projectName', label: '  案場名稱  ', type: 'text', required: true },
      { key: '', label: '不合法欄位', type: 'text' },
    ],
    deviceTypes: {
      entrance: {
        label: '  入口  ',
        items: ['  車牌辨識  ', '', '  柵欄機開啟  '],
      },
    },
  });

  assert.equal(result.title, '停車場設備功能測試完成簽認單');
  assert.equal(result.basicFields.length, 1);
  assert.equal(result.basicFields[0].label, '案場名稱');
  assert.equal(result.deviceTypes.entrance.label, '入口');
  assert.deepEqual(result.deviceTypes.entrance.items, ['車牌辨識', '柵欄機開啟']);
});

test('mergePublicConfig restores locked core fields and preserves remote edits', () => {
  const fallback = {
    title: '停車場設備功能測試完成簽認單',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text', required: true, locked: true },
      { key: 'siteCode', label: '場地代號', type: 'text', required: false, locked: true },
      { key: 'checkDate', label: '檢查日期', type: 'date', required: true, locked: false },
    ],
    deviceTypes: {
      entrance: {
        label: '入口',
        items: ['車牌辨識'],
      },
    },
  };

  const remote = normalizePublicConfig({
    title: '新的公版標題',
    basicFields: [
      { key: 'checkDate', label: '檢查日期', type: 'date', required: true, locked: false },
      { key: 'testerName', label: '測試人員', type: 'text', required: false, locked: false },
    ],
    deviceTypes: {
      exit: {
        label: '出口',
        items: ['已繳費放行'],
      },
    },
  });

  const result = mergePublicConfig(fallback, remote);

  assert.equal(result.title, '新的公版標題');
  assert.equal(result.basicFields.some((field) => field.key === 'projectName'), true);
  assert.equal(result.basicFields.some((field) => field.key === 'siteCode'), true);
  assert.equal(result.basicFields.find((field) => field.key === 'checkDate').label, '檢查日期');
  assert.equal(result.basicFields.find((field) => field.key === 'testerName').label, '測試人員');
  assert.equal(result.deviceTypes.exit.label, '出口');
});
