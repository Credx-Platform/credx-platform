# Incident Response

## CURRENT

There is no complete incident-response runbook in the repository.

## SEVERITY

- Critical: production outage, data exposure, payment processing failure, auth bypass.
- High: major feature outage, broken signup/login, document access failure.
- Medium: degraded AI/email/report flow with core app still online.
- Low: cosmetic or content issue without customer-data risk.

## FIRST ACTIONS

1. Confirm whether web, API, database, payment, email, AI, or storage is affected.
2. Check Railway deployment and service logs.
3. Check `/health` and `/health/db`.
4. Stop new deployments until the failure mode is understood.
5. Preserve logs and timestamps.
6. Roll back to last healthy deployment if the incident follows a deploy.

## DATA OR SECRET EXPOSURE

1. Remove the exposure from code/files.
2. Rotate affected credential with the provider.
3. Review logs, Git history, and deployment artifacts.
4. Document scope and required notifications with counsel.

## CUSTOMER COMMUNICATION

Do not speculate. Communicate verified impact, what remains available, and next update timing.
