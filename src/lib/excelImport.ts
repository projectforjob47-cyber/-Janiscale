// ============================================================
// SMART DC — Excel Import Engine
// Reads prt26 sheet, filters CATCH_WEIGHT, builds entities
// ============================================================

import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExcelRow,
  ImportBatch,
  Appointment,
  AppointmentVendor,
  PurchaseOrder,
  SamplingGroup,
  ImportValidationError,
  CarrierCode,
  ItemMasterItem,
} from '../types';
import {
  parseStandardWeight,
  calculateRequiredSamples,
  safeParseNumber,
  isCatchWeight,
  isSamplingCatchWeight,
  isFrozenJob,
  isSp1Prepack,
} from './businessLogic';
import { db, syncSamplingGroupsWithItemMaster, deleteImportBatch, purgeSeedData } from './database';
import { extractDateFromApptTime } from './dateUtils';
import { pushFullStateToServer } from './syncEngine';

// Target sheet name — find by exact name
const TARGET_SHEET = 'prt26';

// Column index map (0-based) — VERIFIED against actual Excel
const COL = {
  xxx: 0,           // A
  ApptWeight: 1,    // B
  Period: 2,        // C
  Appt_time: 3,     // D
  PO_nbr: 4,        // E
  Appt_nbr: 5,      // F
  Appt_status: 6,   // G
  RCVD_Start: 7,    // H
  RCVD_End: 8,      // I
  DURATION: 9,      // J
  User_Received: 10,// K
  Item_id: 11,      // L
  Description: 12,  // M
  Division: 13,     // N
  Item_Class: 14,   // O — AUTHORITATIVE filter
  Flag_CW: 15,      // P
  Tolerance: 16,    // Q
  Unit_Cost: 17,    // R
  PACK_SIZE: 18,    // S
  UOM_CONV: 19,     // T
  UDA10: 20,        // U
  UPS: 21,          // V
  Load_Type: 22,    // W
  DC_Ti: 23,        // X
  DC_Hi: 24,        // Y
  LENGTH: 25,       // Z
  WIDTH: 26,        // AA
  HEIGHT: 27,       // AB
  WEIGHT: 28,       // AC
  UDA1: 29,         // AD
  UDA6: 30,         // AE
  UDA7: 31,         // AF
  Dept: 32,         // AG
  Vendor_nbr: 33,   // AH
  Vendor_name: 34,  // AI
  Carrier_code: 35, // AJ
  Appt_cont_qty: 36,// AK — REFERENCE ONLY
  RCVD_cont_qty: 37,// AL — AUTHORITATIVE received qty
  Diff: 38,         // AM
};

// Expected headers for validation
const EXPECTED_HEADERS: Record<string, number> = {
  'Item Class': COL.Item_Class,
  'Appt_nbr': COL.Appt_nbr,
  'PO_nbr': COL.PO_nbr,
  'Item_id': COL.Item_id,
  'Description': COL.Description,
  'Vendor_nbr': COL.Vendor_nbr,
  'Vendor_name': COL.Vendor_name,
  'Carrier_code': COL.Carrier_code,
  'Appt_cont_qty': COL.Appt_cont_qty,
  'RCVD_cont_qty': COL.RCVD_cont_qty,
};

export interface ImportResult {
  batch: ImportBatch;
  appointments: Appointment[];
  vendors: AppointmentVendor[];
  purchaseOrders: PurchaseOrder[];
  samplingGroups: SamplingGroup[];
  skippedDuplicates: number;
  errors: ImportValidationError[];
}

function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function safeNum(val: unknown): number | null {
  return safeParseNumber(val);
}

