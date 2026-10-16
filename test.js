// Offline tests: all HTTP is mocked, so these verify parsing and analytics, not live API availability.
import assert from "node:assert/strict";

process.env.GDELT_MIN_INTERVAL_MS = "0";
const calls = [];
const DAY = 86400_000;
const END = Date.parse("2026-10-15T00:00:00Z");

function yahooChart(n = 300, start = 100, drift = 0.001) {
  const timestamp = [], close = [];
  for (let i = 0; i < n; i++) {
    timestamp.push((END - (n - 1 - i) * DAY) / 1000);
    close.push(+(start * Math.exp(drift * i + 0.01 * Math.sin(i))).toFixed(4));
  }
  return { chart: { result: [{ meta: { regularMarketPrice: close[n - 1], regularMarketTime: timestamp[n - 1] }, timestamp, indicators: { quote: [{ close }] } }] } };
}

function fredCsv(id) {
  const monthly = ["CPIAUCSL", "CPILFESL", "PCEPILFE", "PAYEMS", "UNRATE"].includes(id);
  const lines = ["observation_date," + id];
  if (monthly) {
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2024, 3 + i, 1)).toISOString().slice(0, 10);
      const v = id === "PAYEMS" ? 158000 + i * 100 : id === "UNRATE" ? 4 + (i >= 27 ? 0.6 : 0) : 300 * 1.003 ** i;
      lines.push(`${d},${v}`);
    }
  } else {
    for (let i = 0; i < 400; i++) lines.push(`${new Date(END - (399 - i) * DAY).toISOString().slice(0, 10)},${i === 5 ? "." : (4 + i / 1000).toFixed(3)}`);
  }
  return lines.join("\n");
}

globalThis.fetch = async (url) => {
  url = String(url);
  calls.push(url);
  const reply = (status, body) => ({ status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  if (url.includes("finance.yahoo.com")) {
    if (url.includes("GDAXI")) return reply(429, "Too Many Requests");
    return reply(200, yahooChart());
  }
  if (url.includes("fredgraph.csv")) return reply(200, fredCsv(new URL(url).searchParams.get("id")));
  if (url.includes("debt_to_penny")) {
    const data = [];
    for (let i = 0; i < 400; i++) data.push({ record_date: new Date(END - i * DAY).toISOString().slice(0, 10), tot_pub_debt_out_amt: String(38e12 - i * 5e9), debt_held_public_amt: String(30e12), intragov_hold_amt: String(7e12) });
    return reply(200, { data });
  }
  if (url.includes("avg_interest_rates")) return reply(200, { data: [{ record_date: "2026-09-30", avg_interest_rate_amt: "3.40" }, { record_date: "2025-09-30", avg_interest_rate_amt: "3.25" }] });
  if (url.includes("gdeltproject")) {
    const mode = new URL(url).searchParams.get("mode");
    if (mode === "ArtList") return reply(200, { articles: [{ title: "Headline", url: "https://x", domain: "x.com", sourcecountry: "US", language: "English", seendate: "20261015T120000Z" }] });
    return reply(200, { timeline: [{ series: "Tone", data: [{ date: "20261014T000000Z", value: -2 }, { date: "20261015T000000Z", value: -3 }] }] });
  }
  return reply(404, "unmocked " + url);
};

const { handleRpc } = await import("./server.js");
const { priceStats, macroStats, correlation, clearCache } = await import("./markets.js");
const rpc = async (method, params) => (await handleRpc({ jsonrpc: "2.0", id: 1, method, params })).result;
const tool = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  assert.equal(r.isError, false, r.content?.[0]?.text);
  return r.structuredContent;
};

let passed = 0;
async function test(name, fn) {
  clearCache();
  await fn();
  passed++;
  console.log("ok -", name);
}

await test("priceStats: trend, changes, yield in bp", () => {
  const pts = Array.from({ length: 260 }, (_, i) => ({ date: new Date(END - (259 - i) * DAY).toISOString().slice(0, 10), value: 100 + i }));
  const s = priceStats(pts);
  assert.equal(s.last, 359);
  assert.equal(s.change_1d, +((359 / 358 - 1) * 100).toFixed(2));
  assert.match(s.trend, /^uptrend/);
  assert.equal(s.rsi14, 100);
  assert.equal(s.from_52w_high_pct, 0);
  const y = priceStats(pts.map((p, i) => ({ ...p, value: 4 + i / 100 })), "yield");
  assert.equal(y.change_unit, "bp");
  assert.equal(y.change_1d, 1);
  assert.equal(y.realized_vol_21d_pct, undefined);
});

await test("macroStats: yoy, diff, saar", () => {
  const monthly = Array.from({ length: 25 }, (_, i) => ({ date: new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 10), value: 100 * 1.01 ** i }));
  const y = macroStats(monthly, "yoy");
  assert.equal(y.yoy_pct, +((1.01 ** 12 - 1) * 100).toFixed(2));
  assert.equal(y.mom_pct, 1);
  const d = macroStats(monthly.map((p, i) => ({ ...p, value: 1000 + i * 150 })), "diff");
  assert.equal(d.change, 150);
  assert.equal(d.change_3m_avg, 150);
  const q = macroStats([{ date: "2025-01-01", value: 100 }, { date: "2025-04-01", value: 101 }], "saar");
  assert.equal(q.qoq_saar_pct, +((1.01 ** 4 - 1) * 100).toFixed(2));
});

