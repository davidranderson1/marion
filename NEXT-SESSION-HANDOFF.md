# NEXT-SESSION-HANDOFF.md

**Session date:** 2026-06-19
**Focus:** Knowledge dashboard — split "What Marion Knows" + "Brain" into a dedicated page

---

## What shipped this session

New **`knowledge.html`** (repo root, served alongside `index.html`) — a standalone, live-reading
whole-brain knowledge dashboard. Reads the same `/knowledge` files as `index.html` (manifest +
product-groups + profiles + parent-profiles), so counts never go stale. Three tabs:

1. **Catalog** — manufacturer cards (loaded / specs-pending / planned status), then the 8 parent
   FAMILIES as profile groups, each drilling into parent profiles (with vendor tags) + Fluidseal
   profile links + sealsonline category links. Tree is family-driven and verified to reconcile to
   all 221 parents with **no double-count and no orphaned families** (Gaskets/Backups included).
   Vee Packings + Mechanical Seals shown as standalone profile-only groups (no parent family).
2. **OEM Parts** — the John Deere three-layer card (82 bridge / 35,425 namespace / 3,669 models)
   that was previously invisible in the rail panel, plus "Next OEMs" template slots
   (Caterpillar/Hitachi/Komatsu).
3. **Cross-Reference** — vendor coverage bars (the worklist: FS Xpress 66%, DMH 66%, FS/SSG 29%,
   Parker <1%), by-family FS-coverage table, and the cross-ref source list. The old anyseals
   "Taiwan/China" label is rendered as "Industry Standard" (yellow / FS-verified) per anyseals v1.1.

**`index.html`** — 4 targeted edits: (1) added a "Knowledge" link to the top nav; (2) added
`.kb-badge` CSS; (3) replaced the big "What Marion Knows" rail panel with a slim live badge
(profiles count + manufacturer / OEM-parts / category-group chips) that links to `knowledge.html`;
(4) rewrote `renderKnowledgePanel()` to populate the new chips instead of the old manufacturer list.
Marion's Brain (connect) and Cross-Reference lookup stay on the home rail. JS validated
(`node --check`); all three tabs rendered against live data via headless Chrome with no JS errors.

**Design:** `knowledge.html` reuses Marion's exact design tokens (Big Shoulders / Inter / JetBrains
Mono, amber/ink/paper palette, the panel + sticky-rail idiom) so it reads as the same product.

---

## Open / next

1. **Commit + push** (summary `summary`): `knowledge.html` (new) + `index.html` (modified). Then
   confirm live at marion.fluidsealab.com/knowledge.html that the badge + tabs read real counts.
2. The Catalog manufacturer-status heuristic is note-based (`pending`/`scaffold`/`null` → amber).
   When Freudenberg/Parker `fluidseal_equivalent` mappings land in parent-profiles, those cards
   flip to green automatically — no code change needed, but worth a glance after the next mapping.
3. `renderOemCats()` shows the 4 JD categories as static pills; if you want live per-category part
   counts on the OEM card, they'd need to be added to the manifest oem_parts entries.
4. Deep-links work: `knowledge.html#oem` / `#xref` / `#catalog` open the right tab.

---

## Carry-over from prior sessions (still open)

- john-deere.json v1.1 dimensional correction write (Filesystem timeout last attempt).
- Fluidseal World: David to create `fluidseal-world\` folder, then standard go-live.
- Overflow harvest of the 3 capped JD categories (O-Rings/Seals/Gaskets truncated at 10k).
- Serial-layer decision (login-gated behind partscatalog.deere.com).

---

---

# (prior session) NEXT-SESSION-HANDOFF.md

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
