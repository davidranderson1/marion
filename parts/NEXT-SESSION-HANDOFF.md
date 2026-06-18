# NEXT-SESSION HANDOFF — Marion parts/profiles

_Last updated: 2026-06-17_

## Status: clean. Tier-2 parts pipeline built, committed, and pushed.

### What was completed this session
- Built the **Tier-2 parts-interchange pipeline** and ingested the first dataset (Dichtomatik, 64,234 rows).
- Established the **two-tier architecture**:
  - **Tier 1 — Profiles** (`marion/knowledge/`): small, browser-loaded. Parent profiles, Anyseals brand-to-brand, manufacturer profiles. Marion's "translate any brand -> Fluidseal profile" brain.
  - **Tier 2 — Parts interchange** (`marion/parts/`): large part-number crosses, NOT browser-loaded. Supabase-bound for Phase 3.
  - The tiers join on **style/profile** and on **dimensions** (shaft/bore/width).

### Files on disk in `marion/parts/` (all pushed)
- `normalize_interchange.py` — reusable normalizer (one common schema; add a `parse_<vendor>()` per new file format).
- `build_style_bridge.py` — reusable style-bridge extractor.
- `parts-manifest.json` — catalog of sources + common schema + Supabase ingestion plan.
- `README.md` — documents the two-tier architecture and how to run the pipeline.
- `style-bridges/dichtomatik_style_bridge.json` — **149** competitor->Dichtomatik style links (high/medium/low confidence) + 30-entry material-code decoder. REVIEW-ONLY; nothing auto-written into parent-profiles.
- `normalized/dichtomatik_parts.jsonl.gz` — full 64,234-row normalized table, gzipped (~1.1 MB). **This is the Supabase ingestion source.**
- `normalized/dichtomatik_parts_sample.csv` — first 500 rows for eyeballing.
- `sources/Dichtomatik_Interchange_1-2022.xlsb` — original source file.

### Key facts
- **Dichtomatik = Freudenberg's "red" line** (Freudenberg "blue" = premium tier). A confirmed Dichtomatik style implies a Freudenberg-family equivalent.
- Dichtomatik file crosses 8 competitors: SKF, National, Harwal, Parker, Boyd, Parco, US Seal + DIN/ISO/BS/JIS standards.
- Fit breakdown: 36,837 direct / 6,387 approx / 19,973 no-interchange (kept as gap data) / 1,037 unknown.
- Part# crossover != profile crossover, but joins at the style/profile + dimensions level.

## NEXT TASK — vet the style-bridge and seed OEM columns on parent-profiles.json
- `dichtomatik_style_bridge.json` (149 links) can seed the **Freudenberg / Dichtomatik** columns on parent profiles.
- The Anyseals data (`knowledge/anyseals.json`, from the Anyseals cross-ref PDF) gives a ready-made **Parker** comparable list.
- BOTH require human review to match Anyseals/Dichtomatik styles to **specific** Fluidseal parents within a family (not 1:1). **Do not guess silently.**
- As OEM columns fill, the Anyseals + Dichtomatik bridges to Fluidseal parents multiply automatically.

## Other open backlog (priority order)
1. Add shaft-seals profiles to `manufacturers/fluidseal.json` so Clipper oil-seals (LUP/LPD/LDS/RUP/RPD) + RT rotary family resolve to a specific profile+URL (currently bridge to group only).
2. Fill `exact_equivalent` 1:1 matches in `crossref.json` (needs Hallite cross-ref sheets).
3. Cutaway View (Phase 2.5) — interactive cylinder-seal-selector. Prototype now in the repo at `marion\cutaway\cylinder-seal-selector_7.html` (callout coords in `cutaway\cylinder-positions.json`).
4. Add Freudenberg/SKF/Trelleborg/Parker manufacturer files; List/Cards/Compare view toggle.
5. Load more interchange files into the parts pipeline to widen the dataset.

## Standing working rules (always apply)
- **Write files directly to their proper repo folders** via the Filesystem tools. No drag-and-drop / download steps.
- **Every handoff = write a `NEXT-SESSION-HANDOFF.md` to disk** in the repo (this file).
- **Git commit summary name is always `summary`** (detailed body underneath when asked).
- Keep the Excel workbook in lockstep with the HTML when applicable; update without being asked.
- 31MB poster HTML edits: use `edit_file` targeted string replace, never `write_file`; the oversized-diff error is cosmetic, the write succeeds — verify by pulling back.
- Build philosophy: **Train First, Connect Later.**
- Prefer going straight to public deploy; archive over delete; surface only genuine blockers.

## Key paths
- Marion repo: `C:\Users\d.anderson\OneDrive - Sealing Solutions Group\ClaudeAgent\Marion\marion\`
- Parts pipeline: `...\marion\parts\`
- Knowledge (Tier 1): `...\marion\knowledge\`
- Parent-profile source xlsx: `Parent Profiles - Manufacturer Profiles.xlsx` (Downloads / master)
