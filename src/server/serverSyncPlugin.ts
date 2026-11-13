// ============================================================
// SMART DC — Server Sync Plugin for Vite
// Real-time Multi-Device Synchronization Engine
// Uses Server-Sent Events (SSE) & Persistent Server State
// ============================================================

import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { isFrozenJob, isSp1Prepack, isSamplingCatchWeight } from '../lib/businessLogic';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.resolve(DATA_DIR, 'server_state.json');

interface ServerDatabase {
  users: any[];
  appointments: any[];
  appointmentVendors: any[];
  purchaseOrders: any[];
  samplingGroups: any[];
  measurements: any[];
  signatureRecords: any[];
  cnCases: any[];
  basketMaster: any[];
  focusMaster: any[];
  itemMaster: any[];
  updatedAt: string;
}

let serverDb: ServerDatabase | null = null;
let saveTimeout: NodeJS.Timeout | null = null;
const sseClients = new Set<ServerResponse>();

// Clean corrupted characters helper
function cleanCorruptedString(str: any): any {
  if (typeof str !== 'string') return str;
  if (!str.includes('\uFFFD') && !/[\u00ef\u00bf\u00bd]/.test(str)) return str;
  let s = str;
  s = s.replace(/ก[\uFFFD\u00ef\u00bf\u00bd]*?\.ละ/g, 'กก.ละ');
  s = s.replace(/ก[\uFFFD\u00ef\u00bf\u00bd]*?\. ละ/g, 'กก.ละ');
  s = s.replace(/แ[\uFFFD\u00ef\u00bf\u00bd]*?งโม/g, 'แตงโม');
  s = s.replace(/แตงโม[\uFFFD\u00ef\u00bf\u00bd]+?ีซี่/g, 'แตงโมอีซี่');
  s = s.replace(/บ[\uFFFD\u00ef\u00bf\u00bd]*?ิษัท/g, 'บริษัท');
  s = s.replace(/บริษ[\uFFFD\u00ef\u00bf\u00bd]+?ท/g, 'บริษัท');
  s = s.replace(/ซี[\uFFFD\u00ef\u00bf\u00bd]*?ี/g, 'ซีพี');
  s = s.replace(/พ[\uFFFD\u00ef\u00bf\u00bd]*?ีเมี่ยม/g, 'พรีเมี่ยม');
  s = s.replace(/พรี[\uFFFD\u00ef\u00bf\u00bd]*?มี่ยม/g, 'พรีเมี่ยม');
  s = s.replace(/[\uFFFD\u00ef\u00bf\u00bd]*?กไก่/g, 'อกไก่');
  s = s.replace(/อกไ[\uFFFD\u00ef\u00bf\u00bd]+?่บด/g, 'อกไก่บด');
  s = s.replace(/สะโ[\uFFFD\u00ef\u00bf\u00bd]*?ก[\uFFFD\u00ef\u00bf\u00bd]*?ก่/g, 'สะโพกไก่');
  s = s.replace(/ติดสะโพกไ[\uFFFD\u00ef\u00bf\u00bd]+?่/g, 'ติดสะโพกไก่');
  s = s.replace(/ลอก[\uFFFD\u00ef\u00bf\u00bd]+?นัง/g, 'ลอกหนัง');
  s = s.replace(/น้ำ[\uFFFD\u00ef\u00bf\u00bd]+?ริก/g, 'น้ำพริก');
  s = s.replace(/หยงฝั้[\uFFFD\u00ef\u00bf\u00bd]+/g, 'หยงฝั้น');
  s = s.replace(/ปลาลิ[\uFFFD\u00ef\u00bf\u00bd]*?นหมา/g, 'ปลาลิ้นหมา');
  s = s.replace(/ปลาลิ้นห[\uFFFD\u00ef\u00bf\u00bd]+?า/g, 'ปลาลิ้นหมา');
  s = s.replace(/ยากิ[\uFFFD\u00ef\u00bf\u00bd]+?ทริ/g, 'ยากิโทริ');
  s = s.replace(/แว่น[\uFFFD\u00ef\u00bf\u00bd]*?ก้ว/g, 'แว่นแก้ว');
  s = s.replace(/พึ่งไท[\uFFFD\u00ef\u00bf\u00bd]*/g, 'พึ่งไทย');
  s = s.replace(/จ[\uFFFD\u00ef\u00bf\u00bd]*?นดาพร/g, 'จินดาพร');
  s = s.replace(/หอยแค[\uFFFD\u00ef\u00bf\u00bd]*?ง/g, 'หอยแครง');
  s = s.replace(/กะหล่ำดอก[\uFFFD\u00ef\u00bf\u00bd]*?าวนอก/g, 'กะหล่ำดอกขาวนอก');
  s = s.replace(/ถั่วรว[\uFFFD\u00ef\u00bf\u00bd]*?ผสม/g, 'ถั่วรวมผสม');
  s = s.replace(/หน[\uFFFD\u00ef\u00bf\u00bd]*?อไม้/g, 'หน่อไม้');
  s = s.replace(/ปีก[\uFFFD\u00ef\u00bf\u00bd]*?นไก่/g, 'ปีกบนไก่');
  s = s.replace(/โคฟเวอร์ชายน[\uFFFD\u00ef\u00bf\u00bd]*/g, 'โคฟเวอร์ชายน์');
  s = s.replace(/[\uFFFD\u00ef\u00bf\u00bd]/g, '');
  return s.trim();
}

