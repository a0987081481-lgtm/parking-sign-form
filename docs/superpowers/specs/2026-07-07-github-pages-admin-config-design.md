# GitHub Pages 公版維護頁設計稿

## 背景

目前這個專案是純前端靜態頁，目標是在 GitHub Pages 上提供一個可列印、可輸出 PDF 的「停車場設備功能測試完成簽認單」。
現在的需求已經從單純填單，擴大成「公版可集中維護」：

- 公版頁要讓所有使用者看到同一份欄位設定。
- 只有維護頁可以修改公版內容。
- 維護頁更新後，所有人重新整理公版頁就能看到新版。
- `場地名稱` / 現有的 `案場名稱` 與 `場地代號` 這兩個核心欄位必須保留。

因為專案部署在 GitHub Pages，沒有後端伺服器可用，所以資料更新必須直接透過 GitHub API 寫回 repo，再由 Pages 自動發佈。

## 目標

1. 建立一個 `admin.html` 維護頁。
2. 讓維護頁能讀取、編輯並儲存共用的公版設定。
3. 讓 `index.html` 公版頁改成從同一份雲端設定載入欄位與設備模板。
4. 維護頁寫回 GitHub repo 後，所有使用者看到的公版頁都同步更新。
5. 保留目前的 PDF 匯出、列印、草稿自動儲存功能。

## 非目標

- 不建立自有後端服務。
- 不做多人即時協作。
- 不做 GitHub OAuth 登入流程。
- 不做完整的版本歷史管理介面。
- 不做資料庫。

## 架構

### 整體分工

- `index.html`：公版使用者入口。
- `admin.html`：維護入口，只供更新公版設定。
- `config.json`：唯一的公版設定來源。
- `config.js`：內建 fallback 預設值，避免 `config.json` 讀取失敗時整頁壞掉。
- `app.js`：公版頁載入、渲染、草稿儲存、PDF / 列印。
- `admin.js`：維護頁讀取 GitHub 設定、編輯、驗證、寫回 GitHub。
- `style.css`：共用樣式，加上維護頁所需區塊。

### 資料流

1. 公版頁啟動時先載入內建預設設定。
2. 再嘗試從同站 `config.json` 載入最新設定。
3. 若雲端設定讀取成功，就用雲端設定覆蓋預設值。
4. 使用者在公版頁填寫內容時，草稿仍只存在瀏覽器 `localStorage`。
5. 維護者在 `admin.html` 修改公版設定後，透過 GitHub Contents API 寫回 `config.json`。
6. GitHub Pages 重新部署後，所有使用者重新整理就會看到新版公版設定。

### 為什麼這樣做

這個做法的核心優點是「單一事實來源」。
所有人都讀同一份 `config.json`，所以只要維護頁更新成功，公版頁自然就會跟著變更，不會出現每個人各自一份設定的狀況。

## 資料模型

### 公版設定 `config.json`

建議結構如下：

```json
{
  "version": 1,
  "title": "停車場設備功能測試完成簽認單",
  "basicFields": [
    {
      "key": "projectName",
      "label": "案場名稱",
      "type": "text",
      "required": true,
      "locked": true
    },
    {
      "key": "siteCode",
      "label": "場地代號",
      "type": "text",
      "required": false,
      "locked": true
    },
    {
      "key": "checkDate",
      "label": "檢查日期",
      "type": "date",
      "required": true,
      "locked": false
    }
  ],
  "deviceTypes": {
    "entrance": {
      "label": "入口設備",
      "items": ["..."]
    }
  }
}
```

### 規則

- `version` 用來支援未來 schema 升版。
- `projectName` 與 `siteCode` 為核心欄位，必須保留。
- `projectName` 與 `siteCode` 的 `key` 不可刪除。
- 核心欄位可允許調整顯示名稱，但不能從設定裡移除。
- `deviceTypes` 的 `key` 建議維持穩定，避免既有草稿或已填資料對不上。
- 每個設備類型可以調整顯示名稱與清單項目。
- 每個清單項目只需要儲存文字與是否為自訂項目即可。

## 維護頁行為

### 初次開啟

維護頁提供一個設定區塊，讓使用者輸入：

- GitHub repo owner
- GitHub repo name
- 目標 branch
- `config.json` 路徑
- GitHub Personal Access Token

其中 repo owner、repo name、branch、path 屬於站台設定，可以記住在本機。
Token 預設不永久保存，只有使用者明確勾選「記住此瀏覽器」才存起來。

### 編輯介面

維護頁要提供以下編輯能力：

