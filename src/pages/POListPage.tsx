// ============================================================
// SMART DC — POListPage Component
// Hierarchy: Appointment -> Vendor -> PO List
// ============================================================

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Package, ArrowRight, Layers } from 'lucide-react';
import { db } from '../lib/database';
import Layout from '../components/Layout';

export default function POListPage() {
  const { apptNbr, vendorNbr } = useParams<{ apptNbr: string; vendorNbr: string }>();
  const navigate = useNavigate();

  const vendor = useLiveQuery(async () => {
    if (!apptNbr || !vendorNbr) return null;
    return await db.appointmentVendors
      .where('apptNbr')
      .equals(apptNbr)
      .and(v => v.vendorNbr === vendorNbr)
      .first();
  }, [apptNbr, vendorNbr]);

  const pos = useLiveQuery(async () => {
    if (!apptNbr || !vendorNbr) return [];
    return await db.purchaseOrders
      .where('apptNbr')
      .equals(apptNbr)
      .and(p => p.vendorNbr === vendorNbr)
      .toArray();
  }, [apptNbr, vendorNbr]) || [];

  return (
    <Layout 
      title={`PO ของผู้ขาย ${vendorNbr}`} 
      showBack 
      backTo={`/appointment/${apptNbr}`}
    >
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24 w-full overflow-x-hidden">
        {/* Vendor info header */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-1">
          <span className="text-xs text-gray-400 font-mono">ผู้ขาย (Vendor) {vendorNbr}</span>
          <h3 className="font-bold text-gray-900 text-base break-words">
            {vendor?.vendorName || 'กำลังโหลด...'}
          </h3>
          <p className="text-xs text-blue-600 font-medium">
            มี {pos.length} ใบสั่งซื้อ (Purchase Order) ในใบนัดหมาย {apptNbr}
          </p>
        </div>

        {/* Section title */}
        <div className="flex justify-between items-center pt-1">
          <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <Package className="w-4 h-4 text-blue-600" />
            เลือกใบสั่งซื้อ (PO)
          </h4>
          <span className="text-xs text-gray-500">แตะเพื่อดูรายการ ITEM</span>
        </div>

        {/* PO Cards */}
        <div className="space-y-3">
          {pos.map((po) => (
            <div
              key={po.id}
              onClick={() => navigate(`/appointment/${apptNbr}/vendor/${vendorNbr}/po/${po.poNbr}/skus`)}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-98 transition-transform cursor-pointer hover:border-blue-300"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-gray-900 text-base font-mono">
                      PO: {po.poNbr}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Layers className="w-3.5 h-3.5 text-gray-400" />
                    <span>สินค้า CATCH_WEIGHT: <b>{po.itemCount} ITEM</b></span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
