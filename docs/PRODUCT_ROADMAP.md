# CredX Product Roadmap

## Phase 0 - Infrastructure & Reliability

- Completed: repo architecture audit started.
- Completed: hardcoded database URL removed from local smoke-test helpers.
- Completed: health checks moved outside global rate limiter.
- Completed: `/health/db` added for database dependency checks.
- Planned: verify Railway service configuration with Railway CLI before deploy decisions.
- Planned: document backup and rollback owner.
- Planned: add monitoring provider.

## Phase 1 - SaaS Foundation

- In Progress: product-first positioning.
- In Progress: central plan and entitlement definitions now exist in code for paid/product access tiers; persistent subscription models are still planned.
- Planned: product page and product-first navigation.
- Planned: SaaS onboarding path from account to readiness score to action plan.

## Phase 2 - Intelligence Engine

- In Progress: credit-report analysis foundation exists.
- Completed: proprietary CredX Readiness Score engine has authenticated API endpoints, focused tests, and a dedicated persisted snapshot history model.
- In Progress: deeper next-best-action mapping.

## Phase 3 - Engagement

- In Progress: masterclass progress tracking exists.
- Planned: weekly check-ins.
- Planned: in-app notifications.
- Planned: learning progress tied to dashboard recommendations.

## Phase 4 - Professional Platform

- In Progress: sub-agent referral foundation exists.
- Planned: organizations, roles, assigned clients, tenant isolation tests.

## Phase 5 - Integrations & API

- In Progress: payment, email, AI, blob, Lob, Turnstile integrations exist.
- Planned: webhook event table, retries, outbound webhook signing.
- Planned: internal API versioning and rate-limit policy.

## Phase 6 - Enterprise / White Label

- Planned: organization branding config.
- Planned: partner dashboards.
- Planned: organization-level usage limits.
