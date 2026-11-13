// ============================================================
// SMART DC — Login Page (V3.0 Modern Minimal)
// Theme: Modern Green (#12803C), Warm Cream (#F7F2EA), Pure White
// 1. Employee ID + 6-digit PIN Login (Default View)
// 2. Single Onboarding Pathway ("สำหรับพนักงาน SRRDC ที่เข้าใช้งานครั้งแรก")
// 3. Forgot PIN Recovery ("ลืม PIN?")
// 4. Discreet Admin Access via ⓘ Icon (Google Account + Allowlist)
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Scale, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  UserCheck, 
  ArrowLeft,
  Info,
  QrCode,
  X,
  Copy,
  Lock,
  Clock,
  User,
  Sparkles,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import authorizedRoster from '../lib/authorizedRoster.json';
import { db } from '../lib/database';
import { lookupServerUser } from '../lib/syncEngine';
import type { User as AppUser } from '../types';

type FormMode = 'LOGIN' | 'ONBOARDING' | 'FORGOT_PIN';

interface RecentLoginItem {
  empId: string;
  fullName: string;
  department?: string;
  role?: string;
  lastUsed: number;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { 
    loginWithPin, 
    loginWithGoogle, 
    setOnboardingPin, 
    resetForgottenPin 
  } = useAuthStore();

