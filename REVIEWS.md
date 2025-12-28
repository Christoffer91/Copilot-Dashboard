# Reviews (v2 iteration)

## Workflow Orchestrator Report
- Scope: Extend v2 toward v1 parity: add sticky filter bar, active filter chips, dataset side card, theme picker, and per-chart PNG exports.
- Scope: Add v1-like Export menu dropdown (in addition to quick buttons) and ensure exports are disabled until dataset loads.
- Scope: Add v1-like multi-series trend controls (trend mode + series toggles for app trends).
- Scope: Add v1-like CSV exports for trend + workload, and improve dropdown accessibility (aria-expanded + focus).
- Scope: Make Summary + Trend sections match v1 layout/classes (summary-grid/cards + trend caption/window chip).
- Non-trivial: Yes (UI changes + data model extensions).
- Reviews run: UX (requested) + orchestration summary.
- Risk decision: APPROVED WITH CONDITIONS (still missing full v1 parity + full keyboard pass; keep changes v2-only; verify against real export).
- Manual approval required: No (incremental v2-only changes; does not touch production endpoints).
- Next action: Implement remaining v1-parity features (workload drilldowns, more views) and run a full UX/accessibility pass.

## UX Review Report (delta)

### Issue 1: Dense charts need clearer hierarchy
- Category: Visual/Interaction
- Severity: Medium
- Location: Page body sections
- Recommendation: Add section descriptions only where needed, and keep chart heights consistent; ensure filters stay above fold.

### Issue 2: Filters missing “v1 parity” controls
- Category: Interaction
- Severity: Resolved (iteration)
- Location: Filters card
- Recommendation: Keep; implemented timeframe presets + dimension value multi-select; ensure “Apply” is clearly communicated (re-process file).

### Issue 4: Workload breakdown should clarify what it measures
- Category: Content
- Severity: Medium
- Location: Workload breakdown card
- Recommendation: Make it explicit that it reads specific “in-app” columns and may not sum to total (depends on export).

### Issue 3: Metrics table discoverability
- Category: Interaction/Content
- Severity: Medium
- Location: Metrics card
- Recommendation: Add sorting cues and a “Top N / Show more” control; keep search prominent.

### Action Checklist
- [x] Add timeframe presets + clear reset
- [x] Add dimension value filter (Org/FunctionType) with search
- [x] Add basic empty-states when selected metric has no data
- [x] Ensure filters have proper labels (`for`/`id`)
- [x] Add sticky filter bar + active filter chips (v1-style)
- [x] Add theme picker (v1-style)
- [x] Add per-chart PNG exports
- [x] Add Export menu dropdown (v1-style)
- [ ] Keyboard test (tab order, focus, dropdowns)
