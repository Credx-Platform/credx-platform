import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const responseIngestRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are a credit-repair compliance analyst reading a credit bureau response letter.
Classify the response and extract structured findings. Return STRICT JSON matching this schema:
{
  "bureau": "equifax" | "experian" | "transunion" | "unknown",
  "outcomes": [
    {
      "account": string,
      "decision": "deleted" | "verified" | "updated" | "in_progress" | "unknown",
      "reason": string,
      "needsMov": boolean
    }
  ],
  "overallDecision": "deleted" | "partially_resolved" | "verified" | "no_response" | "needs_mov" | "unknown",
  "summary": string,
  "recommendation": string,
  "extractedText": string
}
Rules:
- "needsMov" is true when the bureau says "verified" without disclosing the method or furnisher contact.
- "overallDecision" reflects the strongest signal across outcomes.
- Keep "summary" under 240 chars; "extractedText" can hold the cleaned letter body.
- Do not invent accounts. If unreadable, return outcomes: [] and overallDecision: "unknown".`;

function tryParseJson(text: string): any {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

responseIngestRouter.post('/classify', requireAuth, upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Vision model is not configured. Set ANTHROPIC_API_KEY on the API service.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Upload a PDF or image of the bureau response under field "file".' });
    }

    const mime = req.file.mimetype || 'application/octet-stream';
    const isPdf = mime === 'application/pdf';
    const isImage = mime.startsWith('image/');
    if (!isPdf && !isImage) {
      return res.status(400).json({ error: 'Only PDF or image files are supported.' });
    }
    const base64 = req.file.buffer.toString('base64');
    const documentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };

    const anthropicResp = await fetch(ANTHROPIC_BASE, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              documentBlock,
              { type: 'text', text: 'Classify this credit bureau response and return JSON only.' }
            ]
          }
        ]
      })
    });

    const anthropicJson = (await anthropicResp.json()) as any;
    if (!anthropicResp.ok) {
      return res.status(anthropicResp.status).json({ error: anthropicJson?.error?.message || 'Vision call failed', details: anthropicJson });
    }

    const text = (anthropicJson?.content || []).map((c: any) => c?.text || '').join('\n');
    const parsed = tryParseJson(text);
    if (!parsed) {
      return res.status(502).json({ error: 'Could not parse vision model response', raw: text.slice(0, 1000) });
    }

    if (req.auth?.sub) {
      const client = await prisma.client.findUnique({ where: { userId: req.auth.sub } });
      if (client) {
        await prisma.activityEvent.create({
          data: {
            clientId: client.id,
            type: 'dispute.response.ingested',
            message: `Bureau response classified: ${parsed.overallDecision || 'unknown'} (${parsed.bureau || 'unknown'})`,
            metadata: { classification: parsed, fileName: req.file.originalname, mime } as any
          }
        });
      }
    }

    return res.json({ classification: parsed });
  } catch (err) {
    next(err);
  }
});
