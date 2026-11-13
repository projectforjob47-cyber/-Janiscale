import { spawn } from 'child_process';
import fs from 'fs';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9339;
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

  // Set Auth
  ws.send(JSON.stringify({
    id: 10,
    method: 'Runtime.evaluate',
    params: {
      expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
    }
  }));

  // 1. Capture AppointmentDetailPage (931028)
  console.log('Navigating to Appointment 931028 Detail...');
  ws.send(JSON.stringify({
    id: 11,
    method: 'Emulation.setDeviceMetricsOverride',
    params: { width: 430, height: 950, deviceScaleFactor: 2, mobile: true }
  }));
  ws.send(JSON.stringify({
    id: 12,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/appointment/931028' }
  }));
  await new Promise(r => setTimeout(r, 2500));

  let msgHandler;
  const shot1Promise = new Promise(resolve => {
    msgHandler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 13 && data.result?.data) {
        fs.writeFileSync(`${outDir}/verify-appt-no-summary-button.png`, Buffer.from(data.result.data, 'base64'));
        console.log('Saved verify-appt-no-summary-button.png');
        resolve();
      }
    };
    ws.addEventListener('message', msgHandler);
    ws.send(JSON.stringify({ id: 13, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  await shot1Promise;
  ws.removeEventListener('message', msgHandler);

  // 2. Capture AppointmentSummaryPage (931028)
  console.log('Navigating to Appointment 931028 Summary...');
  ws.send(JSON.stringify({
    id: 20,
    method: 'Page.navigate',
    params: { url: 'http://localhost:3000/appointment/931028/summary' }
  }));
  await new Promise(r => setTimeout(r, 2500));

  const shot2Promise = new Promise(resolve => {
    msgHandler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 21 && data.result?.data) {
        fs.writeFileSync(`${outDir}/verify-summary-locked.png`, Buffer.from(data.result.data, 'base64'));
        console.log('Saved verify-summary-locked.png');
        resolve();
      }
    };
    ws.addEventListener('message', msgHandler);
    ws.send(JSON.stringify({ id: 21, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });
  await shot2Promise;

  chrome.kill();
  console.log('Verification completed successfully!');
  process.exit(0);
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
