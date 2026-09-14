import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, Mic, Monitor, ShieldCheck, AlertCircle,
  CameraOff, MicOff, MonitorOff, Volume2, Activity,
  Minimize2, Maximize2, Smartphone, Eye, Sparkles
} from 'lucide-react';
import type { DetectedItem } from '../../hooks/useCameraDetection';

interface ProctoringMediaWidgetProps {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isMicActive: boolean;
  isScreenSharing: boolean;
  audioLevel: number;
  detectedItems?: DetectedItem[];
  mobileWarningActive?: boolean;
  modelLoaded?: boolean;
}

// Animated VU meter bars
const VuMeter: React.FC<{ level: number; isMicActive: boolean }> = ({ level, isMicActive }) => {
  const bars = 16;
  return (
    <div className="flex items-end space-x-0.5 h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = ((i + 1) / bars) * 100;
        const active = isMicActive && level >= threshold;
        const color =
          i >= 13 ? (active ? 'bg-rose-500' : 'bg-slate-700') :
          i >= 9  ? (active ? 'bg-amber-400' : 'bg-slate-700') :
                    (active ? 'bg-emerald-400' : 'bg-slate-700');
        const height = 4 + (i / bars) * 16;
        return (
          <div
            key={i}
            className={`w-1 rounded-sm transition-all duration-75 ${color}`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
};

// Status pill
const StatusPill: React.FC<{ active: boolean; label: string }> = ({ active, label }) => (
  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide ${
    active
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  }`}>
    {active ? label : 'OFFLINE'}
  </span>
);

export const ProctoringMediaWidget: React.FC<ProctoringMediaWidgetProps> = ({
  cameraStream,
  isCameraActive,
  isMicActive,
  isScreenSharing,
  audioLevel,
  detectedItems = [],
  mobileWarningActive = false,
  modelLoaded = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  // Attach camera stream
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      if (cameraStream) videoRef.current.play().catch(() => {});
    }
  }, [cameraStream]);

  // Drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  }, [offset]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
        y: dragStart.current.oy + (e.clientY - dragStart.current.my),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const allOk = isCameraActive && isMicActive && isScreenSharing;
  const anyOffline = !isCameraActive || !isMicActive || !isScreenSharing;

  // Find unauthorized objects
  const hasPhone = detectedItems.some((d) => {
    const c = d.class.toLowerCase();
    const isDevice =
      c === 'cell phone' ||
      c === 'remote' ||
      c === 'camera' ||
      c === 'telephone' ||
      c === 'laptop' ||
      c === 'tv' ||
      c === 'tablet' ||
      c === 'mouse' ||
      c === 'keyboard' ||
      c === 'electronic device' ||
      c === 'clock' ||
      c.includes('phone') ||
      c.includes('cell') ||
      c.includes('camera') ||
      c.includes('remote');
    const threshold = c === 'clock' ? 0.12 : 0.08;
    return isDevice && d.score >= threshold;
  });
  const hasBook = detectedItems.some((d) => (d.class === 'book' || d.class === 'backpack' || d.class === 'handbag') && d.score >= 0.20);

  return (
    <div
      className="fixed z-50 select-none"
      style={{
        bottom: `${24 - offset.y}px`,
        right: `${24 - offset.x}px`,
        cursor: isDragging ? 'grabbing' : 'auto',
      }}
    >
      {isMinimized ? (
        /* ── Minimized Pill ── */
        <div className={`flex items-center space-x-2.5 px-3.5 py-2 rounded-2xl border ${
          mobileWarningActive ? 'border-rose-500 bg-rose-950/95 animate-pulse' : 'border-slate-700/80 bg-slate-900/95'
        } text-white shadow-2xl backdrop-blur-xl`}>
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              mobileWarningActive ? 'bg-rose-400' : allOk ? 'bg-emerald-400' : 'bg-rose-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              mobileWarningActive ? 'bg-rose-500' : allOk ? 'bg-emerald-500' : 'bg-rose-500'
            }`} />
          </span>
          <span className="text-xs font-bold text-slate-200">
            {mobileWarningActive ? '⚠️ Mobile Detected!' : 'Proctor Active'}
          </span>

          <div className="flex items-center space-x-1 border-l border-slate-700 pl-2.5">
            {isCameraActive ? <Camera className="w-3.5 h-3.5 text-emerald-400" /> : <CameraOff className="w-3.5 h-3.5 text-rose-400" />}
            {isMicActive ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-rose-400" />}
            {isScreenSharing ? <Monitor className="w-3.5 h-3.5 text-emerald-400" /> : <MonitorOff className="w-3.5 h-3.5 text-rose-400" />}
          </div>

          <div className="border-l border-slate-700 pl-2.5">
            <VuMeter level={audioLevel} isMicActive={isMicActive} />
          </div>

          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Expand Proctoring Feed"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* ── Full Widget Card ── */
        <div
          className={`w-72 rounded-2xl border ${
            mobileWarningActive ? 'border-rose-500 ring-2 ring-rose-500/50' : 'border-slate-700/80'
          } bg-slate-900/98 shadow-2xl overflow-hidden backdrop-blur-xl transition-colors duration-200`}
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)' }}
        >
          {/* Header (draggable) */}
          <div
            onMouseDown={onMouseDown}
            className={`px-3.5 py-2.5 bg-gradient-to-r ${
              mobileWarningActive ? 'from-rose-900 to-rose-950' : 'from-slate-800 to-slate-800/60'
            } border-b border-slate-700/80 flex items-center justify-between cursor-grab active:cursor-grabbing`}
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className={`w-4 h-4 ${mobileWarningActive ? 'text-rose-400' : 'text-brand-400'}`} />
              <span className="text-xs font-bold text-white tracking-wide">Smart Proctor Feed</span>
              <span className="relative flex h-1.5 w-1.5 ml-1">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  mobileWarningActive ? 'bg-rose-400' : allOk ? 'bg-emerald-400' : 'bg-amber-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  mobileWarningActive ? 'bg-rose-500' : allOk ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Camera Viewport */}
          <div className="relative w-full bg-slate-950 overflow-hidden" style={{ height: '162px' }}>
            {isCameraActive && cameraStream ? (
              <video
                id="proctoring-live-video"
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-2 bg-gradient-to-br from-slate-950 to-slate-900">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                  <CameraOff className="w-5 h-5 text-rose-400" />
                </div>
                <p className="text-[11px] font-semibold text-rose-300">Camera Offline</p>
                <p className="text-[10px] text-slate-500">Violation will be logged</p>
              </div>
            )}

            {/* AI Object Guard Warning Banner Overlay on Mobile Detection */}
            {(mobileWarningActive || hasPhone) && (
              <div className="absolute inset-0 bg-rose-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center border-2 border-rose-500 animate-pulse z-10">
                <div className="w-9 h-9 rounded-full bg-rose-500/30 border border-rose-400 flex items-center justify-center mb-1.5 shadow-lg shadow-rose-500/50">
                  <Smartphone className="w-5 h-5 text-rose-300 animate-bounce" />
                </div>
                <span className="text-xs font-black text-white tracking-wide uppercase">
                  Mobile Phone Detected!
                </span>
                <span className="text-[10px] text-rose-200 mt-0.5 leading-tight font-medium">
                  Please put away your device immediately.
                </span>
              </div>
            )}

            {/* LIVE badge */}
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/85 backdrop-blur border border-white/10 text-[10px] font-bold text-emerald-400 flex items-center space-x-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span>LIVE</span>
            </div>

            {/* AI Guard status tag */}
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/85 backdrop-blur border border-white/10 text-[9px] font-semibold text-brand-300 flex items-center space-x-1">
              <Sparkles className="w-2.5 h-2.5 text-brand-400" />
              <span>{modelLoaded ? 'AI Object Guard Active' : 'AI Guard Initializing'}</span>
            </div>

            {/* Offline warning strip */}
            {anyOffline && !mobileWarningActive && (
              <div className="absolute bottom-0 inset-x-0 py-1.5 bg-rose-950/80 backdrop-blur border-t border-rose-500/30 flex items-center justify-center space-x-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[10px] font-bold text-rose-300">Device offline — violation recorded</span>
              </div>
            )}
          </div>

          {/* Indicators Panel */}
          <div className="p-3 bg-slate-900 space-y-2.5">
            {/* AI Vision Object Detection Status */}
            <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-1.5">
                <Eye className="w-3.5 h-3.5 text-brand-400" />
                <span className="font-semibold text-slate-300">Cam Vision Guard</span>
              </div>
              <div className="flex items-center space-x-1.5">
                {mobileWarningActive || hasPhone ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                    PHONE DETECTED
                  </span>
                ) : hasBook ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    BOOK DETECTED
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    SCANNING (CLEAR)
                  </span>
                )}
              </div>
            </div>

            {/* Microphone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  {isMicActive
                    ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    : <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                  <span className="text-[11px] font-semibold text-slate-300">Microphone</span>
                </div>
                <StatusPill active={isMicActive} label="LIVE" />
              </div>
              <div className="px-1">
                <VuMeter level={audioLevel} isMicActive={isMicActive} />
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] text-slate-600">0</span>
                <div className="flex items-center space-x-1">
                  <Activity className="w-2.5 h-2.5 text-slate-500" />
                  <span className={`text-[9px] font-bold ${
                    audioLevel > 75 ? 'text-rose-400' :
                    audioLevel > 40 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{audioLevel}%</span>
                  {audioLevel > 75 && <span className="text-[9px] text-rose-400 animate-pulse font-bold">⚠ Loud</span>}
                </div>
                <span className="text-[9px] text-slate-600">100</span>
              </div>
            </div>

            {/* Screen Share */}
            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                {isScreenSharing
                  ? <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  : <MonitorOff className="w-3.5 h-3.5 text-rose-400" />}
                <span className="text-[11px] font-semibold text-slate-300">Screen Share</span>
              </div>
              <StatusPill active={isScreenSharing} label="SHARING" />
            </div>

            {/* Camera */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                {isCameraActive
                  ? <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  : <CameraOff className="w-3.5 h-3.5 text-rose-400" />}
                <span className="text-[11px] font-semibold text-slate-300">Face Camera</span>
              </div>
              <StatusPill active={isCameraActive} label="ACTIVE" />
            </div>
          </div>

          {/* Footer status bar */}
          <div className={`px-3.5 py-2 flex items-center justify-between border-t border-slate-800 ${
            mobileWarningActive ? 'bg-rose-950/60' : allOk ? 'bg-emerald-950/40' : 'bg-rose-950/40'
          }`}>
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className={`w-3.5 h-3.5 ${mobileWarningActive ? 'text-rose-400' : allOk ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span className={`text-[10px] font-bold tracking-wide ${mobileWarningActive ? 'text-rose-400' : allOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                {mobileWarningActive ? 'UNAUTHORIZED OBJECT DETECTED' : allOk ? 'ALL SYSTEMS NOMINAL' : 'DEVICE OFFLINE — LOGGED'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
