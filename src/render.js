const { TIERS } = require('./model');
const REPO = 'https://github.com/icreatesites/gp-cost-ranker'; // change once, used for every edit link
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, ''); // e.g. /gp-cost-ranker when served under a sub-path

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = d => { const [y, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[m - 1]} ${y}`; };
const shortDate = d => { const [, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[m - 1]}`; };
const TIER_KEYS = Object.keys(TIERS);

const STATUS = {
  confirmed:   { flag: 'green',  word: 'confirmed',  hint: 'Date published by the circuit or FOM.' },
  provisional: { flag: 'yellow', word: 'provisional', hint: 'Reported or inferred. Do not book anything non-refundable on this date.' },
  rumoured:    { flag: 'yellow2', word: 'rumoured',  hint: 'The race itself is not certain to happen.' },
  cancelled:   { flag: 'red',    word: 'cancelled',  hint: 'Off the calendar.' },
};
const OBTAIN = { easy: null, moderate: null, hard: 'hard to get', sells_out_instantly: 'sells out instantly' };

function dateCell(race) {
  const s = STATUS[race.status];
  if (race.status === 'confirmed') return `<span class="date">${shortDate(race.race_date)}</span>`;
  return `<span class="date date-soft" title="${esc(s.hint)}">${shortDate(race.race_date)}<small>${s.word}</small></span>`;
}
function statusLine(race) {
  const s = STATUS[race.status];
  return `<span class="flag flag-${s.flag}"></span><b>${longDate(race.race_date)}</b>, ${s.word}. ${esc(s.hint)} Source: ${esc(race.date_source)}.` + (race.note ? ` ${esc(race.note)}` : '');
}
const confPill = c => `<span class="conf conf-${c}">${c} confidence</span>`;

function originSelect(ctx, current, hrefFor) {
  const opts = ctx.origins.map(o => `<option value="${hrefFor(o)}"${current && o.slug === current.slug ? ' selected' : ''}>${esc(o.city)}</option>`).join('');
  return `<select class="origin-pick" aria-label="Origin airport" onchange="location.href=this.value">${current ? '' : '<option value="">pick your airport</option>'}${opts}</select>`;
}

function layout(ctx, { title, body, origin }) {
  const seasonHref = o => `${BASE}/from/${o.slug}/${ctx.season}/`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="${BASE}/style.css"><script defer src="${BASE}/app.js"></script></head>
<body>
<header class="top"><a class="mark" href="${BASE}/">GP cost ranker</a><nav>${originSelect(ctx, origin, seasonHref)}<a href="${BASE}/methodology/">How the numbers work</a><a href="${REPO}">GitHub</a></nav></header>
<main>${body}</main>
<footer><p>Free, open source, maintained by whoever turns up. Every number links to the file it came from; fix it by pull request. Calendar data mirrored from <a href="https://api.jolpi.ca/">Jolpica-F1</a>, which runs on donations. Nothing is sold here; ticket and travel links go to the seller. Not affiliated with Formula 1.</p></footer>
</body></html>`;
}

// /from/<origin>/<season>/  the ranked table, the page that has to be better than any article
function renderRanked(ctx, origin, rows) {
  const tables = TIER_KEYS.map(tier => {
    const list = ctx.races.map(r => ({ race: r, row: rows[r.race_id][tier].tight })).sort((a, b) => a.row.total - b.row.total);
    const mins = {}; for (const k of ['ticket', 'flights', 'accom', 'transfer', 'total']) mins[k] = Math.min(...list.map(x => x.row[k]));
    const cell = (v, k) => `<td class="num${v === mins[k] ? ' best' : ''}">${gbp(v)}</td>`;
    const trs = list.map(({ race, row }, i) => `
<tr class="st-${STATUS[race.status].flag}">
 <td class="rank">${i + 1}</td>
 <td class="race"><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(race.name)}</a><small>${esc(race.circuit.nearest_city)}${OBTAIN[row.obtainability] ? ` · tickets ${OBTAIN[row.obtainability]}` : ''}</small></td>
 <td>${dateCell(race)}</td>
 ${cell(row.ticket, 'ticket')}${cell(row.flights, 'flights')}
 <td class="num${row.accom === mins.accom ? ' best' : ''}">${gbp(row.accom)}<small>${row.nights} night${row.nights === 1 ? '' : 's'}</small></td>
 ${cell(row.transfer, 'transfer')}
 <td class="num total${row.total === mins.total ? ' best' : ''}">${gbp(row.total)}</td>
 <td>${confPill(row.confidence)}</td>
