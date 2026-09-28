/* Marion quote.html script (split for pushability, build 2026-09-26.6) — part 3/3.
   Load order matters: quote-app-1.js -> 2 -> 3 (plain scripts, shared global scope). */
/* ---------- Catalog kit (BOM) expansion — explode_kit RPC, nested to 4 levels ---------- */
const BOM_MAX_DEPTH=4;
function fmtBomQty(q){const n=parseFloat(q);return isNaN(n)?'':(n%1?n.toFixed(2):String(n));}
function renderBomRows(r,i){
  if(!r._bomOpen||!r._bom||!r._bom.rows||!r._bom.rows.length)return '';
  const exp=r._bomExp||{};
  return r._bom.rows.map(b=>{
    const path=b.path||[], key=path.join('»');
    // a row is visible only if every ancestor kit on its path is expanded
    for(let k=2;k<path.length;k++){if(!exp[path.slice(0,k).join('»')])return '';}
    const canExpand=b.is_subkit&&b.depth<BOM_MAX_DEPTH;
    const expander=canExpand
      ? `<button class="bom-exp" data-k="${esc(key)}" onclick="toggleBomNode(${i},this.dataset.k)" title="${exp[key]?'Hide':'Show'} sub-kit components">${exp[key]?'−':'+'}</button>`
      : '';
    const tag=b.is_fee?'<span class="bom-fee">Fee</span>'
      :(b.is_subkit?'<span class="typetag kit">Kit</span>':'<span class="typetag item">Item</span>');
    const price=(b.unit_list_price!=null&&!b.is_fee)?('$'+(+b.unit_list_price).toFixed(2)):(b.unit_list_price!=null?('$'+(+b.unit_list_price).toFixed(2)):'—');
    const req=compReq(b,r);
    const cd=b.is_fee?'':compDisp(b,r), cg=b.is_fee?'':compGet(b,r);
    return `<tr class="bom-row">
    <td></td>
    <td style="white-space:nowrap;padding-left:${6+(b.depth-1)*16}px">${expander}${tag}</td>
    <td></td>
    <td style="white-space:nowrap;padding-left:${(b.depth-1)*16}px"><span class="kit-indent">↳</span><span class="bom-pn">${esc(b.component_part_number)}</span></td>
    <td><span class="bom-dim">${esc(b.component_description||'')}</span></td>
    <td></td><td></td>
    <td style="text-align:center" title="${fmtBomQty(b.extended_quantity)} per kit × line qty ${r.qty} = ${fmtBomQty(req)} required">${fmtBomQty(b.extended_quantity)}${(+r.qty>1)?'<span style="color:#888;font-size:11px"> ×'+r.qty+'</span>':''}</td>
    <td></td>
    <td style="text-align:center">${b.is_fee?'':onHandCellPn(b.component_part_number,req)}</td>
    <td style="text-align:center">${cd&&cd!=='-'?dispChip(cd):''}</td>
    <td>${cg?`<span class="fchip get ${cg.toLowerCase()}">${cg}</span>`:''}</td>
    <td style="text-align:right;font-size:12px;color:#555;padding-right:10px">${price}</td>
    <td></td>
    <td><span class="bom-dim" style="font-size:11px">${b.required===false?'optional':''}</span></td>
  </tr>`;}).join('');
}
async function loadBomFor(l){ // fetch a line's full BOM tree (components, qtys, list prices, fees)
  if(!l||!l.pn)return;
  if(l._bom&&l._bom.pn===l.pn)return;
  try{
    const {data,error}=await sb.rpc('explode_kit',{p_pn:l.pn,p_max_depth:BOM_MAX_DEPTH});
    l._bom={pn:l.pn,rows:(error?[]:(data||[]))};
    l._bomExp={};
    if(error)console.warn('explode_kit',error);
  }catch(e){console.warn('explode_kit',e);l._bom={pn:l.pn,rows:[]};}
}
async function toggleBom(i){
  const l=CART[i];if(!l||!l.pn)return;
  if(l._bomOpen){l._bomOpen=false;renderCart();return;}
  if(!l._bom||l._bom.pn!==l.pn){
    l._bomLoading=true;renderCart();
    await loadBomFor(l);
    l._bomLoading=false;
  }
  if(!l._bom.rows.length){l._bomKit=false;l._bomOpen=false;}
  else l._bomOpen=true;
  renderCart();
}
function toggleBomNode(i,key){const l=CART[i];if(!l)return;l._bomExp=l._bomExp||{};l._bomExp[key]=!l._bomExp[key];renderCart();}
let BOM_CHK=null;
function scheduleBomCheck(){clearTimeout(BOM_CHK);BOM_CHK=setTimeout(()=>{Promise.resolve(bomCheck()).then(()=>{fillStockFacts();fillNetPrices();});fillDescriptions();fillImages();},350);}
async function bomCheck(){
  const pns=[...new Set(CART.filter(l=>l.pn&&l._bomKit===undefined).map(l=>l.pn))];
  if(!pns.length)return;
  CART.forEach(l=>{if(l.pn&&l._bomKit===undefined)l._bomKit=null;}) // mark in-flight so we don't loop
  try{
    const {data,error}=await sb.from('bom_lines').select('parent_part_number').in('parent_part_number',pns);
    if(error){console.warn('bom check',error);return;}
    const kits=new Set((data||[]).map(x=>x.parent_part_number));
    let changed=false;
    CART.forEach(l=>{if(l.pn&&pns.includes(l.pn)){const v=kits.has(l.pn);if(l._bomKit!==v){l._bomKit=v;changed=true;}}});
    // stock check for kit lines (v_stock_staff, summed across warehouses)
    const stockPns=[...new Set(CART.filter(l=>l.pn&&l._bomKit===true&&l._stockChk===undefined).map(l=>l.pn))];
    if(stockPns.length){
      const stock={};
      try{
        const {data:sv,error:se}=await sb.from('v_stock_staff').select('part_number,qty_available,availability').in('part_number',stockPns);
        if(se)console.warn('stock check',se);
        (sv||[]).forEach(r=>{const t=stock[r.part_number]=stock[r.part_number]||{avail:0,label:r.availability||''};t.avail+=(+r.qty_available||0);if(r.availability)t.label=r.availability;});
      }catch(e2){console.warn('stock check',e2);}
      CART.forEach(l=>{if(l.pn&&stockPns.includes(l.pn)){const st=stock[l.pn];l._stockChk=true;l._stockAvail=st?st.avail:null;l._stockLabel=st?st.label:'No stock record';changed=true;}});
    }
    // BOM is critical for kit pricing/stock actions: always LOAD it, but auto-EXPAND only
    // when the kit itself is not in stock for the ordered qty — that's when staff must
    // work inside the tree. Stocked kits keep the tree collapsed behind the + button.
    const auto=CART.filter(l=>l.pn&&l._bomKit===true&&!l._bomAutoOpened&&(!l._bom||l._bom.pn!==l.pn));
    if(auto.length){
      await Promise.all(auto.map(loadBomFor));
      auto.forEach(l=>{
        l._bomAutoOpened=true;
        const short=(l._stockAvail==null)||(l._stockAvail<(+l.qty||1));
        if(l._bom&&l._bom.rows.length&&short)l._bomOpen=true;
      });
      changed=true;
    }
    if(changed)renderCart();
  }catch(e){console.warn('bom check',e);}
}
/* ---------- Line thumbnails: catalog product image per part number ----------
   images_for_parts RPC maps pn -> series (kits fall back to their first BOM component's
   series) + any cached series_images row. Missing series go through the marion-images
   edge function once, get downscaled to an 88px data-URL thumb here, and are written
   back to series_images so every later quote is a pure DB read. The thumb (data URL)
   renders in the on-screen card AND the html2pdf PDF (no cross-origin taint);
   the remote CMS image_url is what the notify email uses. */
