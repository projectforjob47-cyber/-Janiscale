const https = require('https');
const fs = require('fs');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function run() {
  const rosterUrl = 'https://docs.google.com/spreadsheets/d/1ih0Lvgw9VnrYBoPA3NT-RltH44UCzRzcGF5sB3Ht57A/export?format=csv';
  const res = await fetchUrl(rosterUrl);
  fs.writeFileSync('authorized_roster.csv', res.data, 'utf8');
  console.log('Saved authorized_roster.csv');
  const lines = res.data.split('\n').filter(l => l.trim().length > 0);
  console.log('Total roster lines (including header):', lines.length);
  
  const header = lines[0];
  console.log('Header:', header);
  
  const depts = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const dept = parts[0].trim();
    const empId = parts[1] ? parts[1].trim() : '';
    const name = parts[2] ? parts[2].trim() : '';
    if (!depts[dept]) depts[dept] = [];
    depts[dept].push({ empId, name });
  }
  
  console.log('Department Breakdown:');
  Object.keys(depts).forEach(d => {
    console.log(`- ${d}: ${depts[d].length} people`);
  });
}
run();