</tr>`).join('');
    return `<table class="ranked" data-tier="${tier}"${tier === 'standard' ? '' : ' hidden'}>
<thead><tr><th></th><th>Race</th><th>Date</th><th class="num">Ticket</th><th class="num">Flights</th><th class="num">Stay</th><th class="num">Getting about</th><th class="num">Total</th><th>Data</th></tr></thead><tbody>${trs}</tbody></table>`;
  }).join('');

  const body = `
<section class="hero">
 <h1>Cheapest F1 race from ${originSelect(ctx, origin, o => `${BASE}/from/${o.slug}/${ctx.season}/`)} in ${ctx.season}</h1>
 <p class="lede">Every race on the ${ctx.season} calendar ranked by what the whole weekend costs from ${esc(origin.city)} (${origin.iata}): ticket, return flight, the nights the flight schedule actually forces, and getting to and from the track. Per person, in pounds. Ranked on the standard tier.</p>
 <div class="tiers" role="tablist">${TIER_KEYS.map(t => `<button role="tab" data-tier="${t}" aria-selected="${t === 'standard'}">${TIERS[t].label}</button>`).join('')}<span class="tier-blurb">${TIER_KEYS.map(t => `<span data-tier="${t}"${t === 'standard' ? '' : ' hidden'}>${TIERS[t].blurb}</span>`).join('')}</span></div>
</section>
${tables}
<section class="notes">
 <p><span class="best-key">Purple</span> is the cheapest in that column, the way a timing screen marks the fastest sector. A <span class="flag flag-yellow"></span> yellow stripe means the date is provisional or the race is only rumoured; <span class="flag flag-green"></span> green means the circuit or FOM has published it. The ${ctx.season} calendar was not confirmed by FOM when this was built. Status last checked ${longDate(ctx.statusChecked)}.</p>
 <p>Ticket prices are the midpoint of a range, because dynamic pricing means there is no single number. Flights are estimates for the order of magnitude, not a fare you can book; click a race for how the number was reached and what to search. Most figures here are low confidence: that is the honest state of the data nine months out, and every competing page that gives you a precise number is guessing too.</p>
 <p>Computed ${longDate(ctx.computedAt)}. Wrong? <a href="${REPO}/blob/main/data/">Edit the data on GitHub</a>.</p>
</section>`;
  return layout(ctx, { title: `Cheapest F1 race from ${origin.city}, ${ctx.season}`, body, origin });
}

// /from/<origin>/<race>/  the full breakdown with the nights toggle
function renderBreakdown(ctx, origin, race, byTier) {
  const s = byTier.standard.tight;
  const cols = TIER_KEYS.map(t => TIERS[t].label);
  const line = (label, key, fmt = gbp, extra = '') => `<tr><th>${label}${extra}</th>${TIER_KEYS.map(t => `<td class="num" data-tier="${t}" data-tight="${fmt(byTier[t].tight[key])}" data-relaxed="${fmt(byTier[t].relaxed[key])}">${fmt(byTier[t].tight[key])}</td>`).join('')}</tr>`;
  const nightsRow = `<tr class="nights"><th>Nights <span class="assume"><button data-assume="tight" aria-pressed="true">fly tight</button><button data-assume="relaxed" aria-pressed="false">arrive day before, leave day after</button></span></th>${TIER_KEYS.map(t => `<td class="num" data-tight="${byTier[t].tight.nights}" data-relaxed="${byTier[t].relaxed.nights}">${byTier[t].tight.nights}</td>`).join('')}</tr>`;
  const why = TIER_KEYS.map(t => `<div data-assume-text="tight" data-tier="${t}"${t === 'standard' ? '' : ' hidden'}><p>${byTier[t].tight.nights_why.map(esc).join(' ')}</p></div><div data-assume-text="relaxed" data-tier="${t}" hidden><p>${byTier[t].relaxed.nights_why.map(esc).join(' ')}</p></div>`).join('');

  const body = `
