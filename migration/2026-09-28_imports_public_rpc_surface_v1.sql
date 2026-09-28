-- RPC surface for the dynamics-import edge function (PostgREST only exposes public, so the imports schema is reached
-- through these SECURITY DEFINER functions; service_role only). Prefix imp_. 2026-09-28, Claude.

create or replace function public.imp_check_key(p_run uuid, p_key uuid) returns void language plpgsql as $$
begin
  if not exists (select 1 from imports.import_run where id = p_run and run_key = p_key) then
    raise exception 'run/key mismatch';
  end if;
end $$;

-- Stage raw rows: p_rows = array of 18-cell arrays in EXPECTED_COLUMNS order plus raw_index at position 0.
create or replace function public.imp_stage_rows(p_run uuid, p_key uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, imports as $$
declare n int;
begin
  perform public.imp_check_key(p_run, p_key);
  insert into imports.invoice_line_import
    (run_id, raw_index, cust_code, ord, item, desc1, desc2, qty, inv_date_raw, inv_date, vend, gen_cost, gen_price,
     ut_cost, ut_price, schd, line_no, ship, multiplier, cust_po)
  select p_run, (r->>0)::int, r->>1, r->>2, r->>3, r->>4, r->>5, r->>6, r->>8,
         case when r->>8 ~ '^\d{1,2}/\d{1,2}/\d{2}(\d{2})?$' then to_date(r->>8, case when length(r->>8) > 8 then 'MM/DD/YYYY' else 'MM/DD/YY' end) end,
         r->>9, r->>10, r->>11, r->>12, r->>13, r->>14, r->>15, r->>16, r->>17, r->>18
    from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.imp_classify(p_run uuid, p_key uuid)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  return imports.classify(p_run);
end $$;

-- Next batch of work: invoices (with their ready lines) in load order. Header rows first inside an invoice.
create or replace function public.imp_fetch_batch(p_run uuid, p_key uuid, p_max_lines int default 400)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb;
begin
  perform public.imp_check_key(p_run, p_key);
  with inv as (
    select invoice_key, min(inv_date) as inv_date, min(ord) as ord, min(ship) as ship,
           min(cust_code_effective) as cust_code, min(customer_code_id::text)::uuid as customer_code_id,
           min(account_id::text)::uuid as account_id, min(warehouse_id::text)::uuid as warehouse_id,
           (array_agg(cust_po_effective order by line_no::int, id))[1] as cust_po,
           count(*) as n_lines,
           sum(case when net_price is not null then net_price * nullif(qty,'')::numeric else 0 end) as total_net
      from imports.invoice_line_import
     where run_id = p_run and status = 'ready'
       and (inv_date >= coalesce((select window_from from imports.import_run where id = p_run), '1900-01-01'))
       and (inv_date <= coalesce((select window_to   from imports.import_run where id = p_run), '2999-12-31'))
     group by invoice_key),
  pick as (
    select *, sum(n_lines) over (order by inv_date, invoice_key rows unbounded preceding) as running
      from inv),
  chosen as (select * from pick where running - n_lines < p_max_lines order by inv_date, invoice_key)
  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice_key', c.invoice_key, 'ord', c.ord, 'ship', c.ship, 'inv_date', c.inv_date, 'cust_code', c.cust_code,
           'customer_code_id', c.customer_code_id, 'account_id', c.account_id, 'warehouse_id', c.warehouse_id,
           'cust_po', c.cust_po, 'total_net', c.total_net,
           'lines', (select jsonb_agg(jsonb_build_object(
                        'id', l.id, 'line_no', l.line_no, 'item', l.item, 'desc1', l.desc1, 'desc2', l.desc2, 'qty', l.qty,
                        'ut_price', l.ut_price, 'ut_cost', l.ut_cost, 'multiplier', l.multiplier, 'net_price', l.net_price,
                        'inv_date', l.inv_date, 'product_id', l.product_id, 'product_description', l.product_description,
                        'is_writein', l.is_writein, 'kit_role', l.kit_role, 'kit_group', l.kit_group,
                        'inventory_id', l.inventory_id, 'cust_po', l.cust_po_effective)
                      order by l.line_no::int, (case when l.kit_role = 'header' then 0 else 1 end), l.id)
                       from imports.invoice_line_import l
                      where l.run_id = p_run and l.status = 'ready' and l.invoice_key = c.invoice_key))
         order by c.inv_date, c.invoice_key), '[]'::jsonb)
    into v from chosen c;
  return v;
end $$;

