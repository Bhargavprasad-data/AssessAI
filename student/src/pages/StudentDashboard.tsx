import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { Clock, HelpCircle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { AssessmentCardSkeleton, PageHeaderSkeleton } from '../components/common/Skeleton';

interface AvailableAssessment {
  id: string;
  title: string;
  time_limit_seconds: number;
  per_question_time_limit_seconds?: number;
  max_question_count: number;
  is_banned: boolean;
  ban_reason?: string;
  existing_attempt_status?: string;
  existing_attempt_id?: string;
}

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();

  const {
    data: assessments,
    isLoading,
    isError,
  } = useQuery<AvailableAssessment[]>({
    queryKey: ['studentAssessments'],
    queryFn: () => apiFetch<AvailableAssessment[]>('/api/student/assessments/available'),
    retry: true,
    retryDelay: 2500,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Continuous shimmer skeleton when loading, offline, erroring, or data not yet available
  const showSkeleton = isLoading || isError || !assessments;

  const handleAction = (item: AvailableAssessment) => {
    if (item.is_banned) return;
    if (item.existing_attempt_status === 'submitted') {
      if (item.existing_attempt_id) {
        navigate(`/student/attempts/${item.existing_attempt_id}/results`);
      } else {
        navigate('/student/attempts');
      }
    } else {
      navigate(`/student/assessments/${item.id}/take`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      {showSkeleton ? (
        <PageHeaderSkeleton />
      ) : (
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Available Assessments
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Select an assessment to begin. Ensure your environment is quiet and distraction-free.
          </p>
        </div>
      )}

      {/* Skeleton Grid */}
      {showSkeleton && <AssessmentCardSkeleton />}

      {/* Empty state */}
      {!showSkeleton && (assessments || []).length === 0 && (
        <div className="rounded-3xl p-12 text-center border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
          <HelpCircle className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assessments Available</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            There are currently no published assessments available for you to join.
          </p>
        </div>
      )}

      {/* Cards grid */}
      {!showSkeleton && assessments && assessments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assessments.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between transition-all
                bg-white dark:bg-slate-900/40
                ${
                  a.is_banned
                    ? 'border-rose-500/30 bg-rose-50 dark:bg-rose-950/20'
                    : 'border-slate-200 dark:border-white/10 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/10'
                }`}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-snug">
                    {a.title}
                  </h3>
                  {a.is_banned ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                      <ShieldAlert className="w-3.5 h-3.5 mr-1" /> BANNED
                    </span>
                  ) : a.existing_attempt_status === 'submitted' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> COMPLETED
                    </span>
                  ) : a.existing_attempt_status === 'in_progress' ||
                    a.existing_attempt_status === 'disconnected' ||
                    a.existing_attempt_status === 'terminated' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                      IN PROGRESS
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                      READY
                    </span>
                  )}
                </div>

                <div className="space-y-2 mb-6 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Time Limit: {Math.floor(a.time_limit_seconds / 60)} minutes</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>Total Questions: {a.max_question_count} questions</span>
                  </div>
                  {a.per_question_time_limit_seconds && (
                    <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                      <Clock className="w-4 h-4" />
                      <span>Per-Question Limit: {a.per_question_time_limit_seconds}s</span>
                    </div>
                  )}
                </div>

                {a.is_banned && a.ban_reason && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">
                    <span className="font-semibold block">Ban Reason:</span> {a.ban_reason}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleAction(a)}
                disabled={a.is_banned}
                className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition-all ${
                  a.is_banned
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                    : a.existing_attempt_status === 'submitted'
                    ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10'
                    : 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-500/25'
                }`}
              >
                <span>
                  {a.is_banned
                    ? 'Access Blocked'
                    : a.existing_attempt_status === 'submitted'
                    ? 'View Results'
                    : a.existing_attempt_status === 'in_progress' ||
                      a.existing_attempt_status === 'disconnected' ||
                      a.existing_attempt_status === 'terminated'
                    ? 'Resume Assessment'
                    : 'Start Assessment'}
                </span>
                {!a.is_banned && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
