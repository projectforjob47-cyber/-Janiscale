// ============================================================
// SMART DC — StatusBadge Component
// Reusable colored badge for all status enums
// ============================================================

import React from 'react';
import type { SamplingStatus, DeliveryStatus, WorkflowStatus, CNStatus } from '../types/index';

interface Props {
  status: SamplingStatus | DeliveryStatus | WorkflowStatus | CNStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
}

const STATUS_MAP: Record<string, BadgeStyle> = {
  // SamplingStatus
  'รอชั่ง':    { bg: 'bg-[#FEF9E7]',  text: 'text-[#9A7D0A]',  border: 'border-[#FAD7A0]',  label: 'รอชั่ง' },
  'ชั่งครบ':   { bg: 'bg-[#EAF7ED]',  text: 'text-[#12803C]',  border: 'border-[#AEE0BD]',  label: 'ชั่งครบ' },
  'ผิดเกณฑ์':  { bg: 'bg-[#FDE8E8]',  text: 'text-[#E03131]',  border: 'border-[#F8B4B4]',  label: 'ผิดเกณฑ์' },
  'น้ำหนักเกิน':{ bg: 'bg-[#FEF9E7]', text: 'text-[#9A7D0A]',  border: 'border-[#FAD7A0]',  label: 'น้ำหนักเกิน' },
  'ไม่มาตามแผน':{ bg: 'bg-[#FFF0E6]', text: 'text-[#D9480F]',  border: 'border-[#FFD8BF]',  label: 'ไม่มาตามแผน' },
  'ไม่มาส่ง':  { bg: 'bg-[#FFF0E6]', text: 'text-[#D9480F]',  border: 'border-[#FFD8BF]',  label: 'ไม่มาตามแผน' },

  // FocusStatus
  'FOCUS':                        { bg: 'bg-[#EAF7ED]',  text: 'text-[#12803C]',  border: 'border-[#12803C]',  label: 'FOCUS' },
  'NON_FOCUS':                    { bg: 'bg-[#F1EFEA]',  text: 'text-[#6E6E6E]',  border: 'border-[#E8E1D8]',  label: 'ทั่วไป' },
  'PENDING_FOCUS_VERIFICATION':   { bg: 'bg-[#FEF9E7]',  text: 'text-[#B7791F]',  border: 'border-[#FBD38D]',  label: 'รอตรวจ Focus' },

  // DeliveryStatus
  'NORMAL':                              { bg: 'bg-[#F1EFEA]',  text: 'text-[#6E6E6E]',  border: 'border-[#E8E1D8]',  label: 'ปกติ' },
  'PARTIAL_DELIVERY':                    { bg: 'bg-[#FFF0E6]', text: 'text-[#F76707]', border: 'border-[#FFD8BF]', label: 'ส่งไม่ครบ' },
  'NOT_DELIVERED':                       { bg: 'bg-[#FDE8E8]', text: 'text-[#E03131]', border: 'border-[#F8B4B4]', label: 'ของไม่มา' },
  'QUANTITY_DISCREPANCY':                { bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', border: 'border-[#FDE68A]', label: 'จำนวนไม่ตรง' },
  'PENDING_BACKOFFICE_RECONCILIATION':   { bg: 'bg-[#F3E8FF]', text: 'text-[#7950F2]', border: 'border-[#D8B4FE]', label: 'รอหลังบ้าน' },
  'RECONCILED':                          { bg: 'bg-[#EAF7ED]', text: 'text-[#12803C]', border: 'border-[#AEE0BD]', label: 'เคลียร์แล้ว' },

  // WorkflowStatus
  'PENDING_QTY_CONFIRM':      { bg: 'bg-[#F1EFEA]',  text: 'text-[#6E6E6E]',   border: 'border-[#E8E1D8]',  label: 'รอยืนยันจำนวน' },
  'SAMPLING':                 { bg: 'bg-[#EAF7ED]',  text: 'text-[#12803C]',   border: 'border-[#AEE0BD]',  label: 'กำลังชั่ง' },
  'PENDING_ONSITE_SIGNATURES':{ bg: 'bg-[#FEF9E7]',  text: 'text-[#9A7D0A]',   border: 'border-[#FAD7A0]',  label: 'รอลายเซ็น' },
  'PENDING_OTM':              { bg: 'bg-[#EAF7ED]',  text: 'text-[#0B5E2B]',   border: 'border-[#AEE0BD]',  label: 'ชั่งครบ' },
  'FULLY_SIGNED':             { bg: 'bg-[#EAF7ED]',  text: 'text-[#0B5E2B]',   border: 'border-[#12803C]',  label: 'ลงนามครบ' },
  'FINALIZED':                { bg: 'bg-[#12803C]',  text: 'text-white',       border: 'border-[#0B5E2B]',  label: 'เสร็จสิ้น' },

  // CNStatus
  'NONE':        { bg: 'bg-[#F1EFEA]',  text: 'text-[#6E6E6E]',  border: 'border-[#E8E1D8]',  label: '-' },
  'PENDING':     { bg: 'bg-[#FEF9E7]',  text: 'text-[#9A7D0A]',  border: 'border-[#FAD7A0]',  label: 'รอดำเนินการ' },
  'IN_PROGRESS': { bg: 'bg-[#EAF7ED]',  text: 'text-[#12803C]',  border: 'border-[#AEE0BD]',  label: 'กำลังดำเนินการ' },
  'RESOLVED':    { bg: 'bg-[#EAF7ED]',  text: 'text-[#12803C]',  border: 'border-[#AEE0BD]',  label: 'แก้ไขแล้ว' },

  // Alias variants
  'รอ OTM':      { bg: 'bg-[#EAF7ED]',  text: 'text-[#0B5E2B]',  border: 'border-[#AEE0BD]',  label: 'ชั่งครบ' },
};

const FALLBACK_STYLE: BadgeStyle = {
  bg: 'bg-slate-100',
  text: 'text-slate-700',
  border: 'border-slate-200',
  label: '',
};

const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-0.5 rounded',
  md: 'text-xs px-2.5 py-1 rounded-full',
  lg: 'text-sm px-3 py-1.5 rounded-full font-semibold',
};

export default function StatusBadge({ status, size = 'md' }: Props) {
  const style  = STATUS_MAP[status] ?? FALLBACK_STYLE;
  const label  = style.label || status;
  const sizing = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center font-medium border whitespace-nowrap
        ${style.bg} ${style.text} ${style.border} ${sizing}`}
    >
      {label}
    </span>
  );
}
