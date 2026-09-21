import { Router } from 'express';
import { z } from 'zod';
import { suppressEmail, resubscribeEmail, isSuppressed } from '../lib/emailSuppression.js';
import { verifyUnsubscribeToken } from '../lib/unsubscribeToken.js';

export const unsubscribeRouter = Router();

/* Every endpoint here is deliberately unauthenticated: the whole point is that
   someone who never had an account, or who cannot log in, can still stop the
   mail. The token is the authorization.

   GET never changes state. Mail clients, link scanners and corporate security
   gateways prefetch every URL in a message, so a GET that unsubscribed would
   opt people out who never clicked. GET only reports status; POST acts. */

const tokenQuery = z.object({ token: z.string().min(1).max(512) });
const tokenBody = z.object({ token: z.string().min(1).max(512) });

function resolve(token: unknown): string | null {
  const parsed = tokenQuery.safeParse({ token });
  if (!parsed.success) return null;
  return verifyUnsubscribeToken(parsed.data.token);
}

/** Status probe for the confirmation page. Read-only. */
unsubscribeRouter.get('/', async (req, res, next) => {
  try {
    const email = resolve(req.query.token);
    if (!email) return res.status(400).json({ error: 'This unsubscribe link is invalid or incomplete.' });

    const suppressed = await isSuppressed(email);
    // The masked address lets someone confirm which inbox they are acting on
    // without turning a leaked link into an address disclosure.
    const [user, domain] = email.split('@');
    const masked = `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
    return res.json({ email: masked, status: suppressed ? 'unsubscribed' : 'subscribed' });
  } catch (error) {
    next(error);
  }
});

/** Confirmation-page action. */
unsubscribeRouter.post('/', async (req, res, next) => {
  try {
    const parsed = tokenBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'A valid unsubscribe token is required.' });

    const email = verifyUnsubscribeToken(parsed.data.token);
    if (!email) return res.status(400).json({ error: 'This unsubscribe link is invalid or incomplete.' });

    const result = await suppressEmail({ email, reason: 'USER_REQUEST', source: 'link' });
    return res.json({ status: 'unsubscribed', alreadyUnsubscribed: result.alreadySuppressed });
  } catch (error) {
    next(error);
  }
});

/* RFC 8058 one-click. Gmail and Yahoo require bulk senders to honour a POST to
   the List-Unsubscribe URL with no confirmation step and no redirect. The body
   is `List-Unsubscribe=One-Click`, form-encoded, and the token rides in the
   query string because the mail client sends nothing else. */
unsubscribeRouter.post('/one-click', async (req, res, next) => {
  try {
    const email = resolve(req.query.token);
    if (!email) return res.status(400).type('text/plain').send('Invalid unsubscribe link.');

    await suppressEmail({ email, reason: 'USER_REQUEST', source: 'one-click' });
    // Mail providers only read the status code here.
    return res.status(200).type('text/plain').send('Unsubscribed.');
  } catch (error) {
    next(error);
  }
});

/** Undo, for the "unsubscribed by mistake" case on the confirmation page. */
unsubscribeRouter.post('/resubscribe', async (req, res, next) => {
  try {
    const parsed = tokenBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'A valid unsubscribe token is required.' });

    const email = verifyUnsubscribeToken(parsed.data.token);
    if (!email) return res.status(400).json({ error: 'This unsubscribe link is invalid or incomplete.' });

    const changed = await resubscribeEmail(email);
    return res.json({ status: 'subscribed', changed });
  } catch (error) {
    next(error);
  }
});
