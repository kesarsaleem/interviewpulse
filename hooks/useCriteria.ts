import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase/client';
import type { Criterion } from '../types';

export function useCriteria(jobId: string | undefined) {
  return useQuery<Criterion[]>({
    queryKey: ['criteria', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('criteria')
        .select('*')
        .eq('job_id', jobId)
        .order('position', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
