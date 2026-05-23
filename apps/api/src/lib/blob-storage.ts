import { put, del, list } from '@vercel/blob';
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
  const pathname = `${BLOB_PREFIX}${clientId}/${uniqueSuffix}_${safeName}`;

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
    prefix: `${BLOB_PREFIX}${clientId}/`,
  });

  // list() doesn't return contentType; callers needing it should head(pathname).
  return blobs.map((blob) => ({
    url: blob.url,
    pathname: blob.pathname,
    contentType: 'application/octet-stream',
    size: blob.size,
    uploadedAt: blob.uploadedAt.toISOString(),
  }));
}
