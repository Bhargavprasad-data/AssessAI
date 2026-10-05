import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import { speakWarning } from '../utils/audioWarning';

export interface DetectedItem {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export function isPhoneDetectionItem(
  itemClass: string,
  score: number,
  bbox?: [number, number, number, number]
): boolean {
  const c = itemClass.toLowerCase().trim();

  // Filter out tiny background artifacts / specks
  if (bbox && bbox.length >= 4) {
    const w = bbox[2];
    const h = bbox[3];
    const minDim = Math.min(w, h);
    const maxDim = Math.max(w, h);
    const area = w * h;
    if (minDim < 14 || maxDim < 24 || area < 350) {
      return false;
    }
  }

  // Direct mobile phone / telephone classes
  if (
    c === 'cell phone' ||
    c === 'cellphone' ||
    c === 'telephone' ||
    c === 'phone' ||
    c === 'mobile' ||
    c.includes('cell phone') ||
    c.includes('mobile')
  ) {
    return score >= 0.20;
  }

  // Remote controls: phones with dark screens/cases are often detected as remotes
  if (c === 'remote') {
    return score >= 0.24;
  }

  // Clocks: modern smartphones with prominent circular camera rings or smartwatches held in view
  if (c === 'clock') {
    return score >= 0.18;
  }

  // Camera gadgets
  if (c === 'camera') {
    return score >= 0.20;
  }

  // Note: 'mouse', 'keyboard', 'laptop', 'tv' are explicitly NOT matched to avoid false alarms
  return false;
}

/**
 * Optical Mobile Camera Island Scanner:
 * Detects smartphones held facing backwards that feature a prominent concentric circular camera ring module
 * (e.g. Realme, OnePlus, Vivo, Xiaomi, Oppo camera dials) which standard 2014 COCO-SSD weights fail to classify.
 */
export function detectPhoneCameraIsland(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): DetectedItem | null {
  const targetW = 240;
  const targetH = 180;
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, targetW, targetH);
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  function getLuma(x: number, y: number): number {
    x = Math.max(0, Math.min(targetW - 1, x | 0));
    y = Math.max(0, Math.min(targetH - 1, y | 0));
    const idx = (y * targetW + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  const step = 8;
  const radii = [20, 26, 32, 40];
  const angles = [0, 0.785, 1.57, 2.356, 3.141, 3.927, 4.712, 5.498];

  let bestMatch: { cx: number; cy: number; radius: number; score: number } | null = null;
  let maxScore = 0;

  for (let cy = 30; cy < targetH - 30; cy += step) {
    for (let cx = 30; cx < targetW - 30; cx += step) {
      let centerSum = getLuma(cx, cy);
      centerSum += getLuma(cx - 5, cy) + getLuma(cx + 5, cy);
      centerSum += getLuma(cx, cy - 5) + getLuma(cx, cy + 5);
      const centerAvg = centerSum / 5;

      if (centerAvg > 65) continue; // Real phone camera lens is dark

      for (const r of radii) {
        let ringSum = 0;
        const ringVals: number[] = [];
        for (const a of angles) {
          const val = getLuma(cx + r * Math.cos(a), cy + r * Math.sin(a));
          ringSum += val;
          ringVals.push(val);
        }
        const ringAvg = ringSum / 8;

        const contrast = ringAvg - centerAvg;
        if (contrast < 42) continue;

        let ringVar = 0;
        for (const v of ringVals) {
          ringVar += (v - ringAvg) * (v - ringAvg);
        }
        ringVar /= 8;

        if (ringVar > 1800) continue;

        const score = contrast - ringVar * 0.015;
        if (score > 40 && score > maxScore) {
          maxScore = score;
          bestMatch = { cx, cy, radius: r, score };
        }
      }
    }
  }

  if (bestMatch) {
    const scaleX = (video.videoWidth || 640) / targetW;
    const scaleY = (video.videoHeight || 480) / targetH;
    const realX = bestMatch.cx * scaleX;
    const realY = bestMatch.cy * scaleY;
    const realR = bestMatch.radius * Math.max(scaleX, scaleY);
    const boxW = Math.max(60, realR * 3.2);
    const boxH = Math.max(90, realR * 4.2);

    return {
      class: 'cell phone',
      score: Math.min(0.96, Math.max(0.72, bestMatch.score / 100)),
      bbox: [
        Math.max(0, realX - boxW / 2),
        Math.max(0, realY - boxH / 2),
        boxW,
        boxH,
      ],
    };
  }

  return null;
}

export function isBookOrSecondaryScreen(
  itemClass: string,
  score: number,
  bbox?: [number, number, number, number]
): boolean {
  const c = itemClass.toLowerCase().trim();

  if (bbox && bbox.length >= 4) {
    const w = bbox[2];
    const h = bbox[3];
    if (w < 60 || h < 60 || (w * h) < 4000) {
      return false;
    }
  }

  // Unauthorized physical textbooks/notebooks brought into camera view
  if (c === 'book') {
    return score >= 0.48;
  }

  // Do NOT match 'laptop' here since candidates writing exams on laptops have their laptop base in camera frame
  return false;
}

export type FaceVerificationStatus =
  | 'no_camera'
  | 'initializing'
  | 'detecting'
  | 'face_detected'
  | 'no_face'
  | 'multiple_faces'
  | 'face_mismatch'
  | 'camera_covered';

export interface CandidateFaceProfile {
  eyeDistRatio: number;
  eyeToNoseRatio: number;
  noseToMouthRatio: number;
  eyeToMouthRatio: number;
  symmetryRatio: number;
  triangleRatio: number;
  appearanceVector: number[];
  sampleCount: number;
}

export interface UseCameraDetectionOptions {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isActive: boolean;
  onViolation?: (type: string, metadata?: Record<string, any>) => void;
  onMultipleFacesDetected?: (count: number) => void;
  onFaceMismatch?: (matchScore: number) => void;
}

// Helpers for Biometric Geometry & Appearance Matching
function dist(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function triangleArea(p1: [number, number], p2: [number, number], p3: [number, number]): number {
  return 0.5 * Math.abs(p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]));
}

function getCoord(pt: any): [number, number] {
  if (Array.isArray(pt)) {
    return [Number(pt[0]) || 0, Number(pt[1]) || 0];
  }
  if (pt && typeof pt.dataSync === 'function') {
    try {
      const data = pt.dataSync();
      return [Number(data[0]) || 0, Number(data[1]) || 0];
    } catch {}
  }
  return [0, 0];
}

function extractAppearanceVector(
  video: HTMLVideoElement,
  topLeft: [number, number],
  bottomRight: [number, number],
  canvas: HTMLCanvasElement
): number[] {
  const fw = Math.max(20, bottomRight[0] - topLeft[0]);
  const fh = Math.max(20, bottomRight[1] - topLeft[1]);
  const sx = Math.max(0, topLeft[0]);
  const sy = Math.max(0, topLeft[1]);
  const sw = Math.min(video.videoWidth - sx, fw);
  const sh = Math.min(video.videoHeight - sy, fh);

  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || sw <= 0 || sh <= 0) return new Array(48).fill(0);

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 24, 24);
  const imgData = ctx.getImageData(0, 0, 24, 24);
  const data = imgData.data;

  // 12 spatial patches (3 columns x 4 rows), each patch has 4 channels [R, G, B, Lum] = 48 values
  const vector: number[] = [];
  const patchW = 8;
  const patchH = 6;

  for (let pr = 0; pr < 4; pr++) {
    for (let pc = 0; pc < 3; pc++) {
      let rSum = 0, gSum = 0, bSum = 0;
      let count = 0;
      for (let y = pr * patchH; y < (pr + 1) * patchH; y++) {
        for (let x = pc * patchW; x < (pc + 1) * patchW; x++) {
          const idx = (y * 24 + x) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count++;
        }
      }
      const r = (rSum / Math.max(1, count)) / 255;
      const g = (gSum / Math.max(1, count)) / 255;
      const b = (bSum / Math.max(1, count)) / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      vector.push(r, g, b, lum);
    }
  }

  // Normalize vector to unit length
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function extractFaceProfile(
  video: HTMLVideoElement,
  face: any,
  canvas: HTMLCanvasElement
): CandidateFaceProfile | null {
  const tl = getCoord(face.topLeft);
  const br = getCoord(face.bottomRight);
  const landmarks = Array.isArray(face.landmarks) ? face.landmarks.map(getCoord) : [];

  const fw = Math.max(25, br[0] - tl[0]);
  const fh = Math.max(25, br[1] - tl[1]);

  if (landmarks.length < 4) return null;

  const rightEye = landmarks[0];
  const leftEye = landmarks[1];
  const nose = landmarks[2];
  const mouth = landmarks[3];

  const eyeDist = Math.max(8, dist(leftEye, rightEye));
  const eyeMidpoint: [number, number] = [(leftEye[0] + rightEye[0]) / 2, (leftEye[1] + rightEye[1]) / 2];

  const eyeDistRatio = eyeDist / fw;
  const eyeToNoseRatio = dist(eyeMidpoint, nose) / eyeDist;
  const noseToMouthRatio = dist(nose, mouth) / eyeDist;
  const eyeToMouthRatio = dist(eyeMidpoint, mouth) / eyeDist;
  const symmetryRatio = dist(leftEye, nose) / Math.max(1, dist(rightEye, nose));
  const triangleRatio = triangleArea(leftEye, rightEye, mouth) / (fw * fh);

  const appearanceVector = extractAppearanceVector(video, tl, br, canvas);

  return {
    eyeDistRatio,
    eyeToNoseRatio,
    noseToMouthRatio,
    eyeToMouthRatio,
    symmetryRatio,
    triangleRatio,
    appearanceVector,
    sampleCount: 1,
  };
}

