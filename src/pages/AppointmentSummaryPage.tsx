// ============================================================
// SMART DC — AppointmentSummaryPage Component
// V3.0 Final Master Design: Appointment-Level Summary & Ordered Signatures
// Hierarchy: Appointment -> Vendor -> PO -> ITEM
// VN: Driver Signature (1 time per Appt) -> Receive -> LP&S (Focus only) -> OTM
// PR: No Driver Signature (NOT_REQUIRED_PR) -> Receive -> LP&S (Focus only) -> OTM
// ============================================================

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import {
  Building2,
  Package,
  Layers,
  Scale,
  Clock,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  FileSpreadsheet,
  Download,
  Shield,
  UserCheck,
  FileCheck2,
  Lock,
} from 'lucide-react';
import { db } from '../lib/database';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import {
  syncAppointmentToGoogleSheets,
  getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl,
} from '../lib/googleSheetsSync';
import { calculateCN, formatPercent, getContainerNoun, calculateRequiredSamples } from '../lib/businessLogic';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import SignaturePad from '../components/SignaturePad';
import authorizedRoster from '../lib/authorizedRoster.json';
import { pushFullStateToServer } from '../lib/syncEngine';
import {
  SHIFT_DEFINITIONS,
  getDefaultShift,
  SHIFT_LEADERS_PRESETS,
  SUPERIOR_PRESETS,
  type ShiftInfo,
} from '../constants/shiftHierarchy';
import type {
  Appointment,
  AppointmentVendor,
  PurchaseOrder,
  SamplingGroup,
  Measurement,
  SignatureRecord,
  CNCase,
} from '../types';
import { 
  formatThaiDate, 
  formatApptTime, 
  extractDateFromApptTime 
} from '../lib/dateUtils';

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

