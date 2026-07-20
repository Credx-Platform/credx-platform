import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { callAiGatewayChat, isAiGatewayConfigured, type AiChatMessage } from '../lib/aiGateway.js';

export const cesarRouter = Router();

// CredX compliance guardrails. Cesar is "credit education / guidance", never a
// guarantee machine — this copy is the non-negotiable spine of every reply and
// the system prompt for the LLM path.
const GUARDRAILS = [
  'CredX does not guarantee deletions, score increases, or approvals.',
  'Accurate, current, and verifiable information cannot be lawfully removed just because it is negative.',
  'CredX provides credit education and practical strategy, not legal advice or guaranteed outcomes.'
];

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// Rough HTML->text for the `reply` field. Good enough for a plaintext channel;
// strips tags and unescapes the handful of entities we emit.
function htmlToText(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const LINKS = {
  signup: '<a href="/signup">Sign Up</a>',
  masterclass: '<a href="/masterclass">5-Day Masterclass</a>',
  pricing: '<a href="/pricing">Pricing</a>',
  portal: '<a href="/portal">Portal Login</a>'
};

// ---------------------------------------------------------------------------
// Onboarding-stage awareness (authenticated portal users)
// ---------------------------------------------------------------------------

interface CesarContext {
  user: { id: string; firstName: string; lastName: string; role: string } | null;
  stage: OnboardingStep | null;
}

interface OnboardingStep {
  key: string;
  label: string;
  detail: string;
}

// Mirrors the portal wizard's stage gates in clientPortal.tsx: the wizard keys
// off progress.workflow.stage, then client.status once onboarding completes.
function nextOnboardingStep(client: {
  status: string;
  progress: { workflow: unknown; onboarding: unknown } | null;
} | null): OnboardingStep {
  const workflow = (client?.progress?.workflow ?? {}) as { stage?: string };
  const onboarding = (client?.progress?.onboarding ?? {}) as { status?: string; completedAt?: string | null };
  const stage = String(workflow.stage || 'signup_received');
  const onboardingDone = onboarding.status === 'completed' || Boolean(onboarding.completedAt);

  if (!onboardingDone) {
    if (['signup_received', 'contract_pending'].includes(stage)) {
      return {
        key: 'sign_contract',
        label: 'sign your CredX service agreement',
        detail: 'The agreement and required disclosures are shown right inside your portal before you sign — it only takes a minute.'
      };
    }
    if (['contract_signed', 'application_pending'].includes(stage)) {
      return {
        key: 'complete_profile',
        label: 'complete your intake profile',
        detail: 'I just need your date of birth, Social Security number, and full address so your file is ready for review. Everything is encrypted before it is saved.'
      };
    }
    if (stage === 'application_completed') {
      return {
        key: 'choose_monitoring',
        label: 'choose a credit monitoring source',
        detail: 'Pick a monitoring provider so we can see the same report you do — or skip it for now and add it later from the portal.'
      };
    }
    if (['portal_unlocked', 'upload_credit_report'].includes(stage)) {
      return {
        key: 'share_report',
        label: 'upload your latest credit report',
        detail: 'Upload the report you downloaded (PDF or HTML) and we can map out a practical strategy from what is actually on it.'
      };
    }
  }

  switch (client?.status) {
    case 'ANALYSIS_READY':
    case 'UPGRADE_OFFERED':
      return {
        key: 'review_analysis',
        label: 'review your credit analysis in the portal',
        detail: 'Your analysis is ready. Open the Analysis tab to walk through what we found and the recommended next steps.'
      };
    case 'ACTIVE':
      return {
        key: 'track_disputes',
        label: 'keep an eye on your dispute progress',
        detail: 'Your plan is in motion. Check the Disputes tab for round status, and upload any bureau response letters you receive in the mail.'
      };
    default:
      return {
        key: 'awaiting_review',
        label: 'sit tight while we review your file',
        detail: "You've finished the intake steps. Your file is in review — you'll get an email as soon as the next step is ready."
      };
  }
}

function greetingFor(user: CesarContext['user']): string {
  const first = user ? String(user.firstName || '').trim() : '';
  return first ? `Hi ${first}` : 'Hi there';
}

// ---------------------------------------------------------------------------
// Deterministic knowledge base (public + authenticated fallback)
// ---------------------------------------------------------------------------

interface CesarReply {
  source: string;
  html: string;
  reply: string;
  stage?: string;
}

function rulesReply(message: string, ctx: CesarContext): CesarReply {
  const text = String(message || '').toLowerCase().trim();

  // Authenticated portal users get stage-aware coaching first.
  if (ctx.user && ctx.stage) {
    const step = ctx.stage;
    if (!text || /help|next step|what.*do|what.*next|start|now/.test(text)) {
      const html =
        `${escapeHtml(greetingFor(ctx.user))}, welcome back to CredX. ` +
        `Your next step is to <strong>${escapeHtml(step.label)}</strong>.<br><br>` +
        `${escapeHtml(step.detail)}`;
      return { source: 'rules', stage: step.key, html, reply: htmlToText(html) };
    }
    if (/report|upload|equifax|experian|transunion|score/.test(text)) {
      const html =
        'When you\'re ready, upload your latest credit report (PDF or HTML) in the portal and it will be reviewed with you. ' +
        'No rush and nothing to be nervous about — we go through it together.';
      return { source: 'rules', stage: 'share_report', html, reply: htmlToText(html) };
    }
  }

  // Public / pre-sales guidance.
  if (!text) {
    return wrap('Ask me anything about the CredX program, the 5-Day Masterclass, disputes, financing readiness, or rebuilding your credit.');
  }
  if (/(portal|sign in|log ?in)/.test(text)) {
    return wrap(`If you already have portal access, sign in here: ${LINKS.portal}.<br><br>If you're new and want to get started first, use the sign-up page: ${LINKS.signup}.`);
  }
  if (/(get started|how to start|sign ?up|apply)/.test(text)) {
    return wrap(`Here's the fastest path:<br><br>• ${LINKS.signup}<br>• ${LINKS.masterclass} if you want the DIY education route<br>• ${LINKS.portal} if you already have an account.<br><br>Tell me whether you want DIY education or guided support and I'll point you to the best option.`);
  }
  if (/(help me|^help$|what can you help|how can you help)/.test(text)) {
    return wrap(`I can help you do one of three things right now:<br><br>1. ${LINKS.signup}<br>2. ${LINKS.masterclass}<br>3. ${LINKS.portal}<br><br>Tell me your goal — dispute inaccurate items, prepare for financing, or rebuild after collections — and I'll recommend the best path.`);
  }
  if (/(masterclass|diy)/.test(text)) {
    return wrap(`The 5-Day Masterclass is the DIY path inside CredX: credit fundamentals, disputes, rebuilding, business credit, and a bonus wealth day. Start here: ${LINKS.masterclass}.`);
  }
  if (/(program|coaching|service)/.test(text)) {
    return wrap(`The CredX Program is the guided path with software, AI support, and coaching. If you want hands-on structure and follow-through, start here: ${LINKS.signup}.`);
  }
  if (/(financing|mortgage|car|approval)/.test(text)) {
    return wrap(`If your goal is financing readiness, the best move is the guided program so your file can be reviewed in context. Start here: ${LINKS.signup}.`);
  }
  if (/(dispute|collection|inquiry)/.test(text)) {
    return wrap(`CredX helps organize dispute workflow and identify what looks inaccurate or challengeable, but the strongest next step is getting your file into review. Start here: ${LINKS.signup}.`);
  }
  if (/(price|cost|pricing)/.test(text)) {
    return wrap(`You can see how CredX is priced here: ${LINKS.pricing}.<br><br>Want support? Choose the Program via ${LINKS.signup}. Want DIY education? Choose the ${LINKS.masterclass}.`);
  }
  return wrap(`I can help you choose the fastest path:<br><br>• ${LINKS.signup}<br>• ${LINKS.masterclass}<br>• ${LINKS.portal}<br><br>Tell me your goal and I'll point you to the best one.`);

  function wrap(html: string): CesarReply {
    return { source: 'rules', html, reply: htmlToText(html) };
  }
}

// ---------------------------------------------------------------------------
// LLM path (authenticated users only — anonymous visitors never trigger a
// paid model call). Enabled by default when the AI Gateway key is present;
// set CESAR_LLM_ENABLED=0 to force the deterministic replies.
// ---------------------------------------------------------------------------

function llmEnabled(): boolean {
  if (/^(0|false|no|off)$/i.test(String(process.env.CESAR_LLM_ENABLED || ''))) return false;
  return isAiGatewayConfigured();
}

function buildSystemPrompt(ctx: CesarContext): string {
  const lines = [
    'You are Cesar, the CredX guidance assistant. You are warm, plain-spoken, and encouraging — never pushy or intimidating.',
    'CredX is a credit education and guidance service (credit education, not credit repair).',
    'Hard compliance rules you must never break:',
    ...GUARDRAILS.map((g) => `- ${g}`),
    'Never give legal advice. Never promise outcomes or timelines.',
    'Keep replies short (a few sentences). If the user seems stuck or reluctant, suggest they reply to their CredX welcome email to set up a human check-in rather than pushing.'
  ];
  if (ctx.user && ctx.stage) {
    lines.push(
      `The signed-in client is ${[ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(' ') || 'a CredX client'}.`,
      `Their next onboarding step is: ${ctx.stage.label}. Gently guide them toward it. Context: ${ctx.stage.detail}`,
      'Portal tabs they can use: Progress, Analysis, Disputes, Documents, Profile.'
    );
  } else {
    lines.push('This is a public visitor who has not signed up yet. Guide them toward /signup (guided program), /masterclass (DIY education), /pricing, or /portal to log in.');
  }
  return lines.join('\n');
}

const historySchema = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000)
})).max(12);

