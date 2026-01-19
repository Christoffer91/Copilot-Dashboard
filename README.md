# Copilot Impact Dashboard

Author: Christoffer Besler Hansen  
License: AGPL-3.0

A client-only dashboard for exploring Viva Insights Copilot CSV exports: filter by org/region, compare metrics, export charts, and ship password-protected snapshots or a SharePoint-ready bundle.

## Features
- Upload Viva Insights Copilot CSVs (sample included at `samples/copilot-sample.csv`).
- Rich filters, multi-metric charts, agent hub tables, theme toggles, and per-capability insights.
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
Minimum headers to unlock the main views (see `samples/copilot-sample.csv` for shape):
- Identity & grouping: `PersonId`, `Organization`, `CountryOrRegion`, `Domain`, `MetricDate` (ISO date)
- Activity metrics: `Total Active Copilot Actions Taken`, `Copilot assisted hours`
- App-specific metrics (used when present): meeting recaps/summaries, email/chat/powerpoint/word/excel actions, Copilot enabled flags, etc.

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
