# Investment Dashboard 架構說明

## 定位

`investment-dashboard-web/` 是 GitHub `lazyunclek/dashboard` 的靜態、手機優先前端。它目前透過 GitHub Pages 部署，瀏覽器使用安全的 Supabase client configuration、Auth 與 RLS／受控 RPC／Edge Function 取得資料；它不是 Supabase 的替代品，也不是投資資料的永久備份。

## 檔案角色

| 檔案／目錄 | 角色 | 修改原則 |
|---|---|---|
| `index.html` | 頁面骨架、入口與資產載入 | 只改 source；保留 cache-busting 流程 |
| `app.js` | UI state、頁面渲染、Supabase 查詢／RPC 呼叫與互動 | 修改前先定位資料契約與權限 |
| `styles.css` | 視覺、響應式布局與互動狀態 | 保留手機優先與可讀性 |
| `config.js` | 由安全 client config 產生的公開設定 | 不手動放入秘密；由 generator 產生 |
| `manifest.webmanifest`、`icon.svg` | PWA／瀏覽器 metadata | 修改後跑靜態檢查 |
| `tools/sync-public-config.mjs` | 產生公開 Supabase client config | 只接受 allowlisted public fields |
| `tools/stamp-assets.mjs` | 部署前加資產版本字串 | 不要手動取代 workflow 行為 |
| `tools/check-static-app.mjs` | 靜態 app contract | 任何前端／設定／workflow 修改後執行 |
| `.github/workflows/pages.yml` | GitHub Pages 部署 | 變更時同步部署與操作文件 |

## 資料與權限邊界

瀏覽器可以使用 Supabase URL、publishable key 與允許公開的 project reference；RLS、公開 feed function 與受控 RPC 決定資料能否被讀寫。service-role key、OAuth secret、交易所 key、Meta secret 與其他服務端密鑰不得進入 `config.js`、`app.js`、GitHub Pages artifact 或任何前端 bundle。

投資區以 Supabase 正式資料和資料契約為準。日常帳本的「預定」是獨立 `cashbook_schedules` 資料：在寫入正式 `cashbook_events` 前絕不改變帳戶餘額；到期且選擇自動入帳時，資料庫排程以固定冪等鍵委派既有正式分錄 writer。帳戶清單的主數字同樣只讀已發生帳目；點開才顯示未來流向。記帳操作使用 allowlisted RPC，不要新增任意 SQL endpoint。

投資持倉的「本金回收歷程」與本輪成本／已實現損益由 owner-scoped 的 `investment_capital_recovery_summary` 唯讀 RPC 統一推導；前端只把回傳結果轉成畫面資料，不自行重算輪次。這讓手機與受限的 ChatGPT Supabase SQL connector 可讀同一個計算契約，同時不改寫交易帳本。

日常帳本的「預定」頁會另外列出既有信用卡帳戶的帳本待繳餘額。這是已發生的負債，不是未來預定支出，因此不會混入預定金額、也不會預先扣減銀行餘額；實際繳款日與帳單金額仍以銀行帳單為準。

合約網格資產價值只包含運行中網格的本金與策略損益。已關閉網格的結算金回到 USDT cashbook，歷史損益僅在績效分析顯示，不能再作為另一筆加密資產價值。

手機估值另要求運行中網格的 `source_updated_at` 在兩小時內。超過時只能標示「狀態待核對」，不得繼續把舊網格當作運行中、計入目前總資產或總覽方塊圖；總資產必須提示可能不完整。這是前端對失聯資料的保守呈現，不把正式網格改成已關閉，也不推算結算金或改寫 cashbook。成功恢復 Pionex 同步後，仍須核對正式關閉狀態和結算橋接。

## 部署流程

```text
push main 或手動 workflow_dispatch
        ↓
GitHub Actions checkout
        ↓
stamp-assets.mjs 加入版本 query string
        ↓
upload-pages-artifact
        ↓
actions/deploy-pages
        ↓
GitHub Pages 靜態網站
```

修改資料或 client config 後，前端不一定需要重建資料 snapshot；需要重新整理的是公開設定、asset cache 或受影響的 source。任何部署後問題要先區分是 GitHub artifact、瀏覽器 cache、Supabase RLS／function 或正式資料本身。

## 新功能的最小路徑

1. 先確認新功能屬於投資、記帳、Threads、Instagram 或其他域。
2. 找到 Supabase table／RPC／Edge Function 與資料契約；若不存在，先記錄 schema 變更需求。
3. 在 `app.js` 修改查詢、state、render 或 action，保持現有 auth 與 error／empty state。
4. 若有 generated asset，修改 generator 或 source，再重建，不手改 generated output。
5. 執行 `node tools/check-static-app.mjs`，並在本地 server 驗證手機版、登入、資料、空資料與錯誤情況。
6. 依 `docs/CHANGE_IMPACT_MATRIX.md` 更新本文件、資料流、Supabase／pipeline 文件與 CHANGELOG。

