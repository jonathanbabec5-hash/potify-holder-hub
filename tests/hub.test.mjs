import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import {createApp,base58Encode,base58Decode,verifySolanaMessage,checkBalance} from '../server.mjs';

const MINT='GWdHGomLjqofUSrj3TEhinr2UaRJMzJ5o7MRZLaFpump';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function keypair(){const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');return {wallet:base58Encode(publicKey.export({type:'spki',format:'der'}).subarray(-32)),privateKey};}
function mockRpc(wallet,{broken=false}={}){
 return async(method)=>{
  if(broken)throw new Error('RPC unavailable');
  if(method==='getAccountInfo'){
   const mint=Buffer.alloc(82);mint[44]=6;mint[45]=1;
   return {value:{owner:TOKEN,data:[mint.toString('base64'),'base64']}};
  }
  if(method==='getTokenAccountsByOwner'){
   const make=amount=>{const data=Buffer.alloc(165);base58Decode(MINT).copy(data,0);base58Decode(wallet).copy(data,32);data.writeBigUInt64LE(amount,64);return {account:{owner:TOKEN,data:[data.toString('base64'),'base64']}};};
   return {value:[make(1500000n),make(2000000n)]};
  }
  throw new Error(`Unexpected ${method}`);
 };
}
async function start({adminWallets=[],rpcOverride}={}){
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const origin=`http://127.0.0.1:${port}`;const app=createApp({dbPath:':memory:',siteOrigin:origin,adminWallets,rpcOverride:rpcOverride||(async()=>{throw new Error('RPC not configured');})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 const request=async(url,method='GET',body=null,cookie='')=>{
  const res=await fetch(origin+url,{method,headers:{...(method==='POST'?{'Origin':origin,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body!==null?JSON.stringify(body):undefined});
  return {code:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
 };
 return {app,origin,request,stop:()=>new Promise(r=>app.server.close(()=>{app.db.close();r();}))};
}
async function login(ctx,k){
 const c=await ctx.request('/api/challenge','POST',{wallet:k.wallet});assert.equal(c.code,200);
 const {nonce,message}=c.data;
 const signature=crypto.sign(null,Buffer.from(message),k.privateKey).toString('base64');
 const response=await ctx.request('/api/verify','POST',{wallet:k.wallet,nonce,signature});
 return {response,nonce,message,signature};
}

test('base58 addresses and ed25519 message sign-in are correctly verified',()=>{
 const k=keypair();assert.equal(base58Decode(k.wallet).length,32);
 const msg='POTIFY wallet sign-in';const sig=crypto.sign(null,Buffer.from(msg),k.privateKey).toString('base64');
 assert.equal(verifySolanaMessage(k.wallet,msg,sig),true);
 assert.equal(verifySolanaMessage(k.wallet,msg+' tampered',sig),false);
 assert.equal(base58Encode(base58Decode(MINT)),MINT);
});

test('origin protection, signed login, replay lock, session and admin denied by default',async()=>{
 const k=keypair(),ctx=await start();
 try{
  const noAdmin=await ctx.request('/api/admin/submissions');assert.equal(noAdmin.code,401);
  const wrongOrigin=await fetch(ctx.origin+'/api/challenge',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({wallet:k.wallet})});
  assert.equal(wrongOrigin.status,403);
  const l=await login(ctx,k);assert.equal(l.response.code,200);assert.ok(l.response.cookie);
  const replay=await ctx.request('/api/verify','POST',{wallet:k.wallet,nonce:l.nonce,signature:l.signature});assert.equal(replay.code,401);
  const me=await ctx.request('/api/me','GET',null,l.response.cookie);assert.equal(me.data.wallet,k.wallet);
  const admin=await ctx.request('/api/admin/submissions','GET',null,l.response.cookie);assert.equal(admin.code,403);
  const logout=await ctx.request('/api/logout','POST',{},l.response.cookie);assert.equal(logout.code,200);
  const after=await ctx.request('/api/me','GET',null,l.response.cookie);assert.equal(after.data.authenticated,false);
 }finally{await ctx.stop();}
});

test('quest approval awards Seeds only once and duplicate submissions rejected',async()=>{
 const admin=keypair(),member=keypair(),ctx=await start({adminWallets:[admin.wallet]});
 try{
  const adminLogin=await login(ctx,admin),memberLogin=await login(ctx,member);
  const a=adminLogin.response.cookie,m=memberLogin.response.cookie;
  const denied=await ctx.request('/api/admin/quests','POST',{title:'Allowed',description:'A sufficiently long description',reward:25},m);assert.equal(denied.code,403);
  const quest=await ctx.request('/api/admin/quests','POST',{title:'Show your grow notes',description:'Submit an original observation or educational grow note.',reward:25},a);assert.equal(quest.code,201);
  const submission=await ctx.request('/api/submissions','POST',{questId:quest.data.id,evidence:'I observed leaf color changes and documented the condition.'},m);assert.equal(submission.code,201);
  const dup=await ctx.request('/api/submissions','POST',{questId:quest.data.id,evidence:'Same evidence repeated'},m);assert.equal(dup.code,409);
  const pending=await ctx.request('/api/admin/submissions','GET',null,a);assert.equal(pending.data.submissions.length,1);
  const id=pending.data.submissions[0].id;
  const reviewed=await ctx.request('/api/admin/review','POST',{id,decision:'approved',note:'Verified'},a);assert.equal(reviewed.code,200);
  const again=await ctx.request('/api/admin/review','POST',{id,decision:'approved',note:'Repeated'},a);assert.equal(again.code,409);
  const status=await ctx.request('/api/me','GET',null,m);assert.equal(status.data.seeds,25);assert.equal(status.data.submissions[0].status,'approved');
  const count=ctx.app.db.prepare('SELECT COUNT(*) AS n FROM seed_ledger').get().n;assert.equal(count,1);
 }finally{await ctx.stop();}
});

test('on-chain verification sums token accounts with exact bigint arithmetic',async()=>{
 const k=keypair(),amount=await checkBalance(k.wallet,mockRpc(k.wallet));
 assert.equal(amount.rawAmount,'3500000');assert.equal(amount.decimals,6);assert.equal(amount.mintProgram,TOKEN);
});

test('RPC outage returns unavailable instead of zero balance',async()=>{
 const k=keypair(),ctx=await start({rpcOverride:mockRpc(k.wallet,{broken:true})});
 try{const l=await login(ctx,k);const r=await ctx.request('/api/balance','GET',null,l.response.cookie);assert.equal(r.code,503);assert.equal(r.data.stale,true);assert.equal(r.data.status,'unavailable');assert.ok(!('rawAmount' in r.data));}
 finally{await ctx.stop();}
});

test('invalid wallet signature cannot sign in as another user',async()=>{
 const a=keypair(),b=keypair(),ctx=await start();
 try{const c=await ctx.request('/api/challenge','POST',{wallet:b.wallet});const signature=crypto.sign(null,Buffer.from(c.data.message),a.privateKey).toString('base64');const r=await ctx.request('/api/verify','POST',{wallet:b.wallet,nonce:c.data.nonce,signature});assert.equal(r.code,401);}
 finally{await ctx.stop();}
});
