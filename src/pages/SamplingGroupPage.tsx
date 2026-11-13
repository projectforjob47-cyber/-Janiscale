// ============================================================
// SMART DC — SamplingGroupPage Component
// V3.0 Streamlined Receive Flow:
// 1. Choose Basket Size ONCE per SKU (Appointment + PO + SKU)
// 2. That basket size becomes default for ALL samples in this SKU
// 3. Fast Weight Entry: Enter Gross -> Auto Net (Gross - Tare)
// 4. In case actual basket differs on a sample, easily adjust before saving
// 5. Stores basketCode and tareWeightKg per weight record
// 6. Mandatory 10% sampling ceiling calculation
// 7. Summary & Tolerance (+-10%)
// ============================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { 
  Check, 
  AlertCircle, 
  Scale, 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft,
  FileCheck,
  AlertTriangle,
  Camera,
  CheckCircle2,
  RefreshCw,
  ShoppingBasket,
  ChevronDown,
  Edit2,
  Package,
  Info
} from 'lucide-react';
import { db } from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import { 
  calculateRequiredSamples, 
  calculateNetWeight, 
  calculateWeightSummary, 
  calculateCN,
  deriveSamplingStatus,
  formatWeight,
  formatPercent,
  getContainerNoun
} from '../lib/businessLogic';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import type { Measurement, BasketMasterItem } from '../types';
import { DEFAULT_BASKET_MASTER } from '../types';