await test("correlation: identical series = 1", () => {
  const pts = Array.from({ length: 80 }, (_, i) => ({ date: `d${String(i).padStart(3, "0")}`, value: 100 + Math.sin(i) * 5 + i }));
  assert.equal(correlation(pts, pts, 60).corr, 1);
  assert.equal(correlation(pts.slice(0, 5), pts.slice(0, 5)), null);
});

await test("tools/list exposes analyst tools and prompts", async () => {
  const names = (await rpc("tools/list")).tools.map((t) => t.name);
  for (const n of ["gdelt_search", "gdelt_tone", "gdelt_compare", "market_snapshot", "macro_indicator", "us_debt", "asset_correlation", "analyst_brief"]) assert.ok(names.includes(n), n);
  const prompts = (await rpc("prompts/list")).prompts;
  assert.equal(prompts[0].name, "argus_analyst");
  const p = await rpc("prompts/get", { name: "argus_analyst", arguments: { direction: "gold", horizon: "3 месяца" } });
  assert.match(p.messages[0].content.text, /analyst_brief\(direction="gold"\)/);
  const bad = await handleRpc({ jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "argus_analyst", arguments: { direction: "nope" } } });
  assert.equal(bad.error.code, -32602);
});

await test("market_snapshot: Yahoo primary, per-asset errors don't fail the call", async () => {
  const r = await tool("market_snapshot", { assets: ["gold", "dax", "AAPL"] });
  assert.equal(r.snapshots[0].source, "Yahoo GC=F");
  assert.ok(r.snapshots[0].sma200 > 0);
  assert.match(r.snapshots[1].error, /HTTP 429/); // DAX has no FRED fallback
  assert.equal(r.snapshots[2].source, "Yahoo AAPL");
});

await test("market_snapshot: falls back to FRED when Yahoo fails", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes("yahoo") ? { status: 403, text: async () => "blocked" } : orig(url));
  try {
    const r = await tool("market_snapshot", { assets: ["spx", "ust10y"] });
    assert.equal(r.snapshots[0].source, "FRED SP500");
    assert.equal(r.snapshots[1].change_unit, "bp");
  } finally {
    globalThis.fetch = orig;
  }
});

await test("macro_indicator: FRED parsing skips '.' values", async () => {
  const r = await tool("macro_indicator", { indicators: ["core_pce", "payrolls", "DGS10"] });
  assert.ok(r.indicators[0].yoy_pct > 3);
  assert.equal(r.indicators[1].change, 100);
  assert.equal(r.indicators[2].source, "FRED DGS10");
});

await test("us_debt: totals, changes, avg rate", async () => {
  const r = await tool("us_debt", {});
  assert.equal(r.total_debt_tn, 38);
  assert.equal(r.change_1m.change_bn, 150);
  assert.equal(r.avg_interest_rate_pct, 3.4);
  assert.equal(r.avg_interest_rate_1y_ago_pct, 3.25);
});

await test("analyst_brief: every direction builds", async () => {
  const dirs = (await rpc("tools/list")).tools.find((t) => t.name === "analyst_brief").inputSchema.properties.direction.enum;
  assert.equal(dirs.length, 12);
  for (const d of dirs) {
    const r = await tool("analyst_brief", { direction: d, include_news: d === "wars" || d === "fed" });
    assert.equal(r.direction, d);
    assert.ok(r.drivers.length >= 3, d);
    assert.ok(Array.isArray(r.signals));
  }
  const wars = await tool("analyst_brief", { direction: "wars" });
  assert.equal(wars.news.length, 3);
  assert.equal(wars.news[0].tone_stats.last, -3);
  const fed = await tool("analyst_brief", { direction: "fed", include_news: false });
  assert.equal(fed.news, undefined);
  assert.ok(fed.signals.some((s) => s.startsWith("2y")));
  const debt = await tool("analyst_brief", { direction: "us_debt", include_news: false });
  assert.equal(debt.treasury_debt.total_debt_tn, 38);
  const macro = await tool("analyst_brief", { direction: "us_macro", include_news: false });
  assert.ok(macro.signals.some((s) => s.includes("Сама")), macro.signals.join("|"));
});

await test("analyst_brief: unknown direction is a tool error", async () => {
  const r = await rpc("tools/call", { name: "analyst_brief", arguments: { direction: "nope" } });
  assert.equal(r.isError, true);
});

console.log(`\n${passed} tests passed`);
