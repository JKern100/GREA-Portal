#!/usr/bin/env node
/**
 * Unit tests for the Import Mapper's two pure modules — `applyMapping`
 * (server, reshapes a file into the template) and `autoMatch` (client,
 * guesses the mapping). Acceptance criterion 7 in docs/SPECS_IMPORT_MAPPER.md.
 *
 * Usage:  node scripts/test_mapper.js
 *
 * Same in-memory transpile + stub approach as check_import_file.js: the
 * modules are TypeScript with `@/` aliases, and standing up a bundler for two
 * pure functions isn't worth it.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

const ROOT = path.join(__dirname, "..");

const TYPES_STUB = `
  const DEAL_STAGES = ["Lead", "Listing", "Contract", "Closed"];
  const SECTOR_OPTIONS = ["Multifamily", "Affordable Housing", "Student Housing", "Capital Services", "General"];
  const TAG_OPTIONS = ["Client", "Seller", "Active", "Buyer", "Lender", "Referral Source", "Other"];
`;

function transpile(relPath, substitutions) {
  let src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  for (const [pattern, replacement] of substitutions) src = src.replace(pattern, replacement);
  return ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      // Matches tsconfig.json. Without it, `import Fuse from "fuse.js"`
      // compiles to `fuse_js_1.default`, which is undefined for fuse's CJS
      // build (it exports the constructor directly). The app build is
      // unaffected — this only matters for this in-memory transpile.
      esModuleInterop: true
    }
  }).outputText;
}

function compile(js, name) {
  const mod = new Module(name);
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(js, path.join(ROOT, name));
  return mod.exports;
}

// --- load the real schemas -------------------------------------------------
const { parseImportDate } = compile(transpile("src/lib/importDate.ts", []), "importDate.js");
global.__parseImportDate = parseImportDate;

const SCHEMA_SUBS = [
  [/import \{ parseImportDate[^;]*;/, "const parseImportDate = global.__parseImportDate;"],
  [/import \{[^}]*\} from "@\/lib\/types";/, TYPES_STUB]
];
global.__contactsSchema = compile(transpile("src/lib/contacts/import-schema.ts", SCHEMA_SUBS), "c.js");
global.__dealsSchema = compile(transpile("src/lib/deals/import-schema.ts", SCHEMA_SUBS), "d.js");
global.__aliases = compile(transpile("src/lib/import/headerAliases.ts", []), "aliases.js");

const SCHEMA_IMPORT_SUBS = [
  [/import \* as contactsSchema from "@\/lib\/contacts\/import-schema";/, "const contactsSchema = global.__contactsSchema;"],
  [/import \* as dealsSchema from "@\/lib\/deals\/import-schema";/, "const dealsSchema = global.__dealsSchema;"],
  [/import \{ aliasesFor \} from "@\/lib\/import\/headerAliases";/, "const { aliasesFor } = global.__aliases;"]
];

const { applyMapping, MappingError } = compile(
  transpile("src/lib/import/applyMapping.ts", SCHEMA_IMPORT_SUBS),
  "applyMapping.js"
);
const { autoMatch, unusedHeaders, missingRequired } = compile(
  transpile("src/lib/import/autoMatch.ts", SCHEMA_IMPORT_SUBS),
  "autoMatch.js"
);

// --- tiny harness ----------------------------------------------------------
let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${name}\n         ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}
function throws(fn, re, what) {
  try {
    fn();
  } catch (e) {
    if (!re.test(e.message)) throw new Error(`${what}: wrong message "${e.message}"`);
    if (!(e instanceof MappingError)) throw new Error(`${what}: not a MappingError`);
    return;
  }
  throw new Error(`${what}: expected a throw`);
}

const CONTACT_HEADERS = global.__contactsSchema.TEMPLATE_COLUMNS.map((c) => c.header);
const colIndex = (h) => CONTACT_HEADERS.indexOf(h);

console.log("\napplyMapping");

check("emits the full template in order, blank where unmapped", () => {
  const sheet = [["Company", "Name"], ["Acme", "Jane Doe"]];
  const { rows } = applyMapping(sheet, { contact_name: { source: "Name" }, account_name: { source: "Company" } }, "contacts");
  eq(rows[0], CONTACT_HEADERS, "header row");
  eq(rows[1][colIndex("Contact Name")], "Jane Doe", "name");
  eq(rows[1][colIndex("Account / Company")], "Acme", "company");
  eq(rows[1][colIndex("Phone")], "", "unmapped column is blank");
});

check("concat joins two columns with one space", () => {
  const sheet = [["First Name", "Last Name"], ["Jane", "Doe"]];
  const { rows } = applyMapping(sheet, { contact_name: { concat: ["First Name", "Last Name"] } }, "contacts");
  eq(rows[1][colIndex("Contact Name")], "Jane Doe", "joined name");
});

check("concat tolerates a blank half without leaving a stray space", () => {
  const sheet = [["First Name", "Last Name"], ["Cher", ""]];
  const { rows } = applyMapping(sheet, { contact_name: { concat: ["First Name", "Last Name"] } }, "contacts");
  eq(rows[1][colIndex("Contact Name")], "Cher", "single-name contact");
});

check("rejects a source column that isn't in the file", () => {
  throws(
    () => applyMapping([["A"], ["1"]], { contact_name: { source: "Nope" } }, "contacts"),
    /not in the uploaded file/i,
    "missing column"
  );
});

check("rejects one column mapped to two fields", () => {
  throws(
    () => applyMapping([["Name"], ["x"]], { contact_name: { source: "Name" }, broker_name: { source: "Name" } }, "contacts"),
    /only be used once/i,
    "double use"
  );
});

check("rejects duplicate headers when one is actually mapped", () => {
  throws(
    () => applyMapping([["Email", "Email"], ["a", "b"]], { contact_email: { source: "Email" } }, "contacts"),
    /more than one column named/i,
    "ambiguous header"
  );
});

check("ignores duplicate headers that nothing maps to", () => {
  const { rows, ignoredHeaders } = applyMapping(
    [["Name", "Junk", "Junk"], ["Jane", "a", "b"]],
    { contact_name: { source: "Name" } },
    "contacts"
  );
  eq(rows[1][colIndex("Contact Name")], "Jane", "still maps");
  eq(ignoredHeaders.includes("Junk"), true, "reports the ignored header");
});

check("rejects an unknown target field", () => {
  throws(
    () => applyMapping([["A"], ["1"]], { not_a_field: { source: "A" } }, "contacts"),
    /unknown target field/i,
    "bad target"
  );
});

check("reports ignored source columns", () => {
  const { ignoredHeaders } = applyMapping(
    [["Name", "Fax", "Twitter"], ["Jane", "1", "2"]],
    { contact_name: { source: "Name" } },
    "contacts"
  );
  eq(ignoredHeaders, ["Fax", "Twitter"], "ignored list");
});

check("skips wholly blank rows", () => {
  const { rows } = applyMapping([["Name"], ["Jane"], ["  "], ["Bob"]], { contact_name: { source: "Name" } }, "contacts");
  eq(rows.length, 3, "header + 2 data rows");
});

check("deals template works too", () => {
  const dealHeaders = global.__dealsSchema.TEMPLATE_COLUMNS.map((c) => c.header);
  const { rows } = applyMapping(
    [["Listing", "Pipeline Stage"], ["123 Main", "Lead"]],
    { deal_name: { source: "Listing" }, stage: { source: "Pipeline Stage" } },
    "deals"
  );
  eq(rows[0], dealHeaders, "deal header row");
  eq(rows[1][dealHeaders.indexOf("Deal Name")], "123 Main", "deal name");
});

console.log("\nautoMatch");

check("exact template headers match", () => {
  const m = autoMatch(["Contact Name", "Account / Company", "Broker Email", "Broker Name"], "contacts");
  eq(m.contact_name.status, "matched", "contact_name status");
  eq(m.account_name.source, "Account / Company", "account source");
  eq(missingRequired(m, "contacts"), [], "nothing required missing");
});

check("alias headers match confidently (HubSpot shape)", () => {
  const m = autoMatch(["Company", "Contact Owner", "Contact Owner Email", "Email", "Phone"], "contacts");
  eq(m.account_name.source, "Company", "Company -> account_name");
  eq(m.account_name.status, "matched", "alias is a confident match");
  eq(m.broker_name.source, "Contact Owner", "owner -> broker_name");
  eq(m.broker_email.source, "Contact Owner Email", "owner email -> broker_email");
  eq(m.contact_email.source, "Email", "email -> contact_email");
});

check("first/last split becomes a concat on contact_name", () => {
  const m = autoMatch(["First Name", "Last Name", "Company"], "contacts");
  eq(m.contact_name.concat, ["First Name", "Last Name"], "name concat");
  eq(m.contact_name.status, "matched", "concat is confident");
});

check("a real full-name column beats the first/last split", () => {
  const m = autoMatch(["Contact Name", "First Name", "Last Name"], "contacts");
  eq(m.contact_name.source, "Contact Name", "prefers the real column");
  eq(m.contact_name.concat, undefined, "no concat");
});

check("a typo is offered as a suggestion, not a silent match", () => {
  const m = autoMatch(["Contact Name", "Cmpany", "Broker Email", "Broker Name"], "contacts");
  eq(m.account_name.source, "Cmpany", "fuzzy found it");
  eq(m.account_name.status, "suggested", "flagged for review");
});

check("no source column is claimed by two targets", () => {
  const m = autoMatch(["Name", "Email", "Phone", "Company", "Owner", "Owner Email"], "contacts");
  const used = Object.values(m).flatMap((x) => (x.concat ? x.concat : x.source ? [x.source] : []));
  eq(used.length, new Set(used).size, "no duplicates across targets");
});

check("unrelated columns are left for the ignore list", () => {
  const headers = ["Contact Name", "Account / Company", "Broker Email", "Broker Name", "Fax Machine ID"];
  const m = autoMatch(headers, "contacts");
  eq(unusedHeaders(headers, m).includes("Fax Machine ID"), true, "junk column ignored");
});

check("Salesforce-style listing export maps the deal essentials", () => {
  const m = autoMatch(["Listing Name", "Pipeline Stage", "Activity Date", "Campaign Price", "Neighborhood"], "deals");
  eq(m.deal_name.source, "Listing Name", "deal name");
  eq(m.stage.source, "Pipeline Stage", "stage");
  eq(m.date_added.source, "Activity Date", "list date");
  eq(m.deal_value.source, "Campaign Price", "amount");
});

check("missingRequired names the fields still unmapped", () => {
  const m = autoMatch(["Company"], "contacts");
  const miss = missingRequired(m, "contacts");
  eq(miss.includes("Contact Name"), true, "flags contact name");
  eq(miss.includes("Account / Company"), false, "company is mapped");
});

console.log("\nend-to-end");

check("autoMatch output feeds applyMapping and lands the values", () => {
  const sheet = [
    ["First Name", "Last Name", "Company", "Contact Owner", "Contact Owner Email"],
    ["Jane", "Doe", "Acme Holdings", "Steffan Ramos", "sramos@grea.com"]
  ];
  const m = autoMatch(sheet[0], "contacts");
  const submitted = {};
  for (const [k, v] of Object.entries(m)) {
    if (v.concat && v.concat[0] && v.concat[1]) submitted[k] = { concat: v.concat };
    else if (v.source) submitted[k] = { source: v.source };
  }
  eq(missingRequired(m, "contacts"), [], "auto-match covered every required field");
  const { rows } = applyMapping(sheet, submitted, "contacts");
  eq(rows[1][colIndex("Contact Name")], "Jane Doe", "name");
  eq(rows[1][colIndex("Account / Company")], "Acme Holdings", "company");
  eq(rows[1][colIndex("Broker Email")], "sramos@grea.com", "broker email");

  // The mapped sheet must satisfy the real importer's own header check.
  const { missingRequired: coreMissing } = global.__contactsSchema.mapHeaders(rows[0]);
  eq(coreMissing, [], "core accepts the mapped header row");
});

console.log(`\n${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
