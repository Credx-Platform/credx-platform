import { Resend } from 'resend';

function renderWelcomeLeadEmail(params: { firstName: string; contractLink: string; offerType?: 'program' | 'masterclass' }) {
  const isMasterclass = params.offerType === 'masterclass';
  const subject = isMasterclass ? 'Welcome to the CredX 5-Day Masterclass' : 'Welcome to CredX — Here’s Your Next Step';
  const headline = isMasterclass ? 'Welcome to the CredX 5-Day Masterclass' : 'Welcome to CredX';
  const intro = isMasterclass
    ? 'You’re in. Your next step is to open your secure onboarding link so you can review the agreement, complete your intake, and unlock the masterclass inside CredX.'
    : 'Your inquiry has been received, and the next step is to open your secure onboarding link so you can review the agreement and complete your intake properly.';
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#0d1420;font-family:Arial,Helvetica,sans-serif;color:#e9eef6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d1420;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#111a28;border:1px solid #243247;border-radius:18px;overflow:hidden;">
          <tr><td style="height:6px;background:#c9a227;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="background:#111a28;padding:32px 28px 24px;text-align:center;border-bottom:1px solid #243247;">
              <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:0.03em;">CredX</div>
              <div style="margin-top:8px;color:#c8d3e1;font-size:14px;">${isMasterclass ? '5-Day Masterclass + onboarding access' : 'Credit Repair & Financial Strategy Support'}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#ffffff;">${headline}</h1>
              <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Hi ${params.firstName || 'there'},</p>
              <p style="margin:0 0 16px;color:#d5dfeb;font-size:16px;line-height:1.65;">${intro}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
                ${steps.map((step, index) => `<tr><td style="padding:0 0 12px;"><div style="padding:14px 16px;background:#162132;border:1px solid #243247;border-radius:12px;color:#e9eef6;"><strong>${index + 1}.</strong> ${step}</div></td></tr>`).join('')}
              </table>
              <div style="text-align:center;padding:10px 0 4px;">
                <a href="${params.contractLink}" style="display:inline-block;background:#c9a227;color:#111a28;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:800;font-size:16px;">Open Secure Onboarding</a>
              </div>
              <p style="margin:18px 0 0;color:#9fb0c5;font-size:13px;line-height:1.6;">If the button doesn’t open, copy and paste this link into your browser:<br /><span style="color:#ffffff;word-break:break-all;">${params.contractLink}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 30px;color:#9fb0c5;font-size:13px;line-height:1.6;border-top:1px solid #243247;">
              <strong style="color:#ffffff;">CredX</strong><br />
              Credit Repair & Financial Strategy Support<br />
              Sent from hello@credxme.com
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0d1420;font-family:Arial,Helvetica,sans-serif;color:#e9eef6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d1420;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#111a28;border:1px solid #243247;border-radius:18px;overflow:hidden;">
        <tr><td style="height:6px;background:#00c6fb;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 28px 22px;text-align:center;border-bottom:1px solid #243247;">
          <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:0.03em;">CredX</div>
          <div style="margin-top:8px;color:#c8d3e1;font-size:14px;">5-Day Masterclass</div>
        </td></tr>
        <tr><td style="padding:30px 28px 8px;">
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#ffffff;">You're enrolled, ${params.firstName || 'there'}.</h1>
          <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Welcome to the CredX 5-Day Credit Repair Masterclass. No contracts, no intake forms — just set your password and you're in.</p>
          <p style="margin:0 0 18px;color:#d5dfeb;font-size:16px;line-height:1.65;"><strong style="color:#ffffff;">Day 1: Credit Fundamentals</strong> is waiting for you the moment you log in.</p>
          <div style="text-align:center;padding:14px 0 6px;">
            <a href="${params.setupLink}" style="display:inline-block;background:#00c6fb;color:#0d1420;text-decoration:none;padding:15px 30px;border-radius:12px;font-weight:800;font-size:16px;">Set my password</a>
          </div>
          <p style="margin:18px 0 6px;color:#9fb0c5;font-size:13px;line-height:1.6;">This link expires in about ${expiresHours} hours and can only be used once.</p>
          <p style="margin:6px 0 0;color:#9fb0c5;font-size:13px;line-height:1.6;">If the button doesn't open, copy this link into your browser:<br /><span style="color:#ffffff;word-break:break-all;">${params.setupLink}</span></p>
        </td></tr>
        <tr><td style="padding:22px 28px 28px;color:#9fb0c5;font-size:13px;line-height:1.6;border-top:1px solid #243247;">
          <strong style="color:#ffffff;">What's next:</strong>
          <ol style="margin:8px 0 0 18px;padding:0;color:#d5dfeb;">
            <li>Click the button above and set your password.</li>
            <li>You'll land on Day 1 automatically.</li>
            <li>Work through one day at a time at your own pace.</li>
          </ol>
          <p style="margin:18px 0 0;color:#9fb0c5;font-size:12px;">Questions? Reply to this email or write to <a href="mailto:contact@credxme.com" style="color:#00c6fb;">contact@credxme.com</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#0d1420;font-family:Arial,Helvetica,sans-serif;color:#e9eef6;">
  <div style="width:100%;background:#0d1420;padding:32px 16px;">
    <div style="max-width:640px;margin:0 auto;background:#111a28;border:1px solid #243247;border-radius:18px;overflow:hidden;">
      <div style="height:6px;background:#c9a227;"></div>
      <div style="background:linear-gradient(135deg,#111a28,#1b2739);padding:34px 32px 26px;text-align:center;border-bottom:1px solid #243247;">
        <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:0.03em;">CredX</div>
        <div style="margin-top:8px;color:#c8d3e1;font-size:14px;">Secure access to your client portal</div>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:26px;color:#ffffff;">${headline}</h1>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Hi ${params.firstName || 'there'},</p>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">${intro}</p>
        <div style="text-align:center;padding:18px 0 6px;">
          <a href="${params.setupLink}" style="display:inline-block;background:#c9a227;color:#111a28;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:800;font-size:16px;">${isReset ? 'Reset password' : 'Set my password'}</a>
        </div>
        <p style="margin:20px 0 8px;color:#9fb0c5;font-size:13px;line-height:1.6;">This link expires on ${expiresLabel}. For your security, it can only be used once.</p>
        <p style="margin:0 0 8px;color:#9fb0c5;font-size:13px;line-height:1.6;">If you didn't request this, you can safely ignore the email.</p>
      </div>
      <div style="padding:24px 32px 32px;color:#9fb0c5;font-size:13px;line-height:1.6;border-top:1px solid #243247;">
        <strong style="color:#ffffff;">CredX</strong><br />
        Credit Repair & Financial Strategy Support<br />
        Sent from hello@credxme.com
      </div>
    </div>
  </div>
</body>
</html>`;

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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0d1420;font-family:Arial,Helvetica,sans-serif;color:#e9eef6;">
  <div style="width:100%;background:#0d1420;padding:32px 16px;">
    <div style="max-width:640px;margin:0 auto;background:#111a28;border:1px solid #243247;border-radius:18px;overflow:hidden;">
      <div style="height:6px;background:#c9a227;"></div>
      <div style="background:linear-gradient(135deg,#111a28,#1b2739);padding:34px 32px 26px;text-align:center;border-bottom:1px solid #243247;">
        <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:0.03em;">CredX</div>
        <div style="margin-top:8px;color:#c8d3e1;font-size:14px;">Your portal is ready</div>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:26px;color:#ffffff;">You're all set, ${params.firstName || 'there'}.</h1>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Your contract is signed, your profile is on file, and your credit monitoring credentials are connected. Your CredX portal is ready.</p>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Before you can enter the portal, you need to create your password using the secure button below.</p>
        <div style="text-align:center;padding:18px 0 6px;">
          <a href="${params.setupLink}" style="display:inline-block;background:#c9a227;color:#111a28;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:800;font-size:16px;">Set my password</a>
        </div>
        <p style="margin:18px 0 8px;color:#d5dfeb;font-size:14px;line-height:1.6;">After your password is set, you can sign in to your portal here: <a href="${params.loginLink}" style="color:#c9a227;">${params.loginLink}</a></p>
        <p style="margin:12px 0 8px;color:#9fb0c5;font-size:13px;line-height:1.6;">If you ever need to reset it again, use this secure link: <a href="${params.setupLink}" style="color:#c9a227;">${params.setupLink}</a></p>
      </div>
      <div style="padding:24px 32px 32px;color:#9fb0c5;font-size:13px;line-height:1.6;border-top:1px solid #243247;">
        <strong style="color:#ffffff;">CredX</strong><br />
        Credit Repair & Financial Strategy Support<br />
        Sent from hello@credxme.com
      </div>
    </div>
  </div>
</body>
</html>`;

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
