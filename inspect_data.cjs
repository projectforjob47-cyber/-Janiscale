const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { 
  sheetRows: 30, 
  cellDates: true,
  raw: false
});
const ws = wb.Sheets['prt26'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
// Show rows 2-20 (0-indexed: 1-19), key columns
const keyColIndexes = {
  E: 4, F: 5, L: 11, M: 12, O: 14, AH: 33, AI: 34, AJ: 35, AK: 36, AL: 37, AM: 38
};
const headers = data[0];
console.log('Total rows read (sheetRows=30):', data.length - 1);
for (let i = 1; i < Math.min(data.length, 20); i++) {
  const row = data[i];
  const r = {
    row: i+1,
    PO_nbr: row[4],
    Appt_nbr: row[5],
    Item_id: row[11],
    Description: row[12],
    Item_Class: row[14],
    Vendor_nbr: row[33],
    Vendor_name: row[34],
    Carrier_code: row[35],
    Appt_cont_qty: row[36],
    RCVD_cont_qty: row[37],
    Diff: row[38],
  };
  console.log(JSON.stringify(r));
}
