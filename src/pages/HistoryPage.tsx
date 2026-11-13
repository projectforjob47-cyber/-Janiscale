import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Layout from '../components/Layout';
import { History, Download } from 'lucide-react';
import { db } from '../lib/database';

export default function HistoryPage() {
  const samplingGroups = useLiveQuery(async () => {
    return await db.samplingGroups.toArray();
  }, []) || [];

  return (
    <Layout title="ประวัติการสุ่มตรวจ" showBack backTo="/dashboard">
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              ประวัติรายการสุ่มชั่งทั้งหมด
            </h3>
          </div>
          <p className="text-xs text-gray-500">
            รวมรายการสุ่มชั่ง CATCH_WEIGHT ทั้งหมดในระบบ ({samplingGroups.length} รายการ)
          </p>
        </div>

        <div className="space-y-3">
          {samplingGroups.slice(0, 15).map((g) => (
            <div key={g.id} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-gray-700">ITEM: {g.itemId}</span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  g.samplingStatus === 'ชั่งครบ' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {g.samplingStatus}
                </span>
              </div>
              <p className="font-semibold text-gray-900">{g.description}</p>
              <p className="text-gray-400">Appt {g.apptNbr} | PO {g.poNbr} | รับจริง: {g.confirmedActualQty ?? '-'}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