export default function SamplingGroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();

  const group = useLiveQuery(async () => {
    if (!id) return null;
    return await db.samplingGroups.get(id);
  }, [id]);

  const measurements = useLiveQuery(async () => {
    if (!id) return [];
    return await db.measurements.where('samplingGroupId').equals(id).sortBy('sampleNumber');
  }, [id]) || [];

  const dbBaskets = useLiveQuery(async () => {
    return await db.basketMaster.toArray();
  }, []);

  // Guarantee list of baskets is NEVER empty (uses DEFAULT_BASKET_MASTER fallback)
  const basketList = (dbBaskets && dbBaskets.length > 0) 
    ? dbBaskets 
    : DEFAULT_BASKET_MASTER.map(b => ({ ...b, id: b.code }));

  // Basket options: 9 standard baskets + Container O
  const activeBasketOptions: Array<{ code: string; name: string; tareWeightKg: number }> = useMemo(() => {
    const allowedCodes = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'];
    const defaults: Record<string, { code: string; name: string; tareWeightKg: number }> = {
      ZN: { code: 'ZN', name: 'ตะกร้า ZN', tareWeightKg: 2.20 },
      Z:  { code: 'Z',  name: 'ตะกร้า Z',  tareWeightKg: 2.20 },
      W:  { code: 'W',  name: 'ตะกร้า W',  tareWeightKg: 0.85 },
      X:  { code: 'X',  name: 'ตะกร้า X',  tareWeightKg: 0.60 },
      F:  { code: 'F',  name: 'ตะกร้า F',  tareWeightKg: 2.40 },
      Y:  { code: 'Y',  name: 'ตะกร้า Y',  tareWeightKg: 1.40 },
      YN: { code: 'YN', name: 'ตะกร้า YN', tareWeightKg: 1.37 },
      SF: { code: 'SF', name: 'ตะกร้า SF', tareWeightKg: 2.40 },
      XN: { code: 'XN', name: 'ตะกร้า XN', tareWeightKg: 0.50 },
      O:  { code: 'O',  name: 'กล่อง / กระสอบ (ภาชนะ O)', tareWeightKg: 0 },
    };

    return allowedCodes.map(code => {
      const dbItem = (basketList as any[]).find((b: any) => b.code === code);
      if (dbItem && code !== 'O') {
        return {
          code: dbItem.code,
          name: dbItem.name || defaults[code].name,
          tareWeightKg: dbItem.tareWeightKg,
        };
      }
      return defaults[code];
    });
  }, [basketList]);

  // 1. Qty confirmation local state
  const [confirmedQtyInput, setConfirmedQtyInput] = useState<string>('');
  const [qtyReason, setQtyReason] = useState<string>('');
  const [isEditingQty, setIsEditingQty] = useState<boolean>(false);

  // 2. SKU-Level Basket Size Selection (Selected ONCE for the whole SKU)
  const [skuBasketCode, setSkuBasketCode] = useState<string>('X');
  const [customTareInput, setCustomTareInput] = useState<string>('');
  const [isChangingSkuBasket, setIsChangingSkuBasket] = useState<boolean>(false);

  // 3. Current Sample Tare Overrides (if this specific sample differs from SKU default)
  const [sampleBasketCode, setSampleBasketCode] = useState<string>('X');
  const [isCustomSampleBasket, setIsCustomSampleBasket] = useState<boolean>(false);

  // 4. Weight entry
  const [grossWeightInput, setGrossWeightInput] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // Overweight warning modal state (> 20% average deviation confirmation)
  interface OverweightWarningData {
    avgNet: number;
    standardWeight: number;
    percentDiff: number;
    allNetWeights: number[];
    grossKg: number;
    tareKg: number;
    netKg: number;
  }
  const [overweightWarning, setOverweightWarning] = useState<OverweightWarningData | null>(null);

  // Per-Item Overweight Abnormality Warning modal state (>= 30% individual item deviation)
  interface ItemOverweightWarningData {
    netKg: number;
    grossKg: number;
    tareKg: number;
    standardWeight: number;
    excessKg: number;
    excessPercent: number;
    thresholdPercent: number;
    sampleNumber: number;
    totalRequired: number;
  }
  const [itemOverweightWarning, setItemOverweightWarning] = useState<ItemOverweightWarningData | null>(null);

  // OTM Guard: OTM has verification and signing role only (redirect to otm-sign)
  useEffect(() => {
    if (currentUser?.role === 'OTM' && id) {
      navigate(`/otm-sign/${id}`, { replace: true });
    }
  }, [currentUser, id, navigate]);

  const prevGroupIdRef = useRef<string | null>(null);

  // Sync state when group loads
  useEffect(() => {
    if (group) {
      const isDifferentGroup = prevGroupIdRef.current !== group.id;
      prevGroupIdRef.current = group.id;

      if (isDifferentGroup) {
        // Confirmed Quantity Sync
        if (group.confirmedActualQty !== null && group.confirmedActualQty !== undefined) {
          setConfirmedQtyInput(String(group.confirmedActualQty));
          setIsEditingQty(false);
        } else {
          // V3.0 CRITICAL RULE: Use AK (Appt_cont_qty) as default
          const defQty = group.apptContQty !== null && group.apptContQty !== undefined 
            ? group.apptContQty 
            : (group.importedRcvdContQty !== null && group.importedRcvdContQty !== undefined ? group.importedRcvdContQty : 0);
          
          setConfirmedQtyInput(String(defQty));
          
          // Auto-initialize with default AK so sampling is active immediately
          if (defQty > 0) {
            const reqSamples = calculateRequiredSamples(defQty);
            const rawUda6 = group.uda6 ? String(group.uda6).trim().toUpperCase() : null;
            let initCode = 'X';
            const validCodes = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'];
            if (group.defaultBasketCode && validCodes.includes(group.defaultBasketCode)) {
              initCode = group.defaultBasketCode;
            } else if (rawUda6 && validCodes.includes(rawUda6)) {
              initCode = rawUda6;
            }
            const b = activeBasketOptions.find(item => item.code === initCode);
            const initTare = initCode === 'O' ? (group.defaultTareWeightKg || 0) : (b ? b.tareWeightKg : 0.60);

            db.samplingGroups.update(group.id, {
              confirmedActualQty: defQty,
              requiredSamples: reqSamples,
              defaultBasketCode: initCode,
              defaultTareWeightKg: initTare,
              workflowStatus: (group.completedSamples ?? 0) > 0 ? 'SAMPLING' : 'PENDING_QTY_CONFIRM',
              updatedAt: new Date().toISOString(),
            });
            setIsEditingQty(false);
          } else {
            setIsEditingQty(false);
          }
        }

        // SKU Basket Code Sync
        const rawUda6 = group.uda6 ? String(group.uda6).trim().toUpperCase() : null;
        let initialBasket = 'X';
        const validCodes = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'];
        if (group.defaultBasketCode && validCodes.includes(group.defaultBasketCode)) {
          initialBasket = group.defaultBasketCode;
        } else if (rawUda6 && validCodes.includes(rawUda6)) {
          initialBasket = rawUda6;
        }

        setSkuBasketCode(initialBasket);
        setSampleBasketCode(initialBasket);
        
        // Pre-fill tare weight from previous measurements or group default
        if (initialBasket === 'O') {
          db.measurements
            .where('samplingGroupId')
            .equals(group.id)
            .sortBy('sampleNumber')
            .then(existingList => {
              const lastWithTare = [...existingList].reverse().find(m => m.tareWeightKg && m.tareWeightKg > 0);
              if (lastWithTare) {
                setCustomTareInput(String(lastWithTare.tareWeightKg));
              } else if (group.defaultTareWeightKg && group.defaultTareWeightKg > 0) {
                setCustomTareInput(String(group.defaultTareWeightKg));
              } else {
                setCustomTareInput('');
              }
            });
        } else {
          setCustomTareInput('');
        }
      }
    } else {
      prevGroupIdRef.current = null;
    }
  }, [group?.id, activeBasketOptions]);

  if (!group) {
    return (
      <Layout title="รายละเอียดการสุ่มชั่ง" showBack>
        <div className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
      </Layout>
    );
  }

  // Find active tare items
  const activeSkuBasket = activeBasketOptions.find(b => b.code === skuBasketCode) || {
    tareWeightKg: skuBasketCode === 'SF' ? 2.40 : (skuBasketCode === 'Y' ? 1.40 : (skuBasketCode === 'Z' ? 2.20 : 0.60)),
    code: skuBasketCode,
    name: skuBasketCode === 'O' ? 'ภาชนะ O' : `ตะกร้า ${skuBasketCode}`
  };
  const activeSampleBasket = activeBasketOptions.find(b => b.code === sampleBasketCode) || activeSkuBasket;

  // Active Tare for the current sample
  const currentTareKg = isCustomSampleBasket
    ? (sampleBasketCode === 'O' ? (parseFloat(customTareInput) || 0) : activeSampleBasket.tareWeightKg)
    : (skuBasketCode === 'O' ? (parseFloat(customTareInput) || 0) : activeSkuBasket.tareWeightKg);
  const currentBasketCode = isCustomSampleBasket ? activeSampleBasket.code : activeSkuBasket.code;

  // Real-time calculation: Net = Gross - Tare
  const currentGross = parseFloat(grossWeightInput) || 0;
  const currentNet = calculateNetWeight(currentGross, currentTareKg);
  const itemNoun = getContainerNoun(group?.uda6 || skuBasketCode);

  // Handle Save SKU Basket Choice (Sets default for the entire SKU)
  const handleSaveSkuBasket = async (code: string) => {
    setSkuBasketCode(code);
    setSampleBasketCode(code);
    setIsCustomSampleBasket(false);
    setIsChangingSkuBasket(false);

    const b = activeBasketOptions.find(item => item.code === code);
    const newTare = code === 'O' ? (parseFloat(customTareInput) || 0) : (b ? b.tareWeightKg : 0.60);
    await db.samplingGroups.update(group.id, {
      defaultBasketCode: code,
      defaultTareWeightKg: b ? b.tareWeightKg : 0.85,
      updatedAt: new Date().toISOString(),
    });
  };

  // Handle Qty Confirmation
  const handleConfirmQty = async () => {
    const qty = parseInt(confirmedQtyInput, 10);
    if (isNaN(qty) || qty < 0) {
      alert('กรุณาระบุจำนวนตะกร้า/กล่องที่ถูกต้อง');
      return;
    }

    const defaultAK = group.apptContQty ?? 0;
    if (qty !== defaultAK && !qtyReason.trim()) {
      alert('กรณีจำนวนรับจริงไม่ตรงกับจำนวนตามแผน กรุณาระบุเหตุผลการปรับปรุงจำนวน');
      return;
    }

    const reqSamples = calculateRequiredSamples(qty);
    const now = new Date().toISOString();

    let deliveryStatus = group.deliveryStatus;
    if (qty === 0) {
      deliveryStatus = 'NOT_DELIVERED';
    } else if (group.apptContQty && qty < group.apptContQty) {
      deliveryStatus = 'PARTIAL_DELIVERY';
    } else if (qty !== defaultAK) {
      deliveryStatus = 'QUANTITY_DISCREPANCY';
    }

    await db.samplingGroups.update(group.id, {
      confirmedActualQty: qty,
      requiredSamples: reqSamples,
      defaultBasketCode: skuBasketCode,
      defaultTareWeightKg: activeSkuBasket.tareWeightKg,
      qtyConfirmedBy: currentUser?.fullName || 'Receive Staff',
      qtyConfirmedAt: now,
      qtyCorrectionReason: qty !== defaultAK ? qtyReason : null,
      deliveryStatus: deliveryStatus as any,
      workflowStatus: (group.completedSamples ?? 0) > 0 ? 'SAMPLING' : 'PENDING_QTY_CONFIRM',
      updatedAt: now,
    });

    setIsEditingQty(false);
  };

  // Execute measurement save (called directly or after overweight confirmation)
  const executeSaveMeasurement = async (overrideGross?: number, overrideTare?: number, overrideNet?: number) => {
    if (!group) return;

    const gross = overrideGross !== undefined ? overrideGross : currentGross;
    const tare = overrideTare !== undefined ? overrideTare : currentTareKg;
    const net = overrideNet !== undefined ? overrideNet : currentNet;

    const nextSampleNum = measurements.length + 1;
    const now = new Date().toISOString();

    const newMeasurement: Measurement = {
      id: uuidv4(),
      samplingGroupId: group.id,
      apptNbr: group.apptNbr,
      poNbr: group.poNbr,
      itemId: group.itemId,
      sampleNumber: nextSampleNum,
      grossWeightKg: gross,
      basketCode: currentBasketCode,
      tareWeightKg: tare,
      netWeightKg: net,
      photoEvidenceId: photoDataUrl ? uuidv4() : null,
      recordedBy: currentUser?.fullName || 'Receive Staff',
      recordedAt: now,
      isValid: true,
      syncStatus: 'SYNCED',
      notes: null,
    };

    await db.measurements.add(newMeasurement);

    const updatedMeasurements = [...measurements, newMeasurement];
    const completedCount = updatedMeasurements.length;

    // Recalculate summary if all required samples are completed
    let newSamplingStatus = group.samplingStatus;
    let newWeightResult = group.weightResult;

    if (completedCount >= group.requiredSamples && group.standardWeightKg) {
      const netWeights = updatedMeasurements.map(m => m.netWeightKg);
      const summary = calculateWeightSummary({
        standardWeightKg: group.standardWeightKg,
        netWeights,
        samplingGroupId: group.id,
        calculatedBy: currentUser?.fullName || 'Receive Staff',
        approvalVersion: group.approvalVersion,
      });

      const isUnderweight = summary.result === 'FAIL' && summary.differenceKg < 0;
      const isOverweight = summary.result === 'FAIL' && summary.differenceKg > 0;

      newSamplingStatus = summary.result === 'PASS' 
        ? 'ชั่งครบ' 
        : (isOverweight ? 'ชั่งครบ' : 'ผิดเกณฑ์');
      newWeightResult = summary.result;

      // Save summary
      await db.weightSummaries.put({
        ...summary,
        id: uuidv4(),
      });

      // Lotus's SRRDC Formula:
      // CN (kg) = (Standard Weight per Case − Average Actual Net Weight per Case) × Total Actual Received Cases
      const totalCases = group.confirmedActualQty || group.apptContQty || 0;
      const cnCalc = calculateCN(group.standardWeightKg, summary.averageNetKg, totalCases);

      // ONLY create CN Case record if weight is UNDERWEIGHT (น้ำหนักขาดหาย) and cnCalc.isEligibleForCN
      if (isUnderweight && cnCalc.isEligibleForCN) {
        const existingCn = await db.cnCases.where('samplingGroupId').equals(group.id).first();
        if (!existingCn) {
          await db.cnCases.add({
            id: uuidv4(),
            samplingGroupId: group.id,
            apptNbr: group.apptNbr,
            receiveDate: now.split('T')[0],
            poNbr: group.poNbr,
            itemId: group.itemId,
            description: group.description,
            vendorNbr: group.vendorNbr,
            vendorName: group.vendorName,
            totalActualCases: cnCalc.totalActualCases,
            standardWeightKg: cnCalc.standardWeightKg,
            actualAverageNetKg: cnCalc.actualAverageNetKg,
            shortagePerCaseKg: cnCalc.shortagePerCaseKg,
            cnTotalKg: cnCalc.cnTotalKg,
            failedSummaryId: group.id,
            weightDifferenceKg: summary.differenceKg,
            weightDifferencePercent: summary.differencePercent,
            cnStatus: 'PENDING',
            recordedBy: currentUser?.fullName || 'Receive Staff',
            responsiblePerson: null,
            reviewNotes: `ขาด ${cnCalc.shortagePerCaseKg} kg/กล่อง × ${cnCalc.totalActualCases} กล่อง = ยอด CN ${cnCalc.cnTotalKg} kg`,
            resolutionNotes: null,
            resolvedAt: null,
            resolvedBy: null,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db.cnCases.update(existingCn.id, {
            totalActualCases: cnCalc.totalActualCases,
            standardWeightKg: cnCalc.standardWeightKg,
            actualAverageNetKg: cnCalc.actualAverageNetKg,
            shortagePerCaseKg: cnCalc.shortagePerCaseKg,
            cnTotalKg: cnCalc.cnTotalKg,
            weightDifferenceKg: summary.differenceKg,
            weightDifferencePercent: summary.differencePercent,
            reviewNotes: `ปรับปรุงผลชั่ง: ขาด ${cnCalc.shortagePerCaseKg} kg/กล่อง × ${cnCalc.totalActualCases} กล่อง = ยอด CN ${cnCalc.cnTotalKg} kg`,
            updatedAt: now,
          });
        }
      } else {
        const existingCn = await db.cnCases.where('samplingGroupId').equals(group.id).first();
        if (existingCn) {
          await db.cnCases.delete(existingCn.id);
        }
      }
    }

    const groupUpdates: Record<string, any> = {
      completedSamples: completedCount,
      validSamples: completedCount,
      samplingStatus: newSamplingStatus,
      weightResult: newWeightResult,
      updatedAt: now,
    };
    if ((skuBasketCode === 'O' || sampleBasketCode === 'O') && tare > 0) {
      groupUpdates.defaultTareWeightKg = tare;
      setCustomTareInput(String(tare));
    }

    await db.samplingGroups.update(group.id, groupUpdates);

    // Reset entry form for next sample (Preserves SKU basket size and tare weight automatically!)
    setGrossWeightInput('');
    setPhotoDataUrl(null);
    setIsCustomSampleBasket(false);
    setSampleBasketCode(skuBasketCode);
  };

  // Handle Add Measurement with Safety Overweight Check
  const handleAddMeasurement = async () => {
    if (currentGross <= 0 || isNaN(currentGross)) {
      alert('กรุณาระบุน้ำหนักรวม (Gross Weight) ที่ถูกต้อง และต้องมากกว่า 0 (ไม่สามารถติดลบได้)');
      return;
    }
    if (currentTareKg < 0) {
      alert('น้ำหนักภาชนะไม่สามารถติดลบได้');
      return;
    }
    if (currentNet <= 0) {
      alert('น้ำหนักสุทธิ (Net Weight) ต้องมากกว่า 0 (น้ำหนักรวมต้องมากกว่าน้ำหนักตะกร้า)');
      return;
    }

    const std = group.standardWeightKg;

    // Safety Verification: Per-Item Overweight Abnormality Confirmation (>= 30% of expected weight)
    // หากน้ำหนักแต่ละรายการเกิน 30% ของน้ำหนักที่ควรจะเป็น ให้ขึ้นแจ้งเตือนยืนยัน
    if (std && std > 0 && currentNet > std) {
      const excessKg = currentNet - std;
      const excessPercent = (excessKg / std) * 100;

      if (excessPercent >= 30) {
        setItemOverweightWarning({
          netKg: currentNet,
          grossKg: currentGross,
          tareKg: currentTareKg,
          standardWeight: std,
          excessKg,
          excessPercent,
          thresholdPercent: 30,
          sampleNumber: measurements.length + 1,
          totalRequired: group.requiredSamples,
        });
        return;
      }
    }

    // Safety Verification: When completing all required samples,
    // if projected average net weight exceeds standard weight by > 20%,
    // trigger confirmation modal so staff can verify before committing!
    const nextSampleNum = measurements.length + 1;
    const isFinalSample = nextSampleNum >= group.requiredSamples;

    if (isFinalSample && std && std > 0) {
      const allNet = [...measurements.map(m => m.netWeightKg), currentNet];
      const avgNet = allNet.reduce((sum, w) => sum + w, 0) / allNet.length;
      const percentDiff = ((avgNet - std) / std) * 100;

      if (percentDiff > 20) {
        setOverweightWarning({
          avgNet,
          standardWeight: std,
          percentDiff,
          allNetWeights: allNet,
          grossKg: currentGross,
          tareKg: currentTareKg,
          netKg: currentNet,
        });
        return;
      }
    }

    await executeSaveMeasurement();
  };

  // Summary calculation for display
  const isComplete = measurements.length >= group.requiredSamples && group.requiredSamples > 0;
  const netWeights = measurements.map(m => m.netWeightKg);
  const summary = (isComplete && group.standardWeightKg) ? calculateWeightSummary({
    standardWeightKg: group.standardWeightKg,
    netWeights,
    samplingGroupId: group.id,
    calculatedBy: currentUser?.fullName || 'Receive Staff',
    approvalVersion: group.approvalVersion,
  }) : null;

  return (
    <Layout 
      title="การสุ่มชั่งน้ำหนัก" 
      showBack 
      backTo={`/appointment/${group.apptNbr}/vendor/${group.vendorNbr}/po/${group.poNbr}/skus`}
    >
      <div 
        style={{ paddingBottom: 'calc(160px + env(safe-area-inset-bottom, 0px))' }}
        className="p-4 space-y-4 max-w-lg mx-auto"
      >
        
        {/* SKU Info Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              ITEM: {group.itemId}
            </span>
            <StatusBadge status={group.samplingStatus} size="sm" />
          </div>

          <h3 className="font-bold text-slate-900 text-base leading-snug break-words">
            {group.description}
          </h3>

          <div className="text-xs text-slate-500 space-y-0.5 pt-1">
            <p>ใบนัดหมาย: <b>{group.apptNbr}</b> | ใบสั่งซื้อ: <b>{group.poNbr}</b></p>
            <p>ผู้ขาย: <b>{group.vendorName}</b> ({group.vendorNbr})</p>
          </div>

          {/* Standard Net Weight Criterion */}
          <div className="mt-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-blue-900">
              <Scale className="w-4 h-4 text-blue-600" />
              <span>เกณฑ์มาตรฐาน (SP): <b>{group.spExpression || 'SP??'}</b></span>
            </div>
            <span className="font-black text-blue-700 text-sm">
              {group.standardWeightKg ? `${group.standardWeightKg} kg/${itemNoun}` : 'รออนุมัติเกณฑ์'}
            </span>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* ITEM-LEVEL BASKET SELECTION (Dropdown & Quick Scroll Buttons) */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-bold text-slate-900 block">
              ประเภทภาชนะ (ขนาดมาตรฐาน ITEM นี้)
            </label>
            <span className="font-bold text-sky-800 bg-sky-100/80 px-2.5 py-1 rounded-lg border border-sky-300 text-xs">
              {skuBasketCode === 'O' 
                ? `หักตามจริง ${currentTareKg} กก.` 
                : `หัก ${activeSkuBasket.tareWeightKg} กก.`}
            </span>
          </div>

          {/* UDA6 Verification Note */}
          {group.uda6 ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>รหัส UDA6 ต้นทาง:</span>
              <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                {group.uda6}
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold">
                (ลักษณะนาม: {itemNoun})
              </span>
              {group.uda6 !== skuBasketCode && (
                <span className="text-[11px] text-amber-700 font-medium">
                  (ปรับเปลี่ยนเป็น {skuBasketCode})
                </span>
              )}
            </div>
          ) : (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span><b>แจ้งตรวจสอบ:</b> ไม่มีรหัส UDA6 ต้นทางหรือไม่ถูกต้อง กรุณาตรวจสอบและเลือกประเภทภาชนะที่ใช้งานจริง</span>
            </div>
          )}
          
          {/* 1. NATIVE SELECT DROPDOWN OR LOCKED COMPLETE STATE */}
          {isComplete ? (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {skuBasketCode === 'O' 
                    ? `ภาชนะ O (กล่อง/กระสอบ) · หัก ${currentTareKg} กก.` 
                    : `${activeSkuBasket.name} · หัก ${activeSkuBasket.tareWeightKg} กก.`}
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium bg-white px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                ชั่งครบแล้ว (หากต้องการเปลี่ยน ให้ลบรายการชั่งออกก่อน)
              </span>
            </div>
          ) : (
            <div className="relative">
              <select
                value={skuBasketCode}
                onChange={(e) => handleSaveSkuBasket(e.target.value)}
                className="w-full bg-white border-2 border-sky-500 rounded-xl px-4 py-3 text-base font-bold text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer shadow-xs"
              >
                {activeBasketOptions.map((b) => (
                  <option key={b.code} value={b.code} className="py-2 text-sm text-slate-800 bg-white">
                    {b.code === 'O'
                      ? 'กล่อง / กระสอบ (ภาชนะ O) · ต้องใส่น้ำหนักเอง'
                      : `ตะกร้า ${b.code} · น้ำหนักหัก ${b.tareWeightKg} กก.`}
                  </option>
                ))}
              </select>

              {/* Custom dropdown chevron arrow */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-sky-600">
                <ChevronDown className="w-5 h-5 stroke-[2.5]" />
              </div>
            </div>
          )}

          {/* For Container O: Manual Tare Weight Input (ONLY shown while weighing, hidden when completed) */}
          {skuBasketCode === 'O' && !isComplete && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-700" />
                  ระบุน้ำหนักภาชนะ (Tare Weight สำหรับภาชนะ O):
                </span>
                <span className="text-[11px] text-amber-700 font-medium">ปรับเปลี่ยนได้ทุกตัวอย่าง</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="เช่น 0.80"
                  value={customTareInput}
                  onKeyDown={(e) => {
                    if (['-', '+', 'e', 'E'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val.includes('-')) val = val.replace(/-/g, '');
                    const parsed = parseFloat(val);
                    if (parsed < 0) return;
                    setCustomTareInput(val);
                    if (!isNaN(parsed) && parsed > 0 && group) {
                      db.samplingGroups.update(group.id, {
                        defaultTareWeightKg: parsed,
                      });
                    }
                  }}
                  className="w-full text-center text-xl font-black py-2.5 border-2 border-amber-500 rounded-xl focus:outline-none bg-white text-slate-900"
                />
                <span className="absolute right-3.5 top-3.5 text-xs font-bold text-amber-800">กก.</span>
              </div>
              {measurements.length > 0 && customTareInput && (
                <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  ✨ ดึงค่าน้ำหนักภาชนะจากกล่องแรกมาให้อัตโนมัติ ({customTareInput} กก.) หากกล่องนี้ต่างออกไปสามารถพิมพ์แก้ไขได้ทันที
                </div>
              )}
              <p className="text-[11px] text-amber-800 leading-relaxed">
                * สำหรับภาชนะ O เมื่อใส่กล่องแรกแล้ว กล่องถัดไปจะดึงน้ำหนักเดิมมาให้อัตโนมัติ (สามารถปรับเปลี่ยนได้ทุกตัวอย่าง)
              </p>
            </div>
          )}

          <div className="pt-1 text-[11px] text-slate-500 flex justify-between items-center">
            <span>✓ หักน้ำหนักอัตโนมัติ (Net = Gross − Tare) ให้ทุกตัวอย่าง</span>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* STEP 1: QUANTITY CONFIRMATION (Confirmed 10% Rule)           */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs">1</span>
              ยืนยันจำนวนรับจริง
            </h4>
            {!isEditingQty && (
              <button
                onClick={() => {
                  setConfirmedQtyInput(String(group.confirmedActualQty ?? group.apptContQty ?? 0));
                  setIsEditingQty(true);
                }}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                แก้ไขจำนวน
              </button>
            )}
          </div>

          {/* Clean Summary: จำนวนตามแผน | จำนวนรับจริง | ต้องสุ่มชั่ง */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-200">
              <span className="text-blue-700 block text-[11px] font-bold">จำนวนตามแผน:</span>
              <span className="font-black text-blue-900 text-base">{group.apptContQty ?? 0} {itemNoun}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[11px] font-bold">จำนวนรับจริง:</span>
              <span className="font-bold text-slate-700 text-base">
                {group.confirmedActualQty !== null ? group.confirmedActualQty : (group.importedRcvdContQty ?? 0)} {itemNoun}
              </span>
            </div>
            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              <span className="text-amber-800 block text-[11px] font-bold">ต้องสุ่มชั่ง (10%):</span>
              <span className="font-black text-amber-900 text-base">{group.requiredSamples || calculateRequiredSamples(group.confirmedActualQty || group.apptContQty || 0)} {itemNoun}</span>
            </div>
          </div>

          {/* Edit / Confirm Form */}
          {isEditingQty ? (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  จำนวน{itemNoun}ที่รับจริง:
                </label>
                <input
                  type="number"
                  min="0"
                  value={confirmedQtyInput}
                  onChange={(e) => setConfirmedQtyInput(e.target.value)}
                  className="w-full text-center text-xl font-black py-2.5 border-2 border-blue-500 rounded-xl focus:outline-none"
                  placeholder="ระบุจำนวนรับจริง..."
                />
              </div>

              {/* Show reason field if different from default planned qty */}
              {parseInt(confirmedQtyInput, 10) !== (group.apptContQty ?? 0) && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-amber-700 block">
                    * ระบุเหตุผลการปรับปรุงจำนวน (เนื่องจากไม่ตรงกับจำนวนตามแผน):
                  </label>
                  <input
                    type="text"
                    value={qtyReason}
                    onChange={(e) => setQtyReason(e.target.value)}
                    placeholder="เช่น สินค้าส่งขาด 2 หน่วย..."
                    className="w-full text-xs p-2.5 border border-amber-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingQty(false)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmQty}
                  className="flex-1 bg-blue-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-transform"
                >
                  <Check className="w-4 h-4" />
                  ยืนยันจำนวนรับจริง & คำนวณเกณฑ์ 10%
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-emerald-800 block">จำนวนรับจริงที่ยืนยัน:</span>
                <span className="text-lg font-black text-emerald-900">{group.confirmedActualQty} {itemNoun}</span>
                {group.qtyCorrectionReason && (
                  <span className="text-[11px] text-slate-500 block">เหตุผล: {group.qtyCorrectionReason}</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-emerald-800 block">เกณฑ์สุ่ม 10% (ปัดขึ้น):</span>
                <span className="text-lg font-black text-blue-700">ต้องสุ่ม {group.requiredSamples} {itemNoun}</span>
              </div>
            </div>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* STEP 2: FAST WEIGHT SAMPLING (Auto Deduct Basket Tare)        */}
        {/* ───────────────────────────────────────────────────────────── */}
        {group.confirmedActualQty !== null && group.requiredSamples > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs">2</span>
                บันทึกน้ำหนัก
              </h4>
              <span className="text-xs font-bold text-blue-600">
                {measurements.length} / {group.requiredSamples}
              </span>
            </div>

            <ProgressBar
              required={group.requiredSamples}
              completed={measurements.length}
            />

            {/* Input Form for New Measurement (if not yet completed) */}
            {measurements.length < group.requiredSamples ? (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
                
                {/* Active Basket Indicator for Current Sample */}
                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">ตัวอย่างที่ {measurements.length + 1}:</span>
                    <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md font-mono">
                      Tray {currentBasketCode} ({currentTareKg.toFixed(2)} kg)
                    </span>
                  </div>

                  {/* Exception override for this specific sample only */}
                  <button
                    type="button"
                    onClick={() => setIsCustomSampleBasket(!isCustomSampleBasket)}
                    className="text-[11px] text-blue-700 font-bold hover:underline"
                  >
                    {isCustomSampleBasket ? 'ใช้ขนาดหลัก' : 'เฉพาะใบนี้ขนาดไม่ตรง?'}
                  </button>
                </div>

                {/* Inline override if this specific basket is different */}
                {isCustomSampleBasket && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                    <label className="text-[11px] font-bold text-amber-900 block">
                      เลือกขนาดภาชนะเฉพาะ{itemNoun}ที่ {measurements.length + 1}:
                    </label>
                    <div className="relative">
                      <select
                        value={sampleBasketCode}
                        onChange={(e) => setSampleBasketCode(e.target.value)}
                        className="w-full bg-white border border-amber-400 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 appearance-none focus:outline-none"
                      >
                        {activeBasketOptions.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.code} · {b.code === 'O' ? 'กำหนดเอง (กล่อง/กระสอบ)' : `${b.tareWeightKg.toFixed(2)} กก.`}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-600">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    {sampleBasketCode === 'O' && (
                      <div className="pt-1">
                        <label className="text-[10px] font-bold text-amber-900 block mb-0.5">
                          น้ำหนักหักภาชนะ O สำหรับ{itemNoun}นี้ (กก.):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="เช่น 0.80"
                          value={customTareInput}
                          onKeyDown={(e) => {
                            if (['-', '+', 'e', 'E'].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val.includes('-')) val = val.replace(/-/g, '');
                            const parsed = parseFloat(val);
                            if (parsed < 0) return;
                            setCustomTareInput(val);
                          }}
                          className="w-full bg-white border border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Fast Gross Weight Entry */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    ชั่งน้ำหนักรวม (Gross Weight รวม{itemNoun}) kg:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="เช่น 10.85"
                    value={grossWeightInput}
                    onKeyDown={(e) => {
                      if (['-', '+', 'e', 'E'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.includes('-')) val = val.replace(/-/g, '');
                      const parsed = parseFloat(val);
                      if (parsed < 0) return;
                      setGrossWeightInput(val);
                    }}
                    className="w-full text-center text-3xl font-black py-3 border-2 border-blue-500 rounded-2xl focus:outline-none bg-white shadow-inner"
                  />
                </div>

                {/* Live Net Weight Calculation (Gross - Tare) */}
                {currentGross > 0 && (
                  <div className="p-3 bg-blue-100/70 border border-blue-200 rounded-xl flex justify-between items-center text-xs">
                    <div className="text-blue-900">
                      <span>น้ำหนักรวม: <b>{currentGross}</b> kg</span>
                      <span className="mx-1.5 text-slate-400">−</span>
                      <span>หัก{itemNoun} ({currentBasketCode}): <b>{currentTareKg}</b> kg =</span>
                    </div>
                    <span className="text-lg font-black text-blue-900">
                      สุทธิ {currentNet.toFixed(3)} kg
                    </span>
                  </div>
                )}

                {/* Photo Simulation */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(photoDataUrl ? null : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%232563eb"/><text x="50" y="55" fill="white" font-size="12" text-anchor="middle">Scale Photo</text></svg>')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                      photoDataUrl ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    {photoDataUrl ? 'แนบภาพถ่ายหน้าจอตาชั่งแล้ว ✓' : 'ถ่ายรูปสินค้าพร้อมหน้าจอตาชั่ง'}
                  </button>
                </div>

                {/* Save Sample Button */}
                <button
                  onClick={handleAddMeasurement}
                  className="w-full bg-blue-700 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-transform"
                >
                  <Plus className="w-4 h-4" />
                  บันทึก{itemNoun}ที่ {measurements.length + 1}
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ชั่งครบตามเกณฑ์ {group.requiredSamples} {itemNoun}แล้ว!
              </div>
            )}

            {/* List of Recorded Samples */}
            {measurements.length > 0 && (() => {
              const std = group.standardWeightKg ?? 0;
              const hasUnderweight = std > 0 && measurements.some(m => m.netWeightKg < (std - 0.005));

              return (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      ประวัติตัวอย่างที่ชั่งแล้ว ({measurements.length} รายการ):
                    </span>
                    {hasUnderweight && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                        พบตัวอย่างต่ำกว่าเกณฑ์ {std} กก.
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                    {measurements.map((m) => {
                      const isUnderweight = std > 0 && m.netWeightKg < (std - 0.005);
                      const shortage = isUnderweight ? Math.round((std - m.netWeightKg) * 100) / 100 : 0;

                      return (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-xl border text-xs flex justify-between items-center shadow-xs transition-all ${
                            isUnderweight
                              ? 'bg-red-50/80 border-l-4 border-l-red-500 border-red-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] ${
                              isUnderweight
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {m.sampleNumber}
                            </span>
                            <div>
                              <span className="font-semibold text-slate-800">
                                รวม: {m.grossWeightKg}kg − ตะกร้า {m.basketCode} ({m.tareWeightKg}kg)
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-slate-400 block text-[10px]">
                                  เวลา: {new Date(m.recordedAt).toLocaleTimeString('th-TH')}
                                </span>
                                {isUnderweight && (
                                  <span className="text-[9.5px] font-bold text-red-600 bg-red-100/70 px-1.5 py-0.2 rounded border border-red-200">
                                    ⚠️ ขาด -{shortage.toFixed(2)} kg (เกณฑ์ {std} kg)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <span className={`font-mono font-black text-sm ${
                            isUnderweight ? 'text-red-600' : 'text-blue-700'
                          }`}>
                            สุทธิ {m.netWeightKg.toFixed(2)} kg
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* STEP 3: SUMMARY & ±10% ACCEPTANCE EVALUATION                 */}
        {/* ───────────────────────────────────────────────────────────── */}
        {summary && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-xs">3</span>
              สรุปผลการสุ่มชั่งน้ำหนัก (เกณฑ์มาตรฐาน ห้ามขาด ≥0.01 kg / เพดานเกิน +10%)
            </h4>

            {/* Big Result Banner */}
            {(() => {
              const isOverweight = summary.result === 'FAIL' && summary.differenceKg > 0;
              const isUnderweight = summary.result === 'FAIL' && summary.differenceKg < 0;

              if (summary.result === 'PASS') {
                return (
                  <div className="p-4 rounded-2xl text-center border-2 bg-emerald-50 border-emerald-500 text-emerald-900">
                    <div className="text-2xl font-black">✓ ผ่านเกณฑ์ (ชั่งครบ)</div>
                    <p className="text-xs mt-1 text-emerald-700">
                      ผลต่าง: <b>{summary.differenceKg > 0 ? '+' : ''}{summary.differenceKg} kg</b> ({formatPercent(summary.differencePercent)}) · น้ำหนักได้ตามมาตรฐาน (ไม่ขาดเกณฑ์)
                    </p>
                  </div>
                );
              }

              if (isOverweight) {
                return (
                  <div className="p-4 rounded-2xl text-center border-2 bg-amber-50 border-amber-500 text-amber-900">
                    <div className="text-2xl font-black">⚠️ น้ำหนักเกินเกณฑ์ (+{formatPercent(summary.differencePercent)})</div>
                    <p className="text-xs mt-1 font-semibold text-amber-800">
                      ผลต่าง: +{summary.differenceKg} kg · แจ้งเตือนน้ำหนักเกิน (เพดาน +10% / ไม่ต้องเปิดเคส CN)
                    </p>
                  </div>
                );
              }

              // isUnderweight
              return (
                <div className="p-4 rounded-2xl text-center border-2 bg-red-50 border-red-500 text-red-900">
                  <div className="text-2xl font-black">✗ น้ำหนักขาดหาย ({formatPercent(summary.differencePercent)})</div>
                  <p className="text-xs mt-1 font-semibold text-red-700">
                    ผลต่าง: {summary.differenceKg} kg · ผิดเกณฑ์ (ขาดตั้งแต่ 0.01 kg ขึ้นไป ต้องเปิดเคส CN)
                  </p>
                </div>
              );
            })()}

            {/* Detail Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">น้ำหนักรวมจริงที่ชั่ง:</span>
                <span className="font-black text-slate-900 text-base">{summary.actualTotalKg} kg</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">น้ำหนักมาตรฐานรวม:</span>
                <span className="font-black text-slate-900 text-base">{summary.expectedTotalKg} kg</span>
              </div>
            </div>

            {/* Contextual Advisory Message */}
            {summary.result === 'FAIL' && summary.differenceKg < 0 && (
              <div className="p-3 bg-red-100/70 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
                <p className="font-bold">⚠️ รายการนี้น้ำหนักขาดหาย (ขาดตั้งแต่ 0.01 kg ขึ้นไปถือว่าผิดเกณฑ์):</p>
                <p>ระบบได้เปิดเคส CN โดยอัตโนมัติ เพื่อส่งต่อให้แผนกหลังบ้าน (Back Office) ดำเนินการหักเงิน/ปรับยอดกับผู้ขาย</p>
              </div>
            )}

            {summary.result === 'FAIL' && summary.differenceKg > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1">
                <p className="font-bold">ℹ️ รายการนี้น้ำหนักเกินเกณฑ์ (+10%):</p>
                <p>ผู้ขายส่งสินค้ามีน้ำหนักเกินเกณฑ์มาตรฐาน ไม่ถือเป็นกรณีของขาดทุน <b>ไม่มีการเปิดเคส CN</b> สามารถรับสินค้าและลงนามปิดงานได้ตามปกติ</p>
              </div>
            )}
          </div>
        )}

        {/* Missing Delivery Exception Option */}
        {group.confirmedActualQty === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs space-y-2">
            <h4 className="font-bold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              สินค้ารายการนี้ไม่มาส่ง (Quantity = 0)
            </h4>
            <p className="text-amber-800">
              ใบนัดหมายจะถูกเก็บไว้ในระบบเพื่อส่งต่อให้แผนกหลังบ้าน (Back Office) ตรวจสอบและเคลียร์ข้อมูล โดยไม่มีการลบหรือสร้างข้อมูลการชั่งเท็จ
            </p>
          </div>
        )}

        {/* ─── Per-Item Overweight Abnormality Confirmation Modal (>= 30% of standard weight) ─── */}
        {itemOverweightWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#FFFDF9] rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border-2 border-amber-500 space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 shadow-inner">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <span className="inline-block bg-amber-50 text-amber-700 text-[10.5px] font-black px-2.5 py-0.5 rounded-full border border-amber-200 mb-0.5">
                    ตรวจพบน้ำหนักเกินเกณฑ์ {itemOverweightWarning.thresholdPercent}%
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    ยืนยันค่าน้ำหนักเกินเกณฑ์มาตรฐาน
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {itemNoun}ที่ <b>{itemOverweightWarning.sampleNumber}</b> มีน้ำหนักสุทธิสูงกว่าเกณฑ์มาตรฐานที่ควรจะเป็นถึง{' '}
                <b className="text-amber-600">+{itemOverweightWarning.excessPercent.toFixed(1)}%</b> (เกินเกณฑ์เตือน 30% ของน้ำหนักที่ควรจะเป็น)
              </p>

              {/* Weight Comparison Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="bg-white p-2 rounded-xl shadow-2xs">
                  <span className="text-[10px] text-slate-500 block font-medium">เกณฑ์มาตรฐาน SP</span>
                  <b className="text-slate-800 text-xs sm:text-sm font-black">{itemOverweightWarning.standardWeight.toFixed(3)} kg</b>
                </div>
                <div className="bg-white p-2 rounded-xl shadow-2xs border border-amber-200">
                  <span className="text-[10px] text-amber-700 block font-medium">สุทธิที่ชั่งได้</span>
                  <b className="text-amber-700 text-xs sm:text-sm font-black">{itemOverweightWarning.netKg.toFixed(3)} kg</b>
                  <span className="text-[9.5px] text-slate-500 block">({itemOverweightWarning.grossKg} - {itemOverweightWarning.tareKg})</span>
                </div>
                <div className="bg-amber-50 p-2 rounded-xl border border-amber-200">
                  <span className="text-[10px] text-amber-700 block font-bold">เกินเกณฑ์</span>
                  <b className="text-amber-700 text-xs sm:text-sm font-black">+{itemOverweightWarning.excessKg.toFixed(3)} kg</b>
                  <span className="text-[9.5px] text-amber-800 block font-extrabold">(+{itemOverweightWarning.excessPercent.toFixed(1)}%)</span>
                </div>
              </div>

              {/* Guidance alert */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  กรุณาตรวจทานสินค้าบนตาชั่ง หรือตรวจสอบตัวเลขที่กรอกอีกครั้งเพื่อป้องกันการพิมพ์ผิดพลาด หากสินค้าหนักเกินจริง ให้กดยืนยันเพื่อบันทึก
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setItemOverweightWarning(null)}
                  className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-3 px-3 rounded-2xl border-2 border-slate-200 text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98"
                >
                  กลับไปแก้ไข / ชั่งใหม่
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (itemOverweightWarning) {
                      const { grossKg, tareKg, netKg } = itemOverweightWarning;
                      setItemOverweightWarning(null);
                      executeSaveMeasurement(grossKg, tareKg, netKg);
                    }
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  ยืนยันและบันทึก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OVERWEIGHT VERIFICATION MODAL (> +20% threshold alert) */}
        {overweightWarning && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl border-2 border-amber-500 p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    แจ้งเตือน: น้ำหนักเฉลี่ยเกินเกณฑ์ +{overweightWarning.percentDiff.toFixed(1)}%
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ตรวจพบน้ำหนักเฉลี่ยสูงกว่าเกณฑ์มาตรฐานเกิน 20%
                  </p>
                </div>
              </div>

              {/* Comparison Stats */}
              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-amber-900 font-bold">เกณฑ์มาตรฐาน (SP):</span>
                  <span className="font-mono font-black text-slate-900 text-sm">
                    {overweightWarning.standardWeight.toFixed(2)} กก./{itemNoun}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-amber-900 font-bold">เพดาน +20% ปกติ:</span>
                  <span className="font-mono font-bold text-amber-600 text-sm">
                    {(overweightWarning.standardWeight * 1.2).toFixed(2)} กก.
                  </span>
                </div>
                <div className="pt-2 border-t border-amber-200 flex justify-between items-center">
                  <span className="text-amber-900 font-bold">
                    น้ำหนักเฉลี่ยจริง ({overweightWarning.allNetWeights.length} {itemNoun}):
                  </span>
                  <span className="font-mono font-black text-amber-700 text-base">
                    {overweightWarning.avgNet.toFixed(3)} กก.
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-amber-800">
                  <span>ส่วนต่างที่เกินมา:</span>
                  <span className="font-bold text-amber-700">
                    +{(overweightWarning.avgNet - overweightWarning.standardWeight).toFixed(3)} กก. (+{overweightWarning.percentDiff.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Breakdown of each sample */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-800 block text-[11px]">
                  รายละเอียดแต่ละ{itemNoun} ({overweightWarning.allNetWeights.length} {itemNoun}):
                </span>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {overweightWarning.allNetWeights.map((w, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-600">{itemNoun}ที่ {idx + 1}:</span>
                      <span className="font-mono font-black text-slate-900">
                        สุทธิ {w.toFixed(3)} กก. {idx === overweightWarning.allNetWeights.length - 1 ? '(ตัวอย่างนี้)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guidance alert */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  กรุณาตรวจทานสินค้าบนตาชั่ง หรือตรวจสอบตัวเลขที่กรอกอีกครั้งเพื่อป้องกันการพิมพ์ผิดพลาด หากสินค้าหนักเกินจริง ให้กดยืนยันเพื่อบันทึก
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setOverweightWarning(null)}
                  className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-3 px-3 rounded-2xl border-2 border-slate-200 text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98"
                >
                  กลับไปแก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (overweightWarning) {
                      const { grossKg, tareKg, netKg } = overweightWarning;
                      setOverweightWarning(null);
                      executeSaveMeasurement(grossKg, tareKg, netKg);
                    }
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  ยืนยันและบันทึก
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
