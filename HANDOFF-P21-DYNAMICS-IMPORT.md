# HANDOFF — P21 → Dynamics invoice-line import: the next LI-INVOICE export (and the follow-ups)

Project: FLAB - Agent - Quote / Marion & Customer Discovery · Written 2026-09-30 by Claude, invoice-line gap-fill chat · Companion to project doc `claude/import-tool-analysis-2026-09-28.md` (§13 is the full history; §13.14 the short runbook) · Marion Open Items board: https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk

## (a) Opening message — paste as the first message of the new chat

```
Preferences check first. This chat continues the P21 → Dynamics invoice-line import (FLAB - Agent - Quote / Marion & Customer Discovery).

Read, in this order, before anything else:
1. Project doc claude/handoff-p21-dynamics-import-2026-09-30.md (this handoff) — it holds the pipeline, the exact first steps and the review-and-approvals list.
2. Project doc claude/import-tool-analysis-2026-09-28.md §13.12 to §13.14 (how the full load ran, the final result, the runbook).
3. Hub davidranderson1/fluidseal-knowledge: README.md, infrastructure.md (Supabase rules), CHANGELOG.md 2026-09-30 line.
4. Marion repo davidranderson1/marion: CHANGELOG.md entries of 2026-09-28 to 2026-09-30 for dynamics-import; migration/dynamics-import/ (function source v19).
5. The Marion Open Items board https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk — items 41, 43, 47, 48, 55 are the open ones that touch this work.

Then, before any build step, re-ask me the review-and-approvals list from the handoff, one line per question, numbered as on the board.

The job: load the next P21 LI-INVOICE export (invoice lines after 2026-09-25) into Dynamics the same way as the gap fill — server-side through the dynamics-import edge function as Sales Bot, nine automation switches off for the window, duplicate sweep before the switches go back on, then the Supabase mirror re-sync. Do not re-derive anything the handoff already holds. Guardrails as in CLAUDE-PREFERENCES: nothing is written to Dynamics until I say go in this chat.
```

## (b) The pattern to repeat, and what to reuse (exact locations)

