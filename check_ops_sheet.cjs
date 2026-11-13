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
    // Operations spreadsheet export
    const opsUrl = 'https://docs.google.com/spreadsheets/d/1jhNou39UiAbfYTnRqTLDAF_rI14BThwAUMA_H12RCZw/export?format=csv';
    console.log('Testing access to Operations sheet:', opsUrl);
    const opsRes = await fetchUrl(opsUrl);
    console.log('Operations Sheet status:', opsRes.status);
    console.log('First 300 chars:', opsRes.data.substring(0, 300));
  } catch (err) {
    console.error('Error fetching ops sheet:', err.message);
  }
}
run();