function mergeProfiles(prev: CandidateFaceProfile, next: CandidateFaceProfile): CandidateFaceProfile {
  const count = prev.sampleCount + 1;
  const alpha = 1 / Math.min(count, 10);
  const beta = 1 - alpha;

  const mergedAppearance = prev.appearanceVector.map((v, i) => v * beta + (next.appearanceVector[i] || 0) * alpha);
  const norm = Math.sqrt(mergedAppearance.reduce((acc, v) => acc + v * v, 0)) || 1;

  return {
    eyeDistRatio: prev.eyeDistRatio * beta + next.eyeDistRatio * alpha,
    eyeToNoseRatio: prev.eyeToNoseRatio * beta + next.eyeToNoseRatio * alpha,
    noseToMouthRatio: prev.noseToMouthRatio * beta + next.noseToMouthRatio * alpha,
    eyeToMouthRatio: prev.eyeToMouthRatio * beta + next.eyeToMouthRatio * alpha,
    symmetryRatio: prev.symmetryRatio * beta + next.symmetryRatio * alpha,
    triangleRatio: prev.triangleRatio * beta + next.triangleRatio * alpha,
    appearanceVector: mergedAppearance.map((v) => v / norm),
    sampleCount: count,
  };
}

function computeFaceSimilarity(current: CandidateFaceProfile, baseline: CandidateFaceProfile): number {
  // 1. Geometric Landmark Ratios Distance
  const eyeToNoseDiff = Math.abs(current.eyeToNoseRatio - baseline.eyeToNoseRatio) / Math.max(0.1, baseline.eyeToNoseRatio);
  const noseToMouthDiff = Math.abs(current.noseToMouthRatio - baseline.noseToMouthRatio) / Math.max(0.1, baseline.noseToMouthRatio);
  const eyeToMouthDiff = Math.abs(current.eyeToMouthRatio - baseline.eyeToMouthRatio) / Math.max(0.1, baseline.eyeToMouthRatio);
  const eyeDistDiff = Math.abs(current.eyeDistRatio - baseline.eyeDistRatio) / Math.max(0.1, baseline.eyeDistRatio);
  const symmetryDiff = Math.abs(current.symmetryRatio - baseline.symmetryRatio);
  const triangleDiff = Math.abs(current.triangleRatio - baseline.triangleRatio) / Math.max(0.01, baseline.triangleRatio);

  const avgGeoDiff = (eyeToNoseDiff * 1.5 + noseToMouthDiff * 1.5 + eyeToMouthDiff * 1.5 + eyeDistDiff + symmetryDiff + triangleDiff) / 7.5;
  const geoSimilarity = Math.max(0, 1 - avgGeoDiff * 1.8);

  // 2. Cosine Similarity of Appearance Vectors
  let dot = 0;
  for (let i = 0; i < current.appearanceVector.length; i++) {
    dot += current.appearanceVector[i] * baseline.appearanceVector[i];
  }
  const appSimilarity = Math.max(0, Math.min(1, dot));

  // Combined score (55% geometry, 45% appearance)
  const combined = geoSimilarity * 0.55 + appSimilarity * 0.45;
  return Math.max(0, Math.min(1, combined));
}

