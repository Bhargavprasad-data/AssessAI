import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { LogOut, User as UserIcon, Users, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b dark:border-white/10 border-slate-200 dark:bg-slate-950/85 bg-white/85 backdrop-blur-xl transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link to="/admin/users" className="flex items-center space-x-3 group">
            <div className="relative p-0.5 rounded-full border-2 border-brand-500/60 dark:border-brand-400/70 shadow-md shadow-brand-500/20 bg-gradient-to-tr from-brand-500/20 to-indigo-500/20 group-hover:scale-105 transition-transform">
              <img
                src="/logo.png"
                alt="AssessAI Logo"
                className="h-9 w-9 object-contain rounded-full p-1 dark:bg-slate-900 bg-white border border-brand-500/30 dark:border-white/10"
              />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-slate-400 from-slate-900 via-slate-800 to-brand-700 bg-clip-text text-transparent">
                AssessAI
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-300 border border-brand-500/30">
                Admin Portal
              </span>
            </div>
          </Link>

          {/* Admin Navigation Links */}
          <nav className="flex items-center space-x-1">
            <Link
              to="/admin/users"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                isActive('/admin/users')
                  ? 'dark:bg-white/10 bg-brand-500/15 dark:text-white text-brand-700 shadow-sm'
                  : 'dark:text-slate-400 text-slate-600 dark:hover:text-white hover:text-slate-900 dark:hover:bg-white/5 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>User Management</span>
            </Link>
            <Link
              to="/admin/audit-logs"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                isActive('/admin/audit-logs')
                  ? 'dark:bg-white/10 bg-brand-500/15 dark:text-white text-brand-700 shadow-sm'
                  : 'dark:text-slate-400 text-slate-600 dark:hover:text-white hover:text-slate-900 dark:hover:bg-white/5 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit Logs</span>
            </Link>
          </nav>
        </div>

        {/* Right Controls: Theme Toggle & User Info & Logout */}
        <div className="flex items-center space-x-2.5">
          <ThemeToggle />

          <div className="flex items-center space-x-2.5 dark:bg-white/5 bg-slate-100 px-3 py-1.5 rounded-xl dark:border-white/5 border-slate-200">
            <div className="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-600 dark:text-brand-300 flex items-center justify-center font-semibold text-xs border border-brand-500/30">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold dark:text-white text-slate-800 leading-tight">{user.name}</p>
              <p className="text-[10px] font-medium dark:text-slate-400 text-slate-500 uppercase tracking-wider">Admin</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-xl dark:text-slate-400 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
