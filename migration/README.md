# Marion → Supabase migration

One-time load of the Marion knowledge data into Supabase Postgres.

## What goes where

| Table | Source file | Rows | Notes |
|---|---|---|---|
| `oem_parts` | `knowledge/oem-parts/john-deere-parts.json` | 35,425 | Raw harvested JD namespace (jd_part, name, category, tier, url). 3 categories capped at 10,000. |
| `oem_model_index` | `knowledge/oem-parts/john-deere-models.json` | 3,669 | Model → seal-part category counts. Fitment stays on-demand via API. |
| `oem_bridge` | `knowledge/oem-parts/john-deere.json` | 82 | Curated fluidseal_part ↔ oem_ref with specs. **Currently v1.0.** |
| `interchange` | `knowledge/anyseals.json` | 325 | Flattened anyseals crossrefs (one row per brand-code). status='confirmed' where verified. |
| `manufacturer_profiles` | `knowledge/parent-profiles.json` | 248 | Flattened parent_profile → fluidseal_ssg. |

Total: 39,749 rows.

## Run it

```
pip install psycopg2-binary
python3 generate_csvs.py
set SUPABASE_DB_URL=postgresql://postgres.PROJECT:PASSWORD@HOST:5432/postgres
python3 load_to_supabase.py
```

Get the connection URI from Supabase dashboard → Project Settings → Database →
Connection string → URI (Session pooler, port 5432, your DB password).

The loader truncates each table, COPYs the CSVs in one transaction, then asserts
db row counts == csv row counts. Safe to re-run.

## Schema

Already applied to the project via migration `marion_schema_v2_real_data`
(project hnmbjqhxvxakhdzgetxw). All five tables exist and are empty until loaded.

## Before production cutover — two open items

1. **`john-deere.json` is version 1.0.** The pending v1.1 dimensional correction
   (flagged in handoff notes as possibly not landed due to a connector timeout)
   should be confirmed/applied to the source file BEFORE loading the bridge, or
   the correction will need redoing in two places. Re-run `generate_csvs.py` and
   reload `oem_bridge` after fixing the source.

2. **RLS is OFF on all five tables.** They are customer-facing via Marion. Before
   cutover, enable RLS with public-read / service-role-write. The interchange
   policy should expose only status='confirmed' so review-only candidates stay
   private:

   ```sql
   alter table public.oem_parts             enable row level security;
   alter table public.oem_model_index       enable row level security;
   alter table public.oem_bridge            enable row level security;
   alter table public.interchange           enable row level security;
   alter table public.manufacturer_profiles enable row level security;

   create policy "public read" on public.oem_parts             for select using (true);
   create policy "public read" on public.oem_model_index       for select using (true);
   create policy "public read" on public.oem_bridge            for select using (true);
   create policy "public read" on public.manufacturer_profiles for select using (true);
   create policy "public read confirmed" on public.interchange for select using (status = 'confirmed');
   ```
