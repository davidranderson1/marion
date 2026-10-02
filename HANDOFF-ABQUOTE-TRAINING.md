# HANDOFF — ABQUOTE → Marion Quote-Intake Training
**Written 2026-09-26 by the Quote/Marion session. For a NEW chat dedicated to this task.**
Canonical copy: `davidranderson1/marion` repo, `HANDOFF-ABQUOTE-TRAINING.md`.

---

## 1. Mission

FluidSeal has years of historical quote paperwork in SharePoint under **ABQUOTE** folders/files.
Use them as **ground truth** to train Marion's quote-intake cross-reference at
https://marion.fluidsealab.com/quote.html — so the AI gets better at turning a raw customer
ask into the correct Fluidseal part numbers, globally and per customer.

**Nothing has been reviewed yet.** Your first job is to get access, LOOK at what ABQUOTE
actually contains, and confirm the plan with David before building anything.

## 2. Access to ABQUOTE (not yet solved — step 1)

- ABQUOTE lives in **SharePoint** (Sealing Solutions Group tenant). No SharePoint access
  exists in Claude yet: the **Microsoft 365 connector** is the ideal path
  (`sharepoint_search` / `sharepoint_folder_search` / `read_resource`) but David **could not
  connect it as of 2026-09-26** — re-offer it first; it may be possible now.