const CANDIDATE_STORAGE_KEY = 'assessai_registered_candidate_profile';

export function useCameraDetection({
  cameraStream,
  isCameraActive,
  isActive,
  onViolation,
  onMultipleFacesDetected,
  onFaceMismatch,
}: UseCameraDetectionOptions) {
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [mobileWarningActive, setMobileWarningActive] = useState<boolean>(false);

  // Face Verification & Recognition State
  const [faceStatus, setFaceStatus] = useState<FaceVerificationStatus>('no_camera');
  const [isFaceDetected, setIsFaceDetected] = useState<boolean>(false);
  const [isFaceMismatch, setIsFaceMismatch] = useState<boolean>(false);
  const [faceMatchScore, setFaceMatchScore] = useState<number>(100);
  const [personCount, setPersonCount] = useState<number>(0);
  const [isBaselineRegistered, setIsBaselineRegistered] = useState<boolean>(false);

  const blazefaceModelRef = useRef<blazeface.BlazeFaceModel | null>(null);
  const cocoModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const lastViolationTimeRef = useRef<{ [key: string]: number }>({});

  // Registered Candidate Baseline Face Profile
  const candidateBaselineRef = useRef<CandidateFaceProfile | null>(null);

  // Consecutive counters for stability
  const coveredConsecutiveFramesRef = useRef<number>(0);
  const facePresentConsecutiveRef = useRef<number>(0);
  const noFaceConsecutiveFramesRef = useRef<number>(0);
  const multipleFacesConsecutiveFramesRef = useRef<number>(0);
  const faceMismatchConsecutiveRef = useRef<number>(0);
  const faceMatchNormalConsecutiveRef = useRef<number>(0);

  // Incident state machine refs for violations
  const phoneIncidentActiveRef = useRef<boolean>(false);
  const phoneConsecutiveFramesRef = useRef<number>(0);
  const phoneAbsentConsecutiveRef = useRef<number>(0);

  const bookIncidentActiveRef = useRef<boolean>(false);
  const bookConsecutiveFramesRef = useRef<number>(0);
  const bookAbsentConsecutiveRef = useRef<number>(0);

  const multipleFacesIncidentActiveRef = useRef<boolean>(false);
  const noFaceIncidentActiveRef = useRef<boolean>(false);
  const faceMismatchIncidentActiveRef = useRef<boolean>(false);

  const lookingAwayIncidentActiveRef = useRef<boolean>(false);
  const lookingAwayConsecutiveFramesRef = useRef<number>(0);
  const lookingNormalConsecutiveRef = useRef<number>(0);

  // Restore saved candidate face baseline from session if student reloaded
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CANDIDATE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.appearanceVector && parsed.eyeToNoseRatio) {
          candidateBaselineRef.current = parsed;
          setIsBaselineRegistered(true);
        }
      }
    } catch {}
  }, []);

  // 1. Initialize TensorFlow.js backend & Load BlazeFace + COCO-SSD Models in parallel
  useEffect(() => {
    let isMounted = true;

    async function loadModels() {
      if (blazefaceModelRef.current || isModelLoading) return;
      setIsModelLoading(true);
      try {
        await tf.ready();
        const [loadedBlazeFace, loadedCoco] = await Promise.all([
          blazeface.load({ maxFaces: 10, scoreThreshold: 0.50 }),
          cocoSsd.load({ base: 'mobilenet_v2' }).catch(() => cocoSsd.load()),
        ]);

        if (isMounted) {
          blazefaceModelRef.current = loadedBlazeFace;
          cocoModelRef.current = loadedCoco;
          setModelLoaded(true);
        }
      } catch (err) {
        console.warn('Failed to load face detection & proctoring AI models:', err);
      } finally {
        if (isMounted) {
          setIsModelLoading(false);
        }
      }
    }

    loadModels();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Setup hidden fallback video element for continuous frame analysis
  useEffect(() => {
    if (!hiddenVideoRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.width = 640;
      video.height = 480;
      video.style.position = 'fixed';
      video.style.top = '0px';
      video.style.left = '0px';
      video.style.width = '640px';
      video.style.height = '480px';
      video.style.opacity = '0.001';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-99999';
      document.body.appendChild(video);
      hiddenVideoRef.current = video;
    }

    const video = hiddenVideoRef.current;
    if (video && cameraStream && isCameraActive) {
      video.srcObject = cameraStream;
      const playVideo = () => {
        video.play().catch(() => {});
      };
      video.onloadedmetadata = playVideo;
      video.oncanplay = playVideo;
      playVideo();
    }

    return () => {
      if (hiddenVideoRef.current && hiddenVideoRef.current.parentNode) {
        hiddenVideoRef.current.parentNode.removeChild(hiddenVideoRef.current);
        hiddenVideoRef.current = null;
      }
    };
  }, [cameraStream, isCameraActive]);

  // Reset active incident flags on user acknowledgement or resume
  const resetDetectionIncidents = useCallback(() => {
    phoneIncidentActiveRef.current = false;
    bookIncidentActiveRef.current = false;
    multipleFacesIncidentActiveRef.current = false;
    faceMismatchIncidentActiveRef.current = false;
    noFaceIncidentActiveRef.current = false;
    phoneConsecutiveFramesRef.current = 0;
    bookConsecutiveFramesRef.current = 0;
    multipleFacesConsecutiveFramesRef.current = 0;
    faceMismatchConsecutiveRef.current = 0;
    lastViolationTimeRef.current = {};
    setMobileWarningActive(false);
  }, []);

  // 3. Trigger Incident Violation with Audio Alert
  const triggerViolation = useCallback((type: string, metadata: Record<string, any>, spokenText?: string) => {
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[type] || 0;
    // 2.5-second safety cooldown between repeated strikes of the same violation type
    if (now - lastTime < 2500) {
      return;
    }
    lastViolationTimeRef.current[type] = now;

    if (spokenText) {
      speakWarning(spokenText, true);
    }

    onViolation?.(type, metadata);
  }, [onViolation]);

  // 4. Dual-Engine Real-Time Face Verification, Multi-Face Detection, and Face Mismatch Tracking
  useEffect(() => {
    if (!isCameraActive || !cameraStream) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setDetectedItems([]);
      setMobileWarningActive(false);
      setFaceStatus('no_camera');
      setIsFaceDetected(false);
      setIsFaceMismatch(false);
      setPersonCount(0);
      return;
    }

    let isRunning = true;

    const processFrame = async () => {
      if (!isRunning) return;

      const now = Date.now();
      // Run inference every 120ms
      if (now - lastInferenceTimeRef.current >= 120 && !isDetectingRef.current) {
        const videoCandidates = [
          document.getElementById('setup-camera-video') as HTMLVideoElement | null,
          document.getElementById('proctoring-live-video') as HTMLVideoElement | null,
          hiddenVideoRef.current,
        ];
        const liveVideo =
          videoCandidates.find((v) => v && v.readyState >= 2 && v.videoWidth > 0 && !v.paused) ||
          videoCandidates.find((v) => v && v.readyState >= 2 && v.videoWidth > 0) ||
          hiddenVideoRef.current;

        if (liveVideo && liveVideo.readyState >= 2 && liveVideo.videoWidth > 0) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          try {
            // Step 1: Luminance check to detect covered / pitch black camera
            let frameIsCovered = false;
            let avgBrightness = 100;
            if (!canvasRef.current) {
              canvasRef.current = document.createElement('canvas');
            }
            const canvas = canvasRef.current;
            canvas.width = 32;
            canvas.height = 24;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(liveVideo, 0, 0, 32, 24);
              const imgData = ctx.getImageData(0, 0, 32, 24);
              const data = imgData.data;
              let sum = 0;
              const count = data.length / 4;
              for (let i = 0; i < data.length; i += 4) {
                sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              }
              avgBrightness = sum / count;
              frameIsCovered = avgBrightness < 14;
            }

            if (frameIsCovered) {
              coveredConsecutiveFramesRef.current += 1;
              facePresentConsecutiveRef.current = 0;
              if (coveredConsecutiveFramesRef.current >= 2) {
                setFaceStatus('camera_covered');
                setIsFaceDetected(false);
                setIsFaceMismatch(false);
                setPersonCount(0);
                if (isActive) {
                  triggerViolation(
                    'camera_covered',
                    { brightness: Math.round(avgBrightness) },
                    'Warning: Camera feed appears covered or pitch black. Please uncover your camera.'
                  );
                }
              }
            } else {
              coveredConsecutiveFramesRef.current = 0;

              const blazeModel = blazefaceModelRef.current;
              if (!blazeModel) {
                setFaceStatus('initializing');
                setIsFaceDetected(false);
              } else {
                // Step 2: Ultra-accurate BlazeFace Detection (Detects ALL faces directly)
                const faces = await blazeModel.estimateFaces(liveVideo, false);
                const detectedFaceCount = faces.length;
                setPersonCount(detectedFaceCount);

                // ==============================================================
                // A. MULTIPLE FACES DETECTED (> 1 FACE)
                // ==============================================================
                if (detectedFaceCount > 1) {
                  multipleFacesConsecutiveFramesRef.current += 1;
                  facePresentConsecutiveRef.current = 0;

                  // 5 consecutive frames (~600ms) confirms multiple people in frame
                  if (multipleFacesConsecutiveFramesRef.current >= 5) {
                    setFaceStatus('multiple_faces');
                    setIsFaceDetected(true);
                    setIsFaceMismatch(false);

                    if (isActive) {
                      const now = Date.now();
                      const lastMultipleFacesTime = lastViolationTimeRef.current['multiple_faces'] || 0;
                      if (!multipleFacesIncidentActiveRef.current || now - lastMultipleFacesTime >= 8000) {
                        multipleFacesIncidentActiveRef.current = true;
                        lastViolationTimeRef.current['multiple_faces'] = now;
                        onMultipleFacesDetected?.(detectedFaceCount);
                      }
                    }
                  }
                }

                // ==============================================================
                // B. NO FACE DETECTED (0 FACES)
                // ==============================================================
                else if (detectedFaceCount === 0) {
                  multipleFacesConsecutiveFramesRef.current = 0;
                  facePresentConsecutiveRef.current = 0;
                  noFaceConsecutiveFramesRef.current += 1;

                  if (noFaceConsecutiveFramesRef.current >= 2) {
                    setFaceStatus('no_face');
                    setIsFaceDetected(false);
                  }

                  if (isActive && noFaceConsecutiveFramesRef.current >= 5 && !noFaceIncidentActiveRef.current) {
                    noFaceIncidentActiveRef.current = true;
                    triggerViolation(
                      'no_face',
                      { message: 'Candidate face not visible or obstructed in camera frame' },
                      'Warning: Face not visible or obstructed. Please look at the camera to write your exam.'
                    );
                  }
                }

                // ==============================================================
                // C. EXACTLY 1 FACE DETECTED
                // ==============================================================
                else {
                  multipleFacesConsecutiveFramesRef.current = 0;
                  noFaceConsecutiveFramesRef.current = 0;
                  facePresentConsecutiveRef.current += 1;
                  noFaceIncidentActiveRef.current = false;
                  multipleFacesIncidentActiveRef.current = false;

                  const singleFace = faces[0];
                  const currentProfile = extractFaceProfile(liveVideo, singleFace, canvas);

                  // 1. If in Pre-Exam Setup Phase: Register candidate baseline profile
                  if (!isActive) {
                    if (currentProfile && facePresentConsecutiveRef.current >= 2) {
                      if (!candidateBaselineRef.current) {
                        candidateBaselineRef.current = currentProfile;
                      } else {
                        candidateBaselineRef.current = mergeProfiles(candidateBaselineRef.current, currentProfile);
                      }
                      setIsBaselineRegistered(true);
                      try {
                        sessionStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidateBaselineRef.current));
                      } catch {}
                      setFaceStatus('face_detected');
                      setIsFaceDetected(true);
                      setIsFaceMismatch(false);
                      setFaceMatchScore(100);
                    }
                  }

                  // 2. If in Active Exam Phase: Verify current face against registered candidate baseline
                  else {
                    if (currentProfile && candidateBaselineRef.current) {
                      const similarity = computeFaceSimilarity(currentProfile, candidateBaselineRef.current);
                      const similarityPercent = Math.round(similarity * 100);
                      setFaceMatchScore(similarityPercent);

                      // If similarity is below threshold (< 50%), face has changed (different person)
                      if (similarity < 0.50) {
                        faceMismatchConsecutiveRef.current += 1;
                        faceMatchNormalConsecutiveRef.current = 0;

                        // 4 consecutive frames (~500ms) of sustained face mismatch
                        if (faceMismatchConsecutiveRef.current >= 4) {
                          setFaceStatus('face_mismatch');
                          setIsFaceMismatch(true);

                          const now = Date.now();
                          const lastMismatchTime = lastViolationTimeRef.current['face_mismatch'] || 0;
                          if (!faceMismatchIncidentActiveRef.current && now - lastMismatchTime >= 12000) {
                            faceMismatchIncidentActiveRef.current = true;
                            lastViolationTimeRef.current['face_mismatch'] = now;
                            onFaceMismatch?.(similarityPercent);
                          }
                        }
                      } else {
                        // Candidate face verified & matches registered baseline
                        faceMatchNormalConsecutiveRef.current += 1;
                        faceMismatchConsecutiveRef.current = 0;

                        if (faceMatchNormalConsecutiveRef.current >= 3) {
                          faceMismatchIncidentActiveRef.current = false;
                          setIsFaceMismatch(false);
                          setFaceStatus('face_detected');
                          setIsFaceDetected(true);
                        }
                      }
                    } else {
                      // Fallback if no baseline was captured
                      setFaceStatus('face_detected');
                      setIsFaceDetected(true);
                      setIsFaceMismatch(false);
                    }

                    // Gaze / Looking away tracking from face bounding box
                    const tl = getCoord(singleFace.topLeft);
                    const br = getCoord(singleFace.bottomRight);
                    const w = liveVideo.videoWidth || 640;
                    const h = liveVideo.videoHeight || 480;
                    const centerX = (tl[0] + (br[0] - tl[0]) / 2) / w;
                    const centerY = (tl[1] + (br[1] - tl[1]) / 2) / h;
                    const isLookingAway = centerX < 0.08 || centerX > 0.92 || centerY > 0.92;

                    if (isLookingAway) {
                      lookingNormalConsecutiveRef.current = 0;
                      lookingAwayConsecutiveFramesRef.current += 1;
                      if (lookingAwayConsecutiveFramesRef.current >= 14 && !lookingAwayIncidentActiveRef.current) {
                        lookingAwayIncidentActiveRef.current = true;
                        triggerViolation(
                          'looking_away',
                          {
                            position: { centerX: Math.round(centerX * 100), centerY: Math.round(centerY * 100) },
                            message: 'Gaze / head pose deviated from examination screen',
                          },
                          'Warning: Looking away from screen detected. Please face the screen to write your exam.'
                        );
                      }
                    } else {
                      lookingNormalConsecutiveRef.current += 1;
                      lookingAwayConsecutiveFramesRef.current = 0;
                      if (lookingNormalConsecutiveRef.current >= 10) {
                        lookingAwayIncidentActiveRef.current = false;
                      }
                    }
                  }
                }

                // Step 3: Dual Mobile Detection (Optical Camera Module Scanner + COCO-SSD)
                const cocoModel = cocoModelRef.current;
                let detectedPhoneItem: DetectedItem | null = null;
                const validDetections: DetectedItem[] = [];

                // 3a. Optical Camera Module Island Scan (detects phones facing backwards with circular camera modules)
                if (canvasRef.current && liveVideo) {
                  try {
                    const islandItem = detectPhoneCameraIsland(liveVideo, canvasRef.current);
                    if (islandItem) {
                      validDetections.push(islandItem);
                      detectedPhoneItem = islandItem;
                    }
                  } catch (e) {
                    console.warn('Camera island scan error:', e);
                  }
                }

                // 3b. COCO-SSD Neural Detection (detects front screens, phones, remotes)
                if (cocoModel) {
                  try {
                    const predictions = await cocoModel.detect(liveVideo, 10, 0.18);
                    for (const p of predictions) {
                      validDetections.push({
                        class: p.class.toLowerCase(),
                        score: p.score,
                        bbox: p.bbox,
                      });
                    }
                  } catch (objErr) {
                    console.warn('COCO-SSD frame inference warning:', objErr);
                  }
                }

                setDetectedItems(validDetections);

                // A. Mobile Phone / Electronic Device Detection
                const phoneDetection =
                  detectedPhoneItem ||
                  validDetections.find((d) => isPhoneDetectionItem(d.class, d.score, d.bbox));

                    if (phoneDetection) {
                      phoneConsecutiveFramesRef.current += 1;
                      phoneAbsentConsecutiveRef.current = 0;

                      // Immediate detection: Activate warning banner & widget pill right away!
                      setMobileWarningActive(true);

                      // Trigger strike violation if confident (>= 0.34) or confirmed across 2 frames (~200ms)
                      const shouldTriggerViolation =
                        phoneDetection.score >= 0.34 || phoneConsecutiveFramesRef.current >= 2;

                      if (shouldTriggerViolation) {
                        if (isActive) {
                          phoneIncidentActiveRef.current = true;
                          triggerViolation(
                            'mobile_detected',
                            {
                              object: 'Mobile Phone',
                              detected_class: phoneDetection.class,
                              confidence: Math.round(phoneDetection.score * 100),
                              bbox: phoneDetection.bbox,
                            },
                            'Warning: Mobile phone detected. Close your mobile and please write your exam.'
                          );
                        }
                      }
                    } else {
                      phoneConsecutiveFramesRef.current = Math.max(0, phoneConsecutiveFramesRef.current - 1);
                      phoneAbsentConsecutiveRef.current += 1;
                      // Clear warning once phone is absent for 3 consecutive frames (~360ms)
                      if (phoneAbsentConsecutiveRef.current >= 3) {
                        phoneIncidentActiveRef.current = false;
                        setMobileWarningActive(false);
                      }
                    }

                    // B. Study Material / Book Detection
                    const bookDetection = validDetections.find((d) =>
                      isBookOrSecondaryScreen(d.class, d.score, d.bbox)
                    );

                    if (bookDetection && !phoneDetection) {
                      bookConsecutiveFramesRef.current += 1;
                      bookAbsentConsecutiveRef.current = 0;

                      if (bookConsecutiveFramesRef.current >= 3) {
                        if (isActive) {
                          bookIncidentActiveRef.current = true;
                          triggerViolation(
                            'unauthorized_object',
                            {
                              object: 'Study Material / Book',
                              detected_class: bookDetection.class,
                              confidence: Math.round(bookDetection.score * 100),
                              bbox: bookDetection.bbox,
                            },
                            'Warning: Unauthorized material detected. Please remove it and write your exam.'
                          );
                        }
                      }
                    } else {
                      bookConsecutiveFramesRef.current = Math.max(0, bookConsecutiveFramesRef.current - 1);
                      bookAbsentConsecutiveRef.current += 1;
                      if (bookAbsentConsecutiveRef.current >= 4) {
                        bookIncidentActiveRef.current = false;
                      }
                    }
                  }
                }
              } catch (err) {
            console.warn('Proctoring inference frame error:', err);
          } finally {
            isDetectingRef.current = false;
          }
        }
      }

      if (isRunning) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isActive,
    isCameraActive,
    cameraStream,
    triggerViolation,
    onMultipleFacesDetected,
    onFaceMismatch,
  ]);

  return {
    modelLoaded,
    isModelLoading,
    detectedItems,
    mobileWarningActive,
    faceStatus,
    isFaceDetected,
    isFaceMismatch,
    faceMatchScore,
    personCount,
    isBaselineRegistered,
    resetDetectionIncidents,
  };
}
