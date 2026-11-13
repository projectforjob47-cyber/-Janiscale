// ============================================================
// SMART DC — IndexedDB Database (Dexie.js)
// Offline-first storage for all entities
// ============================================================

import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type {
  User,
  ImportBatch,
  ExcelRow,
  Appointment,
  AppointmentVendor,
  PurchaseOrder,
  SamplingGroup,
  Measurement,
  PhotoEvidence,
  WeightSummary,
  SignatureRecord,
  ApprovalSnapshot,
  CNCase,
  DeliveryException,
  AuditLog,
  BasketMasterItem,
  FocusMasterItem,
  ItemMasterItem,
  UserRole,
} from '../types';
import { DEFAULT_BASKET_MASTER } from '../types';
import { parseStandardWeight, isSamplingCatchWeight, isFrozenJob, isSp1Prepack, calculateRequiredSamples } from './businessLogic';
import seedRows from './seedData.json';
import authorizedRoster from './authorizedRoster.json';
import initialItemMaster from './itemMasterData.json';
import { extractDateFromApptTime } from './dateUtils';

export class SmartDCDatabase extends Dexie {
  users!: Table<User>;
  importBatches!: Table<ImportBatch>;
  excelRows!: Table<ExcelRow & { id: string }>;
  appointments!: Table<Appointment>;
  appointmentVendors!: Table<AppointmentVendor>;
  purchaseOrders!: Table<PurchaseOrder>;
  samplingGroups!: Table<SamplingGroup>;
  measurements!: Table<Measurement>;
  photoEvidence!: Table<PhotoEvidence>;
  weightSummaries!: Table<WeightSummary & { id: string }>;
  signatureRecords!: Table<SignatureRecord>;
  approvalSnapshots!: Table<ApprovalSnapshot>;
  cnCases!: Table<CNCase>;
  deliveryExceptions!: Table<DeliveryException>;
  auditLogs!: Table<AuditLog>;
  basketMaster!: Table<BasketMasterItem>;
  focusMaster!: Table<FocusMasterItem>;
  itemMaster!: Table<ItemMasterItem>;

  constructor() {
    super('SmartDCDatabase');

    this.version(2).stores({
      users: 'id, username, empId, role, isActive',
      importBatches: 'id, uploadedAt, receiveDate, uploadedBy',
      excelRows: 'id, importBatchId, apptNbr, poNbr, itemId, itemClass, vendorNbr, carrierCode',
      appointments: 'id, apptNbr, importBatchId, receiveDate, carrierCode',
      appointmentVendors: 'id, appointmentId, apptNbr, vendorNbr',
      purchaseOrders: 'id, appointmentId, vendorId, apptNbr, poNbr, vendorNbr',
      samplingGroups: 'id, importBatchId, appointmentId, apptNbr, poNbr, itemId, vendorNbr, samplingStatus, focusStatus, workflowStatus, cnStatus, deliveryStatus, syncStatus',
      measurements: 'id, samplingGroupId, sampleNumber, recordedAt, syncStatus',
      photoEvidence: 'id, measurementId, samplingGroupId, syncStatus',
      weightSummaries: 'id, samplingGroupId, result, calculatedAt',
      signatureRecords: 'id, samplingGroupId, signerRole, approvalVersion, signedAt, syncStatus',
      approvalSnapshots: 'id, samplingGroupId, version, snapshotAt',
      cnCases: 'id, samplingGroupId, apptNbr, poNbr, itemId, cnStatus',
      deliveryExceptions: 'id, samplingGroupId, appointmentId, apptNbr, poNbr, status, syncStatus',
      auditLogs: 'id, entityType, entityId, action, performedAt, syncStatus',
      basketMaster: 'id, code, isActive',
      focusMaster: 'id, weekNumber, itemId, poNbr, isActive',
    });

    this.version(3).stores({
      users: 'id, username, empId, role, isActive',
      importBatches: 'id, uploadedAt, receiveDate, uploadedBy',
      excelRows: 'id, importBatchId, apptNbr, poNbr, itemId, itemClass, vendorNbr, carrierCode',
      appointments: 'id, apptNbr, importBatchId, receiveDate, carrierCode',
      appointmentVendors: 'id, appointmentId, apptNbr, vendorNbr',
      purchaseOrders: 'id, appointmentId, vendorId, apptNbr, poNbr, vendorNbr',
      samplingGroups: 'id, importBatchId, appointmentId, apptNbr, poNbr, itemId, vendorNbr, samplingStatus, focusStatus, workflowStatus, cnStatus, deliveryStatus, syncStatus',
      measurements: 'id, samplingGroupId, sampleNumber, recordedAt, syncStatus',
      photoEvidence: 'id, measurementId, samplingGroupId, syncStatus',
      weightSummaries: 'id, samplingGroupId, result, calculatedAt',
      signatureRecords: 'id, samplingGroupId, signerRole, approvalVersion, signedAt, syncStatus',
      approvalSnapshots: 'id, samplingGroupId, version, snapshotAt',
      cnCases: 'id, samplingGroupId, apptNbr, poNbr, itemId, cnStatus',
      deliveryExceptions: 'id, samplingGroupId, appointmentId, apptNbr, poNbr, status, syncStatus',
      auditLogs: 'id, entityType, entityId, action, performedAt, syncStatus',
      basketMaster: 'id, code, isActive',
      focusMaster: 'id, weekNumber, itemId, poNbr, isActive',
      itemMaster: 'id, itemId, description, updatedAt',
    });

    this.version(4).stores({
      signatureRecords: 'id, samplingGroupId, apptNbr, signerRole, approvalVersion, signedAt, syncStatus',
      measurements: 'id, samplingGroupId, apptNbr, sampleNumber, recordedAt, syncStatus',
    });
  }
}

