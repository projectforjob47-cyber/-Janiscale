const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { 
  cellDates: true, raw: false
});
const ws = wb.Sheets['prt26'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('TOTAL ROWS (including header):', data.length);

// Count CATCH_WEIGHT rows
let catchWeightCount = 0;
let nonCwCount = 0;
let blankCount = 0;
const apptSet = new Set();
const catchApptSet = new Set();
const descriptions = new Set();

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  const itemClass = row[14];
  const appt = row[5];
  const desc = row[12];
  if (itemClass === 'CATCH_WEIGHT') {
    catchWeightCount++;
    if (appt) catchApptSet.add(String(appt));
    if (desc) descriptions.add(desc.substring(0, 30));
  } else if (!itemClass) {
    blankCount++;
  } else {
    nonCwCount++;
  }
  if (appt) apptSet.add(String(appt));
}

console.log('Total data rows:', data.length - 1);
console.log('CATCH_WEIGHT rows:', catchWeightCount);
console.log('NON_CATCH_WEIGHT rows:', nonCwCount);
console.log('Blank ItemClass rows:', blankCount);
console.log('Unique Appointments total:', apptSet.size);
console.log('Unique Appointments with CATCH_WEIGHT:', catchApptSet.size);
console.log('Sample CATCH_WEIGHT descriptions:', JSON.stringify([...descriptions].slice(0, 10)));
