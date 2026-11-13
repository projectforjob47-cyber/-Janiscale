// ============================================================
// SMART DC — Client Sync Engine (Supabase Cloud Powered)
// Real-time Multi-Device Synchronization via Supabase Realtime & Postgres
// Seamlessly syncs Admin PC, Worker iPad, and OTM Mobile 24/7 without a local server PC
// ============================================================

import { db } from './database';
import type { User } from '../types';
import { isFrozenJob, isSp1Prepack } from './businessLogic';
import { supabase } from './supabaseClient';

// Unique client ID per session
const CLIENT_ID_KEY = 'smart-dc-client-session-id';
export function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export let isApplyingRemoteSync = false;
let realtimeChannel: any = null;
let syncInitialized = false;

export type SyncStatusType = 'connected' | 'syncing' | 'disconnected';
type StatusListener = (status: SyncStatusType) => void;
const statusListeners = new Set<StatusListener>();

export function onSyncStatusChange(cb: StatusListener): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

function notifyStatus(status: SyncStatusType) {
  for (const cb of statusListeners) {
    try { cb(status); } catch (e) {}
  }
}

interface QueuedMutation {
  table: string;
  op: 'put' | 'delete';
  key: any;
  data?: any;
}

let outgoingQueue: QueuedMutation[] = [];
let flushTimeout: any = null;

export const SYNC_TABLES = [
  'users',
  'appointments',
  'appointmentVendors',
  'purchaseOrders',
  'samplingGroups',
  'measurements',
  'signatureRecords',
  'cnCases',
  'basketMaster',
  'focusMaster',
  'importBatches',
] as const;

export function queueLocalMutation(mutation: QueuedMutation) {
  if (isApplyingRemoteSync) return;

  // Deduplicate in queue by table + key
  const existingIdx = outgoingQueue.findIndex(
    m => m.table === mutation.table && String(m.key) === String(mutation.key)
  );

  if (existingIdx >= 0) {
    outgoingQueue[existingIdx] = mutation;
  } else {
    outgoingQueue.push(mutation);
  }

  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(flushMutationQueue, 80);
}

async function flushMutationQueue() {
  if (outgoingQueue.length === 0) return;
  const toSend = [...outgoingQueue];
  outgoingQueue = [];
  notifyStatus('syncing');

  try {
    const puts: { key: string; data: any; updated_at: string }[] = [];
    const deleteKeys: string[] = [];
    const now = new Date().toISOString();

    for (const m of toSend) {
      const fullKey = `${m.table}:${m.key}`;
      if (m.op === 'put' && m.data) {
        puts.push({
          key: fullKey,
          data: sanitizeSyncData(m.data),
          updated_at: now,
        });
      } else if (m.op === 'delete') {
        deleteKeys.push(fullKey);
      }
    }

    // Execute upserts in batches of 100
    if (puts.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < puts.length; i += CHUNK) {
        const slice = puts.slice(i, i + CHUNK);
        const { error } = await supabase.from('sync_state').upsert(slice);
        if (error) {
          console.warn('[SyncEngine] Supabase upsert error:', error);
          throw error;
        }
      }
    }

    // Execute deletes
    if (deleteKeys.length > 0) {
      const { error } = await supabase.from('sync_state').delete().in('key', deleteKeys);
      if (error) {
        console.warn('[SyncEngine] Supabase delete error:', error);
        throw error;
      }
    }

    setTimeout(() => notifyStatus('connected'), 400);
  } catch (err) {
    console.warn('[SyncEngine] Network error pushing mutations, re-queuing...', err);
    outgoingQueue = [...toSend, ...outgoingQueue];
    notifyStatus('disconnected');
  }
}

// ─── Direct API Helpers for Instant Login & PIN Sync ─────────

