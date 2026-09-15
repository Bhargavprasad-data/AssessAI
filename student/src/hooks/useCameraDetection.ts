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
  const animationFrameRef = useRef<number | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const lastViolationTimeRef = useRef<{ [key: string]: number }>({});

  // Discrete Incident State Machine Refs (Each physical appearance counts as exactly 1 strike)
  const phoneIncidentActiveRef = useRef<boolean>(false);
  const phoneConsecutiveFramesRef = useRef<number>(0);
  const phoneAbsentConsecutiveRef = useRef<number>(0);

  const bookIncidentActiveRef = useRef<boolean>(false);
  const bookConsecutiveFramesRef = useRef<number>(0);
  const bookAbsentConsecutiveRef = useRef<number>(0);

  const multipleFacesIncidentActiveRef = useRef<boolean>(false);
  const multipleFacesConsecutiveFramesRef = useRef<number>(0);
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

  // 3. Trigger Incident Violation and Speak Warning
  const triggerViolation = useCallback((type: string, metadata: Record<string, any>, spokenText?: string) => {
    const now = Date.now();
    const lastTime = lastViolationTimeRef.current[type] || 0;
    // 6-second safety cooldown between repeated strikes of the same violation type
    if (now - lastTime < 6000) {
      return;
    }
    lastViolationTimeRef.current[type] = now;

    if (spokenText) {
      speakWarning(spokenText, true);
    }

    onViolation?.(type, metadata);
  }, [onViolation]);

  // 4. Fast & Accurate AI Object Detection Loop
  useEffect(() => {
    if (!isActive || !isCameraActive || !cameraStream || !modelLoaded || !modelRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setDetectedItems([]);
      setMobileWarningActive(false);
      return;
    }

    let isRunning = true;

    const processFrame = async () => {
      if (!isRunning) return;

      const now = Date.now();
      // Run inference every 120ms
      if (now - lastInferenceTimeRef.current >= 120 && !isDetectingRef.current) {
        const liveVideo = (document.getElementById('proctoring-live-video') as HTMLVideoElement) || hiddenVideoRef.current;
        const model = modelRef.current;

        if (liveVideo && model && liveVideo.readyState >= 2 && liveVideo.videoWidth > 0) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          try {
            // High-speed direct WebGL tensor detection directly from video element
            const predictions = await model.detect(liveVideo, 15, 0.30);

            const validDetections: DetectedItem[] = predictions.map((p) => ({
              class: p.class.toLowerCase(),
              score: p.score,
              bbox: p.bbox,
            }));

            setDetectedItems(validDetections);

            const w = liveVideo.videoWidth || 640;
            const h = liveVideo.videoHeight || 480;

            // -------------------------------------------------------------
            // A. MOBILE PHONE DETECTION (Strictly targeted at confirmed cell phones)
            // Filters out false positives (hands, pens, remotes, ambient shadows)
            // -------------------------------------------------------------
            const phoneDetection = validDetections.find((d) => {
              const c = d.class.toLowerCase();
              if (c === 'cell phone' || c === 'telephone') {
                const [, , bw, bh] = d.bbox;
                const bboxArea = bw * bh;
                const totalArea = w * h;
                // Verify high confidence (>= 0.65) and realistic physical proportions
                const isPlausibleSize = bboxArea > 400 && bboxArea < (totalArea * 0.85);
                return d.score >= 0.65 && isPlausibleSize;
              }
              return false;
            });

            if (phoneDetection) {
              phoneConsecutiveFramesRef.current += 1;
              phoneAbsentConsecutiveRef.current = 0;

              // Require sustained presence over 6 consecutive frames (~750ms) to avoid transient flickers
              if (phoneConsecutiveFramesRef.current >= 6) {
                setMobileWarningActive(true);

                // If newly detected in this physical appearance, trigger exactly 1 strike
                if (!phoneIncidentActiveRef.current) {
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
              phoneConsecutiveFramesRef.current = 0;
              phoneAbsentConsecutiveRef.current += 1;
              // Reset incident only after 25 consecutive clean frames (~3 seconds of sustained absence)
              if (phoneAbsentConsecutiveRef.current >= 25) {
                setMobileWarningActive(false);
                phoneIncidentActiveRef.current = false;
              }
            }

            // -------------------------------------------------------------
            // B. UNAUTHORIZED STUDY MATERIALS / BOOKS
            // -------------------------------------------------------------
            const bookDetection = validDetections.find((d) => {
              const c = d.class.toLowerCase();
              return c === 'book' && d.score >= 0.65;
            });

            if (bookDetection && !phoneDetection) {
              bookConsecutiveFramesRef.current += 1;
              bookAbsentConsecutiveRef.current = 0;
              if (bookConsecutiveFramesRef.current >= 6 && !bookIncidentActiveRef.current) {
                bookIncidentActiveRef.current = true;
                triggerViolation(
                  'unauthorized_object',
                  {
                    object: 'Study Material / Book',
                    detected_class: bookDetection.class,
                    confidence: Math.round(bookDetection.score * 100),
                  },
                  'Warning: Unauthorized study material detected. Please remove it and write your exam.'
                );
              }
            } else {
              bookConsecutiveFramesRef.current = 0;
              bookAbsentConsecutiveRef.current += 1;
              if (bookAbsentConsecutiveRef.current >= 25) {
                bookIncidentActiveRef.current = false;
              }
            }

            // -------------------------------------------------------------
            // C. PERSONS / MULTIPLE FACES / NO FACE
            // -------------------------------------------------------------
            const persons = validDetections.filter((d) => d.class === 'person' && d.score >= 0.55);

            // Multiple persons in camera view
            if (persons.length > 1) {
              multipleFacesConsecutiveFramesRef.current += 1;
              multipleFacesNormalConsecutiveRef.current = 0;
              if (multipleFacesConsecutiveFramesRef.current >= 6 && !multipleFacesIncidentActiveRef.current) {
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
              multipleFacesConsecutiveFramesRef.current = 0;
              multipleFacesNormalConsecutiveRef.current += 1;
              if (multipleFacesNormalConsecutiveRef.current >= 20) {
                multipleFacesIncidentActiveRef.current = false;
              }
            }

            // No face / Candidate absent
            if (persons.length === 0) {
              facePresentConsecutiveRef.current = 0;
              noFaceConsecutiveFramesRef.current += 1;
              lookingAwayConsecutiveFramesRef.current = 0;

              // Require 12 consecutive absent frames (~1.5s) to prevent single-frame blinks or brief posture shifts
              if (noFaceConsecutiveFramesRef.current >= 12 && !noFaceIncidentActiveRef.current) {
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
              if (facePresentConsecutiveRef.current >= 8) {
                noFaceIncidentActiveRef.current = false;
              }
            }

            // Looking away / Gaze deviation (when single person is present)
            if (persons.length === 1) {
              const candidate = persons[0];
              const [px, py, pw, ph] = candidate.bbox;
              const centerX = (px + pw / 2) / w;
              const centerY = (py + ph / 2) / h;

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
          } catch (err) {
            console.warn('Object detection inference frame error:', err);
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
  }, [isActive, isCameraActive, cameraStream, modelLoaded, triggerViolation]);

  return {
    modelLoaded,
    isModelLoading,
    detectedItems,
    mobileWarningActive,
  };
}
