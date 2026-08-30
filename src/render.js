const { TIERS } = require('./model');
const REPO = 'https://github.com/icreatesites/gp-cost-ranker'; // used for every edit link
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = d => { const [y, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[m - 1]} ${y}`; };
const shortDate = d => { const [, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[m - 1]}`; };
const TIER_KEYS = Object.keys(TIERS);

const STATUS = {
  confirmed:   { k: 'ok',   word: 'confirmed',   hint: 'Date published by the circuit or FOM.' },
  provisional: { k: 'prov', word: 'provisional', hint: 'Reported or inferred. Do not book anything non-refundable on this date.' },
  rumoured:    { k: 'rum',  word: 'rumoured',    hint: 'The race itself is not certain to happen.' },
  cancelled:   { k: 'off',  word: 'cancelled',   hint: 'Off the calendar.' },
};
const OBTAIN = { easy: null, moderate: null, hard: 'hard to get', sells_out_instantly: 'sells out fast' };
const CONF_N = { low: 1, medium: 2, high: 3 };
const CONF_HINT = { low: 'Low confidence: an editor estimate or a model.', medium: 'Medium confidence: a published figure or a sampled search.', high: 'High confidence: a current official price or a fare someone paid.' };
const meter = c => `<span class="meter m${CONF_N[c]}" title="${CONF_HINT[c]}" aria-label="${CONF_HINT[c]}"><i></i><i></i><i></i></span>`;

function dateCell(race) {
  const s = STATUS[race.status];
  return `<span class="when when-${s.k}" title="${esc(s.hint)}">${shortDate(race.race_date)}${race.status === 'confirmed' ? '' : `<span class="sub">${s.word}</span>`}</span>`;
}
function statusLine(race) {
  const s = STATUS[race.status];
  return `<span class="pin pin-${s.k}"></span><b>${longDate(race.race_date)}</b>, ${s.word}. ${esc(s.hint)} Source: ${esc(race.date_source)}.` + (race.note ? ` ${esc(race.note)}` : '');
}
function originSelect(ctx, current, hrefFor, big) {
  const opts = ctx.origins.map(o => `<option value="${hrefFor(o)}"${current && o.slug === current.slug ? ' selected' : ''}>${esc(o.city)}</option>`).join('');
  return `<span class="pick${big ? ' pick-big' : ''}"><select aria-label="Your departure city" onchange="location.href=this.value">${current ? '' : '<option value="">your city</option>'}${opts}</select></span>`;
}

function layout(ctx, { title, body, origin, desc }) {
  const seasonHref = o => `${BASE}/from/${o.slug}/${ctx.season}/`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || 'Every Grand Prix ranked by what the whole weekend costs from your airport: ticket, flights, hotel nights and transfers.')}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc || 'Ranked by the whole weekend, not the ticket.')}"><meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE}/style.css"><script defer src="${BASE}/app.js"></script></head>
<body>
<header class="top"><a class="mark" href="${BASE}/">GP cost ranker</a><nav>${originSelect(ctx, origin, seasonHref)}<a href="${BASE}/methodology/">Method</a><a href="${REPO}">GitHub</a></nav></header>
<main>${body}</main>
<footer><p>Free and open source. Every figure comes from a plain text file anyone can correct by pull request. Calendar data from <a href="https://api.jolpi.ca/">Jolpica-F1</a>, which is volunteer-run and takes donations. Nothing is sold here. Not affiliated with Formula 1.</p></footer>
</body></html>`;
}

// ── /from/<origin>/<season>/ ────────────────────────────────────────────────
function renderRanked(ctx, origin, rows) {
  const tables = TIER_KEYS.map(tier => {
    const list = ctx.races.map(r => ({ race: r, row: rows[r.race_id][tier].tight })).sort((a, b) => a.row.total - b.row.total);
    const mins = {}; for (const k of ['ticket', 'flights', 'accom', 'transfer']) mins[k] = Math.min(...list.map(x => x.row[k]));
    const leader = list[0].row.total;
    const cell = (v, k) => `<td class="n${v === mins[k] ? ' low' : ''}">${gbp(v)}</td>`;
    const trs = list.map(({ race, row }, i) => {
      const gap = row.total - leader;
      const tag = OBTAIN[row.obtainability];
      return `<tr${i === 0 ? ' class="lead"' : ''} data-parts="Ticket ${gbp(row.ticket)}, flights ${gbp(row.flights)}, ${row.nights === 0 ? 'no hotel' : row.nights + ' night' + (row.nights === 1 ? '' : 's') + ' ' + gbp(row.accom)}, local ${gbp(row.transfer)}">
