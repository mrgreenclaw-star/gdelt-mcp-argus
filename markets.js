// Market & macro data sources for Argus — zero dependencies, no API keys.
//   Prices:  Yahoo Finance chart API (unofficial), FRED fredgraph.csv as fallback
//   Macro:   FRED fredgraph.csv (St. Louis Fed)
//   Debt:    US Treasury Fiscal Data API
const YAHOO_URLS = (process.env.YAHOO_URLS || "https://query1.finance.yahoo.com,https://query2.finance.yahoo.com").split(",");
const FRED_URL = process.env.FRED_URL || "https://fred.stlouisfed.org/graph/fredgraph.csv";
const TREASURY_URL = process.env.TREASURY_URL || "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const FETCH_TIMEOUT_MS = 20000;
const UA = "Mozilla/5.0 (compatible; gdelt-mcp-argus/1.1)";

// ---------- http + cache ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}
export const clearCache = () => cache.clear();

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*" } });
    const text = await res.text();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.trim().slice(0, 200)}`);
    return text;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`timeout after ${FETCH_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ---------- sources ----------
// Returns [{date: 'YYYY-MM-DD', value: number}] ascending.
export async function yahooDaily(symbol, range = "1y") {
  return cached(`y:${symbol}:${range}`, 5 * 60_000, async () => {
    let lastErr;
    for (const base of YAHOO_URLS) {
      try {
        const url = `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
        const json = JSON.parse(await fetchText(url));
        const r = json?.chart?.result?.[0];
        if (!r) throw new Error(json?.chart?.error?.description || "empty chart result");
        const ts = r.timestamp || [];
        const closes = r.indicators?.quote?.[0]?.close || [];
        const pts = [];
        for (let i = 0; i < ts.length; i++) {
          if (typeof closes[i] === "number") pts.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: closes[i] });
        }
        // Yahoo's last bar can lag the live price; prefer regularMarketPrice for the latest point.
        const live = r.meta?.regularMarketPrice;
        const liveDate = r.meta?.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString().slice(0, 10) : null;
        if (typeof live === "number" && liveDate && pts.length) {
          if (pts[pts.length - 1].date === liveDate) pts[pts.length - 1].value = live;
          else if (liveDate > pts[pts.length - 1].date) pts.push({ date: liveDate, value: live });
        }
        if (!pts.length) throw new Error("no price points");
        return pts;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`Yahoo ${symbol}: ${lastErr?.message}`);
  });
}

export async function fredSeries(id, startDate) {
  const start = startDate || new Date(Date.now() - 6 * 365 * 86400_000).toISOString().slice(0, 10);
  return cached(`f:${id}:${start}`, 60 * 60_000, async () => {
    const text = await fetchText(`${FRED_URL}?id=${encodeURIComponent(id)}&cosd=${start}`);
    const lines = text.trim().split(/\r?\n/);
    if (!/^(observation_date|DATE)\b/i.test(lines[0] || "")) throw new Error(`FRED ${id}: unexpected response`);
    const pts = [];
    for (const line of lines.slice(1)) {
      const [date, v] = line.split(",");
      const value = Number(v);
      if (date && v !== "" && v !== "." && Number.isFinite(value)) pts.push({ date, value });
    }
    if (!pts.length) throw new Error(`FRED ${id}: no observations`);
    return pts;
  });
}

export async function treasuryDebt() {
  return cached("t:debt", 60 * 60_000, async () => {
    const fields = "record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt";
    const url = `${TREASURY_URL}/v2/accounting/od/debt_to_penny?fields=${fields}&sort=-record_date&page%5Bsize%5D=400`;
    const rows = JSON.parse(await fetchText(url)).data || [];
    if (!rows.length) throw new Error("Treasury debt_to_penny: no data");
    return rows.map((r) => ({
      date: r.record_date,
      total: Number(r.tot_pub_debt_out_amt),
      public: Number(r.debt_held_public_amt),
      intragov: Number(r.intragov_hold_amt),
    }));
  });
}

export async function treasuryAvgRate() {
  return cached("t:rate", 6 * 60 * 60_000, async () => {
    const filter = encodeURIComponent("security_desc:eq:Total Interest-bearing Debt");
    const url = `${TREASURY_URL}/v2/accounting/od/avg_interest_rates?fields=record_date,avg_interest_rate_amt&filter=${filter}&sort=-record_date&page%5Bsize%5D=13`;
    const rows = JSON.parse(await fetchText(url)).data || [];
    return rows.map((r) => ({ date: r.record_date, value: Number(r.avg_interest_rate_amt) }));
  });
}

// ---------- analytics ----------
const r2 = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(d));
const at = (pts, n) => (pts.length > n ? pts[pts.length - 1 - n].value : null);
const sma = (vals, n) => (vals.length >= n ? vals.slice(-n).reduce((a, b) => a + b, 0) / n : null);

function rsi(vals, n = 14) {
  if (vals.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = vals.length - n; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function realizedVol(vals, n = 21) {
  if (vals.length <= n) return null;
  const rets = [];
  for (let i = vals.length - n; i < vals.length; i++) rets.push(Math.log(vals[i] / vals[i - 1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v * 252) * 100;
}

// kind: 'price' → % changes; 'yield' → changes in basis points.
export function priceStats(pts, kind = "price") {
  const vals = pts.map((p) => p.value);
  const last = vals[vals.length - 1];
  const chg = (prev) => (prev === null ? null : kind === "yield" ? r2((last - prev) * 100, 1) : r2((last / prev - 1) * 100));
  const year = pts[pts.length - 1].date.slice(0, 4);
  const prevYear = [...pts].reverse().find((p) => p.date.slice(0, 4) < year);
  const window = pts.filter((p) => p.date >= shiftDate(pts[pts.length - 1].date, -365)).map((p) => p.value);
  const hi = Math.max(...window), lo = Math.min(...window);
  const s50 = sma(vals, 50), s200 = sma(vals, 200);
  const trend =
    s50 === null || s200 === null ? "insufficient history"
    : last > s50 && s50 > s200 ? "uptrend (price > SMA50 > SMA200)"
    : last < s50 && s50 < s200 ? "downtrend (price < SMA50 < SMA200)"
    : "mixed / range";
  return {
    last: r2(last, 4),
    as_of: pts[pts.length - 1].date,
    change_unit: kind === "yield" ? "bp" : "%",
    change_1d: chg(at(pts, 1)),
    change_1w: chg(at(pts, 5)),
    change_1m: chg(at(pts, 21)),
    change_3m: chg(at(pts, 63)),
    change_ytd: chg(prevYear ? prevYear.value : null),
    change_1y: chg(at(pts, 250)),
    high_52w: r2(hi, 4),
    low_52w: r2(lo, 4),
    from_52w_high_pct: r2((last / hi - 1) * 100),
    sma50: r2(s50, 4),
    sma200: r2(s200, 4),
    trend,
    rsi14: r2(rsi(vals)),
    ...(kind === "price" ? { realized_vol_21d_pct: r2(realizedVol(vals)) } : {}),
  };
}

export function shiftDate(iso, days) {
  return new Date(Date.parse(iso) + days * 86400_000).toISOString().slice(0, 10);
}

// Daily-return correlation over the last `window` common dates.
export function correlation(a, b, window = 60) {
  const mb = new Map(b.map((p) => [p.date, p.value]));
  const common = a.filter((p) => mb.has(p.date)).map((p) => [p.value, mb.get(p.date)]);
  const rets = [];
  for (let i = 1; i < common.length; i++) rets.push([common[i][0] / common[i - 1][0] - 1, common[i][1] / common[i - 1][1] - 1]);
  const w = rets.slice(-window);
  if (w.length < 10) return null;
  const mx = w.reduce((s, r) => s + r[0], 0) / w.length;
  const my = w.reduce((s, r) => s + r[1], 0) / w.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of w) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? { corr: r2(sxy / Math.sqrt(sxx * syy), 3), observations: w.length } : null;
}

// Transforms for macro series: 'level', 'yoy' (index → % y/y), 'diff' (m/m change, e.g. payrolls), 'saar' (q/q annualized).
export function macroStats(pts, transform = "level", lookback = 12) {
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const out = { last: r2(last.value, 3), as_of: last.date, previous: prev ? r2(prev.value, 3) : null, previous_date: prev?.date ?? null };
  const yearAgo = [...pts].reverse().find((p) => p.date <= shiftDate(last.date, -360));
  if (transform === "yoy") {
    const yoyAt = (i) => {
      const p = pts[i];
      const base = [...pts.slice(0, i)].reverse().find((q) => q.date <= shiftDate(p.date, -360));
      return base ? { date: p.date, value: r2((p.value / base.value - 1) * 100) } : null;
    };
    const hist = [];
    for (let i = Math.max(0, pts.length - lookback); i < pts.length; i++) {
      const v = yoyAt(i);
      if (v) hist.push(v);
    }
    out.yoy_pct = hist.length ? hist[hist.length - 1].value : null;
    out.yoy_prev_pct = hist.length > 1 ? hist[hist.length - 2].value : null;
    if (prev) out.mom_pct = r2((last.value / prev.value - 1) * 100);
    // 3-month annualized pace — earliest read of momentum turning.
    if (pts.length > 3) out.ann_3m_pct = r2(((last.value / pts[pts.length - 4].value) ** 4 - 1) * 100);
    out.history = hist;
    return out;
  }
  if (transform === "diff") {
    const hist = pts.slice(-lookback - 1).map((p, i, arr) => (i ? { date: p.date, value: r2(p.value - arr[i - 1].value, 1) } : null)).filter(Boolean);
    out.change = hist.length ? hist[hist.length - 1].value : null;
    out.change_3m_avg = hist.length >= 3 ? r2(hist.slice(-3).reduce((a, p) => a + p.value, 0) / 3, 1) : null;
    out.history = hist;
    return out;
  }
  if (transform === "saar") {
    const hist = pts.slice(-lookback - 1).map((p, i, arr) => (i ? { date: p.date, value: r2(((p.value / arr[i - 1].value) ** 4 - 1) * 100) } : null)).filter(Boolean);
    out.qoq_saar_pct = hist.length ? hist[hist.length - 1].value : null;
    if (yearAgo) out.yoy_pct = r2((last.value / yearAgo.value - 1) * 100);
    out.history = hist;
    return out;
  }
  out.change = prev ? r2(last.value - prev.value, 3) : null;
  out.change_1y = yearAgo ? r2(last.value - yearAgo.value, 3) : null;
  out.history = sampleTail(pts, lookback);
  return out;
}

// Keep long daily series compact: last N points sampled evenly over the last year.
function sampleTail(pts, n) {
  if (pts.length <= n) return pts.map((p) => ({ date: p.date, value: r2(p.value, 3) }));
  const daily = pts.length > 400 || (pts.length > 1 && Date.parse(pts[pts.length - 1].date) - Date.parse(pts[pts.length - 2].date) < 8 * 86400_000);
  if (!daily) return pts.slice(-n).map((p) => ({ date: p.date, value: r2(p.value, 3) }));
  const from = shiftDate(pts[pts.length - 1].date, -365);
  const yr = pts.filter((p) => p.date >= from);
  const step = Math.max(1, Math.floor(yr.length / n));
  const out = [];
  for (let i = yr.length - 1; i >= 0 && out.length < n; i -= step) out.unshift({ date: yr[i].date, value: r2(yr[i].value, 3) });
  return out;
}
