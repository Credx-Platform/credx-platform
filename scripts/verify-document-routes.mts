// Runs only against a disposable local database and synthetic Railway objects.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
const db = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.ok(['127.0.0.1','localhost'].includes(db.hostname));
assert.ok(db.pathname.includes('document_release'));
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
const {prisma} = await import('../apps/api/src/lib/prisma.js');
const {progressRouter} = await import('../apps/api/src/routes/progress.js');
const {clientsRouter} = await import('../apps/api/src/routes/clients.js');
const {deleteDocument} = await import('../apps/api/src/lib/blob-storage.js');
const app=express();app.use(express.json());app.use('/progress',progressRouter);app.use('/clients',clientsRouter);
app.use((_e:any,_q:any,r:any,_n:any)=>r.status(500).json({error:'Test route error'}));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const users:any[]=[];let key:string|undefined;
try {
 for(let i=0;i<2;i++) users.push(await prisma.user.create({data:{email:`document-${crypto.randomUUID()}@example.invalid`,passwordHash:'synthetic',firstName:'Synthetic',lastName:'Storage',client:{create:{progress:{create:{}}}}},include:{client:true}}));
 const headers=(i:number)=>({authorization:`Bearer ${jwt.sign({sub:users[i].id,role:'CLIENT'},process.env.JWT_SECRET!)}`});
 assert.equal((await fetch(base+'/progress/me/docs',{method:'POST'})).status,401);
 assert.equal((await fetch(base+'/progress/me/docs',{method:'POST',headers:{...headers(0),'Content-Type':'application/json'},body:JSON.stringify({name:'fake.pdf'})})).status,422);
 assert.equal(await prisma.document.count({where:{clientId:users[0].client.id}}),0);
 const bytes=Buffer.from('Synthetic verification image bytes; no customer information');
 const body=new FormData();body.append('file',new Blob([bytes],{type:'image/png'}),'synthetic-storage.png');body.append('type','identity');
 const upload=await fetch(base+'/progress/me/docs/upload',{method:'POST',headers:headers(0),body});assert.equal(upload.status,200);
 const doc=await prisma.document.findFirstOrThrow({where:{clientId:users[0].client.id}});key=doc.s3Key;assert.ok(key.startsWith('railway-documents/'));
 const path=base+`/clients/me/documents/${doc.id}/print`;
 assert.equal((await fetch(path)).status,401);
 assert.equal((await fetch(path,{headers:headers(1)})).status,404);
 const read=await fetch(path,{headers:headers(0)});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'private, no-store');
 const data=await read.json();assert.deepEqual(Buffer.from(await (await fetch(data.url)).arrayBuffer()),bytes);
 await deleteDocument(key);key=undefined;
 assert.equal((await fetch(path,{headers:headers(0)})).status,410);
 await prisma.document.update({where:{id:doc.id},data:{s3Key:'secure/missing-original'}});
 assert.equal((await fetch(path,{headers:headers(0)})).status,410);
 console.log('PASS: real HTTP multipart upload + disposable DB + Railway exact-byte download; unauthenticated 401; other-owner 404; metadata upload 422/no record; missing/legacy files 410; private cache headers.');
} catch(e) {console.error('FAIL: document HTTP verification:',e instanceof assert.AssertionError ? e.message : 'details suppressed');process.exitCode=1;}
finally {if(key)await deleteDocument(key).catch(()=>{});for(const u of users){await prisma.document.deleteMany({where:{clientId:u.client.id}});await prisma.activityEvent.deleteMany({where:{clientId:u.client.id}});await prisma.client.delete({where:{id:u.client.id}});await prisma.user.delete({where:{id:u.id}});}await prisma.$disconnect();server.close();}
