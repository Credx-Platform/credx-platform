import crypto from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for high-sensitivity PII (SSN, DOB).
 *
 * Storage format: `gcm.v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`
 * The `gcm.v1:` prefix lets us detect already-encrypted values and migrate
 * legacy plaintext rows without breaking decrypt() callers.
 *
 * Key source: PII_ENCRYPTION_KEY env (32 raw bytes, base64 or hex). When the
 * key is missing in non-production, encryption is a no-op and the value is
 * returned with a `plain.v0:` marker so dev workflows continue to work.
 */
const PREFIX_GCM = 'gcm.v1:';
const PREFIX_PLAIN = 'plain.v0:';

let cachedKey: Buffer | null | undefined;

function loadKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PII_ENCRYPTION_KEY is required in production');
    }
    cachedKey = null;
    return cachedKey;
  }
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, 'hex');
  } else {
    buf = Buffer.from(raw, 'base64');
  }
  if (buf.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must decode to 32 bytes (AES-256)');
  }
  cachedKey = buf;
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX_GCM);
}

export function encryptPII(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return null;
  if (isEncrypted(plaintext)) return plaintext;
  const key = loadKey();
  if (!key) return `${PREFIX_PLAIN}${plaintext}`;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX_GCM}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptPII(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value.startsWith(PREFIX_PLAIN)) return value.slice(PREFIX_PLAIN.length);
  if (!value.startsWith(PREFIX_GCM)) {
    // Legacy plaintext (pre-migration). Return as-is; caller decides whether
    // to log or trigger a one-time re-encrypt.
    return value;
  }
  const key = loadKey();
  if (!key) throw new Error('PII_ENCRYPTION_KEY required to decrypt stored value');
  const body = value.slice(PREFIX_GCM.length);
  const [ivB64, tagB64, ctB64] = body.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted PII envelope');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function maskSSN(ssn: string | null | undefined): string {
  if (!ssn) return '***-**-****';
  const digits = ssn.replace(/\D/g, '');
  if (digits.length < 4) return '***-**-****';
  return `***-**-${digits.slice(-4)}`;
}
