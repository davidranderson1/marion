-- v11 (final shape as running 2026-09-29/30): imports.watchdog(run) + imports.retry_deadlocks(run) + imports.watchdog_log.
-- Called by the TEMPORARY pg_cron job 'dynamics-import-watchdog' (*/2 * * * *) for the duration of David's full load
-- ("keep the flows off and work through all of the months, keep going", 2026-09-29). It re-kicks the dynamics-import
-- edge function when no invocation holds the run lock and no request is in flight, moves the run's date window to the
-- previous month once the current one has no open invoice (most recent month first), retries invoices that failed on
-- transient Dataverse errors (SQL deadlock 1205, "another request is currently using the resource"), marks the run done
-- when nothing is open. The cron job is removed when the load is done. imports schema only. Claude.
create table if not exists imports.watchdog_log (at timestamptz default now(), result text, lock_until timestamptz, queued int);

create or replace function imports.retry_deadlocks(p_run uuid) returns int language plpgsql as $$
declare n int;
begin
  with r as (
    update imports.invoice_line_import set status = 'ready', error = null
     where run_id = p_run and status = 'error' and loaded_at < now() - interval '3 minutes'
       and (error like '%Sql Number: 1205%' or error like '%another request is currently using the resource%')
     returning invoice_key)
  update imports.run_queue q set done = false from (select distinct invoice_key from r) k
   where q.run_id = p_run and q.invoice_key = k.invoice_key;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function imports.watchdog(p_run uuid) returns text language plpgsql as $$
declare r imports.import_run; v_in_window int; v_total int; v_from date; v_to date; v_moved text := ''; v_res text; v_q int; v_retried int;
begin
  select * into r from imports.import_run where id = p_run;
  select count(*) into v_q from net.http_request_queue;
  if r.status not in ('running', 'approved') then v_res := 'status ' || r.status; insert into imports.watchdog_log(result, lock_until, queued) values (v_res, r.lock_until, v_q); return v_res; end if;
  v_retried := imports.retry_deadlocks(p_run);
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
    -- next window = the month of the most recent open invoice (most recent month first; a retried invoice in an
    -- earlier-finished month is picked up at the end the same way)
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

-- the temporary job (removed when the run is done):
-- select cron.schedule('dynamics-import-watchdog', '*/2 * * * *', $job$select imports.watchdog('9eb52bff-a50d-41ba-9c49-7637640d64f7')$job$);
-- select cron.unschedule('dynamics-import-watchdog');
