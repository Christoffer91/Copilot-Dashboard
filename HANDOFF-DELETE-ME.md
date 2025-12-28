# Handoff (delete after use) — `copilot-dashboard-v2/`

## Goal
Build a **static (no-build) Copilot dashboard v2** that ingests **Viva Copilot Dashboard CSV exports** locally (100k+ rows) and matches the **look/feel + charts/tables** from `copilot-dashboard/` (v1), without modifying v1.

## Where the project is now
- Main page: `copilot-dashboard-v2/copilot-dashboard.html`
- Main logic: `copilot-dashboard-v2/assets/copilot-dashboard-v2.js`
- Web Worker aggregator: `copilot-dashboard-v2/assets/worker-csv-aggregate.js`
- Styles: `copilot-dashboard-v2/assets/copilot-dashboard.css`
- Docs: `copilot-dashboard-v2/PLAN.md`, `copilot-dashboard-v2/TODO.md`, `copilot-dashboard-v2/REVIEWS.md`, `copilot-dashboard-v2/README.md`
- Sample CSV: `copilot-dashboard-v2/samples/viva-copilot-dashboard-sample.csv`

### Implemented highlights (v1-ish parity)
- Worker-based CSV parse + aggregation (no raw rows stored) with optional filter-on-parse (`startDate/endDate` + dimension allowlist).
- Sticky filter bar + dropdown (Escape/outside-click close, focus handling), active filter chips.
- Theme picker + floating toggle (saved to `localStorage`).
- Dataset side-card (rows/users/date range/metrics + filtered-out stats).
- Trend chart modes (selected metric + “apps actions” + “apps active days”) with series toggles.
- Workload breakdown section (uses workload-specific columns when present).
- Summary section refit to v1-like `summary-grid`/`summary-card` markup with static SVG icons.
- Exports: per-chart PNG buttons + export dropdown (CSV: summary/trend/workload) with CSV formula-injection mitigation.

## Known gaps / next steps
- **Dimension filter performance**: current multi-select renders all checkboxes; needs typeahead/virtualization/top‑N for large org lists.
- **Worker meta clarity**: consider splitting `totalRowsRead` vs `includedRows` to reduce confusion in the dataset card.
- **Submodule caveat**: `copilot-dashboard-v2/` contains its own `.git/` (likely a submodule/gitlink). Decide whether to keep it as-is or convert it to a normal folder.
- **Parity work**: add remaining charts/tables + drilldowns to match v1 more closely; then validate numbers vs Excel pivots.

## Run locally (Mac/Windows)
- From repo root: `cd copilot-dashboard-v2`
- Start a local server (pick one):
  - `python3 -m http.server 8000`
  - `npx serve .`
- Open: `http://localhost:8000/copilot-dashboard.html`

## Continuity notes
- Continuity track: `.codex/continuity/copilot-dashboard-v2.md`

## Prompt to start a new chat (copy/paste)
You are taking over the `copilot-dashboard-v2/` project in this repo. Work **only** inside `copilot-dashboard-v2/` (do not modify `copilot-dashboard/`). First, read `copilot-dashboard-v2/HANDOFF-DELETE-ME.md` and `.codex/continuity/copilot-dashboard-v2.md`. Then:
1) Verify the dashboard loads locally and imports `copilot-dashboard-v2/samples/viva-copilot-dashboard-sample.csv`.
2) Improve v1 parity (charts/tables/filters/export UX) without hurting performance on 100k+ rows (keep worker aggregation; don’t store raw rows).
3) Fix the dimension filter UI to handle many org/function values (typeahead/virtualization/top‑N).
4) Decide/resolve the `copilot-dashboard-v2/.git` (submodule vs normal folder) and document the choice.
Record any key decisions/outcomes in `.codex/continuity/copilot-dashboard-v2.md`.
