# API scaffold routes

- GET `/health`
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/leads`
- GET `/api/clients/me`
- POST `/api/clients/onboarding`
- GET `/api/clients` (staff/admin)
- GET `/api/progress/readiness`
- POST `/api/progress/readiness/snapshot`

Readiness endpoints return the proprietary, non-FICO CredX Readiness Score. `POST /api/progress/readiness/snapshot` persists a point-in-time snapshot for authenticated client history.
- POST `/api/disputes` (staff/admin)
- GET `/api/billing/plans`
- GET `/api/billing/admin/aging` (staff/admin)
