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
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Request Camera Permission
  const requestCamera = async () => {
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
        ? 'No camera found. Connect a webcam or click "Enable Simulated Hardware" below.'
        : isDenied
        ? 'Camera permission denied. Please allow camera access in your browser.'
        : `Camera error: ${err.message || 'unavailable'}`;
      setMediaError(msg);
      setIsCameraActive(false);
      return null;
    }
  };

  // 2. Request Microphone Permission & Setup Audio Analyser
  const requestMicrophone = async () => {
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

          // Audio spike / noise detection (>55% sustained for 1.2 seconds, exactly 1 strike per noise episode)
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
        ? 'No microphone found. Connect a mic or click "Enable Simulated Hardware" below.'
        : isDenied
        ? 'Microphone permission denied. Please allow microphone access in your browser.'
        : `Microphone error: ${err.message || 'unavailable'}`;
      setMediaError(msg);
      setIsMicActive(false);
      return null;
    }
  };

  // 3. Request Screen Sharing Permission
  const requestScreenShare = async () => {
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
  };

  // 4. Request All Hardware sequentially
  const requestAllPermissions = async () => {
    setMediaError(null);
    const cam = await requestCamera();
    const mic = await requestMicrophone();
    const screen = await requestScreenShare();
    return !!(cam && mic && screen);
  };

  // 5. Simulated Hardware Fallback (For devices without physical webcam/mic or dev testing)
  const enableSimulatedHardware = useCallback(() => {
    setMediaError(null);

    // Stop any existing simulated intervals
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    // A. Simulated Camera Canvas (320x240 animated stream)
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const draw = () => {
      if (!ctx) return;
      frame++;
      // Dark gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, 240);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 320, 240);

      // Student avatar head
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(160, 95, 45, 0, Math.PI * 2);
      ctx.fill();

      // Student avatar shoulders
      ctx.beginPath();
      ctx.ellipse(160, 200, 75, 45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Facial detection box
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(110, 50, 100, 100);

      // Status text
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('AI PROCTOR: STUDENT VERIFIED', 14, 24);

      // Pulsing recording indicator
      const pulse = (Math.sin(frame * 0.15) + 1) / 2;
      ctx.fillStyle = `rgba(16, 185, 129, ${0.4 + pulse * 0.6})`;
      ctx.beginPath();
      ctx.arc(300, 20, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    simIntervalRef.current = setInterval(draw, 50);

    const simVideoStream = canvas.captureStream(25);
    simVideoStream.getVideoTracks()[0].onended = () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
    };

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    cameraStreamRef.current = simVideoStream;
    setCameraStream(simVideoStream);
    setIsCameraActive(true);

    // B. Simulated Microphone with synthetic audio
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.005, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      const simAudioStream = dest.stream;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      micStreamRef.current = simAudioStream;
      setMicStream(simAudioStream);
      setIsMicActive(true);
      setAudioLevel(22);
    } catch {
      setIsMicActive(true);
      setAudioLevel(20);
    }

    // C. Simulated Screen Share Canvas
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 640;
    screenCanvas.height = 360;
    const sCtx = screenCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#090d16';
      sCtx.fillRect(0, 0, 640, 360);
      sCtx.fillStyle = '#38bdf8';
      sCtx.font = 'bold 16px sans-serif';
      sCtx.fillText('Active Exam Screen (Monitoring Active)', 30, 50);
      sCtx.fillStyle = '#64748b';
      sCtx.font = '12px sans-serif';
      sCtx.fillText('Smart Proctoring System Workspace Sharing Stream', 30, 80);
    }
    const simScreenStream = screenCanvas.captureStream(5);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    screenStreamRef.current = simScreenStream;
    setScreenStream(simScreenStream);
    setIsScreenSharing(true);

    return true;
  }, []);

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
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
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
    enableSimulatedHardware,
    stopAllMedia,
  };
}
