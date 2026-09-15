import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiFetch } from '../api/client';
import type { AttemptResults, AttemptAnswerReview } from '../types';
import { DifficultyBadge } from '../components/common/Badge';
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Trophy,
  Award,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Printer,
  Search,
  Filter,
  Sparkles,
  Zap,
  BarChart3,
  BookOpen,
  RotateCcw,
  Check,
  X
} from 'lucide-react';

export const ExamResults: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [results, setResults] = useState<AttemptResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect' | 'easy' | 'medium' | 'hard'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AttemptResults>(`/api/student/attempts/${attemptId}/results`);
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load assessment results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [attemptId]);

  // Compute stats
  const stats = useMemo(() => {
    if (!results) return null;
    const total = results.total_answers || 0;
    const correct = results.correct_answers || 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Total and avg duration
    let durationFormatted = 'N/A';
    if (results.started_at && results.submitted_at) {
      const diffMs = new Date(results.submitted_at).getTime() - new Date(results.started_at).getTime();
      if (diffMs > 0) {
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        durationFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }
    }

    const avgTimeMs = results.answers_breakdown && results.answers_breakdown.length > 0
      ? Math.round(
          results.answers_breakdown.reduce((acc, a) => acc + (a.response_time_ms || 0), 0) /
          results.answers_breakdown.length
        )
      : 0;
    const avgTimeSec = (avgTimeMs / 1000).toFixed(1);

    // Performance grade
    let grade = { label: 'Good Effort', color: 'from-amber-500 to-orange-500', icon: Award, desc: 'Solid foundation, room to level up.' };
    if (results.status === 'terminated') {
      grade = { label: 'Terminated', color: 'from-rose-600 to-red-600', icon: AlertTriangle, desc: 'Attempt was closed due to policy breach or timeout.' };
    } else if (accuracy >= 85) {
      grade = { label: 'Outstanding Mastery', color: 'from-emerald-500 to-teal-500', icon: Trophy, desc: 'Exceptional performance across all difficulty tiers!' };
    } else if (accuracy >= 70) {
      grade = { label: 'Great Achievement', color: 'from-brand-500 to-indigo-500', icon: Award, desc: 'Strong grasp of core concepts and problem solving.' };
    } else if (accuracy >= 50) {
      grade = { label: 'Passing Performance', color: 'from-blue-500 to-cyan-500', icon: Sparkles, desc: 'Met minimum threshold with consistent answers.' };
    }

    return { total, correct, accuracy, durationFormatted, avgTimeSec, grade };
  }, [results]);

  // Filter breakdown
  const filteredQuestions = useMemo(() => {
    if (!results?.answers_breakdown) return [];
    return results.answers_breakdown.filter((q: AttemptAnswerReview) => {
      // Filter by type
      if (filterType === 'correct' && !q.is_correct) return false;
      if (filterType === 'incorrect' && q.is_correct) return false;
      if (['easy', 'medium', 'hard'].includes(filterType) && q.difficulty.toLowerCase() !== filterType) return false;

      // Filter by search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = q.question_text.toLowerCase().includes(query);
        const matchesOptions = q.options.some(opt => opt.toLowerCase().includes(query));
        return matchesText || matchesOptions;
      }
      return true;
    });
  }, [results, filterType, searchQuery]);

  // Counts for filters
  const filterCounts = useMemo(() => {
    const list = results?.answers_breakdown || [];
    return {
      all: list.length,
      correct: list.filter(q => q.is_correct).length,
      incorrect: list.filter(q => !q.is_correct).length,
      easy: list.filter(q => q.difficulty?.toLowerCase() === 'easy').length,
      medium: list.filter(q => q.difficulty?.toLowerCase() === 'medium').length,
      hard: list.filter(q => q.difficulty?.toLowerCase() === 'hard').length,
    };
  }, [results]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 dark:bg-white/10 rounded-lg"></div>
        <div className="h-64 bg-slate-200 dark:bg-white/10 rounded-3xl"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-white/10 rounded-2xl"></div>
          ))}
        </div>
        <div className="space-y-4 pt-4">
          <div className="h-8 w-60 bg-slate-200 dark:bg-white/10 rounded-lg"></div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-slate-200 dark:bg-white/10 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Results Temporarily Unavailable</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-8 leading-relaxed">
          {error || 'We could not retrieve the details for this assessment attempt.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={fetchResults}
            className="py-2.5 px-5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-500/20 flex items-center space-x-2 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <button
            onClick={() => navigate('/student/attempts')}
            className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            My Results History
          </button>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="py-2.5 px-5 rounded-xl border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold transition-all cursor-pointer"
          >
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((stats?.accuracy || 0) / 100) * circumference;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 relative">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Assessments</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center space-x-1.5 py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
            title="Print or Save Report as PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>

          <button
            onClick={() => navigate('/student/attempts')}
            className="inline-flex items-center space-x-1.5 py-2 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all cursor-pointer"
          >
            <span>All My Results</span>
          </button>
        </div>
      </div>

      {/* Hero Performance Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-white/10 shadow-2xl mb-8 relative overflow-hidden bg-gradient-to-br from-white/90 via-slate-50/70 to-brand-50/20 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-brand-950/20">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Title & Performance Grade */}
          <div className="space-y-3 text-center lg:text-left flex-1">
            <div className="inline-block px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-700 dark:text-brand-300 text-xs font-bold">
              <span>Assessment Performance Report</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {results.assessment_title}
            </h1>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-1">
              <span className={`inline-flex items-center px-3 py-1 rounded-xl bg-gradient-to-r ${stats?.grade.color} text-white text-xs font-bold shadow-md`}>
                <span>{stats?.grade.label}</span>
              </span>

              <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-white/5">
                Outcome: <strong className="text-slate-800 dark:text-slate-200">{results.completion_reason?.replace(/_/g, ' ') || results.status}</strong>
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
              {stats?.grade.desc}
            </p>
          </div>

          {/* Accuracy Gauge & Score Display */}
          <div className="flex items-center gap-6 bg-white/80 dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-lg flex-shrink-0">
            {/* SVG Circular Progress */}
            <div className="relative flex items-center justify-center w-28 h-28">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  className="stroke-slate-200 dark:stroke-white/10"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  className="stroke-brand-500 transition-all duration-1000 ease-out"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.accuracy}%
                </span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Accuracy
                </span>
              </div>
            </div>

            <div className="h-16 w-[1px] bg-slate-200 dark:bg-white/10"></div>

            {/* Score & Ratio */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Final Weighted Score
              </span>
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600 dark:from-brand-400 dark:to-indigo-300 block">
                {results.final_score.toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                {stats?.correct} of {stats?.total} questions correct
              </span>
            </div>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-8 pt-6 border-t border-slate-200/80 dark:border-white/10">
          <div className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Peak Difficulty</span>
              <div className="mt-0.5">
                <DifficultyBadge difficulty={results.highest_difficulty_reached} size="sm" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Avg Response Time</span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">{stats?.avgTimeSec}s / q</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Total Duration</span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">{stats?.durationFormatted}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200/70 dark:border-white/5 flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Proctoring Status</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">Verified Authentic</span>
            </div>
          </div>
        </div>
      </div>

      {/* Answers Review Section */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-brand-500" />
              <span>Question-by-Question Review</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review your answers, correct options, and time taken per question.
            </p>
          </div>

          {/* Ultra-Smooth Expandable Search Bar with Hover-to-Open */}
          <motion.div
            initial={false}
            animate={{ width: isSearchOpen || searchQuery ? 260 : 135 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              mass: 0.6,
            }}
            onMouseEnter={() => setIsSearchOpen(true)}
            onMouseLeave={() => {
              if (!searchQuery.trim() && document.activeElement !== searchInputRef.current) {
                setIsSearchOpen(false);
              }
            }}
            onClick={() => {
              setIsSearchOpen(true);
              searchInputRef.current?.focus();
            }}
            className={`relative flex items-center h-[38px] rounded-xl border transition-colors shadow-xs overflow-hidden print:hidden ${
              isSearchOpen || searchQuery
                ? 'border-brand-500/60 dark:border-brand-400/60 bg-white dark:bg-slate-900/90 shadow-md ring-2 ring-brand-500/20 cursor-text'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer'
            }`}
          >
            <div className="absolute left-3.5 flex items-center pointer-events-none z-10">
              <Search className={`w-4 h-4 transition-colors duration-200 ${isSearchOpen || searchQuery ? 'text-brand-500' : 'text-slate-400 dark:text-slate-500'}`} />
            </div>

            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search in questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchOpen(true)}
              onBlur={() => {
                if (!searchQuery.trim()) {
                  setIsSearchOpen(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (searchQuery) setSearchQuery('');
                  setIsSearchOpen(false);
                  searchInputRef.current?.blur();
                }
              }}
              className={`w-full h-full pl-10 pr-3.5 text-xs bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400 transition-opacity duration-200 ${
                isSearchOpen || searchQuery ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            />

            {!isSearchOpen && !searchQuery && (
              <span className="absolute left-9 text-xs font-semibold text-slate-700 dark:text-slate-300 pointer-events-none select-none whitespace-nowrap">
                Search Questions
              </span>
            )}
          </motion.div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {[
            { id: 'all', label: 'All Questions', count: filterCounts.all },
            { id: 'correct', label: 'Correct', count: filterCounts.correct, icon: CheckCircle2, activeColor: 'bg-emerald-600 text-white' },
            { id: 'incorrect', label: 'Incorrect', count: filterCounts.incorrect, icon: XCircle, activeColor: 'bg-rose-600 text-white' },
            { id: 'easy', label: 'Easy', count: filterCounts.easy },
            { id: 'medium', label: 'Medium', count: filterCounts.medium },
            { id: 'hard', label: 'Hard', count: filterCounts.hard },
          ].map((pill) => {
            const isActive = filterType === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setFilterType(pill.id as any)}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  isActive
                    ? pill.activeColor || 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {pill.icon && <pill.icon className="w-3.5 h-3.5" />}
                <span>{pill.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                }`}>
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Questions List */}
        {filteredQuestions.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border border-slate-200 dark:border-white/10">
            <Filter className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No questions match your filter.</p>
            <button
              onClick={() => { setFilterType('all'); setSearchQuery(''); }}
              className="mt-3 text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredQuestions.map((item: AttemptAnswerReview, idx: number) => {
              const optLabels = ['A', 'B', 'C', 'D'];
              const timeSec = item.response_time_ms ? (item.response_time_ms / 1000).toFixed(1) : null;

              return (
                <div
                  key={item.question_id || idx}
                  className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-200/90 dark:border-white/10 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {/* Question Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                          {item.question_text}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 self-start sm:self-auto ml-10 sm:ml-0">
                      {timeSec && (
                        <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">
                          <Clock className="w-3 h-3" />
                          <span>{timeSec}s</span>
                        </span>
                      )}
                      <DifficultyBadge difficulty={item.difficulty} size="sm" />
                      {item.is_correct ? (
                        <span className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Correct</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-xl border border-rose-200 dark:border-rose-500/20">
                          <X className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Incorrect</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4">
                    {item.options.map((opt, optIdx) => {
                      const isUserChoice = item.selected_option_index === optIdx;
                      const isCorrectChoice = item.correct_option_index === optIdx;

                      let style = 'bg-slate-50/80 dark:bg-white/5 border-slate-200/80 dark:border-white/5 text-slate-700 dark:text-slate-300';
                      let badge = null;

                      if (isCorrectChoice) {
                        style = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 font-semibold shadow-sm ring-1 ring-emerald-500/20';
                        badge = (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            <span>Correct Answer</span>
                          </span>
                        );
                      } else if (isUserChoice && !isCorrectChoice) {
                        style = 'bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 font-semibold shadow-sm ring-1 ring-rose-500/20';
                        badge = (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-rose-700 dark:text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            <X className="w-3 h-3 stroke-[2.5]" />
                            <span>Your Choice</span>
                          </span>
                        );
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs transition-all ${style}`}
                        >
                          <div className="flex items-start space-x-2.5">
                            <span className={`w-5 h-5 rounded-lg flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 ${
                              isCorrectChoice
                                ? 'bg-emerald-600 text-white'
                                : isUserChoice
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                            }`}>
                              {optLabels[optIdx] || optIdx + 1}
                            </span>
                            <span className="leading-relaxed">{opt}</span>
                          </div>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Return Actions */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-4 pt-8 border-t border-slate-200 dark:border-white/10 print:hidden">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="py-3 px-6 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-500/20 transition-all cursor-pointer flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </button>

        <button
          onClick={() => navigate('/student/attempts')}
          className="py-3 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
        >
          View All Attempts
        </button>
      </div>
    </div>
  );
};

