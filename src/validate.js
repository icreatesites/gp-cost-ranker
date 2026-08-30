#!/usr/bin/env node
// Schema check for every file in /data. Runs in CI so a malformed PR fails before anyone reviews it.
const fs = require('fs'), path = require('path'), yaml = require('js-yaml'), Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const D = path.join(__dirname, '..', 'data');
const load = f => yaml.load(fs.readFileSync(path.join(D, f), 'utf8'));
const date = { type: ['string', 'object'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' }; // js-yaml parses bare dates to Date objects
const range = { type: 'array', items: { type: 'number', minimum: 0 }, minItems: 2, maxItems: 2 };
const iata = { type: 'string', pattern: '^[A-Z]{3}$' };
const schemas = {
  'circuits.yaml': { type: 'array', items: { type: 'object', required: ['circuit_id', 'name', 'country', 'lat', 'lon', 'tz_offset_hours', 'nearest_city', 'circuit_transport_gbp_per_day', 'airports'], properties: { circuit_id: { type: 'string', pattern: '^[a-z_]+$' }, lat: { type: 'number' }, lon: { type: 'number' }, airports: { type: 'array', minItems: 1, items: { type: 'object', required: ['iata', 'lat', 'lon', 'transfer_cost_gbp', 'transfer_minutes', 'transfer_mode'], properties: { iata } } } } } },
  'origins.yaml': { type: 'array', items: { type: 'object', required: ['slug', 'city', 'country', 'iata', 'lat', 'lon', 'hub', 'region'], properties: { slug: { type: 'string', pattern: '^[a-z0-9-]+$' }, iata, region: { enum: ['europe', 'north_america', 'asia_pacific', 'middle_east', 'south_america', 'africa'] } } } },
  'hotel_rates.yaml': { type: 'array', items: { type: 'object', required: ['circuit_id', 'budget', 'mid', 'comfortable', 'captured', 'source', 'confidence'], properties: { captured: date, confidence: { enum: ['low', 'medium', 'high'] } } } },
  'fare_overrides.yaml': { type: ['array', 'null'], items: { type: 'object', required: ['origin_iata', 'dest_iata', 'month', 'estimated_return_gbp', 'confidence', 'source', 'last_refreshed'], properties: { origin_iata: iata, dest_iata: iata, month: { type: 'integer', minimum: 1, maximum: 12 }, confidence: { enum: ['low', 'medium', 'high'] }, last_refreshed: date } } },
};
const calendar = { type: 'object', required: ['season', 'status_last_checked', 'races'], properties: { races: { type: 'array', items: { type: 'object', required: ['race_id', 'name', 'circuit_id', 'race_date', 'status', 'date_source', 'fp1_local', 'race_local'], properties: { race_id: { type: 'string', pattern: '^[a-z-]+$' }, race_date: date, status: { enum: ['confirmed', 'provisional', 'rumoured', 'cancelled'] }, date_source: { enum: ['FOM official', 'circuit ticketing', 'press reporting'] }, fp1_local: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }, race_local: { type: 'string', pattern: '^\\d{2}:\\d{2}$' } } } } } };
const tickets = { type: 'object', required: ['season', 'races'], properties: { races: { type: 'array', items: { type: 'object', required: ['race_id', 'ga', 'gs_cheapest', 'gs_main', 'obtainability', 'source', 'confidence', 'captured'], properties: { ga: range, gs_cheapest: range, gs_main: range, obtainability: { enum: ['easy', 'moderate', 'hard', 'sells_out_instantly'] }, confidence: { enum: ['low', 'medium', 'high'] }, captured: date } } } } };

let failed = false;
const check = (file, schema) => {
  let data; try { data = load(file); } catch (e) { console.error(`${file}: YAML parse error: ${e.message}`); failed = true; return null; }
  const v = ajv.compile(schema);
  if (!v(data)) { failed = true; for (const e of v.errors) console.error(`${file}${e.instancePath}: ${e.message}`); }
  return data;
};
const circuits = check('circuits.yaml', schemas['circuits.yaml']) || [];
check('origins.yaml', schemas['origins.yaml']);
const hotels = check('hotel_rates.yaml', schemas['hotel_rates.yaml']) || [];
check('fare_overrides.yaml', schemas['fare_overrides.yaml']);
const circuitIds = new Set(circuits.map(c => c.circuit_id)), hotelIds = new Set(hotels.map(h => h.circuit_id));
for (const f of fs.readdirSync(path.join(D, 'calendar'))) {
  const cal = check(`calendar/${f}`, calendar); if (!cal) continue;
  const season = f.replace('.yaml', '');
  const tk = fs.existsSync(path.join(D, 'tickets', f)) ? check(`tickets/${f}`, tickets) : null;
  const tkIds = new Set(tk ? tk.races.map(r => r.race_id) : []);
  for (const r of cal.races) {
    if (!circuitIds.has(r.circuit_id)) { failed = true; console.error(`calendar/${f}: ${r.race_id} references unknown circuit ${r.circuit_id}`); }
    if (!hotelIds.has(r.circuit_id)) { failed = true; console.error(`hotel_rates.yaml: no rates for ${r.circuit_id} (needed by ${season})`); }
    if (r.status !== 'cancelled' && !tkIds.has(r.race_id)) { failed = true; console.error(`tickets/${f}: no ticket row for ${r.race_id}`); }
    for (const [lo, hi] of ['ga', 'gs_cheapest', 'gs_main'].map(k => (tk && tk.races.find(x => x.race_id === r.race_id) || {})[k] || [0, 0])) if (lo > hi) { failed = true; console.error(`tickets/${f}: ${r.race_id} has a range with low > high`); }
  }
}
if (failed) { console.error('\nValidation failed.'); process.exit(1); }
console.log('All data files valid.');
