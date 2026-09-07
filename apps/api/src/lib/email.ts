import { Resend } from 'resend';
import nodemailer from 'nodemailer';

/* ============================================================
   Shared email design system — synced with apps/web/src/design-tokens.css
   Every transactional email below renders through renderEmailShell()
   so the CredX header, accent bar, footer, contact info, and brand
   colors stay identical across the entire chain.
   ============================================================ */
const EMAIL_BG = '#060a12';
const EMAIL_CARD = '#0b1220';
const EMAIL_CARD_INNER = '#101a2b';
const EMAIL_BORDER = 'rgba(133,157,186,0.18)';
const EMAIL_TEXT = '#f8fafc';
const EMAIL_TEXT_SOFT = '#e2e8f0';
const EMAIL_TEXT_MUTED = '#cbd5e1';
const EMAIL_TEXT_DIM = '#94a3b8';
const EMAIL_CYAN = '#00c6fb';
const EMAIL_SUCCESS = '#22c55e';
const EMAIL_FONT = "'IBM Plex Sans',Helvetica,Arial,sans-serif";

/* CAN-SPAM (15 U.S.C. § 7704): every commercial email must carry a valid
   physical postal address and a working opt-out. Set COMPANY_MAILING_ADDRESS on
   the API env to your real mailing address before launch. */
const COMPANY_MAILING_ADDRESS = (process.env.COMPANY_MAILING_ADDRESS || '[MAILING ADDRESS NOT SET — set COMPANY_MAILING_ADDRESS]').trim();
const UNSUBSCRIBE_EMAIL = (process.env.UNSUBSCRIBE_EMAIL || 'unsubscribe@credxme.com').trim();
const UNSUBSCRIBE_URL = (process.env.UNSUBSCRIBE_URL || '').trim();

function unsubscribeMailto(): string {
  return `mailto:${UNSUBSCRIBE_EMAIL}?subject=unsubscribe`;
}

/** RFC 2369 / RFC 8058 unsubscribe headers for transactional/commercial mail. */
function listUnsubscribeHeaders(): Record<string, string> {
  const targets: string[] = [];
  if (UNSUBSCRIBE_URL) targets.push(`<${UNSUBSCRIBE_URL}>`);
  targets.push(`<${unsubscribeMailto()}>`);
  const headers: Record<string, string> = { 'List-Unsubscribe': targets.join(', ') };
  // One-Click POST is only valid with an HTTPS endpoint.
  if (UNSUBSCRIBE_URL) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}

function emailButton(href: string, label: string, accent: string = EMAIL_CYAN): string {
  return `<div style="text-align:center;padding:18px 0 6px;">
    <a href="${href}" style="display:inline-block;background:${accent};color:#0d1420;text-decoration:none;padding:15px 32px;border-radius:12px;font-weight:700;font-size:16px;font-family:${EMAIL_FONT};letter-spacing:0.2px;">${label}</a>
  </div>`;
}

