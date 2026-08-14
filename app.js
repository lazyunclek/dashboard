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
  activeTab: "cashbook",
  marketFilter: "all",
  transactionAssetId: "",
  transactionQuery: "",
  transactionType: "all",
  exposureLevel: "primarySector",
  selectedExposure: "",
  cashbook: {
    accounts: [],
    categories: [],
    ledger: [],
    events: [],
    loaded: false,
    loading: false,
    month: new Date().toISOString().slice(0, 7),
    selectedDate: new Date().toISOString().slice(0, 10),
    armedDate: "",
    view: "ledger",
    editingEvent: null
  },
  numbersHidden: window.localStorage.getItem(storageKeys.privacy) === "true",
  loading: false,
  sheetScrollY: 0
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

const cashbookRpcNames = new Set(["cashbook_ensure_defaults", "cashbook_event_save", "cashbook_event_delete"]);

async function cashbookRpc(name, body = {}, retried = false) {
  if (!cashbookRpcNames.has(name)) throw new Error("不允許的日常帳本操作");
  if (!state.accessToken) throw new Error("請先登入");
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && !retried && await refreshSession()) return cashbookRpc(name, body, true);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.hint || `帳目操作失敗（${response.status}）`);
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

function overviewMoney(value, signed = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const amount = Number(value);
  const formatted = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(amount));
  const prefix = signed ? (amount > 0 ? "+" : amount < 0 ? "−" : "") : (amount < 0 ? "−" : "");
  return `${prefix}NT$${formatted}`;
}

function perSharePrice(value, currency, assetClass) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const amount = Number(value);
  const isTwEquity = assetClass === "tw_equity";
  const digits = isTwEquity ? (amount >= 10 && amount < 100 ? 2 : 0) : (currency === "TWD" ? 0 : 2);
  const formatted = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  return `${currency === "TWD" ? "NT$" : `${currency} `}${formatted}`;
}

function quantity(value, scale = 4) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: Math.min(8, Math.max(0, num(scale))) }).format(num(value));
}

function transactionCashflow(row) {
  if (row.net_cash_amount !== null && row.net_cash_amount !== undefined) return num(row.net_cash_amount);
  const gross = Math.abs(num(row.gross_amount));
  const charges = transactionCharges(row);
  if (row.transaction_type === "buy") return -(gross + charges);
  if (row.transaction_type === "sell") return gross - charges;
  return null;
}

function transactionCharges(row) {
  return num(row.fee_amount) + num(row.tax_amount);
}

function transactionCashflowLabel(row) {
  const cashflow = transactionCashflow(row);
  if (cashflow === null) return "現金流待補";
  if (row.transaction_type === "buy") return `實付 ${money(Math.abs(cashflow), row.settlement_currency)}`;
  if (row.transaction_type === "sell") return `實收 ${money(cashflow, row.settlement_currency)}`;
  return `淨現金流 ${money(cashflow, row.settlement_currency, true)}`;
}

function shortDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function quoteFreshness(assetClass, fetchedAt, now = new Date()) {
  const fetched = new Date(fetchedAt);
  const ageMs = now.getTime() - fetched.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "stale";
  if (assetClass === "crypto") return ageMs <= 45 * 60 * 1000 ? "fresh" : "stale";
  const timeZone = assetClass === "tw_equity" ? "Asia/Taipei" : "America/New_York";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = value("weekday");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  const openMinute = assetClass === "tw_equity" ? 9 * 60 : 9 * 60 + 30;
  const weekendGrace = ["Sat", "Sun"].includes(weekday)
    || (weekday === "Mon" && hour * 60 + minute < openMinute);
  return ageMs <= (weekendGrace ? 96 : 36) * 60 * 60 * 1000 ? "fresh" : "stale";
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
      marketPriceFetchedAt: price?.fetched_at || null,
      marketPriceStatus: price ? quoteFreshness(asset.asset_class, price.fetched_at) : "missing",
      marketValueNative,
      marketValueTwd,
      unrealizedPnlTwd: marketValueTwd === null ? null : marketValueTwd - costTwd,
      fxPnlTwd: tradeCurrency === "TWD" ? 0 : ledger.remainingCost * (currentFx - pooledCostFx),
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
      marketPriceFetchedAt: price?.fetched_at || component.source_updated_at,
      marketPriceStatus: price ? quoteFreshness(component.asset_class, price.fetched_at) : "stale",
      marketValueNative: null,
      marketValueTwd: currentValue,
      unrealizedPnlTwd: currentValue - costTwd,
      fxPnlTwd: component.native_currency === "TWD" || pooledCostFx <= 0 ? 0 : costTwd / pooledCostFx * (currentFx - pooledCostFx),
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
  const eligibleCashTypes = new Set(["cash", "bank", "electronic_payment", "debit_card", "credit_card"]);
  const activeCashbookBalances = (raw.cashbookBalances || []).filter((row) => row.status === "active" && eligibleCashTypes.has(row.account_type));
  const cashBalances = ["TWD", "USD", "USDC", "USDT"].map((currency) => {
    const rows = activeCashbookBalances.filter((row) => row.currency === currency && (currency !== "USD" || row.use_as_investment_usd_source));
    const balance = rows.reduce((sum, row) => sum + num(row.balance), 0);
    const factor = currency === "TWD" ? 1 : currentFx;
    const costFactor = currency === "TWD" ? 1 : pooledCostFx;
    return { currency, balance, valueTwd: balance * factor, costTwd: balance * costFactor };
  });
  const cashValueTwd = cashBalances.reduce((sum, row) => sum + row.valueTwd, 0);
  const cashCostTwd = cashBalances.reduce((sum, row) => sum + row.costTwd, 0);
  const cashCurrencies = cashBalances.filter((row) => Math.abs(row.balance) > 1e-10).map((row) => row.currency);

  const propertyComponents = components.filter((row) => row.component_type === "property" && row.included_in_total);
  const propertyComponent = propertyComponents[0] || null;
  const propertyAccounts = (raw.cashbookBalances || []).filter((row) => row.status === "active" && row.account_type === "asset_cost" && row.asset_class === "real_estate" && row.currency === "TWD");
  const propertyAccountIds = new Set(propertyAccounts.map((row) => row.account_id).filter(Boolean));
  const propertyEvents = (raw.cashbookEvents || []).filter((row) => row.status === "posted");
  const propertyAssetCostTwd = propertyAccounts.reduce((sum, row) => sum + num(row.balance), 0);
  const propertyExpenseCostTwd = propertyEvents
    .filter((row) => row.event_type === "expense" && row.source_payload?.property_related)
    .reduce((sum, row) => sum + num(row.twd_value ?? (row.original_currency === "TWD" ? row.original_amount : 0)), 0);
  const propertyCashbookCostTwd = propertyAssetCostTwd + propertyExpenseCostTwd;
  const classifiedPropertyAmount = (recovery) => propertyEvents
    .filter((row) => row.source_payload?.property_cost_recovery === recovery
      && (propertyAccountIds.has(row.destination_account_id) || (row.event_type === "expense" && row.source_payload?.property_related)))
    .reduce((sum, row) => sum + num(row.event_type === "expense" ? row.twd_value ?? (row.original_currency === "TWD" ? row.original_amount : 0) : row.destination_amount ?? row.original_amount), 0);
  let propertyRecoverableTwd = Math.min(classifiedPropertyAmount("recoverable"), propertyCashbookCostTwd);
  let propertyNonRecoverableTwd = Math.min(classifiedPropertyAmount("non_recoverable"), Math.max(propertyCashbookCostTwd - propertyRecoverableTwd, 0));
  let propertyRecoveryRoomTwd = Math.max(propertyCashbookCostTwd - propertyRecoverableTwd - propertyNonRecoverableTwd, 0);
  for (const row of (raw.propertyEvents || []).filter((item) => ["recoverable", "non_recoverable"].includes(item.recovery_class))) {
    const amount = Math.min(num(row.amount_twd), propertyRecoveryRoomTwd);
    if (row.recovery_class === "recoverable") propertyRecoverableTwd += amount;
    else propertyNonRecoverableTwd += amount;
    propertyRecoveryRoomTwd -= amount;
  }
  const propertyModel = propertyComponent?.metadata?.valuation_model || null;
  const propertySalePriceTwd = num(propertyModel?.future_sale_total_twd);
  const propertyPurchasePriceTwd = num(propertyModel?.purchase_total_twd);
  const propertyTaxRate = num(propertyModel?.sale_tax_rate ?? (1 - num(propertyModel?.sale_profit_retention_rate ?? 0.55)));
  const propertyEstimatedTaxTwd = Math.max(propertySalePriceTwd - propertyPurchasePriceTwd, 0) * propertyTaxRate;
  const propertyEstimatedProfitTwd = propertyModel
    ? propertySalePriceTwd - propertyPurchasePriceTwd - propertyEstimatedTaxTwd
    : num(propertyComponent?.unrealized_pnl_twd);
  const propertyValueTwd = propertyComponent
    ? propertyRecoverableTwd + propertyEstimatedProfitTwd
    : 0;

  const runningGrids = gridRecords.filter((row) => row.record_state === "running");
  const closedGrids = gridRecords.filter((row) => row.record_state === "closed");
  const gridInvestmentUsd = runningGrids.reduce((sum, row) => sum + num(row.investment_usdt), 0);
  const runningGridPnlUsd = runningGrids.reduce((sum, row) => sum + num(row.realized_pnl), 0);
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
      realizedPnlTwd: sumPositions(classes.crypto, "realizedPnlTwd"),
      incomeTwd: sumPositions(classes.crypto, "incomeTwd")
    },
    { key: "property", name: "房地產", valueTwd: propertyValueTwd, costTwd: propertyCashbookCostTwd, realizedPnlTwd: 0, incomeTwd: 0 }
  ].map((group) => {
    const unrealizedPnlTwd = group.key === "property" ? propertyEstimatedProfitTwd : group.valueTwd - group.costTwd;
    return {
      ...group,
      unrealizedPnlTwd,
      totalPnlTwd: group.realizedPnlTwd + group.incomeTwd + unrealizedPnlTwd
    };
  });

  const financialGroups = groups.filter((group) => group.key !== "property");
  const financialAssetsTwd = financialGroups.reduce((sum, group) => sum + group.valueTwd, 0);
  const financialCostTwd = financialGroups.reduce((sum, group) => sum + group.costTwd, 0);
  const totalAssetsTwd = financialAssetsTwd + propertyValueTwd;
  const unrealizedPnlTwd = financialAssetsTwd - financialCostTwd;
  const realizedPnlTwd = investablePositions.reduce((sum, row) => sum + num(row.realizedPnlTwd), 0) + gridPnlUsd * pooledCostFx;
  const incomeTwd = incomeEvents.reduce((sum, event) => sum + num(event.net_amount) * (event.currency === "TWD" ? 1 : pooledCostFx), 0);
  const priceTimes = raw.marketPrices.filter((row) => row.status === "success").map((row) => row.fetched_at).filter(Boolean).sort();
  const marketUpdates = Object.fromEntries(["tw_equity", "us_equity", "crypto"].map((assetClass) => {
    const times = openPositions
      .filter((row) => row.assetClass === assetClass && row.marketPriceAt)
      .map((row) => row.marketPriceAt)
      .sort();
    return [assetClass, times.at(-1) || null];
  }));
  const stalePriceCount = openPositions.filter((row) => row.marketPriceStatus === "stale").length;
  const usdFxPnlTwd = investablePositions.reduce((sum, row) => sum + num(row.fxPnlTwd), 0) + (cashValueTwd - cashCostTwd);

  return {
    portfolio,
    positions: openPositions.sort((a, b) => num(b.marketValueTwd) - num(a.marketValueTwd)),
    allPositions: investablePositions,
    transactions: transactions.sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)) || String(b.created_at).localeCompare(String(a.created_at))),
    incomeEvents: incomeEvents.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))),
    assetsById,
    groups,
    cashBalances,
    cashValueTwd,
    cashCurrencies,
    runningGridCount: runningGrids.length,
    runningGridPnlUsd,
    currentFx,
    pooledCostFx,
    usdFxPnlTwd,
    usdFxUpdatedAt: fxRow?.price_at || fxRow?.fetched_at || null,
    financialAssetsTwd,
    financialCostTwd,
    totalAssetsTwd,
    propertyValueTwd,
    unrealizedPnlTwd,
    unrealizedPnlPct: financialCostTwd > 0 ? unrealizedPnlTwd / financialCostTwd * 100 : null,
    realizedPnlTwd,
    incomeTwd,
    updatedAt: priceTimes.at(-1) || null,
    marketUpdates,
    stalePriceCount
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
    const [assets, transactions, incomeEvents, components, gridRecords, cashbookBalances, cashbookEvents, propertyEvents] = await Promise.all([
      fetchAll(`investment_assets?select=id,portfolio_id,symbol,name,asset_class,market,quote_currency,quantity_unit,quantity_scale,price_scale,amount_scale,metadata&${filter}&order=symbol.asc`),
      fetchAll(`investment_transactions?select=id,portfolio_id,account_id,asset_id,transaction_type,trade_date,quantity,unit_price,gross_amount,fee_amount,tax_amount,net_cash_amount,settlement_currency,status,details,created_at,updated_at&status=neq.voided&${filter}&order=trade_date.desc,created_at.desc`),
      fetchAll(`investment_income_events?select=id,portfolio_id,account_id,asset_id,income_type,event_date,gross_amount,withholding_tax,fee_amount,net_amount,currency,status,details,created_at,updated_at&status=neq.voided&${filter}&order=event_date.desc,created_at.desc`),
      fetchAll(`investment_portfolio_component_values?select=id,portfolio_id,component_key,component_type,asset_class,market,symbol,name,quantity,quantity_unit,native_currency,latest_price,cost_twd,gross_value_twd,liability_twd,net_value_twd,realized_pnl_twd,unrealized_pnl_twd,income_twd,included_in_total,included_in_financial,source_system,source_updated_at,data_status,metadata&${filter}&order=component_key.asc`),
      fetchAll(`investment_grid_records?select=id,portfolio_id,record_state,symbol,status,investment_usdt,realized_pnl,source_updated_at&${filter}&order=source_updated_at.desc`),
      fetchAll("cashbook_account_balances?select=account_id,account_type,currency,asset_class,balance,status,use_as_investment_usd_source"),
      fetchAll("cashbook_events?select=id,event_type,original_amount,original_currency,destination_account_id,destination_amount,twd_value,source_payload,status"),
      fetchAll(`investment_property_events?select=property_component_id,amount_twd,recovery_class&${filter}`)
    ]);
    const marketPrices = await fetchLatestMarketPrices(assets, portfolioId);
    state.data = buildDashboard({ portfolios, assets, transactions, incomeEvents, marketPrices, components, gridRecords, cashbookBalances, cashbookEvents, propertyEvents });
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
  const ledgerTransactions = state.data.transactions.filter((row) => row.asset_id === position.id && row.details?.event_role !== "asset_fee");
  const buyCount = ledgerTransactions.filter((row) => row.transaction_type === "buy").length;
  const sellCount = ledgerTransactions.filter((row) => row.transaction_type === "sell").length;
  const ledgerActions = [
    { type: "all", label: `全部 ${ledgerTransactions.length} 筆` },
    { type: "buy", label: `買入 ${buyCount} 筆`, hidden: buyCount === 0 },
    { type: "sell", label: `賣出 ${sellCount} 筆`, hidden: sellCount === 0 }
  ].filter((action) => !action.hidden).map((action) => `<button class="position-ledger-button" type="button" data-asset-ledger="${escapeHtml(position.id)}" data-symbol="${escapeHtml(position.symbol)}" data-transaction-type="${action.type}">${action.label}</button>`).join("");
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
      <span class="position-detail"><span>持倉均價</span><strong class="private-number">${perSharePrice(position.averageCost, position.quoteCurrency, position.assetClass)}</strong></span>
      <span class="position-detail"><span>最新價格</span><strong class="private-number">${perSharePrice(position.marketPrice, position.marketPriceCurrency, position.assetClass)}${position.marketPriceStatus === "stale" ? '<small class="price-status is-stale">行情過期</small>' : ""}</strong></span>
      <span class="position-detail"><span>累計買入均價</span><strong class="private-number">${perSharePrice(position.buyAveragePrice, position.quoteCurrency, position.assetClass)}</strong></span>
      <span class="position-detail"><span>剩餘成本</span><strong class="private-number">${money(position.costTwd)}</strong></span>
      <span class="position-detail"><span>累計賣出均價</span><strong class="private-number">${perSharePrice(position.sellAveragePrice, position.quoteCurrency, position.assetClass)}</strong></span>
      <span class="position-detail"><span>未實現損益</span><strong class="private-number ${pnlTone}">${hasPnl ? money(pnl, "TWD", true) : "—"}</strong></span>
      <span class="position-detail"><span>未實現報酬</span><strong class="private-number ${pnlTone}">${position.unrealizedPnlPct === null ? "零成本／待補" : pnlPercent}</strong></span>
      <span class="position-detail"><span>已實現合計</span><strong class="private-number ${realizedTone}">${money(realizedTotal, "TWD", true)}</strong></span>
      <span class="position-detail"><span>主題</span><strong>${escapeHtml(position.subTheme)}</strong></span>
      <span class="position-detail"><span>行情時間</span><strong>${dateTime(position.marketPriceAt)}</strong></span>
    </div>
    <div class="position-ledger-actions" aria-label="${escapeHtml(position.displaySymbol)} 成交紀錄篩選">
      ${ledgerActions}
    </div>`;
  return details;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const cashbookTypeLabels = {
  expense: "支出",
  income: "收入",
  transfer: "轉帳",
  exchange: "換匯",
  credit_card_payment: "信用卡繳款",
  investment_funding_transfer: "資產投入",
  investment_recovery_transfer: "資產回收",
  opening_balance: "初始化餘額"
};
const cashbookAccountTypeLabels = {
  cash: "現金",
  bank: "銀行",
  electronic_payment: "電子支付",
  debit_card: "金融卡／儲值卡",
  credit_card: "信用卡",
  asset_cost: "資產成本"
};
const cashbookAssetClassLabels = { crypto: "虛擬貨幣", tw_equity: "台股", us_equity: "美股", real_estate: "房地產" };
const usdEquivalentCurrencies = new Set(["USD", "USDC", "USDT"]);

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cashbookMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month, 1);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`
  };
}

