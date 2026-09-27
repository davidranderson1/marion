# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

## 2026-09-27 · ABQUOTE training APPLIED — match_parts ranking fix + customer-rule policy (DB), 24 ai_rules, quote.html build 2026-09-27.1; evaluation 39% → 78%
- David's GO on board items 36 / 37 / 38 (2026-09-27). Logged per the shared-DB protocol
  (`list_migrations` + this file checked first; today's other migration
  `invoices_and_invoice_lines_sync_v1` does not overlap).
- DB migration `abquote_match_parts_ranking_fix_and_customer_rules_staff_only`:
  `public.match_parts` (same signature) now (1) counts `xref_feedback.action =
  'p21_ground_truth'` in `fb_picks`, so the 8,495 historical quote lines rank compounds
  (2-248/N70 first, not 2-248/19657 alphabetically); (2) FIXES the height term — with
  `p_units='in'` the old code compared `height_mm`/`cs_mm` to the inch value, so the
  variant with the numerically closest millimetre value won (2-248/V1163 over /N70; PSP-326A
  not in the top 6 for its own size) — inch asks now use `height_in` or `cs_mm` converted;
  (3) penalises a part with no height data (`p_tol_mm*2`) instead of rewarding it with 0;
  (4) accepts `cs_mm` in the inch dims filter; (5) returns NO rows when id, od and h are
  all null (callers used to get an arbitrary Active part). `ai_rules` policy "authenticated
  read rules" is now `category not like 'customer:%' or is_staff()` — per-customer rules are
  staff-only; marion-chat needs no change (caller's JWT).
- ai_rules: 24 rows inserted (13 global — house compound defaults for bare dash numbers,
  verbatim Fluidseal codes + normalisations, default inch suffixes /4615 /CL, OEM o-ring →
  house o-ring, brand prefixes (Garlock G-, V-ring, Char-Lynn RCLY-, Parker RPH- padding,
  Cat S→5), `*` specials, CYLINDER KIT MODE (one `<rod> ROD X <bore> BORE` line per
  cylinder), OEM kit instead of components (Parker accumulator RPH-RK<bore×100>K000),
  v-packing set + packing, staff-forward detection, one-list-once, image-only asks →
  empty JSON, lead-time wording; 11 `customer:<ACCT>` rows). Editable in the Staff Desk.
- quote.html build 2026-09-27.1 (quote-app-2.js blob 791fd836, quote-app-3.js cc56b349,
  quote.html aa5a1090 — all hash-verified): `callMarion` sends `use_tools:false` (JSON
  every time; the prose replies are gone); `applyParsed` no longer clears a pn that equals
  the customer's number — `crossRefCart` step 0 checks `part_info` and keeps a real
  Fluidseal code (conf high, oem cleared) or clears it and falls through; no dimensional
  search without id or od; a rule-built pn not in the catalog (and not a kit / `*` line)
  is flagged "NOT in catalog — staff confirm" with conf med; `p_prefer:'oem'` only when
  the model named a brand.
- EVALUATION (20 held-out quotes, ask text only, David's Chrome, real page functions):
  15 text-evaluable quotes / 36 lines — exact 14 → 28 (39% → 78%), wrong lines 34 → 13
  (9 are a two-kit list extracted twice), prose-instead-of-JSON 4 → 0, one cylinder-kit
  line now exact. Remaining misses need customer history (board item 40: history-first
  decision tree — RPC `history_lookup` + crossRefCart step 0, awaiting GO) or David's
  reasons (item 39). Per-quote detail in the private project doc §7–§8.
- Not changed: marion-chat, marion-notify, any other table or schema.
- BOARD NUMBERING NOTE for the invoice-sync session below: the Marion Open Items board (artifact
  VmxUh2isKacUXSGqB79bnk) holds items 1–40 as of this push and its item 40 is the history-first
  decision tree; the "board item 40 / 41 / 42" in the invoice entry are not on that board yet —
  add them as 41–43 (or on the Dynamics board) to avoid a collision.

## 2026-09-27 · Dynamics invoice history synced: invoices (35,878) + invoice_lines (178,099) — dynamics-sync v11, two migrations
- WHY: Marion needs "same as PO# …" matching from invoice history (David, 2026-09-27). Dynamics Invoice Lines
  are the P21 component lines as invoiced — kits are NOT combined (ab_sellasakit / ab_parentinvoiceline /
  parentbundleid are empty on every row), so a PO match returns the components; kit recombination is a
  follow-up (board item 42).
- DATA STOPS AT 2026-01-20: the newest P21 invoice date in Dynamics is 2026-01-20 (order-ship 7164090-1), last
  imported into Dynamics 2026-01-21 17:21 UTC; earliest lines 2025-03-03 (headers reach back to 2024-11-01 for
  309 invoices that have no lines). 178,099 lines / 35,878 headers — Dataverse and Supabase reconcile exactly in
  six invoice-date buckets. Nothing newer exists in Dynamics until David re-imports Invoice Lines from P21
  (board item 40).
- MIGRATIONS (public schema, Marion objects only): `invoices_and_invoice_lines_sync_v1` — tables
  `public.invoices` (header: customer_po = new_po, p21_order_no = new_orderp21, customer_code, account, taker,
  totals, status) and `public.invoice_lines` (invoice_id, p21_invoice_no = cr5da_invoicep21 "7163441-1",
  invoice_date = cr5da_invoicedatep21, part_number = product name, product_number = P21 item id, quantity,
  price_per_unit, net_price, extended_amount, discount_type, cost / profit STAFF ONLY, disposition,
  inventory_name, sequence_number …); indexes on the P21 numbers, upper(customer_po), customer_code,
  invoice_date, upper(part_number), product_id; RLS enabled with `is_staff()` select policies (service_role
  writes); sync_state rows. `invoice_lines_column_comments` — findings recorded as column comments:
  ab_linenumber = the invoice's TOTAL line count (not the P21 line), sequence_number is the line order, the
  header's new_invoicep21 is empty (use p21_order_no / name "INVOICE  - <customer code> - <order no>").
- EDGE FUNCTION: `dynamics-sync` v10 → v11 — two TABLES entries added (`invoices` ← invoices,
  `invoice_lines` ← invoicedetails; createdon-windowed, page 1000, typed columns, no raw jsonb); every existing
  config untouched (products, inventory, accounts, contacts, account_products, vendor_products, customer_code,
  vendor_code, net_discount, volume_discount, percentage_discount, employee, systemuser, team, team_member);
  clean() now spells its non-breaking-space regex as an explicit U+00A0 escape. Deployed source read back and diffed against v10
  (only the additions).
- LOAD: 7 + 20 createdon windows fired through pg_net (`net.http_get` on the function URL with since / until,
  170 s timeout); all 27 succeeded (sync_log ids 2167–2193, longest window 55 s). NOT scheduled nightly yet —
  the two cron jobs are a guardrail item (board item 41). Access: staff only; customer-scoped access (own
  invoices, no cost columns) is board item 43.

## 2026-09-26 · ABQUOTE training — evaluation run 1 (before rules): 39% of lines right, three quote.html defects found (docs only, no code or DB change)
- 20 held-out historical quotes (customer's ask text only, no P21 PDF) run through the live
  page's own `callMarion()` + the same cross-reference chain the app runs, in David's Chrome
  against build 2026-09-26.6, scored against the P21 line codes: 15 quotes evaluable from
  text (5 asks live in inline images / work-order attachments), 14 of 36 expected lines
  exact (39%), 0 of 4 cylinder-kit lines, 34 wrong lines produced, 4 of 20 AI calls answered
  in prose instead of JSON. Per-quote table + reasons in the private project doc
  `claude/abquote-learnings-and-candidate-rules-2026-09-26.md` §7 (customer names, so not here).
- DEFECT 1 (quote-app-2.js `callMarion`): the extraction body has no `use_tools:false`, so
  marion-chat attaches its catalogue tools (its default) and the model sometimes replies as a
  chat assistant — one run found the RIGHT kit with stock in prose ("Here's what I found for
  you …") and the page threw it away as "no JSON in response". The edge function already
  supports `use_tools:false` (its comment names the extraction path as the reason). One-line fix.
- DEFECT 2 (`crossRefCart` + `match_parts`): a line with a kind but no dimensions still calls
  `match_parts`, which returns an arbitrary Active part when id/od/h are all null ("63551 Seal
  Kit" → a RATCO kit; "64x4218 Garlock oil seal" → an RCAT part). Guard: skip the dimensional
  search without id or od, and/or make `match_parts` return no rows when all dims are null.
- DEFECT 3 (`applyParsed` echo guard): a pn equal to the customer's number is cleared even
  when the customer wrote a real Fluidseal code (PSP-326A, D-01250/4615, AN-13/4615,
  18701250-312B/4615, D-04500), and the dimensional search then replaces it with an RHAL-…
  OEM-cross part. Check `part_info(pn)` first: a code that exists in the catalogue stays.
- Also seen: a list that appears twice in a thread is extracted twice (14 lines for 7); the
  model invents Fluidseal-grammar codes for dimension asks (J08751125156, RSS-00875/2 …) that
  `part_info` would flag — keep that check in the pipeline.
- Board: item 33 answered (run 1 scored), 38 (the three fixes, needs GO), 39 (David's reasons
  for ten ask-vs-given differences). Nothing changed in code, DB or ai_rules.

## 2026-09-26 · Cart rules engine (build 2026-09-26.6) — quote.html split into shell + 3 scripts
- Methodology from Azure DevOps: #6477 GET METHOD (corrected priority Transfer →
  Assembly → Machining [BOM component with Profile Group = Material] → Purchase),
  #8353 Discount (Pricing) Configurator (Exclusions → Volume → Net Price →
  Percentage → List price, first match wins; lowest price on conflict — the July
  snapshot engine get_net_price / get_cart_prices / get_my_cart_prices is now
  wired into the cart), #8355 CART_CODE_REVIEW (BR-02/03/05/06/07/08).
- quote.html is now a 26KB shell loading quote-app-1/2/3.js (plain scripts, shared
  global scope, load order matters) — a 142KB single file can no longer be pushed
  from a chat session. This build MERGES the desktop 2026-09-26.5 (P21 card
  reformat + FS_LOGO wordmark) via git 3-way merge, and re-implements the
  Find-parts tab / import banner / header link inside the new engine.
- Cart (step 2): computed Disposition chips per line AND per BOM component (BR-02
  required-qty recursion; dropdown = manual override), Production method chip
  (BR-03), GET method chip per line + component, On Hand column (staff exact /
  customer availability bands per the 2026-07-28 decision), warehouse ▾ / On-Hand
  click → all-warehouse inventory popup via get_stock (pick a row to set the
  line's warehouse; no hardcoded warehouse list — ERP BUG-14 avoided), account
  pricing via the discount engine with discount-type tag under Net Price (manual
  price wins; qty/account edits re-price for volume tiers), staff margin colouring
  ≤26% (BR-05/06, cost basis for parts AND kits — ERP BUG-03 fixed by design),
  per-line ETA date with BR-07 colour, totals bar + GREEN/YELLOW/RED cart light
  (BR-08 adapted), submit gate (whole-number qty; PO confirm for orders).
- Submit revisions: quotes.revision increments on re-submit; rev pill on card,
  rev in the notify email subject/header/PDF name.
- DB migration cart_rules_engine_support: get_cart_facts(pns) RPC (profile_group /
  vendor / list_price / cost staff-gated), execute grants for get_stock +
  get_cart_prices + get_my_cart_prices, quote_lines.discount_type / rule_id / eta /
  get_method / prod_method, quotes.revision.
- marion-notify v13 deployed: kit structure on the email card (KIT: parents, ↳
  components sorted under parents), per-line fulfilment context, revision markers.
  Recipient lock unchanged.
- quotes.html: staff desk shows KIT/↳ nesting, fulfilment context, discount type.
  account.html: same kit view + rev marker. Closes the CLAUDE-CART §10 Marion
  carry-forwards.
- Verified: 40/40 jsdom rule tests on the merged build; every pushed file blob
  SHA-verified. Marion Supabase objects only; xpress/flabed/archive untouched.

## 2026-09-26 · SSG WEBSITE SESSION (evening): flabed graph — Ball Stud Kits rename, description-found kits, +3 models, +19 fitments (public/archive/xpress untouched)
- Logged by the SSG Website / Updates session per the shared-DB protocol. DML only, in
  `flabed` rows only — no DDL, no migration.
- `flabed.market_equipment.part_categories`: "Stud Ball Kits" → "Ball Stud Kits" on all 9
  rows (David's correction; the Dynamics products are `RCAT-<model>/BALL STUD KIT`).
- `flabed.equipment_models` +3 (sources = description): RKOM 980E (Mining card 3), RHIT EH4550
  and REUC "190 TON" (card 7) — 1,486 rows now.
- `flabed.equipment_fitments` +19 (source = description, kit_match exact, matched by the model
  named in the Dynamics description): Komatsu 960/980E front / hoist / steering / 980E-5
  steering / rear kits (RKOM-58B/FS/AK010, 58B/HC/AK010, 58B/SC/AK020, 58B/SC/AK030,
  58F/RS/AK031), Hitachi EH4550 hoist (RHIT-E12614451), Euclid-Hitachi 190-ton truck
  suspension (REUC-4087775), and the 14 Caterpillar ball stud kits (797, 793, 789, 785,
  777 / 777C / 777D, 773, 769C, 24M / 18M / 16M / 14M / 12M) — 265 rows now. Every part
  number and list price used was checked against `public.products` (109 of 109 found, prices equal).
- DECISION on the remaining ~11,900 catalog fitments: NOT bulk-loaded through the chat
  connector (a 1,000-row chunk test showed about 700k tokens of retyping for the whole set).
  Fitments are loaded per market as its page is built; the full load runs from David's PC in
  a minute once `flabed` is exposed in the Data API (SSG board item 21). Source TSV in the
  Website folder `kit-catalog/graph/graph_fitments.tsv`.
- Mockup `fluidseal-mockup/markets/mining.html`: one grouped "Products For Mining Equipment"
  band (Kits & Parts / Hard Parts / Seals, as on the home page), Ball Stud Kits rows with Add
  to cart on the Caterpillar cards, the 980E and Hitachi-truck kits above, PC280LC-3 / PC300 /
  PC360LC-3 as related models for the PC290LC-11 card. `data/mining-equipment.gz.js` re-pushed
  as short base64 lines after a single corrupted character in the first push (caught by the
  raw-file SHA check); `data/mining-equipment.json` removed from the repo (current copy in the
  Website folder `kit-catalog/` and the Claude project).
- Nothing in `public`, `archive`, or `xpress` touched. Dynamics NOT written.

## 2026-09-26 · ABQUOTE training — corpus analysed, two live-code findings, candidate rules awaiting GO (docs only, no code or DB change)
- Analysis of the loaded corpus (3,395 quotes / 11,467 part lines) is written up in the
  project doc `claude/abquote-learnings-and-candidate-rules-2026-09-26.md` (private —
  customer names and net-price ratios, so NOT in this repo). 7 global + 10 per-customer
  `ai_rules` candidates are drafted there; nothing inserted until David answers board
  item 37.
- FINDING 1 (ranking): `public.match_parts` counts only `xref_feedback.action in
  ('picked_option','confirmed_auto')` for its `fb_picks` tie-breaker, so the 8,495
  `p21_ground_truth` rows loaded today have NO effect on ranking yet. Fix = add the value
  to that one predicate (board item 36, needs GO). The function is SECURITY DEFINER, so
  RLS on xref_feedback does not hide the rows once counted.
- FINDING 2 (exposure): `ai_rules` policy "authenticated read rules" is `using (true)`,
  and both quote.html (`getRules()`) and marion-chat (`buildSystemPrompt`) load every
  active row with no category filter. A `customer:NAME` rule would therefore be
  readable by any signed-in customer and injected into every customer's chat prompt.
  Fix = one policy so `customer:%` rows are staff-only (board item 36) BEFORE any
  per-customer rule is inserted; marion-chat needs no code change (caller's JWT).
- Corpus facts worth knowing for the intake prompt: 575 quoted lines (72 customers) are
  cylinder KIT lines whose item code is the geometry itself (`<rod>MM ROD X <bore>MM
  BORE` or `<r.rrr>"ROD X <b.bbb>"BORE`, desc = the customer's W/O or "AS PER …");
  1,142 further lines are `*`-prefixed P21 specials or other non-catalog codes; bare
  dash o-rings are quoted `2-xxx/N70`, `8-xxx/N90`, `3-xxx/N90`, `4-xxx/QN70` unless a
  compound is named; 232 of the captured "asks" are our own staff forwards
  (`From: …@sealsonline.com … Subject: <ACCT> QT#: … PO#: …`), not customer wording.
- Board: items 29 (pre-2026 Outlook batch) and 34 (179 undownloaded folders) closed —
  David: no more training data needed. Items 36 (two migrations) and 37 (rules) added,
  item 33 (evaluation route) still open.

## 2026-09-26 · P21 card true-to-form + real brand wordmark (build 2026-09-26.5) — ⚠ BUILD-NUMBER COLLISION, read before merging find-tab
- ⚠ **TO THE TRAINING-WEBSITE / DESKTOP GIT SESSION merging branch `find-tab`:** main has
  moved — quote.html is now blob `bf3d4d87` (THIS entry's push), no longer the `be3ea5d7`
  (.4) your branch was cut from, and your unpushed file also calls itself build
  2026-09-26.5. DO NOT overwrite: `git merge` (or rebase) find-tab onto current main —
  the only overlap should be the MARION_BUILD line (both sessions changed it) plus
  nearby step-1 markup; resolve by keeping BOTH feature sets and stamping the merged
  file **2026-09-26.6** with a combined comment. This entry's changes live in cardHTML /
  cardP21HTML / FS_LOGO (step-3 card renderers) — they should not touch your step-1
  tab strip. Hash-verify the merged push per protocol.
- cardP21HTML rebuilt against the real ERP PDF (re-read all 5 samples with pdftotext):
  3-part QUANTITY header (ORDERED / B.O./RET. / SHIPPED) + MULT. column; the
  "PRICE SUBJECT TO CHANGE WITHOUT NOTIFICATION (TARIFFS)" note now always shows (the
  real form prints it even when priced); CUSTOMER P.O. NO. under BOTH the BILL TO and
  SHIP TO blocks; duplicated QUOTATION NUMBER boxes kept (that's how P21 prints it);
  CODE EXPLANATION legend corrected to the real one (* PST / # GST / + both /
  B BALANCE BACK ORDERED / C CONSIDER COMPLETE / D DIRECT SHIPMENT / F FACTORY MINIMUM /
  RT RETURNED — the old B-BUY/S-STOCK/T-TRANSFER legend was invented and wrong); totals
  panel now carries MISC. I / MISC. II / TOTAL TRANSPORT / RECEIVED rows like the form;
  lighter 1px rules + consistent padding throughout.
- BRAND FIX: the Fluidseal card (cardHTML) header logo was a hand-typed rebuild
  (#FFD400 dot + italic text) — violates FLUIDSEAL-THEME.md §4 ("use the REAL asset").
  New repo file `fluidseal-logo.svg` (official No Tag Line wordmark, generated from
  Brand Guidelines/Logos PDF via PyMuPDF per the theme spec — 5.4KB, exactly #231f20 +
  #ffdd00); cardHTML renders it via <img src=FS_LOGO> (same-origin relative URL, so the
  html2pdf PDF attachment renders it too).
- NOT synced yet: account.html cardHTML and marion-notify's email cardHtml still use the
  old hand-typed mark — same fix available on request (the email needs a hosted https
  URL, e.g. https://marion.fluidsealab.com/fluidseal-logo.svg).
- Both pushes hash-verified (quote.html bf3d4d87, fluidseal-logo.svg 7dfd8b87).

## 2026-09-26 · ABQUOTE training corpus LOADED — training_quotes / training_quote_lines + 8,495 p21_ground_truth rows (public schema, additive)
- Logged by the AI Data Training chat per the shared-DB protocol (`list_migrations` + this file
  checked first; parallel sessions today: hr_*, flabed_*, cart_rules_engine_support — no overlap).
- DB migration `abquote_training_tables_v1`: two NEW tables in `public` — `training_quotes`
  (one row per P21 quotation parsed from the SharePoint CRM/Quote library: quote_no + revision,
  customer_code, bill-to / ship-to, customer PO, salesman, taker, order_date, ***instructions***,
  subtotal / GST / PST / total, source record, and the customer's original request in
  `asked_text` with `asked_source` = quoted_thread / nested_msg / rfq_pdf / other_pdf for the
  customer's own words or restated for Fluidseal's one-line restatement) and
  `training_quote_lines` (line_no, item_code = confirmed Fluidseal part number, qty, U/M,
  customer-net unit_price, amount, description, line notes, is_charge for AB/* lines; FK to
  training_quotes). RLS on, SELECT for authenticated gated by `public.is_staff()`; writes are
  postgres-only. Loaded through the dashboard CSV import: 3,395 quotes (2023-07-05 → 2026-09-25,
  $3.25 M quoted), 11,753 lines; every quote's lines sum to its subtotal and total = subtotal +
  GST + PST (0 mismatches).
- BUG FOUND AND FIXED — migration `xref_feedback_allow_p21_ground_truth`: the
  `xref_feedback_action_check` constraint allowed only picked_option / manual_edit /
  confirmed_auto / created_part, so every `p21_ground_truth` row that quote.html (build .2)
  tried to log since this morning was rejected — the table held 0 such rows. The constraint now
  also allows `p21_ground_truth`; nothing else changed on the table.
- Data: 8,495 `p21_ground_truth` rows inserted into `xref_feedback` server-side from the two
  tables (only quotes whose customer ask is present — 2,167 of 3,395 — × their non-charge lines;
  user_id = David; `asked` = the customer's request (≤1,500 chars), `descr` = the P21 line
  description, `chosen_pn` = the item code, `candidates` = ["abquote:<quote>-<rev>:<line>"] as
  the provenance key, created_at = the quote date). 5,112 distinct part numbers. match_parts'
  chosen-part boost now sees them.
- Not in the repo (customer names, addresses, net prices): the extractor and CSVs live in
  ClaudeWorkspace\ABQUOTE-inventory on David's PC and Drive Claude/Files. 179 of 4,383
  source records were still cloud-only placeholders at load time (OneDrive would not download
  them) — a rerun of the extractor plus the same CSV import path adds them later.
- No quote.html change, no build bump.

## 2026-09-26 · SSG WEBSITE SESSION: flabed equipment graph — OEM brands, models, fitments (public/archive/xpress untouched)
- Logged by the SSG Website / Updates session per the shared-DB protocol (`list_migrations` +
  this file checked first; no name collisions — all objects are new and in `flabed`).
- DB migration `flabed_equipment_graph_v1`: three NEW tables in `flabed` — `flabed.oem_brands`
  (part-number prefix → OEM name, confidence, part count, Dynamics name candidates, live slug,
  approved flag + Dynamics id columns), `flabed.equipment_models` (oem_prefix → model, equipment
  type, sources, counts, `market_equipment_id` link to the Mining cards), `flabed.equipment_fitments`
  (model/application → kit part number, bore/rod/unit, kit_match exact|variant|none, catalog page,
  approved flag); public-read RLS + grants to anon/authenticated; view `flabed.v_kit_components`
  (security_invoker) over `public.bom_lines` join `public.products` (no cost columns). READ-only
  use of `public.products` / `public.bom_lines`; `public.account_products` NOT used (private,
  one customer — David's rule).
- Data loaded (DML, `flabed` rows only): oem_brands 311 (182 named; 2 confirmed RCAT/RJD),
  equipment_models 1,483 across 27 prefixes (1,482 from the Seal Kit Catalog Vol.2 section PDFs
  + `R{OEM}-{MODEL}/{APPLICATION}` part numbers, plus Euclid-Hitachi EH5000), equipment_fitments
  246 (mining scope: Cat 797/793/D11/D10/6090/MD6250, Komatsu 930E/830E/HM400/PC490LC/PC2000/
  PC4000/PC8000/HD785/HD465, Hitachi EX8000/EX5500/EX3600/EX2500, JD 870/460E/400D/450DLC/470GLC/
  992E, EH5000; 203 exact Dynamics kit matches). The full extraction is 12,187 fitments / 1,488
  models — too large to load through the chat connector; file copies in the Website folder
  `kit-catalog/` and the approval workbook `Dynamics-Equipment-Graph-Approval-2026-09-26.xlsx`.
  `market_equipment_id` set for 8 of 9 Mining cards (797F, D11T, 930E for the 980E card, HM400,
  EX8000, EH5000 for the Hitachi truck card, 870, 460E; PC290LC-11 has no kit in Dynamics).
- Mockup: `fluidseal-mockup/markets/mining.html` rebuilt — photo equipment cards, per-machine
  order panel (kits by application → components by product type from BOMs → Add to Cart),
  curated "Products For Mining Equipment" band on top, profile groups renamed "Mining Products
  by Type" at the bottom; data ships as `data/mining-equipment.gz.js` + `assets/photo-*.js`.
- Nothing in `public`, `archive`, or `xpress` touched. Dynamics NOT written — approval workbook
  first (new_oembrand / new_manufacturer / new_equipmenttype / new_equipment /
  new_equipment_product / product new_model, new_application, new_cylindergroup, new_cylinderassembly).

## 2026-09-26 · Find parts page + quote-wizard tab (find.html builds 2026-09-26.2/.3, quote.html build 2026-09-26.5)
- NEW `find.html` (Training Website session): seal-grammar search ("100mm x 140mm kit", "hitachi 4653862",
  "RJD-AH173444", "wipers 100mm", questions), Kit view (cylinder cross-section, rod / bore / gland / hard-part
  slots, Base / -CK / -HPCK), Cards, Lines and stock-by-branch Map views, a quote list, and "Add to quote".
  Runs LIVE for signed-in staff on the objects quote.html already reads — `search_products()`, `explode_kit()`
  (depth 1; sibling -CK / -HPCK codes probed), `v_stock_staff` — with the same magic-link sign-in and
  `profiles.is_staff` gate; not signed in = preview with pattern-derived kits (clearly labelled). Sizes with
  no bill of materials fall back to the metric-grammar pattern kit, each line checked against the catalogue.
  Ask Marion goes through `marion-chat` (Sonnet 4.6, kit rules as the system prompt) with canned fallback.
  `?embed=1` hides the page chrome and posts the list to the parent window.
- Hand-off to the quote: "Add to quote" copies the list in Multi Add format (`PN, qty` per line), saves it as
  `localStorage.marion_find_handoff`, and opens quote.html.
- quote.html build 2026-09-26.5 is PATCHED and syntax-checked but NOT yet pushed (live page stays at .4):
  step-1 gets a staff-only tab strip Customer request | Find parts (find.html in a same-origin iframe; its
  "Add to quote" adds straight to CART — real kits become ONE kit line so bomCheck explodes the bill of
  materials, pattern kits land as component lines with the kit code in Reference), a one-click import banner
  for a saved `marion_find_handoff`, and a "Find parts" header link beside Staff. The patched file (126 KB,
  expected blob ff570454) is too large to re-type safely through the GitHub connector from a chat session —
  the 2026-07-16 truncation broke this page — so branch `find-tab` was created from main for a desktop session
  with git to push it and merge. No DB changes; no edge-function changes.
- Hub: `fluidseal-knowledge/data-sources.md` (P21 KIT export facts, live tables, join keys, graph model).

## 2026-09-26 · ABQUOTE training — phase 1 inventory and sample review DONE (docs only)
- `HANDOFF-ABQUOTE-TRAINING.md` gains §9 "Phase 1 results (2026-09-26)": where the corpus
  really is (the SharePoint CRM → Quote library reached as a OneDrive shortcut, not a
  ClaudeAgent copy), its shape (13,440 files / 4.34 GB; 3,408 Dynamics Document Management
  record folders Dec 2025 → Sep 2026 each holding the sent-quote `.eml` + `Quote NNNNNNN-0001.pdf`;
  974 root `.msg` from the Feb 2026 upload; 3,684 distinct P21 quote numbers), the sample
  findings (24/24 PDFs parse in the §5 layout; 22/40 emails carry the customer's ask in the
  quoted thread), the pre-2026 gap (Outlook AB Quote folder only), the placeholder/hydration
  blocker, and the tooling facts. Decisions are on the Marion Open Items board (items 28–33).
- No code, no build bump, no DB changes. Customer data stays out of this repo (manifest lives
  in Drive Claude/Files and ClaudeWorkspace).

## 2026-09-26 · Handoff doc: ABQUOTE (SharePoint) → quote-intake training
- New `HANDOFF-ABQUOTE-TRAINING.md` (repo root; copy in ClaudeAgent\Marion\) for a
  dedicated chat: mine the historical ABQUOTE quote files in SharePoint as ground truth
  for the cross-reference training loop (xref_feedback / p21_ground_truth / customer:NAME
  ai_rules). Covers access options ranked by token cost (Microsoft 365 connector not
  connectable as of today; copy-into-ClaudeAgent is the cheap fallback), the existing
  training machinery, P21 PDF format facts, a 6-phase pipeline, and the shared-DB /
  push / notify protocols. No code or DB changes.

## 2026-09-26 · BOM auto-expand only when kit not in stock (build 2026-09-26.4)
- Refinement of .3 per David: kit BOMs still ALWAYS auto-load (pricing/stock actions
  derive from the components), but the tree now auto-EXPANDS only when the kit itself
  is NOT in stock for the ordered qty — that's when staff must work inside it. Stocked
  kits keep the tree collapsed behind the + expander.
- Stock source: `v_stock_staff` (already granted to authenticated; per-warehouse rows
  summed client-side on qty_available). `v_stock_total` has no authenticated grant —
  deliberately left alone. In-stock test: total qty_available >= line qty; no stock
  row at all counts as not-in-stock (expand).
- Kit badge is now availability-aware: red (functional --red) with tooltip
  "<availability label> · N available" when short; normal blue when covered.
  Editing a line's part number resets the stock check + re-arms auto-expand.
- No DB changes. Verified before shipping via role-impersonation as d.anderson:
  RCAT-2442067 → 0 available "Made to order" (expands), 2-241/N70 → 4056 "In stock".

## 2026-09-26 · SSG WEBSITE SESSION: flabed data refresh — live URL scheme + profiles loaded (public/archive/xpress untouched)
- Logged by the SSG Website / Updates session per the shared-DB protocol (`list_migrations` +
  this file checked first). DML only, no DDL, no migration — `flabed` rows only.
- FINDING: sealsonline.com/en/flabed no longer serves `/categories/{inch|metric}/{group}` —
  the live tree is `/categories/{group}` → `/categories/{group}/{group}-{inch|metric}` →
  `.../{profile}` (hard parts are top-level: `/categories/lock-nuts`, `/categories/weld-on-ports`;
  metal face seals and V-rings sit under `shaft-seals/`; SBB bearings under
  `spherical-ball-bushing/`). The old scheme returns 404 (verified in the browser 2026-09-26).
- `flabed.groups.url` (16 rows) and `flabed.items.url` (29 rows) re-pointed to the live scheme;
  the 6 `#` placeholders (Rod Boot, 5 Manufacturers) now carry the mockup's defaults
  (express / about-us). `flabed.markets.live_url`: 5 slugs corrected (food-beverages, oil-gas,
  pulp-paper, truck-bus, waste-remediation — the live site has no `-and-`).
- `flabed.market_oems.url`: Komatsu / John Deere / Hitachi now point at their own kits pages
  (`.../mobile-equipment-seal-kits/{oem}/{oem}-kits`, 424 / 358 / 367 products).
- `flabed.profiles` LOADED: 269 rows crawled from the live category pages (20 families:
  rod wipers, rod seals, symmetrical, piston, vee packings, guiding elements, O'rings, shaft
  seals incl. metal face seal / V-rings / bearing isolators, flange seals, back-up rings,
  spherical ball bushings, face & thread seals, head seals, hardened steel bushings, gasket,
  retaining rings, sealant, caps & plugs, O'ring kits, OEM kits & parts). Columns: code =
  live label, slug, url, match_count = the live "(N matches)", standard inch/metric, item_id
  (213 resolved by parent URL), group_id (254; 15 rows in 4 live categories the mockup catalog
  does not carry: flange-seals, back-up-rings, face-and-thread-seals, head-seals). The
  workbook's 170 profiles were NOT used as-is — their URLs are the old scheme; a redirect map
  (194 rows) is in `fluidseal-mockup/redirect-map.csv`.
- Nothing in `public`, `archive`, or `xpress` touched.

## 2026-09-26 · TRAINING-WEBSITE SESSION: 6 new Dynamics-sync tables in public (public otherwise untouched)
- Logged per the shared-DB protocol (`list_migrations` + this file checked first; no name
  collisions — all six table names are new). David chose to place them in `public` alongside
  the existing Dynamics-sync tables (products/inventory/accounts/…), the same schema the sync
  already writes to.
- DB migration `dynamics_sync_add_codes_employee_pricing_tables`: six NEW tables in `public`,
  identical locked-down pattern to the existing sync tables (uuid Dynamics-GUID PK; RLS
  enabled with NO policies = service_role only; nothing exposed to anon/authenticated):
  · `customer_code` (4,797) ← Dynamics `new_customercode` (P21 code in `new_customercodep21`)
  · `vendor_code` (3,133) ← `cr5da_vendorcode`
  · `employee` (158) ← `new_employee` — **CURATED**: identity, work/personal email, title,
    department, P21 user role, manager, status ONLY. NO passwords / SIN / salary / health /
    birthday / gender / logins (deliberately not selected; the table has no `raw` column).
  · `net_discount` (12,123) ← `new_accountpricingconfigurations` ("Sales Pricing Configurator")
  · `volume_discount` (56) ← `new_volumediscountlist`
  · `percentage_discount` (494) ← `new_pricingconfigurator` ("Sales Percentage Configurator")
- Row counts reconcile exactly against Dataverse. `net_discount` loaded in 3 `createdon`
  slices to stay under the ~10k edge-function death point.
- Edge function `dynamics-sync` deployed v7: six `TABLES` entries added (five via the existing
  `generic()` helper, one hand-written curated map for `employee`). Existing entries unchanged.
- pg_cron: six nightly created-date jobs added, 08:42–08:52 UTC (before the 09:00 delta job),
  each `select public.sync_nightly('<table>')`. `sync_state` rows seeded, `enabled=true`.
- Marion's own tables, triggers and functions untouched. No `archive` / `xpress` / `flabed`
  changes. `sync_nightly` / `delta_nightly` / cron infra reused, not modified.
- SKIPPED for now: the seventh requested table "Sales Discount Group" → `discount_group` —
  its Dynamics entity was not identifiable by name; David chose to confirm it later.
- Also verified this session: the six original nightly sync jobs are HEALTHY (all clean over
  8 days, no token/401/client-secret errors) — the connector-access outage that blocked the
  2026-08-31 and 2026-09-14 scheduled health checks is resolved.

## 2026-09-26 · Kit BOMs auto-load in the cart + explode_kit grant fix (build 2026-09-26.3)
- ROOT CAUSE of kits showing as plain Items with no BOM: public.explode_kit had no
  EXECUTE grant for the authenticated role (42501). Migration
  `explode_kit_authenticated_execute` grants it — the function stays SECURITY INVOKER,
  so bom_lines RLS (is_staff) still gates the data; non-staff get zero rows.
- quote.html: kit lines now auto-load AND auto-expand their full BOM tree the moment
  bomCheck flags them (components, extended qtys, unit list prices, Fee lines) —
  no + click needed. Collapse with −; auto-open happens once per line (re-arms if the
  part number is edited). Verified as d.anderson: explode_kit('RCAT-2442067') → 15 rows.
- Diagnostics confirmed everything else intact: is_staff() true, bom_lines readable
  (20 rows for the two EMSCO kits), all other RPC grants present.

## 2026-09-26 · Forwarded-email training loop + source capture (build 2026-09-26.2)
- Embedded .msg recursion: a forwarded email that carries the customer's ORIGINAL email as
  an attached .msg is now unpacked — its subject/from/body land in the request box (marked
  "--- ORIGINAL CUSTOMER EMAIL ---") and its own PDF/image attachments are staged too. The
  AI now sees the customer ask AND our P21 quote together.
- P21 ground truth: the AI prompt recognizes our own P21 Quotation PDF (item codes → pn
  conf high, ORDERED → qty, UNIT PRICE → net price — price may only come from our own P21;
  AB/* charge + note-only lines skipped; BILL TO = customer). When the customer ask is also
  present, each line's `asked` is set to the customer's wording and every asked→pn pairing
  is logged to xref_feedback as action 'p21_ground_truth' — a growing training set for the
  cross-reference, mineable into rules.
- Per-customer AI rules: rules whose category is `customer:ACCOUNT NAME` now apply only to
  that customer (prompt-enforced); all other rules stay global. Convention documented as a
  seeded ai_rules row; P21 recognition also seeded as a staff-editable rule.
- Source capture for the future outgoing customer email: DB migration
  `quote_source_capture` adds quotes.request_text, p21_quote_no, source_pdf_name,
  source_pdf_b64 (<4MB). saveQuote stores the ask + first staged PDF + ERP quote number;
  openQuote restores them (request box + attachment chip round-trip). The outgoing
  customer email itself (original ask quoted + OUR card replacing the P21 PDF) is the
  next build — marion-notify recipient stays locked per the 2-approval rule.

## 2026-09-26 · P21/ERP quotation card + card-style toggle (build 2026-09-26.1)
- quote.html Quote step gets a Fluidseal / P21-ERP toggle (persisted per browser in
  localStorage). The new P21 card mirrors the "Quote XXXXXXX-0001.pdf" our ERP emails:
  monospace Quotation layout, BILL TO / SHIP TO, ***QUOTATION*** banner, info boxes,
  QUANTITY/DISP./ITEM CODE AND DESCRIPTION/U/M/UNIT PRICE/AMOUNT table (4-decimal unit
  prices), SUB TOTAL + GST/HST @5% + PST + TOTAL AMOUNT DUE, code-explanation legend,
  30-day validity + warranty footer. Unpriced quotes show TOTAL AMOUNT DUE: PENDING PRICING.
- The original Fluidseal card is unchanged and stays the default; the submitted PDF
  attachment follows whichever style is selected (email body unchanged, marion-notify
  untouched). buildQuote now passes each line's Disposition through to the card.
- Built from 4 real P21 samples (QT#6142660/6142663/7026938/7026939, 2026-09-25).

## 2026-09-25 · SSG WEBSITE SESSION: flabed markets — Mining market data (public/archive untouched)
- Logged by the SSG Website / Updates session per the shared-DB protocol
  (`list_migrations` + this file checked first; no conflicts — flabed-only objects).
- DB migration `flabed_markets_v1`: four NEW tables in the `flabed` schema —
  `flabed.markets` (32 rows: the live site's Markets index; `is_built` flags which
  have a full mockup page — Mining only for now), `flabed.market_oems` (Mining: Caterpillar,
  Komatsu, John Deere, Hitachi), `flabed.market_equipment` (9 Mining machines from the
  Dropbox Equipment Order Forms — Cat 797F & D11T, Komatsu 980E/HM400/PC290LC-11, Hitachi
  EX8000-6 & Mining Truck, John Deere 870G LC & ADT — each carrying the same 5 part
  categories: Hardened Bearings, Spherical Bearings, Stud Ball Kits, Seal Kit,
  High-Performance Replacements), and `flabed.market_groups` (Mining → 17 profile-group
  links). Public-read RLS on all four; writes via service_role.
- mockup.fluidsealab.com is LIVE: GitHub Pages on `davidranderson1/fluidseal-mockup`
  (made public for Pages), Azure DNS CNAME `mockup` → `davidranderson1.github.io` added
  2026-09-25; the Markets index and the Mining page render with the live site's header,
  hero image and CDN product images (no CSP restriction on GitHub Pages, unlike published
  claude.ai artifacts).
- Nothing in `public`, `archive`, or `xpress` touched.

## 2026-09-25 · SSG WEBSITE SESSION: flabed schema — customer-facing category mirror (public/archive untouched)
- Logged by the SSG Website / Updates session per the shared-DB protocol
  (`list_migrations` + this file checked first; no conflicts — the schema name
  `flabed` and every object are new and self-contained).
- DB migration `flabed_website_catalog_v1`: NEW schema `flabed` with four tables
  — `flabed.sections`, `flabed.groups`, `flabed.items`, `flabed.profiles` — that
  mirror the customer-facing category tree of sealsonline.com/en/flabed (the
  Fluidseal storefront). RLS: public read on all four (public catalog data),
  writes via service_role. Exposed schema (`flabed`) must be added to the Data API
  in the dashboard before anon clients can query it — pending.
- Data loaded from the verified home-page mockup: 8 sections, 40 groups, 48 items
  (profiles table scaffolded, empty — the profile-code leaf level is future work).
  All URLs verified live against the site; accessory links confirmed at
  `/categories/{slug}` (NOT `/categories/accessories/{slug}`).
- Nothing in `public`, `archive`, or `xpress` was created, altered, or read-locked.
  Marion's tables, triggers and functions untouched.
- Purpose: backs a new customer-facing mockup at mockup.fluidsealab.com (GitHub
  Pages + Azure DNS CNAME), mirroring the current storefront structure as a
  starting scaffold. Live pricing/stock is NOT here — that lives in the Boutik
  platform and is a later integration.

## 2026-09-23 · XPRESS SESSION: staff role + customer/employee split (xpress schema only)
- DB migration `xpress_staff_role_and_catalog_trim` (checked `list_migrations` + this
  file first; public/archive untouched):
  · `xpress.profiles.role` check now ('customer','staff','admin'); NEW `xpress.is_staff()`
  · `xpress.handle_new_user()` auto-staffs @fluidsealab.com / @sealsonline.com signups
    (mirrors Marion's own auto-staff; Marion's trigger/functions untouched) + backfill
  · catalog data: metal CNC materials deactivated (not offered) except Brass C360
- xpress-machining app: full price matrix at /tools/machining-prices is now employee-only
  (login + staff/admin gate, price data server-side only); customers get a
  "Standard sizes" lookup on /quote — searchable dims → single price via new
  /api/list-price reading `xpress.machining_prices`. Site now at xpress.fluidsealab.com
  (Azure DNS CNAME + Vercel domain added 2026-09-23).

## 2026-09-23 · XPRESS SESSION: xpress.machining_prices — 2027 machining list price table
- Logged by the Xpress session per protocol (`list_migrations` + this file checked first;
  no conflicts — table name and schema are Xpress-only, public/archive untouched).
- DB migration `xpress_machining_prices_2027`: new table `xpress.machining_prices`
  (price_year, product, od_in, size_mm, height_in, style, price, CAD) loaded with the
  full 2027 machining list — 1,490 rows: Teflon 378, Nylon 462, DYNA-MAX 504,
  Urethane 120 + 8 trim charges, DU cut-down 18. RLS: read for all (list prices are
  public), write via xpress.is_admin(). Exposed through the Data API (xpress schema).
- Source of truth: "2027 Machine price.xlsx" = 2025 list, Nylon 0.375" column fixed,
  Nylon 0.375"/0.5" reworked for ODs ≥ 7.5" (interpolated between 0.25" and 0.75"),
  then +6% across all tabs. Same data drives the inside-sales tool at
  xpress-machining.vercel.app/tools/machining-prices (repo: src/app/tools/machining-prices/data.ts).
- Any project on this Supabase can read it, e.g.
  `select price from xpress.machining_prices where product='Nylon' and od_in=7.5 and height_in=0.5;`
- Noted in passing: migrations `create_lifeos_items` (2026-08-28) and the July 15–Aug 17
  product/pricing/inventory work aren't logged here — flagging for whichever session owns them.

## 2026-07-16 · FluidSeal brand theme on quote.html (build 2026-07-16.7)
- quote.html re-skinned per the canonical FLUIDSEAL-THEME.md (OneDrive ClaudeAgent folder):
  §2 brand token block (#231F20 / #FFDD00 / greys, legacy var aliases kept), Helvetica Neue
  body + Arial Narrow condensed H1, Google Fonts link removed, JetBrains Mono → Consolas.
- Header: brand black with 3px yellow rule; Marion dot mark on a white pill (Marion keeps its
  own identity per theme §7); yellow PHASE badge + yellow auth CTA (black text, 800).
- Panels/stepper get a 3px yellow top rule; cart header bar brand black; functional red now
  #c8222a; greens/greys mapped to brand tokens.
- NOT touched: the sealsonline-format quote card (cardHTML — matches email/PDF/staff copies)
  and the kit-blue drag/type accents (functional). account.html / quotes.html / index.html
  unchanged — same treatment available on request.
- FLUIDSEAL-THEME.md §7/§8 updated.

## 2026-07-16 · Description header aligned with line text (build 2026-07-16.6)
- Quote-card line-items table: the Description column header now starts where the
  text starts (62px left pad) instead of sitting over the 44px product thumbnail.
  Applied conditionally — quotes with no images keep the normal 8px pad.
- Same change in all three renderers: quote.html cardHTML (build 2026-07-16.6),
  account.html cardHTML, marion-notify cardHtml (v9 deployed).
- Both pushed files hash-verified against local (git hash-object == pushed blob SHA).

## 2026-07-16 · Catalog product image inline on every quote-card line (build 2026-07-16.5)
- The quote/estimate card now shows a 44px catalog product thumbnail beside each line's
  description — in all four renderings of the form: quote.html step-3 preview, the
  html2pdf PDF attachment, account.html quote detail, and the marion-notify email body.
- DB migration `quote_card_line_images`: new `series_images` cache table (series →
  image_url + 88px JPEG data-URL thumb, RLS authenticated read/write), new
  `quote_lines.img_url` + `quote_lines.thumb` columns, new `images_for_parts(text[])`
  RPC — maps part numbers to their product_links series; kits not on sealsonline fall
  back to their first BOM component's series (e.g. RCAT-1920739 → rod-wipers/j-dl).
- New edge function `marion-images` (v1): fetches a sealsonline series page server-side,
  extracts og:image, returns the image base64 (sealsonline/cms hosts only, 4MB cap) and
  caches image_url in series_images. Client downscales to an 88px thumb and writes it
  back, so each series is fetched from the website exactly once.
- quote.html: `fillImages()` in the cart pipeline (scheduleBomCheck), thumbs persist on
  save (quote_lines.thumb/img_url) and reload on open (older quotes backfill on open);
  editing a line's PN re-resolves its image. Build stamp 2026-07-16.5.
- marion-notify (v7): email line rows show the image via the remote CMS img_url
  (data: URIs are blocked by email clients; https-only guard).
- Emails/PDF note: the on-screen card + PDF use the data-URL thumb (no CORS taint);
  only the email uses the remote URL.
- INCIDENT (recovered same session): the first push of quote.html was truncated to
  2.7KB, briefly breaking the live page; restored minutes later. Pushed blobs are now
  hash-verified against local (`git hash-object`) — keep doing that on every push.

## 2026-07-14 · XPRESS SESSION: xpress-schema repair + app repointed (public/archive untouched)
- Logged by the Xpress session per the shared-DB protocol. Rules in
  xpress-machining/CLAUDE.md read and followed; `list_migrations` checked first.
- DB migration `xpress_schema_repair_helpers` (xpress schema + Xpress-owned
  objects only):
  · grants: anon/authenticated/service_role usage on schema `xpress` + table DML
  · `xpress.is_admin()` created (old `public.is_admin` was OID-bound into
    Xpress RLS policies and errored — it reads Marion's profiles, no `role` col)
  · all 15 Xpress RLS policies dropped/recreated bound to `xpress.is_admin()`
  · `xpress.log_order_status()` created; trigger on `xpress.orders` rewired
    (old function wrote to public.order_events, which no longer exists)
  · `xpress.handle_new_user()` fixed to insert into `xpress.profiles`; NEW
    second trigger `on_auth_user_created_xpress` wired on auth.users —
    Marion's `on_auth_user_created` untouched. NOTE: both triggers now fire on
    every signup; each app gets its own profile row for any new user.
  · Xpress's own storage policies `cad_read_own` / `cad_delete_own` repointed
    to `xpress.is_admin()` (cad-files bucket only)
- DB migration `xpress_is_admin_anon_execute`: anon EXECUTE on
  `xpress.is_admin()` so RLS denies cleanly instead of erroring 42501.
- Dashboard: `xpress` added to Data API exposed schemas
  (public/graphql_public settings unchanged).
- Known Xpress leftovers still in `public` (deliberately NOT touched per rule
  1): `public.is_admin()`, `public.log_order_status()`, sequences
  `public.quote_number_seq` / `public.order_number_seq` (xpress table defaults
  are OID-bound to them and work). Clean up when Xpress gets its own project.
- xpress-machining repo: all Supabase clients now use
  `{ db: { schema: 'xpress' } }`; CLAUDE.md kept; `supabase/migrations/`
  marked do-not-reapply against this project.
- From the Xpress session: apologies for the 2026-07-14 collision. CHANGELOG +
  `list_migrations` checks are now part of this session's pre-DDL protocol too.

## 2026-07-14 · My Quotes: Contact + Total Value columns
- quote.html (build 2026-07-14.5): My Quotes table adds Contact and Total
  Value columns — total sums quote_lines.line_total; unpriced quotes show
  "pending pricing"

## 2026-07-14 · Restore clobbered dfd15063: submit beside nav, My Quotes lock, email-card preview
- INCIDENT (repo side this time): commit dfd15063 ("Quote step: on-screen
  preview = same card as the submit email; Submit moved beside wizard nav;
  Next: My Quotes locked until submitted") landed 9 minutes before the kit
  commit 25238df, whose freshness check ran before dfd15063 was pushed —
  so 25238df silently reverted it. Same lesson as the wizard clobber:
  re-check blob SHAs at PUSH time, every time.
- Re-applied on top of kits/Multi Add/drag-out (build 2026-07-14.4):
  · Submit to Fluidseal removed from Cart + Quote toolbars; lives beside
    the wizard Next button on step 3
  · Next: My Quotes locked until submit succeeds ("Submit to Fluidseal
    first"); ✓ Submitted state; any cart change re-arms Submit
  · Step 3 preview auto-renders on entry (no Generate button) and is the
    EXACT email card (cardHTML) Fluidseal receives — status pill shows
    PREVIEW / draft / quote # after submit
  · cardHTML: Type + Required shown in DOCUMENT REFERENCES
  · Kit lines on the card: "KIT:" prefix on parents, ↳ on components

## 2026-07-14 · Open-quote preview fix + build stamp
- quote.html: opening a saved quote (My Quotes → "open" or the status badge)
  now renders the estimate before jumping to step 3 — previously it landed on
  an empty "Generate a quote once the cart is reviewed" panel (gap in the
  5e5a4bb change, which navigated to step 3 without calling buildQuote)
- Build stamp added: hover the PHASE 3 badge or check the browser console
  ("Marion quote.html build 2026-07-14.3"). If updates seem missing after a
  push, hard-refresh (Ctrl+F5) — GitHub Pages caches for ~10 minutes
- End-to-end test with a real customer .msg (PO 99491, 2× 375 O-rings +
  2× 375 back-ups): cart, Type/kit drag, Multi Add, estimate all verified in
  a live browser

## 2026-07-14 · Kit drag-OUT + DB restore after cross-session collision
- quote.html: a kit component can now be dragged OUT of its kit — drop it
  anywhere in the cart panel off the table rows (panel shows a dashed blue
  outline + "Drop here to remove from kit"). The ⤴ button still works too.
- **INCIDENT:** a parallel session built a different app ("Xpress" — CNC
  quoting: parts/processes/materials/orders) in this same Supabase project and
  its migration `archive_legacy_tables` moved ALL Marion + survey tables to an
  `archive` schema (breaking live quote save/load, My Quotes, profiles signup
  trigger). Fixed by migration `restore_marion_move_xpress_to_own_schema`:
  Marion's 11 tables restored to `public` (data intact, quotes 100001–100014,
  RLS policies intact), Xpress's 12 tables moved to an `xpress` schema
  (nothing deleted), Marion's `handle_new_user` trigger recreated.
- **If you are the Xpress session reading this:** your tables now live in the
  `xpress` schema (your `handle_new_user` is parked there too, trigger
  unwired). Please use a separate Supabase project — this one backs the live
  marion.fluidsealab.com site.
- LESSON: one Supabase project per app. Check CHANGELOG + `list_migrations`
  before running DDL.
- Also logging here (unlogged commit 5e5a4bb from a parallel session): My
  Quotes — clicking the status badge or "open" now jumps straight to the
  Quote/Estimate view (openQuote → goStep(3)). Preserved in this commit.

## 2026-07-13 · Cart Multi Add + drag-and-drop kits
- quote.html: HOLD "+ Add line" (~0.5s) opens Multi Add — type or paste a
  parts list, one part per line, optional qty after a comma or tab
  (`2A95D29A74V90 16ORB-V, 4`); dropdown picks Customer/OEM part #s (conf low)
  vs Fluidseal part #s (conf high). Normal click still adds a single line.
- quote.html: new Type column (Item/Kit — mirrors ERP Type) with a light-blue
  ⋮⋮ drag handle. Drag a line onto another line to nest it into a kit; the
  target becomes the Kit parent, components render indented below it. ⤴ on a
  component removes it from the kit. Kits can't nest inside kits; deleting a
  parent or removing the last component dissolves the kit automatically.
- Kit structure persists across save/open and renders on the estimate
  (KIT badge on parents, ↳ on components).
- DB migration `quote_lines_kit_support`: `quote_lines.line_type`
  ('item'|'kit', default item) + `quote_lines.kit_group` (int, null =
  standalone).
- TODO (next): David to provide a Product table + Bill of Materials table so
  the cart can Resolve part numbers for price & availability (kits explode via
  BOM). See NEXT-SESSION-HANDOFF.md.

## 2026-07-13 · .msg analyze fix
- Signature images (image001.jpg pattern, <150KB) skipped from .msg staging
- AI response parsing made tolerant; max_tokens 3900; failures now logged
  with stop_reason to the browser console

## 2026-07-13 · Wizard merge + required-by + quote/order type
- quote.html: re-merged the guided wizard layout (cf134bb, was accidentally
  overwritten by 1c1ac77) with the intent banner + 2FA overlay
- Cart step: Save draft / Submit to Fluidseal buttons restored
- New fields end-to-end: Required Date/Time and Request Type (quote|order) —
  AI-extracted, editable in both steps, saved to quotes.required_by /
  quotes.req_type (migration applied), shown on the estimate
- LESSON: check file freshness at PUSH time, not edit time — a wizard commit
  landed mid-session and was clobbered

## 2026-07-13 · 2FA site-wide, intent banner, changelog (this commit)
- quote.html / quotes.html / index.html: 2FA step-up overlay — accounts with an
  enrolled authenticator must enter the 6-digit code on every Marion page, not
  just account.html (UI-level enforcement; RLS-level aal2 enforcement is a
  possible future hardening)
- quote.html: intent results now render in a large colored banner (red for
  suspicious, amber for company notices) instead of the small status line
- CHANGELOG.md added (this file)

## 2026-07-13 · Account settings panels (separate session)
- account.html: Security panel (password change + TOTP 2FA enroll/remove +
  step-up gate), Addresses panel (shipping CRUD + default), Billing panel
- DB: `addresses` table (RLS: own + staff), `profiles.invoice_email`,
  `profiles.payment_pref`

## 2026-07-13 · Confidence grading fix
- quote.html: conf rates the Fluidseal cross-reference only; hard client-side
  validation clears echoed customer part numbers and forces empty-pn lines to low
- ai_rules: enforcement rule added (id 10)

## 2026-07-13 · Intent classification, phishing protocol, editable AI rules
- quote.html: Analyze classifies intent (quote_request / info_update /
  not_a_request / suspicious) before staging; prompt-injection hardening
- quotes.html: "Marion Extraction Rules" staff editor panel
- DB: `ai_rules` table, seeded with 9 rules

## 2026-07-13 · Deterministic extraction + Reference field
- marion-chat: temperature parameter (default 0)
- quote.html: consistency rules; per-line Reference field (cart/estimate/
  staff desk/account/email)
- DB: `quote_lines.reference`

## 2026-07-13 · Submit notifications + My Account + impersonation
- marion-notify edge function: order-card email + PDF to
  d.anderson@fluidsealab.com (recipient locked; 2 approvals to change)
- account.html: quotes list + order-card detail; staff impersonation
  (by account name or customer login)
- quote.html: My Account link; client-side PDF via html2pdf
- DB: `quotes.quote_no` (sequential #100001+), `quotes.email`, `quotes.address`

## 2026-07-13 · Quote intake attachments
- quote.html: 700px paste box; Excel (.xlsx/.xls via SheetJS), PDF (document
  blocks to AI), Outlook .msg (msgreader; embedded attachments auto-staged)

## 2026-07-13 · index.html on secure proxy
- index.html: paste-a-key removed; Marion's Brain = magic-link sign-in +
  marion-chat proxy

## 2026-07-13 · Phase 3 launch
- Supabase auth (magic link via Gmail SMTP), quotes/quote_lines schema, RLS
  hardening on catalog tables, marion-chat proxy (ANTHROPIC_API_KEY secret),
  quote save/submit, staff quote desk (quotes.html), profiles with
  @fluidsealab.com auto-staff
