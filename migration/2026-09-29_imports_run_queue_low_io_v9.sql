-- v9: the instance's disk is throttled after the full-file classify (a 150 MB scan of imports.invoice_line_import now
-- takes 90 s), and every dynamics-import invocation scanned the whole table three times (fetch, inventory pairs,
-- status counts) — batch 5 never finished. A small per-run queue of invoices (one row per invoice, built once) now
-- drives fetch_batch, inventory pairs are limited to the fetched invoices, and the status counts come from the queue.
-- imports schema + the logged public.imp_* surface only. 2026-09-29, Claude.
create table if not exists imports.run_queue (
  run_id      uuid not null references imports.import_run(id) on delete cascade,
  invoice_key text not null,
  inv_date    date,
  n_lines     int not null,
  done        boolean not null default false,
  primary key (run_id, invoice_key)
);
create index if not exists run_queue_open_idx on imports.run_queue (run_id, done, inv_date, invoice_key);

-- one full scan per run, after classify (or after reclassifying): every invoice with ready lines
create or replace function imports.build_queue(p_run uuid) returns int language plpgsql as $$
declare n int;
begin
  insert into imports.run_queue (run_id, invoice_key, inv_date, n_lines)
  select p_run, invoice_key, min(inv_date), count(*)
    from imports.invoice_line_import where run_id = p_run and status = 'ready' group by invoice_key
  on conflict (run_id, invoice_key) do update set inv_date = excluded.inv_date, n_lines = excluded.n_lines, done = false;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.imp_fetch_batch(p_run uuid, p_key uuid, p_max_lines int default 400, p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb; v_lock timestamptz; v_from date; v_to date; v_keys text[];
begin
  perform public.imp_check_key(p_run, p_key);
  select window_from, window_to, lock_until into v_from, v_to, v_lock from imports.import_run where id = p_run for update;
  if p_lock and v_lock is not null and v_lock > now() then
    raise exception 'run busy until %', v_lock;
  end if;
  -- candidate invoices from the small queue, in date order, up to p_max_lines lines (at least one invoice)
  select array_agg(invoice_key order by inv_date, invoice_key) into v_keys
    from (select invoice_key, inv_date, n_lines,
                 sum(n_lines) over (order by inv_date, invoice_key rows unbounded preceding) as running
            from (select invoice_key, inv_date, n_lines from imports.run_queue
                   where run_id = p_run and not done
                     and inv_date >= coalesce(v_from, '1900-01-01') and inv_date <= coalesce(v_to, '2999-12-31')
                   order by inv_date, invoice_key limit 400) q) p
   where running - n_lines < p_max_lines;
  if v_keys is null then return '[]'::jsonb; end if;
  -- invoices already fully processed (results written, queue row not yet closed) are closed here
  update imports.run_queue q set done = true
   where q.run_id = p_run and q.invoice_key = any(v_keys)
     and not exists (select 1 from imports.invoice_line_import l where l.run_id = p_run and l.invoice_key = q.invoice_key and l.status = 'ready');
  with inv as (
    select l.invoice_key, min(l.inv_date) as inv_date, min(l.ord) as ord, min(l.ship) as ship,
           min(l.cust_code_effective) as cust_code, min(l.customer_code_id::text)::uuid as customer_code_id,
           min(l.account_id::text)::uuid as account_id, min(l.warehouse_id::text)::uuid as warehouse_id,
           (array_agg(l.cust_po_effective order by l.line_no::int, l.id))[1] as cust_po,
           count(*) as n_lines,
           sum(case when l.net_price is not null then l.net_price * nullif(l.qty,'')::numeric else 0 end) as total_net
      from imports.invoice_line_import l
     where l.run_id = p_run and l.status = 'ready' and l.invoice_key = any(v_keys)
     group by l.invoice_key)
  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice_key', c.invoice_key, 'ord', c.ord, 'ship', c.ship, 'inv_date', c.inv_date, 'cust_code', c.cust_code,
           'customer_code_id', c.customer_code_id, 'account_id', c.account_id, 'warehouse_id', c.warehouse_id,
           'cust_po', c.cust_po, 'total_net', c.total_net,
           'lines', (select jsonb_agg(jsonb_build_object(
                        'id', l.id, 'line_no', l.line_no, 'item', l.item, 'desc1', l.desc1, 'desc2', l.desc2, 'qty', l.qty,
                        'qty_per_kit', l.qty_per_kit,
                        'ut_price', l.ut_price, 'ut_cost', l.ut_cost, 'multiplier', l.multiplier, 'net_price', l.net_price,
                        'inv_date', l.inv_date, 'product_id', l.product_id, 'product_description', l.product_description,
                        'is_writein', l.is_writein, 'kit_role', l.kit_role, 'kit_group', l.kit_group,
                        'inventory_id', l.inventory_id, 'cust_po', l.cust_po_effective)
                      order by l.line_no::int, (case when l.kit_role = 'header' then 0 else 1 end), l.id)
                       from imports.invoice_line_import l
                      where l.run_id = p_run and l.status = 'ready' and l.invoice_key = c.invoice_key))
         order by c.inv_date, c.invoice_key), '[]'::jsonb)
    into v from inv c;
  if p_lock and jsonb_array_length(v) > 0 then
    update imports.import_run set lock_until = now() + interval '7 minutes' where id = p_run;
  end if;
  return v;
