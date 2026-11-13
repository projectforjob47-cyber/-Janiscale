const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('../List All Appointment GB 992 at 17.00 Date 12-10-2026.xlsx', { cellDates: true, raw: false });
const ws = wb.Sheets['prt26'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const cwRows = [];
for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (row[14] === 'CATCH_WEIGHT') {
    cwRows.push({
      Appt_nbr: row[5],
      Carrier_code: row[35],
      Vendor_nbr: row[33],
      Vendor_name: row[34],
      PO_nbr: row[4],
      Item_id: row[11],
      Description: row[12],
      Appt_cont_qty: row[36],
      RCVD_cont_qty: row[37]
    });
  }
}
console.log('Total CATCH_WEIGHT rows:', cwRows.length);
console.log('First 5 CATCH_WEIGHT rows:');
console.log(JSON.stringify(cwRows.slice(0, 5), null, 2));

// Summary by Appointment
const apptMap = {};
cwRows.forEach(r => {
  const k = r.Appt_nbr;
  if (!apptMap[k]) apptMap[k] = { appt: k, carrier: r.Carrier_code, vendors: new Set(), pos: new Set(), skus: 0 };
  apptMap[k].vendors.add(`${r.Vendor_nbr} - ${r.Vendor_name}`);
  apptMap[k].pos.add(r.PO_nbr);
  apptMap[k].skus++;
});

console.log('Appointments with CATCH_WEIGHT:');
Object.values(apptMap).forEach(a => {
  console.log(`Appt ${a.appt} (${a.carrier}): ${a.vendors.size} vendors, ${a.pos.size} POs, ${a.skus} SKUs`);
  a.vendors.forEach(v => console.log(`   Vendor: ${v}`));
});