- Fallbacks, ranked by token cost (David's explicit preference: least tokens first):
  1. **David copies ABQUOTE (or a sample batch) into the connected ClaudeAgent OneDrive
     folder** — cheapest and best for bulk work: file tools + the Linux sandbox can inventory
     and parse thousands of files with almost no context cost. Suggested drop point:
     `ClaudeAgent\Marion\ABQUOTE\`.
  2. Microsoft 365 connector (when connectable).
  3. Browsing SharePoint via Claude-in-Chrome or the built-in browser — most expensive;
     use only for a quick structural peek, never for bulk extraction.
- Recon already done (don't repeat): ABQUOTE is NOT in the ClaudeAgent folder, not in
  Google Drive, not in Dropbox, and "ABQUOTE"/"sharepoint" appear nowhere in David's GitHub.

## 3. What Marion is (context you need)

- Single-file app `quote.html` (~120KB) in repo **`davidranderson1/marion`**, served by
  GitHub Pages at marion.fluidsealab.com. Current build **2026-09-26.4** (const
  `MARION_BUILD` near the bottom; bump on every push).
- Backend: shared Supabase project **`hnmbjqhxvxakhdzgetxw`** (magic-link auth + TOTP 2FA,
  PostgREST, RLS, edge functions `marion-chat` / `marion-notify` / `marion-images`).
- Flow: staff forward customer emails (.msg) into Quote Intake → `callMarion()` sends text +
  PDFs/images to Claude (model claude-sonnet-4-6, temp 0) via the `marion-chat` proxy →
  JSON lines land in a cart → deterministic catalog RPCs verify/fill part numbers → staff
  review → quote card (Fluidseal or P21-style toggle) → submit.
- David Anderson: d.anderson@fluidsealab.com, auth uid `60be8c46-b594-4872-b7ff-246f6efa9f33`,
  is_staff=true.

## 4. Training machinery that ALREADY EXISTS — build on it, don't rebuild it

Read `quote.html` (functions `callMarion`, `applyParsed`, `crossRefCart`, `logFeedback`)
and the repo `CHANGELOG.md` (entries of 2026-09-26) before designing anything.

- **`xref_feedback` table** — the training log. Columns: user_id, action, kind, style,
  units, dims (jsonb), oem, descr, **asked** (customer's verbatim wording),
  suggested_pn, **chosen_pn**, prev_pn, candidates (text[]).
  Actions already emitted by the app: `p21_ground_truth` (asked→pn pairs whenever our own
  P21 quote PDF was analyzed — CONFIRMED answers), `picked_option`, `manual_edit`,
  `created_part`, `confirmed_auto`. **ABQUOTE mining should produce more
  `p21_ground_truth`-style rows** (or a sibling bulk table — see §6).
- **`ai_rules` table** (category, rule, active, sort) — staff-editable rules injected
  verbatim into the extraction prompt. Convention (already seeded + prompt-enforced):
  category **`customer:NAME`** applies only to that account; everything else is global.
  Per-customer preferences mined from ABQUOTE become `customer:NAME` rows —
  **propose them to David for approval, never mass-insert**.
- **P21 recognition in the prompt**: our own ERP "Quote XXXXXXX-0001.pdf" is treated as the
  confirmed answer, not a request (item codes → pn conf high, ORDERED → qty, UNIT PRICE →
  net price, AB/* charge + note-only lines skipped, BILL TO = customer).
- **Source capture on `quotes`**: request_text, p21_quote_no, source_pdf_name,
  source_pdf_b64 (<4MB) — saved per quote for the future outgoing-email feature.
- **Catalog RPCs** (deterministic layer the AI feeds): `find_cross_refs(p_oem)`,
  `match_parts(...)` (ranking already boosts previously chosen parts), `part_info(p_pn)`,
  `link_for_part(p_pn)`, `explode_kit(p_pn, p_max_depth)` (BOMs; EXECUTE granted to
  authenticated, SECURITY INVOKER, `bom_lines` RLS = is_staff).
- Stock: `v_stock_staff` is granted to authenticated (per-warehouse rows, sum
  qty_available client-side). `v_stock_total` has NO grant — leave it alone.

## 5. P21/ERP quotation PDF — format facts (from 5 real samples, 2026-09-25/26)

Recognition markers: literal `GST: R-87321 2575`, boxed QUOTATION NUMBER (e.g.
`6142663-0000`), `***QUOTATION***` banner, sealsonline.com footer. Table columns:
QUANTITY ORDERED / DISP. (B|S|T) / ITEM CODE AND DESCRIPTION / U/M / UNIT PRICE (4
decimals) / AMOUNT. SUB TOTAL + GST 5% + PST + TOTAL AMOUNT DUE. **Kits print as a single
line — components NEVER appear on the PDF** (BOMs come from Supabase `explode_kit`).
Skip AB/* charge lines (AB/FREIGHT-IN, AB/CSP…) and note-only lines. Prices on P21 are
customer-net, often far below list (EMSCO ≈ 50% of list) — that per-customer pricing signal
is itself trainable. Sample quote numbers seen: QT#6142660/6142661/6142663/7026938/7026939.

## 6. Proposed pipeline (confirm with David at each phase)

1. **Access + inventory** (§2). Count files, types (.pdf/.msg/.eml/.xlsx?), naming
   convention, whether customer asks are paired with P21 quotes (same folder? matching
   names?). Report the shape to David before extracting.
2. **Sample review** — hand-read 10–20 quotes. Verify the P21 layout matches §5; note
   variants (old formats, revisions -0001/-0002, multi-page).
3. **Bulk extraction in the Linux sandbox** (token-cheap): PyMuPDF/pdftotext for PDFs,
   `extract-msg` (already used successfully) for .msg. Output JSONL per quote:
   `{p21_quote_no, quote_date, customer, po, lines:[{pn, qty, unit_price, descr}],
   asked_text?, source_files[]}`. Parse code + spot-checks live in the sandbox; only
   summaries hit the context window.
4. **Load into Supabase** — decision for David: (a) bulk-append `xref_feedback`
   `p21_ground_truth` rows (only for quotes where the customer ask is present so `asked`
   is real), and/or (b) a NEW staff-gated table (e.g. `training_quotes` +
   `training_quote_lines`) holding every parsed P21 as reference data — useful for
   per-customer price history too. New DDL must follow §7 protocol. RLS: is_staff().
5. **Mine rules** — per-customer patterns (wording→pn habits, preferred brands/series,
   pricing tiers) → draft `customer:NAME` ai_rules rows → David approves in the Staff Desk.
6. **Evaluate** — replay a held-out set of customer asks through the analyze flow (or a
   sandbox harness calling the same prompt) and score pn accuracy against the P21 answer.
   Report before/after when rules are added.

**PII note:** ABQUOTE files carry customer names, addresses and net pricing. They belong in
RLS-gated Supabase tables only — never commit extracted customer data to the GitHub repo.

## 7. Non-negotiable protocols (history says: follow these exactly)

- **Shared Supabase**: `public` + `archive` schemas are Marion's LIVE production; `xpress`
  and `flabed` schemas belong to other sessions — never modify other projects' objects.
  Before ANY DDL: `list_migrations` + read repo `CHANGELOG.md` (parallel sessions are
  active — the changelog moved twice in one hour on 2026-09-26).
- **GitHub pushes**: the MCP `create_or_update_file` needs FULL file content + the current
  blob sha; fetch the sha AT push time. After pushing, verify the returned blob sha equals
  local `git hash-object` of the same content (a truncated push once broke the live site).
  Bump `MARION_BUILD`. Append a CHANGELOG.md entry (newest-first, right after the `---`
  marker) with every push.
- **marion-notify**: recipient locked to d.anderson@fluidsealab.com — changing it requires
  2 approvals per David (2026-07-13). SMTP subject must be pure ASCII.
- **Theme**: anything FluidSeal-visual → read `ClaudeAgent\FLUIDSEAL-THEME.md` first.
- **Knowledge hub**: private repo `davidranderson1/fluidseal-knowledge` — read README first;
  write durable findings back (products.md / infrastructure.md) + dated CHANGELOG line.
- **RLS testing as David** (in one transaction):
  `select set_config('role','authenticated',true), set_config('request.jwt.claims',
  '{"sub":"60be8c46-b594-4872-b7ff-246f6efa9f33","role":"authenticated"}',true);` then run
  the query. Fetch data as postgres BEFORE switching roles.

## 8. Suggested first message for David to paste in the new chat

> Read HANDOFF-ABQUOTE-TRAINING.md in the marion repo, then help me get you access to the
> ABQUOTE SharePoint files (try the Microsoft 365 connector first) and start phase 1:
> inventory and review what's there.

---

## 9. Phase 1 results (2026-09-26, AI Data Training chat)

**Where ABQUOTE actually is.** Not a ClaudeAgent copy and not the Microsoft 365 connector
(David: no connector access). The corpus is the SharePoint site **CRM**, document library
**Quote** — the library Dynamics Document Management files every sent quote email into.
David added it as a OneDrive shortcut (`OneDrive - Sealing Solutions Group\Shortcuts\CRM - Quote`)
and granted that folder to the session; the inventory ran in the device shell at near-zero
token cost. Nothing is written into that folder.

**Shape (all 13,440 files, 4.34 GB; from names/sizes/dates):**
- 3,408 Dynamics record folders named `<quote email subject>_<32-hex GUID>`, one per CRM
  quote record, Dec 2025 → Sep 2026 (filing started 19 Dec 2025; ~1,000–2,400 files/month).
  Typical folder = the sent `.eml` (attachments embedded, ~0.7 MB) + the P21
  `Quote NNNNNNN-0001.pdf` + 1–2 signature images. 3,167 P21 quote PDFs.
- 974 root `.msg` from a Feb 2026 drag-and-drop upload (subjects Dec 2025–Feb 2026;
  618 of their quote numbers also exist as folders).
- 3,684 distinct P21 quote numbers, 522 customer codes. Naming: root `.msg` =
  `_<CUST>__QT#<7 digits>[-rev]__PO#_<PO or ask>.msg`; folders = same subject with
  `# < > :` → `-` plus `_<GUID>`.
- **Pre-2026 history is NOT here.** Quotes before 19 Dec 2025 live only in the Outlook
  "AB Quote" folder (the monthly purge flow moves them to that folder's Archive, deletes
  nothing). Whether to export them is board item 29.

**Sample review (24 folders across 24 customers + 16 root `.msg`, 63 files hydrated):**
- 24/24 PDFs are P21 quotations with a clean text layer; `pdftotext -layout` gives the §5
  table cleanly (customer code top-left, BILL TO / SHIP TO, CUSTOMER P.O., SLSMN / ORDER
  DATE / TAKER, `***instruction***` notes, lines = qty · item code · U/M · 4-decimal unit
  price · description lines). One §5 correction: the PDF prints `NNNNNNN-0000` while the
  file name says `-0001`. 5/24 are two pages.
- 39/40 emails are outbound sent quotes from staff to the customer with the PDF attached.
  22/40 carry the customer's original email in the quoted thread (a real `asked`); the rest
  cite a phone call or samples and restate the ask in one line. Some root `.msg` carry the
  customer's request as a nested `.msg` or an RFQ PDF (the build-.2 recursion already
  handles nested `.msg`). The subject's `PO#_` tail is often the ask in shorthand.

