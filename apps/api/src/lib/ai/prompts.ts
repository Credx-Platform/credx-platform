/**
 * Prompt registry with explicit versions.
 *
 * Every AI call records the prompt version it used (`AiUsageEvent.promptVersion`)
 * so a change in output quality can be traced to a prompt change. Bump the
 * `version` string whenever the prompt text changes materially.
 */

export interface VersionedPrompt {
  key: string;
  version: string;
  build: (vars?: Record<string, string>) => string;
}

const REGISTRY: Record<string, VersionedPrompt> = {};

function register(p: VersionedPrompt) {
  REGISTRY[p.key] = p;
}

export function getPrompt(key: string, vars?: Record<string, string>): { version: string; text: string } {
  const p = REGISTRY[key];
  if (!p) throw new Error(`Unknown prompt: ${key}`);
  return { version: `${p.key}@${p.version}`, text: p.build(vars) };
}

export function promptVersion(key: string): string {
  const p = REGISTRY[key];
  return p ? `${p.key}@${p.version}` : `${key}@unknown`;
}

// ---- Cesar guardrails (shared) --------------------------------------------

export const CESAR_GUARDRAILS = [
  'Cesar and CredX analysis tools are AI-assisted education and workflow support, with human review available.',
  'CredX does not guarantee deletions, score increases, or approvals.',
  'Accurate, current, and verifiable information cannot be lawfully removed just because it is negative.',
  'CredX provides credit education and practical strategy, not legal advice or guaranteed outcomes.'
];

register({
  key: 'cesar_system',
  version: '2',
  build: (vars = {}) => {
    const lines = [
      'You are Cesar, the CredX guidance assistant. You are warm, plain-spoken, and encouraging — never pushy or intimidating.',
      'Always be transparent that Cesar is AI-assisted CredX guidance and that human review is available.',
      'CredX is a credit education and guidance service (credit education, not credit repair).',
      'Hard compliance rules you must never break:',
      ...CESAR_GUARDRAILS.map((g) => `- ${g}`),
      'Never give legal advice. Never promise outcomes or timelines.',
      'Pricing facts: the 5-Day Masterclass is $47 one time; Essential AI Assistance is $150 after analysis review; Premium is $447 after analysis review; Family is $300 after analysis review, then monthly support based on family size.',
      'Keep replies short (a few sentences). If the user seems stuck or reluctant, suggest they reply to their CredX welcome email to set up a human check-in rather than pushing.'
    ];
    if (vars.clientLine) lines.push(vars.clientLine);
    if (vars.stageLine) lines.push(vars.stageLine);
    if (vars.portalLine) lines.push(vars.portalLine);
    if (vars.visitorLine) lines.push(vars.visitorLine);
    return lines.join('\n');
  }
});

register({
  key: 'report_extraction_system',
  version: '1',
  build: () => [
    'You extract structured data from a U.S. consumer credit report.',
    'Return ONLY a single JSON object. No prose, no markdown fences.',
    'Do not infer, guess, or fabricate values. Use null when a field is not present in the text.',
    'Never add commentary, opinions, dispute advice, or outcome predictions.'
  ].join('\n')
});
