import React from 'react';

interface DifficultyBadgeProps {
  difficulty: 'easy' | 'medium' | 'hard' | string;
  size?: 'sm' | 'md' | 'lg';
}

export const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({ difficulty, size = 'md' }) => {
  const diff = difficulty.toLowerCase();

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3.5 py-1.5 font-bold',
  }[size];

  if (diff === 'easy') {
    return (
      <span className={`inline-flex items-center rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-1.5 animate-pulse"></span>
        Easy (1 pt)
      </span>
    );
  }

  if (diff === 'medium') {
    return (
      <span className={`inline-flex items-center rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 ${sizeClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mr-1.5 animate-pulse"></span>
        Medium (2 pts)
      </span>
    );
  }

  if (diff === 'hard') {
    return (
      <span className={`inline-flex items-center rounded-full font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 ${sizeClasses}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 mr-1.5 animate-pulse"></span>
        Hard (3 pts)
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 ${sizeClasses}`}>
      {difficulty}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();

  if (s === 'published' || s === 'in_progress') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-1.5"></span>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  }

  if (s === 'terminated' || s === 'failed') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 mr-1.5"></span>
        {status.toUpperCase()}
      </span>
    );
  }

  if (s === 'submitted' || s === 'completed') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20">
        {status.toUpperCase()}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
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
  const variantStyles: Record<string, string> = {
    primary:
      'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    success:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    warning:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    danger:
      'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
    default:
      'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
