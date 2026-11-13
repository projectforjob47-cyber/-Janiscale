// ============================================================
// SMART DC — ExcelViewerPage Component
// V3.0 Final Master Design: Excel & Google Sheet Hub
// Live Interactive Spreadsheet Grid + Cloud Sync Links
// ============================================================

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  ExternalLink,
  Download,
  FolderOpen,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Filter,
  RefreshCw,
  Sparkles,
  Layers,
  Building2,
  Scale,
  Calendar,
  X,
} from 'lucide-react';
import { db } from '../lib/database';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import type { SignatureRecord, SamplingGroup, Measurement } from '../types';
import seedRows from '../lib/seedData.json';
import { 
  extractDateFromApptTime, 
  formatApptTime, 
  formatThaiDate 
} from '../lib/dateUtils';

// Seed reference map for instant metadata lookup (fallback for demo / existing data)
const SEED_APPT_INFO = new Map<string, { apptTime: string; carrierCode: string; vendorName: string }>();
(seedRows as any[]).forEach(r => {
  if (r.apptNbr && !SEED_APPT_INFO.has(r.apptNbr)) {
    SEED_APPT_INFO.set(r.apptNbr, {
      apptTime: r.apptTime || '12-10-2026_01:00:00',
      carrierCode: r.carrierCode || 'VN',
      vendorName: r.vendorName || '',
    });
  }
});

export function getApptTimeForGroup(g: SamplingGroup, apptMap: Map<string, any>): string | null {
  const appt = apptMap.get(g.apptNbr);
  if (appt?.apptTime) return appt.apptTime;
  const seed = SEED_APPT_INFO.get(g.apptNbr);
  if (seed?.apptTime) return seed.apptTime;
  return null;
}

export function getCarrierForGroup(g: SamplingGroup, appt?: any): string {
  if (g.carrierCode && g.carrierCode !== '-') return g.carrierCode;
  if (appt?.carrierCode && appt.carrierCode !== '-') return appt.carrierCode;
  const seed = SEED_APPT_INFO.get(g.apptNbr);
  if (seed?.carrierCode) return seed.carrierCode;
  return '-';
}

// Helper to parse appointment time into minutes since midnight for strict chronological sorting
function parseApptTimeMinutes(rawTime?: string | null): number {
  if (!rawTime) return 9999;
  const str = String(rawTime).trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return 9999;
}

// Option 1 Comparator:
// 1. Date (earliest date first)
// 2. Appt Time (earliest appointment time first: 00:01 before 00:30 before 01:00...)
// 3. Appointment Number (groups rows of same appointment together)
// 4. PO Number (groups rows of same PO together)
// 5. Item ID
function compareSamplingRows(a: SamplingGroup, b: SamplingGroup, apptMap: Map<string, any>): number {
  const apptA = apptMap.get(a.apptNbr);
  const apptB = apptMap.get(b.apptNbr);

  const timeAStr = getApptTimeForGroup(a, apptMap);
  const timeBStr = getApptTimeForGroup(b, apptMap);

  // 1. Date (authoritative from Excel file first)
  const dateA = (extractDateFromApptTime(timeAStr) || apptA?.receiveDate || '').trim();
  const dateB = (extractDateFromApptTime(timeBStr) || apptB?.receiveDate || '').trim();
  if (dateA && dateB && dateA !== dateB) {
    return dateA.localeCompare(dateB);
  }

  // 2. Appt Time (earliest appointment time first)
  const timeA = parseApptTimeMinutes(timeAStr);
  const timeB = parseApptTimeMinutes(timeBStr);
  if (timeA !== timeB) {
    return timeA - timeB;
  }

  // 3. Group by Appointment Number
  const apptDiff = (a.apptNbr || '').localeCompare(b.apptNbr || '');
  if (apptDiff !== 0) {
    return apptDiff;
  }

  // 4. Group by PO Number
  const poDiff = (a.poNbr || '').localeCompare(b.poNbr || '');
  if (poDiff !== 0) {
    return poDiff;
  }

  // 5. Item ID
  return (a.itemId || '').localeCompare(b.itemId || '');
}

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Wy_87lecXrgs8N_D5E-XbNMmjiKd0K8jYZKrLAx7d1M/edit?gid=0#gid=0';
const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/folders/17E0KXEV23g8IiOliclyB_P1zL_57_1dE';