function rowToExcelRow(
  rawRow: unknown[],
  rowIndex: number,
  importBatchId: string
): ExcelRow {
  return {
    apptWeight: safeString(rawRow[COL.ApptWeight]),
    period: safeString(rawRow[COL.Period]),
    apptTime: safeString(rawRow[COL.Appt_time]),
    poNbr: String(rawRow[COL.PO_nbr] ?? '').trim(),
    apptNbr: String(rawRow[COL.Appt_nbr] ?? '').trim(),
    apptStatus: safeString(rawRow[COL.Appt_status]),
    rcvdStartTime: safeString(rawRow[COL.RCVD_Start]),
    rcvdEndTime: safeString(rawRow[COL.RCVD_End]),
    duration: safeString(rawRow[COL.DURATION]),
    userReceived: safeString(rawRow[COL.User_Received]),
    itemId: String(rawRow[COL.Item_id] ?? '').trim(),
    description: String(rawRow[COL.Description] ?? '').trim(),
    division: safeString(rawRow[COL.Division]),
    itemClass: String(rawRow[COL.Item_Class] ?? '').trim(),
    flagCatchWeight: safeString(rawRow[COL.Flag_CW]),
    tolerancePct: safeNum(rawRow[COL.Tolerance]),
    unitCost: safeNum(rawRow[COL.Unit_Cost]),
    packSize: safeString(rawRow[COL.PACK_SIZE]),
    uomConvFactor: safeNum(rawRow[COL.UOM_CONV]),
    uda10: safeString(rawRow[COL.UDA10]),
    ups: safeString(rawRow[COL.UPS]),
    loadType: safeString(rawRow[COL.Load_Type]),
    dcTi: safeNum(rawRow[COL.DC_Ti]),
    dcHi: safeNum(rawRow[COL.DC_Hi]),
    length: safeNum(rawRow[COL.LENGTH]),
    width: safeNum(rawRow[COL.WIDTH]),
    height: safeNum(rawRow[COL.HEIGHT]),
    weight: safeNum(rawRow[COL.WEIGHT]),
    uda1: safeString(rawRow[COL.UDA1]),
    uda6: safeString(rawRow[COL.UDA6]),
    uda7: safeString(rawRow[COL.UDA7]),
    dept: safeString(rawRow[COL.Dept]),
    vendorNbr: String(rawRow[COL.Vendor_nbr] ?? '').trim(),
    vendorName: String(rawRow[COL.Vendor_name] ?? '').trim(),
    carrierCode: (safeString(rawRow[COL.Carrier_code]) ?? 'VN') as CarrierCode,
    apptContQty: safeNum(rawRow[COL.Appt_cont_qty]),     // AK — reference only
    rcvdContQty: safeNum(rawRow[COL.RCVD_cont_qty]),      // AL — authoritative
    diff: safeNum(rawRow[COL.Diff]),
    sourceRowIndex: rowIndex,
    importBatchId,
  };
}

export interface ImportOptions {
  replaceExisting?: boolean; // If true: removes old batch/data for this date or filename to prevent duplicates
}

