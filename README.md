# Marion — the Fluidseal AB sealing-products AI agent

**Marion** is named in homage to the founder of Fluidseal AB. Marion is the intelligent front
door to everything Fluidseal: an AI agent that helps customers find the right seal, understand
products, get quotes, and (eventually) buy — backed by Fluidseal's full catalog and decades of
sealing expertise.

This repo publishes to **https://marion.fluidsealab.com/**.

---

## Build philosophy: train first, connect later

We are building Marion in three phases, in order. Do not skip ahead — each phase de-risks the next.

### Phase 1 — Knowledge base (DONE)
Marion's intelligence is its structured knowledge, not its plumbing. Before any chat UI or backend,
we assemble clean, machine-readable knowledge files describing every product, spec, application,
and link. This is what Marion "studies." Lives in `/knowledge`.

### Phase 2 — The agent (DONE — this is what's live now)
A system prompt defining Marion's persona, scope, and rules + the Phase 1 knowledge =
an agent that can recommend products and answer seal questions. The chat page (`index.html`)
runs two engines: the Anthropic API when a key is supplied (best quality) and a built-in
structured spec-recommender over the JSON as a fallback that always works with no key.

### Phase 3 — The hands (later)
Connect backends so Marion can transact:
- **Shopify** (already connected) — products, pricing, checkout/selling.
- **Supabase** (already connected) — structured data, quote storage, customer records.
A server-side proxy will hold the API key so the public site never ships one.
Only wire these in once Phase 2 behaves well.

---

## How the knowledge base is organized

Marion reads `knowledge/manifest.json` FIRST, then loads every manufacturer file it lists and
merges them into one catalog. The manifest also points to the shared join/crossref layers.

```
marion\
  index.html                 -> the Marion chat front door
  quote.html                 -> Phase 1 quote-intake tool (request -> cross-ref -> cart -> estimate)
  CNAME                      -> marion.fluidsealab.com
  cutaway\                   -> Cutaway-view prototype (cylinder seal selector + callout JSON)
  parts\                     -> normalized parts / style-bridge working set
  knowledge\
     manifest.json           -> index Marion reads first; lists active manufacturers (v2.8+)
     company.json            -> company facts + Marion's persona
     product-groups.json     -> product groups + category URLs
     profiles.json           -> profile-code -> product-page URL maps
     parent-profiles.json    -> CANONICAL join layer: every vendor profile -> parent -> Fluidseal eq.
     crossref.json           -> older category-bridge (Hallite/Clipper); superseded by parent-profiles
     anyseals.json           -> OEM/brand design-code crossref, bridged to parent profiles
     products.json           -> LEGACY flat file, fallback only
     manufacturers\
        fluidseal.json       -> 169 Fluidseal profiles (normalizer namespace)
        hallite.json         -> 82 Hallite profiles w/ operating limits
        clipper.json         -> 5 Clipper oil-seal profiles
        parker.json          -> 64 Parker reciprocating (fluid power) profiles
        parker-rotary.json   -> 217 Parker rotary profiles
        freudenberg.json     -> 157 Freudenberg (Merkel/Simmerring) profiles
        sources\             -> raw manufacturer catalog PDFs
     markets\                -> application / market context (where seals go & why)
     oem-parts\              -> OEM part# -> Fluidseal part# + detail (John Deere etc.; part->part)
     catalogs\
        _inbox\              -> single drop point for ALL source docs (mixture OK); parsed & routed
```

**To add a manufacturer:** drop its file in `knowledge\manufacturers\` (same schema as
hallite.json) and add one line to `manifest.json`. Bump `knowledge_version`. That's it.

**To add ANY source document** (catalog, OEM kit list, technical PDF): drop it in
`knowledge\catalogs\_inbox\`. It gets parsed and its data routed to the right layer
(manufacturers / oem-parts / anyseals / markets); the raw file is archived and logged in
`catalogs\_inbox\_INGESTION-LEDGER.json`. Website (fluidsealab.com / sealsonline.com) is treated
as more current than catalogs for part numbers; catalogs add technical depth.

**To temporarily disable a manufacturer:** set `"active": false` on its manifest line.

---

## Status

- [x] Architecture decided
- [x] Phase 1: knowledge base assembled + validated
- [x] `marion` GitHub repo + Pages + DNS (marion.fluidsealab.com)
- [x] Phase 2: Marion system prompt + chat UI
- [x] Knowledge growing: Fluidseal (169) + Hallite (82) + Clipper (5) + Parker reciprocating (64)
      + Parker rotary (217) + Freudenberg (157); parent-profiles.json canonical join layer;
      anyseals OEM crossref; markets/ application context
- [x] Quote-intake tool (quote.html): request -> OEM cross-ref -> editable cart -> estimate
- [x] Catalog ingestion pipeline (catalogs/_inbox -> routed to manufacturers/oem-parts/anyseals/markets)
- [ ] Add SKF, Trelleborg; full O-Ring data; seal kits; fill Parker/Freudenberg comparable columns
- [ ] Cutaway view (cylinder prototype in cutaway/ is the seed)
- [ ] Profile Mapping Tool (relate manufacturer profiles to Fluidseal profile links)
- [ ] Phase 3: Shopify + Supabase wired into the public site via a server-side proxy
