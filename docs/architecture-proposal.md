# Happyn architecture proposal

> **Status, 5 September 2026.** This is the full architecture plan of record. It
> was written against an empty repository, and implementation has since started
> and diverged from it in four places. The proposal text below is unchanged;
> read it together with this list.
>
> | Proposal says | Built instead | Decided |
> | --- | --- | --- |
> | Cloud Run Mumbai for API and workers | Vercel Functions | 5 Sep 2026 |
> | Monorepo with `apps/` and `packages/` | Two repositories, no workspace | 5 Sep 2026 |
> | pg-boss queue with worker processes | Vercel Cron Functions | 5 Sep 2026 |
> | Product name "Happyn" | "Happyen" | 5 Sep 2026 |
>
> Sections 4, 5, 13, 14 and 16 are the ones affected. Everything else, including
> the data model, geofence design, ingestion design and security posture, still
> stands. The hosting, repository and queue changes are recorded as ADR 008 in
> the app repository at `docs/decisions/008-hosting-and-repository-split.md`.
>
> This is a copy. The canonical version lives in the app repository at
> `docs/architecture-proposal.md`; edit that one and re-copy, so the two do
> not drift.

---

## 1. Product Understanding

Happyn is a mobile social-discovery product where the city—not a traditional content feed—is the primary interface.

The core loop is:

```text
Discover nearby event
        ↓
See friends interested or present
        ↓
Open event / obtain external ticket
        ↓
Arrive and verify presence
        ↓
Unlock capture
        ↓
Publish a verified Moment
        ↓
Interact and build an event memory
        ↓
Discover the next event
```

The linked Stitch project reinforces this direction through:

- City, Discover, and People navigation.
- "Friends out now" and semantic event presence.
- Live and "VERIFIED HERE" Moments.
- A verified-location camera.
- Profile "Memory Paths" built from attended events.
- Energy-oriented treatments such as "Very Active," "Wild," "Hype," and "Chill."

The defensible parts of Happyn are not ticket inventory alone. They are:

1. A distinctive living map.
2. Trustworthy event inventory.
3. Privacy-safe friend presence.
4. Risk-based proof of presence.
5. Verified, event-bound Moments.
6. Live Energy as a first-class server-owned concept.

## 2. Functional Requirements

### MVP

- iOS and Android Flutter application.
- Bengaluru launch, with cities represented as data rather than hard-coded logic.
- Map-first discovery using viewport, distance, time, category, price, and live-state filters.
- Zoom-dependent clusters, event symbols, energy auras, and limited building extrusion.
- Event detail, directions, external tickets, save/interested/going.
- Google, Apple, and optionally phone authentication.
- Profiles and mutual friendships.
- Semantic friend presence without exact coordinates.
- Circle geofences and foreground presence verification.
- Short-lived attendance sessions.
- Verified photo and short-video Moments.
- Simple authoritative Live Energy score.
- Push notifications and deep links.
- Organizer/admin event submission and moderation.
- Source adapters, provenance, normalization, and assisted deduplication.
- Reporting, blocking, suspension, and moderation audit trail.
- Product analytics, crash reporting, structured logs, and basic operational dashboards.

### Phase 2

- Polygon venue boundaries.
- Close Friends and richer presence controls.
- Organizer accounts and self-service submissions.
- Reactions, comments, friend tagging, and richer memory journeys.
- More event providers and venue feeds.
- Better deduplication and discovery ranking.
- QR-assisted indoor attendance verification.
- Improved energy scoring from observed telemetry.
- Partial offline map support and cached event discovery.
- Affiliate ticket links.

### Future

- Native ticketing and payments.
- Event chat.
- Lightweight 3D Event Worlds.
- BLE/NFC/venue infrastructure for higher-trust presence.
- ML recommendations and ranking.
- Multi-country localization.
- Dedicated search infrastructure.
- Organizer analytics and promotion products.
- Vector-tile event delivery at very large scale.

## 3. Technical Challenges

The hardest problems are:

- **Map identity and performance:** Happyn needs richer visual language than ordinary pins without converting every marker into an expensive Flutter widget.
- **Inventory quality:** Bengaluru event coverage cannot safely depend on one public aggregator.
- **Presence integrity:** GPS establishes a useful risk signal, not mathematical proof.
- **Indoor venues:** GPS accuracy may be worse than the venue itself.
- **Privacy:** Location, friend presence, and historical attendance can reveal sensitive behavior.
- **Media:** Upload retry, transcoding, moderation, CDN delivery, and deletion must work as one pipeline.
- **Deduplication:** Similar titles and times alone produce false merges.
- **Realtime restraint:** The map must feel alive without permanently maintaining thousands of unnecessary socket subscriptions.
- **Platform permissions:** Both Apple and Android expect location access to be purpose-limited. Apple prefers When In Use access; Android recommends foreground access unless background location is essential. [Apple Core Location](https://developer.apple.com/documentation/CoreLocation/requesting-authorization-to-use-location-services), [Android location permissions](https://developer.android.com/develop/sensors-and-location/location/permissions)
- **Event ecosystem:** Ticketmaster exposes global discovery interfaces, but Bengaluru coverage must be validated; Eventbrite's general public event-search API was shut down, and new Meetup API consumers require Meetup Pro and approval. [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/), [Eventbrite API notice](https://www.eventbrite.com/platform/new/api), [Meetup API access](https://help.meetup.com/hc/en-us/articles/41453576628749)

The principal product risk is therefore event supply and operational quality—not backend throughput.

## 4. Proposed Technology Stack

| Component | Recommendation and why | Alternative considered / why not now | Cost implications and risks |
|---|---|---|---|
| Mobile | **Flutter**. Strong fit for a custom animated UI, single iOS/Android codebase, camera, location, and native map SDK integration. | React Native is viable but adds more JS/native interaction around a map-heavy experience. Native Swift/Kotlin gives maximum control but roughly doubles product implementation effort. | Normal app-store and developer-account costs. Map SDK/platform plugins require real-device performance testing. |
| Mobile architecture | Feature-oriented MVVM: views, Riverpod view-models/controllers, repositories, services, optional use cases only for complex flows. | Ceremony-heavy "clean architecture" everywhere. | Lower maintenance burden. Flutter's current guidance strongly recommends UI/data separation and repositories. [Flutter architecture guide](https://docs.flutter.dev/app-architecture/guide) |
| State management | **Riverpod** only. Good async-state modeling, dependency overrides, and isolated testing. | Bloc is mature but more event/state boilerplate for this team. Provider alone is simpler but less capable for the number of asynchronous domains. | Free/open source; team must enforce provider ownership conventions. |
| Backend | **NestJS + TypeScript modular monolith**. Modules for users, social, events, geo, attendance, moments, ingestion, discovery, moderation, and notifications. | FastAPI is productive but loses shared TypeScript contracts. Go is efficient but slower for early product iteration. Supabase-only client access makes authorization and presence logic harder to centralize. | Framework is free; Node memory and cold-start behavior need measurement. |
| API | **Versioned REST + OpenAPI**. Idempotency keys for important mutations. | GraphQL adds caching and authorization complexity without a clear MVP benefit. | Straightforward mobile caching and operational tooling. |
| Database | **Managed PostgreSQL + PostGIS on Supabase Pro, Mumbai**. NestJS remains the only normal application data path. | AWS RDS/Cloud SQL offer more infrastructure control but higher initial operations and baseline cost. Firestore is a poor fit for joins, canonical event merging, and spatial queries. | Pro starts around $25/month; compute, storage, replicas, PITR, and separate staging increase cost. Mumbai is an available region. [Supabase pricing](https://supabase.com/pricing), [regions](https://supabase.com/docs/guides/platform/regions) |
| Geospatial | `geography(Point,4326)` plus indexed polygon geometry and PostGIS functions. | Geohashes alone create boundary and distance inaccuracies and still need application-side filtering. | Included with Postgres. `ST_DWithin` can use spatial indexes and is preferred for radius filtering. [PostGIS guidance](https://postgis.net/documentation/tips/st-dwithin/) |
| Map provider | **Mapbox Maps SDK for Flutter** for MVP. It has an official Flutter SDK, custom styles, runtime sources/layers, camera expressions, and fill-extrusion support. [Mapbox Flutter SDK](https://docs.mapbox.com/flutter/maps/guides/), [style layers](https://docs.mapbox.com/flutter/maps/guides/styles/) | Google Maps is extremely attractive on India pricing—the native Maps SDK is currently free—but offers less freedom for Happyn's intended visual system. MapLibre reduces lock-in and SDK fees but introduces tile sourcing, attribution, styling operations, and newer Flutter-platform maturity concerns. | Mapbox is free through 25,000 mobile map MAU, then currently $4/1,000 for the next tier. At 100,000 map MAU, approximately $300/month. [Mapbox pricing](https://www.mapbox.com/pricing), [Google India pricing](https://developers.google.com/maps/billing-and-pricing/pricing-india) |
| Event Worlds | Mapbox sprite/symbol layers, circle/heat layers, energy glows, zoom expressions, and selective fill extrusions. No general 3D models in MVP. | Flutter widget overlays and individual 3D models have excessive CPU/GPU, synchronization, and battery cost at map scale. | Asset-design effort rather than major infrastructure cost. |
| Realtime | **REST polling for the city map** every 30–60 seconds; **SSE only while an event detail is open**. FCM/APNs when backgrounded. | Universal WebSockets create connection and fan-out complexity. Supabase Realtime would split authorization between two backends. | Low initial cost. Add Redis pub/sub when multiple API instances must fan out SSE events. |
| Cache | **No Redis initially.** Use CDN, mobile cache, well-indexed Postgres, and short HTTP cache headers. | Redis adds another bill, failure mode, and invalidation system before measured need. | Add managed Redis around hot discovery, rate limits, and multi-instance realtime when metrics justify it. |
| Queue | **pg-boss/Postgres-backed jobs** for ingestion, notifications, thumbnails, cleanup, and recalculation. | BullMQ requires Redis. SQS is durable and scalable but increases cloud coupling and local-development differences. | No separate queue service initially. Move high-volume ingestion/media workloads to SQS or Pub/Sub at larger scale. |
| Photo storage/CDN | **Cloudflare R2**, private originals, signed/direct uploads, derived public variants behind CDN. | S3 is mature but internet egress can dominate social-media cost. Supabase Storage is operationally simpler but has metered egress beyond its allowance. | R2 Standard is currently $0.015/GB-month with free internet egress and a 10 GB free tier. [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Video | **Cloudflare Stream** with one-time direct creator uploads, short maximum duration, automatic transcoding, signed playback. | Self-managed FFmpeg is cheaper only at some scales and creates a substantial reliability burden. S3 + MediaConvert needs more orchestration. | Currently $5/1,000 stored minutes and $1/1,000 delivered minutes. [Stream pricing](https://developers.cloudflare.com/stream/pricing/), [direct uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/) |
| Notifications | **Firebase Cloud Messaging**, forwarding to APNs on iOS. | Direct APNs plus a separate Android provider duplicates lifecycle work. | FCM itself is no-cost. [Firebase pricing](https://firebase.google.com/pricing) |
| Authentication | **Firebase Auth** for Google, Apple, and phone OTP; backend maps Firebase identities to internal users. Prefer social login at launch and make phone configurable based on delivery/cost testing. | Custom authentication is too risky. Supabase Auth is reasonable but Firebase aligns with FCM and device integrity tooling. | Non-phone auth has generous no-cost MAU allowance; phone is billed per SMS and must be budget-capped. |
| App integrity | **Firebase App Check**, Play Integrity, and App Attest/DeviceCheck as risk signals. | Treating any single integrity verdict as absolute proof would reject legitimate users and remain bypassable. | Usually low infrastructure cost; implementation and false-positive monitoring matter. App Check supports custom backends. [Firebase custom-backend App Check](https://firebase.google.com/docs/app-check/flutter/custom-resource) |
| Admin | **Next.js internal web application**, sharing generated API contracts and design tokens. | A low-code admin becomes restrictive around merge workflows, geo editing, and moderation evidence. | Can start on a low-cost managed frontend tier. |
| Analytics | **Firebase Analytics behind an internal analytics interface**; BigQuery export or PostHog later if needed. | Adding multiple analytics SDKs increases binary size and inconsistent definitions. | Avoid sending raw coordinates or sensitive attendance data as analytics properties. |
| Monitoring | JSON structured logs, request IDs, OpenTelemetry-compatible instrumentation, **Sentry** for mobile/backend errors, provider dashboards for queues/media. | Datadog is powerful but expensive for an MVP. | Start on free/low tiers; retention and event volume become the main cost. |
| Hosting | **Cloud Run Mumbai** for API and workers; Cloud Scheduler for periodic jobs; Supabase Mumbai for data. | Kubernetes is unnecessary. Fly.io Mumbai is credible but Cloud Run has stronger managed jobs and easier integration with Firebase/GCP. | Pay-per-use with free allowances; Google's example of an always-on small worker is approximately $12–17/month before regional/workload differences. [Cloud Run pricing](https://cloud.google.com/run/pricing) |
| CI/CD | GitHub Actions, Docker, Flutter build workflows, migration validation, staged deployments. | Manual deployment is error-prone; full GitOps/Kubernetes is premature. | Usually free or inexpensive at early usage. |

### Map decision

Mapbox is the primary recommendation despite Google's stronger India price because the living map is Happyn's central product surface. Mapbox's officially supported Flutter layers, expressions, camera control, custom styles, and fill extrusion make the design achievable without excessive overlay widgets.

The map integration will sit behind a narrow `MapEngine` interface, and Happyn-owned event overlays will use portable GeoJSON/vector-tile schemas. That does not eliminate migration cost, but it prevents Mapbox types from spreading throughout the app.

## 5. System Architecture

```text
                         ┌──────────────────────┐
                         │  Flutter iOS/Android │
                         │                      │
                         │ Mapbox map           │
                         │ Riverpod/MVVM        │
                         │ Local cache          │
                         └───────┬──────────────┘
                                 │
             REST / SSE / App Check / Firebase identity token
                                 │
                    ┌────────────▼─────────────┐
                    │ NestJS Modular Monolith  │
                    │ Cloud Run — Mumbai       │
                    │                          │
                    │ Auth & Users             │
                    │ Social & Privacy         │
                    │ Events & Discovery       │
                    │ Geo & Attendance         │
                    │ Moments & Moderation     │
                    │ Energy & Notifications   │
                    │ Ingestion & Admin API    │
                    └───────┬────────┬─────────┘
                            │        │
            ┌───────────────▼─┐    ┌─▼──────────────────┐
            │ PostgreSQL       │    │ Cloud Run Workers  │
            │ + PostGIS        │    │ + pg-boss          │
            │ Supabase Mumbai  │    │                    │
            │ Source of truth  │    │ ingest / normalize │
            └──────────────────┘    │ deduplicate        │
                                    │ image processing   │
              ┌─────────────────────┤ notifications      │
              │                     │ energy / cleanup   │
              │                     └────────────────────┘
      ┌───────▼────────┐       ┌───────────────┐
      │ Cloudflare R2  │       │ Cloudflare    │
      │ Photo objects  │       │ Stream video  │
      │ + CDN variants │       │ transcode/CDN │
      └────────────────┘       └───────────────┘

      Firebase Auth ─ identity
      FCM/APNs     ─ background delivery
      Mapbox       ─ basemap and rendering
      Google Maps  ─ server-side geocoding where required
      Sentry/OTel  ─ errors, traces, operational signals
```

At approximately one million users:

- Add managed Redis for hot cache, distributed rate limits, and realtime pub/sub.
- Move heavy jobs to SQS/Pub/Sub.
- Add Postgres read replicas and partition high-volume Moment/attendance tables.
- Serve map-event data as vector tiles.
- Evaluate OpenSearch only if Postgres search metrics justify it.
- Separate media, ingestion, and notification workers independently—not the entire monolith.
- Establish data-retention automation and a dedicated trust-and-safety pipeline.

## 6. Database Design

### Identity and social

- `users`
- `user_identities` — Firebase provider UID mapped to one internal user.
- `profiles`
- `privacy_settings`
- `friendships` — normalized user pair, requester, status.
- `blocks`
- `close_friend_memberships` — Phase 2.
- `organizers`
- `organizer_members`

**MVP social decision:** mutual friendship. Presence is sensitive, and reciprocal consent is safer and simpler. Phase 2 can add one-way following for public organizers and creators.

### Cities, venues, and events

- `countries`
- `cities`
- `venues`
- `event_categories`
- `events` — canonical concept.
- `event_occurrences` — actual start/end instance with a location snapshot.
- `event_geofences`
- `event_sources`
- `event_source_records`
- `event_source_links` — connects source records to canonical events.
- `event_merge_decisions`
- `ticket_links`

### Intent, presence, and energy

- `saved_events`
- `event_interests`
- `event_attendance_intents`
- `attendance_sessions`
- `attendance_location_samples`
- `attendance_risk_assessments`
- `event_energy_snapshots`

### Moments and moderation

- `moments`
- `moment_media`
- `moment_reactions`
- `moment_comments`
- `reports`
- `moderation_actions`
- `user_suspensions`

### Notifications and operations

- `device_tokens`
- `notification_preferences`
- `notification_deliveries`
- `outbox_events`
- `job`
- `audit_logs`

### Geospatial fields

- `cities.center geography(Point,4326)`
- `cities.boundary geometry(MultiPolygon,4326)`
- `venues.location geography(Point,4326)`
- `event_occurrences.location geography(Point,4326)`
- `event_geofences.center geography(Point,4326)`
- `event_geofences.radius_m integer`
- `event_geofences.boundary geometry(Polygon,4326)`

The occurrence keeps a location snapshot even when it references a venue. This preserves history and allows efficient discovery without depending on a mutable venue address.

### Important indexes

- GiST on city boundaries, venue locations, occurrence locations, and polygon geofences.
- Partial B-tree on published/upcoming occurrences: `(city_id, start_at)` where status is published.
- B-tree on `(event_id, start_at)`.
- Unique `(provider_id, external_id)` for source provenance.
- GIN trigram indexes on normalized event and venue names.
- Unique normalized friendship pair.
- Partial unique active-attendance index on `(user_id, event_occurrence_id)`.
- B-tree on Moments `(event_occurrence_id, created_at DESC)` where moderation state is visible.
- B-tree on notification idempotency key.
- B-tree on report/moderation state and creation time.

Nearby queries use `ST_DWithin`; viewport queries use the spatial index plus time/status filters. Search begins with Postgres full-text and `pg_trgm`, not Elasticsearch.

## 7. API Design

Representative `/v1` groups:

```text
/auth
  POST /auth/session
  POST /auth/logout

/me
  GET   /me
  PATCH /me/profile
  PATCH /me/privacy
  GET   /me/notifications

/cities
  GET /cities
  GET /cities/{id}

/events
  GET  /events?bbox=&starts_after=&starts_before=&categories=
  GET  /events/nearby?lat=&lng=&radius_m=
  GET  /events/search?q=
  GET  /events/{id}
  POST /events/{id}/save
  POST /events/{id}/interest
  POST /events/{id}/going
  GET  /events/{id}/presence
  GET  /events/{id}/stream               SSE

/social
  POST /friend-requests
  POST /friend-requests/{id}/accept
  GET  /friends
  POST /users/{id}/block
  GET  /friends/presence

/attendance
  POST /attendance/challenge
  POST /attendance/verify
  POST /attendance/{sessionId}/heartbeat
  POST /attendance/{sessionId}/end

/moments
  POST /moments/upload-intent
  POST /moments
  GET  /events/{id}/moments
  POST /moments/{id}/report

/media
  POST /media/photo-upload-intent
  POST /media/video-upload-intent
  POST /media/{id}/finalize

/notifications
  POST   /devices
  DELETE /devices/{id}
  PATCH  /notification-preferences

/admin
  CRUD events, venues, categories, organizers
  source failures, duplicate candidates, reports
  merge, verify, moderate, suspend
```

Cursor pagination is used for feeds and Moments. Viewport responses are capped and return clustering-friendly records. Every write performs server-side authorization.

## 8. Geofence / Proof-of-Presence Architecture

### Verification flow

1. User opens the event and explicitly selects "I'm here."
2. API issues a signed, single-use challenge containing:
   - user and occurrence IDs;
   - server nonce;
   - expiration;
   - expected action;
   - request-binding hash.
3. App collects several foreground location samples over a short window.
4. Each sample includes coordinates, accuracy, device timestamp, monotonic timestamp, speed/bearing when available, and Android mock-location indication.
5. App obtains a fresh platform-integrity token near the verification action.
6. API validates identity, nonce, expiry, integrity signal, and request binding.
7. PostGIS calculates distance or polygon inclusion on the server.
8. Risk evaluation checks:
   - stale samples;
   - accuracy wider than an allowed threshold;
   - impossible travel from recent trusted samples;
   - mock-location flags;
   - tampered/unrecognized client;
   - repeated challenges or replay;
   - abnormal account/device activity.
9. Server creates a short-lived attendance session with a confidence tier and expiry.
10. While the event screen/camera is active, foreground heartbeats refresh it.
11. Creating a Moment requires a currently valid session and a fresh capture authorization.
12. Leaving, heartbeat expiry, event-window expiry, blocking, or risk escalation closes the session.

Play Integrity explicitly recommends binding a verdict to request content and using it as one element in a tiered anti-abuse strategy. Android also exposes `Location.isMock()`, but that flag is only one signal. [Play Integrity](https://developer.android.com/google/play/integrity/overview), [Android Location](https://developer.android.com/reference/android/location/Location.html)

### Accuracy policy

- Do not use a single universal radius.
- Each venue receives a calibrated minimum radius based on venue size and observed signal quality.
- Accepting a sample considers both distance and reported horizontal accuracy.
- Poor-accuracy samples receive "cannot verify yet," not an automatic fraud label.
- Indoor venues can use a broader low-confidence circle initially.
- QR, BLE, Wi-Fi, ticket scans, and organizer confirmation are future supplementary signals.

### Privacy policy

- No background location permission in MVP.
- No continuous path storage.
- Raw attendance samples receive a short retention period.
- Historical public profiles expose events only according to visibility settings.
- Friends receive semantic presence, never coordinates.
- Approximate location is enough for browsing; precise foreground location is requested only for distance accuracy or attendance.
- Capture remains locked if precise location is unavailable, with a clear explanation and non-posting fallback.

This design raises the cost of abuse but does not claim perfect GPS-spoof prevention.

## 9. Event Ingestion Architecture

```text
Organizer / Venue / Licensed Provider / Operations
                        ↓
                   Source Adapter
                        ↓
             Immutable Source Record
                        ↓
      Parse → Validate → Normalize → Geocode
                        ↓
             Candidate Classification
                        ↓
        Exact match + similarity candidates
                        ↓
          Auto-link / Review / New event
                        ↓
            Canonical Event + Occurrences
```

Each adapter implements:

- fetch or webhook receipt;
- cursor/checkpoint management;
- provider rate limits;
- raw payload preservation;
- normalization;
- health metrics and failure reporting.

Deduplication features:

- normalized title and aliases;
- venue identity;
- coordinate distance;
- start/end time tolerance;
- organizer and performer;
- provider identifiers;
- category;
- recurrence pattern.

High-confidence matches may auto-link. Ambiguous matches go to an admin merge queue. Merging never deletes provenance or raw source records.

For Bengaluru launch, recommended source priority is:

1. Direct organizer and venue submissions.
2. Manual operations and curated partnerships.
3. Licensed/provider feeds after coverage testing.
4. Public government/community datasets.
5. Compliant crawlers only after written legal/terms review.

Do not make launch inventory dependent on Eventbrite/Meetup/Ticketmaster availability.

## 10. Realtime Architecture

Realtime MVP:

- Event-detail Energy updates through SSE.
- New Moment notification while viewing that event.
- Approximate active-attendance count.
- Friend arrival only when privacy settings permit.
- Push notification when the app is backgrounded.

Not realtime:

- General map results.
- Search.
- Saved/interested state across unrelated devices.
- Recommendations.
- Most profile statistics.

The city map refreshes after camera-idle with cached REST requests, plus a modest periodic refresh. This reduces battery use and protects the backend from permanent fan-out.

WebSockets become appropriate when bidirectional event chat is introduced.

### Live Energy v1

Start with an explainable, versioned algorithm:

```text
base_activity =
  active verified attendance sessions
  ÷
  max(expected attendance, configured venue baseline)

energy =
  bounded 0–100 score
  smoothed over a rolling window
  decayed when verified heartbeats stop
```

Use thresholds for low, medium, high, and very high visual treatment. Keep algorithm version and contributing counts in `event_energy_snapshots`.

Moment velocity and engagement should not affect v1 until abuse controls and real telemetry exist. The Energy module exposes an interface so later scoring models can replace the formula without changing clients.

## 11. Media Architecture

### Photos

1. Client asks API for an upload intent.
2. API verifies attendance and issues a short-lived signed R2 upload.
3. Client compresses locally and uploads directly.
4. Client finalizes the media record.
5. Worker verifies object size, declared type, magic bytes, and dimensions.
6. Worker strips unsafe metadata, creates thumbnails/variants, and invokes moderation hooks.
7. Only approved variants become deliverable.
8. Originals remain private.

### Video

1. Backend creates a one-time Cloudflare Stream direct-upload URL.
2. Client uses resumable upload for unreliable networks.
3. Stream transcodes to adaptive playback.
4. Webhook updates processing status.
5. Moderation gates visibility.
6. Signed playback prevents arbitrary public enumeration.

Moment publication and media upload are separate state machines. An uploaded object does not become a visible Moment automatically.

Deletion must invalidate delivery, remove derivatives, and enqueue provider deletion. CDN TTLs should remain short for moderated content.

## 12. Security & Privacy

| Threat | Primary mitigation |
|---|---|
| OTP abuse | Per-IP/device/account rate limits, CAPTCHA/risk challenge, daily budgets, provider alerts. |
| Fake GPS | Multiple samples, server-side PostGIS, accuracy checks, mock flag, integrity token, movement plausibility, short sessions. |
| Replay | Nonces, short expiry, request-binding hash, idempotency keys, one-time capture authorization. |
| Modified clients | App Check, Play Integrity, App Attest, tiered enforcement. |
| IDOR/broken authorization | Resource-scoped server policies and tests; never authorize from request ownership claims alone. |
| Exact-location leakage | Semantic presence, restrictive defaults, response DTOs that omit coordinates. |
| Presigned upload abuse | Short expiry, scoped object key, content-length limit, finalization validation, quotas. |
| Malicious media | Magic-byte verification, decoders in isolated workers, metadata stripping, moderation quarantine. |
| Spam/fake organizers | Account age/risk limits, organizer verification, review states, audit trail. |
| Scraping | Per-token/IP limits, viewport caps, pagination, anomaly monitoring. |
| Notification abuse | Preference checks, dedupe keys, quiet hours, campaign caps. |
| SQL injection | Parameterized ORM/query-builder operations and reviewed raw spatial SQL. |
| Admin XSS | Sanitized text, strict CSP, no unsafe HTML rendering. |
| Token theft | Secure OS storage, TLS, short backend sessions, rotation and revocation. |

Camera and microphone are requested only when the user opens capture. Photo-library access uses system pickers. Notification permission is requested after explaining a concrete benefit. Location browsing works with manually selected city when denied.

## 13. Estimated MVP Infrastructure Cost

These are planning ranges as of September 2026, excluding salaries, taxes, legal work, and paid event-content licences.

Assumptions:

- 10,000 or 100,000 monthly users.
- Short videos, limited autoplay.
- One production and a smaller non-production environment.
- Mapbox mobile MAU roughly tracks app MAU.
- Normal startup traffic rather than constant viral peaks.

| Area | Around 10k MAU | Around 100k MAU | Main scaler |
|---|---:|---:|---|
| Mapbox | $0 | ~$300 | Map-viewing MAU |
| Supabase/Postgres | $25–100 | $150–600 | compute, storage, replicas |
| Cloud Run API/workers | $20–120 | $150–700 | request CPU and active workers |
| R2 photos/CDN | $0–20 | $20–150 | retained GB and operations |
| Cloudflare Stream | $20–250 | $250–2,000+ | stored/delivered video minutes |
| Firebase Auth | $0–300 | $100–1,500+ | phone SMS sends |
| FCM/APNs | $0 | $0 | no direct FCM charge |
| Geocoding | $0–50 | $50–300 | new venue/address requests |
| Monitoring/analytics | $0–100 | $100–600 | event volume and retention |
| Domains/email/misc. | $20–100 | $50–250 | operational usage |
| **Indicative total** | **$85–940/month** | **$1,020–6,400/month** | mostly video, OTP, DB |

Cost controls:

- Default to photo Moments; place strict duration and daily limits on video.
- Use Google/Apple sign-in before phone OTP where acceptable.
- Geocode canonical venues once and cache the result.
- Configure provider budget alerts and hard quotas.
- Retain raw location samples briefly.
- Avoid Redis, Elasticsearch, and Kubernetes initially.
- Do not preload video in off-screen Moments.

Event-data partnerships may cost more than the whole technical stack and require separate commercial validation.

## 14. Repository Structure

A monorepo is recommended:

```text
happyn/
├── apps/
│   ├── mobile/                 # Flutter
│   ├── api/                    # NestJS modular monolith
│   ├── admin/                  # Next.js operations app
│   └── workers/                # NestJS worker entry points
├── packages/
│   ├── contracts/              # OpenAPI-generated clients/types
│   ├── config/                 # Shared typed configuration
│   ├── observability/
│   ├── testing/
│   └── design-tokens/
├── infrastructure/
│   ├── docker/
│   ├── cloud-run/
│   └── monitoring/
├── docs/
│   ├── product.md
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── geofence.md
│   ├── event-ingestion.md
│   ├── security.md
│   ├── deployment.md
│   └── decisions/
├── tooling/
├── .github/workflows/
├── docker-compose.yml
├── .env.example
└── README.md
```

Use a workspace manager such as pnpm for TypeScript applications. Flutter remains a normal Dart project inside the same repository. OpenAPI generation is the contract bridge; do not attempt to share runtime TypeScript models with Dart.

## 15. Implementation Phases

| Phase | Deliverables | Dependencies | Critical tests / definition of done |
|---|---|---|---|
| 1. Foundation | Monorepo, local PostGIS, configuration, CI, linting, logging, ADRs | Architecture approval | Clean checkout boots locally; CI passes; no secrets committed. |
| 2. Auth + Profile | Firebase identity validation, users, profiles, privacy defaults | Firebase projects | Login/logout/token tests; unauthorized API calls rejected. |
| 3. Events + Geo | Cities, venues, events, occurrences, nearby/viewport API, seed Bengaluru data | PostGIS, geocoder choice | Radius, viewport, time-zone, index-plan and pagination tests pass. |
| 4. Living Map | Mapbox integration, styles, clusters, symbols, filters, event detail | Mapbox account/design tokens | Tested on representative low/mid/high devices with performance budget. |
| 5. Social Graph | Requests, friends, blocks, interested/going, semantic presence policy | Auth/profile | Privacy and blocked-user authorization matrix passes. |
| 6. Attendance Verification | Challenges, samples, risk evaluation, sessions, heartbeat/expiry | Integrity-provider setup | Replay, stale location, drift, mock, impossible jump and expiry tests pass. |
| 7. Moments | Camera, photo/video upload, media processing, moderation state | R2/Stream | Only valid attendance can publish; failed/resumed uploads recover. |
| 8. Realtime + Energy | Versioned Energy calculation, SSE, map refresh policy | Attendance/Moments | Load, reconnect, authorization, decay and idempotency tests pass. |
| 9. Notifications | Tokens, preferences, deep links, reminders, arrival alerts | FCM/APNs | Multi-device, dedupe, retry, revoked-token and privacy tests pass. |
| 10. Event Ingestion | Adapter framework, raw records, normalization, geocoding, dedupe queue | First approved sources | Reprocessing is idempotent; provenance survives merge. |
| 11. Admin + Moderation | Event editing, merge review, reports, removal, suspensions, audit log | All content domains | Role and audit tests; removed media no longer publicly resolves. |
| 12. Hardening + Release | Threat review, load tests, accessibility, store privacy declarations, backups, runbooks | Completed product | Release builds pass; restore drill succeeds; staged rollout checklist approved. |

Each phase ends with the requested Completed / Files Changed / Database Changes / API Changes / Tests / Verification / Decisions / Risks / Next Phase checkpoint.

## 16. Decisions I Need To Approve

| Decision | Recommendation | Main alternative | Why |
|---|---|---|---|
| Mobile | Flutter | React Native | Strong custom UI and one mobile codebase. |
| State | Riverpod | Bloc | Better fit for async, testable feature state with less ceremony. |
| Backend | NestJS modular monolith | FastAPI | Shared TypeScript ecosystem and clear modules. |
| API | REST + OpenAPI | GraphQL | Simpler caching, authorization, and mobile debugging. |
| Database | Supabase Postgres/PostGIS Mumbai | Cloud SQL/RDS | Faster startup and lower baseline operations. |
| Map | Mapbox | Google Maps / MapLibre | Best balance for Happyn's custom living-map identity. |
| Event Worlds | Native style layers and sprites | Flutter overlays / full 3D | Performance and battery safety. |
| Social | Mutual friends for MVP | Following/hybrid | Reciprocal consent for presence-sensitive features. |
| Location | Foreground only in MVP | Background geofencing | Better privacy, battery life, and store-policy posture. |
| Realtime | Map polling + event SSE | WebSockets everywhere | Matches actual update needs. |
| Cache | None initially | Redis | Add only after measured need. |
| Queue | pg-boss | BullMQ / SQS | One fewer service while preserving durable jobs. |
| Photos | Cloudflare R2 | S3 / Supabase Storage | Low storage price and no internet egress charge. |
| Video | Cloudflare Stream | Self-hosted FFmpeg | Direct uploads, encoding, and delivery without a video platform team. |
| Auth | Firebase Auth | Supabase Auth | Strong Flutter/mobile providers, FCM, and App Check alignment. |
| Hosting | Cloud Run Mumbai | Fly.io / Kubernetes | Managed scaling, workers/jobs, and India region. |
| Admin | Next.js | Low-code tool | Geo, merge, and moderation workflows require flexibility. |
| Search | PostgreSQL FTS + trigram | OpenSearch | Sufficient for MVP without a new cluster. |

## 17. Things Needed From Me

Do not send credentials through chat. Eventually place local secrets in ignored `.env` files and hosted secrets in the provider secret manager.

### NEEDED NOW

- [ ] Confirm the architecture decisions above.
- [ ] Confirm Flutter as the mobile framework.
- [ ] Confirm Mapbox despite Google Maps' lower India price.
- [ ] Confirm mutual friendship for MVP.
- [ ] Confirm foreground-only location for MVP.
- [ ] Confirm Firebase authentication providers for launch.
- [ ] Clarify the unfinished sentence in your message if it adds a feature not covered by the brief.
- [ ] Identify the initial founder/developer team and expected release target.
- [ ] Confirm whether short video is mandatory for first public release or can follow photos.

### NEEDED LATER

- [ ] Apple Developer Program account.
- [ ] Google Play Console account.
- [ ] Firebase development, staging, and production projects.
- [ ] Mapbox account and restricted tokens.
- [ ] Supabase projects in Mumbai.
- [ ] Google Cloud billing/project for Cloud Run and geocoding.
- [ ] Cloudflare account for R2 and Stream.
- [ ] Domain and transactional email provider.
- [ ] Event-provider or organizer agreements.
- [ ] Privacy policy, terms, moderation policy, and data-retention decisions.
- [ ] APNs keys configured through Firebase.
- [ ] Sentry/monitoring project.
- [ ] Store listing, privacy labels, and data-safety declarations.

### OPTIONAL

- [ ] Figma exports or a complete Stitch screen inventory.
- [ ] Brand assets, fonts, icon licence, motion guidelines.
- [ ] Google Maps prototype for a visual/cost comparison.
- [ ] Ticket affiliate agreements.
- [ ] Venue partners for QR/BLE verification pilots.
- [ ] Analytics warehouse and BI tooling.
- [ ] Dedicated legal review of event-source agreements and location privacy.

## 18. Recommendation

**RECOMMENDED ARCHITECTURE**

Build Happyn as a Flutter application backed by a NestJS TypeScript modular monolith, with PostgreSQL/PostGIS as the authoritative datastore. Use Mapbox for the living-city map; Riverpod and feature-oriented MVVM in Flutter; REST/OpenAPI for normal operations; polling plus scoped SSE for live state; pg-boss for initial background work; Firebase Auth, App Check, FCM, Play Integrity, and App Attest for identity and risk signals; Cloudflare R2 for photos; Cloudflare Stream for video; Next.js for administration; and Cloud Run plus Supabase in Mumbai.

Keep location foreground-only in MVP. Use reciprocal friendships, semantic presence, short-lived server-issued attendance sessions, and risk-based verification. Build Event Worlds from performant map-native layers and sprites before considering real 3D models. Treat event ingestion and operations as a core product system.

**APPROVAL REQUIRED**

No implementation should begin until you approve this architecture or specify the decisions you want changed.