<td class="pos">${i + 1}</td>
<td class="race"><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(race.name)}</a><span class="sub">${esc(race.circuit.nearest_city)}${tag ? `<span class="tag">${tag}</span>` : ''}</span></td>
<td class="dt">${dateCell(race)}</td>
${cell(row.ticket, 'ticket')}${cell(row.flights, 'flights')}
<td class="n${row.accom === mins.accom ? ' low' : ''}">${gbp(row.accom)}<span class="sub">${row.nights} night${row.nights === 1 ? '' : 's'}</span></td>
${cell(row.transfer, 'transfer')}
<td class="n tot"><b>${gbp(row.total)}</b><span class="sub">${gap === 0 ? 'cheapest' : '+' + gbp(gap)}</span></td>
<td class="dat">${meter(row.confidence)}</td></tr>`;
    }).join('');
    return `<div class="board" data-tier="${tier}"${tier === 'standard' ? '' : ' hidden'}><table class="ranked">
<thead><tr><th></th><th>Race</th><th>Date</th><th class="n">Ticket</th><th class="n">Flights</th><th class="n">Stay</th><th class="n">Local</th><th class="n">Total</th><th class="dat">Data</th></tr></thead>
<tbody>${trs}</tbody></table></div>`;
  }).join('');

  const body = `
<section class="hero">
<h1>Cheapest F1 race from ${originSelect(ctx, origin, o => `${BASE}/from/${o.slug}/${ctx.season}/`, true)} in ${ctx.season}</h1>
<p class="lede">Ranked by the whole weekend, not the ticket. Flights from ${esc(origin.iata)}, the hotel nights your flight times actually force, and getting to the track. Per person.</p>
<div class="switch" role="tablist" aria-label="Budget tier">${TIER_KEYS.map(t => `<button role="tab" data-tier="${t}" aria-selected="${t === 'standard'}">${TIERS[t].label}</button>`).join('')}</div>
<p class="switch-note">${TIER_KEYS.map(t => `<span data-tier="${t}"${t === 'standard' ? '' : ' hidden'}>${TIERS[t].blurb}</span>`).join('')}</p>
</section>
${tables}
<section class="legend">
<p><b>Every number here is an estimate.</b> The bars in the last column show how much we trust each one: one bar is a model or an editor's guess, three is an official price or a fare somebody actually paid. Most of the ${ctx.season} calendar is one bar, because circuits have not published prices yet. Competing pages give you a precise number and are guessing too.</p>
<p>Purple marks the cheapest in a column. An amber date is provisional or the race is only rumoured, and nothing should be booked on it. Calendar checked ${longDate(ctx.statusChecked)}, costs computed ${longDate(ctx.computedAt)}. <a href="${REPO}/tree/main/data">Correct a figure</a>.</p>
</section>`;
  return layout(ctx, { title: `Cheapest F1 race from ${origin.city}, ${ctx.season}`, desc: `All ${ctx.races.length} ${ctx.season} Grands Prix ranked by total weekend cost from ${origin.city}: ticket, flights, hotel nights and transfers.`, body, origin });
}

// ── /from/<origin>/<race>/ ──────────────────────────────────────────────────
function renderBreakdown(ctx, origin, race, byTier) {
  const s = byTier.standard.tight;
  const row = (label, note, key) => `<tr><th>${label}<span class="sub">${note}</span></th>${TIER_KEYS.map(t => `<td class="n" data-tight="${gbp(byTier[t].tight[key])}" data-relaxed="${gbp(byTier[t].relaxed[key])}">${gbp(byTier[t].tight[key])}</td>`).join('')}</tr>`;
  const why = TIER_KEYS.map(t => `<p data-assume-text="tight" data-tier="${t}"${t === 'standard' ? '' : ' hidden'}>${byTier[t].tight.nights_why.map(esc).join(' ')}</p><p data-assume-text="relaxed" data-tier="${t}" hidden>${byTier[t].relaxed.nights_why.map(esc).join(' ')}</p>`).join('');

  const body = `