function cashbookMoney(value, currency = "TWD", signed = false) {
  return money(value, currency, signed).replace(/^USD /, "US$");
}

function showToast(message) {
  const toast = byId("app-toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2400);
}

function cashbookAccount(accountId) {
  return state.cashbook.accounts.find((account) => account.id === accountId) || null;
}

function cashbookEvent(eventId) {
  return state.cashbook.ledger.find((row) => row.id === eventId) || null;
}

async function loadCashbook() {
  if (state.cashbook.loading) return;
  state.cashbook.loading = true;
  byId("cashbook-day-hint").textContent = "正在讀取日常帳本…";
  try {
    await cashbookRpc("cashbook_ensure_defaults");
    const { start, end } = cashbookMonthBounds(state.cashbook.month);
    const rangeStart = new Date(`${start}T00:00:00`);
    rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
    const rangeEnd = new Date(`${end}T00:00:00`);
    rangeEnd.setDate(rangeEnd.getDate() + (7 - rangeEnd.getDay()) % 7);
    const queryStart = localDateKey(rangeStart);
    const queryEnd = localDateKey(rangeEnd);
    const [accountRows, balanceRows, categories, ledger, events] = await Promise.all([
      fetchAll("cashbook_accounts?select=*&order=status.asc,name.asc"),
      fetchAll("cashbook_account_balances?select=*&order=status.asc,name.asc"),
      fetchAll("cashbook_categories?select=*&order=category_type.asc,sort_order.asc,name.asc"),
      fetchAll(`cashbook_ledger?select=*&occurred_on=gte.${queryStart}&occurred_on=lt.${queryEnd}&order=occurred_on.desc,created_at.desc&limit=500`),
      fetchAll(`cashbook_events?select=id,source_payload&occurred_on=gte.${queryStart}&occurred_on=lt.${queryEnd}&order=occurred_on.desc,created_at.desc&limit=500`)
    ]);
    const balanceById = new Map(balanceRows.map((row) => [row.account_id, row]));
    const payloadById = new Map(events.map((row) => [row.id, row.source_payload || {}]));
    state.cashbook.accounts = accountRows.map((row) => ({
      ...row,
      balance: balanceById.get(row.id)?.balance ?? 0,
      last_event_on: balanceById.get(row.id)?.last_event_on ?? null
    }));
    state.cashbook.categories = categories;
    state.cashbook.ledger = ledger.map((row) => ({ ...row, source_payload: payloadById.get(row.id) || {} }));
    state.cashbook.events = events;
    state.cashbook.loaded = true;
    renderCashbook();
  } catch (error) {
    byId("cashbook-day-hint").textContent = error instanceof Error ? `讀取失敗：${error.message}` : "日常帳本讀取失敗";
  } finally {
    state.cashbook.loading = false;
  }
}

function renderCashbookAccounts() {
  const strip = byId("cashbook-account-strip");
  strip.replaceChildren();
  const accounts = state.cashbook.accounts.filter((row) => row.status === "active" && row.account_type !== "investment_bridge");
  if (!accounts.length) {
    strip.innerHTML = '<div class="empty-state">尚未建立日常帳戶，請先在桌面版建立帳戶。</div>';
    return;
  }
  const groupDefinitions = [
    ["現金", (row) => row.account_type === "cash"],
    ["銀行", (row) => row.account_type === "bank"],
    ["電子支付與卡片", (row) => ["electronic_payment", "debit_card", "credit_card"].includes(row.account_type)],
    ["資產成本", (row) => row.account_type === "asset_cost"]
  ];
  for (const [title, predicate] of groupDefinitions) {
    const rows = accounts.filter(predicate);
    if (!rows.length) continue;
    const section = document.createElement("section");
    section.className = "cashbook-account-group";
    const currencies = new Set(rows.map((row) => row.currency));
    const summary = currencies.size === 1
      ? cashbookMoney(rows.reduce((sum, row) => sum + num(row.balance), 0), rows[0].currency)
      : `${rows.length} 個帳戶`;
    section.innerHTML = `<div class="cashbook-account-group-title"><span>${escapeHtml(title)}</span><strong class="private-number">${escapeHtml(summary)}</strong></div>`;
    for (const account of rows) {
      const row = document.createElement("article");
      row.className = `cashbook-account-row ${num(account.balance) < 0 ? "is-negative" : ""}`;
      const accountKind = account.account_type === "asset_cost"
        ? cashbookAssetClassLabels[account.asset_class] || "資產成本"
        : cashbookAccountTypeLabels[account.account_type] || account.account_type;
      row.innerHTML = `<span class="cashbook-account-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.currency)} · ${escapeHtml(accountKind)}</small></span><b class="cashbook-account-balance private-number">${cashbookMoney(account.balance, account.currency)}</b>`;
      section.append(row);
    }
    strip.append(section);
  }
}

function showCashbookView(viewName) {
  state.cashbook.view = viewName === "accounts" ? "accounts" : "ledger";
  byId("cashbook-ledger-view").hidden = state.cashbook.view !== "ledger";
  byId("cashbook-accounts-view").hidden = state.cashbook.view !== "accounts";
  document.querySelectorAll("[data-cashbook-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.cashbookView === state.cashbook.view));
}

function renderCashbookCalendar() {
  const [year, month] = state.cashbook.month.split("-").map(Number);
  byId("cashbook-month-label").textContent = `${year} 年 ${month} 月`;
  const grid = byId("cashbook-calendar-grid");
  grid.replaceChildren();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const eventsByDate = new Map();
  for (const row of state.cashbook.ledger.filter((item) => item.status === "posted")) {
    const types = eventsByDate.get(row.occurred_on) || new Set();
    types.add(row.event_type);
    if (usdEquivalentCurrencies.has(row.original_currency) || usdEquivalentCurrencies.has(row.account_currency)) types.add("usd");
    eventsByDate.set(row.occurred_on, types);
  }
  for (let index = 0; index < firstWeekday; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    grid.append(spacer);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cashbook-day-button";
    button.dataset.cashbookDate = dateKey;
    button.classList.toggle("is-selected", state.cashbook.selectedDate === dateKey);
    button.classList.toggle("is-today", localDateKey() === dateKey);
    button.setAttribute("aria-label", `${month} 月 ${day} 日`);
    const markers = [...(eventsByDate.get(dateKey) || [])].slice(0, 4).map((type) => `<i class="is-${escapeHtml(type)}"></i>`).join("");
    button.innerHTML = `<span>${day}</span><b>${markers}</b>`;
    grid.append(button);
  }
}

function cashbookEntryAmount(row) {
  if (row.event_type === "expense") return cashbookMoney(-Math.abs(num(row.original_amount)), row.original_currency);
  if (row.event_type === "income") return cashbookMoney(Math.abs(num(row.original_amount)), row.original_currency, true);
  if (["transfer", "credit_card_payment", "investment_funding_transfer", "investment_recovery_transfer"].includes(row.event_type)) return cashbookMoney(row.source_amount ?? row.original_amount, row.account_currency);
  if (row.event_type === "exchange") return `${cashbookMoney(row.source_amount, row.account_currency)} → ${cashbookMoney(row.destination_amount, cashbookAccount(row.destination_account_id)?.currency || row.original_currency)}`;
  return cashbookMoney(row.destination_amount ?? row.original_amount, row.account_currency || row.original_currency);
}

function cashbookEntryDetail(row) {
  const source = row.source_account_name || cashbookAccount(row.source_account_id)?.name;
  const destination = row.destination_account_name || cashbookAccount(row.destination_account_id)?.name;
  const accountPath = source && destination ? `${source} → ${destination}` : source || destination || "—";
  const details = [accountPath, row.category_name, row.note].filter(Boolean);
  if (row.event_type === "expense" && row.original_currency !== row.account_currency && row.source_amount) {
    details.push(`實扣 ${cashbookMoney(row.source_amount, row.account_currency)}`);
  }
  if (num(row.rate_twd_per_usd) > 0) details.push(`1 ${row.account_currency === "TWD" ? row.original_currency : row.account_currency} = ${num(row.rate_twd_per_usd).toFixed(4)} TWD`);
  return details.join(" · ");
}

function renderCashbookDay() {
  const selectedDate = state.cashbook.selectedDate;
  const list = byId("cashbook-entry-list");
  list.replaceChildren();
  if (!selectedDate) {
    byId("cashbook-selected-date").textContent = "請選擇日期";
    byId("cashbook-entry-count").textContent = "0";
    list.innerHTML = '<div class="empty-state">點日曆中的日期查看帳目</div>';
    return;
  }
  const date = new Date(`${selectedDate}T00:00:00`);
  byId("cashbook-selected-date").textContent = new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(date);
  const rows = state.cashbook.ledger.filter((row) => row.status === "posted" && row.occurred_on === selectedDate);
  byId("cashbook-entry-count").textContent = rows.length;
  byId("cashbook-day-hint").textContent = state.cashbook.armedDate === selectedDate
    ? "再點一次同一天可直接新增；也可以按右上角「記一筆」。"
    : "第一次點日期只顯示當日紀錄。";
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">這一天還沒有帳目</div>';
    return;
  }
  for (const row of rows) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cashbook-entry-row";
    item.dataset.cashbookEventId = row.id;
    const label = cashbookTypeLabels[row.event_type] || row.event_type;
    const merchant = row.merchant || row.category_name || label;
    const tone = row.event_type === "expense" ? "is-expense" : row.event_type === "income" ? "is-income" : "is-transfer";
    item.innerHTML = `<span class="cashbook-entry-type ${tone}">${escapeHtml(label)}</span><span class="cashbook-entry-copy"><strong>${escapeHtml(merchant)}</strong><small>${escapeHtml(cashbookEntryDetail(row))}</small></span><span class="cashbook-entry-value private-number">${escapeHtml(cashbookEntryAmount(row))}<small>點擊修改</small></span>`;
    list.append(item);
  }
}

