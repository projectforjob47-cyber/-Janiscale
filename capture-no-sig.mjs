import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9233;
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
  
  await new Promise(r => setTimeout(r, 600));
  ws.send(JSON.stringify({
    id: 3,
    method: 'Runtime.evaluate',
    params: {
      expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
    }
  }));

  const outDir = 'C:/Users/Beam/.gemini/antigravity/brain/0ea1f78c-9ad2-4895-bd3a-dd0b1720f46e';

  console.log('Navigating to appointment 931051...');
  ws.send(JSON.stringify({
    id: 4,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/appointment/931051' }
  }));
  await new Promise(r => setTimeout(r, 3000));

  // Scroll down to check weighing bottom area
  ws.send(JSON.stringify({
    id: 5,
    method: 'Runtime.evaluate',
    params: { expression: 'window.scrollTo(0, document.body.scrollHeight)' }
  }));
  await new Promise(r => setTimeout(r, 600));

  // Set 390px viewport
  ws.send(JSON.stringify({
    id: 6,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  }));
  await new Promise(r => setTimeout(r, 500));

  ws.send(JSON.stringify({ id: 7, method: 'Page.captureScreenshot', params: { format: 'png' } }));

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === 7) {
      const buf = Buffer.from(msg.result.data, 'base64');
      fs.writeFileSync(path.join(outDir, 'appointment-weighing-no-sig-390px.png'), buf);
      console.log('Saved appointment-weighing-no-sig-390px.png', buf.length);
      chrome.kill();
      process.exit(0);
    }
  };
}

capture().catch(e => { console.error(e); process.exit(1); });