function emailNumberedSteps(steps: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
    ${steps.map((step, i) => `<tr><td style="padding:0 0 10px;">
      <div style="padding:13px 16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;color:${EMAIL_TEXT_SOFT};font-family:${EMAIL_FONT};font-size:14px;line-height:1.6;">
        <strong style="color:${EMAIL_CYAN};margin-right:8px;">${i + 1}.</strong>${step}
      </div>
    </td></tr>`).join('')}
  </table>`;
}

function renderEmailShell(opts: {
  preheader: string;
  eyebrow: string;
  accent?: string;
  bodyHtml: string;
}): string {
  const accent = opts.accent || EMAIL_CYAN;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>CredX</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};font-family:${EMAIL_FONT};color:${EMAIL_TEXT_SOFT};">
  <div style="display:none;font-size:1px;color:${EMAIL_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:${EMAIL_CARD};border:1px solid ${EMAIL_BORDER};border-radius:18px;overflow:hidden;">
        <tr><td style="height:5px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 22px;text-align:center;border-bottom:1px solid ${EMAIL_BORDER};">
          <div style="font-family:${EMAIL_FONT};font-size:30px;font-weight:700;color:${EMAIL_TEXT};letter-spacing:0.04em;">CredX</div>
          <div style="margin-top:6px;color:${accent};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${opts.eyebrow}</div>
        </td></tr>
        <tr><td style="padding:30px 32px 24px;color:${EMAIL_TEXT_SOFT};font-size:15px;line-height:1.65;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:22px 32px 30px;color:${EMAIL_TEXT_DIM};font-size:12px;line-height:1.6;border-top:1px solid ${EMAIL_BORDER};">
          <strong style="color:${EMAIL_TEXT};font-size:14px;">CredX</strong><br />
          Credit Education &amp; Financial Strategy<br />
          <a href="https://credxme.com" style="color:${accent};text-decoration:none;">credxme.com</a> ·
          <a href="mailto:contact@credxme.com" style="color:${accent};text-decoration:none;">contact@credxme.com</a> ·
          <a href="tel:+18662733963" style="color:${accent};text-decoration:none;">866-CREDX-ME</a>
          <div style="margin-top:12px;color:${EMAIL_TEXT_DIM};font-size:11px;">
            ${COMPANY_MAILING_ADDRESS}
          </div>
          <div style="margin-top:10px;color:${EMAIL_TEXT_DIM};font-size:11px;">
            You're receiving this because you started with CredX. If this wasn't you, ignore this email — no account changes are made until you act.
            To stop receiving these emails, <a href="${unsubscribeMailto()}" style="color:${accent};text-decoration:underline;">unsubscribe here</a>.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderWelcomeLeadEmail(params: { firstName: string; contractLink: string; offerType?: 'program' | 'masterclass' }) {
  const isMasterclass = params.offerType === 'masterclass';
  const subject = isMasterclass ? 'Welcome to the CredX 5-Day Masterclass' : "Welcome to CredX — Here's Your Next Step";
  const headline = isMasterclass ? 'Welcome to the CredX 5-Day Masterclass' : 'Welcome to CredX';
  const tagline = isMasterclass
    ? 'Five days. Six lessons. The same playbook our coaches use internally.'
    : 'A guided, end-to-end credit education and dispute workflow with AI coaching and human support.';
  const intro = isMasterclass
    ? "You're in. Your next step is to open your secure onboarding link so you can review the agreement, complete your intake, and unlock the masterclass inside CredX."
    : 'Your inquiry has been received. Your next step is to open your secure onboarding link so you can review the agreement and complete your intake.';
  const steps = isMasterclass
    ? [
        'Open your secure CredX onboarding link.',
        'Review and sign your CredX agreement.',
        'Complete your intake and choose your monitoring provider.',
        'Unlock your masterclass lessons and affiliate tools inside the platform.'
      ]
    : [
        'Open your secure CredX onboarding link.',
        'Review and sign your CredX agreement.',
        'Complete your intake and connect your monitoring provider.',
        'Watch for your portal-ready email once onboarding is complete.'
      ];
  const valueProps = isMasterclass
    ? [
        ['📚', 'Full 5-day curriculum + bonus wealth day'],
        ['🛠️', 'DIY workflow inside your CredX portal'],
        ['🤝', 'Affiliate stack of vetted credit-builder tools']
      ]
    : [
        ['🧭', 'Guided workflow — disputes, FTC, CFPB, all tracked for you'],
        ['🤖', 'AI coaching plus direct human coach access'],
        ['🛡️', 'Bank-grade encryption on every document and identifier']
      ];
  const valuePropsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;">
      ${valueProps.map(([emoji, label]) => `<tr><td style="padding:0 0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
          <tr>
            <td style="padding:12px 14px;width:38px;font-size:20px;line-height:1;">${emoji}</td>
            <td style="padding:12px 14px 12px 0;color:${EMAIL_TEXT_SOFT};font-family:${EMAIL_FONT};font-size:14px;line-height:1.55;font-weight:500;">${label}</td>
          </tr>
        </table>
      </td></tr>`).join('')}
    </table>`;

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,rgba(0,198,251,0.16),rgba(168,85,247,0.10));border:1px solid ${EMAIL_BORDER};border-radius:14px;margin:0 0 22px;">
      <tr><td style="padding:24px 24px 20px;">
        <div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${EMAIL_CYAN};margin-bottom:8px;">${isMasterclass ? '5-Day Masterclass' : 'Welcome aboard'}</div>
        <h1 style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:28px;line-height:1.2;color:${EMAIL_TEXT};font-weight:700;letter-spacing:-0.4px;">${headline}</h1>
        <p style="margin:0;color:${EMAIL_TEXT_MUTED};font-size:14px;line-height:1.6;">${tagline}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Hi ${params.firstName || 'there'},</p>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">${intro}</p>
    ${valuePropsHtml}
    <div style="margin:8px 0 6px;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_CYAN};">What happens next</div>
    ${emailNumberedSteps(steps)}
    ${emailButton(params.contractLink, isMasterclass ? '🔓 Unlock the Masterclass' : '🚀 Open Secure Onboarding')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
      <tr><td style="padding:14px 16px;color:${EMAIL_TEXT_MUTED};font-size:13px;line-height:1.65;font-family:${EMAIL_FONT};">
        <strong style="color:${EMAIL_TEXT};">Need a hand?</strong> Reply to this email or write to <a href="mailto:contact@credxme.com" style="color:${EMAIL_CYAN};text-decoration:none;font-weight:600;">contact@credxme.com</a> and a CredX coach will reach back out within one business day.
      </td></tr>
    </table>
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:12px;line-height:1.6;">If the button doesn't open, copy and paste this link into your browser:<br /><span style="color:${EMAIL_TEXT};word-break:break-all;font-size:12px;">${params.contractLink}</span></p>
  `;
  const html = renderEmailShell({
    preheader: isMasterclass ? 'Open your secure onboarding to unlock the 5-Day Masterclass.' : 'Open your secure onboarding to begin your CredX journey.',
    eyebrow: isMasterclass ? '5-Day Masterclass · Onboarding' : 'Welcome · Onboarding',
    bodyHtml
  });

  const text = `${headline}

Hi ${params.firstName || 'there'},

${intro}

Next steps:
1. ${steps[0]}
2. ${steps[1]}
3. ${steps[2]}
4. ${steps[3]}

Open secure onboarding:
${params.contractLink}

If the button doesn’t open, copy and paste the link into your browser.

CredX
Credit Education & Financial Strategy`;

  return { subject, html, text };
}

function renderMasterclassWelcomeEmail(params: { firstName: string; setupLink: string; expiresAt: Date }) {
  const subject = 'Welcome to the CredX 5-Day Masterclass — Set Your Password';
  const expiresHours = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 3_600_000));
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">You're enrolled, ${params.firstName || 'there'}.</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Welcome to the CredX Academy. Your 5-Day Credit Education Masterclass access is active — no contracts, no intake forms.</p>
    <p style="margin:0 0 4px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;"><strong style="color:${EMAIL_TEXT};">Day 1: Credit Fundamentals</strong> is waiting for you the moment you set your password and enter the student portal.</p>
    ${emailButton(params.setupLink, 'Set my password')}
    <p style="margin:18px 0 6px;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">This link expires in about ${expiresHours} hours and can only be used once.</p>
    <p style="margin:6px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">If the button doesn't open, copy this link into your browser:<br /><span style="color:${EMAIL_TEXT};word-break:break-all;">${params.setupLink}</span></p>
    <div style="margin-top:22px;padding:14px 16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
      <strong style="color:${EMAIL_TEXT};font-size:13px;letter-spacing:0.4px;text-transform:uppercase;">Academy setup</strong>
      <ol style="margin:10px 0 0 18px;padding:0;color:${EMAIL_TEXT_SOFT};font-size:14px;line-height:1.65;">
        <li>Click the button above and create your CredX portal password.</li>
        <li>Log in with the same email address you used at checkout.</li>
        <li>Open the Masterclass area inside the portal and begin Day 1.</li>
        <li>Watch for the next lesson emails as the academy sequence continues.</li>
      </ol>
    </div>
  `;
  const html = renderEmailShell({
    preheader: "You're enrolled. Set your password and Day 1 is ready to go.",
    eyebrow: '5-Day Masterclass · Enrolled',
    bodyHtml
  });

  const text = `Welcome to the CredX 5-Day Masterclass

Hi ${params.firstName || 'there'},

You're enrolled in CredX Academy. No contract, no intake — just set your password and Day 1 is ready.

Set your password: ${params.setupLink}

This link expires in about ${expiresHours} hours and can only be used once.

Academy setup:
1. Click the link and create your CredX portal password.
2. Log in with the same email address you used at checkout.
3. Open the Masterclass area inside the portal and begin Day 1.
4. Watch for the next lesson emails as the academy sequence continues.

Questions? Reply to this email or write to contact@credxme.com.

CredX`;

  return { subject, html, text };
}

