const config = window.__INVESTMENT_DASHBOARD_CONFIG__;

if (!config || !config.supabaseUrl || !config.supabasePublishableKey || config.supabaseUrl.startsWith("__")) {
  document.body.innerHTML = '<main class="app-shell"><div class="error-card"><strong>網站尚未設定完成</strong><p>缺少 Supabase 公開連線設定。</p></div></main>';
  throw new Error("Missing public Supabase config");
}

const storagePrefix = `investment-mobile:${config.projectRef}`;
const storageKeys = {
  access: `${storagePrefix}:access`,
  refresh: `${storagePrefix}:refresh`,
  email: `${storagePrefix}:email`,
  privacy: `${storagePrefix}:privacy`
};

const state = {
  accessToken: window.sessionStorage.getItem(storageKeys.access) || "",
  refreshToken: window.localStorage.getItem(storageKeys.refresh) || "",
  userEmail: window.localStorage.getItem(storageKeys.email) || "",
  data: null,
  activeTab: "overview",
  marketFilter: "all",
  transactionQuery: "",
  transactionType: "all",
  numbersHidden: window.localStorage.getItem(storageKeys.privacy) === "true",
  loading: false
};

const byId = (id) => document.getElementById(id);
const loginView = byId("login-view");
const dashboardView = byId("dashboard-view");
const loginForm = byId("login-form");
const loginButton = byId("login-button");
const loginStatus = byId("login-status");
const refreshButton = byId("refresh-button");

function clearSession() {
  state.accessToken = "";
  state.refreshToken = "";
  state.userEmail = "";
  window.sessionStorage.removeItem(storageKeys.access);
  window.localStorage.removeItem(storageKeys.refresh);
  window.localStorage.removeItem(storageKeys.email);
}

function saveSession(payload, rememberDevice) {
  if (!payload?.access_token) throw new Error("Supabase 未回傳登入工作階段");
  state.accessToken = payload.access_token;
  window.sessionStorage.setItem(storageKeys.access, state.accessToken);
  state.userEmail = payload.user?.email || state.userEmail;
  if (state.userEmail) window.localStorage.setItem(storageKeys.email, state.userEmail);
  if (rememberDevice && payload.refresh_token) {
    state.refreshToken = payload.refresh_token;
    window.localStorage.setItem(storageKeys.refresh, state.refreshToken);
  } else if (!rememberDevice) {
    state.refreshToken = "";
    window.localStorage.removeItem(storageKeys.refresh);
  }
}

async function authRequest(grantType, body) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.message || `登入失敗（${response.status}）`);
  return payload;
}

