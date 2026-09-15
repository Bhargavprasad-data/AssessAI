import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  Users,
  AlertCircle,
  Loader2,
  RefreshCw,
  GraduationCap,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type { Assessment, User } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { AdminTableSkeleton, FilterBarSkeleton } from '../components/common/Skeleton';

type TabType = 'all' | 'published' | 'draft' | 'closed';

export const AssessmentManager: React.FC = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Fetch all assessments across the platform
  const {
    data: assessments,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Assessment[]>({
    queryKey: ['adminAssessments'],
    queryFn: () => apiFetch<Assessment[]>('/api/admin/assessments'),
    retry: true,
    retryDelay: 2500,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // Fetch teachers for the educator filter dropdown
  const { data: teachers } = useQuery<User[]>({
    queryKey: ['adminTeachersList'],
    queryFn: () => apiFetch<User[]>('/api/admin/users?role=teacher'),
    staleTime: 60000,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (assessmentId: string) => {
      return apiFetch<{ message: string; deleted_assessment_id: string }>(
        `/api/admin/assessments/${assessmentId}`,
        { method: 'DELETE' }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adminAssessments'] });
      queryClient.invalidateQueries({ queryKey: ['adminAuditLogs'] });
      setAssessmentToDelete(null);
      setErrorMessage(null);
      setSuccessToast(data.message || 'Assessment successfully deleted by admin.');
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

    const matchesTeacher =
      !selectedTeacherId || a.teacher_id === selectedTeacherId;

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.teacher_name && a.teacher_name.toLowerCase().includes(q)) ||
      (a.teacher_email && a.teacher_email.toLowerCase().includes(q));

    return matchesTab && matchesTeacher && matchesSearch;
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Test Management & Deletion
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                Platform-wide control to inspect and permanently remove Current, Future, and Past assessments.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 transition-colors flex items-center space-x-2"
            title="Refresh Assessments"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-brand-500' : ''}`} />
            <span className="text-xs font-semibold hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric KPI Cards */}
      {!showSkeleton && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Tests
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {allAssessments.length}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Current (Live)
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {publishedCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 shadow-sm">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              Future (Draft)
            </span>
            <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
              {draftCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-300 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-800/30 shadow-sm">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Past (Closed)
            </span>
            <div className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1">
              {closedCount}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 col-span-2 lg:col-span-1 shadow-sm">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Platform Attempts
            </span>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {totalAttempts}
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      {showSkeleton ? (
        <FilterBarSkeleton />
      ) : (
        <div className="space-y-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
            {/* Category Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'all'
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                All Tests ({allAssessments.length})
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

            {/* Filter Controls: Teacher selector + Search bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Teacher Filter Dropdown */}
              <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer py-0.5"
                >
                  <option value="">All Educators</option>
                  {(teachers || []).map((t) => (
                    <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by title, educator, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skeleton View */}
      {showSkeleton && <AdminTableSkeleton />}

      {/* Empty State */}
      {!showSkeleton && filteredAssessments.length === 0 && (
        <div className="rounded-3xl p-12 text-center border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
          <Layers className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Assessments Found</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 mb-6 max-w-md mx-auto">
            {searchQuery || selectedTeacherId
              ? 'No assessments match the specified filters. Try adjusting your search query or educator filter.'
              : 'There are currently no assessments recorded in the system.'}
          </p>
          {(searchQuery || selectedTeacherId) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTeacherId('');
                setActiveTab('all');
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Assessments Table */}
      {!showSkeleton && filteredAssessments.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Assessment Details</th>
                  <th scope="col" className="px-5 py-3.5">Educator</th>
                  <th scope="col" className="px-5 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5">Configuration</th>
                  <th scope="col" className="px-5 py-3.5">Attempts</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium">
                {filteredAssessments.map((a) => {
                  const hasActiveAttempts = (a.active_attempts_count || 0) > 0;

                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors"
                    >
                      {/* Assessment Title & ID */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-sm text-slate-900 dark:text-white break-words max-w-xs">
                          {a.title}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                          ID: {a.id}
                        </div>
                      </td>

                      {/* Educator */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {a.teacher_name || 'Unknown Educator'}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">
                              {a.teacher_email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={a.status} />
                        {hasActiveAttempts && (
                          <div className="mt-1 flex items-center space-x-1 text-[10px] font-semibold text-amber-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                            <span>Live attempts</span>
                          </div>
                        )}
                      </td>

                      {/* Configuration */}
                      <td className="px-5 py-4">
                        <div className="space-y-1 text-slate-500 dark:text-slate-400">
                          <div className="flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{Math.floor(a.time_limit_seconds / 60)} min</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{a.question_count || 0} questions (max {a.max_question_count})</span>
                          </div>
                        </div>
                      </td>

                      {/* Attempts */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-slate-900 dark:text-white">
                            {a.attempts_count || 0}
                          </span>
                          <span className="text-slate-400">total</span>
                        </div>
                        {hasActiveAttempts && (
                          <div className="text-[11px] text-emerald-500 font-semibold mt-0.5">
                            {a.active_attempts_count} currently active
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => {
                            setAssessmentToDelete(a);
                            setErrorMessage(null);
                          }}
                          className="inline-flex items-center space-x-1.5 py-1.5 px-3 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Test</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  Administrator Test Deletion
                </h3>
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Permanent & Irreversible Purge
                </span>
              </div>
            </div>

            {/* Assessment Details */}
            <div className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Title:</span> {assessmentToDelete.title}
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Educator:</span>{' '}
                {assessmentToDelete.teacher_name || 'N/A'} ({assessmentToDelete.teacher_email || 'N/A'})
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Status:</span>{' '}
                <span className="uppercase font-semibold text-rose-600 dark:text-rose-400">{assessmentToDelete.status}</span>
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Associated Attempts:</span>{' '}
                <strong className="text-slate-900 dark:text-white">{assessmentToDelete.attempts_count || 0}</strong>
              </div>
            </div>

            {/* Critical Warning */}
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                As an Administrator, performing this action will permanently delete this test and purge all{' '}
                <strong>student attempts, serving states, responses, and proctoring audit logs</strong>.
              </p>
              {assessmentToDelete.status === 'published' && (
                <p className="text-amber-600 dark:text-amber-400 font-semibold flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Warning: This test is CURRENTLY LIVE. Active attempts will be force-deleted.</span>
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
                    <span>Purging Assessment...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Permanently Purge Test</span>
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
export default AssessmentManager;
