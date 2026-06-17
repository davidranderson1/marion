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
merges them into one catalog.

```
marion\
  index.html                 -> the Marion chat front door
  CNAME                      -> marion.fluidsealab.com
  knowledge\
     manifest.json           -> index Marion reads first; lists active manufacturers
     company.json            -> company facts + Marion's persona
     product-groups.json     -> 13 product groups + category URLs
     profiles.json           -> 170 profile-code -> product-page URL maps
     products.json           -> LEGACY flat file, fallback only
     manufacturers\
        hallite.json         -> 82 Hallite profiles w/ operating limits
        clipper.json         -> 5 Clipper oil-seal profiles
```

**To add a manufacturer:** drop its file in `knowledge\manufacturers\` (same schema as
hallite.json) and add one line to `manifest.json`. Bump `knowledge_version`. That's it.

**To temporarily disable one:** set `"active": false` on its manifest line.

---

## Status

- [x] Architecture decided
- [x] Phase 1: knowledge base assembled + validated
- [x] `marion` GitHub repo + Pages + DNS (marion.fluidsealab.com)
- [x] Phase 2: Marion system prompt + chat UI
- [ ] Grow knowledge: Freudenberg, SKF, Trelleborg, Parker; full O-Ring data; seal kits
- [ ] Profile Mapping Tool (relate manufacturer profiles to Fluidseal profile links)
- [ ] Phase 3: Shopify + Supabase wired in via a server-side proxy
