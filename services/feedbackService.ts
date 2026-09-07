import uuid from 'react-native-uuid';

import { getDb } from '../lib/sqlite/schema';
import { enqueueMutation } from '../lib/sync/syncEngine';

import type { Feedback } from '../types';
import type { FeedbackFormValues } from '../schemas/feedbackSchema';


const ONE_HOUR_MS = 60 * 60 * 1000;


export function submitFeedback(params: {
  candidateId: string;
  stageId: string;
  interviewerId: string;
  values: FeedbackFormValues;
  customId?: string;
  isSynced?: boolean;
}): Feedback {
  const db = getDb();
  const now = new Date();
  const submittedAt = now.toISOString();
  const editableUntil = new Date(now.getTime() + ONE_HOUR_MS).toISOString();
  const id = params.customId || (uuid.v4() as string);

  const feedbackRow: Feedback = {
    id,
    candidate_id: params.candidateId,
    stage_id: params.stageId,
    interviewer_id: params.interviewerId,
    overall_verdict: params.values.overall_verdict,
    positives: params.values.positives,
    concerns: params.values.concerns,
    questions: params.values.questions,
    duration_minutes: params.values.duration_minutes,
    interview_mode: params.values.interview_mode ?? 'video',
    would_hire_solo: params.values.would_hire_solo,
    submitted_at: submittedAt,
    editable_until: editableUntil,
    created_at: submittedAt,
    updated_at: submittedAt,
    sync_status: params.isSynced ? 'synced' : 'pending',
    version: 1,
  };

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO feedback (
        id, candidate_id, stage_id, interviewer_id, overall_verdict,
        positives, concerns, questions, duration_minutes, interview_mode,
        would_hire_solo, submitted_at, editable_until, created_at, updated_at,
        sync_status, version
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        feedbackRow.id,
        feedbackRow.candidate_id,
        feedbackRow.stage_id,
        feedbackRow.interviewer_id,
        feedbackRow.overall_verdict,
        feedbackRow.positives,
        feedbackRow.concerns,
        feedbackRow.questions,
        feedbackRow.duration_minutes,
        feedbackRow.interview_mode,
        feedbackRow.would_hire_solo ? 1 : 0,
        feedbackRow.submitted_at,
        feedbackRow.editable_until,
        feedbackRow.created_at,
        feedbackRow.updated_at,
        feedbackRow.sync_status,
        feedbackRow.version,
      ]
    );

    if (!params.isSynced) {
      const { sync_status: _syncStatus, ...payload } = feedbackRow;
      enqueueMutation('feedback', id, 'create', payload);
    }

    if (params.values.scores && params.values.scores.length > 0) {
      params.values.scores.forEach((s) => {
        const scoreId = uuid.v4() as string;
        db.runSync(
          `INSERT INTO feedback_scores (id, feedback_id, criterion_id, score, note) VALUES (?,?,?,?,?)`,
          [scoreId, id, s.criterion_id, s.score, s.note ?? null]
        );

        if (!params.isSynced) {
          enqueueMutation('feedback_score', scoreId, 'create', {
            id: scoreId,
            feedback_id: id,
            criterion_id: s.criterion_id,
            score: s.score,
            note: s.note ?? null,
          });
        }
      });
    }

    const activityId = uuid.v4() as string;
    db.runSync(
      `INSERT INTO activity_logs (id, candidate_id, user_id, action, metadata, created_at) VALUES (?,?,?,?,?,?)`,
      [
        activityId,
        params.candidateId,
        params.interviewerId,
        'feedback_submitted',
        JSON.stringify({
          feedback_id: id,
          verdict: params.values.overall_verdict,
        }),
        submittedAt,
      ]
    );
  });

  return feedbackRow;
}

