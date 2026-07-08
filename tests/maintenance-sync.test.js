const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildWorkerConfigUrl,
  fetchCurrentContents,
  isWorkerMode,
  normalizeMaintenanceSettings,
  saveContentsToBackend,
} = require('../maintenance-sync');

test('normalizeMaintenanceSettings 會保留預設隱藏設定並清理 apiBaseUrl', () => {
  const result = normalizeMaintenanceSettings({
    apiBaseUrl: '  https://example.workers.dev/  ',
    owner: '  hidden-owner  ',
    repo: '  hidden-repo  ',
    branch: '  main  ',
    path: '  config.json  ',
    token: '  secret  ',
    rememberToken: 1,
  });

  assert.equal(result.apiBaseUrl, 'https://example.workers.dev');
  assert.equal(result.owner, 'hidden-owner');
  assert.equal(result.repo, 'hidden-repo');
  assert.equal(result.branch, 'main');
  assert.equal(result.path, 'config.json');
  assert.equal(result.token, 'secret');
  assert.equal(result.rememberToken, true);
});

test('isWorkerMode 會在 apiBaseUrl 存在時啟用 Worker 模式', () => {
  assert.equal(isWorkerMode({ apiBaseUrl: 'https://example.workers.dev' }), true);
  assert.equal(isWorkerMode({ apiBaseUrl: '   ' }), false);
});

test('buildWorkerConfigUrl 會指向 /config', () => {
  assert.equal(buildWorkerConfigUrl('https://example.workers.dev/'), 'https://example.workers.dev/config');
});

test('fetchCurrentContents 會讀取 Worker 的雲端設定', async () => {
  const fetchStub = async (url, init) => {
    assert.equal(url, 'https://example.workers.dev/config');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        path: 'config.json',
        sha: 'abc123',
        config: {
          title: '停車場設備功能測試完成簽認單',
        },
      }),
    };
  };

  const result = await fetchCurrentContents(
    {
      apiBaseUrl: 'https://example.workers.dev',
      owner: '',
      repo: '',
      branch: '',
      path: '',
    },
    fetchStub,
  );

  assert.equal(result.path, 'config.json');
  assert.equal(result.sha, 'abc123');
  assert.equal(result.config.title, '停車場設備功能測試完成簽認單');
});

test('saveContentsToBackend 會把資料送到 Worker，不需要 GitHub Token', async () => {
  const fetchStub = async (url, init) => {
    assert.equal(url, 'https://example.workers.dev/config');
    assert.equal(init.method, 'PUT');
    assert.equal(init.headers.Accept, 'application/json');
    assert.match(init.headers['Content-Type'], /application\/json/);

    const body = JSON.parse(init.body);
    assert.equal(body.message, 'feat: update config');
    assert.equal(body.sha, 'abc123');
    assert.equal(body.branch, 'main');
    assert.equal(body.path, 'config.json');
    assert.equal(body.config.title, '新的公版標題');

    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  const result = await saveContentsToBackend(
    {
      apiBaseUrl: 'https://example.workers.dev',
      owner: '',
      repo: '',
      branch: 'main',
      path: 'config.json',
      token: '',
      sha: 'abc123',
      message: 'feat: update config',
      config: {
        title: '新的公版標題',
      },
    },
    fetchStub,
  );

  assert.equal(result.ok, true);
});