export async function lookupServerUser(empId: string): Promise<User | null> {
  const cleanId = empId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('data')
      .eq('key', `users:${cleanId}`)
      .maybeSingle();

    if (!error && data?.data) {
      const user = data.data as User;
      isApplyingRemoteSync = true;
      try {
        await db.users.put(user);
      } finally {
        isApplyingRemoteSync = false;
      }
      return user;
    }
  } catch (e) {
    console.warn('[SyncEngine] Error looking up user from Supabase', e);
  }

  // Fallback to local Dexie
  const local = await db.users.where('empId').equalsIgnoreCase(cleanId).first();
  return local || null;
}

export async function setServerUserPin(
  empId: string,
  pin: string,
  fullName?: string,
  role?: string,
  department?: string
): Promise<{ success: boolean; user?: User; message?: string }> {
  const cleanId = empId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const now = new Date().toISOString();

  try {
    // Check existing or build user
    let user: User | null = await lookupServerUser(cleanId);
    if (!user) {
      user = {
        id: `user-${cleanId}`,
        username: cleanId,
        empId: cleanId,
        fullName: fullName || cleanId,
        role: (role as any) || 'RECEIVE',
        department: department || 'DC Receiving Fresh',
        pinHash: pin,
        isPinSet: true,
        isActive: true,
        createdAt: now,
      };
    } else {
      user = {
        ...user,
        pinHash: pin,
        isPinSet: true,
        fullName: fullName || user.fullName,
        role: (role as any) || user.role,
        department: department || user.department,
        updatedAt: now,
      } as any;
    }

    // Save to Supabase
    const { error } = await supabase.from('sync_state').upsert({
      key: `users:${cleanId}`,
      data: sanitizeSyncData(user),
      updated_at: now,
    });

    if (error) {
      console.warn('[SyncEngine] Error saving PIN to Supabase:', error);
      return { success: false, message: 'ไม่สามารถบันทึกรหัส PIN ลงระบบ Cloud ได้' };
    }

    // Update local Dexie
    isApplyingRemoteSync = true;
    try {
      if (user) {
        await db.users.put(user);
      }
    } finally {
      isApplyingRemoteSync = false;
    }

    return { success: true, user: user || undefined };
  } catch (err: any) {
    console.warn('[SyncEngine] Network error setting user PIN', err);
    return { success: false, message: 'ไม่สามารถเชื่อมต่อระบบ Cloud ได้' };
  }
}

// ─── Initial Full Pull & Cloud Sync ───────────────────────────

