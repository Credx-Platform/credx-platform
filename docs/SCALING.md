# Scaling

## Early Stage

- Separate Railway web and API services.
- PostgreSQL with verified backups.
- Health checks for web/API/database.
- Centralized env vars and provider configuration.
- Add monitoring before heavy traffic.
- Add queue/worker only for real expensive workflows.

## Growth Stage

- Multiple web/API replicas if traffic requires.
- PgBouncer or provider pooler after ORM compatibility review.
- Redis-backed queue for AI, email, reports, notifications, and webhook retries.
- Worker service with bounded retries, timeouts, and dead-letter handling.
- Product analytics with PII controls.
- Pagination and indexes for admin/client list views.

## Larger B2B Scale

- Organization ownership on every tenant-bound object.
- Dedicated workers for reports/AI.
- Organization-level limits and entitlements.
- Dedicated monitoring dashboards.
- Restore drills and incident response exercises.

## Avoid

Do not add Kubernetes, Kafka, a service mesh, or multiple databases without real scale pressure.