let IMG_INFLIGHT={};
async function fillImages(){
  const pns=[...new Set(CART.filter(l=>l.pn&&!l.img&&!l._imgChk).map(l=>l.pn))];
  if(!pns.length||!SESSION)return;
  CART.forEach(l=>{if(l.pn&&pns.includes(l.pn))l._imgChk=true;});
  let rows=[];
  try{const {data,error}=await sb.rpc('images_for_parts',{p_pns:pns});if(error)throw error;rows=data||[];}
  catch(e){console.warn('images_for_parts',e);return;}
  const bySeries={};let hit=false;
  rows.forEach(r=>{
    if(r.thumb_data||r.image_url){assignImg(r.pn,r.thumb_data,r.image_url);hit=true;}
    else if(r.series&&r.page_url){(bySeries[r.series]=bySeries[r.series]||{page_url:r.page_url,pns:[]}).pns.push(r.pn);}
  });
  if(hit){renderCart();if(STEP===3)buildQuote();}
  Object.entries(bySeries).forEach(([series,info])=>{
    if(IMG_INFLIGHT[series])return;IMG_INFLIGHT[series]=true;
    fetchSeriesImage(series,info.page_url).then(res=>{
      if(!res)return;
      info.pns.forEach(pn=>assignImg(pn,res.thumb,res.image_url));
      renderCart();if(STEP===3)buildQuote();
    }).finally(()=>{delete IMG_INFLIGHT[series];});
  });
}
function assignImg(pn,thumb,url){const P=(pn||'').toUpperCase();
  CART.forEach(l=>{if(l.pn&&l.pn.toUpperCase()===P){if(thumb)l.img=thumb;if(url)l.imgUrl=url;}});}
async function fetchSeriesImage(series,pageUrl){
  if(!SESSION)return null;
  try{
    const res=await fetch(SB_URL+'/functions/v1/marion-images',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+SESSION.access_token},
      body:JSON.stringify({series,page_url:pageUrl})});
    if(!res.ok){console.warn('marion-images',series,res.status);return null;}
    const j=await res.json();
    if(!j.data_base64)return null;
    const thumb=await makeThumb('data:'+(j.media_type||'image/png')+';base64,'+j.data_base64);
    if(thumb)sb.from('series_images').upsert({series,image_url:j.image_url,thumb_data:thumb,
      updated_at:new Date().toISOString()}).then(({error})=>{if(error)console.warn('series_images upsert',error);});
    return {thumb,image_url:j.image_url};
  }catch(e){console.warn('series image',series,e);return null;}
}
function makeThumb(dataUrl){return new Promise(res=>{
  const im=new Image();
  im.onload=()=>{try{
    const S=88,c=document.createElement('canvas');c.width=S;c.height=S;
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,S,S);
    const r=Math.min(S/im.width,S/im.height),w=im.width*r,h=im.height*r;
    x.drawImage(im,(S-w)/2,(S-h)/2,w,h);
    res(c.toDataURL('image/jpeg',.82));
  }catch(e){console.warn('thumb',e);res(null);}};
  im.onerror=()=>res(null);
  im.src=dataUrl;});}

