// ============================================================
// SMART DC — BackOfficePage Component
// Dedicated Admin Back Office Hub (Section 14)
// Restricted to ADMIN & SUPERVISOR roles
// Features: Reconciliation, Basket Master, Focus Master (Yearly),
// 33-Person Authorized Roster, Google Sheets/Drive Sync
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Layout from '../components/Layout';
import { 
  ShieldAlert, 
  ShoppingBasket, 
  FileSpreadsheet, 
  Users, 
  Cloud, 
  CheckCircle2, 
  AlertTriangle,
  FileUp,
  ExternalLink,
  Sparkles,
  Upload,
  Download,
  Trash2,
  Plus,
  Search,
  RefreshCw,
  X,
  ArrowRight,
  KeyRound,
  UserCheck,
  UserPlus,
  Shield,
  RotateCcw,
  Edit2,
  Check,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db, syncSamplingGroupsWithFocusMaster, deduplicateBasketMaster, deduplicateUsers } from '../lib/database';
import { importItemMasterExcel } from '../lib/excelImport';
import type { FocusMasterItem, User, UserRole, BasketMasterItem } from '../types';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import authorizedRoster from '../lib/authorizedRoster.json';
import { supabase } from '../lib/supabaseClient';
import { sanitizeSyncData } from '../lib/syncEngine';