export const db = new SmartDCDatabase();

export const INITIAL_FOCUS_MASTER: Omit<FocusMasterItem, 'id'>[] = [
  { itemId: '163989158', description: 'คางปลาหมึกยักษ์', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '169229461', description: 'SP20_หางปลาหมึกยักษ์ กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '169484704', description: 'SP15_แก้วมังกร กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '169187250', description: 'ปีกปลาหมึกยักษ์', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '163114744', description: 'SP20_หนวดปลาหมึกยักษ์ กก. ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '164413354', description: 'SP15_ส้มสายน้ำผึ้ง กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '170007636', description: 'SP9_ส้มแมนดาริน สายพันธุ์ไต้หวัน กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '164656437', description: 'SP10_สันนอกหมูกก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '170029420', description: 'SP4_สันนอกหมูสไลด์ กก. ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '150811983', description: 'SP12_อกไก่แช่แข็ง กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '169088177', description: 'SP15_ลำไยอีด้อ กก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
  { itemId: '169045516', description: 'SP8_สันคอหมูกก.ละ', status: 'Check 992', isActive: true, uploadedAt: new Date().toISOString() },
];

export async function syncSamplingGroupsWithFocusMaster(): Promise<number> {
  const allFocus = await db.focusMaster.toArray();
  const activeFocus = allFocus.filter(f => Boolean(f.isActive));
  const focusItemIds = new Set(activeFocus.map(f => String(f.itemId).trim()));
  
  let updatedCount = 0;
  await db.samplingGroups.toCollection().modify((group) => {
    const shouldBeFocus = focusItemIds.has(String(group.itemId).trim());
    const newStatus = shouldBeFocus ? 'FOCUS' : 'NON_FOCUS';
    if (group.focusStatus !== newStatus) {
      group.focusStatus = newStatus;
      group.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  });
  return updatedCount;
}

// ─────────────────────────────────────────────────────────────
// DEDUPLICATE BASKET MASTER (Ensures exactly 1 record per container code)
// ─────────────────────────────────────────────────────────────
export async function deduplicateBasketMaster(): Promise<number> {
  try {
    const allBaskets = await db.basketMaster.toArray();
    const byCode = new Map<string, BasketMasterItem[]>();

    for (const b of allBaskets) {
      const code = (b.code || '').trim().toUpperCase();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, []);
      }
      byCode.get(code)!.push(b);
    }

    const idsToDelete: string[] = [];
    const itemsToSave: BasketMasterItem[] = [];

    for (const [code, list] of byCode.entries()) {
      // Prioritize active item and latest updated
      list.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });

      const canonical = list[0];
      const canonicalId = `basket-${code}`;
      const cleanCanonical: BasketMasterItem = {
        ...canonical,
        id: canonicalId,
        code: code,
        name: canonical.name || `ตะกร้า ${code}`,
        tareWeightKg: canonical.tareWeightKg,
        isActive: canonical.isActive ?? true,
        updatedAt: canonical.updatedAt || new Date().toISOString(),
      };
      itemsToSave.push(cleanCanonical);

      // Mark all other duplicates for deletion
      for (const item of list) {
        if (item.id !== canonicalId) {
          idsToDelete.push(item.id);
        }
      }
    }

    if (idsToDelete.length > 0) {
      await db.basketMaster.bulkDelete(idsToDelete);
    }
    if (itemsToSave.length > 0) {
      await db.basketMaster.bulkPut(itemsToSave);
    }

    // Realtime Supabase purge of duplicate keys & update canonical
    try {
      const { supabase } = await import('./supabaseClient');
      if (idsToDelete.length > 0) {
        const keysToDelete = idsToDelete.map(id => `basketMaster:${id}`);
        await supabase.from('sync_state').delete().in('key', keysToDelete);
      }
      if (itemsToSave.length > 0) {
        const cloudPayload = itemsToSave.map(b => ({
          key: `basketMaster:${b.id}`,
          data: b,
          updated_at: b.updatedAt,
        }));
        await supabase.from('sync_state').upsert(cloudPayload);
      }
    } catch (cloudErr) {
      console.warn('[DeduplicateBasketMaster] Supabase cleanup warning:', cloudErr);
    }

    return idsToDelete.length;
  } catch (error) {
    console.error('deduplicateBasketMaster error:', error);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// USER DEDUPLICATION REPAIR
// Ensures each user (Admin or Employee) exists exactly once in Dexie & Supabase
// ─────────────────────────────────────────────────────────────
export async function deduplicateUsers(): Promise<number> {
  try {
    const allUsers = await db.users.toArray();
    const seenMap = new Map<string, User>();
    const toDeleteIds: string[] = [];

    for (const u of allUsers) {
      const email = (u.email || '').trim().toLowerCase();
      const username = (u.username || '').trim().toLowerCase();
      const empId = (u.empId || '').trim().toUpperCase();

      let key = '';
      if (email.includes('projectforjob47') || username.includes('projectforjob47')) {
        key = 'admin-projectforjob47@gmail.com';
      } else if (email) {
        key = `email:${email}`;
      } else if (empId) {
        key = `emp:${empId}`;
      } else if (username) {
        key = `user:${username}`;
      } else {
        key = u.id;
      }

      if (!seenMap.has(key)) {
        seenMap.set(key, u);
      } else {
        const prev = seenMap.get(key)!;
        // Keep the one with PIN set or preferred canonical id
        if ((!prev.isPinSet && u.isPinSet) || (prev.id.length > 30 && !u.id.includes('-') && u.id.startsWith('admin-'))) {
          toDeleteIds.push(prev.id);
          seenMap.set(key, u);
        } else {
          toDeleteIds.push(u.id);
        }
      }
    }

    if (toDeleteIds.length > 0) {
      await db.users.bulkDelete(toDeleteIds);
      console.log(`[DeduplicateUsers] Removed ${toDeleteIds.length} duplicate user records from local Dexie.`);
    }

    return toDeleteIds.length;
  } catch (err) {
    console.warn('[DeduplicateUsers] Error deduplicating users:', err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// APPOINTMENT DATE & TIME ALIGNMENT AND REPAIR
// Ensures all appointments in Dexie reflect authoritative time & carrierCode
// ─────────────────────────────────────────────────────────────
export async function repairAppointmentsAndTimes(): Promise<void> {
  try {
    const seedMap = new Map<string, { apptTime: string; carrierCode: string; vendorName: string; vendorNbr: string }>();
    for (const r of seedRows as any[]) {
      if (r.apptNbr && !seedMap.has(r.apptNbr)) {
        seedMap.set(r.apptNbr, {
          apptTime: r.apptTime || '12-10-2026_01:00:00',
          carrierCode: r.carrierCode || 'VN',
          vendorName: r.vendorName || '',
          vendorNbr: r.vendorNbr || '',
        });
      }
    }

    const appts = await db.appointments.toArray();
    const apptMap = new Map(appts.map(a => [a.apptNbr, a]));

    // 1. Repair missing apptTime / carrierCode on existing appointments
    for (const appt of appts) {
      const seed = seedMap.get(appt.apptNbr);
      const updates: Partial<Appointment> = {};
      if (!appt.apptTime && seed?.apptTime) {
        updates.apptTime = seed.apptTime;
      }
      if ((!appt.carrierCode || appt.carrierCode === '-') && (seed?.carrierCode || 'VN')) {
        updates.carrierCode = seed?.carrierCode || 'VN';
      }
      const effectiveTime = updates.apptTime || appt.apptTime;
      if (effectiveTime) {
        const fileDate = extractDateFromApptTime(effectiveTime);
        if (fileDate && fileDate !== appt.receiveDate) {
          updates.receiveDate = fileDate;
        }
      }
      if (Object.keys(updates).length > 0) {
        await db.appointments.update(appt.id, updates);
      }
    }

    // 2. Ensure any samplingGroups with missing appointment in db.appointments gets an appointment record
    const groups = await db.samplingGroups.toArray();
    const distinctApptNbrs = Array.from(new Set(groups.map(g => g.apptNbr).filter(Boolean)));
    const now = new Date().toISOString();

    for (const apptNbr of distinctApptNbrs) {
      if (!apptMap.has(apptNbr)) {
        const seed = seedMap.get(apptNbr);
        const groupSample = groups.find(g => g.apptNbr === apptNbr);
        const apptTime = seed?.apptTime || '08:00';
        const fileDate = extractDateFromApptTime(apptTime) || new Date().toISOString().split('T')[0];
        const newAppt: Appointment = {
          id: `appt-${apptNbr}`,
          importBatchId: groupSample?.importBatchId || 'initial-batch',
          apptNbr,
          apptTime,
          apptStatus: 'CONFIRMED',
          carrierCode: groupSample?.carrierCode || seed?.carrierCode || 'VN',
          receiveDate: fileDate,
          vendorCount: 1,
          poCount: 1,
          catchWeightSkuCount: groups.filter(g => g.apptNbr === apptNbr).length,
          totalSamplingGroups: groups.filter(g => g.apptNbr === apptNbr).length,
          completedGroups: 0,
          failedGroups: 0,
          pendingOtmGroups: 0,
          deliveryExceptionGroups: 0,
          syncStatus: 'SYNCED',
          createdAt: now,
          updatedAt: now,
        };
        await db.appointments.put(newAppt);
        apptMap.set(apptNbr, newAppt);
      }
    }
  } catch (err) {
    console.warn('[Database] repairAppointmentsAndTimes error:', err);
  }
}

export async function alignAppointmentDatesWithExcel(): Promise<number> {
  try {
    await repairAppointmentsAndTimes();
    const appts = await db.appointments.toArray();
    let updated = 0;
    for (const appt of appts) {
      if (appt.apptTime) {
        const fileDate = extractDateFromApptTime(appt.apptTime);
        if (fileDate && fileDate !== appt.receiveDate) {
          await db.appointments.update(appt.id, { receiveDate: fileDate });
          updated++;
        }
      }
    }
    if (updated > 0) {
      console.log(`[Database] Auto-aligned ${updated} appointment dates to match Excel file date.`);
    }
    return updated;
  } catch (error) {
    console.warn('alignAppointmentDatesWithExcel error:', error);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// REPAIR SAMPLING GROUPS: Auto-fix missing or zero requiredSamples
// ─────────────────────────────────────────────────────────────
export async function repairSamplingGroupsRequiredSamples(): Promise<number> {
  try {
    let repairedCount = 0;
    const allGroups = await db.samplingGroups.toArray();
    for (const g of allGroups) {
      if (!g.requiredSamples || g.requiredSamples <= 0) {
        const qty = g.confirmedActualQty || g.apptContQty || g.importedRcvdContQty || 1;
        const fixedReq = Math.max(1, calculateRequiredSamples(qty));
        await db.samplingGroups.update(g.id, {
          requiredSamples: fixedReq,
          confirmedActualQty: g.confirmedActualQty ?? qty,
          updatedAt: new Date().toISOString(),
        });
        repairedCount++;
      }
    }
    if (repairedCount > 0) {
      console.log(`[Database] Auto-repaired ${repairedCount} sampling groups with missing/zero requiredSamples`);
    }
    return repairedCount;
  } catch (err) {
    console.warn('[Database] repairSamplingGroupsRequiredSamples error:', err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// INITIALIZATION — seed Basket Master, Users, and Sample CW Appointments
// ─────────────────────────────────────────────────────────────
export async function initializeDatabase(): Promise<void> {
  const now = new Date().toISOString();

  // 0. Auto-align any existing appointment dates to match their Excel file date
  await alignAppointmentDatesWithExcel();

  // 0.1 Auto-repair any sampling groups that have missing or zero requiredSamples
  await repairSamplingGroupsRequiredSamples();

  // 1. Basket Master: Ensure canonical default baskets exist and are deduplicated
  await deduplicateBasketMaster();
  const existingBaskets = await db.basketMaster.toArray();
  const existingCodeMap = new Map(existingBaskets.map(b => [b.code.toUpperCase(), b]));

  for (const def of DEFAULT_BASKET_MASTER) {
    const code = def.code.toUpperCase();
    const existing = existingCodeMap.get(code);
    if (!existing) {
      const newB: BasketMasterItem = {
        ...def,
        id: `basket-${code}`,
        code,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'SYSTEM',
      };
      await db.basketMaster.put(newB);
    }
  }
  await deduplicateBasketMaster();

  // 2. Default Users from 33-person authorized roster + Admin
  const adminId = 'admin-projectforjob47';
  const adminExists = await db.users.where('username').equals('projectforjob47@gmail.com').first() ||
                      await db.users.where('email').equals('projectforjob47@gmail.com').first();
  if (!adminExists) {
    await db.users.put({
      id: adminId,
      username: 'projectforjob47@gmail.com',
      empId: 'ADMIN01',
      fullName: 'System Administrator (projectforjob47@gmail.com)',
      role: 'ADMIN',
      email: 'projectforjob47@gmail.com',
      pinHash: 'Forwork2547',
      isPinSet: true,
      isActive: true,
      createdAt: now,
    });
  }

  const guideExists = await db.users.where('username').equals('guidelump@gmail.com').first() ||
                      await db.users.where('email').equals('guidelump@gmail.com').first();
  if (!guideExists) {
    await db.users.put({
      id: 'admin-guidelump',
      username: 'guidelump@gmail.com',
      empId: 'ADM_GUIDELUMP',
      fullName: 'System Administrator (guidelump@gmail.com)',
      role: 'ADMIN',
      email: 'guidelump@gmail.com',
      pinHash: 'Forwork2547',
      isPinSet: true,
      isActive: true,
      createdAt: now,
    });
  }

  // Deduplicate any repeated user records (e.g. from historical random UUID seeds)
  await deduplicateUsers();

  // Ensure all roster users exist in db.users & sync roles with Department
  const existingUsers = await db.users.toArray();
  const existingEmpIds = new Set(existingUsers.map(u => (u.empId || '').toUpperCase()));
  const newUsersToSeed: User[] = [];

  for (const r of authorizedRoster) {
    const cleanId = r.empId.toUpperCase();
    if (!existingEmpIds.has(cleanId)) {
      newUsersToSeed.push({
        id: `user-${r.empId}`,
        username: r.empId,
        empId: r.empId,
        fullName: r.fullName,
        role: r.role as UserRole,
        department: r.department,
        email: r.email,
        pinHash: '',
        isPinSet: false,
        isActive: true,
        createdAt: now,
      });
      existingEmpIds.add(cleanId);
    }
  }

  if (newUsersToSeed.length > 0) {
    await db.users.bulkAdd(newUsersToSeed);
  }

  // Requirement 5: Auto-sync OTM privileges based on Department 'DC Operation Team Manager'
  const rosterMap = new Map(authorizedRoster.map(r => [r.empId.toUpperCase(), r]));
  await db.users.toCollection().modify((u) => {
    if (u.empId && u.role !== 'ADMIN') {
      const r = rosterMap.get(u.empId.toUpperCase());
      if (r) {
        u.fullName = r.fullName;
        u.department = r.department;
        const isOtm = r.department === 'DC Operation Team Manager';
        u.role = isOtm ? 'OTM' : (r.department.includes('S&LP') ? 'LPS' : 'RECEIVE');
      }
    }
  });

  // 3. Focus Master initial seed
  const focusCount = await db.focusMaster.count();
  if (focusCount === 0) {
    const focusItems: FocusMasterItem[] = INITIAL_FOCUS_MASTER.map(item => ({
      ...item,
      id: uuidv4(),
    }));
    await db.focusMaster.bulkAdd(focusItems);
  }

  // 3. In production, real appointments and groups come exclusively from user Excel imports or Cloud Sync.
  // We strictly NEVER inject mock/seed demo records into empty databases.
  await purgeSeedData();

  // Always ensure sampling groups match active Focus Master and Item Master
  await syncSamplingGroupsWithFocusMaster();
  await syncSamplingGroupsWithItemMaster();

  // 4. Ensure Frozen (FZ21 / FZ) and SP1 prepack items are never kept in sampling groups
  const allGroups = await db.samplingGroups.toArray();
  const toDelete = allGroups.filter(g => isFrozenJob(g.uda7, g.ups) || isSp1Prepack(g.description));
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

  // 5. Auto-cleanup leftover demo data (do not auto-advance old appointments to today)
  await purgeSeedData();

  // 7. Auto-normalize any groups that were merely opened to view (completedSamples === 0) back to 'รอชั่ง'
  await db.samplingGroups
    .filter(g => (!g.completedSamples || g.completedSamples === 0) && (g.workflowStatus === 'SAMPLING' || g.samplingStatus !== 'รอชั่ง'))
    .modify({
      workflowStatus: 'PENDING_QTY_CONFIRM',
      samplingStatus: 'รอชั่ง',
    });
}

export async function syncSamplingGroupsWithItemMaster(): Promise<{ updatedGroups: number; registeredNewItems: number }> {
  const now = new Date().toISOString();
  
  // 1. Ensure initialItemMaster is loaded in db.itemMaster
  const currentCount = await db.itemMaster.count();
  if (currentCount === 0) {
    const items: ItemMasterItem[] = initialItemMaster.map((item: any) => {
      const sp = parseStandardWeight(item.description);
      return {
        id: `master-${item.itemId}`,
        itemId: String(item.itemId).trim(),
        description: item.description,
        spExpression: sp.expression,
        standardWeightKg: sp.standardWeightKg,
        source: 'INITIAL_MASTER',
        createdAt: now,
        updatedAt: now,
      };
    });
    await db.itemMaster.bulkAdd(items);
  }

  // 2. Build in-memory map of master items
  const allMaster = await db.itemMaster.toArray();
  const masterMap = new Map<string, ItemMasterItem>(allMaster.map(m => [String(m.itemId).trim(), m]));

  let updatedGroups = 0;
  let registeredNewItems = 0;

  // Build map of UDA6 from seedRows
  const seedUda6Map = new Map<string, string>();
  for (const s of (seedRows as any[])) {
    if (s.uda6) {
      seedUda6Map.set(`${s.apptNbr}_${s.poNbr}_${s.itemId}`, s.uda6);
      if (!seedUda6Map.has(String(s.itemId).trim())) {
        seedUda6Map.set(String(s.itemId).trim(), s.uda6);
      }
    }
  }

  // 3. Update existing sampling groups with full master description and UDA6
  await db.samplingGroups.toCollection().modify((group) => {
    let modified = false;
    const trimmedId = String(group.itemId).trim();
    const master = masterMap.get(trimmedId);
    if (master && master.description && group.description !== master.description) {
      group.description = master.description;
      const spResult = parseStandardWeight(master.description);
      group.spExpression = spResult.expression;
      if (spResult.standardWeightKg !== null) {
        group.standardWeightKg = spResult.standardWeightKg;
      }
      group.spParserStatus = spResult.status;
      modified = true;
    }

    // Sync UDA6 container code
    const gKey = `${group.apptNbr}_${group.poNbr}_${group.itemId}`;
    const mappedUda6 = seedUda6Map.get(gKey) || seedUda6Map.get(trimmedId);
    if (mappedUda6 && (!group.uda6 || group.uda6 !== mappedUda6)) {
      group.uda6 = mappedUda6;
      if (!group.defaultBasketCode || ['W', 'F', 'XN', 'YN', 'ZN'].includes(group.defaultBasketCode)) {
        group.defaultBasketCode = mappedUda6;
      }
      modified = true;
    }

    if (modified) {
      group.updatedAt = new Date().toISOString();
      updatedGroups++;
    }
  });

  // 4. Register any unknown items from sampling groups into itemMaster so they are retained
  const currentGroups = await db.samplingGroups.toArray();
  const newItemsToAdd: ItemMasterItem[] = [];
  for (const group of currentGroups) {
    const trimmedId = String(group.itemId).trim();
    if (!masterMap.has(trimmedId) && group.description) {
      const sp = parseStandardWeight(group.description);
      const newItem: ItemMasterItem = {
        id: `master-${trimmedId}`,
        itemId: trimmedId,
        description: group.description,
        spExpression: sp.expression,
        standardWeightKg: sp.standardWeightKg,
        source: 'EXCEL_IMPORT',
        createdAt: now,
        updatedAt: now,
      };
      newItemsToAdd.push(newItem);
      masterMap.set(trimmedId, newItem);
      registeredNewItems++;
    }
  }

  if (newItemsToAdd.length > 0) {
    await db.itemMaster.bulkAdd(newItemsToAdd);
  }

  // 5. Clean any old demo CN cases
  await db.cnCases.where('id').anyOf(['CN-DEMO-001', 'CN-DEMO-002']).delete();

  return { updatedGroups, registeredNewItems };
}

// ============================================================
// ADMIN BATCH MANAGEMENT & DEDUPLICATION UTILITIES
// Allows Admin to remove old files, replace days, and clean duplicates
// ============================================================

export async function deleteImportBatch(
  batchId: string,
  syncCloud: boolean = true
): Promise<{ deletedAppts: number; deletedGroups: number }> {
  const batch = await db.importBatches.get(batchId);
  const appts = await db.appointments.where('importBatchId').equals(batchId).toArray();
  const apptNbrs = appts.map(a => a.apptNbr);
  
  // Also collect groups matching this batchId or matching apptNbrs if batch was mixed
  let groups = await db.samplingGroups.where('importBatchId').equals(batchId).toArray();
  if (groups.length === 0 && apptNbrs.length > 0) {
    groups = await db.samplingGroups.where('apptNbr').anyOf(apptNbrs).toArray();
  }
  const groupIds = groups.map(g => g.id);

  const pos = apptNbrs.length > 0 ? await db.purchaseOrders.where('apptNbr').anyOf(apptNbrs).toArray() : [];
  const vendors = apptNbrs.length > 0 ? await db.appointmentVendors.where('apptNbr').anyOf(apptNbrs).toArray() : [];
  const measurements = groupIds.length > 0 ? await db.measurements.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const photoEvidences = groupIds.length > 0 ? await db.photoEvidence.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const summaries = groupIds.length > 0 ? await db.weightSummaries.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const signatures = groupIds.length > 0 ? await db.signatureRecords.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const approvals = groupIds.length > 0 ? await db.approvalSnapshots.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const cnCases = groupIds.length > 0 ? await db.cnCases.where('samplingGroupId').anyOf(groupIds).toArray() : [];
  const exceptions = groupIds.length > 0 ? await db.deliveryExceptions.where('samplingGroupId').anyOf(groupIds).toArray() : [];

  await db.transaction('rw', [
    db.importBatches,
    db.excelRows,
    db.appointments,
    db.appointmentVendors,
    db.purchaseOrders,
    db.samplingGroups,
    db.measurements,
    db.photoEvidence,
    db.weightSummaries,
    db.signatureRecords,
    db.approvalSnapshots,
    db.cnCases,
    db.deliveryExceptions,
  ], async () => {
    // 1. Delete measurement details & evidence for these groups
    if (groupIds.length > 0) {
      await db.measurements.where('samplingGroupId').anyOf(groupIds).delete();
      await db.photoEvidence.where('samplingGroupId').anyOf(groupIds).delete();
      await db.weightSummaries.where('samplingGroupId').anyOf(groupIds).delete();
      await db.signatureRecords.where('samplingGroupId').anyOf(groupIds).delete();
      await db.approvalSnapshots.where('samplingGroupId').anyOf(groupIds).delete();
      await db.cnCases.where('samplingGroupId').anyOf(groupIds).delete();
      await db.deliveryExceptions.where('samplingGroupId').anyOf(groupIds).delete();
      await db.samplingGroups.where('id').anyOf(groupIds).delete();
    }

    // 2. Delete POs and Vendors for these appointments
    if (apptNbrs.length > 0) {
      await db.purchaseOrders.where('apptNbr').anyOf(apptNbrs).delete();
      await db.appointmentVendors.where('apptNbr').anyOf(apptNbrs).delete();
    }

    // 3. Delete Appointments, Excel Rows, and the Batch
    const apptIds = appts.map(a => a.id);
    if (apptIds.length > 0) {
      await db.appointments.where('id').anyOf(apptIds).delete();
    }
    await db.excelRows.where('importBatchId').equals(batchId).delete();
    await db.importBatches.delete(batchId);
  });

  // 4. CRITICAL: Delete from Supabase cloud sync_state and register tombstone
  if (syncCloud) {
    try {
      const { supabase } = await import('./supabaseClient');
      if (supabase) {
        const now = new Date().toISOString();
        // Record tombstone so all connected devices purge this batch permanently
        await supabase.from('sync_state').upsert({
          key: `deletedBatches:${batchId}`,
          data: {
            id: batchId,
            filename: batch?.filename || 'Unknown',
            deletedAt: now,
          },
          updated_at: now,
        });

        const keysToDelete: string[] = [
          `importBatches:${batchId}`,
          ...appts.map(a => `appointments:${a.id}`),
          ...appts.map(a => `appointments:${a.apptNbr}`),
          ...groups.map(g => `samplingGroups:${g.id}`),
          ...pos.map(p => `purchaseOrders:${p.id}`),
          ...vendors.map(v => `appointmentVendors:${v.id}`),
          ...measurements.map(m => `measurements:${m.id}`),
          ...photoEvidences.map(p => `photoEvidence:${p.id}`),
          ...summaries.map(s => `weightSummaries:${s.id}`),
          ...signatures.map(s => `signatureRecords:${s.id}`),
          ...approvals.map(a => `approvalSnapshots:${a.id}`),
          ...cnCases.map(c => `cnCases:${c.id}`),
          ...exceptions.map(e => `deliveryExceptions:${e.id}`),
        ];

        const CHUNK = 50;
        for (let i = 0; i < keysToDelete.length; i += CHUNK) {
          const slice = keysToDelete.slice(i, i + CHUNK);
          await supabase.from('sync_state').delete().in('key', slice);
        }
        console.log(`[deleteImportBatch] Successfully purged ${keysToDelete.length} keys from Supabase cloud`);
      }
    } catch (cloudErr) {
      console.warn('[deleteImportBatch] Supabase cloud cleanup error:', cloudErr);
    }
  }

  return { deletedAppts: appts.length, deletedGroups: groups.length };
}

export async function deleteAppointmentsByReceiveDate(receiveDate: string): Promise<number> {
  const batches = await db.importBatches.where('receiveDate').equals(receiveDate).toArray();
  let totalDeleted = 0;
  for (const b of batches) {
    const res = await deleteImportBatch(b.id, true);
    totalDeleted += res.deletedAppts;
  }
  // Fallback: Delete any orphaned appointments matching this date
  const orphanedAppts = await db.appointments.where('receiveDate').equals(receiveDate).toArray();
  if (orphanedAppts.length > 0) {
    const ids = orphanedAppts.map(a => a.id);
    await db.appointments.where('id').anyOf(ids).delete();
    totalDeleted += ids.length;

    try {
      const { supabase } = await import('./supabaseClient');
      if (supabase) {
        const keys = ids.map(id => `appointments:${id}`);
        await supabase.from('sync_state').delete().in('key', keys);
      }
    } catch (_) {}
  }
  return totalDeleted;
}

// Seed / Mock appointment numbers from initial demo dataset
export const SEED_APPT_NUMBERS = [
  '931028', '931031', '931046', '931052', '931986',
  '931051', '931987', '931988', '932976', '931064'
];

/**
 * Purges initial mock/seed data completely from the database.
 * Used when a user imports real Excel files to avoid inflating appointment counts.
 * Strictly scopes deletion to batches marked with uploadedBy === 'SYSTEM_INITIAL_SEED'
 * so real user appointments are NEVER accidentally deleted.
 */
export async function purgeSeedData(): Promise<{ deletedAppts: number; deletedGroups: number }> {
  // 1. Find seed batches
  const seedBatches = await db.importBatches
    .filter(b => b.uploadedBy === 'SYSTEM_INITIAL_SEED' || Boolean(b.filename && b.filename.includes('Date 2026-10-12')) || b.id === '4d8ad75c-bbd7-466f-8eac-236c22d49649')
    .toArray();
  const seedBatchIds = new Set(seedBatches.map(b => b.id));
  seedBatchIds.add('4d8ad75c-bbd7-466f-8eac-236c22d49649');

  // 2. Find appointments belonging strictly to seed batches OR having mock appt numbers (931..., 932...)
  const isMockAppt = (a: any) => 
    (a.importBatchId && seedBatchIds.has(a.importBatchId)) ||
    SEED_APPT_NUMBERS.includes(a.apptNbr) ||
    String(a.apptNbr).startsWith('931') ||
    String(a.apptNbr).startsWith('932');

  const seedAppts = await db.appointments
    .filter(isMockAppt)
    .toArray();

  const seedApptNbrs = new Set(seedAppts.map(a => a.apptNbr));
  SEED_APPT_NUMBERS.forEach(nbr => seedApptNbrs.add(nbr));
  const apptIds = seedAppts.map(a => a.id);

  // 3. Find sampling groups belonging strictly to seed batches or mock appts
  const seedGroups = await db.samplingGroups
    .filter(g => (g.importBatchId && seedBatchIds.has(g.importBatchId)) || seedApptNbrs.has(g.apptNbr) || String(g.apptNbr).startsWith('931') || String(g.apptNbr).startsWith('932'))
    .toArray();
  const groupIds = seedGroups.map(g => g.id);

  if (apptIds.length === 0 && groupIds.length === 0 && seedBatches.length === 0) {
    return { deletedAppts: 0, deletedGroups: 0 };
  }

  await db.transaction('rw', [
    db.importBatches,
    db.appointments,
    db.appointmentVendors,
    db.purchaseOrders,
    db.samplingGroups,
    db.measurements,
    db.photoEvidence,
    db.weightSummaries,
    db.signatureRecords,
    db.approvalSnapshots,
    db.cnCases,
    db.deliveryExceptions,
  ], async () => {
    if (groupIds.length > 0) {
      await db.measurements.where('samplingGroupId').anyOf(groupIds).delete();
      await db.photoEvidence.where('samplingGroupId').anyOf(groupIds).delete();
      await db.weightSummaries.where('samplingGroupId').anyOf(groupIds).delete();
      await db.signatureRecords.where('samplingGroupId').anyOf(groupIds).delete();
      await db.approvalSnapshots.where('samplingGroupId').anyOf(groupIds).delete();
      await db.cnCases.where('samplingGroupId').anyOf(groupIds).delete();
      await db.deliveryExceptions.where('samplingGroupId').anyOf(groupIds).delete();
      await db.samplingGroups.where('id').anyOf(groupIds).delete();
    }
    const apptNbrArray = Array.from(seedApptNbrs);
    if (apptNbrArray.length > 0) {
      await db.purchaseOrders.where('apptNbr').anyOf(apptNbrArray).delete();
      await db.appointmentVendors.where('apptNbr').anyOf(apptNbrArray).delete();
    }
    if (apptIds.length > 0) {
      await db.appointments.where('id').anyOf(apptIds).delete();
    }
    for (const sb of seedBatches) {
      await db.importBatches.delete(sb.id);
    }
  });

  return { deletedAppts: apptIds.length, deletedGroups: groupIds.length };
}

/**
 * Cleans any orphaned appointments whose importBatchId does not exist in importBatches.
 */
export async function cleanOrphanedAppointments(): Promise<number> {
  const activeBatches = await db.importBatches.toArray();
  const activeBatchIds = new Set(activeBatches.map(b => b.id));
  
  // NEVER delete appointments if there are no batches recorded yet!
  if (activeBatchIds.size === 0) {
    return 0;
  }

  const orphanedAppts = await db.appointments
    .filter(a => !!a.importBatchId && !activeBatchIds.has(a.importBatchId))
    .toArray();

  if (orphanedAppts.length === 0) return 0;

  const orphanedIds = orphanedAppts.map(a => a.id);
  const orphanedApptNbrs = orphanedAppts.map(a => a.apptNbr);

  const orphanedGroups = await db.samplingGroups
    .filter(g => orphanedApptNbrs.includes(g.apptNbr) || (!!g.importBatchId && !activeBatchIds.has(g.importBatchId)))
    .toArray();
  const groupIds = orphanedGroups.map(g => g.id);

  await db.transaction('rw', [
    db.appointments,
    db.appointmentVendors,
    db.purchaseOrders,
    db.samplingGroups,
    db.measurements,
    db.photoEvidence,
    db.weightSummaries,
    db.signatureRecords,
    db.approvalSnapshots,
    db.cnCases,
    db.deliveryExceptions,
  ], async () => {
    if (groupIds.length > 0) {
      await db.measurements.where('samplingGroupId').anyOf(groupIds).delete();
      await db.photoEvidence.where('samplingGroupId').anyOf(groupIds).delete();
      await db.weightSummaries.where('samplingGroupId').anyOf(groupIds).delete();
      await db.signatureRecords.where('samplingGroupId').anyOf(groupIds).delete();
      await db.approvalSnapshots.where('samplingGroupId').anyOf(groupIds).delete();
      await db.cnCases.where('samplingGroupId').anyOf(groupIds).delete();
      await db.deliveryExceptions.where('samplingGroupId').anyOf(groupIds).delete();
      await db.samplingGroups.where('id').anyOf(groupIds).delete();
    }
    if (orphanedApptNbrs.length > 0) {
      await db.purchaseOrders.where('apptNbr').anyOf(orphanedApptNbrs).delete();
      await db.appointmentVendors.where('apptNbr').anyOf(orphanedApptNbrs).delete();
    }
    await db.appointments.where('id').anyOf(orphanedIds).delete();
  });

  return orphanedIds.length;
}

export async function cleanDuplicateAppointments(): Promise<{ removedAppts: number; removedGroups: number }> {
  let removedAppts = 0;
  let removedGroups = 0;

  // 0. Purge leftover seed/demo data & orphans unconditionally
  const seedRes = await purgeSeedData();
  removedAppts += seedRes.deletedAppts;
  removedGroups += seedRes.deletedGroups;
  const orphanCount = await cleanOrphanedAppointments();
  removedAppts += orphanCount;

  // 1. Deduplicate Appointments by apptNbr
  const allAppts = await db.appointments.toArray();
  const apptGrouped = new Map<string, typeof allAppts>();
  for (const a of allAppts) {
    if (!apptGrouped.has(a.apptNbr)) apptGrouped.set(a.apptNbr, []);
    apptGrouped.get(a.apptNbr)!.push(a);
  }

  const apptIdsToDelete: string[] = [];
  for (const [_, list] of apptGrouped.entries()) {
    if (list.length > 1) {
      // Sort: keep the one with most completedGroups or latest updatedAt
      list.sort((a, b) => (b.completedGroups || 0) - (a.completedGroups || 0) || b.updatedAt.localeCompare(a.updatedAt));
      const keep = list[0];
      const duplicates = list.slice(1);
      for (const d of duplicates) {
        apptIdsToDelete.push(d.id);
      }
    }
  }

  if (apptIdsToDelete.length > 0) {
    await db.appointments.where('id').anyOf(apptIdsToDelete).delete();
    removedAppts = apptIdsToDelete.length;
  }

  // 2. Deduplicate SamplingGroups by [apptNbr+poNbr+itemId]
  const allGroups = await db.samplingGroups.toArray();
  const sgGrouped = new Map<string, typeof allGroups>();
  for (const g of allGroups) {
    const key = `${g.apptNbr}_${g.poNbr}_${g.itemId}`;
    if (!sgGrouped.has(key)) sgGrouped.set(key, []);
    sgGrouped.get(key)!.push(g);
  }

  const groupIdsToDelete: string[] = [];
  for (const [_, list] of sgGrouped.entries()) {
    if (list.length > 1) {
      // Sort: keep the one with completed samples > 0 or latest
      list.sort((a, b) => (b.completedSamples || 0) - (a.completedSamples || 0) || b.updatedAt.localeCompare(a.updatedAt));
      const keep = list[0];
      const duplicates = list.slice(1);
      for (const d of duplicates) {
        groupIdsToDelete.push(d.id);
      }
    }
  }

  if (groupIdsToDelete.length > 0) {
    await db.measurements.where('samplingGroupId').anyOf(groupIdsToDelete).delete();
    await db.samplingGroups.where('id').anyOf(groupIdsToDelete).delete();
    removedGroups = groupIdsToDelete.length;
  }

  // Broadcast updated clean state to central server so mobile devices receive it
  import('./syncEngine').then(m => m.pushFullStateToServer()).catch(() => {});

  return { removedAppts, removedGroups };
}

// ============================================================
// START NEW DAY / DAILY ROLLOVER UTILITY
// Rolls dates to today, resets daily progress to 'รอชั่ง', and clears previous day's tests
// ============================================================

export async function startNewDay(targetDate?: string): Promise<{
  updatedAppts: number;
  updatedGroups: number;
  clearedMeasurements: number;
}> {
  const today = targetDate || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  let updatedAppts = 0;
  let updatedGroups = 0;
  let clearedMeasurements = 0;

  await db.transaction('rw', [
    db.appointments,
    db.samplingGroups,
    db.measurements,
    db.signatureRecords,
    db.weightSummaries,
    db.cnCases,
    db.approvalSnapshots,
    db.deliveryExceptions,
    db.photoEvidence,
    db.importBatches,
  ], async () => {
    // 1. Clear previous day's measurements, signatures, and summaries
    clearedMeasurements = await db.measurements.count();
    await db.measurements.clear();
    await db.signatureRecords.clear();
    await db.weightSummaries.clear();
    await db.approvalSnapshots.clear();
    await db.cnCases.clear();
    await db.deliveryExceptions.clear();
    await db.photoEvidence.clear();

    // 2. Update appointments and reset progress (preserving authoritative date from apptTime)
    const allAppts = await db.appointments.toArray();
    for (const appt of allAppts) {
      const fileDate = extractDateFromApptTime(appt.apptTime);
      await db.appointments.update(appt.id, {
        receiveDate: fileDate || today,
        completedGroups: 0,
        failedGroups: 0,
        pendingOtmGroups: 0,
        deliveryExceptionGroups: 0,
        driverSignatureStatus: 'PENDING',
        receiveSignatureStatus: 'PENDING',
        lpsSignatureStatus: 'PENDING',
        otmApprovalStatus: 'PENDING',
        summaryWorkflowStatus: 'SAMPLING',
        isJobClosed: false,
        closedAt: undefined,
        updatedAt: now,
      });
      updatedAppts++;
    }

    // 3. Reset sampling groups to fresh waiting state
    const allGroups = await db.samplingGroups.toArray();
    for (const group of allGroups) {
      await db.samplingGroups.update(group.id, {
        samplingStatus: 'รอชั่ง',
        workflowStatus: 'PENDING_QTY_CONFIRM',
        completedSamples: 0,
        validSamples: 0,
        weightResult: 'INCOMPLETE',
        cnStatus: 'NONE',
        isJobClosed: false,
        closedAt: undefined,
        updatedAt: now,
      });
      updatedGroups++;
    }

    // 4. Update import batches receiveDate
    await db.importBatches.toCollection().modify({
      receiveDate: today,
    });
  });

  // Broadcast new day state to central server so mobile devices receive it
  import('./syncEngine').then(m => m.pushFullStateToServer()).catch(() => {});

  return { updatedAppts, updatedGroups, clearedMeasurements };
}
