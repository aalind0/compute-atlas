# Compute Atlas — research data contract

Every research file is a single JSON document: `{ "generated": "2026-11-20", "notes": "...", "<collection>": [ ... ] }`.
Use the shapes below. Use `null` for anything unknown. **Never invent numbers, owners or coordinates.** If a figure
is reported, cite it; if sources disagree, pick the best-sourced one and say so in a `...Note` field.
Money is always in **USD** (convert at the rate on the announcement date, say so in the note, keep the original
e.g. "A$24B" in the note). Dates are `YYYY-MM-DD` or `YYYY-MM` or `YYYY`.

Today is 2026-11-20. Prefer the latest status (things announced in 2024–2026 move fast: check for late-2025 and 2026 updates,
cancellations, expansions, renamed projects).

Source quality, best first: company press releases / investor relations / SEC & regulator filings / government
announcements → Reuters, Bloomberg, FT, WSJ, CNBC, AP, Nikkei → trade press (DatacenterDynamics, Data Center Frontier,
Data Center Knowledge, The Information, SemiAnalysis, Epoch AI, Baxtel, datacentermap) → local news. Every record needs
at least one source with a URL; two or more independent sources for big numbers.

## Entity ids (shared across all files)

Kebab-case short common name. Use these when they apply, invent new ones the same way otherwise:
google, microsoft, amazon (AWS too), meta, oracle, apple, openai, anthropic, xai, softbank, nvidia, amd, broadcom,
blackrock, gip (Global Infrastructure Partners), mgx, blackstone, kkr, brookfield, blue-owl, apollo, carlyle, tpg, eqt,
stonepeak, digitalbridge, silver-lake, macquarie, ares, pimco, jpmorgan, morgan-stanley, goldman-sachs, mufg,
crusoe, coreweave, nebius, lambda, nscale, fluidstack, together-ai, applied-digital, iren, core-scientific, cipher-mining,
terawulf, galaxy-digital, hut-8, digital-realty, equinix, qts, vantage, aligned, stack-infrastructure, cyrusone, switch,
edgeconnex, cologix, compass, cloudhq, yondr, ntt-data, st-telemedia (STT GDC), princeton-digital, airtrunk, nextdc,
g42, khazna, humain, pif, mubadala, adia, adq, qia, gic, temasek, cpp-investments, cdpq, psp, ontario-teachers,
reliance, adani, airtel, tata, yotta, sify, ctrls, alibaba, tencent, bytedance, baidu, chindata, gds, kddi, sakura-internet,
sk-group, samsung, ytl, nvidia, schneider, vertiv, dominion-energy, entergy, constellation, talen, nextera.

## campuses (files: campuses_*.json → key "campuses")

```json
{
  "id": "stargate-abilene",
  "name": "Stargate Abilene (Lancium Clean Campus)",
  "aka": ["Project Ludicrous"],
  "lat": 32.50, "lng": -99.78,
  "coordPrecision": "site | city | region",
  "city": "Abilene", "region": "Texas", "country": "United States", "countryCode": "US",
  "status": "operational | partially operational | under construction | planned | announced | paused | cancelled",
  "type": "ai-training | ai-inference | hyperscale-cloud | colocation | sovereign-ai | crypto-to-ai | enterprise | cluster",
  "powerMW": 1200, "powerMWNow": 200, "powerNote": "facility power at full build; ~200 MW live mid-2025",
  "acres": 875, "sizeSqft": null,
  "compute": "Up to ~400k NVIDIA GB200 planned",
  "investmentUSD": 15000000000, "investmentNote": "what the figure covers and who said it",
  "owners":  [{ "name": "Crusoe/Blue Owl/Primary Digital JV", "entityId": "crusoe", "stakePct": null }],
  "developer": "Crusoe", "operator": "Crusoe",
  "tenants": [{ "name": "Oracle", "entityId": "oracle", "role": "anchor lessee" }, { "name": "OpenAI", "entityId": "openai", "role": "end user" }],
  "capitalStack": [{ "from": "Blue Owl", "entityId": "blue-owl", "kind": "equity | debt | jv | lease | public-incentive | vendor-financing | spv | capex",
                     "amountUSD": 15000000000, "date": "2025-05", "note": "JPMorgan-led construction loans", "url": "https://..." }],
  "energy": "ERCOT grid + on-site gas turbines; wind",
  "water": null,
  "announced": "2024-06", "expectedOnline": "2026",
  "highlights": ["One-line facts a curious visitor would love"],
  "controversy": "Local opposition / tax-break / water / grid issues, if any (one or two sentences), else null",
  "sources": [{ "title": "...", "publisher": "...", "url": "https://...", "date": "2025-09-23" }]
}
```

`type: "cluster"` is for a market-level pin (e.g. Northern Virginia's Data Center Alley) — give an aggregate MW figure and the main operators in `owners`.

## entities (files: entities_*.json → key "entities")

```json
{
  "id": "blackstone",
  "name": "Blackstone",
  "kind": "hyperscaler | ai-lab | neocloud | colo-operator | developer | crypto-miner | private-equity | infra-fund |
           sovereign-wealth | pension | asset-manager | bank | chipmaker | utility | energy | government | conglomerate | telco | other",
  "hq": { "city": "New York", "country": "United States", "countryCode": "US", "lat": 40.758, "lng": -73.978 },
  "public": true, "ticker": "BX",
  "founded": 1985,
  "description": "Two sentences on what it is and why it matters to data centers.",
  "dcExposure": "e.g. owns QTS (acq. 2021, $10B) and AirTrunk (2024, A$24B); $70B+ data center portfolio",
  "capexUSD": { "2024": null, "2025": null, "2026": null }, "capexNote": "for hyperscalers: total capex & guidance",
  "fundingUSD": null, "valuationUSD": null, "fundingNote": "for startups/neoclouds: total raised, last round, valuation, lead investors",
  "aumUSD": null,
  "ownedBy": [{ "entityId": "blackrock", "stakePct": 100, "note": "acquired 2024" }],
  "keyFacts": ["..."],
  "sources": [{ "title": "...", "publisher": "...", "url": "https://...", "date": "..." }]
}
```

## deals (files: deals_*.json → key "deals")

```json
{
  "id": "aip-aligned-2025",
  "date": "2025-10-15",
  "title": "AI Infrastructure Partnership + MGX buy Aligned Data Centers",
  "kind": "acquisition | equity-raise | debt | project-finance | jv | spv | lease | compute-contract | sovereign-commitment | capex-commitment | ipo | power-deal",
  "amountUSD": 40000000000, "amountNote": "enterprise value",
  "investors": [{ "name": "BlackRock (GIP)", "entityId": "blackrock" }, { "name": "MGX", "entityId": "mgx" }],
  "target":    { "name": "Aligned Data Centers", "entityId": "aligned" },
  "sellers":   [{ "name": "Macquarie Asset Management", "entityId": "macquarie" }],
  "campusIds": [],
  "status": "announced | pending | closed | cancelled",
  "summary": "Two sentences: what happened and why it matters.",
  "sources": [{ "title": "...", "publisher": "...", "url": "https://...", "date": "..." }]
}
```

## capex (file: capex.json → key "capex")

```json
{ "entityId": "microsoft", "year": 2025, "fiscal": "FY ends Jun-2025", "capexUSD": 88000000000, "kind": "actual | guidance",
  "note": "incl. finance leases", "url": "https://..." }
```
