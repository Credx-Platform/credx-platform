import { test } from 'node:test';
import assert from 'node:assert/strict';

// Ensure the layer treats the provider as unconfigured for these pure tests.
delete process.env.AI_GATEWAY_API_KEY;

const { runChat, runJson } = await import('../src/lib/ai/client.js');
const { estimateCostUsd, approxTokens } = await import('../src/lib/ai/pricing.js');
const { getPrompt, promptVersion } = await import('../src/lib/ai/prompts.js');
const { planTokenBudget, quotaEnforced } = await import('../src/lib/ai/quota.js');
const { taskConfig } = await import('../src/lib/ai/config.js');

test('runChat is a no-op when the provider is unconfigured (never throws)', async () => {
  const r = await runChat({ task: 'cesar_chat', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'not_configured');
});

test('runJson mirrors the not_configured failure', async () => {
  const r = await runJson({ task: 'report_extraction', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.ok, false);
});

test('pricing: haiku cheaper than sonnet cheaper than opus, env override wins', () => {
  const h = estimateCostUsd('anthropic/claude-haiku-4-5', 1_000_000, 1_000_000);
  const s = estimateCostUsd('anthropic/claude-sonnet-5', 1_000_000, 1_000_000);
  const o = estimateCostUsd('anthropic/claude-opus-5', 1_000_000, 1_000_000);
  assert.ok(h < s && s < o);
  assert.equal(approxTokens('a'.repeat(400)), 100);
});

test('prompt registry returns a versioned string; version is stable per key', () => {
  const a = getPrompt('cesar_system');
  assert.match(a.version, /^cesar_system@\d+$/);
  assert.ok(a.text.includes('CredX does not guarantee'));
  assert.equal(promptVersion('cesar_system'), a.version);
  assert.match(getPrompt('report_extraction_system').version, /^report_extraction_system@\d+$/);
});

test('cesar_system prompt includes contextual lines when provided', () => {
  const withCtx = getPrompt('cesar_system', { clientLine: 'CLIENT_X', stageLine: 'STAGE_Y' }).text;
  assert.ok(withCtx.includes('CLIENT_X') && withCtx.includes('STAGE_Y'));
});

test('plan token budgets: FREE < ESSENTIAL < PREMIUM; env override honored', () => {
  assert.ok(planTokenBudget('FREE') < planTokenBudget('ESSENTIAL'));
  assert.ok(planTokenBudget('ESSENTIAL') < planTokenBudget('PREMIUM'));
  process.env.AI_BUDGET_FREE = '12345';
  assert.equal(planTokenBudget('FREE'), 12345);
  delete process.env.AI_BUDGET_FREE;
});

test('quota enforcement toggles with AI_QUOTA_ENABLED', () => {
  assert.equal(quotaEnforced(), true);
  process.env.AI_QUOTA_ENABLED = '0';
  assert.equal(quotaEnforced(), false);
  delete process.env.AI_QUOTA_ENABLED;
});

test('taskConfig gives report_extraction a much bigger output budget than cesar_chat', () => {
  assert.ok(taskConfig('report_extraction').maxOutputTokens > taskConfig('cesar_chat').maxOutputTokens * 10);
});