export default function AppointmentSummaryPage() {
  const { apptNbr } = useParams<{ apptNbr: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightItem = searchParams.get('item');
  const { currentUser } = useAuthStore();

  // ─── 1. Queries from Dexie DB ──────────────────────────────
  const appt = useLiveQuery(async () => {
    if (!apptNbr) return null;
    return await db.appointments.where('apptNbr').equals(apptNbr).first();
  }, [apptNbr]);

  const vendors = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.appointmentVendors.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const purchaseOrders = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.purchaseOrders.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const samplingGroups = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.samplingGroups.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const measurements = useLiveQuery(async () => {
    if (!apptNbr) return [];
    const groups = await db.samplingGroups.where('apptNbr').equals(apptNbr).toArray();
    const groupIds = groups.map(g => g.id);
    if (groupIds.length === 0) return [];
    return await db.measurements.where('samplingGroupId').anyOf(groupIds).toArray();
  }, [apptNbr]) || [];

  const signatures = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.signatureRecords.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const cnCases = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.cnCases.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const focusMasterItems = useLiveQuery(async () => {
    return await db.focusMaster.toArray();
  }, []) || [];

  // Local UI state
  const [vendorName, setVendorName] = useState('');
  const [receiveName, setReceiveName] = useState(currentUser?.fullName || '');
  const [lpsName, setLpsName] = useState('');
  // Filter for Hierarchical Items Summary
  const [summaryFilter, setSummaryFilter] = useState<'ALL' | 'PASS' | 'FAIL' | 'FOCUS'>('ALL');
  const [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isOtmApproving, setIsOtmApproving] = useState(false);
  const [isClosingJob, setIsClosingJob] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookInput, setWebhookInput] = useState(getGoogleSheetsWebhookUrl());

  const handleSyncGoogleSheets = async () => {
    if (!appt) return;
    const currentUrl = getGoogleSheetsWebhookUrl();
    if (!currentUrl) {
      setWebhookInput('');
      setShowWebhookModal(true);
      return;
    }
    setIsSyncingSheets(true);
    try {
      const res = await syncAppointmentToGoogleSheets(appt.apptNbr);
      if (res.success) {
        alert(`✅ ${res.message}`);
      } else {
        alert(`⚠️ ${res.message}`);
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + (err?.message || String(err)));
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleSaveWebhookUrl = () => {
    if (!webhookInput.trim()) {
      alert('กรุณากรอกลิงก์ Webhook URL ของ Google Sheets');
      return;
    }
    setGoogleSheetsWebhookUrl(webhookInput.trim());
    setShowWebhookModal(false);
    alert('บันทึกลิงก์ Google Sheets Webhook สำเร็จแล้ว! กำลังส่งข้อมูล...');
    handleSyncGoogleSheets();
  };

  // ─── Shift & Chain of Command States ────────────────────────
  const [selectedShiftId, setSelectedShiftId] = useState<string>(getDefaultShift().id);
  const [selectedLeaderEmpId, setSelectedLeaderEmpId] = useState<string>('');
  const [customLeaderName, setCustomLeaderName] = useState<string>('');
  const [customLeaderRole, setCustomLeaderRole] = useState<string>('หัวหน้างานประจำกะ OTM');
  const [selectedSuperiorName, setSelectedSuperiorName] = useState<string>('ยอดชาย ก้าหรีมล๊ะ');
  const [customSuperiorName, setCustomSuperiorName] = useState<string>('');
  const [customSuperiorRole, setCustomSuperiorRole] = useState<string>('DC Operation Manager');
  const [isShiftAutoSaved, setIsShiftAutoSaved] = useState(false);
  const [isEditingLeader, setIsEditingLeader] = useState(false);

  // Auto-scroll to highlighted item if opened from excel summary hub
  useEffect(() => {
    if (highlightItem && samplingGroups.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`summary-item-${highlightItem}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [highlightItem, samplingGroups]);

  // Sync Shift & Command state with appt from database + Auto-inherit OTM by Shift
  useEffect(() => {
    if (!appt) return;

    // 1. Determine shift
    let currentShiftInfo = getDefaultShift();
    if (appt.shiftType) {
      const match = SHIFT_DEFINITIONS.find(s => s.name === appt.shiftType || appt.shiftType?.includes(s.name));
      if (match) {
        currentShiftInfo = match;
        setSelectedShiftId(match.id);
      }
    }

    // 2. Determine Shift Leader (OTM)
    const hasExistingLeader = Boolean(
      (appt.shiftLeaderEmpId && appt.shiftLeaderEmpId.trim()) ||
      (appt.shiftLeaderName && appt.shiftLeaderName.trim() && appt.shiftLeaderName !== 'ไม่ได้ระบุ' && appt.shiftLeaderName !== '(ยังไม่ได้ระบุหัวหน้างาน OTM)')
    );

    if (hasExistingLeader) {
      if (appt.shiftLeaderEmpId && appt.shiftLeaderEmpId !== 'CUSTOM') {
        setSelectedLeaderEmpId(appt.shiftLeaderEmpId);
      } else if (appt.shiftLeaderName) {
        const preset = SHIFT_LEADERS_PRESETS.find(p => p.fullName === appt.shiftLeaderName);
        if (preset) {
          setSelectedLeaderEmpId(preset.empId);
        } else {
          setSelectedLeaderEmpId('CUSTOM');
          setCustomLeaderName(appt.shiftLeaderName);
          if (appt.shiftLeaderRole) setCustomLeaderRole(appt.shiftLeaderRole);
        }
      } else if (appt.shiftLeaderEmpId === 'CUSTOM') {
        setSelectedLeaderEmpId('CUSTOM');
      }
    } else {
      // 🚀 Auto-inherit OTM across appointments in the same shift!
      const shiftStorageKey = `SMART_DC_SHIFT_LEADER_${currentShiftInfo.id}`;
      const cachedLeaderStr = localStorage.getItem(shiftStorageKey);
      if (cachedLeaderStr) {
        try {
          const cached = JSON.parse(cachedLeaderStr);
          if (cached && (cached.empId || cached.fullName)) {
            setSelectedLeaderEmpId(cached.empId || 'CUSTOM');
            if (cached.empId === 'CUSTOM' || !cached.empId) {
              setCustomLeaderName(cached.fullName || '');
              if (cached.role) setCustomLeaderRole(cached.role);
            }
            if (cached.superiorName) setSelectedSuperiorName(cached.superiorName);

            saveShiftDetailsToDb({
              shiftName: currentShiftInfo.name,
              leaderEmpId: cached.empId,
              leaderName: cached.fullName,
              leaderRole: cached.role,
              leaderDept: cached.dept,
              superiorName: cached.superiorName,
              superiorRole: cached.superiorRole,
            });
          }
        } catch (err) {
          console.warn('[ShiftLeader] Error parsing cached leader', err);
        }
      } else {
        // Fallback: look for sibling appointment in same shift that already has an OTM
        db.appointments
          .filter(a => 
            (a.shiftType === currentShiftInfo.name || a.shiftType === currentShiftInfo.id) &&
            Boolean(a.shiftLeaderName && a.shiftLeaderName !== 'ไม่ได้ระบุ' && a.shiftLeaderName !== '(ยังไม่ได้ระบุหัวหน้างาน OTM)')
          )
          .reverse()
          .first()
          .then(siblingAppt => {
            if (siblingAppt && siblingAppt.shiftLeaderName && siblingAppt.shiftLeaderName !== 'ไม่ได้ระบุ') {
              const preset = SHIFT_LEADERS_PRESETS.find(p => p.fullName === siblingAppt.shiftLeaderName);
              const empId = preset ? preset.empId : (siblingAppt.shiftLeaderEmpId || 'CUSTOM');
              setSelectedLeaderEmpId(empId);
              if (empId === 'CUSTOM') {
                setCustomLeaderName(siblingAppt.shiftLeaderName);
                if (siblingAppt.shiftLeaderRole) setCustomLeaderRole(siblingAppt.shiftLeaderRole);
              }
              if (siblingAppt.reportingToName) setSelectedSuperiorName(siblingAppt.reportingToName);

              try {
                localStorage.setItem(shiftStorageKey, JSON.stringify({
                  empId,
                  fullName: siblingAppt.shiftLeaderName,
                  role: siblingAppt.shiftLeaderRole || 'หัวหน้างาน OTM',
                  dept: siblingAppt.shiftLeaderDept || 'DC Operation Team Manager',
                  superiorName: siblingAppt.reportingToName,
                  superiorRole: siblingAppt.reportingToRole,
                  savedAt: new Date().toISOString()
                }));
              } catch (e) {
                console.warn(e);
              }

              saveShiftDetailsToDb({
                shiftName: currentShiftInfo.name,
                leaderEmpId: empId,
                leaderName: siblingAppt.shiftLeaderName,
                leaderRole: siblingAppt.shiftLeaderRole,
                leaderDept: siblingAppt.shiftLeaderDept,
                superiorName: siblingAppt.reportingToName,
                superiorRole: siblingAppt.reportingToRole,
              });
            }
          })
          .catch(() => {});
      }
    }

    if (appt.reportingToName) {
      const superiorPreset = SUPERIOR_PRESETS.find(s => s.fullName === appt.reportingToName);
      if (superiorPreset) {
        setSelectedSuperiorName(superiorPreset.fullName);
      } else {
        setSelectedSuperiorName('CUSTOM');
        setCustomSuperiorName(appt.reportingToName);
        if (appt.reportingToRole) setCustomSuperiorRole(appt.reportingToRole);
      }
    }
  }, [appt?.id, appt?.shiftType, appt?.shiftLeaderEmpId, appt?.shiftLeaderName, appt?.reportingToName]);

  // Derived effective values for Shift & Hierarchy
  const currentShift = useMemo(() => {
    return SHIFT_DEFINITIONS.find(s => s.id === selectedShiftId) || getDefaultShift();
  }, [selectedShiftId]);

  const selectedLeaderPreset = useMemo(() => {
    return SHIFT_LEADERS_PRESETS.find(p => p.empId === selectedLeaderEmpId);
  }, [selectedLeaderEmpId]);

  const effectiveLeaderName = useMemo(() => {
    if (selectedLeaderEmpId === 'CUSTOM') return customLeaderName.trim();
    if (selectedLeaderPreset) return selectedLeaderPreset.fullName;
    const name = (appt?.shiftLeaderName || '').trim();
    return (name === 'ไม่ได้ระบุ' || name === '(ยังไม่ได้ระบุหัวหน้างาน OTM)') ? '' : name;
  }, [selectedLeaderEmpId, customLeaderName, selectedLeaderPreset, appt?.shiftLeaderName]);

  const hasValidLeader = Boolean(effectiveLeaderName && effectiveLeaderName.trim());

  const effectiveLeaderRole = useMemo(() => {
    if (selectedLeaderEmpId === 'CUSTOM') return customLeaderRole.trim() || 'หัวหน้างานประจำกะ OTM';
    if (selectedLeaderPreset) return selectedLeaderPreset.role || selectedLeaderPreset.department;
    return appt?.shiftLeaderRole || 'หัวหน้างานประจำกะ OTM';
  }, [selectedLeaderEmpId, customLeaderRole, selectedLeaderPreset, appt?.shiftLeaderRole]);

  const effectiveLeaderDept = useMemo(() => {
    if (selectedLeaderPreset) return selectedLeaderPreset.department;
    return appt?.shiftLeaderDept || 'DC Operation';
  }, [selectedLeaderPreset, appt?.shiftLeaderDept]);

  const selectedSuperiorPreset = useMemo(() => {
    return SUPERIOR_PRESETS.find(s => s.fullName === selectedSuperiorName);
  }, [selectedSuperiorName]);

  const effectiveSuperiorName = useMemo(() => {
    if (selectedSuperiorName === 'CUSTOM') return customSuperiorName.trim();
    if (selectedSuperiorPreset) return selectedSuperiorPreset.fullName;
    return appt?.reportingToName || 'ยอดชาย ก้าหรีมล๊ะ';
  }, [selectedSuperiorName, customSuperiorName, selectedSuperiorPreset, appt?.reportingToName]);

  const effectiveSuperiorRole = useMemo(() => {
    if (selectedSuperiorName === 'CUSTOM') return customSuperiorRole.trim() || 'ผู้บังคับบัญชา';
    if (selectedSuperiorPreset) return selectedSuperiorPreset.role;
    return appt?.reportingToRole || 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)';
  }, [selectedSuperiorName, customSuperiorRole, selectedSuperiorPreset, appt?.reportingToRole]);

  // 🚀 Find first incomplete / pending item across the entire appointment (for instant 1-click weighing)
  const firstPendingItem = useMemo(() => {
    return samplingGroups.find(g => 
      g.samplingStatus !== 'ชั่งครบ' && 
      g.samplingStatus !== 'ผิดเกณฑ์' && 
      g.samplingStatus !== 'ไม่มาตามแผน' && 
      g.samplingStatus !== 'ไม่มาส่ง' && 
      g.confirmedActualQty !== 0
    );
  }, [samplingGroups]);

  const handleGoToWeighing = (targetItem?: typeof samplingGroups[0]) => {
    const itemToOpen = targetItem || firstPendingItem;
    if (itemToOpen) {
      navigate(`/appointment/${appt?.apptNbr || apptNbr}?vendor=${encodeURIComponent(itemToOpen.vendorNbr)}&po=${encodeURIComponent(itemToOpen.poNbr)}&item=${encodeURIComponent(itemToOpen.itemId)}`);
    } else {
      navigate(`/appointment/${appt?.apptNbr || apptNbr}`);
    }
  };

  const handleMarkItemNotDelivered = async (item: SamplingGroup) => {
    const confirmed = window.confirm(
      `ยืนยันว่าสินค้า [${item.itemId}] ${item.description} "ไม่มาตามแผน" (ไม่มาส่งในเที่ยวนี้) ใช่หรือไม่?\n\n` +
      `• ระบบจะบันทึกสถานะเป็น "ไม่มาตามแผน"\n` +
      `• บันทึกจำนวนรับจริงเป็น 0 ตะกร้า\n` +
      `• ใบนัดหมายนี้จะสามารถลงนามและปิดงานได้ทันที`
    );
    if (!confirmed) return;

    const now = new Date().toISOString();
    await db.samplingGroups.update(item.id, {
      samplingStatus: 'ไม่มาตามแผน',
      workflowStatus: 'FINALIZED',
      deliveryStatus: 'NOT_DELIVERED',
      confirmedActualQty: 0,
      completedSamples: 0,
      updatedAt: now,
    });

    await db.deliveryExceptions.put({
      id: uuidv4(),
      samplingGroupId: item.id,
      appointmentId: item.appointmentId,
      apptNbr: item.apptNbr,
      poNbr: item.poNbr,
      vendorNbr: item.vendorNbr,
      vendorName: item.vendorName || item.vendorNbr,
      itemId: item.itemId,
      description: item.description,
      plannedContQty: Number(item.apptContQty) || 0,
      importedRcvdContQty: Number(item.importedRcvdContQty) || 0,
      confirmedActualQty: 0,
      exceptionType: 'NOT_DELIVERED',
      exceptionReason: 'สินค้าไม่มาตามแผน (ไม่มาส่ง)',
      status: 'OPEN',
      reportedBy: currentUser?.fullName || 'Receive Staff',
      reportedAt: now,
      backOfficeResolution: null,
      resolvedBy: null,
      resolvedAt: null,
      syncStatus: 'OFFLINE',
      createdAt: now,
      updatedAt: now,
    });

    const allGroups = await db.samplingGroups.where('apptNbr').equals(item.apptNbr).toArray();
    const excCount = allGroups.filter(g => g.id === item.id || g.samplingStatus === 'ไม่มาตามแผน' || g.samplingStatus === 'ไม่มาส่ง' || g.confirmedActualQty === 0).length;
    const doneCount = allGroups.filter(g => g.id === item.id || g.samplingStatus === 'ชั่งครบ' || g.samplingStatus === 'ผิดเกณฑ์' || g.samplingStatus === 'ไม่มาตามแผน' || g.samplingStatus === 'ไม่มาส่ง' || g.confirmedActualQty === 0).length;
    const apptRecord = await db.appointments.where('apptNbr').equals(item.apptNbr).first();
    if (apptRecord) {
      await db.appointments.update(apptRecord.id, {
        deliveryExceptionGroups: excCount,
        completedGroups: doneCount,
        updatedAt: now,
      });
    }
  };

  // Helper to persist shift changes to DB
  const saveShiftDetailsToDb = async (overrides?: {
    shiftName?: string;
    leaderEmpId?: string;
    leaderName?: string;
    leaderRole?: string;
    leaderDept?: string;
    superiorName?: string;
    superiorRole?: string;
  }) => {
    if (!appt) return;
    const now = new Date().toISOString();
    const finalShift = overrides?.shiftName ?? currentShift.name;
    const finalLeaderEmpId = overrides?.leaderEmpId ?? (selectedLeaderPreset ? selectedLeaderPreset.empId : (selectedLeaderEmpId === 'CUSTOM' ? 'CUSTOM' : (appt.shiftLeaderEmpId || '')));
    const finalLeaderName = overrides?.leaderName ?? effectiveLeaderName;
    const finalLeaderRole = overrides?.leaderRole ?? effectiveLeaderRole;
    const finalLeaderDept = overrides?.leaderDept ?? effectiveLeaderDept;
    const finalSuperiorName = overrides?.superiorName ?? effectiveSuperiorName;
    const finalSuperiorRole = overrides?.superiorRole ?? effectiveSuperiorRole;

    await db.appointments.update(appt.id, {
      shiftType: finalShift,
      shiftLeaderEmpId: finalLeaderEmpId,
      shiftLeaderName: finalLeaderName,
      shiftLeaderRole: finalLeaderRole,
      shiftLeaderDept: finalLeaderDept,
      reportingToName: finalSuperiorName,
      reportingToRole: finalSuperiorRole,
      updatedAt: now,
    });

    for (const g of samplingGroups) {
      await db.samplingGroups.update(g.id, {
        shiftType: finalShift,
        shiftLeaderName: finalLeaderName,
        reportingToName: finalSuperiorName,
        updatedAt: now,
      });
    }

    setIsShiftAutoSaved(true);
    setTimeout(() => setIsShiftAutoSaved(false), 3000);
    pushFullStateToServer().catch(console.error);
  };

  const handleSelectShift = (shift: ShiftInfo) => {
    setSelectedShiftId(shift.id);

    // Look up remembered OTM for this shift
    const shiftStorageKey = `SMART_DC_SHIFT_LEADER_${shift.id}`;
    const cachedLeaderStr = localStorage.getItem(shiftStorageKey);
    if (cachedLeaderStr) {
      try {
        const cached = JSON.parse(cachedLeaderStr);
        if (cached && (cached.empId || cached.fullName)) {
          setSelectedLeaderEmpId(cached.empId || 'CUSTOM');
          if (cached.empId === 'CUSTOM' || !cached.empId) {
            setCustomLeaderName(cached.fullName || '');
            if (cached.role) setCustomLeaderRole(cached.role);
          }
          if (cached.superiorName) setSelectedSuperiorName(cached.superiorName);

          saveShiftDetailsToDb({
            shiftName: shift.name,
            leaderEmpId: cached.empId,
            leaderName: cached.fullName,
            leaderRole: cached.role,
            leaderDept: cached.dept,
            superiorName: cached.superiorName,
            superiorRole: cached.superiorRole,
          });
          return;
        }
      } catch (e) {
        console.warn(e);
      }
    }

    saveShiftDetailsToDb({ shiftName: shift.name });
  };

  const handleLeaderSelect = (empId: string) => {
    setSelectedLeaderEmpId(empId);
    const shiftStorageKey = `SMART_DC_SHIFT_LEADER_${currentShift.id}`;

    if (!empId) {
      localStorage.removeItem(shiftStorageKey);
      saveShiftDetailsToDb({
        leaderEmpId: '',
        leaderName: '',
        leaderRole: '',
        leaderDept: '',
      });
      return;
    }

    if (empId === 'CUSTOM') {
      return;
    }

    const preset = SHIFT_LEADERS_PRESETS.find(p => p.empId === empId);
    if (preset) {
      const superior = preset.defaultSuperior;
      const superiorRole = preset.defaultSuperiorRole;
      setSelectedSuperiorName(superior);

      // Save to localStorage for this shift!
      try {
        localStorage.setItem(shiftStorageKey, JSON.stringify({
          empId: preset.empId,
          fullName: preset.fullName,
          role: preset.department || preset.role,
          dept: preset.department,
          superiorName: superior,
          superiorRole: superiorRole,
          savedAt: new Date().toISOString()
        }));
      } catch (e) {
        console.warn(e);
      }

      saveShiftDetailsToDb({
        leaderEmpId: preset.empId,
        leaderName: preset.fullName,
        leaderRole: preset.department || preset.role,
        leaderDept: preset.department,
        superiorName: superior,
        superiorRole: superiorRole,
      });
    }
  };

  const handleSuperiorSelect = (name: string) => {
    setSelectedSuperiorName(name);
    if (name === 'CUSTOM') return;
    const preset = SUPERIOR_PRESETS.find(s => s.fullName === name);
    if (preset) {
      saveShiftDetailsToDb({
        superiorName: preset.fullName,
        superiorRole: preset.role,
      });
    }
  };

  useEffect(() => {
    if (currentUser?.fullName && !receiveName) {
      setReceiveName(currentUser.fullName);
    }
  }, [currentUser]);

  // Group measurements by samplingGroupId
  const measurementsByGroup = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    measurements.forEach(m => {
      const list = map.get(m.samplingGroupId) || [];
      list.push(m);
      map.set(m.samplingGroupId, list);
    });
    return map;
  }, [measurements]);

  // Group items by Vendor and PO
  const itemsByVendorAndPo = useMemo(() => {
    const tree: Record<string, Record<string, SamplingGroup[]>> = {};
    samplingGroups.forEach(g => {
      if (!tree[g.vendorNbr]) tree[g.vendorNbr] = {};
      if (!tree[g.vendorNbr][g.poNbr]) tree[g.vendorNbr][g.poNbr] = [];
      tree[g.vendorNbr][g.poNbr].push(g);
    });
    return tree;
  }, [samplingGroups]);

  // Filtered items by Vendor and PO based on summaryFilter
  const filteredItemsByVendorAndPo = useMemo(() => {
    const tree: Record<string, Record<string, SamplingGroup[]>> = {};
    samplingGroups.forEach(g => {
      if (summaryFilter === 'PASS' && g.samplingStatus !== 'ชั่งครบ') return;
      if (summaryFilter === 'FAIL' && g.samplingStatus !== 'ผิดเกณฑ์') return;
      if (summaryFilter === 'FOCUS' && g.focusStatus !== 'FOCUS') return;

      if (!tree[g.vendorNbr]) tree[g.vendorNbr] = {};
      if (!tree[g.vendorNbr][g.poNbr]) tree[g.vendorNbr][g.poNbr] = [];
      tree[g.vendorNbr][g.poNbr].push(g);
    });
    return tree;
  }, [samplingGroups, summaryFilter]);

  const filteredItemsCount = useMemo(() => {
    return Object.values(filteredItemsByVendorAndPo).reduce((sum, pos) => {
      return sum + Object.values(pos).reduce((pSum, items) => pSum + items.length, 0);
    }, 0);
  }, [filteredItemsByVendorAndPo]);

  const displayedVendors = useMemo(() => {
    return vendors.filter(v => Boolean(filteredItemsByVendorAndPo[v.vendorNbr] && Object.keys(filteredItemsByVendorAndPo[v.vendorNbr]).length > 0));
  }, [vendors, filteredItemsByVendorAndPo]);

  // Auto-heal sampling group completion status from actual recorded measurements
  useEffect(() => {
    if (samplingGroups.length === 0 || measurements.length === 0) return;
    let needsUpdate = false;
    for (const g of samplingGroups) {
      if (g.samplingStatus !== 'ชั่งครบ' && g.samplingStatus !== 'ผิดเกณฑ์' && g.confirmedActualQty !== 0) {
        const groupMeasurements = measurements.filter(m => m.samplingGroupId === g.id && m.isValid !== false);
        const req = g.requiredSamples && g.requiredSamples > 0 ? g.requiredSamples : 1;
        if (groupMeasurements.length >= req) {
          needsUpdate = true;
          db.samplingGroups.update(g.id, {
            completedSamples: groupMeasurements.length,
            validSamples: groupMeasurements.length,
            samplingStatus: 'ชั่งครบ',
            weightResult: 'PASS',
            updatedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }
    if (needsUpdate && appt) {
      db.appointments.update(appt.id, {
        completedGroups: samplingGroups.length,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [samplingGroups, measurements, appt]);

  // Helper to determine if an item is completed (either via status or live measurements)
  const isGroupCompleted = (g: SamplingGroup) => {
    if (
      g.samplingStatus === 'ชั่งครบ' || 
      g.samplingStatus === 'ผิดเกณฑ์' || 
      g.samplingStatus === 'ไม่มาตามแผน' || 
      g.samplingStatus === 'ไม่มาส่ง' || 
      g.deliveryStatus === 'NOT_DELIVERED' || 
      g.confirmedActualQty === 0
    ) {
      return true;
    }
    const groupMeasurements = measurements.filter(m => m.samplingGroupId === g.id && m.isValid !== false);
    const req = g.requiredSamples && g.requiredSamples > 0 ? g.requiredSamples : 1;
    return groupMeasurements.length >= req;
  };

  // Aggregate Metrics
  const totalItems = samplingGroups.length;
  const completedItems = samplingGroups.filter(g => isGroupCompleted(g) && g.samplingStatus !== 'ผิดเกณฑ์' && g.confirmedActualQty !== 0).length;
  const failedItems = samplingGroups.filter(g => g.samplingStatus === 'ผิดเกณฑ์').length;
  const notDeliveredItems = samplingGroups.filter(g => 
    g.samplingStatus === 'ไม่มาตามแผน' || 
    g.samplingStatus === 'ไม่มาส่ง' || 
    g.deliveryStatus === 'NOT_DELIVERED' || 
    g.confirmedActualQty === 0
  ).length;
  const totalWeighedItems = Math.min(totalItems, samplingGroups.filter(isGroupCompleted).length);
  const isAllItemsWeighed = totalItems > 0 && totalWeighedItems >= totalItems;

  const activeFocusItemIds = useMemo(() => {
    return new Set(
      focusMasterItems
        .filter(f => Boolean(f.isActive))
        .map(f => String(f.itemId).trim())
    );
  }, [focusMasterItems]);

  const hasFocusItem = useMemo(() => {
    return samplingGroups.some(g => 
      g.focusStatus === 'FOCUS' || 
      g.focusStatus?.toLowerCase() === 'focus' || 
      (g as any).isFocus ||
      activeFocusItemIds.has(String(g.itemId).trim())
    );
  }, [samplingGroups, activeFocusItemIds]);

  // Auto-sync Focus status from Focus Master if match found
  useEffect(() => {
    if (activeFocusItemIds.size === 0 || samplingGroups.length === 0) return;
    samplingGroups.forEach(g => {
      if (activeFocusItemIds.has(String(g.itemId).trim()) && g.focusStatus !== 'FOCUS') {
        db.samplingGroups.update(g.id, {
          focusStatus: 'FOCUS',
          updatedAt: new Date().toISOString(),
        }).catch(console.error);
      }
    });
  }, [samplingGroups, activeFocusItemIds]);

  const isVN = appt?.carrierCode === 'VN';

  // Toggle Vendor expansion
  const toggleVendor = (vNbr: string) => {
    setExpandedVendors(prev => ({
      ...prev,
      [vNbr]: prev[vNbr] === undefined ? false : !prev[vNbr]
    }));
  };

  // Check active signatures
  const vendorSig = signatures.find(s => s.signerRole === 'VENDOR' || s.signerRole === 'DRIVER');
  const receiveSig = signatures.find(s => s.signerRole === 'RECEIVE');
  const lpsSig = signatures.find(s => s.signerRole === 'LPS');
  const otmSig = signatures.find(s => s.signerRole === 'OTM');

  const isAllOnsiteSigned = (isVN ? !!vendorSig : true) && !!receiveSig && (!hasFocusItem || !!lpsSig);
  const isFullyApproved = isAllOnsiteSigned; // OTM signature removed per DC SOP update (Shift Leader already designated)
  const isJobAlreadyClosed = Boolean(
    appt?.isJobClosed && 
    appt?.closedAt &&
    hasValidLeader
  );

  // Role checks
  const isOtm = currentUser?.role === 'OTM' && currentUser?.department === 'DC Operation Team Manager';
  const isAdmin = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const canApproveOtm = isOtm || isAdmin;

  // LP&S roster (9 authorized officers)
  const lpsRoster = authorizedRoster.filter(r => r.department === 'DC S&LP Supervisor' || r.role === 'LPS');

  // ─── Signature Handlers ─────────────────────────────────────
  // 1. Vendor Signature (VN Only - 1 time per Appointment)
  const handleSaveVendorSignature = async (dataUrl: string) => {
    if (!isAllItemsWeighed) {
      alert(`ไม่สามารถลงนามปิดงานได้: ในใบนัดหมายนี้ยังชั่งสินค้าไม่ครบทุกรายการ (ชั่งแล้ว ${totalWeighedItems}/${totalItems} รายการ) กรุณาชั่งให้ครบก่อน`);
      return;
    }
    if (!appt || !vendorName.trim()) {
      alert('กรุณากรอกชื่อ-นามสกุล ผู้แทนผู้ขาย (Vendor) ก่อนลงนาม');
      return;
    }

    const now = new Date().toISOString();
    const itemIds = samplingGroups.map(g => g.itemId);
    const newVersion = (appt.approvalVersion || 0) + 1;

    const sig: SignatureRecord = {
      id: uuidv4(),
      samplingGroupId: `APPT_${appt.apptNbr}`,
      apptNbr: appt.apptNbr,
      approvalVersion: newVersion,
      signerRole: 'VENDOR',
      signerName: vendorName.trim(),
      signerCompany: samplingGroups[0]?.vendorName || 'ผู้แทนผู้ขาย',
      signatureData: dataUrl,
      signedAt: now,
      signedByUserId: null,
      coveredItemIds: itemIds,
      snapshotData: {
        totalItems,
        completedItems,
        failedItems,
        timestamp: now,
      },
      isValid: true,
      syncStatus: 'SYNCED',
    };

    await db.signatureRecords.add(sig);

    const nextWorkflow = hasFocusItem ? 'PENDING_LPS' : 'FULLY_SIGNED';

    // Update appointment status
    await db.appointments.update(appt.id, {
      driverSignatureStatus: 'SIGNED',
      summaryWorkflowStatus: nextWorkflow,
      updatedAt: now,
    });

    // Update each sampling group
    for (const g of samplingGroups) {
      await db.samplingGroups.update(g.id, {
        workflowStatus: hasFocusItem ? 'PENDING_LPS_SIGN' : 'FULLY_SIGNED',
        updatedAt: now,
      });
    }
  };

  // 2. Receive Staff Signature (1 time per Appointment - covers all items)
  const handleSaveReceiveSignature = async (dataUrl: string) => {
    if (!isAllItemsWeighed) {
      alert(`ไม่สามารถลงนามปิดงานได้: ในใบนัดหมายนี้ยังชั่งสินค้าไม่ครบทุกรายการ (ชั่งแล้ว ${totalWeighedItems}/${totalItems} รายการ) กรุณาชั่งให้ครบก่อน`);
      return;
    }
    if (!appt || !receiveName.trim()) {
      alert('กรุณากรอกชื่อ-นามสกุล พนักงานตรวจรับ (Receive) ก่อนลงนาม');
      return;
    }

    const now = new Date().toISOString();
    const itemIds = samplingGroups.map(g => g.itemId);
    const newVersion = (appt.approvalVersion || 0) + 1;

    const sig: SignatureRecord = {
      id: uuidv4(),
      samplingGroupId: `APPT_${appt.apptNbr}`,
      apptNbr: appt.apptNbr,
      approvalVersion: newVersion,
      signerRole: 'RECEIVE',
      signerName: receiveName.trim(),
      signerCompany: 'SRRDC Receiving Fresh',
      signatureData: dataUrl,
      signedAt: now,
      signedByUserId: currentUser?.id || null,
      coveredItemIds: itemIds,
      snapshotData: {
        totalItems,
        completedItems,
        failedItems,
        timestamp: now,
      },
      isValid: true,
      syncStatus: 'SYNCED',
    };

    await db.signatureRecords.add(sig);

    // Update appointment status
    await db.appointments.update(appt.id, {
      receiveSignatureStatus: 'SIGNED',
      updatedAt: now,
    });

    // Auto-sync completed weighing records to Google Sheets if Webhook is configured
    if (getGoogleSheetsWebhookUrl()) {
      syncAppointmentToGoogleSheets(appt.apptNbr).catch(console.error);
    }
  };

  // 3. LP&S Signature (Only if Focus Item exists)
  const handleSaveLpsSignature = async (dataUrl: string) => {
    if (!isAllItemsWeighed) {
      alert(`ไม่สามารถลงนามปิดงานได้: ในใบนัดหมายนี้ยังชั่งสินค้าไม่ครบทุกรายการ (ชั่งแล้ว ${totalWeighedItems}/${totalItems} รายการ) กรุณาชั่งให้ครบก่อน`);
      return;
    }
    if (!appt || !lpsName.trim()) {
      alert('กรุณาเลือกเจ้าหน้าที่ความปลอดภัย (DC S&LP)');
      return;
    }

    const now = new Date().toISOString();
    const itemIds = samplingGroups.filter(g => g.focusStatus === 'FOCUS').map(g => g.itemId);

    const sig: SignatureRecord = {
      id: uuidv4(),
      samplingGroupId: `APPT_${appt.apptNbr}`,
      apptNbr: appt.apptNbr,
      approvalVersion: appt.approvalVersion || 1,
      signerRole: 'LPS',
      signerName: lpsName.trim(),
      signerCompany: 'DC S&LP Supervisor',
      signatureData: dataUrl,
      signedAt: now,
      signedByUserId: null,
      coveredItemIds: itemIds,
      isValid: true,
      syncStatus: 'SYNCED',
    };

    await db.signatureRecords.add(sig);

    await db.appointments.update(appt.id, {
      lpsSignatureStatus: 'SIGNED',
      summaryWorkflowStatus: 'FULLY_SIGNED',
      updatedAt: now,
    });

    for (const g of samplingGroups) {
      await db.samplingGroups.update(g.id, {
        workflowStatus: 'FULLY_SIGNED',
        updatedAt: now,
      });
    }
  };

  // Reset signature handlers (allows re-signing before job is closed)
  const handleResetVendorSignature = async () => {
    if (!appt || isJobAlreadyClosed) return;
    const confirmed = window.confirm('ต้องการล้างลายเซ็นผู้แทน Vendor เพื่อเซ็นใหม่หรือไม่?');
    if (!confirmed) return;
    if (vendorSig) {
      await db.signatureRecords.delete(vendorSig.id);
    }
    await db.appointments.update(appt.id, {
      driverSignatureStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleResetReceiveSignature = async () => {
    if (!appt || isJobAlreadyClosed) return;
    const confirmed = window.confirm('ต้องการล้างลายเซ็นพนักงานตรวจรับ เพื่อเซ็นใหม่หรือไม่?');
    if (!confirmed) return;
    if (receiveSig) {
      await db.signatureRecords.delete(receiveSig.id);
    }
    await db.appointments.update(appt.id, {
      receiveSignatureStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleResetLpsSignature = async () => {
    if (!appt || isJobAlreadyClosed) return;
    const confirmed = window.confirm('ต้องการล้างลายเซ็น LP&S เพื่อเซ็นใหม่หรือไม่?');
    if (!confirmed) return;
    if (lpsSig) {
      await db.signatureRecords.delete(lpsSig.id);
    }
    await db.appointments.update(appt.id, {
      lpsSignatureStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
    });
  };

  // 3. OTM Approval (PIN/Credential only, no finger drawing)
  const handleOtmApprove = async () => {
    if (!appt) return;
    if (!isAllItemsWeighed) {
      alert(`ไม่สามารถอนุมัติปิดงานได้: ในใบนัดหมายนี้ยังชั่งสินค้าไม่ครบทุกรายการ (ชั่งแล้ว ${totalWeighedItems}/${totalItems} รายการ) กรุณาชั่งให้ครบก่อน`);
      return;
    }
    if (!canApproveOtm) {
      alert('สิทธิ์ไม่เพียงพอ: ผู้ที่สามารถอนุมัติ OTM ได้ต้องสังกัดแผนก DC Operation Team Manager');
      return;
    }

    // VN requires Vendor signature, PR does NOT
    if (isVN && !vendorSig) {
      alert('ไม่สามารถอนุมัติได้: สำหรับงาน VN ผู้แทนผู้ขาย (Vendor) ต้องลงนามรับรองก่อน');
      return;
    }

    if (!receiveSig) {
      alert('ไม่สามารถอนุมัติได้: พนักงานตรวจรับ (Receive) ต้องลงนามรับรองก่อน');
      return;
    }

    if (hasFocusItem && !lpsSig) {
      alert('ไม่สามารถอนุมัติได้: ใบนัดหมายนี้มีสินค้า Focus ต้องได้รับการลงนามจาก DC S&LP ก่อน');
      return;
    }

    setIsOtmApproving(true);
    try {
      const now = new Date().toISOString();
      const otmName = currentUser?.fullName || 'DC Operation Team Manager';
      const digitalSeal = generateDigitalSeal(otmName, now);

      const sig: SignatureRecord = {
        id: uuidv4(),
        samplingGroupId: `APPT_${appt.apptNbr}`,
        apptNbr: appt.apptNbr,
        approvalVersion: appt.approvalVersion || 1,
        signerRole: 'OTM',
        signerName: otmName,
        signerCompany: 'Lotus SRRDC OTM Team',
        signatureData: digitalSeal,
        signedAt: now,
        signedByUserId: currentUser?.id || null,
        coveredItemIds: samplingGroups.map(g => g.itemId),
        isValid: true,
        syncStatus: 'SYNCED',
      };

      await db.signatureRecords.add(sig);

      await db.appointments.update(appt.id, {
        otmApprovalStatus: 'APPROVED',
        summaryWorkflowStatus: 'FULLY_SIGNED',
        updatedAt: now,
      });

      for (const g of samplingGroups) {
        await db.samplingGroups.update(g.id, {
          workflowStatus: 'FULLY_SIGNED',
          updatedAt: now,
        });
      }

      alert('อนุมัติผลสุ่มชั่งดิจิทัล (OTM Approval) สำเร็จเรียบร้อย');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setIsOtmApproving(false);
    }
  };

  // ─── Close Job Handler (ปิดงาน) ────────────────────────────
  const handleCloseJob = async () => {
    if (!appt || isClosingJob || isJobAlreadyClosed) return;

    if (!hasValidLeader) {
      alert('ไม่สามารถปิดงานได้: กรุณาเลือกหรือระบุหัวหน้างานประจำกะ OTM ในข้อ 2 ก่อน');
      return;
    }

    if (!isAllOnsiteSigned) {
      alert('ไม่สามารถปิดงานได้: กรุณาลงนามรับรองผลหน้างานให้ครบถ้วนก่อน');
      return;
    }

    setIsClosingJob(true);
    try {
      const now = new Date().toISOString();
      const finalWorkflow = 'FULLY_SIGNED';

      const shiftTypeVal = currentShift ? currentShift.name : 'กะเช้า';
      const finalLeaderEmpId = selectedLeaderPreset ? selectedLeaderPreset.empId : (selectedLeaderEmpId === 'CUSTOM' ? 'CUSTOM' : (appt.shiftLeaderEmpId || ''));
      const finalLeaderName = effectiveLeaderName;
      const finalLeaderRole = effectiveLeaderRole || 'หัวหน้างานประจำกะ OTM';
      const finalLeaderDept = effectiveLeaderDept || 'DC Operation';
      const finalSuperiorName = effectiveSuperiorName || 'ยอดชาย ก้าหรีมล๊ะ';
      const finalSuperiorRole = effectiveSuperiorRole || 'DC Operation Manager (ผู้จัดการฝ่ายปฏิบัติการ DC)';

      await db.appointments.update(appt.id, {
        isJobClosed: true,
        closedAt: now,
        summaryWorkflowStatus: finalWorkflow,
        shiftType: shiftTypeVal,
        shiftLeaderEmpId: finalLeaderEmpId,
        shiftLeaderName: finalLeaderName,
        shiftLeaderRole: finalLeaderRole,
        shiftLeaderDept: finalLeaderDept,
        reportingToName: finalSuperiorName,
        reportingToRole: finalSuperiorRole,
        updatedAt: now,
      });

      for (const g of samplingGroups) {
        await db.samplingGroups.update(g.id, {
          isJobClosed: true,
          closedAt: now,
          workflowStatus: finalWorkflow,
          shiftType: shiftTypeVal,
          shiftLeaderName: finalLeaderName,
          reportingToName: finalSuperiorName,
          updatedAt: now,
        });
      }

      // Sync across all devices immediately
      pushFullStateToServer().catch(console.error);

      alert(`✓ ปิดงานใบนัดหมาย ${appt.apptNbr} เสร็จสิ้นสมบูรณ์เรียบร้อยแล้ว (มีหัวหน้างาน ${finalLeaderName} กำกับดูแล)`);

      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกปิดงาน');
    } finally {
      setIsClosingJob(false);
    }
  };

  // ─── Excel Export for Appointment Summary ──────────────────
  const handleExportSummaryExcel = async () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Load basket master from database for accurate tare weights
      const masterBaskets = await db.basketMaster.toArray().catch(() => []);
      const basketWeightMap = new Map<string, number>();
      masterBaskets.forEach(b => {
        if (b.code) basketWeightMap.set(b.code.trim().toUpperCase(), b.tareWeightKg);
      });
      const FALLBACK_BASKET_WEIGHTS: Record<string, number> = {
        ZN: 2.20, Z: 2.20, W: 0.85, X: 0.60, F: 2.40, Y: 1.40, YN: 1.37, SF: 2.40, XN: 0.50
      };

      // Sheet 1: สรุปผลการสุ่มชั่ง
      const summaryRows = samplingGroups.map((g, idx) => {
        const groupMs = measurementsByGroup.get(g.id) || [];
        const actualTotal = groupMs.reduce((sum, m) => sum + m.netWeightKg, 0);
        const avgNet = groupMs.length > 0 ? actualTotal / groupMs.length : 0;
        const totalCases = g.confirmedActualQty ?? g.apptContQty ?? 0;
        const std = g.standardWeightKg ?? 0;
        const cn = calculateCN(std, avgNet, totalCases);

        const containerType = (g.containerType || g.defaultBasketCode || '-').trim().toUpperCase();
        const isBasketO = containerType === 'O' || groupMs.some(m => m.basketCode === 'O');

        let tarePerBasket: number = 0;
        if (isBasketO) {
          // ชนิด O: ค่าน้ำหนักที่พนักงานกรอกเอง
          const recO = groupMs.find(m => m.basketCode === 'O' && m.tareWeightKg !== undefined && m.tareWeightKg !== null);
          tarePerBasket = recO?.tareWeightKg ?? g.defaultTareWeightKg ?? 0;
        } else {
          // ตะกร้ามาตรฐานอื่นๆ (X, W, ZN ฯลฯ): ดึงน้ำหนักตามข้อมูลหลังบ้าน Basket Master
          if (groupMs.length > 0 && groupMs[0].tareWeightKg) {
            tarePerBasket = groupMs[0].tareWeightKg;
          } else if (basketWeightMap.has(containerType)) {
            tarePerBasket = basketWeightMap.get(containerType)!;
          } else if (FALLBACK_BASKET_WEIGHTS[containerType] !== undefined) {
            tarePerBasket = FALLBACK_BASKET_WEIGHTS[containerType];
          } else if (g.defaultTareWeightKg) {
            tarePerBasket = g.defaultTareWeightKg;
          } else {
            tarePerBasket = 0.60;
          }
        }

        return {
          'ลำดับ': idx + 1,
          'ใบนัดหมาย': g.apptNbr,
          'สายรถ': appt?.carrierCode || 'VN',
          'รหัสผู้ขาย': g.vendorNbr,
          'ชื่อผู้ขาย': g.vendorName,
          'PO': g.poNbr,
          'รหัส ITEM': g.itemId,
          'ชื่อสินค้า': g.description,
          'ชนิดตะกร้า': containerType,
          'น้ำหนักภาชนะ (กก.)': Number(tarePerBasket.toFixed(2)),
          'สินค้า Focus': g.focusStatus === 'FOCUS' ? 'YES' : 'NO',
          'จำนวนตามแผน (กล่อง)': g.apptContQty ?? 0,
          'จำนวนรับจริง (กล่อง)': totalCases,
          'ต้องสุ่มชั่ง (10%)': g.requiredSamples,
          'ชั่งแล้ว': groupMs.length,
          'น้ำหนักมาตรฐาน (kg)': std,
          'น้ำหนักสุทธิเฉลี่ย (kg)': Number(avgNet.toFixed(3)),
          'ผลการตรวจ': g.samplingStatus,
          'ยอด CN (kg)': cn.isEligibleForCN ? cn.cnTotalKg : 0,
        };
      });

      const ws1 = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, ws1, 'สรุปผลการสุ่มชั่ง');

      // Sheet: ชั่งแล้ว (เฉพาะรายการที่ชั่งแล้ว อัปเดตเรียลไทม์)
      const weighedSummaryRows = summaryRows.filter(r => r['ชั่งแล้ว'] > 0 || r['ผลการตรวจ'] !== 'รอชั่ง');
      const wsWeighed = XLSX.utils.json_to_sheet(weighedSummaryRows.length > 0 ? weighedSummaryRows : [
        { 'ลำดับ': '-', 'ใบนัดหมาย': apptNbr, 'ผลการตรวจ': 'ยังไม่มีรายการที่ชั่งเสร็จ' }
      ]);
      XLSX.utils.book_append_sheet(wb, wsWeighed, 'ชั่งแล้ว');

      // Sheet 2: รายการ CN Cases (if any)
      const cnRows = cnCases.map((cn, idx) => ({
        'ลำดับ': idx + 1,
        'ใบนัดหมาย': cn.apptNbr,
        'ผู้ขาย': cn.vendorName,
        'PO': cn.poNbr,
        'รหัส ITEM': cn.itemId,
        'ชื่อสินค้า': cn.description,
        'จำนวนรับจริง (case)': cn.totalActualCases,
        'น้ำหนักมาตรฐาน size_(Kg)': cn.standardWeightKg,
        'น้ำหนักเฉลี่ย Actual_(Kg)': cn.actualAverageNetKg,
        'ขาดต่อกล่อง Kg/case': cn.shortagePerCaseKg,
        'ยอด CN รวม (kg)': cn.cnTotalKg,
        'สถานะ': cn.cnStatus,
        'ผู้บันทึก': cn.recordedBy,
      }));

      if (cnRows.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(cnRows);
        XLSX.utils.book_append_sheet(wb, ws2, 'รายการ CN');
      }

      // Download
      XLSX.writeFile(wb, `SMART_DC_Summary_Appt_${apptNbr}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการส่งออก Excel');
    } finally {
      setIsExporting(false);
    }
  };

  if (!appt) {
    return (
      <Layout title={`ใบนัดหมาย ${apptNbr}`} showBack backTo="/dashboard">
        <div className="p-8 text-center text-[#6E6E6E]">กำลังโหลดข้อมูล...</div>
      </Layout>
    );
  }

  // Total CN amount
  const totalCnKg = cnCases.reduce((sum, c) => sum + (c.cnTotalKg || 0), 0);

  return (
    <Layout 
      title={`ใบนัดหมาย ${apptNbr}`} 
      showBack 
      backTo={firstPendingItem 
        ? `/appointment/${apptNbr}?vendor=${encodeURIComponent(firstPendingItem.vendorNbr)}&po=${encodeURIComponent(firstPendingItem.poNbr)}&item=${encodeURIComponent(firstPendingItem.itemId)}` 
        : `/appointment/${apptNbr}`
      }
    >
      <div 
        style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom, 0px))' }}
        className="p-3.5 sm:p-5 space-y-4 max-w-2xl sm:max-w-3xl mx-auto text-[#1F1F1F] w-full overflow-x-hidden"
      >

        {/* ─── BANNER: APPOINTMENT NOT FULLY WEIGHED ──────────────── */}
        {!isAllItemsWeighed && (
          <div className="bg-[#FFF9DB] border-2 border-[#F59F00] p-4 sm:p-5 rounded-3xl shadow-sm flex flex-wrap justify-between items-center gap-3 animate-fadeIn">
            <div className="flex items-start gap-3 flex-1 min-w-[240px]">
              <div className="w-10 h-10 rounded-2xl bg-[#FFE066] flex items-center justify-center shrink-0 text-[#D9480F]">
                <AlertTriangle className="w-5 h-5 text-[#D9480F]" />
              </div>
              <div className="space-y-0.5">
                <span className="font-black text-sm text-[#D9480F] block">
                  ใบนัดหมายนี้ยังชั่งสินค้าไม่หมด
                </span>
                <p className="text-xs text-[#7D6608] leading-relaxed">
                  ชั่งแล้ว <b>{totalWeighedItems}</b> / <b>{totalItems}</b> รายการ (ยังรอชั่งอีก <b>{totalItems - totalWeighedItems}</b> รายการ)
                  <br />
                  <span className="font-bold text-[#D9480F]">ระบบล็อคการลงนาม</span> ต้องชั่งให้ครบทุกรายการก่อนจึงจะสามารถลงนามปิดงานได้
                </p>
              </div>
            </div>

            <button
              onClick={() => handleGoToWeighing()}
              className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>กลับไปหน้าชั่งสินค้า {firstPendingItem ? `[${firstPendingItem.itemId}]` : ''}</span>
            </button>
          </div>
        )}

        {/* ─── 1. TOP HEADER SUMMARY CARD ───────────────────────── */}
        <div className="bg-[#FFFDF9] rounded-3xl p-4.5 sm:p-5 pt-5 sm:pt-6 border border-[#E8E1D8] shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-xl sm:text-2xl font-black text-[#1F1F1F] leading-normal pt-0.5">
                ใบนัดหมาย {appt.apptNbr}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border shrink-0 ${
                isVN
                  ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]'
                  : 'bg-[#FFF0E6] text-[#F76707] border-[#FFD8BF]'
              }`}>
                {appt.carrierCode}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleSyncGoogleSheets}
                disabled={isSyncingSheets}
                className="bg-[#EBF5FB] hover:bg-[#D4E6F1] text-[#1B4F72] border border-[#A9CCE3] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
                title="ส่งข้อมูลการชั่งและเคส CN เข้า Google Sheets"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B4F72]" />
                <span>{isSyncingSheets ? 'กำลังส่งข้อมูล...' : 'ส่ง Google Sheets'}</span>
              </button>

              <button
                onClick={handleExportSummaryExcel}
                disabled={isExporting}
                className="bg-[#EAF7ED] hover:bg-[#D4EED9] text-[#0B5E2B] border border-[#AEE0BD] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'กำลังออกไฟล์...' : 'Excel Summary'}</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-[#6E6E6E] mt-0.5 break-words">
            วันที่รับ: <b className="text-[#1F1F1F]">{formatThaiDate(extractDateFromApptTime(appt.apptTime) || appt.receiveDate)}</b> · เวลา: <b className="text-[#1F1F1F]">{formatApptTime(appt.apptTime)}</b>
          </p>

          {/* Shift & Chain of Command Badge if set */}
          {(appt.shiftType || effectiveLeaderName) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E8E1D8] text-xs">
              <span className="px-2.5 py-0.5 rounded-lg bg-[#FEF9E7] text-[#9A7D0A] font-black border border-[#FAD7A0] flex items-center gap-1 shadow-2xs">
                <span>{currentShift.icon}</span>
                <span>{appt.shiftType || currentShift.name}</span>
              </span>
              {effectiveLeaderName && (
                <span className="text-[#1F1F1F]">
                  หัวหน้างาน OTM: <b className="text-[#0B5E2B] font-bold">{effectiveLeaderName}</b> {effectiveLeaderRole ? <span className="text-[#6E6E6E]">({effectiveLeaderRole})</span> : ''}
                </span>
              )}
            </div>
          )}

          {/* Quick Metrics Bar: Interactive Filter Buttons */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 pt-2.5 border-t border-[#E8E1D8] text-center text-xs">
            <button
              type="button"
              onClick={() => {
                setSummaryFilter('ALL');
                document.getElementById('hierarchical-items-summary')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-2 sm:p-2.5 rounded-2xl border transition-all text-center cursor-pointer active:scale-95 ${
                summaryFilter === 'ALL'
                  ? 'bg-[#1F1F1F] text-white border-[#1F1F1F] ring-2 ring-offset-1 ring-[#1F1F1F] shadow-md scale-102'
                  : 'bg-[#F7F2EA] border-[#E8E1D8] text-[#1F1F1F] hover:bg-[#E8E1D8]/70'
              }`}
              title="แสดงรายการทั้งหมด"
            >
              <span className={`block text-[9.5px] sm:text-[11px] font-bold ${summaryFilter === 'ALL' ? 'text-white/80' : 'text-[#6E6E6E]'}`}>
                ITEM ทั้งหมด
              </span>
              <span className="font-black text-sm sm:text-base block mt-0.5">{totalItems}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSummaryFilter(prev => prev === 'PASS' ? 'ALL' : 'PASS');
                document.getElementById('hierarchical-items-summary')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-2 sm:p-2.5 rounded-2xl border transition-all text-center cursor-pointer active:scale-95 ${
                summaryFilter === 'PASS'
                  ? 'bg-[#12803C] text-white border-[#12803C] ring-2 ring-offset-1 ring-[#12803C] shadow-md scale-102'
                  : 'bg-[#EAF7ED] border-[#AEE0BD] text-[#0B5E2B] hover:bg-[#D4EED9]'
              }`}
              title="กดกรองเฉพาะรายการที่ผ่านเกณฑ์"
            >
              <span className={`block text-[9.5px] sm:text-[11px] font-bold ${summaryFilter === 'PASS' ? 'text-white/90' : 'text-[#0B5E2B]'}`}>
                ผ่านเกณฑ์
              </span>
              <span className={`font-black text-sm sm:text-base block mt-0.5 ${summaryFilter === 'PASS' ? 'text-white' : 'text-[#12803C]'}`}>
                {completedItems}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = summaryFilter === 'FAIL' ? 'ALL' : 'FAIL';
                setSummaryFilter(next);
                setTimeout(() => {
                  if (next === 'FAIL') {
                    document.getElementById('cn-cases-section')?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    document.getElementById('hierarchical-items-summary')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }, 50);
              }}
              className={`p-2 sm:p-2.5 rounded-2xl border transition-all text-center cursor-pointer active:scale-95 ${
                summaryFilter === 'FAIL'
                  ? 'bg-[#E03131] text-white border-[#E03131] ring-2 ring-offset-1 ring-[#E03131] shadow-md scale-102'
                  : failedItems > 0
                  ? 'bg-[#FDE8E8] border-[#E03131] text-[#E03131] hover:bg-[#FBD5D5]'
                  : 'bg-[#F7F2EA] border-[#E8E1D8] text-[#6E6E6E] hover:bg-[#E8E1D8]/70'
              }`}
              title="กดเพื่อเปิด/ปิดดูเฉพาะรายการที่ผิดเกณฑ์ (CN)"
            >
              <span className={`block text-[9.5px] sm:text-[11px] font-bold ${summaryFilter === 'FAIL' ? 'text-white/90' : failedItems > 0 ? 'text-[#E03131]' : 'text-[#6E6E6E]'}`}>
                ผิดเกณฑ์ (CN)
              </span>
              <span className={`font-black text-sm sm:text-base block mt-0.5 ${summaryFilter === 'FAIL' ? 'text-white' : failedItems > 0 ? 'text-[#E03131]' : 'text-[#1F1F1F]'}`}>
                {failedItems}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSummaryFilter(prev => prev === 'FOCUS' ? 'ALL' : 'FOCUS');
                document.getElementById('hierarchical-items-summary')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`p-2 sm:p-2.5 rounded-2xl border transition-all text-center cursor-pointer active:scale-95 ${
                summaryFilter === 'FOCUS'
                  ? 'bg-[#D9480F] text-white border-[#D9480F] ring-2 ring-offset-1 ring-[#D9480F] shadow-md scale-102'
                  : 'bg-[#FEF9E7] border-[#FAD7A0] text-[#9A7D0A] hover:bg-[#FFF3C4]'
              }`}
              title="กดกรองเฉพาะสินค้า Focus"
            >
              <span className={`block text-[9.5px] sm:text-[11px] font-bold ${summaryFilter === 'FOCUS' ? 'text-white/90' : 'text-[#9A7D0A]'}`}>
                Focus Item
              </span>
              <span className={`font-black text-sm sm:text-base block mt-0.5 ${summaryFilter === 'FOCUS' ? 'text-white' : 'text-[#9A7D0A]'}`}>
                {hasFocusItem ? 'มี' : 'ไม่มี'}
              </span>
            </button>
          </div>
        </div>

        {/* ─── 2. CN CASES BANNER (ONLY SHOWS WHEN 'ผิดเกณฑ์ (CN)' IS CLICKED) ────── */}
        {summaryFilter === 'FAIL' && cnCases.length > 0 && (
          <div id="cn-cases-section" className="bg-[#FFF0E6] rounded-3xl p-4 sm:p-5 border-2 border-[#FF922B] shadow-md space-y-3 animate-fadeIn">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#E03131] shrink-0" />
                <span className="font-black text-[#E03131] text-sm sm:text-base">
                  รายการขอเปิด CN ({cnCases.length} รายการ)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-[#E03131] text-white font-black text-xs px-2.5 py-1 rounded-xl shrink-0 shadow-2xs">
                  รวม {totalCnKg.toFixed(2)} kg
                </span>
                <button
                  type="button"
                  onClick={() => setSummaryFilter('ALL')}
                  className="text-[11px] font-bold text-[#E03131] hover:bg-white bg-white/80 px-2.5 py-1 rounded-xl border border-[#FF922B]/50 active:scale-95 transition-all shadow-2xs cursor-pointer"
                  title="ปิดกล่อง CN และกลับไปดูรายการทั้งหมด"
                >
                  ✕ ซ่อนกล่อง CN (ดูทั้งหมด)
                </button>
              </div>
            </div>

            <p className="text-xs text-[#7D6608] leading-relaxed">
              สูตรคำนวณตามมาตรฐาน SRRDC: (น้ำหนักมาตรฐานต่อกล่อง − น้ำหนักสุทธิเฉลี่ยต่อกล่อง) × จำนวนกล่องที่รับจริง
            </p>

            <div className="space-y-2">
              {cnCases.map((cn) => (
                <div key={cn.id} className="bg-white p-3 sm:p-3.5 rounded-2xl border border-[#FFD8BF] text-xs space-y-2 shadow-xs">
                  <div className="flex flex-wrap justify-between items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-[#1F1F1F] block text-xs sm:text-sm break-words">
                        [{cn.itemId}] {cn.description}
                      </span>
                      <span className="text-[11px] text-[#6E6E6E] block mt-0.5 break-words">
                        PO: {cn.poNbr} · ผู้ขาย: {cn.vendorName}
                      </span>
                    </div>
                    <span className="bg-[#E03131] text-white font-black px-2.5 py-1 rounded-lg text-xs shrink-0 shadow-2xs">
                      -{cn.cnTotalKg} kg
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[10px] text-center bg-[#F7F2EA] p-2 rounded-xl text-[#6E6E6E]">
                    <div className="min-w-0"><span>(case):</span> <b className="text-[#1F1F1F] block text-xs">{cn.totalActualCases}</b></div>
                    <div className="min-w-0"><span>size_Kg:</span> <b className="text-[#1F1F1F] block text-xs">{cn.standardWeightKg}</b></div>
                    <div className="min-w-0"><span>Actual_Kg:</span> <b className="text-[#12803C] block text-xs">{cn.actualAverageNetKg}</b></div>
                    <div className="min-w-0"><span>Kg/case:</span> <b className="text-[#E03131] block text-xs">-{cn.shortagePerCaseKg}</b></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── 3. HIERARCHICAL ITEM SUMMARY ────────────────────── */}
        {/* Appointment -> Vendor -> PO -> ITEM */}
        <div id="hierarchical-items-summary" className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 px-1">
            <h3 className="text-sm sm:text-base font-black text-[#1F1F1F] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#12803C]" />
              รายละเอียดรายการชั่งสินค้าทั้งหมด
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6E6E6E] font-bold">
                {summaryFilter === 'ALL' ? `${totalItems} รายการ` : `ตรงตามเงื่อนไข ${filteredItemsCount} / ${totalItems} รายการ`}
              </span>
              {summaryFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSummaryFilter('ALL')}
                  className="text-[11px] font-bold text-[#12803C] hover:underline bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#AEE0BD]"
                >
                  ✕ แสดงทั้งหมด
                </button>
              )}
            </div>
          </div>

          {displayedVendors.length === 0 ? (
            <div className="bg-[#FFFDF9] rounded-3xl p-6 sm:p-8 text-center text-xs text-[#6E6E6E] border border-[#E8E1D8] space-y-2">
              <p>ไม่พบรายการสินค้าที่ตรงกับตัวกรอง "{summaryFilter === 'PASS' ? 'ผ่านเกณฑ์' : summaryFilter === 'FAIL' ? 'ผิดเกณฑ์ (CN)' : 'Focus Item'}"</p>
              <button
                type="button"
                onClick={() => setSummaryFilter('ALL')}
                className="text-[#12803C] font-bold underline cursor-pointer"
              >
                กลับไปดูรายการทั้งหมด ({totalItems} รายการ)
              </button>
            </div>
          ) : (
            displayedVendors.map((vendor) => {
              const isExpanded = expandedVendors[vendor.vendorNbr] !== false; // default true
              const vendorPOs = filteredItemsByVendorAndPo[vendor.vendorNbr] || {};

              return (
                <div key={vendor.vendorNbr} className="bg-[#FFFDF9] rounded-3xl border border-[#E8E1D8] shadow-xs overflow-hidden">
                  {/* Vendor Header */}
                  <div
                    onClick={() => toggleVendor(vendor.vendorNbr)}
                    className="p-3.5 sm:p-4 bg-[#F7F2EA]/80 border-b border-[#E8E1D8] flex justify-between items-center cursor-pointer hover:bg-[#F7F2EA] transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="w-4 h-4 text-[#12803C] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm text-[#1F1F1F] block break-words">
                          {vendor.vendorNbr} · {vendor.vendorName}
                        </span>
                        <span className="text-[11px] text-[#6E6E6E] block">
                          {Object.keys(vendorPOs).length} ใบสั่งซื้อ (PO)
                        </span>
                      </div>
                    </div>

                  <button className="text-[#6E6E6E] p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* POs and Items List (Compact Table Layout) */}
                {isExpanded && (
                  <div className="p-3 sm:p-3.5 space-y-3.5">
                    {Object.entries(vendorPOs).map(([poNbr, items]) => (
                      <div key={poNbr} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-[#0B5E2B] bg-[#EAF7ED] px-3 py-1.5 rounded-xl border border-[#AEE0BD]">
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-[#12803C]" />
                            <span>ใบสั่งซื้อ PO: {poNbr}</span>
                          </div>
                          <span className="text-[11px] bg-white text-[#12803C] px-2 py-0.5 rounded-md border border-[#AEE0BD] font-bold">
                            {items.length} ITEM
                          </span>
                        </div>

                        {/* Compact Table */}
                        <div className="overflow-x-auto rounded-xl border border-[#E8E1D8] bg-white shadow-2xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#F7F2EA] text-[#6E6E6E] text-[11px] font-bold border-b border-[#E8E1D8]">
                                <th className="py-2.5 px-3 text-left">รายการสินค้า (ITEM)</th>
                                <th className="py-2.5 px-2 text-center w-20">ตามแผน</th>
                                <th className="py-2.5 px-2 text-center w-20">รับจริง</th>
                                <th className="py-2.5 px-2 text-center w-18">สุ่มชั่ง</th>
                                <th className="py-2.5 px-2 text-center w-28">นน.เฉลี่ย (เกณฑ์)</th>
                                <th className="py-2.5 px-3 text-center w-36">ผลการตรวจ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E1D8]/60">
                              {items.map((item) => {
                                const itemMs = measurementsByGroup.get(item.id) || [];
                                const actualTotal = itemMs.reduce((sum, m) => sum + m.netWeightKg, 0);
                                const itemReq = (item.requiredSamples && item.requiredSamples > 0)
                                  ? item.requiredSamples
                                  : Math.max(1, calculateRequiredSamples(item.confirmedActualQty ?? item.apptContQty ?? 1));
                                const isWeighed = itemMs.length > 0 && itemMs.length >= itemReq;
                                const avgNet = isWeighed ? actualTotal / itemMs.length : 0;
                                const totalCases = item.confirmedActualQty ?? item.apptContQty ?? 0;
                                const std = item.standardWeightKg ?? 0;
                                const cn = isWeighed ? calculateCN(std, avgNet, totalCases) : {
                                  isEligibleForCN: false,
                                  totalActualCases: totalCases,
                                  standardWeightKg: std,
                                  actualAverageNetKg: 0,
                                  shortagePerCaseKg: 0,
                                  cnTotalKg: 0,
                                };
                                const isCn = isWeighed && item.samplingStatus === 'ผิดเกณฑ์' && cn.isEligibleForCN;
                                const itemNoun = getContainerNoun(item.uda6 || item.containerType);

                                return (
                                  <tr
                                    key={item.id}
                                    id={`summary-item-${item.itemId}`}
                                    onClick={() => handleGoToWeighing(item)}
                                    title="คลิกเพื่อเปิดหน้าชั่งสินค้ารายการนี้ทันที"
                                    className={`transition-all duration-300 cursor-pointer ${
                                      highlightItem === item.itemId
                                        ? 'bg-[#EAF7ED] ring-2 ring-[#12803C] shadow-xs'
                                        : isCn 
                                        ? 'bg-[#FFF5F5] hover:bg-[#FFE3E3]' 
                                        : item.samplingStatus === 'ชั่งครบ'
                                        ? 'hover:bg-[#F4FAF5]'
                                        : 'hover:bg-[#FEF9E7] bg-[#FFFDF0]'
                                    }`}
                                  >
                                    {/* Column 1: ITEM info */}
                                    <td className="py-2.5 px-3 align-middle">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {highlightItem === item.itemId && (
                                          <span className="bg-[#12803C] text-white text-[9.5px] font-black px-1.5 py-0.5 rounded animate-pulse">
                                            🎯 รายการที่เลือก
                                          </span>
                                        )}
                                        <span className="font-mono font-bold text-[#12803C] bg-[#EAF7ED] px-1.5 py-0.5 rounded text-[10.5px]">
                                          {item.itemId}
                                        </span>
                                        {item.focusStatus === 'FOCUS' && (
                                          <span className="bg-[#FFE066] text-[#D9480F] font-black text-[9.5px] px-1.5 py-0.2 rounded border border-[#FAD7A0]">
                                            ⭐ Focus
                                          </span>
                                        )}
                                        <span className="font-bold text-[#1F1F1F] text-xs">
                                          {item.description}
                                        </span>
                                      </div>
                                      {item.standardWeightKg && (
                                        <div className="text-[10.5px] text-[#6E6E6E] mt-0.5">
                                          {itemNoun}ละ {item.standardWeightKg} กก.
                                        </div>
                                      )}
                                    </td>

                                    {/* Column 2: ตามแผน */}
                                    <td className="py-2.5 px-2 text-center font-bold text-[#1F1F1F] text-xs whitespace-nowrap align-middle">
                                      {item.apptContQty ?? 0} {itemNoun}
                                    </td>

                                    {/* Column 3: รับจริง */}
                                    <td className="py-2.5 px-2 text-center font-bold text-[#12803C] text-xs whitespace-nowrap align-middle">
                                      {totalCases} {itemNoun}
                                    </td>

                                    {/* Column 4: สุ่มชั่ง */}
                                    <td className="py-2.5 px-2 text-center text-xs whitespace-nowrap align-middle">
                                      <span className={itemMs.length >= itemReq ? "text-[#12803C] font-bold" : "text-[#6E6E6E] font-medium"}>
                                        {itemMs.length} / {itemReq}
                                      </span>
                                    </td>

                                    {/* Column 5: นน.เฉลี่ย (เกณฑ์) */}
                                    <td className="py-2.5 px-2 text-center text-xs whitespace-nowrap align-middle">
                                      {isWeighed && avgNet > 0 ? (
                                        <div>
                                          <span className={`font-mono font-bold ${isCn ? 'text-[#E03131]' : 'text-[#1F1F1F]'}`}>
                                            {avgNet.toFixed(2)} kg
                                          </span>
                                          <span className="text-[10px] text-[#6E6E6E] block">
                                            ({std} kg)
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-[#8E8E8E] text-[11px]">- ({std} kg)</span>
                                      )}
                                    </td>

                                    {/* Column 6: ผลการตรวจ / ยอด CN */}
                                    <td className="py-2.5 px-3 text-center text-xs align-middle">
                                      {isCn ? (
                                        <div className="inline-flex flex-col items-center gap-0.5">
                                          <span className="bg-[#E03131] text-white font-black px-2 py-0.5 rounded-md text-[10.5px] shadow-2xs whitespace-nowrap">
                                            ยอด CN: {cn.cnTotalKg} kg
                                          </span>
                                          <span className="text-[9.5px] text-[#C92A2A] font-semibold whitespace-nowrap">
                                            (ขาด -{cn.shortagePerCaseKg} kg/{itemNoun})
                                          </span>
                                        </div>
                                      ) : (item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0) ? (
                                        <div className="inline-flex flex-col items-center gap-0.5">
                                          <StatusBadge status="ไม่มาตามแผน" size="sm" />
                                          <span className="text-[9.5px] text-[#A63C06] font-semibold whitespace-nowrap">
                                            (รับจริง 0 {itemNoun})
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                                          <StatusBadge status={item.samplingStatus} size="sm" />
                                          {item.samplingStatus !== 'ชั่งครบ' && item.samplingStatus !== 'ผิดเกณฑ์' && (
                                            <div className="inline-flex items-center gap-1">
                                              <span className="text-[10px] font-black text-[#12803C] bg-[#EAF7ED] hover:bg-[#D4EED9] px-1.5 py-0.5 rounded border border-[#AEE0BD] shadow-2xs whitespace-nowrap">
                                                กดชั่ง →
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleMarkItemNotDelivered(item);
                                                }}
                                                className="text-[10px] font-bold text-[#D9480F] bg-[#FFF0E6] hover:bg-[#FFE3D4] px-1.5 py-0.5 rounded border border-[#FFD8BF] shadow-2xs whitespace-nowrap cursor-pointer"
                                                title="คลิกหากสินค้ารายการนี้ไม่มาตามแผน"
                                              >
                                                ไม่มาตามแผน
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }))}
        </div>

        {/* ─── 4. SEQUENTIAL SIGNATURE WORKFLOW ─────────────────── */}
        {/* VN vs PR Flow */}
        <div className="bg-[#FFFDF9] rounded-3xl p-4 sm:p-5 border border-[#E8E1D8] shadow-xs space-y-4">
          <div className="flex flex-wrap sm:flex-nowrap justify-between items-start sm:items-center gap-2">
            <h3 className="font-black text-sm sm:text-base text-[#1F1F1F] flex items-center gap-1.5 flex-1 min-w-0">
              <FileCheck2 className="w-5 h-5 text-[#12803C] shrink-0" />
              <span>การรับรองผลและการลงนาม (Verification & Signatures)</span>
            </h3>
            <span className="text-xs font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-1 rounded-xl border border-[#AEE0BD] shrink-0">
              ประเภท {appt.carrierCode}
            </span>
          </div>

          {/* Sequential Order Guidance */}
          {!isAllItemsWeighed ? (
            <div className="bg-[#FFF9DB] border-2 border-[#F59F00] p-6 rounded-2xl text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-[#FFE066] flex items-center justify-center mx-auto text-[#D9480F] shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-[#D9480F] text-base">
                  ล็อคระบบลงนามปิดงาน
                </h4>
                <p className="text-xs text-[#7D6608] leading-relaxed max-w-md mx-auto">
                  เนื่องจากในใบนัดหมายนี้ยังมีสินค้าที่ <b>ยังชั่งไม่หมด</b> อีก <b>{totalItems - totalWeighedItems}</b> รายการ (ชั่งแล้ว {totalWeighedItems}/{totalItems} รายการ)
                  <br />
                  <b>ระบบไม่อนุญาตให้ผู้แทน Vendor, Receive, LP&S หรือ OTM ลงนามปิดงานได้</b> จนกว่าจะสุ่มชั่งครบทุกรายการ
                </p>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleGoToWeighing()}
                  className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-5 py-3 rounded-xl font-black text-xs inline-flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>ไปหน้าชั่งสินค้าเพื่อชั่งให้ครบ ({totalItems - totalWeighedItems} รายการที่เหลือ) →</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {notDeliveredItems > 0 && (
                <div className="p-3.5 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl text-xs text-[#D9480F] flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-[#D9480F] shrink-0" />
                  <div>
                    <span className="font-black text-xs sm:text-sm block">
                      มีสินค้าไม่มาตามแผนจำนวน {notDeliveredItems} รายการ (บันทึกรับจริง 0 ตะกร้า)
                    </span>
                    <span className="text-[11px] text-[#A63C06]">
                      ผู้มีอำนาจ (Vendor, Receive, LP&S, OTM) สามารถลงนามรับรองและปิดงานใบนัดหมายได้ตามปกติ
                    </span>
                  </div>
                </div>
              )}

              <div className="p-3 bg-[#FEF9E7] border border-[#FAD7A0] rounded-2xl text-xs text-[#7D6608] space-y-1">
                <span className="font-bold block">ลำดับขั้นตอนการลงนาม:</span>
                {isVN ? (
                  <p className="leading-relaxed">
                    1. ลายเซ็นผู้แทน Vendor → 2. ลายเซ็นพนักงานตรวจรับ (Receive)
                    {hasFocusItem ? ' → 3. DC S&LP (สินค้า Focus)' : ''} → {hasFocusItem ? '4.' : '3.'} อนุมัติ OTM
                  </p>
                ) : (
                  <p className="leading-relaxed">
                    1. ลายเซ็นพนักงานตรวจรับ (Receive)
                    {hasFocusItem ? ' → 2. DC S&LP (สินค้า Focus)' : ''} → {hasFocusItem ? '3.' : '2.'} อนุมัติ OTM
                    <b className="block text-[#0B5E2B] mt-0.5">*(งาน PR สินค้ารวมหลาย Vendor ไม่ต้องใช้ลายเซ็นผู้แทน Vendor)*</b>
                  </p>
                )}
              </div>

          {/* ─── STEP 1 FOR VN: VENDOR SIGNATURE (1 time per Appointment) ─── */}
          {isVN && (
            <div className="space-y-2 pt-2 border-t border-[#E8E1D8]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-0.5">
                <label className="text-xs sm:text-sm font-bold text-[#1F1F1F] block">
                  1. ลายเซ็นผู้แทน Vendor (Vendor Signature):
                </label>
                {vendorSig ? (
                  <span className="text-[11px] font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-full border border-[#AEE0BD] self-start sm:self-auto">
                    ✓ ลงนามแล้ว
                  </span>
                ) : (
                  <span className="text-[11px] text-[#9A7D0A] font-bold self-start sm:self-auto">เซ็น 1 ครั้งครอบคลุมทั้งใบนัดหมาย</span>
                )}
              </div>

              {!vendorSig && (
                <div>
                  <input
                    type="text"
                    placeholder="กรอกชื่อ-นามสกุล ผู้แทนผู้ขาย (Vendor)..."
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full text-xs p-3 border border-[#E8E1D8] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#12803C] mb-1.5 font-bold"
                  />
                </div>
              )}

              <SignaturePad
                roleTitle="ผู้แทนผู้ขาย (Vendor Signature)"
                signerName={vendorSig?.signerName || vendorName}
                isConfirmed={!!vendorSig}
                existingSignature={vendorSig?.signatureData}
                signedAt={vendorSig?.signedAt}
                onReset={!isJobAlreadyClosed ? handleResetVendorSignature : undefined}
                onConfirm={handleSaveVendorSignature}
              />
            </div>
          )}

          {/* ─── PR NOTICE: VENDOR SIGNATURE NOT REQUIRED ────────── */}


          {/* ─── STEP 2 (OR STEP 1 FOR PR): RECEIVE STAFF SIGNATURE ─── */}
          <div className="space-y-2 pt-2 border-t border-[#E8E1D8]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-0.5">
              <label className="text-xs sm:text-sm font-bold text-[#1F1F1F] block">
                {isVN ? '2.' : '1.'} ลายเซ็นพนักงานตรวจรับ (Receive Signature):
              </label>
              {receiveSig ? (
                <span className="text-[11px] font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-full border border-[#AEE0BD] self-start sm:self-auto">
                  ✓ ลงนามแล้ว
                </span>
              ) : (
                <span className="text-[11px] text-[#9A7D0A] font-bold self-start sm:self-auto">เซ็น 1 ครั้งครอบคลุมทั้งใบนัดหมาย</span>
              )}
            </div>

            {!receiveSig && (
              <div>
                <input
                  type="text"
                  placeholder="กรอกชื่อ-นามสกุล พนักงานตรวจรับ (Receive)..."
                  value={receiveName}
                  onChange={(e) => setReceiveName(e.target.value)}
                  className="w-full text-xs p-3 border border-[#E8E1D8] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#12803C] mb-1.5 font-bold"
                />
              </div>
            )}

            <SignaturePad
              roleTitle="พนักงานตรวจรับ (Receive Signature)"
              signerName={receiveSig?.signerName || receiveName}
              isConfirmed={!!receiveSig}
              existingSignature={receiveSig?.signatureData}
              signedAt={receiveSig?.signedAt}
              onReset={!isJobAlreadyClosed ? handleResetReceiveSignature : undefined}
              disabled={isVN && !vendorSig}
              onConfirm={handleSaveReceiveSignature}
            />
          </div>

          {/* ─── LP&S SIGNATURE (ONLY IF FOCUS ITEM) ─────── */}
          {hasFocusItem ? (
            <div className="space-y-2 pt-2 border-t border-[#E8E1D8]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <label className="text-xs sm:text-sm font-bold text-[#1F1F1F] block">
                    {isVN ? '3.' : '2.'} เจ้าหน้าที่ความปลอดภัย (DC S&LP Supervisor):
                  </label>
                  <span className="bg-[#FFE066] text-[#D9480F] font-black text-[10px] px-2 py-0.5 rounded-full border border-[#FAD7A0] flex items-center gap-1">
                    🔒 สินค้า Focus (จำเป็นต้องลงนาม)
                  </span>
                </div>
                {lpsSig ? (
                  <span className="text-[11px] font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-full border border-[#AEE0BD] self-start sm:self-auto">
                    ✓ ลงนามแล้ว
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-[#D9480F] bg-[#FFF0E6] px-2.5 py-0.5 rounded-full border border-[#FFD8BF] self-start sm:self-auto animate-pulse">
                    ⚠️ ต้องลงนามก่อนปิดงาน
                  </span>
                )}
              </div>

              {!lpsSig && (
                <div className="relative">
                  <select
                    value={lpsName}
                    onChange={(e) => setLpsName(e.target.value)}
                    className="w-full text-xs p-3 border border-[#E8E1D8] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#12803C] mb-1.5 font-bold cursor-pointer"
                  >
                    <option value="">-- เลือกเจ้าหน้าที่ S&LP (9 รายชื่อที่ได้รับอนุญาต) --</option>
                    {lpsRoster.map(r => (
                      <option key={r.empId} value={r.fullName}>
                        {r.fullName} ({r.empId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <SignaturePad
                roleTitle="DC S&LP Supervisor (เฉพาะสินค้า Focus)"
                signerName={lpsSig?.signerName || lpsName}
                isConfirmed={!!lpsSig}
                existingSignature={lpsSig?.signatureData}
                signedAt={lpsSig?.signedAt}
                onReset={!isJobAlreadyClosed ? handleResetLpsSignature : undefined}
                disabled={isVN && !vendorSig}
                onConfirm={handleSaveLpsSignature}
              />
            </div>
          ) : (
            <div className="p-3 bg-[#F7F2EA] border border-[#E8E1D8] rounded-2xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs text-[#6E6E6E]">
              <span>การลงนาม LP&S: <b>ไม่ต้องลงนาม</b> (ไม่มีรายการสินค้า Focus ในใบนัดหมายนี้)</span>
              <span className="font-bold text-[#12803C] text-[10px] bg-white px-2 py-0.5 rounded-md border border-[#AEE0BD] shrink-0">
                ผ่านขั้นตอน ✓
              </span>
            </div>
          )}

          {/* ─── SHIFT & CHAIN OF COMMAND SELECTOR (หัวหน้าในกะนั้น / สายการบังคับบัญชา) ─── */}
          <div className="space-y-3 pt-4 border-t-2 border-[#E8E1D8]">
            <div className="flex flex-wrap sm:flex-nowrap justify-between items-start sm:items-center gap-1.5 pb-0.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-[#1F1F1F]">
                    กะการทำงานและหัวหน้าประจำกะ
                  </h4>
                  <p className="text-[11px] text-[#6E6E6E]">
                    เลือกระบุกะการทำงานและหัวหน้าในกะนั้น
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isShiftAutoSaved && (
                  <span className="text-[11px] font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-full border border-[#AEE0BD] animate-pulse">
                    บันทึกข้อมูลกะแล้ว ✓
                  </span>
                )}
                {isJobAlreadyClosed && (
                  <span className="text-[11px] font-bold text-[#6E6E6E] bg-[#F7F2EA] px-2.5 py-0.5 rounded-full border border-[#E8E1D8]">
                    ข้อมูลปิดกะแล้ว
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-4.5 bg-gradient-to-br from-[#FFFDF9] via-[#FAF6F0] to-[#F5EFEB] border-2 border-[#E8E1D8] rounded-3xl space-y-3.5 shadow-xs">
              {/* 1. ปุ่มเลือกกะการทำงาน (Shift Buttons) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1F1F1F] flex items-center gap-1.5">
                    <span>1. กะการทำงาน (Shift):</span>
                    <span className="text-[#9A7D0A] font-bold text-[11px]">* แตะปุ่มเลือกกะ</span>
                  </label>
                  <span className="text-[11px] text-[#6E6E6E]">
                    กะปัจจุบัน: <b className="text-[#0B5E2B] font-bold">{currentShift.name}</b>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SHIFT_DEFINITIONS.map(s => {
                    const isSelected = currentShift.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={isJobAlreadyClosed && !isEditingLeader}
                        onClick={() => handleSelectShift(s)}
                        className={`py-2 sm:py-2.5 px-2 rounded-2xl text-xs font-bold border-2 transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                          (isJobAlreadyClosed && !isEditingLeader)
                            ? isSelected
                              ? 'bg-[#12803C]/10 text-[#0B5E2B] border-[#12803C]/40 cursor-default'
                              : 'bg-white/60 text-[#8C8C8C] border-[#E8E1D8] cursor-not-allowed opacity-60'
                            : isSelected
                            ? 'bg-[#12803C] text-white border-[#12803C] shadow-sm ring-2 ring-[#12803C]/30 cursor-pointer'
                            : 'bg-white text-[#1F1F1F] border-[#E8E1D8] hover:border-[#12803C]/50 hover:bg-[#F9FCF9] cursor-pointer'
                        }`}
                      >
                        <span className="text-base sm:text-lg">{s.icon}</span>
                        <span className="font-black text-xs sm:text-sm text-center">{s.name}</span>
                        <span className={`text-[10px] sm:text-[11px] leading-tight text-center ${isSelected && (!isJobAlreadyClosed || isEditingLeader) ? 'text-white/80' : 'text-[#6E6E6E]'}`}>
                          {s.timeRange}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. เลือกหัวหน้างานประจำกะ OTM */}
              <div className="space-y-1.5 pt-1 border-t border-[#E8E1D8]">
                <label className="text-xs font-bold text-[#1F1F1F] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>2. หัวหน้างานประจำกะ OTM (DC Operation Team Manager):</span>
                    <span className="text-[#0B5E2B] font-bold text-[11px]">* หัวหน้างานประจำกะ</span>
                  </span>
                  {selectedLeaderPreset && (
                    <span className="text-[10px] text-[#12803C] font-bold bg-[#EAF7ED] px-2 py-0.5 rounded-md border border-[#AEE0BD]">
                      {selectedLeaderPreset.department}
                    </span>
                  )}
                </label>

                {(isJobAlreadyClosed && hasValidLeader && !isEditingLeader) ? (
                  <div className="p-3.5 bg-white border border-[#E8E1D8] rounded-2xl text-xs font-bold text-[#1F1F1F] flex items-center justify-between shadow-2xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#0B5E2B] font-black text-sm">{effectiveLeaderName}</span>
                        <span className="text-[10px] text-[#12803C] font-bold bg-[#EAF7ED] px-2 py-0.5 rounded-md border border-[#AEE0BD]">
                          {effectiveLeaderDept}
                        </span>
                      </div>
                      <span className="text-[#6E6E6E] font-normal text-xs block mt-0.5">[{effectiveLeaderRole}]</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingLeader(true)}
                      className="text-xs text-[#0284C7] hover:text-[#0369A1] bg-[#F0F9FF] border border-[#BAE6FD] hover:bg-[#E0F2FE] px-3.5 py-2 rounded-xl cursor-pointer font-black inline-flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                    >
                      <span>✏️</span>
                      <span>เปลี่ยนหัวหน้างาน</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#6E6E6E] font-bold">
                        เลือกจากรายชื่อที่กำหนดไว้ หรือพิมพ์ระบุชื่อเอง:
                      </span>
                      {isJobAlreadyClosed && (
                        <span className="text-[10px] text-[#D9480F] bg-[#FFF0E6] px-2 py-0.5 rounded-md font-bold border border-[#FFD8BF]">
                          กำลังแก้ไขหัวหน้างาน
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedLeaderEmpId}
                      onChange={(e) => handleLeaderSelect(e.target.value)}
                      className={`w-full text-xs sm:text-sm p-3 border-2 rounded-xl bg-white focus:outline-none font-bold cursor-pointer transition-all ${
                        !hasValidLeader
                          ? 'border-[#FA5252] text-[#C92A2A] ring-2 ring-[#FA5252]/20'
                          : 'border-[#E8E1D8] text-[#1F1F1F] focus:border-[#12803C]'
                      }`}
                    >
                      <option value="">-- กรุณาเลือกหัวหน้างานประจำกะ OTM (จำเป็นต้องระบุก่อนปิดงาน) --</option>
                      <optgroup label="หัวหน้างานประจำกะ OTM (DC Operation Team Manager)">
                        {SHIFT_LEADERS_PRESETS.map(p => (
                          <option key={p.empId} value={p.empId}>
                            {p.fullName} ({p.role} - {p.empId})
                          </option>
                        ))}
                      </optgroup>
                      <option value="CUSTOM">✏️ ระบุชื่อหัวหน้างานประจำกะ OTM เอง (กำหนดชื่อเอง)...</option>
                    </select>

                    {selectedLeaderEmpId === 'CUSTOM' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 bg-white p-2.5 rounded-xl border border-[#E8E1D8]">
                        <div>
                          <label className="text-[11px] font-bold text-[#6E6E6E] block mb-1">
                            ชื่อ-นามสกุล หัวหน้างานประจำกะ OTM:
                          </label>
                          <input
                            type="text"
                            placeholder="กรอกชื่อ-นามสกุล..."
                            value={customLeaderName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomLeaderName(val);
                              try {
                                localStorage.setItem(`SMART_DC_SHIFT_LEADER_${currentShift.id}`, JSON.stringify({
                                  empId: 'CUSTOM',
                                  fullName: val,
                                  role: customLeaderRole,
                                  dept: 'DC Operation',
                                  superiorName: selectedSuperiorName,
                                  superiorRole: customSuperiorRole,
                                  savedAt: new Date().toISOString()
                                }));
                              } catch (err) {
                                console.warn(err);
                              }
                              saveShiftDetailsToDb({ leaderName: val });
                            }}
                            className="w-full text-xs p-2.5 border border-[#E8E1D8] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#12803C] font-bold text-[#1F1F1F]"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-[#6E6E6E] block mb-1">
                            ตำแหน่ง / ฝ่าย:
                          </label>
                          <input
                            type="text"
                            placeholder="เช่น หัวหน้างานประจำกะ OTM..."
                            value={customLeaderRole}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomLeaderRole(val);
                              try {
                                localStorage.setItem(`SMART_DC_SHIFT_LEADER_${currentShift.id}`, JSON.stringify({
                                  empId: 'CUSTOM',
                                  fullName: customLeaderName,
                                  role: val,
                                  dept: 'DC Operation',
                                  superiorName: selectedSuperiorName,
                                  superiorRole: customSuperiorRole,
                                  savedAt: new Date().toISOString()
                                }));
                              } catch (err) {
                                console.warn(err);
                              }
                              saveShiftDetailsToDb({ leaderRole: val });
                            }}
                            className="w-full text-xs p-2.5 border border-[#E8E1D8] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#12803C] text-[#1F1F1F]"
                          />
                        </div>
                      </div>
                    )}

                    {isEditingLeader && (
                      <div className="flex items-center justify-end gap-2 pt-1.5">
                        <button
                          type="button"
                          onClick={() => setIsEditingLeader(false)}
                          className="px-3.5 py-1.5 rounded-xl border border-[#E8E1D8] bg-white text-[#6E6E6E] hover:bg-[#F5EFEB] text-xs font-bold cursor-pointer transition-all active:scale-95"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await saveShiftDetailsToDb();
                            setIsEditingLeader(false);
                            alert(`✓ บันทึกหัวหน้างานประจำกะ OTM เรียบร้อยแล้ว (${effectiveLeaderName || 'ตามที่ระบุ'})`);
                          }}
                          className="px-4 py-1.5 rounded-xl bg-[#12803C] hover:bg-[#0B5E2B] text-white text-xs font-black cursor-pointer inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>บันทึกการเปลี่ยนหัวหน้างาน</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. กล่องสรุปข้อมูลกะและหัวหน้างาน OTM */}
              <div className="p-3 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-xs space-y-1 shadow-2xs">
                <div className="font-black text-[#0B5E2B] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#12803C]" />
                    <span>สรุปข้อมูลกะและหัวหน้างานประจำกะ OTM:</span>
                  </div>
                  {!isJobAlreadyClosed && (
                    <button
                      type="button"
                      onClick={() => saveShiftDetailsToDb()}
                      className="text-[11px] font-black text-[#12803C] hover:text-[#0B5E2B] underline bg-white/80 px-2 py-0.5 rounded-lg border border-[#AEE0BD] cursor-pointer active:scale-95"
                    >
                      บันทึกข้อมูลกะทันที 💾
                    </button>
                  )}
                </div>
                <div className="text-[#1F1F1F] pl-5 space-y-0.5">
                  <div>
                    • <b>กะการทำงาน:</b> <span className="text-[#9A7D0A] font-bold">{currentShift.name} ({currentShift.timeRange})</span>
                  </div>
                  <div>
                    • <b>หัวหน้างานประจำกะ OTM:</b>{' '}
                    {hasValidLeader ? (
                      <span className="text-[#0B5E2B] font-bold">{effectiveLeaderName} <span className="text-[#6E6E6E] font-normal">[{effectiveLeaderRole}]</span></span>
                    ) : (
                      <span className="text-[#E03131] font-bold bg-[#FFE3E3] px-2 py-0.5 rounded-md border border-[#FFA8A8] text-xs">
                        ⚠️ ยังไม่ได้ระบุ (จำเป็นต้องเลือกก่อนปิดงาน)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── ACTION BUTTON: ปิดงาน (แสดงเมื่อลงนามเสร็จ) ─── */}
          <div className="pt-4 border-t-2 border-[#E8E1D8] space-y-2">
            <button
              type="button"
              disabled={!isAllOnsiteSigned || !hasValidLeader || isClosingJob || isJobAlreadyClosed}
              onClick={!isJobAlreadyClosed ? handleCloseJob : undefined}
              className={`w-full py-4 px-6 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-md transition-all ${
                isJobAlreadyClosed
                  ? 'bg-[#E8E1D8] text-[#7A736B] border-2 border-[#D6CFC7] cursor-not-allowed opacity-90 shadow-none'
                  : (isAllOnsiteSigned && hasValidLeader)
                  ? 'bg-[#12803C] hover:bg-[#0B5E2B] text-white active:scale-98 cursor-pointer ring-4 ring-[#12803C]/20 shadow-lg'
                  : 'bg-[#E8E1D8] text-[#8C8C8C] cursor-not-allowed opacity-60'
              }`}
            >
              <CheckCircle2 className={`w-6 h-6 ${isJobAlreadyClosed ? 'text-[#7A736B]' : 'text-current'}`} />
              <span>
                {isClosingJob
                  ? 'กำลังบันทึกปิดงาน...'
                  : isJobAlreadyClosed
                  ? 'ปิดงานเสร็จสิ้นสมบูรณ์แล้ว ✓'
                  : !hasValidLeader
                  ? '⚠️ ปิดงาน (กรุณาระบุหัวหน้างาน OTM ในข้อ 2)'
                  : isAllOnsiteSigned
                  ? 'ปิดงาน (เสร็จสิ้นสมบูรณ์)'
                  : 'ปิดงาน (รอเซ็นให้ครบก่อน)'}
              </span>
            </button>
            {isJobAlreadyClosed && (
              <p className="text-center text-xs text-[#6E6E6E] font-bold">
                ✓ ใบนัดหมายนี้บันทึกปิดงานเสร็จสิ้นสมบูรณ์แล้ว (สถานะปิดงานเรียบร้อย)
              </p>
            )}
            {!isJobAlreadyClosed && !hasValidLeader && (
              <p className="text-center text-xs text-[#E03131] font-bold bg-[#FFF5F5] p-2.5 rounded-xl border border-[#FFC9C9]">
                * ยังไม่สามารถปิดงานได้: กรุณาเลือกหัวหน้างานประจำกะ OTM ในข้อ 2 ด้านบนก่อน
              </p>
            )}
            {!isJobAlreadyClosed && hasValidLeader && !isAllOnsiteSigned && (
              <p className="text-center text-xs text-[#9A7D0A]">
                * ต้องลงนามรับรองผลให้ครบถ้วนก่อน จึงจะสามารถกดปิดงานได้
              </p>
            )}
            {!isJobAlreadyClosed && hasValidLeader && isAllOnsiteSigned && (
              <p className="text-center text-xs text-[#12803C] font-bold">
                ✓ ระบุหัวหน้างานและลงนามหน้างานครบแล้ว กดปิดงานเพื่อจบกระบวนการและกลับสู่หน้าหลัก
              </p>
            )}
          </div>
            </>
          )}
        </div>

      </div>

      {/* ─── Google Sheets Webhook Configuration Modal ─── */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-[#E8E1D8] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E1D8]">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#EAF7ED] text-[#12803C] flex items-center justify-center font-bold">
                  📊
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1F1F1F]">ตั้งค่าลิงก์ Google Sheets Webhook</h3>
                  <p className="text-xs text-[#6E6E6E]">เชื่อมต่อเพื่อส่งผลการชั่งและเคส CN เข้าสเปรดชีตอัตโนมัติ</p>
                </div>
              </div>
              <button
                onClick={() => setShowWebhookModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-[#1F1F1F] block">
                URL ของเว็บแอป (Google Apps Script Web App URL):
              </label>
              <input
                type="text"
                value={webhookInput}
                onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-hidden focus:border-[#0284C7] text-xs font-mono"
              />
              <p className="text-[11px] text-[#6E6E6E]">
                💡 ได้จากเมนู "การทำให้ใช้งานได้" ➡️ "การทำให้ใช้งานได้รายการใหม่ (Web app)" ใน Google Apps Script
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E1D8]">
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveWebhookUrl}
                className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>💾 บันทึกและส่งข้อมูล</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