function cashbookExpenseTwd(row) {
  if (row.status !== "posted" || row.event_type !== "expense") return 0;
  if (row.twd_value !== null && row.twd_value !== undefined && Number.isFinite(Number(row.twd_value))) return Math.abs(Number(row.twd_value));
  if (row.original_currency === "TWD") return Math.abs(num(row.original_amount));
  if (row.account_currency === "TWD") return Math.abs(num(row.source_amount));
  return 0;
}

function renderCashbookSummaries() {
  const selectedDate = state.cashbook.selectedDate || localDateKey();
  const selected = new Date(`${selectedDate}T00:00:00`);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartKey = localDateKey(weekStart);
  const weekEndKey = localDateKey(weekEnd);
  const expenseRows = state.cashbook.ledger.filter((row) => row.status === "posted" && row.event_type === "expense");
  const summaries = [
    ["day", expenseRows.filter((row) => row.occurred_on === selectedDate), `${selectedDate.slice(5).replace("-", "/")} 累計`],
    ["week", expenseRows.filter((row) => row.occurred_on >= weekStartKey && row.occurred_on <= weekEndKey), `${weekStartKey.slice(5).replace("-", "/")}–${weekEndKey.slice(5).replace("-", "/")}`],
    ["month", expenseRows.filter((row) => row.occurred_on.startsWith(state.cashbook.month)), `${state.cashbook.month.replace("-", "/")} 累計`]
  ];
  for (const [key, rows, period] of summaries) {
    byId(`cashbook-${key}-expense`).textContent = cashbookMoney(rows.reduce((sum, row) => sum + cashbookExpenseTwd(row), 0), "TWD");
    byId(`cashbook-${key}-expense-note`).textContent = `${period} · ${rows.length} 筆支出`;
  }
}

function renderCashbook() {
  renderCashbookAccounts();
  renderCashbookCalendar();
  renderCashbookSummaries();
  renderCashbookDay();
  showCashbookView(state.cashbook.view);
}

function shiftCashbookMonth(offset) {
  const [year, month] = state.cashbook.month.split("-").map(Number);
  const shifted = new Date(year, month - 1 + offset, 1);
  state.cashbook.month = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
  state.cashbook.selectedDate = `${state.cashbook.month}-01`;
  state.cashbook.armedDate = "";
  void loadCashbook();
}

function setCashbookFieldVisible(fieldId, visible) {
  byId(fieldId).hidden = !visible;
}

function addAccountOptions(select, groups, selectedValue = "") {
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "請選擇";
  select.append(placeholder);
  for (const group of groups) {
    if (!group.accounts.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const account of group.accounts) {
      const option = document.createElement("option");
      option.value = account.id;
      // Keep sensitive balances out of the native account picker; show the balance only below the selected field.
      option.textContent = `${account.name} · ${account.currency}`;
      option.selected = account.id === selectedValue;
      optgroup.append(option);
    }
    select.append(optgroup);
  }
}

function renderCashbookAccountBalanceHint(selectId, hintId) {
  const account = cashbookAccount(byId(selectId).value);
  const hint = byId(hintId);
  hint.classList.toggle("is-negative", Boolean(account && num(account.balance) < 0));
  hint.classList.toggle("private-number", Boolean(account));
  hint.textContent = account ? `目前餘額 ${cashbookMoney(account.balance, account.currency, true)}` : "選擇帳戶後顯示目前餘額";
}

