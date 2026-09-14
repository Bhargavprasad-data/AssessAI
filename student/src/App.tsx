import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/common/Sidebar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { StudentDashboard } from './pages/StudentDashboard';
import { ExamSession } from './pages/ExamSession';
import { ExamResults } from './pages/ExamResults';
import { MyResults } from './pages/MyResults';
import { ShieldAlert, LogOut } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

/* ── Loading ── */
const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center transition-colors duration-200">
    <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-wider uppercase">
      Authenticating Student...
    </span>
  </div>
);

/* ── Banned ── */
const BannedScreen: React.FC = () => {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full glass-panel rounded-3xl p-8 border border-rose-500/30 text-center space-y-4 shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
          <ShieldAlert className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Examination Access Revoked</h1>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Your student account has been placed under a security ban by platform administration.
        </p>
        {user?.ban_reason && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs text-left">
            <span className="font-semibold block uppercase tracking-wider text-[10px] text-rose-500 mb-1">Reason:</span>
            {user.ban_reason}
          </div>
        )}
        <button
          onClick={logout}
          className="w-full mt-4 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </div>
    </div>
  );
};

/* ── Student route guard ── */
const StudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_banned) return <BannedScreen />;
  if (user.role !== 'student') return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/* ── Root redirect ── */
const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_banned) return <BannedScreen />;
  if (user.role === 'student') return <Navigate to="/student/dashboard" replace />;
  return <Navigate to="/login" replace />;
};

/* ── Shell: sidebar anchor + scrollable content ── */
const StudentShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 print:h-auto print:overflow-visible print:bg-white print:text-slate-900 print:block">
    <Sidebar />
    <main className="flex-1 overflow-y-auto print:overflow-visible print:h-auto print:w-full print:block">
      {children}
    </main>
  </div>
);

/* ── ExamSession uses full-screen (no sidebar) ── */
const ExamShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    {children}
  </div>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected with sidebar */}
              <Route
                path="/student/dashboard"
                element={
                  <StudentRoute>
                    <StudentShell><StudentDashboard /></StudentShell>
                  </StudentRoute>
                }
              />
              <Route
                path="/student/attempts"
                element={
                  <StudentRoute>
                    <StudentShell><MyResults /></StudentShell>
                  </StudentRoute>
                }
              />
              <Route
                path="/student/results"
                element={
                  <StudentRoute>
                    <StudentShell><MyResults /></StudentShell>
                  </StudentRoute>
                }
              />
              <Route
                path="/student/attempts/:attemptId/results"
                element={
                  <StudentRoute>
                    <StudentShell><ExamResults /></StudentShell>
                  </StudentRoute>
                }
              />

              {/* Exam session — full screen, no sidebar to avoid distractions */}
              <Route
                path="/student/assessments/:assessmentId/take"
                element={
                  <StudentRoute>
                    <ExamShell><ExamSession /></ExamShell>
                  </StudentRoute>
                }
              />

              <Route
                path="/student"
                element={
                  <StudentRoute>
                    <Navigate to="/student/dashboard" replace />
                  </StudentRoute>
                }
              />

              {/* Fallback */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
