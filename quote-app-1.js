/* Marion quote.html script (split for pushability, build 2026-09-26.6) — part 1/3.
   Load order matters: quote-app-1.js -> 2 -> 3 (plain scripts, shared global scope). */

/* ---------- Wizard: horizontal guided steps ---------- */
let STEP=1;
let SUBMITTED=false, SUBMITTED_NO=null; // gate "Next: My Quotes" until Submit to Fluidseal succeeds
const STEP_IDS=['reqPanel','cartPanel','quotePanel','myQuotesPanel'];
const STEP_NAMES=['Customer Request','Cart — Review','Quote / Estimate','My Quotes'];
function maxStep(){return (typeof SESSION!=='undefined'&&SESSION)?4:3;}
function goStep(n){
  n=Math.max(1,Math.min(n,maxStep()));
  STEP=n;
  STEP_IDS.forEach((id,i)=>{
    const p=document.getElementById(id);
    if(p)p.classList.toggle('active',i+1===n);
    const st=document.querySelector('.stepper .st[data-step="'+(i+1)+'"]');
    if(st){
      st.classList.toggle('active',i+1===n);
      st.classList.toggle('done',i+1<n);
      st.classList.toggle('disabled',i+1>maxStep());
    }
  });
  if(n===3)buildQuote(); // live preview — exactly what Fluidseal receives on submit
  refreshNav();
  window.scrollTo({top:0,behavior:'smooth'});
}
function refreshNav(){
  const back=document.getElementById('navBack'),next=document.getElementById('navNext'),
        sub=document.getElementById('navSubmit'),hint=document.getElementById('navHint');
  back.style.visibility=STEP===1?'hidden':'visible';
  const onQuote=(STEP===3);
  if(sub){
    sub.style.display=onQuote?'':'none';
    sub.textContent=SUBMITTED?'✓ Submitted':'Submit to Fluidseal';
    sub.disabled=SUBMITTED;
  }
  if(hint)hint.style.display=(onQuote&&!SUBMITTED&&CART.length)?'':'none';
  if(STEP>=maxStep()){next.style.visibility='hidden';}
  else{
    next.style.visibility='visible';
    next.textContent='Next: '+STEP_NAMES[STEP]+' →';
    const lock=onQuote&&!SUBMITTED;
    next.disabled=lock;
    next.title=lock?'Submit to Fluidseal first':'';
  }
}
function unlockSubmit(){ // any cart change after submitting = a new/changed quote
  if(SUBMITTED){SUBMITTED=false;SUBMITTED_NO=null;refreshNav();}
}

/* ---------- Supabase: auth + quote persistence (Phase 3) ---------- */
const SB_URL="https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SB_KEY="sb_publishable_HbRa8tV_Vmj5WPdvDc37uw_Vp7WajUe";
const sb=window.supabase.createClient(SB_URL,SB_KEY);
let SESSION=null, IS_STAFF=false, CURRENT_QUOTE_ID=null;
let REVISION=0, EVER_SUBMITTED=false; // submit-revision guard

/* ---- site-wide 2FA step-up: if the account has an authenticator enrolled,
        require the 6-digit code before this page can be used ---- */
async function enforceMfa(){
  try{
    const {data:aal}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(!(aal&&aal.nextLevel==='aal2'&&aal.currentLevel!=='aal2'))return true;
  }catch(e){return true;}
  if(document.getElementById('mfaOv'))return false;
  const d=document.createElement('div');d.id='mfaOv';
  d.style.cssText='position:fixed;inset:0;background:rgba(26,26,26,.93);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif';
  d.innerHTML='<div style="background:#fff;border-radius:10px;padding:34px 38px;text-align:center;max-width:380px">'+
    '<div style="font-size:17px;font-weight:800;margin-bottom:8px">&#128274; Two-factor authentication</div>'+
    '<div style="font-size:13px;color:#555;margin-bottom:16px">Enter the 6-digit code from your authenticator app to continue.</div>'+
    '<input id="mfaOvCode" inputmode="numeric" maxlength="6" placeholder="123456" style="border:1px solid #cfcfcd;border-radius:6px;padding:10px 12px;font-size:16px;width:140px;text-align:center">'+
    '<button id="mfaOvBtn" style="margin-left:8px;background:#FFDD00;border:1px solid #000;border-radius:6px;padding:10px 16px;font-weight:700;cursor:pointer">Verify</button>'+
    '<div id="mfaOvMsg" style="color:#c8222a;font-size:12px;margin-top:10px"></div>'+
    '<div style="margin-top:14px"><a href="#" onclick="sb.auth.signOut();document.getElementById(\'mfaOv\').remove();return false" style="font-size:12px;color:#888">Sign out instead</a></div></div>';
  document.body.appendChild(d);
  const go=async()=>{
    const code=document.getElementById('mfaOvCode').value.trim();
    const msg=document.getElementById('mfaOvMsg');msg.textContent='';
    if(code.length!==6){msg.textContent='Enter the 6-digit code.';return;}
    const {data:lf,error:e1}=await sb.auth.mfa.listFactors();
    if(e1){msg.textContent=e1.message;return;}
    const f=(((lf&&lf.totp)||[]).find(x=>x.status==='verified'))||((lf&&lf.totp)||[])[0];
    if(!f){msg.textContent='No authenticator found on this account.';return;}
    const {data:ch,error:e2}=await sb.auth.mfa.challenge({factorId:f.id});
    if(e2){msg.textContent=e2.message;return;}
    const {error:e3}=await sb.auth.mfa.verify({factorId:f.id,challengeId:ch.id,code});
    if(e3){msg.textContent=e3.message;return;}
    d.remove();location.reload();
  };
  document.getElementById('mfaOvBtn').onclick=go;
  document.getElementById('mfaOvCode').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
  document.getElementById('mfaOvCode').focus();
  return false;
}

