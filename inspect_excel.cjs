const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { 
  sheetRows: 5, 
  cellDates: true 
});
console.log('Sheet names:', JSON.stringify(wb.SheetNames));
const sheetName = wb.SheetNames.find(s => s === 'prt26') || wb.SheetNames[0];
console.log('Using sheet:', sheetName);
const ws = wb.Sheets[sheetName];
const range = XLSX.utils.decode_range(ws['!ref']);
console.log('Range:', JSON.stringify(range));
// Read row 1 (headers)
const headers = [];
for (let c = range.s.c; c <= range.e.c; c++) {
  const cellAddr = XLSX.utils.encode_cell({r: 0, c: c});
  const cell = ws[cellAddr];
  headers.push({ col: XLSX.utils.encode_col(c), header: cell ? cell.v : null });
}
console.log('HEADERS:', JSON.stringify(headers, null, 2));
