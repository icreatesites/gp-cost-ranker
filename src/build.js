#!/usr/bin/env node
// Builds the whole site into ./site. No network. Run `node src/build.js`.
const fs = require('fs'), path = require('path'), yaml = require('js-yaml');
const { TIERS, computeTrip } = require('./model');
const { renderRanked, renderBreakdown, renderRaceHub, renderHeadline, renderMethodology, CSS, JS } = require('./render');

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

write('style.css', CSS);
write('app.js', JS);
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
const pages = fs.readdirSync(OUT, { recursive: true }).filter(f => f.endsWith('.html')).length;
console.log(`Built ${pages} pages, ${grid.length} trip rows, season ${SEASON}, computed ${computedAt}.`);
