const $=s=>document.querySelector(s);
let user=null;
function displayStatus(message,error=false){const el=$('#status');el.textContent=message;el.classList.toggle('error',error);}
async function api(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
  return data;
}
function shortWallet(wallet){return `${wallet.slice(0,7)}…${wallet.slice(-7)}`;}
function walletProvider(type){
  if(type==='phantom')return window.phantom?.solana || (window.solana?.isPhantom?window.solana:null);
  if(type==='solflare')return window.solflare || (window.solana?.isSolflare?window.solana:null);
  return null;
}
async function connectWallet(type){
  const provider=walletProvider(type);
  if(!provider?.connect || !provider.signMessage){
    displayStatus(`No compatible ${type==='phantom'?'Phantom':'Solflare'} provider detected. On iPhone, open this page in the wallet’s built-in browser or install its supported extension. Mobile handoff has not been independently tested.`,true);return;
  }
  displayStatus('Opening wallet connection. Signing verifies ownership; it is not a transaction.');
  try{
    const connection=await provider.connect();
    const wallet=(connection.publicKey||provider.publicKey).toString();
    const {nonce,message}=await api('/api/challenge',{method:'POST',body:JSON.stringify({wallet})});
    const signed=await provider.signMessage(new TextEncoder().encode(message),'utf8');
    const bytes=signed.signature||signed;
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
    const signature=btoa(binary);
    await api('/api/verify',{method:'POST',body:JSON.stringify({wallet,nonce,signature})});
    await refresh();displayStatus('Wallet ownership verified with a signed message. No token movement occurred.');
  }catch(err){displayStatus(`Wallet sign-in could not be completed: ${err.message}`,true);}
}
async function refresh(){
  user=await api('/api/me');
  $('#walletAddress').textContent=user.authenticated?shortWallet(user.wallet):'No wallet connected';
  $('#seedsAmount').textContent=user.authenticated?Number(user.seeds).toLocaleString():'—';
  $('#contribAmount').textContent=user.authenticated?user.submissions.length:'—';
  $('#logoutButton').hidden=!user.authenticated;
  $('#phantomButton').hidden=user.authenticated;
  $('#solflareButton').hidden=user.authenticated;
  $('#heroConnect').textContent=user.authenticated?'View my dashboard ↗':'Connect wallet ↗';
  $('#adminPanel').hidden=!user.isAdmin;
  await loadQuests();
  if(user.authenticated)await loadBalance();
  else {$('#potifyAmount').textContent='—';$('#potifyFoot').textContent='Not connected';}
  if(user.isAdmin)await loadAdmin();
}
async function loadBalance(){
  try{
    const balance=await api('/api/balance');
    const label=balance.formatted;
    const [whole,fraction]=label.split('.');
    $('#potifyAmount').textContent=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'');
    const date=new Date(balance.checkedAt).toLocaleString();
    $('#potifyFoot').textContent=balance.stale?`STALE · Last verified ${date} · Not eligible for gating`:`Verified on Solana · ${date}`;
  }catch(e){$('#potifyAmount').textContent='Unavailable';$('#potifyFoot').textContent='RPC or account verification failed. Not treated as zero.';}
}
async function loadQuests(){
  const {quests}=await api('/api/quests');const root=$('#questList');root.replaceChildren();
  if(!quests.length){const div=document.createElement('div');div.className='empty';div.textContent='No quests published yet. Administrators can create the first community activity.';root.append(div);return;}
  for(const q of quests){
    const item=document.createElement('article');item.className='quest-card';
    const reward=document.createElement('div');reward.className='reward';reward.textContent=`✦ ${q.reward} OFF-CHAIN SEEDS`;
    const title=document.createElement('h3');title.textContent=q.title;
    const description=document.createElement('p');description.textContent=q.description;
    item.append(reward,title,description);
    const prior=user?.submissions?.find(s=>s.quest_id===q.id);
    if(prior){const s=document.createElement('div');s.className='reward';s.textContent=`Your submission: ${prior.status.toUpperCase()}${prior.note?' · '+prior.note:''}`;item.append(s);}
    else if(user?.authenticated){
      const form=document.createElement('form'),area=document.createElement('textarea'),btn=document.createElement('button');area.required=true;area.minLength=10;area.maxLength=1200;area.placeholder='Describe your contribution or paste public evidence (10–1200 characters)';btn.className='button primary';btn.textContent='Submit for review';form.append(area,btn);
      form.addEventListener('submit',async e=>{e.preventDefault();btn.disabled=true;try{await api('/api/submissions',{method:'POST',body:JSON.stringify({questId:q.id,evidence:area.value})});displayStatus('Contribution submitted for moderation. Seeds are awarded only after approval.');await refresh();}catch(err){displayStatus(err.message,true);}finally{btn.disabled=false;}});
      item.append(form);
    }else{const msg=document.createElement('span');msg.className='feature-label';msg.textContent='Connect a wallet to submit evidence. Browsing is free.';item.append(msg);}
    root.append(item);
  }
}
async function loadAdmin(){
 try{
   const {submissions}=await api('/api/admin/submissions');const root=$('#reviewList');root.replaceChildren();
   const pending=submissions.filter(s=>s.status==='pending');if(!pending.length){root.textContent='Nothing awaiting review.';return;}
   for(const s of pending){const d=document.createElement('div');d.className='review-item';const label=document.createElement('strong');label.textContent=`${s.title} · ${s.reward} Seeds`;const detail=document.createElement('p');detail.textContent=`${shortWallet(s.wallet)}: ${s.evidence}`;d.append(label,detail);
     for(const status of ['approved','rejected']){const b=document.createElement('button');b.className='button '+(status==='approved'?'primary':'outline');b.textContent=status==='approved'?'Approve':'Reject';b.onclick=async()=>{const note=prompt(`Optional note for ${status}:`)||'';try{await api('/api/admin/review',{method:'POST',body:JSON.stringify({id:s.id,decision:status,note})});displayStatus(`Submission ${status} and audit recorded.`);await refresh();}catch(e){displayStatus(e.message,true);}};d.append(b);}
     root.append(d);
   }
 }catch(e){displayStatus(`Admin review unavailable: ${e.message}`,true);}
}
$('#createQuest').addEventListener('submit',async e=>{
 e.preventDefault();try{await api('/api/admin/quests',{method:'POST',body:JSON.stringify({title:$('#questTitle').value,description:$('#questDescription').value,reward:Number($('#questReward').value)})});$('#createQuest').reset();displayStatus('New community quest published.');await refresh();}catch(err){displayStatus(err.message,true);}
});
$('#phantomButton').onclick=()=>connectWallet('phantom');
$('#solflareButton').onclick=()=>connectWallet('solflare');
$('#heroConnect').onclick=()=>{if(user?.authenticated){location.hash='#wallet';return;}document.querySelector('#wallet').scrollIntoView({behavior:'smooth'});displayStatus('Choose Phantom or Solflare below to connect.');};
$('#logoutButton').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});await refresh();displayStatus('Signed out. Your wallet and tokens remain unchanged.');}catch(e){displayStatus(e.message,true);}};
refresh().catch(err=>displayStatus('Dashboard service unavailable: '+err.message,true));
