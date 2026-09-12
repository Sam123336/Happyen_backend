# API

The public application API is versioned beneath `/v1` and will publish OpenAPI.

- `GET /v1/health/live` — confirms that the API process can serve requests.
- `GET /v1/health/ready` — confirms that the API can reach PostgreSQL.
- `POST /v1/auth/session` — validates the bearer token and idempotently provisions the Happyen account. The optional JSON body `{ "localDate": "YYYY-MM-DD" }` is the phone's calendar day; each distinct day advances the profile's `streakDays` (consecutive days the city was opened) or restarts it at 1 after a gap. A day more than one day away from the server's UTC date is ignored in favour of the server's.
- `GET /v1/me/profile` — returns the authenticated account, profile, privacy defaults, and the streak (`streakDays`, `streakLastActiveOn`).
- `PATCH /v1/me/profile` — updates `displayName`, `username`, and/or `bio`.
- `PATCH /v1/me/privacy` — updates explicit `profileVisibility`, `presenceVisibility`, and/or `momentsVisibility` audiences.
- `GET /v1/places/search?lat=&lng=&query=&radius_m=&limit=` — venue candidates near a point, from Foursquare Places. `radius_m` is metres (max 100000), `limit` defaults to 10 (max 50). Returns `503` when `FOURSQUARE_API_KEY` is unset or Foursquare rejects the call.
  Results are passed through, never stored: Foursquare's licence requires "Powered by Foursquare" attribution wherever the data is shown and limits how long it may be cached.
- `GET /v1/events/nearby?lat=&lng=&radius_m=&category=&starts_after=&starts_before=&include_live=&limit=` — published event occurrences within `radius_m` metres of a point, soonest first. `radius_m` defaults to 5000 (max 50000), `limit` to 50 (max 200), and `starts_after` to now. Ongoing events are included by default; pass `include_live=false` for a future-only time window. `category` is one of `music`, `comedy`, `food`, `pets`, `sports`, `other`. Each result carries the occurrence id, its event id, title, category, venue name, coordinates, start/end times, `isLive`, hero image and distance in metres.

Authenticated endpoints require `Authorization: Bearer <Firebase ID token>`. Calling `POST /auth/session` is the bridge between a valid external identity and an internal user. Other protected endpoints reject identities that are not provisioned or whose internal account is suspended/deleted.

A liveness check does not fail solely because an external dependency is temporarily unavailable. API errors use a stable machine-readable `code` and a human-readable `message`; validation errors also include structured `details`.
