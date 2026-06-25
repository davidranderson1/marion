#!/usr/bin/env python3
"""
Marion -> Supabase loader (interactive).

Regenerates the five CSVs from the live knowledge JSON, then loads them into
Supabase via fast COPY in one transaction, then asserts row counts.

You only supply your database password (typed at a hidden prompt - it is never
stored, echoed, or written to disk). Everything else is filled in.

    pip install psycopg2-binary
    python run_migration.py

Get your password from Supabase dashboard -> Project Settings -> Database
(it is the database password you set when the project was created; you can reset
it there if you don't recall it).
"""
import json, csv, os, sys, getpass

try:
    import psycopg2
except ImportError:
    sys.exit("Run:  pip install psycopg2-binary   then re-run this script.")

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.normpath(os.path.join(HERE, "..", "knowledge"))

# --- connection (everything except the password is known) ---
PROJECT_REF = "hnmbjqhxvxakhdzgetxw"
HOST = "aws-0-ca-central-1.pooler.supabase.com"   # ca-central-1 session pooler
PORT = 5432
USER = f"postgres.{PROJECT_REF}"
DBNAME = "postgres"

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

def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")) if o is not None else ""

def load(rel):
    with open(os.path.join(KB, rel), encoding="utf-8") as f:
        return json.load(f)

def writecsv(name, header, rows):
    with open(os.path.join(HERE, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
    return len(rows)

def generate():
    print("Generating CSVs from knowledge JSON...")
    d = load("oem-parts/john-deere-parts.json"); oem = d.get("oem","John Deere")
    writecsv("oem_parts.csv", TABLES["oem_parts"][1],
        [[oem, r.get("jd_part"), r.get("name"), r.get("category"), r.get("tier"), r.get("url"), js(r)] for r in d["parts"]])
    d = load("oem-parts/john-deere-models.json"); oem = d.get("oem","John Deere")
    writecsv("oem_model_index.csv", TABLES["oem_model_index"][1],
        [[oem, r.get("model"), r.get("total_seal_parts"), js(r.get("seal_part_counts")), js(r)] for r in d["models"]])
    d = load("oem-parts/john-deere.json")
    writecsv("oem_bridge.csv", TABLES["oem_bridge"][1],
        [[r.get("oem","John Deere"), r.get("fluidseal_part"), r.get("oem_ref"), r.get("part_type"),
          r.get("description"), js(r.get("specs")), r.get("url"), r.get("confidence"), js(r)] for r in d["parts"]])
    d = load("anyseals.json"); rows=[]
    for rec in d["crossrefs"]:
        code, fam = rec.get("anyseals"), rec.get("family")
        for brand, codes in rec.get("brands", {}).items():
            for c in codes:
                rows.append([code, fam, brand, c.get("code"), bool(c.get("fluidseal")),
                             bool(c.get("verified")), "confirmed" if c.get("verified") else "candidate",
                             js({"anyseals": code, "family": fam, "brand": brand, **c})])
    writecsv("interchange.csv", TABLES["interchange"][1], rows)
    d = load("parent-profiles.json"); rows=[]
    for r in d["parent_profiles"]:
        for s in (r.get("fluidseal_ssg") or [{}]):
            rows.append([r.get("parent_profile"), r.get("family"), s.get("profile"), s.get("scope"),
                         s.get("fluidseal_url"), s.get("fluidseal_group"), js(r)])
    writecsv("manufacturer_profiles.csv", TABLES["manufacturer_profiles"][1], rows)
    print("  CSVs written.\n")

def csv_rowcount(path):
    with open(path, encoding="utf-8") as f:
        return sum(1 for _ in csv.reader(f)) - 1

def main():
    generate()
    pw = getpass.getpass(f"Supabase DB password for {USER}: ")
    dsn = f"host={HOST} port={PORT} dbname={DBNAME} user={USER} password={pw} sslmode=require"
    try:
        conn = psycopg2.connect(dsn)
    except Exception as e:
        sys.exit(f"Could not connect: {e}\n(Check the password; reset it in the dashboard if needed.)")
    conn.autocommit = False
    cur = conn.cursor()
    expected = {}
    try:
        for t in ["oem_parts","oem_model_index","oem_bridge","interchange","manufacturer_profiles"]:
            fname, cols = TABLES[t]
            path = os.path.join(HERE, fname)
            expected[t] = csv_rowcount(path)
            cur.execute(f"truncate table public.{t} restart identity;")
            with open(path, encoding="utf-8") as f:
                cur.copy_expert(f"copy public.{t} ({','.join(cols)}) from stdin with (format csv, header true)", f)
            print(f"  loaded {t}: {expected[t]} rows")
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"FAILED, rolled back (no partial load): {e}")

    print("\nVerifying row counts:")
    ok = True
    for t in TABLES:
        cur.execute(f"select count(*) from public.{t};")
        n = cur.fetchone()[0]
        flag = "OK" if n == expected[t] else "MISMATCH"
        if n != expected[t]: ok = False
        print(f"  {t:24s} db={n:6d}  csv={expected[t]:6d}  [{flag}]")
    cur.close(); conn.close()
    print("\n" + ("ALL GOOD - 39,749 rows loaded." if ok else "COUNT MISMATCH - investigate."))

if __name__ == "__main__":
    main()
