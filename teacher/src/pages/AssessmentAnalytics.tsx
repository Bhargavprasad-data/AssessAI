import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Download, ShieldAlert, Users, Trophy, Award,
  BarChart3, AlertTriangle, CheckCircle, XCircle,
  Activity, Ban, UserCheck
} from 'lucide-react';
import { apiFetch, getApiUrl } from '../api/client';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { AssessmentAnalytics, AttemptReviewItem, Assessment, ViolationEvent } from '../types';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { AnalyticsOverviewSkeleton, AttemptsTableSkeleton } from '../components/common/Skeleton';

export default function AssessmentAnalyticsPage() {
  const { id: assessmentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State for Ban Modal
  const [selectedStudentForBan, setSelectedStudentForBan] = useState<{ id: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banError, setBanError] = useState<string | null>(null);

  // Real-time Leaderboard & Live Violation Stream
  const { leaderboard, violations } = useLeaderboard(assessmentId || '');

  // Fetch Assessment Details
  const { data: assessment } = useQuery<Assessment>({
    queryKey: ['assessment', assessmentId],
    queryFn: async () => {
      const assessments = await apiFetch<Assessment[]>('/api/teacher/assessments');
      const match = assessments.find((a) => a.id === assessmentId);
      if (!match) throw new Error('Assessment not found');
      return match;
    },
    enabled: !!assessmentId,
    retry: true,
    retryDelay: 2500,
  });

  // Fetch Analytics Data
  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError } = useQuery<AssessmentAnalytics>({
    queryKey: ['assessmentAnalytics', assessmentId],
    queryFn: () => apiFetch<AssessmentAnalytics>(`/api/teacher/assessments/${assessmentId}/analytics`),
    enabled: !!assessmentId,
    retry: true,
    retryDelay: 2500,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Fetch Attempts List
  const { data: attempts, isLoading: attemptsLoading, isError: attemptsError } = useQuery<AttemptReviewItem[]>({
    queryKey: ['assessmentAttempts', assessmentId],
    queryFn: () => apiFetch<AttemptReviewItem[]>(`/api/teacher/assessments/${assessmentId}/attempts`),
    enabled: !!assessmentId,
    retry: true,
    retryDelay: 2500,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Apply Assessment Ban Mutation
  const banMutation = useMutation({
    mutationFn: async ({ studentId, reason }: { studentId: string; reason: string }) => {
      return apiFetch(`/api/teacher/assessments/${assessmentId}/bans/${studentId}?reason=${encodeURIComponent(reason)}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessmentAttempts', assessmentId] });
      setSelectedStudentForBan(null);
      setBanReason('');
      setBanError(null);
    },
    onError: (err: any) => {
      setBanError(err.message || 'Failed to apply assessment ban');
    },
  });

  // Revoke Assessment Ban Mutation (resumes exam attempt)
  const revokeBanMutation = useMutation({
    mutationFn: async (studentId: string) => {
      return apiFetch(`/api/teacher/assessments/${assessmentId}/bans/${studentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessmentAttempts', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['assessmentAnalytics', assessmentId] });
    },
  });

  // Reinstate Terminated Attempt Mutation (resumes exam attempt)
  const reinstateMutation = useMutation({
    mutationFn: async (attemptId: string) => {
      return apiFetch(`/api/teacher/assessments/${assessmentId}/attempts/${attemptId}/reinstate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessmentAttempts', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['assessmentAnalytics', assessmentId] });
    },
  });

  const [isExporting, setIsExporting] = useState(false);

  // Authenticated CSV Export Handler
  const handleExportCSV = async () => {
    if (!assessmentId || isExporting) return;
    setIsExporting(true);
    try {
      const authToken = localStorage.getItem('auth_token');
      const res = await fetch(getApiUrl(`/api/teacher/assessments/${assessmentId}/export`), {
        method: 'GET',
        headers: {
          'X-Expected-Role': 'teacher',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
      });

      if (!res.ok) {
        let errMessage = `Export failed with status ${res.status}`;
        try {
          const rawText = await res.text();
          const errJson = rawText ? JSON.parse(rawText) : null;
          if (errJson && errJson.detail) errMessage = errJson.detail;
        } catch {}
        throw new Error(errMessage);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `assessment_${assessmentId}_attempts.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export CSV:', err);
      alert(err.message || 'Failed to export CSV file.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleApplyBan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForBan || !banReason.trim()) {
      setBanError('Please provide a reason for the assessment ban.');
      return;
    }
    banMutation.mutate({ studentId: selectedStudentForBan.id, reason: banReason.trim() });
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-dark-border pb-6">
        <div>
          <button
            onClick={() => navigate('/teacher')}
            className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Assessments
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {assessment?.title || 'Assessment Analytics & Live Proctoring'}
            </h1>
            {assessment && (
              <Badge variant={assessment.status === 'published' ? 'success' : 'default'}>
                {assessment.status}
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time DB-backed leaderboard, adaptive difficulty accuracy, and smart proctoring telemetry.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-100/80 dark:bg-dark-bg/60 text-xs text-slate-700 dark:text-slate-300">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-500 dark:text-emerald-400 animate-pulse' : 'text-amber-500 dark:text-amber-400'}`} />
            <span>{connectionMode === 'ws' ? 'Live WebSocket' : 'Polling Sync (5s)'}</span>
          </div> */}

          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-brand-700 dark:text-brand-300 text-xs font-semibold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>

          {/* <button
            onClick={() => {
              refetchAnalytics();
              refetchAttempts();
            }}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-dark-border text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-border/40 transition-colors"
            title="Refresh All"
          >
            <RefreshCw className="w-4 h-4" />
          </button> */}
        </div>
      </div>

      {/* KPI Stats Overview */}
      {analyticsLoading || analyticsError || !analytics ? (
        <AnalyticsOverviewSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total Attempts</span>
              <Users className="w-4 h-4 text-brand-600 dark:text-primary-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{analytics.total_attempts}</p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{analytics.completed_attempts} Completed</span>
              <span>•</span>
              <span className="text-rose-600 dark:text-rose-400 font-medium">{analytics.terminated_attempts} Terminated</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Average Score</span>
              <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{analytics.average_score.toFixed(1)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Weighted score scale</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Score Range</span>
              <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              {analytics.lowest_score.toFixed(1)} <span className="text-slate-400 dark:text-slate-500 font-normal text-sm">to</span> {analytics.highest_score.toFixed(1)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Min / Max achieved</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Proctoring Signals</span>
              <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{analytics.total_violations_recorded}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Total events logged</p>
          </div>

          <div className="col-span-2 lg:col-span-1 p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Difficulty Accuracy</span>
              <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">Easy</span>
                <span className="font-semibold text-slate-900 dark:text-white">{analytics.accuracy_by_difficulty?.easy || 0}%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-amber-700 dark:text-amber-300 font-medium">Medium</span>
                <span className="font-semibold text-slate-900 dark:text-white">{analytics.accuracy_by_difficulty?.medium || 0}%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-rose-700 dark:text-rose-300 font-medium">Hard</span>
                <span className="font-semibold text-slate-900 dark:text-white">{analytics.accuracy_by_difficulty?.hard || 0}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Main Grid: Real-time Leaderboard & Live Proctoring Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Real-time Leaderboard (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Live Leaderboard</h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">DB-Authoritative Ranking</span>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/60 backdrop-blur overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-dark-bg/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-dark-border">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-center">Peak Difficulty</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-dark-border/40 text-slate-700 dark:text-slate-300">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        No submissions recorded for this assessment yet.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((entry) => (
                      <tr key={entry.attempt_id} className="hover:bg-slate-50 dark:hover:bg-dark-border/20 transition-colors">
                        <td className="px-4 py-3 font-semibold">
                          {entry.rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-xs">🥇</span>
                          ) : entry.rank === 2 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-400/20 text-slate-600 dark:text-slate-300 text-xs">🥈</span>
                          ) : entry.rank === 3 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-700/20 text-amber-700 dark:text-amber-500 text-xs">🥉</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 pl-1.5">#{entry.rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{entry.display_name}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {entry.final_score.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={
                              entry.highest_difficulty === 'hard'
                                ? 'danger'
                                : entry.highest_difficulty === 'medium'
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {entry.highest_difficulty}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={
                              entry.status === 'submitted'
                                ? 'success'
                                : entry.status === 'terminated'
                                  ? 'danger'
                                  : 'default'
                            }
                          >
                            {entry.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Score Distribution Breakdown */}
          {analytics && analytics.score_distribution && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/40">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                Score Distribution
              </h3>
              <div className="grid grid-cols-5 gap-2 text-center">
                {analytics.score_distribution.map((bucket) => (
                  <div key={bucket.range_label} className="flex flex-col items-center">
                    <div className="w-full bg-slate-100 dark:bg-dark-bg/80 rounded-t h-20 flex items-end justify-center p-1 border-b border-slate-200 dark:border-dark-border">
                      <div
                        className="w-full bg-indigo-600/70 dark:bg-primary-500/70 hover:bg-indigo-600 dark:hover:bg-primary-400 rounded-t transition-all"
                        style={{
                          height: `${Math.min(100, Math.max(10, (bucket.count / (analytics.total_attempts || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">{bucket.range_label}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Proctoring Violations Stream (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Live Proctoring Feed</h2>
            </div>
            <Badge variant="warning">Epistemic Signals</Badge>
          </div>

          {/* Epistemic Guardrail Notice */}
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-slate-300 text-xs leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p>
              Signals represent client-side environment changes (visibility change, window blur, clipboard actions).
              These are <strong>environment indicators</strong>, not proof of academic dishonesty.
            </p>
          </div>

          {/* Scrollable Live Violation List */}
          <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/60 backdrop-blur p-4 h-[440px] overflow-y-auto space-y-3">
            {violations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-xs">
                <CheckCircle className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2" />
                <p>No proctoring violation signals recorded yet.</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Live events stream here automatically.</p>
              </div>
            ) : (
              violations.map((v: ViolationEvent, idx: number) => (
                <div
                  key={`${v.attempt_id}-${v.occurred_at}-${idx}`}
                  className="p-3 rounded-lg border border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/5 hover:bg-rose-100/60 dark:hover:bg-rose-500/10 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">{v.student_name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {new Date(v.occurred_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                      {v.type.replace(/_/g, ' ')}
                    </span>
                    <Badge variant={v.is_terminated ? 'danger' : 'warning'}>
                      {v.violation_count} / {v.max_violations}
                    </Badge>
                  </div>
                  {v.is_terminated && (
                    <div className="pt-1 border-t border-rose-500/30 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Terminated & assessment-banned automatically
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Attempts List & Assessment Ban Management */}
      <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-dark-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Student Attempts & Access Control</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review attempt outcomes, examine proctoring violation counts, and manage assessment-specific bans.
            </p>
          </div>
        </div>

        {attemptsLoading || attemptsError || !attempts ? (
          <AttemptsTableSkeleton />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/60 backdrop-blur overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-dark-bg/60 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-dark-border">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Reason</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-center">Violations</th>
                    <th className="px-4 py-3 text-center">Ban Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-dark-border/40 text-slate-700 dark:text-slate-300">
                  {attempts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        No attempts registered for this assessment yet.
                      </td>
                    </tr>
                  ) : (
                  attempts.map((attempt) => (
                    <tr key={attempt.attempt_id} className="hover:bg-slate-50 dark:hover:bg-dark-border/20 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{attempt.student_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{attempt.student_email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            attempt.status === 'submitted'
                              ? 'success'
                              : attempt.status === 'terminated'
                                ? 'danger'
                                : attempt.status === 'in_progress'
                                  ? 'primary'
                                  : 'default'
                          }
                        >
                          {attempt.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {attempt.completion_reason || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {attempt.final_score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span
                          className={`font-semibold ${attempt.violation_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
                            }`}
                        >
                          {attempt.violation_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {attempt.has_active_ban ? (
                          <Badge variant="danger">Banned</Badge>
                        ) : (
                          <Badge variant="success">Eligible</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {attempt.has_active_ban ? (
                            <button
                              type="button"
                              onClick={() => revokeBanMutation.mutate(attempt.student_id)}
                              disabled={revokeBanMutation.isPending}
                              title="Revoke ban and resume this student's exam attempt"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{revokeBanMutation.isPending ? 'Resuming...' : 'Revoke Ban & Continue Exam'}</span>
                            </button>
                          ) : attempt.status === 'terminated' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => reinstateMutation.mutate(attempt.attempt_id)}
                                disabled={reinstateMutation.isPending}
                                title="Unblock and allow student to continue their exam attempt"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] transition-all shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>{reinstateMutation.isPending ? 'Resuming...' : 'Revoke Ban & Continue Exam'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentForBan({ id: attempt.student_id, name: attempt.student_name });
                                  setBanReason('');
                                  setBanError(null);
                                }}
                                title="Apply formal assessment ban"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold text-[11px] transition-colors cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Ban</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStudentForBan({ id: attempt.student_id, name: attempt.student_name });
                                setBanReason('');
                                setBanError(null);
                              }}
                              title="Ban student and immediately terminate active exam"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Ban</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Assessment Ban Modal */}
      <Modal
        isOpen={!!selectedStudentForBan}
        onClose={() => setSelectedStudentForBan(null)}
        title={`Ban Student from Assessment`}
      >
        <form onSubmit={handleApplyBan} className="space-y-4">
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            Applying an assessment ban prevents <strong className="text-slate-900 dark:text-white">{selectedStudentForBan?.name}</strong> from starting new attempts on this assessment.
          </p>

          {banError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
              {banError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Ban Justification / Reason *
            </label>
            <textarea
              required
              rows={3}
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="e.g., Repeated unauthorized materials visible in camera feed or severe proctoring signal threshold breach."
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-dark-bg border border-slate-300 dark:border-dark-border rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSelectedStudentForBan(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-border text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-border/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={banMutation.isPending}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-md"
            >
              {banMutation.isPending ? 'Applying Ban...' : 'Confirm Assessment Ban'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