**Blocker for bulk work.** The shortcut's files are cloud-only placeholders: the device
shell sees names/sizes but reads fail until OneDrive downloads them. `device_stage_files`
hydrates a file as a side effect (good for samples, 50 per call); bulk needs David's
right-click "Always keep on this device" (computer use on Explorer is click-only — no
right-click, no clipboard) or ~270 staging calls. Board item 30.

**Tooling verified.** Cloud sandbox: `extract-msg` (no-deps workaround), PyMuPDF, pdftotext.
Device shell: Python 3.10, stdlib `email`, `olefile` installable, `pdftotext`; slow metadata
(~50 files/s) — use the resumable walk script in `ClaudeWorkspace\ABQUOTE-inventory`.

**Records.** Manifest (13,440 rows: folder, file, ext, bytes, modified, customer_code,
quote_no, quote_rev, record_guid, source_type, is_p21_quote_pdf) in Drive Claude/Files
`2026-09-26 - AI Data Training - ABQUOTE phase 1 inventory manifest.csv`; project doc
`claude/abquote-phase1-inventory-2026-09-26.md`; Marion Open Items board items 28–33
(29 pre-2026 history, 30 bulk download, 31 phase-3 extraction on GO, 32 load target a/b/both,
33 evaluation set). Customer names, addresses and prices never enter this repo.

