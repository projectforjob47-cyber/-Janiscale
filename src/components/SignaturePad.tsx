// ============================================================
// SMART DC — SignaturePad Component
// Mobile touch-friendly canvas signature pad
// Supports touch and mouse drawing, clear, and save as PNG base64
// ============================================================

import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check, PenTool } from 'lucide-react';

interface Props {
  roleTitle: string;
  signerName: string;
  onConfirm: (signatureData: string) => void;
  isConfirmed?: boolean;
  disabled?: boolean;
  existingSignature?: string | null;
  signedAt?: string | null;
  onReset?: () => void;
}

export default function SignaturePad({
  roleTitle,
  signerName,
  onConfirm,
  isConfirmed = false,
  disabled = false,
  existingSignature = null,
  signedAt = null,
  onReset,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI screens
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B5E2B'; // Deep forest green stroke
    ctx.lineWidth = 2.5;
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled || isConfirmed) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled || isConfirmed) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl);
  };

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      isConfirmed
        ? 'bg-[#EAF7ED] border-[#AEE0BD]'
        : disabled
        ? 'bg-[#F1EFEA] border-[#E8E1D8] opacity-60'
        : 'bg-[#FFFDF9] border-[#E8E1D8] shadow-xs'
    }`}>
      <div className="flex flex-wrap sm:flex-nowrap justify-between items-start sm:items-center gap-1.5 mb-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-[#6E6E6E] uppercase tracking-wider block">
            {roleTitle}
          </span>
          <span className="font-bold text-[#1F1F1F] text-sm break-words">
            {signerName || 'กรุณาระบุชื่อผู้ลงนาม'}
          </span>
        </div>

        {isConfirmed ? (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#12803C] text-white flex items-center gap-1 shadow-xs shrink-0 self-start sm:self-auto">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            ลงนามแล้ว
          </span>
        ) : (
          <span className="text-xs text-[#9A7D0A] font-semibold bg-[#FEF9E7] border border-[#FAD7A0] px-2 py-0.5 rounded-md shrink-0 self-start sm:self-auto">
            รอลายเซ็น
          </span>
        )}
      </div>

      {/* ─── SHOW CONFIRMED SIGNATURE EVIDENCE ─── */}
      {isConfirmed && existingSignature && (
        <div className="mt-2.5 space-y-2">
          <div className="bg-white rounded-xl border border-[#AEE0BD] p-3 flex flex-col items-center justify-center shadow-xs">
            <div className="text-[10px] font-bold text-[#12803C] uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>ภาพลายมือชื่อที่บันทึกเข้าระบบ:</span>
            </div>
            <img 
              src={existingSignature} 
              alt={`ลายเซ็น ${roleTitle}`} 
              className="max-h-24 max-w-full object-contain filter drop-shadow-xs" 
            />
            {signedAt && (
              <span className="text-[11px] text-[#6E6E6E] mt-1.5 font-medium">
                ลงนามเมื่อ: {new Date(signedAt).toLocaleString('th-TH')}
              </span>
            )}
          </div>
          {onReset && !disabled && (
            <div className="flex justify-end pt-0.5">
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] font-bold text-[#6E6E6E] hover:text-[#C92A2A] underline cursor-pointer transition-colors"
              >
                ✏️ ต้องการเซ็นใหม่ / แก้ไขลายเซ็น
              </button>
            </div>
          )}
        </div>
      )}

      {!isConfirmed && (
        <>
          <div className="relative mt-2">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className={`w-full h-32 bg-white rounded-xl border border-dashed border-[#AEE0BD] touch-none cursor-crosshair ${
                disabled ? 'pointer-events-none' : ''
              }`}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[#6E6E6E]/50 text-xs gap-1.5">
                <PenTool className="w-4 h-4 text-[#12803C]/40" />
                <span>ใช้นิ้วเซ็นลายมือชื่อในกรอบนี้</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || !hasDrawn}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#F7F2EA] text-[#6E6E6E] border border-[#E8E1D8] hover:bg-[#EFD9A7]/40 flex items-center justify-center gap-1 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ล้างลายเซ็น
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || !hasDrawn || !signerName.trim()}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#12803C] text-white hover:bg-[#0B5E2B] shadow-xs flex items-center justify-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              ยืนยันลายเซ็น
            </button>
          </div>
        </>
      )}
    </div>
  );
}
