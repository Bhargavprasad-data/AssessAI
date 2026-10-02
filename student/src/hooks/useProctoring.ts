import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api/client';
import { speakWarning } from '../utils/audioWarning';

interface ProctoringWarning {
  type: string;
  count: number;
  maxViolations: number;
  message: string;
}

interface UseProctoringOptions {
  attemptId: string;
  isActive: boolean;
  onTerminated: (reason: string) => void;
}

export const useProctoring = ({ attemptId, isActive, onTerminated }: UseProctoringOptions) => {
  const [activeWarning, setActiveWarning] = useState<ProctoringWarning | null>(null);
  const activeWarningRef = useRef<ProctoringWarning | null>(null);
  activeWarningRef.current = activeWarning;

  const lastReportedTimeRef = useRef<{ [key: string]: number }>({});
  const lastCountRef = useRef<number>(0);
  const lastMaxRef = useRef<number>(3);

  const reportViolation = useCallback(async (type: string, metadata: Record<string, any> = {}) => {
    if (!isActive || !attemptId) return;

    // Do NOT accumulate strikes while a warning modal is actively displayed to the user!
    // The candidate is currently reading the warning and must acknowledge / resolve it first.
    if (activeWarningRef.current) {
      return;
    }

    const now = Date.now();
    const lastTime = lastReportedTimeRef.current[type] || 0;
    // 10-second client-side debounce filter between strikes of the same violation type
    if (now - lastTime < 10000) {
      return;
    }
    lastReportedTimeRef.current[type] = now;

    // Instant proactive warning dialog & voice alert
    let defaultMsg = `Warning: Proctoring signal detected (${type.replace(/_/g, ' ')}).`;
    let speechMsg = defaultMsg;
    if (type === 'mobile_detected') {
      defaultMsg = 'Warning: Mobile phone detected. Close your mobile and please write your exam.';
      speechMsg = 'Warning: Mobile phone detected. Close your mobile and please write your exam.';
    } else if (type === 'unauthorized_object') {
      if (metadata?.subtype === 'face_mismatch') {
        defaultMsg = `Warning: Candidate face mismatch detected (${metadata.match_score ? metadata.match_score + '%' : 'mismatch'}). Please ensure the registered candidate is facing the camera.`;
        speechMsg = 'Warning: Candidate face mismatch detected. Please ensure the registered candidate is facing the camera.';
      } else {
        defaultMsg = 'Warning: Unauthorized material detected. Please remove it and write your exam.';
        speechMsg = 'Warning: Unauthorized material detected. Please remove it and write your exam.';
      }
    } else if (type === 'multiple_faces') {
      defaultMsg = `Warning: Multiple persons detected (${metadata?.count || 'multiple'} faces in view). Please ensure only the registered candidate is facing the camera.`;
      speechMsg = 'Warning: Multiple faces detected. Please ensure only the registered candidate is facing the camera.';
    } else if (type === 'no_face') {
      defaultMsg = 'Warning: Face not visible in camera. Please look at the camera to write your exam.';
      speechMsg = 'Warning: Face not visible to camera. Please face the screen.';
    } else if (type === 'looking_away') {
      defaultMsg = 'Warning: Looking away from screen detected. Please face the screen to write your exam.';
      speechMsg = 'Warning: Looking away detected. Please focus on your exam screen.';
    } else if (type === 'audio_spike') {
      defaultMsg = 'Warning: Suspicious background voices or loud noise detected.';
      speechMsg = 'Warning: Suspicious audio detected. Please maintain silence.';
    } else if (type === 'tab_switch') {
      defaultMsg = 'Warning: Tab switch detected. Please stay on the examination screen.';
      speechMsg = 'Warning: Tab switch detected. Please stay on the examination screen.';
    } else if (type === 'window_blur') {
      defaultMsg = 'Warning: Assessment window lost focus / full screen exit detected.';
      speechMsg = 'Warning: Assessment window lost focus. Please return to the test.';
    } else if (type === 'webcam_disconnected') {
      defaultMsg = 'Security Alert: Camera feed disconnected or disabled.';
      speechMsg = 'Camera feed disconnected. Please enable your camera.';
    } else if (type === 'mic_disabled') {
      defaultMsg = 'Security Alert: Microphone feed disconnected or muted.';
      speechMsg = 'Microphone disconnected. Please enable your microphone.';
    } else if (type === 'screen_share_stopped') {
      defaultMsg = 'Security Alert: Screen sharing was stopped.';
      speechMsg = 'Screen sharing stopped. Please share your screen.';
    } else if (type === 'copy' || type === 'paste' || type === 'cut') {
      defaultMsg = 'Warning: Clipboard copy and paste actions are prohibited.';
      speechMsg = 'Warning: Copy and paste actions are prohibited.';
    } else if (type === 'screenshot_attempt') {
      defaultMsg = 'Warning: Screenshot attempt detected.';
      speechMsg = 'Warning: Screenshot attempt detected.';
    }

    setActiveWarning({
      type,
      count: lastCountRef.current + 1,
      maxViolations: lastMaxRef.current || 3,
      message: defaultMsg,
    });
    speakWarning(speechMsg);

    try {
      const res = await apiFetch<{
        recorded: boolean;
        total_violations: number;
        max_violations: number;
        is_terminated: boolean;
        message: string;
      }>(`/api/proctoring/attempts/${attemptId}/violations`, {
        method: 'POST',
        body: JSON.stringify({ type, metadata }),
      });

      if (res.is_terminated) {
        speakWarning('Exam terminated due to multiple security violations.', true);
        onTerminated(res.message);
      } else {
        lastCountRef.current = res.total_violations;
        lastMaxRef.current = res.max_violations;
        setActiveWarning((prev) =>
          prev
            ? {
                ...prev,
                count: res.total_violations,
                maxViolations: res.max_violations,
              }
            : null
        );
      }
    } catch (err) {
      console.error('Failed to report proctoring signal:', err);
    }
  }, [attemptId, isActive, onTerminated]);

  useEffect(() => {
    if (!isActive) return;

    // 1. Visibility change (tab switch / minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation('tab_switch', { event: 'document.hidden' });
      }
    };

    // 2. Window blur
    const handleBlur = () => {
      reportViolation('window_blur', { event: 'window.blur' });
    };

    // 3. Clipboard copy/cut/paste
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('copy', { event: 'clipboard.copy' });
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('paste', { event: 'clipboard.paste' });
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('cut', { event: 'clipboard.cut' });
    };

    // 4. Best-effort Screenshot signal (PrintScreen key)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        reportViolation('screenshot_attempt', { key: 'PrintScreen' });
      }
    };

    // 5. Fullscreen change (detecting exit from full screen)
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportViolation('window_blur', { event: 'fullscreen_exit' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isActive, reportViolation]);

  const dismissWarning = useCallback(() => {
    // When returning to exam, set timestamp to now - 8000ms
    // With 10s debounce, this provides exactly 2 seconds of grace before another strike can trigger
    const now = Date.now();
    Object.keys(lastReportedTimeRef.current).forEach((key) => {
      lastReportedTimeRef.current[key] = now - 8000;
    });
    setActiveWarning(null);
  }, []);

  return { activeWarning, dismissWarning, reportViolation };
};
