-- v12: a Dataverse $batch that times out on the client (AbortSignal 170 s) may still be committing on the server; the
-- next invocation re-fetched those invoices before they were visible and created them twice (6 invoices, 2026-09-29
-- 23:44 UTC, removed by hand). Invoices of a timed-out or failed batch are now deferred (run_queue.retry_after, 15 min)
-- before they can be fetched again; by then the existing-invoice check sees the first copy and marks the lines unchanged.
-- imports schema + the logged public.imp_* surface. Claude.
alter table imports.run_queue add column if not exists retry_after timestamptz;

create or replace function public.imp_defer(p_run uuid, p_key uuid, p_keys jsonb, p_minutes int default 15)
returns int language plpgsql security definer set search_path = public, imports as $$
declare n int;
begin
  perform public.imp_check_key(p_run, p_key);
  update imports.run_queue set retry_after = now() + make_interval(mins => p_minutes)
   where run_id = p_run and invoice_key in (select jsonb_array_elements_text(p_keys));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.imp_defer(uuid, uuid, jsonb, int) from public, anon, authenticated;

create or replace function public.imp_fetch_batch(p_run uuid, p_key uuid, p_max_lines int default 400, p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb; v_lock timestamptz; v_from date; v_to date; v_keys text[];
begin
  perform public.imp_check_key(p_run, p_key);
  select window_from, window_to, lock_until into v_from, v_to, v_lock from imports.import_run where id = p_run for update;
  if p_lock and v_lock is not null and v_lock > now() then
    raise exception 'run busy until %', v_lock;
  end if;
  select array_agg(invoice_key order by inv_date, invoice_key) into v_keys
    from (select invoice_key, inv_date, n_lines,
                 sum(n_lines) over (order by inv_date, invoice_key rows unbounded preceding) as running
            from (select invoice_key, inv_date, n_lines from imports.run_queue
                   where run_id = p_run and not done
                     and (retry_after is null or retry_after < now())
                     and inv_date >= coalesce(v_from, '1900-01-01') and inv_date <= coalesce(v_to, '2999-12-31')
                   order by inv_date, invoice_key limit 400) q) p
   where running - n_lines < p_max_lines;
  if v_keys is null then return '[]'::jsonb; end if;
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
select pg_notify('pgrst', 'reload schema');