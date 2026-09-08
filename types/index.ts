// =========================================================
// Core domain types — mirror lib/supabase/schema.sql exactly.
// =========================================================

export type UserRole = 'interviewer' | 'admin';
export type JobStatus = 'open' | 'closed' | 'archived';
export type ReferralSource = 'linkedin' | 'referral' | 'website' | 'other';
export type OverallVerdict = 'strong_yes' | 'maybe' | 'no';
export type InterviewMode = 'onsite' | 'video' | 'phone';
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'failed';
export type PanelStatus = 'invited' | 'active' | 'removed';
export type ThemeMode = 'light' | 'dark';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  theme_mode?: ThemeMode;
  default_interview_mode?: InterviewMode;
  default_duration?: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  title: string;
  department: string | null;
  description: string | null;
  jd_url: string | null;
  created_by: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  job_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Criterion {
  id: string;
  job_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface JobInterviewer {
  id: string;
  job_id: string;
  user_id: string | null;
  invited_email: string;
  status: PanelStatus;
  created_at: string;
}

export interface Candidate {
  id: string;
  job_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  current_role: string | null;
  current_company: string | null;
  resume_url: string | null;
  referral_source: ReferralSource;
  current_stage_id: string | null;
  decision_status?: 'pending' | 'hired' | 'rejected' | null;
  interview_date: string | null;
  interview_time: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // client-only, populated locally for offline queueing
  sync_status?: SyncStatus;
}

export interface Feedback {
  id: string;
  candidate_id: string;
  stage_id: string;
  interviewer_id: string;
  overall_verdict: OverallVerdict;
  positives: string;
  concerns: string;
  questions: string;
  duration_minutes: number;
  interview_mode: InterviewMode;
  would_hire_solo: boolean;
  submitted_at: string;
  editable_until: string;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
  version: number;
}

export interface FeedbackScore {
  id: string;
  feedback_id: string;
  criterion_id: string;
  score: number; // 0-5
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  candidate_id: string;
  user_id: string;
  action: ActivityAction;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ActivityAction =
  | 'candidate_added'
  | 'stage_moved'
  | 'feedback_submitted'
  | 'marked_hire'
  | 'marked_reject'
  | 'conflict_detected';

// =========================================================
// Local sync queue (SQLite side, not persisted server-side)
// =========================================================
export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncEntity = 'candidate' | 'feedback' | 'feedback_score';

export interface SyncOperation {
  id: string; // local uuid
  entity: SyncEntity;
  entity_id: string;
  operation: SyncOperationType;
  payload: string; // JSON-serialized
  created_at: string;
  attempts: number;
  last_error: string | null;
}

// =========================================================
// Composite / derived view models used by screens
// =========================================================
export interface CandidateWithStage extends Candidate {
  stage_name: string | null;
  feedback_count: number;
}

export interface FeedbackWithScores extends Feedback {
  scores: FeedbackScore[];
  interviewer_name: string;
}

export interface CandidateAverage {
  candidate_id: string;
  average_score: number;
  interview_count: number;
}
