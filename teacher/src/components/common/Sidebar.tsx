import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  FilePlus,
  Layers,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  prefix?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      path: '/teacher/dashboard',          icon: BarChart3 },
  { label: 'Manage Tests',   path: '/teacher/assessments/manage', icon: Layers, prefix: true },
  { label: 'New Assessment', path: '/teacher/assessments/new',    icon: FilePlus  },
];

const SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.8 } as const;
const SIDEBAR_COLLAPSED = 64;
const SIDEBAR_EXPANDED  = 232;

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const isDark = theme === 'dark';

  if (!user) return null;

  const isActive = (item: NavItem) =>
    item.prefix
      ? location.pathname.startsWith(item.path)
      : location.pathname === item.path;

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative flex-shrink-0 h-screen" style={{ width: SIDEBAR_COLLAPSED }}>
      <motion.aside
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        animate={{ width: open ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED }}
        transition={SPRING}
        className={[
          'fixed top-0 left-0 h-screen z-50 overflow-hidden flex flex-col border-r',
          isDark
            ? 'bg-slate-950/95 border-white/8 shadow-2xl shadow-black/60'
            : 'bg-white/95 border-slate-200 shadow-2xl shadow-slate-200/80',
        ].join(' ')}
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* ── Brand ── */}
        <div
          className={['flex items-center gap-3 px-3.5 py-4 border-b', isDark ? 'border-white/8' : 'border-slate-100'].join(' ')}
          style={{ minHeight: 64 }}
        >
          <div
            className="relative flex-shrink-0 rounded-full border-2 border-brand-500/60 shadow-md shadow-brand-500/20 bg-gradient-to-tr from-brand-500/20 to-indigo-500/20 cursor-pointer"
            style={{ width: 38, height: 38 }}
            onClick={() => navigate('/teacher/dashboard')}
          >
            <img
              src="/logo.png"
              alt="AssessAI"
              className="w-full h-full object-contain rounded-full p-1.5"
              style={{ background: isDark ? '#0f172a' : '#fff' }}
            />
          </div>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="whitespace-nowrap overflow-hidden"
              >
                <span className="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500 dark:from-white dark:via-slate-200 dark:to-brand-300">
                  AssessAI
                </span>
                <span className={['block text-[10px] font-semibold uppercase tracking-widest', isDark ? 'text-sky-400' : 'text-sky-600'].join(' ')}>
                  Teacher Portal
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Nav Items ── */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-hidden px-2">
          {NAV_ITEMS.map(({ label, path, icon: Icon, prefix }) => {
            const active = isActive({ label, path, icon: Icon, prefix });
            return (
              <Link
                key={path}
                to={path}
                className={[
                  'group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150',
                  active
                    ? isDark ? 'bg-sky-600/15 text-sky-300' : 'bg-sky-500/10 text-sky-700'
                    : isDark ? 'text-slate-400 hover:bg-white/6 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
                style={{ minHeight: 44 }}
              >
                {active && (
                  <motion.span
                    layoutId="teacher-active-pill"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-sky-500"
                    transition={SPRING}
                  />
                )}
                <Icon className={['flex-shrink-0 w-5 h-5 transition-colors', active ? 'text-sky-500' : isDark ? 'text-slate-500 group-hover:text-white' : 'text-slate-400 group-hover:text-slate-700'].join(' ')} />
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
                <AnimatePresence>
                  {open && active && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="ml-auto"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* ── Bottom Controls ── */}
        <div className={['border-t px-2 py-3 space-y-0.5', isDark ? 'border-white/8' : 'border-slate-100'].join(' ')}>
          {/* Theme */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={[
              'group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors duration-150',
              isDark ? 'text-slate-400 hover:bg-white/6 hover:text-amber-400' : 'text-slate-500 hover:bg-slate-100 hover:text-brand-600',
            ].join(' ')}
            style={{ minHeight: 44 }}
          >
            {isDark ? <Sun className="flex-shrink-0 w-5 h-5 text-amber-400" /> : <Moon className="flex-shrink-0 w-5 h-5 text-brand-500" />}
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

          <div className={['h-px mx-2 my-1', isDark ? 'bg-white/6' : 'bg-slate-100'].join(' ')} />

          {/* User + Logout */}
          <div className={['flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors', isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'].join(' ')}>
            <div
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border"
              style={{
                background: isDark ? 'rgba(14,165,233,0.15)' : 'rgba(14,165,233,0.10)',
                borderColor: isDark ? 'rgba(14,165,233,0.35)' : 'rgba(14,165,233,0.25)',
                color: isDark ? '#7dd3fc' : '#0369a1',
              }}
            >
              {initials}
            </div>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p className={['text-xs font-semibold truncate leading-tight', isDark ? 'text-white' : 'text-slate-800'].join(' ')}>{user.name}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Teacher</p>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {open && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={logout}
                  title="Log Out"
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
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
