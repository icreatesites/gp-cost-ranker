const { TIERS } = require('./model');
const REPO = 'https://github.com/icreatesites/gp-cost-ranker';
const SITE = (process.env.SITE_URL || 'https://gp-cost-ranker.icreatesites.workers.dev').replace(/\/$/, '');
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
const FONT = 'archivo.woff2';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = d => { const [y, m, day] = String(d).split('-'); return `${Number(day)} ${MONTHS[m - 1]} ${y}`; };
const shortDate = d => { const [, m, day] = String(d).split('-'); return `${Number(day)} ${MONTHS[m - 1]}`; };
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 !== 10) * n % 10] || 'th');
const TIER_KEYS = Object.keys(TIERS);
const where = c => c.display_location || c.nearest_city;

const STATUS = {
  confirmed:   { k: 'ok',   word: 'confirmed',   hint: 'Date published by the circuit or FOM.' },
  provisional: { k: 'prov', word: 'provisional', hint: 'Reported or inferred, not confirmed by FOM. Do not book anything non-refundable on this date.' },
  rumoured:    { k: 'rum',  word: 'rumoured',    hint: 'The race itself is not certain to happen, let alone on this date.' },
  cancelled:   { k: 'off',  word: 'cancelled',   hint: 'Off the calendar.' },
};
const OBTAIN = { easy: null, moderate: null, hard: 'hard to get', sells_out_instantly: 'sells out fast' };
const CONF_N = { low: 1, medium: 2, high: 3 };
const CONF_HINT = { low: 'Low confidence: an editor estimate or a model.', medium: 'Medium confidence: a published figure or a sampled search.', high: 'High confidence: a current official price or a fare someone paid.' };
const meter = c => `<span class="meter m${CONF_N[c]}" title="${CONF_HINT[c]}"><i></i><i></i><i></i><span class="sr">${CONF_HINT[c]}</span></span>`;

function dateCell(race) {
  const s = STATUS[race.status];
  const note = race.note ? ` ${race.note}` : '';
  return `<span class="when when-${s.k}" title="${esc(s.hint + note)}">${shortDate(race.race_date)}${race.status === 'confirmed' ? '' : `<span class="sub">${s.word}</span>`}</span>`;
}
function statusLine(race) {
  const s = STATUS[race.status];
  return `<span class="pin pin-${s.k}"></span><b>${longDate(race.race_date)}</b>, ${s.word}. ${esc(s.hint)} Source: ${esc(race.date_source)}.` + (race.note ? ` ${esc(race.note)}` : '');
}
function originSelect(ctx, current, hrefFor, big) {
  const groups = [
    ['UK and Ireland', o => o.country === 'United Kingdom' || o.country === 'Ireland'],
    ['Europe', o => o.region === 'europe' && o.country !== 'United Kingdom' && o.country !== 'Ireland'],
    ['North America', o => o.region === 'north_america'],
  ];
  const body = groups.map(([label, fn]) => {
    const opts = ctx.origins.filter(fn).map(o => `<option value="${hrefFor(o)}"${current && o.slug === current.slug ? ' selected' : ''}>${esc(o.city)}</option>`).join('');
    return opts ? `<optgroup label="${label}">${opts}</optgroup>` : '';
  }).join('');
  return `<span class="pick${big ? ' pick-big' : ''}"><select aria-label="Departure city" onchange="location.href=this.value">${current ? '' : '<option value="">your city</option>'}${body}</select></span>`;
}

function layout(ctx, { title, body, origin, desc, canonical, jsonld, hidePicker }) {
  const seasonHref = o => `${BASE}/from/${o.slug}/${ctx.season}/`;
  const d = desc || 'Every Grand Prix ranked by the whole weekend, not the ticket: flights, the hotel nights your flight times force, and getting to the track.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(d)}">
${canonical ? `<link rel="canonical" href="${SITE}${canonical}">` : ''}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(d)}"><meta property="og:image" content="${SITE}${BASE}/og.png"><meta property="og:site_name" content="GP cost ranker">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(d)}"><meta name="twitter:image" content="${SITE}${BASE}/og.png">
<link rel="icon" href="${BASE}/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${BASE}/${FONT}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}/style.css"><script defer src="${BASE}/app.js"></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><a class="mark" href="${BASE}/">GP cost ranker</a><nav>${hidePicker ? '' : originSelect(ctx, origin, seasonHref)}<a href="${BASE}/cheapest-f1-race-${ctx.season}/">Why rank this way</a><a href="${BASE}/methodology/">Method</a></nav></header>
<main id="main">${body}</main>
<footer><p>Free and open source. Every figure comes from a plain text file anyone can correct by pull request. Calendar data from <a href="https://api.jolpi.ca/">Jolpica-F1</a>, which is volunteer-run and takes donations. Nothing is sold here and we take no commission from anyone. Not affiliated with Formula 1.</p>
<p class="feet"><a href="${BASE}/methodology/">How the numbers work</a> <a href="${BASE}/cheapest-f1-race-${ctx.season}/">Why rank this way</a> <a href="${REPO}">Source and data</a> <a href="${REPO}/issues/new?template=fare-wrong.md">Report a fare</a></p></footer>
</body></html>`;
}

// ── ranked board ────────────────────────────────────────────────────────────
function renderRanked(ctx, origin, rows) {
  // Position each race would hold if you ranked on ticket price alone. This is the whole thesis.
  const ticketOrder = ctx.races.map(r => ({ id: r.race_id, t: rows[r.race_id].standard.tight.ticket }))
    .sort((a, b) => a.t - b.t);
  const ticketRank = Object.fromEntries(ticketOrder.map((x, i) => [x.id, i + 1]));

  const boards = TIER_KEYS.map(tier => {
    const list = ctx.races.map(r => ({ race: r, row: rows[r.race_id][tier].tight })).sort((a, b) => a.row.total - b.row.total);
    const foreign = list.find(x => x.race.circuit.country !== origin.country);
    const trs = list.map(({ race, row }) => {
      const tag = OBTAIN[row.obtainability];
      const tr = ticketRank[race.race_id];
      const parts = `Ticket ${gbp(row.ticket)}, ${row.ground ? 'travel' : 'flights'} ${gbp(row.flights)}, ${row.nights === 0 ? 'no hotel' : row.nights + ' night' + (row.nights === 1 ? '' : 's') + ' ' + gbp(row.accom)}, transfers ${gbp(row.transfer)}`;
      return `<tr data-ticket="${row.ticket}" data-flights="${row.flights}" data-accom="${row.accom}" data-transfer="${row.transfer}" data-nights="${row.nights}" data-date="${race.race_date}" data-foreign="${race.circuit.country === origin.country ? 0 : 1}"${foreign && foreign.race.race_id === race.race_id ? ' data-firstforeign="1"' : ''}>
<td class="pos"></td>
<td class="race"><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(race.name)}</a><span class="sub"><span class="loc">${esc(where(race.circuit))}</span>${tag ? `<span class="tag">${tag}</span>` : ''}<span class="flag-abroad"></span></span></td>
<td class="dt">${dateCell(race)}</td>
<td class="n c-ticket" title="Midpoint of ${gbp(row.ticket_range[0])} to ${gbp(row.ticket_range[1])}"><span class="v">${gbp(row.ticket)}</span></td>
<td class="n c-flights"><span class="v">${gbp(row.flights)}</span></td>
<td class="n c-accom"><span class="v">${gbp(row.accom)}</span><span class="sub nts">${row.nights === 0 ? 'no hotel' : row.nights + ' night' + (row.nights === 1 ? '' : 's')}</span></td>
<td class="n c-transfer"><span class="v">${gbp(row.transfer)}</span></td>
<td class="n tot"><b>${gbp(row.total)}</b><span class="sub gap"></span></td>
<td class="tr">${ord(tr)}</td>
<td class="dat">${meter(row.confidence)}</td>
<td class="parts">${parts}</td></tr>`;
    }).join('');
    const h = (label, cls, hint) => `<th class="n ${cls}" title="${hint}"><button type="button" data-sort="${cls}">${label}</button></th>`;
    return `<div class="board" data-tier="${tier}"${tier === 'standard' ? '' : ' hidden'}><table class="ranked">
