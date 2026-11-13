import { spawn } from 'child_process';

async function test() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9292',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1500));
  const targetRes = await fetch('http://127.0.0.1:9292/json/new?http://localhost:3000/login', { method: 'PUT' });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  
  const authState = {
    state: {
      currentUser: {
        id: 'emp-101',
        empId: 'REC01',
        fullName: 'จณิสตา จุลวัจน์',
        role: 'RECEIVE',
        department: 'DC Operations Receiving Fresh',
        isActive: true,
        isPinSet: true,
        pinHash: '123456'
      },
      isAuthenticated: true
    },
    version: 0
  };
  
  let msgId = 1;
  const send = (method, params = {}) => {
    const id = msgId++;
    return new Promise((resolve) => {
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 500));
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
  });

  await send('Page.navigate', { url: 'http://localhost:3000/appointment/931051' });
  await new Promise(r => setTimeout(r, 3500));

  const res = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return Array.from(document.querySelectorAll('select')).map(s => ({
          label: s.previousElementSibling ? s.previousElementSibling.textContent.trim() : '',
          value: s.value,
          options: Array.from(s.options).map(o => o.text.trim())
        }));
      })()
    `,
    returnByValue: true
  });

  console.log('Selects:', JSON.stringify(res.result.value, null, 2));

  // Also query Dexie samplingGroups in 931051
  const groupsRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        return await new Promise((resolve) => {
          const req = indexedDB.open('SmartDCDatabase');
          req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('samplingGroups', 'readonly');
            const store = tx.objectStore('samplingGroups');
            const getReq = store.getAll();
            getReq.onsuccess = () => {
              const all = getReq.result.filter(r => r.apptNbr === '931051');
              resolve(all.map(g => ({ po: g.poNbr, item: g.itemId, status: g.samplingStatus, completed: g.completedSamples, req: g.requiredSamples })));
            };
            getReq.onerror = () => resolve([]);
          };
          req.onerror = () => resolve([]);
        });
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('SamplingGroups in 931051:', JSON.stringify(groupsRes.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}

test().catch(console.error);
