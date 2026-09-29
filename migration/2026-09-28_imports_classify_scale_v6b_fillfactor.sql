-- v6b: full-table updates on imports.invoice_line_import cost 0.7 ms per row (20k rows = 13.8 s) because every update
-- touched ten indexes with no room for HOT updates. Keep five indexes (pkey, run/status, run/invoice_key,
-- run/content_key, run/ord/item for the credit lookup) and leave pages half empty so the classify updates
-- (all on non-indexed columns) stay HOT. imports schema only. 2026-09-28, Claude.
drop index if exists imports.ili_run_ord_ship_line_idx;
drop index if exists imports.ili_run_custcode_idx;
drop index if exists imports.ili_run_item_idx;
drop index if exists imports.ili_run_customer_code_id_idx;
drop index if exists imports.ili_run_product_wh_idx;
alter table imports.invoice_line_import set (fillfactor = 50);