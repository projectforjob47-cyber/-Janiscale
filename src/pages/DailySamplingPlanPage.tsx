// ============================================================
// SMART DC — DailySamplingPlanPage.tsx
// รายการสินค้าทั้งหมดที่ต้องสุ่มชั่งประจำวัน (Daily Catch Weight Sampling Plan)
// Shows: Appointment, PO, Item, Received Baskets, Required Sample Baskets, Status
// With Print, Excel Export, LINE Copy, and Search/Filters
// ============================================================

import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ExcelJS from 'exceljs';
import { 
  ClipboardList, 
  Printer, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Search, 
  Filter, 
  ArrowLeft, 
  ArrowRight,
  Clock, 
  Scale, 
  CheckCircle2, 
  AlertTriangle, 
  ShoppingBasket,
  X,
  Building2,
  Package
} from 'lucide-react';
import { db } from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import type { SamplingGroup, Appointment } from '../types';

// Helper to format appointment time (e.g. "01:00 น.")
function formatApptTime(timeStr?: string | null): string {
  if (!timeStr) return '-';
  const str = String(timeStr).trim();
  if (str.includes('_')) {
    const parts = str.split('_');
    const timePart = parts[1] || '';
    const match = timePart.match(/^(\d{1,2}:\d{2})/);
    if (match) return `${match[1]} น.`;
  }
  const match = str.match(/(\d{1,2}:\d{2})/);
  if (match) return `${match[1]} น.`;
  return str.endsWith('น.') ? str : `${str} น.`;
}

// Clean Thai text & remove any corrupted / replacement characters (U+FFFD)
function cleanThaiText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Vendor Name Canonical Dictionary to prevent any corrupted display
const VENDOR_CLEAN_MAP: Record<string, string> = {
  '10623': 'บริษัท วารินทร์ผลไม้ จำกัด',
  '10625': 'บริษัท แปซิฟิก ฟรุต จำกัด',
  '10884': 'บริษัท สิงโตทองการเกษตร จำกัด',
  '10898': 'บริษัท เบทาโกรเกษตรอุตสาหกรรม จำกัด',
  '10899': 'บริษัท เบทาโกรเกษตรอุตสาหกรรม จำกัด',
  '11001': 'มูลนิธิโครงการหลวง',
  '11128': 'บริษัท คิงส์วิช จำกัด',
  '11129': 'บริษัท คิงส์วิช จำกัด',
  '11173': 'บริษัท ส้มยิ้มฟาร์ม จำกัด',
  '11302': 'วิสาหกิจชุมชนกลุ่มเกษตรกร',
  '11716': 'บริษัท ซีพี เฟรช จำกัด',
  '11860': 'บริษัท ซีพี เฟรช จำกัด',
  '11861': 'บริษัท ซีพี เฟรช จำกัด',
  '11912': 'บริษัท บุษราพรฟรุ๊ต จำกัด',
  '12288': 'บริษัท เอสเอสนัททอล จำกัด',
  '13391': 'บริษัท เอเซียมอนซูน จำกัด',
  '13466': 'บริษัท ดี.เอส.ฟู้ดส์ จำกัด',
  '13644': 'บริษัท ไทยวารีฟู้ดส์ จำกัด',
  '13716': 'บริษัท ธารณ์ธนาภูมิ จำกัด',
  '13733': 'บริษัท แอลทีซี การเกษตร จำกัด',
  '90911': 'บริษัท ซิตี้เฟรชฟรุต จำกัด',
  '92164': 'มูลนิธิโครงการหลวง',
  '95045': 'ห้างหุ้นส่วนจำกัด กิตติศักดิ์การเกษตร',
  '95473': 'บริษัท ตะวันพืชผล จำกัด',
  '96449': 'บริษัท เฟรชไดเร็ก จำกัด',
  '96545': 'บริษัท กำพลฟู้ดส์ จำกัด'
};

function resolveVendorName(vendorNbr?: string | null, rawName?: string | null): string {
  const vNbrStr = vendorNbr ? String(vendorNbr).trim() : '';
  if (vNbrStr && VENDOR_CLEAN_MAP[vNbrStr]) {
    return VENDOR_CLEAN_MAP[vNbrStr];
  }
  const clean = cleanThaiText(rawName);
  if (!clean || clean === '-') return '-';
  if (clean.includes('วารินทร์')) return 'บริษัท วารินทร์ผลไม้ จำกัด';
  if (clean.includes('สิงโตทอง')) return 'บริษัท สิงโตทองการเกษตร จำกัด';
  if (clean.includes('คิงส์วิช')) return 'บริษัท คิงส์วิช จำกัด';
  if (clean.includes('ธารณ์ธนา')) return 'บริษัท ธารณ์ธนาภูมิ จำกัด';
  if (clean.includes('เบทาโกร')) return 'บริษัท เบทาโกรเกษตรอุตสาหกรรม จำกัด';
  if (clean.includes('ซีพีเฟรช') || clean.includes('ซีพีเ')) return 'บริษัท ซีพี เฟรช จำกัด';
  if (clean.includes('ส้มยิ้ม')) return 'บริษัท ส้มยิ้มฟาร์ม จำกัด';
  if (clean.includes('โครงการหลว')) return 'มูลนิธิโครงการหลวง';
  if (clean.includes('ดี.เอ') || clean.includes('ดี.เอส')) return 'บริษัท ดี.เอส.ฟู้ดส์ จำกัด';
  if (clean.includes('บุษราพร')) return 'บริษัท บุษราพรฟรุ๊ต จำกัด';
  if (clean.includes('ซิตี้')) return 'บริษัท ซิตี้เฟรชฟรุต จำกัด';
  if (clean.includes('แปซิฟิก')) return 'บริษัท แปซิฟิก ฟรุต จำกัด';
  if (clean.includes('เอเซียมอนซูน')) return 'บริษัท เอเซียมอนซูน จำกัด';
  if (clean.includes('ไทยวารี')) return 'บริษัท ไทยวารีฟู้ดส์ จำกัด';
  if (clean.includes('แอลทีซี')) return 'บริษัท แอลทีซี การเกษตร จำกัด';
  if (clean.includes('กิตติศักดิ์')) return 'ห้างหุ้นส่วนจำกัด กิตติศักดิ์การเกษตร';
  if (clean.includes('ตะวันพืชผล')) return 'บริษัท ตะวันพืชผล จำกัด';
  if (clean.includes('เฟรชไดเร็ก')) return 'บริษัท เฟรชไดเร็ก จำกัด';
  if (clean.includes('กำพลฟู้ดส์')) return 'บริษัท กำพลฟู้ดส์ จำกัด';
  return clean;
}

