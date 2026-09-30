-- v13: "The specified unit is not valid for this product" — a few products are not in the unit group of the fixed
-- LI-INVOICE unit. Such an invoice is retried once with each product's own default unit: the watchdog flags the lines
-- (needs_uom), imp_fetch_batch carries the flag, the function looks the products' defaultuomid up and binds it.
-- imports schema + logged public.imp_* surface. 2026-09-30, Claude.
alter table imports.invoice_line_import add column if not exists needs_uom boolean not null default false;

create or replace function imports.retry_unit_errors(p_run uuid) returns int language plpgsql as $$
declare n int;
begin
  with r as (
    update imports.invoice_line_import set status = 'ready', error = null, needs_uom = true
     where run_id = p_run and status = 'error' and not needs_uom
       and error like '%specified unit is not valid for this product%'
     returning invoice_key)
  update imports.run_queue q set done = false, retry_after = null from (select distinct invoice_key from r) k
   where q.run_id = p_run and q.invoice_key = k.invoice_key;
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
                        'qty_per_kit', l.qty_per_kit, 'needs_uom', l.needs_uom,
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

create or replace function imports.watchdog(p_run uuid) returns text language plpgsql as $$
declare r imports.import_run; v_in_window int; v_total int; v_from date; v_to date; v_moved text := ''; v_res text; v_q int; v_retried int;
begin
  select * into r from imports.import_run where id = p_run;
  select count(*) into v_q from net.http_request_queue;
  if r.status not in ('running', 'approved') then v_res := 'status ' || r.status; insert into imports.watchdog_log(result, lock_until, queued) values (v_res, r.lock_until, v_q); return v_res; end if;
  v_retried := imports.retry_deadlocks(p_run) + imports.retry_unit_errors(p_run);
  select count(*) filter (where inv_date >= coalesce(r.window_from, '1900-01-01') and inv_date <= coalesce(r.window_to, '2999-12-31')), count(*)
    into v_in_window, v_total
    from imports.run_queue where run_id = p_run and not done;
  if v_total = 0 then
    update imports.import_run set status = 'done', finished_at = now(), lock_until = null,
           notes = notes || E'\n' || to_char(now(), 'YYYY-MM-DD HH24:MI') || 'Z watchdog: no open invoice left — done' where id = p_run;
    insert into imports.watchdog_log(result, lock_until, queued) values ('done', r.lock_until, v_q);
    return 'done';
  end if;
  if v_in_window = 0 then
    select date_trunc('month', max(inv_date))::date into v_from from imports.run_queue where run_id = p_run and not done;
    v_to := (v_from + interval '1 month' - interval '1 day')::date;
    update imports.import_run set window_from = v_from, window_to = v_to, status = 'running', lock_until = null,
           notes = notes || E'\n' || to_char(now(), 'YYYY-MM-DD HH24:MI') || 'Z watchdog: window -> ' || v_from || ' .. ' || v_to where id = p_run;
    r.lock_until := null; r.status := 'running';
    v_moved := 'window ' || v_from || '..' || v_to || '; ';
  elsif r.status = 'approved' then
    update imports.import_run set status = 'running' where id = p_run;
  end if;
  if (r.lock_until is null or r.lock_until < now()) and v_q = 0 then
    perform imports.call_import('run', jsonb_build_object('run_id', p_run, 'run_key', r.run_key, 'confirm', true, 'chain', true, 'max_lines', r.max_lines));
    v_res := v_moved || 'kicked';
  else
    v_res := v_moved || 'busy';
  end if;
  if v_retried > 0 then v_res := v_res || ' retried ' || v_retried; end if;
  insert into imports.watchdog_log(result, lock_until, queued) values (v_res, r.lock_until, v_q);
  return v_res;
end $$;
select pg_notify('pgrst', 'reload schema');