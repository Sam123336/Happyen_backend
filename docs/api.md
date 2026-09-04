# API

The public application API is versioned beneath `/v1` and will publish OpenAPI.

- `GET /v1/health/live` — confirms that the API process can serve requests.
- `GET /v1/health/ready` — confirms that the API can reach PostgreSQL.
- `POST /v1/auth/session` — validates a Firebase ID token and idempotently provisions the Happyn account.
- `GET /v1/me/profile` — returns the authenticated account, profile, and privacy defaults.
- `PATCH /v1/me/profile` — updates `displayName`, `username`, and/or `bio`.
- `PATCH /v1/me/privacy` — updates explicit `profileVisibility`, `presenceVisibility`, and/or `momentsVisibility` audiences.

Authenticated endpoints require `Authorization: Bearer <Firebase ID token>`. Calling `POST /auth/session` is the bridge between a valid external identity and an internal user. Other protected endpoints reject identities that are not provisioned or whose internal account is suspended/deleted.

A liveness check does not fail solely because an external dependency is temporarily unavailable. API errors use a stable machine-readable `code` and a human-readable `message`; validation errors also include structured `details`.
