// core.ts — pure logic of dynamics-import (no Deno, no network): constants, Dataverse payloads, changesets,
// $batch body builder and response parser. Imported by index.ts (Deno) and by the local test (node).
export const TENANT = "69be7d1e-8339-4386-b7fd-cc1c40c98f15";
export const CLIENT = "37732b85-ca86-4300-a154-88d31e2bbe9b";       // # Fluidseal-Supabase-Sync
export const ORG = "https://fluidseal.crm.dynamics.com";
export const API = `${ORG}/api/data/v9.2`;
export const SALES_BOT = "1edd009c-0861-47d7-95c7-c06d312eb025";     // systemuser "Sales Bot" (dynamicsIT@sealsonline.com)
export const OWNER = "738f0165-06bf-e411-80e2-fc15b4287cac";         // the IMPORT tool's fixed owner (D365Ids.defaultOwnerId)
export const PRICE_LEVEL = "24c4a348-4ebe-e411-80e7-c4346bac4ae8";   // D365Ids.priceLevelId
export const UOM = "e84ce847-cfab-e411-80dc-fc15b4288c40";           // LI-INVOICE template: fixed unit
export const DISPOSITION = "Stock";                                  // David, Q11
export const DISCOUNT_NO_DISCOUNT = 5;                               // ab_discounttype as on the January lines
export const TIME_BUDGET_MS = 200_000;                               // wall clock is 400 s, but the isolate dies after roughly 2 s of CPU — building and parsing multipart $batch bodies
                                                                     // is CPU work, so ONE wave per invocation (see WAVES_PER_CALL) and the chain / watchdog do the rest
export const BATCH_REQUESTS = 75;                                    // requests per Dataverse $batch; one invoice = one changeset (100 hit the 170 s timeout in ~30 % of waves at night)
export const PARALLEL_BATCHES = 4;                                   // $batch requests in flight at once — 4 x 100 x ~95 s per ~130 s cycle stays under the 20-min-per-5-min execution-time limit
export const WAVES_PER_CALL = 1;                                     // waves of PARALLEL_BATCHES per invocation

export interface BatchReq { method: "GET" | "POST" | "PATCH"; url: string; body?: unknown; contentId?: number }
export interface BatchPart { status: number; contentId?: number; entityId?: string; body: any; raw?: string }
export interface BatchResult { parts: BatchPart[]; changesets: { ok: boolean; parts: BatchPart[]; error?: string }[] }

/** Build the multipart body of one $batch: `sets` = changesets (each all-or-nothing), `gets` = independent GETs. */
export function buildBatchBody(api: string, bnd: string, sets: BatchReq[][], gets: BatchReq[] = []): string {
  const lines: string[] = [];
  for (const g of gets) {
    lines.push(`--${bnd}`, "Content-Type: application/http", "Content-Transfer-Encoding: binary", "", `GET ${api}/${g.url} HTTP/1.1`, "Accept: application/json", "OData-Version: 4.0", "");
  }
  sets.forEach((set) => {
    const cs = `changeset_${crypto.randomUUID()}`;
    lines.push(`--${bnd}`, `Content-Type: multipart/mixed; boundary=${cs}`, "");
    set.forEach((rq, i) => {
      lines.push(`--${cs}`, "Content-Type: application/http", "Content-Transfer-Encoding: binary", `Content-ID: ${rq.contentId ?? i + 1}`, "",
        `${rq.method} ${api}/${rq.url} HTTP/1.1`, "Content-Type: application/json;type=entry", "Accept: application/json", "OData-Version: 4.0", "",
        JSON.stringify(rq.body ?? {}));
    });
    lines.push(`--${cs}--`);
  });
  lines.push(`--${bnd}--`, "");
  return lines.join("\r\n");
}

export function parseHttpPart(part: string): BatchPart {
  // part = "Content-Type: application/http\r\n...Content-ID: n\r\n\r\nHTTP/1.1 204 No Content\r\nHeader: v\r\n\r\nbody"
  const m = /HTTP\/1\.1 (\d{3})[^\r\n]*\r?\n([\s\S]*?)(\r?\n\r?\n|$)([\s\S]*)/.exec(part);
  const preHeaders = part.slice(0, part.indexOf("HTTP/1.1"));
  const cid = /Content-ID:\s*(\d+)/i.exec(preHeaders);
  if (!m) return { status: 0, body: null, raw: part.slice(0, 500), contentId: cid ? Number(cid[1]) : undefined };
  const status = Number(m[1]);
  const headers = m[2];
  const eid = /OData-EntityId:\s*(\S+)/i.exec(headers);
  const cid2 = /Content-ID:\s*(\d+)/i.exec(headers);
  let body: any = null; const raw = (m[4] || "").trim();
  if (raw) { try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 500) }; } }
  const idm = eid ? /\(([0-9a-f-]{36})\)/i.exec(eid[1]) : null;
  return { status, contentId: cid ? Number(cid[1]) : cid2 ? Number(cid2[1]) : undefined, entityId: idm ? idm[1] : undefined, body };
}

