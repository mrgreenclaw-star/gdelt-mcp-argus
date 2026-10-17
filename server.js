// GDELT MCP server for Argus — zero dependencies, MCP Streamable HTTP (stateless JSON responses).
// Data: GDELT DOC 2.0 API (free, no key). https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// Markets/macro: Yahoo Finance, FRED, US Treasury Fiscal Data (see markets.js, analyst.js).
import http from "node:http";
import { pathToFileURL } from "node:url";
import { ANALYST_TOOLS, callAnalystTool, PROMPTS, getPrompt } from "./analyst.js";

const PORT = Number(process.env.PORT || 3000);
const PATH_TOKEN = (process.env.PATH_TOKEN || "").trim();
const MCP_PATH = PATH_TOKEN ? `/mcp/${PATH_TOKEN}` : "/mcp";
const GDELT_URL = process.env.GDELT_URL || "https://api.gdeltproject.org/api/v2/doc/doc";
const MIN_INTERVAL_MS = Number(process.env.GDELT_MIN_INTERVAL_MS || 5500);
const FETCH_TIMEOUT_MS = 25000;
const SERVER_INFO = { name: "gdelt-mcp-argus", version: "1.2.0" };
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// ---------- GDELT client with a serial rate-limit queue ----------
let chain = Promise.resolve();
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function schedule(fn) {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function gdeltRaw(params) {
  const url = `${GDELT_URL}?${new URLSearchParams({ ...params, format: "json" })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "gdelt-mcp-argus/1.0" } });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

async function gdelt(params) {
  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let status, text;
    try {
      ({ status, text } = await schedule(() => gdeltRaw(params)));
    } catch (e) {
      const cause = e.cause?.code || e.name || e.message;
      console.log(`gdelt ${params.mode} -> network error: ${cause}`);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(3000);
        continue;
      }
      throw new Error(`GDELT unreachable from server (${cause})`);
    }
    const trimmed = text.trim();
    console.log(`gdelt ${params.mode} -> HTTP ${status}, ${trimmed.length} bytes`);
    if (status === 429 || /limit requests/i.test(trimmed)) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(10000 * (attempt + 1));
        continue;
      }
      throw new Error("GDELT rate limit (HTTP 429) persisted after retries; wait a few minutes before the next call");
    }
    if (status !== 200) throw new Error(`GDELT error (HTTP ${status}): ${trimmed.slice(0, 300)}`);
    if (!trimmed) return {}; // HTTP 200 with empty body = no matches
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // GDELT occasionally emits invalid escapes; strip control chars and retry parse
        try {
          return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, " "));
        } catch {
          throw new Error("GDELT returned malformed JSON");
        }
      }
    }
    throw new Error(`GDELT error (HTTP ${status}): ${trimmed.slice(0, 300)}`);
  }
  throw new Error("GDELT request failed after retries");
}

// ---------- helpers ----------
function buildQuery(query, sourceCountry, sourceLang) {
  let q = String(query || "").trim();
  if (!q) throw new Error("query is required");
  if (sourceCountry) q += ` sourcecountry:${String(sourceCountry).replace(/\s+/g, "").toLowerCase()}`;
  if (sourceLang) q += ` sourcelang:${String(sourceLang).replace(/\s+/g, "").toLowerCase()}`;
  return q;
}

function timeParams(args) {
  if (args.start_datetime || args.end_datetime) {
    const p = {};
    if (args.start_datetime) p.startdatetime = String(args.start_datetime);
    if (args.end_datetime) p.enddatetime = String(args.end_datetime);
    return p;
  }
  return { timespan: String(args.timespan || "7d") };
}

const isoDate = (d) =>
  d && d.length >= 15 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}Z` : d;

function articles(json) {
  return (json.articles || []).map((a) => ({
    title: a.title,
    url: a.url,
    domain: a.domain,
    source_country: a.sourcecountry,
    language: a.language,
    seen: isoDate(a.seendate),
  }));
}

function series(json, name) {
  const s = (json.timeline || []).find((x) => !name || x.series === name) || (json.timeline || [])[0];
  return (s?.data || []).map((p) => ({ date: isoDate(p.date), value: p.value, ...(p.norm !== undefined ? { norm: p.norm } : {}) }));
}

function stats(points) {
  const vals = points.map((p) => p.value).filter((v) => typeof v === "number");
  if (!vals.length) return { points: 0 };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    points: vals.length,
    avg: +avg.toFixed(3),
    min: +Math.min(...vals).toFixed(3),
    max: +Math.max(...vals).toFixed(3),
    last: +vals[vals.length - 1].toFixed(3),
  };
}

// ---------- tools ----------
const COMMON_PROPS = {
  timespan: { type: "string", description: "Lookback window, e.g. '24h', '7d', '4w', '3m' (max 3 months). Default '7d'. Ignored if start/end given." },
  start_datetime: { type: "string", description: "Optional start, YYYYMMDDHHMMSS (UTC)." },
  end_datetime: { type: "string", description: "Optional end, YYYYMMDDHHMMSS (UTC)." },
};

const TOOLS = [
  {
    name: "gdelt_search",
    description:
      "Search worldwide news coverage (GDELT DOC 2.0) and return matching articles. Use source_country to see how one side's media covers an event. Measures media coverage, NOT verified facts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords; use quotes for phrases, OR in parentheses, e.g. '(Iran OR Tehran) strike'." },
        source_country: { type: "string", description: "Filter by media country, name without spaces, e.g. 'unitedstates', 'iran', 'israel', 'russia', 'china', 'ukraine', 'unitedkingdom'." },
        source_lang: { type: "string", description: "Filter by article language, e.g. 'english', 'persian', 'russian', 'arabic'." },
        max_records: { type: "integer", minimum: 1, maximum: 250, description: "Default 25." },
        sort: { type: "string", enum: ["DateDesc", "DateAsc", "HybridRel", "ToneDesc", "ToneAsc"], description: "Default DateDesc." },
        ...COMMON_PROPS,
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "gdelt_tone",
    description:
      "Time series of average media tone (roughly -10 very negative … +10 very positive) and raw article volume for a query. Returns summary stats plus the series.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        source_country: { type: "string", description: "Optional media-country filter (see gdelt_search)." },
        source_lang: { type: "string" },
        include_volume: { type: "boolean", description: "Also fetch article-volume series (one extra GDELT call, ~5s). Default true." },
        ...COMMON_PROPS,
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "gdelt_compare",
    description:
      "Compare how media from 2–3 countries cover the same query: tone stats, article volume and top headlines per country. Use to cross-check each side's version of an event (e.g. unitedstates vs iran). Takes ~5s per GDELT call.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        countries: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "Media countries, e.g. ['unitedstates','iran']." },
        headlines_per_country: { type: "integer", minimum: 1, maximum: 15, description: "Default 5." },
        ...COMMON_PROPS,
      },
      required: ["query", "countries"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ...ANALYST_TOOLS,
];

// News feed for analyst_brief: tone stats + top headlines (2 GDELT calls).
async function newsDigest(query, timespan, headlines) {
  const tp = { timespan };
  const tone = series(await gdelt({ query, mode: "TimelineTone", ...tp }));
  const arts = articles(await gdelt({ query, mode: "ArtList", maxrecords: String(headlines), sort: "HybridRel", ...tp }));
  return { query, timespan, tone_stats: stats(tone), headlines: arts };
}

async function callTool(name, args = {}) {
  const analyst = await callAnalystTool(name, args, { news: newsDigest });
  if (analyst !== undefined) return analyst;
  const tp = timeParams(args);
  if (name === "gdelt_search") {
    const q = buildQuery(args.query, args.source_country, args.source_lang);
    const json = await gdelt({ query: q, mode: "ArtList", maxrecords: String(args.max_records || 25), sort: args.sort || "DateDesc", ...tp });
    const list = articles(json);
    return { query: q, ...tp, count: list.length, articles: list };
  }
  if (name === "gdelt_tone") {
    const q = buildQuery(args.query, args.source_country, args.source_lang);
    const tone = series(await gdelt({ query: q, mode: "TimelineTone", ...tp }));
    const out = { query: q, ...tp, tone_stats: stats(tone), tone_series: tone };
    if (args.include_volume !== false) {
      const vol = series(await gdelt({ query: q, mode: "TimelineVolRaw", ...tp }));
      out.volume_total = vol.reduce((a, p) => a + (Number(p.value) || 0), 0);
      out.volume_series = vol;
    }
    return out;
  }
  if (name === "gdelt_compare") {
    const countries = (args.countries || []).slice(0, 3);
    if (countries.length < 2) throw new Error("countries needs 2–3 entries");
    const n = String(args.headlines_per_country || 5);
    const results = [];
    for (const c of countries) {
      const q = buildQuery(args.query, c);
      const tone = series(await gdelt({ query: q, mode: "TimelineTone", ...tp }));
      const arts = articles(await gdelt({ query: q, mode: "ArtList", maxrecords: n, sort: "HybridRel", ...tp }));
      results.push({ country: c, query: q, tone_stats: stats(tone), top_headlines: arts });
    }
    return {
      query: args.query,
      ...tp,
      note: "Tone = media sentiment, volume = coverage intensity. Divergence shows competing narratives, not which side is factually right.",
      by_country: results,
    };
  }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
}

// ---------- JSON-RPC / MCP ----------
export async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return err(-32600, "Invalid Request");
  if (isNotification) return null;

  switch (method) {
    case "initialize": {
      const req = params?.protocolVersion;
      const protocolVersion = SUPPORTED_VERSIONS.includes(req) ? req : SUPPORTED_VERSIONS[0];
      return ok({
        protocolVersion,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Argus analyst toolkit. analyst_brief gives a one-call research pack per coverage area (gold, dollar, bitcoin, treasuries, oil, equities, geopolitics, us_macro, fed, inflation, us_debt, wars); market_snapshot / macro_indicator / us_debt / asset_correlation for specifics; gdelt_* for news coverage and tone (media coverage, not verified facts; rate-limited ~5s per call). Use the argus_analyst prompt for the methodology.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      try {
        const data = await callTool(params?.name, params?.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (e) {
        if (e.code === -32602) return err(-32602, e.message);
        return ok({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: PROMPTS });
    case "prompts/get": {
      try {
        return ok(getPrompt(params?.name, params?.arguments || {}));
      } catch (e) {
        return err(e.code || -32603, e.message);
      }
    }
    default:
      return err(-32601, `Method not found: ${method}`);
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") return send(res, 200, { status: "ok", uptime_s: Math.round(process.uptime()) });
  if (url.pathname !== MCP_PATH) return send(res, 404, { error: "not found" });

  if (req.method === "GET") return send(res, 405, { error: "SSE stream not supported; use POST" }, { Allow: "POST, DELETE" });
  if (req.method === "DELETE") return send(res, 200, {});
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" }, { Allow: "POST" });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) return send(res, 413, { error: "body too large" });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleRpc))).filter(Boolean);
    return out.length ? send(res, 200, out) : send(res, 202);
  }
  const out = await handleRpc(body);
  return out ? send(res, 200, out) : send(res, 202);
});

server.requestTimeout = 120000;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => console.log(`gdelt-mcp-argus listening on :${PORT}${MCP_PATH === "/mcp" ? " /mcp" : " (token path)"}`));
}