export async function pushFullStateToServer(): Promise<boolean> {
  try {
    // Check tombstones in cloud
    const { data: tombstoneRows } = await supabase.from('sync_state').select('key').like('key', 'deletedBatches%');
    const deletedBatchSet = new Set((tombstoneRows || []).map(r => r.key.slice('deletedBatches:'.length)));

    const appointments = (await db.appointments.toArray()).filter(a => !a.importBatchId || !deletedBatchSet.has(a.importBatchId));
    const appointmentVendors = await db.appointmentVendors.toArray();
    const purchaseOrders = await db.purchaseOrders.toArray();
    const samplingGroups = (await db.samplingGroups.toArray()).filter(g => !g.importBatchId || !deletedBatchSet.has(g.importBatchId));
    const measurements = await db.measurements.toArray();
    const signatureRecords = await db.signatureRecords.toArray();
    const cnCases = await db.cnCases.toArray();
    const users = await db.users.toArray();
    const basketMaster = await db.basketMaster.toArray();
    const focusMaster = await db.focusMaster.toArray();
    const importBatches = (await db.importBatches.toArray()).filter(b => !deletedBatchSet.has(b.id));

    const now = new Date().toISOString();
    const rows: { key: string; data: any; updated_at: string }[] = [];

    const addRows = (table: string, items: any[], getKey: (it: any) => string) => {
      for (const it of items) {
        const k = getKey(it);
        if (k) {
          rows.push({
            key: `${table}:${k}`,
            data: sanitizeSyncData(it),
            updated_at: now,
          });
        }
      }
    };

    addRows('appointments', appointments, it => it.id || it.apptNbr);
    addRows('appointmentVendors', appointmentVendors, it => it.id);
    addRows('purchaseOrders', purchaseOrders, it => it.id);
    addRows('samplingGroups', samplingGroups, it => it.id);
    addRows('measurements', measurements, it => it.id);
    addRows('signatureRecords', signatureRecords, it => it.id);
    addRows('cnCases', cnCases, it => it.id);
    addRows('users', users, it => it.id || it.empId);
    addRows('basketMaster', basketMaster, it => it.id || it.code);
    addRows('focusMaster', focusMaster, it => it.id || it.itemId);
    addRows('importBatches', importBatches, it => it.id);

    console.log(`[SyncEngine] Pushing full state to Supabase: ${rows.length} records...`);

    // Ensure stale operational keys from previous days/batches are purged from Supabase
    try {
      const currentOpKeys = new Set(
        rows
          .filter(r =>
            r.key.startsWith('appointments:') ||
            r.key.startsWith('appointmentVendors:') ||
            r.key.startsWith('purchaseOrders:') ||
            r.key.startsWith('samplingGroups:') ||
            r.key.startsWith('importBatches:')
          )
          .map(r => r.key)
      );

      const { data: existingOpRows } = await supabase
        .from('sync_state')
        .select('key')
        .or('key.like.appointments:*,key.like.appointmentVendors:*,key.like.purchaseOrders:*,key.like.samplingGroups:*,key.like.importBatches:*');

      if (existingOpRows && existingOpRows.length > 0) {
        const obsoleteKeys = existingOpRows
          .map((r: any) => r.key)
          .filter((k: string) => !currentOpKeys.has(k));

        if (obsoleteKeys.length > 0) {
          console.log(`[SyncEngine] Purging ${obsoleteKeys.length} obsolete operational keys from Supabase...`);
          const DEL_CHUNK = 100;
          for (let i = 0; i < obsoleteKeys.length; i += DEL_CHUNK) {
            await supabase.from('sync_state').delete().in('key', obsoleteKeys.slice(i, i + DEL_CHUNK));
          }
        }
      }
    } catch (cleanErr) {
      console.warn('[SyncEngine] Obsolete key purge warning:', cleanErr);
    }

    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from('sync_state').upsert(slice);
        if (!error) {
          success = true;
          break;
        }
        console.warn(`[SyncEngine] Chunk push attempt ${attempt + 1} failed, retrying...`, error);
        await new Promise(r => setTimeout(r, 500));
      }
      if (!success) {
        console.error('[SyncEngine] Failed pushing chunk after 3 attempts');
      }
    }

    console.log('[SyncEngine] Full state pushed to Supabase successfully!');
    return true;
  } catch (err) {
    console.warn('[SyncEngine] Failed to push local state to Supabase', err);
    return false;
  }
}

export function sanitizeSyncData(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    if (obj.includes('\uFFFD') || /[\u00ef\u00bf\u00bd]/.test(obj)) {
      let s = obj;
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
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeSyncData);
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const k of Object.keys(obj)) {
      res[k] = sanitizeSyncData(obj[k]);
    }
    return res;
  }
  return obj;
}

