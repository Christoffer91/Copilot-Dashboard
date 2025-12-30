## UX Review Report (Copilot Dashboard)

Scope: `copilot-dashboard.html` + `assets/copilot-dashboard.css/js` (filters, export menu, ultrawide responsiveness).

### Issue 1: Ultrawide readability vs. “use the width”
- Category: Responsive
- Severity: Medium
- Location: Overall layout (charts + long text blocks)
- Recommendation: Keep charts/tables allowed to stretch, but consider limiting long text line-length inside cards (e.g., a max-width on paragraphs) to avoid very long lines on 5k2k.

### Issue 2: Export menu discoverability and density
- Category: Interaction
- Severity: Medium
- Location: Trend-card Export menu
- Recommendation: Keep the full list (needed), but consider grouping (Excel / CSV / Media) or adding short helper text so users understand the difference between “CSV (trend data)” and “pivot (CSV)”.

### Issue 3: Keyboard + focus behavior for menus
- Category: Accessibility
- Severity: Medium
- Location: Export menu (`role="menu"`) + theme menu + sticky filter dropdown
- WCAG Reference: 2.1.1 Keyboard, 2.4.3 Focus Order
- Recommendation: Verify Tab order, Esc-to-close, and that focus returns to the trigger button after closing menus. Confirm focus-visible styling for all interactive elements.

### Issue 4: Sticky filter bar + floating theme toggle overlap
- Category: Responsive
- Severity: Low
- Location: Top-right UI while scrolling (sticky filter bar + floating theme toggle)
- Recommendation: Keep the theme toggle offset below the sticky filter bar when visible; verify across zoom levels and small laptop heights.

### Action Checklist
- [ ] Add optional max line-length for long text on ultrawide (without shrinking charts).
- [ ] Add grouping/labels in Export menu for “trend CSV” vs “pivot CSV”.
- [ ] Manually verify keyboard behavior for Export, Theme, and Sticky filters (Tab, Shift+Tab, Enter/Space, Esc).
- [ ] Verify no overlap at common breakpoints (1440p, 4k, 5k2k) and at 90–110% browser zoom.
