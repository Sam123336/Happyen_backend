# Geofence and attendance verification

Attendance verification is server-authoritative and risk-based. The MVP will use foreground location only, short-lived server challenges, several timestamped samples, PostGIS distance checks, device/app integrity signals, movement plausibility, and expiring attendance sessions.

No implementation exists in Phase 1. Exact raw-sample retention, venue radii, accuracy thresholds, and enforcement tiers must be decided and tested during Phase 6.
