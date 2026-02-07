(function () {
  // ══════════════════════════════════════════════════════════════════════════════
  // DEBUG MODE - Set to true during development to enable console logging
  // ══════════════════════════════════════════════════════════════════════════════
  const DEBUG = false;

  // Logging utilities - only output when DEBUG is enabled
  function logWarn(message, error) {
    if (DEBUG) console.warn(message, error);
  }
  function logError(message, error) {
    if (DEBUG) console.error(message, error);
  }
  // ══════════════════════════════════════════════════════════════════════════════

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDashboard);
  } else {
    initializeDashboard();
  }

  function initializeDashboard() {
    const ASSET_VERSION = "20260207a";

          function withAssetVersion(path) {
            if (!ASSET_VERSION || typeof path !== "string" || !path.length) {
              return path;
            }
            // Avoid double-appending when callers include their own cache busting.
            if (/[?&]v=/.test(path)) {
              return path;
            }
            const separator = path.includes("?") ? "&" : "?";
            return `${path}${separator}v=${encodeURIComponent(ASSET_VERSION)}`;
          }

          const HIGH_RES_PIXEL_RATIO = Math.max(window.devicePixelRatio || 1, 2.5);
          Chart.defaults.devicePixelRatio = HIGH_RES_PIXEL_RATIO;

          const GIF_WORKER_SOURCE_URL = withAssetVersion("assets/vendor/gif.worker.js");
          const GIFJS_SCRIPT_URL = withAssetVersion("assets/vendor/gif.js");
          const XLSX_SCRIPT_URL = withAssetVersion("assets/vendor/xlsx.full.min.js");
          const HTML2CANVAS_SCRIPT_URL = withAssetVersion("assets/vendor/html2canvas.min.js");
          const JSPDF_SCRIPT_URL = withAssetVersion("assets/vendor/jspdf.umd.min.js");
          const GIFJS_SCRIPT_INTEGRITY = "";
          let gifWorkerUrlPromise = null;
          let gifLibraryPromise = null;
          const scriptLoadPromises = new Map();

          function resolveAssetUrl(path) {
            try {
              return new URL(path, document.baseURI).href;
            } catch (error) {
              return String(path || "");
            }
          }

          function loadScriptOnce({ src, name, isReady }) {
            try {
              if (typeof isReady === "function" && isReady()) {
                return Promise.resolve(true);
              }
            } catch (error) {
              // ignore readiness errors; we'll attempt loading below
            }

            const absoluteSrc = resolveAssetUrl(src);
            const existingPromise = scriptLoadPromises.get(absoluteSrc);
            if (existingPromise) {
              return existingPromise;
            }

            const promise = new Promise((resolve, reject) => {
              const existing = Array.from(document.scripts || []).find(script => {
                try {
                  return script && script.src === absoluteSrc;
                } catch (error) {
                  return false;
                }
              });

              const finalize = () => {
                try {
                  resolve(typeof isReady === "function" ? Boolean(isReady()) : true);
                } catch (error) {
                  resolve(true);
                }
              };

              if (existing) {
                // Script tag exists but might still be loading.
                existing.addEventListener("load", finalize, { once: true });
                existing.addEventListener("error", () => reject(new Error(`${name || "Script"} failed to load.`)), { once: true });
                // If it already loaded, resolve on next tick.
                queueMicrotask(finalize);
                return;
              }

              const script = document.createElement("script");
              script.src = absoluteSrc;
              script.async = true;
              script.crossOrigin = "anonymous";
              script.addEventListener("load", finalize, { once: true });
              script.addEventListener("error", () => reject(new Error(`${name || "Script"} failed to load.`)), { once: true });
              document.head.appendChild(script);
            }).catch(error => {
              // Allow retries after a failure.
              scriptLoadPromises.delete(absoluteSrc);
              throw error;
            });

            scriptLoadPromises.set(absoluteSrc, promise);
            return promise;
          }

          function ensureXlsxLoaded() {
            return loadScriptOnce({
              src: XLSX_SCRIPT_URL,
              name: "Excel export library",
              isReady: () => typeof XLSX !== "undefined" && XLSX.utils && (XLSX.writeFile || XLSX.write)
            });
          }

          function ensurePdfExportLibrariesLoaded() {
            return Promise.all([
              loadScriptOnce({
                src: JSPDF_SCRIPT_URL,
                name: "PDF export library",
                isReady: () => Boolean(window.jspdf && window.jspdf.jsPDF)
              }),
              loadScriptOnce({
                src: HTML2CANVAS_SCRIPT_URL,
                name: "Screenshot export library",
                isReady: () => typeof html2canvas === "function"
              })
            ]).then(results => results.every(Boolean));
          }
          let activeParseController = null;
          let bufferedSampleCsv = null;
          let bufferedCsvText = null;
          let filterPreferencesApplied = false;
          
          // Debounce utility for filter updates
          function debounce(fn, delay) {
            let timeoutId = null;
            return function(...args) {
              if (timeoutId) clearTimeout(timeoutId);
              timeoutId = setTimeout(() => fn.apply(this, args), delay);
            };
          }
          
          // Debounced render for filter changes
          const debouncedRenderDashboard = debounce(() => {
            renderDashboard();
            persistFilterPreferences();
          }, 150);
      
          const numberFormatter = new Intl.NumberFormat("en-US");
          const hoursFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
          const compactNumberFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
          const dimensionPalette = [
            "#0B8A00",
            "#097288",
            "#5146D6",
            "#F6BD18",
            "#A855F7",
            "#EF4444",
            "#10B981",
            "#3B82F6",
            "#F97316",
            "#7C3AED",
            "#0EA5E9",
            "#6366F1"
          ];
          const MAX_VISIBLE_GROUP_ROWS = 5;
          const MAX_VISIBLE_TOP_USERS = 5;
          const DEFAULT_RETURNING_INTERVAL = "weekly";
          const FILTER_FIELD_LABELS = {
            organization: "Organization",
            country: "Country or region",
            domain: "Domain"
          };
          const ORGANIZATION_FIELD_CHOICES = ["organization", "domain"];
          const COUNTRY_FIELD_CHOICES = ["country", "domain", "organization"];
          const DEFAULT_FILTER_FIELDS = {
            organization: "organization",
            country: "country"
          };
          const SNAPSHOT_VERSION = 1;
          const SNAPSHOT_KDF_ITERATIONS = 150000;
          const SNAPSHOT_PREFIX = "COPILOTSNAPSHOT";
          const SNAPSHOT_FILE_EXTENSION = ".copilot-snapshot";
          const SNAPSHOT_FILE_BASENAME = "copilot-dashboard";
          const SNAPSHOT_UNCOMPRESSED_LIMIT = 8 * 1024 * 1024;
          const supportsSnapshotEncryption = Boolean(
            window.crypto
            && window.crypto.subtle
            && typeof TextEncoder !== "undefined"
            && typeof TextDecoder !== "undefined"
          );
          const supportsDialogElement = typeof HTMLDialogElement !== "undefined";
          const sharePointGlobal =
            typeof globalThis === "object" && globalThis
              ? globalThis
              : typeof window === "object" && window
              ? window
              : typeof self === "object" && self
              ? self
              : null;
          const BULLET_SEPARATOR = " \u00b7 ";
          let pendingSnapshotPayload = null;
          let latestSnapshotExport = "";
          let snapshotDownloadUrl = null;
          let snapshotCopyTimeout = null;
          const AGENT_HUB_ROW_LIMIT = 100;
          let agentHubVisible = false;
      
          const state = {
            rows: [],
            uniquePersons: new Set(),
            latestDate: null,
            earliestDate: null,
            uniqueOrganizations: new Set(),
            uniqueCountries: new Set(),
            uniqueDomains: new Set(),
            filterFields: {
              ...DEFAULT_FILTER_FIELDS
            },
            filters: {
              organization: new Set(),
              country: new Set(),
              timeframe: "all",
              customStart: null,
              customEnd: null,
              customRangeInvalid: false,
              aggregate: "weekly",
              metric: "actions",
              group: "organization",
              categorySelection: null
            },
            persistDatasets: false,
            charts: {
              trend: null,
            usageFrequency: new Map(),
            usageConsistency: new Map(),
            usageTrend: null,
            returningUsers: null,
            enabledLicenses: null,
            dimensionComparison: null
          },
          latestTrendPeriods: [],
          latestUsageMonths: [],
          latestUsageTrendRows: [],
            enabledLicensesColors: getDefaultEnabledLicensesColors(),
            latestEnabledTimeline: [],
            latestGroupData: null,
            latestTopUsers: [],
            latestReturningAggregates: null,
            latestAdoption: null,
            latestActiveDays: null,
            latestDimensionTotals: {
              country: [],
              organization: []
            },
            latestDimensionTimelines: {
              country: [],
              organization: []
            },
            adoptionShowDetails: false,
            exportPreferences: {
              includeDetails: true
            },
            pdfExportPreferences: null,
            trendColorPreference: {
              start: null,
              end: null
            },
            seriesVisibility: {},
            seriesDetailMode: "respect",
            returningMetric: "total",
            returningInterval: DEFAULT_RETURNING_INTERVAL,
            groupsExpanded: false,
            topUsersExpanded: false,
            activeDaysView: "users",
            usageThresholds: {
              middle: 17,
              high: 35
            },
            usageMonthSelection: [],
            usageTrendMode: "number",
            usageTrendRegion: "all",
            returningRegion: "all",
            theme: "light",
            trendView: "total",
            agentUsageRows: [],
            agentUsageMeta: null,
            showEnabledLicenseLabels: true,
            agentDisplayLimit: 5,
            agentSort: { column: "responses", direction: "desc" },
            agentHub: {
              activeTab: "users",
              datasets: {
                users: { rows: [], meta: null },
                agents: { rows: [], meta: null },
                combined: { rows: [], meta: null }
              },
              sort: {
                users: { column: null, direction: "asc" },
                agents: { column: null, direction: "asc" },
                combined: { column: null, direction: "asc" }
              },
              filters: {
                users: "",
                agents: "",
                combined: ""
              },
              expanded: {
                users: false,
                agents: false,
                combined: false
              },
              rowLimit: AGENT_HUB_ROW_LIMIT
            },
            latestPerAppActions: [],
            dimensionSelection: {
              dimension: "country",
              metric: "actions",
              selected: {
                country: new Set(),
                organization: new Set()
              }
            },
            topUsersPanelOpen: false
          };
      
          state.availableRegions = ["all"];
          let lastParsedCsvText = null;
          let lastParsedCsvMeta = null;
          let lastParsedAgentCsvText = null;
          let lastParsedAgentMeta = null;
          let currentCsvFieldLookup = null;
          const MAX_DIMENSION_SERIES = 6;
      
          const csvFieldMap = {
            totalActions: {
              primary: [
                "Total Active Copilot Actions Taken",
                "Total Copilot actions taken"
              ]
            },
            assistedHours: {
              primary: ["Copilot assisted hours"]
            },
            copilotEnabledUser: {
              primary: ["Copilot Enabled User"]
            },
            copilotTeamsEnabledUser: {
              primary: ["Copilot Teams Enabled User"]
            },
            copilotProductivityEnabledUser: {
              primary: ["Copilot Productivity Apps Enabled User"]
            },
            copilotChatEnabledUser: {
              primary: ["Copilot Chat Enabled User"]
            },
            meetingRecap: {
              primary: [
                "Meetings recapped by Copilot",
                "Intelligent recap actions taken",
                "Recap"
              ]
            },
            meetingSummariesTotal: {
              primary: [
                "Meetings summarized by Copilot",
                "Meetings summarized by Copilot in Teams",
                "Total meetings summarized by Copilot",
                "Total meetings summarized by Copilot in Teams"
              ],
              preferMax: true
            },
            meetingSummariesActions: {
              primary: ["Summarize meeting actions taken using Copilot in Teams"]
            },
            meetingHours: {
              primary: [
                "Meeting hours recapped by Copilot",
                "Meeting hours summarized by Copilot",
                "Meeting hours summarized by Copilot in Teams"
              ],
              preferMax: true
            },
            emailDrafts: {
              primary: [
                "Generate email draft actions taken using Copilot",
                "Generate email draft actions taken using Copilot in Outlook"
              ],
              preferMax: true
            },
            emailCoaching: {
              primary: [
                "Email coaching actions taken using Copilot",
                "Email coaching actions taken using Copilot in Outlook"
              ],
              preferMax: true
            },
            emailSummaries: {
              primary: [
                "Summarize email thread actions taken using Copilot",
                "Summarize email thread actions taken using Copilot in Outlook"
              ],
              preferMax: true
            },
            emailTotalWithCopilot: {
              primary: ["Total emails sent using Copilot in Outlook"]
            },
            emailsSent: {
              primary: ["Emails sent"]
            },
            chatCompose: {
              primary: [
                "Compose chat message actions taken using Copilot",
                "Compose chat message actions taken using Copilot in Teams"
              ],
              preferMax: true
            },
            chatSummaries: {
              primary: [
                "Summarize chat actions taken using Copilot",
                "Summarize chat actions taken using Copilot in Teams"
              ],
              preferMax: true
            },
            chatConversations: {
              primary: [
                "Total chat conversations summarized by Copilot",
                "Total chat conversations summarized by Copilot in Teams"
              ],
              preferMax: true
            },
            chatPromptsWork: {
              primary: ["Copilot chat (work) prompts submitted"],
              fallbackSum: [
                "Copilot Chat (work) prompts submitted in Teams",
                "Copilot Chat (work) prompts submitted in Outlook"
              ]
            },
            chatPromptsWorkTeams: {
              primary: ["Copilot Chat (work) prompts submitted in Teams"]
            },
            chatPromptsWorkOutlook: {
              primary: ["Copilot Chat (work) prompts submitted in Outlook"]
            },
            chatPromptsWeb: {
              primary: ["Copilot Chat (web) prompts submitted"],
              fallbackSum: [
                "Copilot Chat (Web) prompts submitted in Teams",
                "Copilot Chat (Web) prompts submitted in Outlook"
              ]
            },
            chatPromptsWebTeams: {
              primary: ["Copilot Chat (Web) prompts submitted in Teams"]
            },
            chatPromptsWebOutlook: {
              primary: ["Copilot Chat (Web) prompts submitted in Outlook"]
            },
            chatPromptsTeams: {
              primary: ["Copilot Chat (work) prompts submitted in Teams"]
            },
            documentSummaries: {
              primary: [
                "Summarize Word document actions taken using Copilot",
                "Summarize Word document actions taken using Copilot in Word"
              ],
              preferMax: true
            },
            presentationCreated: {
              primary: [
                "Create presentation actions taken using Copilot",
                "Create presentation actions taken using Copilot in PowerPoint"
              ],
              preferMax: true
            },
            excelAnalysis: {
              primary: [
                "Excel analysis actions taken using Copilot",
                "Excel analysis actions taken using Copilot in Excel"
              ],
              preferMax: true
            },
            wordActions: {
              primary: ["Copilot actions taken in Word"]
            },
            teamsActions: {
              primary: ["Copilot actions taken in Teams"]
            },
            powerpointActions: {
              primary: ["Copilot actions taken in Powerpoint"]
            },
            excelActions: {
              primary: ["Copilot actions taken in Excel"]
            },
            outlookActions: {
              primary: ["Copilot actions taken in Outlook"]
            },
            chatWorkActions: {
              primary: ["Copilot actions taken in Copilot chat (work)"]
            },
            visualizeTableWord: {
              primary: ["Visualize as table actions taken using Copilot in Word"]
            },
            wordChatPrompts: {
              primary: ["Chat (Copilot in Word) prompts submitted"]
            },
            addContentPresentation: {
              primary: ["Add content to presentation actions taken"]
            },
            organizePresentation: {
              primary: ["Organize presentation actions taken"]
            },
            powerpointChatPrompts: {
              primary: ["Chat (Copilot in PowerPoint) prompts submitted"]
            },
            excelChatPrompts: {
              primary: ["Chat (Copilot in Excel) prompts submitted"]
            },
            summarizePresentation: {
              primary: ["Summarize presentation actions taken using Copilot in PowerPoint"]
            },
            rewriteTextWord: {
              primary: ["Rewrite text actions taken using Copilot in Word"]
            },
            draftWord: {
              primary: ["Draft Word document actions taken using Copilot"]
            },
            excelFormula: {
              primary: ["Create Excel formula actions taken using Copilot"]
            },
            excelFormatting: {
              primary: ["Excel formatting actions taken using Copilot"]
            },
            daysActiveWord: {
              primary: ["Days of active Copilot usage in Word"]
            },
            daysActiveTeams: {
              primary: ["Days of active Copilot usage in Teams"]
            },
            daysActivePowerPoint: {
              primary: ["Days of active Copilot usage in Powerpoint"]
            },
            daysActiveOutlook: {
              primary: ["Days of active Copilot usage in Outlook"]
            },
            daysActiveOneNote: {
              primary: ["Days of active Copilot usage in OneNote"]
            },
            daysActiveLoop: {
              primary: ["Days of active Copilot usage in Loop"]
            },
            daysActiveExcel: {
              primary: ["Days of active Copilot usage in Excel"]
            },
            daysActiveChatWork: {
              primary: ["Days of active Copilot chat (work) usage"]
            },
            daysActiveChatWeb: {
              primary: ["Days of active Copilot Chat (web) usage"]
            },
            totalActiveDays: {
              primary: ["Total Copilot active days"]
            },
            totalEnabledDays: {
              primary: ["Total Copilot enabled days"]
            },
            enabledDaysTeams: {
              primary: ["Copilot enabled days for Teams"]
            },
            enabledDaysProductivity: {
              primary: ["Copilot enabled days for Productivity App"]
            },
            enabledDaysPowerPlatform: {
              primary: ["Copilot enabled days for Power Platform connectors"]
            },
            enabledDaysIntelligentSearch: {
              primary: ["Copilot enabled days for Intelligent Search"]
            },
            chatWorkEnabledDays: {
              primary: ["Copilot chat (work) enabled days"]
            },
            attendedMeetings: {
              primary: ["Attended meetings"]
            },
            meetingsTotal: {
              primary: ["Meetings"]
            },
            meetingHoursTotal: {
              primary: ["Meeting hours"]
            },
            meetingHoursUninterrupted: {
              primary: ["Uninterrupted hours"]
            },
            meetingHoursSmall: {
              primary: ["Small meeting hours"]
            },
            meetingHoursMultitasking: {
              primary: ["Multitasking hours"]
            },
            meetingHoursConflicting: {
              primary: ["Conflicting meeting hours"]
            },
            chatsSent: {
              primary: ["Chats sent"]
            }
          };
          const csvFieldEntries = Object.entries(csvFieldMap);
          const CSV_FIELD_ENTRIES_COUNT = csvFieldEntries.length;
      
          function getColumnValue(raw, column) {
            if (!raw || !column) {
              return null;
            }
            let candidateColumn = column;
            if (!(candidateColumn in raw)) {
              if (typeof column === "string") {
                const trimmed = column.trim();
                if (trimmed && trimmed !== column && trimmed in raw) {
                  candidateColumn = trimmed;
                } else if (currentCsvFieldLookup) {
                  const normalized = normalizeHeaderKey(column);
                  if (normalized) {
                    const resolved = currentCsvFieldLookup.get(normalized);
                    if (resolved && resolved in raw) {
                      candidateColumn = resolved;
                    }
                  }
                }
              }
            }
            if (!(candidateColumn in raw)) {
              return null;
            }
            const rawValue = raw[candidateColumn];
            if (rawValue == null) {
              return null;
            }
            if (typeof rawValue === "string" && !rawValue.trim()) {
              return null;
            }
            const parsed = parseNumber(rawValue);
            return Number.isFinite(parsed) ? parsed : null;
          }
      
          function getFirstAvailableValue(raw, columns) {
            if (!columns) {
              return null;
            }
            if (!Array.isArray(columns)) {
              return getColumnValue(raw, columns);
            }
            for (let index = 0; index < columns.length; index += 1) {
              const value = getColumnValue(raw, columns[index]);
              if (value != null) {
                return value;
              }
            }
            return null;
          }
      
          function getMaxOfColumns(raw, columns) {
            if (!columns) {
              return null;
            }
            const list = Array.isArray(columns) ? columns : [columns];
            let max = null;
            for (let index = 0; index < list.length; index += 1) {
              const value = getColumnValue(raw, list[index]);
              if (value != null) {
                if (max == null || value > max) {
                  max = value;
                }
              }
            }
            return max;
          }
      
          function getSumOfColumns(raw, columns) {
            if (!columns) {
              return null;
            }
            const list = Array.isArray(columns) ? columns : [columns];
            let total = 0;
            let used = false;
            for (let index = 0; index < list.length; index += 1) {
              const value = getColumnValue(raw, list[index]);
              if (value != null) {
                total += value;
                used = true;
              }
            }
            return used ? total : null;
          }
      
          function extractMetricValue(raw, mapping) {
            if (!mapping) {
              return 0;
            }
            if (typeof mapping === "string") {
              const direct = getColumnValue(raw, mapping);
              return direct != null ? direct : 0;
            }
            if (Array.isArray(mapping)) {
              const first = getFirstAvailableValue(raw, mapping);
              return first != null ? first : 0;
            }
            const preferMax = Boolean(mapping.preferMax);
            const primaryColumns = mapping.primary || mapping.columns;
            const primaryValue = preferMax
              ? getMaxOfColumns(raw, primaryColumns)
              : getFirstAvailableValue(raw, primaryColumns);
            if (primaryValue != null) {
              const sumExtras = getSumOfColumns(raw, mapping.sum);
              return sumExtras != null ? primaryValue + sumExtras : primaryValue;
            }
            const alternateColumns = mapping.alternate || mapping.synonyms || mapping.legacy;
            if (alternateColumns) {
              const alternateValue = preferMax
                ? getMaxOfColumns(raw, alternateColumns)
                : getFirstAvailableValue(raw, alternateColumns);
              if (alternateValue != null) {
                const sumExtras = getSumOfColumns(raw, mapping.sum);
                return sumExtras != null ? alternateValue + sumExtras : alternateValue;
              }
            }
            const fallbackSum = getSumOfColumns(raw, mapping.fallbackSum);
            if (fallbackSum != null) {
              const additional = getSumOfColumns(raw, mapping.sum);
              return additional != null ? fallbackSum + additional : fallbackSum;
            }
            const sumValue = getSumOfColumns(raw, mapping.sum);
            return sumValue != null ? sumValue : 0;
          }
      
          function getMetricDisplayLabel(metricKey) {
            const mapping = csvFieldMap[metricKey];
            if (!mapping) {
              return metricKey;
            }
            if (typeof mapping === "string") {
              return mapping;
            }
            if (Array.isArray(mapping)) {
              return mapping[0] || metricKey;
            }
            if (Array.isArray(mapping.primary) && mapping.primary.length) {
              return mapping.primary[0];
            }
            const alternate = mapping.alternate || mapping.synonyms || mapping.legacy;
            if (Array.isArray(alternate) && alternate.length) {
              return alternate[0];
            }
            if (typeof mapping.primary === "string") {
              return mapping.primary;
            }
            return metricKey;
          }
      
          const categoryConfig = {
            meetings: {
              primary: "meetingRecap",
              secondary: ["meetingSummariesTotal", "meetingSummariesActions"],
              formatters: [
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value))
              ]
            },
            emails: {
              primary: "emailDrafts",
              secondary: ["emailCoaching", "emailSummaries"],
              formatters: [
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value))
              ]
            },
            chats: {
              primary: "teamsActions",
              secondary: ["chatCompose", "chatSummaries", "chatConversations"],
              formatters: [
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value))
              ]
            },
            documents: {
              primary: "wordActions",
              secondary: ["documentSummaries", "presentationCreated", "excelAnalysis"],
              formatters: [
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value))
              ]
            },
            "copilot-chat": {
              primary: "chatPromptsWork",
              secondary: ["chatPromptsWeb", "chatPromptsTeams"],
              formatters: [
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value)),
                value => numberFormatter.format(Math.round(value))
              ]
            }
          };
          const categoryMetricLabels = {
            meetings: {
              meetingRecap: "Intelligent recap actions taken using Copilot",
              meetingSummariesTotal: "Total meetings summarized or recapped by Copilot",
              meetingSummariesActions: "Summarize meeting actions taken using Copilot"
            },
            emails: {
              emailDrafts: "Drafts generated with Copilot",
              emailCoaching: "Email coaching actions taken using Copilot",
              emailSummaries: "Summarize email thread actions taken using Copilot"
            },
            chats: {
              chatCompose: "Compose chat actions taken using Copilot in Teams",
              chatSummaries: "Summarize chat actions taken using Copilot in Teams",
              chatConversations: "Total chat conversations summarized by Copilot in Teams",
              teamsActions: "Copilot actions taken in Teams"
            },
            documents: {
              wordActions: "Copilot actions taken in Word",
              documentSummaries: "Document summaries created with Copilot",
              presentationCreated: "Presentations created using Copilot",
              excelAnalysis: "Excel analysis actions taken using Copilot"
            },
            "copilot-chat": {
              chatPromptsWork: "Copilot Chat (work) prompts submitted",
              chatPromptsWeb: "Copilot Chat (web) prompts submitted",
              chatPromptsTeams: "Teams chat prompts submitted to Copilot"
            }
          };
          const categoryHourFieldMap = {
            meetings: "meetingHours"
          };
      
      
          const categoryLabels = {
            meetings: "Meetings",
            emails: "Emails",
            chats: "Teams",
            documents: "Documents",
            "copilot-chat": "Copilot chat",
            "copilot-chat-work": "Copilot chat (work)",
            "copilot-chat-web": "Copilot chat (web)"
          };

          function getCategoryTotalValue(entry) {
            if (!entry || typeof entry !== "object") {
              return 0;
            }
            if (Number.isFinite(entry.total)) {
              return entry.total;
            }
            const primary = Number(entry.primary) || 0;
            const secondarySum = Array.isArray(entry.secondary)
              ? entry.secondary.reduce((sum, value) => sum + (Number(value) || 0), 0)
              : 0;
            return primary + secondarySum;
          }
      
          const agentCsvFieldMap = {
            id: "Agent ID",
            name: "Agent name",
            creatorType: "Creator type",
            activeLicensed: "Active users (licensed)",
            activeUnlicensed: "Active users (unlicensed)",
            responses: "Responses sent to users",
            lastActivity: "Last activity date (UTC)"
          };
      
          const agentSortLabels = {
            name: "Agent name",
            creatorType: "Creator type",
            totalActive: "Active users",
            responses: "Responses",
            lastActivity: "Last activity"
          };
          const AGENT_HUB_TYPES = ["users", "agents", "combined"];
          const agentHubDatasetConfig = {
            users: {
              requiredFields: {
                username: ["Username", "User principal name", "UPN", "User"],
                displayName: ["Display name", "Name", "Full name"],
                agentCount: ["Number of agents used", "Agents used", "Agent count"],
                responses: ["Agent responses received", "Agent responses", "Responses received"],
                lastActivity: "Last activity date (UTC)"
              },
              columns: [
                { key: "username", type: "text" },
                { key: "displayName", type: "text" },
                { key: "agentCount", type: "number" },
                { key: "responses", type: "number" },
                { key: "lastActivity", type: "date" }
              ],
              filterKeys: ["username", "displayName"]
            },
            agents: {
              requiredFields: {
                agentId: ["Agent ID", "AgentID"],
                agentName: ["Agent name", "Agent"],
                creatorType: ["Creator type", "CreatorType"],
                activeLicensed: ["Active users (licensed)", "Licensed active users"],
                activeUnlicensed: ["Active users (unlicensed)", "Unlicensed active users"],
                responses: ["Responses sent to users", "Responses sent", "Responses"],
                lastActivity: "Last activity date (UTC)"
              },
              columns: [
                { key: "agentId", type: "text" },
                { key: "agentName", type: "text" },
                { key: "creatorType", type: "text" },
                { key: "activeLicensed", type: "number" },
                { key: "activeUnlicensed", type: "number" },
                { key: "responses", type: "number" },
                { key: "lastActivity", type: "date" }
              ],
              filterKeys: ["agentId", "agentName", "creatorType"]
            },
            combined: {
              requiredFields: {
                agentId: ["Agent ID", "AgentID"],
                agentName: ["Agent name", "Agent"],
                creatorType: ["Creator type", "CreatorType"],
                username: ["Username", "User principal name", "UPN", "User"],
                responses: ["Responses sent to users", "Responses sent", "Responses"],
                lastActivity: "Last activity date (UTC)"
              },
              columns: [
                { key: "agentId", type: "text" },
                { key: "agentName", type: "text" },
                { key: "creatorType", type: "text" },
                { key: "username", type: "text" },
                { key: "responses", type: "number" },
                { key: "lastActivity", type: "date" }
              ],
              filterKeys: ["agentId", "agentName", "creatorType", "username"]
            }
          };
          const agentHubTypeLabels = {
            users: "Users CSV",
            agents: "Agents CSV",
            combined: "Users & agents CSV"
          };
      
          const MONTH_NAME_TO_INDEX = {
            jan: 0,
            feb: 1,
            mar: 2,
            apr: 3,
            may: 4,
            jun: 5,
            jul: 6,
            aug: 7,
            sep: 8,
            oct: 9,
            nov: 10,
            dec: 11
          };
      
          const activeDaysConfig = {
            word: {
              label: "Word",
              dayField: "daysActiveWord",
              promptFields: ["documentSummaries"]
            },
            teams: {
              label: "Teams",
              dayField: "daysActiveTeams",
              promptFields: ["meetingRecap", "meetingSummariesTotal", "chatCompose", "chatSummaries", "chatConversations"]
            },
            outlook: {
              label: "Outlook",
              dayField: "daysActiveOutlook",
              promptFields: ["emailDrafts", "emailSummaries", "emailCoaching"]
            },
            powerpoint: {
              label: "PowerPoint",
              dayField: "daysActivePowerPoint",
              promptFields: ["presentationCreated"]
            },
            excel: {
              label: "Excel",
              dayField: "daysActiveExcel",
              promptFields: ["excelAnalysis"]
            },
            onenote: {
              label: "OneNote",
              dayField: "daysActiveOneNote",
              promptFields: []
            },
            loop: {
              label: "Loop",
              dayField: "daysActiveLoop",
              promptFields: []
            },
            chatWork: {
              label: "Copilot chat (work)",
              dayField: "daysActiveChatWork",
              promptFields: ["chatPromptsWork", "chatPromptsTeams"]
            },
            chatWeb: {
              label: "Copilot Chat (web)",
              dayField: "daysActiveChatWeb",
              promptFields: ["chatPromptsWeb"]
            }
          };
      
          const adoptionAppConfig = {
            teams: {
              label: "Teams",
              color: "#6264A7",
              indicators: ["daysActiveTeams", "meetingRecap", "meetingSummariesTotal", "meetingHours", "chatCompose", "chatSummaries", "chatConversations", "chatPromptsTeams"],
              features: [
                { key: "intelligent-recap", label: "Intelligent recap", metrics: ["meetingRecap"] },
                { key: "summarize-meetings", label: "Summarize meetings", metrics: ["meetingSummariesTotal"] },
                { key: "meeting-hours", label: "Meeting hours summarized", metrics: ["meetingHours"] },
                { key: "compose-chat", label: "Compose chat messages", metrics: ["chatCompose"] },
                { key: "chat-summaries", label: "Summarize chats & conversations", metrics: ["chatSummaries", "chatConversations"] },
                { key: "chat-prompts-teams", label: "Copilot Chat in Teams", metrics: ["chatPromptsTeams"] }
              ]
            },
            outlook: {
              label: "Outlook",
              color: "#0078D4",
              indicators: ["daysActiveOutlook", "emailDrafts", "emailSummaries", "emailCoaching"],
              features: [
                { key: "email-drafts", label: "Generate email drafts", metrics: ["emailDrafts"] },
                { key: "email-coaching", label: "Email coaching", metrics: ["emailCoaching"] },
                { key: "email-summaries", label: "Summarize email threads", metrics: ["emailSummaries"] }
              ]
            },
            word: {
              label: "Word",
              color: "#2B579A",
              indicators: ["daysActiveWord", "documentSummaries"],
              features: [
                { key: "document-summaries", label: "Summarize documents", metrics: ["documentSummaries"] }
              ]
            },
            powerpoint: {
              label: "PowerPoint",
              color: "#D24726",
              indicators: ["daysActivePowerPoint", "presentationCreated"],
              features: [
                { key: "create-presentations", label: "Create presentations", metrics: ["presentationCreated"] }
              ]
            },
            excel: {
              label: "Excel",
              color: "#217346",
              indicators: ["daysActiveExcel", "excelAnalysis"],
              features: [
                { key: "excel-analysis", label: "Analyze data", metrics: ["excelAnalysis"] }
              ]
            },
            onenote: {
              label: "OneNote",
              color: "#80397B",
              indicators: ["daysActiveOneNote"],
              features: []
            },
            loop: {
              label: "Loop",
              color: "#9337F4",
              indicators: ["daysActiveLoop"],
              features: []
            },
            chatWork: {
              label: "Copilot Chat (work)",
              color: "#0F6CBD",
              indicators: ["daysActiveChatWork", "chatPromptsWork"],
              features: [
                { key: "chat-prompts-work", label: "Prompts submitted", metrics: ["chatPromptsWork"] }
              ]
            },
            chatWeb: {
              label: "Copilot Chat (web)",
              color: "#107C10",
              indicators: ["daysActiveChatWeb", "chatPromptsWeb"],
              features: [
                { key: "chat-prompts-web", label: "Prompts submitted", metrics: ["chatPromptsWeb"] }
              ]
            }
          };
      
          const chartSeriesDefinitions = [
            {
              id: "total",
              label: metric => {
                if (metric === "hours") {
                  return "Assisted hours";
                }
                if (metric === "adoption") {
                  return "Active users (%)";
                }
                return "Total actions";
              },
              getValue: period => {
                if (state.filters.metric === "hours") {
                  return period.assistedHours;
                }
                if (state.filters.metric === "adoption") {
                  return getPeriodAdoptionRate(period);
                }
                return period.totalActions;
              },
              borderColor: "rgba(0, 110, 0, 0.9)",
              backgroundColor: "rgba(0, 110, 0, 0.18)",
              fill: "origin",
              borderWidth: 3,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: "#ffffff",
              pointBorderColor: "rgba(0, 110, 0, 0.9)",
              pointBorderWidth: 2,
              tension: 0.32,
              togglable: false
            },
            {
              id: "enabled-users",
              label: () => "Enabled users",
              metrics: ["actions"],
              getValue: period => period.enabledUsersCount || 0,
              supportsAverage: false,
              borderColor: "rgba(148, 163, 184, 0.95)",
              backgroundColor: "rgba(148, 163, 184, 0.18)",
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 5,
              pointBackgroundColor: "#ffffff",
              tension: 0.2,
              fill: false,
              togglable: false
            },
            {
              id: "meetings",
              label: () => categoryLabels.meetings,
              getValue: period => (state.filters.metric === "hours" ? 0 : getCategoryTotalValue(period?.categories?.meetings)),
              borderColor: "rgba(9, 114, 136, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              togglable: true,
              defaultVisible: true
            },
            {
              id: "emails",
              label: () => categoryLabels.emails,
              getValue: period => (state.filters.metric === "hours" ? 0 : getCategoryTotalValue(period?.categories?.emails)),
              borderColor: "rgba(81, 70, 214, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              togglable: true,
              defaultVisible: true
            },
            {
              id: "chats",
              label: () => categoryLabels.chats,
              getValue: period => (state.filters.metric === "hours" ? 0 : getCategoryTotalValue(period?.categories?.chats)),
              borderColor: "rgba(58, 132, 193, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              togglable: true,
              defaultVisible: true
            },
            {
              id: "documents",
              label: () => categoryLabels.documents,
              getValue: period => (state.filters.metric === "hours" ? 0 : getCategoryTotalValue(period?.categories?.documents)),
              borderColor: "rgba(246, 189, 24, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              togglable: true,
              defaultVisible: true
            },
            {
              id: "copilot-chat-work",
              label: () => categoryLabels["copilot-chat-work"],
              getValue: period => (state.filters.metric === "hours" ? 0 : ((period.categories && period.categories["copilot-chat"] && period.categories["copilot-chat"].primary) || 0)),
              borderColor: "rgba(0, 138, 0, 0.75)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              togglable: true,
              defaultVisible: true
            },
            {
              id: "copilot-chat-web",
              label: () => categoryLabels["copilot-chat-web"],
              getValue: period => (state.filters.metric === "hours" ? 0 : ((period.categories && period.categories["copilot-chat"] && period.categories["copilot-chat"].secondary && period.categories["copilot-chat"].secondary[0]) || 0)),
              borderColor: "rgba(0, 138, 0, 0.5)",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.24,
              borderDash: [6, 4],
              togglable: true,
              defaultVisible: true
            }
          ];
          const togglableSeriesIds = chartSeriesDefinitions.filter(def => def.togglable).map(def => def.id);
          const defaultCategorySelection = new Set(togglableSeriesIds);
      
          const trendSeriesIds = chartSeriesDefinitions.map(def => def.id);
      
          const fallbackTrendPalette = {
            total: '#006E00',
            meetings: '#097288',
            emails: '#5146D6',
            chats: '#3A84C1',
            documents: '#F6BD18',
            'copilot-chat-work': '#008A00',
            'copilot-chat-web': '#5FBF75',
            'enabled-users': '#94A3AF'
          };
      
          function sanitizeHexColor(value) {
            if (typeof value !== 'string') {
              return null;
            }
            const trimmed = value.trim();
            if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
              return null;
            }
            const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
            return `#${normalized.slice(1).toUpperCase()}`;
          }
      
          function hexToRgb(hex) {
            const normalized = sanitizeHexColor(hex);
            if (!normalized) {
              return null;
            }
            const value = Number.parseInt(normalized.slice(1), 16);
            return {
              r: (value >> 16) & 255,
              g: (value >> 8) & 255,
              b: value & 255
            };
          }
      
          function rgbToHex(r, g, b) {
            const toHex = component => component.toString(16).padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
          }
      
          function colorStringToHex(color) {
            if (!color) {
              return null;
            }
            if (color.startsWith('#')) {
              return sanitizeHexColor(color);
            }
            const match = color.match(/rgba?\(([^)]+)\)/i);
            if (!match) {
              return null;
            }
            const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
            if (parts.length < 3 || parts.slice(0, 3).some(part => !Number.isFinite(part))) {
              return null;
            }
            const [r, g, b] = parts;
            return rgbToHex(Math.round(r), Math.round(g), Math.round(b));
          }
      
          function hexToRgba(hex, alpha) {
            const rgb = hexToRgb(hex);
            if (!rgb) {
              return null;
            }
            const clamped = Math.min(Math.max(alpha, 0), 1);
            return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
          }
      
          function buildGradientColors(count, startHex, endHex) {
            const start = hexToRgb(startHex);
            const end = hexToRgb(endHex);
            if (!start || !end || count <= 0) {
              return [];
            }
            if (count === 1) {
              return [rgbToHex(start.r, start.g, start.b)];
            }
            const colors = [];
            for (let index = 0; index < count; index += 1) {
              const t = index / (count - 1);
              const r = Math.round(start.r + (end.r - start.r) * t);
              const g = Math.round(start.g + (end.g - start.g) * t);
              const b = Math.round(start.b + (end.b - start.b) * t);
              colors.push(rgbToHex(r, g, b));
            }
            return colors;
          }
      
          function getCssVariableValue(variableName, fallback = "") {
            if (!variableName) {
              return fallback;
            }
            try {
              const styles = getComputedStyle(document.documentElement);
              if (!styles) {
                return fallback;
              }
              const value = styles.getPropertyValue(variableName);
              if (!value) {
                return fallback;
              }
              const trimmed = value.trim();
              return trimmed || fallback;
            } catch (error) {
              return fallback;
            }
          }
      
          function getDefaultEnabledLicensesColors() {
            const primary = colorStringToHex(getCssVariableValue("--green-600", "#008A00")) || "#008A00";
            const secondary = colorStringToHex(getCssVariableValue("--green-500", "#13A455")) || primary;
            return {
              start: primary,
              end: secondary,
              gradient: false,
              isCustom: false
            };
          }
      
          function updateThemeToggleUI() {
            const themeId = normalizeThemeId(state.theme);
            const themeDefinition = THEME_BY_ID.get(themeId) || THEME_BY_ID.get(DEFAULT_LIGHT_THEME_ID);
            const isDark = themeDefinition?.scheme === "dark";

            if (dom.themeToggle) {
              dom.themeToggle.setAttribute("aria-pressed", String(isDark));
            }

            if (dom.themeLabel && themeDefinition) {
              dom.themeLabel.textContent = themeDefinition.label;
            }

            if (dom.themeOptions && dom.themeOptions.length) {
              dom.themeOptions.forEach(option => {
                const optionTheme = option.getAttribute("data-theme");
                option.classList.toggle("is-active", optionTheme === themeId);
              });
            }
            if (dom.floatingThemeToggle && dom.floatingThemeIcon) {
              dom.floatingThemeToggle.setAttribute("aria-pressed", String(isDark));
              dom.floatingThemeToggle.setAttribute("aria-label", isDark ? "Switch to a light theme" : "Switch to a dark theme");
              // If we're currently in dark mode, show a sun (switch to light).
              // If we're currently in light mode, show a moon (switch to dark).
              const sunIcon = '<svg viewBox="0 0 24 24" role="img" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';
              const moonIcon = '<svg viewBox="0 0 24 24" role="img" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
              dom.floatingThemeIcon.innerHTML = isDark ? sunIcon : moonIcon;
            }
          }
      
          function persistThemePreference(theme) {
            if (!window.localStorage) {
              return;
            }
            try {
              localStorage.setItem(THEME_STORAGE_KEY, theme);

              const scheme = isDarkTheme(theme) ? "dark" : "light";
              const schemeKey = scheme === "dark" ? LAST_DARK_THEME_STORAGE_KEY : LAST_LIGHT_THEME_STORAGE_KEY;
              localStorage.setItem(schemeKey, theme);
            } catch (error) {
              logWarn("Unable to store theme preference", error);
            }
          }
      
          function loadStoredThemePreference() {
            if (!window.localStorage) {
              return null;
            }
            try {
              const stored = localStorage.getItem(THEME_STORAGE_KEY);
              if (!stored) {
                return null;
              }

              // Backwards compatibility with the earlier dark/light-only toggle.
              if (stored === "dark") {
                return DEFAULT_DARK_THEME_ID;
              }
              if (stored === "light") {
                return DEFAULT_LIGHT_THEME_ID;
              }

              const normalized = normalizeThemeId(stored);
              if (THEME_BY_ID.has(normalized)) {
                return normalized;
              }
            } catch (error) {
              logWarn("Unable to read stored theme preference", error);
            }
            return null;
          }
      
          function applyTheme(theme, { persist = true } = {}) {
            const normalized = normalizeThemeId(theme);
            const themeDefinition = THEME_BY_ID.get(normalized) || THEME_BY_ID.get(DEFAULT_LIGHT_THEME_ID);
            const scheme = themeDefinition?.scheme === "dark" ? "dark" : "light";

            state.theme = themeDefinition?.id || DEFAULT_LIGHT_THEME_ID;

            document.body.classList.toggle("is-dark", scheme === "dark");

            document.body.classList.remove(
              "is-light-base",
              "is-light-cool",
              "is-dark-carbon",
              "is-dark-cyberpunk",
              "is-dark-neon",
              "is-dark-sunset",
              "is-custom-theme"
            );
            
            // Remove any custom CSS variables
            document.body.style.removeProperty('--accent-primary');
            document.body.style.removeProperty('--accent-primary-rgb');
            document.body.style.removeProperty('--text-body');
            document.body.style.removeProperty('--text-muted');
            document.body.style.removeProperty('background');
            
            if (themeDefinition?.bodyClass) {
              document.body.classList.add(themeDefinition.bodyClass);
            }
            
            // Apply custom theme colors if custom theme is selected
            if (normalized === 'custom') {
              applyCustomThemeColors();
            }

            updateThemeToggleUI();
            applyChartThemeStyles();
            refreshTrendColors();
            if (persist) {
              persistThemePreference(state.theme);
            }
          }
          
          function applyCustomThemeColors() {
            const customColors = loadCustomThemeColors();
            const { accent, bg, text } = customColors;
            
            // Parse hex to RGB for accent
            const accentRgb = hexToRgb(accent);
            
            document.body.style.setProperty('--accent-primary', accent);
            document.body.style.setProperty('--accent-primary-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
            document.body.style.setProperty('--text-body', text);
            document.body.style.setProperty('--text-muted', adjustBrightness(text, -30));
            document.body.style.setProperty('background', `linear-gradient(180deg, ${bg} 0%, ${adjustBrightness(bg, 10)} 100%)`);
            
            // Update custom preview swatch
            const previewEl = document.querySelector('.theme-option-preview--custom');
            if (previewEl) {
              previewEl.style.background = `linear-gradient(135deg, ${bg} 0%, ${accent} 100%)`;
            }
          }
          
          function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
          }
          
          function adjustBrightness(hex, percent) {
            const rgb = hexToRgb(hex);
            const adjust = (c) => Math.min(255, Math.max(0, Math.round(c + (255 * percent / 100))));
            const r = adjust(rgb.r).toString(16).padStart(2, '0');
            const g = adjust(rgb.g).toString(16).padStart(2, '0');
            const b = adjust(rgb.b).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
          }
          
          function loadCustomThemeColors() {
            const defaults = { accent: '#ff6b35', bg: '#1a1a2e', text: '#eaeaea' };
            if (!window.localStorage) return defaults;
            try {
              const stored = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
              if (stored) {
                return { ...defaults, ...JSON.parse(stored) };
              }
            } catch (e) {
              logWarn('Failed to load custom theme colors', e);
            }
            return defaults;
          }
          
          function saveCustomThemeColors(colors) {
            if (!window.localStorage) return;
            try {
              localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(colors));
            } catch (e) {
              logWarn('Failed to save custom theme colors', e);
            }
          }

          function normalizeThemeId(themeId) {
            if (typeof themeId !== "string" || !themeId) {
              return DEFAULT_LIGHT_THEME_ID;
            }
            if (themeId === "dark") {
              return DEFAULT_DARK_THEME_ID;
            }
            if (themeId === "light") {
              return DEFAULT_LIGHT_THEME_ID;
            }
            return THEME_BY_ID.has(themeId) ? themeId : DEFAULT_LIGHT_THEME_ID;
          }

          function isDarkTheme(themeId) {
            const normalized = normalizeThemeId(themeId);
            const definition = THEME_BY_ID.get(normalized);
            return definition?.scheme === "dark";
          }

          function loadLastThemeForScheme(scheme) {
            if (!window.localStorage) {
              return scheme === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
            }
            const key = scheme === "dark" ? LAST_DARK_THEME_STORAGE_KEY : LAST_LIGHT_THEME_STORAGE_KEY;
            try {
              const stored = localStorage.getItem(key);
              const normalized = normalizeThemeId(stored);
              const definition = THEME_BY_ID.get(normalized);
              if (definition && definition.scheme === scheme) {
                return normalized;
              }
            } catch (error) {
              logWarn("Unable to read last theme for scheme", error);
            }
            return scheme === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
          }

          let themeMenuOriginalParent = null;

          function setThemeMenuOpen(isOpen) {
            if (!dom.themeToggle || !dom.themeMenu) {
              return;
            }
            dom.themeToggle.setAttribute("aria-expanded", String(isOpen));
            if (isOpen) {
              // Move menu to body to escape stacking context issues
              themeMenuOriginalParent = dom.themeMenu.parentElement;
              document.body.appendChild(dom.themeMenu);
              dom.themeMenu.removeAttribute("hidden");
              positionThemeMenu();
              updateThemeToggleUI();
            } else {
              dom.themeMenu.setAttribute("hidden", "");
              resetThemeMenuPosition();
              // Move menu back to original location
              if (themeMenuOriginalParent && dom.themeMenu.parentElement === document.body) {
                themeMenuOriginalParent.appendChild(dom.themeMenu);
              }
            }
          }

          function resetThemeMenuPosition() {
            if (!dom.themeMenu) {
              return;
            }
            dom.themeMenu.style.position = "";
            dom.themeMenu.style.top = "";
            dom.themeMenu.style.left = "";
            dom.themeMenu.style.right = "";
            dom.themeMenu.style.bottom = "";
            dom.themeMenu.style.maxHeight = "";
          }

          function positionThemeMenu() {
            if (!dom.themeToggle || !dom.themeMenu) {
              return;
            }

            const menu = dom.themeMenu;
            const button = dom.themeToggle;
            const margin = 12;

            // Ensure the menu is measured as displayed.
            menu.style.position = "fixed";
            menu.style.left = "0px";
            menu.style.top = "0px";
            menu.style.right = "";
            menu.style.bottom = "";

            requestAnimationFrame(() => {
              const buttonRect = button.getBoundingClientRect();
              const menuRect = menu.getBoundingClientRect();
              const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
              const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

              let left = buttonRect.left;
              left = Math.max(margin, Math.min(left, viewportWidth - menuRect.width - margin));

              const spaceBelow = viewportHeight - buttonRect.bottom - margin;
              const spaceAbove = buttonRect.top - margin;

              const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
              let top;
              if (openAbove) {
                top = Math.max(margin, buttonRect.top - menuRect.height - 10);
                menu.style.maxHeight = `${Math.max(220, spaceAbove)}px`;
              } else {
                top = Math.min(viewportHeight - menuRect.height - margin, buttonRect.bottom + 10);
                top = Math.max(margin, top);
                menu.style.maxHeight = `${Math.max(220, spaceBelow)}px`;
              }

              menu.style.left = `${Math.round(left)}px`;
              menu.style.top = `${Math.round(top)}px`;
            });
          }

          function closeThemeMenu() {
            setThemeMenuOpen(false);
          }

          function toggleThemeMenu() {
            if (!dom.themeToggle || !dom.themeMenu) {
              return;
            }
            const expanded = dom.themeToggle.getAttribute("aria-expanded") === "true";
            setThemeMenuOpen(!expanded);
          }
          if (!(state.filters.categorySelection instanceof Set)) {
            state.filters.categorySelection = new Set(defaultCategorySelection);
          }
      
          const toggleToCategoryMap = {
            meetings: "meetings",
            emails: "emails",
            chats: "chats",
            documents: "documents",
            "copilot-chat-work": "copilot-chat",
            "copilot-chat-web": "copilot-chat"
          };

          const capabilityFieldMap = {
            meetings: [
              "meetingRecap",
              "meetingSummariesTotal",
              "meetingSummariesActions"
            ],
            emails: [
              "emailDrafts",
              "emailSummaries",
              "emailCoaching"
            ],
            chats: [
              "teamsActions",
              "chatCompose",
              "chatSummaries",
              "chatConversations"
            ],
            documents: [
              "wordActions",
              "documentSummaries",
              "presentationCreated",
              "excelAnalysis"
            ],
            "copilot-chat-work": [
              "chatPromptsWork",
              "chatPromptsTeams"
            ],
            "copilot-chat-web": [
              "chatPromptsWeb"
            ]
          };

          const hourCategoryKeys = Object.keys(categoryHourFieldMap);

          function getCapabilityFields(id) {
            const fields = capabilityFieldMap[id];
            return Array.isArray(fields) ? fields : [];
          }

          function getActiveCategorySelection() {
            if (state.filters.categorySelection instanceof Set && state.filters.categorySelection.size) {
              return state.filters.categorySelection;
            }
            return defaultCategorySelection;
          }

          function cloneActiveCategorySelection() {
            return new Set(getActiveCategorySelection());
          }

          function buildSelectionContext(selectionSet) {
            const selection = selectionSet instanceof Set && selectionSet.size ? selectionSet : defaultCategorySelection;
            const hiddenSelection = new Set();
            defaultCategorySelection.forEach(id => {
              if (!selection.has(id)) {
                hiddenSelection.add(id);
              }
            });
            const categories = new Set();
            const hiddenCapabilityFields = new Set();
            const hiddenHourCategories = new Set();

            selection.forEach(id => {
              const baseCategory = toggleToCategoryMap[id] || id;
              if (baseCategory) {
                categories.add(baseCategory);
              }
            });

            hiddenSelection.forEach(id => {
              const baseCategory = toggleToCategoryMap[id] || id;
              if (baseCategory) {
                if (hourCategoryKeys.includes(baseCategory)) {
                  hiddenHourCategories.add(baseCategory);
                }
              }
              getCapabilityFields(id).forEach(field => hiddenCapabilityFields.add(field));
            });

            return {
              selection,
              categories,
              hiddenCapabilityFields,
              hiddenHourCategories
            };
          }

          function isCategorySelectedForDisplay(key, selectionSet) {
            const set = selectionSet instanceof Set && selectionSet.size ? selectionSet : defaultCategorySelection;
            if (key === "copilot-chat") {
              return set.has("copilot-chat") || set.has("copilot-chat-work") || set.has("copilot-chat-web");
            }
            return set.has(key);
          }
      
          function getUsageThresholdStarts() {
            const thresholds = state.usageThresholds || {};
            let middle = Number.isFinite(thresholds.middle) ? Math.round(thresholds.middle) : DEFAULT_USAGE_THRESHOLD_MIDDLE;
            let high = Number.isFinite(thresholds.high) ? Math.round(thresholds.high) : DEFAULT_USAGE_THRESHOLD_HIGH;
            middle = Math.max(2, middle);
            high = Math.max(middle + 1, high);
            return { middle, high };
          }
      
          function formatUsageBucketLabel(min, max) {
            const formattedMin = numberFormatter.format(min);
            if (!Number.isFinite(max) || max === Number.POSITIVE_INFINITY) {
              return `${formattedMin}+ actions`;
            }
            const formattedMax = numberFormatter.format(max);
            if (min === max) {
              return `${formattedMin} action${min === 1 ? "" : "s"}`;
            }
            return `${formattedMin} to ${formattedMax} actions`;
          }
      
          function buildUsageFrequencyBuckets() {
            const { middle, high } = getUsageThresholdStarts();
            const lowMin = 1;
            const lowMax = Math.max(lowMin, middle - 1);
            const midMin = middle;
            const midMax = Math.max(midMin, high - 1);
            const highMin = high;
            return [
              { id: "low", min: lowMin, max: lowMax, label: formatUsageBucketLabel(lowMin, lowMax) },
              { id: "mid", min: midMin, max: midMax, label: formatUsageBucketLabel(midMin, midMax) },
              { id: "high", min: highMin, max: Number.POSITIVE_INFINITY, label: formatUsageBucketLabel(highMin, Number.POSITIVE_INFINITY) }
            ];
          }
      
          function normalizeUsageThresholdInputs(middleInput, highInput) {
            const current = getUsageThresholdStarts();
            let middle = Number.parseFloat(middleInput);
            let high = Number.parseFloat(highInput);
            if (!Number.isFinite(middle)) {
              middle = current.middle;
            }
            if (!Number.isFinite(high)) {
              high = current.high;
            }
            middle = Math.max(2, Math.round(middle));
            high = Math.max(middle + 1, Math.round(high));
            return { middle, high };
          }
      
      
          const seriesToggleButtons = new Map();
          chartSeriesDefinitions.forEach(def => {
            if (def.togglable) {
              state.seriesVisibility[def.id] = def.defaultVisible !== false;
            }
          });
      
          const dom = {
            dropZone: document.querySelector("[data-drop-zone]"),
            fileInput: document.querySelector("[data-file-input]"),
            toastContainer: document.querySelector("[data-toast-container]"),
            uploadMeta: document.querySelector("[data-upload-meta]"),
            uploadStatus: document.querySelector("[data-upload-status]"),
            uploadProgress: document.querySelector("[data-upload-progress]"),
            uploadProgressBar: document.querySelector("[data-upload-progress-bar]"),
            uploadCancel: document.querySelector("[data-upload-cancel]"),
            postUploadCta: document.querySelector("[data-post-upload-cta]"),
            postUploadExport: document.querySelector("[data-post-upload-export]"),
            datasetMessage: document.querySelector("[data-dataset-message]"),
            datasetMetaWrapper: document.querySelector("[data-dataset-meta]"),
            metaRecords: document.querySelector("[data-meta-records]"),
            metaUsers: document.querySelector("[data-meta-users]"),
            metaRange: document.querySelector("[data-meta-range]"),
            metaOrgs: document.querySelector("[data-meta-orgs]"),
            themeToggle: document.querySelector("[data-theme-toggle]"),
            themeLabel: document.querySelector("[data-theme-label]"),
            themeMenu: document.querySelector("[data-theme-menu]"),
            themeMenuClose: document.querySelector("[data-theme-menu-close]"),
            themeOptions: Array.from(document.querySelectorAll(".theme-option[data-theme]")),
            customThemeEditor: document.querySelector("[data-custom-theme-editor]"),
            customAccentInput: document.querySelector("[data-custom-accent]"),
            customBgInput: document.querySelector("[data-custom-bg]"),
            customTextInput: document.querySelector("[data-custom-text]"),
            floatingThemeToggle: document.querySelector("[data-floating-theme-toggle]"),
            floatingThemeIcon: document.querySelector("[data-floating-theme-icon]"),
            controlPanel: document.querySelector(".control-panel"),
            stickyFilterBar: document.querySelector("[data-sticky-filter-bar]"),
            stickyFilterSummary: document.querySelector("[data-sticky-filter-summary]"),
            stickyFilterBtn: document.querySelector("[data-sticky-filter-btn]"),
            stickyFilterDropdown: document.querySelector("[data-sticky-filter-dropdown]"),
            organizationFieldSelect: document.querySelector("[data-filter-organization-field]"),
            organizationFilter: document.querySelector("[data-filter-organization]"),
            countryFieldSelect: document.querySelector("[data-filter-country-field]"),
            countryFilter: document.querySelector("[data-filter-country]"),
            countryFilterWrapper: document.querySelector("[data-country-filter-wrapper]"),
            timeframeFilter: document.querySelector("[data-filter-timeframe]"),
            customRangeContainer: document.querySelector("[data-custom-range]"),
            customRangeStart: document.querySelector("[data-filter-custom-start]"),
            customRangeEnd: document.querySelector("[data-filter-custom-end]"),
            customRangeHint: document.querySelector("[data-custom-range-hint]"),
            aggregateFilter: document.querySelector("[data-filter-aggregate]"),
            metricFilter: document.querySelector("[data-filter-metric]"),
            groupFilter: document.querySelector("[data-filter-group]"),
            summaryActions: document.querySelector("[data-summary-actions]"),
            summaryActionsNote: document.querySelector("[data-summary-actions-note]"),
            summaryHours: document.querySelector("[data-summary-hours]"),
            summaryHoursNote: document.querySelector("[data-summary-hours-note]"),
            summaryUsers: document.querySelector("[data-summary-users]"),
            summaryUsersNote: document.querySelector("[data-summary-users-note]"),
            summaryLatest: document.querySelector("[data-summary-latest]"),
            summaryLatestPeriod: document.querySelector("[data-summary-latest-period]"),
            summaryLatestMetric: document.querySelector("[data-summary-latest-metric]"),
            summaryLatestNote: document.querySelector("[data-summary-latest-note]"),
            trendCaption: document.querySelector("[data-trend-caption]"),
            trendWindow: document.querySelector("[data-trend-window]"),
            trendEmpty: document.querySelector("[data-trend-empty]"),
            seriesModeToggle: document.querySelector("[data-toggle-series-mode]"),
            seriesToggleGroup: document.querySelector("[data-series-toggle-group]"),
            trendViewButtons: document.querySelectorAll("[data-trend-view]"),
            seriesHint: document.querySelector("[data-series-hint]"),
            exportControls: document.querySelector("[data-export-controls]"),
            exportTrigger: document.querySelector("[data-export-trigger]"),
            exportMenu: document.querySelector("[data-export-menu]"),
            exportPDF: document.querySelector("[data-export-pdf]"),
            exportPdfCustom: document.querySelector("[data-export-pdf-custom]"),
            exportCSV: document.querySelector("[data-export-csv]"),
            exportPNG: document.querySelector("[data-export-png]"),
            exportVideo: document.querySelector("[data-export-video]"),
            exportExcel: document.querySelector("[data-export-excel]"),
            exportExcelFull: document.querySelector("[data-export-excel-full]"),
            exportHint: document.querySelector("[data-export-hint]"),
            exportIncludeDetails: document.querySelector("[data-export-include-details]"),
            exportIncludeDetailsWrapper: document.querySelector("[data-export-include-details-wrapper]"),
            trendColorControls: document.querySelector("[data-trend-colors]"),
            trendColorStart: document.querySelector("[data-trend-color-start]"),
            trendColorEnd: document.querySelector("[data-trend-color-end]"),
            applyTrendColors: document.querySelector("[data-apply-trend-colors]"),
            resetTrendColors: document.querySelector("[data-reset-trend-colors]"),
            trendColorHint: document.querySelector("[data-trend-color-hint]"),
            storageControls: document.querySelector("[data-storage-controls]"),
            storageHint: document.querySelector("[data-storage-hint]"),
            snapshotControls: document.querySelector("[data-snapshot-controls]"),
            snapshotSaveButton: document.querySelector("[data-snapshot-save]"),
            snapshotLoadButton: document.querySelector("[data-snapshot-load]"),
            snapshotHint: document.querySelector("[data-snapshot-hint]"),
            snapshotExportDialog: document.querySelector("[data-snapshot-export-dialog]"),
            snapshotExportForm: document.querySelector("[data-snapshot-export-form]"),
            snapshotPassword: document.querySelector("[data-snapshot-password]"),
            snapshotPasswordConfirm: document.querySelector("[data-snapshot-password-confirm]"),
            snapshotError: document.querySelector("[data-snapshot-error]"),
            snapshotOutput: document.querySelector("[data-snapshot-output]"),
            snapshotOutputText: document.querySelector("[data-snapshot-output-text]"),
            snapshotCopy: document.querySelector("[data-snapshot-copy]"),
            snapshotDownload: document.querySelector("[data-snapshot-download]"),
            snapshotCancel: document.querySelector("[data-snapshot-cancel]"),
            snapshotGenerate: document.querySelector("[data-snapshot-generate]"),
            snapshotImportDialog: document.querySelector("[data-snapshot-import-dialog]"),
            snapshotImportForm: document.querySelector("[data-snapshot-import-form]"),
            snapshotImportText: document.querySelector("[data-snapshot-import-text]"),
            snapshotImportFile: document.querySelector("[data-snapshot-import-file]"),
            snapshotImportPassword: document.querySelector("[data-snapshot-import-password]"),
            snapshotImportError: document.querySelector("[data-snapshot-import-error]"),
            snapshotImportCancel: document.querySelector("[data-snapshot-import-cancel]"),
            snapshotImportSubmit: document.querySelector("[data-snapshot-import-submit]"),
            pdfExportDialog: document.querySelector("[data-pdf-export-dialog]"),
            pdfExportForm: document.querySelector("[data-pdf-export-form]"),
            pdfExportOptions: document.querySelector("[data-pdf-export-options]"),
            pdfExportCancel: document.querySelector("[data-pdf-export-cancel]"),
            pdfExportSubmit: document.querySelector("[data-pdf-export-submit]"),
            snapshotExportHtml: document.querySelector("[data-snapshot-export-html]"),
            clearStoredDataset: document.querySelector("[data-clear-storage]"),
            persistConsent: document.querySelector("[data-consent-persist]"),
            loadSampleButton: document.querySelector("[data-load-sample]"),
            dimensionCard: document.querySelector("[data-dimension-card]"),
            dimensionCaption: document.querySelector("[data-dimension-caption]"),
            dimensionSelect: document.querySelector("[data-dimension-select]"),
            dimensionTypeButtons: document.querySelectorAll("[data-dimension-type-button]"),
            dimensionMetricButtons: document.querySelectorAll("[data-dimension-metric-button]"),
            dimensionChartCanvas: document.querySelector("[data-dimension-chart]"),
            dimensionEmpty: document.querySelector("[data-dimension-empty]"),
            dimensionSummaryBody: document.querySelector("[data-dimension-summary]"),
            groupCaption: document.querySelector("[data-group-caption]"),
            groupBody: document.querySelector("[data-group-body]"),
            viewMoreButton: document.querySelector("[data-view-more]"),
            topUsers: document.querySelector("[data-top-users]"),
            topUsersToggle: document.querySelector("[data-top-users-toggle]"),
            topUsersPanel: document.querySelector("[data-top-users-panel]"),
            topUsersPanelToggle: document.querySelector("[data-top-users-panel-toggle]"),
            adoptionCard: document.querySelector("[data-adoption-card]"),
            adoptionCaption: document.querySelector("[data-adoption-caption]"),
            adoptionTable: document.querySelector("[data-adoption-table]"),
            adoptionBody: document.querySelector("[data-adoption-body]"),
            adoptionEmpty: document.querySelector("[data-adoption-empty]"),
            adoptionTotal: document.querySelector("[data-adoption-total]"),
            adoptionToggle: document.querySelector("[data-adoption-toggle]"),
            adoptionExportCsv: document.querySelector("[data-adoption-export-csv]"),
            usageCard: document.querySelector("[data-usage-card]"),
            usageCaption: document.querySelector("[data-usage-caption]"),
            usageWindow: document.querySelector("[data-usage-window]"),
            usageThresholdMiddle: document.querySelector("[data-usage-threshold-middle]"),
            usageThresholdHigh: document.querySelector("[data-usage-threshold-high]"),
            usageMonthControls: document.querySelector("[data-usage-month-controls]"),
            usageMonthGrid: document.querySelector("[data-usage-month-grid]"),
            usageEmpty: document.querySelector("[data-usage-empty]"),
            usageIntensityExportCsv: document.querySelector("[data-usage-intensity-export-csv]"),
            usageTrendCard: document.querySelector("[data-usage-trend-card]"),
            usageTrendCaption: document.querySelector("[data-usage-trend-caption]"),
            usageTrendToggleButtons: document.querySelectorAll("[data-usage-trend-mode]"),
            usageTrendEmpty: document.querySelector("[data-usage-trend-empty]"),
            usageTrendCanvas: document.querySelector("[data-usage-trend-chart]"),
            usageTrendRegionControls: document.querySelector("[data-usage-trend-region-controls]"),
            usageTrendExportPng: document.querySelector("[data-usage-export-png]"),
            usageTrendExportCsv: document.querySelector("[data-usage-export-csv]"),
            enabledLicensesCard: document.querySelector("[data-enabled-licenses-card]"),
            enabledLicensesCaption: document.querySelector("[data-enabled-licenses-caption]"),
            enabledLicensesCanvas: document.querySelector("[data-enabled-licenses-chart]"),
            enabledLicensesEmpty: document.querySelector("[data-enabled-licenses-empty]"),
            enabledLicensesExportControls: document.querySelector("[data-enabled-licenses-export-controls]"),
            enabledLicensesExportTrigger: document.querySelector("[data-enabled-licenses-export-trigger]"),
            enabledLicensesExportMenu: document.querySelector("[data-enabled-licenses-export-menu]"),
            enabledLicensesExportTransparent: document.querySelector("[data-enabled-licenses-export-transparent]"),
            enabledLicensesExportWhite: document.querySelector("[data-enabled-licenses-export-white]"),
            enabledLicensesExportNoValues: document.querySelector("[data-enabled-licenses-export-no-values]"),
            enabledLicensesColorControls: document.querySelector("[data-enabled-licenses-color-controls]"),
            enabledLicensesColorStart: document.querySelector("[data-enabled-licenses-color-start]"),
            enabledLicensesColorEnd: document.querySelector("[data-enabled-licenses-color-end]"),
            enabledLicensesGradientToggle: document.querySelector("[data-enabled-licenses-gradient]"),
            enabledLicensesApply: document.querySelector("[data-enabled-licenses-apply]"),
            enabledLicensesReset: document.querySelector("[data-enabled-licenses-reset]"),
            enabledLicensesShowValues: document.querySelector("[data-enabled-licenses-show-values]"),
            returningCard: document.querySelector("[data-returning-card]"),
            returningCaption: document.querySelector("[data-returning-caption]"),
            returningMetricButtons: document.querySelectorAll("[data-returning-metric-button]"),
            returningIntervalButtons: document.querySelectorAll("[data-returning-interval]"),
            returningEmpty: document.querySelector("[data-returning-empty]"),
            returningSummary: document.querySelector("[data-returning-summary]"),
            returningRegionControls: document.querySelector("[data-returning-region-controls]"),
            returningExportPng: document.querySelector("[data-returning-export-png]"),
            returningExportCsv: document.querySelector("[data-returning-export-csv]"),
            activeDaysCard: document.querySelector("[data-active-days-card]"),
            activeDaysCaption: document.querySelector("[data-active-days-caption]"),
            activeDaysGrid: document.querySelector("[data-active-days-grid]"),
            activeDaysToggleButtons: document.querySelectorAll("[data-active-days-view]"),
            agentHubContainer: document.querySelector("[data-agent-hub]"),
            agentHubAnchor: document.querySelector("[data-agent-hub-anchor]"),
            agentToggleWrapper: document.querySelector("[data-agent-toggle-wrapper]"),
            agentToggle: document.querySelector("[data-agent-toggle]"),
            agentHubReset: document.querySelector("[data-agent-reset]"),
            agentHubTabs: document.querySelector("[data-agent-tabs]"),
            agentHubTabButtons: document.querySelectorAll("[data-agent-tab]"),
            agentHubPanels: document.querySelectorAll("[data-agent-panel]"),
            agentCard: document.querySelector("[data-agent-card]"),
            agentCaption: document.querySelector("[data-agent-caption]"),
            agentStatus: document.querySelector("[data-agent-status]"),
            agentTableWrapper: document.querySelector("[data-agent-table-wrapper]"),
            agentTableBody: document.querySelector("[data-agent-table-body]"),
            agentEmpty: document.querySelector("[data-agent-empty]"),
            agentUploadButton: document.querySelector("[data-agent-upload]"),
            agentFileInput: document.querySelector("[data-agent-file-input]"),
            agentViewToggle: document.querySelector("[data-agent-view-toggle]"),
            agentViewAll: document.querySelector("[data-agent-view-all]"),
            agentSortButtons: document.querySelectorAll("[data-agent-sort]"),
          resetFiltersButton: document.querySelector("[data-reset-filters]"),
        };

        const agentHubSections = {};
        AGENT_HUB_TYPES.forEach(type => {
          const section = {
            dropzone: document.querySelector(`[data-agent-hub-dropzone="${type}"]`),
            uploadButton: document.querySelector(`[data-agent-hub-upload="${type}"]`),
            input: document.querySelector(`[data-agent-hub-input="${type}"]`),
            status: document.querySelector(`[data-agent-hub-status="${type}"]`),
            meta: document.querySelector(`[data-agent-hub-meta="${type}"]`),
            tableWrapper: document.querySelector(`[data-agent-hub-table-wrapper="${type}"]`),
            tbody: document.querySelector(`[data-agent-hub-tbody="${type}"]`),
            empty: document.querySelector(`[data-agent-hub-empty="${type}"]`),
            panel: document.querySelector(`[data-agent-panel="${type}"]`),
            filterBar: document.querySelector(`[data-agent-hub-filter-bar="${type}"]`),
            filterInput: document.querySelector(`[data-agent-hub-filter-input="${type}"]`),
            filterClear: document.querySelector(`[data-agent-hub-filter-clear="${type}"]`),
            sortButtons: Array.from(document.querySelectorAll(`[data-agent-hub-sort-context="${type}"]`)),
            toggleRows: document.querySelector(`[data-agent-hub-toggle="${type}"]`)
          };
          section.defaults = {
            status: section.status ? section.status.textContent : "",
            meta: section.meta ? section.meta.textContent : "",
            empty: section.empty ? section.empty.textContent : ""
          };
          agentHubSections[type] = section;
        });

        function relocateAgentHub() {
          const hub = dom.agentHubContainer;
          if (!hub) {
            return;
          }
          const anchor = dom.agentHubAnchor || document.querySelector("[data-agent-hub-anchor]");
          if (anchor && hub.parentElement !== anchor) {
            anchor.append(hub);
          } else if (!anchor) {
            const main = document.querySelector("main");
            if (main && hub.parentElement !== main) {
              main.append(hub);
            }
          }
          hub.hidden = true;
        }

        function setAgentHubVisibility(visible) {
          const hub = dom.agentHubContainer;
          const toggle = dom.agentToggle;
          if (!hub || !toggle) {
            return;
          }
          hub.hidden = !visible;
          toggle.textContent = visible ? "Hide agent usage" : "Show agent usage";
          toggle.setAttribute("aria-expanded", String(visible));
          if (visible) {
            hub.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }

        setButtonEnabled(dom.returningExportPng, false);
        setButtonEnabled(dom.returningExportCsv, false);
        setButtonEnabled(dom.usageTrendExportPng, false);
        setButtonEnabled(dom.usageTrendExportCsv, false);
        setButtonEnabled(dom.usageIntensityExportCsv, false);
        setButtonEnabled(dom.adoptionExportCsv, false);
        setButtonEnabled(dom.snapshotExportHtml, false);

        const filterToggleUpdaters = [
          setupFilterToggleGroup(document.querySelectorAll("[data-filter-timeframe-button]"), dom.timeframeFilter, "filterTimeframeButton"),
          setupFilterToggleGroup(document.querySelectorAll("[data-filter-aggregate-button]"), dom.aggregateFilter, "filterAggregateButton"),
          setupFilterToggleGroup(document.querySelectorAll("[data-filter-metric-button]"), dom.metricFilter, "filterMetricButton"),
          setupFilterToggleGroup(document.querySelectorAll("[data-filter-group-button]"), dom.groupFilter, "filterGroupButton")
        ].filter(Boolean);

        syncMultiSelect(dom.organizationFilter, state.filters.organization);
        syncMultiSelect(dom.countryFilter, state.filters.country);

          updateStoredDatasetControls(null);

          relocateAgentHub();
          setAgentHubVisibility(false);
          if (dom.agentToggle) {
            dom.agentToggle.addEventListener("click", () => {
              agentHubVisible = !agentHubVisible;
              setAgentHubVisibility(agentHubVisible);
            });
          }
      
          function ensureEnabledLicensesColorState() {
            if (!state.enabledLicensesColors) {
              state.enabledLicensesColors = getDefaultEnabledLicensesColors();
            }
            return state.enabledLicensesColors;
          }
      
          function resolveEnabledLicensesColorState() {
            const defaults = getDefaultEnabledLicensesColors();
            const stored = ensureEnabledLicensesColorState();
            const start = sanitizeHexColor(stored.start) || defaults.start;
            const rawEnd = sanitizeHexColor(stored.end) || defaults.end;
            const gradient = Boolean(stored.gradient);
            return {
              start,
              end: gradient ? rawEnd : start,
              rawEnd,
              gradient,
              isCustom: Boolean(stored.isCustom)
            };
          }
      
          function getEnabledLicensesFill(context) {
            const colors = resolveEnabledLicensesColorState();
            if (!context || !context.chart || !context.chart.ctx) {
              return hexToRgba(colors.start, 0.8) || colors.start;
            }
            const { chart } = context;
            const chartArea = chart.chartArea;
            if (!chartArea) {
              return hexToRgba(colors.start, 0.8) || colors.start;
            }
            if (!colors.gradient) {
              chart.$enabledLicensesGradient = null;
              return hexToRgba(colors.start, 0.8) || colors.start;
            }
            const width = Math.max(1, chartArea.right - chartArea.left);
            const cacheKey = `${colors.start}-${colors.rawEnd}-${width}`;
            const cached = chart.$enabledLicensesGradient;
            if (cached && cached.key === cacheKey) {
              return cached.gradient;
            }
            const gradient = chart.ctx.createLinearGradient(chartArea.left, chartArea.top, chartArea.right, chartArea.top);
            const startColor = hexToRgba(colors.start, 0.9) || colors.start;
            const endColor = hexToRgba(colors.rawEnd, 0.9) || colors.rawEnd;
            gradient.addColorStop(0, startColor);
            gradient.addColorStop(1, endColor);
            chart.$enabledLicensesGradient = { key: cacheKey, gradient };
            return gradient;
          }
      
          function getEnabledLicensesBorderColor() {
            const colors = resolveEnabledLicensesColorState();
            return hexToRgba(colors.start, 1) || colors.start;
          }
      
          function clearEnabledLicensesGradientCache() {
            if (state.charts.enabledLicenses) {
              state.charts.enabledLicenses.$enabledLicensesGradient = null;
            }
          }
      
          function updateEnabledLicensesColorInputs() {
            const colors = resolveEnabledLicensesColorState();
            if (dom.enabledLicensesColorStart) {
              dom.enabledLicensesColorStart.value = colors.start;
            }
            if (dom.enabledLicensesColorEnd) {
              dom.enabledLicensesColorEnd.value = colors.rawEnd;
              dom.enabledLicensesColorEnd.disabled = !colors.gradient;
            }
            if (dom.enabledLicensesGradientToggle) {
              dom.enabledLicensesGradientToggle.checked = colors.gradient;
            }
            if (dom.enabledLicensesShowValues) {
              dom.enabledLicensesShowValues.checked = state.showEnabledLicenseLabels !== false;
            }
          }
      
          function applyEnabledLicensesColorSelection() {
            const defaults = getDefaultEnabledLicensesColors();
            const start = sanitizeHexColor(dom.enabledLicensesColorStart?.value) || defaults.start;
            const endInput = sanitizeHexColor(dom.enabledLicensesColorEnd?.value) || defaults.end;
            const gradient = Boolean(dom.enabledLicensesGradientToggle?.checked);
            state.enabledLicensesColors = {
              start,
              end: endInput,
              gradient,
              isCustom: true
            };
            updateEnabledLicensesColorInputs();
            clearEnabledLicensesGradientCache();
            if (state.charts.enabledLicenses) {
              state.charts.enabledLicenses.update("none");
            }
          }
      
          function resetEnabledLicensesColors() {
            const defaults = getDefaultEnabledLicensesColors();
            state.enabledLicensesColors = {
              ...defaults,
              isCustom: false
            };
            updateEnabledLicensesColorInputs();
            clearEnabledLicensesGradientCache();
            if (state.charts.enabledLicenses) {
              state.charts.enabledLicenses.update("none");
            }
          }
      
          function refreshEnabledLicensesThemeColors() {
            const colors = ensureEnabledLicensesColorState();
            if (colors.isCustom) {
              return;
            }
            const defaults = getDefaultEnabledLicensesColors();
            state.enabledLicensesColors = {
              ...defaults,
              isCustom: false
            };
            updateEnabledLicensesColorInputs();
            clearEnabledLicensesGradientCache();
            if (state.charts.enabledLicenses) {
              state.charts.enabledLicenses.update("none");
            }
          }
      
          const activeDayKeys = Object.keys(activeDaysConfig);
          const activeDaysElements = activeDayKeys.reduce((accumulator, key, index) => {
            const valueElement = document.querySelector(`[data-active-days-value="${key}"]`);
            if (valueElement) {
              accumulator[key] = {
                value: valueElement,
                item: valueElement.closest(".active-days-item"),
                order: index
              };
            }
            return accumulator;
          }, {});
      
          const defaultTrendPalette = trendSeriesIds.map((id, index) => {
            const derived = colorStringToHex(chartSeriesDefinitions[index].borderColor);
            return sanitizeHexColor(derived) || fallbackTrendPalette[id] || '#006E00';
          });
          const DEFAULT_TREND_START_COLOR = sanitizeHexColor(defaultTrendPalette[0]) || '#006E00';
          const DEFAULT_TREND_END_COLOR = sanitizeHexColor(defaultTrendPalette[defaultTrendPalette.length - 1]) || '#14AA24';
          const DEFAULT_USAGE_THRESHOLD_MIDDLE = 17;
          const DEFAULT_USAGE_THRESHOLD_HIGH = 35;
          const TREND_COLOR_STORAGE_KEY = 'copilotTrendGradient';
          const DATA_STORAGE_KEY = 'copilotDashboardDataset';
          const DATA_STORAGE_META_KEY = 'copilotDashboardDatasetMeta';
          const AGENT_DATA_STORAGE_KEY = 'copilotAgentDataset';
          const AGENT_DATA_STORAGE_META_KEY = 'copilotAgentDatasetMeta';
          const AGENT_HUB_STORAGE_KEY = 'copilotAgentHubDatasets';
          const DATA_PERSISTENCE_KEY = 'copilotDashboardPersistence';
          const DATA_CONSENT_KEY = 'copilotPersistConsent';
          const FILTER_PREFERENCES_KEY = 'copilotFilterPrefs';
          const PDF_EXPORT_PREFERENCES_KEY = 'copilotPdfExportPrefs';
          const MAX_DATASET_FILE_SIZE = Infinity;
          const DATASET_CACHE_LIMIT_BYTES = 80 * 1024 * 1024; // Keep cache limit lower than upload limit to avoid repeated storage failures.
          const CSV_ACCEPTED_MIME_TYPES = new Set(["text/csv", "application/vnd.ms-excel"]);
          const SAMPLE_DATASET_URL = "samples/copilot-sample.csv";
          const SAMPLE_DATASET_INLINE = `PersonId,Organization,CountryOrRegion,Domain,MetricDate,Total Active Copilot Actions Taken,Copilot assisted hours,Meetings recapped by Copilot,Generate email draft actions taken using Copilot,Compose chat actions taken using Copilot in Teams,Meeting hours recapped by Copilot,Copilot Enabled User
USR-001,Contoso Sales,Denmark,sales.contoso,2024-10-06,180,42.5,18,45,52,68,1
USR-002,Contoso Sales,Denmark,sales.contoso,2024-11-03,220,51.1,24,58,64,72,1
USR-003,Fabrikam Finance,Norway,finance.fabrikam,2024-11-10,305,63.8,32,70,88,94,1
USR-004,Fabrikam Finance,Norway,finance.fabrikam,2024-12-08,276,54.2,28,64,79,90,1
USR-005,Woodgrove Retail,Sweden,retail.woodgrove,2024-12-15,148,38.7,12,41,55,48,1
USR-006,Woodgrove Retail,Sweden,retail.woodgrove,2025-01-05,312,72.4,36,82,94,110,1
USR-007,Northwind Ops,Finland,ops.northwind,2025-01-19,196,47.3,20,53,61,66,1
USR-008,Northwind Ops,Finland,ops.northwind,2025-02-02,254,58.9,27,69,83,92,1`;
          const CSV_DELIMITER_CANDIDATES = [";", ",", "\t", "|"];
          const THEME_STORAGE_KEY = 'copilotDashboardTheme';
          const LAST_LIGHT_THEME_STORAGE_KEY = 'copilotDashboardThemeLastLight';
          const LAST_DARK_THEME_STORAGE_KEY = 'copilotDashboardThemeLastDark';
          const DEFAULT_LIGHT_THEME_ID = 'light';
          const DEFAULT_DARK_THEME_ID = 'dark-midnight';

          const THEME_DEFINITIONS = [
            { id: 'light', label: 'Light', scheme: 'light', bodyClass: 'is-light-base' },
            { id: 'light-cool', label: 'Cool Light', scheme: 'light', bodyClass: 'is-light-cool' },
            { id: 'dark-midnight', label: 'Midnight Dark', scheme: 'dark', bodyClass: null },
            { id: 'dark-carbon', label: 'Carbon Black', scheme: 'dark', bodyClass: 'is-dark-carbon' },
            { id: 'dark-cyberpunk', label: 'Cyberpunk', scheme: 'dark', bodyClass: 'is-dark-cyberpunk' },
            { id: 'dark-neon', label: 'Neon', scheme: 'dark', bodyClass: 'is-dark-neon' },
            { id: 'dark-sunset', label: 'Sunset', scheme: 'dark', bodyClass: 'is-dark-sunset' },
            { id: 'custom', label: 'Custom', scheme: 'dark', bodyClass: 'is-custom-theme' }
          ];
          const THEME_BY_ID = new Map(THEME_DEFINITIONS.map(theme => [theme.id, theme]));
          const CUSTOM_THEME_STORAGE_KEY = 'copilotDashboardCustomTheme';
          const DEFAULT_ADOPTION_COLOR = '#008A00';
          const DATA_DB_NAME = 'copilotDashboardDB';
          const DATA_DB_STORE = 'datasets';
          const DATA_DB_AGENT_STORE = 'agentDatasets';
          const DATA_DB_AGENT_HUB_STORE = 'agentHubDatasets';
          const DATA_DB_VERSION = 3;
          const DATA_DB_KEY = 'latest';
          const DATA_DB_AGENT_KEY = 'latestAgents';
          const DATA_DB_AGENT_HUB_KEY = 'latestAgentHub';
          const DATA_DB_SUPPORTED = typeof window !== 'undefined' && 'indexedDB' in window;
          let pendingDbReset = null;

          function isVersionError(error) {
            return Boolean(error && error.name === "VersionError");
          }

          function resetDatasetDatabase() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve();
            }
            if (pendingDbReset) {
              return pendingDbReset;
            }
            pendingDbReset = new Promise(resolve => {
              try {
                const deleteRequest = indexedDB.deleteDatabase(DATA_DB_NAME);
                const finalize = () => {
                  pendingDbReset = null;
                  resolve();
                };
                deleteRequest.onsuccess = finalize;
                deleteRequest.onerror = finalize;
                deleteRequest.onblocked = finalize;
              } catch (error) {
                logWarn("Unable to reset dataset database", error);
                pendingDbReset = null;
                resolve();
              }
            });
            return pendingDbReset;
          }

          function openDatasetDatabase() {
            return new Promise((resolve, reject) => {
              if (!DATA_DB_SUPPORTED) {
                reject(new Error("IndexedDB is not supported in this browser."));
                return;
              }
              let request;
              try {
                request = indexedDB.open(DATA_DB_NAME, DATA_DB_VERSION);
              } catch (error) {
                if (isVersionError(error)) {
                  resetDatasetDatabase().then(() => openDatasetDatabase().then(resolve).catch(reject));
                  return;
                }
                reject(error);
                return;
              }
              request.onerror = () => {
                const error = request.error;
                if (isVersionError(error)) {
                  resetDatasetDatabase().then(() => openDatasetDatabase().then(resolve).catch(reject));
                  return;
                }
                reject(error || new Error("Unable to open dataset database."));
              };
              request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DATA_DB_STORE)) {
                  db.createObjectStore(DATA_DB_STORE, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(DATA_DB_AGENT_STORE)) {
                  db.createObjectStore(DATA_DB_AGENT_STORE, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(DATA_DB_AGENT_HUB_STORE)) {
                  db.createObjectStore(DATA_DB_AGENT_HUB_STORE, { keyPath: "id" });
                }
              };
              request.onsuccess = () => {
                resolve(request.result);
              };
            });
          }
      
          function saveDatasetToIndexedDB(csvText, meta = {}) {
            if (!DATA_DB_SUPPORTED) {
              return Promise.reject(new Error("IndexedDB is not supported in this browser."));
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_STORE);
              const record = {
                id: DATA_DB_KEY,
                csv: new Blob([csvText], { type: "text/csv" }),
                meta: {
                  ...meta,
                  savedAt: Date.now()
                }
              };
              store.put(record);
              transaction.oncomplete = () => {
                db.close();
                resolve(record.meta);
              };
              transaction.onerror = event => {
                const error = transaction.error || event.target.error;
                db.close();
                reject(error || new Error("Unable to store dataset."));
              };
            }));
          }
      
          function saveAgentDatasetToIndexedDB(csvText, meta = {}) {
            if (!DATA_DB_SUPPORTED) {
              return Promise.reject(new Error("IndexedDB is not supported in this browser."));
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_AGENT_STORE);
              const record = {
                id: DATA_DB_AGENT_KEY,
                csv: new Blob([csvText], { type: "text/csv" }),
                meta: {
                  ...meta,
                  savedAt: Date.now()
                }
              };
              store.put(record);
              transaction.oncomplete = () => {
                db.close();
                resolve(record.meta);
              };
              transaction.onerror = event => {
                const error = transaction.error || event.target.error;
                db.close();
                reject(error || new Error("Unable to store agent dataset."));
              };
            }));
          }
      
          function loadDatasetFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve(null);
            }
            if (!state.persistDatasets) {
              return Promise.resolve(null);
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_STORE, "readonly");
              const store = transaction.objectStore(DATA_DB_STORE);
              const request = store.get(DATA_DB_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to read stored dataset.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                  db.close();
                  resolve(null);
                  return;
                }
                const { csv, meta } = record;
                const finalize = csvText => {
                  db.close();
                  resolve({ csv: csvText, meta: meta || {} });
                };
                if (csv instanceof Blob) {
                  csv.text().then(finalize).catch(error => {
                    db.close();
                    reject(error);
                  });
                } else if (typeof csv === "string") {
                  finalize(csv);
                } else {
                  finalize("");
                }
              };
            }));
          }
      
          function loadAgentDatasetFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve(null);
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_STORE, "readonly");
              const store = transaction.objectStore(DATA_DB_AGENT_STORE);
              const request = store.get(DATA_DB_AGENT_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to read stored agent dataset.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                  db.close();
                  resolve(null);
                  return;
                }
                const { csv, meta } = record;
                const finalize = csvText => {
                  db.close();
                  resolve({ csv: csvText, meta: meta || {} });
                };
                if (csv instanceof Blob) {
                  csv.text().then(finalize).catch(error => {
                    db.close();
                    reject(error);
                  });
                } else if (typeof csv === "string") {
                  finalize(csv);
                } else {
                  finalize("");
                }
              };
            }));
          }
      
          function deleteDatasetFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve();
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_STORE);
              const request = store.delete(DATA_DB_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to delete stored dataset.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                db.close();
                resolve();
              };
            }));
          }
      
          function deleteAgentDatasetFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve();
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_AGENT_STORE);
              const request = store.delete(DATA_DB_AGENT_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to delete stored agent dataset.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                db.close();
                resolve();
              };
            }));
          }
      
          const trendColorMap = new Map(trendSeriesIds.map((id, index) => [id, defaultTrendPalette[index] || fallbackTrendPalette[id] || DEFAULT_TREND_START_COLOR]));
      
          function getTrendColor(definitionId) {
            return trendColorMap.get(definitionId) || fallbackTrendPalette[definitionId] || DEFAULT_TREND_START_COLOR;
          }
      
          function applyTrendColorToDataset(dataset, definitionId) {
            if (!dataset) {
              return dataset;
            }
      
            if (definitionId === 'total') {
              const chart = state.charts.trend;
              const ctx = chart?.ctx || document.getElementById('trendChart')?.getContext('2d');
              const startHex = sanitizeHexColor(state.trendColorPreference?.start) || DEFAULT_TREND_START_COLOR;
              const endHex = sanitizeHexColor(state.trendColorPreference?.end) || DEFAULT_TREND_END_COLOR;
              if (ctx) {
                const width = chart?.chartArea ? Math.max(1, chart.chartArea.right - chart.chartArea.left) : (chart?.width || ctx.canvas.width || ctx.canvas.clientWidth || 1);
                const height = chart?.chartArea ? Math.max(1, chart.chartArea.bottom - chart.chartArea.top) : (chart?.height || ctx.canvas.height || ctx.canvas.clientHeight || 1);
                const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
                lineGradient.addColorStop(0, startHex);
                lineGradient.addColorStop(1, endHex);
                dataset.borderColor = lineGradient;
                dataset.pointBorderColor = endHex;
                dataset.pointHoverBorderColor = endHex;
                dataset.pointHoverBackgroundColor = endHex;
      
                const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
                const startFill = hexToRgba(startHex, 0.2) || startHex;
                const endFill = hexToRgba(endHex, 0.05) || endHex;
                fillGradient.addColorStop(0, startFill);
                fillGradient.addColorStop(1, endFill);
                dataset.backgroundColor = fillGradient;
              } else {
                dataset.borderColor = endHex;
                dataset.pointBorderColor = endHex;
                dataset.pointHoverBorderColor = endHex;
                dataset.pointHoverBackgroundColor = endHex;
                dataset.backgroundColor = hexToRgba(endHex, 0.18) || endHex;
              }
              dataset.pointBackgroundColor = '#ffffff';
            } else {
              const paletteHex = getTrendColor(definitionId);
              dataset.borderColor = paletteHex;
              dataset.backgroundColor = 'transparent';
              dataset.pointBackgroundColor = dataset.pointBackgroundColor ?? '#ffffff';
              dataset.pointBorderColor = paletteHex;
              dataset.pointHoverBorderColor = paletteHex;
              dataset.pointHoverBackgroundColor = paletteHex;
            }
            return dataset;
          }

          function getPeriodUserCount(period) {
            if (!period) {
              return 0;
            }
            if (Number.isFinite(period.userCount)) {
              return period.userCount;
            }
            if (period.users instanceof Set) {
              return period.users.size;
            }
            return 0;
          }

          function getPeriodAdoptionRate(period) {
            if (!period) {
              return 0;
            }
            if (Number.isFinite(period.adoptionRate)) {
              return period.adoptionRate;
            }
            const active = getPeriodUserCount(period);
            const enabled = Number.isFinite(period.enabledUsersCount)
              ? period.enabledUsersCount
              : (period.enabledUsers instanceof Set ? period.enabledUsers.size : 0);
            if (!enabled || !active) {
              return 0;
            }
            return (active / enabled) * 100;
          }

          function adjustTrendValueForView(rawValue, period, definition) {
            const numeric = Number.isFinite(rawValue) ? rawValue : 0;
            if (state.filters.metric === "adoption") {
              return numeric;
            }
            if (state.trendView === "average" && (!definition || definition.supportsAverage !== false)) {
              const count = getPeriodUserCount(period);
              if (!count) {
                return 0;
              }
              return numeric / count;
            }
            return numeric;
          }

          function normalizeTrendValue(value) {
            if (!Number.isFinite(value)) {
              return 0;
            }
            if (Math.abs(value) < 1e-4) {
              return 0;
            }
            return value;
          }

          function formatTrendFixed(value, digits) {
            if (!Number.isFinite(value)) {
              return "0";
            }
            return Number(value.toFixed(digits)).toString();
          }

          function formatTrendAxisTick(value) {
            const numeric = normalizeTrendValue(value);
            if (state.filters.metric === "adoption") {
              const abs = Math.abs(numeric);
              const digits = abs >= 10 ? 1 : (abs >= 1 ? 1 : 2);
              return `${formatTrendFixed(numeric, digits)}%`;
            }
            if (state.trendView === "average") {
              if (state.filters.metric === "hours") {
                const abs = Math.abs(numeric);
                if (abs >= 10) {
                  return formatTrendFixed(numeric, 1);
                }
                return formatTrendFixed(numeric, abs >= 1 ? 2 : 3);
              }
              const abs = Math.abs(numeric);
              if (abs >= 1000) {
                return numberFormatter.format(Math.round(numeric));
              }
              if (abs >= 100) {
                return formatTrendFixed(numeric, 0);
              }
              if (abs >= 1) {
                return formatTrendFixed(numeric, abs >= 10 ? 1 : 2);
              }
              return formatTrendFixed(numeric, 3);
            }
            if (state.filters.metric === "hours") {
              return hoursFormatter.format(numeric);
            }
            return numberFormatter.format(numeric);
          }

          function formatTrendTooltipValue(value) {
            const numeric = normalizeTrendValue(value);
            if (state.filters.metric === "adoption") {
              const abs = Math.abs(numeric);
              const digits = abs >= 10 ? 1 : (abs >= 1 ? 1 : 2);
              return `${formatTrendFixed(numeric, digits)}%`;
            }
            if (state.trendView === "average") {
              if (state.filters.metric === "hours") {
                const abs = Math.abs(numeric);
                if (abs >= 10) {
                  return formatTrendFixed(numeric, 1);
                }
                return formatTrendFixed(numeric, abs >= 1 ? 2 : 3);
              }
              const abs = Math.abs(numeric);
              if (abs >= 1000) {
                return numberFormatter.format(Math.round(numeric));
              }
              if (abs >= 100) {
                return formatTrendFixed(numeric, 0);
              }
              if (abs >= 10) {
                return formatTrendFixed(numeric, 1);
              }
              if (abs >= 1) {
                return formatTrendFixed(numeric, 2);
              }
              return formatTrendFixed(numeric, 3);
            }
            if (state.filters.metric === "hours") {
              return hoursFormatter.format(numeric);
            }
            return numberFormatter.format(Math.round(numeric));
          }

          function getTrendUnitLabel() {
            if (state.filters.metric === "adoption") {
              return "% active users";
            }
            const metricIsHours = state.filters.metric === "hours";
            if (state.trendView === "average") {
              return metricIsHours ? "hours per user" : "actions per user";
            }
            return metricIsHours ? "hours" : "actions";
          }

          function createTrendChartOptions() {
            return {
              responsive: true,
              maintainAspectRatio: false,
              layout: {
                padding: {
                  top: 12,
                  bottom: 18,
                  left: 8,
                  right: 12
                }
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: {
                    color: "var(--grey-600)",
                    maxRotation: 0,
                    autoSkip: true
                  }
                },
                y: {
                  beginAtZero: true,
                  grid: {
                    color: "rgba(153, 208, 153, 0.18)",
                    drawBorder: false
                  },
                  ticks: {
                    color: "var(--grey-600)",
                    callback: value => formatTrendAxisTick(value)
                  }
                }
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: "rgba(31, 35, 37, 0.92)",
                  titleColor: "#ffffff",
                  bodyColor: "#ffffff",
                  padding: 12,
                  cornerRadius: 10,
                  displayColors: false,
                  callbacks: {
                    label: context => {
                      const datasetLabel = context.dataset && context.dataset.label ? context.dataset.label : "Value";
                      const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                      const formattedValue = formatTrendTooltipValue(value);
                      const unit = state.filters.metric === "adoption" ? "" : getTrendUnitLabel();
                      return unit ? `${datasetLabel}: ${formattedValue} ${unit}` : `${datasetLabel}: ${formattedValue}`;
                    },
                    afterBody: contexts => {
                      if (state.trendView !== "average") {
                        return;
                      }
                      if (!Array.isArray(contexts) || !contexts.length) {
                        return;
                      }
                      const index = contexts[0]?.dataIndex;
                      if (index == null) {
                        return;
                      }
                      const periods = Array.isArray(state.latestTrendPeriods) ? state.latestTrendPeriods : [];
                      const period = periods[index];
                      if (!period) {
                        return;
                      }
                      const enabled = Number.isFinite(period.enabledUsersCount) ? period.enabledUsersCount : 0;
                      return [`Enabled users: ${numberFormatter.format(enabled)}`];
                    }
                  }
                }
              },
              interaction: {
                mode: "index",
                intersect: false
              }
            };
          }
      
          const trendCtx = document.getElementById("trendChart").getContext("2d");
          state.charts.trend = new Chart(trendCtx, {
            type: "line",
            data: {
              labels: [],
              datasets: []
            },
            options: createTrendChartOptions()
          });
      
          const usageTrendCtx = dom.usageTrendCanvas?.getContext("2d");
          if (usageTrendCtx) {
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            const frequentColor = getCssVariableValue("--green-600", "#008A00");
            const consistentColor = getCssVariableValue("--blue-500", "#3A84C1");
            state.charts.usageTrend = new Chart(usageTrendCtx, {
              type: "line",
              data: {
                labels: [],
                datasets: [
                  {
                    label: "Frequent usage",
                    data: [],
                    borderColor: frequentColor,
                    backgroundColor: hexToRgba(colorStringToHex(frequentColor) || "#008A00", 0.12) || "rgba(0,138,0,0.12)",
                    tension: 0.28,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false
                  },
                  {
                    label: "Consistent usage",
                    data: [],
                    borderColor: consistentColor,
                    backgroundColor: hexToRgba(colorStringToHex(consistentColor) || "#3A84C1", 0.12) || "rgba(58,132,193,0.12)",
                    tension: 0.28,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => numberFormatter.format(value)
                    }
                  }
                },
                plugins: {
                  legend: {
                    display: true,
                    position: "top"
                  },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: true,
                    callbacks: {
                      label: context => {
                        const mode = state.usageTrendMode || "number";
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        if (mode === "percentage") {
                          return `${context.dataset.label}: ${value.toFixed(1)}%`;
                        }
                        return `${context.dataset.label}: ${numberFormatter.format(value)} users`;
                      }
                    }
                  }
                },
                interaction: {
                  mode: "index",
                  intersect: false
                }
              }
            });
          }
      
          function parseAgentUsageText(csvText, meta = {}) {
            if (typeof csvText !== "string" || !csvText.trim()) {
              return;
            }
            if (dom.agentEmpty) {
              dom.agentEmpty.hidden = true;
            }
            Papa.parse(csvText, {
              header: true,
              skipEmptyLines: true,
              complete: results => {
                const { resolvedFields, missingColumns } = resolveAgentFieldMapping(results?.meta?.fields);
                if (missingColumns.length) {
                  updateAgentUsageCard([]);
                  if (dom.agentStatus) {
                    dom.agentStatus.textContent = `Saved agent dataset is missing required columns: ${missingColumns.join(", ")}.`;
                  }
                  if (dom.agentEmpty) {
                    dom.agentEmpty.hidden = false;
                    dom.agentEmpty.textContent = "Saved agent dataset is incomplete.";
                  }
                  return;
                }
                const { rows, skipped } = buildAgentRows(results.data, resolvedFields);
                const applied = ingestAgentUsageRows(rows, {
                  sourceName: meta.name || meta.sourceName,
                  size: meta.size,
                  lastModified: meta.lastModified,
                  savedAt: meta.savedAt
                }, skipped);
                if (applied && rows.length) {
                  rememberLastAgentDataset(csvText, {
                    name: meta.name || meta.sourceName,
                    size: meta.size,
                    rows: rows.length,
                    lastModified: meta.lastModified,
                    savedAt: meta.savedAt
                  });
                }
              },
              error: error => {
                const message = error && error.message ? error.message : "Unknown error";
                logError("Saved agent CSV parse failed", error);
                updateAgentUsageCard([]);
                if (dom.agentStatus) {
                  dom.agentStatus.textContent = `Saved agent dataset could not be parsed (${message}).`;
                }
                if (dom.agentEmpty) {
                  dom.agentEmpty.hidden = false;
                  dom.agentEmpty.textContent = "Unable to restore the agent usage dataset.";
                }
              }
            });
          }
      
          const enabledLicensesValuePlugin = {
            id: "enabledLicensesValuePlugin",
            afterDatasetsDraw(chart) {
              const { ctx, data } = chart;
              if (!ctx || !data || !data.datasets || !data.datasets.length) {
                return;
              }
              const meta = chart.getDatasetMeta(0);
              if (!meta || !meta.data) {
                return;
              }
              if (state.showEnabledLicenseLabels === false) {
                return;
              }
              ctx.save();
              ctx.font = `600 12px "Inter", "Inter var", system-ui, -apple-system, "Segoe UI", sans-serif`;
              ctx.fillStyle = getCssVariableValue("--text-body", "#1f2325");
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";
              meta.data.forEach((element, index) => {
                if (!element || typeof element.x !== "number" || typeof element.y !== "number") {
                  return;
                }
                const value = data.datasets[0]?.data?.[index];
                if (!Number.isFinite(value)) {
                  return;
                }
                const formatted = numberFormatter.format(Math.round(value));
                ctx.fillText(formatted, element.x, element.y - 8);
              });
              ctx.restore();
            }
          };
      
          const enabledLicensesCtx = dom.enabledLicensesCanvas?.getContext("2d");
          if (enabledLicensesCtx) {
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            state.charts.enabledLicenses = new Chart(enabledLicensesCtx, {
              type: "bar",
              data: {
                labels: [],
                datasets: [{
                  label: "Enabled users",
                  data: [],
                  backgroundColor: context => getEnabledLicensesFill(context),
                  hoverBackgroundColor: context => getEnabledLicensesFill(context),
                  borderColor: context => getEnabledLicensesBorderColor(),
                  hoverBorderColor: context => getEnabledLicensesBorderColor(),
                  borderWidth: 1,
                  borderRadius: 8,
                  borderSkipped: false,
                  maxBarThickness: 46
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => numberFormatter.format(value)
                    }
                  }
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        return `${numberFormatter.format(value)} enabled users`;
                      }
                    }
                  }
                }
              },
              plugins: [enabledLicensesValuePlugin]
            });
            updateEnabledLicensesColorInputs();
          }
      
          const returningUsersCtx = document.querySelector("[data-returning-chart]")?.getContext("2d");
          if (returningUsersCtx) {
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            const lineColor = getCssVariableValue("--blue-500", "#3A84C1");
            const fillColor = hexToRgba(colorStringToHex(lineColor) || "#3A84C1", 0.15) || "rgba(58, 132, 193, 0.15)";
            state.charts.returningUsers = new Chart(returningUsersCtx, {
              type: "line",
              data: {
                labels: [],
                datasets: [{
                  label: "Returning users",
                  data: [],
                  borderColor: lineColor,
                  backgroundColor: fillColor,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  pointBackgroundColor: "#ffffff",
                  tension: 0.24,
                  fill: false
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => state.returningMetric === "percentage"
                        ? `${Number(value).toFixed(0)}%`
                        : numberFormatter.format(value)
                    }
                  }
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        if (state.returningMetric === "percentage") {
                          return `${value.toFixed(1)}% returning`;
                        }
                        return `${numberFormatter.format(value)} returning users`;
                      }
                    }
                  }
                },
                interaction: {
                  mode: "index",
                  intersect: false
                }
              }
            });
          }
      
          applyChartThemeStyles();
      
          function applyChartThemeStyles() {
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            refreshEnabledLicensesThemeColors();
            const charts = [
              state.charts.trend,
              ...state.charts.usageFrequency.values(),
              ...state.charts.usageConsistency.values(),
              state.charts.usageTrend,
              state.charts.returningUsers,
              state.charts.enabledLicenses
            ];
            charts.forEach(chart => {
              if (!chart || !chart.options || !chart.options.scales) {
                return;
              }
              const { scales } = chart.options;
              if (scales.x && scales.x.ticks) {
                scales.x.ticks.color = axisTickColor;
              }
              if (scales.y && scales.y.ticks) {
                scales.y.ticks.color = axisTickColor;
              }
              if (scales.x && scales.x.grid && typeof scales.x.grid.color !== "undefined" && scales.x.grid.display !== false) {
                scales.x.grid.color = axisGridColor;
              }
              if (scales.y && scales.y.grid) {
                scales.y.grid.color = axisGridColor;
              }
              chart.update("none");
            });
          }
      
          function setTrendColorInputs(startHex, endHex) {
            if (dom.trendColorStart) {
              dom.trendColorStart.value = sanitizeHexColor(startHex) || DEFAULT_TREND_START_COLOR;
            }
            if (dom.trendColorEnd) {
              dom.trendColorEnd.value = sanitizeHexColor(endHex) || DEFAULT_TREND_END_COLOR;
            }
          }
      
          function persistTrendGradient(startHex, endHex) {
            if (!window.localStorage) {
              return;
            }
            try {
              localStorage.setItem(TREND_COLOR_STORAGE_KEY, JSON.stringify({ start: startHex, end: endHex }));
            } catch (error) {
              logWarn("Unable to persist trend colors", error);
            }
          }
      
          function clearStoredTrendGradient() {
            if (!window.localStorage) {
              return;
            }
            try {
              localStorage.removeItem(TREND_COLOR_STORAGE_KEY);
            } catch (error) {
              logWarn("Unable to clear stored trend colors", error);
            }
          }
      
          function refreshTrendColors() {
            if (state.charts.trend && Array.isArray(state.latestTrendPeriods) && state.latestTrendPeriods.length) {
              updateTrendChart(state.latestTrendPeriods);
            }
          }
      
          function setTrendColorControlsVisibility(isVisible) {
            if (dom.trendColorControls) {
              dom.trendColorControls.hidden = !isVisible;
            }
          }
      
          function applyTrendGradient(startHex, endHex, { persist = true } = {}) {
            const start = sanitizeHexColor(startHex);
            const end = sanitizeHexColor(endHex);
            if (!start || !end) {
              throw new Error("invalid-hex");
            }
            state.trendColorPreference = { start, end };
            setTrendColorInputs(start, end);
            if (persist) {
              persistTrendGradient(start, end);
            }
            refreshTrendColors();
          }
      
          function resetTrendGradient({ persist = true } = {}) {
            state.trendColorPreference = { start: null, end: null };
            setTrendColorInputs(DEFAULT_TREND_START_COLOR, DEFAULT_TREND_END_COLOR);
            if (persist) {
              clearStoredTrendGradient();
            }
            refreshTrendColors();
          }
      
          function loadStoredTrendGradient() {
            if (!window.localStorage) {
              resetTrendGradient({ persist: false });
              return;
            }
            try {
              const raw = localStorage.getItem(TREND_COLOR_STORAGE_KEY);
              if (!raw) {
                resetTrendGradient({ persist: false });
                return;
              }
              const parsed = JSON.parse(raw);
              const start = sanitizeHexColor(parsed?.start);
              const end = sanitizeHexColor(parsed?.end);
              if (start && end) {
                applyTrendGradient(start, end, { persist: false });
                return;
              }
            } catch (error) {
              logWarn("Unable to load stored trend colors", error);
            }
            resetTrendGradient({ persist: false });
          }
      
          if (dom.trendColorHint && !window.localStorage) {
            dom.trendColorHint.textContent = "Color choices reset when you refresh this browser.";
          }
      
          if (dom.applyTrendColors) {
            dom.applyTrendColors.addEventListener('click', () => {
              try {
                applyTrendGradient(dom.trendColorStart?.value || DEFAULT_TREND_START_COLOR, dom.trendColorEnd?.value || DEFAULT_TREND_END_COLOR);
              } catch (error) {
                logError('Unable to update trend colors', error);
                alert('Could not update colors. Please choose valid hex colors.');
              }
            });
          }
      
          if (dom.resetTrendColors) {
            dom.resetTrendColors.addEventListener('click', () => {
              resetTrendGradient();
            });
          }
      
          setTrendColorInputs(DEFAULT_TREND_START_COLOR, DEFAULT_TREND_END_COLOR);
          loadPersistencePreference();
          const sharedThemeId = normalizeThemeId(document.documentElement.getAttribute("data-tools-theme") || "");
          const storedTheme = (THEME_BY_ID.has(sharedThemeId) ? sharedThemeId : null) || loadStoredThemePreference();
          applyTheme(storedTheme || state.theme, { persist: false });

          if (document.documentElement.hasAttribute("data-tools-theme")) {
            window.addEventListener("chansenThemeChange", (event) => {
              const nextTheme = normalizeThemeId(event?.detail?.themeId || "");
              if (!THEME_BY_ID.has(nextTheme)) {
                return;
              }
              applyTheme(nextTheme, { persist: false });
              renderDashboard();
            });
          }
          loadStoredTrendGradient();
          loadStoredDatasetFromDevice();
          loadStoredAgentDatasetFromDevice();
          loadStoredAgentHubDatasetsFromDevice();
          if (window.__COPILOT_EMBED_OPTIONS__) {
            bootstrapEmbeddedSnapshot(window.__COPILOT_EMBED_OPTIONS__);
          }

          initializeSeriesToggles();
          updateSeriesToggleState();
          updateCustomRangeVisibility();
      
          if (dom.seriesModeToggle) {
            dom.seriesModeToggle.addEventListener("click", () => {
              state.seriesDetailMode = state.seriesDetailMode === "none" ? "respect" : "none";
              updateSeriesDetailModeButton();
              updateExportDetailOption();
              renderDashboard();
            });
          }
      
          if (dom.themeToggle) {
            dom.themeToggle.addEventListener("click", event => {
              event.preventDefault();
              toggleThemeMenu();
            });
          }

          if (dom.themeMenuClose) {
            dom.themeMenuClose.addEventListener("click", event => {
              event.preventDefault();
              closeThemeMenu();
            });
          }

          if (dom.themeOptions && dom.themeOptions.length) {
            dom.themeOptions.forEach(option => {
              option.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                const selected = option.getAttribute("data-theme");
                if (!selected) {
                  return;
                }
                applyTheme(selected);
                
                // Show/hide custom theme editor
                if (dom.customThemeEditor) {
                  dom.customThemeEditor.classList.toggle('is-visible', selected === 'custom');
                }
                
                // Don't close menu for custom theme - let user pick colors
                if (selected !== 'custom') {
                  closeThemeMenu();
                }
                renderDashboard();
              });
            });
          }
          
          // Custom theme color pickers
          function setupCustomColorInput(input, colorKey) {
            if (!input) return;
            const colors = loadCustomThemeColors();
            input.value = colors[colorKey];
            input.addEventListener('input', () => {
              const currentColors = loadCustomThemeColors();
              currentColors[colorKey] = input.value;
              saveCustomThemeColors(currentColors);
              if (state.theme === 'custom') {
                applyCustomThemeColors();
                renderDashboard();
              }
            });
          }
          
          setupCustomColorInput(dom.customAccentInput, 'accent');
          setupCustomColorInput(dom.customBgInput, 'bg');
          setupCustomColorInput(dom.customTextInput, 'text');
          
          // Show custom editor if custom theme is active on load
          if (dom.customThemeEditor && state.theme === 'custom') {
            dom.customThemeEditor.classList.add('is-visible');
          }

          document.addEventListener("click", event => {
            if (!dom.themeMenu || dom.themeMenu.hasAttribute("hidden")) {
              return;
            }
            const target = event.target;
            if (!(target instanceof Node)) {
              return;
            }
            if (dom.themeMenu.contains(target) || (dom.themeToggle && dom.themeToggle.contains(target))) {
              return;
            }
            closeThemeMenu();
          });

          document.addEventListener("keydown", event => {
            if (event.key !== "Escape") {
              return;
            }
            closeThemeMenu();
          });

          window.addEventListener("resize", () => {
            if (!dom.themeMenu || dom.themeMenu.hasAttribute("hidden")) {
              return;
            }
            positionThemeMenu();
          });

          window.addEventListener("scroll", () => {
            if (!dom.themeMenu || dom.themeMenu.hasAttribute("hidden")) {
              return;
            }
            positionThemeMenu();
          }, { passive: true });

          if (dom.floatingThemeToggle) {
            dom.floatingThemeToggle.addEventListener("click", () => {
              const nextTheme = isDarkTheme(state.theme)
                ? loadLastThemeForScheme("light")
                : loadLastThemeForScheme("dark");
              applyTheme(nextTheme);
              renderDashboard();
            });
          }
      
          dom.fileInput.addEventListener("change", event => {
            const files = event.target.files || [];
            const file = files[0];
            if (file) {
              handleFile(file);
              event.target.value = "";
            }
          });
      
          if (dom.uploadCancel) {
            dom.uploadCancel.disabled = true;
            dom.uploadCancel.setAttribute("aria-disabled", "true");
            dom.uploadCancel.addEventListener("click", event => {
              event.preventDefault();
              cancelActiveParse({ silent: false });
            });
          }
      
          if (dom.loadSampleButton) {
            dom.loadSampleButton.addEventListener("click", event => {
              event.preventDefault();
              loadSampleDataset();
            });
          }
      
          if (dom.resetFiltersButton) {
            dom.resetFiltersButton.addEventListener("click", event => {
              event.preventDefault();
              resetFiltersToDefault();
            });
          }
      
          if (dom.persistConsent) {
            dom.persistConsent.addEventListener("change", () => {
              const enabled = Boolean(dom.persistConsent.checked);
              state.persistDatasets = enabled;
              persistPersistencePreference(enabled);
              if (!enabled) {
                clearStoredDataset({ quiet: true, keepRuntime: true });
                updateStoredDatasetControls(null);
              } else {
                // When persistence is toggled back on, immediately hydrate from any existing cache so users do not need to re-upload large CSVs.
                if (lastParsedCsvText) {
                  persistDataset(lastParsedCsvText, lastParsedCsvMeta || {});
                } else {
                  loadStoredDatasetFromDevice();
                }
                if (lastParsedAgentCsvText) {
                  persistAgentDataset(lastParsedAgentCsvText, lastParsedAgentMeta || {});
                } else {
                  loadStoredAgentDatasetFromDevice();
                }
                const hasAgentHubData = AGENT_HUB_TYPES.some(type => {
                  const dataset = state.agentHub?.datasets?.[type];
                  return Array.isArray(dataset?.rows) && dataset.rows.length;
                });
                if (hasAgentHubData) {
                  persistAgentHubSnapshot();
                } else {
                  loadStoredAgentHubDatasetsFromDevice();
                }
              }
            });
          }
      
          dom.dropZone.addEventListener("dragover", event => {
            event.preventDefault();
            dom.dropZone.classList.add("is-dragover");
          });
      
          dom.dropZone.addEventListener("dragleave", () => {
            dom.dropZone.classList.remove("is-dragover");
          });
      
          dom.dropZone.addEventListener("drop", event => {
            event.preventDefault();
            dom.dropZone.classList.remove("is-dragover");
            const transferFiles = (event.dataTransfer && event.dataTransfer.files) || [];
            const file = transferFiles[0];
            if (file) {
              handleFile(file);
            }
          });
          initializeAgentHub();
          if (dom.organizationFieldSelect) {
            dom.organizationFieldSelect.addEventListener("change", () => {
              state.filterFields.organization = resolveFilterFieldChoice("organization", dom.organizationFieldSelect.value);
              refreshFilterOptionsFromFieldSelection();
              renderDashboard();
              persistFilterPreferences();
            });
          }
          if (dom.countryFieldSelect) {
            dom.countryFieldSelect.addEventListener("change", () => {
              state.filterFields.country = resolveFilterFieldChoice("country", dom.countryFieldSelect.value);
              refreshFilterOptionsFromFieldSelection();
              renderDashboard();
              persistFilterPreferences();
            });
          }
          dom.organizationFilter.addEventListener("change", () => {
            const selections = extractMultiSelectValues(dom.organizationFilter);
            state.filters.organization = new Set(selections);
            syncMultiSelect(dom.organizationFilter, state.filters.organization);
            debouncedRenderDashboard();
          });

          dom.countryFilter.addEventListener("change", () => {
            const selections = extractMultiSelectValues(dom.countryFilter);
            state.filters.country = new Set(selections);
            syncMultiSelect(dom.countryFilter, state.filters.country);
            debouncedRenderDashboard();
          });
          
          // Sticky filter bar - appears after scrolling past control panel
          if (dom.controlPanel && dom.stickyFilterBar && dom.stickyFilterDropdown) {
            dom.stickyFilterBar.hidden = false; // Enable but keep invisible via CSS
            dom.stickyFilterDropdown.hidden = false;

            const updateFloatingThemeToggleOffset = () => {
              if (!dom.floatingThemeToggle) {
                return;
              }
              const baseOffset = 16;
              let topOffset = baseOffset;
              if (dom.stickyFilterBar.classList.contains("is-visible")) {
                const barHeight = dom.stickyFilterBar.getBoundingClientRect().height || dom.stickyFilterBar.offsetHeight || 0;
                if (barHeight) {
                  topOffset = Math.round(barHeight + baseOffset);
                }
              }
              document.documentElement.style.setProperty("--floating-theme-toggle-top", `${topOffset}px`);
            };
            
            // Clone filter controls into dropdown (excluding active-filters-summary)
            const cloneFilters = () => {
              dom.stickyFilterDropdown.innerHTML = "";
              const stripDuplicateIds = root => {
                root.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
                root.querySelectorAll("label[for]").forEach(el => el.removeAttribute("for"));
              };
              const controls = dom.controlPanel.querySelectorAll(".control-select");
              controls.forEach(control => {
                const clone = control.cloneNode(true);
                stripDuplicateIds(clone);
                dom.stickyFilterDropdown.appendChild(clone);
              });
              
              // Sync cloned selects with originals
              const syncClonedFilters = () => {
                const clonedOrg = dom.stickyFilterDropdown.querySelector("[data-filter-organization]");
                const clonedCountry = dom.stickyFilterDropdown.querySelector("[data-filter-country]");
                const clonedTimeframe = dom.stickyFilterDropdown.querySelector("[data-filter-timeframe]");
                
                if (clonedOrg && dom.organizationFilter) {
                  Array.from(clonedOrg.options).forEach((opt, i) => {
                    opt.selected = dom.organizationFilter.options[i]?.selected || false;
                  });
                  clonedOrg.addEventListener("change", () => {
                    Array.from(dom.organizationFilter.options).forEach((opt, i) => {
                      opt.selected = clonedOrg.options[i]?.selected || false;
                    });
                    dom.organizationFilter.dispatchEvent(new Event("change"));
                  });
                }
                
                if (clonedCountry && dom.countryFilter) {
                  Array.from(clonedCountry.options).forEach((opt, i) => {
                    opt.selected = dom.countryFilter.options[i]?.selected || false;
                  });
                  clonedCountry.addEventListener("change", () => {
                    Array.from(dom.countryFilter.options).forEach((opt, i) => {
                      opt.selected = clonedCountry.options[i]?.selected || false;
                    });
                    dom.countryFilter.dispatchEvent(new Event("change"));
                  });
                }
                
                if (clonedTimeframe && dom.timeframeFilter) {
                  clonedTimeframe.value = dom.timeframeFilter.value;
                  clonedTimeframe.addEventListener("change", () => {
                    dom.timeframeFilter.value = clonedTimeframe.value;
                    dom.timeframeFilter.dispatchEvent(new Event("change"));
                  });
                }
              };
              syncClonedFilters();
            };
            
            // Update summary text
            const updateStickyFilterSummary = () => {
              if (!dom.stickyFilterSummary) return;
              const orgCount = state.filters.organization.size;
              const countryCount = state.filters.country.size;
              const parts = [];
              if (orgCount > 0 && !state.filters.organization.has("all")) {
                parts.push(`${orgCount} org${orgCount > 1 ? "s" : ""}`);
              }
              if (countryCount > 0 && !state.filters.country.has("all")) {
                parts.push(`${countryCount} region${countryCount > 1 ? "s" : ""}`);
              }
              dom.stickyFilterSummary.textContent = parts.length ? parts.join(", ") + " selected" : "All data";
            };
            
            const stickyObserver = new IntersectionObserver(
              ([entry]) => {
                const shouldShow = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
                dom.stickyFilterBar.classList.toggle("is-visible", shouldShow);
                updateFloatingThemeToggleOffset();
                
                if (shouldShow) {
                  updateStickyFilterSummary();
                } else {
                  // Close dropdown when scrolling back up
                  dom.stickyFilterDropdown.classList.remove("is-open");
                  dom.stickyFilterBtn.classList.remove("is-open");
                  dom.stickyFilterBtn.textContent = `Show filters \u25BC`;
                }
              },
              { threshold: 0, rootMargin: "0px" }
            );
            stickyObserver.observe(dom.controlPanel);
            updateFloatingThemeToggleOffset();
            window.addEventListener("resize", updateFloatingThemeToggleOffset);
            
            // Toggle dropdown
            let dropdownInitialized = false;
            if (dom.stickyFilterBtn) {
              dom.stickyFilterBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const isOpen = dom.stickyFilterDropdown.classList.toggle("is-open");
                dom.stickyFilterBtn.classList.toggle("is-open", isOpen);
                dom.stickyFilterBtn.textContent = isOpen ? `Hide filters \u25B2` : `Show filters \u25BC`;
                
                if (isOpen && !dropdownInitialized) {
                  cloneFilters();
                  dropdownInitialized = true;
                }
              });
            }
            
            // Close dropdown when clicking outside
            document.addEventListener("click", (e) => {
              if (!dom.stickyFilterBar.contains(e.target)) {
                dom.stickyFilterDropdown.classList.remove("is-open");
                dom.stickyFilterBtn.classList.remove("is-open");
                dom.stickyFilterBtn.textContent = `Show filters \u25BC`;
              }
            });
          }
      
          dom.timeframeFilter.addEventListener("change", () => {
            state.filters.timeframe = dom.timeframeFilter.value;
            if (state.filters.timeframe === "custom") {
              ensureCustomRangeDefaults();
            } else {
              state.filters.customRangeInvalid = false;
            }
            updateCustomRangeVisibility();
            refreshFilterToggleStates();
            renderDashboard();
            persistFilterPreferences();
          });
      
          if (dom.customRangeStart) {
            dom.customRangeStart.addEventListener("change", () => {
              handleCustomRangeChange();
            });
          }
      
          if (dom.customRangeEnd) {
            dom.customRangeEnd.addEventListener("change", () => {
              handleCustomRangeChange();
            });
          }
      
          dom.aggregateFilter.addEventListener("change", () => {
            state.filters.aggregate = dom.aggregateFilter.value;
            refreshFilterToggleStates();
            renderDashboard();
            persistFilterPreferences();
          });

          dom.metricFilter.addEventListener("change", () => {
            state.filters.metric = dom.metricFilter.value;
            if (state.filters.metric === "adoption") {
              state.trendView = "total";
            }
            refreshFilterToggleStates();
            renderDashboard();
            persistFilterPreferences();
          });
      
          if (dom.trendViewButtons && dom.trendViewButtons.length) {
            dom.trendViewButtons.forEach(button => {
              button.addEventListener("click", () => {
                if (state.filters.metric === "adoption") {
                  return;
                }
                const view = button.dataset.trendView === "average" ? "average" : "total";
                if (state.trendView === view) {
                  return;
                }
                state.trendView = view;
                updateTrendViewToggleState();
                const periods = Array.isArray(state.latestTrendPeriods) ? state.latestTrendPeriods : [];
                if (periods.length) {
                  updateTrendCaptionText();
                }
                updateTrendChart(periods);
              });
            });
          }

          const handleUsageThresholdChange = () => {
            const normalized = normalizeUsageThresholdInputs(
              dom.usageThresholdMiddle ? dom.usageThresholdMiddle.value : undefined,
              dom.usageThresholdHigh ? dom.usageThresholdHigh.value : undefined
            );
            state.usageThresholds = normalized;
            syncUsageThresholdInputs();
            renderDashboard();
          };
      
          if (dom.usageThresholdMiddle) {
            dom.usageThresholdMiddle.addEventListener("change", handleUsageThresholdChange);
          }
      
          if (dom.usageThresholdHigh) {
            dom.usageThresholdHigh.addEventListener("change", handleUsageThresholdChange);
          }
      
          if (dom.returningMetric) {
            dom.returningMetric.addEventListener("change", () => {
              state.returningMetric = dom.returningMetric.value || "total";
              renderDashboard();
            });
          }
      
          dom.groupFilter.addEventListener("change", () => {
            state.filters.group = dom.groupFilter.value;
            refreshFilterToggleStates();
            renderDashboard();
            persistFilterPreferences();
          });
      
          if (dom.usageTrendToggleButtons && dom.usageTrendToggleButtons.length) {
            dom.usageTrendToggleButtons.forEach(button => {
              button.addEventListener("click", () => {
                const mode = button.dataset.usageTrendMode === "percentage" ? "percentage" : "number";
                if (state.usageTrendMode === mode) {
                  return;
                }
                state.usageTrendMode = mode;
                updateUsageTrendToggleState();
                updateUsageTrendChart(state.latestUsageMonths);
              });
            });
          }
      
          if (dom.returningMetricButtons && dom.returningMetricButtons.length) {
            dom.returningMetricButtons.forEach(button => {
              button.addEventListener("click", () => {
                const metric = button.dataset.returningMetricButton === "percentage" ? "percentage" : "total";
                if (state.returningMetric === metric) {
                  return;
                }
                state.returningMetric = metric;
                updateReturningMetricToggleState();
                renderDashboard();
              });
            });
          }
      
          if (dom.returningIntervalButtons && dom.returningIntervalButtons.length) {
            dom.returningIntervalButtons.forEach(button => {
              button.addEventListener("click", () => {
                const interval = button.dataset.returningInterval === "monthly" ? "monthly" : "weekly";
                if (state.returningInterval === interval) {
                  return;
                }
                state.returningInterval = interval;
                updateReturningIntervalToggleState();
                if (state.latestReturningAggregates) {
                  updateReturningUsers(state.latestReturningAggregates);
                } else {
                  updateReturningUsers(null);
                }
              });
            });
          }
      
          dom.viewMoreButton.addEventListener("click", () => {
            if (!state.latestGroupData || !Array.isArray(state.latestGroupData.groups)) {
              return;
            }
            state.groupsExpanded = !state.groupsExpanded;
            updateGroupTable(state.latestGroupData.groups, state.latestGroupData.totalMetricValue || 0);
          });
      
          if (dom.topUsersToggle) {
            dom.topUsersToggle.addEventListener("click", () => {
              if (!Array.isArray(state.latestTopUsers)) {
                return;
              }
              state.topUsersExpanded = !state.topUsersExpanded;
              buildTopUsersList(state.latestTopUsers);
            });
          }

          if (dom.topUsersPanelToggle) {
            dom.topUsersPanelToggle.addEventListener("click", () => {
              const hasUsers = Array.isArray(state.latestTopUsers) && state.latestTopUsers.length > 0;
              if (!hasUsers) {
                return;
              }
              state.topUsersPanelOpen = !state.topUsersPanelOpen;
              updateTopUsersPanelAvailability(hasUsers);
            });
          }
      
          if (dom.adoptionToggle) {
            dom.adoptionToggle.addEventListener("click", () => {
              if (!state.latestAdoption) {
                return;
              }
              state.adoptionShowDetails = !state.adoptionShowDetails;
              updateAdoptionByApp(state.latestAdoption);
            });
          }
      
          if (dom.activeDaysToggleButtons && dom.activeDaysToggleButtons.length) {
            dom.activeDaysToggleButtons.forEach(button => {
              button.addEventListener("click", () => {
                const view = button.dataset.activeDaysView === "prompts" ? "prompts" : "users";
                if (state.activeDaysView === view) {
                  return;
                }
                state.activeDaysView = view;
                updateActiveDaysToggleState();
                updateActiveDaysCard(state.latestActiveDays);
              });
            });
          }
      
          if (dom.agentUploadButton && dom.agentFileInput) {
            dom.agentUploadButton.addEventListener("click", () => {
              dom.agentFileInput.click();
            });
            dom.agentFileInput.addEventListener("change", event => {
              handleAgentFileSelection(event);
            });
          }
      
          if (dom.agentViewToggle) {
            dom.agentViewToggle.addEventListener("click", () => {
              const total = Array.isArray(state.agentUsageRows) ? state.agentUsageRows.length : 0;
              if (!total) {
                state.agentDisplayLimit = 5;
                updateAgentUsageCard(state.agentUsageRows);
                return;
              }
              if (!Number.isFinite(state.agentDisplayLimit) || state.agentDisplayLimit >= total) {
                state.agentDisplayLimit = 5;
              } else {
                const increment = 50;
                const nextLimit = (state.agentDisplayLimit || 5) + increment;
                state.agentDisplayLimit = Math.min(total, nextLimit);
                if (state.agentDisplayLimit >= total) {
                  state.agentDisplayLimit = total;
                }
              }
              updateAgentUsageCard(state.agentUsageRows);
            });
          }
      
          if (dom.agentViewAll) {
            dom.agentViewAll.addEventListener("click", () => {
              const total = Array.isArray(state.agentUsageRows) ? state.agentUsageRows.length : 0;
              if (!total) {
                state.agentDisplayLimit = 5;
              } else {
                state.agentDisplayLimit = Infinity;
              }
              updateAgentUsageCard(state.agentUsageRows);
            });
          }
      
          if (dom.agentSortButtons && dom.agentSortButtons.length) {
            dom.agentSortButtons.forEach(button => {
              button.addEventListener("click", () => {
                const column = button.dataset.agentSort;
                if (!column) {
                  return;
                }
                const current = state.agentSort || { column: "responses", direction: "desc" };
                let direction;
                if (current.column === column) {
                  direction = current.direction === "asc" ? "desc" : "asc";
                } else {
                  direction = column === "name" || column === "creatorType" ? "asc" : "desc";
                }
                state.agentSort = { column, direction };
                updateAgentUsageCard(state.agentUsageRows);
              });
            });
          }
      
          if (dom.clearStoredDataset) {
            dom.clearStoredDataset.addEventListener('click', () => {
              clearStoredDataset();
            });
          }
      
          if (dom.exportTrigger && dom.exportMenu) {
            dom.exportTrigger.addEventListener("click", event => {
              event.stopPropagation();
              toggleExportMenu();
            });
            dom.exportMenu.addEventListener("click", event => {
              event.stopPropagation();
            });
          }
      
          if (dom.exportIncludeDetails) {
            dom.exportIncludeDetails.checked = state.exportPreferences.includeDetails !== false;
            dom.exportIncludeDetails.addEventListener("change", () => {
              state.exportPreferences.includeDetails = dom.exportIncludeDetails.checked;
              updateExportDetailOption();
            });
          }
          updateExportDetailOption();

          if (dom.postUploadExport) {
            dom.postUploadExport.addEventListener("click", () => {
              openExportMenuFromCta();
            });
          }
          updatePostUploadCtaVisibility();
      
          if (dom.exportPDF) {
            dom.exportPDF.addEventListener("click", () => {
              void exportDashboardToPDF();
            });
          }

          if (dom.exportCSV) {
            dom.exportCSV.addEventListener("click", () => {
              void exportTrendDataToCsv();
            });
          }
      
          if (dom.exportPNG) {
            dom.exportPNG.addEventListener("click", () => {
              void exportChartAsPNG();
            });
          }
      
          if (dom.exportVideo) {
            dom.exportVideo.addEventListener("click", () => {
              void exportChartAnimation();
            });
          }
      
          if (dom.exportExcel) {
            dom.exportExcel.addEventListener("click", () => {
              void exportTrendTotalsToExcel();
            });
          }

          if (dom.exportExcelFull) {
            dom.exportExcelFull.addEventListener("click", () => {
              void exportFullReportToExcel();
            });
          }
          if (dom.enabledLicensesExportTrigger && dom.enabledLicensesExportMenu) {
            dom.enabledLicensesExportTrigger.addEventListener("click", event => {
              event.stopPropagation();
              toggleEnabledLicensesExportMenu();
            });
            dom.enabledLicensesExportMenu.addEventListener("click", event => {
              event.stopPropagation();
            });
          }
      
          if (dom.enabledLicensesExportTransparent) {
            dom.enabledLicensesExportTransparent.addEventListener("click", () => {
              exportEnabledLicensesChart({ backgroundColor: null, fileSuffix: "transparent" });
            });
          }
      
          if (dom.enabledLicensesExportWhite) {
            dom.enabledLicensesExportWhite.addEventListener("click", () => {
              exportEnabledLicensesChart({ backgroundColor: "#FFFFFF", fileSuffix: "white-bg" });
            });
          }
      
          if (dom.enabledLicensesExportNoValues) {
            dom.enabledLicensesExportNoValues.addEventListener("click", () => {
              exportEnabledLicensesChart({ includeValues: false, fileSuffix: "no-values" });
            });
          }
      
          if (dom.enabledLicensesApply) {
            dom.enabledLicensesApply.addEventListener("click", () => {
              applyEnabledLicensesColorSelection();
            });
          }
      
          if (dom.enabledLicensesReset) {
            dom.enabledLicensesReset.addEventListener("click", () => {
              resetEnabledLicensesColors();
            });
          }
      
          if (dom.enabledLicensesGradientToggle && dom.enabledLicensesColorEnd) {
            dom.enabledLicensesGradientToggle.addEventListener("change", () => {
              dom.enabledLicensesColorEnd.disabled = !dom.enabledLicensesGradientToggle.checked;
            });
          }
      
          if (dom.enabledLicensesShowValues) {
            dom.enabledLicensesShowValues.addEventListener("change", () => {
              state.showEnabledLicenseLabels = dom.enabledLicensesShowValues.checked;
              updateEnabledLicensesChart(state.latestEnabledTimeline);
            });
          }
          updateEnabledLicensesColorInputs();

          setupSnapshotControls();
      
          document.addEventListener("click", event => {
            if (dom.exportControls && dom.exportMenu && !dom.exportMenu.hidden && !dom.exportControls.contains(event.target)) {
              closeExportMenu();
            }
            if (dom.enabledLicensesExportControls && dom.enabledLicensesExportMenu && !dom.enabledLicensesExportMenu.hidden && !dom.enabledLicensesExportControls.contains(event.target)) {
              closeEnabledLicensesExportMenu();
            }
          });
      
          document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
              closeExportMenu();
              closeEnabledLicensesExportMenu();
            }
          });
      
          renderDashboard();
      
          function updateStoredDatasetControls(meta) {
            if (!dom.storageControls) {
              return;
            }
            const consentGiven = Boolean(state.persistDatasets);
            if (dom.persistConsent) {
              dom.persistConsent.checked = consentGiven;
            }
            if (dom.clearStoredDataset) {
              dom.clearStoredDataset.hidden = !consentGiven || !meta;
            }
            if (dom.storageHint) {
              if (!consentGiven) {
                dom.storageHint.textContent = "Datasets stay in this session only. Opt in above to keep them on this device.";
              } else if (meta) {
                const parts = [];
                if (meta.name) {
                  parts.push(shortenLabel(meta.name, 36));
                }
                const rowsValue = Number(meta.rows);
                if (Number.isFinite(rowsValue)) {
                  parts.push(`${numberFormatter.format(rowsValue)} rows`);
                }
                if (meta.savedAt) {
                  try {
                    const savedDate = new Date(meta.savedAt);
                    parts.push(`saved ${formatShortDate(savedDate)}`);
                  } catch (error) {
                    // ignore parsing issues
                  }
                }
                dom.storageHint.textContent = parts.length
                  ? parts.join(" · ")
                  : "A dataset is stored on this device.";
              } else {
                dom.storageHint.textContent = "No dataset is currently saved on this device.";
              }
            }
          }

          function updateSnapshotControlsAvailability() {
            if (!dom.snapshotControls) {
              return;
            }
            const hasDataset = Boolean(state.rows && state.rows.length && lastParsedCsvText);
            const hint = dom.snapshotHint;
            const saveButton = dom.snapshotSaveButton;
            const loadButton = dom.snapshotLoadButton;
            if (!supportsSnapshotEncryption || !supportsDialogElement) {
              dom.snapshotControls.hidden = false;
              if (hint) {
                hint.textContent = supportsSnapshotEncryption
                  ? "Secure snapshots require dialog support in this browser. Update to the latest version."
                  : "Secure snapshots need a modern browser over HTTPS.";
              }
              if (saveButton) {
                saveButton.disabled = true;
              }
              if (loadButton) {
                loadButton.disabled = true;
              }
              return;
            }
            dom.snapshotControls.hidden = false;
            if (saveButton) {
              saveButton.disabled = !hasDataset;
            }
            if (loadButton) {
              loadButton.disabled = false;
            }
            if (hint) {
              hint.textContent = hasDataset
                ? "Encrypted snapshots let trusted colleagues reproduce this view without sending raw files."
                : "Load a dataset before creating an encrypted snapshot.";
            }
          }

          function setupSnapshotControls() {
            if (!dom.snapshotControls) {
              return;
            }
            updateSnapshotControlsAvailability();
            if (!supportsSnapshotEncryption || !supportsDialogElement) {
              return;
            }
            if (dom.snapshotSaveButton) {
              dom.snapshotSaveButton.addEventListener("click", () => {
                if (!state.rows.length || !lastParsedCsvText) {
                  updateSnapshotControlsAvailability();
                  return;
                }
                openSnapshotExportDialog();
              });
            }
            if (dom.snapshotLoadButton) {
              dom.snapshotLoadButton.addEventListener("click", () => {
                openSnapshotImportDialog();
              });
            }
            if (dom.snapshotExportForm) {
              dom.snapshotExportForm.addEventListener("submit", handleSnapshotExportSubmit);
            }
            if (dom.snapshotCancel) {
              dom.snapshotCancel.addEventListener("click", () => {
                closeSnapshotExportDialog();
              });
            }
            if (dom.snapshotExportDialog) {
              dom.snapshotExportDialog.addEventListener("close", () => {
                resetSnapshotExportDialog();
              });
              dom.snapshotExportDialog.addEventListener("cancel", event => {
                event.preventDefault();
                closeSnapshotExportDialog();
              });
            }
            if (dom.snapshotCopy) {
              dom.snapshotCopy.addEventListener("click", () => {
                handleSnapshotCopy();
              });
            }
            if (dom.snapshotDownload) {
              dom.snapshotDownload.addEventListener("click", () => {
                handleSnapshotDownload();
              });
            }
            if (dom.snapshotExportHtml) {
              dom.snapshotExportHtml.addEventListener("click", () => {
                handleSnapshotBundleDownload();
              });
            }
            if (dom.snapshotImportForm) {
              dom.snapshotImportForm.addEventListener("submit", handleSnapshotImportSubmit);
            }
            if (dom.snapshotImportCancel) {
              dom.snapshotImportCancel.addEventListener("click", () => {
                closeSnapshotImportDialog();
              });
            }
            if (dom.snapshotImportDialog) {
              dom.snapshotImportDialog.addEventListener("close", () => {
                resetSnapshotImportDialog();
              });
              dom.snapshotImportDialog.addEventListener("cancel", event => {
                event.preventDefault();
                closeSnapshotImportDialog();
              });
            }
            if (dom.snapshotImportFile) {
              dom.snapshotImportFile.addEventListener("change", handleSnapshotImportFileSelection);
            }
          }

          function openSnapshotExportDialog() {
            if (!dom.snapshotExportDialog || typeof dom.snapshotExportDialog.showModal !== "function") {
              logWarn("Snapshot export dialog is unavailable in this browser.");
              return;
            }
            resetSnapshotExportDialog();
            try {
              dom.snapshotExportDialog.showModal();
              if (dom.snapshotPassword) {
                dom.snapshotPassword.focus();
              }
            } catch (error) {
              logWarn("Unable to open snapshot dialog", error);
            }
          }

          function closeSnapshotExportDialog() {
            if (dom.snapshotExportDialog && dom.snapshotExportDialog.open) {
              dom.snapshotExportDialog.close();
            }
          }

          function resetSnapshotExportDialog() {
            if (dom.snapshotPassword) {
              dom.snapshotPassword.value = "";
            }
            if (dom.snapshotPasswordConfirm) {
              dom.snapshotPasswordConfirm.value = "";
            }
            if (dom.snapshotOutputText) {
              dom.snapshotOutputText.value = "";
            }
            if (dom.snapshotOutput) {
              dom.snapshotOutput.hidden = true;
            }
            setSnapshotNotice(dom.snapshotError, "");
            latestSnapshotExport = "";
            clearSnapshotCopyFeedback();
            revokeSnapshotDownloadUrl();
            setButtonEnabled(dom.snapshotExportHtml, false);
            updateSnapshotControlsAvailability();
          }

          function loadPdfExportPreferences() {
            try {
              const raw = localStorage.getItem(PDF_EXPORT_PREFERENCES_KEY);
              if (!raw) {
                return null;
              }
              const parsed = JSON.parse(raw);
              if (!parsed || typeof parsed !== "object") {
                return null;
              }
              if (parsed.version !== 1 || !parsed.sections || typeof parsed.sections !== "object") {
                return null;
              }
              return parsed;
            } catch (error) {
              return null;
            }
          }

          function savePdfExportPreferences(sections) {
            try {
              localStorage.setItem(PDF_EXPORT_PREFERENCES_KEY, JSON.stringify({ version: 1, sections }));
            } catch (error) {
              // ignore
            }
          }

          function hasAgentPdfData() {
            const agentTbody = document.querySelector('tbody[data-agent-hub-tbody="agents"]');
            return Boolean(agentTbody && agentTbody.querySelector("tr"));
          }

          function getPdfExportSectionDefinitions() {
            const hasVisibleData = (element, emptyElement) => Boolean(
              element
                && !element.hidden
                && (!emptyElement || emptyElement.hidden)
            );
            const defs = [
              {
                id: "keyMetrics",
                label: "Key metrics",
                defaultInclude: true,
                formats: ["image", "text"],
                defaultFormat: "image",
                getElement: () => document.querySelector(".summary-grid"),
                isAvailable: () => Boolean(document.querySelector(".summary-grid")),
                renderText: renderPdfKeyMetricsText
              },
              {
                id: "impactTrend",
                label: "Impact trend",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => document.querySelector(".trend-card[aria-label='Impact trend']"),
                isAvailable: () => Boolean(document.querySelector(".trend-card[aria-label='Impact trend']"))
              },
              {
                id: "groupBreakdown",
                label: "Impact trend breakdown",
                defaultInclude: true,
                formats: ["image", "text"],
                defaultFormat: "image",
                getElement: () => document.querySelector(".group-card[aria-label='Group breakdown']"),
                isAvailable: () => Boolean(document.querySelector(".group-card[aria-label='Group breakdown']")),
                renderText: renderPdfGroupBreakdownText
              },
              {
                id: "adoptionByApp",
                label: "Adoption by app",
                defaultInclude: true,
                formats: ["image", "text"],
                defaultFormat: "image",
                getElement: () => dom.adoptionCard || document.querySelector("[data-adoption-card]"),
                isAvailable: () => {
                  const element = dom.adoptionCard || document.querySelector("[data-adoption-card]");
                  return Boolean(element && !element.hidden);
                },
                renderText: renderPdfAdoptionByAppText
              },
              {
                id: "usageIntensity",
                label: "Usage intensity",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => dom.usageCard || document.querySelector("[data-usage-card]"),
                isAvailable: () => hasVisibleData(dom.usageCard || document.querySelector("[data-usage-card]"), dom.usageEmpty)
              },
              {
                id: "usageIntensityComparison",
                label: "Usage intensity comparison",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => dom.usageTrendCard || document.querySelector("[data-usage-trend-card]"),
                isAvailable: () => hasVisibleData(dom.usageTrendCard || document.querySelector("[data-usage-trend-card]"), dom.usageTrendEmpty)
              },
              {
                id: "licensedUsersTrend",
                label: "Licensed users trend",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => dom.enabledLicensesCard || document.querySelector("[data-enabled-licenses-card]"),
                isAvailable: () => hasVisibleData(dom.enabledLicensesCard || document.querySelector("[data-enabled-licenses-card]"), dom.enabledLicensesEmpty)
              },
              {
                id: "returningUsers",
                label: "Returning users",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => dom.returningCard || document.querySelector("[data-returning-card]"),
                isAvailable: () => hasVisibleData(dom.returningCard || document.querySelector("[data-returning-card]"), dom.returningEmpty)
              },
              {
                id: "capabilityHighlights",
                label: "Copilot capability highlights",
                defaultInclude: true,
                formats: ["image"],
                defaultFormat: "image",
                getElement: () => document.querySelector(".category-grid"),
                isAvailable: () => Boolean(document.querySelector(".category-grid"))
              },
              {
                id: "agents",
                label: "Top Copilot agents",
                defaultInclude: true,
                formats: ["text"],
                defaultFormat: "text",
                forceLast: true,
                isAvailable: () => hasAgentPdfData(),
                renderText: renderPdfAgentsText
              }
            ];
            const ordered = defs.filter(def => !def.forceLast).concat(defs.filter(def => def.forceLast));
            return ordered;
          }

          function openPdfExportDialog() {
            if (!dom.pdfExportDialog || typeof dom.pdfExportDialog.showModal !== "function") {
              showToast("PDF dialog unavailable", "Your browser does not support the export dialog.", "error");
              return;
            }
            closeExportMenu();
            resetPdfExportDialog();
            try {
              dom.pdfExportDialog.showModal();
            } catch (error) {
              logWarn("Unable to open PDF export dialog", error);
            }
          }

          function closePdfExportDialog() {
            if (dom.pdfExportDialog && dom.pdfExportDialog.open) {
              dom.pdfExportDialog.close();
            }
          }

          function resetPdfExportDialog() {
            renderPdfExportDialogOptions();
          }

          function renderPdfExportDialogOptions() {
            if (!dom.pdfExportOptions) {
              return;
            }
            dom.pdfExportOptions.innerHTML = "";
            const defs = getPdfExportSectionDefinitions();
            const stored = loadPdfExportPreferences();
            const storedSections = stored && stored.sections && typeof stored.sections === "object" ? stored.sections : {};

            defs.forEach(def => {
              const available = typeof def.isAvailable === "function" ? def.isAvailable() : true;
              const storedForSection = storedSections && storedSections[def.id] && typeof storedSections[def.id] === "object"
                ? storedSections[def.id]
                : null;
              const include = available
                ? (typeof storedForSection?.include === "boolean" ? storedForSection.include : Boolean(def.defaultInclude))
                : false;
              const format = (typeof storedForSection?.format === "string" && Array.isArray(def.formats) && def.formats.includes(storedForSection.format))
                ? storedForSection.format
                : def.defaultFormat;

              const row = document.createElement("div");
              row.className = "pdf-export-option-row";
              if (!available) {
                row.classList.add("is-disabled");
              }

              const label = document.createElement("label");
              label.className = "pdf-export-option-label";
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.dataset.pdfSectionCheckbox = def.id;
              checkbox.checked = Boolean(include);
              checkbox.disabled = !available;
              const text = document.createElement("span");
              text.textContent = def.label;
              label.append(checkbox, text);

              const formatSelect = document.createElement("select");
              formatSelect.className = "pdf-export-option-format";
              formatSelect.dataset.pdfSectionFormat = def.id;
              const formats = Array.isArray(def.formats) ? def.formats : ["image"];
              formats.forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value === "text" ? "Text" : "Screenshot";
                formatSelect.appendChild(option);
              });
              formatSelect.value = formats.includes(format) ? format : formats[0];
              formatSelect.disabled = !available || formats.length === 1 || !checkbox.checked;

              checkbox.addEventListener("change", () => {
                formatSelect.disabled = !available || formats.length === 1 || !checkbox.checked;
              });

              row.append(label, formatSelect);
              dom.pdfExportOptions.appendChild(row);
            });
          }

          function handlePdfExportDialogSubmit(event) {
            event.preventDefault();
            if (!dom.pdfExportOptions) {
              closePdfExportDialog();
              return;
            }
            const sections = {};
            const checkboxes = dom.pdfExportOptions.querySelectorAll("input[type='checkbox'][data-pdf-section-checkbox]");
            checkboxes.forEach(box => {
              const id = box.dataset.pdfSectionCheckbox;
              if (!id) {
                return;
              }
              const formatSelect = dom.pdfExportOptions.querySelector(`select[data-pdf-section-format="${id}"]`);
              const format = formatSelect && typeof formatSelect.value === "string" ? formatSelect.value : "image";
              sections[id] = { include: Boolean(box.checked), format };
            });
            savePdfExportPreferences(sections);
            state.pdfExportPreferences = sections;
            closePdfExportDialog();
            void exportDashboardToPDF({ sections });
          }

          function clearSnapshotCopyFeedback() {
            if (snapshotCopyTimeout) {
              clearTimeout(snapshotCopyTimeout);
              snapshotCopyTimeout = null;
            }
            if (dom.snapshotCopy) {
              dom.snapshotCopy.textContent = "Copy to clipboard";
              dom.snapshotCopy.disabled = false;
            }
          }

          function setSnapshotNotice(target, message, tone = "info") {
            if (!target) {
              return;
            }
            if (message) {
              target.textContent = message;
              target.hidden = false;
              if (tone) {
                target.dataset.tone = tone;
              } else {
                delete target.dataset.tone;
              }
            } else {
              target.textContent = "";
              target.hidden = true;
              delete target.dataset.tone;
            }
          }

          async function encodeSnapshotText(text, { label } = {}) {
            if (typeof text !== "string") {
              return { encoding: "text", data: "", originalSize: 0 };
            }
            const originalSize = text.length;
            if (!originalSize) {
              return { encoding: "text", data: "", originalSize: 0 };
            }
            const forceCompression = originalSize > SNAPSHOT_UNCOMPRESSED_LIMIT;
            let textBytes = null;
            const ensureTextBytes = () => {
              if (!textBytes) {
                const encoder = new TextEncoder();
                textBytes = encoder.encode(text);
              }
              return textBytes;
            };

            const tryPakoCompression = () => {
              if (!window.pako || typeof window.pako.gzip !== "function") {
                return null;
              }
              try {
                const bytes = ensureTextBytes();
                const compressedBytes = window.pako.gzip(bytes);
                if (!compressedBytes || !compressedBytes.length) {
                  return null;
                }
                if (!forceCompression && compressedBytes.length >= originalSize) {
                  return null;
                }
                return {
                  encoding: "gzip-base64",
                  data: bufferToBase64(compressedBytes),
                  originalSize,
                  compressedSize: compressedBytes.length
                };
              } catch (error) {
                logWarn(`Unable to compress snapshot ${label || "dataset"} with pako`, error);
                return null;
              }
            };

            const tryFflateCompression = () => {
              if (!window.fflate || typeof window.fflate.gzipSync !== "function") {
                return null;
              }
              try {
                const bytes = ensureTextBytes();
                const compressedBytes = window.fflate.gzipSync(bytes);
                if (!compressedBytes || !compressedBytes.length) {
                  return null;
                }
                if (!forceCompression && compressedBytes.length >= originalSize) {
                  return null;
                }
                return {
                  encoding: "gzip-base64",
                  data: bufferToBase64(compressedBytes),
                  originalSize,
                  compressedSize: compressedBytes.length
                };
              } catch (error) {
                logWarn(`Unable to compress snapshot ${label || "dataset"} with fflate`, error);
                return null;
              }
            };

            const tryCompressionStream = async () => {
              if (typeof CompressionStream !== "function") {
                return null;
              }
              try {
                const stream = new CompressionStream("gzip");
                const writer = stream.writable.getWriter();
                await writer.write(ensureTextBytes());
                await writer.close();
                const response = new Response(stream.readable);
                const compressedBuffer = await response.arrayBuffer();
                const compressedBytes = new Uint8Array(compressedBuffer);
                if (!forceCompression && compressedBytes.length >= originalSize) {
                  return null;
                }
                return {
                  encoding: "gzip-base64",
                  data: bufferToBase64(compressedBytes),
                  originalSize,
                  compressedSize: compressedBytes.length
                };
              } catch (error) {
                logWarn(`Unable to compress snapshot ${label || "dataset"} with CompressionStream`, error);
                return null;
              }
            };

            const compressedViaFflate = tryFflateCompression();
            if (compressedViaFflate) {
              return compressedViaFflate;
            }

            const compressedViaPako = tryPakoCompression();
            if (compressedViaPako) {
              return compressedViaPako;
            }

            const compressedViaStream = await tryCompressionStream();
            if (compressedViaStream) {
              return compressedViaStream;
            }

            return { encoding: "text", data: text, originalSize };
          }

          async function decodeSnapshotSection(section, { label } = {}) {
            if (!section || typeof section !== "object") {
              throw new Error(`Snapshot is missing ${label || "dataset"} content.`);
            }
            const encoding = section.encoding || "text";
            if (encoding === "text") {
              if (typeof section.data !== "string") {
                throw new Error(`Snapshot ${label || "dataset"} data is invalid.`);
              }
              const result = { ...section, csvText: section.data };
              delete result.data;
              return result;
            }
            if (encoding === "gzip-base64") {
              if (typeof section.data !== "string" || !section.data.length) {
                throw new Error(`Snapshot ${label || "dataset"} data is empty.`);
              }
              const bytes = base64ToUint8Array(section.data);
              const finalizeSection = csvText => {
                const result = { ...section, csvText };
                delete result.data;
                return result;
              };
              if (window.fflate && typeof window.fflate.gunzipSync === "function") {
                try {
                  const decompressed = window.fflate.gunzipSync(bytes);
                  if (decompressed instanceof Uint8Array) {
                    const decoder = new TextDecoder();
                    return finalizeSection(decoder.decode(decompressed));
                  }
                } catch (error) {
                  logWarn(`Unable to decompress snapshot ${label || "dataset"} with fflate`, error);
                }
              }
              if (window.pako && typeof window.pako.ungzip === "function") {
                try {
                  const decompressed = window.pako.ungzip(bytes);
                  if (decompressed instanceof Uint8Array) {
                    const decoder = new TextDecoder();
                    return finalizeSection(decoder.decode(decompressed));
                  }
                } catch (error) {
                  logWarn(`Unable to decompress snapshot ${label || "dataset"} with pako`, error);
                }
              }
              if (typeof DecompressionStream === "function") {
                try {
                  const stream = new DecompressionStream("gzip");
                  const writer = stream.writable.getWriter();
                  await writer.write(bytes);
                  await writer.close();
                  const response = new Response(stream.readable);
                  const csvText = await response.text();
                  return finalizeSection(csvText);
                } catch (error) {
                  logWarn(`Unable to decompress snapshot ${label || "dataset"} with DecompressionStream`, error);
                }
              }
              throw new Error("This browser cannot open compressed snapshots. Try the latest version of Chrome, Edge, or another Chromium-based browser.");
            }
            throw new Error(`Unsupported snapshot encoding: ${encoding}`);
          }

          async function handleSnapshotExportSubmit(event) {
            event.preventDefault();
            if (!supportsSnapshotEncryption || !supportsDialogElement) {
              setSnapshotNotice(dom.snapshotError, "Secure snapshots are not supported in this browser.", "error");
              return;
            }
            if (!state.rows.length || !lastParsedCsvText) {
              setSnapshotNotice(dom.snapshotError, "Load a dataset before creating a snapshot.", "error");
              updateSnapshotControlsAvailability();
              return;
            }
            const passwordField = dom.snapshotPassword;
            const confirmField = dom.snapshotPasswordConfirm;
            const password = passwordField ? passwordField.value || "" : "";
            const confirm = confirmField ? confirmField.value || "" : "";
            if (!password) {
              setSnapshotNotice(dom.snapshotError, "Enter a password.", "error");
              return;
            }
            if (password !== confirm) {
              setSnapshotNotice(dom.snapshotError, "Password and confirmation do not match.", "error");
              return;
            }
            setSnapshotNotice(dom.snapshotError, "");
            if (dom.snapshotGenerate) {
              dom.snapshotGenerate.disabled = true;
              dom.snapshotGenerate.dataset.originalLabel = dom.snapshotGenerate.textContent || "";
              dom.snapshotGenerate.textContent = "Generating…";
            }
            try {
              setSnapshotNotice(dom.snapshotError, "Encrypting snapshot… This may take up to a minute for large datasets.", "info");
              const snapshotString = await generateEncryptedSnapshot(password);
              latestSnapshotExport = snapshotString;
              if (dom.snapshotOutputText) {
                dom.snapshotOutputText.value = snapshotString;
              }
              if (dom.snapshotOutput) {
                dom.snapshotOutput.hidden = false;
              }
              setSnapshotNotice(dom.snapshotError, "Snapshot ready. Copy or download below.", "success");
              setButtonEnabled(dom.snapshotExportHtml, true);
              if (passwordField) {
                passwordField.value = "";
              }
              if (confirmField) {
                confirmField.value = "";
              }
              updateSnapshotControlsAvailability();
              clearSnapshotCopyFeedback();
            } catch (error) {
              const message = error && error.message ? error.message : "Unable to create snapshot.";
              setSnapshotNotice(dom.snapshotError, message, "error");
            } finally {
              if (dom.snapshotGenerate) {
                dom.snapshotGenerate.disabled = false;
                const label = dom.snapshotGenerate.dataset.originalLabel || "Generate snapshot";
                dom.snapshotGenerate.textContent = label;
                delete dom.snapshotGenerate.dataset.originalLabel;
              }
            }
          }

          function serializeFiltersForSnapshot() {
            return {
              organization: Array.from(state.filters.organization || []),
              country: Array.from(state.filters.country || []),
              timeframe: state.filters.timeframe,
              customStart: state.filters.customStart ? toDateInputValue(state.filters.customStart) : null,
              customEnd: state.filters.customEnd ? toDateInputValue(state.filters.customEnd) : null,
              aggregate: state.filters.aggregate,
              metric: state.filters.metric,
              group: state.filters.group,
              organizationField: state.filterFields.organization,
              countryField: state.filterFields.country,
              categorySelection: Array.from(state.filters.categorySelection || [])
            };
          }

          async function buildDatasetSnapshotSection() {
            if (typeof lastParsedCsvText !== "string" || !lastParsedCsvText.length) {
              return null;
            }
            const encoded = await encodeSnapshotText(lastParsedCsvText, { label: "dataset" });
            return {
              ...encoded,
              meta: lastParsedCsvMeta ? { ...lastParsedCsvMeta } : null
            };
          }

          async function buildAgentSnapshotSection() {
            if (typeof lastParsedAgentCsvText !== "string" || !lastParsedAgentCsvText.length) {
              return null;
            }
            const encoded = await encodeSnapshotText(lastParsedAgentCsvText, { label: "agent dataset" });
            return {
              ...encoded,
              meta: lastParsedAgentMeta ? { ...lastParsedAgentMeta } : null
            };
          }

          async function buildSnapshotPayload() {
            const datasetSection = await buildDatasetSnapshotSection();
            if (!datasetSection || !datasetSection.data || !datasetSection.data.length) {
              throw new Error("Snapshot payload is missing the dataset.");
            }
            const agentSection = await buildAgentSnapshotSection();
            return {
              version: SNAPSHOT_VERSION,
              createdAt: new Date().toISOString(),
              dataset: datasetSection,
              agentDataset: agentSection,
              filters: serializeFiltersForSnapshot(),
              theme: state.theme,
              trendView: state.trendView,
              seriesVisibility: { ...state.seriesVisibility },
              seriesDetailMode: state.seriesDetailMode,
              returningMetric: state.returningMetric,
              returningInterval: state.returningInterval,
              activeDaysView: state.activeDaysView,
              usageTrendMode: state.usageTrendMode,
              usageTrendRegion: state.usageTrendRegion,
              usageMonthSelection: Array.isArray(state.usageMonthSelection) ? state.usageMonthSelection.map(String) : [],
              returningRegion: state.returningRegion,
              usageThresholds: {
                middle: Number(state.usageThresholds?.middle) || 0,
                high: Number(state.usageThresholds?.high) || 0
              },
              exportPreferences: {
                includeDetails: state.exportPreferences?.includeDetails !== false
              },
              trendColorPreference: {
                start: state.trendColorPreference?.start || null,
                end: state.trendColorPreference?.end || null
              },
              dimensionSelection: {
                dimension: state.dimensionSelection?.dimension || "country",
                metric: state.dimensionSelection?.metric || "actions",
                selected: {
                  country: Array.from(state.dimensionSelection?.selected?.country || []),
                  organization: Array.from(state.dimensionSelection?.selected?.organization || [])
                }
              },
              adoptionShowDetails: Boolean(state.adoptionShowDetails),
              groupsExpanded: Boolean(state.groupsExpanded),
              topUsersExpanded: Boolean(state.topUsersExpanded),
              agentDisplayLimit: Number.isFinite(state.agentDisplayLimit) ? state.agentDisplayLimit : 5
            };
          }

          async function generateEncryptedSnapshot(password) {
            if (!supportsSnapshotEncryption) {
              throw new Error("Secure snapshots are not supported in this environment.");
            }
            const payload = await buildSnapshotPayload();
            const encoder = new TextEncoder();
            const payloadBytes = encoder.encode(JSON.stringify(payload));
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const passwordBytes = encoder.encode(password);
            try {
              const keyMaterial = await window.crypto.subtle.importKey(
                "raw",
                passwordBytes,
                { name: "PBKDF2" },
                false,
                ["deriveKey"]
              );
              const key = await window.crypto.subtle.deriveKey(
                {
                  name: "PBKDF2",
                  salt,
                  iterations: SNAPSHOT_KDF_ITERATIONS,
                  hash: "SHA-256"
                },
                keyMaterial,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt"]
              );
              const ciphertextBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                key,
                payloadBytes
              );
              const envelope = {
                version: SNAPSHOT_VERSION,
                algorithm: "AES-GCM",
                kdf: {
                  name: "PBKDF2",
                  hash: "SHA-256",
                  iterations: SNAPSHOT_KDF_ITERATIONS,
                  salt: bufferToBase64Url(salt)
                },
                iv: bufferToBase64Url(iv),
                ciphertext: bufferToBase64Url(new Uint8Array(ciphertextBuffer))
              };
              payloadBytes.fill(0);
              passwordBytes.fill(0);
              return buildCompactSnapshotString(envelope);
            } catch (error) {
              payloadBytes.fill(0);
              passwordBytes.fill(0);
              throw error;
            }
          }

          function bufferToBase64(input) {
            const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
            const chunkSize = 0x8000;
            const chunks = [];
            for (let index = 0; index < bytes.length; index += chunkSize) {
              const chunk = bytes.subarray(index, index + chunkSize);
              chunks.push(String.fromCharCode(...chunk));
            }
            return window.btoa(chunks.join(""));
          }

          function bufferToBase64Url(input) {
            return bufferToBase64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
          }

          function sanitizeSnapshotSegment(value) {
            return String(value || "").replace(/[\r\n\s]/g, "");
          }

          function buildCompactSnapshotString(envelope) {
            const versionSegment = `v${Number(envelope?.version) || SNAPSHOT_VERSION}`;
            const iterations = Number(envelope?.kdf?.iterations) || SNAPSHOT_KDF_ITERATIONS;
            const saltSegment = sanitizeSnapshotSegment(envelope?.kdf?.salt);
            const ivSegment = sanitizeSnapshotSegment(envelope?.iv);
            const ciphertextSegment = sanitizeSnapshotSegment(envelope?.ciphertext);
            if (!saltSegment || !ivSegment || !ciphertextSegment) {
              throw new Error("Snapshot encryption output is incomplete.");
            }
            return [SNAPSHOT_PREFIX, versionSegment, `k${iterations}`, saltSegment, ivSegment, ciphertextSegment].join(".");
          }

          function triggerFileDownload(url, filename) {
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.rel = "noopener";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }

          function showToast(title, message, tone = "info") {
            if (!dom.toastContainer) {
              return;
            }
            const toast = document.createElement("div");
            toast.className = "toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");

            const icon = document.createElement("span");
            icon.className = "toast-icon";
            icon.textContent = tone === "error" ? "!" : "✓";
            icon.style.background = tone === "error" ? "rgba(200, 45, 45, 0.14)" : "rgba(0, 110, 0, 0.14)";
            icon.style.color = tone === "error" ? "var(--red-600)" : "var(--green-700)";

            const content = document.createElement("div");
            content.className = "toast-content";

            const titleEl = document.createElement("p");
            titleEl.className = "toast-title";
            titleEl.textContent = title || (tone === "error" ? "Something went wrong" : "Done");

            const messageEl = document.createElement("p");
            messageEl.className = "toast-message";
            messageEl.textContent = message || "";

            const close = document.createElement("button");
            close.type = "button";
            close.className = "toast-close";
            close.setAttribute("aria-label", "Dismiss");
            close.textContent = "×";

            const hide = () => {
              toast.classList.add("is-hiding");
              window.setTimeout(() => toast.remove(), 320);
            };
            close.addEventListener("click", hide);

            content.appendChild(titleEl);
            if (messageEl.textContent) {
              content.appendChild(messageEl);
            }
            toast.appendChild(icon);
            toast.appendChild(content);
            toast.appendChild(close);

            dom.toastContainer.appendChild(toast);
            window.setTimeout(hide, tone === "error" ? 7500 : 5200);
          }

          function supportsSaveFilePicker() {
            return Boolean(window.isSecureContext && typeof window.showSaveFilePicker === "function");
          }

          function hasUserActivation() {
            try {
              return Boolean(navigator.userActivation && navigator.userActivation.isActive);
            } catch (error) {
              return false;
            }
          }

          async function saveBlobWithPicker(blob, suggestedName, { description = "File", accept = {} } = {}) {
            const handle = await window.showSaveFilePicker({
              suggestedName,
              types: [{ description, accept }],
              excludeAcceptAllOption: false
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          }

          async function saveOrDownloadBlob(blob, filename, pickerOptions) {
            if (supportsSaveFilePicker() && hasUserActivation()) {
              try {
                await saveBlobWithPicker(blob, filename, pickerOptions);
                return { saved: true, canceled: false };
              } catch (error) {
                if (error && error.name === "AbortError") {
                  return { saved: false, canceled: true };
                }
                // If the picker isn't allowed (missing user gesture / policy), fall back to a normal download.
                if (error && error.name === "NotAllowedError") {
                  downloadBinaryFile(blob, filename, blob && blob.type ? blob.type : "application/octet-stream");
                  return { saved: false, canceled: false };
                }
                downloadBinaryFile(blob, filename, blob && blob.type ? blob.type : "application/octet-stream");
                return { saved: false, canceled: false };
              }
            }
            downloadBinaryFile(blob, filename, blob && blob.type ? blob.type : "application/octet-stream");
            return { saved: false, canceled: false };
          }

          function downloadTextFile(content, filename, mimeType = "text/plain") {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            triggerFileDownload(url, filename);
            window.setTimeout(() => URL.revokeObjectURL(url), 1200);
          }

          function downloadBinaryFile(data, filename, mimeType = "application/octet-stream") {
            const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            triggerFileDownload(url, filename);
            window.setTimeout(() => URL.revokeObjectURL(url), 1200);
          }

          const CRC32_TABLE = (() => {
            const table = new Uint32Array(256);
            for (let index = 0; index < 256; index += 1) {
              let value = index;
              for (let bit = 0; bit < 8; bit += 1) {
                value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
              }
              table[index] = value >>> 0;
            }
            return table;
          })();

          function crc32(bytes) {
            let crc = 0xFFFFFFFF;
            for (let index = 0; index < bytes.length; index += 1) {
              crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
            }
            return (crc ^ 0xFFFFFFFF) >>> 0;
          }

          function getMsDosDateTime(date = new Date()) {
            const year = Math.max(1980, date.getUTCFullYear());
            const month = date.getUTCMonth() + 1;
            const day = date.getUTCDate();
            const hours = date.getUTCHours();
            const minutes = date.getUTCMinutes();
            const seconds = Math.floor(date.getUTCSeconds() / 2);
            const dosDate = ((year - 1980) << 9) | (month << 5) | day;
            const dosTime = (hours << 11) | (minutes << 5) | seconds;
            return { date: dosDate & 0xFFFF, time: dosTime & 0xFFFF };
          }

          function concatUint8Arrays(parts) {
            const total = parts.reduce((sum, part) => sum + part.length, 0);
            const result = new Uint8Array(total);
            let offset = 0;
            parts.forEach(part => {
              result.set(part, offset);
              offset += part.length;
            });
            return result;
          }

          function createZipArchive(files) {
            const encoder = new TextEncoder();
            const localParts = [];
            const centralParts = [];
            let offset = 0;
            const fileEntries = files.map(file => {
              const nameBytes = encoder.encode(file.name);
              const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data));
              const crc = crc32(data);
              const { date, time } = getMsDosDateTime(file.modified instanceof Date ? file.modified : new Date());
              return { name: file.name, nameBytes, data, crc, date, time };
            });

            fileEntries.forEach(entry => {
              const localHeader = new Uint8Array(30 + entry.nameBytes.length);
              const localView = new DataView(localHeader.buffer);
              localView.setUint32(0, 0x04034B50, true);
              localView.setUint16(4, 20, true);
              localView.setUint16(6, 0, true);
              localView.setUint16(8, 0, true);
              localView.setUint16(10, entry.time, true);
              localView.setUint16(12, entry.date, true);
              localView.setUint32(14, entry.crc, true);
              localView.setUint32(18, entry.data.length, true);
              localView.setUint32(22, entry.data.length, true);
              localView.setUint16(26, entry.nameBytes.length, true);
              localView.setUint16(28, 0, true);
              localHeader.set(entry.nameBytes, 30);

              localParts.push(localHeader, entry.data);

              const centralHeader = new Uint8Array(46 + entry.nameBytes.length);
              const centralView = new DataView(centralHeader.buffer);
              centralView.setUint32(0, 0x02014B50, true);
              centralView.setUint16(4, 20, true);
              centralView.setUint16(6, 20, true);
              centralView.setUint16(8, 0, true);
              centralView.setUint16(10, 0, true);
              centralView.setUint16(12, entry.time, true);
              centralView.setUint16(14, entry.date, true);
              centralView.setUint32(16, entry.crc, true);
              centralView.setUint32(20, entry.data.length, true);
              centralView.setUint32(24, entry.data.length, true);
              centralView.setUint16(28, entry.nameBytes.length, true);
              centralView.setUint16(30, 0, true);
              centralView.setUint16(32, 0, true);
              centralView.setUint16(34, 0, true);
              centralView.setUint16(36, 0, true);
              centralView.setUint32(38, 0, true);
              centralView.setUint32(42, offset, true);
              centralHeader.set(entry.nameBytes, 46);
              centralParts.push(centralHeader);

              offset += localHeader.length + entry.data.length;
            });

            const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
            const localSize = localParts.reduce((sum, part) => sum + part.length, 0);

            const endRecord = new Uint8Array(22);
            const endView = new DataView(endRecord.buffer);
            endView.setUint32(0, 0x06054B50, true);
            endView.setUint16(4, 0, true);
            endView.setUint16(6, 0, true);
            endView.setUint16(8, fileEntries.length, true);
            endView.setUint16(10, fileEntries.length, true);
            endView.setUint32(12, centralSize, true);
            endView.setUint32(16, localSize, true);
            endView.setUint16(20, 0, true);

            const archiveParts = [...localParts, ...centralParts, endRecord];
            return concatUint8Arrays(archiveParts);
          }

          function escapeCsvValue(value) {
            if (value === null || typeof value === "undefined") {
              return "";
            }
            const safeValue = sanitizeSpreadsheetCell(value);
            const stringValue = String(safeValue);
            if (/["\r\n,]/.test(stringValue)) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          }

          function sanitizeSpreadsheetCell(value) {
            if (value === null || typeof value === "undefined") {
              return value;
            }
            if (typeof value !== "string") {
              return value;
            }
            if (!value) {
              return value;
            }
            // Prevent Excel / Sheets from interpreting exported text as a formula.
            if (/^[\u0000-\u001F\s]*[=+\-@]/.test(value)) {
              return `'${value}`;
            }
            return value;
          }

          function downloadCsv(filename, headers, rows) {
            if (!Array.isArray(rows) || !rows.length) {
              return;
            }
            const lines = [];
            if (Array.isArray(headers) && headers.length) {
              lines.push(headers.map(escapeCsvValue).join(","));
            }
            rows.forEach(row => {
              lines.push(row.map(escapeCsvValue).join(","));
            });
            downloadTextFile(lines.join("\r\n"), filename, "text/csv");
          }

          function setButtonEnabled(button, enabled) {
            if (!button) {
              return;
            }
            button.disabled = !enabled;
            button.classList.toggle("is-disabled", !enabled);
          }

          function downloadChartImage(chart, filename) {
            if (!chart || !chart.canvas) {
              return;
            }
            const labels = chart.data && Array.isArray(chart.data.labels) ? chart.data.labels : [];
            if (!labels.length) {
              return;
            }
            const sourceCanvas = chart.canvas;
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = sourceCanvas.width;
            exportCanvas.height = sourceCanvas.height;
            const context = exportCanvas.getContext("2d");
            const backgroundColor = getCssVariableValue("--card-surface", "#ffffff") || "#ffffff";
            context.fillStyle = backgroundColor;
            context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            context.drawImage(sourceCanvas, 0, 0);
            const dataUrl = exportCanvas.toDataURL("image/png");
            triggerFileDownload(dataUrl, filename);
          }

          function collectUsageIntensityRows() {
            const months = Array.isArray(state.latestUsageMonths) ? state.latestUsageMonths : [];
            if (!months.length) {
              return [];
            }
            const selection = state.usageMonthSelection && state.usageMonthSelection.length
              ? state.usageMonthSelection
              : months.map(entry => entry.key);
            const monthMap = new Map(months.map(entry => [entry.key, entry]));
            const rows = [];
            selection.forEach(key => {
              const entry = monthMap.get(key);
              if (!entry) {
                return;
              }
              rows.push({
                key,
                label: entry.label || key || "",
                totalUsers: Number.isFinite(entry.totalUsers) ? entry.totalUsers : 0,
                frequentUsers: Number.isFinite(entry.powerUsers) ? entry.powerUsers : 0,
                frequentShare: Number.isFinite(entry.powerShare) ? entry.powerShare : null,
                consistentUsers: Number.isFinite(entry.consistentUsers) ? entry.consistentUsers : 0,
                consistentShare: Number.isFinite(entry.consistentShare) ? entry.consistentShare : null,
                range: entry.weekRangeLabel || entry.monthRangeLabel || ""
              });
            });
            return rows;
          }

          function updateUsageIntensityExportAvailability() {
            const rows = collectUsageIntensityRows();
            setButtonEnabled(dom.usageIntensityExportCsv, rows.length > 0);
          }

          async function fetchTextAsset(path) {
            const url = new URL(path, document.baseURI).href;
            const loaders = [
              async () => {
                const response = await fetch(url, { cache: "no-store" });
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
              },
              () =>
                new Promise((resolve, reject) => {
                  try {
                    const xhr = new XMLHttpRequest();
                    xhr.open("GET", url, true);
                    xhr.overrideMimeType("text/plain");
                    xhr.onload = () => {
                      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
                        resolve(xhr.responseText);
                        return;
                      }
                      reject(new Error(`XHR ${xhr.status || "local"}`));
                    };
                    xhr.onerror = () => reject(new Error("XHR network error"));
                    xhr.send();
                  } catch (error) {
                    reject(error);
                  }
                }),
              () =>
                new Promise((resolve, reject) => {
                  const iframe = document.createElement("iframe");
                  iframe.style.position = "absolute";
                  iframe.style.width = "0";
                  iframe.style.height = "0";
                  iframe.style.border = "0";
                  iframe.style.clipPath = "inset(50%)";
                  const cleanup = () => {
                    if (iframe.parentNode) {
                      iframe.parentNode.removeChild(iframe);
                    }
                  };
                  iframe.onload = () => {
                    try {
                      const doc = iframe.contentDocument;
                      const text =
                        (doc && doc.body && doc.body.textContent) ||
                        (doc && doc.documentElement && doc.documentElement.textContent) ||
                        "";
                      cleanup();
                      if (text && text.length) {
                        resolve(text);
                      } else {
                        reject(new Error("Empty response"));
                      }
                    } catch (error) {
                      cleanup();
                      reject(error);
                    }
                  };
                  iframe.onerror = () => {
                    cleanup();
                    reject(new Error("Iframe load error"));
                  };
                  iframe.src = url;
                  document.body.appendChild(iframe);
                })
            ];
            let lastError = null;
            for (const loader of loaders) {
              try {
                return await loader();
              } catch (error) {
                lastError = error;
              }
            }
            throw new Error(`Unable to read ${url}: ${lastError ? lastError.message : "unknown error"}`);
          }

          function buildSharePointReadme({ filename }) {
            return [
              "# Copilot Dashboard SharePoint Bundle",
              "",
              "Thank you for generating a SharePoint-ready package from the Copilot Impact Dashboard.",
              "",
              "## Contents",
              "- `index.html` - standalone dashboard that prompts for the encrypted snapshot password.",
              "- `assets/` - supporting CSS and JavaScript files (identical to your local dashboard).",
              "",
              "## Publish to SharePoint (Modern sites)",
              "1. Upload the entire folder to a document library (e.g., `Site Assets/CopilotDashboard`).",
              "2. Copy the URL to `index.html` once the upload completes.",
              "3. Add a new page or edit an existing one, then insert an **Embed** web part.",
              "4. Paste the `index.html` URL and save/publish the page.",
              "5. When colleagues open the page, they'll be prompted for the snapshot password you shared.",
              "",
              "## Tips",
              "- Keep the password private; it decrypts the dataset inside the browser only.",
              "- This bundle is self-contained and does not require script dependencies from external CDNs.",
              "- If you prefer hosting outside SharePoint, upload the same bundle to any internal static host.",
              "",
              `Bundle generated: ${filename}`,
              ""
            ].join("\r\n");
          }

          function decodeBase64ToString(base64) {
            if (typeof base64 !== "string" || !base64.trim()) {
              return "";
            }
            const bytes = base64ToUint8Array(base64);
            const decoder = new TextDecoder();
            return decoder.decode(bytes);
          }

          function normalizeSharePointBase64(value) {
            if (typeof value !== "string") {
              return null;
            }
            const trimmed = value.trim();
            return trimmed ? trimmed : null;
          }

          function getSharePointBase64(kind) {
            const aliasMap = {
              css: "css",
              js: "js",
              html: "html",
              vendorFflate: "vendorFflate"
            };
            const propertyMap = {
              css: "SHAREPOINT_CSS_BASE64",
              js: "SHAREPOINT_JS_BASE64",
              html: "SHAREPOINT_HTML_BASE64",
              vendorFflate: "SHAREPOINT_VENDOR_FFLATE_BASE64"
            };
            if (sharePointGlobal) {
              const registry = sharePointGlobal.__COPILOT_SHAREPOINT_ASSETS__;
              const alias = aliasMap[kind];
              if (registry && alias) {
                const normalizedRegistryValue = normalizeSharePointBase64(registry[alias]);
                if (normalizedRegistryValue) {
                  return normalizedRegistryValue;
                }
              }
              const property = propertyMap[kind];
              if (property && property in sharePointGlobal) {
                const normalizedGlobalValue = normalizeSharePointBase64(sharePointGlobal[property]);
                if (normalizedGlobalValue) {
                  return normalizedGlobalValue;
                }
              }
            }
            try {
              if (kind === "css" && typeof SHAREPOINT_CSS_BASE64 === "string") {
                return normalizeSharePointBase64(SHAREPOINT_CSS_BASE64);
              }
              if (kind === "js" && typeof SHAREPOINT_JS_BASE64 === "string") {
                return normalizeSharePointBase64(SHAREPOINT_JS_BASE64);
              }
              if (kind === "html" && typeof SHAREPOINT_HTML_BASE64 === "string") {
                return normalizeSharePointBase64(SHAREPOINT_HTML_BASE64);
              }
              if (kind === "vendorFflate" && typeof SHAREPOINT_VENDOR_FFLATE_BASE64 === "string") {
                return normalizeSharePointBase64(SHAREPOINT_VENDOR_FFLATE_BASE64);
              }
            } catch (error) {
              // Ignore ReferenceError when bindings are unavailable; we'll return null below.
            }
            return null;
          }

          function readStylesheetText(targetPath) {
            try {
              const targetUrl = new URL(targetPath, document.baseURI).href;
              for (const sheet of Array.from(document.styleSheets || [])) {
                const href = sheet && sheet.href ? new URL(sheet.href, document.baseURI).href : null;
                if (!href || href !== targetUrl) {
                  continue;
                }
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) {
                  continue;
                }
                return Array.from(rules)
                  .map(rule => rule && rule.cssText ? rule.cssText : "")
                  .join("\n");
              }
            } catch (error) {
              logWarn("Unable to read stylesheet rules for SharePoint bundle", error);
            }
            return null;
          }

          function resolveAssetBytes(base64Value, path) {
            if (typeof base64Value === "string" && base64Value.trim()) {
              return Promise.resolve(base64ToUint8Array(base64Value));
            }
            return fetchTextAsset(path)
              .then(text => {
                const encoder = new TextEncoder();
                return encoder.encode(text);
              })
              .catch(error => {
                if (path.endsWith(".css")) {
                  const stylesheetText = readStylesheetText(path);
                  if (stylesheetText) {
                    const encoder = new TextEncoder();
                    return encoder.encode(stylesheetText);
                  }
                }
                throw error;
              });
          }

          async function exportSnapshotBundle(snapshotString) {
            const encoder = new TextEncoder();
            const bundleName = `copilot-dashboard-sharepoint-${Date.now()}.zip`;
            const embedOptions = {
              snapshot: snapshotString,
              snapshotVersion: SNAPSHOT_VERSION,
              createdAt: new Date().toISOString(),
              message: "Enter the snapshot password to unlock this dashboard."
            };
            const hook = '<script defer src="assets/vendor/fflate.min.js"></script>';
            const embedScriptTag = '<script defer src="assets/embed-options.js"></script>';
            let htmlSource;
            try {
              htmlSource = await fetchTextAsset("copilot-dashboard.html");
            } catch (error) {
              logWarn("Unable to read copilot-dashboard.html, falling back to live DOM", error);
              htmlSource = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
            }
            const sanitizedHtml = htmlSource
              .replace(/\s*<script defer src="assets\/sharepoint-static-assets\.js"><\/script>\s*/gi, "")
              .replace(/\s*<script defer src="assets\/vendor\/fflate-base64\.js"><\/script>\s*/gi, "");
            const bundleHtml = sanitizedHtml.includes(hook)
              ? sanitizedHtml.replace(hook, `${embedScriptTag}\n  ${hook}`)
              : sanitizedHtml.replace("</head>", `  ${embedScriptTag}\n</head>`);
            const [
              cssBytes,
              jsBytes,
              vendorBytes,
              papaBytes,
              chartBytes,
              xlsxBytes,
              html2canvasBytes,
              jspdfBytes,
              pakoBytes,
              gifBytes
            ] = await Promise.all([
              resolveAssetBytes(null, "assets/copilot-dashboard.css"),
              resolveAssetBytes(null, "assets/copilot-dashboard.js"),
              resolveAssetBytes(null, "assets/vendor/fflate.min.js"),
              resolveAssetBytes(null, "assets/vendor/papaparse.min.js"),
              resolveAssetBytes(null, "assets/vendor/chart.umd.min.js"),
              resolveAssetBytes(null, "assets/vendor/xlsx.full.min.js"),
              resolveAssetBytes(null, "assets/vendor/html2canvas.min.js"),
              resolveAssetBytes(null, "assets/vendor/jspdf.umd.min.js"),
              resolveAssetBytes(null, "assets/vendor/pako.min.js"),
              resolveAssetBytes(null, "assets/vendor/gif.js")
            ]);
            const files = [
              { name: "index.html", data: encoder.encode(bundleHtml) },
              { name: "assets/copilot-dashboard.css", data: cssBytes },
              { name: "assets/copilot-dashboard.js", data: jsBytes },
              { name: "assets/vendor/fflate.min.js", data: vendorBytes },
              { name: "assets/vendor/papaparse.min.js", data: papaBytes },
              { name: "assets/vendor/chart.umd.min.js", data: chartBytes },
              { name: "assets/vendor/xlsx.full.min.js", data: xlsxBytes },
              { name: "assets/vendor/html2canvas.min.js", data: html2canvasBytes },
              { name: "assets/vendor/jspdf.umd.min.js", data: jspdfBytes },
              { name: "assets/vendor/pako.min.js", data: pakoBytes },
              { name: "assets/vendor/gif.js", data: gifBytes },
              { name: "assets/embed-options.js", data: encoder.encode(`window.__COPILOT_EMBED_OPTIONS__ = ${JSON.stringify(embedOptions)};`) },
              { name: "README-sharepoint.md", data: encoder.encode(buildSharePointReadme({ filename: bundleName })) }
            ];
            const archive = createZipArchive(files);
            downloadBinaryFile(archive, bundleName, "application/zip");
          }

          function base64ToUint8Array(base64) {
            const sanitized = String(base64 || "").replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
            if (!sanitized) {
              return new Uint8Array(0);
            }
            const padLength = sanitized.length % 4;
            const padded = padLength ? sanitized + "=".repeat(4 - padLength) : sanitized;
            const binary = window.atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
          }

          function buildSnapshotFilename() {
            const now = new Date();
            const pad = value => String(value).padStart(2, "0");
            return `${SNAPSHOT_FILE_BASENAME}-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${SNAPSHOT_FILE_EXTENSION}`;
          }

          function revokeSnapshotDownloadUrl() {
            if (snapshotDownloadUrl) {
              URL.revokeObjectURL(snapshotDownloadUrl);
              snapshotDownloadUrl = null;
            }
          }

          async function handleSnapshotCopy() {
            if (!latestSnapshotExport) {
              setSnapshotNotice(dom.snapshotError, "Generate a snapshot before copying.", "error");
              return;
            }
            try {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(latestSnapshotExport);
              } else if (dom.snapshotOutputText) {
                dom.snapshotOutputText.focus();
                dom.snapshotOutputText.select();
                document.execCommand("copy");
                dom.snapshotOutputText.setSelectionRange(0, 0);
              } else {
                throw new Error("Clipboard API is unavailable.");
              }
              if (dom.snapshotCopy) {
                dom.snapshotCopy.textContent = "Copied!";
                dom.snapshotCopy.disabled = true;
              }
              if (snapshotCopyTimeout) {
                clearTimeout(snapshotCopyTimeout);
              }
              snapshotCopyTimeout = window.setTimeout(() => {
                clearSnapshotCopyFeedback();
              }, 1800);
            } catch (error) {
              logWarn("Unable to copy snapshot", error);
              setSnapshotNotice(dom.snapshotError, "Unable to copy automatically. Select and copy the snapshot text manually.", "error");
            }
          }

          function handleSnapshotDownload() {
            if (!latestSnapshotExport) {
              setSnapshotNotice(dom.snapshotError, "Generate a snapshot before downloading.", "error");
              return;
            }
            revokeSnapshotDownloadUrl();
            try {
              const blob = new Blob([latestSnapshotExport], { type: "application/json" });
              snapshotDownloadUrl = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = snapshotDownloadUrl;
              link.download = buildSnapshotFilename();
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.setTimeout(() => {
                revokeSnapshotDownloadUrl();
              }, 1500);
            } catch (error) {
              logWarn("Unable to download snapshot", error);
              setSnapshotNotice(dom.snapshotError, "Unable to download snapshot. Copy the text instead.", "error");
            }
          }

          async function handleSnapshotBundleDownload() {
            if (!latestSnapshotExport) {
              setSnapshotNotice(dom.snapshotError, "Generate a snapshot before creating a SharePoint bundle.", "error");
              return;
            }
            try {
              setSnapshotNotice(dom.snapshotError, "Preparing SharePoint bundle…", "info");
              await exportSnapshotBundle(latestSnapshotExport);
              setSnapshotNotice(dom.snapshotError, "Bundle ready. Upload the ZIP to your internal site.", "success");
            } catch (error) {
              logError("Unable to build SharePoint bundle", error);
              const message = error && error.message ? error.message : "Unable to create SharePoint bundle.";
              setSnapshotNotice(dom.snapshotError, message, "error");
            }
          }

          function openSnapshotImportDialog() {
            if (!dom.snapshotImportDialog || typeof dom.snapshotImportDialog.showModal !== "function") {
              logWarn("Snapshot import dialog is unavailable in this browser.");
              return;
            }
            resetSnapshotImportDialog();
            try {
              dom.snapshotImportDialog.showModal();
              if (dom.snapshotImportPassword) {
                dom.snapshotImportPassword.focus();
              }
            } catch (error) {
              logWarn("Unable to open snapshot import dialog", error);
            }
          }

          function closeSnapshotImportDialog() {
            if (dom.snapshotImportDialog && dom.snapshotImportDialog.open) {
              dom.snapshotImportDialog.close();
            }
          }

          function resetSnapshotImportDialog() {
            if (dom.snapshotImportText) {
              dom.snapshotImportText.value = "";
            }
            if (dom.snapshotImportPassword) {
              dom.snapshotImportPassword.value = "";
            }
            if (dom.snapshotImportFile) {
              dom.snapshotImportFile.value = "";
            }
            setSnapshotNotice(dom.snapshotImportError, "");
          }

          async function handleSnapshotImportSubmit(event) {
            event.preventDefault();
            if (!supportsSnapshotEncryption || !supportsDialogElement) {
              setSnapshotNotice(dom.snapshotImportError, "Secure snapshots are not supported in this browser.", "error");
              return;
            }
            const text = dom.snapshotImportText ? dom.snapshotImportText.value.trim() : "";
            const passwordInput = dom.snapshotImportPassword ? dom.snapshotImportPassword.value : "";
            if (!text) {
              setSnapshotNotice(dom.snapshotImportError, "Paste the snapshot text or choose a snapshot file.", "error");
              return;
            }
            if (!passwordInput) {
              setSnapshotNotice(dom.snapshotImportError, "Enter the shared password.", "error");
              return;
            }
            setSnapshotNotice(dom.snapshotImportError, "");
            try {
              if (dom.snapshotImportSubmit) {
                dom.snapshotImportSubmit.disabled = true;
                dom.snapshotImportSubmit.dataset.originalLabel = dom.snapshotImportSubmit.textContent || "";
                dom.snapshotImportSubmit.textContent = "Decrypting…";
              }
              setSnapshotNotice(dom.snapshotImportError, "Decrypting snapshot…", "info");
              const payload = await decryptSnapshotEnvelope(text, passwordInput);
              pendingSnapshotPayload = payload;
              closeSnapshotImportDialog();
              if (dom.uploadStatus) {
                dom.uploadStatus.textContent = "Decrypting snapshot and loading dataset...";
              }
              parseCsvTextContent(payload.dataset.csvText, {
                sourceName: payload.dataset.meta?.name || "Snapshot dataset",
                sourceSize: payload.dataset.meta?.size,
                savedMeta: payload.dataset.meta ? { ...payload.dataset.meta } : undefined
              });
            } catch (error) {
              const message = error && error.message ? error.message : "Unable to load snapshot. Check the password and snapshot text.";
              setSnapshotNotice(dom.snapshotImportError, message, "error");
            } finally {
              if (dom.snapshotImportPassword) {
                dom.snapshotImportPassword.value = "";
              }
              if (dom.snapshotImportSubmit) {
                dom.snapshotImportSubmit.disabled = false;
                const label = dom.snapshotImportSubmit.dataset.originalLabel || "Load snapshot";
                dom.snapshotImportSubmit.textContent = label;
                delete dom.snapshotImportSubmit.dataset.originalLabel;
              }
            }
          }

          function handleSnapshotImportFileSelection(event) {
            const file = event?.target?.files && event.target.files[0];
            if (!file) {
              return;
            }
            const reader = new FileReader();
            reader.onload = loadEvent => {
              const result = loadEvent?.target?.result;
              if (typeof result === "string") {
                if (dom.snapshotImportText) {
                  dom.snapshotImportText.value = result;
                }
              } else if (result instanceof ArrayBuffer) {
                try {
                  const decoder = new TextDecoder();
                  const text = decoder.decode(result);
                  if (dom.snapshotImportText) {
                    dom.snapshotImportText.value = text;
                  }
                } catch (error) {
                  logWarn("Unable to decode snapshot file", error);
                  setSnapshotNotice(dom.snapshotImportError, "Unable to decode the selected file.", "error");
                }
              }
              setSnapshotNotice(dom.snapshotImportError, "");
            };
            reader.onerror = () => {
              setSnapshotNotice(dom.snapshotImportError, "Unable to read the selected file.", "error");
            };
            reader.readAsText(file);
          }

          async function decryptSnapshotEnvelope(rawInput, password) {
            if (!supportsSnapshotEncryption) {
              throw new Error("Secure snapshots are not supported in this environment.");
            }
            let envelope;
            try {
              envelope = normalizeSnapshotEnvelope(rawInput);
            } catch (error) {
              throw new Error("Snapshot text is not valid JSON or recognized format.");
            }
            if (!envelope || typeof envelope !== "object") {
              throw new Error("Snapshot structure is invalid.");
            }
            if (!envelope.ciphertext || !envelope.iv || !envelope.kdf || !envelope.kdf.salt) {
              throw new Error("Snapshot is missing encryption metadata.");
            }
            const iterations = Number(envelope.kdf.iterations) || SNAPSHOT_KDF_ITERATIONS;
            const saltBytes = base64ToUint8Array(String(envelope.kdf.salt));
            const ivBytes = base64ToUint8Array(String(envelope.iv));
            const cipherBytes = base64ToUint8Array(String(envelope.ciphertext));
            const encoder = new TextEncoder();
            const passwordBytes = encoder.encode(password);
            try {
              const keyMaterial = await window.crypto.subtle.importKey(
                "raw",
                passwordBytes,
                { name: "PBKDF2" },
                false,
                ["deriveKey"]
              );
              const key = await window.crypto.subtle.deriveKey(
                {
                  name: "PBKDF2",
                  salt: saltBytes,
                  iterations,
                  hash: "SHA-256"
                },
                keyMaterial,
                { name: "AES-GCM", length: 256 },
                false,
                ["decrypt"]
              );
              const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivBytes },
                key,
                cipherBytes
              );
              const decoder = new TextDecoder();
              const payloadJson = decoder.decode(decryptedBuffer);
              const payload = JSON.parse(payloadJson);
              if (!payload || typeof payload !== "object") {
                throw new Error("Snapshot payload is empty.");
              }
              payload.dataset = await decodeSnapshotSection(payload.dataset, { label: "dataset" });
              if (!payload.dataset || typeof payload.dataset.csvText !== "string" || !payload.dataset.csvText.trim()) {
                throw new Error("Snapshot payload does not contain a dataset.");
              }
              if (payload.agentDataset) {
                try {
                  payload.agentDataset = await decodeSnapshotSection(payload.agentDataset, { label: "agent dataset" });
                } catch (agentError) {
                  logWarn("Unable to decode agent dataset snapshot", agentError);
                  payload.agentDataset = null;
                }
              }
              return payload;
            } catch (error) {
              if (error && (error.name === "OperationError" || error.name === "DOMException")) {
                throw new Error("Snapshot could not be decrypted. The password might be incorrect.");
              }
              throw new Error(error && error.message ? error.message : "Unable to decrypt snapshot.");
            } finally {
              passwordBytes.fill(0);
            }
          }

          function normalizeSnapshotEnvelope(raw) {
            if (typeof raw !== "string") {
              throw new Error("Snapshot text must be a string.");
            }
            const trimmed = raw.trim();
            if (!trimmed) {
              throw new Error("Snapshot text is empty.");
            }
            const normalized = trimmed.replace(/[\r\n\s]+/g, "");
            const compactPattern = new RegExp(`^${SNAPSHOT_PREFIX}\\.v(\\d+)\\.k(\\d+)\\.([^\\.]+)\\.([^\\.]+)\\.([^\\.]+)$`);
            const compactMatch = normalized.match(compactPattern);
            if (compactMatch) {
              const [, versionSegment, iterationsSegment, saltSegment, ivSegment, cipherSegment] = compactMatch;
              return {
                version: Number(versionSegment) || SNAPSHOT_VERSION,
                algorithm: "AES-GCM",
                kdf: {
                  name: "PBKDF2",
                  hash: "SHA-256",
                  iterations: Number(iterationsSegment) || SNAPSHOT_KDF_ITERATIONS,
                  salt: sanitizeSnapshotSegment(saltSegment)
                },
                iv: sanitizeSnapshotSegment(ivSegment),
                ciphertext: sanitizeSnapshotSegment(cipherSegment)
              };
            }
            const legacyPattern = new RegExp(`^${SNAPSHOT_PREFIX}\\.v(\\d+)\\.(.+)$`);
            const legacyMatch = normalized.match(legacyPattern);
            if (legacyMatch) {
              const base64Payload = sanitizeSnapshotSegment(legacyMatch[2]);
              const bytes = base64ToUint8Array(base64Payload);
              const decoder = new TextDecoder();
              const json = decoder.decode(bytes);
              return JSON.parse(json);
            }
            return JSON.parse(trimmed);
          }

          function applySnapshotState(snapshot) {
            if (!snapshot || typeof snapshot !== "object") {
              return false;
            }
            filterPreferencesApplied = true;
            let filtersApplied = false;
            if (snapshot.filters && typeof snapshot.filters === "object") {
              const preferences = {
                organization: Array.isArray(snapshot.filters.organization) ? snapshot.filters.organization : [],
                country: Array.isArray(snapshot.filters.country) ? snapshot.filters.country : [],
                timeframe: snapshot.filters.timeframe,
                customStart: snapshot.filters.customStart || null,
                customEnd: snapshot.filters.customEnd || null,
                aggregate: snapshot.filters.aggregate,
                metric: snapshot.filters.metric,
                group: snapshot.filters.group,
                organizationField: snapshot.filters.organizationField,
                countryField: snapshot.filters.countryField
              };
              filtersApplied = applyStoredFilterPreferences(preferences);
              if (Array.isArray(snapshot.filters.categorySelection)) {
                state.filters.categorySelection = new Set(snapshot.filters.categorySelection);
              }
            }
            if (!(state.filters.categorySelection instanceof Set)) {
              state.filters.categorySelection = new Set();
            }

            if (snapshot.theme) {
              applyTheme(snapshot.theme, { persist: false });
            }
            if (snapshot.trendView === "average" || snapshot.trendView === "total") {
              state.trendView = snapshot.trendView;
            }
            if (snapshot.seriesVisibility && typeof snapshot.seriesVisibility === "object") {
              state.seriesVisibility = { ...snapshot.seriesVisibility };
            } else {
              state.seriesVisibility = {};
            }
            if (snapshot.seriesDetailMode && (snapshot.seriesDetailMode === "respect" || snapshot.seriesDetailMode === "all" || snapshot.seriesDetailMode === "none")) {
              state.seriesDetailMode = snapshot.seriesDetailMode;
            }
            if (snapshot.returningMetric === "percentage" || snapshot.returningMetric === "total") {
              state.returningMetric = snapshot.returningMetric;
            }
            if (snapshot.returningInterval === "monthly" || snapshot.returningInterval === "weekly") {
              state.returningInterval = snapshot.returningInterval;
            }
            if (snapshot.activeDaysView === "prompts" || snapshot.activeDaysView === "users") {
              state.activeDaysView = snapshot.activeDaysView;
            }
            if (snapshot.usageTrendMode === "percentage" || snapshot.usageTrendMode === "number") {
              state.usageTrendMode = snapshot.usageTrendMode;
            }
            if (typeof snapshot.usageTrendRegion === "string") {
              state.usageTrendRegion = snapshot.usageTrendRegion;
            }
            if (typeof snapshot.returningRegion === "string") {
              state.returningRegion = snapshot.returningRegion;
            }
            if (Array.isArray(snapshot.usageMonthSelection)) {
              state.usageMonthSelection = snapshot.usageMonthSelection.map(String);
            }
            if (snapshot.usageThresholds && typeof snapshot.usageThresholds === "object") {
              const middle = Number(snapshot.usageThresholds.middle);
              const high = Number(snapshot.usageThresholds.high);
              if (Number.isFinite(middle)) {
                state.usageThresholds.middle = middle;
              }
              if (Number.isFinite(high)) {
                state.usageThresholds.high = high;
              }
            }
            if (snapshot.exportPreferences && typeof snapshot.exportPreferences === "object") {
              state.exportPreferences = {
                ...state.exportPreferences,
                includeDetails: snapshot.exportPreferences.includeDetails !== false
              };
            }
            if (snapshot.trendColorPreference && typeof snapshot.trendColorPreference === "object") {
              state.trendColorPreference = {
                start: snapshot.trendColorPreference.start || null,
                end: snapshot.trendColorPreference.end || null
              };
              refreshTrendColors();
            }
            if (snapshot.dimensionSelection && typeof snapshot.dimensionSelection === "object") {
              const dimension = snapshot.dimensionSelection.dimension;
              const metric = snapshot.dimensionSelection.metric;
              if (dimension === "organization" || dimension === "country") {
                state.dimensionSelection.dimension = dimension;
              }
              if (typeof metric === "string") {
                state.dimensionSelection.metric = metric;
              }
              if (snapshot.dimensionSelection.selected && typeof snapshot.dimensionSelection.selected === "object") {
                state.dimensionSelection.selected = {
                  country: new Set(Array.isArray(snapshot.dimensionSelection.selected.country) ? snapshot.dimensionSelection.selected.country : []),
                  organization: new Set(Array.isArray(snapshot.dimensionSelection.selected.organization) ? snapshot.dimensionSelection.selected.organization : [])
                };
              }
            }
            if (typeof snapshot.adoptionShowDetails === "boolean") {
              state.adoptionShowDetails = snapshot.adoptionShowDetails;
            }
            if (typeof snapshot.groupsExpanded === "boolean") {
              state.groupsExpanded = snapshot.groupsExpanded;
            }
            if (typeof snapshot.topUsersExpanded === "boolean") {
              state.topUsersExpanded = snapshot.topUsersExpanded;
            }
            if (Number.isFinite(snapshot.agentDisplayLimit)) {
              state.agentDisplayLimit = snapshot.agentDisplayLimit;
            }
            ensureCustomRangeDefaults();
            syncCustomRangeInputs();
            refreshFilterToggleStates();

            if (snapshot.agentDataset && snapshot.agentDataset.csvText) {
              parseAgentUsageText(snapshot.agentDataset.csvText, snapshot.agentDataset.meta || {});
            } else {
              state.agentUsageRows = [];
              state.agentUsageMeta = null;
              clearRememberedAgentDataset();
              updateAgentUsageCard([]);
            }
            return filtersApplied;
          }
      
          function loadPersistencePreference() {
            let consent = false;
            try {
              if (window.localStorage) {
                const stored = localStorage.getItem(DATA_CONSENT_KEY);
                if (stored !== null) {
                  consent = stored === "true";
                } else {
                  const legacy = localStorage.getItem(DATA_PERSISTENCE_KEY);
                  consent = legacy === "true";
                }
              }
            } catch (error) {
              logWarn("Unable to read caching preference", error);
            }
            state.persistDatasets = consent;
            if (dom.persistConsent) {
              dom.persistConsent.checked = consent;
            }
          }
      
          function persistPersistencePreference(enabled) {
            try {
              if (window.localStorage) {
                localStorage.setItem(DATA_CONSENT_KEY, String(Boolean(enabled)));
                localStorage.removeItem(DATA_PERSISTENCE_KEY);
              }
            } catch (error) {
              logWarn("Unable to persist caching preference", error);
            }
          }
      
          function storeDatasetMeta(meta) {
            if (!window.localStorage) {
              return;
            }
            try {
              localStorage.setItem(DATA_STORAGE_META_KEY, JSON.stringify(meta));
            } catch (error) {
              logWarn('Unable to store dataset metadata', error);
            }
          }
      
          function storeAgentDatasetMeta(meta) {
            if (!window.localStorage) {
              return;
            }
            try {
              localStorage.setItem(AGENT_DATA_STORAGE_META_KEY, JSON.stringify(meta));
            } catch (error) {
              logWarn('Unable to store agent dataset metadata', error);
            }
          }

          function buildAgentHubSnapshot() {
            const snapshot = {};
            if (!state.agentHub || !state.agentHub.datasets) {
              return snapshot;
            }
            AGENT_HUB_TYPES.forEach(type => {
              const dataset = state.agentHub.datasets[type];
              if (!dataset) {
                return;
              }
              const rows = Array.isArray(dataset.rows)
                ? dataset.rows.map(serializeAgentHubRow)
                : [];
              snapshot[type] = {
                rows,
                meta: dataset.meta || null
              };
            });
            return snapshot;
          }

          function serializeAgentHubRow(row) {
            const copy = { ...row };
            if (row.lastActivity instanceof Date && !Number.isNaN(row.lastActivity.getTime())) {
              copy.lastActivity = row.lastActivity.toISOString();
            }
            return copy;
          }

          function deserializeAgentHubRow(row) {
            const copy = { ...row };
            if (typeof row.lastActivity === "string" && row.lastActivity.length) {
              const parsed = new Date(row.lastActivity);
              copy.lastActivity = Number.isNaN(parsed.getTime()) ? null : parsed;
            }
            return copy;
          }

          function persistAgentHubSnapshot(snapshotOverride) {
            if (!state.persistDatasets) {
              return;
            }
            const snapshot = snapshotOverride || buildAgentHubSnapshot();
            if (!snapshot || typeof snapshot !== "object") {
              return;
            }
            const hasContent = AGENT_HUB_TYPES.some(type => Array.isArray(snapshot[type]?.rows) && snapshot[type].rows.length);
            if (!hasContent) {
              clearPersistedAgentHubSnapshot();
              return;
            }
            const persistPromise = DATA_DB_SUPPORTED
              ? saveAgentHubSnapshotToIndexedDB(snapshot).then(() => {
                  if (!persistAgentHubSnapshotToLocalStorage(snapshot)) {
                    logWarn("Unable to mirror agent hub datasets in local storage");
                  }
                }).catch(error => {
                  logWarn("Unable to persist agent hub datasets in IndexedDB", error);
                  return persistAgentHubSnapshotToLocalStorage(snapshot);
                })
              : Promise.resolve(persistAgentHubSnapshotToLocalStorage(snapshot));
            persistPromise.catch(error => {
              if (error) {
                logWarn("Unable to persist agent hub datasets", error);
              }
            });
            if (dom.agentStatus) {
              const suffix = " Saved locally.";
              if (!dom.agentStatus.textContent.includes(suffix)) {
                dom.agentStatus.textContent = `${dom.agentStatus.textContent}${suffix}`.trim();
              }
            }
          }

          function persistAgentHubSnapshotToLocalStorage(snapshot) {
            if (!window.localStorage) {
              return false;
            }
            try {
              localStorage.setItem(AGENT_HUB_STORAGE_KEY, JSON.stringify({ version: 1, datasets: snapshot }));
              return true;
            } catch (error) {
              logWarn("Unable to persist agent hub datasets in local storage", error);
              return false;
            }
          }

          function clearPersistedAgentHubSnapshot() {
            if (window.localStorage) {
              try {
                localStorage.removeItem(AGENT_HUB_STORAGE_KEY);
              } catch (error) {
                logWarn("Unable to clear stored agent hub datasets", error);
              }
            }
            deleteAgentHubSnapshotFromIndexedDB().catch(error => {
              if (error) {
                logWarn("Unable to delete agent hub datasets from IndexedDB", error);
              }
            });
          }
      
          function rememberLastDataset(csvText, meta = {}) {
            if (typeof csvText !== "string" || !csvText.length) {
              return;
            }
            if (state.datasetCachingDisabled) {
              return;
            }
            const sizeFromMeta = Number(meta.size);
            const sourceSize = Number(meta.sourceSize);
            const normalizedSize = Number.isFinite(sizeFromMeta)
              ? sizeFromMeta
              : (Number.isFinite(sourceSize) ? sourceSize : csvText.length);
            const rowsValue = Number(meta.rows);
            const normalizedRows = Number.isFinite(rowsValue) ? rowsValue : null;
            const savedAtValue = Number(meta.savedAt);
            const savedMetaSavedAt = Number(meta.savedMeta && meta.savedMeta.savedAt);
            lastParsedCsvText = csvText;
            lastParsedCsvMeta = {
              name: meta.name || meta.sourceName || (meta.savedMeta && meta.savedMeta.name) || "Saved dataset",
              size: normalizedSize,
              rows: normalizedRows,
              lastModified: meta.lastModified
                || (meta.savedMeta && meta.savedMeta.lastModified)
                || null,
              savedAt: Number.isFinite(savedAtValue)
                ? savedAtValue
                : (Number.isFinite(savedMetaSavedAt) ? savedMetaSavedAt : null)
            };
            updateSnapshotControlsAvailability();
          }

          function rememberLastAgentDataset(csvText, meta = {}) {
            if (typeof csvText !== "string" || !csvText.length) {
              return;
            }
            const sizeFromMeta = Number(meta.size);
            const sourceSize = Number(meta.sourceSize);
            const normalizedSize = Number.isFinite(sizeFromMeta)
              ? sizeFromMeta
              : (Number.isFinite(sourceSize) ? sourceSize : csvText.length);
            const rowsValue = Number(meta.rows);
            const normalizedRows = Number.isFinite(rowsValue) ? rowsValue : null;
            const savedAtValue = Number(meta.savedAt);
            const savedMetaSavedAt = Number(meta.savedMeta && meta.savedMeta.savedAt);
            lastParsedAgentCsvText = csvText;
            lastParsedAgentMeta = {
              name: meta.name || meta.sourceName || (meta.savedMeta && meta.savedMeta.name) || "Agent dataset",
              size: normalizedSize,
              rows: normalizedRows,
              lastModified: meta.lastModified
                || (meta.savedMeta && meta.savedMeta.lastModified)
                || null,
              savedAt: Number.isFinite(savedAtValue)
                ? savedAtValue
                : (Number.isFinite(savedMetaSavedAt) ? savedMetaSavedAt : null)
            };
            updateSnapshotControlsAvailability();
          }

          function clearRememberedDataset() {
            lastParsedCsvText = null;
            lastParsedCsvMeta = null;
            bufferedCsvText = null;
          }

          function clearRememberedAgentDataset() {
            lastParsedAgentCsvText = null;
            lastParsedAgentMeta = null;
          }

          function compressDatasetText(csvText) {
            if (typeof csvText !== "string" || !csvText.length || !window.pako || csvText.length < 2048) {
              return { data: csvText, encoding: "plain" };
            }
            try {
              const deflated = window.pako.deflate(csvText);
              let binary = "";
              for (let index = 0; index < deflated.length; index += 1) {
                binary += String.fromCharCode(deflated[index]);
              }
              return { data: btoa(binary), encoding: "base64-deflate" };
            } catch (error) {
              logWarn("Unable to compress dataset for storage", error);
              return { data: csvText, encoding: "plain" };
            }
          }

          function decompressDatasetText(data, encoding) {
            if (encoding !== "base64-deflate" || !window.pako || typeof data !== "string") {
              return data || "";
            }
            try {
              const binary = atob(data);
              const bytes = new Uint8Array(binary.length);
              for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
              }
              const inflated = window.pako.inflate(bytes);
              if (typeof TextDecoder !== "undefined") {
                return new TextDecoder().decode(inflated);
              }
              let result = "";
              inflated.forEach(code => {
                result += String.fromCharCode(code);
              });
              return result;
            } catch (error) {
              logWarn("Unable to decompress stored dataset", error);
              return data || "";
            }
          }

          function persistDatasetToLocalStorage(csvText, normalizedMeta) {
            if (!window.localStorage) {
              return false;
            }
            try {
              const { data, encoding } = compressDatasetText(csvText);
              const payload = {
                version: 2,
                csv: data,
                encoding,
                meta: normalizedMeta
              };
              localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(payload));
              updateStoredDatasetControls(normalizedMeta);
              storeDatasetMeta(normalizedMeta);
              return true;
            } catch (storageError) {
              logWarn("Unable to persist dataset in localStorage", storageError);
              return false;
            }
          }

          function persistDataset(csvText, meta = {}) {
            if (typeof csvText !== "string") {
              return;
            }
            if (!state.persistDatasets) {
              updateStoredDatasetControls(null);
              if (dom.uploadStatus) {
                dom.uploadStatus.textContent = "Dataset loaded. Opt in above to save it on this device.";
              }
              return;
            }
            const normalizedMeta = {
              name: meta.name || "Saved dataset",
              size: typeof meta.size === "number" ? meta.size : csvText.length,
              rows: meta.rows || null,
              lastModified: meta.lastModified || null,
              savedAt: Date.now()
            };
            rememberLastDataset(csvText, normalizedMeta);
            updateStoredDatasetControls(normalizedMeta);
            const setSavedStatusMessage = () => {
              if (dom.uploadStatus) {
                const suffix = " Saved locally.";
                if (!dom.uploadStatus.textContent.includes(suffix)) {
                  dom.uploadStatus.textContent = `${dom.uploadStatus.textContent}${suffix}`.trim();
                }
              }
            };
            const handleLocalStorageFallback = error => {
              if (error) {
                logWarn("Unable to persist dataset in IndexedDB", error);
              }
              if (persistDatasetToLocalStorage(csvText, normalizedMeta)) {
                setSavedStatusMessage();
              } else if (dom.uploadStatus) {
                dom.uploadStatus.textContent = "Loaded dataset, but unable to store it locally.";
              }
            };
            if (DATA_DB_SUPPORTED) {
              saveDatasetToIndexedDB(csvText, normalizedMeta).then(savedMeta => {
                updateStoredDatasetControls(savedMeta);
                storeDatasetMeta(savedMeta);
                setSavedStatusMessage();
                if (!persistDatasetToLocalStorage(csvText, savedMeta)) {
                  logWarn("Unable to mirror dataset in local storage");
                }
              }).catch(handleLocalStorageFallback);
              return;
            }
            handleLocalStorageFallback(null);
          }
      
          function persistAgentDataset(csvText, meta = {}) {
            if (typeof csvText !== "string" || !csvText.trim()) {
              return;
            }
            if (!state.persistDatasets) {
              return;
            }
            const normalizedMeta = {
              name: meta.name || "Agent usage export",
              size: typeof meta.size === "number" ? meta.size : csvText.length,
              rows: meta.rows || null,
              lastModified: meta.lastModified || null,
              savedAt: Date.now()
            };
            rememberLastAgentDataset(csvText, normalizedMeta);
            const setSavedStatusMessage = () => {
              if (dom.agentStatus) {
                const suffix = " Saved locally.";
                if (!dom.agentStatus.textContent.includes(suffix)) {
                  dom.agentStatus.textContent = `${dom.agentStatus.textContent}${suffix}`.trim();
                }
              }
            };
            const persistToLocalStorage = () => {
              if (!window.localStorage) {
                return false;
              }
              try {
                const payload = {
                  version: 1,
                  csv: csvText,
                  meta: normalizedMeta
                };
                localStorage.setItem(AGENT_DATA_STORAGE_KEY, JSON.stringify(payload));
                storeAgentDatasetMeta(normalizedMeta);
                if (state.agentUsageMeta) {
                  state.agentUsageMeta.savedAt = normalizedMeta.savedAt;
                }
                setSavedStatusMessage();
                return true;
              } catch (error) {
                logWarn("Unable to persist agent dataset in local storage", error);
                try {
                  localStorage.removeItem(AGENT_DATA_STORAGE_META_KEY);
                } catch (metaError) {
                  logWarn("Unable to clear agent dataset metadata", metaError);
                }
                return false;
              }
            };
            if (DATA_DB_SUPPORTED) {
              saveAgentDatasetToIndexedDB(csvText, normalizedMeta).then(savedMeta => {
                storeAgentDatasetMeta(savedMeta);
                if (state.agentUsageMeta) {
                  state.agentUsageMeta.savedAt = savedMeta.savedAt;
                }
                if (window.localStorage) {
                  try {
                    localStorage.removeItem(AGENT_DATA_STORAGE_KEY);
                  } catch (cleanupError) {
                    logWarn("Unable to clear legacy agent dataset cache", cleanupError);
                  }
                }
                setSavedStatusMessage();
              }).catch(error => {
                logWarn("Unable to persist agent dataset in IndexedDB", error);
                if (!persistToLocalStorage() && dom.agentStatus) {
                  dom.agentStatus.textContent = "Loaded agent dataset, but unable to store it locally.";
                }
              });
              return;
            }
            if (!persistToLocalStorage() && dom.agentStatus) {
              dom.agentStatus.textContent = "Loaded agent dataset, but local storage is unavailable.";
            }
          }
      
          function clearStoredDataset({ quiet = false, keepRuntime = false } = {}) {
            const clearLocalStorage = () => {
              if (!window.localStorage) {
                return;
              }
              try {
                localStorage.removeItem(DATA_STORAGE_KEY);
                localStorage.removeItem(DATA_STORAGE_META_KEY);
                localStorage.removeItem(AGENT_DATA_STORAGE_KEY);
                localStorage.removeItem(AGENT_DATA_STORAGE_META_KEY);
                localStorage.removeItem(AGENT_HUB_STORAGE_KEY);
              } catch (error) {
                logWarn('Unable to clear saved dataset metadata', error);
              }
            };
            const finalizeClear = () => {
              clearLocalStorage();
              clearPersistedAgentHubSnapshot();
              updateStoredDatasetControls(null);
              if (!keepRuntime) {
                state.agentUsageRows = [];
                state.agentUsageMeta = null;
                state.agentDisplayLimit = 5;
                state.agentSort = { column: "responses", direction: "desc" };
                updateAgentUsageCard([]);
                clearRememberedDataset();
                clearRememberedAgentDataset();
                AGENT_HUB_TYPES.forEach(type => resetAgentHubDataset(type, { skipPersist: true }));
                if (dom.agentStatus) {
                  dom.agentStatus.textContent = quiet ? "Agent dataset cleared." : "Agent dataset cleared from this device.";
                }
                if (!quiet && dom.uploadStatus) {
                  dom.uploadStatus.textContent = 'Saved dataset removed from this device.';
                }
              } else {
                updateAgentUsageCard(state.agentUsageRows);
              }
            };
            if (!DATA_DB_SUPPORTED) {
              finalizeClear();
              return;
            }
            Promise.allSettled([
              deleteDatasetFromIndexedDB(),
              deleteAgentDatasetFromIndexedDB()
            ]).then(() => {
              finalizeClear();
            });
          }
      
          function loadAgentDatasetFromLocalStorageLegacy() {
            if (!window.localStorage) {
              return;
            }
            try {
              const raw = localStorage.getItem(AGENT_DATA_STORAGE_KEY);
              if (!raw) {
                return;
              }
              const payload = JSON.parse(raw);
              if (!payload || typeof payload !== "object") {
                return;
              }
              let savedMeta = payload.meta || {};
              if ((!savedMeta || Object.keys(savedMeta).length === 0) && window.localStorage) {
                try {
                  const metaRaw = localStorage.getItem(AGENT_DATA_STORAGE_META_KEY);
                  if (metaRaw) {
                    const parsedMeta = JSON.parse(metaRaw);
                    if (parsedMeta && typeof parsedMeta === "object") {
                      savedMeta = parsedMeta;
                    }
                  }
                } catch (metaError) {
                  logWarn("Unable to read agent dataset metadata", metaError);
                }
              }
              if (payload.csv && typeof payload.csv === "string" && payload.csv.trim()) {
                if (DATA_DB_SUPPORTED) {
                  saveAgentDatasetToIndexedDB(payload.csv, savedMeta).then(metaUpdate => {
                    storeAgentDatasetMeta(metaUpdate);
                    try {
                      localStorage.removeItem(AGENT_DATA_STORAGE_KEY);
                    } catch (cleanupError) {
                      logWarn("Unable to clear legacy agent dataset cache", cleanupError);
                    }
                  }).catch(error => {
                    logWarn("Unable to migrate agent dataset to IndexedDB", error);
                  });
                }
                if (dom.agentStatus) {
                  dom.agentStatus.textContent = "Restoring saved agent usage dataset...";
                }
                parseAgentUsageText(payload.csv, savedMeta);
              }
            } catch (error) {
              logWarn("Unable to read saved agent dataset from localStorage", error);
            }
          }
      
          function loadStoredAgentDatasetFromDevice() {
            if (!state.persistDatasets) {
              return;
            }
            if (!DATA_DB_SUPPORTED) {
              loadAgentDatasetFromLocalStorageLegacy();
              return;
            }
            loadAgentDatasetFromIndexedDB().then(record => {
              if (!record || !record.csv) {
                loadAgentDatasetFromLocalStorageLegacy();
                return;
              }
              const savedMeta = record.meta || {};
              storeAgentDatasetMeta(savedMeta);
              if (dom.agentStatus) {
                dom.agentStatus.textContent = "Restoring saved agent usage dataset...";
              }
              parseAgentUsageText(record.csv, savedMeta);
            }).catch(error => {
              logWarn("Unable to read saved agent dataset from IndexedDB", error);
              loadAgentDatasetFromLocalStorageLegacy();
            });
          }
      
          function isCsvFile(file) {
            if (!file) {
              return false;
            }
            const type = (file.type || "").toLowerCase();
            if (type && CSV_ACCEPTED_MIME_TYPES.has(type)) {
              return true;
            }
            const name = (file.name || "").toLowerCase();
            return name.endsWith(".csv");
          }
      
          function validateCsvFile(file) {
            if (!isCsvFile(file)) {
              showUploadError("Only CSV exports are supported. Please choose a .csv file.");
              return false;
            }
            if (Number.isFinite(file.size) && file.size > MAX_DATASET_FILE_SIZE) {
              const limitMb = Math.round(MAX_DATASET_FILE_SIZE / (1024 * 1024));
              showUploadError(`File is too large. Please choose a CSV under ${limitMb} MB.`);
              return false;
            }
            return true;
          }
      
          function showUploadError(message) {
            if (dom.uploadStatus) {
              dom.uploadStatus.textContent = message;
            }
            if (dom.postUploadCta) {
              dom.postUploadCta.hidden = true;
            }
            if (dom.datasetMessage) {
              dom.datasetMessage.textContent = "Upload a valid CSV export to continue.";
            }
            if (dom.uploadMeta) {
              dom.uploadMeta.textContent = "No file chosen yet.";
            }
            if (dom.uploadProgress) {
              dom.uploadProgress.hidden = true;
            }
            if (dom.uploadProgressBar) {
              dom.uploadProgressBar.value = 0;
            }
            if (dom.uploadZone) {
              dom.uploadZone.classList.add("is-error");
            }
          }
      
          function clearUploadError() {
            if (dom.uploadZone) {
              dom.uploadZone.classList.remove("is-error");
            }
          }

          function updatePostUploadCtaVisibility() {
            const hasDataset = Array.isArray(state.rows) && state.rows.length > 0;
            if (dom.postUploadCta) {
              dom.postUploadCta.hidden = !hasDataset;
            }
          }
      
          function computePercent(cursor, size) {
            if (!Number.isFinite(cursor) || !Number.isFinite(size) || size <= 0) {
              return null;
            }
            return (cursor / size) * 100;
          }
      
          function startUploadProgress(file) {
            if (dom.uploadProgress) {
              dom.uploadProgress.hidden = false;
            }
            if (dom.uploadProgressBar) {
              dom.uploadProgressBar.value = 0;
              dom.uploadProgressBar.max = 100;
            }
            if (dom.uploadStatus) {
              const label = file && file.name ? file.name : "dataset";
              dom.uploadStatus.textContent = `Parsing ${label}...`;
            }
            if (dom.datasetMessage) {
              dom.datasetMessage.textContent = "Parsing in progress...";
            }
            if (dom.datasetMetaWrapper) {
              dom.datasetMetaWrapper.hidden = true;
            }
          }
      
          function updateUploadProgress({ percent, rowsProcessed }) {
            const boundedPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null;
            if (dom.uploadProgressBar && boundedPercent != null) {
              dom.uploadProgressBar.value = boundedPercent;
            }
            if (dom.uploadStatus) {
              const pieces = [];
              if (boundedPercent != null) {
                pieces.push(`${boundedPercent}% complete`);
              }
              if (Number.isFinite(rowsProcessed) && rowsProcessed > 0) {
                pieces.push(`${numberFormatter.format(rowsProcessed)} rows processed`);
              }
              dom.uploadStatus.textContent = pieces.length
                ? `Parsing ${pieces.join(" - ")}...`
                : "Parsing in progress...";
            }
          }
      
          function finishUploadProgress(message) {
            if (dom.uploadProgress) {
              dom.uploadProgress.hidden = true;
            }
            if (dom.uploadProgressBar) {
              dom.uploadProgressBar.value = 0;
            }
            if (message && dom.uploadStatus) {
              dom.uploadStatus.textContent = message;
            }
          }
      
          function setActiveParseController(controller) {
            activeParseController = controller;
            if (dom.uploadCancel) {
              const isActive = Boolean(controller);
              dom.uploadCancel.disabled = !isActive;
              dom.uploadCancel.setAttribute("aria-disabled", String(!isActive));
            }
          }
      
          function cancelActiveParse(options = {}) {
            const silent = Boolean(options && options.silent);
            if (!activeParseController) {
              return;
            }
            activeParseController.aborted = true;
            activeParseController.silentAbort = silent;
            if (activeParseController.parser && typeof activeParseController.parser.abort === "function") {
              try {
                activeParseController.parser.abort();
              } catch (error) {
                logWarn("Unable to abort parser", error);
              }
            }
            finishUploadProgress(silent ? null : "Import canceled.");
            setActiveParseController(null);
            if (!silent && dom.datasetMessage) {
              dom.datasetMessage.textContent = "Upload canceled. Select a CSV to try again.";
            }
          }
      
          function handleFile(file) {
            if (!file) {
              return;
            }
            cancelActiveParse({ silent: true });
            clearUploadError();
            if (!validateCsvFile(file)) {
              return;
            }
            detectCsvFileType(file).then(type => {
              if (type === "agent") {
                parseAgentUsageFile(file);
              } else {
                processCopilotDatasetFile(file);
              }
            }).catch(() => {
              processCopilotDatasetFile(file);
            });
          }
      
          function detectCsvFileType(file) {
            if (!file) {
              return Promise.resolve("unknown");
            }
            const name = (file.name || "").toLowerCase();
            if (name.includes("agent") && (name.includes("usage") || name.includes("copilot"))) {
              return Promise.resolve("agent");
            }
            if (typeof file.slice !== "function") {
              return Promise.resolve("copilot");
            }
            try {
              const snippet = file.slice(0, 4096);
              if (!snippet || typeof snippet.text !== "function") {
                return Promise.resolve("copilot");
              }
              return snippet.text().then(text => {
                const headerLine = String(text || "").split(/\r?\n/).find(line => line.trim());
                if (!headerLine) {
                  return "copilot";
                }
                const normalized = headerLine.trim().toLowerCase();
                const agentTokens = ["agent id", "agent name", "responses sent to users"];
                const matches = agentTokens.filter(token => normalized.includes(token));
                return matches.length >= 2 ? "agent" : "copilot";
              }).catch(() => "copilot");
            } catch (error) {
              logWarn("Unable to inspect CSV header", error);
              return Promise.resolve("copilot");
            }
          }
      
          function finalizeParsedDataset(context, meta = {}) {
            currentCsvFieldLookup = null;
            filterPreferencesApplied = false;
            const {
              parsedRows,
              uniquePersons,
              organizations,
              countries,
              domains,
              earliestDate,
              latestDate,
              skippedRows,
              rowErrors
            } = context;
      
            state.rows = parsedRows;
            state.uniquePersons = uniquePersons;
            state.earliestDate = earliestDate;
            state.latestDate = latestDate;
            state.uniqueOrganizations = organizations;
            state.uniqueCountries = countries || new Set();
            state.uniqueDomains = domains || new Set();
            state.filters.customStart = earliestDate ? new Date(earliestDate.getTime()) : null;
            state.filters.customEnd = latestDate ? new Date(latestDate.getTime()) : null;
            state.filters.customRangeInvalid = false;
            syncCustomRangeInputs();
            updateCustomRangeVisibility();
            refreshFilterOptionsFromFieldSelection();
      
            const notes = [];
            if (skippedRows) {
              notes.push(`skipped ${skippedRows} rows with missing dates or values`);
            }
            if (rowErrors) {
              notes.push(`${rowErrors} row parse errors`);
            }
            const notesText = notes.length ? ` (${notes.join('; ')})` : '';
      
            const rowCount = parsedRows.length;
            const rowCountText = numberFormatter.format(rowCount);
            const sizeBytes = typeof meta.sourceSize === 'number' ? meta.sourceSize : null;
            const sizeText = typeof sizeBytes === 'number' ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : null;
            const sourceName = meta.sourceName || (meta.savedMeta && meta.savedMeta.name);
            const formattedSource = sourceName ? shortenLabel(sourceName) : null;
      
            if (dom.uploadMeta) {
              if (formattedSource && sizeText) {
                dom.uploadMeta.textContent = `${formattedSource} · ${sizeText}`;
              } else if (formattedSource) {
                dom.uploadMeta.textContent = formattedSource;
              } else if (sizeText) {
                dom.uploadMeta.textContent = sizeText;
              } else {
                dom.uploadMeta.textContent = `${rowCountText} rows`;
              }
            }
      
            if (dom.uploadStatus) {
              dom.uploadStatus.textContent = meta.loadedFromStorage
                ? "Saved dataset loaded."
                : `Loaded ${rowCountText} rows${notesText}.`;
            }
      
            if (dom.datasetMessage) {
              dom.datasetMessage.textContent = meta.loadedFromStorage
                ? 'Dataset restored. Filters reflect detected segments.'
                : 'Dataset ready. Filters reflect detected segments.';
            }
      
            if (dom.datasetMetaWrapper) {
              dom.datasetMetaWrapper.hidden = false;
            }
            if (dom.metaRecords) {
              dom.metaRecords.textContent = rowCountText;
            }
            if (dom.metaUsers) {
              dom.metaUsers.textContent = numberFormatter.format(uniquePersons.size);
            }
            if (dom.metaRange) {
              dom.metaRange.textContent = formatRangeLabel(earliestDate, latestDate);
            }
            if (dom.metaOrgs) {
              dom.metaOrgs.textContent = numberFormatter.format(organizations.size || 0);
            }
      
            const snapshotPayload = pendingSnapshotPayload;
            let snapshotFiltersApplied = false;
            if (snapshotPayload && snapshotPayload.dataset && snapshotPayload.dataset.csvText === lastParsedCsvText) {
              try {
                snapshotFiltersApplied = applySnapshotState(snapshotPayload);
              } catch (error) {
                logWarn("Unable to apply snapshot state", error);
              } finally {
                pendingSnapshotPayload = null;
              }
            } else {
              pendingSnapshotPayload = null;
            }
            renderDashboard();
            if (!snapshotFiltersApplied) {
              maybeApplyStoredFilters();
            }
            persistFilterPreferences();
            setTrendColorControlsVisibility(state.filters.metric !== "hours");
      
            if (meta.savedMeta) {
              const storedMeta = {
                ...meta.savedMeta,
                name: meta.savedMeta.name || sourceName,
                rows: meta.savedMeta.rows || rowCount
              };
              updateStoredDatasetControls(storedMeta);
            }
            updatePostUploadCtaVisibility();
          }
      
          function parseCsvTextContent(csvText, meta = {}) {
            currentCsvFieldLookup = null;
            const parsedRows = [];
            const uniquePersons = new Set();
            const organizations = new Set();
            const countries = new Set();
            const domains = new Set();
            let earliestDate = null;
            let latestDate = null;
            let skippedRows = 0;
            let rowErrors = 0;

            const detectedDelimiter = detectDelimiterFromSample(csvText);
            const csvSizeBytes = Number.isFinite(meta.sourceSize) ? meta.sourceSize : csvText.length * 2;
            const loadedFromStorage = Boolean(meta.loadedFromStorage || meta.savedMeta);

            Papa.parse(csvText, {
              header: true,
              skipEmptyLines: true,
              delimiter: detectedDelimiter || "",
              worker: true,
              chunkSize: 256 * 1024,
              step: results => {
                const raw = results.data;
                ensureDatasetFieldLookup(results?.meta?.fields, raw);
                if (results.errors && results.errors.length) {
                  rowErrors += results.errors.length;
                }
                if (!raw || Object.keys(raw).length === 0) {
                  skippedRows += 1;
                  return;
                }
                const parsed = transformRow(raw);
                if (!parsed) {
                  skippedRows += 1;
                  return;
                }
                parsedRows.push(parsed);
                if (parsed.totalActions > 0 || parsed.assistedHours > 0) {
                  uniquePersons.add(parsed.personId);
                }
                if (parsed.organization) {
                  organizations.add(parsed.organization);
                }
                if (parsed.country) {
                  countries.add(parsed.country);
                }
                if (parsed.domain) {
                  domains.add(parsed.domain);
                }
                if (!earliestDate || parsed.date < earliestDate) {
                  earliestDate = parsed.date;
                }
                if (!latestDate || parsed.date > latestDate) {
                  latestDate = parsed.date;
                }
              },
              error: error => {
                const message = error && error.message ? error.message : String(error);
                dom.uploadStatus.textContent = `Saved dataset could not be loaded (${message}).`;
                dom.datasetMessage.textContent = "Stored dataset was cleared. Load a CSV to continue.";
                dom.datasetMetaWrapper.hidden = true;
                clearStoredDataset({ quiet: true });
              },
              complete: () => {
                if (!parsedRows.length) {
                  dom.uploadStatus.textContent = "Saved dataset was empty or unreadable.";
                  dom.datasetMessage.textContent = "Stored dataset was cleared. Load a CSV to continue.";
                  dom.datasetMetaWrapper.hidden = true;
                  clearStoredDataset({ quiet: true });
                  return;
                }

                const runtimeMeta = {
                  name: meta.sourceName || (meta.savedMeta && meta.savedMeta.name) || "Saved dataset",
                  size: Number.isFinite(csvSizeBytes) ? csvSizeBytes : csvText.length,
                  rows: parsedRows.length,
                  lastModified: meta.savedMeta?.lastModified || meta.lastModified || null,
                  savedAt: meta.savedMeta?.savedAt || null
                };
                state.datasetSizeBytes = runtimeMeta.size;
                state.datasetCachingDisabled = datasetExceedsCacheLimit(runtimeMeta.size);
                rememberLastDataset(csvText, runtimeMeta);

                const savedMetaPayload = loadedFromStorage && (meta.savedMeta
                  ? { ...meta.savedMeta, rows: parsedRows.length }
                  : { name: runtimeMeta.name, rows: parsedRows.length, savedAt: runtimeMeta.savedAt });

                finalizeParsedDataset({
                  parsedRows,
                  uniquePersons,
                  organizations,
                  countries,
                  domains,
                  earliestDate,
                  latestDate,
                  skippedRows,
                  rowErrors
                }, {
                  sourceName: runtimeMeta.name,
                  sourceSize: runtimeMeta.size,
                  loadedFromStorage,
                  savedMeta: savedMetaPayload || undefined
                });

                if (state.datasetCachingDisabled) {
                  bufferedCsvText = null;
                  clearRememberedDataset();
                  updateStoredDatasetControls(null);
                  if (dom.uploadStatus) {
                    dom.uploadStatus.textContent = `Dataset loaded (${formatFileSize(runtimeMeta.size)}). ${getDatasetCacheLimitMessage()}`;
                  }
                  updateSnapshotControlsAvailability();
                  return;
                }

                if (!state.datasetCachingDisabled && state.persistDatasets && !loadedFromStorage && !meta.skipPersistence) {
                  persistDataset(csvText, {
                    ...runtimeMeta,
                    sourceName: runtimeMeta.name
                  });
                }
              }
            });
          }

          function loadDatasetFromLocalStorageLegacy() {
            if (!window.localStorage) {
              updateStoredDatasetControls(null);
              return;
            }
            if (!state.persistDatasets) {
              updateStoredDatasetControls(null);
              return;
            }
            try {
              const raw = localStorage.getItem(DATA_STORAGE_KEY);
              if (!raw) {
                updateStoredDatasetControls(null);
                return;
              }
              const payload = JSON.parse(raw);
              if (!payload || typeof payload !== "object") {
                updateStoredDatasetControls(null);
                return;
              }
              let savedMeta = payload.meta || {};
              if ((!savedMeta || Object.keys(savedMeta).length === 0) && window.localStorage) {
                try {
                  const metaRaw = localStorage.getItem(DATA_STORAGE_META_KEY);
                  if (metaRaw) {
                    const parsedMeta = JSON.parse(metaRaw);
                    if (parsedMeta && typeof parsedMeta === "object") {
                      savedMeta = parsedMeta;
                    }
                  }
                } catch (metaError) {
                  logWarn("Unable to read dataset metadata", metaError);
                }
              }
              const hasMeta = savedMeta && (savedMeta.name || savedMeta.rows || savedMeta.size);
              updateStoredDatasetControls(hasMeta ? savedMeta : null);
              const storedCsv = typeof payload.csv === "string" ? payload.csv : "";
              const encoding = typeof payload.encoding === "string" ? payload.encoding : "plain";
              const csvText = decompressDatasetText(storedCsv, encoding);
              if (typeof csvText === "string" && csvText.trim()) {
                if (DATA_DB_SUPPORTED) {
                  saveDatasetToIndexedDB(csvText, savedMeta).then(metaUpdate => {
                    storeDatasetMeta(metaUpdate);
                    try {
                      localStorage.removeItem(DATA_STORAGE_KEY);
                    } catch (cleanupError) {
                      logWarn("Unable to clear legacy dataset cache", cleanupError);
                    }
                  }).catch(error => {
                    logWarn("Unable to migrate dataset to IndexedDB", error);
                  });
                }
                if (dom.uploadStatus) {
                  dom.uploadStatus.textContent = "Restoring saved dataset...";
                }
                parseCsvTextContent(csvText, {
                  sourceName: savedMeta.name || "Saved dataset",
                  sourceSize: savedMeta.size,
                  savedMeta
                });
              }
            } catch (error) {
              logWarn("Unable to read saved dataset from localStorage", error);
              updateStoredDatasetControls(null);
            }
          }
      
          function loadStoredDatasetFromDevice() {
            if (!state.persistDatasets) {
              updateStoredDatasetControls(null);
              return;
            }
            if (!DATA_DB_SUPPORTED) {
              loadDatasetFromLocalStorageLegacy();
              return;
            }
            loadDatasetFromIndexedDB().then(record => {
              if (!record || !record.csv) {
                loadDatasetFromLocalStorageLegacy();
                return;
              }
              const savedMeta = record.meta || {};
              updateStoredDatasetControls(savedMeta);
              storeDatasetMeta(savedMeta);
              if (dom.uploadStatus) {
                dom.uploadStatus.textContent = "Restoring saved dataset...";
              }
              parseCsvTextContent(record.csv, {
                sourceName: savedMeta.name || "Saved dataset",
                sourceSize: savedMeta.size,
                savedMeta
              });
            }).catch(error => {
              logWarn("Unable to read saved dataset from IndexedDB", error);
              loadDatasetFromLocalStorageLegacy();
            });
          }

          function loadStoredAgentHubDatasetsFromDevice() {
            if (!state.persistDatasets) {
              return;
            }
            const applySnapshot = snapshot => {
              if (snapshot && typeof snapshot === "object") {
                applyAgentHubSnapshot(snapshot, { statusPrefix: "Restored" });
                if (DATA_DB_SUPPORTED) {
                  persistAgentHubSnapshotToLocalStorage(snapshot);
                }
                return true;
              }
              return false;
            };
            const loadFromLocalStorage = () => {
              const snapshot = loadAgentHubSnapshotFromLocalStorage();
              applySnapshot(snapshot);
            };
            if (!DATA_DB_SUPPORTED) {
              loadFromLocalStorage();
              return;
            }
            loadAgentHubSnapshotFromIndexedDB().then(snapshot => {
              if (!applySnapshot(snapshot)) {
                loadFromLocalStorage();
              }
            }).catch(error => {
              logWarn("Unable to read agent hub datasets from IndexedDB", error);
              loadFromLocalStorage();
            });
          }
      
          function processCopilotDatasetFile(file) {
            if (!file) {
              return;
            }
            const sizeInMb = Number.isFinite(file.size) ? (file.size / (1024 * 1024)).toFixed(1) : null;
            if (dom.uploadMeta) {
              if (file.name && sizeInMb) {
                dom.uploadMeta.textContent = `${shortenLabel(file.name)}${BULLET_SEPARATOR}${sizeInMb} MB`;
              } else if (file.name) {
                dom.uploadMeta.textContent = shortenLabel(file.name);
              } else if (sizeInMb) {
                dom.uploadMeta.textContent = `${sizeInMb} MB`;
              } else {
                dom.uploadMeta.textContent = "";
              }
            }

            clearUploadError();
            startUploadProgress(file);

            currentCsvFieldLookup = null;
            const controller = {
              file,
              fileSize: Number.isFinite(file.size) ? file.size : 0,
              rowsProcessed: 0,
              aborted: false,
              parser: null,
              silentAbort: false
            };
            setActiveParseController(controller);

            const accumulators = {
              parsedRows: [],
              uniquePersons: new Set(),
              organizations: new Set(),
              countries: new Set(),
              domains: new Set(),
              earliestDate: null,
              latestDate: null,
              skippedRows: 0,
              rowErrors: 0
            };

            const resetAccumulators = () => {
              accumulators.parsedRows.length = 0;
              accumulators.uniquePersons.clear();
              accumulators.organizations.clear();
              accumulators.countries.clear();
              accumulators.domains.clear();
              accumulators.earliestDate = null;
              accumulators.latestDate = null;
              accumulators.skippedRows = 0;
              accumulators.rowErrors = 0;
              controller.rowsProcessed = 0;
            };

            const processRow = raw => {
              if (!raw || (typeof raw === "object" && Object.keys(raw).length === 0)) {
                accumulators.skippedRows += 1;
                return;
              }
              ensureDatasetFieldLookup(null, raw);
              const parsed = transformRow(raw);
              if (!parsed) {
                accumulators.skippedRows += 1;
                return;
              }
              accumulators.parsedRows.push(parsed);
              if (parsed.totalActions > 0 || parsed.assistedHours > 0) {
                accumulators.uniquePersons.add(parsed.personId);
              }
              if (parsed.organization) {
                accumulators.organizations.add(parsed.organization);
              }
              if (parsed.country) {
                accumulators.countries.add(parsed.country);
              }
              if (parsed.domain) {
                accumulators.domains.add(parsed.domain);
              }
              if (!accumulators.earliestDate || parsed.date < accumulators.earliestDate) {
                accumulators.earliestDate = parsed.date;
              }
              if (!accumulators.latestDate || parsed.date > accumulators.latestDate) {
                accumulators.latestDate = parsed.date;
              }
            };

            const finalizeSuccess = () => {
              setActiveParseController(null);
              finishUploadProgress(null);
            if (!accumulators.parsedRows.length) {
              showUploadError("No valid rows were found in the file.");
              return;
            }
            const runtimeMeta = {
              name: file.name,
              size: controller.fileSize,
              lastModified: file.lastModified,
              rows: accumulators.parsedRows.length
            };
            finalizeParsedDataset({
              parsedRows: accumulators.parsedRows,
              uniquePersons: accumulators.uniquePersons,
              organizations: accumulators.organizations,
              countries: accumulators.countries,
              domains: accumulators.domains,
              earliestDate: accumulators.earliestDate,
              latestDate: accumulators.latestDate,
              skippedRows: accumulators.skippedRows,
              rowErrors: accumulators.rowErrors
            }, {
              sourceName: file.name,
              sourceSize: controller.fileSize,
              rows: accumulators.parsedRows.length
            });
            state.datasetSizeBytes = runtimeMeta.size;
            state.datasetCachingDisabled = datasetExceedsCacheLimit(runtimeMeta.size);
            if (state.datasetCachingDisabled) {
              bufferedCsvText = null;
              if (dom.uploadStatus) {
                dom.uploadStatus.textContent = `Dataset loaded (${formatFileSize(runtimeMeta.size)}). ${getDatasetCacheLimitMessage()}`;
              }
                updateStoredDatasetControls(null);
                updateSnapshotControlsAvailability();
                return;
              }
              ensureBufferedCsvText(runtimeMeta);
            };

            const ensureBufferedCsvText = runtimeMeta => {
              if (state.datasetCachingDisabled) {
                bufferedCsvText = null;
                clearRememberedDataset();
                return;
              }
              const rememberAndPersist = csvText => {
                if (typeof csvText !== "string" || !csvText.length) {
                  clearRememberedDataset();
                  return;
                }
                bufferedCsvText = csvText;
                rememberLastDataset(csvText, runtimeMeta);
                persistDataset(csvText, runtimeMeta);
                bufferedCsvText = null;
              };
              if (bufferedCsvText) {
                rememberAndPersist(bufferedCsvText);
                return;
              }
              if (!file || typeof file.text !== "function") {
                bufferedCsvText = null;
                clearRememberedDataset();
                return;
              }
              file.text().then(rememberAndPersist).catch(error => {
                bufferedCsvText = null;
                logWarn("Unable to buffer dataset text", error);
                clearRememberedDataset();
              });
            };

            const finishWithError = message => {
              setActiveParseController(null);
              currentCsvFieldLookup = null;
              if (message) {
                showUploadError(message);
              } else {
                showUploadError("Parsing failed. Confirm the CSV export format.");
              }
            };

            const runParse = (source, parseDelimiter) => {
              let rowsSinceProgressUpdate = 0;
              let pendingProgress = null;
              let progressFrame = null;
              const effectiveDelimiter = parseDelimiter || "";
              const scheduleFrame = typeof requestAnimationFrame === "function"
                ? requestAnimationFrame
                : callback => setTimeout(callback, 16);
              const cancelFrame = typeof cancelAnimationFrame === "function"
                ? cancelAnimationFrame
                : clearTimeout;
              const queueProgressUpdate = progress => {
                pendingProgress = progress;
                if (progressFrame != null) {
                  return;
                }
                progressFrame = scheduleFrame(() => {
                  progressFrame = null;
                  if (pendingProgress) {
                    updateUploadProgress(pendingProgress);
                    pendingProgress = null;
                  }
                });
              };
              const flushProgressUpdates = () => {
                if (progressFrame != null) {
                  cancelFrame(progressFrame);
                  progressFrame = null;
                }
                if (pendingProgress) {
                  updateUploadProgress(pendingProgress);
                  pendingProgress = null;
                }
              };
              Papa.parse(source, {
                header: true,
                skipEmptyLines: "greedy",
                delimiter: effectiveDelimiter,
                worker: true,
                chunkSize: 524288,
                chunk: (results, parser) => {
                  controller.parser = parser;
                  if (controller.aborted) {
                    parser.abort();
                    return;
                  }
                  if (Array.isArray(results.errors) && results.errors.length) {
                    accumulators.rowErrors += results.errors.length;
                  }
                  const rows = Array.isArray(results.data) ? results.data : [results.data];
                  ensureDatasetFieldLookup(results?.meta?.fields, rows[0]);
                  for (let index = 0; index < rows.length; index += 1) {
                    processRow(rows[index]);
                  }
                  controller.rowsProcessed += rows.length;
                  rowsSinceProgressUpdate += rows.length;
                  if (controller.rowsProcessed <= 50 || rowsSinceProgressUpdate >= 400) {
                    rowsSinceProgressUpdate = 0;
                    const cursor = results && results.meta ? Number(results.meta.cursor) : null;
                    const percent = computePercent(cursor, controller.fileSize);
                    queueProgressUpdate({ percent, rowsProcessed: controller.rowsProcessed });
                  }
                },
                error: error => {
                  flushProgressUpdates();
                  if (controller.aborted) {
                    return;
                  }
                  const message = error && error.message ? error.message : String(error || "Unknown error");
                  finishWithError(`Parsing failed: ${message}`);
                },
                complete: () => {
                  flushProgressUpdates();
                  if (controller.aborted) {
                    finishUploadProgress(controller.silentAbort ? null : "Import canceled.");
                    return;
                  }
                  if (controller.rowsProcessed > 0) {
                    updateUploadProgress({ percent: 100, rowsProcessed: controller.rowsProcessed });
                  }
                  controller.parser = null;
                  finalizeSuccess();
                }
              });
            };

            resetAccumulators();
            bufferedCsvText = null;
            controller.fileSize = Number.isFinite(file.size) ? file.size : 0;

            const beginParsing = delimiter => {
              if (controller.aborted) {
                return;
              }
              try {
                runParse(file, delimiter);
              } catch (error) {
                const message = error && error.message ? error.message : String(error || "Unknown error");
                finishWithError(`Unable to read file: ${message}`);
              }
            };

            detectDelimiterForFile(file).then(beginParsing).catch(() => beginParsing(""));
          }

          function loadSampleDataset() {
            clearUploadError();
            cancelActiveParse({ silent: true });
            if (dom.uploadMeta) {
              dom.uploadMeta.textContent = "Sample dataset";
            }
            if (dom.uploadStatus) {
              dom.uploadStatus.textContent = "Loading sample dataset...";
            }
          const parseSample = (csvText, label = "Sample dataset") => {
            if (!csvText) {
              showUploadError("Sample dataset is unavailable.");
              return;
            }
            finishUploadProgress(null);
            parseCsvTextContent(csvText, {
              sourceName: label,
              sourceSize: csvText.length,
              skipPersistence: true
            });
          };
            const useInlineSample = () => {
              if (typeof SAMPLE_DATASET_INLINE === "string" && SAMPLE_DATASET_INLINE.trim().length) {
                bufferedSampleCsv = SAMPLE_DATASET_INLINE;
                parseSample(SAMPLE_DATASET_INLINE, "Built-in sample dataset");
                return true;
              }
              return false;
            };
            if (bufferedSampleCsv) {
              parseSample(bufferedSampleCsv);
              return;
            }
            startUploadProgress({ name: "Sample dataset" });
            if (window.location && window.location.protocol === "file:") {
              if (!useInlineSample()) {
                finishUploadProgress(null);
                showUploadError("Sample dataset is unavailable in offline mode.");
              }
              return;
            }
            fetch(SAMPLE_DATASET_URL, { cache: "no-store" }).then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              return response.text();
            }).then(csvText => {
              bufferedSampleCsv = csvText;
              parseSample(csvText);
            }).catch(error => {
              finishUploadProgress(null);
              if (!useInlineSample()) {
                const message = error && error.message ? error.message : String(error || "Unknown error");
                showUploadError(`Unable to load sample dataset (${message}).`);
              }
            });
          }
      
          function loadStoredFilterPreferences() {
            try {
              if (window.sessionStorage) {
                const raw = sessionStorage.getItem(FILTER_PREFERENCES_KEY);
                if (!raw) {
                  // Fall back to persisted preferences only when the user has opted into saving data.
                  if (!state.persistDatasets || !window.localStorage) {
                    return null;
                  }
                  const persisted = localStorage.getItem(FILTER_PREFERENCES_KEY);
                  if (!persisted) {
                    return null;
                  }
                  const parsedPersisted = JSON.parse(persisted);
                  return parsedPersisted && typeof parsedPersisted === "object" ? parsedPersisted : null;
                }
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === "object" ? parsed : null;
              }
            } catch (error) {
              logWarn("Unable to read stored filter preferences", error);
            }
            return null;
          }
      
          function persistFilterPreferences() {
            if (!state.rows || !state.rows.length) {
              return;
            }
            const preferences = {
              organization: Array.from(state.filters.organization || []),
              country: Array.from(state.filters.country || []),
              timeframe: state.filters.timeframe,
              customStart: state.filters.customStart ? toDateInputValue(state.filters.customStart) : null,
              customEnd: state.filters.customEnd ? toDateInputValue(state.filters.customEnd) : null,
              aggregate: state.filters.aggregate,
              metric: state.filters.metric,
              group: state.filters.group,
              organizationField: state.filterFields.organization,
              countryField: state.filterFields.country
            };
            try {
              // Always keep per-tab preferences so refreshes don't reset filters,
              // but don't persist across sessions unless the user opted in.
              if (window.sessionStorage) {
                sessionStorage.setItem(FILTER_PREFERENCES_KEY, JSON.stringify(preferences));
              }
              if (window.localStorage) {
                if (state.persistDatasets) {
                  localStorage.setItem(FILTER_PREFERENCES_KEY, JSON.stringify(preferences));
                } else {
                  localStorage.removeItem(FILTER_PREFERENCES_KEY);
                }
              }
            } catch (error) {
              logWarn("Unable to persist filter preferences", error);
            }
          }

          function applyStoredFilterPreferences(preferences) {
            if (!preferences || typeof preferences !== "object") {
              return false;
            }
            let applied = false;

            const desiredOrganizationField = typeof preferences.organizationField === "string"
              ? preferences.organizationField
              : state.filterFields.organization;
            const desiredCountryField = typeof preferences.countryField === "string"
              ? preferences.countryField
              : state.filterFields.country;
            state.filterFields.organization = resolveFilterFieldChoice("organization", desiredOrganizationField);
            state.filterFields.country = resolveFilterFieldChoice("country", desiredCountryField);
            if (typeof preferences.organizationField === "string" || typeof preferences.countryField === "string") {
              applied = true;
            }
            refreshFilterOptionsFromFieldSelection();
            const countryFilterVisible = !(dom.countryFilterWrapper && dom.countryFilterWrapper.hidden);

            if (Array.isArray(preferences.organization)) {
              const validOrganizations = dom.organizationFilter
                ? new Set(Array.from(dom.organizationFilter.options).map(option => option.value).filter(value => value !== "all"))
                : null;
              const organizationValues = preferences.organization.filter(value => !validOrganizations || validOrganizations.has(value));
              state.filters.organization = new Set(organizationValues);
              syncMultiSelect(dom.organizationFilter, state.filters.organization);
              applied = applied || state.filters.organization.size > 0;
            }
            if (Array.isArray(preferences.country) && countryFilterVisible) {
              const validCountries = dom.countryFilter
                ? new Set(Array.from(dom.countryFilter.options).map(option => option.value).filter(value => value !== "all"))
                : null;
              const countryValues = preferences.country.filter(value => !validCountries || validCountries.has(value));
              state.filters.country = new Set(countryValues);
              syncMultiSelect(dom.countryFilter, state.filters.country);
              applied = applied || state.filters.country.size > 0;
            } else if (!countryFilterVisible) {
              state.filters.country = new Set();
            }
            if (typeof preferences.timeframe === "string") {
              dom.timeframeFilter.value = preferences.timeframe;
              state.filters.timeframe = preferences.timeframe;
              applied = true;
            }
            if (typeof preferences.aggregate === "string") {
              dom.aggregateFilter.value = preferences.aggregate;
              state.filters.aggregate = preferences.aggregate;
              applied = true;
            }
            if (typeof preferences.metric === "string") {
              dom.metricFilter.value = preferences.metric;
              state.filters.metric = preferences.metric;
              applied = true;
            }
            if (typeof preferences.group === "string") {
              dom.groupFilter.value = preferences.group;
              state.filters.group = preferences.group;
              applied = true;
            }

            if (state.filters.timeframe === "custom") {
              const start = parseDateInputValue(preferences.customStart);
              const end = parseDateInputValue(preferences.customEnd);
              if (start && end) {
                state.filters.customStart = start;
                state.filters.customEnd = end;
                state.filters.customRangeInvalid = start > end;
                if (dom.customRangeStart) {
                  dom.customRangeStart.value = preferences.customStart;
                }
                if (dom.customRangeEnd) {
                  dom.customRangeEnd.value = preferences.customEnd;
                }
              }
            } else {
              state.filters.customStart = state.earliestDate ? new Date(state.earliestDate.getTime()) : null;
              state.filters.customEnd = state.latestDate ? new Date(state.latestDate.getTime()) : null;
              state.filters.customRangeInvalid = false;
              if (dom.customRangeStart) {
                dom.customRangeStart.value = "";
              }
              if (dom.customRangeEnd) {
                dom.customRangeEnd.value = "";
              }
            }
            updateCustomRangeVisibility();
            refreshFilterToggleStates();
            return applied;
          }
      
          function maybeApplyStoredFilters() {
            if (filterPreferencesApplied) {
              return;
            }
            const preferences = loadStoredFilterPreferences();
            if (preferences && applyStoredFilterPreferences(preferences)) {
              renderDashboard();
            }
            refreshFilterToggleStates();
            filterPreferencesApplied = true;
          }
      
          function resetFiltersToDefault() {
            state.filters.organization = new Set();
            state.filters.country = new Set();
            state.filters.timeframe = "all";
            state.filters.customStart = state.earliestDate ? new Date(state.earliestDate.getTime()) : null;
            state.filters.customEnd = state.latestDate ? new Date(state.latestDate.getTime()) : null;
            state.filters.customRangeInvalid = false;
            state.filters.aggregate = "weekly";
            state.filters.metric = "actions";
            state.filters.group = "organization";
            state.filters.categorySelection = null;
            syncMultiSelect(dom.organizationFilter, state.filters.organization);
            syncMultiSelect(dom.countryFilter, state.filters.country);
            if (dom.timeframeFilter) {
              dom.timeframeFilter.value = "all";
            }
            if (dom.aggregateFilter) {
              dom.aggregateFilter.value = "weekly";
            }
            if (dom.metricFilter) {
              dom.metricFilter.value = "actions";
            }
            if (dom.groupFilter) {
              dom.groupFilter.value = "organization";
            }
            if (dom.customRangeStart && state.filters.customStart) {
              dom.customRangeStart.value = toDateInputValue(state.filters.customStart);
            }
            if (dom.customRangeEnd && state.filters.customEnd) {
              dom.customRangeEnd.value = toDateInputValue(state.filters.customEnd);
            }
            updateCustomRangeVisibility();
            refreshFilterToggleStates();
            renderDashboard();
            persistFilterPreferences();
          }
      
          function transformRow(raw) {
            const date = parseMetricDate(raw.MetricDate);
            if (!date) {
              return null;
            }
            const weekEndDate = computeWeekEndingDate(date) || date;
            const isoInfo = toIsoWeek(weekEndDate);
            const monthKey = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
            const metrics = {};
            for (let index = 0; index < CSV_FIELD_ENTRIES_COUNT; index += 1) {
              const entry = csvFieldEntries[index];
              const key = entry[0];
              const mapping = entry[1];
              const value = extractMetricValue(raw, mapping);
              metrics[key] = Number.isFinite(value) ? value : 0;
            }
            return {
              personId: raw.PersonId || "Unknown",
              organization: sanitizeLabel(raw.Organization) || "Unspecified",
              country: sanitizeLabel(raw.CountryOrRegion) || "Unspecified",
              domain: sanitizeLabel(raw.Domain) || "Unspecified",
              date,
              weekEndDate,
              isoWeek: isoInfo.week,
              isoYear: isoInfo.year,
              monthKey,
              totalActions: metrics.totalActions,
              assistedHours: metrics.assistedHours,
              metrics
            };
          }
      
          function handleAgentFileSelection(event) {
            const input = event && event.target instanceof HTMLInputElement ? event.target : null;
            const file = input && input.files && input.files.length ? input.files[0] : null;
            if (!file) {
              return;
            }
            parseAgentUsageFile(file);
            if (input) {
              input.value = "";
            }
          }
      
          function parseAgentUsageFile(file) {
            if (!file) {
              return;
            }
            if (dom.agentStatus) {
              dom.agentStatus.textContent = `Parsing ${file.name}...`;
            }
            if (dom.agentEmpty) {
              dom.agentEmpty.hidden = true;
            }
            const startAgentParse = delimiter => {
              const resolvedDelimiter = typeof delimiter === "string" && delimiter.length ? delimiter : undefined;
              Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                delimiter: resolvedDelimiter,
                    complete: results => {
                  const { resolvedFields, missingColumns, datasetType } = resolveAgentFieldMapping(results?.meta?.fields);
                  if (missingColumns.length) {
                    const requiredFieldCount = datasetType === "user-detail" ? 6 : 5;
                    if (missingColumns.length >= requiredFieldCount) {
                      // The file likely isn't an agent export; fall back to main dataset parsing.
                      if (dom.agentStatus) {
                        dom.agentStatus.textContent = "Awaiting agent usage CSV.";
                      }
                      if (dom.agentEmpty) {
                        dom.agentEmpty.hidden = false;
                        dom.agentEmpty.textContent = "Upload agent usage CSV to view insights.";
                      }
                      processCopilotDatasetFile(file);
                      return;
                    }
                    if (dom.agentStatus) {
                      dom.agentStatus.textContent = `Missing required columns: ${missingColumns.join(", ")}.`;
                    }
                    if (dom.agentEmpty) {
                      dom.agentEmpty.hidden = false;
                      dom.agentEmpty.textContent = "Include the standard agent usage columns and try again.";
                    }
                    return;
                  }
                  if (datasetType === "user-summary") {
                    const sourceRows = Array.isArray(results.data) ? results.data.length : 0;
                    const summaryMeta = {
                      sourceName: file.name,
                      size: file.size,
                      lastModified: file.lastModified,
                      datasetType,
                      sourceRows,
                      rows: sourceRows
                    };
                    if (dom.agentStatus) {
                      dom.agentStatus.textContent = "User summary dataset detected. Cached locally for later use.";
                    }
                    if (dom.agentEmpty && !state.agentUsageRows.length && !state.agentUsageDetailRows.length) {
                      dom.agentEmpty.hidden = false;
                      dom.agentEmpty.textContent = "Load an agent usage export to populate this table.";
                    }
                    if (typeof file.text === "function") {
                      file.text().then(csvText => {
                        rememberLastAgentDataset(csvText, summaryMeta);
                        persistAgentDataset(csvText, summaryMeta);
                      }).catch(error => {
                        logWarn("Unable to cache user summary dataset", error);
                      });
                    } else {
                      rememberLastAgentDataset("", summaryMeta);
                      persistAgentDataset("", summaryMeta);
                    }
                    return;
                  }
                  const { rows, detailRows, skipped, sourceRows } = buildAgentRows(results.data, resolvedFields, datasetType);
                  const applied = ingestAgentUsageRows(rows, {
                    sourceName: file.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    datasetType,
                    sourceRows
                  }, skipped, detailRows);
                  if (applied && rows.length && typeof file.text === "function") {
                    file.text().then(csvText => {
                      rememberLastAgentDataset(csvText, {
                        name: file.name,
                        size: file.size,
                        rows: rows.length,
                        detailRows: detailRows.length,
                        lastModified: file.lastModified,
                        datasetType,
                        sourceRows
                      });
                      persistAgentDataset(csvText, {
                        name: file.name,
                        size: file.size,
                        rows: rows.length,
                        detailRows: detailRows.length,
                        lastModified: file.lastModified,
                        datasetType,
                        sourceRows
                      });
                    }).catch(error => {
                      logWarn("Unable to persist agent dataset", error);
                    });
                  }
                },
                error: error => {
                  const message = error && error.message ? error.message : "Unknown error";
                  logError("Agent CSV parse failed", error);
                  if (dom.agentStatus) {
                    dom.agentStatus.textContent = `Agent CSV parse failed: ${message}`;
                  }
                  if (dom.agentEmpty) {
                    dom.agentEmpty.hidden = false;
                    dom.agentEmpty.textContent = "Unable to parse the agent usage CSV.";
                  }
                }
              });
            };

            detectDelimiterForFile(file).then(startAgentParse).catch(() => startAgentParse(""));
          }

          function normalizeHeaderLabel(value) {
            if (typeof value !== "string") {
              return "";
            }
            return value
              .trim()
              .toLowerCase()
              .replace(/[\s/_\-()+.,|\\[\]{}]+/g, "")
              .replace(/&/g, "and");
          }

          function toHeaderCandidates(label) {
            if (Array.isArray(label)) {
              return label.filter(entry => typeof entry === "string" && entry.trim().length);
            }
            if (typeof label === "string" && label.trim().length) {
              return [label];
            }
            return [];
          }

          function matchHeaderFromLookup(candidates, lookup) {
            for (let index = 0; index < candidates.length; index += 1) {
              const candidate = candidates[index];
              const normalized = normalizeHeaderLabel(candidate);
              if (normalized && lookup[normalized]) {
                return lookup[normalized];
              }
              const lowered = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
              if (lowered && lookup[lowered]) {
                return lookup[lowered];
              }
            }
            return null;
          }

          function resolveAgentFieldLookup(fields) {
            return fields.reduce((accumulator, field) => {
              if (typeof field !== "string") {
                return accumulator;
              }
              const lowered = field.trim().toLowerCase();
              const normalized = normalizeHeaderLabel(field);
              if (lowered && !accumulator[lowered]) {
                accumulator[lowered] = field;
              }
              if (normalized && !accumulator[normalized]) {
                accumulator[normalized] = field;
              }
              return accumulator;
            }, {});
          }
      
          function resolveAgentFieldMapping(fields) {
            const lookup = resolveAgentFieldLookup(Array.isArray(fields) ? fields : []);
            const resolvedFields = {};
            const missingColumns = [];
            Object.entries(agentCsvFieldMap).forEach(([key, expected]) => {
              const candidates = toHeaderCandidates(expected);
              const actual = matchHeaderFromLookup(candidates, lookup);
              if (actual) {
                resolvedFields[key] = actual;
              } else {
                missingColumns.push(candidates[0] || String(expected));
              }
            });
            return { resolvedFields, missingColumns };
          }
      
          function transformAgentUsageRow(raw, fields) {
            if (!raw) {
              return null;
            }
            const id = sanitizeLabel(raw[fields.id]);
            const name = sanitizeLabel(raw[fields.name]);
            const creatorType = sanitizeLabel(raw[fields.creatorType]) || "Unspecified";
            const activeLicensed = parseNumber(raw[fields.activeLicensed]);
            const activeUnlicensed = parseNumber(raw[fields.activeUnlicensed]);
            const responses = parseNumber(raw[fields.responses]);
            const totalActive = activeLicensed + activeUnlicensed;
            const lastActivity = parseAgentDate(raw[fields.lastActivity]);
            if (!name && !id) {
              return null;
            }
            return {
              id: id || null,
              name: name || id || "Unnamed agent",
              creatorType,
              activeLicensed,
              activeUnlicensed,
              totalActive,
              responses,
              lastActivity
            };
          }
      
          function buildAgentRows(data, resolvedFields) {
            const rows = [];
            let skipped = 0;
            if (Array.isArray(data)) {
              data.forEach(raw => {
                const parsed = transformAgentUsageRow(raw, resolvedFields);
                if (parsed) {
                  rows.push(parsed);
                } else {
                  skipped += 1;
                }
              });
            }
            return { rows, skipped };
          }
      
          function ingestAgentUsageRows(rows, meta = {}, skipped = 0) {
            const list = Array.isArray(rows) ? rows : [];
            const totalRows = list.length;
            state.agentUsageRows = list;
            state.agentUsageMeta = {
              sourceName: meta.sourceName || meta.name || "Agent usage export",
              totalRows,
              skipped: Number.isFinite(skipped) ? skipped : 0,
              size: meta.size || null,
              lastModified: meta.lastModified || null,
              savedAt: meta.savedAt || null
            };
            state.agentDisplayLimit = totalRows ? Math.min(5, totalRows) : 5;
            state.agentSort = { column: "responses", direction: "desc" };
            if (!totalRows) {
              updateAgentUsageCard([]);
              if (dom.agentStatus) {
                const label = state.agentUsageMeta.sourceName;
                dom.agentStatus.textContent = label
                  ? `No agent activity rows were found in ${label}.`
                  : "No agent activity rows were found in the provided file.";
              }
              if (dom.agentEmpty) {
                dom.agentEmpty.hidden = false;
                dom.agentEmpty.textContent = "The agent usage export did not contain any activity.";
              }
              return false;
            }
            updateAgentUsageCard(list);
            return true;
          }

          function initializeAgentHub() {
            if (!dom.agentHubContainer) {
              return;
            }
            const currentTab = state.agentHub?.activeTab || "users";
            setAgentHubActiveTab(currentTab);
            if (dom.agentHubReset) {
              dom.agentHubReset.addEventListener("click", event => {
                event.preventDefault();
                resetAgentHub();
              });
            }
            if (dom.agentHubTabButtons && dom.agentHubTabButtons.length) {
              dom.agentHubTabButtons.forEach(button => {
                const tab = button.getAttribute("data-agent-tab");
                if (!tab) {
                  return;
                }
                button.addEventListener("click", () => setAgentHubActiveTab(tab));
              });
            }
            AGENT_HUB_TYPES.forEach(type => {
              const section = agentHubSections[type];
              if (!section) {
                return;
              }
              if (section.uploadButton && section.input) {
                section.uploadButton.addEventListener("click", event => {
                  event.preventDefault();
                  section.input.click();
                });
              }
              if (section.input) {
                section.input.addEventListener("change", event => handleAgentHubInputChange(event, type));
              }
              if (section.dropzone) {
                setupAgentHubDropzone(section.dropzone, type);
              }
              if (section.filterInput) {
                section.filterInput.addEventListener("input", event => {
                  setAgentHubFilter(type, event.target.value);
                });
              }
              if (section.toggleRows) {
                section.toggleRows.addEventListener("click", event => {
                  event.preventDefault();
                  toggleAgentHubRows(type);
                });
              }
              if (section.filterClear) {
                section.filterClear.addEventListener("click", event => {
                  event.preventDefault();
                  setAgentHubFilter(type, "");
                });
              }
              if (section.sortButtons && section.sortButtons.length) {
                section.sortButtons.forEach(button => {
                  button.addEventListener("click", event => {
                    event.preventDefault();
                    const key = button.getAttribute("data-agent-hub-sort-key");
                    if (key) {
                      setAgentHubSort(type, key);
                    }
                  });
                });
              }
            });
            updateAgentHubResetVisibility();
          }

          function handleAgentHubInputChange(event, type) {
            const input = event && event.target instanceof HTMLInputElement ? event.target : null;
            const files = input && input.files && input.files.length ? Array.from(input.files) : [];
            if (files.length) {
              queueAgentHubFiles(files, type);
            }
            if (input) {
              input.value = "";
            }
          }

          function loadAgentHubSnapshotFromLocalStorage() {
            if (!window.localStorage) {
              return null;
            }
            try {
              const raw = localStorage.getItem(AGENT_HUB_STORAGE_KEY);
              if (!raw) {
                return null;
              }
              const payload = JSON.parse(raw);
              if (payload && typeof payload === "object" && payload.datasets) {
                return payload.datasets;
              }
            } catch (error) {
              logWarn("Unable to read agent hub datasets from local storage", error);
            }
            return null;
          }

          function setupAgentHubDropzone(dropzone, type) {
            dropzone.addEventListener("dragenter", event => {
              if (!eventContainsFiles(event)) {
                return;
              }
              event.preventDefault();
              dropzone.classList.add("is-active");
            });
            dropzone.addEventListener("dragover", event => {
              if (!eventContainsFiles(event)) {
                return;
              }
              event.preventDefault();
              dropzone.classList.add("is-active");
            });
            dropzone.addEventListener("dragleave", () => {
              dropzone.classList.remove("is-active");
            });
            dropzone.addEventListener("drop", event => {
              if (!eventContainsFiles(event)) {
                dropzone.classList.remove("is-active");
                return;
              }
              event.preventDefault();
              dropzone.classList.remove("is-active");
              const transferFiles = event.dataTransfer && event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
              if (transferFiles.length) {
                queueAgentHubFiles(transferFiles, type);
              }
            });
          }

          function queueAgentHubFiles(files, type) {
            if (!Array.isArray(files) || !files.length) {
              return;
            }
            files.forEach(file => {
              if (file) {
                parseAgentHubFile(file, type);
              }
            });
          }

          function parseAgentHubFile(file, typeHint) {
            if (!file) {
              return;
            }
            if (typeHint) {
              updateAgentHubStatus(typeHint, `Parsing ${file.name}...`);
              updateAgentHubEmptyState(typeHint, { hidden: true });
            }
            const beginParsing = delimiter => {
              const resolvedDelimiter = typeof delimiter === "string" && delimiter.length ? delimiter : undefined;
              if (typeof Papa === "undefined" || typeof Papa.parse !== "function") {
                const fallbackType = typeHint || state.agentHub?.activeTab || "users";
                updateAgentHubStatus(fallbackType, "CSV parser is unavailable in this browser.");
                updateAgentHubEmptyState(fallbackType, { hidden: false });
                return;
              }
              Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                delimiter: resolvedDelimiter,
                complete: results => {
                  const fields = results && results.meta && Array.isArray(results.meta.fields) ? results.meta.fields : [];
                  const { resolved, missing, datasetType } = resolveAgentHubColumnsAuto(typeHint, fields);
                  const targetType = datasetType || typeHint || state.agentHub?.activeTab || "users";
                  if (missing.length) {
                    const missingLabel = missing.join(", ");
                    updateAgentHubStatus(targetType, `Missing required columns: ${missingLabel}.`);
                    updateAgentHubEmptyState(targetType, {
                      hidden: false,
                      message: "Include the standard agent usage columns and try again."
                    });
                    if (typeHint && typeHint !== targetType) {
                      updateAgentHubStatus(typeHint, `${file.name} does not match the expected columns for this tab.`);
                      updateAgentHubEmptyState(typeHint, { hidden: false });
                    }
                    return;
                  }
                  const dataset = Array.isArray(results && results.data) ? results.data : [];
                  const { rows, skipped } = buildAgentHubRows(targetType, dataset, resolved);
                  applyAgentHubDataset(
                    targetType,
                    rows,
                    {
                      sourceName: file.name,
                      size: file.size,
                      lastModified: file.lastModified
                    },
                    skipped
                  );
                  if (typeHint && typeHint !== targetType) {
                    const hintDataset = state.agentHub?.datasets?.[typeHint];
                    updateAgentHubStatus(typeHint, `${file.name} matched ${getAgentHubTypeLabel(targetType)}. Data moved to that tab.`);
                    if (!hintDataset || !Array.isArray(hintDataset.rows) || !hintDataset.rows.length) {
                      updateAgentHubEmptyState(typeHint, { hidden: false, message: getAgentHubDefaultEmptyMessage(typeHint) });
                    }
                  }
                },
                error: () => {
                  const fallbackType = typeHint || state.agentHub?.activeTab || "users";
                  updateAgentHubStatus(fallbackType, "Unable to read this CSV file. Download it again and retry.");
                  updateAgentHubEmptyState(fallbackType, { hidden: false });
                }
              });
            };
            detectDelimiterForFile(file).then(beginParsing).catch(() => beginParsing(""));
          }

          function resolveAgentHubColumns(type, fields, lookup) {
            const config = agentHubDatasetConfig[type];
            if (!config) {
              return { resolved: {}, missing: [] };
            }
            const headerLookup = lookup || resolveAgentFieldLookup(Array.isArray(fields) ? fields : []);
            const resolved = {};
            const missing = [];
            Object.entries(config.requiredFields).forEach(([key, label]) => {
              const candidates = toHeaderCandidates(label);
              const actual = matchHeaderFromLookup(candidates, headerLookup);
              if (actual) {
                resolved[key] = actual;
              } else {
                missing.push(candidates[0] || String(label));
              }
            });
            return { resolved, missing };
          }

          function resolveAgentHubColumnsAuto(preferredType, fields) {
            const lookup = resolveAgentFieldLookup(Array.isArray(fields) ? fields : []);
            const attempts = [];
            const tryType = candidateType => {
              if (!candidateType) {
                return null;
              }
              const result = resolveAgentHubColumns(candidateType, fields, lookup);
              attempts.push({ type: candidateType, ...result });
              if (!result.missing.length) {
                return { datasetType: candidateType, resolved: result.resolved, missing: [] };
              }
              return null;
            };
            let match = tryType(preferredType);
            if (!match) {
              for (let index = 0; index < AGENT_HUB_TYPES.length; index += 1) {
                const candidate = AGENT_HUB_TYPES[index];
                if (candidate === preferredType) {
                  continue;
                }
                match = tryType(candidate);
                if (match) {
                  break;
                }
              }
            }
            if (match) {
              return match;
            }
            const best = attempts.length
              ? attempts.slice().sort((a, b) => a.missing.length - b.missing.length)[0]
              : null;
            if (best) {
              return { datasetType: best.type, resolved: best.resolved, missing: best.missing };
            }
            const fallbackType = preferredType || AGENT_HUB_TYPES[0];
            return {
              datasetType: fallbackType,
              resolved: {},
              missing: Object.values(agentHubDatasetConfig[fallbackType]?.requiredFields || {})
            };
          }

          function buildAgentHubRows(type, data, fieldMap) {
            const rows = [];
            let skipped = 0;
            if (Array.isArray(data)) {
              data.forEach(raw => {
                const parsed = transformAgentHubRow(type, raw, fieldMap);
                if (parsed) {
                  rows.push(parsed);
                } else {
                  skipped += 1;
                }
              });
            }
            return { rows, skipped };
          }

          function transformAgentHubRow(type, raw, fieldMap) {
            if (!raw || !fieldMap) {
              return null;
            }
            if (type === "users") {
              const username = sanitizeLabel(raw[fieldMap.username]);
              const displayName = sanitizeLabel(raw[fieldMap.displayName]);
              if (!username && !displayName) {
                return null;
              }
              const agentCount = parseNumber(raw[fieldMap.agentCount]);
              const responses = parseNumber(raw[fieldMap.responses]);
              const lastActivity = parseAgentDate(raw[fieldMap.lastActivity]);
              return {
                username: username || "",
                displayName: displayName || "",
                agentCount,
                responses,
                lastActivity,
                lastActivityRaw: sanitizeLabel(raw[fieldMap.lastActivity]) || ""
              };
            }
            if (type === "agents") {
              const agentId = sanitizeLabel(raw[fieldMap.agentId]);
              const agentName = sanitizeLabel(raw[fieldMap.agentName]);
              if (!agentId && !agentName) {
                return null;
              }
              const creatorType = sanitizeLabel(raw[fieldMap.creatorType]) || "Unspecified";
              const activeLicensed = parseNumber(raw[fieldMap.activeLicensed]);
              const activeUnlicensed = parseNumber(raw[fieldMap.activeUnlicensed]);
              const responses = parseNumber(raw[fieldMap.responses]);
              const lastActivity = parseAgentDate(raw[fieldMap.lastActivity]);
              return {
                agentId: agentId || "",
                agentName: agentName || agentId || "",
                creatorType,
                activeLicensed,
                activeUnlicensed,
                responses,
                lastActivity,
                lastActivityRaw: sanitizeLabel(raw[fieldMap.lastActivity]) || ""
              };
            }
            if (type === "combined") {
              const agentId = sanitizeLabel(raw[fieldMap.agentId]);
              const agentName = sanitizeLabel(raw[fieldMap.agentName]);
              const username = sanitizeLabel(raw[fieldMap.username]);
              if (!agentId && !agentName && !username) {
                return null;
              }
              const creatorType = sanitizeLabel(raw[fieldMap.creatorType]) || "Unspecified";
              const responses = parseNumber(raw[fieldMap.responses]);
              const lastActivity = parseAgentDate(raw[fieldMap.lastActivity]);
              return {
                agentId: agentId || "",
                agentName: agentName || agentId || "",
                creatorType,
                username: username || "",
                responses,
                lastActivity,
                lastActivityRaw: sanitizeLabel(raw[fieldMap.lastActivity]) || ""
              };
            }
            return null;
          }

          function applyAgentHubDataset(type, rows, meta = {}, skipped = 0, options = {}) {
            if (!state.agentHub || !state.agentHub.datasets || !state.agentHub.datasets[type]) {
              return;
            }
            const settings = {
              persist: true,
              statusMessage: null,
              ...options
            };
            const dataset = state.agentHub.datasets[type];
            dataset.rows = Array.isArray(rows) ? rows : [];
            if (state.agentHub?.filters) {
              state.agentHub.filters[type] = "";
            }
            if (state.agentHub?.expanded) {
              state.agentHub.expanded[type] = false;
            }
            dataset.meta = {
              sourceName: meta.sourceName || "Agent CSV",
              size: Number.isFinite(meta.size) ? meta.size : null,
              lastModified: Number.isFinite(meta.lastModified) ? meta.lastModified : null,
              rows: dataset.rows.length,
              skipped: Number.isFinite(skipped) ? skipped : 0
            };
            if (dataset.rows.length) {
              const loadedMessage = dataset.meta.skipped
                ? `Loaded ${numberFormatter.format(dataset.rows.length)} rows (skipped ${numberFormatter.format(dataset.meta.skipped)}).`
                : `Loaded ${numberFormatter.format(dataset.rows.length)} rows.`;
              updateAgentHubStatus(type, settings.statusMessage || loadedMessage);
              updateAgentHubEmptyState(type, { hidden: true });
            } else {
              updateAgentHubStatus(type, "No valid rows were found in this CSV.");
              updateAgentHubEmptyState(type, {
                hidden: false,
                message: "Upload a CSV with the standard columns to populate this table."
              });
            }
            updateAgentHubMeta(type, dataset.meta);
            toggleAgentHubFilterBar(type, dataset.rows.length > 0);
            renderAgentHubTable(type);
            updateAgentHubResetVisibility();
            if (settings.persist) {
              persistAgentHubSnapshot();
            }
          }

          function applyAgentHubSnapshot(snapshot, { statusPrefix = "Restored" } = {}) {
            if (!snapshot || typeof snapshot !== "object") {
              AGENT_HUB_TYPES.forEach(type => resetAgentHubDataset(type, { skipPersist: true }));
              return;
            }
            AGENT_HUB_TYPES.forEach(type => {
              const data = snapshot[type];
              if (data && Array.isArray(data.rows)) {
                const hydratedRows = data.rows.map(deserializeAgentHubRow);
                const label = hydratedRows.length
                  ? `${statusPrefix} ${numberFormatter.format(data.rows.length)} rows.`
                  : `${statusPrefix} dataset loaded.`;
                applyAgentHubDataset(type, hydratedRows, data.meta || {}, data.meta?.skipped || 0, {
                  persist: false,
                  statusMessage: label
                });
              } else {
                resetAgentHubDataset(type, { skipPersist: true });
              }
            });
            renderAgentHubTable(state.agentHub?.activeTab || "users");
          }

          function renderAgentHubTable(type) {
            const section = agentHubSections[type];
            if (!section || !section.tbody) {
              return;
            }
            section.tbody.innerHTML = "";
            const dataset = state.agentHub && state.agentHub.datasets ? state.agentHub.datasets[type] : null;
            const sourceRows = dataset && Array.isArray(dataset.rows) ? dataset.rows.slice() : [];
            const filteredRows = filterAgentHubRows(type, sourceRows);
            const rows = sortAgentHubRows(type, filteredRows);
            updateAgentHubFilterControls(type);
            updateAgentHubSortIndicators(type);
            const limit = state.agentHub?.rowLimit || AGENT_HUB_ROW_LIMIT;
            const expanded = Boolean(state.agentHub?.expanded?.[type]);
            const visibleRows = expanded ? rows : rows.slice(0, limit);
            const totalRows = rows.length;
            if (section.toggleRows) {
              section.toggleRows.hidden = totalRows <= limit;
              if (!section.toggleRows.hidden) {
                section.toggleRows.textContent = expanded
                  ? "Show fewer rows"
                  : `Show all ${numberFormatter.format(totalRows)} rows`;
                section.toggleRows.setAttribute("aria-pressed", String(expanded));
              }
            }
            if (!rows.length) {
              if (section.tableWrapper) {
                section.tableWrapper.hidden = true;
              }
              if (section.empty) {
                if (sourceRows.length && (state.agentHub?.filters?.[type] || "").trim().length) {
                  section.empty.textContent = "No rows match the current filter.";
                } else if (section.defaults) {
                  section.empty.textContent = section.defaults.empty;
                }
                section.empty.hidden = false;
              }
              return;
            }
            const config = agentHubDatasetConfig[type];
            if (!config) {
              return;
            }
            const fragment = document.createDocumentFragment();
            visibleRows.forEach(row => {
              const tr = document.createElement("tr");
              config.columns.forEach(column => {
                const td = document.createElement("td");
                if (column.type === "number") {
                  td.classList.add("is-numeric");
                }
                td.classList.add(`agent-col-${column.key}`);
                td.textContent = formatAgentHubCellValue(row, column);
                tr.appendChild(td);
              });
              fragment.appendChild(tr);
            });
            section.tbody.appendChild(fragment);
            if (section.tableWrapper) {
              section.tableWrapper.hidden = false;
            }
            if (section.empty) {
              section.empty.hidden = true;
            }
          }

          function formatAgentHubCellValue(row, column) {
            const value = row[column.key];
            if (column.type === "number") {
              return numberFormatter.format(Number.isFinite(value) ? value : 0);
            }
            if (column.type === "date") {
              if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return formatShortDate(value);
              }
              return row[`${column.key}Raw`] || "-";
            }
            return value || "-";
          }

          function updateAgentHubStatus(type, message) {
            const section = agentHubSections[type];
            if (section && section.status) {
              section.status.textContent = message || (section.defaults ? section.defaults.status : "");
            }
          }

          function updateAgentHubMeta(type, meta) {
            const section = agentHubSections[type];
            if (!section || !section.meta) {
              return;
            }
            if (meta && (Number.isFinite(meta.rows) || meta.sourceName)) {
              section.meta.textContent = describeAgentHubMeta(meta);
              return;
            }
            section.meta.textContent = section.defaults ? section.defaults.meta : "";
          }

          function describeAgentHubMeta(meta) {
            if (!meta) {
              return "";
            }
            const parts = [];
            if (Number.isFinite(meta.rows)) {
              parts.push(`${numberFormatter.format(meta.rows)} rows`);
            }
            if (Number.isFinite(meta.skipped) && meta.skipped > 0) {
              parts.push(`${numberFormatter.format(meta.skipped)} skipped`);
            }
            if (meta.size != null) {
              parts.push(formatFileSize(meta.size));
            }
            if (meta.lastModified) {
              const modified = new Date(meta.lastModified);
              if (!Number.isNaN(modified.getTime())) {
                parts.push(`Modified ${formatShortDate(modified)}`);
              }
            }
            if (parts.length) {
              return meta.sourceName ? `${meta.sourceName}${BULLET_SEPARATOR}${parts.join(BULLET_SEPARATOR)}` : parts.join(BULLET_SEPARATOR);
            }
            return meta.sourceName || "";
          }

          function updateAgentHubEmptyState(type, options = {}) {
            const section = agentHubSections[type];
            if (!section || !section.empty) {
              return;
            }
            if (typeof options.message === "string") {
              section.empty.textContent = options.message;
            }
            if (typeof options.hidden === "boolean") {
              section.empty.hidden = options.hidden;
            }
          }

          function getAgentHubTypeLabel(type) {
            return agentHubTypeLabels[type] || "Agent CSV";
          }

          function getAgentHubDefaultEmptyMessage(type) {
            const section = agentHubSections[type];
            return section && section.defaults ? section.defaults.empty : "";
          }

          function resetAgentHub() {
            AGENT_HUB_TYPES.forEach(type => {
              resetAgentHubDataset(type);
            });
            updateAgentHubResetVisibility();
          }

          function resetAgentHubDataset(type, options = {}) {
            if (state.agentHub && state.agentHub.datasets && state.agentHub.datasets[type]) {
              state.agentHub.datasets[type].rows = [];
              state.agentHub.datasets[type].meta = null;
              if (state.agentHub.filters) {
                state.agentHub.filters[type] = "";
              }
              if (state.agentHub.sort) {
                state.agentHub.sort[type] = { column: null, direction: "asc" };
              }
              if (state.agentHub.expanded) {
                state.agentHub.expanded[type] = false;
              }
            }
            const section = agentHubSections[type];
            if (!section) {
              return;
            }
            if (section.tbody) {
              section.tbody.innerHTML = "";
            }
            if (section.tableWrapper) {
              section.tableWrapper.hidden = true;
            }
            if (section.status && section.defaults) {
              section.status.textContent = section.defaults.status;
            }
            if (section.meta && section.defaults) {
              section.meta.textContent = section.defaults.meta;
            }
            if (section.empty && section.defaults) {
              section.empty.hidden = false;
              section.empty.textContent = section.defaults.empty;
            }
            if (section.input) {
              section.input.value = "";
            }
            if (section.toggleRows) {
              section.toggleRows.hidden = true;
            }
            updateAgentHubFilterControls(type);
            toggleAgentHubFilterBar(type, false);
            updateAgentHubSortIndicators(type);
            if (!options.skipPersist) {
              persistAgentHubSnapshot();
            }
          }

          function setAgentHubActiveTab(tab) {
            const target = AGENT_HUB_TYPES.includes(tab) ? tab : "users";
            if (state.agentHub) {
              state.agentHub.activeTab = target;
            }
            if (dom.agentHubTabButtons && dom.agentHubTabButtons.length) {
              dom.agentHubTabButtons.forEach(button => {
                const buttonTab = button.getAttribute("data-agent-tab");
                if (buttonTab === target) {
                  button.classList.add("is-active");
                  button.setAttribute("aria-selected", "true");
                } else {
                  button.classList.remove("is-active");
                  button.setAttribute("aria-selected", "false");
                }
              });
            }
            AGENT_HUB_TYPES.forEach(type => {
              const panel = agentHubSections[type] ? agentHubSections[type].panel : null;
              if (panel) {
                panel.hidden = type !== target;
              }
            });
          }

          function updateAgentHubResetVisibility() {
            if (!dom.agentHubReset) {
              return;
            }
            const hasData = AGENT_HUB_TYPES.some(type => {
              const dataset = state.agentHub && state.agentHub.datasets ? state.agentHub.datasets[type] : null;
              return !!(dataset && Array.isArray(dataset.rows) && dataset.rows.length);
            });
            dom.agentHubReset.hidden = !hasData;
          }

          function eventContainsFiles(event) {
            if (!event || !event.dataTransfer) {
              return false;
            }
            const types = event.dataTransfer.types;
            if (!types) {
              return true;
            }
            for (let index = 0; index < types.length; index += 1) {
              if (types[index] === "Files") {
                return true;
              }
            }
            return false;
          }

          function filterAgentHubRows(type, rows) {
            const filterValue = (state.agentHub?.filters?.[type] || "").trim().toLowerCase();
            if (!filterValue) {
              return rows;
            }
            const config = agentHubDatasetConfig[type];
            if (!config || !Array.isArray(config.filterKeys) || !config.filterKeys.length) {
              return rows;
            }
            return rows.filter(row => config.filterKeys.some(key => {
              const value = row[key] || row[`${key}Raw`];
              return typeof value === "string" && value.toLowerCase().includes(filterValue);
            }));
          }

          function saveAgentHubSnapshotToIndexedDB(snapshot = {}) {
            if (!DATA_DB_SUPPORTED) {
              return Promise.reject(new Error("IndexedDB is not supported in this browser."));
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_HUB_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_AGENT_HUB_STORE);
              const record = {
                id: DATA_DB_AGENT_HUB_KEY,
                data: snapshot,
                savedAt: Date.now()
              };
              store.put(record);
              transaction.oncomplete = () => {
                db.close();
                resolve(record);
              };
              transaction.onerror = event => {
                const error = transaction.error || event.target.error;
                db.close();
                reject(error || new Error("Unable to store agent hub datasets."));
              };
            }));
          }

          function deleteAgentHubSnapshotFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve();
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_HUB_STORE, "readwrite");
              const store = transaction.objectStore(DATA_DB_AGENT_HUB_STORE);
              const request = store.delete(DATA_DB_AGENT_HUB_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to delete stored agent hub datasets.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                db.close();
                resolve();
              };
            }));
          }

          function loadAgentHubSnapshotFromIndexedDB() {
            if (!DATA_DB_SUPPORTED) {
              return Promise.resolve(null);
            }
            return openDatasetDatabase().then(db => new Promise((resolve, reject) => {
              const transaction = db.transaction(DATA_DB_AGENT_HUB_STORE, "readonly");
              const store = transaction.objectStore(DATA_DB_AGENT_HUB_STORE);
              const request = store.get(DATA_DB_AGENT_HUB_KEY);
              request.onerror = () => {
                const error = request.error || new Error("Unable to read stored agent hub datasets.");
                db.close();
                reject(error);
              };
              request.onsuccess = () => {
                const record = request.result;
                db.close();
                if (!record) {
                  resolve(null);
                  return;
                }
                resolve(record.data || {});
              };
            }));
          }

          function sortAgentHubRows(type, rows) {
            const sortState = state.agentHub?.sort?.[type];
            const column = sortState?.column;
            if (!column) {
              return rows;
            }
            const config = agentHubDatasetConfig[type];
            if (!config) {
              return rows;
            }
            const columnConfig = config.columns.find(col => col.key === column);
            if (!columnConfig) {
              return rows;
            }
            const direction = sortState.direction === "desc" ? -1 : 1;
            return rows.slice().sort((a, b) => {
              const comparison = compareAgentHubValues(columnConfig.type, a[column], b[column]);
              return comparison * direction;
            });
          }

          function compareAgentHubValues(type, aValue, bValue) {
            if (type === "number") {
              const aNumber = Number.isFinite(aValue) ? aValue : 0;
              const bNumber = Number.isFinite(bValue) ? bValue : 0;
              return aNumber - bNumber;
            }
            if (type === "date") {
              const aTime = aValue instanceof Date && !Number.isNaN(aValue.getTime()) ? aValue.getTime() : -Infinity;
              const bTime = bValue instanceof Date && !Number.isNaN(bValue.getTime()) ? bValue.getTime() : -Infinity;
              return aTime - bTime;
            }
            const aText = String(aValue || "").toLowerCase();
            const bText = String(bValue || "").toLowerCase();
            return aText.localeCompare(bText);
          }

          function setAgentHubFilter(type, value) {
            if (!state.agentHub || !state.agentHub.filters) {
              return;
            }
            state.agentHub.filters[type] = value || "";
            if (state.agentHub?.expanded) {
              state.agentHub.expanded[type] = false;
            }
            renderAgentHubTable(type);
          }

          function setAgentHubSort(type, column) {
            if (!state.agentHub || !state.agentHub.sort || !column) {
              return;
            }
            const current = state.agentHub.sort[type] || { column: null, direction: "asc" };
            let direction = "asc";
            if (current.column === column) {
              direction = current.direction === "asc" ? "desc" : "asc";
            }
            state.agentHub.sort[type] = { column, direction };
            if (state.agentHub?.expanded) {
              state.agentHub.expanded[type] = false;
            }
            renderAgentHubTable(type);
          }

          function toggleAgentHubRows(type) {
            if (!state.agentHub || !state.agentHub.expanded) {
              return;
            }
            const current = Boolean(state.agentHub.expanded[type]);
            state.agentHub.expanded[type] = !current;
            renderAgentHubTable(type);
          }

          function updateAgentHubFilterControls(type) {
            const section = agentHubSections[type];
            if (!section) {
              return;
            }
            const filterValue = state.agentHub?.filters?.[type] || "";
            if (section.filterInput && section.filterInput.value !== filterValue) {
              section.filterInput.value = filterValue;
            }
            if (section.filterClear) {
              section.filterClear.hidden = !filterValue.trim().length;
            }
          }

          function toggleAgentHubFilterBar(type, visible) {
            const section = agentHubSections[type];
            if (section && section.filterBar) {
              section.filterBar.hidden = !visible;
            }
          }

          function updateAgentHubSortIndicators(type) {
            const section = agentHubSections[type];
            if (!section || !section.sortButtons) {
              return;
            }
            const sortState = state.agentHub?.sort?.[type] || { column: null, direction: "asc" };
            section.sortButtons.forEach(button => {
              const column = button.getAttribute("data-agent-hub-sort-key");
              const isActive = column && column === sortState.column;
              button.classList.toggle("is-active", Boolean(isActive));
              const indicator = button.querySelector(".agent-sort-indicator");
              if (indicator) {
                indicator.textContent = isActive ? (sortState.direction === "desc" ? "▼" : "▲") : "";
              }
              const th = button.closest("th");
              if (th) {
                th.setAttribute("aria-sort", isActive ? (sortState.direction === "desc" ? "descending" : "ascending") : "none");
              }
            });
          }
      
          function renderDashboard() {
            updateSeriesToggleState();
            updateSeriesDetailModeButton();
            updateCustomRangeHint();
            updateThemeToggleUI();
            updateSnapshotControlsAvailability();
            updateFilterChips();
            syncUsageThresholdInputs();
            updateReturningMetricToggleState();
            updateReturningIntervalToggleState();
            if (state.filters.metric === "adoption" && state.trendView !== "total") {
              state.trendView = "total";
            }
            updateTrendViewToggleState();
            updateActiveDaysToggleState();
            if (dom.returningMetric && dom.returningMetric.value !== state.returningMetric) {
              dom.returningMetric.value = state.returningMetric;
            }
      
            if (!state.rows.length) {
              dom.summaryActions.textContent = "-";
              dom.summaryHours.textContent = "-";
              dom.summaryUsers.textContent = "-";
              setLatestSummary(null, null);
              dom.summaryActionsNote.textContent = "Upload data to begin.";
              dom.summaryHoursNote.textContent = "Upload data to begin.";
              dom.summaryUsersNote.textContent = "Upload data to begin.";
              dom.summaryLatestNote.textContent = "Latest period appears after parsing.";
              dom.trendCaption.textContent = "Upload data to visualize momentum.";
              dom.trendWindow.textContent = "-";
              dom.trendEmpty.hidden = false;
              state.charts.trend.data.labels = [];
              state.charts.trend.data.datasets = [];
              state.charts.trend.update("none");
              dom.groupBody.innerHTML = "";
              dom.groupCaption.textContent = "Select a metric and view to compare groups.";
              dom.viewMoreButton.hidden = true;
              buildTopUsersList([]);
              updateCategoryCards(null);
              updateAdoptionByApp(null);
              updateUsageIntensity(null);
              updateEnabledLicensesChart(null);
              updateReturningUsers(null);
              updateActiveDaysCard(null);
              updateAgentUsageCard(state.agentUsageRows);
              state.latestTrendPeriods = [];
              state.latestGroupData = null;
              state.latestTopUsers = [];
              state.latestReturningAggregates = null;
              state.latestAdoption = null;
              state.latestActiveDays = null;
              state.latestEnabledTimeline = [];
              state.latestPerAppActions = [];
              state.groupsExpanded = false;
              state.topUsersExpanded = false;
              state.topUsersPanelOpen = false;
              updateExportDetailOption();
              setTrendColorControlsVisibility(false);
              if (dom.seriesModeToggle) {
                dom.seriesModeToggle.disabled = true;
                dom.seriesModeToggle.classList.add("is-disabled");
              }
              return;
            }
      
            const filtered = applyFilters(state.rows);
            if (state.filters.timeframe === "custom" && state.filters.customRangeInvalid) {
              handleInvalidCustomRange();
              return;
            }
            if (!filtered.length) {
              dom.summaryActions.textContent = "0";
              dom.summaryHours.textContent = "0";
              dom.summaryUsers.textContent = "0";
              setLatestSummary(null, null);
              dom.summaryActionsNote.textContent = "No rows match the current filters.";
              dom.summaryHoursNote.textContent = "No rows match the current filters.";
              dom.summaryUsersNote.textContent = "Adjust filters to see users.";
              dom.summaryLatestNote.textContent = "Adjust filters to see a latest period.";
              dom.trendCaption.textContent = "No data for the selected filters.";
              dom.trendWindow.textContent = "-";
              dom.trendEmpty.textContent = "No data for the selected filters.";
              dom.trendEmpty.hidden = false;
              state.charts.trend.data.labels = [];
              state.charts.trend.data.datasets = [];
              state.charts.trend.update("none");
              dom.groupBody.innerHTML = "";
              dom.groupCaption.textContent = "No group data available for the current filters.";
              dom.viewMoreButton.hidden = true;
              buildTopUsersList([]);
              updateCategoryCards(null);
              updateAdoptionByApp(null);
              updateUsageIntensity(null);
              updateEnabledLicensesChart(null);
              updateReturningUsers(null);
              updateActiveDaysCard(null);
              state.latestTrendPeriods = [];
              state.latestGroupData = null;
              state.latestTopUsers = [];
              state.latestReturningAggregates = null;
              state.latestAdoption = null;
              state.latestActiveDays = null;
              state.latestEnabledTimeline = [];
              state.groupsExpanded = false;
              state.topUsersExpanded = false;
              updateExportDetailOption();
              setTrendColorControlsVisibility(false);
              if (dom.seriesModeToggle) {
                dom.seriesModeToggle.disabled = true;
                dom.seriesModeToggle.classList.add("is-disabled");
              }
              return;
            }
      
            const aggregates = computeAggregates(filtered);
            const supplemental = buildSupplementalInsights(filtered);
            state.latestTrendPeriods = Array.isArray(aggregates.periods) ? aggregates.periods.slice() : [];
            state.latestEnabledTimeline = Array.isArray(aggregates.monthlyEnabledUsers) ? aggregates.monthlyEnabledUsers.slice() : [];
            state.latestPerAppActions = Array.isArray(supplemental.perAppActions) ? supplemental.perAppActions.slice() : [];
      
            dom.summaryActions.textContent = numberFormatter.format(Math.round(aggregates.totals.totalActions));
            dom.summaryHours.textContent = `${hoursFormatter.format(aggregates.totals.assistedHours)} hrs`;
            dom.summaryUsers.textContent = numberFormatter.format(aggregates.activeUsers.size);
            if (aggregates.latestWeek) {
              const metricValue =
                state.filters.metric === "hours"
                  ? `${hoursFormatter.format(aggregates.latestWeek.assistedHours)} hrs`
                  : numberFormatter.format(Math.round(aggregates.latestWeek.totalActions));
              setLatestSummary(aggregates.latestWeek.label, metricValue);
              const delta = aggregates.previousWeek
                ? state.filters.metric === "hours"
                  ? aggregates.latestWeek.assistedHours - aggregates.previousWeek.assistedHours
                  : aggregates.latestWeek.totalActions - aggregates.previousWeek.totalActions
                : null;
              dom.summaryLatestNote.textContent =
                delta == null
                  ? "No prior period available."
                  : `Change vs prior period: ${numberFormatter.format(Math.round(delta))}`;
            } else {
              setLatestSummary(null, null);
              dom.summaryLatestNote.textContent = "No latest period available.";
            }
      
            dom.summaryActionsNote.textContent = `Across ${aggregates.filteredCount} records (avg ${numberFormatter.format(Math.round(aggregates.averageActionsPerUser))} actions per active user).`;
            dom.summaryHoursNote.textContent = `Average ${hoursFormatter.format(aggregates.averageHoursPerUser)} hrs per active user.`;
            const activeUserCount = aggregates.activeUsers.size;
            const enabledUserCount = aggregates.enabledUsers instanceof Set ? aggregates.enabledUsers.size : 0;
            if (activeUserCount || enabledUserCount) {
              const fragments = [];
              if (activeUserCount) {
                fragments.push(`${numberFormatter.format(activeUserCount)} active (with actions)`);
              }
              if (enabledUserCount) {
                fragments.push(`${numberFormatter.format(enabledUserCount)} enabled`);
              }
              dom.summaryUsersNote.textContent = fragments.join(" · ");
            } else {
              dom.summaryUsersNote.textContent = "No active users in view.";
            }
      
            updateTrendCaptionText();
            dom.trendWindow.textContent = aggregates.windowLabel;

            updateTrendChart(aggregates.periods);
            const totalMetric = state.filters.metric === "hours" ? aggregates.totals.assistedHours : aggregates.totals.totalActions;
            state.latestGroupData = {
              groups: Array.isArray(aggregates.groups) ? aggregates.groups : [],
              totalMetricValue: totalMetric
            };
            state.latestTopUsers = Array.isArray(aggregates.topUsers) ? aggregates.topUsers : [];
            state.latestReturningAggregates = {
              periods: aggregates.periods,
              weeklyTimeline: aggregates.weeklyTimeline
            };
            state.latestAdoption = aggregates.adoption;
            state.latestActiveDays = aggregates.activeDaysLast30;
            updateGroupTable(state.latestGroupData.groups, state.latestGroupData.totalMetricValue);
            buildTopUsersList(state.latestTopUsers);
            updateCategoryCards(aggregates.categoryTotals);
            updateAdoptionByApp(state.latestAdoption);
            updateUsageIntensity(aggregates);
            updateEnabledLicensesChart(state.latestEnabledTimeline);
            updateReturningUsers(state.latestReturningAggregates);
            updateActiveDaysCard(state.latestActiveDays);
            updateAgentUsageCard(state.agentUsageRows);
            if (dom.seriesModeToggle) {
              dom.seriesModeToggle.disabled = false;
              dom.seriesModeToggle.classList.remove("is-disabled");
            }
            setTrendColorControlsVisibility(state.filters.metric !== "hours");
            updateExportDetailOption();
          }
          function handleCustomRangeChange() {
            if (!dom.customRangeStart || !dom.customRangeEnd) {
              return;
            }
            state.filters.customStart = parseDateInputValue(dom.customRangeStart.value);
            state.filters.customEnd = parseDateInputValue(dom.customRangeEnd.value);
            state.filters.customRangeInvalid = Boolean(state.filters.customStart && state.filters.customEnd && state.filters.customStart > state.filters.customEnd);
            updateCustomRangeHint();
            renderDashboard();
            persistFilterPreferences();
          }
      
          function ensureCustomRangeDefaults() {
            if (!state.earliestDate || !state.latestDate) {
              return;
            }
            if (!state.filters.customStart) {
              state.filters.customStart = new Date(state.earliestDate.getTime());
            }
            if (!state.filters.customEnd) {
              state.filters.customEnd = new Date(state.latestDate.getTime());
            }
            state.filters.customRangeInvalid = false;
            syncCustomRangeInputs();
          }
      
          function syncCustomRangeInputs() {
            if (!dom.customRangeStart || !dom.customRangeEnd) {
              return;
            }
            const minValue = state.earliestDate ? toDateInputValue(state.earliestDate) : "";
            const maxValue = state.latestDate ? toDateInputValue(state.latestDate) : "";
            if (minValue) {
              dom.customRangeStart.min = minValue;
              dom.customRangeEnd.min = minValue;
            } else {
              dom.customRangeStart.removeAttribute("min");
              dom.customRangeEnd.removeAttribute("min");
            }
            if (maxValue) {
              dom.customRangeStart.max = maxValue;
              dom.customRangeEnd.max = maxValue;
            } else {
              dom.customRangeStart.removeAttribute("max");
              dom.customRangeEnd.removeAttribute("max");
            }
            dom.customRangeStart.value = state.filters.customStart ? toDateInputValue(state.filters.customStart) : "";
            dom.customRangeEnd.value = state.filters.customEnd ? toDateInputValue(state.filters.customEnd) : "";
          }
      
          function updateCustomRangeVisibility() {
            if (!dom.customRangeContainer) {
              return;
            }
            const isCustom = state.filters.timeframe === "custom";
            dom.customRangeContainer.hidden = !isCustom;
            if (isCustom) {
              syncCustomRangeInputs();
            }
            updateCustomRangeHint();
          }
      
          function updateCustomRangeHint() {
            if (!dom.customRangeHint) {
              return;
            }
            if (state.filters.timeframe !== "custom") {
              dom.customRangeHint.hidden = true;
              return;
            }
            if (!state.earliestDate || !state.latestDate) {
              dom.customRangeHint.textContent = "Upload data to enable the custom range.";
              dom.customRangeHint.hidden = false;
              return;
            }
            if (state.filters.customRangeInvalid) {
              dom.customRangeHint.textContent = "Start date must be on or before end date.";
              dom.customRangeHint.hidden = false;
              return;
            }
            if (!state.filters.customStart && !state.filters.customEnd) {
              dom.customRangeHint.textContent = "Select start and end dates within the dataset range.";
              dom.customRangeHint.hidden = false;
              return;
            }
            dom.customRangeHint.hidden = true;
          }
      
          function updateFilterChips() {
            // chips removed; keep function for compatibility
          }
      
          function syncUsageThresholdInputs() {
            const { middle, high } = getUsageThresholdStarts();
            if (dom.usageThresholdMiddle && dom.usageThresholdMiddle.value !== String(middle)) {
              dom.usageThresholdMiddle.value = middle;
            }
            if (dom.usageThresholdHigh && dom.usageThresholdHigh.value !== String(high)) {
              dom.usageThresholdHigh.value = high;
            }
          }

          function setLatestSummary(periodLabel, metricValue) {
            if (dom.summaryLatestPeriod && dom.summaryLatestMetric) {
              if (periodLabel == null && metricValue == null) {
                dom.summaryLatestPeriod.textContent = "-";
                dom.summaryLatestMetric.textContent = "";
              } else {
                dom.summaryLatestPeriod.textContent = periodLabel ?? "";
                dom.summaryLatestMetric.textContent = metricValue ?? "";
              }
            } else if (dom.summaryLatest) {
              if (periodLabel == null && metricValue == null) {
                dom.summaryLatest.textContent = "-";
              } else if (periodLabel && metricValue) {
                dom.summaryLatest.textContent = `${periodLabel} - ${metricValue}`;
              } else {
                dom.summaryLatest.textContent = periodLabel || metricValue || "-";
              }
            }
          }
      
          function handleInvalidCustomRange() {
            dom.summaryActions.textContent = "-";
            dom.summaryHours.textContent = "-";
            dom.summaryUsers.textContent = "-";
            setLatestSummary(null, null);
            dom.summaryActionsNote.textContent = "Select a valid custom date range.";
            dom.summaryHoursNote.textContent = "Select a valid custom date range.";
            dom.summaryUsersNote.textContent = "Select a valid custom date range.";
            dom.summaryLatestNote.textContent = "Select a valid custom date range.";
            dom.trendCaption.textContent = "Custom date range invalid.";
            dom.trendWindow.textContent = "-";
            dom.trendEmpty.textContent = "Adjust the custom range to view data.";
            dom.trendEmpty.hidden = false;
            if (state.charts.trend) {
              state.charts.trend.data.labels = [];
              state.charts.trend.data.datasets = [];
              state.charts.trend.update("none");
            }
            dom.groupBody.innerHTML = "";
            dom.groupCaption.textContent = "Adjust the custom range to see data.";
            dom.viewMoreButton.hidden = true;
            buildTopUsersList([]);
            updateCategoryCards(null);
            updateAdoptionByApp(null);
            updateUsageIntensity(null);
            updateReturningUsers(null);
            updateActiveDaysCard(null);
            state.latestTrendPeriods = [];
            updateExportDetailOption();
            setTrendColorControlsVisibility(false);
            if (dom.seriesModeToggle) {
              dom.seriesModeToggle.disabled = true;
              dom.seriesModeToggle.classList.add("is-disabled");
            }
          }
      
          function parseDateInputValue(value) {
            if (!value) {
              return null;
            }
            const parts = value.split("-");
            if (parts.length !== 3) {
              return null;
            }
            const year = Number(parts[0]);
            const month = Number(parts[1]);
            const day = Number(parts[2]);
            if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
              return null;
            }
            return new Date(Date.UTC(year, month - 1, day));
          }
      
          function toDateInputValue(date) {
            if (!date) {
              return "";
            }
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          }
          function applyFilters(rows) {
            const { organization, country, timeframe, customStart, customEnd, customRangeInvalid } = state.filters;
            const organizationFilter = organization instanceof Set ? organization : new Set();
            const countryFilter = country instanceof Set ? country : new Set();
            const hasOrganizationFilter = organizationFilter.size > 0;
            const hasCountryFilter = countryFilter.size > 0;
            if (timeframe === "custom" && customRangeInvalid) {
              return [];
            }
            const cutoff = timeframe === "custom" ? null : computeCutoffDate(timeframe);
            return rows.filter(row => {
              const rowOrganization = resolveSegmentValue(row, state.filterFields.organization);
              if (hasOrganizationFilter && !organizationFilter.has(rowOrganization)) {
                return false;
              }
              const rowCountry = resolveSegmentValue(row, state.filterFields.country);
              if (hasCountryFilter && !countryFilter.has(rowCountry)) {
                return false;
              }
              if (timeframe === "custom") {
                if (customStart && row.date < customStart) {
                  return false;
                }
                if (customEnd && row.date > customEnd) {
                  return false;
                }
              } else if (cutoff && row.date < cutoff) {
                return false;
              }
              return true;
            });
          }
      
          function computeCutoffDate(timeframe) {
            if (!state.latestDate || timeframe === "all") {
              return null;
            }
            const latest = new Date(state.latestDate.getTime());
            if (timeframe === "3m") {
              latest.setUTCMonth(latest.getUTCMonth() - 3);
            } else if (timeframe === "6m") {
              latest.setUTCMonth(latest.getUTCMonth() - 6);
            } else if (timeframe === "12m") {
              latest.setUTCMonth(latest.getUTCMonth() - 12);
            }
            latest.setUTCHours(0, 0, 0, 0);
            return latest;
          }
      
          function buildSupplementalInsights(rows) {
            const perAppConfig = {
              word: {
                label: "Word",
                fields: ["wordActions", "documentSummaries", "rewriteTextWord", "draftWord", "visualizeTableWord", "wordChatPrompts"]
              },
              teams: {
                label: "Teams",
                fields: ["teamsActions", "meetingRecap", "meetingSummariesTotal", "meetingSummariesActions", "chatCompose", "chatSummaries", "chatConversations", "chatPromptsTeams"]
              },
              powerpoint: {
                label: "PowerPoint",
                fields: ["powerpointActions", "presentationCreated", "addContentPresentation", "organizePresentation", "summarizePresentation", "powerpointChatPrompts"]
              },
              excel: {
                label: "Excel",
                fields: ["excelActions", "excelAnalysis", "excelFormula", "excelFormatting", "excelChatPrompts"]
              },
              outlook: {
                label: "Outlook",
                fields: ["outlookActions", "emailDrafts", "emailSummaries", "emailCoaching", "emailTotalWithCopilot"]
              },
              chatWork: {
                label: "Copilot chat (work)",
                fields: ["chatWorkActions", "chatPromptsWork", "chatPromptsWorkTeams", "chatPromptsWorkOutlook"],
                exclusiveGroups: [
                  {
                    primary: "chatPromptsWork",
                    fallback: ["chatPromptsWorkTeams", "chatPromptsWorkOutlook"]
                  }
                ]
              },
              chatWeb: {
                label: "Copilot chat (web)",
                fields: ["chatPromptsWeb", "chatPromptsWebTeams", "chatPromptsWebOutlook"],
                exclusiveGroups: [
                  {
                    primary: "chatPromptsWeb",
                    fallback: ["chatPromptsWebTeams", "chatPromptsWebOutlook"]
                  }
                ]
              }
            };
            const perAppTotals = Object.entries(perAppConfig).reduce((acc, [key, config]) => {
              const fields = Array.isArray(config.fields) ? config.fields : [];
              acc[key] = {
                label: config.label,
                fields: fields.reduce((fieldAcc, field) => {
                  fieldAcc[field] = 0;
                  return fieldAcc;
                }, {}),
                total: 0
              };
              return acc;
            }, {});
            const iterableRows = Array.isArray(rows) ? rows : [];
            iterableRows.forEach(row => {
              if (!row || typeof row !== "object") {
                return;
              }
              const metrics = row.metrics || {};
              Object.entries(perAppConfig).forEach(([key, config]) => {
                const totals = perAppTotals[key];
                if (!totals) {
                  return;
                }
                const exclusiveGroups = Array.isArray(config.exclusiveGroups) ? config.exclusiveGroups : [];
                let rowFields = Array.isArray(config.fields) ? Array.from(config.fields) : [];
                exclusiveGroups.forEach(group => {
                  if (!group) {
                    return;
                  }
                  const primaryField = group.primary;
                  const fallbackFields = Array.isArray(group.fallback) ? group.fallback : [];
                  const primaryValue = primaryField ? metrics[primaryField] || 0 : 0;
                  if (primaryField) {
                    if (primaryValue > 0) {
                      rowFields = rowFields.filter(field => !fallbackFields.includes(field));
                    } else {
                      rowFields = rowFields.filter(field => field !== primaryField);
                    }
                  }
                });
                let rowTotal = 0;
                rowFields.forEach(field => {
                  const value = metrics[field] || 0;
                  if (!Number.isFinite(value) || value <= 0) {
                    return;
                  }
                  totals.fields[field] += value;
                  rowTotal += value;
                });
                totals.total += rowTotal;
              });
            });
            const perAppActions = Object.entries(perAppTotals)
              .map(([key, data]) => ({
                key,
                label: data.label,
                total: data.total,
                fields: data.fields
              }))
              .sort((a, b) => (b.total || 0) - (a.total || 0));
            return { perAppActions };
          }
      
          function computeAggregates(rows, groupOverride) {
            const totals = {
              totalActions: 0,
              assistedHours: 0
            };
            const activeUsers = new Set();
            const enabledUsers = new Set();
            const groupMap = new Map();
            const periodMap = new Map();
            const userTotals = new Map();
            const last30Cutoff = state.latestDate instanceof Date
              ? (() => {
                const cutoff = new Date(state.latestDate.getTime());
                cutoff.setUTCDate(cutoff.getUTCDate() - 29);
                cutoff.setUTCHours(0, 0, 0, 0);
                return cutoff;
              })()
              : null;
            const last30UserSets = new Map(activeDayKeys.map(key => [key, new Set()]));
            const last30PromptTotals = Object.fromEntries(activeDayKeys.map(key => [key, 0]));
            const userWeeklyActivity = new Map();
            const userWeekActions = new Map();
            const weekMap = new Map();
            const monthlyUsageMap = new Map();
            const categoryKeys = Object.keys(categoryConfig);
            const createCategoryAccumulator = () => Object.fromEntries(categoryKeys.map(key => [key, {
              primary: 0,
              secondary: categoryConfig[key].secondary.map(() => 0),
              total: 0
            }]));
            const categoryTotals = {};
            categoryKeys.forEach(key => {
              const config = categoryConfig[key];
              categoryTotals[key] = {
                primary: 0,
                secondary: config.secondary.map(() => 0),
                total: 0
              };
            });
            const adoptionEntries = Object.entries(adoptionAppConfig).map(([key, config]) => ({
              key,
              config,
              userSet: new Set(),
              featureSets: Array.isArray(config.features) ? config.features.map(() => new Set()) : []
            }));
      
            let periodEarliest = null;
            let periodLatest = null;
            let latestWeek = null;
            let previousWeek = null;
      
            const usageBucketsTemplate = buildUsageFrequencyBuckets();
            const aggregateIsWeekly = state.filters.aggregate === "weekly";
            const selectionContext = buildSelectionContext(getActiveCategorySelection());
            const hiddenCapabilityFields = selectionContext.hiddenCapabilityFields || new Set();
            const hiddenHourCategories = selectionContext.hiddenHourCategories || new Set();

            rows.forEach(row => {
              const rowTotalActions = row.totalActions || 0;
              const rowTotalHours = row.assistedHours || 0;
              const metrics = row.metrics || {};

              let hiddenActionTotal = 0;
              hiddenCapabilityFields.forEach(field => {
                const value = Number(metrics[field]);
                if (Number.isFinite(value)) {
                  hiddenActionTotal += value;
                }
              });
              let rowSelectedActions = rowTotalActions - hiddenActionTotal;
              if (!Number.isFinite(rowSelectedActions)) {
                rowSelectedActions = 0;
              } else if (rowSelectedActions < 0) {
                rowSelectedActions = 0;
              }

              let hiddenHourTotal = 0;
              hiddenHourCategories.forEach(categoryKey => {
                const hourField = categoryHourFieldMap[categoryKey];
                if (!hourField) {
                  return;
                }
                const value = Number(metrics[hourField]);
                if (Number.isFinite(value)) {
                  hiddenHourTotal += value;
                }
              });
              let rowSelectedHours = rowTotalHours - hiddenHourTotal;
              if (!Number.isFinite(rowSelectedHours)) {
                rowSelectedHours = 0;
              } else if (rowSelectedHours < 0) {
                rowSelectedHours = 0;
              }
      
              totals.totalActions += rowSelectedActions;
              totals.assistedHours += rowSelectedHours;
      
              const personKey = sanitizeLabel(row.personId) || "Unspecified";
              const organization = resolveSegmentValue(row, state.filterFields.organization);
              const existingUserInfo = userTotals.get(personKey) || {
                name: personKey,
                organization,
                totalActions: 0,
                assistedHours: 0
              };
              existingUserInfo.name = personKey;
              if (!existingUserInfo.organization || existingUserInfo.organization === "Unspecified") {
                existingUserInfo.organization = organization;
              }
              existingUserInfo.totalActions += rowSelectedActions;
              existingUserInfo.assistedHours += rowSelectedHours;
              userTotals.set(personKey, existingUserInfo);
      
              if (rowSelectedActions > 0 || rowSelectedHours > 0) {
                activeUsers.add(personKey);
              }
      
              const withinLast30 = last30Cutoff instanceof Date && row.date >= last30Cutoff;
              if (withinLast30) {
                activeDayKeys.forEach(key => {
                  const config = activeDaysConfig[key];
                  if (!config) {
                    return;
                  }
                  const metrics = row.metrics || {};
                  const dayField = config.dayField;
                  const promptFields = Array.isArray(config.promptFields) ? config.promptFields : [];
                  let hasUsage = false;
                  if (dayField) {
                    hasUsage = (metrics[dayField] || 0) > 0;
                  }
                  if (!hasUsage && promptFields.length) {
                    hasUsage = promptFields.some(field => (metrics[field] || 0) > 0);
                  }
                  if (hasUsage) {
                    const set = last30UserSets.get(key);
                    if (set) {
                      set.add(personKey);
                    }
                  }
                  if (promptFields.length) {
                    let promptSum = 0;
                    promptFields.forEach(field => {
                      const value = metrics[field] || 0;
                      if (Number.isFinite(value)) {
                        promptSum += value;
                      }
                    });
                    if (promptSum > 0) {
                      last30PromptTotals[key] += promptSum;
                    }
                  }
                });
              }
      
              const isCopilotEnabled = (row.metrics.copilotEnabledUser || 0) > 0;
              if (isCopilotEnabled) {
                enabledUsers.add(personKey);
              }
      
              const weekKey = `${row.isoYear}-W${pad(row.isoWeek)}`;
              const effectiveWeekDate = row.weekEndDate || row.date;
              let weekBucket = weekMap.get(weekKey);
              if (!weekBucket) {
                weekBucket = {
                  key: weekKey,
                  totalActions: 0,
                  assistedHours: 0,
                  date: effectiveWeekDate,
                  users: new Set(),
                  enabledUsers: new Set()
                };
                weekMap.set(weekKey, weekBucket);
              }
              weekBucket.totalActions += rowSelectedActions;
              weekBucket.assistedHours += rowSelectedHours;
              if (!weekBucket.date || effectiveWeekDate > weekBucket.date) {
                weekBucket.date = effectiveWeekDate;
              }
              if (isCopilotEnabled) {
                weekBucket.enabledUsers.add(personKey);
              }
              if (rowSelectedActions > 0 || rowSelectedHours > 0) {
                weekBucket.users.add(personKey);
                let personWeeks = userWeeklyActivity.get(personKey);
                if (!personWeeks) {
                  personWeeks = new Set();
                  userWeeklyActivity.set(personKey, personWeeks);
                }
                personWeeks.add(weekKey);
                if (rowSelectedActions > 0) {
                  let weekActions = userWeekActions.get(personKey);
                  if (!weekActions) {
                    weekActions = new Map();
                    userWeekActions.set(personKey, weekActions);
                  }
                  const currentWeekTotal = weekActions.get(weekKey) || 0;
                  weekActions.set(weekKey, currentWeekTotal + rowSelectedActions);
                  let monthUsage = monthlyUsageMap.get(row.monthKey);
                  if (!monthUsage) {
                    monthUsage = {
                      key: row.monthKey,
                      label: formatMonthYear(row.date),
                      userActions: new Map(),
                      userWeeks: new Map(),
                      weekKeys: new Set(),
                      firstDate: effectiveWeekDate,
                      lastDate: effectiveWeekDate
                    };
                    monthlyUsageMap.set(row.monthKey, monthUsage);
                  }
                  const monthTotal = monthUsage.userActions.get(personKey) || 0;
                  monthUsage.userActions.set(personKey, monthTotal + rowSelectedActions);
                  let monthWeekSet = monthUsage.userWeeks.get(personKey);
                  if (!monthWeekSet) {
                    monthWeekSet = new Set();
                    monthUsage.userWeeks.set(personKey, monthWeekSet);
                  }
                  if (weekKey) {
                    monthWeekSet.add(weekKey);
                    monthUsage.weekKeys.add(weekKey);
                  }
                  const comparativeDate = effectiveWeekDate || row.date;
                  if (comparativeDate instanceof Date) {
                    if (!monthUsage.firstDate || comparativeDate < monthUsage.firstDate) {
                      monthUsage.firstDate = comparativeDate;
                    }
                    if (!monthUsage.lastDate || comparativeDate > monthUsage.lastDate) {
                      monthUsage.lastDate = comparativeDate;
                    }
                  }
                }
              }
      
              const periodKey = aggregateIsWeekly
                ? `${row.isoYear}-W${pad(row.isoWeek)}`
                : row.monthKey;
              let periodBucket = periodMap.get(periodKey);
              if (!periodBucket) {
                periodBucket = {
                  totalActions: 0,
                  assistedHours: 0,
                  date: aggregateIsWeekly ? (row.weekEndDate || row.date) : row.date,
                  isoYear: row.isoYear,
                  isoWeek: row.isoWeek,
                  users: new Set(),
                  enabledUsers: new Set(),
                  categories: createCategoryAccumulator()
                };
                periodMap.set(periodKey, periodBucket);
              }
              periodBucket.totalActions += rowSelectedActions;
              periodBucket.assistedHours += rowSelectedHours;
              const effectiveDate = aggregateIsWeekly ? effectiveWeekDate : row.date;
              if (!periodBucket.date || effectiveDate > periodBucket.date) {
                periodBucket.date = effectiveDate;
              }
              if (rowSelectedActions > 0 || rowSelectedHours > 0) {
                periodBucket.users.add(personKey);
              }
              if (isCopilotEnabled) {
                periodBucket.enabledUsers.add(personKey);
              }
      
              if (!periodEarliest || effectiveDate < periodEarliest) {
                periodEarliest = effectiveDate;
              }
              if (!periodLatest || effectiveDate > periodLatest) {
                periodLatest = effectiveDate;
              }

              const grouping = groupOverride || state.filters.group;
              const groupKey = getGroupKey(row, grouping);
              let groupBucket = groupMap.get(groupKey);
              if (!groupBucket) {
                groupBucket = { totalActions: 0, assistedHours: 0, users: new Set() };
                groupMap.set(groupKey, groupBucket);
              }
              groupBucket.totalActions += rowSelectedActions;
              groupBucket.assistedHours += rowSelectedHours;
              if (rowSelectedActions > 0 || rowSelectedHours > 0) {
                groupBucket.users.add(personKey);
              }
      
              Object.entries(categoryConfig).forEach(([key, config]) => {
                const totalsForCategory = categoryTotals[key];
                const primaryValue = row.metrics[config.primary] || 0;
                totalsForCategory.primary += primaryValue;
                const periodCategory = periodBucket.categories[key];
                if (periodCategory) {
                  periodCategory.primary += primaryValue;
                }
                totalsForCategory.total = (totalsForCategory.total || 0) + primaryValue;
                if (periodCategory) {
                  periodCategory.total = (periodCategory.total || 0) + primaryValue;
                }
                config.secondary.forEach((field, index) => {
                  const value = row.metrics[field] || 0;
                  totalsForCategory.secondary[index] += value;
                  if (periodCategory) {
                    periodCategory.secondary[index] += value;
                  }
                  totalsForCategory.total += value;
                  if (periodCategory) {
                    periodCategory.total = (periodCategory.total || 0) + value;
                  }
                });
              });
              adoptionEntries.forEach(entry => {
                const { config, userSet, featureSets } = entry;
                const metrics = row.metrics || {};
                if (!activeUsers.has(personKey)) {
                  return;
                }
                let assignedToApp = false;
                if (Array.isArray(config.features) && config.features.length) {
                  config.features.forEach((feature, featureIndex) => {
                    const fields = Array.isArray(feature.metrics) ? feature.metrics : [];
                    const used = fields.some(field => (metrics[field] || 0) > 0);
                    if (used) {
                      featureSets[featureIndex]?.add(personKey);
                      assignedToApp = true;
                    }
                  });
                }
                if (!assignedToApp && Array.isArray(config.indicators) && config.indicators.length) {
                  const hasIndicator = config.indicators.some(field => (metrics[field] || 0) > 0);
                  if (hasIndicator) {
                    assignedToApp = true;
                  }
                }
                if (assignedToApp) {
                  userSet.add(personKey);
                }
              });
            });
      
            const metricKey = state.filters.metric === "hours" ? "assistedHours" : "totalActions";
            const groupEntries = Array.from(groupMap.entries())
              .map(([name, values]) => {
                const userCount = values.users ? values.users.size : 0;
                return {
                  name,
                  totalActions: values.totalActions,
                  assistedHours: values.assistedHours,
                  users: userCount,
                  averageActionsPerUser: userCount ? values.totalActions / userCount : 0
                };
              })
              .filter(entry => entry[metricKey] > 0)
              .sort((a, b) => b[metricKey] - a[metricKey]);
      
            const periods = Array.from(periodMap.entries())
              .map(([label, values]) => {
                const usersSet = values.users instanceof Set ? values.users : new Set();
                const enabledSet = values.enabledUsers instanceof Set ? values.enabledUsers : new Set();
                const userCount = usersSet.size || 0;
                const enabledCount = enabledSet.size || 0;
                return {
                  label: formatPeriodLabel(label, values.date),
                  totalActions: values.totalActions,
                  assistedHours: values.assistedHours,
                  date: values.date,
                  categories: values.categories,
                  users: new Set(usersSet),
                  enabledUsers: new Set(enabledSet),
                  enabledUsersCount: enabledCount,
                  userCount,
                  averageActionsPerUser: userCount ? values.totalActions / userCount : 0,
                  averageHoursPerUser: userCount ? values.assistedHours / userCount : 0,
                  adoptionRate: enabledCount ? (userCount / enabledCount) * 100 : 0
                };
              })
              .sort((a, b) => a.date - b.date);
      
            const weeklyTimeline = Array.from(weekMap.entries())
              .map(([key, values]) => ({
                key,
                label: formatShortDate(values.date),
                totalActions: values.totalActions,
                assistedHours: values.assistedHours,
                date: values.date,
                users: values.users instanceof Set ? new Set(values.users) : new Set(),
                enabledUsers: values.enabledUsers instanceof Set ? new Set(values.enabledUsers) : new Set()
              }))
              .sort((a, b) => a.date - b.date);
      
            const consistentSlice = weeklyTimeline.slice(-4);
            const recentWeekSlice = consistentSlice.length === 4
              ? consistentSlice
              : consistentSlice.slice(-consistentSlice.length);
            const frequentUsageTotals = new Map();
            if (recentWeekSlice.length) {
              const recentKeys = recentWeekSlice.map(entry => entry.key);
              userWeekActions.forEach((weekMap, user) => {
                if (!(weekMap instanceof Map)) {
                  return;
                }
                let total = 0;
                recentKeys.forEach(key => {
                  total += weekMap.get(key) || 0;
                });
                if (total > 0) {
                  frequentUsageTotals.set(user, total);
                }
              });
            }
            const frequentUsageWindowLabel = recentWeekSlice.length
              ? formatRangeLabel(recentWeekSlice[0].date, recentWeekSlice[recentWeekSlice.length - 1].date)
              : null;
      
            if (periods.length) {
              latestWeek = periods[periods.length - 1];
              previousWeek = periods.length > 1 ? periods[periods.length - 2] : null;
            }
      
            const averageActionsPerUser = activeUsers.size ? totals.totalActions / activeUsers.size : 0;
            const averageHoursPerUser = activeUsers.size ? totals.assistedHours / activeUsers.size : 0;
            const userSummaries = Array.from(userTotals.values());
            const topUsers = userSummaries
              .filter(entry => (entry.totalActions || 0) > 0)
              .sort((a, b) => (b.totalActions || 0) - (a.totalActions || 0));
            const totalActiveUsersCount = activeUsers.size;
            const adoptionApps = [];
            adoptionEntries.forEach(entry => {
              const appUsers = entry.userSet.size;
              const shareDenominator = totalActiveUsersCount || 0;
              const featureDetails = Array.isArray(entry.config.features)
                ? entry.config.features.map((feature, index) => {
                  const featureSet = entry.featureSets[index];
                  const count = featureSet instanceof Set ? featureSet.size : 0;
                  return {
                    key: feature.key,
                    label: feature.label,
                    users: count,
                    share: shareDenominator ? (count / shareDenominator) * 100 : 0
                  };
                }).filter(feature => feature.users > 0 || feature.alwaysShow)
                : [];
              featureDetails.sort((a, b) => b.users - a.users);
              const shouldInclude = appUsers > 0 || featureDetails.length > 0 || entry.config.alwaysShow;
              if (!shouldInclude) {
                return;
              }
              adoptionApps.push({
                key: entry.key,
                label: entry.config.label || entry.key,
                color: entry.config.color || null,
                users: appUsers,
                share: shareDenominator ? (appUsers / shareDenominator) * 100 : 0,
                features: featureDetails
              });
            });
            adoptionApps.sort((a, b) => b.users - a.users);
            const monthlyUsageArray = Array.from(monthlyUsageMap.entries()).map(([monthKey, monthData]) => {
              const [yearString, monthString] = monthKey ? monthKey.split("-") : [];
              const year = Number(yearString);
              const monthIndex = Number(monthString);
              const monthDate = Number.isFinite(year) && Number.isFinite(monthIndex)
                ? new Date(Date.UTC(year, monthIndex - 1, 1))
                : null;
              const frequencyTemplate = usageBucketsTemplate.map(bucket => ({
                id: bucket.id,
                label: bucket.label,
                min: bucket.min,
                max: bucket.max,
                count: 0
              }));
              const weekEntries = Array.from(monthData.weekKeys || []).map(key => {
                const weekInfo = weekMap.get(key);
                return {
                  key,
                  date: weekInfo && weekInfo.date instanceof Date ? weekInfo.date : null
                };
              }).filter(entryPoint => entryPoint.date instanceof Date)
                .sort((a, b) => a.date - b.date);
              const selectedWeekEntries = weekEntries.slice(-4);
              const observedWeekCount = selectedWeekEntries.length;
              const allowedWeekKeys = new Set(selectedWeekEntries.map(entry => entry.key));
              const userTotalsForWindow = new Map();
              monthData.userWeeks.forEach((set, user) => {
                if (!(set instanceof Set) || !set.size) {
                  return;
                }
                let userTotal = 0;
                allowedWeekKeys.forEach(key => {
                  if (set.has(key)) {
                    const weekTotals = userWeekActions.get(user);
                    if (weekTotals instanceof Map) {
                      userTotal += weekTotals.get(key) || 0;
                    }
                  }
                });
                if (userTotal > 0) {
                  userTotalsForWindow.set(user, userTotal);
                }
              });
              userTotalsForWindow.forEach(total => {
                const rounded = Math.round(total || 0);
                if (rounded <= 0) {
                  return;
                }
                const bucket = frequencyTemplate.find(item => rounded >= item.min && rounded <= item.max);
                if (bucket) {
                  bucket.count += 1;
                }
              });
              const totalUsersForWindow = userTotalsForWindow.size;
              const frequencyBuckets = frequencyTemplate.map(bucket => ({
                label: bucket.label,
                count: bucket.count,
                share: totalUsersForWindow ? (bucket.count / totalUsersForWindow) * 100 : 0,
                min: bucket.min,
                max: bucket.max
              }));
              const highBucket = frequencyTemplate[frequencyTemplate.length - 1];
              const powerUsers = highBucket.count;
              const powerShare = totalUsersForWindow ? (powerUsers / totalUsersForWindow) * 100 : 0;
              const consistencyBuckets = observedWeekCount ? Array.from({ length: observedWeekCount }, () => 0) : [];
              let weeklyActiveUsers = 0;
              monthData.userWeeks.forEach(set => {
                if (!(set instanceof Set) || !set.size) {
                  return;
                }
                let activeWeeks = 0;
                allowedWeekKeys.forEach(key => {
                  if (set.has(key)) {
                    activeWeeks += 1;
                  }
                });
                if (activeWeeks > 0) {
                  weeklyActiveUsers += 1;
                  const bucketIndex = Math.min(observedWeekCount, activeWeeks) - 1;
                  if (bucketIndex >= 0) {
                    consistencyBuckets[bucketIndex] += 1;
                  }
                }
              });
              const consistentUsers = observedWeekCount && consistencyBuckets.length
                ? consistencyBuckets[consistencyBuckets.length - 1] || 0
                : 0;
              const consistentShare = weeklyActiveUsers ? (consistentUsers / weeklyActiveUsers) * 100 : 0;
              const rangeStart = selectedWeekEntries.length ? selectedWeekEntries[0].date : monthData.firstDate;
              const rangeEnd = selectedWeekEntries.length ? selectedWeekEntries[selectedWeekEntries.length - 1].date : monthData.lastDate;
              const selectedRangeLabel = rangeStart && rangeEnd ? formatRangeLabel(rangeStart, rangeEnd) : null;
              return {
                monthDate,
                data: {
                  key: monthKey,
                  label: monthData.label,
                  totalUsers: totalUsersForWindow,
                  frequencyBuckets,
                  powerUsers,
                  powerShare,
                  highBucketLabel: highBucket.label,
                  observedWeekCount,
                  weeklyActiveUsers,
                  consistencyBuckets,
                  consistentUsers,
                  consistentShare,
                  weekRangeLabel: selectedRangeLabel,
                  monthRangeLabel: selectedRangeLabel
                }
              };
            }).filter(entry => entry.monthDate instanceof Date);
            monthlyUsageArray.sort((a, b) => a.monthDate - b.monthDate);
            const monthlyUsageIntensity = monthlyUsageArray.slice(-12).map(entry => entry.data);
            const weeksByMonth = new Map();
            weekMap.forEach(weekEntry => {
              if (!weekEntry || !(weekEntry.date instanceof Date)) {
                return;
              }
              const monthKey = `${weekEntry.date.getUTCFullYear()}-${pad(weekEntry.date.getUTCMonth() + 1)}`;
              let bucket = weeksByMonth.get(monthKey);
              if (!bucket) {
                bucket = [];
                weeksByMonth.set(monthKey, bucket);
              }
              bucket.push({
                date: new Date(weekEntry.date.getTime()),
                count: weekEntry.enabledUsers instanceof Set ? weekEntry.enabledUsers.size : 0
              });
            });
            const monthlyEnabledUsers = Array.from(weeksByMonth.entries())
              .map(([monthKey, entries]) => {
                entries.sort((a, b) => a.date - b.date);
                const [year, month] = monthKey.split("-").map(Number);
                const monthStart = new Date(Date.UTC(year, (month || 1) - 1, 1));
                const twoWeekEnd = new Date(monthStart.getTime());
                twoWeekEnd.setUTCDate(twoWeekEnd.getUTCDate() + 13);
                const firstFortnight = entries.filter(entry => entry.date >= monthStart && entry.date <= twoWeekEnd);
                const candidates = firstFortnight.length ? firstFortnight : entries.slice(0, 1);
                const bestEntry = candidates.reduce((best, entry) => {
                  const bestCount = best ? best.count || 0 : -Infinity;
                  return (entry.count || 0) > bestCount ? entry : best;
                }, candidates[0] || null);
                const bestCount = bestEntry && Number.isFinite(bestEntry.count) ? bestEntry.count : 0;
                const representativeDate = bestEntry?.date || entries[0].date;
                return {
                  key: monthKey,
                  label: formatMonthYear(representativeDate),
                  count: bestCount,
                  date: representativeDate
                };
              })
              .sort((a, b) => a.date - b.date);
            const adoption = {
              totalActiveUsers: totalActiveUsersCount,
              apps: adoptionApps
            };
      
            return {
              totals,
              activeUsers,
              enabledUsers,
              groups: groupEntries,
              periods,
              filteredCount: rows.length,
              averageActionsPerUser,
              averageHoursPerUser,
              topUsers,
              userSummaries,
              userWeeklyActivity,
              weeklyTimeline,
              activeDaysLast30: {
                uniqueUsers: Object.fromEntries(activeDayKeys.map(key => {
                  const set = last30UserSets.get(key);
                  return [key, set instanceof Set ? set.size : 0];
                })),
                promptTotals: Object.fromEntries(activeDayKeys.map(key => {
                  const total = last30PromptTotals[key] || 0;
                  return [key, total];
                })),
                rangeLabel: last30Cutoff && state.latestDate ? formatRangeLabel(last30Cutoff, state.latestDate) : null
              },
              categoryTotals,
              monthlyUsageIntensity,
              monthlyEnabledUsers,
              frequentUsageTotals,
              frequentUsageWindowLabel,
              adoption,
              windowLabel: formatRangeLabel(periodEarliest, periodLatest),
              latestWeek,
              previousWeek
            };
          }
      
          function buildTrendDatasets(periods, metric, detailMode = "respect") {
            if (!Array.isArray(periods) || !periods.length) {
              return chartSeriesDefinitions
                .filter(def => !def.togglable || def.id === "total")
                .map(def => ({
                  label: typeof def.label === "function" ? def.label(metric) : def.label,
                  data: [],
                  borderColor: def.borderColor,
                  backgroundColor: def.backgroundColor,
                  borderWidth: def.borderWidth ?? 2,
                  fill: def.fill ?? false,
                  tension: def.tension ?? 0.26,
                  pointRadius: def.pointRadius ?? 3,
                  pointHoverRadius: def.pointHoverRadius ?? 5,
                  pointBackgroundColor: def.pointBackgroundColor ?? "#ffffff",
                  pointBorderColor: def.pointBorderColor ?? def.borderColor,
                  pointBorderWidth: def.pointBorderWidth ?? 2,
                  borderDash: def.borderDash,
                  __copilotDefinitionId: def.id,
                  __copilotIsDetailSeries: Boolean(def.togglable)
                }));
            }
            const normalizedDetailMode = detailMode || "respect";
            const activeSelection = getActiveCategorySelection();
            return chartSeriesDefinitions
              .filter(def => {
                if (def.metrics && !def.metrics.includes(metric)) {
                  return false;
                }
                if (state.trendView === "average" && def.supportsAverage === false) {
                  return false;
                }
                if (def.id === "total") {
                  return true;
                }
                if (!def.togglable) {
                  return true;
                }
                if (metric === "hours" || metric === "adoption") {
                  return false;
                }
                if (normalizedDetailMode === "none") {
                  return false;
                }
                if (normalizedDetailMode === "all") {
                  return true;
                }
                if (state.seriesVisibility[def.id] === false) {
                  return false;
                }
                return activeSelection.has(def.id);
              })
              .map(def => {
                const values = periods.map(period => adjustTrendValueForView(def.getValue(period), period, def));
                let label = typeof def.label === "function" ? def.label(metric) : def.label;
                if (state.trendView === "average" && def.supportsAverage !== false) {
                  if (def.id === "total") {
                    label = metric === "hours" ? "Avg hours per user" : "Avg actions per user";
                  } else {
                    label = `${label} (avg)`;
                  }
                }
                const dataset = {
                  label,
                  data: values,
                  borderColor: def.borderColor,
                  backgroundColor: def.backgroundColor,
                  borderWidth: def.borderWidth ?? 2,
                  fill: def.fill ?? false,
                  tension: def.tension ?? 0.26,
                  pointRadius: def.pointRadius ?? 3,
                  pointHoverRadius: def.pointHoverRadius ?? 5,
                  pointBackgroundColor: def.pointBackgroundColor ?? "#ffffff",
                  pointBorderColor: def.pointBorderColor ?? def.borderColor,
                  pointBorderWidth: def.pointBorderWidth ?? 2,
                  borderDash: def.borderDash,
                  __copilotDefinitionId: def.id,
                  __copilotIsDetailSeries: Boolean(def.togglable)
                };
                return applyTrendColorToDataset(dataset, def.id);
              });
          }
      
          function updateTrendChart(periods) {
            const chart = state.charts.trend;
            if (!chart) {
              return;
            }
            if (!periods.length) {
              dom.trendEmpty.hidden = false;
              chart.data.labels = [];
              chart.data.datasets = [];
              chart.update("none");
              return;
            }
            dom.trendEmpty.hidden = true;
            chart.data.labels = periods.map(item => item.label);

            const metric = state.filters.metric;
            chart.data.datasets = buildTrendDatasets(periods, metric, state.seriesDetailMode);
            const yScale = chart.options?.scales?.y;
            if (yScale && yScale.ticks) {
              yScale.ticks.callback = value => formatTrendAxisTick(value);
            }
            chart.update("none");
          }

          function updateTrendCaptionText() {
            if (!dom.trendCaption) {
              return;
            }
            const isAverageView = state.trendView === "average";
            const isHoursMetric = state.filters.metric === "hours";
            const isAdoptionMetric = state.filters.metric === "adoption";
            if (isAdoptionMetric) {
              dom.trendCaption.textContent = `Active users (% of enabled) aggregated ${state.filters.aggregate}.`;
              return;
            }
            const metricLabel = isHoursMetric
              ? (isAverageView ? "Copilot assisted hours per active user" : "Copilot assisted hours")
              : (isAverageView ? "Copilot actions per active user" : "Copilot actions");
            dom.trendCaption.textContent = `${metricLabel} aggregated ${state.filters.aggregate}.`;
          }
      
          function initializeSeriesToggles() {
            if (!dom.seriesToggleGroup) {
              return;
            }
            dom.seriesToggleGroup.innerHTML = "";
            seriesToggleButtons.clear();
            chartSeriesDefinitions.forEach(def => {
              if (!def.togglable) {
                return;
              }
              const button = document.createElement("button");
              button.type = "button";
              button.className = "series-toggle";
              const label = typeof def.label === "function" ? def.label("actions") : def.label;
              const isVisible = state.seriesVisibility[def.id] !== false;
              button.textContent = label;
              button.classList.toggle("is-active", isVisible);
              button.setAttribute("aria-pressed", String(isVisible));
              button.addEventListener("click", () => {
                const currentSelection = cloneActiveCategorySelection();
                const currentlyVisible = currentSelection.has(def.id);
                const nextVisible = !currentlyVisible;
                if (!nextVisible && currentSelection.size <= 1) {
                  return;
                }
                if (nextVisible) {
                  currentSelection.add(def.id);
                } else {
                  currentSelection.delete(def.id);
                }
                state.filters.categorySelection = currentSelection;
                state.seriesVisibility[def.id] = nextVisible;
                button.classList.toggle("is-active", nextVisible);
                button.setAttribute("aria-pressed", String(nextVisible));
                renderDashboard();
              });
              dom.seriesToggleGroup.append(button);
              seriesToggleButtons.set(def.id, button);
            });
          }
      
          function updateExportDetailOption() {
            if (!dom.exportIncludeDetailsWrapper || !dom.exportIncludeDetails) {
              return;
            }
            const hasDetailDefinitions = chartSeriesDefinitions.some(def => def.togglable);
            const metricSupportsDetails = state.filters.metric === "actions";
            const hasTrendData = Array.isArray(state.latestTrendPeriods) && state.latestTrendPeriods.length > 0;
            const detailModeAllows = state.seriesDetailMode !== "none";
            const shouldShow = hasDetailDefinitions && metricSupportsDetails && hasTrendData && detailModeAllows;
            dom.exportIncludeDetailsWrapper.hidden = !shouldShow;
            if (!shouldShow) {
              dom.exportIncludeDetails.disabled = true;
              dom.exportIncludeDetails.checked = false;
              return;
            }
            dom.exportIncludeDetails.disabled = false;
            const include = state.exportPreferences.includeDetails !== false;
            dom.exportIncludeDetails.checked = include;
          }
      
          function updateSeriesToggleState() {
            const metricIsHours = state.filters.metric === "hours";
            if (dom.seriesHint) {
              const hintShouldShow = metricIsHours || state.filters.metric === "adoption";
              dom.seriesHint.hidden = !hintShouldShow;
            }
            const selection = getActiveCategorySelection();
            seriesToggleButtons.forEach((button, id) => {
              const visible = selection.has(id);
              state.seriesVisibility[id] = visible;
              button.classList.toggle("is-active", visible);
              button.setAttribute("aria-pressed", String(visible));
              const disabled = state.filters.metric !== "actions";
              button.disabled = disabled;
              button.classList.toggle("is-disabled", disabled);
            });
          }
      
          function updateSeriesDetailModeButton() {
            if (!dom.seriesModeToggle) {
              return;
            }
            const isHidden = state.seriesDetailMode === "none";
            const disabled = !state.rows.length || state.filters.metric === "hours" || state.filters.metric === "adoption";
            dom.seriesModeToggle.setAttribute("aria-pressed", String(isHidden));
            dom.seriesModeToggle.textContent = isHidden ? "Show capability lines" : "Hide capability lines";
            dom.seriesModeToggle.disabled = disabled;
            dom.seriesModeToggle.classList.toggle("is-disabled", disabled);
          }
      
          function updateGroupTable(groups, totalMetricValue) {
            if (!dom.groupBody || !dom.groupCaption || !dom.viewMoreButton) {
              return;
            }
            dom.groupBody.innerHTML = "";
            if (!groups.length) {
              dom.groupCaption.textContent = "No group data available for the current filters.";
              dom.viewMoreButton.hidden = true;
              dom.viewMoreButton.setAttribute("aria-expanded", "false");
              state.groupsExpanded = false;
              return;
            }
            const maxRows = MAX_VISIBLE_GROUP_ROWS;
            const metricLabel = state.filters.metric === "hours" ? "assisted hours" : "actions";
            dom.groupCaption.textContent = `Top ${Math.min(groups.length, maxRows)} groups/offices by ${metricLabel}.`;
            const metricKey = state.filters.metric === "hours" ? "assistedHours" : "totalActions";
            const expanded = state.groupsExpanded === true;
            groups.forEach((group, index) => {
              const share = totalMetricValue ? group[metricKey] / totalMetricValue : 0;
              const row = document.createElement("tr");
              const shouldHide = !expanded && index >= maxRows;
              if (shouldHide) {
                row.dataset.hiddenRow = "true";
                row.hidden = true;
              }
              const nameCell = document.createElement("td");
              nameCell.textContent = group.name || "Unspecified";
      
              const usersCell = document.createElement("td");
              usersCell.classList.add("users-cell");
              usersCell.textContent = numberFormatter.format(Math.round(group.users || 0));
      
              const valueCell = document.createElement("td");
              valueCell.classList.add("value-cell");
              valueCell.textContent = state.filters.metric === "hours"
                ? `${hoursFormatter.format(group.assistedHours)} hrs`
                : numberFormatter.format(Math.round(group.totalActions));
      
              const avgCell = document.createElement("td");
              avgCell.classList.add("avg-cell");
              avgCell.textContent = numberFormatter.format(Math.round(group.averageActionsPerUser || 0));
      
              const shareCell = document.createElement("td");
              shareCell.classList.add("share-cell");
              shareCell.textContent = share ? `${(share * 100).toFixed(1)}%` : "0%";
      
              const momentumCell = document.createElement("td");
              const bar = document.createElement("div");
              bar.className = "group-bar";
              const fill = document.createElement("span");
              fill.style.transform = `scaleX(${Math.min(1, share * 1.5)})`;
              bar.append(fill);
              momentumCell.append(bar);
      
              row.append(nameCell, usersCell, valueCell, avgCell, shareCell, momentumCell);
              dom.groupBody.append(row);
            });
            const hasOverflow = groups.length > maxRows;
            if (!hasOverflow) {
              state.groupsExpanded = false;
            }
            dom.viewMoreButton.hidden = !hasOverflow;
            dom.viewMoreButton.setAttribute("aria-expanded", String(state.groupsExpanded === true));
            if (hasOverflow) {
              const remainingCount = Math.max(0, groups.length - maxRows);
              const groupLabel = remainingCount === 1 ? "group/office" : "groups/offices";
              dom.viewMoreButton.textContent = state.groupsExpanded
                ? `Show top ${maxRows} groups/offices`
                : `Show remaining ${remainingCount} ${groupLabel}`;
            }
          }
      
          function updateCategoryCards(categoryTotals) {
            Object.entries(categoryConfig).forEach(([key, config]) => {
              const card = document.querySelector(`[data-category="${key}"]`);
              if (!card) {
                return;
              }
              const statsContainer = card.querySelector(`[data-category-stats="${key}"]`);
              if (!statsContainer) {
                return;
              }
              statsContainer.innerHTML = "";
              const totals = categoryTotals ? categoryTotals[key] : null;
              const labels = categoryMetricLabels[key] || {};
              if (!totals) {
                const placeholder = document.createElement("p");
                placeholder.className = "category-card__placeholder muted";
                placeholder.textContent = "Upload data to view insights.";
                statsContainer.append(placeholder);
                card.classList.add("is-empty");
                return;
              }
              const metrics = [];
              const aggregateValue = getCategoryTotalValue(totals);
              metrics.push({
                field: `${key}-total`,
                label: `${categoryLabels[key] || key} actions`,
                value: aggregateValue
              });
              const primaryValue = Number.isFinite(totals.primary) ? totals.primary : 0;
              metrics.push({
                field: config.primary,
                label: labels[config.primary] || labels.primary || getMetricDisplayLabel(config.primary),
                value: primaryValue
              });
              (config.secondary || []).forEach((field, index) => {
                const value = Array.isArray(totals.secondary) ? totals.secondary[index] || 0 : 0;
                metrics.push({
                  field,
                  label: labels[field] || getMetricDisplayLabel(field),
                  value
                });
              });
              metrics.sort((a, b) => (b.value || 0) - (a.value || 0));
              if (!metrics.length) {
                const placeholder = document.createElement("p");
                placeholder.className = "category-card__placeholder muted";
                placeholder.textContent = "No data available for this capability.";
                statsContainer.append(placeholder);
                card.classList.add("is-empty");
                return;
              }
              metrics.forEach((metric, index) => {
                const stat = document.createElement("div");
                stat.className = "category-card__stat";
                if (index === 0) {
                  stat.classList.add("is-emphasized");
                }
                const valueElement = document.createElement("div");
                valueElement.className = "category-card__value";
                valueElement.textContent = metric.value ? numberFormatter.format(Math.round(metric.value)) : "0";
                const labelElement = document.createElement("div");
                labelElement.className = "category-card__label";
                labelElement.textContent = metric.label || metric.field;
                stat.append(valueElement, labelElement);
                statsContainer.append(stat);
              });
              const hasPositive = metrics.some(metric => metric.value > 0);
              card.classList.toggle("is-empty", !hasPositive);
            });
          };
      
          function buildTopUsersList(users) {
            const container = dom.topUsers;
            if (!container) {
              return;
            }
            container.innerHTML = "";
            const toggleButton = dom.topUsersToggle;
            if (!users || !users.length) {
              const empty = document.createElement("p");
              empty.className = "muted";
              empty.textContent = "No user activity for the selected filters.";
              container.append(empty);
              state.topUsersExpanded = false;
              updateTopUsersPanelAvailability(false);
              if (toggleButton) {
                toggleButton.hidden = true;
                toggleButton.setAttribute("aria-expanded", "false");
                const controlsWrapper = toggleButton.parentElement;
                if (controlsWrapper && controlsWrapper.classList.contains("adoption-controls")) {
                  controlsWrapper.hidden = true;
                }
              }
              return;
            }
            const cappedUsers = users.slice(0, 20);
            const hasOverflow = cappedUsers.length > MAX_VISIBLE_TOP_USERS;
            if (!hasOverflow) {
              state.topUsersExpanded = false;
            }
            const expanded = state.topUsersExpanded === true;
            const visibleUsers = expanded ? cappedUsers : cappedUsers.slice(0, MAX_VISIBLE_TOP_USERS);
            const list = document.createElement("ol");
            list.className = "top-users-list";
            visibleUsers.forEach(entry => {
              const item = document.createElement("li");
              item.className = "top-users-list__item";
              const name = document.createElement("span");
              name.className = "top-users-list__name";
              name.textContent = entry.name || "Unspecified";
              const value = document.createElement("span");
              value.className = "top-users-list__value";
              const info = document.createElement("div");
              info.className = "top-users-list__info";
              info.append(name);
              const organization = document.createElement("span");
              organization.className = "top-users-list__org";
              organization.textContent = entry.organization || "Unspecified";
              info.append(organization);
              // Keep these template literals; removing the backticks caused syntax errors that blocked uploads.
              if (state.filters.metric === "hours") {
                value.textContent = `${hoursFormatter.format(entry.assistedHours || 0)} hrs`;
              } else {
                value.textContent = `${numberFormatter.format(Math.round(entry.totalActions || 0))} actions`;
              }
              item.append(info, value);
              list.append(item);
            });
            container.append(list);
            if (toggleButton) {
              if (hasOverflow) {
                const remaining = Math.max(0, cappedUsers.length - MAX_VISIBLE_TOP_USERS);
                const userLabel = remaining === 1 ? "user" : "users";
                toggleButton.hidden = false;
                toggleButton.textContent = expanded
                  ? `Show top ${MAX_VISIBLE_TOP_USERS} users`
                  : `Show remaining ${remaining} ${userLabel}`;
                toggleButton.setAttribute("aria-expanded", String(expanded));
              } else {
                toggleButton.hidden = true;
                toggleButton.setAttribute("aria-expanded", "false");
              }
            }
            updateTopUsersPanelAvailability(true);
          }

          function updateTopUsersPanelAvailability(canShow) {
            if (!dom.topUsersPanel || !dom.topUsersPanelToggle) {
              return;
            }
            if (!canShow) {
              state.topUsersPanelOpen = false;
            }
            const visible = canShow && state.topUsersPanelOpen;
            dom.topUsersPanel.hidden = !visible;
            dom.topUsersPanelToggle.disabled = !canShow;
            dom.topUsersPanelToggle.setAttribute("aria-expanded", String(visible));
            dom.topUsersPanelToggle.textContent = visible ? "Hide top users" : "Show top users";
          }
      
          function updateAdoptionByApp(adoption) {
            const table = dom.adoptionTable;
            const body = dom.adoptionBody;
            const empty = dom.adoptionEmpty;
            const caption = dom.adoptionCaption;
            const totalElement = dom.adoptionTotal;
            const toggleButton = dom.adoptionToggle;
            if (!table || !body) {
              return;
            }
            body.innerHTML = "";
            const totalActiveUsers = adoption && Number.isFinite(adoption.totalActiveUsers) ? adoption.totalActiveUsers : 0;
            const hasApps = adoption && Array.isArray(adoption.apps) && adoption.apps.length > 0;
            setButtonEnabled(dom.adoptionExportCsv, hasApps);
            if (!hasApps) {
              table.hidden = true;
              if (empty) {
                empty.hidden = false;
                empty.textContent = adoption && adoption.totalActiveUsers
                  ? "No app adoption detected for the selected filters."
                  : "Load data to view adoption by app.";
              }
              if (caption) {
                caption.textContent = "Upload data to see which apps drive Copilot usage.";
              }
              if (totalElement) {
                totalElement.textContent = "-";
              }
              if (toggleButton) {
                toggleButton.hidden = true;
                toggleButton.setAttribute("aria-expanded", "false");
              }
              return;
            }
      
            table.hidden = false;
            if (empty) {
              empty.hidden = true;
            }
            if (caption) {
              caption.textContent = `Based on ${numberFormatter.format(totalActiveUsers)} active users for the selected filters.`;
            }
            if (totalElement) {
              totalElement.textContent = numberFormatter.format(totalActiveUsers);
            }
      
            const fragment = document.createDocumentFragment();
            let hasFeatureRows = false;
            const showDetails = state.adoptionShowDetails === true;
            adoption.apps.forEach(app => {
              const accentColor = sanitizeHexColor(app.color) || DEFAULT_ADOPTION_COLOR;
              const appRow = document.createElement("tr");
              appRow.className = "is-app";
              appRow.dataset.appKey = app.key || "";
              appRow.style.setProperty("--adoption-accent", accentColor);
              const nameCell = document.createElement("td");
              nameCell.textContent = app.label || app.key || "Unnamed app";
              const usersCell = document.createElement("td");
              usersCell.className = "is-numeric";
              usersCell.textContent = numberFormatter.format(app.users || 0);
              const shareCell = document.createElement("td");
              shareCell.className = "is-numeric";
              const appShare = Number.isFinite(app.share) ? app.share : 0;
              shareCell.textContent = `${Math.max(0, Math.min(100, appShare)).toFixed(1)}%`;
              appRow.append(nameCell, usersCell, shareCell);
              fragment.append(appRow);
      
              if (Array.isArray(app.features) && app.features.length) {
                hasFeatureRows = true;
                app.features.forEach(feature => {
                  const featureRow = document.createElement("tr");
                  featureRow.className = "is-feature";
                  featureRow.dataset.appKey = app.key || "";
                  featureRow.style.setProperty("--adoption-accent", accentColor);
                  featureRow.hidden = !showDetails;
                  const featureNameCell = document.createElement("td");
                  const featureLabel = document.createElement("span");
                  featureLabel.className = "adoption-label";
                  const bullet = document.createElement("span");
                  bullet.className = "adoption-bullet";
                  bullet.style.setProperty("background-color", accentColor);
                  const featureText = document.createElement("span");
                  featureText.textContent = feature.label || feature.key || "Capability";
                  featureLabel.append(bullet, featureText);
                  featureNameCell.append(featureLabel);
      
                  const featureUsersCell = document.createElement("td");
                  featureUsersCell.className = "is-numeric";
                  featureUsersCell.textContent = numberFormatter.format(Math.round(feature.users || 0));
      
                  const featureShareCell = document.createElement("td");
                  featureShareCell.className = "is-numeric";
                  const featureShare = Number.isFinite(feature.share) ? feature.share : 0;
                  featureShareCell.textContent = `${Math.max(0, Math.min(100, featureShare)).toFixed(1)}%`;
      
                  featureRow.append(featureNameCell, featureUsersCell, featureShareCell);
                  fragment.append(featureRow);
                });
              }
            });
      
            body.append(fragment);
            if (toggleButton) {
              if (hasFeatureRows) {
                toggleButton.hidden = false;
                toggleButton.textContent = showDetails ? "Hide app capabilities" : "Show app capabilities";
                toggleButton.setAttribute("aria-expanded", String(showDetails));
              } else {
                toggleButton.hidden = true;
                toggleButton.setAttribute("aria-expanded", "false");
              }
              const controlsWrapper = toggleButton.parentElement;
              if (controlsWrapper && controlsWrapper.classList.contains("adoption-controls")) {
                controlsWrapper.hidden = toggleButton.hidden;
              }
            }
          }
      
          function updateUsageIntensity(aggregates) {
            const controls = dom.usageMonthControls;
            const grid = dom.usageMonthGrid;
            const emptyState = dom.usageEmpty;
            const caption = dom.usageCaption;
            const windowChip = dom.usageWindow;
      
            if (!dom.usageCard || !controls || !grid) {
              updateUsageTrendChart(null);
              return;
            }
      
            destroyUsageCharts();
            controls.innerHTML = "";
            grid.innerHTML = "";
      
            const monthlyData = Array.isArray(aggregates?.monthlyUsageIntensity) ? aggregates.monthlyUsageIntensity : [];
            const monthKeys = monthlyData.map(entry => entry.key);
            const monthMap = new Map(monthlyData.map(entry => [entry.key, entry]));
      
            if (!monthlyData.length) {
              if (caption) {
                caption.textContent = aggregates
                  ? "No usage intensity data for the current filters."
                  : "Upload data to break down active users.";
              }
              if (windowChip) {
                windowChip.textContent = "-";
              }
              if (emptyState) {
                emptyState.hidden = false;
                emptyState.textContent = aggregates
                  ? "No monthly usage intensity data available."
                  : "Upload data to break down active users by month.";
              }
              state.usageMonthSelection = [];
              state.latestUsageMonths = [];
              updateUsageTrendChart(null);
              updateUsageTrendToggleState();
              updateUsageIntensityExportAvailability();
              return;
            }
      
            if (!Array.isArray(state.usageMonthSelection)) {
              state.usageMonthSelection = [];
            }
            let selection = state.usageMonthSelection.filter(key => monthKeys.includes(key));
            if (!selection.length) {
              selection = monthKeys.slice();
            }
            state.usageMonthSelection = selection;
      
            if (emptyState) {
              emptyState.hidden = true;
            }
      
            buildMonthControls();
            updateControlsActiveState();
            updateCaption();
            renderCards();
            applyChartThemeStyles();
            state.latestUsageMonths = monthlyData.slice();
            updateUsageTrendToggleState();
            updateUsageTrendChart(state.latestUsageMonths);
            updateUsageIntensityExportAvailability();
      
            function buildMonthControls() {
              if (!controls) {
                return;
              }
              const selectAllButton = document.createElement("button");
              selectAllButton.type = "button";
              selectAllButton.className = "usage-month-utility";
              selectAllButton.textContent = "Select all";
              selectAllButton.addEventListener("click", () => {
                setSelection(monthKeys.slice());
              });
              controls.append(selectAllButton);
      
              const clearButton = document.createElement("button");
              clearButton.type = "button";
              clearButton.className = "usage-month-utility";
              clearButton.textContent = "Clear";
              clearButton.addEventListener("click", () => {
                setSelection([]);
              });
              controls.append(clearButton);
      
              monthlyData.forEach(entry => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "usage-month-toggle";
                button.dataset.month = entry.key;
                button.textContent = entry.label;
                button.addEventListener("click", () => {
                  const current = new Set(state.usageMonthSelection);
                  if (current.has(entry.key)) {
                    current.delete(entry.key);
                  } else {
                    current.add(entry.key);
                  }
                  setSelection(Array.from(current));
                });
                controls.append(button);
              });
            }
      
            function setSelection(newSelection) {
              const ordered = monthKeys.filter(key => newSelection.includes(key));
              state.usageMonthSelection = ordered;
              updateControlsActiveState();
              updateCaption();
              renderCards();
              applyChartThemeStyles();
              updateUsageTrendToggleState();
              updateUsageTrendChart(state.latestUsageMonths);
              updateUsageIntensityExportAvailability();
            }
      
            function updateControlsActiveState() {
              if (!controls) {
                return;
              }
              controls.querySelectorAll(".usage-month-toggle").forEach(button => {
                const key = button.dataset.month;
                const isActive = state.usageMonthSelection.includes(key);
                button.classList.toggle("is-active", isActive);
              });
            }
      
            function updateCaption() {
              if (caption) {
                if (!state.usageMonthSelection.length) {
                  caption.textContent = "Select months to compare Copilot usage intensity.";
                } else {
                  caption.textContent = `Comparing ${state.usageMonthSelection.length} month${state.usageMonthSelection.length === 1 ? "" : "s"} of Copilot activity.`;
                }
              }
              if (windowChip) {
                if (!state.usageMonthSelection.length) {
                  windowChip.textContent = "-";
                  return;
                }
                if (state.usageMonthSelection.length === 1) {
                  const selected = monthMap.get(state.usageMonthSelection[0]);
                  windowChip.textContent = selected?.monthRangeLabel || selected?.label || "-";
                  return;
                }
                const firstKey = state.usageMonthSelection[0];
                const lastKey = state.usageMonthSelection[state.usageMonthSelection.length - 1];
                const first = monthMap.get(firstKey);
                const last = monthMap.get(lastKey);
                if (first && last) {
                  windowChip.textContent = `${first.label} → ${last.label}`;
                } else {
                  windowChip.textContent = "-";
                }
              }
            }
      
            function renderCards() {
              destroyUsageCharts();
              if (grid) {
                grid.innerHTML = "";
              }
              if (!state.usageMonthSelection.length) {
                if (emptyState) {
                  emptyState.hidden = false;
                  emptyState.textContent = "Select months above to view usage intensity.";
                }
                return;
              }
              if (emptyState) {
                emptyState.hidden = true;
              }
              state.usageMonthSelection.forEach(key => {
                const monthEntry = monthMap.get(key);
                if (!monthEntry) {
                  return;
                }
                const card = document.createElement("article");
                card.className = "usage-month-card";
      
                const header = document.createElement("div");
                header.className = "usage-month-card__header";
                const title = document.createElement("h3");
                title.textContent = monthEntry.label;
                header.append(title);
                const summary = document.createElement("p");
                summary.textContent = monthEntry.totalUsers
                  ? `Based on ${numberFormatter.format(monthEntry.totalUsers)} users with Copilot actions.`
                  : "No Copilot actions recorded this month.";
                header.append(summary);
                if (monthEntry.monthRangeLabel) {
                  const range = document.createElement("span");
                  range.textContent = monthEntry.monthRangeLabel;
                  header.append(range);
                }
                card.append(header);
      
                const chartsWrapper = document.createElement("div");
                chartsWrapper.className = "usage-month-card__charts";
      
                const frequencyPanel = document.createElement("div");
                frequencyPanel.className = "usage-month-card__panel";
                const frequencyHeading = document.createElement("h4");
                frequencyHeading.textContent = "Frequent usage";
                frequencyPanel.append(frequencyHeading);
                const frequencyCanvas = document.createElement("canvas");
                frequencyCanvas.height = 260;
                frequencyPanel.append(frequencyCanvas);
                const frequencyNote = document.createElement("p");
                frequencyNote.className = "usage-month-card__note";
                if (monthEntry.totalUsers) {
                  const defaultHighLabel = formatUsageBucketLabel(getUsageThresholdStarts().high, Number.POSITIVE_INFINITY);
                  const highLabel = monthEntry.highBucketLabel || defaultHighLabel;
                  frequencyNote.textContent = `${numberFormatter.format(monthEntry.powerUsers)} users (${monthEntry.powerShare.toFixed(1)}%) performed ${highLabel}.`;
                } else {
                  frequencyNote.textContent = "No Copilot actions recorded.";
                }
                frequencyPanel.append(frequencyNote);
                chartsWrapper.append(frequencyPanel);
      
                const frequencyChart = createUsageFrequencyChart(frequencyCanvas.getContext("2d"), monthEntry.frequencyBuckets, monthEntry.totalUsers);
                if (frequencyChart) {
                  state.charts.usageFrequency.set(key, frequencyChart);
                }
      
                const consistencyPanel = document.createElement("div");
                consistencyPanel.className = "usage-month-card__panel";
                const consistencyHeading = document.createElement("h4");
                consistencyHeading.textContent = "Consistent usage";
                consistencyPanel.append(consistencyHeading);
                const consistencyCanvas = document.createElement("canvas");
                consistencyCanvas.height = 260;
                consistencyPanel.append(consistencyCanvas);
                const consistencyNote = document.createElement("p");
                consistencyNote.className = "usage-month-card__note";
                if (!monthEntry.observedWeekCount) {
                  consistencyNote.textContent = "Not enough weekly data to measure consistency.";
                } else if (!monthEntry.weeklyActiveUsers) {
                  consistencyNote.textContent = "No Copilot users active in the weeks for this month.";
                } else {
                  consistencyNote.textContent = `${numberFormatter.format(monthEntry.consistentUsers)} users (${monthEntry.consistentShare.toFixed(1)}%) were active in every observed week (${monthEntry.observedWeekCount}).`;
                }
                consistencyPanel.append(consistencyNote);
                chartsWrapper.append(consistencyPanel);
      
                const consistencyChart = createUsageConsistencyChart(consistencyCanvas.getContext("2d"), monthEntry.observedWeekCount, monthEntry.consistencyBuckets, monthEntry.totalUsers);
                if (consistencyChart) {
                  state.charts.usageConsistency.set(key, consistencyChart);
                }
      
                card.append(chartsWrapper);
                grid.append(card);
              });
            }
          }
      
          function updateActiveDaysToggleState() {
            if (!dom.activeDaysToggleButtons || !dom.activeDaysToggleButtons.length) {
              return;
            }
            const view = state.activeDaysView === "prompts" ? "prompts" : "users";
            dom.activeDaysToggleButtons.forEach(button => {
              const buttonView = button.dataset.activeDaysView === "prompts" ? "prompts" : "users";
              const isActive = view === buttonView;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
            });
          }
      
          function updateReturningIntervalToggleState() {
            if (!dom.returningIntervalButtons || !dom.returningIntervalButtons.length) {
              return;
            }
            const interval = state.returningInterval || DEFAULT_RETURNING_INTERVAL;
            dom.returningIntervalButtons.forEach(button => {
              const value = button.dataset.returningInterval === "monthly" ? "monthly" : "weekly";
              const isActive = interval === value;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
            });
          }
      
          function updateReturningMetricToggleState() {
            if (!dom.returningMetricButtons || !dom.returningMetricButtons.length) {
              return;
            }
            dom.returningMetricButtons.forEach(button => {
              const metric = button.dataset.returningMetricButton === "percentage" ? "percentage" : "total";
              const isActive = state.returningMetric === metric;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
            });
          }

          if (dom.returningExportPng) {
            dom.returningExportPng.addEventListener("click", exportReturningUsersImage);
          }
          if (dom.returningExportCsv) {
            dom.returningExportCsv.addEventListener("click", exportReturningUsersCsv);
          }
          if (dom.usageTrendExportPng) {
            dom.usageTrendExportPng.addEventListener("click", exportUsageTrendImage);
          }
          if (dom.usageTrendExportCsv) {
            dom.usageTrendExportCsv.addEventListener("click", exportUsageTrendCsv);
          }
          if (dom.usageIntensityExportCsv) {
            dom.usageIntensityExportCsv.addEventListener("click", exportUsageIntensityCsv);
          }
          if (dom.adoptionExportCsv) {
            dom.adoptionExportCsv.addEventListener("click", exportAdoptionCsv);
          }

          function updateTrendViewToggleState() {
            if (!dom.trendViewButtons || !dom.trendViewButtons.length) {
              return;
            }
            const isAdoptionMetric = state.filters.metric === "adoption";
            const activeView = isAdoptionMetric ? "total" : (state.trendView === "average" ? "average" : "total");
            dom.trendViewButtons.forEach(button => {
              const buttonView = button.dataset.trendView === "average" ? "average" : "total";
              const isActive = buttonView === activeView;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
              if (isAdoptionMetric) {
                button.classList.add("is-disabled");
                button.disabled = true;
              } else {
                button.classList.remove("is-disabled");
                button.disabled = false;
              }
            });
          }

          function updateUsageTrendToggleState() {
            if (!dom.usageTrendToggleButtons || !dom.usageTrendToggleButtons.length) {
              return;
            }
            dom.usageTrendToggleButtons.forEach(button => {
              const mode = button.dataset.usageTrendMode === "percentage" ? "percentage" : "number";
              button.classList.toggle("is-active", mode === (state.usageTrendMode || "number"));
            });
          }
      
          function updateUsageTrendChart(monthlyData) {
            const chart = state.charts.usageTrend;
            if (!dom.usageTrendCard || !chart) {
              return;
            }
            const allData = Array.isArray(monthlyData) ? monthlyData : [];
            const activeKeys = (state.usageMonthSelection && state.usageMonthSelection.length)
              ? state.usageMonthSelection
              : allData.map(entry => entry.key);
            const data = allData.filter(entry => activeKeys.includes(entry.key));
            const hasData = data.length > 0;
            state.latestUsageTrendRows = hasData
              ? data.map(entry => ({
                  key: entry.key,
                  label: entry.label || entry.key || "",
                  frequentUsers: Number.isFinite(entry.powerUsers) ? entry.powerUsers : 0,
                  frequentShare: Number.isFinite(entry.powerShare) ? entry.powerShare : null,
                  consistentUsers: Number.isFinite(entry.consistentUsers) ? entry.consistentUsers : 0,
                  consistentShare: Number.isFinite(entry.consistentShare) ? entry.consistentShare : null,
                  totalUsers: Number.isFinite(entry.totalUsers) ? entry.totalUsers : 0
                }))
              : [];
            setButtonEnabled(dom.usageTrendExportPng, hasData);
            setButtonEnabled(dom.usageTrendExportCsv, hasData);
            if (dom.usageTrendCaption) {
              dom.usageTrendCaption.textContent = hasData
                ? "Four-week rolling view of frequent and consistent usage."
                : "Upload data to compare frequent and consistent usage.";
            }
            if (dom.usageTrendEmpty) {
              dom.usageTrendEmpty.hidden = hasData;
              if (!hasData) {
                dom.usageTrendEmpty.textContent = "Upload data to visualize usage intensity trend.";
              }
            }
            if (!hasData) {
              chart.data.labels = [];
              chart.data.datasets.forEach(dataset => {
                dataset.data = [];
              });
              chart.update("none");
              return;
            }
            const mode = state.usageTrendMode || "number";
            const labels = data.map(entry => entry.label);
            const frequentValues = data.map(entry => mode === "percentage"
              ? (Number.isFinite(entry.powerShare) ? entry.powerShare : 0)
              : (Number.isFinite(entry.powerUsers) ? entry.powerUsers : 0));
            const consistentValues = data.map(entry => mode === "percentage"
              ? (Number.isFinite(entry.consistentShare) ? entry.consistentShare : 0)
              : (Number.isFinite(entry.consistentUsers) ? entry.consistentUsers : 0));
            chart.data.labels = labels;
            if (chart.data.datasets[0]) {
              chart.data.datasets[0].data = frequentValues;
            }
            if (chart.data.datasets[1]) {
              chart.data.datasets[1].data = consistentValues;
            }
            const yScale = chart.options?.scales?.y;
            if (yScale) {
              if (mode === "percentage") {
                yScale.ticks.callback = value => `${Number(value).toFixed(0)}%`;
                yScale.max = 100;
                yScale.suggestedMax = 100;
              } else {
                yScale.ticks.callback = value => numberFormatter.format(value);
                delete yScale.max;
                delete yScale.suggestedMax;
              }
            }
            chart.update("none");
          }
      
          function updateEnabledLicensesChart(monthlyData) {
            const chart = state.charts.enabledLicenses;
            if (!dom.enabledLicensesCard || !chart) {
              return;
            }
            clearEnabledLicensesGradientCache();
            const rows = Array.isArray(monthlyData) ? monthlyData : [];
            const hasData = rows.length > 0;
            if (dom.enabledLicensesCaption) {
              dom.enabledLicensesCaption.textContent = hasData
                ? "Unique Copilot-enabled users captured each month."
                : "Upload data to visualize licensed users by month.";
            }
            if (dom.enabledLicensesEmpty) {
              dom.enabledLicensesEmpty.hidden = hasData;
              if (!hasData) {
                dom.enabledLicensesEmpty.textContent = "Upload data to visualize license coverage.";
              }
            }
            if (!hasData) {
              const yScale = chart.options && chart.options.scales ? chart.options.scales.y : null;
              if (yScale) {
                delete yScale.suggestedMax;
              }
              chart.data.labels = [];
              if (chart.data.datasets[0]) {
                chart.data.datasets[0].data = [];
              }
              chart.update("none");
              return;
            }
            const values = rows.map(entry => {
              const value = Number(entry.count);
              return Number.isFinite(value) && value >= 0 ? value : 0;
            });
            chart.data.labels = rows.map(entry => entry.label || entry.key || "");
            if (chart.data.datasets[0]) {
              chart.data.datasets[0].data = values;
            }
            const yScale = chart.options && chart.options.scales ? chart.options.scales.y : null;
            if (yScale) {
              const maxValue = values.reduce((max, value) => Math.max(max, value || 0), 0);
              if (state.showEnabledLicenseLabels !== false && maxValue > 0) {
                yScale.suggestedMax = Math.ceil(maxValue * 1.1);
              } else {
                delete yScale.suggestedMax;
              }
            }
            chart.update("none");
          }
      
          function toggleEnabledLicensesExportMenu() {
            if (!dom.enabledLicensesExportMenu || !dom.enabledLicensesExportTrigger) {
              return;
            }
            const shouldOpen = dom.enabledLicensesExportMenu.hidden;
            closeEnabledLicensesExportMenu();
            if (shouldOpen) {
              dom.enabledLicensesExportMenu.hidden = false;
              dom.enabledLicensesExportTrigger.setAttribute("aria-expanded", "true");
            }
          }
      
          function closeEnabledLicensesExportMenu() {
            if (!dom.enabledLicensesExportMenu) {
              return;
            }
            if (dom.enabledLicensesExportMenu.hidden) {
              return;
            }
            dom.enabledLicensesExportMenu.hidden = true;
            if (dom.enabledLicensesExportTrigger) {
              dom.enabledLicensesExportTrigger.setAttribute("aria-expanded", "false");
            }
          }
      
          function exportEnabledLicensesChart({ backgroundColor = null, fileSuffix = "", includeValues = null } = {}) {
            const chart = state.charts.enabledLicenses;
            if (!chart || !chart.canvas) {
              return;
            }
            const sourceCanvas = chart.canvas;
            const width = sourceCanvas.width;
            const height = sourceCanvas.height;
            if (!width || !height) {
              return;
            }
            const currentShowValues = state.showEnabledLicenseLabels !== false;
            const targetShowValues = includeValues == null ? currentShowValues : includeValues;
            const shouldToggle = targetShowValues !== currentShowValues;
            if (shouldToggle) {
              state.showEnabledLicenseLabels = targetShowValues;
              updateEnabledLicensesChart(state.latestEnabledTimeline);
            }
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = width;
            exportCanvas.height = height;
            const context = exportCanvas.getContext("2d");
            if (!context) {
              return;
            }
            if (backgroundColor) {
              context.fillStyle = backgroundColor;
              context.fillRect(0, 0, width, height);
            }
            context.drawImage(sourceCanvas, 0, 0, width, height);
            const dataUrl = exportCanvas.toDataURL("image/png");
            const link = document.createElement("a");
            const suffix = fileSuffix ? `-${fileSuffix}` : "";
            link.download = `enabled-copilot-users${suffix}.png`;
            link.href = dataUrl;
            link.click();
            closeEnabledLicensesExportMenu();
            if (shouldToggle) {
              state.showEnabledLicenseLabels = currentShowValues;
              updateEnabledLicensesChart(state.latestEnabledTimeline);
            }
          }
      
          function destroyUsageCharts() {
            if (state.charts.usageFrequency instanceof Map) {
              state.charts.usageFrequency.forEach(chart => {
                if (chart && typeof chart.destroy === "function") {
                  chart.destroy();
                }
              });
              state.charts.usageFrequency.clear();
            }
            if (state.charts.usageConsistency instanceof Map) {
              state.charts.usageConsistency.forEach(chart => {
                if (chart && typeof chart.destroy === "function") {
                  chart.destroy();
                }
              });
              state.charts.usageConsistency.clear();
            }
          }
      
          function createUsageFrequencyChart(context, buckets, totalUsers) {
            if (!context) {
              return null;
            }
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            const colors = [
              getCssVariableValue("--green-200", "#99D099"),
              getCssVariableValue("--green-500", "#008A00"),
              getCssVariableValue("--green-700", "#005300")
            ];
            const labels = Array.isArray(buckets) ? buckets.map(bucket => bucket.label) : [];
            const data = Array.isArray(buckets) ? buckets.map(bucket => bucket.count || 0) : [];
            const backgroundColor = data.map((_, index) => colors[index] || colors[colors.length - 1]);
            const yMax = Number.isFinite(totalUsers) && totalUsers > 0 ? totalUsers : null;
            return new Chart(context, {
              type: "bar",
              data: {
                labels,
                datasets: [{
                  label: "Active users",
                  data,
                  backgroundColor,
                  borderRadius: 12,
                  borderSkipped: false
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    max: yMax || undefined,
                    suggestedMax: yMax || undefined,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => numberFormatter.format(value)
                    }
                  }
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        return `${numberFormatter.format(value)} users`;
                      }
                    }
                  }
                },
                interaction: {
                  mode: "index",
                  intersect: false
                }
              }
            });
          }
      
          function createUsageConsistencyChart(context, observedWeekCount, bucketData, totalUsers) {
            if (!context) {
              return null;
            }
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            const labels = observedWeekCount
              ? Array.from({ length: observedWeekCount }, (_, index) => `${index + 1} of ${observedWeekCount} weeks`)
              : [];
            const data = Array.isArray(bucketData) ? bucketData.map(value => value || 0) : [];
            const colors = labels.map((_, index) => {
              const isLast = index === labels.length - 1;
              return isLast
                ? getCssVariableValue("--blue-500", "#3A84C1")
                : getCssVariableValue("--indigo-500", "#5146D6");
            });
            const yMax = Number.isFinite(totalUsers) && totalUsers > 0 ? totalUsers : null;
            return new Chart(context, {
              type: "bar",
              data: {
                labels,
                datasets: [{
                  label: "Users",
                  data,
                  backgroundColor: colors,
                  borderRadius: 12,
                  borderSkipped: false
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    max: yMax || undefined,
                    suggestedMax: yMax || undefined,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => numberFormatter.format(value)
                    }
                  }
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        return `${numberFormatter.format(value)} users`;
                      }
                    }
                  }
                },
                interaction: {
                  mode: "index",
                  intersect: false
                }
              }
            });
          }
      
          function updateActiveDaysCard(stats) {
            if (!dom.activeDaysCard) {
              return;
            }
            const view = state.activeDaysView === "prompts" ? "prompts" : "users";
            const totals = stats
              ? (view === "prompts" ? stats.promptTotals : stats.uniqueUsers)
              : null;
            const rangeLabel = stats && stats.rangeLabel ? stats.rangeLabel : null;
            let hasValues = false;
            activeDayKeys.forEach(key => {
              const entry = activeDaysElements[key];
              if (!entry || !entry.value) {
                return;
              }
              if (!totals) {
                entry.value.textContent = "-";
                return;
              }
              const value = totals[key] || 0;
              if (value) {
                hasValues = true;
              }
              const rounded = Math.round(value);
              entry.value.textContent = value ? numberFormatter.format(rounded) : "0";
            });
            if (dom.activeDaysGrid) {
              const entries = activeDayKeys.map(key => {
                const record = activeDaysElements[key];
                if (!record || !record.item) {
                  return null;
                }
                const value = totals ? Number(totals[key] || 0) : 0;
                return {
                  record,
                  value
                };
              }).filter(Boolean);
              const sorter = totals
                ? (a, b) => {
                  const diff = b.value - a.value;
                  if (diff !== 0) {
                    return diff;
                  }
                  return (a.record.order ?? 0) - (b.record.order ?? 0);
                }
                : (a, b) => (a.record.order ?? 0) - (b.record.order ?? 0);
              entries.sort(sorter);
              const fragment = document.createDocumentFragment();
              entries.forEach(entry => {
                if (entry.record.item) {
                  fragment.appendChild(entry.record.item);
                }
              });
              dom.activeDaysGrid.appendChild(fragment);
            }
            if (dom.activeDaysCaption) {
              if (!totals) {
                dom.activeDaysCaption.textContent = "Upload data to review Copilot activity for the last 30 days.";
              } else if (hasValues) {
                if (view === "prompts") {
                  dom.activeDaysCaption.textContent = rangeLabel
                    ? `Total Copilot prompts generated per app in the last 30 days (${rangeLabel}).`
                    : "Total Copilot prompts generated per app in the last 30 days.";
                } else {
                  dom.activeDaysCaption.textContent = rangeLabel
                    ? `Unique Copilot users active at least once per app in the last 30 days (${rangeLabel}).`
                    : "Unique Copilot users active at least once per app in the last 30 days.";
                }
              } else {
                dom.activeDaysCaption.textContent = view === "prompts"
                  ? "No Copilot prompts recorded for the selected filters in the last 30 days."
                  : "No Copilot users recorded for the selected filters in the last 30 days.";
              }
            }
          }
      
          function updateAgentUsageCard(agentRows) {
            if (!dom.agentCard) {
              return;
            }
            const rows = Array.isArray(agentRows) ? agentRows : [];
            if (dom.agentTableBody) {
              dom.agentTableBody.innerHTML = "";
            }
            if (!rows.length) {
              if (dom.agentTableWrapper) {
                dom.agentTableWrapper.hidden = true;
              }
              if (dom.agentEmpty) {
                dom.agentEmpty.hidden = false;
                dom.agentEmpty.textContent = "Upload agent usage CSV to view insights.";
              }
              if (dom.agentStatus) {
                dom.agentStatus.textContent = "Awaiting agent usage CSV.";
              }
              if (dom.agentCaption) {
                dom.agentCaption.textContent = "Upload an agent usage export to spotlight the most active Copilot agents.";
              }
              if (dom.agentViewToggle) {
                dom.agentViewToggle.hidden = true;
                dom.agentViewToggle.setAttribute("aria-expanded", "false");
              }
              if (dom.agentViewAll) {
                dom.agentViewAll.hidden = true;
              }
              if (dom.agentSortButtons && dom.agentSortButtons.length) {
                dom.agentSortButtons.forEach(button => {
                  button.classList.remove("is-active");
                  button.setAttribute("aria-pressed", "false");
                  const label = button.dataset.sortLabel || button.textContent.trim();
                  const defaultDirection = button.dataset.agentSort === "name" || button.dataset.agentSort === "creatorType" ? "ascending" : "descending";
                  button.setAttribute("aria-label", `${label}. Click to sort ${defaultDirection}.`);
                  const indicator = button.querySelector("[data-sort-indicator]");
                  if (indicator) {
                    indicator.textContent = "";
                  }
                });
              }
              return;
            }
      
            const sortConfig = state.agentSort && state.agentSort.column
              ? state.agentSort
              : { column: "responses", direction: "desc" };
            const column = sortConfig.column;
            const directionMultiplier = sortConfig.direction === "asc" ? 1 : -1;
            const getSortValue = agent => {
              switch (column) {
                case "name":
                  return (agent.name || "").toLowerCase();
                case "creatorType":
                  return (agent.creatorType || "").toLowerCase();
                case "totalActive":
                  return Number(agent.totalActive || 0);
                case "responses":
                  return Number(agent.responses || 0);
                case "lastActivity":
                  return agent.lastActivity instanceof Date ? agent.lastActivity.getTime() : 0;
                default:
                  return Number(agent.responses || 0);
              }
            };
            const sorted = rows.slice().sort((a, b) => {
              const aValue = getSortValue(a);
              const bValue = getSortValue(b);
              if (column === "name" || column === "creatorType") {
                const compare = String(aValue).localeCompare(String(bValue));
                if (compare !== 0) {
                  return compare * directionMultiplier;
                }
              } else {
                const diff = Number(aValue) - Number(bValue);
                if (diff !== 0) {
                  return diff * directionMultiplier;
                }
              }
              return (a.name || "").localeCompare(b.name || "");
            });
      
            const total = sorted.length;
            const hasUnlimited = state.agentDisplayLimit === Infinity;
            const effectiveLimit = hasUnlimited
              ? total
              : Math.min(total, Math.max(state.agentDisplayLimit || 5, 5));
            const visibleRows = sorted.slice(0, hasUnlimited ? total : effectiveLimit);
            const displayedCount = visibleRows.length;
            const hasOverflow = displayedCount < total;
            const expanded = hasUnlimited || !hasOverflow;
      
            if (dom.agentTableWrapper) {
              dom.agentTableWrapper.hidden = false;
            }
            if (dom.agentEmpty) {
              dom.agentEmpty.hidden = true;
            }
      
            const sortLabel = agentSortLabels[sortConfig.column] || "responses";
            const directionLabel = sortConfig.direction === "asc" ? "ascending" : "descending";
            if (dom.agentCaption) {
              dom.agentCaption.textContent = `Top Copilot agents sorted by ${sortLabel.toLowerCase()} (${directionLabel}).`;
            }
      
            if (dom.agentStatus) {
              const meta = state.agentUsageMeta || {};
              const totalAgents = meta.totalRows || total;
              const skipped = meta.skipped || 0;
              const parts = [];
              if (meta.sourceName) {
                parts.push(`Agent export: ${meta.sourceName}`);
              }
              parts.push(`Showing ${numberFormatter.format(displayedCount)} of ${numberFormatter.format(totalAgents)} agents`);
              if (skipped) {
                parts.push(`${numberFormatter.format(skipped)} rows skipped`);
              }
              if (!state.persistDatasets) {
                parts.push("Session only (not cached)");
              }
              parts.push(`Sorted by ${sortLabel.toLowerCase()} (${directionLabel})`);
              dom.agentStatus.textContent = parts.join(" · ");
            }
      
            if (dom.agentViewToggle) {
              if (total <= 5) {
                dom.agentViewToggle.hidden = true;
                dom.agentViewToggle.setAttribute("aria-expanded", "false");
              } else {
                dom.agentViewToggle.hidden = false;
                dom.agentViewToggle.setAttribute("aria-expanded", String(expanded));
                if (expanded) {
                  dom.agentViewToggle.textContent = "Show top 5 agents";
                  dom.agentViewToggle.setAttribute("aria-label", "Show top 5 agents");
                } else {
                  const remaining = total - displayedCount;
                  const nextChunk = Math.min(50, remaining);
                  dom.agentViewToggle.textContent = remaining > 50
                    ? `Show next ${numberFormatter.format(nextChunk)} agents`
                    : `Show remaining ${numberFormatter.format(remaining)} agents`;
                  dom.agentViewToggle.setAttribute("aria-label", dom.agentViewToggle.textContent);
                }
              }
            }
      
            if (dom.agentViewAll) {
              if (total <= 5 || hasUnlimited || expanded) {
                dom.agentViewAll.hidden = true;
              } else {
                dom.agentViewAll.hidden = false;
                dom.agentViewAll.setAttribute("aria-label", "Show all agents");
              }
            }
      
            if (dom.agentSortButtons && dom.agentSortButtons.length) {
              dom.agentSortButtons.forEach(button => {
                const column = button.dataset.agentSort;
                const label = button.dataset.sortLabel || button.textContent.trim();
                const indicator = button.querySelector("[data-sort-indicator]");
                const isActive = column === sortConfig.column;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-pressed", String(isActive));
                if (indicator) {
                  indicator.textContent = isActive ? (sortConfig.direction === "asc" ? "▲" : "▼") : "";
                }
                if (isActive) {
                  const nextDirection = sortConfig.direction === "asc" ? "descending" : "ascending";
                  button.setAttribute("aria-label", `${label} sorted ${directionLabel}. Click to sort ${nextDirection}.`);
                } else {
                  const defaultDirection = column === "name" || column === "creatorType" ? "ascending" : "descending";
                  button.setAttribute("aria-label", `${label}. Click to sort ${defaultDirection}.`);
                }
              });
            }
      
            if (dom.agentTableBody) {
              const fragment = document.createDocumentFragment();
              visibleRows.forEach(agent => {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                nameCell.textContent = agent.name || "Unnamed agent";
                row.append(nameCell);
      
                const creatorCell = document.createElement("td");
                creatorCell.textContent = agent.creatorType || "Unspecified";
                row.append(creatorCell);
      
                const activeCell = document.createElement("td");
                activeCell.className = "is-numeric";
                activeCell.textContent = numberFormatter.format(Math.round(agent.totalActive || 0));
                row.append(activeCell);
      
                const responsesCell = document.createElement("td");
                responsesCell.className = "is-numeric";
                responsesCell.textContent = numberFormatter.format(Math.round(agent.responses || 0));
                row.append(responsesCell);
      
                const lastActivityCell = document.createElement("td");
                if (agent.lastActivity instanceof Date) {
                  lastActivityCell.textContent = formatShortDate(agent.lastActivity);
                } else {
                  lastActivityCell.textContent = "-";
                }
                row.append(lastActivityCell);
      
                fragment.append(row);
              });
              dom.agentTableBody.append(fragment);
            }
          }
      
          function generateReturningSeries(aggregates, interval) {
            const normalizedInterval = interval === "monthly" ? "monthly" : "weekly";
            if (!aggregates) {
              return {
                labels: [],
                totals: [],
                returningCounts: [],
                unitLabel: normalizedInterval === "monthly" ? "month" : "week"
              };
            }
            if (normalizedInterval === "monthly") {
              const timeline = Array.isArray(aggregates.weeklyTimeline) ? aggregates.weeklyTimeline : [];
              if (!timeline.length) {
                return {
                  labels: [],
                  totals: [],
                  returningCounts: [],
                  unitLabel: "month"
                };
              }
              const monthMap = new Map();
              timeline.forEach(entry => {
                const entryDate = entry && entry.date instanceof Date ? entry.date : null;
                if (!entryDate) {
                  return;
                }
                const monthKey = `${entryDate.getUTCFullYear()}-${pad(entryDate.getUTCMonth() + 1)}`;
                let accumulator = monthMap.get(monthKey);
                if (!accumulator) {
                  accumulator = {
                    key: monthKey,
                    label: formatMonthYear(entryDate),
                    users: new Set()
                  };
                  monthMap.set(monthKey, accumulator);
                }
                const userSet = entry && entry.users instanceof Set ? entry.users : new Set();
                userSet.forEach(user => accumulator.users.add(user));
              });
              const months = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
              const totals = months.map(month => month.users.size);
              const returningCounts = months.map((month, index) => {
                if (index === 0) {
                  return 0;
                }
                let returning = 0;
                month.users.forEach(user => {
                  if (months[index - 1].users.has(user)) {
                    returning += 1;
                  }
                });
                return returning;
              });
              return {
                labels: months.map(month => month.label),
                totals,
                returningCounts,
                unitLabel: "month"
              };
            }
            const timeline = Array.isArray(aggregates.weeklyTimeline) && aggregates.weeklyTimeline.length
              ? aggregates.weeklyTimeline
              : (Array.isArray(aggregates.periods) ? aggregates.periods : []);
            if (!timeline.length) {
              return {
                labels: [],
                totals: [],
                returningCounts: [],
                unitLabel: "week"
              };
            }
            const weeks = timeline.map(entry => {
              const date = entry && entry.date instanceof Date ? entry.date : null;
              const label = entry && typeof entry.label === "string" && entry.label.trim()
                ? entry.label
                : (date ? formatShortDate(date) : "");
              const users = entry && entry.users instanceof Set ? entry.users : new Set();
              return { label, users };
            }).filter(entry => entry.label);
            const totals = weeks.map(week => week.users.size);
            const returningCounts = weeks.map((week, index) => {
              if (index === 0) {
                return 0;
              }
              let returning = 0;
              week.users.forEach(user => {
                if (weeks[index - 1].users.has(user)) {
                  returning += 1;
                }
              });
              return returning;
            });
            return {
              labels: weeks.map(week => week.label),
              totals,
              returningCounts,
              unitLabel: "week"
            };
          }
      
          function updateReturningUsers(aggregates) {
            const returningChart = state.charts.returningUsers;
          const metric = state.returningMetric || "total";
          const interval = state.returningInterval || DEFAULT_RETURNING_INTERVAL;
          const series = generateReturningSeries(aggregates, interval);
          const hasData = Boolean(series.labels.length);
          setButtonEnabled(dom.returningExportPng, hasData);
          setButtonEnabled(dom.returningExportCsv, hasData);
          if (!hasData) {
              if (dom.returningCaption) {
                dom.returningCaption.textContent = "Upload data to monitor recurring adoption.";
              }
              if (dom.returningSummary) {
                dom.returningSummary.textContent = "-";
              }
              if (dom.returningEmpty) {
                dom.returningEmpty.hidden = false;
                dom.returningEmpty.textContent = interval === "monthly"
                  ? "Upload data to view returning users month over month."
                  : "Upload data to view returning users week over week.";
              }
              if (returningChart) {
                returningChart.data.labels = [];
                if (returningChart.data.datasets[0]) {
                  returningChart.data.datasets[0].data = [];
                  returningChart.data.datasets[0].label = "Returning users";
                }
                returningChart.update("none");
              }
              return;
            }
      
            const unitLabel = series.unitLabel || (interval === "monthly" ? "month" : "week");
            const labels = series.labels;
            const totals = series.totals;
            const returningCounts = series.returningCounts;
            const percentages = returningCounts.map((value, index) => {
              const total = totals[index] || 0;
              return total ? (value / total) * 100 : 0;
            });
            const datasetValues = metric === "percentage" ? percentages : returningCounts;
            const datasetLabel = metric === "percentage" ? "Returning users (%)" : "Returning users";
            const hasReturningValues = datasetValues.some(value => Number.isFinite(value) && value > 0);
            if (returningChart) {
              const lineColor = getCssVariableValue("--blue-500", "#3A84C1");
              const fillColor = hexToRgba(colorStringToHex(lineColor) || "#3A84C1", 0.15) || "rgba(58, 132, 193, 0.15)";
              returningChart.data.labels = labels;
              const dataset = returningChart.data.datasets[0];
              if (dataset) {
                dataset.label = datasetLabel;
                dataset.data = datasetValues;
                dataset.borderColor = lineColor;
                dataset.backgroundColor = fillColor;
                dataset.fill = metric === "percentage";
              }
              returningChart.update("none");
            }
            if (dom.returningEmpty) {
              dom.returningEmpty.hidden = hasReturningValues;
              if (!hasReturningValues) {
                dom.returningEmpty.textContent = interval === "monthly"
                  ? "No returning users detected for consecutive months yet."
                  : "No returning users detected for consecutive weeks yet.";
              }
            }
            if (dom.returningCaption) {
              dom.returningCaption.textContent = hasReturningValues
                ? (interval === "monthly"
                  ? "Which cohorts return to Copilot month over month?"
                  : "Which cohorts return to Copilot week over week?")
                : `Returning users appear once the same people are active in consecutive ${unitLabel}s.`;
            }
            if (dom.returningSummary) {
              const lastIndex = datasetValues.length - 1;
              if (lastIndex >= 0) {
                const latestLabel = labels[lastIndex];
                const latestReturning = returningCounts[lastIndex] || 0;
                const latestTotal = totals[lastIndex] || 0;
                const latestPercentage = percentages[lastIndex] || 0;
                if (hasReturningValues) {
                  dom.returningSummary.textContent = `${latestLabel}: ${numberFormatter.format(latestReturning)} returning of ${numberFormatter.format(latestTotal)} active (${latestPercentage.toFixed(1)}%)`;
                } else {
                  dom.returningSummary.textContent = `${latestLabel}: 0 returning of ${numberFormatter.format(latestTotal)} active (0.0%)`;
                }
              } else {
                dom.returningSummary.textContent = "-";
            }
          }
        }

        function exportReturningUsersImage() {
          const chart = state.charts.returningUsers;
          if (!chart) {
            return;
          }
          const interval = state.returningInterval || DEFAULT_RETURNING_INTERVAL;
          downloadChartImage(chart, `copilot-returning-${interval}.png`);
        }

        function exportReturningUsersCsv() {
          if (!state.latestReturningAggregates) {
            return;
          }
          const interval = state.returningInterval || DEFAULT_RETURNING_INTERVAL;
          const series = generateReturningSeries(state.latestReturningAggregates, interval);
          if (!series || !Array.isArray(series.labels) || !series.labels.length) {
            return;
          }
          const rows = series.labels.map((label, index) => {
            const returning = Number.isFinite(series.returningCounts[index]) ? series.returningCounts[index] : 0;
            const total = Number.isFinite(series.totals[index]) ? series.totals[index] : 0;
            const percentage = total ? (returning / total) * 100 : 0;
            return [
              label,
              Math.round(returning),
              Math.round(total),
              `${percentage.toFixed(1)}%`
            ];
          });
          downloadCsv(
            `copilot-returning-${interval}.csv`,
            ["Period", "Returning users", "Active users", "Returning %"],
            rows
          );
        }

        function exportUsageTrendImage() {
          const chart = state.charts.usageTrend;
          if (!chart) {
            return;
          }
          const mode = state.usageTrendMode === "percentage" ? "percentage" : "number";
          downloadChartImage(chart, `copilot-usage-trend-${mode}.png`);
        }

        function exportUsageTrendCsv() {
          const rows = Array.isArray(state.latestUsageTrendRows) ? state.latestUsageTrendRows : [];
          if (!rows.length) {
            return;
          }
          const csvRows = rows.map(row => {
            const frequentShare = Number.isFinite(row.frequentShare) ? `${row.frequentShare.toFixed(1)}%` : "";
            const consistentShare = Number.isFinite(row.consistentShare) ? `${row.consistentShare.toFixed(1)}%` : "";
            return [
              row.label || row.key || "",
              Math.round(Number.isFinite(row.frequentUsers) ? row.frequentUsers : 0),
              frequentShare,
              Math.round(Number.isFinite(row.consistentUsers) ? row.consistentUsers : 0),
              consistentShare,
              Math.round(Number.isFinite(row.totalUsers) ? row.totalUsers : 0)
            ];
          });
          downloadCsv(
            `copilot-usage-trend-${state.usageTrendMode === "percentage" ? "percentage" : "number"}.csv`,
            ["Period", "Frequent users", "Frequent %", "Consistent users", "Consistent %", "Total active users"],
            csvRows
          );
        }

        function exportUsageIntensityCsv() {
          const rows = collectUsageIntensityRows();
          if (!rows.length) {
            return;
          }
          const csvRows = rows.map(row => {
            const frequentShare = Number.isFinite(row.frequentShare) ? `${row.frequentShare.toFixed(1)}%` : "";
            const consistentShare = Number.isFinite(row.consistentShare) ? `${row.consistentShare.toFixed(1)}%` : "";
            return [
              row.label,
              Math.round(row.totalUsers || 0),
              Math.round(row.frequentUsers || 0),
              frequentShare,
              Math.round(row.consistentUsers || 0),
              consistentShare,
              row.range || ""
            ];
          });
          downloadCsv(
            "copilot-usage-intensity.csv",
            ["Period", "Total active users", "Frequent users", "Frequent %", "Consistent users", "Consistent %", "Observed range"],
            csvRows
          );
        }

        function exportAdoptionCsv() {
          const adoption = state.latestAdoption;
          const apps = adoption && Array.isArray(adoption.apps) ? adoption.apps : [];
          if (!apps.length) {
            return;
          }
          const rows = [];
          apps.forEach(app => {
            const appLabel = app.label || app.key || "Unnamed app";
            const appUsers = Number.isFinite(app.users) ? app.users : 0;
            const appShareValue = Number.isFinite(app.share) ? Math.max(0, Math.min(100, app.share)) : 0;
            rows.push([
              "App",
              appLabel,
              "",
              Math.round(appUsers),
              `${appShareValue.toFixed(1)}%`
            ]);
            if (Array.isArray(app.features)) {
              app.features.forEach(feature => {
                const featureLabel = feature.label || feature.key || "Capability";
                const featureUsers = Number.isFinite(feature.users) ? feature.users : 0;
                const featureShareValue = Number.isFinite(feature.share) ? Math.max(0, Math.min(100, feature.share)) : 0;
                rows.push([
                  "Capability",
                  featureLabel,
                  appLabel,
                  Math.round(featureUsers),
                  `${featureShareValue.toFixed(1)}%`
                ]);
              });
            }
          });
          downloadCsv(
            "copilot-adoption-by-app.csv",
            ["Type", "Name", "Parent app", "Active users", "% of active users"],
            rows
          );
        }

        function bootstrapEmbeddedSnapshot(options) {
          if (!options || typeof options !== "object") {
            return;
          }
          const snapshot = typeof options.snapshot === "string" ? options.snapshot.trim() : "";
          if (!snapshot) {
            return;
          }
          const promptMessage = options.message || "Enter the shared password to unlock this dashboard.";
          if (dom.datasetMessage) {
            dom.datasetMessage.textContent = promptMessage;
          }
          window.setTimeout(() => {
            if (!dom.snapshotImportDialog || typeof dom.snapshotImportDialog.showModal !== "function") {
              logWarn("Snapshot import dialog is unavailable for embedded exports.");
              return;
            }
            resetSnapshotImportDialog();
            try {
              dom.snapshotImportDialog.showModal();
              if (dom.snapshotImportText) {
                dom.snapshotImportText.value = snapshot;
              }
              if (dom.snapshotImportPassword) {
                dom.snapshotImportPassword.focus();
              }
              if (dom.snapshotImportError) {
                setSnapshotNotice(dom.snapshotImportError, promptMessage, "info");
              }
            } catch (error) {
              logWarn("Unable to open snapshot import dialog", error);
            }
          }, 120);
        }

        let exportHintTimeout = null;
      
          function toggleExportMenu() {
            if (!dom.exportMenu || !dom.exportTrigger) {
              return;
            }
            const shouldOpen = dom.exportMenu.hidden;
            dom.exportMenu.hidden = !shouldOpen;
            dom.exportTrigger.setAttribute("aria-expanded", String(shouldOpen));
          }

          function openExportMenuFromCta() {
            if (!dom.exportControls || !dom.exportMenu || !dom.exportTrigger) {
              return;
            }
            try {
              dom.exportControls.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (error) {
              dom.exportControls.scrollIntoView();
            }
            window.setTimeout(() => {
              if (!dom.exportMenu || !dom.exportTrigger) {
                return;
              }
              dom.exportMenu.hidden = false;
              dom.exportTrigger.setAttribute("aria-expanded", "true");
              const firstItem = dom.exportMenu.querySelector("button, [role='menuitem']");
              if (firstItem && typeof firstItem.focus === "function") {
                firstItem.focus();
              }
            }, 220);
          }
      
          function closeExportMenu() {
            if (!dom.exportMenu || !dom.exportTrigger) {
              return;
            }
            dom.exportMenu.hidden = true;
            dom.exportTrigger.setAttribute("aria-expanded", "false");
            if (exportHintTimeout) {
              clearTimeout(exportHintTimeout);
              exportHintTimeout = null;
            }
            if (dom.exportHint) {
              dom.exportHint.hidden = true;
              dom.exportHint.textContent = "";
            }
          }
      
          function showExportHint(message, isError) {
            if (!dom.exportHint) {
              return;
            }
            if (dom.exportMenu && dom.exportTrigger && dom.exportMenu.hidden) {
              dom.exportMenu.hidden = false;
              dom.exportTrigger.setAttribute("aria-expanded", "true");
            }
            dom.exportHint.textContent = message;
            dom.exportHint.style.color = isError ? "var(--blue-500)" : "var(--grey-500)";
            dom.exportHint.hidden = false;
            if (exportHintTimeout) {
              clearTimeout(exportHintTimeout);
            }
            exportHintTimeout = setTimeout(() => {
              if (dom.exportHint) {
                dom.exportHint.hidden = true;
                dom.exportHint.textContent = "";
              }
              closeExportMenu();
            }, 6000);
          }
      
          function waitForNextFrame() {
      
            return new Promise(resolve => requestAnimationFrame(() => resolve()));
      
          }
      
      
      
          function createHiddenTrendChart(detailMode, scale = 2) {
      
            const baseChart = state.charts.trend;
      
            if (!baseChart) {
      
              throw new Error("Trend chart is not ready.");
      
            }
      
            const periods = Array.isArray(state.latestTrendPeriods) ? state.latestTrendPeriods : [];
      
            if (!periods.length) {
      
              throw new Error("No trend data available for export.");
      
            }
      
            const labels = periods.map(item => item.label);
      
            const metric = state.filters.metric;
      
            const datasets = buildTrendDatasets(periods, metric, detailMode);
      
            const options = createTrendChartOptions();
      
            options.animation = false;
      
            options.responsive = false;
      
            options.maintainAspectRatio = false;
      
            if (options.plugins && options.plugins.tooltip) {
      
              options.plugins.tooltip.enabled = false;
      
            }
      
            const baseWidth = baseChart.width || baseChart.canvas?.clientWidth || 800;
      
            const baseHeight = baseChart.height || baseChart.canvas?.clientHeight || 480;
      
            const targetWidth = Math.max(Math.round(baseWidth * scale), 2);
      
            const targetHeight = Math.max(Math.round(baseHeight * scale), 2);
      
            const canvas = document.createElement("canvas");
      
            canvas.width = targetWidth;
      
            canvas.height = targetHeight;
      
            canvas.style.width = `${baseWidth}px`;
      
            canvas.style.height = `${baseHeight}px`;
      
            canvas.style.position = "fixed";
      
            canvas.style.pointerEvents = "none";
      
            canvas.style.opacity = "0";
      
            canvas.style.left = "-9999px";
      
            canvas.style.top = "-9999px";
      
            document.body.append(canvas);
      
            const context = canvas.getContext("2d");
      
            context.imageSmoothingQuality = "high";
      
            const exportChart = new Chart(context, {
      
              type: "line",
      
              data: {
      
                labels,
      
                datasets
      
              },
      
              options
      
            });
      
            exportChart.options.devicePixelRatio = (window.devicePixelRatio || 1) * scale;
      
            exportChart.resize(targetWidth, targetHeight);
      
            exportChart.update();
      
            return {
      
              canvas,
      
              chart: exportChart,
      
              width: targetWidth,
      
              height: targetHeight,
      
              destroy() {
      
                exportChart.destroy();
      
                canvas.remove();
      
              }
      
            };
      
          }
      
      
      
          function getGifWorkerUrl() {
      
            if (!gifWorkerUrlPromise) {
      
              gifWorkerUrlPromise = fetch(GIF_WORKER_SOURCE_URL)
      
                .then(response => {
      
                  if (!response.ok) {
      
                    throw new Error(`Failed to load GIF worker (${response.status})`);
      
                  }
      
                  return response.text();
      
                })
      
                .then(source => {
      
                  const blob = new Blob([source], { type: "application/javascript" });
      
                  return URL.createObjectURL(blob);
      
                })
      
                .catch(error => {
      
                  logError("GIF worker failed to load", error);
      
                  return null;
      
                });
      
            }
      
            return gifWorkerUrlPromise;
      
          }

          function ensureGifLibraryLoaded() {
            if (typeof GIF !== "undefined") {
              return Promise.resolve(true);
            }
            if (gifLibraryPromise) {
              return gifLibraryPromise;
            }
            gifLibraryPromise = new Promise((resolve, reject) => {
              const absoluteGifUrl = resolveAssetUrl(GIFJS_SCRIPT_URL);
              const existing = Array.from(document.scripts || []).find(script => script && script.src === absoluteGifUrl);
              if (existing) {
                existing.addEventListener("load", () => resolve(typeof GIF !== "undefined"), { once: true });
                existing.addEventListener("error", () => reject(new Error("Failed to load GIF export library.")), { once: true });
                return;
              }
              const script = document.createElement("script");
              script.src = absoluteGifUrl;
              script.async = true;
              script.crossOrigin = "anonymous";
              if (GIFJS_SCRIPT_INTEGRITY) {
                script.integrity = GIFJS_SCRIPT_INTEGRITY;
              }
              script.addEventListener("load", () => resolve(typeof GIF !== "undefined"), { once: true });
              script.addEventListener("error", () => reject(new Error("Failed to load GIF export library.")), { once: true });
              document.head.appendChild(script);
            }).catch(error => {
              gifLibraryPromise = null;
              throw error;
            });
            return gifLibraryPromise;
          }
      
          window.addEventListener("beforeunload", () => {
            if (gifWorkerUrlPromise) {
              gifWorkerUrlPromise.then(url => {
                if (url) {
                  URL.revokeObjectURL(url);
                }
              });
            }
          });

          function buildTrendTotalsRows(periods) {
            const aggregate = state.filters.aggregate === "weekly" ? "weekly" : state.filters.aggregate;
            const dateHeading = aggregate === "weekly" ? "Week ending" : "Period ending";
            const metric = state.filters.metric;
            const valueHeading = metric === "hours"
              ? "Assisted hours"
              : (metric === "adoption" ? "Active users (%)" : "Total actions");
            const rows = [["Period", dateHeading, valueHeading]];
            periods.forEach(period => {
              const label = period && typeof period.label === "string" ? period.label : "";
              const date = period && period.date instanceof Date ? formatShortDate(period.date) : "";
              let value = 0;
              if (metric === "hours") {
                value = Number.isFinite(period?.assistedHours) ? period.assistedHours : 0;
              } else if (metric === "adoption") {
                value = getPeriodAdoptionRate(period);
              } else {
                value = Number.isFinite(period?.totalActions) ? Math.round(period.totalActions) : 0;
              }
              const normalizedValue = metric === "adoption"
                ? Number(formatTrendFixed(value, 1))
                : (metric === "hours" ? Number(formatTrendFixed(value, 1)) : value);
              rows.push([label, date, normalizedValue]);
            });
            return rows;
          }

          function autoSizeWorksheetColumns(worksheet, rows) {
            if (!worksheet || !Array.isArray(rows) || !rows.length || !rows[0]) {
              return;
            }
            const columnCount = rows[0].length;
            const columnWidths = [];
            for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
              let maxLength = 10;
              rows.forEach(row => {
                const value = row[columnIndex];
                const length = String(value ?? "").length;
                if (length > maxLength) {
                  maxLength = length;
                }
              });
              columnWidths.push({ wch: Math.min(Math.max(maxLength + 2, 12), 40) });
            }
            worksheet["!cols"] = columnWidths;
          }

          function sanitizeWorksheetCellsForSpreadsheet(worksheet) {
            if (!worksheet || typeof worksheet !== "object") {
              return;
            }
            Object.keys(worksheet).forEach(key => {
              if (!key || key.startsWith("!")) {
                return;
              }
              const cell = worksheet[key];
              if (!cell) {
                return;
              }
              const sanitized = sanitizeSpreadsheetCell(cell.v);
              if (sanitized !== cell.v) {
                cell.v = sanitized;
                cell.t = "s";
              }
            });
          }
	      
          async function exportTrendTotalsToExcel() {
            const periods = Array.isArray(state.latestTrendPeriods) ? state.latestTrendPeriods : [];
            if (!periods.length) {
              showExportHint("Load data to export totals.", true);
              return;
            }
            const hasXlsx = await ensureXlsxLoaded().catch(error => {
              logWarn("Unable to load Excel export library", error);
              return false;
            });
            if (!hasXlsx) {
              showExportHint("Excel export library not available.", true);
              return;
            }
            const rows = buildTrendTotalsRows(periods);
            try {
              const worksheet = XLSX.utils.aoa_to_sheet(rows);
              sanitizeWorksheetCellsForSpreadsheet(worksheet);
              autoSizeWorksheetColumns(worksheet, rows);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, worksheet, "Trend totals");
              const filename = `copilot-trend-totals-${formatTimestamp()}.xlsx`;
              if (typeof XLSX.write === "function") {
                const binary = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
                const blob = new Blob([binary], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const result = await saveOrDownloadBlob(blob, filename, {
                  description: "Excel workbook",
                  accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }
                });
                if (result.canceled) {
                  showExportHint("Save canceled.", false);
                  return;
                }
                showExportHint(`Saved totals as ${filename}.`, false);
              } else {
                XLSX.writeFile(workbook, filename, { compression: true });
                showExportHint(`Saved totals as ${filename}.`, false);
              }
            } catch (error) {
              logError("Excel export failed", error);
              showExportHint("Unable to export totals in this browser.", true);
            }
          }

          async function exportTrendDataToCsv() {
            closeExportMenu();
            if (!Array.isArray(state.rows) || !state.rows.length) {
              showExportHint("Load data to export CSV.", true);
              return;
            }
            const filtered = applyFilters(state.rows);
            if (state.filters.timeframe === "custom" && state.filters.customRangeInvalid) {
              showExportHint("Fix the custom date range before exporting.", true);
              return;
            }
            if (!filtered.length) {
              showExportHint("No data matches the current filters.", true);
              return;
            }
            try {
              const aggregates = computeAggregates(filtered);
              const periods = Array.isArray(aggregates.periods) ? aggregates.periods : [];
              if (!periods.length) {
                showExportHint("No trend data available for CSV export.", true);
                return;
              }

              const metric = state.filters.metric;
              const selectedHeading = metric === "hours"
                ? "Assisted hours"
                : (metric === "adoption" ? "Adoption rate (%)" : "Total actions");

              const headers = [
                "Period",
                "Period ending",
                selectedHeading,
                "Total actions",
                "Assisted hours",
                "Active users",
                "Enabled users",
                "Adoption rate (%)",
                "Avg actions/user",
                "Avg hours/user"
              ];

              const rows = periods.map(period => {
                const date = period && period.date instanceof Date ? formatShortDate(period.date) : "";
                const totalActions = Number.isFinite(period?.totalActions) ? Math.round(period.totalActions) : 0;
                const assistedHours = Number.isFinite(period?.assistedHours) ? period.assistedHours : 0;
                const userCount = Number.isFinite(period?.userCount) ? period.userCount : 0;
                const enabledCount = Number.isFinite(period?.enabledUsersCount) ? period.enabledUsersCount : 0;
                const adoptionRate = Number.isFinite(period?.adoptionRate) ? period.adoptionRate : 0;
                const avgActions = Number.isFinite(period?.averageActionsPerUser) ? period.averageActionsPerUser : 0;
                const avgHours = Number.isFinite(period?.averageHoursPerUser) ? period.averageHoursPerUser : 0;
                const selectedValue = metric === "hours"
                  ? Number(formatTrendFixed(assistedHours, 1))
                  : (metric === "adoption" ? Number(formatTrendFixed(adoptionRate, 1)) : totalActions);

                return [
                  period && typeof period.label === "string" ? period.label : "",
                  date,
                  selectedValue,
                  totalActions,
                  Number(formatTrendFixed(assistedHours, 1)),
                  userCount,
                  enabledCount,
                  Number(formatTrendFixed(adoptionRate, 1)),
                  Number(formatTrendFixed(avgActions, 2)),
                  Number(formatTrendFixed(avgHours, 2))
                ];
              });

              const lines = [];
              lines.push(headers.map(escapeCsvValue).join(","));
              rows.forEach(row => lines.push(row.map(escapeCsvValue).join(",")));

              const filename = `copilot-trend-data-${formatTimestamp()}.csv`;
              const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
              const result = await saveOrDownloadBlob(blob, filename, {
                description: "CSV",
                accept: { "text/csv": [".csv"] }
              });
              if (result.canceled) {
                showExportHint("Save canceled.", false);
                return;
              }
              showExportHint(`Saved CSV as ${filename}.`, false);
            } catch (error) {
              logError("CSV export failed", error);
              showExportHint("Unable to export CSV.", true);
            }
          }

          async function exportFullReportToExcel() {
            if (!Array.isArray(state.rows) || !state.rows.length) {
              showExportHint("Load data to export a full report.", true);
              return;
            }
            const filtered = applyFilters(state.rows);
            if (state.filters.timeframe === "custom" && state.filters.customRangeInvalid) {
              showExportHint("Fix the custom date range before exporting.", true);
              return;
            }
            if (!filtered.length) {
              showExportHint("No data matches the current filters.", true);
              return;
            }
            const hasXlsx = await ensureXlsxLoaded().catch(error => {
              logWarn("Unable to load Excel export library", error);
              return false;
            });
            if (!hasXlsx) {
              showExportHint("Excel export library not available.", true);
              return;
            }
            try {
              const aggregates = computeAggregates(filtered);
              const organizationAggregates = computeAggregates(filtered, "organization");
              const countryAggregates = computeAggregates(filtered, "country");
              const supplemental = buildSupplementalInsights(filtered);
              const perAppActions = supplemental && Array.isArray(supplemental.perAppActions)
                ? supplemental.perAppActions
                : [];

              const workbook = XLSX.utils.book_new();

              const overviewRows = [];
              overviewRows.push(["Copilot impact dashboard export", "", ""]);
              overviewRows.push(["Export timestamp (local)", new Date().toLocaleString(), ""]);
              const windowLabel = typeof aggregates.windowLabel === "string" && aggregates.windowLabel
                ? aggregates.windowLabel
                : (dom.trendWindow && typeof dom.trendWindow.textContent === "string" ? dom.trendWindow.textContent : "");
              if (windowLabel) {
                overviewRows.push(["Time window", windowLabel, "Range of dates included in this view."]);
              }
              const metricLabel = state.filters.metric === "hours"
                ? "Assisted hours"
                : (state.filters.metric === "adoption" ? "Active users (%)" : "Actions");
              const aggregateLabel = state.filters.aggregate === "weekly"
                ? "Weekly"
                : (state.filters.aggregate === "monthly" ? "Monthly" : String(state.filters.aggregate || ""));
              overviewRows.push(["Metric in charts", metricLabel, "Primary metric used in the impact trend chart."]);
              overviewRows.push(["Aggregation in charts", aggregateLabel, "How values are grouped over time."]);
              const timeframeLabel = state.filters.timeframe === "custom" ? "Custom range" : state.filters.timeframe;
              overviewRows.push(["Timeframe filter", timeframeLabel, "Portion of the dataset included in this export."]);
              const organizationFilter = state.filters.organization instanceof Set ? state.filters.organization : new Set();
              const countryFilter = state.filters.country instanceof Set ? state.filters.country : new Set();
              const organizationFieldLabel = getFilterFieldLabel(state.filterFields.organization);
              const countryFieldLabel = getFilterFieldLabel(state.filterFields.country);
              const organizationFilterLabel = organizationFilter.size
                ? Array.from(organizationFilter).sort().join(", ")
                : getDefaultOptionLabelForField(state.filterFields.organization);
              const countryFilterLabel = countryFilter.size
                ? Array.from(countryFilter).sort().join(", ")
                : getDefaultOptionLabelForField(state.filterFields.country);
              overviewRows.push([`${organizationFieldLabel} filter`, organizationFilterLabel, `${organizationFieldLabel}s included in this view.`]);
              overviewRows.push([`${countryFieldLabel} filter`, countryFilterLabel, `${countryFieldLabel}s included in this view.`]);
              overviewRows.push(["", "", ""]);
              overviewRows.push(["Metric", "Value", "Explanation"]);

              const totalActions = Math.round(aggregates.totals && Number.isFinite(aggregates.totals.totalActions) ? aggregates.totals.totalActions : 0);
              const totalHours = aggregates.totals && Number.isFinite(aggregates.totals.assistedHours) ? aggregates.totals.assistedHours : 0;
              const activeUsers = aggregates.activeUsers instanceof Set ? aggregates.activeUsers.size : 0;
              const enabledUsers = aggregates.enabledUsers instanceof Set ? aggregates.enabledUsers.size : 0;
              const averageActionsPerUser = Number.isFinite(aggregates.averageActionsPerUser) ? aggregates.averageActionsPerUser : 0;
              const averageHoursPerUser = Number.isFinite(aggregates.averageHoursPerUser) ? aggregates.averageHoursPerUser : 0;

              overviewRows.push(["Total Copilot actions (all users)", totalActions, "All Copilot actions in the filtered dataset."]);
              overviewRows.push(["Total assisted hours", totalHours, "Estimated hours where Copilot assisted work."]);
              overviewRows.push(["Active users with actions", activeUsers, "Unique users with at least one Copilot action."]);
              overviewRows.push(["Users with Copilot license", enabledUsers, "Unique users enabled for Copilot in this period."]);
              overviewRows.push(["Average actions per active user", averageActionsPerUser, "Total actions divided by active users."]);
              overviewRows.push(["Average assisted hours per active user", averageHoursPerUser, "Total assisted hours divided by active users."]);

              const organizationGroups = Array.isArray(organizationAggregates.groups) ? organizationAggregates.groups : [];
              const organizationGroupLabel = getFilterFieldLabel(state.filterFields.organization);
              const organizationGroupLabelPlural = `${organizationGroupLabel}${organizationGroupLabel.endsWith("s") ? "" : "s"}`;
              if (organizationGroups.length) {
                const topOrganizations = organizationGroups.slice(0, 5);
                const parts = topOrganizations.map(group => {
                  const value = Math.round(group && Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  return `${group.name || "Unspecified"} (${value} actions)`;
                });
                overviewRows.push([`Top ${organizationGroupLabelPlural} by actions`, parts.join(BULLET_SEPARATOR), `${organizationGroupLabelPlural} in this view.`]);
              }

              const countryGroups = Array.isArray(countryAggregates.groups) ? countryAggregates.groups : [];
              const countryGroupLabel = getFilterFieldLabel(state.filterFields.country);
              const countryGroupLabelPlural = `${countryGroupLabel}${countryGroupLabel.endsWith("s") ? "" : "s"}`;
              if (countryGroups.length) {
                const topCountries = countryGroups.slice(0, 5);
                const parts = topCountries.map(group => {
                  const value = Math.round(group && Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  return `${group.name || "Unspecified"} (${value} actions)`;
                });
                overviewRows.push([`Top ${countryGroupLabelPlural} by actions`, parts.join(BULLET_SEPARATOR), `${countryGroupLabelPlural} with the highest total actions.`]);
              }

              const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
              sanitizeWorksheetCellsForSpreadsheet(overviewSheet);
              autoSizeWorksheetColumns(overviewSheet, overviewRows);
              XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

              const trendPeriods = Array.isArray(aggregates.periods) ? aggregates.periods : [];
              if (trendPeriods.length) {
                const trendRows = buildTrendTotalsRows(trendPeriods);
                const trendSheet = XLSX.utils.aoa_to_sheet(trendRows);
                sanitizeWorksheetCellsForSpreadsheet(trendSheet);
                autoSizeWorksheetColumns(trendSheet, trendRows);
                XLSX.utils.book_append_sheet(workbook, trendSheet, "Trend totals");
              }

              if (organizationGroups.length) {
                const orgRows = [];
                orgRows.push(["Each row shows Copilot activity per organization or office.", "", "", "", "", ""]);
                orgRows.push(["Organization / group", "Total actions", "Assisted hours", "Active users", "Avg actions per user", "Share of total actions"]);
                const orgTotalActions = organizationGroups.reduce((sum, group) => {
                  const value = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                  return sum + value;
                }, 0);
                organizationGroups.forEach(group => {
                  const groupActions = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                  const groupHours = Number.isFinite(group.assistedHours) ? group.assistedHours : 0;
                  const groupUsers = Number.isFinite(group.users) ? group.users : 0;
                  const groupAverage = Number.isFinite(group.averageActionsPerUser) ? group.averageActionsPerUser : 0;
                  const share = orgTotalActions ? (groupActions / orgTotalActions) * 100 : 0;
                  orgRows.push([
                    group.name || "Unspecified",
                    groupActions,
                    groupHours,
                    groupUsers,
                    groupAverage,
                    share
                  ]);
                });
                const orgSheet = XLSX.utils.aoa_to_sheet(orgRows);
                sanitizeWorksheetCellsForSpreadsheet(orgSheet);
                autoSizeWorksheetColumns(orgSheet, orgRows);
                XLSX.utils.book_append_sheet(workbook, orgSheet, "By organization");
              }

              if (countryGroups.length) {
                const countryRows = [];
                countryRows.push(["Each row shows Copilot activity per country.", "", "", "", "", ""]);
                countryRows.push(["Country", "Total actions", "Assisted hours", "Active users", "Avg actions per user", "Share of total actions"]);
                const totalCountryActions = countryGroups.reduce((sum, group) => {
                  const value = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                  return sum + value;
                }, 0);
                countryGroups.forEach(group => {
                  const groupActions = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                  const groupHours = Number.isFinite(group.assistedHours) ? group.assistedHours : 0;
                  const groupUsers = Number.isFinite(group.users) ? group.users : 0;
                  const groupAverage = Number.isFinite(group.averageActionsPerUser) ? group.averageActionsPerUser : 0;
                  const share = totalCountryActions ? (groupActions / totalCountryActions) * 100 : 0;
                  countryRows.push([
                    group.name || "Unspecified",
                    groupActions,
                    groupHours,
                    groupUsers,
                    groupAverage,
                    share
                  ]);
                });
                const countrySheet = XLSX.utils.aoa_to_sheet(countryRows);
                sanitizeWorksheetCellsForSpreadsheet(countrySheet);
                autoSizeWorksheetColumns(countrySheet, countryRows);
                XLSX.utils.book_append_sheet(workbook, countrySheet, "By country");
              }

              const monthlyEnabled = Array.isArray(aggregates.monthlyEnabledUsers)
                ? aggregates.monthlyEnabledUsers
                : (Array.isArray(state.latestEnabledTimeline) ? state.latestEnabledTimeline : []);
              if (monthlyEnabled.length) {
                const licenseRows = [];
                licenseRows.push(["Month", "Enabled Copilot users", "Explanation"]);
                monthlyEnabled.forEach(entry => {
                  const label = entry.label || entry.key || "";
                  const count = Number.isFinite(entry.count) ? entry.count : 0;
                  licenseRows.push([label, count, "Unique users enabled for Copilot in the representative week for this month."]);
                });
                const licenseSheet = XLSX.utils.aoa_to_sheet(licenseRows);
                autoSizeWorksheetColumns(licenseSheet, licenseRows);
                XLSX.utils.book_append_sheet(workbook, licenseSheet, "Licenses");
              }

              const adoption = aggregates.adoption;
              const adoptionApps = adoption && Array.isArray(adoption.apps) ? adoption.apps : [];
              if (adoptionApps.length) {
                const adoptionRows = [];
                adoptionRows.push(["Type", "Name", "Parent app", "Active users", "% of active users"]);
                adoptionApps.forEach(app => {
                  const appLabel = app.label || app.key || "App";
                  const appUsers = Number.isFinite(app.users) ? app.users : 0;
                  const appShareValue = Number.isFinite(app.share) ? app.share : 0;
                  adoptionRows.push(["App", appLabel, "", appUsers, appShareValue]);
                  if (Array.isArray(app.features)) {
                    app.features.forEach(feature => {
                      const featureLabel = feature.label || feature.key || "Capability";
                      const featureUsers = Number.isFinite(feature.users) ? feature.users : 0;
                      const featureShareValue = Number.isFinite(feature.share) ? feature.share : 0;
                      adoptionRows.push(["Capability", featureLabel, appLabel, featureUsers, featureShareValue]);
                    });
                  }
                });
                const adoptionSheet = XLSX.utils.aoa_to_sheet(adoptionRows);
                autoSizeWorksheetColumns(adoptionSheet, adoptionRows);
                XLSX.utils.book_append_sheet(workbook, adoptionSheet, "Adoption");
              }

              if (perAppActions.length) {
                const appRows = [];
                appRows.push(["App", "Total actions", "Notes"]);
                perAppActions.forEach(app => {
                  const label = app.label || app.key || "App";
                  const total = Number.isFinite(app.total) ? app.total : 0;
                  appRows.push([label, total, "Total Copilot actions attributed to this app in the current filters."]);
                });
                const appSheet = XLSX.utils.aoa_to_sheet(appRows);
                autoSizeWorksheetColumns(appSheet, appRows);
                XLSX.utils.book_append_sheet(workbook, appSheet, "App actions");
              }

              const filename = `copilot-full-report-${formatTimestamp()}.xlsx`;
              if (typeof XLSX.write === "function") {
                const sheets = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
                sheets.forEach(name => {
                  const sheet = workbook.Sheets ? workbook.Sheets[name] : null;
                  if (sheet) {
                    sanitizeWorksheetCellsForSpreadsheet(sheet);
                  }
                });
                const binary = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
                const blob = new Blob([binary], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const result = await saveOrDownloadBlob(blob, filename, {
                  description: "Excel workbook",
                  accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }
                });
                if (result.canceled) {
                  showExportHint("Save canceled.", false);
                  return;
                }
                showExportHint(`Saved full report as ${filename}.`, false);
              } else {
                XLSX.writeFile(workbook, filename, { compression: true });
                showExportHint(`Saved full report as ${filename}.`, false);
              }
            } catch (error) {
              logError("Full Excel export failed", error);
              showExportHint("Unable to export full report in this browser.", true);
            }
          }
	      
          async function exportDashboardToPDF() {
            closeExportMenu();
            if (!Array.isArray(state.rows) || !state.rows.length) {
              showExportHint("Load data before exporting a PDF report.", true);
              return;
            }
            const filtered = applyFilters(state.rows);
            if (state.filters.timeframe === "custom" && state.filters.customRangeInvalid) {
              showExportHint("Fix the custom date range before exporting.", true);
              return;
            }
            if (!filtered.length) {
              showExportHint("No data matches the current filters.", true);
              return;
            }
            const hasPdfExportLibraries = await ensurePdfExportLibrariesLoaded().catch(error => {
              logWarn("Unable to load PDF export libraries", error);
              return false;
            });
            if (!hasPdfExportLibraries) {
              showExportHint("PDF export libraries are not available.", true);
              return;
            }
            try {
              showToast("Preparing PDF report...", "", "info");
              const aggregates = computeAggregates(filtered);
              const organizationAggregates = computeAggregates(filtered, "organization");
              const countryAggregates = computeAggregates(filtered, "country");
              const { jsPDF } = window.jspdf;
              const pdf = new jsPDF({
                orientation: "landscape",
                unit: "pt",
                format: "a4"
              });
              const pageWidth = pdf.internal.pageSize.getWidth();
              const pageHeight = pdf.internal.pageSize.getHeight();
              const margin = 40;
              let y = margin;

              pdf.setFontSize(18);
              pdf.text("Copilot impact report", margin, y);
              y += 26;

              pdf.setFontSize(10);
              const exportedAt = new Date();
              pdf.text(`Generated ${exportedAt.toLocaleString()}`, margin, y);
              y += 16;

              const windowLabel = typeof aggregates.windowLabel === "string" && aggregates.windowLabel
                ? aggregates.windowLabel
                : (dom.trendWindow && typeof dom.trendWindow.textContent === "string" ? dom.trendWindow.textContent : "");
              if (windowLabel) {
                pdf.text(`Time window: ${windowLabel}`, margin, y);
                y += 16;
              }

              const timeframeLabel = state.filters.timeframe === "custom" ? "Custom range" : state.filters.timeframe;
              const aggregateLabel = state.filters.aggregate === "weekly"
                ? "Weekly"
                : (state.filters.aggregate === "monthly" ? "Monthly" : String(state.filters.aggregate || ""));
              const metricLabel = state.filters.metric === "hours" ? "Assisted hours" : "Actions";
              const filtersLine = `Metric: ${metricLabel} \u00b7 Aggregation: ${aggregateLabel} \u00b7 Timeframe: ${timeframeLabel}`;
              const wrappedFilters = pdf.splitTextToSize(filtersLine, pageWidth - margin * 2);
              pdf.text(wrappedFilters, margin, y);
              y += wrappedFilters.length * 12 + 6;

              const totalActions = Math.round(aggregates.totals && Number.isFinite(aggregates.totals.totalActions) ? aggregates.totals.totalActions : 0);
              const totalHours = aggregates.totals && Number.isFinite(aggregates.totals.assistedHours) ? aggregates.totals.assistedHours : 0;
              const activeUsers = aggregates.activeUsers instanceof Set ? aggregates.activeUsers.size : 0;
              const enabledUsers = aggregates.enabledUsers instanceof Set ? aggregates.enabledUsers.size : 0;
              const averageActionsPerUser = Number.isFinite(aggregates.averageActionsPerUser) ? aggregates.averageActionsPerUser : 0;
              const averageHoursPerUser = Number.isFinite(aggregates.averageHoursPerUser) ? aggregates.averageHoursPerUser : 0;

              pdf.setFontSize(12);
              const labelColumnWidth = 230;
              const valueColumnX = margin + labelColumnWidth;
              const metrics = [
                ["Total Copilot actions (all users)", numberFormatter.format(totalActions)],
                ["Total assisted hours", `${hoursFormatter.format(totalHours)} hrs`],
                ["Active users with actions", numberFormatter.format(activeUsers)],
                ["Users with Copilot license", numberFormatter.format(enabledUsers)],
                ["Average actions per active user", numberFormatter.format(Math.round(averageActionsPerUser || 0))],
                ["Average assisted hours per active user", `${hoursFormatter.format(averageHoursPerUser || 0)} hrs`]
              ];
              metrics.forEach(([label, value]) => {
                if (y > pageHeight - margin) {
                  pdf.addPage();
                  y = margin;
                }
                pdf.text(String(label), margin, y);
                pdf.text(String(value), valueColumnX, y);
                y += 16;
              });

              const explanation = "Metrics summarize the filtered Copilot dataset. Total actions count every Copilot interaction; assisted hours estimate time where Copilot was engaged. Active users have at least one action; licensed users are enabled for Copilot.";
              const wrappedExplanation = pdf.splitTextToSize(explanation, pageWidth - margin * 2);
              if (y + wrappedExplanation.length * 12 > pageHeight - margin) {
                pdf.addPage();
                y = margin;
              }
              pdf.setFontSize(10);
              pdf.text(wrappedExplanation, margin, y);
              y += wrappedExplanation.length * 12 + 18;

              pdf.setFontSize(12);
              const organizationGroups = Array.isArray(organizationAggregates.groups) ? organizationAggregates.groups : [];
              const organizationGroupLabel = getFilterFieldLabel(state.filterFields.organization);
              const organizationGroupLabelPlural = `${organizationGroupLabel}${organizationGroupLabel.endsWith("s") ? "" : "s"}`;
              if (organizationGroups.length) {
                if (y + 80 > pageHeight - margin) {
                  pdf.addPage();
                  y = margin;
                }
                pdf.text(`Top ${organizationGroupLabelPlural} by actions`, margin, y);
                y += 16;
                const topOrganizations = organizationGroups.slice(0, 5);
                topOrganizations.forEach(group => {
                  const actions = Math.round(group && Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  const users = Math.round(group && Number.isFinite(group.users) ? group.users : 0);
                  const line = `${group.name || "Unspecified"} \u00b7 ${numberFormatter.format(actions)} actions \u00b7 ${numberFormatter.format(users)} users`;
                  const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2);
                  wrapped.forEach(textLine => {
                    pdf.text(textLine, margin, y);
                    y += 14;
                  });
                });
              }

              const countryGroups = Array.isArray(countryAggregates.groups) ? countryAggregates.groups : [];
              const countryGroupLabel = getFilterFieldLabel(state.filterFields.country);
              const countryGroupLabelPlural = `${countryGroupLabel}${countryGroupLabel.endsWith("s") ? "" : "s"}`;
              if (countryGroups.length) {
                if (y + 80 > pageHeight - margin) {
                  pdf.addPage();
                  y = margin;
                }
                pdf.text(`Top ${countryGroupLabelPlural} by actions`, margin, y);
                y += 16;
                const topCountries = countryGroups.slice(0, 5);
                topCountries.forEach(group => {
                  const actions = Math.round(group && Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  const users = Math.round(group && Number.isFinite(group.users) ? group.users : 0);
                  const line = `${group.name || "Unspecified"} \u00b7 ${numberFormatter.format(actions)} actions \u00b7 ${numberFormatter.format(users)} users`;
                  const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2);
                  wrapped.forEach(textLine => {
                    pdf.text(textLine, margin, y);
                    y += 14;
                  });
                });
              }

              const addAgentsAsText = () => {
                const agentTbody = document.querySelector('tbody[data-agent-hub-tbody="agents"]');
                if (!agentTbody) {
                  return;
                }
                const rows = Array.from(agentTbody.querySelectorAll("tr"));
                if (!rows.length) {
                  return;
                }
                const toInt = (value) => {
                  const digits = String(value ?? "").replace(/[^\d]/g, "");
                  const parsed = digits ? Number.parseInt(digits, 10) : 0;
                  return Number.isFinite(parsed) ? parsed : 0;
                };
                const agents = rows.map(row => {
                  const cells = Array.from(row.querySelectorAll("td")).map(cell => (cell.textContent || "").trim());
                  return {
                    id: cells[0] || "",
                    name: cells[1] || "",
                    creatorType: cells[2] || "",
                    licensed: toInt(cells[3]),
                    unlicensed: toInt(cells[4]),
                    responses: toInt(cells[5])
                  };
                }).map(agent => ({ ...agent, total: agent.licensed + agent.unlicensed }))
                  .filter(agent => agent.name || agent.id);

                if (!agents.length) {
                  return;
                }

                agents.sort((a, b) => (b.total - a.total) || (b.responses - a.responses) || String(a.name).localeCompare(String(b.name)));
                const maxAgents = 150;
                const shown = agents.slice(0, maxAgents);
                const formatNumber = new Intl.NumberFormat(undefined);

                pdf.addPage();
                let pageY = margin;
                pdf.setFontSize(14);
                pdf.text("Top Copilot agents", margin, pageY);
                pageY += 18;
                pdf.setFontSize(10);
                const subtitle = `Sorted by active users (licensed + unlicensed). Showing top ${shown.length}${agents.length > shown.length ? ` of ${agents.length}` : ""}.`;
                const subtitleWrapped = pdf.splitTextToSize(subtitle, pageWidth - margin * 2);
                pdf.text(subtitleWrapped, margin, pageY);
                pageY += subtitleWrapped.length * 12 + 8;

                shown.forEach((agent, index) => {
                  const label = agent.name || agent.id || "Unknown agent";
                  const line = `${index + 1}. ${label} — ${formatNumber.format(agent.total)} active (L: ${formatNumber.format(agent.licensed)}, U: ${formatNumber.format(agent.unlicensed)}) · ${formatNumber.format(agent.responses)} responses`;
                  const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2);
                  const lineHeight = wrapped.length * 12 + 2;
                  if (pageY + lineHeight > pageHeight - margin) {
                    pdf.addPage();
                    pageY = margin;
                  }
                  pdf.text(wrapped, margin, pageY);
                  pageY += lineHeight;
                });
              };

              if (typeof html2canvas === "function") {
                const captureBackground = getCssVariableValue("--card-surface", "#ffffff") || "#ffffff";
                const buildPdfCaptureOptions = () => ({
                  backgroundColor: captureBackground,
                  scale: 2,
                  useCORS: true,
                  logging: false,
                  onclone: (clonedDocument) => {
                    const selectorsToHide = [
                      "[data-export-menu]",
                      "[data-enabled-licenses-export-menu]",
                      "[data-export-hint]",
                      ".export-hint",
                      ".sticky-filter-bar",
                      ".sticky-filter-dropdown",
                      ".toast-container",
                      "dialog[open]"
                    ];
                    selectorsToHide.forEach(selector => {
                      clonedDocument.querySelectorAll(selector).forEach(el => {
                        try {
                          el.hidden = true;
                        } catch (error) {
                          // ignore
                        }
                        el.classList.remove("is-open");
                        el.style.display = "none";
                      });
                    });
                  }
                });
                const addSectionScreenshotPage = async (title, element) => {
                  if (!element) {
                    return;
                  }
                  pdf.addPage();
                  let pageY = margin;
                  if (title) {
                    pdf.setFontSize(14);
                    pdf.text(title, margin, pageY);
                    pageY += 20;
                  }
                  const canvas = await html2canvas(element, buildPdfCaptureOptions());
                  const imageData = canvas.toDataURL("image/png", 1);
                  const ratio = canvas.height && canvas.width ? canvas.height / canvas.width : 0.75;
                  const contentWidth = pageWidth - margin * 2;
                  const contentHeight = pageHeight - margin - pageY;
                  let drawWidth = contentWidth;
                  let drawHeight = drawWidth * ratio;
                  if (drawHeight > contentHeight) {
                    const scale = contentHeight / drawHeight;
                    drawWidth *= scale;
                    drawHeight *= scale;
                  }
                  const centeredX = margin + (contentWidth - drawWidth) / 2;
                  pdf.addImage(imageData, "PNG", centeredX, pageY, drawWidth, drawHeight);
                };

                const hasVisibleData = (element, emptyElement) => Boolean(
                  element
                    && !element.hidden
                    && (!emptyElement || emptyElement.hidden)
                );

                const summaryGrid = document.querySelector(".summary-grid");
                await addSectionScreenshotPage("Key metrics", summaryGrid);

                const impactTrendCard = document.querySelector(".trend-card[aria-label='Impact trend']");
                await addSectionScreenshotPage("Impact trend", impactTrendCard);

                const groupTableCard = document.querySelector(".group-card[aria-label='Group breakdown']");
                await addSectionScreenshotPage("Impact trend breakdown", groupTableCard);

                const adoptionCard = dom.adoptionCard || document.querySelector("[data-adoption-card]");
                if (adoptionCard && !adoptionCard.hidden) {
                  await addSectionScreenshotPage("Adoption by app", adoptionCard);
                }

                const usageInsightsCard = dom.usageCard || document.querySelector("[data-usage-card]");
                if (hasVisibleData(usageInsightsCard, dom.usageEmpty)) {
                  await addSectionScreenshotPage("Usage intensity", usageInsightsCard);
                }

                const usageTrendCard = dom.usageTrendCard || document.querySelector("[data-usage-trend-card]");
                if (hasVisibleData(usageTrendCard, dom.usageTrendEmpty)) {
                  await addSectionScreenshotPage("Usage intensity comparison", usageTrendCard);
                }

                const enabledLicensesCard = dom.enabledLicensesCard || document.querySelector("[data-enabled-licenses-card]");
                if (hasVisibleData(enabledLicensesCard, dom.enabledLicensesEmpty)) {
                  await addSectionScreenshotPage("Licensed users trend", enabledLicensesCard);
                }

                const returningCard = dom.returningCard || document.querySelector("[data-returning-card]");
                if (hasVisibleData(returningCard, dom.returningEmpty)) {
                  await addSectionScreenshotPage("Returning users", returningCard);
                }

                const categoryGrid = document.querySelector(".category-grid");
                await addSectionScreenshotPage("Copilot capability highlights", categoryGrid);

                // Agents should always come last in the PDF.
                addAgentsAsText();
              } else {
                showToast("Unable to export PDF", "Screenshot library is not available.", "error");
                return;
              }

              const filename = `copilot-dashboard-report-${formatTimestamp()}.pdf`;
              if (typeof pdf.output === "function") {
                const blob = pdf.output("blob");
                const result = await saveOrDownloadBlob(blob, filename, {
                  description: "PDF document",
                  accept: { "application/pdf": [".pdf"] }
                });
                if (result.canceled) {
                  showToast("Save canceled", "", "info");
                  return;
                }
                showToast("PDF saved", filename, "info");
              } else {
                pdf.save(filename);
                showToast("PDF saved", filename, "info");
              }
            } catch (error) {
              logError("PDF export failed", error);
              showToast("Unable to export PDF report.", "", "error");
            }
          }
      
          async function exportChartAsPNG() {
      
            const chart = state.charts.trend;
      
            if (!chart) {
      
              showExportHint("Load data to export the chart.", true);
      
              return;
      
            }
      
            if (!state.latestTrendPeriods.length) {
      
              showExportHint("Load data to export the chart.", true);
      
              return;
      
            }
      
            const includeDetails = state.exportPreferences.includeDetails !== false && state.seriesDetailMode !== "none";
            const detailMode = state.seriesDetailMode === "none" ? "none" : (includeDetails ? "all" : "respect");
      
            let hiddenChart;
      
            try {
      
              hiddenChart = createHiddenTrendChart(detailMode, 2);
      
              hiddenChart.chart.update();
      
              await waitForNextFrame();
      
              const filename = `copilot-trend-${formatTimestamp()}.png`;
              const blob = await new Promise(resolve => {
                if (hiddenChart && hiddenChart.canvas && typeof hiddenChart.canvas.toBlob === "function") {
                  hiddenChart.canvas.toBlob(resolve, "image/png", 1);
                } else {
                  resolve(null);
                }
              });
              if (blob) {
                const result = await saveOrDownloadBlob(blob, filename, {
                  description: "PNG image",
                  accept: { "image/png": [".png"] }
                });
                if (result.canceled) {
                  showExportHint("Save canceled.", false);
                  return;
                }
                showExportHint(`Saved image as ${filename}.`, false);
              } else {
                const dataUrl = hiddenChart.canvas.toDataURL("image/png", 1);
                downloadDataURL(dataUrl, filename);
                showExportHint(`Saved image as ${filename}.`, false);
              }
      
            } catch (error) {
      
              logError("PNG export failed", error);
      
              showExportHint("Unable to export PNG in this browser.", true);
      
            } finally {
      
              if (hiddenChart) {
      
                hiddenChart.destroy();
      
              }
      
            }
      
          }
      
          let isExportingGif = false;
      
          async function exportTrendChartGif({ detailMode = "respect", scale = 2, frameDelay = 90, framesPerPoint = 6, holdDelayMultiplier = 12 } = {}) {
      
            const workerUrl = await getGifWorkerUrl();
      
            if (!workerUrl) {
      
              throw new Error("GIF worker could not be loaded.");
      
            }
      
            const hiddenChart = createHiddenTrendChart(detailMode, scale);
      
            try {
      
              hiddenChart.chart.options.animation = false;
      
              hiddenChart.chart.update();
      
              await waitForNextFrame();
      
              const gif = new GIF({
      
                workerScript: workerUrl,
      
                workers: 2,
      
                quality: 8,
      
                width: hiddenChart.canvas.width,
      
                height: hiddenChart.canvas.height,
      
                transparent: 0x000000
      
              });
      
              const frameCanvas = document.createElement("canvas");
      
              frameCanvas.width = hiddenChart.canvas.width;
      
              frameCanvas.height = hiddenChart.canvas.height;
      
              const frameCtx = frameCanvas.getContext("2d");
      
              frameCtx.imageSmoothingQuality = "high";
      
              function addFrame(delay) {
      
                frameCtx.fillStyle = "#ffffff";
      
                frameCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
      
                frameCtx.drawImage(hiddenChart.canvas, 0, 0);
      
                gif.addFrame(frameCtx, { copy: true, delay });
      
              }
      
              const datasets = hiddenChart.chart.data.datasets;
      
              const targetData = datasets.map(dataset => dataset.data.slice());
      
              const labelCount = hiddenChart.chart.data.labels.length;
      
              datasets.forEach(dataset => {
      
                dataset.data = new Array(labelCount).fill(null);
      
              });
      
              hiddenChart.chart.update();
      
              await waitForNextFrame();
      
              addFrame(frameDelay * holdDelayMultiplier);
      
              for (let index = 0; index < labelCount; index += 1) {
      
                const steps = Math.max(2, framesPerPoint);
      
                for (let step = 1; step <= steps; step += 1) {
      
                  const progress = step / steps;
      
                  datasets.forEach((dataset, datasetIndex) => {
      
                    const targetValues = targetData[datasetIndex];
      
                    for (let prev = 0; prev < index; prev += 1) {
      
                      dataset.data[prev] = targetValues[prev];
      
                    }
      
                    const rawTarget = targetValues[index];
      
                    const rawPrevious = index === 0 ? 0 : targetValues[index - 1];
      
                    const targetValue = Number.isFinite(rawTarget) ? rawTarget : 0;
      
                    const previousValue = Number.isFinite(rawPrevious) ? rawPrevious : targetValue;
      
                    dataset.data[index] = previousValue + (targetValue - previousValue) * progress;
      
                    for (let future = index + 1; future < labelCount; future += 1) {
      
                      dataset.data[future] = null;
      
                    }
      
                  });
      
                  hiddenChart.chart.update();
      
                  await waitForNextFrame();
      
                  addFrame(frameDelay);
      
                }
      
                datasets.forEach((dataset, datasetIndex) => {
      
                  dataset.data[index] = targetData[datasetIndex][index];
      
                });
      
                hiddenChart.chart.update();
      
                await waitForNextFrame();
      
                addFrame(frameDelay);
      
              }
      
              addFrame(frameDelay * holdDelayMultiplier);
      
              return await new Promise((resolve, reject) => {
      
                gif.on("finished", blob => {
      
                  hiddenChart.destroy();
      
                  resolve(blob);
      
                });
      
                gif.on("abort", () => {
      
                  hiddenChart.destroy();
      
                  reject(new Error("GIF export was aborted."));
      
                });
      
                gif.on("error", error => {
      
                  hiddenChart.destroy();
      
                  reject(error);
      
                });
      
                gif.render();
      
              });
      
            } catch (error) {
      
              hiddenChart.destroy();
      
              throw error;
      
            }
      
          }
      
      
      
          async function exportChartAnimation() {
      
            const chart = state.charts.trend;
      
            if (!chart) {
      
              showExportHint("Load data to export the chart.", true);
      
              return;
      
            }
      
            if (!state.latestTrendPeriods.length) {
      
              showExportHint("Load data to export the chart.", true);
      
              return;
      
            }
      
            if (typeof GIF === "undefined") {
              showExportHint("Loading GIF export library...", false);
              try {
                await ensureGifLibraryLoaded();
              } catch (error) {
                logWarn("GIF library failed to load", error);
                showExportHint("GIF export library is unavailable.", true);
                return;
              }
              if (typeof GIF === "undefined") {
                showExportHint("GIF export library is unavailable.", true);
                return;
              }
            }
      
            if (isExportingGif) {
      
              return;
      
            }
      
            isExportingGif = true;
      
            try {
      
              showExportHint("Rendering GIF animation...", false);
      
              const includeDetails = state.exportPreferences.includeDetails !== false && state.seriesDetailMode !== "none";
      
              const detailMode = state.seriesDetailMode === "none" ? "none" : (includeDetails ? "all" : "respect");
      
              const blob = await exportTrendChartGif({ detailMode, scale: 2, frameDelay: 90, framesPerPoint: 6, holdDelayMultiplier: 14 });
      
              const filename = `copilot-trend-${formatTimestamp()}.gif`;
              const result = await saveOrDownloadBlob(blob, filename, {
                description: "GIF animation",
                accept: { "image/gif": [".gif"] }
              });
              if (result.canceled) {
                showExportHint("Save canceled.", false);
                return;
              }
              showExportHint(`Saved animation as ${filename}.`, false);
      
            } catch (error) {
      
              logError("Animation export failed", error);
      
              showExportHint("Could not render GIF animation.", true);
      
            } finally {
      
              isExportingGif = false;
      
            }
      
          }
      
          function downloadDataURL(dataUrl, filename) {
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = filename;
            link.rel = "noopener";
            document.body.append(link);
            link.click();
            link.remove();
          }
      
        function downloadBlob(blob, filename) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
            link.rel = "noopener";
            document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1200);
        }

        function setupFilterToggleGroup(buttons, select, datasetKey) {
          if (!buttons || !buttons.length || !select) {
            return null;
          }
          const updateActive = () => {
            const current = select.value;
            buttons.forEach(button => {
              const value = button.dataset[datasetKey];
              const isActive = value === current;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
            });
          };
          buttons.forEach(button => {
            button.addEventListener("click", () => {
              const value = button.dataset[datasetKey];
              if (!value || value === select.value) {
                updateActive();
                return;
              }
              select.value = value;
              updateActive();
              select.dispatchEvent(new Event("change", { bubbles: true }));
            });
          });
          updateActive();
          return updateActive;
        }

        function refreshFilterToggleStates() {
          filterToggleUpdaters.forEach(update => {
            if (typeof update === "function") {
              try {
                update();
              } catch (error) {
                logWarn("Unable to refresh filter toggle state", error);
              }
            }
          });
        }

        function extractMultiSelectValues(select) {
          if (!select) {
            return [];
          }
          return Array.from(select.selectedOptions)
            .map(option => option.value)
            .filter(value => value && value !== "all");
        }

        function syncMultiSelect(select, selectedSet) {
          if (!select) {
            return;
          }
          const hasSelection = selectedSet instanceof Set && selectedSet.size > 0;
          Array.from(select.options).forEach(option => {
            if (option.value === "all") {
              option.selected = !hasSelection;
            } else if (hasSelection) {
              option.selected = selectedSet.has(option.value);
            } else {
              option.selected = false;
            }
          });
        }

        function formatTimestamp() {
          const now = new Date();
            const parts = [
              now.getUTCFullYear(),
              String(now.getUTCMonth() + 1).padStart(2, "0"),
              String(now.getUTCDate()).padStart(2, "0"),
              String(now.getUTCHours()).padStart(2, "0"),
              String(now.getUTCMinutes()).padStart(2, "0"),
              String(now.getUTCSeconds()).padStart(2, "0")
            ];
            return parts.join("");
          }
      
          function updateSelectOptions(select, values, defaultLabel) {
            if (!select) {
              return;
            }
            const targetSetCandidate = arguments.length >= 4 ? arguments[3] : null;
            const targetSet = targetSetCandidate instanceof Set
              ? targetSetCandidate
              : (select === dom.organizationFilter ? state.filters.organization : state.filters.country);
            const normalizedValues = Array.from(values || [])
              .filter(value => value && value !== "Unspecified")
              .sort((a, b) => a.localeCompare(b));
            const validValues = new Set(normalizedValues);
            const activeSet = targetSet instanceof Set ? targetSet : new Set();
            if (!(targetSet instanceof Set)) {
              if (select === dom.organizationFilter) {
                state.filters.organization = activeSet;
              } else {
                state.filters.country = activeSet;
              }
            }
            Array.from(activeSet).forEach(value => {
              if (!validValues.has(value)) {
                activeSet.delete(value);
              }
            });
            select.innerHTML = "";
            const defaultOption = document.createElement("option");
            defaultOption.value = "all";
            defaultOption.textContent = defaultLabel;
            select.append(defaultOption);
            normalizedValues.forEach(value => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = value;
              select.append(option);
            });
            syncMultiSelect(select, activeSet);
          }

          function countDistinctValues(values) {
            return Array.from(values || []).filter(value => value && value !== "Unspecified").length;
          }

          function resolveFilterFieldChoice(type, desired) {
            const normalized = normalizeFilterField(type, desired);
            const choices = type === "organization" ? ORGANIZATION_FIELD_CHOICES : COUNTRY_FIELD_CHOICES;
            const prioritized = [normalized, ...choices.filter(choice => choice !== normalized)];
            const pickWithMultiple = prioritized.find(choice => countDistinctValues(getSegmentValues(choice)) > 1);
            if (pickWithMultiple) {
              return pickWithMultiple;
            }
            const pickWithAny = prioritized.find(choice => countDistinctValues(getSegmentValues(choice)) > 0);
            if (pickWithAny) {
              return pickWithAny;
            }
            return type === "organization" ? DEFAULT_FILTER_FIELDS.organization : DEFAULT_FILTER_FIELDS.country;
          }

          function ensureFilterFieldDefaults() {
            state.filterFields.organization = resolveFilterFieldChoice("organization", state.filterFields.organization);
            state.filterFields.country = resolveFilterFieldChoice("country", state.filterFields.country);
          }

          function updateFilterFieldSelect(select, choices, type) {
            if (!select) {
              return;
            }
            const active = normalizeFilterField(type, state.filterFields[type]);
            select.innerHTML = "";
            let firstEnabled = null;
            const hasDataset = Array.isArray(state.rows) && state.rows.length > 0;
            choices.forEach(choice => {
              const option = document.createElement("option");
              option.value = choice;
              option.textContent = getFilterFieldLabel(choice);
              const distinctCount = countDistinctValues(getSegmentValues(choice));
              if (hasDataset) {
                if (distinctCount === 0) {
                  option.disabled = true;
                  option.title = "Not detected in the loaded dataset";
                } else if (distinctCount === 1) {
                  option.title = "Only one unique value detected";
                }
              }
              if (!option.disabled && !firstEnabled) {
                firstEnabled = choice;
              }
              select.append(option);
            });
            const hasActive = Boolean(select.querySelector(`option[value="${active}"]:not(:disabled)`));
            const nextValue = hasActive ? active : (firstEnabled || choices[0]);
            select.value = nextValue;
            state.filterFields[type] = nextValue;
          }

          function refreshFilterFieldSelects() {
            updateFilterFieldSelect(dom.organizationFieldSelect, ORGANIZATION_FIELD_CHOICES, "organization");
            updateFilterFieldSelect(dom.countryFieldSelect, COUNTRY_FIELD_CHOICES, "country");
          }

          function refreshFilterOptionsFromFieldSelection() {
            ensureFilterFieldDefaults();
            refreshFilterFieldSelects();
            const organizationField = normalizeFilterField("organization", state.filterFields.organization);
            const organizationValues = getSegmentValues(organizationField);
            updateSelectOptions(dom.organizationFilter, organizationValues, getDefaultOptionLabelForField(organizationField), state.filters.organization);

            const countryField = normalizeFilterField("country", state.filterFields.country);
            const countryValues = getSegmentValues(countryField);
            const countryDistinctCount = countDistinctValues(countryValues);
            const hasDataset = Array.isArray(state.rows) && state.rows.length > 0;
            const hideCountry = hasDataset && countryDistinctCount <= 1;
            if (dom.countryFilterWrapper) {
              dom.countryFilterWrapper.hidden = hideCountry;
            }
            if (hideCountry) {
              state.filters.country = new Set();
              syncMultiSelect(dom.countryFilter, state.filters.country);
            } else {
              updateSelectOptions(dom.countryFilter, countryValues, getDefaultOptionLabelForField(countryField), state.filters.country);
            }
          }
      
          function formatNumber(value) {
            return numberFormatter.format(Math.round(value));
          }
      
          function parseNumber(value) {
            if (value == null || value === "") {
              return 0;
            }
            if (typeof value === "number") {
              return Number.isFinite(value) ? value : 0;
            }
            const normalized = String(value).replace(/,/g, "").trim();
            if (!normalized) {
              return 0;
            }
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : 0;
          }
      
          function parseMetricDate(value) {
            if (!value) {
              return null;
            }
            const trimmed = String(value).trim();
            if (!trimmed) {
              return null;
            }
      
            const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) {
              const year = Number(isoMatch[1]);
              const month = Number(isoMatch[2]);
              const day = Number(isoMatch[3]);
              if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return null;
              }
              return new Date(Date.UTC(year, month - 1, day));
            }
      
            const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (slashMatch) {
              let month = Number(slashMatch[1]);
              let day = Number(slashMatch[2]);
              let year = Number(slashMatch[3]);
              if (year < 100) {
                year += 2000;
              }
              if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return null;
              }
              return new Date(Date.UTC(year, month - 1, day));
            }
      
            const dottedMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
            if (dottedMatch) {
              let day = Number(dottedMatch[1]);
              let month = Number(dottedMatch[2]);
              let year = Number(dottedMatch[3]);
              if (year < 100) {
                year += 2000;
              }
              if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return null;
              }
              return new Date(Date.UTC(year, month - 1, day));
            }
      
            const fallbackTimestamp = Date.parse(trimmed);
            if (Number.isFinite(fallbackTimestamp)) {
              const fallback = new Date(fallbackTimestamp);
              return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()));
            }
            return null;
          }
          function parseAgentDate(value) {
            if (!value) {
              return null;
            }
            const trimmed = String(value).trim();
            if (!trimmed) {
              return null;
            }
            const shortMatch = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
            if (shortMatch) {
              const day = Number(shortMatch[1]);
              const monthName = shortMatch[2].toLowerCase();
              const rawYear = Number(shortMatch[3]);
              const monthIndex = MONTH_NAME_TO_INDEX[monthName];
              const year = rawYear < 100 ? 2000 + rawYear : rawYear;
              if (Number.isFinite(day) && Number.isFinite(year) && monthIndex != null) {
                return new Date(Date.UTC(year, monthIndex, day));
              }
            }
            const directTimestamp = Date.parse(trimmed);
            if (Number.isFinite(directTimestamp)) {
              const parsed = new Date(directTimestamp);
              return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
            }
            return null;
          }
          function computeWeekEndingDate(date) {
            if (!date) {
              return null;
            }
            const weekEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            const day = weekEnd.getUTCDay();
            const offset = (6 - day + 7) % 7;
            weekEnd.setUTCDate(weekEnd.getUTCDate() + offset);
            return weekEnd;
          }
      
          function toIsoWeek(date) {
            const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
            const day = copy.getUTCDay() || 7;
            copy.setUTCDate(copy.getUTCDate() + 4 - day);
            const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
            const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
            return { year: copy.getUTCFullYear(), week };
          }
      
          function formatRangeLabel(start, end) {
            if (!start || !end) {
              return "-";
            }
            const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
            if (sameMonth) {
              return `${formatMonthYear(start)} ${start.getUTCDate()}-${end.getUTCDate()}`;
            }
            return `${formatShortDate(start)} to ${formatShortDate(end)}`;
          }
      
          function formatPeriodLabel(label, date) {
            if (state.filters.aggregate === "weekly") {
              return label;
            }
            return formatMonthYear(date);
          }
      
          function formatMonthYear(date) {
            return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
          }
      
          function formatShortDate(date) {
            return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
          }

          function datasetExceedsCacheLimit(sizeInBytes) {
            // Prevents attempting to mirror very large datasets into IndexedDB/localStorage, which repeatedly failed in low-memory browsers.
            return Number.isFinite(sizeInBytes) && sizeInBytes > DATASET_CACHE_LIMIT_BYTES;
          }

          function getDatasetCacheLimitMessage() {
            // Surface a clear hint so future debugging sessions know why persistence fell back to session-only.
            return `Datasets larger than ${formatFileSize(DATASET_CACHE_LIMIT_BYTES)} stay in this session only.`;
          }

          function formatFileSize(byteCount) {
            if (!Number.isFinite(byteCount) || byteCount <= 0) {
              return "0 B";
            }
            const units = ["B", "KB", "MB", "GB", "TB"];
            let value = byteCount;
            let unitIndex = 0;
            while (value >= 1024 && unitIndex < units.length - 1) {
              value /= 1024;
              unitIndex += 1;
            }
            const rounded = unitIndex === 0 || value >= 100
              ? Math.round(value)
              : Math.round(value * 10) / 10;
            return `${numberFormatter.format(rounded)} ${units[unitIndex]}`;
          }

          function detectDelimiterFromSample(sampleText) {
            if (typeof sampleText !== "string" || !sampleText.length) {
              return "";
            }
            const snippet = sampleText.slice(0, 8192);
            const targetLine = snippet.split(/\r?\n/).find(line => line.trim().length) || snippet;
            let best = { delimiter: "", count: 0, priority: CSV_DELIMITER_CANDIDATES.length };
            CSV_DELIMITER_CANDIDATES.forEach((delimiter, index) => {
              const regex = new RegExp(escapeRegExp(delimiter), "g");
              const count = (targetLine.match(regex) || []).length;
              if (count > best.count || (count === best.count && count > 0 && index < best.priority)) {
                best = { delimiter, count, priority: index };
              }
            });
            return best.count > 0 ? best.delimiter : "";
          }

          function detectDelimiterForFile(file) {
            if (!file || typeof file.slice !== "function") {
              return Promise.resolve("");
            }
            try {
              const snippet = file.slice(0, 16384);
              if (!snippet || typeof snippet.text !== "function") {
                return Promise.resolve("");
              }
              return snippet.text().then(text => detectDelimiterFromSample(text)).catch(() => "");
            } catch (error) {
              logWarn("Unable to inspect CSV snippet for delimiter", error);
              return Promise.resolve("");
            }
          }

          function escapeRegExp(value) {
            return String(value).replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
          }

          function ensureDatasetFieldLookup(fields, sampleRow) {
            if (currentCsvFieldLookup && currentCsvFieldLookup.size) {
              return;
            }
            const fromFields = buildFieldLookup(fields);
            if (fromFields) {
              currentCsvFieldLookup = fromFields;
              return;
            }
            if (sampleRow && typeof sampleRow === "object" && sampleRow !== null) {
              const lookup = buildFieldLookup(Object.keys(sampleRow));
              if (lookup) {
                currentCsvFieldLookup = lookup;
              }
            }
          }

          function buildFieldLookup(fields) {
            if (!Array.isArray(fields)) {
              return null;
            }
            const lookup = new Map();
            for (let index = 0; index < fields.length; index += 1) {
              const field = fields[index];
              if (typeof field !== "string") {
                continue;
              }
              const normalized = normalizeHeaderKey(field);
              if (normalized && !lookup.has(normalized)) {
                lookup.set(normalized, field);
              }
            }
            return lookup.size ? lookup : null;
          }

          function normalizeHeaderKey(value) {
            if (value == null) {
              return "";
            }
            let normalized = String(value).replace(/\uFEFF/g, "").trim();
            if (!normalized) {
              return "";
            }
            if (typeof normalized.normalize === "function") {
              normalized = normalized.normalize("NFKD");
            }
            normalized = normalized.replace(/[\u0300-\u036f]/g, "");
            normalized = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            return normalized;
          }

          function pad(value) {
            return String(value).padStart(2, "0");
          }
      
          function sanitizeLabel(value) {
            if (!value) {
              return "";
            }
            const trimmed = String(value).trim();
            return trimmed || "";
          }

          function shortenLabel(value, maxLength = 48) {
            if (!value) {
              return "";
            }
            const label = String(value);
            if (label.length <= maxLength) {
              return label;
            }
            return `${label.slice(0, maxLength - 1)}…`;
          }
      
          function normalizeFilterField(type, value) {
            const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
            const choices = type === "organization" ? ORGANIZATION_FIELD_CHOICES : COUNTRY_FIELD_CHOICES;
            if (choices.includes(normalized)) {
              return normalized;
            }
            return type === "organization" ? DEFAULT_FILTER_FIELDS.organization : DEFAULT_FILTER_FIELDS.country;
          }

          function getFilterFieldLabel(key) {
            return FILTER_FIELD_LABELS[key] || "Custom";
          }

          function getDefaultOptionLabelForField(key) {
            if (key === "domain") {
              return "All domains";
            }
            if (key === "country") {
              return "All regions";
            }
            return "All organizations";
          }

          function getSegmentValues(key) {
            if (key === "country") {
              return state.uniqueCountries instanceof Set ? state.uniqueCountries : new Set();
            }
            if (key === "domain") {
              return state.uniqueDomains instanceof Set ? state.uniqueDomains : new Set();
            }
            return state.uniqueOrganizations instanceof Set ? state.uniqueOrganizations : new Set();
          }

          function getDistinctSegmentValues(key) {
            const values = getSegmentValues(key);
            return Array.from(values).filter(value => value && value !== "Unspecified");
          }

          function resolveSegmentValue(row, key) {
            if (!row) {
              return "Unspecified";
            }
            if (key === "country") {
              return row.country || "Unspecified";
            }
            if (key === "domain") {
              return row.domain || "Unspecified";
            }
            return row.organization || "Unspecified";
          }

          function getGroupKey(row, grouping) {
            if (grouping === "country") {
              return resolveSegmentValue(row, state.filterFields.country);
            }
            if (grouping === "domain") {
              return row.domain || "Unspecified";
            }
            return resolveSegmentValue(row, state.filterFields.organization);
          }
  }
})();
