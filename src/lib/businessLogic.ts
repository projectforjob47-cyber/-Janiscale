// ============================================================
// SMART DC — Business Logic Engine
// All confirmed business rules implemented here
// ============================================================

import { SpParseResult, WeightSummary, SamplingGroup } from '../types';

// ─────────────────────────────────────────────────────────────
// 1. SP WEIGHT PARSER
// ─────────────────────────────────────────────────────────────
// Supported patterns:
//   SP<N>_<desc>       → Standard weight = N kg
//   SP<N1>_<N2>_<desc> → Standard weight = N1 × N2 kg (multiplication)
//
// Examples:
//   "SP10_พีเอฟพีฟองเต้าห"   → 10 kg
//   "SP25_วอลล์ท็อป"         → 25 kg
//   "SP1_5_โครงไก่"          → 1 × 5 = 5 kg

export function parseStandardWeight(description: string): SpParseResult {
  const raw = description.trim();

  // If item is an SP1 prepack with retail weight, it is not a valid catch weight sampling item
  if (isSp1Prepack(raw)) {
    return {
      expression: 'SP1_PREPACK',
      standardWeightKg: null,
      status: 'FAILED',
      patternMatched: 'SP1 Prepack (Excluded from sampling)',
      rawInput: raw,
    };
  }

  // Pattern 2 first: SP<N1>_<N2>_ (multiplication, e.g. SP2_5_ = 10kg)
  // Must be SP followed by int >= 2, underscore, int, underscore
  const multiPattern = /^SP([2-9]\d*)_(\d+)_/i;
  const multiMatch = raw.match(multiPattern);
  if (multiMatch) {
    const n1 = parseInt(multiMatch[1], 10);
    const n2 = parseInt(multiMatch[2], 10);
    const weight = n1 * n2;
    return {
      expression: multiMatch[0],
      standardWeightKg: weight,
      status: 'PARSED',
      patternMatched: 'SP<N1>_<N2>_ (multiplication)',
      rawInput: raw,
    };
  }

  // Pattern 1: SP<N>_<desc>
  const simplePattern = /^SP(\d+)_/i;
  const simpleMatch = raw.match(simplePattern);
  if (simpleMatch) {
    const n = parseInt(simpleMatch[1], 10);
    return {
      expression: simpleMatch[0],
      standardWeightKg: n,
      status: 'PARSED',
      patternMatched: 'SP<N>_ (simple)',
      rawInput: raw,
    };
  }

  // No match — requires Supervisor override
  return {
    expression: null,
    standardWeightKg: null,
    status: 'FAILED',
    patternMatched: null,
    rawInput: raw,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. SAMPLING QUANTITY CALCULATION
// ─────────────────────────────────────────────────────────────
// RequiredSamples = CEILING(confirmedActualContainers × 0.10)
// Minimum: 1 sample if containers > 0
// Zero containers → exception workflow, NOT sampling

export function calculateRequiredSamples(confirmedQty: number): number {
  if (confirmedQty <= 0) return 0;
  const raw = confirmedQty * 0.10;
  return Math.ceil(raw);
}

// Test vectors from specification
const SAMPLING_TEST_CASES = [
  { containers: 10, expected: 1 },
  { containers: 11, expected: 2 },
  { containers: 20, expected: 2 },
  { containers: 55, expected: 6 },
  { containers: 125, expected: 13 },
];

export function validateSamplingCalculations(): boolean {
  return SAMPLING_TEST_CASES.every(tc =>
    calculateRequiredSamples(tc.containers) === tc.expected
  );
}

// ─────────────────────────────────────────────────────────────
// 3. NET WEIGHT CALCULATION
// ─────────────────────────────────────────────────────────────
// NET_WEIGHT = GROSS_WEIGHT - TARE_WEIGHT
// Validate: net must be positive

export function calculateNetWeight(grossKg: number, tareKg: number): number {
  // Use precise decimal arithmetic to avoid floating point errors
  const net = Math.round((grossKg - tareKg) * 1000) / 1000;
  return net;
}

export function isValidNetWeight(netKg: number): boolean {
  return netKg > 0;
}

// ─────────────────────────────────────────────────────────────
// 4. WEIGHT SUMMARY CALCULATIONS
// ─────────────────────────────────────────────────────────────
// ExpectedTotal = S × N
// ActualTotal   = SUM(W_i)
// Minimum = ExpectedTotal (ไม่มีหย่อน -10% สำหรับน้ำหนักขาด แค่น้อยกว่า 0.01 kg ถือว่า CN และผิดเกณฑ์ทันที)
// Maximum = ExpectedTotal × 1.10 (เพดานน้ำหนักเกินไม่เกิน +10%)
// PASS: ขาดไม่เกิน 0.01 kg (differenceKg > -0.01) และ ActualTotal ≤ Maximum

export interface SummaryInput {
  standardWeightKg: number;        // S
  netWeights: number[];            // W_i for each valid sample
  samplingGroupId: string;
  calculatedBy: string;
  approvalVersion: number;
}

export function calculateWeightSummary(input: SummaryInput): Omit<WeightSummary, 'id'> {
  const { standardWeightKg, netWeights, samplingGroupId, calculatedBy, approvalVersion } = input;
  const N = netWeights.length;

  const actualTotal = Math.round(netWeights.reduce((sum, w) => sum + w, 0) * 1000) / 1000;
  const expectedTotal = Math.round(standardWeightKg * N * 1000) / 1000;
  const averageNet = N > 0 ? Math.round((actualTotal / N) * 1000) / 1000 : 0;
  // เกณฑ์ขั้นต่ำคือน้ำหนักมาตรฐาน ขาดไม่ได้ (แค่น้อยกว่า 0.01 kg ถือว่า CN และผิดเกณฑ์)
  const minimum = expectedTotal;
  const maximum = Math.round(expectedTotal * 1.10 * 1000) / 1000;
  const differenceKg = Math.round((actualTotal - expectedTotal) * 1000) / 1000;
  const differencePercent = expectedTotal !== 0
    ? Math.round((differenceKg / expectedTotal) * 100 * 100) / 100
    : 0;

  // กฎใหม่: แค่น้อยกว่า 0.01 kg (differenceKg <= -0.01) ก็ถือว่า CN แล้ว ผิดเกณฑ์แล้ว
  // เพดานสูงสุด: actualTotal > maximum (+10%) ถือว่าเกินเกณฑ์
  const isUnderweight = differenceKg <= -0.01;
  const isOverweight = actualTotal > maximum;

  const result: WeightSummary['result'] =
    N === 0
      ? 'INCOMPLETE'
      : (!isUnderweight && !isOverweight)
        ? 'PASS'
        : 'FAIL';

  return {
    samplingGroupId,
    standardWeightKg,
    validSampleCount: N,
    actualTotalKg: actualTotal,
    expectedTotalKg: expectedTotal,
    averageNetKg: averageNet,
    minimumKg: minimum,
    maximumKg: maximum,
    differenceKg,
    differencePercent,
    result,
    calculatedAt: new Date().toISOString(),
    calculatedBy,
    approvalVersion,
  };
}

// ─────────────────────────────────────────────────────────────
// 4.1. LOTUS'S SRRDC CN FORMULA
// ─────────────────────────────────────────────────────────────
// CN (kg) = (Standard Weight per Case − Average Actual Net Weight per Case) × Total Actual Received Cases
// Shortage per Case = MAX(0, Standard Weight − Average Actual Net Weight)
// CN (kg) = Shortage per Case × Total Actual Received Cases
// กฎใหม่: แค่น้อยกว่า 0.01 kg (shortagePerCaseKg >= 0.01) ก็ถือว่า CN แล้ว ผิดเกณฑ์แล้ว

export interface CNCalculationResult {
  isEligibleForCN: boolean;
  totalActualCases: number;      // (case)
  standardWeightKg: number;      // size (Kg)
  actualAverageNetKg: number;    // Actual (Kg)
  shortagePerCaseKg: number;     // Kg/case
  cnTotalKg: number;             // CN
}

export function calculateCN(
  standardWeightKg: number,
  actualAverageNetKg: number,
  totalActualCases: number
): CNCalculationResult {
  const shortageRaw = standardWeightKg - actualAverageNetKg;
  // ปัดทศนิยม 3 ตำแหน่ง: ขาดตั้งแต่ 0.005 kg ขึ้นไป ปัดเป็น 0.01 kg
  const shortagePerCaseKg = shortageRaw >= 0.005 ? Math.round(shortageRaw * 1000) / 1000 : 0;
  const cnTotalKg = Math.round(shortagePerCaseKg * totalActualCases * 100) / 100;
  // แค่น้อยกว่า 0.01 kg ก็ถือว่า CN แล้ว ผิดเกณฑ์แล้ว
  const isEligibleForCN = shortagePerCaseKg >= 0.01 && cnTotalKg > 0;

  return {
    isEligibleForCN,
    totalActualCases,
    standardWeightKg,
    actualAverageNetKg,
    shortagePerCaseKg,
    cnTotalKg,
  };
}

// ─────────────────────────────────────────────────────────────
// 5. SAMPLING STATUS DERIVATION
// ─────────────────────────────────────────────────────────────

export function deriveSamplingStatus(
  group: Pick<SamplingGroup,
    'requiredSamples' | 'completedSamples' | 'standardWeightKg' | 'spParserStatus'
  >,
  summaryResult: WeightSummary['result'] | null
): SamplingGroup['samplingStatus'] {
  if (group.completedSamples < group.requiredSamples) {
    return 'รอชั่ง';
  }
  if (summaryResult === 'PASS') {
    return 'ชั่งครบ';
  }
  if (summaryResult === 'FAIL') {
    return 'ผิดเกณฑ์';
  }
  return 'รอชั่ง';
}

// ─────────────────────────────────────────────────────────────
// 6. FINALIZATION ELIGIBILITY CHECK
// ─────────────────────────────────────────────────────────────

export interface FinalizationCheck {
  eligible: boolean;
  blockers: string[];
}

export function checkFinalizationEligibility(
  group: SamplingGroup,
  summary: WeightSummary | null,
  signatures: { signerRole: string; isValid: boolean }[],
  hasPendingPhotos: boolean,
  approvalVersion: number
): FinalizationCheck {
  const blockers: string[] = [];

  // 1. Sampling complete
  if (group.completedSamples < group.requiredSamples) {
    blockers.push(`ยังชั่งไม่ครบ (${group.completedSamples}/${group.requiredSamples} ตัวอย่าง)`);
  }

  // 2. Standard weight resolved
  if (group.standardWeightKg === null) {
    blockers.push('น้ำหนักมาตรฐานยังไม่ได้รับการยืนยัน (รอผู้ดูแลระบบอนุมัติ)');
  }

  // 3. Summary calculated
  if (!summary) {
    blockers.push('ยังไม่ได้คำนวณสรุปน้ำหนัก');
  }

  // 4. No pending photos
  if (hasPendingPhotos) {
    blockers.push('มีรูปถ่ายที่ยังไม่ได้ sync');
  }

  // 5. Signatures validation based on Focus status (V3.0 rules)
  // Non-Focus: Vendor -> Receive -> OTM (Total: 3)
  // Focus: Vendor -> Receive -> LP&S -> OTM (Total: 4)
  // QC is completely removed.
  const isFocus = group.focusStatus === 'FOCUS';
  const requiredRoles: string[] = isFocus 
    ? ['VENDOR', 'RECEIVE', 'LPS', 'OTM'] 
    : ['VENDOR', 'RECEIVE', 'OTM'];

  const validSigs = signatures.filter(s => s.isValid);
  const signedRoles = validSigs.map(s => s.signerRole);

  // Check mandatory order
  if (!signedRoles.includes('VENDOR')) {
    blockers.push('ยังขาดลายเซ็นตัวแทนผู้ขาย (Vendor)');
  } else if (!signedRoles.includes('RECEIVE')) {
    blockers.push('ยังขาดลายเซ็นพนักงานรับสินค้า (Receive)');
  } else if (isFocus && !signedRoles.includes('LPS')) {
    blockers.push('สินค้า Focus: ยังขาดลายเซ็นผู้ตรวจสอบ LP&S');
  } else if (!signedRoles.includes('OTM')) {
    blockers.push('ยังไม่ได้รับการอนุมัติจาก OTM');
  }

  return {
    eligible: blockers.length === 0,
    blockers,
  };
}

// ─────────────────────────────────────────────────────────────
// 7. PROGRESS CALCULATION
// ─────────────────────────────────────────────────────────────

export function calculateProgress(required: number, completed: number) {
  return {
    required,
    completed,
    remaining: Math.max(0, required - completed),
    percentage: required > 0 ? Math.round((completed / required) * 100) : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// 8. SIGNATURE PROGRESS
// ─────────────────────────────────────────────────────────────

export function getSignatureProgress(
  signatures: { signerRole: string; isValid: boolean }[],
  isFocus: boolean = false
): { count: number; total: number; label: string; roles: string[] } {
  const validSigs = signatures.filter(s => s.isValid);
  const count = validSigs.length;
  const total = isFocus ? 4 : 3;
  const roles = validSigs.map(s => s.signerRole);

  let label = `${count}/${total}`;
  if (count >= total) {
    label = `${total}/${total} — อนุมัติครบถ้วน`;
  } else if (!roles.includes('OTM') && count === total - 1) {
    label = `${count}/${total} — รอ OTM อนุมัติ`;
  }

  return { count, total, label, roles };
}

// ─────────────────────────────────────────────────────────────
// 9. CATCH_WEIGHT FILTER & SAMPLING ELIGIBILITY
// ─────────────────────────────────────────────────────────────

export function isCatchWeight(itemClass: string): boolean {
  return itemClass?.trim().toUpperCase() === 'CATCH_WEIGHT';
}

/**
 * Check if a row belongs to Frozen work (FZ21 or FZ)
 * Requirement: งาน FZ21 และ FZ ไม่ต้องนำไปชั่ง ต่อให้เป็น CATCH_WEIGHT ก็ไม่ต้องเอาไปชั่ง
 */
export function isFrozenJob(uda7?: string | null, ups?: string | null, loadType?: string | null): boolean {
  const u7 = (uda7 ?? '').trim().toUpperCase();
  const up = (ups ?? '').trim().toUpperCase();
  const lt = (loadType ?? '').trim().toUpperCase();

  if (u7 === 'FZ21' || u7 === 'FZ' || u7.includes('FZ21') || u7.startsWith('FZ')) return true;
  if (up === 'FZ' || up.includes('FZ') || up.startsWith('FZ')) return true;
  if (lt === 'FZ' || lt === 'FROZEN') return true;

  return false;
}

/**
 * Check if item is an SP1 prepack with retail weight
 * Requirement: SP1_2KG, SP1_2_, SP1_6 หรือ SP1_ และตามด้วยน้ำหนัก ไม่ต้องเอาไปชั่ง
 */
export function isSp1Prepack(description?: string | null): boolean {
  if (!description) return false;
  return /\bSP1[_\.]\s*\d+/i.test(description.trim());
}

/**
 * Check if an item row qualifies for CATCH_WEIGHT sampling & weighing
 * Both FZ/FZ21 and SP1 retail weight prepacks are strictly excluded.
 */
export function isSamplingCatchWeight(row: {
  itemClass?: string | null;
  description?: string | null;
  uda7?: string | null;
  ups?: string | null;
  loadType?: string | null;
}): boolean {
  if (!isCatchWeight(row.itemClass || '')) return false;
  if (isFrozenJob(row.uda7, row.ups, row.loadType)) return false;
  if (isSp1Prepack(row.description)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// 10. DECIMAL-SAFE NUMBER PARSING
// ─────────────────────────────────────────────────────────────

export function safeParseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

export function formatWeight(kg: number | null): string {
  if (kg === null || kg === undefined) return '—';
  return kg.toFixed(3) + ' kg';
}

export function formatPercent(pct: number | null): string {
  if (pct === null || pct === undefined) return '—';
  const sign = pct > 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

// ─────────────────────────────────────────────────────────────
// 11. CONTAINER & CLASSIFIER NOUN (UDA6 MAPPING)
// ─────────────────────────────────────────────────────────────

export const ALLOWED_CONTAINER_CODES = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'] as const;

export function isValidContainerCode(code?: string | null): boolean {
  if (!code) return false;
  return ALLOWED_CONTAINER_CODES.includes(code.trim().toUpperCase() as any);
}

export function isManualTareContainer(code?: string | null): boolean {
  return String(code).trim().toUpperCase() === 'O';
}

/**
 * Returns classifier noun (ลักษณะนาม) based on UDA6 / Container Type:
 * Baskets (ZN, Z, W, X, F, Y, YN, SF, XN) -> ตะกร้า
 * O -> หน่วย (กล่อง/กระสอบ)
 */
export function getContainerNoun(code?: string | null): string {
  if (!code) return 'หน่วย';
  const upper = String(code).trim().toUpperCase();
  if (upper === 'O') return 'หน่วย';
  return 'ตะกร้า';
}
