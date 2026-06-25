# Marion — Training module

This folder publishes to **https://marion.fluidsealab.com/training/** and holds the
human-facing FluidSeal AB staff-training pages. Marion *links to* these pages (it does not
absorb them) when handing a customer or staff member off to a full interactive module.

## What's here

| File | Published URL | Status |
|------|---------------|--------|
| `index.html` | `/training/` | Hub landing page (links the 3 modules) |
| `product-profiles-training.html` | `/training/product-profiles-training.html` | Module 1 — Product Profiles Guide (130+ series). ~3.5 MB. |
| `training-certificate.html` | `/training/training-certificate.html` | Module 3 — 6-level staff certification (85 Q, PDF certificate). |
| `fluidseal_training_video.html` | `/training/fluidseal_training_video.html` | Module 2 — caliper training video (interim). |

### Known gap
The full **caliper training microsite** (`fluidseal_training.html` — labelled diagram, parts
cards, reading guide, quiz) is not yet in this folder; only the video version is. Regenerate it
and drop it in as `fluidseal_training.html`, then the Module 2 card in `index.html` and the
`caliper_measurement` destination in `knowledge/training.json` already point to that filename.

## How this connects to Marion's brain

The *facts* from these pages (caliper procedure, measurement order, material & chemical-
compatibility Q&A, catalog A–G reference, and the full certification curriculum) live in
**`../knowledge/training.json`**, registered in `../knowledge/manifest.json` under
`shared.training` (manifest v3.1+). That's the machine-readable layer Marion reasons over.
These HTML pages are the interactive layer it links out to.

## Continuous-sync workflow (no manual copying)

When training content is updated:

1. Edit `knowledge/training.json` (the brain) and/or the HTML page in this folder (the page).
2. Bump `knowledge_version` in `knowledge/manifest.json` so the change is published and caches bust.
3. In **GitHub Desktop** (repo: `marion`): review the changed files → write a commit summary →
   **Commit to main** → **Push origin**.
4. GitHub Pages redeploys `marion.fluidsealab.com` within a minute. Marion reads the new
   `manifest.json` + `training.json` on its next load — no other change required.

Because everything is committed into this same repo and read by relative path, there is no
second source of truth and nothing to copy file-by-file after setup.