<nav class="crumb"><a href="${BASE}/from/${origin.slug}/${ctx.season}/">All races from ${esc(origin.city)}</a><a href="${BASE}/race/${race.race_id}/">${esc(race.name)}</a></nav>
<section class="hero hero-tight">
<h1>${esc(race.name)}<span class="h1-sub">from ${esc(origin.city)}</span></h1>
<p class="status">${statusLine(race)}</p>
<p class="lede">A standard weekend runs about <b>${gbp(s.total)}</b> a head: ${gbp(s.ticket)} to get in, ${gbp(s.flights)} to fly ${origin.iata} to ${s.airport}, ${s.nights} night${s.nights === 1 ? '' : 's'} at ${gbp(s.nightly)} in ${esc(race.circuit.nearest_city)}, ${gbp(s.transfer)} moving about. ${meter(s.confidence)}</p>
</section>
<table class="detail">
<thead><tr><th></th>${TIER_KEYS.map(t => `<th class="n">${TIERS[t].label}</th>`).join('')}</tr></thead>
<tbody>
${row('Ticket', `${esc(s.ticket_source)}. Standard range ${gbp(s.ticket_range[0])} to ${gbp(s.ticket_range[1])}.`, 'ticket')}
${row('Flights', `${esc(s.flight_source)} Into ${s.airport}, roughly ${s.flight_hours}h each way.`, 'flights')}
<tr class="nights"><th>Nights<span class="sub">How many the schedule forces, not a guess</span>
<span class="assume" role="group" aria-label="Flight assumption"><button data-assume="tight" aria-pressed="true">Fly tight</button><button data-assume="relaxed" aria-pressed="false">Day either side</button></span></th>
${TIER_KEYS.map(t => `<td class="n" data-tight="${byTier[t].tight.nights}" data-relaxed="${byTier[t].relaxed.nights}">${byTier[t].tight.nights}</td>`).join('')}</tr>
${row('Stay', `${gbp(s.nightly)} a night mid-range. ${esc(race.hotel.source)}, checked ${longDate(s.hotel_captured)}.${s.hotel_stale ? ' Over a year old, treat as a guess.' : ''}`, 'accom')}
${row('Local travel', `${s.airport} to town by ${esc(s.transfer_mode)}, ${gbp(s.transfer_each_way)} each way, ${s.transfer_minutes} min. Plus ${gbp(race.circuit.circuit_transport_gbp_per_day)} a day to the circuit.`, 'transfer')}
<tr class="sum"><th>Total</th>${TIER_KEYS.map(t => `<td class="n" data-tight="${gbp(byTier[t].tight.total)}" data-relaxed="${gbp(byTier[t].relaxed.total)}">${gbp(byTier[t].tight.total)}</td>`).join('')}</tr>
</tbody></table>
<section class="panel">
<h2 data-tight="Why ${s.nights} night${s.nights === 1 ? '' : 's'}" data-relaxed="Why ${byTier.standard.relaxed.nights} night${byTier.standard.relaxed.nights === 1 ? '' : 's'}">Why ${s.nights} night${s.nights === 1 ? '' : 's'}</h2>
${why}
<p class="muted">A cheaper flight that forces one more night is not cheaper. Switch the assumption above and the total moves with it. No other F1 cost guide models that link.</p>
</section>
<section class="panel">
<h2>Next steps</h2>
<p>Search ${origin.iata} to ${s.airport}, out ${longDate(s.arrive)} and back ${longDate(s.depart)}, then compare it against the estimate here. For tickets, the <a href="${BASE}/race/${race.race_id}/">race page</a> has the on-sale date; resale and hospitality are aggregated at <a href="https://fastway1.com">Fastway1</a>.${race.status !== 'confirmed' ? ' Book nothing non-refundable until FOM confirms the date.' : ''}</p>
<p class="muted">Found a real fare or paid for a room here? <a href="${REPO}/blob/main/CONTRIBUTING.md">One line of YAML</a> beats every estimate on this page. Computed ${longDate(ctx.computedAt)}.</p>
</section>`;
  return layout(ctx, { title: `${race.name} from ${origin.city}: ${ctx.season} weekend cost`, desc: `What the ${race.name} costs from ${origin.city}: tickets, flights, nights and transfers, broken down across three budgets.`, body, origin });
}

// ── /race/<race>/ ───────────────────────────────────────────────────────────
function renderRaceHub(ctx, race, cheapestOrigins) {
  const c = race.circuit, t = race.tickets;
  const aps = c.airports.map(a => `<tr><th>${a.iata}<span class="sub">${esc(a.transfer_mode)}, ${a.transfer_minutes} min</span></th><td class="n">${gbp(a.transfer_cost_gbp)}</td></tr>`).join('');
  const top = cheapestOrigins.slice(0, 12).map(({ origin, row }, i) => `<tr><td class="pos">${i + 1}</td><td class="race"><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(origin.city)}</a></td><td class="n">${gbp(row.flights)}</td><td class="n">${row.nights}</td><td class="n tot"><b>${gbp(row.total)}</b></td></tr>`).join('');
  const body = `
