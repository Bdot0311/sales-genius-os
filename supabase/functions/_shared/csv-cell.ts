/** RFC 4180 escaping plus literal text for spreadsheet formula triggers. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = Array.isArray(value) ? value.join("|") : String(value);
  // Readers may trim whitespace/control characters before evaluating formulas.
  const text = /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}