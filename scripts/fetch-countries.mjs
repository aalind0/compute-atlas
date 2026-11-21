// Downloads Natural Earth country boundaries (public domain) and writes:
//   data/countries-110m.geojson  — light version for drawing the globe (name, iso2, continent)
//   scripts/.cache/countries-50m.geojson — finer version used at build time to assign facilities to countries
// Usage: node scripts/fetch-countries.mjs
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/';

const get = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'ComputeAtlas/0.1 build script' } }, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });

const iso2 = (p) => {
  for (const k of ['ISO_A2_EH', 'ISO_A2', 'WB_A2', 'POSTAL']) if (p[k] && p[k] !== '-99' && /^[A-Z]{2}$/.test(p[k])) return p[k];
  return null;
};
const r = (x) => Math.round(x * 1e3) / 1e3;
const roundCoords = (c) => (typeof c[0] === 'number' ? [r(c[0]), r(c[1])] : c.map(roundCoords));

function slim(geo, precise) {
  return {
    type: 'FeatureCollection',
    features: geo.features.map((f) => ({
      type: 'Feature',
      properties: {
        name: f.properties.NAME_EN || f.properties.NAME || f.properties.ADMIN,
        iso2: iso2(f.properties),
        continent: f.properties.CONTINENT,
        region: f.properties.REGION_WB || f.properties.SUBREGION,
      },
      geometry: precise ? f.geometry : { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
    })),
  };
}

fs.mkdirSync(path.join(root, 'scripts', '.cache'), { recursive: true });
const g110 = JSON.parse(await get(base + 'ne_110m_admin_0_countries.geojson'));
fs.writeFileSync(path.join(root, 'data', 'countries-110m.geojson'), JSON.stringify(slim(g110, false)));
console.log('110m countries:', g110.features.length);
const g50 = JSON.parse(await get(base + 'ne_50m_admin_0_countries.geojson'));
fs.writeFileSync(path.join(root, 'scripts', '.cache', 'countries-50m.geojson'), JSON.stringify(slim(g50, true)));
console.log('50m countries:', g50.features.length);
