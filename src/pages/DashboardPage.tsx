// ============================================================
// SMART DC — DashboardPage Component
// V3.0 Final Master Design: Modern Green & Warm Cream UI
// Real-time Employee Dashboard with Live Dexie Metrics
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Appointment } from '../types';
import { 
  Truck, 
  Search, 
  Building2, 
  Package, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Scale,
  ShieldCheck,
  FileCheck2,
  Inbox,
  FileSpreadsheet,
  ExternalLink,
  LogOut,
  ChevronDown,
  Filter,
  X,
  Sparkles,
  Calendar,
  ClipboardList,
  Printer,
  Sun,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { db } from '../lib/database';
import { initialFullSync, pushFullStateToServer } from '../lib/syncEngine';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import { 
  formatApptDateTime, 
  formatApptTime, 
  formatThaiDate, 
  extractDateFromApptTime 
} from '../lib/dateUtils';

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

// Strict chronological comparator by Date + Appt_time (earliest first: 00:01 before 00:30 before 01:00...)
// Prioritizes date directly from the Excel file (apptTime)
function compareAppointmentsByTime(a: Appointment, b: Appointment): number {
  // 1. Compare Date (authoritative from Excel file first)
  const dateA = (extractDateFromApptTime(a.apptTime) || a.receiveDate || '').trim();
  const dateB = (extractDateFromApptTime(b.apptTime) || b.receiveDate || '').trim();
  if (dateA && dateB && dateA !== dateB) {
    return dateA.localeCompare(dateB);
  }

  // 2. Compare Appt_time (00:01 comes before 00:30, etc.)
  const timeA = parseApptTimeMinutes(a.apptTime);
  const timeB = parseApptTimeMinutes(b.apptTime);
  if (timeA !== timeB) {
    return timeA - timeB;
  }

  // 3. Stable tie-breaker by Appt Number
  return a.apptNbr.localeCompare(b.apptNbr);
}

type StatusFilter = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'WAITING';
type CarrierFilter = 'ALL' | 'VN' | 'PR';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const isAdmin = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '') || 
    currentUser?.empId === 'ADMIN01';
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [carrierFilter, setCarrierFilter] = useState<CarrierFilter>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [newDaySuccessMsg, setNewDaySuccessMsg] = useState<string | null>(null);

  // Automatically pull fresh central data when Dashboard mounts (keeps Mobile & Desktop identical)
  useEffect(() => {
    initialFullSync().catch(() => {});
  }, []);

  const handleSyncWithServer = async () => {
    setIsSyncing(true);
    try {
      await initialFullSync();
      setNewDaySuccessMsg('ซิงค์ข้อมูลกับเซิร์ฟเวอร์เรียบร้อย! ข้อมูลคอมพิวเตอร์และมือถือตรงกันแล้ว');
      setTimeout(() => setNewDaySuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถซิงค์ข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSyncing(false);
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayThaiDate = useMemo(() => new Date().toLocaleDateString('th-TH'), []);

  // Instant search input synchronization (responsive search)
  useEffect(() => {
    setDebouncedSearch(searchTerm.trim());
  }, [searchTerm]);

  // Real-time queries from Dexie DB
  const rawAppointments = useLiveQuery(async () => {
    return await db.appointments.toArray();
  }, []) || [];

  // Deduplicate appointments by apptNbr and sort chronologically by appointment time
  const appointments = useMemo(() => {
    const seen = new Set<string>();
    const list: Appointment[] = [];
    for (const appt of rawAppointments) {
      if (!seen.has(appt.apptNbr)) {
        seen.add(appt.apptNbr);
        list.push(appt);
      }
    }
    return list.sort(compareAppointmentsByTime);
  }, [rawAppointments]);

  const vendors = useLiveQuery(async () => {
    return await db.appointmentVendors.toArray();
  }, []) || [];

  const purchaseOrders = useLiveQuery(async () => {
    return await db.purchaseOrders.toArray();
  }, []) || [];

  const samplingGroups = useLiveQuery(async () => {
    return await db.samplingGroups.toArray();
  }, []) || [];

  const totalMeasurementsCount = useLiveQuery(async () => {
    return await db.measurements.count();
  }, []) || 0;

  const cnCasesCount = useLiveQuery(async () => {
    return await db.cnCases.count();
  }, []) || 0;

  // Real-time appointment progress calculation directly from samplingGroups
  const apptCompletedMap = useMemo(() => {
    const map: Record<string, { completed: number; total: number; isDone: boolean }> = {};
    for (const sg of samplingGroups) {
      if (!map[sg.apptNbr]) map[sg.apptNbr] = { completed: 0, total: 0, isDone: false };
      map[sg.apptNbr].total++;
      if (
        sg.samplingStatus === 'ชั่งครบ' || 
        sg.samplingStatus === 'ผิดเกณฑ์' || 
        sg.samplingStatus === 'ไม่มาตามแผน' || 
        sg.samplingStatus === 'ไม่มาส่ง' || 
        sg.confirmedActualQty === 0
      ) {
        map[sg.apptNbr].completed++;
      }
    }
    for (const k in map) {
      map[k].isDone = map[k].total > 0 && map[k].completed >= map[k].total;
    }
    return map;
  }, [samplingGroups]);

  // Map appointment progress to track in-progress appointments (ใบนัดหมายที่กำลังดำเนินการอยู่)
  const apptProgressMap = useMemo(() => {
    const map = new Map<string, { hasStarted: boolean; isAllDone: boolean; isInProgress: boolean; total: number; completed: number }>();
    
    const apptGroupsMap = new Map<string, typeof samplingGroups>();
    for (const g of samplingGroups) {
      const list = apptGroupsMap.get(g.apptNbr) || [];
      list.push(g);
      apptGroupsMap.set(g.apptNbr, list);
    }

    for (const [apptNbr, items] of apptGroupsMap.entries()) {
      const appt = appointments.find(a => a.apptNbr === apptNbr);
      const total = items.length;
      
      // ต้องมีการสุ่มชั่งจริงอย่างน้อย 1 รายการ/ตะกร้า (completedSamples > 0) ถึงจะนับว่าดำเนินการอยู่
      // ถ้าแค่กดเข้าไปดู ยังไม่สุ่มชั่งสักรายการ จะไม่ขึ้น "ดำเนินการอยู่" แต่จะเป็น "รอชั่ง"
      const startedCount = items.filter(g => {
        const comp = g.completedSamples ?? 0;
        return (
          comp > 0 || 
          g.samplingStatus === 'ไม่มาตามแผน' || 
          g.samplingStatus === 'ไม่มาส่ง' || 
          g.confirmedActualQty === 0
        );
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

  // Real metrics calculation
  const totalAppts = appointments.length;
  const totalItems = samplingGroups.length;
  // สถานะ ชั่งครบแล้ว: ตราบใดที่ยังไม่ปิดงาน จะอยู่ "ดำเนินการอยู่" ถ้าปิดงานแล้ว จึงค่อยขึ้น "ชั่งครบแล้ว" (นับรวมทุกรายการทั้งผ่านเกณฑ์และ CN)
  const completedItems = samplingGroups.filter(g => Boolean(apptProgressMap.get(g.apptNbr)?.isAllDone)).length;
  // สถานะ ดำเนินการอยู่ คือใบนัดหมายที่เริ่มชั่งแล้วแต่ยังไม่ปิดงาน
  const inProgressItems = samplingGroups.filter(g => Boolean(apptProgressMap.get(g.apptNbr)?.isInProgress)).length;
  // สถานะ รอชั่ง คือใบนัดหมายที่ยังไม่เริ่มชั่งเลย
  const waitingItems = Math.max(0, totalItems - completedItems - inProgressItems);
  const pendingOtmCount = samplingGroups.filter(g => g.workflowStatus === 'PENDING_OTM').length;

  // Counts for Group 1: สถานะ (ดำเนินการอยู่, ชั่งครบแล้ว, รอชั่ง)
  const waitingCount = useMemo(() => {
    return appointments.filter(a => {
      const p = apptProgressMap.get(a.apptNbr);
      return !p?.hasStarted && !p?.isAllDone;
    }).length;
  }, [appointments, apptProgressMap]);

  const inProgressCount = useMemo(() => {
    return appointments.filter(a => {
      const p = apptProgressMap.get(a.apptNbr);
      return Boolean(p?.isInProgress);
    }).length;
  }, [appointments, apptProgressMap]);

  const completedCount = useMemo(() => {
    return appointments.filter(a => {
      const p = apptProgressMap.get(a.apptNbr);
      return Boolean(p?.isAllDone);
    }).length;
  }, [appointments, apptProgressMap]);

  // Counts for Group 2: ประเภทรถ (PR, VN)
  const vnCount = useMemo(() => appointments.filter(a => a.carrierCode === 'VN').length, [appointments]);
  const prCount = useMemo(() => appointments.filter(a => a.carrierCode === 'PR').length, [appointments]);

  // Filter appointments supporting instant search from 1 character (including 3 digits like '217' for '969217')
  const filteredAppointments = useMemo(() => {
    const rawQuery = (searchTerm || '').trim().toLowerCase();
    const query = rawQuery.replace(/^[#\s]+/, '');

    // Build matching appointment set if search term is provided (at least 1 character)
    const matchingApptNbrs = new Set<string>();
    if (query.length > 0) {
      const tokens = query.split(/\s+/).filter(Boolean);

      for (const appt of appointments) {
        const apptStr = String(appt.apptNbr || '').trim().toLowerCase();
        const carrierStr = String(appt.carrierCode || '').trim().toLowerCase();

        // 1. Vendor info for this appointment
        const apptVendors = vendors.filter(v => v.apptNbr === appt.apptNbr);
        const vendorText = apptVendors.map(v => `${v.vendorName || ''} ${v.vendorNbr || ''}`).join(' ').toLowerCase();

        // 2. POs for this appointment
        const apptPos = purchaseOrders.filter(p => p.apptNbr === appt.apptNbr);
        const poText = apptPos.map(p => String(p.poNbr || '')).join(' ').toLowerCase();

        // 3. Items/SKUs for this appointment
        const apptItems = samplingGroups.filter(g => g.apptNbr === appt.apptNbr);
        const itemText = apptItems.map(g => `${g.itemId || ''} ${g.description || ''} ${g.vendorName || ''} ${g.vendorNbr || ''} ${g.poNbr || ''} ${g.spExpression || ''}`).join(' ').toLowerCase();

        const combined = `${apptStr} ${carrierStr} ${vendorText} ${poText} ${itemText}`;

        if (tokens.every(t => combined.includes(t))) {
          matchingApptNbrs.add(apptStr);
        }
      }
    }

    const filtered = appointments.filter(appt => {
      const apptStr = String(appt.apptNbr || '').trim().toLowerCase();
      const p = apptProgressMap.get(appt.apptNbr);
      const isDone = Boolean(p?.isAllDone);
      const isInProgress = Boolean(p?.isInProgress);
      const isWaiting = !p?.hasStarted && !isDone;

      // If user typed a search query:
      if (query.length > 0) {
        if (!matchingApptNbrs.has(apptStr)) {
          return false;
        }
        // When searching by keyword (e.g. 3 digits '217'):
        // Match across ALL statuses so the target appointment always surfaces!
        return true;
      }

      // Filter 1: สถานะ (Dropdown: ดำเนินการอยู่, ชั่งครบแล้ว, รอชั่ง) - applied only when NOT searching
      if (statusFilter === 'IN_PROGRESS' && !isInProgress) return false;
      if (statusFilter === 'COMPLETED' && !isDone) return false;
      if (statusFilter === 'WAITING' && !isWaiting) return false;

      // Filter 2: ประเภทรถ (Dropdown: PR, VN)
      if (carrierFilter === 'VN' && appt.carrierCode !== 'VN') return false;
      if (carrierFilter === 'PR' && appt.carrierCode !== 'PR') return false;

      // Filter 3: วันที่ (Audit Date Filter)
      if (selectedDate) {
        const matchesDate = 
          appt.receiveDate === selectedDate ||
          appt.createdAt?.startsWith(selectedDate) ||
          appt.updatedAt?.startsWith(selectedDate);
        if (!matchesDate) return false;
      }

      return true;
    });

    return filtered.sort(compareAppointmentsByTime);
  }, [appointments, vendors, purchaseOrders, samplingGroups, searchTerm, statusFilter, carrierFilter, selectedDate, apptCompletedMap, apptProgressMap]);

  const handleFilterCardClick = (newStatus: StatusFilter) => {
    setStatusFilter(newStatus);
    setTimeout(() => {
      document.getElementById('filter-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <Layout>
      <div className="p-3.5 sm:p-5 space-y-4 max-w-2xl sm:max-w-3xl mx-auto pb-28 text-[#1F1F1F] w-full overflow-x-hidden">
        
        {/* ─── Hero Banner: Crisp Lotus's Fresh Digital Weight Sampling ───────── */}
        <div className="bg-[#FFFDF9] rounded-3xl overflow-hidden shadow-md border-2 border-[#E8E1D8] space-y-0">
          {/* 1. Crisp High-Resolution Lotus Fresh Photo Banner */}
          <div className="relative w-full h-48 sm:h-60 bg-slate-900 overflow-hidden group">
            <img 
              src="/images/lotus-fresh-hero.jpg" 
              alt="Lotus's Fresh Digital Weight Scale" 
              className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
            />
            {/* Soft Scrim for perfect text contrast without dulling the fresh photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35" />

            {/* Top Badges */}
            <div className="absolute top-3.5 left-3.5 right-3.5 flex justify-between items-center z-10">
              <span className="bg-[#004D25]/90 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/20 shadow-xs">
                Catch Weight
              </span>

              <span className="bg-white/90 backdrop-blur-md text-[#004D25] font-black px-3.5 py-1 rounded-full text-xs shadow-md border border-white/40">
                {currentUser?.role || 'RECEIVE'}
              </span>
            </div>

            {/* Bottom Hero Text Over Scrim */}
            <div className="absolute bottom-3.5 left-4 right-4 z-10 flex flex-wrap justify-between items-end gap-2 text-white">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <img 
                    src="/images/lotus-logo-white.svg" 
                    alt="Lotus's" 
                    className="h-6 w-auto drop-shadow-md"
                  />
                  <span className="text-white/70 text-xs font-light">|</span>
                  <span className="text-white text-xs font-black tracking-widest uppercase bg-[#FFD100]/25 border border-[#FFD100]/40 px-2 py-0.5 rounded text-[#FFD100] drop-shadow">
                    SMART DC
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black leading-tight drop-shadow-md text-white">
                  สุ่มชั่งน้ำหนักสินค้าสดดิจิทัล
                </h2>
                <p className="text-xs text-white/95 font-medium mt-1 drop-shadow flex items-center gap-1.5 max-w-full min-w-0">
                  <span className="shrink-0">ผู้ปฏิบัติงาน:</span>
                  <b className="text-[#FFD100] bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-xs font-bold truncate max-w-[240px] sm:max-w-md inline-block">
                    {currentUser?.fullName?.replace(/\s*\([^)]*@.*?\)/g, '') || currentUser?.fullName || 'Receive Staff'}
                  </b>
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 bg-black/50 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-xl text-xs border border-white/20">
                <Clock className="w-3.5 h-3.5 text-[#FFD100]" />
                <span>ระบบออนไลน์พร้อมใช้งาน</span>
              </div>
            </div>
          </div>

          {/* 2. Formal Dashboard Metrics & Actions Below Photo */}
          <div className="p-4 sm:p-5 bg-[#FFFDF9] space-y-3.5">
            {/* Real Metrics Counter Grid - Clickable Shortcuts (6 Tiles) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 text-center">
              {/* 1. ใบนัดหมายทั้งหมด */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('ALL')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'ALL'
                    ? 'bg-white border-[#12803C] ring-2 ring-[#12803C]/30 shadow-xs'
                    : 'bg-[#F7F2EA] border-[#E8E1D8] hover:border-[#12803C]/50 hover:bg-white'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#1F1F1F]">{totalAppts}</div>
                <div className="text-[11px] text-[#6E6E6E] font-medium">ใบนัดหมายทั้งหมด</div>
              </button>

              {/* 2. ใบนัดหมายที่ชั่งครบแล้ว */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('COMPLETED')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-[#EAF7ED] border-[#12803C] ring-2 ring-[#12803C]/50 shadow-sm'
                    : 'bg-[#F7F2EA] border-[#E8E1D8] hover:border-[#12803C]/50 hover:bg-white'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#12803C]">{completedCount}</div>
                <div className="text-[11px] text-[#0B5E2B] font-bold">ใบนัดหมายที่ชั่งครบแล้ว</div>
              </button>

              {/* 3. ทั้งหมด (Item) */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('ALL')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'ALL'
                    ? 'bg-white border-[#12803C] ring-2 ring-[#12803C]/30 shadow-xs'
                    : 'bg-[#F7F2EA] border-[#E8E1D8] hover:border-[#12803C]/50 hover:bg-white'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#1F1F1F]">{totalItems}</div>
                <div className="text-[11px] text-[#6E6E6E] font-medium">ทั้งหมด (Item)</div>
              </button>

              {/* 4. รอชั่ง (Item) */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('WAITING')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'WAITING'
                    ? 'bg-[#FEF9E7] border-[#B45309] ring-2 ring-[#B45309]/50 shadow-sm'
                    : 'bg-[#FEF9E7]/70 border-[#FAD7A0] hover:bg-[#FEF9E7] hover:border-[#B45309]'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#B45309]">{waitingItems}</div>
                <div className="text-[11px] text-[#B45309] font-bold">รอชั่ง (Item)</div>
              </button>

              {/* 5. ดำเนินการอยู่ (Item) */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('IN_PROGRESS')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-[#EFF6FF] border-[#1D4ED8] ring-2 ring-[#1D4ED8]/50 shadow-sm'
                    : 'bg-[#EFF6FF]/70 border-[#BFDBFE] hover:bg-[#EFF6FF] hover:border-[#1D4ED8]'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#1D4ED8]">{inProgressItems}</div>
                <div className="text-[11px] text-[#1D4ED8] font-bold">ดำเนินการอยู่ (Item)</div>
              </button>

              {/* 6. ชั่งครบแล้ว (Item) */}
              <button
                type="button"
                onClick={() => handleFilterCardClick('COMPLETED')}
                className={`rounded-2xl py-2.5 px-2 border transition-all cursor-pointer active:scale-95 text-center ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-[#EAF7ED] border-[#12803C] ring-2 ring-[#12803C]/50 shadow-sm'
                    : 'bg-[#EAF7ED]/70 border-[#AEE0BD] hover:bg-[#EAF7ED] hover:border-[#12803C]'
                }`}
              >
                <div className="text-xl sm:text-2xl font-black text-[#12803C]">{completedItems}</div>
                <div className="text-[11px] text-[#0B5E2B] font-bold">ชั่งครบแล้ว (Item)</div>
              </button>
            </div>
          </div>
        </div>

        {/* NEW DAY SUCCESS MESSAGE TOAST */}
        {newDaySuccessMsg && (
          <div className="bg-[#EAF7ED] text-[#0B5E2B] border-2 border-[#12803C] p-3.5 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm font-black shadow-sm animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-[#12803C] shrink-0" />
            <span>{newDaySuccessMsg}</span>
          </div>
        )}


        {/* ─── DAILY SAMPLING PLAN QUICK ACCESS BANNER (เช็กแผนล่วงหน้า & สั่งพิมพ์) ─── */}
        <div className="bg-[#FFFDF9] rounded-3xl border-2 border-[#12803C]/40 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 animate-fadeIn">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD] flex items-center justify-center shrink-0 shadow-2xs">
              <ClipboardList className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-[#004D25] text-base sm:text-lg">
                  รายการทั้งหมดที่ต้องสุ่มชั่งวันนี้
                </span>
                <span className="bg-[#12803C] text-white font-black text-xs px-2.5 py-0.5 rounded-full shadow-2xs">
                  {totalItems} รายการ
                </span>
              </div>
              <p className="text-xs text-[#495057] font-medium mt-1">
                สำหรับพนักงานดูล่วงหน้า: เลขใบนัดหมาย, PO, รายการสินค้า, จำนวนตะกร้าที่มา & จำนวนที่ต้องสุ่มชั่ง พร้อมสั่งพิมพ์
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/sampling-plan')}
            className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-xs shrink-0 flex items-center justify-center gap-2 active:scale-95 transition-all w-full sm:w-auto cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>เปิดดูแผน & สั่งพิมพ์</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* ─── Search Bar (Prominent Design) ─────────────────────────── */}
        <div className="relative group transition-all">
          <div className="relative flex items-center bg-white border-2 border-[#12803C]/35 hover:border-[#12803C] focus-within:border-[#12803C] focus-within:ring-4 focus-within:ring-[#12803C]/15 rounded-2xl shadow-md transition-all">
            <div className="pl-3.5 pr-2.5 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 rounded-xl bg-[#EAF7ED] flex items-center justify-center text-[#12803C]">
                <Search className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <input
              type="text"
              placeholder="ค้นหาเลขใบนัดหมาย, ผู้ขาย, PO หรือ ITEM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent py-3.5 pr-20 text-sm font-semibold text-[#1F1F1F] placeholder:text-[#8C8C8C] placeholder:font-normal focus:outline-none"
            />
            <div className="absolute right-2.5 flex items-center gap-1">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="p-1 rounded-full text-[#8C8C8C] hover:text-[#E03131] hover:bg-[#FFF0E6] transition-colors cursor-pointer"
                  title="ล้างการค้นหา"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleSyncWithServer}
                disabled={isSyncing}
                className="p-1.5 rounded-xl text-[#12803C] hover:bg-[#EAF7ED] transition-colors cursor-pointer active:scale-95"
                title="ซิงค์ข้อมูลกับคอมพิวเตอร์และเซิร์ฟเวอร์"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#E67700]' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Filter Section: 1. สถานะ & 2. ประเภทรถ พร้อม ตรวจสอบย้อนหลัง ─── */}
        <div id="filter-section" className="bg-[#FFFDF9] py-2 px-3 sm:py-2.5 sm:px-4 rounded-2xl border-2 border-[#E8E1D8] shadow-xs space-y-1.5 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-[#6E6E6E] flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#12803C]" />
              <span>ตัวกรองการแสดงผล</span>
            </span>

            {/* ด้านขวา: ตรวจสอบย้อนหลัง เล็กๆ */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#F7F2EA] border border-[#E8E1D8] px-2 py-0.5 rounded-lg text-xs shadow-2xs">
                <Calendar className="w-3 h-3 text-[#12803C] shrink-0" />
                <span className="text-[11px] font-medium text-[#6E6E6E] whitespace-nowrap">ตรวจสอบย้อนหลัง:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-[11px] text-[#1F1F1F] font-bold focus:outline-none cursor-pointer"
                  title="เลือกวันที่ตรวจสอบย้อนหลัง"
                />
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate('')}
                    title="ล้างวันที่"
                    className="text-slate-400 hover:text-red-500 ml-0.5 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {(statusFilter !== 'ALL' || carrierFilter !== 'ALL' || selectedDate !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setCarrierFilter('ALL');
                    setSelectedDate('');
                  }}
                  className="text-[10px] font-bold text-[#E03131] hover:underline flex items-center gap-1 bg-[#FFF0E6] px-2 py-0.5 rounded-md border border-[#FFD8BF] transition-all active:scale-95"
                >
                  <X className="w-2.5 h-2.5" />
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* หัวข้อ 1: สถานะ (Dropdown: ดำเนินการอยู่, ชั่งครบแล้ว, รอชั่ง) */}
            <div className="bg-[#F7F2EA]/60 py-1.5 px-2.5 rounded-xl border border-[#E8E1D8]">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-black text-[#1F1F1F] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#12803C]" />
                  <span>1. สถานะ</span>
                </label>
                <span className="text-[10px] text-[#6E6E6E]">
                  {statusFilter === 'ALL' ? 'ทั้งหมด' : statusFilter === 'IN_PROGRESS' ? 'ดำเนินการอยู่' : statusFilter === 'COMPLETED' ? 'ชั่งครบแล้ว' : 'รอชั่ง'}
                </span>
              </div>
              
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full appearance-none bg-[#FFFDF9] hover:bg-white text-[#1F1F1F] font-bold text-xs py-1.5 pl-2.5 pr-7 rounded-lg border border-[#E8E1D8] focus:border-[#12803C] focus:outline-none transition-colors cursor-pointer shadow-2xs"
                >
                  <option value="ALL">สถานะทั้งหมด ({totalAppts})</option>
                  <option value="IN_PROGRESS">🔵 ดำเนินการอยู่ ({inProgressCount})</option>
                  <option value="COMPLETED">🟢 ชั่งครบแล้ว ({completedCount})</option>
                  <option value="WAITING">🟠 รอชั่ง ({waitingCount})</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#6E6E6E] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* หัวข้อ 2: ประเภทรถ (Dropdown: PR, VN) */}
            <div className="bg-[#F7F2EA]/60 py-1.5 px-2.5 rounded-xl border border-[#E8E1D8]">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-black text-[#1F1F1F] flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#12803C]" />
                  <span>2. ประเภทรถ</span>
                </label>
                <span className="text-[10px] text-[#6E6E6E]">
                  {carrierFilter === 'ALL' ? 'ทั้งหมด' : carrierFilter}
                </span>
              </div>

              <div className="relative">
                <select
                  value={carrierFilter}
                  onChange={(e) => setCarrierFilter(e.target.value as CarrierFilter)}
                  className="w-full appearance-none bg-[#FFFDF9] hover:bg-white text-[#1F1F1F] font-bold text-xs py-1.5 pl-2.5 pr-7 rounded-lg border border-[#E8E1D8] focus:border-[#12803C] focus:outline-none transition-colors cursor-pointer shadow-2xs"
                >
                  <option value="ALL">ทั้งหมด ({totalAppts})</option>
                  <option value="VN">VN ({vnCount})</option>
                  <option value="PR">PR ({prCount})</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#6E6E6E] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Appointment Cards List ────────────────────────────── */}
        <div className="space-y-2.5 pt-0.5">
          {searchTerm.trim().length > 0 && (
            <div className="flex items-center justify-between bg-[#EAF7ED] border border-[#AEE0BD] px-3.5 py-2 rounded-2xl text-xs text-[#0B5E2B] font-bold shadow-2xs animate-fadeIn">
              <span>
                ผลการค้นหา "{searchTerm.trim()}": พบ <b>{filteredAppointments.length}</b> ใบนัดหมาย
              </span>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-[#12803C] hover:text-[#E03131] hover:underline cursor-pointer text-xs"
              >
                ล้างการค้นหา
              </button>
            </div>
          )}

          {filteredAppointments.length === 0 ? (
            <div className="bg-[#FFFDF9] rounded-3xl p-8 text-center border border-[#E8E1D8] shadow-xs">
              <Truck className="w-12 h-12 text-[#6E6E6E]/40 mx-auto mb-2" />
              <p className="text-[#1F1F1F] font-bold text-base">ไม่พบรายการที่ค้นหา</p>
              <p className="text-xs text-[#6E6E6E] mt-1">ลองเปลี่ยนคำค้นหาหรือเลือกแถบตัวกรองอื่น</p>
            </div>
          ) : (
            filteredAppointments.map((appt: Appointment) => {
              const isVN = appt.carrierCode === 'VN';
              const p = apptProgressMap.get(appt.apptNbr);
              const stats = apptCompletedMap[appt.apptNbr] || {
                completed: appt.completedGroups,
                total: appt.totalSamplingGroups,
                isDone: appt.completedGroups >= appt.totalSamplingGroups && appt.totalSamplingGroups > 0,
              };
              const liveCompleted = stats.completed || 0;
              const liveTotal = stats.total || appt.totalSamplingGroups || 0;

              // สถานะ ชั่งครบแล้ว ต้องเป็นกรณีที่ปิดงานแล้ว
              const isDone = Boolean(p?.isAllDone);
              const isInProgress = Boolean(p?.isInProgress);
              const isWaiting = !p?.hasStarted && !isDone;

              const apptStatus: 'COMPLETED' | 'IN_PROGRESS' | 'WAITING' = 
                isDone 
                  ? 'COMPLETED' 
                  : (isInProgress ? 'IN_PROGRESS' : 'WAITING');

              const isCompleted = isDone;

              return (
                <div
                  key={appt.id}
                  onClick={() => navigate(isDone ? `/appointment/${appt.apptNbr}/summary` : `/appointment/${appt.apptNbr}`)}
                  className={`rounded-2xl p-3 sm:py-3.5 sm:px-4 border-2 transition-all cursor-pointer shadow-xs active:scale-98 group space-y-2.5 ${
                    isCompleted
                      ? 'bg-white border-[#12803C] border-l-[8px] border-l-[#12803C] hover:border-[#0B5E2B] hover:shadow-md'
                      : isInProgress
                      ? 'bg-[#F8FAFF] border-[#2563EB] border-l-[8px] border-l-[#2563EB] hover:border-[#1D4ED8] hover:shadow-md'
                      : 'bg-[#FFFDF9] border-[#E67700] border-l-[8px] border-l-[#E67700] hover:border-[#C25E00] hover:shadow-md'
                  }`}
                >
                  {/* Formal Header: Appt Number, Carrier & Status Badge */}
                  <div className="flex flex-wrap justify-between items-center gap-1.5 pb-2 border-b border-[#E8E1D8]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-[#1F1F1F] text-lg sm:text-xl tracking-tight">
                        {appt.apptNbr}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-black border ${
                          isVN
                            ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]'
                            : 'bg-[#FFF0E6] text-[#F76707] border-[#FFD8BF]'
                        }`}
                      >
                        {appt.carrierCode}
                      </span>

                      {/* Prominent Header Status Pill */}
                      {isCompleted && (
                        <span className="bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD] px-2.5 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-[#12803C]" />
                          ชั่งครบแล้ว
                        </span>
                      )}
                      {isInProgress && (
                        <span className="bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2.5 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 shadow-2xs">
                          <Sparkles className="w-3 h-3 text-[#2563EB]" />
                          ดำเนินการอยู่
                        </span>
                      )}
                      {isWaiting && (
                        <span className="bg-[#FEF9E7] text-[#B45309] border border-[#FDE68A] px-2.5 py-0.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1 shadow-2xs">
                          <Clock className="w-3 h-3 text-[#E67700]" />
                          รอชั่ง
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-[#1F1F1F] font-bold bg-[#F7F2EA] px-2.5 py-0.5 rounded-xl border border-[#E8E1D8] shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-[#12803C] shrink-0" />
                      <span>{formatApptDateTime(appt.apptTime, appt.receiveDate)}</span>
                    </div>
                  </div>

                  {/* Formal 3-Box Metrics Grid (กล่องตัวเลขสไตล์ทางการ พร้อมเส้นแบ่งชัดเจน) */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-[#F7F2EA] py-1.5 px-2 rounded-xl border border-[#E8E1D8]">
                      <div className="text-[11px] text-[#6E6E6E] font-medium flex items-center justify-center gap-1 mb-0.5">
                        <Building2 className="w-3.5 h-3.5 text-[#12803C]" />
                        <span>ผู้ขาย</span>
                      </div>
                      <div className="font-black text-sm text-[#1F1F1F]">{appt.vendorCount} ราย</div>
                    </div>

                    <div className="bg-[#F7F2EA] py-1.5 px-2 rounded-xl border border-[#E8E1D8]">
                      <div className="text-[11px] text-[#6E6E6E] font-medium flex items-center justify-center gap-1 mb-0.5">
                        <Package className="w-3.5 h-3.5 text-[#12803C]" />
                        <span>ใบสั่งซื้อ (PO)</span>
                      </div>
                      <div className="font-black text-sm text-[#1F1F1F]">{appt.poCount} ใบ</div>
                    </div>

                    <div className={`py-1.5 px-2 rounded-xl border ${
                      isCompleted 
                        ? 'bg-[#EAF7ED] border-[#AEE0BD]' 
                        : isInProgress 
                        ? 'bg-[#EFF6FF] border-[#BFDBFE]' 
                        : 'bg-[#FEF9E7] border-[#FDE68A]'
                    }`}>
                      <div className={`text-[11px] font-medium flex items-center justify-center gap-1 mb-0.5 ${
                        isCompleted ? 'text-[#0B5E2B]' : isInProgress ? 'text-[#1D4ED8]' : 'text-[#B45309]'
                      }`}>
                        <Layers className={`w-3.5 h-3.5 ${
                          isCompleted ? 'text-[#12803C]' : isInProgress ? 'text-[#2563EB]' : 'text-[#E67700]'
                        }`} />
                        <span>สินค้า (CW)</span>
                      </div>
                      <div className={`font-black text-sm ${
                        isCompleted ? 'text-[#12803C]' : isInProgress ? 'text-[#2563EB]' : 'text-[#B45309]'
                      }`}>
                        {liveTotal} รายการ
                      </div>
                    </div>
                  </div>

                  {/* Real-time ITEM Progress Bar */}
                  <div className="bg-[#F7F2EA] py-1.5 px-3 rounded-xl border border-[#E8E1D8] space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#6E6E6E] font-bold">ความคืบหน้าการชั่งน้ำหนัก:</span>
                      <span className={`font-black ${
                        isCompleted ? 'text-[#12803C]' : isInProgress ? 'text-[#2563EB]' : 'text-[#B45309]'
                      }`}>
                        {liveCompleted} / {liveTotal} รายการ ({liveTotal > 0 ? Math.round((liveCompleted / liveTotal) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="w-full bg-white rounded-full h-2.5 overflow-hidden border border-[#E8E1D8]">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted ? 'bg-[#12803C]' : isInProgress ? 'bg-[#2563EB]' : 'bg-[#E67700]'
                        }`}
                        style={{ 
                          width: `${liveTotal > 0 ? (liveCompleted / liveTotal) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Bottom Action Footer with Clean Divider */}
                  <div className="pt-2 border-t border-[#E8E1D8] flex flex-wrap justify-between items-center gap-1.5 text-xs">
                    <div>
                      {isCompleted && (
                        <span className="bg-[#EAF7ED] text-[#12803C] border border-[#AEE0BD] px-3 py-1 rounded-full inline-flex items-center gap-1.5 text-xs font-black shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ชั่งครบทุก ITEM แล้ว
                        </span>
                      )}
                      {isInProgress && (
                        <span className="bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-3 py-1 rounded-full inline-flex items-center gap-1.5 text-xs font-black shadow-2xs">
                          <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#2563EB]" />
                          กำลังชั่ง (เสร็จแล้ว {liveCompleted}/{liveTotal} รายการ)
                        </span>
                      )}
                      {isWaiting && (
                        <span className="bg-[#FEF9E7] text-[#B45309] border border-[#FDE68A] px-3 py-1 rounded-full inline-flex items-center gap-1.5 text-xs font-black shadow-2xs">
                          <Clock className="w-3.5 h-3.5 shrink-0 text-[#E67700]" />
                          รอชั่งอีก {liveTotal - liveCompleted} รายการ
                        </span>
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                      {isCompleted && (
                        <span className="bg-[#12803C] group-hover:bg-[#0B5E2B] text-white font-black px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-xs group-hover:shadow inline-flex items-center gap-1.5 transition-all text-xs sm:text-sm">
                          ดู Summary & ลงนาม <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
                        </span>
                      )}
                      {isInProgress && (
                        <span className="bg-[#2563EB] group-hover:bg-[#1D4ED8] text-white font-black px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-sm group-hover:shadow-md inline-flex items-center gap-1.5 transition-all text-xs sm:text-sm active:scale-95">
                          ชั่งน้ำหนักต่อ <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
                        </span>
                      )}
                      {isWaiting && (
                        <span className="bg-[#E67700] group-hover:bg-[#C25E00] text-white font-black px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-sm group-hover:shadow-md inline-flex items-center gap-1.5 transition-all text-xs sm:text-sm active:scale-95">
                          เข้าสู่หน้าชั่ง <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