<thead><tr><th class="pos"><span class="sr">Position</span></th>
<th><button type="button" data-sort="name">Race</button></th>
<th><button type="button" data-sort="date">Date</button></th>
${h('Ticket', 'c-ticket', 'Midpoint of the published price range for this tier')}
${h('Travel', 'c-flights', 'Return flight, or road and rail where the circuit is close enough to drive')}
${h('Stay', 'c-accom', 'Nightly rate multiplied by the nights the flight schedule forces')}
${h('Transfers', 'c-transfer', 'Airport to town both ways, plus getting to the circuit each day')}
${h('Total', 'tot', 'Everything above, per person')}
<th class="tr" title="Where this race would rank if you only compared ticket prices">On ticket</th>
<th class="dat">Data</th></tr></thead>
<tbody>${trs}</tbody></table></div>`;
  }).join('');

  const best = ctx.races.map(r => ({ r, row: rows[r.race_id].standard.tight })).sort((a, b) => a.row.total - b.row.total);
  const abroad = best.find(x => x.r.circuit.country !== origin.country);

  const body = `
<section class="hero">
<h1>Cheapest F1 race in ${ctx.season} from ${originSelect(ctx, origin, o => `${BASE}/from/${o.slug}/${ctx.season}/`, true)}</h1>
<p class="lede">Ranked by the whole weekend, not the ticket. Travel from ${esc(origin.iata)}, the hotel nights your flight times force, and getting to the track. Per person. <a href="${BASE}/cheapest-f1-race-${ctx.season}/">Why rank this way?</a></p>
<div class="controls">
<div class="switch" role="group" aria-label="Budget tier">${TIER_KEYS.map(t => `<button type="button" data-tier="${t}" aria-pressed="${t === 'standard'}" title="${esc(TIERS[t].blurb)}">${TIERS[t].label}</button>`).join('')}</div>
<div class="switch" role="group" aria-label="Room sharing"><button type="button" data-share="1" aria-pressed="true">On your own</button><button type="button" data-share="2" aria-pressed="false">Two sharing</button></div>
</div>
<p class="switch-note">${TIER_KEYS.map(t => `<span data-tier="${t}"${t === 'standard' ? '' : ' hidden'}>${TIERS[t].blurb}</span>`).join('')}</p>
</section>
<p class="freshness">Calendar checked ${longDate(ctx.statusChecked)}. Costs computed ${longDate(ctx.computedAt)}.</p>
${boards}
<section class="legend">
<p><b>Every number here is an estimate.</b> The bars beside each total show how far we trust it: one bar is a model or an editor's guess, three is an official price or a fare somebody actually paid. Most of the ${ctx.season} calendar is one bar, because the circuits have not published prices yet and FOM has not confirmed the dates.</p>
<p>Purple and the ▲ mark the cheapest figure in a column. Ticket prices are the midpoint of a published range; hover one to see the range. An amber date is provisional or the race is only rumoured, so book nothing on it. <a href="${REPO}/tree/main/data">Correct a figure</a> or <a href="${REPO}/issues/new?template=fare-wrong.md">report a fare you found</a>.</p>
</section>`;

  const desc = abroad
    ? `${best[0].r.name} is cheapest from ${origin.city} at about ${gbp(best[0].row.total)} a head. ${abroad.r.name} is the cheapest abroad at about ${gbp(abroad.row.total)}. All ${ctx.races.length} races ranked on total weekend cost.`
    : `All ${ctx.races.length} ${ctx.season} Grands Prix ranked by total weekend cost from ${origin.city}.`;
  return layout(ctx, {
    title: `Cheapest F1 race from ${origin.city}, ${ctx.season}`, desc, body, origin,
    canonical: `${BASE}/from/${origin.slug}/${ctx.season}/`,
  });
}

// ── one race, one origin ────────────────────────────────────────────────────
function renderBreakdown(ctx, origin, race, byTier) {
  const s = byTier.standard.tight, g = s.ground;
  const relaxed = byTier.standard.relaxed;
  const row = (label, note, key) => `<tr><th>${label}<span class="sub">${note}</span></th>${TIER_KEYS.map(t => `<td class="n" data-tight="${gbp(byTier[t].tight[key])}" data-relaxed="${gbp(byTier[t].relaxed[key])}">${gbp(byTier[t].tight[key])}</td>`).join('')}</tr>`;
  const why = TIER_KEYS.map(t => `<p data-assume-text="tight" data-tier="${t}"${t === 'standard' ? '' : ' hidden'}>${byTier[t].tight.nights_why.map(esc).join(' ')}</p><p data-assume-text="relaxed" data-tier="${t}" hidden>${byTier[t].relaxed.nights_why.map(esc).join(' ')}</p>`).join('');
  const travelLine = g
    ? `${gbp(s.flights)} to get there by road or rail`
    : `${gbp(s.flights)} to fly ${origin.iata} to ${s.airport}`;
  const stayNote = s.nights === 0
    ? 'No nights needed: you are close enough to sleep at home.'
    : `${gbp(s.nightly)} a night mid-range in ${esc(race.circuit.nearest_city)}. ${esc(race.hotel.source)}, checked ${longDate(s.hotel_captured)}.${s.hotel_stale ? ' Over a year old, treat it as a guess.' : ''}`;
  const transferNote = g
    ? `About ${gbp(race.circuit.circuit_transport_gbp_per_day)} a day getting to the circuit and back.`
    : `${s.airport} to town by ${esc(s.transfer_mode)}, ${gbp(s.transfer_each_way)} each way, ${s.transfer_minutes} min. Plus ${gbp(race.circuit.circuit_transport_gbp_per_day)} a day to the circuit.`;
  const next = g
    ? `Check train fares or budget fuel and parking for ${esc(origin.city)} to ${esc(where(race.circuit))}, ${longDate(s.arrive)}${s.arrive === s.depart ? '' : ' to ' + longDate(s.depart)}.`
    : `Search ${origin.iata} to ${s.airport}, out ${longDate(s.arrive)} and back ${longDate(s.depart)}, then hold it against the estimate here.`;

  const body = `
