#!/usr/bin/env node
/**
 * Unit tests for the two prepared (not yet wired in) matching modules:
 *   src/lib/deals/dealKey.ts       stable deal key
 *   src/lib/deals/contactMatch.ts  deal <-> contact association
 *
 * Usage:  node scripts/test_deal_matching.js
 *
 * Same in-memory transpile approach as scripts/test_mapper.js.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const Module = require("module");

const ROOT = path.join(__dirname, "..");

function load(relPath, substitutions = []) {
  let src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  for (const [a, b] of substitutions) src = src.replace(a, b);
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true }
  }).outputText;
  const mod = new Module(relPath);
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(js, path.join(ROOT, relPath));
  return mod.exports;
}

const dk = load("src/lib/deals/dealKey.ts");
global.__dealKey = dk;
const cm = load("src/lib/deals/contactMatch.ts", [
  [/import \{ normKeyPart \} from "\.\/dealKey";/, "const { normKeyPart } = global.__dealKey;"]
]);

let pass = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n         ${e.message}`);
  }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || "value"}: expected ${b}, got ${a}`);
}

// ---------------------------------------------------------------------------
console.log("\ndealKey");

check("same deal, cosmetic differences -> same key", () => {
  const a = dk.dealKey({ deal_name: "The Arker Portfolio", property_address: "123 Main St." });
  const b = dk.dealKey({ deal_name: "  the arker  portfolio ", property_address: "123 MAIN ST" });
  eq(a, b, "keys");
  eq(a, "nk:thearkerportfolio|123mainst", "shape");
});

check("a real edit -> different key (St vs Street)", () => {
  const a = dk.dealKey({ deal_name: "Arker", property_address: "123 Main St" });
  const b = dk.dealKey({ deal_name: "Arker", property_address: "123 Main Street" });
  if (a === b) throw new Error("expected different keys");
});

check("blank address still yields a key from the name", () => {
  eq(dk.dealKey({ deal_name: "Harlem 5-Building Package", property_address: "" }), "nk:harlem5buildingpackage|", "key");
});

check("name that normalises to nothing -> null", () => {
  eq(dk.dealKey({ deal_name: " -- ", property_address: "1 A St" }), null, "key");
});

check("usable external id wins over name and address", () => {
  eq(dk.dealKey({ external_id: " a0B5e00000XyZ ", deal_name: "X", property_address: "Y" }), "id:a0b5e00000xyz", "key");
});

check("external id survives a rename", () => {
  const a = dk.dealKey({ external_id: "9001", deal_name: "Old Name", property_address: "1 A St" });
  const b = dk.dealKey({ external_id: "9001", deal_name: "New Name", property_address: "2 B Ave" });
  eq(a, b, "keys");
});

check("scientific-notation id is rejected", () => {
  eq(dk.isUsableExternalId("1.23457E+11"), false, "1.23457E+11");
  eq(dk.isUsableExternalId("1E+11"), false, "1E+11");
  eq(dk.isUsableExternalId("1.2e11"), false, "1.2e11");
  eq(dk.isUsableExternalId("123456789012"), true, "plain digits");
  eq(dk.isUsableExternalId("0065e00000ABCDE"), true, "salesforce-style");
  eq(dk.isUsableExternalId("  "), false, "blank");
});

check("damaged id falls back to name + address", () => {
  eq(
    dk.dealKey({ external_id: "1.23457E+11", deal_name: "Arker", property_address: "1 A St" }),
    "nk:arker|1ast",
    "key"
  );
});

check("naturalKey ignores the id", () => {
  eq(dk.naturalKey({ external_id: "9001", deal_name: "Arker", property_address: "1 A St" }), "nk:arker|1ast", "key");
});

console.log("\nassignDealKeys (whole file)");

check("clean file with ids -> id keys, no warnings", () => {
  const r = dk.assignDealKeys([
    { external_id: "1", deal_name: "A", property_address: "x" },
    { external_id: "2", deal_name: "B", property_address: "y" }
  ]);
  eq(r.keys, ["id:1", "id:2"], "keys");
  eq(r.warnings.length, 0, "warnings");
});

check("id repeated on two rows -> both fall back, with a warning", () => {
  const r = dk.assignDealKeys([
    { external_id: "7", deal_name: "A", property_address: "x" },
    { external_id: "7", deal_name: "B", property_address: "y" },
    { external_id: "8", deal_name: "C", property_address: "z" }
  ]);
  eq(r.keys, ["nk:a|x", "nk:b|y", "id:8"], "keys");
  eq(r.warnings.some((w) => /more than one row/.test(w)), true, "warning");
});

check("damaged ids are counted and warned once", () => {
  const r = dk.assignDealKeys([
    { external_id: "1.2E+11", deal_name: "A", property_address: "x" },
    { external_id: "1.2E+11", deal_name: "B", property_address: "y" }
  ]);
  eq(r.keys, ["nk:a|x", "nk:b|y"], "keys");
  eq(r.warnings.filter((w) => /damaged/.test(w)).length, 1, "one damage warning");
  eq(r.warnings.some((w) => /more than one row/.test(w)), false, "not also reported as repeated");
});

check("two deals with the same name and address are reported", () => {
  const r = dk.assignDealKeys([
    { deal_name: "Portfolio Sale", property_address: "" },
    { deal_name: "portfolio sale", property_address: "" },
    { deal_name: "Other", property_address: "" }
  ]);
  eq(r.keys[0], r.keys[1], "colliding keys");
  eq(r.warnings.some((w) => /same name and address/.test(w)), true, "warning");
});

check("no ids at all -> no id warnings", () => {
  const r = dk.assignDealKeys([{ deal_name: "A", property_address: "x" }]);
  eq(r.warnings.length, 0, "warnings");
});

// ---------------------------------------------------------------------------
console.log("\ncontactMatch");

const C = (id, office, name, company, extra = {}) => ({
  id,
  office_id: office,
  contact_name: name,
  account_name: company,
  listing: null,
  is_confidential: false,
  ...extra
});
const D = (over) => ({ deal_name: "Deal", property_address: "", seller_name: null, buyer_name: null, ...over });

const contacts = [
  C("c1", "NYC", "David Friedman", "Brookfield Properties"),
  C("c2", "ATL", "Jane Doe", "Brookfield Properties, Inc."),
  C("c3", "PHL", "Sam Lee", "Individual"),
  C("c4", "PHL", "Pat Kim", "Individual"),
  C("c5", "NYC", "Secret Person", "Hidden Capital", { is_confidential: true }),
  C("c6", "DTW", "Ana Ruiz", "Exact Capital", { listing: "250 West 135th Street" }),
  C("c7", "HOU", "Al", "Al")
];
const index = cm.buildContactIndex(contacts);

check("seller company matches the contact's company", () => {
  const m = cm.matchDealContacts(D({ seller_name: "Brookfield Properties" }), index);
  eq(m.map((x) => x.contact.id), ["c1"], "contacts");
  eq(m[0].signals, ["seller_company"], "signals");
});

check("case and punctuation differences still match", () => {
  const m = cm.matchDealContacts(D({ buyer_name: "brookfield properties inc" }), index);
  eq(m.map((x) => x.contact.id), ["c2"], "contacts");
  eq(m[0].signals, ["buyer_company"], "signals");
});

check("a partial name does not match", () => {
  eq(cm.matchDealContacts(D({ seller_name: "Brookfield" }), index).length, 0, "matches");
});

check("seller matches a contact by person name", () => {
  const m = cm.matchDealContacts(D({ seller_name: "david friedman" }), index);
  eq(m.map((x) => x.contact.id), ["c1"], "contacts");
  eq(m[0].signals, ["seller_person"], "signals");
});

check("placeholders never match (Individual, (No value), N/A)", () => {
  eq(cm.matchDealContacts(D({ seller_name: "Individual" }), index).length, 0, "Individual");
  eq(cm.matchDealContacts(D({ seller_name: "(No value)" }), index).length, 0, "(No value)");
  eq(cm.matchDealContacts(D({ buyer_name: "N/A" }), index).length, 0, "N/A");
});

check("values under 3 characters never match", () => {
  eq(cm.matchDealContacts(D({ seller_name: "Al" }), index).length, 0, "matches");
});

check("contact Listing matches the deal's address", () => {
  const m = cm.matchDealContacts(D({ deal_name: "Harlem Walk-up", property_address: "250 West 135th Street" }), index);
  eq(m.map((x) => x.contact.id), ["c6"], "contacts");
  eq(m[0].signals, ["listing"], "signals");
});

check("contact Listing matches the deal's name", () => {
  const m = cm.matchDealContacts(D({ deal_name: "250 West 135th Street" }), index);
  eq(m.map((x) => x.contact.id), ["c6"], "contacts");
});

check("one contact matched two ways appears once with both signals", () => {
  const idx = cm.buildContactIndex([C("x", "NYC", "Acme Holdings", "Acme Holdings")]);
  const m = cm.matchDealContacts(D({ seller_name: "Acme Holdings" }), idx);
  eq(m.length, 1, "one entry");
  eq(m[0].signals.sort(), ["seller_company", "seller_person"], "signals");
});

check("same company as seller and buyer -> both signals", () => {
  const m = cm.matchDealContacts(D({ seller_name: "Exact Capital", buyer_name: "Exact Capital" }), index);
  eq(m[0].signals.sort(), ["buyer_company", "seller_company"], "signals");
});

check("confidential contact hidden from another office", () => {
  const deal = D({ seller_name: "Hidden Capital" });
  eq(cm.matchDealContacts(deal, index, { officeId: "ATL", isSuperadmin: false }).length, 0, "other office");
  eq(cm.matchDealContacts(deal, index, { officeId: "NYC", isSuperadmin: false }).length, 1, "own office");
  eq(cm.matchDealContacts(deal, index, { officeId: null, isSuperadmin: true }).length, 1, "superadmin");
});

check("deal with no parties and no listing match -> nothing", () => {
  eq(cm.matchDealContacts(D({}), index).length, 0, "matches");
});

check("lacksParties detects a file with no seller or buyer at all", () => {
  eq(cm.lacksParties([D({}), D({ seller_name: "N/A" })]), true, "all blank or placeholder");
  eq(cm.lacksParties([D({}), D({ buyer_name: "Exact Capital" })]), false, "one has a buyer");
  eq(cm.lacksParties([]), false, "empty list");
});

check("index build is linear: 20,000 contacts x 5,000 deals stays fast", () => {
  const many = [];
  for (let i = 0; i < 20000; i++) many.push(C(`m${i}`, "ATL", `Person ${i}`, `Company ${i % 4000}`));
  const idx = cm.buildContactIndex(many);
  const t0 = Date.now();
  let hits = 0;
  for (let i = 0; i < 5000; i++) hits += cm.matchDealContacts(D({ seller_name: `Company ${i % 4000}` }), idx).length;
  const ms = Date.now() - t0;
  if (hits !== 25000) throw new Error(`expected 25000 hits, got ${hits}`);
  if (ms > 2000) throw new Error(`too slow: ${ms}ms`);
});

console.log(`\n${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