<p class="crumb"><a href="${BASE}/from/${origin.slug}/${ctx.season}/">All races from ${esc(origin.city)}</a> · <a href="${BASE}/race/${race.race_id}/">${esc(race.name)} hub</a></p>
<section class="hero">
 <h1>${esc(race.name)} from ${esc(origin.city)}</h1>
 <p class="status">${statusLine(race)}</p>
 <p class="lede">A standard weekend costs about <b>${gbp(s.total)}</b> per person: ${gbp(s.ticket)} ticket, ${gbp(s.flights)} flights ${origin.iata} to ${s.airport}, ${s.nights} night${s.nights === 1 ? '' : 's'} at ${gbp(s.nightly)} in ${esc(race.circuit.nearest_city)}, ${gbp(s.transfer)} getting around. ${confPill(s.confidence)}</p>
</section>
<table class="breakdown">
<thead><tr><th></th>${cols.map(c => `<th class="num">${c}</th>`).join('')}</tr></thead>
<tbody>
${line('Ticket', 'ticket', gbp, ` <small>${esc(s.ticket_source)}; range ${gbp(s.ticket_range[0])} to ${gbp(s.ticket_range[1])} for standard.</small>`)}
${line('Return flight', 'flights', gbp, ` <small>${esc(s.flight_source)} Fly to ${s.airport}, about ${s.flight_hours}h each way.</small>`)}
${nightsRow}
${line('Stay', 'accom', gbp, ` <small>${gbp(s.nightly)} a night mid-range, ${esc(race.hotel.source)}, captured ${longDate(s.hotel_captured)}.${s.hotel_stale ? ' Over a year old; treat as a guess.' : ''}</small>`)}
${line('Getting about', 'transfer', gbp, ` <small>${s.airport} to town by ${esc(s.transfer_mode)}, ${gbp(s.transfer_each_way)} each way, ${s.transfer_minutes} min, plus ${gbp(race.circuit.circuit_transport_gbp_per_day)} a day to the track.</small>`)}
<tr class="total"><th>Total</th>${TIER_KEYS.map(t => `<td class="num" data-tight="${gbp(byTier[t].tight.total)}" data-relaxed="${gbp(byTier[t].relaxed.total)}">${gbp(byTier[t].tight.total)}</td>`).join('')}</tr>
</tbody></table>
<section class="nights-why">
 <h2 data-tight="Why ${s.nights} night${s.nights === 1 ? '' : 's'}" data-relaxed="Why ${byTier.standard.relaxed.nights} night${byTier.standard.relaxed.nights === 1 ? '' : 's'}">Why ${s.nights} night${s.nights === 1 ? '' : 's'}</h2>
 ${why}
 <p class="muted">Standard tier shown. The cheapest flight is not the cheapest trip if it makes you sleep somewhere an extra night; that coupling is the whole point of this site. Toggle the assumption above and watch the total move.</p>
</section>
<section class="next">
 <h2>What to do with this</h2>
 <p>Search flights ${origin.iata} to ${s.airport} around ${longDate(s.arrive)} out and ${longDate(s.depart)} back, and compare against the estimate here. Tickets: check the <a href="${BASE}/race/${race.race_id}/">race hub</a> for the official circuit link and on-sale date; secondary and hospitality prices are aggregated at <a href="https://fastway1.com">Fastway1</a>.${race.status !== 'confirmed' ? ' Book nothing non-refundable until the date is confirmed.' : ''}</p>
 <p class="muted">Every number on this page comes from a file in <a href="${REPO}/tree/main/data">/data</a>. If you searched this route or paid for this hotel, <a href="${REPO}/blob/main/CONTRIBUTING.md">send a fix</a>: one line of YAML beats this estimate. Computed ${longDate(ctx.computedAt)}.</p>
