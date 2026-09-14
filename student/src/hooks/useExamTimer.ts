import { useState, useEffect, useRef, useCallback } from 'react';

export const useExamTimer = (
  initialSeconds: number,
  onExpire?: () => void,
  urgentThreshold: number = 60,
  resetKey?: string | number
) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(Math.max(0, initialSeconds));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const hasExpiredRef = useRef<boolean>(false);
  const endTimeRef = useRef<number | null>(null);

  // Sync / Reset target timestamp whenever initialSeconds or resetKey updates
  useEffect(() => {
    if (initialSeconds > 0) {
      hasExpiredRef.current = false;
      endTimeRef.current = Date.now() + initialSeconds * 1000;
      setSecondsRemaining(initialSeconds);
    } else {
      // If initialSeconds is 0 or negative, explicitly terminate the active countdown
      hasExpiredRef.current = false;
      endTimeRef.current = null;
      setSecondsRemaining(0);
    }
  }, [initialSeconds, resetKey]);

  // Precision countdown interval (ticks every 200ms and calculates remaining time from target timestamp)
  useEffect(() => {
    if (!endTimeRef.current) return;

    const tick = () => {
      if (!endTimeRef.current) return;
      const now = Date.now();
      const diffMs = endTimeRef.current - now;
      const remaining = Math.max(0, Math.ceil(diffMs / 1000));

      setSecondsRemaining(remaining);

      if (diffMs <= 0) {
        endTimeRef.current = null;
        setSecondsRemaining(0);
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpireRef.current?.();
        }
      }
    };

    tick();
    const interval = setInterval(tick, 200);

    return () => clearInterval(interval);
  }, [initialSeconds, resetKey]);

  const formatTime = useCallback((totalSecs: number) => {
    const mins = Math.floor(Math.max(0, totalSecs) / 60);
    const secs = Math.max(0, totalSecs) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    secondsRemaining,
    formatted: formatTime(secondsRemaining),
    isUrgent: secondsRemaining > 0 && secondsRemaining <= urgentThreshold,
  };
};
