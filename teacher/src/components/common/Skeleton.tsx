import React from 'react';

/* ── Primitive ── */
export const Sk: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

/* ── Teacher Dashboard skeleton — card grid + header action ── */
export const AssessmentCardSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between bg-white dark:bg-slate-900/40 shadow-sm"
      >
        {/* Title + status badge */}
        <div>
          <div className="flex items-start justify-between mb-4">
            <Sk className="h-5 w-3/5 rounded-md" />
            <Sk className="h-5 w-20 rounded-full" />
          </div>

          {/* Meta rows */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <Sk className="h-4 w-4 rounded flex-shrink-0" />
              <Sk className="h-3.5 w-32 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Sk className="h-4 w-4 rounded flex-shrink-0" />
              <Sk className="h-3.5 w-44 rounded" />
            </div>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-white/10">
          <Sk className="flex-1 h-9 rounded-xl" />
          <Sk className="w-24 h-9 rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

/* ── Page header + button skeleton ── */
export const DashboardHeaderSkeleton: React.FC = () => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
    <div className="space-y-2">
      <Sk className="h-8 w-56 rounded-lg" />
      <Sk className="h-4 w-72 rounded-md" />
    </div>
    <Sk className="h-10 w-44 rounded-xl" />
  </div>
);

/* ── Analytics KPI Skeletons ── */
export const AnalyticsOverviewSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className={`p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 ${
          i === 4 ? 'col-span-2 lg:col-span-1' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <Sk className="h-3 w-24 rounded" />
          <Sk className="h-4 w-4 rounded" />
        </div>
        <Sk className="h-7 w-16 rounded-md mb-2" />
        <Sk className="h-3 w-28 rounded" />
      </div>
    ))}
  </div>
);

/* ── Analytics Attempts Table Skeleton ── */
export const AttemptsTableSkeleton: React.FC = () => (
  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/60">
    <div className="bg-slate-100 dark:bg-dark-bg/60 px-4 py-3 grid grid-cols-8 gap-4 border-b border-slate-200 dark:border-dark-border">
      {['w-20', 'w-24', 'w-16', 'w-14', 'w-12', 'w-14', 'w-14', 'w-20'].map((w, i) => (
        <Sk key={i} className={`h-3.5 ${w} rounded`} />
      ))}
    </div>
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="px-4 py-3.5 border-b border-slate-200 dark:border-dark-border/40 last:border-0 grid grid-cols-8 gap-4 items-center"
      >
        <Sk className="h-3.5 w-24 rounded" />
        <Sk className="h-3 w-32 rounded font-mono" />
        <Sk className="h-5 w-16 rounded-full mx-auto" />
        <Sk className="h-3 w-16 rounded mx-auto" />
        <Sk className="h-4 w-12 rounded ml-auto font-mono" />
        <Sk className="h-3 w-8 rounded mx-auto" />
        <Sk className="h-5 w-14 rounded-full mx-auto" />
        <div className="flex justify-end">
          <Sk className="h-6 w-24 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);
