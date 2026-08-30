---
name: Fare estimate looks wrong
about: You searched or booked a route and the number here is off
title: "Fare from [origin] to [race] looks wrong"
labels: data, flights
---
**Origin airport:**
**Destination airport:**
**Dates you searched or flew:**
**What you found (economy return, per person, with currency):**
**Where (airline site, Skyscanner, actually booked):**

This goes into `data/fare_overrides.yaml` as one line and replaces the distance estimate for that route and month.
