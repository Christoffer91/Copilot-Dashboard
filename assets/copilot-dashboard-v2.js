(function () {
  const VERSION = "20251227-v2-1";
  const SAMPLE_DATASET_URL = "samples/viva-copilot-dashboard-sample.csv";
  const REQUIRED_DIMENSIONS = [
    { key: "personId", label: "PersonId", aliases: ["personid"] },
    { key: "metricDate", label: "MetricDate", aliases: ["metricdate"] },
    { key: "organization", label: "Organization", aliases: ["organization"] },
    { key: "functionType", label: "FunctionType", aliases: ["functiontype"] }
  ];

  const DEFAULT_METRIC_ALIASES = [
    "total copilot actions taken",
    "total copilot actions",
    "total copilot actions taken",
    "total copilot actions taken "
  ];
  const DEFAULT_DIMENSION = "organization";
  const DEFAULT_AGGREGATION = "weekly";

  const dom = {
    toastContainer: document.querySelector("[data-toast-container]"),
    themeToggle: document.querySelector("[data-theme-toggle]"),
    themeIcon: document.querySelector("[data-theme-icon]"),
    themeSelect: document.querySelector("[data-theme-select]"),
    dropZone: document.querySelector("[data-drop-zone]"),
    fileInput: document.querySelector("[data-file-input]"),
    pickFile: document.querySelector("[data-pick-file]"),
    loadSample: document.querySelector("[data-load-sample]"),
    uploadMeta: document.querySelector("[data-upload-meta]"),
    uploadStatus: document.querySelector("[data-upload-status]"),
    uploadProgress: document.querySelector("[data-upload-progress]"),
    uploadProgressBar: document.querySelector("[data-upload-progress-bar]"),
    uploadCancel: document.querySelector("[data-upload-cancel]"),
    schemaSummary: document.querySelector("[data-schema-summary]"),
    schemaWarnings: document.querySelector("[data-schema-warnings]"),
    datasetMessage: document.querySelector("[data-dataset-message]"),
    datasetMeta: document.querySelector("[data-dataset-meta]"),
    metaRecords: document.querySelector("[data-meta-records]"),
    metaUsers: document.querySelector("[data-meta-users]"),
    metaDates: document.querySelector("[data-meta-dates]"),
    metaMetrics: document.querySelector("[data-meta-metrics]"),
    metaFiltered: document.querySelector("[data-meta-filtered]"),
    stickyFilterBar: document.querySelector("[data-sticky-filter-bar]"),
    stickyFilterSummary: document.querySelector("[data-sticky-filter-summary]"),
    stickyFilterBtn: document.querySelector("[data-sticky-filter-btn]"),
    stickyFilterDropdown: document.querySelector("[data-sticky-filter-dropdown]"),
    filtersCard: document.querySelector("[data-filters-card]"),
    filtersGrid: document.querySelector("[data-filters-grid]"),
    activeFiltersSummary: document.querySelector("[data-active-filters-summary]"),
    activeFiltersList: document.querySelector("[data-active-filters-list]"),
    clearAllFilters: document.querySelector("[data-clear-all-filters]"),
    summaryCard: document.querySelector("[data-summary-card]"),
    summaryGrid: document.querySelector("[data-summary-grid]"),
    trendCard: document.querySelector("[data-trend-card]"),
    trendControls: document.querySelector("[data-trend-controls]"),
    trendModeButtons: document.querySelectorAll("[data-trend-mode]"),
    seriesToggleGroup: document.querySelector("[data-series-toggle-group]"),
    trendCanvas: document.querySelector("[data-trend-chart]"),
    trendEmpty: document.querySelector("[data-trend-empty]"),
    trendCaption: document.querySelector("[data-trend-caption]"),
    trendWindow: document.querySelector("[data-trend-window]"),
    exportTrendPng: document.querySelector("[data-export-trend-png]"),
    workloadCard: document.querySelector("[data-workload-card]"),
    workloadMode: document.querySelector("[data-workload-mode]"),
    workloadCanvas: document.querySelector("[data-workload-chart]"),
    workloadBody: document.querySelector("[data-workload-body]"),
    workloadEmpty: document.querySelector("[data-workload-empty]"),
    exportWorkloadPng: document.querySelector("[data-export-workload-png]"),
    dimensionTrendCard: document.querySelector("[data-dimension-trend-card]"),
    dimensionTrendCanvas: document.querySelector("[data-dimension-trend-chart]"),
    exportDimTrendPng: document.querySelector("[data-export-dimtrend-png]"),
    topCard: document.querySelector("[data-top-card]"),
    breakdownCanvas: document.querySelector("[data-breakdown-chart]"),
    exportBreakdownPng: document.querySelector("[data-export-breakdown-png]"),
    topEmpty: document.querySelector("[data-top-empty]"),
    topBody: document.querySelector("[data-top-body]"),
    topHeader: document.querySelector("[data-top-dimension-header]"),
    exportSummary: document.querySelector("[data-export-summary]"),
    exportTrigger: document.querySelector("[data-export-trigger]"),
    exportMenu: document.querySelector("[data-export-menu]"),
    exportSummaryMenu: document.querySelector("[data-export-summary-menu]"),
    exportTrendCsvMenu: document.querySelector("[data-export-trend-csv-menu]"),
    exportTrendMenu: document.querySelector("[data-export-trend-menu]"),
    exportWorkloadCsvMenu: document.querySelector("[data-export-workload-csv-menu]"),
    exportWorkloadMenu: document.querySelector("[data-export-workload-menu]"),
    exportDimTrendMenu: document.querySelector("[data-export-dimtrend-menu]"),
    exportBreakdownMenu: document.querySelector("[data-export-breakdown-menu]"),
    metricsCard: document.querySelector("[data-metrics-card]"),
    metricsBody: document.querySelector("[data-metrics-body]"),
    metricSearch: document.querySelector("[data-metric-search]")
  };

  const state = {
    worker: null,
    dataset: null,
    baseDataset: null,
    sourceFile: null,
    theme: null,
    filters: {
      dimension: DEFAULT_DIMENSION,
      metricKey: null,
      aggregation: DEFAULT_AGGREGATION,
      startDate: "",
      endDate: "",
      timeframePreset: "all",
      dimensionValues: new Set()
    },
    workloadMode: "actions",
    trendMode: "metric",
    hiddenSeries: new Set(),
    chart: null,
    breakdownChart: null,
    dimensionTrendChart: null,
    workloadChart: null
  };
  let controlIdCounter = 0;
  const THEME_OPTIONS = [
    { id: "light-base", label: "Light" },
    { id: "light-cool", label: "Cool Light" },
    { id: "dark", label: "Midnight Dark" },
    { id: "dark-carbon", label: "Carbon Black" },
    { id: "dark-cyberpunk", label: "Cyberpunk" },
    { id: "dark-neon", label: "Neon" },
    { id: "dark-sunset", label: "Sunset" }
  ];
  const THEME_CLASSES = THEME_OPTIONS.map((t) => themeIdToBodyClass(t.id));
  const THEME_STORAGE_KEY = "copilotDashboardV2Theme";
  const LAST_LIGHT_STORAGE_KEY = "copilotDashboardV2LastLightTheme";
  const LAST_DARK_STORAGE_KEY = "copilotDashboardV2LastDarkTheme";
  let lastLightTheme = "light-base";
  let lastDarkTheme = "dark";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  function initialize() {
    if (!dom.dropZone || !dom.fileInput) {
      console.error("Dashboard v2: missing required DOM nodes.");
      return;
    }

    initializeTheme();
    initializeUploadControls();
    initializeWorkloadControls();
    initializeTrendControls();
    initializeStickyFilterBar();
    initializeExportButtons();
    setStatus("Upload a CSV to begin.");

    dom.metricSearch?.addEventListener("input", debounce(() => renderMetricsTable(), 120));
    dom.clearAllFilters?.addEventListener("click", () => resetAllFilters());
  }

  function initializeTrendControls() {
    if (!dom.trendModeButtons || dom.trendModeButtons.length === 0) return;
    dom.trendModeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-trend-mode") || "metric";
        state.trendMode = mode;
        setTrendModeButtons(mode);
        state.hiddenSeries = new Set();
        renderTrendChart();
      });
    });
    setTrendModeButtons(state.trendMode);
  }

  function setTrendModeButtons(activeMode) {
    if (!dom.trendModeButtons || dom.trendModeButtons.length === 0) return;
    dom.trendModeButtons.forEach((btn) => {
      const mode = btn.getAttribute("data-trend-mode");
      const isActive = mode === activeMode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function initializeWorkloadControls() {
    if (!dom.workloadMode) return;
    const options = [
      { value: "actions", label: "Copilot actions taken in apps" },
      { value: "activeDays", label: "Days of active Copilot usage in apps" },
      { value: "enabledDays", label: "Copilot enabled days for apps" }
    ];
    dom.workloadMode.innerHTML = "";
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      dom.workloadMode.appendChild(el);
    }
    dom.workloadMode.value = state.workloadMode;
    dom.workloadMode.addEventListener("change", () => {
      state.workloadMode = dom.workloadMode.value;
      renderWorkloadBreakdown();
    });
  }

  function initializeTheme() {
    const storedTheme = safeLocalStorageGet(THEME_STORAGE_KEY);
    const storedLastLight = safeLocalStorageGet(LAST_LIGHT_STORAGE_KEY);
    const storedLastDark = safeLocalStorageGet(LAST_DARK_STORAGE_KEY);
    if (storedLastLight) lastLightTheme = storedLastLight;
    if (storedLastDark) lastDarkTheme = storedLastDark;

    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = storedTheme || (prefersDark ? lastDarkTheme : lastLightTheme);
    applyTheme(initialTheme);

    if (dom.themeSelect) {
      dom.themeSelect.innerHTML = "";
      for (const option of THEME_OPTIONS) {
        const el = document.createElement("option");
        el.value = option.id;
        el.textContent = option.label;
        dom.themeSelect.appendChild(el);
      }
      dom.themeSelect.value = state.theme || initialTheme;
      dom.themeSelect.addEventListener("change", () => applyTheme(dom.themeSelect.value));
    }

    dom.themeToggle?.addEventListener("click", () => {
      const next = isDarkTheme() ? lastLightTheme : lastDarkTheme;
      applyTheme(next);
    });
  }

  function applyTheme(themeId) {
    const safeTheme = THEME_OPTIONS.some((t) => t.id === themeId) ? themeId : "light-base";
    const bodyClass = themeIdToBodyClass(safeTheme);

    for (const cls of THEME_CLASSES) document.body.classList.remove(cls);
    document.body.classList.add(bodyClass);

    state.theme = safeTheme;
    safeLocalStorageSet(THEME_STORAGE_KEY, safeTheme);

    if (isDarkTheme()) {
      lastDarkTheme = safeTheme;
      safeLocalStorageSet(LAST_DARK_STORAGE_KEY, safeTheme);
    } else {
      lastLightTheme = safeTheme;
      safeLocalStorageSet(LAST_LIGHT_STORAGE_KEY, safeTheme);
    }

    updateThemeToggleUi();
    if (dom.themeSelect) dom.themeSelect.value = safeTheme;
    renderChartsAfterThemeChange();
  }

  function updateThemeToggleUi() {
    const dark = isDarkTheme();
    if (dom.themeToggle) dom.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    if (dom.themeToggle) dom.themeToggle.setAttribute("aria-label", dark ? "Enable light mode" : "Enable dark mode");
    if (dom.themeIcon) dom.themeIcon.textContent = dark ? "☀" : "☾";
  }

  function themeIdToBodyClass(themeId) {
    if (themeId === "dark") return "is-dark";
    return "is-" + themeId;
  }

  function isDarkTheme() {
    for (const cls of document.body.classList) {
      if (String(cls).startsWith("is-dark")) return true;
    }
    return false;
  }

  function initializeUploadControls() {
    dom.pickFile?.addEventListener("click", () => dom.fileInput.click());

    dom.fileInput.addEventListener("change", async () => {
      const file = dom.fileInput.files && dom.fileInput.files[0];
      if (!file) return;
      await loadFile(file);
    });

    dom.loadSample?.addEventListener("click", async () => {
      try {
        setStatus("Fetching sample dataset…");
        const response = await fetch(SAMPLE_DATASET_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load sample (${response.status})`);
        const csvText = await response.text();
        await loadCsvTextAsFile(csvText, "viva-copilot-dashboard-sample.csv");
      } catch (error) {
        setStatus("Failed to load sample dataset.");
        toast(String(error?.message || error), "error");
      }
    });

    dom.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dom.dropZone.classList.add("is-dragover");
    });
    dom.dropZone.addEventListener("dragleave", () => dom.dropZone.classList.remove("is-dragover"));
    dom.dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dom.dropZone.classList.remove("is-dragover");
      const file = event.dataTransfer?.files?.[0];
      if (file) await loadFile(file);
    });

    dom.uploadCancel?.addEventListener("click", () => cancelImport());
    dom.exportSummary?.addEventListener("click", () => exportSummaryCsv());
    setExportEnabled(false);
  }

  function initializeStickyFilterBar() {
    if (!dom.stickyFilterBar || !dom.stickyFilterBtn || !dom.stickyFilterDropdown) return;

    const onScroll = debounce(() => {
      updateStickyFilterVisibility();
      updateStickyFilterSummary();
    }, 50);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    dom.stickyFilterBtn.addEventListener("click", () => toggleStickyFilterDropdown());
    document.addEventListener("click", (event) => {
      if (!dom.stickyFilterBar || dom.stickyFilterBar.hidden) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const within = dom.stickyFilterBar.contains(target);
      if (!within) closeStickyFilterDropdown();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeStickyFilterDropdown();
    });

    updateStickyFilterVisibility();
    updateStickyFilterSummary();
  }

  function initializeExportButtons() {
    dom.exportTrendPng?.addEventListener("click", () => downloadCanvasPng(dom.trendCanvas, "trend.png"));
    dom.exportWorkloadPng?.addEventListener("click", () => downloadCanvasPng(dom.workloadCanvas, "workload.png"));
    dom.exportDimTrendPng?.addEventListener("click", () => downloadCanvasPng(dom.dimensionTrendCanvas, "top-dimensions-trend.png"));
    dom.exportBreakdownPng?.addEventListener("click", () => downloadCanvasPng(dom.breakdownCanvas, "top-breakdown.png"));

    initializeExportMenu();
  }

  function initializeExportMenu() {
    if (!dom.exportTrigger || !dom.exportMenu) return;

    dom.exportTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleExportMenu();
    });

    dom.exportSummaryMenu?.addEventListener("click", () => {
      exportSummaryCsv();
      closeExportMenu();
    });
    dom.exportTrendCsvMenu?.addEventListener("click", () => {
      exportTrendCsv();
      closeExportMenu();
    });
    dom.exportTrendMenu?.addEventListener("click", () => {
      downloadCanvasPng(dom.trendCanvas, "trend.png");
      closeExportMenu();
    });
    dom.exportWorkloadCsvMenu?.addEventListener("click", () => {
      exportWorkloadCsv();
      closeExportMenu();
    });
    dom.exportWorkloadMenu?.addEventListener("click", () => {
      downloadCanvasPng(dom.workloadCanvas, "workload.png");
      closeExportMenu();
    });
    dom.exportDimTrendMenu?.addEventListener("click", () => {
      downloadCanvasPng(dom.dimensionTrendCanvas, "top-dimensions-trend.png");
      closeExportMenu();
    });
    dom.exportBreakdownMenu?.addEventListener("click", () => {
      downloadCanvasPng(dom.breakdownCanvas, "top-breakdown.png");
      closeExportMenu();
    });

    dom.exportMenu.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => closeExportMenu());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeExportMenu();
    });
  }

  function toggleExportMenu() {
    if (!dom.exportMenu || !dom.exportTrigger) return;
    const isOpen = !dom.exportMenu.hidden;
    if (isOpen) {
      closeExportMenu();
      return;
    }
    dom.exportMenu.hidden = false;
    dom.exportTrigger.setAttribute("aria-expanded", "true");
    const firstItem = dom.exportMenu.querySelector("[role='menuitem']");
    if (firstItem instanceof HTMLElement) firstItem.focus();
  }

  function closeExportMenu() {
    if (!dom.exportMenu || !dom.exportTrigger) return;
    dom.exportMenu.hidden = true;
    dom.exportTrigger.setAttribute("aria-expanded", "false");
  }

  function updateStickyFilterVisibility() {
    if (!dom.stickyFilterBar || !dom.filtersCard || dom.filtersCard.hidden) {
      if (dom.stickyFilterBar) dom.stickyFilterBar.hidden = true;
      return;
    }

    const rect = dom.filtersCard.getBoundingClientRect();
    const hasScrolledPast = rect.top < -24;
    dom.stickyFilterBar.hidden = !hasScrolledPast;

    if (!hasScrolledPast) {
      closeStickyFilterDropdown();
    }
  }

  function updateStickyFilterSummary() {
    if (!dom.stickyFilterSummary) return;
    dom.stickyFilterSummary.textContent = getFilterSummaryParts().join(" \u00b7 ");
  }

  function toggleStickyFilterDropdown() {
    if (!dom.stickyFilterDropdown || !dom.stickyFilterBtn) return;
    const isOpen = !dom.stickyFilterDropdown.hidden;
    if (isOpen) {
      closeStickyFilterDropdown();
      return;
    }

    dom.stickyFilterBtn.classList.add("is-open");
    dom.stickyFilterBtn.setAttribute("aria-expanded", "true");
    dom.stickyFilterDropdown.hidden = false;
    dom.stickyFilterBtn.innerHTML = "Hide filters &#9650;";
    renderStickyFilterDropdown();

    const firstFocusable = dom.stickyFilterDropdown.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (firstFocusable instanceof HTMLElement) firstFocusable.focus();
  }

  function closeStickyFilterDropdown() {
    if (!dom.stickyFilterDropdown || !dom.stickyFilterBtn) return;
    dom.stickyFilterBtn.classList.remove("is-open");
    dom.stickyFilterBtn.setAttribute("aria-expanded", "false");
    dom.stickyFilterDropdown.hidden = true;
    dom.stickyFilterBtn.innerHTML = "Show filters &#9660;";
    dom.stickyFilterDropdown.innerHTML = "";
  }

  function renderStickyFilterDropdown() {
    if (!dom.stickyFilterDropdown) return;
    dom.stickyFilterDropdown.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "active-filters-summary";

    const header = document.createElement("div");
    header.className = "active-filters-header";
    const label = document.createElement("span");
    label.className = "active-filters-label";
    label.textContent = "Active filters";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear-all-filters";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => {
      resetAllFilters();
      closeStickyFilterDropdown();
    });
    header.append(label, clear);

    const list = document.createElement("div");
    list.className = "active-filters-list";
    const chips = buildActiveFilterChips();
    if (chips.length) {
      for (const chip of chips) list.appendChild(chip);
    } else {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No active filters.";
      list.appendChild(empty);
    }

    const actions = document.createElement("div");
    actions.className = "v2-filter-actions";

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "upload-button upload-button--ghost";
    jump.textContent = "Jump to filters";
    jump.addEventListener("click", () => {
      dom.filtersCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      closeStickyFilterDropdown();
    });

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "upload-button";
    apply.textContent = "Apply";
    apply.addEventListener("click", async () => {
      await runFilteredAggregation();
      closeStickyFilterDropdown();
    });

    actions.append(jump, apply);

    summary.append(header, list, actions);
    dom.stickyFilterDropdown.appendChild(summary);
  }

  async function loadCsvTextAsFile(csvText, filename) {
    const file = new File([csvText], filename, { type: "text/csv" });
    await loadFile(file);
  }

  async function loadFile(file) {
    if (typeof Worker === "undefined") {
      toast("Your browser does not support Web Workers.", "error");
      return;
    }
    if (typeof Papa === "undefined" || typeof Papa.parse !== "function") {
      toast("PapaParse is not available. Check network/CSP.", "error");
      return;
    }
    if (typeof Chart === "undefined") {
      toast("Chart.js is not available. Check network/CSP.", "error");
      return;
    }

    cancelImport();
    resetUiForImport(file);

    state.sourceFile = file;
    state.worker = new Worker("assets/worker-csv-aggregate.js?v=" + encodeURIComponent(VERSION));
    state.worker.onmessage = (event) => onWorkerMessage(event.data);
    state.worker.onerror = (event) => {
      setStatus("Import failed.");
      toast(event.message || "Worker error", "error");
      showProgress(false);
    };

    state.worker.postMessage({
      type: "parse",
      file,
      requiredDimensions: REQUIRED_DIMENSIONS,
      filter: null
    });
  }

  function cancelImport() {
    if (state.worker) {
      try {
        state.worker.postMessage({ type: "cancel" });
      } catch {}
      state.worker.terminate();
      state.worker = null;
    }
    showProgress(false);
  }

  function onWorkerMessage(message) {
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "progress":
        updateProgress(message);
        break;
      case "result":
        onDatasetReady(message.result);
        break;
      case "error":
        setStatus("Import failed.");
        toast(message.message || "Import failed.", "error");
        showProgress(false);
        break;
      default:
        break;
    }
  }

  function resetUiForImport(file) {
    state.dataset = null;
    state.baseDataset = null;
    dom.uploadMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
    dom.schemaSummary.hidden = true;
    dom.schemaWarnings.hidden = true;
    dom.schemaSummary.textContent = "";
    dom.schemaWarnings.textContent = "";
    if (dom.datasetMessage) dom.datasetMessage.textContent = "Importing…";
    if (dom.datasetMeta) dom.datasetMeta.hidden = true;
    if (dom.trendEmpty) dom.trendEmpty.hidden = true;
    if (dom.topEmpty) dom.topEmpty.hidden = true;
    if (dom.workloadEmpty) dom.workloadEmpty.hidden = true;
    dom.filtersCard.hidden = true;
    dom.summaryCard.hidden = true;
    dom.trendCard.hidden = true;
    if (dom.workloadCard) dom.workloadCard.hidden = true;
    dom.topCard.hidden = true;
    clearTopTable();
    destroyChart();
    destroyBreakdownChart();
    destroyDimensionTrendChart();
    destroyWorkloadChart();
    setStatus("Importing…");
    showProgress(true);
    dom.uploadProgressBar.value = 0;
    setExportEnabled(false);
  }

  function updateProgress(progress) {
    const rows = Number(progress.rowsProcessed || 0);
    const phase = progress.phase || "Parsing";
    dom.uploadProgressBar.removeAttribute("value");
    dom.uploadStatus.textContent = `${phase}… ${rows.toLocaleString("en-US")} rows`;
  }

  function onDatasetReady(result) {
    showProgress(false);
    if (!result) {
      setStatus("Import failed.");
      toast("No result returned.", "error");
      return;
    }

    if (!state.baseDataset) {
      state.baseDataset = result;
      state.dataset = result;
    } else {
      state.dataset = result;
    }

    renderSchemaSummary();
    renderDatasetCard();
    buildFilters();
    setDefaultMetricIfMissing();
    renderAll();

    dom.filtersCard.hidden = false;
    dom.summaryCard.hidden = false;
    dom.trendCard.hidden = false;
    if (dom.workloadCard) dom.workloadCard.hidden = false;
    dom.dimensionTrendCard.hidden = false;
    dom.topCard.hidden = false;
    dom.metricsCard.hidden = false;

    setStatus("Ready.");
    setExportEnabled(true);
  }

  function renderSchemaSummary() {
    const meta = state.dataset?.meta;
    if (!meta) return;
    const hasFilter = Boolean(state.dataset?.appliedFilter?.dateRange || state.dataset?.appliedFilter?.dimensionFilter);

    const parts = [
      `${Number(meta.rowCount || 0).toLocaleString("en-US")} rows`,
      `Users: ${Number(meta.uniquePersons || 0).toLocaleString("en-US")}`,
      meta.minDate && meta.maxDate ? `Dates: ${meta.minDate} → ${meta.maxDate}` : null,
      `Metrics: ${Number(meta.metricCount || 0).toLocaleString("en-US")}`,
      meta.filteredOutRows ? `Filtered out: ${Number(meta.filteredOutRows || 0).toLocaleString("en-US")}` : null
      ,
      hasFilter ? "Filters applied" : null
    ].filter(Boolean);

    dom.schemaSummary.textContent = parts.join(" · ");
    dom.schemaSummary.hidden = false;

    const warnings = [];
    if (Array.isArray(meta.missingRequired) && meta.missingRequired.length) {
      warnings.push(`Missing required columns: ${meta.missingRequired.join(", ")}`);
    }
    if (meta.invalidDateRows) warnings.push(`Rows skipped (invalid dates): ${Number(meta.invalidDateRows).toLocaleString("en-US")}`);
    if (meta.blankOrganizationRows) warnings.push(`Rows with blank Organization: ${Number(meta.blankOrganizationRows).toLocaleString("en-US")}`);
    if (meta.blankFunctionTypeRows) warnings.push(`Rows with blank FunctionType: ${Number(meta.blankFunctionTypeRows).toLocaleString("en-US")}`);

    if (warnings.length) {
      dom.schemaWarnings.textContent = warnings.join(" · ");
      dom.schemaWarnings.hidden = false;
    }
  }

  function renderDatasetCard() {
    if (!dom.datasetMessage) return;
    const meta = state.dataset?.meta;
    if (!meta) {
      dom.datasetMessage.textContent = "Load a CSV export to unlock the dashboard.";
      if (dom.datasetMeta) dom.datasetMeta.hidden = true;
      return;
    }

    const applied = Boolean(state.dataset?.appliedFilter?.dateRange || state.dataset?.appliedFilter?.dimensionFilter);
    dom.datasetMessage.textContent = applied ? "Filters applied to this view." : "Full dataset loaded.";

    if (dom.datasetMeta) dom.datasetMeta.hidden = false;
    if (dom.metaRecords) dom.metaRecords.textContent = Number(meta.rowCount || 0).toLocaleString("en-US");
    if (dom.metaUsers) dom.metaUsers.textContent = Number(meta.uniquePersons || 0).toLocaleString("en-US");
    if (dom.metaDates) dom.metaDates.textContent = meta.minDate && meta.maxDate ? `${meta.minDate} → ${meta.maxDate}` : "-";
    if (dom.metaMetrics) dom.metaMetrics.textContent = Number(meta.metricCount || 0).toLocaleString("en-US");
    if (dom.metaFiltered) dom.metaFiltered.textContent = Number(meta.filteredOutRows || 0).toLocaleString("en-US");
  }

  function buildFilters() {
    dom.filtersGrid.innerHTML = "";
    const meta = state.dataset?.meta;
    const metricCatalog = state.dataset?.metricCatalog || [];

    const timeframeField = buildSelectField("Timeframe", "timeframePreset", [
      { value: "all", label: "All time" },
      { value: "28", label: "Last 28 days" },
      { value: "90", label: "Last 90 days" },
      { value: "custom", label: "Custom range" }
    ]);

    const dimensionField = buildSelectField("Dimension", "dimension", [
      { value: "organization", label: "Organization" },
      { value: "functionType", label: "FunctionType" }
    ]);

    const aggregationField = buildSelectField("Aggregation", "aggregation", [
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" }
    ]);

    const metricField = buildMetricField(metricCatalog);

    const startField = buildDateField("Start date", "startDate", meta?.minDate || "", "custom");
    const endField = buildDateField("End date", "endDate", meta?.maxDate || "", "custom");
    const dimensionValuesField = buildDimensionValuesField();

    const actionField = buildFilterActions();

    dom.filtersGrid.append(timeframeField, dimensionField, dimensionValuesField, metricField, aggregationField, startField, endField, actionField);
  }

  function buildSelectField(labelText, key, options) {
    const wrapper = document.createElement("div");
    wrapper.className = "v2-control";

    const label = document.createElement("label");
    label.className = "v2-control__label";
    label.textContent = labelText;

    const select = document.createElement("select");
    select.className = "control-select";
    select.id = nextControlId("v2-select");
    label.htmlFor = select.id;
    select.value = state.filters[key] || "";

    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }

    select.addEventListener("change", () => {
      state.filters[key] = select.value;
      if (key === "dimension") {
        state.filters.dimensionValues = new Set();
        buildFilters();
        renderAll();
        return;
      }

      if (key === "timeframePreset") {
        applyTimeframePreset();
        buildFilters();
        renderAll();
        return;
      }

      renderAll();
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function buildDateField(labelText, key, defaultValue, onlyWhenPreset) {
    const wrapper = document.createElement("div");
    wrapper.className = "v2-control";

    const label = document.createElement("label");
    label.className = "v2-control__label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.className = "control-input";
    input.type = "date";
    input.id = nextControlId("v2-date");
    label.htmlFor = input.id;
    input.value = state.filters[key] || defaultValue || "";

    input.addEventListener("change", () => {
      state.filters[key] = input.value;
      renderAll();
    });

    wrapper.append(label, input);

    if (onlyWhenPreset && state.filters.timeframePreset !== onlyWhenPreset) {
      wrapper.style.display = "none";
    }
    return wrapper;
  }

  function buildMetricField(metricCatalog) {
    const wrapper = document.createElement("div");
    wrapper.className = "v2-control v2-control--wide";

    const label = document.createElement("label");
    label.className = "v2-control__label";
    label.textContent = "Metric";

    const select = document.createElement("select");
    select.className = "control-select";
    select.id = nextControlId("v2-metric");
    label.htmlFor = select.id;

    const groups = groupMetrics(metricCatalog);
    for (const groupName of Object.keys(groups)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = groupName;
      for (const metric of groups[groupName]) {
        const option = document.createElement("option");
        option.value = metric.key;
        option.textContent = metric.label;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }

    select.value = state.filters.metricKey || "";

    select.addEventListener("change", () => {
      state.filters.metricKey = select.value;
      renderAll();
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function groupMetrics(metricCatalog) {
    const groups = Object.create(null);
    for (const metric of metricCatalog) {
      const group = metric.group || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(metric);
    }
    for (const name of Object.keys(groups)) {
      groups[name].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }
    return Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, Object.create(null));
  }

  function buildDimensionValuesField() {
    const wrapper = document.createElement("div");
    wrapper.className = "v2-control v2-control--wide";

    const searchLabel = document.createElement("label");
    searchLabel.className = "v2-control__label";
    searchLabel.textContent = state.filters.dimension === "functionType" ? "Filter FunctionType" : "Filter Organization";

    const container = document.createElement("div");
    container.className = "v2-multi";

    const search = document.createElement("input");
    search.className = "control-input";
    search.type = "search";
    search.placeholder = "Search…";
    search.id = nextControlId("v2-dim-search");
    searchLabel.htmlFor = search.id;

    const list = document.createElement("div");
    list.className = "v2-multi__list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Dimension values");

    const values = getDimensionValues();
    const renderList = () => {
      const q = (search.value || "").trim().toLowerCase();
      list.innerHTML = "";
      for (const value of values) {
        if (q && !value.toLowerCase().includes(q)) continue;
        const item = document.createElement("label");
        item.className = "v2-multi__item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.filters.dimensionValues.has(value);
        cb.addEventListener("change", () => {
          if (cb.checked) state.filters.dimensionValues.add(value);
          else state.filters.dimensionValues.delete(value);
          renderActiveFiltersSummary();
          updateStickyFilterSummary();
        });
        const text = document.createElement("span");
        text.textContent = value;
        item.append(cb, text);
        list.appendChild(item);
      }
    };

    search.addEventListener("input", debounce(renderList, 120));

    const buttons = document.createElement("div");
    buttons.className = "v2-multi__actions";
    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "upload-button upload-button--ghost";
    selectAll.textContent = "Select all";
    selectAll.addEventListener("click", () => {
      state.filters.dimensionValues = new Set(values);
      renderList();
    });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "upload-button upload-button--ghost";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      state.filters.dimensionValues = new Set();
      renderList();
    });
    buttons.append(selectAll, clear);

    container.append(search, buttons, list);
    wrapper.append(searchLabel, container);

    renderList();
    return wrapper;
  }

  function buildFilterActions() {
    const wrapper = document.createElement("div");
    wrapper.className = "v2-control v2-control--wide";

    const label = document.createElement("div");
    label.className = "v2-control__label";
    label.textContent = "Apply filters (re-processes the file)";

    const row = document.createElement("div");
    row.className = "v2-filter-actions";

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "upload-button";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => runFilteredAggregation());

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "upload-button upload-button--ghost";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      state.filters.dimensionValues = new Set();
      state.filters.timeframePreset = "all";
      const meta = state.baseDataset?.meta;
      state.filters.startDate = meta?.minDate || "";
      state.filters.endDate = meta?.maxDate || "";
      state.dataset = state.baseDataset;
      buildFilters();
      renderAll();
    });

    row.append(apply, reset);
    wrapper.append(label, row);
    return wrapper;
  }

  function getDimensionValues() {
    const base = state.baseDataset || state.dataset;
    const dimension = state.filters.dimension;
    const dimTotals = base?.dimensionTotalsByMetric?.[dimension] || {};
    return Object.keys(dimTotals).sort((a, b) => a.localeCompare(b));
  }

  function applyTimeframePreset() {
    const meta = state.baseDataset?.meta || state.dataset?.meta;
    const maxDate = meta?.maxDate || "";
    if (state.filters.timeframePreset === "all") {
      state.filters.startDate = meta?.minDate || "";
      state.filters.endDate = meta?.maxDate || "";
      return;
    }
    if (state.filters.timeframePreset === "custom") {
      state.filters.startDate = state.filters.startDate || meta?.minDate || "";
      state.filters.endDate = state.filters.endDate || meta?.maxDate || "";
      return;
    }
    const days = Number(state.filters.timeframePreset);
    if (!maxDate || !Number.isFinite(days)) return;
    const end = new Date(maxDate + "T00:00:00Z");
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    state.filters.endDate = maxDate;
    state.filters.startDate = start.toISOString().slice(0, 10);
  }

  async function runFilteredAggregation() {
    if (!state.sourceFile) return;
    if (typeof Worker === "undefined") return;

    cancelImport();
    showProgress(true);
    setStatus("Applying filters…");
    setExportEnabled(false);

    const allowedValues = Array.from(state.filters.dimensionValues || []);
    const filter = {
      startDate: state.filters.startDate || "",
      endDate: state.filters.endDate || "",
      dimension: state.filters.dimension,
      allowedValues
    };

    state.worker = new Worker("assets/worker-csv-aggregate.js?v=" + encodeURIComponent(VERSION));
    state.worker.onmessage = (event) => onWorkerMessage(event.data);
    state.worker.onerror = (event) => {
      setStatus("Filter aggregation failed.");
      toast(event.message || "Worker error", "error");
      showProgress(false);
      setExportEnabled(Boolean(state.dataset));
    };

    state.worker.postMessage({
      type: "parse",
      file: state.sourceFile,
      requiredDimensions: REQUIRED_DIMENSIONS,
      filter
    });
  }

  function setDefaultMetricIfMissing() {
    const metricCatalog = state.dataset?.metricCatalog || [];
    if (state.filters.metricKey && metricCatalog.some((m) => m.key === state.filters.metricKey)) return;

    const byKey = new Map(metricCatalog.map((m) => [m.key, m]));
    const defaultMetric =
      DEFAULT_METRIC_ALIASES.map(normalizeHeader).find((alias) => byKey.has(alias)) ||
      (metricCatalog[0] ? metricCatalog[0].key : null);

    state.filters.metricKey = defaultMetric;
  }

  function renderAll() {
    if (!state.dataset) return;
    renderSummary();
    renderTrendChart();
    renderWorkloadBreakdown();
    renderDimensionTrendChart();
    renderTopTable();
    renderBreakdownChart();
    renderMetricsTable();
    renderActiveFiltersSummary();
    updateStickyFilterSummary();
  }

  function renderSummary() {
    const meta = state.dataset?.meta;
    const totals = state.dataset?.totalsByMetric || {};

    dom.summaryGrid.innerHTML = "";

    const totalActionsKey = pickMetricKey(["total copilot actions taken", "total copilot actions"]);
    const totalEnabledDaysKey = pickMetricKey(["total copilot enabled days"]);
    const totalActiveDaysKey = pickMetricKey(["total copilot active days"]);

    dom.summaryGrid.appendChild(
      buildSummaryCard({
        variant: "actions",
        label: "Copilot actions taken",
        value: totalActionsKey ? totals[totalActionsKey] || 0 : null,
        note: totalActionsKey ? "Aggregated from the export." : "Column not found in this export.",
        icon: ICONS.bolt
      })
    );

    dom.summaryGrid.appendChild(
      buildSummaryCard({
        variant: "users",
        label: "Active users",
        value: Number(meta?.uniquePersons || 0),
        note: "Unique PersonId count (after applied filters).",
        icon: ICONS.users
      })
    );

    dom.summaryGrid.appendChild(
      buildSummaryCard({
        variant: "hours",
        label: "Copilot active days",
        value: totalActiveDaysKey ? totals[totalActiveDaysKey] || 0 : null,
        note: totalActiveDaysKey ? "Total Copilot active days." : "Column not found in this export.",
        icon: ICONS.clock
      })
    );

    dom.summaryGrid.appendChild(
      buildSummaryCard({
        variant: "hours",
        label: "Copilot enabled days",
        value: totalEnabledDaysKey ? totals[totalEnabledDaysKey] || 0 : null,
        note: totalEnabledDaysKey ? "Total Copilot enabled days." : "Column not found in this export.",
        icon: ICONS.calendar
      })
    );

    const latest = buildLatestPeriod(meta?.maxDate || "", state.filters.metricKey);
    dom.summaryGrid.appendChild(
      buildLatestPeriodCard({
        periodLabel: latest.periodLabel,
        metricLabel: latest.metricLabel,
        value: latest.value,
        note: latest.note
      })
    );
  }

  function pickMetricKey(candidates) {
    const totals = state.dataset?.totalsByMetric || {};
    const keys = Object.keys(totals);
    const keySet = new Set(keys);
    for (const candidate of candidates) {
      const normalized = normalizeHeader(candidate);
      if (keySet.has(normalized)) return normalized;
    }
    return null;
  }

  const ICONS = {
    bolt: '<svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M13 2.5L6 13.5h4.2l-1 8 8-12h-4.2L13 2.5Z"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" role="img" focusable="false"><circle cx="12" cy="10.5" r="2.6"/><path d="M6.5 18.5c0-2.6 2.5-4.7 5.5-4.7s5.5 2.1 5.5 4.7"/><circle cx="17.5" cy="9.2" r="1.8"/><path d="M16.2 14.7a3.3 3.3 0 0 1 2.8 3.3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" role="img" focusable="false"><circle cx="12" cy="12" r="6.5"/><path d="M12 8.25v4.25l2.5 1.6"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" role="img" focusable="false"><rect x="4.5" y="6.5" width="15" height="12.5" rx="2"/><path d="M8 4.5v4"/><path d="M16 4.5v4"/><line x1="4.5" y1="10.5" x2="19.5" y2="10.5"/></svg>'
  };

  function buildSummaryCard({ variant, label, value, note, icon }) {
    const card = document.createElement("article");
    card.className = `summary-card summary-card--${variant}`;

    const meta = document.createElement("div");
    meta.className = "summary-card__meta";

    const iconSpan = document.createElement("span");
    iconSpan.className = "summary-icon";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.innerHTML = icon;

    const labelSpan = document.createElement("span");
    labelSpan.className = "summary-label";
    labelSpan.textContent = label;

    meta.append(iconSpan, labelSpan);

    const valueSpan = document.createElement("span");
    valueSpan.className = "summary-value";
    valueSpan.textContent = value === null ? "-" : formatValue(value, "count");

    const noteSpan = document.createElement("span");
    noteSpan.className = "summary-note";
    noteSpan.textContent = note || "";

    card.append(meta, valueSpan, noteSpan);
    return card;
  }

  function buildLatestPeriodCard({ periodLabel, metricLabel, value, note }) {
    const card = document.createElement("article");
    card.className = "summary-card summary-card--period";

    const meta = document.createElement("div");
    meta.className = "summary-card__meta";

    const iconSpan = document.createElement("span");
    iconSpan.className = "summary-icon";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.innerHTML = ICONS.calendar;

    const labelSpan = document.createElement("span");
    labelSpan.className = "summary-label";
    labelSpan.textContent = "Latest period";

    meta.append(iconSpan, labelSpan);

    const valueWrap = document.createElement("span");
    valueWrap.className = "summary-value summary-value--latest";

    const period = document.createElement("span");
    period.className = "summary-latest-period-label";
    period.textContent = periodLabel || "-";

    const metric = document.createElement("span");
    metric.className = "summary-latest-metric";
    metric.textContent = metricLabel ? ` (${metricLabel})` : "";

    valueWrap.append(period, metric);

    const noteSpan = document.createElement("span");
    noteSpan.className = "summary-note";
    noteSpan.textContent = note || "Ready after parsing.";

    card.append(meta, valueWrap, noteSpan);
    return card;
  }

  function buildLatestPeriod(latestDate, metricKey) {
    const catalog = state.dataset?.metricCatalog || [];
    const metricLabel = catalog.find((m) => m.key === metricKey)?.label || "";

    if (!latestDate || !metricKey) {
      return { periodLabel: "-", metricLabel: "", value: 0, note: "Select a metric to compute the latest period." };
    }

    const aggregation = state.filters.aggregation;
    const bucket =
      aggregation === "monthly"
        ? latestDate.slice(0, 7)
        : aggregation === "weekly"
        ? toWeekBucket(latestDate)
        : latestDate;

    const { labels, values } = buildTrendSeries(metricKey, aggregation);
    const idx = labels.lastIndexOf(bucket);
    const value = idx >= 0 ? Number(values[idx] || 0) : 0;

    return {
      periodLabel: bucket,
      metricLabel,
      value,
      note: `Latest ${aggregation} bucket value: ${formatValue(value, "count")}.`
    };
  }

  function renderTrendChart() {
    destroyChart();
    if (dom.seriesToggleGroup) dom.seriesToggleGroup.innerHTML = "";

    const aggregation = state.filters.aggregation;
    const { labels, datasets } = buildTrendDatasets(aggregation);
    renderTrendHeader();

    if (!labels.length || datasets.length === 0) {
      if (dom.trendEmpty) dom.trendEmpty.hidden = false;
      if (dom.seriesToggleGroup) dom.seriesToggleGroup.hidden = true;
      return;
    }

    if (dom.trendEmpty) dom.trendEmpty.hidden = true;
    if (dom.seriesToggleGroup) dom.seriesToggleGroup.hidden = datasets.length <= 1;

    state.chart = new Chart(dom.trendCanvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length <= 1 }
        },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true }
        }
      }
    });

    if (datasets.length > 1) {
      renderSeriesToggles();
    }
  }

  function renderTrendHeader() {
    if (!state.dataset) return;
    const meta = state.dataset?.meta || {};
    const range = getRenderedDateRange();
    const metricLabel = state.dataset.metricCatalog?.find((m) => m.key === state.filters.metricKey)?.label || "";

    const windowLabel = range.start && range.end ? `${range.start} → ${range.end}` : meta.minDate && meta.maxDate ? `${meta.minDate} → ${meta.maxDate}` : "-";
    if (dom.trendWindow) dom.trendWindow.textContent = windowLabel;

    const caption =
      state.trendMode === "metric"
        ? metricLabel
          ? `Trend for: ${metricLabel}`
          : "Select a metric to see trend."
        : state.trendMode === "workloadActions"
        ? "Apps trend: Copilot actions taken in apps"
        : state.trendMode === "workloadActiveDays"
        ? "Apps trend: Days of active Copilot usage in apps"
        : "Trend";
    if (dom.trendCaption) dom.trendCaption.textContent = caption;
  }

  function renderWorkloadBreakdown() {
    destroyWorkloadChart();
    if (!state.dataset) return;
    if (!dom.workloadBody || !dom.workloadCanvas) return;

    const { rows, title } = buildWorkloadRows(state.workloadMode);
    dom.workloadBody.innerHTML = "";

    if (!rows.length) {
      if (dom.workloadEmpty) dom.workloadEmpty.hidden = false;
      return;
    }

    if (dom.workloadEmpty) dom.workloadEmpty.hidden = true;

    const labels = rows.map((r) => r.workload);
    const values = rows.map((r) => r.value);

    for (const row of rows) {
      const tr = document.createElement("tr");
      const tdWorkload = document.createElement("td");
      const tdValue = document.createElement("td");
      tdValue.className = "is-numeric";
      tdWorkload.textContent = row.workload;
      tdValue.textContent = formatValue(row.value, "count");
      tr.append(tdWorkload, tdValue);
      dom.workloadBody.appendChild(tr);
    }

    state.workloadChart = new Chart(dom.workloadCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: values,
            backgroundColor: isDarkTheme() ? "rgba(79,158,211,0.55)" : "rgba(9,114,136,0.55)",
            borderColor: isDarkTheme() ? "#4f9ed3" : "#097288",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 30 } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function buildWorkloadRows(mode) {
    const totals = state.dataset?.totalsByMetric || {};
    const catalog = state.dataset?.metricCatalog || [];
    const keys = new Set(catalog.map((m) => m.key));

    const workloads = [
      { name: "Teams", slug: "teams" },
      { name: "Word", slug: "word" },
      { name: "Excel", slug: "excel" },
      { name: "Outlook", slug: "outlook" },
      { name: "PowerPoint", slug: "powerpoint" },
      { name: "OneNote", slug: "onenote" },
      { name: "Loop", slug: "loop" }
    ];

    const patternFor = (workloadSlug) => {
      if (mode === "actions") return `copilot actions taken in ${workloadSlug}`;
      if (mode === "activeDays") return `days of active copilot usage in ${workloadSlug}`;
      if (mode === "enabledDays") return `copilot enabled days for ${workloadSlug}`;
      return "";
    };

    const rows = [];
    let sum = 0;
    for (const w of workloads) {
      const key = normalizeHeader(patternFor(w.slug));
      if (!keys.has(key)) continue;
      const value = Number(totals[key] || 0);
      if (!value) continue;
      sum += value;
      rows.push({ workload: w.name, value });
    }

    const title =
      mode === "actions"
        ? "Actions"
        : mode === "activeDays"
        ? "Active days"
        : mode === "enabledDays"
        ? "Enabled days"
        : "Value";

    if (mode === "actions") {
      const totalKey = pickMetricKey(["total copilot actions taken", "total copilot actions"]);
      if (totalKey) {
        const total = Number(totals[totalKey] || 0);
        const other = Math.max(total - sum, 0);
        if (other) rows.push({ workload: "Other", value: other });
      }
    }

    rows.sort((a, b) => b.value - a.value);
    return { rows: rows.slice(0, 10), title };
  }

  function destroyChart() {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
  }

  function destroyBreakdownChart() {
    if (state.breakdownChart) {
      state.breakdownChart.destroy();
      state.breakdownChart = null;
    }
  }

  function destroyDimensionTrendChart() {
    if (state.dimensionTrendChart) {
      state.dimensionTrendChart.destroy();
      state.dimensionTrendChart = null;
    }
  }

  function destroyWorkloadChart() {
    if (state.workloadChart) {
      state.workloadChart.destroy();
      state.workloadChart = null;
    }
  }

  function renderChartsAfterThemeChange() {
    if (!state.dataset) return;
    renderTrendChart();
    renderBreakdownChart();
    renderDimensionTrendChart();
    renderWorkloadBreakdown();
  }

  function buildTrendSeries(metricKey, aggregation) {
    const daily = state.dataset?.dailyTotalsByMetric || {};
    const range = getRenderedDateRange();

    const dailyDates = Object.keys(daily)
      .filter((d) => isDateWithinRange(d, range))
      .sort();

    if (aggregation === "daily") {
      return {
        labels: dailyDates,
        values: dailyDates.map((d) => Number(daily[d]?.[metricKey] || 0))
      };
    }

    const grouped = Object.create(null);
    for (const dateKey of dailyDates) {
      const bucket = aggregation === "monthly" ? dateKey.slice(0, 7) : toWeekBucket(dateKey);
      grouped[bucket] = (grouped[bucket] || 0) + Number(daily[dateKey]?.[metricKey] || 0);
    }

    const labels = Object.keys(grouped).sort();
    return { labels, values: labels.map((k) => grouped[k]) };
  }

  function buildTrendDatasets(aggregation) {
    if (!state.dataset) return { labels: [], datasets: [] };

    if (state.trendMode === "metric") {
      const metricKey = state.filters.metricKey;
      if (!metricKey) return { labels: [], datasets: [] };

      const metricLabel = state.dataset.metricCatalog.find((m) => m.key === metricKey)?.label || metricKey;
      const { labels, values } = buildTrendSeries(metricKey, aggregation);
      const dataset = {
        label: metricLabel,
        data: values,
        borderColor: isDarkTheme() ? "#24b37f" : "#008a00",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 1,
        tension: 0.15
      };
      return { labels, datasets: labels.length ? [dataset] : [] };
    }

    const workloadMode = state.trendMode === "workloadActions" ? "actions" : "activeDays";
    const workloadSeries = getWorkloadMetricSeries(workloadMode);
    if (!workloadSeries.length) return { labels: [], datasets: [] };

    const palette = getPalette();
    let labels = [];
    const datasets = [];

    for (let i = 0; i < workloadSeries.length; i++) {
      const series = workloadSeries[i];
      const trend = buildTrendSeries(series.metricKey, aggregation);
      if (!labels.length) labels = trend.labels;
      const dataset = {
        label: series.label,
        data: trend.values,
        borderColor: palette[i % palette.length],
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
        hidden: state.hiddenSeries.has(series.label)
      };
      datasets.push(dataset);
    }

    return { labels, datasets };
  }

  function getWorkloadMetricSeries(mode) {
    const totals = state.dataset?.totalsByMetric || {};
    const catalog = state.dataset?.metricCatalog || [];
    const keys = new Set(catalog.map((m) => m.key));

    const workloads = [
      { name: "Teams", slug: "teams" },
      { name: "Word", slug: "word" },
      { name: "Excel", slug: "excel" },
      { name: "Outlook", slug: "outlook" },
      { name: "PowerPoint", slug: "powerpoint" },
      { name: "OneNote", slug: "onenote" },
      { name: "Loop", slug: "loop" }
    ];

    const patternFor = (workloadSlug) => {
      if (mode === "actions") return `copilot actions taken in ${workloadSlug}`;
      if (mode === "activeDays") return `days of active copilot usage in ${workloadSlug}`;
      return "";
    };

    const rows = [];
    for (const w of workloads) {
      const key = normalizeHeader(patternFor(w.slug));
      if (!keys.has(key)) continue;
      const total = Number(totals[key] || 0);
      if (!total) continue;
      rows.push({ label: w.name, metricKey: key, total });
    }

    rows.sort((a, b) => b.total - a.total);
    return rows.slice(0, 6);
  }

  function renderSeriesToggles() {
    if (!dom.seriesToggleGroup || !state.chart) return;
    dom.seriesToggleGroup.innerHTML = "";

    state.chart.data.datasets.forEach((dataset, idx) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "series-toggle";
      const active = !dataset.hidden;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.textContent = dataset.label;
      button.addEventListener("click", () => {
        dataset.hidden = !dataset.hidden;
        if (dataset.hidden) state.hiddenSeries.add(dataset.label);
        else state.hiddenSeries.delete(dataset.label);
        button.classList.toggle("is-active", !dataset.hidden);
        button.setAttribute("aria-pressed", dataset.hidden ? "false" : "true");
        state.chart.update();
      });
      dom.seriesToggleGroup.appendChild(button);
    });
  }

  function renderDimensionTrendChart() {
    destroyDimensionTrendChart();

    const metricKey = state.filters.metricKey;
    const dimension = state.filters.dimension;
    const dimensionDaily = state.dataset?.dimensionDailyTotalsByMetric?.[dimension]?.[metricKey];
    const coreMetricKeys = state.dataset?.coreMetricKeys || [];

    const canRender = metricKey && coreMetricKeys.includes(metricKey) && dimensionDaily;
    dom.dimensionTrendCard.hidden = !canRender;
    if (!canRender) return;

    const range = getRenderedDateRange();
    const dates = Object.keys(dimensionDaily)
      .filter((d) => isDateWithinRange(d, range))
      .sort();

    const totalsByDimension = Object.create(null);
    for (const dateKey of dates) {
      const bucket = dimensionDaily[dateKey] || {};
      for (const dimValue of Object.keys(bucket)) {
        totalsByDimension[dimValue] = (totalsByDimension[dimValue] || 0) + Number(bucket[dimValue] || 0);
      }
    }

    const topDims = Object.keys(totalsByDimension)
      .sort((a, b) => totalsByDimension[b] - totalsByDimension[a])
      .slice(0, 5);

    const palette = getPalette();
    const datasets = topDims.map((dimValue, idx) => ({
      label: dimValue,
      data: dates.map((d) => Number(dimensionDaily[d]?.[dimValue] || 0)),
      borderColor: palette[idx % palette.length],
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.15
    }));

    state.dimensionTrendChart = new Chart(dom.dimensionTrendCanvas.getContext("2d"), {
      type: "line",
      data: { labels: dates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function renderTopTable() {
    clearTopTable();

    const metricKey = state.filters.metricKey;
    const dimension = state.filters.dimension;
    if (!metricKey || !dimension) return;

    dom.topHeader.textContent = dimension === "functionType" ? "FunctionType" : "Organization";

    const dimTotals = state.dataset?.dimensionTotalsByMetric?.[dimension] || {};
    const rows = Object.keys(dimTotals)
      .map((name) => ({
        name,
        value: Number(dimTotals[name]?.[metricKey] || 0)
      }))
      .filter((row) => row.value !== 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 25);

    if (dom.topEmpty) dom.topEmpty.hidden = rows.length > 0;

    for (const row of rows) {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      const tdValue = document.createElement("td");
      tdValue.className = "is-numeric";
      tdName.textContent = row.name;
      tdValue.textContent = formatValue(row.value, "count");
      tr.append(tdName, tdValue);
      dom.topBody.appendChild(tr);
    }
  }

  function renderBreakdownChart() {
    destroyBreakdownChart();

    const metricKey = state.filters.metricKey;
    const dimension = state.filters.dimension;
    if (!metricKey || !dimension) return;

    const dimTotals = state.dataset?.dimensionTotalsByMetric?.[dimension] || {};
    const rows = Object.keys(dimTotals)
      .map((name) => ({
        name,
        value: Number(dimTotals[name]?.[metricKey] || 0)
      }))
      .filter((row) => row.value !== 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    if (!rows.length) return;

    const labels = rows.map((r) => r.name);
    const values = rows.map((r) => r.value);

    state.breakdownChart = new Chart(dom.breakdownCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Top",
            data: values,
            backgroundColor: isDarkTheme() ? "rgba(36,179,127,0.55)" : "rgba(0,138,0,0.55)",
            borderColor: isDarkTheme() ? "#24b37f" : "#008a00",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function renderMetricsTable() {
    if (!state.dataset) return;
    if (!dom.metricsBody) return;

    const search = (dom.metricSearch?.value || "").trim().toLowerCase();

    const totals = state.dataset?.totalsByMetric || {};
    const catalog = state.dataset?.metricCatalog || [];

    const rows = catalog
      .map((m) => ({
        group: m.group || "Other",
        label: m.label || m.key,
        key: m.key,
        total: Number(totals[m.key] || 0)
      }))
      .filter((row) => row.total !== 0)
      .filter((row) => {
        if (!search) return true;
        return row.label.toLowerCase().includes(search) || row.group.toLowerCase().includes(search);
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 100);

    dom.metricsBody.innerHTML = "";
    for (const row of rows) {
      const tr = document.createElement("tr");
      const tdGroup = document.createElement("td");
      const tdLabel = document.createElement("td");
      const tdTotal = document.createElement("td");
      tdTotal.className = "is-numeric";
      tdGroup.textContent = row.group;
      tdLabel.textContent = row.label;
      tdTotal.textContent = formatValue(row.total, "count");
      tr.append(tdGroup, tdLabel, tdTotal);
      dom.metricsBody.appendChild(tr);
    }
  }

  function clearTopTable() {
    dom.topBody.innerHTML = "";
    dom.topHeader.textContent = "";
  }

  function getRenderedDateRange() {
    const meta = state.dataset?.meta;
    const applied = state.dataset?.appliedFilter || null;
    const useInputs = Boolean(applied && (applied.dateRange || applied.dimensionFilter));
    const start = useInputs ? state.filters.startDate || meta?.minDate || "" : meta?.minDate || "";
    const end = useInputs ? state.filters.endDate || meta?.maxDate || "" : meta?.maxDate || "";
    return { start, end };
  }

  function isDateWithinRange(dateKey, range) {
    if (range.start && dateKey < range.start) return false;
    if (range.end && dateKey > range.end) return false;
    return true;
  }

  function toWeekBucket(dateKey) {
    const [y, m, d] = dateKey.split("-").map((v) => Number(v));
    const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const day = (date.getUTCDay() + 6) % 7; // Monday=0
    date.setUTCDate(date.getUTCDate() - day);
    return date.toISOString().slice(0, 10);
  }

  function setStatus(message) {
    dom.uploadStatus.textContent = message;
  }

  function setExportEnabled(enabled) {
    const controls = [
      dom.exportSummary,
      dom.exportTrigger,
      dom.exportTrendPng,
      dom.exportWorkloadPng,
      dom.exportDimTrendPng,
      dom.exportBreakdownPng,
      dom.exportSummaryMenu,
      dom.exportTrendCsvMenu,
      dom.exportTrendMenu,
      dom.exportWorkloadCsvMenu,
      dom.exportWorkloadMenu,
      dom.exportDimTrendMenu,
      dom.exportBreakdownMenu
    ].filter(Boolean);

    for (const control of controls) {
      control.disabled = !enabled;
      control.classList.toggle("is-disabled", !enabled);
    }

    if (!enabled) closeExportMenu();
  }

  function showProgress(visible) {
    dom.uploadProgress.hidden = !visible;
    if (!visible) dom.uploadProgressBar.value = 0;
  }

  function toast(message, level) {
    if (!dom.toastContainer) return;
    const el = document.createElement("div");
    el.className = "toast";
    if (level) el.classList.add("toast--" + level);
    el.setAttribute("role", level === "error" ? "alert" : "status");
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 4500);
  }

  function formatValue(value, format) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0";
    if (format === "count") return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US");
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let idx = 0;
    let value = n;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ");
  }

  function getPalette() {
    if (isDarkTheme()) {
      return ["#24b37f", "#4f9ed3", "#8892e3", "#d8c38c", "#ef4444", "#a855f7"];
    }
    return ["#008a00", "#097288", "#5146D6", "#F6BD18", "#EF4444", "#A855F7"];
  }

  function debounce(fn, delay) {
    let timeout = null;
    return function (...args) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function nextControlId(prefix) {
    controlIdCounter += 1;
    return `${prefix}-${controlIdCounter}`;
  }

  function renderActiveFiltersSummary() {
    if (!dom.activeFiltersSummary || !dom.activeFiltersList) return;

    const chips = buildActiveFilterChips();
    dom.activeFiltersList.innerHTML = "";
    for (const chip of chips) dom.activeFiltersList.appendChild(chip);

    dom.activeFiltersSummary.hidden = chips.length === 0;
  }

  function buildActiveFilterChips() {
    if (!state.dataset) return [];

    const chips = [];
    const meta = state.baseDataset?.meta || state.dataset?.meta;

    const isPending = isFilterPending();
    if (isPending) {
      chips.push(buildChip("Status", "Pending (click Apply)", null));
    }

    if (state.filters.timeframePreset !== "all") {
      const value =
        state.filters.timeframePreset === "custom"
          ? `${state.filters.startDate || meta?.minDate || ""} → ${state.filters.endDate || meta?.maxDate || ""}`
          : `Last ${state.filters.timeframePreset} days`;
      chips.push(
        buildChip("Timeframe", value, async () => {
          state.filters.timeframePreset = "all";
          state.filters.startDate = meta?.minDate || "";
          state.filters.endDate = meta?.maxDate || "";
          buildFilters();
          await applyOrResetFilters();
        })
      );
    }

    if (state.filters.dimension !== DEFAULT_DIMENSION) {
      chips.push(
        buildChip("Dimension", state.filters.dimension === "functionType" ? "FunctionType" : "Organization", async () => {
          state.filters.dimension = DEFAULT_DIMENSION;
          state.filters.dimensionValues = new Set();
          buildFilters();
          await applyOrResetFilters();
        })
      );
    }

    if (state.filters.dimensionValues && state.filters.dimensionValues.size > 0) {
      const label = state.filters.dimension === "functionType" ? "FunctionType" : "Organization";
      chips.push(
        buildChip(label, `${state.filters.dimensionValues.size} selected`, async () => {
          state.filters.dimensionValues = new Set();
          buildFilters();
          await applyOrResetFilters();
        })
      );
    }

    return chips;
  }

  function buildChip(labelText, valueText, onRemove) {
    const chip = document.createElement("div");
    chip.className = "active-filter-chip";

    const label = document.createElement("span");
    label.className = "active-filter-chip__label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "active-filter-chip__value";
    value.textContent = valueText;

    chip.append(label, value);

    if (typeof onRemove === "function") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "active-filter-chip__remove";
      remove.setAttribute("aria-label", `Remove ${labelText} filter`);
      remove.textContent = "×";
      remove.addEventListener("click", () => onRemove());
      chip.appendChild(remove);
    }

    return chip;
  }

  function getFilterSummaryParts() {
    const parts = [];
    if (!state.dataset) return ["No data loaded"];

    const meta = state.baseDataset?.meta || state.dataset?.meta;
    const metricLabel = state.dataset.metricCatalog?.find((m) => m.key === state.filters.metricKey)?.label || "Metric";

    const timeframe =
      state.filters.timeframePreset === "custom"
        ? `${state.filters.startDate || meta?.minDate || ""} → ${state.filters.endDate || meta?.maxDate || ""}`
        : state.filters.timeframePreset === "all"
        ? "All time"
        : `Last ${state.filters.timeframePreset} days`;

    const dimensionLabel = state.filters.dimension === "functionType" ? "FunctionType" : "Organization";
    const dimSelected = state.filters.dimensionValues?.size ? ` (${state.filters.dimensionValues.size} selected)` : "";

    parts.push(`Timeframe: ${timeframe}`);
    parts.push(`Dimension: ${dimensionLabel}${dimSelected}`);
    parts.push(`Metric: ${metricLabel}`);
    parts.push(`Aggregation: ${state.filters.aggregation}`);
    if (isFilterPending()) parts.push("Pending");

    return parts;
  }

  function resetAllFilters() {
    if (!state.baseDataset) return;
    const meta = state.baseDataset.meta || {};
    state.filters.dimensionValues = new Set();
    state.filters.timeframePreset = "all";
    state.filters.startDate = meta.minDate || "";
    state.filters.endDate = meta.maxDate || "";
    state.dataset = state.baseDataset;
    buildFilters();
    setDefaultMetricIfMissing();
    renderSchemaSummary();
    renderDatasetCard();
    renderAll();
  }

  async function applyOrResetFilters() {
    if (!state.baseDataset) return;
    const meta = state.baseDataset.meta || {};
    const isNoFilter =
      (!state.filters.dimensionValues || state.filters.dimensionValues.size === 0) &&
      state.filters.timeframePreset === "all" &&
      (state.filters.startDate || "") === (meta.minDate || "") &&
      (state.filters.endDate || "") === (meta.maxDate || "");

    if (isNoFilter) {
      state.dataset = state.baseDataset;
      renderSchemaSummary();
      renderDatasetCard();
      renderAll();
      return;
    }

    await runFilteredAggregation();
  }

  function isFilterPending() {
    if (!state.baseDataset) return false;
    const current = normalizeFilterForCompare(buildCurrentFilterPayload());
    const applied = normalizeFilterForCompare(buildAppliedFilterPayload());
    return JSON.stringify(current) !== JSON.stringify(applied);
  }

  function buildCurrentFilterPayload() {
    const meta = state.baseDataset?.meta || {};
    const startDate = state.filters.startDate || meta.minDate || "";
    const endDate = state.filters.endDate || meta.maxDate || "";
    const allowedValues = Array.from(state.filters.dimensionValues || []);
    return {
      startDate,
      endDate,
      dimension: state.filters.dimension,
      allowedValues
    };
  }

  function buildAppliedFilterPayload() {
    const meta = state.baseDataset?.meta || {};
    const applied = state.dataset?.appliedFilter || null;
    const dateRange = applied?.dateRange || null;
    const dimensionFilter = applied?.dimensionFilter || null;
    const allowedValues = dimensionFilter?.allowed ? Array.from(dimensionFilter.allowed) : [];
    return {
      startDate: dateRange?.start || meta.minDate || "",
      endDate: dateRange?.end || meta.maxDate || "",
      dimension: dimensionFilter?.dimension || state.filters.dimension,
      allowedValues
    };
  }

  function normalizeFilterForCompare(filter) {
    const start = String(filter?.startDate || "");
    const end = String(filter?.endDate || "");
    const dimension = filter?.allowedValues && filter.allowedValues.length ? String(filter.dimension || "") : "";
    const allowedValues = Array.isArray(filter?.allowedValues) ? filter.allowedValues.map(String).sort() : [];
    return { start, end, dimension, allowedValues };
  }

  function downloadCanvasPng(canvas, filename) {
    if (!canvas) {
      toast("Nothing to export.", "error");
      return;
    }
    if (!state.dataset) {
      toast("Load a dataset first.", "error");
      return;
    }
    if (typeof canvas.toBlob !== "function") {
      const url = canvas.toDataURL("image/png");
      downloadUrl(url, filename);
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast("Export failed.", "error");
          return;
        }
        const url = URL.createObjectURL(blob);
        downloadUrl(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      "image/png",
      0.92
    );
  }

  function downloadUrl(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, String(value ?? ""));
    } catch {}
  }

  function exportSummaryCsv() {
    if (!state.dataset) return;

    const metricKey = state.filters.metricKey;
    const metricLabel = state.dataset.metricCatalog.find((m) => m.key === metricKey)?.label || metricKey || "";
    const aggregation = state.filters.aggregation;
    const dimension = state.filters.dimension;

    const { labels, values } = buildTrendSeries(metricKey, aggregation);
    const dimTotals = state.dataset?.dimensionTotalsByMetric?.[dimension] || {};
    const top = Object.keys(dimTotals)
      .map((name) => ({ name, value: Number(dimTotals[name]?.[metricKey] || 0) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50);

    const rows = [];
    for (let i = 0; i < labels.length; i++) {
      rows.push([
        "trend",
        labels[i],
        aggregation,
        metricLabel,
        metricKey || "",
        values[i]
      ]);
    }
    for (const item of top) {
      rows.push([
        "top",
        item.name,
        dimension,
        metricLabel,
        metricKey || "",
        item.value
      ]);
    }

    downloadCsv("copilot-dashboard-v2-summary.csv", ["Type", "Bucket", "Series", "Metric", "MetricKey", "Value"], rows);
    toast("Summary CSV downloaded.", "info");
  }

  function exportTrendCsv() {
    if (!state.dataset) return;

    const aggregation = state.filters.aggregation;
    const { labels, datasets } = buildTrendDatasets(aggregation);
    if (!labels.length || !datasets.length) {
      toast("No trend data to export.", "error");
      return;
    }

    const headers = ["Bucket", "Series", "Value"];
    const rows = [];

    for (let i = 0; i < labels.length; i++) {
      for (const ds of datasets) {
        const v = Array.isArray(ds.data) ? ds.data[i] : 0;
        rows.push([labels[i], ds.label, v ?? 0]);
      }
    }

    downloadCsv("copilot-dashboard-v2-trend.csv", headers, rows);
    toast("Trend CSV downloaded.", "info");
  }

  function exportWorkloadCsv() {
    if (!state.dataset) return;
    const { rows } = buildWorkloadRows(state.workloadMode);
    if (!rows.length) {
      toast("No workload data to export.", "error");
      return;
    }

    downloadCsv(
      "copilot-dashboard-v2-workload.csv",
      ["Workload", "Mode", "Value"],
      rows.map((r) => [r.workload, state.workloadMode, r.value])
    );
    toast("Workload CSV downloaded.", "info");
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [];
    lines.push(headers.map(escapeCsvCell).join(","));
    for (const row of rows) {
      lines.push(row.map(escapeCsvCell).join(","));
    }
    const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function escapeCsvCell(value) {
    if (value === null || typeof value === "undefined") return "";
    const raw = String(value);
    const safe = sanitizeForExcel(raw);
    if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, "\"\"")}"`;
    return safe;
  }

  function sanitizeForExcel(value) {
    const s = String(value ?? "");
    const trimmed = s.trimStart();
    if (/^[=+\-@]/.test(trimmed)) return "'" + s;
    return s;
  }
})();
