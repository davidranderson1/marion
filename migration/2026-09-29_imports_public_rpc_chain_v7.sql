-- v7: public.imp_chain — lets the dynamics-import edge function queue its own next invocation through pg_net
-- (imports.call_import) so a month-long load runs unattended until its date window is exhausted. Same guard as the
-- other imp_* RPCs (run/key check, service_role only). Part of the logged imp_* surface, nothing else in public. 2026-09-29, Claude.
create or replace function public.imp_chain(p_run uuid, p_key uuid, p_body jsonb)
returns bigint language plpgsql security definer set search_path = public, imports as $$
begin
  perform public.imp_check_key(p_run, p_key);
  return imports.call_import('run', p_body);
end $$;
revoke all on function public.imp_chain(uuid, uuid, jsonb) from public, anon, authenticated;