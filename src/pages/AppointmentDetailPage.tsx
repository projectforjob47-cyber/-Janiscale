// ============================================================
// SMART DC — AppointmentDetailPage Component
// V3.0 Final Master Design: Single-Page Vertical Scrolling Workflow
// Cascading Dropdown: Vendor -> PO -> SKU in ONE Screen
// Instant Weighing + No Photo Evidence + Ordered Signatures
// Modern Subway Green (#12803C) & Warm Cream (#F7F2EA) Design
// ============================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { 
  Building2, 
  Package, 
  Layers, 
  Scale, 
  Clock, 
  Check, 
  AlertTriangle, 
  ChevronDown, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowLeft,
  ArrowRight,
  Search,
  Sparkles,
  Info,
  Send,
  ShoppingBasket,
  Shield
} from 'lucide-react';
import { db } from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import { 
  calculateRequiredSamples, 
  calculateNetWeight, 
  calculateWeightSummary, 
  calculateCN,
  formatPercent,
  getContainerNoun
} from '../lib/businessLogic';
import Layout from '../components/Layout';
import { queueLocalMutation } from '../lib/syncEngine';
import StatusBadge from '../components/StatusBadge';
import type { 
  Appointment, 
  AppointmentVendor, 
  PurchaseOrder, 
  SamplingGroup, 
  Measurement, 
  SignatureRecord 
} from '../types';
import { DEFAULT_BASKET_MASTER } from '../types';
import authorizedRoster from '../lib/authorizedRoster.json';
import { 
  formatThaiDate, 
  formatApptTime, 
  extractDateFromApptTime 
} from '../lib/dateUtils';

