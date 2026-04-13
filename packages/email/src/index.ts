import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function renderWelcomeLeadEmail(params: { firstName: string; contractLink: string }) {
  const htmlTemplate = readFileSync(join(__dirname, '../welcome-lead-email.html'), 'utf8');
  const textTemplate = readFileSync(join(__dirname, '../welcome-lead-email.txt'), 'utf8');

  const replacements: Record<string, string> = {
    '{{first_name}}': params.firstName,
    '{{contract_link}}': params.contractLink
  };

  const apply = (input: string) =>
    Object.entries(replacements).reduce((acc, [key, value]) => acc.split(key).join(value), input);

  return {
    subject: 'Welcome to CredX — Here’s Your Next Step',
    html: apply(htmlTemplate),
    text: apply(textTemplate)
  };
}
