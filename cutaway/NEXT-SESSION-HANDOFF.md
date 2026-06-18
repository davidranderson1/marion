# Marion — Next Session Handoff: Cylinder Cutaway View

Paste the kickoff block below into a NEW chat in the same Claude Project. Everything Marion
needs is on disk and described here. Upload the two cutaway files first so the new chat works
from ground truth, not from memory.

====================================================================
KICKOFF MESSAGE — copy everything between the lines into the new chat
--------------------------------------------------------------------
Continuing **Marion**, Fluidseal AB's customer-facing AI sealing agent. Phase 2 is LIVE at
https://marion.fluidsealab.com/ (yellow/black chat page, "What Marion Knows" panel shows 87
profiles, offline recommender + optional Claude API).

This session we build Marion's first real VIEW: the **Cutaway View** (interactive cylinder
seal selector — answers shown in their physical place on the equipment). Get the cylinder
cutaway working properly and wired to Marion before any other equipment type.

Read these to get up to speed (Filesystem connector):
- Repo:  C:\Users\d.anderson\OneDrive - Sealing Solutions Group\ClaudeAgent\Marion\marion\
    - ROADMAP-VIEWS.md      <- the plan; defines List / Cards / Compare / Cutaway
    - index.html            <- the live Marion page we're extending
    - MARION-SYSTEM-PROMPT.md, README.md
- Cutaway working set:  C:\Users\d.anderson\ClaudeWorkspace\cutaway\
    - cylinder-seal-selector_7.html   <- the prototype to bring in as the Cutaway view
    - cylinder-positions (1).json     <- callout coordinates / seal positions
- Canonical data:  C:\Users\d.anderson\ClaudeWorkspace\marion-knowledge\
    (products.json, profiles.json, hallite + clipper refs, image json)

I will UPLOAD cylinder-seal-selector_7.html and cylinder-positions (1).json so you can see them
directly. Start by reading ROADMAP-VIEWS.md, then inspect the selector prototype, then propose
how to integrate it as Marion's Cutaway view.

Build philosophy stays: TRAIN FIRST, CONNECT LATER. No Shopify/Supabase yet (Phase 3).
--------------------------------------------------------------------

====================================================================
WHERE THINGS STAND (so nothing is lost)
--------------------------------------------------------------------
LIVE / DONE:
- marion.fluidsealab.com is live (GitHub Pages, repo davidranderson1/marion, public).
  HTTPS enforced. CNAME + DNS done.
- Repo contents: index.html, CNAME, knowledge/ (manifest + company + product-groups +
  profiles + products + manufacturers/hallite + manufacturers/clipper), README,
  MARION-SYSTEM-PROMPT, ROADMAP-VIEWS.
- Knowledge base: 87 profiles (Hallite 82 + Clipper 5), 13 product groups, 170 profile links.
- Workspace organized: C:\Users\d.anderson\ClaudeWorkspace\ sorted into
  cutaway / marion-knowledge / catalog / posters / training / oilgas / misc / _ARCHIVE.
  _ARCHIVE holds all superseded versions (nothing deleted) — purge it yourself when confident.

THE VIEW SYSTEM (from ROADMAP-VIEWS.md):
- List  (spec-filtered rows)         — data ready
- Cards (visual grid, profile imgs)  — Hallite images ready, others as they arrive
- Compare (2-4 side by side)         — data ready
- Cutaway (answer in place on equip) — THIS SESSION; cylinder prototype is the seed
  Customer-facing name: "Cutaway View". Internal/code name: application-diagram.
  Deliberately NOT called "Map" — part search isn't spatial. (Stock-by-branch map is Phase 3.)

NEXT PRIORITIES AFTER CUTAWAY:
1. Phase 2.5 view toggle (List/Cards/Compare) on Marion's answers.
2. Add manufacturer data: Freudenberg, SKF, Trelleborg, Parker (normalize to schema,
   add file to knowledge/manufacturers/ + line in manifest.json, bump knowledge_version).
3. Profile Mapping Tool (relate each manufacturer's profiles to Fluidseal profile links).
4. Phase 3: Shopify (pricing/checkout) + Supabase (quotes) via a server-side key proxy.

KNOWN LOOSE ENDS:
- A few fluidseal_1..4.html scraps remain in ClaudeWorkspace root; harmless, drag to _ARCHIVE.
- To add a manufacturer file to the LIVE site, write it into the repo's
  knowledge/manufacturers/, add it to manifest.json, then commit+push via GitHub Desktop.
====================================================================
