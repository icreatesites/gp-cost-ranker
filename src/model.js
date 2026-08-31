// Cost model. Everything here is deterministic and runs offline from the YAML in /data.
// Read /methodology on the built site for the prose version of what this file does.

const TIERS = {
  shoestring:  { label: 'Shoestring',  ticket: 'ga',          hotel: 'budget',      fareMult: 0.8,  raceDays: 2, blurb: 'General admission, cheapest flight at awkward hours, hostel or camping, Saturday and Sunday only.' },
  standard:    { label: 'Standard',    ticket: 'gs_cheapest', hotel: 'mid',         fareMult: 1.0,  raceDays: 3, blurb: 'Cheapest grandstand, a sensible flight (one stop is fine), 3-star hotel, all three days.' },
  comfortable: { label: 'Comfortable', ticket: 'gs_main',     hotel: 'comfortable', fareMult: 1.45, raceDays: 3, blurb: 'Main-straight grandstand, direct flight at civilised times, 4-star hotel, all three days.' },
};

const CONF_RANK = { low: 0, medium: 1, high: 2 };
const minConf = (...cs) => cs.reduce((a, b) => (CONF_RANK[a] <= CONF_RANK[b] ? a : b));

function haversineKm(a, b) {
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Rough block time for a return leg, hours, one direction.
function flightHours(km, origin) {
  let h = 0.75 + km / 780;
  if (km > 3500 && !origin.hub) h += 2.5; // connection
  return h;
}

// Return economy fare, GBP, standard tier, race-weekend inflated. Distance model with month seasonality.
// Deliberately crude: it exists to get the ORDER of races right from a given origin, not the price.
function modelFare(km, origin, month) {
  let base;
  if (km < 1200) base = 55 + 0.06 * km;
  else if (km < 3500) base = 90 + 0.055 * km;
  else base = 220 + 0.055 * km;
  let mult = km < 3500 ? 1.3 : 1.15;          // race-weekend demand
  if (km > 3500 && !origin.hub) mult *= 1.12; // connecting itinerary
  if ([6, 7, 8].includes(month)) mult *= 1.1;
  if (month === 12) mult *= 1.08;
  return Math.round((base * mult) / 10) * 10;
}

function monthOf(dateStr) { return Number(String(dateStr).slice(5, 7)); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const hm = s => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const weekday = dateStr => new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0 Sun ... 6 Sat

// Beyond about 2.5 hours each way, three round trips in a weekend stops being a thing anyone does,
// so we only consider commuting below that.
const MAX_COMMUTE_HOURS = 2.5;

function sessionClock(race, tier) {
  const daysAtTrack = TIERS[tier].raceDays;
  const firstDay = addDays(race.race_date, -(daysAtTrack - 1));
  return {
    daysAtTrack, firstDay,
    firstSessionStart: daysAtTrack === 3 ? hm(race.fp1_local) : hm(race.fp1_local) + 2,
    raceEnd: hm(race.race_local) + 2,
  };
}

// Ground routes: cost commuting against staying and return whichever is cheaper.
function groundPlan({ race, tier, km, returnCost, nightly, assumption }) {
  const { daysAtTrack, firstDay, firstSessionStart, raceEnd } = sessionClock(race, tier);
  const h = km / 80, hh = Math.round(h * 10) / 10;
  const inOk = 6 + h <= firstSessionStart, outOk = raceEnd + h <= 24;
  const dayTripOk = inOk && outOk && h <= MAX_COMMUTE_HOURS;

  const stayArrive = assumption === 'relaxed' ? addDays(firstDay, -1) : (inOk ? firstDay : addDays(firstDay, -1));
  const stayDepart = assumption === 'relaxed' ? addDays(race.race_date, 1) : (outOk ? race.race_date : addDays(race.race_date, 1));
  const stayNights = Math.round((new Date(stayDepart) - new Date(stayArrive)) / 86400000);
  const stayCost = returnCost + stayNights * nightly;
  const commuteCost = returnCost * daysAtTrack;

  const commute = dayTripOk && commuteCost < stayCost;
  const trips = daysAtTrack === 1 ? 'one return trip' : daysAtTrack === 2 ? 'two return trips' : 'three return trips';
  const why = [];
  if (commute) {
    why.push(h < 0.75
      ? `You are practically on top of the circuit, about ${Math.round(km)} km away.`
      : `About ${hh}h each way, so a day trip works: leave at 06:00 for the ${fmtH(firstSessionStart)} session and you are home by ${fmtH(raceEnd + h)}.`);
    why.push(`${trips.charAt(0).toUpperCase() + trips.slice(1)} costs £${commuteCost}, against £${stayCost} to travel once and stay ${stayNights} night${stayNights === 1 ? '' : 's'}.` + (h >= 1.25 ? ' Long days, but cheaper, so no hotel.' : ' No hotel needed.'));
  } else if (!dayTripOk) {
    why.push(`About ${hh}h each way.` + (h > MAX_COMMUTE_HOURS ? ' Too far to do three times in a weekend.' : !inOk ? ` You cannot make the ${fmtH(firstSessionStart)} session from home.` : ` The race ends about ${fmtH(raceEnd)}, too late to get home.`));
    why.push(`So you stay ${stayNights} night${stayNights === 1 ? '' : 's'}.`);
  } else {
    why.push(`About ${hh}h each way. A day trip is possible, but ${trips} would cost £${commuteCost} against £${stayCost} to travel once and stay ${stayNights} night${stayNights === 1 ? '' : 's'}.`);
    why.push('Staying is cheaper here, so that is what is costed.');
  }
  return {
    nights: commute ? 0 : stayNights,
    travel: commute ? commuteCost : returnCost,
    arrive: commute ? firstDay : stayArrive,
    depart: commute ? race.race_date : stayDepart,
    flight_hours: hh, why, commute,
    source: commute
      ? `${trips.charAt(0).toUpperCase() + trips.slice(1)} by road or rail, about ${Math.round(km)} km each way.`
      : `One return trip by road or rail, about ${Math.round(km)} km each way.`,
  };
}

// The signature calculation: how many nights does this flight schedule actually force?
// assumption 'tight'   = fly around the sessions as tightly as the clock allows
// assumption 'relaxed' = arrive the day before your first session, leave the day after the race
function nightsFor({ race, circuit, airport, origin, tier, assumption }) {
  const dur = flightHours(haversineKm(origin, airport), origin);
  const dtz = tzOf(circuit, race.race_date) - originTz(origin, race.race_date);
  const daysAtTrack = TIERS[tier].raceDays;
  const raceDow = weekday(race.race_date);
  // First session day = race day minus (daysAtTrack-1). Vegas' Saturday race shifts everything.
  const firstDay = addDays(race.race_date, -(daysAtTrack - 1));
  const firstSessionStart = daysAtTrack === 3 ? hm(race.fp1_local) : hm(race.fp1_local) + 2; // Sat = FP3/quali-ish
  const raceEnd = hm(race.race_local) + 2;
  const transferH = airport.transfer_minutes / 60;

  let arrive, depart, why = [];
  if (assumption === 'relaxed') {
    arrive = addDays(firstDay, -1);
    depart = addDays(race.race_date, 1);
    why.push('Arrive the day before your first session, fly home the day after the race.');
  } else {
    // Arrival: leave origin at 06:00 local, land at 06:00 + duration + tz shift.
    const landLocal = 6 + dur + dtz;
    const atTrack = landLocal + transferH + 1;
    const sameDayIn = dur <= 5.5 && atTrack <= firstSessionStart;
    arrive = sameDayIn ? firstDay : addDays(firstDay, -1);
    why.push(sameDayIn
      ? `A 06:00 departure lands you about ${fmtH(landLocal)} local, at the track by ${fmtH(atTrack)}, before the first session at ${fmtH(firstSessionStart)}. No extra night needed.`
      : dur > 5.5
        ? `About ${dur.toFixed(1)}h in the air each way, so you need to arrive the day before.`
        : `Earliest arrival is about ${fmtH(landLocal)} local plus ${airport.transfer_minutes} min transfer; the first session starts ${fmtH(firstSessionStart)}. That forces a night before.`);
    // Departure: need race end + transfer + 2.5h check-in before a 23:00 last departure.
    const readyToFly = raceEnd + transferH + 2.5;
    const sameDayOut = readyToFly <= 23 && dur <= 12;
    depart = sameDayOut ? race.race_date : addDays(race.race_date, 1);
    why.push(sameDayOut
      ? `The race ends about ${fmtH(raceEnd)}; you can be airside by ${fmtH(readyToFly)} for an evening flight home.`
      : `The race ends about ${fmtH(raceEnd)} local, too late for a same-day flight home with a ${airport.transfer_minutes} min transfer. That's an extra night.`);
  }
  const nights = Math.round((new Date(depart) - new Date(arrive)) / 86400000);
  return { nights, arrive, depart, flight_hours: Math.round(dur * 10) / 10, why, raceDow };
}
function fmtH(h) { h = ((h % 24) + 24) % 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`; }
// Stored tz_offset_hours are SUMMER offsets for zones that observe DST. Outside the DST window we
// subtract an hour. Set `dst: none` on a circuit or origin whose zone never shifts (Türkiye, Mexico,
// Brazil, the Gulf), otherwise the zone is inferred from position.
function dstZone(x) {
  if (x.dst) return x.dst;
  if (x.lon >= -25 && x.lon <= 40 && x.lat > 34) return 'eu';
  if (x.lon >= -170 && x.lon <= -50 && x.lat > 14) return 'us';
  if (x.lon >= 110 && x.lon <= 155 && x.lat < 0) return 'au';
  return 'none';
}
function nthDow(year, month, dow, n) { // n = -1 for last
  if (n === -1) { const d = new Date(Date.UTC(year, month + 1, 0)); return d.getUTCDate() - ((d.getUTCDay() - dow + 7) % 7); }
  const first = new Date(Date.UTC(year, month, 1));
  return 1 + ((dow - first.getUTCDay() + 7) % 7) + (n - 1) * 7;
}
function inDst(zone, dateStr) {
  if (zone === 'none') return true; // treat stored offset as always correct
  const d = new Date(dateStr + 'T12:00:00Z'), y = d.getUTCFullYear();
  const on = (m, dow, n) => Date.UTC(y, m, nthDow(y, m, dow, n));
  if (zone === 'eu') return d >= new Date(on(2, 0, -1)) && d < new Date(on(9, 0, -1));
  if (zone === 'us') return d >= new Date(on(2, 0, 2)) && d < new Date(on(10, 0, 1));
  if (zone === 'au') return d >= new Date(on(9, 0, 1)) || d < new Date(on(3, 0, 1));
  return true;
}
function tzOf(x, dateStr) {
  const base = x.tz_offset_hours ?? Math.round(x.lon / 15) + 1;
  return inDst(dstZone(x), dateStr) ? base : base - 1;
}
function originTz(o, dateStr) { return tzOf(o, dateStr); }

function midpoint([lo, hi]) { return Math.round((lo + hi) / 2); }
const money = n => '\u00A3' + Math.round(n).toLocaleString('en-GB');

function fareFor(origin, airport, month, tier, overrides) {
  const key = `${origin.iata}:${airport.iata}:${month}`;
  const o = overrides.get(key);
  if (o) return { gbp: Math.round(o.estimated_return_gbp * TIERS[tier].fareMult), confidence: o.confidence, source: o.source, refreshed: o.last_refreshed, method: 'override' };
  const km = haversineKm(origin, airport);
  return { gbp: Math.round(modelFare(km, origin, month) * TIERS[tier].fareMult), confidence: 'low', source: `Distance model (${Math.round(km)} km). No sampled fare for this route yet.`, refreshed: null, method: 'model', km: Math.round(km) };
}

// One trip: origin x race x tier x assumption.
function computeTrip({ origin, race, circuit, tickets, hotel, overrides, tier, assumption, computedAt }) {
  const t = TIERS[tier];
  const month = monthOf(race.race_date);
  // Pick the airport that minimises fare + both transfers.
  let best = null;
  for (const ap of circuit.airports) {
    const f = fareFor(origin, ap, month, tier, overrides);
    const cost = f.gbp + 2 * ap.transfer_cost_gbp;
    if (!best || cost < best.cost) best = { ap, f, cost };
  }
  let { ap, f } = best;
  const nightly = hotel[t.hotel];
  // Under ~350 km you drive or take the train. Then the real question is the one this whole site
  // exists to ask: is it cheaper to commute in each day, or to travel once and pay for nights?
  // We cost both and take the cheaper, as long as a day trip is actually doable.
  const groundKm = haversineKm(origin, circuit);
  const ground = groundKm < 350;
  let plan = null;
  if (ground) {
    const mult = { shoestring: 0.7, standard: 1, comfortable: 1.5 }[tier];
    const returnCost = Math.round((30 + groundKm * 0.16) * mult / 10) * 10;
    plan = groundPlan({ race, tier, km: groundKm, returnCost, nightly, assumption });
    f = { gbp: plan.travel, confidence: 'medium', source: plan.source, method: 'ground', km: Math.round(groundKm) };
    ap = { iata: circuit.nearest_city, transfer_cost_gbp: 0, transfer_minutes: Math.round(groundKm / 80 * 60), transfer_mode: 'drive or train', lat: circuit.lat, lon: circuit.lon };
  }
  const n = plan || nightsFor({ race, circuit, airport: ap, origin, tier, assumption });
  const ticketRange = tickets[t.ticket];
  const ticket = midpoint(ticketRange);

  // For a drive or train of 90-350 km there are two honest trips: take a room near the circuit,
  // or travel in and back each day. Price both and keep the cheaper one. This is the same
  // travel-versus-nights coupling the rest of the site is about, applied to the home race.
  let travel = f.gbp, nights = n.nights, why = n.why.slice();
  if (ground && groundKm >= 90 && assumption === 'tight' && n.nights > 0) {
    const stayCost = f.gbp + n.nights * nightly;
    const commuteCost = f.gbp * t.raceDays;
    const hrs = Math.round((groundKm / 80) * 2 * t.raceDays * 10) / 10;
    const nts = `${n.nights} night${n.nights === 1 ? '' : 's'}`;
    if (commuteCost < stayCost) {
      travel = commuteCost; nights = 0;
      why = [`About ${Math.round(groundKm)} km each way, so both options are open. A room for ${nts} plus one return trip comes to ${money(stayCost)}. Travelling in and back on each of the ${t.raceDays} days costs ${money(commuteCost)} and needs no hotel, so that is what is priced here. It is roughly ${hrs} hours of travelling across the weekend.`];
    } else {
      why = n.why.concat([`Travelling in and back each day would cost ${money(commuteCost)} against ${money(stayCost)} for a room and one return trip, so staying ${nts} is the cheaper way round.`]);
    }
  }

  const accom = nights * nightly;
  const transfer = 2 * ap.transfer_cost_gbp + circuit.circuit_transport_gbp_per_day * t.raceDays;
  const total = ticket + travel + accom + transfer;
  const hotelAge = ageDays(hotel.captured, computedAt), ticketAge = ageDays(tickets.captured, computedAt);
  return {
    origin: origin.slug, origin_iata: origin.iata, race_id: race.race_id, tier, assumption,
    airport: ap.iata, transfer_mode: ap.transfer_mode, transfer_minutes: ap.transfer_minutes, transfer_each_way: ap.transfer_cost_gbp,
    ticket, ticket_range: ticketRange, ticket_confidence: tickets.confidence, ticket_source: tickets.source, obtainability: tickets.obtainability,
    flights: travel, flight_confidence: f.confidence, flight_source: f.source + (nights === 0 && ground && groundKm >= 90 ? ` Priced as ${t.raceDays} return trips, one for each day at the circuit.` : ''),
    flight_method: f.method, ground: !!ground, commute: !!(plan && plan.commute), flight_hours: n.flight_hours, flight_km: f.km,
    nights, nightly, arrive: n.arrive, depart: nights === 0 && ground ? race.race_date : n.depart, nights_why: why, hotel_confidence: hotel.confidence, hotel_stale: hotelAge > 365, hotel_captured: hotel.captured,
    accom, transfer, circuit_transport: circuit.circuit_transport_gbp_per_day * t.raceDays, total,
    confidence: minConf(tickets.confidence, f.confidence, hotel.confidence),
    ticket_stale: ticketAge > 365, ticket_captured: tickets.captured, computed_at: computedAt,
  };
}
function ageDays(d, now) { return Math.round((new Date(now) - new Date(d)) / 86400000); }

module.exports = { TIERS, computeTrip, haversineKm, nightsFor, minConf };
