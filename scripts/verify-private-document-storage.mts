// Synthetic provider check. Credentials must be supplied privately in the environment.
import assert from 'node:assert/strict';
import { uploadDocument, getSignedUrlForStoredDocument, deleteDocument } from '../apps/api/src/lib/blob-storage.js';
const bytes=Buffer.from('CredX synthetic private storage verification. No customer data.');
let key: string|undefined;
try {
  const uploaded=await uploadDocument(bytes,'storage-check.txt','text/plain','storage-verification');
  key=uploaded.pathname;
  assert.ok(key.startsWith('railway-documents/'));
  const url=await getSignedUrlForStoredDocument(key,60000);
  assert.ok(url);
  const read=await fetch(url);
  assert.equal(read.status,200);
  assert.deepEqual(Buffer.from(await read.arrayBuffer()),bytes);
  const unsigned=new URL(url); unsigned.search='';
  const denied=await fetch(unsigned);
  assert.ok([401,403].includes(denied.status),'Unsigned file access must be denied');
  const tampered=new URL(url);tampered.pathname += '-different';
  assert.ok([401,403,404].includes((await fetch(tampered)).status));
  await deleteDocument(key);
  await assert.rejects(()=>getSignedUrlForStoredDocument(key!), (error:any)=>error?.$metadata?.httpStatusCode===404);
  key=undefined;
  console.log('PASS: real Railway upload, exact-byte signed download, unsigned denial, tamper denial, and missing-file detection. Synthetic object removed.');
} catch {
  console.error('FAIL: private document provider verification (details withheld to protect signed URLs).');
  process.exitCode=1;
} finally {if(key) await deleteDocument(key).catch(()=>{console.error('Synthetic object cleanup requires retry');});}
