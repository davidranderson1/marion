// dynamics-import — loads P21 LI-INVOICE rows staged in Supabase (schema imports) into Dynamics 365 / Dataverse
// as invoices + invoice lines, reproducing the Dynamics IMPORT tool's rules with the corrections David agreed on
// 2026-09-28 (project doc claude/import-tool-analysis-2026-09-28.md §13; Marion Open Items board items 45-52).
//
// Every call needs { action, run_id, run_key } (run_key = imports.import_run.run_key). Actions:
//   ingest     { source_url }            fetch the tab-separated file (single-use Dropbox link), parse, stage rows
//   stage_text { text }                  stage rows from inline text (header line + rows) — used for the pilot
//   classify                             duplicates, lookups, kit structure, skip reasons (imports.classify)
//   plan                                 dry run: the exact Dataverse payloads for the next batch, nothing written
//   run        { confirm: true, max_lines?, batch_no? }   write one batch to Dataverse; call again until remaining = 0
//   status                               counts
// Writes to Dynamics happen ONLY in `run` with confirm:true and the run in status approved|running.
// Same app registration and client-credentials flow as dynamics-sync (secret DYNAMICS_CLIENT_SECRET);
// every Dataverse write carries MSCRMCallerID = Sales Bot so "Created by" is Sales Bot (David, Q12).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeP21, parseLiInvoice, EXPECTED_COLUMNS } from "./parse.ts";
import { TENANT, CLIENT, ORG, API, SALES_BOT, TIME_BUDGET_MS, buildBatchBody, parseBatchEntries, alignBatch, esc,
         newInvoiceChangeset, existingInvoiceChangeset } from "./core.ts";
import type { BatchReq, BatchResult, BatchPart, Inv, PlanEntry, ExistingLine, NavMap } from "./core.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- Dataverse ----------
async function token(): Promise<string> {
  const secret = Deno.env.get("DYNAMICS_CLIENT_SECRET");
  if (!secret) throw new Error("DYNAMICS_CLIENT_SECRET is not set");
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT, client_secret: secret, scope: `${ORG}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.access_token;
}
const dvHeaders = (tok: string) => ({ Authorization: `Bearer ${tok}`, Accept: "application/json", "OData-Version": "4.0", "OData-MaxVersion": "4.0", MSCRMCallerID: SALES_BOT });

async function dvGet(tok: string, path: string) {
  const r = await fetch(`${API}/${path}`, { headers: dvHeaders(tok) });
  const text = await r.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!r.ok) throw new Error(`dataverse GET ${r.status} ${path.slice(0, 120)}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

/** One $batch against Dataverse. */
async function dvBatch(tok: string, sets: BatchReq[][], gets: BatchReq[] = []): Promise<BatchResult> {
  const bnd = `batch_${crypto.randomUUID()}`;
  const r = await fetch(`${API}/$batch`, { method: "POST", headers: { ...dvHeaders(tok), "Content-Type": `multipart/mixed; boundary=${bnd}` }, body: buildBatchBody(API, bnd, sets, gets) });
  const text = await r.text();
  const ct = r.headers.get("content-type") || "";
  if (!r.ok && !/multipart\/mixed/i.test(ct)) throw new Error(`dataverse $batch ${r.status}: ${text.slice(0, 600)}`);
  return alignBatch(parseBatchEntries(text, ct), gets.length, sets.length);
}

/** attribute -> navigation property names for the lookups we bind (custom lookups use their schema name, e.g. ab_ParentInvoiceLine) */
async function navMap(tok: string): Promise<NavMap> {
  const nav: NavMap = {};
  for (const ent of ["invoicedetail", "invoice"]) {
    const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ent}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity`, { headers: dvHeaders(tok) });
    const j = await r.json();
    if (!r.ok) throw new Error(`metadata ${ent} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    for (const rel of j.value || []) {
      const attr = rel.ReferencingAttribute, name = rel.ReferencingEntityNavigationPropertyName;
      if (!attr || !name) continue;
      if (attr === "new_customer") { if (rel.ReferencedEntity === "account") nav["new_customer:account"] = name; continue; }
      if (!(attr in nav)) nav[attr] = name;
    }
  }
  return nav;
}