export async function importExcelFile(
  file: File,
  uploadedBy: string,
  receiveDate: string,
  options: ImportOptions = { replaceExisting: true }
): Promise<ImportResult> {
  const batchId = uuidv4();
  const now = new Date().toISOString();
  const errors: ImportValidationError[] = [];

  // 0. Auto-Reset all previous operational progress across the whole app for the new file/day
  // Purge mock demo seed data so it doesn't mix with real imported file
  await purgeSeedData();

  // Clear transactional/operational tables completely so the new day's file starts 100% fresh in "รอชั่ง"
  await db.measurements.clear();
  await db.signatureRecords.clear();
  await db.weightSummaries.clear();
  await db.approvalSnapshots.clear();
  await db.cnCases.clear();
  await db.deliveryExceptions.clear();
  await db.photoEvidence.clear();

  // Read file as ArrayBuffer — load ONLY prt26 sheet for maximum speed on large files
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    sheets: [TARGET_SHEET],
    cellDates: true,
    raw: false,
  });

  // Find prt26 sheet by exact name
  const sheetName = workbook.SheetNames.find(s => s === TARGET_SHEET);
  if (!sheetName) {
    throw new Error(`ไม่พบ worksheet ชื่อ '${TARGET_SHEET}' ในไฟล์ Excel`);
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];

  if (rawData.length < 2) {
    throw new Error('ไม่พบข้อมูลใน worksheet prt26');
  }

  // Validate headers
  const headerRow = rawData[0] as string[];
  for (const [expectedHeader, colIdx] of Object.entries(EXPECTED_HEADERS)) {
    const actualHeader = String(headerRow[colIdx] ?? '').trim();
    if (actualHeader !== expectedHeader) {
      errors.push({
        row: 1,
        column: `Col ${colIdx + 1}`,
        value: actualHeader,
        message: `Header ไม่ตรง: คาดหวัง "${expectedHeader}" แต่พบ "${actualHeader}"`,
      });
    }
  }

  // Parse all data rows
  const allRows: ExcelRow[] = [];
  let catchWeightRows = 0;
  let excludedRows = 0;

  for (let i = 1; i < rawData.length; i++) {
    const rawRow = rawData[i] as unknown[];
    // Skip entirely empty rows
    if (!rawRow || rawRow.every(cell => cell === null)) continue;

    const row = rowToExcelRow(rawRow, i + 1, batchId); // +1 for 1-based Excel row number
    allRows.push(row);

    if (isSamplingCatchWeight(row)) {
      catchWeightRows++;
    } else {
      excludedRows++;
    }
  }

  // ── Authoritative Date Detection from Excel File ──────────
  // User Requirement: "วันที่ในแอป และในไฟล์เอกเซลไม่ตรงกัน ให้ยึดตามไฟล์"
  // Scan all rows to detect the true appointment date from Appt_time (Col D)
  let detectedFileDate: string | null = null;
  for (const row of allRows) {
    if (row.apptTime) {
      const d = extractDateFromApptTime(row.apptTime);
      if (d) {
        detectedFileDate = d;
        break;
      }
    }
  }
  const authoritativeReceiveDate = detectedFileDate || receiveDate || now.split('T')[0];

  // Filter to CATCH_WEIGHT only for active sampling (strictly excludes FZ/FZ21 jobs and SP1 retail prepacks)
  const cwRows = allRows.filter(r => isSamplingCatchWeight(r));

  // Check for duplicate import (same date, same appointments)
  // A duplicate is detected if sampling groups with these apptNbr+poNbr+itemId already exist
  let skippedDuplicates = 0;

  // Query active Focus Master items for automatic Focus tagging
  const allFocus = await db.focusMaster.toArray().catch(() => []);
  const activeFocus = allFocus.filter(f => Boolean(f.isActive));
  const focusItemIds = new Set(activeFocus.map(f => String(f.itemId).trim()));

  // Load Item Master items for complete product descriptions & auto-learning new items
  const allMasterItems = await db.itemMaster.toArray().catch(() => []);
  const itemMasterMap = new Map<string, ItemMasterItem>(
    allMasterItems.map(m => [String(m.itemId).trim(), m])
  );
  const newItemsToRegister: ItemMasterItem[] = [];

  // Pre-load existing records from DB into in-memory Maps for rock-solid duplicate detection
  const existingAppts = await db.appointments.toArray().catch(() => []);
  const existingVendors = await db.appointmentVendors.toArray().catch(() => []);
  const existingPOs = await db.purchaseOrders.toArray().catch(() => []);
  const existingGroups = await db.samplingGroups.toArray().catch(() => []);

  const existingApptMap = new Map<string, Appointment>(existingAppts.map(a => [a.apptNbr, a]));
  const existingVendorMap = new Map<string, AppointmentVendor>(existingVendors.map(v => [`${v.apptNbr}_${v.vendorNbr}`, v]));
  const existingPoMap = new Map<string, PurchaseOrder>(existingPOs.map(p => [`${p.apptNbr}_${p.poNbr}_${p.vendorNbr}`, p]));
  const existingGroupMap = new Map<string, SamplingGroup>(existingGroups.map(g => [`${g.apptNbr}_${g.poNbr}_${g.itemId}`, g]));

  // Build appointments
  const appointmentMap = new Map<string, Appointment>();
  const vendorMap = new Map<string, AppointmentVendor>();         // key: apptNbr_vendorNbr
  const purchaseOrderMap = new Map<string, PurchaseOrder>();      // key: apptNbr_poNbr_vendorNbr
  const samplingGroupMap = new Map<string, SamplingGroup>();      // key: apptNbr_poNbr_itemId

  for (const row of cwRows) {
    const groupKey = `${row.apptNbr}_${row.poNbr}_${row.itemId}`;
    const existingGroup = existingGroupMap.get(groupKey);

    // Duplicate import protection: if item already exists in system and replaceExisting is false, DO NOT duplicate!
    if (existingGroup && !options.replaceExisting) {
      skippedDuplicates++;
      continue;
    }

    // ── Appointment ──────────────────────────────────────────
    if (!appointmentMap.has(row.apptNbr)) {
      const existingDbAppt = existingApptMap.get(row.apptNbr);
      if (existingDbAppt && !options.replaceExisting) {
        if (row.apptTime && (!existingDbAppt.apptTime || existingDbAppt.apptTime !== row.apptTime)) {
          existingDbAppt.apptTime = row.apptTime;
          existingDbAppt.receiveDate = extractDateFromApptTime(row.apptTime) || existingDbAppt.receiveDate;
        }
        if (row.carrierCode && (!existingDbAppt.carrierCode || existingDbAppt.carrierCode === '-')) {
          existingDbAppt.carrierCode = row.carrierCode;
        }
        appointmentMap.set(row.apptNbr, existingDbAppt);
      } else {
        const appt: Appointment = {
          id: existingDbAppt?.id || `appt-${row.apptNbr}`,
          importBatchId: batchId,
          apptNbr: row.apptNbr,
          apptTime: row.apptTime,
          apptStatus: row.apptStatus,
          carrierCode: row.carrierCode,
          receiveDate: extractDateFromApptTime(row.apptTime) || authoritativeReceiveDate,
          vendorCount: 0,
          poCount: 0,
          catchWeightSkuCount: 0,
          totalSamplingGroups: 0,
          completedGroups: 0,
          failedGroups: 0,
          pendingOtmGroups: 0,
          deliveryExceptionGroups: 0,
          syncStatus: 'OFFLINE',
          createdAt: existingDbAppt?.createdAt || now,
          updatedAt: now,
        };
        appointmentMap.set(row.apptNbr, appt);
      }
    }
    const appt = appointmentMap.get(row.apptNbr)!;

    // ── Vendor ───────────────────────────────────────────────
    const vendorKey = `${row.apptNbr}_${row.vendorNbr}`;
    if (!vendorMap.has(vendorKey)) {
      const existingVendor = existingVendorMap.get(vendorKey);
      if (existingVendor && !options.replaceExisting) {
        vendorMap.set(vendorKey, existingVendor);
      } else {
        const vendor: AppointmentVendor = {
          id: existingVendor?.id || `v-${vendorKey}`,
          appointmentId: appt.id,
          apptNbr: row.apptNbr,
          vendorNbr: row.vendorNbr,
          vendorName: row.vendorName,
          poCount: 0,
          syncStatus: 'OFFLINE',
        };
        vendorMap.set(vendorKey, vendor);
      }
    }
    const vendor = vendorMap.get(vendorKey)!;

    // ── PO ───────────────────────────────────────────────────
    const poKey = `${row.apptNbr}_${row.poNbr}_${row.vendorNbr}`;
    if (!purchaseOrderMap.has(poKey)) {
      const existingPo = existingPoMap.get(poKey);
      if (existingPo && !options.replaceExisting) {
        purchaseOrderMap.set(poKey, existingPo);
      } else {
        const po: PurchaseOrder = {
          id: existingPo?.id || `po-${poKey}`,
          appointmentId: appt.id,
          vendorId: vendor.id,
          apptNbr: row.apptNbr,
          vendorNbr: row.vendorNbr,
          poNbr: row.poNbr,
          itemCount: 0,
          syncStatus: 'OFFLINE',
        };
        purchaseOrderMap.set(poKey, po);
      }
    }
    const po = purchaseOrderMap.get(poKey)!;

    // ── Sampling Group (Appt + PO + SKU) ─────────────────────
    if (!samplingGroupMap.has(groupKey)) {
      const trimmedItemId = String(row.itemId).trim();
      let resolvedDescription = row.description;
      const masterItem = itemMasterMap.get(trimmedItemId);

      if (masterItem && masterItem.description) {
        resolvedDescription = masterItem.description;
      } else {
        // New item encountered in Excel! Auto-register to Item Master for future matches
        const spFromRaw = parseStandardWeight(row.description);
        const newItem: ItemMasterItem = {
          id: `master-${trimmedItemId}`,
          itemId: trimmedItemId,
          description: row.description,
          spExpression: spFromRaw.expression,
          standardWeightKg: spFromRaw.standardWeightKg,
          source: 'EXCEL_IMPORT',
          createdAt: now,
          updatedAt: now,
        };
        newItemsToRegister.push(newItem);
        itemMasterMap.set(trimmedItemId, newItem);
      }

      // Parse SP weight from resolved full description
      const spResult = parseStandardWeight(resolvedDescription);

      // Get quantities: Planned Quantity from Column AM (Diff) per V3.0 Requirement 8, RCVD from AL
      const importedRcvdQty = row.rcvdContQty;
      const plannedQty = (row.diff !== null && !isNaN(row.diff)) ? row.diff : (row.apptContQty ?? 0);

      const group: SamplingGroup = {
        id: existingGroup?.id || `sg-${groupKey}`,
        importBatchId: batchId,
        appointmentId: appt.id,
        poId: po.id,
        apptNbr: row.apptNbr,
        poNbr: row.poNbr,
        itemId: row.itemId,
        description: resolvedDescription,
        division: row.division,
        dept: row.dept,
        vendorNbr: row.vendorNbr,
        vendorName: row.vendorName,
        carrierCode: row.carrierCode,
        // SP parsing
        spExpression: spResult.expression,
        standardWeightKg: spResult.standardWeightKg,
        spParserStatus: spResult.status,
        spOverrideReason: null,
        spOverrideBy: null,
        spOverrideAt: null,
        // Quantities (Planned Quantity sourced from Column AM)
        uda6: row.uda6 ? String(row.uda6).trim().toUpperCase() : null,
        uda7: row.uda7 ? String(row.uda7).trim().toUpperCase() : null,
        ups: row.ups ? String(row.ups).trim().toUpperCase() : null,
        loadType: row.loadType ? String(row.loadType).trim().toUpperCase() : null,
        defaultBasketCode: row.uda6 ? String(row.uda6).trim().toUpperCase() : null,
        apptContQty: plannedQty,
        importedRcvdContQty: importedRcvdQty,  // AL authoritative (preserved)
        confirmedActualQty: plannedQty > 0 ? plannedQty : null,
        qtyConfirmedBy: null,
        qtyConfirmedAt: null,
        qtyCorrectionReason: null,
        // Sampling (calculated immediately based on planned quantity, minimum 1 container)
        requiredSamples: calculateRequiredSamples((plannedQty && plannedQty > 0) ? plannedQty : ((importedRcvdQty && importedRcvdQty > 0) ? importedRcvdQty : 1)) || 1,
        completedSamples: 0,
        validSamples: 0,
        // Status
        samplingStatus: 'รอชั่ง',
        focusStatus: focusItemIds.has(String(row.itemId).trim()) ? 'FOCUS' : 'NON_FOCUS',
        deliveryStatus: 'NORMAL',
        workflowStatus: 'PENDING_QTY_CONFIRM',
        syncStatus: 'OFFLINE',
        cnStatus: 'NONE',
        approvalVersion: 1,
        weightResult: 'INCOMPLETE',
        sourceRowIndexes: [row.sourceRowIndex],
        createdAt: now,
        updatedAt: now,
      };
      samplingGroupMap.set(groupKey, group);

      // Increment counts
      po.itemCount++;
    } else {
      // Same Appt+PO+SKU appears in multiple rows — add source row for traceability
      const group = samplingGroupMap.get(groupKey)!;
      group.sourceRowIndexes.push(row.sourceRowIndex);
    }
  }

  // Calculate appointment-level aggregates
  for (const [apptNbr, appt] of appointmentMap.entries()) {
    const apptVendors = [...vendorMap.values()].filter(v => v.apptNbr === apptNbr);
    const apptPOs = [...purchaseOrderMap.values()].filter(p => p.apptNbr === apptNbr);
    const apptGroups = [...samplingGroupMap.values()].filter(g => g.apptNbr === apptNbr);

    appt.vendorCount = apptVendors.length;
    appt.poCount = apptPOs.length;
    appt.catchWeightSkuCount = apptGroups.length;
    appt.totalSamplingGroups = apptGroups.length;

    // Update PO counts for vendors
    for (const vendor of apptVendors) {
      vendor.poCount = [...purchaseOrderMap.values()].filter(
        p => p.apptNbr === apptNbr && p.vendorNbr === vendor.vendorNbr
      ).length;
    }
  }

  // Warn about VN appointments with multiple vendors
  for (const [apptNbr, appt] of appointmentMap.entries()) {
    if (appt.carrierCode === 'VN' && appt.vendorCount > 1) {
      errors.push({
        row: 0,
        column: 'Carrier_code / Vendor',
        value: apptNbr,
        message: `⚠️ Appointment ${apptNbr} เป็นประเภท VN แต่มีหลาย Vendor (${appt.vendorCount} vendors) — กรุณาตรวจสอบ`,
      });
    }
  }

  // Build ImportBatch record
  const batch: ImportBatch = {
    id: batchId,
    filename: file.name,
    uploadedAt: now,
    uploadedBy,
    receiveDate: authoritativeReceiveDate,
    totalRowsRead: allRows.length,
    catchWeightRows,
    excludedRows,
    appointmentCount: appointmentMap.size,
    validationErrors: errors,
    syncStatus: 'OFFLINE',
  };

  // Persist everything to IndexedDB
  await db.transaction('rw',
    [db.importBatches, db.excelRows, db.appointments, db.appointmentVendors,
     db.purchaseOrders, db.samplingGroups, db.itemMaster],
    async () => {
      if (options.replaceExisting) {
        await db.appointments.clear();
        await db.appointmentVendors.clear();
        await db.purchaseOrders.clear();
        await db.samplingGroups.clear();
        await db.importBatches.clear();
        await db.excelRows.clear();
      }

      await db.importBatches.add(batch);

      // Upsert appointments to ensure apptTime and carrierCode are always up-to-date
      if (appointmentMap.size > 0) {
        await db.appointments.bulkPut([...appointmentMap.values()]);
      }

      const existingVendorIds = new Set((await db.appointmentVendors.toArray()).map(v => v.id));
      const vendorsToInsert = [...vendorMap.values()].filter(v => !existingVendorIds.has(v.id));
      if (vendorsToInsert.length > 0) {
        await db.appointmentVendors.bulkAdd(vendorsToInsert);
      }

      const existingPoIds = new Set((await db.purchaseOrders.toArray()).map(p => p.id));
      const posToInsert = [...purchaseOrderMap.values()].filter(p => !existingPoIds.has(p.id));
      if (posToInsert.length > 0) {
        await db.purchaseOrders.bulkAdd(posToInsert);
      }

      const existingGroupIds = new Set((await db.samplingGroups.toArray()).map(g => g.id));
      const groupsToInsert = [...samplingGroupMap.values()].filter(g => !existingGroupIds.has(g.id));
      if (groupsToInsert.length > 0) {
        await db.samplingGroups.bulkAdd(groupsToInsert);
      }

      if (newItemsToRegister.length > 0) {
        await db.itemMaster.bulkAdd(newItemsToRegister);
      }
    }
  );

  // Sync the entire newly imported state to central server in background so UI returns instantly
  pushFullStateToServer().catch(console.error);

  return {
    batch,
    appointments: [...appointmentMap.values()],
    vendors: [...vendorMap.values()],
    purchaseOrders: [...purchaseOrderMap.values()],
    samplingGroups: [...samplingGroupMap.values()],
    skippedDuplicates,
    errors,
  };
}

