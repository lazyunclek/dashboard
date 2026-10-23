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

外幣帳本操作須核對：主「消費金額／收入金額」旁可直接切換幣別。選取 USD／USDC／USDT 金融卡或信用卡記支出時，預設以 TWD 記消費金額並另填實扣原幣；Ether.fi 是 USDC 金融卡，須同時保存台幣消費額與實扣 USDC。其他外幣資金帳戶的支出及外幣收入仍預設帳戶原幣。使用者手動選擇主金額幣別後不得被刷新覆蓋；跨幣別收支仍須填實際入扣原幣金額，不能以 1:1 猜算。帳戶「目前實際餘額（對帳）」直接輸入帳戶原幣，可使用穩定幣小數精度。

穩定幣美股變更另執行 `node --test funding-allocation.test.mjs`，並在已登入的手機版核對元大 USD 舊交易、新平台 USDC／USDT 交易明細、平台名稱、實扣／實收、已含費用、隱藏金額模式及歷史成本待核對提示。資料表未授權或缺少時應顯示載入錯誤；不得以元大 USD 金額填補穩定幣數量。快照產生器須能以既有 service-role SELECT 讀取新表；不輸出憑證索引到公開前端。

```bash
node tools/check-static-app.mjs
```

這項檢查涵蓋必要檔案、投資資料讀取、allowlisted cashbook RPC、無 privileged key、響應式 CSS 與 GitHub Pages workflow。除此之外，人工驗證至少包含登入、資料載入、交易明細買入列的持倉均價「前 → 後」與首筆建倉空前值、現有持倉與已清倉切換、台幣／美元切換與美股原生金額、兩種清單的空狀態、錯誤狀態、手機寬度、記帳寫入確認與登出／重新登入。

持倉熱力圖另執行 `node tools/check-position-heatmap.mjs`，核對方塊面積、三類市場占比、篩選後產業占比，以及前收盤／近 24 小時價格變化。手機實測應包含單天／總損益切換、極小方塊代號清單、缺少比較基準、過期行情、缺少市值、點選明細及隱藏金額。新報價基準從 Edge Function 寫入快照後才會出現；前端重新整理只讀已同步資料。

總覽成本／目前價值圖應核對四類與合計均來自現有 `groups`／`totalAssetsTwd`，帳面差額等於目前價值減成本，缺價提示與隱藏金額模式正常，390px 手機寬度沒有橫向溢出。

總覽資產比例方塊圖另核對「全部資產」的個別現有持倉、現金淨額、運行中網格和房地產合計能回到總資產；「投資持倉」只含台美股及加密現貨。測試點選明細、極小方塊代號、缺價與總額不一致提示、390px 寬度和隱藏金額模式。

手機比例圖還須測試圖區可左右滑動且整頁沒有橫向溢出；投資持倉的全部／台股／美股／加密按鈕須正確顯示三類市場占全部持倉的比例。切換市場後，方塊與明細占比改用所選市場分母；切回全部資產要重設篩選，隱藏金額模式仍遮蔽占比。

縮放驗證須涵蓋手機雙指操作、縮小／放大按鈕、全圖適配、100% 重設、縮放後單指左右滑動及點選方塊。檢查最小比例沒有整頁橫向溢出、最大比例不超過 250%，且縮放不改變任何市值或占比。
縮放前後另核對方塊文字與下方極小部位清單：原本無字的小格放大到足夠像素後應顯示代號及占比，縮小後重新進入清單；選取狀態與隱藏金額模式須保留。

網格估值執行 `node tools/check-grid-valuation.mjs`：只讓兩小時內成功同步的運行中網格進入目前價值；舊 `running` 紀錄要顯示待核對並自總資產／網格方塊排除，已關閉網格僅保留歷史績效。測試時不得把過期列改寫為 `closed` 或自行建立結算金。恢復 API 憑證後，另需從 Pionex 回應到 Supabase 狀態、正式 cashbook bridge 和手機畫面逐段核對。

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
