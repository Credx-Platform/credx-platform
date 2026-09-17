import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

export const RAILWAY_DOCUMENT_PREFIX = 'railway-documents/';
function store() {
  const endpoint = process.env.DOCUMENT_S3_ENDPOINT;
  const bucket = process.env.DOCUMENT_S3_BUCKET;
  const accessKeyId = process.env.DOCUMENT_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DOCUMENT_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Private document storage is not configured');
  if (new URL(endpoint).protocol !== 'https:') throw new Error('Private storage requires HTTPS');
  return { bucket, client: new S3Client({endpoint, region: process.env.DOCUMENT_S3_REGION || 'auto',
    forcePathStyle: process.env.DOCUMENT_S3_PATH_STYLE !== 'false', credentials:{accessKeyId,secretAccessKey}}) };
}
function clientPrefix(clientId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(clientId)) throw new Error('Invalid document owner');
  return `${RAILWAY_DOCUMENT_PREFIX}${clientId}/`;
}
function validKey(key: string) {
  if (!/^railway-documents\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(key)) throw new Error('Invalid document reference');
  return key;
}
export async function uploadRailwayDocument(buffer: Buffer, name: string, contentType: string, clientId: string) {
  const {client,bucket} = store();
  const pathname = `${clientPrefix(clientId)}${crypto.randomBytes(16).toString('hex')}_${name.replace(/[^a-zA-Z0-9.-]/g,'_').slice(-180) || 'document'}`;
  await client.send(new PutObjectCommand({Bucket:bucket,Key:pathname,Body:buffer,ContentType:contentType,
    ContentDisposition:'attachment',CacheControl:'private, no-store'}));
  return {url:pathname,pathname,contentType,size:buffer.length,uploadedAt:new Date().toISOString()};
}
export async function signRailwayDocument(key: string, ttlMs = 900000) {
  validKey(key);
  if (!Number.isFinite(ttlMs) || ttlMs < 1000 || ttlMs > 900000) throw new Error('Invalid document URL lifetime');
  const {client,bucket} = store();
  // Signing alone succeeds even for absent files. Verify existence first.
  await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key,ResponseContentDisposition:'attachment',ResponseCacheControl:'private, no-store'}),{expiresIn:Math.floor(ttlMs/1000)});
}
export async function deleteRailwayDocument(key: string) {
  validKey(key); const {client,bucket}=store();
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
}
export async function listRailwayDocuments(clientId: string) {
  const {client,bucket}=store(); const prefix=clientPrefix(clientId);
  const documents=[]; let continuationToken: string|undefined;
  do {
    const page=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix,ContinuationToken:continuationToken}));
    for(const item of page.Contents || []) if(item.Key) documents.push({url:item.Key,pathname:item.Key,contentType:'application/octet-stream',size:item.Size || 0,uploadedAt:item.LastModified?.toISOString() || ''});
    continuationToken=page.IsTruncated ? page.NextContinuationToken : undefined;
  } while(continuationToken);
  return documents;
}
