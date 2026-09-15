import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Code, Clock, Trash2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../api/client';
import type { AuditLogEntry } from '../types';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { AuditLogsSkeleton } from '../components/common/Skeleton';

export default function AuditLogViewer() {
  const navigate = useNavigate();

  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [selectedLogMetadata, setSelectedLogMetadata] = useState<{
    id: string;
    action: string;
    metadata: any;
  } | null>(null);

  const [logToDelete, setLogToDelete] = useState<{ id: string; action: string } | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  const {
    data: logs,
    isLoading,
    isError,
    refetch,
  } = useQuery<AuditLogEntry[]>({
    queryKey: ['auditLogs', actionFilter, targetTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (targetTypeFilter) params.append('target_type', targetTypeFilter);
      params.append('limit', '100');
      return apiFetch<AuditLogEntry[]>(`/api/admin/audit-logs?${params.toString()}`);
    },
    retry: true,
    retryDelay: 2500,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  const showSkeleton = isLoading || isError || !logs;

  const deleteLogMutation = useMutation({
    mutationFn: (logId: string) =>
      apiFetch(`/api/admin/audit-logs/${logId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      setLogToDelete(null);
    },
  });

  const clearAllLogsMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/audit-logs', { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      setShowClearAllModal(false);
    },
  });

  const inputCls =
    'w-full px-3 py-2 text-xs rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 ' +
    'bg-white dark:bg-slate-900/80 ' +
    'border border-slate-300 dark:border-slate-700 ' +
    'text-slate-900 dark:text-white ' +
    'placeholder-slate-400 dark:placeholder-slate-500';

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center text-xs font-semibold uppercase tracking-wider mb-2 transition-colors
              text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Admin Dashboard
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Audit Trail &amp; Forensic Logs
            </h1>
            <Badge variant="primary">Immutable</Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cryptographic ledger tracking administrative actions, ban enforcement, assessment lifecycle, and question pool mutations.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors
              border border-slate-300 dark:border-slate-700
              bg-white dark:bg-slate-800/80
              text-slate-700 dark:text-slate-300
              hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Audit Trail
          </button>

          <button
            onClick={() => setShowClearAllModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors
              border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20
              text-rose-700 dark:text-rose-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All Logs
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl backdrop-blur border
        bg-slate-100/70 dark:bg-slate-800/50
        border-slate-200 dark:border-slate-700/60">
        <div className="sm:col-span-6">
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by action (e.g. global_ban_applied, assessment_published)..."
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-6">
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All Target Types</option>
            <option value="user">User</option>
            <option value="assessment">Assessment</option>
            <option value="question">Question</option>
            <option value="assessment_ban">Assessment Ban</option>
          </select>
        </div>
      </div>

      {/* ── Logs Table ── */}
      {showSkeleton ? (
        <AuditLogsSkeleton />
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider font-semibold border-b
                bg-slate-100 dark:bg-slate-800/80
                text-slate-500 dark:text-slate-400
                border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Action</th>
                  <th className="px-4 py-3.5">Target Type</th>
                  <th className="px-4 py-3.5">Actor ID</th>
                  <th className="px-4 py-3.5">Target ID</th>
                  <th className="px-4 py-3.5 text-right">Metadata</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50
                bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300">
                {(logs || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      No audit records match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  (logs || []).map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded
                        bg-slate-100 dark:bg-slate-800
                        border border-slate-200 dark:border-slate-700
                        text-slate-700 dark:text-slate-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        variant={
                          log.target_type === 'user'
                            ? 'primary'
                            : log.target_type === 'assessment'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {log.target_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {log.actor_user_id ? (
                        <span title={log.actor_user_id}>{log.actor_user_id.slice(0, 8)}...</span>
                      ) : (
                        <span className="text-slate-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <span title={log.target_id}>{log.target_id.slice(0, 8)}...</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <button
                          onClick={() =>
                            setSelectedLogMetadata({
                              id: log.id,
                              action: log.action,
                              metadata: log.metadata,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors
                            bg-slate-100 dark:bg-slate-800
                            border border-slate-200 dark:border-slate-700
                            text-slate-600 dark:text-slate-300
                            hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <Code className="w-3 h-3 text-brand-500" />
                          View JSON
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">–</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setLogToDelete({ id: log.id, action: log.action })}
                        className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                        title="Delete Audit Log Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}

      {/* ── JSON Metadata Viewer Modal ── */}
      <Modal
        isOpen={!!selectedLogMetadata}
        onClose={() => setSelectedLogMetadata(null)}
        title={`Audit Event Details: ${selectedLogMetadata?.action || ''}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cryptographically recorded event payload snapshot:
          </p>
          <div className="p-3.5 rounded-lg border overflow-x-auto
            bg-slate-50 dark:bg-slate-950
            border-slate-200 dark:border-slate-700">
            <pre className="font-mono text-xs text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap">
              {JSON.stringify(selectedLogMetadata?.metadata, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setSelectedLogMetadata(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors
                bg-slate-100 dark:bg-slate-800
                border border-slate-200 dark:border-slate-700
                text-slate-700 dark:text-white
                hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Single Log Modal ── */}
      <Modal
        isOpen={!!logToDelete}
        onClose={() => setLogToDelete(null)}
        title="Confirm Audit Log Deletion"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
            <p>
              Are you sure you want to delete this audit log entry (<strong className="font-mono text-slate-900 dark:text-white">{logToDelete?.action}</strong>)? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setLogToDelete(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => logToDelete && deleteLogMutation.mutate(logToDelete.id)}
              disabled={deleteLogMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all disabled:opacity-50"
            >
              {deleteLogMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Clear All Audit Logs Modal ── */}
      <Modal
        isOpen={showClearAllModal}
        onClose={() => setShowClearAllModal(false)}
        title="Clear All Audit Trail Logs"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
            <p>
              Are you sure you want to clear <strong>ALL forensic audit logs</strong>? This will permanently erase all recorded audit history and cannot be recovered.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowClearAllModal(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => clearAllLogsMutation.mutate()}
              disabled={clearAllLogsMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all disabled:opacity-50"
            >
              {clearAllLogsMutation.isPending ? 'Clearing All...' : 'Permanently Clear All Logs'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
