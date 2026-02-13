#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const SAMPLE_CONFIGS = [
  {
    name: "Viva Analytics Copilot Impact",
    input: path.join(repoRoot, "sample_2 year_Copilot viva_insights_premium.Csv"),
    output: path.join(repoRoot, "samples", "viva-analytics-copilot-impact.csv"),
    rowCount: 10000,
    seed: 8301
  },
  {
    name: "Copilot Dashboard export",
    input: path.join(repoRoot, "Copilot_dashboard_metric_Feb13_2026_1324Hours.csv"),
    output: path.join(repoRoot, "samples", "copilot-dashboard-export.csv"),
    rowCount: 10000,
    seed: 8907
  }
];

const OFFICE_PROFILES = [
  { office: "Aurora Point Campus", country: "Nordhaven", domain: "aurora.nordcloud.example" },
  { office: "Harborline Collaboration Hub", country: "Vestmark", domain: "harborline.vestmark.example" },
  { office: "Skybridge Productivity Center", country: "Luminara", domain: "skybridge.luminara.example" },
  { office: "Pinecrest Innovation Yard", country: "Arcteris", domain: "pinecrest.arcteris.example" },
  { office: "Mariner Data House", country: "Solstrand", domain: "mariner.solstrand.example" },
  { office: "Northforge Operations Studio", country: "Terralis", domain: "northforge.terralis.example" },
  { office: "Bluehaven Service Arena", country: "Driftland", domain: "bluehaven.driftland.example" },
  { office: "Oakfield Advisory Works", country: "Mirelia", domain: "oakfield.mirelia.example" },
  { office: "Riverside Cloud Atelier", country: "Eldoria", domain: "riverside.eldoria.example" },
  { office: "Sunpeak Delivery Base", country: "Kestrelia", domain: "sunpeak.kestrelia.example" },
  { office: "Maplecore Experience Lab", country: "Aventine", domain: "maplecore.aventine.example" },
  { office: "Granitebay Productivity Loft", country: "Cressida", domain: "granitebay.cressida.example" }
];

const FUNCTION_TYPES = [
  "Sales Enablement",
  "Consulting Delivery",
  "Cloud Operations",
  "Support Services",
  "Security Engineering",
  "Workplace Strategy",
  "Data Platform",
  "Automation Practice"
];

