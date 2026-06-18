# Catalog Inbox — drop anything here

This is the single drop point for **all source documents** that should feed Marion's
knowledge: Fluidseal AB catalogs, manufacturer catalogs (Parker, Freudenberg, SKF,
Trelleborg, …), OEM kit/part lists (John Deere, Caterpillar, …), and industry or
technical reference PDFs. A mixture is expected — you don't have to sort them.

## How it works

1. **You drop** files in here (`knowledge/catalogs/_inbox/`). Any format: PDF, xlsx, csv, images.
2. **Marion's maintainer (Claude) parses** each file and routes the *extracted, normalized*
   data to the correct place:

   | What the source contains | Where its data goes |
   |---|---|
   | Seal **profiles** with operating limits | `manufacturers/<name>.json` (merges into the catalog via `manifest.json`) |
   | **OEM part # → Fluidseal part #** + that part's technical detail | `oem-parts/<oem>.json` (new layer for John Deere etc.) |
   | OEM/brand **design-code crossref** tables | `anyseals.json` (bridged to `parent-profiles.json`) |
   | **Application / market / industry** context | `markets/` |

3. **Raw file is archived** to `knowledge/catalogs/<source-slug>/` with a `_manifest.json`,
   and the move is logged in `_INGESTION-LEDGER.json`.

Marion never reads `_inbox` directly — only the routed JSON. The inbox is staging.

## Two reference paths (both grow over time)

- **Direct reference** — verified OEM→Fluidseal maps (e.g. `T187116 → RJD-TD187116`).
  Highest confidence.
- **Detail-based match** — when no direct map exists, Marion reasons from the required
  part's *details* (type, dimensions, material, pressure/temp/speed) against the profile
  knowledge base and proposes a best-fit Fluidseal equivalent, flagged with confidence.

## Website vs. catalog

The website (`fluidsealab.com` / `sealsonline.com`) is treated as **more current** for part
numbers and availability. Catalogs (often 3–5 yrs old) add **technical/dimensional data** the
website omits. Both are loaded; on conflict, website wins for part numbers, catalog wins for
technical depth, and the divergence is noted.