export type BatchEntry = { kind: "single"; part: BatchPart } | { kind: "changeset"; parts: BatchPart[] };
export function parseBatchEntries(text: string, contentType: string): BatchEntry[] {
  const bm = /boundary=([^;\s]+)/.exec(contentType);
  const bnd = bm ? bm[1] : (/--(batchresponse_[^\r\n]+)/.exec(text) || [])[1];
  if (!bnd) throw new Error(`batch response without boundary: ${text.slice(0, 300)}`);
  const entries: BatchEntry[] = [];
  const chunks = text.split(`--${bnd}`).slice(1).filter((c) => !c.startsWith("--"));
  for (const chunk of chunks) {
    const head = chunk.split("\r\n\r\n")[0] || "";
    const cm = /boundary=([^;\s]+)/.exec(head);
    if (cm && chunk.includes(`--${cm[1]}`)) {
      const inner = chunk.split(`--${cm[1]}`).slice(1).filter((c) => !c.startsWith("--"));
      entries.push({ kind: "changeset", parts: inner.map(parseHttpPart) });
    } else entries.push({ kind: "single", part: parseHttpPart(chunk) });
  }
  return entries;
}

/** Map the ordered response entries back onto what was sent: GETs first (single parts), then one entry per changeset
 *  (a failed changeset comes back as ONE single error part in its place). */
export function alignBatch(entries: BatchEntry[], nGets: number, nSets: number): BatchResult {
  const out: BatchResult = { parts: [], changesets: [] };
  let i = 0;
  for (; i < nGets && i < entries.length; i++) {
    const e = entries[i];
    out.parts.push(e.kind === "single" ? e.part : (e.parts[0] || { status: 0, body: null }));
  }
  for (let k = 0; k < nSets; k++, i++) {
    const e = entries[i];
    if (!e) { out.changesets.push({ ok: false, parts: [], error: "no response part" }); continue; }
    if (e.kind === "changeset") out.changesets.push({ ok: e.parts.every((p) => p.status >= 200 && p.status < 300), parts: e.parts });
    else out.changesets.push({ ok: false, parts: [e.part], error: `${e.part.status}` });
  }
  return out;
}

