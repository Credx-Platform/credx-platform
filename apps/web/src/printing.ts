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

type ParsedDisputeLetter = {
  profileLines: string[];
  addressLines: string[];
  dateLine: string | null;
  recipient: string;
  preAccountLabel: string | null;
  intro: string[];
  accounts: ParsedDisputeAccount[];
  requests: string[];
  closing: string[];
  checklist: string[];
};

function normalizeParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function compactBlankLines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseDisputeLetterText(content: string): ParsedDisputeLetter | null {
  const trimmed = compactBlankLines(content);
  const lines = trimmed.split('\n');
  const dearIndex = lines.findIndex((line) => /^Dear\s+.+:?$/i.test(line.trim()));
  const firstAccountIndex = lines.findIndex((line) => /^ACCOUNT #\d+:/i.test(line.trim()));
  if (dearIndex === -1 || firstAccountIndex === -1) return null;

  const recipient = lines[dearIndex].replace(/^Dear\s+/i, '').replace(/:$/, '').trim();
  const headerLines = lines.slice(0, dearIndex).map((line) => line.trim()).filter(Boolean);
  const profileLines = headerLines.filter((line) => /^(Full name|Current address|SSN|Date of birth):/i.test(line));
  const dateLine = headerLines.find((line) => /^Date:/i.test(line)) || null;
  const addressLines = headerLines.filter((line) => !profileLines.includes(line) && line !== dateLine);

  const preAccountLines = lines.slice(dearIndex + 1, firstAccountIndex).map((line) => line.trim()).filter(Boolean);
  const preAccountLabel = preAccountLines[0]?.endsWith(':') ? preAccountLines[0] : null;
  const intro = preAccountLabel ? preAccountLines.slice(1) : preAccountLines;

  const accountSection = lines.slice(firstAccountIndex).join('\n');
  const accountMatches = [...accountSection.matchAll(/ACCOUNT #(\d+):\n([\s\S]*?)(?=\n\nACCOUNT #\d+:|\n(?:I am writing to formally dispute|Under the Fair Credit Reporting Act|Please send all reinvestigation results|Mailing enclosure checklist:|Sincerely,)|$)/g)];
  if (!accountMatches.length) return null;

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

  const afterAccountsIndex = accountSection.lastIndexOf(accountMatches[accountMatches.length - 1][0]) + accountMatches[accountMatches.length - 1][0].length;
  const trailingBlock = compactBlankLines(accountSection.slice(afterAccountsIndex));
  const trailingParagraphs = normalizeParagraphs(trailingBlock);
  const checklistIndex = trailingParagraphs.findIndex((paragraph) => /^Mailing enclosure checklist:/i.test(paragraph));
  const signatureIndex = trailingParagraphs.findIndex((paragraph) => /^Sincerely,/i.test(paragraph));

  const closingEnd = signatureIndex >= 0 ? signatureIndex : (checklistIndex >= 0 ? checklistIndex : trailingParagraphs.length);
  const closing = trailingParagraphs.slice(0, closingEnd);

  const requestItems = [...trailingBlock.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
  const checklistSource = checklistIndex >= 0 ? trailingParagraphs.slice(checklistIndex).join('\n') : '';
  const checklist = checklistSource
    ? checklistSource.split('\n').map((line) => line.trim()).filter(Boolean)
    : [];

  return {
    profileLines,
    addressLines,
    dateLine,
    recipient,
    preAccountLabel,
    intro,
    accounts,
    requests: requestItems,
    closing,
    checklist
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
  const profileHtml = parsed.profileLines.length
    ? `<div class="profile-block">${parsed.profileLines.map((line) => `<div>${escapePrintHtml(line)}</div>`).join('')}</div>`
    : '';
  const addressHtml = parsed.addressLines.length
    ? `<div class="address-block">${parsed.addressLines.map((line) => `<div>${escapePrintHtml(line)}</div>`).join('')}</div>`
    : '';
  const dateHtml = parsed.dateLine || `Date: ${today}`;
  const introHtml = parsed.intro.map((paragraph) => `<p>${escapePrintHtml(paragraph)}</p>`).join('');
  const requestsHtml = parsed.requests.length
    ? `<ol class="request-list">${parsed.requests.map((item) => `<li>${escapePrintHtml(item)}</li>`).join('')}</ol>`
    : '';
  const closingHtml = parsed.closing.map((paragraph) => `<p>${escapePrintHtml(paragraph)}</p>`).join('');
  const checklistHtml = parsed.checklist.length
    ? `<div class="checklist">${parsed.checklist.map((line) => `<div>${escapePrintHtml(line)}</div>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title>
<style>
  body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;padding:0.62in;font-size:13px;line-height:1.48;}
  .letter{max-width:7.35in;margin:0 auto;}
  .profile-block,.address-block,.date-line,.salutation,.label-line,.closing,.checklist{margin-bottom:12px;}
  .profile-block div,.address-block div,.date-line,.label-line div,.checklist div{margin:0 0 2px;}
  p{margin:0 0 12px;}
  .account-block{margin:0 0 16px;break-inside:avoid;page-break-inside:avoid;}
  .account-block .line{margin:0 0 3px;}
  .line strong{font-weight:700;}
  .request-list{margin:0 0 14px 18px;padding:0;}
  .request-list li{margin:0 0 6px;}
  .signature-space{height:34px;}
  @page{margin:0.6in;}
  @media print{body{padding:0;}}
</style></head><body>
  <div class="letter">
    ${profileHtml}
    ${addressHtml}
    <div class="date-line">${escapePrintHtml(dateHtml)}</div>
    <div class="salutation">Dear ${escapePrintHtml(parsed.recipient)}:</div>
    ${parsed.preAccountLabel ? `<div class="label-line">${escapePrintHtml(parsed.preAccountLabel)}</div>` : ''}
    ${introHtml}

    ${parsed.accounts.map((account) => `
      <div class="account-block">
        <div class="line"><strong>ACCOUNT #${escapePrintHtml(account.number)}:</strong></div>
        <div class="line">- <strong>Account Name:</strong> ${escapePrintHtml(account.accountName || 'Account name pending')}</div>
        <div class="line">- <strong>Account Number:</strong> ${escapePrintHtml(account.accountNumber || 'Account number pending')}</div>
        <div class="line">- <strong>Reason for Dispute:</strong> ${escapePrintHtml(account.reason || 'Reason pending')}</div>
        <div class="line">- <strong>Issue:</strong> ${escapePrintHtml(account.issue || 'Issue pending')}</div>
      </div>
    `).join('')}

    ${requestsHtml}
    <div class="closing">${closingHtml}</div>
    <div>Sincerely,</div>
    <div class="signature-space"></div>
    ${checklistHtml}
  </div>
</body></html>`;
}

export function renderBestPrintHtml(title: string, content: string, options?: { preferDisputeLetter?: boolean }): string {
  if (options?.preferDisputeLetter !== false) {
    return renderDisputeLetterPrintHtml(title, content);
  }
  return renderPlainTextPrintHtml(title, content);
}
