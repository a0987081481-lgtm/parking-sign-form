const assert = require('node:assert/strict');
const test = require('node:test');

const { resolvePublicConfig } = require('../config-loader');

const fallbackConfig = {
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

test('resolvePublicConfig returns fallback when fetch throws', async () => {
  const result = await resolvePublicConfig(fallbackConfig, async () => {
    throw new Error('offline');
  });

  assert.equal(result.title, fallbackConfig.title);
  assert.equal(result.basicFields.some((field) => field.key === 'projectName'), true);
  assert.equal(result.basicFields.some((field) => field.key === 'siteCode'), true);
  assert.equal(result.deviceTypes.entrance.label, '入口');
});

test('resolvePublicConfig merges remote config when fetch succeeds', async () => {
  const result = await resolvePublicConfig(fallbackConfig, async () => ({
    ok: true,
    status: 200,
    json: async () => ({
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
    }),
  }));

  assert.equal(result.title, '新的公版標題');
  assert.equal(result.basicFields.some((field) => field.key === 'projectName'), true);
  assert.equal(result.basicFields.some((field) => field.key === 'siteCode'), true);
  assert.equal(result.basicFields.find((field) => field.key === 'testerName').label, '測試人員');
  assert.equal(result.deviceTypes.exit.label, '出口');
});