<nav class="crumb"><a href="${BASE}/">All races</a></nav>
<section class="hero hero-tight">
<h1>${esc(race.name)}<span class="h1-sub">${ctx.season}</span></h1>
<p class="status">${statusLine(race)}</p>
<p class="lede">${esc(c.name)}, ${esc(c.country)}. ${esc(c.notes)}</p>
</section>
<div class="cols">
<section class="panel">
<h2>Tickets</h2>
<table class="kv"><tbody>
<tr><th>General admission</th><td class="n">${gbp(t.ga[0])}–${gbp(t.ga[1])}</td></tr>
<tr><th>Cheapest grandstand</th><td class="n">${gbp(t.gs_cheapest[0])}–${gbp(t.gs_cheapest[1])}</td></tr>
<tr><th>Main straight</th><td class="n">${gbp(t.gs_main[0])}–${gbp(t.gs_main[1])}</td></tr>
<tr><th>Availability</th><td class="n">${esc(t.obtainability.replace(/_/g, ' '))}</td></tr>
<tr><th>On sale</th><td class="n">${t.on_sale ? longDate(String(t.on_sale)) : 'not announced'}</td></tr>
</tbody></table>
<p class="muted">${meter(t.confidence)} ${esc(t.source)}. Checked ${longDate(String(t.captured))}. <a href="${REPO}/blob/main/data/tickets/${ctx.season}.yaml">Edit</a>.</p>
<h2>Getting there</h2>
<table class="kv"><tbody>${aps}</tbody></table>
<p class="muted">Then about ${gbp(c.circuit_transport_gbp_per_day)} a day between ${esc(c.nearest_city)} and the circuit. <a href="${REPO}/blob/main/data/circuits.yaml">Edit</a>.</p>
<h2>Rooms</h2>
<table class="kv"><tbody>
<tr><th>Budget</th><td class="n">${gbp(race.hotel.budget)}</td></tr>
<tr><th>Mid-range</th><td class="n">${gbp(race.hotel.mid)}</td></tr>
<tr><th>Comfortable</th><td class="n">${gbp(race.hotel.comfortable)}</td></tr>
</tbody></table>
<p class="muted">Per night on race weekend, in ${esc(c.nearest_city)}. ${esc(race.hotel.source)}, checked ${longDate(String(race.hotel.captured))}. <a href="${REPO}/blob/main/data/hotel_rates.yaml">Edit</a>.</p>
</section>
<section class="panel">
<h2>Cheapest cities to come from</h2>
<table class="ranked mini"><thead><tr><th></th><th>From</th><th class="n">Flights</th><th class="n">Nights</th><th class="n">Total</th></tr></thead><tbody>${top}</tbody></table>
<p class="muted">Standard tier. Your city missing? <a href="${REPO}/blob/main/data/origins.yaml">Add it</a> in one line.</p>
</section>
</div>`;
  return layout(ctx, { title: `${race.name} ${ctx.season}: what it costs to attend`, desc: `${race.name} ${ctx.season}: ticket prices, airports, transfers, hotel rates and the cheapest cities to travel from.`, body });
}

// ── /cheapest-f1-race-<season>/ ─────────────────────────────────────────────
function renderHeadline(ctx) {
  const body = `
<section class="hero">
<h1>Cheapest F1 race in ${ctx.season} from ${originSelect(ctx, null, o => `${BASE}/from/${o.slug}/${ctx.season}/`, true)}</h1>
<p class="lede">Every list of cheap Grands Prix ranks the ticket. The ticket is a third of the weekend, sometimes a fifth. Pick your airport and get the rest of it.</p>
</section>
<section class="panel">
<h2>Why the ticket ranking is the wrong ranking</h2>
<p>China has the cheapest ticket on the calendar and sells out to local demand in minutes. Monaco's general admission undercuts Miami's and the flight is a short hop from most of Europe, but you sleep in Nice at race-weekend rates. Las Vegas has the dearest tickets and the cheapest local travel of any race, because you walk. None of that surfaces until you add the columns up from where you actually live.</p>
<p>The ${ctx.season} calendar is not confirmed. Only Monaco and Silverstone have published dates. Everything else is a reported or inferred slot, marked as such, and nothing should be booked on the strength of it.</p>
</section>
<section class="panel">
<h2>Every race</h2>
<ul class="hubs">${ctx.races.map(r => `<li><a href="${BASE}/race/${r.race_id}/"><span class="pin pin-${STATUS[r.status].k}"></span>${esc(r.name)}<span class="sub">${shortDate(r.race_date)}</span></a></li>`).join('')}</ul>
</section>`;
  return layout(ctx, { title: `Cheapest F1 race ${ctx.season}: total weekend cost from your city`, body });
}

function renderMethodology(ctx) {
  const body = `
