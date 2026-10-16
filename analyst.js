// Argus analyst layer: asset & macro catalogs, per-direction briefs, analyst prompt.
import { yahooDaily, fredSeries, treasuryDebt, treasuryAvgRate, priceStats, macroStats, correlation, shiftDate } from "./markets.js";

// ---------- catalogs ----------
// yahoo: primary source; fred: fallback series (may differ, see note).
export const ASSETS = {
  gold: { name: "Gold (COMEX front-month)", yahoo: "GC=F", kind: "price" },
  silver: { name: "Silver (COMEX)", yahoo: "SI=F", kind: "price" },
  dxy: { name: "US Dollar Index (DXY)", yahoo: "DX-Y.NYB", fred: "DTWEXBGS", fredNote: "fallback is the Fed broad trade-weighted dollar index, not DXY", kind: "price" },
  eurusd: { name: "EUR/USD", yahoo: "EURUSD=X", fred: "DEXUSEU", kind: "price" },
  usdjpy: { name: "USD/JPY", yahoo: "JPY=X", fred: "DEXJPUS", kind: "price" },
  usdcny: { name: "USD/CNY", yahoo: "CNY=X", fred: "DEXCHUS", kind: "price" },
  btc: { name: "Bitcoin (USD)", yahoo: "BTC-USD", fred: "CBBTCUSD", kind: "price" },
  eth: { name: "Ether (USD)", yahoo: "ETH-USD", fred: "CBETHUSD", kind: "price" },
  ust3m: { name: "US 13-week T-bill yield", yahoo: "^IRX", fred: "DGS3MO", kind: "yield" },
  ust2y: { name: "US 2-year Treasury yield", fred: "DGS2", kind: "yield" },
  ust5y: { name: "US 5-year Treasury yield", yahoo: "^FVX", fred: "DGS5", kind: "yield" },
  ust10y: { name: "US 10-year Treasury yield", yahoo: "^TNX", fred: "DGS10", kind: "yield" },
  ust30y: { name: "US 30-year Treasury yield", yahoo: "^TYX", fred: "DGS30", kind: "yield" },
  wti: { name: "WTI crude (NYMEX)", yahoo: "CL=F", fred: "DCOILWTICO", kind: "price" },
  brent: { name: "Brent crude (ICE)", yahoo: "BZ=F", fred: "DCOILBRENTEU", kind: "price" },
  natgas: { name: "US natural gas (Henry Hub)", yahoo: "NG=F", kind: "price" },
  copper: { name: "Copper (COMEX)", yahoo: "HG=F", kind: "price" },
  spx: { name: "S&P 500", yahoo: "^GSPC", fred: "SP500", kind: "price" },
  ndx: { name: "Nasdaq-100", yahoo: "^NDX", fred: "NASDAQ100", kind: "price" },
  dax: { name: "DAX 40 (Germany)", yahoo: "^GDAXI", kind: "price" },
  nikkei: { name: "Nikkei 225 (Japan)", yahoo: "^N225", fred: "NIKKEI225", kind: "price" },
  hsi: { name: "Hang Seng Index (Hong Kong)", yahoo: "^HSI", kind: "price" },
  vix: { name: "CBOE VIX", yahoo: "^VIX", fred: "VIXCLS", kind: "price" },
};