sb.auth.onAuthStateChange(async (_ev,session)=>{
  SESSION=session; IS_STAFF=false;
  if(session){
    enforceMfa();
    const {data}=await sb.from('profiles').select('is_staff').eq('id',session.user.id).single();
    IS_STAFF=!!(data&&data.is_staff);
    loadMyQuotes();
  }
  renderAuth();
});

function renderAuth(){
  const form=document.getElementById('authForm'),who=document.getElementById('authWho'),
        btn=document.getElementById('authBtn'),staff=document.getElementById('staffLink'),
        panel=document.getElementById('myQuotesPanel');
  const acct=document.getElementById('acctLink');
  if(SESSION){
    form.classList.add('hidden');who.classList.remove('hidden');
    who.textContent=SESSION.user.email;btn.textContent='Sign out';
    staff.classList.toggle('hidden',!IS_STAFF);
    const fl=document.getElementById('findLink');if(fl)fl.classList.toggle('hidden',!IS_STAFF);
    const rt=document.getElementById('reqTabs');if(rt)rt.classList.toggle('hidden',!IS_STAFF);
    checkFindHandoff();
    if(acct)acct.classList.remove('hidden');
    panel.classList.remove('hidden');
  }else{
    who.classList.add('hidden');staff.classList.add('hidden');btn.textContent='Sign in';
    const fl2=document.getElementById('findLink');if(fl2)fl2.classList.add('hidden');
    const rt2=document.getElementById('reqTabs');if(rt2)rt2.classList.add('hidden');
    reqTab('ask');
    if(acct)acct.classList.add('hidden');
    panel.classList.add('hidden');
  }
  goStep(STEP); // re-clamp wizard (step 4 requires sign-in)
}
function authAction(){
  if(SESSION){sb.auth.signOut();return;}
  document.getElementById('authForm').classList.toggle('hidden');
  const em=document.getElementById('authEmail');if(!document.getElementById('authForm').classList.contains('hidden'))em.focus();
}
async function sendLink(){
  const email=document.getElementById('authEmail').value.trim();
  if(!email)return;
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  if(error){setStatus('Could not send sign-in link: '+error.message,'err');}
  else{document.getElementById('authForm').classList.add('hidden');
       setStatus('Magic link sent to '+email+' — check your email to finish signing in.','');}
}

/* save status is shown in BOTH the Cart step (saveStatus2) and the Quote step (saveStatus) */
function setSaveStatus(html,cls){
  ['saveStatus','saveStatus2'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.innerHTML=html;el.className='status '+(cls||'');}
  });
}

async function saveQuote(status){
  if(!SESSION){setSaveStatus('Sign in (top right) to save quotes.','err');return;}
  if(!CART.length){setSaveStatus('Cart is empty.','err');return;}
  if(status==='submitted'){
    if(CART.some(l=>!(+l.qty>0)||(+l.qty%1!==0))){setSaveStatus('Fix quantities first — whole numbers, 1 or more.','err');return;}
    if(CUST.reqtype==='order'&&!(CUST.po||'').trim()&&!confirm('This is an ORDER with no PO number. Submit anyway?'))return;
  }
  const newRev=(status==='submitted'&&EVER_SUBMITTED)?REVISION+1:REVISION;
  setSaveStatus('<span class="spin"></span>Saving…','work');
  const srcPdf=(PDFS&&PDFS[0]&&PDFS[0].data&&PDFS[0].data.length<4000000)?PDFS[0]:null;
  const q={status,acct:CUST.acct,contact:CUST.contact,phone:CUST.phone,po:CUST.po,
    email:CUST.email||null,address:CUST.addr||null,wh:CUST.wh,
    required_by:CUST.reqby||null,req_type:CUST.reqtype||'quote',user_id:SESSION.user.id,
    revision:newRev,
    request_text:(document.getElementById('req').value||'').trim()||null, // the customer's original ask, kept for the outgoing customer email
    p21_quote_no:LAST_P21_NO||null,
    source_pdf_name:srcPdf?srcPdf.name:null,
    source_pdf_b64:srcPdf?srcPdf.data:null};
  let id=CURRENT_QUOTE_ID,error=null;
  if(id){
    ({error}=await sb.from('quotes').update(q).eq('id',id));
    if(!error)({error}=await sb.from('quote_lines').delete().eq('quote_id',id));
  }else{
    const r=await sb.from('quotes').insert(q).select('id').single();
    error=r.error;if(r.data)id=r.data.id;
  }
  if(!error&&id){
    const lines=CART.map(l=>({quote_id:id,conf:l.conf,oem:l.oem,brand:l.brand||null,pn:l.pn,descr:l.desc,
      reference:l.ref||null,qty:l.qty,wh:l.wh,disp:l.disp,notes:l.notes,
      line_type:(l.type==='kit')?'kit':'item',kit_group:l.kitGroup||null,
      unit_price:(l.price!=null&&l.price!=='')?+l.price:null,
      line_total:(l.price!=null&&l.price!=='')?+(l.price*l.qty).toFixed(2):null,
      discount_type:l.discountType||null,rule_id:l.ruleId||null,eta:l.eta||null,
      get_method:l._get||null,prod_method:l._prod||null,
      img_url:l.imgUrl||null,thumb:l.img||null}));
    ({error}=await sb.from('quote_lines').insert(lines));
  }
  if(error){setSaveStatus('Save failed: '+error.message,'err');return;}
  CURRENT_QUOTE_ID=id;
  SUBMITTED=(status==='submitted');
  if(SUBMITTED){REVISION=newRev;EVER_SUBMITTED=true;}
  if(!SUBMITTED)SUBMITTED_NO=null;
  refreshNav();
  if(STEP===3)buildQuote(); // refresh preview (status pill / quote #)
  setSaveStatus((status==='submitted')
    ? '✓ Submitted to Fluidseal — we\'ll price it and get back to you.'
    : '✓ Draft saved.','');
  loadMyQuotes();
  if(status==='submitted')notifySubmit(id); // fire-and-forget email to Fluidseal
  if(status==='submitted')CART.forEach(l=>{if(l.autoPn&&l.pn===l.autoPn)logFeedback(l,'confirmed_auto',null);}); // learning: unchanged auto-picks = implicit approval
}

