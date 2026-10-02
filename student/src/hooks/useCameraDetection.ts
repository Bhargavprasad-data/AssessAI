import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { speakWarning } from '../utils/audioWarning';

export interface DetectedItem {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export type FaceVerificationStatus =
  | 'no_camera'
  | 'initializing'
  | 'detecting'
  | 'face_detected'
  | 'no_face'
  | 'multiple_faces'
  | 'camera_covered';

export interface UseCameraDetectionOptions {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isActive: boolean;
  isSimulatedHardware?: boolean;
  onViolation?: (type: string, metadata?: Record<string, any>) => void;
}

export function useCameraDetection({
  cameraStream,
  isCameraActive,
  isActive,
  isSimulatedHardware = false,
  onViolation,
}: UseCameraDetectionOptions) {
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [mobileWarningActive, setMobileWarningActive] = useState<boolean>(false);

  // Face Verification State
  const [faceStatus, setFaceStatus] = useState<FaceVerificationStatus>('no_camera');
  const [isFaceDetected, setIsFaceDetected] = useState<boolean>(false);
  const [isCameraCovered, setIsCameraCovered] = useState<boolean>(false);
  const [personCount, setPersonCount] = useState<number>(0);

  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const lastViolationTimeRef = useRef<{ [key: string]: number }>({});
  const faceDetectorRef = useRef<any>(null);

  // Consecutive counters for stability
  const coveredConsecutiveFramesRef = useRef<number>(0);
  const facePresentConsecutiveRef = useRef<number>(0);
  const noFaceConsecutiveFramesRef = useRef<number>(0);
  const multipleFacesConsecutiveFramesRef = useRef<number>(0);
  const multipleFacesNormalConsecutiveRef = useRef<number>(0);

  // Incident State Machine Refs for exam violations
  const phoneIncidentActiveRef = useRef<boolean>(false);
  const phoneConsecutiveFramesRef = useRef<number>(0);
  const phoneAbsentConsecutiveRef = useRef<number>(0);

  const bookIncidentActiveRef = useRef<boolean>(false);
  const bookConsecutiveFramesRef = useRef<number>(0);
  const bookAbsentConsecutiveRef = useRef<number>(0);

  const multipleFacesIncidentActiveRef = useRef<boolean>(false);
  const noFaceIncidentActiveRef = useRef<boolean>(false);

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

  // 4. Continuous AI Object & Face Detection Loop (Runs both in setup and exam session)
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
      setIsCameraCovered(false);
      setPersonCount(0);
      return;
    }

    if (isSimulatedHardware) {
      setFaceStatus('face_detected');
      setIsFaceDetected(true);
      setIsCameraCovered(false);
      setPersonCount(1);
      return;
    }

    let isRunning = true;

