# Credit Repair SaaS Compatibility Checklist

Use this as the CredX upgrade tracker for making the platform portable across credit repair SaaS tools, CRMs, automation platforms, and future direct integrations.

## 1. Standardize Lead And Client Fields

- [x] Define one SaaS-ready field shape for raw leads and registered clients.
- [x] Normalize lead source, referral detail, selected offer, onboarding step, payment status, service tier, documents, disputes, and timestamps.
- [x] Add authenticated API output for the normalized records.
- [x] Add admin portal export buttons for staff.
- [ ] Backfill missing source details where legacy records are incomplete.
- [ ] Add automated tests around source/status/payment mapping.

## 2. Build Clean Import And Export

- [x] Add JSON export foundation for lead/client records.
- [x] Add CSV export foundation for lead/client records.
- [ ] Add dispute item CSV export.
- [ ] Add document inventory CSV export.
- [ ] Add payments CSV export.
- [ ] Add notes/activity CSV export.
- [ ] Add one-click full client export package.

## 3. Add Webhook Events

- [ ] Define event names: `new_lead`, `signup_started`, `onboarding_completed`, `analysis_ready`, `pending_payment`, `payment_received`, `client_activated`, `document_uploaded`, `dispute_round_started`.
- [ ] Add webhook delivery settings in admin config.
- [ ] Add signing secret support for outbound webhooks.
- [ ] Add retry and failure logging.
- [ ] Add Zapier/Make-friendly payload examples.

## 4. Preserve Source Attribution

- [x] Store referral source and detail on signup/onboarding.
- [x] Display source bubbles in the admin lead pipeline.
- [ ] Capture UTM parameters on landing pages.
- [ ] Persist UTM source, medium, campaign, content, and term.
- [ ] Add source reporting by lead, signup, pending payment, and paid conversion.

## 5. Align Status Stages

- [x] Use a pre-payment lead pipeline: Lead -> Contract Sent -> Intake Received -> Analysis Ready -> Pending Payment -> Active.
- [x] Treat `UPGRADE_OFFERED` as Pending Payment in admin-facing compatibility views.
- [ ] Add a dedicated public status label helper across web/API.
- [ ] Add conversion metrics for each status stage.
- [ ] Add stale-stage follow-up reminders.

## 6. Make Documents Portable

- [ ] Standardize document type names.
- [ ] Add export-safe filenames: client, document type, bureau, date.
- [ ] Add signed URL export for private stored documents.
- [ ] Add document manifest CSV.
- [ ] Add client authorization, agreement, cancellation notice, ID, proof of address, credit report, dispute letters, and responses to export packages.

## 7. Add API-Ready Admin Controls

- [ ] Add admin action: export client.
- [ ] Add admin action: export all leads.
- [ ] Add admin action: sync lead/client to external system.
- [ ] Add admin action: resend onboarding link.
- [ ] Add admin action: mark paid and activate.
- [ ] Add admin action: generate dispute packet.

## 8. Compliance And Security

- [x] Keep staff/admin auth around compatibility data.
- [ ] Add audit logging for exports.
- [ ] Add export reason field for staff.
- [ ] Add role-based export permissions.
- [ ] Review PII exposure before enabling third-party sync.
- [ ] Store e-sign consent, client authorization, cancellation notice, and payment authorization in exportable form.

## Current API Endpoints

- `GET /api/compatibility/fields`
- `GET /api/compatibility/lead-client-records`
- `GET /api/compatibility/lead-client-records?format=csv`