type MasterclassDayContent = {
  day: number;
  title: string;
  tagline: string;
  summary: string;
  objectives: string[];
  isBonus?: boolean;
};

export const MASTERCLASS_EMAIL_DAYS: MasterclassDayContent[] = [
  { day: 1, title: 'Day 1 — Credit Fundamentals', tagline: 'Understand how credit really works', summary: 'The foundation: how FICO is calculated, how to read a tri-merge report, and how to spot the items actually moving your score.', objectives: ['Break down the five FICO factors.', 'Pull and read all three bureau reports.', 'Build your dispute target list.'] },
  { day: 2, title: 'Day 2 — The Dispute Process Decoded', tagline: 'Your legal rights and the dispute workflow', summary: 'The Fair Credit Reporting Act gives you a real toolkit. Today you learn the laws and the workflow that forces investigations.', objectives: ['Know your FCRA and FDCPA rights.', 'Draft a dispute letter that cannot be ignored.', 'Track the 30-day reinvestigation window.'] },
  { day: 3, title: 'Day 3 — Advanced Dispute Tactics', tagline: 'Escalation when bureaus stall', summary: 'Standard disputes get most things removed; the rest need pressure. Today: 609 letters, validation, and CFPB escalation.', objectives: ['Use Section 609 to demand verifiable proof.', 'Force collectors to validate before settling.', 'Escalate to the CFPB or state AG when needed.'] },
  { day: 4, title: 'Day 4 — Building Positive Credit', tagline: 'Add strong tradelines to push the score up', summary: 'Removing negatives is half the work; the other half is replacing them with consistent positive history.', objectives: ['Use authorized-user tradelines to import history.', 'Choose a secured card that graduates.', 'Stack builder loans, rent and utility reporting.'] },
  { day: 5, title: 'Day 5 — Business Credit & Funding', tagline: 'Separate personal and business credit for growth', summary: 'Business credit is its own profile. Build the foundation correctly so you can qualify for funding without leaning on personal credit.', objectives: ['Stand up a credible business profile.', 'Open Net-30 vendor accounts that report.', 'Move from vendor credit to business funding.'] },
  { day: 6, title: 'Bonus Day — Generational Wealth', tagline: 'Build something that outlasts you', summary: 'Credit is a tool. Wealth is the goal. Connect everything to investing, real estate, and structures that protect what you build.', objectives: ['Use strong credit for better real-estate financing.', 'Set up a consistent investing routine.', 'Use trust structures to protect and transfer.'], isBonus: true }
];

