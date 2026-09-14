import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { speakWarning } from '../utils/audioWarning';

export interface DetectedItem {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface UseCameraDetectionOptions {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isActive: boolean;
  onViolation?: (type: string, metadata?: Record<string, any>) => void;
}

export function useCameraDetection({
  cameraStream,
  isCameraActive,
  isActive,
  onViolation,
}: UseCameraDetectionOptions) {
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [mobileWarningActive, setMobileWarningActive] = useState<boolean>(false);

  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastViolationTimeRef = useRef<{ [key: string]: number }>({});

  // Discrete Incident State Machine Refs (Each appearance/occurrence counts as exactly 1 strike)
  const phoneIncidentActiveRef = useRef<boolean>(false);
  const phoneAbsentConsecutiveRef = useRef<number>(0);

  const bookIncidentActiveRef = useRef<boolean>(false);
  const bookAbsentConsecutiveRef = useRef<number>(0);

  const multipleFacesIncidentActiveRef = useRef<boolean>(false);
  const multipleFacesNormalConsecutiveRef = useRef<number>(0);

  const noFaceIncidentActiveRef = useRef<boolean>(false);
  const noFaceConsecutiveFramesRef = useRef<number>(0);
  const facePresentConsecutiveRef = useRef<number>(0);

  const lookingAwayIncidentActiveRef = useRef<boolean>(false);
  const lookingAwayConsecutiveFramesRef = useRef<number>(0);
  const lookingNormalConsecutiveRef = useRef<number>(0);

  // 1. Initialize TensorFlow.js backend & Load COCO-SSD Model
  useEffect(() => {
    let isMounted = true;

    async function loadModel() {
      if (modelRef.current || isModelLoading) return;
      setIsModelLoading(true);
      try {
        await tf.ready();
        let loadedModel: cocoSsd.ObjectDetection | null = null;
        try {
          loadedModel = await cocoSsd.load({ base: 'mobilenet_v2' });
        } catch {
          try {
            loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
          } catch {
            loadedModel = await cocoSsd.load();
          }
        }

        if (isMounted && loadedModel) {
          modelRef.current = loadedModel;
          setModelLoaded(true);
        }
      } catch (err) {
        console.warn('Failed to load COCO-SSD object detection model:', err);
      } finally {
        if (isMounted) {
          setIsModelLoading(false);
        }
      }
    }

    loadModel();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Setup hidden fallback video and canvas elements for continuous frame analysis
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
      video.style.opacity = '0.005';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-99999';
      document.body.appendChild(video);
      hiddenVideoRef.current = video;
    }

    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;
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

  // 3. Trigger Incident Violation and Speak Warning
  const triggerViolation = useCallback((type: string, metadata: Record<string, any>, spokenText?: string) => {
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[type] || 0;
    // 1.5s minimal safety threshold
    if (now - lastTime < 1500) {
      return;
    }
    lastViolationTimeRef.current[type] = now;

    if (spokenText) {
      speakWarning(spokenText, true);
    }

    onViolation?.(type, metadata);
  }, [onViolation]);

  // 4. Continuous AI Object Detection & State Machine Loop
  useEffect(() => {
    if (!isActive || !isCameraActive || !cameraStream || !modelLoaded || !modelRef.current) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      setDetectedItems([]);
      setMobileWarningActive(false);
      return;
    }

    const runDetection = async () => {
      const liveVideo = (document.getElementById('proctoring-live-video') as HTMLVideoElement) || hiddenVideoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;

      if (!liveVideo || !canvas || !model) return;
      if (liveVideo.readyState < 2 || liveVideo.videoWidth === 0) return;

      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const w = liveVideo.videoWidth || 640;
        const h = liveVideo.videoHeight || 480;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.drawImage(liveVideo, 0, 0, w, h);

        // Sensitive object detection inference
        const predictions = await model.detect(canvas, 30, 0.04);
        
        const validDetections: DetectedItem[] = predictions.map((p) => ({
          class: p.class.toLowerCase(),
          score: p.score,
          bbox: p.bbox,
        }));

        setDetectedItems(validDetections);

        // -------------------------------------------------------------
        // A. MOBILE PHONE / ELECTRONIC DEVICE (Counted per physical appearance)
        // -------------------------------------------------------------
        const phoneDetection = validDetections.find((d) => {
          const c = d.class.toLowerCase();
          const isPhoneOrDevice =
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
            c.includes('remote') ||
            c.includes('tablet') ||
            c.includes('device');

          const threshold = (c === 'clock') ? 0.10 : 0.05;
          return isPhoneOrDevice && d.score >= threshold;
        });

        if (phoneDetection) {
          // Phone is currently visible in frame
          setMobileWarningActive(true);
          phoneAbsentConsecutiveRef.current = 0;

          // If this is a NEW appearance (rising edge), log exactly 1 strike
          if (!phoneIncidentActiveRef.current) {
            phoneIncidentActiveRef.current = true;
            triggerViolation(
              'mobile_detected',
              {
                object: 'Mobile Phone / Camera / Electronic Device',
                detected_class: phoneDetection.class,
                confidence: Math.round(phoneDetection.score * 100),
                bbox: phoneDetection.bbox,
              },
              'Warning: Mobile phone detected. Close your mobile and please write your exam.'
            );
          }
          // While phone stays visible, phoneIncidentActiveRef remains true so NO additional strikes are logged!
        } else {
          // Phone is absent in current frame
          phoneAbsentConsecutiveRef.current += 1;
          // After 6 consecutive clear frames (~1.5s), mark phone removed and reset incident
          if (phoneAbsentConsecutiveRef.current >= 6) {
            setMobileWarningActive(false);
            phoneIncidentActiveRef.current = false;
          }
        }

        // -------------------------------------------------------------
        // B. UNAUTHORIZED STUDY MATERIALS / BOOKS
        // -------------------------------------------------------------
        const bookDetection = validDetections.find((d) => {
          const c = d.class.toLowerCase();
          return (
            c === 'book' ||
            c === 'backpack' ||
            c === 'handbag' ||
            c === 'suitcase' ||
            c === 'scissors'
          ) && d.score >= 0.15;
        });

        if (bookDetection && !phoneDetection) {
          bookAbsentConsecutiveRef.current = 0;
          if (!bookIncidentActiveRef.current) {
            bookIncidentActiveRef.current = true;
            triggerViolation(
              'unauthorized_object',
              {
                object: 'Study Material / Prohibited Item',
                detected_class: bookDetection.class,
                confidence: Math.round(bookDetection.score * 100),
              },
              'Warning: Unauthorized study material detected. Please remove it and write your exam.'
            );
          }
        } else {
          bookAbsentConsecutiveRef.current += 1;
          if (bookAbsentConsecutiveRef.current >= 6) {
            bookIncidentActiveRef.current = false;
          }
        }

        // -------------------------------------------------------------
        // C. PERSONS / FACES / GAZE TRACKING
        // -------------------------------------------------------------
        const persons = validDetections.filter((d) => d.class === 'person' && d.score >= 0.25);

        // Multiple persons
        if (persons.length > 1) {
          multipleFacesNormalConsecutiveRef.current = 0;
          if (!multipleFacesIncidentActiveRef.current) {
            multipleFacesIncidentActiveRef.current = true;
            triggerViolation(
              'multiple_faces',
              {
                count: persons.length,
                message: `${persons.length} persons detected in camera frame`,
              },
              'Warning: Multiple persons detected in camera frame.'
            );
          }
          noFaceConsecutiveFramesRef.current = 0;
          lookingAwayConsecutiveFramesRef.current = 0;
        } else {
          multipleFacesNormalConsecutiveRef.current += 1;
          if (multipleFacesNormalConsecutiveRef.current >= 6) {
            multipleFacesIncidentActiveRef.current = false;
          }
        }

        // No face / Candidate absent
        if (persons.length === 0) {
          facePresentConsecutiveRef.current = 0;
          noFaceConsecutiveFramesRef.current += 1;
          lookingAwayConsecutiveFramesRef.current = 0;

          if (noFaceConsecutiveFramesRef.current >= 4 && !noFaceIncidentActiveRef.current) {
            noFaceIncidentActiveRef.current = true;
            triggerViolation(
              'no_face',
              { message: 'Candidate face not visible in camera frame' },
              'Warning: Face not visible. Please look at the camera to write your exam.'
            );
          }
        } else {
          facePresentConsecutiveRef.current += 1;
          noFaceConsecutiveFramesRef.current = 0;
          if (facePresentConsecutiveRef.current >= 6) {
            noFaceIncidentActiveRef.current = false;
          }
        }

        // Looking away / Gaze deviation (when single person is present)
        if (persons.length === 1) {
          const candidate = persons[0];
          const [px, py, pw, ph] = candidate.bbox;
          const centerX = (px + pw / 2) / w;
          const centerY = (py + ph / 2) / h;

          const isLookingAway = centerX < 0.14 || centerX > 0.86 || centerY > 0.88;

          if (isLookingAway) {
            lookingNormalConsecutiveRef.current = 0;
            lookingAwayConsecutiveFramesRef.current += 1;
            if (lookingAwayConsecutiveFramesRef.current >= 5 && !lookingAwayIncidentActiveRef.current) {
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
            if (lookingNormalConsecutiveRef.current >= 6) {
              lookingAwayIncidentActiveRef.current = false;
            }
          }
        }
      } catch (err) {
        console.warn('Object detection inference frame error:', err);
      }
    };

    detectionIntervalRef.current = setInterval(runDetection, 250);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [isActive, isCameraActive, cameraStream, modelLoaded, triggerViolation]);

  return {
    modelLoaded,
    isModelLoading,
    detectedItems,
    mobileWarningActive,
  };
}