// transform: level | yoy | diff | saar (see markets.macroStats)
export const MACRO = {
  fed_funds_upper: { id: "DFEDTARU", name: "Fed funds target, upper bound (%)", transform: "level" },
  fed_funds_effective: { id: "DFF", name: "Effective fed funds rate (%)", transform: "level" },
  fed_balance_sheet: { id: "WALCL", name: "Fed total assets ($ mn, weekly)", transform: "level" },
  bank_reserves: { id: "WRESBAL", name: "Reserve balances at the Fed ($ mn, weekly)", transform: "level" },
  reverse_repo: { id: "RRPONTSYD", name: "Overnight reverse repo ($ bn)", transform: "level" },
  cpi: { id: "CPIAUCSL", name: "CPI, all items (SA index)", transform: "yoy" },
  core_cpi: { id: "CPILFESL", name: "Core CPI ex food & energy (SA index)", transform: "yoy" },
  pce: { id: "PCEPI", name: "PCE price index", transform: "yoy" },
  core_pce: { id: "PCEPILFE", name: "Core PCE price index (Fed's target gauge)", transform: "yoy" },
  wages: { id: "CES0500000003", name: "Average hourly earnings, private", transform: "yoy" },
  breakeven_5y: { id: "T5YIE", name: "5-year breakeven inflation (%)", transform: "level" },
  breakeven_10y: { id: "T10YIE", name: "10-year breakeven inflation (%)", transform: "level" },
  inflation_5y5y: { id: "T5YIFR", name: "5y5y forward inflation expectation (%)", transform: "level" },
  inflation_expect_umich: { id: "MICH", name: "UMich 1-yr inflation expectations (%)", transform: "level" },
  real_yield_10y: { id: "DFII10", name: "10-year TIPS real yield (%)", transform: "level" },
  ust_2y: { id: "DGS2", name: "2-year Treasury yield (%)", transform: "level" },
  ust_10y: { id: "DGS10", name: "10-year Treasury yield (%)", transform: "level" },
  ust_30y: { id: "DGS30", name: "30-year Treasury yield (%)", transform: "level" },
  curve_10y2y: { id: "T10Y2Y", name: "10y minus 2y spread (pp)", transform: "level" },
  curve_10y3m: { id: "T10Y3M", name: "10y minus 3m spread (pp)", transform: "level" },
  term_premium_10y: { id: "THREEFYTP10", name: "10y term premium, Kim-Wright (%)", transform: "level" },
  unemployment: { id: "UNRATE", name: "Unemployment rate (%)", transform: "level" },
  payrolls: { id: "PAYEMS", name: "Nonfarm payrolls (thousands; change = m/m jobs)", transform: "diff" },
  initial_claims: { id: "ICSA", name: "Initial jobless claims (weekly)", transform: "level" },
  job_openings: { id: "JTSJOL", name: "JOLTS job openings (thousands)", transform: "level" },
  real_gdp: { id: "GDPC1", name: "Real GDP (q/q SAAR %)", transform: "saar" },
  gdpnow: { id: "GDPNOW", name: "Atlanta Fed GDPNow nowcast (%)", transform: "level" },
  retail_sales: { id: "RSAFS", name: "Retail sales (nominal)", transform: "yoy" },
  industrial_production: { id: "INDPRO", name: "Industrial production index", transform: "yoy" },
  consumer_sentiment: { id: "UMCSENT", name: "UMich consumer sentiment", transform: "level" },
  m2: { id: "M2SL", name: "M2 money supply", transform: "yoy" },
  hy_spread: { id: "BAMLH0A0HYM2", name: "US high-yield OAS (pp)", transform: "level" },
  financial_conditions: { id: "NFCI", name: "Chicago Fed NFCI (<0 = looser than avg)", transform: "level" },
  dollar_broad: { id: "DTWEXBGS", name: "Broad trade-weighted dollar index", transform: "level" },
  federal_debt: { id: "GFDEBTN", name: "Total federal debt ($ mn, quarterly)", transform: "level" },
  debt_to_gdp: { id: "GFDEGDQ188S", name: "Federal debt as % of GDP", transform: "level" },
  federal_interest: { id: "A091RC1Q027SBEA", name: "Federal interest payments ($ bn SAAR)", transform: "level" },
  federal_deficit: { id: "MTSDS133FMS", name: "Monthly federal surplus(+)/deficit(-) ($ mn)", transform: "level" },
};

