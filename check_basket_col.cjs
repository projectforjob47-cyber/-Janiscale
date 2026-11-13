const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { sheetRows: 5, raw: false });
const ws = wb.Sheets['prt26'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Row 1 headers:', JSON.stringify(data[0]));
console.log('Row 2 sample:', JSON.stringify(data[1]));
