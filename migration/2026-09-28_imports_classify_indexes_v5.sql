-- v5: indexes so imports.classify scales to the full 189k-row file (the first full run spent minutes in seq scans:
-- the credit "original sale" lookup scanned the staging table once per credit row, and twelve full-table updates
-- bloated it to 437 MB / 1.06 M dead tuples). imports schema only; public untouched. 2026-09-28, Claude.
create index if not exists ili_run_ord_item_idx on imports.invoice_line_import (run_id, ord, item);
create index if not exists ili_run_ord_ship_line_idx on imports.invoice_line_import (run_id, ord, ship, line_no);
create index if not exists ili_run_custcode_idx on imports.invoice_line_import (run_id, cust_code_effective);
create index if not exists ili_run_item_idx on imports.invoice_line_import (run_id, item);
create index if not exists ili_run_customer_code_id_idx on imports.invoice_line_import (run_id, customer_code_id);
create index if not exists ili_run_product_wh_idx on imports.invoice_line_import (run_id, product_id, warehouse_id);
analyze imports.invoice_line_import;