export async function initialFullSync(): Promise<void> {
  try {
    notifyStatus('syncing');
    console.log('[SyncEngine] Fetching all state from Supabase...');

    const { data, error } = await supabase.from('sync_state').select('*').limit(10000);
    if (error) {
      console.warn('[SyncEngine] Failed to read from Supabase:', error);
      notifyStatus('disconnected');
      return;
    }

    // 0. Extract deleted batches tombstones
    const deletedBatchSet = new Set<string>();
    for (const row of data || []) {
      if (row.key.startsWith('deletedBatches:')) {
        const bId = row.key.slice('deletedBatches:'.length);
        if (bId) deletedBatchSet.add(bId);
      }
    }

    // Purge any local records that belong to a deleted batch
    if (deletedBatchSet.size > 0) {
      const { deleteImportBatch } = await import('./database');
      const localBatches = await db.importBatches.toArray();
      for (const b of localBatches) {
        if (deletedBatchSet.has(b.id)) {
          console.log(`[SyncEngine] Purging deleted batch locally: ${b.filename} (${b.id})`);
          await deleteImportBatch(b.id, false);
        }
      }
    }

    // Group items by table (excluding deletedBatches and any row belonging to deleted batches)
    const tableGroups: Record<string, any[]> = {};
    for (const row of data || []) {
      const idx = row.key.indexOf(':');
      if (idx === -1) continue;
      const table = row.key.slice(0, idx);
      if (table === 'deletedBatches') continue;
      if (row.data?.importBatchId && deletedBatchSet.has(row.data.importBatchId)) continue;
      if (table === 'importBatches' && deletedBatchSet.has(row.data?.id)) continue;

      if (!tableGroups[table]) tableGroups[table] = [];
      tableGroups[table].push(sanitizeSyncData(row.data));
    }

    // Auto-heal samplingGroups requiredSamples and generate missing appointmentVendors
    const { calculateRequiredSamples } = await import('./businessLogic');
    if (tableGroups['samplingGroups']?.length) {
      const allMeas = tableGroups['measurements'] || [];
      for (const g of tableGroups['samplingGroups']) {
        if (!g.requiredSamples || g.requiredSamples <= 0) {
          const qty = Number(g.confirmedActualQty || g.apptContQty || g.importedRcvdContQty || 1);
          g.requiredSamples = Math.max(1, calculateRequiredSamples(qty));
          g.confirmedActualQty = g.confirmedActualQty ?? qty;
        }
        // Auto-heal completed count and status from actual recorded measurements
        const groupMeasurements = allMeas.filter((m: any) => m.samplingGroupId === g.id && m.isValid !== false);
        if (groupMeasurements.length > 0) {
          g.completedSamples = groupMeasurements.length;
          g.validSamples = groupMeasurements.length;
          if (groupMeasurements.length >= (g.requiredSamples || 1)) {
            if (g.samplingStatus !== 'ผิดเกณฑ์') {
              g.samplingStatus = 'ชั่งครบ';
            }
          }
        }
      }
    }

    // Ensure all vendors from samplingGroups & purchaseOrders exist in appointmentVendors
    const existingVendors = new Set<string>();
    if (!tableGroups['appointmentVendors']) tableGroups['appointmentVendors'] = [];
    tableGroups['appointmentVendors'].forEach((v: any) => {
      if (v.apptNbr && v.vendorNbr) existingVendors.add(`${v.apptNbr}_${v.vendorNbr}`);
    });

    const addVendor = (apptNbr: string, vendorNbr: string, vendorName?: string) => {
      const key = `${apptNbr}_${vendorNbr}`;
      if (!existingVendors.has(key)) {
        existingVendors.add(key);
        tableGroups['appointmentVendors'].push({
          id: `v-${apptNbr}_${vendorNbr}`,
          appointmentId: `appt-${apptNbr}`,
          apptNbr,
          vendorNbr,
          vendorName: vendorName || vendorNbr,
          poCount: 1,
          syncStatus: 'OFFLINE'
        });
      }
    };

    (tableGroups['purchaseOrders'] || []).forEach((p: any) => {
      if (p.apptNbr && p.vendorNbr) addVendor(p.apptNbr, p.vendorNbr);
    });
    (tableGroups['samplingGroups'] || []).forEach((sg: any) => {
      if (sg.apptNbr && sg.vendorNbr) addVendor(sg.apptNbr, sg.vendorNbr, sg.vendorName);
    });

    const cloudApptCount = tableGroups['appointments']?.length || 0;
    const localApptCount = await db.appointments.count();
    const cloudGroupCount = tableGroups['samplingGroups']?.length || 0;
    const localGroupCount = await db.samplingGroups.count();

    // CLOUD IS THE AUTHORITATIVE SINGLE SOURCE OF TRUTH FOR OPERATIONAL DATA,
    // BUT IF LOCAL HAS A NEWER EXCEL IMPORT, LOCAL MUST PREVAIL AND PUSH TO CLOUD.
    isApplyingRemoteSync = true;
    try {
      const localBatches = await db.importBatches.toArray();
      const localLatestUpload = localBatches.reduce((max, b) => (b.uploadedAt > max ? b.uploadedAt : max), '');
      
      const cloudBatches = (tableGroups['importBatches'] || []);
      const cloudLatestUpload = cloudBatches.reduce((max: string, b: any) => (b.uploadedAt > max ? b.uploadedAt : max), '');

      const isLocalNewerOrEqual = localLatestUpload && (!cloudLatestUpload || localLatestUpload >= cloudLatestUpload);
      const isLocalMoreComplete = (localApptCount > cloudApptCount) || (localGroupCount > cloudGroupCount);

      // 1. Sync operational tables
      if ((isLocalNewerOrEqual || isLocalMoreComplete) && localApptCount > 0) {
        console.log(`[SyncEngine] Local has newer/more complete data (local: ${localApptCount} appts, ${localGroupCount} groups vs cloud: ${cloudApptCount} appts, ${cloudGroupCount} groups). Pushing to Cloud...`);
        pushFullStateToServer().catch(console.error);
      } else if (cloudApptCount > 0) {
        await db.transaction('rw', [
          db.appointments,
          db.appointmentVendors,
          db.purchaseOrders,
          db.samplingGroups,
          db.importBatches,
        ], async () => {
          await db.appointments.clear();
          await db.appointmentVendors.clear();
          await db.purchaseOrders.clear();
          await db.samplingGroups.clear();
          await db.importBatches.clear();

          if (tableGroups['appointments']?.length) await db.appointments.bulkPut(tableGroups['appointments']);
          if (tableGroups['appointmentVendors']?.length) await db.appointmentVendors.bulkPut(tableGroups['appointmentVendors']);
          if (tableGroups['purchaseOrders']?.length) await db.purchaseOrders.bulkPut(tableGroups['purchaseOrders']);
          if (tableGroups['samplingGroups']?.length) await db.samplingGroups.bulkPut(tableGroups['samplingGroups']);
          if (tableGroups['importBatches']?.length) await db.importBatches.bulkPut(tableGroups['importBatches']);
        });
      } else if (localApptCount > 0) {
        // If Cloud has 0 appointments and Local has appointments, push local state to Cloud
        pushFullStateToServer().catch(console.error);
      }

      // 2. Transactional tables: measurements, signatureRecords, cnCases
      for (const table of ['measurements', 'signatureRecords', 'cnCases'] as const) {
        const items = tableGroups[table];
        const tableRef = db.table(table);
        if (Array.isArray(items)) {
          await tableRef.clear();
          if (items.length > 0) {
            await tableRef.bulkPut(items);
          }
        }
      }

      // 3. Master tables: users, basketMaster, focusMaster
      for (const table of ['users', 'basketMaster', 'focusMaster'] as const) {
        const items = tableGroups[table];
        if (Array.isArray(items) && items.length > 0) {
          const tableRef = db.table(table);
          await tableRef.bulkPut(items);
          if (table === 'basketMaster') {
            const { deduplicateBasketMaster } = await import('./database');
            await deduplicateBasketMaster();
          }
        }
      }

      // 4. Purge any FZ / SP1 prepack items from sampling groups
      const localGroups = await db.samplingGroups.toArray();
      const toDelete = localGroups.filter(g => isFrozenJob(g.uda7, g.ups) || isSp1Prepack(g.description));
      if (toDelete.length > 0) {
        await db.samplingGroups.bulkDelete(toDelete.map(g => g.id));
        const allAppts = await db.appointments.toArray();
        for (const appt of allAppts) {
          const remaining = await db.samplingGroups.where('apptNbr').equals(appt.apptNbr).count();
          await db.appointments.update(appt.id, {
            catchWeightSkuCount: remaining,
            totalSamplingGroups: remaining,
          });
        }
      }

      console.log('[SyncEngine] Full sync from Supabase completed successfully.');
      notifyStatus('connected');
    } finally {
      isApplyingRemoteSync = false;
    }
  } catch (err) {
    console.warn('[SyncEngine] Error in initialFullSync', err);
    notifyStatus('disconnected');
  }
}