function renderMasterclassDayEmail(params: { firstName: string; portalLink: string; day: MasterclassDayContent }) {
  const accent = params.day.isBonus ? '#f59e0b' : EMAIL_CYAN;
  const subject = `${params.day.title} — ${params.day.tagline} | CredX Masterclass`;
  const objectivesHtml = params.day.objectives.map((o) => `<li style="margin:0 0 8px;color:${EMAIL_TEXT_SOFT};">${o}</li>`).join('');
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">${params.day.tagline}</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Hi ${params.firstName || 'there'} — ${params.day.summary}</p>
    <div style="margin:18px 0;padding:16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
      <strong style="color:${accent};font-size:12px;letter-spacing:0.4px;text-transform:uppercase;">What you'll learn today</strong>
      <ul style="margin:10px 0 0;padding-left:20px;color:${EMAIL_TEXT_SOFT};font-size:14px;line-height:1.7;">${objectivesHtml}</ul>
    </div>
    ${emailButton(params.portalLink, `Open Day ${params.day.day} in your portal`, accent)}
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">Each day has two short lessons, the slide follow-along, key terms, and real-life Q&amp;A.</p>
  `;
  const html = renderEmailShell({
    preheader: `${params.day.title}: ${params.day.tagline}.`,
    eyebrow: `${params.day.title}${params.day.isBonus ? ' · Bonus' : ''}`,
    accent,
    bodyHtml
  });

  const text = `${params.day.title} — ${params.day.tagline}

Hi ${params.firstName || 'there'},

${params.day.summary}

What you'll learn today:
${params.day.objectives.map((o) => `- ${o}`).join('\n')}

Open Day ${params.day.day}: ${params.portalLink}

— CredX`;

  return { subject, html, text };
}

export async function sendMasterclassDayEmail(params: { to: string; firstName: string; portalLink: string; day: number }) {
  const dayContent = MASTERCLASS_EMAIL_DAYS.find((d) => d.day === params.day);
  if (!dayContent) {
    throw new Error(`No masterclass content defined for day ${params.day}`);
  }
  const email = renderMasterclassDayEmail({ firstName: params.firstName, portalLink: params.portalLink, day: dayContent });
  const result = await sendEmail({ to: params.to, subject: email.subject, html: email.html, text: email.text });
  console.log('MASTERCLASS_DAY_EMAIL_SEND_RESULT', { to: params.to, day: params.day, result });
  return { ...email, delivery: result };
}

export async function sendMasterclassWelcomeEmail(params: { to: string; firstName: string; setupLink: string; expiresAt: Date }) {
  const email = renderMasterclassWelcomeEmail({
    firstName: params.firstName,
    setupLink: params.setupLink,
    expiresAt: params.expiresAt
  });

  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('MASTERCLASS_WELCOME_EMAIL_SEND_RESULT', {
    to: params.to,
    setupLink: params.setupLink,
    expiresAt: params.expiresAt.toISOString(),
    result
  });

  return { ...email, delivery: result };
}

export async function sendWelcomeLeadEmail(params: { firstName: string; email: string; contractLink: string; offerType?: 'program' | 'masterclass' }) {
  const email = renderWelcomeLeadEmail({
    firstName: params.firstName,
    contractLink: params.contractLink,
    offerType: params.offerType
  });

  const result = await sendEmail({
    to: params.email,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('WELCOME_EMAIL_SEND_RESULT', {
    to: params.email,
    subject: email.subject,
    contractLink: params.contractLink,
    result
  });

  return { ...email, delivery: result };
}

function renderAffiliateOnboardingEmail(params: {
  name: string;
  affiliateId: string;
  referralCode: string;
  referralLink: string;
  onboardingLink: string;
}) {
  const subject = 'Welcome to the CredX Affiliate Program';
  const steps = [
    'Review the CredX affiliate policy and sign the acknowledgment.',
    'After signing, create your secure sub-agent admin login.',
    'Copy your affiliate link and use it in your social bio, stories, posts, texts, or direct messages.',
    'Send prospects to the link. CredX tracks clicks, source, IP, device, signups, and referrals back to your affiliate record.'
  ];
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">Welcome to CredX, ${params.name || 'partner'}.</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">CredX helps consumers understand their credit reports, identify inaccurate or unverifiable negative reporting, prepare lawful dispute strategy, and rebuild stronger financial habits through education, guided workflows, and credit improvement services.</p>
    <div style="margin:18px 0;padding:16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
      <strong style="display:block;color:${EMAIL_TEXT};font-size:13px;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Your affiliate details</strong>
      <div style="color:${EMAIL_TEXT_MUTED};font-size:14px;line-height:1.7;">Affiliate ID: <strong style="color:${EMAIL_CYAN};">${params.affiliateId}</strong><br />Referral code: <strong style="color:${EMAIL_CYAN};">${params.referralCode}</strong><br />Link: <span style="color:${EMAIL_TEXT};word-break:break-all;">${params.referralLink}</span></div>
    </div>
    <div style="margin:8px 0 6px;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_CYAN};">How to use your affiliate link</div>
    ${emailNumberedSteps(steps)}
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:15px;line-height:1.7;">Use your link anywhere you are introducing people to CredX. Do not promise deletions, guaranteed score increases, legal representation, or guaranteed funding. Keep your message simple: CredX reviews credit-report issues, helps build lawful strategy, and supports the client journey.</p>
    ${emailButton(params.onboardingLink, 'Review policy and set up login')}
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:12px;line-height:1.6;">If the button doesn't open, copy and paste this link into your browser:<br /><span style="color:${EMAIL_TEXT};word-break:break-all;font-size:12px;">${params.onboardingLink}</span></p>
  `;
  const html = renderEmailShell({
    preheader: 'Review the CredX affiliate policy, sign it, and set up your sub-agent admin login.',
    eyebrow: 'Affiliate · Onboarding',
    bodyHtml
  });
  const text = `Welcome to the CredX Affiliate Program

Hi ${params.name || 'partner'},

CredX helps consumers understand their credit reports, identify inaccurate or unverifiable negative reporting, prepare lawful dispute strategy, and rebuild stronger financial habits through education, guided workflows, and credit improvement services.

Affiliate ID: ${params.affiliateId}
Referral code: ${params.referralCode}
Referral link: ${params.referralLink}

How to use your affiliate link:
1. Review the CredX affiliate policy and sign the acknowledgment.
2. After signing, create your secure sub-agent admin login.
3. Copy your affiliate link and use it in your social bio, stories, posts, texts, or direct messages.
4. Send prospects to the link. CredX tracks clicks, source, IP, device, signups, and referrals back to your affiliate record.

Do not promise deletions, guaranteed score increases, legal representation, or guaranteed funding.

Review policy and set up login:
${params.onboardingLink}

CredX`;

  return { subject, html, text };
}

