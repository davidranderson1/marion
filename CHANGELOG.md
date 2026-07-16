# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

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
