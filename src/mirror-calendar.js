#!/usr/bin/env node
// Nightly: pull the season calendar from Jolpica-F1 and merge it into data/calendar/<season>.yaml.
// Jolpica is volunteer-run with a ~200 req/hour cap. This makes ONE request. Never call it at request time.
// Merge rules: if Jolpica has the round, its date becomes the truth and the race is marked
// status: confirmed, date_source: 'FOM official'. Hand-written fields (notes, session times, status
// for races Jolpica doesn't list yet) are preserved. Run: SEASON=2027 node src/mirror-calendar.js
const fs = require('fs'), path = require('path'), yaml = require('js-yaml');
const SEASON = process.env.SEASON || '2027';
const file = path.join(__dirname, '..', 'data', 'calendar', `${SEASON}.yaml`);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
(async () => {
  const res = await fetch(`https://api.jolpi.ca/ergast/f1/${SEASON}/races/?limit=100`, { headers: { 'User-Agent': 'gp-cost-ranker (github.com/icreatesites/gp-cost-ranker)' } });
  if (!res.ok) { console.error(`Jolpica returned ${res.status}; leaving ${file} untouched.`); process.exit(0); }
  const races = (await res.json()).MRData.RaceTable.Races;
  if (!races.length) { console.log(`Jolpica has no ${SEASON} calendar yet. Nothing to merge.`); return; }
  const cal = yaml.load(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  for (const j of races) {
    const id = slug(j.raceName);
    let r = cal.races.find(x => x.race_id === id);
    if (!r) { r = { race_id: id, name: j.raceName, circuit_id: 'UNKNOWN_' + j.Circuit.circuitId, fp1_local: '13:30', race_local: '15:00', note: 'Added by mirror; set circuit_id and session times.' }; cal.races.push(r); }
    if (r.race_date !== j.date || r.status !== 'confirmed') changed++;
    r.race_date = j.date; r.status = 'confirmed'; r.date_source = 'FOM official';
    if (j.FirstPractice?.time) r.fp1_utc = j.FirstPractice.time; if (j.time) r.race_utc = j.time;
  }
  cal.status_last_checked = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(file, yaml.dump(cal, { lineWidth: 120, quotingType: '"' }));
  console.log(`Merged ${races.length} rounds from Jolpica, ${changed} changed.`);
})().catch(e => { console.error(e.message); process.exit(0); });
