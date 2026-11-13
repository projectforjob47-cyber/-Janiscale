const fs = require('fs');
const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { cellDates: true, raw: false });
const ws = wb.Sheets['prt26'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const rows = [];
for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (row[14] === 'CATCH_WEIGHT') {
    rows.push({
      poNbr: String(row[4] ?? '').trim(),
      apptNbr: String(row[5] ?? '').trim(),
      apptTime: row[3] ? String(row[3]).trim() : null,
      itemId: String(row[11] ?? '').trim(),
      description: String(row[12] ?? '').trim(),
      division: row[13] ? String(row[13]).trim() : null,
      itemClass: String(row[14] ?? '').trim(),
      dept: row[32] ? String(row[32]).trim() : null,
      vendorNbr: String(row[33] ?? '').trim(),
      vendorName: String(row[34] ?? '').trim(),
      carrierCode: (row[35] ? String(row[35]).trim() : 'VN'),
      apptContQty: row[36] !== null && row[36] !== undefined && row[36] !== '' ? Number(row[36]) : null,
      rcvdContQty: row[37] !== null && row[37] !== undefined && row[37] !== '' ? Number(row[37]) : null,
      sourceRowIndex: i + 1
    });
  }
}
fs.writeFileSync('src/lib/seedData.json', JSON.stringify(rows, null, 2), 'utf8');
console.log('Saved seedData.json with', rows.length, 'records');