/* fill empty Description + Net Price cells from the products catalog (e.g. manually added lines) */
async function fillDescriptions(){
  const noDesc=l=>(!l.desc||!(''+l.desc).trim()), noPrice=l=>(l.price==null||l.price==='');
  const need=CART.filter(l=>l.pn&&!l._descChk&&(noDesc(l)||noPrice(l)));
  if(!need.length)return;
  need.forEach(l=>l._descChk=true); // one attempt per part number
  const pns=[...new Set(need.map(l=>l.pn))];
  try{
    const {data,error}=await sb.from('products').select('part_number,description,list_price').in('part_number',pns);
    if(error){console.warn('catalog fill',error);return;}
    const m={};(data||[]).forEach(p=>{m[p.part_number]=p;});
    let changed=false;
    CART.forEach(l=>{const p=l.pn&&m[l.pn];if(!p)return;
      if(noDesc(l)&&p.description){l.desc=p.description;changed=true;}
      if(noPrice(l)&&p.list_price!=null){l.price=+p.list_price;changed=true;}});
    if(changed){unlockSubmit();renderCart();}
  }catch(e){console.warn('catalog fill',e);}
}
/* ================= Cart rules engine =================
   BR-02 disposition, BR-03 production method, GET method (DevOps #6477,
   corrected priority: Transfer → Assembly → Machining → Purchase),
   BR-05/06 margin + 26% threshold, BR-07 delivery colour, BR-08 cart colour.
   Stock: get_stock (staff = exact per warehouse, customers = availability
   bands — decision 2026-07-28). Facts: get_cart_facts (cost staff-gated).
   Pricing: get_cart_prices / get_my_cart_prices — the July snapshot of the
   Dynamics Sales Pricing Configurator (Exclusions → Volume → Net Price →
   Percentage → List, first match wins; lowest price on conflict). */
function K(pn){return (pn||'').toUpperCase();}
function stAvail(pn){const s=STOCKC[K(pn)];if(!s)return null;
  if(s.total_available!=null)return +s.total_available;
  return s.availability==='In stock'?1e12:0;}
