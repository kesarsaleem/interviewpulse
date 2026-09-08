import { getDb } from '../lib/sqlite/schema';
import { enqueueMutation } from '../lib/sync/syncEngine';
import { supabase } from '../lib/supabase/client';

type DecisionStatus = 'hired' | 'rejected';
type CandidateRecord = {
  id: string;
  job_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  current_role?: string | null;
  current_company?: string | null;
  resume_url?: string | null;
  referral_source: string;
  current_stage_id?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  created_by: string;
  created_at: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNetworkError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

export async function saveCandidateDecision(params: {
  candidate: CandidateRecord;
  status: DecisionStatus;
  actorId: string;
}): Promise<{ queued: boolean }> {
  const updatedAt = new Date().toISOString();
  const payload = {
    id: params.candidate.id,
    job_id: params.candidate.job_id,
    full_name: params.candidate.full_name,
    email: params.candidate.email ?? null,
    phone: params.candidate.phone ?? null,
    current_role: params.candidate.current_role ?? null,
    current_company: params.candidate.current_company ?? null,
    resume_url: params.candidate.resume_url ?? null,
    referral_source: params.candidate.referral_source,
    current_stage_id: params.candidate.current_stage_id ?? null,
    interview_date: params.candidate.interview_date ?? null,
    interview_time: params.candidate.interview_time ?? null,
    created_by: params.candidate.created_by,
    created_at: params.candidate.created_at,
    decision_status: params.status,
    updated_at: updatedAt,
  };

  let error: { message: string } | null = null;
  try {
    const result = await supabase
      .from('candidates')
      .update({ decision_status: params.status, updated_at: updatedAt })
      .eq('id', params.candidate.id)
      .select('id')
      .single();
    error = result.error;
  } catch (caught) {
    if (!isNetworkError(caught)) throw caught;
    error = { message: errorMessage(caught) };
  }

  if (error && !isNetworkError(error)) {
    throw new Error(`Could not save hiring decision: ${error.message}`);
  }

  const db = getDb();
  db.runSync(
    `UPDATE candidates
     SET decision_status = ?, updated_at = ?, sync_status = ?
     WHERE id = ?`,
    [params.status, updatedAt, error ? 'pending' : 'synced', params.candidate.id]
  );

  if (error) {
    enqueueMutation('candidate', String(params.candidate.id), 'update', payload);
    return { queued: true };
  }

  const { error: activityError } = await supabase.from('activity_logs').insert({
    candidate_id: params.candidate.id,
    user_id: params.actorId,
    action: params.status === 'hired' ? 'marked_hire' : 'marked_reject',
    metadata: {
      candidate_name: params.candidate.full_name,
    },
  });

  if (activityError) {
    throw new Error(`Decision saved, but activity log failed: ${activityError.message}`);
  }

  return { queued: false };
}