<nav class="crumb"><a href="${BASE}/from/${origin.slug}/${ctx.season}/">All races from ${esc(origin.city)}</a><a href="${BASE}/race/${race.race_id}/">Compare other cities</a></nav>
<section class="hero hero-tight">
<h1>${esc(race.name)}<span class="h1-sub">from ${esc(origin.city)}</span></h1>
<p class="status">${statusLine(race)}</p>
<p class="lede">About <b>${gbp(s.total)}</b> a head on a standard weekend${s.nights === 0 ? ', with no hotel needed' : ''}. ${meter(s.confidence)}</p>
</section>
<table class="detail">
<thead><tr><th><span class="sr">Cost</span></th>${TIER_KEYS.map(t => `<th class="n">${TIERS[t].label}</th>`).join('')}</tr></thead>
<tbody>
${row('Ticket', `${esc(s.ticket_source.replace(/\.?$/, '.'))} Standard range ${gbp(s.ticket_range[0])} to ${gbp(s.ticket_range[1])}. Checked ${longDate(s.ticket_captured)}.${s.ticket_stale ? ' Over a year old, treat it as a guess.' : ''}`, 'ticket')}
${row(g ? 'Getting there' : 'Flights', g ? esc(s.flight_source) : `${esc(s.flight_source)} Into ${s.airport}, roughly ${s.flight_hours}h each way.`, 'flights')}
<tr class="nights"><th>Nights<span class="sub">How many the schedule forces, not a guess</span>
<span class="assume" role="group" aria-label="Travel assumption"><button type="button" data-assume="tight" aria-pressed="true">Travel tight</button><button type="button" data-assume="relaxed" aria-pressed="false">Day either side</button></span></th>
${TIER_KEYS.map(t => `<td class="n" data-tight="${byTier[t].tight.nights}" data-relaxed="${byTier[t].relaxed.nights}">${byTier[t].tight.nights}</td>`).join('')}</tr>
${row('Stay', stayNote, 'accom')}
${row('Transfers', transferNote, 'transfer')}
<tr class="sum"><th>Total<span class="sub">Per person</span></th>${TIER_KEYS.map(t => `<td class="n" data-tight="${gbp(byTier[t].tight.total)}" data-relaxed="${gbp(byTier[t].relaxed.total)}">${gbp(byTier[t].tight.total)}</td>`).join('')}</tr>
</tbody></table>
${s.total === relaxed.total && s.nights > 0 ? '' : `<p class="undertable">${s.total === relaxed.total ? `No overnight stay either way, ${gbp(s.total)}.` : `Travelling tight, ${gbp(s.total)}. With a day either side, ${gbp(relaxed.total)}.`}${s.nights > 0 ? ` Two of you sharing a room, about ${gbp(s.total - Math.round(s.nightly * s.nights / 2))} each.` : ''}</p>`}
<section class="panel">
<h2 data-tight="Why ${s.nights} night${s.nights === 1 ? '' : 's'}" data-relaxed="Why ${relaxed.nights} night${relaxed.nights === 1 ? '' : 's'}">Why ${s.nights} night${s.nights === 1 ? '' : 's'}</h2>
${why}
<p class="muted">A cheaper journey that forces one more night is not cheaper. Switch the assumption above and the total moves with it.</p>
</section>
<section class="panel">
<h2>Next steps</h2>
<p>${next} For tickets, the <a href="${BASE}/race/${race.race_id}/">race page</a> has the on-sale date and the official link.${race.status !== 'confirmed' ? ' Book nothing non-refundable until FOM confirms the date.' : ''}</p>
<p class="muted">Found a real fare, or paid for a room here? <a href="${REPO}/issues/new?template=fare-wrong.md&title=Fare+from+${encodeURIComponent(origin.city)}+to+${encodeURIComponent(race.name)}+looks+wrong">Tell us what you paid</a> and it replaces the estimate on this page. Computed ${longDate(ctx.computedAt)}.</p>
</section>`;
  return layout(ctx, {
    title: `${race.name} from ${origin.city}: ${ctx.season} weekend cost`,
    desc: `About ${gbp(s.total)} a head for the ${race.name} from ${origin.city}: ticket, travel, ${s.nights} night${s.nights === 1 ? '' : 's'} and transfers, across three budgets.`,
    body, origin, canonical: `${BASE}/from/${origin.slug}/${race.race_id}/`,
    jsonld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: `Races from ${origin.city}`, item: `${SITE}${BASE}/from/${origin.slug}/${ctx.season}/` },
      { '@type': 'ListItem', position: 2, name: race.name, item: `${SITE}${BASE}/from/${origin.slug}/${race.race_id}/` }] },
  });
}

// ── race hub ────────────────────────────────────────────────────────────────
function renderRaceHub(ctx, race, cheapestOrigins) {
  const c = race.circuit, t = race.tickets;
  const aps = c.airports.map(a => `<tr><th>${a.iata}<span class="sub">${esc(a.transfer_mode)}, ${a.transfer_minutes} min</span></th><td class="n">${gbp(a.transfer_cost_gbp)}</td></tr>`).join('');
  const top = cheapestOrigins.slice(0, 12).map(({ origin, row }, i) => `<tr><td class="pos">${i + 1}</td><td class="race"><a href="${BASE}/from/${origin.slug}/${race.race_id}/">${esc(origin.city)}</a><span class="sub"><span class="loc">${esc(origin.country)}</span></span></td><td class="n">${gbp(row.flights)}</td><td class="n">${row.nights}</td><td class="n tot"><b>${gbp(row.total)}</b></td></tr>`).join('');
  const body = `
<nav class="crumb"><a href="${BASE}/">All races</a></nav>
<section class="hero hero-tight">
<h1>${esc(race.name)}<span class="h1-sub">${ctx.season}</span></h1>
<p class="status">${statusLine(race)}</p>
<p class="lede">${esc(c.name)}, ${esc(where(c))}, ${esc(c.country)}. ${esc(c.notes)}</p>
</section>
<div class="cols">
<section class="panel">
<h2 id="tickets">Tickets</h2>
<table class="kv"><tbody>
<tr><th>General admission</th><td class="n">${gbp(t.ga[0])}–${gbp(t.ga[1])}</td></tr>
<tr><th>Cheapest grandstand</th><td class="n">${gbp(t.gs_cheapest[0])}–${gbp(t.gs_cheapest[1])}</td></tr>
<tr><th>Main straight</th><td class="n">${gbp(t.gs_main[0])}–${gbp(t.gs_main[1])}</td></tr>
<tr><th>Availability</th><td class="n">${esc(t.obtainability.replace(/_/g, ' '))}</td></tr>
<tr><th>On sale</th><td class="n">${t.on_sale ? longDate(String(t.on_sale)) : 'not announced'}</td></tr>
</tbody></table>
<p class="muted">The ranking uses the midpoint of the cheapest grandstand range. ${meter(t.confidence)} ${esc(t.source)}. Checked ${longDate(String(t.captured))}. <a href="${REPO}/blob/main/data/tickets/${ctx.season}.yaml">Edit</a>.</p>
<h2 id="getting-there">Getting there</h2>
<table class="kv"><tbody>${aps}</tbody></table>
<p class="muted">One way to ${esc(c.nearest_city)}, then about ${gbp(c.circuit_transport_gbp_per_day)} a day to the circuit. <a href="${REPO}/blob/main/data/circuits.yaml">Edit</a>.</p>
<h2 id="rooms">Rooms</h2>
<table class="kv"><tbody>
<tr><th>Budget</th><td class="n">${gbp(race.hotel.budget)}</td></tr>
<tr><th>Mid-range</th><td class="n">${gbp(race.hotel.mid)}</td></tr>
<tr><th>Comfortable</th><td class="n">${gbp(race.hotel.comfortable)}</td></tr>
</tbody></table>
<p class="muted">Per night on race weekend, in ${esc(c.nearest_city)}. ${esc(race.hotel.source)}, checked ${longDate(String(race.hotel.captured))}. <a href="${REPO}/blob/main/data/hotel_rates.yaml">Edit</a>.</p>
</section>
<section class="panel">
<h2 id="cheapest-cities">Cheapest cities to come from</h2>
<table class="ranked mini"><thead><tr><th class="pos"><span class="sr">Position</span></th><th>From</th><th class="n">Travel</th><th class="n">Nights</th><th class="n">Total</th></tr></thead><tbody>${top}</tbody></table>
<p class="muted">Standard tier, travelling tight. Your city missing? <a href="${REPO}/issues/new?template=add-my-city.md">Ask for it</a> or <a href="${REPO}/blob/main/data/origins.yaml">add it</a> in one line.</p>
</section>
</div>`;
  return layout(ctx, {
    title: `${race.name} ${ctx.season}: what it costs to attend`,
    desc: `${race.name} ${ctx.season} at ${c.name}: ticket prices, airports and transfers, race-weekend room rates, and the cheapest cities to travel from.`,
    body, canonical: `${BASE}/race/${race.race_id}/`,
    jsonld: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${race.name} ${ctx.season}`, startDate: race.race_date, eventStatus: race.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: c.name, address: { '@type': 'PostalAddress', addressLocality: where(c), addressCountry: c.country }, geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon } }, url: `${SITE}${BASE}/race/${race.race_id}/` },
  });
}

