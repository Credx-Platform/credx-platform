import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ImapFlow } from 'imapflow';

const statePath = process.env.CREDX_EMAIL_CRON_STATE
  || '/home/ubuntu/.openclaw/workspace/memory/credx-email-cron-state.json';
const maxMessages = Number(process.env.CREDX_EMAIL_CRON_MAX || 5);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return { lastUid: 0 };
  }
}

async function writeState(state) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function cleanText(value, limit = 420) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

const client = new ImapFlow({
  host: requireEnv('IMAP_HOST'),
  port: Number(process.env.IMAP_PORT || 993),
  secure: process.env.IMAP_SECURE !== 'false',
  auth: {
    user: requireEnv('IMAP_USER'),
    pass: requireEnv('IMAP_PASS')
  },
  logger: false
});

const state = await readState();
let lock;

try {
  await client.connect();
  lock = await client.getMailboxLock('INBOX');
  const mailbox = client.mailbox;
  const lastUid = Number(state.lastUid || 0);
  const currentUidNext = Number(mailbox.uidNext || 1);

  if (!lastUid) {
    await writeState({
      lastUid: Math.max(0, currentUidNext - 1),
      initializedAt: new Date().toISOString()
    });
    console.log(JSON.stringify({ initialized: true, newMessages: [] }));
    process.exit(0);
  }

  const found = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
  const uids = found
    .filter((uid) => Number(uid) > lastUid)
    .sort((a, b) => Number(a) - Number(b))
    .slice(0, maxMessages);

  const newMessages = [];
  let highestUid = lastUid;

  for await (const msg of client.fetch(uids, {
    uid: true,
    envelope: true,
    bodyStructure: true,
    source: { start: 0, maxLength: 1200 }
  }, { uid: true })) {
    highestUid = Math.max(highestUid, Number(msg.uid || 0));
    const from = msg.envelope?.from?.map((entry) => {
      const name = entry.name ? `${entry.name} ` : '';
      return `${name}<${entry.address}>`.trim();
    }).join(', ') || 'Unknown sender';
    const subject = msg.envelope?.subject || '(no subject)';
    const date = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null;
    const raw = Buffer.isBuffer(msg.source) ? msg.source.toString('utf8') : String(msg.source || '');
    const textish = raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^[-\w]+:.*$/gm, ' ');

    newMessages.push({
      uid: Number(msg.uid),
      from,
      subject,
      date,
      snippet: cleanText(textish)
    });
  }

  if (highestUid > lastUid) {
    await writeState({
      lastUid: highestUid,
      checkedAt: new Date().toISOString()
    });
  }

  console.log(JSON.stringify({ initialized: false, newMessages }, null, 2));
} finally {
  if (lock) lock.release();
  await client.logout().catch(() => {});
}
