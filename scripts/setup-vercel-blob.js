#!/usr/bin/env node
/**
 * Vercel Blob Storage Setup for CredX Document Uploads
 * 
 * This script configures Vercel Blob for persistent document storage.
 * Run after installing @vercel/blob
 */

const fs = require('fs');
const path = require('path');

console.log('=== Vercel Blob Setup for CredX ===\n');

// 1. Check if we're in the right directory
const apiDir = path.join(__dirname, '..', 'apps', 'api');
if (!fs.existsSync(apiDir)) {
  console.error('❌ Error: apps/api directory not found. Run from credx-platform root.');
  process.exit(1);
}

// 2. Check if @vercel/blob is installed
const packageJsonPath = path.join(apiDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const hasBlobDep = packageJson.dependencies?.['@vercel/blob'] || packageJson.devDependencies?.['@vercel/blob'];

if (!hasBlobDep) {
  console.log('📦 Installing @vercel/blob...');
  console.log('   Run: npm install @vercel/blob');
  console.log('   Or:  cd apps/api && npm install @vercel.blob\n');
} else {
  console.log('✅ @vercel/blob is already installed\n');
}

// 3. Environment variables needed
console.log('🔑 Required Environment Variables on Railway/Vercel:');
console.log('   BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token>');
console.log('   Get this from: https://vercel.com/dashboard/stores/blob\n');

// 4. Create the blob utility file
const blobUtilContent = `import { put, del, list } from '@vercel/blob';
import crypto from 'node:crypto';

/**
 * Vercel Blob storage for client documents
 * All files are encrypted in transit (HTTPS) and at rest by Vercel
 */

const BLOB_PREFIX = 'documents/';

export interface StoredDocument {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/**
 * Upload a document to Vercel Blob
 * @param fileBuffer - The file buffer
 * @param fileName - Original file name
 * @param contentType - MIME type
 * @param clientId - Client ID for path organization
 */
export async function uploadDocument(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  clientId: string
): Promise<StoredDocument> {
  // Sanitize filename and add random suffix for uniqueness
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueSuffix = crypto.randomBytes(8).toString('hex');
  const pathname = \`\${BLOB_PREFIX}\${clientId}/\${uniqueSuffix}_\${safeName}\`;

  const blob = await put(pathname, fileBuffer, {
    access: 'public', // Signed URLs can be added later if needed
    contentType,
    addRandomSuffix: false, // We already added our own
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType,
    size: fileBuffer.length,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Delete a document from Vercel Blob
 */
export async function deleteDocument(pathname: string): Promise<void> {
  await del(pathname);
}

/**
 * List documents for a client
 */
export async function listClientDocuments(clientId: string): Promise<StoredDocument[]> {
  const { blobs } = await list({
    prefix: \`\${BLOB_PREFIX}\${clientId}/\`,
  });

  return blobs.map((blob) => ({
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || 'application/octet-stream',
    size: blob.size,
    uploadedAt: blob.uploadedAt,
  }));
}
`;

const blobUtilPath = path.join(apiDir, 'src', 'lib', 'blob-storage.ts');
fs.writeFileSync(blobUtilPath, blobUtilContent);
console.log(`✅ Created: ${blobUtilPath}\n`);

// 5. Update the upload route to use Blob
console.log('📝 Next steps:');
console.log('   1. Install: npm install @vercel/blob');
console.log('   2. Add BLOB_READ_WRITE_TOKEN to Railway environment');
console.log('   3. Update your document upload route to use blob-storage.ts');
console.log('   4. Replace multer memoryStorage with Blob upload\n');

console.log('✅ Setup complete!');
