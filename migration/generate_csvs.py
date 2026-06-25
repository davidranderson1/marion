#!/usr/bin/env python3
"""
Marion -> Supabase CSV generator.

Reads the live knowledge JSON files and writes the five load CSVs next to this
script. Run this, then run load_to_supabase.py.

Source files (relative to repo knowledge/ dir):
  oem-parts/john-deere.json         -> oem_bridge.csv          (82 curated)
  oem-parts/john-deere-parts.json   -> oem_parts.csv           (35425 harvested)
  oem-parts/john-deere-models.json  -> oem_model_index.csv     (3669 model index)
  anyseals.json                     -> interchange.csv         (325 flattened)
  parent-profiles.json              -> manufacturer_profiles.csv (248 flattened)
"""
import json, csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.normpath(os.path.join(HERE, "..", "knowledge"))

def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")) if o is not None else ""

def load(rel):
    with open(os.path.join(KB, rel), encoding="utf-8") as f:
        return json.load(f)

def writecsv(name, header, rows):
    with open(os.path.join(HERE, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
    print(f"  {name}: {len(rows)} rows")
    return len(rows)

def main():
    counts = {}

    d = load("oem-parts/john-deere-parts.json"); oem = d.get("oem", "John Deere")
    counts["oem_parts"] = writecsv("oem_parts.csv",
        ["oem","jd_part","name","category","tier","url","raw"],
        [[oem, r.get("jd_part"), r.get("name"), r.get("category"), r.get("tier"), r.get("url"), js(r)] for r in d["parts"]])

    d = load("oem-parts/john-deere-models.json"); oem = d.get("oem", "John Deere")
    counts["oem_model_index"] = writecsv("oem_model_index.csv",
        ["oem","model","total_parts","category_counts","raw"],
        [[oem, r.get("model"), r.get("total_seal_parts"), js(r.get("seal_part_counts")), js(r)] for r in d["models"]])

    d = load("oem-parts/john-deere.json")
    counts["oem_bridge"] = writecsv("oem_bridge.csv",
        ["oem","fluidseal_part","oem_ref","part_type","description","specs","url","confidence","raw"],
        [[r.get("oem","John Deere"), r.get("fluidseal_part"), r.get("oem_ref"), r.get("part_type"),
          r.get("description"), js(r.get("specs")), r.get("url"), r.get("confidence"), js(r)] for r in d["parts"]])

    d = load("anyseals.json"); rows = []
    for rec in d["crossrefs"]:
        code, fam = rec.get("anyseals"), rec.get("family")
        for brand, codes in rec.get("brands", {}).items():
            for c in codes:
                rows.append([code, fam, brand, c.get("code"), bool(c.get("fluidseal")),
                             bool(c.get("verified")), "confirmed" if c.get("verified") else "candidate",
                             js({"anyseals": code, "family": fam, "brand": brand, **c})])
    counts["interchange"] = writecsv("interchange.csv",
        ["anyseals_code","family","brand","brand_code","is_fluidseal","verified","status","raw"], rows)

    d = load("parent-profiles.json"); rows = []
    for r in d["parent_profiles"]:
        for s in (r.get("fluidseal_ssg") or [{}]):
            rows.append([r.get("parent_profile"), r.get("family"), s.get("profile"), s.get("scope"),
                         s.get("fluidseal_url"), s.get("fluidseal_group"), js(r)])
    counts["manufacturer_profiles"] = writecsv("manufacturer_profiles.csv",
        ["parent_profile","family","profile","scope","fluidseal_url","fluidseal_group","raw"], rows)

    print("\nExpected counts:", json.dumps(counts))

if __name__ == "__main__":
    main()
