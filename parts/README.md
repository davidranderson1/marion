# Marion — Parts Interchange (Tier 2)

This folder holds **part-number interchange** datasets — a different layer from the
profile knowledge Marion loads in the browser.

## Two tiers

**Tier 1 — Profiles** (`/knowledge`, browser-loaded)
Small, curated. Parent profiles, Anyseals brand-to-brand, manufacturer profiles.
This is Marion's "translate any brand → Fluidseal profile" brain. Hundreds of rows.

**Tier 2 — Parts interchange** (`/parts`, NOT browser-loaded)
Large part-number crosses (this folder). Tens of thousands of rows per file, many
files coming. Destined for Supabase in Phase 3. Each file normalizes into one
common schema so every vendor's interchange lands in the same table.

The tiers join in two ways:
1. **Style/profile** — a competitor style (e.g. SKF `CRW1`) maps to a house style
   (Dichtomatik `SB-H`) via the **style-bridge**, which then maps to a Fluidseal
   parent profile. This is how part data feeds the profile model.
2. **Dimensions** — shaft / bore / width let a competitor part resolve to a
   Fluidseal profile even with no exact part-number cross.

> **Why not in the browser?** 64k rows × many files is a database, not a knowledge
> file. Forcing it into Marion's startup load would break the page. It belongs in
> Supabase (Phase 3); Marion will query it server-side.

## Layout

```
parts/
  parts-manifest.json          catalog of sources + common schema + Supabase plan
  normalize_interchange.py     reusable: any interchange file -> normalized JSONL
  build_style_bridge.py        reusable: normalized JSONL -> style-bridge (review artifact)
  sources/                     original vendor files (e.g. the .xlsb)
  normalized/                  normalized output: <fmt>_parts.jsonl(.gz) + sample CSV
  style-bridges/               extracted competitor-style -> house-style maps (REVIEW before promotion)
```

## Run the pipeline (for the next file)

```bash
pip install pyxlsb

# 1. normalize a source file into the common schema
python normalize_interchange.py sources/<FILE> <format> normalized
#    -> normalized/<format>_parts.jsonl  (+ _parts_sample.csv)

# 2. extract the style bridge (proposal for human review)
python build_style_bridge.py normalized/<format>_parts.jsonl <HouseBrand> style-bridges/<format>_style_bridge.json
```

Adding a new vendor format = add one `parse_<vendor>()` to `normalize_interchange.py`
that emits the common schema. Everything downstream is shared.

## First dataset: Dichtomatik (Jan 2022)

- 64,234 rows. Dichtomatik = Freudenberg's "red" line (Freudenberg "blue" = premium).
- Crosses SKF, National, Harwal, Parker, Boyd, Parco, US Seal + DIN/ISO/BS/JIS standards.
- Fit: 36,837 direct · 6,387 approx · 19,973 no-interchange · 1,037 unknown.
- Style bridge: 149 competitor→Dichtomatik style links (e.g. `CRW1→SB-H`, `HMS4→SC`,
  `32→TC`) + a 30-entry material-code decoder (e.g. `R→NCC` = NBR / carbon steel).

### Review before promotion
The style-bridge is a **proposal**. Nothing is written into `parent-profiles.json`
automatically. Once vetted, confirmed Dichtomatik styles seed the **Freudenberg**
column on the parent profiles — which then makes the Anyseals and parts bridges
multiply across the whole model.

## Note on the large normalized file

`normalized/dichtomatik_parts.jsonl` is ~38 MB raw. It is stored **gzipped**
(`.jsonl.gz`, ~1.2 MB) to keep the repo light. The gzip is the canonical Supabase
ingestion artifact; the sample CSV (first 500 rows) is for eyeballing.
