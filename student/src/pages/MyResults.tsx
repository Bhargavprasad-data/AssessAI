import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import {
  Trophy, Award, CheckCircle2, Clock, ArrowRight,
  BarChart3, AlertCircle, FileText, ChevronRight
} from 'lucide-react';
import { DifficultyBadge } from '../components/common/Badge';

export interface AttemptSummaryItem {
  id: string;
  assessment_id: string;
  assessment_title: string;
  status: 'in_progress' | 'submitted' | 'terminated' | 'disconnected';
  completion_reason?: string;
  started_at: string;
  submitted_at?: string;
  final_score: number;
  highest_difficulty_reached: string;
  total_answers: number;
  correct_answers: number;
  accuracy_pct: number;
}

export const MyResults: React.FC = () => {
  const navigate = useNavigate();

  const {
    data: attempts = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<AttemptSummaryItem[]>({
    queryKey: ['studentAttemptsList'],
    queryFn: () => apiFetch<AttemptSummaryItem[]>('/api/student/attempts'),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const completedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'terminated');
  const totalCompleted = completedAttempts.length;
  const avgScore = totalCompleted > 0
    ? Math.round(completedAttempts.reduce((acc, curr) => acc + (curr.final_score || 0), 0) / totalCompleted)
    : 0;
  const bestScore = totalCompleted > 0
    ? Math.max(...completedAttempts.map(a => a.final_score || 0))
    : 0;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Failed to Load Results</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          {(error as any)?.message || 'An error occurred while fetching your assessment results.'}
        </p>
        <button
          onClick={() => refetch()}
          className="py-2.5 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-500" />
            <span>My Results & Performance</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Review detailed question breakdowns, scoring metrics, and AI adaptive difficulty records.
          </p>
        </div>
        <button
          onClick={() => navigate('/student/dashboard')}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors self-start sm:self-auto"
        >
          <span>Available Assessments</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Completed Exams
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 block">
              {totalCompleted}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Average Score
            </span>
            <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-400 mt-1 block">
              {avgScore} pts
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Best Score
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
              {bestScore} pts
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Attempts List */}
      {attempts.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center border border-slate-200 dark:border-white/10 max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Exam Results Yet</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
            You haven't participated in any assessments yet. Take an available assessment to view your real-time score report and analytics.
          </p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="mt-6 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-500/25 transition-all cursor-pointer"
          >
            Take an Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
            Past Submissions ({attempts.length})
          </h2>

          <div className="grid grid-cols-1 gap-4">
            {attempts.map((item) => {
              const isFinished = item.status === 'submitted' || item.status === 'terminated';
              const dateStr = item.submitted_at || item.started_at;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              return (
                <div
                  key={item.id}
                  className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-white/10 hover:border-brand-500/30 dark:hover:border-brand-500/30 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate" title={item.assessment_title}>
                        {item.assessment_title}
                      </h3>
                      {item.status === 'submitted' ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Submitted
                        </span>
                      ) : item.status === 'terminated' ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-500/20">
                          Terminated ({item.completion_reason?.replace(/_/g, ' ') || 'Breach'})
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20">
                          In Progress
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap gap-y-1">
                      <span className="flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        {formattedDate}
                      </span>
                      <span>•</span>
                      <span>
                        Answered: <strong className="text-slate-700 dark:text-slate-300">{item.total_answers}</strong> (
                        <strong className="text-emerald-600 dark:text-emerald-400">{item.correct_answers} correct</strong>)
                      </span>
                      <span>•</span>
                      <span>
                        Accuracy: <strong className="text-slate-700 dark:text-slate-300">{item.accuracy_pct}%</strong>
                      </span>
                      {item.highest_difficulty_reached && (
                        <>
                          <span>•</span>
                          <div className="inline-flex items-center gap-1">
                            <span className="text-[11px]">Peak Diff:</span>
                            <DifficultyBadge difficulty={item.highest_difficulty_reached} size="sm" />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 flex-shrink-0 self-end sm:self-center">
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Score
                      </span>
                      <span className="text-xl font-extrabold text-brand-600 dark:text-white">
                        {item.final_score} <span className="text-xs text-slate-400 font-normal">pts</span>
                      </span>
                    </div>

                    {isFinished ? (
                      <button
                        onClick={() => navigate(`/student/attempts/${item.id}/results`)}
                        className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20 flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <span>View Report</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/student/assessments/${item.assessment_id}/take`)}
                        className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <span>Resume Exam</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
