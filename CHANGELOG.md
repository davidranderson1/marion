# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

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
