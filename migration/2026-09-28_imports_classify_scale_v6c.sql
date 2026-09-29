-- v6c: imports.classify itself (the kit functions went in v6): dedupe as ONE grouped join (keep_id from array_agg), the
-- customer-code remap without a self-join, ANALYZE inside the function, and the Q9 rule — lines whose customer code has
-- no account in Dynamics are parked (status 'parked'), not loaded. Same results as v4 on the pilot rows. imports only.
-- Full-file note: 189k rows take 30-60 s per full-table update on this instance; call from SQL with
-- statement_timeout raised, or through the edge function only for files under ~40k rows. 2026-09-28, Claude.
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

  analyze imports.invoice_line_import;
  with g as (
    select content_key,
           count(*) as n,
           array_agg(distinct inv_date order by inv_date) as dates,
           (array_agg(cust_po order by inv_date desc nulls last, raw_index desc))[1] as latest_po,
           (array_agg(id order by inv_date nulls last, raw_index))[1] as keep_id
      from imports.invoice_line_import where run_id = p_run group by content_key)
  update imports.invoice_line_import s
     set is_kept = (g.keep_id = s.id),
         dup_count = g.n,
         also_seen_dates = g.dates,
         cust_po_effective = g.latest_po
    from g
   where s.run_id = p_run and g.content_key = s.content_key;

  update imports.invoice_line_import
     set cust_code_effective = cust_code, code_remapped_from = null
   where run_id = p_run;
  update imports.invoice_line_import s
     set cust_code_effective = r.new_code, code_remapped_from = s.cust_code
    from imports.code_remap r
   where s.run_id = p_run and r.old_code = s.cust_code;
  update imports.invoice_line_import s set customer_code_id = null, product_id = null, product_description = null, credit_source = null where run_id = p_run;
  update imports.invoice_line_import s
     set customer_code_id = c.customer_code_id
    from public.customer_code c
   where s.run_id = p_run and c.name = s.cust_code_effective;
  update imports.invoice_line_import s
     set product_id = p.dynamics_guid, product_description = p.description
    from public.products p
   where s.run_id = p_run and p.part_number = s.item;

  update imports.invoice_line_import s
     set net_price = case when (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric <> 0)
                          then case when imports.is_credit(ord) and v_rule = 'divide' then ut_price::numeric / multiplier::numeric
                                    else ut_price::numeric * multiplier::numeric end end,
         net_price_alt = case when imports.is_credit(ord) and (nullif(ut_price,'')::numeric > 0 and nullif(multiplier,'')::numeric <> 0)
                          then ut_price::numeric / multiplier::numeric end,
         credit_source = case when imports.is_credit(ord) then (case when v_rule = 'divide' then 'divide' else 'multiply' end) end,
         is_writein = (product_id is null and item not like 'DNU%')
   where run_id = p_run;

  if v_rule = 'sale' then
    update imports.invoice_line_import s
       set net_price = o.net, credit_source = 'staging'
      from (
        select c.id,
               (select (nullif(t.ut_price,'')::numeric * nullif(t.multiplier,'')::numeric)
                  from imports.invoice_line_import t
                 where t.run_id = p_run and t.ord = split_part(c.cust_po_effective, ' ', 1) and t.item = c.item
                   and not imports.is_credit(t.ord) and nullif(t.ut_price,'')::numeric > 0 and nullif(t.multiplier,'')::numeric > 0
                 order by t.raw_index limit 1) as net
          from imports.invoice_line_import c
         where c.run_id = p_run and imports.is_credit(c.ord) and split_part(c.cust_po_effective, ' ', 1) ~ '^\d{6,8}$') o
     where s.id = o.id and o.net is not null;
    update imports.invoice_line_import s
       set net_price = o.net, credit_source = 'history'
      from (
        select c.id,
               (select h.net_price from public.invoice_lines h
                 where h.p21_invoice_no like split_part(c.cust_po_effective, ' ', 1) || '-%' and h.part_number = c.item and h.net_price is not null
                 order by h.invoice_date desc limit 1) as net
          from imports.invoice_line_import c
         where c.run_id = p_run and imports.is_credit(c.ord) and c.credit_source = 'multiply'
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

  analyze imports.invoice_line_import;
  perform imports.classify_kits(p_run);

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

  -- Q9 (David 2026-09-28): a line whose customer code has no account in Dynamics is parked, never loaded without a customer
  update imports.invoice_line_import
     set status = 'parked', skip_reason = 'no account for customer code (Q9)'
   where run_id = p_run and status = 'ready' and account_id is null;

  select jsonb_build_object(
    'rows', count(*),
    'kept', count(*) filter (where is_kept),
    'ready', count(*) filter (where status = 'ready'),
    'parked', count(*) filter (where status = 'parked'),
    'skipped_duplicate', count(*) filter (where skip_reason = 'duplicate'),
    'skipped_dnu', count(*) filter (where skip_reason = 'dnu'),
    'skipped_customer', count(*) filter (where skip_reason = 'customer code not found'),
    'skipped_bad_date', count(*) filter (where skip_reason = 'bad date'),
    'writein', count(*) filter (where status = 'ready' and is_writein),
    'kit_headers', count(*) filter (where status = 'ready' and kit_role = 'header'),
    'kit_components', count(*) filter (where status = 'ready' and kit_role = 'component'),
    'kit_loose', count(*) filter (where status = 'ready' and kit_role = 'loose'),
    'remapped', count(*) filter (where status = 'ready' and code_remapped_from is not null),
    'invoices', count(distinct invoice_key) filter (where status = 'ready'),
    'net_null', count(*) filter (where status = 'ready' and net_price is null),
    'credit_lines', count(*) filter (where status = 'ready' and imports.is_credit(ord)),
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