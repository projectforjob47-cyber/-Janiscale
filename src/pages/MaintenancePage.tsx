import React, { useState } from 'react';
import { Hammer, RefreshCw, Sparkles, Lock, X, Eye, EyeOff, AlertCircle, ShieldCheck, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';

export default function MaintenancePage() {
  const navigate = useNavigate();
  const { loginWithGoogle, isAuthenticated, currentUser, logout } = useAuthStore();

  const isAllowlistedAdmin = ADMIN_ALLOWLIST.includes(currentUser?.email || '') || ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const isCurrentlyAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR' || isAllowlistedAdmin;

  // Modal & form states
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState('projectforjob47@gmail.com');
  const [customEmail, setCustomEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReload = () => {
    window.location.reload();
  };

  const handleOpenAdminModal = () => {
    setErrorMsg('');
    setShowAdminModal(true);
  };

  const handleEnterAsAdmin = () => {
    sessionStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
    localStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
    navigate('/dashboard');
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const targetEmail = adminEmail === 'CUSTOM' ? customEmail.trim().toLowerCase() : adminEmail.trim().toLowerCase();

    if (!targetEmail) {
      setErrorMsg('กรุณาระบุอีเมลผู้ดูแลระบบ (Admin Email)');
      return;
    }

    if (!adminPassword.trim()) {
      setErrorMsg('กรุณากรอกรหัสผ่านผู้ดูแลระบบ');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginWithGoogle(targetEmail, adminPassword.trim());
      if (res.success) {
        sessionStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
        localStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
        setShowAdminModal(false);
        navigate('/dashboard');
      } else {
        setErrorMsg(res.message || 'รหัสผ่านหรืออีเมลแอดมินไม่ถูกต้อง');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F2] flex flex-col items-center justify-center p-4 sm:p-6 text-[#1F1F1F]">
      <div className="w-full max-w-md bg-white border-2 border-[#E8E1D8] rounded-3xl p-6 sm:p-8 shadow-lg text-center space-y-6">
        {/* App Logo / DC Header */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-[#12803C] text-white font-black text-lg flex items-center justify-center shadow-sm">
            DC
          </div>
          <div className="text-left">
            <h1 className="text-base font-black text-[#0B5E2B] leading-none tracking-tight">SMART DC</h1>
            <p className="text-[10px] font-bold text-[#6E6E6E] tracking-wider uppercase">Receiving Fresh System</p>
          </div>
        </div>

        {/* Animated Maintenance Visual */}
        <div className="relative mx-auto w-24 h-24 rounded-full bg-[#FFF9DB] border-2 border-[#F59F00] flex items-center justify-center shadow-inner">
          <Hammer className="w-12 h-12 text-[#D9480F] animate-bounce" />
          <div className="absolute -bottom-1 -right-1 bg-[#12803C] text-white p-1.5 rounded-full shadow-xs">
            <Sparkles className="w-4 h-4 text-[#FFD100]" />
          </div>
        </div>

        {/* Core Message */}
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 bg-[#FFE3E3] text-[#C92A2A] border border-[#FFA8A8] rounded-full text-xs font-black">
            🛠️ อยู่ระหว่างปรับปรุงระบบ
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[#1F1F1F]">
            กำลังพัฒนาแอป
          </h2>
          <p className="text-base sm:text-lg font-black text-[#D9480F]">
            กรุณาเข้าใช้งานภายหลัง
          </p>
          <p className="text-xs sm:text-sm text-[#6E6E6E] pt-2 leading-relaxed">
            ระบบ SMART DC กำลังอยู่ระหว่างการปรับปรุงและพัฒนาเพิ่มเติมเพื่อความแม่นยำและความเสถียรสูงสุด
            ขออภัยในความไม่สะดวกครับ
          </p>
        </div>

        {/* System Link info */}
        <div className="p-3 bg-[#FAF6F0] border border-[#E8E1D8] rounded-2xl text-xs space-y-1">
          <span className="text-[11px] text-[#6E6E6E] font-medium block">ลิงก์ระบบทางการ:</span>
          <code className="text-[#0B5E2B] font-bold text-xs break-all select-all">
            https://smart-dc-delta.vercel.app
          </code>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={handleReload}
            className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white py-3 px-6 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>ลองใหม่อีกครั้ง</span>
          </button>

          {/* Admin Login / Access Button */}
          {isAuthenticated && isCurrentlyAdmin ? (
            <button
              type="button"
              onClick={handleEnterAsAdmin}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-black text-white bg-[#0B5E2B] hover:bg-[#084821] flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFD100]" />
              <span>เข้าใช้งานระบบในฐานะแอดมิน ({currentUser?.fullName?.split(' ')[0]}) →</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAdminModal}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#6E6E6E] hover:text-[#0B5E2B] bg-[#F7F2EA] hover:bg-[#EAF7ED] border border-[#E8E1D8] hover:border-[#AEE0BD] flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-98 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#12803C]" />
              <span>เข้าสู่ระบบสำหรับผู้ดูแลระบบ (Admin พัฒนาแอป)</span>
            </button>
          )}
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-[#A8A29E]">
          ฝ่ายเทคโนโลยีและปฏิบัติการ DC · สดใหม่ทุกวัน
        </p>
      </div>

      {/* ─── ADMIN LOGIN MODAL (สำหรับแอดมินเข้าดูหลังบ้านและพัฒนาแอป) ─── */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FFFDF9] rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-[#12803C] space-y-4 relative text-left">
            <button
              type="button"
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F7F2EA] hover:bg-[#E8E1D8] flex items-center justify-center text-[#6E6E6E] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EAF7ED] text-[#12803C] flex items-center justify-center border border-[#AEE0BD]">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#1F1F1F]">เข้าสู่ระบบผู้ดูแลระบบ (Admin)</h3>
                <p className="text-[11px] text-[#6E6E6E]">เพื่อเข้าใช้งานและพัฒนาแอปหลังบ้าน</p>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-[#FFE3E3] border border-[#FFA8A8] text-[#C92A2A] rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-3 pt-1">
              {/* Select Admin Account */}
              <div>
                <label className="text-[11px] font-bold text-[#6E6E6E] block mb-1">
                  เลือกบัญชีผู้ดูแลระบบ (Admin Account):
                </label>
                <select
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full text-xs p-2.5 border border-[#E8E1D8] rounded-xl bg-white font-bold text-[#1F1F1F] focus:outline-none focus:border-[#12803C] cursor-pointer"
                >
                  <option value="projectforjob47@gmail.com">System Administrator (Owner)</option>
                  <option value="guidelump@gmail.com">System Administrator (guidelump@gmail.com)</option>
                  <option value="srrdc_inbound@lotuss.com">SRRDC Inbound Admin</option>
                  <option value="piromya_sedtacher@lotuss.com">Piromya Sedtacher (Inbound Admin)</option>
                  <option value="sahaphop.thammakad@lotuss.com">Sahaphop Thammakad (Inbound Admin)</option>
                  <option value="benjawan.kongtuk1@lotuss.com">Benjawan Kongtuk (Inbound Admin)</option>
                  <option value="CUSTOM">✏️ พิมพ์อีเมลแอดมินอื่น...</option>
                </select>
              </div>

              {adminEmail === 'CUSTOM' && (
                <div>
                  <label className="text-[11px] font-bold text-[#6E6E6E] block mb-1">
                    ระบุอีเมลผู้ดูแลระบบ:
                  </label>
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[#E8E1D8] rounded-xl bg-white font-medium text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#12803C]"
                  />
                </div>
              )}

              {/* Password */}
              <div>
                <label className="text-[11px] font-bold text-[#6E6E6E] block mb-1">
                  รหัสผ่านผู้ดูแลระบบ (Admin Password):
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="กรอกรหัสผ่าน..."
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full text-xs p-2.5 pr-10 border border-[#E8E1D8] rounded-xl bg-white font-medium text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#12803C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C827A] hover:text-[#1F1F1F] p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบหลังบ้าน (Admin เข้าใช้งาน)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Quick unlock bypass
                    sessionStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
                    localStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
                    setShowAdminModal(false);
                    navigate('/dashboard');
                  }}
                  className="w-full text-[11px] text-[#6E6E6E] hover:text-[#12803C] underline py-1 text-center cursor-pointer block"
                >
                  หรือเข้าดูระบบโดยตรง (Direct Admin Unlock)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