function startSupabaseListener(): void {
  if (realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch (e) {}
  }

  try {
    console.log('[SyncEngine] Subscribing to Supabase Realtime channel...');
    realtimeChannel = supabase
      .channel('smart-dc-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_state' },
        async (payload: any) => {
          try {
            const eventType = payload.eventType;

            if (eventType === 'DELETE') {
              const oldKey = payload.old?.key;
              if (oldKey) {
                const idx = oldKey.indexOf(':');
                if (idx !== -1) {
                  const table = oldKey.slice(0, idx);
                  const primKey = oldKey.slice(idx + 1);
                  const tableRef = (db as any)[table];
                  if (tableRef) {
                    isApplyingRemoteSync = true;
                    try {
                      await tableRef.delete(primKey);
                    } finally {
                      isApplyingRemoteSync = false;
                    }
                  }
                }
              }
              return;
            }

            // INSERT or UPDATE
            const newRow = payload.new;
            if (!newRow || !newRow.key || !newRow.data) return;

            const idx = newRow.key.indexOf(':');
            if (idx === -1) return;
            const table = newRow.key.slice(0, idx);
            const tableRef = (db as any)[table];
            if (!tableRef) return;

            isApplyingRemoteSync = true;
            notifyStatus('syncing');
            try {
              await tableRef.put(sanitizeSyncData(newRow.data));
            } finally {
              isApplyingRemoteSync = false;
              setTimeout(() => notifyStatus('connected'), 400);
            }
          } catch (err) {
            console.error('[SyncEngine] Realtime payload processing error:', err);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SyncEngine] Supabase Realtime SUBSCRIBED successfully!');
          notifyStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[SyncEngine] Supabase Realtime status:', status);
          notifyStatus('disconnected');
        }
      });
  } catch (err) {
    console.warn('[SyncEngine] Failed to start Supabase listener', err);
  }
}