export default function AppointmentDetailPage() {
  const { apptNbr } = useParams<{ apptNbr: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryVendor = searchParams.get('vendor');
  const queryPo = searchParams.get('po');
  const queryItem = searchParams.get('item');
  const { currentUser } = useAuthStore();

  // ─── 1. Query Appointment Data ──────────────────────────────
  const appt = useLiveQuery(async () => {
    if (!apptNbr) return null;
    return await db.appointments.where('apptNbr').equals(apptNbr).first();
  }, [apptNbr]);

  const dbVendors = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.appointmentVendors.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const purchaseOrders = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.purchaseOrders.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const samplingGroups = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.samplingGroups.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const allApptMeasurements = useLiveQuery(async () => {
    if (!apptNbr) return [];
    return await db.measurements.where('apptNbr').equals(apptNbr).toArray();
  }, [apptNbr]) || [];

  const getSkuMeasurementCount = useCallback((skuId: string) => {
    return allApptMeasurements.filter(m => m.samplingGroupId === skuId && m.isValid !== false).length;
  }, [allApptMeasurements]);

  // Multi-source Vendor List: guarantees vendors never drops to 0 if POs or items exist
  const vendors = useMemo(() => {
    const map = new Map<string, { vendorNbr: string; vendorName: string }>();
    dbVendors.forEach(v => {
      if (v.vendorNbr) map.set(v.vendorNbr, { vendorNbr: v.vendorNbr, vendorName: v.vendorName || v.vendorNbr });
    });
    samplingGroups.forEach(sg => {
      if (sg.vendorNbr && !map.has(sg.vendorNbr)) {
        map.set(sg.vendorNbr, { vendorNbr: sg.vendorNbr, vendorName: sg.vendorName || sg.vendorNbr });
      }
    });
    purchaseOrders.forEach(p => {
      if (p.vendorNbr && !map.has(p.vendorNbr)) {
        const matchingSg = samplingGroups.find(sg => sg.vendorNbr === p.vendorNbr);
        map.set(p.vendorNbr, { vendorNbr: p.vendorNbr, vendorName: matchingSg?.vendorName || p.vendorNbr });
      }
    });
    return Array.from(map.values());
  }, [dbVendors, purchaseOrders, samplingGroups]);

  // Auto-heal missing appointmentVendors in DB
  useEffect(() => {
    if (apptNbr && dbVendors.length === 0 && vendors.length > 0) {
      const toPut = vendors.map(v => {
        const poCount = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr).length || 1;
        return {
          id: `v-${apptNbr}_${v.vendorNbr}`,
          appointmentId: appt?.id || `appt-${apptNbr}`,
          apptNbr,
          vendorNbr: v.vendorNbr,
          vendorName: v.vendorName,
          poCount,
          syncStatus: 'OFFLINE' as const
        };
      });
      db.appointmentVendors.bulkPut(toPut).catch(() => {});
    }
  }, [apptNbr, dbVendors.length, vendors, appt?.id, purchaseOrders]);

  const dbBaskets = useLiveQuery(async () => {
    return await db.basketMaster.toArray();
  }, []) || [];

  const basketList = dbBaskets.length > 0 
    ? dbBaskets 
    : DEFAULT_BASKET_MASTER.map(b => ({ ...b, id: b.code }));

  // Allowed container types: 9 standard baskets + Container O
  const activeBasketOptions = useMemo(() => {
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
      const dbItem = basketList.find(b => b.code === code);
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

  // ─── 2. Cascading Dropdown States & Filters ──────────────────
  const [selectedVendorNbr, setSelectedVendorNbr] = useState<string>('');
  const [selectedPoNbr, setSelectedPoNbr] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  // ─── 3. Dynamic Completion & Filtering Helpers ───────────────
  const isSkuDone = useCallback((sku: { id?: string; samplingStatus?: string; confirmedActualQty?: number | null; completedSamples?: number; requiredSamples?: number }) => {
    if (
      sku.samplingStatus === 'ชั่งครบ' || 
      sku.samplingStatus === 'ผิดเกณฑ์' ||
      sku.samplingStatus === 'ไม่มาตามแผน' ||
      sku.samplingStatus === 'ไม่มาส่ง' ||
      sku.confirmedActualQty === 0
    ) {
      return true;
    }
    const req = sku.requiredSamples && sku.requiredSamples > 0 ? sku.requiredSamples : 1;
    const actualCount = sku.id ? getSkuMeasurementCount(sku.id) : (sku.completedSamples || 0);
    return actualCount >= req;
  }, [getSkuMeasurementCount]);

  const isPoDone = useCallback((poNbr: string) => {
    const skus = samplingGroups.filter(sg => sg.poNbr === poNbr);
    if (skus.length === 0) return false;
    return skus.every(isSkuDone);
  }, [samplingGroups, isSkuDone]);

  const totalSamplingGroupsCount = samplingGroups.length;
  const completedSamplingGroupsCount = useMemo(() => {
    return samplingGroups.filter(isSkuDone).length;
  }, [samplingGroups]);
  const isAppointmentCompleted = totalSamplingGroupsCount > 0 && completedSamplingGroupsCount >= totalSamplingGroupsCount;

  // Filter POs based on selected Vendor (Always includes ALL POs for visibility, deduplicated by poNbr)
  const allVendorPOs = useMemo(() => {
    if (!selectedVendorNbr) return [];
    const list = purchaseOrders.filter(po => po.vendorNbr === selectedVendorNbr);
    const seen = new Set<string>();
    return list.filter(po => {
      if (seen.has(po.poNbr)) return false;
      seen.add(po.poNbr);
      return true;
    });
  }, [purchaseOrders, selectedVendorNbr]);

  // Pending POs helper (for auto-advance and counting)
  const pendingVendorPOs = useMemo(() => {
    return allVendorPOs.filter(po => !isPoDone(po.poNbr));
  }, [allVendorPOs, samplingGroups]);

  // Check if current vendor has completed all their POs
  const isCurrentVendorDone = useMemo(() => {
    if (!selectedVendorNbr) return false;
    const vPos = purchaseOrders.filter(p => p.vendorNbr === selectedVendorNbr);
    return vPos.length > 0 && vPos.every(p => isPoDone(p.poNbr));
  }, [purchaseOrders, selectedVendorNbr, samplingGroups]);

  // Find next pending vendor across this appointment strictly downwards from current vendor (top-to-bottom of plan)
  const nextPendingVendor = useMemo(() => {
    if (!selectedVendorNbr) return null;
    const currentVendorIdx = vendors.findIndex(v => v.vendorNbr === selectedVendorNbr);
    let nextV = vendors.slice(currentVendorIdx + 1).find(v => {
      const vPos = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr);
      return vPos.some(p => !isPoDone(p.poNbr));
    });
    if (!nextV) {
      nextV = vendors.slice(0, currentVendorIdx).find(v => {
        const vPos = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr);
        return vPos.some(p => !isPoDone(p.poNbr));
      });
    }
    if (!nextV) return null;
    const vPos = purchaseOrders.filter(p => p.vendorNbr === nextV.vendorNbr);
    const pendingPos = vPos.filter(p => !isPoDone(p.poNbr));
    return {
      ...nextV,
      pendingPoCount: pendingPos.length,
      totalPoCount: vPos.length,
    };
  }, [vendors, purchaseOrders, selectedVendorNbr, isPoDone]);

  // Filter SKUs based on selected PO (Always includes ALL SKUs in this PO, deduplicated by itemId)
  const allPoSKUs = useMemo(() => {
    if (!selectedPoNbr) return [];
    const list = samplingGroups.filter(sg => sg.poNbr === selectedPoNbr);
    const seen = new Set<string>();
    return list.filter(sg => {
      const key = String(sg.itemId).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [samplingGroups, selectedPoNbr]);

  // ─── 4. Auto-Select Rules & Transition ───────────────────────
  const initialParamsAppliedRef = useRef(false);

  // Prioritize selection from URL Query Parameters ONCE on initial landing (?vendor=...&po=...&item=...)
  useEffect(() => {
    if (initialParamsAppliedRef.current) return;
    if (samplingGroups.length === 0) return;

    if (queryItem || queryPo || queryVendor) {
      const match = samplingGroups.find(sg => {
        if (queryItem && sg.itemId !== queryItem) return false;
        if (queryPo && sg.poNbr !== queryPo) return false;
        if (queryVendor && sg.vendorNbr !== queryVendor) return false;
        return true;
      }) || (queryItem ? samplingGroups.find(sg => sg.itemId === queryItem) : null);

      if (match) {
        if (match.vendorNbr) setSelectedVendorNbr(match.vendorNbr);
        if (match.poNbr) setSelectedPoNbr(match.poNbr);
        if (match.itemId) setSelectedItemId(match.itemId);
      }
      initialParamsAppliedRef.current = true;
      // Clean query params from URL bar so they never cause ghost bouncing later
      if (apptNbr) {
        navigate(`/appointment/${apptNbr}`, { replace: true });
      }
    }
  }, [samplingGroups, queryItem, queryPo, queryVendor, apptNbr, navigate]);

  // 🚀 Auto-select first pending SKU if nothing is selected or no query params provided
  useEffect(() => {
    if (queryVendor || queryPo || queryItem) return;
    if (samplingGroups.length === 0) return;

    if (!selectedItemId) {
      // Prioritize the first SKU that is not yet completed (รอชั่ง / กำลังชั่ง)
      const targetSku = samplingGroups.find(sg => !isSkuDone(sg)) || samplingGroups[0];
      if (targetSku) {
        if (targetSku.vendorNbr && selectedVendorNbr !== targetSku.vendorNbr) {
          setSelectedVendorNbr(targetSku.vendorNbr);
        }
        if (targetSku.poNbr && selectedPoNbr !== targetSku.poNbr) {
          setSelectedPoNbr(targetSku.poNbr);
        }
        setSelectedItemId(targetSku.itemId);
      }
    }
  }, [samplingGroups, selectedItemId, selectedVendorNbr, selectedPoNbr, queryVendor, queryPo, queryItem, isSkuDone]);

  const cleanUrl = () => {
    initialParamsAppliedRef.current = true;
    if (apptNbr && (queryVendor || queryPo || queryItem)) {
      navigate(`/appointment/${apptNbr}`, { replace: true });
    }
  };

  // Handlers for manual selection
  const handleVendorChange = (vendorNbr: string) => {
    cleanUrl();
    setSelectedVendorNbr(vendorNbr);
    if (vendorNbr) {
      const vPos = purchaseOrders.filter(po => po.vendorNbr === vendorNbr);
      const pendingPo = vPos.find(po => !isPoDone(po.poNbr)) || vPos[0];
      if (pendingPo) {
        setSelectedPoNbr(pendingPo.poNbr);
        const poSkus = samplingGroups.filter(sg => sg.poNbr === pendingPo.poNbr);
        const pendingSku = poSkus.find(sku => !isSkuDone(sku)) || poSkus[0];
        setSelectedItemId(pendingSku ? pendingSku.itemId : '');
      } else {
        setSelectedPoNbr('');
        setSelectedItemId('');
      }
    } else {
      setSelectedPoNbr('');
      setSelectedItemId('');
    }
  };

  const handlePoChange = (poNbr: string) => {
    cleanUrl();
    setSelectedPoNbr(poNbr);
    if (poNbr) {
      const poSkus = samplingGroups.filter(sg => sg.poNbr === poNbr);
      // If user selected a completed PO, allow viewing its first SKU; if pending, choose first pending SKU
      const targetSku = poSkus.find(sku => !isSkuDone(sku)) || poSkus[0];
      setSelectedItemId(targetSku ? targetSku.itemId : '');
    } else {
      setSelectedItemId('');
    }
  };

  const handleSkuChange = (itemId: string) => {
    cleanUrl();
    setSelectedItemId(itemId);
  };

  // ─── 5. Selected SKU (Sampling Group) ────────────────────────
  const activeGroup = useMemo(() => {
    if (!selectedPoNbr || !selectedItemId) return null;
    return samplingGroups.find(sg => sg.poNbr === selectedPoNbr && sg.itemId === selectedItemId) || null;
  }, [samplingGroups, selectedPoNbr, selectedItemId]);

  // Guaranteed effective required samples (minimum 1, dynamically auto-healed if 0)
  const effectiveRequiredSamples = useMemo(() => {
    if (!activeGroup) return 1;
    if (activeGroup.requiredSamples && activeGroup.requiredSamples > 0) {
      return activeGroup.requiredSamples;
    }
    const defQty = activeGroup.confirmedActualQty !== null && activeGroup.confirmedActualQty !== undefined
      ? activeGroup.confirmedActualQty
      : (activeGroup.apptContQty ?? activeGroup.importedRcvdContQty ?? 0);
    const calculated = calculateRequiredSamples(defQty > 0 ? defQty : 1);
    return Math.max(1, calculated || 1);
  }, [activeGroup]);

  // Measurements for active SKU
  const measurements = useLiveQuery(async () => {
    if (!activeGroup) return [];
    return await db.measurements.where('samplingGroupId').equals(activeGroup.id).sortBy('sampleNumber');
  }, [activeGroup?.id]) || [];

  // Signatures for active SKU
  const signatures = useLiveQuery(async () => {
    if (!activeGroup) return [];
    return await db.signatureRecords.where('samplingGroupId').equals(activeGroup.id).toArray();
  }, [activeGroup?.id]) || [];

  // Helper to determine the next pending target strictly in sequential order (top to bottom of plan)
  const getNextPlanTarget = useCallback((currentGroup: SamplingGroup | null): ItemCompletionModalData['nextAction'] => {
    if (!currentGroup) return { type: 'ALL_DONE' };

    // 1. Next pending SKU within the current PO (Strictly downwards from current SKU index)
    const currentPoSkus = samplingGroups.filter(sg => sg.poNbr === currentGroup.poNbr);
    const currentSkuIdx = currentPoSkus.findIndex(sg => sg.id === currentGroup.id || sg.itemId === currentGroup.itemId);
    let nextSkuInPo = currentPoSkus.slice(currentSkuIdx + 1).find(sg => !isSkuDone(sg));
    if (!nextSkuInPo) {
      nextSkuInPo = currentPoSkus.slice(0, currentSkuIdx).find(sg => sg.id !== currentGroup.id && !isSkuDone(sg));
    }
    if (nextSkuInPo) {
      return {
        type: 'NEXT_SKU',
        nextItemId: nextSkuInPo.itemId,
        nextDescription: nextSkuInPo.description,
      };
    }

    // 2. Next pending PO within the current Vendor (Strictly downwards from current PO index)
    const currentVendorPOs = purchaseOrders.filter(po => po.vendorNbr === currentGroup.vendorNbr);
    const currentPoIdx = currentVendorPOs.findIndex(po => po.poNbr === currentGroup.poNbr);
    let nextPoInVendor = currentVendorPOs.slice(currentPoIdx + 1).find(po => !isPoDone(po.poNbr));
    if (!nextPoInVendor) {
      nextPoInVendor = currentVendorPOs.slice(0, currentPoIdx).find(po => po.poNbr !== currentGroup.poNbr && !isPoDone(po.poNbr));
    }
    if (nextPoInVendor) {
      const nextPoSkus = samplingGroups.filter(sg => sg.poNbr === nextPoInVendor.poNbr);
      const nextSku = nextPoSkus.find(sg => !isSkuDone(sg)) || nextPoSkus[0];
      return {
        type: 'NEXT_PO',
        nextPoNbr: nextPoInVendor.poNbr,
        nextItemId: nextSku?.itemId,
        nextDescription: nextSku?.description,
      };
    }

    // 3. Next pending Vendor across the Appointment (Strictly downwards from current Vendor index)
    const currentVendorIdx = vendors.findIndex(v => v.vendorNbr === currentGroup.vendorNbr);
    let nextVendor = vendors.slice(currentVendorIdx + 1).find(v => {
      const vPos = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr);
      return vPos.some(p => !isPoDone(p.poNbr));
    });
    if (!nextVendor) {
      // Wrap around from top of list if earlier vendor was skipped
      nextVendor = vendors.slice(0, currentVendorIdx).find(v => {
        const vPos = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr);
        return vPos.some(p => !isPoDone(p.poNbr));
      });
    }

    if (nextVendor) {
      const vPos = purchaseOrders.filter(p => p.vendorNbr === nextVendor.vendorNbr);
      const pendingPo = vPos.find(p => !isPoDone(p.poNbr)) || vPos[0];
      const poSkus = pendingPo ? samplingGroups.filter(sg => sg.poNbr === pendingPo.poNbr) : [];
      const pendingSku = poSkus.find(sg => !isSkuDone(sg)) || poSkus[0];
      return {
        type: 'NEXT_VENDOR',
        nextVendorNbr: nextVendor.vendorNbr,
        nextVendorName: nextVendor.vendorName || nextVendor.vendorNbr,
        nextPoNbr: pendingPo?.poNbr,
        nextItemId: pendingSku?.itemId,
        nextDescription: pendingSku?.description,
      };
    }

    // 4. Everything in this appointment is complete!
    return {
      type: 'ALL_DONE',
    };
  }, [samplingGroups, purchaseOrders, vendors, isSkuDone, isPoDone]);

  // Unified nextAppointmentTarget for UI navigation buttons
  const nextAppointmentTarget = useMemo(() => {
    if (!activeGroup) return null;
    const target = getNextPlanTarget(activeGroup);
    return {
      type: target.type,
      vendorNbr: target.nextVendorNbr || activeGroup.vendorNbr,
      vendorName: target.nextVendorName || activeGroup.vendorName,
      poNbr: target.nextPoNbr,
      itemId: target.nextItemId,
      description: target.nextDescription,
    };
  }, [getNextPlanTarget, activeGroup]);

  // ─── 5. SKU-Level Form States ────────────────────────────────
  const [confirmedQtyInput, setConfirmedQtyInput] = useState<string>('');
  const [qtyReason, setQtyReason] = useState<string>('');
  const [isEditingQty, setIsEditingQty] = useState<boolean>(false);
  const [skuBasketCode, setSkuBasketCode] = useState<string>('X');
  const [customTareInput, setCustomTareInput] = useState<string>('');

  // Fast gross weight entry state
  const [grossInput, setGrossInput] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Active item notification and scroll ref for mobile comfort
  const weighingCardRef = useRef<HTMLDivElement>(null);
  const [switchedItemAlert, setSwitchedItemAlert] = useState<{ itemId: string; description: string } | null>(null);

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

  // Underweight abnormality warning modal state
  // 1) สุ่ม 1 ตะกร้า: น้ำหนักต่ำกว่าเกณฑ์เกิน 10%
  // 2) สุ่มหลายตะกร้า: มีบางตะกร้าน้ำหนักต่ำกว่าเกณฑ์เกิน 20%
  interface UnderweightWarningData {
    netKg: number;
    grossKg: number;
    tareKg: number;
    standardWeight: number;
    shortageKg: number;
    shortagePercent: number;
    thresholdPercent: number;
    sampleNumber: number;
    totalRequired: number;
  }
  const [underweightWarning, setUnderweightWarning] = useState<UnderweightWarningData | null>(null);

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

  // Item completion summary modal state (shown after finishing all required baskets for an item)
  interface ItemCompletionModalData {
    group: SamplingGroup;
    summary: ReturnType<typeof calculateWeightSummary>;
    cnCalc: ReturnType<typeof calculateCN> | null;
    measurements: Measurement[];
    nextAction: {
      type: 'NEXT_SKU' | 'NEXT_PO' | 'NEXT_VENDOR' | 'ALL_DONE';
      nextItemId?: string;
      nextPoNbr?: string;
      nextDescription?: string;
      nextVendorNbr?: string;
      nextVendorName?: string;
    };
  }
  const [itemCompletionModal, setItemCompletionModal] = useState<ItemCompletionModalData | null>(null);

  // Ref to track activeGroup.id across renders so we don't wipe tare weight on sample #2+
  const prevActiveGroupIdRef = useRef<string | null>(null);

  // Sync state when activeGroup changes
  useEffect(() => {
    if (activeGroup) {
      const isDifferentGroup = prevActiveGroupIdRef.current !== activeGroup.id;
      prevActiveGroupIdRef.current = activeGroup.id;

      const defQty = activeGroup.confirmedActualQty !== null && activeGroup.confirmedActualQty !== undefined
        ? activeGroup.confirmedActualQty
        : (activeGroup.apptContQty ?? activeGroup.importedRcvdContQty ?? 0);
      
      // Resolve initial container type from UDA6 or existing defaultBasketCode
      const rawUda6 = activeGroup.uda6 ? String(activeGroup.uda6).trim().toUpperCase() : null;
      let targetCode = 'X';
      const allAllowedCodes = ['ZN', 'Z', 'W', 'X', 'F', 'Y', 'YN', 'SF', 'XN', 'O'];
      if (activeGroup.defaultBasketCode && allAllowedCodes.includes(activeGroup.defaultBasketCode)) {
        targetCode = activeGroup.defaultBasketCode;
      } else if (rawUda6 && allAllowedCodes.includes(rawUda6)) {
        targetCode = rawUda6;
      }

      // Only reinitialize SKU-level fields if switching to a new SKU
      if (isDifferentGroup) {
        setConfirmedQtyInput(String(defQty));
        setSkuBasketCode(targetCode);

        // Pre-fill Container O tare weight from previous measurements or group default
        if (targetCode === 'O') {
          db.measurements
            .where('samplingGroupId')
            .equals(activeGroup.id)
            .sortBy('sampleNumber')
            .then(existingList => {
              const lastWithTare = [...existingList].reverse().find(m => m.tareWeightKg && m.tareWeightKg > 0);
              if (lastWithTare) {
                setCustomTareInput(String(lastWithTare.tareWeightKg));
              } else if (activeGroup.defaultTareWeightKg && activeGroup.defaultTareWeightKg > 0) {
                setCustomTareInput(String(activeGroup.defaultTareWeightKg));
              } else {
                setCustomTareInput('');
              }
            });
        } else {
          setCustomTareInput('');
        }

        setIsEditingQty(false);

        // Auto-initialize confirmedActualQty & requiredSamples if null or 0
        const isReqInvalid = !activeGroup.requiredSamples || activeGroup.requiredSamples <= 0;
        const isQtyNull = activeGroup.confirmedActualQty === null;
        if ((isQtyNull || isReqInvalid) && defQty > 0) {
          const req = Math.max(1, calculateRequiredSamples(defQty));
          const b = activeBasketOptions.find(item => item.code === targetCode);
          const initTare = targetCode === 'O' 
            ? (activeGroup.defaultTareWeightKg || 0) 
            : (b ? b.tareWeightKg : 0.60);
          db.samplingGroups.update(activeGroup.id, {
            confirmedActualQty: activeGroup.confirmedActualQty ?? defQty,
            requiredSamples: req,
            uda6: rawUda6,
            defaultBasketCode: targetCode,
            defaultTareWeightKg: initTare,
            workflowStatus: (activeGroup.completedSamples ?? 0) > 0 ? 'SAMPLING' : 'PENDING_QTY_CONFIRM',
            updatedAt: new Date().toISOString(),
          });
        }

        // Auto-sync Focus status from Focus Master if match found
        db.focusMaster.where('itemId').equals(activeGroup.itemId).first().then(focusItem => {
          if (focusItem && focusItem.isActive && activeGroup.focusStatus !== 'FOCUS') {
            db.samplingGroups.update(activeGroup.id, {
              focusStatus: 'FOCUS',
              updatedAt: new Date().toISOString(),
            });
          }
        });
      }
    } else {
      prevActiveGroupIdRef.current = null;
    }
  }, [activeGroup?.id, activeBasketOptions]);

  // Active basket item
  const activeBasket = activeBasketOptions.find(b => b.code === skuBasketCode) || {
    code: skuBasketCode,
    name: skuBasketCode === 'O' ? 'กล่อง / กระสอบ (ภาชนะ O)' : `ตะกร้า ${skuBasketCode}`,
    tareWeightKg: DEFAULT_BASKET_MASTER.find(b => b.code === skuBasketCode)?.tareWeightKg || 0.60,
  };

  const currentTareKg = skuBasketCode === 'O' 
    ? (parseFloat(customTareInput) || 0)
    : activeBasket.tareWeightKg;

  const currentGross = parseFloat(grossInput) || 0;
  const currentNet = calculateNetWeight(currentGross, currentTareKg);

  // Dynamic noun for active ITEM: SF, X, Y, Z -> ตะกร้า, O -> หน่วย
  const itemNoun = getContainerNoun(activeGroup?.uda6 || skuBasketCode);

  // ─── 6. Handlers ─────────────────────────────────────────────
  const handleSaveBasket = async (code: string) => {
    if (!activeGroup) return;
    setSkuBasketCode(code);
    const b = activeBasketOptions.find(item => item.code === code);
    let tareVal = parseFloat(customTareInput) || 0;
    if (code === 'O' && tareVal <= 0) {
      if (activeGroup.defaultTareWeightKg && activeGroup.defaultTareWeightKg > 0) {
        tareVal = activeGroup.defaultTareWeightKg;
        setCustomTareInput(String(tareVal));
      } else {
        const lastWithTare = [...measurements].reverse().find(m => m.tareWeightKg && m.tareWeightKg > 0);
        if (lastWithTare) {
          tareVal = lastWithTare.tareWeightKg;
          setCustomTareInput(String(tareVal));
        }
      }
    }
    const newTare = code === 'O' ? tareVal : (b ? b.tareWeightKg : 0.60);

    // Record audit log if changed from original source UDA6
    if (activeGroup.uda6 && activeGroup.uda6 !== code) {
      await db.auditLogs.add({
        id: uuidv4(),
        entityType: 'SAMPLING_GROUP',
        entityId: activeGroup.id,
        action: 'UPDATE_CONTAINER_TYPE',
        oldValue: activeGroup.uda6,
        newValue: code,
        performedBy: currentUser?.fullName || 'Receive Staff',
        performedAt: new Date().toISOString(),
        reason: `ปรับเปลี่ยนประเภทภาชนะจาก UDA6 (${activeGroup.uda6}) เป็น ${code}`,
        syncStatus: 'SYNCED',
      });
    }

    await db.samplingGroups.update(activeGroup.id, {
      defaultBasketCode: code,
      defaultTareWeightKg: newTare,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleFocus = async () => {
    if (!activeGroup) return;
    const nextStatus = activeGroup.focusStatus === 'FOCUS' ? 'NON_FOCUS' : 'FOCUS';
    await db.samplingGroups.update(activeGroup.id, {
      focusStatus: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleConfirmQty = async () => {
    if (!activeGroup) return;
    const qty = parseInt(confirmedQtyInput, 10);
    if (isNaN(qty) || qty < 0) {
      alert(`กรุณาระบุจำนวน${itemNoun}ที่ถูกต้อง`);
      return;
    }

    const defaultAK = activeGroup.apptContQty ?? 0;
    if (qty !== defaultAK && !qtyReason.trim()) {
      alert('กรณีจำนวนรับจริงไม่ตรงกับจำนวนตามแผน กรุณาระบุเหตุผลการปรับปรุงจำนวน');
      return;
    }

    const reqSamples = calculateRequiredSamples(qty);
    const now = new Date().toISOString();

    await db.samplingGroups.update(activeGroup.id, {
      confirmedActualQty: qty,
      requiredSamples: reqSamples,
      qtyConfirmedBy: currentUser?.fullName || 'Receive Staff',
      qtyConfirmedAt: now,
      qtyCorrectionReason: qty !== defaultAK ? qtyReason : null,
      workflowStatus: (activeGroup.completedSamples ?? 0) > 0 ? 'SAMPLING' : 'PENDING_QTY_CONFIRM',
      updatedAt: now,
    });
    setIsEditingQty(false);
  };

  // Actual save execution logic (called directly or after overweight confirmation)
  const executeSaveMeasurement = async (overrideGross?: number, overrideTare?: number, overrideNet?: number) => {
    if (!activeGroup) return;

    const gross = overrideGross !== undefined ? overrideGross : currentGross;
    const tare = overrideTare !== undefined ? overrideTare : currentTareKg;
    const net = overrideNet !== undefined ? overrideNet : currentNet;

    setSaveStatus('saving');
    const existingDbMeasurements = await db.measurements.where('samplingGroupId').equals(activeGroup.id).toArray();
    const nextSampleNum = existingDbMeasurements.length + 1;
    const now = new Date().toISOString();

    const newMeasurement: Measurement = {
      id: uuidv4(),
      samplingGroupId: activeGroup.id,
      apptNbr: activeGroup.apptNbr,
      poNbr: activeGroup.poNbr,
      itemId: activeGroup.itemId,
      sampleNumber: nextSampleNum,
      grossWeightKg: gross,
      basketCode: activeBasket.code,
      tareWeightKg: tare,
      netWeightKg: net,
      photoEvidenceId: null, // PHOTO REMOVED per Section 9
      recordedBy: currentUser?.fullName || 'Receive Staff',
      recordedAt: now,
      isValid: true,
      syncStatus: 'SYNCED',
      notes: null,
    };

    await db.measurements.add(newMeasurement);
    const updated = [...existingDbMeasurements, newMeasurement];
    const completedCount = updated.length;

    // Summary calculation if completed
    let newSamplingStatus = activeGroup.samplingStatus;
    let newWeightResult = activeGroup.weightResult;

    if (completedCount >= effectiveRequiredSamples && activeGroup.standardWeightKg) {
      const netWeights = updated.map(m => m.netWeightKg);
      const summary = calculateWeightSummary({
        standardWeightKg: activeGroup.standardWeightKg,
        netWeights,
        samplingGroupId: activeGroup.id,
        calculatedBy: currentUser?.fullName || 'Receive Staff',
        approvalVersion: activeGroup.approvalVersion,
      });

      const isUnderweight = summary.result === 'FAIL' && summary.differenceKg < 0;
      const isOverweight = summary.result === 'FAIL' && summary.differenceKg > 0;

      newSamplingStatus = summary.result === 'PASS' 
        ? 'ชั่งครบ' 
        : (isOverweight ? 'ชั่งครบ' : 'ผิดเกณฑ์');
      newWeightResult = summary.result;

      await db.weightSummaries.put({
        ...summary,
        id: uuidv4(),
      });

      // Lotus's SRRDC Formula:
      // CN (kg) = (Standard Weight per Case − Average Actual Net Weight per Case) × Total Actual Received Cases
      const totalCases = activeGroup.confirmedActualQty || activeGroup.apptContQty || 0;
      const cnCalc = calculateCN(activeGroup.standardWeightKg, summary.averageNetKg, totalCases);

      // ONLY create CN case when weight is UNDERWEIGHT (น้ำหนักขาดหาย) and cnCalc.isEligibleForCN
      if (isUnderweight && cnCalc.isEligibleForCN) {
        const existingCn = await db.cnCases.where('samplingGroupId').equals(activeGroup.id).first();
        if (!existingCn) {
          await db.cnCases.add({
            id: uuidv4(),
            samplingGroupId: activeGroup.id,
            apptNbr: activeGroup.apptNbr,
            receiveDate: appt?.receiveDate || now.split('T')[0],
            poNbr: activeGroup.poNbr,
            itemId: activeGroup.itemId,
            description: activeGroup.description,
            vendorNbr: activeGroup.vendorNbr,
            vendorName: activeGroup.vendorName,
            totalActualCases: cnCalc.totalActualCases,
            standardWeightKg: cnCalc.standardWeightKg,
            actualAverageNetKg: cnCalc.actualAverageNetKg,
            shortagePerCaseKg: cnCalc.shortagePerCaseKg,
            cnTotalKg: cnCalc.cnTotalKg,
            failedSummaryId: activeGroup.id,
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
          // Update existing CN case (Prevent duplicate and preserve history)
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
        // If not underweight, remove any prior CN case for this SKU
        const existingCn = await db.cnCases.where('samplingGroupId').equals(activeGroup.id).first();
        if (existingCn) {
          await db.cnCases.delete(existingCn.id);
        }
      }
    }

    // Update sampling group record
    // If container O, persist the tare weight so all subsequent samples inherit it automatically
    const groupUpdateData: Record<string, any> = {
      completedSamples: completedCount,
      validSamples: completedCount,
      samplingStatus: newSamplingStatus,
      weightResult: newWeightResult,
      requiredSamples: effectiveRequiredSamples,
      updatedAt: now,
    };
    if (skuBasketCode === 'O' && tare > 0) {
      groupUpdateData.defaultTareWeightKg = tare;
      // Retain the tare weight in the input state so the next sample immediately shows it
      setCustomTareInput(String(tare));
    }

    await db.samplingGroups.update(activeGroup.id, groupUpdateData);
    const refreshedGroup = await db.samplingGroups.get(activeGroup.id);
    if (refreshedGroup) {
      queueLocalMutation({
        table: 'samplingGroups',
        op: 'put',
        key: activeGroup.id,
        data: refreshedGroup,
      });
    }

    // Sync live completed count to db.appointments
    const allGroups = await db.samplingGroups.where('apptNbr').equals(activeGroup.apptNbr).toArray();
    const liveDone = allGroups.filter(g => 
      g.id === activeGroup.id 
        ? isSkuDone({ ...g, samplingStatus: newSamplingStatus, completedSamples: completedCount })
        : isSkuDone(g)
    ).length;

    await db.appointments.where('apptNbr').equals(activeGroup.apptNbr).modify({
      completedGroups: liveDone,
      updatedAt: now,
    });
    const refreshedAppt = await db.appointments.where('apptNbr').equals(activeGroup.apptNbr).first();
    if (refreshedAppt) {
      queueLocalMutation({
        table: 'appointments',
        op: 'put',
        key: refreshedAppt.id || refreshedAppt.apptNbr,
        data: refreshedAppt,
      });
    }

    // When completing all samples of the current SKU:
    // Prompt the item completion summary modal first with basket details & CN alert before advancing!
    if (completedCount >= effectiveRequiredSamples) {
      // Next plan target (strictly sequential top-to-bottom of the appointment plan)
      const nextAction: ItemCompletionModalData['nextAction'] = getNextPlanTarget(activeGroup) || { type: 'ALL_DONE' };

      // Calculate summary and CN calculation for modal display
      if (activeGroup.standardWeightKg) {
        const netWeights = updated.map(m => m.netWeightKg);
        const itemSummary = calculateWeightSummary({
          standardWeightKg: activeGroup.standardWeightKg,
          netWeights,
          samplingGroupId: activeGroup.id,
          calculatedBy: currentUser?.fullName || 'Receive Staff',
          approvalVersion: activeGroup.approvalVersion,
        });

        const totalCases = activeGroup.confirmedActualQty || activeGroup.apptContQty || 0;
        const cnCalc = (itemSummary.result === 'FAIL' && itemSummary.differenceKg < 0)
          ? calculateCN(activeGroup.standardWeightKg, itemSummary.averageNetKg, totalCases)
          : null;

        setItemCompletionModal({
          group: activeGroup,
          summary: itemSummary,
          cnCalc,
          measurements: updated,
          nextAction,
        });
      }
    }

    setGrossInput('');
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleAdvanceFromCompletionModal = () => {
    cleanUrl();
    if (!itemCompletionModal) return;
    const { nextAction } = itemCompletionModal;
    setItemCompletionModal(null);

    if (nextAction.type === 'NEXT_SKU' && nextAction.nextItemId) {
      setSelectedItemId(nextAction.nextItemId);
      setSwitchedItemAlert({ itemId: nextAction.nextItemId, description: nextAction.nextDescription || '' });
      setTimeout(() => setSwitchedItemAlert(null), 5000);
      setTimeout(() => {
        weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else if (nextAction.type === 'NEXT_PO' && nextAction.nextPoNbr) {
      setSelectedPoNbr(nextAction.nextPoNbr);
      if (nextAction.nextItemId) {
        setSelectedItemId(nextAction.nextItemId);
        setSwitchedItemAlert({ itemId: nextAction.nextItemId, description: nextAction.nextDescription || '' });
        setTimeout(() => setSwitchedItemAlert(null), 5000);
      } else {
        setSelectedItemId('');
      }
      setTimeout(() => {
        weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else if (nextAction.type === 'NEXT_VENDOR' && nextAction.nextVendorNbr) {
      setSelectedVendorNbr(nextAction.nextVendorNbr);
      if (nextAction.nextPoNbr) setSelectedPoNbr(nextAction.nextPoNbr);
      if (nextAction.nextItemId) {
        setSelectedItemId(nextAction.nextItemId);
        setSwitchedItemAlert({
          itemId: nextAction.nextItemId,
          description: `เปลี่ยนไปชั่งผู้ขาย: ${nextAction.nextVendorName || nextAction.nextVendorNbr} (PO ${nextAction.nextPoNbr || ''})`
        });
        setTimeout(() => setSwitchedItemAlert(null), 6000);
      } else {
        setSelectedItemId('');
      }
      setTimeout(() => {
        weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else if (nextAction.type === 'ALL_DONE') {
      const targetApptNbr = appt?.apptNbr || activeGroup?.apptNbr;
      if (targetApptNbr) {
        navigate(`/appointment/${targetApptNbr}/summary`);
      }
    }
  };

  const handleAdvanceNextTarget = () => {
    cleanUrl();
    if (!nextAppointmentTarget) return;
    if (nextAppointmentTarget.type === 'NEXT_SKU' && nextAppointmentTarget.itemId) {
      setSelectedItemId(nextAppointmentTarget.itemId);
      setSwitchedItemAlert({ itemId: nextAppointmentTarget.itemId, description: nextAppointmentTarget.description || '' });
      setTimeout(() => setSwitchedItemAlert(null), 5000);
      setTimeout(() => weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    } else if (nextAppointmentTarget.type === 'NEXT_PO' && nextAppointmentTarget.poNbr) {
      setSelectedPoNbr(nextAppointmentTarget.poNbr);
      if (nextAppointmentTarget.itemId) {
        setSelectedItemId(nextAppointmentTarget.itemId);
        setSwitchedItemAlert({ itemId: nextAppointmentTarget.itemId, description: nextAppointmentTarget.description || '' });
        setTimeout(() => setSwitchedItemAlert(null), 5000);
      } else {
        setSelectedItemId('');
      }
      setTimeout(() => weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    } else if (nextAppointmentTarget.type === 'NEXT_VENDOR' && nextAppointmentTarget.vendorNbr) {
      setSelectedVendorNbr(nextAppointmentTarget.vendorNbr);
      if (nextAppointmentTarget.poNbr) setSelectedPoNbr(nextAppointmentTarget.poNbr);
      if (nextAppointmentTarget.itemId) {
        setSelectedItemId(nextAppointmentTarget.itemId);
        setSwitchedItemAlert({
          itemId: nextAppointmentTarget.itemId,
          description: `เปลี่ยนไปชั่งผู้ขาย: ${nextAppointmentTarget.vendorName || nextAppointmentTarget.vendorNbr} (PO ${nextAppointmentTarget.poNbr || ''})`
        });
        setTimeout(() => setSwitchedItemAlert(null), 6000);
      } else {
        setSelectedItemId('');
      }
      setTimeout(() => weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    } else if (nextAppointmentTarget.type === 'ALL_DONE') {
      const targetApptNbr = appt?.apptNbr || activeGroup?.apptNbr;
      if (targetApptNbr) {
        navigate(`/appointment/${targetApptNbr}/summary`);
      }
    }
  };

  const handleAddMeasurement = async () => {
    if (!activeGroup) return;
    if (currentGross <= 0 || isNaN(currentGross)) {
      alert('กรุณาระบุน้ำหนักรวม (Gross Weight) ที่ถูกต้อง และต้องมากกว่า 0 (ไม่สามารถติดลบได้)');
      return;
    }

    // Validation for container O vs Standard Baskets
    if (skuBasketCode === 'O') {
      if (!customTareInput.trim() || isNaN(currentTareKg) || currentTareKg <= 0) {
        alert('กรุณากรอกน้ำหนักภาชนะ (กล่อง/กระสอบ) ที่ต้องหัก และต้องมากกว่า 0 (ไม่สามารถติดลบได้)');
        return;
      }
      if (currentTareKg >= currentGross) {
        alert(`น้ำหนักภาชนะ (${currentTareKg} กก.) ต้องน้อยกว่าน้ำหนักรวม (${currentGross} กก.) เพื่อให้น้ำหนักสุทธิมากกว่า 0`);
        return;
      }
    } else {
      if (currentTareKg < 0) {
        alert('น้ำหนักภาชนะไม่สามารถติดลบได้');
        return;
      }
      if (currentNet <= 0) {
        alert(`น้ำหนักสุทธิ (Net Weight) ต้องมากกว่า 0 (น้ำหนักรวม ${currentGross} กก. ต้องมากกว่าน้ำหนักตะกร้า ${currentTareKg} กก.)`);
        return;
      }
    }

    const std = activeGroup.standardWeightKg;

    // ─── Safety Verification 1: Underweight Abnormality Confirmation ───
    // - หากสุ่ม 1 ตะกร้า (requiredSamples === 1): ต่ำกว่าเกณฑ์เกิน 10%
    // - หากสุ่มหลายตะกร้า (requiredSamples > 1): บางตะกร้าน้ำหนักต่ำกว่าเกณฑ์เกิน 20%
    if (std && std > 0 && currentNet < std) {
      const shortageKg = std - currentNet;
      const shortagePercent = (shortageKg / std) * 100;
      const isSingleSample = effectiveRequiredSamples === 1;
      const thresholdPercent = isSingleSample ? 10 : 20;

      if (shortagePercent >= thresholdPercent) {
        setUnderweightWarning({
          netKg: currentNet,
          grossKg: currentGross,
          tareKg: currentTareKg,
          standardWeight: std,
          shortageKg,
          shortagePercent,
          thresholdPercent,
          sampleNumber: measurements.length + 1,
          totalRequired: effectiveRequiredSamples,
        });
        return;
      }
    }

    // ─── Safety Verification 2: Per-Item Overweight Abnormality Confirmation (>= 30% of expected weight) ───
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
          totalRequired: effectiveRequiredSamples,
        });
        return;
      }
    }

    // ─── Safety Verification 3: Overweight Confirmation (> 20% average deviation) ───
    // เมื่อชั่งครบทุกตัวอย่าง หากน้ำหนักเฉลี่ยสูงกว่าเกณฑ์เกิน 20%
    const nextSampleNum = measurements.length + 1;
    const isFinalSample = nextSampleNum >= effectiveRequiredSamples;

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

  const handleDeleteMeasurement = async (id: string) => {
    if (!activeGroup) return;
    if (!window.confirm('ต้องการลบตัวอย่างนี้หรือไม่?')) return;
    await db.measurements.delete(id);
    const remaining = measurements.filter(m => m.id !== id);

    // Renumber remaining measurements sequentially (1, 2, 3...) to guarantee consecutive basket numbering
    for (let i = 0; i < remaining.length; i++) {
      const expectedNum = i + 1;
      if (remaining[i].sampleNumber !== expectedNum) {
        remaining[i].sampleNumber = expectedNum;
        await db.measurements.update(remaining[i].id, { sampleNumber: expectedNum });
      }
    }

    const updatedStatus = remaining.length >= effectiveRequiredSamples ? activeGroup.samplingStatus : 'รอชั่ง';
    const now = new Date().toISOString();

    await db.samplingGroups.update(activeGroup.id, {
      completedSamples: remaining.length,
      validSamples: remaining.length,
      samplingStatus: updatedStatus,
      updatedAt: now,
    });

    const allGroups = await db.samplingGroups.where('apptNbr').equals(activeGroup.apptNbr).toArray();
    const liveDone = allGroups.filter(g => 
      g.id === activeGroup.id 
        ? isSkuDone({ ...g, samplingStatus: updatedStatus })
        : isSkuDone(g)
    ).length;

    await db.appointments.where('apptNbr').equals(activeGroup.apptNbr).modify({
      completedGroups: liveDone,
      updatedAt: now,
    });
  };

  const handleMarkNotArrived = async (targetGroup?: SamplingGroup) => {
    const groupToMark = targetGroup || activeGroup;
    if (!groupToMark) return;
    const confirmed = window.confirm(
      `ยืนยันว่าสินค้า [${groupToMark.itemId}] ${groupToMark.description} "ไม่มาตามแผน" (ไม่มาส่งในเที่ยวนี้) ใช่หรือไม่?\n\n` +
      `• ระบบจะบันทึกสถานะเป็น "ไม่มาตามแผน"\n` +
      `• บันทึกจำนวนรับจริงเป็น 0 ${itemNoun}\n` +
      `• ใบนัดหมายนี้จะสามารถลงนามและปิดงานได้ทันทีเมื่อทุกรายการได้รับการระบุสถานะครบถ้วน`
    );
    if (!confirmed) return;

    const now = new Date().toISOString();
    await db.samplingGroups.update(groupToMark.id, {
      samplingStatus: 'ไม่มาตามแผน',
      workflowStatus: 'FINALIZED',
      deliveryStatus: 'NOT_DELIVERED',
      confirmedActualQty: 0,
      completedSamples: 0,
      updatedAt: now,
    });

    // Record delivery exception
    await db.deliveryExceptions.put({
      id: uuidv4(),
      samplingGroupId: groupToMark.id,
      appointmentId: groupToMark.appointmentId,
      apptNbr: groupToMark.apptNbr,
      poNbr: groupToMark.poNbr,
      vendorNbr: groupToMark.vendorNbr,
      vendorName: groupToMark.vendorName || groupToMark.vendorNbr,
      itemId: groupToMark.itemId,
      description: groupToMark.description,
      plannedContQty: Number(groupToMark.apptContQty) || 0,
      importedRcvdContQty: Number(groupToMark.importedRcvdContQty) || 0,
      confirmedActualQty: 0,
      exceptionType: 'NOT_DELIVERED',
      exceptionReason: 'สินค้าไม่มาตามแผน (ไม่มาส่ง)',
      status: 'OPEN',
      reportedBy: currentUser?.fullName || 'Receive Staff',
      reportedAt: now,
      backOfficeResolution: null,
      resolvedBy: null,
      resolvedAt: null,
      syncStatus: 'OFFLINE',
      createdAt: now,
      updatedAt: now,
    });

    // Update appointment progress counts
    const allApptGroups = await db.samplingGroups.where('apptNbr').equals(groupToMark.apptNbr).toArray();
    const excCount = allApptGroups.filter(g => g.id === groupToMark.id || g.samplingStatus === 'ไม่มาตามแผน' || g.samplingStatus === 'ไม่มาส่ง' || g.confirmedActualQty === 0).length;
    const doneCount = allApptGroups.filter(g => g.id === groupToMark.id || isSkuDone(g)).length;
    const apptRecord = await db.appointments.where('apptNbr').equals(groupToMark.apptNbr).first();
    if (apptRecord) {
      await db.appointments.update(apptRecord.id, {
        deliveryExceptionGroups: excCount,
        completedGroups: doneCount,
        updatedAt: now,
      });
    }

    // Auto-advance to next pending item if available
    const nextPending = allApptGroups.find(g => g.id !== groupToMark.id && !isSkuDone(g));
    if (nextPending) {
      if (nextPending.vendorNbr) setSelectedVendorNbr(nextPending.vendorNbr);
      if (nextPending.poNbr) setSelectedPoNbr(nextPending.poNbr);
      setSelectedItemId(nextPending.itemId);
      setSwitchedItemAlert({ itemId: nextPending.itemId, description: nextPending.description || '' });
      setTimeout(() => setSwitchedItemAlert(null), 4000);
    }
  };

  const handleResetToWeighing = async (targetGroup?: SamplingGroup) => {
    const groupToReset = targetGroup || activeGroup;
    if (!groupToReset) return;
    const now = new Date().toISOString();
    const defaultQty = Number(groupToReset.apptContQty) || 1;
    await db.samplingGroups.update(groupToReset.id, {
      samplingStatus: 'รอชั่ง',
      workflowStatus: 'PENDING_QTY_CONFIRM',
      deliveryStatus: 'NORMAL',
      confirmedActualQty: defaultQty,
      updatedAt: now,
    });
    await db.deliveryExceptions.where('samplingGroupId').equals(groupToReset.id).delete();

    const allApptGroups = await db.samplingGroups.where('apptNbr').equals(groupToReset.apptNbr).toArray();
    const excCount = allApptGroups.filter(g => g.id !== groupToReset.id && (g.samplingStatus === 'ไม่มาตามแผน' || g.samplingStatus === 'ไม่มาส่ง' || g.confirmedActualQty === 0)).length;
    const doneCount = allApptGroups.filter(g => g.id !== groupToReset.id && isSkuDone(g)).length;
    const apptRecord = await db.appointments.where('apptNbr').equals(groupToReset.apptNbr).first();
    if (apptRecord) {
      await db.appointments.update(apptRecord.id, {
        deliveryExceptionGroups: excCount,
        completedGroups: doneCount,
        updatedAt: now,
      });
    }
  };

  const isGroupNotDelivered = Boolean(activeGroup && (activeGroup.samplingStatus === 'ไม่มาตามแผน' || activeGroup.samplingStatus === 'ไม่มาส่ง' || activeGroup.confirmedActualQty === 0));

  // Summary object for display
  const isComplete = activeGroup ? measurements.length >= effectiveRequiredSamples : false;
  const netWeights = measurements.map(m => m.netWeightKg);
  const summary = (isComplete && activeGroup?.standardWeightKg) ? calculateWeightSummary({
    standardWeightKg: activeGroup.standardWeightKg,
    netWeights,
    samplingGroupId: activeGroup.id,
    calculatedBy: currentUser?.fullName || 'Receive Staff',
    approvalVersion: activeGroup.approvalVersion,
  }) : null;

  // Signature checks & Role authorization (OTM separate queue/signing removed per DC SOP update)
  const isOtm = false;
  const isFocus = activeGroup?.focusStatus === 'FOCUS';
  const vendorSig = signatures.find(s => s.signerRole === 'VENDOR');
  const receiveSig = signatures.find(s => s.signerRole === 'RECEIVE');
  const lpsSig = signatures.find(s => s.signerRole === 'LPS');
  const otmSig = signatures.find(s => s.signerRole === 'OTM');

  // LP&S roster list (9 authorized staff from authorizedRoster.json)
  const lpsRoster = authorizedRoster.filter(r => r.department === 'DC S&LP Supervisor' || r.role === 'LPS');

  if (!appt) {
    return (
      <Layout title={`ใบนัดหมาย ${apptNbr}`} showBack backTo="/dashboard">
        <div className="p-8 text-center text-[#6E6E6E]">กำลังโหลดข้อมูลใบนัดหมาย...</div>
      </Layout>
    );
  }

  const isVN = appt.carrierCode === 'VN';

  return (
    <Layout title={`ใบนัดหมาย ${apptNbr}`} showBack backTo="/dashboard">
      <div 
        style={{ paddingBottom: 'calc(220px + env(safe-area-inset-bottom, 0px))' }}
        className="p-3.5 sm:p-5 space-y-4 max-w-2xl sm:max-w-3xl mx-auto text-[#1F1F1F] w-full overflow-x-hidden"
      >

        {/* ─── 1. APPOINTMENT SUMMARY CARD (Clean, Minimal & Space-Saving) ───────── */}
        <div className="bg-[#FFFDF9] rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-[#E8E1D8] shadow-xs space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-[#1F1F1F] leading-tight">
                  ใบนัดหมาย {appt.apptNbr}
                </h2>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border shrink-0 ${
                  isVN ? 'bg-[#EAF7ED] text-[#12803C] border-[#AEE0BD]' : 'bg-[#FFF0E6] text-[#F76707] border-[#FFD8BF]'
                }`}>
                  {appt.carrierCode}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#6E6E6E] mt-0.5 break-words">
                เวลา {formatApptTime(appt.apptTime)} · {formatThaiDate(extractDateFromApptTime(appt.apptTime) || appt.receiveDate)} · ผู้ขาย {vendors.length || appt.vendorCount} ราย · {purchaseOrders.length || appt.poCount} ใบสั่งซื้อ
              </p>
              {(appt.shiftType || appt.shiftLeaderName) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  {appt.shiftType && (
                    <span className="px-2 py-0.5 rounded-md bg-[#FEF9E7] text-[#9A7D0A] font-bold border border-[#FAD7A0]">
                      {appt.shiftType}
                    </span>
                  )}
                  {appt.shiftLeaderName && (
                    <span className="text-[#1F1F1F]">
                      หัวหน้างาน OTM: <b className="text-[#0B5E2B] font-bold">{appt.shiftLeaderName}</b>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Progress Badge or Action Button */}
            <div className="shrink-0 ml-auto">
              {isAppointmentCompleted ? (
                <button
                  onClick={() => navigate(`/appointment/${appt.apptNbr}/summary`)}
                  className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>ชั่งครบแล้ว · ดูสรุปผล →</span>
                </button>
              ) : (
                <span className="font-bold text-xs text-[#12803C] bg-[#EAF7ED] border border-[#AEE0BD] px-2.5 py-1 rounded-xl whitespace-nowrap inline-flex items-center gap-1">
                  ชั่งแล้ว <b className="font-black text-[#0B5E2B]">{completedSamplingGroupsCount} / {totalSamplingGroupsCount}</b> ITEM
                </span>
              )}
            </div>
          </div>

          {/* Slim Progress Bar */}
          <div className="w-full bg-[#E8E1D8]/60 rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-[#12803C] transition-all duration-300 rounded-full"
              style={{ 
                width: `${totalSamplingGroupsCount > 0 ? Math.min((completedSamplingGroupsCount / totalSamplingGroupsCount) * 100, 100) : 0}%` 
              }}
            />
          </div>
        </div>

        {/* ─── 2. CASCADING DROPDOWNS (SINGLE-PAGE FLOW) ───────── */}
        {isAppointmentCompleted && !showCompleted ? (
          <div className="bg-[#EAF7ED] border-2 border-[#12803C] rounded-3xl p-5 sm:p-6 text-center space-y-3.5 shadow-sm animate-fadeIn">
            <div className="w-14 h-14 rounded-full bg-[#12803C] text-white flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-[#0B5E2B]">
                ชั่งครบทุกรายการในใบนัดหมายนี้แล้ว!
              </h3>
              <p className="text-xs sm:text-sm text-[#12803C] font-semibold mt-1">
                ชั่งเสร็จสมบูรณ์ทั้ง {totalSamplingGroupsCount} รายการ — ตัดออกจากรายการรอชั่งแล้ว
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center items-center">
              <button
                onClick={() => navigate(`/appointment/${appt.apptNbr}/summary`)}
                className="w-full sm:w-auto bg-[#12803C] hover:bg-[#0B5E2B] text-white px-6 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
              >
                <span>ไปหน้าสรุปผล (Summary) & ลงนาม</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowCompleted(true)}
                className="w-full sm:w-auto bg-white border border-[#AEE0BD] text-[#0B5E2B] px-4 py-3 rounded-2xl font-bold text-xs hover:bg-[#EAF7ED] transition-all"
              >
                ดูรายการที่ชั่งเสร็จแล้ว ({completedSamplingGroupsCount} รายการ)
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#FFFDF9] rounded-2xl p-2.5 sm:p-3.5 border border-[#E8E1D8] shadow-xs space-y-2 sm:space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <h3 className="font-black text-xs sm:text-base text-[#1F1F1F] flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#12803C] text-white flex items-center justify-center text-[10px]">
                  ▼
                </span>
                เลือกรายการสินค้าที่ต้องการชั่ง
              </h3>

              {completedSamplingGroupsCount > 0 && (
                <div className="text-[10px] sm:text-[11px] font-black text-[#12803C] flex items-center gap-1 bg-[#EAF7ED] px-2 py-0.5 rounded-full border border-[#AEE0BD] shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 text-[#12803C]" />
                  <span>ชั่งเสร็จแล้ว {completedSamplingGroupsCount} / {totalSamplingGroupsCount} ITEM</span>
                </div>
              )}
            </div>



            {/* ALERT BANNER: Current Vendor is done & next vendor awaits */}
            {isCurrentVendorDone && nextPendingVendor && (
              <div className="bg-[#EAF7ED] border-2 border-[#12803C] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#12803C] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-[#0B5E2B]">
                      ผู้ขายรายนี้ชั่งครบทุก PO แล้ว!
                    </div>
                    <div className="text-[11px] font-semibold text-[#1F1F1F]">
                      มีผู้ขายถัดไปรอชั่ง: <span className="font-bold text-[#12803C]">{nextPendingVendor.vendorNbr} - {nextPendingVendor.vendorName}</span> ({nextPendingVendor.pendingPoCount} PO รอชั่ง)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleVendorChange(nextPendingVendor.vendorNbr)}
                  className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all self-end sm:self-auto cursor-pointer"
                >
                  <span>ไปชั่งผู้ขายนี้</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* DROPDOWN 1: VENDOR */}
            <div>
              <label className="text-[11px] sm:text-xs font-bold text-[#6E6E6E] block mb-0.5">
                1. ผู้ขาย (Vendor):
              </label>
              <div className="relative">
                <select
                  value={selectedVendorNbr}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  className="w-full bg-[#FFFDF9] border-2 border-[#12803C] rounded-xl pl-3 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] appearance-none focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap min-h-[40px] sm:min-h-[42px]"
                >
                  <option value="">-- กรุณาเลือกผู้ขาย ({vendors.length} ราย) --</option>
                  {vendors.map((v) => {
                    const vPos = purchaseOrders.filter(p => p.vendorNbr === v.vendorNbr);
                    const donePos = vPos.filter(p => isPoDone(p.poNbr)).length;
                    const isDone = vPos.length > 0 && donePos === vPos.length;
                    return (
                      <option 
                        key={v.vendorNbr} 
                        value={v.vendorNbr}
                        className={isDone ? 'text-[#12803C] font-bold bg-[#EAF7ED]' : 'text-[#1F1F1F] font-bold'}
                      >
                        {isDone 
                          ? `🟢 ✓ ${v.vendorNbr} · ${v.vendorName} · ชั่งครบแล้ว (${donePos}/${vPos.length} PO)` 
                          : donePos > 0
                          ? `🔵 ${v.vendorNbr} · ${v.vendorName} · กำลังชั่ง (${donePos}/${vPos.length} PO)`
                          : `${v.vendorNbr} · ${v.vendorName} · รอชั่ง (0/${vPos.length} PO)`}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-4 h-4 text-[#12803C] pointer-events-none absolute right-2.5 top-3 stroke-[2.5]" />
              </div>
            </div>

            {/* DROPDOWN 2: PO */}
            {selectedVendorNbr && (
              <div>
                <label className="text-[11px] sm:text-xs font-bold text-[#6E6E6E] block mb-0.5">
                  2. ใบสั่งซื้อ (PO Number):
                </label>
                <div className="relative">
                  <select
                    value={selectedPoNbr}
                    onChange={(e) => handlePoChange(e.target.value)}
                    className="w-full bg-[#FFFDF9] border-2 border-[#12803C] rounded-xl pl-3 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] appearance-none focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap min-h-[40px] sm:min-h-[42px]"
                  >
                    <option value="">
                      -- กรุณาเลือก PO ({allVendorPOs.length} ใบ) --
                    </option>
                    {allVendorPOs.map((po) => {
                      const poItems = samplingGroups.filter(sg => sg.poNbr === po.poNbr);
                      const doneItems = poItems.filter(sg => isSkuDone(sg)).length;
                      const isDone = isPoDone(po.poNbr);
                      return (
                        <option 
                          key={po.poNbr} 
                          value={po.poNbr}
                          className={isDone ? 'text-[#12803C] font-bold bg-[#EAF7ED]' : 'text-[#1F1F1F] font-bold'}
                        >
                          {isDone 
                            ? `🟢 ✓ PO ${po.poNbr} · ชั่งครบแล้ว (${doneItems}/${poItems.length} ITEM)` 
                            : doneItems > 0
                            ? `🔵 PO ${po.poNbr} · กำลังชั่ง (${doneItems}/${poItems.length} ITEM)`
                            : `PO ${po.poNbr} · รอชั่ง (0/${poItems.length} ITEM)`}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#12803C] pointer-events-none absolute right-2.5 top-3 stroke-[2.5]" />
                </div>
              </div>
            )}

            {/* DROPDOWN 3: ITEM */}
            {selectedPoNbr && (
              <div>
                <label className="text-[11px] sm:text-xs font-bold text-[#6E6E6E] block mb-0.5">
                  3. รายการสินค้า CATCH_WEIGHT (ITEM ID):
                </label>
                <div className="relative">
                  <select
                    value={selectedItemId}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    className="w-full bg-[#FFFDF9] border-2 border-[#12803C] rounded-xl pl-3 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] appearance-none focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap min-h-[40px] sm:min-h-[42px]"
                  >
                    <option value="">
                      -- กรุณาเลือก ITEM ({allPoSKUs.length} รายการ) --
                    </option>
                    {allPoSKUs.map((sku) => {
                      const actualCount = getSkuMeasurementCount(sku.id) || sku.completedSamples || 0;
                      const reqS = Math.max(1, (sku.requiredSamples && sku.requiredSamples > 0)
                        ? sku.requiredSamples 
                        : calculateRequiredSamples(Number(sku.confirmedActualQty) || Number(sku.apptContQty) || 1));
                      const isDone = isSkuDone(sku) || actualCount >= reqS;
                      const isNotDelivered = sku.samplingStatus === 'ไม่มาตามแผน' || sku.samplingStatus === 'ไม่มาส่ง' || sku.confirmedActualQty === 0;
                      const containerNoun = getContainerNoun(sku.uda6 || sku.defaultBasketCode);

                      return (
                        <option 
                          key={sku.itemId} 
                          value={sku.itemId}
                          className={isNotDelivered ? 'text-[#D9480F] font-bold bg-[#FFF0E6]' : isDone ? 'text-[#12803C] font-bold bg-[#EAF7ED]' : 'text-[#1F1F1F] font-bold'}
                        >
                          {isNotDelivered
                            ? `🟠 [${sku.itemId}] ${sku.description} · ไม่มาตามแผน (รับจริง 0)`
                            : isDone 
                            ? `🟢 ✓ [${sku.itemId}] ${sku.description} · ชั่งครบแล้ว (${actualCount}/${reqS} ${containerNoun})` 
                            : actualCount > 0
                            ? `🔵 [${sku.itemId}] ${sku.description} · กำลังชั่ง (${actualCount}/${reqS} ${containerNoun})`
                            : `[${sku.itemId}] ${sku.description} · รอชั่ง (0/${reqS} ${containerNoun})`}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#12803C] pointer-events-none absolute right-2.5 top-3 stroke-[2.5]" />
                </div>
              </div>
            )}

            {/* HELPER: If current PO is complete, provide instant 1-tap jump to next pending item */}
            {allPoSKUs.length > 0 && allPoSKUs.every(isSkuDone) && completedSamplingGroupsCount < totalSamplingGroupsCount && (
              <div className="p-2.5 sm:p-3 bg-[#EBFBEE] border border-[#B2F2BB] rounded-xl flex flex-wrap items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#12803C] shrink-0" />
                  <span className="text-xs font-bold text-[#12803C]">
                    PO นี้ชั่งครบแล้ว! ยังมีสินค้าที่รอชั่งใน PO อื่นอีก {totalSamplingGroupsCount - completedSamplingGroupsCount} รายการ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextPending = samplingGroups.find(sg => !isSkuDone(sg));
                    if (nextPending) {
                      if (nextPending.vendorNbr) setSelectedVendorNbr(nextPending.vendorNbr);
                      if (nextPending.poNbr) setSelectedPoNbr(nextPending.poNbr);
                      setSelectedItemId(nextPending.itemId);
                      setSwitchedItemAlert({ itemId: nextPending.itemId, description: nextPending.description || '' });
                      setTimeout(() => setSwitchedItemAlert(null), 4000);
                      setTimeout(() => {
                        weighingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }, 100);
                    }
                  }}
                  className="bg-[#12803C] hover:bg-[#0B5E2B] text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  ไปชั่งรายการถัดไป →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── 3. WEIGHING WORKFLOW (OPENS DIRECTLY ON SAME SCREEN) ─── */}
        {activeGroup && (
          <div className="space-y-2.5 sm:space-y-3 pt-0.5 animate-fadeIn">
            
            {/* CARD A: ITEM INFO & CRITERION */}
            <div className="bg-[#FFFDF9] rounded-2xl p-2.5 sm:p-3.5 border border-[#E8E1D8] shadow-xs space-y-1">
              <div className="flex flex-wrap justify-between items-center gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-[#12803C] bg-[#EAF7ED] border border-[#AEE0BD] px-2 py-0.5 rounded-lg">
                    ITEM: {activeGroup.itemId}
                  </span>
                  <StatusBadge status={activeGroup.samplingStatus} size="sm" />
                </div>

                <button
                  type="button"
                  onClick={!isOtm ? handleToggleFocus : undefined}
                  disabled={isOtm}
                  title={isOtm ? "เฉพาะเจ้าหน้าที่ Receive/Admin จึงสามารถเปลี่ยนสถานะโฟกัสได้" : "คลิกเพื่อสลับสถานะ: สินค้าทั่วไป ↔ สินค้าโฟกัส (Focus)"}
                  className={`transition-transform flex items-center gap-1 group ${!isOtm ? 'cursor-pointer active:scale-95' : 'cursor-default opacity-90'}`}
                >
                  <StatusBadge status={activeGroup.focusStatus} size="sm" />
                  {!isOtm && (
                    <span className="text-[10px] text-[#6E6E6E] underline decoration-dotted group-hover:text-[#12803C]">
                      (แตะสลับ)
                    </span>
                  )}
                </button>
              </div>

              <h3 className="font-black text-[#1F1F1F] text-sm sm:text-lg leading-snug break-words">
                {activeGroup.description}
              </h3>

              {activeGroup.standardWeightKg && (
                <p className="text-xs sm:text-sm font-bold text-[#12803C]">
                  {itemNoun}ละ {activeGroup.standardWeightKg} กก.
                </p>
              )}
            </div>

            {/* CARD B: CONFIRM CONTAINER QUANTITY */}
            <div className="bg-[#FFFDF9] rounded-2xl p-2.5 sm:p-3.5 border border-[#E8E1D8] shadow-xs space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-[#1F1F1F] text-xs sm:text-base flex items-center gap-1.5">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#12803C] text-white flex items-center justify-center text-[10px] sm:text-xs">1</span>
                  ยืนยันจำนวนรับจริง
                </h4>
                {!isEditingQty && !isOtm && (
                  <button
                    onClick={() => {
                      setConfirmedQtyInput(String(activeGroup.confirmedActualQty ?? activeGroup.importedRcvdContQty ?? activeGroup.apptContQty ?? 0));
                      setIsEditingQty(true);
                    }}
                    className="text-xs text-[#12803C] font-bold hover:underline"
                  >
                    แก้ไขจำนวน
                  </button>
                )}
              </div>

              {/* Clean Summary: จำนวนตามแผน | จำนวนรับจริง | ต้องสุ่มชั่ง */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-xs text-center sm:text-left">
                <div className="bg-[#EAF7ED] px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-[#AEE0BD]">
                  <span className="text-[#0B5E2B] block text-[10px] sm:text-[11px] font-bold truncate">ตามแผน</span>
                  <span className="font-black text-[#12803C] text-sm sm:text-base">
                    {activeGroup.apptContQty ?? 0} <span className="text-[10px] sm:text-xs font-semibold">{itemNoun}</span>
                  </span>
                </div>
                <div className="bg-[#F7F2EA] px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-[#E8E1D8]">
                  <span className="text-[#6E6E6E] block text-[10px] sm:text-[11px] font-bold truncate">รับจริง</span>
                  <span className="font-black text-[#1F1F1F] text-sm sm:text-base">
                    {activeGroup.confirmedActualQty !== null ? activeGroup.confirmedActualQty : (activeGroup.importedRcvdContQty ?? 0)} <span className="text-[10px] sm:text-xs font-semibold">{itemNoun}</span>
                  </span>
                </div>
                <div className="bg-[#FEF9E7] px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-[#FAD7A0]">
                  <span className="text-[#9A7D0A] block text-[10px] sm:text-[11px] font-bold truncate">สุ่มชั่ง 10%</span>
                  <span className="font-black text-[#9A7D0A] text-sm sm:text-base">
                    {effectiveRequiredSamples} <span className="text-[10px] sm:text-xs font-semibold">{itemNoun}</span>
                  </span>
                </div>
              </div>

              {isEditingQty ? (
                <div className="space-y-2 pt-2 border-t border-[#E8E1D8]">
                  <div>
                    <label className="text-xs font-bold text-[#1F1F1F] block mb-1">
                      ระบุจำนวนรับจริง ({itemNoun}):
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={confirmedQtyInput}
                      onChange={(e) => setConfirmedQtyInput(e.target.value)}
                      className="w-full text-center text-xl sm:text-2xl font-black min-h-[44px] py-1 border-2 border-[#12803C] rounded-xl focus:outline-none bg-[#FFFDF9] leading-normal box-border"
                    />
                  </div>

                  {parseInt(confirmedQtyInput, 10) !== (activeGroup.apptContQty ?? 0) && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#9A7D0A] block">
                        * ระบุเหตุผลการปรับปรุงจำนวน:
                      </label>
                      <input
                        type="text"
                        value={qtyReason}
                        onChange={(e) => setQtyReason(e.target.value)}
                        placeholder="เช่น สินค้าส่งขาด 2 หน่วย..."
                        className="w-full text-xs p-2 border border-[#FAD7A0] rounded-xl focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingQty(false)}
                      className="px-3.5 py-2 sm:py-2.5 bg-[#E8E1D8] hover:bg-[#D5CDC3] text-[#1F1F1F] font-bold rounded-xl text-xs transition-all"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleConfirmQty}
                      className="flex-1 bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-2 sm:py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      ยืนยันจำนวนรับจริง & คำนวณเกณฑ์สุ่ม 10%
                    </button>
                  </div>
                </div>
              ) : null}
              {/* Not delivered notification or Mark not delivered button */}
              {isGroupNotDelivered ? (
                <div className="pt-2 border-t border-[#FFD8BF] bg-[#FFF0E6]/60 p-3 rounded-2xl space-y-2 text-center sm:text-left">
                  <div className="flex items-center gap-2 text-xs">
                    <AlertTriangle className="w-5 h-5 text-[#D9480F] shrink-0" />
                    <div>
                      <span className="font-black text-[#D9480F] text-xs sm:text-sm block">
                        สินค้ารายการนี้บันทึกว่า: ไม่มาตามแผน (รับจริง 0 {itemNoun})
                      </span>
                      <span className="text-[11px] text-[#A63C06]">
                        ระบบบันทึกสถานะเรียบร้อยแล้ว · สามารถไปลงนามปิดงานใบนัดหมายนี้ได้
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 justify-center sm:justify-start">
                    {!isOtm && (
                      <button
                        type="button"
                        onClick={() => handleResetToWeighing(activeGroup)}
                        className="bg-white hover:bg-[#FFE3D4] text-[#D9480F] border border-[#FFD8BF] px-3 py-1.5 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-2xs"
                      >
                        เปลี่ยนเป็นสุ่มชั่งตามปกติ
                      </button>
                    )}
                    {isAppointmentCompleted ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/appointment/${appt.apptNbr}/summary`)}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-4 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ไปหน้าสรุปผล & ลงนาม →</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const nextPending = samplingGroups.find(g => g.id !== activeGroup.id && !isSkuDone(g));
                          if (nextPending) {
                            if (nextPending.vendorNbr) setSelectedVendorNbr(nextPending.vendorNbr);
                            if (nextPending.poNbr) setSelectedPoNbr(nextPending.poNbr);
                            setSelectedItemId(nextPending.itemId);
                          }
                        }}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white px-4 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ไปรายการถัดไป →</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : !isEditingQty && !isOtm ? (
                <div className="pt-2 border-t border-[#E8E1D8]/70 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[#6E6E6E]">
                    หากผู้ขายไม่ได้นำสินค้านี้มาส่งตามแผน:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMarkNotArrived(activeGroup)}
                    className="bg-[#FFF0E6] hover:bg-[#FFE3D4] text-[#D9480F] border border-[#FFD8BF] px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-2xs"
                    title="คลิกหากสินค้ารายการนี้ไม่มาตามแผน (ไม่มาส่งในเที่ยวนี้) เพื่อให้ลงนามปิดงานได้"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-[#D9480F]" />
                    <span>สินค้าไม่มาตามแผน (ไม่มาส่ง)</span>
                  </button>
                </div>
              ) : null}
            </div>

            {!isGroupNotDelivered && (
              <>
                {/* CARD C: BASKET SELECTION (Once per ITEM + UDA6) */}
            <div className="bg-[#FFFDF9] rounded-2xl p-2.5 sm:p-3.5 border border-[#E8E1D8] shadow-xs space-y-1.5">
              <div className="flex flex-wrap justify-between items-center gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs sm:text-sm font-bold text-[#1F1F1F] block">
                    เลือกประเภทภาชนะ
                  </label>
                  <span className="text-[11px] text-[#6E6E6E] font-medium">(ลักษณะนาม: <b>{itemNoun}</b>)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeGroup.uda6 && (
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-[#E8E1D8] px-1.5 py-0.5 rounded text-[#1F1F1F]">
                      UDA6: {activeGroup.uda6}
                    </span>
                  )}
                  <span className="font-bold text-[#12803C] bg-[#EAF7ED] px-2 py-0.5 rounded-lg border border-[#AEE0BD] text-xs shrink-0">
                    {skuBasketCode === 'O' 
                      ? `หักตามจริง ${currentTareKg} กก.` 
                      : `หัก ${activeBasket.tareWeightKg} กก.`}
                  </span>
                </div>
              </div>

              {/* Native Dropdown, Locked Complete State, or OTM Read-Only */}
              {measurements.length >= effectiveRequiredSamples ? (
                <div className="p-2.5 sm:p-3 bg-[#EAF7ED] border border-[#AEE0BD] rounded-xl flex items-center justify-between text-xs font-bold text-[#1F1F1F]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#12803C] shrink-0" />
                    <span>
                      {skuBasketCode === 'O' 
                        ? `ภาชนะ O (กล่อง/กระสอบ) · หัก ${currentTareKg} กก.` 
                        : `${activeBasket.name || `ตะกร้า ${activeBasket.code}`} · หัก ${activeBasket.tareWeightKg} กก.`}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#12803C] font-semibold bg-white px-2 py-0.5 rounded-lg border border-[#AEE0BD] shrink-0">
                    ชั่งครบแล้ว (หากต้องการเปลี่ยน ให้ลบรายการชั่งออกก่อน)
                  </span>
                </div>
              ) : isOtm ? (
                <div className="p-2 sm:p-2.5 bg-[#F7F2EA] border border-[#E8E1D8] rounded-xl flex items-center justify-between text-xs font-bold text-[#1F1F1F]">
                  <span className="flex items-center gap-2">
                    <ShoppingBasket className="w-4 h-4 text-[#12803C]" />
                    {skuBasketCode === 'O' ? 'กล่อง / กระสอบ (ภาชนะ O)' : (activeBasket.name || `ตะกร้า ${activeBasket.code}`)}
                  </span>
                  <span className="text-[#12803C]">หัก {currentTareKg} กก.</span>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={skuBasketCode}
                    onChange={(e) => handleSaveBasket(e.target.value)}
                    className="w-full bg-[#FFFDF9] border-2 border-[#12803C] rounded-xl pl-3 pr-9 py-2 text-xs sm:text-sm font-bold text-[#1F1F1F] appearance-none focus:outline-none focus:ring-2 focus:ring-[#39A85B] cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap min-h-[42px]"
                  >
                    {activeBasketOptions.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code === 'O' 
                          ? 'กล่อง / กระสอบ (ภาชนะ O) · ต้องใส่น้ำหนักเอง'
                          : `ตะกร้า ${b.code} · น้ำหนักหัก ${b.tareWeightKg} กก.`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#12803C] pointer-events-none absolute right-3 top-3 stroke-[2.5]" />
                </div>
              )}

              {/* For Container O: Manual Tare Weight Input (ONLY shown while weighing, hidden when completed) */}
              {skuBasketCode === 'O' && measurements.length < effectiveRequiredSamples && (
                <div className="p-2.5 sm:p-3 bg-[#FEF9E7] border border-[#FAD7A0] rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2">
                  <div className="flex flex-wrap justify-between items-center gap-1 text-xs">
                    <span className="font-bold text-[#7D6608] flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-[#E67700]" />
                      ระบุน้ำหนักภาชนะ (กล่อง/กระสอบ):
                    </span>
                    <span className="text-[11px] text-[#9A7D0A] font-medium">ปรับเปลี่ยนได้ทุกตัวอย่าง</span>
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
                      }}
                      onBlur={() => {
                        const parsed = parseFloat(customTareInput);
                        if (!isNaN(parsed) && parsed > 0 && activeGroup) {
                          db.samplingGroups.update(activeGroup.id, {
                            defaultTareWeightKg: parsed,
                          });
                        }
                      }}
                      disabled={isOtm}
                      className="w-full text-center text-xl sm:text-2xl font-black min-h-[46px] py-1.5 border-2 border-[#E67700] rounded-xl focus:outline-none bg-[#FFFDF9] text-[#1F1F1F] leading-normal box-border"
                    />
                    <span className="absolute right-3.5 top-3 text-xs font-bold text-[#9A7D0A]">กก.</span>
                  </div>
                  {measurements.length > 0 && customTareInput && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#12803C] bg-[#EAF7ED] px-2.5 py-1 rounded-lg border border-[#AEE0BD]">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#12803C]" />
                      <span>ดึงน้ำหนักจากกล่องแรกอัตโนมัติ ({customTareInput} กก.)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CARD D: WEIGHING SAMPLES */}
            <div ref={weighingCardRef} className="bg-[#FFFDF9] rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 border border-[#E8E1D8] shadow-xs space-y-2">
              
              {/* Switched item auto-advance notification */}
              {switchedItemAlert && (
                <div className="bg-[#12803C] text-white p-2 sm:p-2.5 rounded-xl shadow-md border border-white/20 flex items-center justify-between gap-2 animate-fadeIn">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-[#FAD7A0] shrink-0" />
                    <div className="text-xs truncate">
                      <span className="font-black text-amber-200">สลับมายัง ITEM ถัดไปแล้ว:</span>
                      <span className="font-bold ml-1.5">[{switchedItemAlert.itemId}] {switchedItemAlert.description}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSwitchedItemAlert(null)} 
                    className="text-xs text-white/80 hover:text-white px-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* UNIFIED ACTIVE ITEM & WEIGHING CARD (Integrated Blue Theme — Compact & Space-Saving) */}
              <div className="bg-[#F0F7FF] border-2 border-[#1971C2] rounded-2xl p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 shadow-xs">
                {/* Row 1: Badges (ITEM, Full PO, Sampling Progress) */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-black text-xs sm:text-sm bg-[#1971C2] text-white px-2 py-0.5 rounded-lg shadow-2xs shrink-0">
                      ITEM {activeGroup.itemId}
                    </span>
                    <span className="font-mono font-black text-xs sm:text-sm bg-white text-[#1864AB] border border-[#A5D8FF] px-2 py-0.5 rounded-lg shadow-2xs shrink-0 whitespace-nowrap">
                      PO: {activeGroup.poNbr}
                    </span>
                  </div>
                  <span className="text-xs font-black text-[#1864AB] bg-white border border-[#A5D8FF] px-2 py-0.5 rounded-lg shrink-0 shadow-2xs">
                    ชั่งแล้ว {measurements.length} / {effectiveRequiredSamples} {itemNoun}
                  </span>
                </div>

                {/* Row 2: Product Name */}
                <div className="font-black text-sm sm:text-base text-[#1F1F1F] leading-snug break-words">
                  {activeGroup.description}
                </div>

                {/* Row 3: Standard Weight & Basket Tare Badge */}
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs sm:text-sm">
                  {activeGroup.standardWeightKg ? (
                    <span className="font-bold text-[#1864AB]">
                      {itemNoun}ละ {activeGroup.standardWeightKg} กก.
                    </span>
                  ) : <span />}
                  <span className="bg-white text-[#1864AB] font-black px-2 py-0.5 rounded-lg border border-[#A5D8FF] text-xs shrink-0 whitespace-nowrap shadow-2xs">
                    {skuBasketCode === 'O' 
                      ? `ภาชนะ O (หัก ${currentTareKg} kg)` 
                      : `Tray ${activeBasket.code} (หัก ${currentTareKg} kg)`}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#D0EBFF] rounded-full h-1.5 sm:h-2 overflow-hidden">
                  <div 
                    className="h-full bg-[#1971C2] transition-all duration-300 rounded-full"
                    style={{ 
                      width: `${effectiveRequiredSamples > 0 ? Math.min((measurements.length / effectiveRequiredSamples) * 100, 100) : 0}%` 
                    }}
                  />
                </div>

                {/* Gross Weight Entry Form (Receive Staff Only) */}
                {isOtm ? (
                  <div className="bg-[#FFF9DB] p-2.5 sm:p-3 rounded-xl border border-[#F59F00] text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold text-[#E67700]">
                      <Shield className="w-4 h-4 text-[#E67700]" />
                      <span>โหมดตรวจสอบ OTM (Verification Only)</span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-[#7D6608] leading-relaxed">
                      OTM มีหน้าที่ตรวจสอบความถูกต้องและอนุมัติผลเท่านั้น ไม่สามารถกรอกหรือแก้ไขตัวเลขการชั่งสุ่มตรวจได้ (หน้าที่ชั่งน้ำหนักเป็นของฝ่าย Receive)
                    </p>
                  </div>
                ) : measurements.length < effectiveRequiredSamples ? (
                  <div className="space-y-1.5 pt-1 border-t border-[#D0EBFF]">
                    <div className="flex justify-between items-baseline gap-1 text-xs font-bold text-[#1864AB]">
                      <span>
                        ใส่น้ำหนัก{itemNoun}ที่ {measurements.length + 1}:
                      </span>
                      <span className="text-[11px] text-[#6E6E6E] font-medium">
                        (รวม{skuBasketCode === 'O' ? 'ภาชนะ' : 'ตะกร้า'})
                      </span>
                    </div>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="เช่น 10.85"
                      value={grossInput}
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
                        setGrossInput(val);
                      }}
                      className="w-full text-center text-2xl sm:text-3xl font-extrabold min-h-[46px] sm:min-h-[50px] py-1 sm:py-1.5 px-3 border-2 border-[#1971C2] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#339AF0] bg-white text-[#1F1F1F] shadow-inner leading-normal box-border"
                    />

                    {currentGross > 0 && (
                      <div className="p-1.5 sm:p-2 bg-white border border-[#A5D8FF] rounded-xl flex flex-wrap justify-between items-center gap-1 text-xs sm:text-sm text-[#1864AB]">
                        <span>รวม: <b>{currentGross}</b> kg − {skuBasketCode === 'O' ? 'ภาชนะ' : 'ตะกร้า'}: <b>{currentTareKg}</b> kg =</span>
                        <span className="text-sm sm:text-base font-black text-[#1971C2]">
                          สุทธิ {currentNet.toFixed(3)} kg
                        </span>
                      </div>
                    )}

                    <button
                      onClick={handleAddMeasurement}
                      disabled={currentGross <= 0 || saveStatus === 'saving'}
                      className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-2 sm:py-2.5 px-4 rounded-xl text-xs sm:text-base flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all disabled:opacity-40 leading-normal text-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[3]" />
                      <span>{saveStatus === 'saving' ? 'กำลังบันทึก...' : `บันทึก${itemNoun}ที่ ${measurements.length + 1}`}</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 bg-white border border-[#A5D8FF] rounded-xl text-center text-xs sm:text-sm font-bold text-[#12803C] flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#12803C]" />
                    ชั่งครบตามเกณฑ์ {effectiveRequiredSamples} {itemNoun}แล้ว!
                  </div>
                )}
              </div>

              {/* Recorded Samples List */}
              {measurements.length > 0 && (() => {
                const std = activeGroup?.standardWeightKg ?? 0;
                const hasUnderweight = std > 0 && measurements.some(m => m.netWeightKg < (std - 0.005));

                return (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-[#6E6E6E]">
                        ประวัติที่ชั่งแล้ว ({measurements.length} {itemNoun}):
                      </span>
                      {hasUnderweight && (
                        <span className="text-[10px] font-black text-[#E03131] bg-[#FDE8E8] px-2 py-0.5 rounded-md border border-[#FFA8A8] flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-[#E03131]" />
                          พบตัวอย่างต่ำกว่าเกณฑ์ {std} กก.
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar">
                      {measurements.map((m) => {
                        const isUnderweight = std > 0 && m.netWeightKg < (std - 0.005);
                        const shortage = isUnderweight ? Math.round((std - m.netWeightKg) * 100) / 100 : 0;

                        return (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl border text-xs flex justify-between items-center shadow-xs transition-all ${
                              isUnderweight
                                ? 'bg-[#FFF5F5] border-l-4 border-l-[#E03131] border-[#FFC9C9]'
                                : 'bg-[#FFFDF9] border border-[#E8E1D8]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full font-black flex items-center justify-center text-[10px] ${
                                isUnderweight
                                  ? 'bg-[#FDE8E8] text-[#E03131] border border-[#FFA8A8]'
                                  : 'bg-[#EAF7ED] text-[#12803C]'
                              }`}>
                                {m.sampleNumber}
                              </span>
                              <div>
                                <span className="font-bold text-[#1F1F1F]">
                                  {m.grossWeightKg}kg − {m.basketCode === 'O' ? 'ภาชนะ' : 'ตะกร้า'} {m.basketCode} ({m.tareWeightKg}kg)
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-[#6E6E6E]">
                                    เวลา: {new Date(m.recordedAt).toLocaleTimeString('th-TH')}
                                  </span>
                                  {isUnderweight && (
                                    <span className="text-[9.5px] font-black text-[#E03131] bg-[#FDE8E8] px-1.5 py-0.2 rounded border border-[#FFA8A8]">
                                      ⚠️ ขาด -{shortage.toFixed(2)} kg (เกณฑ์ {std} kg)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-black text-sm ${
                                isUnderweight ? 'text-[#E03131]' : 'text-[#12803C]'
                              }`}>
                                {m.netWeightKg.toFixed(2)} kg
                              </span>
                              {!isOtm && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMeasurement(m.id)}
                                  className="text-[#6E6E6E] hover:text-[#E03131] p-1 cursor-pointer transition-colors"
                                  title="ลบ"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CARD E: SUMMARY & TOLERANCE EVALUATION */}
            {summary && (
              <div className="bg-[#FFFDF9] rounded-3xl p-4.5 border border-[#E8E1D8] shadow-xs space-y-3">
                <h4 className="font-bold text-[#1F1F1F] text-sm flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#12803C] text-white flex items-center justify-center text-xs">3</span>
                  สรุปผลการสุ่มชั่งน้ำหนัก (เกณฑ์มาตรฐาน ห้ามขาด ≥0.01 kg / เพดานเกิน +10%)
                </h4>

                {/* Big Result Banner */}
                {(() => {
                  const isOverweight = summary.result === 'FAIL' && summary.differenceKg > 0;
                  const isUnderweight = summary.result === 'FAIL' && summary.differenceKg < 0;

                  if (summary.result === 'PASS') {
                    return (
                      <div className="p-4 rounded-2xl text-center border-2 bg-[#EAF7ED] border-[#12803C] text-[#0B5E2B]">
                        <div className="text-2xl font-black">✓ ผ่านเกณฑ์ (ชั่งครบ)</div>
                        <p className="text-xs mt-1 text-[#12803C]">
                          ผลต่าง: <b>{summary.differenceKg > 0 ? '+' : ''}{summary.differenceKg} kg</b> ({formatPercent(summary.differencePercent)}) · น้ำหนักได้ตามมาตรฐาน (ไม่ขาดเกณฑ์)
                        </p>
                      </div>
                    );
                  }

                  if (isOverweight) {
                    return (
                      <div className="p-4 rounded-2xl text-center border-2 bg-[#FEF9E7] border-[#F2C230] text-[#9A7D0A]">
                        <div className="text-xl font-black">⚠️ น้ำหนักเกินเกณฑ์ (+{formatPercent(summary.differencePercent)})</div>
                        <p className="text-xs mt-1 font-semibold text-[#B7791F]">
                          ผลต่าง: +{summary.differenceKg} kg · <b>แจ้งเตือนน้ำหนักเกิน (เพดาน +10% / ไม่ต้องเปิดเคส CN)</b>
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="p-4 rounded-2xl text-center border-2 bg-[#FDE8E8] border-[#E03131] text-[#E03131]">
                      <div className="text-xl font-black">✗ น้ำหนักขาดหาย ({formatPercent(summary.differencePercent)})</div>
                      <p className="text-xs mt-1 font-semibold text-[#C92A2A]">
                        ผลต่าง: {summary.differenceKg} kg · <b>ผิดเกณฑ์ (ขาดตั้งแต่ 0.01 kg ขึ้นไป ต้องเปิดเคส CN เพื่อหักยอดเงิน)</b>
                      </p>
                    </div>
                  );
                })()}

                {/* Detail Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#F7F2EA] p-2.5 rounded-xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[11px]">น้ำหนักรวมจริงที่ชั่ง:</span>
                    <span className="font-black text-[#1F1F1F] text-base">{summary.actualTotalKg} kg</span>
                  </div>
                  <div className="bg-[#F7F2EA] p-2.5 rounded-xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[11px]">น้ำหนักมาตรฐานรวม:</span>
                    <span className="font-black text-[#1F1F1F] text-base">{summary.expectedTotalKg} kg</span>
                  </div>
                </div>

                {/* Lotus's SRRDC CN Formula Breakdown Box */}
                {summary.result === 'FAIL' && summary.differenceKg < 0 && (() => {
                  const totalCases = activeGroup.confirmedActualQty || activeGroup.apptContQty || 0;
                  const cnCalc = calculateCN(activeGroup.standardWeightKg || 0, summary.averageNetKg, totalCases);
                  const totalReceivedKg = Number((cnCalc.actualAverageNetKg * cnCalc.totalActualCases).toFixed(2));
                  return (
                    <div className="p-3.5 bg-[#FFF0E6] border border-[#FFD8BF] rounded-2xl space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-[#F76707]">📋 เอกสารออก CN (Lotus's SRRDC QC):</span>
                        <span className="bg-[#E03131] text-white font-black px-2.5 py-0.5 rounded-lg text-xs">
                          ยอด CN: {cnCalc.cnTotalKg} kg
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] bg-white p-2.5 rounded-xl border border-[#FFD8BF]">
                        <div>
                          <span className="text-[#6E6E6E] block text-[10px]">(case)</span>
                          <span className="font-black text-[#1F1F1F] text-xs">{cnCalc.totalActualCases}</span>
                        </div>
                        <div>
                          <span className="text-[#6E6E6E] block text-[10px]">size_(Kg)</span>
                          <span className="font-black text-[#1F1F1F] text-xs">{cnCalc.standardWeightKg}</span>
                        </div>
                        <div className="bg-[#FFF5F5] border border-[#FFA8A8] rounded-lg p-0.5">
                          <span className="text-[#E03131] block text-[10px] font-bold">ชั่งได้จริง</span>
                          <span className="font-black text-[#E03131] text-xs sm:text-sm">{cnCalc.actualAverageNetKg}</span>
                        </div>
                        <div>
                          <span className="text-[#6E6E6E] block text-[10px]">Kg/case</span>
                          <span className="font-black text-[#E03131] text-xs">-{cnCalc.shortagePerCaseKg}</span>
                        </div>
                      </div>

                      {/* สรุปน้ำหนักรับเข้าจริง */}
                      <div className="bg-white p-2.5 rounded-xl border border-[#FFD8BF] flex justify-between items-center text-xs">
                        <div>
                          <span className="font-black text-[#0B5E2B] block">📦 สรุปน้ำหนักสุทธิที่ต้องรับเข้าจริง:</span>
                          <span className="text-[10px] text-[#6E6E6E]">({cnCalc.actualAverageNetKg} kg × {cnCalc.totalActualCases} {itemNoun})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-black text-base text-[#0B5E2B]">
                            {totalReceivedKg.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] font-bold text-[#6E6E6E] ml-1">kg</span>
                        </div>
                      </div>

                      <p className="text-[10px] text-[#6E6E6E] leading-relaxed">
                        สูตรคำนวณ: ({cnCalc.standardWeightKg} − {cnCalc.actualAverageNetKg}) × {cnCalc.totalActualCases} กล่อง = <b>{cnCalc.cnTotalKg} kg</b> (บันทึกเข้าระบบ CN อัตโนมัติ)
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* NEXT STEP / SUMMARY CTA (Signatures handled once at Summary page) */}
            {isComplete && (
              <div className="bg-[#FFFDF9] rounded-3xl p-4.5 sm:p-5 border border-[#E8E1D8] shadow-xs space-y-3 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#12803C]" />
                  <h4 className="font-bold text-[#1F1F1F] text-sm sm:text-base">
                    บันทึกการชั่งสุ่มตรวจ ITEM นี้ครบถ้วนแล้ว
                  </h4>
                </div>
                <p className="text-xs text-[#6E6E6E] leading-relaxed">
                  {nextAppointmentTarget?.type === 'NEXT_VENDOR'
                    ? `ผู้ขายรายนี้ (${activeGroup?.vendorName || selectedVendorNbr}) ชั่งครบทุก PO แล้ว! มีผู้ขายถัดไปรอชั่ง: ${nextAppointmentTarget.vendorName}`
                    : nextAppointmentTarget?.type === 'ALL_DONE'
                    ? 'ชั่งครบทุกรายการและทุกผู้ขายในใบนัดหมายนี้เรียบร้อยแล้ว ท่านสามารถไปตรวจสอบและลงนามรับรองที่หน้าสรุปผล (Summary)'
                    : 'ผลการสุ่มชั่งถูกบันทึกเรียบร้อยแล้ว ท่านสามารถกดไปรายการถัดไป หรือเลือกชั่ง ITEM อื่นจากรายการด้านบน'}
                </p>
                <div className="pt-1 flex flex-col sm:flex-row gap-2">
                  {nextAppointmentTarget?.type === 'NEXT_SKU' && (
                    <button
                      onClick={handleAdvanceNextTarget}
                      className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3 px-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all cursor-pointer"
                    >
                      <span>ไปรายการถัดไป ({nextAppointmentTarget.description ? (nextAppointmentTarget.description.length > 20 ? nextAppointmentTarget.description.substring(0, 20) + '...' : nextAppointmentTarget.description) : 'ITEM ถัดไป'}) →</span>
                    </button>
                  )}
                  {nextAppointmentTarget?.type === 'NEXT_PO' && (
                    <button
                      onClick={handleAdvanceNextTarget}
                      className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3 px-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all cursor-pointer"
                    >
                      <span>ไปยัง PO ถัดไป (PO {nextAppointmentTarget.poNbr}) →</span>
                    </button>
                  )}
                  {nextAppointmentTarget?.type === 'NEXT_VENDOR' && (
                    <button
                      onClick={handleAdvanceNextTarget}
                      className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-bold py-3 px-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all cursor-pointer"
                    >
                      <span>ไปชั่งผู้ขายถัดไป: {nextAppointmentTarget.vendorName} →</span>
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/appointment/${appt.apptNbr}/summary`)}
                    className={`w-full font-bold py-3 px-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      nextAppointmentTarget?.type === 'ALL_DONE'
                        ? 'bg-[#12803C] hover:bg-[#0B5E2B] text-white shadow-sm active:scale-98'
                        : 'bg-white border border-[#E8E1D8] text-[#6E6E6E] hover:text-[#1F1F1F] hover:bg-[#F7F2EA]'
                    }`}
                  >
                    <span>{nextAppointmentTarget?.type === 'ALL_DONE' ? 'ดูสรุปผลใบนัดหมาย (Summary) & ลงนาม →' : 'ดูสรุปผลรวม (Summary) / ลงนาม'}</span>
                  </button>
                </div>
              </div>
            )}
              </>
            )}

          </div>
        )}

        {/* ─── STICKY ACTION BAR FOR MOBILE (SECTION 4) ───────── */}
        {activeGroup && !isGroupNotDelivered && (
          <div 
            style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
            className="fixed left-0 right-0 bg-[#FFFDF9]/98 backdrop-blur-md border-t border-[#E8E1D8] px-4 py-2.5 z-30 shadow-lg"
          >
            <div className="max-w-2xl sm:max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-[#6E6E6E] block text-[11px] font-medium">ITEM {activeGroup.itemId}:</span>
                <span className="font-black text-[#12803C] text-sm">
                  {measurements.length} / {effectiveRequiredSamples} {itemNoun}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Primary Green Action Button: Directly accessible in sticky bar during weighing */}
                {measurements.length < effectiveRequiredSamples && (
                  <button
                    onClick={handleAddMeasurement}
                    disabled={currentGross <= 0 || saveStatus === 'saving'}
                    className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>{saveStatus === 'saving' ? 'กำลังบันทึก...' : `บันทึก${itemNoun}ที่ ${measurements.length + 1}`}</span>
                  </button>
                )}

                {/* When all samples of current SKU complete: guide to next target */}
                {measurements.length >= effectiveRequiredSamples && (
                  <>
                    {nextAppointmentTarget?.type === 'NEXT_SKU' && (
                      <button
                        onClick={handleAdvanceNextTarget}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ไปรายการถัดไป →</span>
                      </button>
                    )}
                    {nextAppointmentTarget?.type === 'NEXT_PO' && (
                      <button
                        onClick={handleAdvanceNextTarget}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ไปยัง PO ถัดไป ({nextAppointmentTarget.poNbr}) →</span>
                      </button>
                    )}
                    {nextAppointmentTarget?.type === 'NEXT_VENDOR' && (
                      <button
                        onClick={handleAdvanceNextTarget}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ไปชั่งผู้ขายถัดไป ({nextAppointmentTarget.vendorName ? (nextAppointmentTarget.vendorName.length > 15 ? nextAppointmentTarget.vendorName.substring(0, 15) + '...' : nextAppointmentTarget.vendorName) : nextAppointmentTarget.vendorNbr}) →</span>
                      </button>
                    )}
                    {nextAppointmentTarget?.type === 'ALL_DONE' && (
                      <button
                        onClick={() => navigate(`/appointment/${appt.apptNbr}/summary`)}
                        className="bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <span>ชั่งครบแล้ว · ไปลงนาม →</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── ITEM COMPLETION SUMMARY MODAL (WITH BASKET BREAKDOWN & CN ALERT) ─── */}
        {itemCompletionModal && (() => {
          const { group: modalGroup, summary: modalSummary, cnCalc: modalCnCalc, measurements: modalMeasurements, nextAction } = itemCompletionModal;
          const modalItemNoun = getContainerNoun(modalGroup.uda6 || modalGroup.defaultBasketCode);
          const isCnRequired = modalSummary.result === 'FAIL' && modalSummary.differenceKg < 0 && Boolean(modalCnCalc);
          const isOverweight = modalSummary.result === 'FAIL' && modalSummary.differenceKg > 0;
          const isPass = modalSummary.result === 'PASS';

          return (
            <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
              <div className={`bg-[#FFFDF9] rounded-3xl border-2 p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
                isCnRequired ? 'border-[#E03131]' : isPass ? 'border-[#12803C]' : 'border-[#F2C230]'
              }`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-[#E8E1D8] pb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#6E6E6E] block">
                      สรุปผลการสุ่มชั่งเสร็จสิ้น ({modalMeasurements.length} {modalItemNoun})
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-[#1F1F1F] leading-tight mt-0.5">
                      {modalGroup.description}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#6E6E6E]">
                      <span>ITEM: <b className="text-[#1F1F1F]">{modalGroup.itemId}</b></span>
                      <span>•</span>
                      <span>PO: <b className="text-[#1F1F1F]">{modalGroup.poNbr}</b></span>
                      <span>•</span>
                      <span>รับจริง: <b className="text-[#12803C]">{modalGroup.confirmedActualQty || modalGroup.apptContQty || 0} {modalItemNoun}</b></span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItemCompletionModal(null)}
                    className="p-1.5 rounded-xl text-[#6E6E6E] hover:text-[#1F1F1F] hover:bg-[#F7F2EA] transition-all cursor-pointer font-bold"
                    title="ปิด"
                  >
                    ✕
                  </button>
                </div>

                {/* ─── PROMINENT RED BANNER IF CN REQUIRED ─── */}
                {isCnRequired && modalCnCalc && (() => {
                  const totalReceivedKg = Number((modalCnCalc.actualAverageNetKg * modalCnCalc.totalActualCases).toFixed(2));
                  const totalStandardKg = Number((modalCnCalc.standardWeightKg * modalCnCalc.totalActualCases).toFixed(2));

                  return (
                    <div className="p-4 bg-[#E03131] text-white rounded-2xl shadow-lg border-2 border-[#C92A2A] space-y-3 animate-bounce-short">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-6 h-6 text-white stroke-[2.5] shrink-0" />
                          <div>
                            <span className="text-base sm:text-lg font-black tracking-wide block leading-tight">
                              🚨 ต้องออกเอกสาร CN (น้ำหนักขาดหาย)
                            </span>
                            <span className="text-xs text-white/90">
                              น้ำหนักเฉลี่ยต่ำกว่าเกณฑ์มาตรฐาน ({formatPercent(modalSummary.differencePercent)})
                            </span>
                          </div>
                        </div>
                        <div className="bg-white text-[#E03131] font-black text-sm sm:text-base px-3 py-1.5 rounded-xl shadow-xs shrink-0 text-center">
                          <span className="block text-[9px] font-bold text-[#E03131]/80 leading-none">ยอด CN</span>
                          <span>{modalCnCalc.cnTotalKg} kg</span>
                        </div>
                      </div>

                      {/* 1. จุดเน้นพิเศษ: น้ำหนักเฉลี่ยที่ชั่งได้จริง */}
                      <div className="bg-white text-[#1F1F1F] p-3 rounded-2xl shadow-md border-2 border-[#FFE066] flex justify-between items-center">
                        <div>
                          <span className="text-xs font-black text-[#1F1F1F] flex items-center gap-1.5">
                            ⚖️ น้ำหนักเฉลี่ยที่ชั่งได้จริง:
                          </span>
                          <span className="text-[10px] text-[#6E6E6E] block mt-0.5">
                            (เกณฑ์มาตรฐาน SP: {modalCnCalc.standardWeightKg} kg · ขาดไป -{modalCnCalc.shortagePerCaseKg} kg/{modalItemNoun})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl sm:text-3xl font-black text-[#E03131] font-mono leading-none block">
                            {modalCnCalc.actualAverageNetKg}
                          </span>
                          <span className="text-[11px] font-bold text-[#6E6E6E]">kg / {modalItemNoun}</span>
                        </div>
                      </div>

                      {/* 2. สรุปการคูณจำนวนตะกร้า เพื่อหาน้ำหนักสุทธิที่ต้องรับเข้าจริง */}
                      <div className="bg-black/20 p-3 rounded-2xl text-xs space-y-2 backdrop-blur-xs border border-white/20">
                        <div className="text-[11px] text-white/90 font-medium">
                          สูตรคำนวณ: <b>น้ำหนักเฉลี่ยจริง ({modalCnCalc.actualAverageNetKg} kg)</b> × <b>จำนวนรับจริง ({modalCnCalc.totalActualCases} {modalItemNoun})</b>
                        </div>

                        <div className="bg-white/15 p-2.5 rounded-xl border border-white/25 flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-white block">
                              📦 สรุปน้ำหนักสุทธิที่ต้องรับเข้าจริง:
                            </span>
                            <span className="text-[10px] text-white/80 block">
                              (น้ำหนักสินค้าสุทธิที่บันทึกรับเข้าคลัง)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xl sm:text-2xl font-black text-[#FFE066] font-mono block leading-none">
                              {totalReceivedKg.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-bold text-white/90">kg</span>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-white/20 flex justify-between items-center text-xs">
                          <span className="text-white/80">เกณฑ์มาตรฐานรวมควรได้:</span>
                          <span className="font-mono text-white/90 font-bold">{totalStandardKg.toFixed(2)} kg</span>
                        </div>

                        <div className="flex justify-between items-center text-xs text-[#FFE3E3] font-bold">
                          <span>ส่วนต่างที่ต้องหัก CN รวม:</span>
                          <span className="font-mono font-black text-sm text-[#FFE3E3] underline decoration-2">
                            -{modalCnCalc.cnTotalKg} kg
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-white/90 leading-tight">
                        * ระบบได้เปิดเคส CN บันทึกยอด {modalCnCalc.cnTotalKg} kg และส่งเข้าระบบติดตาม CN อัตโนมัติเรียบร้อยแล้ว
                      </p>
                    </div>
                  );
                })()}

                {/* ─── GREEN BANNER IF PASS ─── */}
                {isPass && (() => {
                  const totalCases = modalGroup.confirmedActualQty || modalGroup.apptContQty || 0;
                  const totalReceivedKg = Number((modalSummary.averageNetKg * totalCases).toFixed(2));

                  return (
                    <div className="p-4 bg-[#EAF7ED] text-[#0B5E2B] rounded-2xl border-2 border-[#12803C] shadow-xs space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-6 h-6 text-[#12803C] shrink-0" />
                        <div>
                          <div className="font-black text-base">✓ ผ่านเกณฑ์มาตรฐาน (ชั่งครบ)</div>
                          <div className="text-xs text-[#12803C]/90 mt-0.5">
                            ผลต่าง: <b>{modalSummary.differenceKg > 0 ? '+' : ''}{modalSummary.differenceKg} kg</b> ({formatPercent(modalSummary.differencePercent)}) · น้ำหนักได้มาตรฐาน (ไม่ขาดเกณฑ์)
                          </div>
                        </div>
                      </div>

                      {/* เน้นน้ำหนักเฉลี่ยจริง และสรุปน้ำหนักที่ต้องรับเข้าจริง */}
                      <div className="bg-white p-3 rounded-xl border border-[#AEE0BD] space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-[#1F1F1F]">⚖️ น้ำหนักเฉลี่ยชั่งได้จริง:</span>
                          <span className="font-mono font-black text-lg text-[#12803C]">
                            {modalSummary.averageNetKg} kg/{modalItemNoun}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-[#E8E1D8] flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-[#0B5E2B] block">
                              📦 สรุปน้ำหนักสุทธิที่ต้องรับเข้าจริง:
                            </span>
                            <span className="text-[10px] text-[#6E6E6E]">
                              ({modalSummary.averageNetKg} kg × {totalCases} {modalItemNoun})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-black text-[#12803C] font-mono leading-none block">
                              {totalReceivedKg.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-bold text-[#6E6E6E]">kg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ─── AMBER BANNER IF OVERWEIGHT ─── */}
                {isOverweight && (() => {
                  const totalCases = modalGroup.confirmedActualQty || modalGroup.apptContQty || 0;
                  const totalReceivedKg = Number((modalSummary.averageNetKg * totalCases).toFixed(2));

                  return (
                    <div className="p-4 bg-[#FEF9E7] text-[#9A7D0A] rounded-2xl border-2 border-[#F2C230] shadow-xs space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-6 h-6 text-[#E67700] shrink-0" />
                        <div>
                          <div className="font-black text-base">⚠️ น้ำหนักเกินเกณฑ์ (+{formatPercent(modalSummary.differencePercent)})</div>
                          <div className="text-xs text-[#B7791F] mt-0.5">
                            ผลต่าง: +{modalSummary.differenceKg} kg · <b>แจ้งเตือนน้ำหนักเกิน (ไม่ต้องเปิดเคส CN)</b>
                          </div>
                        </div>
                      </div>

                      {/* เน้นน้ำหนักเฉลี่ยจริง และสรุปน้ำหนักที่ต้องรับเข้าจริง */}
                      <div className="bg-white p-3 rounded-xl border border-[#FAD7A0] space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-[#1F1F1F]">⚖️ น้ำหนักเฉลี่ยชั่งได้จริง:</span>
                          <span className="font-mono font-black text-lg text-[#D97706]">
                            {modalSummary.averageNetKg} kg/{modalItemNoun}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-[#E8E1D8] flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-[#9A7D0A] block">
                              📦 สรุปน้ำหนักสุทธิที่ต้องรับเข้าจริง:
                            </span>
                            <span className="text-[10px] text-[#6E6E6E]">
                              ({modalSummary.averageNetKg} kg × {totalCases} {modalItemNoun})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-black text-[#D97706] font-mono leading-none block">
                              {totalReceivedKg.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] font-bold text-[#6E6E6E]">kg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ─── DETAILS OF EACH BASKET WEIGHED (ตามจำนวนตะกร้า) ─── */}
                <div className="space-y-1.5 bg-[#F7F2EA] p-3 sm:p-3.5 rounded-2xl border border-[#E8E1D8]">
                  <div className="flex justify-between items-center text-xs font-bold text-[#1F1F1F]">
                    <span>รายละเอียดการสุ่มชั่ง ({modalMeasurements.length} {modalItemNoun}):</span>
                    <span className="text-[11px] text-[#6E6E6E]">
                      สุทธิรวม: <b className="text-[#12803C] font-black">{modalSummary.actualTotalKg} kg</b>
                    </span>
                  </div>

                  <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                    {modalMeasurements.map((m) => {
                      const std = itemCompletionModal.group.standardWeightKg ?? 0;
                      const isUnderweight = std > 0 && m.netWeightKg < (std - 0.005);
                      const shortage = isUnderweight ? Math.round((std - m.netWeightKg) * 100) / 100 : 0;

                      return (
                        <div 
                          key={m.id} 
                          className={`flex justify-between items-center text-xs p-2 sm:p-2.5 rounded-xl border shadow-2xs transition-all ${
                            isUnderweight
                              ? 'bg-[#FFF5F5] border-l-4 border-l-[#E03131] border-[#FFC9C9]'
                              : 'bg-white border-[#E8E1D8]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full font-black flex items-center justify-center text-[10px] ${
                              isUnderweight
                                ? 'bg-[#FDE8E8] text-[#E03131] border border-[#FFA8A8]'
                                : 'bg-[#EAF7ED] text-[#12803C]'
                            }`}>
                              {m.sampleNumber}
                            </span>
                            <div>
                              <span className="text-[#6E6E6E] text-[11px]">
                                รวม {m.grossWeightKg}kg − {m.basketCode === 'O' ? 'ภาชนะ' : 'ตะกร้า'} {m.basketCode} ({m.tareWeightKg}kg)
                              </span>
                              {isUnderweight && (
                                <span className="text-[10px] text-[#E03131] font-bold block">
                                  ⚠️ ขาด -{shortage.toFixed(2)} kg (เกณฑ์ {std} kg)
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`font-mono font-black text-xs sm:text-sm ${
                            isUnderweight ? 'text-[#E03131]' : 'text-[#1F1F1F]'
                          }`}>
                            สุทธิ {m.netWeightKg.toFixed(2)} kg
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ─── SUMMARY STATS GRID ─── */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[10.5px]">น้ำหนักรวมจริงที่ชั่ง:</span>
                    <span className="font-mono font-black text-[#1F1F1F] text-sm sm:text-base">{modalSummary.actualTotalKg} kg</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-[#E8E1D8]">
                    <span className="text-[#6E6E6E] block text-[10.5px]">น้ำหนักมาตรฐานรวม:</span>
                    <span className="font-mono font-black text-[#1F1F1F] text-sm sm:text-base">{modalSummary.expectedTotalKg} kg</span>
                  </div>
                </div>

                {/* ─── ACTION BUTTONS (จากนั้นค่อยกดไปรายการถัดไป) ─── */}
                <div className="space-y-2 pt-1 border-t border-[#E8E1D8]">
                  <button
                    type="button"
                    onClick={handleAdvanceFromCompletionModal}
                    className="w-full bg-[#12803C] hover:bg-[#0B5E2B] text-white font-black py-3 sm:py-3.5 px-4 rounded-2xl shadow-md text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
                  >
                    {nextAction.type === 'NEXT_SKU' && (
                      <>
                        <span>ไปรายการถัดไป ({nextAction.nextDescription ? (nextAction.nextDescription.length > 25 ? nextAction.nextDescription.substring(0, 25) + '...' : nextAction.nextDescription) : 'ITEM ถัดไป'})</span>
                        <ArrowRight className="w-4 h-4 stroke-[3]" />
                      </>
                    )}
                    {nextAction.type === 'NEXT_PO' && (
                      <>
                        <span>ไปยัง PO ถัดไป (PO {nextAction.nextPoNbr})</span>
                        <ArrowRight className="w-4 h-4 stroke-[3]" />
                      </>
                    )}
                    {nextAction.type === 'NEXT_VENDOR' && (
                      <>
                        <span>ไปชั่งผู้ขายถัดไป: {nextAction.nextVendorName || nextAction.nextVendorNbr} (PO {nextAction.nextPoNbr})</span>
                        <ArrowRight className="w-4 h-4 stroke-[3]" />
                      </>
                    )}
                    {nextAction.type === 'ALL_DONE' && (
                      <>
                        <span>✓ ชั่งครบทุกรายการแล้ว! ไปหน้าสรุปผล (Summary)</span>
                        <ArrowRight className="w-4 h-4 stroke-[3]" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setItemCompletionModal(null)}
                    className="w-full bg-white hover:bg-[#F7F2EA] text-[#6E6E6E] hover:text-[#1F1F1F] font-bold py-2 text-xs rounded-xl border border-[#E8E1D8] transition-all text-center cursor-pointer"
                  >
                    ปิดหน้าต่าง / ดูผลรายการนี้ต่อ
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* OVERWEIGHT VERIFICATION MODAL (> +20% threshold alert) */}
        {overweightWarning && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-[#FFFDF9] rounded-3xl border-2 border-[#E67700] p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF0E6] border border-[#FFD8BF] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-[#E67700]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#1F1F1F] leading-tight">
                    แจ้งเตือน: น้ำหนักเฉลี่ยเกินเกณฑ์ +{overweightWarning.percentDiff.toFixed(1)}%
                  </h3>
                  <p className="text-xs text-[#6E6E6E] mt-0.5">
                    ตรวจพบน้ำหนักเฉลี่ยสูงกว่าเกณฑ์มาตรฐานเกิน 20%
                  </p>
                </div>
              </div>

              {/* Comparison Stats */}
              <div className="bg-[#FEF9E7] p-3.5 rounded-2xl border border-[#FAD7A0] space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#7D6608] font-bold">เกณฑ์มาตรฐาน (SP):</span>
                  <span className="font-mono font-black text-[#1F1F1F] text-sm">
                    {overweightWarning.standardWeight.toFixed(2)} กก./{itemNoun}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#7D6608] font-bold">เพดาน +20% ปกติ:</span>
                  <span className="font-mono font-bold text-[#E67700] text-sm">
                    {(overweightWarning.standardWeight * 1.2).toFixed(2)} กก.
                  </span>
                </div>
                <div className="pt-2 border-t border-[#FAD7A0] flex justify-between items-center">
                  <span className="text-[#7D6608] font-bold">
                    น้ำหนักเฉลี่ยจริง ({overweightWarning.allNetWeights.length} {itemNoun}):
                  </span>
                  <span className="font-mono font-black text-[#C25E00] text-base">
                    {overweightWarning.avgNet.toFixed(3)} กก.
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-[#9A7D0A]">
                  <span>ส่วนต่างที่เกินมา:</span>
                  <span className="font-bold text-[#C25E00]">
                    +{(overweightWarning.avgNet - overweightWarning.standardWeight).toFixed(3)} กก. (+{overweightWarning.percentDiff.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Breakdown of each sample */}
              <div className="space-y-1.5 bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8] text-xs">
                <span className="font-bold text-[#1F1F1F] block text-[11px]">
                  รายละเอียดแต่ละ{itemNoun} ({overweightWarning.allNetWeights.length} {itemNoun}):
                </span>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {overweightWarning.allNetWeights.map((w, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] bg-white px-2.5 py-1 rounded-lg border border-[#E8E1D8]">
                      <span className="font-bold text-[#6E6E6E]">{itemNoun}ที่ {idx + 1}:</span>
                      <span className="font-mono font-black text-[#1F1F1F]">
                        สุทธิ {w.toFixed(3)} กก. {idx === overweightWarning.allNetWeights.length - 1 ? '(ตัวอย่างนี้)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guidance alert */}
              <div className="p-3 bg-[#FFF0E6] rounded-xl border border-[#FFD8BF] text-xs text-[#C25E00] leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#E67700]" />
                <span>
                  กรุณาตรวจทานสินค้าบนตาชั่ง หรือตรวจสอบตัวเลขที่กรอกอีกครั้งเพื่อป้องกันการพิมพ์ผิดพลาด หากสินค้าหนักเกินจริง ให้กดยืนยันเพื่อบันทึก
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setOverweightWarning(null)}
                  className="w-full bg-white hover:bg-[#F7F2EA] text-[#1F1F1F] font-bold py-3 px-3 rounded-2xl border-2 border-[#E8E1D8] text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98"
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
                  className="w-full bg-[#E67700] hover:bg-[#C25E00] text-white font-black py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  ยืนยันและบันทึก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Per-Item Overweight Abnormality Confirmation Modal (>= 30% of standard weight) ─── */}
        {itemOverweightWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#FFFDF9] rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border-2 border-[#E67700] space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF0E6] border border-[#FFD8BF] flex items-center justify-center shrink-0 shadow-inner">
                  <AlertTriangle className="w-6 h-6 text-[#E67700]" />
                </div>
                <div>
                  <span className="inline-block bg-[#FFF0E6] text-[#E67700] text-[10.5px] font-black px-2.5 py-0.5 rounded-full border border-[#FFD8BF] mb-0.5">
                    ตรวจพบน้ำหนักเกินเกณฑ์ {itemOverweightWarning.thresholdPercent}%
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-[#1F1F1F]">
                    ยืนยันค่าน้ำหนักเกินเกณฑ์มาตรฐาน
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-[#4A4A4A] leading-relaxed">
                {itemNoun}ที่ <b>{itemOverweightWarning.sampleNumber}</b> มีน้ำหนักสุทธิสูงกว่าเกณฑ์มาตรฐานที่ควรจะเป็นถึง{' '}
                <b className="text-[#E67700]">+{itemOverweightWarning.excessPercent.toFixed(1)}%</b> (เกินเกณฑ์เตือน 30% ของน้ำหนักที่ควรจะเป็น)
              </p>

              {/* Weight Comparison Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8]">
                <div className="bg-white p-2 rounded-xl shadow-2xs">
                  <span className="text-[10px] text-[#6E6E6E] block font-medium">เกณฑ์มาตรฐาน SP</span>
                  <b className="text-[#1F1F1F] text-xs sm:text-sm font-black">{itemOverweightWarning.standardWeight.toFixed(3)} kg</b>
                </div>
                <div className="bg-white p-2 rounded-xl shadow-2xs border border-[#FFD8BF]">
                  <span className="text-[10px] text-[#E67700] block font-medium">สุทธิที่ชั่งได้</span>
                  <b className="text-[#E67700] text-xs sm:text-sm font-black">{itemOverweightWarning.netKg.toFixed(3)} kg</b>
                  <span className="text-[9.5px] text-[#6E6E6E] block">({itemOverweightWarning.grossKg} - {itemOverweightWarning.tareKg})</span>
                </div>
                <div className="bg-[#FFF0E6] p-2 rounded-xl border border-[#FFD8BF]">
                  <span className="text-[10px] text-[#E67700] block font-bold">เกินเกณฑ์</span>
                  <b className="text-[#E67700] text-xs sm:text-sm font-black">+{itemOverweightWarning.excessKg.toFixed(3)} kg</b>
                  <span className="text-[9.5px] text-[#C25E00] block font-extrabold">(+{itemOverweightWarning.excessPercent.toFixed(1)}%)</span>
                </div>
              </div>

              {/* Guidance alert */}
              <div className="p-3 bg-[#FFF0E6] rounded-xl border border-[#FFD8BF] text-xs text-[#C25E00] leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#E67700]" />
                <span>
                  กรุณาตรวจทานสินค้าบนตาชั่ง หรือตรวจสอบตัวเลขที่กรอกอีกครั้งเพื่อป้องกันการพิมพ์ผิดพลาด หากสินค้าหนักเกินจริง ให้กดยืนยันเพื่อบันทึก
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setItemOverweightWarning(null)}
                  className="w-full bg-white hover:bg-[#F7F2EA] text-[#1F1F1F] font-bold py-3 px-3 rounded-2xl border-2 border-[#E8E1D8] text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98"
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
                  className="w-full bg-[#E67700] hover:bg-[#C25E00] text-white font-black py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  ยืนยันและบันทึก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Underweight Abnormality Confirmation Modal ─────────────── */}
        {underweightWarning && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border-2 border-[#E03131] space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] flex items-center justify-center shrink-0 shadow-inner">
                  <AlertTriangle className="w-6 h-6 text-[#E03131]" />
                </div>
                <div>
                  <span className="inline-block bg-[#FDE8E8] text-[#E03131] text-[10.5px] font-black px-2.5 py-0.5 rounded-full border border-[#F8B4B4] mb-0.5">
                    ตรวจพบน้ำหนักผิดปกติ (ต่ำกว่าเกณฑ์ {underweightWarning.thresholdPercent}%)
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-[#1F1F1F]">
                    ยืนยันค่าน้ำหนักต่ำกว่าเกณฑ์
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-[#4A4A4A] leading-relaxed">
                {underweightWarning.totalRequired === 1 ? (
                  <>
                    สินค้านี้<b>สุ่มชั่งเพียง 1 {itemNoun}</b> แต่น้ำหนักสุทธิที่ชั่งได้ต่ำกว่าเกณฑ์มาตรฐานถึง{' '}
                    <b className="text-[#E03131]">{underweightWarning.shortagePercent.toFixed(1)}%</b> (เกินเกณฑ์เตือน 10%)
                  </>
                ) : (
                  <>
                    {itemNoun}ที่ <b>{underweightWarning.sampleNumber}</b> มีน้ำหนักสุทธิต่ำกว่าเกณฑ์มาตรฐานถึง{' '}
                    <b className="text-[#E03131]">{underweightWarning.shortagePercent.toFixed(1)}%</b> (เกินเกณฑ์เตือน 20%)
                  </>
                )}
              </p>

              {/* Weight Comparison Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#F7F2EA] p-3 rounded-2xl border border-[#E8E1D8]">
                <div className="bg-white p-2 rounded-xl shadow-2xs">
                  <span className="text-[10px] text-[#6E6E6E] block font-medium">เกณฑ์มาตรฐาน SP</span>
                  <b className="text-[#1F1F1F] text-xs sm:text-sm font-black">{underweightWarning.standardWeight.toFixed(3)} kg</b>
                </div>
                <div className="bg-white p-2 rounded-xl shadow-2xs border border-[#F8B4B4]">
                  <span className="text-[10px] text-[#E03131] block font-medium">สุทธิที่ชั่งได้</span>
                  <b className="text-[#E03131] text-xs sm:text-sm font-black">{underweightWarning.netKg.toFixed(3)} kg</b>
                </div>
                <div className="bg-[#FDE8E8] p-2 rounded-xl border border-[#F8B4B4]">
                  <span className="text-[10px] text-[#E03131] block font-bold">ขาดหาย</span>
                  <b className="text-[#E03131] text-xs sm:text-sm font-black">-{underweightWarning.shortageKg.toFixed(3)} kg</b>
                  <span className="text-[9.5px] text-[#C92A2A] block font-extrabold">(-{underweightWarning.shortagePercent.toFixed(1)}%)</span>
                </div>
              </div>



              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setUnderweightWarning(null)}
                  className="w-full bg-white hover:bg-[#F7F2EA] text-[#1F1F1F] font-bold py-3 px-3 rounded-2xl border-2 border-[#E8E1D8] text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98"
                >
                  กลับไปแก้ไข / ชั่งใหม่
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (underweightWarning) {
                      const { grossKg, tareKg, netKg } = underweightWarning;
                      setUnderweightWarning(null);
                      executeSaveMeasurement(grossKg, tareKg, netKg);
                    }
                  }}
                  className="w-full bg-[#E03131] hover:bg-[#C92A2A] text-white font-black py-3 px-3 rounded-2xl shadow-md text-xs sm:text-sm transition-all text-center cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
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