---

## 10. Handoff of 2026-09-30 — history first is live (92%); what the next chat does

Written 2026-09-30 by the AI Data Training chat. Full handoff with the customer-level detail:
Drive Claude/Files "2026-09-30 - FLAB - Agent - Quote / Marion - HANDOFF - ABQUOTE training
continuation" and project doc `claude/handoff-abquote-training-marion-agent-2026-09-30.md`.
No customer names, codes or prices in this file.

**State.** David's decision tree — 1 this customer's history (heaviest), 2 other customers'
history, 3 catalog, 4 stock, 5 price — is live on build **2026-09-28.4** with
`public.history_lookup` v2 (migration `abquote_history_lookup_v2_reference_tokens_only`):
reference-like tokens only (letter+digit codes of 4+ characters, numbers of 5+ digits, dash
o-ring numbers), whole-token matches, item-code equality or prefix, qty =
`coalesce(quantity_kit, quantity)`, kit code by exact `bom_lines` component-set fingerprint.
`crossRefCart` step 0 (quote-app-2.js): a customer row naming the rule-built part CONFIRMS it
(conf high); a reference / ask hit only fills an EMPTY part number; a PO / W/O hit may replace a
non-high guess. `callMarion`: max_tokens 8000, upstream API error text shown in the status line,
JSON extraction takes the last `{"intent"` object and recovers `//` comments / trailing commas.
Rules 30 (cylinder kit mode narrowed), 48 (compact one-line JSON, nothing but the JSON) and one
customer rule were added in run 3 — do not undo them.

**Score on the fixed held-out set** (20 quotes: 7025926, 6138559, 6138357, 6137838, 6137964,
6136296, 6140591, 6137626, 6139767, 6135928, 6139891, 6139095, 6137457, 6135927, 6142444,
6139779, 6136652, 6136155, 6138269, 6136167; 15 text-evaluable, 36 lines; the five image-only
asks are 6136296, 6136652, 6137457, 6139095, 6142444), always with the 20 excluded from history
via `window.__HIST_EXCLUDE`:

| Measure | Run 1 (before rules) | Run 2 (rules + fixes) | Run 3 (history first) |
|---|---|---|---|
| Exact part number | 14 (39%) | 28 (78%) | 33 (92%) |
| Wrong lines produced | 34 | 13 | 2 |
| Prose / unparseable answers | 4 | 0 | 0 |

Every run goes through the REAL page (`callMarion` → `applyParsed` → `crossRefCart`) in the
signed-in quote.html tab, never a re-implementation (CLAUDE-PREFERENCES item 50: AI-quality
changes ship with a before-and-after score). The evaluation script (rewritten from the run-3
pattern) is in the Drive / project handoff, section (b).

**What landed on 2026-09-30 and is not yet read by Marion:** the import chat's invoice gap fill —
`public.invoice_lines` 329,565 rows (was 178,099) to invoice date 2026-09-25, 12,505 kit headers
(`sell_as_kit`), 82,081 components linked by `parent_invoice_line_id`, 9,937 write-in headers
with no part number whose `product_description` is the P21 kit-by-size text
(`N.NNN"ROD X N.NNN"BORE`). history_lookup v2 returns them on a PO / W/O match as ordinary
lines. Board item 66 (David's GO): v3 turns such a header into the kit-by-size answer and lists
its components in the note — the history the two remaining held-out kit misses lacked.

**Next pieces, in order (Marion Open Items board https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk):**

1. Item 33 — run 4: the five image-only asks through the page's own file drop in David's Chrome
   (the customer's `.eml` / `.msg` with its image; the P21 quote PDF is the answer and is left
   out; `window.__HIST_EXCLUDE` set first). Score into the project doc section 9.2.
2. Item 39 — David's two remaining WHY answers (a polypak suffix on quote 6135928; a back-up
   ring left off quote 6137964) → one `ai_rules` row each, both quotes re-run.