// ─── Attach Native Dexie Table Hooks ──────────────────────────

function attachDexieHooks(): void {
  for (const tableName of SYNC_TABLES) {
    const table = db.table(tableName);
    if (!table || !table.hook) continue;

    table.hook('creating', function (primKey, obj) {
      if (isApplyingRemoteSync) return;
      this.onsuccess = (finalKey) => {
        const keyToUse = finalKey || primKey;
        const dataToSave = { ...obj };
        if (keyToUse && typeof dataToSave === 'object') {
          (dataToSave as any).id = (dataToSave as any).id || keyToUse;
        }
        queueLocalMutation({
          table: tableName,
          op: 'put',
          key: keyToUse,
          data: dataToSave,
        });
      };
    });

    table.hook('updating', function (modifications, primKey, obj) {
      if (isApplyingRemoteSync) return;
      this.onsuccess = (updatedObj) => {
        const dataToSave = updatedObj || { ...obj, ...modifications };
        queueLocalMutation({
          table: tableName,
          op: 'put',
          key: primKey,
          data: dataToSave,
        });
      };
    });

    table.hook('deleting', function (primKey) {
      if (isApplyingRemoteSync) return;
      this.onsuccess = () => {
        queueLocalMutation({
          table: tableName,
          op: 'delete',
          key: primKey,
        });
      };
    });
  }
}

// ─── Main Entry Point ─────────────────────────────────────────

export async function initSyncEngine(): Promise<void> {
  if (syncInitialized) return;
  syncInitialized = true;

  console.log('[SyncEngine] Initializing Supabase cloud real-time sync...');
  attachDexieHooks();
  await initialFullSync();
  startSupabaseListener();

  // Periodic polling & Window Focus sync (ensures Mobile is always 100% in sync with Desktop even if mobile browser suspends WebSockets)
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      initialFullSync().catch(() => {});
    });
    // Poll every 15 seconds
    setInterval(() => {
      initialFullSync().catch(() => {});
    }, 15000);
  }
}
