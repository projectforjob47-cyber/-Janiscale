// ============================================================
// SMART DC — ProgressBar Component
// Sampling progress bar with completion stats
// ============================================================

import React from 'react';

interface Props {
  required: number;
  completed: number;
  label?: string;
  showNumbers?: boolean;
}

export default function ProgressBar({ required, completed, label, showNumbers = true }: Props) {
  const pct = required > 0 ? Math.min(Math.round((completed / required) * 100), 100) : 0;
  const isComplete = completed >= required && required > 0;
  const isZero     = completed === 0;

  // Color scheme
  const barColor = isComplete ? 'bg-green-500' : isZero ? 'bg-red-400' : 'bg-amber-400';
  const textColor = isComplete ? 'text-green-700' : isZero ? 'text-red-600'  : 'text-amber-700';
  const bgTrack   = isComplete ? 'bg-green-100'  : isZero ? 'bg-red-100'    : 'bg-amber-100';

  return (
    <div className="w-full">
      {/* Label row */}
      {(label || showNumbers) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-xs text-slate-500 font-medium">{label}</span>
          )}
          {showNumbers && (
            <span className={`text-xs font-bold ml-auto ${textColor}`}>
              {completed}/{required} ตัวอย่าง
              <span className="ml-1.5 font-medium opacity-75">({pct}%)</span>
            </span>
          )}
        </div>
      )}

      {/* Track */}
      <div className={`w-full h-2 rounded-full overflow-hidden ${bgTrack}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status text */}
      {isComplete && (
        <p className="text-xs text-green-600 font-semibold mt-0.5">✓ ชั่งครบแล้ว</p>
      )}
    </div>
  );
}
