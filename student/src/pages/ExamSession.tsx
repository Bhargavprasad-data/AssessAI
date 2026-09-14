import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, getWsUrl } from '../api/client';
import type { CurrentQuestion, AttemptResults } from '../types';
import { useProctoring } from '../hooks/useProctoring';
import { useProctoringMedia } from '../hooks/useProctoringMedia';
import { useCameraDetection } from '../hooks/useCameraDetection';
import { useExamTimer } from '../hooks/useExamTimer';
import { DifficultyBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ProctoringMediaWidget } from '../components/common/ProctoringMediaWidget';
import { cleanQuestionText } from '../utils/textCleaner';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert, Clock, AlertTriangle, ArrowRight, EyeOff, Maximize, Minimize,
  Camera, Mic, Monitor, CheckCircle2, Smartphone, ListChecks, ShieldCheck,
  Send, FileText, RotateCcw
} from 'lucide-react';

export const ExamSession: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionSummary, setSubmissionSummary] = useState<{
    total: number;
    attempted: number;
    unattempted: number;
    attemptId: string;
    assessmentTitle?: string;
    answersBreakdown?: Array<{
      questionNumber: number;
      question_id: string;
      question_text: string;
      difficulty: string;
      is_attempted: boolean;
      selected_option_index: number | null;
      response_time_ms?: number;
    }>;
  } | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);

  const deviceIdRef = useRef<string>(
    localStorage.getItem('proctor_device_id') || `device_${Math.random().toString(36).substring(2, 9)}`
  );

  const setupVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    localStorage.setItem('proctor_device_id', deviceIdRef.current);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Could not enter fullscreen:', err);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Could not exit fullscreen:', err);
    }
  };

  // Proctoring Violation Hook
  const { activeWarning, dismissWarning, reportViolation } = useProctoring({
    attemptId: attemptId || '',
    isActive: hasConsented && !terminatedReason && !!attemptId,
    onTerminated: (reason) => {
      setTerminatedReason(reason);
    },
  });

  // Media Devices & Proctoring Hook
  const {
    cameraStream,
    isCameraActive,
    isMicActive,
    isScreenSharing,
    audioLevel,
    mediaError,
    requestCamera,
    requestMicrophone,
    requestScreenShare,
    enableSimulatedHardware,
    stopAllMedia,
  } = useProctoringMedia({
    onViolation: (type, metadata) => {
      if (hasConsented && attemptId) {
        reportViolation(type, metadata);
      }
    },
  });

  // AI Camera Object Detection (Mobile phone, electronic devices, books, multiple faces, gaze tracking)
  const {
    modelLoaded,
    detectedItems,
    mobileWarningActive,
  } = useCameraDetection({
    cameraStream,
    isCameraActive,
    isActive: hasConsented && !terminatedReason && !!attemptId,
    onViolation: (type, metadata) => {
      if (hasConsented && attemptId) {
        reportViolation(type, metadata);
      }
    },
  });

  useEffect(() => {
    if (setupVideoRef.current) {
      setupVideoRef.current.srcObject = cameraStream;
      if (cameraStream) {
        setupVideoRef.current.play().catch(() => {});
      }
    }
  }, [cameraStream]);

  const submittingRef = useRef<boolean>(false);
  const currentQuestionRef = useRef<CurrentQuestion | null>(null);
  currentQuestionRef.current = currentQuestion;

  // Answer Submission
  const handleSubmitAnswer = useCallback(async (isTimeout: boolean = false) => {
    if (submissionSummary) return; // Ignore any stray per-question timers when already reviewing
    const q = currentQuestionRef.current;
    if (!attemptId || !q || submittingRef.current) return;
    if (!isTimeout && selectedOption === null) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        attempt_id: string;
        status: string;
        completion_reason?: string;
        next_question?: CurrentQuestion;
      }>(`/api/student/attempts/${attemptId}/submit-answer`, {
        method: 'POST',
        body: JSON.stringify({
          question_id: q.question_id,
          selected_option_index: isTimeout ? null : selectedOption,
          is_timeout: isTimeout,
        }),
      });

      setSelectedOption(null);

      if (res.status === 'submitted') {
        setCurrentQuestion(null);
        currentQuestionRef.current = null;
        try {
          const resultsData = await apiFetch<AttemptResults>(`/api/student/attempts/${attemptId}/results`);
          const totalQ = resultsData.answers_breakdown?.length || q.max_questions || 10;
          const attemptedCount = resultsData.answers_breakdown
            ? resultsData.answers_breakdown.filter((a) => a.selected_option_index !== null && a.selected_option_index !== undefined).length
            : resultsData.total_answers || totalQ;
          const unattemptedCount = Math.max(0, totalQ - attemptedCount);

          setSubmissionSummary({
            total: totalQ,
            attempted: attemptedCount,
            unattempted: unattemptedCount,
            attemptId,
            assessmentTitle: resultsData.assessment_title || 'Assessment',
            answersBreakdown: resultsData.answers_breakdown?.map((a, idx) => ({
              questionNumber: idx + 1,
              question_id: a.question_id,
              question_text: a.question_text,
              difficulty: a.difficulty,
              is_attempted: a.selected_option_index !== null && a.selected_option_index !== undefined,
              selected_option_index: a.selected_option_index ?? null,
              response_time_ms: a.response_time_ms,
            })) || [],
          });
        } catch {
          const totalQ = q.max_questions || 10;
          const attemptedCount = isTimeout ? Math.max(0, q.question_number - 1) : q.question_number;
          setSubmissionSummary({
            total: totalQ,
            attempted: attemptedCount,
            unattempted: Math.max(0, totalQ - attemptedCount),
            attemptId,
            answersBreakdown: [],
          });
        }
      } else if (res.next_question) {
        setCurrentQuestion(res.next_question);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to submit answer.';
      setError(errMsg);
      if (errMsg.toLowerCase().includes('terminated')) {
        setTerminatedReason(errMsg);
      } else if (!submissionSummary && (errMsg.toLowerCase().includes('already submitted') || errMsg.toLowerCase().includes('already completed'))) {
        navigate(`/student/attempts/${attemptId}/results`);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [attemptId, selectedOption, submissionSummary, navigate]);

  const handleTimeoutSubmission = useCallback(() => {
    if (!submissionSummary) {
      handleSubmitAnswer(true);
    }
  }, [handleSubmitAnswer, submissionSummary]);

  const [overallExamSeconds, setOverallExamSeconds] = useState<number>(0);

  useEffect(() => {
    if (currentQuestion?.time_remaining_seconds && currentQuestion.time_remaining_seconds > 0) {
      setOverallExamSeconds(currentQuestion.time_remaining_seconds);
    }
  }, [currentQuestion?.time_remaining_seconds]);

  // Overall Exam Timer expiration handler:
  // If student is on the review screen and exam timer runs out (00:00), auto-finalize to results.
  // If student is answering a question and exam timer runs out, auto-submit that question as timed out.
  const handleExamTimeExpired = useCallback(() => {
    if (submissionSummary) {
      navigate(`/student/attempts/${submissionSummary.attemptId}/results`);
    } else {
      handleTimeoutSubmission();
    }
  }, [submissionSummary, navigate, handleTimeoutSubmission]);

  // Overall Exam Timer (runs continuously for the attemptId across questions and review screen)
  const { formatted: formattedExamTime, isUrgent: isExamUrgent } = useExamTimer(
    overallExamSeconds,
    handleExamTimeExpired,
    60,
    attemptId || 'overall_exam_timer'
  );

  // Per-Question Timer (Yellow box: resets on every question change; stopped when review screen is active)
  const { formatted: formattedPerQTime, isUrgent: isPerQUrgent } = useExamTimer(
    submissionSummary ? 0 : (currentQuestion?.per_question_time_remaining_seconds || 0),
    handleTimeoutSubmission,
    15,
    submissionSummary ? 'review_active' : (currentQuestion?.question_id || 'per_question_timer')
  );

  // Periodic heartbeat every 30 seconds
  useEffect(() => {
    if (!attemptId || !hasConsented || terminatedReason) return;

    const interval = setInterval(async () => {
      try {
        await apiFetch(`/api/student/attempts/${attemptId}/heartbeat`, {
          method: 'POST',
          body: JSON.stringify({ device_id: deviceIdRef.current }),
        });
      } catch (err) {
        console.error('Heartbeat error:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [attemptId, hasConsented, terminatedReason]);

  // Auto-resume active exam on page refresh
  useEffect(() => {
    if (!assessmentId) return;

    let isMounted = true;
    async function checkExistingAttempt() {
      try {
        const assessments = await apiFetch<any[]>('/api/student/assessments');
        if (!isMounted) return;

        const currentAssessment = assessments.find((a) => a.id === assessmentId);
        if (currentAssessment) {
          if (currentAssessment.existing_attempt_status === 'in_progress' || currentAssessment.existing_attempt_status === 'disconnected') {
            setConsentChecked(true);
            try {
              const res = await apiFetch<{
                attempt_id: string;
                status: string;
                current_question: CurrentQuestion;
                is_resumed?: boolean;
              }>(`/api/student/assessments/${assessmentId}/join`, {
                method: 'POST',
                body: JSON.stringify({
                  consent_ack: true,
                  device_id: deviceIdRef.current,
                }),
              });

              if (isMounted) {
                setAttemptId(res.attempt_id);
                setCurrentQuestion(res.current_question);
                setHasConsented(true);
                enableSimulatedHardware();
              }
            } catch (err: any) {
              console.warn('Could not auto-resume ongoing attempt:', err);
            }
          } else if (currentAssessment.existing_attempt_status === 'submitted') {
            navigate(`/student/attempts/${currentAssessment.existing_attempt_id}/results`, { replace: true });
          }
        }
      } catch (err) {
        console.warn('Could not check assessment status on mount:', err);
      }
    }

    checkExistingAttempt();
    return () => {
      isMounted = false;
    };
  }, [assessmentId, navigate, enableSimulatedHardware]);

  // Join / Start Attempt after consent
  const handleJoinAttempt = async () => {
    if (!consentChecked) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiFetch<{
        attempt_id: string;
        status: string;
        current_question: CurrentQuestion;
      }>(`/api/student/assessments/${assessmentId}/join`, {
        method: 'POST',
        body: JSON.stringify({
          consent_ack: true,
          device_id: deviceIdRef.current,
        }),
      });

      setAttemptId(res.attempt_id);
      setCurrentQuestion(res.current_question);
      setHasConsented(true);
      await enterFullscreen();
    } catch (err: any) {
      const msg = err.message || 'Failed to start exam.';
      setError(msg);
      if (msg.toLowerCase().includes('already completed') || msg.toLowerCase().includes('finalized')) {
        setTimeout(() => navigate('/student/dashboard'), 2000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToDashboard = useCallback(() => {
    try {
      stopAllMedia();
    } catch (e) {
      console.warn('Error stopping media on dashboard return:', e);
    }
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {
      console.warn('Error exiting fullscreen on dashboard return:', e);
    }
    navigate('/student/dashboard', { replace: true });
    // Safety fallback: if router transition is blocked, force browser location update
    setTimeout(() => {
      if (window.location.pathname.includes('/take')) {
        window.location.href = '/student/dashboard';
      }
    }, 120);
  }, [stopAllMedia, navigate]);

  const [checkingResume, setCheckingResume] = useState<boolean>(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);

  const checkAndResumeExam = useCallback(async (isAuto: boolean = false) => {
    if (!assessmentId) return;
    if (!isAuto) {
      setCheckingResume(true);
      setResumeMessage(null);
    }
    try {
      const res = await apiFetch<{
        attempt_id: string;
        status: string;
        is_resumed: boolean;
        current_question: CurrentQuestion;
      }>(`/api/student/assessments/${assessmentId}/join`, {
        method: 'POST',
        body: JSON.stringify({
          consent_ack: true,
          device_id: deviceIdRef.current,
        }),
      });

      if (res.status === 'in_progress' && res.current_question) {
        setTerminatedReason(null);
        setAttemptId(res.attempt_id);
        setCurrentQuestion(res.current_question);
        setHasConsented(true);
        setResumeMessage(null);
        await enterFullscreen();
      }
    } catch (err: any) {
      if (!isAuto) {
        setResumeMessage(err.message || 'Exam is currently locked. Waiting for instructor approval.');
      }
    } finally {
      if (!isAuto) setCheckingResume(false);
    }
  }, [assessmentId]);

  // Real-time WebSocket listener for instant ban revocation & resume signals
  useEffect(() => {
    if (!assessmentId) return;

    const wsUrl = getWsUrl(`/ws/assessments/${assessmentId}/leaderboard`);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const data = payload.data || payload;
          if (data.type === 'ban_revoked' || data.is_reinstated) {
            // Instructor has revoked ban - immediately resume exam!
            checkAndResumeExam(false);
          } else if ((data.type === 'instructor_ban' || data.is_terminated) && (!data.student_id || data.student_id === user?.id)) {
            setTerminatedReason(data.message || 'Assessment terminated by instructor.');
          }
        } catch (e) {
          console.warn('WS message error:', e);
        }
      };
    } catch (err) {
      console.warn('WS connection failed:', err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [assessmentId, checkAndResumeExam, user?.id]);

  // Auto-poll every 2 seconds while on Terminated screen so exam automatically unblocks and resumes!
  useEffect(() => {
    if (!terminatedReason) return;
    const interval = setInterval(() => {
      checkAndResumeExam(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [terminatedReason, checkAndResumeExam]);



  // 1. Consent Screen (Shown before exam starts)
  if (!hasConsented) {
    const isHardwareReady = isCameraActive && isMicActive && isScreenSharing;

    return (
      <div className="max-w-2xl mx-auto px-4 py-12 relative">
        <div className="glass-panel rounded-3xl p-8 border border-slate-200 dark:border-white/10 shadow-2xl relative z-10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 rounded-2xl bg-brand-500/15 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 border border-brand-500/30">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Proctoring &amp; System Setup</h1>
              <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">Configure hardware devices and review rules before starting.</p>
            </div>
          </div>

          {/* System & Hardware Readiness Check */}
          <div className="mb-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Required Hardware &amp; Permissions
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Face Cam Button */}
              <button
                type="button"
                onClick={requestCamera}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isCameraActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Camera className={`w-5 h-5 ${isCameraActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400'}`} />
                  {isCameraActive && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                </div>
                <span className="text-xs font-bold">1. Face Camera</span>
                <span className={`text-[10px] mt-0.5 ${isCameraActive ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {isCameraActive ? '✓ Camera Active' : 'Click to Enable'}
                </span>
              </button>

              {/* Microphone Button */}
              <button
                type="button"
                onClick={requestMicrophone}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isMicActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Mic className={`w-5 h-5 ${isMicActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400'}`} />
                  {isMicActive && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                </div>
                <span className="text-xs font-bold">2. Microphone</span>
                <span className={`text-[10px] mt-0.5 ${isMicActive ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {isMicActive ? `✓ Mic Active (${audioLevel > 0 ? audioLevel + '%' : 'Live'})` : 'Click to Enable'}
                </span>
              </button>

              {/* Screen Share Button */}
              <button
                type="button"
                onClick={requestScreenShare}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isScreenSharing
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Monitor className={`w-5 h-5 ${isScreenSharing ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400'}`} />
                  {isScreenSharing && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                </div>
                <span className="text-xs font-bold">3. Screen Share</span>
                <span className={`text-[10px] mt-0.5 ${isScreenSharing ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {isScreenSharing ? '✓ Screen Shared' : 'Click to Share'}
                </span>
              </button>
            </div>

            {/* Live Camera Preview Box once camera is active */}
            {isCameraActive && cameraStream && (
              <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex items-center space-x-3">
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-slate-900 border border-emerald-500/40 relative flex-shrink-0">
                  <video
                    ref={setupVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <span className="absolute bottom-1 right-1 text-[8px] bg-emerald-500 text-slate-950 font-bold px-1 rounded">
                    LIVE
                  </span>
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-semibold text-emerald-300">Face Camera Preview Active</p>
                  <p className="text-[11px] text-slate-400">Position yourself centrally within your camera view.</p>
                </div>
              </div>
            )}

            {mediaError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                <span>{mediaError}</span>
                <button
                  type="button"
                  onClick={enableSimulatedHardware}
                  className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-500/30 hover:bg-rose-500/50 text-white transition-colors"
                >
                  Use Simulation
                </button>
              </div>
            )}
          </div>

          {/* Exam Monitoring Terms */}
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-6 bg-slate-100 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-white/5">
            <div className="flex items-start space-x-3">
              <EyeOff className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-900 dark:text-white">Active Environment Monitoring:</strong> Face cam, audio feed, tab switching, and clipboard operations (copy/paste) are monitored continuously.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <Clock className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-900 dark:text-white">Continuous Exam Timer:</strong> The countdown timer runs continuously once launched.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <Maximize className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-900 dark:text-white">Full-Screen Mode:</strong> Full-screen mode is required to maintain focus and session security.
              </p>
            </div>
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong className="text-amber-800 dark:text-amber-200">Violation Threshold:</strong> Disconnecting camera/mic, stopping screen share, or exceeding max strikes will terminate the exam automatically.
              </p>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-slate-800 dark:text-slate-300 font-medium">
                I acknowledge the smart proctoring guidelines and agree to keep my Face Cam, Mic, and Screen Share active throughout the assessment.
              </span>
            </label>
          </div>

          {(error || mediaError) && (
            <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span>{error || mediaError}</span>
            </div>
          )}

          <button
            onClick={handleJoinAttempt}
            disabled={!consentChecked || !isHardwareReady || submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-brand-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <span>
              {submitting
                ? 'Initiating Exam Session...'
                : !isHardwareReady
                ? 'Please Enable Camera, Mic & Screen Share Above'
                : 'Enter Assessment Session'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 2. Terminated Notice (When threshold breached)
  if (terminatedReason) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="glass-panel rounded-3xl p-10 border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-5 border border-rose-500/30">
            <ShieldAlert className="w-9 h-9" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">Assessment Terminated</h2>
          <p className="text-rose-700 dark:text-rose-200/80 text-sm mb-6 leading-relaxed">
            {terminatedReason}
          </p>
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 text-left mb-6">
            <p className="font-semibold text-slate-900 dark:text-slate-200 mb-1">Notice of Action:</p>
            <p>Your attempt is paused/terminated. When your instructor revokes the ban or reinstates your session, this screen will automatically resume your exam.</p>
          </div>

          {resumeMessage && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>{resumeMessage}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => checkAndResumeExam(false)}
              disabled={checkingResume}
              className="w-full sm:w-auto py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25 transition-all cursor-pointer inline-flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${checkingResume ? 'animate-spin' : ''}`} />
              <span>{checkingResume ? 'Checking Status...' : 'Check Status & Resume Exam'}</span>
            </button>
            <button
              type="button"
              onClick={handleReturnToDashboard}
              className="w-full sm:w-auto py-3.5 px-6 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-sm font-bold border border-slate-200 dark:border-white/10 shadow-lg hover:shadow-xl transition-all cursor-pointer inline-flex items-center justify-center space-x-2"
            >
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion && !submissionSummary) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // 3. Dedicated Assessment Review & Final Submission View (Rendered after all questions answered)
  if (submissionSummary) {
    const attemptPercentage = Math.round(
      (submissionSummary.attempted / Math.max(1, submissionSummary.total)) * 100
    );

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 relative min-h-screen">
        {/* Background Watermark Security Layer */}
        <div
          className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden flex flex-wrap items-center justify-around opacity-[0.05] dark:opacity-[0.07]"
          aria-hidden="true"
        >
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="transform -rotate-12 m-8 text-xs sm:text-sm font-mono font-black text-slate-900 dark:text-white tracking-widest whitespace-nowrap"
            >
              {user?.name || 'Student'} • {user?.email || 'Candidate'}
            </div>
          ))}
        </div>

        {/* Top Header: Completion Status & Overall Exam Timer */}
        <div className="glass-panel rounded-2xl p-4 mb-6 border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 relative z-10 shadow-lg">
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-500/30 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>All Questions Answered</span>
            </span>
            {user && (
              <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold">{user.name}</span>
                <span className="text-slate-400 dark:text-slate-500 text-[11px]">({user.email})</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Overall Exam Timer */}
            <div
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                isExamUrgent
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 animate-pulse'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Exam Time Remaining: {formattedExamTime}</span>
            </div>

            {/* Full Screen Toggle */}
            <button
              type="button"
              onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition-colors"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">Exit Full Screen</span>
                </>
              ) : (
                <>
                  <Maximize className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  <span className="hidden sm:inline">Full Screen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Hero Review Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-2xl mb-6 relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-white/10">
            <div>
              <div className="flex items-center space-x-2.5 mb-1.5">
                <div className="p-2 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30">
                  <ListChecks className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Assessment Attempt Review
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                Review your final attempt summary below. When you are ready, click <strong className="text-slate-900 dark:text-white font-bold">"Finalize &amp; Submit Exam"</strong> to submit. If the remaining exam time expires, your exam will automatically submit.
              </p>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-center">
              <span className="px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-extrabold text-xs border border-brand-200 dark:border-brand-500/30">
                {submissionSummary.assessmentTitle || 'Adaptive Assessment'}
              </span>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Questions */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-900/80 dark:to-slate-900/40 border border-slate-200 dark:border-white/10 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Questions</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {submissionSummary.total}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Assessment question pool</p>
              </div>
            </div>

            {/* Attempted Questions */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 dark:from-emerald-950/40 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Attempted</p>
                <p className="text-2xl font-black text-emerald-900 dark:text-emerald-200 tracking-tight">
                  {submissionSummary.attempted} <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">({attemptPercentage}%)</span>
                </p>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">Answers recorded</p>
              </div>
            </div>

            {/* Unattempted / Timed Out */}
            <div className={`p-4 rounded-2xl border flex items-center space-x-4 ${
              submissionSummary.unattempted > 0
                ? 'bg-gradient-to-br from-amber-50/80 to-amber-100/40 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-500/30'
                : 'bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-900/80 dark:to-slate-900/40 border-slate-200 dark:border-white/10'
            }`}>
              <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 ${
                submissionSummary.unattempted > 0
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Unattempted</p>
                <p className={`text-2xl font-black tracking-tight ${
                  submissionSummary.unattempted > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-slate-900 dark:text-white'
                }`}>
                  {submissionSummary.unattempted}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {submissionSummary.unattempted > 0 ? 'Timed out / skipped' : 'All questions attempted'}
                </p>
              </div>
            </div>
          </div>

          {/* Question Breakdown Matrix */}
          {submissionSummary.answersBreakdown && submissionSummary.answersBreakdown.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center space-x-1.5">
                  <span>Question-by-Question Status</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {submissionSummary.answersBreakdown.length} questions
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {submissionSummary.answersBreakdown.map((item) => (
                  <div
                    key={item.question_id || item.questionNumber}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                      item.is_attempted
                        ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-white/10'
                        : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-500/20'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {item.questionNumber}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {cleanQuestionText(item.question_text || `Question ${item.questionNumber}`)}
                        </p>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <DifficultyBadge difficulty={item.difficulty as any} size="sm" />
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {item.is_attempted ? (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Attempted</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Timed Out</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security & Proctoring Confirmation Note */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 flex items-start space-x-3 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-200">
                Proctored Session Integrity Verified
              </p>
              <p className="mt-0.5 leading-relaxed text-[11px]">
                Your biometric camera stream, audio feed, and session heartbeat have been recorded and synced with the evaluation server.
              </p>
            </div>
          </div>

          {/* Final Submission Action Button */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>Ready to submit? Once finalized, your scorecard will be generated.</span>
            </div>

            <button
              type="button"
              onClick={() => {
                navigate(`/student/attempts/${submissionSummary.attemptId}/results`);
              }}
              className="py-4 px-8 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:via-teal-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center space-x-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Finalize &amp; Submit Exam</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Live Face Cam, Microphone VU & Screen Share Widget */}
        {hasConsented && (
          <ProctoringMediaWidget
            cameraStream={cameraStream}
            isCameraActive={isCameraActive}
            isMicActive={isMicActive}
            isScreenSharing={isScreenSharing}
            audioLevel={audioLevel}
            detectedItems={detectedItems}
            mobileWarningActive={mobileWarningActive}
            modelLoaded={modelLoaded}
          />
        )}
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative min-h-screen">
      {/* Background Watermark Security Layer (Student Name & Email) */}
      <div
        className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden flex flex-wrap items-center justify-around opacity-[0.05] dark:opacity-[0.07]"
        aria-hidden="true"
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="transform -rotate-12 m-8 text-xs sm:text-sm font-mono font-black text-slate-900 dark:text-white tracking-widest whitespace-nowrap"
          >
            {user?.name || 'Student'} • {user?.email || 'Candidate'}
          </div>
        ))}
      </div>

      {/* Top Header: Progress & Timers */}
      <div className="glass-panel rounded-2xl p-4 mb-6 border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 relative z-10">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Question {currentQuestion.question_number} of {currentQuestion.max_questions}
          </span>
          <DifficultyBadge difficulty={currentQuestion.difficulty} size="sm" />
          {user && (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold">{user.name}</span>
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">({user.email})</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Per-Question Timer if active */}
          {currentQuestion.per_question_time_remaining_seconds !== undefined && currentQuestion.per_question_time_remaining_seconds !== null && (
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
              isPerQUrgent
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 animate-pulse'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
            }`}>
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Q: {formattedPerQTime}</span>
            </div>
          )}

          {/* Overall Exam Timer */}
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
            isExamUrgent
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 animate-pulse'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
          }`}>
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Exam: {formattedExamTime}</span>
          </div>

          {/* Full Screen Toggle Button */}
          <button
            type="button"
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition-colors"
            title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">Exit Full Screen</span>
              </>
            ) : (
              <>
                <Maximize className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span className="hidden sm:inline">Full Screen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Full Screen Reminder Banner when active exam is not in full screen */}
      {!isFullscreen && (
        <div className="mb-6 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between animate-fadeIn shadow-lg relative z-10">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>Full-screen mode is recommended for proctored exams to prevent accidental window blur triggers.</span>
          </div>
          <button
            type="button"
            onClick={enterFullscreen}
            className="ml-3 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors whitespace-nowrap shadow"
          >
            Enter Full Screen
          </button>
        </div>
      )}

      {/* Question Card */}
      <div className="glass-panel rounded-3xl p-8 border border-slate-200 dark:border-white/10 shadow-2xl mb-6 relative z-10">
        {/* Question Header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Question {currentQuestion.question_number} of {currentQuestion.max_questions}
          </span>
          {user && (
            <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
              {user.email}
            </span>
          )}
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-relaxed mb-8">
          {cleanQuestionText(currentQuestion.text)}
        </h2>

        {/* 4 Options */}
        <div className="space-y-3 mb-8">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOption === idx;
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            return (
              <div
                key={idx}
                onClick={() => setSelectedOption(idx)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                  isSelected
                    ? 'bg-brand-50 dark:bg-brand-600/20 border-brand-500 shadow-md shadow-brand-500/15'
                    : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 hover:border-brand-500/30 dark:hover:border-white/15'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-colors ${
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  >
                    {letter}
                  </div>
                  <span className={`text-sm ${isSelected ? 'text-brand-950 dark:text-white font-semibold' : 'text-slate-800 dark:text-slate-300'}`}>
                    {option}
                  </span>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white"></div>}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submission Button */}
        <div className="flex justify-end">
          <button
            onClick={() => handleSubmitAnswer(false)}
            disabled={selectedOption === null || submitting}
            className="py-3 px-8 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold shadow-lg shadow-brand-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 cursor-pointer"
          >
            <span>
              {submitting
                ? 'Evaluating...'
                : currentQuestion.question_number >= currentQuestion.max_questions
                ? 'Submit & Review Exam'
                : 'Submit & Proceed'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Proctoring Warning Modal */}
      <Modal
        isOpen={!!activeWarning}
        onClose={dismissWarning}
        title={
          activeWarning?.type === 'mobile_detected'
            ? 'Security Alert: Mobile Phone Detected'
            : activeWarning?.type === 'unauthorized_object'
            ? 'Security Alert: Unauthorized Object Detected'
            : activeWarning?.type === 'multiple_faces'
            ? 'Security Alert: Multiple Persons Detected'
            : activeWarning?.type === 'no_face'
            ? 'Security Alert: Face Not Visible'
            : 'Proctoring Security Warning'
        }
      >
        <div className="text-center py-2">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border shadow-lg ${
            activeWarning?.type === 'mobile_detected'
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 shadow-rose-500/20 animate-pulse'
              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
          }`}>
            {activeWarning?.type === 'mobile_detected' ? (
              <Smartphone className="w-7 h-7 animate-bounce" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>

          <h4 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">
            {activeWarning?.type === 'mobile_detected'
              ? 'Close your mobile and please write your exam'
              : activeWarning?.type === 'unauthorized_object'
              ? 'Remove unauthorized material and write your exam'
              : activeWarning?.type === 'multiple_faces'
              ? 'Multiple persons detected in camera'
              : activeWarning?.type === 'no_face'
              ? 'Please face the camera to write your exam'
              : `Proctoring Signal Detected (${activeWarning?.type.replace(/_/g, ' ')})`}
          </h4>

          <p className="text-xs text-slate-700 dark:text-slate-300 mb-4 leading-relaxed font-medium">
            {activeWarning?.message}
          </p>

          {activeWarning?.type === 'mobile_detected' && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-left text-xs text-rose-700 dark:text-rose-300 space-y-1.5">
              <p className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Action Required:</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                Please put away your mobile phone, tablets, or electronic devices immediately. Continuing to keep unauthorized items visible to the camera will trigger automated exam termination.
              </p>
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 mb-6 text-left flex items-center justify-between">
            <span className="font-semibold text-slate-900 dark:text-slate-300">Strike Status:</span>
            <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
              Strike {activeWarning?.count || 1} of {activeWarning?.maxViolations || 3}
            </span>
          </div>

          <button
            onClick={dismissWarning}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all text-white flex items-center justify-center space-x-2 shadow-lg cursor-pointer ${
              activeWarning?.type === 'mobile_detected'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                : 'bg-brand-600 hover:bg-brand-500 shadow-brand-500/25'
            }`}
          >
            <span>Return to Exam</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Modal>

      {/* Floating Live Face Cam, Microphone VU & Screen Share Widget */}
      {hasConsented && (
        <ProctoringMediaWidget
          cameraStream={cameraStream}
          isCameraActive={isCameraActive}
          isMicActive={isMicActive}
          isScreenSharing={isScreenSharing}
          audioLevel={audioLevel}
          detectedItems={detectedItems}
          mobileWarningActive={mobileWarningActive}
          modelLoaded={modelLoaded}
        />
      )}
    </div>
  );
};

