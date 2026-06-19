# NEXT-SESSION-HANDOFF.md

**Session date:** 2026-06-18
**Focus:** John Deere Equipment/Make/Model layer — live harvest from shop.deere.com

---

## What shipped this session

Three-layer OEM pattern for John Deere is now complete and registered. Manifest bumped **2.9 → 3.0**.

New files in `knowledge/oem-parts/`:

1. **john-deere-parts.json** (4.28 MB, 35,425 parts) — JD-side parts master. Unique JD seal part numbers across 4 categories with name + Original/Alternative tier. NOT a Fluidseal map; it's the JD namespace for lookup/autocomplete.
2. **john-deere-models.json** (540 KB, 3,669 models) — Equipment/Make/Model fitment index. Each JD model + per-category part counts + on-demand fitment-query recipe. **This is the reusable schema template for all future OEMs.**
3. (existing) **john-deere.json** (82 parts) — unchanged; the JD→Fluidseal RJD- bridge.

All three are in the manifest `oem_parts` array with full notes. Files were validated (parse-clean, correct counts/tiers) before the in-repo move.

---

## Key technical findings (shop.deere.com)

- Site is a Spartacus/Hybris SPA; **all** product data loads client-side from **Constructor.io** (`ac.cnstrc.com/browse/group_id/{cat}`). Static fetch returns only nav shell.
- JD's data model is **Make → Model → fitment-filter → Parts**. A part record does NOT carry its model list; fitment is only a search facet. So part↔model links are built ON DEMAND (recipe stored in models file), not pre-stored (would be millions of rows).
- Constructor.io session creds (`key`,`c`,`i`,`s`) are readable from any live shop.deere.com page or its behavioral beacon; reusable across categories.
- **API caps:** browse pagination hard-caps at 10,000 results/category (O-Rings, Seals, Gaskets all truncated at 10k — true totals higher; Back-Up Rings 5,425 = complete). Fitment facet caps at 2,000 models/category (union of 4 = 3,669 models).

### Category group IDs (for live fitment queries)
- O-Rings: `ORingsORingKits`
- Seals & Seal Kits: `6963`
- Gaskets & Gasket Kits: `3596`
- Back-Up Rings: `BackUpRings`

---

## Open / next

1. **Overflow harvest (optional):** the 3 capped categories (O-Rings/Seals/Gaskets) are truncated at 10k each. To get the rest, re-harvest with sub-facet filtering (split by `itemSubType` or by `fitment`) so each sub-query stays under 10k. Back-Up Rings is already complete.
2. **Serial layer:** shop.deere.com filters by MODEL only. Serial/PIN-level fitment is login-gated behind partscatalog.deere.com — not captured. Decide whether to pursue (dealer/credentialed) or keep serial as free-text context in Marion.
3. **Wire into Marion UI:** Marion should (a) autocomplete/look up a JD part# against john-deere-parts.json → show name/category/tier → resolve to RJD- via john-deere.json; (b) accept a JD model → confirm against john-deere-models.json → run the on-demand fitment query to list parts.
4. **Replicate pattern for next OEM** (Caterpillar/Hitachi/Komatsu) using the same 3-file structure. JD is the reference implementation.
5. **Still pending from prior sessions:** john-deere.json v1.1 dimensional correction write; anyseals.json Industry Standard yellow-chip UI render; Fluidseal World folder creation.

---

## Transport note (for large files past the 1 MB tool cap)
Filesystem read/write tools cap at 1 MB. Method that worked: build+validate on Claude side → browser-download to user's Downloads → `Filesystem:move_file` from Downloads into the repo (same-machine move passes no content through the tool, so size is irrelevant). Dual programmatic downloads can drop the 2nd file — download one at a time.
