-- imports schema — staging for P21 -> Dynamics loads run by the dynamics-import edge function.
-- Lives OUTSIDE public (Marion production) on purpose. Nothing here is read by Marion.
-- 2026-09-28, Claude, for David (Marion board item 45).

create schema if not exists imports;

create table if not exists imports.import_run (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                 -- e.g. LI-INVOICE-Jan21-Sep25.txt
  entity        text not null default 'invoicedetail',
  source        text,                          -- where the file came from (Dropbox path, "pilot rows", ...)
  status        text not null default 'staged', -- staged | classified | approved | running | paused | done | aborted
  run_key       uuid not null default gen_random_uuid(),  -- must be presented by the caller of run/ingest
  file_rows     int,
  kept_rows     int,
  window_from   date,
  window_to     date,
  max_lines     int not null default 400,      -- lines per invocation
  credit_rule   text not null default 'divide', -- net price on credit orders (ORD 65…): 'divide' = the IMPORT tool's rule
                                                -- (UT_PRICE / MULTIPLIER); 'multiply' = same as sales (see Q14)
  created_by    text default 'Sales Bot',
  notes         text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create table if not exists imports.invoice_line_import (
  id                bigserial primary key,
  run_id            uuid not null references imports.import_run(id) on delete cascade,
  raw_index         int not null,
  -- the file, verbatim (trimmed)
  cust_code         text, ord text, ship text, line_no text, item text, desc1 text, desc2 text,
  qty               text, inv_date date, inv_date_raw text, vend text, gen_cost text, gen_price text,
  ut_cost           text, ut_price text, schd text, multiplier text, cust_po text,
  -- verdicts (imports.classify)
  content_key       text,
  is_kept           boolean,
  dup_count         int,
  also_seen_dates   date[],
  cust_po_effective text,
  cust_code_effective text,
  code_remapped_from text,
  net_price         numeric,
  net_price_alt     numeric,                    -- credit rows only: the net price under the other credit rule
  invoice_key       text,                      -- ORD-SHIP  (= cr5da_invoicep21)
  product_id        uuid,
  product_description text,
  is_writein        boolean,
  customer_code_id  uuid,
  account_id        uuid,
  warehouse_id      uuid,
  inventory_id      uuid,
  kit_group         text,                      -- ORD-SHIP-LINE when part of a kit
  kit_role          text,                      -- header | component | null
  skip_reason       text,                      -- dnu | customer code not found | duplicate | bad date
  -- load state
  status            text not null default 'ready',   -- ready | created | updated | unchanged | skipped | error
  dynamics_invoice_id uuid,
  dynamics_line_id  uuid,
  batch_no          int,
  error             text,
  loaded_at         timestamptz
);
create index if not exists ili_run_status_idx on imports.invoice_line_import (run_id, status);
create index if not exists ili_run_key_idx on imports.invoice_line_import (run_id, invoice_key);
create index if not exists ili_run_content_idx on imports.invoice_line_import (run_id, content_key);

create table if not exists imports.account_cache (
  customer_code_id uuid primary key,
  customer_code    text,
  account_id       uuid,
  warehouse_id     uuid,
  fetched_at       timestamptz not null default now()
);
create table if not exists imports.inventory_cache (
  product_id   uuid not null,
  warehouse_id uuid not null,
  inventory_id uuid,                            -- null = no inventory record in that warehouse (never created by the import)
  fetched_at   timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);
create table if not exists imports.code_remap (
  old_code text primary key,
  new_code text not null,
  reason   text,
  added_at timestamptz not null default now()
);
insert into imports.code_remap (old_code, new_code, reason) values
  ('6HIWAY', '6HAMEQ', 'P21: LOCKED: USE 6HAMEQ (Rocky Mountain Equipment, Lethbridge) — David 2026-09-28'),
  ('7HY72',  '7AIT74', 'P21: LOCKED: DO NOT USE 07/08/26; Dynamics account notes (TK 2026-07-06/08): account created from ship-to 1 of 7HY72, P21 code 7AIT74 — David 2026-09-28')
on conflict (old_code) do nothing;

create table if not exists imports.batch_log (
  id          bigserial primary key,
  run_id      uuid not null,
  batch_no    int not null,
  invoices    int, lines int, created int, updated int, failed int,
  ms          int,
  detail      jsonb,
  at          timestamptz not null default now()
);

-- Classification of one run: duplicates, lookups, kit structure, skip reasons. Idempotent.
create or replace function imports.classify(p_run uuid)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  -- 1 content key: every column except INV_DATE and CUST_PO
  update imports.invoice_line_import s
     set content_key = md5(concat_ws('|', cust_code, ord, ship, line_no, item, qty, ut_price, ut_cost, multiplier,
                                      vend, schd, desc1, desc2, gen_cost, gen_price)),
         invoice_key = ord || '-' || ship
   where run_id = p_run;

  -- 2 keep the earliest date per identical row; latest customer PO text; remember the other dates
  with g as (
    select content_key,
           count(*) as n,
           array_agg(distinct inv_date order by inv_date) as dates,
           (array_agg(cust_po order by inv_date desc nulls last, raw_index desc))[1] as latest_po
      from imports.invoice_line_import where run_id = p_run group by content_key),
  k as (
    select distinct on (content_key) id, content_key
      from imports.invoice_line_import where run_id = p_run
     order by content_key, inv_date nulls last, raw_index)
  update imports.invoice_line_import s
     set is_kept = (k.id = s.id),
         dup_count = g.n,
         also_seen_dates = g.dates,
         cust_po_effective = g.latest_po
    from g, k
   where s.run_id = p_run and g.content_key = s.content_key and k.content_key = s.content_key;

  -- 3 customer code (with the locked-code remap), product, net price
  update imports.invoice_line_import s
     set cust_code_effective = coalesce(r.new_code, t.cust_code),
         code_remapped_from  = case when r.new_code is not null then t.cust_code end
    from imports.invoice_line_import t
    left join imports.code_remap r on r.old_code = t.cust_code
   where s.id = t.id and s.run_id = p_run;
  update imports.invoice_line_import s set customer_code_id = null, product_id = null, product_description = null where run_id = p_run;
  update imports.invoice_line_import s
     set customer_code_id = c.customer_code_id
    from public.customer_code c
   where s.run_id = p_run and c.name = s.cust_code_effective;
  update imports.invoice_line_import s
     set product_id = p.dynamics_guid, product_description = p.description
    from public.products p
   where s.run_id = p_run and p.part_number = s.item;
  update imports.invoice_line_import s
     set net_price = case when (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric > 0)
                          then case when ord like '65%' and r.credit_rule = 'divide' then ut_price::numeric / multiplier::numeric
                                    else ut_price::numeric * multiplier::numeric end end,
         net_price_alt = case when ord like '65%' and (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric > 0)
                          then case when r.credit_rule = 'divide' then ut_price::numeric * multiplier::numeric
                                    else ut_price::numeric / multiplier::numeric end end,
         is_writein = (product_id is null and item not like 'DNU%')
    from imports.import_run r
   where s.run_id = p_run and r.id = p_run;

  -- 4 skip reasons
  update imports.invoice_line_import
     set skip_reason = case
           when not is_kept then 'duplicate'
           when inv_date is null then 'bad date'
           when item like 'DNU%' then 'dnu'
           when customer_code_id is null then 'customer code not found'
           when ord = '' or ship = '' then 'missing order or ship number'
           else null end
   where run_id = p_run;
  update imports.invoice_line_import set status = 'skipped' where run_id = p_run and skip_reason is not null and status = 'ready';

  -- 5 kit structure: P21 puts a kit's header and its components on the SAME order line number; the header is always the
  --    first row of the group in file order (checked on 13,622 groups: 10,343 write-in headers all first; product kit codes
  --    such as RCAT-…/RJIC-…/BPRE-… behave the same). Header -> ab_sellasakit, components -> ab_parentinvoiceline.
  update imports.invoice_line_import set kit_group = null, kit_role = null where run_id = p_run;
  with grp as (
    select ord, ship, line_no, min(raw_index) as first_row
      from imports.invoice_line_import
     where run_id = p_run and skip_reason is null
     group by ord, ship, line_no
    having count(distinct item) > 1)
  update imports.invoice_line_import s
     set kit_group = s.ord || '-' || s.ship || '-' || s.line_no,
         kit_role  = case when s.raw_index = grp.first_row then 'header' else 'component' end
    from grp
   where s.run_id = p_run and s.skip_reason is null
     and grp.ord = s.ord and grp.ship = s.ship and grp.line_no = s.line_no;

  -- 6a the account Dynamics used for this code on earlier invoices (the plugin picks "the first account with the code";
  --    history tells which one that was), else the first active account carrying the code
  insert into imports.account_cache (customer_code_id, customer_code, account_id, warehouse_id)
  select x.customer_code_id, x.customer_code, x.account_id, nullif(a.raw->>'_new_preferredwarehouse_value','')::uuid
    from (
      select distinct on (s.customer_code_id) s.customer_code_id, s.cust_code_effective as customer_code,
             coalesce(h.account_id, f.account_id) as account_id
        from (select distinct customer_code_id, cust_code_effective from imports.invoice_line_import
               where run_id = p_run and customer_code_id is not null) s
        left join lateral (
          select i.account_id from public.invoices i
           where i.customer_code_id = s.customer_code_id and i.account_id is not null
           group by i.account_id order by count(*) desc limit 1) h on true
        left join lateral (
          select a2.account_id from public.accounts a2
           where nullif(a2.raw->>'_new_newcustomercodep21_value','')::uuid = s.customer_code_id
           order by (a2.raw->>'statecode')::int nulls last, a2.created_on limit 1) f on true
       order by s.customer_code_id) x
    left join public.accounts a on a.account_id = x.account_id
  on conflict (customer_code_id) do nothing;
  update imports.invoice_line_import s
     set account_id = c.account_id, warehouse_id = c.warehouse_id
    from imports.account_cache c
   where s.run_id = p_run and c.customer_code_id = s.customer_code_id;
  update imports.invoice_line_import s
     set inventory_id = ic.inventory_id
    from imports.inventory_cache ic
   where s.run_id = p_run and ic.product_id = s.product_id and ic.warehouse_id = s.warehouse_id;

  select jsonb_build_object(
    'rows', count(*),
    'kept', count(*) filter (where is_kept),
    'ready', count(*) filter (where status = 'ready'),
    'skipped_duplicate', count(*) filter (where skip_reason = 'duplicate'),
    'skipped_dnu', count(*) filter (where skip_reason = 'dnu'),
    'skipped_customer', count(*) filter (where skip_reason = 'customer code not found'),
    'skipped_bad_date', count(*) filter (where skip_reason = 'bad date'),
    'writein', count(*) filter (where status = 'ready' and is_writein),
    'kit_headers', count(*) filter (where status = 'ready' and kit_role = 'header'),
    'kit_components', count(*) filter (where status = 'ready' and kit_role = 'component'),
    'remapped', count(*) filter (where status = 'ready' and code_remapped_from is not null),
    'invoices', count(distinct invoice_key) filter (where status = 'ready'),
    'net_null', count(*) filter (where status = 'ready' and net_price is null),
    'no_account', count(*) filter (where status = 'ready' and account_id is null),
    'no_warehouse', count(*) filter (where status = 'ready' and warehouse_id is null))
    into v
    from imports.invoice_line_import where run_id = p_run;
  update imports.import_run set kept_rows = (v->>'ready')::int, file_rows = (v->>'rows')::int,
         status = case when status = 'staged' then 'classified' else status end where id = p_run;
  return v;
end $$;

-- Per-month plan for a run
create or replace function imports.plan(p_run uuid)
returns table (month text, invoices bigint, lines bigint, writein bigint, ready bigint, created bigint, errors bigint)
language sql stable as $$
  select to_char(inv_date, 'YYYY-MM') as month,
         count(distinct invoice_key) filter (where skip_reason is null),
         count(*) filter (where skip_reason is null),
         count(*) filter (where skip_reason is null and is_writein),
         count(*) filter (where status = 'ready'),
         count(*) filter (where status in ('created','updated','unchanged')),
         count(*) filter (where status = 'error')
    from imports.invoice_line_import where run_id = p_run group by 1 order by 1;
$$;

-- Trigger the edge function from SQL (same pattern as public.sync_nightly). The anon key is the project's publishable key.
create or replace function imports.call_import(p_action text, p_body jsonb)
returns bigint language sql as $$
  select net.http_post(
    url := 'https://hnmbjqhxvxakhdzgetxw.supabase.co/functions/v1/dynamics-import',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0'),
    body := p_body || jsonb_build_object('action', p_action),
    timeout_milliseconds := 150000);
$$;

-- No policies: the imports schema is not exposed through PostgREST (only public is in the exposed schemas),
-- so only the service role (edge functions) and the SQL editor reach it.
