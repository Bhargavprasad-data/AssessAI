import React from 'react';

/* ── Primitive ── */
export const Sk: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

/* ─────────────────────────────────────────────────────────────────
   Admin Dashboard skeleton  –  mirrors the users table layout
───────────────────────────────────────────────────────────────── */
export const AdminTableSkeleton: React.FC = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60 shadow-sm">
    {/* thead */}
    <div className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-5 py-3.5 grid grid-cols-6 gap-4">
      {['w-20', 'w-14', 'w-24', 'w-20', 'w-28', 'w-16'].map((w, i) => (
        <Sk key={i} className={`h-3.5 ${w}`} />
      ))}
    </div>
    {/* rows */}
    {Array.from({ length: 7 }).map((_, i) => (
      <div
        key={i}
        className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 grid grid-cols-6 gap-4 items-center bg-white dark:bg-slate-900/30"
      >
        {/* User col */}
        <div className="space-y-2">
          <Sk className="h-3.5 w-36" />
          <Sk className="h-2.5 w-44" />
        </div>
        {/* Role badge */}
        <Sk className="h-5 w-16 rounded-full" />
        {/* Status badge */}
        <Sk className="h-5 w-20 rounded-full mx-auto" />
        {/* Date */}
        <Sk className="h-3 w-20" />
        {/* Ban reason */}
        <Sk className="h-3 w-24" />
        {/* Actions */}
        <div className="flex justify-end gap-1.5">
          <Sk className="h-6 w-14 rounded" />
          <Sk className="h-6 w-14 rounded" />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────────
   Filter bar skeleton
───────────────────────────────────────────────────────────────── */
export const FilterBarSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-100/70 dark:bg-slate-800/50">
    <Sk className="sm:col-span-6 h-9 rounded-lg" />
    <Sk className="sm:col-span-3 h-9 rounded-lg" />
    <Sk className="sm:col-span-3 h-9 rounded-lg" />
  </div>
);

/* ─────────────────────────────────────────────────────────────────
   Audit Logs Skeleton – mirrors forensic audit ledger table
───────────────────────────────────────────────────────────────── */
export const AuditLogsSkeleton: React.FC = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60 shadow-sm">
    {/* thead */}
    <div className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-5 py-3.5 grid grid-cols-7 gap-4">
      {['w-20', 'w-24', 'w-16', 'w-16', 'w-16', 'w-16', 'w-12'].map((w, i) => (
        <Sk key={i} className={`h-3.5 ${w}`} />
      ))}
    </div>
    {/* rows */}
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-0 grid grid-cols-7 gap-4 items-center bg-white dark:bg-slate-900/30"
      >
        <Sk className="h-3.5 w-28" />
        <Sk className="h-5 w-32 rounded" />
        <Sk className="h-5 w-16 rounded-full" />
        <Sk className="h-3.5 w-20 font-mono" />
        <Sk className="h-3.5 w-20 font-mono" />
        <div className="flex justify-end">
          <Sk className="h-5 w-20 rounded" />
        </div>
        <div className="flex justify-end">
          <Sk className="h-6 w-8 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);