3. Item 66 — history_lookup v3 for kit-by-size invoice headers (above), on GO; before-and-after
   table on the 20 quotes.
4. Item 21 — the thumbs up / thumbs down feedback tool (`marion_feedback`), on GO.
5. Items 64 and 65 — ABQUOTE document management (Dynamics side, not Marion code): repoint 1,116
   quote document locations of 2026 to the folder the EmailToQuote flow actually filed into, and
   change the flow so an existing quote files into its own location, gets its note and the email
   on its timeline. Both on David's GO.

**Protocols that bit this week (added to CLAUDE-PREFERENCES v63 as items 49 and 50):** shared
files (this CHANGELOG, the hub CHANGELOG, the board) are re-fetched immediately before every
write — two CHANGELOG entries were lost to stale pushes from concurrent sessions on 2026-09-28
and restored; every prompt / rule / lookup change is scored on the held-out set through the real
page. Also: an AI feature failing with HTTP 400 / 401 and no code change is checked against the
provider's credit balance first (2026-09-28 outage = spent prepaid balance on the Anthropic
console account behind `ANTHROPIC_API_KEY`; auto-reload prevents a repeat).

**Records this session wrote:** marion CHANGELOG (HISTORY FIRST LIVE entry), hub CHANGELOG and
projects.md, project doc sections 9 / 9.1, board items 33, 39, 40, 42, 56, 64, 65, 66, the
Drive / project handoff, a Learnings HANDOFF note.

---

## 11. Session of 2026-09-30 (evening) — history_lookup v3, run 4, the two WHY rules; what the next chat does

Written 2026-09-30 by the ABQUOTE training continuation chat. Full handoff with the customer-level
detail: Drive Claude/Files "2026-09-30 - FLAB - Agent - Quote / Marion - HANDOFF - ABQUOTE training
(kit collapse, shaft-seal rule, feedback tool, document repair)" and project doc
`claude/handoff-abquote-training-kit-collapse-2026-09-30.md`. No customer names, codes or prices here.

**Shipped.** Migration `abquote_history_lookup_v3_kit_headers` (invoice PO / W/O hits return top-level
lines, a kit header carries `is_kit` + `components`; strong PO / W/O tokens only; the held-out quotes'
outcome invoices excluded; EXECUTE authenticated + service_role). quote.html build **2026-09-30.1**
(a kit header answers a kit ask) and **2026-09-30.2** (JSON retry repairs a dropped empty
`p21_quote_no` value — 4 of 40 calls). ai_rules **50** (-AER = anti-extrusion ring version, same size
and application, high-pressure upgrade) and **51** (a requested back-up ring is never dropped:
8-NNN/N90, substitute 8-NNNSD/T).

**Score on the fixed held-out set** (20 quotes, 19 evaluable — one ask was a phone call; 47 lines;
real page; held-out quotes excluded from history):

| Measure | Before (build 2026-09-28.4, v2) | After (builds 2026-09-30.1 / .2, v3, rules 50–51) |
|---|---|---|
| Exact part number, all 47 lines | 35 (74 %) | 36 (77 %) |
| Text-only 15 quotes (36 lines) | 33 | 33 (34 of 37 counting the back-up ring the ground truth left off) |
| Image-only 4 quotes (11 lines, run 4) | 2 | 3 (one quote varies 2–3 of 7 on the same build) |
| Wrong lines | 10 | 9 |
| Unparseable answers | 0 | 3 on .30.1 → 0 on .30.2 (regression found and fixed) |
| Probe set, 5 non-held-out quotes with kit-header history (8 lines) | 1 | 1, no kit misfire |

**Why v3 did not move the score:** one held-out kit miss has no invoice for its reference; the other's
invoice predates kit headers (component lines only); and a customer who lists a previously ordered kit's
contents gets the components back because the extraction splits the kit before history runs.

**Next pieces, in order (Marion Open Items board https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk):**

