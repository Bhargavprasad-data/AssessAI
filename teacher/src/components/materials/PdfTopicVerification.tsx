import React from 'react';
import type { UploadedMaterialItem } from '../../types';
import { Modal } from '../common/Modal';
import {
  Code2, Cpu, Database, Globe, Brain, Binary, ShieldCheck, FileText,
  CheckCircle2, X, Trash2, Check, ArrowRight
} from 'lucide-react';

export interface SubjectTheme {
  name: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  iconName: 'code' | 'cpu' | 'database' | 'globe' | 'binary' | 'brain' | 'shield' | 'file';
  accentColor: string;
}

export const getSubjectTheme = (subject?: string, category?: string): SubjectTheme => {
  const s = (subject || '').toLowerCase();
  const c = (category || '').toLowerCase();

  if (s.includes('python') || c.includes('python')) {
    return {
      name: 'Python Programming',
      label: 'Python',
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/40',
      border: 'border-sky-500/30 dark:border-sky-500/40',
      badgeBg: 'bg-gradient-to-r from-sky-500 to-blue-600',
      badgeText: 'text-white',
      iconName: 'code',
      accentColor: '#0284c7'
    };
  }
  if (s.includes('java') && !s.includes('javascript')) {
    return {
      name: 'Java Programming',
      label: 'Java',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-500/30 dark:border-amber-500/40',
      badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-600',
      badgeText: 'text-white',
      iconName: 'code',
      accentColor: '#d97706'
    };
  }
  if (s.includes('c++') || s.includes('c / c++') || s.includes('cpp')) {
    return {
      name: 'C / C++ Programming',
      label: 'C / C++',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-500/30 dark:border-blue-500/40',
      badgeBg: 'bg-gradient-to-r from-blue-600 to-indigo-700',
      badgeText: 'text-white',
      iconName: 'code',
      accentColor: '#2563eb'
    };
  }
  if (s.includes('operating system') || s.includes('os')) {
    return {
      name: 'Operating Systems',
      label: 'Operating Systems',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      border: 'border-purple-500/30 dark:border-purple-500/40',
      badgeBg: 'bg-gradient-to-r from-purple-600 to-violet-700',
      badgeText: 'text-white',
      iconName: 'cpu',
      accentColor: '#9333ea'
    };
  }
  if (s.includes('database') || s.includes('dbms') || s.includes('sql')) {
    return {
      name: 'Database Systems (SQL)',
      label: 'DBMS / SQL',
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-500/30 dark:border-emerald-500/40',
      badgeBg: 'bg-gradient-to-r from-emerald-500 to-teal-600',
      badgeText: 'text-white',
      iconName: 'database',
      accentColor: '#059669'
    };
  }
  if (s.includes('network') || s.includes('tcp') || s.includes('osi')) {
    return {
      name: 'Computer Networks',
      label: 'Networks',
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950/40',
      border: 'border-cyan-500/30 dark:border-cyan-500/40',
      badgeBg: 'bg-gradient-to-r from-cyan-600 to-blue-600',
      badgeText: 'text-white',
      iconName: 'globe',
      accentColor: '#0891b2'
    };
  }
  if (s.includes('data structure') || s.includes('algorithm')) {
    return {
      name: 'Data Structures & Algorithms',
      label: 'DSA',
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      border: 'border-indigo-500/30 dark:border-indigo-500/40',
      badgeBg: 'bg-gradient-to-r from-indigo-500 to-purple-600',
      badgeText: 'text-white',
      iconName: 'binary',
      accentColor: '#4f46e5'
    };
  }
  if (s.includes('machine learning') || s.includes('artificial intelligence') || s.includes('deep learning') || s.includes('ai')) {
    return {
      name: 'Machine Learning & AI',
      label: 'AI / ML',
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      border: 'border-rose-500/30 dark:border-rose-500/40',
      badgeBg: 'bg-gradient-to-r from-rose-500 to-pink-600',
      badgeText: 'text-white',
      iconName: 'brain',
      accentColor: '#e11d48'
    };
  }
  if (s.includes('security') || s.includes('cryptography')) {
    return {
      name: 'Cybersecurity',
      label: 'Security',
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-500/30 dark:border-red-500/40',
      badgeBg: 'bg-gradient-to-r from-red-600 to-rose-700',
      badgeText: 'text-white',
      iconName: 'shield',
      accentColor: '#dc2626'
    };
  }
  if (s.includes('web') || s.includes('javascript') || s.includes('html')) {
    return {
      name: 'Web Technologies',
      label: 'Web Tech',
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      border: 'border-teal-500/30 dark:border-teal-500/40',
      badgeBg: 'bg-gradient-to-r from-teal-500 to-emerald-600',
      badgeText: 'text-white',
      iconName: 'globe',
      accentColor: '#0d9488'
    };
  }

  return {
    name: subject || 'Academic Course Material',
    label: subject ? (subject.length > 20 ? subject.slice(0, 18) + '...' : subject) : 'Course PDF',
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-500/10 dark:bg-brand-500/20',
    border: 'border-brand-500/30 dark:border-brand-500/40',
    badgeBg: 'bg-gradient-to-r from-brand-600 to-indigo-600',
    badgeText: 'text-white',
    iconName: 'file',
    accentColor: '#6366f1'
  };
};

export const renderSubjectIcon = (iconName: string, className: string = 'w-3.5 h-3.5') => {
  switch (iconName) {
    case 'code':
      return <Code2 className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    case 'database':
      return <Database className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'binary':
      return <Binary className={className} />;
    case 'brain':
      return <Brain className={className} />;
    case 'shield':
      return <ShieldCheck className={className} />;
    default:
      return <FileText className={className} />;
  }
};