export async function importItemMasterExcel(
  file: File
): Promise<{ totalRead: number; addedOrUpdated: number; updatedSamplingGroups: number }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  const now = new Date().toISOString();
  const itemMap = new Map<string, ItemMasterItem>();

  for (const r of rows) {
    const rawId = r.Item_id || r.item_id || r.itemId || r['Item ID'] || r['รหัสสินค้า'];
    const rawDesc = r.Description || r.description || r['Item Description'] || r['ชื่อสินค้า'];
    if (!rawId || !rawDesc) continue;

    const itemId = String(rawId).trim();
    const description = String(rawDesc).trim();
    const spResult = parseStandardWeight(description);

    itemMap.set(itemId, {
      id: `master-${itemId}`,
      itemId,
      description,
      spExpression: spResult.expression,
      standardWeightKg: spResult.standardWeightKg,
      source: 'EXCEL_IMPORT',
      createdAt: now,
      updatedAt: now,
    });
  }

  const items = [...itemMap.values()];
  if (items.length > 0) {
    await db.itemMaster.bulkPut(items);
  }

  // Immediately re-sync all existing sampling groups with full descriptions
  const syncResult = await syncSamplingGroupsWithItemMaster();

  return {
    totalRead: rows.length,
    addedOrUpdated: items.length,
    updatedSamplingGroups: syncResult.updatedGroups,
  };
}