export async function sendAffiliateOnboardingEmail(params: {
  to: string;
  name: string;
  affiliateId: string;
  referralCode: string;
  referralLink: string;
  onboardingLink: string;
}) {
  const email = renderAffiliateOnboardingEmail(params);
  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('AFFILIATE_ONBOARDING_EMAIL_SEND_RESULT', {
    to: params.to,
    affiliateId: params.affiliateId,
    result
  });

  return { ...email, delivery: result };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(params: { to: string; subject: string; html?: string; text?: string; attachments?: EmailAttachment[] }): Promise<{ id?: string; provider?: string; skipped?: boolean; reason?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const businessEmail = process.env.BUSINESS_EMAIL || 'contact@credxme.com';
  const defaultFrom = `CredX <${businessEmail}>`;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = process.env.SMTP_SECURE == null ? smtpPort === 465 : process.env.SMTP_SECURE !== 'false';
  const smtpFrom = process.env.SMTP_FROM_EMAIL || process.env.FROM_EMAIL || defaultFrom;
  const resendFrom = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || defaultFrom;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || defaultFrom;
  const sendgridTimeoutMs = Number(process.env.SENDGRID_TIMEOUT_MS || 6000);
  const resendTimeoutMs = Number(process.env.RESEND_TIMEOUT_MS || 6000);
  const smtpTimeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 4000);

  const parseFrom = (value: string) => {
    const email = value.includes('<') ? value.match(/<([^>]+)>/ )?.[1] || value : value;
    const name = value.includes('<') ? value.split('<')[0].trim().replace(/^"|"$/g, '') : 'CredX';
    return { email, name: name || 'CredX' };
  };

  let sendgridFailure: string | null = null;
  let resendFailure: string | null = null;
  let smtpFailure: string | null = null;

  const withTimeout = async <T>(label: string, timeoutMs: number, task: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await task(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${label} timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const sendViaResend = async () => {
    if (!resendApiKey) return null;
    try {
      return await withTimeout('Resend', resendTimeoutMs, async () => {
        const resend = new Resend(resendApiKey);
        const from = parseFrom(resendFrom);
        const result = await resend.emails.send({
          from: from.name ? `${from.name} <${from.email}>` : from.email,
          to: [params.to],
          subject: params.subject,
          headers: listUnsubscribeHeaders(),
          ...(params.html ? { html: params.html } : {}),
          ...(params.text ? { text: params.text } : { text: '' }),
          ...(params.attachments?.length
            ? {
                attachments: params.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  contentType: a.contentType
                }))
              }
            : {})
        });

        if (!result.error) {
          return { id: result.data?.id, provider: 'resend' };
        }

        throw new Error(`RESEND_SEND_FAILED:${JSON.stringify(result.error)}`);
      });
    } catch (error) {
      resendFailure = error instanceof Error ? error.message : String(error);
      console.warn(resendFailure.startsWith('RESEND_SEND_FAILED') ? 'RESEND_SEND_FAILED' : 'RESEND_EXCEPTION', resendFailure);
      return null;
    }
  };

  const sendViaSendGrid = async () => {
    if (!sendgridApiKey) return null;
    const from = parseFrom(sendgridFrom);

    try {
      return await withTimeout('SendGrid', sendgridTimeoutMs, async (signal) => {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: params.to }] }],
            from: { email: from.email, name: from.name },
            reply_to: { email: process.env.SMTP_REPLY_TO || businessEmail, name: 'CredX' },
            subject: params.subject,
            headers: listUnsubscribeHeaders(),
            content: [
              ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
              ...(params.html ? [{ type: 'text/html', value: params.html }] : [])
            ],
            ...(params.attachments?.length
              ? {
                  attachments: params.attachments.map((a) => ({
                    filename: a.filename,
                    type: a.contentType || 'application/octet-stream',
                    disposition: 'attachment',
                    content: a.content.toString('base64')
                  }))
                }
              : {})
          }),
          signal
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`SENDGRID_SEND_FAILED:${response.status}:${body}`);
        }

        return { id: response.headers.get('x-message-id') || 'sendgrid-accepted', provider: 'sendgrid' };
      });
    } catch (error) {
      sendgridFailure = error instanceof Error ? error.message : String(error);
      console.warn(sendgridFailure.startsWith('SENDGRID_SEND_FAILED') ? 'SENDGRID_SEND_FAILED' : 'SENDGRID_EXCEPTION', sendgridFailure);
      return null;
    }
  };

  const sendViaSmtp = async () => {
    if (!smtpHost || !smtpUser || !smtpPass) return null;
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        connectionTimeout: smtpTimeoutMs,
        greetingTimeout: smtpTimeoutMs,
        socketTimeout: smtpTimeoutMs,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      const from = parseFrom(smtpFrom);
      const result = await transporter.sendMail({
        from: from.name ? `${from.name} <${from.email}>` : from.email,
        to: params.to,
        subject: params.subject,
        headers: listUnsubscribeHeaders(),
        replyTo: process.env.SMTP_REPLY_TO || businessEmail,
        ...(params.html ? { html: params.html } : {}),
        ...(params.text ? { text: params.text } : { text: '' }),
        ...(params.attachments?.length
          ? {
              attachments: params.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType
              }))
            }
          : {})
      });

      return { id: result.messageId, provider: 'smtp' };
    } catch (error) {
      smtpFailure = error instanceof Error ? error.message : String(error);
      console.warn('SMTP_EXCEPTION', smtpFailure);
      return null;
    }
  };

  // Resend is currently the healthy production provider. Try it before the
  // legacy SMTP fallback so signup responses do not wait on SMTP timeouts.
  for (const send of [sendViaResend, sendViaSendGrid, sendViaSmtp]) {
    const result = await send();
    if (result) return result;
  }

  const providerFailures = [
    sendgridFailure && `SendGrid failed: ${sendgridFailure}`,
    smtpFailure && `SMTP failed: ${smtpFailure}`,
    resendFailure && `Resend failed: ${resendFailure}`
  ].filter(Boolean).join(' | ');
  const reason = providerFailures || 'No email provider configured';
  console.log('EMAIL_PREVIEW', { to: params.to, subject: params.subject, reason });
  return { skipped: true, reason };
}

