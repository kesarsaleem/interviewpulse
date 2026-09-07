import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase/client';
import type { Job } from '../types';

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, candidates(count)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((j: Job & { candidates?: { count: number }[] }) => ({
        ...j,
        candidate_count: j.candidates?.[0]?.count ?? 0,
      }));
    },
    staleTime: 30_000,
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (error) throw error;
      return data as Job;
    },
  });
}
