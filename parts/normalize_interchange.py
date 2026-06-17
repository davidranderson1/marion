#!/usr/bin/env python3
"""
Fluidseal parts-interchange normalizer.

Reads a vendor PART-NUMBER interchange file and emits a normalized parts table
to one common Fluidseal schema. This is the Tier-2 (parts) pipeline: it is
SEPARATE from the Tier-1 profile knowledge that Marion loads in the browser.
Many vendor interchange files will flow through here; each new source format
gets its own parse_<vendor>() function, all emitting the same schema below.

Common normalized schema (one row per competitor-part -> house-part link):
  source_file            : provenance
  house_brand            : brand whose catalog this maps INTO (e.g. Dichtomatik)
  house_partno           : house part number (the equivalent offered)
  house_legacy_partno    : legacy/alt house number if present
  house_style            : house style/profile code  (joins to the profile layer)
  house_material_codes   : house lip/case/spring material short code
  competitor_brand       : brand being crossed FROM (SKF, National, Parker...)
  competitor_partno      : competitor part number / interchange item
  competitor_style       : competitor style/profile code if given
  product_line           : O-RING / OIL SEALS / Mechanical Seals ...
  shaft_in, bore_in, width_in : nominal dims (inch), house side preferred
  lip_material, case_material, spring_material, material_desc
  fit_type               : direct | approx | no_interchange | unknown
  fit_value              : numeric fit score where present (0 = exact)
  fit_notes              : raw rationale text (preserved verbatim)
  description            : house description string

Usage:
  python normalize_interchange.py <source_file> <format> <out_dir>
  e.g.
  python normalize_interchange.py sources/Dichtomatik_Interchange_1-2022.xlsb dichtomatik normalized

Requires: pyxlsb  (pip install pyxlsb)
Outputs:  <out_dir>/<format>_parts.jsonl   (full normalized table, streamable)
          <out_dir>/<format>_parts_sample.csv (first 500 rows, for eyeballing)

The JSONL is the canonical artifact for Supabase ingestion in Phase 3.
"""
import sys, os, json, math, csv

try:
    import pyxlsb
except ImportError:
    pyxlsb = None


# ---------- helpers ----------
def s(v):
    if v is None:
        return None
    t = str(v).strip()
    return t if t and t.lower() != 'nan' else None


def fnum(v):
    try:
        if v is None:
            return None
        f = float(v)
        if math.isnan(f):
            return None
        return round(f, 4)
    except Exception:
        return None


def classify_fit(fit_value, rationale):
    r = (rationale or '').strip()
    rl = r.lower()
    if rl.startswith('no interchange'):
        return 'no_interchange'
    fv = fnum(fit_value)
    if rl == 'direct' or rl == '-' or fv == 0.0:
        # a bare "direct" or exact fit value
        if 'direct' in rl and any(k in rl for k in [
                'width', 'no bore', 'no rolled', 'minus', 'less', 'greater',
                'shorter', 'unknown', 'not ', 'zinc']):
            return 'approx'
        return 'direct'
    if 'direct' in rl:
        if any(k in rl for k in [
                'width', 'no bore', 'no rolled', 'minus', 'less', 'greater',
                'shorter', 'unknown', 'not ', 'zinc']):
            return 'approx'
        return 'direct'
    if fv is not None and fv > 0:
        return 'approx'
    if r == '' and fv is None:
        return 'unknown'
    return 'approx'


# ---------- Dichtomatik xlsb format ----------
# Sheet 'data'. Cols 0-7 = competitor (FROM) side, cols 8-20 = Dichtomatik side.
def parse_dichtomatik(path):
    if pyxlsb is None:
        raise RuntimeError("pyxlsb not installed: pip install pyxlsb")
    src_name = os.path.basename(path)
    wb = pyxlsb.open_workbook(path)
    rows = []
    with wb.get_sheet('data') as sheet:
        for i, row in enumerate(sheet.rows()):
            if i == 0:
                continue
            v = [c.v for c in row]
            if not v or s(v[0]) is None:
                continue
            comp_partno = s(v[0]); comp_brand = s(v[1]); product_line = s(v[2])
            comp_style = s(v[3]); comp_lip = s(v[4])
            comp_shaft = fnum(v[5]); comp_bore = fnum(v[6]); comp_width = fnum(v[7])
            house_partno = s(v[8])
            if house_partno and house_partno.endswith('.0'):
                house_partno = house_partno[:-2]
            house_legacy = s(v[9]); house_style = s(v[10]); house_matcodes = s(v[11])
            house_shaft = fnum(v[12]); house_bore = fnum(v[13]); house_width = fnum(v[14])
            lip = s(v[15]); case = s(v[16]); spring = s(v[17])
            desc = s(v[18]); fit_value = fnum(v[19]); rationale = s(v[20])
            rows.append({
                "source_file": src_name,
                "house_brand": "Dichtomatik",
                "house_partno": house_partno,
                "house_legacy_partno": house_legacy,
                "house_style": house_style,
                "house_material_codes": house_matcodes,
                "competitor_brand": comp_brand,
                "competitor_partno": comp_partno,
                "competitor_style": comp_style,
                "product_line": product_line,
                "shaft_in": house_shaft if house_shaft is not None else comp_shaft,
                "bore_in": house_bore if house_bore is not None else comp_bore,
                "width_in": house_width if house_width is not None else comp_width,
                "lip_material": lip or comp_lip,
                "case_material": case,
                "spring_material": spring,
                "material_desc": lip,
                "fit_type": classify_fit(fit_value, rationale),
                "fit_value": fit_value,
                "fit_notes": rationale,
                "description": desc,
            })
    return rows


PARSERS = {"dichtomatik": parse_dichtomatik}


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    fmt = sys.argv[2]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else "normalized"
    if fmt not in PARSERS:
        print("Unknown format %r. Known: %s" % (fmt, ", ".join(PARSERS)))
        sys.exit(1)
    os.makedirs(out_dir, exist_ok=True)
    rows = PARSERS[fmt](src)
    print("normalized rows:", len(rows))
    jsonl_path = os.path.join(out_dir, fmt + "_parts.jsonl")
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    if rows:
        csv_path = os.path.join(out_dir, fmt + "_parts_sample.csv")
        keys = list(rows[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            for r in rows[:500]:
                w.writerow(r)
    print("wrote", jsonl_path)


if __name__ == "__main__":
    main()
