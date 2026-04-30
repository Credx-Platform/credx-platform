import type { Bureau } from '@prisma/client';
import { callAiGateway, extractJsonObject } from './aiGateway.js';

export interface ExtractedTradeline {
  creditorName: string;
  accountNumber: string | null;
  accountType: string | null;
  status: string | null;
  balance: number | null;
  isNegative: boolean;
}

export interface ExtractedBureauReport {
  bureau: Bureau;
  pulledAt?: string | null;
  tradelines: ExtractedTradeline[];
}

export interface ExtractedReport {
  bureauReports: ExtractedBureauReport[];
  rawPayload: unknown;
  source: string;
}

const MAX_TEXT_CHARS = 60_000;

async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse');
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default
    ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const result = await pdfParse(buffer);
  return result.text || '';
}

function htmlBufferToText(buffer: Buffer): string {
  const html = buffer.toString('utf8');
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS) + '\n[...truncated]';
}

const SYSTEM_PROMPT = `You are a credit report parser. You extract structured tradeline data from raw credit report text (PDF or HTML, multi-bureau or single-bureau). Return a single JSON object only, no prose.

Output schema:
{
  "bureauReports": [
    {
      "bureau": "EQUIFAX" | "EXPERIAN" | "TRANSUNION",
      "pulledAt": "YYYY-MM-DD" | null,
      "tradelines": [
        {
          "creditorName": string,
          "accountNumber": string | null,   // last 4 only if available, else null
          "accountType": string | null,     // e.g. "Credit Card", "Auto Loan", "Collection", "Charge Off", "Educational"
          "status": string | null,          // e.g. "Open", "Closed", "Charge Off", "Collection", "Paid"
          "balance": number | null,         // numeric balance in USD, null if unknown
          "isNegative": boolean             // true if charge-off, collection, late, derogatory, repossession, foreclosure, judgment, lien, bankruptcy
        }
      ]
    }
  ]
}

Rules:
- Only output the JSON object. No commentary, no fences.
- If a bureau is not present in the report, omit it from bureauReports.
- One entry per bureau per account. If the same account appears under all 3 bureaus, list it 3 times under the respective bureau entries.
- Balances: extract numeric value only (no $ or commas).
- isNegative=true ONLY for derogatory items (charge-offs, collections, late, repos, foreclosures, judgments, liens, bankruptcies). Open/Closed in good standing = false.
- If a value is uncertain or missing, use null.`;

const USER_PROMPT_TEMPLATE = (text: string) =>
  `Extract structured data from this credit report. Return JSON only.\n\n---\n${text}\n---`;

export async function extractReport(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<ExtractedReport | null> {
  const ext = input.filename.toLowerCase().split('.').pop() || '';
  const isPdf = input.mimeType === 'application/pdf' || ext === 'pdf';
  const isHtml = input.mimeType === 'text/html' || ext === 'html' || ext === 'htm';

  if (!isPdf && !isHtml) return null;

  let text = '';
  try {
    text = isPdf ? await pdfBufferToText(input.buffer) : htmlBufferToText(input.buffer);
  } catch (error) {
    console.error('[reportExtractor] failed to extract text:', (error as Error).message);
    return null;
  }

  if (!text || text.trim().length < 200) {
    console.warn('[reportExtractor] extracted text too short, skipping LLM call');
    return null;
  }

  const clipped = clampText(text);
  const result = await callAiGateway({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT_TEMPLATE(clipped),
    maxTokens: 6000,
    temperature: 0.1
  });

  if (!result) return null;

  const parsed = extractJsonObject(result.text) as { bureauReports?: ExtractedBureauReport[] } | null;
  if (!parsed?.bureauReports?.length) {
    console.warn('[reportExtractor] LLM returned no parseable bureauReports');
    return null;
  }

  const bureauReports: ExtractedBureauReport[] = [];
  const validBureaus = new Set<Bureau>(['EQUIFAX', 'EXPERIAN', 'TRANSUNION']);

  for (const entry of parsed.bureauReports) {
    if (!entry || typeof entry !== 'object') continue;
    if (!validBureaus.has(entry.bureau as Bureau)) continue;

    const tradelines: ExtractedTradeline[] = [];
    for (const t of entry.tradelines || []) {
      if (!t || typeof t.creditorName !== 'string' || !t.creditorName.trim()) continue;
      tradelines.push({
        creditorName: t.creditorName.trim().slice(0, 200),
        accountNumber: typeof t.accountNumber === 'string' ? t.accountNumber.trim().slice(0, 32) : null,
        accountType: typeof t.accountType === 'string' ? t.accountType.trim().slice(0, 64) : null,
        status: typeof t.status === 'string' ? t.status.trim().slice(0, 64) : null,
        balance: typeof t.balance === 'number' && Number.isFinite(t.balance) ? t.balance : null,
        isNegative: Boolean(t.isNegative)
      });
    }

    bureauReports.push({
      bureau: entry.bureau as Bureau,
      pulledAt: typeof entry.pulledAt === 'string' ? entry.pulledAt : null,
      tradelines
    });
  }

  if (!bureauReports.length) return null;

  return {
    bureauReports,
    rawPayload: parsed,
    source: `ai-gateway:${result.model}`
  };
}