/* ---------- Submit notification: order-card PDF + email via marion-notify ---------- */
let H2P_LOADING=null;
function loadHtml2Pdf(){
  if(window.html2pdf)return Promise.resolve();
  if(H2P_LOADING)return H2P_LOADING;
  H2P_LOADING=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  return H2P_LOADING;
}
function hesc(s){return (s??'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function cmoney(n){return (n==null||n==='')?'—':'CAD '+(+n).toFixed(2);}
function lineThumbHTML(l){ // catalog product image — thumb (data URL) first, CMS url as fallback
  const src=l.thumb||l.img_url;if(!src)return '';
  return '<img src="'+(src+'').replace(/"/g,'&quot;')+'" width="44" height="44" style="width:44px;height:44px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;background:#fff;vertical-align:middle;margin-right:10px" alt="">';
}
/* Official 'No Tag Line' wordmark (FLUIDSEAL-THEME.md §4) — real asset, inline as SVG data URI */
const FS_LOGO='fluidseal-logo.svg'; // official wordmark, same-origin file in this repo
function cardHTML(q,lines,custEmail){
  let subtotal=0;
  const dPad=lines.some(l=>l.thumb||l.img_url)?'padding:10px 8px 10px 62px':'padding:10px 8px'; // align the Description header with the text, not the 44px thumb
  const rows=lines.map(l=>{
    if(l.line_total!=null)subtotal+=+l.line_total;
    return '<tr>'+
      '<td style="padding:12px 8px;border-bottom:1px solid #eef0f3;color:#4a5568;font-size:13px">'+lineThumbHTML(l)+'<span style="vertical-align:middle">'+(hesc(l.pn)||'<i>unresolved</i>')+(l.descr?' — '+hesc(l.descr):'')+(l.oem?' <span style="color:#8b90a0">(OEM '+hesc(l.oem)+')</span>':'')+(l.reference?' <span style="color:#b8860b;font-weight:700">Ref: '+hesc(l.reference)+'</span>':'')+'</span></td>'+
      '<td align="center" style="padding:12px 8px;border-bottom:1px solid #eef0f3;color:#2b6cb0;font-size:13px">'+hesc(l.qty)+'</td>'+
      '<td align="right" style="padding:12px 8px;border-bottom:1px solid #eef0f3;font-size:13px">'+cmoney(l.unit_price)+'</td>'+
      '<td align="right" style="padding:12px 8px;border-bottom:1px solid #eef0f3;font-weight:700;font-size:13px">'+cmoney(l.line_total)+'</td></tr>';
  }).join('');
  const date=new Date(q.created_at||Date.now()).toLocaleDateString('en-CA');
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f5f7;padding:24px">'+
  '<div style="max-width:840px;margin:0 auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb;padding:28px 32px">'+
  '<table width="100%" cellpadding="0" cellspacing="0"><tr><td>'+
    '<div style="font-size:11px;color:#8b90a0;letter-spacing:1.5px;font-weight:700">QUOTE</div>'+
    '<div style="font-size:28px;font-weight:800;color:#111827">#'+hesc(q.quote_no)+'</div>'+
    '<div style="margin-top:10px;font-size:12px;color:#555"><span style="background:#fdf0d0;color:#b8860b;padding:4px 12px;border-radius:12px;font-weight:700">'+hesc(q.status)+'</span>&nbsp;&nbsp;'+date+(q.po?' &nbsp;·&nbsp; PO Number: <b>'+hesc(q.po)+'</b>':'')+'</div>'+
  '</td><td align="right" valign="top">'+
    '<img src="'+FS_LOGO+'" alt="fluidseal AB Inc." style="height:36px;vertical-align:middle">'+
  '</td></tr></table>'+
  '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr>'+
  '<td width="49%" valign="top" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px">'+
    '<div style="font-size:10px;color:#8b90a0;letter-spacing:1.5px;font-weight:700;margin-bottom:8px">BILLING ADDRESS</div>'+
    '<div style="font-size:14px;color:#1a202c;line-height:1.6">'+(hesc(q.acct)||'(ENTER BUSINESS NAME)')+'<br>'+(hesc(q.contact)||'(ENTER CONTACT NAME)')+'<br>'+(hesc(q.address)||'—')+'<br>'+(hesc(q.phone)||'')+'</div></td>'+
  '<td width="2%"></td>'+
  '<td width="49%" valign="top" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px">'+
    '<div style="font-size:10px;color:#8b90a0;letter-spacing:1.5px;font-weight:700;margin-bottom:8px">SHIPPING ADDRESS</div>'+
    '<div style="font-size:14px;color:#1a202c;line-height:1.6">'+(hesc(q.acct)||'—')+'<br>'+(hesc(q.contact)||'')+'<br>'+(hesc(q.address)||'—')+'</div></td>'+
  '</tr></table>'+
  '<div style="background:#f7f8fa;border-radius:8px;padding:14px 18px;margin-top:18px">'+
    '<div style="font-size:10px;color:#8b90a0;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">DOCUMENT REFERENCES</div>'+
    '<span style="font-size:13px;color:#1a202c"><b>Document Number:</b> '+hesc(q.quote_no)+'</span>&nbsp;&nbsp;&nbsp;'+
    '<span style="font-size:13px;color:#1a202c"><b>PO Number:</b> '+(hesc(q.po)||'—')+'</span>&nbsp;&nbsp;&nbsp;'+
    '<span style="font-size:13px;color:#1a202c"><b>Customer:</b> '+hesc(custEmail)+'</span>&nbsp;&nbsp;&nbsp;'+
    '<span style="font-size:13px;color:#1a202c"><b>Type:</b> '+hesc((q.req_type||'quote').toUpperCase())+'</span>'+
    (q.required_by?'&nbsp;&nbsp;&nbsp;<span style="font-size:13px;color:#1a202c"><b>Required:</b> '+hesc(q.required_by)+'</span>':'')+'</div>'+
  '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>'+
    '<th align="left" style="'+dPad+';border-bottom:2px solid #e5e7eb;font-size:13px;color:#1a202c">Description</th>'+
    '<th align="center" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;font-size:13px;color:#1a202c">Quantity</th>'+
    '<th align="right" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;font-size:13px;color:#1a202c">Price</th>'+
    '<th align="right" style="padding:10px 8px;border-bottom:2px solid #e5e7eb;font-size:13px;color:#1a202c">Total Price</th></tr>'+
    rows+
    '<tr><td colspan="2"></td><td align="right" style="padding:10px 8px;color:#4a5568;font-size:13px">Subtotal</td><td align="right" style="padding:10px 8px;font-size:13px">'+(subtotal?'CAD '+subtotal.toFixed(2):'—')+'</td></tr>'+
    '<tr><td colspan="2"></td><td align="right" style="padding:10px 8px;color:#4a5568;font-size:13px">TAXES</td><td align="right" style="padding:10px 8px;font-size:13px">—</td></tr>'+
    '<tr><td colspan="2"></td><td align="right" style="padding:12px 8px;background:#f7f8fa;font-weight:800;font-size:14px">Total</td><td align="right" style="padding:12px 8px;background:#f7f8fa;font-weight:800;font-size:14px">'+(subtotal?'CAD '+subtotal.toFixed(2):'pending pricing')+'</td></tr>'+
  '</table></div></div>';
}
/* ---------- Card style toggle: 'fluidseal' (sealsonline web card) or 'p21' (ERP Quotation copy) ---------- */
let CARD_STYLE='fluidseal';
try{CARD_STYLE=localStorage.getItem('marion_card_style')||'fluidseal';}catch(_){ }
function setCardStyle(st){
  CARD_STYLE=(st==='p21')?'p21':'fluidseal';
  try{localStorage.setItem('marion_card_style',CARD_STYLE);}catch(_){ }
  const f=document.getElementById('csFS'),p=document.getElementById('csP21');
  if(f)f.classList.toggle('on',CARD_STYLE==='fluidseal');
  if(p)p.classList.toggle('on',CARD_STYLE==='p21');
  if(STEP===3)buildQuote();
}
function activeCardHTML(q,lines,custEmail){
  return CARD_STYLE==='p21'?cardP21HTML(q,lines,custEmail):cardHTML(q,lines,custEmail);
}

/* ---------- P21 / ERP Quotation card — mirrors the "Quote XXXXXXX-0001.pdf" our ERP emails ---------- */
function cardP21HTML(q,lines,custEmail){
  let subtotal=0, any=false;
  const m4=n=>(n==null||n==='')?'':(+n).toFixed(4);
  const m2=n=>(n==null||n==='')?'':(+n).toFixed(2);
  const up=s2=>hesc((s2??'').toString().toUpperCase());
  const B='1px solid #9a9a9a';
  const lbl='font-size:8px;letter-spacing:.6px;font-weight:700;color:#111;';
  const cell='padding:4px 8px;vertical-align:top;font-size:12px;line-height:1.45;';
  const hd='padding:3px 6px;'+lbl+'text-align:center;border-bottom:'+B+';border-right:'+B+';background:#fff;';
  const rows=lines.map(l=>{
    if(l.line_total!=null){subtotal+=+l.line_total;any=true;}
    const extra=[];
    if(l.oem)extra.push('CUST REF: '+up(l.oem));
    if(l.reference)extra.push('REF: '+up(l.reference));
    return '<tr>'+
      '<td style="'+cell+'text-align:center">'+hesc(l.qty)+'</td>'+
      '<td style="'+cell+'"></td><td style="'+cell+'"></td>'+
      '<td style="'+cell+'text-align:center">'+up(l.disp||'')+'</td>'+
      '<td style="'+cell+'"><b>'+(up(l.pn)||'*UNRESOLVED*')+'</b>'+
        (l.descr?'<br><span style="color:#333">&nbsp;'+up(l.descr)+'</span>':'')+
        extra.map(x=>'<br><span style="color:#333">&nbsp;'+x+'</span>').join('')+'</td>'+
      '<td style="'+cell+'text-align:center">EA</td>'+
      '<td style="'+cell+'"></td>'+
      '<td style="'+cell+'text-align:right;white-space:nowrap">'+m4(l.unit_price)+'</td>'+
      '<td style="'+cell+'text-align:right;white-space:nowrap">'+m2(l.line_total)+'</td>'+
    '</tr>';
  }).join('');
  const d=new Date(q.created_at||Date.now());
  const date=('0'+(d.getMonth()+1)).slice(-2)+'/'+('0'+d.getDate()).slice(-2)+'/'+(''+d.getFullYear()).slice(-2);
  const gst=any?subtotal*0.05:0;
  const tot=(la,val,strong)=>'<tr><td style="padding:2.5px 10px;font-size:'+(strong?'11px;font-weight:700;':'10px;')+'">'+la+'</td><td style="padding:2.5px 10px;text-align:right;white-space:nowrap;font-size:'+(strong?'13px;font-weight:700;':'11px;')+'">'+val+'</td></tr>';
  const numbox='<td width="30%" style="border:'+B+';padding:3px 10px;text-align:center;vertical-align:middle"><div style="'+lbl+'">QUOTATION NUMBER</div><div style="font-size:13px;font-weight:700">'+hesc(q.quote_no)+'</div></td>';
  return '<div style="background:#f4f5f7;padding:24px">'+
  '<div style="max-width:840px;margin:0 auto;background:#fff;border:1px solid #bbb;padding:26px 30px;font-family:Consolas,\'Courier New\',monospace;color:#111">'+
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>'+
      '<td style="font-size:11px;vertical-align:bottom">GST: R-87321 2575</td>'+
      '<td align="right" style="font-family:Georgia,\'Times New Roman\',serif;font-style:italic;font-size:26px;font-weight:700">Quotation</td>'+
    '</tr></table>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>'+
      '<td width="30%" style="border:'+B+';padding:8px 10px;text-align:center;font-size:12px;font-weight:700;vertical-align:middle">'+(up(q.acct)||'&mdash;')+'</td>'+
      '<td width="5%"></td>'+numbox+'<td width="5%"></td>'+numbox+
    '</tr></table>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>'+
      '<td width="50%" style="font-size:12px;vertical-align:top;line-height:1.55;padding-right:16px"><b>BILL TO:</b><br>'+(up(q.acct)||'(ENTER BUSINESS NAME)')+(q.contact?'<br>'+up(q.contact):'')+'<br>'+(up(q.address)||'&mdash;')+'</td>'+
      '<td width="50%" style="font-size:12px;vertical-align:top;line-height:1.55"><b>SHIP TO:</b><br>'+(up(q.acct)||'&mdash;')+'<br>'+(up(q.address)||'&mdash;')+'</td>'+
    '</tr><tr>'+
      '<td style="font-size:12px;padding-top:7px"><b>CUSTOMER P.O. NO.</b>&nbsp; '+(up(q.po)||'&mdash;')+'</td>'+
      '<td style="font-size:12px;padding-top:7px"><b>CUSTOMER P.O. NO.</b>&nbsp; '+(up(q.po)||'&mdash;')+'</td>'+
    '</tr></table>'+
    '<div style="font-size:11px;font-weight:700;margin-top:10px;overflow:hidden;white-space:nowrap">***QUOTATION******QUOTATION******QUOTATION******QUOTATION******QUOTATION***</div>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border:'+B+';border-collapse:collapse"><tr>'+
      '<td style="'+hd+'">QUOTE NUMBER</td><td style="'+hd+'">STATUS</td><td style="'+hd+'">ORDER DATE</td><td style="'+hd+'">CUSTOMER P.O. NUMBER</td><td style="'+hd+'border-right:none">CUSTOMER</td></tr><tr>'+
      '<td style="'+cell+'text-align:center;border-right:'+B+'">'+hesc(q.quote_no)+'</td>'+
      '<td style="'+cell+'text-align:center;border-right:'+B+'">'+up(q.status)+'</td>'+
      '<td style="'+cell+'text-align:center;border-right:'+B+'">'+date+'</td>'+
      '<td style="'+cell+'text-align:center;border-right:'+B+'">'+(up(q.po)||'&mdash;')+'</td>'+
      '<td style="'+cell+'text-align:center">'+hesc(custEmail)+'</td>'+
    '</tr></table>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border:'+B+';border-collapse:collapse"><tr>'+
      '<td style="'+hd+'text-align:left;padding-left:8px">INSTRUCTIONS</td><td style="'+hd+'" width="12%">TYPE</td><td style="'+hd+'border-right:none" width="12%">PAGE NO.</td></tr><tr>'+
      '<td style="'+cell+'border-right:'+B+'">'+(q.required_by?'***'+up(q.required_by)+'***':'')+'</td>'+
      '<td style="'+cell+'text-align:center;border-right:'+B+'">'+up((q.req_type||'quote'))+'</td>'+
      '<td style="'+cell+'text-align:center">1</td>'+
    '</tr></table>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border:'+B+';border-collapse:collapse">'+
      '<tr><td colspan="3" style="padding:3px 6px 0;'+lbl+'text-align:center;border-right:'+B+'">QUANTITY</td>'+
      '<td rowspan="2" style="'+hd+'vertical-align:bottom" width="6%">DISP.</td>'+
      '<td rowspan="2" style="'+hd+'text-align:left;vertical-align:bottom;padding-left:8px">ITEM CODE AND DESCRIPTION</td>'+
      '<td rowspan="2" style="'+hd+'vertical-align:bottom" width="5%">U/M</td>'+
      '<td rowspan="2" style="'+hd+'vertical-align:bottom" width="6%">MULT.</td>'+
      '<td rowspan="2" style="'+hd+'vertical-align:bottom" width="12%">UNIT PRICE</td>'+
      '<td rowspan="2" style="'+hd+'border-right:none;vertical-align:bottom" width="11%">AMOUNT</td></tr>'+
      '<tr><td style="'+hd+'border-right:none" width="8%">ORDERED</td><td style="'+hd+'border-right:none" width="8%">B.O./RET.</td><td style="'+hd+'" width="8%">SHIPPED</td></tr>'+
      '<tr><td colspan="4" style="'+cell+'"></td><td style="'+cell+'color:#333">PRICE SUBJECT TO CHANGE<br>WITHOUT NOTIFICATION (TARIFFS)</td><td colspan="4" style="'+cell+'"></td></tr>'+
      rows+
    '</table>'+
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>'+
      '<td width="58%" style="vertical-align:top;font-size:9px;color:#333;line-height:1.7;padding-right:16px">'+
        '<b>CODE EXPLANATION</b><br>'+
        '* - PST APPLICABLE &nbsp;&nbsp; # - GST APPLICABLE &nbsp;&nbsp; + - PST &amp; GST APPLICABLE<br>'+
        'B - BALANCE BACK ORDERED &nbsp;&nbsp; C - CONSIDER COMPLETE<br>'+
        'D - DIRECT SHIPMENT &nbsp;&nbsp; F - FACTORY MINIMUM &nbsp;&nbsp; RT - RETURNED<br><br>'+
        'Prices are valid for 30 days from above date and are subject to the quantities quoted. This cost does not reflect any special testing, packaging or other requirements other than those normally supplied with standard stock components.<br>'+
        '<span style="display:block;text-align:center;font-size:10px;font-weight:700;margin:8px 0">www.sealsonline.com</span>'+
        '<b>WARRANTY: SUBJECT TO MANUFACTURER\'S APPROVAL.</b></td>'+
      '<td width="42%" style="vertical-align:top"><table width="100%" cellpadding="0" cellspacing="0" style="border:'+B+'">'+
        tot('SUB TOTAL',any?m2(subtotal):'&mdash;')+
        tot('MISC. I','')+
        tot('MISC. II','')+
        tot('TOTAL TRANSPORT','')+
        tot('GST / HST',any?m2(gst):'&mdash;')+
        tot('PST','0.00')+
        tot('RECEIVED','0.00')+
        tot('TOTAL AMOUNT DUE',any?m2(subtotal+gst):'PENDING PRICING',true)+
      '</table></td>'+
    '</tr></table>'+
  '</div></div>';
}

async function notifySubmit(id){
  try{
    const {data:q}=await sb.from('quotes').select('*,quote_lines(*)').eq('id',id).single();
    if(!q)return;
    SUBMITTED_NO=q.quote_no||null;
    if(STEP===3)buildQuote(); // show the real quote # on the preview
    let pdf=null;
    try{
      await loadHtml2Pdf();
      const host=document.createElement('div');
      host.style.cssText='position:fixed;left:-10000px;top:0;width:840px;background:#fff';
      host.innerHTML=activeCardHTML(q,q.quote_lines||[],SESSION.user.email);
      document.body.appendChild(host);
      const uri=await window.html2pdf().set({margin:6,image:{type:'jpeg',quality:.95},
        html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4'}}).from(host).outputPdf('datauristring');
      document.body.removeChild(host);
      pdf=uri.split(',')[1];
    }catch(e){console.warn('pdf generation failed — sending email without attachment',e);}
    const res=await fetch(SB_URL+'/functions/v1/marion-notify',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SESSION.access_token},
      body:JSON.stringify({quote_id:id,pdf_base64:pdf})});
    if(res.ok){setSaveStatus('✓ Submitted — quote #'+q.quote_no+' emailed to Fluidseal.','');}
  }catch(e){console.warn('notify failed',e);}
}

async function loadMyQuotes(){
  if(!SESSION)return;
  const box=document.getElementById('myQuotesList');
  const {data,error}=await sb.from('quotes')
    .select('id,status,acct,contact,po,created_at,quote_lines(id,line_total)')
    .eq('user_id',SESSION.user.id).order('created_at',{ascending:false});
  if(error){box.innerHTML='<div class="hint">Could not load quotes: '+esc(error.message)+'</div>';return;}
  if(!data.length){box.innerHTML='<div class="hint">No saved quotes yet — build a cart above, then Save draft or Submit.</div>';return;}
  box.innerHTML='<div style="overflow-x:auto"><table class="cart"><thead><tr><th>Date</th><th>Account</th><th>Contact</th><th>PO</th><th>Lines</th><th>Total Value</th><th>Status</th><th style="width:60px"></th></tr></thead><tbody>'+
    data.map(q=>{
      const total=q.quote_lines.reduce((s,l)=>s+(l.line_total!=null?+l.line_total:0),0);
      const totalCell=total>0?'<b>$'+total.toFixed(2)+'</b>':'<span style="color:#999">pending pricing</span>';
      return '<tr><td>'+new Date(q.created_at).toLocaleDateString('en-CA')+'</td><td>'+esc(q.acct||'—')+
      '</td><td>'+esc(q.contact||'—')+
      '</td><td>'+esc(q.po||'')+'</td><td>'+q.quote_lines.length+
      '</td><td>'+totalCell+
      '</td><td><a href="#" onclick="openQuote(\''+q.id+'\');return false" title="Open this quote" style="text-decoration:none"><span class="conf '+(q.status==='draft'?'low':q.status==='submitted'?'med':'high')+'" style="cursor:pointer">'+q.status+'</span></a></td>'+
      '<td><a href="#" onclick="openQuote(\''+q.id+'\');return false" style="color:var(--red);font-weight:700">open</a></td></tr>';}).join('')+
    '</tbody></table></div>';
}

async function openQuote(id){
  const {data,error}=await sb.from('quotes').select('*,quote_lines(*)').eq('id',id).single();
  if(error||!data){setStatus('Could not open quote.','err');return;}
  CURRENT_QUOTE_ID=data.id;
  CUST={acct:data.acct||'',contact:data.contact||'',phone:data.phone||'',po:data.po||'',
    email:data.email||'',addr:data.address||'',wh:data.wh||'6 - Edmonton',
    reqby:data.required_by||'',reqtype:(data.req_type==='order'?'order':'quote')};
  [['mCust','acct'],['mContact','contact'],['mPhone','phone'],['mPO','po'],['mEmail','email'],['mAddr','addr'],['mReqBy','reqby']]
    .forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.value=CUST[k];});
  const rtSel=document.getElementById('mReqType');if(rtSel)rtSel.value=CUST.reqtype;
  CART=(data.quote_lines||[]).map(l=>({conf:l.conf||'low',oem:l.oem||'',brand:l.brand||'',pn:l.pn||'',desc:l.descr||'',
    ref:l.reference||'',qty:l.qty||1,wh:l.wh||'',disp:l.disp||'B',notes:l.notes||'',
    type:(l.line_type==='kit')?'kit':'item',kitGroup:l.kit_group||null,price:l.unit_price,
    eta:l.eta||null,discountType:l.discount_type||null,ruleId:l.rule_id||null,_prcChk:true,
    img:l.thumb||null,imgUrl:l.img_url||null,_imgChk:false})); // _imgChk false: older quotes without images pick them up on open
  SUBMITTED=(data.status==='submitted');
  SUBMITTED_NO=SUBMITTED?(data.quote_no||null):null;
  REVISION=data.revision||0;
  EVER_SUBMITTED=(data.status==='submitted'||REVISION>0);
  document.getElementById('req').value=data.request_text||''; // restore the original ask
  LAST_P21_NO=data.p21_quote_no||'';
  IMAGES=[];PDFS=data.source_pdf_b64?[{name:data.source_pdf_name||'source.pdf',data:data.source_pdf_b64}]:[];
  renderAttachments();
  orderKits();renderCust();renderCart();
  setSaveStatus('Opened saved quote ('+data.status+').','');
  goStep(3); // open straight to the Quote / Estimate document — same form as the email
}

/* ---------- Cross-reference knowledge (Phase 1 rules the agent applies) ---------- */
/* These encode what's known so far. The API call carries the same logic so the
   model can reason over unfamiliar requests; this JS handles the deterministic bits. */
const OEM_PREFIX_MAP = {
  // OEM/source brand -> Fluidseal part-number rule
  // John Deere parts -> "RJD-" + the full OEM number, OEM prefix preserved (T, AT, R, TH, H, U, RE, AH, ...).
  // e.g. T187116 -> RJD-T187116 ; AT131420 -> RJD-AT131420. (TD is NOT a rule; it is only the filler-ring internal series.)
  deere:   {brand:"John Deere", build:(oem)=> "RJD-"+oem.toUpperCase()  }
};
const DISPOSITIONS = ["B","S","T"]; // Buy / Stock / Transfer  (B = default per cart)
/* cart rules engine caches — stock (get_stock), part facts (get_cart_facts) */
let STOCKC={}, FACTS={};
const LOW_MARGIN_PCT=26; // BR-06 threshold: 26% (David 2026-04-15, was 30%)

/* ---------- State ---------- */
let CART = [];      // [{conf, oem, brand, pn, desc, qty, wh, disp, notes, price}]
let CUST = {acct:"",contact:"",phone:"",po:"",email:"",addr:"",wh:"6 - Edmonton",reqby:"",reqtype:"quote"};
let IMAGES = [];    // [{name, media_type, data(base64), url(objectURL)}]
let LAST_P21_NO = ''; // QUOTATION NUMBER when the analyzed request carried our own P21 quote PDF
let PDFS = [];      // [{name, data(base64)}] — sent to the AI as document blocks

/* ---------- Drag & drop ---------- */
const TEXT_EXT=/\.(txt|eml|csv|md|log|json)$/i;
const IMG_TYPE=/^image\//;
function initDnD(){
  const dz=document.getElementById('dropzone');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{
    e.preventDefault();e.stopPropagation();dz.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{
    e.preventDefault();e.stopPropagation();
    if(ev==='dragleave'&&dz.contains(e.relatedTarget))return;
    dz.classList.remove('over');}));
  dz.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));
}
/* Lazy-load SheetJS only when an Excel file is dropped */
let XLSX_LOADING=null;
function loadXLSX(){
  if(window.XLSX)return Promise.resolve();
  if(XLSX_LOADING)return XLSX_LOADING;
  XLSX_LOADING=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    s.onload=res;s.onerror=rej;document.head.appendChild(s);});
  return XLSX_LOADING;
}
async function stageExcel(f){
  setStatus('<span class="spin"></span>Reading '+esc(f.name)+'…','work');
  try{
    await loadXLSX();
    const buf=await f.arrayBuffer();
    const wb=window.XLSX.read(buf,{type:'array'});
    let txt='';
    wb.SheetNames.forEach(n=>{
      const csv=window.XLSX.utils.sheet_to_csv(wb.Sheets[n]).trim();
      if(csv)txt+='--- Sheet: '+n+' ---\n'+csv+'\n\n';});
    if(!txt){setStatus('No data found in '+esc(f.name)+'.','err');return;}
    const ta=document.getElementById('req');
    ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+txt.trim();
    setStatus('Loaded '+esc(f.name)+' ('+wb.SheetNames.length+' sheet(s)) — hit Analyze.','');
  }catch(e){console.warn('excel read failed',e);
    setStatus('Couldn’t read '+esc(f.name)+' — try saving it as CSV and dropping that.','err');}
}
/* ---- PDF attachments: staged and sent to the AI as document blocks ---- */
function stagePdf(f){
  if(f.size>15*1024*1024){setStatus(esc(f.name)+' is over 15 MB — too large to analyze.','err');return;}
  const r=new FileReader();
  r.onload=()=>{
    PDFS.push({name:f.name,data:r.result.split(',')[1]});
    renderAttachments();
    setStatus('Attached PDF '+esc(f.name)+' — will be read on Analyze.','');
  };
  r.readAsDataURL(f);
}
function u8ToB64(u8){
  let s='';const CH=0x8000;
  for(let i=0;i<u8.length;i+=CH)s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH));
  return btoa(s);
}
/* ---- Outlook .msg: parsed in-browser (msgreader), body -> textbox,
        embedded PDF/image attachments staged for the AI ---- */
