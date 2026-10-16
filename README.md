# gdelt-mcp-argus

Zero-dependency MCP server (Streamable HTTP, Node ≥ 20) for **Argus** — a macro & geopolitical analyst.
No API keys required.

## Coverage (`analyst_brief` directions)

| direction | Covers | Data |
|---|---|---|
| `gold` | Gold | GC=F, silver, DXY, 10y, TIPS real yield, breakevens |
| `dollar` | US dollar | DXY, EUR/USD, USD/JPY, USD/CNY, 2y, curve |
| `bitcoin` | Bitcoin | BTC, ETH, Nasdaq-100, Fed balance sheet, M2 |
| `treasuries` | US Treasuries | 3m/2y/10y/30y, curve, real yield, term premium |
| `oil` | Oil | Brent, WTI, natgas + OPEC/chokepoint news |
| `equities` | S&P 500, Nasdaq, DAX (GER40), Nikkei 225, Hang Seng | indices, VIX, HY spread, NFCI |
| `geopolitics` | Geopolitics | GDELT: US–China, sanctions, instability + gold/oil/VIX |
| `us_macro` | US macro data | payrolls, unemployment (Sahm), claims, GDP, GDPNow, retail |
| `fed` | Federal Reserve | target rate, EFFR, balance sheet, reserves, RRP, 2y vs rate |
| `inflation` | Inflation | CPI/PCE (y/y, 3m annualized), wages, breakevens, UMich |
| `us_debt` | US federal debt | Treasury Debt to the Penny, avg rate, debt/GDP, interest |
| `wars` | Wars & conflicts | GDELT: Russia–Ukraine, Middle East, Taiwan/Asia + oil/gold |

## Tools

- `analyst_brief(direction)` — one-call research pack: markets, macro, correlations, rule-based signals, drivers, news tone.
- `market_snapshot(assets)` — price analytics (changes, 52w range, SMA50/200, RSI, vol). Any Yahoo symbol works.
- `macro_indicator(indicators)` — FRED series with y/y, m/m, q/q SAAR transforms. Any FRED id works.
- `us_debt()` — Treasury debt totals and changes.
- `asset_correlation(pairs)` — rolling return correlation.
- `gdelt_search`, `gdelt_tone`, `gdelt_compare` — news coverage and tone.

Prompt `argus_analyst` (args `direction`, `horizon`) holds the analyst methodology and output format.

## Sources & limits

- **Yahoo Finance** chart API — unofficial, can rate-limit cloud IPs; FRED is used as fallback where a series exists (no fallback for gold, DAX, Hang Seng).
- **FRED** `fredgraph.csv` — official, lagged releases (check `as_of`).
- **US Treasury Fiscal Data** — official.
- **GDELT** — media coverage/tone, not facts; ~5.5s between calls.

## Run

```
npm start           # PORT=3000, endpoint /mcp (or /mcp/$PATH_TOKEN)
npm test            # offline tests, HTTP mocked
```
