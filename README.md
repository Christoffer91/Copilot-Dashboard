# Copilot Impact Dashboard

Author: Christoffer Besler Hansen  
License: AGPL-3.0

A client-only dashboard for exploring Viva Insights Copilot CSV exports: filter by org/region, compare metrics, export charts, and ship password-protected snapshots or a SharePoint-ready bundle.

## Features
- Upload Viva Insights Copilot CSVs across multiple schema families, including localized header exports.
- Built-in sample chooser from **Load sample dataset**:
  - `samples/viva-analytics-copilot-impact.csv` (Viva Analytics Copilot Impact shape, 83 columns)
  - `samples/copilot-dashboard-export.csv` (Copilot Dashboard export shape, 89 columns)
- Rich filters, multi-metric charts, agent hub tables, theme toggles, and per-capability insights.
- Compare mode for same-dimension analysis:
  - organization vs organization
  - region vs region
  - domain vs domain
  - shared global timeframe, metric, and aggregation
  - compact side-by-side comparison summaries plus a full-width comparison chart
- **Theme system**: 7 built-in themes (Light, Cool Light, Midnight Dark, Carbon Black, Cyberpunk, Neon, Sunset) + custom color picker.
- Exports: PNG/PDF/CSV, Excel summaries, encrypted snapshots, and SharePoint bundle generator.
  - Export menu clarifies the difference between:
    - CSV (trend data): time series used by charts
    - Pivot (CSV): period × country × organization

  - Trend-card export menu:
    - Download full report (Excel)
    - Download country report (Excel) (workbook contains an “All orgs (pivot)” sheet + one sheet per country with **all** organizations)
    - Download totals (Excel)
    - Download PDF report
    - Download CSV (trend data)
    - Download pivot (CSV) (period × country × organization)
    - Download PNG
    - Download animation
    - Download organizations (Excel)
  - Post-upload CTA for "Export" (respects current filters).
  - Quick share: "Copy summary" (text/Markdown) and "Copy image" of the trend card where supported.
- Privacy-first: processing happens in the browser; local caching is opt-in each session.

## Quick start
1) Clone the repo.  
2) Open `copilot-dashboard.html` in a modern Chromium-based browser (Chrome/Edge) for full feature support.  
3) Use "Select CSV" or "Load sample dataset" to explore.

Optional: serve locally for stricter CSP behavior, e.g. `python3 -m http.server 8000` then visit `http://localhost:8000/copilot-dashboard.html`.

## Data expectations
Supported primary CSV families:
- **Viva Analytics Copilot Impact** style (for example 83 columns): includes `PersonId`, `MetricDate`, `Organization`, `CountryOrRegion`, `Domain`, and broad Copilot metrics.
- **Copilot Dashboard export** style (for example 89 columns): includes `PersonId`, `MetricDate`, `Organization`, and extended Copilot action metrics.
- Regenerate public synthetic samples with: `node tools/generate-public-samples.mjs`

Localization and dialect handling:
- Header matching supports alias resolution plus schema index fallback, so translated headers can still be mapped when column layout matches a supported schema.
- Number parsing handles both dot and comma decimals.
- Slash dates (`x/x/yy`) are inferred as month-first or day-first from dataset evidence.

Usage intensity and returning users behavior:
- Usage intensity thresholds default to `25` (middle) and `50` (high).
- All months found in the CSV are shown as clickable month chips.
- If more than 12 months exist, the latest 12 are preselected by default for readability/performance.
- Returning users are calculated as the number of people active in both the current period and the immediately previous period (weekly or monthly view).
- Regression check script: `node tools/verify-returning-users.mjs`

Active users semantics:
- `Impact trend` with **Active users (%)** now uses:
  - numerator: distinct users with at least `1` prompt/action in the same week/month
  - denominator: distinct users with `Copilot Enabled User > 0` in that same week/month
- The top `Active Copilot users` summary and `Adoption by app` denominator now use the same actions-only active-user rule for consistency.

Goals tracker behavior:
- Goal 1 uses CSV-only scope and is measured weekly:
  - Denominator: unique enabled users in scope (`copilotEnabledUser > 0`).
  - Numerator: enabled users with `>=1` Copilot activity/week (`totalActions`) and `>=1` active Copilot day/week.
  - Card headline shows compliant reach for the selected goal month.
  - Use the month arrows in Goals tracker to move month by month across available months in the filtered dataset.
  - A monthly Goal 1 trend chart shows compliant reach across all available months and highlights the selected month.
  - Weekly strip shows strict per-week attainment for the selected month.
  - Sustained status: PASS only when the selected month has 4/4 most recent weeks at 100%.
- Goal 1 metrics can be exported from the Goals tracker via **Download goals CSV**.

Minimum data to unlock core views:
- Identity: `PersonId`, `MetricDate`
- Grouping: `Organization` (country/domain are optional and can be missing in some exports)
- Activity: at least one of the total/action metrics (for example `Total Active Copilot Actions Taken` or `Total Copilot actions taken`)

How to export the CSV from Viva Insights:
- You need admin access to Viva Insights.
- Go to https://analysis.insights.cloud.microsoft/ and run the **Microsoft 365 Copilot impact** report.
- Before running, add all available metrics from **Microsoft 365 Copilot** to the report to maximize coverage.
- Ensure your Organizational data mapping in Viva Insights aligns with the dashboard defaults: `Organization` for offices and `CountryOrRegion` for country. If your tenant uses different fields, map them accordingly before exporting.

