const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildPublicConfig,
  createBlankBasicField,
  createBlankDeviceItem,
  createFormState,
  validateFormState,
} = require('../admin-config-form');

const fallbackConfig = {
  title: '停車場設備功能測試完成簽認單',
  basicFields: [
    { key: 'projectName', label: '案場名稱', type: 'text', required: true, locked: true },
    { key: 'siteCode', label: '場地代號', type: 'text', required: false, locked: true },
    { key: 'checkDate', label: '檢查日期', type: 'date', required: true, locked: false },
  ],
  deviceTypes: {
    entrance: {
      label: '入口設備',
      items: ['柵欄機', '車牌辨識'],
    },
  },
};

test('createFormState 會保留核心欄位並轉成可編輯 state', () => {
  const state = createFormState(
    {
      title: '雲端維護版標題',
      basicFields: [
        { key: 'testerName', label: '測試人員', type: 'text', required: false, locked: false },
      ],
      deviceTypes: {
        exit: {
          label: '出口設備',
          items: ['柵欄機', '車牌辨識'],
        },
      },
    },
    fallbackConfig,
  );

  assert.equal(state.title, '雲端維護版標題');
  assert.deepEqual(
    state.basicFields.slice(0, 2).map((field) => field.key),
    ['projectName', 'siteCode'],
  );
  assert.equal(state.basicFields[0].locked, true);
  assert.equal(state.basicFields[1].locked, true);
  assert.equal(state.basicFields.some((field) => field.key === 'testerName'), true);
  assert.equal(state.deviceTypes[0].key, 'exit');
  assert.equal(state.deviceTypes[0].items[0].label, '柵欄機');
});

test('buildPublicConfig 會整理乾淨的公版設定', () => {
  const state = createFormState(
    {
      title: '雲端維護版標題',
      basicFields: [
        { key: 'testerName', label: '測試人員', type: 'text', required: false, locked: false },
      ],
      deviceTypes: {
        exit: {
          label: '出口設備',
          items: ['柵欄機', '車牌辨識'],
        },
      },
    },
    fallbackConfig,
  );

  state.basicFields.push(createBlankBasicField({ key: 'ownerName', label: '業主', type: 'text' }));
  state.deviceTypes[0].items.push(createBlankDeviceItem({ label: '  ' }));
  state.deviceTypes[0].items.push(createBlankDeviceItem({ label: '車牌辨識' }));

  const config = buildPublicConfig(state);

  assert.equal(config.title, '雲端維護版標題');
  assert.equal(config.basicFields.some((field) => field.key === 'projectName'), true);
  assert.equal(config.basicFields.some((field) => field.key === 'siteCode'), true);
  assert.equal(config.basicFields.some((field) => field.key === 'ownerName'), true);
  assert.equal(config.basicFields.find((field) => field.key === 'projectName').locked, true);
  assert.deepEqual(config.deviceTypes.exit.items, ['柵欄機', '車牌辨識']);
});

test('validateFormState 會抓出空白與重複欄位', () => {
  const result = validateFormState({
    title: '   ',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text' },
      { key: 'siteCode', label: '場地代號', type: 'text' },
      { key: 'siteCode', label: '重複欄位', type: 'text' },
    ],
    deviceTypes: [
      {
        key: 'entrance',
        label: '入口設備',
        items: [
          { label: '柵欄機' },
          { label: '  ' },
          { label: '柵欄機' },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /標題/);
  assert.match(result.errors.join('\n'), /代號重複/);
  assert.match(result.errors.join('\n'), /項目重複/);
});
