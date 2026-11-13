// ============================================================
// SMART DC — SKUListPage Component
// Hierarchy: Appointment -> Vendor -> PO -> SKU List
// Shows CATCH_WEIGHT items with AL quantity & sampling status
// ============================================================

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, ArrowRight, Scale, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { db } from '../lib/database';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';

export default function SKUListPage() {
  const { apptNbr, vendorNbr, poNbr } = useParams<{ apptNbr: string; vendorNbr: string; poNbr: string }>();
  const navigate = useNavigate();

  const skus = useLiveQuery(async () => {
    if (!apptNbr || !poNbr) return [];
    return await db.samplingGroups
      .where('apptNbr')
      .equals(apptNbr)
      .and(g => g.poNbr === poNbr)
      .toArray();
  }, [apptNbr, poNbr]) || [];

  return (
    <Layout 
      title={`PO ${poNbr} — รายการ ITEM`} 
      showBack 
      backTo={`/appointment/${apptNbr}/vendor/${vendorNbr}/pos`}
    >
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24 w-full overflow-x-hidden">
        {/* Header context */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-1">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Appt {apptNbr}</span>
            <span>Vendor {vendorNbr}</span>
          </div>
          <h3 className="font-bold text-gray-900 text-base">
            ใบสั่งซื้อ PO: <span className="font-mono text-blue-700">{poNbr}</span>
          </h3>
          <p className="text-xs text-gray-500">
            พบสินค้า CATCH_WEIGHT ทั้งหมด {skus.length} รายการ
          </p>
        </div>

        {/* Section title */}
        <div className="flex justify-between items-center pt-1">
          <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            เลือกสินค้าเพื่อยืนยันจำนวนและสุ่มชั่ง
          </h4>
        </div>

        {/* ITEM Cards */}
        <div className="space-y-3">
          {skus.map((sku) => {
            const hasQty = sku.confirmedActualQty !== null;
            const alQty = sku.importedRcvdContQty ?? 0;
            const akQty = sku.apptContQty ?? 0;

            return (
              <div
                key={sku.id}
                onClick={() => navigate(`/sampling-group/${sku.id}`)}
                className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-98 transition-transform cursor-pointer hover:border-blue-300 space-y-2.5"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      ITEM: {sku.itemId}
                    </span>
                    <h4 className="font-bold text-gray-900 text-sm mt-1 leading-snug break-words">
                      {sku.description}
                    </h4>
                  </div>
                  <StatusBadge status={sku.samplingStatus} size="sm" />
                </div>

                {/* Weights & Standard Spec */}
                <div className="flex items-center gap-2 text-xs">
                  {sku.spExpression ? (
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md font-semibold">
                      เกณฑ์: {sku.spExpression} ({sku.standardWeightKg} kg/กล่อง)
                    </span>
                  ) : (
                    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                      ⚠️ ยังไม่มีเกณฑ์ นน.
                    </span>
                  )}
                </div>

                {/* Quantities Grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                  <div className="bg-blue-50/70 p-2 rounded-xl border border-blue-200">
                    <span className="text-blue-700 block text-[11px] font-bold">จำนวนตามแผน:</span>
                    <span className="font-black text-blue-900 text-sm">{akQty} ตะกร้า</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-xl border border-gray-200">
                    <span className="text-gray-500 block text-[11px] font-bold">จำนวนรับจริง:</span>
                    <span className="font-bold text-gray-700 text-sm">{hasQty ? sku.confirmedActualQty : alQty} ตะกร้า</span>
                  </div>
                </div>

                {/* Bottom Action Status */}
                <div className="pt-2 flex justify-between items-center text-xs text-gray-500">
                  <span>
                    {hasQty ? (
                      <span className="text-emerald-700 font-medium">
                        ยืนยันรับจริงแล้ว: <b>{sku.confirmedActualQty}</b> (ต้องชั่ง {sku.requiredSamples} สุ่ม)
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium">
                        รอยืนยันจำนวนรับจริงที่หน้างาน
                      </span>
                    )}
                  </span>
                  <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                    เข้าตรวจชั่ง <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