export function updateFeedback(params: {
  feedbackId: string;
  candidateId: string;
  stageId: string;
  interviewerId: string;
  values: FeedbackFormValues;
}): Feedback {
  const db = getDb();
  const existing = db.getFirstSync<Feedback>(
    `SELECT * FROM feedback WHERE id = ?`,
    [params.feedbackId]
  );
  if (!existing) {
    throw new Error('Feedback not found');
  }

  if (!isFeedbackEditable(existing)) {
    throw new Error('Feedback is locked and can no longer be edited (1-hour window expired)');
  }

  const now = new Date().toISOString();
  const updatedVersion = (existing.version || 1) + 1;

  const updatedFeedback: Feedback = {
    ...existing,
    overall_verdict: params.values.overall_verdict,
    positives: params.values.positives,
    concerns: params.values.concerns,
    questions: params.values.questions,
    duration_minutes: params.values.duration_minutes,
    interview_mode: params.values.interview_mode ?? 'video',
    would_hire_solo: params.values.would_hire_solo,
    updated_at: now,
    sync_status: 'pending',
    version: updatedVersion,
  };

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE feedback SET
        overall_verdict = ?,
        positives = ?,
        concerns = ?,
        questions = ?,
        duration_minutes = ?,
        interview_mode = ?,
        would_hire_solo = ?,
        updated_at = ?,
        sync_status = 'pending',
        version = ?
       WHERE id = ?`,
      [
        updatedFeedback.overall_verdict,
        updatedFeedback.positives,
        updatedFeedback.concerns,
        updatedFeedback.questions,
        updatedFeedback.duration_minutes,
        updatedFeedback.interview_mode,
        updatedFeedback.would_hire_solo ? 1 : 0,
        updatedFeedback.updated_at,
        updatedFeedback.version,
        params.feedbackId,
      ]
    );

    const { sync_status: _syncStatus, ...payload } = updatedFeedback;
    enqueueMutation('feedback', params.feedbackId, 'update', payload);

    if (params.values.scores && params.values.scores.length > 0) {
      db.runSync(`DELETE FROM feedback_scores WHERE feedback_id = ?`, [params.feedbackId]);

      params.values.scores.forEach((s) => {
        const scoreId = uuid.v4() as string;
        db.runSync(
          `INSERT INTO feedback_scores (id, feedback_id, criterion_id, score, note) VALUES (?,?,?,?,?)`,
          [scoreId, params.feedbackId, s.criterion_id, s.score, s.note ?? null]
        );

        enqueueMutation('feedback_score', scoreId, 'create', {
          id: scoreId,
          feedback_id: params.feedbackId,
          criterion_id: s.criterion_id,
          score: s.score,
          note: s.note ?? null,
        });
      });
    }
  });

  return updatedFeedback;
}

export function isFeedbackEditable(feedback: Pick<Feedback, 'editable_until'>): boolean {
  if (!feedback?.editable_until) return false;
  return new Date(feedback.editable_until).getTime() > Date.now();
}

export function canViewPanelFeedback(params: {
  candidateId: string;
  stageId: string;
  interviewerId: string;
}): boolean {
  const db = getDb();
  const row = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM feedback WHERE candidate_id = ? AND stage_id = ? AND interviewer_id = ?`,
    [params.candidateId, params.stageId, params.interviewerId]
  );
  return (row?.count ?? 0) > 0;
}

export function getLocalFeedbackDetails(feedbackId: string) {
  const db = getDb();
  const feedback = db.getFirstSync<any>(
    `SELECT * FROM feedback WHERE id = ?`,
    [feedbackId]
  );
  if (!feedback) return null;

  const candidate = db.getFirstSync<any>(
    `SELECT c.*, j.title as job_title, j.department as job_department, s.name as stage_name
     FROM candidates c
     LEFT JOIN jobs j ON j.id = c.job_id
     LEFT JOIN stages s ON s.id = c.current_stage_id
     WHERE c.id = ?`,
    [feedback.candidate_id]
  );

  const scores = db.getAllSync<any>(
    `SELECT fs.*, cr.name as criterion_name
     FROM feedback_scores fs
     LEFT JOIN criteria cr ON cr.id = fs.criterion_id
     WHERE fs.feedback_id = ?`,
    [feedbackId]
  );

  const criteria = candidate?.job_id
    ? db.getAllSync<any>(`SELECT * FROM criteria WHERE job_id = ? ORDER BY position ASC`, [candidate.job_id])
    : [];

  return {
    feedback: {
      ...feedback,
      would_hire_solo: Boolean(feedback.would_hire_solo),
      feedback_scores: scores,
    },
    candidate: candidate
      ? {
          ...candidate,
          jobs: { title: candidate.job_title, department: candidate.job_department },
          stages: { name: candidate.stage_name },
        }
      : null,
    criteria,
    scores,
  };
}

export function getLocalInterviewerFeedback(interviewerId: string) {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `SELECT f.*, c.full_name as candidate_name, c.current_role, c.current_company, c.job_id,
            j.title as job_title, s.name as stage_name
     FROM feedback f
     LEFT JOIN candidates c ON c.id = f.candidate_id
     LEFT JOIN jobs j ON j.id = c.job_id
     LEFT JOIN stages s ON s.id = f.stage_id
     WHERE f.interviewer_id = ?
     ORDER BY f.submitted_at DESC`,
    [interviewerId]
  );

  return rows.map((r) => {
    const scores = db.getAllSync<{ score: number }>(
      `SELECT score FROM feedback_scores WHERE feedback_id = ?`,
      [r.id]
    );
    const avg = scores.length
      ? Number((scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(1))
      : 0;
    return {
      ...r,
      would_hire_solo: Boolean(r.would_hire_solo),
      candidates: {
        full_name: r.candidate_name,
        current_role: r.current_role,
        current_company: r.current_company,
        job_id: r.job_id,
      },
      jobs: { title: r.job_title },
      stages: { name: r.stage_name },
      scores,
      average_score: avg,
    };
  });
}

export function getLocalInterviews() {
  const db = getDb();
  return db
    .getAllSync<any>(
      `SELECT c.*, j.title as job_title, j.department as job_department, s.name as stage_name
       FROM candidates c
       LEFT JOIN jobs j ON j.id = c.job_id
       LEFT JOIN stages s ON s.id = c.current_stage_id
       ORDER BY c.interview_date ASC`
    )
    .map((c) => ({
      ...c,
      jobs: { title: c.job_title, department: c.job_department },
      stages: { name: c.stage_name },
    }));
}