async function refreshSession() {
  if (!state.refreshToken) return false;
  try {
    const payload = await authRequest("refresh_token", { refresh_token: state.refreshToken });
    saveSession(payload, true);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

async function rest(path, options = {}, retried = false) {
  if (!state.accessToken) throw new Error("請先登入");
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    ...options,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${state.accessToken}`,
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && !retried && await refreshSession()) return rest(path, options, true);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.hint || `資料讀取失敗（${response.status}）`);
  return payload;
}

async function fetchAll(path, pageSize = 1000) {
  const rows = [];
  for (let start = 0; start < 10000; start += pageSize) {
    const page = await rest(path, { headers: { Range: `${start}-${start + pageSize - 1}` } });
    if (!Array.isArray(page)) throw new Error("Supabase 回傳格式不正確");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("資料超過行動版單次讀取上限");
}

async function fetchLatestMarketPrices(assets, portfolioId) {
  const select = "select=id,portfolio_id,asset_id,instrument_key,quote_currency,price,price_at,fetched_at,source,status";
  const filter = `portfolio_id=eq.${encodeURIComponent(portfolioId)}&status=eq.success`;
  const requests = assets.map((asset) => rest(`investment_market_prices?${select}&${filter}&asset_id=eq.${encodeURIComponent(asset.id)}&order=fetched_at.desc&limit=1`));
  requests.push(rest(`investment_market_prices?${select}&${filter}&instrument_key=eq.${encodeURIComponent("USD/TWD")}&order=fetched_at.desc&limit=1`));
  return (await Promise.all(requests)).flat();
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, currency = "TWD", signed = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const amount = Number(value);
  const digits = currency === "TWD" ? 0 : 2;
  const formatted = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(amount));
  const prefix = signed ? (amount > 0 ? "+" : amount < 0 ? "−" : "") : (amount < 0 ? "−" : "");
  return `${prefix}${currency === "TWD" ? "NT$" : currency + " "}${formatted}`;
}

function quantity(value, scale = 4) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: Math.min(8, Math.max(0, num(scale))) }).format(num(value));
}

function shortDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function setTone(element, value) {
  element.classList.remove("is-positive", "is-negative");
  if (num(value) > 0) element.classList.add("is-positive");
  if (num(value) < 0) element.classList.add("is-negative");
}

function movingLedger(rows) {
  let quantityNow = 0;
  let remainingCost = 0;
  let boughtQuantity = 0;
  let boughtCost = 0;
  let soldQuantity = 0;
  let soldProceeds = 0;
  let fees = 0;
  let taxes = 0;
  const ordered = [...rows].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)) || String(a.created_at).localeCompare(String(b.created_at)));
  for (const row of ordered) {
    const rowQuantity = num(row.quantity);
    fees += num(row.fee_amount);
    taxes += num(row.tax_amount);
    if (row.transaction_type === "buy") {
      const paid = row.net_cash_amount !== null ? Math.abs(num(row.net_cash_amount)) : Math.abs(num(row.gross_amount)) + num(row.fee_amount) + num(row.tax_amount);
      quantityNow += rowQuantity;
      remainingCost += paid;
      boughtQuantity += rowQuantity;
      boughtCost += paid;
    } else if (row.transaction_type === "sell") {
      const reduction = Math.min(rowQuantity, Math.max(0, quantityNow));
      const average = quantityNow > 0 ? remainingCost / quantityNow : 0;
      quantityNow -= reduction;
      remainingCost -= reduction * average;
      soldQuantity += rowQuantity;
      soldProceeds += row.net_cash_amount !== null ? num(row.net_cash_amount) : num(row.gross_amount) - num(row.fee_amount) - num(row.tax_amount);
    } else if (row.details?.event_role === "asset_fee") {
      const reduction = Math.min(rowQuantity, Math.max(0, quantityNow));
      const average = quantityNow > 0 ? remainingCost / quantityNow : 0;
      quantityNow -= reduction;
      remainingCost -= reduction * average;
    } else if (["transfer_in", "adjustment"].includes(row.transaction_type)) {
      quantityNow += rowQuantity;
    } else if (row.transaction_type === "transfer_out") {
      const reduction = Math.min(rowQuantity, Math.max(0, quantityNow));
      const average = quantityNow > 0 ? remainingCost / quantityNow : 0;
      quantityNow -= reduction;
      remainingCost -= reduction * average;
    }
  }
  const tolerance = 1e-10;
  const isClosed = Math.abs(quantityNow) < tolerance;
  return {
    quantity: isClosed ? 0 : quantityNow,
    remainingCost: isClosed ? 0 : Math.max(0, boughtCost - soldProceeds),
    boughtQuantity,
    boughtCost,
    soldQuantity,
    soldProceeds,
    buyAveragePrice: weightedTradePrice(rows, "buy"),
    sellAveragePrice: weightedTradePrice(rows, "sell"),
    fees,
    taxes,
    realizedPnl: isClosed ? soldProceeds - boughtCost : Math.max(0, soldProceeds - boughtCost)
  };
}

function weightedTradePrice(rows, transactionType) {
  const trades = rows.filter((row) => row.transaction_type === transactionType);
  const totalQuantity = trades.reduce((sum, row) => sum + num(row.quantity), 0);
  const totalGross = trades.reduce((sum, row) => sum + num(row.gross_amount), 0);
  return totalQuantity > 0 ? totalGross / totalQuantity : null;
}

function buildDashboard(raw) {
  const portfolio = raw.portfolios[0];
  if (!portfolio) throw new Error("這個帳號沒有可用的投資組合");
  const portfolioId = portfolio.id;
  const assets = raw.assets.filter((row) => row.portfolio_id === portfolioId);
  const transactions = raw.transactions.filter((row) => row.portfolio_id === portfolioId && row.status !== "voided");
  const incomeEvents = raw.incomeEvents.filter((row) => row.portfolio_id === portfolioId && row.status !== "voided");
  const components = raw.components.filter((row) => row.portfolio_id === portfolioId);
  const gridRecords = raw.gridRecords.filter((row) => row.portfolio_id === portfolioId);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  const latestPrices = new Map();
  for (const price of raw.marketPrices.filter((row) => row.portfolio_id === portfolioId && row.status === "success")) {
    const keys = [price.asset_id, String(price.instrument_key).toUpperCase()].filter(Boolean);
    for (const key of keys) if (!latestPrices.has(key)) latestPrices.set(key, price);
  }
  const fxRow = latestPrices.get("USD/TWD");
  const currentFx = num(fxRow?.price) || 1;

  const fundingAssets = assets.filter((asset) => asset.metadata?.funding_pool || ["USD", "USDC", "USDT"].includes(String(asset.symbol).toUpperCase()));
  const fundingIds = new Set(fundingAssets.map((asset) => asset.id));
  const fundingBuys = transactions.filter((row) => fundingIds.has(row.asset_id) && row.transaction_type === "buy" && row.settlement_currency === "TWD");
  const fundingQty = fundingBuys.reduce((sum, row) => sum + num(row.quantity), 0);
  const fundingPaid = fundingBuys.reduce((sum, row) => sum + Math.abs(num(row.net_cash_amount) || num(row.gross_amount) + num(row.fee_amount) + num(row.tax_amount)), 0);
  const pooledCostFx = fundingQty > 0 ? fundingPaid / fundingQty : currentFx;

  const incomeByAsset = new Map();
  for (const event of incomeEvents) {
    const factor = event.currency === "TWD" ? 1 : pooledCostFx;
    incomeByAsset.set(event.asset_id, num(incomeByAsset.get(event.asset_id)) + num(event.net_amount) * factor);
  }

  const rowsByAsset = new Map();
  for (const row of transactions) {
    if (!rowsByAsset.has(row.asset_id)) rowsByAsset.set(row.asset_id, []);
    rowsByAsset.get(row.asset_id).push(row);
  }

  const positions = [];
  for (const [assetId, rows] of rowsByAsset.entries()) {
    const asset = assetsById.get(assetId);
    if (!asset) continue;
    const ledger = movingLedger(rows);
    const lastRow = [...rows].sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)) || String(b.created_at).localeCompare(String(a.created_at)))[0];
    const tradeCurrency = rows.find((row) => ["buy", "sell"].includes(row.transaction_type))?.settlement_currency || asset.quote_currency;
    const price = latestPrices.get(asset.id) || latestPrices.get(String(asset.symbol).toUpperCase());
    const nativePrice = price?.price === null || price?.price === undefined ? null : num(price.price);
    const marketFx = (price?.quote_currency || asset.quote_currency) === "TWD" ? 1 : currentFx;
    const costFx = tradeCurrency === "TWD" ? 1 : pooledCostFx;
    const marketValueNative = nativePrice === null ? null : ledger.quantity * nativePrice;
    const marketValueTwd = marketValueNative === null ? null : marketValueNative * marketFx;
    const costTwd = ledger.remainingCost * costFx;
    const realizedPnlTwd = ledger.realizedPnl * costFx;
    const incomeTwd = num(incomeByAsset.get(asset.id));
    positions.push({
      id: asset.id,
      symbol: asset.symbol,
      displaySymbol: ({ "ETH-USDT": "ETH", "ADA-USDT": "ADA" })[asset.symbol] || asset.symbol,
      name: asset.name,
      assetClass: asset.asset_class,
      market: asset.market,
      quoteCurrency: asset.quote_currency,
      quantityUnit: asset.quantity_unit,
      quantityScale: asset.quantity_scale,
      priceScale: asset.price_scale,
      quantity: ledger.quantity,
      costNative: ledger.remainingCost,
      costTwd,
      averageCost: ledger.quantity > 0 ? ledger.remainingCost / ledger.quantity : null,
      buyAveragePrice: ledger.buyAveragePrice,
      sellAveragePrice: ledger.sellAveragePrice,
      marketPrice: nativePrice,
      marketPriceCurrency: price?.quote_currency || asset.quote_currency,
      marketPriceAt: price?.price_at || price?.fetched_at || null,
      marketValueNative,
      marketValueTwd,
      unrealizedPnlTwd: marketValueTwd === null ? null : marketValueTwd - costTwd,
      unrealizedPnlPct: marketValueTwd === null || costTwd <= 0 ? null : (marketValueTwd - costTwd) / costTwd * 100,
      realizedPnlTwd,
      incomeTwd,
      totalPnlTwd: realizedPnlTwd + incomeTwd + (marketValueTwd === null ? 0 : marketValueTwd - costTwd),
      lastTransactionDate: lastRow?.trade_date || null,
      lastTransactionType: lastRow?.transaction_type || null,
      primarySector: asset.metadata?.primary_sector || "其他／待分類",
      subTheme: asset.metadata?.sub_theme || "未分類",
      excluded: Boolean(asset.metadata?.exclude_from_portfolio_value || asset.metadata?.funding_pool)
    });
  }

  const canonicalPositions = new Map(positions.map((row) => [spotPositionKey(row.symbol), row]));
  for (const component of components.filter((row) => row.component_type === "position_snapshot")) {
    const symbol = String(component.symbol || component.component_key || "").toUpperCase();
    if (!symbol) continue;
    const price = latestPrices.get(symbol);
    const marketFx = (price?.quote_currency || component.native_currency) === "TWD" ? 1 : currentFx;
    const currentValue = component.quantity !== null && price?.price !== null && price?.price !== undefined
      ? num(component.quantity) * num(price.price) * marketFx
      : num(component.net_value_twd ?? component.gross_value_twd);
    const canonical = canonicalPositions.get(spotPositionKey(symbol));
    if (canonical) {
      if (canonical.marketPrice === null && component.latest_price !== null) {
        canonical.marketPrice = num(component.latest_price);
        canonical.marketPriceCurrency = component.native_currency;
        canonical.marketPriceAt = component.source_updated_at;
      }
      if (canonical.marketValueTwd === null) {
        canonical.marketValueTwd = currentValue;
        canonical.unrealizedPnlTwd = currentValue - canonical.costTwd;
        canonical.unrealizedPnlPct = canonical.costTwd > 0 ? (currentValue - canonical.costTwd) / canonical.costTwd * 100 : null;
        canonical.totalPnlTwd = canonical.realizedPnlTwd + canonical.incomeTwd + canonical.unrealizedPnlTwd;
      }
      continue;
    }
    const costTwd = num(component.cost_twd);
    positions.push({
      id: component.id,
      symbol,
      displaySymbol: ({ "ETH-USDT": "ETH", "ADA-USDT": "ADA" })[symbol] || symbol,
      name: component.name || symbol,
      assetClass: component.asset_class,
      market: component.market,
      quoteCurrency: component.native_currency,
      quantityUnit: component.quantity_unit,
      quantityScale: 8,
      priceScale: 8,
      quantity: num(component.quantity),
      costNative: null,
      costTwd,
      averageCost: null,
      buyAveragePrice: null,
      sellAveragePrice: null,
      marketPrice: price?.price === null || price?.price === undefined ? num(component.latest_price) || null : num(price.price),
      marketPriceCurrency: price?.quote_currency || component.native_currency,
      marketPriceAt: price?.price_at || price?.fetched_at || component.source_updated_at,
      marketValueNative: null,
      marketValueTwd: currentValue,
      unrealizedPnlTwd: currentValue - costTwd,
      unrealizedPnlPct: costTwd > 0 ? (currentValue - costTwd) / costTwd * 100 : null,
      realizedPnlTwd: num(component.realized_pnl_twd),
      incomeTwd: num(component.income_twd),
      totalPnlTwd: num(component.realized_pnl_twd) + num(component.income_twd) + currentValue - costTwd,
      lastTransactionDate: null,
      lastTransactionType: null,
      primarySector: component.metadata?.primary_sector || "其他／待分類",
      subTheme: component.metadata?.sub_theme || "未分類",
      excluded: !component.included_in_total
    });
  }

  const investablePositions = positions.filter((row) => !row.excluded);
  const openPositions = investablePositions.filter((row) => Math.abs(row.quantity) > 1e-10);
  const cashComponents = components.filter((row) => row.component_type === "cash" && row.source_system === "dashboard_manual_cash");
  const cashValueTwd = cashComponents.reduce((sum, row) => {
    if (row.native_currency === "TWD") return sum + num(row.quantity ?? row.net_value_twd ?? row.gross_value_twd);
    return sum + num(row.quantity) * currentFx;
  }, 0);
  const cashCostTwd = cashComponents.reduce((sum, row) => sum + (row.native_currency === "TWD" ? num(row.quantity ?? row.cost_twd) : num(row.quantity) * pooledCostFx), 0);

  const propertyComponents = components.filter((row) => row.component_type === "property" && row.included_in_total);
  const propertyValueTwd = propertyComponents.reduce((sum, row) => sum + num(row.net_value_twd), 0);

  const runningGrids = gridRecords.filter((row) => row.record_state === "running");
  const closedGrids = gridRecords.filter((row) => row.record_state === "closed");
  const gridInvestmentUsd = runningGrids.reduce((sum, row) => sum + num(row.investment_usdt), 0);
  const gridPnlUsd = [...runningGrids, ...closedGrids].reduce((sum, row) => sum + num(row.realized_pnl), 0);
  const gridValueTwd = (gridInvestmentUsd + gridPnlUsd) * currentFx;
  const gridCostTwd = gridInvestmentUsd * pooledCostFx;

  const classes = {
    traditional: ["tw_equity", "us_equity"],
    crypto: ["crypto"]
  };
  const sumPositions = (assetClasses, field, onlyOpen = false) => (onlyOpen ? openPositions : investablePositions)
    .filter((row) => assetClasses.includes(row.assetClass))
    .reduce((sum, row) => sum + num(row[field]), 0);

  const groups = [
    {
      key: "traditional",
      name: "傳統金融資產",
      valueTwd: sumPositions(classes.traditional, "marketValueTwd", true),
      costTwd: sumPositions(classes.traditional, "costTwd", true),
      realizedPnlTwd: sumPositions(classes.traditional, "realizedPnlTwd"),
      incomeTwd: sumPositions(classes.traditional, "incomeTwd")
    },
    { key: "cash", name: "現金", valueTwd: cashValueTwd, costTwd: cashCostTwd, realizedPnlTwd: 0, incomeTwd: 0 },
    {
      key: "crypto",
      name: "加密資產",
      valueTwd: sumPositions(classes.crypto, "marketValueTwd", true) + gridValueTwd,
      costTwd: sumPositions(classes.crypto, "costTwd", true) + gridCostTwd,
      realizedPnlTwd: sumPositions(classes.crypto, "realizedPnlTwd") + gridPnlUsd * pooledCostFx,
      incomeTwd: sumPositions(classes.crypto, "incomeTwd")
    },
    { key: "property", name: "房地產", valueTwd: propertyValueTwd, costTwd: propertyComponents.reduce((sum, row) => sum + num(row.cost_twd), 0), realizedPnlTwd: 0, incomeTwd: 0 }
  ].map((group) => ({ ...group, unrealizedPnlTwd: group.valueTwd - group.costTwd }));

  const financialGroups = groups.filter((group) => group.key !== "property");
  const financialAssetsTwd = financialGroups.reduce((sum, group) => sum + group.valueTwd, 0);
  const financialCostTwd = financialGroups.reduce((sum, group) => sum + group.costTwd, 0);
  const totalAssetsTwd = financialAssetsTwd + propertyValueTwd;
  const unrealizedPnlTwd = financialAssetsTwd - financialCostTwd;
  const realizedPnlTwd = investablePositions.reduce((sum, row) => sum + num(row.realizedPnlTwd), 0) + gridPnlUsd * pooledCostFx;
  const incomeTwd = incomeEvents.reduce((sum, event) => sum + num(event.net_amount) * (event.currency === "TWD" ? 1 : pooledCostFx), 0);
  const priceTimes = raw.marketPrices.filter((row) => row.status === "success").map((row) => row.fetched_at).filter(Boolean).sort();

  return {
    portfolio,
    positions: openPositions.sort((a, b) => num(b.marketValueTwd) - num(a.marketValueTwd)),
    allPositions: investablePositions,
    transactions: transactions.sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)) || String(b.created_at).localeCompare(String(a.created_at))),
    incomeEvents: incomeEvents.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))),
    assetsById,
    groups,
    currentFx,
    pooledCostFx,
    financialAssetsTwd,
    financialCostTwd,
    totalAssetsTwd,
    propertyValueTwd,
    unrealizedPnlTwd,
    unrealizedPnlPct: financialCostTwd > 0 ? unrealizedPnlTwd / financialCostTwd * 100 : null,
    realizedPnlTwd,
    incomeTwd,
    updatedAt: priceTimes.at(-1) || null
  };
}

async function loadDashboard() {
  if (state.loading) return;
  state.loading = true;
  byId("loading-card").hidden = false;
  byId("error-card").hidden = true;
  document.querySelectorAll(".tab-panel").forEach((panel) => { panel.hidden = true; });
  refreshButton.classList.add("is-spinning");
  refreshButton.disabled = true;
  try {
    const portfolios = await fetchAll("investment_portfolios?select=id,name,base_currency,created_at&order=created_at.asc");
    const portfolioId = portfolios[0]?.id;
    if (!portfolioId) throw new Error("這個帳號沒有可用的投資組合");
    const filter = `portfolio_id=eq.${encodeURIComponent(portfolioId)}`;
    const [assets, transactions, incomeEvents, components, gridRecords] = await Promise.all([
      fetchAll(`investment_assets?select=id,portfolio_id,symbol,name,asset_class,market,quote_currency,quantity_unit,quantity_scale,price_scale,amount_scale,metadata&${filter}&order=symbol.asc`),
      fetchAll(`investment_transactions?select=id,portfolio_id,account_id,asset_id,transaction_type,trade_date,quantity,unit_price,gross_amount,fee_amount,tax_amount,net_cash_amount,settlement_currency,status,details,created_at,updated_at&status=neq.voided&${filter}&order=trade_date.desc,created_at.desc`),
      fetchAll(`investment_income_events?select=id,portfolio_id,account_id,asset_id,income_type,event_date,gross_amount,withholding_tax,fee_amount,net_amount,currency,status,details,created_at,updated_at&status=neq.voided&${filter}&order=event_date.desc,created_at.desc`),
      fetchAll(`investment_portfolio_component_values?select=id,portfolio_id,component_key,component_type,asset_class,market,symbol,name,quantity,quantity_unit,native_currency,latest_price,cost_twd,gross_value_twd,liability_twd,net_value_twd,realized_pnl_twd,unrealized_pnl_twd,income_twd,included_in_total,included_in_financial,source_system,source_updated_at,data_status,metadata&${filter}&order=component_key.asc`),
      fetchAll(`investment_grid_records?select=id,portfolio_id,record_state,symbol,status,investment_usdt,realized_pnl,source_updated_at&${filter}&order=source_updated_at.desc`)
    ]);
    const marketPrices = await fetchLatestMarketPrices(assets, portfolioId);
    state.data = buildDashboard({ portfolios, assets, transactions, incomeEvents, marketPrices, components, gridRecords });
    renderDashboard();
  } catch (error) {
    byId("error-message").textContent = error instanceof Error ? error.message : String(error);
    byId("error-card").hidden = false;
  } finally {
    state.loading = false;
    byId("loading-card").hidden = true;
    refreshButton.classList.remove("is-spinning");
    refreshButton.disabled = false;
    if (state.data) showTab(state.activeTab);
  }
}

function groupLabel(assetClass) {
  return ({ tw_equity: "TW", us_equity: "US", crypto: "CRYPTO" })[assetClass] || String(assetClass || "—").toUpperCase();
}

function spotPositionKey(symbol) {
  return String(symbol || "").toUpperCase().replace(/-(?:USD|USDT|USDC)$/, "");
}

function positionCard(position) {
  const details = document.createElement("details");
  details.className = "position-card";
  const pnl = num(position.unrealizedPnlTwd);
  const hasPnl = position.marketValueTwd !== null && position.unrealizedPnlTwd !== null;
  const pnlAmount = hasPnl ? money(pnl, "TWD", true) : "—";
  const pnlPercent = position.unrealizedPnlPct === null
    ? "—"
    : `${position.unrealizedPnlPct >= 0 ? "+" : ""}${position.unrealizedPnlPct.toFixed(2)}%`;
  const pnlTone = !hasPnl ? "" : pnl >= 0 ? "is-positive" : "is-negative";
  const realizedTotal = num(position.realizedPnlTwd) + num(position.incomeTwd);
  const realizedTone = realizedTotal > 0 ? "is-positive" : realizedTotal < 0 ? "is-negative" : "";
  details.innerHTML = `
    <summary>
      <span class="position-identity">
        <span class="symbol-row"><strong>${escapeHtml(position.displaySymbol)}</strong><span class="market-pill">${escapeHtml(groupLabel(position.assetClass))}</span></span>
        <span class="position-name">${escapeHtml(position.name)}</span>
      </span>
      <span class="position-value">
        <strong class="private-number">${money(position.marketValueTwd)}</strong>
        <small class="private-number position-return ${pnlTone}"><span>${pnlAmount}</span><span aria-hidden="true">·</span><span>${pnlPercent}</span></small>
      </span>
    </summary>
    <div class="position-details">
      <span class="position-detail"><span>持有數量</span><strong class="private-number">${quantity(position.quantity, position.quantityScale)} ${escapeHtml(position.quantityUnit || "")}</strong></span>
      <span class="position-detail"><span>持倉均價</span><strong class="private-number">${position.averageCost === null ? "—" : money(position.averageCost, position.quoteCurrency)}</strong></span>
      <span class="position-detail"><span>最新價格</span><strong class="private-number">${position.marketPrice === null ? "—" : money(position.marketPrice, position.marketPriceCurrency)}</strong></span>
      <span class="position-detail"><span>累計買入均價</span><strong class="private-number">${position.buyAveragePrice === null ? "—" : money(position.buyAveragePrice, position.quoteCurrency)}</strong></span>
      <span class="position-detail"><span>剩餘成本</span><strong class="private-number">${money(position.costTwd)}</strong></span>
      <span class="position-detail"><span>累計賣出均價</span><strong class="private-number">${position.sellAveragePrice === null ? "—" : money(position.sellAveragePrice, position.quoteCurrency)}</strong></span>
      <span class="position-detail"><span>未實現損益</span><strong class="private-number ${pnlTone}">${hasPnl ? money(pnl, "TWD", true) : "—"}</strong></span>
      <span class="position-detail"><span>未實現報酬</span><strong class="private-number ${pnlTone}">${position.unrealizedPnlPct === null ? "零成本／待補" : pnlPercent}</strong></span>
      <span class="position-detail"><span>已實現合計</span><strong class="private-number ${realizedTone}">${money(realizedTotal, "TWD", true)}</strong></span>
      <span class="position-detail"><span>主題</span><strong>${escapeHtml(position.subTheme)}</strong></span>
      <span class="position-detail"><span>行情時間</span><strong>${dateTime(position.marketPriceAt)}</strong></span>
    </div>
    <button class="position-ledger-button" type="button" data-asset-ledger="${escapeHtml(position.id)}" data-symbol="${escapeHtml(position.symbol)}">查看 ${escapeHtml(position.displaySymbol)} 成交紀錄 →</button>`;
  return details;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function renderPositions() {
  const rows = state.data.positions.filter((row) => state.marketFilter === "all" || row.assetClass === state.marketFilter);
  byId("position-count").textContent = rows.length;
  const list = byId("positions-list");
  list.replaceChildren();
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">這個分類目前沒有持倉</div>';
    return;
  }
  rows.forEach((row) => list.append(positionCard(row)));
}

function renderActivity() {
  const query = state.transactionQuery.trim().toLocaleLowerCase("zh-Hant");
  const transactions = state.data.transactions.filter((row) => {
    if (row.details?.event_role === "asset_fee") return false;
    if (state.transactionType !== "all" && row.transaction_type !== state.transactionType) return false;
    if (!query) return true;
    const asset = state.data.assetsById.get(row.asset_id) || {};
    return [asset.symbol, asset.name].some((value) => String(value || "").toLocaleLowerCase("zh-Hant").includes(query));
  });
  byId("transaction-count").textContent = transactions.length;
  byId("transaction-filter-note").textContent = query
    ? `找到 ${transactions.length} 筆符合「${state.transactionQuery.trim()}」的成交紀錄`
    : `共 ${transactions.length} 筆成交紀錄`;
  byId("clear-transaction-search").hidden = !state.transactionQuery;
  const transactionList = byId("transaction-list");
  transactionList.replaceChildren();
  for (const row of transactions) {
    const asset = state.data.assetsById.get(row.asset_id) || {};
    const item = document.createElement("article");
    item.className = "transaction-row";
    const isSell = row.transaction_type === "sell";
    const label = ({ buy: "買入", sell: "賣出", transfer_in: "轉入", transfer_out: "轉出", adjustment: "調整", split: "分割" })[row.transaction_type] || row.transaction_type;
    item.innerHTML = `
      <span class="transaction-type ${isSell ? "is-sell" : ""}">${escapeHtml(label)}</span>
      <span class="transaction-copy"><strong>${escapeHtml(asset.symbol || "—")} · ${escapeHtml(asset.name || "未命名標的")}</strong><small>${shortDate(row.trade_date)} · ${escapeHtml(row.settlement_currency)}</small><small class="transaction-costs private-number">手續費 ${money(row.fee_amount || 0, row.settlement_currency)} · 稅 ${money(row.tax_amount || 0, row.settlement_currency)}</small></span>
      <span class="transaction-amount"><strong class="private-number">${quantity(row.quantity, asset.quantity_scale)} ${escapeHtml(asset.quantity_unit || "")}</strong><small class="private-number">${row.unit_price === null ? "無成交價" : money(row.unit_price, row.settlement_currency)}</small></span>`;
    transactionList.append(item);
  }
  if (!transactions.length) transactionList.innerHTML = '<div class="empty-state">目前沒有交易紀錄</div>';

  byId("income-event-count").textContent = state.data.incomeEvents.length;
  const incomeList = byId("income-list");
  incomeList.replaceChildren();
  for (const row of state.data.incomeEvents.slice(0, 20)) {
    const asset = state.data.assetsById.get(row.asset_id) || {};
    const item = document.createElement("article");
    item.className = "transaction-row";
    item.innerHTML = `
      <span class="transaction-type is-income">收益</span>
      <span class="transaction-copy"><strong>${escapeHtml(asset.symbol || "—")} · ${escapeHtml(asset.name || "未關聯標的")}</strong><small>${shortDate(row.event_date)} · ${escapeHtml(row.income_type)}</small></span>
      <span class="transaction-amount"><strong class="private-number is-positive">${money(row.net_amount, row.currency, true)}</strong><small>${escapeHtml(row.currency)}</small></span>`;
    incomeList.append(item);
  }
  if (!state.data.incomeEvents.length) incomeList.innerHTML = '<div class="empty-state">目前沒有收益紀錄</div>';
}

function renderOverview() {
  const data = state.data;
  byId("portfolio-name").textContent = data.portfolio.name;
  byId("data-updated-at").textContent = `行情 ${dateTime(data.updatedAt)}`;
  byId("user-email").textContent = state.userEmail || "已登入";
  byId("total-assets").textContent = money(data.totalAssetsTwd);
  byId("total-assets-note").textContent = data.propertyValueTwd > 0 ? `含房地產淨值 ${money(data.propertyValueTwd)}` : "目前未納入房地產淨值";
  byId("financial-assets").textContent = money(data.financialAssetsTwd);
  byId("financial-cost-note").textContent = `成本 ${money(data.financialCostTwd)}`;
  byId("unrealized-pnl").textContent = money(data.unrealizedPnlTwd, "TWD", true);
  setTone(byId("unrealized-pnl"), data.unrealizedPnlTwd);
  byId("unrealized-pct").textContent = data.unrealizedPnlPct === null ? "—" : `${data.unrealizedPnlPct >= 0 ? "+" : ""}${data.unrealizedPnlPct.toFixed(2)}%`;
  byId("realized-pnl").textContent = money(data.realizedPnlTwd, "TWD", true);
  setTone(byId("realized-pnl"), data.realizedPnlTwd);
  byId("income-total").textContent = money(data.incomeTwd, "TWD", true);
  setTone(byId("income-total"), data.incomeTwd);
  byId("income-count").textContent = `${data.incomeEvents.length} 筆收益事件`;

  const groups = byId("asset-groups");
  groups.replaceChildren();
  for (const group of data.groups) {
    const pct = data.totalAssetsTwd > 0 ? group.valueTwd / data.totalAssetsTwd * 100 : 0;
    const row = document.createElement("div");
    row.className = "asset-group";
    row.innerHTML = `
      <div class="asset-group-head">
        <span class="asset-group-name"><strong>${escapeHtml(group.name)}</strong><small>${pct.toFixed(1)}%</small></span>
        <strong class="asset-group-value private-number">${money(group.valueTwd)}</strong>
      </div>
      <div class="allocation-track"><div class="allocation-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
    groups.append(row);
  }

  const top = byId("top-positions");
  top.replaceChildren();
  data.positions.slice(0, 6).forEach((row) => top.append(positionCard(row)));
  if (!data.positions.length) top.innerHTML = '<div class="empty-state">目前沒有持倉</div>';
}

function renderDashboard() {
  renderOverview();
  renderPositions();
  renderActivity();
  document.body.classList.toggle("numbers-hidden", state.numbersHidden);
  byId("privacy-toggle").textContent = state.numbersHidden ? "◌" : "◉";
  showTab(state.activeTab);
}

function showTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== tabName; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLogin() {
  dashboardView.hidden = true;
  loginView.hidden = false;
  if (state.userEmail) byId("email").value = state.userEmail;
}

function showDashboardShell() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "登入中…";
  loginStatus.textContent = "";
  try {
    const payload = await authRequest("password", { email: byId("email").value.trim(), password: byId("password").value });
    saveSession(payload, byId("remember-device").checked);
    byId("password").value = "";
    showDashboardShell();
    await loadDashboard();
  } catch (error) {
    loginStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "登入查看";
  }
});

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
document.querySelectorAll("[data-go-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.goTab)));
document.querySelectorAll("#position-filters .filter-chip").forEach((button) => button.addEventListener("click", () => {
  state.marketFilter = button.dataset.market;
  document.querySelectorAll("#position-filters .filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip === button));
  renderPositions();
}));

document.querySelectorAll("#transaction-filters .filter-chip").forEach((button) => button.addEventListener("click", () => {
  state.transactionType = button.dataset.transactionType;
  document.querySelectorAll("#transaction-filters .filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip === button));
  renderActivity();
}));

byId("transaction-search").addEventListener("input", (event) => {
  state.transactionQuery = event.target.value;
  renderActivity();
});

byId("clear-transaction-search").addEventListener("click", () => {
  state.transactionQuery = "";
  byId("transaction-search").value = "";
  byId("transaction-search").focus();
  renderActivity();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-asset-ledger]");
  if (!button) return;
  state.transactionQuery = button.dataset.symbol || "";
  state.transactionType = "all";
  byId("transaction-search").value = state.transactionQuery;
  document.querySelectorAll("#transaction-filters .filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.transactionType === "all"));
  showTab("activity");
  byId("transaction-search").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
});

refreshButton.addEventListener("click", loadDashboard);
byId("retry-button").addEventListener("click", loadDashboard);
byId("sign-out-button").addEventListener("click", () => {
  clearSession();
  state.data = null;
  showLogin();
});
byId("privacy-toggle").addEventListener("click", () => {
  state.numbersHidden = !state.numbersHidden;
  window.localStorage.setItem(storageKeys.privacy, String(state.numbersHidden));
  document.body.classList.toggle("numbers-hidden", state.numbersHidden);
  byId("privacy-toggle").textContent = state.numbersHidden ? "◌" : "◉";
});

async function boot() {
  document.body.classList.toggle("numbers-hidden", state.numbersHidden);
  if (!state.accessToken && state.refreshToken) await refreshSession();
  if (state.accessToken) {
    showDashboardShell();
    await loadDashboard();
  } else showLogin();
}

void boot();