export default function ExcelViewerPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const isAdminOrSupervisor = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'WAITING' | 'IN_PROGRESS' | 'DONE' | 'FAIL' | 'FOCUS'>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Live queries from Dexie DB
  const samplingGroups = useLiveQuery(async () => {
    return await db.samplingGroups.toArray();
  }, []) || [];

  const appointments = useLiveQuery(async () => {
    return await db.appointments.toArray();
  }, []) || [];

  const measurements = useLiveQuery(async () => {
    return await db.measurements.toArray();
  }, []) || [];

  const signatures: SignatureRecord[] = useLiveQuery(async () => {
    return await db.signatureRecords.toArray();
  }, []) || [];

  const cnCases = useLiveQuery(async () => {
    return await db.cnCases.toArray();
  }, []) || [];

  const vendors = useLiveQuery(async () => {
    return await db.appointmentVendors.toArray();
  }, []) || [];

  // Map vendors by appointment number for reliable lookup
  const vendorsByAppt = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of vendors) {
      if (!v.apptNbr) continue;
      const list = map.get(v.apptNbr) || [];
      if (v.vendorName) list.push(v.vendorName);
      if (v.vendorNbr) list.push(v.vendorNbr);
      map.set(v.apptNbr, list);
    }
    return map;
  }, [vendors]);

  // Map appointments for quick lookup
  const apptMap = useMemo(() => {
    const map = new Map<string, any>();
    appointments.forEach(a => map.set(a.apptNbr, a));
    return map;
  }, [appointments]);

  // Map appointment progress to track in-progress appointments (ใบนัดหมายที่กำลังดำเนินการอยู่)
  const apptProgressMap = useMemo(() => {
    const map = new Map<string, { hasStarted: boolean; isAllDone: boolean; isInProgress: boolean; total: number; completed: number }>();
    
    // Group sampling groups by apptNbr
    const apptGroupsMap = new Map<string, typeof samplingGroups>();
    for (const g of samplingGroups) {
      const list = apptGroupsMap.get(g.apptNbr) || [];
      list.push(g);
      apptGroupsMap.set(g.apptNbr, list);
    }

    for (const [apptNbr, items] of apptGroupsMap.entries()) {
      const appt = appointments.find(a => a.apptNbr === apptNbr);
      const total = items.length;

      const startedCount = items.filter(g => {
        const comp = g.completedSamples ?? 0;
        return comp > 0 || g.workflowStatus === 'SAMPLING' || g.samplingStatus === 'ชั่งครบ' || g.samplingStatus === 'ผิดเกณฑ์';
      }).length;

      // สถานะ ชั่งครบแล้ว: ต้องเป็นกรณีที่ปิดงานแล้วเท่านั้น
      // ตราบใดที่ยังไม่ปิดงาน จะยังคงขึ้นสถานะ "ดำเนินการอยู่"
      const isClosed = Boolean(appt?.isJobClosed || appt?.closedAt);

      const hasStarted = startedCount > 0;
      const isDone = isClosed; // ชั่งครบแล้ว = ปิดงานแล้ว
      const isInProgress = hasStarted && !isDone;

      map.set(apptNbr, { hasStarted, isAllDone: isDone, isInProgress, total, completed: startedCount });
    }

    return map;
  }, [appointments, samplingGroups]);

  // Helper for 4 sampling statuses:
  // 🟠 รอชั่ง | 🔵 กำลังชั่ง | 🟢 ชั่งครบแล้ว | 🔴 ผิดเกณฑ์ (CN)
  const getSamplingStatusInfo = (g: any) => {
    if (g.samplingStatus === 'ผิดเกณฑ์' || g.cnStatus === 'PENDING' || g.cnStatus === 'IN_PROGRESS' || g.cnStatus === 'RESOLVED') {
      return {
        label: 'ผิดเกณฑ์ (CN)',
        badgeClass: 'bg-[#FDE8E8] text-[#E03131] border-[#F8B4B4]',
        dotClass: 'bg-[#E03131]',
        type: 'FAIL',
      };
    }
    if (g.samplingStatus === 'ไม่มาตามแผน' || g.samplingStatus === 'ไม่มาส่ง' || g.confirmedActualQty === 0) {
      return {
        label: 'ไม่มาตามแผน',
        badgeClass: 'bg-[#FFF0E6] text-[#D9480F] border-[#FFD8BF]',
        dotClass: 'bg-[#D9480F]',
        type: 'DONE',
      };
    }
    const completed = g.completedSamples ?? 0;
    const required = g.requiredSamples ?? 0;
    if (g.samplingStatus === 'ชั่งครบ' || (required > 0 && completed >= required)) {
      return {
        label: 'ชั่งครบแล้ว',
        badgeClass: 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]',
        dotClass: 'bg-[#12803C]',
        type: 'DONE',
      };
    }
    if (completed > 0 || g.workflowStatus === 'SAMPLING') {
      return {
        label: 'กำลังชั่ง',
        badgeClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
        dotClass: 'bg-[#2563EB]',
        type: 'IN_PROGRESS',
      };
    }
    return {
      label: 'รอชั่ง',
      badgeClass: 'bg-[#FEF9E7] text-[#B45309] border-[#FDE68A]',
      dotClass: 'bg-[#E67700]',
      type: 'WAITING',
    };
  };

  // Helper for approval/completion result (ผลการปิดงาน):
  // ปิดงานแล้ว | ชั่งครบ | -
  const getApprovalStatusInfo = (g: any) => {
    const isApproved = 
      g.isJobClosed ||
      g.workflowStatus === 'FULLY_SIGNED' || 
      g.workflowStatus === 'FINALIZED' ||
      signatures.some(s => (s.samplingGroupId === g.id || s.apptNbr === g.apptNbr) && s.signerRole === 'RECEIVE');

    if (isApproved) {
      return {
        label: 'ปิดงานแล้ว',
        badgeClass: 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]',
        type: 'APPROVED',
      };
    }

    const completed = g.completedSamples ?? 0;
    const required = g.requiredSamples ?? 0;
    const isSamplingDone = g.samplingStatus === 'ชั่งครบ' || g.samplingStatus === 'ผิดเกณฑ์' || (required > 0 && completed >= required);

    if (isSamplingDone) {
      return {
        label: 'ชั่งครบ',
        badgeClass: 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]',
        type: 'DONE',
      };
    }

    return {
      label: '-',
      badgeClass: 'text-[#8C8C8C]',
      type: 'NONE',
    };
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    const rawSearch = (searchTerm || '').trim().toLowerCase();
    const searchTokens = rawSearch.split(/\s+/).filter(Boolean);

    const filtered = samplingGroups.filter(g => {
      const appt = apptMap.get(g.apptNbr);

      if (searchTokens.length > 0) {
        const apptVendorList = vendorsByAppt.get(g.apptNbr) || [];
        const searchableFields = [
          g.apptNbr,
          g.poNbr,
          g.vendorName,
          g.vendorNbr,
          g.itemId,
          g.description,
          g.spExpression,
          g.carrierCode,
          appt?.carrierCode,
          ...apptVendorList
        ]
          .filter(Boolean)
          .map(v => String(v).toLowerCase());

        const combinedText = searchableFields.join(' ');
        // Every token typed by the user must match at least one field
        const matchSearch = searchTokens.every(token => combinedText.includes(token));
        if (!matchSearch) return false;
      }

      // Subtle Date Search for Audit
      if (selectedDate) {
        const matchesDate = 
          appt?.receiveDate === selectedDate ||
          g.createdAt?.startsWith(selectedDate) ||
          g.updatedAt?.startsWith(selectedDate);
        if (!matchesDate) return false;
      }

      const sampType = getSamplingStatusInfo(g).type;
      const appType = getApprovalStatusInfo(g).type;

      if (filterTab === 'WAITING') {
        const p = apptProgressMap.get(g.apptNbr);
        return !p?.hasStarted && !p?.isAllDone;
      }
      if (filterTab === 'IN_PROGRESS') {
        // ตราบใดที่ Appointment นั้นยังไม่ปิดงาน ก็จะขึ้น "ดำเนินการอยู่" ทั้งหมด (รวมทั้งที่ชั่งแล้วและยังไม่ชั่ง)
        return Boolean(apptProgressMap.get(g.apptNbr)?.isInProgress);
      }
      if (filterTab === 'DONE') {
        // ถ้าปิดงานแล้ว จึงค่อยขึ้น "ชั่งครบแล้ว" (นับรวมทุกรายการทั้งผ่านเกณฑ์และผิดเกณฑ์ CN)
        return Boolean(apptProgressMap.get(g.apptNbr)?.isAllDone);
      }
      if (filterTab === 'FAIL') return sampType === 'FAIL';
      if (filterTab === 'FOCUS') return g.focusStatus === 'FOCUS';

      return true;
    });

    // Option 1: Sort by Appt Time -> Appt No -> PO -> Item
    return filtered.sort((a, b) => compareSamplingRows(a, b, apptMap));
  }, [samplingGroups, apptMap, searchTerm, selectedDate, filterTab, signatures, apptProgressMap, vendorsByAppt]);

  // Excel Export Handler
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Load basket master from database for accurate tare weights
      const masterBaskets = await db.basketMaster.toArray().catch(() => []);
      const basketWeightMap = new Map<string, number>();
      masterBaskets.forEach(b => {
        if (b.code) basketWeightMap.set(b.code.trim().toUpperCase(), b.tareWeightKg);
      });
      const FALLBACK_BASKET_WEIGHTS: Record<string, number> = {
        ZN: 2.20, Z: 2.20, W: 0.85, X: 0.60, F: 2.40, Y: 1.40, YN: 1.37, SF: 2.40, XN: 0.50
      };

      const resolveTareWeight = (containerTypeStr: string, groupMs: Measurement[], defaultTare?: number | null) => {
        const cType = containerTypeStr.trim().toUpperCase();
        const isBasketO = cType === 'O' || groupMs.some(m => m.basketCode === 'O');
        if (isBasketO) {
          const recO = groupMs.find(m => m.basketCode === 'O' && m.tareWeightKg !== undefined && m.tareWeightKg !== null);
          return Number((recO?.tareWeightKg ?? defaultTare ?? 0).toFixed(2));
        } else {
          if (groupMs.length > 0 && groupMs[0].tareWeightKg) {
            return Number(groupMs[0].tareWeightKg.toFixed(2));
          } else if (basketWeightMap.has(cType)) {
            return Number(basketWeightMap.get(cType)!.toFixed(2));
          } else if (FALLBACK_BASKET_WEIGHTS[cType] !== undefined) {
            return Number(FALLBACK_BASKET_WEIGHTS[cType].toFixed(2));
          } else if (defaultTare) {
            return Number(defaultTare.toFixed(2));
          } else {
            return 0.60;
          }
        }
      };

      // 1. All items (สรุปผลการชั่ง) - sorted by Option 1
      const sortedGroups = [...samplingGroups].sort((a, b) => compareSamplingRows(a, b, apptMap));
      const summaryRows = sortedGroups.map((g, idx) => {
        const appt = apptMap.get(g.apptNbr);
        const rawTime = getApptTimeForGroup(g, apptMap);
        const carrier = getCarrierForGroup(g, appt);
        const vendor = appt?.vendorName || g.vendorName || SEED_APPT_INFO.get(g.apptNbr)?.vendorName || g.vendorNbr;
        const groupSigs = signatures.filter(s => s.samplingGroupId === g.id);
        const hasVendor = groupSigs.some(s => s.signerRole === 'VENDOR');
        const hasReceive = groupSigs.some(s => s.signerRole === 'RECEIVE');
        const hasLps = groupSigs.some(s => s.signerRole === 'LPS');
        const hasOtm = groupSigs.some(s => s.signerRole === 'OTM');

        const groupMs = measurements.filter(m => m.samplingGroupId === g.id);
        const containerType = g.containerType || g.defaultBasketCode || '-';
        const tarePerBasket = resolveTareWeight(containerType, groupMs, g.defaultTareWeightKg);

        return {
          'ลำดับ': idx + 1,
          'เลขใบนัดหมาย': g.apptNbr,
          'รอบเวลา': rawTime ? formatApptTime(rawTime) : '-',
          'สายรถ': carrier,
          'ผู้ขาย': vendor,
          'เลขที่ PO': g.poNbr,
          'รหัสสินค้า (SKU)': g.itemId,
          'ชื่อสินค้า': g.description,
          'ชนิดตะกร้า': containerType,
          'น้ำหนักภาชนะ (กก.)': tarePerBasket,
          'ประเภท': g.focusStatus === 'FOCUS' ? 'FOCUS (สินค้าโฟกัส)' : 'ทั่วไป',
          'เกณฑ์มาตรฐาน (SP)': g.spExpression || '-',
          'น้ำหนักมาตรฐาน (กก.)': g.standardWeightKg || 0,
          'จำนวนรับจริง (กล่อง)': g.confirmedActualQty ?? g.apptContQty ?? 0,
          'เกณฑ์สุ่ม 10% (ตัวอย่าง)': g.requiredSamples,
          'ผลสุ่มชั่ง': getSamplingStatusInfo(g).label,
          'ผลการอนุมัติ': getApprovalStatusInfo(g).label,
          'เซ็นต์ผู้ขาย': hasVendor ? 'ครบ' : 'รอ',
          'เซ็นต์ Receive': hasReceive ? 'ครบ' : 'รอ',
          'เซ็นต์ LP&S': g.focusStatus === 'FOCUS' ? (hasLps ? 'ครบ' : 'รอ') : 'ไม่ระบุ',
          'อนุมัติ OTM': hasOtm ? 'อนุมัติแล้ว' : 'รออนุมัติ',
          'วันที่อัปเดต': new Date(g.updatedAt).toLocaleString('th-TH'),
        };
      });

      // 2. Weighed items ONLY (ชั่งแล้ว - อัปเดตเรียลไทม์)
      const weighedGroups = samplingGroups.filter(g => 
        g.samplingStatus === 'ชั่งครบ' || 
        g.samplingStatus === 'ผิดเกณฑ์' || 
        (g.completedSamples != null && g.completedSamples > 0)
      );

      const weighedRows = weighedGroups.map((g, idx) => {
        const appt = apptMap.get(g.apptNbr);
        const groupSigs = signatures.filter(s => s.samplingGroupId === g.id);
        const hasVendor = groupSigs.some(s => s.signerRole === 'VENDOR');
        const hasReceive = groupSigs.some(s => s.signerRole === 'RECEIVE');
        const hasLps = groupSigs.some(s => s.signerRole === 'LPS');
        const hasOtm = groupSigs.some(s => s.signerRole === 'OTM');

        // Measurement aggregates
        const groupMeasurements = measurements.filter(m => m.samplingGroupId === g.id);
        const totalNetKg = groupMeasurements.reduce((sum, m) => sum + (m.netWeightKg || 0), 0);
        const actualCount = groupMeasurements.length || g.completedSamples || 0;
        const avgNetKg = groupMeasurements.length > 0 ? (totalNetKg / groupMeasurements.length) : (g.standardWeightKg || 0);
        const stdKg = g.standardWeightKg || 0;
        const diffKg = stdKg > 0 ? (avgNetKg - stdKg) : 0;
        const diffPct = stdKg > 0 ? ((diffKg / stdKg) * 100) : 0;

        const containerType = g.containerType || g.defaultBasketCode || '-';
        const tarePerBasket = resolveTareWeight(containerType, groupMeasurements, g.defaultTareWeightKg);

        return {
          'ลำดับ': idx + 1,
          'เลขใบนัดหมาย': g.apptNbr,
          'สายรถ': appt?.carrierCode || '-',
          'ผู้ขาย': appt?.vendorName || g.vendorNbr,
          'เลขที่ PO': g.poNbr,
          'รหัสสินค้า (SKU)': g.itemId,
          'ชื่อสินค้า': g.description,
          'ชนิดตะกร้า': containerType,
          'น้ำหนักภาชนะ (กก.)': tarePerBasket,
          'ประเภท': g.focusStatus === 'FOCUS' ? 'FOCUS (สินค้าโฟกัส)' : 'ทั่วไป',
          'เกณฑ์มาตรฐาน (SP)': g.spExpression || '-',
          'น้ำหนักมาตรฐาน (กก.)': stdKg,
          'จำนวนรับจริง (กล่อง)': g.confirmedActualQty ?? g.apptContQty ?? 0,
          'เกณฑ์สุ่ม 10% (ตัวอย่าง)': g.requiredSamples,
          'จำนวนที่ชั่งแล้ว (ตัวอย่าง)': actualCount,
          'น้ำหนักสุทธิรวมที่ชั่ง (กก.)': Number(totalNetKg.toFixed(2)),
          'น้ำหนักสุทธิเฉลี่ย (กก./กล่อง)': Number(avgNetKg.toFixed(2)),
          'ผลต่างเฉลี่ย (กก.)': Number(diffKg.toFixed(2)),
          'ผลต่าง (%)': stdKg > 0 ? `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(2)}%` : '0%',
          'ผลสุ่มชั่ง': getSamplingStatusInfo(g).label,
          'ผลตรวจน้ำหนัก': g.samplingStatus === 'ผิดเกณฑ์' ? '❌ ผิดเกณฑ์ (หลุดสเปก)' : '✅ ผ่านเกณฑ์',
          'ผลการอนุมัติ': getApprovalStatusInfo(g).label,
          'เซ็นต์ผู้ขาย': hasVendor ? 'ครบ' : 'รอ',
          'เซ็นต์ Receive': hasReceive ? 'ครบ' : 'รอ',
          'เซ็นต์ LP&S': g.focusStatus === 'FOCUS' ? (hasLps ? 'ครบ' : 'รอ') : 'ไม่ระบุ',
          'อนุมัติ OTM': hasOtm ? 'อนุมัติแล้ว' : 'รออนุมัติ',
          'วันที่อัปเดต': new Date(g.updatedAt).toLocaleString('th-TH'),
        };
      });

      // 3. Measurement details (รายละเอียดตัวอย่าง)
      const detailRows = measurements.map((m, idx) => ({
        'ลำดับ': idx + 1,
        'SKU Group ID': m.samplingGroupId,
        'ตัวอย่างที่': m.sampleNumber,
        'รหัสตะกร้า': m.basketCode,
        'น้ำหนักหักตะกร้า (กก.)': m.tareWeightKg,
        'น้ำหนักรวม Gross (กก.)': m.grossWeightKg,
        'น้ำหนักสุทธิ Net (กก.)': m.netWeightKg,
        'ผู้บันทึก': m.recordedBy,
        'เวลาที่ชั่ง': new Date(m.recordedAt).toLocaleString('th-TH'),
      }));

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      const wsWeighed = XLSX.utils.json_to_sheet(
        weighedRows.length > 0
          ? weighedRows
          : [{ 'ลำดับ': '-', 'เลขใบนัดหมาย': 'ยังไม่มีรายการที่ชั่งเสร็จในระบบ', 'สถานะสุ่มชั่ง': 'รอการชั่ง' }]
      );
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);

      // Append sheets in clean logical order
      XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปผลการชั่ง');
      XLSX.utils.book_append_sheet(wb, wsWeighed, 'ชั่งแล้ว');
      XLSX.utils.book_append_sheet(wb, wsDetail, 'รายละเอียดตัวอย่าง');

      // 4. Lotus's Official CN Report Sheet
      if (cnCases.length > 0) {
        const cnAoa: any[][] = [
          ["Lotus's", "", "", "", "", "", "", "", ""],
          ["รายงานเอกสารการ CN By SRRDC Receiving Fresh", "", "", "", "PO: 14/10/26", "", "", "", ""],
          ["Vender Name", "PO Number", "Item Number", "Item Description", "(case)", "size (Kg)", "Actual (Kg)", "Kg/case", "CN"]
        ];
        cnCases.forEach(c => {
          cnAoa.push([
            c.vendorName || '-',
            c.poNbr || '-',
            c.itemId || '-',
            c.description || '-',
            c.totalActualCases || 0,
            c.standardWeightKg || 0,
            c.actualAverageNetKg || 0,
            c.shortagePerCaseKg || 0,
            c.cnTotalKg || 0
          ]);
        });
        const wsCN = XLSX.utils.aoa_to_sheet(cnAoa);
        XLSX.utils.book_append_sheet(wb, wsCN, 'รายงาน_CN_SRRDC_QC');
      }

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `SMART_DC_Weight_Sampling_${dateStr}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel');
    } finally {
      setIsExporting(false);
    }
  };

  // Metrics for 6 Categories: ทั้งหมด, รอชั่ง, ดำเนินการอยู่, ชั่งครบแล้ว, ผิดเกณฑ์, สินค้า Focus
  const totalCount = samplingGroups.length;
  const inProgressCount = samplingGroups.filter(g => Boolean(apptProgressMap.get(g.apptNbr)?.isInProgress)).length;
  // สถานะ ชั่งครบแล้ว: ตราบใดที่ยังไม่ปิดงาน จะอยู่ "ดำเนินการอยู่" ถ้าปิดงานแล้ว จึงค่อยขึ้น "ชั่งครบแล้ว" (นับรวมทุกรายการทั้งผ่านเกณฑ์และ CN)
  const doneCount = samplingGroups.filter(g => Boolean(apptProgressMap.get(g.apptNbr)?.isAllDone)).length;
  const waitingCount = Math.max(0, totalCount - doneCount - inProgressCount);
  const pendingOtmCount = samplingGroups.filter(g => getApprovalStatusInfo(g).type === 'PENDING_OTM').length;
  const failCount = samplingGroups.filter(g => getSamplingStatusInfo(g).type === 'FAIL').length;
  const focusCount = samplingGroups.filter(g => g.focusStatus === 'FOCUS').length;

  return (
    <Layout title="Excel & ชีต" showBack backTo="/dashboard">
      <div className="p-2 sm:p-4 space-y-4 w-full max-w-[1600px] mx-auto pb-24 text-[#1F1F1F]">
        
        {/* ─── 1. HERO HUB CARD ──────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#12803C] to-[#0B5E2B] text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="inline-block bg-[#EFD9A7] text-[#0B5E2B] text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
                Data Management & Cloud Sync
              </span>
              <h2 className="text-xl font-black leading-tight flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-[#EFD9A7]" />
                ศูนย์ข้อมูล Excel & Google Sheet
              </h2>
              <p className="text-xs text-white/80 mt-1">
                เชื่อมโยงและซิงค์ข้อมูลการสุ่มชั่งสดเข้าสู่ Google Spreadsheet กลางของคลังแบบเรียลไทม์
              </p>
            </div>
          </div>
        </div>

        {/* ─── 2. SUMMARY METRICS TILES ─────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
          <div 
            onClick={() => setFilterTab('ALL')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'ALL' ? 'bg-white border-[#12803C] shadow-sm ring-2 ring-[#12803C]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#12803C]'
            }`}
          >
            <span className="text-xl font-black text-[#1F1F1F] block">{totalCount}</span>
            <span className="text-[11px] text-[#6E6E6E] font-medium">ทั้งหมด (Item)</span>
          </div>

          <div 
            onClick={() => setFilterTab('WAITING')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'WAITING' ? 'bg-[#FEF9E7] border-[#B45309] shadow-sm ring-2 ring-[#B45309]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#B45309]'
            }`}
          >
            <span className="text-xl font-black text-[#B45309] block">{waitingCount}</span>
            <span className="text-[11px] text-[#B45309] font-bold">รอชั่ง (Item)</span>
          </div>

          <div 
            onClick={() => setFilterTab('IN_PROGRESS')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'IN_PROGRESS' ? 'bg-[#EFF6FF] border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#1D4ED8]'
            }`}
          >
            <span className="text-xl font-black text-[#1D4ED8] block">{inProgressCount}</span>
            <span className="text-[11px] text-[#1D4ED8] font-bold">ดำเนินการอยู่ (Item)</span>
          </div>

          <div 
            onClick={() => setFilterTab('DONE')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'DONE' ? 'bg-[#EAF7ED] border-[#12803C] shadow-sm ring-2 ring-[#12803C]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#12803C]'
            }`}
          >
            <span className="text-xl font-black text-[#12803C] block">{doneCount}</span>
            <span className="text-[11px] text-[#0B5E2B] font-bold">ชั่งครบแล้ว (Item)</span>
          </div>

          <div 
            onClick={() => setFilterTab('FAIL')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'FAIL' ? 'bg-[#FDE8E8] border-[#E03131] shadow-sm ring-2 ring-[#E03131]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#E03131]'
            }`}
          >
            <span className="text-xl font-black text-[#E03131] block">{failCount}</span>
            <span className="text-[11px] text-[#E03131] font-bold">ผิดเกณฑ์ (Item)</span>
          </div>

          <div 
            onClick={() => setFilterTab('FOCUS')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-2xl border transition-all ${
              filterTab === 'FOCUS' ? 'bg-[#FFF0E6] border-[#D9480F] shadow-sm ring-2 ring-[#D9480F]/30' : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs hover:border-[#D9480F]'
            }`}
          >
            <span className="text-xl font-black text-[#D9480F] block">{focusCount}</span>
            <span className="text-[11px] text-[#D9480F] font-bold">สินค้า Focus ⭐ (Item)</span>
          </div>
        </div>

        {/* ─── 3. SEARCH & FILTER CONTROLS ───────────────────────── */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            {/* Search Input (Prominent Design) */}
            <div className="relative flex-1 flex items-center bg-white border-2 border-[#12803C]/35 hover:border-[#12803C] focus-within:border-[#12803C] focus-within:ring-2 focus-within:ring-[#12803C]/20 rounded-2xl shadow-xs transition-all">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#12803C] w-4 h-4 stroke-[2.5]" />
              <input
                type="text"
                placeholder="ค้นหาใบนัดหมาย, PO, ชื่อบริษัท/ผู้ขาย, ITEM, หรือชื่อสินค้า..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent pl-10 pr-8 py-2.5 text-xs font-semibold text-[#1F1F1F] placeholder:text-[#8C8C8C] placeholder:font-normal focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="ล้างการค้นหา"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Subtle Date Filter - ตรวจสอบย้อนหลัง เล็กๆ เรียบง่าย */}
            <div className="flex items-center gap-1.5 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl px-2.5 py-1.5 shadow-xs shrink-0 text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#12803C] shrink-0" />
              <span className="text-[11px] text-[#6E6E6E] whitespace-nowrap">ตรวจสอบย้อนหลัง:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs text-[#1F1F1F] font-bold focus:outline-none cursor-pointer"
                title="เลือกวันที่ตรวจสอบย้อนหลัง"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  title="ล้างวันที่"
                  className="text-slate-400 hover:text-red-500 ml-0.5 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Search Indicator Banner */}
          {searchTerm.trim().length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#EAF7ED] text-[#12803C] px-3 py-1.5 rounded-xl border border-[#AEE0BD] font-bold">
              <span>
                🔍 ผลการค้นหา "{searchTerm.trim()}": พบ <b>{filteredRows.length}</b> รายการ (ค้นหาจาก ใบนัดหมาย, PO, ชื่อบริษัท/ผู้ขาย, รหัส ITEM, หรือชื่อสินค้า)
              </span>
              {filterTab !== 'ALL' && (
                <button
                  onClick={() => setFilterTab('ALL')}
                  className="text-[11px] text-[#0B5E2B] underline hover:text-[#12803C] cursor-pointer"
                >
                  คลิกดูผลลัพธ์จากทุกสถานะ (ทั้งหมด)
                </button>
              )}
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {/* 1. ทั้งหมด */}
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'ALL'
                  ? 'bg-[#12803C] text-white shadow-xs'
                  : 'bg-[#FFFDF9] text-[#6E6E6E] border border-[#E8E1D8]'
              }`}
            >
              ทั้งหมด ({totalCount})
            </button>

            {/* 2. รอชั่ง */}
            <button
              onClick={() => setFilterTab('WAITING')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'WAITING'
                  ? 'bg-[#B45309] text-white shadow-xs'
                  : 'bg-[#FEF9E7] text-[#B45309] border border-[#FDE68A]'
              }`}
            >
              รอชั่ง ({waitingCount})
            </button>

            {/* 3. ดำเนินการอยู่ */}
            <button
              onClick={() => setFilterTab('IN_PROGRESS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'IN_PROGRESS'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]'
              }`}
            >
              ดำเนินการอยู่ ({inProgressCount})
            </button>

            {/* 4. ชั่งครบแล้ว */}
            <button
              onClick={() => setFilterTab('DONE')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'DONE'
                  ? 'bg-[#12803C] text-white shadow-xs'
                  : 'bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD]'
              }`}
            >
              ชั่งครบแล้ว ({doneCount})
            </button>

            {/* 5. ผิดเกณฑ์ */}
            <button
              onClick={() => setFilterTab('FAIL')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'FAIL'
                  ? 'bg-[#E03131] text-white shadow-xs'
                  : 'bg-[#FDE8E8] text-[#E03131] border border-[#F8B4B4]'
              }`}
            >
              ผิดเกณฑ์ ({failCount})
            </button>

            {/* 7. สินค้า Focus */}
            <button
              onClick={() => setFilterTab('FOCUS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                filterTab === 'FOCUS'
                  ? 'bg-[#D9480F] text-white shadow-xs'
                  : 'bg-[#FFF0E6] text-[#D9480F] border border-[#FFD8BF]'
              }`}
            >
              สินค้า Focus ⭐ ({focusCount})
            </button>
          </div>
        </div>

        {/* ─── 4. SPREADSHEET TABLE GRID (EXCEL VIEW) ────────────── */}
        <div className="bg-[#FFFDF9] rounded-3xl border border-[#E8E1D8] shadow-xs overflow-hidden">
          <div className="p-3 border-b border-[#E8E1D8] flex flex-wrap justify-between items-center gap-2 bg-[#F7F2EA]/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-[#1F1F1F] flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-[#12803C]" />
                ตารางข้อมูล ({filteredRows.length} รายการ)
              </span>
              <span className="text-[10px] font-bold text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#AEE0BD]">
                ✓ เรียงตามรอบเวลา ➡️ ใบนัด ➡️ PO ➡️ สินค้า
              </span>
            </div>
            <span className="text-[10.5px] font-bold text-[#6E6E6E] bg-white px-2.5 py-1 rounded-xl border border-[#E8E1D8] flex items-center gap-1.5 shadow-2xs">
              <span>💡 คลิกที่แถว:</span>
              <span className="text-[#E03131] font-black">🔴 ผิดเกณฑ์ ➡️ หน้าเคส CN</span>
              <span>·</span>
              <span className="text-[#12803C] font-black">🟢 ชั่งครบ ➡️ หน้าสรุปผล</span>
              <span>·</span>
              <span className="text-[#E67700] font-black">🟠 รอชั่ง ➡️ หน้าชั่งสินค้า</span>
            </span>
          </div>

          <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table className="min-w-[1240px] w-full text-left text-[11px] border-collapse table-fixed">
              <thead className="bg-[#F7F2EA] text-[#1F1F1F] font-bold sticky top-0 z-10 border-b border-[#E8E1D8] text-[11px]">
                <tr>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[40px] text-center">ลำดับ</th>
                  <th className="py-2.5 px-1.5 border-r border-[#E8E1D8] w-[75px] text-center">ใบนัดหมาย</th>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[50px] text-center">สายรถ</th>
                  <th className="py-2.5 px-1.5 border-r border-[#E8E1D8] w-[130px] text-center">ชื่อบริษัท / ผู้ขาย</th>
                  <th className="py-2.5 px-1.5 border-r border-[#E8E1D8] w-[80px] text-center">PO</th>
                  <th className="py-2.5 px-1.5 border-r border-[#E8E1D8] w-[85px] text-center">รหัส ITEM</th>
                  <th className="py-2.5 px-2 border-r border-[#E8E1D8] w-[180px] text-left">ชื่อสินค้า</th>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[65px] text-center">ประเภท</th>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[48px] text-center">รับจริง</th>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[52px] text-center">สุ่ม 10%</th>
                  <th className="py-2.5 px-1 border-r border-[#E8E1D8] w-[60px] text-center">เกณฑ์ SP</th>
                  <th className="py-2.5 px-1.5 border-r border-[#E8E1D8] w-[105px] text-center">ผลสุ่มชั่ง</th>
                  <th className="py-2.5 px-1.5 w-[115px] text-center">ผลการอนุมัติ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D8] text-[11px]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-[#6E6E6E]">
                      ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => {
                    const appt = apptMap.get(row.apptNbr);
                    const samplingInfo = getSamplingStatusInfo(row);
                    const approvalInfo = getApprovalStatusInfo(row);

                    const handleRowClick = () => {
                      if (samplingInfo.type === 'FAIL') {
                        // 1. ผิดเกณฑ์ (CN) -> ไปหน้าเคส CN สำหรับรายการนั้น
                        navigate(`/cn?appt=${encodeURIComponent(row.apptNbr)}&item=${encodeURIComponent(row.itemId)}`);
                      } else if (samplingInfo.type === 'DONE') {
                        // 2. ชั่งครบแล้ว -> ไปหน้าสรุปใบนัดหมาย (ภาพที่ 2 - AppointmentSummaryPage)
                        navigate(`/appointment/${encodeURIComponent(row.apptNbr)}/summary?item=${encodeURIComponent(row.itemId)}`);
                      } else {
                        // 3. รอชั่ง หรือ กำลังชั่ง -> ไปหน้าชั่งสินค้ารายการนั้น (ภาพที่ 3 - AppointmentDetailPage)
                        const params = new URLSearchParams();
                        if (row.vendorNbr) params.set('vendor', row.vendorNbr);
                        if (row.poNbr) params.set('po', row.poNbr);
                        if (row.itemId) params.set('item', row.itemId);
                        navigate(`/appointment/${encodeURIComponent(row.apptNbr)}?${params.toString()}`);
                      }
                    };

                    const tooltipText = samplingInfo.type === 'FAIL'
                      ? `คลิกเพื่อเปิดหน้าเคส CN ของ [${row.itemId}] (ใบนัด ${row.apptNbr})`
                      : samplingInfo.type === 'DONE'
                      ? `คลิกเพื่อเปิดหน้าสรุปผลของใบนัด ${row.apptNbr}`
                      : `คลิกเพื่อเปิดหน้าชั่งน้ำหนัก [${row.itemId}] (ใบนัด ${row.apptNbr})`;

                    return (
                      <tr 
                        key={row.id}
                        onClick={handleRowClick}
                        title={tooltipText}
                        className={`hover:bg-[#F2ECE1] transition-all cursor-pointer group ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-[#FFFDF9]'
                        }`}
                      >
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center text-[#6E6E6E] font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-[#E8E1D8] font-bold text-[#1F1F1F] font-mono text-center whitespace-nowrap group-hover:text-[#12803C]">
                          <span className="block font-black text-[11px]">{row.apptNbr}</span>
                          {(() => {
                            const rawTime = getApptTimeForGroup(row, apptMap);
                            return rawTime ? (
                              <span className="block text-[9.5px] font-normal text-[#6E6E6E]">
                                {formatApptTime(rawTime)}
                              </span>
                            ) : null;
                          })()}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center">
                          {(() => {
                            const carrier = getCarrierForGroup(row, appt);
                            const isVN = carrier === 'VN';
                            return (
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                isVN ? 'bg-[#EAF7ED] text-[#12803C]' : 'bg-[#FFF0E6] text-[#F76707]'
                              }`}>
                                {carrier}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-[#E8E1D8] text-center text-[10.5px] truncate" title={`${row.vendorName || ''} (${row.vendorNbr || ''})`}>
                          <span className="font-semibold text-[#1F1F1F] block truncate">
                            {row.vendorName || appt?.vendorName || SEED_APPT_INFO.get(row.apptNbr)?.vendorName || '-'}
                          </span>
                          <span className="text-[9.5px] text-[#6E6E6E] font-mono block">({row.vendorNbr || '-'})</span>
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-[#E8E1D8] font-mono text-[#555] text-center whitespace-nowrap">
                          {row.poNbr}
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-[#E8E1D8] font-mono font-bold text-[#12803C] text-center whitespace-nowrap">
                          {row.itemId}
                        </td>
                        <td className="py-1.5 px-2 border-r border-[#E8E1D8] font-medium text-[#1F1F1F] truncate group-hover:underline" title={row.description}>
                          {row.description}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center">
                          {row.focusStatus === 'FOCUS' ? (
                            <span className="bg-[#FFF0E6] text-[#D9480F] font-bold px-1.5 py-0.5 rounded border border-[#FFD8BF] text-[9.5px]">
                              ⭐ Focus
                            </span>
                          ) : (
                            <span className="text-[#8C8C8C] text-[10px]">ทั่วไป</span>
                          )}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center font-mono font-bold">
                          {row.confirmedActualQty ?? row.apptContQty ?? 0}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center font-mono font-bold text-[#12803C]">
                          {row.requiredSamples}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center font-mono font-bold">
                          {row.standardWeightKg ? `${row.standardWeightKg} kg` : '-'}
                        </td>
                        <td className="py-1.5 px-1 border-r border-[#E8E1D8] text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick();
                            }}
                            className={`inline-flex items-center gap-1 font-bold border px-1.5 py-0.5 rounded text-[10px] hover:scale-105 active:scale-95 transition-all shadow-2xs cursor-pointer ${samplingInfo.badgeClass}`}
                            title={tooltipText}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${samplingInfo.dotClass}`} />
                            {samplingInfo.label}
                            <span className="opacity-60 text-[9px] group-hover:translate-x-0.5 transition-transform">↗</span>
                          </button>
                        </td>
                        <td className="py-1.5 px-1 text-center whitespace-nowrap">
                          {approvalInfo.label === '-' ? (
                            <span className="text-[#8C8C8C] font-mono text-xs">-</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick();
                              }}
                              className={`inline-flex items-center font-bold border px-1.5 py-0.5 rounded text-[10px] hover:scale-105 active:scale-95 transition-all shadow-2xs cursor-pointer ${approvalInfo.badgeClass}`}
                              title={tooltipText}
                            >
                              {approvalInfo.label}
                              <span className="opacity-60 text-[9px] ml-1 group-hover:translate-x-0.5 transition-transform">↗</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── 5. DISCREET CLOUD LINKS AT BOTTOM (ADMIN / SUPERVISOR ONLY) ─── */}
        {isAdminOrSupervisor && (
          <div className="mt-4 p-3 bg-[#FFFDF9] rounded-2xl border border-[#E8E1D8] shadow-2xs space-y-2 text-xs animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#6E6E6E] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#12803C]" />
                ลิงก์เอกสารส่วนกลางสำหรับผู้ดูแลระบบ (Google Cloud DC)
              </span>
              <span className="text-[10px] text-[#0B5E2B] font-bold bg-[#EAF7ED] px-2 py-0.5 rounded-full border border-[#AEE0BD]">
                เฉพาะ Admin & Supervisor
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
              {/* Open Google Sheet */}
              <a
                href={GOOGLE_SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#F7F2EA] hover:bg-[#EAF7ED] text-[#1F1F1F] rounded-xl p-2.5 flex items-center justify-between transition-colors border border-[#E8E1D8] hover:border-[#AEE0BD]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-[#12803C] shrink-0" />
                  <div className="truncate">
                    <span className="font-bold block text-xs truncate">Google Sheet กลาง</span>
                    <span className="text-[10px] text-[#6E6E6E] truncate">ระบบบันทึกการชั่งสดและเคส CN - Smart DC</span>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#8C827A] shrink-0 ml-1" />
              </a>

              {/* Open Google Drive */}
              <a
                href={GOOGLE_DRIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#F7F2EA] hover:bg-[#EAF7ED] text-[#1F1F1F] rounded-xl p-2.5 flex items-center justify-between transition-colors border border-[#E8E1D8] hover:border-[#AEE0BD]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="w-4 h-4 text-[#9A7D0A] shrink-0" />
                  <div className="truncate">
                    <span className="font-bold block text-xs truncate">Google Drive DC</span>
                    <span className="text-[10px] text-[#6E6E6E] truncate">โฟลเดอร์เก็บเอกสาร</span>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#8C827A] shrink-0 ml-1" />
              </a>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
