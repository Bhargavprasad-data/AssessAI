import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { UserPlus, AlertCircle, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await register(name, email, password, 'admin');
      navigate('/admin/users');
    } catch (err: any) {
      setError(err.message || 'Administrator registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating Theme Toggle in Top Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <ThemeToggle showLabel={false} />
      </div>

      {/* Ambient background glow orbs */}
      <div className="absolute w-96 h-96 rounded-full bg-brand-500/10 dark:bg-brand-600/15 blur-3xl pointer-events-none -top-20 -left-20 animate-pulse-subtle" />
      <div className="absolute w-96 h-96 rounded-full bg-indigo-500/10 dark:bg-indigo-600/15 blur-3xl pointer-events-none -bottom-20 -right-20 animate-pulse-subtle" />

      <div className="w-full max-w-md relative z-10 my-6">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="relative p-1 rounded-full border-2 border-brand-500/60 dark:border-brand-400/70 shadow-lg shadow-brand-500/25 bg-gradient-to-tr from-brand-500/20 to-indigo-500/20">
              <img
                src="/logo.png"
                alt="AssessAI Logo"
                className="h-14 w-14 sm:h-16 sm:w-16 object-contain rounded-full p-2 dark:bg-slate-900 bg-white border border-brand-500/30 dark:border-white/10"
              />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight dark:text-white text-slate-900">
            Administrator Registration
          </h1>
          <p className="dark:text-slate-400 text-slate-500 text-xs sm:text-sm mt-1.5">
            Provision system administrator credentials for platform governance
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl dark:border-white/10 border-slate-200">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Role Badge */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-300 text-slate-600 mb-1.5">
                Account Type
              </label>
              <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center space-x-3 text-left">
                <div className="p-2 rounded-lg bg-brand-500/20 text-brand-600 dark:text-brand-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold dark:text-white text-slate-900 uppercase tracking-wider">
                    System Administrator Account
                  </span>
                  <p className="text-[11px] dark:text-slate-400 text-slate-500 mt-0.5">
                    User management, global security bans & forensic audit logs
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-300 text-slate-600 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Admin Name"
                className="w-full px-4 py-2.5 rounded-xl dark:bg-slate-900/60 bg-white border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-sm shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-300 text-slate-600 mb-1.5">
                Admin Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@proctor.ai"
                className="w-full px-4 py-2.5 rounded-xl dark:bg-slate-900/60 bg-white border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-sm shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-300 text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••••• (min. 8 characters)"
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl dark:bg-slate-900/60 bg-white border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-sm shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-md focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all disabled:opacity-50 flex items-center justify-center space-x-2 text-sm mt-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Creating Account...' : 'Complete Admin Registration'}</span>
            </button>
          </form>

          <div className="mt-5 text-center text-xs dark:text-slate-400 text-slate-500">
            Already have an administrator account?{' '}
            <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:text-brand-500 font-semibold underline">
              Sign In to Admin Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
