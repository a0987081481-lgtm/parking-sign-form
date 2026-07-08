# GitHub Pages 公版維護頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓停車場設備功能測試完成簽認單在 GitHub Pages 上可以由 `admin.html` 集中維護同一份 `config.json`，並保留 `案場名稱` 與 `場地代號`。

**Architecture:** `index.html` 先用內建 fallback 設定渲染，再非阻斷地讀同站 `config.json` 覆蓋成最新公版。`admin.html` 使用 GitHub Contents API 直接讀寫 `config.json`，所有欄位驗證與序列化共用同一組純函式，避免公版與維護頁規則分叉。

**Tech Stack:** `HTML`, `CSS`, `vanilla JavaScript`, `Node.js built-in test runner`, `localStorage`, `GitHub Contents API`, `html2canvas`, `jsPDF`.

---

### Task 1: 建立共用設定模型與 `config.json`

**Files:**
- Create: `config.json`
- Create: `config-loader.js`
- Modify: `config.js`
- Test: `tests/config-loader.test.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizePublicConfig, mergePublicConfig } = require('../config-loader');

test('mergePublicConfig keeps projectName and siteCode locked', () => {
  const fallback = {
    title: '停車場設備功能測試完成簽認單',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text', required: true, locked: true },
      { key: 'siteCode', label: '場地代號', type: 'text', required: false, locked: true },
      { key: 'checkDate', label: '檢查日期', type: 'date', required: true, locked: false },
    ],
    deviceTypes: {},
  };

  const remote = normalizePublicConfig({
    title: '新的公版標題',
    basicFields: [
      { key: 'checkDate', label: '檢查日期', type: 'date', required: true, locked: false },
    ],
    deviceTypes: {},
  });

  const result = mergePublicConfig(fallback, remote);

  assert.equal(result.title, '新的公版標題');
  assert.equal(result.basicFields[0].key, 'projectName');
  assert.equal(result.basicFields[0].label, '案場名稱');
  assert.equal(result.basicFields[1].key, 'siteCode');
  assert.equal(result.basicFields[1].label, '場地代號');
  assert.equal(result.basicFields[2].key, 'checkDate');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config-loader.test.js -v`
Expected: FAIL because `config-loader.js` is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement `config-loader.js` with these exports:

```js
function normalizePublicConfig(input) {
  return {
    title: String(input?.title || '').trim(),
    basicFields: Array.isArray(input?.basicFields) ? input.basicFields : [],
    deviceTypes: input?.deviceTypes && typeof input.deviceTypes === 'object' ? input.deviceTypes : {},
  };
}

function mergePublicConfig(fallback, remote) {
  return {
    ...fallback,
    ...remote,
    basicFields: [
      ...fallback.basicFields.filter((field) => field.key === 'projectName' || field.key === 'siteCode'),
      ...remote.basicFields.filter((field) => field.key !== 'projectName' && field.key !== 'siteCode'),
    ],
    deviceTypes: {
      ...fallback.deviceTypes,
      ...remote.deviceTypes,
    },
  };
}
```

Create `config.json` as the canonical public configuration file by copying the current公版內容 into JSON so GitHub Pages can serve it directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config-loader.test.js -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config.json config-loader.js config.js tests/config-loader.test.js
git commit -m "feat: add shared config model"
```

### Task 2: 讓公版頁讀遠端設定並在失敗時 fallback

**Files:**
- Modify: `config-loader.js`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `style.css`
- Test: `tests/public-config-loading.test.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { resolvePublicConfig } = require('../config-loader');

test('resolvePublicConfig falls back when fetch fails', async () => {
  const fallback = {
    title: '停車場設備功能測試完成簽認單',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text', required: true, locked: true },
      { key: 'siteCode', label: '場地代號', type: 'text', required: false, locked: true },
    ],
    deviceTypes: {},
  };

  const result = await resolvePublicConfig(
    fallback,
    async () => ({ ok: false, status: 500, json: async () => ({}) })
  );

  assert.equal(result.title, fallback.title);
  assert.equal(result.basicFields[0].key, 'projectName');
  assert.equal(result.basicFields[1].key, 'siteCode');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/public-config-loading.test.js -v`
Expected: FAIL because `resolvePublicConfig` is not implemented yet and `app.js` still only uses local fallback data.

- [ ] **Step 3: Write minimal implementation**

Extend `config-loader.js` with:

```js
async function resolvePublicConfig(fallback, fetchImpl = fetch) {
  try {
    const response = await fetchImpl('config.json', { cache: 'no-store' });
    if (!response.ok) {
      return fallback;
    }

    const remote = normalizePublicConfig(await response.json());
    return mergePublicConfig(fallback, remote);
  } catch {
    return fallback;
  }
}
```

Update `app.js` so the public page:

- renders immediately with the existing fallback config
- loads `config.json` after first paint
- merges the remote config through `resolvePublicConfig(...)`
- shows a non-blocking status message if the fetch fails
- keeps `localStorage` 草稿、PDF 匯出、列印、簽名板行為不變

Update `index.html` to load the shared loader script before `app.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/public-config-loading.test.js -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config-loader.js app.js index.html style.css tests/public-config-loading.test.js
git commit -m "feat: load public config from config.json"
```

### Task 3: 建立維護頁與 GitHub 寫回流程

**Files:**
- Create: `admin.html`
- Create: `admin.js`
- Create: `github-contents.js`
- Modify: `style.css`
- Test: `tests/github-contents.test.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildContentsUpdatePayload } = require('../github-contents');

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

  assert.equal(payload.branch, 'main');
  assert.equal(payload.sha, 'abc123');
  assert.equal(payload.message, 'feat: update public config');
  assert.equal(
    Buffer.from(payload.content, 'base64').toString('utf8'),
    JSON.stringify({ title: '停車場設備功能測試完成簽認單' }, null, 2) + '\n'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/github-contents.test.js -v`
Expected: FAIL because `github-contents.js` is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement `github-contents.js` with:

- `buildContentsUpdatePayload(...)`
- `fetchCurrentContents(...)`
- `saveContentsToGitHub(...)`

Implement `admin.html` / `admin.js` as a maintenance UI with these inputs:

- GitHub repo owner
- GitHub repo name
- branch
- `config.json` path
- GitHub Personal Access Token

The editor must preserve `projectName` and `siteCode` even when other fields are removed or renamed, and it must reject empty labels, duplicate keys, and empty device item text before save.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/github-contents.test.js -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin.html admin.js github-contents.js style.css tests/github-contents.test.js
git commit -m "feat: add admin maintenance page"
```

### Task 4: End-to-end verification and cleanup

**Files:**
- Modify: `tests/app-utils.test.js`
- Modify: `config-loader.js`
- Modify: `admin.js`
- Modify: `app.js`

- [ ] **Step 1: Run the full Node test suite**

Run: `node --test tests/*.test.js`
Expected: all tests pass.

- [ ] **Step 2: Verify both pages in a browser**

Open `index.html` and confirm:

- `案場名稱` and `場地代號` still appear
- the public page loads `config.json`
- PDF export still works

Open `admin.html` and confirm:

- the repo settings form loads
- config can be edited locally without breaking validation
- the save button attempts a GitHub Contents API update

- [ ] **Step 3: Fix any integration issues and rerun the full suite**

Run again: `node --test tests/*.test.js`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add config-loader.js admin.js app.js tests/*.test.js style.css index.html
git commit -m "test: verify admin config workflow"
```