const chatSchema = z.object({
  message: z.string().max(2000).optional().default(''),
  history: historySchema.optional().default([])
});

async function llmReply(message: string, history: z.infer<typeof historySchema>, ctx: CesarContext): Promise<CesarReply | null> {
  const messages: AiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];
  const result = await callAiGatewayChat({
    messages,
    model: process.env.CESAR_LLM_MODEL?.trim() || undefined,
    maxTokens: 400,
    temperature: 0.6,
    timeoutMs: Number(process.env.CESAR_LLM_TIMEOUT_MS || 12_000)
  });
  if (!result) return null;
  // LLM output is untrusted; never return it as raw HTML — escape it.
  return { source: 'llm', reply: result.text, html: textToHtml(result.text) };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

// Optional auth: a valid Bearer token personalizes Cesar; without one he still
// works as the public pre-sales assistant. A bad/expired token is ignored, not
// rejected — the landing chat should never hard-fail on a stale token.
async function loadContext(authHeader: string | undefined): Promise<CesarContext> {
  if (!authHeader?.startsWith('Bearer ')) return { user: null, stage: null };
  try {
    const decoded = jwt.verify(authHeader.slice(7), config.jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { client: { include: { progress: true } } }
    });
    if (!user) return { user: null, stage: null };
    const stage = nextOnboardingStep(user.client
      ? { status: user.client.status, progress: user.client.progress }
      : null);
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role },
      stage
    };
  } catch {
    return { user: null, stage: null };
  }
}

cesarRouter.post('/chat', async (req, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid chat payload' });
    }
    const { message, history } = parsed.data;
    const ctx = await loadContext(req.headers.authorization);

    if (ctx.user && llmEnabled()) {
      const result = await llmReply(message, history, ctx);
      if (result) return res.json({ ...result, guardrails: GUARDRAILS });
      // fall through to deterministic reply on gateway failure
    }

    const result = rulesReply(message, ctx);
    return res.json({ ...result, guardrails: GUARDRAILS });
  } catch (error) {
    // Cesar must always answer with something useful, even on unexpected errors.
    console.error('[cesar] chat error:', (error as Error).message);
    const html = `I'm here to help you get started with CredX. You can ${LINKS.signup} or join the ${LINKS.masterclass}.`;
    return res.status(200).json({ source: 'fallback', html, reply: htmlToText(html), guardrails: GUARDRAILS });
  }
});
