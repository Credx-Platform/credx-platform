# Deployment

## CURRENT

CredX is configured for Railway deployment.

- Web: `railway.web.json`, start `npm run start:web`, health `/`.
- API: `railway.api.json`, start `npm run start:api`, health `/health`.
- Current `railway.json`: web-shaped manifest.

## SAFETY RULE

Before deploying API changes, make sure the active Railway manifest is API-shaped:

- build command: `npm install --include=dev && npm run build:api`
- start command: `npm run start:api`
- health check: `/health`

Before deploying web changes, make sure the active manifest is web-shaped:

- build command: `npm install --include=dev && npm run build:web`
- start command: `npm run start:web`
- health check: `/`

## VERIFICATION

Run locally before deployment:

- `npm run build:api`
- `npm run build:web`

Production verification after owner-approved deploy:

- check Railway deployment status
- `GET https://credxapi-production.up.railway.app/health`
- verify `https://www.credxme.com/`
- smoke test signup, login, dashboard, and payment-critical flows

## ROLLBACK

Use Railway deployment rollback/redeploy of last healthy deployment. Exact operational owner and retention policy still need confirmation.
