#!/usr/bin/env python3
"""
Style-bridge extractor.

Reads a normalized parts JSONL (from normalize_interchange.py) and extracts the
competitor-STYLE -> house-STYLE mappings plus the material-code decoder. This is
the PROFILE-level connective tissue that links the Tier-2 parts interchange back
to Fluidseal's Tier-1 parent-profile model.

IMPORTANT: output is a PROPOSAL for human review. Nothing here is written into
parent-profiles.json automatically. Once vetted, confirmed style links can seed
the Freudenberg/Dichtomatik columns on the parent profiles.

Two evidence sources, cross-checked:
  (A) structured columns: competitor_style + house_style on the same row
  (B) rationale text: "Style X to Y => ..." and "Material X to Y => ..."

Usage:
  python build_style_bridge.py <normalized_jsonl> <house_brand> <out_json>
  e.g.
  python build_style_bridge.py normalized/dichtomatik_parts.jsonl Dichtomatik style-bridges/dichtomatik_style_bridge.json

confidence is volume-based: high (>=50 supporting parts or rationale hits),
medium (>=10), else low.
"""
import sys, os, json, re
from collections import Counter, defaultdict

# product-line / non-style labels to skip
SKIP = {'O-RING', 'MECHANICAL SEALS', 'BACKUP RING'}

STYLE_RE = re.compile(r'Style\s+([A-Za-z0-9\-\/]+)\s+to\s+([A-Za-z0-9\-\/]+)\s*=>', re.I)
MAT_RE = re.compile(r'Material\s*([A-Za-z0-9]+)\s*to\s*([A-Za-z0-9]+)\s*=>', re.I)


def looks_like_style(x):
    return x and x.upper() not in SKIP


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    jsonl, house_brand, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = [json.loads(l) for l in open(jsonl, encoding="utf-8")]

    triple = Counter()
    triple_fit = defaultdict(Counter)
    rat_pairs = Counter()
    matmap = Counter()
    src_files = set()

    for r in rows:
        src_files.add(r.get('source_file'))
        cs, hs, cb = r.get('competitor_style'), r.get('house_style'), r.get('competitor_brand')
        if cs and hs and cb and r['fit_type'] in ('direct', 'approx'):
            triple[(cb, cs, hs)] += 1
            triple_fit[(cb, cs, hs)][r['fit_type']] += 1
        note = r.get('fit_notes') or ''
        for m in STYLE_RE.finditer(note):
            rat_pairs[(m.group(1).upper(), m.group(2).upper())] += 1
        for m in MAT_RE.finditer(note):
            matmap[(m.group(1).upper(), m.group(2).upper())] += 1

    bridge = []
    for (cb, cs, hs), n in sorted(triple.items(), key=lambda kv: -kv[1]):
        if not looks_like_style(cs) or not looks_like_style(hs):
            continue
        cs_norm = cs[:-2] if cs.endswith('.0') else cs
        rat_n = rat_pairs.get((cs_norm.upper(), hs.upper()), 0)
        conf = 'high' if (n >= 50 or rat_n >= 50) else ('medium' if (n >= 10 or rat_n >= 10) else 'low')
        bridge.append({
            "competitor_brand": cb,
            "competitor_style": cs_norm,
            "house_style": hs,
            "count": n,
            "fit": dict(triple_fit[(cb, cs, hs)]),
            "rationale_confirmations": rat_n,
            "confidence": conf,
        })

    material_map = [
        {"competitor_code": a, "house_code": b, "count": n}
        for (a, b), n in sorted(matmap.items(), key=lambda kv: -kv[1])
    ]

    out = {
        "_note": ("Style/profile bridge extracted from a parts interchange. Each record links a competitor STYLE "
                  "(e.g. SKF CRW1) to a house STYLE (e.g. Dichtomatik SB-H), from the structured Style columns and "
                  "cross-confirmed against the 'Style X to Y' rationale text. PROFILE-level connective tissue between "
                  "the parts interchange and Fluidseal's parent-profile model. REVIEW BEFORE PROMOTION: proposed "
                  "mappings for a human to vet; nothing here is written into parent-profiles.json automatically. "
                  "'confidence' is volume-based. material_code_map decodes lip/case/spring material short codes."),
        "source_files": sorted(x for x in src_files if x),
        "version": "1.0",
        "house_brand": house_brand,
        "style_bridge_count": len(bridge),
        "style_bridge": bridge,
        "material_code_map": material_map,
    }
    os.makedirs(os.path.dirname(out_json) or ".", exist_ok=True)
    json.dump(out, open(out_json, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("style bridge records:", len(bridge), "| material codes:", len(material_map))
    print("wrote", out_json)


if __name__ == "__main__":
    main()
