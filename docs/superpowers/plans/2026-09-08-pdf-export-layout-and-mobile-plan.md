# PDF Export Layout And Mobile Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 PDF 匯出時設備卡片被頁面邊界切斷，以及手機偶爾將 PDF 原始資料當純文字顯示的問題。

**Architecture:** 保留 `html2canvas` 截圖與 `jsPDF` 產生流程，只在 PDF 排版層加入「整張設備卡片優先換頁、超長卡片依檢查項目邊界切片」規則。輸出層改由 jsPDF 產生 `application/pdf` Blob，驗證 `%PDF-` 標頭後用暫時下載連結輸出。

**Tech Stack:** HTML、CSS、vanilla JavaScript、html2canvas 1.4.1、jsPDF 2.5.1、Node 內建 `node:test`。

---

## 檔案範圍

- Modify: `app.js`，新增 PDF 安全分頁、Blob 驗證與下載 helper，調整 `generatePDF()` 串接方式。
- Modify: `tests/pdf-export.test.js`，新增分頁與 Blob 輸出的失敗測試及回歸測試。
- Modify: `HANDOFF.md`，記錄此次修改、驗證結果與仍存在的手機環境限制。
- Modify: `docs/TEST_REPORT.md`，記錄本次測試與實際 PDF/頁面驗證。
- Modify: `index.html`、`admin.html`、`tests/index-html.test.js`，只有在前端資源修改後依既有規則同步 bump cache-bust 版本。

## Task 1: 建立安全分頁的失敗測試

**Files:**
- Modify: `tests/pdf-export.test.js`
- Modify: `app.js` only after the failing tests are confirmed

- [ ] **Step 1: 定義可測試的頁面放置模型測試**

在 `tests/pdf-export.test.js` 加入測試，從 `ParkingSignForm` 取得純函式 `getPdfSlicePlan`，驗證一般設備卡片在目前頁面剩餘高度不足時會先換頁：

```js
test('getPdfSlicePlan moves a complete device card to the next page', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 120,
    contentToPdfRatio: 1,
    cursorY: 240,
    pageTop: 10,
    pageBottom: 287,
    safeBreaks: [],
  });

  assert.deepEqual(plan, {
    slices: [{ offset: 0, height: 120, pageBreakBefore: true }],
    cursorY: 130,
  });
});
```

加入超長設備卡片只使用檢查項目安全斷點的測試：

```js
test('getPdfSlicePlan breaks a tall device card at safe item boundaries', () => {
  const app = loadApp();
  const plan = app.getPdfSlicePlan({
    contentHeight: 520,
    contentToPdfRatio: 1,
    cursorY: 10,
    pageTop: 10,
    pageBottom: 210,
    safeBreaks: [160, 310, 460],
  });

  assert.deepEqual(plan.slices, [
    { offset: 0, height: 160, pageBreakBefore: false },
    { offset: 160, height: 150, pageBreakBefore: true },
    { offset: 310, height: 150, pageBreakBefore: true },
    { offset: 460, height: 60, pageBreakBefore: true },
  ]);
});
```

加入 PDF Blob 輸出測試，確保 `output('blob')` 與檔案型別被檢查：

```js
test('createPdfBlob validates application/pdf and the PDF header', async () => {
  const app = loadApp();
  const fakePdf = {
    output(mode) {
      assert.equal(mode, 'blob');
      return new Blob(['%PDF-1.3\n'], { type: 'application/pdf' });
    },
  };

  const blob = await app.createPdfBlob(fakePdf);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), '%PDF-1.3\n');
});
```

- [ ] **Step 2: 執行測試確認目前版本確實失敗**

Run:

```powershell
node --test tests/pdf-export.test.js
```

Expected: FAIL because `getPdfSlicePlan` and `createPdfBlob` are not yet exported from `app.js`. Existing four PDF tests must remain passing.

## Task 2: 實作安全分頁與有效 PDF Blob 下載

