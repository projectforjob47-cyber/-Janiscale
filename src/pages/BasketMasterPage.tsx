// ============================================================
// SMART DC — BasketMasterPage Component
// Manage Basket / Tray Tare Weights (Add, Edit, Activate/Deactivate)
// Changes do NOT retroactively modify completed measurement records
// ============================================================

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Layout from '../components/Layout';
import { ShoppingBasket, Plus, Edit2, Check, X, AlertTriangle, Sparkles } from 'lucide-react';
import { db, deduplicateBasketMaster } from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import type { BasketMasterItem } from '../types';

export default function BasketMasterPage() {
  const { currentUser } = useAuthStore();
  const baskets = useLiveQuery(async () => {
    return await db.basketMaster.toArray();
  }, []) || [];

  // Auto deduplicate on mount and when duplicates are detected
  useEffect(() => {
    deduplicateBasketMaster();
  }, []);

  // Guarantee memory-level deduplication so duplicate cards never show
  const uniqueBaskets = Array.from(
    baskets.reduce((map, b) => {
      const code = (b.code || '').trim().toUpperCase();
      if (!code) return map;
      if (!map.has(code) || (!map.get(code)!.isActive && b.isActive)) {
        map.set(code, b);
      }
      return map;
    }, new Map<string, BasketMasterItem>()).values()
  );

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New Basket form
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newTare, setNewTare] = useState('');

  // Edit form
  const [editTare, setEditTare] = useState('');
  const [editName, setEditName] = useState('');

  const handleAddBasket = async (e: React.FormEvent) => {
    e.preventDefault();
    const tare = parseFloat(newTare);
    if (!newCode.trim()) {
      alert('กรุณาระบุรหัสตะกร้า/ภาชนะ (เช่น W, X, Carton)');
      return;
    }
    if (isNaN(tare) || tare < 0) {
      alert('กรุณาระบุน้ำหนักภาชนะ (Tare Weight) ที่ถูกต้อง');
      return;
    }

    const upperCode = newCode.trim().toUpperCase();
    const existing = uniqueBaskets.find(b => b.code.toUpperCase() === upperCode);
    if (existing) {
      alert(`รหัสภาชนะ ${upperCode} มีอยู่ในระบบแล้ว`);
      return;
    }

    const now = new Date().toISOString();
    const newBasket: BasketMasterItem = {
      id: `basket-${upperCode}`,
      code: upperCode,
      name: newName.trim() || `Tray ${upperCode}`,
      tareWeightKg: tare,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.fullName || 'User',
    };

    await db.basketMaster.put(newBasket);
    await deduplicateBasketMaster();
    setNewCode('');
    setNewName('');
    setNewTare('');
    setIsAdding(false);
  };

  const startEdit = (b: BasketMasterItem) => {
    setEditingId(b.id);
    setEditName(b.name);
    setEditTare(String(b.tareWeightKg));
  };

  const handleSaveEdit = async (id: string) => {
    const tare = parseFloat(editTare);
    if (isNaN(tare) || tare < 0) {
      alert('กรุณาระบุน้ำหนักที่ถูกต้อง');
      return;
    }

    const now = new Date().toISOString();
    await db.basketMaster.update(id, {
      name: editName.trim(),
      tareWeightKg: tare,
      updatedAt: now,
      updatedBy: currentUser?.fullName || 'User',
    });

    await deduplicateBasketMaster();
    setEditingId(null);
  };

  const handleToggleActive = async (b: BasketMasterItem) => {
    await db.basketMaster.update(b.id, {
      isActive: !b.isActive,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.fullName || 'User',
    });
    await deduplicateBasketMaster();
  };

  return (
    <Layout title="Basket Master" showBack backTo="/dashboard">
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-28">
        
        {/* Header Notice */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <ShoppingBasket className="w-5 h-5 text-blue-700" />
              กำหนดค่าน้ำหนักภาชนะ (Tare Weight)
            </h3>
            <div className="flex items-center gap-1.5">
              {baskets.length > uniqueBaskets.length && (
                <button
                  type="button"
                  onClick={async () => {
                    await deduplicateBasketMaster();
                  }}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                  title="ล้างขนาดตะกร้าที่ซ้ำกัน"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  ลบรายการซ้ำ
                </button>
              )}
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="bg-blue-700 text-white p-2 rounded-xl flex items-center gap-1 text-xs font-bold active:scale-95"
              >
                <Plus className="w-4 h-4" />
                เพิ่มตะกร้า
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            สามารถปรับแก้น้ำหนักภาชนะให้ตรงกับสภาพจริงหน้างานได้ โดยการแก้ไขจะไม่มีผลย้อนหลังกับตัวอย่างที่เคยบันทึกชั่งเสร็จสิ้นไปแล้ว (ระบบจัดเก็บแบบ 1 ขนาดต่อ 1 ประเภทภาชนะ)
          </p>
        </div>

        {/* Add Form */}
        {isAdding && (
          <form onSubmit={handleAddBasket} className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs font-bold text-blue-900">
              <span>เพิ่มชนิดตะกร้า/กล่องใหม่</span>
              <button type="button" onClick={() => setIsAdding(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">รหัสตะกร้า (Code):</label>
                <input
                  type="text"
                  placeholder="เช่น W, กล่อง, ZN"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">น้ำหนักหัก (kg):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="เช่น 0.85"
                  value={newTare}
                  onKeyDown={(e) => {
                    if (['-', '+', 'e', 'E'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val.includes('-')) val = val.replace(/-/g, '');
                    setNewTare(val);
                  }}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">ชื่อเรียก / คำอธิบาย:</label>
              <input
                type="text"
                placeholder="เช่น ตะกร้าเขียว W, กล่องโฟม 10kg"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm"
            >
              <Check className="w-4 h-4" /> บันทึกภาชนะใหม่
            </button>
          </form>
        )}

        {/* Basket List */}
        <div className="space-y-2">
          {uniqueBaskets.map((b) => {
            const isEditing = editingId === b.id;

            return (
              <div
                key={b.id}
                className={`bg-white p-3.5 rounded-2xl border transition-all ${
                  b.isActive ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60 bg-slate-50'
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-blue-700 text-sm">แก้ไข Tray {b.code}</span>
                      <button onClick={() => setEditingId(null)} className="text-slate-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">ชื่อ:</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">น้ำหนักหัก (kg):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editTare}
                          onKeyDown={(e) => {
                            if (['-', '+', 'e', 'E'].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val.includes('-')) val = val.replace(/-/g, '');
                            setEditTare(val);
                          }}
                          className="w-full p-2 border border-blue-400 rounded-lg text-xs font-bold"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveEdit(b.id)}
                      className="w-full bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1"
                    >
                      <Check className="w-4 h-4" /> บันทึกการแก้ไข
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-blue-700 font-mono text-base">
                        {b.code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{b.name}</span>
                          {!b.isActive && (
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                              ปิดใช้งาน
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          น้ำหนักหัก (Tare): <b className="text-slate-700 font-bold">{b.tareWeightKg.toFixed(2)} kg</b>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(b)}
                        className="p-2 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="แก้ไขน้ำหนัก"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(b)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${
                          b.isActive
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {b.isActive ? 'ปิด' : 'เปิด'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </Layout>
  );
}
