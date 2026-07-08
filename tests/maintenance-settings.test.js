const assert = require('node:assert/strict');
const test = require('node:test');

const maintenanceSettings = require('../maintenance-settings');

test('維護頁預設會帶入 Worker API URL', () => {
  assert.equal(
    maintenanceSettings.apiBaseUrl,
    'https://parking-sign-form-maintenance.a0987081481.workers.dev',
  );
});
