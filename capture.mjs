import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const USER_DATA_DIR = path.resolve('C:\\Users\\Beam\\AppData\\Local\\Temp\\chrome-smart-dc-shots-v3');

if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

console.log('Starting headless Chrome...');
const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${USER_DATA_DIR}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
]);

async function waitForCdp() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        console.log('Connected to Chrome:', data.Browser);
        return data.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Chrome did not start in time');
}

class SimpleCdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  async open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  try {
    const wsUrl = await waitForCdp();
    const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000/login`, { method: 'PUT' });
    const target = await targetRes.json();
    console.log('Created tab:', target.id);

    const cdp = new SimpleCdp(target.webSocketDebuggerUrl);
    await cdp.open();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await new Promise(r => setTimeout(r, 2000));

    // Inject authStore
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
          pinHash: '123456',
          createdAt: new Date().toISOString()
        },
        isAuthenticated: true
      },
      version: 0
    };

    await cdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('smart-dc-auth-v3', JSON.stringify(${JSON.stringify(authState)}));`
    });
    console.log('Auth state injected.');

    const viewports = [
      { name: '320px', width: 320, height: 640 },
      { name: '375px', width: 375, height: 667 },
      { name: '390px', width: 390, height: 844 },
      { name: '430px', width: 430, height: 932 },
      { name: '1280px', width: 1280, height: 800 }
    ];

    const outDir = path.resolve('public/screenshots');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Dashboard
    console.log('Capturing Dashboard...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/dashboard' });
    await new Promise(r => setTimeout(r, 2500));

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await new Promise(r => setTimeout(r, 400));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `dashboard-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    // 2. Appointment Detail (931028)
    console.log('Capturing Appointment Detail...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/appointment/931028' });
    await new Promise(r => setTimeout(r, 2500));

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await new Promise(r => setTimeout(r, 400));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `appointment-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    // 3. Appointment Summary VN (931028)
    console.log('Capturing Summary VN...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/appointment/931028/summary' });
    await new Promise(r => setTimeout(r, 2500));

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await new Promise(r => setTimeout(r, 400));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `summary-vn-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    // 4. Appointment Summary PR (931986)
    console.log('Capturing Summary PR...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/appointment/931986/summary' });
    await new Promise(r => setTimeout(r, 2500));

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await new Promise(r => setTimeout(r, 400));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `summary-pr-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    // 5. Excel Hub (/sheets)
    console.log('Capturing Excel Hub (/sheets)...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/sheets' });
    await new Promise(r => setTimeout(r, 2500));

    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await new Promise(r => setTimeout(r, 400));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `excel-hub-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    cdp.close();
    chromeProc.kill();
    console.log('All screenshots completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error during capture:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

run();
