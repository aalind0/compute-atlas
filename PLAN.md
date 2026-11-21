# Compute Atlas — website plan

> **Every data center on Earth, and the money behind it.**
> A 3D globe where anyone can type their address, spin to their location, see the data centers around them,
> and click any site to learn who owns it, who paid for it, and where that money came from.

## 1. Why this exists

AI turned data centers into the biggest private infrastructure build of the decade, measured in gigawatts and hundreds
of billions of dollars. The information is scattered across press releases, SEC filings, county zoning minutes, trade
press and registries. Nobody shows the physical layer (where the buildings are) and the financial layer (who owns them,
who lent the money, who rents them) in one place. Compute Atlas does both.

## 2. Data layers

| Layer | What | Source | Size |
|---|---|---|---|
| **Base facilities** | Every data center with a public location: colocation, interconnection and enterprise sites | PeeringDB facility registry + OpenStreetMap (`telecom=data_center`, `building=data_center`), de-duplicated | ~8,500 |
| **Campuses** | Hand-researched flagship sites and AI megaprojects with owners, tenants, MW, GPUs, capital stack, energy, controversy, sources | Company releases, SEC filings, government announcements, Reuters/Bloomberg/FT, DCD, Epoch AI | 250+ |
| **Players** | Hyperscalers, AI labs, neoclouds, colo operators, PE/infra funds, sovereign wealth funds, banks, chipmakers, utilities, with HQ coordinates and ownership chains | Same, plus annual reports | 150+ |
| **Deals** | M&A, project finance, SPVs, compute contracts, sovereign commitments, startup rounds | Same | 100+ |
| **Capex** | Hyperscaler capital expenditure by year, actuals and guidance | 10-K/10-Q, earnings releases | 6+ companies |
| **Scrapped** | Cancelled, paused, blocked and scaled-back projects, with the reason and the investment lost | Same, plus local government records | 30+ |
| **Returns** | Cloud revenue, backlog/RPO, AI-lab revenue vs. commitments, rents, vacancy, cap rates, yields, cost per MW | Earnings, CBRE/JLL/Cushman, Turner & Townsend | 60+ metrics |
| **Countries** | Natural Earth boundaries for the dotted globe and per-country stats | Natural Earth (public domain) | 177 |

Every campus, deal and player record carries source links. Unknowns stay blank and are never guessed.
`scripts/build-data.mjs` merges the research files, removes duplicates, links ids, assigns countries, derives money
flows and writes `data/atlas.json` along with a QA report.

## 3. Experience

### Globe (home)
- Full-screen dark globe with dotted continents, an atmosphere glow and a slow idle spin.
- **Search bar:** "Where are you?" Type an address, city or ZIP (OpenStreetMap geocoder) or use device location. The
  globe flies there, drops a radar-sweep marker, and opens **Your compute neighborhood**: counts within 25/100/500 km, the
  nearest facilities with distances, the nearest AI megaproject, and the operators and owners around you.
- **Map modes:**
  1. *Facilities*: every known site as glowing dots, with flagship campuses as 3D towers whose height is power (MW).
  2. *Density*: hexagonal towers showing where data centers cluster.
  3. *Money*: animated arcs from investor headquarters to the projects they fund, colored by investor type.
  4. *Power*: a heat surface of gigawatts in the pipeline.
- **Filters:** status (operational / under construction / planned), type (AI training, cloud, colocation, sovereign,
  crypto-to-AI), minimum MW.
- **Campus drawer:** status, MW now vs planned, investment, GPUs, acres, owners with stakes, developer and operator,
  tenants, **Follow the money** (capital stack plus arcs drawn on the globe), energy, timeline, highlights, controversy,
  sources.
- **Facility drawer** (base layer): operator, networks and exchanges present, links to PeeringDB/OSM, and the
  operator's ownership chain when it matches a known player (e.g. *Equinix facility → Equinix, Inc. (NASDAQ: EQIX)*).
- **Player drawer:** profile, ownership chain, capex/funding, every campus it owns, rents or finances, its deals, and an
  "empire" view of arcs on the globe.
- **HUD details:** live camera coordinates, a deal ticker along the bottom, and a stats strip (facilities, tracked
  capital, GW in the pipeline).

