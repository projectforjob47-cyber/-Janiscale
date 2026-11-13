import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9285;
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

  const helperScript = `
    window.setSelectValue = function(select, value) {
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    window.setInputValue = function(input, value) {
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
  `;

  // ========================================================
  // SCENARIO: Real user interaction on Appointment 931051
  // Select PO 44732915, SKU 150068585, weigh 2 samples to complete it!
  // ========================================================
  console.log('Navigating to appointment 931051...');
  await send('Page.navigate', { url: 'http://localhost:3000/appointment/931051' });
  await new Promise(r => setTimeout(r, 3500));
  await send('Runtime.evaluate', { expression: helperScript });

  // Set iPad Viewport (820 x 1200)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 1200,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Select PO 44732915
  console.log('Selecting PO 44732915...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const poSelect = selects[1];
        if (poSelect) {
          for (let opt of poSelect.options) {
            if (opt.value.includes('44732915')) {
              window.setSelectValue(poSelect, opt.value);
              break;
            }
          }
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Select SKU 150068585
  console.log('Selecting SKU 150068585...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const skuSelect = selects[2];
        if (skuSelect) {
          for (let opt of skuSelect.options) {
            if (opt.value.includes('150068585')) {
              window.setSelectValue(skuSelect, opt.value);
              break;
            }
          }
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Sample 1: Enter 12.60 and click Save
  console.log('Recording Sample 1...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          window.setInputValue(grossInput, '12.60');
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 600));

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('บันทึกตะกร้าที่ 1'));
        if (saveBtn) saveBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Sample 2: Enter 12.60 and click Save (this completes the SKU!)
  console.log('Recording Sample 2 (Completes SKU & PO!)...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          window.setInputValue(grossInput, '12.60');
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 600));

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('บันทึกตะกร้าที่ 2'));
        if (saveBtn) saveBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  // Capture screenshot: PO 44732915 is now completed and CUT OUT of the dropdown!
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'filter-po-removed-931051.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved filter-po-removed-931051.png');

  // Next: Click "แสดงที่ชั่งครบแล้ว (1)" to show the toggle in action
  console.log('Toggling show completed items...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const toggleBtn = btns.find(b => b.textContent && b.textContent.includes('แสดงที่ชั่งครบแล้ว'));
        if (toggleBtn) toggleBtn.click();
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'filter-po-show-completed-toggle.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved filter-po-show-completed-toggle.png');

  // Next: Navigate to Dashboard to see real-time counter and filtering
  console.log('Navigating to Dashboard...');
  await send('Page.navigate', { url: 'http://localhost:3000/dashboard' });
  await new Promise(r => setTimeout(r, 3000));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'filter-dashboard-live-stats.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved filter-dashboard-live-stats.png');

  console.log('All verification captures completed successfully!');
  chrome.kill();
  process.exit(0);
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
