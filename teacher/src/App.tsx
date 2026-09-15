import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/common/Sidebar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { AssessmentBuilder } from './pages/AssessmentBuilder';
import { ManageAssessments } from './pages/ManageAssessments';
import AssessmentAnalyticsPage from './pages/AssessmentAnalytics';
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
      Authenticating Teacher...
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
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Account Access Revoked</h1>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Your teacher account has been suspended by system administration.
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

/* ── Teacher route guard ── */
const TeacherRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_banned) return <BannedScreen />;
  if (user.role !== 'teacher') return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/* ── Root redirect ── */
const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_banned) return <BannedScreen />;
  if (user.role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
  return <Navigate to="/login" replace />;
};

/* ── Shell: sidebar anchor + scrollable content ── */
const TeacherShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <Sidebar />
    <main className="flex-1 overflow-y-auto">
      {children}
    </main>
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
                path="/teacher/dashboard"
                element={
                  <TeacherRoute>
                    <TeacherShell><TeacherDashboard /></TeacherShell>
                  </TeacherRoute>
                }
              />
              <Route
                path="/teacher/assessments/new"
                element={
                  <TeacherRoute>
                    <TeacherShell><AssessmentBuilder /></TeacherShell>
                  </TeacherRoute>
                }
              />
              <Route
                path="/teacher/assessments/manage"
                element={
                  <TeacherRoute>
                    <TeacherShell><ManageAssessments /></TeacherShell>
                  </TeacherRoute>
                }
              />
              <Route
                path="/teacher/assessments/:assessmentId/edit"
                element={
                  <TeacherRoute>
                    <TeacherShell><AssessmentBuilder /></TeacherShell>
                  </TeacherRoute>
                }
              />
              <Route
                path="/teacher/assessments/:id/analytics"
                element={
                  <TeacherRoute>
                    <TeacherShell><AssessmentAnalyticsPage /></TeacherShell>
                  </TeacherRoute>
                }
              />
              <Route
                path="/teacher"
                element={
                  <TeacherRoute>
                    <Navigate to="/teacher/dashboard" replace />
                  </TeacherRoute>
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
