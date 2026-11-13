// ============================================================
// SMART DC — OTMSignPage Component
// OTM Manager Individual SKU Review & Quick 1-Tap Approval Screen
// Modern Green & Warm Cream Design System
// Remembers OTM Name once, eliminates finger-drawing, 1-button approve
// ============================================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Layout from '../components/Layout';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Scale, 
  FileCheck,
  Sparkles,
  UserCheck,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lock
} from 'lucide-react';
import { db } from '../lib/database';
import { useAuthStore, ADMIN_ALLOWLIST } from '../stores/authStore';
import { calculateCN } from '../lib/businessLogic';
import authorizedRoster from '../lib/authorizedRoster.json';
import { v4 as uuidv4 } from 'uuid';
import type { SignatureRecord } from '../types';

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

export default function OTMSignPage() {
  const { samplingGroupId } = useParams<{ samplingGroupId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();

  // Remember OTM Officer name across sessions (ลงชื่อครั้งเดียว)
  const [selectedOtmName, setSelectedOtmName] = useState<string>(() => {
    return localStorage.getItem('smartdc_active_otm_name') || currentUser?.fullName || '';
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isApprovedSuccess, setIsApprovedSuccess] = useState<boolean>(false);
  const [showBasketBreakdown, setShowBasketBreakdown] = useState<boolean>(false);

  // 1. Fetch group
  const group = useLiveQuery(async () => {
    if (!samplingGroupId) return null;
    return await db.samplingGroups.get(samplingGroupId);
  }, [samplingGroupId]);

  // 2. Fetch measurements
  const measurements = useLiveQuery(async () => {
    if (!samplingGroupId) return [];
    return await db.measurements.where('samplingGroupId').equals(samplingGroupId).sortBy('sampleNumber');
  }, [samplingGroupId]) || [];

  // 3. Fetch summary
  const summary = useLiveQuery(async () => {
    if (!samplingGroupId) return null;
    return await db.weightSummaries.where('samplingGroupId').equals(samplingGroupId).first();
  }, [samplingGroupId]);

  // 4. Fetch signatures
  const signatures = useLiveQuery(async () => {
    if (!samplingGroupId) return [];
    return await db.signatureRecords.where('samplingGroupId').equals(samplingGroupId).toArray();
  }, [samplingGroupId]) || [];

  const apptSignatures = useLiveQuery(async () => {
    if (!group?.apptNbr) return [];
    return await db.signatureRecords.where('apptNbr').equals(group.apptNbr).toArray();
  }, [group?.apptNbr]) || [];

  const allSigs = [...signatures, ...apptSignatures];

  // Filter 7 OTM Official members from authorized roster
  const otmRoster = authorizedRoster.filter(r => r.role === 'OTM');

  // Existing signatures
  const isPR = group?.carrierCode === 'PR';
  const vendorSig = allSigs.find(s => s.signerRole === 'DRIVER' || s.signerRole === 'VENDOR');
  const receiveSig = allSigs.find(s => s.signerRole === 'RECEIVE');
  const lpsSig = allSigs.find(s => s.signerRole === 'LPS');
  const otmSig = allSigs.find(s => s.signerRole === 'OTM');

  const isFocus = group?.focusStatus === 'FOCUS';
  const hasRequiredOnsiteSigs = Boolean((isPR || vendorSig) && (!isFocus || lpsSig));

  // Strict Role Check: Only OTM or Admin/Supervisor can approve
  const isOtm = currentUser?.role === 'OTM';
  const isAdmin = currentUser?.role === 'ADMIN' || 
    currentUser?.role === 'SUPERVISOR' || 
    ADMIN_ALLOWLIST.includes(currentUser?.email || '') || 
    ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const canApprove = isOtm || isAdmin;

  // Auto-bind verified OTM name if logged in as OTM
  useEffect(() => {
    if (isOtm && currentUser?.fullName) {
      setSelectedOtmName(currentUser.fullName);
      localStorage.setItem('smartdc_active_otm_name', currentUser.fullName);
    }
  }, [isOtm, currentUser]);

  // Handle changing and saving OTM name
  const handleOtmNameChange = (name: string) => {
    setSelectedOtmName(name);
    if (name) {
      localStorage.setItem('smartdc_active_otm_name', name);
    }
  };

  if (!group) {
    return (
      <Layout title="อนุมัติ OTM" showBack backTo="/otm-queue">
        <div className="p-8 text-center text-[#6E6E6E] text-xs">กำลังโหลดข้อมูล...</div>
      </Layout>
    );
  }

  // One-Tap Quick Approval Handler
  const handleQuickApprove = async () => {
    // Strict Guard: Vendor and Receive must be signed first!
    if (!hasRequiredOnsiteSigs) {
      alert('ไม่สามารถอนุมัติได้: กรุณาให้ผู้แทนลงนามหน้างาน (พนักงานขับรถ/Receive/LP&S) ให้ครบถ้วนตามลำดับก่อน');
      return;
    }

    if (!selectedOtmName) {
      alert('กรุณาเลือกหรือระบุชื่อผู้จัดการ OTM ก่อนกดยืนยัน');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const digitalStamp = generateDigitalSeal(selectedOtmName, now);

      const newSig: SignatureRecord = {
        id: uuidv4(),
        samplingGroupId: group.id,
        approvalVersion: group.approvalVersion || 1,
        signerRole: 'OTM',
        signerName: selectedOtmName,
        signerCompany: 'Lotus Comm DC OTM Team',
        signatureData: digitalStamp,
        signedAt: now,
        signedByUserId: currentUser?.id || null,
        isValid: true,
        syncStatus: 'SYNCED',
      };

      await db.signatureRecords.add(newSig);
      await db.samplingGroups.update(group.id, {
        workflowStatus: 'FULLY_SIGNED',
        updatedAt: now,
      });

      setIsApprovedSuccess(true);
      setTimeout(() => {
        navigate('/otm-queue');
      }, 1200);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกการอนุมัติ');
      setIsSubmitting(false);
    }
  };

  // Revoke OTM Approval Handler (in case approved before on-site was signed)
  const handleRevokeOtmApproval = async () => {
    if (!otmSig) return;
    const confirmRevoke = window.confirm(
      'คุณต้องการยกเลิกการอนุมัติ OTM ของ SKU นี้ เพื่อรอให้ฝ่ายหน้างาน (Vendor/Receive) ลงนามให้ครบถ้วนก่อนใช่หรือไม่?'
    );
    if (!confirmRevoke) return;

    try {
      setIsSubmitting(true);
      await db.signatureRecords.delete(otmSig.id);
      await db.samplingGroups.update(group.id, {
        workflowStatus: 'SAMPLING',
        updatedAt: new Date().toISOString(),
      });
      alert('ยกเลิกการอนุมัติ OTM เรียบร้อยแล้ว ระบบปรับสถานะกลับเป็นรอฝ่ายหน้างานลงนาม');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการยกเลิกการอนุมัติ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout title="อนุมัติ OTM" showBack backTo="/otm-queue">
      <div 
        style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom, 0px))' }}
        className="p-3.5 sm:p-6 space-y-4 max-w-3xl sm:max-w-4xl mx-auto text-[#1F1F1F] w-full overflow-x-hidden"
      >

        {/* ─── 1. ITEM Header & Context ────────────────────────────── */}
        <div className="bg-[#FFFDF9] rounded-3xl p-4.5 border border-[#E8E1D8] shadow-xs space-y-2.5">
          <div className="flex justify-between items-start">
            <span className="font-mono text-xs font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-lg border border-[#AEE0BD]">
              ITEM: {group.itemId}
            </span>
            <div className="flex gap-1.5">
              {isFocus && (
                <span className="bg-[#FEF9E7] text-[#9A7D0A] font-bold text-[10px] px-2 py-0.5 rounded-full border border-[#FAD7A0] flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  FOCUS ITEM
                </span>
              )}
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                group.samplingStatus === 'ชั่งครบ' ? 'bg-[#EAF7ED] text-[#12803C]' : 'bg-[#FDE8E8] text-[#E03131]'
              }`}>
                {group.samplingStatus}
              </span>
            </div>
          </div>

          <h3 className="font-black text-[#1F1F1F] text-base leading-snug break-words">
            {group.description}
          </h3>

          <div className="p-3 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-[#6E6E6E] block text-[10px]">ใบนัดหมาย (Appointment):</span>
              <span className="font-bold text-[#1F1F1F]">{group.apptNbr}</span>
            </div>
            <div>
              <span className="text-[#6E6E6E] block text-[10px]">เลขที่ PO:</span>
              <span className="font-bold text-[#1F1F1F]">{group.poNbr}</span>
            </div>
            <div>
              <span className="text-[#6E6E6E] block text-[10px]">ผู้ขาย (Vendor):</span>
              <span className="font-bold text-[#1F1F1F] block break-words">{group.vendorName}</span>
            </div>
            <div>
              <span className="text-[#6E6E6E] block text-[10px]">เกณฑ์มาตรฐาน (SP):</span>
              <span className="font-black text-[#12803C]">{group.spExpression || `${group.standardWeightKg} kg`}</span>
            </div>
          </div>
        </div>

        {/* ─── 2. Weight Results & Summary ────────────────────────── */}
        {summary && (
          <div className="bg-[#FFFDF9] rounded-3xl p-4.5 border border-[#E8E1D8] shadow-xs space-y-3">
            <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[#12803C]" />
              สรุปผลการสุ่มชั่งน้ำหนัก
            </h4>

            {/* Banner */}
            <div className={`p-3.5 rounded-2xl text-center border ${
              summary.result === 'PASS' 
                ? 'bg-[#EAF7ED] border-[#12803C] text-[#0B5E2B]' 
                : summary.differenceKg > 0 
                  ? 'bg-[#FEF9E7] border-[#F2C230] text-[#9A7D0A]'
                  : 'bg-[#FDE8E8] border-[#E03131] text-[#E03131]'
            }`}>
              <div className="text-base font-black">
                {summary.result === 'PASS' 
                  ? '✓ ผ่านเกณฑ์มาตรฐาน (น้ำหนักได้ตามเกณฑ์)' 
                  : summary.differenceKg > 0 
                    ? `⚠️ น้ำหนักเกินเกณฑ์ (+${summary.differencePercent}%)` 
                    : `✗ น้ำหนักขาดเกณฑ์ (${summary.differencePercent}%)`}
              </div>
              <p className="text-xs mt-0.5">
                เฉลี่ยสุทธิ: <b>{summary.averageNetKg} kg/กล่อง</b> · ผลต่างรวม: <b>{summary.differenceKg > 0 ? '+' : ''}{summary.differenceKg} kg</b>
              </p>
            </div>

            {/* Grid & Basket Details Dropdown */}
            {(() => {
              const itemNoun = (group.uda6 === 'O' || group.containerType === 'O') ? 'กล่อง' : 'ตะกร้า';
              return (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Left Box: Clickable to toggle Basket Breakdown Dropdown */}
                    <div 
                      onClick={() => setShowBasketBreakdown(prev => !prev)}
                      role="button"
                      tabIndex={0}
                      className="bg-[#F7F2EA] hover:bg-[#EAF7ED] p-2.5 rounded-xl border-2 border-[#E8E1D8] hover:border-[#12803C] transition-all cursor-pointer select-none group shadow-2xs active:scale-[0.98]"
                      title="แตะเพื่อเปิด/ปิดดูรายละเอียดน้ำหนักแต่ละตะกร้า"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[#6E6E6E] block text-[10px]">ตัวอย่างที่สุ่มชั่ง:</span>
                        <span className="text-[10px] text-[#12803C] font-black flex items-center gap-0.5 group-hover:underline">
                          {showBasketBreakdown ? 'ซ่อน' : 'กดดู'}
                          {showBasketBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-black text-[#1F1F1F] text-sm">
                          {measurements.length} / {group.requiredSamples} {itemNoun}
                        </span>
                        <span className="text-[10px] bg-[#12803C] text-white font-bold px-1.5 py-0.5 rounded shadow-2xs">
                          {showBasketBreakdown ? '▲ ปิด' : '▼ ดูรายชิ้น'}
                        </span>
                      </div>
                    </div>

                    {/* Right Box: Confirmed actual quantity */}
                    <div className="bg-[#F7F2EA] p-2.5 rounded-xl border border-[#E8E1D8]">
                      <span className="text-[#6E6E6E] block text-[10px]">จำนวนรับจริงยืนยัน:</span>
                      <span className="font-black text-[#1F1F1F] text-sm mt-0.5 block">
                        {group.confirmedActualQty || group.apptContQty} กล่อง
                      </span>
                    </div>
                  </div>

                  {/* ─── DROPDOWN: BREAKDOWN OF EACH BASKET / BOX ─────────── */}
                  {showBasketBreakdown && (
                    <div className="bg-[#FFFDF9] border-2 border-[#12803C] rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-md animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-[#E8E1D8] pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-[#0B5E2B]">
                          <Scale className="w-4 h-4 text-[#12803C]" />
                          <span>รายละเอียดน้ำหนักที่ชั่งจริงราย{itemNoun} ({measurements.length} {itemNoun}):</span>
                        </div>
                        <span className="text-[11px] text-[#6E6E6E] font-medium">
                          เกณฑ์มาตรฐาน: <b className="text-[#1F1F1F]">{group.spExpression || `${group.standardWeightKg} kg`}</b>
                        </span>
                      </div>

                      {measurements.length === 0 ? (
                        <p className="text-xs text-[#6E6E6E] text-center py-2">ยังไม่มีประวัติการบันทึกน้ำหนัก</p>
                      ) : (
                        <div className="space-y-2">
                          {measurements.map((m, idx) => {
                            const basketLabel = m.basketCode === 'O' 
                              ? `กล่อง/ภาชนะ O (${m.tareWeightKg} kg)`
                              : `ตะกร้า ${m.basketCode} (${m.tareWeightKg} kg)`;

                            const std = group.standardWeightKg;
                            const diffKg = std ? m.netWeightKg - std : null;
                            const diffPct = std && std > 0 ? ((m.netWeightKg - std) / std) * 100 : null;

                            return (
                              <div 
                                key={m.id || idx}
                                className="p-2.5 bg-[#F7F2EA] rounded-xl border border-[#E8E1D8] flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-lg bg-[#12803C] text-white font-black text-xs flex items-center justify-center shrink-0">
                                    {m.sampleNumber || idx + 1}
                                  </span>
                                  <div>
                                    <span className="font-bold text-[#1F1F1F]">
                                      {itemNoun}ที่ {m.sampleNumber || idx + 1}:
                                    </span>
                                    <span className="text-[#6E6E6E] ml-1.5 text-[11px]">
                                      (รวม {m.grossWeightKg} kg − หัก {basketLabel})
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-sm font-black text-[#12803C] bg-[#EAF7ED] px-2.5 py-0.5 rounded-lg border border-[#AEE0BD]">
                                    สุทธิ {m.netWeightKg.toFixed(2)} kg
                                  </span>
                                  {diffPct !== null && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      Math.abs(diffPct) <= 10
                                        ? 'bg-[#EAF7ED] text-[#12803C]'
                                        : diffPct > 10
                                        ? 'bg-[#FEF9E7] text-[#9A7D0A]'
                                        : 'bg-[#FDE8E8] text-[#E03131]'
                                    }`}>
                                      {diffKg! > 0 ? `+${diffKg!.toFixed(2)} kg` : `${diffKg!.toFixed(2)} kg`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Summary in dropdown */}
                          <div className="pt-2 border-t border-[#E8E1D8] flex justify-between items-center text-xs font-bold text-[#1F1F1F]">
                            <span className="text-[#6E6E6E]">น้ำหนักเฉลี่ยสุทธิ ({measurements.length} {itemNoun}):</span>
                            <span className="text-sm font-black text-[#12803C]">
                              {summary.averageNetKg} kg / {itemNoun}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Lotus CN Breakdown if underweight */}
            {summary.result === 'FAIL' && summary.differenceKg < 0 && (() => {
              const totalCases = group.confirmedActualQty || group.apptContQty || 0;
              const cnCalc = calculateCN(group.standardWeightKg || 0, summary.averageNetKg, totalCases);
              return (
                <div className="p-3 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[#F76707]">📋 เอกสารออก CN (Lotus's SRRDC):</span>
                    <span className="bg-[#E03131] text-white font-black px-2 py-0.5 rounded text-[11px]">
                      ยอด CN: {cnCalc.cnTotalKg} kg
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6E6E6E]">
                    คำนวณ: ({cnCalc.standardWeightKg} − {cnCalc.actualAverageNetKg}) × {cnCalc.totalActualCases} กล่อง = <b>{cnCalc.cnTotalKg} kg</b>
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── 3. Verification of On-Site Signatures ───────────────── */}
        <div className="bg-[#FFFDF9] rounded-3xl p-4.5 border border-[#E8E1D8] shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-[#12803C]" />
              สถานะการลงนามฝ่ายหน้างาน
            </h4>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              hasRequiredOnsiteSigs ? 'bg-[#EAF7ED] text-[#12803C]' : 'bg-[#FEF9E7] text-[#9A7D0A]'
            }`}>
              {hasRequiredOnsiteSigs ? '✓ หน้างานเซ็นครบแล้ว' : '⚠️ ยังเซ็นไม่ครบ'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Vendor */}
            <div className="p-3 bg-[#F7F2EA] rounded-xl border border-[#E8E1D8] space-y-1.5">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-bold text-[#1F1F1F] block">1. ผู้แทน Vendor:</span>
                  <span className="text-[11px] text-[#6E6E6E]">{vendorSig ? vendorSig.signerName : 'ยังไม่ลงนาม'}</span>
                </div>
                <span className={`font-bold text-[11px] ${vendorSig ? 'text-[#12803C]' : 'text-[#6E6E6E]'}`}>
                  {vendorSig ? '✓ เซ็นแล้ว' : 'รอดำเนินการ'}
                </span>
              </div>
              {vendorSig?.signatureData && (
                <div className="mt-1 bg-white p-2 rounded-lg border border-[#AEE0BD] inline-flex items-center gap-2">
                  <span className="text-[10px] text-[#6E6E6E] font-bold">ลายเซ็นจริง:</span>
                  <img src={vendorSig.signatureData} alt="Vendor Signature" className="h-9 object-contain" />
                </div>
              )}
            </div>

            {/* Receive */}
            <div className="p-3 bg-[#F7F2EA] rounded-xl border border-[#E8E1D8] space-y-1.5">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-bold text-[#1F1F1F] block">2. พนักงานตรวจรับ (Receive):</span>
                  <span className="text-[11px] text-[#6E6E6E]">{receiveSig ? receiveSig.signerName : 'ยังไม่ลงนาม'}</span>
                </div>
                <span className={`font-bold text-[11px] ${receiveSig ? 'text-[#12803C]' : 'text-[#6E6E6E]'}`}>
                  {receiveSig ? '✓ เซ็นแล้ว' : 'รอดำเนินการ'}
                </span>
              </div>
              {receiveSig?.signatureData && (
                <div className="mt-1 bg-white p-2 rounded-lg border border-[#AEE0BD] inline-flex items-center gap-2">
                  <span className="text-[10px] text-[#6E6E6E] font-bold">ลายเซ็นจริง:</span>
                  <img src={receiveSig.signatureData} alt="Receive Signature" className="h-9 object-contain" />
                </div>
              )}
            </div>

            {/* DC S&LP (Only if Focus) */}
            {isFocus && (
              <div className="p-3 bg-[#F7F2EA] rounded-xl border border-[#E8E1D8] space-y-1.5">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[#1F1F1F] block">3. DC S&LP Supervisor (สินค้า Focus):</span>
                    <span className="text-[11px] text-[#6E6E6E]">{lpsSig ? lpsSig.signerName : 'ยังไม่ลงนาม'}</span>
                  </div>
                  <span className={`font-bold text-[11px] ${lpsSig ? 'text-[#12803C]' : 'text-[#E03131]'}`}>
                    {lpsSig ? '✓ เซ็นแล้ว' : 'รอลงนาม'}
                  </span>
                </div>
                {lpsSig?.signatureData && (
                  <div className="mt-1 bg-white p-2 rounded-lg border border-[#AEE0BD] inline-flex items-center gap-2">
                    <span className="text-[10px] text-[#6E6E6E] font-bold">ลายเซ็นจริง:</span>
                    <img src={lpsSig.signatureData} alt="LP&S Signature" className="h-9 object-contain" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── 4. OTM 1-Button Fast Approval Box ───────────────────── */}
        <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#E8E1D8] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-[#12803C]" />
              การอนุมัติปล่อยผ่านโดยผู้จัดการ OTM
            </h4>
            {otmSig && (
              <span className="bg-[#EAF7ED] text-[#12803C] font-black text-xs px-2.5 py-0.5 rounded-full border border-[#AEE0BD]">
                ✓ อนุมัติแล้ว
              </span>
            )}
          </div>

          {otmSig ? (
            <div className="p-4 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[#12803C] mx-auto" />
              <div className="font-black text-[#0B5E2B] text-base">
                รายการนี้ได้รับการอนุมัติโดย OTM เรียบร้อยแล้ว
              </div>
              <p className="text-xs text-[#12803C]">
                ผู้จัดการ OTM: <b>{otmSig.signerName}</b> · เวลา: {new Date(otmSig.signedAt).toLocaleString('th-TH')}
              </p>
              {otmSig.signatureData && (
                <div className="mt-2 bg-white p-2 rounded-xl border border-[#AEE0BD] inline-block shadow-xs">
                  <img src={otmSig.signatureData} alt="OTM Digital Seal" className="h-16 mx-auto object-contain" />
                </div>
              )}

              {/* Notice if onsite signatures were not signed before approval */}
              {!hasRequiredOnsiteSigs && canApprove && (
                <div className="mt-3 p-3 bg-[#FFF0E6] border border-[#FFD8BF] rounded-xl text-left space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#E03131] font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-[#E03131]" />
                    <span>⚠️ รายการนี้อนุมัติก่อนที่ฝ่ายหน้างานจะลงนามครบถ้วน</span>
                  </div>
                  <p className="text-[#6E6E6E] text-[11px] leading-relaxed">
                    ตรวจพบว่าผู้แทน Vendor หรือฝ่ายตรวจรับยังไม่ได้ลงนาม หากต้องการให้ฝ่ายหน้างานลงนามก่อน สามารถกดยกเลิกการอนุมัติ OTM ชั่วคราวได้
                  </p>
                  <button
                    type="button"
                    onClick={handleRevokeOtmApproval}
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-3 bg-[#E03131] hover:bg-[#C92A2A] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer disabled:opacity-50"
                  >
                    <span>ถอนการอนุมัติ OTM ชั่วคราว (รอหน้างานลงนามก่อน)</span>
                  </button>
                </div>
              )}
            </div>
          ) : !hasRequiredOnsiteSigs ? (
            /* STRICT LOCK: DO NOT SHOW APPROVAL BUTTON AT ALL IF VENDOR OR RECEIVE HAVEN'T SIGNED */
            <div className="p-4.5 bg-[#FEF9E7] border-2 border-[#FAD7A0] rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-[#9A7D0A] font-black text-sm">
                <Lock className="w-5 h-5 text-[#E03131]" />
                <span>ยังไม่สามารถอนุมัติได้ (รอหน้างานลงนามให้ครบก่อน)</span>
              </div>
              <p className="text-xs text-[#6E6E6E] leading-relaxed">
                ตามระเบียบ Lotus's SRRDC ผู้จัดการ OTM จะสามารถตรวจสอบและกดอนุมัติได้ <strong>หลังจากที่ผู้แทน Vendor และพนักงานตรวจรับ (Receive) {isFocus ? 'รวมถึงเจ้าหน้าที่ LP&S (สินค้า Focus)' : ''} ได้ลงนามรับรองผลหน้างานเรียบร้อยแล้วเท่านั้น</strong>
              </p>

              <div className="bg-white/80 p-3 rounded-xl border border-[#FAD7A0] space-y-1.5 text-xs">
                <div className="font-bold text-[#1F1F1F]">สถานะการลงนามหน้างานที่ต้องรอ:</div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span>1. ผู้แทน Vendor:</span>
                    <span className={vendorSig ? 'text-[#12803C] font-bold' : 'text-[#E03131] font-bold'}>
                      {vendorSig ? '✓ เซ็นแล้ว' : '✗ ยังไม่ลงนาม'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>2. พนักงานตรวจรับ (Receive):</span>
                    <span className={receiveSig ? 'text-[#12803C] font-bold' : 'text-[#E03131] font-bold'}>
                      {receiveSig ? '✓ เซ็นแล้ว' : '✗ ยังไม่ลงนาม'}
                    </span>
                  </div>
                  {isFocus && (
                    <div className="flex items-center justify-between">
                      <span>3. DC S&LP Supervisor (Focus):</span>
                      <span className={lpsSig ? 'text-[#12803C] font-bold' : 'text-[#E03131] font-bold'}>
                        {lpsSig ? '✓ เซ็นแล้ว' : '✗ ยังไม่ลงนาม'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-[#9A7D0A] bg-amber-100/60 p-2.5 rounded-xl flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#9A7D0A]" />
                <span>ระบบจะไม่แสดงปุ่มอนุมัติ จนกว่าฝ่ายหน้างานจะลงนามครบถ้วนตามขั้นตอน</span>
              </div>
            </div>
          ) : !canApprove ? (
            /* Permission Guard */
            <div className="p-4 bg-[#FEF9E7] border border-[#FAD7A0] rounded-2xl space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#9A7D0A] font-bold">
                <Lock className="w-4 h-4 text-[#E03131]" />
                <span>จำกัดสิทธิ์เฉพาะฝ่าย OTM เท่านั้น (OTM Role Required)</span>
              </div>
              <p className="text-[#6E6E6E] leading-relaxed">
                ระบบตรวจพบบัญชีของคุณคือ: <b>{currentUser?.fullName || 'ผู้ใช้งาน'}</b> (สิทธิ์: <b>{currentUser?.role || 'RECEIVE'}</b>)
                <br />
                <span className="text-[#E03131] font-bold">ฝ่ายอื่นไม่สามารถลงชื่อหรืออนุมัติแทนผู้จัดการ OTM ได้</span>
              </p>
            </div>
          ) : (
            /* ONLY SHOWN WHEN BOTH VENDOR AND RECEIVE ARE SIGNED! */
            <div className="space-y-4 animate-fadeIn">
              {/* Officer Selection (Saved Once) */}
              <div className="bg-[#F7F2EA] p-3.5 rounded-2xl border border-[#E8E1D8] space-y-1.5">
                <label className="text-xs font-bold text-[#1F1F1F] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-4 h-4 text-[#12803C]" />
                    ผู้จัดการ OTM ปฏิบัติหน้าที่:
                  </span>
                  <span className="text-[10px] text-[#12803C] font-bold bg-[#EAF7ED] px-2 py-0.5 rounded-full border border-[#AEE0BD]">
                    {isOtm ? 'ยืนยันตัวตนแล้ว' : 'จำชื่อให้อัตโนมัติ'}
                  </span>
                </label>

                {isOtm ? (
                  <div className="p-2.5 bg-white rounded-xl border border-[#AEE0BD] font-bold text-xs text-[#0B5E2B] flex items-center justify-between">
                    <span>{currentUser?.fullName} (รหัส {currentUser?.empId})</span>
                    <span className="text-[10px] bg-[#EAF7ED] px-2 py-0.5 rounded-md font-bold">OTM Officer</span>
                  </div>
                ) : (
                  <select
                    value={selectedOtmName}
                    onChange={(e) => handleOtmNameChange(e.target.value)}
                    className="w-full bg-[#FFFDF9] border border-[#12803C] rounded-xl px-3 py-2.5 text-xs font-bold text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer shadow-xs"
                  >
                    <option value="">-- เลือกชื่อผู้จัดการ OTM (7 รายชื่อ) --</option>
                    {otmRoster.map(o => (
                      <option key={o.empId} value={o.fullName}>
                        {o.fullName} (รหัส {o.empId})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-[#6E6E6E]">
                  💡 เลือกรอบเดียว ระบบจะจดจำชื่อนี้สำหรับทุก ITEM ในคิว OTM โดยไม่ต้องเลือกซ้ำ
                </p>
              </div>

              {/* 1-Tap Big Approval Button */}
              <button
                type="button"
                onClick={handleQuickApprove}
                disabled={!selectedOtmName || isSubmitting}
                className="w-full py-4 px-6 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] bg-[#12803C] hover:bg-[#0B5E2B] text-white cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  'กำลังบันทึกการอนุมัติ...' 
                ) : isApprovedSuccess ? (
                  'อนุมัติเรียบร้อยแล้ว ✓'
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>ยืนยันอนุมัติผลสุ่มชั่ง ITEM นี้ (1-Tap Approve)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
