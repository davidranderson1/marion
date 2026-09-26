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
