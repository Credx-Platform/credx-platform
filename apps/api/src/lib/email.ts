import { Resend } from 'resend';

function renderWelcomeLeadEmail(params: { firstName: string; contractLink: string }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to CredX</title>
</head>
<body style="margin:0;padding:0;background:#0d1420;font-family:Arial,Helvetica,sans-serif;color:#e9eef6;">
  <div style="width:100%;background:#0d1420;padding:32px 16px;">
    <div style="max-width:640px;margin:0 auto;background:#111a28;border:1px solid #243247;border-radius:18px;overflow:hidden;">
      <div style="height:6px;background:#c9a227;"></div>
      <div style="background:linear-gradient(135deg,#111a28,#1b2739);padding:34px 32px 26px;text-align:center;border-bottom:1px solid #243247;">
        <div style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:0.03em;">CredX</div>
        <div style="margin-top:8px;color:#c8d3e1;font-size:14px;">Credit Repair & Financial Strategy Support</div>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:28px;color:#ffffff;">Welcome to CredX</h1>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Hi ${params.firstName},</p>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Welcome to CredX. We’re excited to support you on your credit repair and financial rebuilding journey.</p>
        <p style="margin:0 0 14px;color:#d5dfeb;font-size:16px;line-height:1.65;">Your inquiry has been received, and the next step is to complete your CredX service agreement so we can begin your onboarding process properly.</p>
        <div style="margin:24px 0;display:grid;gap:14px;">
          <div style="padding:14px 16px;background:#162132;border:1px solid #243247;border-radius:12px;color:#e9eef6;"><strong>1.</strong> Review and sign your CredX contract.</div>
          <div style="padding:14px 16px;background:#162132;border:1px solid #243247;border-radius:12px;color:#e9eef6;"><strong>2.</strong> Prepare your most recent credit report.</div>
          <div style="padding:14px 16px;background:#162132;border:1px solid #243247;border-radius:12px;color:#e9eef6;"><strong>3.</strong> Complete any requested intake details.</div>
          <div style="padding:14px 16px;background:#162132;border:1px solid #243247;border-radius:12px;color:#e9eef6;"><strong>4.</strong> Watch for your next CredX update.</div>
        </div>
        <div style="text-align:center;padding:10px 0 4px;">
          <a href="${params.contractLink}" style="display:inline-block;background:#6b7280;color:#ffffff;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:800;font-size:16px;border:1px solid #7a8290;">Complete Your Signup</a>
        </div>
        <div style="margin-top:22px;padding:16px 18px;background:#0f1826;border:1px solid #243247;border-radius:12px;color:#c8d3e1;font-size:14px;">
          If you have any questions, simply reply to this email and the CredX team will help you.
        </div>
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

  const text = `Subject: Welcome to CredX — Here’s Your Next Step

Hi ${params.firstName},

Welcome to CredX.

We’re excited to support you on your credit repair and financial rebuilding journey. Your inquiry has been received, and the next step is to complete your CredX service agreement so we can begin your onboarding process properly.

Next Steps:
1. Review and sign your CredX contract.
2. Prepare your most recent credit report.
3. Complete any requested intake details.
4. Watch for your next CredX update.

Complete Your Signup:
${params.contractLink}

If you have any questions, simply reply to this email and the CredX team will help you.

CredX
Credit Repair & Financial Strategy Support
Sent from hello@credxme.com`;

  return {
    subject: 'Welcome to CredX — Here’s Your Next Step',
    html,
    text
  };
}

export async function sendWelcomeLeadEmail(params: { firstName: string; email: string; contractLink: string }) {
  const email = renderWelcomeLeadEmail({
    firstName: params.firstName,
    contractLink: params.contractLink
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

      if (result.error) {
        console.warn('RESEND_SEND_FAILED', result.error);
        return { skipped: true, reason: `RESEND_SEND_FAILED:${JSON.stringify(result.error)}` };
      }

      return { id: result.data?.id, provider: 'resend' };
    } catch (error) {
      console.warn('RESEND_EXCEPTION', error instanceof Error ? error.message : String(error));
      return { skipped: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  if (!sendgridApiKey) {
    console.log('EMAIL_PREVIEW', { to: params.to, subject: params.subject, reason: 'No email provider configured' });
    return { skipped: true, reason: 'No email provider configured' };
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
      console.warn('SENDGRID_SEND_FAILED', response.status, body);
      return { skipped: true, reason: `SENDGRID_SEND_FAILED:${response.status}:${body}` };
    }

    return { id: response.headers.get('x-message-id') || 'sendgrid-accepted', provider: 'sendgrid' };
  } catch (error) {
    console.warn('SENDGRID_EXCEPTION', error instanceof Error ? error.message : String(error));
    return { skipped: true, reason: error instanceof Error ? error.message : String(error) };
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
