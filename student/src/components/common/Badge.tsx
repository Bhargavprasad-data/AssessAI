import React from 'react';

interface DifficultyBadgeProps {
  difficulty: 'easy' | 'medium' | 'hard' | string;
  size?: 'sm' | 'md' | 'lg';
}

export const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({ difficulty, size = 'md' }) => {
  const diff = difficulty.toLowerCase();
  
  const sizeClasses = {
    sm: 'text-[11px] px-2.5 py-0.5 font-semibold',
    md: 'text-xs px-3 py-1 font-bold',
    lg: 'text-sm px-4 py-1.5 font-extrabold',
  }[size];

  if (diff === 'easy') {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 shadow-sm ${sizeClasses}`}>
        <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 mr-1.5 animate-pulse"></span>
        Easy (1 pt)
      </span>
    );
  }

  if (diff === 'medium') {
    return (
      <span className={`inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-sm ${sizeClasses}`}>
        <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400 mr-1.5 animate-pulse"></span>
        Medium (2 pts)
      </span>
    );
  }

  if (diff === 'hard') {
    return (
      <span className={`inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 shadow-sm ${sizeClasses}`}>
        <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 mr-1.5 animate-pulse"></span>
        Hard (3 pts)
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold ${sizeClasses}`}>
      {difficulty}
    </span>
  );
};

// ── Prominent in-exam difficulty level indicator card ──────────────────────
interface DifficultyCardProps {
  difficulty: 'easy' | 'medium' | 'hard' | string;
}

export const DifficultyCard: React.FC<DifficultyCardProps> = ({ difficulty }) => {
  const diff = difficulty.toLowerCase();

  const config = {
    easy: {
      label: 'EASY',
      points: '1 pt',
      description: 'Fundamental concept',
      bars: 1,
      totalBars: 3,
      containerBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/30',
      labelColor: 'text-emerald-900 dark:text-emerald-300',
      pillBg: 'bg-emerald-200/80 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200',
      descColor: 'text-emerald-800/85 dark:text-emerald-400/90',
      activeBar: 'bg-emerald-600 dark:bg-emerald-400',
      inactiveBar: 'bg-emerald-200 dark:bg-emerald-900/60',
      dotColor: 'bg-emerald-500 dark:bg-emerald-400',
      glow: 'shadow-sm shadow-emerald-500/10',
    },
    medium: {
      label: 'MEDIUM',
      points: '2 pts',
      description: 'Applied knowledge',
      bars: 2,
      totalBars: 3,
      containerBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/30',
      labelColor: 'text-amber-950 dark:text-amber-300',
      pillBg: 'bg-amber-200/80 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200',
      descColor: 'text-amber-900/85 dark:text-amber-400/90',
      activeBar: 'bg-amber-500 dark:bg-amber-400',
      inactiveBar: 'bg-amber-200 dark:bg-amber-900/60',
      dotColor: 'bg-amber-500 dark:bg-amber-400',
      glow: 'shadow-sm shadow-amber-500/10',
    },
    hard: {
      label: 'HARD',
      points: '3 pts',
      description: 'Advanced reasoning',
      bars: 3,
      totalBars: 3,
      containerBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/30',
      labelColor: 'text-rose-950 dark:text-rose-300',
      pillBg: 'bg-rose-200/80 dark:bg-rose-500/20 text-rose-950 dark:text-rose-200',
      descColor: 'text-rose-900/85 dark:text-rose-400/90',
      activeBar: 'bg-rose-600 dark:bg-rose-400',
      inactiveBar: 'bg-rose-200 dark:bg-rose-900/60',
      dotColor: 'bg-rose-500 dark:bg-rose-400',
      glow: 'shadow-sm shadow-rose-500/10',
    },
  }[diff] ?? {
    label: difficulty.toUpperCase(),
    points: '',
    description: 'Question item',
    bars: 1,
    totalBars: 3,
    containerBg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-300 dark:border-slate-700/60',
    labelColor: 'text-slate-900 dark:text-slate-200',
    pillBg: 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
    descColor: 'text-slate-600 dark:text-slate-400',
    activeBar: 'bg-slate-500',
    inactiveBar: 'bg-slate-200 dark:bg-slate-800',
    dotColor: 'bg-slate-500',
    glow: '',
  };

  return (
    <div
      className={`inline-flex items-center gap-3 px-3.5 py-2 rounded-2xl border ${config.containerBg} ${config.glow} transition-all duration-300`}
    >
      {/* Indicator Pulse Dot */}
      <span className="relative flex items-center justify-center flex-shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
        <span className={`absolute w-4 h-4 rounded-full ${config.dotColor} opacity-30 animate-ping`} />
      </span>

      {/* Level Label & Points */}
      <div className="flex flex-col select-none">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black tracking-wider ${config.labelColor}`}>
            {config.label}
          </span>
          {config.points && (
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${config.pillBg}`}>
              {config.points}
            </span>
          )}
        </div>
        {config.description && (
          <span className={`text-[10px] font-semibold ${config.descColor} tracking-tight`}>
            {config.description}
          </span>
        )}
      </div>

      {/* Difficulty Level Signal Bars */}
      <div className="flex items-end gap-1 ml-1 self-center">
        {Array.from({ length: config.totalBars }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i < config.bars ? config.activeBar : config.inactiveBar
            }`}
            style={{
              width: '4.5px',
              height: `${8 + i * 4.5}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  
  if (s === 'published' || s === 'in_progress') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  }

  if (s === 'terminated' || s === 'failed') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>
        {status.toUpperCase()}
      </span>
    );
  }

  if (s === 'submitted' || s === 'completed') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-500/10 text-brand-800 dark:text-brand-300 border border-brand-300 dark:border-brand-500/30">
        {status.toUpperCase()}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
      {status.toUpperCase()}
    </span>
  );
};

export interface BadgeProps {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className = '' }) => {
  const variantStyles = {
    primary: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
    success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
    warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
    danger: 'bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
    default: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${variantStyles} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
