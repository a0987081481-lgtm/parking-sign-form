const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildContentsUpdatePayload,
  fetchCurrentContents,
} = require('../github-contents');

test('buildContentsUpdatePayload encodes config json and sha', () => {
  const payload = buildContentsUpdatePayload({
    owner: 'parking-team',
    repo: 'sign-form',
    path: 'config.json',
    branch: 'main',
    sha: 'abc123',
    message: 'feat: update public config',
    config: {
      title: '停車場設備功能測試完成簽認單',
    },
  });

  assert.equal(payload.owner, 'parking-team');
  assert.equal(payload.repo, 'sign-form');
  assert.equal(payload.path, 'config.json');
  assert.equal(payload.branch, 'main');
  assert.equal(payload.sha, 'abc123');
  assert.equal(payload.message, 'feat: update public config');
  assert.equal(
    Buffer.from(payload.content, 'base64').toString('utf8'),
    JSON.stringify({ title: '停車場設備功能測試完成簽認單' }, null, 2) + '\n'
  );
});

test('fetchCurrentContents decodes an existing config file from GitHub', async () => {
  const fetchStub = async (url) => {
    assert.equal(url, 'https://api.github.com/repos/parking-team/sign-form/contents/config.json?ref=main');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sha: 'abc123',
        path: 'config.json',
        content: Buffer.from(
          JSON.stringify({
            title: '停車場設備功能測試完成簽認單',
            basicFields: [],
            deviceTypes: {},
          })
        ).toString('base64'),
        encoding: 'base64',
      }),
    };
  };

  const result = await fetchCurrentContents(
    {
      owner: 'parking-team',
      repo: 'sign-form',
      path: 'config.json',
      branch: 'main',
    },
    fetchStub
  );

  assert.equal(result.sha, 'abc123');
  assert.equal(result.path, 'config.json');
  assert.equal(result.config.title, '停車場設備功能測試完成簽認單');
});
