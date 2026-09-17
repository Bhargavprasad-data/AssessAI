import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import type { Question } from '../types';
import { DifficultyBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { cleanQuestionText } from '../utils/textCleaner';
import {
  UploadCloud, AlertTriangle, Trash2, ArrowRight, CheckCircle2, Loader2,
  FileText, Plus, X, CheckSquare, Square, FolderOpen, Edit3, Check, Calendar, Clock
} from 'lucide-react';

interface UploadedMaterialItem {
  id: string;
  filename: string;
  character_count?: number;
  size?: number;
  uploaded_at?: string;
}

export const AssessmentBuilder: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();

  // Active step (defaults to 'config' (Settings & Save) if editing an existing assessment, else 'material')
  const [activeTab, setActiveTab] = useState<'material' | 'questions' | 'config'>(
    assessmentId ? 'config' : 'material'
  );

  // Multi-Material & AI Job State
  const [materials, setMaterials] = useState<UploadedMaterialItem[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [libraryMaterials, setLibraryMaterials] = useState<UploadedMaterialItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState(false);
  const [showClearLibraryModal, setShowClearLibraryModal] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingStatus, setUploadingStatus] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [requestedCount, setRequestedCount] = useState<number | ''>(15);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);

  // Assessment Config State
  const [title, setTitle] = useState('New Adaptive Assessment');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | ''>(60); // in minutes, default 60 min
  const [perQuestionLimit, setPerQuestionLimit] = useState<number | '' | undefined>(60);
  const [fastThreshold, setFastThreshold] = useState<number | ''>(30);
  const [enableSpeedAdaptive, setEnableSpeedAdaptive] = useState(true);
  const [maxQuestionCount, setMaxQuestionCount] = useState<number | ''>(6);
  const [promotionThreshold, setPromotionThreshold] = useState<number | ''>(1);
  const [demotionThreshold, setDemotionThreshold] = useState<number | ''>(1);
  const [maxViolations, setMaxViolations] = useState<number | ''>(3);
  const [banOnBreach, setBanOnBreach] = useState(true);
  const [deviceSwitchAsViolation, setDeviceSwitchAsViolation] = useState(false);
  const [scheduledStart, setScheduledStart] = useState<string>('');
  const [scheduledEnd, setScheduledEnd] = useState<string>('');

  // Sufficiency Warning Modal State
  const [sufficiencyWarning, setSufficiencyWarning] = useState<{
    message: string;
    total_eligible: number;
    required: number;
  } | null>(null);

  // Floating Toast Notification State (Fixed position, same as Delete Test toast)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const setError = (msg: string | null) => {
    if (msg) showToast('error', msg);
  };

  const setSuccess = (msg: string | null) => {
    if (msg) showToast('success', msg);
  };

  const [saving, setSaving] = useState(false);

  // Helper to deduplicate materials by filename and ID
  const deduplicateMaterials = (list: UploadedMaterialItem[]): UploadedMaterialItem[] => {
    const seen = new Set<string>();
    const result: UploadedMaterialItem[] = [];
    for (const item of list) {
      const key = item.filename ? item.filename.trim().toLowerCase() : item.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  };

  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState<boolean>(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const isDraftLoadedRef = useRef(false);
  const isFetchingQuestionsRef = useRef(false);
  const selectedMaterialIdsRef = useRef(selectedMaterialIds);
  selectedMaterialIdsRef.current = selectedMaterialIds;
  const jobIdRef = useRef(jobId);
  jobIdRef.current = jobId;
  const DRAFT_STORAGE_KEY = 'assessai_assessment_builder_draft';

  // Load questions for all selected materials (stable callback with in-flight guard)
  const loadQuestionsForSelectedMaterials = useCallback(async (targetJobId?: string | null, targetMatIds?: string[]) => {
    if (isFetchingQuestionsRef.current) return;

    const matIds = targetMatIds && targetMatIds.length > 0 ? targetMatIds : Array.from(selectedMaterialIdsRef.current);
    if (matIds.length === 0) return;

    isFetchingQuestionsRef.current = true;
    try {
      const payload: any = { material_ids: matIds, include_retired: false };
      const effectiveJobId = targetJobId || jobIdRef.current;
      if (effectiveJobId) {
        payload.job_id = effectiveJobId;
      }

      const qList = await apiFetch<Question[]>('/api/teacher/materials/questions-batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (qList && qList.length > 0) {
        setQuestions(prev => {
          if (prev.length === 0) return qList;
          const existingIds = new Set(prev.map(q => q.id));
          const toAdd = qList.filter(q => !existingIds.has(q.id));
          return toAdd.length === 0 ? prev : [...prev, ...toAdd];
        });
        setSelectedQuestionIds(prev => {
          const next = new Set(prev);
          let changed = false;
          qList.forEach((q: Question) => {
            if (!next.has(q.id)) {
              next.add(q.id);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }
    } catch (err: any) {
      console.warn('Could not load questions for materials:', err);
    } finally {
      isFetchingQuestionsRef.current = false;
    }
  }, []); // Empty dependency array: completely stable across renders

  // 1. Restore draft on mount when creating a new assessment (runs ONCE on mount)
  useEffect(() => {
    if (assessmentId) return;

    try {
      const savedRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && typeof saved === 'object') {
          if (saved.title) setTitle(saved.title);
          if (saved.timeLimitMinutes !== undefined && saved.timeLimitMinutes !== '') setTimeLimitMinutes(saved.timeLimitMinutes);
          if (saved.perQuestionLimit !== undefined) setPerQuestionLimit(saved.perQuestionLimit);
          if (saved.fastThreshold !== undefined && saved.fastThreshold !== '') setFastThreshold(saved.fastThreshold);
          if (saved.enableSpeedAdaptive !== undefined) setEnableSpeedAdaptive(saved.enableSpeedAdaptive);
          if (saved.maxQuestionCount !== undefined && saved.maxQuestionCount !== '') setMaxQuestionCount(saved.maxQuestionCount);
          if (saved.promotionThreshold !== undefined && saved.promotionThreshold !== '') setPromotionThreshold(saved.promotionThreshold);
          if (saved.demotionThreshold !== undefined && saved.demotionThreshold !== '') setDemotionThreshold(saved.demotionThreshold);
          if (saved.maxViolations !== undefined && saved.maxViolations !== '') setMaxViolations(saved.maxViolations);
          if (saved.banOnBreach !== undefined) setBanOnBreach(saved.banOnBreach);
          if (saved.deviceSwitchAsViolation !== undefined) setDeviceSwitchAsViolation(saved.deviceSwitchAsViolation);
          if (saved.scheduledStart) setScheduledStart(saved.scheduledStart);
          if (saved.scheduledEnd) setScheduledEnd(saved.scheduledEnd);

          if (saved.materials && Array.isArray(saved.materials) && saved.materials.length > 0) {
            setMaterials(saved.materials);
          }
          if (saved.selectedMaterialIds && Array.isArray(saved.selectedMaterialIds) && saved.selectedMaterialIds.length > 0) {
            setSelectedMaterialIds(new Set(saved.selectedMaterialIds));
          }

          if (saved.questions && Array.isArray(saved.questions) && saved.questions.length > 0) {
            setQuestions(saved.questions);
            if (saved.selectedQuestionIds && Array.isArray(saved.selectedQuestionIds)) {
              setSelectedQuestionIds(new Set(saved.selectedQuestionIds));
            } else {
              setSelectedQuestionIds(new Set(saved.questions.map((q: any) => q.id)));
            }
            setHasRestoredDraft(true);
          }

          if (saved.activeTab) {
            setActiveTab(saved.activeTab);
          } else if (saved.questions && saved.questions.length > 0) {
            setActiveTab('questions');
          }

          if (saved.jobId) {
            setJobId(saved.jobId);
            setJobStatus(saved.jobStatus || 'queued');
          }
        }
      }
    } catch (err) {
      console.warn('Failed to restore draft from localStorage:', err);
    } finally {
      isDraftLoadedRef.current = true;
    }
  }, []); // Run strictly once on mount

  // 2. Auto-save draft to localStorage whenever builder state changes
  useEffect(() => {
    if (assessmentId) return;
    if (!isDraftLoadedRef.current) return;

    // Skip saving empty default state
    if (materials.length === 0 && questions.length === 0 && !jobId && (!title || title === 'New Adaptive Assessment')) {
      return;
    }

    const draft = {
      activeTab,
      materials,
      selectedMaterialIds: Array.from(selectedMaterialIds),
      questions,
      selectedQuestionIds: Array.from(selectedQuestionIds),
      jobId,
      jobStatus,
      title,
      timeLimitMinutes,
      perQuestionLimit,
      fastThreshold,
      enableSpeedAdaptive,
      maxQuestionCount,
      promotionThreshold,
      demotionThreshold,
      maxViolations,
      banOnBreach,
      deviceSwitchAsViolation,
      scheduledStart,
      scheduledEnd,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn('Failed to save assessment builder draft:', e);
    }
  }, [
    assessmentId,
    activeTab,
    materials,
    selectedMaterialIds,
    questions,
    selectedQuestionIds,
    jobId,
    jobStatus,
    title,
    timeLimitMinutes,
    perQuestionLimit,
    fastThreshold,
    enableSpeedAdaptive,
    maxQuestionCount,
    promotionThreshold,
    demotionThreshold,
    maxViolations,
    banOnBreach,
    deviceSwitchAsViolation,
    scheduledStart,
    scheduledEnd,
  ]);

  // Discard draft and start fresh
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {}
    setMaterials([]);
    setSelectedMaterialIds(new Set());
    setQuestions([]);
    setSelectedQuestionIds(new Set());
    setJobId(null);
    setJobStatus(null);
    setTitle('New Adaptive Assessment');
    setTimeLimitMinutes(60);
    setScheduledStart('');
    setScheduledEnd('');
    setActiveTab('material');
    setHasRestoredDraft(false);
    showToast('success', 'Draft discarded. Starting fresh assessment.');
  };

  // Load existing materials from library on mount (runs strictly once)
  useEffect(() => {
    let isMounted = true;
    const loadLibrary = async () => {
      try {
        const list = await apiFetch<UploadedMaterialItem[]>('/api/teacher/materials');
        if (!isMounted) return;
        const dedupedList = deduplicateMaterials(list);
        setLibraryMaterials(dedupedList);
      } catch (err) {
        // Silently handle
      }
    };
    loadLibrary();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load existing assessment & its assigned questions when editing
  useEffect(() => {
    if (!assessmentId) return;
    setActiveTab('config');
    const loadAssessment = async () => {
      setLoadingAssessment(true);
      try {
        const a = await apiFetch<any>(`/api/teacher/assessments/${assessmentId}`);
        if (a) {
          setTitle(a.title || 'New Adaptive Assessment');
          setTimeLimitMinutes(Math.max(1, Math.round((a.time_limit_seconds || 1800) / 60)));
          setPerQuestionLimit(a.per_question_time_limit_seconds ?? undefined);
          setFastThreshold(a.fast_response_threshold_seconds || 30);
          setEnableSpeedAdaptive(a.enable_speed_adaptive ?? true);
          setMaxQuestionCount(a.max_question_count || 6);
          setPromotionThreshold(a.promotion_threshold ?? 1);
          setDemotionThreshold(a.demotion_threshold ?? 1);
          setMaxViolations(a.max_violations ?? 3);
          setBanOnBreach(a.ban_on_violation_breach ?? true);
          setDeviceSwitchAsViolation(a.device_switch_as_violation ?? false);
          setEditingStatus(a.status || 'published');
          if (a.scheduled_start_at) {
            try {
              const d = new Date(a.scheduled_start_at);
              const offset = d.getTimezoneOffset() * 60000;
              setScheduledStart(new Date(d.getTime() - offset).toISOString().slice(0, 16));
            } catch {}
          }
          if (a.scheduled_end_at) {
            try {
              const d = new Date(a.scheduled_end_at);
              const offset = d.getTimezoneOffset() * 60000;
              setScheduledEnd(new Date(d.getTime() - offset).toISOString().slice(0, 16));
            } catch {}
          }
        }

        // Fetch questions assigned to this assessment
        try {
          const qList = await apiFetch<Question[]>(`/api/teacher/assessments/${assessmentId}/questions`);
          if (qList && qList.length > 0) {
            setQuestions(qList);
            setSelectedQuestionIds(new Set(qList.map((q: Question) => q.id)));

            // Extract material IDs from questions
            const matIds = Array.from(new Set(qList.map(q => q.material_id).filter(Boolean)));
            setSelectedMaterialIds(new Set(matIds));
          }
        } catch (qErr) {
          console.warn('Could not load assessment questions:', qErr);
        }
      } catch (err) {
        console.warn('Could not load assessment details:', err);
      } finally {
        setLoadingAssessment(false);
      }
    };
    loadAssessment();
  }, [assessmentId]);

  // Poll AI job status
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;

    let isSubscribed = true;
    let authFailCount = 0;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<any>(`/api/teacher/jobs/${jobId}`);
        if (!isSubscribed) return;
        authFailCount = 0; // reset on success
        setJobStatus(res.status);
        if (res.status === 'completed') {
          clearInterval(interval);
          await loadQuestionsForSelectedMaterials(jobId);
          setActiveTab('questions');
          setSuccess(`Successfully generated ${res.valid_count || ''} questions across all selected PDFs!`);
        } else if (res.status === 'failed') {
          clearInterval(interval);
          setJobError(res.failure_reason || 'AI generation encountered an issue. You can retry generating.');
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        const msg = (err.message || '').toLowerCase();
        // If it is an auth/token error, retry silently up to 3 times rather than reporting failure
        if (msg.includes('authentication') || msg.includes('access token') || msg.includes('unauthorized') || msg.includes('expired')) {
          authFailCount++;
          if (authFailCount >= 3) {
            clearInterval(interval);
            setJobError('Session expired during generation. Please log in again and retry.');
          }
          // Otherwise keep polling silently — the auto-refresh in apiFetch will handle it
        } else {
          setJobError(err.message);
        }
      }
    }, 1500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [jobId, jobStatus]);

  // Multiple PDF Upload Handler
  const uploadFiles = async (filesToUpload: FileList | File[]) => {
    const fileArray = Array.from(filesToUpload).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (fileArray.length === 0) {
      setError('Please select valid PDF files (.pdf).');
      return;
    }

    setUploading(true);
    setUploadingStatus(`Uploading and parsing ${fileArray.length} PDF(s)...`);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    fileArray.forEach(f => {
      formData.append('files', f);
    });

    try {
      const res = await apiFetch<any>('/api/teacher/materials/upload', {
        method: 'POST',
        body: formData,
      });

      const newMaterials: UploadedMaterialItem[] = res.materials || (res.id ? [res] : []);
      
      setMaterials(prev => {
        const combined = [...prev];
        newMaterials.forEach(nm => {
          const idx = combined.findIndex(m => m.id === nm.id || m.filename.toLowerCase() === nm.filename.toLowerCase());
          if (idx >= 0) {
            combined[idx] = nm;
          } else {
            combined.push(nm);
          }
        });
        return deduplicateMaterials(combined);
      });

      // Also update library materials list
      setLibraryMaterials(prev => {
        const combined = [...prev];
        newMaterials.forEach(nm => {
          const idx = combined.findIndex(m => m.id === nm.id || m.filename.toLowerCase() === nm.filename.toLowerCase());
          if (idx >= 0) {
            combined[idx] = nm;
          } else {
            combined.push(nm);
          }
        });
        return deduplicateMaterials(combined);
      });

      // Automatically select all uploaded materials
      setSelectedMaterialIds(prev => {
        const next = new Set(prev);
        newMaterials.forEach(m => next.add(m.id));
        return next;
      });

      setSuccess(`Successfully uploaded and parsed ${newMaterials.length} PDF document(s).`);
    } catch (err: any) {
      setError(err.message || 'Failed to upload and parse PDF materials.');
    } finally {
      setUploading(false);
      setUploadingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove a material from current builder selection
  const removeMaterial = (matId: string) => {
    setMaterials(prev => prev.filter(m => m.id !== matId));
    setSelectedMaterialIds(prev => {
      const next = new Set(prev);
      next.delete(matId);
      return next;
    });
  };

  // Toggle selection for a material
  const toggleMaterialSelection = (matId: string) => {
    setSelectedMaterialIds(prev => {
      const next = new Set(prev);
      if (next.has(matId)) next.delete(matId);
      else next.add(matId);
      return next;
    });
  };

  // Add material from library
  const addFromLibrary = (mat: UploadedMaterialItem) => {
    setMaterials(prev => {
      const idx = prev.findIndex(m => m.id === mat.id || m.filename.toLowerCase() === mat.filename.toLowerCase());
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = mat;
        return deduplicateMaterials(updated);
      }
      return deduplicateMaterials([...prev, mat]);
    });
    setSelectedMaterialIds(prev => new Set(prev).add(mat.id));
    // Immediately fetch any existing questions for this material into the question pool
    loadQuestionsForSelectedMaterials(null, [mat.id]);
  };

  // Delete material permanently from library & database
  const confirmDeleteMaterial = async () => {
    if (!materialToDelete) return;
    const { id: matId, filename } = materialToDelete;
    setDeletingMaterial(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/teacher/materials/${matId}`, { method: 'DELETE' });
      setLibraryMaterials(prev => prev.filter(m => m.id !== matId && m.filename.toLowerCase() !== filename.toLowerCase()));
      setMaterials(prev => prev.filter(m => m.id !== matId && m.filename.toLowerCase() !== filename.toLowerCase()));
      setSelectedMaterialIds(prev => {
        const next = new Set(prev);
        next.delete(matId);
        return next;
      });
      // Also remove questions generated from this material
      setQuestions(prev => prev.filter(q => q.material_id !== matId));
      setSelectedQuestionIds(prev => {
        const next = new Set(prev);
        questions.filter(q => q.material_id === matId).forEach(q => next.delete(q.id));
        return next;
      });
      setSuccess(`Successfully deleted "${filename}" permanently.`);
      setMaterialToDelete(null);
    } catch (err: any) {
      const msg = err.message || '';
      // If already 404 or not found on server, remove from UI cleanly
      if (msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('failed to load resource')) {
        setLibraryMaterials(prev => prev.filter(m => m.id !== matId && m.filename.toLowerCase() !== filename.toLowerCase()));
        setMaterials(prev => prev.filter(m => m.id !== matId && m.filename.toLowerCase() !== filename.toLowerCase()));
        setSelectedMaterialIds(prev => {
          const next = new Set(prev);
          next.delete(matId);
          return next;
        });
        setQuestions(prev => prev.filter(q => q.material_id !== matId));
        setSelectedQuestionIds(prev => {
          const next = new Set(prev);
          questions.filter(q => q.material_id === matId).forEach(q => next.delete(q.id));
          return next;
        });
        setSuccess(`Removed "${filename}" from view.`);
        setMaterialToDelete(null);
      } else {
        setError(msg || 'Failed to delete course material.');
      }
    } finally {
      setDeletingMaterial(false);
    }
  };

  // Delete all materials permanently from library & database
  const confirmClearAllLibrary = async () => {
    setClearingLibrary(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/api/teacher/materials', { method: 'DELETE' });
      setLibraryMaterials([]);
      setMaterials([]);
      setSelectedMaterialIds(new Set());
      setQuestions([]);
      setSelectedQuestionIds(new Set());
      setSuccess('Successfully deleted all PDF documents from your library.');
      setShowClearLibraryModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to clear PDF library.');
    } finally {
      setClearingLibrary(false);
    }
  };

  // Trigger AI generation across all selected PDFs
  const handleTriggerGeneration = async () => {
    const matIds = Array.from(selectedMaterialIds);
    if (matIds.length === 0) {
      setError('Please select at least one PDF material to generate questions from.');
      return;
    }
    setError(null);
    setJobError(null);

    const count = typeof requestedCount === 'number' ? requestedCount : 15;
    try {
      const res = await apiFetch<any>('/api/teacher/materials/generate-multiple', {
        method: 'POST',
        body: JSON.stringify({
          material_ids: matIds,
          count: count,
        }),
      });
      setJobId(res.job_id);
      setJobStatus('queued');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Soft-retire question
  const handleRetireQuestion = async (qId: string) => {
    try {
      await apiFetch(`/api/teacher/questions/${qId}`, { method: 'DELETE' });
      setQuestions(prev => prev.map(q => q.id === qId ? { ...q, retired_at: new Date().toISOString() } : q));
      setSelectedQuestionIds(prev => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Switch correct option for a question
  const handleSetCorrectOption = async (qId: string, optIdx: number) => {
    const origQuestions = [...questions];
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, correct_option_index: optIdx } : q));
    try {
      await apiFetch(`/api/teacher/questions/${qId}`, {
        method: 'PUT',
        body: JSON.stringify({ correct_option_index: optIdx }),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update correct option.');
      setQuestions(origQuestions);
    }
  };

  // Save full question edits (text, options, difficulty)
  const handleSaveEditedQuestion = async (updatedQ: Question) => {
    setSavingQuestionEdit(true);
    setError(null);
    try {
      const res = await apiFetch<Question>(`/api/teacher/questions/${updatedQ.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          text: updatedQ.text,
          options: updatedQ.options,
          correct_option_index: updatedQ.correct_option_index,
          difficulty: updatedQ.difficulty,
        }),
      });
      setQuestions(prev => prev.map(q => q.id === updatedQ.id ? { ...q, ...res } : q));
      setEditingQuestion(null);
      setSuccess('Question updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save question edits.');
    } finally {
      setSavingQuestionEdit(false);
    }
  };

  // Save or Publish Assessment
  const handleSaveAssessment = async (publishNow: boolean, overrideSufficiency: boolean = false) => {
    if (publishNow && selectedQuestionIds.size === 0) {
      showToast('error', 'Cannot publish an assessment with zero questions. Please select or generate questions into the pool first.');
      setActiveTab('questions');
      return;
    }

    setSaving(true);

    const finalMaxCount = typeof maxQuestionCount === 'number' ? maxQuestionCount : 6;
    const finalPromTh = typeof promotionThreshold === 'number' && promotionThreshold >= 1 ? promotionThreshold : 1;
    const finalDemTh = typeof demotionThreshold === 'number' && demotionThreshold >= 1 ? demotionThreshold : 1;
    const payload = {
      title,
      time_limit_seconds: Math.max(60, (typeof timeLimitMinutes === 'number' ? timeLimitMinutes : 30) * 60),
      per_question_time_limit_seconds: typeof perQuestionLimit === 'number' ? perQuestionLimit : null,
      fast_response_threshold_seconds: typeof fastThreshold === 'number' ? fastThreshold : 30,
      enable_speed_adaptive: enableSpeedAdaptive,
      max_question_count: finalMaxCount,
      promotion_threshold: finalPromTh,
      demotion_threshold: finalDemTh,
      max_violations: typeof maxViolations === 'number' ? maxViolations : 3,
      scoring_weights: { easy: 1.0, medium: 2.0, hard: 3.0 },
      promotion_rules: { promotion_threshold: finalPromTh, demotion_threshold: finalDemTh },
      ban_on_violation_breach: banOnBreach,
      device_switch_as_violation: deviceSwitchAsViolation,
      scheduled_start_at: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduled_end_at: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      question_ids: Array.from(selectedQuestionIds),
    };

    try {
      let currentId = assessmentId;
      if (!currentId) {
        const created = await apiFetch<any>('/api/teacher/assessments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        currentId = created.id;
      } else {
        await apiFetch(`/api/teacher/assessments/${currentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }

      if (publishNow && currentId) {
        try {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {}
        if (editingStatus === 'published') {
          showToast('success', 'Assessment updated and saved successfully!');
          setTimeout(() => navigate(`/teacher/assessments/${currentId}/analytics`), 1200);
        } else {
          try {
            await apiFetch<any>(`/api/teacher/assessments/${currentId}/publish`, {
              method: 'POST',
              body: JSON.stringify({ override_sufficiency: overrideSufficiency }),
            });
            setSufficiencyWarning(null);
            showToast('success', 'Assessment published successfully!');
            setTimeout(() => navigate(`/teacher/assessments/${currentId}/analytics`), 1200);
          } catch (pubErr: any) {
            if (pubErr.message.includes('already published')) {
              showToast('success', 'Assessment updated and saved successfully!');
              setTimeout(() => navigate(`/teacher/assessments/${currentId}/analytics`), 1200);
            } else if (pubErr.message.includes('pool_insufficient') || pubErr.message.includes('eligible questions')) {
              setSufficiencyWarning({
                message: pubErr.message,
                total_eligible: selectedQuestionIds.size,
                required: finalMaxCount,
              });
            } else {
              throw pubErr;
            }
          }
        }
      } else {
        try {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {}
        showToast('success', assessmentId ? 'Assessment changes saved successfully!' : 'Draft saved successfully!');
        setTimeout(() => navigate('/teacher/dashboard'), 1200);
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Map material ID to material filename helper
  const getMaterialFilename = (matId: string) => {
    const found = materials.find(m => m.id === matId) || libraryMaterials.find(m => m.id === matId);
    return found ? found.filename : 'PDF Document';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {assessmentId ? 'Edit Assessment' : 'Assessment Builder'}
            </h1>
            {assessmentId && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 font-bold uppercase tracking-wider">
                {editingStatus ? editingStatus.toUpperCase() : 'EDITING'}
              </span>
            )}
            {loadingAssessment && (
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {assessmentId
              ? `Editing parameters and question pool for "${title}".`
              : 'Upload multiple PDFs, generate comprehensive MCQs, and configure proctoring.'}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('material')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'material' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            1. Materials ({selectedMaterialIds.size} Selected)
          </button>
          <button
            onClick={() => {
              setActiveTab('questions');
              if (questions.length === 0 && selectedMaterialIds.size > 0) {
                loadQuestionsForSelectedMaterials();
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'questions' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            2. Question Pool ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'config' ? 'bg-brand-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            3. Exam Timing &amp; {assessmentId ? 'Save' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Draft Restored Banner */}
      {hasRestoredDraft && !assessmentId && (
        <div className="mb-6 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center space-x-2.5 text-indigo-700 dark:text-indigo-300">
            <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span>
              <strong>Draft Session Preserved:</strong> We automatically saved and restored your generated questions ({questions.length}) and configured settings across page refreshes.
            </span>
          </div>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="self-end sm:self-auto px-3 py-1.5 rounded-xl text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-500/20 transition-colors cursor-pointer whitespace-nowrap"
          >
            Discard Draft &amp; Start Fresh
          </button>
        </div>
      )}

      {/* Tab 1: Multi-Material & AI Generation */}
      {activeTab === 'material' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload & Materials Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Upload Course PDFs</h3>
                {materials.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20">
                    {selectedMaterialIds.size} of {materials.length} Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Upload one or multiple PDF documents (up to 20MB each). Questions will be generated across all selected materials.
              </p>

              {/* Hidden Multi-File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadFiles(e.target.files);
                  }
                }}
                className="hidden"
                id="pdf-multi-upload"
              />

              {/* Upload Dropzone with Animated Border */}
              <div
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                    fileInputRef.current.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    uploadFiles(e.dataTransfer.files);
                  }
                }}
                className={`transition-all cursor-pointer ${
                  uploading || isDragging || materials.length > 0
                    ? 'animated-dropzone-glow shadow-lg shadow-brand-500/10'
                    : 'border-2 border-dashed border-slate-300 dark:border-white/15 rounded-2xl hover:border-brand-500/60'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div
                  className={`p-6 text-center transition-all ${
                    uploading || isDragging || materials.length > 0
                      ? 'animated-dropzone-inner'
                      : 'rounded-2xl bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                  }`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center justify-center space-y-2 py-2">
                      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{uploadingStatus}</p>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-brand-500 mx-auto mb-2 animate-bounce" />
                      <span className="text-sm font-bold text-brand-600 dark:text-brand-400 hover:underline block">
                        Choose Multiple PDF files
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Drag &amp; drop multiple PDFs here, or click to browse files
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded Materials List with Dynamic Border Animation */}
              {materials.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-200 dark:border-white/10">
                    <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>Selected PDFs for Exam Pool ({materials.length})</span>
                    </span>
                    <div className="space-x-3">
                      <button
                        type="button"
                        onClick={() => setSelectedMaterialIds(new Set(materials.map((m) => m.id)))}
                        className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                      >
                        Select All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMaterialIds(new Set())}
                        className="text-slate-500 hover:text-slate-700 dark:hover:text-white font-medium"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {materials.map((mat) => {
                      const isSelected = selectedMaterialIds.has(mat.id);
                      return isSelected ? (
                        <div key={mat.id} className="animated-pdf-card">
                          <div className="animated-pdf-card-inner p-3.5 flex items-center justify-between">
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => toggleMaterialSelection(mat.id)}
                                className="text-brand-600 dark:text-brand-400 flex-shrink-0"
                              >
                                <CheckSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                              </button>
                              <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 flex-shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-xs font-bold text-slate-900 dark:text-white truncate"
                                  title={mat.filename}
                                >
                                  {mat.filename}
                                </p>
                                <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {mat.character_count ? (
                                    <span>{mat.character_count.toLocaleString()} chars</span>
                                  ) : (
                                    <span>PDF Document</span>
                                  )}
                                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/20" />
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
                                    <span>✓ Ready for Generation</span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => removeMaterial(mat.id)}
                                className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                title="Remove from this assessment selection"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setMaterialToDelete({ id: mat.id, filename: mat.filename })}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Delete PDF permanently from library & database"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={mat.id}
                          className="rounded-2xl p-3.5 border transition-all flex items-center justify-between bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/10 opacity-70"
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleMaterialSelection(mat.id)}
                              className="text-slate-400 flex-shrink-0"
                            >
                              <Square className="w-5 h-5 text-slate-400" />
                            </button>
                            <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-500 flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-xs font-bold text-slate-900 dark:text-white truncate"
                                title={mat.filename}
                              >
                                {mat.filename}
                              </p>
                              <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {mat.character_count ? (
                                  <span>{mat.character_count.toLocaleString()} chars</span>
                                ) : (
                                  <span>PDF Document</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => removeMaterial(mat.id)}
                              className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                              title="Remove from this assessment selection"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMaterialToDelete({ id: mat.id, filename: mat.filename })}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Delete PDF permanently from library & database"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Library Accordion */}
              {libraryMaterials.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowLibrary(!showLibrary)}
                      className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-brand-500" />
                      <span>Select from your PDF Library ({libraryMaterials.length} available)</span>
                      <span className="text-[11px] text-slate-400 ml-1">{showLibrary ? 'Hide ▲' : 'Show ▼'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearLibraryModal(true)}
                      className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1 rounded-lg flex items-center space-x-1 transition-colors"
                      title="Permanently remove all PDF materials from your library"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All PDFs</span>
                    </button>
                  </div>

                  {showLibrary && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {libraryMaterials.map((libMat) => {
                        const isAdded = materials.some(m => m.id === libMat.id);
                        return (
                          <div
                            key={libMat.id}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                          >
                            <span className="truncate max-w-[130px] font-medium text-slate-800 dark:text-slate-200" title={libMat.filename}>
                              {libMat.filename}
                            </span>
                            <div className="flex items-center space-x-1.5 flex-shrink-0">
                              {isAdded ? (
                                <span className="text-[10px] text-emerald-600 font-semibold px-2 py-0.5 rounded bg-emerald-500/10">Added</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addFromLibrary(libMat)}
                                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 transition-colors flex items-center space-x-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setMaterialToDelete({ id: libMat.id, filename: libMat.filename })}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Delete PDF permanently from library & database"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* AI Generator Column */}
          <div className="lg:col-span-5">
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">AI Question Generation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Generates questions evenly distributed across all {selectedMaterialIds.size} selected PDF materials.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                    Total MCQs to Generate
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={requestedCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRequestedCount(val === '' ? '' : (parseInt(val) || ''));
                    }}
                    onBlur={() => {
                      if (requestedCount === '' || (typeof requestedCount === 'number' && requestedCount < 3)) {
                        setRequestedCount(15);
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {selectedMaterialIds.size > 0
                      ? `~${Math.ceil((typeof requestedCount === 'number' ? requestedCount : 15) / selectedMaterialIds.size)} questions generated per PDF.`
                      : 'Select PDF materials to generate questions.'}
                  </p>
                </div>

                <button
                  onClick={handleTriggerGeneration}
                  disabled={selectedMaterialIds.size === 0 || jobStatus === 'processing'}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-500/25 transition-all disabled:opacity-40 flex items-center justify-center space-x-2"
                >
                  {jobStatus === 'processing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {jobStatus === 'processing'
                      ? 'AI Engine Generating Questions...'
                      : `Generate Questions from ${selectedMaterialIds.size} PDF${selectedMaterialIds.size === 1 ? '' : 's'}`}
                  </span>
                </button>

                {/* Dynamic 6-Step Processing Status Tracker */}
                {jobStatus && (
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-900 dark:text-white">Pipeline Status:</span>
                      <span className={`uppercase font-extrabold px-2 py-0.5 rounded-md text-[10px] ${
                        jobStatus === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : jobStatus === 'failed'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 animate-pulse'
                      }`}>
                        {jobStatus}
                      </span>
                    </div>

                    {/* Step Flow List */}
                    <div className="space-y-2 text-[11px] pt-1 border-t border-slate-200 dark:border-white/10">
                      {[
                        { label: 'PDF Uploaded', activeState: 'uploaded', done: true },
                        { label: 'Text Extracted', activeState: 'extracted', done: true },
                        { label: 'Content Processed & Chunked', activeState: 'chunked', done: true },
                        { label: 'AI Generation (Easy, Medium, Hard)', activeState: 'processing', done: jobStatus === 'completed' },
                        { label: 'Questions Validated & Deduplicated', activeState: 'validating', done: jobStatus === 'completed' },
                        { label: 'Dynamic Question Pool Created', activeState: 'completed', done: jobStatus === 'completed' },
                      ].map((step, idx) => {
                        const isCurrent = jobStatus === 'processing' && idx === 3;
                        const isFinished = step.done && (jobStatus === 'completed' || idx < 3);

                        return (
                          <div key={idx} className="flex items-center space-x-2">
                            {isFinished ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            ) : isCurrent ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500 flex-shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-white/20 flex-shrink-0 inline-block" />
                            )}
                            <span className={
                              isFinished
                                ? 'text-slate-800 dark:text-slate-200 font-medium'
                                : isCurrent
                                ? 'text-brand-600 dark:text-brand-400 font-bold'
                                : 'text-slate-400 dark:text-slate-500'
                            }>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {jobError && (
                      <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-bold mb-1">Generation Failed</strong>
                          {jobError.toLowerCase().includes('session expired') || jobError.toLowerCase().includes('authentication') || jobError.toLowerCase().includes('access token') ? (
                            <>
                              <span className="block">Your login session expired during AI generation.</span>
                              <span className="block mt-1 text-[10px] text-rose-500 font-semibold">
                                Please refresh the page, log in again, and retry generating.
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{jobError}</span>
                              <span className="block mt-1 text-[10px] text-rose-500">
                                Please verify your PDF and re-upload. No static questions are served.
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Question Pool Review */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-white/10 mb-4">
            <span className="text-xs text-slate-700 dark:text-slate-300">
              Selected <strong className="text-slate-900 dark:text-white">{selectedQuestionIds.size}</strong> of {questions.length} questions for assessment pool.
            </span>
            <button
              onClick={() => setActiveTab('config')}
              className="py-2 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold flex items-center space-x-1.5"
            >
              <span>Next: Settings & Publish</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {questions.map((q) => {
              const isSelected = selectedQuestionIds.has(q.id);
              const isRetired = !!q.retired_at;

              return (
                <div
                  key={q.id}
                  className={`glass-panel rounded-2xl p-6 border transition-all ${
                    isRetired
                      ? 'opacity-50 border-dashed border-slate-300 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40'
                      : isSelected
                      ? 'border-brand-500/40'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center space-x-3">
                      {!isRetired && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedQuestionIds);
                            if (e.target.checked) next.add(q.id);
                            else next.delete(q.id);
                            setSelectedQuestionIds(next);
                          }}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-600 focus:ring-brand-500"
                        />
                      )}
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{cleanQuestionText(q.text)}</h4>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 truncate max-w-[140px]" title={getMaterialFilename(q.material_id)}>
                        📄 {getMaterialFilename(q.material_id)}
                      </span>
                      <DifficultyBadge difficulty={q.difficulty} size="sm" />
                      {q.is_duplicate_flag && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          Semantic Duplicate Flag
                        </span>
                      )}
                      {isRetired && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                          RETIRED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 text-xs">
                    {q.options.map((opt: string, optIdx: number) => {
                      const isCorrect = optIdx === q.correct_option_index;
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={isRetired}
                          onClick={() => handleSetCorrectOption(q.id, optIdx)}
                          title={isCorrect ? 'Marked as correct answer' : 'Click to set this option as the correct answer'}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between group ${
                            isCorrect
                              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-800 dark:text-emerald-200 font-semibold shadow-sm ring-1 ring-emerald-500/30'
                              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-800 dark:text-slate-300 hover:border-brand-500/50 hover:bg-brand-50/50 dark:hover:bg-brand-950/20'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 font-bold transition-colors ${
                              isCorrect
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'border border-slate-300 dark:border-slate-600 text-slate-500 group-hover:border-brand-500 group-hover:text-brand-500'
                            }`}>
                              {['A', 'B', 'C', 'D'][optIdx] || optIdx + 1}
                            </span>
                            <span className="truncate">{opt}</span>
                          </div>
                          {isCorrect ? (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider ml-2 flex-shrink-0 flex items-center space-x-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>CORRECT</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-brand-600 dark:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0 font-medium">
                              Set Correct
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Source: {q.source_chunk_ref}</span>
                    {!isRetired && (
                      <div className="flex items-center space-x-4">
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(JSON.parse(JSON.stringify(q)))}
                          className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center space-x-1 font-semibold"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Question</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRetireQuestion(q.id)}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Retire Question (Soft Delete)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Settings & Publish */}
      {activeTab === 'config' && (
        <div className="glass-panel rounded-3xl p-8 border border-slate-200 dark:border-white/10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Assessment Configuration</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure exam schedule timing, test duration, and proctoring rules.</p>
            </div>
          </div>

          {/* PROMINENT EXAM TIMING & SCHEDULE WINDOW */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-brand-500/10 to-purple-500/10 border-2 border-brand-500/30 dark:border-brand-400/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
                    <span>Exam Timing &amp; Allowed Attempt Window</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-500/30">
                      Enforced Window
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Students are only allowed to attempt the exam during this scheduled window. <strong>If the current time exceeds the deadline, the exam will be locked and cannot be attempted.</strong>
                  </p>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const d = String(now.getDate()).padStart(2, '0');
                    setScheduledStart(`${y}-${m}-${d}T18:00`);
                    setScheduledEnd(`${y}-${m}-${d}T21:00`);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/15 hover:border-brand-500 text-slate-700 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
                >
                  Today 6 PM – 9 PM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const startStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    const end = new Date(now.getTime() + 3 * 3600 * 1000);
                    const endStr = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setScheduledStart(startStr);
                    setScheduledEnd(endStr);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/15 hover:border-brand-500 text-slate-700 dark:text-slate-200 transition-colors shadow-xs cursor-pointer"
                >
                  Next 3 Hours
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduledStart('');
                    setScheduledEnd('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/15 hover:border-rose-500 text-rose-600 dark:text-rose-400 transition-colors shadow-xs cursor-pointer"
                >
                  Clear (Anytime Access)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-xs">
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Available From (Exam Opens At)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-brand-500/20"
                />
                <span className="block mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Students cannot start or attempt the exam before this date and time.
                </span>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-xs">
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Available Until / Deadline (Exam Closes At)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledEnd}
                  onChange={(e) => setScheduledEnd(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-brand-500/20"
                />
                <span className="block mt-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                  ⚠️ Once this time exceeds, students will NOT be able to attempt the exam.
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-900/70 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/5">
              <CheckCircle2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
              <span>
                <strong>How it works:</strong> Students can only enter between Start Time and End Time. Once started, they have the <strong>Exam Time Limit ({timeLimitMinutes || 60} mins)</strong> below to finish.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Assessment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Max Question Count (Per Student Attempt)
              </label>
              <input
                type="number"
                min={1}
                value={maxQuestionCount}
                onChange={(e) => {
                  const val = e.target.value;
                  setMaxQuestionCount(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (maxQuestionCount === '' || (typeof maxQuestionCount === 'number' && maxQuestionCount < 1)) {
                    setMaxQuestionCount(6);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Overall Exam Time Limit (Minutes)
              </label>
              <input
                type="number"
                min={1}
                value={timeLimitMinutes}
                placeholder="e.g. 5, 30, 60"
                onChange={(e) => {
                  const val = e.target.value;
                  setTimeLimitMinutes(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (timeLimitMinutes === '' || (typeof timeLimitMinutes === 'number' && timeLimitMinutes < 1)) {
                    setTimeLimitMinutes(30);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
              <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Duration in minutes (e.g. 5 min = 300s, 30 min = 1800s).
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Per-Question Time Limit (Seconds, Optional)
              </label>
              <input
                type="number"
                min={10}
                value={perQuestionLimit ?? ''}
                placeholder="Leave blank for no per-question limit"
                onChange={(e) => {
                  const val = e.target.value;
                  setPerQuestionLimit(val === '' ? '' : (parseInt(val) || ''));
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Max Proctoring Violations Before Termination
              </label>
              <input
                type="number"
                min={1}
                value={maxViolations}
                onChange={(e) => {
                  const val = e.target.value;
                  setMaxViolations(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (maxViolations === '' || (typeof maxViolations === 'number' && maxViolations < 1)) {
                    setMaxViolations(3);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Fast Response Threshold (Seconds)
              </label>
              <input
                type="number"
                min={5}
                value={fastThreshold}
                onChange={(e) => {
                  const val = e.target.value;
                  setFastThreshold(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (fastThreshold === '' || (typeof fastThreshold === 'number' && fastThreshold < 1)) {
                    setFastThreshold(30);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Promotion Threshold (Consecutive Correct)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={promotionThreshold}
                onChange={(e) => {
                  const val = e.target.value;
                  setPromotionThreshold(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (promotionThreshold === '' || (typeof promotionThreshold === 'number' && promotionThreshold < 1)) {
                    setPromotionThreshold(1);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
              <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Number of correct answers required to advance to the next difficulty level.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">
                Demotion Threshold (Consecutive Wrong/Timeout)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={demotionThreshold}
                onChange={(e) => {
                  const val = e.target.value;
                  setDemotionThreshold(val === '' ? '' : (parseInt(val) || ''));
                }}
                onBlur={() => {
                  if (demotionThreshold === '' || (typeof demotionThreshold === 'number' && demotionThreshold < 1)) {
                    setDemotionThreshold(1);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
              />
              <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Number of incorrect answers or timeouts before dropping down a difficulty level.
              </span>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSpeedAdaptive}
                onChange={(e) => setEnableSpeedAdaptive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                <strong>Enable Speed Adaptive:</strong> Fast & correct promotes, slow or incorrect demotes. (Uncheck for Accessibility / Accuracy-only mode).
              </span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={banOnBreach}
                onChange={(e) => setBanOnBreach(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                <strong>Assessment Ban on Breach:</strong> Automatically bar student from joining again if violations exceed threshold.
              </span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deviceSwitchAsViolation}
                onChange={(e) => setDeviceSwitchAsViolation(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                <strong>Device Switch as Violation:</strong> Treat switching devices during reconnection as a strike.
              </span>
            </label>
          </div>



          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-slate-200 dark:border-white/10">
            <button
              onClick={() => handleSaveAssessment(false)}
              disabled={saving}
              className="py-2.5 px-5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-white/10"
            >
              {assessmentId ? 'Save Changes' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSaveAssessment(true, false)}
              disabled={saving}
              className="py-2.5 px-6 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center space-x-2"
            >
              <span>
                {assessmentId
                  ? (editingStatus === 'published' ? 'Save & Update Test' : 'Save & Publish')
                  : 'Publish Assessment'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sufficiency Warning Modal */}
      <Modal
        isOpen={!!sufficiencyWarning}
        onClose={() => setSufficiencyWarning(null)}
        title="Pool Sufficiency Check Failed"
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Insufficient Question Pool</h4>
          {sufficiencyWarning?.total_eligible === 0 ? (
            <>
              <p className="text-xs text-rose-600 dark:text-rose-400 mb-6 leading-relaxed">
                Your question pool is completely empty (<strong>0 questions</strong>). An assessment must have at least one question before it can be published.
              </p>
              <button
                onClick={() => {
                  setSufficiencyWarning(null);
                  setActiveTab('questions');
                }}
                className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md"
              >
                Go to Question Pool
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                Your assessment pool has only <strong>{sufficiencyWarning?.total_eligible}</strong> eligible questions, but requires <strong>{sufficiencyWarning?.required}</strong>.
                Publishing is blocked by default to ensure adaptive paths are well-stocked.
              </p>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setSufficiencyWarning(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-white/10"
                >
                  Add More Questions
                </button>
                <button
                  onClick={() => handleSaveAssessment(true, true)}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                >
                  Explicit Override & Publish
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Course Material Modal */}
      <Modal
        isOpen={!!materialToDelete}
        onClose={() => !deletingMaterial && setMaterialToDelete(null)}
        title="Delete Course Material"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3 text-rose-500 bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                Permanently delete document?
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300 truncate mt-0.5 font-medium" title={materialToDelete?.filename}>
                {materialToDelete?.filename}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            This will permanently remove the PDF file and any unassigned generated questions associated with it from your library.
          </p>
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              disabled={deletingMaterial}
              onClick={() => setMaterialToDelete(null)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingMaterial}
              onClick={confirmDeleteMaterial}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {deletingMaterial ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Permanently</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Clear Entire PDF Library Modal */}
      <Modal
        isOpen={showClearLibraryModal}
        onClose={() => !clearingLibrary && setShowClearLibraryModal(false)}
        title="Clear Entire PDF Library"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3 text-rose-500 bg-rose-500/10 p-3.5 rounded-xl border border-rose-500/20">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                Delete all {libraryMaterials.length} PDF documents?
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 font-medium">
                This cannot be undone.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            This will permanently remove all uploaded PDF files and unassigned questions from your library and storage.
          </p>
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              disabled={clearingLibrary}
              onClick={() => setShowClearLibraryModal(false)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={clearingLibrary}
              onClick={confirmClearAllLibrary}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {clearingLibrary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Clearing...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All ({libraryMaterials.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <Modal
          isOpen={!!editingQuestion}
          onClose={() => !savingQuestionEdit && setEditingQuestion(null)}
          title="Edit Question & Answer Key"
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1.5">
                Question Text
              </label>
              <textarea
                rows={3}
                value={editingQuestion.text}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1.5">
                Difficulty Level
              </label>
              <select
                value={editingQuestion.difficulty}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, difficulty: e.target.value as any })}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-xs"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1.5">
                Options (Click radio button to mark correct answer)
              </label>
              <div className="space-y-2.5">
                {editingQuestion.options.map((opt, idx) => {
                  const isCorrect = idx === editingQuestion.correct_option_index;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center space-x-2.5 p-2 rounded-xl border transition-all ${
                        isCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingQuestion({ ...editingQuestion, correct_option_index: idx })}
                        title="Mark as correct answer"
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'border border-slate-300 dark:border-slate-600 text-slate-500 hover:border-brand-500 hover:text-brand-500'
                        }`}
                      >
                        {['A', 'B', 'C', 'D'][idx] || idx + 1}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...editingQuestion.options];
                          newOpts[idx] = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options: newOpts });
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-transparent border-0 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder={`Option ${['A', 'B', 'C', 'D'][idx]}`}
                      />
                      {isCorrect && (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 mr-1 flex-shrink-0">
                          ✓ Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                disabled={savingQuestionEdit}
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingQuestionEdit || !editingQuestion.text.trim() || editingQuestion.options.some(o => !o.trim())}
                onClick={() => handleSaveEditedQuestion(editingQuestion)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white shadow-md flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                {savingQuestionEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Floating Toast Notification (Same as Delete Test notification in Manage Assessments) */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-3.5 rounded-2xl shadow-2xl border transition-all duration-300 animate-bounce ${
            toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-400/30'
              : 'bg-emerald-600 text-white border-emerald-400/30'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-white" />
          ) : (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-white" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 p-1 hover:bg-white/20 rounded-lg transition-colors text-white"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};


