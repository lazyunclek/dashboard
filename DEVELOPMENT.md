# Investment Dashboard 開發與部署手冊

## 開始前

先讀根目錄 `AI_PROJECT_CONTEXT.md`、`AGENTS.md`、`docs/ENGINEERING_DOCS_INDEX.md`、`docs/SYSTEM_ARCHITECTURE.md`，再讀 `outputs/investments/AGENTS.md`、`outputs/investments/index.md` 與本目錄 `README.md`／`ARCHITECTURE.md`。若任務涉及 Threads 或 Instagram Dashboard，補讀對應 pipeline 與 `supabase/EDGE_FUNCTIONS.md`。

## 本地執行

在 `investment-dashboard-web/` 執行：

```bash
python3 -m http.server 4173
```

再開啟 `http://127.0.0.1:4173`。這是靜態前端，不要用另一套 dev server 假設它有未記錄的 backend proxy。

若需要重新產生公開 config：

```bash
node tools/sync-public-config.mjs "/absolute/path/to/outputs/investments/data/client-config.json"
```

該工具會拒絕包含 service、secret、password 或 token 形狀欄位的輸入。不要把 `.env.local` 當作 generator input，也不要把產生出的公開 config 之外的設定送進瀏覽器。

## 必做驗證

```bash
node tools/check-static-app.mjs
```

這項檢查涵蓋必要檔案、投資資料讀取、allowlisted cashbook RPC、無 privileged key、響應式 CSS 與 GitHub Pages workflow。除此之外，人工驗證至少包含登入、資料載入、交易明細買入列的持倉均價「前 → 後」與首筆建倉空前值、現有持倉與已清倉切換、台幣／美元切換與美股原生金額、兩種清單的空狀態、錯誤狀態、手機寬度、記帳寫入確認與登出／重新登入。

持倉熱力圖另執行 `node tools/check-position-heatmap.mjs`，核對方塊面積、三類市場占比、篩選後產業占比，以及前收盤／近 24 小時價格變化。手機實測應包含單天／總損益切換、極小方塊代號清單、缺少比較基準、過期行情、缺少市值、點選明細及隱藏金額。新報價基準從 Edge Function 寫入快照後才會出現；前端重新整理只讀已同步資料。

## 修改分類

| 修改 | 先改哪裡 | 不能直接做什麼 |
|---|---|---|
| 顏色、布局、文字 | `styles.css`、`index.html` | 不要順手改資料邏輯 |
| 顯示欄位 | `app.js` 與資料契約 | 不要用畫面 fallback 補正式數據 |
| 計算公式 | authoritative definition／Supabase contract | 不要只在前端複製一份公式 |
| 記帳寫入 | 既有 RPC／Skill | 不要直接新增未授權 client SQL |
| 新資料 | migration／RPC／function 先於前端 | 不要先寫 UI 再猜後端欄位 |
| 部署設定 | `.github/workflows/pages.yml` | 不要把秘密放進 workflow log 或 artifact |

網格公式的回歸檢查：關閉網格的結算已在 cashbook 時，`gridValueTwd` 只能使用運行中網格的本金與策略損益；已關閉網格的損益可以保留在績效統計，但不得再加入資產類別、總資產或配置。

## 完成後回報

回報 source files、資料／權限影響、觸發與部署方式、靜態與瀏覽器驗證、已更新文件、仍未驗證的限制。使用者可見的頁面、計算、寫入或導航變更，追加至 `outputs/investments/CHANGELOG.md` 或對應管線紀錄。