## Privacy & storage
- All parsing/rendering runs locally; no analytics or remote posts.
- Dataset persistence uses `localStorage` but is **off by default** and requires explicit opt-in each session via the “Save dataset on this device” checkbox.
- Encrypted snapshots use Web Crypto; keep your password safe—there is no recovery.

## AI-Assisted Development

This project was primarily developed with the assistance of **OpenAI Codex** and **GitHub Copilot** AI agents. While Christoffer Besler Hansen provided direction, requirements, and review, the majority of the code was generated through AI-assisted development.

### Disclaimer

⚠️ **Use at your own risk.** This software is provided "as is", without warranty of any kind. The AI-generated code has been reviewed but may contain bugs, security vulnerabilities, or unexpected behavior. Users are encouraged to:

- Review the code before deploying in production environments
- Test thoroughly with non-sensitive data first
- Report any issues via GitHub Issues
- Not rely on this tool for critical business decisions without independent verification

The author and AI assistants are not liable for any damages or losses arising from the use of this software.

## License
Copyright (c) 2025 Christoffer Besler Hansen.  
Licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).

## Changelog

### 2026-03-31
- Fixed `Impact trend` **Active users (%)** to use period-local actions-only numerator and period-local enabled denominator.
- Added smart zoom for `Impact trend` **Active users (%)** so the y-axis pads the observed range instead of always spanning `0-100`.
- Aligned the top `Active Copilot users` summary and `Adoption by app` active-user denominator to the same actions-only active-user rule.
- Added compare mode:
  - compare two organizations, regions, or domains
  - shared timeframe, metric, and aggregation
  - compact compare summaries
  - full-width comparison chart
- Compare chart behavior:
  - one selected side shows one full-width line
  - two selected sides show one shared overlay chart
  - left side uses green, right side uses blue
  - capability lines are hidden in compare by default
- Fixed compare-mode interaction bugs caused by an overlaid empty state intercepting pointer events.
- Replaced visible inline-width skeleton markup with CSS classes to reduce CSP noise in the compare/debug path.

### 2025-12-12
- **Theme system overhaul**: Added 7 built-in themes + custom color picker
  - Keep: Light, Cool Light, Midnight Dark, Carbon Black
  - Added "crazy" themes: Cyberpunk (pink/cyan), Neon (matrix green), Sunset (orange/purple gradient)
  - Custom theme with user-defined accent, background, and text colors
  - All themes saved to localStorage and persist across sessions
- Fixed theme "bleeding" issue where background gradients persisted when switching themes
- Security review documentation added to README

### 2025-12-26
- Export UX refresh: quick export buttons, post-upload CTA, clipboard sharing, and save-to-picker support (where available).

### 2025-12-30
- Restored export menu items: country report (Excel), pivot (CSV), organizations (Excel).
- Improved ultrawide support by allowing the page to expand on large screens and fitting more “Usage intensity” cards per row.

### 2026-01-03
- Export menu: added helper subtitles for trend CSV vs pivot CSV.
- Sticky filter dropdown: avoids duplicate `id`/`for` in cloned controls (a11y/robustness).
- Documented OneDrive revert mitigation and cache-bust workflow.

### 2026-02-13
- Added support for dual CSV families (Viva Analytics Copilot Impact and Copilot Dashboard export) with automatic schema detection.
- Improved localized CSV parsing with alias/index fallback mapping plus locale-aware number/date handling.
- Added two synthetic public sample datasets (10,000 rows each) and switched **Load sample dataset** to a dataset chooser.
- Added sample regeneration script: `node tools/generate-public-samples.mjs`.

### 2026-02-19
- Updated Usage intensity defaults to `25/50` (middle/high).
- Usage intensity now surfaces all CSV months as selectable chips; when more than 12 months exist, the latest 12 are preselected.
- Added legacy snapshot threshold migration (`17/35` -> `25/50`) when loading older snapshots without threshold version metadata.
- Added deterministic returning-users verifier: `node tools/verify-returning-users.mjs`.

### 2026-02-27
- Added a Goals tracker section with CSV-only KPI measurement for Goal 1 (weekly attainment + sustained 4/4 status).
- Added goals CSV export for governance reporting (`copilot-goals-tracker.csv`).

### 2026-03-16
- **Excel full report overhaul**: consolidated 11 sheets into 4 (Overview, Trends, Breakdowns, Apps & usage) with multi-section layout per sheet.
  - Each section has a descriptive title, info row, green header, and alternating-row data.
  - Switched from xlsx@0.18.5 to xlsx-js-style@1.2.0 for cell styling support.
  - Added SRI integrity hash for xlsx-js-style CDN dependency.
- Text wrapping: top organizations/countries now display as multi-line lists; all data columns wrap text with top-vertical alignment.
- New styling helpers: `addExcelSection()`, `applyMultiSectionStyles()` for composing multi-section sheets.
- New export coverage: returning users, adoption progress, activity (30d), and category breakdowns included in the full report.

### 2026-03-01
- Fixed Agent Hub KPI cards and tab badges to refresh immediately after Users/Agents/Users&Agents CSV uploads.
