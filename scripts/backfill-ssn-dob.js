#!/usr/bin/env node
/**
 * One-shot backfill script for legacy plaintext SSN/DOB rows.
 * Run on Railway production via: `railway run node scripts/backfill-ssn-dob.js`
 * Or copy into a Railway console and run.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

const PREFIX_GCM = 'gcm.v1:';

let cachedKey = null;

function loadKey() {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('PII_ENCRYPTION_KEY is required');
  }
  let buf;
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

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX_GCM);
}

function encryptPII(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  if (isEncrypted(plaintext)) return plaintext;
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX_GCM}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting SSN/DOB backfill...');
  console.log('PII_ENCRYPTION_KEY present:', !!process.env.PII_ENCRYPTION_KEY);
  
  const rows = await prisma.client.findMany({
    select: { id: true, ssnEncrypted: true, dobEncrypted: true },
    orderBy: { id: 'asc' }
  });
  
  console.log(`Found ${rows.length} client rows`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let alreadyEncrypted = 0;
  
  for (const c of rows) {
    const patch = {};
    
    if (c.ssnEncrypted && !isEncrypted(c.ssnEncrypted)) {
      patch.ssnEncrypted = encryptPII(c.ssnEncrypted);
    } else if (c.ssnEncrypted && isEncrypted(c.ssnEncrypted)) {
      alreadyEncrypted++;
    }
    
    if (c.dobEncrypted && !isEncrypted(c.dobEncrypted)) {
      patch.dobEncrypted = encryptPII(c.dobEncrypted);
    }
    
    if (Object.keys(patch).length) {
      try {
        await prisma.client.update({ where: { id: c.id }, data: patch });
        updated++;
        if (updated % 10 === 0) {
          console.log(`  Progress: ${updated} updated, ${skipped} skipped...`);
        }
      } catch (err) {
        errors++;
        console.error(`  ✗ Failed client ${c.id}:`, err.message);
      }
    } else {
      skipped++;
    }
  }
  
  console.log('\n✅ Backfill complete:');
  console.log(`  Updated:      ${updated}`);
  console.log(`  Skipped:      ${skipped} (no plaintext values)`);
  console.log(`  Already encrypted: ${alreadyEncrypted}`);
  console.log(`  Errors:       ${errors}`);
}

backfill()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