1. Item 68 (on GO) — kit collapse: a request-level PO / W/O reference whose invoice has one kit header
   and whose extracted lines are that kit's components collapses into the kit line; a components-only
   invoice gives rod (wiper / rod-seal inside diameter) × bore (piston-seal outside diameter).
2. Item 69 (on yes) — metric shaft seal rule: S + ID(3) + OD(3) + width×10(3) + type, default TC
   (258 TC lines vs 29 of the other family in the corpus).
3. Item 39 — one question left: does an RE prefix on one distributor's polypak number mean the -AER version.
4. Item 21 (on second GO) — feedback tool as designed on the board; the weekly digest gets its own
   sender (the existing notify function stays locked to its one recipient).
5. Items 64 / 65 / 67 — ABQUOTE document management (Dynamics side): the Documents tab of 1,116 quotes
   points at an empty sibling folder in the same library; the nightly "Quote Content #" counter counts
   that empty folder. Repoint on GO, then a one-time recount.

**Evaluation route that worked for image-only asks:** decode the sent quote `.eml` in the device shell
(Python `email`): body text including the quoted / nested customer message → `<quote>_ask.txt`; ask images
only (skip the P21 PDF — it is the answer — and signature / logo images); upload `.txt` + images through
quote.html's own file input (Claude-in-Chrome file_upload), then `callMarion` on the textbox + staged
images → `applyParsed` → `crossRefCart`. Inputs sit in `ClaudeWorkspace\ABQUOTE-inventory\eval-images\`.

---

## 12. Session of 2026-10-01 (evening) — kit collapse, shaft-seal rule, RE codes, feedback tool; what the next chat does

Written 2026-10-01 by the ABQUOTE training chat. Full handoff with the customer-level detail: Drive Claude/Files
"2026-10-01 - FLAB - Agent - Quote / Marion - HANDOFF - ABQUOTE training (counter check, rule 49, next misses)"
and project doc `claude/handoff-abquote-training-counter-check-2026-10-01.md`. No customer names, codes or prices here.

**Shipped.** ai_rules **52** (metric shaft seals by size: S + ID(3) + OD(3) + W×10(3) + type, TC by default) and an
extension of rule **25** (inch rod-seal codes RE + digits are Fluidseal codes, the RE is kept). quote.html build
**2026-10-01.1**: `crossRefCart` step −1 `kitCollapse()` — the request's PO / W/O goes to `history_lookup` once; one
invoice kit header whose components make up at least half of the extracted lines collapses them into the kit line;
a components-only invoice on a kit ask gives the kit by size (rod = wiper / rod-seal inside diameter, bore =
piston-seal outside diameter). Feedback tool (board item 21): table `public.marion_feedback` (migration
`marion_feedback_v1`), thumbs in quote.html and the Marion chat, "Unreviewed feedback" panel in quotes.html, edge
function `marion-digest` (weekly, Monday 7 AM America/Edmonton, fixed recipient) with pg_cron job 28.

**Score** (fixed held-out set, 47 lines; probe set, 8 lines):

| Measure | Before | Rules 52 + 25 | + kit collapse |
|---|---|---|---|
| Exact, all 47 lines | 36 (77 %) | 38 (81 %) | 39 (83 %) |
| Wrong lines | 9 | 9 | 9 |
| Probe set exact | 1 | 3 | 4 |

**Next pieces, in order (Marion Open Items board https://claude.ai/artifact/VmxUh2isKacUXSGqB79bnk):**

1. Item 39 — apply the held rule-49 update (one customer rule still says to drop the RE prefix) once David approves
   the database prompt; re-run that quote.
2. Item 67 — after the nightly Quote Content # run, re-run the Dynamics comparison (quotes of 2026: counter versus
   files in the quote's Quote-library folders) and write a one-time counter update only for quotes still off.
3. Item 21 — confirm the first weekly digest arrived (Monday 2026-10-05) and that staff thumbs land in the review panel.
4. Next misses on the held-out set: an OEM kit screenshot quoted as the house kit equivalent (needs a WHY), the work-order
   photo misreads (wiper / piston suffixes, wear-ring width), measured-seal photos; and one kit number whose only history
   is the held-out quote itself.

**Lesson.** The Supabase connector holds some UPDATE statements for an approval prompt; when no one answers, the call
times out after 180 s with nothing applied. Inserts and other updates went through in the same minute. Stop after three
timeouts and ask David to approve the exact change in the chat.