**Files:**
- Modify: `app.js` around `addCanvasSliceToPdf()` and `generatePDF()`
- Test: `tests/pdf-export.test.js`

- [ ] **Step 1: 新增純函式 `getPdfSlicePlan(options)`**

新增參數：`contentHeight`、`contentToPdfRatio`、`cursorY`、`pageTop`、`pageBottom`、`safeBreaks`。`contentToPdfRatio` 是 canvas px 換算為 PDF mm 的比例，函式規則如下：

```js
function getPdfSlicePlan({ contentHeight, contentToPdfRatio, cursorY, pageTop, pageBottom, safeBreaks }) {
  const breaks = [0, ...safeBreaks.filter((value) => value > 0 && value < contentHeight), contentHeight]
    .sort((left, right) => left - right);
  const slices = [];
  let offset = 0;
  let currentY = cursorY;
  const pageHeight = pageBottom - pageTop;
  const firstSliceCanFitOnNewPage = contentHeight * contentToPdfRatio <= pageHeight;
  const firstSliceNeedsNewPage = currentY > pageTop && firstSliceCanFitOnNewPage;

  if (firstSliceNeedsNewPage) {
    currentY = pageTop;
  }

  while (offset < contentHeight) {
    const remainingHeight = contentHeight - offset;
    const room = currentY > pageTop ? pageBottom - currentY : pageBottom - pageTop;
    const maxCanvasHeight = Math.max(1, Math.floor(room / contentToPdfRatio));
    const target = offset + Math.min(remainingHeight, maxCanvasHeight);
    const safeEnd = breaks.filter((value) => value > offset && value <= target).at(-1);
    const end = safeEnd || target;

    slices.push({
      offset,
      height: end - offset,
      pageBreakBefore: slices.length > 0 || (slices.length === 0 && firstSliceNeedsNewPage),
    });
    currentY += (end - offset) * contentToPdfRatio;
    offset = end;
    if (offset < contentHeight) {
      currentY = pageTop;
    }
  }

  return { slices, cursorY: currentY };
}
```

測試輸入也要使用 `contentToPdfRatio: 1` 簡化計算；正式呼叫時使用 `contentWidth / canvas.width`。若 `safeEnd` 不存在，才使用 `target` 硬切，避免安全斷點落在單一超大檢查項目時進入無限迴圈。

- [ ] **Step 2: 取得設備卡片的安全斷點**

新增 `getDevicePdfBreakpoints(node, canvas)`：

- 讀取 `.check-item` 的 DOM `getBoundingClientRect()`。
- 以設備卡片頂端為基準，依 `html2canvas` capture scale 換算成 canvas px。
- 只回傳每個檢查項目底部的正整數位置。
- 若瀏覽器沒有可用的 rect，回傳空陣列，沿用現有 fallback 硬切，避免阻擋 PDF 產生。

在 `generatePDF()` 內，只有 `node.classList.contains('device-card')` 時傳入安全斷點；header、基本資料、備註、簽名與 footer 沿用一般區塊流程。

- [ ] **Step 3: 調整 `addCanvasSliceToPdf()`**

保留目前 JPEG 壓縮與 PNG fallback，改成先建立切片計畫，再逐片呼叫 `pdf.addImage()`：

- 一般設備卡片若完整高度放不進目前頁面，整張卡片先換到下一頁。
- 超過單頁高度的卡片，依安全斷點選擇不超過頁面容量的最後一個切點。
- 每片前後保留現有 margin 與 4mm block gap。
- 沒有安全斷點時使用現有固定高度切片，確保極端內容仍可匯出。

- [ ] **Step 4: 新增 PDF Blob 驗證與下載 helper**

新增：

```js
async function createPdfBlob(pdf) {
  const blob = pdf.output('blob');
  if (!blob || blob.type !== 'application/pdf') {
    throw new Error('PDF Blob MIME 類型不正確');
  }
  const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
  if (header !== '%PDF-') {
    throw new Error('PDF 檔案標頭不正確');
  }
  return blob;
}

function downloadPdfBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
```

