import uuid from 'react-native-uuid';
import { getDb } from '../sqlite/schema';
import { supabase } from '../supabase/client';
import type { SyncEntity, SyncOperationType, SyncOperation } from '../../types';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'failed' | 'offline';

type Listener = (state: SyncState) => void;
const listeners = new Set<Listener>();
let currentState: SyncState = 'idle';

function setState(state: SyncState) {
  currentState = state;
  listeners.forEach((l) => l(state));
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}

export function enqueueMutation(
  entity: SyncEntity,
  entityId: string,
  operation: SyncOperationType,
  payload: Record<string, unknown>
): void {
  const db = getDb();
  const op: SyncOperation = {
    id: uuid.v4() as string,
    entity,
    entity_id: entityId,
    operation,
    payload: JSON.stringify(payload),
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  };
  db.runSync(
    `INSERT INTO sync_queue (id, entity, entity_id, operation, payload, created_at, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [op.id, op.entity, op.entity_id, op.operation, op.payload, op.created_at, op.attempts, op.last_error]
  );
}

interface PendingRow {
  id: string;
  entity: SyncEntity;
  entity_id: string;
  operation: SyncOperationType;
  payload: string;
  attempts: number;
}

function getPendingOperations(): PendingRow[] {
  const db = getDb();
  // Parent feedback rows must land on the server before their scores.
  return db.getAllSync<PendingRow>(
    `SELECT * FROM sync_queue
     ORDER BY CASE entity
       WHEN 'feedback' THEN 0
       WHEN 'feedback_score' THEN 1
       ELSE 2
     END, created_at ASC`
  );
}

function localStatus(table: 'candidates' | 'feedback', id: string): string | null {
  const row = getDb().getFirstSync<{ sync_status: string }>(
    `SELECT sync_status FROM ${table} WHERE id = ?`,
    [id]
  );
  return row?.sync_status ?? null;
}

function hasUnsyncedLocal(table: 'candidates' | 'feedback', id: string): boolean {
  const status = localStatus(table, id);
  return status === 'pending' || status === 'conflict';
}

export async function pushPendingChanges(userId: string): Promise<void> {
  const pending = getPendingOperations();
  const db = getDb();

  for (const op of pending) {
    const payload = JSON.parse(op.payload);
    try {
      if (op.entity === 'candidate') {
        const { error } = await supabase.from('candidates').upsert(payload);
        if (error) throw error;
        db.runSync(`UPDATE candidates SET sync_status = 'synced' WHERE id = ?`, [op.entity_id]);
      }

      if (op.entity === 'feedback') {
        const { data: serverRow } = await supabase
          .from('feedback')
          .select('*')
          .eq('id', op.entity_id)
          .maybeSingle();

        if (serverRow && serverRow.version > payload.version) {
          await recordConflict(payload.candidate_id, op.entity_id, userId);
          applyServerFeedback(serverRow, 'conflict');
        } else {
          const { sync_status: _ignored, ...serverPayload } = payload;
          const { error } = await supabase.from('feedback').upsert(serverPayload);
          if (error) throw error;
          // Do not mark feedback as synced yet if there are associated scores to push
          const hasScores = db.getFirstSync<{ count: number }>(
            `SELECT count(*) as count FROM sync_queue WHERE entity = 'feedback_score' AND payload LIKE ?`,
            [`%"feedback_id":"${op.entity_id}"%`]
          );
          if (!hasScores || hasScores.count === 0) {
            db.runSync(`UPDATE feedback SET sync_status = 'synced' WHERE id = ?`, [op.entity_id]);
          }
        }
      }

      if (op.entity === 'feedback_score') {
        const { error } = op.operation === 'delete'
          ? await supabase.from('feedback_scores').delete().eq('id', op.entity_id)
          : await supabase.from('feedback_scores').upsert(payload);
        if (error) throw error;

        // Verify if any remaining score mutations for this feedback row exist in queue
        const remainingScores = db.getFirstSync<{ count: number }>(
          `SELECT count(*) as count FROM sync_queue WHERE entity = 'feedback_score' AND id != ? AND payload LIKE ?`,
          [op.id, `%"feedback_id":"${payload.feedback_id}"%`]
        );
        if (!remainingScores || remainingScores.count === 0) {
          db.runSync(`UPDATE feedback SET sync_status = 'synced' WHERE id = ?`, [payload.feedback_id]);
        }
      }

      db.runSync(`DELETE FROM sync_queue WHERE id = ?`, [op.id]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      db.runSync(`UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`, [
        message,
        op.id,
      ]);
      if (op.entity === 'feedback') {
        db.runSync(`UPDATE feedback SET sync_status = 'failed' WHERE id = ?`, [op.entity_id]);
      } else if (op.entity === 'candidate') {
        db.runSync(`UPDATE candidates SET sync_status = 'failed' WHERE id = ?`, [op.entity_id]);
      }
    }
  }
}

function applyServerFeedback(f: any, status: 'synced' | 'conflict'): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO feedback
     (id, candidate_id, stage_id, interviewer_id, overall_verdict, positives, concerns,
      questions, duration_minutes, interview_mode, would_hire_solo, submitted_at,
      editable_until, created_at, updated_at, sync_status, version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      f.id, f.candidate_id, f.stage_id, f.interviewer_id, f.overall_verdict, f.positives,
      f.concerns, f.questions, f.duration_minutes, f.interview_mode, f.would_hire_solo ? 1 : 0,
      f.submitted_at, f.editable_until, f.created_at, f.updated_at, status, f.version,
    ]
  );
}

async function recordConflict(candidateId: string, feedbackId: string, userId: string) {
  await supabase.from('activity_logs').insert({
    candidate_id: candidateId,
    user_id: userId,
    action: 'conflict_detected',
    metadata: { feedback_id: feedbackId, resolution: 'last_write_wins_server' },
  });
}

export async function pullServerState(jobId?: string): Promise<void> {
  const db = getDb();

  const jobsQuery = jobId
    ? supabase.from('jobs').select('*').eq('id', jobId)
    : supabase.from('jobs').select('*');
  const { data: jobs } = await jobsQuery;
  jobs?.forEach((j) => {
    db.runSync(
      `INSERT OR REPLACE INTO jobs
       (id, title, department, description, jd_url, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [j.id, j.title, j.department, j.description, j.jd_url, j.status, j.created_by, j.created_at, j.updated_at]
    );
  });

  const jobIds = (jobs ?? []).map((j) => j.id);
  if (jobIds.length === 0) return;

  const { data: stages } = await supabase.from('stages').select('*').in('job_id', jobIds);
  stages?.forEach((s) => {
    db.runSync(`INSERT OR REPLACE INTO stages (id, job_id, name, position) VALUES (?,?,?,?)`, [
      s.id, s.job_id, s.name, s.position,
    ]);
  });

  const { data: criteria } = await supabase.from('criteria').select('*').in('job_id', jobIds);
  criteria?.forEach((c) => {
    db.runSync(`INSERT OR REPLACE INTO criteria (id, job_id, name, position) VALUES (?,?,?,?)`, [
      c.id, c.job_id, c.name, c.position,
    ]);
  });

  const { data: candidates } = await supabase.from('candidates').select('*').in('job_id', jobIds);
  candidates?.forEach((c) => {
    if (hasUnsyncedLocal('candidates', c.id)) return;
    db.runSync(
      `INSERT OR REPLACE INTO candidates
       (id, job_id, full_name, email, phone, current_role, current_company, resume_url,
        referral_source, current_stage_id, interview_date, interview_time, created_by,
        created_at, updated_at, sync_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'synced')`,
      [
        c.id, c.job_id, c.full_name, c.email, c.phone, c.current_role, c.current_company,
        c.resume_url, c.referral_source, c.current_stage_id, c.interview_date, c.interview_time,
        c.created_by, c.created_at, c.updated_at,
      ]
    );
  });

  const candidateIds = (candidates ?? []).map((c) => c.id);
  if (candidateIds.length === 0) return;

  const { data: feedbackRows } = await supabase.from('feedback').select('*').in('candidate_id', candidateIds);
  const feedbackIds: string[] = [];
  feedbackRows?.forEach((f) => {
    if (hasUnsyncedLocal('feedback', f.id)) return;
    applyServerFeedback(f, 'synced');
    feedbackIds.push(f.id);
  });

  if (feedbackIds.length === 0) return;
  const { data: scores } = await supabase.from('feedback_scores').select('*').in('feedback_id', feedbackIds);
  scores?.forEach((s) => {
    db.runSync(
      `INSERT OR REPLACE INTO feedback_scores (id, feedback_id, criterion_id, score, note) VALUES (?,?,?,?,?)`,
      [s.id, s.feedback_id, s.criterion_id, s.score, s.note]
    );
  });
}