let MSG_LOADING=null;
function loadMsgReader(){
  if(window.__MsgReader)return Promise.resolve(window.__MsgReader);
  if(MSG_LOADING)return MSG_LOADING;
  MSG_LOADING=import('https://cdn.jsdelivr.net/npm/@kenjiuno/msgreader@1.24.0/+esm')
    .then(m=>{const MR=(m.default&&(m.default.default||m.default))||m.MsgReader||m;
      window.__MsgReader=MR;return MR;});
  return MSG_LOADING;
}
async function stageMsg(f){
  setStatus('<span class="spin"></span>Reading '+esc(f.name)+'…','work');
  try{
    const MsgReader=await loadMsgReader();
    const buf=await f.arrayBuffer();
    const reader=new MsgReader(buf);
    const msg=reader.getFileData();
    if(msg.error)throw new Error(msg.error);
    let txt='';
    if(msg.subject)txt+='Subject: '+msg.subject+'\n';
    if(msg.senderName||msg.senderEmail)txt+='From: '+(msg.senderName||'')+(msg.senderEmail?' <'+msg.senderEmail+'>':'')+'\n';
    const body=(msg.body||'').trim();
    txt+=body?'\n'+body:'';
    if(txt.trim()){
      const ta=document.getElementById('req');
      ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+txt.trim();
    }
    // pull usable attachments out of the email (PDF POs, screenshots)
    // Outlook inline signature graphics (image001.jpg etc., small) carry no part
    // info and destabilize the AI read — skip them.
    let staged=0, skipped=0;
    (msg.attachments||[]).forEach(att=>{
      try{
        if(att.innerMsgContent){ // the customer's ORIGINAL email, forwarded as an embedded .msg
          const inner=att.innerMsgContentFields||{};
          let it='';
          if(inner.subject)it+='--- ORIGINAL CUSTOMER EMAIL ---\nSubject: '+inner.subject+'\n';
          if(inner.senderName||inner.senderEmail)it+='From: '+(inner.senderName||'')+(inner.senderEmail?' <'+inner.senderEmail+'>':'')+'\n';
          const ib=(inner.body||'').trim();
          if(ib)it+='\n'+ib;
          if(it.trim()){const ta=document.getElementById('req');ta.value=(ta.value.trim()?ta.value.trim()+'\n\n':'')+it.trim();staged++;}
          (inner.attachments||[]).forEach(ia=>{ // nested customer attachments (PDF POs, screenshots)
            try{
              const iname=(ia.fileName||ia.name||'attachment').toString();
              if(!/\.(pdf|png|jpe?g|webp|gif)$/i.test(iname))return;
              const a2=reader.getAttachment(ia);
              if(!a2||!a2.content)return;
              const ib2=a2.content instanceof Uint8Array?a2.content:new Uint8Array(a2.content);
              if(!/\.pdf$/i.test(iname)&&/^image\d+\.(png|jpe?g|webp|gif)$/i.test(iname)&&ib2.length<150000){skipped++;return;}
              const bb=u8ToB64(ib2);
              if(/\.pdf$/i.test(iname)){PDFS.push({name:iname,data:bb});staged++;}
              else{const mt2=/\.png$/i.test(iname)?'image/png':/\.gif$/i.test(iname)?'image/gif':/\.webp$/i.test(iname)?'image/webp':'image/jpeg';
                IMAGES.push({name:iname,media_type:mt2,data:bb,url:'data:'+mt2+';base64,'+bb});staged++;}
            }catch(e2){console.warn('inner attachment skipped',e2);}
          });
          return;
        }
        const name=(att.fileName||att.name||'attachment').toString();
        if(!/\.(pdf|png|jpe?g|webp|gif)$/i.test(name))return;
        const a=reader.getAttachment(att);
        if(!a||!a.content)return;
        const bytes=a.content instanceof Uint8Array?a.content:new Uint8Array(a.content);
        if(!/\.pdf$/i.test(name) && /^image\d+\.(png|jpe?g|webp|gif)$/i.test(name) && bytes.length<150000){
          skipped++; return; // inline signature/logo image
        }
        const b64=u8ToB64(bytes);
        if(/\.pdf$/i.test(name)){PDFS.push({name,data:b64});staged++;}
        else{
          const mt=/\.png$/i.test(name)?'image/png':/\.gif$/i.test(name)?'image/gif':/\.webp$/i.test(name)?'image/webp':'image/jpeg';
          IMAGES.push({name,media_type:mt,data:b64,url:'data:'+mt+';base64,'+b64});staged++;
        }
      }catch(e){console.warn('msg attachment skipped',e);}
    });
    renderAttachments();
    if(!txt.trim()&&!staged)throw new Error('empty');
    setStatus('Loaded '+esc(f.name)+(staged?' + '+staged+' attachment(s)':'')+(skipped?' ('+skipped+' signature image(s) skipped)':'')+' — hit Analyze.','');
  }catch(e){console.warn('msg read failed',e);
    setStatus('Couldn’t read '+esc(f.name)+' — save it as .eml (or screenshot it) and drop that instead.','err');}
}
function handleFiles(fileList){
  const files=[...fileList];if(!files.length)return;
  files.forEach(f=>{
    if(IMG_TYPE.test(f.type)||/\.(png|jpe?g|webp|gif)$/i.test(f.name)){ stageImage(f); }
    else if(/\.pdf$/i.test(f.name)||f.type==='application/pdf'){ stagePdf(f); }
    else if(/\.(xlsx|xls)$/i.test(f.name)){ stageExcel(f); }
    else if(/\.msg$/i.test(f.name)){ stageMsg(f); }
    else if(TEXT_EXT.test(f.name)||f.type.startsWith('text/')){
      const r=new FileReader();
      r.onload=()=>{
        const ta=document.getElementById('req');
        ta.value=(ta.value.trim()?ta.value.trim()+"\n\n":"")+r.result.trim();
        setStatus('Loaded '+f.name+'.','');
      };
      r.readAsText(f);
    } else { setStatus('Skipped '+f.name+' (unsupported type).','err'); }
  });
}
function stageImage(f){
  const r=new FileReader();
  r.onload=()=>{
    const b64=r.result.split(',')[1];
    const mt=f.type||'image/png';
    IMAGES.push({name:f.name,media_type:mt,data:b64,url:r.result});
    renderAttachments();
    setStatus('Attached screenshot '+f.name+' — will be read on Analyze.','');
  };
  r.readAsDataURL(f);
}
function renderAttachments(){
  const row=document.getElementById('attachRow');
  row.innerHTML=
    IMAGES.map((im,i)=>`<span class="chip img"><img src="${im.url}" style="width:18px;height:18px;object-fit:cover;border-radius:2px">${esc(im.name)}<span class="x" onclick="rmImage(${i})">×</span></span>`).join('')+
    PDFS.map((p,i)=>`<span class="chip">📄 ${esc(p.name)}<span class="x" onclick="rmPdf(${i})">×</span></span>`).join('');
}
function rmImage(i){IMAGES.splice(i,1);renderAttachments();}
function rmPdf(i){PDFS.splice(i,1);renderAttachments();}

/* ---------- Sample ---------- */
const SAMPLE = `ATTN – SERGE

PHONE# 403-333-6741

QTY: 4
HEIGHT = 1.220"
T187116: Plain Bushing | Shop.Deere.com  (50.1 X 62.0 X 31.0 mm)

QTY: 4
HEIGHT = 1.220"
T187117: Plain Bushing | Shop.Deere.com  (50.1 X 62.0 X 31.0 mm)

Thank you,`;
function loadSample(){
  document.getElementById('req').value=SAMPLE;
  document.getElementById('mCust').value="SERGE CONSTRUCTION";
  document.getElementById('mContact').value="Serge";
  document.getElementById('mPhone').value="403-333-6741";
}