// ---------- main ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const t0 = Date.now();
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "JSON body required" }, 400); }
  const action = String(body.action || "");
  const runId = String(body.run_id || ""), runKey = String(body.run_key || "");
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return json({ error: "run_id required" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const status = async () => await rpc("imp_run_status", { p_run: runId });

  try {
    if (action === "status") return json(await status());

    if (action === "ingest" || action === "stage_text") {
      let text: string;
      if (action === "ingest") {
        const url = String(body.source_url || "");
        if (!/^https:\/\//.test(url)) return json({ error: "source_url (https) required" }, 400);
        const r = await fetch(url);
        if (!r.ok) return json({ error: `source ${r.status}` }, 502);
        text = decodeP21(new Uint8Array(await r.arrayBuffer()));
      } else text = String(body.text || "");
      const parsed = parseLiInvoice(text);
      if (parsed.missing.length) return json({ error: "columns missing", missing: parsed.missing, header: parsed.header }, 400);
      let staged = 0;
      const CH = 4000;
      for (let i = 0; i < parsed.rows.length; i += CH) {
        const chunk = parsed.rows.slice(i, i + CH).map((x) => [x.raw_index, x.cust_code, x.ord, x.item, x.desc1, x.desc2, x.qty, "", x.inv_date_raw, x.vend, x.gen_cost, x.gen_price, x.ut_cost, x.ut_price, x.schd, x.line_no, x.ship, x.multiplier, x.cust_po]);
        staged += Number(await rpc("imp_stage_rows", { p_run: runId, p_key: runKey, p_rows: chunk }));
        if (Date.now() - t0 > TIME_BUDGET_MS) return json({ ok: false, error: "time budget exhausted while staging", staged, of: parsed.rows.length }, 500);
      }
      await rpc("imp_set_run", { p_run: runId, p_key: runKey, p_status: "staged", p_notes: `${action}: ${parsed.rows.length} rows (${parsed.dropped_short_lines} short lines dropped, ${parsed.bad_dates} bad dates), columns ${EXPECTED_COLUMNS.length}, ${Date.now() - t0} ms` });
      return json({ ok: true, rows: parsed.rows.length, staged, dropped_short_lines: parsed.dropped_short_lines, bad_dates: parsed.bad_dates, extra_columns: parsed.extra, ms: Date.now() - t0 });
    }

    if (action === "classify") {
      const v = await rpc("imp_classify", { p_run: runId, p_key: runKey });
      return json({ ok: true, ...v, ms: Date.now() - t0 });
    }

    if (action === "plan" || action === "run") {
      const confirm = body.confirm === true && action === "run";
      const maxLines = Math.max(1, Math.min(2000, Number(body.max_lines) || 400));
      const st = await status();
      const runStatus = st?.run?.status;
      if (confirm && !["approved", "running"].includes(runStatus)) return json({ error: `run is '${runStatus}', needs approved|running` }, 409);
      const invoices: Inv[] = await rpc("imp_fetch_batch", { p_run: runId, p_key: runKey, p_max_lines: maxLines });
      if (!invoices.length) {
        if (confirm) await rpc("imp_set_run", { p_run: runId, p_key: runKey, p_status: "done", p_notes: "no ready lines left" });
        return json({ ok: true, remaining: 0, invoices: 0, lines: 0, status: await status() });
      }
      const tok = await token();
      const nav = await navMap(tok);
      if (action === "plan" && body.show_nav) return json({ ok: true, nav });

      // 1 inventory for (product, warehouse) pairs not cached yet — the plugin's FindSalesLineInventory, never creating one
      const pairs: { product_id: string; warehouse_id: string }[] = await rpc("imp_inventory_pairs", { p_run: runId, p_key: runKey, p_limit: 600 });
      let invLookups = 0;
      for (let i = 0; i < pairs.length; i += 100) {
        const slice = pairs.slice(i, i + 100);
        const res = await dvBatch(tok, [], slice.map((p) => ({ method: "GET" as const, url: `new_inventories?$select=new_inventoryid&$filter=_new_product_value eq ${p.product_id} and _new_warehouseid_value eq ${p.warehouse_id}&$top=1` })));
        const found = slice.map((p, k) => ({ product_id: p.product_id, warehouse_id: p.warehouse_id, inventory_id: res.parts[k]?.body?.value?.[0]?.new_inventoryid ?? null }));
        await rpc("imp_inventory_upsert", { p_run: runId, p_key: runKey, p_pairs: found });
        invLookups += slice.length;
      }
      if (invLookups) { // re-read the batch so the lines carry their inventory ids
        const again: Inv[] = await rpc("imp_fetch_batch", { p_run: runId, p_key: runKey, p_max_lines: maxLines });
        invoices.splice(0, invoices.length, ...again);
      }

      // 2 which invoices already exist (39 from January) — one GET per invoice, batched
      const gets = invoices.map((inv) => ({ method: "GET" as const, url: `invoices?$select=invoiceid,_new_accountid_value&$filter=new_orderp21 eq '${esc(inv.ord)}' and ab_shipnumber eq ${Number(inv.ship)}&$expand=invoice_details($select=invoicedetailid,_productid_value,productdescription,isproductoverridden,quantity,cr5da_poline,ab_netprice,cr5da_invoicedatep21,ab_linenumber,_ab_parentinvoiceline_value,ab_sellasakit)` }));
      const existing: Record<string, { invoiceId: string; lines: ExistingLine[] } | null> = {};
      for (let i = 0; i < gets.length; i += 100) {
        const res = await dvBatch(tok, [], gets.slice(i, i + 100));
        gets.slice(i, i + 100).forEach((_, k) => {
          const hit = res.parts[k]?.body?.value?.[0];
          existing[invoices[i + k].invoice_key] = hit ? { invoiceId: hit.invoiceid, lines: hit.invoice_details || [] } : null;
        });
      }

      // 3 changesets
      const sets: { inv: Inv; reqs: BatchReq[]; plan: PlanEntry[]; existingId?: string }[] = [];
      for (const inv of invoices) {
        const ex = existing[inv.invoice_key];
        if (ex) {
          const { reqs, plan } = existingInvoiceChangeset(inv, ex.invoiceId, ex.lines, nav);
          sets.push({ inv, reqs, plan, existingId: ex.invoiceId });
        } else {
          const { reqs, lineIds } = newInvoiceChangeset(inv, nav);
          sets.push({ inv, reqs, plan: lineIds.map((id, k) => ({ id, kind: "create", cid: k + 2 })) });
        }
      }
      if (!confirm) {
        return json({ ok: true, dry_run: true, invoices: invoices.length, lines: invoices.reduce((a, i) => a + i.lines.length, 0),
          existing: Object.values(existing).filter(Boolean).length, inventory_lookups: invLookups,
          changesets: sets.map((s) => ({ invoice_key: s.inv.invoice_key, existing_invoice_id: s.existingId || null, requests: s.reqs })) });
      }

      // 4 write, ~100 requests per $batch, each invoice its own changeset (all-or-nothing per invoice)
      if (runStatus !== "running") await rpc("imp_set_run", { p_run: runId, p_key: runKey, p_status: "running" });
      const batchNo = Number(body.batch_no) || Number(st?.batches || 0) + 1;
      const results: { id: number; status: string; dynamics_invoice_id?: string; dynamics_line_id?: string; error?: string; batch_no: number }[] = [];
      let created = 0, updated = 0, unchanged = 0, failed = 0, sent = 0;
      let group: typeof sets = [];
      const flush = async () => {
        if (!group.length) return;
        const res = await dvBatch(tok, group.map((g) => g.reqs));
        group.forEach((g, gi) => {
          const cs = res.changesets[gi];
          const byCid: Record<number, BatchPart> = {};
          (cs?.parts || []).forEach((p) => { if (p.contentId != null) byCid[p.contentId] = p; });
          if (!cs || cs.error === "no response part") return; // not processed by Dataverse (an earlier changeset failed) — stays ready
          if (!cs.ok) {
            const err = (cs?.parts || []).find((p) => p.status >= 300 || p.status === 0);
            const msg = err ? `${err.status} ${JSON.stringify(err.body?.error?.message || err.body || err.raw || "").slice(0, 700)}` : "changeset failed";
            g.plan.forEach((pl) => results.push({ id: pl.id, status: "error", error: msg, batch_no: batchNo }));
            failed += g.plan.length;
            return;
          }
          const invoiceId = g.existingId || byCid[1]?.entityId;
          g.plan.forEach((pl) => {
            if (pl.kind === "unchanged") { results.push({ id: pl.id, status: "unchanged", dynamics_invoice_id: invoiceId, dynamics_line_id: pl.lineId, batch_no: batchNo }); unchanged++; return; }
            const part = pl.cid != null ? byCid[pl.cid] : undefined;
            if (pl.kind === "update") { results.push({ id: pl.id, status: "updated", dynamics_invoice_id: invoiceId, dynamics_line_id: pl.lineId, batch_no: batchNo }); updated++; return; }
            results.push({ id: pl.id, status: "created", dynamics_invoice_id: invoiceId, dynamics_line_id: part?.entityId, batch_no: batchNo });
            created++;
          });
        });
        sent += group.reduce((a, g) => a + g.reqs.length, 0);
        group = [];
      };
      let pending = 0, processedSets = 0;
      for (const s of sets) {
        if (Date.now() - t0 > TIME_BUDGET_MS) break;
        if (pending + s.reqs.length > 100 && group.length) await flush();
        group.push(s); pending = group.reduce((a, g) => a + g.reqs.length, 0); processedSets++;
      }
      await flush();
      await rpc("imp_write_results", { p_run: runId, p_key: runKey, p_results: results });
      const detail = { invoices: processedSets, lines: results.length, created, updated, unchanged, failed, requests: sent, inventory_lookups: invLookups, ms: Date.now() - t0 };
      await rpc("imp_log_batch", { p_run: runId, p_key: runKey, p_batch: batchNo, p_detail: detail });
      await db.from("sync_log").insert({ table_name: "invoice_lines", status: failed ? "partial" : "success", finished_at: new Date().toISOString(), rows_read: results.length, rows_upserted: created + updated, message: `dynamics-import batch ${batchNo}: ${JSON.stringify(detail)}` }).then(() => {}, () => {});
      const after = await status();
      const remaining = Number(after?.counts?.ready || 0);
      if (!remaining) await rpc("imp_set_run", { p_run: runId, p_key: runKey, p_status: "done" });
      return json({ ok: true, batch_no: batchNo, ...detail, remaining, errors: results.filter((r) => r.status === "error").slice(0, 5) });
    }

    return json({ error: `unknown action '${action}'` }, 400);
  } catch (e) {
    return json({ error: String(e), ms: Date.now() - t0 }, 500);
  }
});
