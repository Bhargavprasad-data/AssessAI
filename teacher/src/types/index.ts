export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  is_banned: boolean;
  banned_at?: string;
  ban_reason?: string;
}

export interface Question {
  id: string;
  material_id: string;
  text: string;
  options: string[];
  correct_option_index: number;
  difficulty: 'easy' | 'medium' | 'hard';
  source_chunk_ref: string;
  is_duplicate_flag: boolean;
  retired_at?: string;
}

export interface Assessment {
  id: string;
  teacher_id: string;
  title: string;
  time_limit_seconds: number;
  per_question_time_limit_seconds?: number;
  fast_response_threshold_seconds: number;
  enable_speed_adaptive: boolean;
  max_question_count: number;
  promotion_threshold: number;
  demotion_threshold: number;
  max_violations: number;
  scoring_weights: Record<string, number>;
  promotion_rules: Record<string, any>;
  ban_on_violation_breach: boolean;
  device_switch_as_violation: boolean;
  status: 'draft' | 'published' | 'closed';
  created_at: string;
  config_locked: boolean;
  question_count?: number;
}

export interface CurrentQuestion {
  attempt_id: string;
  question_id: string;
  text: string;
  options: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  question_number: number;
  max_questions: number;
  time_remaining_seconds: number;
  per_question_time_remaining_seconds?: number;
}

export interface AttemptAnswerReview {
  question_id: string;
  question_text: string;
  options: string[];
  selected_option_index?: number;
  correct_option_index: number;
  is_correct: boolean;
  difficulty: string;
  response_time_ms: number;
}

export interface AttemptResults {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  status: 'in_progress' | 'submitted' | 'terminated' | 'disconnected';
  completion_reason?: string;
  started_at: string;
  submitted_at?: string;
  final_score: number;
  highest_difficulty_reached: string;
  total_answers: number;
  correct_answers: number;
  answers_breakdown?: AttemptAnswerReview[];
}

export interface LeaderboardEntry {
  rank: number;
  attempt_id: string;
  display_name: string;
  final_score: number;
  highest_difficulty: string;
  status: string;
  completion_reason?: string;
  submitted_at?: string;
}

export interface ViolationEvent {
  attempt_id: string;
  student_id: string;
  student_name: string;
  type: string;
  occurred_at: string;
  violation_count: number;
  max_violations: number;
  is_terminated: boolean;
  metadata?: any;
}

export interface ScoreDistributionBucket {
  range_label: string;
  count: number;
}

export interface AssessmentAnalytics {
  assessment_id: string;
  assessment_title: string;
  total_attempts: number;
  completed_attempts: number;
  terminated_attempts: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  average_difficulty_reached: string;
  accuracy_by_difficulty: Record<string, number>;
  score_distribution: ScoreDistributionBucket[];
  total_violations_recorded: number;
}

export interface AttemptReviewItem {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: 'in_progress' | 'submitted' | 'terminated' | 'disconnected';
  completion_reason?: string;
  started_at: string;
  submitted_at?: string;
  final_score: number;
  highest_difficulty: string;
  violation_count: number;
  has_active_ban: boolean;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id?: string;
  action: string;
  target_type: string;
  target_id: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

