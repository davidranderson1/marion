// parse.ts — P21 LI-INVOICE.txt reader shared by the dynamics-import edge function and the local test.
// Rules reproduced from the Dynamics IMPORT tool (ImportState.convertCsvToObjects + InvoiceDetailDataProcessor,
// Dev branch 2026-09-28): tab-separated, first line = headers, split on tabs only (item codes contain inch marks),
// every cell trimmed, a line with fewer than 2 cells is skipped, dates are MM/DD/YY or MM/DD/YYYY.
// Nothing here talks to Dynamics or Supabase.

export const EXPECTED_COLUMNS = [
  "CUST_CODE", "ORD_NUMBER", "ITEM_CODE", "DESC1", "DESC2", "INV_QTY", "ITEM_SLM", "INV_DATE", "VEND_NUMBER",
  "GEN_COST", "GEN_PRICE", "UT_COST", "UT_PRICE", "SCHD_NUM", "LINE_NUMBER", "SHIP_NUMBER", "MULTIPLIER", "CUST_PO",
] as const;

export interface RawRow {
  raw_index: number;        // 1-based data row number in the file (header = 0)
  cust_code: string;
  ord: string;
  ship: string;
  line_no: string;
  item: string;
  desc1: string;
  desc2: string;
  qty: string;
  inv_date: string | null; // ISO yyyy-mm-dd, null when unparseable
  inv_date_raw: string;
  vend: string;
  gen_cost: string;
  gen_price: string;
  ut_cost: string;
  ut_price: string;
  schd: string;
  multiplier: string;
  cust_po: string;
}

export interface ParseResult {
  header: string[];
  missing: string[];
  extra: string[];
  rows: RawRow[];
  dropped_short_lines: number;
  bad_dates: number;
}

/** Decode the file bytes: the P21 export is Windows-1252 (non-breaking spaces occur). */
export function decodeP21(bytes: Uint8Array): string {
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/** MM/DD/YY or MM/DD/YYYY -> yyyy-mm-dd (the tool's convertDateFormat), null when invalid. */
export function toIsoDate(s: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(s || "");
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]);
  let yy = Number(m[3]);
  if (m[3].length === 2) yy += yy < 70 ? 2000 : 1900;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(Date.UTC(yy, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Parse the decoded text. Rows come back in file order. */
export function parseLiInvoice(text: string): ParseResult {
  const lines = text.split("\n");
  const header = (lines[0] || "").replace(/\r$/, "").split("\t").map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  const missing = EXPECTED_COLUMNS.filter((c) => !(c in idx));
  const extra = header.filter((h) => h && !(EXPECTED_COLUMNS as readonly string[]).includes(h));
  const rows: RawRow[] = [];
  let dropped = 0, bad = 0;
  if (missing.length) return { header, missing, extra, rows, dropped_short_lines: 0, bad_dates: 0 };
  const g = (cells: string[], name: string) => (cells[idx[name]] ?? "").trim();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const cells = line.split("\t");
    if (cells.length < 2) { dropped++; continue; }
    const dateRaw = g(cells, "INV_DATE");
    const iso = toIsoDate(dateRaw);
    if (!iso) bad++;
    rows.push({
      raw_index: i,
      cust_code: g(cells, "CUST_CODE"), ord: g(cells, "ORD_NUMBER"), ship: g(cells, "SHIP_NUMBER"),
      line_no: g(cells, "LINE_NUMBER"), item: g(cells, "ITEM_CODE"), desc1: g(cells, "DESC1"), desc2: g(cells, "DESC2"),
      qty: g(cells, "INV_QTY"), inv_date: iso, inv_date_raw: dateRaw, vend: g(cells, "VEND_NUMBER"),
      gen_cost: g(cells, "GEN_COST"), gen_price: g(cells, "GEN_PRICE"), ut_cost: g(cells, "UT_COST"), ut_price: g(cells, "UT_PRICE"),
      schd: g(cells, "SCHD_NUM"), multiplier: g(cells, "MULTIPLIER"), cust_po: g(cells, "CUST_PO"),
    });
  }
  return { header, missing, extra, rows, dropped_short_lines: dropped, bad_dates: bad };
}

/** Net price rule of the LI-INVOICE template: UT_PRICE x MULTIPLIER, divided for credit orders (ORD_NUMBER starts with 65),
 *  null when either value is not > 0 (identical to the tool's calculateNetPrice branch). */
export function netPrice(ord: string, utPrice: string, multiplier: string): number | null {
  const ut = parseFloat(utPrice) || 0, m = parseFloat(multiplier) || 0;
  if (!(ut > 0 && m > 0)) return null;
  return ord.startsWith("65") ? ut / m : ut * m;
}
