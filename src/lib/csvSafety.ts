/**
 * Guard against CSV/spreadsheet formula injection. A cell beginning with
 * =, +, -, @, tab, or CR is interpreted as a formula by Excel/Sheets when
 * the file is opened, which turns user-entered text into executable
 * spreadsheet code. Prefixing with a single quote forces Excel/Sheets to
 * treat the cell as literal text (the quote is not displayed).
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeFormula(v: string): string {
  return FORMULA_PREFIX.test(v) ? "'" + v : v;
}