<nav class="crumb"><a href="${BASE}/">All races</a></nav>
<section class="hero hero-tight"><h1>How every number is worked out</h1>
<p class="lede">It is a spreadsheet. The inputs are plain text files anyone can edit, and every figure carries how much we trust it and when somebody last looked.</p></section>
<section class="panel prose">
<h2>The sum</h2>
<pre>total = ticket
      + return flight
      + nights × nightly rate
      + 2 × airport transfer
      + daily circuit travel × race days</pre>
<p>Per person, in pounds, travelling alone. Two of you sharing a room should halve the stay line.</p>
<h2>Tiers</h2>
<p>${TIER_KEYS.map(t => `<b>${TIERS[t].label}.</b> ${TIERS[t].blurb}`).join(' ')} Rankings use standard.</p>
<h2>Nights</h2>
<p>This is the part nobody else does. For each city and circuit we estimate flight time from distance, add the airport transfer, and ask two questions. Can a 06:00 departure get you trackside before your first session? If not, you need the night before. Can you get from the chequered flag to the airport with two and a half hours to spare before a 23:00 last departure? If not, you need the night after. Night races almost always fail the second test. Anything over roughly five and a half hours in the air always fails the first. Under 350 km we assume you drive or take the train, and under 90 km you sleep at home.</p>
<p><i>Fly tight</i> applies those tests. <i>Day either side</i> ignores them and books the obvious schedule. Both are shown; ranking uses tight, because it is the cheapest honest trip.</p>
<h2>Flights</h2>
<p>There is no live flight search here and there never will be. Amadeus closed its free API in July 2026 and Kiwi went invite-only, so fares come from two places. First, routes somebody has actually searched or paid for, which live in <code>data/fare_overrides.yaml</code>. Second, for everything else, a distance model: a fixed cost plus a rate per kilometre, multiplied for race-weekend demand and summer, with a penalty for long haul out of airports without direct flights. It is crude deliberately. It exists to get the order right, and it is marked one bar wherever it is used. A single pull request with a real fare replaces it.</p>
<h2>Tickets</h2>
<p>Ranges rather than numbers, because Silverstone, Melbourne and Abu Dhabi price dynamically and the rest are heading the same way. Taken from official circuit sites. Most ${ctx.season} figures are last year's indexed up by about 8% until circuits publish. Availability is modelled separately from price, because a cheap ticket you cannot buy is not cheap, which is why China and São Paulo carry a warning.</p>
<h2>Hotels</h2>
<p>Nightly bands for the town a sensible person on that budget actually stays in: Nice for Monaco, Nagoya for Suzuka, a campsite for Austria on a shoestring. Rates spike late, so these assume booking six to nine months out. Anything over a year old is flagged.</p>
<h2>Calendar</h2>
<p>Mirrored nightly from Jolpica-F1 into a plain file, with a status on every race and a note on where the date came from. The ${ctx.season} calendar was not confirmed when this was built. A provisional date never looks like a confirmed one.</p>
<h2>Confidence</h2>
<p>The bar meter on a trip is the weakest of its ticket, flight and hotel. One bar is an estimate or a model. Two is a published figure or a sampled search. Three is a current official price or a fare someone paid. Most of the site is one bar today. That is the true state of knowledge nine months out, and saying so costs nothing.</p>
<h2>What this is not</h2>
<p>It sells nothing and holds no basket, ever; packaging travel triggers ATOL and the Package Travel Regulations. It does not aggregate tickets, because <a href="https://fastway1.com">Fastway1</a> already does. It does not replace GPDestinations' ticket-price rankings; it answers a question they cannot, which is what your weekend costs from your airport.</p>
<h2>Fix something</h2>
<p>Every input sits in <a href="${REPO}/tree/main/data">/data</a> as YAML and is schema-checked before merge. <a href="${REPO}/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a> walks a first-timer through a pull request in five minutes.</p>
</section>`;
  return layout(ctx, { title: 'How the numbers work', body });
}

const CSS = `
:root{
  --bg:#F5F6F8; --paper:#FFF; --ink:#14161A; --ink2:#5D6472; --ink3:#9BA2AE;
  --line:rgba(20,22,26,.08); --line2:rgba(20,22,26,.14);
  --purple:#6E3AE6; --purple-bg:#F1ECFE; --amber:#B4780A; --amber-bg:#FDF3DF; --green:#12784A;
  --r:14px;
}
*{box-sizing:border-box}
html{font-size:16px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:Archivo,ui-sans-serif,system-ui,sans-serif;font-variation-settings:'wdth' 100;
  font-size:1rem;line-height:1.55;font-variant-numeric:tabular-nums lining-nums;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration:none}