// ── the explainer ───────────────────────────────────────────────────────────
function renderHeadline(ctx) {
  const body = `
<section class="hero">
<h1>Why the ticket ranking is the wrong ranking</h1>
<p class="lede">Every list of cheap Grands Prix ranks the ticket. The ticket is a third of the weekend, sometimes a fifth. Pick your airport and get the rest of it: ${originSelect(ctx, null, o => `${BASE}/from/${o.slug}/${ctx.season}/`, true)}</p>
</section>
<section class="panel">
<h2>The ticket is not the trip</h2>
<p>China has the cheapest ticket on the calendar and sells out to local demand in minutes. Monaco's general admission undercuts Miami's and the flight is a short hop from most of Europe, but you sleep in Nice at race-weekend rates. Las Vegas has the dearest tickets and the cheapest local travel of any race, because you walk there from your hotel. None of that surfaces until you add the columns up from where you actually live.</p>
<p>So each ranking here carries an <b>On ticket</b> column: where that race would sit if you compared ticket prices alone. The rows that move furthest are the ones worth knowing about.</p>
<h2>Nights are the hidden cost</h2>
<p>A cheaper flight that lands too late for Friday practice, or leaves too early after the flag, quietly adds a night at race-weekend rates. That can be more than the fare you saved. Every race page works out how many nights the schedule actually forces and lets you switch the assumption to see the total move.</p>
<h2>The ${ctx.season} calendar is not settled</h2>
<p>Only Monaco and Silverstone have published dates. Everything else is a reported or inferred slot, marked amber throughout, and nothing should be booked on the strength of it. Dates are mirrored nightly and the status updates itself when FOM confirms.</p>
</section>
<section class="panel">
<h2>Every race</h2>
<ul class="hubs">${ctx.races.map(r => `<li><a href="${BASE}/race/${r.race_id}/"><span class="pin pin-${STATUS[r.status].k}"></span>${esc(r.name)}<span class="sub">${shortDate(r.race_date)}</span></a></li>`).join('')}</ul>
</section>`;
  return layout(ctx, { title: `Why rank F1 races by total cost, not ticket price`, desc: `The ticket is a third of an F1 weekend. Flights, forced hotel nights and transfers decide which Grand Prix is actually cheapest from your city.`, body, canonical: `${BASE}/cheapest-f1-race-${ctx.season}/` });
}

function renderMethodology(ctx) {
  const body = `
<nav class="crumb"><a href="${BASE}/">All races</a></nav>
<section class="hero hero-tight"><h1>How every number is worked out</h1>
<p class="lede">It is a spreadsheet. The inputs are plain text files anyone can edit, and every figure carries how much we trust it and when somebody last looked.</p></section>
<section class="panel prose">
<h2>The sum</h2>
<pre>total = ticket
      + travel there and back
      + nights × nightly rate
      + 2 × airport transfer
      + daily circuit travel × race days</pre>
<p>Per person, in pounds, travelling alone. Two of you sharing a room halves the stay line, and the ranking has a switch for that.</p>
<h2>Tiers</h2>
<p>${TIER_KEYS.map(t => `<b>${TIERS[t].label}.</b> ${TIERS[t].blurb}`).join(' ')} Rankings use standard.</p>
<h2>Nights</h2>
<p>This is the part nobody else does. For each city and circuit we estimate travel time from distance, add the airport transfer, and ask two questions. Can a 06:00 departure get you trackside before your first session? If not, you need the night before. Can you get from the chequered flag to the airport with two and a half hours to spare before a 23:00 last departure? If not, you need the night after. Night races almost always fail the second test. Anything over roughly five and a half hours in the air always fails the first. Under 350 km we assume you drive or take the train, and under 90 km you sleep at home.</p>
<p><i>Travel tight</i> applies those tests. <i>Day either side</i> ignores them and books the obvious schedule. Both are shown; the ranking uses tight, because it is the cheapest honest trip.</p>
<h2>Travel</h2>
<p>There is no live flight search here and there never will be: no free fare API exists that a project like this can use. Fares come from two places. First, routes somebody has actually searched or paid for, which live in <code>data/fare_overrides.yaml</code>. Second, for everything else, a distance model: a fixed cost plus a rate per kilometre, multiplied for race-weekend demand and summer, with a penalty for long haul out of airports without direct flights. It is crude deliberately. It exists to get the order right, and it is marked one bar wherever it is used. A single pull request with a real fare replaces it.</p>
<p class="muted">The specifics, if you care: Amadeus decommissioned its self-service API on 17 July 2026 and Kiwi's Tequila became invite-only, which removed the two obvious options for a free project.</p>
<h2>Tickets</h2>
<p>Ranges rather than numbers, because Silverstone, Melbourne and Abu Dhabi price dynamically and the rest are heading the same way. The ranking uses the midpoint of the range for that tier. Taken from official circuit sites. Most ${ctx.season} figures are last year's indexed up by about 8% until circuits publish. Availability is modelled separately from price, because a cheap ticket you cannot buy is not cheap, which is why China and São Paulo carry a warning.</p>
<h2>Hotels</h2>
<p>Nightly bands for the town a sensible person on that budget actually stays in: Nice for Monaco, Nagoya for Suzuka, a campsite for Austria on a shoestring. That is why the location under a race name is the circuit, while the room rate is for the town named on the race page. Rates spike late, so these assume booking six to nine months out. Anything over a year old is flagged.</p>
<h2>Calendar</h2>
<p>Mirrored nightly from Jolpica-F1 into a plain file, with a status on every race and a note on where the date came from. The ${ctx.season} calendar was not confirmed when this was built. A provisional date never looks like a confirmed one.</p>
<h2>Confidence</h2>
<p>The bar meter on a trip is the weakest of its ticket, travel and hotel figures. One bar is an estimate or a model. Two is a published figure or a sampled search. Three is a current official price or a fare someone paid. Most of the site is one bar today. That is the true state of knowledge nine months out, and saying so costs nothing.</p>
<h2>Currency and party size</h2>
<p>Every figure is in pounds sterling, including on pages for cities that do not use it, converted at the rate on the day it was captured. All figures are per person for one traveller unless you switch on room sharing.</p>
<h2>What this is not</h2>
<p>It sells nothing and holds no basket, ever; packaging travel triggers ATOL and the Package Travel Regulations. It takes no commission and has no affiliate links or advertising, and no commercial relationship with any ticket seller, tour operator or airline mentioned anywhere on the site. Ticket aggregation is already covered by <a href="https://fastway1.com">Fastway1</a>, and GPDestinations' ticket-price rankings are the reference for that question; this site answers a different one.</p>
<h2>Fix something</h2>
<p>Every input sits in <a href="${REPO}/tree/main/data">/data</a> as YAML and is schema-checked before merge. <a href="${REPO}/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a> walks a first-timer through a pull request in five minutes, and there are <a href="${REPO}/issues/new/choose">issue forms</a> if you would rather just tell us the number.</p>
</section>`;
  return layout(ctx, { title: 'How the numbers work', body, canonical: `${BASE}/methodology/` });
}