function cleanAllCorruptedText(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') return cleanCorruptedString(obj);
  if (Array.isArray(obj)) return obj.map(cleanAllCorruptedText);
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      obj[k] = cleanAllCorruptedText(obj[k]);
    }
    return obj;
  }
  return obj;
}

function loadOrCreateInitialState(): ServerDatabase {
  console.log('[SyncServer] Loading from STATE_FILE:', STATE_FILE);
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.samplingGroups)) {
        // Authoritative clean Thai descriptions from itemMasterData
        try {
          const itemMasterPath = path.resolve(process.cwd(), 'src/lib/itemMasterData.json');
          if (fs.existsSync(itemMasterPath)) {
            const items = JSON.parse(fs.readFileSync(itemMasterPath, 'utf8'));
            const itemMap = new Map<string, string>();
            items.forEach((it: any) => {
              const id = String(it.itemId || it.itemNumber || '').trim();
              if (id && it.description) itemMap.set(id, it.description.trim());
            });
            parsed.samplingGroups.forEach((g: any) => {
              const clean = itemMap.get(String(g.itemId).trim());
              if (clean) g.description = clean;
            });
            if (Array.isArray(parsed.cnCases)) {
              parsed.cnCases.forEach((c: any) => {
                const clean = itemMap.get(String(c.itemId).trim());
                if (clean) c.description = clean;
              });
            }
            parsed.itemMaster = items;
          }
        } catch (e) {}

        // Authoritative clean fullNames from authorizedRoster
        try {
          const rosterPath = path.resolve(process.cwd(), 'src/lib/authorizedRoster.json');
          if (fs.existsSync(rosterPath)) {
            const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
            const rMap = new Map<string, string>();
            roster.forEach((r: any) => {
              if (r.empId) rMap.set(r.empId.toUpperCase(), r.fullName);
            });
            parsed.users.forEach((u: any) => {
              if (u.empId && rMap.has(u.empId.toUpperCase())) {
                u.fullName = rMap.get(u.empId.toUpperCase());
              }
            });
          }
        } catch (e) {}

        cleanAllCorruptedText(parsed);

        // Enforce exclusion of Frozen (FZ21 / FZ) and SP1 prepack items from sampling groups
        const originalCount = parsed.samplingGroups.length;
        parsed.samplingGroups = parsed.samplingGroups.filter((g: any) => {
          return !isFrozenJob(g.uda7, g.ups, g.loadType) && !isSp1Prepack(g.description);
        });

        if (parsed.samplingGroups.length !== originalCount) {
          console.log(`[SyncServer] Filtered out ${originalCount - parsed.samplingGroups.length} FZ / SP1 items from server state.`);
          if (Array.isArray(parsed.appointments)) {
            for (const appt of parsed.appointments) {
              const groups = parsed.samplingGroups.filter((g: any) => g.apptNbr === appt.apptNbr);
              appt.catchWeightSkuCount = groups.length;
              appt.totalSamplingGroups = groups.length;
            }
          }
          parsed.updatedAt = new Date().toISOString();
          fs.writeFileSync(STATE_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        }

        console.log(`[SyncServer] Loaded existing server state: ${parsed.users.length} users, ${parsed.samplingGroups.length} groups, ${parsed.measurements?.length || 0} measurements`);
        return parsed;
      }
    } catch (e) {
      console.error('[SyncServer] Failed to read server_state.json, recreating...', e);
    }
  }

  // Create initial state
  console.log('[SyncServer] Creating initial central state from seed data...');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Read seed data
  let authorizedRoster: any[] = [];
  let seedRows: any[] = [];
  let itemMasterData: any[] = [];

  try {
    const rosterPath = path.resolve(process.cwd(), 'src/lib/authorizedRoster.json');
    if (fs.existsSync(rosterPath)) {
      authorizedRoster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
    }
  } catch (e) {}

  try {
    const seedPath = path.resolve(process.cwd(), 'src/lib/seedData.json');
    if (fs.existsSync(seedPath)) {
      seedRows = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    }
  } catch (e) {}

  try {
    const itemPath = path.resolve(process.cwd(), 'src/lib/itemMasterData.json');
    if (fs.existsSync(itemPath)) {
      itemMasterData = JSON.parse(fs.readFileSync(itemPath, 'utf8'));
    }
  } catch (e) {}

  const now = new Date().toISOString();

  // 1. Initial Users
  const users: any[] = [
    {
      id: 'admin-projectforjob47',
      username: 'projectforjob47@gmail.com',
      empId: 'ADMIN01',
      fullName: 'System Administrator (projectforjob47@gmail.com)',
      role: 'ADMIN',
      email: 'projectforjob47@gmail.com',
      pinHash: 'Forwork2547',
      isPinSet: true,
      isActive: true,
      createdAt: now,
    }
  ];

  for (const r of authorizedRoster) {
    const cleanId = String(r.empId).trim().toUpperCase();
    const isOtm = r.department === 'DC Operation Team Manager';
    const role = isOtm ? 'OTM' : (r.department?.includes('S&LP') ? 'LPS' : 'RECEIVE');

    users.push({
      id: `user-${r.empId}`,
      username: r.empId,
      empId: r.empId,
      fullName: r.fullName,
      role,
      department: r.department,
      email: r.email,
      pinHash: '',
      isPinSet: false,
      isActive: true,
      createdAt: now,
    });
  }

  // 2. Initial Basket Master
  const basketMaster: any[] = [
    { id: 'b-sf', code: 'SF', name: 'SF (ตะกร้าพลาสติกมาตรฐาน)', tareWeightKg: 1.40, tareWeightGram: 1400, color: 'blue', isActive: true, createdAt: now, updatedAt: now },
    { id: 'b-x',  code: 'X',  name: 'X (ตะกร้าโปร่ง)',              tareWeightKg: 1.50, tareWeightGram: 1500, color: 'green', isActive: true, createdAt: now, updatedAt: now },
    { id: 'b-y',  code: 'Y',  name: 'Y (ตะกร้าทึบ)',                tareWeightKg: 1.70, tareWeightGram: 1700, color: 'orange', isActive: true, createdAt: now, updatedAt: now },
    { id: 'b-z',  code: 'Z',  name: 'Z (ตะกร้าใหญ่พิเศษ)',           tareWeightKg: 2.20, tareWeightGram: 2200, color: 'purple', isActive: true, createdAt: now, updatedAt: now },
    { id: 'b-o',  code: 'O',  name: 'O (ภาชนะชนิดอื่น เช่น กล่อง/กระสอบ)', tareWeightKg: 0.00, tareWeightGram: 0, color: 'gray', isActive: true, createdAt: now, updatedAt: now },
  ];

  // 3. Initial Focus Master
  const focusMaster: any[] = [
    { id: 'f-1', itemId: '163989158', description: 'คางปลาหมึกยักษ์', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-2', itemId: '169229461', description: 'SP20_หางปลาหมึกยักษ์ กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-3', itemId: '169484704', description: 'SP15_แก้วมังกร กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-4', itemId: '169187250', description: 'ปีกปลาหมึกยักษ์', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-5', itemId: '163114744', description: 'SP20_หนวดปลาหมึกยักษ์ กก. ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-6', itemId: '164413354', description: 'SP15_ส้มสายน้ำผึ้ง กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-7', itemId: '170007636', description: 'SP9_ส้มแมนดาริน สายพันธุ์ไต้หวัน กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-8', itemId: '164656437', description: 'SP10_สันนอกหมูกก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-9', itemId: '170029420', description: 'SP4_สันนอกหมูสไลด์ กก. ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-10', itemId: '150811983', description: 'SP12_อกไก่แช่แข็ง กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-11', itemId: '169088177', description: 'SP15_ลำไยอีด้อ กก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
    { id: 'f-12', itemId: '169045516', description: 'SP8_สันคอหมูกก.ละ', status: 'Check 992', isActive: true, uploadedAt: now },
  ];

  // Helper to parse standard weight
  function parseSp(desc: string) {
    if (!desc) return { std: null, exp: null };
    const m = desc.match(/SP\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      const val = parseFloat(m[1]);
      return { std: isNaN(val) ? null : val, exp: m[0] };
    }
    return { std: null, exp: null };
  }

  // 4. Initial Appointments & Hierarchy from seedRows
  const appointments: any[] = [];
  const appointmentVendors: any[] = [];
  const purchaseOrders: any[] = [];
  const samplingGroups: any[] = [];

  const apptMap = new Map<string, any>();
  const vendorMap = new Map<string, any>();
  const poMap = new Map<string, any>();
  const groupMap = new Map<string, any>();
  const batchId = 'batch-seed-initial';
  const receiveDate = '2026-10-12';

  for (const r of seedRows) {
    // Strictly exclude FZ/FZ21 jobs and SP1 retail weight prepacks
    if (!isSamplingCatchWeight(r)) {
      continue;
    }

    if (!apptMap.has(r.apptNbr)) {
      const apptObj = {
        id: `appt-${r.apptNbr}`,
        importBatchId: batchId,
        apptNbr: r.apptNbr,
        apptTime: r.apptTime || '08:00',
        apptStatus: 'CONFIRMED',
        carrierCode: r.carrierCode || 'VN',
        receiveDate,
        vendorCount: 0,
        poCount: 0,
        catchWeightSkuCount: 0,
        totalSamplingGroups: 0,
        completedGroups: 0,
        failedGroups: 0,
        pendingOtmGroups: 0,
        deliveryExceptionGroups: 0,
        syncStatus: 'SYNCED',
        createdAt: now,
        updatedAt: now,
      };
      apptMap.set(r.apptNbr, apptObj);
      appointments.push(apptObj);
    }
    const appt = apptMap.get(r.apptNbr)!;

    const vKey = `${r.apptNbr}_${r.vendorNbr}`;
    if (!vendorMap.has(vKey)) {
      const vObj = {
        id: `v-${vKey}`,
        appointmentId: appt.id,
        apptNbr: r.apptNbr,
        vendorNbr: r.vendorNbr,
        vendorName: r.vendorName,
        poCount: 0,
        syncStatus: 'SYNCED',
      };
      vendorMap.set(vKey, vObj);
      appointmentVendors.push(vObj);
    }
    const vendor = vendorMap.get(vKey)!;

    const poKey = `${r.apptNbr}_${r.poNbr}_${r.vendorNbr}`;
    if (!poMap.has(poKey)) {
      const poObj = {
        id: `po-${poKey}`,
        appointmentId: appt.id,
        vendorId: vendor.id,
        apptNbr: r.apptNbr,
        vendorNbr: r.vendorNbr,
        poNbr: r.poNbr,
        itemCount: 0,
        syncStatus: 'SYNCED',
      };
      poMap.set(poKey, poObj);
      purchaseOrders.push(poObj);
    }
    const po = poMap.get(poKey)!;

    const gKey = `${r.apptNbr}_${r.poNbr}_${r.itemId}`;
    if (!groupMap.has(gKey)) {
      const trimmedId = String(r.itemId).trim();
      const masterItem = itemMasterData.find((m: any) => String(m.itemId).trim() === trimmedId);
      const finalDesc = masterItem?.description || r.description;
      const sp = parseSp(finalDesc);

      const groupObj = {
        id: `sg-${gKey}`,
        importBatchId: batchId,
        appointmentId: appt.id,
        poId: po.id,
        apptNbr: r.apptNbr,
        poNbr: r.poNbr,
        itemId: r.itemId,
        description: finalDesc,
        division: r.division,
        dept: r.dept,
        vendorNbr: r.vendorNbr,
        vendorName: r.vendorName,
        carrierCode: r.carrierCode || 'VN',
        spExpression: sp.exp,
        standardWeightKg: sp.std,
        spParserStatus: sp.std ? 'SUCCESS' : 'MANUAL_REQUIRED',
        spOverrideReason: null,
        spOverrideBy: null,
        spOverrideAt: null,
        uda6: r.uda6 ? String(r.uda6).trim().toUpperCase() : null,
        defaultBasketCode: r.uda6 ? String(r.uda6).trim().toUpperCase() : null,
        apptContQty: r.apptContQty,
        importedRcvdContQty: r.rcvdContQty ?? 0,
        confirmedActualQty: (r.apptContQty && r.apptContQty > 0) ? r.apptContQty : 1,
        qtyConfirmedBy: null,
        qtyConfirmedAt: null,
        qtyCorrectionReason: null,
        requiredSamples: Math.max(1, Math.ceil(((r.apptContQty && r.apptContQty > 0) ? r.apptContQty : 1) * 0.10)),
        completedSamples: 0,
        validSamples: 0,
        samplingStatus: 'รอชั่ง',
        focusStatus: 'NON_FOCUS',
        deliveryStatus: 'NORMAL',
        workflowStatus: 'PENDING_QTY_CONFIRM',
        syncStatus: 'SYNCED',
        cnStatus: 'NONE',
        approvalVersion: 1,
        weightResult: 'INCOMPLETE',
        sourceRowIndexes: [r.sourceRowIndex],
        createdAt: now,
        updatedAt: now,
      };
      groupMap.set(gKey, groupObj);
      samplingGroups.push(groupObj);
      po.itemCount++;
    }
  }

  // Update counts
  for (const [apptNbr, appt] of apptMap.entries()) {
    const vList = appointmentVendors.filter(v => v.apptNbr === apptNbr);
    const pList = purchaseOrders.filter(p => p.apptNbr === apptNbr);
    const gList = samplingGroups.filter(g => g.apptNbr === apptNbr);
    appt.vendorCount = vList.length;
    appt.poCount = pList.length;
    appt.catchWeightSkuCount = gList.length;
    appt.totalSamplingGroups = gList.length;
  }

  const initialDb: ServerDatabase = {
    users,
    appointments,
    appointmentVendors,
    purchaseOrders,
    samplingGroups,
    measurements: [],
    signatureRecords: [],
    cnCases: [],
    basketMaster,
    focusMaster,
    itemMaster: itemMasterData,
    updatedAt: now,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
  console.log('[SyncServer] Initial central state saved to', STATE_FILE);
  return initialDb;
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (serverDb) {
      try {
        cleanAllCorruptedText(serverDb);
        serverDb.updatedAt = new Date().toISOString();
        fs.writeFileSync(STATE_FILE, JSON.stringify(serverDb, null, 2), 'utf8');
      } catch (err) {
        console.error('[SyncServer] Failed to persist server_state.json', err);
      }
    }
  }, 200);
}