function refreshCashbookForm({ rebuildOptions = false } = {}) {
  const mode = byId("cashbook-event-type").value;
  const sourceSelect = byId("cashbook-source-account");
  const destinationSelect = byId("cashbook-destination-account");
  const categorySelect = byId("cashbook-category");
  const accounts = state.cashbook.accounts.filter((row) => row.status === "active" && row.account_type !== "investment_bridge");
  const general = accounts.filter((row) => ["cash", "bank", "electronic_payment", "debit_card"].includes(row.account_type));
  const credit = accounts.filter((row) => row.account_type === "credit_card");
  const asset = accounts.filter((row) => row.account_type === "asset_cost");
  if (rebuildOptions) {
    const sourceValue = sourceSelect.value || state.cashbook.editingEvent?.source_account_id || "";
    const destinationValue = destinationSelect.value || state.cashbook.editingEvent?.destination_account_id || "";
    const sourceGroups = mode === "investment_funding_transfer" ? [{ label: "一般資金帳戶", accounts: general }]
      : mode === "investment_recovery_transfer" ? [{ label: "資產成本帳戶", accounts: asset }]
      : mode === "transfer" ? [{ label: "一般資金帳戶", accounts: general }]
      : [{ label: "一般資金帳戶", accounts: general }, { label: "信用卡（負債）", accounts: credit }];
    const destinationGroups = mode === "investment_funding_transfer" ? [{ label: "資產成本帳戶", accounts: asset }]
      : mode === "investment_recovery_transfer" ? [{ label: "一般資金帳戶", accounts: general }]
      : mode === "opening_balance" ? [{ label: "一般資金帳戶", accounts: general }, { label: "信用卡（負債）", accounts: credit }, { label: "資產成本帳戶", accounts: asset }]
      : mode === "income" ? [{ label: "一般資金帳戶", accounts: general }]
      : [{ label: "一般資金帳戶", accounts: general }, { label: "信用卡（負債）", accounts: credit }];
    addAccountOptions(sourceSelect, sourceGroups, sourceValue);
    addAccountOptions(destinationSelect, destinationGroups, destinationValue);
    const categoryType = mode === "expense" ? "expense" : mode === "income" ? "income" : ["investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? "balance" : "";
    const currentCategory = categorySelect.value || state.cashbook.editingEvent?.category_id || "";
    categorySelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = categoryType ? "請選擇品類" : "不適用";
    categorySelect.append(empty);
    const categories = state.cashbook.categories.filter((row) => row.status === "active" && row.category_type === categoryType && (mode !== "investment_funding_transfer" || row.name === "資產投入") && (mode !== "investment_recovery_transfer" || row.name === "資產回收"));
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      option.selected = category.id === currentCategory;
      categorySelect.append(option);
    }
    if (["investment_funding_transfer", "investment_recovery_transfer"].includes(mode) && categories.length === 1) categorySelect.value = categories[0].id;
  }
  const source = cashbookAccount(sourceSelect.value);
  const destination = cashbookAccount(destinationSelect.value);
  renderCashbookAccountBalanceHint("cashbook-source-account", "cashbook-source-balance");
  renderCashbookAccountBalanceHint("cashbook-destination-account", "cashbook-destination-balance");
  const isExpense = mode === "expense";
  const isIncome = mode === "income";
  const isTransfer = mode === "transfer";
  const isFunding = mode === "investment_funding_transfer";
  const isRecovery = mode === "investment_recovery_transfer";
  const isOpening = mode === "opening_balance";
  const selectedAccount = isExpense ? source : isIncome || isOpening ? destination : null;
  const originalCurrency = byId("cashbook-original-currency").value;
  const crossCurrency = isTransfer && source && destination && source.currency !== destination.currency;
  const differentCurrency = (isExpense || isIncome) && selectedAccount && originalCurrency !== selectedAccount.currency;
  const isProperty = isFunding && destination?.asset_class === "real_estate";
  const existingProperty = Boolean(state.cashbook.editingEvent?.source_payload?.property_related);

  setCashbookFieldVisible("cashbook-merchant-field", isExpense || isIncome || isFunding || isRecovery);
  setCashbookFieldVisible("cashbook-source-field", isExpense || isTransfer || isFunding || isRecovery);
  setCashbookFieldVisible("cashbook-destination-field", isIncome || isTransfer || isOpening || isFunding || isRecovery);
  setCashbookFieldVisible("cashbook-category-field", isExpense || isIncome);
  setCashbookFieldVisible("cashbook-recovery-field", isProperty || (existingProperty && !isIncome));
  setCashbookFieldVisible("cashbook-currency-field", isExpense || isIncome);
  setCashbookFieldVisible("cashbook-settled-field", Boolean(differentCurrency));
  setCashbookFieldVisible("cashbook-received-field", Boolean(crossCurrency));
  if (isRecovery) byId("cashbook-has-fee").checked = false;
  setCashbookFieldVisible("cashbook-fee-toggle-field", !isOpening && !isRecovery);
  setCashbookFieldVisible("cashbook-fee-field", !isOpening && !isRecovery && byId("cashbook-has-fee").checked);
  byId("cashbook-merchant-label").textContent = isExpense ? "商家／對象" : isIncome ? "收入來源／對象" : "資產／標的（選填）";
  byId("cashbook-source-label").textContent = isExpense ? "付款帳戶" : isFunding ? "資金來源帳戶" : isRecovery ? "資產成本帳戶" : "轉出帳戶";
  byId("cashbook-destination-label").textContent = isIncome ? "入帳帳戶" : isOpening ? "初始化帳戶" : isFunding ? "資產成本帳戶" : isRecovery ? "實際收款帳戶" : "轉入帳戶";
  byId("cashbook-amount-label").textContent = isFunding ? `投入金額${source ? `（${source.currency}）` : ""}` : isRecovery ? `實際淨收款${source ? `（${source.currency}）` : ""}` : isTransfer ? `轉出金額${source ? `（${source.currency}）` : ""}` : isOpening ? `初始化金額${destination ? `（${destination.currency}）` : ""}` : `${isExpense && originalCurrency === "TWD" && usdEquivalentCurrencies.has(source?.currency) ? "現場消費" : isExpense ? "消費" : "收入"}金額（${originalCurrency}）`;
  byId("cashbook-settled-label").textContent = `${isExpense ? source?.account_type === "credit_card" ? "信用卡" : "帳戶" : "帳戶"}實際${isExpense ? "扣款" : "入帳"}（${selectedAccount?.currency || ""}）`;
  byId("cashbook-received-label").textContent = `轉入實收（${destination?.currency || ""}）`;

  const amount = num(byId("cashbook-original-amount").value);
  const settled = num(byId("cashbook-settled-amount").value);
  const received = num(byId("cashbook-received-amount").value);
  const fee = byId("cashbook-has-fee").checked ? num(byId("cashbook-fee-amount").value) : 0;
  let title = "選擇帳戶並輸入金額後自動計算";
  let note = "交易匯率與有效匯率不需要手動輸入。";
  if (crossCurrency && amount > 0 && received > 0) {
    const rate = source.currency === "TWD" ? amount / received : destination.currency === "TWD" ? received / amount : received / amount;
    title = source.currency === "TWD" || destination.currency === "TWD" ? `本筆換匯 · 1 ${source.currency === "TWD" ? destination.currency : source.currency} = ${rate.toFixed(4)} TWD` : `兌換比率 · 1 ${source.currency} = ${rate.toFixed(4)} ${destination.currency}`;
    note = source.currency === "TWD" ? `含費用有效匯率 ${((amount + fee) / received).toFixed(4)} TWD。` : "兩端實際金額會保留，不以最新匯率回填。";
  } else if (isExpense && differentCurrency && amount > 0 && settled > 0 && originalCurrency === "TWD" && usdEquivalentCurrencies.has(source?.currency)) {
    title = `本筆刷卡匯率 · 1 ${source.currency} = ${(amount / settled).toFixed(4)} TWD`;
    note = `${cashbookMoney(amount, "TWD")} ÷ ${cashbookMoney(settled, source.currency)}；${fee > 0 ? `含費用有效匯率 ${(amount / (settled + fee)).toFixed(4)} TWD。` : "由現場台幣金額與實扣外幣自動計算。"}`;
  } else if ((isExpense || isIncome) && differentCurrency && amount > 0 && settled > 0 && selectedAccount?.currency === "TWD") {
    title = `本筆交易匯率 · 1 ${originalCurrency} = ${(settled / amount).toFixed(4)} TWD`;
    note = "依原始交易金額與帳戶實際入扣金額推導。";
  } else if (isFunding && source && destination && amount > 0) {
    title = `資產成本增加 ${cashbookMoney(amount, source.currency)}`;
    note = isProperty ? byId("cashbook-property-recovery").value === "recoverable" ? "列為賣房時可回收本金。" : byId("cashbook-property-recovery").value === "non_recoverable" ? "列為費用／不保證回收成本。" : "請選擇房地產成本回收屬性。" : "不列入生活收入或支出。";
  } else if (isRecovery && source && destination && amount > 0) {
    title = `資產回收 ${cashbookMoney(amount, source.currency)}`;
    note = `${cashbookAssetClassLabels[source.asset_class] || "資產"}淨投入減少、${destination.name} 增加；請填寫已扣除投資費用與稅額的實際淨收款。`;
  } else if (isOpening) {
    title = "初始化只調整帳戶餘額";
    note = "不列入收入、支出或消費趨勢。";
  } else if (selectedAccount && amount > 0) {
    title = `${isExpense ? "支出" : "收入"} ${cashbookMoney(amount, originalCurrency)}`;
    note = differentCurrency ? "請再輸入帳戶實際入扣金額。" : "帳戶與交易幣別相同，不需要匯率。";
  }
  byId("cashbook-calculation-title").textContent = title;
  byId("cashbook-calculation-note").textContent = note;
}

