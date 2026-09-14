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
        className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between bg-white dark:bg-slate-900/40"
      >
        {/* Title + status badge */}
        <div className="flex items-start justify-between mb-3">
          <Sk className="h-5 w-3/5" />
          <Sk className="h-5 w-20 rounded-full" />
        </div>

        {/* Meta rows */}
        <div className="space-y-2.5 mb-6">
          <div className="flex items-center gap-2">
            <Sk className="h-4 w-4 rounded flex-shrink-0" />
            <Sk className="h-3 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Sk className="h-4 w-4 rounded flex-shrink-0" />
            <Sk className="h-3 w-44" />
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
      <Sk className="h-8 w-52" />
      <Sk className="h-4 w-72" />
    </div>
    <Sk className="h-10 w-40 rounded-xl" />
  </div>
);