export const SubjectBadge: React.FC<{
  subject?: string;
  category?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}> = ({ subject, category, size = 'sm', showIcon = true }) => {
  if (!subject) return null;
  const theme = getSubjectTheme(subject, category);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2'
  };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-lg border shadow-xs transition-transform hover:scale-[1.02] ${theme.bg} ${theme.color} ${theme.border} ${sizeClasses[size]}`}
      title={`${theme.name} (${category || 'Course Topic'})`}
    >
      {showIcon && renderSubjectIcon(theme.iconName, size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')}
      <span>{theme.label}</span>
    </span>
  );
};

export const PdfTopicVerificationCard: React.FC<{
  material: UploadedMaterialItem;
  onConfirm: () => void;
  onRemove: () => void;
  onApplyTitle?: (suggestedTitle: string) => void;
  onClose: () => void;
}> = ({ material, onConfirm, onRemove, onApplyTitle, onClose }) => {
  const theme = getSubjectTheme(material.detected_subject, material.detected_category);
  const topics = material.detected_topics || [];
  const confidencePercent = Math.round((material.confidence_score || 0.85) * 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/90 shadow-xl transition-all animate-fadeIn mb-6">
      {/* Top Gradient Glow Accent Bar */}
      <div
        className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-indigo-500 to-sky-500"
        style={{
          background: `linear-gradient(90deg, ${theme.accentColor}, #6366f1, #06b6d4)`
        }}
      />

      <div className="p-5 sm:p-6 space-y-4">
        {/* Header row with badges and close */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>AI Content Verification</span>
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full border border-slate-200/60 dark:border-white/5">
              Match Confidence: <strong className="text-slate-800 dark:text-slate-200 font-bold">{confidencePercent}%</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Dismiss verification card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content Info: Subject + Category + Filename with full breathing room */}
        <div className="p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-start space-x-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${theme.badgeBg} ${theme.badgeText}`}
            >
              {renderSubjectIcon(theme.iconName, 'w-6 h-6')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {material.detected_subject || 'Educational Subject'}
                </h4>
                {material.detected_category && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                    {material.detected_category}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate" title={material.filename}>
                Source File: <span className="font-semibold text-slate-700 dark:text-slate-300">{material.filename}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        {material.document_summary && (
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/50 dark:bg-white/[0.02] p-3 rounded-xl border border-slate-100 dark:border-white/5">
            <strong className="text-slate-900 dark:text-white font-semibold">Content Summary: </strong>
            {material.document_summary}
          </div>
        )}

        {/* Subtopics Chips */}
        {topics.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Detected Course Topics in PDF ({topics.length}):
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {topics.map((topic, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Title Action if available */}
        {material.suggested_title && onApplyTitle && (
          <div className="p-3 rounded-xl bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Suggested Assessment Title: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{material.suggested_title}</strong>
            </div>
            <button
              type="button"
              onClick={() => onApplyTitle(material.suggested_title!)}
              className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 hover:underline flex items-center space-x-1 cursor-pointer self-start sm:self-auto transition-colors"
            >
              <span>Use as Exam Title</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Dedicated Verification Action Bar with Clear Visual Hierarchy */}
        <div className="pt-2 border-t border-slate-200/80 dark:border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-gradient-to-r from-slate-50 to-emerald-50/40 dark:from-slate-800/40 dark:to-emerald-950/20 p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white block">Does this match your intended exam subject?</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Confirm to generate MCQs from this syllabus, or remove if incorrect.</span>
            </div>

            <div className="flex items-center space-x-2.5 flex-shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={onRemove}
                className="px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-slate-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                title="Remove this PDF if you uploaded the wrong document"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wrong PDF? Remove</span>
              </button>

              <button
                type="button"
                onClick={onConfirm}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-500/25 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Yes, Correct PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PdfTopicDetailModal: React.FC<{
  material: UploadedMaterialItem | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ material, isOpen, onClose }) => {
  if (!material) return null;
  const theme = getSubjectTheme(material.detected_subject, material.detected_category);
  const topics = material.detected_topics || [];
  const confidencePercent = Math.round((material.confidence_score || 0.85) * 100);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="PDF Content Classification & Verification" maxWidth="lg">
      <div className="space-y-4">
        {/* Top Subject Overview */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-3.5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${theme.badgeBg} ${theme.badgeText}`}
          >
            {renderSubjectIcon(theme.iconName, 'w-6 h-6')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                {material.detected_subject || 'Academic Document'}
              </h4>
            </div>
            <div className="flex items-center space-x-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{material.detected_category || 'Course Content'}</span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{confidencePercent}% Match</span>
            </div>
          </div>
        </div>

        {/* Source info */}
        <div className="text-xs space-y-1 bg-slate-100/60 dark:bg-white/5 p-3 rounded-xl">
          <div className="text-slate-500 dark:text-slate-400">
            Filename: <strong className="text-slate-800 dark:text-slate-200">{material.filename}</strong>
          </div>
          {material.character_count && (
            <div className="text-slate-500 dark:text-slate-400">
              Extracted Characters: <strong className="text-slate-800 dark:text-slate-200">{material.character_count.toLocaleString()}</strong>
            </div>
          )}
        </div>

        {/* Summary */}
        {material.document_summary && (
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Document Summary
            </h5>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-white/10">
              {material.document_summary}
            </p>
          </div>
        )}

        {/* Detected Topics */}
        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Key Topics Detected ({topics.length})
          </h5>
          {topics.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((topic, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">General reading and course curriculum.</p>
          )}
        </div>

        {/* Confirmation Note */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start space-x-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span>
            This PDF has been analyzed and grounded. AI questions generated from this document will be focused strictly on these concepts.
          </span>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white font-bold text-xs hover:bg-slate-300 dark:hover:bg-white/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
