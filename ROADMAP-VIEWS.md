# Marion — Views Roadmap

How Marion presents answers. Right now Marion replies with one rendering: a short prose answer plus
stacked spec cards. That's fine for a single recommendation, but real part-finding needs the answer
shaped to the *intent*. This document defines the view system, names each view, and phases the work.

Read this first in the next chat, then continue the build.

---

## Principle: the view follows the intent, not the whim

Google doesn't pick list vs. grid vs. table at random — each view is tied to a kind of question.
We borrow that discipline. Each Marion view exists because a specific customer intent is served
best by it. We do NOT add a view just because it looks impressive; a view with no data behind it is
decoration. **View work and data work advance together.**

---

## The four views

### 1. List view  — code: `list`
**Intent:** "I roughly know what I want — show me everything that fits, densely, so I can scan."
Scannable rows, one profile per line: code · manufacturer · key specs (P / T / v) · fit tag · link.
Sortable by any spec. This is the workhorse for spec-filtered queries
("rod seals rated above 400 bar", "wipers good to -45 C").
*Data needed:* operating limits — already have for all 87 profiles.

### 2. Card view  — code: `cards`
**Intent:** "I'm browsing and the shape matters — let me recognize the profile by sight."
A visual grid. Each card = profile drawing + code + a few specs + a View/Buy link. The image does
the discriminating (a buyer knows a polypak or a wiper by its cross-section).
*Data needed:* profile images. Have them for Hallite (`hallite_image_index.csv`), partial for
Clipper, none yet for the four planned manufacturers. Cards are only as good as the images behind
them — so Card view ships per-manufacturer as images arrive, not all at once.

### 3. Compare view  — code: `compare`
**Intent:** "These two-to-four are close — which one wins?"
2-4 candidate profiles side by side. Rows = pressure / temp / speed / material / size. The deciding
row (the spec that actually separates them) is highlighted so the tradeoff is obvious at a glance.
Marion offers this automatically when it returns a small candidate set.
*Data needed:* operating limits — already have.

### 4. Cutaway view  — code: `application-diagram`  ⭐ the distinctive one
**Intent:** "Where does this seal go on the machine — and what else seals near it?"
The answer shown **in its physical place** on the equipment: a sectioned (cutaway) cylinder or
assembly with seal positions called out, each callout linking to that profile. This is the
illustrated-parts-catalog idea, adapted and made interactive and chat-driven.

This is what makes Marion unlike any other parts chatbot — nobody else shows you the seal *in situ*.
It's also the natural bridge to two things we already have/are building:
- the **Application Posters** work (same cutaway-with-callouts concept), and
- **Shopify** (click a callout → that profile's card → buy).

Naming note: customer-facing label **"Cutaway View"** (or "Application Cutaway"); internal/code name
**application-diagram**. We deliberately did NOT call this "Map" — a literal map is for *spatial*
answers, and part search isn't spatial. The one genuinely spatial thing — stock by branch/location —
becomes a real map only in Phase 3 once Shopify inventory is connected.

*Data needed:* equipment diagrams with seal-position metadata. The hydraulic-cylinder seal-selector
already prototyped (`cutaway/cylinder-seal-selector_7.html` in the repo, with its callout coordinates
in `cutaway/cylinder-positions.json`) is the seed of this — it maps every sealing profile to its
location on a cutaway cylinder, inch + metric. That artwork + callout coordinates is the data layer
for Cutaway view.

---

## Phasing

These slot into the existing Marion plan (Phase 1 knowledge = done, Phase 2 agent = live,
Phase 3 = Shopify/Supabase). The views are Phase 2.x — they enrich the agent before backends.

### Phase 2.5 — View scaffolding  (next session)
- Add a view toggle to Marion's answer area: **List ⇄ Cards ⇄ Compare**.
- The recommender already ranks results; today it renders them one way. This is mainly a rendering
  layer over data we already have. Low risk, high polish.
- List + Compare work for all 87 profiles immediately. Cards turn on for Hallite first (images
  exist), others as their images land.

### Phase 2.6 — Compare, smarter
- When Marion returns 2-4 candidates, auto-offer "Compare these" → side-by-side table with the
  deciding spec highlighted.

### Phase 2.7 — Cutaway View (first cut)
- Bring the cylinder-seal-selector cutaway in as a Marion view. Start with the hydraulic cylinder
  (the prototype already exists). When Marion recommends a profile that lives on the cylinder, offer
  "Show me where this goes" → Cutaway opens with that callout highlighted.
- Later: more equipment types (the posters library is the source — 100+ application cutaways).

### Phase 3 — Spatial, for real
- **Stock/branch map** once Shopify inventory is connected — the only genuinely map-worthy view.
- Cutaway callouts wire through to live Shopify product pages / availability.

---

## Hard rule restated

Don't let views outrun data. Before turning a view on for a manufacturer, confirm the data behind it
exists: List/Compare need operating limits (have for Hallite + Clipper; needed for Freudenberg, SKF,
Trelleborg, Parker), Cards need images, Cutaway needs diagram + callout coordinates. Adding
Freudenberg / SKF / Trelleborg / Parker spec data — and a Profile Mapping Tool to relate each
manufacturer's profiles to Fluidseal's profile links — remains the priority that unlocks all four
views across the full catalog.

---

## Open decisions for next chat
1. Confirm "Cutaway View" as the customer-facing name (vs. "Application View" / "Where-It-Goes").
2. Decide whether the view toggle is always visible or only appears when results warrant it.
3. Decide default view per intent (spec-filter query → List; "show me" / browse → Cards;
   "which is better" → Compare; "where does it go" → Cutaway).
4. `cylinder-seal-selector_7.html` is now in the repo (`marion/cutaway/`) alongside
   `cylinder-positions.json`. Decide: wire this prototype in as the Cutaway seed as-is, or rebuild
   its callout layer cleanly against the knowledge base.