</section>`;
  return layout(ctx, { title: `${race.name} from ${origin.city}: full ${ctx.season} weekend cost`, body, origin });
}

// /race/<race>/
function renderRaceHub(ctx, race, cheapestOrigins) {
  const c = race.circuit, t = race.tickets;
  const aps = c.airports.map(a => `<tr><td>${a.iata}</td><td>${esc(a.transfer_mode)}</td><td class="num">${a.transfer_minutes} min</td><td class="num">${gbp(a.transfer_cost_gbp)}</td></tr>`).join('');
  const top = cheapestOrigins.slice(0, 12).map(({ origin, row }, i) => `<tr><td class="rank">${i + 1}</td><td><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(origin.city)}</a></td><td class="num">${gbp(row.flights)}</td><td class="num">${row.nights}</td><td class="num total">${gbp(row.total)}</td></tr>`).join('');
  const body = `
<section class="hero">
 <h1>${esc(race.name)} ${ctx.season}</h1>
 <p class="status">${statusLine(race)}</p>
 <p class="lede">${esc(c.name)}, ${esc(c.country)}. ${esc(c.notes)}</p>
</section>
<div class="two">
<section>
 <h2>Tickets</h2>
 <table class="plain"><tbody>
 <tr><th>General admission</th><td class="num">${gbp(t.ga[0])} to ${gbp(t.ga[1])}</td></tr>
 <tr><th>Cheapest grandstand</th><td class="num">${gbp(t.gs_cheapest[0])} to ${gbp(t.gs_cheapest[1])}</td></tr>
 <tr><th>Main straight grandstand</th><td class="num">${gbp(t.gs_main[0])} to ${gbp(t.gs_main[1])}</td></tr>
 <tr><th>Availability</th><td>${esc(t.obtainability.replace(/_/g, ' '))}</td></tr>
 <tr><th>On sale</th><td>${t.on_sale ? longDate(String(t.on_sale)) : 'not announced'}</td></tr>
 </tbody></table>
 <p class="muted">${esc(t.source)}. ${confPill(t.confidence)} Captured ${longDate(String(t.captured))}. <a href="${REPO}/blob/main/data/tickets/${ctx.season}.yaml">Edit</a>.</p>
 <h2>Airports and transfers</h2>
 <table class="plain"><thead><tr><th>Airport</th><th>To town</th><th class="num">Time</th><th class="num">Cost</th></tr></thead><tbody>${aps}</tbody></table>
 <p class="muted">Then about ${gbp(c.circuit_transport_gbp_per_day)} a day between ${esc(c.nearest_city)} and the track. <a href="${REPO}/blob/main/data/circuits.yaml">Edit</a>.</p>
 <h2>Where you'd sleep</h2>
 <p>Race weekend, per night: ${gbp(race.hotel.budget)} budget, ${gbp(race.hotel.mid)} mid-range, ${gbp(race.hotel.comfortable)} comfortable. ${esc(race.hotel.source)}, captured ${longDate(String(race.hotel.captured))}. <a href="${REPO}/blob/main/data/hotel_rates.yaml">Edit</a>.</p>
</section>
<section>
 <h2>Cheapest origins, standard tier</h2>
 <table class="plain"><thead><tr><th></th><th>From</th><th class="num">Flights</th><th class="num">Nights</th><th class="num">Total</th></tr></thead><tbody>${top}</tbody></table>
 <p class="muted">Your city not here? <a href="${REPO}/blob/main/data/origins.yaml">Add it</a>: one line of YAML.</p>
</section>
</div>`;
  return layout(ctx, { title: `${race.name} ${ctx.season}: cost to attend from ${ctx.origins.length} cities`, body });
}

// /cheapest-f1-race-<season>/ and /
function renderHeadline(ctx) {
  // A table of ticket-only vs the median "total from Europe" makes the gap obvious without picking an origin.
  const body = `
<section class="hero">
 <h1>Cheapest F1 race in ${ctx.season} from ${originSelect(ctx, null, o => `${BASE}/from/${o.slug}/${ctx.season}/`)}</h1>
 <p class="lede">Every list of cheap F1 races ranks the ticket. The ticket is a third of the weekend, sometimes a fifth. Pick your airport and get the whole thing: ticket, flights, the nights the flight times actually force, and getting to the track.</p>