function renderPasswordSetupEmail(params: {
  firstName: string;
  setupLink: string;
  purpose: 'setup' | 'reset';
  expiresAt: Date;
}) {
  const isReset = params.purpose === 'reset';
  const headline = isReset ? 'Reset your CredX password' : 'Set up your CredX password';
  const subject = isReset ? 'Reset your CredX password' : 'Set up your CredX portal password';
  const intro = isReset
    ? 'We received a request to reset the password on your CredX account. Use the secure link below to choose a new password.'
    : 'Your CredX portal is ready. Use the secure link below to set a password and log in for the first time.';
  const expiresLabel = params.expiresAt.toUTCString();

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">${headline}</h1>
    <p style="margin:0 0 12px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Hi ${params.firstName || 'there'},</p>
    <p style="margin:0 0 4px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">${intro}</p>
    ${emailButton(params.setupLink, isReset ? 'Reset password' : 'Set my password')}
    <div style="margin-top:18px;padding:14px 16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;display:flex;gap:12px;align-items:flex-start;">
      <div style="font-size:18px;line-height:1.2;">🔒</div>
      <div>
        <strong style="color:${EMAIL_SUCCESS};font-size:11px;letter-spacing:0.4px;text-transform:uppercase;display:block;margin-bottom:4px;">Encrypted &amp; one-time</strong>
        <span style="color:${EMAIL_TEXT_MUTED};font-size:13px;line-height:1.55;">This link expires on ${expiresLabel} and can only be used once. Your password is hashed before it's saved — even CredX staff can't read it.</span>
      </div>
    </div>
    <p style="margin:14px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">If you didn't request this, you can safely ignore this email — no account changes are made until you act.</p>
  `;
  const html = renderEmailShell({
    preheader: isReset ? 'Reset your CredX password using the secure link below.' : 'Your CredX portal is ready — set your password to sign in.',
    eyebrow: isReset ? 'Account · Password Reset' : 'Account · Password Setup',
    bodyHtml
  });

  const text = `${headline}

Hi ${params.firstName || 'there'},

${intro}

${isReset ? 'Reset password' : 'Set your password'}: ${params.setupLink}

This link expires on ${expiresLabel}. For your security, it can only be used once.
If you didn't request this, you can safely ignore the email.

CredX
Credit Education & Financial Strategy`;

  return { subject, html, text };
}

export async function sendPasswordSetupEmail(params: {
  to: string;
  firstName: string;
  setupLink: string;
  purpose: 'setup' | 'reset';
  expiresAt: Date;
}) {
  const email = renderPasswordSetupEmail({
    firstName: params.firstName,
    setupLink: params.setupLink,
    purpose: params.purpose,
    expiresAt: params.expiresAt
  });

  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('PASSWORD_SETUP_EMAIL_SEND_RESULT', {
    to: params.to,
    purpose: params.purpose,
    expiresAt: params.expiresAt.toISOString(),
    result
  });

  return { ...email, delivery: result };
}

function renderPortalReadyEmail(params: {
  firstName: string;
  loginLink: string;
  setupLink: string;
}) {
  const subject = 'Set your CredX password to access your portal';
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">You're all set, ${params.firstName || 'there'}.</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Your contract is signed and your profile is on file. Your CredX portal is ready.</p>
    <p style="margin:0 0 4px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Before you can enter the portal, you need to create your password using the secure button below.</p>
    ${emailButton(params.setupLink, 'Set my password')}
    <p style="margin:18px 0 8px;color:${EMAIL_TEXT_SOFT};font-size:14px;line-height:1.6;">After your password is set, you can sign in to your portal here:<br /><a href="${params.loginLink}" style="color:${EMAIL_CYAN};word-break:break-all;">${params.loginLink}</a></p>
    <p style="margin:12px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">If you ever need to reset it again, use this same secure link.</p>
  `;
  const html = renderEmailShell({
    preheader: 'Your CredX portal is ready. Set your password to sign in.',
    eyebrow: 'Portal · Ready',
    bodyHtml
  });

  const text = `Set your CredX password to access your portal

Hi ${params.firstName || 'there'},

Your contract is signed and your profile is on file. Your CredX portal is ready.

Before you can enter the portal, create your password here:
${params.setupLink}

After your password is set, sign in here:
${params.loginLink}

CredX
Credit Education & Financial Strategy`;

  return { subject, html, text };
}

