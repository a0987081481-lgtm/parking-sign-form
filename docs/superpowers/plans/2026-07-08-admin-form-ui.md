# 維護頁表單化改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把停車場設備公版的維護頁改成一般人看得懂的表單操作，不再直接面對 JSON，並且仍可更新 GitHub Pages 上的共用 `config.json`。

**Architecture:** 維護頁拆成三層：`admin.html` 放表單骨架，`admin-config-form.js` 負責 config 與表單 state 的轉換與驗證，`admin.js` 只處理 DOM 渲染、事件綁定與 GitHub 讀寫。這樣欄位結構與畫面邏輯分離，之後要加欄位或調整版型都比較安全。

**Tech Stack:** 原生 HTML/CSS/JavaScript、GitHub Contents API、Node `node:test`、瀏覽器手動驗證。

---

### Task 1: 建立維護頁資料模型

**Files:**
- Create: `admin-config-form.js`
- Create: `tests/admin-config-form.test.js`

- [ ] **Step 1: 寫純函式測試**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { createFormState, buildPublicConfig, validateFormState } = require('../admin-config-form');

test('保留 projectName / siteCode 並標示為鎖定', () => {
  const state = createFormState({
    title: '測試標題',
    basicFields: [
      { key: 'projectName', label: '案場名稱', type: 'text', required: true, locked: true },
      { key: 'siteCode', label: '場地代號', type: 'text', required: false, locked: true },
    ],
    deviceTypes: {},
  });

  assert.equal(state.basicFields[0].locked, true);
  assert.equal(state.basicFields[1].locked, true);
});
```

- [ ] **Step 2: 實作 state 轉換與驗證**

```js
function createFormState(config) { /* ... */ }
function buildPublicConfig(state) { /* ... */ }
function validateFormState(state) { /* ... */ }
```

- [ ] **Step 3: 跑測試確認通過**

Run: `node --test tests/admin-config-form.test.js`
Expected: PASS

### Task 2: 重寫維護頁結構與互動

**Files:**
- Modify: `admin.html`
- Modify: `admin.js`
- Modify: `index.html`（如果要放維護頁入口連結，再一起處理）

- [ ] **Step 1: 先做表單骨架**

```html
<section class="admin-card">
  <h2>公版基本設定</h2>
  <label for="config-title">標題</label>
  <input id="config-title" type="text" />
</section>
```

- [ ] **Step 2: 做基本欄位與設備類型的動態清單**

```js
function renderBasicFields(fields) { /* 逐列輸出 key/label/type/required */ }
function renderDeviceTypes(deviceTypes) { /* 逐卡片輸出類型與項目 */ }
```

- [ ] **Step 3: 綁定 GitHub 連線設定與儲存流程**

```js
async function loadFromGitHub() { /* 讀取 config.json 後塞進表單 */ }
async function saveToGitHub() { /* 從表單組回 config 後寫入 GitHub */ }
```

- [ ] **Step 4: 跑瀏覽器檢查**

Run: 打開 `admin.html`，確認可載入、修改、儲存，且不再出現 JSON 編輯區
Expected: 能用表單完成更新，狀態列顯示成功

### Task 3: 調整維護頁樣式

**Files:**
- Modify: `style.css`

- [ ] **Step 1: 新增 admin page 的卡片、欄位列、按鈕列樣式**

```css
.admin-shell { max-width: 1100px; margin: 0 auto; }
.admin-card { border: 1px solid var(--line); border-radius: 18px; background: #fff; padding: 20px; }
.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
```

- [ ] **Step 2: 讓表單在手機上也能直覺操作**

```css
@media (max-width: 768px) {
  .admin-settings-grid { grid-template-columns: 1fr; }
  .field-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 跑一次人工確認**

Run: 開啟 `admin.html`，確認欄位不會擠壓、按鈕不會超出畫面
Expected: 桌機與手機寬度都可讀、可按

### Task 4: 驗證與收尾

**Files:**
- Modify: `tests/*.test.js`（必要時補充）

- [ ] **Step 1: 跑全部單元測試**

Run: `node --test tests/*.test.js`
Expected: 全綠

- [ ] **Step 2: 用瀏覽器模擬 GitHub API**

Run: 開啟 `admin.html`，用 stub 的 `fetch` 驗證 load / edit / save 流程
Expected: 載入後表單顯示雲端內容，儲存時送出 `PUT /contents/config.json`

- [ ] **Step 3: 確認沒有遺漏的 core 欄位**

Run: 檢查 `projectName` 與 `siteCode` 在表單中仍存在且為鎖定狀態
Expected: 兩個欄位保留，且無法誤刪