`generatePDF()` 改成 `const blob = await createPdfBlob(pdf); downloadPdfBlob(blob, buildPdfFilename(...));`。若驗證失敗，以繁體中文提示「PDF 產生失敗，請重新操作」，並保留既有 `finally` 清理 export mode。

- [ ] **Step 5: 匯出新增 helper 並完成最小實作**

將 `getPdfSlicePlan`、`getDevicePdfBreakpoints`、`createPdfBlob`、`downloadPdfBlob` 放入 `ParkingSignForm` 測試介面。只保留測試需要的純函式與現有公開 helper，不改動欄位與簽名 state。

- [ ] **Step 6: 執行單元測試確認 GREEN**

Run:

```powershell
node --test tests/pdf-export.test.js
```

Expected: 新增測試與原有 PDF 測試全部 PASS。

## Task 3: 回歸驗證與文件更新

**Files:**
- Modify: `HANDOFF.md`
- Modify: `docs/TEST_REPORT.md`
- Modify: `index.html` and `admin.html` only if `app.js` cache-bust is changed
- Modify: `tests/index-html.test.js` if cache-bust changes

- [ ] **Step 1: 執行完整測試**

Run:

```powershell
node --test tests/*.test.js
```

Expected: 全部測試通過，無未捕捉例外。

- [ ] **Step 2: 啟動本機靜態伺服器驗證頁面**

在 worktree 執行：

```powershell
python -m http.server 4175
```

另開 PowerShell：

```powershell
(Invoke-WebRequest http://127.0.0.1:4175/index.html).StatusCode
(Invoke-WebRequest http://127.0.0.1:4175/admin.html).StatusCode
```

Expected: 兩個回應都是 `200`，且 HTML 引用的 cache-bust 版本一致。

- [ ] **Step 3: 以瀏覽器產生實際多頁 PDF**

使用含有多個設備、不同檢查項目的表單，確認：

- 一般設備卡片不在標題、名稱、編號或檢查項目中間被切開。
- 超長設備只在檢查項目間分頁。
- PDF 頁面可在桌面 PDF 閱讀器開啟。
- 手機下載檔案的型別為 PDF，不顯示 `%PDF-1.3` 原始資料。

- [ ] **Step 4: 更新交接與測試文件**

在 `HANDOFF.md` 記錄：修改檔案、分頁策略、Blob 驗證、測試結果與尚未能由桌面環境保證的手機檔案管理器差異。

在 `docs/TEST_REPORT.md` 記錄：測試日期、完整指令、通過/失敗/未測試項目、本機頁面狀態與實際 PDF 驗證方式。

- [ ] **Step 5: 若有前端資源修改，更新 cache-bust 並回歸測試**

若修改 `app.js` 後需要換 query string，將 `index.html`、`admin.html` 與 `tests/index-html.test.js` 的版本同步改為同一個新值，再重新執行完整測試與本機 HTTP 200 檢查。

- [ ] **Step 6: 檢查 Git 差異並建立功能提交**

Run:

```powershell
git diff --check
git status --short --branch
git diff --stat
```

確認只包含本次 PDF 修正與文件，再建立單一功能提交；未經使用者明確要求不推送遠端。

## 計畫自我檢查

- 規格中的分頁、Blob MIME、`%PDF-` 標頭、回歸測試與文件更新都有對應任務。
- 保留既有 PDF 壓縮、欄位、簽名、公版與同步功能。
- 所有程式修改先有失敗測試，並以 `node --test tests/pdf-export.test.js` 驗證 RED/GREEN。
- 手機端的 PDF 閱讀器行為受作業系統影響，計畫只承諾驗證檔案本身合法與下載 MIME 正確，不把無法控制的檔案管理器行為寫成保證。
