# 公開版獨立簽名模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓公開版從「直接在主頁簽名」改成「先進入獨立簽名畫面，再簽完儲存返回」，降低誤觸與誤按風險。

**Architecture:** `app.js` 會新增一個不落地儲存的畫面模式狀態，用來在「總覽模式」與「簽名模式」之間切換。總覽模式只顯示簽名摘要與進入按鈕，簽名模式才渲染可互動的 canvas 與返回按鈕；`style.css` 負責把非簽名內容在簽名模式時整段隱藏，讓畫面真的只剩簽名工作區。`tests/` 會先鎖住模式模型與切換行為，再改 UI。

**Tech Stack:** HTML、CSS、Vanilla JavaScript、`node:test`

---

### Task 1: 讓簽名區支援「總覽 / 編輯」兩種模式

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Test: `tests/signature-mode.test.js`

- [ ] **Step 1: 寫出會先失敗的測試**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildSignatureSectionModel } = require('../app');

test('總覽模式會顯示進入簽名畫面按鈕與未簽名摘要', () => {
  const model = buildSignatureSectionModel(
    false,
    { tester: '', owner: '' },
  );

  assert.equal(model.mode, 'summary');
  assert.equal(model.primaryActionLabel, '進入簽名畫面');
  assert.equal(model.signers[0].statusLabel, '尚未簽名');
  assert.equal(model.signers[1].statusLabel, '尚未簽名');
});

test('編輯模式會顯示儲存並返回與簽名工作區', () => {
  const model = buildSignatureSectionModel(
    true,
    { tester: 'data:image/png;base64,abc', owner: '' },
  );

  assert.equal(model.mode, 'editor');
  assert.equal(model.primaryActionLabel, '儲存並返回');
  assert.equal(model.signers[0].hasPreview, true);
  assert.equal(model.signers[1].statusLabel, '尚未簽名');
});
```

- [ ] **Step 2: 先跑測試確認紅燈**

Run:
```bash
node --test tests/signature-mode.test.js
```

Expected: FAIL，因為 `buildSignatureSectionModel` 還沒實作。

- [ ] **Step 3: 實作最小功能**

```js
function buildSignatureSectionModel(isSignatureMode, signatures) {
  const mode = isSignatureMode ? 'editor' : 'summary';

  return {
    mode,
    primaryActionLabel: mode === 'editor' ? '儲存並返回' : '進入簽名畫面',
    signers: [
      { key: 'tester', statusLabel: signatures.tester ? '已簽名' : '尚未簽名' },
      { key: 'owner', statusLabel: signatures.owner ? '已簽名' : '尚未簽名' },
    ],
  };
}
```

- [ ] **Step 4: 把 `renderSignatureSection()` 改成依模式渲染**

```html
<section id="signature-section" class="section-card signature-stage">
  <!-- 總覽模式：摘要卡 + 進入簽名按鈕 -->
  <!-- 編輯模式：canvas + 儲存並返回按鈕 -->
</section>
```

```js
function setSignatureMode(nextMode) {
  signatureMode = Boolean(nextMode);
  renderAll();
}
```

- [ ] **Step 5: 跑整包測試確認模式切換不影響其他功能**

Run:
```bash
node --test (Get-ChildItem -Path tests -Filter '*.test.js').FullName
```

Expected: PASS。

### Task 2: 把總覽模式做成真的不容易誤觸的版面

**Files:**
- Modify: `style.css`
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1: 寫出全螢幕簽名模式的樣式**

```css
body.signature-mode {
  overflow: hidden;
}

body.signature-mode #basic-section,
body.signature-mode #device-action-section,
body.signature-mode #device-list,
body.signature-mode #note-section,
body.signature-mode #form-footer,
body.signature-mode #action-buttons {
  display: none !important;
}

body.signature-mode #signature-section {
  min-height: calc(100dvh - 24px);
}
```

- [ ] **Step 2: 讓總覽模式只保留摘要與進入按鈕**

```css
.signature-summary-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.signature-preview {
  min-height: 140px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  background: #f8fbfe;
}
```

- [ ] **Step 3: 讓編輯模式的 canvas 夠大、夠好按**

```css
.signature-workspace {
  display: grid;
  gap: 16px;
}

.signature-card .signature-canvas {
  height: 260px;
}
```

- [ ] **Step 4: 在編輯模式保留清楚的返回操作**

```html
<button type="button" class="primary" data-action="save-signatures-return">儲存並返回</button>
<button type="button" class="ghost" data-action="exit-signature-mode">返回總覽</button>
```

- [ ] **Step 5: 手動檢查手機與桌面版**

Run:
```bash
node --test tests/signature-mode.test.js
```

Expected: PASS，然後在瀏覽器確認進入簽名後只看得到簽名工作區。

### Task 3: 驗證整體流程與保留既有簽名資料

**Files:**
- Modify: `app.js`
- Test: `tests/signature-mode.test.js`

- [ ] **Step 1: 驗證切換模式不會清掉已經畫好的簽名**

```js
test('切回總覽模式時會保留既有簽名摘要', () => {
  const model = buildSignatureSectionModel(
    false,
    { tester: 'data:image/png;base64,abc', owner: '' },
  );

  assert.equal(model.signers[0].hasPreview, true);
  assert.equal(model.signers[0].statusLabel, '已簽名');
});
```

- [ ] **Step 2: 驗證 `儲存並返回` 只做儲存與退出，不改動表單內容**

```js
function saveSignaturesAndReturn() {
  saveState();
  setSignatureMode(false);
}
```

- [ ] **Step 3: 跑完整測試**

Run:
```bash
node --test (Get-ChildItem -Path tests -Filter '*.test.js').FullName
```

Expected: PASS。

- [ ] **Step 4: 若線上站點有部署流程，推送到 `main` 後確認公開頁可正常切換**

Run:
```bash
git status --short
git push origin HEAD:main
```

Expected: 變更推到 GitHub Pages 來源分支後，公開頁可進入獨立簽名模式並正常返回。
