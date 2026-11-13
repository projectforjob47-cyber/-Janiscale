const fs = require('fs');

const csv = fs.readFileSync('authorized_roster.csv', 'utf8');
const lines = csv.split('\n').filter(l => l.trim().length > 0);

const roster = [];
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',');
  const dept = parts[0].trim();
  const empId = parts[1] ? parts[1].trim() : '';
  const fullName = parts[2] ? parts[2].trim() : '';
  const org = parts[3] ? parts[3].trim() : '';
  const email = parts[4] ? parts[4].trim() : '';

  let role = 'RECEIVE';
  if (dept === 'DC Operation Team Manager') role = 'OTM';
  else if (dept === 'DC S&LP Supervisor') role = 'LPS';
  else if (dept === 'Receiving - Fresh') role = 'RECEIVE';

  roster.push({
    empId,
    fullName,
    department: dept,
    role,
    organization: org,
    email: email || null
  });
}

fs.writeFileSync('src/lib/authorizedRoster.json', JSON.stringify(roster, null, 2), 'utf8');
console.log('Saved src/lib/authorizedRoster.json with', roster.length, 'records');
