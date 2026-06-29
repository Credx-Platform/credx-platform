import { put, del, list, issueSignedToken, presignUrl } from '@vercel/blob';
import crypto from 'node:crypto';

/**
 * Vercel Blob storage for client documents.
 * All files are uploaded as private blobs and served through short-lived
 * signed URLs so credit reports, IDs, and other PII are not publicly accessible.
 */

const BLOB_PREFIX = 'documents/';
const DEFAULT_SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_DELEGATION_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface StoredDocument {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/**
 * Upload a document to Vercel Blob as a private object.
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
    access: 'private',
    contentType,
    addRandomSuffix: false // We already added our own
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType,
    size: fileBuffer.length,
    uploadedAt: new Date().toISOString()
  };
}

/**
 * Generate a short-lived signed URL for a private blob.
 * The returned URL is valid for `validForMs` (default 15 minutes) and is
 * scoped to the exact pathname so it cannot be used to access other files.
 */
export async function getSignedDocumentUrl(
  pathname: string,
  validForMs: number = DEFAULT_SIGNED_URL_TTL_MS
): Promise<string> {
  const now = Date.now();
  const signedToken = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil: now + Math.max(validForMs, DEFAULT_DELEGATION_TTL_MS)
  });

  const { presignedUrl: url } = await presignUrl(signedToken, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil: now + validForMs
  });

  return url;
}

const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';

function looksLikeVercelBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function extractBlobPathname(value: string): string | null {
  if (value.startsWith(`${BLOB_PREFIX}`)) return value;
  if (!looksLikeVercelBlobUrl(value)) return null;
  try {
    const url = new URL(value);
    // Vercel Blob URLs are https://<storeId>.public.blob.vercel-storage.com/<pathname>
    // The pathname part of the URL is what we need (strip leading '/').
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

/**
 * Resolve a stored document reference (Vercel Blob pathname or full blob URL)
 * into a short-lived signed URL. Returns null for non-blob references such as
 * legacy local fallback keys.
 */
export async function getSignedUrlForStoredDocument(
  storageKey: string,
  validForMs: number = DEFAULT_SIGNED_URL_TTL_MS
): Promise<string | null> {
  const pathname = extractBlobPathname(storageKey);
  if (!pathname) return null;
  return getSignedDocumentUrl(pathname, validForMs);
}

/**
 * Delete a document from Vercel Blob
 */
export async function deleteDocument(pathname: string): Promise<void> {
  await del(pathname);
}

/**
 * List documents for a client. Returns metadata only; callers must use
 * `getSignedDocumentUrl()` to obtain a readable URL for private blobs.
 */
export async function listClientDocuments(clientId: string): Promise<StoredDocument[]> {
  const { blobs } = await list({
    prefix: `${BLOB_PREFIX}${clientId}/`
  });

  // list() doesn't return contentType; callers needing it should head(pathname).
  return blobs.map((blob) => ({
    url: blob.url,
    pathname: blob.pathname,
    contentType: 'application/octet-stream',
    size: blob.size,
    uploadedAt: blob.uploadedAt.toISOString()
  }));
}
