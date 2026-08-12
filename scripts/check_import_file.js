#!/usr/bin/env node
/**
 * Dry-run an office's CSV against the real import parser and report exactly
 * which rows would import and why the rest would be skipped — without
 * touching the database.
 *
 * Usage:
 *   node scripts/check_import_file.js contacts <file.csv>
 *   node scripts/check_import_file.js deals    <file.csv>
 *   node scripts/check_import_file.js contacts <file.csv> --rows   # per-row detail
 *
 * Why this exists: offices send files that fail for non-obvious reasons
 * (datetime cells, "(No value)" placeholders, blank required fields, sector
 * wording). Running them through the *actual* schema — rather than eyeballing
 * the CSV — is the only reliable way to answer "will this import?" and gives
 * the office a precise fix list. See docs/OFFICE_DATA_ONBOARDING.md.
 *
 * Implementation note: the schema modules are TypeScript with `@/` path
 * aliases, so we transpile them in-memory and stub the two imports rather than
 * standing up a bundler.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Papa = require("papaparse");

const [, , entity, file, ...flags] = process.argv;
const showRows = flags.includes("--rows");

if (!entity || !file || !["contacts", "deals"].includes(entity)) {
  console.error("Usage: node scripts/check_import_file.js <contacts|deals> <file.csv> [--rows]");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");

function loadModule(relPath, substitutions) {
  let src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  for (const [pattern, replacement] of substitutions) src = src.replace(pattern, replacement);
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
  }).outputText;
  const mod = new module.constructor();
  mod._compile(js, relPath);
  return mod.exports;
}

// Real date parser, loaded as-is (no imports to stub).
const { parseImportDate } = loadModule("src/lib/importDate.ts", []);
global.__parseImportDate = parseImportDate;

// The canonical option lists, mirrored from src/lib/types.ts so the schema's
// generated hints resolve. Kept in sync by the assertion below.
const TYPES_STUB = `
  const DEAL_STAGES = ["Lead", "Listing", "Contract", "Closed"];
  const SECTOR_OPTIONS = ["Multifamily", "Affordable Housing", "Student Housing", "Capital Services", "General"];
  const TAG_OPTIONS = ["Client", "Seller", "Active", "Buyer", "Lender", "Referral Source", "Other"];
`;

const typesSrc = fs.readFileSync(path.join(ROOT, "src/lib/types.ts"), "utf8");
for (const name of ["Multifamily", "Affordable Housing", "Student Housing", "Capital Services", "General"]) {
  if (!typesSrc.includes(`"${name}"`)) {
    console.warn(`WARNING: sector "${name}" not found in src/lib/types.ts — this script's stub may be stale.`);
  }
}

const schema = loadModule(`src/lib/${entity}/import-schema.ts`, [
  [/import \{ parseImportDate[^;]*;/, "const parseImportDate = global.__parseImportDate;"],
  [/import \{[^}]*\} from "@\/lib\/types";/, TYPES_STUB]
]);

const { mapHeaders, parseRow } = schema;
const VALID_SECTORS = ["Multifamily", "Affordable Housing", "Student Housing", "Capital Services", "General"];

const rows = Papa.parse(fs.readFileSync(file, "utf8"), { skipEmptyLines: "greedy" }).data;
if (rows.length < 2) {
  console.error("File has no data rows.");
  process.exit(1);
}

const { headerToKey, unknownHeaders, missingRequired } = mapHeaders(rows[0]);

console.log(`\n${entity.toUpperCase()} — ${path.basename(file)}`);
console.log(`${rows.length - 1} data rows, ${rows[0].length} columns\n`);

if (missingRequired.length) {
  console.log(`BLOCKED: missing required column(s): ${missingRequired.join(", ")}`);
  console.log("The whole file is rejected before any row is read.\n");
  process.exit(0);
}
if (unknownHeaders.length) console.log(`Ignored unknown column(s): ${unknownHeaders.join(", ")}\n`);

let ok = 0;
const skipped = [];
const reasonCounts = {};
const badSectors = new Set();
const noBrokerEmail = new Set();

for (let i = 1; i < rows.length; i++) {
  const raw = {};
  for (const [colIdx, key] of Object.entries(headerToKey)) raw[key] = rows[i][Number(colIdx)] ?? "";
  const parsed = parseRow(i, raw);

  (parsed.sectors || []).forEach((s) => {
    if (!VALID_SECTORS.includes(s)) badSectors.add(s);
  });
  if (!parsed.broker_email) noBrokerEmail.add(i);

  if (parsed.errors.length) {
    skipped.push({ row: i, errors: parsed.errors });
    parsed.errors.forEach((e) => {
      const generic = e.replace(/"[^"]*"/g, '"…"');
      reasonCounts[generic] = (reasonCounts[generic] || 0) + 1;
    });
  } else {
    ok++;
  }
}

console.log(`WOULD IMPORT: ${ok}`);
console.log(`WOULD BE SKIPPED: ${skipped.length}`);

if (Object.keys(reasonCounts).length) {
  console.log("\nReasons:");
  Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, n]) => console.log(`  ${String(n).padStart(4)} x  ${reason}`));
}

// Warnings — these do NOT block a row, but they silently degrade the data.
const warnings = [];
if (badSectors.size) {
  warnings.push(
    `Unrecognized sector value(s): ${[...badSectors].map((s) => `"${s}"`).join(", ")}.\n` +
      `    These import without error but will never match the sector filters.\n` +
      `    Valid: ${VALID_SECTORS.join(", ")}`
  );
}
if (noBrokerEmail.size && entity === "deals") {
  warnings.push(`${noBrokerEmail.size} row(s) have no Broker Email — they import unlinked, showing Broker Name only.`);
}
if (warnings.length) {
  console.log("\nWarnings (do not block import):");
  warnings.forEach((w) => console.log(`  - ${w}`));
}

if (showRows && skipped.length) {
  console.log("\nSkipped rows:");
  skipped.slice(0, 100).forEach((s) => console.log(`  row ${s.row}: ${s.errors.join("; ")}`));
  if (skipped.length > 100) console.log(`  … and ${skipped.length - 100} more`);
}

console.log("");