main{max-width:1140px;margin:0 auto;padding:0 28px 80px}

/* header */
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:20px;
  padding:14px 28px;background:rgba(245,246,248,.82);backdrop-filter:saturate(1.6) blur(12px);
  border-bottom:1px solid var(--line)}
.mark{font-weight:700;font-variation-settings:'wdth' 112;letter-spacing:-.02em;font-size:1.02rem}
.top nav{margin-left:auto;display:flex;gap:18px;align-items:center;font-size:.92rem;color:var(--ink2)}
.top nav a:hover{color:var(--ink)}

/* hero */
.hero{padding:76px 0 32px}
h1{max-width:21ch}
.hero-tight{padding:48px 0 26px;max-width:64ch}
h1{margin:0 0 18px;font-weight:700;font-variation-settings:'wdth' 116;
  font-size:clamp(2.1rem,5.4vw,3.5rem);line-height:1.02;letter-spacing:-.035em}
.h1-sub{display:block;font-weight:500;font-variation-settings:'wdth' 100;
  font-size:.42em;letter-spacing:-.01em;color:var(--ink2);margin-top:.5em}
.lede{margin:0;font-size:1.14rem;line-height:1.5;color:var(--ink2);max-width:56ch}
.lede b{color:var(--ink);font-weight:650}

