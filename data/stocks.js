window.dashboardData = {
  snapshotDate: "2026-05-22",
  updatedDate: "2026-05-26",
  footerNote:
    "價格與位階為 2026-05-22 美股收盤快照；更新日期為 2026-05-26。後續 daily refresh 只需更新這份資料檔。",
  summaryCards: [
    {
      title: "可以先分批的穩健區",
      body: "MSFT、SPGI、BKNG 目前是最像樣的第一梯隊。位階不高，基本面又夠穩，適合先建觀察倉。",
      tags: ["MSFT", "SPGI", "BKNG", "A 級優先"],
    },
    {
      title: "修正後可看的 AI 電力鏈",
      body: "CEG、VST、ETN 都還在題材主線上，但進場策略要偏回檔承接，不是追價。尤其 ETN 比較需要等更好價差。",
      tags: ["CEG", "VST", "ETN", "回檔承接"],
    },
    {
      title: "高波動題材區",
      body: "COIN、HOOD、CRCL、LEU、OKLO 都只適合小倉位。這些標的不是不能碰，而是要先假設波動比想像大。",
      tags: ["Spec", "小倉位", "高波動"],
    },
  ],
  stocks: [
    { ticker: "MSFT", company: "Microsoft", price: "418.57", positionPercent: "31.3%", verdict: "位階中低，可分批", entryZone: "405-420", addZone: "385-400", riskNote: "基本面最穩，380 以下更便宜", priority: "A" },
    { ticker: "SPGI", company: "S&P Global", price: "417.60", positionPercent: "18.2%", verdict: "位階偏低，可分批", entryZone: "410-420", addZone: "395-405", riskNote: "高品質現金流股，390 以下偏甜", priority: "A" },
    { ticker: "BKNG", company: "Booking Holdings", price: "161.06", positionPercent: "13.1%", verdict: "接近區間低位，可分批", entryZone: "158-163", addZone: "152-157", riskNote: "150 以下很值得看", priority: "A" },
    { ticker: "CEG", company: "Constellation Energy", price: "294.07", positionPercent: "30.0%", verdict: "修正後可分批", entryZone: "285-300", addZone: "270-280", riskNote: "310 以上不追", priority: "A-" },
    { ticker: "VST", company: "Vistra", price: "156.27", positionPercent: "27.1%", verdict: "修正後可分批", entryZone: "150-158", addZone: "142-148", riskNote: "140 以下風報比佳", priority: "A-" },
    { ticker: "ETN", company: "Eaton", price: "391.35", positionPercent: "64.3%", verdict: "基本面強，等更好價差", entryZone: "380-390", addZone: "360-375", riskNote: "400 以上不建議追", priority: "B+" },
    { ticker: "CCJ", company: "Cameco", price: "104.75", positionPercent: "63.5%", verdict: "中位偏上，等回檔", entryZone: "100-106", addZone: "92-98", riskNote: "110 以上偏等", priority: "B" },
    { ticker: "BWXT", company: "BWX Technologies", price: "202.91", positionPercent: "71.3%", verdict: "品質不差，但不便宜", entryZone: "185-195", addZone: "175-185", riskNote: "200 以上不追", priority: "B" },
    { ticker: "GOOGL", company: "Alphabet", price: "382.97", positionPercent: "89.6%", verdict: "高位，可小量試單", entryZone: "375-385", addZone: "350-365", riskNote: "基本面強，但位階已高", priority: "B-" },
    { ticker: "AVGO", company: "Broadcom", price: "414.14", positionPercent: "86.9%", verdict: "接近高位，不追", entryZone: "385-400", addZone: "370-385", riskNote: "AI 強，但估值已高", priority: "B-" },
    { ticker: "ASML", company: "ASML Holding", price: "1632.90", positionPercent: "97.9%", verdict: "接近新高，不追", entryZone: "1500-1560", addZone: "1400-1475", riskNote: "幾乎在 52 週高位", priority: "C+" },
    { ticker: "COIN", company: "Coinbase", price: "184.99", positionPercent: "14.9%", verdict: "高波動，只能小倉位", entryZone: "175-185", addZone: "160-170", riskNote: "155 附近更好", priority: "Spec" },
    { ticker: "HOOD", company: "Robinhood", price: "73.64", positionPercent: "12.1%", verdict: "高波動，可小量", entryZone: "72-76", addZone: "66-70", riskNote: "65 以下更舒服", priority: "Spec" },
    { ticker: "CRCL", company: "Circle", price: "113.12", positionPercent: "25.4%", verdict: "新股型態，輕倉試", entryZone: "105-115", addZone: "90-100", riskNote: "120 以上不追", priority: "Spec" },
    { ticker: "LEU", company: "Centrus Energy", price: "179.36", positionPercent: "23.7%", verdict: "高波動，極小倉位", entryZone: "165-180", addZone: "145-160", riskNote: "不要重壓", priority: "Spec" },
    { ticker: "OKLO", company: "Oklo", price: "65.88", positionPercent: "19.0%", verdict: "概念股，小試即可", entryZone: "60-66", addZone: "52-58", riskNote: "沒回檔不追", priority: "Spec" },
  ],
};
