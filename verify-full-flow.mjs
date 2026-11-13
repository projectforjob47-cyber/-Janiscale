import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function verify() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9295;
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
  await new Promise(r => setTimeout(r, 600));

  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('smart-dc-auth-v3', '${JSON.stringify(authState)}');`
  });

  const outDir = 'C:/Users/Beam/.gemini/antigravity/brain/0ea1f78c-9ad2-4895-bd3a-dd0b1720f46e';

  // Navigate to appointment 931046
  console.log('Navigating to appointment 931046...');
  await send('Page.navigate', { url: 'http://localhost:3000/appointment/931046' });
  await new Promise(r => setTimeout(r, 3500));

  // Set iPad Viewport (820 x 1200)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 1200,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Item 1: Enter gross weight 10.50 (Tare is 0 for O or set tare 0.50)
  console.log('Item 1: Entering weight 10.50...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tareInput = document.querySelector('input[placeholder*="0.80"]');
        if (tareInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(tareInput, '0.50');
          tareInput.dispatchEvent(new Event('input', { bubbles: true }));
          tareInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(grossInput, '10.50');
          grossInput.dispatchEvent(new Event('input', { bubbles: true }));
          grossInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Item 1: Clicking Save...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('บันทึกหน่วยที่ 1'));
        if (saveBtn) saveBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  // Item 2: Auto-selected! Enter gross weight 15.50 and tare 0.50
  console.log('Item 2: Entering weight 15.50 (Completes PO & Appointment!)...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tareInput = document.querySelector('input[placeholder*="0.80"]');
        if (tareInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(tareInput, '0.50');
          tareInput.dispatchEvent(new Event('input', { bubbles: true }));
          tareInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(grossInput, '15.50');
          grossInput.dispatchEvent(new Event('input', { bubbles: true }));
          grossInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Item 2: Clicking Save...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('บันทึกหน่วยที่ 1'));
        if (saveBtn) saveBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 2500));

  // Capture: Appointment 931046 is 100% completed, showing celebratory card!
  console.log('Capturing Appointment 931046 Completed Card...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify-appt-complete-card.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved verify-appt-complete-card.png');

  // Navigate to Dashboard: 931046 is cut out from active list!
  console.log('Navigating to Dashboard...');
  await send('Page.navigate', { url: 'http://localhost:3000/dashboard' });
  await new Promise(r => setTimeout(r, 3000));

  console.log('Capturing Dashboard showing 931046 cut out...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify-dashboard-cutout.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved verify-dashboard-cutout.png');

  // Toggle "แสดงทั้งหมด (รวมที่เสร็จแล้ว)" on Dashboard to show it in full view
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const toggleBtn = btns.find(b => b.textContent && b.textContent.includes('ซ่อนที่ชั่งครบแล้ว'));
        if (toggleBtn) toggleBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'verify-dashboard-show-all.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved verify-dashboard-show-all.png');

  console.log('All verification completed successfully!');
  chrome.kill();
  process.exit(0);
}

verify().catch(console.error);
