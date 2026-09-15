import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  AlertTriangle,
  Search,
  Plus,
  BarChart3,
  Edit3,
  Clock,
  Layers,
  CheckCircle2,
  FileText,
  Users,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type { Assessment } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { DashboardHeaderSkeleton, AssessmentCardSkeleton } from '../components/common/Skeleton';

type TabType = 'all' | 'published' | 'draft' | 'closed';

export const ManageAssessments: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const {
    data: assessments,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Assessment[]>({
    queryKey: ['teacherAssessments'],
    queryFn: () => apiFetch<Assessment[]>('/api/teacher/assessments'),
    retry: true,
    retryDelay: 2500,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (assessmentId: string) => {
      return apiFetch<{ message: string; deleted_assessment_id: string }>(
        `/api/teacher/assessments/${assessmentId}`,
        { method: 'DELETE' }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teacherAssessments'] });
      setAssessmentToDelete(null);
      setErrorMessage(null);
      setSuccessToast(data.message || 'Assessment successfully deleted.');
      setTimeout(() => setSuccessToast(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to delete assessment. Please try again.');
    },
  });

  const showSkeleton = isLoading || isError || !assessments;

  const allAssessments = assessments || [];
  const publishedCount = allAssessments.filter((a) => a.status === 'published').length;
  const draftCount = allAssessments.filter((a) => a.status === 'draft').length;
  const closedCount = allAssessments.filter((a) => a.status === 'closed').length;
  const totalAttempts = allAssessments.reduce((acc, a) => acc + (a.attempts_count || 0), 0);

  const filteredAssessments = allAssessments.filter((a) => {
    const matchesTab =
      activeTab === 'all'
        ? true
        : activeTab === 'published'
        ? a.status === 'published'
        : activeTab === 'draft'
        ? a.status === 'draft'
        : a.status === 'closed';

    const matchesSearch =
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const handleDeleteConfirm = () => {
    if (!assessmentToDelete) return;
    deleteMutation.mutate(assessmentToDelete.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-400/30 animate-bounce">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-semibold">{successToast}</span>
        </div>
      )}

      {/* Header */}
      {showSkeleton ? (
        <DashboardHeaderSkeleton />
      ) : (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Manage & Delete Tests
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                  Full control to inspect, configure, or permanently delete Current, Future, and Past assessments.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 transition-colors"
              title="Refresh List"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-brand-500' : ''}`} />
            </button>
            <Link
              to="/teacher/assessments/new"
              className="inline-flex items-center space-x-2 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Test</span>
            </Link>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      {!showSkeleton && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Tests
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {allAssessments.length}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Current (Live)
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {publishedCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              Future (Draft)
            </span>
            <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
              {draftCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-300 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Past (Closed)
            </span>
            <div className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1">
              {closedCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Total Attempts
            </span>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {totalAttempts}
            </div>
          </div>
        </div>
      )}

      {/* Search & Tabs Toolbar */}
      {!showSkeleton && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              All ({allAssessments.length})
            </button>
            <button
              onClick={() => setActiveTab('published')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'published'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Current / Live ({publishedCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'draft'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20'
                  : 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30'
              }`}
            >
              Future / Draft ({draftCount})
            </button>
            <button
              onClick={() => setActiveTab('closed')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'closed'
                  ? 'bg-slate-700 text-white shadow-md shadow-slate-700/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              Past / Closed ({closedCount})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tests by title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9.5 pr-4 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>
        </div>
      )}

      {/* Skeleton Loading Pattern */}
      {showSkeleton && <AssessmentCardSkeleton />}

      {/* Empty States */}
      {!showSkeleton && filteredAssessments.length === 0 && (
        <div className="rounded-3xl p-12 text-center border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
          <Layers className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Matching Assessments Found</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 mb-6 max-w-md mx-auto">
            {searchQuery
              ? `No tests match your search query "${searchQuery}". Try a different search term or tab filter.`
              : `You don't have any assessments categorized under this filter yet.`}
          </p>
          <div className="flex justify-center space-x-3">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
              >
                Clear Search
              </button>
            )}
            <Link
              to="/teacher/assessments/new"
              className="inline-flex items-center space-x-2 py-2 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Test</span>
            </Link>
          </div>
        </div>
      )}

      {/* Assessments List / Cards */}
      {!showSkeleton && filteredAssessments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssessments.map((a) => {
            const hasActiveAttempts = (a.active_attempts_count || 0) > 0;

            return (
              <div
                key={a.id}
                className="rounded-2xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between transition-all bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-white/20 shadow-sm"
              >
                <div>
                  {/* Top Bar: Title & Status */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-snug break-words">
                      {a.title}
                    </h3>
                    <StatusBadge status={a.status} />
                  </div>

                  {/* Metadata Chips */}
                  <div className="space-y-2 mb-6 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>Duration: {Math.floor(a.time_limit_seconds / 60)} min ({a.time_limit_seconds}s)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>
                        Questions: {a.question_count || 0} pooled (Max {a.max_question_count} serving)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>
                        Attempts: <strong className="text-slate-700 dark:text-slate-200">{a.attempts_count || 0}</strong> total
                        {hasActiveAttempts && (
                          <span className="ml-1 text-emerald-500 font-bold">({a.active_attempts_count} live)</span>
                        )}
                      </span>
                    </div>

                    {hasActiveAttempts && (
                      <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 inline-flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        <span>Live Attempts In Progress</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-4 border-t border-slate-100 dark:border-white/10 space-y-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => navigate(`/teacher/assessments/${a.id}/analytics`)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center space-x-1.5 transition-all
                        bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10
                        text-slate-900 dark:text-white border-slate-200 dark:border-white/10"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-brand-500" />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={() => navigate(`/teacher/assessments/${a.id}/edit`)}
                      className="py-2 px-3 rounded-xl text-xs font-semibold border transition-all
                        bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10
                        text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 flex items-center space-x-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>

                  {/* High-visibility Delete Button */}
                  <button
                    onClick={() => {
                      setAssessmentToDelete(a);
                      setErrorMessage(null);
                    }}
                    className="w-full py-2 px-3 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Test ({a.status})</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Red Danger Delete Confirmation Modal */}
      {assessmentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-lg w-full glass-panel rounded-3xl p-6 sm:p-8 border border-rose-500/40 bg-white dark:bg-slate-950 shadow-2xl text-left space-y-5">
            {/* Header */}
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Delete Assessment?
                </h3>
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Permanent & Irreversible Action
                </span>
              </div>
            </div>

            {/* Assessment Details */}
            <div className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Title:</span> {assessmentToDelete.title}
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Status:</span>{' '}
                <span className="uppercase font-semibold text-rose-600 dark:text-rose-400">{assessmentToDelete.status}</span>
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Attempts Recorded:</span>{' '}
                <strong className="text-slate-900 dark:text-white">{assessmentToDelete.attempts_count || 0}</strong>
              </div>
            </div>

            {/* Critical Warning */}
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                Deleting this assessment will permanently remove the test record along with all{' '}
                <strong>associated student attempts, answer submissions, serving states, and proctoring violations</strong>.
              </p>
              {assessmentToDelete.status === 'published' && (
                <p className="text-amber-600 dark:text-amber-400 font-semibold flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>This test is currently LIVE. Any ongoing student sessions will be terminated.</span>
                </p>
              )}
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAssessmentToDelete(null);
                  setErrorMessage(null);
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center space-x-2 cursor-pointer"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting Assessment...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ManageAssessments;