export async function sendPortalReadyEmail(params: {
  to: string;
  firstName: string;
  loginLink: string;
  setupLink: string;
}) {
  const email = renderPortalReadyEmail({
    firstName: params.firstName,
    loginLink: params.loginLink,
    setupLink: params.setupLink
  });

  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('PORTAL_READY_EMAIL_SEND_RESULT', {
    to: params.to,
    loginLink: params.loginLink,
    result
  });

  return { ...email, delivery: result };
}

function renderCreditAnalysisEmail(params: {
  firstName: string;
  summary: string;
  findingCount: number;
  disputeCount: number;
  bureauScores: Array<{ bureau: string; score: number | null }>;
  portalLink: string;
}) {
  const subject = 'Your CredX credit analysis is ready';
  const scoreCells = params.bureauScores.length
    ? params.bureauScores.map((s) => `
        <td style="padding:14px 10px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;text-align:center;font-family:${EMAIL_FONT};">
          <div style="color:${EMAIL_TEXT_DIM};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${s.bureau}</div>
          <div style="margin-top:6px;color:${EMAIL_TEXT};font-size:28px;font-weight:700;">${s.score == null ? '—' : s.score}</div>
        </td>`).join('<td style="width:8px;">&nbsp;</td>')
    : '';
  const scoresHtml = scoreCells
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 8px;"><tr>${scoreCells}</tr></table>`
    : '';
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">Your credit analysis is ready, ${params.firstName || 'there'}.</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Your full report is attached to this email as a PDF. Here's a snapshot:</p>
    ${scoresHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
      <tr>
        <td style="padding:12px 14px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;width:50%;">
          <div style="color:${EMAIL_TEXT_DIM};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Key Findings</div>
          <div style="margin-top:4px;color:${EMAIL_TEXT};font-size:22px;font-weight:700;font-family:${EMAIL_FONT};">${params.findingCount}</div>
        </td>
        <td style="width:8px;">&nbsp;</td>
        <td style="padding:12px 14px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;width:50%;">
          <div style="color:${EMAIL_TEXT_DIM};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Dispute Opportunities</div>
          <div style="margin-top:4px;color:${EMAIL_TEXT};font-size:22px;font-weight:700;font-family:${EMAIL_FONT};">${params.disputeCount}</div>
        </td>
      </tr>
    </table>
    <div style="margin:0 0 18px;padding:16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;color:${EMAIL_TEXT_SOFT};font-size:14px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(params.summary).slice(0, 1400)}</div>
    ${emailButton(params.portalLink, 'Open the full report in your portal')}
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">The attached PDF is a complete copy of the analysis we generated today. Keep it for your records — and reply to this email if you'd like a coach to walk you through it.</p>
  `;
  const html = renderEmailShell({
    preheader: 'Your CredX credit analysis is attached. Open the portal to take action.',
    eyebrow: 'Analysis · Ready',
    bodyHtml
  });
  const text = `Your credit analysis is ready, ${params.firstName || 'there'}.

Your full report is attached to this email as a PDF.

Snapshot:
${params.bureauScores.map((s) => `  ${s.bureau}: ${s.score ?? '—'}`).join('\n')}
  Key findings: ${params.findingCount}
  Dispute opportunities: ${params.disputeCount}

${params.summary.slice(0, 1400)}

Open the full report in your portal:
${params.portalLink}

— CredX`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

export async function sendCreditAnalysisEmail(params: {
  to: string;
  firstName: string;
  summary: string;
  findingCount: number;
  disputeCount: number;
  bureauScores: Array<{ bureau: string; score: number | null }>;
  portalLink: string;
  pdf: Buffer;
  pdfFilename?: string;
}) {
  const email = renderCreditAnalysisEmail({
    firstName: params.firstName,
    summary: params.summary,
    findingCount: params.findingCount,
    disputeCount: params.disputeCount,
    bureauScores: params.bureauScores,
    portalLink: params.portalLink
  });

  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      {
        filename: params.pdfFilename || 'credx-credit-analysis.pdf',
        content: params.pdf,
        contentType: 'application/pdf'
      }
    ]
  });

  console.log('CREDIT_ANALYSIS_EMAIL_SEND_RESULT', {
    to: params.to,
    pdfBytes: params.pdf.length,
    findingCount: params.findingCount,
    disputeCount: params.disputeCount,
    result
  });

  return { ...email, delivery: result };
}

function renderAffiliateReferralEmail(params: {
  firstName: string;
  links: Array<{ label: string; url: string; category: string; reason?: string }>;
  note?: string | null;
}) {
  const subject = 'Your CredX recommended credit-building resources';
  const linkRows = params.links.map((link) => `
    <tr><td style="padding:0 0 10px;">
      <div style="padding:14px 16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
        <div style="font-family:${EMAIL_FONT};font-size:16px;font-weight:700;color:${EMAIL_TEXT};">${escapeHtml(link.label)}</div>
        ${link.reason ? `<div style="margin-top:5px;color:${EMAIL_TEXT_MUTED};font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;">${escapeHtml(link.reason)}</div>` : ''}
        <div style="margin-top:10px;">
          <a href="${link.url}" style="color:${EMAIL_CYAN};font-family:${EMAIL_FONT};font-size:13px;font-weight:700;text-decoration:none;word-break:break-all;">Open resource</a>
        </div>
      </div>
    </td></tr>`).join('');
  const noteHtml = params.note
    ? `<p style="margin:0 0 16px;color:${EMAIL_TEXT_SOFT};font-size:15px;line-height:1.7;">${escapeHtml(params.note)}</p>`
    : '';
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">Recommended resources for your credit plan</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Hi ${params.firstName || 'there'},</p>
    ${noteHtml}
    <p style="margin:0 0 16px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Based on your CredX review, these resources may help with rebuilding positive payment history or adding useful reporting depth. Review each option carefully before opening any new account.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${linkRows}</table>
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">CredX may earn compensation from these links at no extra cost to you. This is education and strategy support, not a guarantee of approval, score increase, or deletion.</p>
  `;
  const html = renderEmailShell({
    preheader: 'CredX recommended credit-building resources for your next step.',
    eyebrow: 'Resources · Credit Building',
    bodyHtml
  });
  const text = `Recommended resources for your credit plan

Hi ${params.firstName || 'there'},

${params.note ? `${params.note}\n\n` : ''}Based on your CredX review, these resources may help with rebuilding positive payment history or adding useful reporting depth. Review each option carefully before opening any new account.

${params.links.map((link) => `- ${link.label}: ${link.url}${link.reason ? `\n  ${link.reason}` : ''}`).join('\n')}

CredX may earn compensation from these links at no extra cost to you. This is education and strategy support, not a guarantee of approval, score increase, or deletion.

CredX`;
  return { subject, html, text };
}

export async function sendAffiliateReferralEmail(params: {
  to: string;
  firstName: string;
  links: Array<{ label: string; url: string; category: string; reason?: string }>;
  note?: string | null;
}) {
  const email = renderAffiliateReferralEmail({
    firstName: params.firstName,
    links: params.links,
    note: params.note
  });

  const result = await sendEmail({
    to: params.to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });

  console.log('AFFILIATE_REFERRAL_EMAIL_SEND_RESULT', {
    to: params.to,
    linkCount: params.links.length,
    result
  });

  return { ...email, delivery: result };
}

export async function notifyNewLead(params: { firstName: string; lastName: string; email: string; phone?: string; source?: string }) {
  const leadNotificationEmail = process.env.LEAD_NOTIFICATION_EMAIL
    || process.env.ADMIN_ALERT_EMAIL
    || process.env.BUSINESS_EMAIL
    || 'contact@credxme.com';
  const subject = `New CredX lead: ${params.firstName} ${params.lastName}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;">
      <h2 style="margin-bottom:12px;">New CredX lead received</h2>
      <p><strong>Name:</strong> ${params.firstName} ${params.lastName}</p>
      <p><strong>Email:</strong> ${params.email}</p>
      <p><strong>Phone:</strong> ${params.phone || 'Not provided'}</p>
      <p><strong>Referral source:</strong> ${params.source || 'Not provided'}</p>
    </div>
  `;
  const text = `New CredX lead received\n\nName: ${params.firstName} ${params.lastName}\nEmail: ${params.email}\nPhone: ${params.phone || 'Not provided'}\nReferral source: ${params.source || 'Not provided'}`;

  const result = await sendEmail({
    to: leadNotificationEmail,
    subject,
    html,
    text
  });

  console.log('NEW_LEAD_NOTIFICATION_SEND_RESULT', {
    to: leadNotificationEmail,
    lead: params,
    result
  });

  return result;
}
