import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { Assessment } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { AssessmentCardSkeleton, DashboardHeaderSkeleton } from '../components/common/Skeleton';
import { FileText, Plus, BarChart3, Clock, AlertTriangle, BookOpen } from 'lucide-react';

export const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();

  const {
    data: assessments = [],
    isLoading,
    isError,
  } = useQuery<Assessment[]>({
    queryKey: ['teacherAssessments'],
    queryFn: () => apiFetch<Assessment[]>('/api/teacher/assessments'),
    retry: (failureCount, err: any) => {
      const msg = err?.message || '';
      if (msg.includes('403') || msg.includes('401') || msg.includes('Forbidden') || msg.includes('Unauthorized')) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: 1500,
    refetchInterval: (query) => (query.state.status === 'error' ? false : 30000),
    staleTime: 15000,
  });

  const showSkeleton = isLoading && assessments.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      {showSkeleton ? (
        <DashboardHeaderSkeleton />
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Teacher Dashboard
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Manage course materials, AI-generated pools, and live assessments.
            </p>
          </div>
          <Link
            to="/teacher/assessments/new"
            className="inline-flex items-center space-x-2 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assessment</span>
          </Link>
        </div>
      )}

      {/* Skeleton Grid */}
      {showSkeleton && <AssessmentCardSkeleton />}

      {/* Error banner — backend dropped while cached data visible */}
      {isError && assessments.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <span>Connection lost — showing cached data. Reconnecting…</span>
        </div>
      )}

      {/* Empty state */}
      {!showSkeleton && !isError && assessments.length === 0 && (
        <div className="rounded-3xl p-12 text-center border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
          <BookOpen className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assessments Created</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 mb-6">
            Upload a PDF course material and let the AI generate question pools to get started.
          </p>
          <Link
            to="/teacher/assessments/new"
            className="inline-flex items-center space-x-2 py-2.5 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Assessment</span>
          </Link>
        </div>
      )}

      {/* Assessment Grid */}
      {!showSkeleton && assessments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between transition-all bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-white/20"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {a.title}
                  </h3>
                  <StatusBadge status={a.status} />
                </div>

                <div className="space-y-2 mb-6 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Duration: {Math.floor(a.time_limit_seconds / 60)} min</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>
                      Question Pool: {a.question_count || 0} questions (Max: {a.max_question_count})
                    </span>
                  </div>
                  {a.config_locked && (
                    <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20 inline-block">
                      Pool Locked (Attempts in progress)
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t border-slate-100 dark:border-white/10">
                <button
                  onClick={() => navigate(`/teacher/assessments/${a.id}/analytics`)}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-all
                    bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10
                    text-slate-900 dark:text-white border-slate-200 dark:border-white/10"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-brand-500" />
                  <span>Live Analytics</span>
                </button>
                <button
                  onClick={() => navigate(`/teacher/assessments/${a.id}/edit`)}
                  className="py-2 px-3 rounded-xl text-xs font-semibold border transition-all
                    bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10
                    text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10"
                >
                  Configure
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
