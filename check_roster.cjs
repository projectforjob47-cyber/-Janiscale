const https = require('https');

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
  try {
    // 33-person roster sheet CSV export (gid=0)
    const rosterUrl = 'https://docs.google.com/spreadsheets/d/1ih0Lvgw9VnrYBoPA3NT-RltH44UCzRzcGF5sB3Ht57A/export?format=csv';
    console.log('Fetching roster from:', rosterUrl);
    const rosterRes = await fetchUrl(rosterUrl);
    console.log('Roster status:', rosterRes.status);
    console.log('Roster length:', rosterRes.data.length);
    console.log('First 500 chars of roster:');
    console.log(rosterRes.data.substring(0, 500));
  } catch (err) {
    console.error('Error fetching roster:', err.message);
  }
}
run();