function compReq(b,line){return (+b.extended_quantity||0)*(+line.qty||1);}
function covered(pn,req){const a=stAvail(pn);return a==null?null:(a>=req);}
function calcLine(l){
  l._marginRed=false;l._marginTip='';
  if(!l.pn){l._dispAuto='-';l._prod=null;l._get=null;return;}
  const req=+l.qty||0;
  if(!req||isNaN(req)){l._dispAuto='-';l._prod=null;l._get=null;return;}
  const own=covered(l.pn,req);
  const rows=(l._bomKit&&l._bom&&l._bom.pn===l.pn&&l._bom.rows.length)?l._bom.rows.filter(b=>!b.is_fee):null;
  let allComp=null;
  if(rows&&rows.length){allComp=true;
    for(const b of rows){if(b.is_subkit)continue;
      const c=covered(b.component_part_number,compReq(b,l));
      if(c===false){allComp=false;break;}
      if(c===null)allComp=null;}}
  /* BR-02: S if own stock covers; kit: else S if ALL components cover; else B */
  let d=null;
  if(own===true)d='S';
  else if(rows&&allComp===true)d='S';
  else if(own===false&&(!rows||allComp===false))d='B';
  else if(own===false&&rows&&allComp===null)d=null;
  else if(own===false)d='B';
  l._dispAuto=d||'-';
  if(!l._dispManual&&d)l.disp=d;
  /* BR-03: production method */
  if(own===true)l._prod='Catalog';
  else if(rows&&rows.length)l._prod=(allComp===false)?'Production':'Catalog';
  else l._prod=(own===false)?'Production':null;
  /* GET method — #6477 corrected rules */
  l._get=computeGet(own,rows,allComp);
  /* BR-05/06: margin, cost basis for parts AND kits (fixes ERP BUG-03) */
  const f=FACTS[K(l.pn)];
  if(IS_STAFF&&l.price!=null&&l.price!==''){
    let cost=(f&&f.current_cost!=null)?+f.current_cost:null;
    if((cost==null||!cost)&&rows&&rows.length){
      cost=rows.reduce((s,b)=>s+((+b.unit_avg_cost||0)*(+b.extended_quantity||0)),0)||null;}
    if(cost){const m=((+l.price-cost)/cost)*100;
      l._marginTip='Margin '+m.toFixed(1)+'% (cost basis)';
      l._marginRed=(m<=LOW_MARGIN_PCT);}
    else l._marginTip='No cost data';
  }
}
function computeGet(own,rows,allComp){
  if(own===true)return 'Transfer';                                   /* 1 */
  if(own===null)return null;
  if(rows&&rows.length){
    if(allComp===true)return 'Assembly';                             /* 2 */
    if(rows.some(b=>{const f=FACTS[K(b.component_part_number)];return f&&f.profile_group==='Material';}))
      return 'Machining';                                            /* 3 */
  }
  return 'Purchase';                                                 /* 4 — default */
}
function compDisp(b,line){const c=covered(b.component_part_number,compReq(b,line));return c==null?'-':(c?'S':'B');}
function compGet(b,line){
  const c=covered(b.component_part_number,compReq(b,line));
  if(c===true)return 'Transfer';
  if(c===null)return '';
  if(b.is_subkit)return 'Assembly';
  return 'Purchase'; /* a short Material component is itself Purchased (#6477 example) */
}
function calcAll(){CART.forEach(calcLine);}
function dispChip(d){return `<span class="dchip ${d==='S'?'S':(d==='B'?'B':'N')}" title="Computed disposition (BR-02): S = fulfil from stock, B = backorder">${d||'–'}</span> `;}
function dispManual(i,v){CART[i].disp=v;CART[i]._dispManual=true;unlockSubmit();renderCart();}
function fulfilCell(r,i){
  if(!r.pn)return '';
  const chips=(r._prod?`<span class="fchip ${r._prod==='Catalog'?'cat':'prod'}" title="Production method (BR-03): Catalog = pull finished stock, Production = build/assemble">${r._prod}</span>`:'')+
              (r._get?`<span class="fchip get ${r._get.toLowerCase()}" title="GET method (Transfer → Assembly → Machining → Purchase)">${r._get}</span>`:'');
  const eta=IS_STAFF?`<br><input type="date" class="eta-in ${etaLate(r)?'late':''}" value="${r.eta||''}" onchange="setEta(${i},this.value)" title="Estimated delivery — red past 7 days out or after the required date (BR-07)">`:'';
  return chips+eta;
}
function etaLate(r){
  if(!r||!r.eta)return false;
  const d=new Date(r.eta+'T00:00:00'),now=new Date();now.setHours(0,0,0,0);
  if((d-now)/86400000>7)return true;
  const q=parseReqDate();return !!(q&&d>q);
}
function parseReqDate(){const m=(CUST.reqby||'').match(/\d{4}-\d{2}-\d{2}/);return m?new Date(m[0]+'T00:00:00'):null;}
function setEta(i,v){CART[i].eta=v||null;unlockSubmit();renderCart();}
function onHandCell(r){
  if(!r.pn)return '';
  const s=STOCKC[K(r.pn)];
  if(!s)return '<span style="color:#bbb" title="checking stock…">…</span>';
  const req=+r.qty||1;
  if(s.total_available!=null){const ok=+s.total_available>=req;
    return `<span class="onhand ${ok?'ok':'short'}" data-pn="${esc(r.pn)}" onclick="openWhPn(this.dataset.pn)" title="${esc(s.availability||'')} — click for every warehouse">${+s.total_available}</span>`;}
  const ok=s.availability==='In stock';
  return `<span class="onhand ${ok?'ok':'short'}" style="font-size:11px" data-pn="${esc(r.pn)}" onclick="openWhPn(this.dataset.pn)" title="click for warehouse availability">${esc(s.availability||'—')}</span>`;
}
function onHandCellPn(pn,req){
  const s=STOCKC[K(pn)];
  if(!s)return '<span style="color:#bbb">…</span>';
  if(s.total_available!=null){const ok=+s.total_available>=req;
    return `<span class="onhand ${ok?'ok':'short'}" style="font-size:12px" data-pn="${esc(pn)}" onclick="openWhPn(this.dataset.pn)">${+s.total_available}</span>`;}
  const ok=s.availability==='In stock';
  return `<span class="onhand ${ok?'ok':'short'}" style="font-size:11px" data-pn="${esc(pn)}" onclick="openWhPn(this.dataset.pn)">${esc(s.availability||'—')}</span>`;
}
async function fillStockFacts(){
  if(!SESSION)return;
  const pns=new Set();
  CART.forEach(l=>{if(l.pn)pns.add(l.pn);
    if(l._bom&&l._bom.rows)l._bom.rows.forEach(b=>{if(!b.is_fee&&b.component_part_number)pns.add(b.component_part_number);});});
  const need=[...pns].filter(p=>!STOCKC[K(p)]);
  const needF=[...pns].filter(p=>!FACTS[K(p)]);
  let changed=false;
  try{
    if(need.length){const {data,error}=await sb.rpc('get_stock',{p_pns:need});
      if(error)console.warn('get_stock',error);
      else (data||[]).forEach(x=>{STOCKC[K(x.part_number)]=x;changed=true;});
      need.forEach(p=>{if(!STOCKC[K(p)])STOCKC[K(p)]={part_number:p,availability:'Made to order',by_warehouse:null};});}
    if(needF.length){const {data,error}=await sb.rpc('get_cart_facts',{p_pns:needF});
      if(error)console.warn('get_cart_facts',error);
      else (data||[]).forEach(x=>{FACTS[K(x.part_number)]=x;changed=true;});}
  }catch(e){console.warn('stock/facts',e);}
  calcAll();
  if(changed)renderCart(); else renderTotals();
}
async function fillNetPrices(){
  if(!SESSION)return;
  const need=CART.filter(l=>l.pn&&l._priceAuto!==false&&!l._prcChk);
  if(!need.length)return;
  need.forEach(l=>l._prcChk=true);
  const items=need.map(l=>({pn:l.pn,qty:+l.qty||1}));
  try{
    const res=IS_STAFF
      ? await sb.rpc('get_cart_prices',{p_account:CUST.acct||'',p_items:items})
      : await sb.rpc('get_my_cart_prices',{p_items:items});
    if(res.error){console.warn('cart prices',res.error);return;}
    const m={};(res.data||[]).forEach(x=>{m[K(x.part_number)]=x;});
    let changed=false;
    need.forEach(l=>{const x=m[K(l.pn)];
      if(x&&x.net_price!=null){l.price=+x.net_price;l.discountType=x.discount_type||null;l.ruleId=x.rule_id||null;changed=true;}
      else if(x&&x.discount_type){l.discountType=x.discount_type;changed=true;}});
    if(changed){calcAll();renderCart();if(STEP===3)buildQuote();}
  }catch(e){console.warn('cart prices',e);}
}
/* BR-08 (adapted for quote intake): overall cart colour */
function cartTotal(){return CART.reduce((s,l)=>s+((l.price!=null&&l.price!=='')?(+l.price*(+l.qty||1)):0),0);}
function cartColor(){
  if(!CART.length)return {c:'red',why:['Cart is empty']};
  const why=[];
  const po=(CUST.po||'').trim();
  const badQty=CART.some(l=>!(+l.qty>0)||(+l.qty%1!==0));
  const anyB=CART.some(l=>l.pn&&l.disp==='B');
  const anyProd=CART.some(l=>l._prod==='Production');
  const anyLate=CART.some(etaLate);
  const anyMargin=IS_STAFF&&CART.some(l=>l._marginRed);
  const total=cartTotal();
  if(badQty)why.push('invalid quantity');
  if(!po)why.push('no PO');
  if(anyB)why.push('backorder line(s)');
  if(anyProd)why.push('production (not stocked)');
  if(anyLate)why.push('delivery past 7 days / required date');
  if(anyMargin)why.push('margin ≤ '+LOW_MARGIN_PCT+'%');
  if(total>250)why.push('total over $250');
  let c='green';
  if(badQty||anyLate||anyMargin||(!po&&CUST.reqtype==='order'))c='red';
  else if(anyB||anyProd||!po||total>250)c='yellow';
  return {c,why};
}
function renderTotals(){
  const el=document.getElementById('cartTotals');if(!el)return;
  if(!CART.length){el.innerHTML='';return;}
  const t=cartTotal(),r=cartColor();
  el.innerHTML=`<span><span class="tlight ${r.c}"></span><b style="text-transform:uppercase">${r.c}</b>${r.why.length?' <span style="color:#888;font-size:11px">'+esc(r.why.join(' · '))+'</span>':''}</span>
    <span style="margin-left:auto">${CART.length} line${CART.length>1?'s':''} · <b>Cart total: ${t>0?'$'+t.toFixed(2):'pending pricing'}</b></span>`;
}
/* warehouse inventory popup — every warehouse, staff exact / customer bands */
function openWh(i){const l=CART[i];if(!l||!l.pn)return;openWhPn(l.pn,i);}
async function openWhPn(pn,i){
  if(document.getElementById('whOv'))return;
  let s=STOCKC[K(pn)];
  if((!s||!s.by_warehouse)&&SESSION){
    try{const {data}=await sb.rpc('get_stock',{p_pns:[pn]});if(data&&data[0]){s=data[0];STOCKC[K(pn)]=s;}}catch(e){}}
  const d=document.createElement('div');d.id='whOv';
  const rows=(s&&s.by_warehouse)?s.by_warehouse:[];
  const staffCols=!!(rows.length&&rows[0].qty_available!==undefined);
  const pickable=(i!=null&&i!==undefined);
  d.innerHTML=`<div class="box"><div style="display:flex;align-items:center;margin-bottom:8px"><b style="font-size:14px">Inventory — ${esc(pn)}</b><span onclick="document.getElementById('whOv').remove()" style="margin-left:auto;cursor:pointer;font-size:18px;color:#888;line-height:1">×</span></div>
    ${s?`<div style="font-size:12px;color:#666;margin-bottom:8px">${esc(s.availability||'')}${s.total_available!=null?' · '+(+s.total_available)+' available across '+(s.warehouses_with_stock||0)+' warehouse(s)':''}${s.best_lead_time_days?' · best lead '+s.best_lead_time_days+' day(s)':''}</div>`:''}
    <table><thead><tr><th>Warehouse</th>${staffCols?'<th style="text-align:right">Available</th>':''}<th>Availability</th></tr></thead><tbody>
    ${rows.length?rows.map(w=>`<tr class="${pickable?'pick':''}" ${pickable?`onclick="pickWh(${i},this.dataset.w)" data-w="${esc(w.warehouse)}"`:''}><td>${esc(w.warehouse)}</td>${staffCols?`<td style="text-align:right;font-weight:700">${w.qty_available}</td>`:''}<td>${esc(w.availability||'')}</td></tr>`).join(''):`<tr><td colspan="3" style="color:#888">No stock at any warehouse${s&&s.availability?' — '+esc(s.availability):''}</td></tr>`}
    </tbody></table>
    ${pickable?'<div style="font-size:11px;color:#888;margin-top:8px">Click a warehouse to use it for this line.</div>':''}</div>`;
  d.addEventListener('click',e=>{if(e.target===d)d.remove();});
  document.body.appendChild(d);
}
function pickWh(i,w){const l=CART[i];if(l&&w){l.wh=w;unlockSubmit();}const o=document.getElementById('whOv');if(o)o.remove();renderCart();}
/* ---------- Find parts tab (staff): find.html embedded in step 1 ---------- */
function reqTab(which){
  const ask=document.querySelector('#reqPanel .panel-b'),fw=document.getElementById('findWrap'),
        ta=document.getElementById('rtabAsk'),tf=document.getElementById('rtabFind');
  if(!fw||!ta)return;
  const find=(which==='find');
  if(find){const f=document.getElementById('findFrame');if(f&&!f.getAttribute('src'))f.src='find.html?embed=1';}
  if(ask)ask.classList.toggle('hidden',find);
  fw.classList.toggle('hidden',!find);
  ta.classList.toggle('active',!find);if(tf)tf.classList.toggle('active',find);
}
window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  const d=e.data;
  if(d&&d.type==='marion-find-lines'&&Array.isArray(d.lines))addFindLines(d.lines);
});
function addFindLines(lines){
  let n=0;
  (lines||[]).forEach(x=>{if(!x||!x.pn)return;
    CART.push({conf:'high',oem:'',brand:'',pn:x.pn,desc:x.desc||'',ref:x.kitOf||'',qty:+x.qty||1,
      wh:CUST.wh||'6 - Edmonton',disp:'B',notes:'find parts',type:'item',kitGroup:null,price:null});n++;});
  if(n){unlockSubmit();orderKits();renderCart();goStep(2);setSaveStatus('✓ '+n+' line(s) added from Find parts.','');}
}
function checkFindHandoff(){
  const bar=document.getElementById('findBar');if(!bar)return;
  if(!IS_STAFF){bar.innerHTML='';return;}
  let j=null;try{j=JSON.parse(localStorage.getItem('marion_find_handoff')||'null');}catch(e){}
  if(!j||!j.lines||!j.lines.length){bar.innerHTML='';return;}
  bar.innerHTML=`<div class="findbar">A Find-parts list is waiting${j.at?' (saved '+esc(j.at.slice(0,16).replace('T',' '))+')':''} — ${j.lines.length} line(s)
    <button class="btn btn-go" style="padding:5px 12px;font-size:11px;margin-left:auto" onclick="importFindHandoff()">Import to cart</button>
    <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px" onclick="localStorage.removeItem('marion_find_handoff');checkFindHandoff()">Dismiss</button></div>`;
}
function importFindHandoff(){
  let j=null;try{j=JSON.parse(localStorage.getItem('marion_find_handoff')||'null');}catch(e){}
  if(j&&j.lines)addFindLines(j.lines);
  try{localStorage.removeItem('marion_find_handoff');}catch(e){}
  checkFindHandoff();
}

