import { spawn } from 'child_process';
import fs from 'fs';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9336;
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
  
  const outDir = 'C:/Users/Beam/.gemini/antigravity/brain/0ea1f78c-9ad2-4895-bd3a-dd0b1720f46e';

  // 1. Capture Login Page
  console.log('Capturing Login Page...');
  ws.send(JSON.stringify({
    id: 10,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 420, height: 850, deviceScaleFactor: 2, mobile: true }
  }));
  ws.send(JSON.stringify({
    id: 11,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/login' }
  }));
  await new Promise(r => setTimeout(r, 4000));

  let msgHandler;
  const loginShotPromise = new Promise(resolve => {
    msgHandler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 12 && data.result?.data) {
        fs.writeFileSync(`${outDir}/verify-login-lotus.png`, Buffer.from(data.result.data, 'base64'));
        console.log('Saved verify-login-lotus.png');
        resolve();
      }
    };
    ws.addEventListener('message', msgHandler);
    ws.send(JSON.stringify({ id: 12, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  await loginShotPromise;
  ws.removeEventListener('message', msgHandler);

  // 2. Set Auth & Capture Dashboard
  console.log('Navigating to Dashboard...');
  ws.send(JSON.stringify({
    id: 20,
    method: 'Runtime.evaluate',
    params: {
      expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
    }
  }));
  ws.send(JSON.stringify({
    id: 21,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/dashboard' }
  }));
  await new Promise(r => setTimeout(r, 2500));

  const dashShotPromise = new Promise(resolve => {
    msgHandler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 22 && data.result?.data) {
        fs.writeFileSync(`${outDir}/verify-dashboard-lotus.png`, Buffer.from(data.result.data, 'base64'));
        console.log('Saved verify-dashboard-lotus.png');
        resolve();
      }
    };
    ws.addEventListener('message', msgHandler);
    ws.send(JSON.stringify({ id: 22, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  await dashShotPromise;
  ws.removeEventListener('message', msgHandler);

  // 3. Tablet iPad View of Dashboard
  console.log('Capturing iPad View of Dashboard...');
  ws.send(JSON.stringify({
    id: 30,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 820, height: 1100, deviceScaleFactor: 2, mobile: false }
  }));
  await new Promise(r => setTimeout(r, 1000));

  const tabletShotPromise = new Promise(resolve => {
    msgHandler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 31 && data.result?.data) {
        fs.writeFileSync(`${outDir}/verify-dashboard-tablet-lotus.png`, Buffer.from(data.result.data, 'base64'));
        console.log('Saved verify-dashboard-tablet-lotus.png');
        resolve();
      }
    };
    ws.addEventListener('message', msgHandler);
    ws.send(JSON.stringify({ id: 31, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  await tabletShotPromise;

  chrome.kill();
  console.log('All screenshots captured successfully!');
  process.exit(0);
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