function openCashbookForm(existing = null, occurredOn = state.cashbook.selectedDate || localDateKey()) {
  if (!state.cashbook.loaded) return;
  state.cashbook.editingEvent = existing;
  const form = byId("cashbook-form");
  form.reset();
  const initialMode = ["exchange", "credit_card_payment"].includes(existing?.event_type) ? "transfer" : existing?.event_type || "expense";
  byId("cashbook-form-title").textContent = existing ? "編輯帳目" : "新增帳目";
  byId("cashbook-event-type").value = initialMode;
  byId("cashbook-occurred-on").value = existing?.occurred_on || occurredOn;
  byId("cashbook-merchant").value = existing?.merchant || "";
  byId("cashbook-original-currency").value = existing?.original_currency || "TWD";
  byId("cashbook-original-amount").value = existing?.original_amount || "";
  byId("cashbook-settled-amount").value = existing?.event_type === "expense" ? existing.source_amount || "" : existing?.event_type === "income" ? existing.destination_amount || "" : "";
  byId("cashbook-received-amount").value = existing?.event_type === "exchange" ? existing.destination_amount || "" : "";
  byId("cashbook-has-fee").checked = num(existing?.fee_amount) > 0;
  byId("cashbook-fee-amount").value = existing?.fee_amount || 0;
  byId("cashbook-note").value = existing?.note || "";
  byId("cashbook-property-recovery").value = existing?.source_payload?.property_cost_recovery || "";
  byId("cashbook-form-status").textContent = "";
  byId("cashbook-void-button").hidden = !existing;
  refreshCashbookForm({ rebuildOptions: true });
  byId("cashbook-sheet").hidden = false;
  state.sheetScrollY = window.scrollY;
  document.body.style.top = `-${state.sheetScrollY}px`;
  document.body.classList.add("sheet-open");
}

function closeCashbookForm() {
  byId("cashbook-sheet").hidden = true;
  document.body.classList.remove("sheet-open");
  document.body.style.top = "";
  window.scrollTo({ top: state.sheetScrollY, behavior: "auto" });
  state.cashbook.editingEvent = null;
}