function esc(s){return (s+'').replace(/"/g,'&quot;');}
function upd(i,k,v){const old=CART[i][k];CART[i][k]=(k==='qty')?(parseInt(v)||1):(k==='price')?((v===''||v==null)?null:(isNaN(parseFloat(v))?null:parseFloat(v))):v;
  if(k==='qty'){CART[i]._prcChk=false;} // volume tiers depend on qty — re-price
  if(k==='price'){CART[i]._priceAuto=false;CART[i].discountType=null;CART[i].ruleId=null;} // manual price wins
  if(k==='pn'&&v){CART[i].conf='high';if(v!==old)logFeedback(CART[i],'manual_edit',old);
    CART[i]._prcChk=false;CART[i]._priceAuto=undefined;CART[i].discountType=null;CART[i].ruleId=null;
    CART[i]._dispManual=false;CART[i]._dispAuto=null;CART[i]._prod=null;CART[i]._get=null;
    CART[i].url=null; // re-resolve the website link for the new number
    CART[i]._bomKit=undefined;CART[i]._bom=null;CART[i]._bomOpen=false;CART[i]._descChk=false; // re-check BOM + description for the new number
    CART[i].img=null;CART[i].imgUrl=null;CART[i]._imgChk=false; // re-resolve the catalog image for the new number
    CART[i]._bomAutoOpened=false; // new number: allow its BOM to auto-open again
    CART[i]._stockChk=undefined;CART[i]._stockAvail=null;CART[i]._stockLabel=null; // re-check stock for the new number
    sb.rpc('link_for_part',{p_pn:v}).then(({data})=>{if(CART[i]&&CART[i].pn===v){CART[i].url=data||null;renderCart();}});
  } // learning: hand-typed part numbers are corrections
  unlockSubmit(); renderCart();}
function delRow(i){CART.splice(i,1);unlockSubmit();orderKits();renderCart();}
function addRow(){CART.push({conf:'low',oem:'',brand:'',pn:'',desc:'',ref:'',qty:1,wh:CUST.wh,disp:'B',notes:'manual',type:'item',kitGroup:null,price:null});unlockSubmit();renderCart();}

/* ---------- Multi Add: hold "+ Add line" to paste a parts list ---------- */
let MA_HOLD=null,MA_HELD=false;
function initAddLineHold(){
  const b=document.getElementById('addLineBtn');if(!b)return;
  const arm=()=>{MA_HELD=false;clearTimeout(MA_HOLD);MA_HOLD=setTimeout(()=>{MA_HELD=true;openMultiAdd();},500);};
  const disarm=()=>{clearTimeout(MA_HOLD);MA_HOLD=null;};
  b.addEventListener('pointerdown',arm);
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,disarm));
  b.addEventListener('click',()=>{if(MA_HELD){MA_HELD=false;return;}addRow();});
  b.addEventListener('contextmenu',e=>e.preventDefault()); /* touch long-press */
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAddLineHold);else initAddLineHold();

