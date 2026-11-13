import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9239;
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

  // 1. Dashboard Desktop 1280px
  console.log('Navigating to dashboard...');
  ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'http://localhost:3000/dashboard' } }));
  await new Promise(r => setTimeout(r, 2000));

  ws.send(JSON.stringify({
    id: 5,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
  }));
  await new Promise(r => setTimeout(r, 800));

  await new Promise((res) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 6) {
        ws.removeEventListener('message', handler);
        fs.writeFileSync(path.join(outDir, 'header-dashboard-1280px.png'), Buffer.from(msg.result.data, 'base64'));
        console.log('Saved header-dashboard-1280px.png');
        res();
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: 6, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });

  // 2. Dashboard Mobile 390px
  ws.send(JSON.stringify({
    id: 7,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  }));
  await new Promise(r => setTimeout(r, 800));

  await new Promise((res) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 8) {
        ws.removeEventListener('message', handler);
        fs.writeFileSync(path.join(outDir, 'header-dashboard-390px.png'), Buffer.from(msg.result.data, 'base64'));
        console.log('Saved header-dashboard-390px.png');
        res();
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: 8, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });

  // 3. Appointment Detail Mobile 390px (Subpage)
  ws.send(JSON.stringify({ id: 9, method: 'Page.navigate', params: { url: 'http://localhost:3000/appointment/931028' } }));
  await new Promise(r => setTimeout(r, 2000));

  await new Promise((res) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 10) {
        ws.removeEventListener('message', handler);
        fs.writeFileSync(path.join(outDir, 'header-subpage-detail-390px.png'), Buffer.from(msg.result.data, 'base64'));
        console.log('Saved header-subpage-detail-390px.png');
        res();
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });

  // 4. CN Report Mobile 390px (Subpage)
  ws.send(JSON.stringify({ id: 11, method: 'Page.navigate', params: { url: 'http://localhost:3000/cn' } }));
  await new Promise(r => setTimeout(r, 2000));

  await new Promise((res) => {
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 12) {
        ws.removeEventListener('message', handler);
        fs.writeFileSync(path.join(outDir, 'header-subpage-cn-390px.png'), Buffer.from(msg.result.data, 'base64'));
        console.log('Saved header-subpage-cn-390px.png');
        res();
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: 12, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });

  ws.close();
  chrome.kill();
  console.log('All header screenshots captured successfully!');
}

capture().catch(console.error);
