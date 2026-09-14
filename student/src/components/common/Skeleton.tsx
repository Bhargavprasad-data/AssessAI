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
        className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between bg-white dark:bg-slate-900/40"
      >
        {/* Title row */}
        <div className="flex items-start justify-between mb-4">
          <Sk className="h-5 w-2/3" />
          <Sk className="h-5 w-16 rounded-full" />
        </div>

        {/* Meta rows */}
        <div className="space-y-2.5 mb-6">
          <div className="flex items-center gap-2">
            <Sk className="h-4 w-4 rounded flex-shrink-0" />
            <Sk className="h-3 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Sk className="h-4 w-4 rounded flex-shrink-0" />
            <Sk className="h-3 w-28" />
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
    <Sk className="h-8 w-56" />
    <Sk className="h-4 w-80" />
  </div>
);