### Money Pulse (snapshot, top of the Money page with a compact version on the globe)
The questions people actually ask: *how much money is pouring in, how much is still in play, what died, and does any of
it earn a return?*
- **Capital tracked:** total value of every sourced deal, split by closed, pending and announced.
- **Deals in the works:** count and dollar value of deals not yet closed.
- **Hyperscaler capex:** last full year's actual against this year's guidance, with growth.
- **Gigawatts:** live vs. under construction vs. planned.
- **Scrapped and stalled:** projects cancelled, paused, blocked or scaled back, with the MW and dollars that never
  happened and why.
- **Cost per megawatt:** median announced investment per MW across campuses.
- **Returns:** cloud revenue and backlog against capex, AI-lab revenue against compute commitments, data center rents,
  vacancy, cap rates and REIT yields. The aim is to show whether the spending is earning anything.

### Money
- A **Sankey** of capital flowing from investor types to investors to destination regions.
- The **web of money**: a force-directed network of players linked by deals, which makes circular financing visible.
- A **deals explorer**: filterable, sortable table with a timeline where circle size is the deal amount.
- **Capex supercycle:** hyperscaler capital expenditure from 2020 through 2026 guidance.

### Players
A searchable grid of every company and investor, filterable by type, opening the player drawer.

### Rankings
Leaderboards for biggest campuses by MW, biggest by investment, largest deals, most active investors, best-funded
neoclouds, countries by facility count and by megawatt pipeline, and operators by facility count.

### Patterns
Story cards computed live from the data, so they stay correct as the data grows:
1. **The gigawatt race:** planned campus size by announcement year.
2. **Follow the power, not the people:** AI campuses sit far from the internet-exchange hubs that legacy colocation
   hugs. Measured as the distance from each campus to the nearest PeeringDB facility.
3. **Where the money comes from vs. where it lands:** capital by investor home country against destination country.
4. **Sovereign wealth goes global:** Gulf and Asian state money flowing into US and European compute.
5. **Circular deals:** money loops detected in the deal graph (supplier invests in customer, which buys from supplier).
6. **Bitcoin miners became AI landlords:** crypto sites converted to AI hosting, and the contracts behind them.
7. **The SPV era:** off-balance-sheet and private-credit financing of megaprojects.
8. **The capex supercycle:** hyperscaler spending growth over time.
9. **Concentration:** share of the world's facilities in the top countries and metros.
10. **Who's the landlord?** Ownership mix of the biggest campuses: hyperscalers, private equity, neoclouds, sovereigns.

### About / Data
Methodology, sources, licenses and attribution (OSM ODbL, PeeringDB, Natural Earth), coverage counts, last-updated
date, known gaps, and a note that nothing here is investment advice.

## 4. Visual language
- **Mood:** mission control at night. Deep navy-black space, a dark globe, light coming from the data.
- **Color = meaning:** cyan for the connected internet (colocation/base), amber for AI megaprojects, violet for sovereign,
  lime for crypto-to-AI, blue for hyperscale cloud. Money arcs are colored by investor type.
- **Type:** Space Grotesk for headlines, Inter for body text, JetBrains Mono for numbers and labels.
- **Surfaces:** frosted glass panels with hairline borders, corner brackets and small uppercase mono captions.
- **Motion:** fly-to camera moves, arcs with animated dashes, pulsing rings over sites under construction, a radar sweep
  at the visitor's location. All of it respects `prefers-reduced-motion`.

## 5. Tech
- Static site with no build step, so it can be hosted anywhere (GitHub Pages, Netlify, Cloudflare Pages).
- **globe.gl 2.46.2** (three.js) for the globe, **d3 7.9.0** and **d3-sankey 0.12.3** for charts. Libraries load from
  jsDelivr with pinned versions.
- Vanilla ES modules with a hash router (`#/globe`, `#/money`, `#/players`, `#/rankings`, `#/patterns`, `#/about`) and
  deep links (`#/globe?campus=stargate-abilene`, `#/globe?player=blackstone`).
- Geocoding through Photon (komoot, OpenStreetMap-based) with Nominatim as fallback. Only the typed query is sent.
- Node scripts with no dependencies: `fetch-base-layer.mjs`, `fetch-countries.mjs`, `build-data.mjs`, `serve.mjs`.

## 6. Roadmap after v1
- A scheduled refresh job that re-pulls PeeringDB/OSM weekly and flags campus records older than 90 days.
- A "submit a correction" form, with each fix reviewed against a source.
- Power-grid overlays (transmission lines, interconnection queues) and water-stress overlays.
- Satellite before/after imagery for megaprojects.
- An embeddable "data centers near you" widget for local newsrooms.
