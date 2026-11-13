// ============================================================
// SMART DC — Date & Time Utility Functions
// Handles Thai Buddhist Era (พ.ศ.), Lotus's Excel formats,
// and ensures dates strictly adhere to Excel files (prt26).
// ============================================================

/**
 * Extracts standard ISO date (YYYY-MM-DD) from Lotus's Excel Appt_time column.
 * Example inputs:
 *  - "06-11-2026_00:01:00" => "2026-11-06"
 *  - "06-11-2026_01:00"    => "2026-11-06"
 *  - "12-10-2026_00:01:00" => "2026-10-12"
 *  - "2026-11-06_00:01:00" => "2026-11-06"
 *  - "06/11/2026"          => "2026-11-06"
 *  - "2026-11-06"          => "2026-11-06"
 */
export function extractDateFromApptTime(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const trimmed = String(timeStr).trim();
  if (!trimmed) return null;

  const datePart = trimmed.includes('_') ? trimmed.split('_')[0].trim() : trimmed;

  // 1. Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = parseInt(dmyMatch[3], 10);
    if (y > 2400) y -= 543; // Buddhist Era to CE
    return `${y}-${m}-${d}`;
  }

  // 2. Match YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    let y = parseInt(ymdMatch[1], 10);
    if (y > 2400) y -= 543;
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Extracts and formats time part (e.g. "01:00 น.")
 */
export function formatApptTime(timeStr?: string | null): string {
  if (!timeStr) return '08:00 น.';
  const str = String(timeStr).trim();

  if (str.includes('_')) {
    const parts = str.split('_');
    const timePart = parts[1] || '';
    const match = timePart.match(/^(\d{1,2}:\d{2})/);
    if (match) {
      const [h, m] = match[1].split(':');
      return `${h.padStart(2, '0')}:${m} น.`;
    }
  }

  const match = str.match(/(\d{1,2}:\d{2})/);
  if (match) {
    const [h, m] = match[1].split(':');
    return `${h.padStart(2, '0')}:${m} น.`;
  }

  return str.endsWith('น.') ? str : `${str} น.`;
}

/**
 * Formats standard date into Thai Buddhist Era date (DD/MM/YYYY, e.g. 06/11/2569)
 */
export function formatThaiDate(dateRaw?: string | null): string {
  if (!dateRaw) return '-';
  const trimmed = String(dateRaw).trim();

  // 1. Try DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    let y = parseInt(dmyMatch[3], 10);
    const beYear = y > 2400 ? y : y + 543;
    return `${d}/${m}/${beYear}`;
  }

  // 2. Try YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    let y = parseInt(ymdMatch[1], 10);
    const beYear = y > 2400 ? y : y + 543;
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${d}/${m}/${beYear}`;
  }

  return trimmed;
}

/**
 * Authoritative combined Date + Time formatter.
 * Strictly adheres to the date in the Excel file (timeRaw) first!
 * Example output: "06/11/2569 · 01:00 น."
 */
export function formatApptDateTime(timeRaw?: string | null, dateRaw?: string | null): string {
  const timeStr = formatApptTime(timeRaw);

  // 1. Priority 1: Extract date from file (timeRaw, e.g. "06-11-2026_01:00:00")
  let dateFormatted = '';
  const fileDateIso = extractDateFromApptTime(timeRaw);
  if (fileDateIso) {
    dateFormatted = formatThaiDate(fileDateIso);
  }

  // 2. Priority 2: Use dateRaw if file date was not embedded in timeRaw
  if (!dateFormatted && dateRaw) {
    const dateRawIso = extractDateFromApptTime(dateRaw) || dateRaw;
    dateFormatted = formatThaiDate(dateRawIso);
  }

  if (dateFormatted && dateFormatted !== '-') {
    return `${dateFormatted} · ${timeStr}`;
  }
  return timeStr;
}
