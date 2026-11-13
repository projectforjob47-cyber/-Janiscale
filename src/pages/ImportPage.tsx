// ============================================================
// SMART DC — ImportPage Component
// V3.0 Final Master Design: Daily Appointment Excel Import
// Modern Subway Green (#12803C) & Warm Cream (#F7F2EA)
// Reads prt26 sheet, filters CATCH_WEIGHT, auto-matches Focus items
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
  Trash2,
  History,
  Clock,
  Check,
} from 'lucide-react';
import { importExcelFile } from '../lib/excelImport';
import { db, deleteImportBatch, cleanDuplicateAppointments, deleteAppointmentsByReceiveDate } from '../lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '../stores/authStore';
import * as XLSX from 'xlsx';
import { extractDateFromApptTime, formatThaiDate } from '../lib/dateUtils';

export default function ImportPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();

  // Appointment Excel state
  const [file, setFile] = useState<File | null>(null);
  const [receiveDate, setReceiveDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [detectedFileDate, setDetectedFileDate] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Live Batches & Duplicates
  const batches = useLiveQuery(() => db.importBatches.orderBy('uploadedAt').reverse().toArray(), []) ?? [];
  const apptsCount = useLiveQuery(() => db.appointments.count(), []) ?? 0;
  const batchApptsSum = batches.reduce((acc, b) => acc + (b.appointmentCount || 0), 0);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setError('กรุณาเลือกไฟล์ Excel นามสกุล .xlsx หรือ .xls เท่านั้น');
      return;
    }
    setFile(selectedFile);
    setError(null);

    // Auto-detect date directly from the Excel file prt26 (Authoritative file date)
    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', sheets: ['prt26'], sheetRows: 30 });
      const sheet = wb.Sheets['prt26'];
      if (sheet) {
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        for (let i = 1; i < rows.length; i++) {
          const rawApptTime = rows[i]?.[3]; // Col D: Appt_time
          const fileDate = extractDateFromApptTime(rawApptTime);
          if (fileDate) {
            setReceiveDate(fileDate);
            setDetectedFileDate(fileDate);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Could not auto-preview date from excel:', err);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('กรุณาเลือกไฟล์ Excel (.xlsx)');
      return;
    }

    setIsImporting(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await importExcelFile(file, currentUser?.fullName || 'Admin', receiveDate, { replaceExisting });
      setResult(res);
      setActionMessage(`✓ นำเข้าไฟล์ "${file.name}" สำเร็จเรียบร้อย! กำลังซิงค์ข้อมูลขึ้นระบบคลาวด์เพื่อกระจายไปยังมือถือทุกเครื่อง...`);
      
      // Ensure cloud push is fully completed before navigating
      try {
        const { pushFullStateToServer } = await import('../lib/syncEngine');
        await pushFullStateToServer();
      } catch (sErr) {
        console.warn('Sync push warning:', sErr);
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error('[ImportPage] error:', err);
      const msg = err?.message || '';
      if (msg.includes('FILE_ERROR_NO_SPACE') || msg.includes('NO_SPACE') || msg.includes('quota')) {
        setError('พื้นที่ความจุในไดรฟ์ C: หรือในเบราว์เซอร์เต็ม (FILE_ERROR_NO_SPACE) กรุณาล้างถังขยะ (Recycle Bin) หรือลบไฟล์ในไดรฟ์ C: เพื่อเพิ่มพื้นที่ว่างอย่างน้อย 1-2 GB แล้วลองใหม่อีกครั้งครับ');
      } else {
        setError(msg || 'เกิดข้อผิดพลาดในการนำเข้าไฟล์ ตรวจสอบว่ามีชีต prt26 หรือไม่');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteBatch = async (batchId: string, filename: string) => {
    if (!window.confirm(`คุณต้องการนำไฟล์ "${filename}" และข้อมูลใบนัดหมายทั้งหมดของไฟล์นี้ออกใช่หรือไม่?`)) {
      return;
    }
    setError(null);
    try {
      const { deletedAppts, deletedGroups } = await deleteImportBatch(batchId);
      setActionMessage(`นำไฟล์ "${filename}" ออกเรียบร้อยแล้ว (ลบใบนัดหมาย ${deletedAppts} ใบ, สินค้า ${deletedGroups} รายการ)`);
      setResult(null);
    } catch (err: any) {
      setError(`ไม่สามารถลบไฟล์ได้: ${err?.message}`);
    }
  };


  return (
    <Layout title="นำเข้าไฟล์" showBack backTo="/dashboard">
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-28 text-[#1F1F1F]">

        {/* HERO HEADER */}
        <div className="bg-gradient-to-br from-[#12803C] to-[#0B5E2B] text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
          <div className="relative z-10 space-y-1.5">
            <span className="inline-block bg-[#EFD9A7] text-[#0B5E2B] text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Admin & Supervisor Portal
            </span>
            <h2 className="text-xl font-black leading-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-[#EFD9A7]" />
              นำเข้าไฟล์ใบนัดหมาย (วันใหม่)
            </h2>
            <p className="text-xs text-white/80 leading-relaxed">
              อัปโหลดไฟล์ Excel เพื่อสร้างใบนัดหมาย, PO, และ SKU สำหรับงานตรวจรับสินค้าสดประจำวัน
            </p>
          </div>
        </div>

        {/* UPLOAD FORM CARD */}
        <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#E8E1D8] shadow-xs space-y-4">
          <div className="space-y-3.5">
            {/* 1. Receive Date */}
            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <label className="text-xs font-bold text-[#1F1F1F] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#12803C]" />
                  วันที่รับสินค้าประจำวัน (Receive Date):
                </label>
                {detectedFileDate && (
                  <span className="text-[11px] font-black text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#AEE0BD] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-[#12803C]" />
                    ยึดตามไฟล์ Excel: {formatThaiDate(detectedFileDate)}
                  </span>
                )}
              </div>
              <input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                className="w-full text-xs font-bold p-3 border-2 border-[#12803C] rounded-2xl focus:outline-none bg-[#FFFDF9] text-[#1F1F1F] shadow-xs cursor-pointer"
              />
            </div>

                {/* 2. Drag & Drop File Zone */}
                <div>
                  <label className="text-xs font-bold text-[#1F1F1F] block mb-1.5 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-[#12803C]" />
                    เลือกไฟล์ใบนัดหมาย Excel (.xlsx):
                  </label>

                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileChange(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => document.getElementById('excel-file-input')?.click()}
                    className={`p-6 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-[#12803C] bg-[#EAF7ED]'
                        : file
                        ? 'border-[#12803C] bg-[#EAF7ED]/40'
                        : 'border-[#E8E1D8] bg-[#F7F2EA] hover:border-[#12803C]'
                    }`}
                  >
                    <input
                      id="excel-file-input"
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={(e) => e.target.files && e.target.files[0] && handleFileChange(e.target.files[0])}
                      className="hidden"
                    />

                    <div className="w-12 h-12 rounded-2xl bg-white border border-[#E8E1D8] flex items-center justify-center mx-auto mb-2.5 shadow-xs">
                      <FileSpreadsheet className="w-6 h-6 text-[#12803C]" />
                    </div>

                    {file ? (
                      <div>
                        <span className="font-black text-xs text-[#12803C] block">{file.name}</span>
                        <span className="text-[11px] text-[#6E6E6E]">
                          {(file.size / 1024).toFixed(1)} KB · แตะเพื่อเปลี่ยนไฟล์
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold text-xs text-[#1F1F1F] block">
                          ลากไฟล์มาวางที่นี่ หรือ แตะเพื่อเลือกไฟล์
                        </span>
                        <span className="text-[11px] text-[#6E6E6E]">รองรับไฟล์ Excel .xlsx ที่มีชีต prt26</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Import Mode Selection */}
                <div className="p-3 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] space-y-2">
                  <span className="text-xs font-bold text-[#1F1F1F] block">
                    การจัดการข้อมูลเดิมในระบบ:
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <label className={`flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all ${
                      replaceExisting ? 'bg-[#EAF7ED] border-[#AEE0BD]' : 'bg-white border-[#E8E1D8]'
                    }`}>
                      <input
                        type="radio"
                        name="importMode"
                        checked={replaceExisting}
                        onChange={() => setReplaceExisting(true)}
                        className="mt-0.5 text-[#12803C] focus:ring-[#12803C]"
                      />
                      <div>
                        <span className="font-bold text-[#0B5E2B] block">แทนที่ข้อมูลเดิม / เริ่มต้นไฟล์วันใหม่ (แนะนำ)</span>
                        <span className="text-[11px] text-[#0B5E2B]/80 block leading-snug">
                          แนะนำสำหรับวันใหม่: ล้างประวัติการชั่ง ลายเซ็น และเคส CN เดิมออกทั้งหมด เพื่อเริ่มต้นรอบวันใหม่เป็น "รอชั่ง" อัตโนมัติทั้งแอป 100%
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all ${
                      !replaceExisting ? 'bg-[#EAF7ED] border-[#AEE0BD]' : 'bg-white border-[#E8E1D8]'
                    }`}>
                      <input
                        type="radio"
                        name="importMode"
                        checked={!replaceExisting}
                        onChange={() => setReplaceExisting(false)}
                        className="mt-0.5 text-[#12803C] focus:ring-[#12803C]"
                      />
                      <div>
                        <span className="font-bold text-[#1F1F1F] block">เพิ่มต่อท้าย (ไม่ลบของเดิม)</span>
                        <span className="text-[11px] text-[#6E6E6E] block leading-snug">
                          เพิ่มเฉพาะรายการใหม่ และข้ามรายการ/ใบนัดหมายที่ซ้ำกันอัตโนมัติ
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="p-3.5 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl text-xs text-[#E03131] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {actionMessage && (
                  <div className="p-3.5 bg-[#EAF7ED] border border-[#AEE0BD] rounded-2xl text-xs text-[#0B5E2B] flex items-start gap-2 animate-fadeIn font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-[#12803C] shrink-0 mt-0.5" />
                    <span>{actionMessage}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleImport}
                  disabled={isImporting || !file}
                  className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  {isImporting ? 'กำลังประมวลผลไฟล์...' : 'เริ่มการนำเข้าใบนัดหมายวันใหม่'}
                </button>
              </div>
            </div>

            {/* ─── IMPORTED BATCHES & FILE HISTORY (จัดการไฟล์ที่เคยนำเข้า) ─── */}
            <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#E8E1D8] shadow-xs space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h3 className="font-black text-sm text-[#1F1F1F] flex items-center gap-1.5">
                    <History className="w-4 h-4 text-[#12803C]" />
                    <span>ประวัติไฟล์ใบนัดหมายในระบบ ({batches.length} ไฟล์)</span>
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[#6E6E6E]">
                      ใบนัดหมายทั้งหมดในระบบ: <b>{apptsCount}</b> ใบ
                    </span>
                    {batches.length > 0 && apptsCount === batchApptsSum && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded-full border border-[#C3E6CD]">
                        <CheckCircle2 className="w-3 h-3" />
                        ตรงกับไฟล์จริง 100%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {batches.length === 0 ? (
                <div className="p-6 text-center bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] text-xs text-[#6E6E6E]">
                  ยังไม่มีประวัติการนำเข้าไฟล์ในระบบ
                </div>
              ) : (
                <div className="space-y-2.5">
                  {batches.map((b) => (
                    <div 
                      key={b.id}
                      className="p-3.5 bg-[#F7F2EA] rounded-2xl border border-[#E8E1D8] flex flex-wrap justify-between items-center gap-2.5"
                    >
                      <div className="space-y-1 flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-[#12803C] shrink-0" />
                          <span className="font-black text-xs text-[#1F1F1F] break-all">
                            {b.filename}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6E6E6E]">
                          <span>วันที่รับ: <b className="text-[#12803C]">{formatThaiDate(b.receiveDate)}</b></span>
                          <span>ใบนัดหมาย: <b className="text-[#1F1F1F]">{b.appointmentCount} ใบ</b></span>
                          <span>CW: <b className="text-[#12803C]">{b.catchWeightRows} รายการ</b></span>
                        </div>
                        <div className="text-[10px] text-[#8C827A] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#8C827A]" />
                          <span>นำเข้าเมื่อ: {new Date(b.uploadedAt).toLocaleString('th-TH')} ({b.uploadedBy})</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(b.id, b.filename)}
                        className="bg-[#FFF0E6] hover:bg-[#FFE3D4] border border-[#FFD8BF] text-[#E03131] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
                        title="นำไฟล์นี้และข้อมูลใบนัดหมายออก"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#E03131]" />
                        <span>นำไฟล์นี้ออก</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RESULT SUMMARY */}
            {result && (
              <div className="bg-[#FFFDF9] rounded-3xl p-5 border border-[#AEE0BD] shadow-md space-y-3.5 animate-fadeIn">
                <div className="flex items-center gap-2 text-[#0B5E2B] font-black text-sm">
                  <CheckCircle2 className="w-5 h-5 text-[#12803C]" />
                  <span>นำเข้าใบนัดหมายสำเร็จเรียบร้อย!</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[11px]">แถวทั้งหมดในชีต:</span>
                    <span className="font-bold text-[#1F1F1F] text-base">{result.batch.totalRowsRead}</span>
                  </div>
                  <div className="bg-[#EAF7ED] p-3 rounded-2xl border border-[#AEE0BD]">
                    <span className="text-[#0B5E2B] block text-[11px] font-bold">CATCH_WEIGHT ที่ต้องชั่ง:</span>
                    <span className="font-black text-[#12803C] text-base">{result.batch.catchWeightRows} รายการ</span>
                  </div>
                  <div className="bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[11px]">สินค้าอื่น/ยกเว้น (FZ & SP1):</span>
                    <span className="font-bold text-[#1F1F1F] text-base">{result.batch.excludedRows}</span>
                  </div>
                  <div className="bg-[#EAF7ED] p-3 rounded-2xl border border-[#AEE0BD]">
                    <span className="text-[#0B5E2B] block text-[11px] font-bold">ใบนัดหมายที่สร้าง:</span>
                    <span className="font-black text-[#12803C] text-base">{result.appointments.length} ใบ</span>
                  </div>
                </div>

                <p className="text-[11px] text-[#0B5E2B] bg-[#EAF7ED] p-2.5 rounded-xl border border-[#AEE0BD]">
                  ✓ คัดกรองตามเกณฑ์มาตรฐาน: ยกเว้นงาน FZ21 / FZ และสินค้า SP1_2KG, SP1_2_, SP1_6 (ไม่นำเข้าคิวชั่ง)
                </p>

                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <span>ไปที่หน้าแดชบอร์ด เพื่อเริ่มการสุ่มชั่ง</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

      </div>

      {/* ─── IMPORT PROCESSING OVERLAY MODAL ─── */}
      {isImporting && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FFFDF9] rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center space-y-4 shadow-2xl border-2 border-[#12803C]">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#EAF7ED] flex items-center justify-center border-2 border-[#AEE0BD] shadow-inner">
              <div className="animate-spin w-8 h-8 border-3 border-[#12803C] border-t-transparent rounded-full" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-base text-[#1F1F1F]">กำลังประมวลผลไฟล์ Excel</h3>
              <p className="text-xs text-[#6E6E6E] leading-relaxed">
                กำลังอ่านข้อมูลชีต prt26 และแยกใบนัดหมาย... กรุณารอสักครู่ (ระบบจะพาไปหน้าหลักทันทีเมื่อเสร็จ)
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
