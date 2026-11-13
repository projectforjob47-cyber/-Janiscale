// ============================================================
// SMART DC — OTMQueuePage Component
// OTM Manager Approval Queue (Review & Quick 1-Tap Sign)
// Hierarchy:
// 1. Appointment (ใบนัดหมาย) — หัวใหญ่สุด เรียงตามวันเวลาที่ได้ชั่งไป ชั่งก่อนอยู่ก่อน
// 2. PO (ใบสั่งซื้อ) — หัวถัดมา
// 3. Drill-down ดูรายการที่สุ่มชั่งไป (SKU / Sampling Groups)
// ============================================================

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Layout from '../components/Layout';
import { 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Scale, 
  Sparkles, 
  UserCheck, 
  Check, 
  Lock,
  Package,
  Layers,
  Truck,
  Building2,
  Calendar,
  ExternalLink,
  CheckSquare
} from 'lucide-react';
import { db } from '../lib/database';
import StatusBadge from '../components/StatusBadge';
import authorizedRoster from '../lib/authorizedRoster.json';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import { v4 as uuidv4 } from 'uuid';
import type { SignatureRecord, SamplingGroup, Measurement, WeightSummary } from '../types';

function generateDigitalSeal(signerName: string, timestamp?: string): string {
  const timeStr = timestamp ? new Date(timestamp).toLocaleString('th-TH') : new Date().toLocaleString('th-TH');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="370" height="92" viewBox="0 0 370 92">
    <rect x="2" y="2" width="366" height="88" rx="14" fill="#EAF7ED" stroke="#12803C" stroke-width="2.5" stroke-dasharray="5,3"/>
    <circle cx="36" cy="46" r="22" fill="#12803C"/>
    <path d="M28 46l5 5 12-12" stroke="#FFF" stroke-width="3" fill="none" stroke-linecap="round"/>
    <text x="70" y="32" font-family="sans-serif" font-size="12" font-weight="900" fill="#0B5E2B">OTM DIGITAL APPROVED</text>
    <text x="70" y="53" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1F1F1F">${signerName}</text>
    <text x="70" y="72" font-family="sans-serif" font-size="10" fill="#6E6E6E">อนุมัติ: ${timeStr} · SRRDC Receiving Fresh</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatWeighedDateTime(timestamp: number | null): { dateStr: string; timeStr: string; fullStr: string } {
  if (!timestamp) {
    return { dateStr: '-', timeStr: '-', fullStr: 'รอชั่งสุ่มตรวจ' };
  }
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) {
    return { dateStr: '-', timeStr: '-', fullStr: 'รอชั่งสุ่มตรวจ' };
  }
  
  const day = d.getDate().toString().padStart(2, '0');
  const monthNames = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const month = monthNames[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  
  const dateStr = `${day} ${month} ${yearBE}`;
  const timeStr = `${hours}:${minutes} น.`;
  const fullStr = `${dateStr} เวลา ${timeStr}`;
  return { dateStr, timeStr, fullStr };
}

export default function OTMQueuePage() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [filterTab, setFilterTab] = useState<'PENDING' | 'SIGNED' | 'ALL'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');

  // Strict Role Check: Only OTM or Admin/Supervisor can approve
  const isOtm = currentUser?.role === 'OTM';
  const isAdmin = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const canApprove = isOtm || isAdmin;

  // Remember active OTM Manager name
  const [activeOtmName, setActiveOtmName] = useState<string>(() => {
    if (isOtm && currentUser?.fullName) return currentUser.fullName;
    return localStorage.getItem('smartdc_active_otm_name') || currentUser?.fullName || '';
  });
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Accordion state: which Appointments and POs are expanded
  // Key format: apptKey = apptNbr, poKey = `${apptNbr}_${poNbr}`, itemKey = g.id
  const [expandedAppts, setExpandedAppts] = useState<Record<string, boolean>>({});
  const [expandedPos, setExpandedPos] = useState<Record<string, boolean>>({});
  const [expandedItemSamples, setExpandedItemSamples] = useState<Record<string, boolean>>({});

  const otmRoster = authorizedRoster.filter(r => r.role === 'OTM');

  const handleOtmChange = (name: string) => {
    setActiveOtmName(name);
    if (name) localStorage.setItem('smartdc_active_otm_name', name);
  };

  // Queries from Dexie
  const appointments = useLiveQuery(async () => db.appointments.toArray(), []) || [];
  const samplingGroups = useLiveQuery(async () => db.samplingGroups.toArray(), []) || [];
  const measurements = useLiveQuery(async () => db.measurements.toArray(), []) || [];
  const allSignatures = useLiveQuery(async () => db.signatureRecords.toArray(), []) || [];
  const weightSummaries = useLiveQuery(async () => db.weightSummaries.toArray(), []) || [];

  // Toggle helpers
  const toggleAppt = (apptNbr: string) => {
    setExpandedAppts(prev => ({
      ...prev,
      [apptNbr]: prev[apptNbr] === undefined ? false : !prev[apptNbr]
    }));
  };

  const togglePo = (apptNbr: string, poNbr: string) => {
    const key = `${apptNbr}_${poNbr}`;
    setExpandedPos(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }));
  };

  const toggleItemSamples = (groupId: string) => {
    setExpandedItemSamples(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleExpandAll = () => {
    const newAppts: Record<string, boolean> = {};
    const newPos: Record<string, boolean> = {};
    const newItems: Record<string, boolean> = {};
    samplingGroups.forEach(g => {
      newAppts[g.apptNbr] = true;
      newPos[`${g.apptNbr}_${g.poNbr}`] = true;
      newItems[g.id] = true;
    });
    setExpandedAppts(newAppts);
    setExpandedPos(newPos);
    setExpandedItemSamples(newItems);
  };

  const handleCollapseAll = () => {
    const newAppts: Record<string, boolean> = {};
    const newPos: Record<string, boolean> = {};
    samplingGroups.forEach(g => {
      newAppts[g.apptNbr] = false;
      newPos[`${g.apptNbr}_${g.poNbr}`] = false;
    });
    setExpandedAppts(newAppts);
    setExpandedPos(newPos);
    setExpandedItemSamples({});
  };

  // Single Item Approve
  const handleQuickApproveFromList = async (e: React.MouseEvent, g: SamplingGroup) => {
    e.stopPropagation();

    const gSigs = await db.signatureRecords.where('samplingGroupId').equals(g.id).toArray();
    const apptSigs = await db.signatureRecords.where('apptNbr').equals(g.apptNbr).toArray();
    const allGroupSigs = [...gSigs, ...apptSigs];

    const isPR = g.carrierCode === 'PR';
    const hasDriverOrVendor = isPR || allGroupSigs.some(s => s.signerRole === 'DRIVER' || s.signerRole === 'VENDOR');
    const hasLps = allGroupSigs.some(s => s.signerRole === 'LPS');
    const isFocusItem = g.focusStatus === 'FOCUS';

    if (!hasDriverOrVendor || (isFocusItem && !hasLps)) {
      if (!isPR && !hasDriverOrVendor) {
        alert('ไม่สามารถอนุมัติได้: งานประเภท VN ต้องได้รับการลงนามจากผู้แทน Vendor ก่อน');
      } else if (isFocusItem && !hasLps) {
        alert('ไม่สามารถอนุมัติได้: รายการ Focus Item ต้องได้รับการลงนามจาก DC S&LP ก่อน');
      }
      return;
    }

    if (!activeOtmName) {
      alert('กรุณาเลือกชื่อผู้จัดการ OTM ที่ด้านบนของหน้าจอก่อนกดอนุมัติ');
      return;
    }

    try {
      setApprovingId(g.id);
      const now = new Date().toISOString();
      const digitalStamp = generateDigitalSeal(activeOtmName, now);

      const newSig: SignatureRecord = {
        id: uuidv4(),
        samplingGroupId: g.id,
        approvalVersion: g.approvalVersion || 1,
        signerRole: 'OTM',
        signerName: activeOtmName,
        signerCompany: 'Lotus Comm DC OTM Team',
        signatureData: digitalStamp,
        signedAt: now,
        signedByUserId: currentUser?.id || null,
        isValid: true,
        syncStatus: 'SYNCED',
      };

      await db.signatureRecords.add(newSig);
      await db.samplingGroups.update(g.id, {
        workflowStatus: 'FULLY_SIGNED',
        updatedAt: now,
      });

      setTimeout(() => setApprovingId(null), 400);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
      setApprovingId(null);
    }
  };

  // Batch approve all pending items in a PO
  const handleApproveAllInPo = async (e: React.MouseEvent, items: SamplingGroup[]) => {
    e.stopPropagation();
    if (!activeOtmName) {
      alert('กรุณาเลือกชื่อผู้จัดการ OTM ที่ด้านบนของหน้าจอก่อนกดอนุมัติ');
      return;
    }

    const pendingReadyItems: SamplingGroup[] = [];
    for (const g of items) {
      const isSigned = g.workflowStatus === 'FULLY_SIGNED';
      if (isSigned) continue;

      const gSigs = allSignatures.filter(s => s.samplingGroupId === g.id || s.apptNbr === g.apptNbr);
      const isPR = g.carrierCode === 'PR';
      const hasDriverOrVendor = isPR || gSigs.some(s => s.signerRole === 'DRIVER' || s.signerRole === 'VENDOR');
      const hasLps = gSigs.some(s => s.signerRole === 'LPS');
      const isFocusItem = g.focusStatus === 'FOCUS';

      if (hasDriverOrVendor && (!isFocusItem || hasLps)) {
        pendingReadyItems.push(g);
      }
    }

    if (pendingReadyItems.length === 0) {
      alert('ไม่มีรายการที่พร้อมอนุมัติ (รายการอาจยังไม่ได้รับการลงนามจากหน้างาน)');
      return;
    }

    if (!confirm(`ยืนยันการลงนามอนุมัติ OTM ทั้งหมด ${pendingReadyItems.length} รายการใน PO นี้ใช่หรือไม่?`)) {
      return;
    }

    try {
      const now = new Date().toISOString();
      const digitalStamp = generateDigitalSeal(activeOtmName, now);

      for (const g of pendingReadyItems) {
        const newSig: SignatureRecord = {
          id: uuidv4(),
          samplingGroupId: g.id,
          approvalVersion: g.approvalVersion || 1,
          signerRole: 'OTM',
          signerName: activeOtmName,
          signerCompany: 'Lotus Comm DC OTM Team',
          signatureData: digitalStamp,
          signedAt: now,
          signedByUserId: currentUser?.id || null,
          isValid: true,
          syncStatus: 'SYNCED',
        };
        await db.signatureRecords.add(newSig);
        await db.samplingGroups.update(g.id, {
          workflowStatus: 'FULLY_SIGNED',
          updatedAt: now,
        });
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกการอนุมัติ');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // HIERARCHICAL DATA STRUCTURING & CHRONOLOGICAL SORTING
  // ─────────────────────────────────────────────────────────────

  // Build weight summary lookup map
  const summaryMap = useMemo(() => {
    const map = new Map<string, WeightSummary>();
    weightSummaries.forEach(ws => map.set(ws.samplingGroupId, ws));
    return map;
  }, [weightSummaries]);

  // Build measurements lookup map
  const measurementsByGroup = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    measurements.forEach(m => {
      const list = map.get(m.samplingGroupId) || [];
      list.push(m);
      map.set(m.samplingGroupId, list);
    });
    return map;
  }, [measurements]);

  // Main structured tree
  const hierarchicalData = useMemo(() => {
    // 1. Collect unique appointments from samplingGroups & appointments table
    const apptNbrSet = new Set<string>();
    samplingGroups.forEach(g => apptNbrSet.add(g.apptNbr));
    appointments.forEach(a => apptNbrSet.add(a.apptNbr));

    const apptList = Array.from(apptNbrSet).map(apptNbr => {
      const apptRecord = appointments.find(a => a.apptNbr === apptNbr);
      const apptGroups = samplingGroups.filter(g => g.apptNbr === apptNbr);

      const firstGroup = apptGroups[0];
      const carrierCode = apptRecord?.carrierCode || firstGroup?.carrierCode || 'VN';
      const vendorName = firstGroup?.vendorName || 'ไม่ระบุผู้ขาย';
      const vendorNbr = firstGroup?.vendorNbr || '';
      const apptTime = apptRecord?.apptTime || '';
      const shiftType = apptRecord?.shiftType || firstGroup?.shiftType || '';
      const shiftLeaderName = apptRecord?.shiftLeaderName || firstGroup?.shiftLeaderName || '';
      const shiftLeaderRole = apptRecord?.shiftLeaderRole || '';
      const reportingToName = apptRecord?.reportingToName || firstGroup?.reportingToName || '';

      // Determine date & time when this appointment was weighed
      // "เรียงลำดับตามวันเวลาที่ได้ชั่งไป ชั่งก่อนอยู่ก่อน"
      const apptMeasurements = measurements.filter(m => m.apptNbr === apptNbr);
      let firstWeighedAt: number | null = null;

      if (apptMeasurements.length > 0) {
        const times = apptMeasurements
          .map(m => new Date(m.recordedAt).getTime())
          .filter(t => !isNaN(t) && t > 0);
        if (times.length > 0) {
          firstWeighedAt = Math.min(...times);
        }
      }

      if (!firstWeighedAt) {
        const completedGroups = apptGroups.filter(g => g.samplingStatus === 'ชั่งครบ' || g.completedSamples > 0);
        const times = completedGroups
          .map(g => new Date(g.updatedAt || g.qtyConfirmedAt || g.createdAt).getTime())
          .filter(t => !isNaN(t) && t > 0);
        if (times.length > 0) {
          firstWeighedAt = Math.min(...times);
        }
      }

      // Group items by PO (Level 2)
      const poMap = new Map<string, SamplingGroup[]>();
      apptGroups.forEach(g => {
        const pKey = g.poNbr || 'PO-NONE';
        const list = poMap.get(pKey) || [];
        list.push(g);
        poMap.set(pKey, list);
      });

      const pos = Array.from(poMap.entries()).map(([poNbr, items]) => {
        // Sort items inside PO
        items.sort((a, b) => a.itemId.localeCompare(b.itemId));

        const poPendingCount = items.filter(g => {
          const isSigned = g.workflowStatus === 'FULLY_SIGNED';
          return g.workflowStatus === 'PENDING_OTM' || (g.samplingStatus === 'ชั่งครบ' && !isSigned);
        }).length;

        const poSignedCount = items.filter(g => g.workflowStatus === 'FULLY_SIGNED').length;
        const isPoAllSigned = items.length > 0 && poSignedCount === items.length;

        return {
          poNbr,
          items,
          totalItems: items.length,
          pendingCount: poPendingCount,
          signedCount: poSignedCount,
          isAllSigned: isPoAllSigned,
        };
      });

      // Sort POs alphabetically
      pos.sort((a, b) => a.poNbr.localeCompare(b.poNbr));

      // Metrics for the whole appointment
      const totalItems = apptGroups.length;
      const pendingCount = apptGroups.filter(g => {
        const isSigned = g.workflowStatus === 'FULLY_SIGNED';
        return g.workflowStatus === 'PENDING_OTM' || (g.samplingStatus === 'ชั่งครบ' && !isSigned);
      }).length;
      const signedCount = apptGroups.filter(g => g.workflowStatus === 'FULLY_SIGNED').length;
      const isAllSigned = totalItems > 0 && signedCount === totalItems;
      const isWaitingSampling = totalItems > 0 && apptGroups.every(g => g.samplingStatus === 'รอชั่ง');

      return {
        apptNbr,
        carrierCode,
        vendorName,
        vendorNbr,
        apptTime,
        shiftType,
        shiftLeaderName,
        shiftLeaderRole,
        reportingToName,
        firstWeighedAt,
        pos,
        totalItems,
        pendingCount,
        signedCount,
        isAllSigned,
        isWaitingSampling,
      };
    });

    // ─────────────────────────────────────────────────────────
    // SORTING: "เรียงลำดับตามวันเวลาที่ได้ชั่งไป ชั่งก่อนอยู่ก่อน"
    // Chronological Ascending: Earliest weighed timestamp comes first!
    // ─────────────────────────────────────────────────────────
    apptList.sort((a, b) => {
      if (a.firstWeighedAt && b.firstWeighedAt) {
        return a.firstWeighedAt - b.firstWeighedAt; // ชั่งก่อนอยู่ก่อน
      }
      if (a.firstWeighedAt && !b.firstWeighedAt) return -1;
      if (!a.firstWeighedAt && b.firstWeighedAt) return 1;
      return (a.apptTime || '').localeCompare(b.apptTime || '') || a.apptNbr.localeCompare(b.apptNbr);
    });

    return apptList;
  }, [samplingGroups, appointments, measurements]);

  // Overall Global Counts
  const globalPendingCount = useMemo(() => {
    return samplingGroups.filter(g => {
      const isSigned = g.workflowStatus === 'FULLY_SIGNED';
      return g.workflowStatus === 'PENDING_OTM' || (g.samplingStatus === 'ชั่งครบ' && !isSigned);
    }).length;
  }, [samplingGroups]);

  const globalSignedCount = useMemo(() => {
    return samplingGroups.filter(g => g.workflowStatus === 'FULLY_SIGNED').length;
  }, [samplingGroups]);

  // Filter hierarchical data by Tab & Search
  const filteredAppointments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return hierarchicalData.filter(appt => {
      // 1. Tab filter
      if (filterTab === 'PENDING' && appt.pendingCount === 0) return false;
      if (filterTab === 'SIGNED' && appt.signedCount === 0) return false;

      // 2. Search query filter
      if (q) {
        const matchAppt = appt.apptNbr.toLowerCase().includes(q);
        const matchVendor = appt.vendorName.toLowerCase().includes(q) || appt.vendorNbr.toLowerCase().includes(q);
        const matchPo = appt.pos.some(p => p.poNbr.toLowerCase().includes(q));
        const matchItem = appt.pos.some(p => 
          p.items.some(i => i.itemId.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
        );
        return matchAppt || matchVendor || matchPo || matchItem;
      }

      return true;
    });
  }, [hierarchicalData, filterTab, searchTerm]);

  return (
    <Layout title="คิว OTM" showBack backTo="/dashboard">
      <div 
        style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}
        className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto text-[#1F1F1F] w-full"
      >
        
        {/* ─── Header Hero ────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#12803C] to-[#0B5E2B] text-white p-5 sm:p-6 rounded-3xl shadow-sm space-y-2">
          <div className="flex justify-between items-start gap-3">
            <div>
              <span className="bg-[#EFD9A7] text-[#0B5E2B] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">
                OTM Authorization Hub
              </span>
              <h2 className="text-xl sm:text-2xl font-black">คิวอนุมัติผลชั่งน้ำหนัก OTM</h2>
              <p className="text-xs sm:text-sm text-white/85 mt-0.5">
                จัดกลุ่มตามใบนัดหมาย (Appointment) เรียงตามวันเวลาที่ได้ชั่งไป ชั่งก่อนอยู่ก่อน
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <ShieldCheck className="w-7 h-7 text-[#EFD9A7]" />
            </div>
          </div>
        </div>

        {/* ─── OTM Officer Selector / Read-Only Guard ─────────────── */}
        {!canApprove ? (
          <div className="bg-[#FEF9E7] p-4 rounded-3xl border border-[#FAD7A0] shadow-xs space-y-1.5">
            <div className="flex items-center gap-2 text-[#9A7D0A] font-bold text-xs sm:text-sm">
              <Lock className="w-4 h-4 text-[#E03131]" />
              <span>โหมดตรวจสอบข้อมูล (Read-Only Audit Mode)</span>
            </div>
            <p className="text-xs text-[#6E6E6E] leading-relaxed">
              บัญชีของคุณคือ: <b className="text-[#1F1F1F]">{currentUser?.fullName}</b> (สิทธิ์: <b>{currentUser?.role || 'RECEIVE'}</b>) — สามารถดูข้อมูลผลชั่งได้ แต่<b>ไม่สามารถกดอนุมัติแทนฝ่าย OTM ได้</b>
            </p>
          </div>
        ) : (
          <div className="bg-[#FFFDF9] p-4 rounded-3xl border-2 border-[#E8E1D8] shadow-xs space-y-2.5">
            <label className="text-xs sm:text-sm font-bold text-[#1F1F1F] flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#12803C]" />
                ผู้จัดการ OTM ปฏิบัติหน้าที่:
              </span>
              <span className="text-[11px] text-[#12803C] font-bold bg-[#EAF7ED] px-2.5 py-0.5 rounded-full border border-[#AEE0BD]">
                {isOtm ? 'ยืนยันตัวตนแล้ว' : activeOtmName ? 'พร้อมอนุมัติ' : 'กรุณาเลือกชื่อ'}
              </span>
            </label>

            {isOtm ? (
              <div className="p-3 bg-[#F7F2EA] rounded-xl border border-[#AEE0BD] font-bold text-xs sm:text-sm text-[#0B5E2B] flex items-center justify-between">
                <span>{currentUser?.fullName} (User: {currentUser?.empId})</span>
                <span className="text-[11px] bg-[#EAF7ED] px-2.5 py-0.5 rounded-md font-bold text-[#12803C]">OTM Officer</span>
              </div>
            ) : (
              <select
                value={activeOtmName}
                onChange={(e) => handleOtmChange(e.target.value)}
                className="w-full bg-[#F7F2EA] border-2 border-[#12803C] rounded-2xl px-3.5 py-3 text-xs sm:text-sm font-bold text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer"
              >
                <option value="">-- แตะเพื่อเลือกชื่อ OTM (จำไว้ครั้งเดียวสำหรับทุก ITEM) --</option>
                {otmRoster.map(o => (
                  <option key={o.empId} value={o.fullName}>
                    {o.fullName} (รหัส {o.empId})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ─── Search Bar & Global Controls ────────────────────────── */}
        <div className="space-y-2 pt-1">
          <div className="flex justify-between items-center px-1 flex-wrap gap-2">
            <span className="text-xs sm:text-sm text-[#6E6E6E] font-bold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#12803C]" />
              <span>ลำดับใบนัดหมาย (เรียงชั่งก่อน ➔ หลัง)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExpandAll}
                className="text-[11px] font-bold text-[#12803C] hover:underline bg-[#EAF7ED] px-2.5 py-1 rounded-lg border border-[#AEE0BD] transition-all active:scale-95"
              >
                ขยายดูทุกรายการ
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="text-[11px] font-bold text-[#6E6E6E] hover:underline bg-[#F7F2EA] px-2.5 py-1 rounded-lg border border-[#E8E1D8] transition-all active:scale-95"
              >
                ย่อทั้งหมด
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#6E6E6E] absolute left-4 top-3.5 sm:top-4" />
            <input
              type="text"
              placeholder="ค้นหา Appt, PO, รหัสสินค้า, ชื่อสินค้า, หรือผู้ขาย..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl pl-11 pr-4 py-3 sm:py-3.5 text-xs sm:text-sm focus:outline-none focus:border-[#12803C] shadow-xs text-[#1F1F1F]"
            />
          </div>
        </div>

        {/* ─── Filter Tabs ────────────────────────────────────────── */}
        <div className="flex flex-wrap sm:flex-nowrap gap-2 text-xs sm:text-sm">
          <button
            onClick={() => setFilterTab('PENDING')}
            className={`flex-1 min-w-[120px] py-2.5 sm:py-3 px-3 rounded-2xl font-bold transition-all text-center border shadow-xs ${
              filterTab === 'PENDING'
                ? 'bg-[#12803C] text-white border-[#12803C]'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border-[#E8E1D8] hover:bg-[#F7F2EA]'
            }`}
          >
            รอดำเนินการ ({globalPendingCount} รายการ)
          </button>

          <button
            onClick={() => setFilterTab('SIGNED')}
            className={`flex-1 min-w-[120px] py-2.5 sm:py-3 px-3 rounded-2xl font-bold transition-all text-center border shadow-xs ${
              filterTab === 'SIGNED'
                ? 'bg-[#12803C] text-white border-[#12803C]'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border-[#E8E1D8] hover:bg-[#F7F2EA]'
            }`}
          >
            อนุมัติแล้ว ({globalSignedCount} รายการ)
          </button>

          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-5 py-2.5 sm:py-3 rounded-2xl font-bold transition-all text-center border shadow-xs ${
              filterTab === 'ALL'
                ? 'bg-[#12803C] text-white border-[#12803C]'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border-[#E8E1D8] hover:bg-[#F7F2EA]'
            }`}
          >
            ทั้งหมด ({samplingGroups.length} รายการ)
          </button>
        </div>

        {/* ─── Hierarchical Queue Tree ────────────────────────────── */}
        <div className="space-y-5">
          {filteredAppointments.length === 0 ? (
            <div className="bg-[#FFFDF9] rounded-3xl p-8 sm:p-12 text-center border-2 border-[#E8E1D8] shadow-xs space-y-2">
              <CheckCircle2 className="w-12 h-12 text-[#12803C] mx-auto opacity-40" />
              <p className="text-base font-bold text-[#1F1F1F]">ไม่มีรายการค้างในแท็บนี้</p>
              <p className="text-xs sm:text-sm text-[#6E6E6E]">
                {filterTab === 'PENDING'
                  ? 'ทุก ITEM ที่ผ่านการชั่งได้รับการลงนามอนุมัติครบถ้วนแล้ว'
                  : 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'}
              </p>
            </div>
          ) : (
            filteredAppointments.map((appt, apptIdx) => {
              const apptWeighed = formatWeighedDateTime(appt.firstWeighedAt);
              const isApptExpanded = expandedAppts[appt.apptNbr] ?? (appt.pendingCount > 0 || Boolean(searchTerm));

              return (
                <div 
                  key={appt.apptNbr}
                  className="bg-[#FFFDF9] rounded-3xl border-2 border-[#E8E1D8] shadow-sm overflow-hidden transition-all hover:border-[#12803C]/70"
                >
                  
                  {/* ═════════════════════════════════════════════════════════
                      LEVEL 1 (หัวใหญ่สุด): APPOINTMENT ใบนัดหมาย
                     ═════════════════════════════════════════════════════════ */}
                  <div 
                    onClick={() => toggleAppt(appt.apptNbr)}
                    className="p-4 sm:p-5 bg-gradient-to-r from-[#FFFDF9] via-[#FDFBF7] to-[#F7F2EA] border-b-2 border-[#E8E1D8] cursor-pointer select-none space-y-3"
                  >
                    {/* Row 1: Appt Badge, Type, Status Pill & Toggle */}
                    <div className="flex flex-wrap sm:flex-nowrap justify-between items-start gap-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-[#12803C] text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-2xs">
                          ลำดับ #{apptIdx + 1}
                        </span>
                        
                        <h3 className="text-base sm:text-lg font-black text-[#1F1F1F] tracking-wide flex items-center gap-1.5">
                          <span>ใบนัดหมาย:</span>
                          <span className="font-mono text-[#0B5E2B] underline decoration-[#12803C]/40 decoration-2">
                            {appt.apptNbr}
                          </span>
                        </h3>

                        <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border shadow-2xs ${
                          appt.carrierCode === 'VN' 
                            ? 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]' 
                            : 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]'
                        }`}>
                          {appt.carrierCode}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {appt.isAllSigned ? (
                          <span className="bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD] px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>อนุมัติครบแล้ว ({appt.signedCount}/{appt.totalItems})</span>
                          </span>
                        ) : appt.pendingCount > 0 ? (
                          <span className="bg-[#FFF0E6] text-[#D9480F] border border-[#FFD8BF] px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-2xs animate-pulse">
                            <Clock className="w-3.5 h-3.5" />
                            <span>รอ OTM อนุมัติ ({appt.pendingCount} รายการ)</span>
                          </span>
                        ) : (
                          <span className="bg-[#F7F2EA] text-[#6E6E6E] border border-[#E8E1D8] px-3 py-1 rounded-full text-xs font-bold">
                            รอชั่งสุ่มตรวจ
                          </span>
                        )}

                        <div className="w-7 h-7 rounded-xl bg-[#F7F2EA] border border-[#E8E1D8] flex items-center justify-center text-[#6E6E6E]">
                          {isApptExpanded ? <ChevronUp className="w-4 h-4 text-[#12803C]" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Weighing Time (ชั่งก่อนอยู่ก่อน) & Vendor */}
                    <div className="flex flex-wrap justify-between items-center gap-2 pt-1 text-xs">
                      {/* Weighing Time Badge */}
                      <div className="flex items-center gap-1.5 bg-[#FEF9E7] border border-[#FAD7A0] px-3 py-1.5 rounded-xl text-[#9A7D0A] font-bold shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-[#E67700] shrink-0" />
                        <span>วันเวลาที่ได้ชั่งไป: <b className="text-[#1F1F1F] font-black">{apptWeighed.fullStr}</b></span>
                      </div>

                      {/* Vendor name */}
                      <div className="flex items-center gap-1.5 text-[#6E6E6E]">
                        <Building2 className="w-3.5 h-3.5 text-[#12803C] shrink-0" />
                        <span>ผู้ขาย: <b className="text-[#1F1F1F]">{appt.vendorName}</b> {appt.vendorNbr ? `(${appt.vendorNbr})` : ''}</span>
                      </div>
                    </div>

                    {/* Row 2.5: Shift & Chain of Command if assigned */}
                    {(appt.shiftType || appt.shiftLeaderName) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        {appt.shiftType && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-[#FEF9E7] text-[#9A7D0A] font-bold border border-[#FAD7A0] flex items-center gap-1 shadow-2xs">
                            <span>📋</span>
                            <span>{appt.shiftType}</span>
                          </span>
                        )}
                        {appt.shiftLeaderName && (
                          <span className="text-[#1F1F1F]">
                            หัวหน้างาน OTM: <b className="text-[#0B5E2B] font-bold">{appt.shiftLeaderName}</b> {appt.shiftLeaderRole ? `(${appt.shiftLeaderRole})` : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 3: Meta & Summary Link */}
                    <div className="flex flex-wrap justify-between items-center gap-2 pt-1 text-xs text-[#6E6E6E]">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-[#12803C]" />
                          <span>ใบสั่งซื้อ: <b className="text-[#1F1F1F] font-bold">{appt.pos.length} PO</b></span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-[#12803C]" />
                          <span>สินค้า (CW): <b className="text-[#1F1F1F] font-bold">{appt.totalItems} รายการ</b></span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/appointment/${appt.apptNbr}/summary`);
                        }}
                        className="text-xs font-bold text-[#12803C] hover:text-[#0B5E2B] flex items-center gap-1 hover:underline py-1"
                      >
                        <span>ดูสรุป & ใบลงนามภาพรวมใบนัดหมายนี้</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* ═════════════════════════════════════════════════════════
                      LEVEL 2 (หัวถัดมา): PO ใบสั่งซื้อ
                     ═════════════════════════════════════════════════════════ */}
                  {isApptExpanded && (
                    <div className="p-4 sm:p-5 space-y-4 bg-[#FAF7F2] animate-fadeIn">
                      <div className="text-xs font-bold text-[#6E6E6E] flex items-center justify-between px-1">
                        <span>รายการใบสั่งซื้อ (PO) ในใบนัดหมายนี้ ({appt.pos.length} PO):</span>
                        <span className="text-[11px] text-[#12803C]">แตะปุ่มเพื่อดูรายการสินค้าที่สุ่มชั่ง</span>
                      </div>

                      {appt.pos.map((po) => {
                        const isPoExpanded = expandedPos[`${appt.apptNbr}_${po.poNbr}`] ?? (po.pendingCount > 0 || Boolean(searchTerm));

                        return (
                          <div 
                            key={po.poNbr}
                            className="bg-[#FFFDF9] rounded-2xl border-2 border-[#E8E1D8] shadow-xs overflow-hidden"
                          >
                            {/* PO Sub-header Bar */}
                            <div className="p-3.5 sm:p-4 bg-[#F7F2EA]/80 flex flex-wrap sm:flex-nowrap justify-between items-center gap-2.5 border-b border-[#E8E1D8]">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-[#EAF7ED] border border-[#AEE0BD] flex items-center justify-center shrink-0">
                                  <Package className="w-4 h-4 text-[#12803C]" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-[#6E6E6E]">เลขที่ PO:</span>
                                    <span className="text-sm sm:text-base font-black text-[#1F1F1F] font-mono tracking-wide">
                                      {po.poNbr}
                                    </span>
                                    <span className="bg-[#EAF7ED] text-[#0B5E2B] text-[11px] font-bold px-2 py-0.5 rounded-md border border-[#AEE0BD]">
                                      สุ่มชั่ง {po.totalItems} รายการ
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* PO Right Action & Toggle */}
                              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                                {po.isAllSigned ? (
                                  <span className="text-xs font-bold text-[#12803C] bg-[#EAF7ED] border border-[#AEE0BD] px-2.5 py-1 rounded-lg">
                                    ✓ ชั่ง & อนุมัติครบแล้ว
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-[#D9480F] bg-[#FFF0E6] border border-[#FFD8BF] px-2.5 py-1 rounded-lg">
                                    รอ OTM: {po.pendingCount} รายการ
                                  </span>
                                )}

                                {/* Batch Approve for PO if OTM can approve */}
                                {canApprove && po.pendingCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleApproveAllInPo(e, po.items)}
                                    className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                                    title="อนุมัติทุกรายการใน PO นี้พร้อมกัน"
                                  >
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    <span>อนุมัติทั้ง PO</span>
                                  </button>
                                )}

                                {/* Interactive Button to Drill Down Items */}
                                <button
                                  type="button"
                                  onClick={() => togglePo(appt.apptNbr, po.poNbr)}
                                  className="bg-white hover:bg-[#F7F2EA] border-2 border-[#12803C] text-[#12803C] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                                >
                                  <span>{isPoExpanded ? 'ซ่อนรายการ' : 'ดูรายการที่สุ่มชั่ง'}</span>
                                  {isPoExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {/* ═════════════════════════════════════════════════════════
                                LEVEL 3 (รายการที่สุ่มชั่งไป): SKU / SAMPLING GROUPS
                               "และสามารถดูได้ ถ้าต้องการดู ว่ารายการที่สุ่มชั่งไป มีอะไรบ้าง"
                               ═════════════════════════════════════════════════════════ */}
                            {isPoExpanded && (
                              <div className="p-3.5 sm:p-4 space-y-3 bg-[#FFFDF9] divide-y divide-[#E8E1D8]/60">
                                <div className="text-[11px] font-bold text-[#6E6E6E] pb-1 flex items-center justify-between">
                                  <span>รายการสินค้าที่สุ่มชั่งตรวจรับใน PO นี้ ({po.items.length} รายการ):</span>
                                  <span className="text-[#12803C]">แตะปุ่มเพื่อตรวจทานหรืออนุมัติ</span>
                                </div>

                                {po.items.map((g) => {
                                  const isSigned = g.workflowStatus === 'FULLY_SIGNED';
                                  const isFocus = g.focusStatus === 'FOCUS';
                                  const isApproving = approvingId === g.id;

                                  // Signature validation
                                  const gSigs = allSignatures.filter(s => s.samplingGroupId === g.id || s.apptNbr === g.apptNbr);
                                  const isPR = g.carrierCode === 'PR';
                                  const driverOrVendorSig = isPR || gSigs.some(s => s.signerRole === 'DRIVER' || s.signerRole === 'VENDOR');
                                  const receiveSig = gSigs.some(s => s.signerRole === 'RECEIVE');
                                  const lpsSig = gSigs.some(s => s.signerRole === 'LPS');
                                  const hasRequiredOnsiteSigs = Boolean(driverOrVendorSig && receiveSig && (!isFocus || lpsSig));

                                  // Weight metrics
                                  const ws = summaryMap.get(g.id);
                                  const itemMs = measurementsByGroup.get(g.id) || [];
                                  const calcAvg = itemMs.length > 0 
                                    ? (itemMs.reduce((sum, m) => sum + (m.netWeightKg || 0), 0) / itemMs.length).toFixed(2)
                                    : null;
                                  const avgNetStr = ws ? ws.averageNetKg.toFixed(2) : calcAvg;
                                  const diffPercent = ws ? ws.differencePercent : null;

                                  return (
                                    <div 
                                      key={g.id}
                                      className="pt-3 first:pt-0 space-y-2.5"
                                    >
                                      {/* Item Header row */}
                                      <div className="flex flex-wrap sm:flex-nowrap justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono text-xs font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-lg border border-[#AEE0BD]">
                                              ITEM: {g.itemId}
                                            </span>
                                            <StatusBadge status={g.samplingStatus} size="sm" />
                                            {isFocus && (
                                              <span className="bg-[#FEF9E7] text-[#9A7D0A] font-bold text-[10px] px-2 py-0.5 rounded-md border border-[#FAD7A0] flex items-center gap-1">
                                                <Sparkles className="w-3 h-3 text-[#E67700]" />
                                                FOCUS ITEM
                                              </span>
                                            )}
                                          </div>
                                          <h4 className="font-black text-[#1F1F1F] text-sm sm:text-base leading-snug mt-1 break-words">
                                            {g.description}
                                          </h4>
                                        </div>

                                        {/* Status badge */}
                                        <span className={`text-xs font-black px-3 py-1 rounded-full shrink-0 whitespace-nowrap shadow-2xs ${
                                          isSigned
                                            ? 'bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD]'
                                            : hasRequiredOnsiteSigs
                                              ? 'bg-[#F3E8FF] text-[#7950F2] border border-[#D8B4FE]'
                                              : 'bg-[#FEF9E7] text-[#9A7D0A] border border-[#FAD7A0]'
                                        }`}>
                                          {isSigned 
                                            ? '✓ อนุมัติแล้ว' 
                                            : hasRequiredOnsiteSigs 
                                              ? '⏳ รอ OTM ลงนาม' 
                                              : '⚠️ รอหน้างานเซ็น'}
                                        </span>
                                      </div>

                                      {/* Weight & Criteria Row */}
                                      <div className="p-3 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 text-xs">
                                        <div className="space-y-1 min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#6E6E6E]">
                                            <span>
                                              เกณฑ์มาตรฐาน: <b className="text-[#1F1F1F]">{g.spExpression || `${g.standardWeightKg} kg`}</b>
                                            </span>
                                            <span>·</span>
                                            <span className="flex items-center gap-1.5">
                                              <span>สุ่มชั่ง: <b className="text-[#12803C]">{g.completedSamples} / {g.requiredSamples} กล่อง</b></span>
                                              {itemMs.length > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleItemSamples(g.id);
                                                  }}
                                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#12803C] hover:underline bg-[#FFFDF9] border border-[#AEE0BD] px-2 py-0.5 rounded-lg active:scale-95 transition-all shadow-2xs cursor-pointer ml-1"
                                                >
                                                  <span>{expandedItemSamples[g.id] ? 'ซ่อน' : 'ดูตะกร้า 1, 2...'}</span>
                                                  {expandedItemSamples[g.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                </button>
                                              )}
                                            </span>
                                            {avgNetStr && (
                                              <>
                                                <span>·</span>
                                                <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E1D8] font-bold text-[#1F1F1F]">
                                                  เฉลี่ยสุทธิ: {avgNetStr} kg {diffPercent !== null ? `(${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%)` : ''}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        {/* Actions for this SKU */}
                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-[#E8E1D8]/60">
                                          {!isSigned ? (
                                            !hasRequiredOnsiteSigs ? (
                                              <span className="text-xs font-bold text-[#9A7D0A] bg-[#FEF9E7] border border-[#FAD7A0] px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-2xs whitespace-nowrap">
                                                <Lock className="w-3.5 h-3.5 text-[#E03131]" />
                                                <span>รอหน้างานเซ็น</span>
                                              </span>
                                            ) : canApprove ? (
                                              <button
                                                type="button"
                                                onClick={(e) => handleQuickApproveFromList(e, g)}
                                                disabled={isApproving}
                                                className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                                                title="กดเพื่ออนุมัติ ITEM นี้ทันทีด้วยชื่อ OTM ที่เลือกไว้"
                                              >
                                                <Check className="w-3.5 h-3.5" />
                                                <span>{isApproving ? 'กำลังบันทึก...' : 'อนุมัติทันที'}</span>
                                              </button>
                                            ) : (
                                              <span className="text-xs font-bold text-[#6E6E6E] bg-white border border-[#E8E1D8] px-2.5 py-1.5 rounded-xl whitespace-nowrap">
                                                รอ OTM อนุมัติ
                                              </span>
                                            )
                                          ) : null}

                                          <button
                                            type="button"
                                            onClick={() => navigate(`/otm-sign/${g.id}`)}
                                            className="text-xs font-bold text-[#12803C] hover:text-[#0B5E2B] bg-[#EAF7ED] hover:bg-[#D4EED9] border border-[#AEE0BD] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                                          >
                                            <span>{isSigned ? 'ดูข้อมูลผลชั่ง' : 'เปิดตรวจทาน'}</span>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Dropdown: Individual Basket Weights */}
                                      {expandedItemSamples[g.id] && (
                                        <div className="p-3 bg-[#FFFDF9] rounded-2xl border-2 border-[#12803C] space-y-2 animate-fadeIn shadow-xs">
                                          <div className="text-xs font-black text-[#0B5E2B] flex items-center justify-between border-b border-[#E8E1D8] pb-1.5">
                                            <span className="flex items-center gap-1.5">
                                              <Scale className="w-3.5 h-3.5 text-[#12803C]" />
                                              <span>น้ำหนักที่ชั่งจริงแต่ละตะกร้า / กล่อง ({itemMs.length} รายการ):</span>
                                            </span>
                                            <span className="text-[11px] text-[#6E6E6E]">เกณฑ์: {g.spExpression || `${g.standardWeightKg} kg`}</span>
                                          </div>
                                          {itemMs.length === 0 ? (
                                            <div className="text-xs text-[#6E6E6E] py-1 text-center">ยังไม่มีข้อมูลการชั่ง</div>
                                          ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                              {itemMs.map((m, idx) => (
                                                <div key={m.id || idx} className="p-2.5 bg-[#F7F2EA] rounded-xl border border-[#E8E1D8] flex justify-between items-center text-xs">
                                                  <span className="font-bold text-[#1F1F1F]">
                                                    ตะกร้าที่ {m.sampleNumber || idx + 1}:
                                                  </span>
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-black text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded-md border border-[#AEE0BD]">
                                                      สุทธิ {m.netWeightKg.toFixed(2)} kg
                                                    </span>
                                                    <span className="text-[10px] text-[#6E6E6E]">
                                                      (รวม {m.grossWeightKg} - หัก {m.tareWeightKg})
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

      </div>
    </Layout>
  );
}
