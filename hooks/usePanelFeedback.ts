import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase/client';
import type { FeedbackWithScores } from '../types';

/**
 * Deliberately does NOT filter by "has the caller submitted yet" — that
 * check is enforced by the `feedback_select_blind_view` RLS policy on the
 * server. If the caller hasn't submitted, this query returns only their
 * own row (or nothing), never another interviewer's feedback.
 */
export function usePanelFeedback(
  candidateId: string | undefined,
  stageId: string | undefined,
  opts?: { enabled?: boolean }
) {
  return useQuery<FeedbackWithScores[]>({
    queryKey: ['panel-feedback', candidateId, stageId],
    enabled: !!candidateId && !!stageId && (opts?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('*, feedback_scores(*), profiles(name)')
        .eq('candidate_id', candidateId)
        .eq('stage_id', stageId);
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        ...f,
        scores: f.feedback_scores,
        interviewer_name: f.profiles?.name ?? 'Interviewer',
      }));
    },
  });
}
