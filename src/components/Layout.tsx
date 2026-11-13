// ============================================================
// SMART DC — Layout Component
// Mobile app shell: header, offline banner, bottom nav
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Home,
  FileUp,
  ClipboardList,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  ShoppingBasket,
  Database,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  LogOut,
  QrCode,
  X,
  Copy,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { onSyncStatusChange, type SyncStatusType } from '../lib/syncEngine';

interface ActionButton {
  icon: React.ReactNode;
  onClick: () => void;
  label?: string;
}

interface Props {
  title?: string;
  children: React.ReactNode;
  showBack?: boolean;
  backTo?: string;
  actions?: ActionButton[];
}

interface NavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    path:  '/dashboard',
    icon:  <Home className="w-5 h-5" />,
    label: 'หน้าหลัก',
  },
  {
    path:  '/cn',
    icon:  <AlertTriangle className="w-5 h-5" />,
    label: 'เคส CN',
  },
  {
    path:  '/backoffice',
    icon:  <Database className="w-5 h-5" />,
    label: 'ข้อมูลหลังบ้าน',
    roles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    path:  '/import',
    icon:  <FileUp className="w-5 h-5" />,
    label: 'นำเข้า',
    roles: ['ADMIN', 'SUPERVISOR'],
  },
];

type SyncState = 'idle' | 'syncing' | 'success';