-- Write back per-line results: [{id, status, dynamics_invoice_id, dynamics_line_id, error, batch_no}]
create or replace function public.imp_write_results(p_run uuid, p_key uuid, p_results jsonb)
returns int language plpgsql security definer set search_path = public, imports as $$
declare n int;
begin
  perform public.imp_check_key(p_run, p_key);
  update imports.invoice_line_import s
     set status = r->>'status',
         dynamics_invoice_id = nullif(r->>'dynamics_invoice_id','')::uuid,
         dynamics_line_id = nullif(r->>'dynamics_line_id','')::uuid,
         error = r->>'error',
         batch_no = (r->>'batch_no')::int,
         loaded_at = now()
    from jsonb_array_elements(p_results) r
   where s.run_id = p_run and s.id = (r->>'id')::bigint;
  get diagnostics n = row_count;
  return n;
end $$;

-- Inventory cache upsert: [{product_id, warehouse_id, inventory_id|null}] and apply to the run's ready lines
create or replace function public.imp_inventory_upsert(p_run uuid, p_key uuid, p_pairs jsonb)
returns int language plpgsql security definer set search_path = public, imports as $$
declare n int;
begin
  perform public.imp_check_key(p_run, p_key);
  insert into imports.inventory_cache (product_id, warehouse_id, inventory_id)
  select (r->>'product_id')::uuid, (r->>'warehouse_id')::uuid, nullif(r->>'inventory_id','')::uuid
    from jsonb_array_elements(p_pairs) r
  on conflict (product_id, warehouse_id) do update set inventory_id = excluded.inventory_id, fetched_at = now();
  update imports.invoice_line_import s
     set inventory_id = ic.inventory_id
    from imports.inventory_cache ic
   where s.run_id = p_run and s.status = 'ready' and s.inventory_id is null
     and ic.product_id = s.product_id and ic.warehouse_id = s.warehouse_id and ic.inventory_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Pairs (product, warehouse) of ready lines that are not in the cache yet
create or replace function public.imp_inventory_pairs(p_run uuid, p_key uuid, p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb;
begin
  perform public.imp_check_key(p_run, p_key);
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'warehouse_id', x.warehouse_id)), '[]'::jsonb) into v
    from (select distinct s.product_id, s.warehouse_id
            from imports.invoice_line_import s
           where s.run_id = p_run and s.status = 'ready' and s.product_id is not null and s.warehouse_id is not null
             and not exists (select 1 from imports.inventory_cache ic where ic.product_id = s.product_id and ic.warehouse_id = s.warehouse_id)
           limit p_limit) x;
  return v;
end $$;

create or replace function public.imp_log_batch(p_run uuid, p_key uuid, p_batch int, p_detail jsonb)
returns void language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  insert into imports.batch_log (run_id, batch_no, invoices, lines, created, updated, failed, ms, detail)
  values (p_run, p_batch, (p_detail->>'invoices')::int, (p_detail->>'lines')::int, (p_detail->>'created')::int,
          (p_detail->>'updated')::int, (p_detail->>'failed')::int, (p_detail->>'ms')::int, p_detail);
end $$;

create or replace function public.imp_run_status(p_run uuid)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'run', to_jsonb(r),
    'counts', (select jsonb_object_agg(status, n) from (select status, count(*) n from imports.invoice_line_import where run_id = p_run group by status) x),
    'batches', (select count(*) from imports.batch_log where run_id = p_run),
    'last_batch', (select to_jsonb(b) from imports.batch_log b where run_id = p_run order by id desc limit 1))
    into v from imports.import_run r where r.id = p_run;
  return v;
end $$;

create or replace function public.imp_set_run(p_run uuid, p_key uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  update imports.import_run
     set status = coalesce(p_status, status),
         notes = case when p_notes is null then notes else coalesce(notes,'') || E'\n' || p_notes end,
         started_at = case when p_status = 'running' and started_at is null then now() else started_at end,
         finished_at = case when p_status in ('done','aborted') then now() else finished_at end
   where id = p_run;
end $$;

revoke all on function public.imp_stage_rows(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.imp_classify(uuid, uuid) from public, anon, authenticated;
revoke all on function public.imp_fetch_batch(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.imp_write_results(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.imp_inventory_upsert(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.imp_inventory_pairs(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.imp_log_batch(uuid, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.imp_run_status(uuid) from public, anon, authenticated;
revoke all on function public.imp_set_run(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.imp_check_key(uuid, uuid) from public, anon, authenticated;