1. 修改表單標題。
2. 編輯基本欄位的顯示名稱、欄位型態、必填狀態。
3. 保留 `projectName` 與 `siteCode` 兩個核心欄位，禁止刪除。
4. 編輯設備群組名稱。
5. 編輯每個設備群組的檢查項目。
6. 新增 / 刪除非核心欄位。
7. 新增 / 刪除設備項目。

### 驗證

送出前先做本機驗證：

- `title` 不可為空。
- `basicFields` 至少要保留 `projectName` 與 `siteCode`。
- `basicFields.key` 不能重複。
- 每個欄位的 `label` 不可空白。
- 設備項目文字不可空白。
- `config.json` 必須能序列化成合法 JSON。

### 儲存成功後

維護頁要顯示：

- 已更新成功。
- 新的 commit / 更新時間。
- 若 GitHub Pages 尚未完成重新部署，要提示使用者稍後重新整理。

## 公版頁行為

### 載入順序

1. 先使用內建 fallback 設定渲染頁面。
2. 再嘗試從同站 `config.json` 拉取最新設定。
3. 成功後重新渲染成最新設定。
4. 若失敗，維持 fallback 設定，並顯示非阻斷式提示。

### 快取策略

- 讀取 `config.json` 時要避免瀏覽器快取造成舊設定殘留。
- 建議使用 `fetch(..., { cache: 'no-store' })` 或附加 cache-busting query string。

### 與草稿資料的關係

- 公版設定更新後，既有草稿的資料不會被強制清空。
- 若新設定刪掉某些欄位，舊草稿中對應的值可保留在本機資料，但不再顯示於表單。
- PDF 匯出、列印、簽名板等既有功能維持不變。

## GitHub API 更新流程

### 讀取現有設定

維護頁送出前，先呼叫 GitHub Contents API 讀取目前的 `config.json`。

### 寫回設定

1. 將編輯後的設定轉成 JSON。
2. 用 base64 編碼成 API payload。
3. 呼叫 `PUT /repos/{owner}/{repo}/contents/{path}`。
4. payload 要帶：
   - `message`
   - `content`
   - `sha`（若檔案已存在）
   - `branch`

### 衝突處理

如果遠端檔案已被別人更新，GitHub API 可能回傳衝突或 sha 不一致。
這時維護頁要：

- 提示「雲端設定已被更新」。
- 重新抓一次最新設定。
- 讓使用者選擇重新套用或放棄本次編輯。

## 錯誤處理

### 公版頁

- `config.json` 無法載入時，直接使用 fallback 設定。
- `config.json` 格式錯誤時，顯示明確錯誤訊息，但頁面仍可使用。
- 公版頁不能因為雲端設定失敗而整頁空白。

### 維護頁

- Token 錯誤時要明確顯示授權失敗。
- Repo / branch / path 錯誤時要顯示無法找到檔案或無法寫入。
- 網路中斷時保留目前編輯內容，不清空表單。

## 安全性

- 這個方案屬於「靜態頁 + GitHub Token 直接寫回 repo」。
- Token 只會在瀏覽器端送往 GitHub API，不會經過自建後端。
- 預設不自動永久保存 Token。
- 如果要保留 Token，需由使用者明確勾選，且要提醒這台電腦上的其他人可能可取用。
- 維護網址本身是方便入口，不是強驗證機制；真正的寫入權限仍由 GitHub Token 控制。

## 測試策略

### 單元測試

要補的測試重點：

- 設定合併後，核心欄位仍存在。
- 設定驗證會擋掉空標題、重複 key、空白項目。
- GitHub API payload 會正確包含 `sha` 與 base64 內容。
- 公版頁在遠端設定失敗時會回退到 fallback 設定。

### 瀏覽器驗證

要驗證的實際流程：

1. 打開 `index.html`，確認可正常載入 fallback / 雲端設定。
2. 打開 `admin.html`，確認可載入設定。
3. 修改 `title` 與至少一個欄位名稱。
4. 儲存到 GitHub。
5. 重新整理 `index.html`，確認看到新設定。
6. 確認 `projectName` / `siteCode` 沒有消失。

## 驗收標準

這個功能算完成，必須同時符合以下條件：

- 有一個可使用的 `admin.html` 維護頁。
- 維護頁能把公版設定寫回 GitHub repo。
- `index.html` 會從同一份 `config.json` 讀取設定。
- `場地名稱` / 現有的 `案場名稱` 與 `場地代號` 仍然存在。
- 重新整理後，所有使用者看到的是同一版公版內容。
- 現有 PDF 輸出與草稿儲存功能不被破壞。