// ---------- helpers ----------
export const num = (s: unknown) => { const n = parseFloat(String(s ?? "")); return Number.isFinite(n) ? n : 0; };
export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
export const esc = (s: string) => s.replace(/'/g, "''");
export const clip = (s: string, n: number) => (s || "").slice(0, n);

/** attribute logical name -> single-valued navigation property name (from EntityDefinitions ManyToOneRelationships) */
export type NavMap = Record<string, string>;
export const bind = (nav: NavMap, attr: string) => `${nav[attr] || attr}@odata.bind`;

export interface Line { id: number; line_no: string; item: string; desc1: string; desc2: string; qty: string; qty_per_kit?: number | string | null; needs_uom?: boolean; uom?: string | null; ut_price: string; ut_cost: string; multiplier: string; net_price: number | null; inv_date: string; product_id: string | null; product_description: string | null; is_writein: boolean; kit_role: string | null; kit_group: string | null; inventory_id: string | null; cust_po: string }
export interface Inv { invoice_key: string; ord: string; ship: string; inv_date: string; cust_code: string; customer_code_id: string; account_id: string | null; warehouse_id: string | null; cust_po: string; total_net: number; lines: Line[] }

export function headerPayload(inv: Inv, nav: NavMap = {}) {
  const p: Record<string, unknown> = {
    name: `INVOICE  - ${inv.cust_code} - ${inv.ord}`,           // two spaces, as the tool writes it
    new_orderp21: inv.ord,
    ab_shipnumber: Number(inv.ship),
    [bind(nav, "ab_customercode")]: `/new_customercodes(${inv.customer_code_id})`,
    ab_invoicedate: inv.inv_date,
    new_po: clip(inv.cust_po, 100),
    ab_totalnetprice: round(Number(inv.total_net) || 0, 2),   // the async plugin's RecalculateInvoiceTotalNetPrice is off
    "ownerid@odata.bind": `/systemusers(${OWNER})`,
    "pricelevelid@odata.bind": `/pricelevels(${PRICE_LEVEL})`,
  };
  if (inv.account_id) {
    p[bind(nav, "new_accountid")] = `/accounts(${inv.account_id})`;
    p["customerid_account@odata.bind"] = `/accounts(${inv.account_id})`;
  }
  return p;
}

export function linePayload(inv: Inv, l: Line, invoiceRef: string, parentRef: string | null, nav: NavMap = {}) {
  const total = num(l.qty), ut = num(l.ut_price), cost = num(l.ut_cost);
  // Dynamics keeps a linked kit component's quantity PER KIT (ab_quantitykit = quantity × parent quantity, calculated);
  // P21's INV_QTY is the total, so a linked component stores qty_per_kit and Dynamics derives the total again.
  const linked = !!parentRef && l.kit_role === "component" && l.qty_per_kit != null;
  const qty = linked ? num(l.qty_per_kit) : total;
  const net = l.net_price == null ? null : Number(l.net_price);
  const p: Record<string, unknown> = {
    "invoiceid@odata.bind": invoiceRef,
    invoicedetailname: clip(l.item, 850),
    description: l.is_writein && l.desc2 ? `${l.desc1}\n${l.desc2}` : (l.desc1 || l.product_description || null),
    quantity: qty,
    ispriceoverridden: true,                 // keep P21's list price; the price list would otherwise replace it
    priceperunit: round(ut, 4),
    ab_netprice: net == null ? null : round(net, 4),
    ab_netcost: round(cost, 4),
    ab_totalnetprice: net == null ? null : round(net * total, 2),   // calculated column in Dynamics; sent for the record
    ab_totalnetcost: round(cost * total, 2),
    ab_discounttype: DISCOUNT_NO_DISCOUNT,
    ab_linenumber: parseInt(l.line_no, 10) || null,
    cr5da_poline: clip(l.cust_po, 100),
    cr5da_invoicep21: clip(inv.invoice_key, 15),
    cr5da_invoicedatep21: l.inv_date,
    [bind(nav, "cr5da_customercode")]: `/new_customercodes(${inv.customer_code_id})`,
    ab_disposition: DISPOSITION,
    ab_sellasakit: l.kit_role === "header",
    [bind(nav, "ab_assignedto")]: `/systemusers(${SALES_BOT})`,
    // no ownerid on a line: invoicedetail is a child of invoice and inherits the invoice's owner (Dataverse rejects ownerid here)
  };
  if (l.is_writein) { p.isproductoverridden = true; p.productdescription = clip(l.item, 500); } // a write-in line may not carry a unit ("cannot set both uomid and productdescription")
  else { p["productid@odata.bind"] = `/products(${l.product_id})`; p["uomid@odata.bind"] = `/uoms(${l.uom || UOM})`; } // l.uom: the product's own default unit when the fixed unit was refused
  if (inv.account_id) p[`${nav["new_customer:account"] || "new_customer_account"}@odata.bind`] = `/accounts(${inv.account_id})`;
  if (l.inventory_id) p[bind(nav, "new_inventory")] = `/new_inventories(${l.inventory_id})`;
  if (parentRef) p[bind(nav, "ab_parentinvoiceline")] = parentRef;
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
}

/** Changeset for a NEW invoice: header (Content-ID 1) + lines, kit headers before their components. */
export function newInvoiceChangeset(inv: Inv, nav: NavMap = {}): { reqs: BatchReq[]; lineIds: number[] } {
  const reqs: BatchReq[] = [{ method: "POST", url: "invoices", body: headerPayload(inv, nav), contentId: 1 }];
  const lineIds: number[] = [];
  const headerCid: Record<string, number> = {};
  let cid = 1;
  for (const l of inv.lines) {
    cid++;
    const parentRef = l.kit_role === "component" && l.kit_group && l.qty_per_kit != null && headerCid[l.kit_group] ? `$${headerCid[l.kit_group]}` : null;
    reqs.push({ method: "POST", url: "invoicedetails", body: linePayload(inv, l, "$1", parentRef, nav), contentId: cid });
    if (l.kit_role === "header" && l.kit_group) headerCid[l.kit_group] = cid;
    lineIds.push(l.id);
  }
  return { reqs, lineIds };
}

export interface PlanEntry { id: number; kind: "update" | "create" | "unchanged"; lineId?: string; cid?: number }
export interface ExistingLine { invoicedetailid: string; _productid_value: string | null; productdescription: string | null; isproductoverridden: boolean; quantity: number; cr5da_poline: string | null; ab_netprice: number | null; cr5da_invoicedatep21: string | null; ab_linenumber: number | null; _ab_parentinvoiceline_value: string | null; ab_sellasakit?: boolean | null }

/** Changeset for an EXISTING invoice (route A + "update"): match by product (or write-in text), PATCH differences,
 *  POST what is missing. Date is only ever moved earlier. Customer code is never touched. Nothing is deleted. */
export function existingInvoiceChangeset(inv: Inv, invoiceId: string, existing: ExistingLine[], nav: NavMap = {}): { reqs: BatchReq[]; plan: PlanEntry[] } {
  const reqs: BatchReq[] = [];
  const plan: PlanEntry[] = [];
  const free = [...existing];
  const headerCid: Record<string, number> = {};
  const headerExistingId: Record<string, string> = {};
  let cid = 0;
  for (const l of inv.lines) {
    let hit: ExistingLine | undefined;
    const ln0 = parseInt(l.line_no, 10);
    const sameProduct = (e: ExistingLine) => l.is_writein
      ? (e.isproductoverridden && (e.productdescription || "").trim().toUpperCase() === l.item.trim().toUpperCase())
      : (!e.isproductoverridden && !!e._productid_value && e._productid_value.toLowerCase() === (l.product_id || "").toLowerCase());
    hit = free.find((e) => sameProduct(e) && e.ab_linenumber === ln0) || free.find(sameProduct); // same P21 line number first (a part can sit in two kits)
    if (hit) {
      free.splice(free.indexOf(hit), 1);
      const patch: Record<string, unknown> = {};
      const willLink = l.kit_role === "component" && l.kit_group && l.qty_per_kit != null && (hit._ab_parentinvoiceline_value || headerExistingId[l.kit_group] || headerCid[l.kit_group]);
      const qty = willLink ? num(l.qty_per_kit) : num(l.qty);
      if (Number(hit.quantity) !== qty) patch.quantity = qty;
      if ((hit.cr5da_poline || "") !== clip(l.cust_po, 100)) patch.cr5da_poline = clip(l.cust_po, 100);
      if (l.net_price != null && (hit.ab_netprice == null || Math.abs(Number(hit.ab_netprice) - Number(l.net_price)) > 0.00005)) patch.ab_netprice = round(Number(l.net_price), 4);
      if (l.inv_date && (!hit.cr5da_invoicedatep21 || l.inv_date < hit.cr5da_invoicedatep21.slice(0, 10))) patch.cr5da_invoicedatep21 = l.inv_date;
      const ln = parseInt(l.line_no, 10);
      if (ln && hit.ab_linenumber !== ln) patch.ab_linenumber = ln;
      if (l.kit_role === "component" && l.kit_group && l.qty_per_kit != null && !hit._ab_parentinvoiceline_value) {
        if (headerExistingId[l.kit_group]) patch[bind(nav, "ab_parentinvoiceline")] = `/invoicedetails(${headerExistingId[l.kit_group]})`;
        else if (headerCid[l.kit_group]) patch[bind(nav, "ab_parentinvoiceline")] = `$${headerCid[l.kit_group]}`;
      }
      if (l.kit_role === "header" && l.kit_group) { headerExistingId[l.kit_group] = hit.invoicedetailid; if (!hit.ab_sellasakit) patch.ab_sellasakit = true; }
      if (Object.keys(patch).length) {
        cid++;
        reqs.push({ method: "PATCH", url: `invoicedetails(${hit.invoicedetailid})`, body: patch, contentId: cid });
        plan.push({ id: l.id, kind: "update", lineId: hit.invoicedetailid, cid });
      } else plan.push({ id: l.id, kind: "unchanged", lineId: hit.invoicedetailid });
    } else {
      cid++;
      const parentRef = l.kit_role === "component" && l.kit_group && l.qty_per_kit != null
        ? (headerExistingId[l.kit_group] ? `/invoicedetails(${headerExistingId[l.kit_group]})` : headerCid[l.kit_group] ? `$${headerCid[l.kit_group]}` : null) : null;
      reqs.push({ method: "POST", url: "invoicedetails", body: linePayload(inv, l, `/invoices(${invoiceId})`, parentRef, nav), contentId: cid });
      if (l.kit_role === "header" && l.kit_group) headerCid[l.kit_group] = cid;
      plan.push({ id: l.id, kind: "create", cid });
    }
  }
  if (reqs.length) reqs.push({ method: "PATCH", url: `invoices(${invoiceId})`, body: { ab_totalnetprice: round(Number(inv.total_net) || 0, 2) }, contentId: cid + 1 }); // the async rollup plugin is off
  return { reqs, plan };
}