export default function BackOfficePage() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'ITEM_MASTER' | 'FOCUS' | 'BASKET'>('ROSTER');

  const displayName = currentUser?.fullName
    ? currentUser.fullName.replace(/\s*\([^)]*@.*?\)/g, '').trim()
    : (currentUser?.username || 'ผู้ดูแลระบบ');

  // Auto-deduplicate baskets and users on mount
  useEffect(() => {
    deduplicateBasketMaster();
    deduplicateUsers();
  }, []);

  // Item Master states
  const masterCount = useLiveQuery(() => db.itemMaster.count(), []) ?? 0;
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [isMasterImporting, setIsMasterImporting] = useState<boolean>(false);
  const [masterResult, setMasterResult] = useState<any>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterSearchQuery, setMasterSearchQuery] = useState<string>('');
  const itemMasterFileInputRef = useRef<HTMLInputElement>(null);

  const masterSearchResults = useLiveQuery(async () => {
    if (!masterSearchQuery.trim()) {
      return db.itemMaster.limit(10).toArray();
    }
    const q = masterSearchQuery.trim().toLowerCase();
    const all = await db.itemMaster.toArray();
    return all.filter(item => 
      item.itemId.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [masterSearchQuery]) ?? [];

  const handleMasterFileChange = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setMasterError('กรุณาเลือกไฟล์ Excel นามสกุล .xlsx หรือ .xls เท่านั้น');
      return;
    }
    setMasterFile(selectedFile);
    setMasterError(null);
  };

  const handleMasterImport = async () => {
    if (!masterFile) {
      setMasterError('กรุณาเลือกไฟล์ Item Master (.xlsx)');
      return;
    }

    setIsMasterImporting(true);
    setMasterError(null);
    try {
      const res = await importItemMasterExcel(masterFile);
      setMasterResult(res);
      setMasterFile(null);
      if (itemMasterFileInputRef.current) {
        itemMasterFileInputRef.current.value = '';
      }
    } catch (err: any) {
      setMasterError(err?.message || 'เกิดข้อผิดพลาดในการนำเข้าไฟล์ Item Master');
    } finally {
      setIsMasterImporting(false);
    }
  };

  // Basket Master states
  const [basketSearch, setBasketSearch] = useState('');
  const [showAddBasketModal, setShowAddBasketModal] = useState(false);
  const [newBasketCode, setNewBasketCode] = useState('');
  const [newBasketName, setNewBasketName] = useState('');
  const [newBasketTare, setNewBasketTare] = useState('');
  const [editingBasket, setEditingBasket] = useState<BasketMasterItem | null>(null);
  const [editBasketName, setEditBasketName] = useState('');
  const [editBasketTare, setEditBasketTare] = useState('');
  const [basketUploadMsg, setBasketUploadMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Roster Management states
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState<string>('ALL');
  const [rosterUploadMsg, setRosterUploadMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newDepartment, setNewDepartment] = useState('DC Receiving Fresh');
  const [newRole, setNewRole] = useState<UserRole>('RECEIVE');
  const rosterFileInputRef = useRef<HTMLInputElement>(null);

  // Focus Master states
  const [focusSearch, setFocusSearch] = useState('');
  const [focusUploadMsg, setFocusUploadMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isUploadingFocus, setIsUploadingFocus] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemId, setNewItemId] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemStatus, setNewItemStatus] = useState('Check 992');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const zeroQtyGroups = useLiveQuery(async () => {
    return await db.samplingGroups
      .where('deliveryStatus')
      .anyOf(['NOT_DELIVERED', 'PARTIAL_DELIVERY', 'QUANTITY_DISCREPANCY'])
      .toArray();
  }, []) || [];

  const focusMasterItems = useLiveQuery(async () => {
    return await db.focusMaster.toArray();
  }, []) || [];

  const dbUsers = useLiveQuery(async () => {
    return await db.users.toArray();
  }, []) || [];

  const baskets = useLiveQuery(async () => {
    return await db.basketMaster.toArray();
  }, []) || [];

  const uniqueBaskets = Array.from(
    baskets.reduce((map, b) => {
      const code = (b.code || '').trim().toUpperCase();
      if (!code) return map;
      if (!map.has(code) || (!map.get(code)!.isActive && b.isActive)) {
        map.set(code, b);
      }
      return map;
    }, new Map<string, BasketMasterItem>()).values()
  );

  const basketCount = uniqueBaskets.length;

  // Basket Master handlers
  const handleAddBasket = async (e: React.FormEvent) => {
    e.preventDefault();
    const tare = parseFloat(newBasketTare);
    if (!newBasketCode.trim()) {
      setBasketUploadMsg({ type: 'error', text: 'กรุณาระบุรหัสตะกร้า/ภาชนะ (เช่น W, X, Carton)' });
      return;
    }
    if (isNaN(tare) || tare < 0) {
      setBasketUploadMsg({ type: 'error', text: 'กรุณาระบุน้ำหนักภาชนะ (Tare Weight) ที่ถูกต้อง (>= 0 kg)' });
      return;
    }

    const upperCode = newBasketCode.trim().toUpperCase();
    const existing = uniqueBaskets.find(b => b.code.toUpperCase() === upperCode);
    if (existing) {
      setBasketUploadMsg({ type: 'error', text: `รหัสภาชนะ ${upperCode} มีอยู่ในระบบแล้ว` });
      return;
    }

    const now = new Date().toISOString();
    const newBasket: BasketMasterItem = {
      id: `basket-${upperCode}`,
      code: upperCode,
      name: newBasketName.trim() || `Tray ${upperCode}`,
      tareWeightKg: tare,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.fullName || 'Admin',
    };

    await db.basketMaster.put(newBasket);
    await deduplicateBasketMaster();
    try {
      await supabase.from('sync_state').upsert({
        key: `basketMaster:${newBasket.id}`,
        data: sanitizeSyncData(newBasket),
        updated_at: now,
      });
    } catch (cloudErr) {
      console.warn('[BackOffice] Supabase sync warning:', cloudErr);
    }

    setNewBasketCode('');
    setNewBasketName('');
    setNewBasketTare('');
    setShowAddBasketModal(false);
    setBasketUploadMsg({ type: 'success', text: `✅ เพิ่มตะกร้า ${upperCode} (${tare.toFixed(2)} kg) สำเร็จ` });
  };

  const startEditBasket = (b: BasketMasterItem) => {
    setEditingBasket(b);
    setEditBasketName(b.name);
    setEditBasketTare(String(b.tareWeightKg));
  };

  const handleSaveEditBasket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBasket) return;
    const tare = parseFloat(editBasketTare);
    if (isNaN(tare) || tare < 0) {
      setBasketUploadMsg({ type: 'error', text: 'กรุณาระบุน้ำหนักที่ถูกต้อง (>= 0 kg)' });
      return;
    }

    const now = new Date().toISOString();
    const updated: Partial<BasketMasterItem> = {
      name: editBasketName.trim() || editingBasket.name,
      tareWeightKg: tare,
      updatedAt: now,
      updatedBy: currentUser?.fullName || 'Admin',
    };

    await db.basketMaster.update(editingBasket.id, updated);
    await deduplicateBasketMaster();
    try {
      await supabase.from('sync_state').upsert({
        key: `basketMaster:${editingBasket.id}`,
        data: sanitizeSyncData({ ...editingBasket, ...updated }),
        updated_at: now,
      });
    } catch (cloudErr) {
      console.warn('[BackOffice] Supabase sync warning:', cloudErr);
    }

    setEditingBasket(null);
    setBasketUploadMsg({ type: 'success', text: `✅ บันทึกแก้ไข Tray ${editingBasket.code} เป็น ${tare.toFixed(2)} kg สำเร็จ` });
  };

  const handleToggleBasketActive = async (b: BasketMasterItem) => {
    const now = new Date().toISOString();
    const nextActive = !b.isActive;
    await db.basketMaster.update(b.id, {
      isActive: nextActive,
      updatedAt: now,
      updatedBy: currentUser?.fullName || 'Admin',
    });
    await deduplicateBasketMaster();
    try {
      await supabase.from('sync_state').upsert({
        key: `basketMaster:${b.id}`,
        data: sanitizeSyncData({ ...b, isActive: nextActive, updatedAt: now }),
        updated_at: now,
      });
    } catch (cloudErr) {
      console.warn('[BackOffice] Supabase sync warning:', cloudErr);
    }
  };

  // Guard for Admin/Supervisor
  const isAdminOrSupervisor = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '');

  if (!isAdminOrSupervisor) {
    return (
      <Layout title="ข้อมูลหลังบ้าน" showBack backTo="/dashboard">
        <div className="p-8 text-center max-w-sm mx-auto space-y-3">
          <ShieldAlert className="w-16 h-16 text-[#E03131] mx-auto" />
          <h3 className="font-black text-[#1F1F1F] text-lg">จำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin Only)</h3>
          <p className="text-xs text-[#6E6E6E]">
            หน้านี้สงวนไว้สำหรับผู้ดูแลระบบและหัวหน้างานเท่านั้น พนักงานตรวจรับทั่วไปไม่สามารถเข้าถึงการตั้งค่าหลังบ้านได้
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary mt-4"
          >
            กลับสู่หน้าหลัก
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="ข้อมูลหลังบ้าน" showBack backTo="/dashboard">
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-28 text-[#1F1F1F]">
        
        {/* Admin Header */}
        <div className="bg-gradient-to-br from-[#12803C] to-[#0B5E2B] text-white p-4 sm:p-5 rounded-3xl shadow-sm space-y-2.5 overflow-hidden">
          <div>
            <span className="bg-[#EFD9A7] text-[#0B5E2B] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">
              SMART DC Administration
            </span>
            <h2 className="text-lg sm:text-xl font-black leading-tight">ข้อมูลหลังบ้าน</h2>
            <p className="text-xs text-white/90 truncate mt-0.5" title={currentUser?.fullName || displayName}>
              ผู้ดูแลระบบ: <b className="font-bold">{displayName}</b>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/20 text-center text-xs">
            <div>
              <div className="font-black text-base text-white">{dbUsers.length || 0} คน</div>
              <div className="text-[10px] text-white/80">พนักงานในระบบ</div>
            </div>
            <div>
              <div className="font-black text-base text-white">{masterCount.toLocaleString()}</div>
              <div className="text-[10px] text-white/80">Item Master</div>
            </div>
            <div>
              <div className="font-black text-base text-white">{focusMasterItems.length || 0} รายการ</div>
              <div className="text-[10px] text-white/80">Focus Master</div>
            </div>
            <div>
              <div className="font-black text-base text-white">{basketCount || 0} ขนาด</div>
              <div className="text-[10px] text-white/80">ตะกร้ามาตรฐาน</div>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-3.5 py-2 rounded-2xl font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'ROSTER'
                ? 'bg-[#12803C] text-white shadow-xs'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border border-[#E8E1D8]'
            }`}
          >
            ทำเนียบพนักงาน ({dbUsers.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('ITEM_MASTER')}
            className={`px-3.5 py-2 rounded-2xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ITEM_MASTER'
                ? 'bg-[#12803C] text-white shadow-xs'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border border-[#E8E1D8]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Item Master ({masterCount.toLocaleString()})</span>
          </button>
          <button
            onClick={() => setActiveTab('FOCUS')}
            className={`px-3.5 py-2 rounded-2xl font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'FOCUS'
                ? 'bg-[#12803C] text-white shadow-xs'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border border-[#E8E1D8]'
            }`}
          >
            Focus Master รายปี
          </button>
          <button
            onClick={() => setActiveTab('BASKET')}
            className={`px-3.5 py-2 rounded-2xl font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'BASKET'
                ? 'bg-[#12803C] text-white shadow-xs'
                : 'bg-[#FFFDF9] text-[#6E6E6E] border border-[#E8E1D8]'
            }`}
          >
            จัดการขนาดตะกร้า ({basketCount})
          </button>
        </div>

        {/* ─── TAB 1: ROSTER & USER MANAGEMENT ────────────── */}
        {activeTab === 'ROSTER' && (() => {
          // Deduplicate users in memory so every account appears exactly once
          const uniqueUsers = Array.from(
            dbUsers.reduce((map, u) => {
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

              if (!map.has(key)) {
                map.set(key, u);
              } else {
                const prev = map.get(key)!;
                if (!prev.isPinSet && u.isPinSet) {
                  map.set(key, u);
                }
              }
              return map;
            }, new Map<string, User>()).values()
          );

          const filteredUsers = uniqueUsers.filter(u => {
            const matchesSearch = !rosterSearch.trim() || (() => {
              const q = rosterSearch.toLowerCase();
              return (
                (u.empId && u.empId.toLowerCase().includes(q)) ||
                (u.fullName && u.fullName.toLowerCase().includes(q)) ||
                (u.department && u.department.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q))
              );
            })();

            const matchesRole = rosterRoleFilter === 'ALL' || u.role === rosterRoleFilter;
            return matchesSearch && matchesRole;
          });

          // Upload Excel Roster with Intelligent Deduplication (Upsert)
          const handleRosterExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
              setIsUploadingRoster(true);
              setRosterUploadMsg(null);

              const buffer = await file.arrayBuffer();
              const wb = XLSX.read(buffer, { type: 'array' });
              const firstSheetName = wb.SheetNames[0];
              const sheet = wb.Sheets[firstSheetName];
              const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

              if (!rows || rows.length === 0) {
                setRosterUploadMsg({ type: 'error', text: 'ไม่พบข้อมูลในไฟล์ Excel ที่เลือก' });
                return;
              }

              const currentUsers = await db.users.toArray();
              const userMap = new Map<string, User>();
              for (const u of currentUsers) {
                if (u.empId) {
                  userMap.set(u.empId.trim().toUpperCase(), u);
                }
              }

              const now = new Date().toISOString();
              let updatedCount = 0;
              let addedCount = 0;
              const usersToUpsert: User[] = [];

              for (const row of rows) {
                const keys = Object.keys(row);
                const idKey = keys.find(k => /emp.*id|employee.*id|รหัสพนักงาน|รหัส/i.test(k));
                const nameKey = keys.find(k => /name|ชื่อ.*สกุล|ชื่อพนักงาน|ชื่อ/i.test(k));
                const deptKey = keys.find(k => /dept|department|แผนก|สังกัด/i.test(k));
                const roleKey = keys.find(k => /role|สิทธิ์|บทบาท|ตำแหน่ง/i.test(k));
                const emailKey = keys.find(k => /email|mail|อีเมล/i.test(k));

                const rawId = idKey ? String(row[idKey]).trim() : '';
                const cleanId = rawId.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!cleanId) continue;

                const rawName = nameKey && row[nameKey] ? String(row[nameKey]).trim() : '';
                const rawDept = deptKey && row[deptKey] ? String(row[deptKey]).trim() : '';
                const rawRole = roleKey && row[roleKey] ? String(row[roleKey]).trim().toUpperCase() : '';
                const rawEmail = emailKey && row[emailKey] ? String(row[emailKey]).trim() : undefined;

                // Determine Role
                let assignedRole: UserRole = 'RECEIVE';
                if (/OTM|OPERATION.*MANAGER|MANAGER/i.test(rawRole) || /Operation Team Manager/i.test(rawDept)) {
                  assignedRole = 'OTM';
                } else if (/LPS|S&LP|LOSS.*PREVENTION|SECURITY/i.test(rawRole) || /S&LP/i.test(rawDept)) {
                  assignedRole = 'LPS';
                } else if (/ADMIN/i.test(rawRole)) {
                  assignedRole = 'ADMIN';
                } else if (/SUPERVISOR/i.test(rawRole)) {
                  assignedRole = 'SUPERVISOR';
                }

                const existing = userMap.get(cleanId);
                if (existing) {
                  // UPDATE existing employee — PRESERVE existing PIN and credentials!
                  const updatedUser: User = {
                    ...existing,
                    fullName: rawName || existing.fullName,
                    department: rawDept || existing.department,
                    role: rawRole ? assignedRole : existing.role,
                    email: rawEmail || existing.email,
                  };
                  usersToUpsert.push(updatedUser);
                  userMap.set(cleanId, updatedUser);
                  updatedCount++;
                } else {
                  // ADD brand new employee — Ready for Onboarding PIN
                  const newUser: User = {
                    id: `user-${cleanId}`,
                    username: cleanId,
                    empId: cleanId,
                    fullName: rawName || cleanId,
                    role: assignedRole,
                    department: rawDept || 'DC Receiving Fresh',
                    email: rawEmail,
                    pinHash: '',
                    isPinSet: false,
                    isActive: true,
                    createdAt: now,
                  };
                  usersToUpsert.push(newUser);
                  userMap.set(cleanId, newUser);
                  addedCount++;
                }
              }

              if (usersToUpsert.length === 0) {
                setRosterUploadMsg({
                  type: 'error',
                  text: 'ไม่พบคอลัมน์รหัสพนักงาน กรุณาใช้หัวคอลัมน์ "รหัสพนักงาน" หรือ "Employee ID"'
                });
                return;
              }

              // Save to IndexedDB
              await db.users.bulkPut(usersToUpsert);

              // Sync to Supabase Realtime in batches
              try {
                const cloudPayload = usersToUpsert.map(u => ({
                  key: `users:${u.empId!.trim().toUpperCase()}`,
                  data: sanitizeSyncData(u),
                  updated_at: now,
                }));

                for (let i = 0; i < cloudPayload.length; i += 50) {
                  await supabase.from('sync_state').upsert(cloudPayload.slice(i, i + 50));
                }
              } catch (cloudErr) {
                console.warn('[BackOffice] Supabase sync warning:', cloudErr);
              }

              setRosterUploadMsg({
                type: 'success',
                text: `✅ อัปเดตพนักงานสำเร็จ! เพิ่มคนใหม่ ${addedCount} คน, อัปเดตคนเดิม ${updatedCount} คน (ระบบใช้รหัสพนักงานเป็นหลัก ข้อมูลไม่ซ้ำซ้อน และรหัส PIN เดิมปลอดภัย)`
              });

              if (rosterFileInputRef.current) rosterFileInputRef.current.value = '';
            } catch (err: any) {
              console.error(err);
              setRosterUploadMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err.message || 'อ่านไฟล์ไม่สำเร็จ'}` });
            } finally {
              setIsUploadingRoster(false);
            }
          };

          // Download Template
          const handleDownloadRosterTemplate = () => {
            const templateData = [
              { 'รหัสพนักงาน': '60012345', 'ชื่อ-สกุล': 'นายสมชาย มั่นคง', 'แผนก': 'DC Receiving Fresh', 'ตำแหน่ง/สิทธิ์': 'RECEIVE' },
              { 'รหัสพนักงาน': '60012346', 'ชื่อ-สกุล': 'นางสาวสมหญิง ใจดี', 'แผนก': 'DC S&LP Fresh', 'ตำแหน่ง/สิทธิ์': 'LPS' },
              { 'รหัสพนักงาน': '60012347', 'ชื่อ-สกุล': 'นายวิชาญ บริหารงาน', 'แผนก': 'DC Operation Team Manager', 'ตำแหน่ง/สิทธิ์': 'OTM' },
            ];
            const ws = XLSX.utils.json_to_sheet(templateData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Roster_Template');
            XLSX.writeFile(wb, 'SMART_DC_Employee_Roster_Template.xlsx');
          };

          // Add Single Employee
          const handleAddSingleUser = async (e: React.FormEvent) => {
            e.preventDefault();
            const cleanId = newEmpId.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!cleanId || !newFullName.trim()) return;

            const now = new Date().toISOString();
            const existing = await db.users.where('empId').equalsIgnoreCase(cleanId).first();

            const targetUser: User = {
              id: existing?.id || `user-${cleanId}`,
              username: cleanId,
              empId: cleanId,
              fullName: newFullName.trim(),
              role: newRole,
              department: newDepartment.trim() || 'DC Receiving Fresh',
              pinHash: existing?.pinHash || '',
              isPinSet: existing?.isPinSet || false,
              isActive: true,
              createdAt: existing?.createdAt || now,
            };

            await db.users.put(targetUser);

            // Sync to Supabase
            try {
              await supabase.from('sync_state').upsert({
                key: `users:${cleanId}`,
                data: sanitizeSyncData(targetUser),
                updated_at: now,
              });
            } catch (err) {
              console.warn('Cloud sync error', err);
            }

            setRosterUploadMsg({
              type: 'success',
              text: `✅ บันทึกพนักงาน ${targetUser.fullName} (รหัส: ${targetUser.empId}) เรียบร้อยแล้ว`
            });

            setNewEmpId('');
            setNewFullName('');
            setShowAddUserModal(false);
          };

          // Reset PIN for Employee
          const handleResetUserPin = async (user: User) => {
            if (!confirm(`คุณต้องการรีเซ็ตรหัส PIN ของคุณ "${user.fullName}" (${user.empId}) หรือไม่?\n\nเมื่อรีเซ็ตแล้ว พนักงานสามารถไปตั้งรหัส PIN 6 หลักใหม่ได้ที่หน้าแรก`)) {
              return;
            }

            const now = new Date().toISOString();
            const updated: User = {
              ...user,
              pinHash: '',
              isPinSet: false,
            };

            await db.users.put(updated);

            try {
              await supabase.from('sync_state').upsert({
                key: `users:${user.empId!.trim().toUpperCase()}`,
                data: sanitizeSyncData(updated),
                updated_at: now,
              });
            } catch (err) {
              console.warn('Cloud sync reset pin error', err);
            }

            setRosterUploadMsg({
              type: 'success',
              text: `🔑 รีเซ็ต PIN ของคุณ ${user.fullName} เรียบร้อยแล้ว (สามารถเข้าหน้าแรกเพื่อตั้งรหัสใหม่ได้ทันที)`
            });
          };

          // Change User Role
          const handleChangeRole = async (user: User, newR: UserRole) => {
            const now = new Date().toISOString();
            const updated: User = {
              ...user,
              role: newR,
            };

            await db.users.put(updated);

            try {
              await supabase.from('sync_state').upsert({
                key: `users:${user.empId!.trim().toUpperCase()}`,
                data: sanitizeSyncData(updated),
                updated_at: now,
              });
            } catch (err) {
              console.warn('Cloud sync role error', err);
            }
          };

          // Delete User
          const handleDeleteUser = async (user: User) => {
            if (!confirm(`ยืนยันการลบพนักงาน "${user.fullName}" (${user.empId}) ออกจากระบบหรือไม่?`)) {
              return;
            }

            await db.users.delete(user.id);
            try {
              await supabase.from('sync_state').delete().eq('key', `users:${user.empId!.trim().toUpperCase()}`);
            } catch (err) {
              console.warn('Cloud delete error', err);
            }

            setRosterUploadMsg({
              type: 'success',
              text: `🗑️ ลบพนักงาน ${user.fullName} ออกจากระบบเรียบร้อยแล้ว`
            });
          };

          return (
            <div className="space-y-3">
              {/* Header Box */}
              <div className="bg-[#FFFDF9] p-4 rounded-3xl border border-[#E8E1D8] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#12803C]" />
                      จัดการทำเนียบพนักงาน & สิทธิ์ (Roster Management)
                    </h3>
                    <p className="text-[11px] text-[#6E6E6E] mt-0.5">
                      ระบบใช้ <b>รหัสพนักงาน (Employee ID)</b> เป็นตัวระบุหลัก สามารถโยนไฟล์ใหม่ได้ ข้อมูลจะไม่ซ้ำซ้อน
                    </p>
                  </div>
                  <span className="bg-[#EAF7ED] text-[#12803C] font-black text-xs px-2.5 py-1 rounded-full border border-[#AEE0BD]">
                    {dbUsers.length} คน
                  </span>
                </div>

                {/* Upload Action Box */}
                <div className="p-3.5 bg-[#F7F2EA] border-2 border-dashed border-[#12803C]/40 rounded-2xl text-center space-y-2.5">
                  <input
                    ref={rosterFileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleRosterExcelUpload}
                    className="hidden"
                    id="roster-excel-file-input"
                  />
                  <div className="flex flex-col items-center justify-center">
                    <FileSpreadsheet className="w-8 h-8 text-[#12803C] mb-1" />
                    <span className="text-xs font-bold text-[#1F1F1F]">
                      อัปโหลดไฟล์รายชื่อพนักงาน (.xlsx / .csv)
                    </span>
                    <span className="text-[10px] text-[#6E6E6E] mt-0.5">
                      คอลัมน์ที่รองรับ: <b>รหัสพนักงาน</b>, <b>ชื่อ-สกุล</b>, <b>แผนก</b>, <b>ตำแหน่ง/สิทธิ์</b>
                    </span>
                  </div>

                  <div className="flex gap-2 justify-center pt-1">
                    <label
                      htmlFor="roster-excel-file-input"
                      className={`btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm ${
                        isUploadingRoster ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {isUploadingRoster ? 'กำลังนำเข้าข้อมูล...' : 'เลือกไฟล์ Excel รายชื่อ'}
                    </label>

                    <button
                      type="button"
                      onClick={handleDownloadRosterTemplate}
                      className="bg-white border border-[#E8E1D8] text-[#1F1F1F] hover:bg-[#F7F2EA] py-2 px-3 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition-all shadow-xs"
                      title="ดาวน์โหลดไฟล์ Template ต้นแบบพนักงาน"
                    >
                      <Download className="w-3.5 h-3.5 text-[#12803C]" />
                      โหลด Template
                    </button>
                  </div>
                </div>

                {/* Feedback Toast */}
                {rosterUploadMsg && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                      rosterUploadMsg.type === 'success'
                        ? 'bg-[#EAF7ED] text-[#0B5E2B] border border-[#AEE0BD]'
                        : 'bg-[#FDE8E8] text-[#C92A2A] border border-[#F8B4B4]'
                    }`}
                  >
                    <span>{rosterUploadMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setRosterUploadMsg(null)}
                      className="p-1 hover:opacity-75"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Toolbar, Role Filter & Search */}
              <div className="bg-[#FFFDF9] p-3 rounded-2xl border border-[#E8E1D8] space-y-2.5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#6E6E6E] absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="ค้นหารหัสพนักงาน, ชื่อ, หรือแผนก..."
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(true)}
                    className="bg-[#12803C] text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs hover:bg-[#0B5E2B] transition-all whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มพนักงาน
                  </button>
                </div>

                {/* Role Filter Chips */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
                  {['ALL', 'RECEIVE', 'LPS', 'OTM', 'ADMIN'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRosterRoleFilter(r)}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                        rosterRoleFilter === r
                          ? 'bg-[#12803C] text-white'
                          : 'bg-[#F7F2EA] text-[#6E6E6E] hover:bg-[#E8E1D8]'
                      }`}
                    >
                      {r === 'ALL' ? 'ทั้งหมด' : r}
                    </button>
                  ))}
                </div>

                {/* User List Table */}
                <div className="space-y-2 max-h-[420px] overflow-y-auto no-scrollbar pt-1">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#6E6E6E]">
                      {rosterSearch ? 'ไม่พบพนักงานที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลพนักงานในระบบ'}
                    </div>
                  ) : (
                    filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        className="bg-[#FFFDF9] p-3 rounded-2xl border border-[#E8E1D8] text-xs flex justify-between items-center shadow-xs hover:border-[#12803C]/40 transition-all gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#1F1F1F] truncate">{u.fullName}</span>
                            {u.isPinSet ? (
                              <span className="bg-[#EAF7ED] text-[#12803C] text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5 border border-[#AEE0BD]" title="พนักงานตั้งรหัส PIN แล้ว">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                ตั้ง PIN แล้ว
                              </span>
                            ) : (
                              <span className="bg-[#FEF9E7] text-[#9A7D0A] text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-flex items-center gap-0.5 border border-[#FAD7A0]" title="ยังไม่ได้ตั้งรหัส PIN">
                                รอ Onboard
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-[#6E6E6E] mt-0.5 truncate">
                            รหัส: <b className="text-[#12803C]">{u.empId || u.username}</b> · {u.department || 'DC Receiving Fresh'}
                          </div>
                        </div>

                        {/* Role Selector & Quick Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-xl border border-transparent focus:outline-none cursor-pointer ${
                              u.role === 'OTM' ? 'bg-[#F3E8FF] text-[#7950F2]' :
                              u.role === 'LPS' ? 'bg-[#FEF9E7] text-[#9A7D0A]' :
                              u.role === 'ADMIN' ? 'bg-[#FDE8E8] text-[#C92A2A]' : 'bg-[#EAF7ED] text-[#12803C]'
                            }`}
                            title="คลิกเพื่อเปลี่ยนสิทธิ์"
                          >
                            <option value="RECEIVE">RECEIVE</option>
                            <option value="LPS">LPS (S&LP)</option>
                            <option value="OTM">OTM</option>
                            <option value="SUPERVISOR">SUPERVISOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>

                          {/* Reset PIN button */}
                          <button
                            type="button"
                            onClick={() => handleResetUserPin(u)}
                            className="p-1.5 text-[#6E6E6E] hover:text-[#0B5E2B] hover:bg-[#EAF7ED] rounded-xl transition-all"
                            title="รีเซ็ตรหัส PIN เพื่อให้พนักงานตั้งใหม่"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button (except own admin account) */}
                          {u.empId !== currentUser?.empId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-[#6E6E6E] hover:text-[#E03131] hover:bg-[#FDE8E8] rounded-xl transition-all"
                              title="ลบพนักงาน"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-[#F7F2EA] rounded-xl text-[10px] text-[#6E6E6E] space-y-0.5">
                  <p>💡 <b>การป้องกันชื่อซ้ำ:</b> ระบบใช้ <b>รหัสพนักงาน</b> เป็น Key ตรวจสอบ แม้จะมีพนักงานชื่อ-นามสกุลเหมือนกัน ก็จะไม่เกิดการบันทึกทับกัน</p>
                  <p>💡 <b>การโยนไฟล์ใหม่ทั้งชุด:</b> คนเก่าในไฟล์จะถูกอัปเดตข้อมูลให้ทันสมัยโดยที่ <u>รหัส PIN เดิมจะไม่หาย</u> ส่วนคนใหม่จะถูกเพิ่มเข้าระบบอัตโนมัติ</p>
                </div>
              </div>

              {/* Add Single User Modal */}
              {showAddUserModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-xl border border-[#E8E1D8]">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-[#12803C]" />
                        เพิ่มพนักงานใหม่ทีละคน
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddUserModal(false)}
                        className="text-[#6E6E6E] hover:text-[#1F1F1F]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddSingleUser} className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          รหัสพนักงาน (Employee ID) <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="เช่น 60012345"
                          value={newEmpId}
                          onChange={(e) => setNewEmpId(e.target.value.toUpperCase())}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          ชื่อ-นามสกุล <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="เช่น นายสมชาย ใจดี"
                          value={newFullName}
                          onChange={(e) => setNewFullName(e.target.value)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          แผนก / สังกัด:
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น DC Receiving Fresh"
                          value={newDepartment}
                          onChange={(e) => setNewDepartment(e.target.value)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          บทบาท / สิทธิ์การใช้งาน:
                        </label>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as UserRole)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl font-bold bg-[#F7F2EA] focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        >
                          <option value="RECEIVE">RECEIVE (พนักงานชั่ง/ตรวจรับสด)</option>
                          <option value="LPS">LPS (DC S&LP ป้องกันการสูญหาย)</option>
                          <option value="OTM">OTM (ผู้จัดการทีมปฏิบัติการ)</option>
                          <option value="SUPERVISOR">SUPERVISOR (หัวหน้างาน)</option>
                          <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                        </select>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddUserModal(false)}
                          className="flex-1 py-2.5 border border-[#E8E1D8] rounded-xl font-bold text-[#6E6E6E]"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-[#12803C] hover:bg-[#0B5E2B] text-white rounded-xl font-bold"
                        >
                          บันทึกพนักงาน
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── TAB 2: ITEM MASTER (ฐานข้อมูลชื่อเต็มสินค้า) ────── */}
        {activeTab === 'ITEM_MASTER' && (
          <div className="space-y-3.5 text-xs">
            {/* Notice & Stats Card */}
            <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#E8E1D8] shadow-xs space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl">
                <div>
                  <span className="text-[11px] text-[#0B5E2B] font-bold block">จำนวนสินค้าในฐานข้อมูล:</span>
                  <span className="text-2xl font-black text-[#12803C]">{masterCount.toLocaleString()}</span>
                  <span className="text-xs text-[#0B5E2B] font-medium ml-1.5">รายการ (Active SKUs)</span>
                </div>
                <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center border border-[#AEE0BD] shadow-xs">
                  <Database className="w-6 h-6 text-[#12803C]" />
                </div>
              </div>

              <div className="p-3 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] text-[11px] text-[#6E6E6E] space-y-1">
                <p>💡 <b>ระบบชื่อเต็มสินค้า:</b> เชื่อมโยง Item_id เพื่อแก้ปัญหาชื่อสินค้าถูกตัดจากใบนัดหมาย List All</p>
                <p>💡 <b>อัปเดตอัตโนมัติ:</b> เมื่อนำเข้าไฟล์ Item Master ใหม่ รายการเดิมจะได้รับการปรับปรุงชื่อ และรายการใหม่จะถูกสะสมเข้าสู่ระบบถาวร</p>
              </div>

              {/* Upload Zone */}
              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1.5 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-[#12803C]" />
                  อัปโหลดไฟล์ Item Master (.xlsx):
                </label>

                <div
                  onClick={() => itemMasterFileInputRef.current?.click()}
                  className="p-5 border-2 border-dashed border-[#E8E1D8] hover:border-[#12803C] bg-[#F7F2EA] rounded-3xl text-center cursor-pointer transition-all"
                >
                  <input
                    ref={itemMasterFileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => e.target.files && e.target.files[0] && handleMasterFileChange(e.target.files[0])}
                    className="hidden"
                  />

                  <div className="w-10 h-10 rounded-2xl bg-white border border-[#E8E1D8] flex items-center justify-center mx-auto mb-2 shadow-xs">
                    <FileSpreadsheet className="w-5 h-5 text-[#12803C]" />
                  </div>

                  {masterFile ? (
                    <div>
                      <span className="font-black text-xs text-[#12803C] block">{masterFile.name}</span>
                      <span className="text-[11px] text-[#6E6E6E]">
                        {(masterFile.size / 1024).toFixed(1)} KB · แตะเพื่อเปลี่ยนไฟล์
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="font-bold text-xs text-[#1F1F1F] block">
                        แตะเพื่อเลือกไฟล์ Item Master (.xlsx)
                      </span>
                      <span className="text-[11px] text-[#6E6E6E]">
                        คอลัมน์ Item_id และ Description จะถูกอัปเดตและซิงค์ทันที
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {masterError && (
                <div className="p-3.5 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl text-xs text-[#E03131] flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{masterError}</span>
                </div>
              )}

              {/* Upload Button */}
              <button
                type="button"
                onClick={handleMasterImport}
                disabled={isMasterImporting || !masterFile}
                className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isMasterImporting ? 'animate-spin' : ''}`} />
                {isMasterImporting ? 'กำลังบันทึกและปรับปรุงฐานข้อมูล...' : 'อัปเดต Item Master และซิงค์ชื่อในระบบ'}
              </button>

              {/* Master Result Banner */}
              {masterResult && (
                <div className="p-3.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl space-y-1.5 animate-fadeIn">
                  <div className="flex items-center gap-1.5 text-[#0B5E2B] font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#12803C]" />
                    <span>อัปเดต Item Master สำเร็จเรียบร้อย!</span>
                  </div>
                  <p className="text-[11px] text-[#0B5E2B]">
                    บันทึกข้อมูลสินค้าสำเร็จ <b>{masterResult.addedOrUpdated.toLocaleString()}</b> รายการ 
                    (อัปเดตชื่อในกลุ่มที่กำลังชั่งแล้ว <b>{masterResult.updatedSamplingGroups}</b> รายการ)
                  </p>
                </div>
              )}
            </div>

            {/* Quick Search & Live Lookup */}
            <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#E8E1D8] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F1F1F] flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-[#12803C]" />
                  ค้นหาตรวจสอบชื่อสินค้า (Live Lookup):
                </span>
                <span className="text-[10px] text-[#6E6E6E]">
                  {masterSearchQuery ? `พบ ${masterSearchResults.length} รายการ` : 'แสดงรายการล่าสุด'}
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#999] absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="พิมพ์ Item ID (เช่น 165876837) หรือชื่อสินค้า..."
                  value={masterSearchQuery}
                  onChange={(e) => setMasterSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-2xl text-xs font-medium text-[#1F1F1F] focus:outline-none focus:border-[#12803C]"
                />
              </div>

              {/* Results List */}
              <div className="space-y-1.5 pt-1 max-h-[420px] overflow-y-auto no-scrollbar">
                {masterSearchResults.map((item) => (
                  <div key={item.itemId} className="p-3 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#12803C] text-xs">ID: {item.itemId}</span>
                      {item.standardWeightKg ? (
                        <span className="text-[10px] bg-[#EAF7ED] text-[#0B5E2B] font-bold px-2 py-0.5 rounded-md border border-[#AEE0BD]">
                          สแตนดาร์ด {item.standardWeightKg} kg
                        </span>
                      ) : null}
                    </div>
                    <p className="font-bold text-[#1F1F1F] text-xs leading-snug">
                      {item.description}
                    </p>
                  </div>
                ))}

                {masterSearchResults.length === 0 && (
                  <div className="text-center py-6 text-xs text-[#999]">
                    {masterSearchQuery ? 'ไม่พบสินค้าที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลสินค้าใน Item Master'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: FOCUS MASTER (EXCEL UPLOAD & MANAGEMENT) ── */}
        {activeTab === 'FOCUS' && (() => {
          const filteredFocusItems = focusMasterItems.filter(item => {
            if (!focusSearch.trim()) return true;
            const q = focusSearch.toLowerCase();
            return (
              item.itemId.toLowerCase().includes(q) ||
              (item.description && item.description.toLowerCase().includes(q)) ||
              (item.status && item.status.toLowerCase().includes(q))
            );
          });

          const handleFocusExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
              setIsUploadingFocus(true);
              setFocusUploadMsg(null);

              const buffer = await file.arrayBuffer();
              const wb = XLSX.read(buffer, { type: 'array' });
              const firstSheetName = wb.SheetNames[0];
              const sheet = wb.Sheets[firstSheetName];
              const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

              if (!rows || rows.length === 0) {
                setFocusUploadMsg({ type: 'error', text: 'ไม่พบข้อมูลในไฟล์ Excel ที่เลือก' });
                return;
              }

              const now = new Date().toISOString();
              const parsedItems: FocusMasterItem[] = [];

              for (const row of rows) {
                const keys = Object.keys(row);
                const itemKey = keys.find(k => /item.*id|dc.*item|item.*nbr|รหัสสินค้า/i.test(k));
                const descKey = keys.find(k => /item.*desc|desc|ชื่อสินค้า|รายละเอียด/i.test(k));
                const statusKey = keys.find(k => /status|สถานะ/i.test(k));
                const poKey = keys.find(k => /po.*nbr|po.*number|^po$/i.test(k));

                const rawItemId = itemKey ? String(row[itemKey]).trim() : '';
                if (!rawItemId || rawItemId === 'undefined') continue;

                parsedItems.push({
                  id: uuidv4(),
                  itemId: rawItemId,
                  description: descKey && row[descKey] ? String(row[descKey]).trim() : undefined,
                  status: statusKey && row[statusKey] ? String(row[statusKey]).trim() : 'Check 992',
                  poNbr: poKey && row[poKey] ? String(row[poKey]).trim() : undefined,
                  isActive: true,
                  uploadedAt: now,
                  approvedBy: currentUser?.fullName || 'Admin',
                });
              }

              if (parsedItems.length === 0) {
                setFocusUploadMsg({
                  type: 'error',
                  text: 'ไม่พบคอลัมน์รหัสสินค้า กรุณาใช้หัวคอลัมน์ "DC Item 992" หรือ "Item ID"'
                });
                return;
              }

              // Replace Focus Master with newly uploaded Excel list
              await db.focusMaster.clear();
              await db.focusMaster.bulkAdd(parsedItems);

              // Auto-sync all sampling groups
              const syncedCount = await syncSamplingGroupsWithFocusMaster();

              setFocusUploadMsg({
                type: 'success',
                text: `✅ อัปเดต Focus Master สำเร็จ ${parsedItems.length} รายการ (ปรับปรุงสถานะ SKU หน้างานแล้ว ${syncedCount} รายการ)`
              });

              if (fileInputRef.current) fileInputRef.current.value = '';
            } catch (err: any) {
              console.error(err);
              setFocusUploadMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${err.message || 'อ่านไฟล์ไม่สำเร็จ'}` });
            } finally {
              setIsUploadingFocus(false);
            }
          };

          const handleDownloadTemplate = () => {
            const templateData = [
              { 'No.': 1, 'DC Item 992': '163989158', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'คางปลาหมึกยักษ์' },
              { 'No.': 2, 'DC Item 992': '169229461', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP20_หางปลาหมึกยักษ์ กก.ละ' },
              { 'No.': 3, 'DC Item 992': '169484704', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP15_แก้วมังกร กก.ละ' },
              { 'No.': 4, 'DC Item 992': '169187250', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'ปีกปลาหมึกยักษ์' },
              { 'No.': 5, 'DC Item 992': '163114744', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP20_หนวดปลาหมึกยักษ์ กก. ละ' },
              { 'No.': 6, 'DC Item 992': '164413354', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP15_ส้มสายน้ำผึ้ง กก.ละ' },
              { 'No.': 7, 'DC Item 992': '170007636', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP9_ส้มแมนดาริน สายพันธุ์ไต้หวัน กก.ละ' },
              { 'No.': 8, 'DC Item 992': '164656437', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP10_สันนอกหมูกก.ละ' },
              { 'No.': 9, 'DC Item 992': '170029420', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP4_สันนอกหมูสไลด์ กก. ละ' },
              { 'No.': 10, 'DC Item 992': '150811983', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP12_อกไก่แช่แข็ง กก.ละ' },
              { 'No.': 11, 'DC Item 992': '169088177', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP15_ลำไยอีด้อ กก.ละ' },
              { 'No.': 12, 'DC Item 992': '169045516', 'Status': 'Check 992', 'ITEM_DESCRIPTION': 'SP8_สันคอหมูกก.ละ' },
            ];
            const ws = XLSX.utils.json_to_sheet(templateData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Focus_Master');
            XLSX.writeFile(wb, 'SMART_DC_Focus_Item_Template.xlsx');
          };

          const handleDeleteFocusItem = async (id: string) => {
            if (confirm('คุณต้องการลบรายการสินค้านี้ออกจาก Focus Master หรือไม่?')) {
              await db.focusMaster.delete(id);
              await syncSamplingGroupsWithFocusMaster();
            }
          };

          const handleClearAll = async () => {
            if (confirm('⚠️ ต้องการล้างข้อมูล Focus Master ทั้งหมดใช่หรือไม่?')) {
              await db.focusMaster.clear();
              await syncSamplingGroupsWithFocusMaster();
            }
          };

          const handleAddSingleItem = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!newItemId.trim()) return;

            await db.focusMaster.add({
              id: uuidv4(),
              itemId: newItemId.trim(),
              description: newItemDesc.trim() || undefined,
              status: newItemStatus.trim() || 'Check 992',
              isActive: true,
              uploadedAt: new Date().toISOString(),
              approvedBy: currentUser?.fullName || 'Admin',
            });

            await syncSamplingGroupsWithFocusMaster();
            setNewItemId('');
            setNewItemDesc('');
            setShowAddModal(false);
          };

          return (
            <div className="space-y-3">
              {/* Header Card */}
              <div className="bg-[#FFFDF9] p-4 rounded-3xl border border-[#E8E1D8] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#12803C]" />
                      Focus Item Master (จัดการสินค้าโฟกัส)
                    </h3>
                    <p className="text-[11px] text-[#6E6E6E] mt-0.5">
                      โยนไฟล์ Excel เพื่ออัปเดตรายการสินค้าโฟกัสได้ทันที โดยไม่ต้องแก้ไขโค้ด
                    </p>
                  </div>
                  <span className="bg-[#EAF7ED] text-[#12803C] font-black text-xs px-2.5 py-1 rounded-full border border-[#AEE0BD]">
                    {focusMasterItems.length} รายการ
                  </span>
                </div>

                {/* Upload Action Box */}
                <div className="p-3.5 bg-[#F7F2EA] border-2 border-dashed border-[#12803C]/40 rounded-2xl text-center space-y-2.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFocusExcelUpload}
                    className="hidden"
                    id="focus-excel-file-input"
                  />
                  <div className="flex flex-col items-center justify-center">
                    <FileSpreadsheet className="w-8 h-8 text-[#12803C] mb-1" />
                    <span className="text-xs font-bold text-[#1F1F1F]">
                      อัปโหลดไฟล์รายการสินค้า Focus (.xlsx)
                    </span>
                    <span className="text-[10px] text-[#6E6E6E] mt-0.5">
                      รองรับหัวคอลัมน์: <b>DC Item 992</b>, <b>Status</b>, <b>ITEM_DESCRIPTION</b>
                    </span>
                  </div>

                  <div className="flex gap-2 justify-center pt-1">
                    <label
                      htmlFor="focus-excel-file-input"
                      className={`btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm ${
                        isUploadingFocus ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {isUploadingFocus ? 'กำลังประมวลผล...' : 'เลือกไฟล์ Excel โฟกัส'}
                    </label>

                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="bg-white border border-[#E8E1D8] text-[#1F1F1F] hover:bg-[#F7F2EA] py-2 px-3 text-xs font-bold rounded-2xl flex items-center gap-1.5 transition-all shadow-xs"
                      title="ดาวน์โหลดไฟล์ Template ต้นแบบ"
                    >
                      <Download className="w-3.5 h-3.5 text-[#12803C]" />
                      โหลด Template
                    </button>
                  </div>
                </div>

                {/* Feedback Toast */}
                {focusUploadMsg && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                      focusUploadMsg.type === 'success'
                        ? 'bg-[#EAF7ED] text-[#0B5E2B] border border-[#AEE0BD]'
                        : 'bg-[#FDE8E8] text-[#C92A2A] border border-[#F8B4B4]'
                    }`}
                  >
                    <span>{focusUploadMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setFocusUploadMsg(null)}
                      className="p-1 hover:opacity-75"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Toolbar & Search */}
              <div className="bg-[#FFFDF9] p-3 rounded-2xl border border-[#E8E1D8] space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#6E6E6E] absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า..."
                      value={focusSearch}
                      onChange={(e) => setFocusSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="bg-[#12803C] text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs hover:bg-[#0B5E2B] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มสินค้า
                  </button>

                  {focusMasterItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[#E03131] hover:bg-[#FDE8E8] px-2.5 py-2 rounded-xl text-xs font-bold border border-[#E8E1D8] transition-all"
                      title="ล้างข้อมูลทั้งหมด"
                    >
                      ล้าง
                    </button>
                  )}
                </div>

                {/* Table of Focus Items */}
                <div className="overflow-x-auto rounded-xl border border-[#E8E1D8]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F7F2EA] text-[#6E6E6E] font-bold border-b border-[#E8E1D8]">
                      <tr>
                        <th className="p-2.5 text-center w-10">No.</th>
                        <th className="p-2.5">DC Item 992</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">ITEM_DESCRIPTION</th>
                        <th className="p-2.5 text-center w-12">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E1D8]">
                      {filteredFocusItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-[#6E6E6E] text-xs">
                            {focusSearch ? 'ไม่พบสินค้าที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการสินค้า Focus ในระบบ (กดเลือกไฟล์ Excel เพื่ออัปโหลด)'}
                          </td>
                        </tr>
                      ) : (
                        filteredFocusItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-[#F7F2EA]/50 transition-colors">
                            <td className="p-2.5 text-center font-bold text-[#6E6E6E]">{idx + 1}</td>
                            <td className="p-2.5 font-mono font-black text-[#12803C] whitespace-nowrap">
                              {item.itemId}
                            </td>
                            <td className="p-2.5">
                              <span className="bg-[#FEF9E7] text-[#9A7D0A] font-bold text-[10px] px-2 py-0.5 rounded-full border border-[#FAD7A0] whitespace-nowrap">
                                {item.status || 'Check 992'}
                              </span>
                            </td>
                            <td className="p-2.5 text-[#1F1F1F] font-medium leading-tight">
                              {item.description || '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteFocusItem(item.id)}
                                className="text-[#6E6E6E] hover:text-[#E03131] p-1 transition-colors"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-[10px] text-[#6E6E6E] pt-1">
                  💡 เมื่อสินค้าในใบงานตรงกับ DC Item 992 ข้างต้น ระบบจะกำหนดสถานะเป็น <b>FOCUS</b> และเพิ่มขั้นตอนลายเซ็น <b>DC S&LP Supervisor</b> อัตโนมัติ
                </p>
              </div>

              {/* Add Single Item Modal */}
              {showAddModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-xl border border-[#E8E1D8]">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
                        <Plus className="w-4 h-4 text-[#12803C]" />
                        เพิ่มสินค้า Focus ทีละรายการ
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="text-[#6E6E6E] hover:text-[#1F1F1F]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddSingleItem} className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          รหัสสินค้า (DC Item 992) <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="เช่น 163989158"
                          value={newItemId}
                          onChange={(e) => setNewItemId(e.target.value)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          ชื่อสินค้า (ITEM_DESCRIPTION):
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น คางปลาหมึกยักษ์"
                          value={newItemDesc}
                          onChange={(e) => setNewItemDesc(e.target.value)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          สถานะ (Status):
                        </label>
                        <input
                          type="text"
                          value={newItemStatus}
                          onChange={(e) => setNewItemStatus(e.target.value)}
                          className="w-full p-2.5 border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddModal(false)}
                          className="flex-1 py-2.5 border border-[#E8E1D8] rounded-xl font-bold text-[#6E6E6E]"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-[#12803C] hover:bg-[#0B5E2B] text-white rounded-xl font-bold"
                        >
                          บันทึก
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── TAB 4: BASKET MASTER (จัดการขนาดตะกร้า) ──────────────── */}
        {activeTab === 'BASKET' && (() => {
          const filteredBaskets = uniqueBaskets.filter(b => {
            if (!basketSearch.trim()) return true;
            const term = basketSearch.toLowerCase();
            return b.code.toLowerCase().includes(term) || b.name.toLowerCase().includes(term);
          });

          return (
            <div className="space-y-3 text-xs">
              {/* Notice Card */}
              <div className="bg-[#FFFDF9] p-4 rounded-3xl border border-[#E8E1D8] space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#EAF7ED] flex items-center justify-center text-[#12803C]">
                      <ShoppingBasket className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <span className="font-black text-[#1F1F1F] text-sm block">
                        ตารางขนาดตะกร้ามาตรฐาน (Basket Master)
                      </span>
                      <span className="text-[11px] text-[#6E6E6E]">
                        ค่าน้ำหนักหักภาชนะ (Tare Weight) ใช้หักลบในการสุ่มชั่งสุทธิ
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddBasketModal(true)}
                    className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มตะกร้า
                  </button>
                </div>
                <div className="bg-[#F7F2EA] p-2.5 rounded-xl text-[11px] text-[#6E6E6E] border border-[#E8E1D8]">
                  💡 <b>หมายเหตุ:</b> การแก้ไขน้ำหนักภาชนะจะมีผลกับใบงานหรือรอบการชั่งใหม่ทันที โดยไม่มีผลย้อนหลังกับตัวอย่างที่เคยบันทึกปิดงานเสร็จสิ้นไปแล้ว
                </div>

                {basketUploadMsg && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                      basketUploadMsg.type === 'success'
                        ? 'bg-[#EAF7ED] text-[#0B5E2B] border border-[#AEE0BD]'
                        : 'bg-[#FDE8E8] text-[#C92A2A] border border-[#F8B4B4]'
                    }`}
                  >
                    <span>{basketUploadMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setBasketUploadMsg(null)}
                      className="p-1 hover:opacity-75"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Search Toolbar */}
              <div className="bg-[#FFFDF9] p-3 rounded-2xl border border-[#E8E1D8] space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#6E6E6E] absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="ค้นหารหัสตะกร้า (เช่น W, X, Carton) หรือชื่อเรียก..."
                    value={basketSearch}
                    onChange={(e) => setBasketSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#12803C]"
                  />
                </div>

                {/* Basket List Cards */}
                <div className="space-y-2 pt-1">
                  {filteredBaskets.length === 0 ? (
                    <div className="p-6 text-center text-[#6E6E6E] text-xs">
                      {basketSearch ? 'ไม่พบขนาดตะกร้าที่ตรงกับคำค้นหา' : 'ยังไม่มีข้อมูลขนาดตะกร้าในระบบ'}
                    </div>
                  ) : (
                    filteredBaskets.map((b) => (
                      <div
                        key={b.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          b.isActive
                            ? 'bg-white border-[#E8E1D8] shadow-xs'
                            : 'bg-[#F7F2EA]/60 border-[#E8E1D8] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black font-mono text-base shrink-0 border ${
                            b.isActive
                              ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}>
                            {b.code}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#1F1F1F] text-xs sm:text-sm truncate">
                                {b.name}
                              </span>
                              {!b.isActive && (
                                <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold">
                                  ปิดใช้งาน
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#6E6E6E] mt-0.5 flex items-center gap-1.5">
                              <span>น้ำหนักหัก Tare:</span>
                              <span className="font-mono font-black text-[#12803C] text-sm">
                                {b.tareWeightKg.toFixed(2)} kg
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditBasket(b)}
                            className="p-2 text-[#6E6E6E] hover:text-[#12803C] hover:bg-[#EAF7ED] rounded-xl transition-all cursor-pointer"
                            title="แก้ไขน้ำหนักหัก"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleBasketActive(b)}
                            className={`text-xs px-2.5 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                              b.isActive
                                ? 'bg-[#FFFDF9] text-[#6E6E6E] hover:text-[#C92A2A] border-[#E8E1D8]'
                                : 'bg-[#EAF7ED] text-[#0B5E2B] border-[#AEE0BD]'
                            }`}
                          >
                            {b.isActive ? 'ปิด' : 'เปิด'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal เพิ่มตะกร้าใหม่ */}
              {showAddBasketModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
                  <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border border-[#E8E1D8]">
                    <div className="flex justify-between items-center border-b border-[#E8E1D8] pb-3">
                      <div className="flex items-center gap-2">
                        <ShoppingBasket className="w-5 h-5 text-[#12803C]" />
                        <h4 className="font-black text-sm text-[#1F1F1F]">เพิ่มขนาดตะกร้า/กล่องใหม่</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddBasketModal(false)}
                        className="p-1 text-[#6E6E6E] hover:text-[#1F1F1F] rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddBasket} className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          รหัสตะกร้า / ภาชนะ (Code) <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น W, M, Carton, กล่อง"
                          value={newBasketCode}
                          onChange={(e) => setNewBasketCode(e.target.value)}
                          className="w-full p-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl font-mono font-bold focus:outline-none focus:border-[#12803C]"
                          required
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          น้ำหนักหักภาชนะ Tare Weight (kg) <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="เช่น 0.85"
                          value={newBasketTare}
                          onKeyDown={(e) => {
                            if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val.includes('-')) val = val.replace(/-/g, '');
                            setNewBasketTare(val);
                          }}
                          className="w-full p-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl font-mono font-bold focus:outline-none focus:border-[#12803C]"
                          required
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">ชื่อเรียก / คำอธิบาย:</label>
                        <input
                          type="text"
                          placeholder="เช่น ตะกร้าเขียวมาตรฐาน W"
                          value={newBasketName}
                          onChange={(e) => setNewBasketName(e.target.value)}
                          className="w-full p-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl focus:outline-none focus:border-[#12803C]"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddBasketModal(false)}
                          className="flex-1 py-2.5 border border-[#E8E1D8] rounded-xl font-bold text-[#6E6E6E]"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-[#12803C] hover:bg-[#0B5E2B] text-white rounded-xl font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Check className="w-4 h-4" /> บันทึกตะกร้า
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Modal แก้ไขตะกร้า */}
              {editingBasket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
                  <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border border-[#E8E1D8]">
                    <div className="flex justify-between items-center border-b border-[#E8E1D8] pb-3">
                      <div className="flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-[#12803C]" />
                        <h4 className="font-black text-sm text-[#1F1F1F]">
                          แก้ไขภาชนะ Tray <span className="font-mono text-[#12803C]">{editingBasket.code}</span>
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingBasket(null)}
                        className="p-1 text-[#6E6E6E] hover:text-[#1F1F1F] rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveEditBasket} className="space-y-3 text-xs">
                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">ชื่อเรียก / คำอธิบาย:</label>
                        <input
                          type="text"
                          value={editBasketName}
                          onChange={(e) => setEditBasketName(e.target.value)}
                          className="w-full p-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl focus:outline-none focus:border-[#12803C]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1F1F1F] block mb-1">
                          น้ำหนักหักภาชนะ Tare Weight (kg) <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editBasketTare}
                          onKeyDown={(e) => {
                            if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val.includes('-')) val = val.replace(/-/g, '');
                            setEditBasketTare(val);
                          }}
                          className="w-full p-2.5 bg-[#F7F2EA] border border-[#12803C] rounded-xl font-mono font-black text-sm text-[#12803C] focus:outline-none"
                          required
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingBasket(null)}
                          className="flex-1 py-2.5 border border-[#E8E1D8] rounded-xl font-bold text-[#6E6E6E]"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-[#12803C] hover:bg-[#0B5E2B] text-white rounded-xl font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Check className="w-4 h-4" /> บันทึกการแก้ไข
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}
