// ============================================================
// Google Sheets Auto-Sync Service
// Lotus's Smart DC Receiving Fresh
// ============================================================

import { db } from './database';
import type { Measurement } from '../types';

const DEFAULT_WEBHOOK_KEY = 'GOOGLE_SHEETS_WEBHOOK_URL';
const BUILTIN_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzYVG-GLYEdBpAJxWzb9xPu5Aml03QXBsitPj5eIP_DxvO9EYItD6zMqERHtpjF1GVM4Q/exec';

export function getGoogleSheetsWebhookUrl(): string {
  return localStorage.getItem(DEFAULT_WEBHOOK_KEY) || BUILTIN_WEBHOOK_URL;
}

export function setGoogleSheetsWebhookUrl(url: string): void {
  localStorage.setItem(DEFAULT_WEBHOOK_KEY, url.trim());
}

export interface SyncToSheetsResult {
  success: boolean;
  message: string;
  rowCount?: number;
}

/**
 * Sends completed weighing and CN records for an appointment to Google Sheets via Webhook
 */
export async function syncAppointmentToGoogleSheets(apptNbr: string): Promise<SyncToSheetsResult> {
  const webhookUrl = getGoogleSheetsWebhookUrl();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'ยังไม่ได้ระบุลิงก์ Google Sheets Webhook (กรุณาใส่ลิงก์ Webhook ในการตั้งค่า)',
    };
  }

  try {
    const appt = await db.appointments.where('apptNbr').equals(apptNbr).first();
    const groups = await db.samplingGroups.where('apptNbr').equals(apptNbr).toArray();
    const signatures = await db.signatureRecords.where('apptNbr').equals(apptNbr).toArray();

    const sortedSigs = [...signatures].sort((a, b) => (b.signedAt || '').localeCompare(a.signedAt || ''));
    const receiveSig = sortedSigs.find(s => s.signerRole === 'RECEIVE' && s.signatureData) || sortedSigs.find(s => s.signerRole === 'RECEIVE');
    const otmSig = sortedSigs.find(s => s.signerRole === 'OTM' && s.signatureData) || sortedSigs.find(s => s.signerRole === 'OTM');
    const vendorSig = sortedSigs.find(s => (s.signerRole === 'VENDOR' || s.signerRole === 'DRIVER') && s.signatureData) || sortedSigs.find(s => s.signerRole === 'VENDOR' || s.signerRole === 'DRIVER');
    const lpsSig = sortedSigs.find(s => s.signerRole === 'LPS' && s.signatureData) || sortedSigs.find(s => s.signerRole === 'LPS');

    const staffName = receiveSig?.signerName || '-';
    const otmName = otmSig?.signerName || '-';
    const driverName = vendorSig?.signerName || '-';

    // Load master baskets from database
    const allBaskets = await db.basketMaster.toArray().catch(() => []);
    const basketMap = new Map(allBaskets.map(b => [(b.code || '').trim().toUpperCase(), b.tareWeightKg]));
    const DEFAULT_BASKET_WEIGHTS: Record<string, number> = {
      ZN: 2.20,
      Z: 2.20,
      W: 0.85,
      X: 0.60,
      F: 2.40,
      Y: 1.40,
      YN: 1.37,
      SF: 2.40,
      XN: 0.50,
    };

    // Build row payload for each sampling group
    const rows = [];
    const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    for (const group of groups) {
      const records: Measurement[] = await db.measurements.where('samplingGroupId').equals(group.id).toArray();
      const validRecords = records.filter(r => r.netWeightKg !== null && r.netWeightKg !== undefined);

      let avgNetKg = 0;
      let totalGrossKg = 0;
      let totalTareKg = 0;

      if (validRecords.length > 0) {
        totalGrossKg = Math.round(validRecords.reduce((sum: number, r: Measurement) => sum + (r.grossWeightKg || 0), 0) * 100) / 100;
        totalTareKg = Math.round(validRecords.reduce((sum: number, r: Measurement) => sum + (r.tareWeightKg || 0), 0) * 100) / 100;
        const totalNet = validRecords.reduce((sum: number, r: Measurement) => sum + (r.netWeightKg || 0), 0);
        avgNetKg = Math.round((totalNet / validRecords.length) * 100) / 100;
      }

      const stdKg = group.standardWeightKg || 0;
      const diffPerBasket = stdKg > 0 && avgNetKg > 0 ? Math.round((avgNetKg - stdKg) * 100) / 100 : 0;
      const totalBaskets = group.confirmedActualQty || group.apptContQty || 0;
      const isCN = group.samplingStatus === 'ผิดเกณฑ์' || diffPerBasket < 0;
      const cnTotalKg = isCN && diffPerBasket < 0 ? Math.round(Math.abs(diffPerBasket) * totalBaskets * 100) / 100 : 0;

      const containerType = (group.containerType || group.defaultBasketCode || (validRecords.length > 0 ? validRecords[0].basketCode : '-') || '-').trim().toUpperCase();
      let tarePerBasket = 0;

      if (containerType === 'O' || validRecords.some(r => r.basketCode === 'O')) {
        // ชนิด O: ค่าน้ำหนักที่พนักงานกรอกเอง
        const recordWithO = validRecords.find(r => r.basketCode === 'O' && r.tareWeightKg !== undefined && r.tareWeightKg !== null);
        if (recordWithO && recordWithO.tareWeightKg !== undefined) {
          tarePerBasket = Number(recordWithO.tareWeightKg.toFixed(2));
        } else if (group.defaultTareWeightKg) {
          tarePerBasket = Number(group.defaultTareWeightKg.toFixed(2));
        }
      } else {
        // ตะกร้ามาตรฐานอื่นๆ (X, W, ZN ฯลฯ): ดึงน้ำหนักตามข้อมูลหลังบ้าน Basket Master
        if (validRecords.length > 0 && validRecords[0].tareWeightKg) {
          tarePerBasket = Number(validRecords[0].tareWeightKg.toFixed(2));
        } else if (basketMap.has(containerType)) {
          tarePerBasket = Number(basketMap.get(containerType)!.toFixed(2));
        } else if (DEFAULT_BASKET_WEIGHTS[containerType] !== undefined) {
          tarePerBasket = Number(DEFAULT_BASKET_WEIGHTS[containerType].toFixed(2));
        } else if (group.defaultTareWeightKg) {
          tarePerBasket = Number(group.defaultTareWeightKg.toFixed(2));
        } else {
          tarePerBasket = 0.60;
        }
      }

      rows.push({
        timestamp: nowStr,
        apptNbr: group.apptNbr,
        poNbr: group.poNbr || '-',
        vendorName: group.vendorName || '-',
        carrierCode: group.carrierCode || appt?.carrierCode || '-',
        driverName: driverName,
        itemId: group.itemId,
        description: group.description,
        containerType: containerType,
        tareWeightPerBasket: tarePerBasket,
        tareWeightO: tarePerBasket,
        totalBaskets: totalBaskets,
        sampleCount: validRecords.length,
        totalGrossKg: totalGrossKg,
        totalTareKg: totalTareKg,
        stdWeightKg: stdKg,
        avgNetWeightKg: avgNetKg,
        diffPerBasketKg: diffPerBasket,
        samplingStatus: group.samplingStatus,
        isCN: isCN ? 'ใช่ (ผิดเกณฑ์)' : 'ปกติ (ผ่าน)',
        cnTotalKg: cnTotalKg,
        staffName: staffName,
        otmName: otmName,
        signatureLink: `https://smart-dc-delta.vercel.app/appointment/${encodeURIComponent(group.apptNbr)}/summary`,
        signatureFormula: `=HYPERLINK("https://smart-dc-delta.vercel.app/appointment/${encodeURIComponent(group.apptNbr)}/summary", "🔗 ดูลายเซ็นต์จริง")`,
      });
    }

    if (rows.length === 0) {
      return {
        success: false,
        message: 'ไม่พบรายการสินค้าในใบนัดหมายนี้',
      };
    }

    // Send payload to Google Apps Script Web App
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'ADD_WEIGHING_RECORDS',
        apptNbr,
        signatures: {
          vendor: vendorSig?.signatureData || '',
          vendorName: vendorSig?.signerName || '',
          receive: receiveSig?.signatureData || '',
          receiveName: receiveSig?.signerName || '',
          lps: lpsSig?.signatureData || '',
          lpsName: lpsSig?.signerName || '',
          otm: otmSig?.signatureData || '',
          otmName: otmSig?.signerName || '',
        },
        rows,
      }),
    });

    const sigStatusParts = [
      vendorSig?.signatureData ? 'Vendor: ✓' : 'Vendor: -',
      receiveSig?.signatureData ? 'Receive: ✓' : 'Receive: -',
    ];
    if (lpsSig?.signatureData) sigStatusParts.push('LP&S: ✓');

    return {
      success: true,
      message: `ส่งข้อมูล ${rows.length} รายการ (แนบภาพลายเซ็น: ${sigStatusParts.join(', ')}) เข้า Google Sheets เรียบร้อยแล้ว!`,
      rowCount: rows.length,
    };
  } catch (error: any) {
    console.error('Google Sheets sync error:', error);
    return {
      success: false,
      message: 'เกิดข้อผิดพลาดในการส่งข้อมูล: ' + (error?.message || String(error)),
    };
  }
}