// Real-time Thai Buddhist Era Clock (Asia/Bangkok)
function ThaiLiveClock() {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const get = (type: string) => parts.find(p => p.type === type)?.value || '';
      const day = get('day');
      const month = get('month');
      const yearCE = parseInt(get('year'), 10);
      const yearBE = isNaN(yearCE) ? now.getFullYear() + 543 : yearCE + 543;
      const hour = get('hour');
      const minute = get('minute');
      const second = get('second');
      setTimeStr(`${day}/${month}/${yearBE} ${hour}:${minute}:${second}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      title="เวลาระบบประเทศไทย (Real-time Clock)"
      className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] font-bold text-[#495057] bg-[#F1F3F5] px-2 py-1 rounded-xl border border-[#CED4DA] whitespace-nowrap shrink-0 shadow-2xs"
    >
      <Clock className="w-3 h-3 text-[#6C757D] shrink-0" />
      <span>{timeStr}</span>
    </div>
  );
}

export default function Layout({ title, children, showBack = false, backTo, actions = [] }: Props) {
  const navigate       = useNavigate();
  const location       = useLocation();
  const { currentUser, logout, hasRole } = useAuthStore();

  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [realtimeStatus, setRealtimeStatus] = useState<SyncStatusType>('connected');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    return onSyncStatusChange((status) => {
      setRealtimeStatus(status);
    });
  }, []);

  const handleConfirmLogout = () => {
    logout();
    setShowLogoutModal(false);
    navigate('/login');
  };

  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true);  flashSync(); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const flashSync = () => {
    setSyncState('syncing');
    setTimeout(() => setSyncState('success'), 2000);
    setTimeout(() => setSyncState('idle'),    4000);
  };

  const handleBack = () => {
    if (backTo) navigate(backTo);
    else        navigate(-1);
  };

  const visibleNav = NAV_ITEMS.filter(n => {
    if (!n.roles) return true;
    if (!currentUser) return false;
    if (n.roles.includes('OTM')) {
      return hasRole('OTM') || currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';
    }
    return n.roles.includes(currentUser.role);
  });

  const SyncIcon = () => {
    if (syncState === 'syncing') return <RefreshCw className="w-3.5 h-3.5 animate-spin" />;
    if (syncState === 'success') return <CheckCircle2 className="w-3.5 h-3.5" />;
    return <Clock className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F2EA] text-[#1F1F1F] overflow-x-hidden w-full">

      {/* ─── Offline Banner ──────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-[#E03131] text-white text-xs font-semibold py-2 px-4 shadow-sm">
          <WifiOff className="w-3.5 h-3.5" />
          ออฟไลน์ — ข้อมูลบันทึกในเครื่อง จะซิงค์เมื่อมีสัญญาณ
        </div>
      )}

      {/* ─── Header ─────────────────────────────────────── */}
      <header className="bg-[#FFFDF9] border-b border-[#E8E1D8] sticky top-0 z-40 shadow-xs w-full print:hidden">
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-5">
          {/* ── Desktop & Tablet View (Single Unified Row) ── */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:h-14">
            {/* Left: Navigation & Clean Title/Brand with Lotus's Logo */}
            <div className="flex items-center gap-2.5 min-w-0">
              {showBack && (
                <button
                  onClick={handleBack}
                  title="ย้อนกลับ"
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-[#1F1F1F] bg-[#F7F2EA] border border-[#E8E1D8]
                    hover:bg-[#EFD9A7]/40 active:scale-95 transition-all shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-[#12803C]" />
                </button>
              )}
              <div 
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                title="กลับไปหน้าหลัก"
              >
                <img 
                  src="/images/lotus-logo.svg" 
                  alt="Lotus's" 
                  className="h-6 w-auto object-contain shrink-0"
                />
                <span className="text-xs font-black text-[#12803C] tracking-wider bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#AEE0BD]">
                  SMART DC
                </span>
              </div>
              {title && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#C4BCB3] text-sm font-light">/</span>
                  <h1 className="text-sm font-bold text-[#1F1F1F] truncate">
                    {title}
                  </h1>
                </div>
              )}
            </div>

            {/* Right: Clock & Action Cluster */}
            <div className="flex items-center gap-2">
              <ThaiLiveClock />

              {/* Real-time Multi-Device Sync Indicator */}
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold border transition-all ${
                realtimeStatus === 'syncing'
                  ? 'bg-[#FEF9E7] text-[#9A7D0A] border-[#FAD7A0]'
                  : realtimeStatus === 'connected'
                  ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]'
                  : 'bg-[#FDE8E8] text-[#E03131] border-[#F8B4B4]'
              }`}>
                {realtimeStatus === 'syncing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังซิงค์...</span>
                  </>
                ) : realtimeStatus === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#12803C] animate-pulse" />
                    <span>เรียลไทม์</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>ออฟไลน์</span>
                  </>
                )}
              </span>

              {/* Quick Excel / Google Sheets Hub Button */}
              {location.pathname !== '/sheets' && (
                <button
                  onClick={() => navigate('/sheets')}
                  title="เปิดตาราง Excel & Google Sheet"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#0B5E2B] bg-[#EAF7ED] border border-[#AEE0BD] hover:bg-[#D4EED9] active:scale-95 transition-all shrink-0 shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#12803C]" />
                  <span>Excel/ชีต</span>
                </button>
              )}

              {/* Quick QR Code for Mobile */}
              <button
                onClick={() => setShowQrModal(true)}
                title="แสดง QR Code สำหรับมือถือ/แท็บเล็ต"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all shrink-0 shadow-xs"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-700" />
                <span>QR</span>
              </button>

              {/* Custom Action buttons */}
              {actions.map((action, i) => (
                <button
                  key={i}
                  onClick={action.onClick}
                  title={action.label}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-[#1F1F1F] bg-[#F7F2EA] border border-[#E8E1D8]
                    hover:bg-[#EFD9A7]/40 active:scale-95 transition-all shrink-0"
                >
                  {action.icon}
                </button>
              ))}

              {/* Quick Logout Button */}
              {currentUser && (
                <button
                  onClick={() => setShowLogoutModal(true)}
                  title={`ออกจากระบบ (${currentUser.fullName})`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 active:scale-95 transition-all shrink-0 shadow-xs"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-600" />
                  <span>ออก</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Mobile View (< sm): Elegant 2-Row Spacious Layout (Zero Overlap) ── */}
          <div className="sm:hidden py-1.5 space-y-1.5">
            {/* Row 1: Back/Brand & Page Title (Full Width — Never Collides with Clock) */}
            <div className="flex items-center gap-2 min-w-0">
              {showBack && (
                <button
                  onClick={handleBack}
                  title="ย้อนกลับ"
                  className="flex items-center justify-center w-8 h-8 rounded-xl text-[#1F1F1F] bg-[#F7F2EA] border border-[#E8E1D8] hover:bg-[#EFD9A7]/40 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#12803C]" />
                </button>
              )}
              <div 
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 cursor-pointer shrink-0"
                title="หน้าหลัก"
              >
                <img 
                  src="/images/lotus-logo.svg" 
                  alt="Lotus's" 
                  className="h-5 w-auto object-contain shrink-0"
                />
                <span className="text-[10px] font-black text-[#12803C] tracking-wide bg-[#EAF7ED] px-1.5 py-0.5 rounded-md border border-[#AEE0BD] shrink-0">
                  SMART DC
                </span>
              </div>
              {title && (
                <h1 className="text-xs font-bold text-[#6E6E6E] truncate border-l border-[#E8E1D8] pl-2 min-w-0 flex-1">
                  {title}
                </h1>
              )}
            </div>

            {/* Row 2: Clock on Left + Actions on Right (Spacious, Comfortable) */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#E8E1D8]/50">
              {/* Clock on Left */}
              <div className="flex items-center gap-1.5 min-w-0">
                <ThaiLiveClock />
                <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg font-bold border shrink-0 transition-all ${
                  realtimeStatus === 'syncing'
                    ? 'bg-[#FEF9E7] text-[#9A7D0A] border-[#FAD7A0]'
                    : realtimeStatus === 'connected'
                    ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]'
                    : 'bg-[#FDE8E8] text-[#E03131] border-[#F8B4B4]'
                }`}>
                  {realtimeStatus === 'syncing' ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>ซิงค์...</span>
                    </>
                  ) : realtimeStatus === 'connected' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#12803C] animate-pulse" />
                      <span>เรียลไทม์</span>
                    </>
                  ) : (
                    <span>ออฟไลน์</span>
                  )}
                </span>
              </div>

              {/* Action Toolbar on Right */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Quick Excel / Google Sheets Hub Button */}
                {location.pathname !== '/sheets' && (
                  <button
                    onClick={() => navigate('/sheets')}
                    title="เปิดตาราง Excel & Google Sheet"
                    className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold text-[#0B5E2B] bg-[#EAF7ED] border border-[#AEE0BD] hover:bg-[#D4EED9] active:scale-95 transition-all shadow-2xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#12803C]" />
                    <span>Excel/ชีต</span>
                  </button>
                )}

                {/* Quick QR Code for Mobile */}
                <button
                  onClick={() => setShowQrModal(true)}
                  title="แสดง QR Code"
                  className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all shadow-2xs"
                >
                  <QrCode className="w-3.5 h-3.5 text-blue-700" />
                  <span>QR</span>
                </button>

                {/* Custom Action buttons */}
                {actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={action.onClick}
                    title={action.label}
                    className="flex items-center justify-center w-7 h-7 rounded-xl text-[#1F1F1F] bg-[#F7F2EA] border border-[#E8E1D8] hover:bg-[#EFD9A7]/40 active:scale-95 transition-all shrink-0"
                  >
                    {action.icon}
                  </button>
                ))}

                {/* Quick Logout Button */}
                {currentUser && (
                  <button
                    onClick={() => setShowLogoutModal(true)}
                    title={`ออกจากระบบ (${currentUser.fullName})`}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 active:scale-95 transition-all shadow-2xs"
                  >
                    <LogOut className="w-3 h-3 text-red-600" />
                    <span>ออก</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Content ───────────────────────────────── */}
      <main className={`flex-1 w-full ${visibleNav.length > 0 ? 'pb-28 sm:pb-24' : 'pb-10'}`}>
        {children}
      </main>

      {/* ─── Bottom Navigation ──────────────────────────── */}
      {visibleNav.length > 0 && (
        <nav 
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          className="fixed bottom-0 left-0 right-0 bg-[#FFFDF9]/98 backdrop-blur-md border-t border-[#E8E1D8] z-40 flex items-stretch shadow-lg print:hidden"
        >
          <div className="flex items-stretch w-full max-w-lg mx-auto h-14">
            {visibleNav.map(item => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 text-xs
                    font-medium transition-all relative
                    ${isActive
                      ? 'text-[#12803C] font-bold'
                      : 'text-[#6E6E6E] hover:text-[#1F1F1F]'
                    }`}
                >
                  <span className={`${isActive ? 'text-[#12803C] scale-110' : 'text-[#6E6E6E]'} transition-transform shrink-0`}>
                    {item.icon}
                  </span>
                  <span className={`truncate max-w-full text-[11px] sm:text-xs leading-tight ${isActive ? 'text-[#12803C] font-black' : ''}`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 w-10 h-1 bg-[#12803C] rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ─── Logout Confirmation Modal ──────────────────── */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FFFDF9] rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8E1D8] space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto text-red-600">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-[#1F1F1F]">
                ยืนยันการออกจากระบบ?
              </h3>
              <p className="text-xs text-[#6E6E6E]">
                พนักงาน: <b className="text-[#1F1F1F]">{currentUser?.fullName}</b>
              </p>
              {currentUser?.empId && (
                <p className="text-[11px] text-[#8E8E8E]">
                  User พนักงาน: {currentUser.empId} ({currentUser.role})
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-3 px-4 rounded-2xl border border-[#E8E1D8] text-xs font-bold text-[#6E6E6E] hover:bg-[#F7F2EA] active:scale-95 transition-all"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── QR Code Modal for Mobile Access ─────────────────── */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto text-[#12803C]">
              <QrCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-[#1F1F1F]">
                สแกนเปิดใช้งานบนมือถือ
              </h3>
              <p className="text-xs text-[#6E6E6E] mt-0.5">
                เปิดกล้องมือถือแล้วสแกนเพื่อเปิด SMART DC PWA
              </p>
            </div>

            {/* QR Image Box */}
            <div className="bg-[#F7F2EA] p-4 rounded-2xl border-2 border-[#E8E1D8] inline-block shadow-inner mx-auto">
              <img
                src="/smart-dc-qr.png"
                alt="SMART DC QR Code"
                className="w-56 h-56 mx-auto rounded-xl object-contain shadow-xs bg-white p-2"
              />
            </div>

            {/* Direct Link Information */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left space-y-1">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                🌐 ลิงก์ระบบถาวร (เปิดผ่าน 5G / 4G / Wi-Fi ได้ตลอด 24 ชม.):
              </span>
              <div className="flex items-center justify-between gap-1 text-xs font-mono font-bold text-[#0B5E2B]">
                <span className="truncate">https://smart-dc-delta.vercel.app</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('https://smart-dc-delta.vercel.app');
                    alert('คัดลอกลิงก์สำเร็จแล้ว!');
                  }}
                  className="p-1 text-emerald-600 hover:text-emerald-900 transition-colors shrink-0"
                  title="คัดลอกลิงก์"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 bg-[#12803C] hover:bg-[#0e6831] text-white text-xs font-bold rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
