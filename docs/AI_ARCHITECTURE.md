# AI Architecture

## CURRENT

CredX has two AI-related paths:

- `apps/api/src/lib/aiGateway.ts`: Vercel AI Gateway wrapper.
- `apps/api/src/routes/responseIngest.ts`: direct Anthropic vision/message route for dispute-response ingestion.
- `apps/api/src/routes/cesar.ts`: Cesar assistant with rule-based responses and optional LLM behavior.

## CURRENT STRENGTHS

- Cesar has guardrails against guarantees and legal-advice framing.
- AI Gateway wrapper has timeout support.
- Cesar can fall back to rule-based replies when LLM is disabled or unavailable.

## GAPS

- No persisted AI usage ledger.
- No per-plan AI entitlement or quota service.
- No central prompt-version registry.
- No job queue for expensive AI work.
- Direct provider-specific calls still exist outside a single AI layer.

## PROVIDER EVALUATION CHECKLIST

Before adding or switching any production AI provider for CredX, compare:

- Data retention controls for credit-report text, client notes, identity-adjacent data, and dispute-support materials.
- Timeout behavior and fallback handling so Cesar, portal pages, and staff workflows degrade gracefully.
- Cost per workflow for report extraction, long-document review, onboarding summaries, and internal owner reports.
- Context-window fit for long credit reports, policy/SOP search, and multi-step client histories.
- Structured-output reliability for findings, action items, and compliance review flags.
- Logging controls that avoid sending SSNs, full account numbers, uploaded documents, or unnecessary financial details to vendor logs.
- Tool/agent permission controls for draft-only, internal-summary, human-approved, and no-autonomous-access workflows.

Current note: larger-context models and managed-agent features may be useful for future CredX operating-system work, but they should remain vendor-evaluation inputs until security, privacy, cost, and compliance boundaries are verified.

## TARGET

CredX App -> CredX AI Layer -> configured provider

The AI layer should enforce:

- provider selection
- timeouts
- retry boundaries
- token limits
- user/plan quotas
- cost logging
- structured outputs
- prompt-injection defenses
- graceful failure messages