| Piece | Where | What it is |
|---|---|---|
| Edge function `dynamics-import` v19 | Supabase project `hnmbjqhxvxakhdzgetxw`, function id `bf57ac1c-ce22-4575-aba1-1825d8d02d9d`; source in marion repo `migration/dynamics-import/` (index.ts, core.ts, parse.ts) | Actions `ingest {source_url}`, `stage_text {text}`, `queue {source_url, parked_codes?}`, `classify`, `plan`, `run {confirm, chain, max_lines?}`, `status`, `delete_invoices {ids}`. Every call needs `run_id` + `run_key`. Writes to Dynamics happen only in `run` with `confirm: true` and the run in status `approved` or `running`. Every Dataverse write carries `MSCRMCallerID` = Sales Bot (`1edd009c-0861-47d7-95c7-c06d312eb025`). |
| Calling it from SQL | `imports.call_import(p_action text, p_body jsonb) → bigint` (pg_net request id; response in `net._http_response where id = <that id>`) | Lowest-token way to drive the function: `select imports.call_import('status', jsonb_build_object('run_id', <run>, 'run_key', <key>));`. pg_net and the edge gateway drop the client at 150 s — the isolate keeps running; read the run row / queue for the truth, not the HTTP reply. |
| Staging schema `imports` | Tables `import_run`, `invoice_line_import`, `run_queue`, `account_cache`, `inventory_cache`, `code_remap`, `batch_log`, `watchdog_log`; functions `classify` (v6c), `classify_kits`, `kit_quantities`, `build_queue`, `watchdog`, `retry_deadlocks`, `retry_unit_errors`, `call_import` | Migrations `imports_*` v5 to v14 (marion repo `migration/`, marion CHANGELOG 2026-09-29 and 2026-09-30). The `public.imp_*` RPCs (service_role) are the function's surface: `imp_stage_rows`, `imp_classify`, `imp_fetch_batch`, `imp_write_results`, `imp_inventory_pairs` / `imp_inventory_upsert`, `imp_log_batch`, `imp_run_status`, `imp_set_run`, `imp_chain`, `imp_queue_rows`, `imp_defer`, `imp_check_key`. |
| Watchdog | `migration/2026-09-30_imports_watchdog_v11_final.sql` (marion repo) | Temporary pg_cron job `dynamics-import-watchdog` (`*/2 * * * *` → `imports.watchdog(run_id)`): re-kicks the function when the run lock is free and the pg_net queue is empty, moves the date window to the month of the most recent open invoice, retries deadlocks / resource-busy / unit errors, marks the run done. Create it for the load, REMOVE it when the run is done (`cron.unschedule`). No cron job exists right now. |
| Nine automation switches | Dataverse plugin steps `65bf6376-006f-ed11-9562-000d3a9eb9a2`, `f46c56e9-8977-ed11-81ab-0022482685b6`, `9814ae8e-6b0f-eb11-a813-000d3a8b5afd`, `06279d11-f6ef-ee11-904b-6045bdd879af`, `0e3ef40b-8a77-ed11-81ab-0022482685b6`, `9208fc85-f57a-ed11-81ad-000d3a9eb9a2`; workflows (flows) `2c41e36c-6017-ef11-9f89-000d3a56fb0a`, `87969e6b-fbba-f011-bbd3-7c1e5201cb61`, `1e263506-728a-f111-ab10-7ced8ddb4846` | OFF = plugin steps statecode 1 / statuscode 2, workflows statecode 0 / statuscode 1; ON = plugin steps 0 / 1, workflows 1 / 2. All nine are ON now (verified 2026-09-30 18:12 UTC). Switch off only on David's go, switch on and verify right after the run, and check no staff invoice line was created in the window (`createdby` ≠ Sales Bot on `invoicedetail` since the switch-off time). |
| File transport | David uploads the P21 export to Dropbox (folder "invoice lines"); the function fetches it through a single-use Dropbox download link (`ingest` / `queue` `source_url`) | Last file: `LI-INVOICE-Jan21-Sep25.txt` (23,573,520 bytes, tab-separated, P21 encoding handled by `parse.ts`). |
| Dataverse checks | Dataverse MCP `read_query` (SQL subset: no subqueries, TOP, GROUP BY) | Duplicate sweep: `SELECT new_orderp21, ab_shipnumber, COUNT(invoiceid) AS n FROM invoice WHERE createdon >= '<load start>' GROUP BY new_orderp21, ab_shipnumber ORDER BY n DESC` (TOP 3 must all be n = 1). Per-month counts: `COUNT(invoiceid)` by `ab_invoicedate` month versus the file. Invoice match key = `new_orderp21` + `ab_shipnumber`. |
| Supabase mirror | Edge function `dynamics-sync` (do not change its table configs); tables `public.invoices`, `public.invoice_lines` | Re-sync by `createdon` windows through `net.http_get` (anon key, 390 s timeout): 90-minute windows for invoice_lines, 6-hour windows for invoices, over the load period; plus the creation dates of any pre-existing invoices whose lines were patched (the sync reads by createdon, not modifiedon — board item 41). `dynamics-sync` never deletes: rows for records deleted in Dynamics are removed by hand (`delete … where invoice_id in (...)`). |
| Deleting a Dataverse record | `delete_invoices` action of the function (Web API DELETE, 204) | The Dataverse MCP `delete_record` hangs at its 180 s timeout without deleting — do not use it. |

Runtime facts that shaped the design (do not fight them): an edge-function invocation dies after about 2 s of CPU (multipart $batch bodies), so one call does ONE wave of four parallel 75-request $batches (~330 lines) and chains the next call through pg_net; a Dataverse changeset (one invoice) costs 2 to 3 s, so throughput comes from parallel batches — 7,500 to 9,500 lines per hour; parallel batches bring SQL deadlock 1205 and "another request is currently using the resource" (transient, retried after 3 minutes); a $batch that times out on the client may still commit for minutes, so a timed-out batch's invoices are deferred 15 minutes (`imp_defer`) and a dead invocation's fetched invoices are quarantined 15 minutes — the two race conditions that made 12 duplicate pairs in the gap fill, both closed; "The specified unit is not valid for this product" is retried with the product's default unit (`needs_uom`). The Supabase compute was resized 2026-09-29 (shared buffers 512 MB); the hub rule still stands: no full-table scans or bulk updates on this instance during business hours, one chat at a time on the database.