end $$;
revoke all on function public.imp_fetch_batch(uuid, uuid, int, boolean) from public, anon, authenticated;

-- results: close queue rows whose invoice has no ready line left
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
  update imports.run_queue q set done = true
   where q.run_id = p_run and not q.done
     and q.invoice_key in (select distinct l.invoice_key from imports.invoice_line_import l
                            where l.run_id = p_run and l.id in (select (r->>'id')::bigint from jsonb_array_elements(p_results) r))
     and not exists (select 1 from imports.invoice_line_import l2 where l2.run_id = p_run and l2.invoice_key = q.invoice_key and l2.status = 'ready');
  return n;
end $$;

-- inventory pairs: only for the given invoices (p_keys), never a scan of the run
drop function if exists public.imp_inventory_pairs(uuid, uuid, int);
create or replace function public.imp_inventory_pairs(p_run uuid, p_key uuid, p_limit int default 500, p_keys jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb;
begin
  perform public.imp_check_key(p_run, p_key);
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'warehouse_id', x.warehouse_id)), '[]'::jsonb) into v
    from (select distinct s.product_id, s.warehouse_id
            from imports.invoice_line_import s
           where s.run_id = p_run and s.status = 'ready' and s.product_id is not null and s.warehouse_id is not null
             and (p_keys is null or s.invoice_key in (select jsonb_array_elements_text(p_keys)))
             and not exists (select 1 from imports.inventory_cache ic where ic.product_id = s.product_id and ic.warehouse_id = s.warehouse_id)
           limit p_limit) x;
  return v;
end $$;
revoke all on function public.imp_inventory_pairs(uuid, uuid, int, jsonb) from public, anon, authenticated;

-- inventory upsert: apply to the run's ready lines through the cache join (unchanged), but only for lines of the given keys when passed
drop function if exists public.imp_inventory_upsert(uuid, uuid, jsonb);
create or replace function public.imp_inventory_upsert(p_run uuid, p_key uuid, p_pairs jsonb, p_keys jsonb default null)
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
     and (p_keys is null or s.invoice_key in (select jsonb_array_elements_text(p_keys)))
     and ic.product_id = s.product_id and ic.warehouse_id = s.warehouse_id and ic.inventory_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.imp_inventory_upsert(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

-- status: counts from the queue (open invoices / their lines), no table scan
create or replace function public.imp_run_status(p_run uuid)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'run', to_jsonb(r),
    'counts', jsonb_build_object(
        'ready', (select coalesce(sum(n_lines), 0) from imports.run_queue where run_id = p_run and not done),
        'open_invoices', (select count(*) from imports.run_queue where run_id = p_run and not done)),
    'batches', (select count(*) from imports.batch_log where run_id = p_run),
    'last_batch', (select to_jsonb(b) from imports.batch_log b where run_id = p_run order by id desc limit 1))
    into v from imports.import_run r where r.id = p_run;
  return v;
end $$;
select pg_notify('pgrst', 'reload schema');