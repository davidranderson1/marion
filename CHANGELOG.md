# Marion — Changelog

**Protocol for AI sessions (and humans):** before editing any file, check its latest
commit on GitHub against your local copy (`list_commits` with the file path, or compare
blob SHAs). After every push, append an entry here — newest first — in the same commit.
This file is the quick cross-session freshness check.

Format: `## YYYY-MM-DD · short title` then bullet points of what changed and any
DB migrations / edge-function deploys that went with it.

---

## 2026-10-03 · SSG Website — one admin for every app, step 2: `flabed.admin_set_app_access` and the `admin_set_access` contract (schemas `flabed` and `flabed_private` only; nothing in `public`, `archive`, `xpress`, `hr`, `ap`, `svc`, `exp` or `ar` touched)
- **Why**: David, project "FLAB - SSG Website / Updates", board item 88: "88 - go ahead" (Q110 of 2026-10-02: one admin for every app, phased, MFA later).
- **Migration** `flabed_admin_app_access_v1` (applied 2026-10-03): NEW tables `flabed_private.admin_apps` (6 apps, their roles and owner projects) and `flabed_private.app_access_log` (no grants; `flabed_private` is not usable by anon / authenticated); NEW functions (SECURITY DEFINER, `flabed.is_admin()` gate, execute revoked from PUBLIC and anon, granted to authenticated and service_role): `flabed.admin_set_app_access(app, email, role, active)` (the console's one door — fixed app list, refuses the caller's own access, calls `<schema>.admin_set_access` when it exists, else answers `not_connected`; logs every change), `flabed.admin_set_access(email, role, active)` (the website's implementation, wraps `admin_decide_access`), `flabed.admin_access_apps()`, `flabed.admin_access_changes(limit)`. `flabed_admin_app_access_v1b`: newest-first order of the change list made deterministic.
- **Tested** in a rolled-back DO block: admin ok; non-admin "admin only"; anon permission denied; own address, unknown app and wrong role refused; Xpress `not_connected`; Website grant and revoke logged; nothing persisted (log 0 rows, no staff_access row).
- **Other apps**: each owning chat adds `<schema>.admin_set_access(text, text, boolean)` per the contract in hub infrastructure.md ("Added 2026-10-03 — One admin for every app, step 2"); asks in hub `handoffs/2026-10-03-admin-console-connect-your-app.md`.

## 2026-10-03 · Customer - Aged Receivables — `ar.links()` and the `links` view of `public.ar_query` (read-only links from the receivables dashboard to Dynamics accounts and invoices; `public.customer_code`, `public.accounts` and `public.invoices` are only READ; no table, `archive` or other schema touched)
- **Why**: David, project "FLAB - Customer - Aged Receivables": "Add any helpful filters and links to the dashboard" (dashboard build 2026-10-03.4).
- **Migration** `ar_links_v1` (applied 2026-10-03): NEW `ar.links()` (SQL, STABLE, SECURITY DEFINER, search_path ar, public) returns `{accounts: {P21 code → account id, name, email, phone, others}, invoices: {P21 invoice → Dynamics invoice id}, dynamics: base URL}` for the customers on the latest reports. Account match: `public.customer_code.name` = P21 code, joined to active `public.accounts` on `raw->>'_new_newcustomercodep21_value'`; when a code has several active accounts the one with the most invoices wins. Invoice match: `public.invoices` on `p21_order_no` = invoice base and `ship_number` = suffix. REPLACED `public.ar_query(text, jsonb)` with the identical body plus `elsif p_view = 'links'` (still gated by `ar.is_viewer()`; authenticated only, anon cannot execute).
- **Result on the 2 October baseline**: 93 of 96 customer codes matched (6UNAPP, 6INTER, 7ALTEC have no account; 12 codes have more than one active account); 935 of 1,092 open items matched to a Dynamics invoice; payload 67 KB.

## 2026-10-03 · Customer - Aged Receivables — schema `ar` and bucket `ar-docs` for receivables.fluidsealab.com (schema `ar`, bucket `ar-docs` and the gated `public.ar_*` functions only — the ap / exp pattern; no existing `public`, `archive`, `xpress`, `flabed`, `hr`, `ap`, `svc` or `exp` object touched; `dynamics-sync` not redeployed)
- **Why**: David, project "FLAB - Customer - Aged Receivables" (board https://claude.ai/artifact/9m9BSyyNKn9n8d7qP58aEQ items 12 and 24) — Cindy uploads the weekly P21 Aged Receivables report to a dashboard that finds missing payments.
- **Migrations** (17, applied 2026-10-03 18:12–18:29 UTC): ar_schema_v1, ar_flags_v1a_money, ar_probe_regex, ar_flags_v1c_basic, ar_flags_v1d_double, ar_flags_v1e_case, ar_flags_v1f_compare, ar_flags_v1h_unique, ar_flags_v1i_idempotent, ar_flags_v1j_case_idempotent, ar_flags_v1k_build_plpgsql, ar_ingest_v1a_check, ar_ingest_v1b_load, ar_ingest_v1c_ingest, ar_public_rpc_v1a_whoami_mutate, ar_public_rpc_v1b_query, ar_storage_v1.
- **Tables** (`ar`, default-deny RLS, not on the Data API): `portal_access` (David ×2 admin, Cindy), `setting`, `upload`, `snapshot` (unique group + print time), `customer_balance`, `open_item`, `flag` (unique snapshot + kind + customer + invoice), `case_link`, `event`. Amounts in cents.
- **Functions**: `ar.ingest`, `ar.check_payload`, `ar.load_rows`, `ar.build_flags` (+ `flags_basic` / `flags_double` / `flags_case` / `flags_compare`), `ar.latest_snapshots`, `ar.is_viewer` / `is_admin` / `me_name` / `setting_val` / `money` / `has_digit`; NEW in `public` (gated, SECURITY DEFINER, authenticated only): `public.ar_whoami()`, `public.ar_query(text, jsonb)`, `public.ar_mutate(text, jsonb)`.
- **Storage**: private bucket `ar-docs` (PDF only, 32 MB) with policies `ar_docs_viewer_read` / `ar_docs_viewer_upload` on `storage.objects`.
- **No deletes by design**: history is kept; a second upload of the same print is rejected instead of replaced.

## 2026-10-03 · SSG Website / Updates — AI Gateway: `marion-chat` v18 = service version 23, `site-search-assist` v4 = version 7 (edge functions and one secret only; no table, `public` or `archive` change)
- **Why**: David — Q65 "yes" (2026-10-02), Q113 "yes" and Q114 "on" (2026-10-03; SSG board item 92): every Claude call through the Cloudflare AI Gateway `fluidseal` (Cloudflare account "D.anderson@fluidsealab.com's Account"; logs on, cache / rate limit / retries off, Authenticated Gateway on).
- **Step 1 — v17 / v3, deployed shortly before 18:30 UTC**: `marion-chat` v17 = service version 19 and `site-search-assist` v3. The live versions 18 and 2 were read back with `get_edge_function` right before (byte-identical to the project copies) and the deployed code was read back byte-identical to the local build. Website path, staff path and the search fallback call `https://gateway.ai.cloudflare.com/v1/8b70eb9093912b7d67749861176cf812/fluidseal/anthropic` first, with `cf-aig-metadata` {fn, path} and, when the secret `CF_AIG_TOKEN` is set, `cf-aig-authorization`. The direct endpoint is the fallback when the gateway is unreachable or answers an error without Anthropic's `request-id` header; an Anthropic error that came through the gateway is passed on, never sent twice. `AI_GATEWAY_URL` overrides the gateway address (`off` = direct only, no redeploy). Prompts, payloads and answers unchanged, so no held-out score was needed. Local tests 22 / 22; live 18:30–18:32 UTC, before the token: website JSON, stream and search fallback 200, function logs "AI Gateway answered 401; using the direct endpoint" for each call.
- **Step 2 — the token, and v18 / v4 deployed about 19:04 UTC**: David created the gateway token and saved it as the Supabase secret `CF_AIG_TOKEN`. The first save held the token together with the test command Cloudflare shows beside it; Deno refused that header value and the fallback warning printed the error text, which contains the value, into the function logs. David created a second token and saved only the token. v18 / v4 send the token only when it is one plain word (letters, digits, dot, underscore, hyphen), warn "CF_AIG_TOKEN is not a plain token" otherwise, and log only the error's name, never its message. Code read back byte-identical after deploy; local tests 26 / 26. Service versions 20–22 in between carry no code change (saving secrets appears to add a function version).
- **Proof**: live 2026-10-03 19:07 UTC from the chat page: website stream 200 (start event v18; finished in 16.5 s), website JSON 200, search fallback 200 with a reading; no "AI Gateway" or "CF_AIG_TOKEN" warning in the function logs after 19:06:30 UTC; the gateway's Logs page shows 7 successful Anthropic requests at 13:07 MDT (Sonnet 4.6 and Haiku 4.5, user agent Deno, from Supabase).
- **Open**: the first token (in the function logs) is to be deleted on the Cloudflare API tokens page (SSG board item 92, Q118).
- **Records**: SSG project docs `claude/website-chat/marion-chat-v18.ts`, `claude/website-search/site-search-assist-v4.ts`, `claude/generators/patch_marion18.py`, `claude/generators/test_marion18.py` (and the v17 / v3 step: `marion-chat-v17.ts`, `site-search-assist-v3.ts`, `patch_marion17.py`, `test_marion17.py`, `gw.py`).
- **Update 2026-10-03, 1:40 PM MT**: the "Open" line above is closed — David deleted the first token (Q118); the Cloudflare account lists one AI Gateway token. Live check 19:38 UTC: website stream 200 (start event v18), website JSON 200, search fallback 200 with a reading; the gateway's Logs page shows the 6 calls (Sonnet 4.6 and Haiku 4.5); no "AI Gateway" or "CF_AIG_TOKEN" warning in the function logs.

## 2026-10-02 · Dynamics 365 / Sharepoint — expenses funnel: Dropbox app with PKCE (no app secret), exp-intake v3, exp-build v4, email-receipt filing switch (schema `exp` only; nothing in `public` changed)
- **Why**: David on Dynamics board items 417–422 — "you do everything approved". Record: Dynamics project doc claude/expenses-stack-review-2026-10-02.md section 16.
- **Migrations**: `exp_intake_v1c_dropbox_pkce` (`exp.intake_aux` gains `dropbox_state_new`, `pkce_set`, `pkce_get` — patched through `pg_get_functiondef` + replace), `exp_dropbox_app_key` (`exp.setting` dropbox_app_key = the app's public client id), `exp_intake_v1d_filing_switch` (`exp.setting` dropbox_file_receipts = false; `file_queue` returns rows only when it is true) and two `file_done` calls marking the October receipts the old task already filed.
- **Edge functions**: `exp-intake` v3 and `exp-build` v4 — Dropbox OAuth as a PKCE public client (code_verifier kept beside the one-time state in `exp.setting`, refresh with the client id only); the refresh token is in Vault `exp_dropbox_refresh` (created by the callback, 2026-10-03 01:16 UTC, account d.anderson@sealsonline.com). Health now reports dropbox_enabled.
- **Proof**: the 01:20 UTC run refreshed the token and listed "0 - Receipts Inbox" with no error.

## 2026-10-02 · SSG Website — admin console at admin.fluidsealab.com; read-only all-apps view (schema `flabed` only; `xpress`, `hr`, `ap`, `svc`, `exp`, `public` read only; no change in `public` or `archive`)
- **Why**: David on SSG board item 86 — Q109 "admin.fluidsealab.com - now", Q110 "yes, phased with (MFA later)".
- **Migration `flabed_admin_all_apps_v1`**: `flabed.admin_login_apps(email, uid)` also reads `svc.access` and `exp.portal_access` (each in its own exception block, read only); new `flabed.admin_app_matrix()` (SECURITY DEFINER, `flabed.is_admin()` gate, execute for authenticated / service_role) — every person on any Fluidseal app's access list or sign-in list with the role per app. Tested as David (12 people), as a non-admin (42501 admin only) and as anon (permission denied).
- **Edge function `staff-access` v2**: origins and return hosts add `admin.fluidsealab.com`; an employee's sign-in link now returns to `https://mockup.fluidsealab.com/signin.html`; the approval email button falls back to `https://admin.fluidsealab.com/` (setting `flabed.chat_settings.staff_access_admin_url`).
- **Sites**: new repo `davidranderson1/fluidseal-admin` (console), mockup `signin.html` (website sign-in, blob `e9a43806`). Supabase Auth redirect URL `https://admin.fluidsealab.com/**` added in David's Chrome; Azure DNS CNAME `admin` → `davidranderson1.github.io`.

## 2026-10-02 · Dynamics 365 / Sharepoint — expenses funnel phases 4, 5 and 3: expenses.fluidsealab.com, the GitHub Actions builder, the Build email, `exp-intake` (schema `exp`, bucket `exp-docs` and the gated `public.exp_*` functions only — the ap / hr / svc pattern; no existing `public`, `archive`, `xpress`, `flabed`, `hr`, `ap` or `svc` object touched)
- **Why**: David on Dynamics board item 393 — "Build everything else now receipts and scans at the end". Record: Dynamics project doc claude/expenses-stack-review-2026-10-02.md section 14.
- **Migrations** `exp_portal_v1_core` (exp.is_viewer / is_admin, month report and KM columns, `exp.holiday` with 22 Alberta holidays Nov 2025 – Nov 2027, `exp.km_history`, job columns, `exp.report_name`, `exp.report_spec`, `exp.call_fn`, `exp.reopen_if_approved`, `exp.month_total`; usage on schema `exp` for authenticated, no table grants, RLS default-deny), `exp_portal_v1_rpc_whoami`, `exp_portal_v1_rpc_query`, `exp_portal_v1_rpc_mutate`, `exp_portal_v1_internal`, `exp_portal_v1b_hide_removed`, `exp_portal_v1c_cells_digest`, `exp_intake_v1` (`exp.intake_seen`, `exp.intake_rule` with 15 rules, receipt columns ws_id / dup_of / state / filed_name / note, `exp.run_match` v2), `exp_intake_v1_fn`, `exp_intake_v1b_aux` (`exp.scan_seen`, `exp.intake_aux`), `exp_portal_v1d_receipts_dropbox`, `exp_portal_v1e_dropbox_fields`.
- **New `public` functions (gated, SECURITY DEFINER)**: `public.exp_whoami()`, `public.exp_query(view, args)`, `public.exp_mutate(action, args)` — execute for authenticated, allowed only for active rows of `exp.portal_access`; `public.exp_internal(action, args)` and `public.exp_intake(action, args)` — service_role only. Removals are soft (`exp.line.removed_at`).
- **Storage**: private bucket `exp-docs` (32 MB per file) with policies `exp_docs_viewer_read` (select) and `exp_docs_viewer_upload` (insert under card/ and uploads/) on storage.objects for allow-listed users.
- **Edge functions** (verify_jwt off): `exp-build` v3 (x-inbound-token = ws_config.inbound_token for dispatch / approve / health; a GitHub OIDC token — repository davidranderson1/fluidseal-expenses, ref main, workflow build.yml — for claim / done / fail; Dropbox filing once connected), `exp-mail` v1 (pending / mark for the Power Automate send flow), `exp-intake` v2 (run, upload, health, /dropbox-start, /dropbox-callback; Claude Haiku 4.5 through ANTHROPIC_API_KEY). The Dropbox refresh token will live in Vault as `exp_dropbox_refresh` (created by Connect Dropbox).
- **pg_cron job 34 `exp-intake`** `*/5 * * * *` → `exp.call_fn('exp-intake', …)` (pg_net; reads the inbound token from `public.ws_config`, read only).
- **`public.ws_inbox`**: `exp-intake` reads rows with to_addr = 'expenses-intake' only; it writes nothing there while `exp.setting` intake_owns_inbox is false (today). At phase 6 (David's go) it will set status and clear body_html / attachments of the skipped expenses-intake rows only.
- **Proofs**: August and September rebuilt by GitHub Actions + LibreOffice equal their DRAFT files cell by cell (digests of 326 and 332 cells); exp_mutate flows tested in rolled-back transactions; the first intake runs: 928 rows skipped by rules, 2 receipts read and matched (Anthropic CAD 2,100; Instacart / Costco $200.57).

## 2026-10-03 · SSG Website / Updates — website Marion: piston-seal bore rule (Q111), `marion-chat` v16 = service version 18 (only `flabed` rows and the edge function touched; no `public` or `archive` change)
- **Why**: David — Q111 "yes" (SSG board item 87): Marion passed a piston-seal bore to `match_parts` as the ID, so "piston seal for a 4 inch bore" listed seals for a 4.5" bore. Found in the Q94 score.
- **Edge function `marion-chat` v16 = service version 18** (deployed 2026-10-03 00:30:54 UTC, sha256 `730c043f…`; v15 = service version 17 read back with `get_edge_function` right before the deploy, the deployed code read back byte-identical): a session whose key starts `claudetest-` may send `_eval_rules: [ids]` (up to 10 integers) to add those `flabed.chat_rules` rows to the website prompt for that request even while they are inactive (query `active.eq.true OR id IN (…)`, placed by `sort`); the streamed `start` event adds `eval_rules` (count used). Any other session: rules read exactly as before. Source: SSG project doc `claude/website-chat/marion-chat-v16.ts`; tests `claude/generators/test_marion16.py` (21 / 21).
- **Row `flabed.chat_rules` id 12** (category dimensions, sort 71), inserted inactive, scored, **activated 2026-10-03 00:45:24 UTC**: "Piston seals: the cylinder bore is the seal's outside diameter. When a customer gives a bore, pass it to match_parts as od (the piston groove diameter, if known, is the id). For a rod seal, buffer seal or wiper the rod diameter is the id." Off again: `update flabed.chat_rules set active = false where id = 12` (no redeploy).
- **Score** (26 held-out website questions — the 22 from Q94 plus 4 piston-bore questions — each once without and once with the rule, same deployment, vocabulary on): exact 20 → 26, wrong 6 → 0, unparseable 0 → 0; cost US$0.74 → US$0.78; mean time 13.3 s → 13.8 s; tool calls 50 / 0 failed → 51 / 0 failed. Rod-side questions kept the rod as the ID. Files: SSG project docs `claude/website-chat/q111-heldout.json`, `claude/website-chat/q111-results.md`, `claude/generators/grade_q111.py`.
- **Live check** after activation (no override): "piston seal for a 5 inch bore" → `start {v: v16, vocab: true, eval_rules: 0}`, `match_parts {od: 5, units: in, type: piston seal}` (`flabed.chat_messages` 258).
- **Housekeeping**: 53 `claudetest-q111-*` sessions (106 messages) kept for the record; their `ip_hash` set to null so they do not count against David's IP limit (60 a day). Month-to-date Marion spend US$3.62 of the US$100 cap.

## 2026-10-02 · HR - Agent — Territory Scorecard at hr.fluidsealab.com/territory.html: new `hr.territory_*` tables, gated `public.hr_territory_*` functions, edge function `hr-territory-nightly`, pg_cron job 33 (no `public` table, `archive`, `xpress`, `svc`, `ap` or `flabed` touched; the shared `dynamics-sync` NOT redeployed)
- **Why**: David — "We need a proper URL to sign into this dashboard … create that now" (the Outside Sales Scorecard, until now a claude.ai page). Child page of the HR portal; who sees which territories comes from the new Dynamics User column Territory Manager (`cl_territorymanager`).
- **Migration `hr_territory_scorecard`**: `hr.territory_snapshot` (page data, row `current`), `hr.territory_access` (email, territories int[], is_admin, active, source manual / seed / dynamics), `hr.territory_config` (`inbound_token` for pg_cron, later `people` and `tt`), `hr.territory_log` — RLS on, no policies, grants revoked from anon / authenticated. `hr.territory_me()` (no grants). Authenticated, gated by `auth.email()` in `hr.territory_access`: `public.hr_territory_whoami()`, `public.hr_territory_data()` (admin: everything; others: only their territories' accounts, quotes, Mining, cases, orders and Financial Lines, plus their own activity and time tracking), `public.hr_territory_refresh()` (admin only). Service role only: `public.hr_territory_token_ok`, `hr_territory_put` (snapshot + access rows; a seed / dynamics row missing from Dynamics is switched off, `manual` rows are never touched), `hr_territory_log`.
- **Migration `hr_territory_stages`**: `hr.territory_runs`, `hr.territory_stage` (RLS on, grants revoked); `hr.territory_fire(jsonb)` (pg_net POST to the function with the token, no grants); `hr.territory_run(dry)` replaced (same signature; starts a staged run, one at a time inside a 15-minute window). Service role only: `public.hr_territory_stage_put` (saves one dataset, fires the next stage), `hr_territory_stage_get`, `hr_territory_stage_done`.
- **Migration `hr_territory_people`**: `hr.territory_config` rows `people` (dashboards and territory buttons) and `tt`; `public.hr_territory_data()` replaced (same signature) to return them, so no names sit in the public `fluidseal-hr` repo.
- **Edge function `hr-territory-nightly` v5** (verify_jwt off; `x-inbound-token` checked through `hr_territory_token_ok`; Dataverse read only with the dynamics-sync app registration): a chain of small calls — users → accounts → Financial Lines → quotes → opportunities → orders → appointments → phone calls → emails → cases → time tracking (one call each), appointment-to-account matching in 700 ms chunks, then build → `hr_territory_put`. About 45 s a run, 2.6 MB snapshot. v1 / v2 (one call): WORKER_RESOURCE_LIMIT, "CPU Time exceeded"; v3 staged; v4 quote / case windows as in the Python kit; v5 time-tracking start / end read literally (time-zone independent columns).
- **pg_cron**: job 33 `hr-territory-nightly` `20 12 * * *` (6:20 AM MDT / 5:20 AM MST) → `select hr.territory_run(false)`.
- **Dynamics (not this database, approved by David in chat)**: production User column `cl_territorymanager` (multi-select, 14 options, value 121530000 + territory number) in unmanaged solution `CL_FluidsealTerritoryManager` (publisher Claude, prefix cl); filled for Chris 602, Roger 604 + 704, Eugene 703, Taylor 603 606 607 610 611 641 649 710 711 749; shown in the view "Enabled Users - Site Contains Data" after Sales Manager - P21.
- **Verified**: runs 4 and 5 ok (access rows now source `dynamics`); `hr_territory_whoami` / `hr_territory_data` checked with simulated sign-ins for David (admin, 5 dashboards), Chris (602 only, his own time tracking), Taylor (10 territories), Roger and an unlisted address (not allowed); headline numbers equal the claude.ai version 5.

## 2026-10-02 · SSG Website — `marion-chat` v15 (service version 17): the website Marion gets the staff vocabulary (`public.part_synonyms`, 8 lines) behind a switch, scored before and after (board item 78, Q94) — no DDL; `public` read only (service role reads `part_synonyms`); one row added to `flabed.chat_settings`; `archive` / `xpress` / `hr` / `ap` / `svc` untouched; staff path unchanged
- **Why**: David — Q94 "yes" (give the website Marion the vocabulary lines, measured before and after on a held-out set). Since v11 the website prompt read `part_synonyms` as anon, and its row-level security lets only signed-in users read it, so the website Marion had no vocabulary.
- **Read back first**: service version 16 = v14 code (sha256 `ddbf1243…`), unchanged since 19:06 UTC; deployed v15 as service version 17 at about 23:37 UTC; read back byte-identical (sha256 `69643196…`).
- **v15**: `buildWebsiteSystemPrompt` reads the vocabulary with a service-role client (read only, ordered by term) only when `flabed.chat_settings` key `website_vocabulary` is true; absent / false = exactly the v14 prompt. A session whose key starts `claudetest-` may send `_eval_vocab` true / false to override it for that request (harmless if anyone else sends it). The streamed `start` event carries `v: "v15"` and `vocab`. JSON payload, tools and the staff path unchanged. Local tests: `claude/generators/test_marion15.py` 25 / 25 (Deno, live v16 code as the reference: switch off = v16 prompt and payload byte for byte).
- **Score** (rules fixed before any run: SSG project doc `claude/website-chat/q94-heldout.json`; 22 questions — 12 real website questions + 10 using the vocabulary words; each once off and once on, same deployment, temperature 0; graded by `claude/generators/grade_q94.py`):

  | Grade | Off | On |
  |---|---|---|
  | exact | 19 | 20 |
  | wrong | 3 | 2 |
  | unparseable | 0 | 0 |
  | cost / mean time | US$0.662 / 14.2 s | US$0.663 / 14.0 s |

  Decision rule met (not worse) → `insert into flabed.chat_settings (key, value) values ('website_vocabulary', 'true')` at 23:54:39 UTC. Live check: an ordinary request streams `start {v: v15, vocab: true}`, then the answer and its links. To turn it off: set the value to false — no redeploy. Full results: SSG project doc `claude/website-chat/q94-results.md`.
- **Seen in the runs**: with the vocabulary Marion adds the description prefixes to her searches (`or.2-222`, `rp. 3 inch rod seal polypak`, `ps. 100mm piston seal`, `rw. 50`); one answer named `2-222/TF` "a direct match" after such a search (the rule did not catch it). In both runs Marion passes a piston-seal **bore** as `id` to `match_parts` (the bore is the OD), so "piston seal for a 4 inch bore" lists seals for a 4.5" bore — SSG board item 87, Q111 (a website rule line, with its own score).
- **Test sessions**: `claudetest-q94-*` (45 sessions, 90 messages) stay in `flabed.chat_messages`; their `ip_hash` was set to null so they do not count against David's IP limit.

## 2026-10-02 · HR - Agent — Departments and review-profile sync: new `hr` columns and tables, gated `public.hr_sync_*` functions, edge function `hr-review-sync`, pg_cron jobs 31 / 32 (no `public` table, `archive`, `xpress`, `svc` or `flabed` touched; the shared `dynamics-sync` NOT redeployed)
- **Why**: David — "q5 - go" (Departments into the HR sync), "Q6 - All their departments" (peer group on the review card), "Q7 - Monthly and use Sync button (show last sync time stamp)".
- **Migration `hr_departments_and_review_sync`**: `hr.employee` + `departments text[]`, `departments_synced_at`; `hr.review_profile` + `synced_at`; new `hr.sync_run` (run log) and `hr.sync_config` (`inbound_token` for pg_cron) — RLS on, no policies, no grants. `public.hr_sync_begin()` (an HR viewer starts a full sync; one at a time) and `public.hr_sync_status()` (viewer; last full sync, last run, running) — execute for authenticated. Service role only: `hr_sync_check_token`, `hr_sync_start`, `hr_sync_finish`, `hr_sync_profiles_internal`, `hr_sync_apply`. `public.hr_sync_run(kind, mode)` — pg_net POST to the function with the HR token, no grants. `hr_upsert_employees` (the `dynamics-sync` path) updates named columns only, so `hr.employee.departments` is written only by `hr-review-sync`.
- **Edge function `hr-review-sync` v4** (verify_jwt off; auth = the HR token header from pg_cron, or the signed-in user's JWT checked through `hr_sync_begin`; CORS hr.fluidsealab.com only): reads Dataverse with the dynamics-sync app registration (read only) — `new_employee` (cl_departments, review date) and, in mode full, `new_timetracking`, `new_nva`, `new_veryawesome`, `cr5da_notepad` (reason Training) and `systemuser` for the last 12 months; writes `hr.employee.departments` and only the Dynamics-derived parts of `hr.review_profile` (attendance, error log, Very Awesomes, training, window, departments, review date / kind / status line, next-review timeline entry, `synced`). The written assessment, insights, key numbers and curated notes are never touched. About 1 second a run. v1 → v4: v1 stopped on WORKER_RESOURCE_LIMIT (an Intl.DateTimeFormat built per date; one shared formatter since v2); v3 reads time-tracking start / end literally (time-zone independent columns); v4 wording fix.
- **pg_cron**: job 31 `hr-review-sync-nightly` `15 9 * * *` (3:15 AM MDT) → `public.hr_sync_run('nightly','roster')`; job 32 `hr-review-sync-monthly` `30 12 1 * *` (6:30 AM MDT on the 1st) → `public.hr_sync_run('monthly','full')`.
- **Data**: backup table `hr.review_profile_backup_20261002` (28 rows taken before the first sync; RLS on, no grants) — drop after the November monthly run checks out. Sync runs 1–6 on 2026-10-02 (run 2 = the v1 resource error). Check: the synced attendance, error log, Very Awesomes and training equal the Claude build for all 24 version-2 profiles (only same-day row order differs).
- **Dynamics (production, David "q2 - set")**: `ab_employeereview` set on 20 `new_employee` records to the next work anniversary, 8:00 AM (20 Record Updated notes → 20 Employee notes emails, item 388).

## 2026-10-02 · SSG Website — admin page lists Fluidseal logins under Employee access (schema `flabed` only; `public`, `archive`, `xpress`, `hr`, `ap`, `svc`, `exp` not changed — `xpress`, `hr`, `ap`, `public` read only)
- **Why**: David signed in to the website admin page (5:27 pm MT) and asked "why are these employees under customers?" — every Fluidseal app shares one `auth.users` list, and `flabed.admin_customer_logins()` listed every login without website access as a customer (6 @sealsonline.com Xpress staff logins plus David's own test address).
- **Migration `flabed_admin_lists_employees_apart`**: `flabed.is_employee_address(email)` (immutable; @sealsonline.com / @fluidsealab.com); `flabed.admin_login_apps(email, uid)` (SECURITY DEFINER, execute for service_role only — reads `xpress.profiles.role`, `hr.portal_access.role`, `ap.portal_access.role` and `public.profiles.is_staff`, each in its own exception block, read only); `flabed.admin_access_list()` also returns employee-address logins with no `staff_access` row as status `none` (with `on_employee_list` and `apps`); `flabed.admin_customer_logins()` excludes employee addresses and returns `apps`. Both still gated by `flabed.is_admin()`.
- **Front end**: mockup `admin.html` blob `4084eedf` ("no website access" chip with Approve, "Also uses: …" line, a note when the address is not on the Dynamics Employee list); Playwright tests 29 / 29.
- **Checked as David**: Employee access 2 approved + 6 `none` (one, c.cervas@, not on the Dynamics Employee list under that address); Customer logins 1 (David's davidanderson1.com test login, Xpress customer, no code). No access granted or changed.

## 2026-10-02 · Dynamics 365 / Sharepoint — expenses funnel phase 2: card 9616 import from the Simplifi CSV (schema `exp` only; nothing in `public` touched)
- **Why**: David chose the Simplifi CSV as the card feed ("simplifi csv. it can have all my card data thats ok") and attached his first export.
- **Migration `exp_card_import_v1`**: `exp.import_card_rows(jsonb rows, filename, source)` (service_role only, advisory lock) — skips payments / excluded rows, rows before `exp.setting` card_import_from (2026-08-01) and rows of another account; matches an existing line by `card_key` (date|amount|payee|n) or by the same amount within 5 days (card lines first, then an email-only receipt line, which becomes a claimed card line); keeps existing categories and reports Simplifi differences; inserts new lines with the Simplifi report-line category, else `exp.category_for`, else needs_category; reports card lines the file did not contain; runs `exp.run_match`; logs `exp.card_import` + `exp.event`. Helpers `exp.month_ensure(date)` (fiscal-year folder path) and `exp.slug(text)`. Setting `card_import_from`.
- **First import 2026-10-02 5:21 PM MT**: 63 rows (Jul 20 – Oct 2): 46 card rows, 44 existing lines keyed, 2 new (Big Sky BBQ $48.04, Costco $9.09, Oct 2), the Anthropic $2,100 receipt line merged into its card line, 2 payments and 15 pre-August rows skipped, 0 card lines missing from the file. A re-import changed nothing (idempotent). August $3,678.64 and September $16,727.03 unchanged; October now $4,971.47.

## 2026-10-02 · Dynamics 365 / Sharepoint — expenses funnel phase 1: new schema `exp` (schema `exp` only; no `public`, `archive`, `xpress`, `flabed`, `hr`, `ap` or `svc` object touched; no edge function deployed)
- **Why**: David (board item 393, "recommended stack is good") — the expenses funnel moves off the Claude scheduled task + Chrome + artifact database onto the payables pattern. Review and plan: Dynamics project doc claude/expenses-stack-review-2026-10-02.md.
- **Migration `exp_schema_v1`**: schema `exp` (usage for service_role only) with `category` (report lines, G/L, EXPENSE-sheet cell), `portal_access`, `month`, `receipt`, `line` (card 9616 / email / scan / fixed / manual lines; `category_override`, `amount_override`, `scan_status` are David's edits), `payee_rule`, `card_import`, `job`, `setting`, `event`. RLS on, no policies, all grants revoked from public / anon / authenticated. Trigger `exp.line_guard` keeps David's override fields (and whole manual lines) unless the session sets `exp.actor = 'user'`. Views `exp.v_line` (effective amount / category) and `exp.v_report` (claimed totals per report line), security_invoker. Functions `exp.category_for(text)` and `exp.run_match(text)` (same amount to the cent within 5 days; US-dollar receipts same vendor within 5 days and 5 percent at `exp.setting` fx_usd_cad; advisory lock), service_role only.
- **Migration `exp_run_match_v1b_note`**: run_match keeps a non-empty receipt note.
- **Data**: 15 categories, 65 payee rules, 2 settings, 2 admins, months 2026-08 to 2026-10 and the 52 lines copied from the Expenses 9616 page database. `exp.v_report` equals the August ($3,678.64), September ($16,727.03) and October ($2,814.34) DRAFT reports cell by cell; the guard and the matcher were tested inside rolled-back transactions. Not on the Data API; the dashboard's gated `public.exp_*` RPCs come with phase 4.

## 2026-10-02 · SSG Website — product data and logins secured (Q74 / Q75 / Q76): changes in `public` approved by David as exceptions to hub hard rule 1; everything else in `flabed` and the new private schema `flabed_private`; `archive`, `xpress`, `hr`, `ap`, `svc` untouched; `handle_new_user()`, `is_staff()`, `on_auth_user_created` untouched
- **Why**: David on SSG board item 72 — "q74 - GO", "q75 - go", "q76 - Go"; employees log in only with @sealsonline.com addresses that have an EMPLOYEE record in Dynamics, and "David has to enable the User account" before any magic-link sign-in. Before: anyone with the publishable key could read every `public.products` row (27,759 customer kits, 11,567 DWG) and any signed-in user could set their own `profiles.is_staff` / `customer_code`.
- **`public.profiles` (migration `flabed_staff_access_v1`)**: trigger `flabed_profiles_guard` BEFORE INSERT OR UPDATE → `flabed.profiles_guard()` sets `is_staff := flabed.is_approved_staff(email)`; INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER revoked from anon and authenticated (table and columns), then `grant update (company, contact_name, phone, invoice_email, payment_pref)` to authenticated. `public.current_customer_code()` replaced (same signature): staff → `impersonate_customer_code`, others → `customer_code`; the company-name lookup into `p21_customers` is gone. A missing profile row for d.anderson@sealsonline.com was inserted. **To make someone staff now: approve them in `flabed.staff_access`** (mockup.fluidsealab.com/admin.html) — a hand-set `is_staff` is overwritten on that profile's next update. d.anderson@sealsonline.com and d.anderson@fluidsealab.com are approved admins (the staff desk login keeps working).
- **`flabed` sign-in gate**: table `flabed.staff_access` (email pk, employee id / name / title / department, role staff | admin, status requested | approved | denied | revoked, request counts, decided by / at, note); `flabed.request_staff_access(email)` (service role; @sealsonline.com + Active `public.employee.work_email` only; notifies at most once a day), `flabed.is_admin()`, `admin_whoami`, `admin_access_list`, `admin_decide_access`, `admin_customer_logins`, `admin_set_customer_code` (all check `is_admin()`); `chat_settings` keys `staff_access_approver`, `staff_access_admin_url`. **New edge function `staff-access` v1** (verify_jwt off): `request` → approved: `signInWithOtp` magic link; first request of the day: approval email to David (Gmail SMTP secrets); else 403 — `decide` → `admin_decide_access` under the caller's JWT, an approval emails the employee a sign-in link. Live: another domain → 403 `domain`; an @sealsonline.com address not on the employee list → 403 `no_employee`; `decide` without a token → 401. Supabase Auth Redirect URLs gained `https://mockup.fluidsealab.com/**` (David's yes, his Chrome).
- **Website visibility (migrations `flabed_product_visibility_v1`, `v1b`, `v1c`, `v1d`, `flabed_site_match_parts_defaults`)**: new schema `flabed_private` (not on the Data API, no grants): `product_level()` (override → not Active / test = hidden → web store or Kit Catalog = public → Kit - Customer, customer-code-shaped or known-code part numbers = owner → DWG, fees / services / labour / taxes / promo / supplies / tools / literature, labels / packaging / box / bags = staff → else public), `product_owner_codes()`, `site_can_see_v()`, `site_price()` (null = Price on request for list ≤ 0, ≥ 9,999, margin < 30 % when cost > 0), `viewer_codes()` (own code + national-parent family), `viewer_sees_all()`, matviews `customer_codes`, `product_owner_ap`, `product_restrictions` (40,327 non-public rows), view `site_products`, table `product_visibility_override`, `refresh_security()` + `refresh_log`, cron `flabed-security-lookups` `20 10 * * *`. Rewired to `site_products`: `flabed.site_search`, `find_equipment`, `site_get_part_specs`, `site_get_stock`, `site_kit_components`, `site_links_for_parts`. New anon wrappers `flabed.site_search_products(term, max_results)`, `site_match_parts(...)` (same defaults as `public.match_parts`), `site_find_cross_refs(p_oem)`; `flabed.can_see_product(...)` (authenticated). Measured: site_search 12–353 ms.
- **`public.products` and the old search functions (migrations `flabed_q76_products_lock`, `flabed_q76b_policy_speed`, `flabed_q76c_policy_fn_no_set`, `flabed_q76d_policy_prefilter`)**: `revoke all on public.products from anon`; policy "public read products" ALTERED (not dropped) and renamed "read products by website visibility" — `TO authenticated USING ((select public.is_staff()) or (rule-public row checked inline while (select flabed.visibility_overrides_absent())) or flabed.product_visible_to_me(part_number, imported_at, profile_group, profile, category_profile, status, dynamics_guid))`; helpers `flabed.product_visible_to_me()` (one index probe into `product_restrictions`, viewer codes cached per transaction by `flabed_private.viewer_codes_cached()`), `flabed.visibility_overrides_absent()`. `revoke execute … from public, anon` + `grant execute … to authenticated, service_role` on `public.match_parts(text,text,numeric,numeric,numeric,text,numeric,integer,text)`, `public.search_products(text,integer)`, `public.find_cross_refs(text)`. Live API as anon: `/rest/v1/products` 401, `/rpc/find_cross_refs` 401, `flabed.site_find_cross_refs` 200. Signed-in non-staff: `search_products('2-222')` 4.2 s, full catalogue 2.2 s (the first policy version timed out — fixed by v76b–d); staff unchanged (0–18 ms).
- **Edge function `marion-chat`**: service version 14 (this session, ~18:5x UTC) moved the website tools `search_products` / `match_parts` / `find_cross_refs` to the three `flabed.site_*` wrappers and added a header note — nothing else. Version 16 (search chat, 19:06 UTC) carries all three routes (read back with `get_edge_function` at the end of this session), so nothing was added and nothing redeployed. Staff path unchanged throughout.
- **fluidseal-mockup**: `assets/site-search.js` 2026-10-02.7 (`7e38b462…`; cross-references through `flabed.site_find_cross_refs`; a signed-in visitor's own token is sent and the edge cache skipped), `admin.html` (new, `5866f627…`), `data/oilgas-equipment.gz.js` (`49f79cc0…`) and `data/mining-equipment.gz.js` (`4b334a12…`) without the 7 DWG parts they published.
- **Tests**: as anon zero customer kits, zero DWG and no $9,999 price from every website function; customer (temporary code in a rolled-back test) only its code's family; staff everything; admin page Playwright 26 / 26 (mocked); market pages render without DWG.
- **Not done here (SSG board item 81)**: signed-in non-staff can still call `public.match_parts` / `find_cross_refs` / `part_info` (SECURITY DEFINER, unfiltered) and read `public.v_kit_components` / `v_bom_lines` (security_invoker off); anon can execute some maintenance functions (`delta_nightly` …) — for the Marion project. Rules for every website: hub `website-rules.md`.

## 2026-10-02 · HR - Agent — employee review profiles: table `hr.review_profile` + gated `public.hr_review_index()` / `public.hr_review_profile(uuid)` (schema `hr` plus two new `public.hr_*` functions only; no `public` table, `archive`, `xpress`, `svc` or `flabed` touched; `dynamics-sync` not redeployed)
- **Why**: David — "update all of the employee data so it is ready for review". The four September review profiles had been shipped in reviews.js in the PUBLIC repo `davidranderson1/fluidseal-hr`; they now live behind the HR portal's allow-list instead (reviews.js is an empty placeholder since commit 48f0d32).
- **Migration `hr_review_profiles`**: `hr.review_profile` (employee_id uuid pk, employee_name, review_date, review_kind, profile jsonb not null, window_start, window_end, built_at default now(), built_by, source); RLS on, no policies, all grants revoked from anon / authenticated. New `public.hr_review_index()` → (employee_id, review_date, review_kind, built_at) and `public.hr_review_profile(p_employee_id uuid)` → (employee_id, review_date, review_kind, profile, window_start, window_end, built_at): plpgsql, stable, security definer, `search_path = hr, public`, raise `not_authorized` unless `hr.is_viewer()`; execute revoked from public / anon, granted to authenticated — the same pattern as the other `hr_*` functions.
- **Migration `hr_review_profiles_own_profile_admin_only`**: helper `hr.review_hidden(p_employee_id uuid)` (security definer, no grants) — true when the employee is an active portal viewer (by work email or first-initial.lastname) and the caller is not `hr.is_admin()`; both functions filter with it, so a viewer never sees their own profile unless they are an admin. Tested: admin sees 28 rows, a non-admin viewer 25.
- **Data**: 28 rows (27 active staff + one recently departed), written with `execute_sql`; `source` = "Dynamics 365 read 2026-10-02; md5 <hash of the loaded JSON>", all 28 hashes checked after the load.

## 2026-10-02 · SSG Website — `marion-chat` website channel can stream (v14 code, service version 16) + Cloudflare edge cache for the one-box search (no DDL; `public` / `archive` / `xpress` / `hr` untouched)
- **Why**: David on board item 67 — Q55 "yes now" (fastest cache), Q57 "go now" (stream Marion's answers instead of waiting for the HTML → React change).
- **Edge function `marion-chat`** (verify_jwt OFF as before; staff path byte-for-byte unchanged; hand-off and feedback unchanged): with `body.stream === true` on the website channel the answer comes back as `application/x-ndjson`, one event per line — `start`, `tool {name}` when Marion calls a tool, `text {d}` as she writes, `reset` when a round ends in tool use, then `done {j}` carrying exactly the v13 JSON payload (`_tool_calls`, `_tool_results`, `_links`, `_message_id`, `_usage`, `_quota`), or `error {status, j}`. Quota (429), origin (403) and validation (400) answers keep their HTTP status before the stream starts. Without `stream` the website answer is the v13 JSON, unchanged. Source: project doc `claude/website-chat/marion-chat-v14.ts` (sha256 ddbf1243…); 29 local checks (Deno + a stand-in for Supabase and the Messages API, `claude/generators/test_marion14.py`).
- **OVERLAP WITH THE PRODUCT-SECURITY SESSION (board item 72) — read this before the next marion-chat deploy**: I read back service version 13 at about 18:50 UTC and deployed my streaming build as **version 15 at 18:59 UTC**. Between the two, the product-security session had deployed **version 14** (the website tools through the new filtered wrappers; `public.search_products` / `match_parts` / `find_cross_refs` closed to anon). Version 15 did not have that change, so from **18:59 to 19:06 UTC the website chat's catalogue tools failed** (`chat_messages` 52, 54, 56, 58 — all four are my own test sessions `claudetest-20261002-*`; **correction 2026-10-02 21:00 UTC**: this line first said 52 and 54 were someone else's — wrong; the function logs show no `marion-chat` call between 18:00 and 18:59:51 UTC, so no visitor got a failed answer and a version 14 never answered anyone). **Version 16 (19:06 UTC)** = the streaming build + website tools through `flabed.site_search_products`, `flabed.site_match_parts`, `flabed.site_find_cross_refs` (same arguments as the public functions). Verified live: every tool ok (message 60). I do not have version 14's source: if it changed anything else (for example signed-in visitors in the chat), read version 16 back with `get_edge_function` and re-apply only that on top of it.
- **Checked 2026-10-02 21:00 UTC against the product-security migrations** (`flabed_staff_access_v1` … `flabed_q76d_policy_prefilter`): all eight website tools of version 16 answer as the anon role (`site_search_products`, `site_match_parts`, `site_find_cross_refs`, `site_oem_prefixes`, `site_get_stock`, `site_get_part_specs`, `site_kit_components`, `find_equipment`). The instruction for the product-security chat (read version 16 back, add only what a version 14 had beyond the three tool routes, keep `stream`) is at the top of its handoff (Drive "2026-10-02 - SSG Website - HANDOFF - Product security tags", project doc `claude/handoff-product-security.md`); SSG board item 76. Found while checking: `public.part_synonyms` (8 active rows) is readable only by `authenticated`, so the website prompt has had no vocabulary lines since v11 — SSG board item 78 (Q94), no change made.
- **Live (mockup.fluidsealab.com origin, "Do you have 2-222 o-rings in Viton?")**: JSON answer 12.7 s with nothing shown before it; streamed: first event 1.4 s, first tool 2.6 s, first words of the answer 6.4 s, done 12.8 s, streamed text equal to the done payload.
- **chat.html build 2026-10-02.11** (fluidseal-mockup blob `a58426bd…`): asks for the stream; the status line names the tool ("Searching the catalogue…"); the answer is written in place with a yellow caret and kept in view above the composer until the visitor scrolls; the `[[PARTS]]` / `[[FOLLOWUPS]]` markers never show; the finished answer is drawn exactly as before from the `done` payload; `?stream=0` or a browser without streams gets the JSON answer; a stream that stops early says so. Bubble panel and the results-page answer box use the same page.
- **Cloudflare Worker `fluidseal-search`** (account "D.anderson@fluidsealab.com's Account", login d.anderson@sealsonline.com; `https://fluidseal-search.d-anderson.workers.dev`; KV namespace `fluidseal-search-cache` = binding `SEARCH_CACHE`): read-only allow-list of anon functions (`flabed.site_search`, `site_links_for_parts`, `site_get_stock`, `find_equipment`, `public.find_cross_refs` — the last is now closed to anon and unused; **Worker 2026-10-02.2 (Q93, 21:05 UTC) replaces it with `flabed.site_find_cross_refs`** and site-search.js 2026-10-02.8 sends the cross-reference lookup through the edge); one GET `/bundle` answers a whole results page (search + links + stock); answers kept 10 minutes (data centre cache + KV); `GEN` constant bumps to drop every cached answer at once. Writes (search log, Marion, the Claude fallback) never pass through it. **site-search.js 2026-10-02.6** (blob `e95b17a2…`) uses it with a Supabase fallback; the security session's **.7** (`7e38b462…`, 18:53 UTC) built on it and sends signed-in visitors straight to Supabase (never the cache).

## 2026-10-02 · Dynamics project — schema `svc` only: Ship Register My Day, Daily View, Submit email (no change to `public` tables, `archive`, `xpress`, `hr`, `flabed`)
- **Migrations** (all DDL in `svc`; the only new objects in `public` are gated `svc_*` functions, the same pattern as `hr_*` / `ap_*`): `svc_v8_myday_tables` (svc.sr_worker, svc.sr_work, svc.sr_mail; setting `sr_mail`; 10 pickers seeded), `svc_v8b_myday_daily_view_functions` (svc.my_worker, svc.sr_put_worker_value, svc.sr_daily_data; public.svc_whoami + svc_sr_save replaced with the same body plus `worker` and the picker lock; new public.svc_sr_daily, svc_myday_get, svc_myday_save, svc_sr_worker_set (authenticated, gated) and svc_sr_mail_pending, svc_sr_mail_mark (service_role only)), `svc_v8c_submit_mail_queue` (trigger sr_day_mail_queue on svc.sr_day), `svc_v8d_daily_internal_preview` (public.svc_sr_daily_internal, service_role only), `svc_v8e_pickers_from_myday_and_worker_productivity` (svc_myday_save fills the Pickers line; public.svc_worker_productivity, authenticated, gated). anon has EXECUTE on none.
- **Edge function** `svc-sr-mail` v1 → v2 the same day (verify_jwt off, x-inbound-token = ws_config.inbound_token — `public.ws_config` read only).
- Record: Dynamics project doc claude/ship-register-phase3-2026-10-02.md; hub infrastructure.md `svc` update 2026-10-02.

## 2026-10-02 · ABQUOTE training — option lines (the asked part first, the alternative as its own line; the customer decides), Caterpillar numbers without the dash, the RE prefix rule removed — quote.html builds 2026-10-02.1 / .2, ai_rules 15 / 27 / 49 / 50 / 51 changed and 53 added (no DDL; `archive` / `xpress` / `hr` / `flabed` untouched)
- **Why**: David's answers to board items 39 and 71 (2026-10-02): the RE prefix is just part of a group of Fluidseal codes — no rule; his substitute, upsell and quality explanations are the rules Marion needs; for an OEM kit ask, first check stock on what was asked, converted to our part number, then offer the alternative as a second option and let the customer decide.
- **ai_rules** (written through the quote page's signed-in staff client — the database connector held the UPDATE for an approval prompt again, 180 s, nothing applied; old texts kept in the project doc): **53** new (cross_reference, sort 909) OPTIONS — the line is always the part the customer asked for, converted to our number; a substitute / upsell / quality upgrade a rule names is an extra line right after it (`option_for`, notes "OPTION — <reason>"), never in place of it. **15**: a Caterpillar 3-digit-dash-4-digit number becomes RCAT- with the dash dropped (no RCAT number in the catalog has a dash). **27**: OEM o-ring — our cross of the asked OEM number first, the house dash o-ring as the option (a customer rule that takes the house o-ring wins). **49**: the "drop the RE" sentence removed. **50**: the -AER anti-extrusion upgrade is an option line after the asked code. **51**: the PTFE back-up 8-<size>SD/T is an option line after 8-<size>/N90.
- **quote-app-2.js** (2026-10-02.1): extraction schema gains `option_for` (prompt item 6); `applyParsed` links an option to its parent with a stable line id (`_lid` / `_optOf`); `verifyOptions()` (after `kitCollapse`) keeps an option only when its parent is still in the cart and its part number is a catalog part (`part_info`) — options are never re-crossed, searched or replaced; `kitCollapse` ignores options; `dedupeOptions()` drops an option equal to its parent's final part number; cart Type cell shows "Option ↑N". OEM step: `find_cross_refs` is retried without dashes / spaces / dots when the number as written finds nothing (the catalog stores OEM numbers without dashes). (2026-10-02.2): the OEM step keeps a house code the rules chose on purpose when it is a catalog part and offers the OEM cross as a Review option instead of replacing it — .1's dash-free retry had started replacing a customer's house o-ring with the OEM cross (caught by the run, fixed before the after-run).
- **Score** (fixed held-out set: 20 quotes, 19 evaluable, 47 lines; probe set 5 quotes, 8 lines; held-out / probe quotes excluded from history; real page in David's Chrome). New measure "offered" = the part Fluidseal quoted is on the quote as the line or as an option line.

| Measure | Run B (2026-10-01.1, before) | Run D (2026-10-02.2 + rules) |
|---|---|---|
| Exact, all 47 lines | 39 (83 %) | 38 (81 %) |
| Offered (line or option), all 47 lines | 39 (83 %) | **40 (85 %)** |
| Text quotes, exact / offered (36 lines) | 34 / 34 | 34 / 35 |
| Image quotes, exact / offered (11 lines) | 5 / 5 | 4 / 5 |
| Wrong lines against Fluidseal's quote | 9 | 9 |
| Wrong lines against David's answers (the asked part first; the back-up he called right) | 8 | **6** |
| Option lines added | 0 | 5 (2 of them are the part Fluidseal quoted) |
| Probe set exact (8 lines) | 4 | 6 (wrong 4 → 3) |

- Effects: the OEM kit ask now gives our cross of the asked number (in stock) plus the house kit Fluidseal quoted as the option; the polypak ask written as an RE rod-seal code keeps the asked code (history confirms it was quoted that way before) with the -AER upgrade as the option; back-up rings get the PTFE substitute as an option. One work-order photo quote scored one line lower — run-to-run variance on lines the change does not touch (the extraction called a size-only rod u-cup kind "u-cup", for which `match_parts` finds nothing — kind "rod seal" finds the right part; logged as the next miss).
- Files: quote-app-2.js, quote-app-3.js (MARION_BUILD 2026-10-02.2), quote.html (three `?v=2026-10-02.2`). Records: project doc `claude/abquote-9.4-option-lines-cat-rcat-2026-10-02.md`, board items 33, 39, 71, HANDOFF-ABQUOTE-TRAINING.md section 13.

## 2026-10-02 · product_links refreshed from the SSG Website (www.sealsonline.com) — 90,915 links, site restructure absorbed; `series_images` 8-xxx re-keyed; scheduled task rewritten (`public` DATA only, no DDL kept — temporary RLS policies created and dropped in-run; `archive` / `xpress` / `hr` / `flabed` untouched)
- **Why:** the SSG Website (www.sealsonline.com, the live store — not the Mockup at mockup.fluidsealab.com) restructured its category tree between 1 Aug and 1 Oct 2026; every stored URL (`/categories/inch/…`, `/metric/…`, `/hard-parts/…`) returned 404, so `link_for_part`, `part_info`, `find_cross_refs` and `images_for_parts` were handing out dead links and the Mockup's "Product page ↗" buttons were broken.
- **Data change (public.product_links, 2026-10-01 run + 2026-10-02 follow-up):** 44,171 → 90,915 rows. 44,121 existing rows: `url` and `series` rewritten (`crawled_at` untouched = first-indexed). 46,744 new rows (42,854 exist in `public.products`, 3,889 are SSG-only). 50 pre-existing rows not on the SSG Website kept (David: "we might have more information in our mockup than the live site, that is normal" — the task never deletes). RENAMED: `3-904/V75BL` (Dynamics) is listed as `3-904/V75BLB` on the SSG Website — David: SSG Website error, not synced; the row `3-904/V75BL` now points at `…/o-rings/o-rings-inch/3-xxx/3-904-v-75-blb` and the row `3-904/V75BLB` (inserted by the run) was deleted. `public.series_images`: `o-rings/8-xxx` re-keyed to `back-up-rings/8-xxx` (the site moved the series) — 5 of 5 image rows join again.
- **Series naming kept compatible:** `series` = path segments after `/categories/` with the `-inch` / `-metric` segment removed, last two joined by `/` (`o-rings/2-xxx`, `rod-seals/bs`, `charlynn/charlynn-kits`) because `images_for_parts` joins `series_images.series`.
- **Temporary access, created and dropped inside the run (verified afterwards: only `read links` policy + SELECT grants for anon / authenticated remain):** `create policy "crawl insert" … for insert with check (true)`, `"crawl select" … for select to anon using (true)`, `"crawl update" … for update to anon using (true) with check (true)`, `grant insert, update on public.product_links to anon` → `drop policy … ×3; revoke insert, update … from anon, authenticated`.
- **Method (scheduled task `sealsonline-link-index-refresh`, prompt rewritten 2026-10-01/02, 07:00 MT on day 1):** recursive crawl from `/en/flabca/categories` in David's Chrome (same-origin `fetch`, background job on `window`, polls under 35 s — the javascript_tool call dies at 45 s); products from each page's `#seo-archive-itemlist-jsonld` (ItemList `sku` + `url`, rebuilt with store code flabca — the JSON-LD says rbmtl); sub-categories = card anchors `a.group` 1 or 2 segments deeper (top-level pages skip the -inch/-metric level), no depth cap (deepest 7 segments); PostgREST upsert in chunks of 800 with `Prefer: resolution=merge-duplicates`; ~2 requests per second; 687 pages, 22 minutes; 0 errors. Every run reports the fixed sync table (NEW / URL REWRITTEN / UNCHANGED / REMOVED / RENAMED / SSG-ONLY / MOVED + Required action) and pushes its own CHANGELOG line here and in the hub.
- **Records:** hub CHANGELOG 2026-10-02, hub infrastructure.md "Added 2026-10-02", hub projects.md Marion row, Marion Open Items board items 72–74, Drive Claude/Files "2026-10-01 - Marion - HANDOFF - product_links hub write-back" and Claude/Learnings "LEARNING - 2026-10-01 - TOOLS - sealsonline.com restructure, JSON-LD ItemList crawl, javascript_tool limits".

## 2026-10-01 · ABQUOTE training — run B scored on build 2026-10-01.1 (item 68 kit collapse); HANDOFF-ABQUOTE-TRAINING.md section 12 (docs only, no code change)
- **Score, run B — build 2026-10-01.1** (same fixed held-out set: 20 quotes, 19 evaluable, 47 lines, held-out quotes excluded from history; real page in David's Chrome), against run A (rules 52 + 25 on build 2026-09-30.2) and the 2026-09-30 after-run:

| Measure | 2026-09-30 after-run | Run A (rules 52 + 25) | Run B (kit collapse) |
|---|---|---|---|
| Exact part number, all 47 lines | 36 (77 %) | 38 (81 %) | **39 (83 %)** |
| Text-only quotes (36 lines) | 33 | 33 | 34 |
| Image-only quotes (11 lines) | 3 | 5 | 5 |
| Wrong lines | 9 | 9 | 9 |
| Unparseable answers | 0 | 0 | 0 |
| Probe set, 5 non-held-out quotes (8 lines) | 1 | 3 | **4** (wrong lines 12 → 4) |

- Item 68 targets: the probe quote that lists a previously ordered kit's contents now comes out as the one kit line (was 8 component lines); the held-out quote that asks for "the kit we bought before" on an old PO now gets the kit by size from that invoice's wiper and piston seal; the two probe quotes with PO / W/O context and no kit did not change.
- Feedback tool checked end to end on the live build (one test row inserted and dismissed); `marion-digest` dry run 200; first digest Monday 2026-10-05 7 AM America/Edmonton.
- Still open: ai_rules id 49 update (held by the database tool's approval step); the Quote Content # comparison after the 2026-10-02 nightly run (Dynamics side, board item 67).
- Files: CHANGELOG.md, HANDOFF-ABQUOTE-TRAINING.md (section 12). Records: project doc `claude/abquote-9.3-kit-collapse-shaft-seal-feedback-2026-10-01.md`, board items 21, 33, 39, 64, 65, 67, 68, 69.

## 2026-10-01 · ABQUOTE training — quote.html build 2026-10-01.1 (request-level kit collapse, board item 68), feedback tool (board item 21: table `marion_feedback`, thumbs, review panel, `marion-digest`), rules 52 / 25 (items 69 / 39) — `public` DDL: one new table + one caller function; `archive` / `xpress` / `hr` / `flabed` untouched
- **Why**: David's answers carried over from the 2026-09-30 chats (item 68 GO, item 69 yes, item 21 "yes" + digest to d.anderson@sealsonline.com) and the ground truth for item 39 (RE + digits is a Fluidseal RS rod-seal code: 4 of 5 RE asks from the one distributor that writes them were quoted verbatim). David 2026-10-01: "most of these are answered already, stop asking same questions".
- **ai_rules**: id **52** inserted (cross_reference, sort 918) — metric shaft seals given as ID x OD x W are S + ID(3) + OD(3) + W×10(3) + type, TC by default, SC only for single lip, BABSL only for NOK numbers. id **25** (verbatim Fluidseal codes) gains the inch rod seal grammar "RENNNNNNNN-NNN" (RE kept). id **49** (one customer's rule) still says "drop the RE" — its update is held by the database tool's approval step (4 timeouts); queued.
- **quote-app-2.js** — `crossRefCart` step −1 `kitCollapse()`: the request's PO / W/O references (customer.po + the whole ask, `window.__LAST_ASK` set in `callMarion`) go to `history_lookup` once; (a) an earlier invoice with ONE kit header whose components make up at least half of the extracted lines (compound suffix ignored) → those lines become the kit line (conf high, components in the note, kit quantity from "N of the … kit"); (b) a components-only invoice (pre-2026) on a kit ask → `<rod>"ROD X <bore>"BORE` from the wiper / rod-seal inside diameter and the piston-seal outside diameter in `products` (conf med, Review). Lines the step builds skip the per-line steps (`_kitDone`).
- **Feedback tool (item 21)**: migration `marion_feedback_v1` — table `public.marion_feedback` (surface chat / quote_intake / digital_quote, rating ±1, comment, ai_answer jsonb, correction jsonb, status new / reviewed / actioned / dismissed, action_ref; RLS: insert own row, read own or staff, update staff only; column-level update grant) and `public.marion_digest_call()` (pg_cron → `net.http_post`, ws_config inbound token, the `ap_mailbox_call` pattern). quote.html: thumbs on every cart line (Review column) and on the whole request (beside the status line); a thumbs down asks why and the right part number. index.html (Marion chat): "Helpful? 👍 👎" under every signed-in answer. quotes.html: "Unreviewed feedback" panel (#feedback) — Make a rule (prefills a rule; Save marks the feedback actioned with `ai_rules:<id>`), Add cross-reference (writes `xref_feedback` manual_edit; `xref_feedback:<id>`), Dismiss. Edge function **`marion-digest`** v1 (verify_jwt off, token check; recipient fixed to d.anderson@sealsonline.com; Monday 7 AM America/Edmonton; dry run tested 200) and pg_cron job **28** `marion-digest-weekly` `0 13,14 * * 1` (the function sends only at 7 AM local). `marion-notify` untouched.
- **Score, run A — rules 52 + 25 on build 2026-09-30.2** (held-out 20, 19 evaluable, 47 lines, held-out quotes excluded from history; real page in David's Chrome): exact 36 → **38** of 47 (77 % → 81 %) — text 33 → 33 of 36, image 3 → **5** of 11 (the metric shaft seal now exact; one image quote 3 → 4 of 7, run-to-run variance seen before); wrong lines 9 → 9; unparseable 0 → 0. Probe set (5 quotes, 8 lines): 1 → **3** (the shaft-seal probe 0 → 2 of 2; the short-PO probe is now parsed). Run B (build 2026-10-01.1, item 68) follows in the next entry.
- Files: quote-app-2.js, quote-app-3.js (MARION_BUILD 2026-10-01.1), quote.html (three `?v=2026-10-01.1`), quotes.html, index.html. Records: project doc §9.3, board items 21, 39, 64, 65, 67, 68, 69.

## 2026-10-01 · Dynamics 365 / SharePoint project — PAYABLES: ABpayables feed race fixed — migrations `ap_run_match_comment` + `ap_run_match_v1c_serialize`, edge function `ap-mailbox` v2 (`public` DDL / `archive` / `xpress` / `hr` untouched)
- **Why**: first-morning check of the ABpayables feed (board item 239) found 6 `ws_inbox` rows in error ("duplicate key upload_storage_path_key") and two documents not read (BGL M04293365 "duplicate key match_pair_uidx"; Wonyoung WYS260931 .XLS classified "other"). David: "Q1 - do whats best".
- **Causes**: (a) every real-time call picked up every `received` row, so two emails in the same second were processed twice; (b) `ap.ingest` ends with a global `ap.run_match()` (delete + re-insert of all non-manual matches) — two ingests at the same moment collided on `ap.match_pair_uidx`.
- **Migration `ap_run_match_v1c_serialize`** (schema `ap` only): `ap.run_match` now starts with `perform pg_advisory_xact_lock(hashtext('ap.run_match'))`; body otherwise identical (patched in place by a DO block from `pg_get_functiondef` — a full CREATE OR REPLACE through `apply_migration` timed out twice at 180 s). `ap_run_match_comment`: function comment only.
- **Edge function `ap-mailbox` v2** (verify_jwt off, `x-inbound-token`): lease row `public.ws_config` key `ap_mailbox_lock` (data row, no DDL; 5 min, renewed per email; busy callers wait up to 100 s; the holder drains until empty or 230 s); each `ws_inbox` row claimed `received → processing` with `extracted.claim {run, at}` (claims older than 10 min are taken over); answers 202 and works via `EdgeRuntime.waitUntil` (`{"sync":true}` waits, `{"nowait":true}` skips the queue); kind `other` with a readable file is read too; `{"reextract":[{document_id, upload_id, kind_hint}]}` re-reads stored files; `ap_mailbox_last_run` only when rows were worked / on a re-read / on the sweep (limit ≥ 200). Flow "AI-Intake - ABpayables → ws-inbound" (body `{"limit":5,"trigger":"flow"}`) and cron `ap-mailbox-daily` unchanged.
- **Data**: M04293365 re-read (CAD 14.70); Wonyoung .XLS re-read → invoice WYS260931 USD 903.40 (20 lines: 13 ok, 7 below P21 cost) as a new record, the duplicate packing-list copy (index row 5cb1748c) set kind other / status filed with an `ap.note`; global `ap.run_match()` re-run. Test: three concurrent calls ran one after another, 0 errors. The 6 cosmetic `ws_inbox` error rows set to `processed` on David's "you decide" (old error text kept in `summary`; the UPDATE had timed out twice, the third try went through); the 3 processed rows that still carried an error text cleared the same way — 88 rows, 0 with an error. First real emails through v2 (4:04 PM and 4:31 PM MT): processed in 13–15 s, extraction ok.
- Record: project doc `claude/abpayables-mailbox-first-run-check-2026-10-01.md`.

## 2026-10-01 · SSG Website — one search function `flabed.site_search`, rules and synonyms tables, Claude fallback edge function `site-search-assist` (`public` / `archive` / `xpress` / `hr` untouched — `public.products` is read through its existing indexes, nothing written)
- **Why**: David — "q51 - yes supabase one box search", "q52 - yes", "Q53 - GO … if we spend $500/$1000 a month at PEAK usage all users onboard to answer questions fast and accurately that is ok", "Q54 - go" (SSG board item 61).
- **Migration `flabed_site_search_v1`** (DDL in `flabed` only): tables `flabed.search_synonyms` (term, replacement, status proposed/active/rejected, source, note, decided_at/by; unique lower(term), lower(replacement)), `flabed.search_rules` (name, match_type exact/contains/regex, pattern, action jsonb {mode, set, filters, pin, redirect}, priority, status …), `flabed.search_fallback_cache` (q_norm primary key, reading jsonb, model, input/output tokens, cost_usd, ms, hits, status new/promoted/rejected, created_at, last_hit_at); RLS on all three, revoked from anon/authenticated, service_role select/insert/update; `flabed.chat_settings` rows `assist_enabled` true, `assist_model` "claude-haiku-4-5", `assist_monthly_cap_usd` 500, `assist_ip_daily_limit` 300; function `flabed.site_material(p_part, p_profile)` (immutable; compound code from the profile or the part-number suffix); function `flabed.site_search(p_q text, p_reading jsonb, p_filters jsonb, p_limit int, p_offset int) returns jsonb` (SECURITY DEFINER, search_path flabed, public, pg_temp, plan_cache_mode force_custom_plan; applies active rules; modes part / size / words; returns rows, total, filter counts by group and material, reading, rules, redirect, capped, ms); grants anon, authenticated, service_role.
- **Migrations `flabed_site_search_v1b_type_material_words`, `flabed_site_search_v1c_type_browse_cap`**: product-type and material words in word searches; a type-only browse is capped at 2,000 rows (was 2.9 s → 75 ms).
- **Migration `flabed_search_assist_v1`**: table `flabed.search_assist_log` (salted IP hash only, q_norm, cached, ok, reason, model, ms, cost_usd; RLS; service_role select/insert), function `flabed.search_assist_usage(p_ip_hash)` (service_role; month spend and the IP's calls today); `site_search` granted to service_role.
- **Edge function `site-search-assist`** v1 → v2 (verify_jwt OFF — public website, like marion-chat's website channel; origin allow-list mockup.fluidsealab.com / fluidsealab.com / www / localhost:8000): reads the fallback cache, settings and usage together, else one Claude Haiku 4.5 call with forced tool use (fixed reading schema), caches the reading, logs after answering (EdgeRuntime.waitUntil). Secrets: ANTHROPIC_API_KEY, CHAT_IP_SALT. Measured: about US$0.003 and 2.3–3.1 s a new phrase, 0.2–0.25 s cached. Log ids 1–8 are Claude's checks.
- **Timings** (Alberta → ca-central-1, warm): part family 2-222 (240 parts) 15–21 ms in the database, size 15 ms, words 38–80 ms; round trip 95–190 ms.
- **Website** (fluidseal-mockup): `assets/site-search.js` 2026-10-01.4, `chat.html` 2026-10-01.9, `assets/ask-marion.js` 2026-10-01.3, `search.html`. Weekly scheduled task "SSG Website weekly search review" proposes rules and synonyms with status 'proposed' only.

## 2026-10-01 · SSG Website — search log `flabed.search_log` (new, anon insert only through a function); chat.html / bubble panel widen on a desktop (`public` / `archive` / `xpress` / `hr` untouched)
- **Why**: David — "q46 - yes" (board item 63: log each website search and click to learn synonyms and missing products) and "when i am testing on desktop the ecommerce view needs to expand for desktop".
- **Migration `flabed_search_log_v1`** (DDL in `flabed` only): table `flabed.search_log` (event search/click, search id, query text with a generated normalised copy, reading, result count, clicked kind and reference, source, page, build; RLS on; no grants to anon or authenticated; select for service_role; indexes on `created_at` and `(q_norm, created_at)`), function `flabed.site_log_search(p_event, p_q, p_intent, p_result_count, p_search_id, p_clicked_kind, p_clicked_ref, p_source, p_page, p_build)` (SECURITY DEFINER, `search_path = flabed, pg_temp`; drops bad events, masks e-mail addresses and phone numbers in the query, at most 300 rows a minute for the whole site; execute granted to anon, authenticated, service_role), function `flabed.search_report(p_days)` (service_role only).
- **Migration `flabed_search_log_v1b_report_skips_tests`**: `search_report` ignores rows with `source = 'test'` (three SQL test rows stay: the database tool holds DELETE for approval).
- **Website**: `assets/site-search.js` build 2026-10-01.2 writes the rows (no names, no IP address; nothing when the browser sends Global Privacy Control or Do Not Track); `chat.html` build 2026-10-01.7 (desktop grid, wider drawer) and `assets/ask-marion.js` build 2026-10-01.2 (panel widens when part cards arrive). Live check: rows 4–6 from mockup.fluidsealab.com through the publishable key.
- `marion-chat` edge function, `chat_rules` and every `public` object untouched.

## 2026-10-01 · SSG Website — one-box search: `flabed.site_links_for_parts` v2 (filter first, timeout fixed); new `search.html` + `assets/site-search.js` on the mockup (`public` / `archive` / `xpress` / `hr` untouched)
- **Why**: David — "We want the search bar at the top to do all the functionality and remove the advanced navigation search or for now just collapse it … What search technology can we use … depending on the search context the view should be different, typical Google search rules."
- **Finding (fixed)**: `flabed.site_links_for_parts` answered HTTP 500 "canceling statement due to statement timeout" for the anon role (about 3 s, every call, 2026-10-01 18:4x UTC) — the planner ran `flabed.site_live_url()` over all ~90,900 `public.product_links` rows before the part-number filter. The same lookup also timed out from the Supabase SQL console; `marion-chat` v13 wraps it in try/catch, so a slow or failed lookup means a website answer without `_links` (part cards without product links) — not measured on the function itself.
- **Migration `flabed_site_links_v2_filter_first`** (DDL in `flabed` only, `create or replace`, same signature, result, SECURITY DEFINER, search_path and grants): materialized CTEs pick the matching rows first (case-insensitive part numbers, blanks dropped), then rewrite only those URLs; same exclusions (`/categories/inch/`, `/categories/metric/`, `/categories/hard-parts/`). Anon call from mockup.fluidsealab.com: 3.1 s / HTTP 500 → about 0.3 s / HTTP 200; `2-222/N70` → `…/o-rings/o-rings-inch/2-xxx/2-222-n-70` (same URL as on 2026-09-30); empty array → `[]`.
- **No other database change.** The website search calls only existing anon-executable functions: `public.match_parts` (size), `public.search_products` (part number, ~0.8–1.1 s trigram scan), `public.find_cross_refs` (OEM number), `flabed.find_equipment` (machine), `flabed.site_links_for_parts`, `flabed.site_get_stock`, with the publishable key; suggestions while typing use the local `data/machine-index.gz.js`, so the shared Micro instance is called once per search, not per keystroke.
- **fluidseal-mockup**: `assets/site-search.js` (new, blob `412190cd…`), `assets/ask-marion.js` build 2026-10-01.1 (`bce57529…`, loads the search on every page with the bubble), `search.html` (new, `9996ecd5…`), `index.html` (`04d7417a…`, Advanced Navigation collapsed into a details panel wired to the store's size search `?d= &D= &H= &d-tol= &D-tol= &H-tol= &unit=Imperial|Metric`, category as the path). Project doc `claude/session-2026-10-01-one-box-search.md`.

## 2026-09-30 · SSG Website — Ask Marion, chat → commerce: `marion-chat` v13 (`_links`), `flabed.url_redirects` + `flabed.site_links_for_parts`, chat.html builds .4 / .5, brand chrome on the six site pages (`public` / `archive` / `xpress` / `hr` untouched)
- **Why**: David on an answer that listed six 2-222 o-ring compounds as prose — "Results page needs to be links to parts for more discovery and Add to Cart buttons … chat needs to turn into commerce. Change basket back to Cart, nobody calls it a basket. Q34 yes."
- **Migrations `flabed_site_links_v1` and `flabed_site_links_v1b_skip_unmapped`** (DDL in `flabed` only): table `flabed.url_redirects(old_path pk, live_path, what, note, updated_at)` (RLS, read for anon/authenticated; 194 rows loaded from fluidseal-mockup `redirect-map.csv`); `flabed.site_live_url(text)` rewrites a `public.product_links` URL to the live scheme (`/en/flabca/` → `/en/flabed/`, old category prefix → new through `url_redirects`, longest match); `flabed.site_links_for_parts(text[]) returns table(part_number, url)` (SECURITY DEFINER, reads `public.product_links` only; URLs still on an unmapped old prefix — `/categories/inch/`, `/categories/metric/`, `/categories/hard-parts/`, 51 rows — are left out so the page can fall back). `public.link_for_part` was not changed (it returns the stale flabca scheme). 44,120 of 44,171 product_links rows rewrite cleanly; `2-222/N70` → `…/categories/o-rings/o-rings-inch/2-xxx/2-222-n-70` (verified live).
- **Edge function `marion-chat` v12 → v13** (verify_jwt OFF as before; staff path and hand-off path unchanged): the website answer carries `_links` = `{ part_number: live URL }` for every part number in the tool results (search_products, match_parts, get_part_specs, get_stock, kits and components, find_equipment kits) and in the `[[PARTS]]` marker, 200 at most, via `site_links_for_parts`; links are a convenience and never block the answer (try/catch). Source: project doc `claude/website-chat/marion-chat-v13.ts` (sha256 1b7b6352…). `chat_rules` untouched (a rule change would need the held-out score, preference item 50) — part detection is on the page.
- **chat.html build 2026-09-30.4** (fluidseal-mockup blob `00432b0a…`) and **.5** (`44ec27e7…`): wording Cart everywhere (top bar, embed button, drawer "Your cart", "Clear cart"; storage key `marion_web_basket` kept); `_links` set each part's `url`; every known part number in Marion's text becomes a link to its sealsonline.com product page (`target=_blank`) with an "Add to cart" / "Add to quote" chip on its first mention (lane rule unchanged: kit → quote, In stock → cart, other availability → quote, no price → quote, else cart); a card for every part named (the `[[PARTS]]` picks first, then in order of mention, 12 at most; four or more cards → two columns from 700 px); the card's part number is the same link; one click marks every Add button for that part in the message; answer timeout 90 → 150 s (a 20-part catalogue answer took 95 s on 2026-09-30). `.5`: a part the web store does not carry (no `product_links` row — e.g. 2-222/V75, N80, N70R, F70, F80: Dynamics has them, the store does not) links to the category page of a sibling part (`…/2-xxx`) because the store's search is a live combobox with no results URL (`/search?q=` shows "0 results"); no sibling → sealsonline.com home.
- **Live test (David's Chrome, build .4/.5)**: "Do you have 2-222 o-rings in nitrile and viton? prices please" → 8 parts named → 8 links (3 product pages, 5 category fallbacks), 8 chips, 8 cards; chip + card button → cart count 2, drawer "Your cart" with the minimum-order block; thread restored on reload with links and cards.
- **Site chrome (board item 51 / Q34 — yes)**: `styles.css` (`1fe68833…`) `fs-*` rules rewritten on the Branding Guidelines — black utilities bar #231F20 (Century Gothic, greys), white header with the real logo (`assets/fluidseal-logo.png`, 68 / 56 / 46 px), Century Gothic Bold uppercase nav + yellow ASK MARION button (`.fs-nav-ask`), yellow line #FFDD00, black bar hidden; phone layout (≤ 600 px): logo + ASK MARION on one row, the four links on the next, search + Cart on the second utilities row (board item 34); the `fb-foot` footer rules added (same markup and classes as chat.html); every `#F5D000` → Fluidseal Yellow `#FFDD00` in styles.css and the pages. Pages (`index.html` `91df2b4b…`, `markets.html` `05a6fecb…`, `markets/mining.html` `b23b3743…`, `oil-gas.html` `adc210c4…`, `construction.html` `bd158500…`, `fluid-power.html` `32a1c487…`): logo markup → `<img>`, "🛒 0" → "Cart 0" (market pages keep `#cart-btn` / `#cart-count`, their cart drawer and min-order hook verified live), `ASK MARION` nav link, brand footer before the scripts. Pre-existing and untouched: horizontal overflow inside the mining page content (`band-meta`, 1097 px) and the fluid-power / construction band tags on phones; body fonts Archivo / Saira / IBM Plex Sans on the pages (board Q35).
- Records: board v20, hub CHANGELOG + projects.md, project docs (`claude/website-chat/chat.html` build .5, `marion-chat-v13.ts`, `styles.css`, session doc), HANDOFF-NEXT-MARKET.md, Learnings note, Drive handoff.

## 2026-09-30 · Dynamics 365 / SharePoint — `svc_v7_report_lock_field_types`, `svc_v7b_override_locked_for_entry` (`public` tables / `archive` / `xpress` / `hr` untouched)
- Migration `svc_v7_report_lock_field_types`: `svc.sr_metric.feed` added (planned P21 report per Ship Register line); `public.svc_sr_save` replaced (report values `p21:*` locked for entry users, a Master's change stored as `override`); new `public.svc_sr_put_report(date, jsonb, text)` — service role only (EXECUTE revoked from public, anon, authenticated).
- Migration `svc_v7b_override_locked_for_entry`: `public.svc_sr_save` replaced again — `override` values are locked for entry users too.
- Tested in rolled-back transactions: entry user cannot change a report or override value, cannot call `svc_sr_put_report`, cannot write a calculated line; Master override stored as `override` and kept when the report re-sends.
- fluidseal-hr (HR Portal repo, this project's files only): register.html 1c7bb1e, register.js d89a06c — the four field types with a legend.

## 2026-09-30 · ABQUOTE training — `history_lookup` v3 (invoice kit headers), quote.html builds 2026-09-30.1 / .2, rules 50–51, evaluation run 4 (`public.history_lookup` replaced; no other `public` / `archive` / `xpress` / `hr` object touched)
- **Migration `abquote_history_lookup_v3_kit_headers`** (board item 66): `public.history_lookup` dropped and recreated with two new return columns `is_kit`, `components`. Invoice PO / W/O hits return top-level lines only — a kit header (`sell_as_kit`) carries its components (`parent_invoice_line_id`, "code xqty, …"); a write-in header's item_code is the P21 kit-by-size text. A PO / W/O match now needs a strong token (5+ digits, or the token equals the whole PO / W/O) — a short prefix no longer matches a longer PO. Invoices that are the outcome of an excluded (held-out) quote are left out. The bom_lines fingerprint runs only for invoices without a header. EXECUTE: authenticated + service_role (anon removed; the `is_staff()` gate is unchanged). Read-only over training_quotes / invoices / invoice_lines / bom_lines — nothing imported (the import chat owns invoice loading).
- **quote.html build 2026-09-30.1** — `quote-app-2.js` crossRefCart step 0: a kit header answers a KIT ask (conf high) and only fills an empty part number otherwise (conf med); kit contents in the History note; a multi-line order with exactly one kit fills an empty kit line (med). Blobs: quote-app-2.js `5872d47d`, quote-app-3.js `ca9ae302`, quote.html `559c8cac`.
- **quote.html build 2026-09-30.2** — `callMarion` JSON retry repairs a dropped empty value (`"p21_quote_no","customer":…` → `"p21_quote_no":"",…`): the model did this in 4 of 40 evaluation calls (always at character 57). Blobs verified with git hash-object: quote-app-2.js `d225e8e6`, quote-app-3.js `08410042`, quote.html `72a9ce6c`. Pushed through the GitHub upload page in David's Chrome.
- **ai_rules 50 and 51** (board item 39, David's answers): `-AER` = anti-extrusion ring version of the same polypak (same dimensions and application, high-pressure upgrade); a requested back-up ring is never dropped — house 8-NNN/N90, PTFE substitute 8-NNNSD/T.
- **Score — fixed held-out set of 20 (19 evaluable; one ask was a phone call), 47 lines, real page, held-out quotes excluded from history:** before (build 2026-09-28.4, v2) 35 / 47 exact (74 %), 10 wrong, 0 unparseable → after (builds .30.1 / .30.2, v3, rules 50–51) 36 / 47 (77 %), 9 wrong. REGRESSION on .30.1: 3 answers unparseable (the dropped-value glitch) → fixed in .30.2, 6 / 6 re-runs parse. Text-only 15: 33 / 36 → 33 / 36 (34 / 37 when the back-up ring the ground truth left off is counted right, per David). Image-only 4 (run 4, first time through the page's file input): 2 / 11 → 3 / 11 (one quote gave 2 / 7 and 3 / 7 on the same build — variance). Probe set of 5 non-held-out quotes with real kit-header history: 1 / 8 → 1 / 8, no kit misfire. v3 does not lift the two held-out kit misses: one has no invoice for its reference, the other's invoice predates kit headers (components only) — board item 68 proposes kit collapse and kit size from components.
- Records: Marion Open Items board items 21 (feedback tool design), 33, 39, 64, 66, 67, new 68 and 69; project doc §9.2; hub CHANGELOG / projects.md / infrastructure.md / products.md; HANDOFF-ABQUOTE-TRAINING.md §11.

## 2026-09-30 · Dynamics 365 / SharePoint — `svc_v6_production_totals` and `ws-inbound` v3 (`public` tables / `archive` / `xpress` / `hr` untouched)
- Migration `svc_v6_production_totals`: `svc.sr_compute` gains an `add:` formula; Ship Register lines `total_machining`, `total_assemblies`, new `production_total` ("Production Totals"); every open Ship Register day recomputed. Schema `svc` only.
- Edge function `ws-inbound` v1 → v3 (this project's intake landing, verify_jwt off): a repeat POST for an existing `message_id` merges attachments into a row that has none (a failed row goes back to `received`); `attachments` as a JSON string is parsed; new rows set `has_attachments`. Writes only `public.ws_inbox` as before.

## 2026-09-30 · Dynamics 365 / SharePoint — Service Score and the digital Ship Register: new schema `svc`, gated `public.svc_*` functions, edge function `svc-nightly` (`public` tables / `archive` / `xpress` / `hr` untouched)
- Migrations (project hnmbjqhxvxakhdzgetxw): `svc_service_score_and_ship_register_v1` (schema `svc`, 12 tables, default-deny RLS, helpers `svc.card` etc., seeds), `svc_v2_gated_functions` (`public.svc_whoami`, `svc_board`, `svc_card_detail`, `svc_why`, `svc_excuse`, `svc_access_list`, `svc_access_set`, `svc_rating_set`, `svc_setting_set`, `svc_sr_catalog`, `svc_sr_get`, `svc_sr_save`, `svc_sr_set_status`, `svc_sr_month`, `svc_sr_people` for authenticated; `svc_put`, `svc_ingest`, `svc_sr_put_suggest` service_role only), `svc_v3_nightly_helpers` (`svc_people_internal`, `svc_log`, `svc_nightly_run` — service_role only), `svc_v4_whoami_rules`, `svc_v5_fixed_search_path`. The only new objects in `public` are those `svc_*` functions; `public.ws_inbox` is read, never written; no existing object changed.
- Edge function `svc-nightly` v1 (verify_jwt off, `x-inbound-token`). pg_cron `svc-nightly` (`40 5 * * 2-6`) and `svc-ingest-morning` (`5 14 * * 1-5`) — the 17 existing jobs unchanged.
- Front end: new files in `davidranderson1/fluidseal-hr` (service.html/js, register.html/js). Details: fluidseal-knowledge infrastructure.md "Added 2026-09-30 — `svc` schema".

## 2026-09-30 · SSG Website — Ask Marion: `marion-chat` v12 (hand-off recipient from `flabed.chat_settings`), brand chrome + embed mode on chat.html, "Ask Marion" bubble on the six site pages (`public` / `archive` / `xpress` / `hr` untouched)
- **Edge function `marion-chat` v11 → v12** (verify_jwt OFF as before; staff path unchanged): the website hand-off email goes to the address in `flabed.chat_settings` key `handoff_to` — David 2026-09-30: "d.anderson@sealsonline.com for now, will be our general mail ab box later" — with `NOTIFY_TO` as the fallback when the row is missing or is not an email address. The general mailbox later is a one-row `update` on `flabed.chat_settings`, not a redeploy. `NOTIFY_TO` itself and `marion-notify` are untouched (the two-approval rule of 2026-07-13 still covers them). The hand-off subject now names the lane counts ("… - 2 to quote, 1 stocked"); the response carries `sent_to_domain`. Verified live: hand-offs b67163b4, c62a7a9b (direct) and ec059acf (from the bubble on markets/mining.html) → `emailed: true, sent_to_domain: sealsonline.com`, rows in `flabed.chat_handoffs` with lines and transcript. Data: `insert into flabed.chat_settings (key, value) values ('handoff_to', 'd.anderson@sealsonline.com')`. No DDL.
- **Front end (fluidseal-mockup repo)**: `chat.html` build 2026-09-30.2 — header and footer follow the brand guidelines (hub brand.md: Fluidseal Black #231F20 with the 4 px Fluidseal Yellow #FFDD00 line, wordmark white + yellow, Helvetica Neue stack, ASK MARION as a yellow button with black extra-bold text; footer with the Edmonton and Calgary company blocks), the page's yellow moved to #FFDD00; `?embed=1` renders the chat alone (greeting + four example questions) for the bubble; the thread, the part index and the basket persist in sessionStorage so a reload or a page-to-page move keeps the conversation; the `.1` upload briefly dropped the minimum-order hook (`assets/min-order.js`, other session, 19:12 UTC) — restored in `.2` seven minutes later. New `assets/ask-marion.js`: yellow bubble bottom-right, 420 × 680 px panel (full screen under 600 px) with an iframe on `chat.html?embed=1`, loaded on first open only, open state remembered per tab; one `<script src="assets/ask-marion.js" defer>` tag before `</body>` on index.html, markets.html, markets/mining.html, oil-gas.html, construction.html, fluid-power.html (every new market page needs the tag). Blob SHAs = local `git hash-object`: chat.html fff03709, ask-marion.js b02d5da6, index 7b8cb44e, markets 9f7c0fac, mining 81088c3e, oil-gas 8d53ed8e, construction ae353220, fluid-power eeedc419.
- Board (SSG Website Open Items) v18: items 45 and 47 done, item 51 / Q34 (brand chrome site-wide?) open. Records: hub CHANGELOG + projects.md, project doc `claude/session-2026-09-30-ask-marion-follow-ups.md`, Drive Learnings DECISIONS + HANDOFF.

---

## 2026-09-30 — ABQUOTE TRAINING HANDOFF (docs only, no build change) — HANDOFF-ABQUOTE-TRAINING.md §10

**Files:** `HANDOFF-ABQUOTE-TRAINING.md` (blob 17a585c3, commit 80b31dea) — new section 10: state at handoff (history first live on build 2026-09-28.4, `history_lookup` v2, held-out score 39% → 78% → 92%), the kit-by-size invoice headers that landed on 2026-09-30 in `public.invoice_lines` (12,505 `sell_as_kit` headers, 82,081 `parent_invoice_line_id` links, 9,937 write-in headers — returned by history_lookup v2 on a PO / W/O match but not yet read as kit answers: board item 66), and the next pieces in order (run 4 = the five image-only asks through the page's file drop, item 39 WHY rules, item 66 history_lookup v3, item 21 feedback tool, items 64 / 65 ABQUOTE Document Management on the Dynamics side). No code, no migration, `MARION_BUILD` stays 2026-09-28.4.

**Where the full handoff lives:** Drive Claude/Files "2026-09-30 - FLAB - Agent - Quote / Marion - HANDOFF - ABQUOTE training continuation (image-only evaluation set, kit-header history, the two WHY rules, document-management repair)" and project doc `claude/handoff-abquote-training-marion-agent-2026-09-30.md` (customer-level detail stays there, never in this repository). Marion Open Items board v20 (66 items): 64 and 65 new (Document Management repair, David's GO), 66 new (history_lookup v3, David's GO), pointers on 33 and 42. Hub: CHANGELOG line and projects.md Marion row updated the same afternoon.

**Reminder for the next session (CLAUDE-PREFERENCES v63 items 49 and 50):** this file is re-fetched immediately before every push and merged onto the live copy — two entries were lost here to stale concurrent pushes on 2026-09-28; every change to a prompt, rule, matching function or lookup ships with a before-and-after score on the fixed 20-quote held-out set, run through the real quote.html page.

## 2026-09-30 · dynamics-import: the LI-INVOICE gap fill is DONE — 151,960 lines / 28,428 invoices (2026-01-21 → 09-25) in Dynamics; function v18, migrations v11–v14; Supabase invoices / invoice_lines re-synced
- Run 9eb52bff-a50d-41ba-9c49-7637640d64f7 finished 2026-09-30 18:06 UTC (started 2026-09-29 21:00 UTC after David resized the compute; David: "keep the flows off and work through all of the months, keep going"). 146,798 lines created, 458 updated on the 86 pre-existing invoices, 4,704 confirmed unchanged; 28,342 invoices created + 86 updated; net 7,691,732.61 on the new invoices; per-month Dynamics totals match the file to cent rounding; 0 errors left; the nine automations OFF 21:00 → ON 18:12 UTC (verified), no staff invoice lines in the window.
- How it ran: the edge runtime kills an invocation after ~2 s of CPU (multipart $batch bodies), so each call does ONE wave of four parallel 75–100-request $batches (~330 lines) and chains the next call through pg_net; a temporary pg_cron job `dynamics-import-watchdog` (every 2 min → `imports.watchdog(run)`) re-kicked after kills, moved the window to the month of the most recent open invoice (most recent month first), retried transient Dataverse errors (SQL deadlock 1205, "another request is currently using the resource"), and marked the run done. Job created 2026-09-29 21:16 UTC, REMOVED 2026-09-30 18:10 UTC. Throughput 7,500–9,500 lines/hour (a Dataverse changeset costs ~2–3 s; parallel batches, not batch size, set the rate).
- Migrations (imports schema + the logged public.imp_* surface; `public` otherwise untouched): `imports_watchdog_v11` (watchdog, retry_deadlocks, watchdog_log — refined in place, final text in migration/2026-09-30_imports_watchdog_v11_final.sql), `imports_defer_after_timeout_v12` (run_queue.retry_after + public.imp_defer: a timed-out $batch's invoices wait 15 min before they can be fetched again), `imports_unit_retry_v13` (invoice_line_import.needs_uom + retry_unit_errors: "The specified unit is not valid for this product" → retried with the product's default unit), `imports_dead_invocation_deferral_v14` (run_queue.fetched_at, 15-minute run lock, a dead invocation's fetched invoices quarantined 15 min).
- Edge function v10 → v18 (source in migration/dynamics-import/): results persisted after every wave (v10), 429 detection + 170 s batch timeout + wave errors written to the run notes (v11), one wave per call (v12), four parallel batches (v13), max_lines from the run row (v14), Promise.allSettled so a sibling batch's failure keeps the wave's other results (v15), deferral of a timed-out batch's invoices (v16), default-unit fallback per product (v17), 75-request batches (v18).
- **12 duplicate invoice pairs** were created by two race conditions before v16 / v14 closed them (August 6141189/90/91/92/94/96 ship 1; June 7169628-1/-2, 7169630-1/-2, 7169633-1, 7169635-1) — the only pairs in a sweep of all 28,354 invoices created by the load; the first-created copies are listed for deletion (Marion board item 63, David's go pending).
- Supabase mirror: `dynamics-sync` re-run by createdon windows (16 × 90 min for invoice_lines, 4 × 6 h for invoices over 2026-09-29 18:55 → 09-30 19:25 UTC, plus January 2026 windows for the 51 pre-existing invoices whose lines were patched). `public.invoice_lines` 178,099 → 329,565 rows, newest invoice_date 2026-09-25; `public.invoices` 35,878 → 64,234. Linked kit components carry the per-kit `quantity` and the total in `quantity_kit` (board item 55).
- Project doc `claude/import-tool-analysis-2026-09-28.md` §13.12–13.13; Marion Open Items board v17 (items 54 and 62 done, 63 added).
- **Duplicates DELETED 2026-09-30 20:42–20:43 UTC** (David: "delete"): the 12 first-created copies removed from Dynamics by Web API DELETE as Sales Bot (12 × 204; the Dataverse MCP connector's delete_record hung twice at 180 s without deleting, so the function got a `delete_invoices` action — v19, source in migration/dynamics-import/), and their 12 `public.invoices` / 36 `public.invoice_lines` mirror rows deleted by id (`dynamics-sync` upserts only, it never deletes). Verified: Dynamics 28,342 invoices created by the load, no order + ship pair with more than one invoice; mirror 64,222 invoices / 329,529 lines, no duplicate pair; noted on the run row. Board item 63 done (v18).
- Handoff for the next P21 export written: `HANDOFF-P21-DYNAMICS-IMPORT.md` (this repo, beside NEXT-SESSION-HANDOFF.md), project doc `claude/handoff-p21-dynamics-import-2026-09-30.md`, Google Doc Claude/Files "2026-09-30 - FLAB - Agent - Quote / Marion & Customer Discovery - HANDOFF - P21 invoice-line import (next export)" — opening message, pipeline, first steps, review-and-approvals list (board items 41, 43, 47, 48, 55). Board item 44 (data gap) closed by the gap fill; project doc §13.14 (runbook).

## 2026-09-30 · Dynamics 365 / SharePoint project — PAYABLES: approval layer + SharePoint job queue — migrations `ap_approvals_v1` / `v1b_invoice_only`, `ap_sharepoint_jobs_v1` / `v1b_query2_alias`, `ap_docs_admin_delete_policy`; edge function `ap-packet` v1 → v4 (`public` tables / `archive` / `xpress` / `flabed` / `hr` / `imports` / `ws_*` / `dynamics-sync` untouched)
- **`ap_approvals_v1`** (schema `ap` + new `public.ap_*2` / `ap_packet_*` functions only): `ap.document.kind` check gains `intercompany`; new columns approval_no (unique partial index), approved_by / at, second_required / reason / requested_at / by / at, packet_path / version / built_at / error, sharepoint_url / item_id, montreal_status, entered_at / by, returned_reason, archived_at, archive_url; table `ap.approval_counter(yr, n)`; settings second_approval_pct 20, second_approval_min_invoices 3, price_watch_pct 10, packet_auto true, sharepoint_enabled false, approval_prefix "AP"; helpers `ap.total_cad`, `ap.vendor_usual(code, exclude)` (avg CAD of the vendor's invoices, 12 months), `ap.second_check(id)`, `ap.next_approval_no(id)` (AP-<vendor code | first 5 letters of the name | XXXXX>-YYYY-nnnnnn), view `ap.v_price_watch` (line vs the previous invoice line, same vendor + normalised item + currency), `ap.expense_type(desc)`; `ap.ingest` patched in place (pg_get_functiondef + replace: kind list, `source` 'mailbox'); `ap.mailbox_kind` recognises RB intercompany first; triggers `ap.document_before` (intercompany normalisation → status filed; on approved: refuses an invoice needing a second approval without second_at, assigns the approval number, approved_by / at; on entered / paid: entered fields + montreal_status) and `ap.document_after` (pg_net → ap-packet build on approved when packet_auto; archive on entered when sharepoint_enabled); `public.ap_packet_call(jsonb)` (service_role, the `ws_compare_call` pattern → `/functions/v1/ap-packet`), `public.ap_packet_get(uuid)` / `ap_packet_set(uuid, jsonb)` (service_role), **`public.ap_query2(view, args)`** (approval, second_queue, price_watch, intercompany, packets) and **`public.ap_mutate2(action, args)`** (approve with the second-approval rule / admin as_second, second_approve, second_decline, build_packet, set_montreal) — SECURITY DEFINER, authenticated + service_role, `ap.is_viewer()` on every call; the v1 `ap_query` / `ap_mutate` untouched. Existing RB paperwork reclassified to intercompany by the trigger.
- **`ap_approvals_v1b_invoice_only`**: approval numbers and the packet build only for kinds invoice / credit (a packing list marked Approved keeps the status, no number); the test approval on the Wonyoung packing list undone; `ap.approval_counter` reset to 0.
- **`ap_sharepoint_jobs_v1`** (+ `v1b` alias fix in `ap_query2` intercompany): table **`ap.sp_job`** (RLS on, no grants; kind packet / fields / archive_file / archive_manifest, library Approvals / Originals, folder YYYY/MM/<vendor>, storage_path, fields jsonb, item_id, status queued / sent / done / failed, attempts, error, web_url); setting `sharepoint` {site_url https://fluidseal.sharepoint.com/sites/PayablesAB, approvals, originals}; `ap.sp_fields(document)` (SharePoint column map: ApprovalNo, Vendor, InvoiceNo, InvoiceDate, Amount, Currency, PO, ApprovedBy, ApprovedOn, MontrealStatus, Voucher, RecordId, Kind), `ap.sp_enabled()`, `ap.sp_folder()`, `ap.sp_enqueue(...)` (dedupes open jobs); `ap_packet_set` queues the packet job when sharepoint_enabled; service_role RPCs **`public.ap_sp_jobs(jsonb)`** (hand out queued jobs → sent, re-hand after 20 min, fail after 5 attempts), **`ap_sp_job_done(jsonb)`** (packet → sharepoint_url / item id / montreal_status to_enter; archive_manifest → archive_url + archived_at; failures re-queued or failed + event), **`ap_sp_modified(jsonb)`** (Approvals row changed: Entered → status entered + voucher, Paid, Returned → exception with reason; `set_config('ap.from_sharepoint')` stops the trigger echoing), **`ap_sp_archive(jsonb)`** (one job per original + manifest); `ap.document_after` also queues a `fields` job on dashboard-side Montreal changes when the row exists in SharePoint; `ap_query2` gains `sharepoint` + job counts on `packets` / `approval`; `ap_mutate2` gains `sp_retry` (admin) and `sp_file`.
- **`ap_docs_admin_delete_policy`**: `storage.objects` policy `ap_docs_admin_delete` — DELETE for authenticated where bucket `ap-docs` and `ap.is_admin()` (test packets and wrong uploads can be removed from the page; SQL still cannot delete objects).
- **Edge function `ap-packet` v4** (`verify_jwt` off, `x-inbound-token` check; files `index.ts` + `cover.ts`, npm:pdf-lib 1.17.1): `build` — `ap_packet_get` → bilingual cover sheet (yellow APPROVED / APPROUVÉ band, approval number, approver; P21 entry slip; lines-and-match table; auto-notes; approval block; Montreal instruction) + the source pages (a file referenced by more than one record goes in whole, once) → `ap-docs/packets/<year>/<AP-no> v<n> <vendor> <invoice>.pdf` → `ap_packet_set`; `archive` — SHA-256 manifest.json to `ap-docs/archive/<year>/<AP-no>/` + `ap_sp_archive`; `jobs` — queued jobs with 15-minute signed URLs (for the Power Automate flow); `job_done`; `sp_modified`. v1–v3 were the Graph-upload drafts (Graph code removed in v4: SharePoint runs through a flow on crmadmin's connection; no app registration).
- Power Automate side (not Supabase): flow "AI-Payables - packets and archives → SharePoint (Payables - AB)" (workflow 70c05281-f9bc-f111-aaaf-3833c5dc2d2f, draft) polls `ap-packet` every 5 min; the mailbox flow calls `ap-mailbox` after each email (real-time; the 8 AM cron stays as catch-up). Tests: a synthetic invoice went approve → AP-CLAUD-2026-000001 → packet → entered → deleted; test objects removed from `ap-docs` through the new delete policy; counter 0. Record: Dynamics 365 project doc `claude/payables-approvals-packets-sharepoint-build-2026-09-30.md`.

## 2026-09-30 · Dynamics 365 / SharePoint project — PAYABLES: ABpayables mailbox feed — migrations `ap_mailbox_v1` / `v1b` / `v1c`, edge function `ap-mailbox` v1, `ap-extract` v2 → v3, pg_cron `ap-mailbox-daily` (`public` tables / `archive` / `xpress` / `flabed` / `hr` / `imports` / `ws_*` / `dynamics-sync` untouched)
- **`ap_mailbox_v1`**: `ap.mailbox_kind(from, subject, has_pdf)`, `ap.mailbox_docnum(subject)`, `ap.mailbox_vendor(from)` (P21 code by `ap.vendor.email_domains`, then by earlier `ap.document` senders of the same domain); **`public.ap_mailbox_ingest(jsonb)`** (SECURITY DEFINER, service_role only — inserts `ap.upload` rows for the stored files, creates the index document through `ap.ingest` with source `mailbox index YYYY-MM-DD`, dedupes on `extracted->>'message_id'`, marks extra files attached); **`public.ap_mailbox_call(jsonb)`** (SECURITY DEFINER, service_role only; pg_net POST to `/functions/v1/ap-mailbox` with `ws_config.inbound_token`, timeout 150 s — the `ws_compare_call` pattern); `ap.setting` rows `mailbox_extract`, `mailbox_feed`; **pg_cron job `ap-mailbox-daily`** `0 14 * * *` → `select public.ap_mailbox_call('{"limit":200}')`. `v1b`: uploads inserted as `uploaded` (the check constraint allows uploaded / extracting / done / failed). `v1c`: document-number regex accepts a dash after the letter prefix (TV-90001).
- **Edge function `ap-mailbox` v1** (`verify_jwt` off, `x-inbound-token` check like `ws-inbound`): reads `public.ws_inbox` rows with `to_addr` abpayables@sealsonline.com and status `received`, writes attachments to bucket `ap-docs/mailbox/…` (service role), converts .XLS/.XLSX/.CSV to text (npm:xlsx 0.18.5), calls `ap_mailbox_ingest`, then `ap-extract` with `merge_into`; marks rows processed / error; summary in `ws_config.ap_mailbox_last_run` (upsert — a new `ws_config` key). Source: Dynamics 365 project doc `claude/payables-mailbox-feed-and-process-map-2026-09-30.md`.
- **Edge function `ap-extract` v2 → v3** (`verify_jwt` on, unchanged for the page): a caller whose Bearer equals the service-role key skips the `ap_whoami` allow-list check; `body.created_by` and `body.source = "mailbox"` are honoured for that caller only.
- Power Automate side (not Supabase): flow `AI-Intake - ABpayables → ws-inbound (payables dashboard feed)` posts every new ABpayables email to `ws-inbound` (function unchanged, v1). Test: one synthetic `ws_inbox` row went through the whole chain and was removed; a 1.8 KB test object `mailbox/2026-09/200b3e2b-TV-90001.pdf` remains in `ap-docs` (SQL cannot delete storage objects).

## 2026-09-29 · Dynamics 365 / SharePoint project — PAYABLES DASHBOARD: new schema `ap` + `public.ap_*` gated surface + bucket `ap-docs` + edge function `ap-extract` v1 → v2 (`public` tables / `archive` / `xpress` / `flabed` / `hr` / `imports` / `dynamics-sync` untouched)
- **Schema `ap`** (payables.fluidsealab.com; NOT exposed on the Data API; default-deny RLS on every table, no policies). Migration `ap_schema_v1`: tables `ap.portal_access` (email allow-list, role user / admin), `ap.setting`, `ap.vendor` (3,132 P21 vendor codes copied from `public.vendor_code` — read only), `ap.upload`, `ap.document` (kinds invoice / credit / packing_list / statement / reminder / brokerage / freight / overhead / order_confirmation / quote / other; statuses new / matched / exception / approved / entered / disputed / paid / filed), `ap.document_line`, `ap.receipt`, `ap.receipt_line`, `ap.po_line` (empty — for a later purchase-order feed), `ap.match`, `ap.note`, `ap.event`; helpers `ap.is_viewer()`, `ap.is_admin()`, `ap.me_name()`, `ap.log()`, `ap.setting_num()`; `grant usage on schema ap to authenticated, service_role` (no table grants to authenticated); storage bucket **`ap-docs`** (private, 32 MB, PDF / JPG / PNG / XLS / XLSX / CSV) with `storage.objects` policies `ap_docs_upload` / `ap_docs_read` (viewers only, this bucket only); seeds (settings tolerance_pct 2, tolerance_amt 5, p21_exch_rate 1.4029, waiting_days 7; allow-list David ×2 admin, Shelby, Cindy, Trevor).
- **Match + ingest** — `ap_match_and_ingest_v1`, `ap_ingest_v1b_kind_variable`, `ap_run_match_v1b_safeupdate`, `ap_v1d_match_fallback_merge_attach`: `ap.norm_item / num / dt / txt / arr / intarr`, `ap.resolve_vendor(code, name, pos)`, `ap.run_match(document_id | null)` (PO + normalised item or vendor item → receipt lines, one per document kind, exact-qty candidate wins, fallback PO + qty when exactly one unmatched line fits; statuses ok / qty_over / qty_short / price_above / price_below / no_receipt; exception needs BOTH > tolerance_pct AND > tolerance_amt; doc status rolls up only within new / matched / exception), `ap.link_lines`, `ap.ingest(jsonb, by)` (documents + receipts JSON → tables; `merge_into` fills an existing record; receipts already on file skipped but get the file attached), `ap.attach_file(...)`. Fact: **pg-safeupdate is on for the API roles** — `delete from _cand` inside `run_match` failed with "DELETE requires a WHERE clause" when called through PostgREST (service role) though it ran from the SQL connector; fixed as `delete from _cand where true`.
- **Public surface** — `ap_public_rpc_v1`, `ap_query_v1b_document_receipts_fix`, `ap_mutate_v1b_attach_file`, `ap_helpers_search_path_v1c`: `public.ap_whoami()`, `public.ap_query(p_view text, p_args jsonb)`, `public.ap_mutate(p_action text, p_args jsonb)` — SECURITY DEFINER, `set search_path = pg_catalog, pg_temp`-hardened helpers, EXECUTE revoked from anon / public and granted to `authenticated` + `service_role`, every call checks `ap.is_viewer()` (admin-only actions check `ap.is_admin()`); `public.ap_ingest(jsonb)`, `public.ap_upload_status(uuid, text, text, text)`, `public.ap_upload_get(uuid)` — `service_role` only (the edge function). Verified: anon has no EXECUTE on any `ap_*` function and no privilege on the `ap` schema or tables. These are NEW functions in `public` with the `ap_` prefix (additive, the same pattern as `hr_*` / `imp_*` / `ws_*`) — nothing existing in `public` altered.
- **Edge function `ap-extract`** v1 → **v2** (`verify_jwt` ON): checks the caller is a viewer (`ap_whoami` under the caller's JWT), downloads the upload with the service role, calls the Anthropic Messages API (`claude-sonnet-4-6`, override with secret `AP_EXTRACT_MODEL`; `ANTHROPIC_API_KEY` from the project secrets) with the PDF as a document block / image / converted spreadsheet text, strict JSON schema documents[] + receipts[], lands it through `public.ap_ingest`; v2 adds `merge_into` and the prompt rule that cross-references the P21 MATERIAL RECEIVING DOCUMENT's ITEM into the vendor line. CORS origins https + http payables.fluidsealab.com (the http origin comes out when HTTPS is enforced).
- Data loaded through `ap.ingest` (DML in `ap` only): the 09/25–09/29 receiving packet (21 receipts / 46 lines), its documents, and a 49-row ABpayables Inbox index. Security advisors after the build: only the by-design lines (RLS enabled without policy on the 12 `ap` tables; definer functions executable by authenticated — same shape as `hr`). Record: Dynamics 365 project doc `claude/payables-dashboard-build-2026-09-29.md`.

## 2026-09-29 · SSG Website — "Ask Marion" website chat: `flabed` chat tables + `marion-chat` v11 website channel (`public` / `archive` / `xpress` / `hr` untouched)
- **Edge function `marion-chat` v10 → v11**, deployed with `verify_jwt` OFF (the staff path still requires a signed-in user itself — `getUser()` → 401 as before). New second front door `body.channel === "website"`: no Supabase user; tools run as the **anon** role (search_products / match_parts / find_cross_refs directly, get_stock / get_part_specs / explode_kit_public / oem_prefixes through the `flabed.site_*` SECURITY DEFINER wrappers, plus the new `flabed.find_equipment`); rule set from `flabed.chat_rules` (customer audience) instead of `ai_rules`; per-turn quota (`flabed.chat_quota`: monthly USD cap 100, 20 messages a session a day, 60 an IP a day, from `flabed.chat_settings`); every turn logged to `flabed.chat_sessions` / `chat_messages` with token usage and a USD cost estimate; actions `feedback` (thumbs, `chat_messages.vote`) and `handoff` (quote request → `flabed.chat_handoffs` + email to `NOTIFY_TO` through the same SMTP secrets marion-notify uses — recipient unchanged). CORS allow-list gains mockup.fluidsealab.com, fluidsealab.com, www.fluidsealab.com. The staff path is the v10 code unchanged (TOOLS, runTool, buildSystemPrompt and the handler body verified identical; only the JSON body is parsed before the auth check so the channel can be routed). Source: SSG Website project doc `claude/website-chat/marion-chat-v11.ts`.
- **Migrations (all in `flabed`)**: `flabed_website_chat_v1` — tables `chat_settings`, `chat_sessions`, `chat_messages`, `chat_handoffs`, `chat_rules` (RLS on; service_role writes; staff read via `public.is_staff()`), function `chat_quota(text,text)` (service_role only), wrappers `site_get_stock`, `site_get_part_specs`, `site_kit_components`, `site_oem_prefixes` (EXECUTE anon/authenticated/service_role; they call the `public.*` functions as owner postgres — no grants changed in `public`), `find_equipment(text,int)` over `flabed.equipment_models` / `equipment_fitments` / `oem_brands` + `public.products` list prices + `public.bom_lines` component counts; `flabed_website_chat_v1b_find_equipment_oem_hint` (fix: "Cat D8R" = OEM hint + model); `flabed_website_chat_v1c_service_role_grants` (usage/all grants for service_role — the first live call failed with "permission denied for table chat_sessions").
- **Why no Supabase anonymous sign-ins**: `public.handle_new_user()` inserts `profiles.is_staff = new.email ilike '%@fluidsealab.com'`, which is NULL for an anonymous user (no email) into a NOT NULL column — every anonymous sign-in would fail at the trigger. Hard rule 3 forbids touching that trigger from another project, so the website channel runs with no user at all. Sign-in for account prices is a later phase.
- **Front end**: `chat.html` on mockup.fluidsealab.com (fluidseal-mockup repo, build 2026-09-29.2) — chat-first page on the site chrome, cards from the function's `_tool_results`, one basket with two lanes (In stock → cart, made to order / no price → quote), quote request form → `handoff`, thumbs → `feedback`. Live-tested 2026-09-29: Cat D8R → 11 kits, kit explode, quote request emailed (`chat_handoffs` 5ef83ae5…), vote stored; about US$0.02–0.03 a turn, 12–19 s a turn.
- Facts for every project: `execute_sql` can `set local role anon;` to test what the anon role may execute; `public.get_my_cart_prices` returns nothing without `auth.uid()`; `get_stock` returns availability labels per warehouse, never counts; anon can EXECUTE search_products / match_parts / find_cross_refs / link_for_part but not get_stock / get_part_specs / explode_kit_public / get_my_cart_prices / lookup_customer_part.

---

## 2026-09-29 · SSG Website — Markets / Fluid Power rows in `flabed` (DML only, no DDL; `public` / `archive` / `xpress` / `hr` untouched)
- `flabed.markets` id 11 (`fluid-power`): `is_built` = true, `hero_image` = the live market page's hero (`cms.sealsonline.com/uploads/shutterstock_284598_324d80a204.jpg`), `intro` = the live intro text plus one sentence pointing at the cylinder explorer. `live_url` unchanged.
- `flabed.market_groups`: 20 rows for market 11, in the order of the page's product band — piston seals (groups 17 inch / 23 metric), rod seals (15 / 21), rod wipers (14 / 20), guiding elements (19 / 25), symmetrical seals (16 / 22), vee packings (18 / 24), shaft seals 31, O'Rings 4, O'Ring Kits 1, hardened steel bushings 11, self-lubricated bearings 13 (SBB), retaining rings 10, weld-on ports 7, OEM kits & parts 5; `note` = the profile codes shown on the page, `sort_order` 0–13. No `market_oems` / `market_equipment` rows: the page is organised by cylinder position, not by machine (the 11 OEM tiles link to live categories — all 11 checked, category pages with subcategories).
- Page data was READ from `flabed.profiles` (269 live profile pages), `flabed.groups`, `flabed.items`, `flabed.oem_brands` (OEM part counts), `public.products` (4,252 rows for the profile part numbers — list prices, dimensions, compound) and `public.invoice_lines` (Mar 2025 – Jan 2026, pulled one month at a time; only rank 1 / 2 reaches the page). No writes outside `flabed`.
- **Incident note:** the `public.invoice_lines` pulls from this chat ran 20:03–20:30 UTC — the same window as the dynamics-import classify above, so this was the "another chat scanning `public.invoice_lines`". Statement timeouts and "database system is shutting down" were seen here every minute until the restart. Lesson taken into the SSG Website handoff: read this file for a running load before any full-table read, and no full-table work on the instance during business hours.
- Data finding, NOT changed: `flabed.oem_brands` prefix RPH "Parker Hannifin" has `live_site_slug` = `p-h` (P & H); the Fluid Power page links Parker to `oem-kits-parts/industrial-seal-kits-parts/parker` (live, verified). On the SSG Website board for David.

## 2026-09-29 · dynamics-import: full LI-INVOICE file staged (151,960 lines / 28,428 invoices), two-month test load started and PAUSED — the Micro instance ran out of disk IO and PostgREST went down; function v6 → v9, migrations v5 → v10
- Staging (run 9eb52bff-a50d-41ba-9c49-7637640d64f7, credit rule `sale`): the file from Dropbox (23,573,520 bytes, content hash identical to the reviewed copy) ingested in 25 s; `imports.classify` timed out on 189k rows and was run step by step, then rewritten. Migrations, all in `imports` unless noted: `imports_classify_indexes_v5` (indexes for the credit lookup — mostly dropped again in v6b), `imports_classify_scale_v6` (kit grouping / kit quantities as window passes joined on the primary key), `imports_classify_scale_v6b_fillfactor` (five indexes kept, fillfactor 50 so the classify updates stay HOT), `imports_classify_scale_v6c` (classify: one grouped dedupe join, remap without self-join, ANALYZE inside, Q9 park rule — lines whose customer code has no account are `parked`), `imports_public_rpc_chain_v7` (`public.imp_chain`: the function queues its own next invocation through pg_net), `imports_run_lock_and_longer_timeout_v8` (`import_run.lock_until` run lock in `imp_fetch_batch` / cleared by `imp_log_batch` and `imp_set_run`; `imports.call_import` timeout 390 s), `imports_run_queue_low_io_v9` (`imports.run_queue` — one row per invoice — drives `imp_fetch_batch`; `imp_inventory_pairs` / `imp_inventory_upsert` limited to the fetched invoices via `p_keys`; `imp_run_status` counts from the queue; nothing scans the staging table any more), `imports_public_rpc_queue_rows_v10` (`public.imp_queue_rows` for the function's `queue` action). Two `drop function` + recreate on `public.imp_fetch_batch` and `public.imp_inventory_pairs` / `imp_inventory_upsert` (new optional parameters). `public` otherwise untouched.
- Edge function `dynamics-import` v6 (chain + window-aware completion), v7 (250-request $batches, three in parallel, 250 s budget, run lock, 409 busy), v8 (inventory lookups by invoice keys), v9 (`queue` action: builds `imports.run_queue` from the FILE — same keep rules as classify — so the queue costs no table scan). Source in `migration/dynamics-import/` (v9).
- Load (David: "Go most recent to oldest, do 2 months now as further test"): September 2026 window, nine automations off 19:01–20:11 UTC. 149 invoices / 775 lines created in Dynamics as Sales Bot (net 56,414.03); staging logged 50 invoices / 374 lines (batches 1–4), batch 5's results were lost when the database stalled — they reconcile as "unchanged" on resume (existing-invoice check by order + ship; run lock). No staff invoice lines in the window.
- **Incident:** the Micro instance (224 MB shared buffers) spent its disk IO budget on the classify; a 150 MB scan takes minutes; at 20:07–20:12 UTC PostgREST could not reload its schema cache ("Could not query the database for the schema cache. Retrying." — its `pg_timezone_names` read crawls), so every REST client (Marion, Xpress, flabed, HR) failed; another chat was scanning `public.invoice_lines` at the same time. Load paused (`import_run.status = paused`), automations back ON and verified, David asked to decide the compute add-on (Marion board item 62). Lesson for every project: no full-table work on this instance during business hours; one chat at a time on the database.
- `dynamics-sync` note stands (createdon key; board item 41). Marion Open Items board v16 (items 54, 62); project doc `claude/import-tool-analysis-2026-09-28.md` §13.11.

## 2026-09-28 · HISTORY FIRST LIVE (ABQUOTE board item 40) — `public.history_lookup` v1→v2, quote.html builds 2026-09-28.1 → .4, evaluation run 3: 39% → 78% → **92%**; Marion AI credit outage (23:20–00:20 UTC) fixed by David
- ⚠ CONCURRENCY: this entry and the SOURCE IT entry below were each wiped once today by pushes made from a stale copy of this file (pushes at ~23:0x and ~01:0x UTC). Both are restored here. Re-read this file immediately before every push, not at the start of the session.
- Decision tree (David, 2026-09-28): 1 this customer's history (heaviest — what was decided before wins), 2 what other customers bought for the same ask, 3 catalog, 4 stock, 5 price. Steps 3–5 were live; steps 1–2 are now live.
- DB (Supabase hnmbjqhxvxakhdzgetxw, `public`, protocol followed): migrations `abquote_history_lookup_v1`, `…_v1_fix_variable_conflict`, `…_v1_name_prefix_and_dedupe`, `…_v2_reference_tokens_only` → `public.history_lookup(p_customer, p_ask, p_limit=12, p_exclude=null)` returns (scope, source, match_kind, matched_on, ref_no, ref_date, ref_lines, item_code, description, qty, times, kit_code). SECURITY DEFINER, STABLE, empty unless `is_staff()`, execute → authenticated. READ-ONLY over training_quotes / training_quote_lines, invoices / invoice_lines (qty = coalesce(quantity_kit, quantity), board item 55) and bom_lines — no new tables, nothing imported; the invoice tables stay with the dynamics-sync / dynamics-import sessions.
- v2 lesson (run 3 found it): v1 tokenised dimensions (`2.000"`, `0.875"`, `146.84MM`) as references, so a Caterpillar lock nut quoted with "2.000\"" in its description became Empire's "previous decision" for a 0.875 × 2.000 cylinder kit (conf high). v2 tokens are reference-like only — letter+digit codes with 4+ alphanumerics, 5+-digit numbers (PO / W/O), dash o-ring numbers (2-248); decimals, inch marks and MM sizes never match; matches are whole-token, item-code matches equality (prefix only for letter+digit codes and dash numbers).
- quote-app-2.js `crossRefCart` step 0 HISTORY FIRST (.1, blob 7bc9435f) → .3 (e72f81f7): a customer-history row naming the part the rules already produced is a CONFIRMATION (conf high, "History confirms: …", also clears the echo guard); a one-line PO / W/O hit may replace a rule-built guess unless it is already high; a ref / ask token hit only fills an EMPTY part number ("History suggests X — Review" otherwise); multi-line PO / W/O listed in the note (kit fingerprint sets the kit code); other customers' code bought ≥2× proposed. Review modal shows green "History · this customer / other customers · source ref date ×times kit" chips. `callMarion`: shows the upstream API error text in the status line (.2), recovers JSON with `//` comment lines / trailing commas (.2), max_tokens 3900 → 8000 (.3, a two-kit list hit the cap), and takes the LAST `{"intent"` object when the model reasons in prose before its JSON (.4, blob d13057ec). quote-app-3.js MARION_BUILD 2026-09-28.4 (dd161f84), quote.html `?v=` ×3 (a4f83ee6); sourcing-panel.js tag kept. All blob-verified.
- ai_rules: new id 48 (consistency, sort 62: compact one-line JSON, no comments / trailing commas, notes ≤160 chars, the reply is the JSON and nothing else); id 30 CYLINDER KIT MODE narrowed — a list of FLUIDSEAL catalog codes with quantities is quoted as those codes, and a list repeated for several kit numbers is quoted ONCE (qty as listed, kit numbers in ref) — this is the answer the ground truth gives to WHY question 1; new id 49 `customer:6NORFL` (Northstar: distributor writing Fluidseal codes — 131 part lines vs 5 kit lines in history; RE prefix = their polypak prefix).
- OUTAGE 23:20 → ~00:20 UTC: Anthropic "Your credit balance is too low" on the key behind `ANTHROPIC_API_KEY` — every marion-chat call 400, Analyze fell back to the offline parser. David added credit (board item 56 closed). Build .2+ shows the real reason in the status line; consider auto-reload on the Anthropic console.
- EVALUATION RUN 3 FINAL (build .4, history v2, the 20 held-out quote numbers excluded from history; 15 text-evaluable quotes / 36 lines; David's Chrome, real page functions): **exact 33 of 36 (92%)** — run 1 14 (39%), run 2 28 (78%); wrong lines 34 → 13 → **2**; prose / parse failures 4 → 0 → 0; history touched 14 lines, 13 right, 1 wrong; 0 of the 15 needed the offline parser. Now right that were wrong in run 2: Norcan RPH-RG2AHL0101 (padding rule), Control Flow W2040000750 (verbatim rule), High Mark RPH-RK0600K000 (accumulator rule, no false history), Hydraco IT-KIT-4PC, Northstar 6 of 7 as ONE set of 7 lines (was 14 lines). Remaining 3 misses: Northstar 31204500-375B-AER (history says it was once quoted as `*RE31204500-375` — what is -AER? WHY question 2), Lash "326 BACK-UP" quoted as 8-326/N90 but Fluidseal left it off (WHY question 4), RHK "63551 Seal Kit" and Accurate "old PO 106447" (their only history IS the held-out quote / a component-only invoice — both resolve in production: history_lookup returns `1.375"ROD X 2.000"BORE` for 63551 and the 8 invoice lines for PO 106447). Image-only asks (Hawk, Wajax, Hardchrome, Lee, Absolute) unchanged — UI run with their .msg files is the next set.
- Kit fingerprint coverage (board item 42, measured): whole-invoice exact match resolves 289 of 23,843 multi-line invoices (1.2%, 113 ambiguous); a subset match (kit set ⊆ invoice lines, kits with 3+ components) would reach 1,993 of 18,538 invoices with 3+ lines (10.8%). Most kits were invoiced as kit-by-size write-in lines, which the January import dropped — keeping them (import session, item 50) is what makes invoice history kit-aware; subset matching goes in when those lines land.
- Per-quote detail (customer names, so not here): project doc `claude/abquote-learnings-and-candidate-rules-2026-09-26.md` §9.

## 2026-09-28 · CORRECTION — ERP GET method IS persisted to Opportunity Lines (verified live)
- Corrects today’s earlier entry (and the LifeOS deposit’s proposed item #35),
  which relied on D365-AB #6477’s Pending Approval state and its 2025-09-24
  comment. David’s challenge (“you can’t just go off a ticket”) held: live
  Dataverse verification (dynamics-fields metadata + dynamics-probe fill rates,
  via the sync app registration) shows opportunityproduct HAS ab_getmethod
  (“Get Method”) and it is FILLED on 92.7% of the most recent 2,000 opportunity
  lines — Transfer 1,502 · Purchase 211 · Assembly 137 · Machining 4. The
  cart → flow → Opportunity Line persistence works in production; #8355 BUG-01
  is fixed there.
- Still genuinely open (narrowed #35): quotedetail and salesorderdetail have NO
  get-method field — the Opportunity → Quote → Order line propagation David
  specified on #6477 (2025-09-10) is not built. David to decide whether that
  slice is still wanted; #6477 itself should be annotated/closed to match
  production reality.
- LESSON (now a project preference): tickets and their comments are claims,
  not evidence — verify against the live system before reporting state.

## 2026-09-28 · SSG Website — Markets / Construction rows in `flabed` (DML only, no DDL; `public` / `archive` / `xpress` / `hr` untouched)
- `flabed.markets` id 8 (`construction`): `is_built` = true, `hero_image` and `intro` set from the live market page.
- `flabed.market_oems`: 9 rows for market 8 — Caterpillar, John Deere, Case (J.I. Case kits), Komatsu, Hitachi, Kobelco, Bobcat, JCB, Volvo (Volvo-Michigan-Euclid) — each pointing at its live `.../mobile-equipment-seal-kits/<oem>/<oem>-kits` category (all verified 200).
- `flabed.market_equipment`: 12 rows for market 8 — Caterpillar D7R (Dozer), D8R (Dozer), 140H (Motor Grader), 436C (Backhoe Loader), 966F (Wheel Loader), 320B (Excavator), 953C (Track Loader); John Deere 650G (Crawler Dozer), 710D (Backhoe Loader); Case 580K (Backhoe Loader); Hitachi ZX200 (Excavator); Komatsu PC200LC-3 (Excavator). `order_form_url` null (no PDF forms for this market), `part_categories` = Seal Kit · Hardened Bearings · Spherical Bearings · Ball Stud Kits · High-Performance Replacements.
- `flabed.market_groups`: 17 rows for market 8, copied from the Mining set (same group ids) with construction notes.
- `flabed.equipment_models.market_equipment_id` set on the 12 main models (ids 465, 470, 277, 127, 538, 180, 422, 825, 874, 759, 622, 1132) → the new market_equipment rows. No other rows touched.
- Page data was READ from `flabed.equipment_fitments` (79 models, 1,410 fitments), `flabed.v_kit_components` (2,614 rows for 317 kits), `flabed.v_oem_part_sales` (rank only reaches the page) and `public.products` (kit list prices) — no writes outside `flabed`.

## 2026-09-28 · bom_lines sync restored — root cause: delta_nightly statement timeout
- Marion Open Items #4 root-caused: cron `delta-nightly` (09:00 UTC) died at
  09:02 every night — the session's 2-minute statement_timeout killed
  delta_nightly() at pg_sleep(20) (7 tables × 20s = 140s). It broke on
  2026-07-29, the day bom_lines was added as the 7th table; bom_lines, last in
  the loop, was never reached again (cron.job_run_details jobid 9).
- DB migration `delta_nightly_statement_timeout_fix`: function-level
  statement_timeout 6min; loop ordered by last_run_at (most-starved first).
- Second fault: the idle delta token EXPIRED (Dataverse 0x80044352 "perform a
  full sync"). DB migration `bom_lines_reinit_after_expired_delta`: temp cron
  `bom-reinit-temp` (*/2 min) ticks dynamics-bom?mode=init until the delta
  link re-establishes, then purges rows deleted in Dynamics since July, runs
  bom_fill_part_numbers(), logs "REINIT COMPLETE" to sync_log and unschedules
  itself (4-hour safety valve). First init page verified (5,000 rows).
- Verify tomorrow: the 2026-09-29 09:00 UTC delta run should show all 7 tables
  in sync_log, bom_lines included — then close Open Items #4.
- BR-11 invoice-history price check stays ON HOLD (David 2026-09-28): invoice
  lines are being uploaded over the next days; wire the check once they land
  (proposed Open Items #34).
- ERP-side GET method persistence (D365-AB #6477 Pending Approval / #8355
  BUG-01) logged with references in today's LifeOS deposit (proposed Open
  Items #35) — AlphaBOLD's 8h estimate awaits David's approval.
- Also observed, not Marion's: the `team` delta job (08:56 UTC) errors nightly
  (Dataverse 0x80040239, a 1752-dated since-timestamp) — for its owning session.

## 2026-09-28 · SOURCE IT (FLAB - Xpress Machining phase 1) — "do we have this, can we make it, when and how much" per cart line; new `sourcing` schema + public.sourcing_* wrappers; sourcing-panel.js
- New file `sourcing-panel.js` (build 2026-09-28.1) loaded by `quote.html` after quote-app-3.js (one script tag; no other Marion file changed). Staff only: a **Source** button in every cart line's Fulfilment cell (and **Source all lines** next to Save draft, Alt+S on a focused row) opens a ranked option panel — STOCK here, TRANSFER per branch, ASSEMBLE from the bill of materials, MACHINE_NEW from material rod/tube stock (Xpress list price from `xpress.machining_prices`), MACHINE_TRIM a stocked donor, VENDOR_STOCK from the Dynamics Vendor-Product ladder, VENDOR_RFQ placeholder. **Use** sets the line's GET chip (#6477) + ETA (BR-07) and marks disposition S/T; **$** puts the option's list price (Xpress list after quantity break, tag "Xpress list") in Net Price; 👍/👎 rate an option (👎 asks one line for the rules backlog). The chosen option is kept in memory (`_src`) and logged; `quote_lines` has no new column (public schema untouched).
- Wraps `fulfilCell`, `renderCart` and `calcLine` (a chosen option survives calcAll). Reads the required-by date from CUST.reqby, warehouse and qty from the line, quote ref = CURRENT_QUOTE_ID.
- DB (Supabase hnmbjqhxvxakhdzgetxw): new project-owned schema **`sourcing`** — migrations `sourcing_schema_v1` (setting / machine / material_family / material_map / leadtime_bucket / check_log / option_feedback, RLS staff_all via public.is_staff(), provisional seeds), `sourcing_vendor_product_copy_v1` + `sourcing_refresh_vendor_products_v2_composite_watermark` (typed copy `sourcing.vendor_product` of public.vendor_products jsonb, 207,777 rows, `sourcing.refresh_vendor_products()` — nightly cron NOT scheduled yet), `sourcing_helpers_material_view_xpress_price_v1` (add_business_days, parse_material_dims, view `sourcing.v_material_stock` security_invoker, `sourcing.xpress_price()`), `sourcing_source_options_v1` → `_v2` → `_v3_expired_vendor_quotes` (`sourcing.source_options(p_pn, p_qty, p_wh, p_required_by, p_quote_ref)` → jsonb, SECURITY DEFINER, staff only, logs every check to sourcing.check_log; v3 flags expired vendor quotes as low confidence).
- **public schema: four thin wrapper functions only** (same pattern as hr_* / imports_*, because `sourcing` is not on the Data API): `public.sourcing_options`, `public.sourcing_choose`, `public.sourcing_rate`, `public.sourcing_settings` — execute granted to authenticated + service_role, revoked from anon. No table, view or policy in public/archive changed.
- Rules are provisional defaults (Xpress Machining Open Items board items 7–15) stored in `sourcing.setting` / `material_family` / `machine`, editable without a deploy: transfer days per branch, machining 5 bd, assembly 1 bd, material allowance 0.125", trim max +25 % OD, labour adds $10 / $40, Xpress qty breaks, internal vendor codes (own ABMANU/ABXPRS/ABFLUI, partner FLMANU/RBMANU/RBXPRS/SEAMAN).
- Known gaps (phase 2/3): material yield not costed (MACHINE_NEW unit cost = product current cost), machinist queue not synced (board item 16), vendor RFQ email + reply page not built (button disabled), Dynamics write-back not built, chosen option not persisted on quote_lines. Verified locally in Chromium against the real page with the RPC stubbed (0 console errors) and on the live function for BU0475006000-200ST/DX, 2-201/N70, G140128120GC-45D, P125104081P2B/U, BU0562506000-050SD/N (< 2 s each).
- (Entry restored twice on 2026-09-28 by the ABQUOTE session — dropped each time by a concurrent CHANGELOG push made from a stale copy. Nothing in it changed.)

## 2026-09-28 · dynamics-import PILOT LOADED — three invoices written to Dynamics as Sales Bot (function v5, migrations v2–v4); Marion must read `quantity_kit` for kit components
- David's go (chat, evening): "q14 - whatever math makes sense / q15 - go pilot". Run `dd138f59-2c96-4f9f-84cd-d66a218ce0ca`, 21:05–21:29 UTC: 6129734-1 created (write-in kit header + 9 linked components, 72.47); 6504721-1 created (credit: −97.80 + 24.45 restocking = −73.35); 6124719-1 updated (20 lines patched, 14 lines the January IMPORT-tool run dropped created, total 0 → 4,291.93; 34 duplicate rows skipped). Final counts created 12 / updated 31 / unchanged 3 / skipped 34. 0 phantom inventories, 0 notes, all nine automation records read back ON. Detail: project doc `claude/import-tool-analysis-2026-09-28.md` §13.10.
- Migration `imports_classify_credit_sale_rule_v2` (`imports` schema only): credit rule `sale` — a credit line takes the ORIGINAL SALE's net price (matched by CUST_PO = the sale's order number + item, first in the staged file, then in `public.invoice_lines` history), else UT_PRICE × MULTIPLIER; `net_price_alt` keeps the template's ÷ value; `import_run.credit_rule` default `sale`.
- Migration `imports_classify_credit_prefix_and_negative_multiplier_v3`: `imports.is_credit(ord)` = ORD_NUMBER 65… (Edmonton) OR 75… (Calgary) — the IMPORT tool knew only 65…; a negative MULTIPLIER (AB/RESTOCKING CHARGE rows) is kept as a real value instead of nulled.
- Migration `imports_kit_per_kit_quantity_v4`: `invoice_line_import.qty_per_kit` — Dynamics `ab_quantitykit` = quantity × parent quantity and `ab_totalnetprice` = ab_netprice × ab_quantitykit are CALCULATED columns, so a LINKED kit component is loaded with its per-kit quantity (P21 INV_QTY ÷ header quantity when it divides exactly; otherwise the component stays loose with its total). Headers and non-kit lines keep the total.
- Edge function `dynamics-import` v2 → v5 (source in `migration/dynamics-import/`, replaces v1): lookup binds use the navigation names read from `EntityDefinitions…ManyToOneRelationships` at run time (v2); no `ownerid` on invoicedetail — it inherits the invoice's owner (v3); a write-in line carries no `uomid` (Dataverse: "cannot set both uomid and productdescription"), catalog lines carry productid + uomid (v4); per-kit quantities, existing-line match on same product AND same P21 line number first, batch-level 400 parsed instead of aborting the run, unprocessed changesets stay `ready` (v5).
- **Marion impact — `public.invoice_lines`:** for a linked kit component (`parent_invoice_line_id` set) `quantity` is now the PER-KIT quantity and `quantity_kit` (= ab_quantitykit) the total; `total_net_price` is right for every line. Any Marion reader that multiplies `quantity × net_price` for a kit component must switch to `quantity_kit` — Marion Open Items board item 55, no code changed yet.
- **dynamics-sync gap found:** the `invoices` / `invoice_lines` table configs key on `createdon`, so rows MODIFIED in Dynamics (the 20 patched lines, the invoice total) never reach Supabase through `sync_nightly`. Re-synced once by hand: `dynamics-sync?table=invoice_lines&since=2026-01-21&until=2026-01-22` (1,208 read / upserted) and the same for `invoices` (290) — Supabase now shows 6124719-1 with 34 lines, 4,291.93, 2 headers, 31 linked. Proper fix (modifiedon key or a second config) folded into board item 41; nothing redeployed.
- Full file: David copies `Z:\LI-INVOICE.txt` to Dropbox (`/master folder2/1 - management/updates/1 - power bi/invoice lines/LI-INVOICE-Jan21-Sep25.txt`); the full load (one month per run, nights, nine switches off/on per run) waits for a second go.

## 2026-09-28 · SSG WEBSITE SESSION: flabed full catalog load + kit-sales views + Data API exposure (public/archive/xpress untouched)
- Protocol followed: `list_migrations` + this file checked before DDL; only schema `flabed`
  touched. `public`, `archive`, `xpress`, `hr` untouched (`public.invoice_lines` /
  `public.products` read only). Does not overlap today's `imports` schema work.
- DB migration `flabed_kit_sales_views_v1`: views `flabed.v_oem_part_sales` (per R<OEM>-
  part: lines, invoices, distinct customers, qty shipped, first/last sold, product
  description / group / price / status, oem_name) and `flabed.v_model_kit_sales` (the same
  per equipment model through equipment_fitments). Security invoker; select granted to
  authenticated + service_role. Read public.invoice_lines + public.products + flabed tables.
- DML in flabed only: equipment_fitments — 12,187 catalog rows imported through the
  dashboard Table Editor CSV importer (Insert → Import data from CSV, ~30 s, from David's
  Chrome; file equipment_fitments_2026-09-28.csv), then 245 pre-load mining rows deleted as
  duplicates (matched on the catalog key without raw/flags), 6 equipment_models inserted
  (RCAT 824C / 824G, RKOB SK200 / SK200LC, RVME A25 / EC380EL), model_id set on every
  fitment, fitment_count / kit_count refreshed. Result: equipment_fitments 12,207 rows (all
  linked), equipment_models 1,492.
- Dashboard setting (not a migration): `flabed` added to the Data API exposed schemas
  (Settings → API). `hr` / `archive` NOT exposed. REST is still unreachable from the Claude
  sandbox and from the device shell (HTTP 000) — the CSV importer in David's Chrome is the
  working bulk path.
- Website side (no DB change): Markets/Mining got a Most Ordered Parts band + Best seller /
  Popular badges (rank only, never customer counts); Markets/Oil & Gas built and live
  (mockup.fluidsealab.com/markets/oil-gas.html) from the oilfield catalog lists +
  public.products prices + invoice ranking. Records: fluidseal-knowledge CHANGELOG /
  projects.md / infrastructure.md, mockup NEXT-SESSION-HANDOFF.md, SSG board v8.
- Push path note for every session: GitHub's browser "Upload files" page takes a file from
  the Claude session's outputs folder (Chrome extension `file_upload`) and a same-name upload
  replaces the file — a full-file update with no retyping through the connector; verify the
  blob SHA afterwards.

## 2026-09-28 · dynamics-import (P21 → Dynamics invoice-line load), Supabase side only — nothing written to Dynamics yet
- Migration `imports_schema_dynamics_import_staging_v1`: NEW schema `imports` (outside `public`; not exposed by PostgREST; nothing Marion reads) with tables `import_run`, `invoice_line_import`, `account_cache`, `inventory_cache`, `code_remap` (seeded 6HIWAY→6HAMEQ, 7HY72→7AIT74), `batch_log`, and functions `imports.classify(run)` (duplicate rule: identical rows collapse, earliest INV_DATE, latest customer PO; product/customer-code lookups against `public.products` / `public.customer_code`; account + preferred warehouse from `public.invoices` history then `public.accounts.raw`; kit structure = first row of a multi-item P21 line group is the header; skip reasons), `imports.plan(run)`, `imports.call_import(action, body)` (pg_net POST to the edge function, same pattern as `public.sync_nightly`).
- Migration `imports_public_rpc_surface_v1`: `public.imp_*` SECURITY DEFINER functions (stage_rows, classify, fetch_batch, write_results, inventory_pairs, inventory_upsert, log_batch, run_status, set_run, check_key) — the only way the edge function reaches the `imports` schema; EXECUTE revoked from public/anon/authenticated (service_role only). `public` otherwise untouched.
- Edge function `dynamics-import` v1 (index.ts + core.ts + parse.ts, source in `migration/dynamics-import/`): actions ingest (Dropbox temporary link) / stage_text / classify / plan (dry run) / run (writes to Dataverse only with confirm:true, the run's run_key and run status approved|running) / status. Same app registration as dynamics-sync (`DYNAMICS_CLIENT_SECRET`); every Dataverse call carries `MSCRMCallerID` = Sales Bot (1edd009c-…) so records show Created by = Sales Bot. Writes invoices + invoice lines in `$batch` changesets (one invoice per changeset, all-or-nothing), kit headers with `ab_sellasakit`, components linked by `ab_parentinvoiceline`, write-in lines (`isproductoverridden`) for P21 kit headers that are not products, `ab_disposition` = Stock, `new_inventory` resolved (never created), `ispriceoverridden` with P21 UT_PRICE, `ab_netprice` = UT_PRICE × MULTIPLIER (credit rule per run), existing invoices matched by product and PATCHed (date only moved earlier, customer code never changed, nothing deleted).
- Pilot run `dd138f59-2c96-4f9f-84cd-d66a218ce0ca` staged (3 invoices, 80 rows → 46 lines) and dry-run against Dataverse (read-only). The load itself waits for David's "go pilot" (Marion Open Items board items 45–54; project doc claude/import-tool-analysis-2026-09-28.md §13).
- Also today: `sync_log` will receive one row per load batch (`table_name = 'invoice_lines'`, message `dynamics-import batch N: {…}`).

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