## (c) Where the source material and the data live

| Material | Location |
|---|---|
| Full history, rules, decisions, results | Project doc `claude/import-tool-analysis-2026-09-28.md` §1 to §13.14 (rules of the Dynamics IMPORT tool and David's corrections in §13.8: Q8 update matched lines on existing invoices, Q9 park lines whose customer code has no account, Q10 headers and components, Q11 disposition "Stock", Q12 records created by Sales Bot, Q14 credit rule `sale`) |
| Gap-fill run | `imports.import_run` id `9eb52bff-a50d-41ba-9c49-7637640d64f7` (status done; window last set to January 2026; notes carry every event); 151,960 lines / 28,428 invoices, 2026-01-21 → 2026-09-25 |
| Dynamics state | 28,342 invoices created by the load (after the 12 duplicate deletions), 86 pre-existing updated; newest invoice date 2026-09-25 |
| Supabase mirror state | `public.invoices` 64,222 rows, `public.invoice_lines` 329,529 rows, newest `invoice_date` 2026-09-25 |
| Function source | marion repo `migration/dynamics-import/` (v19, blob-verified) |
| Migrations | marion repo `migration/` — `imports_*` v5 to v14 and `2026-09-30_imports_watchdog_v11_final.sql` |
| Last P21 file | Dropbox folder "invoice lines", `LI-INVOICE-Jan21-Sep25.txt` |
| Duplicate ids deleted | Project doc §13.13 and §13.14 (August 6141189/90/91/92/94/96 ship 1; June 7169628-1/-2, 7169630-1/-2, 7169633-1, 7169635-1) |

## (d) Open board items that touch this work

| Item | State | What it needs |
|---|---|---|
| 41 SYNC · invoices nightly | open, David | "go": Claude creates the two pg_cron jobs (`sync-invoices` 08:34 UTC, `sync-invoice-lines` 08:36 UTC, `sync_nightly('<table>', 3)`) AND switches the two `dynamics-sync` configs to a `modifiedon` key so edited invoices re-sync; or "hold" |
| 43 ACCESS · invoice tables | open, David | "customers" (customer-scoped policy + column grants hiding cost / profit + a cost-free view) or "staff only" |
| 47 IMPORT TOOL · fix list for AlphaBOLD | open, David | "ticket" (one DevOps user story per change, 12 changes, evidence in project doc §6 and §9) or "later" |
| 48 IMPORT · vendor-product template mapping | open, David | "intended" or the column that should feed `new_qtymin1` |
| 55 MARION · kit component quantity is per kit | open, Claude → David | Claude lists every Marion reader of `invoice_lines.quantity` and proposes the switch to `quantity_kit`; `history_lookup` already switched; "go" to patch the rest |
| 44 DATA GAP | done 2026-09-30 | closed by the gap fill (this handoff) |
| 63 duplicates | done 2026-09-30 | the 12 copies deleted and verified |

Other open items on the board (1 to 9, 11, 12, 15, 18 to 26, 39, 58 to 61, 64 to 66) belong to other workstreams — they stay on the board, not in this chat.

## (e) Records every session writes, and where

| Record | Where |
|---|---|
| Open items, decisions, questions | Marion Open Items board (artifact `VmxUh2isKacUXSGqB79bnk`) — always re-read the live version right before publishing (other chats publish too), merge, publish with `url` |
| What changed in Supabase / the function | marion repo `CHANGELOG.md` (newest first, one entry per push, re-read right before the write, blob SHA verified) and `migration/` (SQL + function source) |
| Facts for every project | hub `CHANGELOG.md` dated line, `infrastructure.md` (Supabase rules), `data-sources.md`, `projects.md` row |
| The narrative and results | Project doc `claude/import-tool-analysis-2026-09-28.md` (append a §13.x) |
| Handoff | Project doc `claude/handoff-p21-dynamics-import-<date>.md`, Google Doc in Claude/Files "YYYY-MM-DD - FLAB - Agent - Quote / Marion & Customer Discovery - HANDOFF - <next piece>", marion repo `HANDOFF-P21-DYNAMICS-IMPORT.md` |
| Learnings | Claude/Learnings note "LEARNING - YYYY-MM-DD - <system> - <topic>" for anything new about a tool or system |

## (f) First steps for the next export, one action per line

1. Say "Preferences vNN loaded" (read CLAUDE-PREFERENCES from Google Drive first) and read the five sources in the opening message.
2. Re-ask the review-and-approvals list (g) below, one line per question.
3. ASK David to upload the new P21 LI-INVOICE export to Dropbox folder "invoice lines" (same export as `LI-INVOICE-Jan21-Sep25.txt`, from the first invoice date after 2026-09-25) and to say the file name.
4. GET a single-use download link with the Dropbox connector (`download_link`) for that file.
5. CREATE the run row in SQL: `insert into imports.import_run(name, source, status, credit_rule, max_lines, notes) values ('LI-INVOICE <from>-<to>', '<file name>', 'staged', 'sale', 260, '<date>Z created by Claude') returning id, run_key;`
6. CALL `imports.call_import('ingest', jsonb_build_object('run_id', <id>, 'run_key', <key>, 'source_url', '<link>'))`; read `net._http_response` for the request id; confirm `file_rows` on the run row equals the file's row count.
7. CALL `queue` with the same `source_url` (parked codes from the last run: 6SWIOI, 6DEEEQ unless accounts now exist).
8. RUN `imports.classify(<run id>)` from SQL with `set statement_timeout = '900s'` (not through the function); check `imp_run_status` counts: ready, skipped by rule, parked, needs review.
9. REPORT to David as a table: lines, invoices, date range, skipped, parked, the kept-rule counts — and the per-month invoice counts from the file.
10. ASK for the go in one line (Q-style): switch the nine automations off and load as Sales Bot.
11. On go: switch the nine OFF (update statecode/statuscode as in (b)), verify all nine, note the time.
12. SET the run window to the most recent month of the file (`update imports.import_run set status='approved', window_from=..., window_to=... where id=...`).
13. CREATE the watchdog job: `select cron.schedule('dynamics-import-watchdog', '*/2 * * * *', $job$select imports.watchdog('<run id>')$job$);` — it kicks the first `run` call itself.
14. WATCH `imports.watchdog_log`, `imports.batch_log` and `imp_run_status` every 20 to 30 minutes; do nothing else on the database meanwhile.
15. When the run is `done`: `select cron.unschedule('dynamics-import-watchdog');`
16. VERIFY in Dataverse: duplicate sweep (all n = 1), per-month counts versus the file, no staff invoice lines in the window.
17. Switch the nine automations ON, verify all nine, note the time.
18. RE-SYNC the mirror with `dynamics-sync` by createdon windows over the load period; compare `public.invoices` / `public.invoice_lines` counts with Dataverse.
19. RECORD: board items, marion CHANGELOG + migrations if any, hub CHANGELOG line, project doc §13.x, a fresh handoff with a copyable opening message.

## (g) Review and approvals list — re-ask these first, one line each

| Board item | Question (one line) | What Claude does on each answer | Holder |
|---|---|---|---|
| — (standing method) | Q1 — Is "Claude runs P21 → Dynamics invoice loads server-side as Sales Bot with the nine switches off, on one go in that chat" the standing method for every future export — yes or no? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | yes: the next chat asks only for the go; no: the next chat presents the route again first | David |
| 41 | Q2 — Nightly invoice sync: create the two pg_cron jobs and switch the two sync configs to a modifiedon key — go or hold? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | go: creates `sync-invoices` / `sync-invoice-lines`, switches the keys, logs both; hold: nothing | David |
| 43 | Q3 — Invoice tables for signed-in customers: customers (scoped policy, cost columns hidden) or staff only? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | customers: policy + column grants + cost-free view, verified as anonymous / customer / staff; staff only: closes the item | David |
| 47 | Q4 — AlphaBOLD fix list (12 changes to the IMPORT tool): ticket or later? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | ticket: one DevOps user story per change; later: stays on the board | David |
| 48 | Q5 — Vendor-product template: is new_qtymin1 = AVG_COST intended, or which column should feed it? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | a column: Claude fixes the saved template (master data, on the go); intended: closes the item | David |
| 55 | Q6 — Marion readers of invoice_lines.quantity for kit components: go to patch them to quantity_kit? https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk | go: lists every reader, patches, before-and-after per item 50; later: stays on the board | David |
