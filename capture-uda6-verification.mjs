import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function capture() {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const PORT = 9270;
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
  // SCENARIO 1: Container X (ตะกร้า) on Appointment 931031
  // ========================================================
  console.log('Navigating to appointment 931031 for Container X...');
  await send('Page.navigate', { url: 'http://localhost:3000/appointment/931031' });
  await new Promise(r => setTimeout(r, 4000));
  await send('Runtime.evaluate', { expression: helperScript });

  // Set iPad Viewport (820 x 1200)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 1200,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Select PO 44721582
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const poSelect = selects[1];
        if (poSelect) {
          window.setSelectValue(poSelect, '44721582');
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Select SKU 169601515
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const skuSelect = selects[2];
        if (skuSelect) {
          for (let opt of skuSelect.options) {
            if (opt.value.includes('169601515')) {
              window.setSelectValue(skuSelect, opt.value);
              break;
            }
          }
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 2000));

  // Enter Gross Weight 10.60
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          window.setInputValue(grossInput, '10.60');
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture Container X
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'uda6-container-x-basket.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved uda6-container-x-basket.png (Size:', shot1.result.data.length, 'bytes)');

  // ========================================================
  // SCENARIO 2: Container O (หน่วย & Manual Tare) on Appointment 931046
  // ========================================================
  console.log('Navigating to appointment 931046 for Container O...');
  await send('Page.navigate', { url: 'http://localhost:3000/appointment/931046' });
  await new Promise(r => setTimeout(r, 3500));
  await send('Runtime.evaluate', { expression: helperScript });

  // Select PO and SKU on 931046
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const poSelect = selects[1];
        if (poSelect && poSelect.options.length > 1) {
          window.setSelectValue(poSelect, poSelect.options[1].value);
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1200));

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const selects = document.querySelectorAll('select');
        const skuSelect = selects[2];
        if (skuSelect && skuSelect.options.length > 1) {
          window.setSelectValue(skuSelect, skuSelect.options[1].value);
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Fill in Tare Weight 0.80 and Gross Weight 4.80
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        // Manual tare input
        const tareInput = document.querySelector('input[placeholder*="0.80"]');
        if (tareInput) {
          window.setInputValue(tareInput, '0.80');
        }

        // Gross weight input
        const grossInput = document.querySelector('input[placeholder*="10.85"]');
        if (grossInput) {
          window.setInputValue(grossInput, '4.80');
        }
      })();
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture Container O (Top)
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'uda6-container-o-unit.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved uda6-container-o-unit.png (Size:', shot2.result.data.length, 'bytes)');

  // Scroll down to Card D (บันทึกน้ำหนัก) to see the live math formula and buttons
  await send('Runtime.evaluate', {
    expression: `window.scrollTo({ top: 380, behavior: 'instant' });`
  });
  await new Promise(r => setTimeout(r, 800));

  const shot2b = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'uda6-container-o-unit-weighing.png'), Buffer.from(shot2b.result.data, 'base64'));
  console.log('Saved uda6-container-o-unit-weighing.png (Size:', shot2b.result.data.length, 'bytes)');

  // Mobile iPhone Viewport (390 x 844)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 800));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'uda6-container-o-iphone-390px.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved uda6-container-o-iphone-390px.png (Size:', shot3.result.data.length, 'bytes)');

  console.log('All verification captures completed successfully!');
  chrome.kill();
  process.exit(0);
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