async function saveCashbookEvent(event) {
  event.preventDefault();
  const existing = state.cashbook.editingEvent;
  const mode = byId("cashbook-event-type").value;
  const source = cashbookAccount(byId("cashbook-source-account").value);
  const destination = cashbookAccount(byId("cashbook-destination-account").value);
  const originalCurrency = byId("cashbook-original-currency").value;
  const amount = num(byId("cashbook-original-amount").value);
  const settled = num(byId("cashbook-settled-amount").value);
  const received = num(byId("cashbook-received-amount").value);
  const fee = byId("cashbook-has-fee").checked ? num(byId("cashbook-fee-amount").value) : 0;
  const crossCurrency = mode === "transfer" && source && destination && source.currency !== destination.currency;
  const storedType = mode === "transfer" ? crossCurrency ? "exchange" : destination?.account_type === "credit_card" ? "credit_card_payment" : "transfer" : mode;
  const accountCurrency = source?.currency || destination?.currency || originalCurrency;
  const storedOriginalCurrency = ["investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? source?.currency : mode === "transfer" ? source?.currency : mode === "opening_balance" ? destination?.currency : originalCurrency;
  const sourceAmount = mode === "expense" ? (originalCurrency === source?.currency ? amount : settled) : ["transfer", "investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? amount : null;
  const destinationAmount = mode === "income" ? (originalCurrency === destination?.currency ? amount : settled) : mode === "opening_balance" ? amount : mode === "transfer" ? (crossCurrency ? received : amount) : ["investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? amount : null;
  const propertyRelated = mode === "investment_funding_transfer"
    ? destination?.asset_class === "real_estate"
    : Boolean(existing?.source_payload?.property_related);
  const recovery = byId("cashbook-property-recovery").value;
  const status = byId("cashbook-form-status");
  if (!(amount > 0)) return void (status.textContent = "請輸入大於 0 的金額");
  if (mode === "expense" && (!source || !byId("cashbook-category").value || !(sourceAmount > 0))) return void (status.textContent = "請選擇付款帳戶、支出品類並完成金額");
  if (mode === "income" && (!destination || !byId("cashbook-category").value || !(destinationAmount > 0))) return void (status.textContent = "請選擇入帳帳戶、收入品類並完成金額");
  if (mode === "transfer" && (!source || !destination || source.id === destination.id || !(destinationAmount > 0))) return void (status.textContent = "請選擇不同的轉出、轉入帳戶並完成金額");
  if (mode === "investment_funding_transfer" && (!source || !destination || destination.account_type !== "asset_cost" || source.currency !== destination.currency || !byId("cashbook-category").value)) return void (status.textContent = "請選擇同幣別的資金來源與資產成本帳戶");
  if (mode === "investment_recovery_transfer" && (!source || !destination || source.account_type !== "asset_cost" || ["credit_card", "asset_cost", "investment_bridge"].includes(destination.account_type) || source.currency !== destination.currency || !byId("cashbook-category").value || fee !== 0)) return void (status.textContent = "請選擇同幣別的資產成本帳戶與實際收款帳戶，並直接填寫已扣費稅的淨收款");
  if (mode === "opening_balance" && !destination) return void (status.textContent = "請選擇初始化帳戶");
  if ((mode === "expense" || mode === "income") && originalCurrency !== accountCurrency && !(settled > 0)) return void (status.textContent = `請輸入帳戶實際${mode === "expense" ? "扣款" : "入帳"}金額`);
  if (crossCurrency && !(received > 0)) return void (status.textContent = "請輸入轉入帳戶實收金額");
  if (propertyRelated && mode !== "income" && !recovery) return void (status.textContent = "請選擇房地產成本回收屬性");
  const pooledCostFx = num(state.data?.pooledCostFx);
  if (mode === "opening_balance" && usdEquivalentCurrencies.has(destination.currency) && destination.account_type !== "credit_card" && !(pooledCostFx > 0)) return void (status.textContent = `投資資料尚無美元成本，暫時無法初始化 ${destination.currency}`);
  let rate = null;
  let effectiveRate = null;
  if ((mode === "expense" || mode === "income") && usdEquivalentCurrencies.has(originalCurrency) && accountCurrency === "TWD" && amount > 0 && settled > 0) {
    rate = settled / amount;
    effectiveRate = mode === "income" ? Math.max(settled - fee, 0) / amount : (settled + fee) / amount;
  } else if (mode === "expense" && originalCurrency === "TWD" && usdEquivalentCurrencies.has(accountCurrency) && amount > 0 && settled > 0) {
    rate = amount / settled;
    effectiveRate = amount / (settled + fee);
  }
  const saveButton = byId("cashbook-save-button");
  saveButton.disabled = true;
  status.textContent = "儲存中…";
  try {
    const occurredOn = byId("cashbook-occurred-on").value;
    await cashbookRpc("cashbook_event_save", {
      p_id: existing?.id || null,
      p_event_type: storedType,
      p_occurred_on: occurredOn,
      p_merchant: byId("cashbook-merchant").value.trim() || null,
      p_category_id: ["expense", "income", "investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? byId("cashbook-category").value || null : null,
      p_source_account_id: ["expense", "transfer", "investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? source?.id || null : null,
      p_destination_account_id: ["income", "transfer", "opening_balance", "investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? destination?.id || null : null,
      p_original_amount: amount,
      p_original_currency: storedOriginalCurrency,
      p_account_currency: accountCurrency,
      p_source_amount: sourceAmount,
      p_destination_amount: destinationAmount,
      p_fee_amount: fee,
      p_fee_currency: accountCurrency,
      p_rate_twd_per_usd: rate,
      p_effective_rate_twd_per_usd: effectiveRate,
      p_fx_evidence_status: crossCurrency || ((mode === "expense" || mode === "income") && originalCurrency !== accountCurrency) ? "derived" : "missing",
      p_twd_value: ["investment_funding_transfer", "investment_recovery_transfer"].includes(mode) ? accountCurrency === "TWD" ? amount : pooledCostFx > 0 ? amount * pooledCostFx : null : mode === "expense" && originalCurrency === "TWD" && usdEquivalentCurrencies.has(accountCurrency) ? amount : null,
      p_usd_cost_rate_twd_per_usd: mode === "opening_balance" && usdEquivalentCurrencies.has(destination?.currency) && destination?.account_type !== "credit_card" ? pooledCostFx : null,
      p_usd_cost_twd: null,
      p_realized_fx_pnl_twd: null,
      p_investment_target: mode === "investment_funding_transfer" ? destination?.asset_class || null : mode === "investment_recovery_transfer" ? source?.asset_class || null : null,
      p_bridge_event_id: null,
      p_note: byId("cashbook-note").value.trim() || null,
      p_source_system: "dashboard_manual",
      p_source_payload: {
        ...(existing?.source_payload || {}),
        ui: "investment_mobile",
        asset_recovery_basis: mode === "investment_recovery_transfer" ? "net_sale_proceeds" : null,
        property_related: propertyRelated,
        property_cost_recovery: propertyRelated && mode !== "income" ? recovery : null
      },
      p_idempotency_key: existing?.idempotency_key || `mobile:${crypto.randomUUID()}`
    });
    state.cashbook.month = occurredOn.slice(0, 7);
    state.cashbook.selectedDate = occurredOn;
    state.cashbook.armedDate = "";
    closeCashbookForm();
    showToast(existing ? "帳目已更新" : "帳目已儲存");
    await loadCashbook();
  } catch (error) {
    status.textContent = error instanceof Error ? `儲存失敗：${error.message}` : "儲存失敗";
  } finally {
    saveButton.disabled = false;
  }
}

async function voidCashbookEvent() {
  const existing = state.cashbook.editingEvent;
  if (!existing || !window.confirm("確定作廢這筆帳目？帳目會保留稽核紀錄，但不再計入餘額。")) return;
  const button = byId("cashbook-void-button");
  button.disabled = true;
  byId("cashbook-form-status").textContent = "處理中…";
  try {
    await cashbookRpc("cashbook_event_delete", { p_id: existing.id });
    closeCashbookForm();
    showToast("帳目已作廢");
    await loadCashbook();
  } catch (error) {
    byId("cashbook-form-status").textContent = error instanceof Error ? `作廢失敗：${error.message}` : "作廢失敗";
  } finally {
    button.disabled = false;
  }
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
    if (state.transactionAssetId && row.asset_id !== state.transactionAssetId) return false;
    if (state.transactionType !== "all" && row.transaction_type !== state.transactionType) return false;
    if (!query) return true;
    const asset = state.data.assetsById.get(row.asset_id) || {};
    return [asset.symbol, asset.name].some((value) => String(value || "").toLocaleLowerCase("zh-Hant").includes(query));
  });
  byId("transaction-count").textContent = transactions.length;
  byId("transaction-filter-note").textContent = state.transactionAssetId
    ? `找到 ${transactions.length} 筆 ${state.data.assetsById.get(state.transactionAssetId)?.symbol || "該標的"} 的成交紀錄`
    : query
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
    const grossAmount = Math.abs(num(row.gross_amount));
    const charges = transactionCharges(row);
    const grossLabel = isSell ? "賣出金額" : row.transaction_type === "buy" ? "買入金額" : "交易金額";
    item.innerHTML = `
      <span class="transaction-type ${isSell ? "is-sell" : ""}">${escapeHtml(label)}</span>
      <span class="transaction-copy"><strong>${escapeHtml(asset.symbol || "—")} · ${escapeHtml(asset.name || "未命名標的")}</strong><small>${shortDate(row.trade_date)} · ${escapeHtml(row.settlement_currency)}</small><small class="transaction-costs private-number">手續費 ${money(row.fee_amount || 0, row.settlement_currency)} · 稅 ${money(row.tax_amount || 0, row.settlement_currency)}</small></span>
      <span class="transaction-amount"><strong class="private-number">${quantity(row.quantity, asset.quantity_scale)} ${escapeHtml(asset.quantity_unit || "")}</strong><small class="private-number">每股 ${row.unit_price === null ? "無" : perSharePrice(row.unit_price, row.settlement_currency, asset.asset_class)}</small><small class="transaction-gross private-number">${grossLabel} ${money(grossAmount, row.settlement_currency)}</small><small class="transaction-charge-total private-number">費用合計 ${money(charges, row.settlement_currency)}</small><small class="transaction-cashflow private-number">${transactionCashflowLabel(row)}</small></span>`;
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
  const marketLabels = [
    ["台股", data.marketUpdates.tw_equity],
    ["美股", data.marketUpdates.us_equity],
    ["加密", data.marketUpdates.crypto]
  ].filter(([, value]) => value).map(([label, value]) => `${label} ${dateTime(value)}`);
  byId("data-updated-at").textContent = `${marketLabels.join(" · ")}${data.stalePriceCount ? ` · ${data.stalePriceCount} 檔過期` : ""}`;
  byId("user-email").textContent = state.userEmail || "已登入";
  byId("total-assets").textContent = overviewMoney(data.totalAssetsTwd);
  byId("total-assets-note").textContent = "四類資產合計";
  const overviewGroups = Object.fromEntries(data.groups.map((group) => [group.key, group]));
  for (const [key, valueId, noteId] of [
    ["traditional", "traditional-assets", "traditional-pnl-note"],
    ["cash", "cash-assets", "cash-pnl-note"],
    ["crypto", "crypto-assets", "crypto-pnl-note"],
    ["property", "property-assets", "property-pnl-note"]
  ]) {
    const group = overviewGroups[key];
    byId(valueId).textContent = overviewMoney(group?.valueTwd || 0);
    byId(noteId).textContent = `累積總損益 ${overviewMoney(group?.totalPnlTwd || 0, true)}`;
    setTone(byId(noteId), group?.totalPnlTwd || 0);
  }
  byId("usd-fx-rate").textContent = `${data.currentFx.toFixed(2)} TWD / USD`;
  byId("usd-fx-note").textContent = `匯兌損益 ${overviewMoney(data.usdFxPnlTwd, true)}`;
  setTone(byId("usd-fx-note"), data.usdFxPnlTwd);
  byId("usd-fx-time").textContent = data.usdFxUpdatedAt ? `行情時間 ${dateTime(data.usdFxUpdatedAt)}` : "行情時間待同步";
  byId("current-cash").textContent = money(data.cashValueTwd);
  byId("current-cash-note").textContent = data.cashCurrencies.length ? data.cashCurrencies.join(" · ") : "尚未填寫目前現金";
  byId("running-grid-count").textContent = data.runningGridCount ? `${data.runningGridCount} 組` : "目前沒有";
  byId("running-grid-pnl").textContent = data.runningGridCount ? `總損益 ${money(data.runningGridPnlUsd, "USDT", true)}` : "—";
  setTone(byId("running-grid-pnl"), data.runningGridPnlUsd);

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

  renderExposure();

}

const exposurePalette = ["#9cff57", "#54d6a8", "#55a7ff", "#b58cff", "#f0c66c", "#ff8a8a", "#70d6ff", "#a7b28d", "#d7ff8c", "#7e8bff"];

function exposureItems() {
  const data = state.data;
  const level = state.exposureLevel;
  const items = data.positions
    .filter((row) => num(row.marketValueTwd) > 0)
    .map((row) => ({
      label: row[level] || (level === "primarySector" ? "其他／待分類" : "未分類"),
      subTheme: row.subTheme || "未分類",
      symbol: row.displaySymbol || row.symbol,
      name: row.name,
      valueTwd: num(row.marketValueTwd)
    }));
  for (const cash of data.cashBalances.filter((row) => Math.abs(row.valueTwd) > 0)) {
    const currency = String(cash.currency || "").toUpperCase();
    items.push({
      label: level === "primarySector" ? "現金（含台幣、美元與穩定幣）" : currency,
      subTheme: currency,
      symbol: currency,
      name: ({ TWD: "台幣現金", USD: "美元現金", USDC: "USDC 穩定幣", USDT: "USDT 穩定幣" })[currency] || `${currency} 現金`,
      valueTwd: num(cash.valueTwd),
      isCash: true
    });
  }
  const gridGroup = data.groups.find((group) => group.key === "crypto");
  const spotCryptoValue = data.positions.filter((row) => row.assetClass === "crypto").reduce((sum, row) => sum + num(row.marketValueTwd), 0);
  const gridValue = Math.max(0, num(gridGroup?.valueTwd) - spotCryptoValue);
  if (gridValue) items.push({ label: level === "primarySector" ? "網格策略" : "合約網格", subTheme: "合約網格", symbol: "GRID", name: "運行中與已關閉策略淨值", valueTwd: gridValue });
  if (data.propertyValueTwd > 0) items.push({ label: level === "primarySector" ? "房地產" : "房屋與車位", subTheme: "房屋與車位", symbol: "PROPERTY", name: "已付可回收本金＋預估獲利", valueTwd: data.propertyValueTwd });
  return items;
}

function renderExposure() {
  const items = exposureItems();
  const grouped = new Map();
  for (const item of items) {
    const group = grouped.get(item.label) || { label: item.label, valueTwd: 0, members: [] };
    group.valueTwd += item.valueTwd;
    group.members.push(item);
    grouped.set(item.label, group);
  }
  const groups = [...grouped.values()].filter((group) => group.valueTwd > 0).sort((a, b) => b.valueTwd - a.valueTwd);
  const total = groups.reduce((sum, group) => sum + group.valueTwd, 0);
  if (!state.selectedExposure || !grouped.has(state.selectedExposure)) state.selectedExposure = groups[0]?.label || "";
  document.querySelectorAll("[data-exposure-level]").forEach((button) => button.classList.toggle("is-active", button.dataset.exposureLevel === state.exposureLevel));

  const summary = byId("exposure-summary");
  const selected = groups.find((group) => group.label === state.selectedExposure) || groups[0];
  summary.innerHTML = selected ? `<span><small>目前選取</small><strong>${escapeHtml(selected.label)}</strong></span><b class="private-number">${(selected.valueTwd / total * 100).toFixed(1)}%</b>` : '<span>目前沒有可分類的資產市值</span>';

  const list = byId("exposure-list");
  list.replaceChildren();
  groups.forEach((group, index) => {
    const pct = total > 0 ? group.valueTwd / total * 100 : 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `exposure-row${group.label === state.selectedExposure ? " is-active" : ""}`;
    button.dataset.exposureGroup = group.label;
    button.innerHTML = `<i style="--exposure-color:${exposurePalette[index % exposurePalette.length]}"></i><span><strong>${escapeHtml(group.label)}</strong><small class="private-number">${overviewMoney(group.valueTwd)}</small></span><b class="private-number">${pct.toFixed(1)}%</b>`;
    list.append(button);
  });

  const detail = byId("exposure-detail");
  detail.replaceChildren();
  if (selected) {
    const head = document.createElement("div");
    head.className = "exposure-detail-head";
    head.innerHTML = `<strong>${escapeHtml(selected.label)}</strong><span>${selected.members.length} 個項目 · <span class="private-number">${overviewMoney(selected.valueTwd)}</span></span>`;
    detail.append(head);
    const members = document.createElement("div");
    members.className = "exposure-members";
    [...selected.members].sort((a, b) => b.valueTwd - a.valueTwd).forEach((member) => {
      const row = document.createElement("div");
      row.className = "exposure-member";
      row.innerHTML = `<span><strong>${escapeHtml(member.symbol)}</strong><small>${escapeHtml(member.name || "")}</small></span><span><b class="private-number">${overviewMoney(member.valueTwd)}</b><small>${total > 0 ? (member.valueTwd / total * 100).toFixed(2) : "0.00"}%</small></span>`;
      members.append(row);
    });
    detail.append(members);
  }
  const difference = total - state.data.totalAssetsTwd;
  const warning = byId("exposure-warning");
  warning.hidden = Math.abs(difference) < 1;
  warning.textContent = warning.hidden ? "" : `分類合計與總資產相差 ${overviewMoney(difference, true)}，請確認行情時間。`;
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
  const tabHeadings = {
    overview: ["INVESTMENTS / SUPABASE", "投資總覽"],
    positions: ["PORTFOLIO", "持倉"],
    cashbook: ["DAILY CASHBOOK", "日常記帳"],
    activity: ["INVESTMENT LEDGER", "投資帳本"],
  };
  const [eyebrow, title] = tabHeadings[tabName] || tabHeadings.overview;
  byId("dashboard-eyebrow").textContent = eyebrow;
  byId("dashboard-title").textContent = title;
  dashboardView.dataset.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== tabName; });
  if (tabName === "cashbook" && !state.cashbook.loaded && !state.cashbook.loading) void loadCashbook();
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

document.querySelectorAll(".tab[data-tab]").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
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
  state.transactionAssetId = "";
  state.transactionQuery = event.target.value;
  renderActivity();
});

byId("clear-transaction-search").addEventListener("click", () => {
  state.transactionAssetId = "";
  state.transactionQuery = "";
  byId("transaction-search").value = "";
  byId("transaction-search").focus();
  renderActivity();
});

document.addEventListener("click", (event) => {
  const exposureLevel = event.target.closest("[data-exposure-level]");
  if (exposureLevel) {
    state.exposureLevel = exposureLevel.dataset.exposureLevel;
    state.selectedExposure = "";
    renderExposure();
    return;
  }
  const exposureGroup = event.target.closest("[data-exposure-group]");
  if (exposureGroup) {
    state.selectedExposure = exposureGroup.dataset.exposureGroup;
    renderExposure();
    return;
  }
  const calendarDate = event.target.closest("[data-cashbook-date]");
  if (calendarDate) {
    const dateKey = calendarDate.dataset.cashbookDate;
    if (state.cashbook.selectedDate === dateKey && state.cashbook.armedDate === dateKey) {
      openCashbookForm(null, dateKey);
    } else {
      state.cashbook.selectedDate = dateKey;
      state.cashbook.armedDate = dateKey;
      renderCashbookCalendar();
      renderCashbookSummaries();
      renderCashbookDay();
    }
    return;
  }
  const cashbookRow = event.target.closest("[data-cashbook-event-id]");
  if (cashbookRow) {
    const record = cashbookEvent(cashbookRow.dataset.cashbookEventId);
    if (record) openCashbookForm(record, record.occurred_on);
    return;
  }
  const button = event.target.closest("[data-asset-ledger]");
  if (!button) return;
  state.transactionAssetId = button.dataset.assetLedger || "";
  state.transactionQuery = button.dataset.symbol || "";
  state.transactionType = button.dataset.transactionType || "all";
  byId("transaction-search").value = state.transactionQuery;
  document.querySelectorAll("#transaction-filters .filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.transactionType === state.transactionType));
  renderActivity();
  showTab("activity");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

byId("cashbook-prev-month").addEventListener("click", () => shiftCashbookMonth(-1));
byId("cashbook-next-month").addEventListener("click", () => shiftCashbookMonth(1));
byId("mobile-cashbook-add").addEventListener("click", async () => {
  if (!state.cashbook.loaded && !state.cashbook.loading) await loadCashbook();
  showTab("cashbook");
  if (state.cashbook.loaded) openCashbookForm();
});
document.querySelectorAll("[data-cashbook-view]").forEach((button) => button.addEventListener("click", () => showCashbookView(button.dataset.cashbookView)));
byId("cashbook-close-button").addEventListener("click", closeCashbookForm);
byId("cashbook-sheet").addEventListener("click", (event) => { if (event.target === byId("cashbook-sheet")) closeCashbookForm(); });
byId("cashbook-form").addEventListener("submit", saveCashbookEvent);
byId("cashbook-void-button").addEventListener("click", voidCashbookEvent);
byId("cashbook-event-type").addEventListener("change", () => refreshCashbookForm({ rebuildOptions: true }));
byId("cashbook-source-account").addEventListener("change", () => {
  const source = cashbookAccount(byId("cashbook-source-account").value);
  if (!state.cashbook.editingEvent && byId("cashbook-event-type").value === "expense" && source) {
    byId("cashbook-original-currency").value = usdEquivalentCurrencies.has(source.currency) ? "TWD" : source.currency;
  }
  refreshCashbookForm();
});
for (const id of ["cashbook-destination-account", "cashbook-category", "cashbook-property-recovery", "cashbook-original-currency", "cashbook-original-amount", "cashbook-settled-amount", "cashbook-received-amount", "cashbook-has-fee", "cashbook-fee-amount"]) {
  byId(id).addEventListener("change", () => refreshCashbookForm());
  byId(id).addEventListener("input", () => refreshCashbookForm());
}

refreshButton.addEventListener("click", () => state.activeTab === "cashbook" ? loadCashbook() : loadDashboard());
byId("retry-button").addEventListener("click", loadDashboard);
byId("sign-out-button").addEventListener("click", () => {
  clearSession();
  state.data = null;
  state.cashbook.loaded = false;
  state.cashbook.accounts = [];
  state.cashbook.categories = [];
  state.cashbook.ledger = [];
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
