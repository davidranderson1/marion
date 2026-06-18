# Marion — Next Session Handoff: Cylinder Cutaway View

Paste the kickoff block below into a NEW chat in the same Claude Project. Everything Marion
needs is on disk in the repo and described here. The cutaway files now live IN the repo
(`marion\cutaway\`), so the new chat can read them directly — no upload needed.

====================================================================
KICKOFF MESSAGE — copy everything between the lines into the new chat
--------------------------------------------------------------------
Continuing **Marion**, Fluidseal AB's customer-facing AI sealing agent. Phase 2 is LIVE at
https://marion.fluidsealab.com/ (yellow/black chat page, "What Marion Knows" panel, offline
recommender + optional Claude API).

This session we build Marion's first real VIEW: the **Cutaway View** (interactive cylinder
seal selector — answers shown in their physical place on the equipment). Get the cylinder
cutaway working properly and wired to Marion before any other equipment type.

Read these to get up to speed (Filesystem connector):
- Repo:  C:\Users\d.anderson\OneDrive - Sealing Solutions Group\ClaudeAgent\Marion\marion\
    - ROADMAP-VIEWS.md      <- the plan; defines List / Cards / Compare / Cutaway
    - index.html            <- the live Marion page we're extending
    - MARION-SYSTEM-PROMPT.md, README.md
    - knowledge\manifest.json  <- read FIRST; lists all active manufacturers (v2.8+)
- Cutaway working set (now in the repo):  marion\cutaway\
    - cylinder-seal-selector_7.html   <- the prototype to bring in as the Cutaway view
    - cylinder-positions.json         <- callout coordinates / seal positions
- Canonical knowledge:  marion\knowledge\  (manifest + manufacturers/ + parent-profiles.json
    + crossref.json + anyseals.json + product-groups + profiles + markets/)

Start by reading ROADMAP-VIEWS.md, then inspect the selector prototype
(marion\cutaway\cylinder-seal-selector_7.html) and its callout JSON, then propose how to
integrate it as Marion's Cutaway view.

Build philosophy stays: TRAIN FIRST, CONNECT LATER. No Shopify/Supabase wired into the public
site yet (Phase 3).
--------------------------------------------------------------------

====================================================================
WHERE THINGS STAND (so nothing is lost)
--------------------------------------------------------------------
LIVE / DONE:
- marion.fluidsealab.com is live (GitHub Pages, repo davidranderson1/marion, public).
  HTTPS enforced. CNAME + DNS done.
- Repo contents: index.html, quote.html, CNAME, knowledge/ (manifest + company +
  product-groups + profiles + products + parent-profiles + crossref + anyseals +
  manufacturers/ + markets/ + catalogs/_inbox + oem-parts/), parts/, cutaway/, README,
  MARION-SYSTEM-PROMPT, ROADMAP-VIEWS.
- Knowledge base (manifest v2.8): Fluidseal (169, normalizer) + Hallite (82) + Clipper (5) +
  Parker reciprocating (64) + Parker rotary (217) + Freudenberg (157). Plus parent-profiles.json
  (221 parent profiles, 8 families) as the canonical join layer, anyseals.json OEM crossref,
  and markets/ application context. SKF + Trelleborg planned.

CATALOG INGESTION (new):
- Single drop point for ALL source docs: marion\knowledge\catalogs\_inbox\
  (Fluidseal catalogs, manufacturer catalogs, OEM kit/part lists, industry PDFs — a mixture is
  fine). Each is parsed and ROUTED: seal profiles -> manufacturers\<name>.json;
  OEM part->Fluidseal part -> oem-parts\<oem>.json; brand crossref -> anyseals.json;
  application context -> markets\. Raw files archived to catalogs\<source>\ and logged in
  catalogs\_inbox\_INGESTION-LEDGER.json. Marion reads the routed JSON, not _inbox.
- oem-parts\ is the layer for OEMs (John Deere etc.) whose relationship is part->part, not
  profile->profile. (e.g. John Deere T187116 -> RJD-TD187116.)

QUOTE INTAKE (new): marion\quote.html — Phase 1 quote tool. Paste/drag a customer request
(email, screenshot, text) -> agent cross-references OEM->Fluidseal part numbers -> editable
cart -> Fluidseal estimate form. Cross-ref rules grow as catalogs/website data are loaded.

THE VIEW SYSTEM (from ROADMAP-VIEWS.md):
- List  (spec-filtered rows)         — data ready
- Cards (visual grid, profile imgs)  — Hallite images ready, others as they arrive
- Compare (2-4 side by side)         — data ready
- Cutaway (answer in place on equip) — THIS SESSION; cylinder prototype is the seed
  Customer-facing name: "Cutaway View". Internal/code name: application-diagram.
  Deliberately NOT called "Map" — part search isn't spatial. (Stock-by-branch map is Phase 3.)

NEXT PRIORITIES AFTER CUTAWAY:
1. Phase 2.5 view toggle (List/Cards/Compare) on Marion's answers.
2. Continue manufacturer data: SKF, Trelleborg (Freudenberg + both Parker catalogs already in).
   Add comparable lists so the Parker/Freudenberg columns in parent-profiles.json fill in.
3. Profile Mapping Tool (relate each manufacturer's profiles to Fluidseal profile links).
4. Phase 3: Shopify (pricing/checkout) + Supabase (quotes) via a server-side key proxy.

WORKSPACE NOTE:
- The old local scratch folder C:\Users\d.anderson\ClaudeWorkspace\ has been cleaned up and
  deleted. Everything needed now lives under OneDrive: the Marion repo
  (...\ClaudeAgent\Marion\marion\) is the single source of truth; editable design source files
  (equipment poster PSDs/JPGs) are in ...\OneDrive - Sealing Solutions Group\Design Source Files\.
- To add a manufacturer file to the LIVE site: write it into knowledge\manufacturers\, add it to
  manifest.json, bump knowledge_version, then commit+push via GitHub Desktop.
====================================================================