// Helper to parse time in minutes for sorting
function parseTimeMinutes(rawTime?: string | null): number {
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

export default function DailySamplingPlanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialApptParam = searchParams.get('appt') || 'ALL';
  const { currentUser } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApptFilter, setSelectedApptFilter] = useState<string>(initialApptParam);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WAITING' | 'IN_PROGRESS' | 'DONE'>('ALL');
  const [carrierFilter, setCarrierFilter] = useState<'ALL' | 'VN' | 'PR'>('ALL');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Live queries from Dexie
  const appointments = useLiveQuery(() => db.appointments.toArray()) || [];
  const samplingGroups = useLiveQuery(() => db.samplingGroups.toArray()) || [];

  // Map appointment info by apptNbr
  const apptMap = useMemo(() => {
    const map = new Map<string, Appointment>();
    for (const a of appointments) {
      map.set(a.apptNbr, a);
    }
    return map;
  }, [appointments]);

  // List of unique appointment numbers
  const apptList = useMemo(() => {
    const list = Array.from(new Set(samplingGroups.map(g => g.apptNbr)));
    return list.sort((a, b) => {
      const timeA = parseTimeMinutes(apptMap.get(a)?.apptTime);
      const timeB = parseTimeMinutes(apptMap.get(b)?.apptTime);
      if (timeA !== timeB) return timeA - timeB;
      return a.localeCompare(b);
    });
  }, [samplingGroups, apptMap]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = samplingGroups.filter(item => {
      // 1. Appointment filter
      if (selectedApptFilter !== 'ALL' && item.apptNbr !== selectedApptFilter) {
        return false;
      }

      // 2. Carrier filter
      if (carrierFilter !== 'ALL' && item.carrierCode !== carrierFilter) {
        return false;
      }

      // 3. Status filter
      const comp = item.completedSamples ?? 0;
      const isDone = item.samplingStatus === 'ชั่งครบ' || item.samplingStatus === 'ผิดเกณฑ์' || item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0 || (item.requiredSamples > 0 && comp >= item.requiredSamples);
      // ต้องมีการบันทึกน้ำหนักจริงอย่างน้อย 1 ตะกร้า (comp > 0) ถึงจะนับว่ากำลังดำเนินการ
      const isInProgress = !isDone && comp > 0;
      const isWaiting = !isDone && comp === 0;

      if (statusFilter === 'WAITING' && !isWaiting) return false;
      if (statusFilter === 'IN_PROGRESS' && !isInProgress) return false;
      if (statusFilter === 'DONE' && !isDone) return false;

      // 4. Search query (supports 3 digits like '217' for '969217', PO, SKU, Description, Vendor, multi-keyword)
      if (searchTerm.trim()) {
        const tokens = searchTerm.toLowerCase().trim().replace(/^[#\s]+/, '').split(/\s+/).filter(Boolean);
        const combined = [
          item.apptNbr,
          item.poNbr,
          item.itemId,
          item.description,
          item.vendorName,
          item.vendorNbr
        ].filter(Boolean).join(' ').toLowerCase();

        const match = tokens.every(t => combined.includes(t));
        if (!match) return false;
      }

      return true;
    });

    // Sort chronologically by Appointment Time -> Appt Nbr -> PO -> Item
    return result.sort((a, b) => {
      const timeA = parseTimeMinutes(apptMap.get(a.apptNbr)?.apptTime);
      const timeB = parseTimeMinutes(apptMap.get(b.apptNbr)?.apptTime);
      if (timeA !== timeB) return timeA - timeB;
      if (a.apptNbr !== b.apptNbr) return a.apptNbr.localeCompare(b.apptNbr);
      if (a.poNbr !== b.poNbr) return a.poNbr.localeCompare(b.poNbr);
      return a.itemId.localeCompare(b.itemId);
    });
  }, [samplingGroups, selectedApptFilter, carrierFilter, statusFilter, searchTerm, apptMap]);

  // Overall Statistics for the view
  const stats = useMemo(() => {
    const totalItems = filteredItems.length;
    const uniqueAppts = new Set(filteredItems.map(i => i.apptNbr)).size;
    const uniquePos = new Set(filteredItems.map(i => i.poNbr)).size;

    let totalIncomingBaskets = 0; // มากี่ตะกร้า
    let totalRequiredSamples = 0; // สุ่มชั่งกี่ตะกร้า
    let totalCompletedSamples = 0; // สุ่มแล้ว

    for (const item of filteredItems) {
      const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
      const required = item.requiredSamples ?? Math.ceil(incoming * 0.1);
      const completed = item.completedSamples ?? 0;

      totalIncomingBaskets += incoming;
      totalRequiredSamples += required;
      totalCompletedSamples += completed;
    }

    return {
      totalItems,
      uniqueAppts,
      uniquePos,
      totalIncomingBaskets,
      totalRequiredSamples,
      totalCompletedSamples,
    };
  }, [filteredItems]);

  // Group items by Appointment for tidy presentation & subtotals
  const groupedByAppt = useMemo(() => {
    const map = new Map<string, typeof filteredItems>();
    for (const item of filteredItems) {
      const list = map.get(item.apptNbr) || [];
      list.push(item);
      map.set(item.apptNbr, list);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Copy Summary to LINE
  const handleCopyLine = async () => {
    const today = new Date().toLocaleDateString('th-TH');
    let text = `📋 [Lotus's SMART DC] รายการสุ่มชั่งสินค้าสดประจำวัน\n`;
    text += `📅 วันที่: ${today}\n`;
    text += `🏢 ผู้จัดทำ: ${currentUser?.fullName || 'Receive Staff'}\n`;
    text += `📊 ภาพรวม: ${stats.uniqueAppts} ใบนัด | ${stats.uniquePos} PO | ${stats.totalItems} รายการ\n`;
    text += `📦 จำนวนที่มาทั้งหมด: ${stats.totalIncomingBaskets} ตะกร้า\n`;
    text += `⚖️ จำนวนที่ต้องสุ่มชั่ง: ${stats.totalRequiredSamples} ตะกร้า (ชั่งแล้ว ${stats.totalCompletedSamples} ตะกร้า)\n`;
    text += `────────────────────\n`;

    // Group summary lines
    for (const [appt, items] of groupedByAppt) {
      const apptInfo = apptMap.get(appt);
      const timeStr = formatApptTime(apptInfo?.apptTime);
      const vendorName = resolveVendorName(items[0]?.vendorNbr, items[0]?.vendorName);
      const apptIncoming = items.reduce((sum, i) => sum + (i.confirmedActualQty ?? i.importedRcvdContQty ?? i.apptContQty ?? 0), 0);
      const apptRequired = items.reduce((sum, i) => sum + (i.requiredSamples ?? 0), 0);

      text += `\n🚛 ใบนัดหมาย ${appt} (${apptInfo?.carrierCode || 'VN'} · ${timeStr})\n`;
      text += `ผู้ขาย: ${vendorName}\n`;
      text += `ยอดรวม: มา ${apptIncoming} ตะกร้า | ต้องสุ่มชั่ง ${apptRequired} ตะกร้า\n`;
      
      items.forEach((item, idx) => {
        const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
        const req = item.requiredSamples ?? 0;
        const basket = item.containerType || item.defaultBasketCode || item.uda6 || 'O';
        text += `  ${idx + 1}. PO: ${item.poNbr} | ${item.itemId} ${cleanThaiText(item.description)}\n`;
        text += `     → มา ${incoming} ตะกร้า (${basket}) | สุ่มชั่ง ${req} ตะกร้า\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      alert('ไม่สามารถคัดลอกข้อความได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Export to Excel using ExcelJS
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Lotus's SRRDC Receiving Fresh";
      workbook.lastModifiedBy = currentUser?.fullName || 'Receive Staff';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Daily_Sampling_Plan', {
        views: [{ showGridLines: true }]
      });

      const today = new Date();
      const dateStr = today.toLocaleDateString('th-TH');
      const dateFileStr = today.toISOString().split('T')[0];

      // Title rows
      worksheet.mergeCells('A1:L1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = "Lotus's SMART DC — แผนงานและรายการสินค้าที่ต้องสุ่มชั่งประจำวัน (Daily Catch Weight Sampling Plan)";
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004D25' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:L2');
      const subCell = worksheet.getCell('A2');
      subCell.value = `วันที่จัดทำ: ${dateStr} | ผู้จัดทำ: ${currentUser?.fullName || 'Receive Staff'} | รวม ${stats.uniqueAppts} ใบนัดหมาย | รวม ${stats.totalItems} รายการ | รวมที่มา ${stats.totalIncomingBaskets} ตะกร้า | รวมต้องสุ่มชั่ง ${stats.totalRequiredSamples} ตะกร้า`;
      subCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF004D25' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      worksheet.getRow(2).height = 22;

      // Table Header Row
      const headers = [
        'ลำดับ',
        'ใบนัดหมาย',
        'เวลา',
        'ประเภทรถ',
        'เลขที่ PO',
        'รหัสสินค้า (SKU)',
        'รายการสินค้า (Description)',
        'ผู้ขาย (Vendor)',
        'ชนิดภาชนะ',
        'เกณฑ์ นน./กล่อง',
        'มากี่ตะกร้า (รับจริง)',
        'สุ่มชั่งกี่ตะกร้า (ตัวอย่าง)',
        'ชั่งแล้ว',
        'สถานะ'
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 24;
      headerRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        if (colNum === 11) {
          // มากี่ตะกร้า
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00796B' } }; // Deep Teal
        } else if (colNum === 12) {
          // สุ่มชั่งกี่ตะกร้า
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12803C' } }; // Lotus Green
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF343A40' } };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'medium', color: { argb: 'FF333333' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      });

      // Data Rows
      let rowIdx = 1;
      filteredItems.forEach((item) => {
        const apptInfo = apptMap.get(item.apptNbr);
        const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
        const required = item.requiredSamples ?? Math.ceil(incoming * 0.1);
        const comp = item.completedSamples ?? 0;
        const basket = item.containerType || item.defaultBasketCode || item.uda6 || 'O';
        const stdWeight = item.standardWeightKg ? `${item.standardWeightKg} kg` : (item.spExpression || '-');
        const statusText = (item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0)
          ? 'ไม่มาตามแผน'
          : item.samplingStatus === 'ชั่งครบ' || (required > 0 && comp >= required)
          ? 'ชั่งครบแล้ว'
          : comp > 0
          ? 'ดำเนินการอยู่'
          : 'รอชั่ง';

        const row = worksheet.addRow([
          rowIdx++,
          item.apptNbr,
          formatApptTime(apptInfo?.apptTime),
          item.carrierCode,
          item.poNbr,
          item.itemId,
          cleanThaiText(item.description),
          resolveVendorName(item.vendorNbr, item.vendorName),
          basket,
          stdWeight,
          incoming,
          required,
          comp,
          statusText
        ]);

        row.height = 20;
        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          };

          // Alignment
          if (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 9 || colNum === 10 || colNum === 14) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (colNum === 2 || colNum === 5 || colNum === 6) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: 'Consolas', size: 9.5 };
          } else if (colNum === 7 || colNum === 8) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else if (colNum === 11) {
            // มากี่ตะกร้า
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF004D40' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F1' } };
          } else if (colNum === 12) {
            // สุ่มชั่งกี่ตะกร้า
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0B5E2B' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
          } else if (colNum === 13) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Total summary row
      const totalRow = worksheet.addRow([
        'รวมทั้งหมด',
        `${stats.uniqueAppts} ใบนัด`,
        '',
        '',
        `${stats.uniquePos} PO`,
        '',
        `รวมทั้งหมด ${stats.totalItems} รายการ`,
        '',
        '',
        '',
        stats.totalIncomingBaskets,
        stats.totalRequiredSamples,
        stats.totalCompletedSamples,
        ''
      ]);
      totalRow.height = 24;
      totalRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF004D25' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF12803C' } },
          bottom: { style: 'double', color: { argb: 'FF12803C' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
        if (colNum === 11 || colNum === 12 || colNum === 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });

      // Set column widths
      worksheet.columns = [
        { width: 6 },  // ลำดับ
        { width: 14 }, // ใบนัดหมาย
        { width: 11 }, // เวลา
        { width: 9 },  // รถ
        { width: 14 }, // PO
        { width: 13 }, // Item ID
        { width: 34 }, // ชื่อสินค้า
        { width: 26 }, // ผู้ขาย
        { width: 10 }, // ภาชนะ
        { width: 13 }, // เกณฑ์
        { width: 16 }, // มากี่ตะกร้า
        { width: 17 }, // สุ่มชั่งกี่ตะกร้า
        { width: 10 }, // ชั่งแล้ว
        { width: 14 }  // สถานะ
      ];

      // Download buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `แผนงานสุ่มชั่งสินค้าสด_Checklist_${dateFileStr}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel Export Error:', err);
      alert('เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <Layout>
      <div className="p-3 sm:p-5 space-y-4 w-full max-w-[1600px] mx-auto pb-24 text-[#1F1F1F] overflow-x-hidden">
        
        {/* ─── Top Bar Controls (Hidden in Print) ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-[#1F1F1F] bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F7F2EA] active:scale-95 transition-all shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#12803C]" />
              <span>กลับหน้าหลัก</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-black text-[#004D25] flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-[#12803C]" />
                <span>รายการทั้งหมดที่ต้องสุ่มชั่ง</span>
              </span>
              <span className="bg-[#EAF7ED] text-[#0B5E2B] border border-[#AEE0BD] text-xs font-black px-2.5 py-1 rounded-full">
                {filteredItems.length} รายการ
              </span>
            </div>
          </div>

          {/* Action Buttons: Print, Excel, Copy LINE */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPrintPreview(true)}
              className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold px-3.5 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer ring-2 ring-emerald-400/30"
              title="ดูตัวอย่างก่อนพิมพ์ (Print Preview)"
            >
              <Printer className="w-4 h-4" />
              <span>สั่งพิมพ์ (Print)</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="bg-[#00796B] hover:bg-[#004D40] text-white font-bold px-3.5 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isExportingExcel ? 'กำลังสร้างไฟล์...' : 'ส่งออก Excel'}</span>
            </button>

            <button
              onClick={handleCopyLine}
              className="bg-white hover:bg-emerald-50 text-[#004D25] border border-[#AEE0BD] font-bold px-3 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="คัดลอกสรุปส่งกลุ่ม LINE"
            >
              {copySuccess ? (
                <>
                  <Check className="w-4 h-4 text-[#12803C]" />
                  <span className="text-[#12803C]">คัดลอกแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>คัดลอกส่ง LINE</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ─── Printable Header & Brand Section (Visible in Print & Screen) ─── */}
        <div className="bg-[#FFFDF9] rounded-3xl border border-[#E8E1D8] shadow-md p-4 sm:p-5 print:border-none print:shadow-none print:p-0">
          <div className="flex flex-wrap justify-between items-start gap-3 border-b border-[#E8E1D8] pb-4 mb-4 print:pb-2 print:mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[#00ADB5] tracking-tight print:text-[18px]">
                  Lotus<span className="text-[#008276]">'s</span>
                </span>
                <span className="text-xs sm:text-sm font-black bg-[#EAF7ED] text-[#0B5E2B] px-2 py-0.5 rounded-md border border-[#AEE0BD] print:border-gray-300">
                  SMART DC · RECEIVING FRESH
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-[#1F1F1F] mt-1 print:text-[16px] print:mt-0.5">
                ใบรายการแผนงานสุ่มชั่งสินค้าสดดิจิทัลประจำวัน (Daily Catch Weight Sampling Plan)
              </h1>
              <p className="text-xs text-[#6E6E6E] font-medium print:text-[10px]">
                สำหรับตรวจสอบล่วงหน้า: เลขใบนัดหมาย, PO, รายการสินค้า, จำนวนตะกร้าที่รับจริง และจำนวนที่ต้องสุ่มชั่งตามเกณฑ์
              </p>
            </div>

            <div className="text-right text-xs text-[#495057] space-y-0.5 print:text-[10px]">
              <div>วันที่จัดทำ/พิมพ์: <b>{new Date().toLocaleDateString('th-TH')}</b></div>
              <div>ผู้ปฏิบัติงาน: <b>{currentUser?.fullName || 'Receive Staff'}</b></div>
              <div className="font-mono text-[#0B5E2B] font-bold">
                {selectedApptFilter === 'ALL' ? 'แสดงข้อมูล: รวมทุกใบนัดหมาย' : `แสดงข้อมูล: ใบนัดหมาย ${selectedApptFilter}`}
              </div>
            </div>
          </div>

          {/* ─── Metric Tiles Summary (Screen & Print Compact) ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 text-center mb-4 print:grid-cols-6 print:gap-1.5 print:mb-3">
            <div className="bg-[#F7F2EA] p-2.5 rounded-2xl border border-[#E8E1D8] print:p-1.5 print:rounded-lg">
              <span className="text-[#6E6E6E] block text-[11px] font-bold print:text-[9.5px]">ใบนัดหมาย</span>
              <span className="text-base sm:text-xl font-black text-[#1F1F1F] print:text-[13px]">
                {stats.uniqueAppts} <span className="text-xs font-normal">ใบ</span>
              </span>
            </div>

            <div className="bg-[#F7F2EA] p-2.5 rounded-2xl border border-[#E8E1D8] print:p-1.5 print:rounded-lg">
              <span className="text-[#6E6E6E] block text-[11px] font-bold print:text-[9.5px]">ใบสั่งซื้อ (PO)</span>
              <span className="text-base sm:text-xl font-black text-[#1F1F1F] print:text-[13px]">
                {stats.uniquePos} <span className="text-xs font-normal">PO</span>
              </span>
            </div>

            <div className="bg-[#F7F2EA] p-2.5 rounded-2xl border border-[#E8E1D8] print:p-1.5 print:rounded-lg">
              <span className="text-[#6E6E6E] block text-[11px] font-bold print:text-[9.5px]">รายการสินค้า</span>
              <span className="text-base sm:text-xl font-black text-[#1F1F1F] print:text-[13px]">
                {stats.totalItems} <span className="text-xs font-normal">SKU</span>
              </span>
            </div>

            <div className="bg-[#E0F2F1] p-2.5 rounded-2xl border border-[#80CBC4] print:p-1.5 print:rounded-lg">
              <span className="text-[#004D40] block text-[11px] font-black print:text-[9.5px]">มากี่ตะกร้า (รวมรับ)</span>
              <span className="text-base sm:text-xl font-black text-[#00695C] print:text-[13px]">
                {stats.totalIncomingBaskets} <span className="text-xs font-normal">ตะกร้า</span>
              </span>
            </div>

            <div className="bg-[#EAF7ED] p-2.5 rounded-2xl border-2 border-[#12803C]/40 print:p-1.5 print:rounded-lg">
              <span className="text-[#0B5E2B] block text-[11px] font-black print:text-[9.5px]">สุ่มชั่งกี่ตะกร้า (เกณฑ์)</span>
              <span className="text-base sm:text-xl font-black text-[#12803C] print:text-[13px]">
                {stats.totalRequiredSamples} <span className="text-xs font-normal">ตะกร้า</span>
              </span>
            </div>

            <div className="bg-[#FEF9E7] p-2.5 rounded-2xl border border-[#FAD7A0] print:p-1.5 print:rounded-lg">
              <span className="text-[#B45309] block text-[11px] font-black print:text-[9.5px]">สุ่มชั่งเสร็จแล้ว</span>
              <span className="text-base sm:text-xl font-black text-[#B45309] print:text-[13px]">
                {stats.totalCompletedSamples} <span className="text-xs font-normal">ตะกร้า</span>
              </span>
            </div>
          </div>

          {/* ─── Search & Filters Bar (Hidden in Print) ─── */}
          <div className="space-y-3 mb-4 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-3 text-[#6E6E6E] w-4 h-4" />
                <input
                  type="text"
                  placeholder="ค้นหาใบนัดหมาย, PO, SKU, ชื่อสินค้า, ผู้ขาย..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#FFFDF9] border border-[#E8E1D8] rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#12803C]"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Appointment Filter */}
              <select
                value={selectedApptFilter}
                onChange={(e) => setSelectedApptFilter(e.target.value)}
                className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#12803C]"
              >
                <option value="ALL">ใบนัดหมายทั้งหมด ({apptList.length})</option>
                {apptList.map(appt => {
                  const info = apptMap.get(appt);
                  return (
                    <option key={appt} value={appt}>
                      ใบนัด {appt} ({formatApptTime(info?.apptTime)})
                    </option>
                  );
                })}
              </select>

              {/* Carrier Filter */}
              <select
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value as any)}
                className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#12803C]"
              >
                <option value="ALL">รถทุกประเภท</option>
                <option value="VN">รถผู้ขาย (VN)</option>
                <option value="PR">รถห้าง (PR)</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-[#12803C]"
              >
                <option value="ALL">สถานะทั้งหมด</option>
                <option value="WAITING">รอชั่ง</option>
                <option value="IN_PROGRESS">ดำเนินการอยู่</option>
                <option value="DONE">ชั่งครบแล้ว</option>
              </select>
            </div>
          </div>

          {/* ─── Mobile View Mode Switcher (Visible on Mobile only) ─── */}
          <div className="flex sm:hidden items-center justify-between gap-2 mb-3 bg-[#F7F2EA] p-1.5 rounded-xl border border-[#E8E1D8] print:hidden">
            <span className="text-[11px] font-bold text-[#6E6E6E] pl-1">เลือกรูปแบบการแสดงผล:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileViewMode('cards')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mobileViewMode === 'cards'
                    ? 'bg-[#12803C] text-white shadow-xs'
                    : 'bg-white text-[#495057] border border-[#E8E1D8]'
                }`}
              >
                📱 พอดีจอมือถือ
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode('table')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mobileViewMode === 'table'
                    ? 'bg-[#12803C] text-white shadow-xs'
                    : 'bg-white text-[#495057] border border-[#E8E1D8]'
                }`}
              >
                📊 ตาราง
              </button>
            </div>
          </div>

          {/* ─── 1. MOBILE RESPONSIVE CARDS VIEW (Fits 100% on Phone Screen, Zero Text Overlap) ─── */}
          <div className={`space-y-3.5 print:hidden ${mobileViewMode === 'cards' ? 'block sm:hidden' : 'hidden'}`}>
            {groupedByAppt.length === 0 ? (
              <div className="bg-[#FFFDF9] rounded-2xl p-8 text-center border border-[#E8E1D8]">
                <Scale className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                <p className="font-bold text-sm">ไม่พบรายการสินค้าที่ค้นหา</p>
                <p className="text-xs text-gray-500 mt-1">ลองเปลี่ยนตัวกรอง หรือค้นหาด้วยคำอื่น</p>
              </div>
            ) : (
              groupedByAppt.map(([apptNbr, items]) => {
                const apptInfo = apptMap.get(apptNbr);
                const timeStr = formatApptTime(apptInfo?.apptTime);
                const vendorName = resolveVendorName(items[0]?.vendorNbr, items[0]?.vendorName);

                const subIncoming = items.reduce((sum, i) => sum + (i.confirmedActualQty ?? i.importedRcvdContQty ?? i.apptContQty ?? 0), 0);
                const subRequired = items.reduce((sum, i) => sum + (i.requiredSamples ?? 0), 0);
                const subCompleted = items.reduce((sum, i) => sum + (i.completedSamples ?? 0), 0);

                return (
                  <div key={apptNbr} className="rounded-2xl border-2 border-[#AEE0BD] overflow-hidden bg-white shadow-xs space-y-0">
                    {/* Light Green / Soft Theme Appointment Header */}
                    <div className="bg-[#EAF7ED] text-[#1F1F1F] border-b border-[#AEE0BD] p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="bg-[#12803C] text-white px-2.5 py-0.5 rounded-lg font-mono font-black text-xs shadow-2xs">
                          ใบนัดหมาย: {apptNbr}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md border shadow-2xs ${
                          apptInfo?.carrierCode === 'VN'
                            ? 'bg-white text-[#12803C] border-[#AEE0BD]'
                            : 'bg-[#FFF0E6] text-[#D9480F] border-[#FFD8BF]'
                        }`}>
                          {timeStr} · รถ: {apptInfo?.carrierCode || 'VN'}
                        </span>
                      </div>
                      <div className="text-xs text-[#1F1F1F] font-bold">
                        ผู้ขาย: <b className="text-[#0B5E2B] font-black">{vendorName}</b>
                      </div>
                      <div className="text-[11px] font-bold text-[#1F1F1F] pt-1.5 border-t border-[#AEE0BD]/60 flex flex-wrap justify-between gap-1 bg-white/70 p-2 rounded-xl">
                        <span>ยอดใบนัด: มา <b className="text-[#12803C] font-black">{subIncoming}</b> ตะกร้า</span>
                        <span>ต้องสุ่มชั่ง <b className="text-[#D9480F] font-black">{subRequired}</b> ตะกร้า (ชั่งแล้ว <b className="text-[#1864AB] font-black">{subCompleted}</b>)</span>
                      </div>
                    </div>

                    {/* Item Cards within this appointment */}
                    <div className="divide-y divide-[#E8E1D8]">
                      {items.map((item, idx) => {
                        const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
                        const required = item.requiredSamples ?? Math.ceil(incoming * 0.1);
                        const comp = item.completedSamples ?? 0;
                        const basket = item.containerType || item.defaultBasketCode || item.uda6 || 'O';
                        const isDone = item.samplingStatus === 'ชั่งครบ' || item.samplingStatus === 'ผิดเกณฑ์' || item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0 || (required > 0 && comp >= required);
                        const isInProgress = !isDone && comp > 0;
                        const stdWeight = item.standardWeightKg ? `${item.standardWeightKg} kg` : (item.spExpression || '-');

                        return (
                          <div key={item.id} className="p-3 space-y-2 hover:bg-[#F9FBF9] bg-white">
                            {/* Line 1: Index, PO & Status */}
                            <div className="flex items-center justify-between text-xs gap-1">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="bg-gray-100 text-[#495057] px-1.5 py-0.5 rounded font-bold text-[11px]">
                                  #{idx + 1}
                                </span>
                                <span className="font-bold text-[#1565C0] text-xs">
                                  PO: {item.poNbr}
                                </span>
                              </div>

                              {isDone ? (
                                <span className="inline-flex items-center gap-1 bg-[#EAF7ED] text-[#0B5E2B] px-2 py-0.5 rounded-full font-bold text-[10.5px] border border-[#AEE0BD]">
                                  <CheckCircle2 className="w-3 h-3 text-[#12803C]" />
                                  <span>ชั่งครบ</span>
                                </span>
                              ) : isInProgress ? (
                                <span className="inline-flex items-center gap-1 bg-[#EFF6FF] text-[#1D4ED8] px-2 py-0.5 rounded-full font-bold text-[10.5px] border border-[#BFDBFE]">
                                  <span>กำลังชั่ง</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-[#FEF9E7] text-[#B45309] px-2 py-0.5 rounded-full font-bold text-[10.5px] border border-[#FAD7A0]">
                                  <span>รอชั่ง</span>
                                </span>
                              )}
                            </div>

                            {/* Line 2: SKU & Full Description (Clean Word Wrap, Never Collides) */}
                            <div>
                              <div className="font-mono text-xs font-black text-[#1F1F1F]">
                                {item.itemId}
                              </div>
                              <div className="text-xs sm:text-sm font-semibold text-[#1F1F1F] leading-snug break-words">
                                {cleanThaiText(item.description)}
                              </div>
                            </div>

                            {/* Line 3: Spec Badges */}
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-bold">
                                ภาชนะ: <b>{basket}</b>
                              </span>
                              <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 font-bold">
                                เกณฑ์: <b>{stdWeight}</b>
                              </span>
                            </div>

                            {/* Line 4: Quantities in 3-Box Highlight Grid */}
                            <div className="grid grid-cols-3 gap-1.5 text-center pt-1">
                              <div className="bg-[#E0F2F1] p-1.5 rounded-xl border border-[#80CBC4]">
                                <span className="text-[10px] text-[#004D40] block font-bold">มากี่ตะกร้า</span>
                                <span className="font-black text-sm text-[#00695C]">{incoming}</span>
                              </div>

                              <div className="bg-[#EAF7ED] p-1.5 rounded-xl border-2 border-[#12803C]/40">
                                <span className="text-[10px] text-[#0B5E2B] block font-bold">สุ่มชั่งกี่ตะกร้า</span>
                                <span className="font-black text-sm text-[#12803C]">{required}</span>
                              </div>

                              <div className="bg-[#F7F2EA] p-1.5 rounded-xl border border-[#E8E1D8]">
                                <span className="text-[10px] text-[#6E6E6E] block font-bold">ชั่งแล้ว</span>
                                <span className="font-black text-sm text-[#1F1F1F]">{comp}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Subtotal Row */}
                    <div className="bg-[#FAF8F5] p-2.5 border-t border-[#CBD5E1] flex justify-between items-center text-xs font-black">
                      <span className="text-[#004D25]">ยอดรวมใบนัด {apptNbr}:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#00695C] bg-[#E0F2F1] px-2 py-0.5 rounded">
                          มา {subIncoming} ตะกร้า
                        </span>
                        <span className="text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded">
                          สุ่ม {subRequired} ตะกร้า
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Mobile Grand Total Summary Box */}
            {filteredItems.length > 0 && (
              <div className="bg-[#FFF8E1] p-3 rounded-2xl border-2 border-[#12803C] space-y-1.5 text-xs font-black">
                <div className="text-[#004D25] text-center font-bold">
                  ยอดรวมทั้งหมด ({stats.uniqueAppts} ใบนัด · {stats.uniquePos} PO · {stats.totalItems} รายการ)
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-[#B2DFDB]/70 p-1.5 rounded-xl">
                    <span className="text-[10px] text-[#004D40] block">มาทั้งหมด</span>
                    <span className="text-sm font-black text-[#00695C]">{stats.totalIncomingBaskets} ตะกร้า</span>
                  </div>
                  <div className="bg-[#C8E6C9]/70 p-1.5 rounded-xl border border-[#12803C]/30">
                    <span className="text-[10px] text-[#0B5E2B] block">ต้องสุ่มชั่ง</span>
                    <span className="text-sm font-black text-[#12803C]">{stats.totalRequiredSamples} ตะกร้า</span>
                  </div>
                  <div className="bg-white/80 p-1.5 rounded-xl border border-amber-300">
                    <span className="text-[10px] text-[#495057] block">ชั่งแล้ว</span>
                    <span className="text-sm font-black text-[#1F1F1F]">{stats.totalCompletedSamples} ตะกร้า</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── 2. DESKTOP & PRINT TABLE VIEW (Fits 100% screen width, Zero Horizontal Scroll, Zero Overlap) ─── */}
          <div className={`rounded-2xl border border-[#D4D4D4] shadow-xs overflow-hidden print:rounded-none print:border-collapse print:block ${
            mobileViewMode === 'table' ? 'block' : 'hidden sm:block'
          }`}>
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="bg-[#EAEAEA] text-[#1F1F1F] font-black text-[11px] sm:text-xs border-b border-[#BDBDBD] print:text-[10px] print:bg-gray-200">
                <tr>
                  <th className="w-[4%] py-2 px-1 border-r border-[#D4D4D4] text-center print:py-1">ลำดับ</th>
                  <th className="w-[11%] py-2 px-1 border-r border-[#D4D4D4] text-center print:py-1">เลขที่ PO / ใบนัด</th>
                  <th className="w-[11%] py-2 px-1 border-r border-[#D4D4D4] text-center print:py-1">รหัสสินค้า</th>
                  <th className="w-[28%] py-2 px-2 border-r border-[#D4D4D4] text-left print:py-1">รายการสินค้า (Description)</th>
                  <th className="w-[6%] py-2 px-1 border-r border-[#D4D4D4] text-center print:py-1">ภาชนะ</th>
                  <th className="w-[7%] py-2 px-1 border-r border-[#D4D4D4] text-center leading-tight print:py-1">
                    <div>เกณฑ์</div>
                    <div className="text-[10px] text-gray-600 font-semibold">นน.</div>
                  </th>
                  
                  {/* มากี่ตะกร้า - Highlighted Column */}
                  <th className="w-[9%] py-2 px-1 border-r border-[#D4D4D4] text-center leading-tight bg-[#E0F2F1] text-[#004D40] font-black print:py-1 print:bg-teal-50">
                    <div>มา</div>
                    <div className="text-[10px] text-[#004D40]/80 font-bold">กี่ตะกร้า</div>
                  </th>

                  {/* สุ่มชั่งกี่ตะกร้า - Highlighted Column */}
                  <th className="w-[10%] py-2 px-1 border-r border-[#D4D4D4] text-center leading-tight bg-[#EAF7ED] text-[#0B5E2B] font-black print:py-1 print:bg-emerald-50">
                    <div>สุ่มชั่ง</div>
                    <div className="text-[10px] text-[#0B5E2B]/80 font-bold">กี่ตะกร้า</div>
                  </th>

                  <th className="w-[6%] py-2 px-1 border-r border-[#D4D4D4] text-center leading-tight print:py-1">
                    <div>ชั่งแล้ว</div>
                  </th>
                  <th className="w-[8%] py-2 px-1 text-center print:py-1">สถานะ</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E0E0E0] text-xs print:text-[10px]">
                {groupedByAppt.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-[#8C8C8C]">
                      <Scale className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                      <p className="font-bold">ไม่พบรายการสินค้าที่ตรงกับเงื่อนไขการค้นหา</p>
                      <p className="text-xs text-gray-500 mt-1">ลองเปลี่ยนตัวกรอง หรือค้นหาด้วยคำอื่น</p>
                    </td>
                  </tr>
                ) : (
                  groupedByAppt.map(([apptNbr, items]) => {
                    const apptInfo = apptMap.get(apptNbr);
                    const timeStr = formatApptTime(apptInfo?.apptTime);
                    const vendorName = resolveVendorName(items[0]?.vendorNbr, items[0]?.vendorName);

                    // Subtotals for this appointment
                    const subIncoming = items.reduce((sum, i) => sum + (i.confirmedActualQty ?? i.importedRcvdContQty ?? i.apptContQty ?? 0), 0);
                    const subRequired = items.reduce((sum, i) => sum + (i.requiredSamples ?? 0), 0);
                    const subCompleted = items.reduce((sum, i) => sum + (i.completedSamples ?? 0), 0);

                    return (
                      <React.Fragment key={apptNbr}>
                        {/* Appointment Section Separator Header (Light Theme with Dark Text) */}
                        <tr className="bg-[#EAF7ED] text-[#1F1F1F] border-t-2 border-b border-[#AEE0BD] print:bg-gray-100 print:text-black">
                          <td colSpan={10} className="py-2.5 px-3 text-xs font-black print:py-1 print:px-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-[#12803C] text-white px-2.5 py-0.5 rounded-lg font-mono font-black text-xs shadow-2xs print:bg-gray-800 print:text-white">
                                  ใบนัดหมาย: {apptNbr}
                                </span>
                                <span className="bg-white text-[#2B2B2B] border border-[#CBD5E1] px-2 py-0.5 rounded-md font-bold text-xs shadow-2xs print:text-black print:bg-transparent">
                                  เวลานัด: {timeStr}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md font-bold text-xs border shadow-2xs ${
                                  apptInfo?.carrierCode === 'VN'
                                    ? 'bg-white text-[#12803C] border-[#AEE0BD]'
                                    : 'bg-[#FFF0E6] text-[#D9480F] border-[#FFD8BF]'
                                }`}>
                                  รถ: {apptInfo?.carrierCode || 'VN'}
                                </span>
                                <span className="text-[#1F1F1F] font-bold">
                                  ผู้ขาย: <b className="text-[#0B5E2B] font-black">{vendorName}</b>
                                </span>
                              </div>
                              <div className="text-xs font-bold text-[#1F1F1F] bg-white/80 px-2.5 py-1 rounded-xl border border-[#AEE0BD] shadow-2xs">
                                ยอดรวมใบนัด: มา <b className="text-[#12803C] font-black">{subIncoming}</b> ตะกร้า | ต้องสุ่มชั่ง <b className="text-[#D9480F] font-black">{subRequired}</b> ตะกร้า | ชั่งแล้ว <b className="text-[#1864AB] font-black">{subCompleted}</b>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Items within this appointment */}
                        {items.map((item, idx) => {
                          const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
                          const required = item.requiredSamples ?? Math.ceil(incoming * 0.1);
                          const comp = item.completedSamples ?? 0;
                          const basket = item.containerType || item.defaultBasketCode || item.uda6 || 'O';
                          const isDone = item.samplingStatus === 'ชั่งครบ' || item.samplingStatus === 'ผิดเกณฑ์' || item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0 || (required > 0 && comp >= required);
                          const isInProgress = !isDone && comp > 0;

                          return (
                            <tr 
                              key={item.id} 
                              className={`hover:bg-[#F9FBF9] transition-colors ${idx % 2 === 1 ? 'bg-[#FCFCFA]' : 'bg-white'}`}
                            >
                              {/* ลำดับ */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center text-[#6E6E6E] font-medium print:py-1">
                                {idx + 1}
                              </td>

                              {/* เลขที่ PO / ใบนัด */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono print:py-1">
                                <div className="font-bold text-[#1565C0] text-xs">{item.poNbr}</div>
                                <div className="text-[9.5px] text-[#8C8C8C] font-semibold leading-tight">ใบนัด: {item.apptNbr}</div>
                              </td>

                              {/* รหัสสินค้า */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono font-black text-xs text-[#1F1F1F] print:py-1">
                                {item.itemId}
                              </td>

                              {/* รายการสินค้า */}
                              <td className="py-2 px-2 border-r border-[#E0E0E0] font-semibold text-xs text-[#1F1F1F] print:py-1">
                                <div className="leading-snug break-words line-clamp-2" title={cleanThaiText(item.description)}>
                                  {cleanThaiText(item.description)}
                                </div>
                              </td>

                              {/* ภาชนะ */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-bold font-mono text-xs print:py-1">
                                <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                                  {basket}
                                </span>
                              </td>

                              {/* เกณฑ์ นน. */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono text-xs text-[#2b8a3e] font-bold print:py-1">
                                {item.standardWeightKg ? `${item.standardWeightKg} kg` : (item.spExpression || '-')}
                              </td>

                              {/* มากี่ตะกร้า (Highlight) */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono font-black text-xs sm:text-sm bg-[#F0FAF8] text-[#00695C] print:py-1 print:bg-transparent">
                                {incoming}
                              </td>

                              {/* สุ่มชั่งกี่ตะกร้า (Highlight) */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono font-black text-xs sm:text-sm bg-[#EAF7ED] text-[#12803C] print:py-1 print:bg-transparent">
                                {required}
                              </td>

                              {/* ชั่งแล้ว */}
                              <td className="py-2 px-1 border-r border-[#E0E0E0] text-center font-mono font-bold text-xs text-[#495057] print:py-1">
                                {comp}
                              </td>

                              {/* สถานะ */}
                              <td className="py-2 px-1 text-center print:py-1">
                                {isDone ? (
                                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full font-bold text-[10px] bg-[#EAF7ED] text-[#0B5E2B] border border-[#AEE0BD] print:border-none whitespace-nowrap">
                                    ชั่งครบ
                                  </span>
                                ) : isInProgress ? (
                                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full font-bold text-[10px] bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] print:border-none whitespace-nowrap">
                                    กำลังชั่ง
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full font-bold text-[10px] bg-[#FEF9E7] text-[#B45309] border border-[#FAD7A0] print:border-none whitespace-nowrap">
                                    รอชั่ง
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Subtotal Row for this Appointment */}
                        <tr className="bg-[#FAF8F5] font-black text-xs border-b-2 border-[#CBD5E1] print:bg-white">
                          <td colSpan={6} className="py-2 px-3 border-r border-[#CBD5E1] text-right text-[#004D25] print:py-1 print:px-2">
                            รวมใบนัดหมาย {apptNbr} ({items.length} รายการ):
                          </td>
                          <td className="py-2 px-1 border-r border-[#CBD5E1] text-center font-mono font-black text-xs sm:text-sm text-[#00695C] bg-[#E0F2F1]/80 print:py-1">
                            {subIncoming} ตะกร้า
                          </td>
                          <td className="py-2 px-1 border-r border-[#CBD5E1] text-center font-mono font-black text-xs sm:text-sm text-[#12803C] bg-[#EAF7ED]/80 print:py-1">
                            {subRequired} ตะกร้า
                          </td>
                          <td className="py-2 px-1 border-r border-[#CBD5E1] text-center font-mono font-bold text-xs text-[#495057] print:py-1">
                            {subCompleted}
                          </td>
                          <td className="py-2 px-1 print:py-1" />
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Grand Total Footer */}
              {filteredItems.length > 0 && (
                <tfoot className="bg-[#FFF8E1] font-black text-xs sm:text-sm border-t-2 border-[#12803C] print:bg-gray-100">
                  <tr>
                    <td colSpan={6} className="py-3 px-3 border-r border-[#BDBDBD] text-right text-[#004D25] print:py-1.5 print:px-2">
                      ยอดรวมทั้งหมด ({stats.uniqueAppts} ใบนัด · {stats.uniquePos} PO · {stats.totalItems} รายการ):
                    </td>
                    <td className="py-3 px-1 border-r border-[#BDBDBD] text-center font-mono font-black text-sm sm:text-base text-[#00695C] bg-[#B2DFDB]/60 print:py-1.5">
                      {stats.totalIncomingBaskets} ตะกร้า
                    </td>
                    <td className="py-3 px-1 border-r border-[#BDBDBD] text-center font-mono font-black text-sm sm:text-base text-[#12803C] bg-[#C8E6C9]/50 print:py-1.5">
                      {stats.totalRequiredSamples} ตะกร้า
                    </td>
                    <td className="py-3 px-1 border-r border-[#BDBDBD] text-center font-mono font-black text-xs sm:text-sm text-[#334155] print:py-1.5">
                      {stats.totalCompletedSamples}
                    </td>
                    <td className="py-3 px-1 print:py-1.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PRINT PREVIEW MODAL (หน้าต่างตัวอย่างก่อนพิมพ์เสมือนจริง A4)
         ═══════════════════════════════════════════════════════════════ */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-xs flex flex-col animate-fadeIn print:static print:bg-white print:p-0">
          
          {/* Top Control Bar (Hidden on actual physical paper print) */}
          <div className="bg-[#1E293B] text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xl shrink-0 print:hidden border-b border-slate-700">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#12803C] text-white flex items-center justify-center shadow-xs">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black flex items-center gap-2">
                  <span>ตัวอย่างก่อนพิมพ์ (Print Preview)</span>
                  <span className="bg-[#12803C] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    A4 แนวนอน (Landscape)
                  </span>
                </h2>
                <p className="text-xs text-slate-300">
                  ตรวจสอบความถูกต้องของรายการ ({filteredItems.length} รายการ) ก่อนส่งพิมพ์ออกเครื่องพิมพ์
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer ring-2 ring-emerald-400/40"
              >
                <Printer className="w-4 h-4" />
                <span>ยืนยันพิมพ์ออกเครื่องพิมพ์ (Print)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-slate-600 active:scale-95"
              >
                <X className="w-4 h-4" />
                <span>ปิดหน้าต่าง</span>
              </button>
            </div>
          </div>

          {/* Paper Canvas (Scrollable Document Sheet) */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-800 flex justify-center print:p-0 print:bg-white print:overflow-visible">
            
            {/* Realistic A4 Paper Sheet */}
            <div className="bg-white text-[#1F1F1F] w-full max-w-[1240px] p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-300 print:shadow-none print:border-none print:p-0 print:max-w-none print:rounded-none">
              
              {/* Paper Header */}
              <div className="flex flex-wrap justify-between items-start pb-3 mb-3 border-b-2 border-gray-800 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black tracking-tight text-[#004D25]">
                      Lotus<span className="text-[#008276]">'s</span>
                    </span>
                    <span className="text-xs font-black bg-[#EAF7ED] text-[#0B5E2B] px-2.5 py-0.5 rounded-md border border-[#AEE0BD]">
                      SMART DC · RECEIVING FRESH
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-[#1F1F1F] mt-1">
                    ใบรายการแผนงานสุ่มชั่งสินค้าสดดิจิทัลประจำวัน (Daily Catch Weight Sampling Plan)
                  </h1>
                  <p className="text-[11px] text-[#6E6E6E]">
                    สำหรับตรวจสอบล่วงหน้า: เลขใบนัดหมาย, PO, รายการสินค้า, จำนวนตะกร้าที่รับจริง และจำนวนที่ต้องสุ่มชั่งตามเกณฑ์
                  </p>
                </div>

                <div className="text-right text-[11px] text-[#495057] space-y-0.5">
                  <div>วันที่จัดทำ/พิมพ์: <b>{new Date().toLocaleDateString('th-TH')}</b></div>
                  <div>ผู้ปฏิบัติงาน: <b>{currentUser?.fullName || 'Receive Staff'}</b></div>
                  <div className="font-mono text-[#0B5E2B] font-bold">
                    {selectedApptFilter === 'ALL' ? 'แสดงข้อมูล: รวมทุกใบนัดหมาย' : `แสดงข้อมูล: ใบนัดหมาย ${selectedApptFilter}`}
                  </div>
                </div>
              </div>

              {/* KPI Summary Tiles on Paper */}
              <div className="grid grid-cols-6 gap-2 text-center mb-3 text-xs">
                <div className="bg-gray-50 p-2 rounded-lg border border-gray-300">
                  <span className="text-gray-500 block text-[10px] font-bold">ใบนัดหมาย</span>
                  <span className="text-sm sm:text-base font-black text-gray-800">{stats.uniqueAppts} ใบ</span>
                </div>
                <div className="bg-gray-50 p-2 rounded-lg border border-gray-300">
                  <span className="text-gray-500 block text-[10px] font-bold">ใบสั่งซื้อ (PO)</span>
                  <span className="text-sm sm:text-base font-black text-gray-800">{stats.uniquePos} PO</span>
                </div>
                <div className="bg-gray-50 p-2 rounded-lg border border-gray-300">
                  <span className="text-gray-500 block text-[10px] font-bold">รายการสินค้า</span>
                  <span className="text-sm sm:text-base font-black text-gray-800">{stats.totalItems} SKU</span>
                </div>
                <div className="bg-teal-50 p-2 rounded-lg border border-teal-300">
                  <span className="text-teal-800 block text-[10px] font-black">มากี่ตะกร้า (รวมรับ)</span>
                  <span className="text-sm sm:text-base font-black text-teal-900">{stats.totalIncomingBaskets} ตะกร้า</span>
                </div>
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-300">
                  <span className="text-emerald-800 block text-[10px] font-black">สุ่มชั่งกี่ตะกร้า (เกณฑ์)</span>
                  <span className="text-sm sm:text-base font-black text-emerald-900">{stats.totalRequiredSamples} ตะกร้า</span>
                </div>
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-300">
                  <span className="text-amber-800 block text-[10px] font-black">สุ่มชั่งเสร็จแล้ว</span>
                  <span className="text-sm sm:text-base font-black text-amber-900">{stats.totalCompletedSamples} ตะกร้า</span>
                </div>
              </div>

              {/* Structured Printable Table */}
              <div className="border border-gray-400 overflow-hidden rounded-none mb-6">
                <table className="w-full text-left border-collapse text-xs table-fixed">
                  <thead className="bg-gray-200 text-gray-900 font-black text-[11px] border-b border-gray-400">
                    <tr>
                      <th className="w-[4%] py-2 px-1 border-r border-gray-300 text-center">ลำดับ</th>
                      <th className="w-[11%] py-2 px-1 border-r border-gray-300 text-center">เลขที่ PO / ใบนัด</th>
                      <th className="w-[11%] py-2 px-1 border-r border-gray-300 text-center">รหัสสินค้า</th>
                      <th className="w-[28%] py-2 px-2 border-r border-gray-300 text-left">รายการสินค้า (Description)</th>
                      <th className="w-[6%] py-2 px-1 border-r border-gray-300 text-center">ภาชนะ</th>
                      <th className="w-[7%] py-2 px-1 border-r border-gray-300 text-center leading-tight">
                        <div>เกณฑ์</div>
                        <div className="text-[10px] text-gray-600 font-normal">นน.</div>
                      </th>
                      <th className="w-[9%] py-2 px-1 border-r border-gray-300 text-center leading-tight bg-teal-50 text-teal-900 font-black">
                        <div>มา</div>
                        <div className="text-[10px] text-teal-800 font-normal">กี่ตะกร้า</div>
                      </th>
                      <th className="w-[10%] py-2 px-1 border-r border-gray-300 text-center leading-tight bg-emerald-50 text-emerald-900 font-black">
                        <div>สุ่มชั่ง</div>
                        <div className="text-[10px] text-emerald-800 font-normal">กี่ตะกร้า</div>
                      </th>
                      <th className="w-[6%] py-2 px-1 border-r border-gray-300 text-center leading-tight">
                        <div>ชั่งแล้ว</div>
                      </th>
                      <th className="w-[8%] py-2 px-1 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300 text-[11px]">
                    {groupedByAppt.map(([apptNbr, items]) => {
                      const apptInfo = apptMap.get(apptNbr);
                      const timeStr = formatApptTime(apptInfo?.apptTime);
                      const vendorName = resolveVendorName(items[0]?.vendorNbr, items[0]?.vendorName);

                      const subIncoming = items.reduce((sum, i) => sum + (i.confirmedActualQty ?? i.importedRcvdContQty ?? i.apptContQty ?? 0), 0);
                      const subRequired = items.reduce((sum, i) => sum + (i.requiredSamples ?? 0), 0);
                      const subCompleted = items.reduce((sum, i) => sum + (i.completedSamples ?? 0), 0);

                      return (
                        <React.Fragment key={`preview-${apptNbr}`}>
                          {/* Appointment Header */}
                          <tr className="bg-gray-100 text-black border-t border-b border-gray-400 font-bold">
                            <td colSpan={10} className="py-1.5 px-2">
                              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono bg-gray-800 text-white px-1.5 py-0.5 rounded text-[10px]">
                                    ใบนัดหมาย: {apptNbr}
                                  </span>
                                  <span>{timeStr} · {apptInfo?.carrierCode || 'VN'}</span>
                                  <span>ผู้ขาย: <b className="text-gray-900">{vendorName}</b></span>
                                </div>
                                <div className="text-[10px] text-gray-700">
                                  รวม: มา <b>{subIncoming}</b> ตะกร้า | สุ่มชั่ง <b>{subRequired}</b> ตะกร้า
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Items List */}
                          {items.map((item, idx) => {
                            const incoming = item.confirmedActualQty ?? item.importedRcvdContQty ?? item.apptContQty ?? 0;
                            const required = item.requiredSamples ?? Math.ceil(incoming * 0.1);
                            const comp = item.completedSamples ?? 0;
                            const basket = item.containerType || item.defaultBasketCode || item.uda6 || 'O';
                            const isDone = item.samplingStatus === 'ชั่งครบ' || item.samplingStatus === 'ผิดเกณฑ์' || item.samplingStatus === 'ไม่มาตามแผน' || item.samplingStatus === 'ไม่มาส่ง' || item.confirmedActualQty === 0 || (required > 0 && comp >= required);
                            const isInProgress = !isDone && comp > 0;
                            const stdWeight = item.standardWeightKg ? `${item.standardWeightKg} kg` : (item.spExpression || '-');

                            return (
                              <tr key={`prev-item-${item.id}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono text-[10px] text-gray-500">
                                  {idx + 1}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono font-bold text-gray-900">
                                  <div className="text-[11px]">{item.poNbr}</div>
                                  <div className="text-[9px] text-gray-500">ใบนัด: {item.apptNbr}</div>
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono font-bold text-gray-900 text-[11px]">
                                  {item.itemId}
                                </td>
                                <td className="py-1 px-2 border-r border-gray-300 font-medium text-gray-900 leading-snug break-words">
                                  {cleanThaiText(item.description)}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-bold text-gray-700">
                                  {basket}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono text-gray-700">
                                  {stdWeight}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono font-bold bg-teal-50/60 text-teal-900">
                                  {incoming}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono font-bold bg-emerald-50/60 text-emerald-900">
                                  {required}
                                </td>
                                <td className="py-1 px-1 border-r border-gray-300 text-center font-mono text-gray-700">
                                  {comp}
                                </td>
                                <td className="py-1 px-1 text-center font-bold text-[10px]">
                                  {isDone ? (
                                    <span className="text-emerald-700">ชั่งครบ</span>
                                  ) : isInProgress ? (
                                    <span className="text-blue-700">กำลังชั่ง</span>
                                  ) : (
                                    <span className="text-amber-700">รอชั่ง</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Subtotal Row */}
                          <tr className="bg-gray-100 font-bold text-[11px] border-b border-gray-400">
                            <td colSpan={6} className="py-1 px-2 border-r border-gray-300 text-right text-gray-800">
                              รวมใบนัดหมาย {apptNbr} ({items.length} รายการ):
                            </td>
                            <td className="py-1 px-2 border-r border-gray-300 text-center font-mono font-bold text-teal-900 bg-teal-100/50">
                              {subIncoming} ตะกร้า
                            </td>
                            <td className="py-1 px-2 border-r border-gray-300 text-center font-mono font-bold text-emerald-900 bg-emerald-100/50">
                              {subRequired} ตะกร้า
                            </td>
                            <td className="py-1 px-1 border-r border-gray-300 text-center font-mono text-gray-700">
                              {subCompleted}
                            </td>
                            <td className="py-1 px-1" />
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* Grand Total Footer */}
                  <tfoot className="bg-gray-200 font-black text-[11px] border-t-2 border-gray-600">
                    <tr>
                      <td colSpan={6} className="py-1.5 px-2 border-r border-gray-400 text-right text-gray-900">
                        ยอดรวมทั้งหมด ({stats.uniqueAppts} ใบนัด · {stats.uniquePos} PO · {stats.totalItems} รายการ):
                      </td>
                      <td className="py-1.5 px-2 border-r border-gray-400 text-center font-mono font-black text-teal-900 bg-teal-200/50">
                        {stats.totalIncomingBaskets} ตะกร้า
                      </td>
                      <td className="py-1.5 px-2 border-r border-gray-400 text-center font-mono font-black text-emerald-900 bg-emerald-200/50">
                        {stats.totalRequiredSamples} ตะกร้า
                      </td>
                      <td className="py-1.5 px-1 border-r border-gray-400 text-center font-mono font-black text-gray-800">
                        {stats.totalCompletedSamples}
                      </td>
                      <td className="py-1.5 px-1" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures on Paper */}
              <div className="grid grid-cols-2 gap-8 pt-6 mt-4 border-t border-gray-300 text-xs">
                <div className="text-center space-y-3">
                  <p className="font-bold text-gray-700">พนักงานตรวจรับ (Receive Staff ผู้จัดทำแผนงาน):</p>
                  <div className="h-8 border-b border-dashed border-gray-400 w-3/4 mx-auto" />
                  <p className="text-[11px] text-gray-600">ลงชื่อ ................................................................ วันที่ ..... / ..... / .........</p>
                </div>
                <div className="text-center space-y-3">
                  <p className="font-bold text-gray-700">ผู้ตรวจสอบและรับทราบ (OTM / หัวหน้ากะ):</p>
                  <div className="h-8 border-b border-dashed border-gray-400 w-3/4 mx-auto" />
                  <p className="text-[11px] text-gray-600">ลงชื่อ ................................................................ วันที่ ..... / ..... / .........</p>
                </div>
              </div>

              {/* Bottom Quick-Print Buttons */}
              <div className="mt-8 pt-4 border-t border-gray-200 flex justify-center items-center gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black px-6 py-3 rounded-xl text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์เอกสารนี้ออกเครื่องพิมพ์</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-3 rounded-xl text-sm transition-all cursor-pointer"
                >
                  ย้อนกลับ
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
