// ============================================================
// SMART DC — Core Type Definitions
// Digital Weight Sampling System
// ============================================================

// ─────────────────────────────────────────────────────────────
// ENUMS & UNION TYPES
// ─────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'RECEIVE' | 'OTM' | 'LPS' | 'BACK_OFFICE' | 'SUPERVISOR' | 'SUPPORT';

export type CarrierCode = 'VN' | 'PR' | string;

export type ItemClass = 'CATCH_WEIGHT' | 'NON_CATCH_WEIGHT' | string;

export type SamplingStatus = 'รอชั่ง' | 'ชั่งครบ' | 'ผิดเกณฑ์' | 'ไม่มาตามแผน' | 'ไม่มาส่ง';

export type FocusStatus = 'FOCUS' | 'NON_FOCUS' | 'PENDING_FOCUS_VERIFICATION';

export type DeliveryStatus =
  | 'NORMAL'
  | 'PARTIAL_DELIVERY'
  | 'NOT_DELIVERED'
  | 'QUANTITY_DISCREPANCY'
  | 'PENDING_BACKOFFICE_RECONCILIATION'
  | 'RECONCILED';

export type WorkflowStatus =
  | 'PENDING_QTY_CONFIRM'
  | 'SAMPLING'
  | 'PENDING_VENDOR_SIGN'
  | 'PENDING_RECEIVE_SIGN'
  | 'PENDING_LPS_SIGN'
  | 'PENDING_OTM'
  | 'FULLY_SIGNED'
  | 'FINALIZED';

export type SyncStatus =
  | 'OFFLINE'
  | 'PENDING_SYNC'
  | 'SYNCING'
  | 'SYNCED'
  | 'SYNC_FAILED';

export type CNStatus = 'NONE' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export type SpParserStatus = 'PARSED' | 'FAILED' | 'OVERRIDE' | 'PENDING';

export type WeightResult = 'PASS' | 'FAIL' | 'INCOMPLETE';

// V3.0: Driver signs once for VN (NOT_REQUIRED_PR for PR). LP&S is conditional on Focus. OTM approves via PIN.
export type SignerRole = 'DRIVER' | 'VENDOR' | 'RECEIVE' | 'LPS' | 'OTM';

// ─────────────────────────────────────────────────────────────
// BASKET MASTER
// ─────────────────────────────────────────────────────────────

export interface BasketMasterItem {
  id: string;
  code: string;                    // e.g. "W", "X", "YN"
  name: string;                    // Display name
  tareWeightKg: number;            // e.g. 0.85
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export const ALLOWED_CONTAINER_CODES = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'] as const;
export type AllowedContainerCode = typeof ALLOWED_CONTAINER_CODES[number];

// Basket Master from Tesco Tray size.pdf + Container O
export const DEFAULT_BASKET_MASTER: Omit<BasketMasterItem, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>[] = [
  { code: 'ZN', name: 'ตะกร้า ZN', tareWeightKg: 2.20, isActive: true },
  { code: 'Z',  name: 'ตะกร้า Z',  tareWeightKg: 2.20, isActive: true },
  { code: 'W',  name: 'ตะกร้า W',  tareWeightKg: 0.85, isActive: true },
  { code: 'X',  name: 'ตะกร้า X',  tareWeightKg: 0.60, isActive: true },
  { code: 'F',  name: 'ตะกร้า F',  tareWeightKg: 2.40, isActive: true },
  { code: 'Y',  name: 'ตะกร้า Y',  tareWeightKg: 1.40, isActive: true },
  { code: 'YN', name: 'ตะกร้า YN', tareWeightKg: 1.37, isActive: true },
  { code: 'SF', name: 'ตะกร้า SF', tareWeightKg: 2.40, isActive: true },
  { code: 'XN', name: 'ตะกร้า XN', tareWeightKg: 0.50, isActive: true },
  { code: 'O',  name: 'กล่อง / กระสอบ (ภาชนะ O)', tareWeightKg: 0, isActive: true },
];

// ─────────────────────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;          // Employee ID or email
  empId?: string;           // Formatted Employee ID
  fullName: string;
  role: UserRole;
  department?: string;
  email?: string | null;
  pinHash?: string;         // Salted/hashed PIN (server-side/IndexedDB demo)
  isPinSet?: boolean;       // True if employee has set their 6-digit PIN
  isActive: boolean;
  createdAt: string;
}