function openMultiAdd(){
  if(document.getElementById('maOv'))return;
  const d=document.createElement('div');d.id='maOv';
  d.style.cssText='position:fixed;inset:0;background:rgba(26,26,26,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  d.innerHTML='<div style="background:#fff;border-radius:10px;padding:26px 28px;width:460px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,.35)">'
    +'<div style="display:flex;align-items:center;margin-bottom:6px"><b style="font-size:15px">Multi Add — paste a parts list</b>'
    +'<span onclick="closeMultiAdd()" style="margin-left:auto;cursor:pointer;font-size:18px;color:#888;line-height:1">×</span></div>'
    +'<div style="font-size:12px;color:#666;margin-bottom:10px">One part per line. Optional quantity after a comma or tab — e.g. <code>2A95D29A74V90 16ORB-V, 4</code></div>'
    +'<select id="maKind" style="width:100%;border:1px solid #cfcfcd;border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px;box-sizing:border-box">'
    +'<option value="oem">Customer / OEM part numbers</option><option value="pn">Fluidseal part numbers</option></select>'
    +'<textarea id="maList" rows="9" placeholder="Enter each part on a new line" style="width:100%;border:1px solid #cfcfcd;border-radius:6px;padding:10px;font-family:Consolas,\'Courier New\',monospace;font-size:12.5px;box-sizing:border-box"></textarea>'
    +'<div style="margin-top:12px;display:flex;gap:8px;align-items:center">'
    +'<button class="btn btn-go" style="padding:8px 18px;font-size:12px" onclick="resolveMultiAdd()">Add to cart</button>'
    +'<span id="maMsg" style="font-size:12px;color:#666"></span></div></div>';
  document.body.appendChild(d);
  d.addEventListener('click',e=>{if(e.target===d)closeMultiAdd();});
  setTimeout(()=>{const t=document.getElementById('maList');if(t)t.focus();},50);
}
function closeMultiAdd(){const d=document.getElementById('maOv');if(d)d.remove();}
function resolveMultiAdd(){
  const kind=document.getElementById('maKind').value;
  const rows=document.getElementById('maList').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!rows.length){document.getElementById('maMsg').textContent='Nothing to add — paste or type part numbers first.';return;}
  rows.forEach(raw=>{
    let pn=raw,qty=1;
    const m=raw.match(/^(.*?)[,\t]\s*(\d+)\s*$/);
    if(m){pn=m[1].trim();qty=parseInt(m[2])||1;}
    CART.push({conf:kind==='pn'?'high':'low',oem:kind==='oem'?pn:'',brand:'',pn:kind==='pn'?pn:'',
      desc:'',ref:'',qty,wh:CUST.wh||'6 - Edmonton',disp:'B',notes:'multi-add',type:'item',kitGroup:null,price:null});
  });
  closeMultiAdd();unlockSubmit();renderCart();
  crossRefCart(); // resolve OEM numbers / links for the pasted list
}