    const processFrame = async () => {
      if (!isRunning) return;

      const now = Date.now();
      // Run inference every 120ms for smooth, responsive detection without overloading GPU
      if (now - lastInferenceTimeRef.current >= 120 && !isDetectingRef.current) {
        const liveVideo =
          (document.getElementById('setup-camera-video') as HTMLVideoElement) ||
          (document.getElementById('proctoring-live-video') as HTMLVideoElement) ||
          hiddenVideoRef.current;

        if (liveVideo && liveVideo.readyState >= 2 && liveVideo.videoWidth > 0) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          try {
            // 1. Direct luminance check to detect covered / black / obscured camera
            let frameIsCovered = false;
            let avgBrightness = 100;
            try {
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
                // Average luminance < 14 indicates lens is covered, closed, taped, or pitch black
                frameIsCovered = avgBrightness < 14;
              }
            } catch {
              // canvas draw error fallback
            }

            if (frameIsCovered) {
              coveredConsecutiveFramesRef.current += 1;
              facePresentConsecutiveRef.current = 0;
              if (coveredConsecutiveFramesRef.current >= 2) {
                setIsCameraCovered(true);
                setFaceStatus('camera_covered');
                setIsFaceDetected(false);
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
              setIsCameraCovered(false);

              // 2. AI Person & Face Detection
              const model = modelRef.current;
              if (!model) {
                setFaceStatus('initializing');
                setIsFaceDetected(false);
              } else {
                const predictions = await model.detect(liveVideo, 15, 0.30);
                const validDetections: DetectedItem[] = predictions.map((p) => ({
                  class: p.class.toLowerCase(),
                  score: p.score,
                  bbox: p.bbox,
                }));
                setDetectedItems(validDetections);

                const w = liveVideo.videoWidth || 640;
                const h = liveVideo.videoHeight || 480;

                // Candidate / Persons Detection
                const persons = validDetections.filter((d) => d.class === 'person' && d.score >= 0.45);
                setPersonCount(persons.length);

                // Optional native FaceDetector double check if supported in browser
                let nativeFaceCount = 0;
                if (typeof (window as any).FaceDetector !== 'undefined') {
                  try {
                    if (!faceDetectorRef.current) {
                      faceDetectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
                    }
                    const faces = await faceDetectorRef.current.detect(liveVideo);
                    if (faces && Array.isArray(faces)) {
                      nativeFaceCount = faces.length;
                    }
                  } catch {}
                }

                if (persons.length === 0 && nativeFaceCount === 0) {
                  facePresentConsecutiveRef.current = 0;
                  noFaceConsecutiveFramesRef.current += 1;
                  lookingAwayConsecutiveFramesRef.current = 0;

                  if (noFaceConsecutiveFramesRef.current >= 2) {
                    setFaceStatus('no_face');
                    setIsFaceDetected(false);
                  }

                  if (isActive && noFaceConsecutiveFramesRef.current >= 12 && !noFaceIncidentActiveRef.current) {
                    noFaceIncidentActiveRef.current = true;
                    triggerViolation(
                      'no_face',
                      { message: 'Candidate face not visible in camera frame' },
                      'Warning: Face not visible. Please look at the camera to write your exam.'
                    );
                  }
                } else if (persons.length > 1 || nativeFaceCount > 1) {
                  facePresentConsecutiveRef.current = 0;
                  setFaceStatus('multiple_faces');
                  setIsFaceDetected(false);

                  if (isActive) {
                    multipleFacesConsecutiveFramesRef.current += 1;
                    multipleFacesNormalConsecutiveRef.current = 0;
                    if (multipleFacesConsecutiveFramesRef.current >= 6 && !multipleFacesIncidentActiveRef.current) {
                      multipleFacesIncidentActiveRef.current = true;
                      triggerViolation(
                        'multiple_faces',
                        {
                          count: Math.max(persons.length, nativeFaceCount),
                          message: `${Math.max(persons.length, nativeFaceCount)} persons detected in camera frame`,
                        },
                        'Warning: Multiple persons detected in camera frame.'
                      );
                    }
                  }
                } else {
                  // Exactly 1 person/face detected
                  const candidate = persons[0];
                  const [, , pw, ph] = candidate ? candidate.bbox : [0, 0, 100, 100];
                  if (pw > 35 && ph > 35) {
                    facePresentConsecutiveRef.current += 1;
                    noFaceConsecutiveFramesRef.current = 0;
                    if (facePresentConsecutiveRef.current >= 2) {
                      setFaceStatus('face_detected');
                      setIsFaceDetected(true);
                      noFaceIncidentActiveRef.current = false;
                    }
                  }

                  // Looking away check during active exam
                  if (isActive && candidate) {
                    const [px, py] = candidate.bbox;
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
                }

                // If active exam, also check for cell phones and study materials
                if (isActive) {
                  // A. Mobile phone detection
                  const phoneDetection = validDetections.find((d) => {
                    const c = d.class.toLowerCase();
                    if (c === 'cell phone' || c === 'telephone') {
                      const [, , bw, bh] = d.bbox;
                      const bboxArea = bw * bh;
                      const totalArea = w * h;
                      const isPlausibleSize = bboxArea > 400 && bboxArea < (totalArea * 0.85);
                      return d.score >= 0.65 && isPlausibleSize;
                    }
                    return false;
                  });

                  if (phoneDetection) {
                    phoneConsecutiveFramesRef.current += 1;
                    phoneAbsentConsecutiveRef.current = 0;
                    if (phoneConsecutiveFramesRef.current >= 6) {
                      setMobileWarningActive(true);
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
                    if (phoneAbsentConsecutiveRef.current >= 25) {
                      phoneIncidentActiveRef.current = false;
                      setMobileWarningActive(false);
                    }
                  }

                  // B. Study Material / Book detection
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
  }, [isActive, isCameraActive, cameraStream, isSimulatedHardware, triggerViolation]);

  return {
    modelLoaded,
    isModelLoading,
    detectedItems,
    mobileWarningActive,
    faceStatus,
    isFaceDetected,
    isCameraCovered,
    personCount,
  };
}
