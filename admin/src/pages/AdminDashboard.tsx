import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  UserPlus, AlertOctagon, Search, FileText, Ban, CheckCircle2, Pencil, Trash2, AlertTriangle, Eye, EyeOff
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type { User, UserRole } from '../types';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { AdminTableSkeleton, FilterBarSkeleton } from '../components/common/Skeleton';

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [bannedFilter, setBannedFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Ban Modal state
  const [selectedUserForBan, setSelectedUserForBan] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banError, setBanError] = useState<string | null>(null);

  // Edit Modal state
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('student');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Delete Modal state
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<User | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  // Create Admin Modal state
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);

  // Fetch Users – continuous auto-polling and retries ensure shimmer skeleton stays active whenever backend is unavailable
  const { data: users, isLoading, isError } = useQuery<User[]>({
    queryKey: ['adminUsers', roleFilter, bannedFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (bannedFilter !== '') params.append('is_banned', bannedFilter);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return apiFetch<User[]>(`/api/admin/users${queryString}`);
    },
    retry: true,
    retryDelay: 2500,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Continuous shimmer skeleton when loading, offline, erroring, or data not yet available
  const showSkeleton = isLoading || isError || !users;

  // Apply Global Ban Mutation
  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      return apiFetch(`/api/admin/users/${userId}/ban?reason=${encodeURIComponent(reason)}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setSelectedUserForBan(null);
      setBanReason('');
      setBanError(null);
    },
    onError: (err: any) => {
      setBanError(err.message || 'Failed to apply global ban');
    },
  });

  // Revoke Global Ban Mutation
  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiFetch(`/api/admin/users/${userId}/unban`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
  });

  // Edit User Mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { name?: string; email?: string; role?: string; password?: string } }) => {
      return apiFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setSelectedUserForEdit(null);
      setEditUserError(null);
    },
    onError: (err: any) => {
      setEditUserError(err.message || 'Failed to update user');
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setSelectedUserForDelete(null);
      setDeleteUserError(null);
    },
    onError: (err: any) => {
      setDeleteUserError(err.message || 'Failed to delete user');
    },
  });

  // Create Admin Mutation
  const createAdminMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; role: string }) => {
      return apiFetch('/api/admin/users/admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setIsCreateAdminOpen(false);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setCreateAdminError(null);
    },
    onError: (err: any) => {
      setCreateAdminError(err.message || 'Failed to create admin user');
    },
  });

  const handleApplyBan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForBan || !banReason.trim()) {
      setBanError('A valid justification is required to apply a platform-wide ban.');
      return;
    }
    banMutation.mutate({ userId: selectedUserForBan.id, reason: banReason.trim() });
  };

  const handleOpenEditModal = (user: User) => {
    setSelectedUserForEdit(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPassword('');
    setEditUserError(null);
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;
    if (!editName.trim() || !editEmail.trim()) {
      setEditUserError('Name and email are required.');
      return;
    }
    const payload: { name: string; email: string; role: string; password?: string } = {
      name: editName.trim(),
      email: editEmail.trim(),
      role: editRole,
    };
    if (editPassword.trim()) {
      if (editPassword.length < 8) {
        setEditUserError('New password must be at least 8 characters.');
        return;
      }
      payload.password = editPassword.trim();
    }
    updateUserMutation.mutate({ userId: selectedUserForEdit.id, data: payload });
  };

  const handleOpenDeleteModal = (user: User) => {
    setSelectedUserForDelete(user);
    setDeleteUserError(null);
  };

  const handleDeleteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForDelete) return;
    deleteUserMutation.mutate(selectedUserForDelete.id);
  };

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminEmail.trim() || newAdminPassword.length < 8) {
      setCreateAdminError('All fields required. Password must be at least 8 characters.');
      return;
    }
    createAdminMutation.mutate({
      name: newAdminName.trim(),
      email: newAdminEmail.trim(),
      password: newAdminPassword,
      role: 'admin',
    });
  };

  // Filtered Users List
  const filteredUsers = (users || []).filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Shared input class
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Platform Administration
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage user roles, platform-wide global bans, and monitor cryptographic audit trails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/audit-logs"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors
              border border-slate-300 dark:border-slate-700
              bg-white dark:bg-slate-800/80
              text-slate-700 dark:text-slate-300
              hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <FileText className="w-4 h-4 text-brand-500" />
            Audit Logs
          </Link>

          <button
            onClick={() => setIsCreateAdminOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-md transition-all
              bg-brand-600 hover:bg-brand-500 text-white"
          >
            <UserPlus className="w-4 h-4" />
            New Admin
          </button>
        </div>
      </div>

      {/* ── Filter & Search Bar ── */}
      {showSkeleton ? (
        <FilterBarSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl backdrop-blur border
          bg-slate-100/70 dark:bg-slate-800/50
          border-slate-200 dark:border-slate-700/60">

          {/* Search */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name or email..."
              className={`${inputCls} pl-9`}
            />
          </div>

          {/* Role filter */}
          <div className="sm:col-span-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="sm:col-span-2">
            <select
              value={bannedFilter}
              onChange={(e) => setBannedFilter(e.target.value)}
              className={inputCls}
            >
              <option value="">All Statuses</option>
              <option value="false">Active Only</option>
              <option value="true">Banned Only</option>
            </select>
          </div>

          {/* Refresh */}
          {/* <div className="sm:col-span-1 flex items-center justify-end">
            <button
              onClick={() => refetch()}
              title="Refresh list"
              className={`w-full h-full flex items-center justify-center p-2 rounded-lg transition-colors
                border border-slate-300 dark:border-slate-700
                text-slate-500 dark:text-slate-400
                hover:text-slate-900 dark:hover:text-white
                hover:bg-slate-200 dark:hover:bg-slate-700
                ${isFetching ? 'animate-spin pointer-events-none' : ''}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div> */}
        </div>
      )}

      {/* ── Users Table ── */}
      {showSkeleton ? (
        <AdminTableSkeleton />
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider font-semibold border-b
              bg-slate-100 dark:bg-slate-800/80
              text-slate-500 dark:text-slate-400
              border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5 text-center">Platform Status</th>
                  <th className="px-4 py-3.5">Created Date</th>
                  <th className="px-4 py-3.5">Ban Reason</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50
              bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No users matching the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{user.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{user.email}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={
                            user.role === 'admin'
                              ? 'danger'
                              : user.role === 'teacher'
                                ? 'primary'
                                : 'default'
                          }
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {user.is_banned ? (
                          <Badge variant="danger">Globally Banned</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-[11px] max-w-xs truncate">
                        {user.ban_reason || '–'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit option */}
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors
                            border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300
                            hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Edit User Details"
                          >
                            <Pencil className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                            Edit
                          </button>

                          {/* Delete option */}
                          <button
                            onClick={() => handleOpenDeleteModal(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors
                            border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300
                            hover:bg-rose-500/20"
                            title="Delete User"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>

                          {/* Ban / Revoke Ban option */}
                          {user.role === 'admin' ? (
                            <span className="text-[11px] text-slate-400 italic px-1">Protected</span>
                          ) : user.is_banned ? (
                            <button
                              onClick={() => unbanMutation.mutate(user.id)}
                              disabled={unbanMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors
                              border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300
                              hover:bg-emerald-500/20"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Revoke Ban
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedUserForBan(user);
                                setBanReason('');
                                setBanError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors
                              border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300
                              hover:bg-amber-500/20"
                            >
                              <Ban className="w-3 h-3" />
                              Global Ban
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

      {/* ── Edit User Modal ── */}
      <Modal
        isOpen={!!selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
        title={`Edit User: ${selectedUserForEdit?.name || ''}`}
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          {editUserError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
              {editUserError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={inputCls}
              placeholder="e.g. John Doe"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className={inputCls}
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Role *
            </label>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRole)}
              className={inputCls}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              New Password (Optional)
            </label>
            <div className="relative">
              <input
                type={showEditPassword ? 'text' : 'password'}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className={`${inputCls} pr-10`}
                placeholder="Leave blank to keep unchanged (min 8 chars)"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword(!showEditPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md focus:outline-none"
                aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSelectedUserForEdit(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors
                border border-slate-300 dark:border-slate-700
                text-slate-700 dark:text-slate-300
                hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateUserMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md
                bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete User Confirmation Modal ── */}
      <Modal
        isOpen={!!selectedUserForDelete}
        onClose={() => setSelectedUserForDelete(null)}
        title="Delete User Account"
      >
        <form onSubmit={handleDeleteUser} className="space-y-4">
          <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs leading-relaxed space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Permanent Account Deletion
            </div>
            <p>
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{selectedUserForDelete?.name}</strong> (<code className="text-slate-700 dark:text-slate-300">{selectedUserForDelete?.email}</code>)?
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-300">
              This action will permanently delete the user account and cannot be undone.
            </p>
          </div>

          {deleteUserError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
              {deleteUserError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSelectedUserForDelete(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors
                border border-slate-300 dark:border-slate-700
                text-slate-700 dark:text-slate-300
                hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleteUserMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md
                bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Global Ban Confirmation Modal ── */}
      <Modal
        isOpen={!!selectedUserForBan}
        onClose={() => setSelectedUserForBan(null)}
        title="Apply Platform-Wide Global Ban"
      >
        <form onSubmit={handleApplyBan} className="space-y-4">
          <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs leading-relaxed space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 text-rose-500" />
              Critical Force-Termination Warning
            </div>
            <p>
              Applying a global ban to{' '}
              <strong className="text-slate-900 dark:text-white">{selectedUserForBan?.name}</strong> will:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Block all future login access.</li>
              <li>
                <strong>Immediately force-terminate</strong> any active attempts with status{' '}
                <code className="bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded text-rose-700 dark:text-rose-300">TERMINATED</code>.
              </li>
              <li>Freeze all timers and record scores up to the point of termination.</li>
            </ul>
          </div>

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
              placeholder="e.g., Confirmed malicious intrusion or egregious integrity violation."
              className="w-full px-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/40
                bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700
                text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSelectedUserForBan(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors
                border border-slate-300 dark:border-slate-700
                text-slate-700 dark:text-slate-300
                hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={banMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md
                bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
            >
              {banMutation.isPending ? 'Enforcing Ban...' : 'Enforce Global Ban'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Create Admin Modal ── */}
      <Modal
        isOpen={isCreateAdminOpen}
        onClose={() => setIsCreateAdminOpen(false)}
        title="Create New Administrator Account"
      >
        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Per the security specification, new administrators can only be created by an authenticated administrator.
          </p>

          {createAdminError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
              {createAdminError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={newAdminName}
              onChange={(e) => setNewAdminName(e.target.value)}
              placeholder="e.g., Sarah Connor"
              className="w-full px-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40
                bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700
                text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40
                bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700
                text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Password (Min 8 Characters) *
            </label>
            <div className="relative">
              <input
                type={showNewAdminPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-3 pr-10 py-2 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40
                  bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700
                  text-slate-900 dark:text-white placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowNewAdminPassword(!showNewAdminPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md focus:outline-none"
                aria-label={showNewAdminPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showNewAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateAdminOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors
                border border-slate-300 dark:border-slate-700
                text-slate-700 dark:text-slate-300
                hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAdminMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md
                bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {createAdminMutation.isPending ? 'Creating Account...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