</section>
<section class="notes">
 <h2>Why the ticket ranking is the wrong ranking</h2>
 <p>China has the cheapest ticket on the calendar and sells out to local demand in minutes. Monaco's general admission is cheaper than Miami's, and the flight from most of Europe is a short hop, but you sleep in Nice at race-weekend rates. Las Vegas has the dearest tickets and the cheapest getting-about of any race, because you walk. None of that shows up until you add the columns up from where you live.</p>
 <p>The ${ctx.season} calendar is not confirmed. Only Monaco and Silverstone have published dates. Everything else here is a reported or inferred slot, marked as such, and you should book nothing non-refundable on the strength of it.</p>
 <h2>Race hubs</h2>
 <ul class="hubs">${ctx.races.map(r => `<li><span class="flag flag-${STATUS[r.status].flag}"></span><a href="${BASE}/race/${r.race_id}/">${esc(r.name)}</a> <small>${dateCell(r)}</small></li>`).join('')}</ul>
</section>`;
  return layout(ctx, { title: `Cheapest F1 race ${ctx.season}: total weekend cost from your city`, body });
}

function renderMethodology(ctx) {
  const body = `
<section class="hero"><h1>How every number is worked out</h1>
<p class="lede">Short version: it is a spreadsheet, the inputs are plain text files anyone can edit, and every figure carries how confident we are and when someone last checked it.</p></section>
<section class="prose">
<h2>The sum</h2>
<pre>total = ticket
      + return flight
      + nights × nightly rate
      + 2 × airport transfer
      + daily track transport × race days</pre>
