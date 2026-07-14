# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

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
