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
    const HIGH_RES_PIXEL_RATIO = Math.max(window.devicePixelRatio || 1, 2.5);
          Chart.defaults.devicePixelRatio = HIGH_RES_PIXEL_RATIO;
          const GIF_WORKER_SOURCE_URL = "assets/vendor/gif.worker.js";
          const GIFJS_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.js";
          const GIFJS_SCRIPT_INTEGRITY = "sha384-NRBudS8j0C4n1zt6ZpidRjH724QT7VXARyeGDI9SYn4b0X7JUxBIP0JlUxXXyZPc";
          let gifWorkerUrlPromise = null;
          let gifLibraryPromise = null;
          let activeParseController = null;
          const bufferedSampleCsvById = new Map();
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
          const GOAL_REQUIRED_WEEKS = 4;
          const GOAL_MIN_WEEKLY_ACTIVITY_EVENTS = 1;
          const GOAL_MIN_WEEKLY_ACTIVE_DAYS = 1;
          const GOAL_STATUS = {
            PASS: "PASS",
            FAIL: "FAIL",
            INSUFFICIENT_DATA: "INSUFFICIENT_DATA"
          };
          const GOAL_DEFINITIONS = {
            goal1: {
              id: "adoption_progress",
              label: "Monthly compliant reach",
              statement: "100% of targeted employees use Copilot in daily work."
            }
          };
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
            compare: {
              enabled: false,
              left: "",
              right: "",
              leftPeriods: [],
              rightPeriods: []
            },
            persistDatasets: false,
            charts: {
              trend: null,
              compareOverlay: null,
              usageFrequency: new Map(),
              usageConsistency: new Map(),
              usageTrend: null,
              returningUsers: null,
              enabledLicenses: null,
              goal1Monthly: null,
              goal1Weekly: null,
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
            latestGoalMetrics: null,
            goalMonthSelection: null,
            goalWeekSelection: null,
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
            hoveredTrendDatasetId: null,
            hoveredCompareDatasetLabel: null,
            seriesVisibility: {},
            seriesManualTouched: {},
            seriesDetailMode: "respect",
            returningMetric: "total",
            returningInterval: DEFAULT_RETURNING_INTERVAL,
            returningScaleMode: "smart",
            returningSelection: {
              weekly: null,
              monthly: null
            },
            groupsExpanded: false,
            topUsersExpanded: false,
            activeDaysView: "users",
            usageThresholds: {
              middle: 25,
              high: 50
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
          let currentDatasetContext = null;
          let lastDatasetDetectionSummary = "";
          const MAX_DIMENSION_SERIES = 6;
      
          const csvFieldMap = {
            totalActions: {
              primary: [
                "Total Active Copilot Actions Taken",
                "Total Copilot actions taken"
              ]
            },
            assistedHours: {
              primary: ["Copilot assisted hours"],
              alternate: [
                "Total Meeting hours summarized or recapped by Copilot",
                "Meeting hours recapped by Copilot",
                "Meeting hours summarized by Copilot",
                "Meeting hours summarized by Copilot in Teams"
              ],
              preferMax: true
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
          const DATASET_SCHEMA_LABELS = {
            legacy_minimal: "Legacy minimal",
            viva_impact_83: "Viva Analytics Copilot Impact",
            copilot_dashboard_export_89: "Copilot Dashboard export",
            unknown: "Unrecognized CSV format"
          };
          const IDENTITY_FIELD_CANDIDATES = {
            personId: [
              "PersonId",
              "Person ID",
              "Person identifier",
              "Anonymized person ID",
              "Anonymisert person-id",
              "Bruker-ID"
            ],
            metricDate: [
              "MetricDate",
              "Metric Date",
              "Method date",
              "Måledato",
              "Maledato",
              "Dato"
            ],
            organization: [
              "Organization",
              "Organisation",
              "Organisasjon",
              "Office",
              "Kontor"
            ],
            country: [
              "CountryOrRegion",
              "Country or region",
              "Country",
              "Land",
              "Land/region"
            ],
            domain: [
              "Domain",
              "Domene"
            ]
          };
          const SCHEMA_DEFINITIONS = {
            legacy_minimal: {
              id: "legacy_minimal",
              label: DATASET_SCHEMA_LABELS.legacy_minimal,
              expectedColumnCount: 12,
              minColumnCount: 10,
              maxColumnCount: 24,
              identityIndexMap: {
                personId: 0,
                metricDate: 4,
                organization: 1,
                country: 2,
                domain: 3
              },
              metricIndexMap: {
                assistedHours: 6,
                copilotEnabledUser: 11,
                emailDrafts: 8,
                meetingHours: 10,
                meetingRecap: 7,
                totalActions: 5
              }
            },
            viva_impact_83: {
              id: "viva_impact_83",
              label: DATASET_SCHEMA_LABELS.viva_impact_83,
              expectedColumnCount: 83,
              minColumnCount: 80,
              maxColumnCount: 86,
              identityIndexMap: {
                personId: 0,
                metricDate: 1,
                organization: 78,
                country: 79,
                domain: 80
              },
              metricIndexMap: {
                addContentPresentation: 43,
                assistedHours: 32,
                attendedMeetings: 56,
                chatCompose: 54,
                chatConversations: 55,
                chatPromptsTeams: 29,
                chatPromptsWeb: 40,
                chatPromptsWebOutlook: 10,
                chatPromptsWebTeams: 11,
                chatPromptsWork: 77,
                chatPromptsWorkOutlook: 30,
                chatPromptsWorkTeams: 29,
                chatSummaries: 53,
                chatWorkActions: 38,
                chatWorkEnabledDays: 31,
                chatsSent: 63,
                copilotChatEnabledUser: 15,
                copilotEnabledUser: 12,
                copilotProductivityEnabledUser: 14,
                copilotTeamsEnabledUser: 13,
                daysActiveChatWeb: 24,
                daysActiveChatWork: 23,
                daysActiveExcel: 22,
                daysActiveLoop: 21,
                daysActiveOneNote: 20,
                daysActiveOutlook: 19,
                daysActivePowerPoint: 18,
                daysActiveTeams: 17,
                daysActiveWord: 16,
                documentSummaries: 69,
                draftWord: 73,
                emailCoaching: 66,
                emailDrafts: 67,
                emailSummaries: 65,
                emailTotalWithCopilot: 64,
                emailsSent: 68,
                enabledDaysIntelligentSearch: 28,
                enabledDaysPowerPlatform: 27,
                enabledDaysProductivity: 26,
                enabledDaysTeams: 25,
                excelActions: 36,
                excelAnalysis: 74,
                excelChatPrompts: 46,
                excelFormatting: 76,
                excelFormula: 75,
                meetingHours: 9,
                meetingHoursConflicting: 62,
                meetingHoursMultitasking: 61,
                meetingHoursSmall: 60,
                meetingHoursTotal: 58,
                meetingHoursUninterrupted: 59,
                meetingRecap: 8,
                meetingSummariesActions: 50,
                meetingSummariesTotal: 51,
                meetingsTotal: 57,
                organizePresentation: 44,
                outlookActions: 37,
                powerpointActions: 35,
                powerpointChatPrompts: 45,
                presentationCreated: 71,
                rewriteTextWord: 72,
                summarizePresentation: 70,
                teamsActions: 34,
                totalActions: 47,
                totalActiveDays: 48,
                totalEnabledDays: 49,
                visualizeTableWord: 41,
                wordActions: 33,
                wordChatPrompts: 42
              }
            },
            copilot_dashboard_export_89: {
              id: "copilot_dashboard_export_89",
              label: DATASET_SCHEMA_LABELS.copilot_dashboard_export_89,
              expectedColumnCount: 89,
              minColumnCount: 87,
              maxColumnCount: 104,
              identityIndexMap: {
                personId: 0,
                metricDate: 1,
                organization: 87,
                country: null,
                domain: null
              },
              metricIndexMap: {
                addContentPresentation: 2,
                chatCompose: 6,
                chatConversations: 78,
                chatPromptsTeams: 25,
                chatPromptsWeb: 16,
                chatPromptsWebOutlook: 17,
                chatPromptsWebTeams: 18,
                chatPromptsWork: 23,
                chatPromptsWorkOutlook: 24,
                chatPromptsWorkTeams: 25,
                chatSummaries: 73,
                chatWorkActions: 7,
                chatWorkEnabledDays: 19,
                daysActiveChatWeb: 40,
                daysActiveChatWork: 41,
                daysActiveExcel: 50,
                daysActiveLoop: 51,
                daysActiveOneNote: 52,
                daysActiveOutlook: 53,
                daysActivePowerPoint: 54,
                daysActiveTeams: 55,
                daysActiveWord: 56,
                documentSummaries: 77,
                draftWord: 57,
                emailCoaching: 58,
                emailDrafts: 61,
                emailSummaries: 74,
                emailTotalWithCopilot: 82,
                enabledDaysIntelligentSearch: 34,
                enabledDaysPowerPlatform: 35,
                enabledDaysProductivity: 36,
                enabledDaysTeams: 37,
                excelActions: 8,
                excelAnalysis: 59,
                excelChatPrompts: 3,
                excelFormatting: 60,
                excelFormula: 38,
                meetingHours: 63,
                meetingRecap: 65,
                meetingSummariesActions: 75,
                meetingSummariesTotal: 84,
                outlookActions: 9,
                powerpointActions: 10,
                powerpointChatPrompts: 4,
                presentationCreated: 39,
                rewriteTextWord: 72,
                summarizePresentation: 76,
                teamsActions: 11,
                totalActions: 79,
                totalActiveDays: 80,
                totalEnabledDays: 81,
                visualizeTableWord: 86,
                wordActions: 12,
                wordChatPrompts: 5
              }
            }
          };
          const DEFAULT_NUMBER_DIALECT = {
            decimalSeparator: ".",
            thousandsSeparator: ","
          };
          const DEFAULT_DATE_DIALECT = {
            slashOrder: "mdy"
          };
          const METRIC_FIELD_CANDIDATES = csvFieldEntries.reduce((accumulator, [metricKey, mapping]) => {
            accumulator[metricKey] = collectMetricCandidates(mapping);
            return accumulator;
          }, {});

          function collectMetricCandidates(mapping) {
            const candidates = [];
            const pushValue = value => {
              if (Array.isArray(value)) {
                value.forEach(pushValue);
                return;
              }
              if (typeof value === "string" && value.trim()) {
                candidates.push(value.trim());
              }
            };
            if (typeof mapping === "string" || Array.isArray(mapping)) {
              pushValue(mapping);
            } else if (mapping && typeof mapping === "object") {
              pushValue(mapping.primary);
              pushValue(mapping.columns);
              pushValue(mapping.alternate);
              pushValue(mapping.synonyms);
              pushValue(mapping.legacy);
              pushValue(mapping.fallbackSum);
              pushValue(mapping.sum);
            }
            return Array.from(new Set(candidates));
          }

          function createDefaultDatasetContext() {
            return {
              schemaId: "unknown",
              schemaLabel: DATASET_SCHEMA_LABELS.unknown,
              confidence: 0,
              localeHint: "en-US",
              numberDialect: { ...DEFAULT_NUMBER_DIALECT },
              dateDialect: { ...DEFAULT_DATE_DIALECT },
              identityFields: {
                personId: "PersonId",
                metricDate: "MetricDate",
                organization: "Organization",
                country: "CountryOrRegion",
                domain: "Domain"
              },
              fallbackStats: {
                metricIndexFallbacks: 0,
                identityIndexFallbacks: 0,
                metricAliasResolutions: 0,
                identityAliasResolutions: 0
              },
              metricResolution: {}
            };
          }

          function toSampleRowArray(sampleRows) {
            if (Array.isArray(sampleRows)) {
              return sampleRows.filter(row => row && typeof row === "object");
            }
            if (sampleRows && typeof sampleRows === "object") {
              return [sampleRows];
            }
            return [];
          }

          function buildNormalizedFieldLookup(fields) {
            const lookup = new Map();
            if (!Array.isArray(fields)) {
              return lookup;
            }
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
            return lookup;
          }

          function findFieldFromCandidates(candidates, fieldLookup) {
            if (!(fieldLookup instanceof Map) || !Array.isArray(candidates)) {
              return null;
            }
            for (let index = 0; index < candidates.length; index += 1) {
              const candidate = candidates[index];
              const normalized = normalizeHeaderKey(candidate);
              if (!normalized) {
                continue;
              }
              const actual = fieldLookup.get(normalized);
              if (actual) {
                return actual;
              }
            }
            return null;
          }

          function collectSampleValuesForIndex(fields, sampleRows, index, limit = 32) {
            if (!Array.isArray(fields) || !Number.isFinite(index) || index < 0) {
              return [];
            }
            const field = fields[index];
            if (!field) {
              return [];
            }
            const rows = toSampleRowArray(sampleRows);
            const values = [];
            for (let rowIndex = 0; rowIndex < rows.length && values.length < limit; rowIndex += 1) {
              const row = rows[rowIndex];
              if (!row || typeof row !== "object" || !(field in row)) {
                continue;
              }
              const value = row[field];
              if (value == null) {
                continue;
              }
              const text = String(value).trim();
              if (!text) {
                continue;
              }
              values.push(text);
            }
            return values;
          }

          function ratioMatching(values, predicate) {
            if (!Array.isArray(values) || !values.length || typeof predicate !== "function") {
              return 0;
            }
            let matches = 0;
            for (let index = 0; index < values.length; index += 1) {
              if (predicate(values[index])) {
                matches += 1;
              }
            }
            return matches / values.length;
          }

          function looksLikePersonId(value) {
            if (value == null) {
              return false;
            }
            const text = String(value).trim();
            if (!text || /\s/.test(text)) {
              return false;
            }
            if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(text)) {
              return true;
            }
            if (/^(syn|anon)[-_]/i.test(text)) {
              return true;
            }
            return /^[A-Za-z0-9_-]{8,}$/.test(text);
          }

          function looksLikeDateValue(value) {
            if (value == null) {
              return false;
            }
            const text = String(value).trim();
            if (!text) {
              return false;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
              return true;
            }
            if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(text)) {
              return true;
            }
            return false;
          }

          function looksLikeNumericValue(value) {
            if (value == null) {
              return false;
            }
            const text = String(value).trim();
            if (!text || !/\d/.test(text)) {
              return false;
            }
            const parsed = parseNumber(text, DEFAULT_NUMBER_DIALECT);
            if (!Number.isFinite(parsed)) {
              return false;
            }
            if (parsed !== 0) {
              return true;
            }
            return /^[-+]?0+(?:[.,]0+)?$/.test(text.replace(/\s+/g, ""));
          }

          function looksLikeTextCategory(value) {
            if (value == null) {
              return false;
            }
            const text = String(value).trim();
            if (!text) {
              return false;
            }
            if (looksLikeDateValue(text) || looksLikeNumericValue(text)) {
              return false;
            }
            return /[A-Za-zÆØÅæøåÀ-ÿ]/.test(text);
          }

          function evaluateSchemaStructuralScore(schema, fields, sampleRows) {
            if (!schema || !Array.isArray(fields) || !fields.length) {
              return 0;
            }
            let score = 0;
            const expected = Number.isFinite(schema.expectedColumnCount) ? schema.expectedColumnCount : null;
            if (expected != null) {
              const distance = Math.abs(fields.length - expected);
              if (distance === 0) {
                score += 3;
              } else if (distance <= 4) {
                score += 2;
              } else if (distance <= 10) {
                score += 1;
              }
            }

            const identity = schema.identityIndexMap || {};
            const personRatio = ratioMatching(
              collectSampleValuesForIndex(fields, sampleRows, identity.personId),
              looksLikePersonId
            );
            if (personRatio >= 0.7) {
              score += 3;
            } else if (personRatio >= 0.4) {
              score += 1;
            }
            const dateRatio = ratioMatching(
              collectSampleValuesForIndex(fields, sampleRows, identity.metricDate),
              looksLikeDateValue
            );
            if (dateRatio >= 0.7) {
              score += 3;
            } else if (dateRatio >= 0.4) {
              score += 1;
            }
            const orgRatio = ratioMatching(
              collectSampleValuesForIndex(fields, sampleRows, identity.organization),
              looksLikeTextCategory
            );
            if (orgRatio >= 0.6) {
              score += 2;
            } else if (orgRatio >= 0.35) {
              score += 1;
            }
            const countryRatio = ratioMatching(
              collectSampleValuesForIndex(fields, sampleRows, identity.country),
              looksLikeTextCategory
            );
            if (Number.isFinite(identity.country)) {
              if (countryRatio >= 0.6) {
                score += 1;
              } else if (countryRatio >= 0.35) {
                score += 0.5;
              }
            }
            const domainRatio = ratioMatching(
              collectSampleValuesForIndex(fields, sampleRows, identity.domain),
              value => typeof value === "string" && /[A-Za-z]/.test(value) && /\./.test(value)
            );
            if (Number.isFinite(identity.domain)) {
              if (domainRatio >= 0.5) {
                score += 1;
              } else if (domainRatio >= 0.25) {
                score += 0.5;
              }
            }

            const metricIndexMap = schema.metricIndexMap || {};
            ["totalActions", "totalActiveDays", "totalEnabledDays"].forEach(metricKey => {
              const ratio = ratioMatching(
                collectSampleValuesForIndex(fields, sampleRows, metricIndexMap[metricKey]),
                looksLikeNumericValue
              );
              if (ratio >= 0.65) {
                score += 1;
              }
            });

            return score;
          }

          function findSchemaByStructure(fields, sampleRows) {
            const candidates = Object.values(SCHEMA_DEFINITIONS);
            let best = null;
            candidates.forEach(schema => {
              const score = evaluateSchemaStructuralScore(schema, fields, sampleRows);
              if (!best || score > best.score) {
                best = { schema, score };
              }
            });
            if (!best || best.score < 6) {
              return null;
            }
            const confidence = Math.min(0.9, 0.5 + (best.score - 6) * 0.06);
            return {
              schemaId: best.schema.id,
              confidence
            };
          }

          function getFieldIndex(fields, field) {
            if (!Array.isArray(fields) || !field) {
              return -1;
            }
            return fields.indexOf(field);
          }

          function getIndexCandidates(baseIndex, shift, fields) {
            const candidates = [];
            const add = index => {
              if (!Number.isFinite(index) || index < 0 || !Array.isArray(fields) || !fields[index]) {
                return;
              }
              if (!candidates.includes(index)) {
                candidates.push(index);
              }
            };
            add(baseIndex);
            if (Number.isFinite(shift) && shift !== 0) {
              add(baseIndex + shift);
            }
            return candidates;
          }

          function collectNumericSamplesForIndex(fields, sampleRows, index, limit = 64) {
            const values = collectSampleValuesForIndex(fields, sampleRows, index, limit);
            const numericValues = [];
            for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
              const parsed = parseNumber(values[valueIndex], DEFAULT_NUMBER_DIALECT);
              if (Number.isFinite(parsed)) {
                numericValues.push(parsed);
              }
            }
            return numericValues;
          }

          function scoreMetricFallbackColumn(fields, sampleRows, index) {
            const rawValues = collectSampleValuesForIndex(fields, sampleRows, index, 64);
            if (!rawValues.length) {
              return -1;
            }
            const numericValues = collectNumericSamplesForIndex(fields, sampleRows, index, 64);
            if (!numericValues.length) {
              return -1;
            }
            const numericRatio = numericValues.length / rawValues.length;
            let nonZeroCount = 0;
            const distinct = new Set();
            for (let valueIndex = 0; valueIndex < numericValues.length; valueIndex += 1) {
              const value = numericValues[valueIndex];
              if (Math.abs(value) > 0) {
                nonZeroCount += 1;
              }
              distinct.add(value);
            }
            const nonZeroRatio = numericValues.length ? (nonZeroCount / numericValues.length) : 0;
            const distinctRatio = Math.min(distinct.size / 12, 1);
            return (numericRatio * 0.55) + (nonZeroRatio * 0.3) + (distinctRatio * 0.15);
          }

          function scoreIdentityFallbackColumn(identityKey, fields, sampleRows, index) {
            const values = collectSampleValuesForIndex(fields, sampleRows, index, 64);
            if (!values.length) {
              return -1;
            }
            if (identityKey === "personId") {
              const ratio = ratioMatching(values, looksLikePersonId);
              const distinctRatio = Math.min(new Set(values).size / values.length, 1);
              return (ratio * 0.85) + (distinctRatio * 0.15);
            }
            if (identityKey === "metricDate") {
              return ratioMatching(values, looksLikeDateValue);
            }
            if (identityKey === "organization") {
              const textRatio = ratioMatching(values, value => looksLikeTextCategory(value) && !/\./.test(String(value)));
              const distinctRatio = Math.min(new Set(values).size / values.length, 1);
              return (textRatio * 0.8) + (distinctRatio * 0.2);
            }
            if (identityKey === "country") {
              const textRatio = ratioMatching(values, looksLikeTextCategory);
              const distinctCount = new Set(values).size;
              const boundedDistinctRatio = distinctCount <= 100 ? Math.min(distinctCount / 30, 1) : 0.35;
              return (textRatio * 0.8) + (boundedDistinctRatio * 0.2);
            }
            if (identityKey === "domain") {
              return ratioMatching(values, value => typeof value === "string" && /[A-Za-z]/.test(value) && /\./.test(value));
            }
            return 0;
          }

          function getSchemaIndexShift(fields, schema, normalizedLookup) {
            if (!schema || !Array.isArray(fields) || !(normalizedLookup instanceof Map)) {
              return 0;
            }
            const counts = new Map();
            const registerShift = shift => {
              if (!Number.isFinite(shift) || Math.abs(shift) > 24) {
                return;
              }
              counts.set(shift, (counts.get(shift) || 0) + 1);
            };
            Object.entries(IDENTITY_FIELD_CANDIDATES).forEach(([identityKey, candidates]) => {
              const expectedIndex = schema.identityIndexMap ? schema.identityIndexMap[identityKey] : null;
              if (!Number.isFinite(expectedIndex) || !Array.isArray(candidates) || !candidates.length) {
                return;
              }
              const resolvedField = findFieldFromCandidates(candidates, normalizedLookup);
              const actualIndex = getFieldIndex(fields, resolvedField);
              if (actualIndex >= 0) {
                registerShift(actualIndex - expectedIndex);
              }
            });
            if (!counts.size) {
              return 0;
            }
            let bestShift = 0;
            let bestCount = -1;
            counts.forEach((count, shift) => {
              if (count > bestCount || (count === bestCount && Math.abs(shift) < Math.abs(bestShift))) {
                bestShift = shift;
                bestCount = count;
              }
            });
            return Number.isFinite(bestShift) ? bestShift : 0;
          }

          function inferNumberDialect(sampleRows) {
            const rows = toSampleRowArray(sampleRows);
            let commaDecimalCount = 0;
            let dotDecimalCount = 0;
            rows.forEach(row => {
              Object.values(row).forEach(value => {
                if (typeof value !== "string") {
                  return;
                }
                const compact = value.replace(/\s+/g, "").trim();
                if (!compact) {
                  return;
                }
                if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(compact) || /^-?\d+,\d+$/.test(compact)) {
                  commaDecimalCount += 1;
                }
                if (/^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(compact) || /^-?\d+\.\d+$/.test(compact)) {
                  dotDecimalCount += 1;
                }
              });
            });
            if (commaDecimalCount > dotDecimalCount) {
              return {
                decimalSeparator: ",",
                thousandsSeparator: "."
              };
            }
            return {
              decimalSeparator: ".",
              thousandsSeparator: ","
            };
          }

          function inferDateDialect(sampleRows, numberDialect) {
            const rows = toSampleRowArray(sampleRows);
            let likelyDmy = 0;
            let likelyMdy = 0;
            rows.forEach(row => {
              Object.values(row).forEach(value => {
                if (typeof value !== "string") {
                  return;
                }
                const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                if (!match) {
                  return;
                }
                const first = Number(match[1]);
                const second = Number(match[2]);
                if (!Number.isFinite(first) || !Number.isFinite(second)) {
                  return;
                }
                if (first > 12 && second <= 12) {
                  likelyDmy += 1;
                } else if (second > 12 && first <= 12) {
                  likelyMdy += 1;
                }
              });
            });
            if (likelyDmy > likelyMdy) {
              return { slashOrder: "dmy" };
            }
            if (likelyMdy > likelyDmy) {
              return { slashOrder: "mdy" };
            }
            return {
              slashOrder: numberDialect.decimalSeparator === "," ? "dmy" : "mdy"
            };
          }

          function inferLocaleHint(numberDialect, dateDialect) {
            if (dateDialect.slashOrder === "dmy" || numberDialect.decimalSeparator === ",") {
              return "nb-NO";
            }
            return "en-US";
          }

          function resolveDatasetSchema(fields, sampleRows) {
            const list = Array.isArray(fields) ? fields : [];
            const count = list.length;
            let schemaId = "unknown";
            let confidence = 0.3;
            const schemaCandidates = Object.values(SCHEMA_DEFINITIONS);
            const exactMatch = schemaCandidates.find(schema => schema.expectedColumnCount === count);
            if (exactMatch) {
              schemaId = exactMatch.id;
              confidence = 0.98;
            } else {
              const rangeMatch = schemaCandidates.find(schema => {
                const min = Number.isFinite(schema.minColumnCount) ? schema.minColumnCount : schema.expectedColumnCount;
                const max = Number.isFinite(schema.maxColumnCount) ? schema.maxColumnCount : schema.expectedColumnCount;
                return Number.isFinite(min) && Number.isFinite(max) && count >= min && count <= max;
              });
              if (rangeMatch) {
                schemaId = rangeMatch.id;
                confidence = 0.75;
              } else {
                const structuralMatch = findSchemaByStructure(list, sampleRows);
                if (structuralMatch) {
                  schemaId = structuralMatch.schemaId;
                  confidence = structuralMatch.confidence;
                }
              }
            }
            const numberDialect = inferNumberDialect(sampleRows);
            const dateDialect = inferDateDialect(sampleRows, numberDialect);
            const localeHint = inferLocaleHint(numberDialect, dateDialect);
            return {
              schemaId,
              schemaLabel: DATASET_SCHEMA_LABELS[schemaId] || DATASET_SCHEMA_LABELS.unknown,
              confidence,
              numberDialect,
              dateDialect,
              localeHint
            };
          }

          function resolveDatasetFieldMapping(fields, schemaInfo, sampleRows = []) {
            const context = createDefaultDatasetContext();
            if (schemaInfo && typeof schemaInfo === "object") {
              context.schemaId = schemaInfo.schemaId || context.schemaId;
              context.schemaLabel = schemaInfo.schemaLabel || context.schemaLabel;
              context.confidence = Number.isFinite(schemaInfo.confidence) ? schemaInfo.confidence : context.confidence;
              context.localeHint = schemaInfo.localeHint || context.localeHint;
              context.numberDialect = schemaInfo.numberDialect || context.numberDialect;
              context.dateDialect = schemaInfo.dateDialect || context.dateDialect;
            }
            const list = Array.isArray(fields) ? fields : [];
            const normalizedLookup = buildNormalizedFieldLookup(list);
            const combinedLookup = buildFieldLookup(list) || new Map();
            const schema = SCHEMA_DEFINITIONS[context.schemaId];
            const identityIndexMap = schema && schema.identityIndexMap ? schema.identityIndexMap : {};
            const metricIndexMap = schema && schema.metricIndexMap ? schema.metricIndexMap : {};
            const schemaIndexShift = getSchemaIndexShift(list, schema, normalizedLookup);

            Object.entries(IDENTITY_FIELD_CANDIDATES).forEach(([identityKey, candidates]) => {
              let resolved = findFieldFromCandidates(candidates, normalizedLookup);
              if (resolved) {
                context.fallbackStats.identityAliasResolutions += 1;
              }
              if (!resolved) {
                const fallbackIndex = identityIndexMap[identityKey];
                const indexCandidates = getIndexCandidates(fallbackIndex, schemaIndexShift, list);
                let best = null;
                for (let candidateIndex = 0; candidateIndex < indexCandidates.length; candidateIndex += 1) {
                  const index = indexCandidates[candidateIndex];
                  const score = scoreIdentityFallbackColumn(identityKey, list, sampleRows, index);
                  if (!best || score > best.score) {
                    best = { index, score };
                  }
                }
                if (best && list[best.index]) {
                  resolved = list[best.index];
                  context.fallbackStats.identityIndexFallbacks += 1;
                }
              }
              if (resolved) {
                context.identityFields[identityKey] = resolved;
                candidates.forEach(candidate => {
                  const normalized = normalizeHeaderKey(candidate);
                  if (normalized && !combinedLookup.has(normalized)) {
                    combinedLookup.set(normalized, resolved);
                  }
                });
              }
            });

            Object.entries(METRIC_FIELD_CANDIDATES).forEach(([metricKey, candidates]) => {
              if (!Array.isArray(candidates) || !candidates.length) {
                return;
              }
              let resolved = findFieldFromCandidates(candidates, normalizedLookup);
              let resolutionType = "";
              if (resolved) {
                resolutionType = "alias";
                context.fallbackStats.metricAliasResolutions += 1;
              }
              if (!resolved) {
                const fallbackIndex = metricIndexMap[metricKey];
                const indexCandidates = getIndexCandidates(fallbackIndex, schemaIndexShift, list);
                let best = null;
                for (let candidateIndex = 0; candidateIndex < indexCandidates.length; candidateIndex += 1) {
                  const index = indexCandidates[candidateIndex];
                  const score = scoreMetricFallbackColumn(list, sampleRows, index);
                  if (!best || score > best.score) {
                    best = { index, score };
                  }
                }
                if (best && list[best.index]) {
                  resolved = list[best.index];
                  resolutionType = "index";
                  context.fallbackStats.metricIndexFallbacks += 1;
                }
              }
              if (resolved) {
                if (resolutionType) {
                  context.metricResolution[metricKey] = resolutionType;
                }
                candidates.forEach(candidate => {
                  const normalized = normalizeHeaderKey(candidate);
                  if (normalized && !combinedLookup.has(normalized)) {
                    combinedLookup.set(normalized, resolved);
                  }
                });
              }
            });

            return {
              context,
              fieldLookup: combinedLookup
            };
          }

          function describeDatasetContext(context) {
            if (!context || typeof context !== "object") {
              return "";
            }
            const schemaLabel = context.schemaLabel || DATASET_SCHEMA_LABELS.unknown;
            const confidenceValue = Number.isFinite(context.confidence)
              ? `${Math.round(Math.max(0, Math.min(1, context.confidence)) * 100)}%`
              : "n/a";
            const numberDialect = context.numberDialect && context.numberDialect.decimalSeparator === "," ? "comma decimals" : "dot decimals";
            const dateDialect = context.dateDialect && context.dateDialect.slashOrder === "dmy" ? "day-first dates" : "month-first dates";
            const fallbacks = context.fallbackStats || {};
            const fallbackCount = Number(fallbacks.identityIndexFallbacks || 0) + Number(fallbacks.metricIndexFallbacks || 0);
            const fallbackWarning = fallbackCount >= 25 ? "; verify localized headers (high fallback mapping)" : "";
            return `${schemaLabel} (${confidenceValue}, ${numberDialect}, ${dateDialect}; index fallbacks: ${fallbackCount}${fallbackWarning})`;
          }

          function getRawColumnValue(raw, column) {
            if (!raw || !column) {
              return null;
            }
            if (column in raw) {
              return raw[column];
            }
            const normalized = normalizeHeaderKey(column);
            if (normalized && currentCsvFieldLookup instanceof Map) {
              const resolved = currentCsvFieldLookup.get(normalized);
              if (resolved && resolved in raw) {
                return raw[resolved];
              }
            }
            return null;
          }

          function getIdentityValue(raw, key) {
            const context = currentDatasetContext && currentDatasetContext.identityFields
              ? currentDatasetContext.identityFields
              : null;
            const mappedColumn = context ? context[key] : null;
            const mappedValue = getRawColumnValue(raw, mappedColumn);
            if (mappedValue != null && String(mappedValue).trim()) {
              return mappedValue;
            }
            const candidates = IDENTITY_FIELD_CANDIDATES[key] || [];
            for (let index = 0; index < candidates.length; index += 1) {
              const value = getRawColumnValue(raw, candidates[index]);
              if (value != null && String(value).trim()) {
                return value;
              }
            }
            return null;
          }

          function applyDerivedEnablementMetrics(metrics) {
            if (!metrics || typeof metrics !== "object") {
              return;
            }
            const hasEnabledDays = (metrics.totalEnabledDays || 0) > 0
              || (metrics.enabledDaysTeams || 0) > 0
              || (metrics.enabledDaysProductivity || 0) > 0
              || (metrics.enabledDaysPowerPlatform || 0) > 0
              || (metrics.enabledDaysIntelligentSearch || 0) > 0
              || (metrics.chatWorkEnabledDays || 0) > 0;
            if ((metrics.copilotEnabledUser || 0) <= 0 && hasEnabledDays) {
              metrics.copilotEnabledUser = 1;
            }
            if ((metrics.copilotTeamsEnabledUser || 0) <= 0 && (metrics.enabledDaysTeams || 0) > 0) {
              metrics.copilotTeamsEnabledUser = 1;
            }
            if ((metrics.copilotProductivityEnabledUser || 0) <= 0 && (metrics.enabledDaysProductivity || 0) > 0) {
              metrics.copilotProductivityEnabledUser = 1;
            }
            const chatEnabled = (metrics.chatWorkEnabledDays || 0) > 0
              || (metrics.daysActiveChatWork || 0) > 0
              || (metrics.chatPromptsWork || 0) > 0;
            if ((metrics.copilotChatEnabledUser || 0) <= 0 && chatEnabled) {
              metrics.copilotChatEnabledUser = 1;
            }
          }

          function sumPositiveMetricValues(metrics, keys) {
            if (!metrics || typeof metrics !== "object" || !Array.isArray(keys) || !keys.length) {
              return 0;
            }
            let total = 0;
            for (let index = 0; index < keys.length; index += 1) {
              const value = Number(metrics[keys[index]] || 0);
              if (Number.isFinite(value) && value > 0) {
                total += value;
              }
            }
            return total;
          }

          function applyDerivedMetricFallbacks(metrics) {
            if (!metrics || typeof metrics !== "object") {
              return;
            }
            const actionComponentKeys = [
              "teamsActions",
              "wordActions",
              "outlookActions",
              "powerpointActions",
              "excelActions",
              "chatWorkActions",
              "meetingRecap",
              "meetingSummariesActions",
              "meetingSummariesTotal",
              "chatCompose",
              "chatSummaries",
              "chatConversations",
              "emailDrafts",
              "emailSummaries",
              "emailCoaching",
              "presentationCreated",
              "addContentPresentation",
              "organizePresentation",
              "summarizePresentation",
              "draftWord",
              "rewriteTextWord",
              "excelFormula",
              "excelAnalysis",
              "excelFormatting",
              "visualizeTableWord"
            ];
            const actionSum = sumPositiveMetricValues(metrics, actionComponentKeys);
            const currentActions = Number(metrics.totalActions || 0);
            const totalActionsResolution = currentDatasetContext
              && currentDatasetContext.metricResolution
              ? currentDatasetContext.metricResolution.totalActions
              : "";
            const metricFallbackCount = currentDatasetContext
              && currentDatasetContext.fallbackStats
              ? Number(currentDatasetContext.fallbackStats.metricIndexFallbacks || 0)
              : 0;
            if (currentActions <= 0 && actionSum > 0) {
              metrics.totalActions = actionSum;
            } else if (
              metricFallbackCount >= 20
              && totalActionsResolution !== "alias"
              && currentActions > 0
              && currentActions <= 1
              && actionSum >= 5
            ) {
              // Under heavy fallback mapping, a tiny totalActions value usually means a shifted column.
              metrics.totalActions = actionSum;
            }

            const hoursCandidates = [
              Number(metrics.meetingHours || 0),
              Number(metrics.meetingHoursTotal || 0),
              Number(metrics.meetingHoursUninterrupted || 0),
              Number(metrics.meetingHoursSmall || 0),
              Number(metrics.meetingHoursMultitasking || 0),
              Number(metrics.meetingHoursConflicting || 0)
            ].filter(value => Number.isFinite(value) && value > 0);
            if ((metrics.assistedHours || 0) <= 0 && hoursCandidates.length) {
              metrics.assistedHours = Math.max(...hoursCandidates);
            }
          }
      
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
            const parsed = parseNumber(rawValue, currentDatasetContext && currentDatasetContext.numberDialect);
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

          function resolveExclusiveMetricGroup(metrics, primaryFields = [], fallbackFields = []) {
            const primaryTotal = sumPositiveMetricValues(metrics, primaryFields);
            if (primaryTotal > 0) {
              return primaryTotal;
            }
            return sumPositiveMetricValues(metrics, fallbackFields);
          }

          function resolveAdditiveDocumentsTotal(metrics) {
            const wordTotal = resolveExclusiveMetricGroup(
              metrics,
              ["wordActions"],
              ["documentSummaries", "draftWord", "rewriteTextWord", "visualizeTableWord"]
            );
            const powerpointTotal = resolveExclusiveMetricGroup(
              metrics,
              ["powerpointActions"],
              ["presentationCreated", "addContentPresentation", "organizePresentation", "summarizePresentation"]
            );
            const excelTotal = resolveExclusiveMetricGroup(
              metrics,
              ["excelActions"],
              ["excelAnalysis", "excelFormula", "excelFormatting"]
            );
            return wordTotal + powerpointTotal + excelTotal;
          }

          const additiveTooltipCategoryConfig = [
            {
              key: "meetings",
              label: categoryLabels.meetings,
              getValue: metrics => sumPositiveMetricValues(metrics, ["meetingRecap", "meetingSummariesTotal", "meetingSummariesActions"])
            },
            {
              key: "emails",
              label: categoryLabels.emails,
              getValue: metrics => sumPositiveMetricValues(metrics, ["outlookActions", "emailDrafts", "emailCoaching", "emailSummaries"])
            },
            {
              key: "chats",
              label: categoryLabels.chats,
              getValue: metrics => sumPositiveMetricValues(metrics, ["teamsActions", "chatCompose", "chatSummaries", "chatConversations"])
            },
            {
              key: "documents",
              label: categoryLabels.documents,
              getValue: metrics => sumPositiveMetricValues(metrics, [
                "wordActions",
                "documentSummaries",
                "draftWord",
                "rewriteTextWord",
                "visualizeTableWord",
                "powerpointActions",
                "presentationCreated",
                "addContentPresentation",
                "organizePresentation",
                "summarizePresentation",
                "excelActions",
                "excelAnalysis",
                "excelFormula",
                "excelFormatting"
              ])
            },
            {
              key: "copilot-chat-work",
              label: categoryLabels["copilot-chat-work"],
              getValue: metrics => resolveExclusiveMetricGroup(
                metrics,
                ["chatPromptsWork"],
                ["chatPromptsWorkTeams", "chatPromptsWorkOutlook"]
              )
            },
            {
              key: "copilot-chat-web",
              label: categoryLabels["copilot-chat-web"],
              getValue: metrics => resolveExclusiveMetricGroup(
                metrics,
                ["chatPromptsWeb"],
                ["chatPromptsWebTeams", "chatPromptsWebOutlook"]
              )
            }
          ];
      
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

          function getAutoHiddenSeriesIds(periods, metric, detailMode = "respect") {
            if (metric !== "actions" || detailMode === "none" || !Array.isArray(periods) || !periods.length) {
              return new Set();
            }
            const totalMax = periods.reduce((max, period) => Math.max(max, Number(period?.totalActions) || 0), 0);
            if (!Number.isFinite(totalMax) || totalMax <= 0) {
              return new Set();
            }
            const threshold = totalMax * 0.15;
            const hidden = new Set();
            chartSeriesDefinitions.forEach(def => {
              if (!def.togglable) {
                return;
              }
              const maxValue = periods.reduce((max, period) => {
                const value = Number(def.getValue(period)) || 0;
                return Math.max(max, value);
              }, 0);
              if (maxValue < threshold) {
                hidden.add(def.id);
              }
            });
            return hidden;
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

          function getDefaultUsageMonthSelection(monthKeys, currentSelection) {
            const availableKeys = Array.isArray(monthKeys) ? monthKeys : [];
            if (!availableKeys.length) {
              return [];
            }
            const selectedKeys = Array.isArray(currentSelection)
              ? availableKeys.filter(key => currentSelection.includes(key))
              : [];
            if (selectedKeys.length) {
              return selectedKeys;
            }
            return availableKeys.length <= 12 ? availableKeys.slice() : availableKeys.slice(-12);
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
            compareToolbar: document.querySelector("[data-compare-toolbar]"),
            compareEnabled: document.querySelector("[data-compare-enabled]"),
            compareSelectors: document.querySelector("[data-compare-selectors]"),
            compareLeft: document.querySelector("[data-compare-left]"),
            compareRight: document.querySelector("[data-compare-right]"),
            compareLeftLabel: document.querySelector("[data-compare-left-label]"),
            compareRightLabel: document.querySelector("[data-compare-right-label]"),
            compareHint: document.querySelector("[data-compare-hint]"),
            compareSection: document.querySelector("[data-compare-section]"),
            compareCaption: document.querySelector("[data-compare-caption]"),
            compareEmpty: document.querySelector("[data-compare-empty]"),
            compareGrid: document.querySelector("[data-compare-grid]"),
            compareCharts: document.querySelector("[data-compare-charts]"),
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
            trendColorToggle: document.querySelector("[data-trend-color-toggle]"),
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
            sampleDatasetSelect: document.querySelector("[data-sample-dataset-select]"),
            dimensionCard: document.querySelector("[data-dimension-card]"),
            dimensionCaption: document.querySelector("[data-dimension-caption]"),
            dimensionSelect: document.querySelector("[data-dimension-select]"),
            dimensionTypeButtons: document.querySelectorAll("[data-dimension-type-button]"),
            dimensionMetricButtons: document.querySelectorAll("[data-dimension-metric-button]"),
            dimensionChartCanvas: document.querySelector("[data-dimension-chart]"),
            dimensionEmpty: document.querySelector("[data-dimension-empty]"),
            dimensionSummaryBody: document.querySelector("[data-dimension-summary]"),
            groupCaption: document.querySelector("[data-group-caption]"),
            groupValueHeader: document.querySelector("[data-group-value-header]"),
            groupBody: document.querySelector("[data-group-body]"),
            viewMoreButton: document.querySelector("[data-view-more]"),
            goalsCard: document.querySelector("[data-goals-card]"),
            goalsCaption: document.querySelector("[data-goals-caption]"),
            goalsExportCsv: document.querySelector("[data-goals-export-csv]"),
            goalMonthNav: document.querySelector("[data-goal-month-nav]"),
            goalMonthPrev: document.querySelector("[data-goal-month-prev]"),
            goalMonthNext: document.querySelector("[data-goal-month-next]"),
            goalMonthLabel: document.querySelector("[data-goal-month-label]"),
            goal1Attainment: document.querySelector("[data-goal1-attainment]"),
            goal1Ratio: document.querySelector("[data-goal1-ratio]"),
            goal1Sustained: document.querySelector("[data-goal1-sustained]"),
            goal1Trend: document.querySelector("[data-goal1-trend]"),
            goal1KpiCompliant: document.querySelector("[data-goal1-kpi-compliant]"),
            goal1KpiTargeted: document.querySelector("[data-goal1-kpi-targeted]"),
            goal1KpiGapUsers: document.querySelector("[data-goal1-kpi-gap-users]"),
            goal1KpiGapPct: document.querySelector("[data-goal1-kpi-gap-pct]"),
            goal1KpiDelta: document.querySelector("[data-goal1-kpi-delta]"),
            goal1MonthlyChartWrap: document.querySelector("[data-goal1-monthly-chart-wrap]"),
            goal1MonthlyChartCanvas: document.querySelector("[data-goal1-monthly-chart]"),
            goal1MonthlyChartNote: document.querySelector("[data-goal1-monthly-chart-note]"),
            goalWeekNav: document.querySelector("[data-goal-week-nav]"),
            goalWeekPrev: document.querySelector("[data-goal-week-prev]"),
            goalWeekNext: document.querySelector("[data-goal-week-next]"),
            goalWeekLabel: document.querySelector("[data-goal-week-label]"),
            goal1WeeklyAttainment: document.querySelector("[data-goal1-weekly-attainment]"),
            goal1WeeklyRatio: document.querySelector("[data-goal1-weekly-ratio]"),
            goal1WeeklyKpiCompliant: document.querySelector("[data-goal1-weekly-kpi-compliant]"),
            goal1WeeklyKpiTargeted: document.querySelector("[data-goal1-weekly-kpi-targeted]"),
            goal1WeeklyKpiGapUsers: document.querySelector("[data-goal1-weekly-kpi-gap-users]"),
            goal1WeeklyKpiGapPct: document.querySelector("[data-goal1-weekly-kpi-gap-pct]"),
            goal1WeeklyKpiDelta: document.querySelector("[data-goal1-weekly-kpi-delta]"),
            goal1WeeklyStatus: document.querySelector("[data-goal1-weekly-status]"),
            goal1WeeklyChartWrap: document.querySelector("[data-goal1-weekly-chart-wrap]"),
            goal1WeeklyChartCanvas: document.querySelector("[data-goal1-weekly-chart]"),
            goal1WeeklyChartNote: document.querySelector("[data-goal1-weekly-chart-note]"),
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
            returningScaleButtons: document.querySelectorAll("[data-returning-scale]"),
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
        setButtonEnabled(dom.goalsExportCsv, false);
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
          const DEFAULT_USAGE_THRESHOLD_MIDDLE = 25;
          const DEFAULT_USAGE_THRESHOLD_HIGH = 50;
          const USAGE_THRESHOLD_VERSION = 2;
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
          const MAX_DATASET_FILE_SIZE = 100 * 1024 * 1024;
          const DATASET_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;
          const CSV_ACCEPTED_MIME_TYPES = new Set(["text/csv", "application/vnd.ms-excel"]);
          const SAMPLE_DATASETS = [
            {
              id: "viva-impact",
              label: "Viva Analytics Copilot Impact",
              url: "samples/viva-analytics-copilot-impact.csv",
              inline: `PersonId,MetricDate,Copilot Enabled User,Copilot assisted hours,Total Copilot actions taken,Organization,CountryOrRegion,Domain
SYN-000001,1/5/25,1,4.8,35,Nordic Advisory Hub,Sweden,nordic.advisory
SYN-000002,1/12/25,1,2.2,19,Cloud Delivery Studio,Norway,cloud.delivery
SYN-000003,1/19/25,1,6.4,52,Data Operations Center,Denmark,data.ops`
            },
            {
              id: "copilot-dashboard-export",
              label: "Copilot Dashboard export",
              url: "samples/copilot-dashboard-export.csv",
              inline: `PersonId,MetricDate,Add content to presentation actions taken,Copilot actions taken in Copilot chat (work),Copilot actions taken in Teams,Copilot actions taken in Word,Days of active Copilot usage in Teams,Days of active Copilot usage in Word,Meeting hours recapped by Copilot,Meetings recapped by Copilot,Total Copilot actions taken,Total Copilot active days,Total Copilot enabled days,Organization,FunctionType
SYN-EXP-00001,11/2/25,1,6,4,2,2,1,1.4,2,18,4,7,AI Productivity Lab,Consulting
SYN-EXP-00002,11/9/25,0,3,1,0,1,0,0.3,1,7,2,7,Workplace Innovation Hub,Sales`
            }
          ];
          const SAMPLE_DATASET_BY_ID = SAMPLE_DATASETS.reduce((accumulator, sample) => {
            accumulator[sample.id] = sample;
            return accumulator;
          }, {});
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
            const active = Number.isFinite(period.adoptionUserCount)
              ? period.adoptionUserCount
              : getPeriodUserCount(period);
            const enabled = Number.isFinite(period.adoptionEnabledUsersCount)
              ? period.adoptionEnabledUsersCount
              : (Number.isFinite(period.enabledUsersCount)
              ? period.enabledUsersCount
              : (period.enabledUsers instanceof Set ? period.enabledUsers.size : 0));
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

          function resolveAdoptionTrendAxisBounds(periods) {
            const values = Array.isArray(periods)
              ? periods
                .map(period => getPeriodAdoptionRate(period))
                .filter(value => Number.isFinite(value))
              : [];
            if (!values.length) {
              return { min: 0, max: 100 };
            }
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            const paddedMin = Math.max(0, Math.floor((minValue - 10) / 10) * 10);
            const paddedMax = Math.min(100, Math.ceil((maxValue + 10) / 10) * 10);
            if (paddedMax <= paddedMin) {
              const fallbackMax = Math.min(100, paddedMin + 20);
              return {
                min: Math.max(0, fallbackMax - 20),
                max: fallbackMax
              };
            }
            return { min: paddedMin, max: paddedMax };
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

          function formatSignedActionDelta(value) {
            const numeric = Number.isFinite(value) ? Math.round(value) : 0;
            if (numeric === 0) {
              return "0";
            }
            return `${numeric > 0 ? "+" : "-"}${numberFormatter.format(Math.abs(numeric))}`;
          }

          function formatCurrentAndDelta(value, previousValue, formatter) {
            const currentValue = Number.isFinite(value) ? value : 0;
            const previous = Number.isFinite(previousValue) ? previousValue : 0;
            const format = typeof formatter === "function"
              ? formatter
              : (v => numberFormatter.format(Math.round(v)));
            return `${format(currentValue)} (${formatSignedActionDelta(currentValue - previous)})`;
          }

          function buildAdditiveActionTooltipLines(period, previousPeriod) {
            if (!period || state.filters.metric !== "actions" || state.trendView === "average") {
              return [];
            }
            const currentCategories = period.additiveCategories && typeof period.additiveCategories === "object"
              ? period.additiveCategories
              : {};
            const previousCategories = previousPeriod && previousPeriod.additiveCategories && typeof previousPeriod.additiveCategories === "object"
              ? previousPeriod.additiveCategories
              : {};
            const lines = [];
            let totalDeltaFromGroups = 0;
            additiveTooltipCategoryConfig.forEach(entry => {
              const currentValue = Number(currentCategories[entry.key] || 0);
              const previousValue = Number(previousCategories[entry.key] || 0);
              const delta = currentValue - previousValue;
              totalDeltaFromGroups += delta;
              lines.push(`${entry.label}: ${formatCurrentAndDelta(currentValue, previousValue)}`);
            });
            const totalActions = Number(period.totalActions || 0);
            const previousTotalActions = Number(previousPeriod?.totalActions || 0);
            const totalDelta = totalActions - previousTotalActions;
            const otherDelta = totalDelta - totalDeltaFromGroups;
            if (otherDelta !== 0) {
              lines.push(`Other: ${formatSignedActionDelta(otherDelta)}`);
            }
            return lines;
          }

          function getHoveredTrendDatasetId() {
            return state.hoveredTrendDatasetId;
          }

          function getHoveredCompareDatasetLabel() {
            return state.hoveredCompareDatasetLabel;
          }

          function createTrendChartOptions(getPeriods = () => state.latestTrendPeriods, includeAdditiveActionBreakdown = true, chartScope = "main") {
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
                      const datasetId = context.dataset?.__copilotDefinitionId || null;
                      const hoveredTrendDatasetId = getHoveredTrendDatasetId();
                      const hoveredCompareDatasetLabel = getHoveredCompareDatasetLabel();
                      if (state.filters.metric === "actions" && state.trendView !== "average") {
                        if (chartScope === "main") {
                          if (hoveredTrendDatasetId === "total") {
                            if (datasetId === "total") {
                              const periods = typeof getPeriods === "function" ? getPeriods() : [];
                              const period = periods[context.dataIndex];
                              const previousPeriod = context.dataIndex > 0 ? periods[context.dataIndex - 1] : null;
                              const totalActions = Number(period?.totalActions || 0);
                              const previousTotalActions = Number(previousPeriod?.totalActions || 0);
                              return `Total actions: ${formatCurrentAndDelta(totalActions, previousTotalActions)}`;
                            }
                            if (datasetId === "enabled-users") {
                              const periods = typeof getPeriods === "function" ? getPeriods() : [];
                              const period = periods[context.dataIndex];
                              const previousPeriod = context.dataIndex > 0 ? periods[context.dataIndex - 1] : null;
                              const enabledCount = Number(period?.enabledUsersCount || 0);
                              const previousEnabled = Number(previousPeriod?.enabledUsersCount || 0);
                              return `Enabled users: ${formatCurrentAndDelta(enabledCount, previousEnabled)}`;
                            }
                            return "";
                          }
                          if (hoveredTrendDatasetId && datasetId !== hoveredTrendDatasetId) {
                            return "";
                          }
                          if (datasetId && datasetId !== "enabled-users") {
                            const currentValue = Number(context.parsed?.y || 0);
                            const previousValue = context.dataIndex > 0 ? Number(context.dataset?.data?.[context.dataIndex - 1] || 0) : 0;
                            return `${context.dataset.label}: ${formatCurrentAndDelta(currentValue, previousValue)}`;
                          }
                          return "";
                        }
                        if (chartScope === "compare") {
                          if (hoveredCompareDatasetLabel && context.dataset?.label !== hoveredCompareDatasetLabel) {
                            return "";
                          }
                          const currentValue = Number(context.parsed?.y || 0);
                          const previousValue = context.dataIndex > 0 ? Number(context.dataset?.data?.[context.dataIndex - 1] || 0) : 0;
                          return `${context.dataset.label}: ${formatCurrentAndDelta(currentValue, previousValue)}`;
                        }
                      }
                      const datasetLabel = context.dataset && context.dataset.label ? context.dataset.label : "Value";
                      const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                      const formattedValue = formatTrendTooltipValue(value);
                      const unit = state.filters.metric === "adoption" ? "" : getTrendUnitLabel();
                      return unit ? `${datasetLabel}: ${formattedValue} ${unit}` : `${datasetLabel}: ${formattedValue}`;
                    },
                    afterBody: contexts => {
                      if (!Array.isArray(contexts) || !contexts.length) {
                        return;
                      }
                      const index = contexts[0]?.dataIndex;
                      if (index == null) {
                        return;
                      }
                      const periods = typeof getPeriods === "function" ? getPeriods() : [];
                      const period = periods[index];
                      if (!period) {
                        return;
                      }
                      const previousPeriod = index > 0 ? periods[index - 1] : null;
                      if (chartScope === "main" && includeAdditiveActionBreakdown && state.filters.metric === "actions" && state.trendView !== "average" && getHoveredTrendDatasetId() === "total") {
                        return buildAdditiveActionTooltipLines(period, previousPeriod);
                      }
                      if (state.trendView === "average") {
                        const enabled = Number.isFinite(period.enabledUsersCount) ? period.enabledUsersCount : 0;
                        return [`Enabled users: ${numberFormatter.format(enabled)}`];
                      }
                      return [];
                    }
                  }
                }
              },
              interaction: {
                mode: "index",
                intersect: false
              },
              onHover: (event, elements, chart) => {
                if (chartScope === "main") {
                  const nearest = chart?.getElementsAtEventForMode?.(event, "nearest", { intersect: false }, false) || [];
                  const first = nearest.length ? nearest[0] : (Array.isArray(elements) && elements.length ? elements[0] : null);
                  const dataset = first ? chart?.data?.datasets?.[first.datasetIndex] : null;
                  state.hoveredTrendDatasetId = dataset?.__copilotDefinitionId || null;
                } else if (chartScope === "compare") {
                  const nearest = chart?.getElementsAtEventForMode?.(event, "nearest", { intersect: false }, false) || [];
                  const first = nearest.length ? nearest[0] : (Array.isArray(elements) && elements.length ? elements[0] : null);
                  const dataset = first ? chart?.data?.datasets?.[first.datasetIndex] : null;
                  state.hoveredCompareDatasetLabel = dataset?.label || null;
                }
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
            options: createTrendChartOptions(() => state.latestTrendPeriods, true, "main")
          });

          const compareTrendOverlayCtx = document.getElementById("compareTrendChartOverlay")?.getContext("2d");
          if (compareTrendOverlayCtx) {
            state.charts.compareOverlay = new Chart(compareTrendOverlayCtx, {
              type: "line",
              data: {
                labels: [],
                datasets: []
              },
              options: createTrendChartOptions(() => state.latestTrendPeriods, false, "compare")
            });
          }
      
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
            const lineColor = getCssVariableValue("--green-600", "#008A00");
            const fillColor = hexToRgba(colorStringToHex(lineColor) || "#008A00", 0.15) || "rgba(0, 138, 0, 0.15)";
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
                onClick: (_event, elements, chart) => {
                  if (!elements || !elements.length) {
                    return;
                  }
                  const selectedIndex = elements[0].index;
                  const selectedKey = chart?.data?.datasets?.[0]?.keys?.[selectedIndex];
                  const interval = state.returningInterval === "monthly" ? "monthly" : "weekly";
                  if (!selectedKey) {
                    return;
                  }
                  state.returningSelection[interval] = selectedKey;
                  if (state.latestReturningAggregates) {
                    updateReturningUsers(state.latestReturningAggregates);
                  }
                },
                interaction: {
                  mode: "index",
                  intersect: false
                }
              }
            });
          }

          const goal1MonthlyChartCtx = dom.goal1MonthlyChartCanvas?.getContext("2d");
          if (goal1MonthlyChartCtx) {
            const axisTickColor = getCssVariableValue("--text-muted", "#4D575D");
            const axisGridColor = getCssVariableValue("--grid-color", "rgba(153, 208, 153, 0.18)");
            const lineColor = getCssVariableValue("--green-600", "#008A00");
            const lineFill = hexToRgba(colorStringToHex(lineColor) || "#008A00", 0.14) || "rgba(0,138,0,0.14)";
            state.charts.goal1Monthly = new Chart(goal1MonthlyChartCtx, {
              type: "line",
              data: {
                labels: [],
                datasets: [
                  {
                    label: "Monthly compliant reach",
                    data: [],
                    borderColor: lineColor,
                    backgroundColor: lineFill,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#ffffff",
                    pointBorderColor: lineColor,
                    borderWidth: 2,
                    tension: 0.25,
                    fill: "origin"
                  },
                  {
                    label: "Target (100%)",
                    data: [],
                    borderColor: hexToRgba(colorStringToHex(getCssVariableValue("--grey-400", "#71797d")) || "#71797d", 0.6),
                    borderWidth: 1.5,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                  padding: {
                    top: 8
                  }
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: axisTickColor }
                  },
                  y: {
                    beginAtZero: true,
                    suggestedMax: 100,
                    max: 100,
                    grid: {
                      color: axisGridColor,
                      drawBorder: false
                    },
                    ticks: {
                      color: axisTickColor,
                      callback: value => `${Number(value).toFixed(0)}%`
                    }
                  }
                },
                plugins: {
                  legend: {
                    display: true,
                    position: "top",
                    labels: {
                      usePointStyle: true,
                      pointStyle: "line"
                    }
                  },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: true,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        if (context.datasetIndex === 1) {
                          return "Target: 100%";
                        }
                        return `${value.toFixed(1)}% compliant reach`;
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

          const goal1WeeklyChartCtx = dom.goal1WeeklyChartCanvas?.getContext("2d");
          if (goal1WeeklyChartCtx) {
            const lineColor = getCssVariableValue("--green-600", "#008A00");
            const lineFill = hexToRgba(colorStringToHex(lineColor) || "#008A00", 0.14) || "rgba(0,138,0,0.14)";
            state.charts.goal1Weekly = new Chart(goal1WeeklyChartCtx, {
              type: "line",
              data: {
                labels: [],
                datasets: [
                  {
                    label: "Weekly adoption progress",
                    data: [],
                    borderColor: lineColor,
                    backgroundColor: lineFill,
                    pointRadius: 2.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#ffffff",
                    pointBorderColor: lineColor,
                    borderWidth: 2.5,
                    tension: 0.25,
                    fill: "origin"
                  },
                  {
                    label: "Target (100%)",
                    data: [],
                    borderColor: hexToRgba(colorStringToHex(getCssVariableValue("--grey-400", "#71797d")) || "#71797d", 0.6),
                    borderWidth: 1.5,
                    borderDash: [6, 6],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    display: false
                  },
                  y: {
                    beginAtZero: true,
                    suggestedMax: 100,
                    max: 100,
                    display: false
                  }
                },
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    backgroundColor: "rgba(31, 35, 37, 0.92)",
                    titleColor: "#ffffff",
                    bodyColor: "#ffffff",
                    padding: 10,
                    cornerRadius: 10,
                    displayColors: true,
                    callbacks: {
                      label: context => {
                        const value = Number.isFinite(context.parsed.y) ? context.parsed.y : 0;
                        if (context.datasetIndex === 1) {
                          return "Target: 100%";
                        }
                        return `${value.toFixed(1)}% compliant reach`;
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
              state.charts.enabledLicenses,
              state.charts.goal1Monthly,
              state.charts.goal1Weekly
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
            if (dom.trendColorToggle) {
              dom.trendColorToggle.hidden = !isVisible;
              if (!isVisible) {
                if (dom.trendColorControls) {
                  dom.trendColorControls.hidden = true;
                }
                dom.trendColorToggle.setAttribute("aria-expanded", "false");
              }
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

          if (dom.trendColorToggle) {
            dom.trendColorToggle.addEventListener("click", () => {
              const isOpen = dom.trendColorControls && !dom.trendColorControls.hidden;
              if (dom.trendColorControls) {
                dom.trendColorControls.hidden = isOpen;
              }
              dom.trendColorToggle.setAttribute("aria-expanded", String(!isOpen));
            });
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

          populateSampleDatasetSelect();

          if (dom.sampleDatasetSelect) {
            dom.sampleDatasetSelect.addEventListener("change", () => {
              if (!dom.sampleDatasetSelect.value) {
                return;
              }
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

          if (dom.compareEnabled) {
            dom.compareEnabled.addEventListener("change", () => {
              state.compare.enabled = Boolean(dom.compareEnabled.checked);
              if (!state.compare.enabled) {
                state.compare.left = "";
                state.compare.right = "";
              }
              updateCompareFilterLockState();
              renderDashboard();
            });
          }

          if (dom.compareLeft) {
            dom.compareLeft.addEventListener("change", () => {
              state.compare.left = dom.compareLeft.value || "";
              if (state.compare.left && state.compare.left === state.compare.right) {
                state.compare.right = "";
              }
              renderDashboard();
            });
          }

          if (dom.compareRight) {
            dom.compareRight.addEventListener("change", () => {
              state.compare.right = dom.compareRight.value || "";
              if (state.compare.right && state.compare.right === state.compare.left) {
                state.compare.left = "";
              }
              renderDashboard();
            });
          }
      
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

          if (dom.returningScaleButtons && dom.returningScaleButtons.length) {
            dom.returningScaleButtons.forEach(button => {
              button.addEventListener("click", () => {
                const scaleMode = button.dataset.returningScale === "full" ? "full" : "smart";
                if (state.returningScaleMode === scaleMode) {
                  return;
                }
                state.returningScaleMode = scaleMode;
                updateReturningScaleToggleState();
                if (state.latestReturningAggregates) {
                  updateReturningUsers(state.latestReturningAggregates);
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
                ? "Encrypted snapshots let trusted colleagues reopen this view without sharing raw files."
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
              usageThresholdVersion: USAGE_THRESHOLD_VERSION,
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
              "- For best results, ensure Chart.js and other CDN domains are allowed by your tenant CSP.",
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
            const [cssBytes, jsBytes, vendorBytes] = await Promise.all([
              resolveAssetBytes(null, "assets/copilot-dashboard.css"),
              resolveAssetBytes(null, "assets/copilot-dashboard.js"),
              resolveAssetBytes(null, "assets/vendor/fflate.min.js")
            ]);
            const files = [
              { name: "index.html", data: encoder.encode(bundleHtml) },
              { name: "assets/copilot-dashboard.css", data: cssBytes },
              { name: "assets/copilot-dashboard.js", data: jsBytes },
              { name: "assets/vendor/fflate.min.js", data: vendorBytes },
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
            const snapshotUsageThresholdVersion = Number(snapshot.usageThresholdVersion);
            const hasUsageThresholdVersion = Number.isFinite(snapshotUsageThresholdVersion) && snapshotUsageThresholdVersion >= 1;
            if (!hasUsageThresholdVersion && state.usageThresholds.middle === 17 && state.usageThresholds.high === 35) {
              state.usageThresholds.middle = DEFAULT_USAGE_THRESHOLD_MIDDLE;
              state.usageThresholds.high = DEFAULT_USAGE_THRESHOLD_HIGH;
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
                dom.uploadStatus.textContent = lastDatasetDetectionSummary
                  ? `Dataset loaded. Detected ${lastDatasetDetectionSummary}. Opt in above to save it on this device.`
                  : "Dataset loaded. Opt in above to save it on this device.";
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
            setDatasetMessage("Upload a valid CSV export to continue.");
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

          function setDatasetMessage(message) {
            if (!dom.datasetMessage) {
              return;
            }
            const text = typeof message === "string" ? message.trim() : "";
            dom.datasetMessage.textContent = text;
            dom.datasetMessage.hidden = !text;
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
            setDatasetMessage("Parsing in progress...");
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
            if (!silent) {
              setDatasetMessage("Upload canceled. Select a CSV to try again.");
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
            const datasetContext = meta.datasetContext || currentDatasetContext;
            const datasetContextDescription = describeDatasetContext(datasetContext);
            lastDatasetDetectionSummary = datasetContextDescription || "";
            currentCsvFieldLookup = null;
            currentDatasetContext = null;
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
              const baseStatus = meta.loadedFromStorage
                ? "Saved dataset loaded."
                : `Loaded ${rowCountText} rows${notesText}.`;
              dom.uploadStatus.textContent = datasetContextDescription
                ? `${baseStatus} Detected ${datasetContextDescription}.`
                : baseStatus;
            }
      
            setDatasetMessage("");
      
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
          }
      
          function parseCsvTextContent(csvText, meta = {}) {
            currentCsvFieldLookup = null;
            currentDatasetContext = null;
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
                ensureDatasetFieldLookup(results?.meta?.fields, raw ? [raw] : []);
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
                currentCsvFieldLookup = null;
                currentDatasetContext = null;
                dom.uploadStatus.textContent = `Saved dataset could not be loaded (${message}).`;
                setDatasetMessage("Stored dataset was cleared. Load a CSV to continue.");
                dom.datasetMetaWrapper.hidden = true;
                clearStoredDataset({ quiet: true });
              },
              complete: () => {
                if (!parsedRows.length) {
                  currentCsvFieldLookup = null;
                  currentDatasetContext = null;
                  dom.uploadStatus.textContent = "Saved dataset was empty or unreadable.";
                  setDatasetMessage("Stored dataset was cleared. Load a CSV to continue.");
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
                const datasetContext = currentDatasetContext;
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
                  savedMeta: savedMetaPayload || undefined,
                  datasetContext
                });

                if (state.datasetCachingDisabled) {
                  bufferedCsvText = null;
                  clearRememberedDataset();
                  updateStoredDatasetControls(null);
                  if (dom.uploadStatus) {
                    const detected = describeDatasetContext(datasetContext);
                    dom.uploadStatus.textContent = `Dataset loaded (${formatFileSize(runtimeMeta.size)}). ${getDatasetCacheLimitMessage()}${detected ? ` Detected ${detected}.` : ""}`;
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
            currentDatasetContext = null;
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
              ensureDatasetFieldLookup(null, raw ? [raw] : []);
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
            const datasetContext = currentDatasetContext;
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
              rows: accumulators.parsedRows.length,
              datasetContext
            });
            state.datasetSizeBytes = runtimeMeta.size;
            state.datasetCachingDisabled = datasetExceedsCacheLimit(runtimeMeta.size);
            if (state.datasetCachingDisabled) {
              bufferedCsvText = null;
              if (dom.uploadStatus) {
                const detected = describeDatasetContext(datasetContext);
                dom.uploadStatus.textContent = `Dataset loaded (${formatFileSize(runtimeMeta.size)}). ${getDatasetCacheLimitMessage()}${detected ? ` Detected ${detected}.` : ""}`;
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
              currentDatasetContext = null;
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
                  ensureDatasetFieldLookup(results?.meta?.fields, rows);
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

          function populateSampleDatasetSelect() {
            if (!dom.sampleDatasetSelect) {
              return;
            }
            const currentValue = dom.sampleDatasetSelect.value;
            dom.sampleDatasetSelect.innerHTML = "";
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Load sample dataset...";
            dom.sampleDatasetSelect.append(placeholder);
            SAMPLE_DATASETS.forEach(sample => {
              const option = document.createElement("option");
              option.value = sample.id;
              option.textContent = sample.label;
              dom.sampleDatasetSelect.append(option);
            });
            if (!SAMPLE_DATASETS.length) {
              dom.sampleDatasetSelect.disabled = true;
              return;
            }
            dom.sampleDatasetSelect.disabled = false;
            const currentExists = Boolean(currentValue && SAMPLE_DATASET_BY_ID[currentValue]);
            dom.sampleDatasetSelect.value = currentExists ? currentValue : "";
          }

          function chooseSampleDataset() {
            if (dom.sampleDatasetSelect) {
              const selectedId = dom.sampleDatasetSelect.value;
              if (selectedId && SAMPLE_DATASET_BY_ID[selectedId]) {
                return SAMPLE_DATASET_BY_ID[selectedId];
              }
            }
            return null;
          }

          function loadSampleDataset() {
            const selectedSample = chooseSampleDataset();
            if (!selectedSample) {
              if (dom.uploadStatus) {
                dom.uploadStatus.textContent = "Choose a sample dataset to load.";
              }
              return;
            }
            clearUploadError();
            cancelActiveParse({ silent: true });
            if (dom.uploadMeta) {
              dom.uploadMeta.textContent = selectedSample.label;
            }
            if (dom.uploadStatus) {
              dom.uploadStatus.textContent = `Loading sample dataset: ${selectedSample.label}...`;
            }
            const parseSample = (csvText, label) => {
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
              if (typeof selectedSample.inline === "string" && selectedSample.inline.trim().length) {
                bufferedSampleCsvById.set(selectedSample.id, selectedSample.inline);
                parseSample(selectedSample.inline, selectedSample.label);
                return true;
              }
              return false;
            };
            const cached = bufferedSampleCsvById.get(selectedSample.id);
            if (cached) {
              parseSample(cached, selectedSample.label);
              return;
            }
            startUploadProgress({ name: selectedSample.label });
            if (window.location && window.location.protocol === "file:") {
              if (!useInlineSample()) {
                finishUploadProgress(null);
                showUploadError("Sample dataset is unavailable in offline mode.");
              }
              return;
            }
            fetch(selectedSample.url, { cache: "no-store" }).then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              return response.text();
            }).then(csvText => {
              bufferedSampleCsvById.set(selectedSample.id, csvText);
              parseSample(csvText, selectedSample.label);
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
              if (window.localStorage) {
                const raw = localStorage.getItem(FILTER_PREFERENCES_KEY);
                if (!raw) {
                  return null;
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
              if (window.localStorage) {
                localStorage.setItem(FILTER_PREFERENCES_KEY, JSON.stringify(preferences));
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
            const metricDateValue = getIdentityValue(raw, "metricDate");
            const date = parseMetricDate(metricDateValue, currentDatasetContext && currentDatasetContext.dateDialect);
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
            applyDerivedMetricFallbacks(metrics);
            applyDerivedEnablementMetrics(metrics);
            return {
              personId: sanitizeLabel(getIdentityValue(raw, "personId")) || "Unknown",
              organization: sanitizeLabel(getIdentityValue(raw, "organization")) || "Unspecified",
              country: sanitizeLabel(getIdentityValue(raw, "country")) || "Unspecified",
              domain: sanitizeLabel(getIdentityValue(raw, "domain")) || "Unspecified",
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
            AGENT_HUB_TYPES.forEach(type => updateAgentHubMetrics(type));
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
            updateAgentHubMetrics(type);
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

          function setAgentHubTabBadge(type, count) {
            const badge = document.querySelector(`[data-agent-tab-badge="${type}"]`);
            if (!badge) {
              return;
            }
            const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
            badge.textContent = numberFormatter.format(safeCount);
          }

          function setAgentHubKpiValue(key, value) {
            const node = document.querySelector(`[data-agent-kpi="${key}"]`);
            if (!node) {
              return;
            }
            node.textContent = value;
          }

          function formatAgentHubAverage(value) {
            if (!Number.isFinite(value)) {
              return "-";
            }
            const rounded = Number(value.toFixed(1));
            if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
              return numberFormatter.format(Math.round(rounded));
            }
            return rounded.toFixed(1);
          }

          function updateAgentHubMetrics(type) {
            const dataset = state.agentHub?.datasets?.[type];
            const rows = dataset && Array.isArray(dataset.rows) ? dataset.rows : [];
            setAgentHubTabBadge(type, rows.length);

            if (type === "users") {
              if (!rows.length) {
                setAgentHubKpiValue("users-total", "-");
                setAgentHubKpiValue("users-avg", "-");
                setAgentHubKpiValue("users-top", "-");
                setAgentHubKpiValue("users-responses", "-");
                return;
              }
              let totalAgentCount = 0;
              let totalResponses = 0;
              let topRow = null;
              rows.forEach(row => {
                const agentCount = Number.isFinite(row.agentCount) ? row.agentCount : 0;
                const responses = Number.isFinite(row.responses) ? row.responses : 0;
                totalAgentCount += agentCount;
                totalResponses += responses;
                if (!topRow) {
                  topRow = row;
                  return;
                }
                const topResponses = Number.isFinite(topRow.responses) ? topRow.responses : 0;
                const topAgentCount = Number.isFinite(topRow.agentCount) ? topRow.agentCount : 0;
                if (responses > topResponses || (responses === topResponses && agentCount > topAgentCount)) {
                  topRow = row;
                }
              });
              const topUser = topRow ? (sanitizeLabel(topRow.displayName) || sanitizeLabel(topRow.username) || "-") : "-";
              setAgentHubKpiValue("users-total", numberFormatter.format(rows.length));
              setAgentHubKpiValue("users-avg", formatAgentHubAverage(totalAgentCount / rows.length));
              setAgentHubKpiValue("users-top", topUser);
              setAgentHubKpiValue("users-responses", numberFormatter.format(Math.round(totalResponses)));
              return;
            }

            if (type === "agents") {
              if (!rows.length) {
                setAgentHubKpiValue("agents-total", "-");
                setAgentHubKpiValue("agents-avg", "-");
                setAgentHubKpiValue("agents-top", "-");
                setAgentHubKpiValue("agents-responses", "-");
                return;
              }
              let totalResponses = 0;
              let totalActive = 0;
              let topRow = null;
              const uniqueAgents = new Set();
              rows.forEach(row => {
                const activeLicensed = Number.isFinite(row.activeLicensed) ? row.activeLicensed : 0;
                const activeUnlicensed = Number.isFinite(row.activeUnlicensed) ? row.activeUnlicensed : 0;
                const responses = Number.isFinite(row.responses) ? row.responses : 0;
                const active = activeLicensed + activeUnlicensed;
                totalActive += active;
                totalResponses += responses;
                const agentKey = sanitizeLabel(row.agentId) || sanitizeLabel(row.agentName);
                if (agentKey) {
                  uniqueAgents.add(agentKey);
                }
                if (!topRow) {
                  topRow = row;
                  return;
                }
                const topResponses = Number.isFinite(topRow.responses) ? topRow.responses : 0;
                const topActive = (Number.isFinite(topRow.activeLicensed) ? topRow.activeLicensed : 0)
                  + (Number.isFinite(topRow.activeUnlicensed) ? topRow.activeUnlicensed : 0);
                if (responses > topResponses || (responses === topResponses && active > topActive)) {
                  topRow = row;
                }
              });
              const topAgent = topRow ? (sanitizeLabel(topRow.agentName) || sanitizeLabel(topRow.agentId) || "-") : "-";
              const totalAgents = uniqueAgents.size || rows.length;
              setAgentHubKpiValue("agents-total", numberFormatter.format(totalAgents));
              setAgentHubKpiValue("agents-avg", formatAgentHubAverage(totalActive / rows.length));
              setAgentHubKpiValue("agents-top", topAgent);
              setAgentHubKpiValue("agents-responses", numberFormatter.format(Math.round(totalResponses)));
              return;
            }

            if (type === "combined") {
              if (!rows.length) {
                setAgentHubKpiValue("combined-total", "-");
                setAgentHubKpiValue("combined-agents", "-");
                setAgentHubKpiValue("combined-users", "-");
                setAgentHubKpiValue("combined-responses", "-");
                return;
              }
              let totalResponses = 0;
              const uniqueAgents = new Set();
              const uniqueUsers = new Set();
              rows.forEach(row => {
                const responses = Number.isFinite(row.responses) ? row.responses : 0;
                totalResponses += responses;
                const agentKey = sanitizeLabel(row.agentId) || sanitizeLabel(row.agentName);
                if (agentKey) {
                  uniqueAgents.add(agentKey);
                }
                const userKey = sanitizeLabel(row.username);
                if (userKey) {
                  uniqueUsers.add(userKey);
                }
              });
              setAgentHubKpiValue("combined-total", numberFormatter.format(rows.length));
              setAgentHubKpiValue("combined-agents", numberFormatter.format(uniqueAgents.size));
              setAgentHubKpiValue("combined-users", numberFormatter.format(uniqueUsers.size));
              setAgentHubKpiValue("combined-responses", numberFormatter.format(Math.round(totalResponses)));
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
            updateAgentHubMetrics(type);
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
            updateReturningScaleToggleState();
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
              renderGoalCards(null);
              updateAgentUsageCard(state.agentUsageRows);
              state.latestTrendPeriods = [];
              state.latestGroupData = null;
              state.latestTopUsers = [];
              state.latestReturningAggregates = null;
              state.latestAdoption = null;
              state.latestActiveDays = null;
              state.latestGoalMetrics = null;
              state.goalMonthSelection = null;
              state.goalWeekSelection = null;
              state.latestEnabledTimeline = [];
              state.latestPerAppActions = [];
              state.groupsExpanded = false;
              state.topUsersExpanded = false;
              state.topUsersPanelOpen = false;
              renderCompareSection([]);
              updateExportDetailOption();
              setTrendColorControlsVisibility(false);
              if (dom.seriesModeToggle) {
                dom.seriesModeToggle.disabled = true;
                dom.seriesModeToggle.classList.add("is-disabled");
              }
              return;
            }
      
            const compareBaseRows = applyFilters(state.rows, { ignoreCompareDimension: true });
            const filtered = applyFilters(state.rows);
            if (state.filters.timeframe === "custom" && state.filters.customRangeInvalid) {
              handleInvalidCustomRange();
              renderCompareSection([]);
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
              renderGoalCards(null);
              state.latestTrendPeriods = [];
              state.latestGroupData = null;
              state.latestTopUsers = [];
              state.latestReturningAggregates = null;
              state.latestAdoption = null;
              state.latestActiveDays = null;
              state.latestGoalMetrics = null;
              state.goalMonthSelection = null;
              state.goalWeekSelection = null;
              state.latestEnabledTimeline = [];
              state.groupsExpanded = false;
              state.topUsersExpanded = false;
              renderCompareSection(compareBaseRows);
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
            const summaryActiveUsers = aggregates.actionActiveUsers instanceof Set
              ? aggregates.actionActiveUsers.size
              : aggregates.activeUsers.size;
            dom.summaryUsers.textContent = numberFormatter.format(summaryActiveUsers);
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
            const activeUserCount = summaryActiveUsers;
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
            state.latestGoalMetrics = computeGoalMetrics(filtered, state.filters);
            updateGroupTable(state.latestGroupData.groups, state.latestGroupData.totalMetricValue);
            buildTopUsersList(state.latestTopUsers);
            updateCategoryCards(aggregates.categoryTotals);
            updateAdoptionByApp(state.latestAdoption);
            renderCompareSection(compareBaseRows);
            updateUsageIntensity(aggregates);
            updateEnabledLicensesChart(state.latestEnabledTimeline);
            updateReturningUsers(state.latestReturningAggregates);
            updateActiveDaysCard(state.latestActiveDays);
            renderGoalCards(state.latestGoalMetrics);
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

          function getCompareDimensionKey() {
            return state.filters.group === "country"
              ? "country"
              : (state.filters.group === "domain" ? "domain" : "organization");
          }

          function getCompareDimensionLabel() {
            const key = getCompareDimensionKey();
            if (key === "country") {
              return "Region";
            }
            if (key === "domain") {
              return "Domain";
            }
            return "Organization";
          }

          function getCompareDimensionSourceKey() {
            const compareDimension = getCompareDimensionKey();
            if (compareDimension === "country") {
              return state.filterFields.country;
            }
            if (compareDimension === "domain") {
              return "domain";
            }
            return state.filterFields.organization;
          }

          function resolveCompareSegmentValue(row) {
            const compareDimension = getCompareDimensionKey();
            if (compareDimension === "country") {
              return resolveSegmentValue(row, state.filterFields.country);
            }
            if (compareDimension === "domain") {
              return resolveSegmentValue(row, "domain");
            }
            return resolveSegmentValue(row, state.filterFields.organization);
          }

          function shouldIgnoreFilterForCompare(filterType, options = {}) {
            const compareDimension = getCompareDimensionKey();
            if (options.ignoreCompareDimension === true) {
              return filterType === compareDimension;
            }
            return Boolean(state.compare.enabled) && filterType === compareDimension;
          }

          function getComparePanelElements(side) {
            const panel = document.querySelector(`[data-compare-panel="${side}"]`);
            if (!panel) {
              return null;
            }
            return {
              panel,
              title: panel.querySelector(`[data-compare-title="${side}"]`),
              subtitle: panel.querySelector(`[data-compare-subtitle="${side}"]`),
              window: panel.querySelector(`[data-compare-window="${side}"]`),
              summaryActions: panel.querySelector(`[data-compare-summary-actions="${side}"]`),
              summaryActionsNote: panel.querySelector(`[data-compare-summary-actions-note="${side}"]`),
              summaryHours: panel.querySelector(`[data-compare-summary-hours="${side}"]`),
              summaryHoursNote: panel.querySelector(`[data-compare-summary-hours-note="${side}"]`),
              summaryUsers: panel.querySelector(`[data-compare-summary-users="${side}"]`),
              summaryUsersNote: panel.querySelector(`[data-compare-summary-users-note="${side}"]`),
              latestPeriod: panel.querySelector(`[data-compare-summary-latest-period="${side}"]`),
              latestMetric: panel.querySelector(`[data-compare-summary-latest-metric="${side}"]`),
              latestNote: panel.querySelector(`[data-compare-summary-latest-note="${side}"]`)
            };
          }

          function getCompareChartElements() {
            return {
              card: document.querySelector("[data-compare-chart-card]"),
              title: document.querySelector("[data-compare-chart-title]"),
              caption: document.querySelector("[data-compare-chart-caption]"),
              window: document.querySelector("[data-compare-chart-window]"),
              empty: document.querySelector("[data-compare-trend-empty]")
            };
          }

          function setComparePanelPlaceholder(side, title, message) {
            const refs = getComparePanelElements(side);
            if (!refs) {
              return;
            }
            if (refs.title) {
              refs.title.textContent = title;
            }
            if (refs.subtitle) {
              refs.subtitle.textContent = message;
            }
            if (refs.window) {
              refs.window.textContent = "-";
            }
            if (refs.summaryActions) {
              refs.summaryActions.textContent = "-";
            }
            if (refs.summaryActionsNote) {
              refs.summaryActionsNote.textContent = message;
            }
            if (refs.summaryHours) {
              refs.summaryHours.textContent = "-";
            }
            if (refs.summaryHoursNote) {
              refs.summaryHoursNote.textContent = message;
            }
            if (refs.summaryUsers) {
              refs.summaryUsers.textContent = "-";
            }
            if (refs.summaryUsersNote) {
              refs.summaryUsersNote.textContent = message;
            }
            if (refs.latestPeriod) {
              refs.latestPeriod.textContent = "-";
            }
            if (refs.latestMetric) {
              refs.latestMetric.textContent = "";
            }
            if (refs.latestNote) {
              refs.latestNote.textContent = message;
            }
          }

          function getSummaryActiveUserCount(aggregates) {
            if (aggregates?.actionActiveUsers instanceof Set) {
              return aggregates.actionActiveUsers.size;
            }
            return aggregates?.activeUsers instanceof Set ? aggregates.activeUsers.size : 0;
          }

          function formatLatestMetricForAggregates(aggregates) {
            const latestPeriod = aggregates?.latestWeek;
            if (!latestPeriod) {
              return { periodLabel: null, metricValue: null, note: "No latest period available." };
            }
            let metricValue = null;
            if (state.filters.metric === "hours") {
              metricValue = `${hoursFormatter.format(latestPeriod.assistedHours || 0)} hrs`;
            } else if (state.filters.metric === "adoption") {
              metricValue = `${formatTrendFixed(getPeriodAdoptionRate(latestPeriod), 1)}%`;
            } else {
              metricValue = numberFormatter.format(Math.round(latestPeriod.totalActions || 0));
            }
            const delta = aggregates.previousWeek
              ? state.filters.metric === "hours"
                ? (latestPeriod.assistedHours || 0) - (aggregates.previousWeek.assistedHours || 0)
                : state.filters.metric === "adoption"
                  ? getPeriodAdoptionRate(latestPeriod) - getPeriodAdoptionRate(aggregates.previousWeek)
                  : (latestPeriod.totalActions || 0) - (aggregates.previousWeek.totalActions || 0)
              : null;
            const note = delta == null
              ? "No prior period available."
              : state.filters.metric === "hours"
                ? `Change vs prior period: ${hoursFormatter.format(delta)} hrs`
                : state.filters.metric === "adoption"
                  ? `Change vs prior period: ${formatTrendFixed(delta, 1)} pp`
                  : `Change vs prior period: ${numberFormatter.format(Math.round(delta))}`;
            return {
              periodLabel: latestPeriod.label || null,
              metricValue,
              note
            };
          }

          function resolveSharedCompareTrendBounds(metric, leftPeriods, rightPeriods, leftDatasets, rightDatasets) {
            if (metric === "adoption") {
              return resolveAdoptionTrendAxisBounds([...(leftPeriods || []), ...(rightPeriods || [])]);
            }
            const values = [...(leftDatasets || []), ...(rightDatasets || [])]
              .flatMap(dataset => Array.isArray(dataset?.data) ? dataset.data : [])
              .filter(value => Number.isFinite(value));
            const maxValue = values.length ? Math.max(...values) : 0;
            return {
              min: 0,
              max: maxValue > 0 ? Math.ceil(maxValue * 1.1) : 1
            };
          }

          function buildAlignedComparePeriods(referencePeriods, entityPeriods) {
            const refs = Array.isArray(referencePeriods) ? referencePeriods : [];
            const entityMap = new Map((Array.isArray(entityPeriods) ? entityPeriods : []).map(period => [period?.key || period?.label, period]));
            return refs.map(reference => {
              const key = reference?.key || reference?.label;
              const existing = entityMap.get(key);
              if (existing) {
                return existing;
              }
              return {
                key,
                label: reference?.label || "",
                date: reference?.date instanceof Date ? new Date(reference.date.getTime()) : null,
                totalActions: 0,
                assistedHours: 0,
                categories: null,
                users: new Set(),
                adoptionUsers: new Set(),
                returningUsers: new Set(),
                enabledUsers: new Set(),
                enabledUsersCount: 0,
                adoptionEnabledUsersCount: 0,
                userCount: 0,
                adoptionUserCount: 0,
                averageActionsPerUser: 0,
                averageHoursPerUser: 0,
                adoptionRate: 0
              };
            });
          }


          function updateCompareFilterLockState() {
            const compareDimension = getCompareDimensionKey();
            const orgLocked = Boolean(state.compare.enabled) && compareDimension === "organization";
            const countryLocked = Boolean(state.compare.enabled) && compareDimension === "country";
            if (dom.organizationFilter) {
              dom.organizationFilter.disabled = orgLocked;
            }
            if (dom.organizationFieldSelect) {
              dom.organizationFieldSelect.disabled = orgLocked;
            }
            if (dom.countryFilter) {
              dom.countryFilter.disabled = countryLocked;
            }
            if (dom.countryFieldSelect) {
              dom.countryFieldSelect.disabled = countryLocked;
            }
          }

          function setCompareSelectOptions(select, values, currentValue, placeholder, excludedValue) {
            if (!select) {
              return;
            }
            const fragment = document.createDocumentFragment();
            const placeholderOption = document.createElement("option");
            placeholderOption.value = "";
            placeholderOption.textContent = placeholder;
            fragment.appendChild(placeholderOption);
            values.forEach(value => {
              if (!value || value === excludedValue) {
                return;
              }
              const option = document.createElement("option");
              option.value = value;
              option.textContent = value;
              option.selected = value === currentValue;
              fragment.appendChild(option);
            });
            select.innerHTML = "";
            select.appendChild(fragment);
            select.value = currentValue && currentValue !== excludedValue ? currentValue : "";
          }

          function updateCompareControls(baseRows) {
            const dimensionLabel = getCompareDimensionLabel();
            let compareValues = Array.from(new Set((Array.isArray(baseRows) ? baseRows : [])
              .map(row => resolveCompareSegmentValue(row))
              .filter(value => value && value !== "Unspecified"))).sort((a, b) => a.localeCompare(b));
            if (!compareValues.length) {
              compareValues = getDistinctSegmentValues(getCompareDimensionSourceKey()).sort((a, b) => a.localeCompare(b));
            }
            if (dom.compareEnabled) {
              dom.compareEnabled.checked = Boolean(state.compare.enabled);
            }
            if (state.compare.left && !compareValues.includes(state.compare.left)) {
              state.compare.left = "";
            }
            if (state.compare.right && !compareValues.includes(state.compare.right)) {
              state.compare.right = "";
            }
            if (state.compare.left && state.compare.left === state.compare.right) {
              state.compare.right = "";
            }
            if (dom.compareSelectors) {
              dom.compareSelectors.hidden = !state.compare.enabled;
            }
            if (dom.compareHint) {
              dom.compareHint.hidden = !state.compare.enabled;
              if (state.compare.enabled) {
                dom.compareHint.textContent = `Compare two ${dimensionLabel.toLowerCase()}s side by side using the current timeframe, metric, and aggregation.`;
              }
            }
            if (dom.compareLeftLabel) {
              dom.compareLeftLabel.textContent = `Left ${dimensionLabel.toLowerCase()}`;
            }
            if (dom.compareRightLabel) {
              dom.compareRightLabel.textContent = `Right ${dimensionLabel.toLowerCase()}`;
            }
            setCompareSelectOptions(dom.compareLeft, compareValues, state.compare.left, `Choose ${dimensionLabel.toLowerCase()}`, state.compare.right);
            setCompareSelectOptions(dom.compareRight, compareValues, state.compare.right, `Choose ${dimensionLabel.toLowerCase()}`, state.compare.left);
            if (dom.compareLeft) {
              dom.compareLeft.disabled = !state.compare.enabled || compareValues.length === 0;
            }
            if (dom.compareRight) {
              dom.compareRight.disabled = !state.compare.enabled || compareValues.length === 0;
            }
            return compareValues;
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
            renderGoalCards(null);
            state.latestTrendPeriods = [];
            state.latestGoalMetrics = null;
            state.goalMonthSelection = null;
            state.goalWeekSelection = null;
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
          function applyFilters(rows, options = {}) {
            const { organization, country, timeframe, customStart, customEnd, customRangeInvalid } = state.filters;
            const organizationFilter = organization instanceof Set ? organization : new Set();
            const countryFilter = country instanceof Set ? country : new Set();
            const ignoreOrganizationFilter = shouldIgnoreFilterForCompare("organization", options);
            const ignoreCountryFilter = shouldIgnoreFilterForCompare("country", options);
            const hasOrganizationFilter = organizationFilter.size > 0 && !ignoreOrganizationFilter;
            const hasCountryFilter = countryFilter.size > 0 && !ignoreCountryFilter;
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
            const actionActiveUsers = new Set();
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
            const createAdditiveTooltipAccumulator = () => Object.fromEntries(
              additiveTooltipCategoryConfig.map(entry => [entry.key, 0])
            );
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
              if (rowSelectedActions > 0) {
                actionActiveUsers.add(personKey);
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
                  returningUsers: new Set(),
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
                  weekBucket.returningUsers.add(personKey);
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
                  adoptionUsers: new Set(),
                  returningUsers: new Set(),
                  enabledUsers: new Set(),
                  categories: createCategoryAccumulator(),
                  additiveCategories: createAdditiveTooltipAccumulator()
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
              if (rowSelectedActions > 0) {
                periodBucket.adoptionUsers.add(personKey);
              }
              if (rowSelectedActions > 0) {
                periodBucket.returningUsers.add(personKey);
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
              additiveTooltipCategoryConfig.forEach(entry => {
                const value = entry.getValue(metrics);
                if (Number.isFinite(value) && value > 0) {
                  periodBucket.additiveCategories[entry.key] = (periodBucket.additiveCategories[entry.key] || 0) + value;
                }
              });
              adoptionEntries.forEach(entry => {
                const { config, userSet, featureSets } = entry;
                const metrics = row.metrics || {};
                if (!actionActiveUsers.has(personKey)) {
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
                const adoptionUsersSet = values.adoptionUsers instanceof Set ? values.adoptionUsers : new Set();
                const enabledSet = values.enabledUsers instanceof Set ? values.enabledUsers : new Set();
                const userCount = usersSet.size || 0;
                const adoptionUserCount = adoptionUsersSet.size || 0;
                const enabledCount = enabledSet.size || 0;
                return {
                  label: formatPeriodLabel(label, values.date),
                  key: label,
                  totalActions: values.totalActions,
                  assistedHours: values.assistedHours,
                  date: values.date,
                  categories: values.categories,
                  additiveCategories: values.additiveCategories || createAdditiveTooltipAccumulator(),
                  users: new Set(usersSet),
                  adoptionUsers: new Set(adoptionUsersSet),
                  returningUsers: values.returningUsers instanceof Set ? new Set(values.returningUsers) : new Set(),
                  enabledUsers: new Set(enabledSet),
                  enabledUsersCount: enabledCount,
                  adoptionEnabledUsersCount: enabledCount,
                  userCount,
                  adoptionUserCount,
                  averageActionsPerUser: userCount ? values.totalActions / userCount : 0,
                  averageHoursPerUser: userCount ? values.assistedHours / userCount : 0,
                  adoptionRate: enabledCount ? (adoptionUserCount / enabledCount) * 100 : 0
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
                returningUsers: values.returningUsers instanceof Set ? new Set(values.returningUsers) : new Set(),
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
      
            const averageActionsPerUser = actionActiveUsers.size ? totals.totalActions / actionActiveUsers.size : 0;
            const averageHoursPerUser = actionActiveUsers.size ? totals.assistedHours / actionActiveUsers.size : 0;
            const userSummaries = Array.from(userTotals.values());
            const topUsers = userSummaries
              .filter(entry => (entry.totalActions || 0) > 0)
              .sort((a, b) => (b.totalActions || 0) - (a.totalActions || 0));
            const totalActiveUsersCount = actionActiveUsers.size;
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
            const monthlyUsageIntensity = monthlyUsageArray.map(entry => entry.data);
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
              actionActiveUsers,
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
            const autoHidden = getAutoHiddenSeriesIds(periods, metric, normalizedDetailMode);
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
                if (def.id === "enabled-users") {
                  return false;
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
                if (autoHidden.has(def.id) && state.seriesManualTouched[def.id] !== true) {
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

          function buildCompareOverlayDatasets(leftPeriods, rightPeriods) {
            const metric = state.filters.metric;
            const getValue = period => {
              if (metric === "hours") {
                return Number.isFinite(period?.assistedHours) ? period.assistedHours : 0;
              }
              if (metric === "adoption") {
                return getPeriodAdoptionRate(period);
              }
              return Number.isFinite(period?.totalActions) ? period.totalActions : 0;
            };
            const datasets = [];
            if (state.compare.left) {
              datasets.push({
                label: state.compare.left,
                data: (leftPeriods || []).map(getValue),
                borderColor: "rgba(0, 110, 0, 0.92)",
                backgroundColor: state.compare.right
                  ? "rgba(0, 110, 0, 0.08)"
                  : "rgba(0, 110, 0, 0.16)",
                borderWidth: 3,
                fill: !state.compare.right,
                tension: 0.26,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: "#ffffff",
                pointBorderColor: "rgba(0, 110, 0, 0.92)",
                pointBorderWidth: 2
              });
            }
            if (state.compare.right) {
              datasets.push({
                label: state.compare.right,
                data: (rightPeriods || []).map(getValue),
                borderColor: "rgba(58, 132, 193, 0.95)",
                backgroundColor: "rgba(58, 132, 193, 0.08)",
                borderWidth: 3,
                fill: false,
                tension: 0.26,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: "#ffffff",
                pointBorderColor: "rgba(58, 132, 193, 0.95)",
                pointBorderWidth: 2
              });
            }
            return datasets;
          }
      
          function applyTrendScaleToChart(chart, metric, periods, sharedBounds) {
            const yScale = chart?.options?.scales?.y;
            if (!yScale) {
              return;
            }
            if (yScale.ticks) {
              yScale.ticks.callback = value => formatTrendAxisTick(value);
            }
            const bounds = sharedBounds || (metric === "adoption"
              ? resolveAdoptionTrendAxisBounds(periods)
              : null);
            if (bounds) {
              yScale.min = bounds.min;
              yScale.max = bounds.max;
              yScale.beginAtZero = bounds.min === 0;
            } else {
              delete yScale.min;
              delete yScale.max;
              yScale.beginAtZero = true;
            }
          }

          function getTrendCaptionText() {
            const isAverageView = state.trendView === "average";
            const isHoursMetric = state.filters.metric === "hours";
            const isAdoptionMetric = state.filters.metric === "adoption";
            if (isAdoptionMetric) {
              return `Active users (% of enabled) aggregated ${state.filters.aggregate}.`;
            }
            return isHoursMetric
              ? (isAverageView ? "Copilot assisted hours per active user" : "Copilot assisted hours")
              : (isAverageView ? "Copilot actions per active user" : "Copilot actions");
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
            applyTrendScaleToChart(chart, metric, periods);
            chart.update("none");
          }

          function updateTrendCaptionText() {
            if (!dom.trendCaption) {
              return;
            }
            dom.trendCaption.textContent = getTrendCaptionText();
          }

          function renderComparePanel(side, selection, aggregates, sharedBounds) {
            const refs = getComparePanelElements(side);
            if (!refs) {
              return;
            }
            if (!selection) {
              setComparePanelPlaceholder(side, side === "left" ? "Left selection" : "Right selection", side === "left" ? "Choose an entity to compare." : "Choose another entity to compare.");
              return;
            }
            if (!aggregates || !Array.isArray(aggregates.periods) || !aggregates.periods.length) {
              setComparePanelPlaceholder(side, selection, "No data for this selection under the current filters.");
              return;
            }
            const activeUsers = getSummaryActiveUserCount(aggregates);
            const enabledUserCount = aggregates.enabledUsers instanceof Set ? aggregates.enabledUsers.size : 0;
            const latest = formatLatestMetricForAggregates(aggregates);
            if (refs.title) {
              refs.title.textContent = selection;
            }
            if (refs.subtitle) {
              refs.subtitle.textContent = `${getCompareDimensionLabel()} comparison`;
            }
            if (refs.window) {
              refs.window.textContent = aggregates.windowLabel || "-";
            }
            if (refs.summaryActions) {
              refs.summaryActions.textContent = numberFormatter.format(Math.round(aggregates.totals?.totalActions || 0));
            }
            if (refs.summaryActionsNote) {
              refs.summaryActionsNote.textContent = `Across ${aggregates.filteredCount || 0} records (avg ${numberFormatter.format(Math.round(aggregates.averageActionsPerUser || 0))} actions per active user).`;
            }
            if (refs.summaryHours) {
              refs.summaryHours.textContent = `${hoursFormatter.format(aggregates.totals?.assistedHours || 0)} hrs`;
            }
            if (refs.summaryHoursNote) {
              refs.summaryHoursNote.textContent = `Average ${hoursFormatter.format(aggregates.averageHoursPerUser || 0)} hrs per active user.`;
            }
            if (refs.summaryUsers) {
              refs.summaryUsers.textContent = numberFormatter.format(activeUsers);
            }
            if (refs.summaryUsersNote) {
              refs.summaryUsersNote.textContent = activeUsers || enabledUserCount
                ? `${numberFormatter.format(activeUsers)} active (with actions)${enabledUserCount ? `${BULLET_SEPARATOR}${numberFormatter.format(enabledUserCount)} enabled` : ""}`
                : "No active users in view.";
            }
            if (refs.latestPeriod) {
              refs.latestPeriod.textContent = latest.periodLabel ?? "-";
            }
            if (refs.latestMetric) {
              refs.latestMetric.textContent = latest.metricValue ?? "";
            }
            if (refs.latestNote) {
              refs.latestNote.textContent = latest.note;
            }
          }

          function renderCompareSection(baseRows) {
            updateCompareFilterLockState();
            if (!dom.compareSection || !dom.compareGrid || !dom.compareEmpty || !dom.compareCharts) {
              return;
            }
            const compareValues = updateCompareControls(baseRows);
            if (!state.compare.enabled) {
              dom.compareSection.hidden = true;
              dom.compareCharts.hidden = true;
              state.compare.leftPeriods = [];
              state.compare.rightPeriods = [];
              const overlayChart = state.charts.compareOverlay;
              if (overlayChart) {
                overlayChart.data.labels = [];
                overlayChart.data.datasets = [];
                overlayChart.update("none");
              }
              return;
            }
            dom.compareSection.hidden = false;
            const dimensionLabel = getCompareDimensionLabel();
            if (dom.compareCaption) {
              dom.compareCaption.textContent = `Compare two ${dimensionLabel.toLowerCase()}s side by side using the current metric, timeframe, and aggregation.`;
            }
            if (!compareValues.length) {
              dom.compareGrid.hidden = true;
              dom.compareCharts.hidden = true;
              dom.compareEmpty.hidden = false;
              dom.compareEmpty.textContent = `No ${dimensionLabel.toLowerCase()}s are available for the current scope.`;
              setComparePanelPlaceholder("left", "Left selection", `No ${dimensionLabel.toLowerCase()}s available.`);
              setComparePanelPlaceholder("right", "Right selection", `No ${dimensionLabel.toLowerCase()}s available.`);
              state.compare.leftPeriods = [];
              state.compare.rightPeriods = [];
              const overlayChart = state.charts.compareOverlay;
              if (overlayChart) {
                overlayChart.data.labels = [];
                overlayChart.data.datasets = [];
                overlayChart.update("none");
              }
              return;
            }
            if (!state.compare.left && !state.compare.right) {
              dom.compareGrid.hidden = true;
              dom.compareCharts.hidden = true;
              dom.compareEmpty.hidden = false;
              dom.compareEmpty.textContent = `Choose two ${dimensionLabel.toLowerCase()}s to compare.`;
              setComparePanelPlaceholder("left", "Left selection", "Choose an entity to compare.");
              setComparePanelPlaceholder("right", "Right selection", "Choose another entity to compare.");
              state.compare.leftPeriods = [];
              state.compare.rightPeriods = [];
              const overlayChart = state.charts.compareOverlay;
              if (overlayChart) {
                overlayChart.data.labels = [];
                overlayChart.data.datasets = [];
                overlayChart.update("none");
              }
              return;
            }
            dom.compareGrid.hidden = false;
            dom.compareEmpty.hidden = true;
            dom.compareCharts.hidden = false;
            const buildRowsForSelection = selection => (Array.isArray(baseRows) ? baseRows : []).filter(row => resolveCompareSegmentValue(row) === selection);
            const compareBaseAggregates = Array.isArray(baseRows) && baseRows.length ? computeAggregates(baseRows) : null;
            const referencePeriods = Array.isArray(compareBaseAggregates?.periods) ? compareBaseAggregates.periods : [];
            const leftRows = state.compare.left ? buildRowsForSelection(state.compare.left) : [];
            const rightRows = state.compare.right ? buildRowsForSelection(state.compare.right) : [];
            const leftAggregates = leftRows.length ? computeAggregates(leftRows) : null;
            const rightAggregates = rightRows.length ? computeAggregates(rightRows) : null;
            const alignedLeftPeriods = buildAlignedComparePeriods(referencePeriods, leftAggregates?.periods || []);
            const alignedRightPeriods = buildAlignedComparePeriods(referencePeriods, rightAggregates?.periods || []);
            state.compare.leftPeriods = alignedLeftPeriods;
            state.compare.rightPeriods = alignedRightPeriods;
            const leftDatasets = leftAggregates ? buildTrendDatasets(alignedLeftPeriods, state.filters.metric, state.seriesDetailMode) : [];
            const rightDatasets = rightAggregates ? buildTrendDatasets(alignedRightPeriods, state.filters.metric, state.seriesDetailMode) : [];
            const sharedBounds = resolveSharedCompareTrendBounds(state.filters.metric, alignedLeftPeriods, alignedRightPeriods, leftDatasets, rightDatasets);
            renderComparePanel("left", state.compare.left, leftAggregates, sharedBounds);
            renderComparePanel("right", state.compare.right, rightAggregates, sharedBounds);
            const overlayRefs = getCompareChartElements();
            const overlayChart = state.charts.compareOverlay;
            const visiblePeriods = state.compare.left ? alignedLeftPeriods : alignedRightPeriods;
            const overlayDatasets = buildCompareOverlayDatasets(alignedLeftPeriods, alignedRightPeriods);
            if (overlayRefs?.title) {
              overlayRefs.title.textContent = state.compare.left && state.compare.right
                ? "Comparison impact trend"
                : `${state.compare.left || state.compare.right} impact trend`;
            }
            if (overlayRefs?.caption) {
              overlayRefs.caption.textContent = state.compare.left && state.compare.right
                ? `${getTrendCaptionText()} Left is green, right is blue.`
                : getTrendCaptionText();
            }
            if (overlayRefs?.window) {
              overlayRefs.window.textContent = (leftAggregates?.windowLabel || rightAggregates?.windowLabel || "-");
            }
            if (overlayRefs?.empty) {
              overlayRefs.empty.hidden = overlayDatasets.length > 0;
              overlayRefs.empty.textContent = "Choose at least one entity to compare.";
            }
            if (overlayChart) {
              overlayChart.data.labels = (visiblePeriods || []).map(item => item.label);
              overlayChart.data.datasets = overlayDatasets;
              applyTrendScaleToChart(overlayChart, state.filters.metric, visiblePeriods || [], sharedBounds);
              overlayChart.update("none");
            }
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
                const autoHidden = getAutoHiddenSeriesIds(state.latestTrendPeriods, state.filters.metric, state.seriesDetailMode);
                const currentlyVisible = currentSelection.has(def.id) && (!autoHidden.has(def.id) || state.seriesManualTouched[def.id] === true);
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
                state.seriesManualTouched[def.id] = true;
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
            const autoHidden = getAutoHiddenSeriesIds(state.latestTrendPeriods, state.filters.metric, state.seriesDetailMode);
            seriesToggleButtons.forEach((button, id) => {
              const visible = selection.has(id) && (!autoHidden.has(id) || state.seriesManualTouched[id] === true);
              state.seriesVisibility[id] = visible;
              button.classList.toggle("is-active", visible);
              button.setAttribute("aria-pressed", String(visible));
              const disabled = state.filters.metric !== "actions";
              button.disabled = disabled;
              button.classList.toggle("is-disabled", disabled);
              button.classList.toggle("is-auto-hidden", autoHidden.has(id) && state.seriesManualTouched[id] !== true && !disabled);
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
            if (dom.groupValueHeader) {
              const metricHeaderLabel = state.filters.metric === "hours"
                ? "Assisted hours"
                : (state.filters.metric === "adoption" ? "Active users (%)" : "Total Actions");
              dom.groupValueHeader.textContent = metricHeaderLabel;
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

          function createAdoptionMetric(valueText, percent, accentColor) {
            const wrapper = document.createElement("span");
            wrapper.className = "adoption-metric";

            const value = document.createElement("span");
            value.className = "adoption-metric__value";
            value.textContent = valueText;

            const track = document.createElement("span");
            track.className = "adoption-metric__track";

            const fill = document.createElement("span");
            fill.className = "adoption-metric__fill";
            const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
            fill.style.width = `${safePercent}%`;
            if (accentColor) {
              fill.style.backgroundColor = accentColor;
            }

            track.appendChild(fill);
            wrapper.append(value, track);
            return wrapper;
          }

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
              nameCell.dataset.label = "Apps & capabilities";
              nameCell.textContent = app.label || app.key || "Unnamed app";
              const usersCell = document.createElement("td");
              usersCell.className = "is-numeric";
              usersCell.dataset.label = "Active users";
              usersCell.textContent = numberFormatter.format(app.users || 0);
              const shareCell = document.createElement("td");
              shareCell.className = "is-numeric";
              shareCell.dataset.label = "% of active users";
              const appShare = Number.isFinite(app.share) ? app.share : 0;
              shareCell.appendChild(createAdoptionMetric(
                `${Math.max(0, Math.min(100, appShare)).toFixed(1)}%`,
                appShare,
                accentColor
              ));
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
                  featureNameCell.dataset.label = "Apps & capabilities";
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
                  featureUsersCell.dataset.label = "Active users";
                  featureUsersCell.textContent = numberFormatter.format(Math.round(feature.users || 0));

                  const featureShareCell = document.createElement("td");
                  featureShareCell.className = "is-numeric";
                  featureShareCell.dataset.label = "% of active users";
                  const featureShare = Number.isFinite(feature.share) ? feature.share : 0;
                  featureShareCell.appendChild(createAdoptionMetric(
                    `${Math.max(0, Math.min(100, featureShare)).toFixed(1)}%`,
                    featureShare,
                    accentColor
                  ));

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
            const selection = getDefaultUsageMonthSelection(monthKeys, state.usageMonthSelection);
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

          function updateReturningScaleToggleState() {
            if (!dom.returningScaleButtons || !dom.returningScaleButtons.length) {
              return;
            }
            const isPercentage = state.returningMetric === "percentage";
            dom.returningScaleButtons.forEach(button => {
              const scaleMode = button.dataset.returningScale === "full" ? "full" : "smart";
              const isActive = state.returningScaleMode === scaleMode;
              button.classList.toggle("is-active", isActive);
              button.setAttribute("aria-pressed", String(isActive));
              button.disabled = !isPercentage;
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
          if (dom.goalsExportCsv) {
            dom.goalsExportCsv.addEventListener("click", exportGoalMetricsCsv);
          }
          if (dom.goalMonthPrev) {
            dom.goalMonthPrev.addEventListener("click", () => {
              shiftGoalMonth(-1);
            });
          }
          if (dom.goalMonthNext) {
            dom.goalMonthNext.addEventListener("click", () => {
              shiftGoalMonth(1);
            });
          }
          if (dom.goalWeekPrev) {
            dom.goalWeekPrev.addEventListener("click", () => {
              shiftGoalWeek(-1);
            });
          }
          if (dom.goalWeekNext) {
            dom.goalWeekNext.addEventListener("click", () => {
              shiftGoalWeek(1);
            });
          }

          if (dom.goal1Trend) {
            dom.goal1Trend.addEventListener("click", (e) => {
              const item = e.target.closest(".goal-trend__item:not(.goal-trend__item--empty)");
              if (!item || !item.dataset.weekKey) return;
              state.goalWeekSelection = item.dataset.weekKey;
              renderGoalCards(state.latestGoalMetrics);
            });
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
                keys: [],
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
                  keys: [],
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
                const userSet = entry && entry.returningUsers instanceof Set ? entry.returningUsers : new Set();
                userSet.forEach(user => accumulator.users.add(user));
              });
              const sortedMonths = Array.from(monthMap.values())
                .sort((a, b) => a.key.localeCompare(b.key));
              const comparableMonths = sortedMonths.slice(1);
              const totals = comparableMonths.map(month => month.users.size);
              const returningCounts = comparableMonths.map((month, index) => {
                let returning = 0;
                month.users.forEach(user => {
                  if (sortedMonths[index].users.has(user)) {
                    returning += 1;
                  }
                });
                return returning;
              });
              return {
                labels: comparableMonths.map(month => month.label),
                keys: comparableMonths.map(month => month.key),
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
                keys: [],
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
              const users = entry && entry.returningUsers instanceof Set ? entry.returningUsers : new Set();
              return { label, users };
            }).filter(entry => entry.label);
            const comparableWeeks = weeks.slice(1);
            const totals = comparableWeeks.map(week => week.users.size);
            const returningCounts = comparableWeeks.map((week, index) => {
              let returning = 0;
              week.users.forEach(user => {
                if (weeks[index].users.has(user)) {
                  returning += 1;
                }
              });
              return returning;
            });
            return {
              labels: comparableWeeks.map(week => week.label),
              keys: comparableWeeks.map(week => week.label),
              totals,
              returningCounts,
              unitLabel: "week"
            };
          }

          function resolveReturningPercentageAxisMin(values) {
            const validValues = Array.isArray(values)
              ? values.filter(value => Number.isFinite(value))
              : [];
            if (!validValues.length) {
              return 0;
            }
            const highValueCount = validValues.filter(value => value >= 75).length;
            const highValueRatio = highValueCount / validValues.length;
            if (highValueRatio < 0.7) {
              return 0;
            }
            const minValue = Math.min(...validValues);
            return Math.max(40, Math.floor((minValue - 5) / 5) * 5);
          }

          function resolveReturningSelection(series, interval) {
            const keys = Array.isArray(series?.keys) ? series.keys : [];
            if (!keys.length) {
              return { key: null, index: -1 };
            }
            const intervalKey = interval === "monthly" ? "monthly" : "weekly";
            const selectedKey = state.returningSelection[intervalKey];
            const selectedIndex = selectedKey ? keys.indexOf(selectedKey) : -1;
            if (selectedIndex >= 0) {
              return { key: selectedKey, index: selectedIndex };
            }
            const fallbackKey = keys[keys.length - 1];
            state.returningSelection[intervalKey] = fallbackKey;
            return { key: fallbackKey, index: keys.length - 1 };
          }

          function renderReturningSummary(details = null) {
            const container = dom.returningSummary;
            if (!container) {
              return;
            }
            container.innerHTML = "";

            const summaryCards = Array.isArray(details?.cards) && details.cards.length
              ? details.cards
              : [
                  { label: "Latest metric", value: "-", meta: "Load data to compare recurring cohorts.", isPrimary: true },
                  { label: "Active base", value: "-", meta: "No periods loaded yet." },
                  { label: "Return rate", value: "-", meta: "Requires consecutive active periods." },
                  { label: "Vs previous", value: "-", meta: "Awaiting comparison window.", tone: "neutral" }
                ];

            summaryCards.forEach((card, index) => {
              const article = document.createElement("article");
              article.className = "returning-summary-card";
              if (card.isPrimary || index === 0) {
                article.classList.add("is-primary");
              }
              if (card.tone) {
                article.dataset.tone = card.tone;
              }

              const label = document.createElement("span");
              label.className = "returning-summary-card__label";
              label.textContent = card.label || "-";

              const value = document.createElement("strong");
              value.className = "returning-summary-card__value";
              value.textContent = card.value || "-";

              const meta = document.createElement("span");
              meta.className = "returning-summary-card__meta";
              meta.textContent = card.meta || "";

              article.append(label, value, meta);
              container.append(article);
            });
          }
      
          function updateReturningUsers(aggregates) {
            const returningChart = state.charts.returningUsers;
            const metric = state.returningMetric || "total";
            const interval = state.returningInterval || DEFAULT_RETURNING_INTERVAL;
            const series = generateReturningSeries(aggregates, interval);
            const hasData = Boolean(series.labels.length);
            const sourceTimeline = interval === "monthly"
              ? (Array.isArray(aggregates?.weeklyTimeline) ? aggregates.weeklyTimeline : [])
              : (Array.isArray(aggregates?.weeklyTimeline) && aggregates.weeklyTimeline.length
                ? aggregates.weeklyTimeline
                : (Array.isArray(aggregates?.periods) ? aggregates.periods : []));
            const hasSingleUncomparablePeriod = !hasData && sourceTimeline.length === 1;
            setButtonEnabled(dom.returningExportPng, hasData);
            setButtonEnabled(dom.returningExportCsv, hasData);
            if (!hasData) {
              if (dom.returningCaption) {
                dom.returningCaption.textContent = hasSingleUncomparablePeriod
                  ? `Need at least two ${interval === "monthly" ? "months" : "weeks"} to compare recurring cohorts.`
                  : "Upload data to monitor recurring adoption.";
              }
              renderReturningSummary(null);
              if (dom.returningEmpty) {
                dom.returningEmpty.hidden = false;
                dom.returningEmpty.textContent = hasSingleUncomparablePeriod
                  ? `Need one earlier ${interval === "monthly" ? "month" : "week"} before returning users can be measured.`
                  : (interval === "monthly"
                    ? "Upload data to view returning users month over month."
                    : "Upload data to view returning users week over week.");
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
            const keys = series.keys || [];
            const totals = series.totals;
            const returningCounts = series.returningCounts;
            const percentages = returningCounts.map((value, index) => {
              const total = totals[index] || 0;
              return total ? (value / total) * 100 : 0;
            });
            const selection = resolveReturningSelection(series, interval);
            const selectedIndex = selection.index;
            const datasetValues = metric === "percentage" ? percentages : returningCounts;
            const datasetLabel = metric === "percentage" ? "Returning users (%)" : "Returning users";
            const hasReturningValues = datasetValues.some(value => Number.isFinite(value) && value > 0);
            if (returningChart) {
              const lineColor = getCssVariableValue("--green-600", "#008A00");
              const fillColor = hexToRgba(colorStringToHex(lineColor) || "#008A00", 0.15) || "rgba(0, 138, 0, 0.15)";
              returningChart.data.labels = labels;
              const dataset = returningChart.data.datasets[0];
              if (dataset) {
                dataset.label = datasetLabel;
                dataset.data = datasetValues;
                dataset.keys = keys;
                dataset.borderColor = lineColor;
                dataset.backgroundColor = fillColor;
                dataset.fill = metric === "percentage";
                dataset.pointRadius = datasetValues.map((_, index) => index === selectedIndex ? 6 : 4);
                dataset.pointHoverRadius = datasetValues.map((_, index) => index === selectedIndex ? 8 : 6);
                dataset.pointBackgroundColor = datasetValues.map((_, index) => index === selectedIndex ? lineColor : "#ffffff");
                dataset.pointBorderColor = datasetValues.map(() => lineColor);
                dataset.pointBorderWidth = datasetValues.map((_, index) => index === selectedIndex ? 2.5 : 1.5);
              }
              const yScale = returningChart.options?.scales?.y;
              if (yScale) {
                if (metric === "percentage") {
                  yScale.min = state.returningScaleMode === "full" ? 0 : resolveReturningPercentageAxisMin(percentages);
                  yScale.max = 102;
                  yScale.beginAtZero = yScale.min === 0;
                } else {
                  delete yScale.min;
                  delete yScale.max;
                  yScale.beginAtZero = true;
                }
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
                  ? "Which cohorts return to Copilot month over month? Click a point to inspect that month."
                  : "Which cohorts return to Copilot week over week? Click a point to inspect that week.")
                : `Returning users appear once the same people are active in consecutive ${unitLabel}s.`;
            }
            if (selectedIndex >= 0) {
              const latestLabel = labels[selectedIndex];
              const previousPercentage = selectedIndex > 0 ? (percentages[selectedIndex - 1] || 0) : null;
              const latestReturning = returningCounts[selectedIndex] || 0;
              const latestTotal = totals[selectedIndex] || 0;
              const latestPercentage = percentages[selectedIndex] || 0;
              const delta = previousPercentage == null ? null : latestPercentage - previousPercentage;
              const selectedMetricValue = metric === "percentage"
                ? `${latestPercentage.toFixed(1)}%`
                : numberFormatter.format(latestReturning);
              const selectedMetricLabel = metric === "percentage" ? "Return rate" : "Returning users";
              const selectedMetricMeta = metric === "percentage"
                ? `${latestLabel} recurring share`
                : `${latestLabel} users active in consecutive ${unitLabel}s`;

              renderReturningSummary({
                cards: [
                  {
                    label: selectedMetricLabel,
                    value: selectedMetricValue,
                    meta: selectedMetricMeta,
                    isPrimary: true
                  },
                  {
                    label: "Active base",
                    value: numberFormatter.format(latestTotal),
                    meta: `${latestLabel} active users`
                  },
                  {
                    label: "Return rate",
                    value: `${latestPercentage.toFixed(1)}%`,
                    meta: `${numberFormatter.format(latestReturning)} returning users`
                  },
                  {
                    label: `Vs previous ${unitLabel}`,
                    value: delta == null ? "-" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp`,
                    meta: delta == null
                      ? `Need one earlier ${unitLabel} for delta`
                      : `Previous ${unitLabel}: ${previousPercentage.toFixed(1)}%`,
                    tone: delta == null ? "neutral" : (delta > 0 ? "positive" : (delta < 0 ? "negative" : "neutral"))
                  }
                ]
              });
            } else {
              renderReturningSummary(null);
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

        function resolveGoalPromptMetric(metrics, primaryKey, fallbackKeys) {
          if (!metrics || typeof metrics !== "object") {
            return 0;
          }
          const primaryValue = Number(metrics[primaryKey] || 0);
          if (Number.isFinite(primaryValue) && primaryValue > 0) {
            return primaryValue;
          }
          if (!Array.isArray(fallbackKeys) || !fallbackKeys.length) {
            return 0;
          }
          let fallbackTotal = 0;
          fallbackKeys.forEach(key => {
            const value = Number(metrics[key] || 0);
            if (Number.isFinite(value) && value > 0) {
              fallbackTotal += value;
            }
          });
          return fallbackTotal;
        }

        function buildGoalActivitySignal(row) {
          const metrics = row && row.metrics ? row.metrics : {};
          const totalActions = Number(row && row.totalActions ? row.totalActions : metrics.totalActions || 0);
          if (Number.isFinite(totalActions) && totalActions > 0) {
            return totalActions;
          }
          const workPrompts = resolveGoalPromptMetric(metrics, "chatPromptsWork", ["chatPromptsWorkTeams", "chatPromptsWorkOutlook"]);
          const webPrompts = resolveGoalPromptMetric(metrics, "chatPromptsWeb", ["chatPromptsWebTeams", "chatPromptsWebOutlook"]);
          const teamsPrompts = Number(metrics.chatPromptsTeams || 0);
          const normalizedTeamsPrompts = Number.isFinite(teamsPrompts) && teamsPrompts > 0 ? teamsPrompts : 0;
          return workPrompts + webPrompts + normalizedTeamsPrompts;
        }

        function resolveGoalActiveDays(metrics) {
          if (!metrics || typeof metrics !== "object") {
            return 0;
          }
          const totalActiveDays = Number(metrics.totalActiveDays || 0);
          if (Number.isFinite(totalActiveDays) && totalActiveDays > 0) {
            return totalActiveDays;
          }
          const fallbackKeys = [
            "daysActiveWord",
            "daysActiveTeams",
            "daysActiveOutlook",
            "daysActivePowerPoint",
            "daysActiveExcel",
            "daysActiveOneNote",
            "daysActiveLoop",
            "daysActiveChatWork",
            "daysActiveChatWeb"
          ];
          let bestFallback = 0;
          fallbackKeys.forEach(key => {
            const value = Number(metrics[key] || 0);
            if (Number.isFinite(value) && value > bestFallback) {
              bestFallback = value;
            }
          });
          return bestFallback;
        }

        function createDefaultGoalMetrics() {
          return {
            goal1: {
              weekly: [],
              months: [],
              latest: null,
              periodSummary: {
                targetedUsers: 0,
                compliantUsers: 0,
                attainmentPct: 0
              },
              sustained4of4: {
                status: GOAL_STATUS.INSUFFICIENT_DATA,
                windowWeeks: []
              }
            }
          };
        }

        function computeGoalMetrics(rows, filters) {
          void filters;
          const metrics = createDefaultGoalMetrics();
          if (!Array.isArray(rows) || !rows.length) {
            return metrics;
          }
          const weekMap = new Map();
          const monthMap = new Map();
          const periodTargetedUsers = new Set();
          const periodCompliantUsers = new Set();
          rows.forEach(row => {
            if (!row || !row.metrics) {
              return;
            }
            const weekKey = `${row.isoYear}-W${pad(row.isoWeek)}`;
            if (!weekKey) {
              return;
            }
            const effectiveDate = row.weekEndDate instanceof Date ? row.weekEndDate : row.date;
            let weekBucket = weekMap.get(weekKey);
            if (!weekBucket) {
              weekBucket = {
                key: weekKey,
                date: effectiveDate instanceof Date ? effectiveDate : null,
                users: new Map()
              };
              weekMap.set(weekKey, weekBucket);
            }
            if (effectiveDate instanceof Date && (!weekBucket.date || effectiveDate > weekBucket.date)) {
              weekBucket.date = effectiveDate;
            }
            const personId = sanitizeLabel(row.personId) || "Unknown";
            let userBucket = weekBucket.users.get(personId);
            if (!userBucket) {
              userBucket = {
                enabled: false,
                activitySignal: 0,
                activeDays: 0
              };
              weekBucket.users.set(personId, userBucket);
            }
            const rowMetrics = row.metrics || {};
            if ((rowMetrics.copilotEnabledUser || 0) > 0) {
              userBucket.enabled = true;
            }
            userBucket.activitySignal += buildGoalActivitySignal(row);
            const activeDays = resolveGoalActiveDays(rowMetrics);
            if (activeDays > userBucket.activeDays) {
              userBucket.activeDays = activeDays;
            }
          });
          const weekly = Array.from(weekMap.values())
            .sort((a, b) => {
              const aDate = a.date instanceof Date ? a.date.getTime() : 0;
              const bDate = b.date instanceof Date ? b.date.getTime() : 0;
              return aDate - bDate;
            })
            .map(weekBucket => {
              let targetedUsers = 0;
              let compliantUsers = 0;
              weekBucket.users.forEach((userBucket, userId) => {
                if (!userBucket.enabled) {
                  return;
                }
                const isCompliant =
                  userBucket.activitySignal >= GOAL_MIN_WEEKLY_ACTIVITY_EVENTS
                  && userBucket.activeDays >= GOAL_MIN_WEEKLY_ACTIVE_DAYS;
                targetedUsers += 1;
                periodTargetedUsers.add(userId);
                if (isCompliant) {
                  compliantUsers += 1;
                  periodCompliantUsers.add(userId);
                }
                const bucketDate = weekBucket.date instanceof Date ? weekBucket.date : null;
                if (bucketDate instanceof Date) {
                  const monthKey = `${bucketDate.getUTCFullYear()}-${pad(bucketDate.getUTCMonth() + 1)}`;
                  let monthBucket = monthMap.get(monthKey);
                  if (!monthBucket) {
                    const monthDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), bucketDate.getUTCMonth(), 1));
                    monthBucket = {
                      key: monthKey,
                      label: formatMonthYear(monthDate),
                      date: monthDate,
                      targetedUsers: new Set(),
                      compliantUsers: new Set(),
                      weekly: []
                    };
                    monthMap.set(monthKey, monthBucket);
                  }
                  monthBucket.targetedUsers.add(userId);
                  if (isCompliant) {
                    monthBucket.compliantUsers.add(userId);
                  }
                }
              });
              const attainmentPct = targetedUsers ? (compliantUsers / targetedUsers) * 100 : 0;
              return {
                weekKey: weekBucket.key,
                label: weekBucket.key,
                date: weekBucket.date,
                targetedUsers,
                compliantUsers,
                attainmentPct,
                metTarget: targetedUsers > 0 && compliantUsers === targetedUsers
              };
            });
          weekly.forEach(entry => {
            if (!(entry.date instanceof Date)) {
              return;
            }
            const monthKey = `${entry.date.getUTCFullYear()}-${pad(entry.date.getUTCMonth() + 1)}`;
            const monthBucket = monthMap.get(monthKey);
            if (!monthBucket) {
              return;
            }
            monthBucket.weekly.push(entry);
          });

          const months = Array.from(monthMap.values())
            .sort((a, b) => a.date - b.date)
            .map(monthBucket => {
              const monthlyWeekly = Array.isArray(monthBucket.weekly)
                ? monthBucket.weekly.slice().sort((a, b) => {
                    const aDate = a.date instanceof Date ? a.date.getTime() : 0;
                    const bDate = b.date instanceof Date ? b.date.getTime() : 0;
                    return aDate - bDate;
                  })
                : [];
              const targetedUsers = monthBucket.targetedUsers.size;
              const compliantUsers = monthBucket.compliantUsers.size;
              const sustainedWindow = monthlyWeekly.slice(-GOAL_REQUIRED_WEEKS);
              let sustainedStatus = GOAL_STATUS.INSUFFICIENT_DATA;
              if (sustainedWindow.length >= GOAL_REQUIRED_WEEKS) {
                sustainedStatus = sustainedWindow.every(entry => entry.metTarget) ? GOAL_STATUS.PASS : GOAL_STATUS.FAIL;
              }
              return {
                key: monthBucket.key,
                label: monthBucket.label,
                date: monthBucket.date,
                targetedUsers,
                compliantUsers,
                attainmentPct: targetedUsers ? (compliantUsers / targetedUsers) * 100 : 0,
                weekly: monthlyWeekly,
                latest: monthlyWeekly.length ? monthlyWeekly[monthlyWeekly.length - 1] : null,
                sustained4of4: {
                  status: sustainedStatus,
                  windowWeeks: sustainedWindow
                }
              };
            });

          const latest = weekly.length ? weekly[weekly.length - 1] : null;
          const sustainedWindow = weekly.slice(-GOAL_REQUIRED_WEEKS);
          let sustainedStatus = GOAL_STATUS.INSUFFICIENT_DATA;
          if (sustainedWindow.length >= GOAL_REQUIRED_WEEKS) {
            sustainedStatus = sustainedWindow.every(entry => entry.metTarget) ? GOAL_STATUS.PASS : GOAL_STATUS.FAIL;
          }
          metrics.goal1 = {
            weekly,
            months,
            latest,
            periodSummary: {
              targetedUsers: periodTargetedUsers.size,
              compliantUsers: periodCompliantUsers.size,
              attainmentPct: periodTargetedUsers.size ? (periodCompliantUsers.size / periodTargetedUsers.size) * 100 : 0
            },
            sustained4of4: {
              status: sustainedStatus,
              windowWeeks: sustainedWindow
            }
          };
          return metrics;
        }

        function getSelectedGoalMonth(goal1) {
          const months = goal1 && Array.isArray(goal1.months) ? goal1.months : [];
          if (!months.length) {
            state.goalMonthSelection = null;
            return null;
          }
          const existingIndex = months.findIndex(month => month.key === state.goalMonthSelection);
          if (existingIndex >= 0) {
            return months[existingIndex];
          }
          const fallback = months[months.length - 1];
          state.goalMonthSelection = fallback ? fallback.key : null;
          return fallback || null;
        }

        function updateGoalMonthNavigation(goal1, selectedMonth) {
          if (!dom.goalMonthNav || !dom.goalMonthPrev || !dom.goalMonthNext || !dom.goalMonthLabel) {
            return;
          }
          const months = goal1 && Array.isArray(goal1.months) ? goal1.months : [];
          if (!months.length || !selectedMonth) {
            dom.goalMonthNav.hidden = true;
            dom.goalMonthLabel.textContent = "Latest month";
            dom.goalMonthPrev.disabled = true;
            dom.goalMonthNext.disabled = true;
            return;
          }
          const currentIndex = months.findIndex(month => month.key === selectedMonth.key);
          const safeIndex = currentIndex >= 0 ? currentIndex : months.length - 1;
          dom.goalMonthNav.hidden = false;
          dom.goalMonthLabel.textContent = selectedMonth.label || selectedMonth.key || "Month";
          dom.goalMonthPrev.disabled = safeIndex <= 0;
          dom.goalMonthNext.disabled = safeIndex >= months.length - 1;
        }

        function shiftGoalMonth(step) {
          const goalMetrics = state.latestGoalMetrics;
          const goal1 = goalMetrics && goalMetrics.goal1 ? goalMetrics.goal1 : null;
          const months = goal1 && Array.isArray(goal1.months) ? goal1.months : [];
          if (!months.length) {
            return;
          }
          const currentIndex = months.findIndex(month => month.key === state.goalMonthSelection);
          const safeIndex = currentIndex >= 0 ? currentIndex : months.length - 1;
          const nextIndex = Math.max(0, Math.min(months.length - 1, safeIndex + step));
          if (nextIndex === safeIndex) {
            return;
          }
          state.goalMonthSelection = months[nextIndex].key;
          renderGoalCards(goalMetrics);
        }

        function formatGoalWeekLabel(weekKey, fallbackDate) {
          if (typeof weekKey === "string") {
            const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
            if (match) {
              return `W${match[2]} ${match[1]}`;
            }
            return weekKey;
          }
          if (fallbackDate instanceof Date) {
            const iso = toIsoWeek(fallbackDate);
            return `W${pad(iso.week)} ${iso.year}`;
          }
          return "Week";
        }

        function getSelectedGoalWeek(goal1) {
          const weekly = goal1 && Array.isArray(goal1.weekly) ? goal1.weekly : [];
          if (!weekly.length) {
            state.goalWeekSelection = null;
            return null;
          }
          const existingIndex = weekly.findIndex(week => week.weekKey === state.goalWeekSelection);
          if (existingIndex >= 0) {
            return weekly[existingIndex];
          }
          const fallback = weekly[weekly.length - 1];
          state.goalWeekSelection = fallback ? fallback.weekKey : null;
          return fallback || null;
        }

        function updateGoalWeekNavigation(goal1, selectedWeek) {
          if (!dom.goalWeekNav || !dom.goalWeekPrev || !dom.goalWeekNext || !dom.goalWeekLabel) {
            return;
          }
          const weekly = goal1 && Array.isArray(goal1.weekly) ? goal1.weekly : [];
          if (!weekly.length || !selectedWeek) {
            dom.goalWeekNav.hidden = true;
            dom.goalWeekLabel.textContent = "Latest week";
            dom.goalWeekPrev.disabled = true;
            dom.goalWeekNext.disabled = true;
            return;
          }
          const currentIndex = weekly.findIndex(week => week.weekKey === selectedWeek.weekKey);
          const safeIndex = currentIndex >= 0 ? currentIndex : weekly.length - 1;
          dom.goalWeekNav.hidden = false;
          dom.goalWeekLabel.textContent = formatGoalWeekLabel(selectedWeek.weekKey, selectedWeek.date);
          dom.goalWeekPrev.disabled = safeIndex <= 0;
          dom.goalWeekNext.disabled = safeIndex >= weekly.length - 1;
        }

        function shiftGoalWeek(step) {
          const goalMetrics = state.latestGoalMetrics;
          const goal1 = goalMetrics && goalMetrics.goal1 ? goalMetrics.goal1 : null;
          const weekly = goal1 && Array.isArray(goal1.weekly) ? goal1.weekly : [];
          if (!weekly.length) {
            return;
          }
          const currentIndex = weekly.findIndex(week => week.weekKey === state.goalWeekSelection);
          const safeIndex = currentIndex >= 0 ? currentIndex : weekly.length - 1;
          const nextIndex = Math.max(0, Math.min(weekly.length - 1, safeIndex + step));
          if (nextIndex === safeIndex) {
            return;
          }
          state.goalWeekSelection = weekly[nextIndex].weekKey;
          renderGoalCards(goalMetrics);
        }

        function renderGoalTrend(weekly) {
          if (!dom.goal1Trend) {
            return;
          }
          dom.goal1Trend.innerHTML = "";
          const entries = Array.isArray(weekly) ? weekly.slice(-GOAL_REQUIRED_WEEKS) : [];
          const fragment = document.createDocumentFragment();
          const placeholdersNeeded = Math.max(0, GOAL_REQUIRED_WEEKS - entries.length);
          for (let index = 0; index < placeholdersNeeded; index += 1) {
            const placeholder = document.createElement("div");
            placeholder.className = "goal-trend__item goal-trend__item--empty";
            const labelNode = document.createElement("span");
            labelNode.className = "goal-trend__item-label";
            labelNode.textContent = "Week";
            const valueNode = document.createElement("span");
            valueNode.className = "goal-trend__item-value";
            valueNode.textContent = "-";
            placeholder.append(labelNode, valueNode);
            fragment.appendChild(placeholder);
          }
          entries.forEach(entry => {
            const item = document.createElement("div");
            const isSelected = state.goalWeekSelection && entry.weekKey === state.goalWeekSelection;
            item.className = `goal-trend__item${entry.metTarget ? " is-pass" : ""}${isSelected ? " is-selected" : ""}`;
            item.dataset.weekKey = entry.weekKey;
            const weekLabel = formatGoalWeekLabel(entry.weekKey, entry.date);
            const value = Number.isFinite(entry.attainmentPct) ? `${entry.attainmentPct.toFixed(1)}%` : "-";
            const labelNode = document.createElement("span");
            labelNode.className = "goal-trend__item-label";
            labelNode.textContent = weekLabel;
            const valueNode = document.createElement("span");
            valueNode.className = "goal-trend__item-value";
            valueNode.textContent = value;
            item.append(labelNode, valueNode);
            fragment.appendChild(item);
          });
          dom.goal1Trend.appendChild(fragment);
        }

        function updateGoalMonthlyChart(goal1, selectedMonth) {
          const chart = state.charts.goal1Monthly;
          if (!chart || !dom.goal1MonthlyChartWrap) {
            return;
          }
          const months = goal1 && Array.isArray(goal1.months) ? goal1.months : [];
          if (!months.length) {
            chart.data.labels = [];
            if (chart.data.datasets && chart.data.datasets[0]) {
              chart.data.datasets[0].data = [];
            }
            if (chart.data.datasets && chart.data.datasets[1]) {
              chart.data.datasets[1].data = [];
            }
            chart.update("none");
            dom.goal1MonthlyChartWrap.hidden = true;
            if (dom.goal1MonthlyChartNote) {
              dom.goal1MonthlyChartNote.hidden = true;
              dom.goal1MonthlyChartNote.textContent = "";
            }
            return;
          }
          dom.goal1MonthlyChartWrap.hidden = false;
          const selectedKey = selectedMonth && selectedMonth.key ? selectedMonth.key : null;
          const labels = months.map(month => month.label || month.key || "");
          const values = months.map(month => (
            Number.isFinite(month.attainmentPct)
              ? Number(month.attainmentPct.toFixed(1))
              : 0
          ));
          const targetValues = months.map(() => 100);
          const validValues = values.filter(value => Number.isFinite(value));
          const monthlyYScale = chart.options?.scales?.y;
          if (monthlyYScale) {
            const minValue = validValues.length ? Math.min(...validValues) : 0;
            const useHighValueZoom = validValues.length > 0 && minValue >= 80;
            monthlyYScale.min = useHighValueZoom
              ? Math.max(70, Math.floor((minValue - 5) / 5) * 5)
              : 0;
            monthlyYScale.max = useHighValueZoom ? 104 : 102;
            monthlyYScale.beginAtZero = monthlyYScale.min === 0;
          }
          const pointRadii = months.map(month => (selectedKey && month.key === selectedKey ? 6 : 2.5));
          const pointHoverRadii = months.map(month => (selectedKey && month.key === selectedKey ? 8 : 5));
          const pointBackground = months.map(month => (selectedKey && month.key === selectedKey ? getCssVariableValue("--green-600", "#008A00") : "#ffffff"));
          const pointBorderWidths = months.map(month => (selectedKey && month.key === selectedKey ? 2.5 : 1.5));
          chart.data.labels = labels;
          if (chart.data.datasets && chart.data.datasets[0]) {
            chart.data.datasets[0].data = values;
            chart.data.datasets[0].pointRadius = pointRadii;
            chart.data.datasets[0].pointHoverRadius = pointHoverRadii;
            chart.data.datasets[0].pointBackgroundColor = pointBackground;
            chart.data.datasets[0].pointBorderWidth = pointBorderWidths;
          }
          if (chart.data.datasets && chart.data.datasets[1]) {
            chart.data.datasets[1].data = targetValues;
          }
          const monthlyCtx = chart.ctx;
          if (monthlyCtx && chart.chartArea) {
            const grad = monthlyCtx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            const gLineColor = getCssVariableValue("--green-600", "#008A00");
            grad.addColorStop(0, hexToRgba(colorStringToHex(gLineColor) || "#008A00", 0.18));
            grad.addColorStop(1, hexToRgba(colorStringToHex(gLineColor) || "#008A00", 0.02));
            chart.data.datasets[0].backgroundColor = grad;
          }
          chart.update("none");
          if (dom.goal1MonthlyChartNote) {
            dom.goal1MonthlyChartNote.hidden = false;
            if (selectedMonth && selectedMonth.label) {
              dom.goal1MonthlyChartNote.textContent = `Monthly compliant reach trend. Selected month: ${selectedMonth.label}.`;
            } else {
              dom.goal1MonthlyChartNote.textContent = "Monthly compliant reach trend.";
            }
          }
        }

        function updateGoalWeeklyChart(goal1, selectedWeek) {
          const chart = state.charts.goal1Weekly;
          if (!chart || !dom.goal1WeeklyChartWrap) {
            return;
          }
          const weekly = goal1 && Array.isArray(goal1.weekly) ? goal1.weekly : [];
          if (!weekly.length) {
            chart.data.labels = [];
            if (chart.data.datasets && chart.data.datasets[0]) {
              chart.data.datasets[0].data = [];
            }
            if (chart.data.datasets && chart.data.datasets[1]) {
              chart.data.datasets[1].data = [];
            }
            chart.update("none");
            dom.goal1WeeklyChartWrap.hidden = true;
            if (dom.goal1WeeklyChartNote) {
              dom.goal1WeeklyChartNote.hidden = true;
              dom.goal1WeeklyChartNote.textContent = "";
            }
            return;
          }
          dom.goal1WeeklyChartWrap.hidden = false;
          const selectedKey = selectedWeek && selectedWeek.weekKey ? selectedWeek.weekKey : null;
          const labels = weekly.map(week => formatGoalWeekLabel(week.weekKey, week.date));
          const values = weekly.map(week => (
            Number.isFinite(week.attainmentPct)
              ? Number(week.attainmentPct.toFixed(1))
              : 0
          ));
          const targetValues = weekly.map(() => 100);
          const pointRadii = weekly.map(week => (selectedKey && week.weekKey === selectedKey ? 6 : 2.5));
          const pointHoverRadii = weekly.map(week => (selectedKey && week.weekKey === selectedKey ? 8 : 5));
          const pointBackground = weekly.map(week => (selectedKey && week.weekKey === selectedKey ? getCssVariableValue("--green-600", "#008A00") : "#ffffff"));
          const pointBorderWidths = weekly.map(week => (selectedKey && week.weekKey === selectedKey ? 2.5 : 1.5));
          chart.data.labels = labels;
          if (chart.data.datasets && chart.data.datasets[0]) {
            chart.data.datasets[0].data = values;
            chart.data.datasets[0].pointRadius = pointRadii;
            chart.data.datasets[0].pointHoverRadius = pointHoverRadii;
            chart.data.datasets[0].pointBackgroundColor = pointBackground;
            chart.data.datasets[0].pointBorderWidth = pointBorderWidths;
          }
          if (chart.data.datasets && chart.data.datasets[1]) {
            chart.data.datasets[1].data = targetValues;
          }
          const weeklyCtx = chart.ctx;
          if (weeklyCtx && chart.chartArea) {
            const grad = weeklyCtx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            const gLineColor = getCssVariableValue("--green-600", "#008A00");
            grad.addColorStop(0, hexToRgba(colorStringToHex(gLineColor) || "#008A00", 0.22));
            grad.addColorStop(1, hexToRgba(colorStringToHex(gLineColor) || "#008A00", 0.02));
            chart.data.datasets[0].backgroundColor = grad;
          }
          chart.update("none");
          if (dom.goal1WeeklyChartNote) {
            dom.goal1WeeklyChartNote.hidden = false;
            if (selectedWeek && selectedWeek.weekKey) {
              dom.goal1WeeklyChartNote.textContent = `Weekly adoption progress (attainment vs 100% target). Selected: ${formatGoalWeekLabel(selectedWeek.weekKey, selectedWeek.date)}.`;
            } else {
              dom.goal1WeeklyChartNote.textContent = "Weekly adoption progress (attainment vs 100% target).";
            }
          }
        }

        function renderGoalCards(goalMetrics) {
          if (!dom.goalsCard) {
            return;
          }
          const metrics = goalMetrics && typeof goalMetrics === "object" ? goalMetrics : createDefaultGoalMetrics();
          const goal1 = metrics.goal1 || createDefaultGoalMetrics().goal1;
          const hasGoal1 = Array.isArray(goal1.weekly) && goal1.weekly.length > 0;
          const selectedMonth = hasGoal1 ? getSelectedGoalMonth(goal1) : null;
          const selectedWeek = hasGoal1 ? getSelectedGoalWeek(goal1) : null;
          updateGoalMonthNavigation(goal1, selectedMonth);
          updateGoalWeekNavigation(goal1, selectedWeek);
          setButtonEnabled(dom.goalsExportCsv, hasGoal1);

          if (dom.goalsCaption) {
            if (!hasGoal1) {
              dom.goalsCaption.textContent = "Upload data to compute adoption progress.";
            } else {
              const monthLabel = selectedMonth && selectedMonth.label ? selectedMonth.label : "selected month";
              const weekLabel = selectedWeek ? formatGoalWeekLabel(selectedWeek.weekKey, selectedWeek.date) : "selected week";
              dom.goalsCaption.textContent = `Monthly panel shows compliant reach for ${monthLabel}. Weekly panel shows ${weekLabel}. Weekly attainment is strict (>=1 Copilot activity + >=1 active day).`;
            }
          }

          const periodSummary = goal1.periodSummary || { targetedUsers: 0, compliantUsers: 0, attainmentPct: 0 };
          const weeks = Array.isArray(goal1.weekly) ? goal1.weekly : [];
          const selectedSummary = selectedMonth
            ? {
                targetedUsers: selectedMonth.targetedUsers,
                compliantUsers: selectedMonth.compliantUsers,
                attainmentPct: selectedMonth.attainmentPct
              }
            : periodSummary;
          const selectedAttainment = Number.isFinite(selectedSummary.attainmentPct) ? selectedSummary.attainmentPct : 0;
          const gapUsersRaw = Math.max(0, (selectedSummary.targetedUsers || 0) - (selectedSummary.compliantUsers || 0));
          const gapPctRaw = Math.max(0, 100 - selectedAttainment);
          const months = Array.isArray(goal1.months) ? goal1.months : [];
          const selectedMonthIndex = selectedMonth ? months.findIndex(month => month.key === selectedMonth.key) : -1;
          const previousMonth = selectedMonthIndex > 0 ? months[selectedMonthIndex - 1] : null;
          const previousAttainment = previousMonth && Number.isFinite(previousMonth.attainmentPct) ? previousMonth.attainmentPct : null;
          const monthDelta = previousAttainment == null ? null : selectedAttainment - previousAttainment;
          const trendSource = selectedMonth && Array.isArray(selectedMonth.weekly) && selectedMonth.weekly.length
            ? selectedMonth.weekly
            : goal1.weekly;
          const selectedWeeklySummary = selectedWeek
            ? {
                targetedUsers: selectedWeek.targetedUsers,
                compliantUsers: selectedWeek.compliantUsers,
                attainmentPct: selectedWeek.attainmentPct
              }
            : periodSummary;
          const selectedWeekIndex = selectedWeek ? weeks.findIndex(week => week.weekKey === selectedWeek.weekKey) : -1;
          const previousWeek = selectedWeekIndex > 0 ? weeks[selectedWeekIndex - 1] : null;
          const previousWeekAttainment = previousWeek && Number.isFinite(previousWeek.attainmentPct) ? previousWeek.attainmentPct : null;
          const weekDelta = previousWeekAttainment == null
            ? null
            : (Number.isFinite(selectedWeeklySummary.attainmentPct) ? selectedWeeklySummary.attainmentPct : 0) - previousWeekAttainment;
          const selectedWeeklyAttainment = Number.isFinite(selectedWeeklySummary.attainmentPct) ? selectedWeeklySummary.attainmentPct : 0;
          const weeklyGapUsers = Math.max(0, (selectedWeeklySummary.targetedUsers || 0) - (selectedWeeklySummary.compliantUsers || 0));
          const weeklyGapPct = Math.max(0, 100 - selectedWeeklyAttainment);

          if (dom.goal1Attainment) {
            dom.goal1Attainment.textContent = hasGoal1
              ? `${selectedAttainment.toFixed(1)}%`
              : "-";
          }
          if (dom.goal1Ratio) {
            const ratioPrefix = selectedMonth && selectedMonth.label
              ? `Compliant users / targeted users (${selectedMonth.label})`
              : "Compliant users / targeted users";
            dom.goal1Ratio.textContent = hasGoal1
              ? `${ratioPrefix}: ${numberFormatter.format(selectedSummary.compliantUsers)} / ${numberFormatter.format(selectedSummary.targetedUsers)}`
              : "Compliant users / targeted users: -";
          }
          if (dom.goal1KpiCompliant) {
            dom.goal1KpiCompliant.textContent = hasGoal1
              ? numberFormatter.format(selectedSummary.compliantUsers || 0)
              : "-";
          }
          if (dom.goal1KpiTargeted) {
            dom.goal1KpiTargeted.textContent = hasGoal1
              ? numberFormatter.format(selectedSummary.targetedUsers || 0)
              : "-";
          }
          if (dom.goal1KpiGapUsers) {
            dom.goal1KpiGapUsers.textContent = hasGoal1
              ? `${numberFormatter.format(gapUsersRaw)} users`
              : "-";
          }
          if (dom.goal1KpiGapPct) {
            dom.goal1KpiGapPct.textContent = hasGoal1
              ? `${gapPctRaw.toFixed(1)} pp to target`
              : "-";
          }
          if (dom.goal1KpiDelta) {
            if (!hasGoal1) {
              dom.goal1KpiDelta.textContent = "-";
              dom.goal1KpiDelta.classList.remove("is-positive", "is-negative");
            } else if (monthDelta == null) {
              dom.goal1KpiDelta.textContent = "n/a";
              dom.goal1KpiDelta.classList.remove("is-positive", "is-negative");
            } else {
              const sign = monthDelta > 0 ? "+" : "";
              dom.goal1KpiDelta.textContent = `${sign}${monthDelta.toFixed(1)} pp`;
              dom.goal1KpiDelta.classList.toggle("is-positive", monthDelta > 0);
              dom.goal1KpiDelta.classList.toggle("is-negative", monthDelta < 0);
            }
          }
          if (dom.goal1WeeklyAttainment) {
            dom.goal1WeeklyAttainment.textContent = hasGoal1 && selectedWeek
              ? `${selectedWeeklyAttainment.toFixed(1)}%`
              : "-";
          }
          if (dom.goal1WeeklyRatio) {
            const ratioPrefix = selectedWeek
              ? `Compliant / targeted (${formatGoalWeekLabel(selectedWeek.weekKey, selectedWeek.date)})`
              : "Compliant / targeted";
            dom.goal1WeeklyRatio.textContent = hasGoal1
              ? `${ratioPrefix}: ${numberFormatter.format(selectedWeeklySummary.compliantUsers || 0)} / ${numberFormatter.format(selectedWeeklySummary.targetedUsers || 0)}`
              : "Compliant / targeted: -";
          }
          if (dom.goal1WeeklyKpiCompliant) {
            dom.goal1WeeklyKpiCompliant.textContent = hasGoal1
              ? numberFormatter.format(selectedWeeklySummary.compliantUsers || 0)
              : "-";
          }
          if (dom.goal1WeeklyKpiTargeted) {
            dom.goal1WeeklyKpiTargeted.textContent = hasGoal1
              ? numberFormatter.format(selectedWeeklySummary.targetedUsers || 0)
              : "-";
          }
          if (dom.goal1WeeklyKpiGapUsers) {
            dom.goal1WeeklyKpiGapUsers.textContent = hasGoal1
              ? `${numberFormatter.format(weeklyGapUsers)} users`
              : "-";
          }
          if (dom.goal1WeeklyKpiGapPct) {
            dom.goal1WeeklyKpiGapPct.textContent = hasGoal1
              ? `${weeklyGapPct.toFixed(1)} pp to target`
              : "-";
          }
          if (dom.goal1WeeklyKpiDelta) {
            if (!hasGoal1) {
              dom.goal1WeeklyKpiDelta.textContent = "-";
              dom.goal1WeeklyKpiDelta.classList.remove("is-positive", "is-negative");
            } else if (weekDelta == null) {
              dom.goal1WeeklyKpiDelta.textContent = "n/a";
              dom.goal1WeeklyKpiDelta.classList.remove("is-positive", "is-negative");
            } else {
              const sign = weekDelta > 0 ? "+" : "";
              dom.goal1WeeklyKpiDelta.textContent = `${sign}${weekDelta.toFixed(1)} pp`;
              dom.goal1WeeklyKpiDelta.classList.toggle("is-positive", weekDelta > 0);
              dom.goal1WeeklyKpiDelta.classList.toggle("is-negative", weekDelta < 0);
            }
          }
          if (dom.goal1Sustained) {
            const sustained = selectedMonth && selectedMonth.sustained4of4
              ? selectedMonth.sustained4of4
              : (goal1.sustained4of4 || { status: GOAL_STATUS.INSUFFICIENT_DATA, windowWeeks: [] });
            if (sustained.status === GOAL_STATUS.PASS) {
              dom.goal1Sustained.textContent = "Sustained 4/4 weeks";
            } else if (sustained.status === GOAL_STATUS.FAIL) {
              dom.goal1Sustained.textContent = "Not sustained across last 4 weeks";
            } else {
              const availableWeeks = Array.isArray(trendSource) ? trendSource.length : 0;
              dom.goal1Sustained.textContent = `Need ${GOAL_REQUIRED_WEEKS} weeks (current: ${availableWeeks})`;
            }
          }
          if (dom.goal1WeeklyStatus) {
            dom.goal1WeeklyStatus.classList.remove("goal-status-pass", "goal-status-fail", "goal-status-neutral", "is-muted");
            if (!hasGoal1 || !selectedWeek) {
              dom.goal1WeeklyStatus.textContent = "Awaiting dataset.";
              dom.goal1WeeklyStatus.classList.add("goal-status-neutral");
            } else if ((selectedWeek.targetedUsers || 0) === 0) {
              dom.goal1WeeklyStatus.textContent = "No targeted users in selected week";
              dom.goal1WeeklyStatus.classList.add("goal-status-neutral");
            } else if (selectedWeek.metTarget) {
              dom.goal1WeeklyStatus.textContent = "On target this week";
              dom.goal1WeeklyStatus.classList.add("goal-status-pass");
            } else {
              dom.goal1WeeklyStatus.textContent = `${numberFormatter.format(weeklyGapUsers)} users short of 100% this week`;
              dom.goal1WeeklyStatus.classList.add("goal-status-fail");
            }
          }
          renderGoalTrend(trendSource);
          updateGoalMonthlyChart(goal1, selectedMonth);
          updateGoalWeeklyChart(goal1, selectedWeek);
        }

        function exportGoalMetricsCsv() {
          const goalMetrics = state.latestGoalMetrics;
          const goal1 = goalMetrics && goalMetrics.goal1 ? goalMetrics.goal1 : null;
          const weekly = goal1 && Array.isArray(goal1.weekly) ? goal1.weekly : [];
          const focusedWeek = weekly.find(entry => entry.weekKey === state.goalWeekSelection) || null;
          const focusedMonth = goal1 && Array.isArray(goal1.months)
            ? goal1.months.find(month => month.key === state.goalMonthSelection) || null
            : null;
          if (!weekly.length) {
            return;
          }
          const rows = weekly.map(entry => [
            GOAL_DEFINITIONS.goal1.id,
            GOAL_DEFINITIONS.goal1.statement,
            entry.weekKey || "",
            Number.isFinite(entry.compliantUsers) ? Math.round(entry.compliantUsers) : 0,
            Number.isFinite(entry.targetedUsers) ? Math.round(entry.targetedUsers) : 0,
            Number.isFinite(entry.attainmentPct) ? `${entry.attainmentPct.toFixed(1)}%` : "",
            entry.metTarget ? "YES" : "NO",
            String(GOAL_MIN_WEEKLY_ACTIVITY_EVENTS),
            String(GOAL_MIN_WEEKLY_ACTIVE_DAYS)
          ]);
          if (focusedWeek) {
            rows.push([
              GOAL_DEFINITIONS.goal1.id,
              `Selected week compliant reach (${formatGoalWeekLabel(focusedWeek.weekKey, focusedWeek.date)})`,
              focusedWeek.weekKey || "",
              Number.isFinite(focusedWeek.compliantUsers) ? Math.round(focusedWeek.compliantUsers) : 0,
              Number.isFinite(focusedWeek.targetedUsers) ? Math.round(focusedWeek.targetedUsers) : 0,
              Number.isFinite(focusedWeek.attainmentPct) ? `${focusedWeek.attainmentPct.toFixed(1)}%` : "",
              focusedWeek.metTarget ? "YES" : "NO",
              String(GOAL_MIN_WEEKLY_ACTIVITY_EVENTS),
              String(GOAL_MIN_WEEKLY_ACTIVE_DAYS)
            ]);
          }
          if (focusedMonth) {
            rows.push([
              GOAL_DEFINITIONS.goal1.id,
              `Selected month compliant reach (${focusedMonth.label || focusedMonth.key || "Month"})`,
              "",
              Number.isFinite(focusedMonth.compliantUsers) ? Math.round(focusedMonth.compliantUsers) : 0,
              Number.isFinite(focusedMonth.targetedUsers) ? Math.round(focusedMonth.targetedUsers) : 0,
              Number.isFinite(focusedMonth.attainmentPct) ? `${focusedMonth.attainmentPct.toFixed(1)}%` : "",
              "",
              String(GOAL_MIN_WEEKLY_ACTIVITY_EVENTS),
              String(GOAL_MIN_WEEKLY_ACTIVE_DAYS)
            ]);
          }
          const periodSummary = goal1.periodSummary || { targetedUsers: 0, compliantUsers: 0, attainmentPct: 0 };
          rows.push([
            GOAL_DEFINITIONS.goal1.id,
            "Selected period compliant reach",
            "",
            Number.isFinite(periodSummary.compliantUsers) ? Math.round(periodSummary.compliantUsers) : 0,
            Number.isFinite(periodSummary.targetedUsers) ? Math.round(periodSummary.targetedUsers) : 0,
            Number.isFinite(periodSummary.attainmentPct) ? `${periodSummary.attainmentPct.toFixed(1)}%` : "",
            "",
            String(GOAL_MIN_WEEKLY_ACTIVITY_EVENTS),
            String(GOAL_MIN_WEEKLY_ACTIVE_DAYS)
          ]);
          const sustainedStatus = goal1.sustained4of4 && goal1.sustained4of4.status
            ? goal1.sustained4of4.status
            : GOAL_STATUS.INSUFFICIENT_DATA;
          rows.push([
            GOAL_DEFINITIONS.goal1.id,
            "Sustained 4/4 weeks",
            "",
            "",
            "",
            sustainedStatus,
            "",
            "",
            ""
          ]);
          downloadCsv(
            "copilot-adoption-progress.csv",
            [
              "Goal",
              "Goal statement",
              "Week",
              "Compliant users",
              "Targeted users",
              "Attainment",
              "Status",
              "Activity threshold (weekly)",
              "Active days threshold (weekly)"
            ],
            rows
          );
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
          setDatasetMessage(promptMessage);
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
      
            const options = createTrendChartOptions(() => state.latestTrendPeriods, false);
      
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
              const existing = Array.from(document.scripts || []).find(script => script && script.src === GIFJS_SCRIPT_URL);
              if (existing) {
                existing.addEventListener("load", () => resolve(typeof GIF !== "undefined"), { once: true });
                existing.addEventListener("error", () => reject(new Error("Failed to load GIF export library.")), { once: true });
                return;
              }
              const script = document.createElement("script");
              script.src = GIFJS_SCRIPT_URL;
              script.async = true;
              script.crossOrigin = "anonymous";
              script.integrity = GIFJS_SCRIPT_INTEGRITY;
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

          // ── Excel style definitions ──
          const EXCEL_STYLES = {
            titleFont: { name: "Calibri", sz: 14, bold: true, color: { rgb: "1F2325" } },
            headerFont: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
            headerFill: { type: "pattern", patternType: "solid", fgColor: { rgb: "006E00" } },
            headerBorder: { bottom: { style: "thin", color: { rgb: "005300" } } },
            metaFont: { name: "Calibri", sz: 10, color: { rgb: "4D575D" } },
            metaLabelFont: { name: "Calibri", sz: 10, bold: true, color: { rgb: "1F2325" } },
            dataFont: { name: "Calibri", sz: 10, color: { rgb: "1F2325" } },
            accentFont: { name: "Calibri", sz: 11, bold: true, color: { rgb: "006E00" } },
            wrapAlignment: { wrapText: true, vertical: "top" },
            centerAlignment: { horizontal: "center", vertical: "center" },
            rightAlignment: { horizontal: "right" },
            thinBorder: {
              top: { style: "thin", color: { rgb: "DBDDDF" } },
              bottom: { style: "thin", color: { rgb: "DBDDDF" } },
              left: { style: "thin", color: { rgb: "DBDDDF" } },
              right: { style: "thin", color: { rgb: "DBDDDF" } }
            }
          };

          function applyStylesToSheet(sheet, config) {
            if (!sheet || !config) return;
            const { titleRow, headerRow, dataStartRow, dataEndRow, columnCount } = config;
            const cellRef = (r, c) => XLSX.utils.encode_cell({ r, c });

            if (titleRow !== undefined) {
              const cell = sheet[cellRef(titleRow, 0)];
              if (cell) cell.s = { font: EXCEL_STYLES.titleFont };
            }

            if (titleRow !== undefined && headerRow !== undefined) {
              for (let r = titleRow + 1; r < headerRow; r++) {
                for (let c = 0; c < columnCount; c++) {
                  const cell = sheet[cellRef(r, c)];
                  if (cell) {
                    cell.s = {
                      font: c === 0 ? EXCEL_STYLES.metaLabelFont : EXCEL_STYLES.metaFont,
                      alignment: EXCEL_STYLES.wrapAlignment
                    };
                  }
                }
              }
            }

            if (headerRow !== undefined) {
              for (let c = 0; c < columnCount; c++) {
                const cell = sheet[cellRef(headerRow, c)];
                if (cell) {
                  cell.s = {
                    font: EXCEL_STYLES.headerFont,
                    fill: EXCEL_STYLES.headerFill,
                    border: EXCEL_STYLES.headerBorder,
                    alignment: EXCEL_STYLES.centerAlignment
                  };
                }
              }
            }

            if (dataStartRow !== undefined && dataEndRow !== undefined) {
              const altFill = { type: "pattern", patternType: "solid", fgColor: { rgb: "F7F9F5" } };
              for (let r = dataStartRow; r <= dataEndRow; r++) {
                const isAlt = (r - dataStartRow) % 2 === 1;
                for (let c = 0; c < columnCount; c++) {
                  const cell = sheet[cellRef(r, c)];
                  if (cell) {
                    cell.s = {
                      font: EXCEL_STYLES.dataFont,
                      border: EXCEL_STYLES.thinBorder,
                      alignment: c === 0
                        ? EXCEL_STYLES.wrapAlignment
                        : { wrapText: true, vertical: "top", horizontal: "right" },
                      ...(isAlt ? { fill: altFill } : {})
                    };
                    if (typeof cell.v === "number") {
                      if (c === 1) cell.s.font = EXCEL_STYLES.accentFont;
                      if (cell.v >= 100 && cell.v === Math.round(cell.v)) {
                        cell.s.numFmt = "#,##0";
                      } else if (cell.v !== Math.round(cell.v)) {
                        cell.s.numFmt = "0.0";
                      }
                    }
                  }
                }
              }
            }

            // Freeze panes below header
            if (headerRow !== undefined) {
              if (!sheet["!views"]) sheet["!views"] = [];
              sheet["!views"][0] = { state: "frozen", ySplit: headerRow + 1 };
              if (!sheet["!rows"]) sheet["!rows"] = [];
              sheet["!rows"][headerRow] = { hpt: 22 };
            }
          }

          function applyDataSheetStyles(sheet, rows) {
            if (!sheet || !Array.isArray(rows) || rows.length < 2) return;
            applyStylesToSheet(sheet, {
              headerRow: 0,
              dataStartRow: 1,
              dataEndRow: rows.length - 1,
              columnCount: rows[0].length
            });
          }

          function applyDataSheetWithDescriptionStyles(sheet, rows) {
            if (!sheet || !Array.isArray(rows) || rows.length < 3) return;
            applyStylesToSheet(sheet, {
              titleRow: 0,
              headerRow: 1,
              dataStartRow: 2,
              dataEndRow: rows.length - 1,
              columnCount: rows[1].length
            });
          }

          // Helper: append a titled section to a rows array, return section boundaries
          function addExcelSection(rows, title, info, headers, dataRows, colCount) {
            if (rows.length > 0) rows.push(new Array(colCount).fill(""));  // blank separator
            const titleRow = rows.length;
            const titleArr = new Array(colCount).fill("");
            titleArr[0] = title;
            rows.push(titleArr);
            const infoRow = rows.length;
            const infoArr = new Array(colCount).fill("");
            infoArr[0] = info;
            rows.push(infoArr);
            const headerRow = rows.length;
            const paddedHeaders = headers.concat(new Array(Math.max(0, colCount - headers.length)).fill(""));
            rows.push(paddedHeaders);
            const dataStartRow = rows.length;
            dataRows.forEach(r => {
              const paddedRow = r.concat(new Array(Math.max(0, colCount - r.length)).fill(""));
              rows.push(paddedRow);
            });
            const dataEndRow = rows.length - 1;
            return { titleRow, infoRow, headerRow, dataStartRow, dataEndRow, columnCount: colCount };
          }

          // Style a multi-section sheet (sheet title + multiple data sections)
          function applyMultiSectionStyles(sheet, sections, sheetTitleRow) {
            if (!sheet) return;
            const cellRef = (r, c) => XLSX.utils.encode_cell({ r, c });
            // Sheet title — large bold
            const titleCell = sheet[cellRef(sheetTitleRow, 0)];
            if (titleCell) titleCell.s = { font: EXCEL_STYLES.titleFont };
            // Sheet info row — meta font
            const infoCell = sheet[cellRef(sheetTitleRow + 1, 0)];
            if (infoCell) infoCell.s = { font: EXCEL_STYLES.metaFont };

            const sectionTitleFont = { name: "Calibri", sz: 12, bold: true, color: { rgb: "006E00" } };
            const altFill = { type: "pattern", patternType: "solid", fgColor: { rgb: "F7F9F5" } };

            sections.forEach(sec => {
              const cols = sec.columnCount || 6;
              // Section title — green bold
              const stCell = sheet[cellRef(sec.titleRow, 0)];
              if (stCell) stCell.s = { font: sectionTitleFont };
              // Section info — gray
              const siCell = sheet[cellRef(sec.infoRow, 0)];
              if (siCell) siCell.s = { font: EXCEL_STYLES.metaFont };
              // Header row — green fill, white bold
              for (let c = 0; c < cols; c++) {
                const cell = sheet[cellRef(sec.headerRow, c)];
                if (cell) {
                  cell.s = {
                    font: EXCEL_STYLES.headerFont,
                    fill: EXCEL_STYLES.headerFill,
                    border: EXCEL_STYLES.headerBorder,
                    alignment: EXCEL_STYLES.centerAlignment
                  };
                }
              }
              // Data rows — alternating fill, borders, number formatting
              if (sec.dataStartRow <= sec.dataEndRow) {
                for (let r = sec.dataStartRow; r <= sec.dataEndRow; r++) {
                  const isAlt = (r - sec.dataStartRow) % 2 === 1;
                  for (let c = 0; c < cols; c++) {
                    const cell = sheet[cellRef(r, c)];
                    if (cell) {
                      cell.s = {
                        font: EXCEL_STYLES.dataFont,
                        border: EXCEL_STYLES.thinBorder,
                        alignment: c === 0
                          ? EXCEL_STYLES.wrapAlignment
                          : { wrapText: true, vertical: "top", horizontal: "right" },
                        ...(isAlt ? { fill: altFill } : {})
                      };
                      if (typeof cell.v === "number") {
                        if (c === 1) cell.s.font = EXCEL_STYLES.accentFont;
                        if (cell.v >= 100 && cell.v === Math.round(cell.v)) {
                          cell.s.numFmt = "#,##0";
                        } else if (cell.v !== Math.round(cell.v)) {
                          cell.s.numFmt = "0.0";
                        }
                      }
                    }
                  }
                }
              }
              // Header row height
              if (!sheet["!rows"]) sheet["!rows"] = [];
              sheet["!rows"][sec.headerRow] = { hpt: 22 };
            });

            // Freeze below sheet title area
            if (!sheet["!views"]) sheet["!views"] = [];
            sheet["!views"][0] = { state: "frozen", ySplit: sheetTitleRow + 2 };
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
              const maxWidth = (columnIndex === columnCount - 1 && maxLength > 30) ? 55 : 40;
              columnWidths.push({ wch: Math.min(Math.max(maxLength + 2, 12), maxWidth) });
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
            if (typeof XLSX === "undefined" || !XLSX.utils || (!XLSX.writeFile && !XLSX.write)) {
              showExportHint("Excel export library not available.", true);
              return;
            }
            const periods = Array.isArray(state.latestTrendPeriods) ? state.latestTrendPeriods : [];
            if (!periods.length) {
              showExportHint("Load data to export totals.", true);
              return;
            }
            const rows = buildTrendTotalsRows(periods);
            try {
              const worksheet = XLSX.utils.aoa_to_sheet(rows);
              sanitizeWorksheetCellsForSpreadsheet(worksheet);
              autoSizeWorksheetColumns(worksheet, rows);
              applyDataSheetStyles(worksheet, rows);
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
                const adoptionUserCount = Number.isFinite(period?.adoptionUserCount) ? period.adoptionUserCount : userCount;
                const enabledCount = Number.isFinite(period?.enabledUsersCount) ? period.enabledUsersCount : 0;
                const adoptionEnabledCount = Number.isFinite(period?.adoptionEnabledUsersCount) ? period.adoptionEnabledUsersCount : enabledCount;
                const adoptionRate = Number.isFinite(period?.adoptionRate) ? period.adoptionRate : 0;
                const avgActions = Number.isFinite(period?.averageActionsPerUser) ? period.averageActionsPerUser : 0;
                const avgHours = Number.isFinite(period?.averageHoursPerUser) ? period.averageHoursPerUser : 0;
                const selectedValue = metric === "hours"
                  ? Number(formatTrendFixed(assistedHours, 1))
                  : (metric === "adoption" ? Number(formatTrendFixed(adoptionRate, 1)) : totalActions);
                const exportUserCount = metric === "adoption" ? adoptionUserCount : userCount;
                const exportEnabledCount = metric === "adoption" ? adoptionEnabledCount : enabledCount;

                return [
                  period && typeof period.label === "string" ? period.label : "",
                  date,
                  selectedValue,
                  totalActions,
                  Number(formatTrendFixed(assistedHours, 1)),
                  exportUserCount,
                  exportEnabledCount,
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
            if (typeof XLSX === "undefined" || !XLSX.utils || (!XLSX.writeFile && !XLSX.write)) {
              showExportHint("Excel export library not available.", true);
              return;
            }
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
              const activeUsers = aggregates.actionActiveUsers instanceof Set
                ? aggregates.actionActiveUsers.size
                : (aggregates.activeUsers instanceof Set ? aggregates.activeUsers.size : 0);
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
                overviewRows.push([`Top ${organizationGroupLabelPlural} by actions`, parts.join("\n"), `${organizationGroupLabelPlural} in this view.`]);
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
                overviewRows.push([`Top ${countryGroupLabelPlural} by actions`, parts.join("\n"), `${countryGroupLabelPlural} with the highest total actions.`]);
              }

              // Returning users summary
              const retAgg = state.latestReturningAggregates;
              if (retAgg && Array.isArray(retAgg.periods) && retAgg.periods.length) {
                const retSeries = generateReturningSeries(retAgg, state.returningInterval || DEFAULT_RETURNING_INTERVAL);
                if (retSeries.totals.length) {
                  const lastIdx = retSeries.totals.length - 1;
                  const lastTotal = retSeries.totals[lastIdx] || 0;
                  const lastReturning = retSeries.returningCounts[lastIdx] || 0;
                  const lastRate = lastTotal ? (lastReturning / lastTotal) * 100 : 0;
                  overviewRows.push(["Return rate (latest period)", Number(lastRate.toFixed(1)), "Percentage of prior-period active users who returned."]);
                  overviewRows.push(["Returning users (latest period)", lastReturning, "Users active in both this and the prior period."]);
                }
              }
              // Adoption progress summary
              const goalMetrics = state.latestGoalMetrics;
              if (goalMetrics && goalMetrics.goal1 && goalMetrics.goal1.periodSummary) {
                const ps = goalMetrics.goal1.periodSummary;
                overviewRows.push(["Monthly compliant reach", Number((ps.attainmentPct || 0).toFixed(1)), "Percentage of targeted users meeting compliance criteria."]);
                overviewRows.push(["Compliant users", ps.compliantUsers || 0, "Users meeting Copilot activity + active days criteria."]);
                overviewRows.push(["Targeted users", ps.targetedUsers || 0, "Users with Copilot licenses (targeted for adoption)."]);
              }

              const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
              sanitizeWorksheetCellsForSpreadsheet(overviewSheet);
              autoSizeWorksheetColumns(overviewSheet, overviewRows);
              const overviewHeaderIdx = overviewRows.findIndex(r => r[0] === "Metric");
              applyStylesToSheet(overviewSheet, {
                titleRow: 0,
                headerRow: overviewHeaderIdx >= 0 ? overviewHeaderIdx : undefined,
                dataStartRow: overviewHeaderIdx >= 0 ? overviewHeaderIdx + 1 : undefined,
                dataEndRow: overviewRows.length - 1,
                columnCount: 3
              });
              XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

              // ── Sheet 2: "Trends" (Trend totals + Licenses + Returning users + Adoption progress) ──
              {
                const trendsRows = [];
                const trendsSections = [];
                const maxTrendCols = 5;  // widest section is returning users (5 cols)

                // Sheet title
                trendsRows.push(["Trends & timeline data", "", "", "", ""]);
                trendsRows.push(["Period-by-period metrics from the Copilot impact dashboard.", "", "", "", ""]);

                // Section A: Impact trend totals
                const trendPeriods = Array.isArray(aggregates.periods) ? aggregates.periods : [];
                if (trendPeriods.length) {
                  const built = buildTrendTotalsRows(trendPeriods);
                  const trendHeaders = built[0];
                  const trendData = built.slice(1);
                  trendsSections.push(addExcelSection(
                    trendsRows,
                    "Impact trend totals",
                    "Aggregated Copilot actions, hours, and active users per period.",
                    trendHeaders,
                    trendData,
                    maxTrendCols
                  ));
                }

                // Section B: Enabled Copilot users (licenses)
                const monthlyEnabled = Array.isArray(aggregates.monthlyEnabledUsers)
                  ? aggregates.monthlyEnabledUsers
                  : (Array.isArray(state.latestEnabledTimeline) ? state.latestEnabledTimeline : []);
                if (monthlyEnabled.length) {
                  const licHeaders = ["Month", "Enabled Copilot users", "Explanation"];
                  const licData = [];
                  monthlyEnabled.forEach(entry => {
                    licData.push([
                      entry.label || entry.key || "",
                      Number.isFinite(entry.count) ? entry.count : 0,
                      "Unique users enabled for Copilot in the representative week for this month."
                    ]);
                  });
                  trendsSections.push(addExcelSection(
                    trendsRows,
                    "Enabled Copilot users (licenses)",
                    "Monthly count of users with an active Copilot license.",
                    licHeaders,
                    licData,
                    maxTrendCols
                  ));
                }

                // Section C: Returning users
                const retAggForSheet = state.latestReturningAggregates;
                if (retAggForSheet && Array.isArray(retAggForSheet.periods) && retAggForSheet.periods.length) {
                  const retSeries = generateReturningSeries(retAggForSheet, state.returningInterval || DEFAULT_RETURNING_INTERVAL);
                  if (retSeries.labels.length) {
                    const retHeaders = ["Period", "Active users", "Returning users", "Return rate (%)", "Change vs prior (pp)"];
                    const retData = [];
                    retSeries.labels.forEach((label, i) => {
                      const total = retSeries.totals[i] || 0;
                      const returning = retSeries.returningCounts[i] || 0;
                      const rate = total ? Number(((returning / total) * 100).toFixed(1)) : 0;
                      const prevTotal = i > 0 ? (retSeries.totals[i - 1] || 0) : 0;
                      const prevReturning = i > 0 ? (retSeries.returningCounts[i - 1] || 0) : 0;
                      const prevRate = prevTotal ? (prevReturning / prevTotal) * 100 : 0;
                      const delta = i > 0 ? Number((rate - prevRate).toFixed(1)) : "";
                      retData.push([label, total, returning, rate, delta]);
                    });
                    trendsSections.push(addExcelSection(
                      trendsRows,
                      "Returning users",
                      "Users active in consecutive periods. Return rate = returning / prior-period active users.",
                      retHeaders,
                      retData,
                      maxTrendCols
                    ));
                  }
                }

                // Section D: Adoption progress
                const goalExportMetrics = state.latestGoalMetrics;
                if (goalExportMetrics && goalExportMetrics.goal1) {
                  const g = goalExportMetrics.goal1;
                  const goalHeaders = ["Period", "Targeted users", "Compliant users", "Compliant reach (%)", "Met target"];
                  const goalData = [];
                  if (Array.isArray(g.months)) {
                    g.months.forEach(m => {
                      goalData.push([
                        m.label || m.key || "",
                        m.targetedUsers || 0,
                        m.compliantUsers || 0,
                        Number((m.attainmentPct || 0).toFixed(1)),
                        m.targetedUsers > 0 && m.compliantUsers === m.targetedUsers ? "Yes" : "No"
                      ]);
                    });
                  }
                  if (Array.isArray(g.weekly) && g.weekly.length) {
                    goalData.push(["", "", "", "", ""]);
                    goalData.push(["Weekly breakdown", "", "", "", ""]);
                    g.weekly.forEach(w => {
                      goalData.push([
                        w.weekKey || w.label || "",
                        w.targetedUsers || 0,
                        w.compliantUsers || 0,
                        Number((w.attainmentPct || 0).toFixed(1)),
                        w.metTarget ? "Yes" : "No"
                      ]);
                    });
                  }
                  if (goalData.length) {
                    trendsSections.push(addExcelSection(
                      trendsRows,
                      "Adoption progress",
                      "Compliance against 100% adoption target \u2014 monthly and weekly.",
                      goalHeaders,
                      goalData,
                      maxTrendCols
                    ));
                  }
                }

                if (trendsSections.length) {
                  const trendsSheet = XLSX.utils.aoa_to_sheet(trendsRows);
                  sanitizeWorksheetCellsForSpreadsheet(trendsSheet);
                  autoSizeWorksheetColumns(trendsSheet, trendsRows);
                  applyMultiSectionStyles(trendsSheet, trendsSections, 0);
                  XLSX.utils.book_append_sheet(workbook, trendsSheet, "Trends");
                }
              }

              // ── Sheet 3: "Breakdowns" (By organization + By country) ──
              {
                const bdRows = [];
                const bdSections = [];
                const bdCols = 6;

                bdRows.push(["Breakdowns by group", "", "", "", "", ""]);
                bdRows.push(["Copilot activity broken down by organization and country.", "", "", "", "", ""]);

                // Section A: By organization
                if (organizationGroups.length) {
                  const orgHeaders = ["Organization / group", "Total actions", "Assisted hours", "Active users", "Avg actions per user", "Share of total actions"];
                  const orgData = [];
                  const orgTotalActions = organizationGroups.reduce((sum, group) => {
                    return sum + (Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  }, 0);
                  organizationGroups.forEach(group => {
                    const groupActions = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                    const groupHours = Number.isFinite(group.assistedHours) ? group.assistedHours : 0;
                    const groupUsers = Number.isFinite(group.users) ? group.users : 0;
                    const groupAverage = Number.isFinite(group.averageActionsPerUser) ? group.averageActionsPerUser : 0;
                    const share = orgTotalActions ? (groupActions / orgTotalActions) * 100 : 0;
                    orgData.push([group.name || "Unspecified", groupActions, groupHours, groupUsers, groupAverage, share]);
                  });
                  bdSections.push(addExcelSection(
                    bdRows,
                    "By organization",
                    "Each row shows Copilot activity per organization or office.",
                    orgHeaders,
                    orgData,
                    bdCols
                  ));
                }

                // Section B: By country
                if (countryGroups.length) {
                  const countryHeaders = ["Country", "Total actions", "Assisted hours", "Active users", "Avg actions per user", "Share of total actions"];
                  const countryData = [];
                  const totalCountryActions = countryGroups.reduce((sum, group) => {
                    return sum + (Number.isFinite(group.totalActions) ? group.totalActions : 0);
                  }, 0);
                  countryGroups.forEach(group => {
                    const groupActions = Number.isFinite(group.totalActions) ? group.totalActions : 0;
                    const groupHours = Number.isFinite(group.assistedHours) ? group.assistedHours : 0;
                    const groupUsers = Number.isFinite(group.users) ? group.users : 0;
                    const groupAverage = Number.isFinite(group.averageActionsPerUser) ? group.averageActionsPerUser : 0;
                    const share = totalCountryActions ? (groupActions / totalCountryActions) * 100 : 0;
                    countryData.push([group.name || "Unspecified", groupActions, groupHours, groupUsers, groupAverage, share]);
                  });
                  bdSections.push(addExcelSection(
                    bdRows,
                    "By country",
                    "Each row shows Copilot activity per country.",
                    countryHeaders,
                    countryData,
                    bdCols
                  ));
                }

                if (bdSections.length) {
                  const bdSheet = XLSX.utils.aoa_to_sheet(bdRows);
                  sanitizeWorksheetCellsForSpreadsheet(bdSheet);
                  autoSizeWorksheetColumns(bdSheet, bdRows);
                  applyMultiSectionStyles(bdSheet, bdSections, 0);
                  XLSX.utils.book_append_sheet(workbook, bdSheet, "Breakdowns");
                }
              }

              // ── Sheet 4: "Apps & usage" (Adoption + App actions + Activity 30d + Categories) ──
              {
                const appsRows = [];
                const appsSections = [];
                const appsCols = 5;  // widest section is adoption (5 cols)

                appsRows.push(["Apps & usage details", "", "", "", ""]);
                appsRows.push(["Per-app adoption, actions, recent activity, and category breakdowns.", "", "", "", ""]);

                // Section A: Adoption by app
                const adoption = aggregates.adoption;
                const adoptionApps = adoption && Array.isArray(adoption.apps) ? adoption.apps : [];
                if (adoptionApps.length) {
                  const adpHeaders = ["Type", "Name", "Parent app", "Active users", "% of active users"];
                  const adpData = [];
                  adoptionApps.forEach(app => {
                    const appLabel = app.label || app.key || "App";
                    const appUsers = Number.isFinite(app.users) ? app.users : 0;
                    const appShareValue = Number.isFinite(app.share) ? app.share : 0;
                    adpData.push(["App", appLabel, "", appUsers, appShareValue]);
                    if (Array.isArray(app.features)) {
                      app.features.forEach(feature => {
                        const featureLabel = feature.label || feature.key || "Capability";
                        const featureUsers = Number.isFinite(feature.users) ? feature.users : 0;
                        const featureShareValue = Number.isFinite(feature.share) ? feature.share : 0;
                        adpData.push(["Capability", featureLabel, appLabel, featureUsers, featureShareValue]);
                      });
                    }
                  });
                  appsSections.push(addExcelSection(
                    appsRows,
                    "Adoption by app",
                    "Active users per app and capability, with share of total active users.",
                    adpHeaders,
                    adpData,
                    appsCols
                  ));
                }

                // Section B: App actions
                if (perAppActions.length) {
                  const aaHeaders = ["App", "Total actions", "Notes"];
                  const aaData = [];
                  perAppActions.forEach(app => {
                    const label = app.label || app.key || "App";
                    const total = Number.isFinite(app.total) ? app.total : 0;
                    aaData.push([label, total, "Total Copilot actions for this app."]);
                  });
                  appsSections.push(addExcelSection(
                    appsRows,
                    "App actions",
                    "Total Copilot actions attributed to each app in the current filters.",
                    aaHeaders,
                    aaData,
                    appsCols
                  ));
                }

                // Section C: Recent activity (30 days)
                const activeDaysExport = state.latestActiveDays;
                if (activeDaysExport && typeof activeDaysExport === "object") {
                  const uniqueUsers = activeDaysExport.uniqueUsers || {};
                  const promptTotals = activeDaysExport.promptTotals || {};
                  const allKeys = new Set([...Object.keys(uniqueUsers), ...Object.keys(promptTotals)]);
                  if (allKeys.size) {
                    const adHeaders = ["App", "Unique users (last 30d)", "Total prompts (last 30d)"];
                    const adData = [];
                    Array.from(allKeys)
                      .sort((a, b) => (uniqueUsers[b] || 0) - (uniqueUsers[a] || 0))
                      .forEach(app => {
                        adData.push([app, uniqueUsers[app] || 0, promptTotals[app] || 0]);
                      });
                    appsSections.push(addExcelSection(
                      appsRows,
                      "Recent activity (last 30 days)",
                      "Unique users and total prompts per app in the last 30 days.",
                      adHeaders,
                      adData,
                      appsCols
                    ));
                  }
                }

                // Section D: Usage by category
                const categoryTotalsExport = aggregates.categoryTotals;
                if (categoryTotalsExport && typeof categoryTotalsExport === "object") {
                  const catHeaders = ["Category", "Metric", "Value"];
                  const catData = [];
                  Object.entries(categoryTotalsExport).forEach(([category, totals]) => {
                    if (!totals) return;
                    const catLabel = (typeof categoryLabels !== "undefined" && categoryLabels[category]) || category;
                    const total = typeof totals.total === "number" ? totals.total : (typeof totals.primary === "number" ? totals.primary : 0);
                    catData.push([catLabel, `${catLabel} actions`, total]);
                    if (Number.isFinite(totals.primary)) {
                      const labels = (typeof categoryMetricLabels !== "undefined" && categoryMetricLabels[category]) || {};
                      const cfg = (typeof categoryConfig !== "undefined" && categoryConfig[category]) || {};
                      if (cfg.primary) {
                        catData.push([catLabel, labels[cfg.primary] || cfg.primary, totals.primary]);
                      }
                    }
                    if (Array.isArray(totals.secondary)) {
                      const labels = (typeof categoryMetricLabels !== "undefined" && categoryMetricLabels[category]) || {};
                      const cfg = (typeof categoryConfig !== "undefined" && categoryConfig[category]) || {};
                      (cfg.secondary || []).forEach((field, idx) => {
                        catData.push([catLabel, labels[field] || field, totals.secondary[idx] || 0]);
                      });
                    }
                  });
                  if (catData.length) {
                    appsSections.push(addExcelSection(
                      appsRows,
                      "Usage by category",
                      "Copilot usage broken down by category (Meetings, Email, Teams, etc.).",
                      catHeaders,
                      catData,
                      appsCols
                    ));
                  }
                }

                if (appsSections.length) {
                  const appsSheet = XLSX.utils.aoa_to_sheet(appsRows);
                  sanitizeWorksheetCellsForSpreadsheet(appsSheet);
                  autoSizeWorksheetColumns(appsSheet, appsRows);
                  applyMultiSectionStyles(appsSheet, appsSections, 0);
                  XLSX.utils.book_append_sheet(workbook, appsSheet, "Apps & usage");
                }
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
            if (!window.jspdf || !window.jspdf.jsPDF) {
              showExportHint("PDF export libraries are not available.", true);
              return;
            }
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
              const activeUsers = aggregates.actionActiveUsers instanceof Set
                ? aggregates.actionActiveUsers.size
                : (aggregates.activeUsers instanceof Set ? aggregates.activeUsers.size : 0);
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
      
          function parseNumber(value, dialect = null) {
            if (value == null || value === "") {
              return 0;
            }
            if (typeof value === "number") {
              return Number.isFinite(value) ? value : 0;
            }
            let normalized = String(value).trim();
            if (!normalized) {
              return 0;
            }
            normalized = normalized.replace(/\u00A0/g, " ").replace(/\s+/g, "");
            const numberDialect = dialect && typeof dialect === "object"
              ? dialect
              : DEFAULT_NUMBER_DIALECT;
            const hasComma = normalized.includes(",");
            const hasDot = normalized.includes(".");
            if (hasComma && hasDot) {
              if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
                normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
              } else {
                normalized = normalized.replace(/,/g, "");
              }
            } else if (hasComma) {
              const commaCount = (normalized.match(/,/g) || []).length;
              const tail = normalized.split(",").pop() || "";
              const treatAsDecimal = numberDialect.decimalSeparator === ","
                || (/^-?\d+,\d+$/.test(normalized) && tail.length !== 3)
                || (commaCount === 1 && tail.length <= 2);
              normalized = treatAsDecimal
                ? normalized.replace(/,/g, ".")
                : normalized.replace(/,/g, "");
            } else if (hasDot) {
              const dotCount = (normalized.match(/\./g) || []).length;
              const tail = normalized.split(".").pop() || "";
              const treatAsThousands = numberDialect.decimalSeparator === ","
                && dotCount >= 1
                && tail.length === 3;
              if (treatAsThousands) {
                normalized = normalized.replace(/\./g, "");
              }
            }
            normalized = normalized.replace(/[^0-9eE.+\-]/g, "");
            if (!normalized || normalized === "-" || normalized === ".") {
              return 0;
            }
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : 0;
          }
      
          function parseMetricDate(value, dialect = null) {
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
              let first = Number(slashMatch[1]);
              let second = Number(slashMatch[2]);
              let year = Number(slashMatch[3]);
              if (year < 100) {
                year += 2000;
              }
              if (!Number.isFinite(year) || !Number.isFinite(first) || !Number.isFinite(second)) {
                return null;
              }
              const dateDialect = dialect && typeof dialect === "object"
                ? dialect
                : DEFAULT_DATE_DIALECT;
              const slashOrder = dateDialect.slashOrder === "dmy" ? "dmy" : "mdy";
              let month = first;
              let day = second;
              if (first > 12 && second <= 12) {
                day = first;
                month = second;
              } else if (second > 12 && first <= 12) {
                month = first;
                day = second;
              } else if (slashOrder === "dmy") {
                day = first;
                month = second;
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

          function ensureDatasetFieldLookup(fields, sampleRows) {
            if (currentCsvFieldLookup && currentCsvFieldLookup.size) {
              return;
            }
            const sampleRowList = toSampleRowArray(sampleRows);
            const fieldList = Array.isArray(fields) && fields.length
              ? fields
              : (sampleRowList[0] ? Object.keys(sampleRowList[0]) : []);
            if (!fieldList || !fieldList.length) {
              return;
            }
            const schemaInfo = resolveDatasetSchema(fieldList, sampleRowList);
            const mapping = resolveDatasetFieldMapping(fieldList, schemaInfo, sampleRowList);
            currentDatasetContext = mapping && mapping.context ? mapping.context : createDefaultDatasetContext();
            currentCsvFieldLookup = mapping && mapping.fieldLookup ? mapping.fieldLookup : buildFieldLookup(fieldList);
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
