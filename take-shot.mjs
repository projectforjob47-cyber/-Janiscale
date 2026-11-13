import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function test() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9227;
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    'about:blank'
  ]);
  
  await new Promise(r => setTimeout(r, 1500));
  
  const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000/login`, { method: 'PUT' });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  
  const authState = {
    state: {
      currentUser: {
        id: 'emp-101',
        empId: 'REC01',
        fullName: 'สมคิด มั่นคง (RECEIVE)',
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

  await new Promise(r => { ws.onopen = r; });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
  
  await new Promise(r => setTimeout(r, 800));
  
  ws.send(JSON.stringify({
    id: 3,
    method: 'Runtime.evaluate',
    params: {
      expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
    }
  }));

  console.log('Navigating to summary VN...');
  ws.send(JSON.stringify({
    id: 4,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/appointment/931028/summary' }
  }));

  await new Promise(r => setTimeout(r, 3500));

  ws.send(JSON.stringify({
    id: 5,
    method: 'Page.captureScreenshot',
    params: { format: 'png' }
  }));

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 5) {
      const buf = Buffer.from(msg.result.data, 'base64');
      console.log('Screenshot size:', buf.length);
      fs.writeFileSync('c:/Users/Beam/Downloads/receiving fresh/smart-dc/public/screenshots/test-vn-summary.png', buf);
      chrome.kill();
      process.exit(0);
    }
  };
}

test().catch(e => { console.error(e); process.exit(1); });