export interface FocusMasterItem {
  id: string;
  itemId: string;            // DC Item 992 / ITEM ID
  description?: string;      // ITEM_DESCRIPTION
  status?: string;           // Status e.g. "Check 992"
  weekNumber?: string;       // e.g. "WK42" or "2026"
  poNbr?: string;            // Optional PO NBR
  vendorNbr?: string;
  isActive: boolean;
  uploadedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ItemMasterItem {
  id: string;
  itemId: string;            // Official ITEM ID
  description: string;       // Full official product description
  spExpression?: string | null;
  standardWeightKg?: number | null;
  source?: 'INITIAL_MASTER' | 'EXCEL_IMPORT' | 'MANUAL';
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// IMPORT BATCH
// ─────────────────────────────────────────────────────────────

export interface ImportBatch {
  id: string;
  filename: string;
  uploadedAt: string;
  uploadedBy: string;
  receiveDate: string;              // Date of the receiving operations
  totalRowsRead: number;
  catchWeightRows: number;
  excludedRows: number;
  appointmentCount: number;
  validationErrors: ImportValidationError[];
  syncStatus: SyncStatus;
}

export interface ImportValidationError {
  row: number;
  column: string;
  value: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// EXCEL ROW (raw from prt26 sheet)
// ─────────────────────────────────────────────────────────────

export interface ExcelRow {
  // Map from specification column letters
  apptWeight: string | null;          // B
  period: string | null;              // C
  apptTime: string | null;            // D
  poNbr: string;                      // E
  apptNbr: string;                    // F
  apptStatus: string | null;          // G
  rcvdStartTime: string | null;       // H
  rcvdEndTime: string | null;         // I
  duration: string | null;            // J
  userReceived: string | null;        // K
  itemId: string;                     // L — SKU
  description: string;                // M
  division: string | null;            // N
  itemClass: ItemClass;               // O — AUTHORITATIVE filter
  flagCatchWeight: string | null;     // P
  tolerancePct: number | null;        // Q
  unitCost: number | null;            // R
  packSize: string | null;            // S
  uomConvFactor: number | null;       // T
  uda10: string | null;               // U
  ups: string | null;                 // V
  loadType: string | null;            // W
  dcTi: number | null;                // X
  dcHi: number | null;                // Y
  length: number | null;              // Z
  width: number | null;               // AA
  height: number | null;              // AB
  weight: number | null;              // AC
  uda1: string | null;                // AD
  uda6: string | null;                // AE
  uda7: string | null;                // AF
  dept: string | null;                // AG
  vendorNbr: string;                  // AH
  vendorName: string;                 // AI
  carrierCode: CarrierCode;           // AJ — VN or PR
  apptContQty: number | null;         // AK — display reference only
  rcvdContQty: number | null;         // AL — AUTHORITATIVE received quantity
  diff: number | null;                // AM
  // Internal
  sourceRowIndex: number;
  importBatchId: string;
}

// ─────────────────────────────────────────────────────────────
// APPOINTMENT
// ─────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  importBatchId: string;
  apptNbr: string;
  apptTime: string | null;
  apptStatus: string | null;
  carrierCode: CarrierCode;
  receiveDate: string;
  vendorCount: number;
  poCount: number;
  catchWeightSkuCount: number;
  // Aggregate progress
  totalSamplingGroups: number;
  completedGroups: number;
  failedGroups: number;
  pendingOtmGroups: number;
  deliveryExceptionGroups: number;
  // V3.0 Appointment-level workflow statuses
  approvalVersion?: number;
  driverSignatureStatus?: 'PENDING' | 'SIGNED' | 'NOT_REQUIRED_PR';
  receiveSignatureStatus?: 'PENDING' | 'SIGNED';
  lpsSignatureStatus?: 'PENDING' | 'SIGNED' | 'NOT_REQUIRED';
  otmApprovalStatus?: 'PENDING' | 'APPROVED';
  summaryWorkflowStatus?: 'SAMPLING' | 'PENDING_DRIVER' | 'PENDING_RECEIVE' | 'PENDING_LPS' | 'PENDING_OTM' | 'FULLY_SIGNED';
  isJobClosed?: boolean;
  closedAt?: string;
  // Shift & Command Hierarchy
  shiftType?: string;
  shiftLeaderEmpId?: string;
  shiftLeaderName?: string;
  shiftLeaderRole?: string;
  shiftLeaderDept?: string;
  reportingToName?: string;
  reportingToRole?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// VENDOR (per appointment)
// ─────────────────────────────────────────────────────────────

export interface AppointmentVendor {
  id: string;
  appointmentId: string;
  apptNbr: string;
  vendorNbr: string;
  vendorName: string;
  poCount: number;
  syncStatus: SyncStatus;
}

// ─────────────────────────────────────────────────────────────
// PURCHASE ORDER
// ─────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  appointmentId: string;
  vendorId: string;
  apptNbr: string;
  vendorNbr: string;
  poNbr: string;
  itemCount: number;
  syncStatus: SyncStatus;
}

// ─────────────────────────────────────────────────────────────
// SAMPLING GROUP — Core record (Appt + PO + SKU)
// ─────────────────────────────────────────────────────────────

export interface SamplingGroup {
  id: string;                          // UUID
  importBatchId: string;
  appointmentId: string;
  poId: string;
  apptNbr: string;
  poNbr: string;
  itemId: string;                      // SKU
  description: string;                 // Col M raw value
  division: string | null;
  dept: string | null;
  vendorNbr: string;
  vendorName: string;
  carrierCode: CarrierCode;

  // Standard weight from Description
  spExpression: string | null;         // Extracted "SP10", "SP25", "SP1_5"
  standardWeightKg: number | null;     // Parsed or approved standard net weight per container
  spParserStatus: SpParserStatus;
  spOverrideReason: string | null;
  spOverrideBy: string | null;
  spOverrideAt: string | null;

  // Container quantities & Basket Master
  uda6?: string | null;                // Column AE raw container code from List All Appointment ("SF", "X", "Y", "Z", "O")
  uda7?: string | null;                // Column AF raw UDA7 code (e.g. "FZ21", "ML01", "PD12")
  ups?: string | null;                 // Column V raw Unit Pick System (e.g. "FZ", "ML", "PD")
  loadType?: string | null;            // Column W raw Load Type (e.g. "FRESH", "FZ")
  containerType?: string | null;       // Active container code for this SKU ("SF", "X", "Y", "Z", "O")
  defaultBasketCode?: string | null;   // e.g. "SF", "X", "Y", "Z", "O" selected once for this SKU
  defaultTareWeightKg?: number | null; // e.g. 0.60 kg, or custom entered for O
  apptContQty: number | null;          // AK — reference display only
  importedRcvdContQty: number | null;  // AL raw value — preserved
  confirmedActualQty: number | null;   // Staff-verified quantity
  qtyConfirmedBy: string | null;
  qtyConfirmedAt: string | null;
  qtyCorrectionReason: string | null;

  // Sampling progress
  requiredSamples: number;             // CEILING(confirmedActualQty × 0.10)
  completedSamples: number;
  validSamples: number;

  // Status fields (INDEPENDENT)
  samplingStatus: SamplingStatus;
  focusStatus: FocusStatus;            // FOCUS | NON_FOCUS | PENDING_FOCUS_VERIFICATION
  focusWeek?: string | null;           // e.g. "WK42"
  deliveryStatus: DeliveryStatus;
  workflowStatus: WorkflowStatus;
  isJobClosed?: boolean;
  closedAt?: string;
  shiftType?: string;
  shiftLeaderName?: string;
  reportingToName?: string;
  syncStatus: SyncStatus;
  cnStatus: CNStatus;

  // Approval versioning
  approvalVersion: number;

  // Summary result
  weightResult: WeightResult;

  // Source rows from Excel (for traceability)
  sourceRowIndexes: number[];

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// SP WEIGHT PARSER RESULT
// ─────────────────────────────────────────────────────────────

export interface SpParseResult {
  expression: string | null;       // e.g. "SP10_", "SP1_5_"
  standardWeightKg: number | null;
  status: SpParserStatus;
  patternMatched: string | null;   // Which pattern matched
  rawInput: string;
}

// ─────────────────────────────────────────────────────────────
// MEASUREMENT (one physical basket/carton)
// ─────────────────────────────────────────────────────────────

export interface Measurement {
  id: string;                      // UUID
  samplingGroupId: string;
  apptNbr: string;
  poNbr: string;
  itemId: string;
  sampleNumber: number;            // 1-based
  grossWeightKg: number;
  basketCode: string;              // e.g. "W"
  tareWeightKg: number;            // Snapshot at time of entry
  netWeightKg: number;             // grossWeightKg - tareWeightKg (calculated)
  photoEvidenceId: string | null;
  recordedBy: string;
  recordedAt: string;              // ISO8601
  isValid: boolean;
  syncStatus: SyncStatus;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────
// PHOTO EVIDENCE
// ─────────────────────────────────────────────────────────────

export interface PhotoEvidence {
  id: string;
  measurementId: string;
  samplingGroupId: string;
  sampleNumber: number;
  // Image stored as base64 data URI for offline or blob URL for online
  imageData: string;               // base64 data URI
  mimeType: string;
  fileSizeBytes: number;
  capturedBy: string;
  capturedAt: string;
  syncStatus: SyncStatus;
  driveFileId: string | null;     // Google Drive file ID after sync
  driveUrl: string | null;
}

// ─────────────────────────────────────────────────────────────
// WEIGHT SUMMARY (calculated after all samples complete)
// ─────────────────────────────────────────────────────────────

export interface WeightSummary {
  id: string;
  samplingGroupId: string;
  standardWeightKg: number;        // S per container
  validSampleCount: number;        // N
  actualTotalKg: number;           // SUM(W_i) where W_i = G_i - T_i
  expectedTotalKg: number;         // S × N
  averageNetKg: number;            // actualTotal / N
  minimumKg: number;               // expectedTotal (ขาด ≥0.01 kg ถือว่าผิดเกณฑ์/CN)
  maximumKg: number;               // expectedTotal × 1.10
  differenceKg: number;            // actualTotal - expectedTotal
  differencePercent: number;       // (differenceKg / expectedTotal) × 100
  result: WeightResult;            // PASS | FAIL
  calculatedAt: string;
  calculatedBy: string;
  approvalVersion: number;
}

// ─────────────────────────────────────────────────────────────
// SIGNATURE RECORD
// ─────────────────────────────────────────────────────────────

export interface SignatureRecord {
  id: string;
  samplingGroupId: string;         // For appointment-level signatures, can be 'APPT_' + apptNbr or group id
  apptNbr?: string;                // Appointment number for direct lookup
  approvalVersion: number;
  signerRole: SignerRole;
  signerName: string;
  signerCompany: string | null;    // For Driver/Vendor role
  signatureData: string;           // Base64 PNG of signature strokes
  signedAt: string;
  signedByUserId: string | null;   // For OTM (authenticated)
  coveredItemIds?: string[];       // All ITEMs covered by this signature
  snapshotData?: any;              // Snapshot of weights and CN amounts at signing time
  isValid: boolean;
  syncStatus: SyncStatus;
}

// Approval snapshot — versioned record
export interface ApprovalSnapshot {
  id: string;
  samplingGroupId: string;
  version: number;
  summarySnapshot: WeightSummary;
  signatureIds: string[];
  snapshotAt: string;
  isInvalidated: boolean;
  invalidatedReason: string | null;
  invalidatedAt: string | null;
}

// ─────────────────────────────────────────────────────────────
// CN CASE (Lotus's SRRDC Format)
// CN (kg) = (Standard Weight per Case − Average Actual Net Weight per Case) × Total Actual Received Cases
// ─────────────────────────────────────────────────────────────

export interface CNCase {
  id: string;                          // CN Case ID
  samplingGroupId: string;
  apptNbr: string;                     // Appointment ID
  receiveDate?: string;                // วันที่รับสินค้า
  vendorNbr: string;
  vendorName: string;                  // Vender Name
  poNbr: string;                       // PO Number
  itemId: string;                      // Item Number
  description: string;                 // Item Description
  
  // Lotus's SRRDC Formula Columns
  totalActualCases: number;            // (case) — Total physical confirmed cases (AK confirmed)
  standardWeightKg: number;            // size (Kg) — Standard weight per case
  actualAverageNetKg: number;          // Actual (Kg) — Average sampled net weight per case
  shortagePerCaseKg: number;           // Kg/case — MAX(0, size - actual)
  cnTotalKg: number;                   // CN — Shortage per case * totalActualCases

  failedSummaryId: string;
  weightDifferenceKg: number;
  weightDifferencePercent: number;
  cnStatus: CNStatus;                  // PENDING | IN_PROGRESS | RESOLVED
  recordedBy: string;                  // ผู้บันทึก (Receive staff)
  responsiblePerson: string | null;
  reviewNotes: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// DELIVERY EXCEPTION
// ─────────────────────────────────────────────────────────────

export interface DeliveryException {
  id: string;
  samplingGroupId: string;
  appointmentId: string;
  apptNbr: string;
  vendorNbr: string;
  vendorName: string;
  poNbr: string;
  itemId: string;
  description: string;
  plannedContQty: number | null;     // AK
  importedRcvdContQty: number | null; // AL
  confirmedActualQty: number;
  exceptionType: DeliveryStatus;
  exceptionReason: string;
  reportedBy: string;
  reportedAt: string;
  backOfficeResolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  entityType: string;              // e.g. 'SamplingGroup', 'Measurement'
  entityId: string;
  action: string;                  // e.g. 'QTY_CORRECTION', 'SIGNATURE_ADDED'
  oldValue: string | null;         // JSON string
  newValue: string | null;         // JSON string
  performedBy: string;
  performedAt: string;
  reason: string | null;
  syncStatus: SyncStatus;
}

// ─────────────────────────────────────────────────────────────
// UI STATE TYPES
// ─────────────────────────────────────────────────────────────

export interface SamplingProgress {
  required: number;
  completed: number;
  remaining: number;
  percentage: number;
}

export interface DashboardFilter {
  status?: SamplingStatus | 'ALL' | 'รอ OTM' | 'ส่งไม่ครบ' | 'ของไม่มา' | 'รอหลังบ้านเคลียร์';
  date?: string;
  search?: string;
}

export interface AppointmentSummary extends Appointment {
  vendors: AppointmentVendor[];
  samplingProgress: SamplingProgress;
  hasDeliveryException: boolean;
  hasUnresolvedItems: boolean;
  overdueExceptions: boolean;
}
