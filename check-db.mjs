import { spawn } from 'child_process';

async function check() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(CHROME_PATH, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9338', 'about:blank']);
  await new Promise(r => setTimeout(r, 1500));
  const targetRes = await fetch('http://127.0.0.1:9338/json/new?http://localhost:3000/dashboard', { method: 'PUT' });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id === 2) {
      console.log('DB STATE:', JSON.stringify(data.result?.result?.value, null, 2));
      chrome.kill();
      process.exit(0);
    }
  };

  await new Promise(r => setTimeout(r, 1000));
  ws.send(JSON.stringify({
    id: 2,
    method: 'Runtime.evaluate',
    params: {
      expression: `(async () => {
        const req = indexedDB.open('SmartDCDatabase');
        return new Promise((resolve) => {
          req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction(['importBatches', 'appointments', 'samplingGroups'], 'readonly');
            const batchesReq = tx.objectStore('importBatches').getAll();
            const apptsReq = tx.objectStore('appointments').getAll();
            const groupsReq = tx.objectStore('samplingGroups').getAll();
            tx.oncomplete = () => {
              resolve({
                batches: batchesReq.result.map(b => ({ id: b.id, filename: b.filename, receiveDate: b.receiveDate, uploadedAt: b.uploadedAt, appts: b.appointmentCount })),
                apptsCount: apptsReq.result.length,
                appts: apptsReq.result.map(a => ({ id: a.id, apptNbr: a.apptNbr, batchId: a.importBatchId, receiveDate: a.receiveDate })),
                groupsCount: groupsReq.result.length
              });
            };
          };
        });
      })()`,
      awaitPromise: true,
      returnByValue: true
    }
  }));
}

check().catch(e => { console.error(e); process.exit(1); });