/* city picker */
.pick{position:relative;display:inline-block}
.pick select{appearance:none;-webkit-appearance:none;font:inherit;font-weight:inherit;
  font-variation-settings:inherit;letter-spacing:inherit;color:var(--purple);
  background:var(--purple-bg);border:0;border-radius:10px;cursor:pointer;
  padding:.04em 1.5em .04em .42em;max-width:min(100%,11ch);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1.4 1.6 6 6.2l4.6-4.6' fill='none' stroke='%236E3AE6' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right .5em center;background-size:.5em}
.pick-big select{border-radius:14px;padding:.02em 1.1em .02em .28em;background-size:.42em;background-position:right .34em center;max-width:none}
.top .pick select{font-size:.92rem;font-weight:600;padding:.28em 1.7em .28em .7em;max-width:none}

/* tier switch */
.switch{display:inline-flex;gap:3px;margin:28px 0 0;padding:3px;
  background:var(--paper);border:1px solid var(--line);border-radius:999px}
.switch button{font:inherit;font-size:.88rem;font-weight:550;color:var(--ink2);
  background:none;border:0;border-radius:999px;padding:7px 16px;cursor:pointer;
  transition:color .16s,background .16s}
.switch button:hover{color:var(--ink)}
.switch button[aria-selected=true]{background:var(--ink);color:#fff}
.switch-note{margin:12px 0 0;font-size:.9rem;color:var(--ink3);max-width:60ch;min-height:1.4em}

/* board */
.board{margin:26px 0 0;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
table{border-collapse:collapse;width:100%}
.ranked thead th{background:var(--paper);
  font-size:.72rem;font-weight:600;letter-spacing:.06em;text-transform:lowercase;
  color:var(--ink3);text-align:left;padding:14px 14px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.ranked td{padding:16px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.ranked tbody tr:last-child td{border-bottom:0}
.ranked tbody tr{transition:background .15s}
.ranked tbody tr:hover{background:#FAFAFC}
.n{text-align:right;white-space:nowrap;font-weight:500;font-size:1rem}
th.n{text-align:right}
.sub{display:block;font-size:.78rem;font-weight:450;color:var(--ink3);line-height:1.35;margin-top:2px;letter-spacing:0}
.pos{width:44px;text-align:right;color:var(--ink3);font-size:.95rem;font-weight:500;padding-right:4px!important}
.race{min-width:190px}
.race a{font-weight:600;font-size:1.02rem;letter-spacing:-.012em}
.race a:hover{color:var(--purple)}
.tag{display:inline-block;margin-left:7px;padding:1px 7px;border-radius:6px;
  background:var(--amber-bg);color:var(--amber);font-size:.7rem;font-weight:600;letter-spacing:.01em}
.when{font-size:.94rem;color:var(--ink2);white-space:nowrap}
.when-prov,.when-rum{color:var(--amber)}
.when-prov .sub,.when-rum .sub{color:var(--amber);opacity:.72}
.n.low{color:var(--purple)}
.tot b{font-size:1.16rem;font-weight:680;letter-spacing:-.018em}
.tot .sub{color:var(--ink3);font-weight:500}
.lead .tot b{display:inline-block;background:var(--purple-bg);color:var(--purple);
  padding:2px 10px;border-radius:9px;margin-right:-4px}
.lead .tot .sub{color:var(--purple);opacity:.75}
.dat{width:52px}
.meter{display:inline-flex;gap:2.5px;vertical-align:middle}
.meter i{width:10px;height:4px;border-radius:2px;background:var(--line2)}
.m1 i:nth-child(1),.m2 i:nth-child(-n+2),.m3 i{background:var(--ink3)}
.m3 i{background:var(--green)}

/* legend */
.legend{margin:22px 0 0;font-size:.9rem;color:var(--ink2)}
.legend p{max-width:74ch;margin:0 0 8px}
.legend b{color:var(--ink);font-weight:600}
.legend a,.muted a,.prose a,footer a,.panel p a{color:var(--purple);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}

/* breadcrumb */
.crumb{display:flex;gap:16px;padding:22px 0 0;font-size:.88rem;color:var(--ink2)}
.crumb a{text-decoration:underline;text-decoration-color:var(--line2);text-underline-offset:3px}
.crumb a:hover{color:var(--purple);text-decoration-color:var(--purple)}

/* status strip */
.status{margin:0 0 20px;padding:13px 16px;background:var(--paper);border:1px solid var(--line);
  border-radius:11px;font-size:.92rem;color:var(--ink2);max-width:72ch}
.status b{color:var(--ink);font-weight:600}
.pin{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;vertical-align:1px;background:var(--ink3)}
.pin-ok{background:var(--green)}.pin-prov{background:var(--amber)}
.pin-rum{background:var(--amber);box-shadow:inset 0 0 0 1.5px var(--paper),0 0 0 1.5px var(--amber)}
.pin-off{background:#C0392B}

/* detail table */
.detail{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin:0}
.detail thead th{font-size:.72rem;font-weight:600;letter-spacing:.06em;color:var(--ink3);
  text-transform:lowercase;padding:15px 18px 12px;border-bottom:1px solid var(--line);text-align:right}
.detail thead th:first-child{text-align:left}
.detail th{text-align:left;font-weight:600;font-size:1rem;padding:18px;border-bottom:1px solid var(--line);vertical-align:top;max-width:46ch}
.detail td{padding:18px;border-bottom:1px solid var(--line);vertical-align:top;font-size:1.06rem}
.detail th .sub{font-weight:450;max-width:48ch}
.detail tr.nights th,.detail tr.nights td{background:var(--purple-bg)}
.detail tr.nights td{color:var(--purple);font-weight:680;font-size:1.3rem}
.detail tr.sum th,.detail tr.sum td{border-bottom:0;padding-top:20px;padding-bottom:22px}
.detail tr.sum td{font-size:1.5rem;font-weight:700;letter-spacing:-.02em}
.assume{display:inline-flex;gap:3px;margin-top:11px;padding:3px;background:var(--paper);
  border:1px solid var(--line2);border-radius:999px}
.assume button{font:inherit;font-size:.78rem;font-weight:550;color:var(--ink2);background:none;
  border:0;border-radius:999px;padding:5px 12px;cursor:pointer;transition:color .16s,background .16s}
.assume button[aria-pressed=true]{background:var(--ink);color:#fff}
@keyframes flash{from{background:var(--purple-bg)}to{background:transparent}}
.flash{animation:flash .5s ease-out}

/* panels */
.panel{margin:34px 0 0;padding:28px 30px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r)}
.panel h2{margin:0 0 12px;font-size:1.06rem;font-weight:650;letter-spacing:-.015em;font-variation-settings:'wdth' 106}
.panel h2+h2{margin-top:0}
.panel p{margin:0 0 12px;max-width:70ch;color:var(--ink2)}
.panel p:last-child{margin-bottom:0}
.panel>h2:not(:first-child){margin-top:28px}
.muted{font-size:.87rem;color:var(--ink3)!important}
.prose pre{background:var(--bg);padding:16px 20px;border-radius:11px;overflow:auto;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem;line-height:1.7;color:var(--ink2)}
.prose code{background:var(--bg);padding:1px 6px;border-radius:5px;font-size:.87em}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
.kv{width:100%}
.kv th{text-align:left;font-weight:500;color:var(--ink2);padding:11px 0;border-bottom:1px solid var(--line);font-size:.95rem}
.kv td{padding:11px 0;border-bottom:1px solid var(--line)}
.kv tr:last-child th,.kv tr:last-child td{border-bottom:0}
.mini{margin-top:-4px}
.mini thead th{position:static;padding:10px 8px}
.mini td{padding:12px 8px}
.hubs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:2px}
.hubs a{display:flex;align-items:baseline;gap:8px;padding:9px 10px;border-radius:9px;font-weight:500;transition:background .15s}
.hubs a:hover{background:var(--bg)}
.hubs .sub{display:inline;margin-left:auto;font-size:.82rem;white-space:nowrap}

footer{max-width:1140px;margin:0 auto;padding:28px;border-top:1px solid var(--line);color:var(--ink3);font-size:.85rem}
footer p{max-width:82ch;margin:0}
:focus-visible{outline:2.5px solid var(--purple);outline-offset:3px;border-radius:4px}

@media (max-width:900px){
  .cols{grid-template-columns:1fr}
  h1{max-width:none}
}
@media (max-width:760px){
  main{padding:0 16px 56px}
  .top{padding:11px 14px;gap:9px;flex-wrap:nowrap}
  .mark{font-size:.9rem;white-space:nowrap}
  .top nav{gap:10px;font-size:.8rem;min-width:0}
  .top .pick select{font-size:.8rem;padding:.26em 1.5em .26em .6em}
  .hero{padding:40px 0 22px}
  .lede{font-size:1.05rem}
  .board{border-radius:12px}
  .ranked thead{display:none}
  .ranked tbody,.ranked tr,.ranked td{display:block}
  .ranked tr{position:relative;padding:16px 16px 15px 50px;border-bottom:1px solid var(--line)}
  .ranked td{padding:0;border:0}
  .ranked .pos{position:absolute;left:0;top:17px;width:40px;text-align:center}
  .ranked .dt,.ranked .dat{display:none}
  .ranked .n:not(.tot){display:none}
  .ranked .tot{position:absolute;right:16px;top:15px;text-align:right}
  .ranked .race{padding-right:96px}
  .ranked tr::after{content:attr(data-parts);display:block;margin-top:8px;
    font-size:.8rem;color:var(--ink3)}
  .ranked tbody tr:hover{background:none}
  .detail{border-radius:12px}
  .detail th,.detail td{padding:14px 12px;font-size:.98rem}
  .detail thead th:not(:first-child){font-size:.66rem;padding:12px 8px}
  .detail th .sub{max-width:none}
  .detail tr.sum td{font-size:1.2rem}
  .panel{padding:22px 20px;border-radius:12px}
  .mini .n{font-size:.92rem}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const JS = `
document.addEventListener('DOMContentLoaded',function(){
  var flash=function(els){els.forEach(function(el){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')})};
  document.querySelectorAll('.switch [role=tab]').forEach(function(b){
    b.addEventListener('click',function(){
      var t=b.dataset.tier;
      document.querySelectorAll('.switch [role=tab]').forEach(function(x){x.setAttribute('aria-selected',x===b)});
      document.querySelectorAll('.board,.switch-note span').forEach(function(el){el.hidden=el.dataset.tier!==t});
    });
  });
  document.querySelectorAll('.assume button').forEach(function(b){
    b.addEventListener('click',function(){
      var a=b.dataset.assume;
      document.querySelectorAll('.assume button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});
      var changed=[];
      document.querySelectorAll('[data-tight]').forEach(function(el){
        if(el.textContent!==el.dataset[a]){el.textContent=el.dataset[a];if(el.tagName==='TD')changed.push(el)}
      });
      flash(changed);
      document.querySelectorAll('[data-assume-text]').forEach(function(p){
        p.hidden=!(p.dataset.assumeText===a&&p.dataset.tier==='standard');
      });
    });
  });
});
`;

module.exports = { renderRanked, renderBreakdown, renderRaceHub, renderHeadline, renderMethodology, CSS, JS };
