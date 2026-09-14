import React from 'react';

/* ── Primitive ── */
export const Sk: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

/* ─────────────────────────────────────────────────────────────────
   Admin Dashboard skeleton  –  mirrors the users table layout
───────────────────────────────────────────────────────────────── */
export const AdminTableSkeleton: React.FC = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60">
    {/* thead */}
    <div className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-5 py-3.5 grid grid-cols-6 gap-4">
      {['w-16', 'w-12', 'w-24', 'w-20', 'w-28', 'w-16'].map((w, i) => (
        <Sk key={i} className={`h-3 ${w}`} />
      ))}
    </div>
    {/* rows */}
    {Array.from({ length: 7 }).map((_, i) => (
      <div
        key={i}
        className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 grid grid-cols-6 gap-4 items-center bg-white dark:bg-slate-900/30"
      >
        {/* User col */}
        <div className="space-y-1.5">
          <Sk className="h-3.5 w-32" />
          <Sk className="h-2.5 w-40" />
        </div>
        {/* Role badge */}
        <Sk className="h-5 w-16 rounded-full" />
        {/* Status badge */}
        <Sk className="h-5 w-16 rounded-full mx-auto" />
        {/* Date */}
        <Sk className="h-3 w-20" />
        {/* Ban reason */}
        <Sk className="h-3 w-24" />
        {/* Actions */}
        <div className="flex justify-end">
          <Sk className="h-6 w-20 rounded" />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────────
   Filter bar skeleton
───────────────────────────────────────────────────────────────── */
export const FilterBarSkeleton: React.FC = () => (
  <div className="grid grid-cols-12 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-100/70 dark:bg-slate-800/50">
    <Sk className="col-span-6 h-9 rounded-lg" />
    <Sk className="col-span-3 h-9 rounded-lg" />
    <Sk className="col-span-2 h-9 rounded-lg" />
    <Sk className="col-span-1 h-9 rounded-lg" />
  </div>
);