/* ---------- Kits: drag a line's ⋮⋮ handle onto another line to nest ---------- */
let DRAG_I=null;
function dragLine(e,i){DRAG_I=i;e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',String(i));}catch(_){}
  const tr=e.target.closest('tr');if(tr)requestAnimationFrame(()=>tr.classList.add('dragging'));}
function dragOver(e,i){if(DRAG_I===null||DRAG_I===i)return;e.preventDefault();
  e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('drop-hint');}
function dragLeave(e){e.currentTarget.classList.remove('drop-hint');}
function dropLine(e,i){e.preventDefault();e.stopPropagation();e.currentTarget.classList.remove('drop-hint');
  const s=DRAG_I;DRAG_I=null;if(s===null||s===i)return;dropOnRow(s,i);}
document.addEventListener('dragend',()=>{DRAG_I=null;
  const cp=document.getElementById('cartPanel');if(cp)cp.classList.remove('kit-out');
  document.querySelectorAll('tr.dragging,tr.drop-hint').forEach(t=>t.classList.remove('dragging','drop-hint'));});

/* drop a kit component anywhere in the cart panel (off the rows) to un-nest it */
function initKitDragOut(){
  const p=document.getElementById('cartPanel');if(!p)return;
  const draggingChild=()=>{const l=DRAG_I!==null?CART[DRAG_I]:null;return l&&l.kitGroup&&l.type!=='kit';};
  const offRows=e=>!(e.target.closest&&e.target.closest('#cartBody tr'));
  p.addEventListener('dragover',e=>{
    if(!draggingChild())return;
    if(offRows(e)){e.preventDefault();e.dataTransfer.dropEffect='move';p.classList.add('kit-out');}
    else p.classList.remove('kit-out');
  });
  p.addEventListener('dragleave',e=>{if(e.target===p)p.classList.remove('kit-out');});
  p.addEventListener('drop',e=>{
    p.classList.remove('kit-out');
    if(!draggingChild()||!offRows(e))return;
    e.preventDefault();const i=DRAG_I;DRAG_I=null;unnest(i);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initKitDragOut);else initKitDragOut();

/* build stamp — bump on every push; hover the PHASE 3 badge or check the console */
const MARION_BUILD='2026-09-28.2'; // .2: callMarion surfaces the upstream API error text (e.g. credit balance too low) and recovers JSON with // comment lines / trailing commas — .1: HISTORY FIRST: crossRefCart step 0 calls history_lookup (this customer's quotes / invoices for the ask, then other customers), Review modal shows history rows (board item 40) — .1: // extraction use_tools:false; echo guard verifies Fluidseal codes via part_info; no dimensional search without a diameter; invented codes flagged; OEM-first only for recognised brands (ABQUOTE evaluation run 1 fixes) — .6: // cart rules engine: computed disposition/production/GET (#6477), warehouse inventory popup, pricing configurator engine (#8353) + margin colours (BR-05/06), totals + traffic light (BR-08), ETA (BR-07), Find-parts tab, submit revisions; merges .5 (P21 card reformat + FS_LOGO wordmark)
console.log('Marion quote.html build',MARION_BUILD);
(function(){const b=document.getElementById('buildStamp');if(b)b.title='build '+MARION_BUILD;})();

function nextKitGroup(){const used=CART.map(l=>l.kitGroup).filter(Boolean);return used.length?Math.max(...used)+1:1;}
function dropOnRow(s,t){
  const a=CART[s],b=CART[t];
  if(!a||!b||a.type==='kit')return; /* kits can't be nested */
  if(b.kitGroup){a.kitGroup=b.kitGroup;}
  else{b.type='kit';b.kitGroup=nextKitGroup();a.kitGroup=b.kitGroup;}
  a.type='item';
  unlockSubmit();orderKits();renderCart();
}
function unnest(i){const l=CART[i];if(!l)return;l.kitGroup=null;l.type='item';unlockSubmit();orderKits();renderCart();}
/* keep components physically after their kit parent; dissolve broken groups */
function orderKits(){
  const groups={};
  CART.forEach(l=>{if(l.kitGroup){const g=groups[l.kitGroup]=groups[l.kitGroup]||{parent:null,kids:[]};
    if(l.type==='kit')g.parent=l;else g.kids.push(l);}});
  Object.values(groups).forEach(g=>{
    if(!g.parent)g.kids.forEach(k=>{k.kitGroup=null;});
    else if(!g.kids.length){g.parent.type='item';g.parent.kitGroup=null;}
  });
  const out=[];
  CART.forEach(l=>{
    if(l.kitGroup&&l.type!=='kit')return; /* appended with parent below */
    out.push(l);
    if(l.type==='kit'&&l.kitGroup)CART.forEach(c=>{if(c!==l&&c.kitGroup===l.kitGroup)out.push(c);});
  });
  CART=out;
}

/* sync meta inputs -> CUST so manual edits after analysis are kept */
[['mCust','acct'],['mContact','contact'],['mPhone','phone'],['mPO','po'],['mEmail','email'],['mAddr','addr'],['mReqBy','reqby']]
  .forEach(([id,k])=>{const el=document.getElementById(id);
    if(el)el.addEventListener('input',()=>{CUST[k]=el.value.trim();renderCust();
      if(k==='acct'){CART.forEach(l=>{if(l._priceAuto!==false)l._prcChk=false;});}
      if(k==='acct'||k==='po'||k==='reqby'){renderTotals();scheduleBomCheck();}});});
(()=>{const sel=document.getElementById('mReqType');
  if(sel)sel.addEventListener('change',()=>{CUST.reqtype=sel.value;renderCust();});})();

/* sync editable customer strip */
['cAcct','cContact','cPhone','cWh','cType','cReqBy'].forEach(id=>{
  document.addEventListener('input',e=>{ if(e.target.id===id){
    const k={cAcct:'acct',cContact:'contact',cPhone:'phone',cWh:'wh',cType:'reqtype',cReqBy:'reqby'}[id];
    CUST[k]=e.target.textContent.trim();
  }});
});

/* ---------- Quote output — SAME card the customer/Fluidseal get by email (cardHTML) ---------- */
function buildQuote(){
  const out=document.getElementById('quoteOut');
  if(!CART.length){out.innerHTML='<div class="hint">Cart is empty — add lines in step 2 (Cart — Review) first.</div>';return;}
  const q={quote_no:SUBMITTED_NO||(SUBMITTED?'…':'PREVIEW'),
    status:(SUBMITTED?'submitted':(CURRENT_QUOTE_ID?'draft':'not saved'))+(REVISION>0?' · rev '+REVISION:''),
    created_at:Date.now(),acct:CUST.acct,contact:CUST.contact,phone:CUST.phone,
    po:CUST.po,address:CUST.addr,required_by:CUST.reqby,req_type:CUST.reqtype};
  const lines=CART.map(l=>{
    const priced=(l.price!=null&&l.price!=='');
    const child=!!(l.kitGroup&&l.type!=='kit'), isKit=l.type==='kit';
    return {pn:l.pn,descr:(isKit?'KIT: ':child?'↳ ':'')+(l.desc||''),oem:l.oem,reference:l.ref,qty:l.qty,disp:l.disp,
      unit_price:priced?+l.price:null,
      line_total:priced?+(l.price*l.qty).toFixed(2):null,
      thumb:l.img||null,img_url:l.imgUrl||null};
  });
  const anyPriced=lines.some(l=>l.unit_price!=null);
  out.innerHTML=activeCardHTML(q,lines,(SESSION&&SESSION.user.email)||CUST.email||'—')+
    (anyPriced?'':'<div style="margin:0 0 14px;font-size:11px;color:#888;text-align:center">Net prices are added by Fluidseal staff after you submit — submit this quote and we’ll price it and get back to you.</div>');
}

function copyJSON(){
  const payload={customer:CUST,lines:CART};
  navigator.clipboard.writeText(JSON.stringify(payload,null,2))
    .then(()=>setStatus('Cart JSON copied to clipboard.',''));
}
function clearAll(){
  document.getElementById('req').value='';
  ['mCust','mContact','mPhone','mPO','mEmail','mAddr','mReqBy'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mReqType').value='quote';
  CART=[];CUST={acct:'',contact:'',phone:'',po:'',email:'',addr:'',wh:'6 - Edmonton',reqby:'',reqtype:'quote'};IMAGES=[];PDFS=[];LAST_P21_NO='';
  CURRENT_QUOTE_ID=null;
  SUBMITTED=false;SUBMITTED_NO=null;REVISION=0;EVER_SUBMITTED=false;refreshNav();
  STOCKC={};FACTS={};
  renderAttachments();renderCust();renderCart();
  document.getElementById('quoteOut').innerHTML='<div class="hint">The quote preview appears here once the cart has lines.</div>';
  setSaveStatus('','');
  document.getElementById('intentBanner').className='intent-banner hidden';
  setStatus('','');
}
setCardStyle(CARD_STYLE);
initDnD();
goStep(1);
