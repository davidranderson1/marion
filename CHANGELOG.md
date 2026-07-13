# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

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
