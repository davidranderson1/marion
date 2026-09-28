/* sourcing-panel.js — "Source it": do we have this, can we provide it, when and how much?
   FLAB - Xpress Machining phase 1 (2026-09-28). Staff only. Loads after quote-app-3.js and adds a
   Source button to every cart line's Fulfilment cell; the answer comes from public.sourcing_options()
   (a thin wrapper over sourcing.source_options — Supabase schema `sourcing`, project-owned, rules in
   sourcing.setting / material_family / machine, all provisional until confirmed on the Open Items board).
   Nothing here talks to Dynamics; completed results are written back later (Marion item 16 / Dynamics item 166). */
(function(){
const SRC_BUILD='2026-09-28.1';
const RES={};                     // cache: line key -> result json (per page load)
const TYPE_LABEL={STOCK:'Stock',TRANSFER:'Transfer',ASSEMBLE:'Assemble',MACHINE_NEW:'Machine new',MACHINE_ASSEMBLE:'Machine + assemble',
  MACHINE_TRIM:'Trim donor',VENDOR_STOCK:'Vendor on file',VENDOR_RFQ:'Ask vendor'};
const TYPE_GET={STOCK:'Transfer',TRANSFER:'Transfer',ASSEMBLE:'Assembly',MACHINE_NEW:'Machining',MACHINE_ASSEMBLE:'Machining',
  MACHINE_TRIM:'Machining',VENDOR_STOCK:'Purchase',VENDOR_RFQ:'Purchase'};   // #6477 GET chip for the line
const TYPE_CLASS={STOCK:'stock',TRANSFER:'transfer',ASSEMBLE:'assembly',MACHINE_NEW:'machining',MACHINE_ASSEMBLE:'machining',
  MACHINE_TRIM:'machining',VENDOR_STOCK:'purchase',VENDOR_RFQ:'purchase'};

/* ---------- styles (kept here so quote.html only gains one script tag) ---------- */
const css=document.createElement('style');
css.textContent=`
.src-btn{cursor:pointer;border:1px solid #3b2f63;background:#f3f0fa;color:#3b2f63;border-radius:10px;font-family:inherit;font-weight:800;
  font-size:9px;letter-spacing:.3px;padding:2px 7px;margin:1px 2px 1px 0;white-space:nowrap;text-transform:uppercase;}
.src-btn:hover{background:#3b2f63;color:#fff;}
.src-btn.busy{opacity:.6;cursor:progress;}
.fchip.src{background:#fff;color:#3b2f63;border:1px dashed #3b2f63;max-width:112px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;text-transform:none;letter-spacing:0;}
#srcOv{position:fixed;inset:0;background:rgba(26,26,26,.7);z-index:9999;display:flex;align-items:center;justify-content:center;}
#srcOv .box{background:#fff;border-radius:10px;padding:20px 24px;width:980px;max-width:96vw;max-height:92vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:13px;}
#srcOv h3{font-size:16px;margin:0;}
#srcOv .facts{font-size:12px;color:#555;margin:6px 0 10px;line-height:1.5;}
#srcOv .facts b{color:#231F20;}
#srcOv .sum{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px;}
#srcOv .sum span{background:#f1f1ef;border-radius:8px;padding:4px 10px;font-size:12px;}
#srcOv .sum span.ok{background:#d6f5e0;color:#1c7c3c;font-weight:700;}
#srcOv .sum span.short{background:#fbdcdc;color:#c8222a;font-weight:700;}
#srcOv table{width:100%;border-collapse:collapse;font-size:12px;}
#srcOv th{text-align:left;border-bottom:2px solid #000;padding:5px 6px;font-size:10px;text-transform:uppercase;white-space:nowrap;}
#srcOv td{padding:6px;border-bottom:1px solid #eee;vertical-align:top;}
#srcOv tr.blocked td{color:#999;background:#fafafa;}
#srcOv tr.best td{background:#fffbe6;}
#srcOv td.r{text-align:right;white-space:nowrap;}
#srcOv .rule{font-size:10px;color:#888;display:block;margin-top:2px;}
#srcOv .prov{color:#b8860b;font-weight:700;}
#srcOv .ev{font-size:10px;color:#777;display:block;margin-top:2px;white-space:normal;}
#srcOv .use{border:1px solid #3b2f63;background:#f3f0fa;color:#3b2f63;border-radius:10px;font-family:inherit;font-weight:800;font-size:10px;padding:3px 9px;cursor:pointer;white-space:nowrap;}
#srcOv .use:hover{background:#3b2f63;color:#fff;}
#srcOv .use.price{border-color:#b8860b;background:#fdf0d0;color:#7a5a00;}
#srcOv .use.price:hover{background:#FFDD00;color:#000;}
#srcOv .rate{cursor:pointer;color:#aaa;font-size:12px;margin-left:3px;text-decoration:none;}
#srcOv .rate:hover,#srcOv .rate.on{color:#231F20;}
#srcOv .foot{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:11px;color:#888;flex-wrap:wrap;}
#srcOv .foot .btn{padding:7px 14px;font-size:12px;}
#srcOv .notes{font-size:11px;color:#7a5a00;background:#fdf0d0;border-radius:6px;padding:6px 10px;margin:8px 0;}
#srcOv .err{color:#c8222a;font-weight:700;padding:10px 0;}
#srcOv .lead-ok{color:#1c7c3c;font-weight:700;}
#srcOv .lead-bad{color:#c8222a;font-weight:700;}
`;
document.head.appendChild(css);

/* ---------- helpers ---------- */
function money(v){if(v==null||v===''||isNaN(+v))return '—';return '$'+(+v).toFixed(2);}
function num(v){if(v==null||v==='')return '—';return (+v).toLocaleString();}
function lineKey(l){return K(l.pn)+'|'+(+l.qty||1)+'|'+(l.wh||'')+'|'+(CUST.reqby||'');}
function reqBy(){const m=(CUST.reqby||'').match(/\d{4}-\d{2}-\d{2}/);return m?m[0]:null;}
function fmtDate(s){return s?String(s).slice(0,10):'—';}
function fmtTs(s){return s?String(s).slice(0,16).replace('T',' '):'—';}
function h(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ---------- the check ---------- */
async function runCheck(i,force){
  const l=CART[i];if(!l||!l.pn)return null;
  const key=lineKey(l);
  if(!force&&RES[key])return RES[key];
  const {data,error}=await sb.rpc('sourcing_options',{p_pn:l.pn,p_qty:+l.qty||1,p_wh:l.wh||CUST.wh||'6 - Edmonton',
    p_required_by:reqBy(),p_quote_ref:CURRENT_QUOTE_ID||'unsaved'});
  if(error)throw error;
  RES[key]=data;
  l._srcLog=data&&data.log_id;
  const best=(data&&data.options||[]).find(o=>o.status!=='blocked');
  l._srcBest=best?best:null;
  return data;
}

/* ---------- per-line button + chip in the Fulfilment cell ---------- */
const _fulfilCell=fulfilCell;
fulfilCell=function(r,i){
  const base=_fulfilCell(r,i);
  if(!IS_STAFF||!r.pn)return base;
  const chosen=r._src;
  const chip=chosen?`<span class="fchip src" title="${esc('Sourcing: '+chosen.label+(chosen.ship_by?' · ship by '+chosen.ship_by:'')+(chosen.unit_cost!=null?' · cost '+money(chosen.unit_cost):''))}">${h(TYPE_LABEL[chosen.type]||chosen.type)}${chosen.lead_days!=null?' '+chosen.lead_days+'d':''}</span>`
    :(r._srcBest?`<span class="fchip src" style="opacity:.75" title="${esc('Best option found: '+r._srcBest.label+' — open Source to choose')}">★ ${h(TYPE_LABEL[r._srcBest.type]||r._srcBest.type)}</span>`:'');
  return `<button class="src-btn ${r._srcBusy?'busy':''}" onclick="srcOpen(${i})" title="Do we have this? Can we make it? When and how much? — stock, transfer, assembly, machining, vendor">${r._srcBusy?'…':'Source'}</button>${chip}${base}`;
};

/* a chosen option keeps its GET / production method through the cart rules engine's recalculation */
const _calcLine=calcLine;
calcLine=function(l){_calcLine.apply(this,arguments);
  if(l&&l._src&&l.pn){l._get=TYPE_GET[l._src.type]||l._get;l._prod=(l._src.type==='STOCK'||l._src.type==='TRANSFER')?'Catalog':'Production';}};

/* ---------- "Source all" in the cart toolbar ---------- */
function srcToolbar(){
  if(document.getElementById('srcAllBtn'))return;
  const anchor=Array.from(document.querySelectorAll('#cartPanel button')).find(b=>/saveQuote\('draft'\)/.test(b.getAttribute('onclick')||''));
  if(!anchor)return;
  const b=document.createElement('button');b.id='srcAllBtn';b.className='btn btn-ghost';b.style.cssText='padding:7px 14px;font-size:12px;display:none';
  b.textContent='Source all lines';b.title='Run the sourcing check on every line (stock → transfer → assembly → machining → vendor)';
  b.onclick=srcAll;anchor.insertAdjacentElement('afterend',b);
}
function srcToolbarVis(){const b=document.getElementById('srcAllBtn');if(b)b.style.display=(IS_STAFF&&CART.length)?'':'none';}
const _renderCart=renderCart;
renderCart=function(){_renderCart.apply(this,arguments);srcToolbar();srcToolbarVis();};
async function srcAll(){
  const b=document.getElementById('srcAllBtn');if(b){b.disabled=true;b.textContent='Sourcing…';}
  let n=0,bad=0;
  for(let i=0;i<CART.length;i++){const l=CART[i];if(!l.pn)continue;
    l._srcBusy=true;renderCart();
    try{await runCheck(i,false);n++;}catch(e){bad++;console.warn('sourcing',l.pn,e&&e.message);}
    l._srcBusy=false;}
  renderCart();
  if(b){b.disabled=false;b.textContent='Source all lines';}
  setSaveStatus('✓ Sourcing checked on '+n+' line(s)'+(bad?' — '+bad+' failed':'')+'. Open Source on a line to choose.',bad?'err':'');
}

/* ---------- the panel ---------- */
window.srcOpen=async function(i,force){
  const l=CART[i];if(!l||!l.pn)return;
  let ov=document.getElementById('srcOv');
  if(!ov){ov=document.createElement('div');ov.id='srcOv';ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});document.body.appendChild(ov);}
  ov.innerHTML=`<div class="box"><div style="display:flex;align-items:center"><h3>Source it — ${h(l.pn)}</h3><span onclick="document.getElementById('srcOv').remove()" style="margin-left:auto;cursor:pointer;font-size:20px;color:#888;line-height:1">×</span></div>
    <div class="facts"><span class="spin"></span> Checking stock, partner branches, bill of materials, material stock, donor parts and vendor offers…</div></div>`;
  l._srcBusy=true;renderCart();
  let d=null,err=null;
  try{d=await runCheck(i,!!force);}catch(e){err=e;}
  l._srcBusy=false;renderCart();
  if(!document.getElementById('srcOv'))return;      // closed while waiting
  if(err||!d){ov.innerHTML=`<div class="box"><div style="display:flex;align-items:center"><h3>Source it — ${h(l.pn)}</h3><span onclick="document.getElementById('srcOv').remove()" style="margin-left:auto;cursor:pointer;font-size:20px;color:#888;line-height:1">×</span></div>
    <div class="err">Sourcing check failed: ${h(err&&err.message||'no result')}</div><div class="foot">Staff sign-in is required; if you are signed in, try again in a moment.</div></div>`;return;}
  renderPanel(i,d);
};

function renderPanel(i,d){
  const l=CART[i],ov=document.getElementById('srcOv');if(!ov)return;
  const p=d.part||{};
  if(!d.found){
    ov.innerHTML=`<div class="box"><div style="display:flex;align-items:center"><h3>Source it — ${h(l.pn)}</h3><span onclick="document.getElementById('srcOv').remove()" style="margin-left:auto;cursor:pointer;font-size:20px;color:#888;line-height:1">×</span></div>
      <div class="err">${h(l.pn)} is not in the product master.</div>
      <div class="facts">A part that does not exist yet is a new-part request: check the drawing / description, find the nearest catalogue part with Find parts, or (phase 3) send a vendor RFQ.</div>
      <div class="foot"><button class="btn btn-ghost" onclick="srcOpen(${i},true)">Re-check</button></div></div>`;return;}
  const dims=(p.od_in||p.id_in||p.height_in)?`${p.id_in?(+p.id_in).toFixed(3)+' ID × ':''}${p.od_in?(+p.od_in).toFixed(3)+' OD':''}${p.height_in?' × '+(+p.height_in).toFixed(3):''}"${p.dims_from==='description'?' (from description)':''}`:'no dimensions on file';
  const ownOk=(+d.own_available||0)>=(+d.qty||1),totOk=(+d.total_available||0)>=(+d.qty||1);
  const opts=d.options||[];
  let bestIdx=opts.findIndex(o=>o.status!=='blocked');
  const rows=opts.map((o,k)=>{
    const blocked=o.status==='blocked';
    const xp=o.xpress;
    const price=xp?`${money(xp.list_after_break)}<span class="ev">Xpress list ${xp.price_year}${xp.break_pct?' − '+xp.break_pct+'% qty break':''} · matrix ${xp.matrix_od_in}" OD${xp.matrix_height_in?' × '+xp.matrix_height_in+'"':''}${xp.style?' · '+h(xp.style):''}${xp.volume_on_request?' · 31+ volume price on request':''}</span>`
      :`${money(o.list_price)}<span class="ev">product list price</span>`;
    const lead=blocked?'—':`${o.lead_days!=null?o.lead_days+' bd':(o.lead_label?h(o.lead_label):'?')}${o.ship_by?'<span class="ev">ship by '+h(o.ship_by)+'</span>':''}${o.meets_required_by===true?'<span class="ev lead-ok">✓ meets required-by</span>':(o.meets_required_by===false?'<span class="ev lead-bad">✗ after required-by</span>':'')}`;
    const ev=evidence(o);
    const prov=/provisional/i.test(o.rule||'')?' <span class="prov" title="Default rule — awaiting confirmation on the Open Items board">provisional</span>':'';
    const chosen=l._src&&l._src.type===o.type&&l._src.source===o.source;
    return `<tr class="${blocked?'blocked':''} ${k===bestIdx?'best':''}">
      <td class="r">${blocked?'':k===bestIdx?'★':k+1}</td>
      <td><b>${h(TYPE_LABEL[o.type]||o.type)}</b> — ${h(o.label)}${o.status&&!blocked?' <span style="color:#888">('+h(o.status)+')</span>':''}<span class="rule">${h(o.rule||'')}${prov}</span>${ev?'<span class="ev">'+ev+'</span>':''}</td>
      <td class="r">${o.qty_available!=null?num(o.qty_available):'—'}<span class="ev">${o.covers?'covers '+num(o.qty_covered):(o.qty_covered?'covers '+num(o.qty_covered)+' of '+num(d.qty):'covers none')}</span></td>
      <td class="r">${money(o.unit_cost)}<span class="ev">${h(o.cost_basis||'')}</span></td>
      <td class="r">${price}</td>
      <td class="r">${lead}</td>
      <td><span class="conf ${o.confidence==='high'?'high':(o.confidence==='medium'?'med':'low')}">${h(o.confidence||'')}</span></td>
      <td style="white-space:nowrap">${blocked?'':`<button class="use" onclick="srcUse(${i},${k})" title="Set this line's GET method and ETA from this option">${chosen?'✓ chosen':'Use'}</button> <button class="use price" onclick="srcUsePrice(${i},${k})" title="Put this option's list price in the line's Net Price">$</button>`}
        <a class="rate" onclick="srcRate(${i},${k},1,this)" title="Good option">👍</a><a class="rate" onclick="srcRate(${i},${k},-1,this)" title="Wrong or useless option — tell us why">👎</a></td></tr>`;}).join('');
  ov.innerHTML=`<div class="box">
    <div style="display:flex;align-items:center"><h3>Source it — ${h(p.part_number||l.pn)}</h3>
      <span style="margin-left:12px;font-size:12px;color:#666">qty <b>${num(d.qty)}</b> · for <b>${h(d.warehouse)}</b>${d.required_by?' · required by <b>'+h(d.required_by)+'</b>':' · no required-by date'}</span>
      <span onclick="document.getElementById('srcOv').remove()" style="margin-left:auto;cursor:pointer;font-size:20px;color:#888;line-height:1">×</span></div>
    <div class="facts">${h(p.description||'')} · <b>${h(p.profile_group||'?')}</b>${p.profile?' / '+h(p.profile):''} · ${h([p.material,p.compound].filter(Boolean).join(' / ')||'material n/a')}${p.machinable_family?' <span class="fchip get machining" style="vertical-align:middle">machinable: '+h(p.machinable_family)+'</span>':''}<br>
      ${h(dims)} · list ${money(p.list_price)} · cost ${money(p.current_cost)} · replenishment <b>${h(p.replenishment||'?')}</b> · status ${h(p.status||'?')}</div>
    <div class="sum"><span class="${ownOk?'ok':'short'}">Here: ${num(d.own_available)} available</span><span class="${totOk?'ok':'short'}">All branches: ${num(d.total_available)}</span>
      <span>GET method (#6477): <b>${h(d.get_method||'—')}</b></span>${d.bom_components?'<span>Bill of materials: '+d.bom_components+' component(s)</span>':''}
      <span title="Inventory copy last synced from Dynamics (Dynamics itself is loaded from P21 by the import tool)">stock as of ${fmtTs(d.stock_synced_at)}</span></div>
    ${(d.notes||[]).length?'<div class="notes">'+d.notes.map(h).join('<br>')+'</div>':''}
    <table><thead><tr><th style="width:26px">#</th><th>Option</th><th class="r">Available</th><th class="r">Unit cost</th><th class="r">Price</th><th class="r">Lead</th><th>Conf.</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="8" style="color:#888">No option found — nothing in stock, no bill of materials, no matching material or donor, no vendor on file. Phase 3 adds the vendor RFQ from here.</td></tr>'}</tbody></table>
    <div class="foot">
      <button class="btn btn-ghost" onclick="srcOpen(${i},true)">Re-check</button>
      <button class="btn btn-ghost" disabled title="Phase 3: vendor RFQ email + reply page (not built yet)">Ask a vendor (RFQ) — phase 3</button>
      <span>Ranking: <b>${h(d.rank_mode)}</b> — options that cover the quantity first, then those that meet the required-by date, then lead time, then cost. Costs are Dynamics base amounts (CAD). Rules marked <span class="prov">provisional</span> are defaults awaiting the Open Items board.</span>
      <span style="margin-left:auto">check #${h(d.log_id)} · ${fmtTs(d.checked_at)} · sourcing-panel ${SRC_BUILD}</span></div></div>`;
}
function evidence(o){
  const e=o.evidence||{};const parts=[];
  if(o.type==='STOCK'||o.type==='TRANSFER'){if(e.on_hand!=null)parts.push('on hand '+num(e.on_hand));if(e.in_transit)parts.push('in transit '+num(e.in_transit));if(e.on_po)parts.push('on PO '+num(e.on_po));if(e.transfer_allowed===false)parts.push('transfer not allowed');if(e.replenishment)parts.push(h(e.replenishment));}
  if(o.type==='ASSEMBLE'||o.type==='MACHINE_ASSEMBLE'||(o.type==='MACHINE_NEW'&&e.components)){(e.components||[]).forEach(c=>parts.push(h(c.pn)+' ×'+c.qty_per+' ('+num(c.total)+' avail'+(c.group==='Material'?', material':'')+(c.covered?'':', SHORT')+')'));}
  if(o.type==='MACHINE_NEW'&&e.stock_kind){parts.push(h(e.stock_kind)+' '+(e.stock_id_in?(+e.stock_id_in).toFixed(3)+' ID × ':'')+(+e.stock_od_in).toFixed(3)+' OD at '+h(e.stock_warehouse)+' ('+num(e.stock_qty)+' pcs) for a '+(+e.part_od_in).toFixed(3)+'" OD part, allowance '+e.allowance_in+'"');}
  if(o.type==='MACHINE_TRIM'){parts.push('donor '+(+e.donor_od_in).toFixed(3)+' OD'+(e.donor_id_in?' × '+(+e.donor_id_in).toFixed(3)+' ID':'')+(e.donor_height_in?' × '+(+e.donor_height_in).toFixed(3):'')+' at '+h(e.donor_warehouse)+' → '+(+e.part_od_in).toFixed(3)+' OD (max +'+e.max_oversize_pct+'%)');}
  if(o.type==='VENDOR_STOCK'){if(e.internal)parts.push(h(e.internal));if(o.vendor_part)parts.push('vendor part '+h(o.vendor_part));const lad=['p1','p10','p100','p1000'].filter(k=>e[k]!=null).map(k=>k.slice(1)+'+ '+money(e[k]));if(lad.length)parts.push('ladder '+lad.join(', '));if(e.currency&&e.currency!=='CAD')parts.push(h(e.currency)+' @ '+e.exchange_rate);if(e.line_min)parts.push('line min '+money(e.line_min));if(e.order_min)parts.push('order min '+money(e.order_min));if(e.tool_charge)parts.push('tooling '+money(e.tool_charge_price));if(e.quote_expiry)parts.push('quote expires '+fmtDate(e.quote_expiry));if(e.modified_on)parts.push('updated '+fmtDate(e.modified_on));}
  return parts.join(' · ');
}

/* ---------- actions ---------- */
function optAt(i,k){const l=CART[i];const d=l&&RES[lineKey(l)];return d&&d.options&&d.options[k]||null;}
window.srcUse=async function(i,k){
  const l=CART[i],o=optAt(i,k);if(!l||!o)return;
  l._src={type:o.type,label:o.label,source:o.source,unit_cost:o.unit_cost,list_price:o.list_price,lead_days:o.lead_days,ship_by:o.ship_by,log_id:l._srcLog};
  l._get=TYPE_GET[o.type]||l._get;        // GET chip (#6477) — persisted as quote_lines.get_method
  if(o.ship_by)l.eta=o.ship_by;           // ETA (BR-07) — persisted as quote_lines.eta
  if(o.type==='TRANSFER'){l.disp='T';l._dispManual=true;}
  else if(o.type==='STOCK'){l.disp='S';l._dispManual=true;}
  unlockSubmit();renderCart();
  try{await sb.rpc('sourcing_choose',{p_log_id:l._srcLog,p_option:o});}catch(e){console.warn('sourcing_choose',e&&e.message);}
  const d=RES[lineKey(l)];if(d)renderPanel(i,d);
};
window.srcUsePrice=function(i,k){
  const l=CART[i],o=optAt(i,k);if(!l||!o)return;
  const p=(o.xpress&&o.xpress.list_after_break!=null)?o.xpress.list_after_break:o.list_price;
  if(p==null){setSaveStatus('No list price on that option.','err');return;}
  l.price=+(+p).toFixed(2);l.discountType=o.xpress?'Xpress list':(l.discountType||null);
  unlockSubmit();renderCart();
  setSaveStatus('✓ Net price set to '+money(p)+' from '+(o.xpress?'the Xpress machining list':'the product list price')+' for '+l.pn+'.','');
};
window.srcRate=async function(i,k,rating,el){
  const l=CART[i],o=optAt(i,k);if(!l||!o)return;
  let comment=null;
  if(rating<0){comment=prompt('What is wrong with this option? (one line — it goes to the rules backlog)','');if(comment===null)return;}
  try{await sb.rpc('sourcing_rate',{p_log_id:l._srcLog,p_option_type:o.type,p_source:o.source,p_rating:rating,p_comment:comment||null});
    if(el){el.classList.add('on');const sib=el.parentElement.querySelectorAll('.rate');sib.forEach(x=>{if(x!==el)x.classList.remove('on');});}}
  catch(e){setSaveStatus('Could not save the rating: '+(e&&e.message),'err');}
};

/* ---------- keyboard: Alt+S opens Source on the focused cart row ---------- */
document.addEventListener('keydown',e=>{
  if(!e.altKey||e.key.toLowerCase()!=='s'||!IS_STAFF)return;
  const tr=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#cartBody tr');
  if(!tr)return;const rows=Array.from(document.querySelectorAll('#cartBody > tr')).filter(r=>!r.classList.contains('bom-row'));
  const i=rows.indexOf(tr);if(i>=0&&CART[i]){e.preventDefault();srcOpen(i);}
});
console.log('Marion sourcing-panel build',SRC_BUILD);
})();
