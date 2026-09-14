import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */
interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'User Management', path: '/admin/users',       icon: Users        },
  { label: 'Audit Logs',      path: '/admin/audit-logs',  icon: ShieldCheck  },
];

/* ─────────────────────────────────────────────────────────────────
   Spring config – matches JioStar silky feel
───────────────────────────────────────────────────────────────── */
const SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.8 } as const;

const SIDEBAR_COLLAPSED = 64;   // px  (w-16)
const SIDEBAR_EXPANDED  = 232;  // px

/* ─────────────────────────────────────────────────────────────────
   Sidebar Component
───────────────────────────────────────────────────────────────── */
export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const isDark = theme === 'dark';

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;

  /* ── avatar initials ── */
  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    /* Fixed-width rail – NEVER moves, so right-side content never shifts */
    <div
      className="relative flex-shrink-0 h-screen"
      style={{ width: SIDEBAR_COLLAPSED }}
    >
      {/* ── Floating panel that animates on hover ── */}
      <motion.aside
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        animate={{ width: open ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED }}
        transition={SPRING}
        className={[
          'fixed top-0 left-0 h-screen z-50 overflow-hidden',
          'flex flex-col',
          'border-r',
          isDark
            ? 'bg-slate-950/95 border-white/8 shadow-2xl shadow-black/60'
            : 'bg-white/95 border-slate-200 shadow-2xl shadow-slate-200/80',
        ].join(' ')}
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* ───── Logo / Brand ───── */}
        <div
          className={[
            'flex items-center gap-3 px-3.5 py-4 border-b',
            isDark ? 'border-white/8' : 'border-slate-100',
          ].join(' ')}
          style={{ minHeight: 64 }}
        >
          {/* Logo circle */}
          <div
            className="relative flex-shrink-0 rounded-full border-2 border-brand-500/60 shadow-md shadow-brand-500/20 bg-gradient-to-tr from-brand-500/20 to-indigo-500/20 cursor-pointer"
            style={{ width: 38, height: 38 }}
            onClick={() => navigate('/admin/users')}
          >
            <img
              src="/logo.png"
              alt="AssessAI"
              className="w-full h-full object-contain rounded-full p-1.5"
              style={{ background: isDark ? '#0f172a' : '#fff' }}
            />
          </div>

          {/* Brand name – fades in with sidebar */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="whitespace-nowrap overflow-hidden"
              >
                <span
                  className={[
                    'font-extrabold text-base tracking-tight bg-clip-text text-transparent',
                    'bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500',
                    'dark:from-white dark:via-slate-200 dark:to-brand-300',
                  ].join(' ')}
                >
                  AssessAI
                </span>
                <span
                  className={[
                    'block text-[10px] font-semibold uppercase tracking-widest',
                    isDark ? 'text-brand-400' : 'text-brand-600',
                  ].join(' ')}
                >
                  Admin Portal
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ───── Nav Items ───── */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-hidden px-2">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={[
                  'group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5',
                  'transition-colors duration-150',
                  active
                    ? isDark
                      ? 'bg-brand-600/20 text-brand-300'
                      : 'bg-brand-500/12 text-brand-700'
                    : isDark
                    ? 'text-slate-400 hover:bg-white/6 hover:text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
                style={{ minHeight: 44 }}
              >
                {/* Active indicator bar */}
                {active && (
                  <motion.span
                    layoutId="active-pill"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-brand-500"
                    transition={SPRING}
                  />
                )}

                {/* Icon */}
                <Icon
                  className={[
                    'flex-shrink-0 w-5 h-5 transition-colors',
                    active
                      ? 'text-brand-500'
                      : isDark
                      ? 'text-slate-500 group-hover:text-white'
                      : 'text-slate-400 group-hover:text-slate-700',
                  ].join(' ')}
                />

                {/* Label – slides in */}
                <AnimatePresence>
                  {open && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.15, delay: 0.04 }}
                      className="whitespace-nowrap text-sm font-semibold overflow-hidden"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Chevron hint */}
                <AnimatePresence>
                  {open && active && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="ml-auto"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-brand-400" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* ───── Bottom Controls ───── */}
        <div
          className={[
            'border-t px-2 py-3 space-y-0.5',
            isDark ? 'border-white/8' : 'border-slate-100',
          ].join(' ')}
        >
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={[
              'group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors duration-150',
              isDark
                ? 'text-slate-400 hover:bg-white/6 hover:text-amber-400'
                : 'text-slate-500 hover:bg-slate-100 hover:text-brand-600',
            ].join(' ')}
            style={{ minHeight: 44 }}
          >
            {isDark ? (
              <Sun className="flex-shrink-0 w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="flex-shrink-0 w-5 h-5 text-brand-500" />
            )}
            <AnimatePresence>
              {open && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap text-sm font-semibold overflow-hidden"
                >
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Divider */}
          <div className={['h-px mx-2 my-1', isDark ? 'bg-white/6' : 'bg-slate-100'].join(' ')} />

          {/* User avatar + logout */}
          <div
            className={[
              'flex items-center gap-3 px-2.5 py-2 rounded-xl',
              isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50',
              'transition-colors group',
            ].join(' ')}
          >
            {/* Avatar */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border"
              style={{
                background: isDark ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.10)',
                borderColor: isDark ? 'rgba(124,58,237,0.35)' : 'rgba(124,58,237,0.25)',
                color: isDark ? '#a78bfa' : '#6d28d9',
              }}
            >
              {initials}
            </div>

            {/* Name + role */}
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p
                    className={[
                      'text-xs font-semibold truncate leading-tight',
                      isDark ? 'text-white' : 'text-slate-800',
                    ].join(' ')}
                  >
                    {user.name}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Admin
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Logout btn */}
            <AnimatePresence>
              {open && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={logout}
                  title="Log Out"
                  className={[
                    'flex-shrink-0 p-1.5 rounded-lg transition-colors',
                    'text-slate-400 hover:text-rose-500 hover:bg-rose-500/10',
                  ].join(' ')}
                >
                  <LogOut className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>
    </div>
  );
};