const WEEKEND_VARIANTS = [
  "[SATURDAY, SUNDAY]",
  "[SUNDAY, SATURDAY]",
  "[FRIDAY, SATURDAY]"
];

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pick(list, rng) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }
  const index = Math.floor(rng() * list.length);
  return list[index];
}

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const normalized = String(text || "").replace(/\uFEFF/g, "");
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (inQuotes) {
      if (char === "\"") {
        const next = normalized[index + 1];
        if (next === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }
  return rows;
}

function parseNumberLoose(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const compact = raw.replace(/\u00A0/g, " ").replace(/\s+/g, "");
  if (!/^[-+0-9.,eE]+$/.test(compact)) {
    return null;
  }
  let normalized = compact;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const tail = normalized.split(",").pop() || "";
    if (tail.length === 3 && /^-?\d{1,3}(?:,\d{3})+$/.test(normalized)) {
      normalized = normalized.replace(/,/g, "");
    } else {
      normalized = normalized.replace(/,/g, ".");
    }
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateLoose(value) {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let month = Number(slash[1]);
    let day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) {
      year += 2000;
    }
    if (month > 12 && day <= 12) {
      const swap = month;
      month = day;
      day = swap;
    }
    return new Date(Date.UTC(year, month - 1, day));
  }
  const dotted = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotted) {
    let day = Number(dotted[1]);
    let month = Number(dotted[2]);
    let year = Number(dotted[3]);
    if (year < 100) {
      year += 2000;
    }
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function formatUsDate(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function generatePseudoUuid(rng) {
  const hex = "0123456789abcdef";
  const draw = count => {
    let out = "";
    for (let index = 0; index < count; index += 1) {
      out += hex[Math.floor(rng() * 16)];
    }
    return out;
  };
  const p1 = draw(8);
  const p2 = draw(4);
  const p3 = `4${draw(3)}`;
  const variantStart = ["8", "9", "a", "b"][Math.floor(rng() * 4)];
  const p4 = `${variantStart}${draw(3)}`;
  const p5 = draw(12);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

function analyzeColumns(headers, rows) {
  return headers.map((header, index) => {
    const values = rows.map(row => (row[index] == null ? "" : String(row[index]))).map(value => value.trim());
    const nonEmpty = values.filter(Boolean);
    const numericValues = [];
    let integerLike = true;
    let booleanTrue = 0;
    let booleanFalse = 0;
    nonEmpty.forEach(value => {
      const lowered = value.toLowerCase();
      if (lowered === "true") {
        booleanTrue += 1;
        return;
      }
      if (lowered === "false") {
        booleanFalse += 1;
        return;
      }
      const parsedNumber = parseNumberLoose(value);
      if (parsedNumber != null) {
        numericValues.push(parsedNumber);
        if (Math.abs(parsedNumber - Math.round(parsedNumber)) > 1e-9) {
          integerLike = false;
        }
      }
    });
    const zeroRate = numericValues.length
      ? numericValues.filter(value => Math.abs(value) < 1e-9).length / numericValues.length
      : 0;
    return {
      header,
      index,
      nonEmptyRate: values.length ? nonEmpty.length / values.length : 0,
      numericValues,
      integerLike,
      zeroRate,
      booleanRate: nonEmpty.length ? (booleanTrue + booleanFalse) / nonEmpty.length : 0,
      trueRate: (booleanTrue + booleanFalse) ? booleanTrue / (booleanTrue + booleanFalse) : 0
    };
  });
}

function buildWeeklyDatePool(rows) {
  const parsedDates = rows
    .map(row => parseDateLoose(row[1]))
    .filter(date => date instanceof Date && Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  let start = parsedDates[0];
  let end = parsedDates[parsedDates.length - 1];
  if (!(start instanceof Date) || !(end instanceof Date)) {
    start = new Date(Date.UTC(2025, 7, 3));
    end = new Date(Date.UTC(2026, 1, 8));
  }
  const pool = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor <= end) {
    pool.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  if (!pool.length) {
    pool.push(start);
  }
  return pool;
}

function jitterNumber(base, rng, integerLike) {
  const jitter = 0.7 + rng() * 0.9;
  let value = Math.max(0, base * jitter);
  if (integerLike) {
    value = Math.round(value);
    return String(value);
  }
  value = Math.round(value * 1000000) / 1000000;
  return String(value);
}

function synthesizeValue(header, columnStats, context, rng, weeklyDates) {
  const lowered = header.toLowerCase();
  if (header === "PersonId") {
    return generatePseudoUuid(rng);
  }
  if (header === "MetricDate") {
    return formatUsDate(pick(weeklyDates, rng));
  }
  if (header === "Organization") {
    return context.office.office;
  }
  if (header === "CountryOrRegion") {
    return context.office.country;
  }
  if (header === "Domain") {
    return context.office.domain;
  }
  if (header === "FunctionType") {
    return pick(FUNCTION_TYPES, rng);
  }
  if (header === "WeekendDays") {
    return pick(WEEKEND_VARIANTS, rng);
  }
  if (header === "IsActive") {
    return rng() < 0.86 ? "TRUE" : "FALSE";
  }
  if (columnStats.booleanRate > 0.8) {
    return rng() < columnStats.trueRate ? "TRUE" : "FALSE";
  }
  if (columnStats.numericValues.length) {
    if (rng() < columnStats.zeroRate * 0.95) {
      return "0";
    }
    const base = pick(columnStats.numericValues, rng);
    return jitterNumber(base, rng, columnStats.integerLike);
  }
  if (columnStats.nonEmptyRate < 0.2) {
    return "";
  }
  if (lowered.includes("office") || lowered.includes("organization") || lowered.includes("org")) {
    return context.office.office;
  }
  if (lowered.includes("country")) {
    return context.office.country;
  }
  if (lowered.includes("domain")) {
    return context.office.domain;
  }
  return "";
}

async function generateSample(config) {
  const sourceText = await readFile(config.input, "utf8");
  const parsed = parseCsv(sourceText);
  if (!parsed.length) {
    throw new Error(`Input file had no rows: ${config.input}`);
  }
  const headers = parsed[0];
  const sourceRows = parsed.slice(1);
  const weeklyDates = buildWeeklyDatePool(sourceRows);
  const stats = analyzeColumns(headers, sourceRows);
  const statsByHeader = stats.reduce((accumulator, entry) => {
    accumulator[entry.header] = entry;
    return accumulator;
  }, {});

  const rng = createRng(config.seed);
  const generatedRows = [];
  for (let index = 0; index < config.rowCount; index += 1) {
    const office = pick(OFFICE_PROFILES, rng);
    const context = { office };
    const row = headers.map(header => {
      const columnStats = statsByHeader[header] || {
        nonEmptyRate: 0,
        numericValues: [],
        integerLike: true,
        zeroRate: 0,
        booleanRate: 0,
        trueRate: 0
      };
      return synthesizeValue(header, columnStats, context, rng, weeklyDates);
    });
    generatedRows.push(row);
  }

  const lines = [headers, ...generatedRows]
    .map(row => row.map(escapeCsvValue).join(","))
    .join("\n");
  await mkdir(path.dirname(config.output), { recursive: true });
  await writeFile(config.output, lines, "utf8");
  return {
    rows: generatedRows.length,
    columns: headers.length,
    output: config.output
  };
}

async function main() {
  for (const config of SAMPLE_CONFIGS) {
    const summary = await generateSample(config);
    console.log(`Generated ${config.name}: ${summary.rows} rows, ${summary.columns} columns -> ${summary.output}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