function render404(ctx) {
  const body = `
<section class="hero">
<h1>That page is not here</h1>
<p class="lede">The link may be old, or a race may have dropped off the calendar. Pick your city and start again: ${originSelect(ctx, null, o => `${BASE}/from/${o.slug}/${ctx.season}/`, true)}</p>
<p class="lede"><a href="${BASE}/">Back to the ${ctx.season} ranking</a></p>
</section>`;
  return layout(ctx, { title: 'Page not found', body });
}

const CSS = `
@font-face{font-family:Archivo;font-style:normal;font-display:swap;font-weight:100 900;font-stretch:62% 125%;src:url(/${FONT}) format('woff2-variations')}
:root{
  --bg:#F5F6F8; --paper:#FFF; --ink:#14161A; --ink2:#565D6B; --ink3:#6B7280;
  --line:rgba(20,22,26,.09); --line2:rgba(20,22,26,.17);
  --purple:#5B2BD1; --purple-bg:#F1ECFE; --amber:#8A5A00; --amber-bg:#FBF0D8; --green:#12784A;
  --r:14px;
}
*{box-sizing:border-box}
html{font-size:16px;-webkit-text-size-adjust:100%}
/* Archivo's word space is narrow (~22% of em). Below about 0.9rem it rounds down to 2px and
   "UK and Ireland" reads as "UKand Ireland". Give small text a little more room. */
.sub,.tag,.pick-group,.muted,.freshness,.parts,.legend,.crumb,.switch-note,.status,
.ranked thead th,.detail thead th,.kv th,footer,.pick-search,.pick-empty{word-spacing:.085em}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:Archivo,ui-sans-serif,system-ui,sans-serif;font-variation-settings:'wdth' 100;
  font-size:1rem;line-height:1.55;font-variant-numeric:tabular-nums lining-nums;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
main{max-width:1180px;margin:0 auto;padding:0 28px 80px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;left:-999px;top:8px;z-index:60;background:var(--ink);color:#fff;padding:10px 16px;border-radius:8px}
.skip:focus{left:12px}

.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:20px;
  padding:14px 28px;background:rgba(245,246,248,.85);backdrop-filter:saturate(1.6) blur(12px);
  border-bottom:1px solid var(--line)}
.mark{font-weight:700;font-variation-settings:'wdth' 112;letter-spacing:-.02em;font-size:1.02rem;white-space:nowrap}
.top nav{margin-left:auto;display:flex;gap:18px;align-items:center;font-size:.92rem;color:var(--ink2)}
.top nav a:hover{color:var(--purple)}

.hero{padding:74px 0 30px}
h1{margin:0 0 18px;font-weight:700;font-variation-settings:'wdth' 116;max-width:21ch;
  font-size:clamp(2.05rem,5.2vw,3.4rem);line-height:1.03;letter-spacing:-.035em}
.hero-tight{padding:46px 0 24px}
.h1-sub{display:block;font-weight:500;font-variation-settings:'wdth' 100;
  font-size:.42em;letter-spacing:-.01em;color:var(--ink2);margin-top:.5em}
.lede{margin:0 0 12px;font-size:1.13rem;line-height:1.5;color:var(--ink2);max-width:58ch}
.lede b{color:var(--ink);font-weight:650}
.lede a{color:var(--purple);text-decoration:underline;text-underline-offset:2px}

.pick{position:relative;display:inline-block}
.pick select{appearance:none;-webkit-appearance:none;font:inherit;font-weight:inherit;
  font-variation-settings:inherit;letter-spacing:inherit;color:var(--purple);
  background:var(--purple-bg);border:0;border-radius:10px;cursor:pointer;
  padding:.06em 1.5em .06em .45em;max-width:min(100%,14ch);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1.4 1.6 6 6.2l4.6-4.6' fill='none' stroke='%235B2BD1' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right .5em center;background-size:.5em}
.pick-big select{border-radius:14px;padding:.02em 1.05em .02em .3em;background-size:.42em;background-position:right .32em center;max-width:none}
.lede .pick-big select{border-radius:9px;padding:.05em 1.5em .05em .5em;background-size:.5em;background-position:right .5em center}
.top .pick select{font-size:.92rem;font-weight:600;padding:.28em 1.7em .28em .7em;max-width:none}

/* Enhanced picker. The <select> above stays as the no-JS fallback and is hidden once this loads. */
.pick.on select{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.pick-btn{font:inherit;font-weight:inherit;font-variation-settings:inherit;letter-spacing:inherit;
  display:inline-flex;align-items:baseline;gap:.32em;color:var(--purple);background:none;border:0;
  padding:0 .06em;cursor:pointer;border-bottom:.075em solid var(--purple);border-radius:2px 2px 0 0;
  transition:background .15s}
.pick-btn:hover{background:var(--purple-bg)}
.pick-btn svg{width:.44em;height:.44em;flex:none;transition:transform .18s}
.pick.open .pick-btn svg{transform:rotate(180deg)}
.top .pick-btn{font-size:.92rem;font-weight:600;padding:.28em .7em;border-bottom:0;
  background:var(--purple-bg);border-radius:9px;align-items:center}
.top .pick-btn svg{width:.62em;height:.62em}
.lede .pick-btn{border-bottom-width:.09em}

.pick-panel{position:absolute;z-index:40;top:calc(100% + 10px);left:0;width:300px;max-width:86vw;
  background:var(--paper);border:1px solid var(--line2);border-radius:14px;
  box-shadow:0 18px 40px -12px rgba(20,22,26,.22);overflow:hidden;
  font-size:1rem;font-weight:400;font-variation-settings:'wdth' 100;letter-spacing:0;color:var(--ink);text-align:left}
.top .pick-panel{left:auto;right:0}
.pick-search{width:100%;font:inherit;font-size:.94rem;border:0;border-bottom:1px solid var(--line);
  padding:13px 15px;outline:0;background:var(--paper);color:var(--ink)}
.pick-search::placeholder{color:var(--ink3)}
.pick-list{list-style:none;margin:0;padding:6px;max-height:302px;overflow-y:auto;overscroll-behavior:contain}
.pick-list li{padding:0}
.pick-group{padding:10px 10px 4px;font-size:.76rem;font-weight:600;color:var(--ink3)}
.pick-opt{display:flex;align-items:center;gap:9px;width:100%;font:inherit;font-size:.95rem;
  text-align:left;background:none;border:0;border-radius:9px;padding:9px 10px;cursor:pointer;color:var(--ink)}
.pick-opt:hover,.pick-opt.active{background:var(--bg)}
.pick-opt[aria-selected=true]{color:var(--purple);font-weight:600}
.pick-opt::before{content:'';width:6px;height:6px;border-radius:50%;flex:none;background:transparent}
.pick-opt[aria-selected=true]::before{background:var(--purple)}
.pick-empty{margin:0;padding:16px 15px 18px;font-size:.9rem;color:var(--ink2)}
.pick-empty a{color:var(--purple);text-decoration:underline}
.pick-backdrop{position:fixed;inset:0;z-index:30;background:rgba(20,22,26,.32);border:0;padding:0}
@media (min-width:641px){.pick-backdrop{display:none}}
@media (max-width:640px){
  .pick-panel{position:fixed;inset:auto 0 0 0;width:auto;max-width:none;border-radius:16px 16px 0 0;
    border-bottom:0;box-shadow:0 -12px 40px -10px rgba(20,22,26,.3)}
  .pick-search{padding:16px;font-size:1rem}
  .pick-list{max-height:52vh;padding-bottom:16px}
  .pick-opt{padding:12px 10px;font-size:1rem}
}

.controls{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0 0}
.switch{display:inline-flex;gap:3px;padding:3px;background:var(--paper);border:1px solid var(--line);border-radius:999px}
.switch button{font:inherit;font-size:.88rem;font-weight:550;color:var(--ink2);
  background:none;border:0;border-radius:999px;padding:8px 16px;cursor:pointer;min-height:38px;
  transition:color .16s,background .16s}
.switch button:hover{color:var(--ink)}
.switch button[aria-pressed=true]{background:var(--ink);color:#fff}
.switch-note{margin:11px 0 0;font-size:.9rem;color:var(--ink3);max-width:62ch;min-height:1.4em}
.freshness{margin:22px 0 -6px;font-size:.8rem;color:var(--ink3);text-align:right}

.board{margin:14px 0 0;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
table{border-collapse:collapse;width:100%}
.ranked thead th{background:var(--paper);font-size:.78rem;font-weight:600;letter-spacing:.02em;
  color:var(--ink2);text-align:left;padding:13px 14px 11px;border-bottom:1px solid var(--line);white-space:nowrap}
.ranked thead th.n{text-align:right}
.ranked thead button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;letter-spacing:inherit}
.ranked thead button:hover{color:var(--purple)}
.ranked thead th[aria-sort] button::after{content:' ▾';font-size:.8em}
.ranked thead th[aria-sort=ascending] button::after{content:' ▴'}
.ranked td{padding:15px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.ranked tbody tr:last-child td{border-bottom:0}
.ranked tbody tr{transition:background .15s}
.ranked tbody tr:hover{background:#FAFAFC}
.n{text-align:right;white-space:nowrap;font-weight:500}
.sub{display:block;font-size:.79rem;font-weight:450;color:var(--ink3);line-height:1.35;margin-top:2px}
.race .sub{display:flex;flex-wrap:wrap;align-items:center;gap:4px 7px}
.pos{width:44px;text-align:right;color:var(--ink3);font-size:.95rem;padding-right:4px!important}
.race{min-width:180px}
.race a{font-weight:600;font-size:1.02rem;letter-spacing:-.012em;
  text-decoration:underline;text-decoration-color:var(--line2);text-decoration-thickness:1px;text-underline-offset:3px}
.race a:hover{color:var(--purple);text-decoration-color:var(--purple)}
.tag{display:inline-block;padding:1px 7px;border-radius:6px;background:var(--amber-bg);
  color:var(--amber);font-size:.72rem;font-weight:600}
.flag-abroad:empty{display:none}
.flag-abroad{display:inline-block;padding:1px 7px;border-radius:6px;background:var(--purple-bg);
  color:var(--purple);font-size:.72rem;font-weight:600}
.when{font-size:.94rem;color:var(--ink2);white-space:nowrap}
.when-prov,.when-rum{color:var(--amber)}
.when-prov .sub,.when-rum .sub{color:var(--amber)}
.n.low{color:var(--purple);font-weight:650}
.n.low .v::before{content:'▲ ';font-size:.62em;vertical-align:.18em}
.tot b{font-size:1.15rem;font-weight:680;letter-spacing:-.018em}
.tot .sub{color:var(--ink3);font-weight:500}
.lead .tot b{display:inline-block;background:var(--purple-bg);color:var(--purple);
  padding:2px 10px;border-radius:9px;margin-right:-4px}
.lead .tot .sub{color:var(--purple)}
.tr{width:82px;text-align:right;font-size:.86rem;color:var(--ink3);white-space:nowrap}
th.tr{text-align:right}
.dat{width:52px}
th.dat{text-align:left}
.parts{display:none}
.meter{display:inline-flex;gap:2.5px;vertical-align:middle}
.meter i{width:10px;height:4px;border-radius:2px;background:var(--line2)}
.m1 i:nth-child(1){background:var(--amber)}
.m2 i:nth-child(-n+2){background:var(--ink3)}
.m3 i{background:var(--green)}

.legend{margin:22px 0 0;font-size:.9rem;color:var(--ink2)}
.legend p{max-width:76ch;margin:0 0 8px}
.legend b{color:var(--ink);font-weight:600}
.legend a,.muted a,.prose a,footer a,.panel p a,.undertable a{color:var(--purple);
  text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}

.crumb{display:flex;flex-wrap:wrap;gap:16px;padding:22px 0 0;font-size:.88rem;color:var(--ink2)}
.crumb a{text-decoration:underline;text-decoration-color:var(--line2);text-underline-offset:3px}
.crumb a:hover{color:var(--purple);text-decoration-color:var(--purple)}

.status{margin:0 0 20px;padding:13px 16px;background:var(--paper);border:1px solid var(--line);
  border-radius:11px;font-size:.92rem;color:var(--ink2);max-width:74ch}
.status b{color:var(--ink);font-weight:600}
.pin{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;vertical-align:1px;background:var(--ink3)}
.pin-ok{background:var(--green)}.pin-prov{background:var(--amber)}
.pin-rum{background:var(--amber);box-shadow:inset 0 0 0 1.5px var(--paper),0 0 0 1.5px var(--amber)}
.pin-off{background:#B3271C}

.detail{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.detail thead th{font-size:.78rem;font-weight:600;color:var(--ink2);
  padding:14px 18px 11px;border-bottom:1px solid var(--line);text-align:right}
.detail thead th:first-child{text-align:left}
.detail th{text-align:left;font-weight:600;font-size:1rem;padding:18px;border-bottom:1px solid var(--line);vertical-align:top;max-width:46ch}
.detail td{padding:18px;border-bottom:1px solid var(--line);vertical-align:top;font-size:1.06rem}
.detail th .sub{font-weight:450;max-width:48ch}
.detail tr.nights th,.detail tr.nights td{background:var(--purple-bg)}
.detail tr.nights td{color:var(--purple);font-weight:680;font-size:1.3rem}
.detail tr.sum th,.detail tr.sum td{border-bottom:0;padding-top:20px;padding-bottom:22px}
.detail tr.sum td{font-size:1.5rem;font-weight:700;letter-spacing:-.02em}
.assume{display:inline-flex;flex-wrap:wrap;gap:3px;margin-top:12px;padding:3px;background:var(--paper);
  border:1px solid var(--line2);border-radius:999px}
.assume button{font:inherit;font-size:.8rem;font-weight:550;color:var(--ink2);background:none;
  border:0;border-radius:999px;padding:8px 14px;min-height:36px;cursor:pointer;transition:color .16s,background .16s}
.assume button[aria-pressed=true]{background:var(--ink);color:#fff}
.undertable{margin:14px 2px 0;font-size:.92rem;color:var(--ink2)}
@keyframes flash{from{background:var(--purple-bg)}to{background:transparent}}
.flash{animation:flash .5s ease-out}

.panel{margin:32px 0 0;padding:28px 30px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r)}
.panel h2{margin:0 0 12px;font-size:1.06rem;font-weight:650;letter-spacing:-.015em;font-variation-settings:'wdth' 106}
.panel p{margin:0 0 12px;max-width:72ch;color:var(--ink2)}
.panel p:last-child{margin-bottom:0}
.panel p b{color:var(--ink)}
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
.mini thead th{padding:10px 8px}
.mini td{padding:12px 8px}
.hubs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:2px}
.hubs a{display:flex;align-items:baseline;gap:8px;padding:9px 10px;border-radius:9px;font-weight:500;transition:background .15s}
.hubs a:hover{background:var(--bg)}
.hubs .sub{display:inline;margin-left:auto;white-space:nowrap}

footer{max-width:1180px;margin:0 auto;padding:28px;border-top:1px solid var(--line);color:var(--ink3);font-size:.85rem}
footer p{max-width:84ch;margin:0 0 10px}
.feet{display:flex;flex-wrap:wrap;gap:18px}
:focus-visible{outline:2.5px solid var(--purple);outline-offset:3px;border-radius:4px}

@media (max-width:980px){.cols{grid-template-columns:1fr}h1{max-width:none}}
@media (max-width:820px){
  main{padding:0 16px 56px}
  .top{padding:11px 14px;gap:9px;flex-wrap:nowrap}
  .mark{font-size:.9rem}
  .top nav{gap:10px;font-size:.79rem;min-width:0}
  .top .pick select{font-size:.79rem;padding:.26em 1.5em .26em .6em}
  .top nav a[href$="-2027/"]{display:none}
  .hero{padding:38px 0 20px}
  .lede{font-size:1.05rem}
  .freshness{text-align:left;margin-bottom:2px}
  .board{border-radius:12px}
  .ranked thead{display:none}
  .ranked tbody,.ranked tr,.ranked td{display:block}
  .ranked tr{position:relative;padding:15px 16px 14px 48px;border-bottom:1px solid var(--line)}
  .ranked td{padding:0;border:0}
  .ranked .pos{position:absolute;left:0;top:16px;width:38px;text-align:center}
  .ranked .n:not(.tot),.ranked .tr{display:none}
  .ranked .tot{position:absolute;right:16px;top:14px;text-align:right}
  .ranked .race{padding-right:98px}
  .ranked .dt{margin-top:4px}
  .ranked .when{font-size:.79rem}
  .ranked .when .sub{display:inline;margin-left:4px}
  .ranked .parts{display:block;margin-top:7px;padding-right:46px;font-size:.8rem;color:var(--ink3)}
  .ranked .dat{position:absolute;right:16px;bottom:14px}
  .ranked tbody tr:hover{background:none}
  .mini tr{padding-left:44px}
  .mini .n:not(.tot){display:none}
  .detail{border-radius:12px}
  .detail th,.detail td{padding:14px 12px;font-size:.98rem}
  .detail thead th:not(:first-child){font-size:.7rem;padding:12px 8px}
  .detail th .sub{max-width:none}
  .detail tr.sum td{font-size:1.2rem}
  .panel{padding:22px 20px;border-radius:12px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const JS = `