// ---------- directions (the analyst's coverage areas) ----------
// news: GDELT queries; label is shown in the brief.
export const DIRECTIONS = {
  gold: {
    title: "Золото",
    assets: ["gold", "silver", "dxy", "ust10y"],
    macro: ["real_yield_10y", "breakeven_10y", "fed_funds_upper"],
    correlations: [["gold", "dxy"], ["gold", "ust10y"]],
    news: [{ label: "gold market", query: '("gold price" OR bullion OR "central bank gold")' }],
    drivers: [
      "Реальная доходность (10y TIPS): исторически главный обратный драйвер; в 2022–2025 связь ослабла из-за покупок ЦБ.",
      "Покупки центробанков (Китай, Польша, Индия, Турция) и спрос ETF.",
      "Доллар (DXY): обычно обратная связь.",
      "Геополитический риск и санкционные опасения (заморозка резервов РФ в 2022 → «дедолларизация» резервов).",
    ],
  },
  dollar: {
    title: "Доллар США",
    assets: ["dxy", "eurusd", "usdjpy", "usdcny", "ust2y"],
    macro: ["fed_funds_upper", "ust_2y", "curve_10y2y", "dollar_broad"],
    correlations: [["dxy", "ust2y"]],
    news: [{ label: "dollar / FX", query: '("US dollar" OR "dollar index" OR DXY) (Fed OR tariffs OR yen OR euro)' }],
    drivers: [
      "Дифференциал ставок США vs ЕЦБ/BoJ (особенно 2-летки).",
      "Рост США относительно мира («американская исключительность»).",
      "Бегство в качество при кризисах (доллар растёт в острый risk-off).",
      "Торговая политика/тарифы, интервенции Японии и фиксинг юаня.",
    ],
  },
  bitcoin: {
    title: "Биткойн",
    assets: ["btc", "eth", "ndx", "dxy"],
    macro: ["fed_balance_sheet", "m2", "real_yield_10y"],
    correlations: [["btc", "ndx"], ["btc", "gold"]],
    news: [{ label: "bitcoin", query: '(bitcoin OR "crypto ETF" OR "spot bitcoin")' }],
    drivers: [
      "Глобальная ликвидность (баланс ФРС, M2, реальные ставки).",
      "Потоки в спотовые ETF и корпоративные казначейства.",
      "Корреляция с Nasdaq: BTC ведёт себя как высокобета risk-актив, не как «цифровое золото» в стрессе.",
      "Регулирование (SEC, законодательство о стейблкоинах), халвинг-цикл, ликвидации плечевых позиций.",
    ],
  },
  treasuries: {
    title: "Облигации США (Treasuries)",
    assets: ["ust3m", "ust2y", "ust10y", "ust30y"],
    macro: ["curve_10y2y", "curve_10y3m", "real_yield_10y", "breakeven_10y", "term_premium_10y", "fed_funds_upper"],
    news: [{ label: "Treasury market", query: '("Treasury yields" OR "Treasury auction" OR "bond market") (Fed OR deficit OR inflation)' }],
    drivers: [
      "Короткий конец = ожидания по ставке ФРС; длинный = инфляция + срочная премия.",
      "Предложение: дефицит бюджета, структура размещений Минфина (векселя vs купоны), QT.",
      "Спрос: иностранные держатели (Япония, Китай), банки, аукционы (bid-to-cover, tail).",
      "Форма кривой: инверсия → исторически предвестник рецессии; распрямление (bull/bear steepening) — важно, что именно движет.",
    ],
  },
  oil: {
    title: "Нефть",
    assets: ["brent", "wti", "natgas", "dxy"],
    macro: ["industrial_production", "breakeven_5y"],
    correlations: [["brent", "spx"]],
    news: [
      { label: "OPEC+ / supply", query: '(OPEC OR "OPEC+" OR "oil output" OR "crude supply")' },
      { label: "energy chokepoints", query: '("Strait of Hormuz" OR "Red Sea" OR "oil tanker" OR "oil sanctions")' },
    ],
    drivers: [
      "Политика OPEC+ (квоты, свободные мощности Саудовской Аравии/ОАЭ).",
      "Сланцевая добыча США, запасы (EIA weekly), SPR.",
      "Спрос Китая и глобальный цикл (промпроизводство).",
      "Геополитика: Ормузский пролив, Красное море, санкции против РФ/Ирана/Венесуэлы, удары по НПЗ.",
    ],
  },
  equities: {
    title: "Акции (S&P 500, Nasdaq, DAX/GER40, Nikkei 225, Hang Seng)",
    assets: ["spx", "ndx", "dax", "nikkei", "hsi", "vix"],
    macro: ["hy_spread", "financial_conditions", "real_yield_10y", "gdpnow"],
    correlations: [["spx", "dax"], ["spx", "nikkei"], ["spx", "hsi"]],
    news: [{ label: "equity markets", query: '("stock market" OR "Wall Street" OR equities) (earnings OR Fed OR selloff OR rally)' }],
    drivers: [
      "Прибыли (EPS-revisions) и мультипликатор (чувствителен к реальным ставкам).",
      "Концентрация: мега-капы/ИИ-капекс доминируют в S&P 500 и Nasdaq.",
      "Кредитные спреды и VIX — индикаторы стресса; расширение HY-спредов обычно опережает распродажи.",
      "DAX: Китай, энергия, фискальный стимул ФРГ; Nikkei: курс иены и политика BoJ; Hang Seng: стимулы КНР, недвижимость, отношения США–Китай.",
    ],
  },
  geopolitics: {
    title: "Геополитика",
    assets: ["gold", "brent", "vix", "usdcny"],
    macro: [],
    news: [
      { label: "US–China", query: '("United States" OR Washington) China (tariffs OR Taiwan OR sanctions OR "export controls")' },
      { label: "sanctions & trade", query: '(sanctions OR tariffs OR embargo) (Russia OR Iran OR China)' },
      { label: "elections & instability", query: '(coup OR "snap election" OR "government collapse" OR "martial law")' },
    ],
    drivers: [
      "Конкуренция США–Китай: тарифы, экспортный контроль на чипы, Тайвань.",
      "Санкционные режимы и их обход (теневой флот, вторичные санкции).",
      "Выборы и смена правительств в G20.",
      "Рыночный канал: золото, нефть, VIX, юань — смотреть, реагирует ли рынок или игнорирует шум.",
    ],
  },
  us_macro: {
    title: "Макроданные США",
    assets: ["spx", "ust2y"],
    macro: ["payrolls", "unemployment", "initial_claims", "job_openings", "real_gdp", "gdpnow", "retail_sales", "industrial_production", "consumer_sentiment"],
    news: [{ label: "US economy", query: '("US economy" OR "jobs report" OR "nonfarm payrolls" OR "GDP report" OR recession)' }],
    drivers: [
      "Рынок труда: payrolls (3-мес. среднее), безработица (правило Сама), заявки на пособие.",
      "Рост: GDPNow vs консенсус, розничные продажи, промпроизводство.",
      "Настроения потребителей — опережающий, но шумный индикатор.",
      "Ревизии данных бывают крупными — сравнивать тренд, а не один релиз.",
    ],
  },
  fed: {
    title: "ФРС",
    assets: ["ust2y", "ust3m", "dxy"],
    macro: ["fed_funds_upper", "fed_funds_effective", "fed_balance_sheet", "bank_reserves", "reverse_repo", "core_pce", "unemployment", "ust_2y"],
    news: [{ label: "Federal Reserve", query: '("Federal Reserve" OR FOMC) (rate OR "rate cut" OR "rate hike" OR "balance sheet")' }],
    drivers: [
      "Двойной мандат: core PCE vs цель 2% и безработица vs NAIRU.",
      "2-летняя доходность vs верхняя граница ставки ≈ сколько снижений/повышений закладывает рынок.",
      "Баланс (QT), резервы банков и RRP — ликвидность денежного рынка.",
      "Риторика (точечный график, протоколы, выступления) и вопросы независимости ФРС.",
    ],
  },
  inflation: {
    title: "Инфляция",
    assets: ["brent", "gold"],
    macro: ["cpi", "core_cpi", "pce", "core_pce", "wages", "breakeven_5y", "breakeven_10y", "inflation_5y5y", "inflation_expect_umich"],
    news: [{ label: "inflation", query: '(inflation OR CPI OR "consumer prices") ("United States" OR Fed)' }],
    drivers: [
      "Core vs headline: энергия и продукты шумят, ФРС смотрит на core PCE.",
      "3-мес. annualized темп показывает разворот раньше, чем y/y.",
      "Зарплаты и услуги (жильё, супер-кор) — инерционная часть.",
      "Тарифы — разовый сдвиг уровня цен или устойчивая инфляция? Смотреть на ожидания (breakevens, UMich).",
    ],
  },
  us_debt: {
    title: "Госдолг США",
    assets: ["ust10y", "ust30y", "gold"],
    macro: ["debt_to_gdp", "federal_interest", "federal_deficit", "term_premium_10y"],
    treasury: true,
    news: [{ label: "US fiscal", query: '("debt ceiling" OR "national debt" OR "budget deficit" OR "Treasury refunding") ("United States" OR Congress)' }],
    drivers: [
      "Траектория долг/ВВП и процентные расходы (уже сравнимы с оборонным бюджетом).",
      "Средняя ставка по долгу растёт по мере рефинансирования дешёвого долга 2020–2021.",
      "Потолок госдолга, рейтинги (Moody's снял AAA в мае 2025), квартальный refunding Минфина.",
      "Канал в рынки: срочная премия длинных бумаг, спрос на аукционах, золото как хедж фискального риска.",
    ],
  },
  wars: {
    title: "Войны и вооружённые конфликты",
    assets: ["brent", "gold", "natgas", "vix"],
    macro: [],
    news: [
      { label: "Russia–Ukraine", query: "(Ukraine OR Ukrainian) (Russia OR Russian) (attack OR offensive OR ceasefire OR drone)" },
      { label: "Middle East", query: "(Israel OR Iran OR Gaza OR Lebanon OR Houthi OR Yemen) (strike OR attack OR ceasefire OR missile)" },
      { label: "Taiwan Strait / Asia", query: "(Taiwan OR \"South China Sea\" OR \"North Korea\") (military OR drills OR missile OR blockade)" },
    ],
    drivers: [
      "Рынок реагирует на угрозу поставкам (нефть, газ, зерно, чипы), а не на интенсивность боёв как таковую.",
      "Эскалация vs переговоры о перемирии: тон и объём медиа (GDELT) — индикатор внимания, НЕ факт.",
      "Сравнивать нарратив разных сторон (gdelt_compare), не доверять одной стране-источнику.",
      "Премия за риск в нефти/золоте исторически быстро сдувается, если поставки не нарушены.",
    ],
  },
};

