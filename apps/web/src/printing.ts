export function escapePrintHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } as Record<string, string>)[char]);
}

type ParsedDisputeAccount = {
  number: string;
  accountName: string;
  accountNumber: string;
  reason: string;
  issue: string;
};

function normalizeParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function parseDisputeLetterText(content: string): {
  recipient: string;
  intro: string[];
  accounts: ParsedDisputeAccount[];
  requests: string[];
  closing: string[];
} | null {
  const trimmed = content.trim();
  const dearMatch = trimmed.match(/^Dear\s+([^:\n]+):?/i);
  const accountMatches = [...trimmed.matchAll(/ACCOUNT #(\d+):\n([\s\S]*?)(?=\n\nACCOUNT #\d+:|\n\nUnder the Fair Credit Reporting Act|$)/g)];
  if (!dearMatch || !accountMatches.length) return null;

  const recipient = dearMatch[1].trim();
  const underMarker = '\n\nUnder the Fair Credit Reporting Act';
  const firstAccountIndex = trimmed.indexOf('ACCOUNT #1:');
  const requestIndex = trimmed.indexOf(underMarker);
  const introBlock = firstAccountIndex >= 0 ? trimmed.slice(dearMatch[0].length, firstAccountIndex).trim() : '';
  const requestBlock = requestIndex >= 0 ? trimmed.slice(requestIndex).trim() : '';

  const accounts = accountMatches.map((match) => {
    const block = match[2];
    const pull = (label: string) => {
      const found = block.match(new RegExp(`- ${label}:\\s*([^\\n]+)`));
      return found?.[1]?.trim() || '';
    };
    return {
      number: match[1],
      accountName: pull('Account Name'),
      accountNumber: pull('Account Number'),
      reason: pull('Reason for Dispute'),
      issue: pull('Issue')
    };
  });

  const requestParagraphs = normalizeParagraphs(requestBlock);
  const requestItems = [...requestBlock.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
  const closing = requestParagraphs.length >= 2 ? requestParagraphs.slice(-2) : [];

  return {
    recipient,
    intro: normalizeParagraphs(introBlock),
    accounts,
    requests: requestItems,
    closing
  };
}

export function renderPlainTextPrintHtml(title: string, content: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title>
<style>
  body{font-family:Arial,sans-serif;color:#111827;background:#fff;margin:0;padding:0.55in;font-size:13px;line-height:1.35;}
  pre{white-space:pre-wrap;font:13px/1.35 Arial,sans-serif;margin:0;}
  @page{margin:0.55in;}
  @media print{body{padding:0;}}
</style></head><body><pre>${escapePrintHtml(content)}</pre></body></html>`;
}

export function renderDisputeLetterPrintHtml(title: string, content: string): string {
  const parsed = parseDisputeLetterText(content);
  if (!parsed) return renderPlainTextPrintHtml(title, content);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const introHtml = parsed.intro.map((paragraph) => `<p>${escapePrintHtml(paragraph)}</p>`).join('');
  const requestsHtml = parsed.requests.length
    ? `<ol>${parsed.requests.map((item) => `<li>${escapePrintHtml(item)}</li>`).join('')}</ol>`
    : '';
  const closingHtml = parsed.closing.map((paragraph) => `<p>${escapePrintHtml(paragraph)}</p>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title>
<style>
  :root{--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--soft:#f8fafc;--brand:#00c6fb;}
  body{font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:#fff;margin:0;padding:0.65in;font-size:13.5px;line-height:1.58;}
  .letter{max-width:7.4in;margin:0 auto;}
  .brand{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid var(--line);}
  .brand-name{font:700 22px/1.1 Arial,sans-serif;letter-spacing:.04em;color:var(--ink);}
  .brand-sub{font:600 11px/1.2 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#0369a1;margin-top:4px;}
  .meta{text-align:right;font:12px/1.45 Arial,sans-serif;color:var(--muted);}
  .recipient{margin:16px 0 20px;font-size:14px;}
  p{margin:0 0 12px;}
  .section-title{margin:22px 0 10px;font:700 14px/1.2 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);}
  .account-card{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px;background:var(--soft);break-inside:avoid;}
  .account-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px;}
  .account-num{font:700 11px/1.1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#0369a1;}
  .account-name{font:700 15px/1.2 Arial,sans-serif;color:var(--ink);}
  .account-meta{font:12px/1.45 Arial,sans-serif;color:var(--muted);}
  .label{display:block;font:700 10px/1.1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px;}
  .field{margin-top:8px;}
  ol{margin:0 0 14px 18px;padding:0;}
  li{margin-bottom:6px;}
  .signature{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);}
  .signature .line{margin-top:22px;border-top:1px solid var(--ink);width:260px;max-width:100%;padding-top:6px;font:12px/1.4 Arial,sans-serif;color:var(--muted);}
  @page{margin:0.6in;}
  @media print{body{padding:0;} .account-card{box-shadow:none;}}
</style></head><body>
  <div class="letter">
    <div class="brand">
      <div>
        <div class="brand-name">CredX</div>
        <div class="brand-sub">Dispute Letter Format</div>
      </div>
      <div class="meta">
        <div>${escapePrintHtml(today)}</div>
        <div>${escapePrintHtml(title)}</div>
      </div>
    </div>

    <div class="recipient">
      <p><strong>Dear ${escapePrintHtml(parsed.recipient)}:</strong></p>
    </div>

    ${introHtml}

    <div class="section-title">Accounts in dispute</div>
    ${parsed.accounts.map((account) => `
      <section class="account-card">
        <div class="account-head">
          <div>
            <div class="account-num">Account #${escapePrintHtml(account.number)}</div>
            <div class="account-name">${escapePrintHtml(account.accountName || 'Account name pending')}</div>
          </div>
          <div class="account-meta">${escapePrintHtml(account.accountNumber || 'Account number pending')}</div>
        </div>
        <div class="field">
          <span class="label">Reason for dispute</span>
          <div>${escapePrintHtml(account.reason || 'Reason pending')}</div>
        </div>
        <div class="field">
          <span class="label">Issue reported</span>
          <div>${escapePrintHtml(account.issue || 'Issue pending')}</div>
        </div>
      </section>
    `).join('')}

    ${requestsHtml ? `<div class="section-title">Requested action</div>${requestsHtml}` : ''}
    ${closingHtml}

    <div class="signature">
      <p>Sincerely,</p>
      <div class="line">Consumer signature</div>
    </div>
  </div>
</body></html>`;
}

export function renderBestPrintHtml(title: string, content: string, options?: { preferDisputeLetter?: boolean }): string {
  if (options?.preferDisputeLetter !== false) {
    return renderDisputeLetterPrintHtml(title, content);
  }
  return renderPlainTextPrintHtml(title, content);
}
