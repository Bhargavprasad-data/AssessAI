import React from 'react';

/* ── Primitive ── */
export const Sk: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

/* ── Student Dashboard skeleton — card grid layout ── */
export const AssessmentCardSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between bg-white dark:bg-slate-900/40 shadow-sm"
      >
        {/* Title row */}
        <div>
          <div className="flex items-start justify-between mb-4">
            <Sk className="h-5 w-2/3 rounded-md" />
            <Sk className="h-5 w-16 rounded-full" />
          </div>

          {/* Meta rows */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <Sk className="h-4 w-4 rounded flex-shrink-0" />
              <Sk className="h-3.5 w-36 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Sk className="h-4 w-4 rounded flex-shrink-0" />
              <Sk className="h-3.5 w-28 rounded" />
            </div>
          </div>
        </div>

        {/* Button */}
        <Sk className="h-10 w-full rounded-xl" />
      </div>
    ))}
  </div>
);

/* ── Page header skeleton ── */
export const PageHeaderSkeleton: React.FC = () => (
  <div className="mb-8 space-y-2">
    <Sk className="h-8 w-60 rounded-lg" />
    <Sk className="h-4 w-96 rounded-md" />
  </div>
);

/* ── My Results KPI & List Skeletons ── */
export const ResultsSummarySkeleton: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
    {Array.from({ length: 3 }).map((_, i) => (
      <div
        key={i}
        className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between"
      >
        <div className="space-y-2">
          <Sk className="h-3 w-28 rounded" />
          <Sk className="h-7 w-20 rounded-md" />
        </div>
        <Sk className="w-12 h-12 rounded-xl" />
      </div>
    ))}
  </div>
);

export const ResultsListSkeleton: React.FC = () => (
  <div className="space-y-4">
    <Sk className="h-4 w-40 rounded" />
    <div className="grid grid-cols-1 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-2.5 flex-1">
            <div className="flex items-center gap-2">
              <Sk className="h-5 w-48 rounded" />
              <Sk className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex items-center gap-4">
              <Sk className="h-3.5 w-32 rounded" />
              <Sk className="h-3.5 w-40 rounded" />
              <Sk className="h-3.5 w-24 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-4 self-end sm:self-center">
            <div className="space-y-1 text-right">
              <Sk className="h-3 w-10 ml-auto rounded" />
              <Sk className="h-6 w-16 rounded" />
            </div>
            <Sk className="h-9 w-28 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
