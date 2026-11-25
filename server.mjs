import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MINT = 'GWdHGomLjqofUSrj3TEhinr2UaRJMzJ5o7MRZLaFpump';
const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFwjxMz9ETiz7q7R';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100','hex');
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

export function base58Encode(buf) {
  let num = BigInt('0x' + Buffer.from(buf).toString('hex'));
  let out = '';
  while(num > 0n){out = ALPHABET[Number(num % 58n)] + out;num /= 58n;}
  for(const n of buf){if(n===0)out = '1'+out;else break;}
  return out || '1';
}
export function base58Decode(value) {
  if(typeof value!=='string'||!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) throw new Error('Invalid base58');
  let num=0n;
  for(const ch of value){num=num*58n+BigInt(ALPHABET.indexOf(ch));}
  let hex=num.toString(16); if(hex.length%2)hex='0'+hex;
  let data = num===0n ? Buffer.alloc(0):Buffer.from(hex,'hex');
  const leading=value.match(/^1*/)?.[0]?.length || 0;
  return Buffer.concat([Buffer.alloc(leading),data]);
}
function assertWallet(value){
  const bytes=base58Decode(value);
  if(bytes.length!==32 || base58Encode(bytes)!==value) throw new Error('Invalid Solana wallet');
  return value;
}
export function verifySolanaMessage(wallet,message,signatureBase64){
  try{
    assertWallet(wallet);
    const sig=Buffer.from(signatureBase64,'base64');
    if(sig.length!==64 || sig.toString('base64')!==signatureBase64) return false;
    const key=crypto.createPublicKey({key:Buffer.concat([SPKI_PREFIX,base58Decode(wallet)]),format:'der',type:'spki'});
    return crypto.verify(null,Buffer.from(message,'utf8'),key,sig);
  }catch{return false;}
}
function parseCookies(raw=''){
  return Object.fromEntries(raw.split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2).map(([a,b])=>[a,b]));
}
const hash = x=>crypto.createHash('sha256').update(x).digest('hex');
const now = ()=>Date.now();
function json(res,code,obj,extra={}){
  const body=JSON.stringify(obj);
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),...extra});res.end(body);
}
async function bodyJson(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(new Error('JSON required'),{httpCode:415});
  let bytes=0,text='';
  for await(const part of req){bytes+=part.length;if(bytes>16384)throw Object.assign(new Error('Request too large'),{httpCode:413});text+=part.toString();}
  try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid JSON'),{httpCode:400});}
}
function makeDb(dbPath){
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS members(wallet TEXT PRIMARY KEY, joined_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges(nonce_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL REFERENCES members(wallet), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quests(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL, reward INTEGER NOT NULL CHECK(reward >= 0 AND reward <= 10000), active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL REFERENCES members(wallet), quest_id INTEGER NOT NULL REFERENCES quests(id), evidence TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), note TEXT, submitted_at INTEGER NOT NULL, reviewed_at INTEGER, reviewer TEXT, UNIQUE(wallet, quest_id));
    CREATE TABLE IF NOT EXISTS seed_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL REFERENCES members(wallet), delta INTEGER NOT NULL, reason TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS balance_cache(wallet TEXT PRIMARY KEY, raw_amount TEXT NOT NULL, decimals INTEGER NOT NULL, mint_program TEXT NOT NULL, checked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, action TEXT NOT NULL, target TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status);
  `);
  if (db.prepare('SELECT COUNT(*) AS total FROM quests').get().total === 0) {
    db.prepare('INSERT INTO quests(title,description,reward,created_at) VALUES(?,?,?,?)').run(
      'Help shape the next POTIFY chapter',
      'Tell the community one useful feature or educational activity you would like POTIFY to build next. Submissions are reviewed before acceptance.',
      0, now()
    );
  }
  return db;
}
function audit(db,wallet,action,target=''){ db.prepare('INSERT INTO audit(wallet,action,target,created_at) VALUES(?,?,?,?)').run(wallet,action,target,now()); }
function rpcFactory(rpcUrl){return async(method,params)=>{
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:controller.signal});
    if(!r.ok)throw new Error(`RPC status ${r.status}`);
    const data=await r.json(); if(data.error)throw new Error(`RPC: ${data.error.message||'error'}`);
    return data.result;
  }finally{clearTimeout(timer);}
};}
export async function checkBalance(wallet, rpc){
  assertWallet(wallet);
  const info=(await rpc('getAccountInfo',[MINT,{encoding:'base64',commitment:'confirmed'}]))?.value;
  if(!info || ![SPL_TOKEN,TOKEN_2022].includes(info.owner) || !Array.isArray(info.data))throw new Error('Mint account or token program cannot be verified');
  const mintData=Buffer.from(info.data[0],'base64');
  if(mintData.length<82 || mintData[45]!==1)throw new Error('Mint account layout invalid');
  const decimals=mintData[44];if(decimals>18)throw new Error('Invalid token decimals');
  const accounts=(await rpc('getTokenAccountsByOwner',[wallet,{mint:MINT},{encoding:'base64',commitment:'confirmed'}]))?.value;
  if(!Array.isArray(accounts)||accounts.length>1000)throw new Error('Token account response invalid');
  let total=0n;
  for(const a of accounts){
    if(a.account?.owner!==info.owner||!Array.isArray(a.account?.data))throw new Error('Unexpected token program');
    const d=Buffer.from(a.account.data[0],'base64');
    if(d.length<165 || !d.subarray(0,32).equals(base58Decode(MINT)) || !d.subarray(32,64).equals(base58Decode(wallet)))throw new Error('Token account mismatch');
    total+=d.readBigUInt64LE(64);
  }
  return {rawAmount:total.toString(),decimals,mintProgram:info.owner,mint:MINT,checkedAt:now()};
}
function formatTokenAmount(raw,decimals){
  const num=BigInt(raw),unit=10n**BigInt(decimals);
  return decimals ? `${num/unit}.${(num%unit).toString().padStart(decimals,'0').replace(/0+$/,'')||'0'}` : String(num);
}
const RATE_WINDOW=60_000;
export function createApp({dbPath=':memory:',siteOrigin=process.env.SITE_ORIGIN||'http://localhost:8787',rpcUrl=process.env.SOLANA_RPC_URL||DEFAULT_RPC,adminWallets=(process.env.ADMIN_WALLETS||'').split(',').map(s=>s.trim()).filter(Boolean),rpcOverride=null}={}){
 const db=makeDb(dbPath),rpc=rpcOverride||rpcFactory(rpcUrl),buckets=new Map();
 const adminSet=new Set(adminWallets);
 const getWallet=req=>{
   const cookie=parseCookies(req.headers.cookie||'').potify_session;if(!cookie)return null;
   const s=db.prepare('SELECT wallet FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(cookie),now());return s?.wallet||null;
 };
 const isAdmin=wallet=>!!wallet&&adminSet.has(wallet);
 const requireLogin=req=>{const wallet=getWallet(req);if(!wallet)throw Object.assign(new Error('Sign in with a wallet first'),{httpCode:401});return wallet;};
 const requireAdmin=req=>{const wallet=requireLogin(req);if(!isAdmin(wallet))throw Object.assign(new Error('Admin only'),{httpCode:403});return wallet;};
 const routes=async(req,res,pathname)=>{
   if(req.method==='GET'&&pathname==='/api/status')return json(res,200,{name:'POTIFY Holder Hub',network:'Solana Mainnet',mint:MINT,phase:'standalone beta',walletTransfers:false});
   if(req.method==='GET'&&pathname==='/api/quests')return json(res,200,{quests:db.prepare('SELECT id,title,description,reward FROM quests WHERE active=1 ORDER BY id DESC').all()});
   if(req.method==='GET'&&pathname==='/api/me'){
     const wallet=getWallet(req);if(!wallet)return json(res,200,{authenticated:false});
     const seedBalance=db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM seed_ledger WHERE wallet=?').get(wallet).total;
     return json(res,200,{authenticated:true,wallet,isAdmin:isAdmin(wallet),seeds:seedBalance,submissions:db.prepare('SELECT s.id,s.quest_id,s.status,s.note,s.submitted_at,q.title FROM submissions s JOIN quests q ON q.id=s.quest_id WHERE s.wallet=? ORDER BY s.id DESC').all(wallet)});
   }
   if(req.method==='POST'&&pathname==='/api/challenge'){
     const {wallet}=await bodyJson(req);assertWallet(wallet);
     const nonce=crypto.randomBytes(24).toString('hex'),expiration=now()+5*60_000,issued=new Date().toISOString();
     const msg=`POTIFY Holder Hub Wallet Sign-In\nDomain: ${new URL(siteOrigin).host}\nWallet: ${wallet}\nPurpose: Verify wallet ownership only. No token transfer or approval.\nNonce: ${nonce}\nIssued At: ${issued}`;
     db.prepare('INSERT INTO challenges(nonce_hash,wallet,message,expires_at) VALUES(?,?,?,?)').run(hash(nonce),wallet,msg,expiration);
     return json(res,200,{nonce,message:msg,expiresAt:expiration});
   }
   if(req.method==='POST'&&pathname==='/api/verify'){
     const {wallet,nonce,signature}=await bodyJson(req);assertWallet(wallet);
     if(typeof nonce!=='string'||!/^([a-f0-9]{48})$/.test(nonce)||typeof signature!=='string')return json(res,400,{error:'Invalid signature request'});
     db.exec('BEGIN IMMEDIATE');
     try{
       const row=db.prepare('SELECT * FROM challenges WHERE nonce_hash=? AND wallet=? AND used_at IS NULL AND expires_at>?').get(hash(nonce),wallet,now());
       if(!row || !verifySolanaMessage(wallet,row.message,signature)){db.exec('ROLLBACK');return json(res,401,{error:'Invalid, used or expired signature'});}
       db.prepare('UPDATE challenges SET used_at=? WHERE nonce_hash=? AND used_at IS NULL').run(now(),hash(nonce));
       db.prepare('INSERT OR IGNORE INTO members(wallet,joined_at) VALUES(?,?)').run(wallet,now());
       const session=crypto.randomBytes(32).toString('hex');
       db.prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)').run(hash(session),wallet,now()+24*60*60_000);
       audit(db,wallet,'sign-in');db.exec('COMMIT');
       const secure=new URL(siteOrigin).protocol==='https:'?'; Secure':'';
       return json(res,200,{ok:true,wallet,isAdmin:isAdmin(wallet)},{'Set-Cookie':`potify_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`});
     }catch(e){db.exec('ROLLBACK');throw e;}
   }
   if(req.method==='POST'&&pathname==='/api/logout'){
     const token=parseCookies(req.headers.cookie||'').potify_session;
     if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
     const secure=new URL(siteOrigin).protocol==='https:'?'; Secure':'';
     return json(res,200,{ok:true},{'Set-Cookie':`potify_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`});
   }
   if(req.method==='GET'&&pathname==='/api/balance'){
     const wallet=requireLogin(req);
     const cached=db.prepare('SELECT * FROM balance_cache WHERE wallet=?').get(wallet);
     // Reuse only very recent readings; manual refresh after 30 seconds.
     if(cached&&now()-cached.checked_at<30_000)return json(res,200,{wallet,mint:MINT,rawAmount:cached.raw_amount,decimals:cached.decimals,formatted:formatTokenAmount(cached.raw_amount,cached.decimals),mintProgram:cached.mint_program,checkedAt:cached.checked_at,stale:false});
     try{
       const b=await checkBalance(wallet,rpc);
       db.prepare('INSERT INTO balance_cache(wallet,raw_amount,decimals,mint_program,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET raw_amount=excluded.raw_amount,decimals=excluded.decimals,mint_program=excluded.mint_program,checked_at=excluded.checked_at').run(wallet,b.rawAmount,b.decimals,b.mintProgram,b.checkedAt);
       return json(res,200,{wallet,...b,formatted:formatTokenAmount(b.rawAmount,b.decimals),stale:false});
     }catch(e){
       if(cached)return json(res,200,{wallet,mint:MINT,rawAmount:cached.raw_amount,decimals:cached.decimals,formatted:formatTokenAmount(cached.raw_amount,cached.decimals),mintProgram:cached.mint_program,checkedAt:cached.checked_at,stale:true,warning:'RPC unavailable; showing previously verified balance only. Not valid for eligibility.'});
       return json(res,503,{wallet,mint:MINT,status:'unavailable',stale:true,error:'Balance temporarily unavailable. No zero balance inferred.'});
     }
   }
   if(req.method==='POST'&&pathname==='/api/submissions'){
     const wallet=requireLogin(req),body=await bodyJson(req);
     const questId=Number(body.questId),evidence=String(body.evidence||'').trim();
     if(!Number.isSafeInteger(questId)||questId<=0||evidence.length<10||evidence.length>1200)return json(res,400,{error:'Valid quest and 10–1200 character evidence required'});
     const q=db.prepare('SELECT id FROM quests WHERE id=? AND active=1').get(questId);if(!q)return json(res,404,{error:'Quest unavailable'});
     try{db.prepare('INSERT INTO submissions(wallet,quest_id,evidence,submitted_at) VALUES(?,?,?,?)').run(wallet,questId,evidence,now());}
     catch(e){if(String(e).includes('UNIQUE'))return json(res,409,{error:'You already submitted this quest'});throw e;}
     audit(db,wallet,'submitted-quest',String(questId));return json(res,201,{ok:true,status:'pending'});
   }
   if(req.method==='GET'&&pathname==='/api/admin/submissions'){
     requireAdmin(req);return json(res,200,{submissions:db.prepare(`SELECT s.id,s.wallet,s.evidence,s.status,s.note,s.submitted_at,q.title,q.reward FROM submissions s JOIN quests q ON q.id=s.quest_id ORDER BY s.id DESC LIMIT 100`).all()});
   }
   if(req.method==='POST'&&pathname==='/api/admin/quests'){
     const admin=requireAdmin(req),body=await bodyJson(req),title=String(body.title||'').trim(),description=String(body.description||'').trim(),reward=Number(body.reward);
     if(title.length<4||title.length>100||description.length<10||description.length>800||!Number.isSafeInteger(reward)||reward<0||reward>10000)return json(res,400,{error:'Invalid quest title, description or Seeds reward'});
     const q=db.prepare('INSERT INTO quests(title,description,reward,created_at) VALUES(?,?,?,?)').run(title,description,reward,now());
     audit(db,admin,'created-quest',String(q.lastInsertRowid));return json(res,201,{ok:true,id:Number(q.lastInsertRowid)});
   }
   if(req.method==='POST'&&pathname==='/api/admin/review'){
     const admin=requireAdmin(req),{id,decision,note}=await bodyJson(req);
     const sid=Number(id),reason=String(note||'').trim();
     if(!Number.isSafeInteger(sid)||sid<=0||!['approved','rejected'].includes(decision)||reason.length>800)return json(res,400,{error:'Invalid review'});
     db.exec('BEGIN IMMEDIATE');
     try{
       const s=db.prepare('SELECT s.*,q.reward FROM submissions s JOIN quests q ON q.id=s.quest_id WHERE s.id=?').get(sid);
       if(!s){db.exec('ROLLBACK');return json(res,404,{error:'Submission not found'});}
       if(s.status!=='pending'){db.exec('ROLLBACK');return json(res,409,{error:'Already reviewed'});}
       db.prepare('UPDATE submissions SET status=?,note=?,reviewer=?,reviewed_at=? WHERE id=? AND status=?').run(decision,reason,admin,now(),sid,'pending');
       if(decision==='approved' && s.reward>0){db.prepare('INSERT INTO seed_ledger(wallet,delta,reason,event_key,created_at) VALUES(?,?,?,?,?)').run(s.wallet,s.reward,'Approved community quest',`quest:${sid}`,now());}
       audit(db,admin,'reviewed-quest',`${sid}:${decision}`);db.exec('COMMIT');return json(res,200,{ok:true,status:decision});
     }catch(e){db.exec('ROLLBACK');throw e;}
   }
   if(req.method==='GET'&&pathname==='/api/admin/audit'){
     requireAdmin(req);return json(res,200,{audit:db.prepare('SELECT wallet,action,target,created_at FROM audit ORDER BY id DESC LIMIT 100').all()});
   }
   return json(res,404,{error:'Not found'});
 };
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
 const server=http.createServer(async(req,res)=>{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
   const u=new URL(req.url,siteOrigin),pathname=u.pathname;
   try{
     if(pathname.startsWith('/api/')){
       const ip=req.socket.remoteAddress||'unknown',bucketKey=ip+':'+pathname;
       const hit=buckets.get(bucketKey)||{at:now(),count:0};if(now()-hit.at>RATE_WINDOW){hit.at=now();hit.count=0;}
       hit.count++;buckets.set(bucketKey,hit);
       if(hit.count>(pathname==='/api/challenge'||pathname==='/api/verify'?20:120))return json(res,429,{error:'Rate limit exceeded'});
       if(req.method==='POST' && req.headers.origin!==siteOrigin)return json(res,403,{error:'Origin not allowed'});
       return await routes(req,res,pathname);
     }
     if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
     const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
     const file=files[pathname];if(!file)return json(res,404,{error:'Not found'});
     const data=fs.readFileSync(path.join(HERE,'public',file));
     res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Content-Length':data.length,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
   }catch(e){
     if(!res.headersSent)json(res,e.httpCode||500,{error:e.httpCode?e.message:'Server error'});
     else res.destroy();
     if(!e.httpCode)console.error('Server error:',e.message);
   }
 });
 return {server,db,close:()=>{server.close();db.close();}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8787),database=process.env.DATABASE_PATH||path.join(HERE,'potify.sqlite');
  const app=createApp({dbPath:database});app.server.listen(port,()=>console.log(`POTIFY Holder Hub running on ${process.env.SITE_ORIGIN||'http://localhost:'+port}`));
}
