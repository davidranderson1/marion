-- v10: public.imp_queue_rows — the dynamics-import 'queue' action rebuilds imports.run_queue from the source file
-- (one row per invoice) so nothing scans the 189k-row staging table on a disk whose IO budget is spent.
-- Logged imp_* surface, service_role only. 2026-09-29, Claude.
create or replace function public.imp_queue_rows(p_run uuid, p_key uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, imports as $$
declare n int;
begin
  perform public.imp_check_key(p_run, p_key);
  insert into imports.run_queue (run_id, invoice_key, inv_date, n_lines)
  select p_run, r->>'invoice_key', (r->>'inv_date')::date, (r->>'n_lines')::int
    from jsonb_array_elements(p_rows) r
  on conflict (run_id, invoice_key) do update set inv_date = excluded.inv_date, n_lines = excluded.n_lines;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.imp_queue_rows(uuid, uuid, jsonb) from public, anon, authenticated;
select pg_notify('pgrst', 'reload schema');