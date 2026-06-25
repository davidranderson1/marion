#!/usr/bin/env python3
"""
Marion -> Supabase loader.

Loads all five CSVs in this folder into the Supabase tables using fast COPY,
inside a single transaction, then asserts row counts match the CSVs.

USAGE:
    1. Get your connection string from the Supabase dashboard:
       Project Settings -> Database -> Connection string -> URI
       (use the "Session" pooler URI, port 5432, and your DB password).
    2. Run:
       SET SUPABASE_DB_URL=postgresql://postgres.PROJECT:PASSWORD@HOST:5432/postgres
       python3 load_to_supabase.py
    (PowerShell: $env:SUPABASE_DB_URL="postgresql://..." ; python3 load_to_supabase.py)

It is safe to re-run: each table is truncated before load.
Requires: pip install psycopg2-binary
"""
import csv, os, sys

try:
    import psycopg2
except ImportError:
    sys.exit("pip install psycopg2-binary  (then re-run)")

DB = os.environ.get("SUPABASE_DB_URL")
if not DB:
    sys.exit("Set SUPABASE_DB_URL env var to your Supabase connection URI.")

HERE = os.path.dirname(os.path.abspath(__file__))

# table -> (csv file, column list in CSV order)
TABLES = {
    "oem_parts":             ("oem_parts.csv",
        ["oem","jd_part","name","category","tier","url","raw"]),
    "oem_model_index":       ("oem_model_index.csv",
        ["oem","model","total_parts","category_counts","raw"]),
    "oem_bridge":            ("oem_bridge.csv",
        ["oem","fluidseal_part","oem_ref","part_type","description","specs","url","confidence","raw"]),
    "interchange":           ("interchange.csv",
        ["anyseals_code","family","brand","brand_code","is_fluidseal","verified","status","raw"]),
    "manufacturer_profiles": ("manufacturer_profiles.csv",
        ["parent_profile","family","profile","scope","fluidseal_url","fluidseal_group","raw"]),
}

def csv_rowcount(path):
    with open(path, encoding="utf-8") as f:
        return sum(1 for _ in csv.reader(f)) - 1  # minus header

def main():
    conn = psycopg2.connect(DB)
    conn.autocommit = False
    cur = conn.cursor()
    expected = {}
    try:
        order = ["oem_parts","oem_model_index","oem_bridge","interchange","manufacturer_profiles"]
        for t in order:
            fname, cols = TABLES[t]
            path = os.path.join(HERE, fname)
            expected[t] = csv_rowcount(path)
            cur.execute(f"truncate table public.{t} restart identity;")
            with open(path, encoding="utf-8") as f:
                cur.copy_expert(
                    f"copy public.{t} ({','.join(cols)}) from stdin with (format csv, header true)",
                    f,
                )
            print(f"  loaded {t}: {expected[t]} rows (from CSV)")
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"FAILED, rolled back: {e}")

    print("\nverifying row counts:")
    ok = True
    for t in TABLES:
        cur.execute(f"select count(*) from public.{t};")
        n = cur.fetchone()[0]
        flag = "OK" if n == expected[t] else "MISMATCH"
        if n != expected[t]:
            ok = False
        print(f"  {t:24s} db={n:6d}  csv={expected[t]:6d}  [{flag}]")
    cur.close(); conn.close()
    print("\n" + ("ALL GOOD" if ok else "COUNT MISMATCH - investigate"))

if __name__ == "__main__":
    main()
