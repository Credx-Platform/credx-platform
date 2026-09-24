# Billing Ops Runbook

This is an operator runbook for the provider-neutral billing state already stored in CredX. It does not replace the payment processor dashboard and does not authorize refunds, cancellations, collections messages, or retries by itself.

## Daily Review

1. Open the staff API snapshot at `GET /api/billing/admin/aging`.
2. Review `invoices.buckets` first:
   - `current`: open invoices not yet past due.
   - `1_7`, `8_30`, `31_60`, `61_plus`: past-due aging.
   - `no_due_date`: needs cleanup before dunning.
   - `not_open`: should not appear in the open-invoice query.
3. Check `subscriptions.atRiskCount` for `PAST_DUE`, `UNPAID`, `PAUSED`, `INCOMPLETE`, and `INCOMPLETE_EXPIRED` records.
4. Check `payments.unresolvedCount` for pending or failed local payment records.
5. Check `webhookLedger.requiresReconciliationCount`; reconcile those rows against the provider dashboard before replaying anything.

## Dunning Guardrails

- Do not send dunning notices from CredX until the matching invoice/subscription is verified in the provider dashboard.
- Do not revoke access from a local row alone if the provider dashboard shows the account is paid or in a grace period.
- Do not retry, refund, cancel, or mark a charge disputed from this snapshot. Use the processor workflow and then let webhooks or the secured confirmation endpoint reconcile CredX.
- Preserve CROA timing and written authorization records for credit-repair services; education-only purchases are separate from repair service billing.

## Reconciliation Checklist

For each exception, capture:

- client id and email
- provider and provider invoice/subscription/payment id
- local status and provider status
- amount, currency, due date, and paid date
- operator decision and timestamp
- whether a webhook replay, manual confirmation, refund, or customer message was performed

## Queue/Worker Cleanup

The queue runner now removes stale worker heartbeat rows after the configured retention window. This only cleans retired worker metadata; it does not delete jobs. Use `/health/queue` or `/api/monitoring/queues` to confirm backlog and worker liveness after deployments.
