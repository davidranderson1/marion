-- Credit-order net price, rule 'sale' (David 2026-09-28: "whatever math makes sense"):
-- a credit line (ORD_NUMBER 65…) takes the net price of the original sale when that sale can be found —
-- CUST_PO on a credit starts with the original order number; the sale is looked up in the same run first,
-- then in Dynamics history (public.invoice_lines) — otherwise UT_PRICE × MULTIPLIER like every other line.
-- 'multiply' and 'divide' (the IMPORT tool's rule) stay available per run. net_price_alt keeps the ÷ value for reference.
alter table imports.import_run alter column credit_rule set default 'sale';
alter table imports.invoice_line_import add column if not exists credit_source text; -- 'staging' | 'history' | 'multiply' for credit rows

create or replace function imports.classify(p_run uuid)
returns jsonb language plpgsql as $$
declare v jsonb; v_rule text;
begin
  select credit_rule into v_rule from imports.import_run where id = p_run;

  update imports.invoice_line_import s
     set content_key = md5(concat_ws('|', cust_code, ord, ship, line_no, item, qty, ut_price, ut_cost, multiplier,
                                      vend, schd, desc1, desc2, gen_cost, gen_price)),
         invoice_key = ord || '-' || ship
   where run_id = p_run;

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

  update imports.invoice_line_import s
     set cust_code_effective = coalesce(r.new_code, t.cust_code),
         code_remapped_from  = case when r.new_code is not null then t.cust_code end
    from imports.invoice_line_import t
    left join imports.code_remap r on r.old_code = t.cust_code
   where s.id = t.id and s.run_id = p_run;
  update imports.invoice_line_import s set customer_code_id = null, product_id = null, product_description = null, credit_source = null where run_id = p_run;
  update imports.invoice_line_import s
     set customer_code_id = c.customer_code_id
    from public.customer_code c
   where s.run_id = p_run and c.name = s.cust_code_effective;
  update imports.invoice_line_import s
     set product_id = p.dynamics_guid, product_description = p.description
    from public.products p
   where s.run_id = p_run and p.part_number = s.item;

  -- base net price: × for everything; ÷ on credits only under the tool's rule
  update imports.invoice_line_import s
     set net_price = case when (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric > 0)
                          then case when ord like '65%' and v_rule = 'divide' then ut_price::numeric / multiplier::numeric
                                    else ut_price::numeric * multiplier::numeric end end,
         net_price_alt = case when ord like '65%' and (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric > 0)
                          then ut_price::numeric / multiplier::numeric end,
         credit_source = case when ord like '65%' then (case when v_rule = 'divide' then 'divide' else 'multiply' end) end,
         is_writein = (product_id is null and item not like 'DNU%')
   where run_id = p_run;

  -- rule 'sale': the original sale's net price when it can be found
  if v_rule = 'sale' then
    -- from the same run (kept rows of the original order, same item)
    update imports.invoice_line_import s
       set net_price = o.net, credit_source = 'staging'
      from (
        select c.id,
               (select (nullif(t.ut_price,'')::numeric * nullif(t.multiplier,'')::numeric)
                  from imports.invoice_line_import t
                 where t.run_id = p_run and t.ord = split_part(c.cust_po_effective, ' ', 1) and t.item = c.item
                   and t.ord not like '65%' and nullif(t.ut_price,'')::numeric > 0 and nullif(t.multiplier,'')::numeric > 0
                 order by t.raw_index limit 1) as net
          from imports.invoice_line_import c
         where c.run_id = p_run and c.ord like '65%' and split_part(c.cust_po_effective, ' ', 1) ~ '^\d{6,8}$') o
     where s.id = o.id and o.net is not null;
    -- from Dynamics history (public.invoice_lines: p21_invoice_no = ORD-SHIP)
    update imports.invoice_line_import s
       set net_price = o.net, credit_source = 'history'
      from (
        select c.id,
               (select h.net_price from public.invoice_lines h
                 where h.p21_invoice_no like split_part(c.cust_po_effective, ' ', 1) || '-%' and h.part_number = c.item and h.net_price is not null
                 order by h.invoice_date desc limit 1) as net
          from imports.invoice_line_import c
         where c.run_id = p_run and c.ord like '65%' and c.credit_source = 'multiply'
           and split_part(c.cust_po_effective, ' ', 1) ~ '^\d{6,8}$') o
     where s.id = o.id and o.net is not null;
  end if;

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
    'credit_lines', count(*) filter (where status = 'ready' and ord like '65%'),
    'credit_from_staging', count(*) filter (where status = 'ready' and credit_source = 'staging'),
    'credit_from_history', count(*) filter (where status = 'ready' and credit_source = 'history'),
    'no_account', count(*) filter (where status = 'ready' and account_id is null),
    'no_warehouse', count(*) filter (where status = 'ready' and warehouse_id is null))
    into v
    from imports.invoice_line_import where run_id = p_run;
  update imports.import_run set kept_rows = (v->>'ready')::int, file_rows = (v->>'rows')::int,
         status = case when status = 'staged' then 'classified' else status end where id = p_run;
  return v;
end $$;