<p>Per person, in pounds, for a solo traveller. Two people sharing a room should halve the stay line.</p>
<h2>Tiers</h2>
<p>${TIER_KEYS.map(t => `<b>${TIERS[t].label}</b>: ${TIERS[t].blurb}`).join(' ')} Rankings use the standard tier.</p>
<h2>Nights</h2>
<p>This is the bit nobody else does. For each origin and circuit we estimate flight time from distance, add the airport transfer, and ask two questions. Can a 06:00 departure get you to the track before the first session you're attending? If not, you need a night before. Can you get from the chequered flag to the airport with two and a half hours to spare before a 23:00 last departure? If not, you need a night after. Night races nearly always fail the second test. Long haul (over about five and a half hours) always adds the night before.</p>
<p>The <i>fly tight</i> assumption applies those tests. The <i>relaxed</i> assumption arrives the day before and leaves the day after regardless. Both are shown; the ranking uses tight because that's the cheapest honest schedule.</p>
<h2>Flights</h2>
<p>There is no live flight search on this site and there never will be. Amadeus's free API closed in July 2026 and Kiwi's went invite-only, so fares come from two places. First, <code>data/fare_overrides.yaml</code>: routes someone has actually searched or paid for, marked medium or high confidence. Second, for everything else, a distance model: a fixed cost plus a per-kilometre rate, multiplied for race-weekend demand and summer, with a penalty for long-haul from airports without direct flights. It is crude on purpose. It exists to get the order of the races right, and it is marked low confidence everywhere it is used. The fix is a one-line pull request with a real fare.</p>
<h2>Tickets</h2>
<p>Ranges, not numbers, because Silverstone, Melbourne and Abu Dhabi use dynamic pricing and the others are heading that way. Sourced from official circuit sites; most ${ctx.season} prices are last year's indexed up by about 8%, marked medium confidence, until circuits publish. Availability is modelled separately from price: a cheap ticket you can't buy is not cheap, and China and São Paulo are flagged accordingly.</p>
<h2>Hotels</h2>
<p>Nightly rate bands per circuit for the town a sensible person on that budget stays in: Nice for Monaco, Nagoya for Suzuka, camping for Austria if you're on a shoestring. Race-weekend rates spike late, so these assume booking six to nine months out. Any rate over a year old is greyed and flagged.</p>
<h2>Calendar</h2>
<p>Mirrored nightly from Jolpica-F1 into a plain file, with a status on every race: confirmed, provisional, rumoured or cancelled, and where the date came from. The ${ctx.season} calendar was not confirmed when this was written. Provisional dates are rendered differently from confirmed ones, always.</p>
<h2>Confidence</h2>
<p>Each trip's badge is the weakest of its ticket, flight and hotel confidence. Low means an editor's estimate or a model. Medium means a published figure that's a year old or a sampled search. High means the current official price or a fare someone actually paid. Most of the site is low right now. That is the true state of knowledge nine months before a race, and we would rather say so.</p>
<h2>What this site is not</h2>
<p>It sells nothing, holds no basket, and never will; packaging travel triggers ATOL and the Package Travel Regulations. It doesn't aggregate tickets; <a href="https://fastway1.com">Fastway1</a> does that. It doesn't replace the excellent ticket-price rankings at GPDestinations; it ranks the thing they can't, which is your weekend from your airport.</p>
<h2>Fix something</h2>
<p>All inputs live in <a href="${REPO}/tree/main/data">/data</a> as YAML, validated in CI. <a href="${REPO}/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a> walks through a first pull request in five minutes.</p>
</section>`;
  return layout(ctx, { title: 'How the numbers work', body });
}

const CSS = `
:root{--bg:#EEF0F3;--surface:#fff;--ink:#1F2328;--muted:#5F6773;--rule:#CBD1DA;--purple:#6D3BE0;--green:#1E9E5A;--yellow:#E5B520;--red:#D6392E;--tint:#F5F1FE}
*{box-sizing:border-box}html{font-size:16px}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.45;font-variant-numeric:tabular-nums}
a{color:inherit;text-decoration-color:var(--purple);text-underline-offset:3px}a:hover{color:var(--purple)}
main{max-width:1080px;margin:0 auto;padding:0 20px 60px}
.top{display:flex;align-items:center;gap:24px;padding:14px 20px;border-bottom:2px solid var(--ink);background:var(--surface)}
.top .mark{font-weight:700;text-decoration:none;letter-spacing:-.01em}.top nav{margin-left:auto;display:flex;gap:20px;align-items:center;font-size:.95rem}
.hero{padding:44px 0 20px}
h1{font-size:clamp(1.7rem,4vw,2.9rem);line-height:1.1;letter-spacing:-.025em;margin:0 0 16px;font-weight:700}
h2{font-size:1.2rem;letter-spacing:-.01em;margin:32px 0 10px}
.lede{font-size:1.1rem;max-width:66ch;margin:0 0 20px}
.origin-pick{font:inherit;font-size:inherit;font-weight:inherit;letter-spacing:inherit;color:var(--purple);background:none;border:0;border-bottom:3px solid var(--purple);padding:0 2px;cursor:pointer;max-width:100%}
.top .origin-pick{font-size:.95rem;border-bottom-width:2px;font-weight:600}
.tiers{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 18px}
.tiers button,.assume button{font:inherit;font-size:.9rem;padding:6px 12px;border:1.5px solid var(--ink);background:var(--surface);color:var(--ink);cursor:pointer;border-radius:999px}
.tiers button[aria-selected=true],.assume button[aria-pressed=true]{background:var(--ink);color:#fff}
.tier-blurb{color:var(--muted);font-size:.9rem;flex-basis:100%}
table{border-collapse:collapse;width:100%;background:var(--surface)}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
thead th{font-weight:600;font-size:.85rem;color:var(--muted);border-bottom:2px solid var(--ink)}
td.num,th.num{text-align:right;white-space:nowrap}
td small,.race small{display:block;color:var(--muted);font-size:.8rem;font-weight:400}
.ranked tr{border-left:5px solid var(--rule)}.ranked tr.st-green{border-left-color:var(--green)}.ranked tr.st-yellow,.ranked tr.st-yellow2{border-left-color:var(--yellow)}.ranked tr.st-yellow2{border-left-style:double}.ranked tr.st-red{border-left-color:var(--red)}
.rank{color:var(--muted);width:2.5em;text-align:right}
.race a{font-weight:600;text-decoration:none}.race a:hover{text-decoration:underline}
.total{font-weight:700;font-size:1.1rem}
td.best{color:var(--purple);font-weight:700;background:var(--tint)}
.best-key{color:var(--purple);font-weight:700}
.date-soft{color:var(--muted);font-style:italic}.date-soft small{font-style:normal}
.flag{display:inline-block;width:10px;height:14px;vertical-align:-2px;margin-right:6px;border-radius:1px}.flag-green{background:var(--green)}.flag-yellow{background:var(--yellow)}.flag-yellow2{background:repeating-linear-gradient(90deg,var(--yellow) 0 3px,#fff 3px 5px)}.flag-red{background:var(--red)}
.conf{font-size:.75rem;white-space:nowrap;padding:2px 7px;border-radius:999px;border:1px solid var(--rule);color:var(--muted)}.conf-high{border-color:var(--green);color:var(--green)}.conf-medium{border-color:var(--ink);color:var(--ink)}
.status{font-size:.95rem;max-width:70ch;padding:10px 14px;background:var(--surface);border-left:4px solid var(--rule)}
.breakdown th{font-weight:600}.breakdown th small{font-weight:400;max-width:44ch}
.breakdown td.num{font-size:1.05rem}.breakdown tr.total td{font-size:1.4rem;font-weight:700;border-top:2px solid var(--ink)}
.breakdown tr.nights th,.breakdown tr.nights td{background:var(--tint)}.breakdown tr.nights td{color:var(--purple);font-weight:700;font-size:1.2rem}
.assume{display:inline-flex;gap:6px;flex-wrap:wrap;margin-left:8px;vertical-align:middle}.assume button{font-size:.8rem;padding:3px 10px}
.nights-why p{max-width:70ch}.muted{color:var(--muted);font-size:.9rem}
.crumb{margin:20px 0 -30px;font-size:.9rem;color:var(--muted)}
.notes p,.prose p{max-width:70ch}.prose pre{background:var(--surface);padding:14px 18px;border-left:4px solid var(--purple);overflow:auto}
.two{display:grid;grid-template-columns:1fr 1fr;gap:40px}
.hubs{list-style:none;padding:0;columns:2;gap:40px}.hubs li{break-inside:avoid;padding:4px 0}.hubs small{color:var(--muted)}
.plain th{font-weight:500;color:var(--muted)}
footer{max-width:1080px;margin:40px auto 0;padding:20px;border-top:1px solid var(--rule);color:var(--muted);font-size:.85rem}footer p{max-width:80ch}
:focus-visible{outline:3px solid var(--purple);outline-offset:2px}
@media (max-width:760px){.two{grid-template-columns:1fr}.hubs{columns:1}.top{flex-wrap:wrap;gap:10px}.top nav{margin-left:0;flex-wrap:wrap;gap:12px}th,td{padding:8px 6px;font-size:.9rem}.ranked th:nth-child(7),.ranked td:nth-child(7),.ranked th:nth-child(9),.ranked td:nth-child(9){display:none}main{padding:0 12px 40px}.crumb{margin-bottom:-20px}}
@media (prefers-reduced-motion:no-preference){td[data-tight]{transition:background .25s}}
`;

const JS = `
document.addEventListener('DOMContentLoaded',()=>{
  // tier tabs on the ranked page
  document.querySelectorAll('.tiers [role=tab]').forEach(b=>b.addEventListener('click',()=>{
    const t=b.dataset.tier;
    document.querySelectorAll('.tiers [role=tab]').forEach(x=>x.setAttribute('aria-selected',x===b));
    document.querySelectorAll('table.ranked,.tier-blurb span').forEach(el=>el.hidden=el.dataset.tier!==t);
  }));
  // flight assumption toggle on the breakdown page: swaps every precomputed cell, nights included
  document.querySelectorAll('.assume button').forEach(b=>b.addEventListener('click',()=>{
    const a=b.dataset.assume;
    document.querySelectorAll('.assume button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    document.querySelectorAll('[data-tight]').forEach(el=>{el.textContent=el.dataset[a]});
    document.querySelectorAll('[data-assume-text]').forEach(d=>{d.hidden=!(d.dataset.assumeText===a&&d.dataset.tier==='standard')});
  }));
});
`;

module.exports = { renderRanked, renderBreakdown, renderRaceHub, renderHeadline, renderMethodology, CSS, JS };
