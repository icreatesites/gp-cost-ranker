# Fixing a number on this site

Everything the site shows comes from the plain-text files in `/data`. You don't need to run anything to fix them. If you've never opened a pull request, this is a good first one.

## The five-minute version (no install)

1. Find the file. Every page has an "Edit" link next to the data it shows. Or go straight to:
   - Ticket prices: `data/tickets/2027.yaml`
   - A flight fare you searched or paid: `data/fare_overrides.yaml`
   - Hotel rates: `data/hotel_rates.yaml`
   - Your city missing: `data/origins.yaml`
   - Airport transfers, circuit notes: `data/circuits.yaml`
   - Race dates and confirmation status: `data/calendar/2027.yaml`
2. Click the pencil icon on GitHub. It will fork the repo for you.
3. Change the line. Update `captured` or `last_refreshed` to today's date and say where the number came from in `source`. A URL is ideal.
4. Click "Propose changes", then "Create pull request". Done.

A check runs automatically. If it fails, the error message says which line is wrong. Usually it's a missing quote or a date in the wrong format (`2026-08-30`).

## What good data looks like

- **A fare you actually paid** beats a search result beats our distance model. Mark confidence `high`, `medium`, `low` in that order.
- **Ticket prices** are ranges `[low, high]` because of dynamic pricing. If the circuit publishes one price, use it twice.
- **Hotel rates** are per night, race weekend, in the town a normal person on that budget would stay in, booked six to nine months out. If you booked somewhere, say the hotel and when you booked in `source`.
- **Don't copy from GPDestinations or other ranking sites.** Go to the circuit's own ticket page.
- Pounds sterling. Convert at the rate on the day; we're estimating, not invoicing.

## Adding an origin

One line in `data/origins.yaml`:

```yaml
- { slug: leeds, city: Leeds, country: United Kingdom, iata: LBA, lat: 53.8659, lon: -1.6606, hub: false, region: europe }
```

`hub: true` only if the airport has direct long-haul flights. Optional `tz_offset_hours` if the summer-time guess from longitude is wrong.

## Running it locally

```
npm ci
npm run build      # validates data then builds ./site
npx serve site     # or any static server
```

`SEASON=2026 npm run build` builds another season if the calendar and ticket files exist.

## Things we don't take PRs for

Anything that sells, books, or holds a basket. A live flight search on page load. User accounts. If you want those, fork it and good luck; the reasons are in `/methodology`.
