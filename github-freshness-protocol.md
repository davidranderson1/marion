# GitHub Freshness Protocol — FluidSeal AB

Paste this into a project's instructions (or project knowledge) so Claude handles GitHub the same way in every project. Source of truth is always the repo, never memory.

## Repos

All repos live under `github.com/davidranderson1`:

| Repo | Purpose |
|---|---|
| `marion` | Marion (AI agent) |
| `Website---Fluidseal` | Fluidseal website (private) |
| `fluidseal-posters` | Application posters |
| `fluidseal-world` | Fluidseal World |
| `fluidseal-training` | Fluidseal Training |
| `customer-interest-survey` | Customer interest survey |
| `bbetter-scheduler` | BBetter Scheduler (private) |

If this project maps to one repo, that repo is the "project repo" below.

## Rules for Claude (follow in every session)

1. **Check recency before any work.** At the start of any task touching repo content, call the GitHub connector's `list_commits` on the project repo. State the latest commit time and message so David knows the baseline you're working from.

2. **Never edit from memory.** Before modifying any file, fetch its current contents with `get_file_contents`. Project knowledge, memory, and prior chat versions are summaries — they may be stale. Edit only what you just fetched.

3. **One logical change per commit, clear message.** Commit messages start with what changed and why (e.g., `Fix rod-wiper links: sealsonline /en/flabed/ format`). Push via `create_or_update_file` / `push_files` with the fetched file's SHA so a stale overwrite fails loudly instead of silently clobbering.

4. **Verify after pushing.** Call `list_commits` again to confirm the commit landed. For GitHub Pages sites, fetch the live URL and confirm the change is visible (Pages rebuilds can take ~1 min; hard-refresh/cache-bust with `?v=<timestamp>` when checking).

5. **Report the delta.** End repo work by summarizing: files changed, commit SHA, and live-URL verification result.

6. **On conflict or unexpected repo state** (file differs from what memory says, SHA mismatch, force-push evidence): stop, show David the diff, and ask before overwriting.

## Repo Changelog artifact (freshness dashboard)

Each project can have a live artifact that shows commit activity across all repos with a "last reviewed" baseline. To recreate it, tell Claude:

> Create a live Cowork artifact called "Repo Changelog". On load, call the GitHub connector's `list_commits` (discover the exact tool name in this project first — the MCP prefix differs per project) for each repo under `davidranderson1`, 30 commits each, in parallel. Sort repos by newest activity. Store a "last reviewed" baseline in localStorage; flag commits newer than it with a "N new" badge and a stale banner. **When "Mark all reviewed" is clicked, set the baseline to the newest commit timestamp currently displayed — not to the current clock time.** Store per-repo baselines, not one global one. Discover the repo list dynamically via `search_repositories` (`user:davidranderson1`) so new repos appear automatically.

Known-good response handling for the artifact: read `r.structuredContent ?? JSON.parse(r.content[0].text)`, and accept either a raw array or `{items: [...]}`.

## Why these rules exist

- The changelog artifact only *reports* staleness; these rules prevent it — Claude must confirm the live repo state before and after every change.
- localStorage baselines are per-device; the rules make each session independently verify instead of trusting a baseline.
- SHA-checked writes turn silent stale overwrites into visible errors.
