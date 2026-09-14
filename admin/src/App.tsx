import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/common/Sidebar';
import { Login } from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AuditLogViewer from './pages/AuditLogViewer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/* ── Loading screen ── */
const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center transition-colors duration-200">
    <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-wider uppercase">
      Authenticating Administrator...
    </span>
  </div>
);

/* ── Protected admin route ── */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/* ── Root redirect ── */
const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/users" replace />;
  return <Navigate to="/login" replace />;
};

/* ── Shell layout: sidebar + content ── */
const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    {/* Fixed-width sidebar anchor — content never shifts */}
    <Sidebar />
    {/* Scrollable content area */}
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
              <Route path="/login" element={<Login />} />

              {/* Protected — wrapped in sidebar shell */}
              <Route
                path="/admin/users"
                element={
                  <AdminRoute>
                    <AdminShell>
                      <AdminDashboard />
                    </AdminShell>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/audit-logs"
                element={
                  <AdminRoute>
                    <AdminShell>
                      <AuditLogViewer />
                    </AdminShell>
                  </AdminRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Navigate to="/admin/users" replace />
                  </AdminRoute>
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
