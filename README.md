# Compute Atlas

**Every data center on Earth, and the money behind it.**

A 3D globe website. Type your address, fly to your neighborhood, and see the data centers around you. Click any site
to find out who owns it, who financed it, how much went in, and where that money came from. Beyond the globe there
are pages for the money (Money Pulse, flows, deals, capex, returns), the players, leaderboards, and data-driven
patterns.

See [PLAN.md](PLAN.md) for the product plan.

## Run it locally

```bash
node scripts/serve.mjs 8123
```

Then open http://localhost:8123. It's a static site with no build step. Libraries (globe.gl, d3, d3-sankey) load from
jsDelivr at pinned versions. Any static host works: GitHub Pages, Netlify, Cloudflare Pages.

## Data pipeline

```bash
node scripts/fetch-base-layer.mjs   # PeeringDB + OpenStreetMap facilities → data/base-layer.json
node scripts/fetch-countries.mjs    # Natural Earth boundaries → data/countries-110m.geojson
node scripts/build-data.mjs         # research/*.json → data/atlas.json + data/facilities.json + research/QA.md
```

| Folder | What's in it |
|---|---|
| `research/` | Hand-researched JSON (campuses, players, deals, capex, return metrics) following `research/SCHEMA.md`, plus the QA report |
| `data/` | Built files the site loads |
| `js/` | `app.js` (routing), `globe.js` (3D layers and modes), `drawer.js` (detail panels), `search.js` (geocoding and atlas search), `pages.js` (Money/Players/Rankings/Patterns/About), `charts.js` (d3), `store.js` (indexes, money flows, Money Pulse), `util.js` |
| `scripts/` | Fetchers, the data build and a tiny static server |

### Adding or correcting a record
Edit the relevant `research/*.json` file using the shapes in `research/SCHEMA.md`, then run
`node scripts/build-data.mjs`. Every record needs at least one source URL. The build de-duplicates, links player ids,
assigns countries from coordinates, and lists anything suspicious in `research/QA.md`: unresolved ids, coordinates that
fall in a different country, and records still flagged as unverified.

## Sources and licenses
- Facility locations © OpenStreetMap contributors, ODbL 1.0
- Interconnection facilities: PeeringDB
- Country boundaries: Natural Earth (public domain)
- Campus, player and deal records: company releases, filings, government announcements and reputable press, linked per record

Nothing here is investment advice.
