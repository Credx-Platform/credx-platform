import { Resend } from 'resend';

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
          Credit Repair &amp; Financial Strategy Support<br />
          <a href="https://credxme.com" style="color:${accent};text-decoration:none;">credxme.com</a> ·
          <a href="mailto:contact@credxme.com" style="color:${accent};text-decoration:none;">contact@credxme.com</a> ·
          <a href="tel:+18662733963" style="color:${accent};text-decoration:none;">866-CREDX-ME</a>
          <div style="margin-top:14px;color:${EMAIL_TEXT_DIM};font-size:11px;">
            You're receiving this because you started with CredX. If this wasn't you, ignore this email — no account changes are made until you act.
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

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">${headline}</h1>
    <p style="margin:0 0 12px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Hi ${params.firstName || 'there'},</p>
    <p style="margin:0 0 4px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">${intro}</p>
    ${emailNumberedSteps(steps)}
    ${emailButton(params.contractLink, 'Open Secure Onboarding')}
    <p style="margin:18px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">If the button doesn't open, copy and paste this link into your browser:<br /><span style="color:${EMAIL_TEXT};word-break:break-all;">${params.contractLink}</span></p>
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
Credit Repair & Financial Strategy Support`;

  return { subject, html, text };
}

function renderMasterclassWelcomeEmail(params: { firstName: string; setupLink: string; expiresAt: Date }) {
  const subject = 'Welcome to the CredX 5-Day Masterclass — Set Your Password';
  const expiresHours = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 3_600_000));
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;line-height:1.25;color:${EMAIL_TEXT};font-weight:700;">You're enrolled, ${params.firstName || 'there'}.</h1>
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Welcome to the CredX 5-Day Credit Repair Masterclass. No contracts, no intake forms — just set your password and you're in.</p>
    <p style="margin:0 0 4px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;"><strong style="color:${EMAIL_TEXT};">Day 1: Credit Fundamentals</strong> is waiting for you the moment you log in.</p>
    ${emailButton(params.setupLink, 'Set my password')}
    <p style="margin:18px 0 6px;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">This link expires in about ${expiresHours} hours and can only be used once.</p>
    <p style="margin:6px 0 0;color:${EMAIL_TEXT_DIM};font-size:13px;line-height:1.6;">If the button doesn't open, copy this link into your browser:<br /><span style="color:${EMAIL_TEXT};word-break:break-all;">${params.setupLink}</span></p>
    <div style="margin-top:22px;padding:14px 16px;background:${EMAIL_CARD_INNER};border:1px solid ${EMAIL_BORDER};border-radius:10px;">
      <strong style="color:${EMAIL_TEXT};font-size:13px;letter-spacing:0.4px;text-transform:uppercase;">What's next</strong>
      <ol style="margin:10px 0 0 18px;padding:0;color:${EMAIL_TEXT_SOFT};font-size:14px;line-height:1.65;">
        <li>Click the button above and set your password.</li>
        <li>You'll land on Day 1 automatically.</li>
        <li>Work through one day at a time at your own pace.</li>
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

You're enrolled. No contract, no intake — just set your password and Day 1 is ready.

Set your password: ${params.setupLink}

This link expires in about ${expiresHours} hours and can only be used once.

What's next:
1. Click the link and set your password.
2. You'll land on Day 1 automatically.
3. Work through one day at a time at your own pace.

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

export async function sendEmail(params: { to: string; subject: string; html?: string; text?: string }): Promise<{ id?: string; provider?: string; skipped?: boolean; reason?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || 'CredX <onboarding@updates.credxme.com>';
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'CredX <hello@credxme.com>';

  const parseFrom = (value: string) => {
    const email = value.includes('<') ? value.match(/<([^>]+)>/ )?.[1] || value : value;
    const name = value.includes('<') ? value.split('<')[0].trim().replace(/^"|"$/g, '') : 'CredX';
    return { email, name: name || 'CredX' };
  };

  let resendFailure: string | null = null;

  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const from = parseFrom(resendFrom);
      const result = await resend.emails.send({
        from: from.name ? `${from.name} <${from.email}>` : from.email,
        to: [params.to],
        subject: params.subject,
        ...(params.html ? { html: params.html } : {}),
        ...(params.text ? { text: params.text } : { text: '' })
      });

      if (!result.error) {
        return { id: result.data?.id, provider: 'resend' };
      }

      resendFailure = `RESEND_SEND_FAILED:${JSON.stringify(result.error)}`;
      console.warn('RESEND_SEND_FAILED', result.error);
    } catch (error) {
      resendFailure = error instanceof Error ? error.message : String(error);
      console.warn('RESEND_EXCEPTION', resendFailure);
    }
  }

  if (!sendgridApiKey) {
    const reason = resendFailure ? `Resend failed and no SendGrid fallback is configured: ${resendFailure}` : 'No email provider configured';
    console.log('EMAIL_PREVIEW', { to: params.to, subject: params.subject, reason });
    return { skipped: true, reason };
  }

  const from = parseFrom(sendgridFrom);

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: from.email, name: from.name },
        subject: params.subject,
        content: [
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
          ...(params.html ? [{ type: 'text/html', value: params.html }] : [])
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const reason = `SENDGRID_SEND_FAILED:${response.status}:${body}`;
      console.warn('SENDGRID_SEND_FAILED', response.status, body);
      return { skipped: true, reason: resendFailure ? `${resendFailure} | ${reason}` : reason };
    }

    return { id: response.headers.get('x-message-id') || 'sendgrid-accepted', provider: 'sendgrid' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('SENDGRID_EXCEPTION', reason);
    return { skipped: true, reason: resendFailure ? `${resendFailure} | ${reason}` : reason };
  }
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
Credit Repair & Financial Strategy Support`;

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
    <p style="margin:0 0 14px;color:${EMAIL_TEXT_SOFT};font-size:16px;line-height:1.7;">Your contract is signed, your profile is on file, and your credit monitoring credentials are connected. Your CredX portal is ready.</p>
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

Your contract is signed, your profile is on file, and your credit monitoring credentials are connected. Your CredX portal is ready.

Before you can enter the portal, create your password here:
${params.setupLink}

After your password is set, sign in here:
${params.loginLink}

CredX
Credit Repair & Financial Strategy Support`;

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

export async function notifyNewLead(params: { firstName: string; lastName: string; email: string; phone?: string; source?: string }) {
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
    to: 'jmalloy@credxme.com',
    subject,
    html,
    text
  });

  console.log('NEW_LEAD_NOTIFICATION_SEND_RESULT', {
    to: 'jmalloy@credxme.com',
    lead: params,
    result
  });

  return result;
}