document.addEventListener('DOMContentLoaded',function(){
  var money=function(n){return '\\u00A3'+Math.round(n).toLocaleString('en-GB')};
  var num=function(el,k){return parseFloat(el.dataset[k])||0};
  var share=1,sortKey='tot',sortAsc=true;

  function paint(board){
    var rows=[].slice.call(board.querySelectorAll('tbody tr'));
    rows.forEach(function(r){
      var accom=Math.round(num(r,'accom')/share);
      r._t=num(r,'ticket')+num(r,'flights')+accom+num(r,'transfer');
      r._a=accom;
      var c=r.querySelector('.c-accom .v'); if(c)c.textContent=money(accom);
      r.querySelector('.tot b').textContent=money(r._t);
    });
    var key={'tot':function(r){return r._t},'c-ticket':function(r){return num(r,'ticket')},
      'c-flights':function(r){return num(r,'flights')},'c-accom':function(r){return r._a},
      'c-transfer':function(r){return num(r,'transfer')},
      'date':function(r){return r.dataset.date},'name':function(r){return r.querySelector('.race a').textContent}}[sortKey];
    rows.sort(function(a,b){var x=key(a),y=key(b);return (x>y?1:x<y?-1:0)*(sortAsc?1:-1)});
    var tb=board.querySelector('tbody'); rows.forEach(function(r){tb.appendChild(r)});

    var COLS=[['c-ticket','ticket'],['c-flights','flights'],['c-accom',null],['c-transfer','transfer']];
    var val=function(r,c){return c[1]===null?r._a:num(r,c[1])};
    var mins={}; COLS.forEach(function(c){mins[c[0]]=Math.min.apply(null,rows.map(function(r){return val(r,c)}))});
    var leader=Math.min.apply(null,rows.map(function(r){return r._t}));
    var firstForeign=null;
    rows.forEach(function(r){
      if(!firstForeign&&r.dataset.foreign==='1'&&r._t===Math.min.apply(null,rows.filter(function(x){return x.dataset.foreign==='1'}).map(function(x){return x._t})))firstForeign=r;
    });
    rows.forEach(function(r,i){
      r.querySelector('.pos').textContent=i+1;
      r.classList.toggle('lead',r._t===leader);
      var gap=r._t-leader;
      r.querySelector('.gap').textContent=gap===0?'cheapest':'+'+money(gap);
      COLS.forEach(function(c){
        var cell=r.querySelector('.'+c[0]);
        if(cell)cell.classList.toggle('low',val(r,c)===mins[c[0]]);
      });
      var fa=r.querySelector('.flag-abroad');
      if(fa)fa.textContent=(r===firstForeign&&r._t!==leader)?'cheapest abroad':'';
      var nts=r.querySelector('.nts');
      if(nts&&share>1&&r.dataset.nights!=='0')nts.textContent=r.dataset.nights+(r.dataset.nights==='1'?' night':' nights')+', shared';
      else if(nts)nts.textContent=r.dataset.nights==='0'?'no hotel':r.dataset.nights+(r.dataset.nights==='1'?' night':' nights');
    });
    board.querySelectorAll('thead th').forEach(function(th){
      var b=th.querySelector('button');
      if(!b)return;
      if(b.dataset.sort===sortKey)th.setAttribute('aria-sort',sortAsc?'ascending':'descending');
      else th.removeAttribute('aria-sort');
    });
  }
  function paintAll(){document.querySelectorAll('.board').forEach(paint)}

  // read state from the URL so a link or Back button restores the view
  function readHash(){
    var h=(location.hash||'').replace('#','').split(',');
    h.forEach(function(v){
      if(['shoestring','standard','comfortable'].indexOf(v)>=0)setTier(v,true);
      if(v==='sharing'){share=2;syncShare()}
      if(v==='relaxed')setAssume('relaxed',true);
    });
  }
  function writeHash(){
    var bits=[];
    var t=document.querySelector('.switch [data-tier][aria-pressed=true]');
    if(t&&t.dataset.tier!=='standard')bits.push(t.dataset.tier);
    if(share===2)bits.push('sharing');
    var a=document.querySelector('.assume [aria-pressed=true]');
    if(a&&a.dataset.assume==='relaxed')bits.push('relaxed');
    history.replaceState(null,'',bits.length?'#'+bits.join(','):location.pathname);
  }
  function setTier(t,quiet){
    document.querySelectorAll('.switch [data-tier]').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.tier===t)});
    document.querySelectorAll('.board,.switch-note span').forEach(function(el){el.hidden=el.dataset.tier!==t});
    if(!quiet)writeHash();
  }
  function syncShare(){document.querySelectorAll('.switch [data-share]').forEach(function(x){x.setAttribute('aria-pressed',+x.dataset.share===share)})}

  document.querySelectorAll('.switch [data-tier]').forEach(function(b){
    b.addEventListener('click',function(){setTier(b.dataset.tier)});
  });
  document.querySelectorAll('.switch [data-share]').forEach(function(b){
    b.addEventListener('click',function(){share=+b.dataset.share;syncShare();paintAll();writeHash()});
  });
  document.querySelectorAll('.ranked thead button[data-sort]').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.dataset.sort;
      if(sortKey===k)sortAsc=!sortAsc; else {sortKey=k;sortAsc=true}
      paintAll();
    });
  });

  function setAssume(a,quiet){
    document.querySelectorAll('.assume button').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.assume===a)});
    var changed=[];
    document.querySelectorAll('[data-tight]').forEach(function(el){
      if(el.textContent!==el.dataset[a]){el.textContent=el.dataset[a];if(el.tagName==='TD')changed.push(el)}
    });
    if(!quiet)changed.forEach(function(el){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')});
    document.querySelectorAll('[data-assume-text]').forEach(function(p){
      p.hidden=!(p.dataset.assumeText===a&&p.dataset.tier==='standard');
    });
    if(!quiet)writeHash();
  }
  document.querySelectorAll('.assume button').forEach(function(b){
    b.addEventListener('click',function(){setAssume(b.dataset.assume)});
  });

  // ── city picker ─────────────────────────────────────────────────────────
  // The server sends a plain <select> so the site works without JS. Here we hide it and
  // put a searchable list in its place: 49 cities is too many to scroll through blind.
  var dim=function(){document.querySelectorAll('.board,.detail').forEach(function(el){el.style.opacity=.45})};
  document.querySelectorAll('.pick select').forEach(function(s){s.addEventListener('change',dim)});

  function buildPicker(pick){
    var sel=pick.querySelector('select'); if(!sel)return;
    var items=[],cur=null;
    [].forEach.call(sel.children,function(node){
      if(node.tagName==='OPTGROUP'){
        items.push({group:node.label});
        [].forEach.call(node.children,function(o){items.push({v:o.value,t:o.textContent,sel:o.selected});if(o.selected)cur=o.textContent});
      } else if(node.value){ items.push({v:node.value,t:node.textContent,sel:node.selected}); if(node.selected)cur=node.textContent; }
    });
    if(!items.length)return;

    var btn=document.createElement('button');
    btn.type='button'; btn.className='pick-btn';
    btn.setAttribute('aria-haspopup','listbox'); btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-label','Departure city');
    btn.innerHTML='<span class="pick-label"></span><svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1.4 1.6 6 6.2l4.6-4.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.querySelector('.pick-label').textContent=cur||'your city';

    var panel=document.createElement('div');
    panel.className='pick-panel'; panel.hidden=true;
    panel.innerHTML='<input class="pick-search" type="text" autocomplete="off" spellcheck="false" placeholder="Search cities" aria-label="Search cities"><ul class="pick-list" role="listbox" aria-label="Departure city"></ul><p class="pick-empty" hidden>No city by that name yet. <a href="${REPO}/issues/new?template=add-my-city.md">Ask for yours</a> and it takes one line to add.</p>';
    var search=panel.querySelector('.pick-search'), list=panel.querySelector('.pick-list'), empty=panel.querySelector('.pick-empty');
    pick.appendChild(btn); pick.appendChild(panel); pick.classList.add('on');

    var opts=[];
    items.forEach(function(it){
      var li=document.createElement('li');
      if(it.group){ li.className='pick-group'; li.textContent=it.group; li.setAttribute('role','presentation'); }
      else {
        var b=document.createElement('button');
        b.type='button'; b.className='pick-opt'; b.textContent=it.t; b.dataset.href=it.v;
        b.setAttribute('role','option'); b.setAttribute('aria-selected',it.sel?'true':'false');
        b.addEventListener('click',function(){dim();location.href=it.v});
        li.appendChild(b); opts.push({el:b,li:li,t:it.t.toLowerCase()});
      }
      list.appendChild(li);
    });

    var backdrop=null,active=-1;
    function visible(){return opts.filter(function(o){return !o.li.hidden})}
    function setActive(i){
      var v=visible(); if(!v.length)return;
      active=(i+v.length)%v.length;
      opts.forEach(function(o){o.el.classList.remove('active')});
      v[active].el.classList.add('active');
      v[active].el.scrollIntoView({block:'nearest'});
    }
    function filter(q){
      q=q.trim().toLowerCase(); var any=false,lastGroup=null,groupHas=false;
      list.querySelectorAll('.pick-group').forEach(function(g){g.hidden=true});
      opts.forEach(function(o){ var hit=!q||o.t.indexOf(q)>=0; o.li.hidden=!hit; if(hit)any=true; });
      // show a group heading only if something under it survived the filter
      [].forEach.call(list.children,function(li){
        if(li.classList.contains('pick-group')){lastGroup=li;groupHas=false;}
        else if(!li.hidden&&lastGroup&&!groupHas){lastGroup.hidden=false;groupHas=true;}
      });
      empty.hidden=any; active=-1;
      if(any)setActive(0);
    }
    function open(){
      panel.hidden=false; pick.classList.add('open'); btn.setAttribute('aria-expanded','true');
      search.value=''; filter('');
      if(window.innerWidth<=640){
        backdrop=document.createElement('button');
        backdrop.className='pick-backdrop'; backdrop.setAttribute('aria-label','Close');
        backdrop.addEventListener('click',close); document.body.appendChild(backdrop);
      }
      setTimeout(function(){search.focus()},10);
    }
    function close(){
      panel.hidden=true; pick.classList.remove('open'); btn.setAttribute('aria-expanded','false');
      if(backdrop){backdrop.remove();backdrop=null}
    }
    btn.addEventListener('click',function(e){e.stopPropagation();panel.hidden?open():close()});
    search.addEventListener('input',function(){filter(search.value)});
    panel.addEventListener('click',function(e){e.stopPropagation()});
    panel.addEventListener('keydown',function(e){
      var v=visible();
      if(e.key==='ArrowDown'){e.preventDefault();setActive(active+1)}
      else if(e.key==='ArrowUp'){e.preventDefault();setActive(active-1)}
      else if(e.key==='Enter'){e.preventDefault();if(v[active]){dim();location.href=v[active].el.dataset.href}}
      else if(e.key==='Escape'){e.preventDefault();close();btn.focus()}
    });
    document.addEventListener('click',function(){if(!panel.hidden)close()});
  }
  document.querySelectorAll('.pick').forEach(buildPicker);

  // On the ranking the H1 already carries a picker, so the one in the bar only
  // appears once the headline has scrolled away.
  var heroPick=document.querySelector('.hero .pick'), barPick=document.querySelector('.top .pick');
  if(heroPick&&barPick&&'IntersectionObserver' in window){
    barPick.style.visibility='hidden';
    new IntersectionObserver(function(e){
      barPick.style.visibility=e[0].isIntersecting?'hidden':'visible';
    },{rootMargin:'-60px 0px 0px 0px'}).observe(heroPick);
  }

  if(document.querySelector('.board')){paintAll()}
  readHash();
  if(document.querySelector('.board')){paintAll()}
});
`;

module.exports = { renderRanked, renderBreakdown, renderRaceHub, renderHeadline, renderMethodology, render404, CSS, JS };
