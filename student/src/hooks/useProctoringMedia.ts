import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseProctoringMediaOptions {
  onViolation?: (type: string, metadata?: Record<string, any>) => void;
}

export function useProctoringMedia(options: UseProctoringMediaOptions = {}) {
  const { onViolation } = options;

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const noiseSpikeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioIncidentActiveRef = useRef<boolean>(false);
  const quietResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Request Camera Permission
  const requestCamera = useCallback(async () => {
    try {
      setMediaError(null);
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Webcam API is not supported or accessible in this browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setIsCameraActive(true);

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setIsCameraActive(false);
          setCameraStream(null);
          cameraStreamRef.current = null;
          onViolation?.('webcam_disconnected', { reason: 'track_ended' });
        };
      });
      return stream;
    } catch (err: any) {
      console.warn('Camera request error:', err);
      const isNotFound = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError';
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const msg = isNotFound
        ? 'No camera found. Please connect a webcam and click Retry.'
        : isDenied
        ? 'Camera permission denied. Please allow camera access in your browser.'
        : `Camera error: ${err.message || 'unavailable'}`;
      setMediaError(msg);
      setIsCameraActive(false);
      return null;
    }
  }, [onViolation]);

  // 2. Request Microphone Permission & Setup Audio Analyser
  const requestMicrophone = useCallback(async () => {
    try {
      setMediaError(null);
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone API is not supported or accessible in this browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      micStreamRef.current = stream;
      setMicStream(stream);
      setIsMicActive(true);

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          setIsMicActive(false);
          setMicStream(null);
          micStreamRef.current = null;
          onViolation?.('mic_disabled', { reason: 'track_ended' });
        };
      });

      // Setup Web Audio API Analyser for live volume meter
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateAudioLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);

          // Audio spike / noise detection (>55% sustained for 1.2 seconds)
          if (level > 55) {
            if (quietResetTimerRef.current) {
              clearTimeout(quietResetTimerRef.current);
              quietResetTimerRef.current = null;
            }
            if (!audioIncidentActiveRef.current && !noiseSpikeTimerRef.current) {
              noiseSpikeTimerRef.current = setTimeout(() => {
                audioIncidentActiveRef.current = true;
                onViolation?.('audio_spike', { level, description: 'Loud background noise or speech detected' });
                noiseSpikeTimerRef.current = null;
              }, 1200);
            }
          } else {
            if (noiseSpikeTimerRef.current) {
              clearTimeout(noiseSpikeTimerRef.current);
              noiseSpikeTimerRef.current = null;
            }
            if (audioIncidentActiveRef.current && !quietResetTimerRef.current) {
              quietResetTimerRef.current = setTimeout(() => {
                audioIncidentActiveRef.current = false;
                quietResetTimerRef.current = null;
              }, 2500);
            }
          }

          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        };

        updateAudioLevel();
      } catch (audioErr) {
        console.warn('Web Audio API initialized with limited metrics:', audioErr);
      }

      return stream;
    } catch (err: any) {
      console.warn('Microphone request error:', err);
      const isNotFound = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError';
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const msg = isNotFound
        ? 'No microphone found. Please connect a microphone and click Retry.'
        : isDenied
        ? 'Microphone permission denied. Please allow microphone access in your browser.'
        : `Microphone error: ${err.message || 'unavailable'}`;
      setMediaError(msg);
      setIsMicActive(false);
      return null;
    }
  }, [onViolation]);

  // 3. Request Screen Sharing Permission
  const requestScreenShare = useCallback(async () => {
    try {
      setMediaError(null);
      if (!navigator?.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
          screenStreamRef.current = null;
          onViolation?.('screen_share_stopped', { reason: 'user_ended_sharing' });
        };
      });
      return stream;
    } catch (err: any) {
      console.warn('Screen share request error:', err);
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const msg = isDenied
        ? 'Screen share canceled or denied. Please select a screen or window to share.'
        : `Screen share error: ${err.message || 'unavailable'}`;
      setMediaError(msg);
      setIsScreenSharing(false);
      return null;
    }
  }, [onViolation]);

  // 4. Request All Hardware sequentially
  const requestAllPermissions = useCallback(async () => {
    setMediaError(null);
    const cam = await requestCamera();
    const mic = await requestMicrophone();
    const screen = await requestScreenShare();
    return !!(cam && mic && screen);
  }, [requestCamera, requestMicrophone, requestScreenShare]);

  // Stop all active media streams cleanly
  const stopAllMedia = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (noiseSpikeTimerRef.current) {
      clearTimeout(noiseSpikeTimerRef.current);
      noiseSpikeTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        try { track.stop(); } catch {}
      });
      cameraStreamRef.current = null;
      setCameraStream(null);
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        try { track.stop(); } catch {}
      });
      micStreamRef.current = null;
      setMicStream(null);
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        try { track.stop(); } catch {}
      });
      screenStreamRef.current = null;
      setScreenStream(null);
    }

    setIsCameraActive(false);
    setIsMicActive(false);
    setIsScreenSharing(false);
    setAudioLevel(0);
  }, []);

  // Clean up ONLY on component unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, [stopAllMedia]);

  return {
    cameraStream,
    micStream,
    screenStream,
    isCameraActive,
    isMicActive,
    isScreenSharing,
    audioLevel,
    mediaError,
    requestCamera,
    requestMicrophone,
    requestScreenShare,
    requestAllPermissions,
    stopAllMedia,
  };
}
