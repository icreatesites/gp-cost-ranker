#!/usr/bin/env node
// Builds the whole site into ./site. No network. Run `node src/build.js`.
const fs = require('fs'), path = require('path'), yaml = require('js-yaml');
const { TIERS, computeTrip } = require('./model');
const { renderRanked, renderBreakdown, renderRaceHub, renderHeadline, renderMethodology, render404, CSS, JS } = require('./render');

const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data'), OUT = path.join(ROOT, 'site');
const load = f => yaml.load(fs.readFileSync(path.join(DATA, f), 'utf8'));
const SEASON = process.env.SEASON || '2027';
const computedAt = new Date().toISOString().slice(0, 10);

const circuits = Object.fromEntries(load('circuits.yaml').map(c => [c.circuit_id, c]));
const origins = load('origins.yaml');
const cal = load(`calendar/${SEASON}.yaml`);
const ticketsBy = Object.fromEntries(load(`tickets/${SEASON}.yaml`).races.map(t => [t.race_id, t]));
const hotelsBy = Object.fromEntries(load('hotel_rates.yaml').map(h => [h.circuit_id, h]));
const overrides = new Map((load('fare_overrides.yaml') || []).map(o => [`${o.origin_iata}:${o.dest_iata}:${o.month}`, o]));

const races = cal.races.filter(r => r.status !== 'cancelled').map(r => ({ ...r, circuit: circuits[r.circuit_id], tickets: ticketsBy[r.race_id], hotel: hotelsBy[r.circuit_id] }));
for (const r of races) {
  if (!r.circuit) throw new Error(`No circuit ${r.circuit_id} for ${r.race_id}`);
  if (!r.tickets) throw new Error(`No tickets for ${r.race_id}`);
  if (!r.hotel) throw new Error(`No hotel rates for ${r.circuit_id}`);
}

// Recompute the entire grid. ~50 origins x 24 races x 3 tiers x 2 assumptions. Takes well under a second.
const grid = []; // flat trip_cost rows
const byOrigin = {};
for (const origin of origins) {
  byOrigin[origin.slug] = {};
  for (const race of races) {
    byOrigin[origin.slug][race.race_id] = {};
    for (const tier of Object.keys(TIERS)) {
      byOrigin[origin.slug][race.race_id][tier] = {};
      for (const assumption of ['tight', 'relaxed']) {
        const row = computeTrip({ origin, race, circuit: race.circuit, tickets: race.tickets, hotel: race.hotel, overrides, tier, assumption, computedAt });
        grid.push(row);
        byOrigin[origin.slug][race.race_id][tier][assumption] = row;
      }
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'data', 'computed'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'computed', `trip_cost_${SEASON}.json`), JSON.stringify(grid));

const write = (rel, html) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); };
const ctx = { season: SEASON, origins, races, computedAt, statusChecked: cal.status_last_checked };

const SITE = (process.env.SITE_URL || 'https://gp-cost-ranker.icreatesites.workers.dev').replace(/\/$/, '');
write('style.css', CSS);
write('app.js', JS);
write('404.html', render404(ctx));

// Self-hosted font: no third-party request, no render-blocking round trip, no GDPR question.
const fontSrc = path.join(ROOT, 'node_modules', '@fontsource-variable', 'archivo', 'files', 'archivo-latin-standard-normal.woff2');
if (fs.existsSync(fontSrc)) fs.copyFileSync(fontSrc, path.join(OUT, 'archivo.woff2'));
else console.warn('archivo.woff2 not found; run npm ci. Falling back to system fonts.');

const ogSrc = path.join(ROOT, 'assets', 'og.png');
if (fs.existsSync(ogSrc)) fs.copyFileSync(ogSrc, path.join(OUT, 'og.png'));

write('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#5B2BD1"/><path d="M9 8h14v4h-9v4h8v4h-8v6H9z" fill="#fff"/></svg>`);
write('_headers', ['/archivo.woff2', '  Cache-Control: public, max-age=31536000, immutable', '', '/style.css', '  Cache-Control: public, max-age=3600', '', '/app.js', '  Cache-Control: public, max-age=3600', '', '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', ''].join('\n'));
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
// The root is the share link, so it must be a ranked table, not prose. Defaults to one origin;
// the picker in the H1 switches city in one click. Change DEFAULT_ORIGIN to move it.
const DEFAULT_ORIGIN = process.env.DEFAULT_ORIGIN || 'london';
const home = origins.find(o => o.slug === DEFAULT_ORIGIN);
if (!home) throw new Error(`DEFAULT_ORIGIN '${DEFAULT_ORIGIN}' is not in origins.yaml`);
write('index.html', renderRanked(ctx, home, byOrigin[home.slug]));
write(`cheapest-f1-race-${SEASON}/index.html`, renderHeadline(ctx));
write('methodology/index.html', renderMethodology(ctx));
for (const origin of origins) {
  write(`from/${origin.slug}/${SEASON}/index.html`, renderRanked(ctx, origin, byOrigin[origin.slug]));
  for (const race of races) write(`from/${origin.slug}/${race.race_id}/index.html`, renderBreakdown(ctx, origin, race, byOrigin[origin.slug][race.race_id]));
}
for (const race of races) {
  const cheapestOrigins = origins.map(o => ({ origin: o, row: byOrigin[o.slug][race.race_id].standard.tight })).sort((a, b) => a.row.total - b.row.total);
  write(`race/${race.race_id}/index.html`, renderRaceHub(ctx, race, cheapestOrigins));
}
// Sitemap: every page, so crawlers reach all 1,200-odd of them.
const urls = [''];
for (const o of origins) { urls.push(`from/${o.slug}/${SEASON}/`); for (const r of races) urls.push(`from/${o.slug}/${r.race_id}/`); }
for (const r of races) urls.push(`race/${r.race_id}/`);
urls.push(`cheapest-f1-race-${SEASON}/`, 'methodology/');
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `<url><loc>${SITE}/${u}</loc><lastmod>${computedAt}</lastmod></url>`).join('\n') + `\n</urlset>\n`);

const pages = fs.readdirSync(OUT, { recursive: true }).filter(f => f.endsWith('.html')).length;
console.log(`Built ${pages} pages, ${urls.length} sitemap URLs, ${grid.length} trip rows, season ${SEASON}, computed ${computedAt}.`);
