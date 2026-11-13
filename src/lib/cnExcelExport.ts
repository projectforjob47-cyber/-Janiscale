// ============================================================
// SMART DC — cnExcelExport.ts
// Lotus's SRRDC Receiving Fresh Official CN Report Excel Exporter
// Includes:
// 1. Sheet 1: Lotus's Standard CN Summary & Basket Matrix Table (with Sample Columns)
// 2. Sheet 2: Itemized Basket Breakdown (Gross, Tare, Net for every single basket)
// ============================================================

import ExcelJS from 'exceljs';
import type { CNCase, Measurement } from '../types';

export interface ExportCNOptions {
  cases: CNCase[];
  selectedAppt: string; // 'ALL' or specific apptNbr
  operatorName?: string;
  getCaseMeasurements?: (c: CNCase) => Measurement[];
}

const cleanText = (s: string | null | undefined): string => {
  if (!s) return '-';
  const c = s.replace(/[\uFFFD\u00ef\u00bf\u00bd]/g, '').trim();
  return c || '-';
};

export async function exportCNReportToExcel({
  cases,
  selectedAppt,
  operatorName = 'Receive Staff',
  getCaseMeasurements = () => []
}: ExportCNOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lotus's SRRDC Receiving Fresh";
  workbook.lastModifiedBy = operatorName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const isSingleAppt = selectedAppt !== 'ALL';
  const today = new Date();
  const dateStr = today.toLocaleDateString('th-TH');
  const dateFileStr = today.toISOString().split('T')[0];
  const timeStr = today.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // Calculate maximum samples across all cases
  let maxSamples = 0;
  cases.forEach(c => {
    const ms = getCaseMeasurements(c);
    if (ms.length > maxSamples) maxSamples = ms.length;
  });
  if (maxSamples === 0) maxSamples = 3;

  // Thin border helper
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD4D4D4' } },
    left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
    bottom: { style: 'thin', color: { argb: 'FFD4D4D4' } },
    right: { style: 'thin', color: { argb: 'FFD4D4D4' } },
  };

  // ══════════════════════════════════════════════════════════════
  // SHEET 1: CN SUMMARY & BASKET MATRIX TABLE
  // ══════════════════════════════════════════════════════════════
  const sheetTitle = isSingleAppt ? `CN_Appt_${selectedAppt}` : 'CN_Summary_All';
  const worksheet = workbook.addWorksheet(sheetTitle, {
    views: [{ showGridLines: true }]
  });

  const totalCols = 8 + maxSamples + 3; // 8 base + samples + actual, kg/case, cn
  const endColLetter = (n: number) => {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - m) / 26);
    }
    return s;
  };
  const lastCol = endColLetter(totalCols);

  // ─── 1. BANNER ROW 1: LOTUS'S BRAND HEADER ─────────────────────
  worksheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `Lotus's — รายงานเอกสารการ CN และผลสุ่มชั่งรายตะกร้า By SRRDC Receiving Fresh`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF008276' } // Lotus's Deep Teal
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 36;

  // ─── 2. BANNER ROW 2: SCOPE & DATE INFO ────────────────────────
  const midColIndex = Math.max(Math.floor(totalCols / 2), 6);
  const midColLetter = endColLetter(midColIndex);
  const midColNextLetter = endColLetter(midColIndex + 1);

  worksheet.mergeCells(`A2:${midColLetter}2`);
  const scopeCell = worksheet.getCell('A2');
  scopeCell.value = isSingleAppt
    ? `เฉพาะใบนัดหมาย ${selectedAppt} (ผู้ขาย: ${cleanText(cases[0]?.vendorName)})`
    : `รวมทุกใบนัดหมาย (${new Set(cases.map(c => c.apptNbr)).size} ใบนัด)`;
  scopeCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F1F1F' } };
  scopeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
  scopeCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  worksheet.mergeCells(`${midColNextLetter}2:${lastCol}2`);
  const dateCell = worksheet.getCell(`${midColNextLetter}2`);
  dateCell.value = `วันที่พิมพ์: ${dateStr} เวลา ${timeStr} น.`;
  dateCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF4A4A4A' } };
  dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getRow(2).height = 24;

  // Empty separator row
  worksheet.addRow([]);
  worksheet.getRow(3).height = 8;

  // ─── 3. TABLE HEADERS (ROW 4) ──────────────────────────────────
  const baseHeaders = [
    'ลำดับ',
    'ใบนัดหมาย',
    'Vender Name (ชื่อผู้ขาย)',
    'PO Number',
    'Item Number',
    'Item Description (ชื่อสินค้า)',
    '(case) จำนวน',
    'size (Kg) เกณฑ์'
  ];

  const sampleHeaders = Array.from({ length: maxSamples }).map((_, i) => `ตะกร้าที่ ${i + 1} (kg)`);

  const endHeaders = [
    'Actual (Kg) ชั่งจริงเฉลี่ย',
    'Kg/case ขาด/หน่วย',
    'CN (kg) ยอดรวม'
  ];

  const allHeaders = [...baseHeaders, ...sampleHeaders, ...endHeaders];
  const headerRow = worksheet.addRow(allHeaders);
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Highlight sample columns with turquoise, CN with dark green
    if (colNumber > 8 && colNumber <= 8 + maxSamples) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008276' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12803C' } };
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0B5E2B' } },
      left: { style: 'thin', color: { argb: 'FFAEE0BD' } },
      bottom: { style: 'medium', color: { argb: 'FF0B5E2B' } },
      right: { style: 'thin', color: { argb: 'FFAEE0BD' } },
    };
  });

  let rowIndex = 5;

  // ─── DATA ROWS ────────────────────────────────────────────────
  const grouped = new Map<string, CNCase[]>();
  cases.forEach(c => {
    const appt = c.apptNbr || 'UNKNOWN';
    if (!grouped.has(appt)) grouped.set(appt, []);
    grouped.get(appt)!.push(c);
  });

  let globalItemIndex = 1;
  let grandTotalCases = 0;
  let grandTotalWeight = 0;

  grouped.forEach((apptCases, appt) => {
    const vendorName = cleanText(apptCases[0]?.vendorName);

    // Group Header Row
    const groupHeaderRow = worksheet.addRow([
      '',
      `🚚 ใบนัดหมาย ${appt} — ผู้ขาย: ${vendorName} (${apptCases.length} รายการ CN)`
    ]);
    groupHeaderRow.height = 24;
    worksheet.mergeCells(`B${rowIndex}:${lastCol}${rowIndex}`);
    const secTitle = worksheet.getCell(`B${rowIndex}`);
    secTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0B5E2B' } };
    secTitle.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    groupHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFAEE0BD' } },
        bottom: { style: 'thin', color: { argb: 'FFAEE0BD' } }
      };
    });
    rowIndex++;

    let subCases = 0;
    let subWeight = 0;

    apptCases.forEach((c) => {
      const ms = getCaseMeasurements(c);
      subCases += (c.totalActualCases || 0);
      subWeight += (c.cnTotalKg || 0);
      grandTotalCases += (c.totalActualCases || 0);
      grandTotalWeight += (c.cnTotalKg || 0);

      // Prepare row values
      const sampleVals = Array.from({ length: maxSamples }).map((_, sIdx) => {
        const m = ms.find(s => s.sampleNumber === sIdx + 1) || ms[sIdx];
        return m ? Number(m.netWeightKg.toFixed(2)) : null;
      });

      const rowValues = [
        globalItemIndex++,
        `${c.apptNbr}`,
        cleanText(c.vendorName),
        c.poNbr || '-',
        c.itemId || '-',
        cleanText(c.description),
        c.totalActualCases || 0,
        c.standardWeightKg || 0,
        ...sampleVals,
        c.actualAverageNetKg || 0,
        c.shortagePerCaseKg || 0,
        c.cnTotalKg || 0
      ];

      const row = worksheet.addRow(rowValues);
      row.height = 22;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF1F1F1F' } };

        if (colNumber === 1 || colNumber === 2 || colNumber === 4 || colNumber === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 3 || colNumber === 6) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (colNumber === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.numFmt = '#,##0';
          cell.font = { name: 'Calibri', size: 10.5, bold: true };
        } else if (colNumber > 8 && colNumber <= 8 + maxSamples) {
          // Basket sample values
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
          cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF12803C' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FDFB' } };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
          if (colNumber === 8 + maxSamples + 1) { // Actual
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF12803C' } };
          } else if (colNumber === 8 + maxSamples + 2 || colNumber === 8 + maxSamples + 3) { // Shortage / CN
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFE03131' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5F5' } };
          }
        }
      });
      rowIndex++;
    });

    // Subtotal Row for Appointment
    const subtotalRowValues = new Array(totalCols).fill('');
    subtotalRowValues[1] = `รวมเฉพาะใบนัดหมาย ${appt}`;
    subtotalRowValues[6] = subCases;
    subtotalRowValues[totalCols - 1] = Number(subWeight.toFixed(2));

    const subRow = worksheet.addRow(subtotalRowValues);
    subRow.height = 24;

    worksheet.mergeCells(`B${rowIndex}:F${rowIndex}`);
    const subLabel = worksheet.getCell(`B${rowIndex}`);
    subLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    subLabel.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF4A4A4A' } };

    subRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F2EA' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBDBDBD' } },
        bottom: { style: 'medium', color: { argb: 'FFBDBDBD' } },
        left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
        right: { style: 'thin', color: { argb: 'FFD4D4D4' } }
      };

      if (colNumber === 7) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '#,##0';
        cell.font = { name: 'Calibri', size: 11, bold: true };
      } else if (colNumber === totalCols) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFE03131' } };
      }
    });
    rowIndex++;
  });

  // ─── GRAND TOTAL ROW ───────────────────────────────────────────
  const grandTotalRowValues = new Array(totalCols).fill('');
  grandTotalRowValues[1] = 'ยอดรวมสุทธิทุกใบนัดหมาย (Grand Total)';
  grandTotalRowValues[6] = grandTotalCases;
  grandTotalRowValues[totalCols - 1] = Number(grandTotalWeight.toFixed(2));

  const grandRow = worksheet.addRow(grandTotalRowValues);
  grandRow.height = 28;

  worksheet.mergeCells(`B${rowIndex}:F${rowIndex}`);
  const grandLabel = worksheet.getCell(`B${rowIndex}`);
  grandLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  grandLabel.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0B5E2B' } };

  grandRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF12803C' } },
      bottom: { style: 'double', color: { argb: 'FF12803C' } },
      left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
      right: { style: 'thin', color: { argb: 'FFD4D4D4' } }
    };

    if (colNumber === 7) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.numFmt = '#,##0';
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0B5E2B' } };
    } else if (colNumber === totalCols) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0.00';
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFE03131' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE3E3' } };
    }
  });
  rowIndex++;

  // ─── AUTO-FIT COLUMN WIDTHS FOR SHEET 1 ────────────────────────
  const colWidths = [
    { width: 8 },  // ลำดับ
    { width: 14 }, // ใบนัดหมาย
    { width: 26 }, // Vender Name
    { width: 15 }, // PO Number
    { width: 15 }, // Item Number
    { width: 34 }, // Item Description
    { width: 12 }, // (case)
    { width: 14 }, // size (Kg)
    ...Array.from({ length: maxSamples }).map(() => ({ width: 16 })), // Sample columns
    { width: 16 }, // Actual (Kg)
    { width: 16 }, // Kg/case
    { width: 16 }  // CN (kg)
  ];
  worksheet.columns = colWidths;


  // ══════════════════════════════════════════════════════════════
  // SHEET 2: ITEMIZED BASKET BREAKDOWN (Gross, Tare, Net for every basket)
  // ══════════════════════════════════════════════════════════════
  const sheet2 = workbook.addWorksheet('รายละเอียดสุ่มชั่งรายตะกร้า', {
    views: [{ showGridLines: true }]
  });

  // Sheet 2 Title Banner
  sheet2.mergeCells('A1:L1');
  const s2Title = sheet2.getCell('A1');
  s2Title.value = `Lotus's — รายละเอียดการสุ่มชั่งรายตะกร้า (Gross / Tare / Net Breakdown)`;
  s2Title.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00ADB5' } };
  s2Title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(1).height = 32;

  // Sheet 2 Headers
  const s2Headers = [
    'ลำดับ',
    'ใบนัดหมาย',
    'PO Number',
    'Item Number',
    'ชื่อสินค้า (Description)',
    'ผู้ขาย (Vendor)',
    'ตะกร้าที่',
    'ชั่งรวม Gross (kg)',
    'รหัสตะกร้า',
    'หัก Tare (kg)',
    'สุทธิ Net (kg)',
    'เกณฑ์ size (kg)',
    'ผลต่าง (kg)'
  ];

  const s2HeaderRow = sheet2.addRow(s2Headers);
  s2HeaderRow.height = 26;
  s2HeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008276' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  let s2Index = 1;
  cases.forEach(c => {
    const ms = getCaseMeasurements(c);
    ms.forEach(m => {
      const diff = Number((m.netWeightKg - c.standardWeightKg).toFixed(2));
      const sRow = sheet2.addRow([
        s2Index++,
        `${c.apptNbr}`,
        c.poNbr || '-',
        c.itemId || '-',
        cleanText(c.description),
        cleanText(c.vendorName),
        `ตะกร้าที่ ${m.sampleNumber}`,
        Number(m.grossWeightKg.toFixed(2)),
        m.basketCode || '-',
        Number(m.tareWeightKg.toFixed(2)),
        Number(m.netWeightKg.toFixed(2)),
        Number(c.standardWeightKg.toFixed(2)),
        diff
      ]);
      sRow.height = 20;

      sRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder;
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1F1F1F' } };

        if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4 || colNumber === 7 || colNumber === 9) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 5 || colNumber === 6) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
          if (colNumber === 11) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF12803C' } };
          } else if (colNumber === 13) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: diff < 0 ? 'FFE03131' : 'FF12803C' } };
          }
        }
      });
    });

    // Item Average Row for this SKU
    const avgGross = ms.length > 0 ? ms.reduce((s, m) => s + m.grossWeightKg, 0) / ms.length : 0;
    const avgTare = ms.length > 0 ? ms.reduce((s, m) => s + m.tareWeightKg, 0) / ms.length : 0;
    const avgRow = sheet2.addRow([
      '',
      `${c.apptNbr}`,
      c.poNbr || '-',
      c.itemId || '-',
      `📊 ค่าเฉลี่ยสินค้า [${c.itemId}] ${cleanText(c.description)} (รับจริง: ${c.totalActualCases} กล่อง)`,
      cleanText(c.vendorName),
      `เฉลี่ย ${ms.length} ตะกร้า`,
      Number(avgGross.toFixed(2)),
      '—',
      Number(avgTare.toFixed(2)),
      Number((c.actualAverageNetKg || 0).toFixed(2)),
      Number((c.standardWeightKg || 0).toFixed(2)),
      Number((-(c.shortagePerCaseKg || 0)).toFixed(2))
    ]);
    avgRow.height = 22;
    avgRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7ED' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFAEE0BD' } },
        bottom: { style: 'medium', color: { argb: 'FF12803C' } },
        left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
        right: { style: 'thin', color: { argb: 'FFD4D4D4' } }
      };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0B5E2B' } };

      if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4 || colNumber === 7 || colNumber === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 5 || colNumber === 6) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
        if (colNumber === 11) {
          cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF12803C' } };
        } else if (colNumber === 13) {
          cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFE03131' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE3E3' } };
        }
      }
    });
  });

  sheet2.columns = [
    { width: 8 },  // ลำดับ
    { width: 14 }, // ใบนัดหมาย
    { width: 15 }, // PO
    { width: 15 }, // Item Number
    { width: 32 }, // ชื่อสินค้า
    { width: 24 }, // ผู้ขาย
    { width: 14 }, // ตะกร้าที่
    { width: 16 }, // ชั่งรวม Gross
    { width: 12 }, // รหัสตะกร้า
    { width: 14 }, // หัก Tare
    { width: 16 }, // สุทธิ Net
    { width: 14 }, // เกณฑ์ size
    { width: 14 }  // ผลต่าง
  ];

  // ─── WRITE FILE TO DOWNLOAD ────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = isSingleAppt
    ? `รายงาน_CN_พร้อมผลสุ่มชั่ง_ใบนัด_${selectedAppt}_${dateFileStr}.xlsx`
    : `รายงาน_CN_พร้อมผลสุ่มชั่ง_รวมทุกใบนัดหมาย_${dateFileStr}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}