## 已清倉標的顯示

手機「持倉」頁從同一份唯讀 `investment_transactions` 帳本將標的分為現有持倉與已清倉；不新增查詢、資料表或前端寫入。持倉數量以所有有效事件的帶正負號數量加總，避免跨帳戶轉出／轉入或原生幣費用在同日排序中被錯誤截斷；已清倉標的以加總結果歸零判斷。購買與出清價格沿用交易 `gross_amount ÷ quantity` 的各自加權均價；實付與實收、已實現合計則沿用既有含費稅的帳本計算。這讓使用者能在手機上核對買入與出清價格，而不改變總覽損益口徑。

持倉頁的台幣／美元切換僅套用美股，並直接使用交易與行情的原生 USD 值；台股與加密仍顯示 TWD。此為顯示層切換，不改變匯率換算、已實現損益或正式資料來源。切換重繪清單時，會以標的 ID 保留本次瀏覽器工作階段中已展開的卡片，不寫入後端或裝置設定。

手機「交易明細」在每筆買入的成交單價下方顯示「持倉均價 前 → 後」。它只讀既有 `investment_transactions` 的 `source_row_id` 與成本欄位，按交易日期及 ID 順序依本金回收口徑重算；首筆建倉沒有前值，賣出、轉帳和獨立資產手續費不顯示變化。這是前端唯讀呈現，不新增資料表、RPC、RLS 或寫入路徑。

## 現有持倉熱力圖

「持倉」頁使用現有持倉資料建立面積按 TWD 市值的方塊圖。台股／美股／加密市場占比以三類可估值現有持倉為分母；產業占比以目前市場篩選結果為分母。總覽原有的全資產產業配置仍含現金、網格與房地產，不改其口徑。切換總損益時沿用持倉卡的累積台幣損益；切換單天漲跌時只讀 `investment_market_prices.source_payload` 中與最新價格同次取得的 `day_baseline_*` 欄位。基準缺漏、價格過期時格子維持中性色並標示無法計算。極小面積標的另列可點選代號，以免手機上失去辨識。

`refresh-market-prices` 對台美股保存前收盤價，對加密保存約 24 小時前的有效小時報價；不新增 schema、RLS 或投資寫入。舊報價列沒有基準時須等待下一次成功同步。持倉價格影響以目前數量及有效 USD/TWD 估算，不代表考慮當日交易或匯率變化後的正式單日損益。部署時先更新 Edge Function，再更新 GitHub Pages 前端。

## 總覽成本與目前價值

總覽以既有四類資產 `groups[].costTwd`／`valueTwd` 繪製成本與目前價值的成對橫條，並加上四類合計。每一組橫條各自以該組較大的正值縮放，不能以條長跨組比較；數字均為 TWD。帳面差額只等於目前價值減成本，不含已實現損益與收益，不能稱為累積總損益。房地產成本採已入帳支出，目前價值採預估可回收淨值；缺少持倉行情時顯示比較可能不完整。金額沿用隱藏金額模式，不新增 Supabase 查詢或寫入。

## 總覽資產比例方塊圖

「全部資產」以現有台股、美股、加密現貨逐筆市值，以及現金淨額、運行中網格淨值、房地產預估可回收淨值建立方塊圖；面積按目前 TWD 價值。這些項目對應既有總資產四組，已關閉網格不再計入。切到「投資持倉」只看可估值的現有台股、美股與加密現貨，分母改為這些持倉合計；現金、網格與房地產不進此模式。顏色表示資產類型，格內數字表示該模式的占比，不表示單天漲跌。缺價或圖中正值合計與總資產不符時提示分母限制；極小格另列可點選代號。沿用既有前端資料，不增加查詢、資料表或寫入。

手機方塊圖採較寬畫布，僅圖區可左右滑動，卡片與整頁不橫向溢出。投資持倉模式另有「全部／台股／美股／加密」市場篩選；每個篩選按鈕顯示該市場占全部可估值投資持倉的比例。選單一市場時，格面積、格內占比與明細改以該市場可估值持倉合計為分母，按鈕上的市場占比仍以全部投資持倉為分母；缺價筆數只計所選市場。切回全部資產重設市場篩選。這些都是既有 TWD 市值的唯讀呈現。

圖區支援雙指縮放及縮小／全圖／100%／放大按鈕，單指仍可橫向滑動。縮放只改變方塊圖像素尺寸，持倉市值、面積比例、篩選分母與正式資料不變；最小比例為完整畫布剛好放進目前圖區寬度，最大 250%。切換範圍或市場時保留縮放比例、重設橫向位置。
每次縮放、切換或重繪後，依方塊的實際像素寬高重新決定文字：足夠大顯示代號與占比，次小格只顯示代號，極小格才隱藏格內文字並列入下方可點選清單。清單隨縮放同步更新，不能沿用縮放前的隱藏分類。
