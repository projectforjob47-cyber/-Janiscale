const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'rosterRaw.csv');
const rawText = fs.readFileSync(csvPath, 'utf8');

const lines = rawText.trim().split(/\r?\n/);
const roster = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith(',,,,')) continue;
  const cols = line.split(',');
  const dept = (cols[0] || '').trim();
  const rawEmpId = (cols[1] || '').trim();
  const firstName = (cols[2] || '').trim();
  const lastName = (cols[3] || '').trim();
  let fullName = (cols[4] || '').trim();
  if (!fullName && firstName) fullName = (firstName + ' ' + lastName).trim();
  const org = (cols[5] || '').trim();
  if (!rawEmpId) continue;

  // Strict Department-based role determination:
  // "ผู้มีสิทธิ์อนุมัติ OTM ต้องอยู่ในแผนก DC Operation Team Manager ใน Employee Master ที่ผ่านการตรวจสอบแล้วเท่านั้น"
  let role = 'RECEIVE';
  if (dept === 'DC Operation Team Manager') {
    role = 'OTM';
  } else if (dept.includes('S&LP')) {
    role = 'LPS';
  } else {
    role = 'RECEIVE';
  }

  roster.push({
    empId: rawEmpId,
    fullName: fullName || rawEmpId,
    department: dept,
    role: role,
    organization: org,
    email: null
  });
}

console.log('Total parsed employees:', roster.length);
const otmCount = roster.filter(r => r.role === 'OTM').length;
console.log('OTM count:', otmCount);
console.log('Sample parsed:', roster.slice(0, 5));

fs.writeFileSync(path.join(__dirname, 'authorizedRoster.json'), JSON.stringify(roster, null, 2));
console.log('Saved to authorizedRoster.json!');
