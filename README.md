# GP cost ranker

Given an origin airport, rank every Grand Prix by what the **whole weekend** costs: ticket, flights, the nights the flight schedule actually forces, and getting to the track. Every other ranking only counts the ticket.

Free, static, open source. Nothing is sold. The data is YAML in `/data`, anyone can fix it by pull request, and CI refuses malformed files.

## Run it

```
npm ci
npm run build   # validate + build ~1,250 pages into ./site in under a second
npx serve site
```

## Layout

```
data/
  calendar/2027.yaml    dates with confirmed / provisional / rumoured / cancelled status
  circuits.yaml         airports, transfers, local transport, notes (changes ~never)
  origins.yaml          origin airports, one line each
  tickets/2027.yaml     price RANGES per race plus obtainability
  hotel_rates.yaml      nightly bands per circuit with capture dates
  fare_overrides.yaml   real sampled/paid fares; replace the model per route+month
  computed/             the precomputed trip_cost grid, written by build
src/
  model.js              the cost model, including the nights calculation
  build.js              computes the grid and writes every page
  render.js             HTML, CSS, the few lines of JS
  validate.js           schema check for /data, runs in CI
  mirror-calendar.js    nightly: one request to Jolpica-F1, merged into the calendar file
```

## What's deliberately not here

No database, no server, no live flight search, no accounts, no checkout. GitHub Pages hosts it for nothing; Jolpica is called once a night by a scheduled workflow. The build prompt asked for Next.js and Postgres; a static site does the same job with nothing to keep alive, which is the whole point of a project with no budget.

## Before you build any more of this

Show `/from/manchester/2027/` to an F1 fan. If they could have guessed the order, stop.

## Credits

Calendar data from [Jolpica-F1](https://api.jolpi.ca/), volunteer-run; consider donating. Ticket aggregation is [Fastway1](https://fastway1.com)'s job, not ours. Ticket-price rankings by GPDestinations are the reference for that question; this site answers a different one.

MIT.
