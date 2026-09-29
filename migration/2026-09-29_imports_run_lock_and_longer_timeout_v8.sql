-- v8: (1) a run lock so two dynamics-import invocations can never write the same invoices (the chained call, a manual
-- kick and a pg_net retry could otherwise overlap): the first fetch of a confirmed run sets import_run.lock_until
-- (7 min); imp_log_batch and imp_set_run clear it; a locked run makes imp_fetch_batch raise 'busy'.
-- (2) imports.call_import waits up to 390 s (the edge runtime allows 400 s; the first full batch took 186 s and
-- pg_net gave up at 150 s). imports schema + the logged public.imp_* surface only. 2026-09-29, Claude.
alter table imports.import_run add column if not exists lock_until timestamptz;

drop function if exists public.imp_fetch_batch(uuid, uuid, int);
create or replace function public.imp_fetch_batch(p_run uuid, p_key uuid, p_max_lines int default 400, p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path = public, imports as $$
declare v jsonb; v_lock timestamptz;
begin
  perform public.imp_check_key(p_run, p_key);
  if p_lock then
    select lock_until into v_lock from imports.import_run where id = p_run for update;
    if v_lock is not null and v_lock > now() then
      raise exception 'run busy until %', v_lock;
    end if;
  end if;
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
                        'qty_per_kit', l.qty_per_kit,
                        'ut_price', l.ut_price, 'ut_cost', l.ut_cost, 'multiplier', l.multiplier, 'net_price', l.net_price,
                        'inv_date', l.inv_date, 'product_id', l.product_id, 'product_description', l.product_description,
                        'is_writein', l.is_writein, 'kit_role', l.kit_role, 'kit_group', l.kit_group,
                        'inventory_id', l.inventory_id, 'cust_po', l.cust_po_effective)
                      order by l.line_no::int, (case when l.kit_role = 'header' then 0 else 1 end), l.id)
                       from imports.invoice_line_import l
                      where l.run_id = p_run and l.status = 'ready' and l.invoice_key = c.invoice_key))
         order by c.inv_date, c.invoice_key), '[]'::jsonb)
    into v from chosen c;
  if p_lock and jsonb_array_length(v) > 0 then
    update imports.import_run set lock_until = now() + interval '7 minutes' where id = p_run;
  end if;
  return v;
end $$;
revoke all on function public.imp_fetch_batch(uuid, uuid, int, boolean) from public, anon, authenticated;

create or replace function public.imp_log_batch(p_run uuid, p_key uuid, p_batch int, p_detail jsonb)
returns void language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  insert into imports.batch_log (run_id, batch_no, invoices, lines, created, updated, failed, ms, detail)
  values (p_run, p_batch, (p_detail->>'invoices')::int, (p_detail->>'lines')::int, (p_detail->>'created')::int,
          (p_detail->>'updated')::int, (p_detail->>'failed')::int, (p_detail->>'ms')::int, p_detail);
  update imports.import_run set lock_until = null where id = p_run;
end $$;

create or replace function public.imp_set_run(p_run uuid, p_key uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  update imports.import_run
     set status = coalesce(p_status, status),
         notes = case when p_notes is null then notes else coalesce(notes,'') || E'\n' || p_notes end,
         started_at = case when p_status = 'running' and started_at is null then now() else started_at end,
         finished_at = case when p_status in ('done','aborted') then now() else finished_at end,
         lock_until = case when p_status in ('done','aborted','paused','approved') then null else lock_until end
   where id = p_run;
end $$;

create or replace function imports.call_import(p_action text, p_body jsonb)
returns bigint language sql as $$
  select net.http_post(
    url := 'https://hnmbjqhxvxakhdzgetxw.supabase.co/functions/v1/dynamics-import',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0'),
    body := p_body || jsonb_build_object('action', p_action),
    timeout_milliseconds := 390000);
$$;
select pg_notify('pgrst', 'reload schema');