/** Push the outbox, then pull jobs the caller can see (RLS-scoped). */
export async function runSync(userId: string, jobId?: string): Promise<void> {
  setState('syncing');
  try {
    await pushPendingChanges(userId);
    await pullServerState(jobId);
    setState('synced');
  } catch (err) {
    setState('failed');
    throw err;
  }
}

export function getPendingCount(): number {
  const db = getDb();
  const row = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sync_queue`);
  return row?.count ?? 0;
}

export function getSyncStats(): { pending: number; failed: number; synced: number } {
  const db = getDb();
  const pendingRow = db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sync_queue`);
  const failedRow = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM feedback WHERE sync_status = 'failed'`
  );
  const syncedRow = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM feedback WHERE sync_status = 'synced'`
  );
  return {
    pending: pendingRow?.count ?? 0,
    failed: failedRow?.count ?? 0,
    synced: syncedRow?.count ?? 0,
  };
}

export async function retryFailedSync(userId: string, jobId?: string): Promise<void> {
  const db = getDb();
  db.runSync(`UPDATE sync_queue SET attempts = 0, last_error = NULL`);
  db.runSync(`UPDATE feedback SET sync_status = 'pending' WHERE sync_status = 'failed'`);
  db.runSync(`UPDATE candidates SET sync_status = 'pending' WHERE sync_status = 'failed'`);
  return runSync(userId, jobId);
}
