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

  console.log('WELCOME_EMAIL_PREVIEW', {
    to: params.email,
    subject: email.subject,
    contractLink: params.contractLink
  });

  return email;
}

export async function notifyNewLead(params: { firstName: string; lastName: string; email: string; phone?: string }) {
  console.log('NEW_LEAD_NOTIFICATION_PREVIEW', {
    to: 'jmalloy@credxme.com',
    lead: params
  });
}