function broadcastEvent(type: string, data: any, excludeClient?: string) {
  const payload = JSON.stringify({ type, data, excludeClient, timestamp: Date.now() });
  const message = `data: ${payload}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

export function syncServerPlugin(): Plugin {
  return {
    name: 'smart-dc-sync-server',
    configureServer(server: ViteDevServer) {
      serverDb = loadOrCreateInitialState();
      console.log(`[SyncServer] Reloaded clean central state: ${serverDb.appointments.length} appointments, ${serverDb.samplingGroups.length} groups`);

      // Heartbeat for SSE connections every 15s
      setInterval(() => {
        for (const client of sseClients) {
          try {
            client.write(': heartbeat\n\n');
          } catch (e) {
            sseClients.delete(client);
          }
        }
      }, 15000);

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        // Only handle /api/sync/* and /api/users/*
        if (!pathname.startsWith('/api/sync') && !pathname.startsWith('/api/users')) {
          return next();
        }

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-ID');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Helper to parse JSON body
        const parseBody = (): Promise<any> => {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                resolve(body ? JSON.parse(body) : {});
              } catch (e) {
                resolve({});
              }
            });
          });
        };

        // Helper to send JSON
        const sendJson = (statusCode: number, data: any) => {
          res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(data));
        };

        try {
          // ─── 1. SSE Stream: Real-Time Broadcast to Connected Devices ───
          if (pathname === '/api/sync/stream' && req.method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            });
            res.write(': connected to smart-dc real-time sync\n\n');
            sseClients.add(res);

            req.on('close', () => {
              sseClients.delete(res);
            });
            return;
          }

          // ─── 2. Full Sync: Initial Download on Device Connect ─────────
          if (pathname === '/api/sync/full' && req.method === 'GET') {
            if (!serverDb) serverDb = loadOrCreateInitialState();
            cleanAllCorruptedText(serverDb);
            sendJson(200, {
              success: true,
              data: serverDb,
              clientCount: sseClients.size,
              serverTime: new Date().toISOString(),
            });
            return;
          }

          // ─── 2b. Replace Full State: Master Import / Purge Sync Across All Devices ───
          if (pathname === '/api/sync/replace-state' && req.method === 'POST') {
            const body = await parseBody();
            cleanAllCorruptedText(body);
            const { clientId, data } = body;
            if (data && Array.isArray(data.appointments)) {
              if (!serverDb) serverDb = loadOrCreateInitialState();
              const updatedTime = new Date().toISOString();
              serverDb = {
                ...serverDb,
                ...data,
                updatedAt: updatedTime,
              };
              cleanAllCorruptedText(serverDb);
              fs.writeFileSync(STATE_FILE, JSON.stringify(serverDb, null, 2), 'utf8');
              console.log(`[SyncServer] Master state replaced from client ${clientId}: ${data.appointments.length} appts, ${data.samplingGroups?.length || 0} groups`);
              broadcastEvent('FULL_STATE_REPLACED', { updatedAt: updatedTime }, clientId);
              sendJson(200, { success: true, message: 'Server state updated and broadcast' });
              return;
            }
          }

          // ─── 3. Mutations: Real-Time Changes from Any Device ──────────
          if (pathname === '/api/sync/mutate' && req.method === 'POST') {
            if (!serverDb) serverDb = loadOrCreateInitialState();
            const body = await parseBody();
            cleanAllCorruptedText(body);
            const { clientId, mutations } = body;

            if (Array.isArray(mutations) && mutations.length > 0) {
              for (const m of mutations) {
                const { table, op, data, key } = m;
                if (!table || !(table in serverDb)) continue;

                const tableArr = (serverDb as any)[table] as any[];
                if (!Array.isArray(tableArr)) continue;

                const primKey = key || data?.id || data?.empId;

                if (op === 'put' || op === 'add') {
                  const idx = tableArr.findIndex(item => {
                    if (item.id && primKey && item.id === primKey) return true;
                    if (table === 'users' && item.empId === primKey) return true;
                    if (table === 'samplingGroups' && data && item.apptNbr === data.apptNbr && item.poNbr === data.poNbr && item.itemId === data.itemId) return true;
                    if (table === 'purchaseOrders' && data && item.apptNbr === data.apptNbr && item.poNbr === data.poNbr) return true;
                    if (table === 'appointmentVendors' && data && item.apptNbr === data.apptNbr && item.vendorNbr === data.vendorNbr) return true;
                    if (table === 'appointments' && data && item.apptNbr === data.apptNbr) return true;
                    return false;
                  });
                  if (idx >= 0) {
                    tableArr[idx] = { ...tableArr[idx], ...data };
                  } else {
                    tableArr.push(data);
                  }
                } else if (op === 'delete') {
                  const idx = tableArr.findIndex(item => {
                    if (item.id && primKey && item.id === primKey) return true;
                    if (table === 'users' && item.empId === primKey) return true;
                    if (table === 'samplingGroups' && data && item.apptNbr === data.apptNbr && item.poNbr === data.poNbr && item.itemId === data.itemId) return true;
                    if (table === 'purchaseOrders' && data && item.apptNbr === data.apptNbr && item.poNbr === data.poNbr) return true;
                    if (table === 'appointmentVendors' && data && item.apptNbr === data.apptNbr && item.vendorNbr === data.vendorNbr) return true;
                    if (table === 'appointments' && data && item.apptNbr === data.apptNbr) return true;
                    return false;
                  });
                  if (idx >= 0) {
                    tableArr.splice(idx, 1);
                  }
                }
              }

              scheduleSave();
              broadcastEvent('MUTATIONS', { mutations }, clientId);
            }

            sendJson(200, { success: true, count: mutations?.length || 0 });
            return;
          }

          // ─── 4. User Lookup: Query by Employee ID with PIN Status ────
          if (pathname === '/api/users/lookup' && req.method === 'GET') {
            if (!serverDb) serverDb = loadOrCreateInitialState();
            const empId = url.searchParams.get('empId');
            if (!empId) {
              sendJson(400, { success: false, message: 'Missing empId parameter' });
              return;
            }

            const cleanEmpId = empId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            let user = serverDb.users.find(u => (u.empId || '').toUpperCase() === cleanEmpId);

            if (user) {
              sendJson(200, { success: true, user });
            } else {
              sendJson(404, { success: false, message: 'User not found on central server' });
            }
            return;
          }

          // ─── 5. Set / Update PIN: Centralized PIN Setup Across All Devices ─
          if (pathname === '/api/users/set-pin' && req.method === 'POST') {
            if (!serverDb) serverDb = loadOrCreateInitialState();
            const body = await parseBody();
            const { empId, pin, fullName, role, department } = body;

            if (!empId || !pin) {
              sendJson(400, { success: false, message: 'Employee ID and PIN are required' });
              return;
            }

            const cleanEmpId = String(empId).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanPin = String(pin).trim();

            if (cleanPin.length !== 6 || !/^\d{6}$/.test(cleanPin)) {
              sendJson(400, { success: false, message: 'PIN must be exactly 6 digits' });
              return;
            }

            let user = serverDb.users.find(u => (u.empId || '').toUpperCase() === cleanEmpId);
            const now = new Date().toISOString();

            if (user) {
              user.pinHash = cleanPin;
              user.isPinSet = true;
              user.updatedAt = now;
              if (fullName) user.fullName = fullName;
              if (role) user.role = role;
              if (department) user.department = department;
            } else {
              user = {
                id: `user-${cleanEmpId}`,
                username: cleanEmpId,
                empId: cleanEmpId,
                fullName: fullName || cleanEmpId,
                role: role || 'RECEIVE',
                department: department || 'DC Fresh Quality Control',
                email: `${cleanEmpId.toLowerCase()}@lotuss.com`,
                pinHash: cleanPin,
                isPinSet: true,
                isActive: true,
                createdAt: now,
                updatedAt: now,
              };
              serverDb.users.push(user);
            }

            scheduleSave();

            // Broadcast user update to all devices immediately!
            broadcastEvent('MUTATIONS', {
              mutations: [
                { table: 'users', op: 'put', key: user.id, data: user }
              ]
            }, body.clientId);

            sendJson(200, { success: true, user });
            return;
          }

          next();
        } catch (err: any) {
          console.error('[SyncServer] Error processing request', err);
          sendJson(500, { success: false, error: err?.message || 'Internal Server Error' });
        }
      });
    }
  };
}