// ---------- data access ----------
export async function assetSeries(key, range = "1y") {
  const a = ASSETS[key];
  if (!a) {
    // Unknown key: treat as a raw Yahoo symbol.
    const pts = await yahooDaily(key, range);
    return { key, name: key, kind: "price", source: `Yahoo ${key}`, pts };
  }
  const errors = [];
  if (a.yahoo) {
    try {
      return { key, name: a.name, kind: a.kind, source: `Yahoo ${a.yahoo}`, pts: await yahooDaily(a.yahoo, range) };
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (a.fred) {
    try {
      const days = { "3mo": 95, "6mo": 185, "1y": 370, "2y": 735, "5y": 1830 }[range] || 370;
      const pts = await fredSeries(a.fred, shiftDate(new Date().toISOString().slice(0, 10), -days));
      return { key, name: a.name, kind: a.kind, source: `FRED ${a.fred}${a.fredNote ? ` (${a.fredNote})` : ""}`, pts };
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(`${key}: all sources failed — ${errors.join("; ")}`);
}

export async function assetSnapshot(key, range = "1y") {
  const s = await assetSeries(key, range);
  return { asset: key, name: s.name, source: s.source, ...priceStats(s.pts, s.kind) };
}

export async function macroSnapshot(key, lookback = 12) {
  const m = MACRO[key];
  const id = m?.id || key; // unknown key: raw FRED series id
  const pts = await fredSeries(id);
  return { indicator: key, name: m?.name || id, source: `FRED ${id}`, transform: m?.transform || "level", ...macroStats(pts, m?.transform || "level", lookback) };
}

export async function debtSnapshot() {
  const rows = await treasuryDebt();
  const latest = rows[0];
  const back = (days) => rows.find((r) => r.date <= shiftDate(latest.date, -days));
  const delta = (r) => (r ? { from: r.date, change_bn: +((latest.total - r.total) / 1e9).toFixed(1) } : null);
  const yr = back(365);
  const out = {
    source: "US Treasury Fiscal Data — Debt to the Penny",
    as_of: latest.date,
    total_debt_tn: +(latest.total / 1e12).toFixed(3),
    held_by_public_tn: +(latest.public / 1e12).toFixed(3),
    intragovernmental_tn: +(latest.intragov / 1e12).toFixed(3),
    change_1m: delta(back(30)),
    change_3m: delta(back(91)),
    change_1y: delta(yr),
    avg_daily_increase_1y_bn: yr ? +((latest.total - yr.total) / 1e9 / ((Date.parse(latest.date) - Date.parse(yr.date)) / 86400_000)).toFixed(2) : null,
  };
  try {
    const rate = await treasuryAvgRate();
    if (rate.length) {
      out.avg_interest_rate_pct = rate[0].value;
      out.avg_interest_rate_as_of = rate[0].date;
      const yrAgo = rate.find((r) => r.date <= shiftDate(rate[0].date, -360));
      if (yrAgo) out.avg_interest_rate_1y_ago_pct = yrAgo.value;
    }
  } catch (e) {
    out.avg_interest_rate_error = e.message;
  }
  return out;
}

// ---------- rule-based signals (inputs for the analyst, not conclusions) ----------
function signals(assets, macro) {
  const s = [];
  const A = Object.fromEntries(assets.filter((a) => !a.error).map((a) => [a.asset, a]));
  const M = Object.fromEntries(macro.filter((m) => !m.error).map((m) => [m.indicator, m]));
  for (const a of Object.values(A)) {
    if (a.rsi14 >= 70) s.push(`${a.name}: RSI ${a.rsi14} — перекупленность`);
    if (a.rsi14 !== null && a.rsi14 <= 30) s.push(`${a.name}: RSI ${a.rsi14} — перепроданность`);
    if (a.from_52w_high_pct !== null && a.from_52w_high_pct > -1 && a.change_unit === "%") s.push(`${a.name}: у 52-недельного максимума`);
    if (a.from_52w_high_pct !== null && a.from_52w_high_pct <= -20 && a.change_unit === "%") s.push(`${a.name}: ${a.from_52w_high_pct}% от максимума — медвежья территория`);
  }
  if (A.vix?.last >= 30) s.push(`VIX ${A.vix.last} — острый стресс`);
  else if (A.vix?.last >= 20) s.push(`VIX ${A.vix.last} — повышенная тревожность`);
  if (M.curve_10y2y && M.curve_10y2y.last < 0) s.push(`Кривая 10y–2y инвертирована (${M.curve_10y2y.last} пп)`);
  if (M.curve_10y2y && M.curve_10y2y.last >= 0 && M.curve_10y2y.change_1y > 0.5) s.push(`Кривая 10y–2y распрямилась на ${M.curve_10y2y.change_1y} пп за год — проверить, bull или bear steepening`);
  if (M.core_pce?.yoy_pct > 2.5) s.push(`Core PCE ${M.core_pce.yoy_pct}% г/г — выше цели ФРС 2%`);
  if (M.core_pce?.ann_3m_pct !== undefined && M.core_pce?.yoy_pct !== null && M.core_pce.ann_3m_pct > M.core_pce.yoy_pct + 0.5) s.push(`Core PCE ускоряется: 3м annualized ${M.core_pce.ann_3m_pct}% > г/г ${M.core_pce.yoy_pct}%`);
  if (M.core_cpi?.ann_3m_pct !== undefined && M.core_cpi?.yoy_pct !== null && M.core_cpi.ann_3m_pct > M.core_cpi.yoy_pct + 0.5) s.push(`Core CPI ускоряется: 3м annualized ${M.core_cpi.ann_3m_pct}% > г/г ${M.core_cpi.yoy_pct}%`);
  if (M.real_yield_10y?.last >= 2) s.push(`Реальная 10y доходность ${M.real_yield_10y.last}% — жёсткие финансовые условия`);
  if (M.hy_spread?.last >= 5) s.push(`HY-спред ${M.hy_spread.last} пп — кредитный стресс`);
  if (M.payrolls?.change_3m_avg !== null && M.payrolls?.change_3m_avg < 50) s.push(`Payrolls 3м среднее ${M.payrolls.change_3m_avg}k — рынок труда слабеет`);
  if (M.unemployment?.history?.length >= 12) {
    // Sahm-style: 3m avg unemployment vs min of prior 12 months.
    const h = M.unemployment.history.map((p) => p.value);
    const avg3 = h.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const min12 = Math.min(...h.slice(0, -3));
    if (avg3 - min12 >= 0.5) s.push(`Безработица: правило Сама сработало (+${(avg3 - min12).toFixed(2)} пп)`);
  }
  if (M.fed_funds_upper && A.ust2y) {
    const gap = +(A.ust2y.last - M.fed_funds_upper.last).toFixed(2);
    s.push(`2y (${A.ust2y.last}%) минус верхняя граница ставки (${M.fed_funds_upper.last}%) = ${gap} пп → рынок ${gap < -0.25 ? "закладывает снижения ставки" : gap > 0.25 ? "закладывает повышения" : "ждёт паузу"}`);
  }
  return s;
}

async function settle(items, fn) {
  return Promise.all(items.map(async (k) => {
    try {
      return await fn(k);
    } catch (e) {
      return { key: k, error: e.message };
    }
  }));
}

export async function buildBrief(direction, { include_news = true, news_timespan = "7d", headlines = 5 } = {}, news) {
  const d = DIRECTIONS[direction];
  if (!d) throw new Error(`Unknown direction '${direction}'. Use one of: ${Object.keys(DIRECTIONS).join(", ")}`);
  const [assets, macro] = await Promise.all([
    settle(d.assets, (k) => assetSnapshot(k)),
    settle(d.macro, (k) => macroSnapshot(k, 13)),
  ]);
  for (const a of assets) if (a.error) a.asset = a.key;
  for (const m of macro) if (m.error) m.indicator = m.key;
  const out = {
    direction,
    title: d.title,
    generated_at: new Date().toISOString(),
    drivers: d.drivers,
    markets: assets,
    macro,
  };
  if (d.treasury) {
    try {
      out.treasury_debt = await debtSnapshot();
    } catch (e) {
      out.treasury_debt = { error: e.message };
    }
  }
  if (d.correlations?.length) {
    out.correlations_60d = await settle(d.correlations, async ([x, y]) => {
      const [a, b] = await Promise.all([assetSeries(x), assetSeries(y)]);
      return { pair: `${x}/${y}`, ...(correlation(a.pts, b.pts, 60) || { corr: null, note: "not enough overlapping data" }) };
    });
  }
  out.signals = signals(assets, macro);
  if (include_news && news && d.news?.length) {
    out.news = [];
    for (const n of d.news) {
      try {
        out.news.push({ label: n.label, ...(await news(n.query, news_timespan, headlines)) });
      } catch (e) {
        out.news.push({ label: n.label, query: n.query, error: e.message });
      }
    }
  }
  out.caveats = [
    "Yahoo Finance — неофициальный API; цены фьючерсов (золото, нефть) — ближний контракт, возможны скачки при ролловере.",
    "Макроданные FRED публикуются с лагом; смотрите поле as_of у каждого показателя.",
    "GDELT измеряет медиа-покрытие и тон, а не проверенные факты.",
  ];
  return out;
}

// ---------- MCP tools ----------
const dirList = Object.keys(DIRECTIONS);
export const ANALYST_TOOLS = [
  {
    name: "market_snapshot",
    description:
      `Price analytics for one or more assets: last price, 1d/1w/1m/3m/YTD/1y changes, 52w range, SMA50/200 trend, RSI14, 21d realized vol. Yields report changes in basis points. Known keys: ${Object.keys(ASSETS).join(", ")}. Any other string is treated as a Yahoo Finance symbol (e.g. 'AAPL', '^FTSE').`,
    inputSchema: {
      type: "object",
      properties: {
        assets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12, description: "Asset keys or Yahoo symbols." },
        range: { type: "string", enum: ["6mo", "1y", "2y", "5y"], description: "History to load. Default '1y' (needed for SMA200/YTD)." },
      },
      required: ["assets"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "macro_indicator",
    description:
      `US macro / Fed / inflation / fiscal series from FRED with ready-made transforms (y/y %, m/m change, q/q SAAR). Known keys: ${Object.keys(MACRO).join(", ")}. Any other string is treated as a raw FRED series id.`,
    inputSchema: {
      type: "object",
      properties: {
        indicators: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
        lookback: { type: "integer", minimum: 3, maximum: 60, description: "History points to return per series. Default 12." },
      },
      required: ["indicators"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "us_debt",
    description: "US federal debt from the Treasury (Debt to the Penny): total, held by public, intragovernmental, 1m/3m/1y change, average daily increase, average interest rate on the debt.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "asset_correlation",
    description: "Rolling daily-return correlation between pairs of assets (keys as in market_snapshot). Use to check regime claims like 'BTC trades like Nasdaq' or 'gold ignores real yields'.",
    inputSchema: {
      type: "object",
      properties: {
        pairs: { type: "array", items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 }, minItems: 1, maxItems: 8 },
        window: { type: "integer", minimum: 20, maximum: 250, description: "Trading days. Default 60." },
      },
      required: ["pairs"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "analyst_brief",
    description:
      `One-call research pack for a coverage area: market snapshots, macro series, cross-asset correlations, rule-based signals, key drivers and (optionally) GDELT news tone + headlines. Directions: ${dirList.join(", ")}. With news, takes ~10–35s due to GDELT rate limits.`,
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: dirList },
        include_news: { type: "boolean", description: "Fetch GDELT tone + headlines. Default true." },
        news_timespan: { type: "string", description: "GDELT lookback, e.g. '24h', '3d', '7d'. Default '7d'." },
        headlines: { type: "integer", minimum: 1, maximum: 10, description: "Headlines per news theme. Default 5." },
      },
      required: ["direction"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export async function callAnalystTool(name, args, ctx) {
  if (name === "market_snapshot") {
    const keys = (args.assets || []).slice(0, 12);
    if (!keys.length) throw new Error("assets is required");
    const res = await settle(keys, (k) => assetSnapshot(k, args.range || "1y"));
    return { snapshots: res.map((r) => (r.error ? { asset: r.key, error: r.error } : r)) };
  }
  if (name === "macro_indicator") {
    const keys = (args.indicators || []).slice(0, 12);
    if (!keys.length) throw new Error("indicators is required");
    const res = await settle(keys, (k) => macroSnapshot(k, args.lookback || 12));
    return { indicators: res.map((r) => (r.error ? { indicator: r.key, error: r.error } : r)) };
  }
  if (name === "us_debt") return debtSnapshot();
  if (name === "asset_correlation") {
    const w = args.window || 60;
    const range = w > 200 ? "2y" : "1y";
    const res = await settle((args.pairs || []).slice(0, 8), async ([x, y]) => {
      const [a, b] = await Promise.all([assetSeries(x, range), assetSeries(y, range)]);
      return { pair: `${x}/${y}`, window: w, ...(correlation(a.pts, b.pts, w) || { corr: null, note: "not enough overlapping data" }) };
    });
    return { correlations: res.map((r) => (r.error ? { pair: r.key.join("/"), error: r.error } : r)) };
  }
  if (name === "analyst_brief") return buildBrief(args.direction, args, ctx?.news);
  return undefined;
}

// ---------- MCP prompt: the analyst persona ----------
const ANALYST_PROMPT = `Ты — Argus, макро- и геополитический аналитик. Покрытие: ${Object.values(DIRECTIONS).map((d) => d.title).join("; ")}.

ПРАВИЛА РАБОТЫ
1. Сначала данные, потом мнение. Для каждого направления вызывай analyst_brief; для точечных вопросов — market_snapshot, macro_indicator, us_debt, asset_correlation, gdelt_search/gdelt_tone/gdelt_compare.
2. Помечай каждое утверждение: [Факт] — число из инструмента с датой as_of; [Вывод] — логическое следствие из данных; [Гипотеза] — твоя интерпретация без прямого подтверждения.
3. Всегда указывай дату данных. Если показатель старше месяца (макро) или 3 дней (рынок) — скажи об этом.
4. Связывай направления: ФРС → доходности → доллар → золото/BTC/акции; нефть → инфляция → ФРС; войны → нефть/золото/VIX; госдолг → срочная премия → длинные бумаги.
5. Медиа (GDELT) — это внимание и тон, не факты. Для конфликтов сравнивай источники разных стран (gdelt_compare).
6. Не давай персональных инвестиционных рекомендаций; давай сценарии с вероятностями и триггерами.

ФОРМАТ ОТВЕТА ПО НАПРАВЛЕНИЮ
- Главное (1–2 предложения): что изменилось и почему это важно.
- Цифры: таблица ключевых показателей с изменениями.
- Драйверы: что двигает рынок сейчас (с метками уверенности).
- Риски/контраргументы: что опровергнет базовый сценарий.
- Сценарии на горизонт: базовый / альтернативный / хвостовой, с вероятностями и уровнями-триггерами.
- Что смотреть дальше: ближайшие релизы, события, уровни.`;

export const PROMPTS = [
  {
    name: "argus_analyst",
    description: "Argus analyst persona and methodology. Optional: direction (one coverage area or 'all') and horizon.",
    arguments: [
      { name: "direction", description: `One of: ${dirList.join(", ")}, or 'all' for a full daily review.`, required: false },
      { name: "horizon", description: "Forecast horizon, e.g. '1 week', '1 month', '3 months'. Default '1 month'.", required: false },
    ],
  },
];

export function getPrompt(name, args = {}) {
  if (name !== "argus_analyst") throw Object.assign(new Error(`Unknown prompt: ${name}`), { code: -32602 });
  const dir = args.direction && args.direction !== "all" ? args.direction : null;
  if (dir && !DIRECTIONS[dir]) throw Object.assign(new Error(`Unknown direction '${dir}'`), { code: -32602 });
  const horizon = args.horizon || "1 месяц";
  const task = dir
    ? `Задача: подготовь разбор направления «${DIRECTIONS[dir].title}» на горизонт ${horizon}. Начни с analyst_brief(direction="${dir}").`
    : `Задача: ежедневный обзор по всем направлениям на горизонт ${horizon}. Вызови analyst_brief для каждого направления (${dirList.join(", ")}), затем дай сводку: топ-3 изменения дня, карта взаимосвязей, общий режим рынка (risk-on / risk-off / стагфляция / дезинфляционный рост).`;
  return {
    description: "Argus analyst",
    messages: [{ role: "user", content: { type: "text", text: `${ANALYST_PROMPT}\n\n${task}` } }],
  };
}
