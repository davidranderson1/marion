-- v6: imports.classify on the full 189k-row file — the v4 shapes timed out (a two-CTE dedupe join, a self-join for the
-- code remap, and kit grouping / kit quantities joined on unindexed text keys chose nested loops on 150k × 14k rows).
-- Same rules, same results; every heavy step now joins on the primary key after a window pass or on one grouped
-- subquery, and ANALYZE runs inside the function so the planner sees the keys it just wrote. imports schema only.
-- Run the full-file classify from SQL with statement_timeout raised (each full-table update takes 30-60 s on 189k rows).
-- 2026-09-28, Claude.
create or replace function imports.kit_quantities(p_run uuid) returns void language plpgsql as $$
begin
  update imports.invoice_line_import set qty_per_kit = null where run_id = p_run;
  update imports.invoice_line_import set kit_role = 'component' where run_id = p_run and kit_role = 'loose';
  with w as (
    select id, nullif(qty,'')::numeric as q,
           max(case when kit_role = 'header' then nullif(qty,'')::numeric end) over (partition by kit_group) as hq
      from imports.invoice_line_import
     where run_id = p_run and kit_group is not null)
  update imports.invoice_line_import c
     set qty_per_kit = case when w.hq is not null and w.hq <> 0 and w.q is not null
                             and (w.q / w.hq) = round(w.q / w.hq)
                            then w.q / w.hq end
    from w
   where c.id = w.id and c.run_id = p_run and c.kit_role = 'component';
  update imports.invoice_line_import set kit_role = 'loose' where run_id = p_run and kit_role = 'component' and qty_per_kit is null;
end $$;

-- classify calls it at the end of the kit step
create or replace function imports.classify_kits(p_run uuid) returns void language plpgsql as $$
begin
  update imports.invoice_line_import set kit_group = null, kit_role = null, qty_per_kit = null where run_id = p_run;
  with w1 as (
    select id, raw_index, ord, ship, line_no,
           dense_rank() over (partition by ord, ship, line_no order by item) as dr
      from imports.invoice_line_import
     where run_id = p_run and skip_reason is null),
  w2 as (
    select id, raw_index, ord || '-' || ship || '-' || line_no as kg,
           min(raw_index) over (partition by ord, ship, line_no) as first_row,
           max(dr) over (partition by ord, ship, line_no) as n_items
      from w1)
  update imports.invoice_line_import s
     set kit_group = w2.kg,
         kit_role  = case when s.raw_index = w2.first_row then 'header' else 'component' end
    from w2
   where s.id = w2.id and s.run_id = p_run and w2.n_items > 1;
  perform imports.kit_quantities(p_run);
end $$;