const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCorsHeaders,
  handleMaintenanceRequest,
  normalizeEnv,
} = require('../worker/maintenance-worker');

function encodeBase64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}

test('normalizeEnv 會套用預設分支與路徑', () => {
  const result = normalizeEnv({
    GITHUB_REPO_OWNER: ' parking-team ',
    GITHUB_REPO_NAME: ' sign-form ',
    GITHUB_REPO_BRANCH: ' ',
    GITHUB_CONFIG_PATH: ' ',
  });

  assert.equal(result.owner, 'parking-team');
  assert.equal(result.repo, 'sign-form');
  assert.equal(result.branch, 'main');
  assert.equal(result.path, 'config.json');
});

test('GET /config 不需要呼叫端驗證，會直接回傳雲端設定', async () => {
  const fetchStub = async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/parking-team/sign-form/contents/config.json?ref=main');
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
    assert.equal(init.headers.Authorization, undefined);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        path: 'config.json',
        sha: 'abc123',
        content: encodeBase64(JSON.stringify({
          title: '停車場設備功能測試完成簽認單',
          basicFields: [],
          deviceTypes: {},
        })),
      }),
    };
  };

  const response = await handleMaintenanceRequest(
    new Request('https://example.com/config', { method: 'GET' }),
    {
      GITHUB_REPO_OWNER: 'parking-team',
      GITHUB_REPO_NAME: 'sign-form',
      GITHUB_REPO_BRANCH: 'main',
      GITHUB_CONFIG_PATH: 'config.json',
      GITHUB_TOKEN: '',
    },
    fetchStub,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');

  const body = await response.json();
  assert.equal(body.source, 'github');
  assert.equal(body.sha, 'abc123');
  assert.equal(body.config.title, '停車場設備功能測試完成簽認單');
});

test('PUT /config 會更新 GitHub，且不需要來自呼叫端的驗證資訊', async () => {
  const calls = [];
  const fetchStub = async (url, init = {}) => {
    calls.push({ url, init });

    if (calls.length === 1) {
      assert.equal(url, 'https://api.github.com/repos/parking-team/sign-form/contents/config.json?ref=main');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          path: 'config.json',
          sha: 'current-sha',
          content: encodeBase64(JSON.stringify({
            title: '舊版標題',
            basicFields: [],
            deviceTypes: {},
          })),
        }),
      };
    }

    assert.equal(url, 'https://api.github.com/repos/parking-team/sign-form/contents/config.json');
    assert.equal(init.method, 'PUT');
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
    assert.equal(init.headers.Authorization, undefined);

    const body = JSON.parse(init.body);
    assert.equal(body.sha, 'current-sha');
    assert.equal(body.message, 'feat: update config.json');
    assert.equal(body.content, encodeBase64(JSON.stringify({
      title: '新的公版標題',
      basicFields: [],
      deviceTypes: {},
    }, null, 2) + '\n'));

    return {
      ok: true,
      status: 200,
      json: async () => ({ content: { sha: 'new-sha' } }),
    };
  };

  const response = await handleMaintenanceRequest(
    new Request('https://example.com/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          title: '新的公版標題',
          basicFields: [],
          deviceTypes: {},
        },
      }),
    }),
    {
      GITHUB_REPO_OWNER: 'parking-team',
      GITHUB_REPO_NAME: 'sign-form',
      GITHUB_REPO_BRANCH: 'main',
      GITHUB_CONFIG_PATH: 'config.json',
      GITHUB_TOKEN: '',
    },
    fetchStub,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(calls.length, 2);
});

test('OPTIONS /config 會回傳 CORS preflight', async () => {
  const response = await handleMaintenanceRequest(
    new Request('https://example.com/config', { method: 'OPTIONS' }),
    {},
    async () => {
      throw new Error('should not be called');
    },
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-methods'), /GET/);
  assert.deepEqual(buildCorsHeaders()['access-control-allow-origin'], '*');
});
