import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase/client';
import type { Candidate } from '../types';

const STAGE_SELECT = '*, stages!current_stage_id(name)';

export function useCandidate(candidateId: string | undefined) {
  return useQuery({
    queryKey: ['candidate', candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select(STAGE_SELECT)
        .eq('id', candidateId)
        .single();
      if (error) throw error;
      const row = data as Candidate & { stages?: { name: string } | null };
      return { ...row, stage_name: row.stages?.name ?? null };
    },
  });
}

export function useCandidates(jobId: string | undefined) {
  return useQuery({
    queryKey: ['candidates', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select(STAGE_SELECT)
        .eq('job_id', jobId)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: Candidate & { stages?: { name: string } | null }) => ({
        ...row,
        stage_name: row.stages?.name ?? null,
      }));
    },
  });
}