  const [mode, setMode] = useState<FormMode>('LOGIN');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Form states - Login
  const [empId, setEmpId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [recentLogins, setRecentLogins] = useState<RecentLoginItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form states - Onboarding (Single Pathway)
  const [onboardEmpId, setOnboardEmpId] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [onboardPin, setOnboardPin] = useState('');
  const [onboardConfirmPin, setOnboardConfirmPin] = useState('');

  // Form states - Forgot PIN
  const [forgotEmpId, setForgotEmpId] = useState('');
  const [forgotNameVerify, setForgotNameVerify] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');

  // Form states - Discreet Admin Login (Google Account)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Helper to format Employee ID: A-Z and 0-9, auto uppercase, no spaces
  const cleanIdInput = (val: string) => {
    return val.toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  // Helper while typing in search/input: strip whitespace
  const cleanSearchOrIdInput = (val: string) => {
    return val.replace(/\s+/g, '');
  };

  // Load recent logins from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('smart-dc-recent-emp-ids');
      if (raw) {
        setRecentLogins(JSON.parse(raw));
      }
    } catch (e) {
      console.error('Failed to load recent logins', e);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save successful login to recent list
  const recordRecentLogin = (id: string, name?: string, dept?: string, r?: string) => {
    try {
      const currentRoster = authorizedRoster.find(item => item.empId.trim().toUpperCase() === id.toUpperCase());
      const nameToSave = name || currentRoster?.fullName || (id === 'ADMIN01' ? 'ผู้ดูแลระบบ (Admin)' : id);
      const raw = localStorage.getItem('smart-dc-recent-emp-ids');
      const list: RecentLoginItem[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(item => item.empId.toUpperCase() !== id.toUpperCase());
      const updated: RecentLoginItem[] = [
        {
          empId: id.toUpperCase(),
          fullName: nameToSave,
          department: dept || currentRoster?.department || '',
          role: r || currentRoster?.role || '',
          lastUsed: Date.now()
        },
        ...filtered
      ].slice(0, 8);
      setRecentLogins(updated);
      localStorage.setItem('smart-dc-recent-emp-ids', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save recent login', e);
    }
  };

  const removeRecentLogin = (e: React.MouseEvent, targetEmpId: string) => {
    e.stopPropagation();
    try {
      const updated = recentLogins.filter(item => item.empId.toUpperCase() !== targetEmpId.toUpperCase());
      setRecentLogins(updated);
      localStorage.setItem('smart-dc-recent-emp-ids', JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
  };

  // Compute live predictions / suggestions from Recent Logins + Authorized Roster + Admin
  const suggestions = useMemo(() => {
    const q = empId.trim();
    if (!q) return [];
    const upperQ = q.toUpperCase();
    const lowerQ = q.toLowerCase();

    const results: Array<RecentLoginItem & { isRecent?: boolean }> = [];
    const seen = new Set<string>();

    // 1. Matched recent logins
    for (const item of recentLogins) {
      const matchId = item.empId.toUpperCase().includes(upperQ);
      const matchName = item.fullName.toLowerCase().includes(lowerQ);
      if ((matchId || matchName) && !seen.has(item.empId.toUpperCase())) {
        seen.add(item.empId.toUpperCase());
        results.push({ ...item, isRecent: true });
      }
    }

    // 2. Admin account
    if (
      ('ADMIN01'.includes(upperQ) || 'ผู้ดูแลระบบ'.includes(lowerQ) || 'admin'.includes(lowerQ)) &&
      !seen.has('ADMIN01')
    ) {
      seen.add('ADMIN01');
      results.push({
        empId: 'ADMIN01',
        fullName: 'ผู้ดูแลระบบ (System Admin)',
        department: 'IT / Operations',
        role: 'SUPERVISOR',
        lastUsed: 0,
        isRecent: false
      });
    }

    // 3. Authorized roster (33 official employees)
    for (const r of authorizedRoster) {
      const rId = r.empId.trim().toUpperCase();
      const matchId = rId.includes(upperQ);
      const matchName = r.fullName.toLowerCase().includes(lowerQ);
      if ((matchId || matchName) && !seen.has(rId)) {
        seen.add(rId);
        results.push({
          empId: rId,
          fullName: r.fullName,
          department: r.department,
          role: r.role,
          lastUsed: 0,
          isRecent: false
        });
      }
    }

    return results.slice(0, 6);
  }, [empId, recentLogins]);

  const handleSelectSuggestion = (item: { empId: string }) => {
    setEmpId(item.empId);
    setShowSuggestions(false);
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 60);
  };

  // Real-time roster matching (background check)
  const onboardMatchedRoster = onboardEmpId.trim()
    ? authorizedRoster.find(r => r.empId.trim().toUpperCase() === onboardEmpId.trim())
    : null;

  const forgotMatchedRoster = forgotEmpId.trim()
    ? authorizedRoster.find(r => r.empId.trim().toUpperCase() === forgotEmpId.trim())
    : null;

  // Live user matching for Login mode (checks roster, local Dexie, and Supabase Cloud)
  const [liveLoginUser, setLiveLoginUser] = useState<AppUser | { fullName: string; isPinSet: boolean } | null>(null);

  useEffect(() => {
    const cleanId = cleanIdInput(empId);
    if (!cleanId || cleanId.length < 3) {
      setLiveLoginUser(null);
      return;
    }

    let isMounted = true;

    // Quick check roster
    const rosterItem = authorizedRoster.find(r => r.empId.trim().toUpperCase() === cleanId);
    if (rosterItem) {
      setLiveLoginUser({ fullName: rosterItem.fullName, isPinSet: false });
    }

    // Debounced check in local DB & Supabase Cloud
    const timer = setTimeout(async () => {
      try {
        const local = await db.users.where('empId').equalsIgnoreCase(cleanId).first();
        if (local && isMounted) {
          setLiveLoginUser(local);
          return;
        }
        const serverUser = await lookupServerUser(cleanId);
        if (serverUser && isMounted) {
          setLiveLoginUser(serverUser);
        }
      } catch (err) {
        // silent
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [empId]);

  // Live check if user in Onboarding mode already has a PIN in Supabase Cloud or locally
  const [onboardExistingUser, setOnboardExistingUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const cleanId = cleanIdInput(onboardEmpId);
    if (!cleanId || cleanId.length < 3) {
      setOnboardExistingUser(null);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const local = await db.users.where('empId').equalsIgnoreCase(cleanId).first();
        if (local && local.isPinSet && isMounted) {
          setOnboardExistingUser(local);
          return;
        }
        const serverUser = await lookupServerUser(cleanId);
        if (serverUser && serverUser.isPinSet && isMounted) {
          setOnboardExistingUser(serverUser);
        } else if (isMounted) {
          setOnboardExistingUser(null);
        }
      } catch (err) {
        // silent
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [onboardEmpId]);

  const resetAllMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const handleSwitchMode = (newMode: FormMode) => {
    resetAllMessages();
    setMode(newMode);
  };

  const navigateAfterLogin = () => {
    navigate('/dashboard');
  };

  // 1. Employee Login
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = cleanIdInput(empId);
    if (!cleanId || !pin.trim()) {
      setError('กรุณากรอก User พนักงาน และรหัส PIN 6 หลัก');
      return;
    }
    setLoading(true);
    resetAllMessages();
    try {
      const res = await loginWithPin(cleanId, pin.trim());
      if (res.success) {
        recordRecentLogin(cleanId);
        navigateAfterLogin();
      } else {
        setError(res.message || 'User พนักงาน หรือรหัส PIN ไม่ถูกต้อง');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  // 2. Single Onboarding Pathway ("สำหรับพนักงาน SRRDC ที่เข้าใช้งานครั้งแรก")
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllMessages();
    const cleanId = cleanIdInput(onboardEmpId);

    if (!cleanId) {
      setError('กรุณากรอก User พนักงาน');
      return;
    }

    // If not found in Master, require name
    if (!onboardMatchedRoster && !onboardName.trim()) {
      setError('ไม่พบ User ในฐานข้อมูลทำเนียบ กรุณาระบุชื่อ-นามสกุลเพื่อยื่นลงทะเบียน');
      return;
    }

    if (onboardPin.length !== 6 || !/^\d{6}$/.test(onboardPin)) {
      setError('รหัส PIN ต้องเป็นตัวเลข 6 หลัก');
      return;
    }
    if (onboardPin !== onboardConfirmPin) {
      setError('รหัส PIN และยืนยันรหัส PIN ไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      const res = await setOnboardingPin(cleanId, onboardPin.trim(), onboardName.trim() || undefined);
      if (res.success) {
        recordRecentLogin(cleanId, onboardName.trim() || undefined);
        setSuccessMessage(res.message || 'บันทึกรหัส PIN สำเร็จแล้ว กำลังเข้าสู่ระบบ...');
        setTimeout(() => {
          navigateAfterLogin();
        }, 1100);
      } else {
        setError(res.message || 'ไม่สามารถลงทะเบียนตั้งรหัส PIN ได้');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setLoading(false);
    }
  };

  // 3. Reset Forgotten PIN
  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllMessages();
    const cleanId = cleanIdInput(forgotEmpId);

    if (!cleanId) {
      setError('กรุณากรอก User พนักงาน');
      return;
    }
    if (forgotNewPin.length !== 6 || !/^\d{6}$/.test(forgotNewPin)) {
      setError('รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลัก');
      return;
    }
    if (forgotNewPin !== forgotConfirmPin) {
      setError('รหัส PIN ใหม่ และยืนยันรหัส PIN ไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      const res = await resetForgottenPin(cleanId, forgotNewPin.trim(), forgotNameVerify.trim() || undefined);
      if (res.success) {
        recordRecentLogin(cleanId);
        setSuccessMessage(res.message || 'กู้คืนรหัส PIN สำเร็จแล้ว กำลังเข้าสู่ระบบ...');
        setTimeout(() => {
          navigateAfterLogin();
        }, 1100);
      } else {
        setError(res.message || 'ไม่สามารถกู้คืนรหัส PIN ได้');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการกู้คืนรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };

  // 4. Discreet Admin Login (Google Authentication)
  const handleAdminGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllMessages();

    if (!adminEmail.trim()) {
      setError('กรุณากรอกบัญชี Google');
      return;
    }
    if (!adminPassword.trim()) {
      setError('กรุณากรอกรหัสผ่านความปลอดภัย');
      return;
    }

    setLoading(true);
    try {
      const res = await loginWithGoogle(adminEmail.trim(), adminPassword.trim());
      if (res.success) {
        setShowAdminModal(false);
        navigate('/dashboard');
      } else {
        setError(res.message || 'การตรวจสอบสิทธิ์ไม่สำเร็จ');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F2EA] flex flex-col justify-center items-center p-4 relative text-[#1F1F1F]">
      
      {/* ─── MAIN CARD CONTAINER ─────────────────────────────────── */}
      <div className="w-full max-w-[420px] bg-[#FFFDF9] rounded-3xl shadow-xl overflow-hidden border-2 border-[#E8E1D8]">
        
        {/* BRAND HERO BANNER WITH CRISP LOTUS FRESH IMAGE */}
        <div className="relative w-full h-52 sm:h-56 overflow-hidden bg-slate-900 border-b-2 border-[#E8E1D8]">
          <img 
            src="/images/lotus-fresh-hero.jpg" 
            alt="Lotus's Fresh Weighing Scale" 
            className="w-full h-full object-cover object-center"
          />
          {/* Subtle bottom gradient scrim so text is readable while photo remains 100% crisp */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

          {/* System Title on bottom */}
          <div className="absolute bottom-3.5 left-4 right-4 z-10 text-white">
            <div className="flex items-center gap-2 mb-1">
              <img 
                src="/images/lotus-logo-white.svg" 
                alt="Lotus's" 
                className="h-5.5 w-auto drop-shadow-md"
              />
              <span className="text-white/70 text-xs font-light">|</span>
              <span className="text-white text-xs font-black tracking-widest uppercase bg-[#FFD100]/25 border border-[#FFD100]/40 px-2 py-0.5 rounded text-[#FFD100] drop-shadow">
                SMART DC
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide drop-shadow-md text-white">
              ระบบสุ่มชั่งน้ำหนักสินค้าสด
            </h1>
            <p className="text-white/90 text-xs font-medium tracking-wide drop-shadow">
              Catch Weight Digital Verification System
            </p>
          </div>
        </div>

        {/* CARD BODY WITH CRISP FORMAL DIVIDERS */}
        <div className="p-6 sm:p-7 space-y-4">
          
          {/* Notifications */}
          {error && (
            <div className="p-3 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl flex items-start gap-2 text-xs text-[#E03131] animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-[#E03131] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-xs text-[#0B5E2B] flex items-center gap-2 animate-fadeIn font-semibold">
              <CheckCircle2 className="w-4 h-4 text-[#12803C] shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              VIEW 1: DEFAULT LOGIN FORM
             ═════════════════════════════════════════════════════════ */}
          {mode === 'LOGIN' && (
            <form onSubmit={handlePinLogin} className="space-y-4 animate-fadeIn">
              
              {/* Employee ID with Intelligent Prediction / Auto-suggestion */}
              <div className="relative" ref={dropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#1F1F1F]">
                    User พนักงาน
                  </label>
                  {recentLogins.length > 0 && (
                    <span className="text-[11px] text-[#12803C] font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      มีประวัติ {recentLogins.length} บัญชี
                    </span>
                  )}
                </div>

                {/* Quick Chips for Recently Logged-in Staff on this Device */}
                {recentLogins.length > 0 && !empId && (
                  <div className="mb-2 p-2 bg-[#F7F2EA] border border-[#E8E1D8] rounded-2xl animate-fadeIn">
                    <span className="text-[10px] text-[#6E6E6E] font-bold block mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#12803C]" />
                      แตะเพื่อเลือกบัญชีที่เคยเข้าใช้งาน:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {recentLogins.slice(0, 4).map((item) => (
                        <div
                          key={item.empId}
                          onClick={() => handleSelectSuggestion(item)}
                          role="button"
                          tabIndex={0}
                          className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFDF9] hover:bg-[#EAF7ED] border border-[#AEE0BD] text-[#004D25] rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 shadow-2xs"
                        >
                          <User className="w-3 h-3 text-[#12803C] shrink-0" />
                          <span className="font-mono">{item.empId}</span>
                          <span className="text-[10px] text-[#0B5E2B]/80 font-semibold truncate max-w-[80px]">
                            {item.fullName.split(' ')[0]}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => removeRecentLogin(e, item.empId)}
                            className="ml-0.5 text-[#8C827A] hover:text-red-500 rounded p-0.5 hover:bg-red-50 transition-colors"
                            title="ลบออกจากประวัติ"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input with live prediction indicator */}
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="กรอก User พนักงาน หรือชื่อ..."
                    value={empId}
                    onFocus={() => setShowSuggestions(true)}
                    onChange={(e) => {
                      setEmpId(cleanSearchOrIdInput(e.target.value));
                      setShowSuggestions(true);
                    }}
                    className="w-full px-4 py-3 text-sm font-semibold tracking-wide uppercase bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none transition-colors pr-9"
                  />
                  {empId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEmpId('');
                        setShowSuggestions(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8C827A] hover:text-[#1F1F1F] rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#C4BCB3]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <span className="text-[11px] text-[#8C827A] mt-1 block">
                  พิมพ์ User พนักงาน หรือชื่อ (ระบบจะแนะนำและคาดเดาอัตโนมัติ)
                </span>

                {/* Live matched user badge */}
                {liveLoginUser && (
                  <div className="mt-2 px-3 py-1.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-xl text-xs text-[#0B5E2B] font-bold flex items-center justify-between animate-fadeIn">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-[#12803C] shrink-0" />
                      <span>คุณ{liveLoginUser.fullName}</span>
                    </div>
                    <span className="text-[10px] text-[#12803C] font-semibold bg-white px-2 py-0.5 rounded-full border border-[#AEE0BD]">
                      {liveLoginUser.isPinSet ? '✓ มีรหัส PIN แล้ว' : 'ยังไม่ตั้ง PIN'}
                    </span>
                  </div>
                )}

                {/* Floating Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-[#FFFDF9] border-2 border-[#12803C] rounded-2xl shadow-2xl overflow-hidden divide-y divide-[#E8E1D8] animate-fadeIn max-h-60 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-[#F7F2EA] flex items-center justify-between text-[11px] font-bold text-[#6E6E6E]">
                      <span className="flex items-center gap-1 text-[#12803C]">
                        <Sparkles className="w-3.5 h-3.5 text-[#12803C]" />
                        ผลการคาดเดา ({suggestions.length})
                      </span>
                      <span className="text-[10px] text-[#8C827A]">แตะเพื่อเลือกทันที</span>
                    </div>
                    {suggestions.map((item) => (
                      <div
                        key={item.empId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className="p-3 hover:bg-[#EAF7ED] cursor-pointer transition-colors flex items-center justify-between gap-2 active:bg-[#D5EFE0]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            item.isRecent ? 'bg-[#FFD100]/25 text-[#9A7D0A]' : 'bg-[#EAF7ED] text-[#12803C]'
                          }`}>
                            {item.isRecent ? (
                              <Clock className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-sm text-[#004D25]">
                                {item.empId}
                              </span>
                              {item.isRecent ? (
                                <span className="text-[10px] font-bold bg-[#FFD100] text-[#004D25] px-1.5 py-0.2 rounded-full">
                                  เคยใช้ล่าสุด
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#12803C] font-semibold bg-[#EAF7ED] px-1.5 py-0.2 rounded-full">
                                  ทำเนียบ SRRDC
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#1F1F1F] font-bold truncate">
                              คุณ{item.fullName}
                            </div>
                            {item.department && (
                              <div className="text-[10px] text-[#8C827A] truncate">
                                {item.department} {item.role ? `• ${item.role}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#12803C] shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 6-digit PIN */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-[#1F1F1F]">
                    รหัส PIN 6 หลัก
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('FORGOT_PIN')}
                    className="text-xs text-[#12803C] hover:text-[#0B5E2B] font-bold hover:underline"
                  >
                    ลืม PIN?
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={pinInputRef}
                    type={showPin ? 'text' : 'tel'}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="••••••"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className={`w-full px-4 py-3 text-center text-2xl tracking-widest font-black bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none transition-colors pr-11 ${
                      !showPin ? 'pin-mask' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8C827A] hover:text-[#1F1F1F] rounded-lg transition-colors active:scale-95"
                    title={showPin ? 'ซ่อนรหัส PIN' : 'แสดงรหัส PIN'}
                  >
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              {/* Single Onboarding Button */}
              <div className="pt-2 border-t border-[#E8E1D8]">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('ONBOARDING')}
                  className="w-full py-2.5 px-3 bg-[#EAF7ED] hover:bg-[#D5EFE0] border border-[#AEE0BD] rounded-2xl text-xs text-[#0B5E2B] font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-98"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#12803C]" />
                  <span>สำหรับพนักงานใหม่ / ยังไม่เคยตั้งรหัส PIN</span>
                </button>
                <span className="text-[10px] text-[#8C827A] text-center block mt-1 leading-snug">
                  * หากเคยตั้งรหัส PIN ในเครื่องตัวเองแล้ว สามารถกรอก User และ PIN เข้าใช้งานด้านบนได้ทันทีทุกเครื่อง
                </span>
              </div>

            </form>
          )}

          {/* ═════════════════════════════════════════════════════════
              VIEW 2: UNIFIED ONBOARDING (SINGLE PATHWAY)
             ═════════════════════════════════════════════════════════ */}
          {mode === 'ONBOARDING' && (
            <form onSubmit={handleOnboardingSubmit} className="space-y-3.5 animate-fadeIn">
              
              <div className="p-3 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-xs text-[#0B5E2B] space-y-0.5">
                <span className="font-bold block">สำหรับพนักงานใหม่ / ยังไม่เคยตั้งรหัส PIN</span>
                <p className="text-[11px] text-[#0B5E2B]/80 leading-snug">
                  กรอก User พนักงาน และตั้งรหัส PIN 6 หลักเพื่อเริ่มปฏิบัติงาน
                </p>
              </div>

              {/* Employee ID */}
              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                  User พนักงาน
                </label>
                <input
                  type="text"
                  autoCapitalize="characters"
                  placeholder="กรอก User พนักงาน"
                  value={onboardEmpId}
                  onChange={(e) => setOnboardEmpId(cleanIdInput(e.target.value))}
                  className="w-full px-4 py-2.5 text-sm font-semibold tracking-wide uppercase bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                />
                <span className="text-[11px] text-[#8C827A] mt-1 block">
                  ภาษาอังกฤษพิมพ์ใหญ่และตัวเลข ไม่เว้นวรรค
                </span>

                {/* Check if user already set PIN (on another device or locally) */}
                {onboardExistingUser && onboardExistingUser.isPinSet ? (
                  <div className="mt-2 p-3 bg-[#EAF7ED] border border-[#12803C] rounded-2xl text-xs text-[#004D25] animate-fadeIn space-y-2 shadow-sm">
                    <div className="font-bold flex items-center gap-1.5 text-sm text-[#12803C]">
                      <UserCheck className="w-4 h-4 text-[#12803C]" />
                      <span>คุณ{onboardExistingUser.fullName} มีรหัส PIN ในระบบแล้ว</span>
                    </div>
                    <p className="text-[11px] text-[#0B5E2B] leading-snug">
                      ระบบบันทึกรหัส PIN ของท่านไว้ใน Cloud เรียบร้อยแล้ว สามารถกลับไปหน้าแรกเพื่อใส่ PIN 6 หลักเดิมเข้าใช้งานได้ทันที (ไม่ต้องตั้งรหัสใหม่)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEmpId(onboardEmpId);
                        handleSwitchMode('LOGIN');
                      }}
                      className="w-full text-xs font-bold text-white bg-[#12803C] hover:bg-[#0B5E2B] py-2.5 px-3 rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 active:scale-98"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>กลับไปหน้าเข้าสู่ระบบทันที</span>
                    </button>
                  </div>
                ) : onboardMatchedRoster ? (
                  <div className="mt-1.5 px-3 py-1.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-xl text-xs text-[#0B5E2B] font-bold flex items-center gap-1.5 animate-fadeIn">
                    <UserCheck className="w-4 h-4 text-[#12803C] shrink-0" />
                    <span>คุณ{onboardMatchedRoster.fullName}</span>
                  </div>
                ) : onboardEmpId.trim().length >= 3 ? (
                  <div className="mt-1.5 px-2.5 py-1 text-[11px] text-[#9A7D0A] bg-[#FFF9DB] rounded-xl border border-[#F5D77F]">
                    User นี้ยังไม่อยู่ในทำเนียบ กรุณาระบุชื่อ-นามสกุลด้านล่างเพื่อยื่นลงทะเบียน
                  </div>
                ) : null}
              </div>

              {/* Name field (shown if employee is new / not in master and doesn't have PIN already) */}
              {!(onboardExistingUser && onboardExistingUser.isPinSet) && !onboardMatchedRoster && (
                <div className="animate-fadeIn">
                  <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                    ชื่อ - นามสกุล
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น สมศักดิ์ ใจดี"
                    value={onboardName}
                    onChange={(e) => setOnboardName(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                  />
                </div>
              )}

              {/* 6-digit PIN inputs (hidden if already has PIN) */}
              {!(onboardExistingUser && onboardExistingUser.isPinSet) && (
                <>
                  <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F1F1F]">กำหนดรหัส PIN 6 หลัก</span>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-[11px] text-[#12803C] hover:text-[#0B5E2B] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPin ? 'ซ่อนตัวเลข' : 'แสดงตัวเลข'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[#6E6E6E] block mb-1">
                      รหัส PIN 6 หลัก
                    </label>
                    <input
                      type={showPin ? 'text' : 'tel'}
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="••••••"
                      value={onboardPin}
                      onChange={(e) => setOnboardPin(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2.5 text-center text-xl tracking-widest font-black border-2 border-[#AEE0BD] rounded-2xl focus:border-[#12803C] focus:outline-none bg-[#FFFDF9] ${
                        !showPin ? 'pin-mask' : ''
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#6E6E6E] block mb-1">
                      ยืนยัน PIN
                    </label>
                    <input
                      type={showPin ? 'text' : 'tel'}
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="••••••"
                      value={onboardConfirmPin}
                      onChange={(e) => setOnboardConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2.5 text-center text-xl tracking-widest font-black border-2 border-[#AEE0BD] rounded-2xl focus:border-[#12803C] focus:outline-none bg-[#FFFDF9] ${
                        !showPin ? 'pin-mask' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || onboardPin.length !== 6 || onboardConfirmPin.length !== 6 || !onboardEmpId.trim()}
                className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึกข้อมูล...' : 'บันทึกรหัส PIN และเข้าสู่ระบบ'}
              </button>
            </>
          )}

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('LOGIN')}
                  className="text-xs text-[#8C827A] hover:text-[#1F1F1F] font-semibold flex items-center justify-center gap-1 mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  ย้อนกลับไปหน้าเข้าสู่ระบบ
                </button>
              </div>

            </form>
          )}

          {/* ═════════════════════════════════════════════════════════
              VIEW 3: FORGOT PIN RECOVERY
             ═════════════════════════════════════════════════════════ */}
          {mode === 'FORGOT_PIN' && (
            <form onSubmit={handleForgotPinSubmit} className="space-y-3.5 animate-fadeIn">
              
              <div className="p-3 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-xs text-[#0B5E2B] space-y-0.5">
                <span className="font-bold block">ลืม PIN?</span>
                <p className="text-[11px] text-[#0B5E2B]/80 leading-snug">
                  ระบุ User พนักงาน เพื่อตั้งรหัส PIN 6 หลักใหม่
                </p>
              </div>

              {/* Employee ID */}
              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                  User พนักงาน
                </label>
                <input
                  type="text"
                  autoCapitalize="characters"
                  placeholder="กรอก User พนักงาน"
                  value={forgotEmpId}
                  onChange={(e) => setForgotEmpId(cleanIdInput(e.target.value))}
                  className="w-full px-4 py-2.5 text-sm font-semibold tracking-wide uppercase bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                />
                <span className="text-[11px] text-[#8C827A] mt-1 block">
                  ภาษาอังกฤษพิมพ์ใหญ่และตัวเลข ไม่เว้นวรรค
                </span>

                {forgotMatchedRoster && (
                  <div className="mt-1.5 px-3 py-1.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-xl text-xs text-[#0B5E2B] font-bold flex items-center gap-1.5 animate-fadeIn">
                    <UserCheck className="w-4 h-4 text-[#12803C] shrink-0" />
                    <span>คุณ{forgotMatchedRoster.fullName}</span>
                  </div>
                )}
              </div>

              {/* Name verification if needed */}
              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                  ชื่อ หรือ นามสกุล (เพื่อยืนยันตัวตน)
                </label>
                <input
                  type="text"
                  placeholder="ระบุชื่อหรือนามสกุล"
                  value={forgotNameVerify}
                  onChange={(e) => setForgotNameVerify(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-[#FFFDF9] border-2 border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                />
              </div>

              {/* New PIN & Confirm */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F1F1F]">กำหนดรหัส PIN ใหม่</span>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-[11px] text-[#12803C] hover:text-[#0B5E2B] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPin ? 'ซ่อนตัวเลข' : 'แสดงตัวเลข'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[#6E6E6E] block mb-1">
                      รหัส PIN ใหม่ 6 หลัก
                    </label>
                    <input
                      type={showPin ? 'text' : 'tel'}
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="••••••"
                      value={forgotNewPin}
                      onChange={(e) => setForgotNewPin(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2.5 text-center text-xl tracking-widest font-black border-2 border-[#AEE0BD] rounded-2xl focus:border-[#12803C] focus:outline-none bg-[#FFFDF9] ${
                        !showPin ? 'pin-mask' : ''
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#6E6E6E] block mb-1">
                      ยืนยัน PIN
                    </label>
                    <input
                      type={showPin ? 'text' : 'tel'}
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="••••••"
                      value={forgotConfirmPin}
                      onChange={(e) => setForgotConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className={`w-full px-3 py-2.5 text-center text-xl tracking-widest font-black border-2 border-[#AEE0BD] rounded-2xl focus:border-[#12803C] focus:outline-none bg-[#FFFDF9] ${
                        !showPin ? 'pin-mask' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || forgotNewPin.length !== 6 || forgotConfirmPin.length !== 6 || !forgotEmpId.trim()}
                className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึกข้อมูล...' : 'กู้คืนรหัส PIN และเข้าสู่ระบบ'}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('LOGIN')}
                  className="text-xs text-[#8C827A] hover:text-[#1F1F1F] font-semibold flex items-center justify-center gap-1 mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  ย้อนกลับไปหน้าเข้าสู่ระบบ
                </button>
              </div>

            </form>
          )}

        </div>

      </div>

      {/* ─── FOOTER BAR: SUBTLE QR & DISCREET ADMIN ACCESS ─────────── */}
      <div className="w-full max-w-[360px] mt-3 px-2 flex items-center justify-between text-xs text-[#8C827A]">
        
        {/* Mobile QR Helper (Minimalist button) */}
        <button
          type="button"
          onClick={() => setShowQrModal(true)}
          className="text-[#8C827A] hover:text-[#12803C] transition-colors flex items-center gap-1.5 p-1 rounded-lg"
          title="QR Code สำหรับมือถือ"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span className="text-[11px]">เปิดบนมือถือ</span>
        </button>

        {/* Discreet Admin Entrance: Icon ⓘ ONLY, no text label */}
        <button
          type="button"
          onClick={() => {
            resetAllMessages();
            setShowAdminModal(true);
          }}
          className="text-[#C4BCB3] hover:text-[#6E6E6E] p-1.5 rounded-full transition-colors focus:outline-none"
          aria-label="Information"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

      </div>

      {/* ─── DISCREET ADMIN MODAL (GOOGLE ACCOUNT AUTHENTICATION) ─── */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FFFDF9] rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8E1D8] space-y-4 relative">
            
            <button
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F7F2EA] hover:bg-[#E8E1D8] flex items-center justify-center text-[#6E6E6E] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1 pt-1">
              <div className="w-10 h-10 bg-[#EAF7ED] rounded-2xl flex items-center justify-center mx-auto text-[#12803C]">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-[#1F1F1F]">
                Google Account Authentication
              </h3>
            </div>

            {error && (
              <div className="p-3 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl text-xs text-[#E03131] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAdminGoogleLogin} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                  Google Account Email:
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                  Security Password:
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl focus:border-[#12803C] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3 rounded-2xl text-xs shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? 'Verifying Authorization...' : 'Sign in with Google'}
              </button>
            </form>

          </div>
        </div>
      )}

      {/* ─── QR Code Modal for Mobile Access ─────────────────────── */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FFFDF9] rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8E1D8] space-y-4 text-center relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F7F2EA] hover:bg-[#E8E1D8] flex items-center justify-center text-[#6E6E6E] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-[#EAF7ED] flex items-center justify-center mx-auto text-[#12803C]">
              <QrCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-[#1F1F1F]">
                สแกนเปิดใช้งานบนมือถือ / แท็บเล็ต
              </h3>
              <p className="text-xs text-[#8C827A] mt-0.5">
                เปิดกล้องมือถือแล้วสแกนเพื่อเข้าสู่ระบบ SMART DC
              </p>
            </div>

            <div className="bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8] inline-block shadow-inner mx-auto">
              <img
                src="/smart-dc-qr.png"
                alt="SMART DC QR Code"
                className="w-48 h-48 mx-auto rounded-xl object-contain bg-white p-2"
              />
            </div>

            <div className="p-2.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-xl text-left space-y-1">
              <span className="text-[10px] font-bold text-[#0B5E2B] block">
                🌐 ลิงก์ระบบถาวร (เปิดผ่าน 5G / 4G / Wi-Fi):
              </span>
              <div className="flex items-center justify-between gap-1 text-xs font-mono font-bold text-[#0B5E2B]">
                <span className="truncate">https://smart-dc-delta.vercel.app</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('https://smart-dc-delta.vercel.app');
                    alert('คัดลอกลิงก์เรียบร้อยแล้ว!');
                  }}
                  className="p-1 text-[#12803C] hover:text-[#0B5E2B] transition-colors shrink-0"
                  title="คัดลอกลิงก์"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-[#12803C] hover:bg-[#0B5E2B] text-white text-xs font-bold rounded-2xl shadow-md transition-all active:scale-95"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
